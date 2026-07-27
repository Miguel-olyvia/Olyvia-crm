-- Subcategories RLS & Permissions — Wave 7
-- 2026-07-06 | Module: Categories/Subcategories | Wave: 7
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. get_product_category_org_id(uuid) — helper function: COALESCE(parent_id,
--      parent_category_id) chain walk (mirrors get_service_category_org_id pattern).
--      Required by RLS policies (section 2) and Wave 8 audit trigger.
--   2. product_categories RLS — add subcategory arm (parent_id IS NOT NULL)
--      to SELECT, INSERT, UPDATE, DELETE policies using get_product_category_org_id().
--      Subcategory rows currently have organization_id set by the UI (line 501 of
--      ProductSubcategories.tsx) but historically may be NULL. The subcategory arm
--      resolves org via the parent chain regardless of organization_id on the row,
--      providing correct visibility for both historic NULL-org and new org-bearing rows.
--   3. product_subcategories.* permission codes — seed into anew_permissions and assign
--      to roles (mirrors the service_subcategories.* pattern from Wave 6).
--   4. entity_audit_log SELECT policy — add product_subcategories.view to the
--      permission gate and ensure the sentinel bypass arm includes the new code.
--
-- Gaps addressed:
--   SUB-001 (CRITICAL, second set) — product_subcategories.* permission codes not seeded;
--     PermissionGate checks for product_subcategories.* always resolve FALSE for all
--     non-system-admin users (confirmed in ProductSubcategories.tsx lines 653, 805-806,
--     873, 891; Home.tsx lines 200, 205).
--   SUB-002 (CRITICAL, second set) — SELECT/INSERT/UPDATE/DELETE policies have no arm
--     for subcategory rows where organization_id IS NULL and parent_id IS NOT NULL.
--     Such rows match none of the existing arms and are invisible to regular users.
--   SUB-003 (HIGH, second set) — entity_audit_log SELECT policy does not include
--     product_subcategories.view; once that code is seeded, users holding only it
--     cannot read the subcategory audit trail.
--   SUB-005 (HIGH) — no get_product_category_org_id() helper equivalent to
--     get_service_category_org_id(); prerequisite for correct parent-chain org
--     resolution in both RLS and Wave 8 audit trigger.
--   SUB-006 (HIGH) — dual parent columns (parent_id, parent_category_id) on
--     product_categories; COALESCE(parent_id, parent_category_id) used throughout.
--   SUB-007 (MEDIUM) — no product_subcategories.* permission code split vs root
--     product_categories.*; this migration seeds the split set.
--
-- Design decisions:
--   • Subcategory detection: parent_id IS NOT NULL (using baseline FK parent_id;
--     COALESCE in the helper handles the dual-column ambiguity for the parent walk).
--   • The existing product_categories_select junction arm (id IN product_category_organizations)
--     is PRESERVED — it applies to root categories shared across orgs.
--   • New subcategory arm uses get_product_category_org_id() which COALESCEs both
--     parent columns and walks up to find the org, making it robust to historic data
--     where either column was populated.
--   • get_product_category_org_id() is declared STABLE SECURITY DEFINER with pinned
--     search_path, matching get_service_category_org_id() conventions.
--   • product_subcategories.delete NOT granted to worker role (mirrors product_categories
--     pattern where delete is org_admin and above only).
--
-- Prerequisites:
--   20260706000000_categories_security_fixes.sql (Wave 0 — base RLS policies)
--   20260706020000_categories_permission_codes.sql (Wave 2 — product_categories.* codes)
--   20260706060000_categories_audit_gaps_fix.sql (Wave 6 — sentinel audit log visibility)


-- ============================================================
-- 1. get_product_category_org_id(uuid) — parent-chain org resolver
-- ============================================================
-- Resolves the organization_id for any product_categories row by walking up the
-- parent chain until a non-NULL organization_id is found.
--
-- COALESCE(parent_id, parent_category_id) handles the dual-column ambiguity:
--   • parent_id          — baseline FK with ON DELETE CASCADE (line 20041)
--   • parent_category_id — baseline FK with ON DELETE SET NULL (line 20033)
--   Both columns are nullable and self-referencing. get_category_attribute_options()
--   uses the same COALESCE pattern (baseline lines 2962, 5127).
--
-- Returns NULL when:
--   • The row itself has organization_id IS NULL AND no parent chain resolves one
--     (i.e., truly global root category — system-managed, no org affiliation).
--
-- Max depth: product_categories has at most 2 levels (root → subcategory) in the
-- current schema, but the recursive call handles deeper trees correctly.
--
-- SECURITY DEFINER is required so the function can read product_categories rows
-- even when called from within RLS policy evaluation where the calling user may
-- not yet have SELECT access (bootstrapping problem identical to
-- get_service_category_org_id). search_path pinned to prevent search-path injection.

