-- Fix: create_contact_with_role and rpc_update_contact both do a BLIND
-- INSERT INTO public.fiscal_entities whenever the contact has no fiscal link
-- yet, with no check for an existing row for the same NIF. Before
-- 20261029010000_fiscal_entities_nif_hash_country_unique.sql (which added
-- uq_fiscal_entities_nif_hash_country ON fiscal_entities (nif_hash,
-- country_code) WHERE nif_hash IS NOT NULL) this silently created duplicate
-- fiscal_entities rows for the same NIF (bad, but did not error). Now it
-- errors with "duplicate key value violates unique constraint
-- uq_fiscal_entities_nif_hash_country" (23505) the second time the same NIF
-- shows up — a normal scenario: the same person is a contact in two
-- organizations, or the same NIF is entered again after it was already
-- registered.
--
-- Currently vigent versions being replaced:
--   - public.create_contact_with_role: 20261101040000_fix_create_contact_with_role_fiscal_entities_entity_type.sql
--   - public.rpc_update_contact:       20261024020000_nif_enc_rpc_update_contact.sql
--
-- Fix (forward-only; neither prior migration is edited): make the INSERT
-- self-arbitrating on (nif_hash, country_code), the exact same partial
-- unique index used by resolve_fiscal_entity() (fixed for its own ON
-- CONFLICT target mismatch in 20261101030000):
--
--   INSERT INTO public.fiscal_entities (nif, created_by, nif_encrypted, nif_hash, metadata)
--   VALUES (...)
--   ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL DO UPDATE
--     SET updated_at = now()
--   RETURNING id INTO <var>;
--
-- This mirrors the SAFE pattern already used by the 3 organization RPCs
-- (20261026010000 rpc_create_organization, 20261026020000
-- rpc_update_organization, 20261027010000
-- rpc_create_organization_with_hierarchy), which look up an existing fiscal
-- entity by plaintext nif BEFORE inserting (`IF v_fiscal_entity_id IS NULL
-- THEN ... INSERT`), and by resolve_fiscal_entity() itself, which upserts on
-- the same (nif_hash, country_code) arbiter.
--
-- Why ON CONFLICT arbitrates only when p_nif_hash is supplied: the unique
-- index is PARTIAL (WHERE nif_hash IS NOT NULL). Callers that have not yet
-- migrated to pass p_nif_hash keep sending NULL, so the new row's nif_hash is
-- NULL, the partial index does not index it, and the INSERT can never
-- collide — reproducing the exact previous (always-insert, no dedupe)
-- behavior for those callers byte-for-byte. This is intentional: only
-- callers that already supply p_nif_hash get deduped.
--
-- country_code: neither function passes country_code explicitly in this
-- INSERT, so it takes the column default 'PT' (fiscal_entities.country_code
-- "text" DEFAULT 'PT'::"text" NOT NULL, confirmed in
-- 20260615130000_baseline_new_database.sql). The ON CONFLICT target
-- (nif_hash, country_code) matches that default value exactly, so the
-- arbiter is live for every row this INSERT ever writes.
--
-- Bundled bug fix required to reach the target column list (rpc_update_contact
-- only): rpc_update_contact's "no fiscal link yet" INSERT
-- (20261024020000, Branch A section 4) wrote an "entity_type" column that has
-- NEVER existed on fiscal_entities (same root bug class already fixed for
-- create_contact_with_role in 20261101040000 — see that migration's comment
-- for the full baseline citation). Reaching the ON CONFLICT-compatible column
-- list (nif, created_by, nif_encrypted, nif_hash, metadata) requires touching
-- this same INSERT anyway, so the entity_type value is moved into metadata
-- jsonb here too, using the exact same individual/company mapping the
-- function already computed (CASE WHEN p_entity_type = 'organization' THEN
-- 'company' ELSE 'individual' END) — just written to metadata instead of a
-- nonexistent column, matching resolve_fiscal_entity()'s and
-- create_contact_with_role's convention. No other logic changes.
--
-- Nothing else changes in either function: same signatures (no new/removed/
-- reordered parameters), same DECLAREs, same authorization / anti-tampering /
-- post-mutation reauthorization checks, same branch structure, same v_diff
-- shape, same fn_manual_audit_log calls, same RETURN shape, same
-- SECURITY DEFINER / search_path.
--
-- Self-review
-- -----------
-- - create_contact_with_role(jsonb, text, text, text[]) — signature
--   unchanged, only the fiscal_entities INSERT statement gained an
--   ON CONFLICT clause; every other line is byte-for-byte identical to
--   20261101040000.
-- - rpc_update_contact(21 args, same order as 20261024020000) — signature
--   unchanged, only the "no fiscal link yet" INSERT statement changed
--   (entity_type column -> metadata jsonb, plus ON CONFLICT); every other
--   line (Branch A sections 1-3 and 5-7, Branch B, audit/diff logic,
--   authorization checks) is byte-for-byte identical to 20261024020000. The
--   old 18-arg overload was already DROPped by 20261024020000 and is not
--   recreated here, so no new ambiguity is introduced.
-- - Reapplication safety: CREATE OR REPLACE FUNCTION on both existing
--   signatures is idempotent. Re-running this file is safe.

