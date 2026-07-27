-- Repoint legacy RBAC helper functions to the active "anew_*" permission system.
--
-- ROOT CAUSE
-- ----------
-- The baseline (20260615130000_baseline_new_database.sql) ships three legacy
-- RBAC helpers that JOIN tables which are NEVER created in the new database:
--
--   * has_permission(_user_id uuid, _permission_code text)
--       -> FROM public.user_roles ur
--          JOIN public.role_permissions rp ...
--          JOIN public.permissions p ...
--   * has_role(_user_id uuid, _role app_role)
--       -> FROM public.user_roles ur JOIN public.roles r ...
--   * has_role_name(_user_id uuid, _role_name text)
--       -> FROM public.user_roles ur JOIN public.roles r ...
--
-- Those four tables (user_roles, role_permissions, permissions, roles) do not
-- exist in this database. The live RBAC is the "anew_*" model
-- (anew_memberships -> anew_roles -> anew_role_permissions) exposed through
-- has_anew_permission(auth_uid, code).
--
-- Any RLS policy that reaches one of the legacy helpers therefore fails with:
--   ERROR: relation "public.user_roles" does not exist
--
-- The user-visible symptom was "Criar Minuta" in /contract-templates:
--   INSERT INTO client_contract_templates
--     -> RLS policy "client_templates_manage" WITH CHECK
--        ( is_system_admin(auth.uid())
--          OR has_permission(auth.uid(), 'client_contracts.manage_templates')
--          OR has_permission(auth.uid(), 'client_contracts.manage') )
--     -> for a non-system-admin the has_permission() branch is evaluated
--     -> "relation public.user_roles does not exist"
--
-- The same orphaned dependency affects ~30 policies still calling the legacy
-- helpers, e.g.:
--   client_contract_parties (client_parties_manage / client_parties_select),
--   client_contract_events, client_contract_signature_requests,
--   client_contract_templates, marketing_lists (all CRUD),
--   product_prices, product_price_history, service_prices, service_price_history,
--   service_fee_types, incidents, locations, routes, channel_types,
--   anew_contacts_insert, and role_calendar_permissions (via has_role).
--
-- FIX
-- ---
-- Rather than recreate the obsolete legacy tables or rewrite each policy, we
-- redefine the three helper functions so they delegate to the anew RBAC. This
-- repairs every orphaned caller at once and keeps a single source of truth for
-- permission checks. Signatures are preserved so CREATE OR REPLACE keeps all
-- existing GRANTs and policy dependencies intact.

-- 1) has_permission -> has_anew_permission
--    Both helpers are keyed on the auth uid (legacy callers always pass
--    auth.uid() as _user_id, and has_anew_permission joins anew_users on
--    auth_user_id), so this is a semantics-preserving delegation.
CREATE OR REPLACE FUNCTION "public"."has_permission"("_user_id" "uuid", "_permission_code" "text")
    RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.has_anew_permission(_user_id, _permission_code);
$$;

-- 2) has_role(app_role) -> anew role membership check.
--    Legacy enum values are mapped onto anew_roles.code / anew_roles.name using
--    the same intent as the original implementation. System admins always pass
--    the 'admin'/'manager' checks.
CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role")
    RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am
      ON am.user_id = au.id AND am.status = 'active'
    JOIN public.anew_roles ar
      ON ar.id = am.role_id
    WHERE au.auth_user_id = _user_id
      AND (
        (LOWER(_role::text) = 'admin'
           AND (ar.code IN ('system_admin', 'super_admin')
                OR LOWER(ar.code) LIKE '%admin%'
                OR LOWER(ar.name) LIKE '%admin%'))
        OR
        (LOWER(_role::text) = 'manager'
           AND (ar.code IN ('system_admin', 'super_admin')
                OR LOWER(ar.code) LIKE '%admin%'
                OR LOWER(ar.code) LIKE '%manager%'
                OR LOWER(ar.name) LIKE '%admin%'
                OR LOWER(ar.name) LIKE '%manager%'))
        OR
        (LOWER(_role::text) = 'sales_rep'
           AND (LOWER(ar.code) LIKE 'sales%' OR LOWER(ar.name) LIKE 'sales%'))
        OR
        (LOWER(_role::text) = 'viewer'
           AND (LOWER(ar.code) LIKE '%view%' OR LOWER(ar.name) LIKE '%view%'))
        OR
        LOWER(ar.code) = LOWER(_role::text)
        OR
        LOWER(ar.name) = LOWER(_role::text)
      )
  );
$$;

-- 3) has_role_name(text) -> anew role membership check by code or name.
CREATE OR REPLACE FUNCTION "public"."has_role_name"("_user_id" "uuid", "_role_name" "text")
    RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am
      ON am.user_id = au.id AND am.status = 'active'
    JOIN public.anew_roles ar
      ON ar.id = am.role_id
    WHERE au.auth_user_id = _user_id
      AND (LOWER(ar.code) = LOWER(_role_name)
           OR LOWER(ar.name) = LOWER(_role_name))
  );
$$;
