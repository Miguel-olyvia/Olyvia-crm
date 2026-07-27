-- Subcategories Audit Triggers — Wave 8
-- 2026-07-06 | Module: Categories/Subcategories | Wave: 8 (audit correctness)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_product_categories_with_sentinel() — replace Wave 1 function.
--      Add parent-chain org resolution for subcategory rows (parent_id IS NOT NULL)
--      where organization_id IS NULL. Previously such rows incorrectly used the
--      sentinel UUID instead of resolving the real org via parent_id.
--      Uses get_product_category_org_id() from Wave 7.
--   2. fn_audit_category_attributes() — replace Wave 4 function.
--      When category_id points to a subcategory row (parent_id IS NOT NULL,
--      organization_id IS NULL), the existing function walks to the sentinel.
--      Fix: after resolving pc.organization_id, if it IS NULL and pc has a parent,
--      walk the parent chain via get_product_category_org_id(COALESCE(pc.parent_id,
--      pc.parent_category_id)) before falling back to sentinel substitution.
--   3. fn_audit_category_attribute_palettes() — same fix as section 2.
--   4. fn_audit_product_attribute_price_ranges() — same fix as section 2.
--      (fn_audit_product_attribute_value_prices_sentinel operates on organization_id
--      directly on the row; it has no category_id walk, so no fix needed there.)
--   5. Trigger re-registrations — all four triggers already exist; DROP IF EXISTS +
--      CREATE is idempotent. No new triggers are needed; the existing trigger names
--      and tables are unchanged — only the function bodies are updated via
--      CREATE OR REPLACE.
--   6. REVOKE/GRANT — function grants unchanged from prior waves; re-asserted here
--      for completeness.
--
-- All functions follow the conventions established in fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and fn_audit_brands_with_sentinel()
-- (20260705030000_brands_audit_coverage.sql):
--   • SECURITY DEFINER + pinned search_path = public, pg_temp
--   • Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   • NULL actor tagged source = 'system'
--   • UPDATE rows skipped when only noise columns changed
--   • Any exception swallowed — audit trigger NEVER blocks originating DML
--   • changed_fields: { "col": { "old": <v>, "new": <v> } } for UPDATE; NULL for INSERT/DELETE
--
-- Gaps addressed:
--   SUB-001 (CRITICAL, first set) — fn_audit_product_categories_with_sentinel fires on
--     all product_categories rows but has no parent-chain awareness. Subcategory rows with
--     organization_id IS NULL are silently tagged as source='system' under the sentinel UUID,
--     making those audit rows unattributable to the correct organization.
--   SUB-004 (HIGH) — fn_audit_category_attributes, fn_audit_category_attribute_palettes,
--     fn_audit_product_attribute_price_ranges all resolve org via
--     category_id → product_categories.organization_id. When category_id points to a
--     subcategory row (parent_id IS NOT NULL) with organization_id IS NULL, all three
--     functions apply sentinel substitution instead of resolving the real org via the
--     parent chain.
--
-- Prerequisites:
--   20260706010000_categories_audit_triggers.sql (Wave 1 — defines base trigger registrations)
--   20260706040000_categories_audit_coverage.sql (Wave 4 — defines Wave 4 satellite functions)
--   20260706070000_subcategories_rls_permissions.sql (Wave 7 — defines
--     get_product_category_org_id() used in section 1)
--
-- Dual parent columns (SUB-006):
--   product_categories has two nullable self-referencing FKs:
--     parent_id          — FK with ON DELETE CASCADE (line 20041 of baseline)
--     parent_category_id — FK with ON DELETE SET NULL (line 20033 of baseline)
--   The correct COALESCE pattern is COALESCE(parent_id, parent_category_id), matching
--   get_category_attribute_options() (baseline lines 2962, 5127) and the new helper
--   get_product_category_org_id() (Wave 7 section 1).
--   In trigger context both columns are read from NEW/OLD via to_jsonb(), so the
--   COALESCE is applied directly on the jsonb extraction.
--
-- Trigger duplicate check:
--   trg_audit_product_categories — exists since Wave 1 on product_categories.
--   trg_audit_category_attributes — exists since Wave 4 on category_attributes.
--   trg_audit_category_attribute_palettes — exists since Wave 4 on category_attribute_palettes.
--   trg_audit_product_attribute_price_ranges — exists since Wave 4 on product_attribute_price_ranges.
--   All four are dropped and recreated (DROP IF EXISTS + CREATE, idempotent) to point at
--   the updated function bodies. The function names are UNCHANGED (CREATE OR REPLACE).
--   No new triggers are added.


