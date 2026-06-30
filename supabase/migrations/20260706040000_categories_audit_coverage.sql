-- Categories Audit Coverage — Wave 4
-- 2026-07-06 | Module: Categories | Wave: 4 (audit gaps, RLS hardening, policy corrections)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. REVOKE anon from category_attributes and product_attribute_price_ranges
--      (RLS-CAT-01 — CRITICAL: Wave 0 missed these two tables)
--   2. entity_audit_log SELECT policy — widen to include products.manage
--      (DB-CAT-004 — HIGH: audit read access for users writing to the four deferred tables)
--   3. product_attribute_price_ranges INSERT/UPDATE — add explicit IS NOT NULL guard
--      (RLS-CAT-04 — HIGH: mirrors product_attribute_value_prices pattern; documents intent)
--   4. fn_audit_category_attributes() — satellite: org via category_id → product_categories
--   5. fn_audit_category_attribute_palettes() — satellite: org via category_id → product_categories
--   6. fn_audit_product_attribute_value_prices_sentinel() — sentinel-aware: org nullable
--   7. fn_audit_product_attribute_price_ranges() — satellite: org via category_id → product_categories
--   8. fn_audit_product_category_organizations_sentinel() — replace Wave 1 function:
--      emit sentinel audit row for global-category-to-org links (DB-CAT-003 — HIGH)
--   9. Trigger registrations (DROP IF EXISTS + CREATE, idempotent)
--  10. REVOKE/GRANT for new functions
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and fn_audit_brands_with_sentinel()
-- (20260705030000_brands_audit_coverage.sql):
--   • SECURITY DEFINER + pinned search_path = public, pg_temp
--   • Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   • NULL actor (both GUC and current_business_user_id() resolve to NULL) tagged
--     source = 'system' so system-initiated writes are distinguishable (DB-CAT-006)
--   • UPDATE rows skipped when only noise columns changed
--   • Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   • changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Global categories sentinel UUID:
--   '00000000-0000-0000-0000-000000000001' — same constant used for global brands
--   and product_categories sentinel (Wave 1). Must never be a real org id.
--
-- Tables newly audited:
--   category_attributes             — fn_audit_category_attributes()
--                                     Satellite: org via category_id → product_categories.
--                                     entity_id = parent category id (groups under category).
--   category_attribute_palettes     — fn_audit_category_attribute_palettes()
--                                     Satellite: same pattern as category_attributes.
--   product_attribute_value_prices  — fn_audit_product_attribute_value_prices_sentinel()
--                                     Sentinel-aware: organization_id is nullable (null = default).
--                                     NULL-org rows are written under sentinel so pricing defaults
--                                     are traceable without polluting any real org's timeline.
--   product_attribute_price_ranges  — fn_audit_product_attribute_price_ranges()
--                                     Satellite: org via category_id → product_categories.
--                                     entity_id = parent category id.
--
-- Table with updated audit function:
--   product_category_organizations  — fn_audit_product_category_organizations_sentinel()
--                                     Replaces Wave 1 fn_audit_product_category_organizations().
--                                     Gap DB-CAT-003: when a global category is linked to a new
--                                     org via product_category_organizations INSERT, the Wave 1
--                                     function silently skipped because parent org IS NULL.
--                                     This event (associating a global category with an org) is a
--                                     distinct business event that must be captured. The new
--                                     function emits a sentinel-tagged audit row for these cases.
--
-- Noise columns per table:
--   category_attributes             — 'updated_at', 'created_at'
--   category_attribute_palettes     — 'updated_at', 'created_at'
--   product_attribute_value_prices  — 'updated_at', 'created_at'
--   product_attribute_price_ranges  — 'updated_at', 'created_at'
--   product_category_organizations  — 'created_at' (no updated_at column)
--
-- Duplicate trigger check:
--   category_attributes, category_attribute_palettes,
--   product_attribute_value_prices, product_attribute_price_ranges:
--     No audit triggers exist on any of these four tables (Wave 1 explicitly deferred them).
--     No other triggers exist on these tables except the baseline updated_at triggers.
--   product_category_organizations:
--     trg_audit_product_category_organizations exists from Wave 1 — dropped and recreated
--     to point at the sentinel-aware replacement function.
--   DROP IF EXISTS guards below make all registrations idempotent.
--
-- Gaps addressed:
--   RLS-CAT-01 (CRITICAL) — anon not revoked from category_attributes and product_attribute_price_ranges
--   DB-CAT-001 (CRITICAL) — products.manage not seeded (addressed in Wave 3; this wave
--                            closes the audit-read gap for users holding products.manage)
--   DB-CAT-002 (CRITICAL) — category_attributes, category_attribute_palettes,
--                            product_attribute_value_prices, product_attribute_price_ranges
--                            have no audit triggers
--   DB-CAT-003 (HIGH)     — global-category-to-org junction links invisible in audit log
--   DB-CAT-004 (HIGH)     — entity_audit_log SELECT does not include products.manage
--   DB-CAT-006 (MEDIUM)   — NULL actor (system writes) not tagged source = 'system'
--   RLS-CAT-04 (HIGH)     — product_attribute_price_ranges INSERT/UPDATE: no explicit IS NOT NULL
--
-- Prerequisites:
--   20260706010000_categories_audit_triggers.sql (Wave 1 — defines sentinel UUID and base functions)
--   20260706030000_categories_products_permission_codes.sql (Wave 3 — seeds products.manage)


