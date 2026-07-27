-- Permission gate for the new RGPD Art.17 (right to erasure) admin UI.
-- Granted to exactly the roles decide-data-erasure already authorizes
-- server-side: the global super_admin role and the global system_admin role
-- (both organization_id IS NULL, singleton rows) — NOT platform.security.audit
-- (granted to org_admin/system_admin but NOT super_admin) or
-- platform.auth_audit_log.view (granted to no one), which would have hidden
-- this page from the very users authorized to act on it.
INSERT INTO public.anew_permissions (code, name, description, category, is_dangerous, scope, supports_scope)
VALUES (
  'rgpd.erasure.manage',
  'Gerir pedidos de eliminação de dados',
  'Ver e decidir (aprovar/rejeitar) pedidos de eliminação de dados ao abrigo do RGPD Art. 17',
  'platform',
  true,
  'global',
  false
)
ON CONFLICT (code) DO NOTHING;

-- protect_system_role_permissions blocks direct writes for is_system=true
-- roles unless the caller's JWT role claim is 'service_role' — the same
-- bypass legitimate service-role callers use, applied here for this
-- one-time grant (see 20260919010000_seed_stocks_permissions.sql).
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
  SELECT r.id, 'rgpd.erasure.manage', r.created_by
  FROM public.anew_roles r
  WHERE r.code IN ('super_admin', 'system_admin')
    AND r.organization_id IS NULL
  ON CONFLICT DO NOTHING;
END $$;