-- ============================================================
-- 1. create_contact_with_role — upsert on fiscal_entities INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_contact_with_role(
  p_payload jsonb,
  p_nif_encrypted text DEFAULT NULL,
  p_nif_hash text DEFAULT NULL,
  p_nif_tokens text[] DEFAULT NULL
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
      -- Dual-write (Phase 2, additive): populate nif_encrypted/nif_hash alongside the
      -- plaintext nif when the caller supplies them. This is always a brand-new
      -- fiscal_entities row in this code path (v_entity_created_here is always true
      -- when we reach here), so there is no prior value to preserve — NULL defaults
      -- reproduce the exact previous INSERT byte-for-byte.
      --
      -- FIX (20261101040000): fiscal_entities has no entity_type column - it never
      -- did. The individual/company classification goes into metadata jsonb instead,
      -- matching resolve_fiscal_entity()'s convention.
      --
      -- FIX (20261101050000): ON CONFLICT (nif_hash, country_code) WHERE nif_hash
      -- IS NOT NULL — arbitrated by uq_fiscal_entities_nif_hash_country
      -- (20261029010000). Without this, the second contact with the same NIF
      -- (e.g. same person added in a second org, or a NIF re-entered after it
      -- already exists) hit "duplicate key value violates unique constraint"
      -- instead of reusing the existing fiscal_entities row. Only arbitrates
      -- when p_nif_hash is supplied (partial index); callers still passing
      -- p_nif_hash = NULL keep the prior always-insert behavior unchanged.
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
      VALUES (v_entity_id, v_fiscal_entity_id, true, v_actor);

      v_diff := v_diff || jsonb_build_object('fiscal_entities', jsonb_build_object(
        'nif', jsonb_build_object('old', NULL, 'new', to_jsonb(v_vat))
      ));
      v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities', jsonb_build_object(
        'fiscal_entity_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_fiscal_entity_id))
      ));

      -- Dual-write (Phase 2, additive): NIF trigram tokens for tokenized partial-match
      -- search. Brand-new fiscal_entities row → nothing stale to clear, just insert.
      IF p_nif_tokens IS NOT NULL THEN
        INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
        SELECT v_fiscal_entity_id, t
        FROM unnest(p_nif_tokens) AS t
        WHERE t IS NOT NULL
        ON CONFLICT DO NOTHING;
      END IF;
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