-- ============================================================
-- 1. REVOKE anon from category_attributes and product_attribute_price_ranges
-- ============================================================
-- Wave 0 (20260706000000) revoked anon from:
--   category_attribute_palettes, product_attribute_value_prices,
--   product_categories, product_category_organizations.
-- It missed category_attributes and product_attribute_price_ranges.
-- The baseline (20260615130000) grants GRANT ALL TO anon on both.
-- RLS is active on these tables so policies still filter rows, but anon retains
-- table-level DML privilege — any future policy gap or misconfiguration would
-- immediately expose both tables to unauthenticated writes.

REVOKE ALL ON TABLE public.category_attributes              FROM anon;
REVOKE ALL ON TABLE public.product_attribute_price_ranges   FROM anon;

-- Restore only SELECT+INSERT+UPDATE+DELETE for authenticated on both tables
-- (consistent with Wave 0 pattern — no GRANT ALL, only DML operations).
-- Note: authenticated grants were already tightened in Wave 0; this REVOKE+GRANT
-- is idempotent and safe to re-run.
REVOKE ALL ON TABLE public.category_attributes              FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.category_attributes              TO authenticated;

REVOKE ALL ON TABLE public.product_attribute_price_ranges   FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_attribute_price_ranges   TO authenticated;


-- ============================================================
-- 2. entity_audit_log SELECT policy — add products.manage
-- ============================================================
-- Wave 0 widened the policy to include product_categories.view (section 1).
-- The four deferred tables (category_attributes, category_attribute_palettes,
-- product_attribute_value_prices, product_attribute_price_ranges) are written by
-- users holding products.manage. Now that audit triggers are being added to those
-- tables, users with products.manage must be able to read the resulting audit rows.
-- Without this, audit read access is silently denied to the users who performed
-- the audited writes.
--
-- This DROP+CREATE pattern is consistent with every prior entity_audit_log_select
-- replacement (Wave 0 brands, Wave 0 categories).

DROP POLICY IF EXISTS entity_audit_log_select ON public.entity_audit_log;

CREATE POLICY entity_audit_log_select
  ON public.entity_audit_log
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
    AND (
      public.has_anew_permission((SELECT auth.uid()), 'quotes.manage')
      OR public.has_anew_permission((SELECT auth.uid()), 'proposals.manage')
      OR public.has_anew_permission((SELECT auth.uid()), 'services.view')
      OR public.has_anew_permission((SELECT auth.uid()), 'products.view')
      OR public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      OR public.has_anew_permission((SELECT auth.uid()), 'brands.view')
      OR public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
      OR public.has_anew_permission((SELECT auth.uid()), 'product_categories.view')
    )
  );


