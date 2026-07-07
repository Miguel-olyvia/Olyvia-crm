-- Fase 5 (follow-up to Fase 4) of the work_org contract
-- (vault/ficheiros/organizacoes-entidades/contrato-sdd-work-orgs-vs-estruturas-internas.md
-- + plano-implementacao-work-orgs.md).
--
-- Fase 4 removed root_organization_id from RLS/authorization, but a live review
-- found that get_user_visible_org_ids() — used everywhere, not just on the 7
-- CRM tables — ALSO widens visibility to a user's full ancestor+descendant+
-- association graph, independent of root_organization_id. That is the actual
-- reason a parent-org member still saw a mix of subsidiaries' records.
--
-- get_user_visible_org_ids() itself is NOT touched by this migration — it is
-- used in ~90 other files across product/category/user/role/organization
-- management, where hierarchy-wide visibility is legitimate admin behavior.
-- Instead, a new, narrower function is introduced and applied ONLY to the 7
-- CRM tables in the work_org contract:
--
--   anew_leads, anew_contacts, anew_clients, quotes, deals, proposals,
--   client_contracts
--
-- get_user_crm_org_ids() returns ONLY the caller's direct active-membership
-- org ids — no ancestor/descendant/association widening. The root_organization_id
-- column itself is still not dropped (out of scope, explicitly deferred).
--
-- Also fixes two PII-lockdown policies (quotes, deals, proposals,
-- client_contracts' system_admin_pii_default_deny) that still referenced
-- root_organization_id — missed by Fase 4's inventory because that pass only
-- checked the tables' base CRUD policies, not this RESTRICTIVE layer.
--
-- Also restricts resolve_lead_access_context()/resolve_contact_access_context()
-- (anew_contacts' RLS goes through the latter via can_access_contact_row(), and
-- several lead RPCs use the former) so that super_admin's automatic ORG-scope
-- admin bypass only covers their own org and its internal descendant
-- structures (departments/branches) — not ancestors or anew_org_associations
-- siblings. The org_chain permission-inheritance walk inside these functions
-- (ancestor-only, for a SPECIFIC requested org — a department inheriting a
-- permission from its parent company) is a different, legitimate mechanism
-- and is left untouched.

-- ============================================================================
-- New function: strict CRM tenancy — direct active membership only.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_crm_org_ids(_auth_uid uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.organization_id
  FROM public.anew_memberships m
  JOIN public.anew_users u ON u.id = m.user_id
  WHERE u.auth_user_id = _auth_uid
    AND m.status = 'active'
$function$;

REVOKE ALL ON FUNCTION public.get_user_crm_org_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_crm_org_ids(uuid) TO authenticated, service_role;

-- ============================================================================
-- anew_leads — re-point from get_user_visible_org_ids to get_user_crm_org_ids
-- (Fase 4 already removed root_organization_id from these; this migration
-- only swaps the hierarchy-widening function for the strict one).
-- ============================================================================
ALTER POLICY anew_leads_select ON public.anew_leads
  USING (
    has_anew_permission(auth.uid(), 'leads.view'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
  );

ALTER POLICY anew_leads_insert ON public.anew_leads
  WITH CHECK (
    has_anew_permission(auth.uid(), 'leads.create'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
    AND (
      created_by IS NULL
      OR created_by = COALESCE(
        (SELECT au.id FROM anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1),
        current_business_user_id()
      )
    )
  );

ALTER POLICY anew_leads_update ON public.anew_leads
  USING (
    has_anew_permission(auth.uid(), 'leads.edit'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
  )
  WITH CHECK (
    has_anew_permission(auth.uid(), 'leads.edit'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
  );

ALTER POLICY anew_leads_delete ON public.anew_leads
  USING (
    has_anew_permission(auth.uid(), 'leads.delete'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
  );

ALTER POLICY system_admin_pii_default_deny ON public.anew_leads
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
    OR (is_system_admin((SELECT auth.uid())) AND has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
  );

-- ============================================================================
-- anew_clients — same swap
-- ============================================================================
ALTER POLICY anew_clients_select ON public.anew_clients
  USING (
    has_anew_permission((SELECT auth.uid()), 'clients.view'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
  );

ALTER POLICY anew_clients_update ON public.anew_clients
  USING (
    has_anew_permission((SELECT auth.uid()), 'clients.edit'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
  );

ALTER POLICY anew_clients_delete ON public.anew_clients
  USING (
    has_anew_permission((SELECT auth.uid()), 'clients.delete'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
  );

ALTER POLICY system_admin_pii_default_deny ON public.anew_clients
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
    OR (is_system_admin((SELECT auth.uid())) AND has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
  );

-- ============================================================================
-- form_submissions — same swap
-- ============================================================================
ALTER POLICY form_submissions_select ON public.form_submissions
  USING (
    is_system_admin(auth.uid())
    OR organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
  );

-- ============================================================================
-- proposal_items / client_contract_parties (PII lockdown layer) — same swap
-- ============================================================================
ALTER POLICY system_admin_pii_default_deny ON public.proposal_items
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_items.proposal_id
        AND p.organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
    ))
    OR (is_system_admin((SELECT auth.uid())) AND EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_items.proposal_id
        AND has_active_support_access(p.organization_id)
    ))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_items.proposal_id
        AND p.organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
    ))
  );

ALTER POLICY system_admin_pii_default_deny ON public.client_contract_parties
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (EXISTS (
      SELECT 1 FROM client_contracts cc
      WHERE cc.id = client_contract_parties.contract_id
        AND cc.organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
    ))
    OR (is_system_admin((SELECT auth.uid())) AND EXISTS (
      SELECT 1 FROM client_contracts cc
      WHERE cc.id = client_contract_parties.contract_id
        AND has_active_support_access(cc.organization_id)
    ))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (EXISTS (
      SELECT 1 FROM client_contracts cc
      WHERE cc.id = client_contract_parties.contract_id
        AND cc.organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
    ))
  );

-- ============================================================================
-- quotes — swap function on all CRUD policies + remove root_organization_id
-- (missed by Fase 4) from the PII lockdown layer.
-- ============================================================================
ALTER POLICY quotes_select_policy ON public.quotes
  USING (organization_id IN (SELECT get_user_crm_org_ids(auth.uid())));

ALTER POLICY quotes_insert_policy ON public.quotes
  WITH CHECK (
    created_by = current_business_user_id()
    AND organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
  );

ALTER POLICY quotes_update_policy ON public.quotes
  USING (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
  WITH CHECK (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))));

ALTER POLICY quotes_delete_policy ON public.quotes
  USING (organization_id IN (SELECT get_user_crm_org_ids(auth.uid())));

ALTER POLICY system_admin_pii_default_deny ON public.quotes
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
    OR (is_system_admin((SELECT auth.uid())) AND has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
  );

-- ============================================================================
-- deals — same treatment
-- ============================================================================
ALTER POLICY "Users can view deals in their org" ON public.deals
  USING (organization_id IN (SELECT get_user_crm_org_ids(auth.uid())));

ALTER POLICY "Users can create deals in their org" ON public.deals
  WITH CHECK (organization_id IN (SELECT get_user_crm_org_ids(auth.uid())));

ALTER POLICY "Users can update deals in their org" ON public.deals
  USING (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
  WITH CHECK (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))));

