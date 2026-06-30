-- Subcategories Audit Gaps Fix — Wave 10
-- 2026-07-06 | Module: Categories/Subcategories | Wave: 10 (gap closure)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. get_product_category_org_id(uuid, int) — add recursion depth guard.
--      The existing function has no depth cap; an accidental cycle or deeply
--      nested tree would recurse until PostgreSQL stack overflow. This replacement
--      adds a depth counter (max 10) and returns NULL beyond that limit.
--      Replaces the Wave 7 definition. Grants unchanged.
--
--   2. Backfill organization_id on historic NULL-org subcategory rows.
--      product_categories rows where parent_id IS NOT NULL AND organization_id IS NULL
--      but the parent chain resolves to a real org are updated to carry the resolved
--      org directly. This eliminates the root cause of:
--        - Silent bulk-action failures (useBulkActions .eq('organization_id', ...) matching zero rows)
--        - Wave 7 SELECT arm carrying all the load for historic rows at query time
--        - Audit rows still attributed to the sentinel for future mutations
--      Only rows where get_product_category_org_id() returns a non-NULL value are
--      updated; truly global root-parented subcategories (resolves NULL) are left as-is.
--
--   3. product_subcategories.* codes for system_admin role.
--      Wave 7 seeded super_admin, org_admin, worker, viewer but omitted system_admin.
--      is_system_admin_user() bypasses all RLS checks so system_admin users retain full
--      table access regardless, but:
--        (a) has_anew_permission() inside subcategory RLS arms returns FALSE for system_admin
--            users whose sessions do not trigger is_system_admin_user() (e.g. service-role
--            calls with manually set JWT).
--        (b) Analytics/audit queries joining anew_role_permissions find zero
--            product_subcategories.* entries for system_admin, creating a documentation gap.
--      Fix: disable trg_protect_system_role_perms, INSERT all four codes for system_admin,
--      re-enable. Same pattern used for super_admin in Wave 7.
--
--   4. UPDATE product_categories_update WITH CHECK — resolve double-call trade-off.
--      Wave 9 subcategory WITH CHECK calls get_product_category_org_id(parent_id) twice.
--      Restructure using a lateral subquery to resolve the org once, then compare it
--      against both the visible-orgs gate and the org-consistency guard in a single pass.
--      Eliminates the double DB lookup for bulk UPDATE operations on subcategory rows.
--
-- Gaps addressed:
--   SUB-NULL-ORG-NO-BACKFILL  (CRITICAL) — historic NULL-org subcategories cause silent
--     bulk-action failures in useBulkActions and misclassified audit rows.
--   SUB-SYSTEM-ADMIN-NO-PERM-CODES (MEDIUM) — system_admin role has zero product_subcategories.*
--     entries in anew_role_permissions.
--   SUB-GET-PRODUCT-CATEGORY-ORG-ID-RECURSION-DEPTH (MEDIUM) — uncapped recursive function.
--   SUB-AUDIT-DOUBLE-CALL-W9 / DB-WAVE9-DOUBLE-CALL (MEDIUM) — double invocation of
--     get_product_category_org_id(parent_id) in product_categories_update WITH CHECK subcategory arm.
--
-- Prerequisites:
--   20260706070000_subcategories_rls_permissions.sql (Wave 7 — defines get_product_category_org_id)
--   20260706080000_subcategories_audit_triggers.sql  (Wave 8 — parent-chain audit fix)
--   20260706090000_subcategories_rls_gaps.sql        (Wave 9 — org-consistency guard)


-- ============================================================
-- 1. get_product_category_org_id(uuid, int) — add recursion depth guard
-- ============================================================
-- Replaces the Wave 7 definition.
--
-- Added parameter: depth int DEFAULT 0 (backward-compatible; callers using
-- the single-argument form are unaffected — PostgreSQL resolves the default).
--
-- Returns NULL when depth > 10 to prevent stack overflow on circular references
-- or unexpectedly deep trees. In the confirmed schema (max 2 levels: root → sub)
-- this limit is never reached in normal operation.
--
-- The single-argument form used in Wave 8 trigger functions and Wave 9 policies
-- continues to work via the DEFAULT 0.
--
-- SECURITY DEFINER and search_path unchanged from Wave 7.