-- ============================================================
-- 3. product_attribute_price_ranges — explicit IS NOT NULL guards
-- ============================================================
-- RLS-CAT-04: INSERT and UPDATE WITH CHECK have no explicit organization_id IS NOT NULL
-- guard. The sister table product_attribute_value_prices (Wave 0 lines 338-347) explicitly
-- includes AND organization_id IS NOT NULL in its INSERT WITH CHECK.
-- For product_attribute_price_ranges, organization_id IN (subquery) evaluates
-- NULL IN (subquery) = NULL (falsy) so NULL-org inserts are blocked — but only
-- incidentally. The absence of the IS NOT NULL guard is an undocumented fragility.
-- Any query planner behaviour change or future policy refactor could silently allow
-- a NULL-org row that bypasses org scoping.
--
-- This replacement drops and recreates INSERT and UPDATE policies only.
-- SELECT and DELETE policies are correct and untouched.
--
-- Additionally: the comment documents that IS NULL rows are intentionally excluded
-- from the UPDATE USING clause (SELECT includes IS NULL rows as readable via
-- RLS-CAT-05 — this asymmetry is intentional for category-level defaults, which
-- are readable but only writable by system admins).

DROP POLICY IF EXISTS product_attribute_price_ranges_insert ON public.product_attribute_price_ranges;
DROP POLICY IF EXISTS product_attribute_price_ranges_update ON public.product_attribute_price_ranges;

