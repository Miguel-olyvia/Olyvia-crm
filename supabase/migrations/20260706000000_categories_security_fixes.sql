-- Categories Security Fixes — Wave 0
-- 2026-07-06 | Module: Categories | Wave: 0 (security & RLS prerequisites)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. entity_audit_log SELECT policy — widen to include product_categories.view
--   2. product_categories — replace all four RLS policies
--              (SELECT auth.uid()) correlated subquery fix,
--              is_system_admin_user bypass,
--              has_anew_permission gate on writes,
--              WITH CHECK on UPDATE to prevent cross-org reassignment,
--              global categories (org IS NULL) decision documented
--   3. product_category_organizations — replace all four policies
--              (SELECT auth.uid()) fix, has_anew_permission gate on writes,
--              explicit per-operation WITH CHECK
--   4. product_attribute_value_prices — replace all four policies
--              org-scoped SELECT, org-scoped + permission-gated writes
--   5. category_attribute_palettes — replace all three write policies
--              org-scope via JOIN through category_attributes → product_categories
--   6. product_attribute_price_ranges — deduplicate SELECT policy,
--              add explicit WITH CHECK on INSERT and UPDATE
--   7. category_attributes — split the all-ops manage policy into
--              explicit per-operation policies with WITH CHECK on INSERT/UPDATE
--   8. GRANT/REVOKE — tighten authenticated grants on affected tables;
--              revoke anon DML from product_attribute_value_prices
--
-- Gaps addressed:
--   CAT-001 (CRITICAL) — no audit trigger on product_categories: see Wave 1 migration
--   CAT-002 (HIGH)     — global categories (org IS NULL) produce no audit row: see Wave 1
--   CAT-003 (HIGH)     — duplicate parent columns (parent_id / parent_category_id):
--                        deferred — removing a column requires app-layer changes;
--                        documented here for a future migration
--   CAT-004 (MEDIUM)   — RLS policies call auth.uid() inline (not correlated subquery):
--                        fixed in this migration for all four product_categories policies
--   CAT-05  (CRITICAL) — product_attribute_value_prices: org not enforced in write policies
--   CAT-02  (CRITICAL) — category_attribute_palettes: write policies only check uid IS NOT NULL
--   CAT-03  (HIGH)     — product_categories SELECT missing global (IS NULL) arm documented
--   CAT-04  (HIGH)     — category_attributes manage policy: no explicit WITH CHECK, no per-op split
--   CAT-07  (MEDIUM)   — product_attribute_price_ranges: duplicate SELECT policy + no WITH CHECK
--   CAT-05 (frontend)  — useBulkActions missing organizationId: fixed in ProductCategories.tsx
--   CAT-06 (frontend)  — useBulkActions missing organizationId: fixed in ProductSubcategories.tsx
--
-- Global categories decision (CAT-003 / CAT-03):
--   product_categories.organization_id is nullable.
--   A NULL organization_id means a global/shared category — not currently inserted via UI
--   (INSERT policy already enforces IS NOT NULL via existing baseline policy retained below).
--   The SELECT policy intentionally DOES NOT add an (organization_id IS NULL) arm:
--   global categories are system-managed and not exposed to regular users without
--   explicit design intent. System admins bypass RLS via is_system_admin_user().
--   If a global-category SELECT arm is required in the future, add:
--     OR organization_id IS NULL
--   to the SELECT USING clause and document the use case.
--
-- Permission codes used:
--   'product_categories.view'   — read categories (mirrors products.view pattern)
--   'product_categories.create' — insert categories
--   'product_categories.edit'   — update categories (already in baseline)
--   'product_categories.delete' — delete categories (already in baseline)
--   'products.manage'           — gate for attribute prices and palettes (module-level write)
--
-- Convention: (SELECT auth.uid()) correlated subquery pattern used throughout, matching
-- 20260623150000_fix_rls_auth_uid_correlated_subquery.sql.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql
--   20260625010000_entity_audit_log.sql
--   20260705040000_brands_rls_corrections.sql (entity_audit_log_select with brands.view)


