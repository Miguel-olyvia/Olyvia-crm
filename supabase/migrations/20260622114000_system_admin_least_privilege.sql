-- Slide 8: least privilege by default for the platform system administrator.
-- Forward-only migration. Do not fold into the baseline.

CREATE OR REPLACE FUNCTION public.is_system_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
    JOIN public.anew_roles ar ON ar.id = am.role_id
    WHERE au.auth_user_id = _user_id
      AND ar.code = 'system_admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_system_admin_check(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT public.is_system_admin(_user_id) $$;

CREATE OR REPLACE FUNCTION public.is_system_admin_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT public.is_system_admin(_user_id) $$;

REVOKE ALL ON FUNCTION public.is_system_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_system_admin_check(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_system_admin_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_system_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_system_admin_check(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_system_admin_user(uuid) TO authenticated, service_role;

INSERT INTO public.anew_permissions
  (code, name, description, category, scope, supports_scope, is_dangerous)
VALUES
  ('platform.dashboard.view', 'Ver dashboard da plataforma', 'Ver apenas métricas globais agregadas', 'platform', 'global', false, false),
  ('platform.organizations.view', 'Ver organizações da plataforma', 'Ver metadados administrativos das organizações', 'platform', 'global', false, false),
  ('platform.organizations.manage', 'Gerir organizações da plataforma', 'Gerir configuração e estado das organizações', 'platform', 'global', false, true),
  ('platform.users.view', 'Ver utilizadores da plataforma', 'Ver contas e estado operacional', 'platform', 'global', false, true),
  ('platform.users.manage', 'Gerir utilizadores da plataforma', 'Executar operações administrativas de conta', 'platform', 'global', false, true),
  ('platform.settings.manage', 'Gerir definições da plataforma', 'Gerir configurações técnicas globais', 'platform', 'global', false, true),
  ('platform.security.audit', 'Consultar auditoria de segurança', 'Consultar eventos e métricas de segurança', 'platform', 'global', false, true),
  ('dashboard.view', 'Ver dashboard', 'Aceder ao dashboard correspondente ao papel', 'dashboard', 'organization', false, false),
  ('settings.update', 'Gerir definições', 'Alterar definições autorizadas', 'settings', 'organization', false, true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    scope = EXCLUDED.scope,
    supports_scope = EXCLUDED.supports_scope,
    is_dangerous = EXCLUDED.is_dangerous;

ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;

DELETE FROM public.anew_role_permissions arp
USING public.anew_roles r
WHERE r.id = arp.role_id
  AND r.code = 'system_admin';

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.anew_roles r
JOIN public.anew_permissions p ON p.code = ANY (ARRAY[
  'platform.dashboard.view',
  'platform.organizations.view',
  'platform.organizations.manage',
  'platform.users.view',
  'platform.users.manage',
  'platform.settings.manage',
  'platform.security.audit',
  'dashboard.view',
  'settings.update'
]::text[])
WHERE r.code = 'system_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.anew_roles r
CROSS JOIN public.anew_permissions p
WHERE r.code = 'super_admin'
  AND p.code NOT LIKE 'platform.%'
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;

CREATE OR REPLACE FUNCTION public.has_anew_permission(
  _auth_uid uuid,
  _permission_code text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am
      ON am.user_id = au.id
     AND am.status = 'active'
    JOIN public.anew_role_permissions arp
      ON arp.role_id = am.role_id
     AND arp.permission_code = _permission_code
    WHERE au.auth_user_id = _auth_uid
  )
$$;

CREATE OR REPLACE FUNCTION public.has_scheduling_permission(
  user_id uuid,
  permission_code text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_anew_permission(
    has_scheduling_permission.user_id,
    has_scheduling_permission.permission_code
  )
$$;

REVOKE ALL ON FUNCTION public.has_anew_permission(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_scheduling_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_anew_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_scheduling_permission(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT organization_id
  FROM (
    WITH RECURSIVE direct_orgs AS (
      SELECT m.organization_id
      FROM public.anew_memberships m
      JOIN public.anew_users u ON u.id = m.user_id
      JOIN public.anew_roles r ON r.id = m.role_id
      WHERE u.auth_user_id = _auth_uid
        AND m.status = 'active'
        AND r.code <> 'system_admin'
    ),
    descendant_orgs AS (
      SELECT organization_id FROM direct_orgs
      UNION
      SELECT h.child_org_id
      FROM public.anew_hierarchy h
      JOIN descendant_orgs d ON d.organization_id = h.parent_org_id
    ),
    ancestor_orgs AS (
      SELECT organization_id FROM direct_orgs
      UNION
      SELECT h.parent_org_id
      FROM public.anew_hierarchy h
      JOIN ancestor_orgs a ON a.organization_id = h.child_org_id
    ),
    hierarchy_orgs AS (
      SELECT organization_id FROM descendant_orgs
      UNION
      SELECT organization_id FROM ancestor_orgs
    ),
    expanded AS (
      SELECT organization_id FROM hierarchy_orgs
      UNION
      SELECT a.associated_org_id
      FROM public.anew_org_associations a
      JOIN hierarchy_orgs h ON h.organization_id = a.org_id
      UNION
      SELECT a.org_id
      FROM public.anew_org_associations a
      JOIN hierarchy_orgs h ON h.organization_id = a.associated_org_id
    )
    SELECT organization_id FROM expanded
  ) visible
  WHERE NOT public.is_system_admin(_auth_uid)
$$;

REVOKE ALL ON FUNCTION public.get_user_visible_org_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_visible_org_ids(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_context(_auth_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_uid uuid := auth.uid();
  v_business_user_id uuid;
  v_is_system_admin boolean := false;
  v_org_ids uuid[] := ARRAY[]::uuid[];
  v_memberships jsonb := '[]'::jsonb;
  v_permissions text[] := ARRAY[]::text[];
  v_role_codes text[] := ARRAY[]::text[];
BEGIN
  IF _auth_user_id IS NULL THEN
    RETURN jsonb_build_object('business_user_id', NULL, 'is_system_admin', false, 'org_ids', '[]'::jsonb, 'memberships', '[]'::jsonb, 'permissions', '[]'::jsonb);
  END IF;

  IF v_caller_uid IS NOT NULL AND _auth_user_id <> v_caller_uid THEN
    RAISE EXCEPTION 'permission denied: user context identity mismatch';
  END IF;

  SELECT id INTO v_business_user_id
  FROM public.anew_users
  WHERE auth_user_id = _auth_user_id
  LIMIT 1;

  IF v_business_user_id IS NULL THEN
    RETURN jsonb_build_object('business_user_id', NULL, 'is_system_admin', false, 'org_ids', '[]'::jsonb, 'memberships', '[]'::jsonb, 'permissions', '[]'::jsonb);
  END IF;

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('organization_id', m.organization_id, 'role_id', m.role_id, 'role_code', r.code)), '[]'::jsonb),
    COALESCE(array_agg(DISTINCT r.code), ARRAY[]::text[])
  INTO v_memberships, v_role_codes
  FROM public.anew_memberships m
  JOIN public.anew_roles r ON r.id = m.role_id
  WHERE m.user_id = v_business_user_id
    AND m.status = 'active';

  v_is_system_admin := 'system_admin' = ANY(v_role_codes);

  SELECT COALESCE(array_agg(DISTINCT visible.organization_id), ARRAY[]::uuid[])
  INTO v_org_ids
  FROM public.get_user_visible_org_ids(_auth_user_id) AS visible(organization_id);

  SELECT COALESCE(array_agg(DISTINCT rp.permission_code), ARRAY[]::text[])
  INTO v_permissions
  FROM public.anew_role_permissions rp
  WHERE rp.role_id IN (
    SELECT DISTINCT m.role_id
    FROM public.anew_memberships m
    WHERE m.user_id = v_business_user_id
      AND m.status = 'active'
  );

  RETURN jsonb_build_object(
    'business_user_id', v_business_user_id,
    'is_system_admin', v_is_system_admin,
    'org_ids', to_jsonb(v_org_ids),
    'memberships', v_memberships,
    'permissions', to_jsonb(v_permissions)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_context(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_system_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_organizations bigint := 0;
  v_users bigint := 0;
  v_memberships bigint := 0;
  v_deals bigint := 0;
  v_deals_value numeric := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_system_admin(v_uid) THEN
    RAISE EXCEPTION 'permission denied: system_admin required';
  END IF;

  SELECT count(*) INTO v_organizations FROM public.anew_organizations;
  SELECT count(*) INTO v_users FROM public.anew_users;
  SELECT count(*) INTO v_memberships FROM public.anew_memberships WHERE status = 'active';
  SELECT count(*), COALESCE(sum(value), 0)
  INTO v_deals, v_deals_value
  FROM public.deals
  WHERE deleted_at IS NULL;

  RETURN jsonb_build_object(
    'organizations', COALESCE(v_organizations, 0),
    'users', COALESCE(v_users, 0),
    'memberships', COALESCE(v_memberships, 0),
    'deals', COALESCE(v_deals, 0),
    'deals_value', COALESCE(v_deals_value, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_system_admin_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_admin_dashboard_stats() TO authenticated, service_role;

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'anew_entities', 'anew_addresses', 'anew_entity_addresses',
    'anew_entity_emails', 'anew_entity_phones', 'anew_entity_history',
    'anew_entity_relationships', 'anew_entity_roles', 'anew_leads',
    'anew_contacts', 'anew_clients', 'deals', 'quotes', 'quote_lines',
    'quote_fees', 'proposals', 'proposal_items', 'client_contracts',
    'client_contract_parties', 'contract_documents', 'entity_interactions',
    'lead_contact_history'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.%I', v_table);
      EXECUTE format(
        'CREATE POLICY system_admin_pii_default_deny ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_system_admin(auth.uid())) WITH CHECK (NOT public.is_system_admin(auth.uid()))',
        v_table
      );
    END IF;
  END LOOP;
END
$$;