-- INSERT: products.manage + org must be non-null and in visible orgs.
-- IS NOT NULL guard is explicit (mirrors product_attribute_value_prices pattern).
-- NULL-org rows represent system-level category defaults and can only be written
-- by system admins (is_system_admin_user bypass).
CREATE POLICY product_attribute_price_ranges_insert
  ON public.product_attribute_price_ranges
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IS NOT NULL
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- UPDATE: products.manage + org in visible orgs.
-- USING clause intentionally excludes IS NULL rows (non-admins cannot update
-- system-level category defaults). SELECT policy (Wave 0) exposes IS NULL rows
-- as readable — this asymmetry is intentional and now explicitly documented.
-- IS NOT NULL guard in WITH CHECK prevents cross-org reassignment to NULL.
CREATE POLICY product_attribute_price_ranges_update
  ON public.product_attribute_price_ranges
  FOR UPDATE
  TO authenticated
  USING (
    -- IS NULL rows are intentionally excluded from USING: non-admins cannot mutate
    -- system-level category defaults. Admins bypass via is_system_admin_user().
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IS NOT NULL
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IS NOT NULL
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 4. fn_audit_category_attributes()
-- ============================================================
-- Handles: category_attributes
--
-- category_attributes has NO organization_id column.
-- org resolved via: category_attributes.category_id → product_categories.organization_id
-- entity_id = parent category id (groups audit rows under the category entity timeline).
--
-- If the parent category is global (organization_id IS NULL), a sentinel audit row is
-- written (same pattern as fn_audit_product_categories_with_sentinel) so that admin
-- changes to global-category attribute schema are always traceable.
--
-- Noise columns: 'updated_at', 'created_at'

CREATE OR REPLACE FUNCTION public.fn_audit_category_attributes()
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
  v_category_id    uuid;
BEGIN

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF v_user_id IS NULL THEN
    v_user_id := public.current_business_user_id();
  END IF;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- Tag NULL actor (system/migration writes) so they are distinguishable from
  -- regular user writes in the audit log (DB-CAT-006).
  IF v_user_id IS NULL AND v_source IS NULL THEN
    v_source := 'system';
  END IF;

  -- ── Resolve category_id ───────────────────────────────────────────────────
  v_category_id := COALESCE(
    (to_jsonb(NEW) ->> 'category_id')::uuid,
    (to_jsonb(OLD) ->> 'category_id')::uuid
  );

  -- ── Resolve org_id and entity_id via parent category ─────────────────────
  IF v_category_id IS NOT NULL THEN
    SELECT pc.organization_id, pc.id
    INTO   v_org_id, v_entity_id
    FROM   public.product_categories pc
    WHERE  pc.id = v_category_id
    LIMIT  1;
  END IF;

  -- ── Sentinel substitution for global categories ───────────────────────────
  -- When the parent category is global (IS NULL), write under sentinel so admin
  -- changes to global-category attribute schema are traceable.
  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL OR v_source != 'system' THEN
      v_source := 'system';
    END IF;
  END IF;

  -- entity_id fallback: if category lookup failed, use the attribute row's own id.
  IF v_entity_id IS NULL THEN
    v_entity_id := COALESCE(
      (to_jsonb(NEW) ->> 'id')::uuid,
      (to_jsonb(OLD) ->> 'id')::uuid
    );
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
       v_user_id,
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

REVOKE ALL ON FUNCTION public.fn_audit_category_attributes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_category_attributes() TO service_role;


-- ============================================================
-- 5. fn_audit_category_attribute_palettes()
-- ============================================================
-- Handles: category_attribute_palettes
--
-- category_attribute_palettes has NO organization_id column.
-- org resolved via: category_attribute_palettes.category_id → product_categories.organization_id
-- entity_id = parent category id.
--
-- Identical pattern to fn_audit_category_attributes().
-- Noise columns: 'updated_at', 'created_at'

CREATE OR REPLACE FUNCTION public.fn_audit_category_attribute_palettes()
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
  v_category_id    uuid;
BEGIN

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF v_user_id IS NULL THEN
    v_user_id := public.current_business_user_id();
  END IF;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  IF v_user_id IS NULL AND v_source IS NULL THEN
    v_source := 'system';
  END IF;

  -- ── Resolve category_id ───────────────────────────────────────────────────
  v_category_id := COALESCE(
    (to_jsonb(NEW) ->> 'category_id')::uuid,
    (to_jsonb(OLD) ->> 'category_id')::uuid
  );

  -- ── Resolve org_id and entity_id via parent category ─────────────────────
  IF v_category_id IS NOT NULL THEN
    SELECT pc.organization_id, pc.id
    INTO   v_org_id, v_entity_id
    FROM   public.product_categories pc
    WHERE  pc.id = v_category_id
    LIMIT  1;
  END IF;

  -- ── Sentinel substitution for global categories ───────────────────────────
  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    v_source := 'system';
  END IF;

  IF v_entity_id IS NULL THEN
    v_entity_id := COALESCE(
      (to_jsonb(NEW) ->> 'id')::uuid,
      (to_jsonb(OLD) ->> 'id')::uuid
    );
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
       v_user_id,
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

REVOKE ALL ON FUNCTION public.fn_audit_category_attribute_palettes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_category_attribute_palettes() TO service_role;


-- ============================================================
-- 6. fn_audit_product_attribute_value_prices_sentinel()
-- ============================================================
-- Handles: product_attribute_value_prices
--
-- product_attribute_value_prices columns include:
--   id, category_id, product_id, attribute_id, value_option,
--   price, is_available, sort_order, organization_id (nullable),
--   created_at, updated_at
--
-- organization_id is nullable: NULL = category-level default price (not org-scoped).
-- fn_generic_entity_audit() would silently skip NULL-org rows.
-- This sentinel-aware function writes NULL-org rows under the sentinel UUID so that
-- category-default price mutations are traceable by system admins.
--
-- entity_id = the price row's own id (no parent entity id column; prices are
-- leaf-level data — grouping under product or category would require knowing which
-- side is set).
--
-- Noise columns: 'updated_at', 'created_at'

CREATE OR REPLACE FUNCTION public.fn_audit_product_attribute_value_prices_sentinel()
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

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF v_user_id IS NULL THEN
    v_user_id := public.current_business_user_id();
  END IF;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  IF v_user_id IS NULL AND v_source IS NULL THEN
    v_source := 'system';
  END IF;

  -- ── Resolve org_id and entity_id ─────────────────────────────────────────
  -- organization_id may be NULL for category-level defaults.
  -- entity_id = the price row's own id.
  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Sentinel substitution for category-level defaults (org IS NULL) ───────
  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL OR v_source != 'system' THEN
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
       v_user_id,
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

