-- Fase 4 of the work_org contract (vault/ficheiros/organizacoes-entidades/
-- contrato-sdd-work-orgs-vs-estruturas-internas.md + plano-implementacao-work-orgs.md).
--
-- Per the confirmed decision: a CRM record belongs to exactly ONE org
-- (organization_id). root_organization_id stops being used as a tenancy/
-- visibility filter anywhere — it stays as a physical column (no DROP, no
-- destructive migration) but is no longer read by RLS or by the SECURITY
-- DEFINER functions that manually replicate RLS authorization.
--
-- Explicitly OUT OF SCOPE for this migration (left untouched on purpose):
--   - anew_entity_relationships (the one table with ONLY root_organization_id,
--     no organization_id at all) — its own semantics are not decided here.
--   - resolve_lead_access_context / resolve_contact_access_context's
--     super_admin "super_graph" hierarchy widening (ancestors+descendants+
--     associations) — that is a separate design question about super_admin's
--     admin-action scope, not a root_organization_id usage, and is not
--     addressed by this migration.
--   - Any frontend write path (Fase 3 territory).

-- ============================================================================
-- anew_leads
-- ============================================================================
ALTER POLICY anew_leads_select ON public.anew_leads
  USING (
    has_anew_permission(auth.uid(), 'leads.view'::text)
    AND organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
  );

ALTER POLICY anew_leads_insert ON public.anew_leads
  WITH CHECK (
    has_anew_permission(auth.uid(), 'leads.create'::text)
    AND organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    AND (
      created_by IS NULL
      OR created_by = COALESCE(
        (SELECT au.id FROM anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1),
        current_business_user_id()
      )
    )
  );

ALTER POLICY anew_leads_update ON public.anew_leads
  USING (
    has_anew_permission(auth.uid(), 'leads.edit'::text)
    AND organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
  )
  WITH CHECK (
    has_anew_permission(auth.uid(), 'leads.edit'::text)
    AND organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
  );

ALTER POLICY anew_leads_delete ON public.anew_leads
  USING (
    has_anew_permission(auth.uid(), 'leads.delete'::text)
    AND organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
  );

ALTER POLICY system_admin_pii_default_deny ON public.anew_leads
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
    OR (is_system_admin((SELECT auth.uid())) AND has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
  );

-- ============================================================================
-- anew_clients
-- ============================================================================
ALTER POLICY anew_clients_select ON public.anew_clients
  USING (
    has_anew_permission((SELECT auth.uid()), 'clients.view'::text)
    AND organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
  );

ALTER POLICY anew_clients_update ON public.anew_clients
  USING (
    has_anew_permission((SELECT auth.uid()), 'clients.edit'::text)
    AND organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
  );
  -- WITH CHECK already organization_id-only, unchanged.

ALTER POLICY anew_clients_delete ON public.anew_clients
  USING (
    has_anew_permission((SELECT auth.uid()), 'clients.delete'::text)
    AND organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
  );

ALTER POLICY system_admin_pii_default_deny ON public.anew_clients
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
    OR (is_system_admin((SELECT auth.uid())) AND has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid()))))
  );

-- ============================================================================
-- form_submissions
-- ============================================================================
ALTER POLICY form_submissions_select ON public.form_submissions
  USING (
    is_system_admin(auth.uid())
    OR organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
  );

-- ============================================================================
-- proposal_items (PII lockdown layer only — the base CRUD policies already
-- never referenced root_organization_id, per the earlier inventory)
-- ============================================================================
ALTER POLICY system_admin_pii_default_deny ON public.proposal_items
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_items.proposal_id
        AND p.organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
    ))
    OR (is_system_admin((SELECT auth.uid())) AND EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_items.proposal_id
        AND has_active_support_access(p.organization_id)
    ))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_items.proposal_id
        AND p.organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
    ))
  );

