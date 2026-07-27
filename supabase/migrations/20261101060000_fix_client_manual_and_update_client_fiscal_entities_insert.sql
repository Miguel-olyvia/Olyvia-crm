-- Fix: rpc_create_client_manual and rpc_update_client both do a BLIND
-- INSERT INTO public.fiscal_entities in their "brand-new fiscal entity"
-- branch, with no find-or-create semantics. Before
-- 20261029010000_fiscal_entities_nif_hash_country_unique.sql added
-- uq_fiscal_entities_nif_hash_country (partial UNIQUE on
-- (nif_hash, country_code) WHERE nif_hash IS NOT NULL) this silently created
-- duplicate fiscal_entities rows for the same NIF (bad, but did not error).
-- Now it errors with "duplicate key value violates unique constraint
-- uq_fiscal_entities_nif_hash_country" the second time the same NIF is seen
-- (e.g. the same person becoming a client in a second organization) — a
-- normal, expected scenario, not a real conflict.
--
-- Fix: give both INSERTs the same atomic find-or-create shape already used
-- by resolve_fiscal_entity() (20261029010000, ON-CONFLICT target fixed in
-- 20261101030000) and by the 3 organization RPCs
-- (20261026010000/20261026020000/20261027010000):
--   INSERT ... ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL
--     DO UPDATE SET updated_at = now()
--   RETURNING id INTO v_fiscal_entity_id;
-- This only arbitrates when the caller supplies p_nif_hash (already-migrated
-- callers). Legacy callers that omit it (p_nif_hash IS NULL) never hit the
-- partial index, so the INSERT never conflicts and behaves exactly as before
-- this migration — intentional, not a gap being left open.
--
-- Second, unrelated bug found and fixed in the same pass while reproducing
-- rpc_create_client_manual's fiscal_entities INSERT verbatim: it targets an
-- "entity_type" column that has NEVER existed on public.fiscal_entities
-- (confirmed against the baseline CREATE TABLE,
-- 20260615130000_baseline_new_database.sql ~line 9792: fiscal_entities has
-- id/nif/country_code/commercial_name/legal_name/is_verified/verified_at/
-- verified_by/metadata/created_by/created_at/updated_at — no entity_type
-- column). This is the exact same pre-existing bug already found and fixed
-- in create_contact_with_role by 20261101040000_fix_create_contact_with_role_fiscal_entities_entity_type.sql;
-- rpc_create_client_manual has carried the identical INSERT, and therefore
-- the identical bug, since 20260903010000_rpc_create_client_manual_entity_creation.sql
-- introduced it. Fixed the same way: the individual/company classification
-- moves into fiscal_entities.metadata jsonb instead of a nonexistent column,
-- matching resolve_fiscal_entity()'s and create_contact_with_role's
-- convention. rpc_update_client's own fiscal_entities INSERT never
-- referenced entity_type, so it only needed the ON CONFLICT fix.
--
-- Base signature/body carried forward verbatim from the currently live
-- definitions:
--   · rpc_create_client_manual: 20261025010000_nif_enc_rpc_create_client_manual.sql
--     (no later migration has touched this function). Only the
--     `IF v_vat IS NOT NULL THEN ... INSERT INTO public.fiscal_entities (...)`
--     statement changes (drop entity_type, add metadata, add ON CONFLICT);
--     every other line, including the rest of that same IF block (the
--     anew_entity_fiscal_entities INSERT, the token fan-out loop, and the
--     audit diff), is byte-identical.
--   · rpc_update_client: 20261025020000_nif_enc_rpc_update_client.sql (no
--     later migration has touched this function). Only the `ELSE` branch's
--     `INSERT INTO public.fiscal_entities (...)` statement in section 5
--     (NIF/VAT) gains the ON CONFLICT clause; every other line, including
--     rpc_toggle_client_vip (untouched, not redefined here), is
--     byte-identical.
--
-- Neither function's signature changes — both CREATE OR REPLACE the exact
-- same 21-arg / 19-arg overload already live, so no DROP FUNCTION / REGRANT
-- is needed (existing REVOKE/GRANT on these signatures already stand).

