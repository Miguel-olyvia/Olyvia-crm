-- resolve_root_organization_id was revoked from authenticated in
-- 20260618030000_leads_security_scope_integrity.sql, but the function is
-- called inside RLS WITH CHECK policies on anew_leads which execute as the
-- authenticated role. Without EXECUTE, any INSERT/UPDATE on anew_leads
-- (including registering a contact result) fails with permission denied.

GRANT EXECUTE ON FUNCTION public.resolve_root_organization_id(uuid) TO authenticated;
