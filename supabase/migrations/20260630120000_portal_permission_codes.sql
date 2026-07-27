-- =============================================================================
-- Migration: 20260630120000_portal_permission_codes.sql
-- Purpose  : Seed permission codes required by the create-client-portal-access
--            Edge Function RBAC gate (finding BASE-USR-011).
--
--            The Edge Function currently calls validateOrgScope() which only
--            checks that the caller has ANY active membership in the target
--            org, with no role or permission filter. The fix (in the Edge
--            Function layer, tracked separately) will add a check for either
--            'portal.manage' or 'client_contracts.edit' after the scope check.
--
--            This migration seeds the permission catalogue and assigns the
--            permissions to the appropriate roles so the RBAC gate has data
--            to enforce against.
--
-- Permissions seeded:
--   portal.manage         — create/reset/revoke client portal accounts,
--                           publish documents to the portal
--   client_contracts.edit — already referenced in baseline RLS policies
--                           (line 25942) but not yet in anew_permissions;
--                           seeded here so has_anew_permission() can resolve
--                           it and it appears in the permission catalogue UI
--
-- Role assignments:
--   super_admin  — full access (all permissions)
--   system_admin — full access (all permissions)
--   org_admin    — org-level admin; can manage portal and contracts
--
--   Roles NOT granted (intentional exclusions):
--   worker  — standard collaborator; no portal account management
--   viewer  — read-only; no write operations
--   client  — external portal user; must never gain portal.manage
--
-- Pattern: follows 20260622181000_controlled_exports_permissions.sql exactly.
--   - INSERT INTO anew_permissions ON CONFLICT (code) DO UPDATE
--   - DISABLE / ENABLE trg_protect_system_role_perms around role_permissions INSERT
--   - INSERT INTO anew_role_permissions ON CONFLICT DO NOTHING
--
-- Safe     : Forward-only. ON CONFLICT guards make this idempotent.
--            No schema changes, no data destructive operations.
-- Prerequisites:
--   20260615130000_baseline_new_database.sql
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Seed anew_permissions catalogue entries
-- ---------------------------------------------------------------------------

INSERT INTO public.anew_permissions
  (code, name, description, category, scope, supports_scope, is_dangerous)
VALUES
  (
    'portal.manage',
    'Gerir portal de clientes',
    'Permite criar, repor passwords e revogar acessos ao portal de clientes, '
    'e publicar documentos no portal.',
    'portal',
    'organization',
    false,
    false
  ),
  (
    'client_contracts.edit',
    'Editar contratos de clientes',
    'Permite editar contratos de clientes existentes na organização.',
    'client_contracts',
    'organization',
    false,
    false
  )
ON CONFLICT (code) DO UPDATE
  SET name           = EXCLUDED.name,
      description    = EXCLUDED.description,
      category       = EXCLUDED.category,
      scope          = EXCLUDED.scope,
      supports_scope = EXCLUDED.supports_scope,
      is_dangerous   = EXCLUDED.is_dangerous,
      updated_at     = now();


-- ---------------------------------------------------------------------------
-- 2. Assign permissions to roles
--    Disable the system-role protection trigger for this session so that the
--    migration can insert role_permissions for is_system roles (super_admin,
--    system_admin). The trigger is re-enabled immediately after.
-- ---------------------------------------------------------------------------

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;

-- super_admin and system_admin: both portal.manage and client_contracts.edit
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.anew_roles r
CROSS JOIN public.anew_permissions p
WHERE r.code IN ('super_admin', 'system_admin')
  AND p.code IN ('portal.manage', 'client_contracts.edit')
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;

-- org_admin: portal.manage and client_contracts.edit
-- org_admin is per-organization (organization_id IS NOT NULL) so this inserts
-- one row per existing org_admin role instance across all organizations.
INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.anew_roles r
CROSS JOIN public.anew_permissions p
WHERE r.code = 'org_admin'
  AND p.code IN ('portal.manage', 'client_contracts.edit')
ON CONFLICT (role_id, permission_code) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. Verification query (for human review)
--
--    SELECT ar.code AS role_code, arp.permission_code
--    FROM public.anew_role_permissions arp
--    JOIN public.anew_roles ar ON ar.id = arp.role_id
--    WHERE arp.permission_code IN ('portal.manage', 'client_contracts.edit')
--    ORDER BY ar.code, arp.permission_code;
--
--    Expected: rows for super_admin, system_admin, and all org_admin instances.
-- ---------------------------------------------------------------------------


-- =============================================================================
-- Notes
-- =============================================================================
-- 1. client_contracts.edit already appears in baseline RLS policies on
--    client_contracts (line 25942) and client_contract_parties (line 25963),
--    meaning has_anew_permission() is already called with this code in
--    production. The permission row in anew_permissions was absent from the
--    baseline data, causing has_anew_permission() to always return false for
--    non-system-admin callers when using the anew_role_permissions path. This
--    migration fixes the data gap.
--
-- 2. portal.manage is a new permission code introduced specifically for the
--    RBAC gate in the create-client-portal-access Edge Function. The Edge
--    Function patch (BASE-USR-011, application layer) must query:
--      anew_memberships JOIN anew_roles JOIN anew_role_permissions
--      WHERE user_id = callerAnew.id
--        AND organization_id = targetOrgId
--        AND status = 'active'
--        AND permission_code IN ('portal.manage', 'client_contracts.edit')
--    and reject with 403 if no matching row is found.
--
-- 3. The trg_protect_system_role_perms trigger is disabled only for the
--    super_admin / system_admin block (which have organization_id = NULL and
--    is_system = true). The org_admin block runs with the trigger enabled
--    because org_admin is not a system role (is_system = false).
--    This matches the pattern used in 20260622181000.
-- =============================================================================
