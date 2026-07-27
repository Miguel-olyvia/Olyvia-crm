-- Bug fix (E2E test, org "Nike"): creating a new User via "New User"
-- (src/pages/UsersNew.tsx) with only a phone filled in wrote that phone to
-- anew_users.phone but NEVER inserted the corresponding row into
-- anew_entity_phones — unlike the primary email, which the entity-creation
-- branch below already inserts into anew_entity_emails as is_primary = true.
--
-- Consequence (real data loss, same class as the NIF bug fixed in
-- 20261103040000): reopening that user for edit loads formPhones from
-- anew_entity_phones only, so it comes back EMPTY despite anew_users.phone
-- having a value. If an admin saves that edit form without manually
-- re-adding the phone, rpc_update_user receives p_phones = [], computes
-- p_phone = null from the (empty) form state, and silently overwrites the
-- previously-set anew_users.phone with NULL.
--
-- Root-cause fix: rpc_finalize_user_profile_full's entity-creation branch
-- (step 2) now also inserts the primary phone into anew_entity_phones,
-- is_primary = true, mirroring exactly how the primary email is already
-- handled a few lines above it. Only runs when p_phone is non-blank, exactly
-- like the anew_users.phone column itself is only ever set when a phone was
-- supplied (create-user/index.ts passes p_phone: phone || null).
--
-- No other statement, validation, authorization gate, signature, or grant
-- changes. Same 19-arg overload as 20261101070000 (last full redefinition of
-- this function); CREATE OR REPLACE keeps its existing grants intact.

