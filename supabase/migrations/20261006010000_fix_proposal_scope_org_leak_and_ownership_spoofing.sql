-- ============================================================================
-- Fix: 20261005010000_scope_aware_proposal_edit_authorization.sql introduced
-- can_write_proposal_row()/get_proposal_edit_scope() to close the privilege
-- escalation from 20261004010000, but two independent reviewers (react-
-- reviewer, typescript-reviewer) confirmed it shipped with two new CRITICAL
-- holes, already live in production:
--
-- 1. get_proposal_edit_scope(_auth_uid) resolves the caller's proposals.edit
--    scope GLOBALLY across every organization they belong to, not for the
--    specific organization of the proposal being edited. A user with ORG
--    scope for proposals.edit in Organization A inherits ORG-level write
--    access to proposals in Organization B too, as long as B is in their
--    visible-orgs list — even if their real grant in B is OWNED or nothing.
--    Cross-organization privilege escalation.
--
-- 2. The live RLS policy's WITH CHECK calls
--    public.can_write_proposal_row(created_by, organization_id) with bare
--    column references, which — for WITH CHECK on an UPDATE — resolve to the
--    NEW row, i.e. the values the client's own UPDATE statement is writing.
--    src/pages/Proposals.tsx issues direct `supabase.from("proposals")
--    .update(...)` calls (not only through rpc_update_proposal), and there is
--    no trigger protecting created_by from being included in that payload.
--    A caller with only OWNED-level proposals.edit can therefore spoof
--    created_by to their own id in the UPDATE payload and pass WITH CHECK for
--    a proposal they do not actually own.
--
-- Fix (forward-only; does not edit 20260626110000, 20260815010000,
-- 20260927010000, 20261004010000 or 20261005010000):
--
-- 1. Make created_by immutable on public.proposals via a BEFORE UPDATE
--    trigger that forces NEW.created_by := OLD.created_by unconditionally.
--    This runs before RLS WITH CHECK evaluates the NEW row, so WITH CHECK
--    always sees the row's true, persisted owner — closing the spoofing
--    vector regardless of how any policy/predicate is phrased, present or
--    future.
--
-- 2. get_proposal_edit_scope now takes the proposal's organization_id and
--    only considers the caller's anew_memberships in THAT organization when
--    resolving ORG/TEAM/OWNED, instead of scanning every organization the
--    caller belongs to. can_write_proposal_row is updated to pass p_org_id
--    through. This mirrors resolve_contact_access_context's per-row,
--    per-organization scope resolution instead of a session-global scope.
-- ============================================================================

-- ── 1. created_by becomes immutable on UPDATE ───────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_lock_proposal_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_proposal_ownership ON public.proposals;
CREATE TRIGGER trg_lock_proposal_ownership
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_lock_proposal_ownership();

-- ── 2. get_proposal_edit_scope becomes organization-aware ───────────────────

CREATE OR REPLACE FUNCTION public.get_proposal_edit_scope(_auth_uid uuid, _org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _org_id IS NULL THEN NULL
    -- No active membership IN THIS ORGANIZATION grants proposals.edit -> NULL.
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.anew_users au
      JOIN public.anew_memberships am
        ON am.user_id = au.id
       AND am.status = 'active'
       AND am.organization_id = _org_id
      JOIN public.anew_role_permissions arp
        ON arp.role_id = am.role_id
       AND arp.permission_code = 'proposals.edit'
      WHERE au.auth_user_id = _auth_uid
    ) THEN NULL
    WHEN EXISTS (
      SELECT 1
      FROM public.anew_users au
      JOIN public.anew_memberships am
        ON am.user_id = au.id
       AND am.status = 'active'
       AND am.organization_id = _org_id
      JOIN public.anew_membership_permission_scopes s
        ON s.membership_id = am.id
       AND s.permission_code = 'proposals.edit'
       AND s.scope_level = 'ORG'
      WHERE au.auth_user_id = _auth_uid
    ) THEN 'ORG'
    WHEN EXISTS (
      SELECT 1
      FROM public.anew_users au
      JOIN public.anew_memberships am
        ON am.user_id = au.id
       AND am.status = 'active'
       AND am.organization_id = _org_id
      JOIN public.anew_membership_permission_scopes s
        ON s.membership_id = am.id
       AND s.permission_code = 'proposals.edit'
       AND s.scope_level = 'TEAM'
      WHERE au.auth_user_id = _auth_uid
    ) THEN 'TEAM'
    -- Has proposals.edit in this org but no ORG/TEAM scope row -> OWNED.
    ELSE 'OWNED'
  END
$$;

REVOKE ALL ON FUNCTION public.get_proposal_edit_scope(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_proposal_edit_scope(uuid, uuid) TO authenticated, service_role;

-- Old single-argument signature is no longer called anywhere after this
-- migration's can_write_proposal_row update below; drop it so nothing can
-- silently fall back to the org-unaware resolution.
DROP FUNCTION IF EXISTS public.get_proposal_edit_scope(uuid);

-- ── 3. can_write_proposal_row: thread p_org_id into the now org-aware scope ─

CREATE OR REPLACE FUNCTION public.can_write_proposal_row(
  p_created_by uuid,
  p_org_id     uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth_uid     uuid := auth.uid();
  v_anew_user_id uuid;
  v_scope        text;
  v_team_ids     uuid[];
BEGIN
  IF v_auth_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT au.id INTO v_anew_user_id
  FROM public.anew_users au
  WHERE au.auth_user_id = v_auth_uid;

  IF v_anew_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_scope := public.get_proposal_edit_scope(v_auth_uid, p_org_id);

  -- No proposals.edit in this organization: never allowed, even for the
  -- row's own creator.
  IF v_scope IS NULL THEN
    RETURN false;
  END IF;

  IF v_scope = 'ORG' THEN
    -- Org-visibility is enforced by the separate org-scope check that already
    -- runs alongside this predicate (RPC Gate 2 org check / RLS AND clause).
    RETURN true;
  END IF;

  IF v_scope = 'TEAM' THEN
    SELECT COALESCE(ARRAY_AGG(DISTINCT tm.user_id), ARRAY[]::uuid[])
    INTO v_team_ids
    FROM public.organization_teams t
    JOIN public.organization_team_members tm
      ON tm.team_id = t.id
    WHERE t.leader_id = v_anew_user_id
      AND p_org_id IS NOT NULL
      AND t.organization_id = p_org_id;

    RETURN p_created_by = v_anew_user_id
        OR p_created_by = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[]));
  END IF;

  -- v_scope = 'OWNED'
  RETURN p_created_by = v_anew_user_id;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_write_proposal_row(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_proposal_row(uuid, uuid) TO authenticated, service_role;
