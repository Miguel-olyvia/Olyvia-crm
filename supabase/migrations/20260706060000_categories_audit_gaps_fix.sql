-- Categories Audit Gaps Fix — Wave 6
-- 2026-07-06 | Module: Categories | Wave: 6 (gap closure from audit report)
-- Forward-only migration. Do not fold into the baseline.
--
-- Gaps closed:
--   RLS-CAT-SVC-01 (CRITICAL) — GRANT ALL TO anon on service_categories never revoked
--   RLS-CAT-SVC-02 (HIGH)     — service_categories SELECT/INSERT/DELETE: bare auth.uid(),
--                               no is_system_admin_user bypass, no IS NOT NULL guard on INSERT,
--                               SELECT includes OR organization_id IS NULL with no permission gate
--   RLS-CAT-SVC-03 (HIGH)     — service_categories INSERT/DELETE: bare auth.uid(), no admin bypass,
--                               INSERT has no explicit IS NOT NULL guard
--   DB-CAT-PAPR-ORG-INDEX (HIGH)  — product_attribute_price_ranges: no index on organization_id
--   DB-CAT-PAVP-UPDATE-ISNULL (MEDIUM) — product_attribute_value_prices UPDATE: no explicit
--                                        organization_id IS NOT NULL guard in USING/WITH CHECK
--   DB-CAT-PAVP-ORG-INDEX (MEDIUM)    — product_attribute_value_prices: no dedicated index on
--                                        organization_id alone
--   DB-CAT-CATATTR-ORG-INDEX (MEDIUM) — category_attributes: no index on category_id
--   DB-CAT-DEADVAR-01 (MEDIUM)        — orphan fn_audit_product_category_organizations() from Wave 1
--                                        never dropped; dead v_is_global variable in sentinel function
--   DB-CAT-AUDIT-ENTITY-LOG-SENTINEL (MEDIUM) — sentinel audit rows (org = 00000000...0001)
--                                        not readable by any non-admin user through entity_audit_log
--                                        SELECT policy; entity_audit_log policy updated to expose
--                                        sentinel rows to users holding a qualifying permission
--
-- Convention: (SELECT auth.uid()) correlated subquery pattern throughout,
-- matching 20260623150000_fix_rls_auth_uid_correlated_subquery.sql.
--
-- Prerequisites:
--   20260706000000_categories_security_fixes.sql (Wave 0)
--   20260706040000_categories_audit_coverage.sql  (Wave 4 — defines sentinel functions)
--   20260706050000_categories_rls_hardening.sql   (Wave 5)


-- ============================================================
-- 1. service_categories — REVOKE anon (RLS-CAT-SVC-01 CRITICAL)
-- ============================================================
-- The baseline (20260615130000, line 31108) issued GRANT ALL TO anon on service_categories.
-- No subsequent migration revoked this. RLS is active so policies still filter rows, but
-- anon retains table-level DML privilege — any future policy gap immediately exposes the
-- table (including org-scoped subcategory rows) to unauthenticated writes and deletes.

REVOKE ALL ON TABLE public.service_categories FROM anon;

-- Restore only scoped DML for authenticated (consistent with every other module table).
-- service_role retains ALL (already granted in baseline, untouched by this migration).
REVOKE ALL ON TABLE public.service_categories FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_categories TO authenticated;


-- ============================================================
-- 2. service_categories — replace SELECT, INSERT, DELETE policies
--    (RLS-CAT-SVC-02 HIGH + RLS-CAT-SVC-03 HIGH)
-- ============================================================
-- Baseline problems (confirmed at lines 27738–27762):
--   SELECT (line 27755):
--     a) Bare auth.uid() calls — per-row re-evaluation.
--     b) No is_system_admin_user bypass.
--     c) Root-category arm includes OR organization_id IS NULL with no permission gate:
--        any authenticated user can read service categories whose org IS NULL.
--   INSERT (line 27748):
--     a) Bare auth.uid() calls.
--     b) No is_system_admin_user bypass.
--     c) No explicit organization_id IS NOT NULL guard (root arm relies on org IN (subquery)
--        which evaluates NULL IN (...) = NULL implicitly — undocumented fragility).
--   DELETE (line 27741):
--     a) Bare auth.uid() calls.
--     b) No is_system_admin_user bypass.
--
-- UPDATE was fixed in 20260629200000_services_rls_fixes.sql (WITH CHECK added) but still
-- uses bare auth.uid() calls for the correlated subquery fix needed here. Replaced below
-- to complete the correlated-subquery fix set consistently.
--
-- Root vs subcategory split: service_categories stores both roots (parent_id IS NULL)
-- and subcategories (parent_id IS NOT NULL) in one table.
-- Root-level org comes from organization_id; subcategory org is resolved via
-- get_service_category_org_id(parent_id) (baseline function, line 3866).
--
-- Global service categories (root with organization_id IS NULL):
--   Unlike product_categories which has an explicit global-category concept,
--   service_categories is org-scoped by design (INSERT policy requires org visible).
--   The OR organization_id IS NULL arm in the baseline SELECT was undocumented and
--   wider than intended. Removed in this replacement — consistent with IS NOT NULL
--   guard on INSERT and the same design intent applied to product_categories Wave 0.
--
-- is_system_admin_user bypass: added to all four policies, consistent with the
-- module-wide pattern applied to every other table in this migration set.