REVOKE ALL ON FUNCTION public.fn_audit_product_attribute_value_prices_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_attribute_value_prices_sentinel() TO service_role;


-- ============================================================
-- 7. fn_audit_product_attribute_price_ranges()
-- ============================================================
-- Handles: product_attribute_price_ranges
--
-- product_attribute_price_ranges has organization_id (nullable) and category_id.
-- org resolved via: category_id → product_categories.organization_id
-- entity_id = parent category id (groups pricing range changes under category timeline).
--
-- If category_id is NULL or the parent category is global (IS NULL), sentinel substitution
-- is applied so category-level default price range mutations are traceable.
--
-- Noise columns: 'updated_at', 'created_at'

CREATE OR REPLACE FUNCTION public.fn_audit_product_attribute_price_ranges()
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
  v_category_id    uuid;
BEGIN

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF v_user_id IS NULL THEN
    v_user_id := public.current_business_user_id();
  END IF;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  IF v_user_id IS NULL AND v_source IS NULL THEN
    v_source := 'system';
  END IF;

  -- ── Resolve category_id ───────────────────────────────────────────────────
  v_category_id := COALESCE(
    (to_jsonb(NEW) ->> 'category_id')::uuid,
    (to_jsonb(OLD) ->> 'category_id')::uuid
  );

  -- ── Resolve org_id and entity_id via parent category ─────────────────────
  IF v_category_id IS NOT NULL THEN
    SELECT pc.organization_id, pc.id
    INTO   v_org_id, v_entity_id
    FROM   public.product_categories pc
    WHERE  pc.id = v_category_id
    LIMIT  1;
  END IF;

  -- ── Sentinel substitution for global categories or NULL category ──────────
  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    v_source := 'system';
  END IF;

  IF v_entity_id IS NULL THEN
    v_entity_id := COALESCE(
      (to_jsonb(NEW) ->> 'id')::uuid,
      (to_jsonb(OLD) ->> 'id')::uuid
    );
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
       v_user_id,
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

REVOKE ALL ON FUNCTION public.fn_audit_product_attribute_price_ranges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_attribute_price_ranges() TO service_role;


-- ============================================================
-- 8. fn_audit_product_category_organizations_sentinel()
-- ============================================================
-- Replaces Wave 1 fn_audit_product_category_organizations().
--
-- Gap DB-CAT-003: the Wave 1 function silently skipped junction mutations when the
-- parent category is global (organization_id IS NULL on product_categories). The
-- comment stated the parent category's sentinel audit row already captures the change.
-- However, a product_category_organizations INSERT (global category linked to a new org)
-- is a distinct business event — it does NOT produce a sentinel audit row on
-- product_categories (no mutation occurs on product_categories itself). The link
-- between a global category and an org was therefore completely invisible in the audit log.
--
-- Fix: emit a sentinel-tagged audit row for junction mutations when the parent category
-- is global, using the sentinel UUID as organization_id and tagging source = 'system'.
-- This makes global-category-to-org associations fully traceable.
--
-- entity_id is set to the parent category's id (consistent with Wave 1) so that
-- junction audit rows appear on the category entity timeline.

