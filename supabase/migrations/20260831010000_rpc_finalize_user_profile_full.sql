-- Users — extend the create-user single-log guarantee to ALL related-table writes
-- 2026-08-31 | Module: Users (creation)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Background
-- ----------
-- 20260825010000_rpc_finalize_user_profile.sql made the anew_users write itself atomic
-- (rpc_finalize_user_profile: one manual audit log row for that table). That migration's
-- own review flagged two gaps:
--
--   GAP 1 (security, re-verified here, NOT re-fixed): rpc_finalize_user_profile's GRANT
--   EXECUTE was flagged as possibly still open to `authenticated`. Live-DB verification
--   via information_schema.routine_privileges / pg_proc.proacl on 2026-07-03 confirms the
--   ACL is ALREADY `{postgres=X/postgres,service_role=X/postgres}` — no `authenticated`
--   grant exists — and the p_actor_id / has_anew_permission('users.create') defense-in-depth
--   check is already present in the live function body. Nothing to fix for Gap 1; this
--   migration does not touch rpc_finalize_user_profile.
--
--   GAP 2 (atomicity, fixed here): supabase/functions/create-user/index.ts, AFTER calling
--   rpc_finalize_user_profile, still performs several SEPARATE raw Supabase client calls for
--   optional related data — anew_entities, anew_entity_emails (primary + additional),
--   anew_users.entity_id link, anew_memberships, fiscal_entities +
--   anew_entity_fiscal_entities, anew_addresses + anew_entity_addresses, and
--   anew_entity_phones (additional). Each fires its own per-table audit trigger outside
--   rpc_finalize_user_profile's audit_bypass scope, so creating a user WITH any optional
--   related data still produces multiple entity_audit_log rows for one create-user action.
--
-- Solution
-- --------
-- rpc_finalize_user_profile_full(...) wraps rpc_finalize_user_profile's anew_users logic
-- PLUS every related-table write current create-user/index.ts performs after that RPC call,
-- inside ONE transaction under app.audit_bypass='on', ending with exactly ONE
-- fn_manual_audit_log call whose diff combines every touched table — the same pattern as
-- rpc_create_lead_manual / _fn_leads_creation_critical_writes
-- (20260728010000_leads_creation_followup_rpcs.sql).
--
-- rpc_finalize_user_profile itself is left UNCHANGED (still callable on its own; nothing
-- currently depends on removing it). create-user/index.ts is updated in the same change set
-- to call ONLY rpc_finalize_user_profile_full and stop issuing the separate raw inserts.
--
-- Division of responsibility (mirrors the leads RPCs' convention)
-- -----------------------------------------------------------------
-- Still owned by the Edge Function (unchanged):
--   · auth.users creation/lookup via the Admin API (cannot run inside a SQL transaction).
--   · Zod validation, field normalization (prepareAddresses, normalizeFiscal,
--     prepareAdditionalEmails/Phones, normalizeMemberships) — all pure/validation logic.
--   · Admin/permission gate (resolveCallerAdmin / isAdmin) before calling this RPC at all.
-- Now owned by this RPC (previously raw client calls in the Edge Function):
--   · anew_users upsert (delegated to the same logic as rpc_finalize_user_profile).
--   · anew_entities creation (if the user has no entity_id yet) + linking anew_users.entity_id.
--   · anew_entity_emails: primary work email on the new entity + any additional emails.
--   · anew_memberships: skip-if-exists-active insert per (org, role).
--   · fiscal_entities + anew_entity_fiscal_entities link (if fiscal data supplied).
--   · anew_addresses + anew_entity_addresses link, per address.
--   · anew_entity_phones: additional phones.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql             — entity_audit_log, fn_generic_entity_audit()
--   20260719010000_roles_audit_bypass_and_rpcs.sql   — app.audit_bypass guard + fn_manual_audit_log()
--   20260825010000_rpc_finalize_user_profile.sql     — has_anew_permission check pattern reused
--   20260615130000_baseline_new_database.sql         — anew_users/anew_entities/... + RLS


-- ============================================================
-- rpc_finalize_user_profile_full(...)
-- ============================================================
-- p_memberships:        jsonb array of {organization_id, role_id, relationship_type}
-- p_fiscal:             jsonb {nif, country_code, commercial_name} or NULL
-- p_addresses:          jsonb array of {street, number, postal_code, city, district, country,
--                                       floor, unit, extra, address_key, address_type, is_primary}
-- p_additional_emails:  jsonb array of {email, email_type}
-- p_additional_phones:  jsonb array of {phone_number, country_code, phone_type}
--
-- Returns the finalized anew_users row (same contract as rpc_finalize_user_profile).

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
  p_additional_phones   jsonb DEFAULT '[]'::jsonb
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
  v_membership        jsonb;
  v_existing_member   uuid;
  v_membership_id     uuid;
  v_fiscal_entity_id  uuid;
  v_addr              jsonb;
  v_new_addr_id       uuid;
  v_extra_email       jsonb;
  v_extra_phone       jsonb;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Actor is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_user_id is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Defense-in-depth, same rule as rpc_finalize_user_profile: this RPC is
  -- SECURITY DEFINER and bypasses RLS entirely. Only the create-user Edge
  -- Function's service-role client should call it (no `authenticated` grant
  -- below); this guards against a forged p_actor_id even if that ever changes.
  IF NOT EXISTS (
    SELECT 1
    FROM   public.anew_users au
    WHERE  au.id = p_actor_id
    AND    public.has_anew_permission(au.auth_user_id, 'users.create')
  ) THEN
    RAISE EXCEPTION 'Actor não tem permissão para criar utilizadores' USING ERRCODE = 'insufficient_privilege';
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

  IF v_is_insert THEN
    v_users_diff := to_jsonb(v_new);
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

    UPDATE public.anew_users SET entity_id = v_entity_id WHERE id = v_new.id;
    v_new.entity_id := v_entity_id;
  END IF;

  -- ── 3. Memberships: skip-if-exists-active per (org, role) ──────────────────
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
    END LOOP;
  END IF;

  -- ── 4. Fiscal entity (optional) ─────────────────────────────────────────────
  IF p_fiscal IS NOT NULL AND p_fiscal ? 'nif' THEN
    INSERT INTO public.fiscal_entities (
      nif, country_code, commercial_name, created_by
    )
    VALUES (
      p_fiscal->>'nif',
      COALESCE(p_fiscal->>'country_code', 'PT'),
      NULLIF(p_fiscal->>'commercial_name', ''),
      p_actor_id
    )
    RETURNING id INTO v_fiscal_entity_id;

    INSERT INTO public.anew_entity_fiscal_entities (
      entity_id, fiscal_entity_id, is_primary, valid_from, created_by
    )
    VALUES (
      v_entity_id, v_fiscal_entity_id, true, now(), p_actor_id
    );

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

