-- Categories — products.* Permission Codes — Wave 3
-- 2026-07-06 | Module: Categories | Wave: 3 (products.* permission catalogue gap)
-- Forward-only migration. Do not fold into the baseline.
--
-- Problem (DB-CAT-001 / RLS-CAT-02 — CRITICAL):
--   Four tables in the Categories submodule gate ALL write operations on
--   has_anew_permission(auth.uid(), 'products.manage'):
--     • category_attributes
--     • category_attribute_palettes
--     • product_attribute_value_prices
--     • product_attribute_price_ranges
--
--   A search of all 60+ migration files confirms that NONE of the following codes
--   are present in public.anew_permissions in any migration:
--     products.manage
--     products.view
--     products.create
--     products.edit
--     products.delete
--
--   has_anew_permission() joins on anew_role_permissions.permission_code which is
--   populated from anew_permissions at org bootstrap (baseline line 935–938 iterates
--   all anew_permissions and assigns them to org_admin). Because these five codes were
--   never seeded:
--     • No role (including org_admin, worker, viewer) has these codes.
--     • Every write on the four tables listed above silently fails permission-denied
--       for ALL non-system-admin users in every existing and future org.
--     • The entity_audit_log SELECT policy (Wave 0 section 1) references products.manage
--       and products.view — those arms are permanently dead without this fix.
--
--   This pre-dates the categories wave. Products wave (20260703000000) introduced RLS
--   policies that reference these codes without seeding them. Categories wave inherited
--   the gap and extended it to four more tables. This migration resolves it once for
--   both modules.
--
-- Fix:
--   1. Seed all five products.* codes into anew_permissions (ON CONFLICT idempotent).
--   2. Assign to roles:
--        super_admin  — all five codes (global admin)
--        org_admin    — all five codes (org-level admin)
--        worker       — products.view + products.create + products.edit + products.manage
--                       (not products.delete — destructive)
--        viewer       — products.view only (read-only)
--   3. Back-fill existing org_admin, worker, viewer roles for existing orgs.
--
-- Role assignment rationale:
--   products.view   — viewer, worker, org_admin, super_admin
--   products.create — worker, org_admin, super_admin
--   products.edit   — worker, org_admin, super_admin
--   products.manage — worker, org_admin, super_admin
--                     (products.manage is the module-level write gate for pricing tables;
--                      it is intentionally broader than products.edit and covers operations
--                      that span multiple related tables, e.g. attribute value prices)
--   products.delete — org_admin, super_admin (destructive; not granted to worker)
--
-- Pattern: mirrors 20260706020000_categories_permission_codes.sql exactly.
-- Prerequisites:
--   20260706000000_categories_security_fixes.sql (Wave 0 — defines the policies using these codes)
--   20260706020000_categories_permission_codes.sql (Wave 2 — same trigger disable pattern)


-- ============================================================
-- 1. Seed permission codes into anew_permissions
-- ============================================================

INSERT INTO public.anew_permissions
  (code, name, description, category, scope, supports_scope, is_dangerous)
VALUES
  (
    'products.view',
    'Ver produtos',
    'Permite consultar a lista de produtos, preços e atributos.',
    'products',
    'organization',
    false,
    false
  ),
  (
    'products.create',
    'Criar produtos',
    'Permite criar novos produtos com preços e atributos.',
    'products',
    'organization',
    false,
    false
  ),
  (
    'products.edit',
    'Editar produtos',
    'Permite editar produtos existentes, incluindo preços e atributos.',
    'products',
    'organization',
    false,
    false
  ),
  (
    'products.manage',
    'Gerir configuração de produtos',
    'Permite gerir configuração avançada de produtos: atributos de categoria, '
    'paletas de atributos, preços por opção e intervalos de preço. '
    'Necessário para operações que abrangem múltiplas tabelas de produtos.',
    'products',
    'organization',
    false,
    false
  ),
  (
    'products.delete',
    'Eliminar produtos',
    'Permite eliminar produtos. Requer ausência de dependências activas.',
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
-- then re-enable immediately after.

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;

-- super_admin: all five codes (global admin, must not be restricted)
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = ANY (ARRAY[
            'products.view',
            'products.create',
            'products.edit',
            'products.manage',
            'products.delete'
          ]::text[])
WHERE  r.code = 'super_admin'
  AND  r.organization_id IS NULL   -- global super_admin role only
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;

-- org_admin (per-org role, one row per org): all five codes.
-- Covers both existing orgs (back-fill) and future orgs (bootstrap grants all
-- anew_permissions to org_admin, so the newly seeded rows above cover new orgs).
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = ANY (ARRAY[
            'products.view',
            'products.create',
            'products.edit',
            'products.manage',
            'products.delete'
          ]::text[])
WHERE  r.code = 'org_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- worker (per-org default role): view + create + edit + manage (not delete — destructive).
-- products.manage is granted to worker because workers operate the pricing dialog
-- (CategoryAttributePricesDialog) which writes to product_attribute_value_prices — a
-- table gated exclusively on products.manage.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = ANY (ARRAY[
            'products.view',
            'products.create',
            'products.edit',
            'products.manage'
          ]::text[])
WHERE  r.code = 'worker'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- viewer (per-org read-only role): view only.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM   public.anew_roles r
JOIN   public.anew_permissions p
       ON p.code = 'products.view'
WHERE  r.code = 'viewer'
ON CONFLICT (role_id, permission_code) DO NOTHING;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm all five codes are in anew_permissions:
--
--   SELECT code, name, category FROM public.anew_permissions
--   WHERE code LIKE 'products.%'
--   ORDER BY code;
--
-- Expected: 5 rows — products.{create,delete,edit,manage,view}.
--
-- 2. Confirm super_admin (global) has all five codes:
--
--   SELECT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'super_admin'
--     AND r.organization_id IS NULL
--     AND rp.permission_code LIKE 'products.%'
--   ORDER BY rp.permission_code;
--
-- Expected: 5 rows.
--
-- 3. Confirm org_admin has all five codes (sample across orgs):
--
--   SELECT DISTINCT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'org_admin'
--     AND rp.permission_code LIKE 'products.%'
--   ORDER BY rp.permission_code;
--
-- Expected: 5 rows.
--
-- 4. Confirm worker has view+create+edit+manage but NOT delete:
--
--   SELECT DISTINCT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'worker'
--     AND rp.permission_code LIKE 'products.%'
--   ORDER BY rp.permission_code;
--
-- Expected: 4 rows — products.{create,edit,manage,view}. products.delete must NOT appear.
--
-- 5. Confirm viewer has only products.view:
--
--   SELECT DISTINCT rp.permission_code
--   FROM public.anew_role_permissions rp
--   JOIN public.anew_roles r ON r.id = rp.role_id
--   WHERE r.code = 'viewer'
--     AND rp.permission_code LIKE 'products.%';
--
-- Expected: 1 row — products.view only.
--
-- 6. Smoke-test has_anew_permission for a known org_admin user:
--
--   SELECT public.has_anew_permission('<org_admin_auth_uid>', 'products.manage');
--   SELECT public.has_anew_permission('<org_admin_auth_uid>', 'products.delete');
--   SELECT public.has_anew_permission('<worker_auth_uid>',    'products.manage');
--   SELECT public.has_anew_permission('<worker_auth_uid>',    'products.delete');
--   SELECT public.has_anew_permission('<viewer_auth_uid>',    'products.view');
--   SELECT public.has_anew_permission('<viewer_auth_uid>',    'products.manage');
--
-- Expected: true, true, true, false, true, false.
