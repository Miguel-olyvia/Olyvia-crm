-- Contacts/Clients — atomic create RPCs, client-edit address gap fix, contact tags audit,
-- client VIP flag RPC, client meeting-scheduling RPC.
-- 2026-09-02 | Modules: Contacts, Clients
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Reuses the foundation from 20260719010000_roles_audit_bypass_and_rpcs.sql:
--   · app.audit_bypass GUC guard inside fn_generic_entity_audit()
--   · fn_manual_audit_log(text, uuid, uuid, text, jsonb, text)
-- Not recreated here.
--
-- ============================================================
-- BUG 1 — Contact creation produces a partial, multi-row audit trail
-- ============================================================
-- public.create_contact_with_role(jsonb) (20260619100000, patched 20260623140000)
-- writes anew_entities / anew_entity_emails / anew_entity_phones / fiscal_entities /
-- anew_entity_fiscal_entities / anew_entity_org_links / anew_contacts / anew_entity_roles
-- with NO app.audit_bypass and NO fn_manual_audit_log call. Only anew_contacts carries
-- the generic AFTER trigger that actually fires, so the single resulting audit row's
-- full_record has just the anew_contacts columns — display_name/email/phone (which live
-- on anew_entities / anew_entity_emails / anew_entity_phones) are invisible.
--
-- Fix: add PERFORM set_config('app.audit_bypass','on',true) at the top, accumulate a
-- diff across every table actually written, and call fn_manual_audit_log ONCE keyed on
-- entity_id, mirroring rpc_create_lead_manual's pattern. All authorization / dedupe /
-- WHERE-NOT-EXISTS-for-the-org-link logic is preserved byte-for-byte from the
-- 20260623140000 version — only the audit mechanics change.

