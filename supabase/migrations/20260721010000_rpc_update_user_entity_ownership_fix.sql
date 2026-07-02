-- Utilizadores (Users) — fix rpc_update_user entity ownership binding
-- 2026-07-21 | Module: Utilizadores (Users)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- rpc_update_user (20260720010000_users_audit_bypass_and_rpcs.sql, §2) computed:
--   v_effective_entity := COALESCE(p_entity_id, v_before_user.entity_id);
-- p_entity_id is a caller-supplied parameter. When the target user has no
-- entity_id yet (backfill path, v_before_user.entity_id IS NULL), the
-- function trusted p_entity_id verbatim instead of validating that it
-- belongs to p_user_id. An authorized caller (self-edit, or users.edit +
-- shared visible org) could pass a p_entity_id belonging to a DIFFERENT
-- user/entity, and every subsequent write in this function (entity
-- display_name, identity emails/phones, addresses, fiscal) would then
-- operate on that unrelated entity via v_effective_entity, which is used
-- unchecked for the remainder of the function.
--
-- Fix
-- ---
-- p_entity_id is no longer used to decide which entity to write to. The
-- effective entity is now derived ONLY from v_before_user.entity_id — the
-- entity_id already stored on the target row, loaded server-side before any
-- authorization decision is made. A new entity is only created when
-- v_before_user.entity_id IS NULL, exactly matching the previous frontend
-- behavior (selectedUser.entity_id always came from the DB row, never from
-- an arbitrary client-controlled value). The p_entity_id parameter is kept
-- for backward compatibility (the frontend still passes
-- selectedUser.entity_id) but has zero effect on which rows are read or
-- written by this function.
--
-- Every other statement in this CREATE OR REPLACE is byte-identical to
-- 20260720010000_users_audit_bypass_and_rpcs.sql §2 (verified line-for-line
-- against that migration); only the v_effective_entity assignment changed.
--
-- Prerequisites:
--   20260720010000_users_audit_bypass_and_rpcs.sql — rpc_update_user()

