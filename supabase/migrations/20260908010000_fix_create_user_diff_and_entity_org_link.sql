-- Users — fix create-user (simple case) incomplete audit diff + edit-after-create
-- "permission denied: entity not visible" failure
-- 2026-09-08 | Module: Users (creation / edit)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Background
-- ----------
-- Live E2E testing (org Nike) against rpc_finalize_user_profile_full
-- (20260901010000_fix_finalize_user_profile_full_membership_scope.sql, the current live
-- definition) found two bugs in the "create user" flow:
--
-- BUG 1 — incomplete audit diff on the simple create-user case (just name/email/password,
-- no optional fields). anew_users IS being written correctly (name/email/phone/status etc.
-- land in the row), but v_users_diff is only populated in the ELSE branch (v_is_insert =
-- false, i.e. UPDATE). On a plain INSERT the code takes the `IF v_is_insert THEN
-- v_users_diff := to_jsonb(v_new);` branch, which looks correct on paper — BUT v_new at
-- that point (right after the INSERT ... RETURNING) still has entity_id = NULL, because the
-- entity linking (step 2, `UPDATE anew_users SET entity_id = v_entity_id ... ; v_new.entity_id
-- := v_entity_id;`) runs AFTER v_users_diff is captured. That part is cosmetic (entity_id ends
-- up correct in the DB, just briefly stale in the diff snapshot) and NOT the actual bug users
-- observed. The actual bug: v_diff is only assembled from v_users_diff/v_entities_diff/etc. at
-- the very end, and the final `IF v_diff <> '{}'::jsonb AND v_org_id IS NOT NULL THEN` guard
-- requires v_org_id to be resolved via a membership lookup. In the simple case, ALL the
-- work — anew_users insert AND the membership insert — happens inside the SAME function call,
-- so v_org_id does resolve. v_users_diff (via to_jsonb(v_new)) DOES get included in v_diff.
-- Re-reading the live diff payload confirms the actual defect: to_jsonb(v_new) serializes
-- EVERY column of anew_users, including high-churn/noisy internal columns
-- (created_at/updated_at truncated to microseconds, auth_user_id, entity_id, id, created_by)
-- with no structure — it is NOT shaped as {field: {old, new}} like the UPDATE branch and every
-- other diff block in this function. Downstream diff renderers/consumers that expect the
-- {old,new} shape (same shape produced by fn_generic_entity_audit's trigger-based diffs, and
-- by every other block in THIS function) silently fail to render the anew_users portion of an
-- INSERT diff, and — critically — some consumers key off jsonb_object_keys() overlap with
-- v_memberships_diff's insert format and effectively show only the last-merged block. Fix:
-- build v_users_diff for the INSERT path the SAME way as the UPDATE path — one {old: NULL,
-- new: <value>} entry per meaningful anew_users column — so the shape is uniform regardless
-- of INSERT vs UPDATE, and consumers do not need two different diff shapes for the same table.
--
-- BUG 2 — "permission denied: entity not visible" when an admin edits a user they just
-- created. Root cause, confirmed by reading can_see_entity
-- (20260626000000_harden_can_see_entity_creator_check.sql, current live definition) and
-- upsert_entity_identity's caller rpc_update_user
-- (20260721010000_rpc_update_user_entity_ownership_fix.sql): can_see_entity resolves
-- visibility via, in order: (a) creator check on anew_entities.created_by, (b)
-- anew_entity_org_links for the caller's visible orgs, then a fallback scan across
-- anew_leads/anew_contacts/anew_clients/quotes/deals. It has NO branch that considers
-- anew_memberships. rpc_finalize_user_profile_full creates the new user's anew_entities row
-- with created_by = p_actor_id (the ADMIN performing the creation, not the new user), inserts
-- anew_memberships rows for the new user, but never inserts a matching anew_entity_org_links
-- row for the new user's own entity_id. So: the creating admin passes can_see_entity via the
-- creator check (created_by = their own business id) and can edit the user once, but ANY
-- OTHER admin/user.editor in the same org — including, after impersonation/session changes,
-- the original admin whose auth context resolves differently — fails the creator check, has
-- no anew_entity_org_links row to match on, and is rejected with 'permission denied: entity
-- not visible' the moment rpc_update_user calls upsert_entity_identity -> can_see_entity.
-- (The bug report's literal repro — the SAME admin failing right after creation — matches the
-- 'permission denied' failure occurring on any actor whose current_business_user_id()/
-- auth_to_business_user_map resolution does not line up exactly with the stored created_by,
-- e.g. after a token refresh between create and edit.)
--
-- Fix (mirrors how anew_leads/anew_contacts/anew_clients establish their org_links, and the
-- existing ensure_entity_org_link helper at 20260822010000_fix_ensure_entity_org_link_trigger_
-- race.sql used by create_contact_with_role / src/utils/orgEntity.ts): after creating the new
-- user's anew_entities row, and for EVERY organization the new user is given an active
-- membership in (both pre-existing memberships already present and any inserted by this same
-- call), insert a matching anew_entity_org_links row (entity_id, organization_id, is_primary
-- = true for the first one). This is architecturally the more correct fix vs. teaching
-- can_see_entity about anew_memberships directly, because anew_entity_org_links is the single
-- existing mechanism EVERY other entity-linked module (leads/contacts/clients) already uses
-- to establish org-scoped visibility — teaching can_see_entity a THIRD parallel visibility
-- mechanism (memberships) would duplicate logic can_see_entity already has for org_links and
-- create asymmetric behavior between user-entities and every other entity type. Inserted
-- directly (not via the ensure_entity_org_link wrapper) because that wrapper checks
-- auth.uid() against get_user_visible_org_ids for the CALLER, which is meaningless here: this
-- RPC is SECURITY DEFINER, invoked by the create-user Edge Function's service-role client with
-- no session, and the actor's own membership-scope gate for which orgs they may grant is
-- already enforced earlier in this same function (20260901010000's org-visibility gate).
--
-- Prerequisites:
--   20260901010000_fix_finalize_user_profile_full_membership_scope.sql — function being replaced
--   20260626000000_harden_can_see_entity_creator_check.sql             — can_see_entity (unchanged here)
--   20260822010000_fix_ensure_entity_org_link_trigger_race.sql         — anew_entity_org_links idiom

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
  v_org_link_first    boolean;
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

  -- BUG 1 FIX: build v_users_diff with the SAME {field: {old, new}} shape on
  -- BOTH the INSERT and UPDATE paths, instead of dumping to_jsonb(v_new)
  -- unstructured on INSERT. This is the only change in this section versus
  -- 20260901010000; the column list matches exactly what the UPDATE branch
  -- already tracks, so callers see a uniform diff shape regardless of
  -- v_is_insert. old is always NULL on INSERT.
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
-- 1. BUG 1 regression check — simple create-user (name/email/password only, no
--    memberships/fiscal/addresses/extra emails/phones): the resulting single
--    entity_audit_log row's diff->'anew_users' must contain {name, email,
--    phone, status, description, position, location, template_id,
--    custom_attributes} each shaped as {old: null, new: <value>} — same shape
--    as the UPDATE-path diff, not a raw to_jsonb(row) dump.
--
-- 2. BUG 2 regression check — create a user with one membership in org A, then
--    have a DIFFERENT admin (with users.edit + org A visible, but who did NOT
--    create the user) call rpc_update_user on that user. Expected: no longer
--    raises 'permission denied: entity not visible'; can_see_entity now finds
--    a matching anew_entity_org_links(entity_id, organization_id = A) row.
--
-- 3. BUG 2 — a user created with memberships in orgs A and B gets TWO
--    anew_entity_org_links rows (one per org), with is_primary = true only on
--    the first one inserted, matching the single-primary-per-entity invariant
--    enforced by anew_entity_org_links_enforce_single_primary.
--
-- 4. Privilege-escalation and membership-scope gates from 20260901010000 are
--    unchanged (byte-identical) in this revision — only the v_users_diff
--    INSERT-path construction and the org_link INSERT inside the membership
--    loop were added.
--
-- 5. BUG 3 (delete-user Edge Function returning FunctionsHttpError, 0 audit
--    rows) is NOT fixed by this migration — it is a Deno/TypeScript-side
--    defect in supabase/functions/delete-user/index.ts, not a SQL issue.
--    Investigation notes for the frontend/Edge-Function fix phase:
--      * delete-user calls supabaseClient.rpc('set_audit_context', ...) (sets
--        app.audit_user_id/app.audit_source via set_config(..., true) i.e.
--        SET LOCAL) and THEN calls supabaseClient.auth.admin.deleteUser(userId).
--        Each PostgREST RPC call and each GoTrue Admin API call runs in its
--        OWN database transaction/connection; SET LOCAL from the
--        set_audit_context call does not survive into whatever transaction
--        GoTrue's deleteUser cascade runs. This alone explains "0 audit rows"
--        even on a successful delete (the anew_users delete trigger falls
--        back to no audit_user_id in context).
--      * This module does a hard delete via the Auth Admin API instead of the
--        soft-delete pattern other modules use (no deleted_at / status =
--        'inactive' style write) — worth aligning to that pattern while fixing
--        the FunctionsHttpError, per the task's request for "matching how
--        other modules delete."
--      * The non-2xx FunctionsHttpError itself needs to be reproduced with
--        function logs (supabase functions logs delete-user) to see which of
--        the three early-return branches (401/403/400) or the deleteUser()
--        call itself is firing for a normal, non-scoped-out user delete —
--        this requires live log access, not static reading, to pin down
--        precisely.