-- ============================================================
-- 1. entity_audit_log SELECT policy — add product_categories.view
-- ============================================================
-- The last policy (brands wave) accepts:
--   quotes.manage | proposals.manage | services.view | products.view | products.manage
--   | brands.view | brands.edit
-- Category managers holding product_categories.view cannot read the categories audit trail.
-- Widen to also accept 'product_categories.view'.

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
-- 2. product_categories — replace all four RLS policies
-- ============================================================
-- Baseline problems (confirmed at lines 26941–26967):
--   a) All four policies call auth.uid() bare → per-row re-evaluation (CAT-004).
--   b) No is_system_admin_user bypass.
--   c) SELECT has no global-category arm (IS NULL). Decision: keep this intentional
--      (global cats not exposed to regular users; admins bypass via is_system_admin_user).
--   d) UPDATE has WITH CHECK but uses bare auth.uid() calls.
--   e) No has_anew_permission gate on DELETE (only permission code check, now standardised).
--
-- Fix:
--   • Wrap all auth.uid() in (SELECT ...) for single per-query evaluation.
--   • Add is_system_admin_user((SELECT auth.uid())) bypass on all policies.
--   • SELECT: preserves both arms (direct org membership + junction table visibility).
--             Global-category (IS NULL) arm intentionally absent — see decision note above.
--   • INSERT: require product_categories.create + org in visible orgs + IS NOT NULL guard.
--   • UPDATE: require product_categories.edit, USING on pre-update row,
--             WITH CHECK on post-update row (prevents cross-org reassignment).
--   • DELETE: require product_categories.delete + org in visible orgs.

DROP POLICY IF EXISTS product_categories_select ON public.product_categories;
DROP POLICY IF EXISTS product_categories_insert ON public.product_categories;
DROP POLICY IF EXISTS product_categories_update ON public.product_categories;
DROP POLICY IF EXISTS product_categories_delete ON public.product_categories;

-- SELECT: org-scoped + junction visibility + admin bypass.
-- No IS NULL arm: see global categories decision note above.
CREATE POLICY product_categories_select
  ON public.product_categories
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      id IN (
        SELECT pco.category_id
        FROM   public.product_category_organizations pco
        WHERE  pco.organization_id IN (
          SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
        )
      )
    )
  );

-- INSERT: create permission required; org must be non-null and in visible orgs.
-- Admin bypass: admins can insert into any org.
CREATE POLICY product_categories_insert
  ON public.product_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'product_categories.create')
      AND organization_id IS NOT NULL
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- UPDATE: edit permission required; USING validates pre-update row;
--         WITH CHECK validates post-update row (prevents cross-org reassignment).
CREATE POLICY product_categories_update
  ON public.product_categories
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'product_categories.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'product_categories.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- DELETE: delete permission required; org must be in visible orgs.
CREATE POLICY product_categories_delete
  ON public.product_categories
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'product_categories.delete')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 3. product_category_organizations — replace all four policies
-- ============================================================
-- Baseline problems (confirmed at lines 26976–27001):
--   a) All four policies call auth.uid() bare.
--   b) No is_system_admin_user bypass.
--   c) INSERT has no explicit WITH CHECK outside the baseline has_anew_permission guard.
--   d) UPDATE has correct USING + WITH CHECK but bare auth.uid().
--
-- Fix: (SELECT auth.uid()) pattern throughout, admin bypass on all write policies.

DROP POLICY IF EXISTS product_category_organizations_select ON public.product_category_organizations;
DROP POLICY IF EXISTS product_category_organizations_insert ON public.product_category_organizations;
DROP POLICY IF EXISTS product_category_organizations_update ON public.product_category_organizations;
DROP POLICY IF EXISTS product_category_organizations_delete ON public.product_category_organizations;

-- SELECT: any authenticated user who can see the org can read its category associations.
CREATE POLICY product_category_organizations_select
  ON public.product_category_organizations
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );

