-- Roles & Permissões — audit-bypass foundation + single-log RPCs
-- 2026-07-19 | Module: Roles & Permissões
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Today one user action (create/update/delete a role) is issued from the frontend
-- as several independent Supabase calls (createMutation/updateMutation/deleteMutation
-- in src/pages/Roles.tsx), each its own Postgres transaction. Every audited table has
-- an AFTER trigger that writes to entity_audit_log, so a single "save role" that also
-- rewrites anew_role_permissions produces N audit rows (1 per table touched) when the
-- business intent is exactly 1 audit entry.
--
-- Solution
-- --------
-- 1. Foundation (created here — did not exist before; grep for "app.audit_bypass" /
--    "fn_manual_audit_log" returned nothing):
--      a) A per-transaction GUC `app.audit_bypass`. When set to 'on' (SET LOCAL), the
--         AFTER audit triggers short-circuit and write nothing. The guard is added at
--         the very TOP of every audit trigger function that fires on the tables these
--         RPCs write to:
--           · fn_generic_entity_audit()            (generic; guarded for consistency)
--           · fn_audit_anew_roles_with_sentinel()  (anew_roles)
--           · fn_audit_anew_role_permissions()     (anew_role_permissions)
--         Only CREATE OR REPLACE — the bodies are otherwise byte-identical to the
--         definitions in 20260713010000_roles_audit_coverage.sql /
--         20260625010000_entity_audit_log.sql. The triggers themselves are NOT touched.
--      b) A reusable fn_manual_audit_log(...) that writes exactly ONE row to
--         entity_audit_log, reusing the SAME author-resolution chain as the trigger
--         functions (app.audit_user_id GUC → current_business_user_id() → anew_users via
--         auth.uid()).
--
-- 2. Three RPCs (rpc_create_role / rpc_update_role / rpc_delete_role) that reproduce,
--    field-for-field, condition-for-condition, what Roles.tsx does today, all inside a
--    single transaction with app.audit_bypass = 'on', accumulate a combined diff across
--    BOTH tables ({table: {field: {old, new}}}), and call fn_manual_audit_log ONCE.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS on anew_roles / anew_role_permissions does NOT
-- self-enforce inside them. Each RPC therefore re-checks, explicitly, the SAME predicates
-- the RLS policies enforce today (baseline 20260615130000, lines ~23478-23571):
--   anew_roles_insert  : organization_id IN visible_orgs AND has_anew_permission(auth.uid(),'roles.create')
--   anew_roles_update  : organization_id IN visible_orgs AND has_anew_permission(auth.uid(),'roles.edit')
--   anew_roles_delete  : organization_id IN visible_orgs AND has_anew_permission(auth.uid(),'roles.delete')
--   anew_role_permissions_insert : created_by = current_business_user_id()
--                                  AND parent role's org IN visible_orgs
--                                  AND has_anew_permission(auth.uid(),'roles.edit')
--   anew_role_permissions_delete : parent role's org IN visible_orgs
--                                  AND has_anew_permission(auth.uid(),'roles.edit')
-- The BEFORE protective triggers protect_system_roles() / protect_system_role_permissions()
-- (baseline lines ~4797-4848) still fire on the underlying DML. They bypass ONLY for
-- request.jwt.claims->>'role' = 'service_role'; an authenticated caller of these RPCs keeps
-- the 'authenticated' JWT role (SECURITY DEFINER changes the executing privileges, NOT the
-- JWT claim), so system-role writes remain blocked by those triggers exactly as before.
-- The RPCs additionally short-circuit on is_system up front to return a clean error,
-- mirroring the frontend's own is_system guard in updateMutation.
--
-- Sentinel org
-- ------------
-- '00000000-0000-0000-0000-000000000001' — same constant used by
-- fn_audit_anew_roles_with_sentinel(). System/global roles (organization_id IS NULL) are
-- routed under it in the audit log so the manual audit row lands in the SAME place the
-- trigger would have written it. Never insert this UUID into anew_organizations.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql       — entity_audit_log + fn_generic_entity_audit()
--   20260710000000_roles_audit_triggers.sql   — fn_audit_anew_roles_with_sentinel(), fn_audit_anew_role_permissions()
--   20260713010000_roles_audit_coverage.sql   — re-assertion of the two role audit functions
--   20260615130000_baseline_new_database.sql  — has_anew_permission(), current_business_user_id(),
--                                                get_user_visible_org_ids(), protect_system_roles*()