ALTER POLICY "Users can delete deals in their org" ON public.deals
  USING (organization_id IN (SELECT get_user_crm_org_ids(auth.uid())));

ALTER POLICY system_admin_pii_default_deny ON public.deals
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
    OR (is_system_admin((SELECT auth.uid())) AND has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
  );

-- ============================================================================
-- proposals — same treatment. The SELECT policy's personal-ownership fallback
-- branches (created_by / deal.created_by / deal.assigned_to = the caller) are
-- untouched — that's "I created/own this specific record" access, not
-- cross-org hierarchy widening, so it's outside this migration's concern.
-- ============================================================================
ALTER POLICY "Users can view proposals in their scope" ON public.proposals
  USING (
    has_anew_permission(auth.uid(), 'proposals.view'::text)
    AND (
      (organization_id IN (SELECT get_user_crm_org_ids(auth.uid())))
      OR (
        organization_id IS NULL
        AND EXISTS (
          SELECT 1 FROM deals d
          WHERE d.id = proposals.deal_id
            AND d.organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
        )
      )
      OR EXISTS (
        SELECT 1 FROM deals d
        WHERE d.id = proposals.deal_id
          AND (d.created_by = current_business_user_id() OR d.assigned_to = current_business_user_id())
      )
      OR created_by = current_business_user_id()
    )
  );

ALTER POLICY "Users with permission can create proposals" ON public.proposals
  WITH CHECK (
    created_by = current_business_user_id()
    AND has_anew_permission(auth.uid(), 'proposals.create'::text)
    AND (organization_id IS NULL OR organization_id IN (SELECT get_user_crm_org_ids(auth.uid())))
  );

