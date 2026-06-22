-- Slide 8 follow-up: a system_admin who also holds an active membership in an
-- organization must see that organization, like any other member. Only a
-- system_admin WITHOUT a membership should see zero organizations.
-- Forward-only migration. Do not fold into the baseline.

CREATE OR REPLACE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE direct_orgs AS (
    SELECT m.organization_id
    FROM public.anew_memberships m
    JOIN public.anew_users u ON u.id = m.user_id
    WHERE u.auth_user_id = _auth_uid
      AND m.status = 'active'
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
$$;

REVOKE ALL ON FUNCTION public.get_user_visible_org_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_visible_org_ids(uuid) TO authenticated, service_role;