-- ============================================================
-- 1a. fn_generic_entity_audit() — add audit-bypass guard at the top
-- ============================================================
-- Body identical to 20260625010000_entity_audit_log.sql §3 except for the new guard
-- as the first statement. The guard must run BEFORE any other logic.

CREATE OR REPLACE FUNCTION public.fn_generic_entity_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed_by    uuid;
  v_source        text;
  v_org_id        uuid;
  v_entity_id     uuid;
  v_old           jsonb;
  v_new           jsonb;
  v_changed       jsonb;
  v_full          jsonb;
  v_key           text;
  v_noise_cols    text[] := ARRAY[
    'updated_at', 'search_text', 'contact_attempts', 'last_activity_at'
  ];
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- When a business RPC has already written a single consolidated audit row via
  -- fn_manual_audit_log(), it sets app.audit_bypass='on' (SET LOCAL) so this
  -- trigger writes nothing and the action produces exactly one log row.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_changed_by := (current_setting('app.audit_user_id', true))::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_changed_by := NULL;
  END;

  IF v_changed_by IS NULL THEN
    v_changed_by := COALESCE(
      public.current_business_user_id(),
      (
        SELECT au.id
        FROM public.anew_users au
        WHERE au.auth_user_id = (SELECT auth.uid())
        LIMIT 1
      )
    );
  END IF;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := current_setting('app.audit_source', true);
  IF v_source = '' THEN
    v_source := NULL;
  END IF;

  -- ── Resolve entity_id ────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    v_entity_id := (to_jsonb(OLD) ->> 'entity_id')::uuid;
    IF v_entity_id IS NULL THEN
      v_entity_id := (to_jsonb(OLD) ->> 'id')::uuid;
    END IF;
  ELSE
    v_entity_id := (to_jsonb(NEW) ->> 'entity_id')::uuid;
    IF v_entity_id IS NULL THEN
      v_entity_id := (to_jsonb(NEW) ->> 'id')::uuid;
    END IF;
  END IF;

  -- ── Resolve organization_id ──────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    v_org_id := (to_jsonb(OLD) ->> 'organization_id')::uuid;
  ELSE
    v_org_id := (to_jsonb(NEW) ->> 'organization_id')::uuid;
  END IF;

  IF v_org_id IS NULL AND v_entity_id IS NOT NULL THEN
    SELECT er.organization_id
    INTO   v_org_id
    FROM   public.anew_entity_roles er
    WHERE  er.entity_id  = v_entity_id
      AND  er.deleted_at IS NULL
    ORDER BY er.created_at DESC
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL AND v_entity_id IS NOT NULL THEN
    SELECT COALESCE(l.organization_id, c.organization_id, cl.organization_id)
    INTO   v_org_id
    FROM   (SELECT NULL::uuid) dummy
    LEFT JOIN public.anew_leads    l  ON l.entity_id  = v_entity_id AND l.deleted_at IS NULL
    LEFT JOIN public.anew_contacts c  ON c.entity_id  = v_entity_id AND c.deleted_at IS NULL
    LEFT JOIN public.anew_clients  cl ON cl.entity_id = v_entity_id AND cl.deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Build changed_fields / full_record ───────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    v_changed := NULL;
    v_full    := to_jsonb(NEW);

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, TG_TABLE_NAME, 'INSERT',
         v_changed, v_full, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_changed := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old ->> v_key) IS DISTINCT FROM (v_new ->> v_key) THEN
        v_changed := v_changed || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key)
        );
      END IF;
    END LOOP;

    IF v_changed = '{}'::jsonb OR v_changed IS NULL THEN
      RETURN NEW;
    END IF;

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, TG_TABLE_NAME, 'UPDATE',
         v_changed, NULL, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_full := to_jsonb(OLD);

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, TG_TABLE_NAME, 'DELETE',
         NULL, v_full, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN OLD;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_generic_entity_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_generic_entity_audit() TO service_role;


