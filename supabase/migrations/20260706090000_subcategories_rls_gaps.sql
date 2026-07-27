-- Subcategories RLS Gap Closure — Wave 9
-- 2026-07-06 | Module: Categories/Subcategories | Wave: 9 (RLS correctness)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. product_categories UPDATE — add org-consistency guard to subcategory WITH CHECK.
--      Prevents a user from directly mutating organization_id on a subcategory row
--      to a value that diverges from the parent chain org, which would trigger the
--      cross-org visibility leak via the junction SELECT arm.
--   2. category_attributes INSERT/UPDATE/DELETE — add parent-chain walk to EXISTS subquery.
--      When category_id points to a subcategory with organization_id IS NULL, the current
--      EXISTS clause evaluates pc.organization_id IN (...) = NULL (falsy) and silently
--      blocks writes even though the user can read the subcategory via the Wave 7 SELECT arm.
--   3. category_attribute_palettes INSERT/UPDATE/DELETE — same fix as section 2.
--
-- Gaps addressed:
--   GAP-RLS-W7-001 (HIGH) — subcategory UPDATE WITH CHECK validates parent chain but does
--     not prevent direct mutation of organization_id on the subcategory row to a value that
--     diverges from its parent's org. Creates a row-level org inconsistency exploitable via
--     the junction SELECT arm (documented as the cross-org leak in the gap report).
--   GAP-RLS-W0-002 (MEDIUM) — category_attributes and category_attribute_palettes write
--     policies use EXISTS (pc.organization_id IN visible_orgs) with no parent-chain fallback.
--     Historic subcategory rows with organization_id IS NULL cause all three write operations
--     to silently fail for non-admin users even after Wave 7 makes those rows visible in
--     SELECT. Mirrors the same parent-chain walk added to Wave 8 audit functions.
--
-- Prerequisites:
--   20260706000000_categories_security_fixes.sql (Wave 0 — base write policies)
--   20260706050000_categories_rls_hardening.sql  (Wave 5 — SELECT hardening on both tables)
--   20260706070000_subcategories_rls_permissions.sql (Wave 7 — get_product_category_org_id)
--   20260706080000_subcategories_audit_triggers.sql  (Wave 8 — parent-chain audit fix)
--
-- Design decisions:
--   • The subcategory UPDATE org-consistency guard (section 1) uses the post-update
--     parent_id to resolve the expected org, then checks that organization_id on the
--     post-update row either IS NULL (inherited from parent) or equals that resolved org.
--     This allows the UI pattern of setting organization_id = companyId while also
--     tolerating historic NULL-org rows. It blocks setting organization_id to any value
--     that does not match the parent's resolved org.
--   • The category_attributes / category_attribute_palettes write policy fix (sections 2-3)
--     adds an OR arm to the EXISTS subquery. The existing org-scoped arm is preserved
--     unchanged. The new arm fires only when pc.organization_id IS NULL and there is a
--     resolvable parent chain, matching the pattern used in the Wave 8 audit functions.
--   • The SELECT policies on both tables (category_attributes, category_attribute_palettes)
--     were already hardened in Wave 5 and are NOT replaced in this migration.
--   • product_attribute_price_ranges write policies are NOT changed: that table has its
--     own organization_id column and the existing IN (visible_orgs) guard is correct.
--     The Wave 8 audit function for that table handles the NULL-org audit attribution.


-- ============================================================
-- 1. product_categories UPDATE — org-consistency guard on subcategory WITH CHECK
-- ============================================================
-- Problem (GAP-RLS-W7-001 HIGH):
--   Wave 7 product_categories_update WITH CHECK for the subcategory arm:
--     parent_id IS NOT NULL
--     AND has_anew_permission(..., 'product_subcategories.edit')
--     AND get_product_category_org_id(parent_id) IN (visible_orgs)
--
--   This checks that the post-update parent resolves to a visible org, which is correct
--   for preventing cross-org reparenting. However it does NOT prevent the user from
--   simultaneously setting organization_id = <any other visible org> on the row itself.
--   A subcategory row where organization_id diverges from its parent's org is then
--   readable to users of the OTHER org via the junction SELECT arm (arm b), because
--   id IN (product_category_organizations WHERE org IN visible_orgs) can match any row
--   regardless of parent_id.
--
-- Fix:
--   Extend the subcategory WITH CHECK arm to also require that post-update
--   organization_id is either NULL (no direct org, inherit from parent) or equals
--   the org resolved by the parent chain. This guarantees org consistency on the row.
--
--   The USING clause (pre-update check) does not need the same guard — it validates
--   that the row being targeted belongs to the user's org, which is already correct.
--   The org-divergence is a post-write concern, so only WITH CHECK needs the extra arm.
--
-- Drop and recreate the UPDATE policy atomically.
-- The USING clause is reproduced verbatim from Wave 7.
-- The WITH CHECK adds the org-consistency guard only to the subcategory arm.

