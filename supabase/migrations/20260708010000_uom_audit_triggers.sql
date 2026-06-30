-- UoM Audit Triggers — Wave 1
-- 2026-07-08 | Module: Fase 7 · Units of Measure | Wave: 1 (audit trigger + indexes)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_uom_with_sentinel() — sentinel-aware audit function for uom.
--      Required because uom.organization_id is nullable — global rows
--      (organization_id IS NULL) would produce zero audit entries via
--      fn_generic_entity_audit() (silent skip at line 229 of
--      20260625010000_entity_audit_log.sql). Uses the same sentinel UUID
--      '00000000-0000-0000-0000-000000000001' established in
--      20260705030000_brands_audit_coverage.sql and reused by
--      20260707010000_attributes_audit_triggers.sql.
--   2. Trigger registration (DROP IF EXISTS + CREATE, idempotent).
--   3. REVOKE/GRANT for the new function.
--   4. Indexes — base_uom_id (missing FK index) + partial index on is_active.
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and the sentinel pattern in
-- fn_audit_brands_with_sentinel() (20260705030000_brands_audit_coverage.sql):
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
--   20260708000000_uom_security_fixes.sql     — Wave 0 (RLS + ACL must be in place first)
--
-- Table audited:
--   uom — fn_audit_uom_with_sentinel()
--         Strategy A: organization_id nullable (global UoMs have IS NULL).
--         Global UoMs audited under sentinel UUID so admin writes are traceable.
--         entity_id = uom.id (no separate entity_id column on uom).
--
-- Global sentinel UUID:
--   '00000000-0000-0000-0000-000000000001' — same constant used for brands, categories,
--   and attributes. Never insert this UUID into anew_organizations as a real org.
--
-- Existing triggers on uom (baseline — confirmed from baseline SQL):
--   None. The table has no triggers registered in the baseline migration.
--   DROP IF EXISTS guards below make registration idempotent.
--
-- Gaps addressed:
--   UOM-01 (CRITICAL) — no audit trigger on uom.
--   UOM-02 (CRITICAL) — fn_generic_entity_audit() would silently skip all global UoM rows
--                        (organization_id IS NULL). fn_audit_uom_with_sentinel() resolves this
--                        by substituting the sentinel UUID before writing the audit row.
--   UOM-07 (MEDIUM)   — missing index on uom.base_uom_id (self-referencing FK).
--                        Missing partial index on uom.is_active for active-UoM lookups.
--
-- NOT addressed here:
--   UOM-08 (MEDIUM)   — UUIDv4 PK. Deferred to a project-wide UUID migration.
--   Frontend gaps (UOM-001 to UOM-005) — addressed in UnitsOfMeasure.tsx (withAuditContext).


-- ============================================================
-- 1. fn_audit_uom_with_sentinel()
-- ============================================================
-- Handles: uom
--
-- uom columns (from baseline):
--   id, code, description, base_uom_id, conversion_factor,
--   is_active, created_at, organization_id, root_organization_id
--
-- Org and entity are resolved directly from NEW/OLD.organization_id (Strategy A).
-- entity_id = uom.id (uom has no separate entity_id column).
-- Global rows (organization_id IS NULL): sentinel UUID substituted for organization_id
-- so the audit row is written and is queryable by service_role.
--
-- Noise columns excluded from UPDATE diff: 'updated_at', 'created_at'
-- (created_at exists on uom; updated_at may not but is harmless to list)

CREATE OR REPLACE FUNCTION public.fn_audit_uom_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Sentinel org for global UoMs (organization_id IS NULL).
  -- Must never match a real org. Read-only via service_role.
  -- Same constant as fn_audit_brands_with_sentinel and fn_audit_product_categories_with_sentinel.
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
  -- uom has no separate entity_id column; the row's own id serves as entity_id.
  v_org_id    := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Sentinel substitution for global UoMs ────────────────────────────────
  -- Global UoMs have organization_id IS NULL. Use the sentinel so the audit
  -- row is still written and queryable by admins via service_role.
  -- Tag source as 'system' when no explicit source was set, to distinguish
  -- admin-via-sentinel rows from normal org-scoped writes.
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

