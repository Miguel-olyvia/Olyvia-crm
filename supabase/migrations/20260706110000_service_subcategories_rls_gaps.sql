-- Service Subcategories RLS Gaps — Wave 11
-- 2026-07-06 | Module: Categories/Subcategories | Wave: 11 (service subcategories gap closure)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. get_service_category_org_id(uuid, int) — add recursion depth guard.
--      The baseline function (20260615130000, line 3861) has no depth cap; an accidental
--      cycle or deeply nested tree would recurse until PostgreSQL stack overflow, matching
--      the same gap fixed for get_product_category_org_id in Wave 10. Replacement adds a
--      depth counter (max 10) and returns NULL beyond that limit. Backward-compatible.
--
--   2. service_subcategories.* permission codes — CRITICAL gap.
--      The baseline RLS policies for service_categories reference service_subcategories.*
--      codes (lines 27741–27762) and Wave 6 replaced all four policies keeping those
--      references. However, no migration has ever seeded the four codes into anew_permissions.
--      has_anew_permission() joins on anew_role_permissions.permission_code (populated from
--      anew_permissions at org bootstrap). Because the codes do not exist in anew_permissions:
--        (a) No role has these codes (org_admin, worker, viewer all lack them).
--        (b) Every INSERT/UPDATE/DELETE on service_categories for subcategory rows silently
--            fails permission-denied for ALL non-system-admin users.
--        (c) The PermissionGate in ServiceSubcategories.tsx (lines 431, 592, 602) always
--            resolves FALSE — the Create/Edit/Delete buttons are permanently hidden.
--        (d) Home.tsx nav guard on service_subcategories.view (line 190) permanently hides
--            the menu item for all non-system-admin users.
--      Fix: seed all four codes into anew_permissions and assign to roles following the
--      same pattern used for product_subcategories.* in Wave 7 / system_admin in Wave 10.
--
--   3. service_categories UPDATE WITH CHECK — add org-consistency guard for subcategory rows.
--      The Wave 6 service_categories_update WITH CHECK subcategory arm validates that the
--      post-update parent org is in the user's visible orgs but does NOT prevent the user
--      from simultaneously setting organization_id on the subcategory row to a value that
--      diverges from the parent chain org. A subcategory row where organization_id diverges
--      from its parent's org becomes readable to users of the OTHER org via any arm that
--      matches organization_id directly (e.g., a future root-category arm, or any query
--      that joins on organization_id). This mirrors GAP-RLS-W7-001 fixed for
--      product_categories in Wave 9 (20260706090000) and optimised in Wave 10.
--      Fix: restructure the subcategory WITH CHECK arm using a lateral subquery to resolve
--      get_service_category_org_id(parent_id) once, then compare against both visible_orgs
--      and the organization_id consistency guard in a single pass (eliminates double-call
--      risk in the same expression tree).
--
--   4. entity_audit_log SELECT policy — add service_subcategories.view.
--      Wave 7 added product_subcategories.view to the policy. The equivalent service
--      permission code was never added. Once service_subcategories.view is seeded (section 2),
--      users holding only that code cannot read service subcategory audit rows because the
--      org-scoped arm only checks a fixed set of module permissions that does not include it.
--      Fix: add service_subcategories.view to both the org-scoped arm and the sentinel arm,
--      mirroring the exact pattern used for product_subcategories.view in Wave 7.
--
-- Gaps addressed:
--   SVC-SUBCATEGORIES-PERM-CODES-MISSING (CRITICAL) — service_subcategories.* permission codes
--     not seeded; PermissionGate, Home.tsx nav guard, and all write RLS arms are permanently
--     broken for non-system-admin users.
--   SVC-GET-SERVICE-CATEGORY-ORG-ID-RECURSION-DEPTH (MEDIUM) — uncapped recursive function;
--     mirrors the product_categories equivalent fixed in Wave 10.
--   SVC-UPDATE-WITH-CHECK-NO-ORG-CONSISTENCY (HIGH) — service_categories_update WITH CHECK
--     subcategory arm does not prevent org divergence on the row's own organization_id field.
--   SVC-AUDIT-LOG-NO-SVC-SUBCATEGORIES-VIEW (MEDIUM) — entity_audit_log SELECT policy does
--     not include service_subcategories.view in either the org-scoped or sentinel arms.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql (defines get_service_category_org_id, policies)
--   20260706060000_categories_audit_gaps_fix.sql (Wave 6 — replaced all 4 service_categories
--     policies; sentinel arm added to entity_audit_log_select)
--   20260706070000_subcategories_rls_permissions.sql (Wave 7 — product_subcategories.* pattern)
--   20260706100000_subcategories_audit_gaps_fix.sql (Wave 10 — system_admin codes pattern,
--     depth guard pattern for get_product_category_org_id)