-- ============================================================
-- 1. rpc_create_client_manual
-- ============================================================

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
  p_address_district      text,
  p_display_name          text DEFAULT NULL,
  p_first_name            text DEFAULT NULL,
  p_last_name             text DEFAULT NULL,
  p_email                 text DEFAULT NULL,
  p_phone                 text DEFAULT NULL,
  p_phone_country_code    text DEFAULT NULL,
  p_vat                   text DEFAULT NULL,
  p_nif_encrypted         text DEFAULT NULL,
  p_nif_hash              text DEFAULT NULL,
  p_nif_tokens            text[] DEFAULT NULL
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
  v_entity_type   text;
  v_email         text;
  v_phone         text;
  v_vat           text;
  v_fiscal_entity_id uuid;
  v_nif_token     text;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'clients.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar clientes' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── 0. Create the entity itself when none was resolved (mirrors
  --      create_contact_with_role's entity-creation branch, 20260902010000) ─────
  IF p_entity_id IS NULL THEN
    IF p_display_name IS NULL OR BTRIM(p_display_name) = '' THEN
      RAISE EXCEPTION 'displayName is required to create a new entity';
    END IF;

    v_entity_type := 'person';
    v_email := NULLIF(BTRIM(COALESCE(p_email, '')), '');
    v_phone := NULLIF(BTRIM(COALESCE(p_phone, '')), '');
    v_vat := NULLIF(BTRIM(COALESCE(p_vat, '')), '');

    INSERT INTO public.anew_entities (
      type,
      display_name,
      created_by,
      first_name,
      last_name
    )
    VALUES (
      v_entity_type,
      p_display_name,
      v_actor,
      p_first_name,
      p_last_name
    )
    RETURNING id INTO p_entity_id;

    v_diff := v_diff || jsonb_build_object('anew_entities', jsonb_build_object(
      'id',           jsonb_build_object('old', NULL, 'new', to_jsonb(p_entity_id)),
      'type',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_entity_type)),
      'display_name', jsonb_build_object('old', NULL, 'new', to_jsonb(p_display_name)),
      'first_name',   jsonb_build_object('old', NULL, 'new', to_jsonb(p_first_name)),
      'last_name',    jsonb_build_object('old', NULL, 'new', to_jsonb(p_last_name))
    ));

    IF v_email IS NOT NULL THEN
      INSERT INTO public.anew_entity_emails (entity_id, email, is_primary, created_by)
      VALUES (p_entity_id, v_email, true, v_actor);

      v_diff := v_diff || jsonb_build_object('anew_entity_emails', jsonb_build_object(
        'email',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_email)),
        'is_primary', jsonb_build_object('old', NULL, 'new', to_jsonb(true))
      ));
    END IF;

    IF v_phone IS NOT NULL THEN
      INSERT INTO public.anew_entity_phones (entity_id, phone_number, country_code, phone_type, is_primary, created_by)
      VALUES (p_entity_id, v_phone, COALESCE(p_phone_country_code, '+351'), 'work', true, v_actor);

      v_diff := v_diff || jsonb_build_object('anew_entity_phones', jsonb_build_object(
        'phone_number', jsonb_build_object('old', NULL, 'new', to_jsonb(v_phone)),
        'country_code', jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_phone_country_code, '+351'))),
        'is_primary',   jsonb_build_object('old', NULL, 'new', to_jsonb(true))
      ));
    END IF;

    IF v_vat IS NOT NULL THEN
      -- FIX (20261101050000): two bugs fixed in this single statement:
      --   1) fiscal_entities has no "entity_type" column (never did — see
      --      the baseline CREATE TABLE). The individual/company
      --      classification now goes into metadata jsonb instead, matching
      --      resolve_fiscal_entity()'s and create_contact_with_role's
      --      convention.
      --   2) blind INSERT → atomic find-or-create via
      --      ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL,
      --      so a NIF that already has a fiscal_entities row (e.g. the same
      --      person becoming a client in a second organization) resolves to
      --      the existing row instead of violating
      --      uq_fiscal_entities_nif_hash_country. Only arbitrates when
      --      p_nif_hash is supplied; legacy callers (p_nif_hash NULL) never
      --      hit the partial index and keep the exact prior behavior.
      INSERT INTO public.fiscal_entities (nif, created_by, nif_encrypted, nif_hash, metadata)
      VALUES (
        v_vat,
        v_actor,
        p_nif_encrypted,
        p_nif_hash,
        jsonb_build_object('entity_type', CASE WHEN v_entity_type = 'person' THEN 'individual' ELSE 'company' END)
      )
      ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL DO UPDATE
        SET updated_at = now()
      RETURNING id INTO v_fiscal_entity_id;

      INSERT INTO public.anew_entity_fiscal_entities (entity_id, fiscal_entity_id, is_primary, created_by)
      VALUES (p_entity_id, v_fiscal_entity_id, true, v_actor);

      IF p_nif_tokens IS NOT NULL THEN
        FOREACH v_nif_token IN ARRAY p_nif_tokens LOOP
          INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
          VALUES (v_fiscal_entity_id, v_nif_token)
          ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;

      v_diff := v_diff || jsonb_build_object('fiscal_entities', jsonb_build_object(
        'nif', jsonb_build_object('old', NULL, 'new', to_jsonb(v_vat))
      ));
      v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities', jsonb_build_object(
        'fiscal_entity_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_fiscal_entity_id))
      ));
    END IF;
  END IF;

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Entidade obrigatória para criar cliente' USING ERRCODE = 'not_null_violation';
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

