-- Fix: rpc_update_user() and rpc_finalize_user_profile_full() blindly INSERT
-- into public.fiscal_entities without dedupe-safe conflict handling against
-- uq_fiscal_entities_nif_hash_country (20261029010000_fiscal_entities_nif_hash_country_unique.sql,
-- a PARTIAL unique index on (nif_hash, country_code) WHERE nif_hash IS NOT NULL).
--
-- rpc_update_user() only looked for a reusable fiscal_entities row via a
-- plaintext match (`WHERE nif = v_fiscal_nif AND country_code = v_fiscal_country`).
-- Once callers dual-write nif_hash (20261028010000_nif_enc_rpc_update_user.sql),
-- a differently-formatted NIF that still hashes to the same value (e.g. same
-- NIF already used by a contact/client elsewhere, hashed via
-- supabase/functions/_shared/nifCrypto.ts) is invisible to that plaintext
-- lookup, so the function proceeds to INSERT and now hits
-- "duplicate key value violates unique constraint uq_fiscal_entities_nif_hash_country"
-- (23505) instead of silently creating a duplicate row as it used to.
--
-- rpc_finalize_user_profile_full() is worse: it has NO reuse branch at all —
-- it unconditionally INSERTs into fiscal_entities for every new user profile
-- carrying a NIF, so the very first repeat NIF (e.g. a user who is already a
-- contact/client with the same fiscal identity) now fails outright with the
-- same 23505 instead of creating an (undesirable, but non-fatal) duplicate.
--
-- Fix (forward-only; 20261028010000 / 20261028020000 are not edited): mirror
-- the safe pattern already applied to resolve_fiscal_entity()
-- (20261101030000_fix_resolve_fiscal_entity_partial_index_conflict.sql) —
-- INSERT ... ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL
-- DO UPDATE, repeating the partial index predicate so Postgres accepts it as
-- the arbiter, RETURNING id + xmax to detect whether the row was reused.
--
-- This ONLY changes conflict arbitration when p_nif_hash is supplied (matches
-- the partial index predicate). Calls that omit p_nif_hash (NULL) insert a row
-- with nif_hash = NULL, which the partial index never enforces uniqueness
-- over, so the ON CONFLICT clause never arbitrates and behavior for those
-- legacy callers is byte-for-byte identical to before this migration —
-- intentional, not something this migration needs to resolve.
--
-- No other statement, validation, authorization gate, or audit-diff
-- computation changes. Same signatures, same overloads, same grants (both
-- functions keep their currently vigent 21-arg / 19-arg signature, so no new
-- DROP FUNCTION / REGRANT is needed here).
--
-- Confirmed while investigating: neither function references a non-existent
-- "entity_type" column on fiscal_entities (unlike create_contact_with_role,
-- fixed separately in 20261101040000) — both already only ever write
-- nif / commercial_name / country_code / created_by / nif_encrypted / nif_hash,
-- all real columns per the baseline CREATE TABLE
-- (20260615130000_baseline_new_database.sql, ~line 9792).
--
-- Prerequisites:
--   20261028010000_nif_enc_rpc_update_user.sql — rpc_update_user() (21-arg)
--   20261028020000_nif_enc_rpc_finalize_user_profile_full.sql —
--     rpc_finalize_user_profile_full() (19-arg)
--   20261029010000_fiscal_entities_nif_hash_country_unique.sql —
--     uq_fiscal_entities_nif_hash_country

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
  p_fiscal               jsonb,
  p_nif_encrypted        text DEFAULT NULL,
  p_nif_hash             text DEFAULT NULL,
  p_nif_tokens           text[] DEFAULT NULL
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
  v_fiscal_is_new    boolean;
  v_fiscal_row_existed boolean;
  v_nif_token        text;

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
          -- FIX (20261003010000_fix_rpc_update_user_scope_level_cast.sql):
          -- scope_level is public.anew_scope_level (enum); the jsonb ->> operator
          -- always yields text, which Postgres does not implicitly cast to a
          -- custom enum on INSERT. Explicit cast added below.
          INSERT INTO public.anew_membership_permission_scopes
            (membership_id, permission_code, scope_level)
          VALUES
            (v_scope_membership::uuid,
             v_scope ->> 'permission_code',
             (v_scope ->> 'scope_level')::public.anew_scope_level);
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

    v_fiscal_is_new := (v_fiscal_entity_id IS NULL);

    IF v_fiscal_entity_id IS NULL THEN
      -- NIF ENCRYPTION DUAL-WRITE (Phase 2, additive/optional): when the
      -- caller supplies p_nif_encrypted/p_nif_hash alongside the plaintext
      -- nif, persist them on the same row. COALESCE keeps this a no-op
      -- (columns stay NULL) when the new parameters are not supplied, so
      -- pre-existing callers are unaffected.
      --
      -- FIX (20261101070000): the plaintext lookup above can miss a row that
      -- already exists under the SAME nif_hash (differently formatted NIF, or
      -- the same NIF already used by another contact/client), so this INSERT
      -- can violate uq_fiscal_entities_nif_hash_country
      -- (20261029010000_fiscal_entities_nif_hash_country_unique.sql, a partial
      -- unique index on (nif_hash, country_code) WHERE nif_hash IS NOT NULL).
      -- ON CONFLICT here repeats that exact predicate (required for Postgres
      -- to accept it as the arbiter of a partial index, same fix already
      -- applied to resolve_fiscal_entity in 20261101030000) and reuses the
      -- existing row instead of erroring. RETURNING xmax detects whether the
      -- row was reused so v_fiscal_is_new (used below by the token-sync
      -- block) reflects reality. This ON CONFLICT clause only ever arbitrates
      -- when p_nif_hash is supplied — legacy callers that omit it insert a
      -- row with nif_hash = NULL, which the partial index never constrains,
      -- so their behavior is unchanged.
      INSERT INTO public.fiscal_entities (nif, commercial_name, country_code, created_by, nif_encrypted, nif_hash)
      VALUES (v_fiscal_nif, v_fiscal_commercial, v_fiscal_country, v_actor,
              COALESCE(p_nif_encrypted, NULL), COALESCE(p_nif_hash, NULL))
      ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL DO UPDATE
        SET commercial_name = COALESCE(EXCLUDED.commercial_name, public.fiscal_entities.commercial_name),
            nif_encrypted    = COALESCE(EXCLUDED.nif_encrypted, public.fiscal_entities.nif_encrypted),
            nif_hash         = COALESCE(EXCLUDED.nif_hash, public.fiscal_entities.nif_hash),
            updated_at       = now()
      RETURNING id, (xmax <> 0) INTO v_fiscal_entity_id, v_fiscal_row_existed;

      v_fiscal_is_new := NOT COALESCE(v_fiscal_row_existed, false);
    ELSE
      -- Existing fiscal_entity matched by (nif, country_code): dual-write the
      -- encrypted material onto it too, without clobbering an existing value
      -- with NULL when the caller did not supply the new parameters.
      UPDATE public.fiscal_entities
      SET nif_encrypted = COALESCE(p_nif_encrypted, nif_encrypted),
          nif_hash       = COALESCE(p_nif_hash, nif_hash)
      WHERE id = v_fiscal_entity_id;
    END IF;

    -- NIF ENCRYPTION DUAL-WRITE (Phase 2, additive/optional): token sync for
    -- fiscal_entity_nif_tokens. Only runs when the caller supplied tokens;
    -- otherwise this block is a complete no-op, matching prior behavior.
    IF p_nif_tokens IS NOT NULL THEN
      IF NOT v_fiscal_is_new THEN
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
