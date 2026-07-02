-- Leads — single-log RPCs (edit + convert-to-contact + convert-to-client)
-- 2026-07-23 | Module: Leads
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Today one user action in the Leads module (edit a lead, convert a lead to a
-- contact, convert a lead to a client) is issued from the frontend as SEVERAL
-- independent Supabase calls (see src/components/leads/AnewLeadEditDialog.tsx
-- handleSave, and src/pages/AnewLeads.tsx doConvertToContact / doConvertToClient),
-- each its own Postgres transaction. Every touched table
-- (anew_leads, anew_entities, anew_contacts, anew_clients, anew_entity_roles)
-- carries the AFTER audit trigger fn_generic_entity_audit(), so a single
-- "convert lead" that rewrites 3 role rows + a facet + the lead status + the
-- entity name produces N audit rows when the business intent is exactly 1.
-- The survey counted 14 separate calls across the 3 actions.
--
-- CRITICAL data-model note (identity is shared, entity_id never changes):
--   Converting lead -> contact or lead -> client does NOT create a new entity.
--   anew_entities is the shared identity; the same entity_id flows from start to
--   finish. 'lead' / 'contact' / 'client' are ROLES (anew_entity_roles) over the
--   SAME anew_entities row. Converting means: the 'lead' role goes inactive, the
--   'contact'/'client' role goes active (created if missing), the anew_contacts /
--   anew_clients facet is created/reused, and anew_leads.status becomes 'converted'.
--   All of this MUST produce ONE entity_audit_log row whose entity_id is that same
--   shared entity_id — never two different entity_ids.
--
-- Solution
-- --------
-- This migration REUSES the foundation created in
-- 20260719010000_roles_audit_bypass_and_rpcs.sql:
--   · the app.audit_bypass GUC guard already present at the top of
--     fn_generic_entity_audit()  (grep for "app.audit_bypass" confirms it exists)
--   · fn_manual_audit_log(text, uuid, uuid, text, jsonb, text)
-- The foundation is NOT recreated here.
--
-- Three RPCs reproduce, field-for-field / condition-for-condition, what the
-- frontend does today, all inside a single transaction with
-- app.audit_bypass = 'on', accumulate a combined diff across every touched table
-- ({table: {field: {old, new}}}), and call fn_manual_audit_log ONCE keyed on the
-- shared entity_id:
--   · rpc_update_lead            — AnewLeadEditDialog.tsx handleSave
--   · rpc_convert_lead_to_contact — AnewLeads.tsx doConvertToContact
--   · rpc_convert_lead_to_client  — AnewLeads.tsx doConvertToClient
--
-- Division of responsibility (kept identical to the current app)
-- --------------------------------------------------------------
-- The frontend still owns everything that is NOT a plain multi-table write:
--   · Zod / input validation.
--   · Field resolution — campaign-based mapping vs auto-mapping
--     (extractFieldsWithAutoMapping, lead_field_definitions lookups) produces the
--     contactData / clientData maps, which are passed in as p_contact_data /
--     p_client_data jsonb exactly as the FE computed them.
--   · ensureEntityOrgLink (entity<->org link) — must still run BEFORE the RPC so
--     RLS-visible rows exist; the RPC does not duplicate it.
--   · resolveRootOrgId / root_organization_id resolution — passed in as
--     p_root_organization_id (the FE already queries anew_hierarchy for this).
--   · syncEntityPrimaryAddressFromLead and the execute-workflow Edge Function
--     invocation — these remain post-RPC side calls in the FE, unchanged.
-- The RPC owns ONLY the consolidated DML across the CRM tables + the single audit
-- row, so the audit is emitted exactly once for that DML with the shared entity_id.
--
-- IMPORTANT scope caveat (not an absolute "1 row per user action" guarantee):
--   syncEntityPrimaryAddressFromLead stays in the FE by design and runs inside its
--   OWN withAuditContext, i.e. WITHOUT app.audit_bypass. When it actually writes an
--   address (anew_entity_addresses etc.) the NORMAL (non-bypassed) audit trigger
--   fires and may emit ONE OR MORE additional audit rows on top of the single row
--   these RPCs emit. So the guarantee here is precise: the DML performed INSIDE each
--   RPC yields exactly ONE consolidated audit row; any address sync performed outside
--   the RPC is outside this migration's control and can add rows. To make the whole
--   convert action strictly single-log, the address sync would have to be folded into
--   the RPC (explicitly out of scope for this migration).
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS does NOT self-enforce inside them. Each
-- RPC therefore re-checks, explicitly, the SAME predicate the anew_leads RLS
-- policies enforce today (baseline 20260615130000, anew_leads_update ~line 23295):
--   The caller must have an ACTIVE membership whose role code is 'system_admin'
--   OR whose organization_id equals the lead's organization_id OR the lead's
--   root_organization_id. fn_lead_org_in_scope(org, root_org) below evaluates the
--   full OR — BOTH org ids — so a user who is a member ONLY of the root org of a
--   hierarchy (who can edit/convert the lead today via direct RLS, and whom the FE
--   listing queries already treat as in-scope via
--   `.or(organization_id.eq..,root_organization_id.eq..)`) is NOT falsely rejected.
-- The facet/role/entity writes all target the same lead organization_id, and the
-- membership-based RLS on anew_contacts / anew_clients / anew_entity_roles /
-- anew_entities resolves org visibility through the shared hierarchy the same way,
-- so passing both lead org ids to the single scope check is the correct boundary.
--
-- Behavior divergence (documented, intentional — converted_by / created_by author)
-- --------------------------------------------------------------------------------
-- The FE resolves the author as `convertedByUserId = scopeAnewUserId || authUserId`
-- (AnewLeads.tsx ~line 2315): the business-user id when the auth uid IS mapped, but
-- a FALLBACK to the RAW auth uid when no business user exists. These RPCs instead
-- use current_business_user_id() and RAISE 'Perfil de utilizador não encontrado'
-- when it is NULL. This is a DELIBERATE, documented divergence for the rare
-- unmapped-user edge case: the RPC is STRICTER (fails closed), never more
-- permissive, so it is not a security regression. The tradeoff is that a caller
-- with an auth session but no auth_to_business_user_map row — who today would
-- succeed and store the raw auth uid as converted_by/created_by — is blocked by the
-- RPC. Storing the raw auth uid in converted_by/created_by (both FK to anew_users)
-- would in practice violate the FK anyway, so the FE "success" in that edge case is
-- itself fragile; the RPC surfaces the missing mapping loudly and consistently with
-- every other audit-bypass RPC in this codebase (roles/users/organizations modules
-- all RAISE on a NULL current_business_user_id()). This is called out explicitly per
-- the "any behavior divergence is a reportable bug" instruction; the decision is to
-- keep the stricter, self-consistent RPC behavior rather than reproduce the FE's
-- FK-fragile raw-uid fallback.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql            — entity_audit_log, fn_generic_entity_audit()
--   20260719010000_roles_audit_bypass_and_rpcs.sql — app.audit_bypass guard + fn_manual_audit_log()
--   20260615130000_baseline_new_database.sql       — current_business_user_id(), anew_* tables + RLS