-- ============================================================
-- 1. get_service_category_org_id(uuid, int) — add recursion depth guard
-- ============================================================
-- Replaces the baseline definition (20260615130000, line 3861).
--
-- Added parameter: depth int DEFAULT 0 (backward-compatible; all existing callers using
-- the single-argument form continue to work via the DEFAULT 0).
--
-- Returns NULL when depth > 10 to prevent stack overflow on circular references or
-- unexpectedly deep trees. service_categories has at most 2 levels (root → subcategory)
-- in the confirmed schema, so this limit is never reached in normal operation.
--
-- SECURITY DEFINER and SET search_path = public unchanged from baseline.
-- service_categories has only parent_id (not a dual-column setup like product_categories),
-- so no COALESCE is needed in the parent walk.

CREATE OR REPLACE FUNCTION public.get_service_category_org_id(cat_id uuid, depth int DEFAULT 0)
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
  -- The confirmed schema has max 2 levels (root → subcategory); depth > 10 is a
  -- clear signal of a data problem (cycle or import error). Return NULL safely.
  IF depth > 10 THEN
    RETURN NULL;
  END IF;

  SELECT organization_id, parent_id
  INTO   v_org_id, v_parent_id
  FROM   public.service_categories
  WHERE  id = cat_id;

  -- Direct org found — return immediately.
  IF v_org_id IS NOT NULL THEN
    RETURN v_org_id;
  END IF;

  -- Walk up the parent chain with depth counter.
  IF v_parent_id IS NOT NULL THEN
    RETURN public.get_service_category_org_id(v_parent_id, depth + 1);
  END IF;

  -- No org found anywhere in the chain (global root category with no org affiliation).
  RETURN NULL;
END;
$$;