-- ============================================================
-- 1. fn_audit_product_categories_with_sentinel() — replace Wave 1
-- ============================================================
-- Handles: product_categories
--
-- Change vs Wave 1:
--   After resolving v_org_id from COALESCE(NEW.organization_id, OLD.organization_id),
--   when v_org_id IS NULL, first attempt to resolve org via the parent chain before
--   falling back to the sentinel. This covers subcategory rows where organization_id
--   IS NULL but a parent row exists with a non-NULL organization_id.
--
--   Sentinel substitution is retained for:
--     (a) Truly global root categories (organization_id IS NULL, parent_id IS NULL,
--         parent_category_id IS NULL) — no parent chain to walk.
--     (b) Subcategory rows whose entire parent chain resolves to NULL (e.g., the parent
--         is itself a global root category). These are tagged as source='system'.
--
--   entity_id = product_categories.id (unchanged from Wave 1).
--   Noise columns: 'updated_at', 'created_at' (unchanged from Wave 1).

CREATE OR REPLACE FUNCTION public.fn_audit_product_categories_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Sentinel org for global categories (organization_id IS NULL with no resolvable parent).
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
  v_parent_id      uuid;
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

  -- Tag NULL actor (system/migration writes) so they are distinguishable
  -- from regular user writes in the audit log (DB-CAT-006).
  IF v_user_id IS NULL AND v_source IS NULL THEN
    v_source := 'system';
  END IF;

  -- ── Resolve org_id and entity_id ─────────────────────────────────────────
  -- entity_id = row's own id (no separate entity_id column on product_categories).
  v_org_id    := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Parent-chain walk for subcategory rows with NULL org (SUB-001) ────────
  -- When organization_id IS NULL on the row itself, attempt to resolve via the
  -- parent chain. This correctly attributes subcategory audit rows to the org
  -- of their root parent category, avoiding the sentinel misclassification.
  --
  -- COALESCE(parent_id, parent_category_id) handles both FK columns (SUB-006).
  -- get_product_category_org_id() is STABLE SECURITY DEFINER — safe to call
  -- from within a trigger function.
  IF v_org_id IS NULL THEN
    v_parent_id := COALESCE(
      (to_jsonb(NEW) ->> 'parent_id')::uuid,
      (to_jsonb(OLD) ->> 'parent_id')::uuid,
      (to_jsonb(NEW) ->> 'parent_category_id')::uuid,
      (to_jsonb(OLD) ->> 'parent_category_id')::uuid
    );
    IF v_parent_id IS NOT NULL THEN
      v_org_id := public.get_product_category_org_id(v_parent_id);
    END IF;
  END IF;

  -- ── Sentinel substitution ─────────────────────────────────────────────────
  -- Only applied when the parent chain also resolves to NULL (true global root,
  -- or subcategory whose entire parent chain is global/unresolvable).
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
       v_user_id,
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
-- 2. fn_audit_category_attributes() — replace Wave 4 (SUB-004)
-- ============================================================
-- Handles: category_attributes
--
-- Change vs Wave 4:
--   After resolving pc.organization_id via category_id → product_categories,
--   when v_org_id IS NULL, check if the resolved product_categories row itself
--   has a parent (pc.parent_id or pc.parent_category_id IS NOT NULL). If so,
--   walk the parent chain via get_product_category_org_id() before falling back
--   to sentinel substitution.
--
--   This fixes the case where category_id on category_attributes points to a
--   subcategory row (parent_id IS NOT NULL, organization_id IS NULL). Previously
--   the function would resolve pc.organization_id = NULL and immediately apply
--   the sentinel, misclassifying the audit row as source='system' when the real
--   org is resolvable via the subcategory's parent.
--
--   entity_id = parent category id (groups audit rows under category timeline).
--   Noise columns: 'updated_at', 'created_at'.

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
  v_cat_parent_id  uuid;
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

  -- ── Resolve org_id and entity_id via the category row ────────────────────
  -- entity_id = parent category id (groups attribute audit rows under category timeline).
  IF v_category_id IS NOT NULL THEN
    SELECT pc.organization_id,
           pc.id,
           COALESCE(pc.parent_id, pc.parent_category_id)
    INTO   v_org_id, v_entity_id, v_cat_parent_id
    FROM   public.product_categories pc
    WHERE  pc.id = v_category_id
    LIMIT  1;
  END IF;

  -- ── Parent-chain walk when category is a subcategory with NULL org (SUB-004) ──
  -- If the resolved category has no organization_id but has a parent, the category
  -- is a subcategory. Walk the parent chain to find the real org rather than
  -- falling through to sentinel substitution.
  IF v_org_id IS NULL AND v_cat_parent_id IS NOT NULL THEN
    v_org_id := public.get_product_category_org_id(v_cat_parent_id);
  END IF;

  -- ── Sentinel substitution ─────────────────────────────────────────────────
  -- Only for global root categories (no parent, no org) or fully unresolvable chains.
  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL OR v_source != 'system' THEN
      v_source := 'system';
    END IF;
  END IF;

  -- entity_id fallback: if category lookup failed entirely, use the attribute row's own id.
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
-- 3. fn_audit_category_attribute_palettes() — replace Wave 4 (SUB-004)
-- ============================================================
-- Handles: category_attribute_palettes
--
-- Identical fix pattern to fn_audit_category_attributes() (section 2):
-- walk the parent chain via get_product_category_org_id() when the resolved
-- category has NULL organization_id but a non-NULL parent.
--
-- entity_id = parent category id.
-- Noise columns: 'updated_at', 'created_at'.

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
  v_cat_parent_id  uuid;
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

  -- ── Resolve org_id and entity_id via the category row ────────────────────
  IF v_category_id IS NOT NULL THEN
    SELECT pc.organization_id,
           pc.id,
           COALESCE(pc.parent_id, pc.parent_category_id)
    INTO   v_org_id, v_entity_id, v_cat_parent_id
    FROM   public.product_categories pc
    WHERE  pc.id = v_category_id
    LIMIT  1;
  END IF;

  -- ── Parent-chain walk when category is a subcategory with NULL org (SUB-004) ──
  IF v_org_id IS NULL AND v_cat_parent_id IS NOT NULL THEN
    v_org_id := public.get_product_category_org_id(v_cat_parent_id);
  END IF;

  -- ── Sentinel substitution ─────────────────────────────────────────────────
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
-- 4. fn_audit_product_attribute_price_ranges() — replace Wave 4 (SUB-004)
-- ============================================================
-- Handles: product_attribute_price_ranges
--
-- Identical fix pattern to sections 2 and 3:
-- after resolving pc.organization_id via category_id → product_categories,
-- walk the parent chain if the resolved category has NULL org but a non-NULL parent.
--
-- entity_id = parent category id (groups pricing range changes under category timeline).
-- Noise columns: 'updated_at', 'created_at'.
--
-- Note: fn_audit_product_attribute_value_prices_sentinel() (Wave 4) resolves org
-- directly from the price row's own organization_id column (not via category_id join).
-- It is NOT affected by SUB-004 and is therefore NOT replaced in this migration.

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
  v_cat_parent_id  uuid;
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

  -- ── Resolve org_id and entity_id via the category row ────────────────────
  IF v_category_id IS NOT NULL THEN
    SELECT pc.organization_id,
           pc.id,
           COALESCE(pc.parent_id, pc.parent_category_id)
    INTO   v_org_id, v_entity_id, v_cat_parent_id
    FROM   public.product_categories pc
    WHERE  pc.id = v_category_id
    LIMIT  1;
  END IF;

  -- ── Parent-chain walk when category is a subcategory with NULL org (SUB-004) ──
  IF v_org_id IS NULL AND v_cat_parent_id IS NOT NULL THEN
    v_org_id := public.get_product_category_org_id(v_cat_parent_id);
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
-- 5. Trigger re-registrations
-- ============================================================
-- All four triggers already exist from prior waves (Wave 1 and Wave 4).
-- DROP IF EXISTS + CREATE is idempotent and required because Postgres 13+
-- does not support CREATE OR REPLACE TRIGGER.
-- Function names are UNCHANGED — only the bodies were updated via CREATE OR REPLACE.
-- The trigger registrations below are reproduced here for completeness and to
-- ensure the trigger → function binding is verifiable in a single migration file.

