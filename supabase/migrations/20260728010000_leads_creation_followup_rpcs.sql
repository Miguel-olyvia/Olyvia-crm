-- Leads — manual-creation follow-up single-log RPCs (Adicionar Lead + Criar mesmo assim)
-- 2026-07-27 | Module: Leads (creation follow-up)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- The Leads EDIT and CONVERT actions were already consolidated into single-log RPCs in
-- 20260723010000_leads_audit_bypass_and_rpcs.sql. Two GAPS remained in the manual
-- CREATION path in src/pages/AnewLeads.tsx, both still using the old pattern (several
-- independent Supabase calls, each its own Postgres transaction, plus a hand-rolled
-- createdIds compensation/rollback list):
--
--   (1) handleCreateLead — the normal "Adicionar Lead" flow (AnewLeads.tsx ~3068-3166):
--         · INSERT anew_entity_emails (when an email is present and not already stored)
--         · INSERT anew_entity_phones (when a phone is present and not already stored)
--         · INSERT anew_leads
--         · UPSERT anew_entity_roles (role='lead', the commit point)
--       Each write hit its own audit trigger, so one "create lead" produced up to 3-4
--       entity_audit_log rows (emails + phones + leads + entity_roles) instead of 1.
--
--   (2) handleDuplicateCreateAnyway — the "Criar mesmo assim" duplicate-override flow
--       (AnewLeads.tsx ~3406-3486): SAME shape, and worse — the email/phone inserts sat
--       OUTSIDE the withAuditContext block that only wrapped the anew_leads insert +
--       role upsert. So the actor was not even consistently attributed across the rows.
--
-- Both flows must now produce EXACTLY ONE entity_audit_log row, keyed on the SHARED
-- entity_id (the same identity anchor the edit/convert RPCs already use), covering the
-- combined diff across every table the RPC writes.
--
-- Solution
-- --------
-- This migration REUSES the foundation created in
-- 20260719010000_roles_audit_bypass_and_rpcs.sql (Roles module):
--   · the app.audit_bypass GUC guard already present at the top of
--     fn_generic_entity_audit()  (grep for "app.audit_bypass" confirms it exists)
--   · fn_manual_audit_log(text, uuid, uuid, text, jsonb, text)
-- The foundation is NOT recreated here.
--
-- It also REUSES fn_lead_org_in_scope(uuid, uuid) from
-- 20260723010000_leads_audit_bypass_and_rpcs.sql for anew_leads RLS-parity, since the
-- lead is written under the SAME organization_id / root_organization_id boundary as the
-- edit/convert RPCs, and the entity/email/phone/role rows all hang off that same org.
--
-- Two RPCs reproduce, field-for-field / condition-for-condition, what the frontend does
-- today, all inside a single transaction with app.audit_bypass = 'on', accumulate a
-- combined diff across every touched table ({table: {field: {old, new}}}), and call
-- fn_manual_audit_log ONCE keyed on the shared entity_id:
--   · rpc_create_lead_manual            — handleCreateLead's critical writes
--   · rpc_create_lead_duplicate_override — handleDuplicateCreateAnyway's critical writes
--
-- Division of responsibility (kept identical to the current app)
-- --------------------------------------------------------------
-- The frontend still owns everything that is NOT the plain multi-table critical write:
--   · Zod / input validation and required-field checks.
--   · displayName / email / phone / vat extraction from field_values via the field
--     definitions, and campaign / source resolution.
--   · Entity resolution/creation: create_lead_entity_for_org RPC + the 42501 fallback
--     resolveEntityByIdentity / validateEntityCoherence path (normal flow), or the
--     pre-resolved reuseEntityId (create-anyway). The entity_id is passed IN to the RPC;
--     it is NEVER created inside these RPCs, matching the current FE ownership.
--   · ensureEntityOrgLink — still runs in the FE BEFORE the RPC so RLS-visible rows
--     exist; the RPC does not duplicate it.
--   · The whole duplicate detection / DuplicateEntityDialog gate, and the create-anyway
--     pre-write revalidation, stay in the FE unchanged.
--   · POST-COMMIT side effects — syncEntityPrimaryAddressFromLead, the entity rename for
--     reused entities, list/toast/state updates — remain FE calls, unchanged. Those
--     address writes run in their OWN withAuditContext (NOT bypassed) and may add audit
--     rows, exactly as documented for the edit/convert RPCs. The single-log guarantee
--     here is precise: the DML performed INSIDE each RPC yields exactly ONE consolidated
--     audit row.
--
-- Dedup semantics preserved EXACTLY (input validation stays in the FE, but the RPC
-- reproduces the same in-DB existence checks the FE performs today):
--   · Email: skip the insert when a row already exists for (entity_id, email ILIKE) — the
--     FE's .ilike("email", emailValue).maybeSingle() check. Case-insensitive equality.
--   · Phone: skip the insert when an existing phone shares the last-7-digit suffix — the
--     FE's client-side suffix comparison, reproduced with regexp_replace + right().
--   · is_primary mirrors identityContactIsPrimary(entityCreatedHere), i.e. TRUE only when
--     the entity was freshly created in THIS action, FALSE when an existing entity was
--     reused. The caller passes p_entity_created_here so the RPC does not have to guess.
--
-- Author resolution (documented divergence, consistent with the other leads RPCs)
-- ------------------------------------------------------------------------------
-- The FE resolves createdBy as `anewUserId || authUserId` (business user id, falling back
-- to the raw auth uid when unmapped). These RPCs instead use current_business_user_id()
-- and RAISE 'Perfil de utilizador não encontrado' when it is NULL — STRICTER (fails
-- closed), never more permissive, identical to rpc_update_lead / rpc_convert_lead_*.
-- Storing a raw auth uid in created_by (FK to anew_users) would violate the FK anyway.
--
-- Authorization / RLS parity
-- --------------------------
-- SECURITY DEFINER, so RLS does not self-enforce inside the RPCs. Each RPC therefore
-- re-checks explicitly, via fn_lead_org_in_scope(p_organization_id, p_root_organization_id),
-- the SAME membership predicate the anew_leads RLS policies enforce (system_admin OR a
-- member of the lead's organization_id OR its root_organization_id). The email/phone rows
-- are written for the passed entity_id, and the role row + lead row target the same
-- organization_id, so this single scope check is the correct boundary — matching the
-- edit/convert RPCs' approach exactly.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql            — entity_audit_log, fn_generic_entity_audit()
--   20260719010000_roles_audit_bypass_and_rpcs.sql — app.audit_bypass guard + fn_manual_audit_log()
--   20260723010000_leads_audit_bypass_and_rpcs.sql — fn_lead_org_in_scope()
--   20260615130000_baseline_new_database.sql       — current_business_user_id(), anew_* tables + RLS,
--                                                     anew_entity_roles unique (organization_id,entity_id,role)


-- ============================================================
-- 0. Shared helper — reproduce the FE email/phone/lead/role critical writes
-- ============================================================
-- Both RPCs perform IDENTICAL critical writes; only the entity-resolution and post-commit
-- steps (which stay in the FE) differ between the two flows. To honor DRY without changing
-- behavior, the common write+diff logic lives in one internal helper that both public RPCs
-- call under app.audit_bypass. The helper does NOT set the bypass or emit the audit row —
-- the public RPCs own the transaction-level GUC and the single fn_manual_audit_log call —
-- so a single consolidated audit row is guaranteed per user action.
--
-- It returns the combined diff jsonb ({table:{field:{old,new}}}) and the new lead id via
-- OUT params. is_primary follows identityContactIsPrimary(entityCreatedHere).

CREATE OR REPLACE FUNCTION public._fn_leads_creation_critical_writes(
  p_actor                 uuid,
  p_organization_id       uuid,
  p_root_organization_id  uuid,
  p_entity_id             uuid,
  p_entity_created_here   boolean,
  p_field_values          jsonb,
  p_email                 text,
  p_phone                 text,
  p_status                text,
  p_source                text,
  p_source_id             uuid,
  p_campaign_id           uuid,
  p_assigned_to           uuid,
  OUT o_lead_id           uuid,
  OUT o_diff              jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_primary   boolean := COALESCE(p_entity_created_here, false);
  v_email        text    := nullif(btrim(p_email), '');
  v_phone        text    := nullif(btrim(p_phone), '');
  v_email_id     uuid;
  v_phone_id     uuid;
  v_suffix       text;
  v_phone_exists boolean := false;
  v_lead         public.anew_leads;
  v_role_before  text;
  v_role_id      uuid;
  v_role_status  text;
  v_emails_diff  jsonb := '{}'::jsonb;
  v_phones_diff  jsonb := '{}'::jsonb;
  v_lead_diff    jsonb := '{}'::jsonb;
  v_roles_diff   jsonb := '{}'::jsonb;
BEGIN
  -- ── 1. Email — dedupe by (entity_id, email ILIKE); insert only when absent ──
  -- Mirrors the FE .eq("entity_id").ilike("email", emailValue).maybeSingle() check.
  IF v_email IS NOT NULL THEN
    PERFORM 1
    FROM public.anew_entity_emails
    WHERE entity_id = p_entity_id
      AND email ILIKE v_email;

    IF NOT FOUND THEN
      INSERT INTO public.anew_entity_emails
        (entity_id, email, email_type, is_primary, created_by)
      VALUES
        (p_entity_id, v_email, 'personal', v_is_primary, p_actor)
      RETURNING id INTO v_email_id;

      v_emails_diff := jsonb_build_object(
        'id',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_email_id)),
        'email',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_email)),
        'is_primary', jsonb_build_object('old', NULL, 'new', to_jsonb(v_is_primary))
      );
    END IF;
  END IF;

  -- ── 2. Phone — dedupe by trailing 7-digit suffix; insert only when absent ──
  -- Mirrors the FE suffix comparison: strip non-digits, compare last 7 digits.
  IF v_phone IS NOT NULL THEN
    v_suffix := regexp_replace(v_phone, '\D', '', 'g');
    IF length(v_suffix) >= 7 THEN
      v_suffix := right(v_suffix, 7);

      SELECT EXISTS (
        SELECT 1
        FROM public.anew_entity_phones
        WHERE entity_id = p_entity_id
          AND length(regexp_replace(COALESCE(phone_number, ''), '\D', '', 'g')) >= 7
          AND right(regexp_replace(COALESCE(phone_number, ''), '\D', '', 'g'), 7) = v_suffix
      ) INTO v_phone_exists;
    ELSE
      -- A suffix under 7 digits is never treated as a match by the FE, so it always
      -- inserts in that case. Keep the same behavior.
      v_phone_exists := false;
    END IF;

    IF NOT v_phone_exists THEN
      INSERT INTO public.anew_entity_phones
        (entity_id, phone_number, phone_type, is_primary, created_by)
      VALUES
        (p_entity_id, v_phone, 'mobile', v_is_primary, p_actor)
      RETURNING id INTO v_phone_id;

      v_phones_diff := jsonb_build_object(
        'id',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_phone_id)),
        'phone_number', jsonb_build_object('old', NULL, 'new', to_jsonb(v_phone)),
        'is_primary',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_is_primary))
      );
    END IF;
  END IF;

  -- ── 3. Lead INSERT (identical column set to the FE's anew_leads insert) ────
  INSERT INTO public.anew_leads
    (campaign_id, organization_id, root_organization_id, field_values, status,
     source, source_id, created_by, entity_id, assigned_to)
  VALUES
    (p_campaign_id,
     p_organization_id,
     p_root_organization_id,
     p_field_values,
     p_status,
     p_source,
     p_source_id,
     p_actor,
     p_entity_id,
     p_assigned_to)
  RETURNING * INTO v_lead;

  o_lead_id := v_lead.id;

  v_lead_diff := jsonb_build_object(
    'id',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_lead.id)),
    'status',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_lead.status)),
    'source',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_lead.source)),
    'campaign_id',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_lead.campaign_id)),
    'assigned_to',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_lead.assigned_to)),
    'field_values',  jsonb_build_object('old', NULL, 'new', v_lead.field_values)
  );

  -- ── 4. Role UPSERT = commit point (matches the FE upsert onConflict) ───────
  -- The FE upserts (organization_id, entity_id, role='lead', status='active',
  -- source_type='lead', source_id=<lead id>, created_by) with
  -- onConflict 'organization_id,entity_id,role'. Read the real previous status (if
  -- any) so the diff reflects the true transition rather than a placeholder.
  SELECT id, status INTO v_role_id, v_role_before
  FROM public.anew_entity_roles
  WHERE organization_id = p_organization_id
    AND entity_id = p_entity_id
    AND role = 'lead'
  LIMIT 1;

  INSERT INTO public.anew_entity_roles
    (organization_id, entity_id, role, status, source_type, source_id, created_by)
  VALUES
    (p_organization_id, p_entity_id, 'lead', 'active', 'lead', v_lead.id, p_actor)
  ON CONFLICT (organization_id, entity_id, role)
  DO UPDATE SET
    status      = 'active',
    source_type = 'lead',
    source_id   = EXCLUDED.source_id,
    created_by  = EXCLUDED.created_by
  RETURNING status INTO v_role_status;

  IF v_role_id IS NULL THEN
    -- Fresh role row.
    v_roles_diff := jsonb_build_object('lead',
      jsonb_build_object('old', NULL, 'new', to_jsonb(v_role_status)));
  ELSIF v_role_before IS DISTINCT FROM v_role_status THEN
    -- Existing role reactivated / status changed.
    v_roles_diff := jsonb_build_object('lead',
      jsonb_build_object('old', to_jsonb(v_role_before), 'new', to_jsonb(v_role_status)));
  END IF;

  -- ── Combine the per-table diffs into the consolidated payload ──────────────
  o_diff := '{}'::jsonb;
  IF v_emails_diff <> '{}'::jsonb THEN
    o_diff := o_diff || jsonb_build_object('anew_entity_emails', v_emails_diff);
  END IF;
  IF v_phones_diff <> '{}'::jsonb THEN
    o_diff := o_diff || jsonb_build_object('anew_entity_phones', v_phones_diff);
  END IF;
  IF v_lead_diff <> '{}'::jsonb THEN
    o_diff := o_diff || jsonb_build_object('anew_leads', v_lead_diff);
  END IF;
  IF v_roles_diff <> '{}'::jsonb THEN
    o_diff := o_diff || jsonb_build_object('anew_entity_roles', v_roles_diff);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._fn_leads_creation_critical_writes(
  uuid, uuid, uuid, uuid, boolean, jsonb, text, text, text, text, uuid, uuid, uuid
) FROM PUBLIC, anon;
-- Internal helper: only the public RPCs (SECURITY DEFINER) call it. Grant to
-- service_role only; authenticated callers reach it exclusively through the two RPCs.
GRANT EXECUTE ON FUNCTION public._fn_leads_creation_critical_writes(
  uuid, uuid, uuid, uuid, boolean, jsonb, text, text, text, text, uuid, uuid, uuid
) TO service_role;