CREATE OR REPLACE FUNCTION public.create_contact_with_role(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_actor uuid;
  v_org_id uuid;
  v_root_org_id uuid;
  v_entity_id uuid;
  v_entity_type text;
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_phone_cc text;
  v_vat text;
  v_status text;
  v_source_type text;
  v_assigned_to uuid;
  v_ctx RECORD;
  v_contact_id uuid;
  v_role_id uuid;
  v_entity_created_here boolean := false;
  v_fiscal_entity_id uuid;
  v_org_link_inserted boolean := false;
  v_role_before_status text;
  v_diff jsonb := '{}'::jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'p_payload is required';
  END IF;

  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := COALESCE(
    public.current_business_user_id(),
    (
      SELECT au.id
      FROM public.anew_users au
      WHERE au.auth_user_id = v_auth_uid
      LIMIT 1
    )
  );

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'create_contact_with_role: actor not resolved for auth.uid=%', v_auth_uid
      USING ERRCODE = 'P0001';
  END IF;

  v_org_id := (p_payload->>'organizationId')::uuid;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'organizationId is required';
  END IF;

  v_root_org_id := COALESCE((p_payload->>'rootOrganizationId')::uuid, v_org_id);
  v_entity_id := (p_payload->>'entityId')::uuid;
  v_entity_type := COALESCE(p_payload->>'entityType', 'person');
  v_display_name := p_payload->>'displayName';
  v_first_name := p_payload->>'firstName';
  v_last_name := p_payload->>'lastName';
  v_email := NULLIF(BTRIM(COALESCE(p_payload->>'email', '')), '');
  v_phone := NULLIF(BTRIM(COALESCE(p_payload->>'phone', '')), '');
  v_phone_cc := p_payload->>'phoneCountryCode';
  v_vat := NULLIF(BTRIM(COALESCE(p_payload->>'vat', '')), '');
  v_status := COALESCE(p_payload->>'status', 'active');
  v_source_type := COALESCE(p_payload->>'sourceType', 'manual');
  v_assigned_to := (p_payload->>'assignedTo')::uuid;

  SELECT *
  INTO v_ctx
  FROM public.resolve_contact_access_context(v_org_id, 'ORG', 'contacts.create');

  IF v_entity_id IS NULL THEN
    IF v_display_name IS NULL OR BTRIM(v_display_name) = '' THEN
      RAISE EXCEPTION 'displayName is required to create a new entity';
    END IF;

    v_entity_created_here := true;

    INSERT INTO public.anew_entities (
      type,
      display_name,
      created_by,
      first_name,
      last_name
    )
    VALUES (
      v_entity_type,
      v_display_name,
      v_actor,
      v_first_name,
      v_last_name
    )
    RETURNING id INTO v_entity_id;

    v_diff := v_diff || jsonb_build_object('anew_entities', jsonb_build_object(
      'id',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_entity_id)),
      'type',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_entity_type)),
      'display_name', jsonb_build_object('old', NULL, 'new', to_jsonb(v_display_name)),
      'first_name',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_first_name)),
      'last_name',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_last_name))
    ));

    IF v_email IS NOT NULL THEN
      INSERT INTO public.anew_entity_emails (entity_id, email, is_primary, created_by)
      VALUES (v_entity_id, v_email, true, v_actor);

      v_diff := v_diff || jsonb_build_object('anew_entity_emails', jsonb_build_object(
        'email',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_email)),
        'is_primary', jsonb_build_object('old', NULL, 'new', to_jsonb(true))
      ));
    END IF;

    IF v_phone IS NOT NULL THEN
      INSERT INTO public.anew_entity_phones (entity_id, phone_number, country_code, phone_type, is_primary, created_by)
      VALUES (v_entity_id, v_phone, COALESCE(v_phone_cc, '+351'), 'work', true, v_actor);

      v_diff := v_diff || jsonb_build_object('anew_entity_phones', jsonb_build_object(
        'phone_number', jsonb_build_object('old', NULL, 'new', to_jsonb(v_phone)),
        'country_code', jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(v_phone_cc, '+351'))),
        'is_primary',   jsonb_build_object('old', NULL, 'new', to_jsonb(true))
      ));
    END IF;

    IF v_vat IS NOT NULL THEN
      INSERT INTO public.fiscal_entities (nif, entity_type, created_by)
      VALUES (v_vat, CASE WHEN v_entity_type = 'person' THEN 'individual' ELSE 'company' END, v_actor)
      RETURNING id INTO v_fiscal_entity_id;

      INSERT INTO public.anew_entity_fiscal_entities (entity_id, fiscal_entity_id, is_primary, created_by)
      VALUES (v_entity_id, v_fiscal_entity_id, true, v_actor);

      v_diff := v_diff || jsonb_build_object('fiscal_entities', jsonb_build_object(
        'nif', jsonb_build_object('old', NULL, 'new', to_jsonb(v_vat))
      ));
      v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities', jsonb_build_object(
        'fiscal_entity_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_fiscal_entity_id))
      ));
    END IF;
  END IF;

  -- Use WHERE NOT EXISTS instead of ON CONFLICT DO NOTHING to avoid firing
  -- the BEFORE trigger when the org link already exists (20260623140000 fix, preserved).
  INSERT INTO public.anew_entity_org_links (entity_id, organization_id, is_primary)
  SELECT v_entity_id, v_org_id, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.anew_entity_org_links
    WHERE entity_id = v_entity_id AND organization_id = v_org_id
  );
  GET DIAGNOSTICS v_org_link_inserted = ROW_COUNT;
  IF v_org_link_inserted THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_org_links', jsonb_build_object(
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_org_id)),
      'is_primary',      jsonb_build_object('old', NULL, 'new', to_jsonb(true))
    ));
  END IF;

  INSERT INTO public.anew_contacts (
    entity_id,
    root_organization_id,
    organization_id,
    status,
    source_type,
    assigned_to,
    created_by
  )
  VALUES (
    v_entity_id,
    v_root_org_id,
    v_org_id,
    v_status,
    v_source_type,
    v_assigned_to,
    v_actor
  )
  RETURNING id INTO v_contact_id;

  v_diff := v_diff || jsonb_build_object('anew_contacts', jsonb_build_object(
    'id',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_contact_id)),
    'status',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_status)),
    'source_type', jsonb_build_object('old', NULL, 'new', to_jsonb(v_source_type)),
    'assigned_to', jsonb_build_object('old', NULL, 'new', to_jsonb(v_assigned_to))
  ));

  SELECT er.id, er.status
  INTO v_role_id, v_role_before_status
  FROM public.anew_entity_roles er
  WHERE er.entity_id = v_entity_id
    AND er.role = 'contact'
    AND er.organization_id = v_org_id
  LIMIT 1
  FOR UPDATE;

  IF v_role_id IS NULL THEN
    INSERT INTO public.anew_entity_roles (
      entity_id,
      role,
      status,
      organization_id,
      source_type,
      created_by
    )
    VALUES (
      v_entity_id,
      'contact',
      v_status,
      v_org_id,
      v_source_type,
      v_actor
    )
    RETURNING id INTO v_role_id;

    v_diff := v_diff || jsonb_build_object('anew_entity_roles', jsonb_build_object(
      'contact', jsonb_build_object('old', NULL, 'new', to_jsonb(v_status))
    ));
  ELSE
    UPDATE public.anew_entity_roles
    SET status = v_status,
        deleted_at = NULL,
        deleted_by = NULL,
        updated_at = now()
    WHERE id = v_role_id;

    IF v_role_before_status IS DISTINCT FROM v_status THEN
      v_diff := v_diff || jsonb_build_object('anew_entity_roles', jsonb_build_object(
        'contact', jsonb_build_object('old', to_jsonb(v_role_before_status), 'new', to_jsonb(v_status))
      ));
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.anew_entity_roles
    WHERE entity_id = v_entity_id
      AND role = 'contact'
      AND organization_id = v_org_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'create_contact_with_role: failed to guarantee contact role for entity %', v_entity_id;
  END IF;

  -- ── Emit ONE consolidated audit row keyed on entity_id ─────────────────────
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'anew_contacts',
      v_entity_id,
      v_org_id,
      'INSERT',
      v_diff,
      'web_app'
    );
  END IF;

  RETURN jsonb_build_object(
    'contact_id', v_contact_id,
    'entity_id', v_entity_id,
    'role_id', v_role_id,
    'organization_id', v_org_id
  );