REVOKE ALL ON FUNCTION public.rpc_finalize_user_profile_full(
  uuid, uuid, text, text, text, text, text, text, text, uuid, jsonb,
  jsonb, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC, authenticated, anon;

GRANT EXECUTE ON FUNCTION public.rpc_finalize_user_profile_full(
  uuid, uuid, text, text, text, text, text, text, text, uuid, jsonb,
  jsonb, jsonb, jsonb, jsonb, jsonb
) TO service_role;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Live GRANT re-verified 2026-07-03 via information_schema.routine_privileges and
--    pg_proc.proacl on rpc_finalize_user_profile: only {postgres, service_role} hold
--    EXECUTE; no `authenticated` grant is present, and the live function body already
--    contains the has_anew_permission('users.create') check on p_actor_id. Gap 1 requires
--    no further action; this migration intentionally does not modify
--    rpc_finalize_user_profile's grants or body.
--
-- 2. rpc_finalize_user_profile_full is GRANTed to service_role ONLY (same posture),
--    since it is only ever meant to be invoked from create-user/index.ts's service-role
--    client, mirroring the existing rpc_finalize_user_profile grant.
--
-- 3. A create-user call that supplies memberships + fiscal + an address + an additional
--    email/phone should now produce EXACTLY ONE entity_audit_log row for the whole action:
--      SELECT count(*) FROM entity_audit_log
--      WHERE entity_id = '<anew_users.id>' AND created_at > now() - interval '1 minute'; -- 1
--
-- 4. supabase/functions/create-user/index.ts must be updated to call
--    rpc_finalize_user_profile_full ONCE with all prepared payloads (memberships, fiscal,
--    addresses, additional_emails, additional_phones) and remove the separate raw
--    .insert()/.update() calls to anew_entities, anew_entity_emails, anew_users.entity_id,
--    anew_memberships, fiscal_entities, anew_entity_fiscal_entities, anew_addresses,
--    anew_entity_addresses, and anew_entity_phones (create-user/index.ts lines ~425-603 as
--    of this migration).
