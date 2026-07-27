-- Roles & Permissions Audit Coverage — corrective (forward-only)
-- 2026-07-13 | Module: Roles & Permissões | corrective re-assertion of AFTER audit triggers
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Why this migration exists:
--   The Roles & Permissions module was reported with audit status = "missing".
--   A dedicated migration for this module already exists
--   (20260710000000_roles_audit_triggers.sql), but per the project's forward-only
--   rule an applied migration must never be edited — any correction ships as a new,
--   later-timestamped migration. This migration idempotently re-asserts the two
--   dedicated audit trigger functions and their AFTER INSERT/UPDATE/DELETE triggers
--   on anew_roles and anew_role_permissions, so audit coverage is guaranteed on any
--   database where the earlier migration was not applied or where the AFTER triggers
--   were subsequently dropped.
--
-- Idempotency & safety:
--   · Functions use CREATE OR REPLACE (safe to re-run; body is byte-identical to
--     the definitions established in 20260710000000_roles_audit_triggers.sql).
--   · Triggers use DROP TRIGGER IF EXISTS + CREATE (Postgres 13 has no
--     CREATE OR REPLACE TRIGGER). DROP IF EXISTS only targets the two AFTER audit
--     triggers by their exact names — it does NOT touch the existing BEFORE
--     protective triggers.
--
-- Existing BEFORE protective triggers (baseline) — MUST remain untouched:
--   anew_roles:
--     trg_protect_system_roles_delete  BEFORE DELETE  EXECUTE FUNCTION protect_system_roles()
--     trg_protect_system_roles_update  BEFORE UPDATE  EXECUTE FUNCTION protect_system_roles()
--   anew_role_permissions:
--     trg_protect_system_role_perms    BEFORE INSERT OR DELETE OR UPDATE
--                                       EXECUTE FUNCTION protect_system_role_permissions()
--   None of these write to entity_audit_log; they are guards only. This migration
--   references none of them and leaves them in place.
--
-- Tables covered (both confirmed to exist in the baseline):
--   anew_roles             — fn_audit_anew_roles_with_sentinel()
--                             organization_id nullable; system roles (organization_id IS NULL)
--                             routed under the global sentinel org so admin writes stay traceable.
--                             entity_id = anew_roles.id.
--   anew_role_permissions  — fn_audit_anew_role_permissions()
--                             no organization_id column; org + entity resolved by joining the
--                             parent role via role_id → anew_roles, then sentinel-substituted
--                             when the parent role is itself global. entity_id = parent role id
--                             so permission grant/revoke rows group under the role timeline.
--                             When the parent role cannot be resolved (role_id has no FK to
--                             anew_roles in the baseline, so orphans are possible), the audit
--                             write is skipped without blocking the originating DML.
--
-- Global sentinel UUID:
--   '00000000-0000-0000-0000-000000000001' — same constant used for brands, categories,
--   attributes and uom. Never insert this UUID into anew_organizations as a real org.
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql):
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


-- ============================================================
-- 1. fn_audit_anew_roles_with_sentinel()
-- ============================================================
-- Handles: anew_roles. organization_id is nullable — system roles have
-- organization_id IS NULL; substitute the sentinel so the audit row is still
-- written. entity_id = anew_roles.id.

CREATE OR REPLACE FUNCTION public.fn_audit_anew_roles_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Sentinel org for global/system roles (organization_id IS NULL).
  -- Must never match a real org. Read-only via service_role.
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
-- Handles: anew_role_permissions. No organization_id column — org + entity are
-- resolved via JOIN anew_roles ON anew_roles.id = role_id. entity_id = parent
-- role id (groups grant/revoke rows under the role timeline). Sentinel substituted
-- when the parent role is itself global. Skips the write (never blocks DML) when
-- the parent role cannot be resolved (role_id is NOT NULL but has no FK, so
-- orphaned rows are possible).

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

  -- Cannot determine parent role at all — skip the audit write, never block DML.
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
-- 3. Trigger registrations (AFTER only — BEFORE protective triggers untouched)
-- ============================================================
-- DROP IF EXISTS targets ONLY the two AFTER audit triggers by exact name.
-- The BEFORE protective triggers (trg_protect_system_roles_delete,
-- trg_protect_system_roles_update, trg_protect_system_role_perms) are NOT
-- referenced here and remain in place.

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
-- 1. Confirm both AFTER audit triggers exist alongside the BEFORE protective triggers:
--
--   SELECT t.tgname, p.proname AS function_name,
--          CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE t.tgrelid IN ('public.anew_roles'::regclass, 'public.anew_role_permissions'::regclass)
--     AND NOT t.tgisinternal
--   ORDER BY t.tgrelid, t.tgname;
--
-- Expected on anew_roles: trg_protect_system_roles_delete (BEFORE),
--                         trg_protect_system_roles_update (BEFORE),
--                         trg_audit_anew_roles (AFTER).
-- Expected on anew_role_permissions: trg_protect_system_role_perms (BEFORE),
--                                    trg_audit_anew_role_permissions (AFTER).
--
-- 2. Confirm exactly one audit trigger per table:
--
--   SELECT tgrelid::regclass AS tbl, tgname FROM pg_trigger
--   WHERE tgrelid IN ('public.anew_roles'::regclass, 'public.anew_role_permissions'::regclass)
--     AND tgname LIKE '%audit%';
--
-- Expected: one row per table.