ALTER POLICY "Users with permission can update proposals" ON public.proposals
  USING (
    created_by = current_business_user_id()
    OR (
      has_anew_permission((SELECT auth.uid()), 'proposals.edit'::text)
      AND organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
    )
  )
  WITH CHECK (
    has_anew_permission((SELECT auth.uid()), 'proposals.edit'::text)
    AND (organization_id IS NULL OR organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
  );

ALTER POLICY "Users with permission can delete proposals" ON public.proposals
  USING (
    has_anew_permission(auth.uid(), 'proposals.delete'::text)
    AND organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
  );

ALTER POLICY system_admin_pii_default_deny ON public.proposals
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
    OR (is_system_admin((SELECT auth.uid())) AND has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
  );

-- ============================================================================
-- client_contracts — same treatment
-- ============================================================================
ALTER POLICY client_contracts_select ON public.client_contracts
  USING (
    organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
    AND has_anew_permission(auth.uid(), 'client_contracts.view'::text)
  );

ALTER POLICY client_contracts_insert ON public.client_contracts
  WITH CHECK (
    created_by = current_business_user_id()
    AND organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
    AND has_anew_permission((SELECT auth.uid()), 'client_contracts.create'::text)
  );

ALTER POLICY client_contracts_update ON public.client_contracts
  USING (
    organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
    AND has_anew_permission(auth.uid(), 'client_contracts.edit'::text)
  );

ALTER POLICY client_contracts_delete ON public.client_contracts
  USING (
    organization_id IN (SELECT get_user_crm_org_ids(auth.uid()))
    AND has_anew_permission(auth.uid(), 'client_contracts.delete'::text)
  );

ALTER POLICY system_admin_pii_default_deny ON public.client_contracts
  USING (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
    OR (is_system_admin((SELECT auth.uid())) AND has_active_support_access(organization_id))
  )
  WITH CHECK (
    (NOT is_system_admin((SELECT auth.uid())))
    OR (organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
  );

-- ============================================================================
-- resolve_lead_access_context / resolve_contact_access_context — restrict
-- the base visibility gate to get_user_crm_org_ids, and restrict super_admin's
-- automatic ORG-scope bypass to their own org + internal descendant
-- structures only (drop ancestors + anew_org_associations siblings). The
-- org_chain ancestor walk further down (permission-scope-level resolution for
-- the ONE org actually requested) is untouched — that's inheritance within a
-- single org's own hierarchy, not multi-org visibility widening.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_lead_access_context(p_org_id uuid, p_requested_scope text DEFAULT 'ORG'::text, p_permission_code text DEFAULT 'leads.view'::text)
 RETURNS TABLE(auth_user_id uuid, anew_user_id uuid, visible_org_ids uuid[], requested_scope text, permitted_scope text, applied_scope text, team_user_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_anew_user_id uuid;
  v_visible_org_ids uuid[];
  v_requested_scope text;
  v_permitted_scope text := 'OWNED';
  v_applied_scope text := 'OWNED';
  v_team_user_ids uuid[] := ARRAY[]::uuid[];
  v_is_admin boolean := false;
  v_has_permission boolean := false;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  SELECT au.id
  INTO v_anew_user_id
  FROM public.anew_users au
  WHERE au.auth_user_id = v_auth_uid
  LIMIT 1;

  IF v_anew_user_id IS NULL THEN
    RAISE EXCEPTION 'business user not found for auth user';
  END IF;

  SELECT ARRAY(
    SELECT public.get_user_crm_org_ids(v_auth_uid)
  )
  INTO v_visible_org_ids;

  IF NOT (p_org_id = ANY(COALESCE(v_visible_org_ids, ARRAY[]::uuid[]))) THEN
    RAISE EXCEPTION 'permission denied: organization not visible';
  END IF;

  v_requested_scope := UPPER(COALESCE(NULLIF(BTRIM(p_requested_scope), ''), 'ORG'));
  IF v_requested_scope = 'ALL' THEN
    v_requested_scope := 'ORG';
  END IF;
  IF v_requested_scope NOT IN ('ORG', 'TEAM', 'OWNED') THEN
    v_requested_scope := 'ORG';
  END IF;

  WITH RECURSIVE
  admin_memberships AS (
    SELECT m.id, m.organization_id, r.code AS role_code
    FROM public.anew_memberships m
    JOIN public.anew_roles r ON r.id = m.role_id
    WHERE m.user_id = v_anew_user_id
      AND m.status = 'active'
      AND r.code IN ('system_admin', 'super_admin')
  ),
  super_roots AS (
    SELECT organization_id
    FROM admin_memberships
    WHERE role_code = 'super_admin'
  ),
  super_descendants AS (
    SELECT organization_id FROM super_roots
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN super_descendants d ON d.organization_id = h.parent_org_id
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM admin_memberships
      WHERE role_code = 'system_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM super_descendants
      WHERE organization_id = p_org_id
    )
  INTO v_is_admin;

  WITH RECURSIVE org_chain AS (
    SELECT p_org_id AS org_id
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN org_chain oc ON oc.org_id = h.child_org_id
    WHERE h.parent_org_id IS NOT NULL
  ),
  scoped_memberships AS (
    SELECT m.id, m.role_id
    FROM public.anew_memberships m
    WHERE m.user_id = v_anew_user_id
      AND m.status = 'active'
      AND m.organization_id IN (SELECT org_id FROM org_chain)
  )
  SELECT EXISTS (
    SELECT 1
    FROM scoped_memberships sm
    JOIN public.anew_role_permissions arp
      ON arp.role_id = sm.role_id
     AND arp.permission_code = p_permission_code
  )
  INTO v_has_permission;

  IF NOT v_is_admin AND NOT v_has_permission THEN
    RAISE EXCEPTION 'permission denied: % required', p_permission_code;
  END IF;

  IF v_is_admin THEN
    v_permitted_scope := 'ORG';
  ELSE
    WITH RECURSIVE org_chain AS (
      SELECT p_org_id AS org_id
      UNION
      SELECT h.parent_org_id
      FROM public.anew_hierarchy h
      JOIN org_chain oc ON oc.org_id = h.child_org_id
      WHERE h.parent_org_id IS NOT NULL
    ),
    scoped_memberships AS (
      SELECT m.id
      FROM public.anew_memberships m
      WHERE m.user_id = v_anew_user_id
        AND m.status = 'active'
        AND m.organization_id IN (SELECT org_id FROM org_chain)
    )
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN scoped_memberships sm ON sm.id = s.membership_id
        WHERE s.permission_code = p_permission_code
          AND s.scope_level = 'ORG'
      ) THEN 'ORG'
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN scoped_memberships sm ON sm.id = s.membership_id
        WHERE s.permission_code = p_permission_code
          AND s.scope_level = 'TEAM'
      ) THEN 'TEAM'
      ELSE 'OWNED'
    END
    INTO v_permitted_scope;
  END IF;

  IF v_requested_scope = 'ORG' THEN
    v_applied_scope := v_permitted_scope;
  ELSIF v_requested_scope = 'TEAM' THEN
    v_applied_scope := CASE
      WHEN v_permitted_scope IN ('ORG', 'TEAM') THEN 'TEAM'
      ELSE 'OWNED'
    END;
  ELSE
    v_applied_scope := 'OWNED';
  END IF;

  SELECT COALESCE(ARRAY_AGG(DISTINCT tm.user_id), ARRAY[]::uuid[])
  INTO v_team_user_ids
  FROM public.organization_teams t
  JOIN public.organization_team_members tm ON tm.team_id = t.id
  WHERE t.organization_id = p_org_id
    AND t.leader_id = v_anew_user_id;

  RETURN QUERY
  SELECT
    v_auth_uid,
    v_anew_user_id,
    COALESCE(v_visible_org_ids, ARRAY[]::uuid[]),
    v_requested_scope,
    v_permitted_scope,
    v_applied_scope,
    COALESCE(v_team_user_ids, ARRAY[]::uuid[]);
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_contact_access_context(p_org_id uuid, p_requested_scope text DEFAULT 'ORG'::text, p_permission_code text DEFAULT 'contacts.view'::text)
 RETURNS TABLE(auth_user_id uuid, anew_user_id uuid, visible_org_ids uuid[], requested_scope text, permitted_scope text, applied_scope text, team_user_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_anew_user_id uuid;
  v_visible_org_ids uuid[];
  v_requested_scope text;
  v_permitted_scope text := 'OWNED';
  v_applied_scope text := 'OWNED';
  v_team_user_ids uuid[] := ARRAY[]::uuid[];
  v_is_admin boolean := false;
  v_has_permission boolean := false;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  SELECT au.id
  INTO v_anew_user_id
  FROM public.anew_users au
  WHERE au.auth_user_id = v_auth_uid
  LIMIT 1;

  IF v_anew_user_id IS NULL THEN
    RAISE EXCEPTION 'business user not found for auth user';
  END IF;

  SELECT ARRAY(
    SELECT public.get_user_crm_org_ids(v_auth_uid)
  )
  INTO v_visible_org_ids;

  IF NOT (p_org_id = ANY(COALESCE(v_visible_org_ids, ARRAY[]::uuid[]))) THEN
    RAISE EXCEPTION 'permission denied: organization not visible';
  END IF;

  v_requested_scope := UPPER(COALESCE(NULLIF(BTRIM(p_requested_scope), ''), 'ORG'));
  IF v_requested_scope = 'ALL' THEN
    v_requested_scope := 'ORG';
  END IF;
  IF v_requested_scope NOT IN ('ORG', 'TEAM', 'OWNED') THEN
    v_requested_scope := 'ORG';
  END IF;

  WITH RECURSIVE
  admin_memberships AS (
    SELECT m.id, m.organization_id, r.code AS role_code
    FROM public.anew_memberships m
    JOIN public.anew_roles r
      ON r.id = m.role_id
    WHERE m.user_id = v_anew_user_id
      AND m.status = 'active'
      AND r.code IN ('system_admin', 'super_admin')
  ),
  super_roots AS (
    SELECT organization_id
    FROM admin_memberships
    WHERE role_code = 'super_admin'
  ),
  super_descendants AS (
    SELECT organization_id FROM super_roots
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN super_descendants d
      ON d.organization_id = h.parent_org_id
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM admin_memberships
      WHERE role_code = 'system_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM super_descendants
      WHERE organization_id = p_org_id
    )
  INTO v_is_admin;

  WITH RECURSIVE org_chain AS (
    SELECT p_org_id AS org_id
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN org_chain oc
      ON oc.org_id = h.child_org_id
    WHERE h.parent_org_id IS NOT NULL
  ),
  scoped_memberships AS (
    SELECT m.id, m.role_id
    FROM public.anew_memberships m
    WHERE m.user_id = v_anew_user_id
      AND m.status = 'active'
      AND m.organization_id IN (SELECT org_id FROM org_chain)
  )
  SELECT EXISTS (
    SELECT 1
    FROM scoped_memberships sm
    JOIN public.anew_role_permissions arp
      ON arp.role_id = sm.role_id
     AND arp.permission_code = p_permission_code
  )
  INTO v_has_permission;

  IF NOT v_is_admin AND NOT v_has_permission THEN
    RAISE EXCEPTION 'permission denied: % required', p_permission_code;
  END IF;

  IF v_is_admin THEN
    v_permitted_scope := 'ORG';
  ELSE
    WITH RECURSIVE org_chain AS (
      SELECT p_org_id AS org_id
      UNION
      SELECT h.parent_org_id
      FROM public.anew_hierarchy h
      JOIN org_chain oc
        ON oc.org_id = h.child_org_id
      WHERE h.parent_org_id IS NOT NULL
    ),
    scoped_memberships AS (
      SELECT m.id
      FROM public.anew_memberships m
      WHERE m.user_id = v_anew_user_id
        AND m.status = 'active'
        AND m.organization_id IN (SELECT org_id FROM org_chain)
    )
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN scoped_memberships sm
          ON sm.id = s.membership_id
        WHERE s.permission_code = p_permission_code
          AND s.scope_level = 'ORG'
      ) THEN 'ORG'
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN scoped_memberships sm
          ON sm.id = s.membership_id
        WHERE s.permission_code = p_permission_code
          AND s.scope_level = 'TEAM'
      ) THEN 'TEAM'
      ELSE 'OWNED'
    END
    INTO v_permitted_scope;
  END IF;

  IF v_requested_scope = 'ORG' THEN
    v_applied_scope := v_permitted_scope;
  ELSIF v_requested_scope = 'TEAM' THEN
    v_applied_scope := CASE
      WHEN v_permitted_scope IN ('ORG', 'TEAM') THEN 'TEAM'
      ELSE 'OWNED'
    END;
  ELSE
    v_applied_scope := 'OWNED';
  END IF;

  SELECT COALESCE(ARRAY_AGG(DISTINCT tm.user_id), ARRAY[]::uuid[])
  INTO v_team_user_ids
  FROM public.organization_teams t
  JOIN public.organization_team_members tm
    ON tm.team_id = t.id
  WHERE t.organization_id = p_org_id
    AND t.leader_id = v_anew_user_id;

  RETURN QUERY
  SELECT
    v_auth_uid,
    v_anew_user_id,
    COALESCE(v_visible_org_ids, ARRAY[]::uuid[]),
    v_requested_scope,
    v_permitted_scope,
    v_applied_scope,
    COALESCE(v_team_user_ids, ARRAY[]::uuid[]);
END;
$function$;
