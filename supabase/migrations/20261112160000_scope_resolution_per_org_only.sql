-- ============================================================================
-- Fix: cross-organization scope leak in lead, contact and schedule access.
--
-- resolve_lead_access_context, resolve_contact_access_context and
-- get_schedule_item_scope_context resolved the caller's permission SCOPE by
-- walking the organization ancestor chain (p_org_id plus every parent via
-- anew_hierarchy) and accepting a scope row from ANY membership in that chain.
--
-- A user holding ORG scope on their membership in a parent organization
-- therefore inherited ORG-level visibility inside every child organization,
-- even when their membership there granted only OWNED — or when they had no
-- membership in the child organization at all.
--
-- This is the same defect already fixed for proposals by
-- 20261006010000_fix_proposal_scope_org_leak_and_ownership_spoofing.sql, which
-- described it as cross-organization privilege escalation and changed
-- get_proposal_edit_scope to consider only memberships in THAT organization.
-- That correction was never propagated to the three functions below.
--
-- Change (forward-only; does not edit any earlier migration):
--   The scope-resolution block of each function now reads
--   anew_membership_permission_scopes only through memberships whose
--   organization_id = p_org_id. No ancestor walk.
--
-- Deliberately NOT changed here, to keep this migration to a single concern:
--   - the permission check (v_has_permission) still resolves role permissions
--     across the ancestor chain;
--   - the system_admin / super_admin short-circuit is untouched;
--   - the TEAM member lookup is untouched.
-- ============================================================================

-- ── 1. Leads ────────────────────────────────────────────────────────────────
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
    -- Scope comes ONLY from memberships in this organization.
    WITH own_memberships AS (
      SELECT m.id
      FROM public.anew_memberships m
      WHERE m.user_id = v_anew_user_id
        AND m.status = 'active'
        AND m.organization_id = p_org_id
    )
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om ON om.id = s.membership_id
        WHERE s.permission_code = p_permission_code
          AND s.scope_level = 'ORG'
      ) THEN 'ORG'
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om ON om.id = s.membership_id
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

-- ── 2. Contacts ─────────────────────────────────────────────────────────────
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
    -- Scope comes ONLY from memberships in this organization.
    WITH own_memberships AS (
      SELECT m.id
      FROM public.anew_memberships m
      WHERE m.user_id = v_anew_user_id
        AND m.status = 'active'
        AND m.organization_id = p_org_id
    )
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om
          ON om.id = s.membership_id
        WHERE s.permission_code = p_permission_code
          AND s.scope_level = 'ORG'
      ) THEN 'ORG'
      WHEN EXISTS (
        SELECT 1
        FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om
          ON om.id = s.membership_id
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

-- ── 3. Scheduling ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_schedule_item_scope_context(p_org_id uuid, p_permission_code text)
 RETURNS TABLE(applied_scope text, owner_ids uuid[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH RECURSIVE me AS (
    SELECT au.id AS anew_user_id
    FROM public.anew_users au
    WHERE au.auth_user_id = auth.uid()
    LIMIT 1
  ),
  org_chain AS (
    SELECT p_org_id AS org_id
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN org_chain oc ON oc.org_id = h.child_org_id
    WHERE h.parent_org_id IS NOT NULL
  ),
  scoped_memberships AS (
    SELECT m.id, m.role_id
    FROM public.anew_memberships m, me
    WHERE m.user_id = me.anew_user_id
      AND m.status = 'active'
      AND m.organization_id IN (SELECT org_id FROM org_chain)
  ),
  own_memberships AS (
    SELECT m.id
    FROM public.anew_memberships m, me
    WHERE m.user_id = me.anew_user_id
      AND m.status = 'active'
      AND m.organization_id = p_org_id
  ),
  resolved AS (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM scoped_memberships sm
        JOIN public.anew_roles r ON r.id = sm.role_id
        WHERE r.code IN ('system_admin', 'super_admin')
      ) THEN 'ORG'
      WHEN EXISTS (
        SELECT 1 FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om ON om.id = s.membership_id
        WHERE s.permission_code = p_permission_code AND s.scope_level = 'ORG'
      ) THEN 'ORG'
      WHEN EXISTS (
        SELECT 1 FROM public.anew_membership_permission_scopes s
        JOIN own_memberships om ON om.id = s.membership_id
        WHERE s.permission_code = p_permission_code AND s.scope_level = 'TEAM'
      ) THEN 'TEAM'
      ELSE 'OWNED'
    END AS scope
  )
  SELECT
    r.scope,
    (
      COALESCE(
        (SELECT ARRAY_AGG(DISTINCT tm.user_id)
         FROM public.organization_teams t
         JOIN public.organization_team_members tm ON tm.team_id = t.id, me
         WHERE t.organization_id IN (SELECT org_id FROM org_chain)
           AND t.leader_id = me.anew_user_id
           AND r.scope = 'TEAM'),
        ARRAY[]::uuid[]
      ) || (SELECT anew_user_id FROM me)
    )
  FROM resolved r, me;
$function$;
