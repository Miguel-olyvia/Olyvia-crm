-- Fix anew_clients RLS policies to use get_user_visible_org_ids.
--
-- Problem: the baseline policies for anew_clients used a raw JOIN on
-- anew_memberships + anew_users + one level of anew_hierarchy. This only
-- covers a single parent hop and misses deeper hierarchies, lateral org
-- associations, and the correlated-subquery performance issue fixed elsewhere.
--
-- Fix: replace all four permissive policies with the same pattern used by
-- anew_leads (20260618030000) and other main tables:
--   - organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
--   - public.has_anew_permission((SELECT auth.uid()), 'clients.<op>')
--   - TO authenticated
--
-- The RESTRICTIVE policy system_admin_pii_default_deny (created in
-- 20260622114000 and patched in 20260623150000) remains untouched and
-- continues to block system_admin from all PII operations.
--
-- Forward-only. Do not fold into the baseline.

DROP POLICY IF EXISTS anew_clients_select ON public.anew_clients;
DROP POLICY IF EXISTS anew_clients_insert ON public.anew_clients;
DROP POLICY IF EXISTS anew_clients_update ON public.anew_clients;
DROP POLICY IF EXISTS anew_clients_delete ON public.anew_clients;

CREATE POLICY anew_clients_select
ON public.anew_clients
FOR SELECT
TO authenticated
USING (
  public.has_anew_permission((SELECT auth.uid()), 'clients.view')
  AND (
    organization_id      IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    OR root_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  )
);

CREATE POLICY anew_clients_insert
ON public.anew_clients
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_anew_permission((SELECT auth.uid()), 'clients.create')
  AND organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
);

CREATE POLICY anew_clients_update
ON public.anew_clients
FOR UPDATE
TO authenticated
USING (
  public.has_anew_permission((SELECT auth.uid()), 'clients.edit')
  AND (
    organization_id      IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    OR root_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  )
)
WITH CHECK (
  public.has_anew_permission((SELECT auth.uid()), 'clients.edit')
  AND organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
);

CREATE POLICY anew_clients_delete
ON public.anew_clients
FOR DELETE
TO authenticated
USING (
  public.has_anew_permission((SELECT auth.uid()), 'clients.delete')
  AND (
    organization_id      IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    OR root_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  )
);