-- Drop all four policies to replace (UPDATE also replaced to add correlated subquery fix).
DROP POLICY IF EXISTS "service_categories_select" ON public.service_categories;
DROP POLICY IF EXISTS service_categories_select ON public.service_categories;
DROP POLICY IF EXISTS "service_categories_insert" ON public.service_categories;
DROP POLICY IF EXISTS service_categories_insert ON public.service_categories;
DROP POLICY IF EXISTS "service_categories_update" ON public.service_categories;
DROP POLICY IF EXISTS service_categories_update ON public.service_categories;
DROP POLICY IF EXISTS "service_categories_delete" ON public.service_categories;
DROP POLICY IF EXISTS service_categories_delete ON public.service_categories;

-- SELECT: org-scoped (root org + subcategory parent walk).
--   IS NULL arm removed (see note above). Admins bypass via is_system_admin_user.
CREATE POLICY service_categories_select
  ON public.service_categories
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      -- Root categories: org is directly on the row and must be in visible orgs.
      (parent_id IS NULL)
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      -- Subcategories: org resolved via parent root category.
      (parent_id IS NOT NULL)
      AND public.get_service_category_org_id(parent_id) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- INSERT: permission gate + explicit org IS NOT NULL for roots.
--   Subcategories inherit org via parent; the org check via get_service_category_org_id
--   already implicitly excludes null-org parents (function returns NULL → NULL IN (...) = NULL).
--   Explicit IS NOT NULL guard added to the root arm to document intent (mirrors the
--   Wave 4 pattern for product_attribute_price_ranges and product_attribute_value_prices).
CREATE POLICY service_categories_insert
  ON public.service_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      -- Root category: create permission + org non-null + visible.
      (parent_id IS NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_categories.create')
      AND organization_id IS NOT NULL
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      -- Subcategory: subcategories.create permission + parent org visible.
      (parent_id IS NOT NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.create')
      AND public.get_service_category_org_id(parent_id) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- UPDATE: edit permission + USING (pre-update row) + WITH CHECK (post-update row).
--   Replaces the 20260629200000_services_rls_fixes.sql version to add:
--   (SELECT auth.uid()) correlated subquery fix and is_system_admin_user bypass.
--   WITH CHECK content preserved from 20260629200000 — prevents lateral-move attacks.
CREATE POLICY service_categories_update
  ON public.service_categories
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      (parent_id IS NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_categories.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      (parent_id IS NOT NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.edit')
      AND public.get_service_category_org_id(parent_id) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      (parent_id IS NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_categories.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      (parent_id IS NOT NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.edit')
      AND public.get_service_category_org_id(parent_id) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- DELETE: permission gate + org scope. Correlated subquery fix applied.
CREATE POLICY service_categories_delete
  ON public.service_categories
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      (parent_id IS NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_categories.delete')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      (parent_id IS NOT NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.delete')
      AND public.get_service_category_org_id(parent_id) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 3. product_attribute_price_ranges — index on organization_id
--    (DB-CAT-PAPR-ORG-INDEX HIGH)
-- ============================================================
-- The RLS SELECT policy on product_attribute_price_ranges filters on
-- organization_id IN (SELECT get_user_visible_org_ids(...)). The baseline has
-- indexes on attribute_id, product_id, category_id, and price_context_id but
-- no standalone index on organization_id. Every authenticated SELECT on this
-- table therefore requires a sequential scan to evaluate the RLS predicate.
--
-- Partial index (WHERE NOT NULL) excludes system-level NULL-org rows (those rows
-- are readable but never owned by an org — the planner uses the partial index for
-- org-scoped lookups and falls back to a full scan for the IS NULL arm, which is
-- expected since IS NULL rows are a small minority).

CREATE INDEX IF NOT EXISTS idx_product_attribute_price_ranges_org
  ON public.product_attribute_price_ranges (organization_id)
  WHERE organization_id IS NOT NULL;


-- ============================================================
-- 4. product_attribute_value_prices — index on organization_id
--    (DB-CAT-PAVP-ORG-INDEX MEDIUM)
-- ============================================================
-- The existing partial unique indexes (product_attribute_value_prices_global_unique,
-- product_attribute_value_prices_product_unique) have organization_id as a leading
-- key BUT only cover rows that also constrain attribute_id and value_option.
-- An org-scoped query without those constraints (e.g., loading all prices for an org)
-- requires a full table scan. The partial index below supports the RLS filter and
-- org-scoped bulk lookups without duplicating the existing partial unique coverage.

CREATE INDEX IF NOT EXISTS idx_product_attribute_value_prices_org
  ON public.product_attribute_value_prices (organization_id)
  WHERE organization_id IS NOT NULL;


-- ============================================================
-- 5. category_attributes — index on category_id
--    (DB-CAT-CATATTR-ORG-INDEX MEDIUM)
-- ============================================================
-- The Wave 5 RLS SELECT policy on category_attributes uses an EXISTS subquery:
--   EXISTS (SELECT 1 FROM product_categories pc WHERE pc.id = category_attributes.category_id ...)
-- This join from category_attributes to product_categories via category_id has no
-- supporting index on the category_attributes side. Every RLS evaluation therefore
-- probes product_categories without being able to use the FK efficiently.
-- category_attribute_palettes already has idx_cap_category (baseline line 15599).
-- This index brings category_attributes to parity.

CREATE INDEX IF NOT EXISTS idx_category_attributes_category
  ON public.category_attributes (category_id);


-- ============================================================
-- 6. product_attribute_value_prices UPDATE — explicit IS NOT NULL guard
--    (DB-CAT-PAVP-UPDATE-ISNULL MEDIUM / RLS-CAT-PAVP-01 MEDIUM)
-- ============================================================
-- The INSERT policy (Wave 0, line 342) explicitly includes AND organization_id IS NOT NULL.
-- Wave 4 applied the same explicit guard to product_attribute_price_ranges INSERT and UPDATE
-- with explanatory comments.
-- The UPDATE policy on product_attribute_value_prices has no explicit IS NOT NULL guard
-- in either USING or WITH CHECK. NULL IN (subquery) evaluates to NULL (falsy) so NULL-org
-- rows are incidentally blocked, but the asymmetry between INSERT (explicit) and UPDATE
-- (implicit only) is an undocumented fragility that contradicts the Wave 4 pattern.
--
-- This replacement adds the explicit IS NOT NULL guard to both USING and WITH CHECK,
-- exactly mirroring the Wave 4 treatment of product_attribute_price_ranges UPDATE.
-- USING intentionally excludes IS NULL rows from non-admin UPDATE (consistent with Wave 4
-- rationale: category-default rows are readable but only writable by system admins).

-- The live policy on the remote DB may carry its original baseline name.
-- Drop both names to guarantee the old policy is removed before creating the replacement.
DROP POLICY IF EXISTS "Authenticated users can update attribute value prices" ON public.product_attribute_value_prices;
DROP POLICY IF EXISTS product_attribute_value_prices_update ON public.product_attribute_value_prices;

CREATE POLICY product_attribute_value_prices_update
  ON public.product_attribute_value_prices
  FOR UPDATE
  TO authenticated
  USING (
    -- IS NULL rows intentionally excluded from USING: non-admins cannot mutate
    -- category-default prices. Admins bypass via is_system_admin_user().
    -- This is consistent with Wave 4 treatment of product_attribute_price_ranges UPDATE.
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
-- 7. entity_audit_log SELECT policy — expose sentinel rows
--    (DB-CAT-AUDIT-ENTITY-LOG-SENTINEL MEDIUM / RLS-CAT-AUDIT-01 MEDIUM)
-- ============================================================
-- Current policy gates access on organization_id IN (get_user_visible_org_ids(...)).
-- Sentinel audit rows (for global categories/brands) use organization_id =
-- '00000000-0000-0000-0000-000000000001'. This UUID is not a real org and is never
-- returned by get_user_visible_org_ids(), so sentinel rows are permanently invisible
-- to all authenticated users — even those holding product_categories.view or
-- products.manage who otherwise have full read access to the categories module.
--
-- Fix: add an OR arm that allows users holding a qualifying module permission to read
-- sentinel rows. System admins already bypass RLS entirely so they can always read
-- sentinel rows via service_role; this change extends that visibility to non-admin
-- users who hold at least one recognised module permission.
--
-- The sentinel UUID constant is the same value used in all audit functions in this
-- migration set: '00000000-0000-0000-0000-000000000001'.
-- It must never be used as a real org id.

DROP POLICY IF EXISTS entity_audit_log_select ON public.entity_audit_log;

CREATE POLICY entity_audit_log_select
  ON public.entity_audit_log
  FOR SELECT
  TO authenticated
  USING (
    -- Org-scoped rows: user must be in the org and hold a qualifying permission.
    (
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
    )
    OR
    -- Sentinel rows (global categories/brands): readable to users with a qualifying
    -- module permission. The sentinel UUID is reserved and never a real org.
    -- This restores audit trail visibility for global-category events to non-admin
    -- users who hold product_categories.view or products.manage.
    (
      organization_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND (
        public.has_anew_permission((SELECT auth.uid()), 'products.manage')
        OR public.has_anew_permission((SELECT auth.uid()), 'product_categories.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'brands.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
      )
    )
  );


-- ============================================================
-- 8. Drop orphan fn_audit_product_category_organizations()
--    (DB-CAT-DEADVAR-01 MEDIUM — partial: orphan function cleanup)
-- ============================================================
-- Wave 1 (20260706010000) created fn_audit_product_category_organizations().
-- Wave 4 (20260706040000) replaced the trigger on product_category_organizations
-- to point at fn_audit_product_category_organizations_sentinel() but never dropped
-- the Wave 1 function. The orphan is never called and causes no incorrect behaviour,
-- but it adds noise to the schema and creates confusion for future reviewers who see
-- two similarly-named functions.

DROP FUNCTION IF EXISTS public.fn_audit_product_category_organizations();


-- ============================================================
-- 9. fn_audit_product_category_organizations_sentinel() — remove dead v_is_global
--    (DB-CAT-DEADVAR-01 MEDIUM — partial: dead variable cleanup)
-- ============================================================
-- v_is_global was declared at line 850, set to false at line 878, and set to true
-- at line 893 inside the sentinel substitution block but never read after assignment.
-- This is dead code. Removing it via CREATE OR REPLACE eliminates the noise without
-- any behavioural change — the sentinel substitution logic is unchanged.
--
-- The entire function is reproduced here because CREATE OR REPLACE requires the full
-- body. The only change vs. Wave 4 is removal of `v_is_global boolean` declaration
-- and its two assignment statements (v_is_global := false and v_is_global := true).

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

  -- ── Sentinel substitution for global category junction mutations ──────────
  -- DB-CAT-003: when the parent category is global (IS NULL), the junction mutation
  -- (INSERT of a new org association) is a distinct event NOT captured by any other
  -- audit row. Emit a sentinel-tagged row so the link is traceable.
  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
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
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm anon has no privileges on service_categories:
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'service_categories' AND grantee = 'anon'
--   ORDER BY privilege_type;
--
-- Expected: no rows.
--
-- 2. Confirm all four service_categories policies use (SELECT auth.uid()):
--
--   SELECT policyname, cmd, qual::text, with_check::text
--   FROM pg_policies
--   WHERE tablename = 'service_categories'
--   ORDER BY cmd;
--
-- Expected: qual/with_check text must contain '(SELECT auth.uid())' (not bare 'auth.uid()').
--
-- 3. Confirm product_attribute_value_prices UPDATE policy has IS NOT NULL guard:
--
--   SELECT policyname, cmd, qual::text, with_check::text
--   FROM pg_policies
--   WHERE tablename = 'product_attribute_value_prices' AND cmd = 'UPDATE';
--
-- Expected: both qual and with_check contain 'IS NOT NULL'.
--
-- 4. Confirm new indexes exist:
--
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename IN (
--     'product_attribute_price_ranges',
--     'product_attribute_value_prices',
--     'category_attributes'
--   )
--   AND indexname IN (
--     'idx_product_attribute_price_ranges_org',
--     'idx_product_attribute_value_prices_org',
--     'idx_category_attributes_category'
--   );
--
-- Expected: 3 rows.
--
-- 5. Confirm orphan function is dropped:
--
--   SELECT proname FROM pg_proc
--   WHERE proname = 'fn_audit_product_category_organizations'
--     AND pronargs = 0;
--
-- Expected: no rows.
--
-- 6. Confirm sentinel-aware function has no v_is_global variable:
--
--   SELECT prosrc FROM pg_proc
--   WHERE proname = 'fn_audit_product_category_organizations_sentinel';
--
-- Expected: prosrc text must NOT contain 'v_is_global'.
--
-- 7. Confirm entity_audit_log SELECT policy now includes sentinel arm:
--
--   SELECT policyname, qual::text
--   FROM pg_policies
--   WHERE tablename = 'entity_audit_log'
--     AND policyname = 'entity_audit_log_select';
--
-- Expected: qual text contains '00000000-0000-0000-0000-000000000001'.
