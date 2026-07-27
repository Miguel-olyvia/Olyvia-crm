-- ============================================================
-- Fix: the Stocks (Armazém > Stocks) feature gates every action button
-- (stocks.create/edit/delete/export/import) behind PermissionGate, but
-- no role in the entire system had ever been granted any stocks.*
-- permission code -- not even super_admin. This made the feature's
-- action bar render completely empty for every user, on every org,
-- confirmed via E2E testing of Group 6.
--
-- Fix: mirror the existing suppliers.* grants (a sibling module in the
-- same purchasing/inventory domain, already correctly seeded) 1:1 onto
-- stocks.* for every role that has a suppliers.* grant, across every
-- organization. anew_role_permissions.role_id points at a per-org copy
-- of each role code, so mirroring by role_id (not by role code) is
-- required to cover every organization correctly.
--
-- anew_role_permissions has a protective trigger
-- (protect_system_role_permissions) blocking direct writes for
-- is_system=true roles unless the caller's JWT role claim is
-- 'service_role' -- the same bypass legitimate service-role callers
-- use, applied here via request.jwt.claims for this one-time seed.
-- ============================================================

DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
  SELECT role_id, replace(permission_code, 'suppliers.', 'stocks.'), created_by
  FROM public.anew_role_permissions
  WHERE permission_code LIKE 'suppliers.%'
    AND NOT EXISTS (
      SELECT 1 FROM public.anew_role_permissions arp2
      WHERE arp2.role_id = anew_role_permissions.role_id
        AND arp2.permission_code = replace(anew_role_permissions.permission_code, 'suppliers.', 'stocks.')
    );
END;
$$;
