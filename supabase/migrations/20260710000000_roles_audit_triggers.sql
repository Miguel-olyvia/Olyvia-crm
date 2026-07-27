-- Roles Audit Triggers — Wave 1
-- 2026-07-10 | Module: Roles & Permissions | Wave: 1 (audit trigger functions + registrations)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_anew_roles_with_sentinel()        — Strategy A + sentinel (organization_id nullable)
--   2. fn_audit_anew_role_permissions()           — satellite: org via role_id → anew_roles
--   3. Trigger registrations (DROP IF EXISTS + CREATE, idempotent)
--   4. REVOKE/GRANT for the new functions
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and the sentinel pattern established in
-- fn_audit_brands_with_sentinel() (20260705030000_brands_audit_coverage.sql) and
-- reused by fn_audit_uom_with_sentinel() (20260708010000_uom_audit_triggers.sql):
--   · SECURITY DEFINER + pinned search_path = public, pg_temp
--   · Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   · UPDATE rows skipped when only noise columns changed
--   · Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   · changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql       — entity_audit_log table + fn_generic_entity_audit()
--   20260705030000_brands_audit_coverage.sql  — sentinel UUID established
--
-- Schema confirmed directly from the baseline (20260615130000_baseline_new_database.sql):
--
--   anew_roles (line ~8343):
--     id uuid, code text NOT NULL, name text NOT NULL, description text,
--     organization_id uuid (NULLABLE — system roles have organization_id IS NULL),
--     is_system boolean, is_default boolean, created_at timestamptz, updated_at timestamptz,
--     created_by uuid, can_sign_contracts boolean NOT NULL
--
--   anew_role_permissions (line ~8330):
--     id uuid, role_id uuid NOT NULL, permission_code text NOT NULL,
--     created_at timestamptz, created_by uuid
--     NOTE: no organization_id column, no updated_at column, no entity_id column.
--     NOTE: role_id has NO foreign key to anew_roles.id in the baseline — confirmed
--     by grep across the full baseline; the only FK involving a "role_id" column is
--     user_creation_templates_default_role_id_fkey (unrelated table). role_id IS
--     NOT NULL, but that is not a referential constraint, so orphaned rows (role_id
--     pointing at an already-deleted role) are possible without violating DB
--     integrity. The satellite function below already handles this safely by
--     skipping the audit write when the parent role cannot be resolved (see the
--     v_entity_id IS NULL branch). Do not assume ON DELETE CASCADE from anew_roles
--     to anew_role_permissions — there is none at the DB level.
--     NOTE: no extra index is needed on anew_role_permissions.role_id. The existing
--     UNIQUE constraint anew_role_permissions_role_code_unique(role_id,
--     permission_code) already provides an efficient index for equality lookups on
--     role_id alone (role_id is the leading column), which covers both the RLS
--     EXISTS subqueries on this table and bulk deletes/counts by role_id.
--
-- Tables audited:
--   anew_roles             — fn_audit_anew_roles_with_sentinel()   Strategy A + sentinel
--                             (organization_id nullable; system roles routed under sentinel org
--                             so admin writes to system roles remain traceable).
--   anew_role_permissions  — fn_audit_anew_role_permissions()      satellite via role_id → anew_roles
--                             (no organization_id column at all; org+entity resolved by joining
--                             the parent role, then sentinel-substituted if the parent role is
--                             itself global).
--
-- Global sentinel UUID:
--   '00000000-0000-0000-0000-000000000001' — same constant used for brands, categories,
--   attributes, and uom. Never insert this UUID into anew_organizations as a real org.
--
-- Existing triggers on these tables (baseline — confirmed from baseline SQL, lines ~17636-17650):
--   trg_protect_system_role_perms   BEFORE INSERT OR DELETE OR UPDATE ON anew_role_permissions
--                                    EXECUTE FUNCTION protect_system_role_permissions()
--   trg_protect_system_roles_delete BEFORE DELETE ON anew_roles
--                                    EXECUTE FUNCTION protect_system_roles()
--   trg_protect_system_roles_update BEFORE UPDATE ON anew_roles
--                                    EXECUTE FUNCTION protect_system_roles()
--   These are protective guards only — none of them write to entity_audit_log.
--   No AFTER trigger of any kind exists on either table prior to this migration.
--   DROP IF EXISTS guards below make the new AFTER-trigger registration idempotent
--   without touching the existing BEFORE triggers.
--
-- Discrepancies vs. the task's assumed table names:
--   None for table existence — anew_roles and anew_role_permissions both exist exactly as named.
--   However anew_role_permissions has NO organization_id column, unlike products/services/
--   brands/uom satellite tables that at least carry organization_id directly on some rows.
--   This means fn_generic_entity_audit() cannot be reused as-is (its Strategy A/B/C paths all
--   assume either organization_id or entity_id is present on the row) — a dedicated satellite
--   function resolving org purely through role_id → anew_roles is required, mirroring
--   fn_audit_service_prices() (20260702010000_services_audit_triggers.sql) which resolves
--   org purely through service_id → services.
--
-- Noise columns excluded from UPDATE diff:
--   anew_roles:            'updated_at', 'created_at'
--   anew_role_permissions: 'created_at' (no updated_at column exists on this table)


