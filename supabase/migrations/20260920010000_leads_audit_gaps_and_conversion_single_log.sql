-- ============================================================
-- Add missing audit trigger coverage for entity_interactions (call log
-- entries) and lead_ai_scheduling_rules -- both had zero audit trigger
-- of any kind, so real writes produced zero entity_audit_log rows.
-- Both fit the existing fn_generic_entity_audit() pattern directly
-- (entity_interactions has entity_id+organization_id; lead_ai_scheduling_rules
-- has organization_id and falls back to its own id as entity_id, same as
-- other org-level config tables).
--
-- Also: rpc_convert_lead_to_contact / rpc_convert_lead_to_client were
-- briefly split into 2 audit rows each (contact/client creation +
-- lead status change) during this session, then explicitly reverted
-- back to exactly 1 consolidated row per conversion action per product
-- decision: converting a lead is one user action and must produce
-- exactly one entity_audit_log row, not split across tables. This
-- migration captures that final, correct (single-row) state.
-- ============================================================

CREATE TRIGGER trg_audit_entity_interactions AFTER INSERT OR UPDATE OR DELETE ON public.entity_interactions FOR EACH ROW EXECUTE FUNCTION fn_generic_entity_audit();

CREATE TRIGGER trg_audit_lead_ai_scheduling_rules AFTER INSERT OR UPDATE OR DELETE ON public.lead_ai_scheduling_rules FOR EACH ROW EXECUTE FUNCTION fn_generic_entity_audit();

CREATE OR REPLACE FUNCTION public.rpc_convert_lead_to_contact(p_lead_id uuid, p_contact_data jsonb, p_root_organization_id uuid, p_campaign_id uuid)
 RETURNS anew_contacts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor         uuid;
  v_lead          public.anew_leads;
  v_before_lead   public.anew_leads;
  v_entity_id     uuid;
  v_org_id        uuid;
  v_root_org_id   uuid;
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
  v_contact_is_insert boolean := false;
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

  v_org_id      := v_before_lead.organization_id;
  v_entity_id   := v_before_lead.entity_id;
  -- SECURITY: root_organization_id is ALWAYS derived server-side from the already
  -- authorized lead row. p_root_organization_id (caller-supplied) is intentionally
  -- never read below — trusting it would let any authenticated caller persist a
  -- root_organization_id belonging to an org they do not have access to.
  v_root_org_id := v_before_lead.root_organization_id;

  -- Authorization parity with anew_leads RLS: lead's own org OR root org.
  IF NOT public.fn_lead_org_in_scope(v_org_id, v_root_org_id) THEN
    RAISE EXCEPTION 'Lead fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_first_name := nullif(p_contact_data ->> 'first_name', '');
  v_last_name  := nullif(p_contact_data ->> 'last_name', '');

  -- ── 1. Reuse-or-create the contact facet ─────────────────────────────────
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
    v_contact_is_insert := false;
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
       v_root_org_id,
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
    v_contact_is_insert := true;
  END IF;

  -- ── 2. Entity role transition (contact active, lead+client inactive) ──────
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

  -- ── Emit exactly ONE consolidated audit row for this whole conversion
  -- action (per explicit product decision: "lead X convertida a contacto
  -- por user Y" must be a single row, not split across tables). ─────────
  v_audit_org := v_org_id;

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
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_convert_lead_to_client(p_lead_id uuid, p_client_data jsonb, p_root_organization_id uuid, p_source_contact_id uuid, p_campaign_id uuid)
 RETURNS anew_clients
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor         uuid;
  v_before_lead   public.anew_leads;
  v_lead          public.anew_leads;
  v_entity_id     uuid;
  v_org_id        uuid;
  v_root_org_id   uuid;
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

  v_org_id      := v_before_lead.organization_id;
  v_entity_id   := v_before_lead.entity_id;
  -- SECURITY: same fix as rpc_convert_lead_to_contact — root_organization_id is
  -- ALWAYS derived server-side from the already authorized lead row.
  -- p_root_organization_id (caller-supplied) is intentionally never read below,
  -- neither for the reuse lookup nor for the persisted value, because trusting it
  -- would let a caller force a client record to be created/reused under a
  -- root_organization_id belonging to an org they have no access to.
  v_root_org_id := v_before_lead.root_organization_id;

  -- Authorization parity with anew_leads RLS: lead's own org OR root org.
  IF NOT public.fn_lead_org_in_scope(v_org_id, v_root_org_id) THEN
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
      AND root_organization_id = v_root_org_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    INSERT INTO public.anew_clients
      (organization_id, root_organization_id, entity_id, client_type,
       source_type, source_id, status, created_by, assigned_to)
    VALUES
      (v_org_id,
       v_root_org_id,
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

  -- ── Emit exactly ONE consolidated audit row for this whole conversion
  -- action (per explicit product decision: "lead X convertida a cliente
  -- por user Y" must be a single row, not split across tables). ─────────
  v_audit_org := v_org_id;

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
$function$
;