CREATE OR REPLACE FUNCTION public.get_product_category_org_id(cat_id uuid)
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

  -- Walk up the parent chain.
  IF v_parent_id IS NOT NULL THEN
    RETURN public.get_product_category_org_id(v_parent_id);
  END IF;

  -- No org found anywhere in the chain (global root category).
  RETURN NULL;
END;
$$;

-- Grants: EXECUTE to authenticated so RLS policies (which run as the authenticated
-- user in the policy evaluation context) can call the function.
-- SECURITY DEFINER means the function itself runs as the owner (postgres/service_role)
-- regardless of who calls it — the same pattern as get_service_category_org_id.
REVOKE ALL ON FUNCTION public.get_product_category_org_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_category_org_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_category_org_id(uuid) TO service_role;


-- ============================================================
-- 2. product_categories — add subcategory arms to RLS policies
-- ============================================================
-- Wave 0 (20260706000000) replaced all four policies with org-scoped + junction-aware
-- versions. Those policies have no arm for subcategory rows where:
--   (a) organization_id IS NULL (historic rows inserted without an org), OR
--   (b) the row has parent_id IS NOT NULL (subcategory) regardless of its own org.
--
-- Strategy:
--   SELECT — add a third OR arm: parent_id IS NOT NULL AND
--            get_product_category_org_id(parent_id) IN (visible orgs).
--            This correctly resolves org for any subcategory row via the parent chain,
--            regardless of whether organization_id is NULL or populated on the row itself.
--
--   INSERT — subcategory INSERT requires product_subcategories.create (new code).
--            Org resolved via get_product_category_org_id(parent_id) rather than
--            requiring organization_id on the row itself (supports UI patterns where
--            org is inherited from parent). IS NOT NULL guard on organization_id retained
--            for root-category inserts; subcategory arm has its own org check.
--
--   UPDATE — subcategory UPDATE requires product_subcategories.edit.
--            Both USING (pre-update) and WITH CHECK (post-update) check parent chain.
--
--   DELETE — subcategory DELETE requires product_subcategories.delete.

-- Drop all four to replace atomically.
DROP POLICY IF EXISTS product_categories_select ON public.product_categories;
DROP POLICY IF EXISTS product_categories_insert ON public.product_categories;
DROP POLICY IF EXISTS product_categories_update ON public.product_categories;
DROP POLICY IF EXISTS product_categories_delete ON public.product_categories;