-- ============================================================
-- 1. fn_audit_anew_roles_with_sentinel()
-- ============================================================
-- Handles: anew_roles
--
-- organization_id is nullable — system roles (is_system = true) have
-- organization_id IS NULL. fn_generic_entity_audit() would silently skip these
-- rows (baseline line 229 of 20260625010000_entity_audit_log.sql), leaving zero
-- audit coverage for system-role writes. Substitutes the sentinel UUID so the
-- audit row is still written and queryable by service_role.
--
-- entity_id = anew_roles.id (no separate entity_id column on this table).

CREATE OR REPLACE FUNCTION public.fn_audit_anew_roles_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Sentinel org for global/system roles (organization_id IS NULL).
  -- Must never match a real org. Read-only via service_role.
  -- Same constant as fn_audit_brands_with_sentinel and fn_audit_uom_with_sentinel.
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

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve org_id and entity_id ─────────────────────────────────────────
  -- anew_roles has no separate entity_id column; the row's own id serves as entity_id.
  v_org_id    := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Sentinel substitution for system/global roles ────────────────────────
  -- System roles have organization_id IS NULL. Use the sentinel so the audit
  -- row is still written and queryable by admins via service_role.
  -- Tag source as 'system' when no explicit source was set, to distinguish
  -- system-role writes from normal org-scoped writes.
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

    -- Skip write when nothing meaningful changed.
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
  -- Audit trigger must never block originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_anew_roles_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_anew_roles_with_sentinel() TO service_role;