-- INSERT: create permission required; org must be in visible orgs.
CREATE POLICY product_category_organizations_insert
  ON public.product_category_organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'product_categories.create')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- UPDATE: edit permission required; both pre- and post-update org must be visible.
CREATE POLICY product_category_organizations_update
  ON public.product_category_organizations
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'product_categories.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'product_categories.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- DELETE: delete permission required.
CREATE POLICY product_category_organizations_delete
  ON public.product_category_organizations
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'product_categories.delete')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 4. product_attribute_value_prices — replace all four policies
-- ============================================================
-- Baseline problems (confirmed at lines 21206–22367, CAT-01 CRITICAL):
--   a) SELECT: USING (true) — world-readable to all authenticated users (cross-org leak).
--   b) INSERT: WITH CHECK (auth.uid() IS NOT NULL) — no org scope, no permission gate.
--   c) UPDATE: USING (auth.uid() IS NOT NULL) — no org scope, no permission gate.
--   d) DELETE: USING (auth.uid() IS NOT NULL) — no org scope, no permission gate.
--   e) organization_id column exists on the table but is ignored in every policy.
--
-- Fix:
--   SELECT — restrict to org-scoped rows (org in visible orgs) OR rows with NULL org_id
--             (category-level prices with no product or org assignment are visible to
--             all users who can see the category — this mirrors the attribute pricing
--             model where category defaults are shared within the platform).
--   INSERT/UPDATE/DELETE — require products.manage permission + org scope.
--
-- Note: product_attribute_value_prices.organization_id is nullable.
--   NULL rows represent category-level defaults (not org-scoped).
--   SELECT includes them so the pricing dialog can inherit defaults.
--   Write operations must provide an org_id (enforced by WITH CHECK IS NOT NULL guard).

DROP POLICY IF EXISTS "Users can view attribute value prices"                    ON public.product_attribute_value_prices;
DROP POLICY IF EXISTS "Authenticated users can insert attribute value prices"    ON public.product_attribute_value_prices;
DROP POLICY IF EXISTS "Authenticated users can update attribute value prices"    ON public.product_attribute_value_prices;
DROP POLICY IF EXISTS "Authenticated users can delete attribute value prices"    ON public.product_attribute_value_prices;

-- SELECT: org-scoped rows + null-org (category defaults) are readable.
CREATE POLICY product_attribute_value_prices_select
  ON public.product_attribute_value_prices
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR organization_id IS NULL
    OR organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );

-- INSERT: products.manage permission required; org must be non-null and in visible orgs.
CREATE POLICY product_attribute_value_prices_insert
  ON public.product_attribute_value_prices
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

-- UPDATE: products.manage + pre- and post-update org must be in visible orgs.
CREATE POLICY product_attribute_value_prices_update
  ON public.product_attribute_value_prices
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

-- DELETE: products.manage + org must be in visible orgs.
CREATE POLICY product_attribute_value_prices_delete
  ON public.product_attribute_value_prices
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 5. category_attribute_palettes — replace write policies
-- ============================================================
-- Baseline problems (confirmed at lines 21214–21311, CAT-02 CRITICAL):
--   a) INSERT: WITH CHECK (auth.uid() IS NOT NULL) — no org scope, no permission.
--   b) UPDATE: USING (auth.uid() IS NOT NULL) — no org scope, no permission.
--   c) DELETE: USING (auth.uid() IS NOT NULL) — no org scope, no permission.
--   d) No organization_id column on the table — org scope must be resolved via JOIN
--      through category_attributes → product_categories.organization_id.
--
-- Fix: resolve org via: category_attribute_palettes.category_id
--                        → product_categories.organization_id
-- Each write policy performs an EXISTS subquery against product_categories.
-- The SELECT policy (USING true) is replaced with an org-scoped version as well.

DROP POLICY IF EXISTS "Users can view category attribute palettes"               ON public.category_attribute_palettes;
DROP POLICY IF EXISTS "Authenticated users can insert category attribute palettes" ON public.category_attribute_palettes;
DROP POLICY IF EXISTS "Authenticated users can update category attribute palettes" ON public.category_attribute_palettes;
DROP POLICY IF EXISTS "Authenticated users can delete category attribute palettes" ON public.category_attribute_palettes;

