-- ============================================================
-- Persist the lead's marketing origin (source/source_id/campaign_id) onto
-- anew_clients when a lead is converted to a client via
-- rpc_convert_lead_to_client (supabase/migrations/20260920010000_leads_audit_
-- gaps_and_conversion_single_log.sql — the current, single-audit-row
-- version of this RPC).
--
-- Byte-identical to that version except:
--   • CREATE branch (new anew_clients row): adds origin_source,
--     origin_source_id, origin_campaign_id from v_before_lead, using
--     COALESCE(p_campaign_id, v_before_lead.campaign_id) for the campaign so
--     a campaign_id passed explicitly by the caller (which the function
--     already backfills onto the lead itself a few lines below when the
--     lead had none) is preferred over whatever was already on the lead.
--   • REUSE branch (existing anew_clients row found for the entity): adds a
--     best-effort UPDATE that only fills the 3 origin_* columns when still
--     empty (COALESCE-guarded), so a client's original marketing origin is
--     never overwritten by a later, unrelated conversion event.
-- No other logic, signature, security, or audit behaviour changes.
-- ============================================================

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
       source_type, source_id, status, created_by, assigned_to,
       origin_source, origin_source_id, origin_campaign_id)
    VALUES
      (v_org_id,
       v_root_org_id,
       v_entity_id,
       v_client_type,
       CASE WHEN p_source_contact_id IS NOT NULL THEN 'contact' ELSE 'lead' END,
       COALESCE(p_source_contact_id, p_lead_id),
       'active',
       v_actor,
       v_before_lead.assigned_to,
       v_before_lead.source,
       v_before_lead.source_id,
       COALESCE(p_campaign_id, v_before_lead.campaign_id))
    RETURNING * INTO v_client;
    v_client_id := v_client.id;

    v_client_diff := jsonb_build_object(
      'id',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_client.id)),
      'client_type', jsonb_build_object('old', NULL, 'new', to_jsonb(v_client.client_type)),
      'status',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_client.status))
    );
  ELSE
    SELECT * INTO v_client FROM public.anew_clients WHERE id = v_client_id;

    -- Best-effort: backfill marketing origin on a reused client only when
    -- still empty, never overwriting an origin already recorded.
    UPDATE public.anew_clients
    SET origin_source = COALESCE(origin_source, v_before_lead.source),
        origin_source_id = COALESCE(origin_source_id, v_before_lead.source_id),
        origin_campaign_id = COALESCE(origin_campaign_id, p_campaign_id, v_before_lead.campaign_id)
    WHERE id = v_client_id;
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