CREATE OR REPLACE FUNCTION public.rpc_update_user(
  p_user_id              uuid,
  p_entity_id            uuid,
  p_name                 text,
  p_email                text,
  p_phone                text,
  p_status               text,
  p_description          text,
  p_position             text,
  p_location             text,
  p_template_id          uuid,
  p_custom_attributes    jsonb,
  p_emails               jsonb,
  p_phones               jsonb,
  p_memberships          jsonb,
  p_existing_membership_ids uuid[],
  p_pending_scopes       jsonb,
  p_addresses            jsonb,
  p_fiscal               jsonb
)
RETURNS public.anew_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor            uuid;
  v_before_user      public.anew_users;
  v_user             public.anew_users;
  v_effective_entity uuid;
  v_entity_before    jsonb;

  v_can_edit_self    boolean;
  v_has_edit_perm    boolean;
  v_has_create_perm  boolean;
  v_has_delete_perm  boolean;
  v_target_in_scope  boolean;
  v_visible_orgs     uuid[];

  v_membership       jsonb;
  v_membership_id    uuid;
  v_membership_org   uuid;
  v_to_delete        uuid[];
  v_form_membership_ids uuid[];

  v_is_update        boolean;

  v_scope_membership text;
  v_scopes           jsonb;
  v_scope            jsonb;

  v_addr             jsonb;
  v_new_address_id   uuid;

  v_fiscal_nif       text;
  v_fiscal_country   text;
  v_fiscal_commercial text;
  v_fiscal_entity_id uuid;

  -- before/after snapshots for the combined diff
  v_old_memberships  jsonb;
  v_new_memberships  jsonb;
  v_old_emails       jsonb;
  v_new_emails       jsonb;
  v_old_phones       jsonb;
  v_new_phones       jsonb;
  v_old_addresses    jsonb;
  v_new_addresses    jsonb;
  v_old_fiscal       jsonb;
  v_new_fiscal       jsonb;

  v_user_diff        jsonb;
  v_diff             jsonb;
  v_audit_org        uuid;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== createdBy in the frontend) ────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current user row (before-image + guards) ────────────────────
  SELECT * INTO v_before_user FROM public.anew_users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Two-level authorization, replicating the DISTINCT RLS on each table ───
  -- SECURITY DEFINER disables RLS inside this function, so we must reproduce,
  -- per touched table, the SAME predicate the client would have been held to.
  -- These predicates are NOT the same across tables — critically, only
  -- anew_users_update grants a self-edit exception. Memberships and permission
  -- scopes NEVER do.
  --
  -- Level 1 — anew_users / entity / identity / addresses / fiscal on the target
  -- (anew_users_update, 20260707030000_users_roles_update_with_check.sql):
  --   self-edit  OR  ( users.edit AND target shares a visible org )
  --
  -- Level 2 — anew_memberships & anew_membership_permission_scopes
  -- (baseline 20260615130000, ~lines 23329-23395). Enforced later, right before
  -- the corresponding writes, ALWAYS requiring the specific permission
  -- (users.create for INSERT, users.edit for UPDATE, users.delete for DELETE on
  -- memberships; users.edit for scope DELETE/INSERT) plus org visibility —
  -- with NO self-edit shortcut. See the gates at steps 5-7 and 8 below.
  v_can_edit_self   := (v_before_user.auth_user_id = auth.uid());
  v_has_edit_perm   := public.has_anew_permission(auth.uid(), 'users.edit');
  v_has_create_perm := public.has_anew_permission(auth.uid(), 'users.create');
  v_has_delete_perm := public.has_anew_permission(auth.uid(), 'users.delete');

  -- Snapshot the caller's visible organisations once (used by every gate).
  SELECT COALESCE(array_agg(o), ARRAY[]::uuid[])
  INTO   v_visible_orgs
  FROM   public.get_user_visible_org_ids(auth.uid()) AS o;

  -- Level-1 gate (anew_users_update parity).
  IF NOT v_can_edit_self THEN
    IF NOT v_has_edit_perm THEN
      RAISE EXCEPTION 'Sem permissão para editar utilizadores' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM public.anew_memberships m
      WHERE m.user_id = p_user_id
        AND m.organization_id = ANY(v_visible_orgs)
    ) INTO v_target_in_scope;
    IF NOT v_target_in_scope THEN
      RAISE EXCEPTION 'Utilizador fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── 1. UPDATE anew_users (identical column set to the FE update) ─────────
  UPDATE public.anew_users
  SET name              = p_name,
      email             = p_email,
      phone             = p_phone,
      status            = p_status,
      description       = p_description,
      position          = p_position,
      location          = p_location,
      template_id       = p_template_id,
      custom_attributes = p_custom_attributes
  WHERE id = p_user_id
  RETURNING * INTO v_user;

  -- ── 2. Backfill entity when the user had none, exactly like the FE ───────
  -- SECURITY FIX (20260721010000_rpc_update_user_entity_ownership_fix.sql):
  -- p_entity_id is caller-supplied and MUST NOT decide which entity is written
  -- to. The effective entity is derived ONLY from the server-loaded
  -- before-image (v_before_user.entity_id, read above BEFORE any
  -- authorization decision). Trusting p_entity_id here would let an
  -- authorized caller redirect every subsequent write (entity display_name,
  -- identity, addresses, fiscal) onto an entity belonging to a different
  -- user, since v_effective_entity is used unchecked for the rest of the
  -- function. p_entity_id is intentionally ignored for this decision.
  v_effective_entity := v_before_user.entity_id;
  IF v_effective_entity IS NULL THEN
    INSERT INTO public.anew_entities (type, display_name, created_by)
    VALUES ('person', p_name, v_actor)
    RETURNING id INTO v_effective_entity;

    UPDATE public.anew_users SET entity_id = v_effective_entity WHERE id = p_user_id;
    -- keep the returned row in sync with the backfilled entity_id
    v_user.entity_id := v_effective_entity;
  END IF;

  -- ── 3. UPDATE anew_entities display_name (before-image for the diff) ─────
  SELECT to_jsonb(e) INTO v_entity_before FROM public.anew_entities e WHERE e.id = v_effective_entity;

  UPDATE public.anew_entities
  SET display_name = p_name,
      updated_at   = now()
  WHERE id = v_effective_entity;

  -- ── 4. Identity (emails + phones) via the existing atomic RPC ────────────
  -- Snapshot before, reuse upsert_entity_identity verbatim, snapshot after.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'email', email, 'email_type', email_type, 'is_primary', is_primary) ORDER BY email), '[]'::jsonb)
  INTO v_old_emails FROM public.anew_entity_emails WHERE entity_id = v_effective_entity;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'phone_number', phone_number, 'country_code', country_code,
           'phone_type', phone_type, 'is_primary', is_primary) ORDER BY phone_number), '[]'::jsonb)
  INTO v_old_phones FROM public.anew_entity_phones WHERE entity_id = v_effective_entity;

  PERFORM public.upsert_entity_identity(
    v_effective_entity,
    COALESCE(p_emails, '[]'::jsonb),
    COALESCE(p_phones, '[]'::jsonb),
    NULL,          -- addresses handled separately below, matching the FE
    v_actor
  );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'email', email, 'email_type', email_type, 'is_primary', is_primary) ORDER BY email), '[]'::jsonb)
  INTO v_new_emails FROM public.anew_entity_emails WHERE entity_id = v_effective_entity;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'phone_number', phone_number, 'country_code', country_code,
           'phone_type', phone_type, 'is_primary', is_primary) ORDER BY phone_number), '[]'::jsonb)
  INTO v_new_phones FROM public.anew_entity_phones WHERE entity_id = v_effective_entity;

  -- ── 5-7. Memberships — snapshot old, delete removed, upsert form rows ─────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'organization_id', organization_id,
           'relationship_type', relationship_type, 'role_id', role_id, 'status', status
         ) ORDER BY organization_id), '[]'::jsonb)
  INTO v_old_memberships
  FROM public.anew_memberships WHERE user_id = p_user_id;

  -- Determine which existing memberships are no longer present in the form.
  SELECT COALESCE(array_agg((m ->> 'id')::uuid) FILTER (WHERE (m ->> 'id') IS NOT NULL), ARRAY[]::uuid[])
  INTO v_form_membership_ids
  FROM jsonb_array_elements(COALESCE(p_memberships, '[]'::jsonb)) AS m;

  SELECT COALESCE(array_agg(x), ARRAY[]::uuid[])
  INTO v_to_delete
  FROM unnest(COALESCE(p_existing_membership_ids, ARRAY[]::uuid[])) AS x
  WHERE NOT (x = ANY(v_form_membership_ids));

  IF array_length(v_to_delete, 1) > 0 THEN
    -- Level-2 gate — membership DELETE parity (anew_memberships_delete: org
    -- visible AND users.delete) plus scope DELETE parity (anew_membership_
    -- permission_scopes_delete: parent membership org visible AND users.edit).
    -- No self-edit exception. Reject if any targeted membership is outside the
    -- caller's visible orgs, exactly as RLS would silently exclude those rows.
    IF NOT v_has_delete_perm THEN
      RAISE EXCEPTION 'Sem permissão para remover associações de utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Scopes are deleted alongside memberships → also requires users.edit.
    IF NOT v_has_edit_perm THEN
      RAISE EXCEPTION 'Sem permissão para alterar âmbitos de permissão'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- OWNERSHIP BINDING (security-critical): this is an "edit user X" RPC, so
    -- every targeted membership MUST belong to p_user_id. p_existing_membership_ids
    -- is client-supplied and NOT trustworthy: a caller could inject a membership id
    -- belonging to ANOTHER user in the same visible org. Neither the org-visibility
    -- gate below nor plain RLS on anew_memberships binds the row to the user being
    -- edited, so we must do it explicitly here. Otherwise, because the whole
    -- transaction runs with app.audit_bypass='on', a foreign user's membership
    -- could be silently deleted with no audit trail. Reject if ANY id in
    -- v_to_delete does not belong to p_user_id.
    IF EXISTS (
      SELECT 1
      FROM unnest(v_to_delete) AS del_id
      WHERE NOT EXISTS (
        SELECT 1 FROM public.anew_memberships m
        WHERE m.id = del_id AND m.user_id = p_user_id
      )
    ) THEN
      RAISE EXCEPTION 'Associação não pertence ao utilizador a editar'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.anew_memberships m
      WHERE m.id = ANY(v_to_delete)
        AND m.user_id = p_user_id
        AND NOT (m.organization_id = ANY(v_visible_orgs))
    ) THEN
      RAISE EXCEPTION 'Associação fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Final writes carry the user_id filter as defence-in-depth: even if the
    -- guards above were ever bypassed, only p_user_id's rows can be removed.
    DELETE FROM public.anew_membership_permission_scopes
    WHERE membership_id = ANY(v_to_delete)
      AND membership_id IN (
        SELECT id FROM public.anew_memberships WHERE user_id = p_user_id
      );
    DELETE FROM public.anew_memberships
    WHERE id = ANY(v_to_delete) AND user_id = p_user_id;
  END IF;

  FOR v_membership IN SELECT * FROM jsonb_array_elements(COALESCE(p_memberships, '[]'::jsonb))
  LOOP
    -- FE: `if (!m.organization_id) continue;`
    CONTINUE WHEN NULLIF(v_membership ->> 'organization_id', '') IS NULL;

    v_membership_id := NULLIF(v_membership ->> 'id', '')::uuid;
    v_membership_org := (v_membership ->> 'organization_id')::uuid;
    v_is_update := v_membership_id IS NOT NULL
                   AND v_membership_id = ANY(COALESCE(p_existing_membership_ids, ARRAY[]::uuid[]));

    -- Level-2 gate — membership write parity. NO self-edit exception.
    --   UPDATE → anew_memberships_update: org visible AND users.edit
    --   INSERT → anew_memberships_insert: org visible AND users.create
    -- The target org must be in the caller's visible set (WITH CHECK on the
    -- NEW row). For UPDATE we also require the pre-existing row's org to be
    -- visible (USING), matching how RLS gates the row before mutating it.
    IF v_is_update THEN
      IF NOT v_has_edit_perm THEN
        RAISE EXCEPTION 'Sem permissão para editar associações de utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NOT (v_membership_org = ANY(v_visible_orgs)) THEN
        RAISE EXCEPTION 'Associação fora do âmbito do utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      -- OWNERSHIP BINDING (security-critical): v_membership_id and
      -- p_existing_membership_ids are client-supplied. The pre-existing row MUST
      -- belong to p_user_id AND live in a visible org. Without the user_id bind a
      -- caller with users.edit could rewrite organization_id/role_id/relationship_type
      -- of ANOTHER user's membership in the same org (e.g. demote/repromote them)
      -- disguised as "editing user X" — with no audit trail (bypass is on).
      IF NOT EXISTS (
        SELECT 1 FROM public.anew_memberships m
        WHERE m.id = v_membership_id
          AND m.user_id = p_user_id
          AND m.organization_id = ANY(v_visible_orgs)
      ) THEN
        RAISE EXCEPTION 'Associação não pertence ao utilizador a editar ou está fora do âmbito'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      -- user_id filter on the write itself as defence-in-depth.
      UPDATE public.anew_memberships
      SET organization_id   = v_membership_org,
          relationship_type = v_membership ->> 'relationship_type',
          role_id           = (v_membership ->> 'role_id')::uuid,
          status            = 'active'
      WHERE id = v_membership_id AND user_id = p_user_id;
    ELSE
      IF NOT v_has_create_perm THEN
        RAISE EXCEPTION 'Sem permissão para criar associações de utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NOT (v_membership_org = ANY(v_visible_orgs)) THEN
        RAISE EXCEPTION 'Associação fora do âmbito do utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      INSERT INTO public.anew_memberships
        (user_id, organization_id, relationship_type, role_id, status, created_by)
      VALUES
        (p_user_id,
         v_membership_org,
         v_membership ->> 'relationship_type',
         (v_membership ->> 'role_id')::uuid,
         'active',
         v_actor);
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'organization_id', organization_id,
           'relationship_type', relationship_type, 'role_id', role_id, 'status', status
         ) ORDER BY organization_id), '[]'::jsonb)
  INTO v_new_memberships
  FROM public.anew_memberships WHERE user_id = p_user_id;

  -- ── 8. Pending permission-scope overrides (per membership) ───────────────
  -- FE: for each membership_id in pendingScopeChanges: delete all, then insert
  --     only the scopes whose scope_level != 'OWNED'.
  IF p_pending_scopes IS NOT NULL AND jsonb_typeof(p_pending_scopes) = 'object'
     AND p_pending_scopes <> '{}'::jsonb THEN
    -- Level-2 gate — scope DELETE/INSERT parity (anew_membership_permission_
    -- scopes_delete/insert/update: parent membership org visible AND
    -- users.edit). No self-edit exception.
    IF NOT v_has_edit_perm THEN
      RAISE EXCEPTION 'Sem permissão para alterar âmbitos de permissão'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    FOR v_scope_membership IN SELECT jsonb_object_keys(p_pending_scopes)
    LOOP
      -- Parent membership must belong to a visible org (RLS EXISTS predicate)
      -- AND — OWNERSHIP BINDING (security-critical) — to p_user_id. The scope
      -- membership_id keys are client-supplied; without the user_id bind a caller
      -- with users.edit could wipe/rewrite the permission scopes of ANOTHER user's
      -- membership in the same org via an "edit user X" call, with no audit trail.
      -- Scopes hang off a membership, and this RPC only ever touches p_user_id's
      -- memberships, so any scope key not owned by p_user_id is rejected.
      IF NOT EXISTS (
        SELECT 1 FROM public.anew_memberships m
        WHERE m.id = v_scope_membership::uuid
          AND m.user_id = p_user_id
          AND m.organization_id = ANY(v_visible_orgs)
      ) THEN
        RAISE EXCEPTION 'Âmbito de permissão não pertence ao utilizador a editar ou está fora do âmbito'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      -- user_id filter on the delete as defence-in-depth.
      DELETE FROM public.anew_membership_permission_scopes
      WHERE membership_id = v_scope_membership::uuid
        AND membership_id IN (
          SELECT id FROM public.anew_memberships WHERE user_id = p_user_id
        );

      v_scopes := p_pending_scopes -> v_scope_membership;
      IF v_scopes IS NOT NULL AND jsonb_typeof(v_scopes) = 'array' THEN
        FOR v_scope IN SELECT * FROM jsonb_array_elements(v_scopes)
        LOOP
          CONTINUE WHEN (v_scope ->> 'scope_level') = 'OWNED';
          INSERT INTO public.anew_membership_permission_scopes
            (membership_id, permission_code, scope_level)
          VALUES
            (v_scope_membership::uuid,
             v_scope ->> 'permission_code',
             v_scope ->> 'scope_level');
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- ── 9-10. Addresses — only when the FE passed a non-NULL array ───────────
  -- (FE leaves addresses untouched when the template hides the address field;
  --  it signals that by passing p_addresses = NULL.)
  IF p_addresses IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'address_id', ea.address_id, 'address_type', ea.address_type,
             'is_primary', ea.is_primary,
             'street', a.street, 'number', a.number, 'postal_code', a.postal_code,
             'city', a.city, 'country', a.country
           ) ORDER BY ea.address_id), '[]'::jsonb)
    INTO v_old_addresses
    FROM public.anew_entity_addresses ea
    LEFT JOIN public.anew_addresses a ON a.id = ea.address_id
    WHERE ea.entity_id = v_effective_entity AND ea.valid_to IS NULL;

    -- Close the current address links.
    UPDATE public.anew_entity_addresses
    SET valid_to = now()
    WHERE entity_id = v_effective_entity AND valid_to IS NULL;

    FOR v_addr IN SELECT * FROM jsonb_array_elements(p_addresses)
    LOOP
      INSERT INTO public.anew_addresses
        (address_key, street, number, floor, unit, postal_code, city, district, country, extra, created_by)
      VALUES
        (v_addr ->> 'address_key',
         v_addr ->> 'street',
         v_addr ->> 'number',
         NULLIF(v_addr ->> 'floor', ''),
         NULLIF(v_addr ->> 'unit', ''),
         v_addr ->> 'postal_code',
         v_addr ->> 'city',
         NULLIF(v_addr ->> 'district', ''),
         COALESCE(NULLIF(v_addr ->> 'country', ''), 'PT'),
         NULLIF(v_addr ->> 'extra', ''),
         v_actor)
      RETURNING id INTO v_new_address_id;

      INSERT INTO public.anew_entity_addresses
        (entity_id, address_id, address_type, is_primary, valid_from, created_by)
      VALUES
        (v_effective_entity,
         v_new_address_id,
         COALESCE(NULLIF(v_addr ->> 'address_type', ''), 'home'),
         COALESCE((v_addr ->> 'is_primary')::boolean, false),
         now(),
         v_actor);
    END LOOP;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'address_id', ea.address_id, 'address_type', ea.address_type,
             'is_primary', ea.is_primary,
             'street', a.street, 'number', a.number, 'postal_code', a.postal_code,
             'city', a.city, 'country', a.country
           ) ORDER BY ea.address_id), '[]'::jsonb)
    INTO v_new_addresses
    FROM public.anew_entity_addresses ea
    LEFT JOIN public.anew_addresses a ON a.id = ea.address_id
    WHERE ea.entity_id = v_effective_entity AND ea.valid_to IS NULL;
  END IF;

  -- ── 11-12. Fiscal entity — only when a NIF was supplied ──────────────────
  v_fiscal_nif := NULLIF(p_fiscal ->> 'nif', '');
  IF p_fiscal IS NOT NULL AND v_fiscal_nif IS NOT NULL THEN
    v_fiscal_country    := COALESCE(NULLIF(p_fiscal ->> 'country_code', ''), 'PT');
    v_fiscal_commercial := NULLIF(p_fiscal ->> 'commercial_name', '');

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'fiscal_entity_id', efe.fiscal_entity_id, 'is_primary', efe.is_primary,
             'nif', fe.nif, 'country_code', fe.country_code, 'commercial_name', fe.commercial_name
           )), '[]'::jsonb)
    INTO v_old_fiscal
    FROM public.anew_entity_fiscal_entities efe
    LEFT JOIN public.fiscal_entities fe ON fe.id = efe.fiscal_entity_id
    WHERE efe.entity_id = v_effective_entity AND efe.valid_to IS NULL;

    -- Close current fiscal links.
    UPDATE public.anew_entity_fiscal_entities
    SET valid_to = now()
    WHERE entity_id = v_effective_entity AND valid_to IS NULL;

    -- Reuse an existing fiscal_entity for this (nif, country) or create one.
    SELECT id INTO v_fiscal_entity_id
    FROM public.fiscal_entities
    WHERE nif = v_fiscal_nif AND country_code = v_fiscal_country
    LIMIT 1;

    IF v_fiscal_entity_id IS NULL THEN
      INSERT INTO public.fiscal_entities (nif, commercial_name, country_code, created_by)
      VALUES (v_fiscal_nif, v_fiscal_commercial, v_fiscal_country, v_actor)
      RETURNING id INTO v_fiscal_entity_id;
    END IF;

    IF v_fiscal_entity_id IS NOT NULL THEN
      INSERT INTO public.anew_entity_fiscal_entities
        (entity_id, fiscal_entity_id, is_primary, valid_from, created_by)
      VALUES
        (v_effective_entity, v_fiscal_entity_id, true, now(), v_actor);
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'fiscal_entity_id', efe.fiscal_entity_id, 'is_primary', efe.is_primary,
             'nif', fe.nif, 'country_code', fe.country_code, 'commercial_name', fe.commercial_name
           )), '[]'::jsonb)
    INTO v_new_fiscal
    FROM public.anew_entity_fiscal_entities efe
    LEFT JOIN public.fiscal_entities fe ON fe.id = efe.fiscal_entity_id
    WHERE efe.entity_id = v_effective_entity AND efe.valid_to IS NULL;
  END IF;

  -- ── Build the combined diff across every touched table ────────────────────
  v_diff := '{}'::jsonb;

  -- anew_users field-level diff (same noise exclusions as the trigger)
  v_user_diff := '{}'::jsonb;
  IF v_before_user.name IS DISTINCT FROM v_user.name THEN
    v_user_diff := v_user_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before_user.name), 'new', to_jsonb(v_user.name)));
  END IF;
  IF v_before_user.email IS DISTINCT FROM v_user.email THEN
    v_user_diff := v_user_diff || jsonb_build_object('email',
      jsonb_build_object('old', to_jsonb(v_before_user.email), 'new', to_jsonb(v_user.email)));
  END IF;
  IF v_before_user.phone IS DISTINCT FROM v_user.phone THEN
    v_user_diff := v_user_diff || jsonb_build_object('phone',
      jsonb_build_object('old', to_jsonb(v_before_user.phone), 'new', to_jsonb(v_user.phone)));
  END IF;
  IF v_before_user.status IS DISTINCT FROM v_user.status THEN
    v_user_diff := v_user_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before_user.status), 'new', to_jsonb(v_user.status)));
  END IF;
  IF v_before_user.description IS DISTINCT FROM v_user.description THEN
    v_user_diff := v_user_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before_user.description), 'new', to_jsonb(v_user.description)));
  END IF;
  IF v_before_user.position IS DISTINCT FROM v_user.position THEN
    v_user_diff := v_user_diff || jsonb_build_object('position',
      jsonb_build_object('old', to_jsonb(v_before_user.position), 'new', to_jsonb(v_user.position)));
  END IF;
  IF v_before_user.location IS DISTINCT FROM v_user.location THEN
    v_user_diff := v_user_diff || jsonb_build_object('location',
      jsonb_build_object('old', to_jsonb(v_before_user.location), 'new', to_jsonb(v_user.location)));
  END IF;
  IF v_before_user.template_id IS DISTINCT FROM v_user.template_id THEN
    v_user_diff := v_user_diff || jsonb_build_object('template_id',
      jsonb_build_object('old', to_jsonb(v_before_user.template_id), 'new', to_jsonb(v_user.template_id)));
  END IF;
  IF v_before_user.custom_attributes IS DISTINCT FROM v_user.custom_attributes THEN
    v_user_diff := v_user_diff || jsonb_build_object('custom_attributes',
      jsonb_build_object('old', v_before_user.custom_attributes, 'new', v_user.custom_attributes));
  END IF;
  IF v_before_user.entity_id IS DISTINCT FROM v_user.entity_id THEN
    v_user_diff := v_user_diff || jsonb_build_object('entity_id',
      jsonb_build_object('old', to_jsonb(v_before_user.entity_id), 'new', to_jsonb(v_user.entity_id)));
  END IF;
  IF v_user_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_users', v_user_diff);
  END IF;

  -- anew_entities display_name diff
  IF (v_entity_before ->> 'display_name') IS DISTINCT FROM p_name THEN
    v_diff := v_diff || jsonb_build_object('anew_entities', jsonb_build_object(
      'display_name', jsonb_build_object('old', v_entity_before -> 'display_name', 'new', to_jsonb(p_name))));
  END IF;

  -- emails / phones diffs
  IF v_old_emails IS DISTINCT FROM v_new_emails THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_emails',
      jsonb_build_object('old', v_old_emails, 'new', v_new_emails));
  END IF;
  IF v_old_phones IS DISTINCT FROM v_new_phones THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_phones',
      jsonb_build_object('old', v_old_phones, 'new', v_new_phones));
  END IF;

  -- memberships diff
  IF v_old_memberships IS DISTINCT FROM v_new_memberships THEN
    v_diff := v_diff || jsonb_build_object('anew_memberships',
      jsonb_build_object('old', v_old_memberships, 'new', v_new_memberships));
  END IF;

  -- addresses diff (only when addresses were processed)
  IF p_addresses IS NOT NULL AND v_old_addresses IS DISTINCT FROM v_new_addresses THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_addresses',
      jsonb_build_object('old', v_old_addresses, 'new', v_new_addresses));
  END IF;

  -- fiscal diff (only when fiscal was processed)
  IF p_fiscal IS NOT NULL AND v_fiscal_nif IS NOT NULL
     AND v_old_fiscal IS DISTINCT FROM v_new_fiscal THEN
    v_diff := v_diff || jsonb_build_object('anew_entity_fiscal_entities',
      jsonb_build_object('old', v_old_fiscal, 'new', v_new_fiscal));
  END IF;

  -- ── Resolve the audit org exactly as fn_audit_anew_users would ────────────
  -- (most relevant membership: active first, then most recently created)
  SELECT m.organization_id
  INTO   v_audit_org
  FROM   public.anew_memberships m
  WHERE  m.user_id = p_user_id
  ORDER BY (m.status = 'active') DESC, m.created_at DESC
  LIMIT  1;

  -- ── Emit a single consolidated audit row (only when something changed) ────
  IF v_diff <> '{}'::jsonb AND v_audit_org IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'anew_users', p_user_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_user(
  uuid, uuid, text, text, text, text, text, text, text, uuid, jsonb,
  jsonb, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_user(
  uuid, uuid, text, text, text, text, text, text, text, uuid, jsonb,
  jsonb, jsonb, jsonb, uuid[], jsonb, jsonb, jsonb
) TO authenticated;

COMMENT ON FUNCTION public.rpc_update_user IS
  'Atomic, single-audit-row update of a user (anew_users + entity + identity + memberships + scopes + addresses + fiscal). '
  'SECURITY DEFINER; re-implements per-table RLS predicates explicitly. '
  'p_entity_id is accepted for backward compatibility but is NOT used to select the write target — '
  'the effective entity is always derived from the target user''s own entity_id (fixed 20260721010000).';


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Entity ownership binding (security-critical — closes the vulnerability
--    of the previous revision):
--    As an authorized caller (self-edit, or users.edit + shared visible org)
--    editing user X who currently has entity_id = NULL, call rpc_update_user
--    passing p_entity_id = <some other user Y's entity_id>. Expected: the
--    function ignores p_entity_id entirely, creates a brand-new entity for
--    X (because v_before_user.entity_id IS NULL), and does NOT touch Y's
--    entity, identity, addresses, or fiscal rows.
--
-- 2. Regression check — normal edit of a user who already has an entity_id:
--    v_effective_entity resolves to v_before_user.entity_id exactly as
--    before (p_entity_id was already expected to equal it in the non-backfill
--    path, so behavior for existing users with an entity_id is unchanged).
