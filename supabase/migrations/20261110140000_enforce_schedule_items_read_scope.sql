-- Enforce OWNED/TEAM/ORG scope for schedule_items reads at the RLS layer.
--
-- Problem (confirmed live via E2E against org Nike): schedule_items had zero
-- server-side scope enforcement. A user whose scheduling.items.view scope was
-- explicitly configured to the strictest level (OWNED) could still retrieve
-- every schedule_items row in the org via a raw PostgREST call (bypassing the
-- React app's own client-side scope filtering entirely) — 2/2 items returned,
-- including one belonging to a different user.
--
-- Root cause: TWO permissive SELECT policies exist on schedule_items, OR'd
-- together by Postgres RLS:
--   1. "Users can view schedule items" — has_scheduling_permission(...,
--      'scheduling.items.view') AND org visibility. Scope-blind.
--   2. "Users access organization items" (20261110050000) — org visibility
--      only, NO permission check at all. Even blinder.
-- Any fix to policy 1 alone would be silently defeated by policy 2 still
-- granting full-org SELECT. Both are replaced here by one unified,
-- scope-aware policy.
--
-- Note this does NOT copy the Leads module's pattern: investigation found
-- Leads' own RLS SELECT policy (anew_leads_select) is equally scope-blind —
-- Leads' OWNED/TEAM scoping is applied only inside a specific RPC
-- (get_scoped_leads_base) that the frontend happens to call for its main
-- list view, while raw REST reads of anew_leads bypass it the same way.
-- Fixing schedule_items therefore required new, purpose-built RLS-level
-- scope logic rather than reusing something already proven safe.
--
-- Design constraint: RLS USING clauses must never raise exceptions (an
-- exception during row evaluation aborts the whole query instead of just
-- denying that row) and should avoid heavy per-row computation. The new
-- get_schedule_item_scope_context() function is STABLE, never raises
-- (returns the most restrictive result — 'OWNED' with empty owner_ids — on
-- any missing-auth/missing-membership case instead), and is called once per
-- row via a single EXISTS(...) correlated subquery.
--
-- Scope semantics (mirrors the OWNED/TEAM/ORG model used elsewhere):
--   ORG   — no additional restriction beyond permission + org visibility.
--   TEAM  — visible if created_by/user_id is the caller, or a member of a
--           team the caller leads (organization_teams/organization_team_members,
--           same resolution query as resolve_lead_access_context's team logic).
--   OWNED (default, and the fallback for any edge case) — visible only if
--           created_by/user_id is the caller.
-- A caller holding the system_admin/super_admin role for the row's org is
-- always treated as ORG scope (matches how has_scheduling_permission's own
-- has_anew_permission already bypasses for system_admin; super_admin is
-- included here too since it already holds the explicit permission grants
-- and this only affects the *scope* dimension, not the permission-exists
-- dimension, so it does not reopen the broader is_system_admin bypass
-- deliberately kept out of 20261110070000).

-- Rewritten as a plain SQL function (no PL/pgSQL, no EXCEPTION block): every
-- "missing row" case here is a null-check, not a genuine error, and a
-- PL/pgSQL EXCEPTION handler opens a subtransaction/savepoint on every call —
-- a real per-row cost this codebase's other per-row RLS functions
-- (has_scheduling_permission, get_user_visible_org_ids) deliberately avoid by
-- staying plain SQL. Also adds the org-hierarchy walk (org_chain, mirroring
-- resolve_lead_access_context's recursive CTE) so an admin/ORG-scoped user
-- whose membership lives in a parent org is correctly recognized for a child
-- org's items, matching what has_scheduling_permission/
-- get_user_visible_org_ids already grant today. Returns zero rows (not a
-- fallback row) when the caller has no anew_users mapping — the policy's
-- EXISTS(...) check treats zero rows as "deny", so this still fails closed.
CREATE OR REPLACE FUNCTION public.get_schedule_item_scope_context(
  p_org_id uuid,
  p_permission_code text
)
RETURNS TABLE (applied_scope text, owner_ids uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  resolved AS (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM scoped_memberships sm
        JOIN public.anew_roles r ON r.id = sm.role_id
        WHERE r.code IN ('system_admin', 'super_admin')
      ) THEN 'ORG'
      WHEN EXISTS (
        SELECT 1 FROM public.anew_membership_permission_scopes s
        JOIN scoped_memberships sm ON sm.id = s.membership_id
        WHERE s.permission_code = p_permission_code AND s.scope_level = 'ORG'
      ) THEN 'ORG'
      WHEN EXISTS (
        SELECT 1 FROM public.anew_membership_permission_scopes s
        JOIN scoped_memberships sm ON sm.id = s.membership_id
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
$$;

REVOKE ALL ON FUNCTION public.get_schedule_item_scope_context(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_schedule_item_scope_context(uuid, text) TO authenticated, service_role;

-- Replace both existing SELECT policies with one unified, scope-aware policy.
DROP POLICY IF EXISTS "Users can view schedule items" ON public.schedule_items;
DROP POLICY IF EXISTS "Users access organization items" ON public.schedule_items;

-- Independent security review found a THIRD permissive policy that would
-- have silently defeated the fix above: "System admins full access items"
-- (20260615130000_baseline_new_database.sql:21599-21602) grants org-visible
-- authenticated users unrestricted SELECT/INSERT/UPDATE/DELETE (FOR ALL, no
-- FOR clause) with NO actual is_system_admin()/role check despite its name —
-- since RLS permissive policies are OR'd, this alone would reproduce the
-- exact exploited scenario (full-org read) regardless of the new scoped
-- policy. Dropped as redundant and unsafe: genuine system_admin/super_admin
-- users already get 'ORG' scope (see everything) via
-- get_schedule_item_scope_context()'s own admin check above, so no legitimate
-- access is lost. Write authorization for these roles is unaffected — it
-- continues to flow through the granular has_scheduling_permission-gated
-- INSERT/UPDATE/DELETE policies, which already bypass for system_admin via
-- has_anew_permission.
DROP POLICY IF EXISTS "System admins full access items" ON public.schedule_items;

CREATE POLICY "Users can view schedule items (scoped)" ON public.schedule_items
FOR SELECT TO authenticated
USING (
  public.has_scheduling_permission(auth.uid(), 'scheduling.items.view')
  AND organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  AND EXISTS (
    SELECT 1
    FROM public.get_schedule_item_scope_context(schedule_items.organization_id, 'scheduling.items.view') ctx
    WHERE ctx.applied_scope = 'ORG'
       OR schedule_items.created_by = ANY (ctx.owner_ids)
       OR schedule_items.user_id = ANY (ctx.owner_ids)
  )
);