-- ============================================================
-- 2. rpc_update_contact — upsert on fiscal_entities INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_contact(
  p_contact_id       uuid,
  p_entity_id        uuid,
  p_display_name     text,
  p_norm_first       text,
  p_norm_last        text,
  p_email            text,
  p_phone            text,
  p_phone_country    text,
  p_vat              text,
  p_position         text,
  p_status           text,
  p_notes            text,
  p_organization_id  text,
  p_assigned_to      uuid,
  p_address          text,
  p_city             text,
  p_postal_code      text,
  p_entity_type      text,
  p_nif_encrypted    text DEFAULT NULL,
  p_nif_hash         text DEFAULT NULL,
  p_nif_tokens       text[] DEFAULT NULL
)
RETURNS public.anew_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_now          timestamptz := now();

  v_before_ct    public.anew_contacts;
  v_ct           public.anew_contacts;

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
  v_tax_before       text;
  v_new_fiscal_id    uuid;

  -- address
  v_addr_link_id     uuid;
  v_addr_id          uuid;
  v_addr_before      public.anew_addresses;
  v_new_addr_id      uuid;
  v_street           text;
  v_postal           text;
  v_city             text;
  v_addr_key         text;

  -- entity role sync
  v_org_for_role     uuid;
  v_role_status_before text;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the frontend) ────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load target contact (before-image + authorization subject) ────────────
  SELECT * INTO v_before_ct FROM public.anew_contacts WHERE id = p_contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contacto não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with anew_contacts_update RLS ────────────────────
  -- has_anew_permission('contacts.edit') AND can_access_contact_row(...) against
  -- the target row (its own org/created_by/assigned_to). Identical to the RLS
  -- USING/WITH CHECK predicate on anew_contacts_update.
  IF NOT public.has_anew_permission(auth.uid(), 'contacts.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar contactos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.can_access_contact_row(
           v_before_ct.organization_id,
           v_before_ct.created_by,
           v_before_ct.assigned_to,
           'contacts.edit') THEN
    RAISE EXCEPTION 'Contacto fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Anti-tampering: p_entity_id must match the target contact's OWN entity_id ─
  -- p_entity_id and p_contact_id are independent parameters supplied by the
  -- caller. Authorizing p_contact_id above says nothing about p_entity_id — a
  -- caller could otherwise pass p_contact_id for a contact they can edit but
  -- p_entity_id pointing at an unrelated entity (any org), letting Branch A
  -- overwrite that entity's identity/email/phone/fiscal/address and its
  -- entity_roles row. anew_contacts.entity_id is fixed per contact, so the only
  -- legitimate value is the one already stored on the authorized row. From here
  -- on, the entity_id actually used is ALWAYS v_before_ct.entity_id — never the
  -- raw p_entity_id parameter.
  IF p_entity_id IS NOT NULL AND p_entity_id IS DISTINCT FROM v_before_ct.entity_id THEN
    RAISE EXCEPTION 'entity_id não corresponde ao contacto' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- BRANCH A: contact HAS an entity_id (the 8-call path)
  -- ══════════════════════════════════════════════════════════════════════════
  IF v_before_ct.entity_id IS NOT NULL THEN

    -- ── 1. anew_entities: display_name / first_name / last_name ─────────────
    SELECT * INTO v_ent_before FROM public.anew_entities WHERE id = v_before_ct.entity_id;

    UPDATE public.anew_entities
    SET display_name = p_display_name,
        first_name   = p_norm_first,
        last_name    = p_norm_last,
        updated_at   = v_now
    WHERE id = v_before_ct.entity_id;

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

    -- ── 2. anew_entity_emails: upsert primary (only when email provided) ────
    IF p_email IS NOT NULL AND p_email <> '' THEN
      SELECT id, email INTO v_email_id, v_email_before
      FROM public.anew_entity_emails
      WHERE entity_id = v_before_ct.entity_id AND is_primary = true
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
          (v_before_ct.entity_id, p_email, true, 'personal', v_actor);
        v_diff := v_diff || jsonb_build_object('anew_entity_emails',
          jsonb_build_object('email',
            jsonb_build_object('old', NULL, 'new', to_jsonb(p_email))));
      END IF;
    END IF;

    -- ── 3. anew_entity_phones: upsert primary (only when phone provided) ────
    IF p_phone IS NOT NULL AND p_phone <> '' THEN
      SELECT id, phone_number, country_code
        INTO v_phone_id, v_phone_before, v_phone_cc_before
      FROM public.anew_entity_phones
      WHERE entity_id = v_before_ct.entity_id AND is_primary = true
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
          (v_before_ct.entity_id, p_phone, p_phone_country, true, 'mobile', v_actor);
        v_diff := v_diff || jsonb_build_object('anew_entity_phones',
          jsonb_build_object(
            'phone_number', jsonb_build_object('old', NULL, 'new', to_jsonb(p_phone)),
            'country_code', jsonb_build_object('old', NULL, 'new', to_jsonb(p_phone_country))
          ));
      END IF;
    END IF;

    -- ── 4. NIF/VAT: fiscal_entities + anew_entity_fiscal_entities ───────────
    IF p_vat IS NOT NULL AND p_vat <> '' THEN
      SELECT id, fiscal_entity_id INTO v_fiscal_link_id, v_fiscal_ent_id
      FROM public.anew_entity_fiscal_entities
      WHERE entity_id = v_before_ct.entity_id AND valid_to IS NULL
      LIMIT 1;

      IF v_fiscal_link_id IS NOT NULL THEN
        -- Real column is `nif` (baseline fiscal_entities.nif). The frontend's
        -- PostgREST call names it `tax_id`, but the authoritative server-side
        -- contact RPCs (20260619100000 / 20260623140000) write `nif` — the actual
        -- VAT/NIF column. We use `nif` so the write is schema-correct and matches
        -- those established RPCs (writing `tax_id` would fail: no such column).
        SELECT nif INTO v_tax_before FROM public.fiscal_entities WHERE id = v_fiscal_ent_id;

        -- Dual-write (Phase 2, additive): COALESCE keeps the PRE-UPDATE column
        -- value whenever the caller does not supply the corresponding new param
        -- (NULL) — a call omitting p_nif_encrypted/p_nif_hash leaves both columns
        -- byte-for-byte untouched, reproducing the previous UPDATE exactly.
        UPDATE public.fiscal_entities
        SET nif = p_vat,
            updated_at = v_now,
            nif_encrypted = COALESCE(p_nif_encrypted, nif_encrypted),
            nif_hash = COALESCE(p_nif_hash, nif_hash)
        WHERE id = v_fiscal_ent_id;
        IF v_tax_before IS DISTINCT FROM p_vat THEN
          v_diff := v_diff || jsonb_build_object('fiscal_entities',
            jsonb_build_object('nif',
              jsonb_build_object('old', to_jsonb(v_tax_before), 'new', to_jsonb(p_vat))));
        END IF;

        -- Dual-write (Phase 2, additive): refresh NIF trigram tokens for this
        -- existing fiscal entity. Clear stale tokens from whatever NIF this row
        -- previously held before inserting the new set.
        IF p_nif_tokens IS NOT NULL THEN
          DELETE FROM public.fiscal_entity_nif_tokens WHERE fiscal_entity_id = v_fiscal_ent_id;
          INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
          SELECT v_fiscal_ent_id, t
          FROM unnest(p_nif_tokens) AS t
          WHERE t IS NOT NULL
          ON CONFLICT DO NOTHING;
        END IF;
      ELSE
        -- entity_type mapping identical to the existing server RPCs:
        -- 'person' → 'individual', otherwise 'company'. The FE passes 'organization'
        -- for companies; anything else (incl. 'person') maps to 'individual'.
        -- Dual-write (Phase 2, additive): brand-new row → no prior value to
        -- preserve, so p_nif_encrypted/p_nif_hash are added straight to the
        -- INSERT's column list (NULL defaults reproduce the prior INSERT exactly).
        --
        -- FIX (20261101050000, bundled): fiscal_entities has no entity_type
        -- column — it never did (same pre-existing bug already fixed for
        -- create_contact_with_role in 20261101040000; this INSERT had it too,
        -- undetected until now). The individual/company classification goes
        -- into metadata jsonb instead of the nonexistent column, matching
        -- resolve_fiscal_entity()'s and create_contact_with_role's convention.
        --
        -- FIX (20261101050000): ON CONFLICT (nif_hash, country_code) WHERE
        -- nif_hash IS NOT NULL — arbitrated by uq_fiscal_entities_nif_hash_country
        -- (20261029010000). Without this, updating a contact to a NIF that
        -- already exists on another fiscal_entities row (e.g. the same NIF now
        -- shared across two org contacts) hit "duplicate key value violates
        -- unique constraint" instead of linking to the existing row. Only
        -- arbitrates when p_nif_hash is supplied (partial index); callers still
        -- passing p_nif_hash = NULL keep the prior always-insert behavior
        -- unchanged.
        INSERT INTO public.fiscal_entities (nif, created_by, nif_encrypted, nif_hash, metadata)
        VALUES (p_vat,
                v_actor, p_nif_encrypted, p_nif_hash,
                jsonb_build_object('entity_type', CASE WHEN p_entity_type = 'organization' THEN 'company' ELSE 'individual' END))
        ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL DO UPDATE
          SET updated_at = now()
        RETURNING id INTO v_new_fiscal_id;

        IF v_new_fiscal_id IS NOT NULL THEN
          INSERT INTO public.anew_entity_fiscal_entities
            (entity_id, fiscal_entity_id, is_primary, created_by)
          VALUES
            (v_before_ct.entity_id, v_new_fiscal_id, true, v_actor);
        END IF;

        v_diff := v_diff || jsonb_build_object('fiscal_entities',
          jsonb_build_object('nif',
            jsonb_build_object('old', NULL, 'new', to_jsonb(p_vat))));
        v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities',
          jsonb_build_object('fiscal_entity_id',
            jsonb_build_object('old', NULL, 'new', to_jsonb(v_new_fiscal_id))));

        -- Dual-write (Phase 2, additive): brand-new fiscal entity → nothing stale
        -- to clear, just insert.
        IF v_new_fiscal_id IS NOT NULL AND p_nif_tokens IS NOT NULL THEN
          INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
          SELECT v_new_fiscal_id, t
          FROM unnest(p_nif_tokens) AS t
          WHERE t IS NOT NULL
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END IF;

    -- ── 5. Address: anew_addresses + anew_entity_addresses (primary) ────────
    -- Runs only when any address field is provided (matches the FE condition).
    IF (p_address IS NOT NULL AND p_address <> '')
       OR (p_city IS NOT NULL AND p_city <> '')
       OR (p_postal_code IS NOT NULL AND p_postal_code <> '') THEN

      v_street := COALESCE(p_address, '');
      v_postal := COALESCE(p_postal_code, '');
      v_city   := COALESCE(p_city, '');
      -- address_key: `${street}-${postal}-${city}`.toLowerCase().replace(/\s+/g,'-')
      v_addr_key := regexp_replace(lower(v_street || '-' || v_postal || '-' || v_city), '\s+', '-', 'g');

      SELECT id, address_id INTO v_addr_link_id, v_addr_id
      FROM public.anew_entity_addresses
      WHERE entity_id = v_before_ct.entity_id AND is_primary = true AND valid_to IS NULL
      LIMIT 1;

      IF v_addr_link_id IS NOT NULL THEN
        SELECT * INTO v_addr_before FROM public.anew_addresses WHERE id = v_addr_id;

        UPDATE public.anew_addresses
        SET street      = v_street,
            number      = '',
            city        = v_city,
            postal_code = v_postal,
            country     = 'PT',
            address_key = v_addr_key,
            updated_at  = v_now
        WHERE id = v_addr_id;

        v_sub := '{}'::jsonb;
        IF v_addr_before.street IS DISTINCT FROM v_street THEN
          v_sub := v_sub || jsonb_build_object('street',
            jsonb_build_object('old', to_jsonb(v_addr_before.street), 'new', to_jsonb(v_street)));
        END IF;
        IF v_addr_before.city IS DISTINCT FROM v_city THEN
          v_sub := v_sub || jsonb_build_object('city',
            jsonb_build_object('old', to_jsonb(v_addr_before.city), 'new', to_jsonb(v_city)));
        END IF;
        IF v_addr_before.postal_code IS DISTINCT FROM v_postal THEN
          v_sub := v_sub || jsonb_build_object('postal_code',
            jsonb_build_object('old', to_jsonb(v_addr_before.postal_code), 'new', to_jsonb(v_postal)));
        END IF;
        IF v_sub <> '{}'::jsonb THEN
          v_diff := v_diff || jsonb_build_object('anew_addresses', v_sub);
        END IF;
      ELSE
        v_new_addr_id := gen_random_uuid();
        INSERT INTO public.anew_addresses
          (id, street, number, city, postal_code, country, address_key, updated_at, created_by)
        VALUES
          (v_new_addr_id, v_street, '', v_city, v_postal, 'PT', v_addr_key, v_now, v_actor);

        INSERT INTO public.anew_entity_addresses
          (entity_id, address_id, is_primary, address_type, created_by)
        VALUES
          (v_before_ct.entity_id, v_new_addr_id, true, 'main', v_actor);

        v_diff := v_diff || jsonb_build_object('anew_addresses',
          jsonb_build_object(
            'street',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_street)),
            'city',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_city)),
            'postal_code', jsonb_build_object('old', NULL, 'new', to_jsonb(v_postal))
          ));
        v_diff := v_diff || jsonb_build_object('anew_entity_addresses',
          jsonb_build_object('address_id',
            jsonb_build_object('old', NULL, 'new', to_jsonb(v_new_addr_id))));
      END IF;
    END IF;

    -- ── 6. anew_contacts: status / notes / position / assigned_to ───────────
    UPDATE public.anew_contacts
    SET status      = p_status,
        notes       = nullif(p_notes, ''),
        position    = nullif(p_position, ''),
        assigned_to = p_assigned_to,
        updated_at  = v_now
    WHERE id = p_contact_id
    RETURNING * INTO v_ct;

    -- ── Post-mutation reauthorization (mirrors anew_contacts_update WITH CHECK) ─
    -- RLS reevaluates WITH CHECK against the AFTER-image on every real UPDATE. A
    -- SECURITY DEFINER function does not, so we replicate it explicitly here:
    -- re-check can_access_contact_row against the row AS WRITTEN (its new
    -- assigned_to). This prevents reassigning a contact this user can edit to an
    -- owner/team outside their scope — exactly what the WITH CHECK would block.
    IF NOT public.can_access_contact_row(
             v_ct.organization_id,
             v_ct.created_by,
             v_ct.assigned_to,
             'contacts.edit') THEN
      RAISE EXCEPTION 'Alteração fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_sub := '{}'::jsonb;
    IF v_before_ct.status IS DISTINCT FROM v_ct.status THEN
      v_sub := v_sub || jsonb_build_object('status',
        jsonb_build_object('old', to_jsonb(v_before_ct.status), 'new', to_jsonb(v_ct.status)));
    END IF;
    IF v_before_ct.notes IS DISTINCT FROM v_ct.notes THEN
      v_sub := v_sub || jsonb_build_object('notes',
        jsonb_build_object('old', to_jsonb(v_before_ct.notes), 'new', to_jsonb(v_ct.notes)));
    END IF;
    IF v_before_ct.position IS DISTINCT FROM v_ct.position THEN
      v_sub := v_sub || jsonb_build_object('position',
        jsonb_build_object('old', to_jsonb(v_before_ct.position), 'new', to_jsonb(v_ct.position)));
    END IF;
    IF v_before_ct.assigned_to IS DISTINCT FROM v_ct.assigned_to THEN
      v_sub := v_sub || jsonb_build_object('assigned_to',
        jsonb_build_object('old', to_jsonb(v_before_ct.assigned_to), 'new', to_jsonb(v_ct.assigned_to)));
    END IF;
    IF v_sub <> '{}'::jsonb THEN
      v_diff := v_diff || jsonb_build_object('anew_contacts', v_sub);
    END IF;

    -- ── 7. anew_entity_roles: sync status for role='contact' in the org ─────
    -- FE: orgId = contact.root_organization_id || contact.organization_id, then
    -- UPDATE ... WHERE entity_id AND role='contact' AND organization_id = orgId.
    v_org_for_role := COALESCE(v_before_ct.root_organization_id, v_before_ct.organization_id);
    IF v_org_for_role IS NOT NULL THEN
      SELECT status INTO v_role_status_before
      FROM public.anew_entity_roles
      WHERE entity_id = v_before_ct.entity_id AND role = 'contact' AND organization_id = v_org_for_role
      LIMIT 1;

      UPDATE public.anew_entity_roles
      SET status = p_status, updated_at = v_now
      WHERE entity_id = v_before_ct.entity_id AND role = 'contact' AND organization_id = v_org_for_role;

      IF FOUND AND v_role_status_before IS DISTINCT FROM p_status THEN
        v_diff := v_diff || jsonb_build_object('anew_entity_roles',
          jsonb_build_object('status',
            jsonb_build_object('old', to_jsonb(v_role_status_before), 'new', to_jsonb(p_status))));
      END IF;
    END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- BRANCH B: no entity_id (legacy fallback — single anew_contacts UPDATE)
  -- ══════════════════════════════════════════════════════════════════════════
  ELSE
    -- ── Reassignment scope guard (mirrors the INSERT/UPDATE RLS org restriction) ─
    -- Branch B can move the contact to p_organization_id (a caller-controlled
    -- parameter). PostgREST would never let a user move a row to an org outside
    -- their visible scope (anew_contacts_insert requires
    -- organization_id IN get_user_visible_org_ids, and the UPDATE WITH CHECK
    -- re-runs can_access_contact_row against the new org). We replicate the org
    -- gate here: when a target org is supplied, it must be visible to the caller.
    IF nullif(p_organization_id, '') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.get_user_visible_org_ids(auth.uid()) AS g(id)
        WHERE g.id = nullif(p_organization_id, '')::uuid
      ) THEN
        RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    UPDATE public.anew_contacts
    SET position        = nullif(p_position, ''),
        status          = p_status,
        notes           = nullif(p_notes, ''),
        organization_id = nullif(p_organization_id, '')::uuid,
        assigned_to     = p_assigned_to,
        updated_at      = v_now
    WHERE id = p_contact_id
    RETURNING * INTO v_ct;

    -- ── Post-mutation reauthorization (mirrors anew_contacts_update WITH CHECK) ─
    -- Re-check the row AS WRITTEN (new organization_id / assigned_to) against the
    -- caller's scope, exactly as RLS WITH CHECK would after a PostgREST UPDATE.
    IF NOT public.can_access_contact_row(
             v_ct.organization_id,
             v_ct.created_by,
             v_ct.assigned_to,
             'contacts.edit') THEN
      RAISE EXCEPTION 'Alteração fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_sub := '{}'::jsonb;
    IF v_before_ct.position IS DISTINCT FROM v_ct.position THEN
      v_sub := v_sub || jsonb_build_object('position',
        jsonb_build_object('old', to_jsonb(v_before_ct.position), 'new', to_jsonb(v_ct.position)));
    END IF;
    IF v_before_ct.status IS DISTINCT FROM v_ct.status THEN
      v_sub := v_sub || jsonb_build_object('status',
        jsonb_build_object('old', to_jsonb(v_before_ct.status), 'new', to_jsonb(v_ct.status)));
    END IF;
    IF v_before_ct.notes IS DISTINCT FROM v_ct.notes THEN
      v_sub := v_sub || jsonb_build_object('notes',
        jsonb_build_object('old', to_jsonb(v_before_ct.notes), 'new', to_jsonb(v_ct.notes)));
    END IF;
    IF v_before_ct.organization_id IS DISTINCT FROM v_ct.organization_id THEN
      v_sub := v_sub || jsonb_build_object('organization_id',
        jsonb_build_object('old', to_jsonb(v_before_ct.organization_id), 'new', to_jsonb(v_ct.organization_id)));
    END IF;
    IF v_before_ct.assigned_to IS DISTINCT FROM v_ct.assigned_to THEN
      v_sub := v_sub || jsonb_build_object('assigned_to',
        jsonb_build_object('old', to_jsonb(v_before_ct.assigned_to), 'new', to_jsonb(v_ct.assigned_to)));
    END IF;
    IF v_sub <> '{}'::jsonb THEN
      v_diff := v_diff || jsonb_build_object('anew_contacts', v_sub);
    END IF;
  END IF;

  -- ── Resolve audit org + entity, then emit ONE consolidated audit row ──────
  -- The generic trigger resolves org for anew_contacts directly from the row's
  -- organization_id; we replicate that, falling back to root_organization_id.
  v_audit_org := COALESCE(v_ct.organization_id, v_ct.root_organization_id,
                          v_before_ct.organization_id, v_before_ct.root_organization_id);

  -- Emit only when something meaningful changed, matching the "skip on no-op"
  -- behavior of the triggers. entity_id is the shared identity (anew_entities.id)
  -- when present, else the contact id — the stable key for this contact's history.
  IF v_diff <> '{}'::jsonb AND v_audit_org IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'anew_contacts',
      COALESCE(v_before_ct.entity_id, p_contact_id),
      v_audit_org,
      'UPDATE',
      v_diff,
      'web_app'
    );
  END IF;

  RETURN v_ct;
END;
$$;
