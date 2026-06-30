-- Categories Audit Triggers — Wave 1
-- 2026-07-06 | Module: Categories | Wave: 1 (audit trigger functions + registrations)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_product_categories_with_sentinel() — sentinel-aware function for
--      product_categories (mirrors fn_audit_brands_with_sentinel() from
--      20260705030000_brands_audit_coverage.sql). Required because
--      product_categories.organization_id is nullable — global/shared categories
--      would produce zero audit rows via fn_generic_entity_audit() (silent skip at
--      line 229 of 20260625010000_entity_audit_log.sql).
--   2. fn_audit_product_category_organizations() — satellite: org+entity resolved via
--      category_id → product_categories (same pattern as fn_audit_brand_organizations()).
--   3. Trigger registrations (DROP IF EXISTS + CREATE, idempotent)
--   4. REVOKE/GRANT for new functions
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and the sentinel pattern in
-- fn_audit_brands_with_sentinel() (20260705030000_brands_audit_coverage.sql):
--   • SECURITY DEFINER + pinned search_path = public, pg_temp
--   • Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   • UPDATE rows skipped when only noise columns changed
--   • Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   • changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Prerequisites: 20260706000000_categories_security_fixes.sql (Wave 0)
--
-- Tables audited:
--   product_categories              — fn_audit_product_categories_with_sentinel()
--                                     Strategy A: organization_id nullable.
--                                     Global categories (org IS NULL) are audited
--                                     under the sentinel org UUID (same as brands).
--                                     entity_id = product_categories.id (no separate col).
--
--   product_category_organizations  — fn_audit_product_category_organizations()
--                                     Satellite: org+entity resolved via
--                                     category_id → product_categories.
--                                     entity_id = parent category id (not the junction id)
--                                     so that junction mutations appear on the category
--                                     timeline in the UI.
--
-- Tables NOT audited (intentional):
--   category_attributes             — no organization_id column; org resolved via JOIN to
--                                     product_categories. Adding audit here would require a
--                                     second satellite function. Deferred: category_attributes
--                                     changes are low-frequency admin operations. The parent
--                                     product_categories audit trigger already captures
--                                     category-level changes. Revisit if compliance requires it.
--   category_attribute_palettes     — same reasoning as category_attributes; deferred.
--   product_attribute_value_prices  — has organization_id (nullable). fn_generic_entity_audit()
--                                     would skip NULL-org rows silently. Adding a sentinel-aware
--                                     trigger here is deferred: pricing changes are high-volume
--                                     and require a specific audit retention strategy. The
--                                     entity_audit_log is not the right store for per-option
--                                     price rows at this time.
--   product_attribute_price_ranges  — same reasoning as product_attribute_value_prices; deferred.
--
-- Global categories sentinel UUID:
--   '00000000-0000-0000-0000-000000000001' — same constant used for global brands.
--   This UUID is reserved as the system sentinel and must never be inserted into
--   the organizations table as a real org.
--
-- Gaps addressed:
--   CAT-001 (CRITICAL) — no audit trigger on product_categories
--   CAT-002 (HIGH)     — global categories produce no audit row (sentinel fixes this)
--   CAT-006 (HIGH)     — no audit trail for categories submodule (database-layer trigger)
--
-- Duplicate trigger check:
--   The baseline registers exactly one trigger on product_categories:
--     update_product_categories_updated_at  (BEFORE UPDATE, line 18105)
--   No audit triggers exist on product_categories or product_category_organizations.
--   DROP IF EXISTS guards below make the registrations idempotent.
--
-- Noise columns excluded from UPDATE diff:
--   'updated_at', 'created_at'


-- ============================================================
-- 1. fn_audit_product_categories_with_sentinel()
-- ============================================================
-- Handles: product_categories
--
-- product_categories columns include organization_id (nullable uuid).
-- fn_generic_entity_audit() skips rows when organization_id IS NULL (line 229).
-- For global categories this means zero audit coverage.
--
-- This function mirrors fn_audit_brands_with_sentinel() exactly, substituting
-- the sentinel UUID '00000000-0000-0000-0000-000000000001' for NULL org_ids
-- so that global-category mutations produce audit rows tagged as source 'system'.
--
-- entity_id = product_categories.id (no separate entity_id column exists).

CREATE OR REPLACE FUNCTION public.fn_audit_product_categories_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Sentinel org for global categories (organization_id IS NULL).
  -- Must never match a real org. Same constant used for global brands.
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
  -- product_categories has no separate entity_id column; row id serves as entity_id.
  v_org_id    := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Sentinel substitution for global categories ───────────────────────────
  -- Global categories have organization_id IS NULL.
  -- Use the sentinel so the audit row is still written and is queryable.
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