CREATE OR REPLACE FUNCTION public.rpc_finalize_user_profile_full(
  p_auth_user_id        uuid,
  p_actor_id            uuid,
  p_name                text,
  p_email               text,
  p_phone               text,
  p_status              text,
  p_description         text,
  p_position            text,
  p_location            text,
  p_template_id         uuid,
  p_custom_attributes   jsonb,
  p_memberships         jsonb DEFAULT '[]'::jsonb,
  p_fiscal              jsonb DEFAULT NULL,
  p_addresses           jsonb DEFAULT '[]'::jsonb,
  p_additional_emails   jsonb DEFAULT '[]'::jsonb,
  p_additional_phones   jsonb DEFAULT '[]'::jsonb,
  p_nif_encrypted       text DEFAULT NULL,
  p_nif_hash            text DEFAULT NULL,
  p_nif_tokens          text[] DEFAULT NULL
)
RETURNS public.anew_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old               public.anew_users;
  v_new               public.anew_users;
  v_org_id            uuid;
  v_diff              jsonb := '{}'::jsonb;
  v_users_diff        jsonb := '{}'::jsonb;
  v_entities_diff     jsonb := '{}'::jsonb;
  v_emails_diff       jsonb := '{}'::jsonb;
  v_memberships_diff  jsonb := '{}'::jsonb;
  v_fiscal_diff       jsonb := '{}'::jsonb;
  v_addresses_diff    jsonb := '{}'::jsonb;
  v_phones_diff       jsonb := '{}'::jsonb;
  v_is_insert         boolean;
  v_entity_id         uuid;
  v_entity_created    boolean := false;
  v_name_parts        text[];
  v_first_name        text;
  v_last_name         text;
  v_email_id          uuid;
  v_phone_id          uuid;
  v_membership        jsonb;
  v_existing_member   uuid;
  v_membership_id     uuid;
  v_membership_org    uuid;
  v_membership_role   uuid;
  v_role_code         text;
  v_fiscal_entity_id  uuid;
  v_fiscal_row_existed boolean;
  v_addr              jsonb;
  v_new_addr_id       uuid;
  v_extra_email       jsonb;
  v_extra_phone       jsonb;
  v_actor_auth_uid    uuid;
  v_actor_is_sysadmin boolean;
  v_visible_orgs      uuid[];
  v_org_link_first    boolean;
  v_nif_token         text;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Actor is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_user_id is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Resolve the actor's auth_user_id once — needed both for the existing
  -- permission check and for the org-visibility / role-escalation gates below.
  -- There is no session here (SECURITY DEFINER, called by the service-role
  -- client), so auth.uid() is unusable; everything must be derived from
  -- p_actor_id, same as rpc_update_user derives it from current_business_user_id().
  SELECT au.auth_user_id INTO v_actor_auth_uid
  FROM public.anew_users au
  WHERE au.id = p_actor_id;

  -- Defense-in-depth, same rule as rpc_finalize_user_profile: this RPC is
  -- SECURITY DEFINER and bypasses RLS entirely. Only the create-user Edge
  -- Function's service-role client should call it (no `authenticated` grant
  -- below); this guards against a forged p_actor_id even if that ever changes.
  IF v_actor_auth_uid IS NULL OR NOT public.has_anew_permission(v_actor_auth_uid, 'users.create') THEN
    RAISE EXCEPTION 'Actor não tem permissão para criar utilizadores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Membership scope gates (mirrors the anew_memberships_insert RLS policy
  -- this SECURITY DEFINER function bypasses, and the same pattern rpc_update_user
  -- applies at 20260720010000 ~lines 370-373/550/582) ──────────────────────────
  -- 1. Org-visibility: the actor may only grant memberships in orgs they can see.
  -- 2. Role-escalation: only a system_admin actor may assign a system_admin or
  --    org_admin role to the new user; anyone else may only assign non-admin roles.
  --    super_admin is a tenant-scoped role and must NOT be treated as equivalent
  --    to system_admin here — otherwise a super_admin of one org could mint a
  --    brand-new globally-scoped system_admin user.
  -- Both gates fail CLOSED (raise, not skip) so a request touching an out-of-scope
  -- row is rejected outright rather than silently partially applied.
  SELECT COALESCE(array_agg(o), ARRAY[]::uuid[])
  INTO   v_visible_orgs
  FROM   public.get_user_visible_org_ids(v_actor_auth_uid) AS o;

  -- Inline role-code check (NOT public.is_system_admin(), which only matches
  -- 'system_admin' as of 20260622114000 — see NOTE above the function header).
  SELECT EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
    JOIN public.anew_roles ar ON ar.id = am.role_id
    WHERE au.auth_user_id = v_actor_auth_uid
      AND ar.code = 'system_admin'
  ) INTO v_actor_is_sysadmin;

  IF jsonb_typeof(p_memberships) = 'array' THEN
    FOR v_membership IN SELECT * FROM jsonb_array_elements(p_memberships)
    LOOP
      IF v_membership->>'organization_id' IS NULL OR v_membership->>'role_id' IS NULL THEN
        CONTINUE;
      END IF;

      v_membership_org  := (v_membership->>'organization_id')::uuid;
      v_membership_role := (v_membership->>'role_id')::uuid;

      IF NOT (v_membership_org = ANY(v_visible_orgs)) THEN
        RAISE EXCEPTION 'Associação fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF NOT v_actor_is_sysadmin THEN
        SELECT ar.code INTO v_role_code
        FROM public.anew_roles ar
        WHERE ar.id = v_membership_role;

        IF v_role_code IN ('system_admin', 'org_admin') THEN
          RAISE EXCEPTION 'Sem permissão para atribuir este perfil' USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Consolidate this ENTIRE create-user action (anew_users + every optional
  -- related-table write below) into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── 1. anew_users upsert (identical semantics to rpc_finalize_user_profile) ──
  SELECT * INTO v_old
  FROM public.anew_users
  WHERE auth_user_id = p_auth_user_id
  FOR UPDATE;
  v_is_insert := NOT FOUND;

  INSERT INTO public.anew_users AS u (
    auth_user_id, name, email, phone, status,
    description, position, location, template_id, custom_attributes,
    created_by
  )
  VALUES (
    p_auth_user_id, p_name, p_email, p_phone, COALESCE(p_status, 'active'),
    p_description, p_position, p_location, p_template_id, p_custom_attributes,
    p_actor_id
  )
  ON CONFLICT (auth_user_id) DO UPDATE
  SET
    name              = EXCLUDED.name,
    email             = EXCLUDED.email,
    phone             = EXCLUDED.phone,
    status            = COALESCE(EXCLUDED.status, u.status),
    description       = EXCLUDED.description,
    position          = EXCLUDED.position,
    location          = EXCLUDED.location,
    template_id       = EXCLUDED.template_id,
    custom_attributes = EXCLUDED.custom_attributes
  RETURNING u.* INTO v_new;

  -- BUG 1 FIX (20260923010000): build v_users_diff with the SAME
  -- {field: {old, new}} shape on BOTH the INSERT and UPDATE paths.
  IF v_is_insert THEN
    v_users_diff := jsonb_build_object('name',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_new.name)))
                 || jsonb_build_object('email',             jsonb_build_object('old', NULL, 'new', to_jsonb(v_new.email)))
                 || jsonb_build_object('phone',             jsonb_build_object('old', NULL, 'new', to_jsonb(v_new.phone)))
                 || jsonb_build_object('status',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_new.status)))
                 || jsonb_build_object('description',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_new.description)))
                 || jsonb_build_object('position',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_new.position)))
                 || jsonb_build_object('location',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_new.location)))
                 || jsonb_build_object('template_id',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_new.template_id)))
                 || jsonb_build_object('custom_attributes', jsonb_build_object('old', NULL, 'new', v_new.custom_attributes));
  ELSE
    IF v_old.name IS DISTINCT FROM v_new.name THEN
      v_users_diff := v_users_diff || jsonb_build_object('name', jsonb_build_object('old', to_jsonb(v_old.name), 'new', to_jsonb(v_new.name)));
    END IF;
    IF v_old.email IS DISTINCT FROM v_new.email THEN
      v_users_diff := v_users_diff || jsonb_build_object('email', jsonb_build_object('old', to_jsonb(v_old.email), 'new', to_jsonb(v_new.email)));
    END IF;
    IF v_old.phone IS DISTINCT FROM v_new.phone THEN
      v_users_diff := v_users_diff || jsonb_build_object('phone', jsonb_build_object('old', to_jsonb(v_old.phone), 'new', to_jsonb(v_new.phone)));
    END IF;
    IF v_old.status IS DISTINCT FROM v_new.status THEN
      v_users_diff := v_users_diff || jsonb_build_object('status', jsonb_build_object('old', to_jsonb(v_old.status), 'new', to_jsonb(v_new.status)));
    END IF;
    IF v_old.description IS DISTINCT FROM v_new.description THEN
      v_users_diff := v_users_diff || jsonb_build_object('description', jsonb_build_object('old', to_jsonb(v_old.description), 'new', to_jsonb(v_new.description)));
    END IF;
    IF v_old.position IS DISTINCT FROM v_new.position THEN
      v_users_diff := v_users_diff || jsonb_build_object('position', jsonb_build_object('old', to_jsonb(v_old.position), 'new', to_jsonb(v_new.position)));
    END IF;
    IF v_old.location IS DISTINCT FROM v_new.location THEN
      v_users_diff := v_users_diff || jsonb_build_object('location', jsonb_build_object('old', to_jsonb(v_old.location), 'new', to_jsonb(v_new.location)));
    END IF;
    IF v_old.template_id IS DISTINCT FROM v_new.template_id THEN
      v_users_diff := v_users_diff || jsonb_build_object('template_id', jsonb_build_object('old', to_jsonb(v_old.template_id), 'new', to_jsonb(v_new.template_id)));
    END IF;
    IF v_old.custom_attributes IS DISTINCT FROM v_new.custom_attributes THEN
      v_users_diff := v_users_diff || jsonb_build_object('custom_attributes', jsonb_build_object('old', v_old.custom_attributes, 'new', v_new.custom_attributes));
    END IF;
  END IF;

  -- ── 2. anew_entities: create if the user has none yet, then link ───────────
  v_entity_id := v_new.entity_id;

  IF v_entity_id IS NULL THEN
    v_name_parts := regexp_split_to_array(btrim(p_name), '\s+');
    v_first_name := COALESCE(v_name_parts[1], p_name);
    v_last_name  := CASE WHEN array_length(v_name_parts, 1) > 1
                         THEN array_to_string(v_name_parts[2:array_length(v_name_parts,1)], ' ')
                         ELSE NULL END;

    INSERT INTO public.anew_entities (
      type, display_name, first_name, last_name, status, created_by
    )
    VALUES (
      'person', p_name, v_first_name, v_last_name, 'active', p_actor_id
    )
    RETURNING id INTO v_entity_id;

    v_entity_created := true;

    v_entities_diff := jsonb_build_object(
      'id',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_entity_id)),
      'display_name', jsonb_build_object('old', NULL, 'new', to_jsonb(p_name))
    );

    -- Primary work email for the freshly created entity.
    INSERT INTO public.anew_entity_emails (
      entity_id, email, email_type, is_primary, is_verified, created_by
    )
    VALUES (
      v_entity_id, p_email, 'work', true, true, p_actor_id
    )
    RETURNING id INTO v_email_id;

    v_emails_diff := v_emails_diff || jsonb_build_object(
      to_jsonb(v_email_id)::text, jsonb_build_object(
        'id',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_email_id)),
        'email',      jsonb_build_object('old', NULL, 'new', to_jsonb(p_email)),
        'is_primary', jsonb_build_object('old', NULL, 'new', true)
      )
    );

    -- BUG FIX (20261103050000): primary phone for the freshly created entity,
    -- mirroring the primary email insert immediately above. Before this fix,
    -- the only phone rows ever written to anew_entity_phones on user creation
    -- were "additional" ones (step 7 below, is_primary = false) — the primary
    -- phone itself was persisted to anew_users.phone but NEVER inserted here,
    -- so a subsequent edit of the user (which loads its phone list from
    -- anew_entity_phones, not anew_users.phone) always saw an empty phone
    -- list and, on save, silently cleared anew_users.phone via rpc_update_user.
    -- Only runs when a phone was actually supplied, matching how p_phone
    -- itself is optional (create-user/index.ts: `phone: phone || null`).
    IF p_phone IS NOT NULL AND btrim(p_phone) <> '' THEN
      INSERT INTO public.anew_entity_phones (
        entity_id, phone_number, country_code, phone_type, is_primary, created_by
      )
      VALUES (
        v_entity_id, p_phone, '+351', 'mobile', true, p_actor_id
      )
      RETURNING id INTO v_phone_id;

      v_phones_diff := v_phones_diff || jsonb_build_object(
        to_jsonb(v_phone_id)::text, jsonb_build_object(
          'id',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_phone_id)),
          'phone_number', jsonb_build_object('old', NULL, 'new', to_jsonb(p_phone)),
          'is_primary',   jsonb_build_object('old', NULL, 'new', true)
        )
      );
    END IF;

    UPDATE public.anew_users SET entity_id = v_entity_id WHERE id = v_new.id;
    v_new.entity_id := v_entity_id;
  END IF;

  -- ── 3. Memberships: skip-if-exists-active per (org, role) ──────────────────
  -- Scope already validated above (org-visibility + role-escalation gates).
  --
  -- BUG 2 FIX: every org the new user ends up actively a member of (via this
  -- loop) must also get an anew_entity_org_links row for the user's entity,
  -- exactly like anew_leads/anew_contacts/anew_clients establish org-scoped
  -- visibility for can_see_entity. Without this, can_see_entity has no way to
  -- recognize the new user's entity as visible to anyone other than
  -- p_actor_id (via the creator check), so any other in-scope admin — or the
  -- same admin after their business-user resolution changes — gets
  -- 'permission denied: entity not visible' on the very next edit. Direct
  -- INSERT (not ensure_entity_org_link) because that helper checks auth.uid()
  -- against get_user_visible_org_ids for the CALLER's *current* session,
  -- which does not exist here (SECURITY DEFINER, service-role caller); the
  -- actor's authority to grant these specific orgs was already checked above.
  v_org_link_first := true;
  IF jsonb_typeof(p_memberships) = 'array' THEN
    FOR v_membership IN SELECT * FROM jsonb_array_elements(p_memberships)
    LOOP
      IF v_membership->>'organization_id' IS NULL OR v_membership->>'role_id' IS NULL THEN
        CONTINUE;
      END IF;

      SELECT id INTO v_existing_member
      FROM public.anew_memberships
      WHERE user_id = v_new.id
        AND organization_id = (v_membership->>'organization_id')::uuid
        AND role_id = (v_membership->>'role_id')::uuid
        AND status = 'active'
      LIMIT 1;

      IF v_existing_member IS NULL THEN
        INSERT INTO public.anew_memberships (
          user_id, organization_id, role_id, status, relationship_type, join_method, created_by
        )
        VALUES (
          v_new.id,
          (v_membership->>'organization_id')::uuid,
          (v_membership->>'role_id')::uuid,
          'active',
          COALESCE(v_membership->>'relationship_type', 'member'),
          'admin_created',
          p_actor_id
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_membership_id;

        IF v_membership_id IS NOT NULL THEN
          v_memberships_diff := v_memberships_diff || jsonb_build_object(
            v_membership->>'organization_id',
            jsonb_build_object('old', NULL, 'new', v_membership->>'role_id')
          );
        END IF;
      END IF;

      -- Ensure the org_link exists regardless of whether the membership row
      -- was just inserted or already existed (idempotent, WHERE NOT EXISTS —
      -- same idiom as ensure_entity_org_link, no ON CONFLICT needed since
      -- anew_entity_org_links_enforce_single_primary is a trigger, not a
      -- unique constraint, and firing it on a true no-op INSERT is exactly
      -- the race 20260822010000 fixed).
      INSERT INTO public.anew_entity_org_links (entity_id, organization_id, is_primary)
      SELECT v_entity_id, (v_membership->>'organization_id')::uuid, v_org_link_first
      WHERE NOT EXISTS (
        SELECT 1 FROM public.anew_entity_org_links
        WHERE entity_id = v_entity_id
          AND organization_id = (v_membership->>'organization_id')::uuid
      );
      v_org_link_first := false;
    END LOOP;
  END IF;

  -- ── 4. Fiscal entity (optional) ─────────────────────────────────────────────
  IF p_fiscal IS NOT NULL AND p_fiscal ? 'nif' THEN
    -- NIF ENCRYPTION DUAL-WRITE (Phase 2, additive/optional): when the caller
    -- supplies p_nif_encrypted/p_nif_hash alongside the plaintext nif,
    -- persist them on the same row.
    --
    -- FIX (20261101070000): unlike the header comment above claimed
    -- ("this function only ever INSERTs a fiscal_entities row"), this INSERT
    -- had NO reuse/dedupe branch at all, so a repeat NIF (e.g. the same
    -- person already exists as a contact/client with the same fiscal
    -- identity) violated uq_fiscal_entities_nif_hash_country
    -- (20261029010000_fiscal_entities_nif_hash_country_unique.sql, a partial
    -- unique index on (nif_hash, country_code) WHERE nif_hash IS NOT NULL).
    -- ON CONFLICT here repeats that exact predicate (required for Postgres to
    -- accept it as the arbiter of a partial index, same fix already applied
    -- to resolve_fiscal_entity in 20261101030000) and reuses the existing row
    -- instead of erroring. RETURNING xmax detects whether the row was reused,
    -- so the (rare, pre-existing-row) case still clears any stale
    -- fiscal_entity_nif_tokens before inserting the new ones, exactly as
    -- rpc_update_user's reuse branch already does. This ON CONFLICT clause
    -- only ever arbitrates when p_nif_hash is supplied — legacy callers that
    -- omit it insert a row with nif_hash = NULL, which the partial index
    -- never constrains, so their behavior is unchanged.
    INSERT INTO public.fiscal_entities (
      nif, country_code, commercial_name, created_by, nif_encrypted, nif_hash
    )
    VALUES (
      p_fiscal->>'nif',
      COALESCE(p_fiscal->>'country_code', 'PT'),
      NULLIF(p_fiscal->>'commercial_name', ''),
      p_actor_id,
      p_nif_encrypted,
      p_nif_hash
    )
    ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL DO UPDATE
      SET commercial_name = COALESCE(EXCLUDED.commercial_name, public.fiscal_entities.commercial_name),
          nif_encrypted    = COALESCE(EXCLUDED.nif_encrypted, public.fiscal_entities.nif_encrypted),
          nif_hash         = COALESCE(EXCLUDED.nif_hash, public.fiscal_entities.nif_hash),
          updated_at       = now()
    RETURNING id, (xmax <> 0) INTO v_fiscal_entity_id, v_fiscal_row_existed;

    INSERT INTO public.anew_entity_fiscal_entities (
      entity_id, fiscal_entity_id, is_primary, valid_from, created_by
    )
    VALUES (
      v_entity_id, v_fiscal_entity_id, true, now(), p_actor_id
    );

    -- NIF ENCRYPTION DUAL-WRITE (Phase 2, additive/optional): token sync for
    -- fiscal_entity_nif_tokens. Only runs when the caller supplied tokens;
    -- otherwise this block is a complete no-op, matching prior behavior.
    -- When the row was reused (v_fiscal_row_existed = true), clear any stale
    -- tokens first, same idiom as rpc_update_user's reuse branch.
    IF p_nif_tokens IS NOT NULL THEN
      IF COALESCE(v_fiscal_row_existed, false) THEN
        DELETE FROM public.fiscal_entity_nif_tokens
        WHERE fiscal_entity_id = v_fiscal_entity_id;
      END IF;

      FOREACH v_nif_token IN ARRAY p_nif_tokens
      LOOP
        CONTINUE WHEN v_nif_token IS NULL;
        INSERT INTO public.fiscal_entity_nif_tokens (fiscal_entity_id, token_hash)
        VALUES (v_fiscal_entity_id, v_nif_token)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;

    v_fiscal_diff := jsonb_build_object(
      'fiscal_entity_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_fiscal_entity_id)),
      'nif',              jsonb_build_object('old', NULL, 'new', to_jsonb(p_fiscal->>'nif'))
    );
  END IF;

  -- ── 5. Addresses (optional, N) ───────────────────────────────────────────────
  IF jsonb_typeof(p_addresses) = 'array' THEN
    FOR v_addr IN SELECT * FROM jsonb_array_elements(p_addresses)
    LOOP
      INSERT INTO public.anew_addresses (
        address_key, street, number, postal_code, city, district, country,
        floor, unit, extra, created_by
      )
      VALUES (
        v_addr->>'address_key',
        v_addr->>'street',
        v_addr->>'number',
        v_addr->>'postal_code',
        v_addr->>'city',
        NULLIF(v_addr->>'district', ''),
        COALESCE(v_addr->>'country', 'PT'),
        NULLIF(v_addr->>'floor', ''),
        NULLIF(v_addr->>'unit', ''),
        NULLIF(v_addr->>'extra', ''),
        p_actor_id
      )
      RETURNING id INTO v_new_addr_id;

      INSERT INTO public.anew_entity_addresses (
        entity_id, address_id, address_type, is_primary, valid_from, created_by
      )
      VALUES (
        v_entity_id,
        v_new_addr_id,
        COALESCE(v_addr->>'address_type', 'home'),
        COALESCE((v_addr->>'is_primary')::boolean, false),
        now(),
        p_actor_id
      );

      v_addresses_diff := v_addresses_diff || jsonb_build_object(
        to_jsonb(v_new_addr_id)::text, jsonb_build_object(
          'id',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_new_addr_id)),
          'street', jsonb_build_object('old', NULL, 'new', v_addr->'street'),
          'city',   jsonb_build_object('old', NULL, 'new', v_addr->'city')
        )
      );
    END LOOP;
  END IF;

  -- ── 6. Additional emails (optional, N) ──────────────────────────────────────
  IF jsonb_typeof(p_additional_emails) = 'array' THEN
    FOR v_extra_email IN SELECT * FROM jsonb_array_elements(p_additional_emails)
    LOOP
      INSERT INTO public.anew_entity_emails (
        entity_id, email, email_type, is_primary, valid_from, created_by
      )
      VALUES (
        v_entity_id,
        v_extra_email->>'email',
        COALESCE(v_extra_email->>'email_type', 'work'),
        false,
        now(),
        p_actor_id
      )
      RETURNING id INTO v_email_id;

      v_emails_diff := v_emails_diff || jsonb_build_object(
        to_jsonb(v_email_id)::text, jsonb_build_object(
          'id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_email_id)),
          'email', jsonb_build_object('old', NULL, 'new', v_extra_email->'email')
        )
      );
    END LOOP;
  END IF;

  -- ── 7. Additional phones (optional, N) ──────────────────────────────────────
  IF jsonb_typeof(p_additional_phones) = 'array' THEN
    FOR v_extra_phone IN SELECT * FROM jsonb_array_elements(p_additional_phones)
    LOOP
      INSERT INTO public.anew_entity_phones (
        entity_id, phone_number, country_code, phone_type, is_primary, valid_from, created_by
      )
      VALUES (
        v_entity_id,
        v_extra_phone->>'phone_number',
        COALESCE(v_extra_phone->>'country_code', '+351'),
        COALESCE(v_extra_phone->>'phone_type', 'mobile'),
        false,
        now(),
        p_actor_id
      )
      RETURNING id INTO v_new_addr_id; -- reuse var slot for returned id, not used further

      v_phones_diff := v_phones_diff || jsonb_build_object(
        v_extra_phone->>'phone_number',
        jsonb_build_object('old', NULL, 'new', v_extra_phone->'phone_number')
      );
    END LOOP;
  END IF;

  -- ── Resolve org for the audit row via the user's membership ─────────────────
  SELECT m.organization_id
  INTO   v_org_id
  FROM   public.anew_memberships m
  WHERE  m.user_id = v_new.id
  ORDER BY (m.status = 'active') DESC, m.created_at DESC
  LIMIT  1;

  -- ── Combine every touched table's diff into one payload ─────────────────────
  IF v_users_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_users', v_users_diff);
  END IF;
  IF v_entities_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_entities', v_entities_diff);
  END IF;
  IF v_emails_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_emails', v_emails_diff);
  END IF;
  IF v_memberships_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_memberships', v_memberships_diff);
  END IF;
  IF v_fiscal_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('fiscal_entities', v_fiscal_diff);
  END IF;
  IF v_addresses_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_addresses', v_addresses_diff);
  END IF;
  IF v_phones_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_phones', v_phones_diff);
  END IF;

  IF v_diff <> '{}'::jsonb AND v_org_id IS NOT NULL THEN
    PERFORM set_config('app.audit_user_id', p_actor_id::text, true);
    PERFORM public.fn_manual_audit_log(
      'anew_users', v_new.id, v_org_id,
      CASE WHEN v_is_insert THEN 'INSERT' ELSE 'UPDATE' END,
      v_diff, 'web_app'
    );
  END IF;

  RETURN v_new;
END;
$function$;

COMMENT ON FUNCTION public.rpc_finalize_user_profile_full(
  uuid, uuid, text, text, text, text, text, text, text, uuid, jsonb,
  jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text[]
) IS
  'Server-side atomic create-user finalize RPC. Fixed 20261103050000: the entity-creation branch now also inserts the primary phone (p_phone) into anew_entity_phones as is_primary = true, mirroring the primary email insert. Previously the primary phone was only ever persisted to anew_users.phone, never to anew_entity_phones — so editing a freshly-created user always saw an empty phone list, and saving that edit silently cleared anew_users.phone via rpc_update_user (real data loss, same class as the NIF bug fixed in 20261103040000).';