-- SELECT: visible if the parent category is visible to the user.
CREATE POLICY category_attribute_palettes_select
  ON public.category_attribute_palettes
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM   public.product_categories pc
      WHERE  pc.id = category_attribute_palettes.category_id
        AND (
          pc.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
          OR pc.organization_id IS NULL
        )
    )
  );

-- INSERT: products.manage required; parent category must belong to user's visible org.
CREATE POLICY category_attribute_palettes_insert
  ON public.category_attribute_palettes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.product_categories pc
        WHERE  pc.id = category_attribute_palettes.category_id
          AND  pc.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
      )
    )
  );

-- UPDATE: products.manage required; parent category must belong to user's visible org.
CREATE POLICY category_attribute_palettes_update
  ON public.category_attribute_palettes
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.product_categories pc
        WHERE  pc.id = category_attribute_palettes.category_id
          AND  pc.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.product_categories pc
        WHERE  pc.id = category_attribute_palettes.category_id
          AND  pc.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
      )
    )
  );

-- DELETE: products.manage required; parent category must belong to user's visible org.
CREATE POLICY category_attribute_palettes_delete
  ON public.category_attribute_palettes
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.product_categories pc
        WHERE  pc.id = category_attribute_palettes.category_id
          AND  pc.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
      )
    )
  );


-- ============================================================
-- 6. product_attribute_price_ranges — deduplicate + add explicit WITH CHECK
-- ============================================================
-- Baseline problems (confirmed at lines 24143–24212, CAT-07 MEDIUM):
--   a) Two overlapping policies: auth_manage (all-ops) and auth_select (SELECT only)
--      both with the same org-scope expression — redundant SELECT coverage.
--   b) auth_manage covers all ops with a single USING clause and no explicit WITH CHECK.
--      For INSERT and UPDATE Postgres falls back to USING as WITH CHECK — technically
--      correct but non-explicit. Replace with per-operation policies.
--
-- Fix: drop both existing policies. Create explicit SELECT, INSERT, UPDATE, DELETE.

DROP POLICY IF EXISTS "auth_manage_product_attribute_price_ranges" ON public.product_attribute_price_ranges;
DROP POLICY IF EXISTS "auth_select_product_attribute_price_ranges" ON public.product_attribute_price_ranges;

CREATE POLICY product_attribute_price_ranges_select
  ON public.product_attribute_price_ranges
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );

CREATE POLICY product_attribute_price_ranges_insert
  ON public.product_attribute_price_ranges
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

CREATE POLICY product_attribute_price_ranges_update
  ON public.product_attribute_price_ranges
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

CREATE POLICY product_attribute_price_ranges_delete
  ON public.product_attribute_price_ranges
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 7. category_attributes — split manage policy into per-op policies
-- ============================================================
-- Baseline problems (confirmed at lines 22728–22730, CAT-04 HIGH):
--   a) "Users with permission can manage category attributes" covers INSERT, UPDATE,
--      DELETE with a single USING clause and no explicit WITH CHECK. For INSERT,
--      Postgres uses USING as WITH CHECK — technically correct but non-explicit.
--   b) The all-ops policy lacks a FOR clause, so it covers all five operations
--      including SELECT, overlapping with "Users can view category attributes".
--   c) auth.uid() called bare in both policies.
--
-- Fix: drop both policies. Recreate as four explicit per-operation policies.

DROP POLICY IF EXISTS "Users can view category attributes"                    ON public.category_attributes;
DROP POLICY IF EXISTS "Users with permission can manage category attributes"  ON public.category_attributes;

-- SELECT: visible if the parent category is in a visible org.
CREATE POLICY category_attributes_select
  ON public.category_attributes
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM   public.product_categories pc
      WHERE  pc.id = category_attributes.category_id
        AND (
          pc.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
          OR pc.organization_id IS NULL
        )
    )
  );

