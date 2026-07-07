-- Follow-up to 20260927010000_strict_crm_org_isolation.sql: a post-apply
-- verification query found 6 policies that migration should have swapped to
-- get_user_crm_org_ids() but missed:
--   - anew_clients_insert (WITH CHECK only)
--   - anew_clients_update's WITH CHECK (its USING was correctly swapped;
--     only the WITH CHECK half of the same ALTER POLICY was left as-is)
--   - proposal_items_select/insert/update/delete (the base CRUD policies,
--     scoped via a join to proposals.organization_id — distinct from
--     proposal_items' system_admin_pii_default_deny RESTRICTIVE policy,
--     which Fase 5 already fixed correctly)

ALTER POLICY anew_clients_insert ON public.anew_clients
  WITH CHECK (
    has_anew_permission((SELECT auth.uid()), 'clients.create'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
  );

ALTER POLICY anew_clients_update ON public.anew_clients
  WITH CHECK (
    has_anew_permission((SELECT auth.uid()), 'clients.edit'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
  );

ALTER POLICY proposal_items_select ON public.proposal_items
  USING (
    proposal_id IN (
      SELECT proposals.id FROM proposals
      WHERE proposals.organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
         OR proposals.organization_id IS NULL
         OR proposals.created_by = (SELECT anew_users.id FROM anew_users WHERE anew_users.auth_user_id = auth.uid() LIMIT 1)
    )
  );

ALTER POLICY proposal_items_insert ON public.proposal_items
  WITH CHECK (
    proposal_id IN (
      SELECT proposals.id FROM proposals
      WHERE proposals.organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
         OR proposals.organization_id IS NULL
         OR proposals.created_by = (SELECT anew_users.id FROM anew_users WHERE anew_users.auth_user_id = auth.uid() LIMIT 1)
    )
  );

ALTER POLICY proposal_items_update ON public.proposal_items
  USING (
    proposal_id IN (
      SELECT proposals.id FROM proposals
      WHERE proposals.organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
         OR proposals.organization_id IS NULL
         OR proposals.created_by = (SELECT anew_users.id FROM anew_users WHERE anew_users.auth_user_id = auth.uid() LIMIT 1)
    )
  );

ALTER POLICY proposal_items_delete ON public.proposal_items
  USING (
    proposal_id IN (
      SELECT proposals.id FROM proposals
      WHERE proposals.organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
         OR proposals.organization_id IS NULL
         OR proposals.created_by = (SELECT anew_users.id FROM anew_users WHERE anew_users.auth_user_id = auth.uid() LIMIT 1)
    )
  );
