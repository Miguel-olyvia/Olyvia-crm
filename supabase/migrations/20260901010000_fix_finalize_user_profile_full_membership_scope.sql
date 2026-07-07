-- Users — close privilege-escalation gap in rpc_finalize_user_profile_full's membership insert
-- 2026-09-01 | Module: Users (creation)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Background
-- ----------
-- 20260831010000_rpc_finalize_user_profile_full.sql consolidated the whole create-user
-- action (anew_users + entities + emails + memberships + fiscal + addresses + phones) into
-- one SECURITY DEFINER RPC with a single audit row. Review flagged a CRITICAL privilege
-- escalation: the function is SECURITY DEFINER (bypasses RLS entirely), but its membership
-- insert loop had NO equivalent of the anew_memberships_insert RLS policy it bypasses
-- (organization_id IN get_user_visible_org_ids(auth.uid()) AND has_anew_permission(...,
-- 'users.create') — see 20260615130000_baseline_new_database.sql ~line 23381). The RPC only
-- checked ONCE, globally, that p_actor_id holds 'users.create' anywhere, then inserted
-- memberships for ANY (organization_id, role_id) pair present in the client-controlled
-- p_memberships payload — no restriction on which orgs the actor can administer, and no
-- guard on assigning privileged roles (system_admin / org_admin) to the new user. A scoped
-- org_admin (allowed to call create-user) could smuggle in a membership entry for an
-- org they cannot see, with a system_admin role_id, and mint a system_admin in that org.
--
-- Fix (mirrors rpc_update_user's established pattern, 20260720010000, ~lines 370-373 and
-- 550/582): recompute the actor's visible orgs via get_user_visible_org_ids(actor's
-- auth_user_id) once, then require organization_id = ANY(v_visible_orgs) for EVERY
-- membership row before inserting it — rows outside scope are rejected with
-- insufficient_privilege (fail closed; do not silently skip, since silently skipping would
-- let a bad request appear to partially succeed). Additionally, only an actor who is
-- themselves system_admin or super_admin may assign a system_admin or org_admin role to
-- the new user; a scoped org_admin without one of those two role codes may only assign
-- non-admin role codes.
--
-- NOTE: this gate checks the actor's own role code directly against
-- ('system_admin', 'super_admin') instead of calling public.is_system_admin(), because
-- that function (redefined by 20260622114000_system_admin_least_privilege.sql, which is
-- the live/current definition — it superseded 20260616100000's broader version) matches
-- ONLY 'system_admin' and excludes 'super_admin'. Elsewhere in this codebase (e.g.
-- 20260618163000_fix_super_admin_lead_org_scope.sql ~line 76, and this RPC's own caller
-- create-user/index.ts isAdmin()) 'super_admin' is treated as an equal-or-higher privilege
-- role than 'system_admin'. Using is_system_admin() here would wrongly block a super_admin
-- actor from assigning system_admin/org_admin roles via this RPC (fail-closed but
-- over-restrictive). Checking the role code inline avoids depending on is_system_admin()'s
-- narrower current behavior and matches the isAdmin() contract this RPC is meant to serve.
--
-- Prerequisites:
--   20260831010000_rpc_finalize_user_profile_full.sql  — function being replaced (CREATE OR REPLACE)
--   20260720010000_users_audit_bypass_and_rpcs.sql      — get_user_visible_org_ids usage pattern
--   20260618163000_fix_super_admin_lead_org_scope.sql   — inline ('system_admin','super_admin') idiom

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
  v_membership_org    uuid;
  v_membership_role   uuid;
  v_role_code         text;
  v_fiscal_entity_id  uuid;
  v_addr              jsonb;
  v_new_addr_id       uuid;
  v_extra_email       jsonb;
  v_extra_phone       jsonb;
  v_actor_auth_uid    uuid;
  v_actor_is_sysadmin boolean;
  v_visible_orgs      uuid[];
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
      AND ar.code IN ('system_admin', 'super_admin')
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
  -- Scope already validated above (org-visibility + role-escalation gates).
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
-- 1. As a scoped org_admin (has users.create, NOT system_admin, visible orgs = {A}):
--    calling create-user with a membership entry for org B (not visible) must raise
--    insufficient_privilege and write NOTHING (whole transaction rolls back — no
--    anew_users row, no entity, nothing).
--
-- 2. Same actor, membership entry for visible org A but role_id = system_admin's role
--    (or org_admin's role): must also raise insufficient_privilege and roll back
--    entirely, since the actor is neither system_admin nor super_admin.
--
-- 3. A system_admin OR super_admin actor MAY assign system_admin/org_admin roles, but
--    ONLY within the orgs get_user_visible_org_ids actually returns for their own
--    auth_user_id. Per the live definition of that function
--    (20260622150000_fix_system_admin_membership_org_visibility.sql, which supersedes the
--    "NOT is_system_admin() = see everything" shortcut from 20260622114000), visibility is
--    purely membership/hierarchy-based for EVERY actor, system_admin/super_admin included
--    — there is no automatic "see all orgs" carve-out. So gate 1 (org-visibility) still
--    applies in full to system_admin/super_admin actors; this RPC's role-escalation gate
--    (super_admin treated as equal to system_admin) only lifts the ROLE-CODE restriction,
--    never the org-visibility restriction.
--
-- 4. A create-user call with only in-scope, non-admin memberships (plus fiscal, an
--    address, an additional email/phone) still produces EXACTLY ONE entity_audit_log
--    row for the whole action, unchanged from 20260831010000.