-- ============================================================
-- 2. fn_audit_anew_role_permissions()
-- ============================================================
-- Handles: anew_role_permissions
--
-- anew_role_permissions has NO organization_id column (confirmed: schema has only
-- id, role_id, permission_code, created_at, created_by). Org and entity are
-- resolved entirely via JOIN public.anew_roles ON anew_roles.id = role_id:
--   organization_id → anew_roles.organization_id (may itself be NULL for system roles)
--   entity_id       → anew_roles.id (the parent role's id, NOT the permission row id)
--
-- Using the parent role's id as entity_id groups permission-grant/revoke audit
-- rows under the role entity timeline (consistent with the intent of
-- entity_audit_log — one timeline per business entity — and with the pattern
-- used by fn_audit_service_prices() grouping under the parent service).
--
-- Sentinel substitution: if the parent role is itself a system role
-- (anew_roles.organization_id IS NULL), the sentinel UUID is substituted so the
-- audit row is still written, mirroring fn_audit_anew_roles_with_sentinel() above.
--
-- Noise columns excluded from UPDATE diff:
--   'created_at' (no updated_at column exists on anew_role_permissions; rows are
--   effectively insert/delete-only in practice, but UPDATE is handled defensively).

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

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve role_id from whichever side is available ────────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
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

  -- Cannot determine parent role at all. NOTE: anew_role_permissions.role_id
  -- has NO foreign key to anew_roles.id in the baseline schema (only the
  -- UNIQUE constraint anew_role_permissions_role_code_unique(role_id,
  -- permission_code), which is NOT NULL but not a referential constraint).
  -- So a row here can legitimately reference a role_id that no longer exists
  -- in anew_roles (e.g. deleted through any path that doesn't cascade this
  -- table) without violating any DB constraint. This is a real, uncovered
  -- case — not "should not happen" — and the skip below is the correct,
  -- safe behavior: never block the original DML, just omit the audit row
  -- when the parent role cannot be resolved.
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

    -- Skip write when nothing meaningful changed.
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
  -- Audit trigger must never block originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_anew_role_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_anew_role_permissions() TO service_role;


-- ============================================================
-- 3. Trigger registrations
-- ============================================================
-- Fire AFTER the DML so they see the committed row state, and run alongside
-- (not instead of) the existing BEFORE protective triggers
-- (trg_protect_system_roles_delete, trg_protect_system_roles_update,
-- trg_protect_system_role_perms) already present in the baseline.
-- DROP IF EXISTS + CREATE for idempotent re-runs (Postgres 13 has no
-- CREATE OR REPLACE TRIGGER).

-- anew_roles — Strategy A + sentinel (organization_id nullable).
DROP TRIGGER IF EXISTS trg_audit_anew_roles ON public.anew_roles;
CREATE TRIGGER trg_audit_anew_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_anew_roles_with_sentinel();

-- anew_role_permissions — satellite via role_id → anew_roles.
DROP TRIGGER IF EXISTS trg_audit_anew_role_permissions ON public.anew_role_permissions;
CREATE TRIGGER trg_audit_anew_role_permissions
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_anew_role_permissions();


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm both AFTER triggers are registered without touching the existing
--    BEFORE protective triggers:
--
--   SELECT t.tgname, p.proname AS function_name, t.tgenabled,
--          CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE t.tgrelid IN ('public.anew_roles'::regclass, 'public.anew_role_permissions'::regclass)
--   ORDER BY t.tgrelid, t.tgname;
--
-- Expected: trg_protect_system_roles_delete (BEFORE), trg_protect_system_roles_update (BEFORE),
--           trg_audit_anew_roles (AFTER) on anew_roles;
--           trg_protect_system_role_perms (BEFORE), trg_audit_anew_role_permissions (AFTER)
--           on anew_role_permissions.
--
-- 2. Smoke-test sentinel audit for a system role (run as service_role):
--
--   INSERT INTO public.anew_roles (code, name, is_system) VALUES ('test_system_role', 'Test', true);
--   SELECT organization_id, entity_id, table_name, operation, source
--   FROM public.entity_audit_log
--   WHERE table_name = 'anew_roles'
--   ORDER BY created_at DESC LIMIT 1;
--   -- Expected: organization_id = '00000000-0000-0000-0000-000000000001', source = 'system'.
--   DELETE FROM public.anew_roles WHERE code = 'test_system_role';
--
-- 3. Smoke-test satellite audit for anew_role_permissions grouped under parent role:
--
--   -- As an authenticated user with roles.edit on an org-scoped role, INSERT a grant.
--   SELECT organization_id, entity_id, table_name, operation
--   FROM public.entity_audit_log
--   WHERE table_name = 'anew_role_permissions'
--   ORDER BY created_at DESC LIMIT 1;
--   -- Expected: entity_id = the parent role's id (not the permission row's own id);
--   --           organization_id matches the parent role's organization_id.