-- SELECT: org-scoped + junction visibility + subcategory parent-chain + admin bypass.
-- Three org-resolution arms:
--   (a) Direct org membership — root categories where organization_id IS NOT NULL.
--   (b) Junction table — root categories shared across orgs via product_category_organizations.
--   (c) Subcategory parent chain — any row with parent_id IS NOT NULL, org resolved upward.
-- Global root categories (organization_id IS NULL, parent_id IS NULL) remain hidden from
-- non-admin users — consistent with Wave 0 design intent (no IS NULL arm on root rows).
CREATE POLICY product_categories_select
  ON public.product_categories
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      -- Arm (a): root category with direct org membership.
      organization_id IS NOT NULL
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      -- Arm (b): root category visible via junction table (shared/global root categories
      -- that are associated to an org via product_category_organizations).
      id IN (
        SELECT pco.category_id
        FROM   public.product_category_organizations pco
        WHERE  pco.organization_id IN (
          SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
        )
      )
    )
    OR (
      -- Arm (c): subcategory — org resolved via parent chain.
      -- Correct for both historic rows (organization_id IS NULL) and new rows
      -- (organization_id = companyId set by ProductSubcategories.tsx).
      parent_id IS NOT NULL
      AND public.get_product_category_org_id(parent_id) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- INSERT: root categories require product_categories.create; subcategories require
-- product_subcategories.create. Org validated against visible orgs in both arms.
-- Root arm: organization_id IS NOT NULL guard explicit (mirrors Wave 0 pattern).
-- Subcategory arm: org resolved via parent chain (parent_id must be non-NULL for
-- the arm to fire, which is the subcategory definition).
CREATE POLICY product_categories_insert
  ON public.product_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      -- Root category: create permission + org explicit and visible.
      parent_id IS NULL
      AND public.has_anew_permission((SELECT auth.uid()), 'product_categories.create')
      AND organization_id IS NOT NULL
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      -- Subcategory: subcategories.create permission + parent org visible.
      -- organization_id on the row is optional; org gate is on the parent.
      parent_id IS NOT NULL
      AND public.has_anew_permission((SELECT auth.uid()), 'product_subcategories.create')
      AND public.get_product_category_org_id(parent_id) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- UPDATE: root categories require product_categories.edit; subcategories require
-- product_subcategories.edit. Both USING (pre-update) and WITH CHECK (post-update)
-- enforce org scope to prevent cross-org reassignment.
-- USING on the subcategory arm uses get_product_category_org_id(COALESCE(parent_id, ...))
-- rather than organization_id so historic NULL-org subcategories are correctly gated.
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
      -- Subcategory: edit permission + post-update parent org visible (prevents
      -- reparenting a subcategory under a root category from a different org).
      parent_id IS NOT NULL
      AND public.has_anew_permission((SELECT auth.uid()), 'product_subcategories.edit')
      AND public.get_product_category_org_id(parent_id) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- DELETE: root categories require product_categories.delete; subcategories require
-- product_subcategories.delete.
CREATE POLICY product_categories_delete
  ON public.product_categories
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      -- Root category: delete permission + org visible.
      parent_id IS NULL
      AND public.has_anew_permission((SELECT auth.uid()), 'product_categories.delete')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      -- Subcategory: delete permission + parent org visible.
      parent_id IS NOT NULL
      AND public.has_anew_permission((SELECT auth.uid()), 'product_subcategories.delete')
      AND public.get_product_category_org_id(parent_id) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 3. product_subcategories.* permission codes
-- ============================================================
-- SUB-001 (CRITICAL): PermissionGate in ProductSubcategories.tsx checks:
--   product_subcategories.view   (line 653)
--   product_subcategories.create (line 805)
--   product_subcategories.edit   (line 806, 873)
--   product_subcategories.delete (line 891)
-- Home.tsx nav guard checks product_subcategories.view (lines 200, 205).
-- None of these codes exist in anew_permissions → has_anew_permission() returns
-- FALSE for all non-system-admin users → entire subcategories UI is gated off.
--
-- Role assignment:
--   product_subcategories.view   — viewer, worker, org_admin, super_admin
--   product_subcategories.create — worker, org_admin, super_admin
--   product_subcategories.edit   — worker, org_admin, super_admin
--   product_subcategories.delete — org_admin, super_admin (destructive; not worker)
--
-- Mirrors the service_subcategories.* assignment pattern from services module.

INSERT INTO public.anew_permissions
  (code, name, description, category, scope, supports_scope, is_dangerous)
VALUES
  (
    'product_subcategories.view',
    'Ver subcategorias de produtos',
    'Permite consultar a lista de subcategorias de produtos dentro das categorias '
    'da organização.',
    'products',
    'organization',
    false,
    false
  ),
  (
    'product_subcategories.create',
    'Criar subcategorias de produtos',
    'Permite criar novas subcategorias dentro das categorias de produtos existentes.',
    'products',
    'organization',
    false,
    false
  ),
  (
    'product_subcategories.edit',
    'Editar subcategorias de produtos',
    'Permite editar subcategorias de produtos existentes.',
    'products',
    'organization',
    false,
    false
  ),
  (
    'product_subcategories.delete',
    'Eliminar subcategorias de produtos',
    'Permite eliminar subcategorias de produtos. '
    'Requer ausência de produtos associados à subcategoria.',
    'products',
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
-- trg_protect_system_role_perms blocks INSERT on anew_role_permissions for
-- system roles (super_admin, system_admin). Disable around the seeding block.

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;

-- super_admin: all four codes (global admin, must not be restricted).
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
WHERE  r.code = 'super_admin'
  AND  r.organization_id IS NULL   -- global super_admin role only
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;

-- org_admin (per-org): all four codes. Back-fills existing orgs and covers future
-- orgs via bootstrap (bootstrap iterates anew_permissions to seed org_admin).
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
WHERE  r.code = 'org_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- worker (per-org default role): view + create + edit (not delete — destructive).
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = ANY (ARRAY[
            'product_subcategories.view',
            'product_subcategories.create',
            'product_subcategories.edit'
          ]::text[])
WHERE  r.code = 'worker'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- viewer (per-org read-only role): view only.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = 'product_subcategories.view'
WHERE  r.code = 'viewer'
ON CONFLICT (role_id, permission_code) DO NOTHING;


-- ============================================================
-- 4. entity_audit_log SELECT policy — add product_subcategories.view
-- ============================================================
-- Wave 6 (20260706060000) added the sentinel-bypass arm and org-scoped permission
-- gate. Neither arm includes product_subcategories.view. Once this code is seeded
-- (section 3 above), users holding only product_subcategories.view cannot read
-- subcategory audit rows — the org-scoped arm checks for product_categories.view
-- but not product_subcategories.view, and the sentinel arm also omits it.
--
-- This replacement adds product_subcategories.view to both the org-scoped arm and
-- the sentinel bypass arm. The sentinel arm is extended so that subcategory audit
-- rows written under the sentinel UUID (when organization_id on the row was NULL
-- at the time of the mutation) are visible to subcategory managers.

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
        OR public.has_anew_permission((SELECT auth.uid()), 'brands.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'brands.edit')
      )
    )
  );


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm get_product_category_org_id() is SECURITY DEFINER and stable:
--
--   SELECT proname, prosecdef, provolatile, proacl
--   FROM pg_proc
--   WHERE proname = 'get_product_category_org_id';
--
-- Expected: prosecdef = true, provolatile = 's' (stable), proacl shows
--   authenticated and service_role have EXECUTE.
--
-- 2. Confirm product_categories now has four policies with subcategory arms:
--
--   SELECT policyname, cmd, qual::text
--   FROM pg_policies
--   WHERE tablename = 'product_categories'
--   ORDER BY cmd;
--
-- Expected: four policies. qual/with_check text for each must include
--   'get_product_category_org_id' (subcategory arm).
--
-- 3. Confirm all four product_subcategories.* codes are in anew_permissions:
--
--   SELECT code, name FROM public.anew_permissions
--   WHERE code LIKE 'product_subcategories.%'
--   ORDER BY code;
--
-- Expected: 4 rows — product_subcategories.{create,delete,edit,view}.
--
-- 4. Confirm org_admin has all four subcategory codes (sample across orgs):
--
--   SELECT DISTINCT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'org_admin'
--     AND rp.permission_code LIKE 'product_subcategories.%'
--   ORDER BY rp.permission_code;
--
-- Expected: 4 rows.
--
-- 5. Confirm worker has view+create+edit but NOT delete:
--
--   SELECT DISTINCT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'worker'
--     AND rp.permission_code LIKE 'product_subcategories.%'
--   ORDER BY rp.permission_code;
--
-- Expected: 3 rows — product_subcategories.{create,edit,view}.
--   product_subcategories.delete must NOT appear.
--
-- 6. Smoke-test RLS for a subcategory row with NULL org:
--   (Simulates the known-gap case where historic rows have organization_id IS NULL.)
--
--   -- As an org_admin of org X, run:
--   SELECT * FROM public.product_categories
--   WHERE parent_id IS NOT NULL
--     AND organization_id IS NULL;
--
--   Expected: rows returned IF their parent's organization_id resolves to an org
--     the user can see. Rows with parents in unrelated orgs: 0 rows.
--
-- 7. Confirm entity_audit_log SELECT policy includes product_subcategories.view:
--
--   SELECT policyname, qual::text
--   FROM pg_policies
--   WHERE tablename = 'entity_audit_log'
--     AND policyname = 'entity_audit_log_select';
--
-- Expected: qual text contains 'product_subcategories.view' in both the
--   org-scoped arm and the sentinel arm.
--
-- 8. Smoke-test get_product_category_org_id() for a known subcategory:
--
--   SELECT public.get_product_category_org_id('<subcategory_uuid>');
--
-- Expected: the organization_id of the root parent category (not NULL if the
--   parent is an org-scoped root category).