-- Grants: EXECUTE to authenticated (needed for RLS policy evaluation) and service_role.
-- SECURITY DEFINER means the function runs as the owner regardless of caller privileges —
-- same pattern as get_product_category_org_id (Wave 7 / Wave 10).
REVOKE ALL ON FUNCTION public.get_service_category_org_id(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_service_category_org_id(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_service_category_org_id(uuid, int) TO service_role;


-- ============================================================
-- 2. service_subcategories.* permission codes
-- ============================================================
-- CRITICAL: these four codes are referenced in service_categories RLS policies since the
-- baseline (lines 27741–27748–27762) and in Wave 6 (20260706060000) but were NEVER seeded
-- into anew_permissions. has_anew_permission() always returns FALSE for all non-system-admin
-- users on any operation that checks a service_subcategories.* code.
--
-- Role assignment mirrors product_subcategories.* pattern from Wave 7:
--   service_subcategories.view   — viewer, worker, org_admin, super_admin, system_admin
--   service_subcategories.create — worker, org_admin, super_admin, system_admin
--   service_subcategories.edit   — worker, org_admin, super_admin, system_admin
--   service_subcategories.delete — org_admin, super_admin, system_admin (destructive; not worker)

INSERT INTO public.anew_permissions
  (code, name, description, category, scope, supports_scope, is_dangerous)
VALUES
  (
    'service_subcategories.view',
    'Ver subcategorias de serviços',
    'Permite consultar a lista de subcategorias de serviços dentro das categorias '
    'da organização.',
    'services',
    'organization',
    false,
    false
  ),
  (
    'service_subcategories.create',
    'Criar subcategorias de serviços',
    'Permite criar novas subcategorias dentro das categorias de serviços existentes.',
    'services',
    'organization',
    false,
    false
  ),
  (
    'service_subcategories.edit',
    'Editar subcategorias de serviços',
    'Permite editar subcategorias de serviços existentes.',
    'services',
    'organization',
    false,
    false
  ),
  (
    'service_subcategories.delete',
    'Eliminar subcategorias de serviços',
    'Permite eliminar subcategorias de serviços. '
    'Requer ausência de serviços associados à subcategoria.',
    'services',
    'organization',
    false,
    true
  )
ON CONFLICT (code) DO UPDATE
SET name            = EXCLUDED.name,
    description     = EXCLUDED.description,
    category        = EXCLUDED.category,
    scope           = EXCLUDED.scope,
    supports_scope  = EXCLUDED.supports_scope,
    is_dangerous    = EXCLUDED.is_dangerous,
    updated_at      = now();


-- Assign permission codes to roles.
-- trg_protect_system_role_perms blocks INSERT on anew_role_permissions for system roles
-- (super_admin, system_admin). Disable around those two seeding blocks.

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;

-- super_admin: all four codes (global admin, must not be restricted).
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = ANY (ARRAY[
            'service_subcategories.view',
            'service_subcategories.create',
            'service_subcategories.edit',
            'service_subcategories.delete'
          ]::text[])
WHERE  r.code = 'super_admin'
  AND  r.organization_id IS NULL   -- global super_admin role only
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- system_admin: all four codes.
-- is_system_admin_user() bypasses RLS but has_anew_permission() checks anew_role_permissions
-- for service-role sessions with manually set JWT where is_system_admin_user() may not fire.
-- Mirrors the system_admin backfill pattern from Wave 10 section 3.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = ANY (ARRAY[
            'service_subcategories.view',
            'service_subcategories.create',
            'service_subcategories.edit',
            'service_subcategories.delete'
          ]::text[])
WHERE  r.code = 'system_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;

-- org_admin (per-org): all four codes. Back-fills existing orgs and covers future
-- orgs via bootstrap (bootstrap iterates anew_permissions to seed org_admin).
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = ANY (ARRAY[
            'service_subcategories.view',
            'service_subcategories.create',
            'service_subcategories.edit',
            'service_subcategories.delete'
          ]::text[])
WHERE  r.code = 'org_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- worker (per-org default role): view + create + edit (not delete — destructive).
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = ANY (ARRAY[
            'service_subcategories.view',
            'service_subcategories.create',
            'service_subcategories.edit'
          ]::text[])
WHERE  r.code = 'worker'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- viewer (per-org read-only role): view only.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = 'service_subcategories.view'
WHERE  r.code = 'viewer'
ON CONFLICT (role_id, permission_code) DO NOTHING;


-- ============================================================
-- 3. service_categories UPDATE — org-consistency guard on subcategory WITH CHECK
-- ============================================================
-- Problem (SVC-UPDATE-WITH-CHECK-NO-ORG-CONSISTENCY HIGH):
--   Wave 6 service_categories_update WITH CHECK subcategory arm:
--     (parent_id IS NOT NULL)
--     AND has_anew_permission(..., 'service_subcategories.edit')
--     AND get_service_category_org_id(parent_id) IN (visible_orgs)
--
--   This validates that the post-update parent resolves to a visible org but does NOT
--   prevent the user from simultaneously setting organization_id on the subcategory row
--   to a value that diverges from the parent chain org. A subcategory row where
--   organization_id diverges from its parent's org creates a potential cross-org
--   visibility inconsistency if any query path matches organization_id directly.
--
-- Fix:
--   Restructure the subcategory WITH CHECK arm using a lateral subquery to resolve
--   get_service_category_org_id(parent_id) ONCE, then use the single resolved value for:
--     (i)  visible-orgs gate: resolved_org IN (get_user_visible_org_ids(...))
--     (ii) org-consistency guard: organization_id IS NULL (inherit from parent, allowed)
--          OR organization_id = resolved_org (consistent with parent chain, allowed).
--          Any other value is blocked (org divergence).
--
--   The USING clause (pre-update check) is reproduced verbatim from Wave 6 — it validates
--   that the row being targeted belongs to the user's org. Only WITH CHECK needs the guard.
--
-- Drop and recreate the UPDATE policy atomically.

DROP POLICY IF EXISTS service_categories_update ON public.service_categories;

CREATE POLICY service_categories_update
  ON public.service_categories
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      -- Root category: edit permission + pre-update row org visible.
      (parent_id IS NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_categories.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      -- Subcategory: edit permission + pre-update parent org visible.
      (parent_id IS NOT NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.edit')
      AND public.get_service_category_org_id(parent_id, 0) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      -- Root category: edit permission + post-update row org visible (prevents
      -- cross-org reassignment of organization_id on root rows).
      (parent_id IS NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_categories.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      -- Subcategory: edit permission + org-consistency guard.
      --
      -- The lateral subquery resolves get_service_category_org_id(parent_id) ONCE and
      -- makes the result available as resolved_org for both checks in this arm:
      --   (i)  resolved_org must be in the user's visible orgs (permission + visibility gate).
      --   (ii) organization_id on the post-update row must be NULL (inherit from parent) or
      --        equal resolved_org (consistent with parent chain). Any other value is blocked
      --        to prevent cross-org row-level inconsistency.
      --
      -- This mirrors the Wave 10 lateral-subquery pattern for product_categories_update.
      (parent_id IS NOT NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.edit')
      AND EXISTS (
        SELECT 1
        FROM   (SELECT public.get_service_category_org_id(parent_id, 0) AS resolved_org) r
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
-- 4. entity_audit_log SELECT policy — add service_subcategories.view
-- ============================================================
-- Wave 7 (20260706070000) added product_subcategories.view to both the org-scoped arm
-- and the sentinel arm of the entity_audit_log_select policy. The equivalent service
-- code was not added. Users holding only service_subcategories.view cannot read service
-- subcategory audit rows through either arm.
--
-- This replacement adds service_subcategories.view to both arms, mirroring the product
-- pattern exactly. The sentinel arm is also extended so that any service subcategory audit
-- rows tagged under the sentinel UUID (from historic NULL-org mutations before this wave)
-- are readable to users holding service_subcategories.view.
--
-- Note on sentinel rows for service_subcategories:
--   service_categories.organization_id on subcategory rows (parent_id IS NOT NULL) is
--   populated by the UI at insert time (ServiceSubcategories.tsx line 283 uses
--   parentCategory.organization_id). Historic rows from earlier UI versions may have
--   organization_id IS NULL if the audit trigger could not resolve the org. Those would
--   be sentinel-tagged. The sentinel arm extension ensures they are readable to
--   service subcategory managers, consistent with the product_subcategories pattern.

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
        OR public.has_anew_permission((SELECT auth.uid()), 'product_subcategories.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.view')
      )
    )
    OR
    -- Sentinel rows (global categories/brands, historic NULL-org subcategory mutations):
    -- readable to users holding a qualifying module permission.
    -- Sentinel UUID = '00000000-0000-0000-0000-000000000001' (never a real org id).
    (
      organization_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND (
        public.has_anew_permission((SELECT auth.uid()), 'products.manage')
        OR public.has_anew_permission((SELECT auth.uid()), 'product_categories.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'product_subcategories.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'brands.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
      )
    )
  );


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm get_service_category_org_id now accepts two arguments and has depth guard:
--
--   SELECT proname, pronargs, prosrc
--   FROM pg_proc
--   WHERE proname = 'get_service_category_org_id';
--
-- Expected: pronargs = 2 (uuid, int4). prosrc contains 'depth > 10'.
--
-- 2. Confirm backward-compatible single-argument call still works:
--
--   SELECT public.get_service_category_org_id('<any_subcategory_uuid>');
--
-- Expected: same result as before (default depth = 0).
--
-- 3. Confirm all four service_subcategories.* codes are now in anew_permissions:
--
--   SELECT code, name, category FROM public.anew_permissions
--   WHERE code LIKE 'service_subcategories.%'
--   ORDER BY code;
--
-- Expected: 4 rows — service_subcategories.{create,delete,edit,view}.
--
-- 4. Confirm super_admin (global) has all four codes:
--
--   SELECT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'super_admin'
--     AND r.organization_id IS NULL
--     AND rp.permission_code LIKE 'service_subcategories.%'
--   ORDER BY rp.permission_code;
--
-- Expected: 4 rows.
--
-- 5. Confirm system_admin has all four codes:
--
--   SELECT DISTINCT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'system_admin'
--     AND rp.permission_code LIKE 'service_subcategories.%'
--   ORDER BY rp.permission_code;
--
-- Expected: 4 rows — service_subcategories.{create,delete,edit,view}.
--
-- 6. Confirm org_admin has all four codes:
--
--   SELECT DISTINCT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'org_admin'
--     AND rp.permission_code LIKE 'service_subcategories.%'
--   ORDER BY rp.permission_code;
--
-- Expected: 4 rows.
--
-- 7. Confirm worker has view+create+edit but NOT delete:
--
--   SELECT DISTINCT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'worker'
--     AND rp.permission_code LIKE 'service_subcategories.%'
--   ORDER BY rp.permission_code;
--
-- Expected: 3 rows — service_subcategories.{create,edit,view}.
--   service_subcategories.delete must NOT appear.
--
-- 8. Confirm viewer has only view:
--
--   SELECT DISTINCT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'viewer'
--     AND rp.permission_code LIKE 'service_subcategories.%';
--
-- Expected: 1 row — service_subcategories.view only.
--
-- 9. Smoke-test has_anew_permission for a known org_admin user:
--
--   SELECT public.has_anew_permission('<org_admin_auth_uid>', 'service_subcategories.create');
--   SELECT public.has_anew_permission('<worker_auth_uid>',    'service_subcategories.delete');
--   SELECT public.has_anew_permission('<viewer_auth_uid>',    'service_subcategories.view');
--   SELECT public.has_anew_permission('<viewer_auth_uid>',    'service_subcategories.create');
--
-- Expected: true, false, true, false.
--
-- 10. Confirm service_categories UPDATE policy now has org-consistency guard:
--
--   SELECT policyname, cmd, with_check::text
--   FROM pg_policies
--   WHERE tablename = 'service_categories'
--     AND cmd = 'UPDATE';
--
-- Expected: with_check text contains 'resolved_org' and 'SELECT 1 FROM' (lateral pattern)
--   in the subcategory arm. Must also contain 'organization_id IS NULL' in the consistency
--   guard. Root arm (parent_id IS NULL) is unchanged.
--
-- 11. Smoke-test org-consistency: as an org_admin of org A, attempt to UPDATE a subcategory
--     to set organization_id = <org_B_uuid> where org B is also visible to the user.
--     Should be BLOCKED by WITH CHECK.
--
--   UPDATE public.service_categories
--   SET organization_id = '<org_B_uuid>'
--   WHERE id = '<subcategory_under_org_A_parent>'
--     AND parent_id IS NOT NULL;
--
-- Expected: ERROR (RLS policy violation / zero rows updated).
--
-- 12. Confirm entity_audit_log SELECT policy includes service_subcategories.view:
--
--   SELECT policyname, qual::text
--   FROM pg_policies
--   WHERE tablename = 'entity_audit_log'
--     AND policyname = 'entity_audit_log_select';
--
-- Expected: qual text contains 'service_subcategories.view' in both the org-scoped arm
--   and the sentinel arm.
--
-- 13. Confirm all four service_categories policies are still present:
--
--   SELECT policyname, cmd
--   FROM pg_policies
--   WHERE tablename = 'service_categories'
--   ORDER BY cmd;
--
-- Expected: 4 policies — DELETE (USING), INSERT (WITH CHECK), SELECT (USING), UPDATE (USING+WITH CHECK).
