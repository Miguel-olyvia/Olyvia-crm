-- Migration: scope client_contract_parties SELECT by organization
--
-- Why: "client_parties_select" currently is:
--   is_system_admin(auth.uid()) OR has_permission(auth.uid(), 'client_contracts.view')
-- has_permission() is the legacy global permission check (user_roles/
-- role_permissions/permissions) with NO organization/contract parameter at
-- all — any authenticated user holding that legacy permission code in ANY
-- organization can read client_contract_parties rows (signing name/email,
-- signature status) for contracts belonging to OTHER organizations, since
-- nothing in this policy filters by the row's own contract/org.
--
-- This keeps the existing permission-based access model exactly as-is (per
-- explicit requirement: role/permission access must still gate visibility,
-- this is not a switch to pure org-scoping) and additionally requires the
-- party's contract to belong to an organization the caller can see, using
-- the same get_user_visible_org_ids() used by client_contracts' own
-- "client_contracts_select" policy for consistency.

DROP POLICY IF EXISTS "client_parties_select" ON "public"."client_contract_parties";

CREATE POLICY "client_parties_select" ON "public"."client_contract_parties"
FOR SELECT
USING (
  public.is_system_admin(auth.uid())
  OR (
    public.has_permission(auth.uid(), 'client_contracts.view'::text)
    AND EXISTS (
      SELECT 1
      FROM public.client_contracts cc
      WHERE cc.id = client_contract_parties.contract_id
        AND cc.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    )
  )
);