-- ============================================================
-- 1. rpc_create_lead_manual(...)
-- ============================================================
-- Mirrors the critical writes of handleCreateLead in src/pages/AnewLeads.tsx
-- (~3068-3166). The FE resolves entity_id (create_lead_entity_for_org + 42501 fallback),
-- runs ensureEntityOrgLink, and computes displayName/email/phone/source/campaign BEFORE
-- calling this RPC. entity_created_here mirrors the FE's entityCreatedHere flag (drives
-- is_primary on the email/phone rows). Returns the created anew_leads row.

CREATE OR REPLACE FUNCTION public.rpc_create_lead_manual(
  p_organization_id       uuid,
  p_root_organization_id  uuid,
  p_entity_id             uuid,
  p_entity_created_here   boolean,
  p_field_values          jsonb,
  p_email                 text,
  p_phone                 text,
  p_source                text,
  p_source_id             uuid,
  p_campaign_id           uuid,
  p_assigned_to           uuid
)
RETURNS public.anew_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor    uuid;
  v_lead_id  uuid;
  v_diff     jsonb;
  v_lead     public.anew_leads;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Entidade obrigatória para criar a lead' USING ERRCODE = 'not_null_violation';
  END IF;

  -- ── Authorization parity with anew_leads RLS (org OR root org OR system_admin) ──
  IF NOT public.fn_lead_org_in_scope(p_organization_id, p_root_organization_id) THEN
    RAISE EXCEPTION 'Lead fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Critical writes (email + phone + lead + role) in one transaction ───────
  SELECT o_lead_id, o_diff
  INTO   v_lead_id, v_diff
  FROM public._fn_leads_creation_critical_writes(
    v_actor,
    p_organization_id,
    p_root_organization_id,
    p_entity_id,
    p_entity_created_here,
    p_field_values,
    p_email,
    p_phone,
    'new',              -- FE always inserts status 'new' on manual create
    nullif(p_source, ''),
    p_source_id,
    p_campaign_id,
    p_assigned_to
  );

  -- ── Emit ONE consolidated audit row keyed on the shared entity_id ──────────
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'anew_leads',
      p_entity_id,
      p_organization_id,
      'INSERT',
      v_diff,
      'web_app'
    );
  END IF;

  SELECT * INTO v_lead FROM public.anew_leads WHERE id = v_lead_id;
  RETURN v_lead;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_lead_manual(
  uuid, uuid, uuid, boolean, jsonb, text, text, text, uuid, uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_lead_manual(
  uuid, uuid, uuid, boolean, jsonb, text, text, text, uuid, uuid, uuid
) TO authenticated;


-- ============================================================
-- 2. rpc_create_lead_duplicate_override(...)
-- ============================================================
-- Mirrors the critical writes of handleDuplicateCreateAnyway in src/pages/AnewLeads.tsx
-- (~3406-3486) — the "Criar mesmo assim" duplicate-override flow. Behaviorally identical
-- to rpc_create_lead_manual for the DML: same email/phone dedupe, same lead insert, same
-- role upsert, same single consolidated audit row. It exists as a SEPARATE RPC (rather
-- than reusing rpc_create_lead_manual directly from that handler) so the two frontend
-- entry points map 1:1 to named RPCs, matching the module's convention and keeping the
-- audit source/intent explicit; the shared DML lives in the internal helper.
--
-- In this flow the FE has already decided the entity: either a brand-new one it just
-- created (entity_created_here = true) or a consciously reused existing entity
-- (reuseEntityId → entity_created_here = false). The entity + ensureEntityOrgLink are
-- resolved in the FE before this call, exactly as before. Returns the created lead row.

CREATE OR REPLACE FUNCTION public.rpc_create_lead_duplicate_override(
  p_organization_id       uuid,
  p_root_organization_id  uuid,
  p_entity_id             uuid,
  p_entity_created_here   boolean,
  p_field_values          jsonb,
  p_email                 text,
  p_phone                 text,
  p_source                text,
  p_source_id             uuid,
  p_campaign_id           uuid,
  p_assigned_to           uuid
)
RETURNS public.anew_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor    uuid;
  v_lead_id  uuid;
  v_diff     jsonb;
  v_lead     public.anew_leads;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Entidade obrigatória para criar a lead' USING ERRCODE = 'not_null_violation';
  END IF;

  IF NOT public.fn_lead_org_in_scope(p_organization_id, p_root_organization_id) THEN
    RAISE EXCEPTION 'Lead fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT o_lead_id, o_diff
  INTO   v_lead_id, v_diff
  FROM public._fn_leads_creation_critical_writes(
    v_actor,
    p_organization_id,
    p_root_organization_id,
    p_entity_id,
    p_entity_created_here,
    p_field_values,
    p_email,
    p_phone,
    'new',
    nullif(p_source, ''),
    p_source_id,
    p_campaign_id,
    p_assigned_to
  );

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'anew_leads',
      p_entity_id,
      p_organization_id,
      'INSERT',
      v_diff,
      'web_app'
    );
  END IF;

  SELECT * INTO v_lead FROM public.anew_leads WHERE id = v_lead_id;
  RETURN v_lead;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_lead_duplicate_override(
  uuid, uuid, uuid, boolean, jsonb, text, text, text, uuid, uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_lead_duplicate_override(
  uuid, uuid, uuid, boolean, jsonb, text, text, text, uuid, uuid, uuid
) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Foundation reused, not recreated — this migration references but does NOT redefine
--    fn_generic_entity_audit() / fn_manual_audit_log() / fn_lead_org_in_scope().
--
-- 2. A single manual "Adicionar Lead" with an email + phone produces EXACTLY ONE
--    entity_audit_log row (anew_entity_emails + anew_entity_phones + anew_leads +
--    anew_entity_roles folded into one changed_fields diff), keyed on the lead's
--    entity_id — not 3-4 rows:
--      SELECT rpc_create_lead_manual('<org>','<root>','<entity>', true, '{}'::jsonb,
--             'a@b.pt','+351911111111','manual', NULL, NULL, NULL);
--      SELECT count(*) FROM entity_audit_log
--      WHERE entity_id = '<entity>' AND created_at > now() - interval '1 minute'; -- 1
--
-- 3. "Criar mesmo assim" (rpc_create_lead_duplicate_override) with a REUSED entity
--    (entity_created_here=false) yields the same single row, and the email/phone rows are
--    inserted with is_primary=false (they are not the primary identity of the reused
--    entity) — matching identityContactIsPrimary(false). With a freshly created entity
--    (entity_created_here=true) they are inserted is_primary=true.
--
-- 4. Email dedupe: a second create for the same entity with an already-stored email
--    (case-insensitive) does NOT insert a duplicate email row and omits anew_entity_emails
--    from the diff — matching the FE's .ilike(...).maybeSingle() skip.
--
-- 5. Phone dedupe: a create whose phone shares the last 7 digits with an existing phone on
--    the entity does NOT insert a duplicate and omits anew_entity_phones from the diff —
--    matching the FE's suffix comparison.
--
-- 6. Role upsert: on conflict (organization_id, entity_id, role='lead') the existing row is
--    reactivated and the diff records the REAL previous status (never a placeholder); a
--    fresh role row records old=NULL,new='active'.
--
-- 7. Calling either RPC for an organization/root the caller has no active membership in
--    raises insufficient_privilege (anew_leads RLS parity via fn_lead_org_in_scope). A
--    member of ONLY the root_organization_id is accepted, like the direct RLS policy.
--
-- 8. Author resolution intentionally DIVERGES from the FE (uses current_business_user_id()
--    and RAISES on NULL instead of falling back to the raw auth uid) — stricter, fails
--    closed, consistent with rpc_update_lead / rpc_convert_lead_* / the roles/users RPCs.
--    The raw-uid fallback would violate the created_by FK to anew_users anyway.
--
-- 9. CAVEAT (same as the edit/convert RPCs): syncEntityPrimaryAddressFromLead and the
--    reused-entity rename stay in the FE post-commit, in their OWN withAuditContext (NOT
--    bypassed). When they write, the normal audit trigger fires and may add row(s) on top
--    of the single row these RPCs emit. "Exactly 1" describes the RPC's consolidated DML,
--    not necessarily the entire user gesture including external address/rename sync.