-- ============================================================================
-- client_contract_parties (PII lockdown layer only — same treatment)
-- ============================================================================
ALTER POLICY system_admin_pii_default_deny ON public.client_contract_parties
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (EXISTS (
      SELECT 1 FROM client_contracts cc
      WHERE cc.id = client_contract_parties.contract_id
        AND cc.organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
    ))
    OR (is_system_admin((SELECT auth.uid())) AND EXISTS (
      SELECT 1 FROM client_contracts cc
      WHERE cc.id = client_contract_parties.contract_id
        AND has_active_support_access(cc.organization_id)
    ))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (EXISTS (
      SELECT 1 FROM client_contracts cc
      WHERE cc.id = client_contract_parties.contract_id
        AND cc.organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
    ))
  );

-- ============================================================================
-- fn_lead_org_in_scope — signature kept identical (5 existing call sites
-- across lead RPCs pass p_root_org_id); the parameter is now accepted but
-- ignored, since root_organization_id no longer grants scope on its own.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_lead_org_in_scope(p_org_id uuid, p_root_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      )
  );
$function$;

-- ============================================================================
-- rpc_update_client / rpc_toggle_client_vip — same fix as the RLS policies
-- above, applied to the SECURITY DEFINER functions that manually replicate
-- anew_clients_update's authorization check. Only the scope-check clause
-- changes; every other line is byte-identical to the live definition.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_update_client(p_client_id uuid, p_entity_id uuid, p_display_name text, p_norm_first text, p_norm_last text, p_email text, p_phone text, p_phone_country text, p_vat text, p_status text, p_notes text, p_assigned_to uuid, p_address_street text DEFAULT NULL::text, p_address_city text DEFAULT NULL::text, p_address_postal_code text DEFAULT NULL::text, p_address_number text DEFAULT NULL::text)
 RETURNS anew_clients
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_now          timestamptz := now();

  v_before_cl    public.anew_clients;
  v_cl           public.anew_clients;

  v_audit_org    uuid;
  v_diff         jsonb := '{}'::jsonb;
  v_sub          jsonb;

  -- entity
  v_ent_before   public.anew_entities;

  -- email
  v_email_id       uuid;
  v_email_before   text;

  -- phone
  v_phone_id           uuid;
  v_phone_before       text;
  v_phone_cc_before    text;

  -- fiscal
  v_fiscal_link_id   uuid;
  v_fiscal_ent_id    uuid;
  v_nif_before       text;
  v_new_fiscal_id    uuid;

  -- address
  v_addr_link_id     uuid;
  v_addr_id          uuid;
  v_addr_before      public.anew_addresses;
  v_addr_after       public.anew_addresses;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the frontend) ────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load target client (before-image + authorization subject) ─────────────
  SELECT * INTO v_before_cl FROM public.anew_clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with anew_clients_update RLS (USING clause) ──────
  IF NOT public.has_anew_permission(auth.uid(), 'clients.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar clientes' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    v_before_cl.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Cliente fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Anti-tampering: p_entity_id must match the target client's OWN entity_id ─
  IF p_entity_id IS NOT NULL AND p_entity_id IS DISTINCT FROM v_before_cl.entity_id THEN
    RAISE EXCEPTION 'entity_id não corresponde ao cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before_cl.entity_id IS NULL THEN
    RETURN v_before_cl;
  END IF;

  -- ── 1. anew_entities: display_name / first_name / last_name ───────────────
  SELECT * INTO v_ent_before FROM public.anew_entities WHERE id = v_before_cl.entity_id;

  UPDATE public.anew_entities
  SET display_name = p_display_name,
      first_name   = p_norm_first,
      last_name    = p_norm_last,
      updated_at   = v_now
  WHERE id = v_before_cl.entity_id;

  IF FOUND THEN
    v_sub := '{}'::jsonb;
    IF v_ent_before.display_name IS DISTINCT FROM p_display_name THEN
      v_sub := v_sub || jsonb_build_object('display_name',
        jsonb_build_object('old', to_jsonb(v_ent_before.display_name), 'new', to_jsonb(p_display_name)));
    END IF;
    IF v_ent_before.first_name IS DISTINCT FROM p_norm_first THEN
      v_sub := v_sub || jsonb_build_object('first_name',
        jsonb_build_object('old', to_jsonb(v_ent_before.first_name), 'new', to_jsonb(p_norm_first)));
    END IF;
    IF v_ent_before.last_name IS DISTINCT FROM p_norm_last THEN
      v_sub := v_sub || jsonb_build_object('last_name',
        jsonb_build_object('old', to_jsonb(v_ent_before.last_name), 'new', to_jsonb(p_norm_last)));
    END IF;
    IF v_sub <> '{}'::jsonb THEN
      v_diff := v_diff || jsonb_build_object('anew_entities', v_sub);
    END IF;
  END IF;

  -- ── 2. anew_entity_emails: upsert primary (only when email provided) ──────
  IF p_email IS NOT NULL AND p_email <> '' THEN
    SELECT id, email INTO v_email_id, v_email_before
    FROM public.anew_entity_emails
    WHERE entity_id = v_before_cl.entity_id AND is_primary = true
    LIMIT 1;

    IF v_email_id IS NOT NULL THEN
      UPDATE public.anew_entity_emails SET email = p_email WHERE id = v_email_id;
      IF v_email_before IS DISTINCT FROM p_email THEN
        v_diff := v_diff || jsonb_build_object('anew_entity_emails',
          jsonb_build_object('email',
            jsonb_build_object('old', to_jsonb(v_email_before), 'new', to_jsonb(p_email))));
      END IF;
    ELSE
      INSERT INTO public.anew_entity_emails
        (entity_id, email, is_primary, email_type, created_by)
      VALUES
        (v_before_cl.entity_id, p_email, true, 'personal', v_actor);
      v_diff := v_diff || jsonb_build_object('anew_entity_emails',
        jsonb_build_object('email',
          jsonb_build_object('old', NULL, 'new', to_jsonb(p_email))));
    END IF;
  END IF;

  -- ── 3. anew_entity_phones: upsert primary (only when phone provided) ──────
  IF p_phone IS NOT NULL AND p_phone <> '' THEN
    SELECT id, phone_number, country_code
      INTO v_phone_id, v_phone_before, v_phone_cc_before
    FROM public.anew_entity_phones
    WHERE entity_id = v_before_cl.entity_id AND is_primary = true
    LIMIT 1;

    IF v_phone_id IS NOT NULL THEN
      UPDATE public.anew_entity_phones
      SET phone_number = p_phone,
          country_code = p_phone_country
      WHERE id = v_phone_id;

      v_sub := '{}'::jsonb;
      IF v_phone_before IS DISTINCT FROM p_phone THEN
        v_sub := v_sub || jsonb_build_object('phone_number',
          jsonb_build_object('old', to_jsonb(v_phone_before), 'new', to_jsonb(p_phone)));
      END IF;
      IF v_phone_cc_before IS DISTINCT FROM p_phone_country THEN
        v_sub := v_sub || jsonb_build_object('country_code',
          jsonb_build_object('old', to_jsonb(v_phone_cc_before), 'new', to_jsonb(p_phone_country)));
      END IF;
      IF v_sub <> '{}'::jsonb THEN
        v_diff := v_diff || jsonb_build_object('anew_entity_phones', v_sub);
      END IF;
    ELSE
      INSERT INTO public.anew_entity_phones
        (entity_id, phone_number, country_code, is_primary, phone_type, created_by)
      VALUES
        (v_before_cl.entity_id, p_phone, p_phone_country, true, 'mobile', v_actor);
      v_diff := v_diff || jsonb_build_object('anew_entity_phones',
        jsonb_build_object(
          'phone_number', jsonb_build_object('old', NULL, 'new', to_jsonb(p_phone)),
          'country_code', jsonb_build_object('old', NULL, 'new', to_jsonb(p_phone_country))
        ));
    END IF;
  END IF;

  -- ── 4. anew_clients: status / notes / assigned_to ─────────────────────────
  UPDATE public.anew_clients
  SET status      = p_status,
      notes       = nullif(p_notes, ''),
      assigned_to = p_assigned_to,
      updated_at  = v_now
  WHERE id = p_client_id
  RETURNING * INTO v_cl;

  v_sub := '{}'::jsonb;
  IF v_before_cl.status IS DISTINCT FROM v_cl.status THEN
    v_sub := v_sub || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before_cl.status), 'new', to_jsonb(v_cl.status)));
  END IF;
  IF v_before_cl.notes IS DISTINCT FROM v_cl.notes THEN
    v_sub := v_sub || jsonb_build_object('notes',
      jsonb_build_object('old', to_jsonb(v_before_cl.notes), 'new', to_jsonb(v_cl.notes)));
  END IF;
  IF v_before_cl.assigned_to IS DISTINCT FROM v_cl.assigned_to THEN
    v_sub := v_sub || jsonb_build_object('assigned_to',
      jsonb_build_object('old', to_jsonb(v_before_cl.assigned_to), 'new', to_jsonb(v_cl.assigned_to)));
  END IF;
  IF v_sub <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_clients', v_sub);
  END IF;

  -- ── 5. NIF/VAT: fiscal_entities + anew_entity_fiscal_entities ─────────────
  IF p_vat IS NOT NULL AND p_vat <> '' THEN
    SELECT id, fiscal_entity_id INTO v_fiscal_link_id, v_fiscal_ent_id
    FROM public.anew_entity_fiscal_entities
    WHERE entity_id = v_before_cl.entity_id AND is_primary = true
    LIMIT 1;

    IF v_fiscal_link_id IS NOT NULL THEN
      SELECT nif INTO v_nif_before FROM public.fiscal_entities WHERE id = v_fiscal_ent_id;
      UPDATE public.fiscal_entities
      SET nif = p_vat, updated_at = v_now
      WHERE id = v_fiscal_ent_id;
      IF v_nif_before IS DISTINCT FROM p_vat THEN
        v_diff := v_diff || jsonb_build_object('fiscal_entities',
          jsonb_build_object('nif',
            jsonb_build_object('old', to_jsonb(v_nif_before), 'new', to_jsonb(p_vat))));
      END IF;
    ELSE
      INSERT INTO public.fiscal_entities (nif, country_code, created_by)
      VALUES (p_vat, 'PT', v_actor)
      RETURNING id INTO v_new_fiscal_id;

      IF v_new_fiscal_id IS NOT NULL THEN
        INSERT INTO public.anew_entity_fiscal_entities
          (entity_id, fiscal_entity_id, is_primary, created_by)
        VALUES
          (v_before_cl.entity_id, v_new_fiscal_id, true, v_actor);
      END IF;

      v_diff := v_diff || jsonb_build_object('fiscal_entities',
        jsonb_build_object('nif',
          jsonb_build_object('old', NULL, 'new', to_jsonb(p_vat))));
      v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities',
        jsonb_build_object('fiscal_entity_id',
          jsonb_build_object('old', NULL, 'new', to_jsonb(v_new_fiscal_id))));
    END IF;
  ELSE
    UPDATE public.anew_entity_fiscal_entities
    SET valid_to = v_now
    WHERE entity_id = v_before_cl.entity_id
      AND is_primary = true
      AND valid_to IS NULL;
    IF FOUND THEN
      v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities',
        jsonb_build_object('valid_to',
          jsonb_build_object('old', NULL, 'new', to_jsonb(v_now))));
    END IF;
  END IF;

  -- ── 6. Address: anew_addresses + anew_entity_addresses (primary) [NEW] ────
  -- Only when a street AND postal code are provided (mirrors the FE's coherence
  -- guard used elsewhere for address writes). Update the existing OPEN primary
  -- link's address row when one exists (mirrors rpc_update_contact's pattern);
  -- else insert both rows.
  IF p_address_street IS NOT NULL AND p_address_street <> ''
     AND p_address_postal_code IS NOT NULL AND p_address_postal_code <> '' THEN

    SELECT ea.id, ea.address_id INTO v_addr_link_id, v_addr_id
    FROM public.anew_entity_addresses ea
    WHERE ea.entity_id = v_before_cl.entity_id
      AND ea.is_primary = true
      AND ea.valid_to IS NULL
    LIMIT 1;

    IF v_addr_id IS NOT NULL THEN
      SELECT * INTO v_addr_before FROM public.anew_addresses WHERE id = v_addr_id;

      UPDATE public.anew_addresses
      SET street      = p_address_street,
          number      = COALESCE(p_address_number, ''),
          city         = p_address_city,
          postal_code  = p_address_postal_code,
          updated_at   = v_now
      WHERE id = v_addr_id
      RETURNING * INTO v_addr_after;

      v_sub := '{}'::jsonb;
      IF v_addr_before.street IS DISTINCT FROM v_addr_after.street THEN
        v_sub := v_sub || jsonb_build_object('street',
          jsonb_build_object('old', to_jsonb(v_addr_before.street), 'new', to_jsonb(v_addr_after.street)));
      END IF;
      IF v_addr_before.number IS DISTINCT FROM v_addr_after.number THEN
        v_sub := v_sub || jsonb_build_object('number',
          jsonb_build_object('old', to_jsonb(v_addr_before.number), 'new', to_jsonb(v_addr_after.number)));
      END IF;
      IF v_addr_before.city IS DISTINCT FROM v_addr_after.city THEN
        v_sub := v_sub || jsonb_build_object('city',
          jsonb_build_object('old', to_jsonb(v_addr_before.city), 'new', to_jsonb(v_addr_after.city)));
      END IF;
      IF v_addr_before.postal_code IS DISTINCT FROM v_addr_after.postal_code THEN
        v_sub := v_sub || jsonb_build_object('postal_code',
          jsonb_build_object('old', to_jsonb(v_addr_before.postal_code), 'new', to_jsonb(v_addr_after.postal_code)));
      END IF;
      IF v_sub <> '{}'::jsonb THEN
        v_diff := v_diff || jsonb_build_object('anew_addresses', v_sub);
      END IF;
    ELSE
      INSERT INTO public.anew_addresses
        (address_key, street, number, city, postal_code, country, created_by)
      VALUES
        (lower(regexp_replace(p_address_street || '-' || p_address_postal_code, '\s+', '-', 'g')),
         p_address_street, COALESCE(p_address_number, ''), p_address_city, p_address_postal_code, 'PT', v_actor)
      RETURNING id INTO v_addr_id;

      INSERT INTO public.anew_entity_addresses
        (entity_id, address_id, address_type, is_primary, created_by)
      VALUES
        (v_before_cl.entity_id, v_addr_id, 'work', true, v_actor);

      v_diff := v_diff || jsonb_build_object('anew_addresses',
        jsonb_build_object(
          'street',      jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_street)),
          'city',        jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_city)),
          'postal_code', jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_postal_code))
        ));
      v_diff := v_diff || jsonb_build_object('anew_entity_addresses',
        jsonb_build_object('address_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_addr_id))));
    END IF;
  END IF;

  -- ── Resolve audit org + entity, then emit ONE consolidated audit row ──────
  -- (root_organization_id fallback kept here deliberately — this is just
  -- picking a non-null org id to attribute the audit row to, not an
  -- authorization decision, so it's unaffected by this migration's scope.)
  v_audit_org := COALESCE(v_cl.organization_id, v_cl.root_organization_id,
                          v_before_cl.organization_id, v_before_cl.root_organization_id);

  IF v_diff <> '{}'::jsonb AND v_audit_org IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'anew_clients',
      v_before_cl.entity_id,
      v_audit_org,
      'UPDATE',
      v_diff,
      'web_app'
    );
  END IF;

  RETURN v_cl;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_toggle_client_vip(p_client_id uuid, p_organization_id uuid, p_is_vip boolean)
 RETURNS anew_clients
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor     uuid;
  v_before    public.anew_clients;
  v_after     public.anew_clients;
  v_before_vip boolean;
  v_diff      jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.anew_clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'clients.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar clientes' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Cliente fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_before_vip := COALESCE((v_before.custom_fields->>'vip')::boolean, false);

  UPDATE public.anew_clients
  SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object('vip', p_is_vip),
      updated_at = now()
  WHERE id = p_client_id
  RETURNING * INTO v_after;

  IF v_before_vip IS DISTINCT FROM p_is_vip THEN
    v_diff := jsonb_build_object('anew_clients', jsonb_build_object(
      'custom_fields.vip', jsonb_build_object('old', to_jsonb(v_before_vip), 'new', to_jsonb(p_is_vip))
    ));

    PERFORM public.fn_manual_audit_log(
      'anew_clients',
      COALESCE(v_before.entity_id, p_client_id),
      COALESCE(v_before.organization_id, p_organization_id),
      'UPDATE',
      v_diff,
      'web_app'
    );
  END IF;

  RETURN v_after;
END;
$function$;
