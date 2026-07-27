-- Categories Permission Codes — Wave 2
-- 2026-07-06 | Module: Categories | Wave: 2 (permission catalogue + role assignments)
-- Forward-only migration. Do not fold into the baseline.
--
-- Problem:
--   Wave 0 (20260706000000_categories_security_fixes.sql) introduced four RLS policies
--   on product_categories that gate writes on permission codes:
--     product_categories.create
--     product_categories.edit
--     product_categories.delete
--   and a new code used in entity_audit_log_select:
--     product_categories.view
--
--   The baseline (20260615130000_baseline_new_database.sql) already had RLS policies
--   referencing product_categories.create / .edit / .delete — but those codes were
--   NEVER inserted into public.anew_permissions, and NEVER assigned to any role in
--   public.anew_role_permissions.
--
--   has_anew_permission() joins directly on anew_role_permissions.permission_code
--   (a plain text column, no FK to anew_permissions). This means:
--     • For existing orgs: org_admin was granted all anew_permissions codes at bootstrap
--       (line 935–938 of baseline). Because product_categories.* were never in
--       anew_permissions, org_admin never received those codes. Every write on
--       product_categories fails silently for org_admin users — even though they should
--       have full access.
--     • For new orgs: the bootstrap function also iterates anew_permissions, so missing
--       codes mean new org_admins also lack the permission.
--     • product_categories.view is entirely new (Wave 0) — no existing role has it.
--
-- Fix:
--   1. Seed all four permission codes into anew_permissions (ON CONFLICT idempotent).
--   2. Assign all four codes to:
--        super_admin  — global admin, must have all permissions
--        org_admin    — org-level admin, manages all org resources
--      Assign read + write codes to:
--        worker       — is_system = false, is_default = true; should be able to manage
--                       product categories within their org
--      Assign view only to:
--        viewer       — read-only role
--   3. Back-fill existing org_admin roles for existing orgs that were bootstrapped
--      without these codes.
--
-- Role assignment rationale:
--   product_categories.view   — viewer, worker, org_admin, super_admin
--   product_categories.create — worker, org_admin, super_admin
--   product_categories.edit   — worker, org_admin, super_admin
--   product_categories.delete — org_admin, super_admin (destructive; not granted to worker)
--
-- Note on system_admin:
--   system_admin bypasses all RLS via is_system_admin_user() — no permission row needed.
--   Assigning the codes here anyway would be harmless but is explicitly skipped to
--   preserve the least-privilege principle established in 20260622114000.
--
-- Pattern: mirrors 20260622181000_controlled_exports_permissions.sql exactly.
-- Prerequisites: 20260706000000_categories_security_fixes.sql (Wave 0)


-- ============================================================
-- 1. Seed permission codes into anew_permissions
-- ============================================================

INSERT INTO public.anew_permissions
  (code, name, description, category, scope, supports_scope, is_dangerous)
VALUES
  (
    'product_categories.view',
    'Ver categorias de produtos',
    'Permite consultar a lista de categorias e subcategorias de produtos.',
    'products',
    'organization',
    false,
    false
  ),
  (
    'product_categories.create',
    'Criar categorias de produtos',
    'Permite criar novas categorias e subcategorias de produtos.',
    'products',
    'organization',
    false,
    false
  ),
  (
    'product_categories.edit',
    'Editar categorias de produtos',
    'Permite editar categorias e subcategorias de produtos existentes.',
    'products',
    'organization',
    false,
    false
  ),
  (
    'product_categories.delete',
    'Eliminar categorias de produtos',
    'Permite eliminar categorias e subcategorias de produtos. '
    'Requer ausência de produtos associados.',
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


-- ============================================================
-- 2. Assign permission codes to roles
-- ============================================================
-- trg_protect_system_role_perms blocks INSERT/DELETE/UPDATE on anew_role_permissions
-- for system roles (super_admin, system_admin). Disable around the seeding block,
-- then re-enable immediately after — consistent with every prior permission migration.

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;

-- super_admin: all four codes (global admin, must not be restricted)
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = ANY (ARRAY[
            'product_categories.view',
            'product_categories.create',
            'product_categories.edit',
            'product_categories.delete'
          ]::text[])
WHERE  r.code = 'super_admin'
  AND  r.organization_id IS NULL   -- global super_admin role only
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;

-- org_admin (per-org role, one row per org): all four codes.
-- Covers both existing orgs (back-fill) and future orgs (bootstrap grants all
-- anew_permissions to org_admin, so the seeded rows above cover new orgs automatically).
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = ANY (ARRAY[
            'product_categories.view',
            'product_categories.create',
            'product_categories.edit',
            'product_categories.delete'
          ]::text[])
WHERE  r.code = 'org_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- worker (per-org default role): view + create + edit (not delete — destructive).
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = ANY (ARRAY[
            'product_categories.view',
            'product_categories.create',
            'product_categories.edit'
          ]::text[])
WHERE  r.code = 'worker'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- viewer (per-org read-only role): view only.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = 'product_categories.view'
WHERE  r.code = 'viewer'
ON CONFLICT (role_id, permission_code) DO NOTHING;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm all four codes are in anew_permissions:
--
--   SELECT code, name, category FROM public.anew_permissions
--   WHERE code LIKE 'product_categories.%'
--   ORDER BY code;
--
-- Expected: 4 rows — product_categories.{create,delete,edit,view}.
--
-- 2. Confirm super_admin (global) has all four codes:
--
--   SELECT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'super_admin'
--     AND r.organization_id IS NULL
--     AND rp.permission_code LIKE 'product_categories.%'
--   ORDER BY rp.permission_code;
--
-- Expected: 4 rows.
--
-- 3. Confirm org_admin has all four codes (sample one org):
--
--   SELECT r.organization_id, rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'org_admin'
--     AND rp.permission_code LIKE 'product_categories.%'
--   ORDER BY r.organization_id, rp.permission_code
--   LIMIT 20;
--
-- Expected: 4 rows per org_admin role (one per org).
--
-- 4. Confirm worker has view+create+edit but NOT delete:
--
--   SELECT DISTINCT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'worker'
--     AND rp.permission_code LIKE 'product_categories.%'
--   ORDER BY rp.permission_code;
--
-- Expected: 3 rows — product_categories.{create,edit,view}.
--   product_categories.delete must NOT appear.
--
-- 5. Confirm viewer has only view:
--
--   SELECT DISTINCT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'viewer'
--     AND rp.permission_code LIKE 'product_categories.%';
--
-- Expected: 1 row — product_categories.view only.
--
-- 6. Smoke-test has_anew_permission for a known org_admin user:
--
--   SELECT public.has_anew_permission('<org_admin_auth_uid>', 'product_categories.create');
--   SELECT public.has_anew_permission('<org_admin_auth_uid>', 'product_categories.delete');
--   SELECT public.has_anew_permission('<viewer_auth_uid>',    'product_categories.view');
--   SELECT public.has_anew_permission('<viewer_auth_uid>',    'product_categories.create');
--
-- Expected: true, true, true, false.