-- INSERT: products.manage + parent category in visible org.
CREATE POLICY category_attributes_insert
  ON public.category_attributes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.product_categories pc
        WHERE  pc.id = category_attributes.category_id
          AND  pc.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
      )
    )
  );

-- UPDATE: products.manage + parent category in visible org (USING + WITH CHECK).
CREATE POLICY category_attributes_update
  ON public.category_attributes
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.product_categories pc
        WHERE  pc.id = category_attributes.category_id
          AND  pc.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.product_categories pc
        WHERE  pc.id = category_attributes.category_id
          AND  pc.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
      )
    )
  );

-- DELETE: products.manage + parent category in visible org.
CREATE POLICY category_attributes_delete
  ON public.category_attributes
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'products.manage')
      AND EXISTS (
        SELECT 1
        FROM   public.product_categories pc
        WHERE  pc.id = category_attributes.category_id
          AND  pc.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
      )
    )
  );


-- ============================================================
-- 8. GRANT/REVOKE — tighten authenticated grants
-- ============================================================
-- Revoke anon DML from product_attribute_value_prices (baseline GRANT ALL to anon).
-- Tighten authenticated grants on all affected tables to SELECT/INSERT/UPDATE/DELETE only.

-- product_categories
REVOKE ALL ON TABLE public.product_categories               FROM anon;
REVOKE ALL ON TABLE public.product_categories               FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_categories TO authenticated;

-- product_category_organizations
REVOKE ALL ON TABLE public.product_category_organizations   FROM anon;
REVOKE ALL ON TABLE public.product_category_organizations   FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_category_organizations TO authenticated;

-- product_attribute_value_prices: revoke anon (was GRANT ALL in baseline)
REVOKE ALL ON TABLE public.product_attribute_value_prices   FROM anon;
REVOKE ALL ON TABLE public.product_attribute_value_prices   FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_attribute_value_prices TO authenticated;

-- category_attribute_palettes: revoke anon DML
REVOKE ALL ON TABLE public.category_attribute_palettes      FROM anon;
REVOKE ALL ON TABLE public.category_attribute_palettes      FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.category_attribute_palettes TO authenticated;

-- product_attribute_price_ranges: tighten authenticated
REVOKE ALL ON TABLE public.product_attribute_price_ranges   FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_attribute_price_ranges TO authenticated;

-- category_attributes: tighten authenticated
REVOKE ALL ON TABLE public.category_attributes              FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.category_attributes TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm product_categories policies replaced:
--
--   SELECT policyname, cmd, qual::text
--   FROM pg_policies
--   WHERE tablename = 'product_categories'
--   ORDER BY cmd;
--
-- Expected: four policies (SELECT, INSERT, UPDATE, DELETE), all referencing
--   is_system_admin_user and (SELECT auth.uid()).
--
-- 2. Confirm product_attribute_value_prices SELECT policy is org-scoped:
--
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'product_attribute_value_prices'
--   ORDER BY cmd;
--
-- Expected: four policies (product_attribute_value_prices_{select,insert,update,delete}).
--   SELECT policy USING does NOT contain 'true' anymore.
--
-- 3. Confirm category_attribute_palettes write policies are org-scoped via JOIN:
--
--   SELECT policyname, cmd, qual::text FROM pg_policies
--   WHERE tablename = 'category_attribute_palettes'
--   ORDER BY cmd;
--
-- Expected: four policies with EXISTS subquery joining product_categories.
--
-- 4. Confirm product_attribute_price_ranges has only four policies (no duplicate SELECT):
--
--   SELECT policyname FROM pg_policies
--   WHERE tablename = 'product_attribute_price_ranges';
--
-- Expected: product_attribute_price_ranges_{select,insert,update,delete}.
--
-- 5. Confirm anon has no DML on product_attribute_value_prices or category_attribute_palettes:
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name IN ('product_attribute_value_prices', 'category_attribute_palettes')
--     AND grantee = 'anon'
--   ORDER BY table_name, privilege_type;
--
-- Expected: no rows (or SELECT only if a future public-catalogue design requires it).