DROP POLICY IF EXISTS product_categories_update ON public.product_categories;

CREATE POLICY product_categories_update
  ON public.product_categories
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      -- Root category: edit permission + pre-update row org visible.
      parent_id IS NULL
      AND public.has_anew_permission((SELECT auth.uid()), 'product_categories.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      -- Subcategory: edit permission + pre-update parent org visible.
      parent_id IS NOT NULL
      AND public.has_anew_permission((SELECT auth.uid()), 'product_subcategories.edit')
      AND public.get_product_category_org_id(parent_id) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      -- Root category: edit permission + post-update row org visible (prevents
      -- cross-org reassignment of organization_id on root rows).
      parent_id IS NULL
      AND public.has_anew_permission((SELECT auth.uid()), 'product_categories.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      -- Subcategory: edit permission + post-update parent org visible + org-consistency.
      -- get_product_category_org_id(parent_id) resolves the org from the parent chain.
      -- The organization_id guard ensures the row's own org field does not diverge from
      -- the parent chain, which would create cross-org visibility via the junction arm.
      --   • organization_id IS NULL — row inherits org from parent (allowed).
      --   • organization_id = resolved parent org — consistent (allowed).
      --   • Any other value — blocked (would cause org divergence).
      parent_id IS NOT NULL
      AND public.has_anew_permission((SELECT auth.uid()), 'product_subcategories.edit')
      AND public.get_product_category_org_id(parent_id) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
      AND (
        organization_id IS NULL
        OR organization_id = public.get_product_category_org_id(parent_id)
      )
    )
  );


-- ============================================================
-- 2. category_attributes write policies — add parent-chain walk
-- ============================================================
-- Problem (GAP-RLS-W0-002 MEDIUM):
--   Wave 0 INSERT/UPDATE/DELETE policies use:
--     EXISTS (SELECT 1 FROM product_categories pc
--             WHERE pc.id = category_attributes.category_id
--               AND pc.organization_id IN (visible_orgs))
--
--   When category_id points to a subcategory with organization_id IS NULL, the condition
--   pc.organization_id IN (...) evaluates to NULL (SQL three-valued logic — NULL IN (set)
--   is always NULL, which is falsy), blocking the write even for users who hold
--   products.manage and can read the subcategory via the Wave 7 SELECT arm.
--
-- Fix:
--   Add an OR arm to the EXISTS: when pc.organization_id IS NULL and pc has a resolvable
--   parent, walk the parent chain via get_product_category_org_id(). Only applies when
--   organization_id IS NULL AND a parent exists (subcategory case). Mirrors the Wave 8
--   audit function fix (fn_audit_category_attributes section 2).
--
--   The SELECT policy on category_attributes was replaced in Wave 5 and is NOT changed here.
--   Only INSERT, UPDATE, DELETE are replaced.

DROP POLICY IF EXISTS category_attributes_insert ON public.category_attributes;
DROP POLICY IF EXISTS category_attributes_update ON public.category_attributes;
DROP POLICY IF EXISTS category_attributes_delete ON public.category_attributes;

-- INSERT: products.manage + parent category in user's visible org (org-scoped or parent-chain).
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
          AND (
            -- Arm (a): category has a direct org.
            pc.organization_id IN (
              SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
            )
            OR
            -- Arm (b): category is a subcategory with NULL org — resolve via parent chain.
            (
              pc.organization_id IS NULL
              AND COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL
              AND public.get_product_category_org_id(
                    COALESCE(pc.parent_id, pc.parent_category_id)
                  ) IN (
                SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
              )
            )
          )
      )
    )
  );

-- UPDATE: products.manage + parent category in visible org (USING + WITH CHECK, both arms).
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
          AND (
            pc.organization_id IN (
              SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
            )
            OR (
              pc.organization_id IS NULL
              AND COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL
              AND public.get_product_category_org_id(
                    COALESCE(pc.parent_id, pc.parent_category_id)
                  ) IN (
                SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
              )
            )
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
          AND (
            pc.organization_id IN (
              SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
            )
            OR (
              pc.organization_id IS NULL
              AND COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL
              AND public.get_product_category_org_id(
                    COALESCE(pc.parent_id, pc.parent_category_id)
                  ) IN (
                SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
              )
            )
          )
      )
    )
  );

-- DELETE: products.manage + parent category in visible org (same dual-arm EXISTS).
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
          AND (
            pc.organization_id IN (
              SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
            )
            OR (
              pc.organization_id IS NULL
              AND COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL
              AND public.get_product_category_org_id(
                    COALESCE(pc.parent_id, pc.parent_category_id)
                  ) IN (
                SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
              )
            )
          )
      )
    )
  );