REVOKE ALL ON FUNCTION public.fn_audit_uom_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_uom_with_sentinel() TO service_role;


-- ============================================================
-- 2. Trigger registration
-- ============================================================
-- Fires AFTER the DML so it sees the committed row state.
-- DROP IF EXISTS + CREATE is idempotent (Postgres 13 does not support
-- CREATE OR REPLACE TRIGGER; Postgres 14+ allows it but DROP+CREATE is safer
-- and more portable across Supabase-hosted versions).
--
-- Alphabetical: trg_audit_uom sorts after any BEFORE-UPDATE trigger
-- (e.g. update_uom_updated_at if one exists), ensuring the audit trigger
-- sees the final updated_at value in the row.

DROP TRIGGER IF EXISTS trg_audit_uom ON public.uom;
CREATE TRIGGER trg_audit_uom
  AFTER INSERT OR UPDATE OR DELETE ON public.uom
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_uom_with_sentinel();


-- ============================================================
-- 3. Indexes (UOM-07)
-- ============================================================
-- a) uom.base_uom_id — self-referencing FK to uom.id (baseline constraint:
--    uom_base_uom_id_fkey ON DELETE SET NULL). Joins from derived units to
--    their base unit, and ON DELETE SET NULL cascades, cause sequential scans
--    without this index. Partial: WHERE base_uom_id IS NOT NULL avoids indexing
--    the majority of root-level UoM rows that have no base.
--
-- b) uom.is_active — product form dropdowns filter WHERE is_active = true
--    (e.g. ProductFormPrices.tsx line 58). A partial index on the true arm
--    covers this without indexing inactive rows.

DROP INDEX IF EXISTS public.idx_uom_base_uom_id;
CREATE INDEX idx_uom_base_uom_id
  ON public.uom (base_uom_id)
  WHERE base_uom_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_uom_is_active;
CREATE INDEX idx_uom_is_active
  ON public.uom (is_active)
  WHERE is_active = true;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm trigger is registered and points to fn_audit_uom_with_sentinel:
--
--   SELECT t.tgname, p.proname AS function_name, t.tgenabled
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE t.tgrelid = 'public.uom'::regclass
--   ORDER BY t.tgname;
--
-- Expected: trg_audit_uom → fn_audit_uom_with_sentinel, enabled.
--
-- 2. Confirm no duplicate audit trigger on uom:
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.uom'::regclass
--     AND tgname LIKE '%audit%';
--
-- Expected: exactly one row — trg_audit_uom.
--
-- 3. Confirm indexes exist:
--
--   SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE tablename = 'uom'
--     AND indexname IN ('idx_uom_base_uom_id', 'idx_uom_is_active');
--
-- Expected: 2 rows.
--
-- 4. Smoke-test sentinel audit for a global UoM (run as service_role):
--
--   -- INSERT a global UoM (system admin context):
--   INSERT INTO public.uom (code, description) VALUES ('TEST_GLOBAL', 'Sentinel test');
--
--   -- Verify audit row written under sentinel:
--   SELECT organization_id, entity_id, table_name, operation, source
--   FROM public.entity_audit_log
--   WHERE table_name = 'uom'
--   ORDER BY created_at DESC
--   LIMIT 1;
--
-- Expected: organization_id = '00000000-0000-0000-0000-000000000001', source = 'system'.
--
--   -- Clean up:
--   DELETE FROM public.uom WHERE code = 'TEST_GLOBAL';
--
-- 5. Smoke-test org-scoped UoM audit:
--
--   -- As an authenticated user with products.manage, INSERT an org-scoped UoM.
--   -- Verify audit row written with the correct organization_id (not sentinel).
--   SELECT organization_id, entity_id, table_name, operation
--   FROM public.entity_audit_log
--   WHERE table_name = 'uom'
--     AND organization_id != '00000000-0000-0000-0000-000000000001'
--   ORDER BY created_at DESC
--   LIMIT 1;
--
-- Expected: organization_id matches the inserting user's org.