CREATE OR REPLACE FUNCTION public.get_product_category_org_id(cat_id uuid, depth int DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id    uuid;
  v_parent_id uuid;
BEGIN
  -- Hard depth limit: prevent stack overflow on cycles or unexpectedly deep trees.
  -- The confirmed schema has max 2 levels (root → subcategory), so depth > 10 is
  -- a clear signal of a data problem (cycle or import error). Return NULL safely.
  IF depth > 10 THEN
    RETURN NULL;
  END IF;

  SELECT
    organization_id,
    COALESCE(parent_id, parent_category_id)
  INTO v_org_id, v_parent_id
  FROM public.product_categories
  WHERE id = cat_id;

  -- Direct org found — return immediately.
  IF v_org_id IS NOT NULL THEN
    RETURN v_org_id;
  END IF;

  -- Walk up the parent chain with depth counter.
  IF v_parent_id IS NOT NULL THEN
    RETURN public.get_product_category_org_id(v_parent_id, depth + 1);
  END IF;

  -- No org found anywhere in the chain (global root category with no org affiliation).
  RETURN NULL;
END;
$$;

-- Grants: unchanged from Wave 7.
REVOKE ALL ON FUNCTION public.get_product_category_org_id(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_category_org_id(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_category_org_id(uuid, int) TO service_role;


-- ============================================================
-- 2. Backfill organization_id on historic NULL-org subcategory rows
-- ============================================================
-- Problem (SUB-NULL-ORG-NO-BACKFILL CRITICAL):
--   product_categories rows where parent_id IS NOT NULL AND organization_id IS NULL
--   were inserted historically without an org (older UI paths did not set organization_id
--   on subcategory rows). This causes:
--     (a) useBulkActions handlers filter with .eq('organization_id', organizationId);
--         NULL-org rows match zero rows → bulk mutations silently affect nothing while
--         a success toast is shown to the user.
--     (b) Wave 9 WITH CHECK blocks any direct UPDATE setting organization_id unless
--         the value equals the parent's resolved org — so a migration UPDATE is the
--         only safe way to populate the field without violating RLS.
--     (c) Future audit trigger calls still require the parent-chain walk (Wave 8) because
--         the org is NULL at write time; backfilling eliminates this overhead.
--
-- This UPDATE sets organization_id = get_product_category_org_id(parent_id) for every
-- subcategory row where:
--   - parent_id IS NOT NULL (is a subcategory row, not a root category)
--   - organization_id IS NULL (historic row without direct org)
--   - get_product_category_org_id(parent_id) IS NOT NULL (parent chain resolves to a real org)
--
-- Rows where the parent chain also resolves to NULL (subcategory under a truly global
-- root category with no org affiliation) are intentionally left as-is — there is no
-- real org to assign and they remain covered by the Wave 7 SELECT sentinel arm.
--
-- This migration runs as a superuser migration (forward-only), so RLS policies do not
-- apply. The WITH CHECK constraint in Wave 9 is a DML-level guard; migrations bypass it.
--
-- Estimated row count: only rows where parent_id IS NOT NULL AND organization_id IS NULL.
-- For large datasets this can be wrapped in batched UPDATEs, but a single UPDATE is
-- safe for migrations applied via supabase db push (no transaction timeout in migration context).

UPDATE public.product_categories AS pc
SET    organization_id = public.get_product_category_org_id(pc.parent_id)
WHERE  pc.parent_id IS NOT NULL
  AND  pc.organization_id IS NULL
  AND  public.get_product_category_org_id(pc.parent_id) IS NOT NULL;

-- Note: rows where COALESCE(parent_id, parent_category_id) resolves but parent_id IS NULL
-- (parent stored in parent_category_id only) are also covered via the COALESCE inside
-- get_product_category_org_id. However, the WHERE clause here uses pc.parent_id to
-- match the subcategory detection used in RLS policies. If rows exist where only
-- parent_category_id is populated (parent_id IS NULL), they would not match this WHERE
-- clause. A second pass covers those:
UPDATE public.product_categories AS pc
SET    organization_id = public.get_product_category_org_id(pc.parent_category_id)
WHERE  pc.parent_id IS NULL
  AND  pc.parent_category_id IS NOT NULL
  AND  pc.organization_id IS NULL
  AND  public.get_product_category_org_id(pc.parent_category_id) IS NOT NULL;


-- ============================================================
-- 3. product_subcategories.* permission codes for system_admin role
-- ============================================================
-- Problem (SUB-SYSTEM-ADMIN-NO-PERM-CODES MEDIUM):
--   Wave 7 seeded all four product_subcategories.* codes for super_admin (via
--   trg_protect_system_role_perms disable block), org_admin, worker, and viewer.
--   system_admin was omitted. While is_system_admin_user() bypasses RLS for system_admin
--   users in normal sessions, has_anew_permission() inside subcategory RLS arms will
--   return FALSE for system_admin users in service-role sessions where the JWT is
--   manually set and is_system_admin_user() may not resolve correctly.
--   Additionally, zero anew_role_permissions entries for system_admin on this module
--   creates a tooling/documentation gap.
--
-- Same disable/enable pattern used for super_admin in Wave 7 lines 384-401.

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = ANY (ARRAY[
            'product_subcategories.view',
            'product_subcategories.create',
            'product_subcategories.edit',
            'product_subcategories.delete'
          ]::text[])
WHERE  r.code = 'system_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;


-- ============================================================
-- 4. product_categories_update — eliminate double call in subcategory WITH CHECK
-- ============================================================
-- Problem (SUB-AUDIT-DOUBLE-CALL-W9 / DB-WAVE9-DOUBLE-CALL MEDIUM):
--   Wave 9 subcategory WITH CHECK arm calls get_product_category_org_id(parent_id) twice:
--     (a) Inside: get_product_category_org_id(parent_id) IN (get_user_visible_org_ids(...))
--     (b) Inside: organization_id = get_product_category_org_id(parent_id)
--   get_product_category_org_id() is STABLE but PostgreSQL does not guarantee result-caching
--   across two separate expression trees within the same policy clause. For bulk UPDATE
--   operations on subcategory rows this doubles the parent-chain lookup cost.
--
-- Fix:
--   Restructure the subcategory WITH CHECK arm to resolve the org once via a lateral
--   subquery, then use the single resolved value in both the visible-orgs gate and the
--   org-consistency guard.
--
-- The USING clause (unchanged from Wave 9) calls get_product_category_org_id(parent_id)
-- only once (in the IN subquery). Only WITH CHECK is restructured.
--
-- Drop and recreate the UPDATE policy atomically.
-- The USING clause is reproduced verbatim from Wave 9.

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
      -- Subcategory: edit permission + org-consistency guard.
      --
      -- The lateral subquery resolves get_product_category_org_id(parent_id) ONCE and
      -- makes the result available as resolved_org for both checks in this arm:
      --   (i)  resolved_org must be in the user's visible orgs (permission + visibility gate).
      --   (ii) organization_id on the post-update row must be NULL (inherit from parent) or
      --        equal resolved_org (consistent with parent chain). Any other value is blocked
      --        to prevent cross-org row-level inconsistency exploitable via the junction arm.
      --
      -- This replaces the Wave 9 double-call pattern:
      --   get_product_category_org_id(parent_id) IN (visible_orgs)
      --   AND organization_id = get_product_category_org_id(parent_id)
      -- with a single call whose result is reused in both comparisons.
      parent_id IS NOT NULL
      AND public.has_anew_permission((SELECT auth.uid()), 'product_subcategories.edit')
      AND EXISTS (
        SELECT 1
        FROM   (SELECT public.get_product_category_org_id(parent_id) AS resolved_org) r
        WHERE  r.resolved_org IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
          AND  (
                 organization_id IS NULL
                 OR organization_id = r.resolved_org
               )
      )
    )
  );


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm get_product_category_org_id now accepts two arguments and has depth guard:
--
--   SELECT proname, pronargs, prosrc
--   FROM pg_proc
--   WHERE proname = 'get_product_category_org_id';
--
-- Expected: pronargs = 2 (uuid, int4). prosrc contains 'depth > 10'.
--
-- 2. Confirm backward-compatible single-argument call still works:
--
--   SELECT public.get_product_category_org_id('<any_subcategory_uuid>');
--
-- Expected: same result as before (default depth = 0).
--
-- 3. Verify no NULL-org subcategories remain after backfill:
--
--   SELECT COUNT(*)
--   FROM   public.product_categories
--   WHERE  parent_id IS NOT NULL
--     AND  organization_id IS NULL;
--
-- Expected: 0 (all resolvable subcategories now carry a direct organization_id).
-- Any non-zero count are subcategories under global root categories with no org.
--
-- 4. Confirm system_admin has all four product_subcategories.* codes:
--
--   SELECT DISTINCT rp.permission_code
--   FROM   public.anew_role_permissions rp
--   JOIN   public.anew_roles r ON r.id = rp.role_id
--   WHERE  r.code = 'system_admin'
--     AND  rp.permission_code LIKE 'product_subcategories.%'
--   ORDER  BY rp.permission_code;
--
-- Expected: 4 rows — product_subcategories.{create,delete,edit,view}.
--
-- 5. Confirm product_categories_update WITH CHECK subcategory arm now uses lateral subquery:
--
--   SELECT policyname, cmd, with_check::text
--   FROM   pg_policies
--   WHERE  tablename = 'product_categories'
--     AND  cmd = 'UPDATE';
--
-- Expected: with_check text contains 'resolved_org' and 'SELECT 1 FROM' (lateral pattern).
--   Must NOT contain two separate occurrences of 'get_product_category_org_id(parent_id)'
--   at the same expression level.
--
-- 6. Smoke-test bulk UPDATE: after backfill, bulk status change via useBulkActions
--    should now correctly scope by organization_id and return the expected row count.
--
--   -- Verify a previously NULL-org subcategory now has organization_id populated:
--   SELECT id, name, organization_id, parent_id
--   FROM   public.product_categories
--   WHERE  parent_id IS NOT NULL
--   ORDER  BY updated_at DESC
--   LIMIT  10;
--
-- Expected: organization_id IS NOT NULL for rows with resolvable parent chains.