-- ============================================================
-- 3. category_attribute_palettes write policies — add parent-chain walk
-- ============================================================
-- Identical fix to section 2, applied to category_attribute_palettes.
-- Wave 0 write policies and Wave 5 SELECT policy have the same gap.
-- The SELECT policy (replaced in Wave 5) is NOT changed here.

DROP POLICY IF EXISTS category_attribute_palettes_insert ON public.category_attribute_palettes;
DROP POLICY IF EXISTS category_attribute_palettes_update ON public.category_attribute_palettes;
DROP POLICY IF EXISTS category_attribute_palettes_delete ON public.category_attribute_palettes;

-- INSERT: products.manage + parent category in visible org (org-scoped or parent-chain).
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
          AND (
            -- Arm (a): category has a direct org.
            pc.organization_id IN (
              SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
            )
            OR
            -- Arm (b): subcategory with NULL org — walk the parent chain.
            (
              pc.organization_id IS NULL
              AND COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL
              AND public.get_product_category_org_id(
                    COALESCE(pc.parent_id, pc.parent_category_id)
                  ) IN (
                SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
              )
            )
          )
      )
    )
  );

-- UPDATE: products.manage + parent category in visible org (USING + WITH CHECK, both arms).
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
          AND (
            pc.organization_id IN (
              SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
            )
            OR (
              pc.organization_id IS NULL
              AND COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL
              AND public.get_product_category_org_id(
                    COALESCE(pc.parent_id, pc.parent_category_id)
                  ) IN (
                SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
              )
            )
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
          AND (
            pc.organization_id IN (
              SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
            )
            OR (
              pc.organization_id IS NULL
              AND COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL
              AND public.get_product_category_org_id(
                    COALESCE(pc.parent_id, pc.parent_category_id)
                  ) IN (
                SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
              )
            )
          )
      )
    )
  );

-- DELETE: products.manage + parent category in visible org (same dual-arm EXISTS).
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
          AND (
            pc.organization_id IN (
              SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
            )
            OR (
              pc.organization_id IS NULL
              AND COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL
              AND public.get_product_category_org_id(
                    COALESCE(pc.parent_id, pc.parent_category_id)
                  ) IN (
                SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
              )
            )
          )
      )
    )
  );


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm product_categories UPDATE policy now has org-consistency guard:
--
--   SELECT policyname, cmd, with_check::text
--   FROM pg_policies
--   WHERE tablename = 'product_categories'
--     AND cmd = 'UPDATE';
--
-- Expected: with_check text contains 'organization_id IS NULL' AND
--   'get_product_category_org_id(parent_id)' in the subcategory arm.
--
-- 2. Smoke-test: as an org_admin of org A, attempt to UPDATE a subcategory
--    to set organization_id = <org_B_uuid> where org B is also visible to the user.
--    Should be BLOCKED by WITH CHECK.
--
--   UPDATE public.product_categories
--   SET organization_id = '<org_B_uuid>'
--   WHERE id = '<subcategory_under_org_A_parent>'
--     AND parent_id IS NOT NULL;
--
-- Expected: ERROR (RLS policy violation / zero rows updated).
--
-- 3. Confirm category_attributes INSERT/UPDATE/DELETE policies include parent-chain arm:
--
--   SELECT policyname, cmd, qual::text, with_check::text
--   FROM pg_policies
--   WHERE tablename = 'category_attributes'
--     AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
--   ORDER BY cmd;
--
-- Expected: qual/with_check text contains 'get_product_category_org_id' in the EXISTS subquery.
--
-- 4. Smoke-test: as an org_admin, INSERT a category_attribute where category_id
--    points to a subcategory with organization_id IS NULL (historic data).
--    Should succeed if the subcategory's parent resolves to a visible org.
--
--   INSERT INTO public.category_attributes (category_id, name, attribute_type, ...)
--   VALUES ('<null_org_subcategory_id>', 'Test Attr', 'text', ...);
--
-- Expected: row inserted (RLS allows via parent-chain arm).
--
-- 5. Confirm category_attribute_palettes write policies have the same dual-arm EXISTS:
--
--   SELECT policyname, cmd, qual::text
--   FROM pg_policies
--   WHERE tablename = 'category_attribute_palettes'
--     AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
--   ORDER BY cmd;
--
-- Expected: qual text contains 'get_product_category_org_id' and 'COALESCE(pc.parent_id, pc.parent_category_id)'.
--
-- 6. Confirm SELECT policies on both tables are UNCHANGED from Wave 5:
--
--   SELECT policyname, cmd, qual::text
--   FROM pg_policies
--   WHERE tablename IN ('category_attributes', 'category_attribute_palettes')
--     AND cmd = 'SELECT';
--
-- Expected: SELECT policies still reference 'has_anew_permission' on the IS NULL arm
--   (Wave 5 hardening intact). No change from this migration.
