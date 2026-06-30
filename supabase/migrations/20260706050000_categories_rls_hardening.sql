-- Categories RLS Hardening — Wave 5
-- 2026-06-29 | Module: Categories | Wave: 5 (SELECT policy hardening)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. category_attributes SELECT — gate the OR pc.organization_id IS NULL arm
--      on at least one qualifying permission (DB-CAT-007 / RLS-CAT-03 MEDIUM)
--   2. category_attribute_palettes SELECT — same fix (RLS-CAT-03 MEDIUM)
--
-- Problem (DB-CAT-007 / RLS-CAT-03 MEDIUM):
--   Wave 0 created SELECT policies on category_attributes and category_attribute_palettes
--   that include OR pc.organization_id IS NULL in their USING clause. This makes attributes
--   and palettes of ANY global category (organization_id IS NULL on product_categories)
--   visible to every authenticated user, regardless of whether they hold
--   product_categories.view or products.manage.
--
--   This is inconsistent with the documented design intent for product_categories SELECT
--   (Wave 0 lines 44-52), which explicitly DOES NOT expose global categories to regular
--   users. The rationale: "global categories are system-managed and not exposed to regular
--   users without explicit design intent."
--
--   The write policies (INSERT/UPDATE/DELETE) on both tables correctly do NOT include
--   the IS NULL arm — writes to global-category attributes require is_system_admin_user().
--   Only the read side is wider than intended.
--
--   Impact: any authenticated user (even a viewer with no permissions at all) can SELECT
--   from category_attributes and category_attribute_palettes for global categories.
--   Because global categories are system-managed and not exposed via the product_categories
--   SELECT policy, this read exposure would normally be unreachable through the UI — but it
--   is reachable via direct Supabase client queries from the browser.
--
-- Fix:
--   Replace the SELECT USING clause on both tables. The IS NULL arm is retained only for
--   users who hold at least one of:
--     • products.manage   — users who write pricing and attribute data
--     • product_categories.view — users who can see category metadata
--   System admins (is_system_admin_user) bypass all checks as before.
--
--   This preserves the read path for the pricing dialog
--   (CategoryAttributePricesDialog.tsx) and the admin attribute management UI
--   without opening a blanket read for all authenticated users.
--
--   Org-scoped rows (non-null org in the parent category) remain readable to any
--   authenticated user who can see that org — consistent with Wave 0 intent.
--   Only the global-category (IS NULL) arm is now gated on a permission.
--
-- Design decision recorded:
--   The category_attributes and category_attribute_palettes SELECT policies now treat
--   global-category rows the same as product_categories itself: visible only to
--   is_system_admin_user OR to users holding products.manage OR product_categories.view.
--   If a future use case requires broader exposure (e.g., a public product catalogue),
--   add a dedicated policy or widen the condition and document the intent.
--
-- Prerequisites:
--   20260706000000_categories_security_fixes.sql (Wave 0 — defined the original SELECT policies)
--   20260706030000_categories_products_permission_codes.sql (Wave 3 — seeds products.manage)
--   20260706020000_categories_permission_codes.sql (Wave 2 — seeds product_categories.view)

-- ============================================================
-- 1. category_attributes SELECT — harden IS NULL arm
-- ============================================================
-- Replace policy to gate the global-category arm on a permission check.
-- Org-scoped arm (organization_id IN visible orgs) is unchanged.

DROP POLICY IF EXISTS category_attributes_select ON public.category_attributes;

CREATE POLICY category_attributes_select
  ON public.category_attributes
  FOR SELECT
  TO authenticated
  USING (
    -- System admins bypass all checks.
    public.is_system_admin_user((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM   public.product_categories pc
      WHERE  pc.id = category_attributes.category_id
        AND (
          -- Org-scoped categories: visible to all users who can see the org.
          pc.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
          OR
          -- Global categories (IS NULL): visible only to users with a qualifying permission.
          -- Consistent with the product_categories SELECT policy design intent (Wave 0 lines 44-52).
          (
            pc.organization_id IS NULL
            AND (
              public.has_anew_permission((SELECT auth.uid()), 'products.manage')
              OR public.has_anew_permission((SELECT auth.uid()), 'product_categories.view')
            )
          )
        )
    )
  );


-- ============================================================
-- 2. category_attribute_palettes SELECT — harden IS NULL arm
-- ============================================================
-- Identical fix: the IS NULL arm is gated on products.manage or product_categories.view.

DROP POLICY IF EXISTS category_attribute_palettes_select ON public.category_attribute_palettes;

CREATE POLICY category_attribute_palettes_select
  ON public.category_attribute_palettes
  FOR SELECT
  TO authenticated
  USING (
    -- System admins bypass all checks.
    public.is_system_admin_user((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM   public.product_categories pc
      WHERE  pc.id = category_attribute_palettes.category_id
        AND (
          -- Org-scoped categories: visible to all users who can see the org.
          pc.organization_id IN (
            SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
          )
          OR
          -- Global categories (IS NULL): visible only to users with a qualifying permission.
          (
            pc.organization_id IS NULL
            AND (
              public.has_anew_permission((SELECT auth.uid()), 'products.manage')
              OR public.has_anew_permission((SELECT auth.uid()), 'product_categories.view')
            )
          )
        )
    )
  );


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm both policies have been replaced:
--
--   SELECT policyname, cmd, qual::text
--   FROM pg_policies
--   WHERE tablename IN ('category_attributes', 'category_attribute_palettes')
--     AND cmd = 'SELECT'
--   ORDER BY tablename;
--
-- Expected: one SELECT policy per table. The qual text must NOT contain
--   'organization_id IS NULL' without a surrounding has_anew_permission() guard.
--
-- 2. Smoke-test: user with no permissions cannot read global-category attributes.
--
--   -- Set a session as a viewer (products.view only, no products.manage or product_categories.view):
--   -- The following should return 0 rows for global categories (IS NULL org):
--
--   SELECT ca.*
--   FROM public.category_attributes ca
--   JOIN public.product_categories pc ON pc.id = ca.category_id
--   WHERE pc.organization_id IS NULL;
--
--   Expected for viewer: 0 rows (RLS blocks the IS NULL arm).
--   Expected for org_admin: rows returned (has products.manage or product_categories.view).
--
-- 3. Smoke-test: user with products.manage can read global-category attributes.
--
--   SELECT ca.*
--   FROM public.category_attributes ca
--   JOIN public.product_categories pc ON pc.id = ca.category_id
--   WHERE pc.organization_id IS NULL;
--
--   Expected for worker/org_admin: rows returned (has products.manage).
--
-- 4. Confirm org-scoped arm still works for ordinary users:
--
--   SELECT ca.*
--   FROM public.category_attributes ca
--   JOIN public.product_categories pc ON pc.id = ca.category_id
--   WHERE pc.organization_id = '<user_visible_org_id>';
--
--   Expected: rows returned for any authenticated user who can see the org.
