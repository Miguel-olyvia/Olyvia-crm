-- Attributes — product_attributes.view Permission Code — Wave 2
-- 2026-07-07 | Module: Fase 6 · Attributes | Wave: 2 (permission catalogue gap)
-- Forward-only migration. Do not fold into the baseline.
--
-- Problem:
--   20260707000000_attributes_security_fixes.sql (Wave 0) added
--   'product_attributes.view' to the entity_audit_log SELECT policy (two arms):
--     • Org-scoped arm  — line 90 of Wave 0
--     • Sentinel arm    — line 100 of Wave 0
--
--   A search of all migration files confirms that 'product_attributes.view'
--   has never been seeded into public.anew_permissions.
--
--   has_anew_permission() joins on anew_role_permissions.permission_code which is
--   populated from anew_permissions at org bootstrap. Because this code was never
--   seeded:
--     • No role (including org_admin, worker, viewer) has this code.
--     • Both arms referencing 'product_attributes.view' in entity_audit_log_select
--       are permanently dead — no user can satisfy them.
--     • Future policies or RPCs that gate on this code would silently deny all access.
--
-- Fix:
--   1. Seed 'product_attributes.view' into anew_permissions (ON CONFLICT idempotent).
--   2. Assign to roles:
--        super_admin  — granted (global admin reads all audit logs)
--        org_admin    — granted (manages attribute configuration for their org)
--        worker       — granted (workers who manage attributes need audit log access)
--        viewer       — NOT granted (read-only access to core product list is
--                       products.view; attribute audit log is management-level)
--
-- Pattern: mirrors 20260706030000_categories_products_permission_codes.sql exactly.
-- Prerequisites:
--   20260706030000_categories_products_permission_codes.sql
--     (trg_protect_system_role_perms trigger pattern established)
--   20260707000000_attributes_security_fixes.sql
--     (Wave 0 — defines the entity_audit_log_select policy using this code)


-- ============================================================
-- 1. Seed permission code into anew_permissions
-- ============================================================

INSERT INTO public.anew_permissions
  (code, name, description, category, scope, supports_scope, is_dangerous)
VALUES
  (
    'product_attributes.view',
    'Ver atributos de produto',
    'Permite consultar a configuração de atributos de produto, grupos de opções '
    'e paletas. Dá acesso ao registo de auditoria de atributos.',
    'products',
    'organization',
    false,
    false
  )
ON CONFLICT (code) DO UPDATE
SET name            = EXCLUDED.name,
    description     = EXCLUDED.description,
    category        = EXCLUDED.category,
    scope           = EXCLUDED.scope,
    supports_scope  = EXCLUDED.supports_scope,
    is_dangerous    = EXCLUDED.is_dangerous,
    updated_at      = now();


-- ============================================================
-- 2. Assign permission code to roles
-- ============================================================
-- trg_protect_system_role_perms blocks INSERT/DELETE/UPDATE on anew_role_permissions
-- for system roles (super_admin, system_admin). Disable around the block,
-- then re-enable immediately after.

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;

-- super_admin (global role — organization_id IS NULL)
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, 'product_attributes.view'
FROM   public.anew_roles r
WHERE  r.code = 'super_admin'
  AND  r.organization_id IS NULL
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;

-- org_admin (per-org role — back-fill all existing orgs)
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, 'product_attributes.view'
FROM   public.anew_roles r
WHERE  r.code = 'org_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- worker (per-org default role — back-fill all existing orgs)
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, 'product_attributes.view'
FROM   public.anew_roles r
WHERE  r.code = 'worker'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- viewer: NOT granted intentionally.
-- products.view already covers read access to the product list.
-- Attribute audit log is management-level information.


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm the code is present in anew_permissions:
--
--   SELECT code, name, category, scope
--   FROM public.anew_permissions
--   WHERE code = 'product_attributes.view';
--
-- Expected: 1 row — category='products', scope='organization'.
--
-- 2. Confirm role assignments:
--
--   SELECT r.code AS role_code, arp.permission_code
--   FROM public.anew_role_permissions arp
--   JOIN public.anew_roles r ON r.id = arp.role_id
--   WHERE arp.permission_code = 'product_attributes.view'
--   ORDER BY r.code;
--
-- Expected rows: super_admin, org_admin (one per org), worker (one per org).
-- viewer should NOT appear.
--
-- 3. Confirm entity_audit_log_select arms are no longer dead:
--
--   -- As a worker user who holds product_attributes.view:
--   SELECT public.has_anew_permission(auth.uid(), 'product_attributes.view');
--
-- Expected: true.
--
-- 4. Confirm new orgs get the code automatically at bootstrap:
--   The org bootstrap function (baseline) iterates all anew_permissions and assigns
--   them to org_admin. The ON CONFLICT seed above ensures the code is present in
--   anew_permissions before any future org is created.