-- ============================================================
-- 1b. fn_audit_anew_roles_with_sentinel() — add audit-bypass guard at the top
-- ============================================================
-- Body identical to 20260713010000_roles_audit_coverage.sql §1 except for the
-- new guard as the first statement.

CREATE OR REPLACE FUNCTION public.fn_audit_anew_roles_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';

  v_org_id         uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['updated_at', 'created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve org_id and entity_id ─────────────────────────────────────────
  v_org_id    := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Sentinel substitution for system/global roles ────────────────────────
  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL THEN
      v_source := 'system';
    END IF;
  END IF;

  -- ── Build payload ─────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    v_record         := to_jsonb(NEW);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    v_record         := to_jsonb(OLD);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json       := to_jsonb(OLD);
    v_new_json       := to_jsonb(NEW);
    v_record         := NULL;
    v_changed_fields := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;

    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── Write audit row ───────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       TG_TABLE_NAME,
       TG_OP,
       v_changed_fields,
       v_record,
       COALESCE(v_user_id, public.current_business_user_id()),
       v_source,
       now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_anew_roles_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_anew_roles_with_sentinel() TO service_role;


-- ============================================================
-- 1c. fn_audit_anew_role_permissions() — add audit-bypass guard at the top
-- ============================================================
-- Body identical to 20260713010000_roles_audit_coverage.sql §2 except for the
-- new guard as the first statement.

CREATE OR REPLACE FUNCTION public.fn_audit_anew_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';

  v_org_id         uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_role_id        uuid;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve role_id from whichever side is available ────────────────────
  v_role_id := COALESCE(
    (to_jsonb(NEW) ->> 'role_id')::uuid,
    (to_jsonb(OLD) ->> 'role_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent role ────────────────
  IF v_role_id IS NOT NULL THEN
    SELECT r.organization_id, r.id
    INTO   v_org_id, v_entity_id
    FROM   public.anew_roles r
    WHERE  r.id = v_role_id
    LIMIT  1;
  END IF;

  -- ── Sentinel substitution when the parent role is itself global ─────────
  IF v_entity_id IS NOT NULL AND v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL THEN
      v_source := 'system';
    END IF;
  END IF;

  IF v_entity_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Build payload ────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    v_record         := to_jsonb(NEW);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    v_record         := to_jsonb(OLD);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json       := to_jsonb(OLD);
    v_new_json       := to_jsonb(NEW);
    v_record         := NULL;
    v_changed_fields := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;

    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── Write audit row ──────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       TG_TABLE_NAME,
       TG_OP,
       v_changed_fields,
       v_record,
       COALESCE(v_user_id, public.current_business_user_id()),
       v_source,
       now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_anew_role_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_anew_role_permissions() TO service_role;


-- ============================================================
-- 1d. fn_manual_audit_log(...) — single reusable consolidated-log writer
-- ============================================================
-- Writes exactly ONE row to entity_audit_log. Reuses the SAME author-resolution
-- chain as the trigger functions: app.audit_user_id GUC → current_business_user_id()
-- → anew_users row matching auth.uid(). Never raises: an audit-write failure must
-- not roll back the business RPC that already performed the real DML.
--
-- p_changed_fields carries the combined diff for UPDATE ({table:{col:{old,new}}}),
-- or the full record snapshot for INSERT/DELETE — the caller decides the shape and
-- passes it straight through to changed_fields (kept generic, following the same
-- {col:{old,new}} convention as the triggers but namespaced per table).

CREATE OR REPLACE FUNCTION public.fn_manual_audit_log(
  p_table_name      text,
  p_entity_id       uuid,
  p_organization_id uuid,
  p_operation       text,
  p_changed_fields  jsonb,
  p_source          text DEFAULT 'web_app'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed_by uuid;
BEGIN
  -- ── Resolve actor — identical chain to the audit trigger functions ────────
  BEGIN
    v_changed_by := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_changed_by := NULL;
  END;

  IF v_changed_by IS NULL THEN
    v_changed_by := COALESCE(
      public.current_business_user_id(),
      (
        SELECT au.id
        FROM public.anew_users au
        WHERE au.auth_user_id = (SELECT auth.uid())
        LIMIT 1
      )
    );
  END IF;

  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (p_organization_id,
       p_entity_id,
       p_table_name,
       p_operation,
       p_changed_fields,
       NULL,
       v_changed_by,
       COALESCE(nullif(p_source, ''), 'web_app'),
       now());
  EXCEPTION WHEN OTHERS THEN
    -- Never let an audit write roll back the originating business RPC.
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_manual_audit_log(text, uuid, uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_manual_audit_log(text, uuid, uuid, text, jsonb, text)
  TO authenticated, service_role;


-- ============================================================
-- 2a. rpc_create_role(...)
-- ============================================================
-- Mirrors createMutation in src/pages/Roles.tsx:
--   · created_by = current business user id (never auth_user_id)
--   · INSERT anew_roles {code, name, description|null, can_sign_contracts,
--                        organization_id = active company, created_by}
--   · INSERT anew_role_permissions for each permission code
--     ({role_id, permission_code, created_by})
-- Returns the created anew_roles row.
--
-- Authorization mirrors anew_roles_insert + anew_role_permissions_insert RLS.

CREATE OR REPLACE FUNCTION public.rpc_create_role(
  p_code               text,
  p_name               text,
  p_description        text,
  p_can_sign_contracts boolean,
  p_organization_id    uuid,
  p_permissions        text[]
)
RETURNS public.anew_roles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor      uuid;
  v_role       public.anew_roles;
  v_perm       text;
  v_audit_org  uuid;
  v_diff       jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== createdBy in the frontend) ────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with anew_roles_insert RLS ──────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'roles.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar roles' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- organization_id must be one of the caller's visible orgs (matches
  -- "organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))").
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── INSERT the role (identical column set to createMutation) ─────────────
  INSERT INTO public.anew_roles
    (code, name, description, can_sign_contracts, organization_id, created_by)
  VALUES
    (p_code,
     p_name,
     nullif(p_description, ''),
     COALESCE(p_can_sign_contracts, false),
     p_organization_id,
     v_actor)
  RETURNING * INTO v_role;

  -- ── INSERT permissions (only when the list is non-empty, like the FE) ────
  IF p_permissions IS NOT NULL AND array_length(p_permissions, 1) > 0 THEN
    FOREACH v_perm IN ARRAY p_permissions LOOP
      INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
      VALUES (v_role.id, v_perm, v_actor);
    END LOOP;
  END IF;

  -- ── Build combined diff: full snapshot for the created row + granted perms
  v_diff := jsonb_build_object(
    'anew_roles', jsonb_build_object(
      'code',               jsonb_build_object('old', NULL, 'new', to_jsonb(v_role.code)),
      'name',               jsonb_build_object('old', NULL, 'new', to_jsonb(v_role.name)),
      'description',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_role.description)),
      'can_sign_contracts', jsonb_build_object('old', NULL, 'new', to_jsonb(v_role.can_sign_contracts)),
      'organization_id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_role.organization_id))
    ),
    'anew_role_permissions', jsonb_build_object(
      'permission_code', jsonb_build_object(
        'old', NULL,
        'new', to_jsonb(COALESCE(p_permissions, ARRAY[]::text[]))
      )
    )
  );

  -- Route system/global roles under the sentinel, exactly like the trigger.
  v_audit_org := COALESCE(v_role.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'anew_roles', v_role.id, v_audit_org, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_role(text, text, text, boolean, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_role(text, text, text, boolean, uuid, text[]) TO authenticated;


-- ============================================================
-- 2b. rpc_update_role(...)
-- ============================================================
-- Mirrors updateMutation in src/pages/Roles.tsx:
--   · Refuses system roles up front (the FE's isSystem guard).
--   · UPDATE anew_roles {code, name, description|null, can_sign_contracts} WHERE id
--   · DELETE all anew_role_permissions WHERE role_id
--   · re-INSERT anew_role_permissions for each permission code
--     ({role_id, permission_code, created_by})
-- Returns the updated anew_roles row.
--
-- Authorization mirrors anew_roles_update + anew_role_permissions_(delete|insert) RLS.

CREATE OR REPLACE FUNCTION public.rpc_update_role(
  p_id                 uuid,
  p_code               text,
  p_name               text,
  p_description        text,
  p_can_sign_contracts boolean,
  p_permissions        text[]
)
RETURNS public.anew_roles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor       uuid;
  v_before      public.anew_roles;
  v_role        public.anew_roles;
  v_perm        text;
  v_audit_org   uuid;
  v_old_perms   text[];
  v_new_perms   text[];
  v_diff        jsonb;
  v_role_diff   jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row (before-image for the diff + guards) ────────────
  SELECT * INTO v_before FROM public.anew_roles WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── System-role guard (mirrors the FE isSystem check; the BEFORE trigger
  --    protect_system_roles() would also block, but we fail clean & early) ──
  IF v_before.is_system = true THEN
    RAISE EXCEPTION 'Roles de sistema não são editáveis' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Authorization parity with anew_roles_update RLS ──────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'roles.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar roles' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Role fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Snapshot old permissions before the delete/insert rewrite ────────────
  SELECT COALESCE(array_agg(permission_code ORDER BY permission_code), ARRAY[]::text[])
  INTO   v_old_perms
  FROM   public.anew_role_permissions
  WHERE  role_id = p_id;

  -- ── UPDATE the role (identical column set to updateMutation) ─────────────
  UPDATE public.anew_roles
  SET code               = p_code,
      name               = p_name,
      description        = nullif(p_description, ''),
      can_sign_contracts = COALESCE(p_can_sign_contracts, false)
  WHERE id = p_id
  RETURNING * INTO v_role;

  -- ── Rewrite permissions: delete all, then re-insert (matches the FE) ─────
  DELETE FROM public.anew_role_permissions WHERE role_id = p_id;

  IF p_permissions IS NOT NULL AND array_length(p_permissions, 1) > 0 THEN
    FOREACH v_perm IN ARRAY p_permissions LOOP
      INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
      VALUES (p_id, v_perm, v_actor);
    END LOOP;
  END IF;

  v_new_perms := COALESCE(p_permissions, ARRAY[]::text[]);

  -- ── Build the combined diff across both tables ───────────────────────────
  v_role_diff := '{}'::jsonb;
  IF v_before.code IS DISTINCT FROM v_role.code THEN
    v_role_diff := v_role_diff || jsonb_build_object('code',
      jsonb_build_object('old', to_jsonb(v_before.code), 'new', to_jsonb(v_role.code)));
  END IF;
  IF v_before.name IS DISTINCT FROM v_role.name THEN
    v_role_diff := v_role_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_role.name)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_role.description THEN
    v_role_diff := v_role_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_role.description)));
  END IF;
  IF v_before.can_sign_contracts IS DISTINCT FROM v_role.can_sign_contracts THEN
    v_role_diff := v_role_diff || jsonb_build_object('can_sign_contracts',
      jsonb_build_object('old', to_jsonb(v_before.can_sign_contracts), 'new', to_jsonb(v_role.can_sign_contracts)));
  END IF;

  v_diff := '{}'::jsonb;
  IF v_role_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_roles', v_role_diff);
  END IF;

  -- Only record a permissions change when the set actually changed (order-insensitive).
  IF EXISTS (SELECT unnest(v_old_perms) EXCEPT SELECT unnest(v_new_perms))
     OR EXISTS (SELECT unnest(v_new_perms) EXCEPT SELECT unnest(v_old_perms)) THEN
    v_diff := v_diff || jsonb_build_object(
      'anew_role_permissions', jsonb_build_object(
        'permission_code', jsonb_build_object(
          'old', to_jsonb(v_old_perms),
          'new', to_jsonb(v_new_perms)
        )
      )
    );
  END IF;

  v_audit_org := COALESCE(v_role.organization_id, k_system_sentinel);

  -- Emit a single UPDATE log row only when something meaningful changed,
  -- matching the "skip when nothing changed" behavior of the triggers.
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'anew_roles', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_role(uuid, text, text, text, boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_role(uuid, text, text, text, boolean, text[]) TO authenticated;


-- ============================================================
-- 2c. rpc_delete_role(...)
-- ============================================================
-- Mirrors deleteMutation in src/pages/Roles.tsx:
--   · DELETE FROM anew_roles WHERE id
--     (anew_role_permissions has NO FK/cascade to anew_roles — the FE relies on
--      the same DB behavior; we explicitly delete the permission rows first so the
--      combined audit diff reflects the full effect and no orphan rows are left,
--      matching the intent of "delete this role and its permissions".)
-- Returns void.
--
-- Authorization mirrors anew_roles_delete RLS (+ the is_system guard the FE applies
-- via canDeleteRole, and the BEFORE protect_system_roles trigger).

CREATE OR REPLACE FUNCTION public.rpc_delete_role(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor      uuid;
  v_before     public.anew_roles;
  v_old_perms  text[];
  v_audit_org  uuid;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.anew_roles WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── System-role guard (mirrors canDeleteRole !is_system + BEFORE trigger) ─
  IF v_before.is_system = true THEN
    RAISE EXCEPTION 'Roles de sistema não podem ser eliminadas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Authorization parity with anew_roles_delete RLS ──────────────────────
  IF NOT public.has_anew_permission(auth.uid(), 'roles.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar roles' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Role fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Snapshot permissions, then delete permissions + role ─────────────────
  SELECT COALESCE(array_agg(permission_code ORDER BY permission_code), ARRAY[]::text[])
  INTO   v_old_perms
  FROM   public.anew_role_permissions
  WHERE  role_id = p_id;

  DELETE FROM public.anew_role_permissions WHERE role_id = p_id;
  DELETE FROM public.anew_roles WHERE id = p_id;

  -- ── Combined diff: full snapshot of the removed role + its permissions ────
  v_diff := jsonb_build_object(
    'anew_roles', jsonb_build_object(
      'code',               jsonb_build_object('old', to_jsonb(v_before.code), 'new', NULL),
      'name',               jsonb_build_object('old', to_jsonb(v_before.name), 'new', NULL),
      'description',        jsonb_build_object('old', to_jsonb(v_before.description), 'new', NULL),
      'can_sign_contracts', jsonb_build_object('old', to_jsonb(v_before.can_sign_contracts), 'new', NULL),
      'organization_id',    jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', NULL)
    ),
    'anew_role_permissions', jsonb_build_object(
      'permission_code', jsonb_build_object('old', to_jsonb(v_old_perms), 'new', NULL)
    )
  );

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'anew_roles', p_id, v_audit_org, 'DELETE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_role(uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Bypass guard present at the top of every relevant trigger function:
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('fn_generic_entity_audit',
--                     'fn_audit_anew_roles_with_sentinel',
--                     'fn_audit_anew_role_permissions')
--     AND prosrc LIKE '%app.audit_bypass%';
--   -- Expected: all three rows.
--
-- 2. A single "create role with 5 permissions" produces exactly ONE audit row:
--   SELECT public.rpc_create_role('qa_role','QA Role','',false,'<org-uuid>',
--          ARRAY['leads.view','leads.create','contacts.view','clients.view','roles.view']);
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'anew_roles' AND operation = 'INSERT'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: 1 (not 2, despite anew_role_permissions being written).
--
-- 3. Update that only rewrites permissions still yields ONE row with an
--    anew_role_permissions diff and no anew_roles diff.
--
-- 4. Attempting rpc_update_role / rpc_delete_role on a system role raises
--    insufficient_privilege; a role outside the caller's visible orgs raises the
--    same, matching the RLS policies.