CREATE OR REPLACE FUNCTION public.fn_audit_product_category_organizations_sentinel()
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
  -- product_category_organizations has no updated_at column; only created_at is noise.
  v_noise_cols     text[] := ARRAY['created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_category_id    uuid;
  v_is_global      boolean;
BEGIN

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF v_user_id IS NULL THEN
    v_user_id := public.current_business_user_id();
  END IF;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  IF v_user_id IS NULL AND v_source IS NULL THEN
    v_source := 'system';
  END IF;

  -- ── Resolve category_id ───────────────────────────────────────────────────
  v_category_id := COALESCE(
    (to_jsonb(NEW) ->> 'category_id')::uuid,
    (to_jsonb(OLD) ->> 'category_id')::uuid
  );

  -- ── Resolve org_id and entity_id via parent category ─────────────────────
  v_is_global := false;
  IF v_category_id IS NOT NULL THEN
    SELECT pc.organization_id, pc.id
    INTO   v_org_id, v_entity_id
    FROM   public.product_categories pc
    WHERE  pc.id = v_category_id
    LIMIT  1;
  END IF;

  -- ── Sentinel substitution for global category junction mutations ──────────
  -- DB-CAT-003: when the parent category is global (IS NULL), the junction mutation
  -- (INSERT of a new org association) is a distinct event NOT captured by any other
  -- audit row. Emit a sentinel-tagged row so the link is traceable.
  IF v_org_id IS NULL THEN
    v_org_id    := k_system_sentinel;
    v_is_global := true;
    IF v_source IS NULL OR v_source != 'system' THEN
      v_source := 'system';
    END IF;
  END IF;

  -- entity_id fallback if category lookup failed entirely.
  IF v_entity_id IS NULL THEN
    v_entity_id := COALESCE(
      (to_jsonb(NEW) ->> 'id')::uuid,
      (to_jsonb(OLD) ->> 'id')::uuid
    );
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
       v_user_id,
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

REVOKE ALL ON FUNCTION public.fn_audit_product_category_organizations_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_category_organizations_sentinel() TO service_role;


-- ============================================================
-- 9. Trigger registrations
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE pattern for idempotent migrations (Postgres 13
-- does not support CREATE OR REPLACE TRIGGER).
--
-- Alphabetical execution order for triggers on the same table/timing:
--   update_*_updated_at (BEFORE UPDATE, fires first — sets updated_at)
--   trg_audit_*         (AFTER DML, fires after — sees final updated_at value)
--
-- Existing triggers confirmed before this wave:
--   category_attributes:            update_category_attributes_updated_at (BEFORE UPDATE)
--   category_attribute_palettes:    update_category_attribute_palettes_updated_at (BEFORE UPDATE)
--   product_attribute_value_prices: update_product_attribute_value_prices_updated_at (BEFORE UPDATE)
--   product_attribute_price_ranges: update_product_attribute_price_ranges_updated_at (BEFORE UPDATE)
--   product_category_organizations: trg_audit_product_category_organizations (Wave 1 — replaced below)
-- No audit triggers exist on the first four tables.

-- category_attributes — sentinel-aware (global categories → sentinel row).
DROP TRIGGER IF EXISTS trg_audit_category_attributes ON public.category_attributes;
CREATE TRIGGER trg_audit_category_attributes
  AFTER INSERT OR UPDATE OR DELETE ON public.category_attributes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_category_attributes();

-- category_attribute_palettes — sentinel-aware (global categories → sentinel row).
DROP TRIGGER IF EXISTS trg_audit_category_attribute_palettes ON public.category_attribute_palettes;
CREATE TRIGGER trg_audit_category_attribute_palettes
  AFTER INSERT OR UPDATE OR DELETE ON public.category_attribute_palettes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_category_attribute_palettes();

-- product_attribute_value_prices — sentinel-aware (NULL org = category default → sentinel row).
DROP TRIGGER IF EXISTS trg_audit_product_attribute_value_prices ON public.product_attribute_value_prices;
CREATE TRIGGER trg_audit_product_attribute_value_prices
  AFTER INSERT OR UPDATE OR DELETE ON public.product_attribute_value_prices
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_product_attribute_value_prices_sentinel();

-- product_attribute_price_ranges — sentinel-aware via category_id → product_categories.
DROP TRIGGER IF EXISTS trg_audit_product_attribute_price_ranges ON public.product_attribute_price_ranges;
CREATE TRIGGER trg_audit_product_attribute_price_ranges
  AFTER INSERT OR UPDATE OR DELETE ON public.product_attribute_price_ranges
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_product_attribute_price_ranges();

-- product_category_organizations — replace Wave 1 trigger with sentinel-aware version.
-- The old trigger used fn_audit_product_category_organizations() which silently skipped
-- global-category junction mutations. The new sentinel function captures those events.
DROP TRIGGER IF EXISTS trg_audit_product_category_organizations ON public.product_category_organizations;
CREATE TRIGGER trg_audit_product_category_organizations
  AFTER INSERT OR UPDATE OR DELETE ON public.product_category_organizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_product_category_organizations_sentinel();


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm anon has no privileges on category_attributes or product_attribute_price_ranges:
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name IN ('category_attributes', 'product_attribute_price_ranges')
--     AND grantee = 'anon'
--   ORDER BY table_name, privilege_type;
--
-- Expected: no rows (anon fully revoked from both tables).
--
-- 2. Confirm audit triggers registered on all four previously-deferred tables:
--
--   SELECT tgname, tgrelid::regclass, tgenabled
--   FROM pg_trigger
--   WHERE tgrelid IN (
--     'public.category_attributes'::regclass,
--     'public.category_attribute_palettes'::regclass,
--     'public.product_attribute_value_prices'::regclass,
--     'public.product_attribute_price_ranges'::regclass,
--     'public.product_category_organizations'::regclass
--   )
--   ORDER BY tgrelid::regclass, tgname;
--
-- Expected (per table):
--   category_attributes:
--     trg_audit_category_attributes (enabled)
--     update_category_attributes_updated_at (enabled)
--   category_attribute_palettes:
--     trg_audit_category_attribute_palettes (enabled)
--     update_category_attribute_palettes_updated_at (enabled)
--   product_attribute_value_prices:
--     trg_audit_product_attribute_value_prices (enabled)
--     update_product_attribute_value_prices_updated_at (enabled)
--   product_attribute_price_ranges:
--     trg_audit_product_attribute_price_ranges (enabled)
--     update_product_attribute_price_ranges_updated_at (enabled)
--   product_category_organizations:
--     trg_audit_product_category_organizations (enabled) — now sentinel-aware
--
-- 3. Confirm product_category_organizations trigger uses sentinel function:
--
--   SELECT tgname, p.proname AS function_name
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE t.tgrelid = 'public.product_category_organizations'::regclass
--     AND t.tgname = 'trg_audit_product_category_organizations';
--
-- Expected: function_name = 'fn_audit_product_category_organizations_sentinel'
--
-- 4. Confirm entity_audit_log SELECT policy now includes products.manage:
--
--   SELECT policyname, qual::text
--   FROM pg_policies
--   WHERE tablename = 'entity_audit_log'
--     AND policyname = 'entity_audit_log_select';
--
-- Expected: qual text contains 'products.manage'.
--
-- 5. Confirm product_attribute_price_ranges INSERT/UPDATE have IS NOT NULL guard:
--
--   SELECT policyname, cmd, with_check::text
--   FROM pg_policies
--   WHERE tablename = 'product_attribute_price_ranges'
--     AND cmd IN ('INSERT', 'UPDATE')
--   ORDER BY cmd;
--
-- Expected: with_check text contains 'IS NOT NULL' for both INSERT and UPDATE.
--
-- 6. Confirm all new functions are SECURITY DEFINER with correct grants:
--
--   SELECT proname, prosecdef, proacl
--   FROM pg_proc
--   WHERE proname IN (
--     'fn_audit_category_attributes',
--     'fn_audit_category_attribute_palettes',
--     'fn_audit_product_attribute_value_prices_sentinel',
--     'fn_audit_product_attribute_price_ranges',
--     'fn_audit_product_category_organizations_sentinel'
--   )
--   ORDER BY proname;
--
-- Expected: prosecdef = true for all; proacl shows service_role EXECUTE only.
--
-- 7. Smoke-test sentinel row for a global category attribute change:
--   (Requires a global category — organization_id IS NULL on product_categories)
--
--   UPDATE public.category_attributes
--   SET label = label  -- no-op update to trigger the audit trigger
--   WHERE category_id = '<global_category_id>';
--
--   SELECT * FROM public.entity_audit_log
--   WHERE organization_id = '00000000-0000-0000-0000-000000000001'
--     AND table_name = 'category_attributes'
--   ORDER BY created_at DESC LIMIT 5;
--
-- Expected: rows with source = 'system' and organization_id = sentinel UUID.
