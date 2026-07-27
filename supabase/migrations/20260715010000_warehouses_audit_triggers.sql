-- Warehouses Audit Triggers — Wave 1
-- 2026-07-15 | Module: Armazéns (Warehouses) | Wave: 1 (audit triggers)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_locations_with_sentinel() — sentinel-aware audit function for
--      locations. Required because the locations table carries NO
--      organization_id column (and no root_organization_id): it has only a
--      loose company_id with no FK to any table. fn_generic_entity_audit()
--      would therefore fail every resolution strategy and skip silently at
--      line 229 of 20260625010000_entity_audit_log.sql, producing zero audit
--      rows. This function substitutes the system sentinel UUID
--      '00000000-0000-0000-0000-000000000001' so every location write is
--      auditable, exactly mirroring fn_audit_uom_with_sentinel()
--      (20260708010000_uom_audit_triggers.sql) and
--      fn_audit_brands_with_sentinel() (20260705030000_brands_audit_coverage.sql).
--   2. Trigger registrations (DROP IF EXISTS + CREATE, idempotent).
--   3. REVOKE/GRANT for the new function.
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and the sentinel pattern in
-- fn_audit_uom_with_sentinel() (20260708010000_uom_audit_triggers.sql):
--   · SECURITY DEFINER + pinned search_path = public, pg_temp
--   · Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   · UPDATE rows skipped when only noise columns changed
--   · Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   · changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql       — entity_audit_log table + fn_generic_entity_audit()
--   20260708010000_uom_audit_triggers.sql      — sentinel-aware precedent
--   20260615130000_baseline_new_database.sql   — warehouses + locations tables
--
-- Tables audited:
--   warehouses — fn_generic_entity_audit()             Strategy A
--                warehouses.organization_id is NOT NULL (baseline line 12506),
--                so the generic function resolves org directly from
--                NEW/OLD.organization_id. warehouses has no separate entity_id
--                column, so the generic function falls back to warehouses.id
--                (entity_id fallback at line 194 of the audit-log migration).
--
--   locations  — fn_audit_locations_with_sentinel()    sentinel
--                locations has NO organization_id / root_organization_id column
--                (baseline lines 10442–10462). Its only tenancy-ish column is
--                company_id, which has NO foreign key (confirmed: only
--                created_by, parent_location_id, responsible_user_id FKs exist)
--                and cannot resolve an organization. RLS on locations is
--                permission-based (assets.manage), not org-scoped. Therefore
--                the sentinel UUID is used so location writes remain auditable
--                instead of being silently dropped. entity_id = locations.id.
--
-- IMPORTANT: anew_warehouses does NOT exist in the schema. It is intentionally
-- NOT created and NOT referenced anywhere in this migration.
--
-- Global sentinel UUID:
--   '00000000-0000-0000-0000-000000000001' — same constant used for uom,
--   brands, categories, and attributes. Never insert this UUID into
--   anew_organizations as a real org.
--
-- Existing triggers on these tables (baseline — confirmed):
--   warehouses — none in the baseline.
--   locations  — update_locations_updated_at (BEFORE UPDATE, updated_at
--                maintenance). Fires first (alphabetically sorts before
--                trg_audit_locations), harmless.
--   DROP IF EXISTS guards below make registration idempotent. No existing
--   audit trigger is dropped or altered on any other table.
--
-- Noise columns excluded from UPDATE diff: 'updated_at', 'created_at'


-- ============================================================
-- 1. fn_audit_locations_with_sentinel()
-- ============================================================
-- Handles: locations
--
-- locations columns (from baseline):
--   id, company_id, name, location_type, parent_location_id, address, city,
--   postal_code, country, latitude, longitude, responsible_user_id,
--   contact_phone, contact_email, notes, is_active, created_by,
--   created_at, updated_at
--
-- The table has no organization_id, so v_org_id is ALWAYS the sentinel.
-- entity_id = locations.id (no separate entity_id column on locations).

CREATE OR REPLACE FUNCTION public.fn_audit_locations_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Sentinel org for org-less locations rows. Must never match a real org.
  -- Same constant as fn_audit_uom_with_sentinel and
  -- fn_audit_brands_with_sentinel.
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

  -- ── Resolve entity_id ─────────────────────────────────────────────────────
  -- locations has no separate entity_id column; the row's own id serves as it.
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Resolve org_id ────────────────────────────────────────────────────────
  -- locations carries no organization_id and its company_id has no FK to any
  -- resolvable tenant table, so the sentinel is always used. Tag source as
  -- 'system' when no explicit source was set, to distinguish sentinel rows.
  v_org_id := k_system_sentinel;
  IF v_source IS NULL THEN
    v_source := 'system';
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

REVOKE ALL ON FUNCTION public.fn_audit_locations_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_locations_with_sentinel() TO service_role;


-- ============================================================
-- 2. Trigger registrations
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE is idempotent (Postgres 13 does not support
-- CREATE OR REPLACE TRIGGER; DROP+CREATE is portable across Supabase versions).
--
-- Alphabetical execution order for same-event/same-timing triggers:
--   trg_audit_* sorts after update_* names → the audit trigger fires second,
--   which is correct (it sees the final updated_at value in the row).

-- warehouses — Strategy A: organization_id is NOT NULL.
-- fn_generic_entity_audit() resolves org from NEW/OLD.organization_id directly
-- and falls back to warehouses.id for entity_id.
DROP TRIGGER IF EXISTS trg_audit_warehouses ON public.warehouses;
CREATE TRIGGER trg_audit_warehouses
  AFTER INSERT OR UPDATE OR DELETE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- locations — sentinel: no organization_id column, org unresolvable.
-- fn_audit_locations_with_sentinel() writes under the system sentinel UUID.
DROP TRIGGER IF EXISTS trg_audit_locations ON public.locations;
CREATE TRIGGER trg_audit_locations
  AFTER INSERT OR UPDATE OR DELETE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_locations_with_sentinel();


-- ============================================================
-- 3. Verification notes (for human review, not executed)
-- ============================================================
-- Confirm trigger registrations:
--
--   SELECT tgname, tgrelid::regclass, tgenabled
--   FROM pg_trigger
--   WHERE tgrelid IN (
--     'public.warehouses'::regclass,
--     'public.locations'::regclass
--   )
--   AND NOT tgisinternal
--   ORDER BY tgrelid::regclass, tgname;
--
-- Expected (3 rows):
--   trg_audit_warehouses        | warehouses | enabled
--   trg_audit_locations         | locations  | enabled
--   update_locations_updated_at | locations  | enabled
--
-- Confirm no duplicate audit trigger on either table:
--
--   SELECT tgrelid::regclass, tgname FROM pg_trigger
--   WHERE tgrelid IN ('public.warehouses'::regclass, 'public.locations'::regclass)
--     AND tgname LIKE '%audit%';
--
-- Expected: exactly two rows — trg_audit_warehouses, trg_audit_locations.
--
-- Smoke-test warehouses (org-scoped): INSERT a warehouse as an authenticated
-- user, then verify entity_audit_log has a row with organization_id matching
-- the warehouse's organization_id (not the sentinel).
--
-- Smoke-test locations (sentinel): INSERT a location, then verify
-- entity_audit_log has a row with
-- organization_id = '00000000-0000-0000-0000-000000000001' and source = 'system'.
