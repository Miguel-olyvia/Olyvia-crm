-- Fase 2 of the work_org contract (vault/ficheiros/organizacoes-entidades/
-- contrato-sdd-work-orgs-vs-estruturas-internas.md + plano-implementacao-work-orgs.md).
--
-- Implements 3 of the 4 contracted RPCs: get_user_work_orgs, resolve_effective_work_org,
-- set_organization_work_scope. validate_crm_work_org_scope (contract #4) is intentionally
-- NOT implemented here — the contract's own precondition #7 forbids activating blocking
-- CRM-write enforcement while writers still write organization_id from internal structures
-- (Fase 3, not done yet). Wiring these 3 RPCs into the frontend (CompanyContext.tsx etc.)
-- is also Fase 3 — this migration only creates the functions.
--
-- Hierarchy traversal (both RPCs that need it) treats 'PARENT_OF', 'parent_of' and
-- 'parent_child' as equivalent parent-of relations, per the live inventory finding that
-- all three coexist in anew_hierarchy.relationship_type with no canonical value. Anti-cycle
-- protection follows the same path-array + depth-cap pattern already used by
-- resolve_root_organization_id (20260618030000), capped at 20 hops.

-- ============================================================================
-- CONTRATO 1: get_user_work_orgs()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_work_orgs()
RETURNS TABLE (
  id uuid,
  name text,
  membership_type text,
  via_org_id uuid,
  via_org_name text,
  roles text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth_uid       uuid := auth.uid();
  v_anew_user_id   uuid;
  v_is_sysadmin    boolean;
BEGIN
  IF v_auth_uid IS NULL THEN
    -- No SQLSTATE reliably maps to HTTP 401 via PostgREST's default error-code
    -- table once a request has reached this function (the JWT already passed
    -- PostgREST's own auth layer to get here) — 'insufficient_privilege' (403)
    -- is the closest fit and matches the existing convention in
    -- supabase/functions/_shared/auth.ts (missing anew_users profile -> 403).
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT au.id INTO v_anew_user_id
  FROM public.anew_users au
  WHERE au.auth_user_id = v_auth_uid
    AND au.status = 'active';

  IF v_anew_user_id IS NULL THEN
    -- No SQLSTATE reliably maps to HTTP 401 via PostgREST's default error-code
    -- table once a request has reached this function (the JWT already passed
    -- PostgREST's own auth layer to get here) — 'insufficient_privilege' (403)
    -- is the closest fit and matches the existing convention in
    -- supabase/functions/_shared/auth.ts (missing anew_users profile -> 403).
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT public.is_system_admin(v_auth_uid) INTO v_is_sysadmin;

  IF v_is_sysadmin THEN
    RETURN QUERY
    SELECT
      o.id,
      o.name,
      'system_admin'::text AS membership_type,
      NULL::uuid AS via_org_id,
      NULL::text AS via_org_name,
      COALESCE(ARRAY(
        SELECT DISTINCT ar.code
        FROM public.anew_memberships am
        JOIN public.anew_roles ar ON ar.id = am.role_id
        WHERE am.user_id = v_anew_user_id
          AND am.status = 'active'
          AND am.organization_id = o.id
      ), ARRAY[]::text[]) AS roles
    FROM public.anew_organizations o
    WHERE o.is_work_org = true
      AND o.status = 'active'
    ORDER BY o.name;
    RETURN;
  END IF;

  RETURN QUERY
  WITH RECURSIVE membership_orgs AS (
    SELECT DISTINCT am.organization_id AS start_org_id
    FROM public.anew_memberships am
    WHERE am.user_id = v_anew_user_id
      AND am.status = 'active'
  ),
  ancestor_walk AS (
    SELECT mo.start_org_id, mo.start_org_id AS current_org_id, 0 AS depth, ARRAY[mo.start_org_id] AS path
    FROM membership_orgs mo
    UNION ALL
    SELECT aw.start_org_id, h.parent_org_id, aw.depth + 1, aw.path || h.parent_org_id
    FROM ancestor_walk aw
    JOIN public.anew_hierarchy h ON h.child_org_id = aw.current_org_id
    WHERE lower(h.relationship_type) IN ('parent_of', 'parent_child')
      AND aw.depth < 20
      AND NOT (h.parent_org_id = ANY(aw.path))
  ),
  resolved AS (
    SELECT DISTINCT ON (aw.start_org_id)
      aw.start_org_id, aw.current_org_id AS work_org_id, aw.depth
    FROM ancestor_walk aw
    JOIN public.anew_organizations wo ON wo.id = aw.current_org_id
    WHERE wo.is_work_org = true AND wo.status = 'active'
    ORDER BY aw.start_org_id, aw.depth ASC
  ),
  member_roles AS (
    SELECT am.organization_id AS start_org_id, ar.code AS role_code
    FROM public.anew_memberships am
    JOIN public.anew_roles ar ON ar.id = am.role_id
    WHERE am.user_id = v_anew_user_id
      AND am.status = 'active'
  ),
  via_pick AS (
    SELECT DISTINCT ON (r.work_org_id)
      r.work_org_id, r.start_org_id AS via_org_id
    FROM resolved r
    WHERE r.depth > 0
    ORDER BY r.work_org_id, r.depth ASC, r.start_org_id ASC
  )
  SELECT
    wo.id,
    wo.name,
    CASE WHEN bool_or(r.depth = 0) THEN 'direct' ELSE 'via_department' END AS membership_type,
    CASE WHEN bool_or(r.depth = 0) THEN NULL ELSE vp.via_org_id END AS via_org_id,
    CASE WHEN bool_or(r.depth = 0) THEN NULL ELSE vo.name END AS via_org_name,
    COALESCE(ARRAY(
      SELECT DISTINCT mr.role_code
      FROM resolved r2
      JOIN member_roles mr ON mr.start_org_id = r2.start_org_id
      WHERE r2.work_org_id = wo.id
    ), ARRAY[]::text[]) AS roles
  FROM resolved r
  JOIN public.anew_organizations wo ON wo.id = r.work_org_id
  LEFT JOIN via_pick vp ON vp.work_org_id = r.work_org_id
  LEFT JOIN public.anew_organizations vo ON vo.id = vp.via_org_id
  GROUP BY wo.id, wo.name, vp.via_org_id, vo.name
  ORDER BY wo.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_user_work_orgs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_work_orgs() TO authenticated, service_role;

-- ============================================================================
-- CONTRATO 2: resolve_effective_work_org(org_id)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_effective_work_org(org_id uuid)
RETURNS TABLE (
  work_org_id uuid,
  work_org_name text,
  resolved_from text,
  original_org_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth_uid      uuid := auth.uid();
  v_anew_user_id  uuid;
  v_is_sysadmin   boolean;
  v_org           public.anew_organizations;
  v_visible_orgs  uuid[];
  v_candidates    uuid[];
  v_ancestor_id   uuid;
  v_ancestor_name text;
BEGIN
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'org_id is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_auth_uid IS NULL THEN
    -- No SQLSTATE reliably maps to HTTP 401 via PostgREST's default error-code
    -- table once a request has reached this function (the JWT already passed
    -- PostgREST's own auth layer to get here) — 'insufficient_privilege' (403)
    -- is the closest fit and matches the existing convention in
    -- supabase/functions/_shared/auth.ts (missing anew_users profile -> 403).
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT au.id INTO v_anew_user_id
  FROM public.anew_users au
  WHERE au.auth_user_id = v_auth_uid
    AND au.status = 'active';

  IF v_anew_user_id IS NULL THEN
    -- No SQLSTATE reliably maps to HTTP 401 via PostgREST's default error-code
    -- table once a request has reached this function (the JWT already passed
    -- PostgREST's own auth layer to get here) — 'insufficient_privilege' (403)
    -- is the closest fit and matches the existing convention in
    -- supabase/functions/_shared/auth.ts (missing anew_users profile -> 403).
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_org FROM public.anew_organizations o WHERE o.id = org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT public.is_system_admin(v_auth_uid) INTO v_is_sysadmin;

  IF NOT v_is_sysadmin THEN
    SELECT COALESCE(array_agg(o), ARRAY[]::uuid[]) INTO v_visible_orgs
    FROM public.get_user_visible_org_ids(v_auth_uid) AS o;

    IF NOT (org_id = ANY(v_visible_orgs)) THEN
      RAISE EXCEPTION 'no membership in org' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_org.is_work_org THEN
    IF v_org.status <> 'active' THEN
      -- object_not_in_prerequisite_state (class 55), not invalid_parameter_value,
      -- so this is distinguishable from the 400-level "org_id is required" case.
      RAISE EXCEPTION 'work_org is not active' USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN QUERY SELECT v_org.id, v_org.name, 'direct'::text, org_id;
    RETURN;
  END IF;

  WITH RECURSIVE walk AS (
    SELECT org_id AS current_org_id, 0 AS depth, ARRAY[org_id] AS path
    UNION ALL
    SELECT h.parent_org_id, w.depth + 1, w.path || h.parent_org_id
    FROM walk w
    JOIN public.anew_hierarchy h ON h.child_org_id = w.current_org_id
    WHERE lower(h.relationship_type) IN ('parent_of', 'parent_child')
      AND w.depth < 20
      AND NOT (h.parent_org_id = ANY(w.path))
  ),
  nearest AS (
    SELECT w.current_org_id, w.depth
    FROM walk w
    JOIN public.anew_organizations o ON o.id = w.current_org_id
    WHERE w.depth > 0 AND o.is_work_org = true AND o.status = 'active'
  ),
  min_depth AS (
    SELECT MIN(depth) AS d FROM nearest
  )
  SELECT array_agg(DISTINCT n.current_org_id)
  INTO v_candidates
  FROM nearest n, min_depth md
  WHERE n.depth = md.d;

  IF v_candidates IS NULL OR array_length(v_candidates, 1) IS NULL THEN
    RAISE EXCEPTION 'no active work_org ancestor found' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF array_length(v_candidates, 1) > 1 THEN
    RAISE EXCEPTION 'ambiguous organization hierarchy' USING ERRCODE = 'unique_violation';
  END IF;

  v_ancestor_id := v_candidates[1];
  SELECT o.name INTO v_ancestor_name FROM public.anew_organizations o WHERE o.id = v_ancestor_id;

  RETURN QUERY SELECT v_ancestor_id, v_ancestor_name, 'ancestor'::text, org_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_effective_work_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_effective_work_org(uuid) TO authenticated, service_role;

-- ============================================================================
-- CONTRATO 3: set_organization_work_scope(organization_id, is_work_org)
-- ============================================================================
-- RETURNS jsonb (not TABLE) because Postgres does not allow an OUT/TABLE
-- column to share a name with an input parameter, and the public contract
-- requires the input parameter to be named organization_id/is_work_org
-- (PostgREST maps JSON body keys straight to parameter names). jsonb lets the
-- response shape match the contract ({success, organization_id, is_work_org})
-- without that collision.
CREATE OR REPLACE FUNCTION public.set_organization_work_scope(organization_id uuid, is_work_org boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth_uid     uuid := auth.uid();
  v_org          public.anew_organizations;
  v_crm_count    bigint;
  v_dependents   bigint;
BEGIN
  IF organization_id IS NULL OR is_work_org IS NULL THEN
    RAISE EXCEPTION 'invalid request' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_auth_uid IS NULL THEN
    -- No SQLSTATE reliably maps to HTTP 401 via PostgREST's default error-code
    -- table once a request has reached this function (the JWT already passed
    -- PostgREST's own auth layer to get here) — 'insufficient_privilege' (403)
    -- is the closest fit and matches the existing convention in
    -- supabase/functions/_shared/auth.ts (missing anew_users profile -> 403).
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_org FROM public.anew_organizations o WHERE o.id = organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- 'organizations.manage' is not a seeded permission code (confirmed dead by
  -- 20260905010000_fix_organizations_manage_permission_mismatch.sql, which hit
  -- the exact same bug for the org create/update/delete RPCs). Use the real
  -- seeded code, 'organizations.edit', consistent with that fix.
  IF NOT (
    public.has_anew_permission(v_auth_uid, 'organizations.edit')
    AND organization_id = ANY(ARRAY(SELECT o FROM public.get_user_visible_org_ids(v_auth_uid) AS o))
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotent: no-op success if nothing actually changes.
  IF v_org.is_work_org = is_work_org THEN
    RETURN jsonb_build_object('success', true, 'organization_id', organization_id, 'is_work_org', is_work_org);
  END IF;

  -- Demoting an active work_org that already has CRM records is blocked — those
  -- records would be left pointing at an organization_id contract 4 will reject.
  IF v_org.is_work_org = true AND is_work_org = false THEN
    SELECT
      (SELECT count(*) FROM public.anew_leads WHERE anew_leads.organization_id = v_org.id) +
      (SELECT count(*) FROM public.anew_contacts WHERE anew_contacts.organization_id = v_org.id) +
      (SELECT count(*) FROM public.anew_clients WHERE anew_clients.organization_id = v_org.id) +
      (SELECT count(*) FROM public.quotes WHERE quotes.organization_id = v_org.id) +
      (SELECT count(*) FROM public.deals WHERE deals.organization_id = v_org.id) +
      (SELECT count(*) FROM public.proposals WHERE proposals.organization_id = v_org.id) +
      (SELECT count(*) FROM public.client_contracts WHERE client_contracts.organization_id = v_org.id)
    INTO v_crm_count;

    IF v_crm_count > 0 THEN
      RAISE EXCEPTION 'organization has CRM records' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- Promoting an internal structure to work_org, or demoting one with no CRM
  -- records, can never orphan a descendant internal structure's members: any
  -- internal structure that currently resolves its work_org ancestor through
  -- this org must still have SOME active work_org ancestor after the change.
  -- Only relevant on demotion (promotion can only add a new valid ancestor).
  IF v_org.is_work_org = true AND is_work_org = false THEN
    SELECT count(*) INTO v_dependents
    FROM public.anew_hierarchy h
    JOIN public.anew_organizations child ON child.id = h.child_org_id
    WHERE h.parent_org_id = v_org.id
      AND lower(h.relationship_type) IN ('parent_of', 'parent_child')
      AND child.is_work_org = false
      AND NOT EXISTS (
        -- The walk must pass THROUGH v_org.id (it's a real, unchanged hierarchy
        -- edge) — only the final match excludes v_org.id itself, since it is
        -- about to lose is_work_org and must not count as the surviving
        -- ancestor. Excluding the edge to v_org entirely (as an earlier draft
        -- did) would wrongly treat "child's only parent is v_org" as having no
        -- alternate path, even when v_org itself has a valid active work_org
        -- ancestor above it that the child would still reach after demotion.
        WITH RECURSIVE walk AS (
          SELECT h2.parent_org_id AS current_org_id, 0 AS depth, ARRAY[child.id, h2.parent_org_id] AS path
          FROM public.anew_hierarchy h2
          WHERE h2.child_org_id = child.id
            AND lower(h2.relationship_type) IN ('parent_of', 'parent_child')
          UNION ALL
          SELECT h3.parent_org_id, w.depth + 1, w.path || h3.parent_org_id
          FROM walk w
          JOIN public.anew_hierarchy h3 ON h3.child_org_id = w.current_org_id
          WHERE lower(h3.relationship_type) IN ('parent_of', 'parent_child')
            AND w.depth < 20
            AND NOT (h3.parent_org_id = ANY(w.path))
        )
        SELECT 1 FROM walk w
        JOIN public.anew_organizations wo ON wo.id = w.current_org_id
        WHERE wo.is_work_org = true AND wo.status = 'active' AND wo.id <> v_org.id
      );

    IF v_dependents > 0 THEN
      RAISE EXCEPTION 'no active work_org ancestor' USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END IF;

  UPDATE public.anew_organizations o
  SET is_work_org = set_organization_work_scope.is_work_org
  WHERE o.id = organization_id;

  RETURN jsonb_build_object('success', true, 'organization_id', organization_id, 'is_work_org', is_work_org);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_organization_work_scope(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_organization_work_scope(uuid, boolean) TO authenticated, service_role;