END;
$$;

-- Grants unchanged (same signature as the prior version).
REVOKE ALL ON FUNCTION public.create_contact_with_role(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contact_with_role(jsonb) TO authenticated;


-- ============================================================
-- BUG 2 — Client creation: same class of bug, currently no RPC at all
-- ============================================================
-- src/pages/AnewClients.tsx handleSubmit + createClientRecord() perform, as several
-- independent Supabase calls: anew_entities (insert/update), anew_entity_emails,
-- anew_entity_phones, fiscal_entities + anew_entity_fiscal_entities (via
-- createEntityWithIdentity — unchanged, stays in the FE, entity resolution/dedupe
-- ownership is NOT moved into the DB per the task's constraints), anew_entity_org_links
-- (ensureEntityOrgLink, stays in FE), anew_clients, anew_entity_roles, anew_addresses +
-- anew_entity_addresses. Each hits its own trigger/withAuditContext call.
--
-- New RPC rpc_create_client_manual(...) consolidates ONLY the critical writes that
-- createClientRecord() currently performs (anew_clients + anew_entity_roles +
-- anew_addresses/anew_entity_addresses), given an ALREADY-RESOLVED entity_id (created
-- and org-linked by the FE exactly as today — entity resolution/dedupe/coherence checks
-- are explicitly out of scope per the task). This mirrors the leads module's division of
-- responsibility exactly: entity resolution stays FE-owned, the RPC owns the plain
-- multi-table write + single audit row.

CREATE OR REPLACE FUNCTION public.rpc_create_client_manual(
  p_entity_id             uuid,
  p_organization_id       uuid,
  p_root_organization_id  uuid,
  p_status                text,
  p_client_type           text,
  p_address_street        text,
  p_address_number        text,
  p_address_floor         text,
  p_address_city          text,
  p_address_postal_code   text,
  p_address_district      text
)
RETURNS public.anew_clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor         uuid;
  v_client        public.anew_clients;
  v_existing      public.anew_clients;
  v_role_id       uuid;
  v_role_before   text;
  v_address_id    uuid;
  v_address_key   text;
  v_diff          jsonb := '{}'::jsonb;
  v_client_diff   jsonb := '{}'::jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Entidade obrigatória para criar cliente' USING ERRCODE = 'not_null_violation';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'clients.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar clientes' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── 1. anew_clients: reuse existing non-deleted row (reactivate) or insert ──
  SELECT * INTO v_existing
  FROM public.anew_clients
  WHERE entity_id = p_entity_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.anew_clients
    SET status = COALESCE(p_status, 'active'),
        deleted_at = NULL,
        source_type = 'manual',
        updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_client;

    IF v_existing.status IS DISTINCT FROM v_client.status THEN
      v_client_diff := v_client_diff || jsonb_build_object('status',
        jsonb_build_object('old', to_jsonb(v_existing.status), 'new', to_jsonb(v_client.status)));
    END IF;
  ELSE
    INSERT INTO public.anew_clients
      (entity_id, root_organization_id, organization_id, status, client_type,
       source_type, created_by)
    VALUES
      (p_entity_id, COALESCE(p_root_organization_id, p_organization_id), p_organization_id,
       COALESCE(p_status, 'active'), p_client_type, 'manual', v_actor)
    RETURNING * INTO v_client;

    v_client_diff := jsonb_build_object(
      'id',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_client.id)),
      'status',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_client.status)),
      'client_type', jsonb_build_object('old', NULL, 'new', to_jsonb(v_client.client_type))
    );
  END IF;

  IF v_client_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_clients', v_client_diff);
  END IF;

  -- ── 2. anew_entity_roles: role='client' ─────────────────────────────────────
  SELECT id, status INTO v_role_id, v_role_before
  FROM public.anew_entity_roles
  WHERE entity_id = p_entity_id AND role = 'client' AND organization_id = p_organization_id
  LIMIT 1;

  IF v_role_id IS NULL THEN
    INSERT INTO public.anew_entity_roles
      (entity_id, role, status, organization_id, source_type, created_by)
    VALUES
      (p_entity_id, 'client', 'active', p_organization_id, 'manual', v_actor);

    v_diff := v_diff || jsonb_build_object('anew_entity_roles',
      jsonb_build_object('client', jsonb_build_object('old', NULL, 'new', to_jsonb('active'::text))));
  ELSIF v_role_before IS DISTINCT FROM 'active' THEN
    UPDATE public.anew_entity_roles SET status = 'active', updated_at = now() WHERE id = v_role_id;
    v_diff := v_diff || jsonb_build_object('anew_entity_roles',
      jsonb_build_object('client', jsonb_build_object('old', to_jsonb(v_role_before), 'new', to_jsonb('active'::text))));
  END IF;

  -- ── 3. Primary address (only when street + postal code provided) ───────────
  -- Mirrors createClientRecord()'s addr.postal_code && addr.street guard exactly.
  IF p_address_postal_code IS NOT NULL AND p_address_postal_code <> ''
     AND p_address_street IS NOT NULL AND p_address_street <> '' THEN
    v_address_key := lower(regexp_replace(
      p_address_street || '-' || COALESCE(p_address_number, '') || '-' || p_address_postal_code,
      '\s+', '-', 'g'
    ));

    INSERT INTO public.anew_addresses
      (address_key, street, number, floor, city, postal_code, district, country, created_by)
    VALUES
      (v_address_key, p_address_street, COALESCE(p_address_number, ''), p_address_floor,
       p_address_city, p_address_postal_code, p_address_district, 'PT', v_actor)
    RETURNING id INTO v_address_id;

    INSERT INTO public.anew_entity_addresses
      (entity_id, address_id, address_type, is_primary, created_by)
    VALUES
      (p_entity_id, v_address_id, 'work', true, v_actor);

    v_diff := v_diff || jsonb_build_object('anew_addresses', jsonb_build_object(
      'id',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_address_id)),
      'street',      jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_street)),
      'city',        jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_city)),
      'postal_code', jsonb_build_object('old', NULL, 'new', to_jsonb(p_address_postal_code))
    ));
    v_diff := v_diff || jsonb_build_object('anew_entity_addresses', jsonb_build_object(
      'address_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_address_id)),
      'is_primary', jsonb_build_object('old', NULL, 'new', to_jsonb(true))
    ));
  END IF;

  -- ── Emit ONE consolidated audit row keyed on entity_id ─────────────────────
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'anew_clients',
      p_entity_id,
      p_organization_id,
      'INSERT',
      v_diff,
      'web_app'
    );
  END IF;

  RETURN v_client;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_client_manual(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_client_manual(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text
) TO authenticated;


-- ============================================================
-- BUG 3 — Client EDIT silently drops address changes
-- ============================================================
-- rpc_update_client(...) (20260805010000) covers anew_entities, anew_entity_emails,
-- anew_entity_phones, anew_clients (status/notes/assigned_to), and fiscal_entities /
-- anew_entity_fiscal_entities — but has NO parameters and NO logic for
-- anew_addresses / anew_entity_addresses at all. ClientDetailsDialog.tsx's
-- editFormData carries address/city/postal_code but handleUpdateClient() never sends
-- them anywhere; they are read into state (loadClientDetails) and then discarded on save.
--
-- Fix: extend rpc_update_client with 4 new trailing parameters (kept additive/optional
-- so existing callers are not broken) and add address upsert-primary logic that mirrors
-- the pattern already proven in rpc_update_contact (20260725010000): update the existing
-- primary anew_entity_addresses row's linked anew_addresses row when one exists, else
-- insert both, keyed on entity_id. anew_addresses.number is NOT NULL with no column
-- default (baseline 20260615130000), so both the INSERT and UPDATE branches always supply
-- COALESCE(p_address_number, '') / number='' respectively, matching rpc_update_contact's
-- established convention exactly. Folded into the SAME transaction/diff/single audit row.

CREATE OR REPLACE FUNCTION public.rpc_update_client(
  p_client_id        uuid,
  p_entity_id        uuid,
  p_display_name     text,
  p_norm_first       text,
  p_norm_last        text,
  p_email            text,
  p_phone            text,
  p_phone_country    text,
  p_vat              text,
  p_status           text,
  p_notes            text,
  p_assigned_to      uuid,
  p_address_street      text DEFAULT NULL,
  p_address_city         text DEFAULT NULL,
  p_address_postal_code  text DEFAULT NULL,
  p_address_number       text DEFAULT NULL
)
RETURNS public.anew_clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
       v_before_cl.organization_id      IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    OR v_before_cl.root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
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
$$;

-- New signature (3 additive trailing DEFAULT NULL params) — drop the old one first
-- since Postgres does not allow changing an existing function's parameter list via
-- CREATE OR REPLACE when defaults are involved in a way that could create an ambiguous
-- overload; this keeps exactly one rpc_update_client in scope.
DROP FUNCTION IF EXISTS public.rpc_update_client(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid
);

REVOKE ALL ON FUNCTION public.rpc_update_client(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_client(
  uuid, uuid, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text
) TO authenticated;


-- ============================================================
-- BUG 4 — Contact EDIT address gap: VERIFIED NOT PRESENT, no fix needed
-- ============================================================
-- rpc_update_contact (20260725010000_contacts_audit_bypass_and_rpcs.sql, step 5,
-- "anew_addresses + anew_entity_addresses (primary)") already upserts the primary
-- address and includes it in the consolidated diff exactly like the other fields.
-- No migration action required for this bug.


-- ============================================================
-- BUG 6 — Contacts "Gerir tags": tag saved, ZERO audit rows
-- ============================================================
-- ContactTagsDialog.tsx addTag()/removeTag() call supabase.from("contact_tags")
-- .insert(...) / .delete(...) directly — no RPC, no trigger on contact_tags, no
-- fn_manual_audit_log call anywhere. New RPC wraps both add and remove in the
-- standard single-log pattern, keyed on entity_id, action-specific diff.

CREATE OR REPLACE FUNCTION public.rpc_manage_contact_tag(
  p_action          text,   -- 'add' | 'remove'
  p_entity_id       uuid,
  p_organization_id uuid,
  p_tag_id          uuid,   -- required for 'remove'; ignored for 'add'
  p_tag             text,   -- required for 'add'; ignored for 'remove'
  p_color           text    -- optional for 'add', defaults to 'blue'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      uuid;
  v_tag_id     uuid;
  v_tag_before RECORD;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_entity_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'entity_id e organization_id são obrigatórios' USING ERRCODE = 'not_null_violation';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'contacts.edit') THEN
    RAISE EXCEPTION 'Sem permissão para gerir tags' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_action = 'add' THEN
    IF p_tag IS NULL OR btrim(p_tag) = '' THEN
      RAISE EXCEPTION 'Tag obrigatória' USING ERRCODE = 'not_null_violation';
    END IF;

    INSERT INTO public.contact_tags (entity_id, organization_id, tag, color, created_by)
    VALUES (p_entity_id, p_organization_id, btrim(p_tag), COALESCE(p_color, 'blue'), v_actor::text)
    RETURNING id INTO v_tag_id;

    v_diff := jsonb_build_object('contact_tags', jsonb_build_object(
      'id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_tag_id)),
      'tag',   jsonb_build_object('old', NULL, 'new', to_jsonb(btrim(p_tag))),
      'color', jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_color, 'blue')))
    ));

    PERFORM public.fn_manual_audit_log(
      'contact_tags', p_entity_id, p_organization_id, 'INSERT', v_diff, 'web_app'
    );

    RETURN jsonb_build_object('tag_id', v_tag_id);

  ELSIF p_action = 'remove' THEN
    IF p_tag_id IS NULL THEN
      RAISE EXCEPTION 'tag_id obrigatório para remover' USING ERRCODE = 'not_null_violation';
    END IF;

    SELECT tag, color INTO v_tag_before
    FROM public.contact_tags
    WHERE id = p_tag_id AND entity_id = p_entity_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('tag_id', p_tag_id, 'removed', false);
    END IF;

    DELETE FROM public.contact_tags
    WHERE id = p_tag_id AND entity_id = p_entity_id AND organization_id = p_organization_id;

    v_diff := jsonb_build_object('contact_tags', jsonb_build_object(
      'id',  jsonb_build_object('old', to_jsonb(p_tag_id), 'new', NULL),
      'tag', jsonb_build_object('old', to_jsonb(v_tag_before.tag), 'new', NULL)
    ));

    PERFORM public.fn_manual_audit_log(
      'contact_tags', p_entity_id, p_organization_id, 'DELETE', v_diff, 'web_app'
    );

    RETURN jsonb_build_object('tag_id', p_tag_id, 'removed', true);

  ELSE
    RAISE EXCEPTION 'Ação inválida: %', p_action USING ERRCODE = 'invalid_parameter_value';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_manage_contact_tag(
  text, uuid, uuid, uuid, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_manage_contact_tag(
  text, uuid, uuid, uuid, text, text
) TO authenticated;


-- ============================================================
-- BUG 9 — Clients "Marcar como VIP": unimplemented
-- ============================================================
-- No is_vip-like column exists anywhere in the schema (grepped baseline + all
-- migrations) and clients have no client_tags table (unlike contacts' contact_tags).
-- anew_clients.custom_fields jsonb already exists and is the natural, schema-consistent
-- place for a boolean flag toggle. New RPC toggles custom_fields->>'vip' with the
-- standard single-log pattern.

CREATE OR REPLACE FUNCTION public.rpc_toggle_client_vip(
  p_client_id       uuid,
  p_organization_id uuid,
  p_is_vip          boolean
)
RETURNS public.anew_clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
       v_before.organization_id      IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    OR v_before.root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
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
$$;

REVOKE ALL ON FUNCTION public.rpc_toggle_client_vip(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_toggle_client_vip(uuid, uuid, boolean) TO authenticated;


-- ============================================================
-- BUG 10 — Clients "Agendar reunião": unimplemented
-- ============================================================
-- Contacts' equivalent scheduling-adjacent action ("Registar atividade" in
-- AnewContacts.tsx / AnewLeads.tsx openContactDialogForLead) writes to
-- entity_interactions. Reuse the same table: interaction_type='meeting',
-- next_action_date carries the scheduled datetime, next_action_channel carries the
-- meeting location/medium (e.g. 'in_person' | 'video' | 'phone'). Single INSERT,
-- single audit row.

CREATE OR REPLACE FUNCTION public.rpc_schedule_client_meeting(
  p_entity_id            uuid,
  p_organization_id      uuid,
  p_root_organization_id uuid,
  p_subject              text,
  p_notes                text,
  p_scheduled_at         timestamptz,
  p_channel              text
)
RETURNS public.entity_interactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_interaction public.entity_interactions;
  v_diff        jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id é obrigatório' USING ERRCODE = 'not_null_violation';
  END IF;
  IF p_scheduled_at IS NULL THEN
    RAISE EXCEPTION 'Data/hora da reunião é obrigatória' USING ERRCODE = 'not_null_violation';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'clients.edit') THEN
    RAISE EXCEPTION 'Sem permissão para agendar reuniões' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.entity_interactions
    (entity_id, organization_id, root_organization_id, interaction_type, subject, notes,
     next_action_type, next_action_date, next_action_channel, created_by)
  VALUES
    (p_entity_id, p_organization_id, COALESCE(p_root_organization_id, p_organization_id),
     'meeting', nullif(p_subject, ''), nullif(p_notes, ''),
     'meeting', p_scheduled_at, nullif(p_channel, ''), v_actor::text)
  RETURNING * INTO v_interaction;

  v_diff := jsonb_build_object('entity_interactions', jsonb_build_object(
    'id',                 jsonb_build_object('old', NULL, 'new', to_jsonb(v_interaction.id)),
    'interaction_type',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_interaction.interaction_type)),
    'subject',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_interaction.subject)),
    'next_action_date',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_interaction.next_action_date)),
    'next_action_channel',jsonb_build_object('old', NULL, 'new', to_jsonb(v_interaction.next_action_channel))
  ));

  PERFORM public.fn_manual_audit_log(
    'entity_interactions',
    p_entity_id,
    p_organization_id,
    'INSERT',
    v_diff,
    'web_app'
  );

  RETURN v_interaction;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_schedule_client_meeting(
  uuid, uuid, uuid, text, text, timestamptz, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_schedule_client_meeting(
  uuid, uuid, uuid, text, text, timestamptz, text
) TO authenticated;


-- ============================================================
-- BUGS 5, 7, 8 — Frontend-only wiring, no migration action required
-- ============================================================
-- BUG 5 (Contacts "Novo Pedido de Proposta"): Deals.tsx must read
-- newDeal/entityId/entityName from the URL (mirroring its existing
-- create_from_lead handling) and open its create dialog pre-filled with
-- entityType='contact'; on submit it already calls the existing rpc_create_deal
-- (20260730010000), which already emits exactly one consolidated audit row.
-- No new RPC needed.
--
-- BUG 7 (Clients "Criar proposta"): mount the existing ProposalCreateDialog
-- (src/components/proposals/ProposalCreateDialog.tsx), which already accepts
-- presetEntityId and already calls rpc_create_proposal (20260815010000, single
-- audit row). No new RPC needed.
--
-- BUG 8 (Clients "Criar contrato"): mount a form that calls the existing
-- rpc_create_client_contract (20260814010000_client_contracts_audit_bypass_and_rpcs.sql),
-- passing p_client_id/p_entity_id/p_organization_id for the clicked client. No new
-- RPC needed.


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. create_contact_with_role: a manual contact create with email+phone+vat now
--    produces exactly ONE entity_audit_log row keyed on entity_id, whose diff spans
--    anew_entities, anew_entity_emails, anew_entity_phones, fiscal_entities,
--    anew_entity_fiscal_entities, anew_entity_org_links, anew_contacts and
--    anew_entity_roles (only the sub-objects that actually changed).
-- 2. rpc_create_client_manual: given a pre-resolved entity_id, a client create with a
--    full postal address produces exactly ONE row spanning anew_clients,
--    anew_entity_roles, anew_addresses and anew_entity_addresses.
-- 3. rpc_update_client: editing phone AND address in the same call now includes BOTH
--    anew_entity_phones and anew_addresses/anew_entity_addresses in the single diff.
--    Calling with the 4 new params NULL/omitted is 100% behaviorally identical to the
--    prior 12-arg signature (defaults skip the address branch entirely). A first-time
--    address insert with no p_address_number no longer raises not_null_violation
--    (COALESCE(p_address_number, '') satisfies anew_addresses.number NOT NULL).
-- 4. rpc_manage_contact_tag('add', ...) / ('remove', ...) each produce exactly ONE
--    entity_audit_log row keyed on the contact's entity_id; contact_tags direct
--    inserts/deletes from the client are replaced by this RPC in the FE.
-- 5. rpc_toggle_client_vip: toggles anew_clients.custom_fields->>'vip' and produces
--    exactly one UPDATE audit row (skipped entirely when the value does not change).
-- 6. rpc_schedule_client_meeting: inserts one entity_interactions row
--    (interaction_type='meeting') and produces exactly one INSERT audit row.