REVOKE ALL ON FUNCTION public.fn_audit_product_categories_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_categories_with_sentinel() TO service_role;


-- ============================================================
-- 2. fn_audit_product_category_organizations()
-- ============================================================
-- Handles: product_category_organizations
--
-- product_category_organizations columns:
--   id, category_id, organization_id, created_at, created_by
--
-- org and entity are resolved via: JOIN public.product_categories ON id = category_id
--   organization_id → product_categories.organization_id  (may be NULL for global cats)
--   entity_id       → product_categories.id               (groups audit rows under the
--                                                          category entity timeline)
--
-- If the parent category is a global category (organization_id IS NULL), the junction
-- mutation is skipped silently — the parent category's own sentinel audit row already
-- captures the category-level change. This matches the fn_audit_brand_organizations()
-- pattern for global brands.
--
-- Noise columns: product_category_organizations has no updated_at.
-- Only 'created_at' is noise.

CREATE OR REPLACE FUNCTION public.fn_audit_product_category_organizations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  -- product_category_organizations has no updated_at column; only created_at is noise.
  v_noise_cols     text[] := ARRAY['created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_category_id    uuid;
BEGIN

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve category_id from whichever side is available ─────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_category_id := COALESCE(
    (to_jsonb(NEW) ->> 'category_id')::uuid,
    (to_jsonb(OLD) ->> 'category_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent category ─────────────
  -- entity_id is set to the parent category's id so that audit rows for
  -- product_category_organizations changes group under the category entity timeline.
  IF v_category_id IS NOT NULL THEN
    SELECT pc.organization_id, pc.id
    INTO   v_org_id, v_entity_id
    FROM   public.product_categories pc
    WHERE  pc.id = v_category_id
    LIMIT  1;
  END IF;

  -- Global category: junction rows linking a global category to an org are not
  -- audited in the org-scoped log. The parent category's sentinel audit row captures
  -- the category-level change. Skip silently.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
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

REVOKE ALL ON FUNCTION public.fn_audit_product_category_organizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_category_organizations() TO service_role;


-- ============================================================
-- 3. Trigger registrations
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE pattern for idempotent migrations (Postgres 13
-- does not support CREATE OR REPLACE TRIGGER).
--
-- Existing triggers on product_categories (confirmed in baseline line 18105):
--   update_product_categories_updated_at — BEFORE UPDATE, fires first, harmless.
-- No existing triggers on product_category_organizations.
--
-- Alphabetical execution order (same timing, same event):
--   trg_audit_* names sort after update_* names → audit triggers fire second,
--   which is correct (they see the final updated_at value in the row).

-- product_categories — sentinel-aware function (global categories produce sentinel rows).
DROP TRIGGER IF EXISTS trg_audit_product_categories ON public.product_categories;
CREATE TRIGGER trg_audit_product_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_product_categories_with_sentinel();

-- product_category_organizations — satellite via category_id → product_categories.
-- entity_id is set to the parent category's id inside fn_audit_product_category_organizations().
DROP TRIGGER IF EXISTS trg_audit_product_category_organizations ON public.product_category_organizations;
CREATE TRIGGER trg_audit_product_category_organizations
  AFTER INSERT OR UPDATE OR DELETE ON public.product_category_organizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_product_category_organizations();


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm trigger registrations:
--
--   SELECT tgname, tgrelid::regclass, tgenabled
--   FROM pg_trigger
--   WHERE tgrelid IN (
--     'public.product_categories'::regclass,
--     'public.product_category_organizations'::regclass
--   )
--   ORDER BY tgrelid::regclass, tgname;
--
-- Expected output (3 rows total):
--   trg_audit_product_categories              | product_categories              | enabled
--   update_product_categories_updated_at      | product_categories              | enabled
--   trg_audit_product_category_organizations  | product_category_organizations  | enabled
--
-- 2. Confirm no duplicate audit trigger on product_categories:
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.product_categories'::regclass
--     AND tgname LIKE '%audit%';
--
-- Expected: exactly one row — trg_audit_product_categories.
--
-- 3. Confirm trg_audit_product_categories uses sentinel function:
--
--   SELECT tgname, p.proname AS function_name
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE t.tgrelid = 'public.product_categories'::regclass
--     AND t.tgname = 'trg_audit_product_categories';
--
-- Expected: function_name = 'fn_audit_product_categories_with_sentinel'
--
-- 4. Confirm sentinel function is SECURITY DEFINER and grants are correct:
--
--   SELECT proname, prosecdef, proacl
--   FROM pg_proc
--   WHERE proname IN (
--     'fn_audit_product_categories_with_sentinel',
--     'fn_audit_product_category_organizations'
--   );
--
-- Expected: prosecdef = true for both; proacl shows service_role EXECUTE only.