-- ============================================================
-- 0. Shared authorization helper — anew_leads RLS parity
-- ============================================================
-- Returns TRUE when the current auth.uid() has an ACTIVE membership that either
-- carries the system_admin role OR is bound to the lead's organization_id OR the
-- lead's root_organization_id. This replicates the EXACT membership predicate of
-- anew_leads_update / _insert / _select (baseline 20260615130000, ~line 23295):
--     ar.code = 'system_admin'
--       OR am.organization_id = anew_leads.organization_id
--       OR am.organization_id = anew_leads.root_organization_id
-- Both org ids are passed in so a user who is a member ONLY of the root
-- organization of a hierarchy (which today can edit/convert the lead through the
-- direct RLS) is NOT falsely rejected. p_root_org_id may be NULL (leads without a
-- root org set); a NULL never matches any membership org, so the OR simply falls
-- back to the organization_id / system_admin checks.
-- SECURITY DEFINER so it can read anew_memberships/anew_roles regardless of the
-- caller's own RLS, but it only ever answers a boolean about the CURRENT user.

CREATE OR REPLACE FUNCTION public.fn_lead_org_in_scope(p_org_id uuid, p_root_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am ON am.user_id = au.id
    JOIN public.anew_roles ar       ON ar.id = am.role_id
    WHERE au.auth_user_id = (SELECT auth.uid())
      AND am.status = 'active'
      AND (
        ar.code = 'system_admin'
        OR am.organization_id = p_org_id
        OR (p_root_org_id IS NOT NULL AND am.organization_id = p_root_org_id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.fn_lead_org_in_scope(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lead_org_in_scope(uuid, uuid) TO authenticated, service_role;


-- ============================================================
-- 1. rpc_update_lead(...)
-- ============================================================
-- Mirrors handleSave in src/components/leads/AnewLeadEditDialog.tsx:
--   · UPDATE anew_leads SET field_values, status, source(|null), notes(|null),
--     assigned_to, updated_at, and workflow_stage_id ONLY when it changed and a
--     stage was resolved (the FE resolves the stage id and passes it in).
--   · WHEN entity_id present AND a new display_name can be derived: UPDATE
--     anew_entities SET display_name (+ first_name/last_name when present).
-- The FE computes updated field_values (incl. _meta preservation), the resolved
-- workflow_stage_id and the derived display_name/first/last; they are passed in so
-- the RPC performs the identical writes. Returns the updated anew_leads row.

CREATE OR REPLACE FUNCTION public.rpc_update_lead(
  p_lead_id            uuid,
  p_field_values       jsonb,
  p_status             text,
  p_source             text,
  p_notes              text,
  p_assigned_to        uuid,
  p_status_changed     boolean,
  p_workflow_stage_id  uuid,
  p_display_name       text,
  p_first_name         text,
  p_last_name          text
)
RETURNS public.anew_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_before_lead  public.anew_leads;
  v_lead         public.anew_leads;
  v_before_ent   public.anew_entities;
  v_ent          public.anew_entities;
  v_entity_id    uuid;
  v_audit_org    uuid;
  v_lead_diff    jsonb;
  v_ent_diff     jsonb;
  v_diff         jsonb;
  v_ent_update   jsonb;
BEGIN
  -- Consolidate all writes below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the lead (before-image + guards) ────────────────────────────────
  SELECT * INTO v_before_lead FROM public.anew_leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with anew_leads_update RLS ──────────────────────
  -- Accept BOTH the lead's organization_id and its root_organization_id, exactly
  -- like the anew_leads RLS policy, so a root-org member is not falsely rejected.
  IF NOT public.fn_lead_org_in_scope(v_before_lead.organization_id, v_before_lead.root_organization_id) THEN
    RAISE EXCEPTION 'Lead fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── UPDATE anew_leads (identical columns to handleSave's updatePayload) ───
  -- workflow_stage_id is only written when the status changed AND the FE
  -- resolved a stage id (mirrors "if (statusChanged && workflowStageId)").
  IF p_status_changed AND p_workflow_stage_id IS NOT NULL THEN
    UPDATE public.anew_leads
    SET field_values     = p_field_values,
        status           = p_status,
        source           = nullif(p_source, ''),
        notes            = nullif(p_notes, ''),
        assigned_to      = p_assigned_to,
        workflow_stage_id = p_workflow_stage_id,
        updated_at       = now()
    WHERE id = p_lead_id
    RETURNING * INTO v_lead;
  ELSE
    UPDATE public.anew_leads
    SET field_values = p_field_values,
        status       = p_status,
        source       = nullif(p_source, ''),
        notes        = nullif(p_notes, ''),
        assigned_to  = p_assigned_to,
        updated_at   = now()
    WHERE id = p_lead_id
    RETURNING * INTO v_lead;
  END IF;

  v_entity_id := v_lead.entity_id;

  -- ── Sync anew_entities display_name (matches handleSave's entity update) ──
  -- Only when the lead has an entity AND the FE derived a non-empty display_name.
  v_ent_diff := '{}'::jsonb;
  IF v_entity_id IS NOT NULL AND nullif(btrim(p_display_name), '') IS NOT NULL THEN
    SELECT * INTO v_before_ent FROM public.anew_entities WHERE id = v_entity_id;

    v_ent_update := jsonb_build_object('display_name', btrim(p_display_name));
    IF nullif(p_first_name, '') IS NOT NULL THEN
      v_ent_update := v_ent_update || jsonb_build_object('first_name', p_first_name);
    END IF;
    IF nullif(p_last_name, '') IS NOT NULL THEN
      v_ent_update := v_ent_update || jsonb_build_object('last_name', p_last_name);
    END IF;

    UPDATE public.anew_entities
    SET display_name = btrim(p_display_name),
        first_name   = CASE WHEN nullif(p_first_name, '') IS NOT NULL THEN p_first_name ELSE first_name END,
        last_name    = CASE WHEN nullif(p_last_name, '')  IS NOT NULL THEN p_last_name  ELSE last_name  END
    WHERE id = v_entity_id
    RETURNING * INTO v_ent;

    IF FOUND THEN
      IF v_before_ent.display_name IS DISTINCT FROM v_ent.display_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('display_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.display_name), 'new', to_jsonb(v_ent.display_name)));
      END IF;
      IF v_before_ent.first_name IS DISTINCT FROM v_ent.first_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('first_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.first_name), 'new', to_jsonb(v_ent.first_name)));
      END IF;
      IF v_before_ent.last_name IS DISTINCT FROM v_ent.last_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('last_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.last_name), 'new', to_jsonb(v_ent.last_name)));
      END IF;
    END IF;
  END IF;

  -- ── Build the anew_leads diff (skip noise cols, like the trigger) ─────────
  v_lead_diff := '{}'::jsonb;
  IF v_before_lead.field_values IS DISTINCT FROM v_lead.field_values THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('field_values',
      jsonb_build_object('old', v_before_lead.field_values, 'new', v_lead.field_values));
  END IF;
  IF v_before_lead.status IS DISTINCT FROM v_lead.status THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before_lead.status), 'new', to_jsonb(v_lead.status)));
  END IF;
  IF v_before_lead.source IS DISTINCT FROM v_lead.source THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('source',
      jsonb_build_object('old', to_jsonb(v_before_lead.source), 'new', to_jsonb(v_lead.source)));
  END IF;
  IF v_before_lead.notes IS DISTINCT FROM v_lead.notes THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('notes',
      jsonb_build_object('old', to_jsonb(v_before_lead.notes), 'new', to_jsonb(v_lead.notes)));
  END IF;
  IF v_before_lead.assigned_to IS DISTINCT FROM v_lead.assigned_to THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('assigned_to',
      jsonb_build_object('old', to_jsonb(v_before_lead.assigned_to), 'new', to_jsonb(v_lead.assigned_to)));
  END IF;
  IF v_before_lead.workflow_stage_id IS DISTINCT FROM v_lead.workflow_stage_id THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('workflow_stage_id',
      jsonb_build_object('old', to_jsonb(v_before_lead.workflow_stage_id), 'new', to_jsonb(v_lead.workflow_stage_id)));
  END IF;

  -- ── Combine + emit ONE audit row keyed on the shared entity_id ────────────
  v_diff := '{}'::jsonb;
  IF v_lead_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_leads', v_lead_diff);
  END IF;
  IF v_ent_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_entities', v_ent_diff);
  END IF;

  v_audit_org := v_lead.organization_id;

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'anew_leads',
      COALESCE(v_entity_id, p_lead_id),
      v_audit_org,
      'UPDATE',
      v_diff,
      'web_app'
    );
  END IF;

  RETURN v_lead;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_lead(uuid, jsonb, text, text, text, uuid, boolean, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_lead(uuid, jsonb, text, text, text, uuid, boolean, uuid, text, text, text) TO authenticated;


-- ============================================================
-- 2. rpc_convert_lead_to_contact(...)
-- ============================================================
-- Mirrors doConvertToContact in src/pages/AnewLeads.tsx. The FE resolves
-- contactData (campaign mapping / auto mapping) and root_organization_id up
-- front and passes them in; ensureEntityOrgLink + syncEntityPrimaryAddressFromLead
-- stay in the FE. Column-for-column, the RPC does:
--   1. Reuse an existing anew_contacts row for (entity_id, organization_id) if any:
--        reactivate (status='active' when not already) and clear stale client
--        conversion metadata (converted_to_client_id / converted_at) when set.
--      Otherwise INSERT a fresh anew_contacts row with the same column set the FE
--      uses (position/notes from contactData, source_type='lead', source_lead_id,
--      created_by, assigned_to, status='active', root_organization_id).
--   2. Entity role transition (only when entity_id present):
--        · contact role → active (INSERT if missing, else UPDATE status='active')
--        · lead role    → inactive (this org only)
--        · client role  → inactive (this org only)
--   3. UPDATE anew_leads: status='converted', converted_to_contact_id=<contact>,
--        converted_at=now(), converted_by, and campaign_id ONLY when the FE passed
--        a newly-selected campaign for a lead that had none.
--   4. UPDATE anew_entities first_name/last_name when contactData provided them.
-- Returns the resulting anew_contacts row. entity_id NEVER changes.

CREATE OR REPLACE FUNCTION public.rpc_convert_lead_to_contact(
  p_lead_id               uuid,
  p_contact_data          jsonb,
  p_root_organization_id  uuid,
  p_campaign_id           uuid
)
RETURNS public.anew_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor         uuid;
  v_lead          public.anew_leads;
  v_before_lead   public.anew_leads;
  v_entity_id     uuid;
  v_org_id        uuid;
  v_contact       public.anew_contacts;
  v_before_contact public.anew_contacts;
  v_existing_role uuid;
  v_existing_role_status text;
  v_first_name    text;
  v_last_name     text;
  v_audit_org     uuid;
  v_rows          integer;
  v_diff          jsonb := '{}'::jsonb;
  v_contact_diff  jsonb := '{}'::jsonb;
  v_lead_diff     jsonb := '{}'::jsonb;
  v_ent_diff      jsonb := '{}'::jsonb;
  v_roles_diff    jsonb := '{}'::jsonb;
  v_before_ent    public.anew_entities;
  v_ent           public.anew_entities;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before_lead FROM public.anew_leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_org_id    := v_before_lead.organization_id;
  v_entity_id := v_before_lead.entity_id;

  -- Authorization parity with anew_leads RLS: lead's own org OR root org.
  IF NOT public.fn_lead_org_in_scope(v_org_id, v_before_lead.root_organization_id) THEN
    RAISE EXCEPTION 'Lead fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_first_name := nullif(p_contact_data ->> 'first_name', '');
  v_last_name  := nullif(p_contact_data ->> 'last_name', '');

  -- ── 1. Reuse-or-create the contact facet ─────────────────────────────────
  -- The FE uses .maybeSingle() here, which throws when more than one row
  -- matches. Replicate that loud failure instead of silently picking one row
  -- with LIMIT 1, so inconsistent data surfaces the same way it does today.
  IF v_entity_id IS NOT NULL THEN
    DECLARE
      v_contact_count integer;
    BEGIN
      SELECT count(*) INTO v_contact_count
      FROM public.anew_contacts
      WHERE entity_id = v_entity_id
        AND organization_id = v_org_id;

      IF v_contact_count > 1 THEN
        RAISE EXCEPTION 'Múltiplos contactos para a mesma entidade/organização (%, %)',
          v_entity_id, v_org_id USING ERRCODE = 'cardinality_violation';
      END IF;
    END;

    SELECT * INTO v_before_contact
    FROM public.anew_contacts
    WHERE entity_id = v_entity_id
      AND organization_id = v_org_id;
  END IF;

  IF v_before_contact.id IS NOT NULL THEN
    -- Reactivate + clear stale client-conversion metadata (matches the FE).
    UPDATE public.anew_contacts
    SET status = CASE WHEN status <> 'active' THEN 'active' ELSE status END,
        converted_to_client_id = CASE WHEN converted_to_client_id IS NOT NULL THEN NULL ELSE converted_to_client_id END,
        converted_at           = CASE WHEN converted_to_client_id IS NOT NULL THEN NULL ELSE converted_at END
    WHERE id = v_before_contact.id
    RETURNING * INTO v_contact;

    IF v_before_contact.status IS DISTINCT FROM v_contact.status THEN
      v_contact_diff := v_contact_diff || jsonb_build_object('status',
        jsonb_build_object('old', to_jsonb(v_before_contact.status), 'new', to_jsonb(v_contact.status)));
    END IF;
    IF v_before_contact.converted_to_client_id IS DISTINCT FROM v_contact.converted_to_client_id THEN
      v_contact_diff := v_contact_diff || jsonb_build_object('converted_to_client_id',
        jsonb_build_object('old', to_jsonb(v_before_contact.converted_to_client_id), 'new', to_jsonb(v_contact.converted_to_client_id)));
    END IF;
  ELSE
    INSERT INTO public.anew_contacts
      (organization_id, root_organization_id, entity_id, position, notes,
       source_type, source_lead_id, created_by, assigned_to, status)
    VALUES
      (v_org_id,
       p_root_organization_id,
       v_entity_id,
       COALESCE(nullif(p_contact_data ->> 'position', ''), nullif(p_contact_data ->> 'job_title', '')),
       nullif(p_contact_data ->> 'notes', ''),
       'lead',
       p_lead_id,
       v_actor,
       v_before_lead.assigned_to,
       'active')
    RETURNING * INTO v_contact;

    v_contact_diff := jsonb_build_object(
      'id',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_contact.id)),
      'status',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_contact.status)),
      'source_type', jsonb_build_object('old', NULL, 'new', to_jsonb(v_contact.source_type))
    );
  END IF;

  -- ── 2. Entity role transition (contact active, lead+client inactive) ──────
  -- The diff records ONLY roles whose write actually changed a row, and always
  -- uses the REAL previous status read before the UPDATE — never a placeholder
  -- or a hardcoded 'active'/NULL. A role that does not exist for this org (0
  -- rows affected) is not recorded, because no transition actually happened.
  IF v_entity_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    -- contact role → active (create if missing, else reactivate)
    SELECT id, status INTO v_existing_role, v_existing_role_status
    FROM public.anew_entity_roles
    WHERE entity_id = v_entity_id
      AND role = 'contact'
      AND organization_id = v_org_id
    LIMIT 1;

    IF v_existing_role IS NULL THEN
      INSERT INTO public.anew_entity_roles
        (entity_id, role, status, organization_id, source_type, source_id, created_by)
      VALUES
        (v_entity_id, 'contact', 'active', v_org_id, 'lead', p_lead_id, v_actor);
      v_roles_diff := v_roles_diff || jsonb_build_object('contact',
        jsonb_build_object('old', NULL, 'new', to_jsonb('active'::text)));
    ELSE
      UPDATE public.anew_entity_roles SET status = 'active' WHERE id = v_existing_role;
      IF v_existing_role_status IS DISTINCT FROM 'active' THEN
        v_roles_diff := v_roles_diff || jsonb_build_object('contact',
          jsonb_build_object('old', to_jsonb(v_existing_role_status), 'new', to_jsonb('active'::text)));
      END IF;
    END IF;

    -- lead role → inactive (only record if a row was actually flipped)
    v_existing_role_status := NULL;
    SELECT status INTO v_existing_role_status
    FROM public.anew_entity_roles
    WHERE organization_id = v_org_id AND entity_id = v_entity_id AND role = 'lead'
    LIMIT 1;

    UPDATE public.anew_entity_roles
    SET status = 'inactive'
    WHERE organization_id = v_org_id AND entity_id = v_entity_id AND role = 'lead';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 AND v_existing_role_status IS DISTINCT FROM 'inactive' THEN
      v_roles_diff := v_roles_diff || jsonb_build_object('lead',
        jsonb_build_object('old', to_jsonb(v_existing_role_status), 'new', to_jsonb('inactive'::text)));
    END IF;

    -- client role → inactive (only record if a row was actually flipped)
    v_existing_role_status := NULL;
    SELECT status INTO v_existing_role_status
    FROM public.anew_entity_roles
    WHERE organization_id = v_org_id AND entity_id = v_entity_id AND role = 'client'
    LIMIT 1;

    UPDATE public.anew_entity_roles
    SET status = 'inactive'
    WHERE organization_id = v_org_id AND entity_id = v_entity_id AND role = 'client';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 AND v_existing_role_status IS DISTINCT FROM 'inactive' THEN
      v_roles_diff := v_roles_diff || jsonb_build_object('client',
        jsonb_build_object('old', to_jsonb(v_existing_role_status), 'new', to_jsonb('inactive'::text)));
    END IF;
  END IF;

  -- ── 3. UPDATE the lead status ─────────────────────────────────────────────
  IF p_campaign_id IS NOT NULL AND v_before_lead.campaign_id IS NULL THEN
    UPDATE public.anew_leads
    SET status = 'converted',
        converted_to_contact_id = v_contact.id,
        converted_at = now(),
        converted_by = v_actor,
        campaign_id  = p_campaign_id
    WHERE id = p_lead_id
    RETURNING * INTO v_lead;
  ELSE
    UPDATE public.anew_leads
    SET status = 'converted',
        converted_to_contact_id = v_contact.id,
        converted_at = now(),
        converted_by = v_actor
    WHERE id = p_lead_id
    RETURNING * INTO v_lead;
  END IF;

  v_lead_diff := jsonb_build_object(
    'status', jsonb_build_object('old', to_jsonb(v_before_lead.status), 'new', to_jsonb(v_lead.status)),
    'converted_to_contact_id', jsonb_build_object('old', to_jsonb(v_before_lead.converted_to_contact_id), 'new', to_jsonb(v_lead.converted_to_contact_id))
  );
  IF v_before_lead.campaign_id IS DISTINCT FROM v_lead.campaign_id THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('campaign_id',
      jsonb_build_object('old', to_jsonb(v_before_lead.campaign_id), 'new', to_jsonb(v_lead.campaign_id)));
  END IF;

  -- ── 4. Sync entity first/last name when contactData provided them ─────────
  IF v_entity_id IS NOT NULL AND (v_first_name IS NOT NULL OR v_last_name IS NOT NULL) THEN
    SELECT * INTO v_before_ent FROM public.anew_entities WHERE id = v_entity_id;

    UPDATE public.anew_entities
    SET first_name = CASE WHEN v_first_name IS NOT NULL THEN v_first_name ELSE first_name END,
        last_name  = CASE WHEN v_last_name  IS NOT NULL THEN v_last_name  ELSE last_name  END
    WHERE id = v_entity_id
    RETURNING * INTO v_ent;

    IF FOUND THEN
      IF v_before_ent.first_name IS DISTINCT FROM v_ent.first_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('first_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.first_name), 'new', to_jsonb(v_ent.first_name)));
      END IF;
      IF v_before_ent.last_name IS DISTINCT FROM v_ent.last_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('last_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.last_name), 'new', to_jsonb(v_ent.last_name)));
      END IF;
    END IF;
  END IF;

  -- ── Combine + emit ONE audit row keyed on the shared entity_id ────────────
  IF v_contact_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_contacts', v_contact_diff);
  END IF;
  IF v_roles_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_roles', v_roles_diff);
  END IF;
  IF v_lead_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_leads', v_lead_diff);
  END IF;
  IF v_ent_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_entities', v_ent_diff);
  END IF;

  v_audit_org := v_org_id;

  PERFORM public.fn_manual_audit_log(
    'anew_leads',
    COALESCE(v_entity_id, p_lead_id),
    v_audit_org,
    'UPDATE',
    v_diff,
    'web_app'
  );

  RETURN v_contact;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_convert_lead_to_contact(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_convert_lead_to_contact(uuid, jsonb, uuid, uuid) TO authenticated;


-- ============================================================
-- 3. rpc_convert_lead_to_client(...)
-- ============================================================
-- Mirrors doConvertToClient in src/pages/AnewLeads.tsx. The FE resolves clientData
-- (campaign/auto mapping), root_organization_id (resolveRootOrgId) and the source
-- contact id (first anew_contacts row for the entity in this org) up front and
-- passes them in; ensureEntityOrgLink stays in the FE. Column-for-column:
--   1. Reuse an existing anew_clients row for (entity_id, root_organization_id) if
--      any; otherwise INSERT a fresh anew_clients row with the same column set the
--      FE uses. client_type = 'company' when clientData.company_name is present,
--      else 'person'. source_type = 'contact' when a source contact exists, else
--      'lead'; source_id = source contact id or the lead id.
--   2. UPDATE anew_leads: status='converted', converted_to_client_id,
--      converted_to_contact_id=<source contact>, converted_at, converted_by, and
--      campaign_id ONLY when a new campaign was selected for a lead that had none.
--   3. WHEN a source contact exists AND a client id resulted: UPDATE the
--      anew_contacts for (entity_id, organization_id) SET converted_to_client_id,
--      converted_at, status='inactive'.
--   4. UPDATE anew_entities first_name/last_name (+ display_name when company),
--      when clientData provided them.
--   5. Client role → active (INSERT if missing, else UPDATE), then lead + contact
--      roles → inactive (this org only).
-- Returns the resulting anew_clients row. entity_id NEVER changes.

CREATE OR REPLACE FUNCTION public.rpc_convert_lead_to_client(
  p_lead_id               uuid,
  p_client_data           jsonb,
  p_root_organization_id  uuid,
  p_source_contact_id     uuid,
  p_campaign_id           uuid
)
RETURNS public.anew_clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor         uuid;
  v_before_lead   public.anew_leads;
  v_lead          public.anew_leads;
  v_entity_id     uuid;
  v_org_id        uuid;
  v_client        public.anew_clients;
  v_client_id     uuid;
  v_client_type   text;
  v_first_name    text;
  v_last_name     text;
  v_company_name  text;
  v_existing_role uuid;
  v_existing_role_status text;
  v_rows          integer;
  v_audit_org     uuid;
  v_now           timestamptz := now();
  v_diff          jsonb := '{}'::jsonb;
  v_client_diff   jsonb := '{}'::jsonb;
  v_lead_diff     jsonb := '{}'::jsonb;
  v_contact_diff  jsonb := '{}'::jsonb;
  v_ent_diff      jsonb := '{}'::jsonb;
  v_roles_diff    jsonb := '{}'::jsonb;
  v_before_ent    public.anew_entities;
  v_ent           public.anew_entities;
  v_before_contact public.anew_contacts;
  v_after_contact  public.anew_contacts;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before_lead FROM public.anew_leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_org_id    := v_before_lead.organization_id;
  v_entity_id := v_before_lead.entity_id;

  -- Authorization parity with anew_leads RLS: lead's own org OR root org.
  IF NOT public.fn_lead_org_in_scope(v_org_id, v_before_lead.root_organization_id) THEN
    RAISE EXCEPTION 'Lead fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_first_name   := nullif(p_client_data ->> 'first_name', '');
  v_last_name    := nullif(p_client_data ->> 'last_name', '');
  v_company_name := nullif(p_client_data ->> 'company_name', '');
  v_client_type  := CASE WHEN v_company_name IS NOT NULL THEN 'company' ELSE 'person' END;

  -- ── 1. Reuse-or-create the client facet ──────────────────────────────────
  IF v_entity_id IS NOT NULL THEN
    SELECT id INTO v_client_id
    FROM public.anew_clients
    WHERE entity_id = v_entity_id
      AND root_organization_id = p_root_organization_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    INSERT INTO public.anew_clients
      (organization_id, root_organization_id, entity_id, client_type,
       source_type, source_id, status, created_by, assigned_to)
    VALUES
      (v_org_id,
       p_root_organization_id,
       v_entity_id,
       v_client_type,
       CASE WHEN p_source_contact_id IS NOT NULL THEN 'contact' ELSE 'lead' END,
       COALESCE(p_source_contact_id, p_lead_id),
       'active',
       v_actor,
       v_before_lead.assigned_to)
    RETURNING * INTO v_client;
    v_client_id := v_client.id;

    v_client_diff := jsonb_build_object(
      'id',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_client.id)),
      'client_type', jsonb_build_object('old', NULL, 'new', to_jsonb(v_client.client_type)),
      'status',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_client.status))
    );
  ELSE
    SELECT * INTO v_client FROM public.anew_clients WHERE id = v_client_id;
  END IF;

  -- ── 2. UPDATE the lead status ─────────────────────────────────────────────
  IF p_campaign_id IS NOT NULL AND v_before_lead.campaign_id IS NULL THEN
    UPDATE public.anew_leads
    SET status = 'converted',
        converted_to_client_id  = v_client_id,
        converted_to_contact_id = p_source_contact_id,
        converted_at = v_now,
        converted_by = v_actor,
        campaign_id  = p_campaign_id
    WHERE id = p_lead_id
    RETURNING * INTO v_lead;
  ELSE
    UPDATE public.anew_leads
    SET status = 'converted',
        converted_to_client_id  = v_client_id,
        converted_to_contact_id = p_source_contact_id,
        converted_at = v_now,
        converted_by = v_actor
    WHERE id = p_lead_id
    RETURNING * INTO v_lead;
  END IF;

  v_lead_diff := jsonb_build_object(
    'status', jsonb_build_object('old', to_jsonb(v_before_lead.status), 'new', to_jsonb(v_lead.status)),
    'converted_to_client_id', jsonb_build_object('old', to_jsonb(v_before_lead.converted_to_client_id), 'new', to_jsonb(v_lead.converted_to_client_id)),
    'converted_to_contact_id', jsonb_build_object('old', to_jsonb(v_before_lead.converted_to_contact_id), 'new', to_jsonb(v_lead.converted_to_contact_id))
  );
  IF v_before_lead.campaign_id IS DISTINCT FROM v_lead.campaign_id THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('campaign_id',
      jsonb_build_object('old', to_jsonb(v_before_lead.campaign_id), 'new', to_jsonb(v_lead.campaign_id)));
  END IF;

  -- ── 3. Deactivate the source contact facet ───────────────────────────────
  IF p_source_contact_id IS NOT NULL AND v_client_id IS NOT NULL AND v_entity_id IS NOT NULL THEN
    SELECT * INTO v_before_contact
    FROM public.anew_contacts
    WHERE entity_id = v_entity_id AND organization_id = v_org_id
    LIMIT 1;

    UPDATE public.anew_contacts
    SET converted_to_client_id = v_client_id,
        converted_at = v_now,
        status = 'inactive'
    WHERE entity_id = v_entity_id AND organization_id = v_org_id;

    v_contact_diff := jsonb_build_object(
      'converted_to_client_id', jsonb_build_object('old', to_jsonb(v_before_contact.converted_to_client_id), 'new', to_jsonb(v_client_id)),
      'status', jsonb_build_object('old', to_jsonb(v_before_contact.status), 'new', to_jsonb('inactive'::text))
    );
  END IF;

  -- ── 4. Sync entity names (first/last + display_name for company) ──────────
  IF v_entity_id IS NOT NULL
     AND (v_first_name IS NOT NULL OR v_last_name IS NOT NULL
          OR (v_company_name IS NOT NULL AND v_client_type = 'company')) THEN
    SELECT * INTO v_before_ent FROM public.anew_entities WHERE id = v_entity_id;

    UPDATE public.anew_entities
    SET first_name   = CASE WHEN v_first_name IS NOT NULL THEN v_first_name ELSE first_name END,
        last_name    = CASE WHEN v_last_name  IS NOT NULL THEN v_last_name  ELSE last_name  END,
        display_name = CASE WHEN v_company_name IS NOT NULL AND v_client_type = 'company'
                            THEN v_company_name ELSE display_name END
    WHERE id = v_entity_id
    RETURNING * INTO v_ent;

    IF FOUND THEN
      IF v_before_ent.first_name IS DISTINCT FROM v_ent.first_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('first_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.first_name), 'new', to_jsonb(v_ent.first_name)));
      END IF;
      IF v_before_ent.last_name IS DISTINCT FROM v_ent.last_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('last_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.last_name), 'new', to_jsonb(v_ent.last_name)));
      END IF;
      IF v_before_ent.display_name IS DISTINCT FROM v_ent.display_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('display_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.display_name), 'new', to_jsonb(v_ent.display_name)));
      END IF;
    END IF;
  END IF;

  -- ── 5. Entity role transition (client active, lead+contact inactive) ──────
  -- Same discipline as convert-to-contact: real previous status read before the
  -- UPDATE, and a role is only recorded in the diff when its write actually
  -- affected a row and produced a real transition.
  IF v_entity_id IS NOT NULL THEN
    -- client role → active (create if missing, else reactivate)
    SELECT id, status INTO v_existing_role, v_existing_role_status
    FROM public.anew_entity_roles
    WHERE entity_id = v_entity_id
      AND role = 'client'
      AND organization_id = v_org_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_existing_role IS NULL THEN
      INSERT INTO public.anew_entity_roles
        (entity_id, role, status, organization_id, source_type, source_id, created_by)
      VALUES
        (v_entity_id, 'client', 'active', v_org_id,
         CASE WHEN p_source_contact_id IS NOT NULL THEN 'contact' ELSE 'lead' END,
         COALESCE(p_source_contact_id, p_lead_id),
         v_actor);
      v_roles_diff := v_roles_diff || jsonb_build_object('client',
        jsonb_build_object('old', NULL, 'new', to_jsonb('active'::text)));
    ELSE
      UPDATE public.anew_entity_roles SET status = 'active' WHERE id = v_existing_role;
      IF v_existing_role_status IS DISTINCT FROM 'active' THEN
        v_roles_diff := v_roles_diff || jsonb_build_object('client',
          jsonb_build_object('old', to_jsonb(v_existing_role_status), 'new', to_jsonb('active'::text)));
      END IF;
    END IF;

    -- lead role → inactive (only record if a row was actually flipped)
    v_existing_role_status := NULL;
    SELECT status INTO v_existing_role_status
    FROM public.anew_entity_roles
    WHERE entity_id = v_entity_id AND role = 'lead' AND organization_id = v_org_id
    LIMIT 1;

    UPDATE public.anew_entity_roles
    SET status = 'inactive'
    WHERE entity_id = v_entity_id AND role = 'lead' AND organization_id = v_org_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 AND v_existing_role_status IS DISTINCT FROM 'inactive' THEN
      v_roles_diff := v_roles_diff || jsonb_build_object('lead',
        jsonb_build_object('old', to_jsonb(v_existing_role_status), 'new', to_jsonb('inactive'::text)));
    END IF;

    -- contact role → inactive (only record if a row was actually flipped)
    v_existing_role_status := NULL;
    SELECT status INTO v_existing_role_status
    FROM public.anew_entity_roles
    WHERE entity_id = v_entity_id AND role = 'contact' AND organization_id = v_org_id
    LIMIT 1;

    UPDATE public.anew_entity_roles
    SET status = 'inactive'
    WHERE entity_id = v_entity_id AND role = 'contact' AND organization_id = v_org_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 AND v_existing_role_status IS DISTINCT FROM 'inactive' THEN
      v_roles_diff := v_roles_diff || jsonb_build_object('contact',
        jsonb_build_object('old', to_jsonb(v_existing_role_status), 'new', to_jsonb('inactive'::text)));
    END IF;
  END IF;

  -- ── Combine + emit ONE audit row keyed on the shared entity_id ────────────
  IF v_client_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_clients', v_client_diff);
  END IF;
  IF v_lead_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_leads', v_lead_diff);
  END IF;
  IF v_contact_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_contacts', v_contact_diff);
  END IF;
  IF v_ent_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_entities', v_ent_diff);
  END IF;
  IF v_roles_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_roles', v_roles_diff);
  END IF;

  v_audit_org := v_org_id;

  PERFORM public.fn_manual_audit_log(
    'anew_leads',
    COALESCE(v_entity_id, p_lead_id),
    v_audit_org,
    'UPDATE',
    v_diff,
    'web_app'
  );

  RETURN v_client;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_convert_lead_to_client(uuid, jsonb, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_convert_lead_to_client(uuid, jsonb, uuid, uuid, uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Foundation reused, not recreated — this migration references but does NOT
--    redefine fn_generic_entity_audit() / fn_manual_audit_log().
--
-- 2. A single lead edit that also renames the entity produces exactly ONE audit
--    row (anew_leads + anew_entities in one changed_fields diff), keyed on the
--    lead's entity_id:
--    SELECT rpc_update_lead('<lead>', '{}'::jsonb, 'contacted', NULL, NULL, NULL,
--           true, '<stage>', 'ACME', 'Ana', 'Silva');
--    SELECT count(*) FROM entity_audit_log
--    WHERE entity_id = (SELECT entity_id FROM anew_leads WHERE id='<lead>')
--      AND created_at > now() - interval '1 minute';  -- Expected: 1
--
-- 3. Convert-to-contact touches anew_contacts + up to 3 role rows + anew_leads
--    (+ maybe anew_entities) and yields ONE row FOR THE RPC's OWN DML, whose
--    entity_id equals the lead's entity_id BEFORE and AFTER conversion (never two
--    ids). CAVEAT: syncEntityPrimaryAddressFromLead still runs in the FE outside
--    the RPC (its own withAuditContext, NOT bypassed); when it writes an address
--    the normal audit trigger fires and adds row(s) beyond this one. "Exactly 1"
--    therefore describes the RPC's consolidated DML, not necessarily the entire
--    user gesture including the external address sync.
--
-- 4. Convert-to-client likewise yields ONE row for the RPC's DML; the same shared
--    entity_id is used for the client facet, the deactivated contact, the lead,
--    and all role rows. The same address-sync caveat as (3) applies.
--
-- 5. Role diffs reflect reality: each anew_entity_roles entry in changed_fields is
--    present ONLY when that role's UPDATE actually affected a row (GET DIAGNOSTICS
--    ROW_COUNT > 0) and its status truly changed, and every "old" value is the real
--    status read immediately before the UPDATE — no '?' placeholder and no
--    hardcoded 'active'/NULL is ever written.
--
-- 6. The anew_contacts reuse lookup in convert-to-contact raises
--    cardinality_violation when more than one contact matches (entity_id,
--    organization_id), matching the FE's .maybeSingle() loud failure instead of
--    silently choosing an arbitrary row.
--
-- 7. Calling any RPC for a lead whose organization AND root_organization the caller
--    has no active membership in raises insufficient_privilege (anew_leads RLS
--    parity). A member of ONLY the lead's root_organization_id is accepted, exactly
--    like the direct RLS policy (system_admin OR org OR root_org). Verify:
--      -- root-org member converts a child-org lead: succeeds (no exception)
--      SELECT rpc_convert_lead_to_contact('<child-org-lead>', '{}'::jsonb, '<root>', NULL);
--      -- unrelated-org member: raises insufficient_privilege
--
-- 8. converted_by / created_by author resolution intentionally DIVERGES from the FE:
--    the RPC uses current_business_user_id() and RAISES on NULL, whereas the FE
--    falls back to the raw auth uid. This is stricter (fails closed), documented in
--    the header ("Behavior divergence"), and consistent with the roles/users/
--    organizations RPCs. Not a security regression.