-- ============================================================
-- 2. rpc_update_client
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_client(p_client_id uuid, p_entity_id uuid, p_display_name text, p_norm_first text, p_norm_last text, p_email text, p_phone text, p_phone_country text, p_vat text, p_status text, p_notes text, p_assigned_to uuid, p_address_street text DEFAULT NULL::text, p_address_city text DEFAULT NULL::text, p_address_postal_code text DEFAULT NULL::text, p_address_number text DEFAULT NULL::text, p_nif_encrypted text DEFAULT NULL, p_nif_hash text DEFAULT NULL, p_nif_tokens text[] DEFAULT NULL)
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
  v_nif_token        text;

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
      SET nif = p_vat,
          nif_encrypted = COALESCE(p_nif_encrypted, nif_encrypted),
          nif_hash = COALESCE(p_nif_hash, nif_hash),
          updated_at = v_now
      WHERE id = v_fiscal_ent_id;
      IF v_nif_before IS DISTINCT FROM p_vat THEN
        v_diff := v_diff || jsonb_build_object('fiscal_entities',
          jsonb_build_object('nif',
            jsonb_build_object('old', to_jsonb(v_nif_before), 'new', to_jsonb(p_vat))));
      END IF;

      IF p_nif_tokens IS NOT NULL THEN
        DELETE FROM public.fiscal_entity_nif_tokens WHERE fiscal_entity_id = v_fiscal_ent_id;
        FOREACH v_nif_token IN ARRAY p_nif_tokens LOOP
          INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
          VALUES (v_fiscal_ent_id, v_nif_token)
          ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;
    ELSE
      -- FIX (20261101050000): blind INSERT → atomic find-or-create via
      -- ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL, so a
      -- NIF that already has a fiscal_entities row (e.g. the same person
      -- becoming a client in a second organization) resolves to the existing
      -- row instead of violating uq_fiscal_entities_nif_hash_country. Only
      -- arbitrates when p_nif_hash is supplied; legacy callers (p_nif_hash
      -- NULL) never hit the partial index and keep the exact prior behavior.
      -- (This INSERT never referenced a nonexistent "entity_type" column —
      -- unlike rpc_create_client_manual's — so no column fix is needed here.)
      INSERT INTO public.fiscal_entities (nif, country_code, created_by, nif_encrypted, nif_hash)
      VALUES (p_vat, 'PT', v_actor, p_nif_encrypted, p_nif_hash)
      ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL DO UPDATE
        SET updated_at = now()
      RETURNING id INTO v_new_fiscal_id;

      IF v_new_fiscal_id IS NOT NULL THEN
        INSERT INTO public.anew_entity_fiscal_entities
          (entity_id, fiscal_entity_id, is_primary, created_by)
        VALUES
          (v_before_cl.entity_id, v_new_fiscal_id, true, v_actor);

        IF p_nif_tokens IS NOT NULL THEN
          FOREACH v_nif_token IN ARRAY p_nif_tokens LOOP
            INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
            VALUES (v_new_fiscal_id, v_nif_token)
            ON CONFLICT DO NOTHING;
          END LOOP;
        END IF;
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