-- product_categories — sentinel-aware + parent-chain walk (Wave 8 version).
DROP TRIGGER IF EXISTS trg_audit_product_categories ON public.product_categories;
CREATE TRIGGER trg_audit_product_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_product_categories_with_sentinel();

-- category_attributes — parent-chain-aware (Wave 8 version).
DROP TRIGGER IF EXISTS trg_audit_category_attributes ON public.category_attributes;
CREATE TRIGGER trg_audit_category_attributes
  AFTER INSERT OR UPDATE OR DELETE ON public.category_attributes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_category_attributes();

-- category_attribute_palettes — parent-chain-aware (Wave 8 version).
DROP TRIGGER IF EXISTS trg_audit_category_attribute_palettes ON public.category_attribute_palettes;
CREATE TRIGGER trg_audit_category_attribute_palettes
  AFTER INSERT OR UPDATE OR DELETE ON public.category_attribute_palettes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_category_attribute_palettes();

-- product_attribute_price_ranges — parent-chain-aware (Wave 8 version).
DROP TRIGGER IF EXISTS trg_audit_product_attribute_price_ranges ON public.product_attribute_price_ranges;
CREATE TRIGGER trg_audit_product_attribute_price_ranges
  AFTER INSERT OR UPDATE OR DELETE ON public.product_attribute_price_ranges
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_product_attribute_price_ranges();


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm all four triggers still point at the correct functions:
--
--   SELECT t.tgname, t.tgrelid::regclass, p.proname AS function_name
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE t.tgname IN (
--     'trg_audit_product_categories',
--     'trg_audit_category_attributes',
--     'trg_audit_category_attribute_palettes',
--     'trg_audit_product_attribute_price_ranges'
--   )
--   ORDER BY t.tgname;
--
-- Expected:
--   trg_audit_category_attribute_palettes | category_attribute_palettes    | fn_audit_category_attribute_palettes
--   trg_audit_category_attributes         | category_attributes            | fn_audit_category_attributes
--   trg_audit_product_attribute_price_ranges | product_attribute_price_ranges | fn_audit_product_attribute_price_ranges
--   trg_audit_product_categories          | product_categories             | fn_audit_product_categories_with_sentinel
--
-- 2. Confirm fn_audit_product_categories_with_sentinel no longer sentinel-tags
--    subcategory rows whose parent has a resolvable org:
--
--   -- Insert a test subcategory row with organization_id = NULL under a root category
--   -- that has organization_id = '<real_org_uuid>'.
--   -- Then check entity_audit_log:
--
--   SELECT organization_id, source, table_name, operation
--   FROM public.entity_audit_log
--   WHERE table_name = 'product_categories'
--     AND entity_id = '<test_subcategory_id>'
--   ORDER BY created_at DESC LIMIT 1;
--
-- Expected: organization_id = '<real_org_uuid>' (NOT the sentinel UUID), source NULL or user-set.
--
-- 3. Confirm sentinel substitution still fires for true global root categories:
--
--   -- Update a root category with organization_id IS NULL and parent_id IS NULL.
--   SELECT organization_id, source FROM public.entity_audit_log
--   WHERE table_name = 'product_categories'
--     AND entity_id = '<global_root_category_id>'
--   ORDER BY created_at DESC LIMIT 1;
--
-- Expected: organization_id = '00000000-0000-0000-0000-000000000001', source = 'system'.
--
-- 4. Confirm fn_audit_category_attributes correctly resolves org for attributes
--    linked to a subcategory row with NULL org:
--
--   -- As above: the subcategory has organization_id IS NULL, parent has a real org.
--   SELECT organization_id, source FROM public.entity_audit_log
--   WHERE table_name = 'category_attributes'
--     AND entity_id = '<subcategory_id>'
--   ORDER BY created_at DESC LIMIT 1;
--
-- Expected: organization_id = '<real_org_uuid>' of the root parent.
--
-- 5. Confirm all four updated functions are SECURITY DEFINER:
--
--   SELECT proname, prosecdef FROM pg_proc
--   WHERE proname IN (
--     'fn_audit_product_categories_with_sentinel',
--     'fn_audit_category_attributes',
--     'fn_audit_category_attribute_palettes',
--     'fn_audit_product_attribute_price_ranges'
--   )
--   ORDER BY proname;
--
-- Expected: prosecdef = true for all four.
