-- =============================================================================
-- Migration: 20260630100000_fix_update_policies_with_check.sql
-- Purpose  : Add WITH CHECK clause to UPDATE policies on high-risk org-scoped
--            tables that previously had only a USING predicate. Without WITH
--            CHECK, any authenticated user who satisfies the USING condition on
--            an existing row can UPDATE that row and move it to any
--            organization_id — including ones outside their visible scope —
--            because the post-write row is never validated.
--
-- Tables patched (priority order, highest blast radius first):
--   1. deals                      — pipeline core, touched by many downstream
--   2. activities                 — created_by/assigned_to multi-path USING
--   3. organization_teams         — org structure, parent of team_members
--   4. organization_team_members  — join table scoped via team_id subquery
--   5. deal_needs                 — scoped via deal_id → deals subquery
--   6. email_templates            — org-scoped content, no permission gate
--   7. client_portal_users        — "Org members can update" lacks WITH CHECK
--
-- Pattern (established in 20260626110000 and 20260627050000):
--   USING  — identical to the baseline USING predicate, wrapped in
--            (SELECT auth.uid()) for single-evaluation performance.
--   WITH CHECK — mirrors USING; org-scope constraint on the committed row.
--
-- Notes on activities:
--   The baseline USING allows three paths: created_by = auth.uid(),
--   assigned_to = auth.uid(), or organization_id in visible orgs.
--   The WITH CHECK intentionally does NOT re-allow the auth.uid() identity
--   paths for the post-write row because both created_by and assigned_to
--   reference auth.users.id (confirmed in baseline), not anew_users.id.
--   For the post-write state what matters is that the row stays within a
--   visible org, so WITH CHECK requires organization_id to be in scope (or
--   NULL, which preserves rows with no org affiliation).
--
-- Notes on organization_team_members:
--   The table has no direct organization_id column; scope is derived via
--   team_id → organization_teams.organization_id. WITH CHECK mirrors this
--   exact subquery join.
--
-- Notes on deal_needs:
--   Scoped via deal_id → deals.organization_id. WITH CHECK mirrors the
--   same join path so a deal_need cannot be reassigned to a deal that
--   belongs to a different org.
--
-- Notes on client_portal_users ("Org members can update"):
--   The baseline USING is a bare has_anew_permission() check with no org
--   scope at all — any authenticated user with proposals.edit globally can
--   UPDATE any portal user row. WITH CHECK adds the org-scope guard that
--   was missing. The "Client can update own portal record" policy already
--   has both USING and WITH CHECK and is left untouched.
--
-- Safe     : Forward-only. All DROPs use IF EXISTS. No data changes.
--            No schema changes. Idempotent if re-applied.
-- Prerequisites:
--   20260615130000_baseline_new_database.sql
--   20260623150000_fix_rls_auth_uid_correlated_subquery.sql
--   20260626110000_rls_performance_and_proposals_check.sql
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. deals — "Users can update deals in their org"
--    Baseline (line 22128): USING only, no WITH CHECK.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can update deals in their org" ON public.deals;

CREATE POLICY "Users can update deals in their org"
  ON public.deals
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );


-- ---------------------------------------------------------------------------
-- 2. activities — "Users can update activities"
--    Baseline (line 22105): USING with three paths, no WITH CHECK.
--    WITH CHECK requires the committed row to have organization_id in scope
--    (or NULL for activities not affiliated with any org). The identity-path
--    branches (created_by, assigned_to) are not repeated in WITH CHECK
--    because we validate the destination row's org placement, not the
--    caller's identity relationship to it.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can update activities" ON public.activities;

CREATE POLICY "Users can update activities"
  ON public.activities
  FOR UPDATE
  TO authenticated
  USING (
    ((SELECT auth.uid()) = created_by)
    OR ((SELECT auth.uid()) = assigned_to)
    OR (
      organization_id IS NOT NULL
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    organization_id IS NULL
    OR organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );


-- ---------------------------------------------------------------------------
-- 3. organization_teams — "Users can update teams in visible orgs"
--    Baseline (line 22263): USING only, no WITH CHECK.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can update teams in visible orgs" ON public.organization_teams;

CREATE POLICY "Users can update teams in visible orgs"
  ON public.organization_teams
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );


-- ---------------------------------------------------------------------------
-- 4. organization_team_members — "Users can update team members"
--    Baseline (line 22254): USING via team_id subquery, no WITH CHECK.
--    WITH CHECK mirrors the same join: the committed row's team_id must
--    belong to a team in a visible org.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can update team members" ON public.organization_team_members;

CREATE POLICY "Users can update team members"
  ON public.organization_team_members
  FOR UPDATE
  TO authenticated
  USING (
    team_id IN (
      SELECT ot.id
      FROM public.organization_teams ot
      WHERE ot.organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT ot.id
      FROM public.organization_teams ot
      WHERE ot.organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ---------------------------------------------------------------------------
-- 5. deal_needs — "auth_update_deal_needs"
--    Baseline (line 24319): USING via deal_id subquery, no WITH CHECK.
--    WITH CHECK: the committed row's deal_id must reference a deal in a
--    visible org, preventing reassignment across org boundaries.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "auth_update_deal_needs" ON public.deal_needs;

CREATE POLICY "auth_update_deal_needs"
  ON public.deal_needs
  FOR UPDATE
  TO authenticated
  USING (
    deal_id IN (
      SELECT d.id
      FROM public.deals d
      WHERE d.organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    deal_id IN (
      SELECT d.id
      FROM public.deals d
      WHERE d.organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ---------------------------------------------------------------------------
-- 6. email_templates — "Users can update templates in their org hierarchy"
--    Baseline (line 22270): USING only, no WITH CHECK.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can update templates in their org hierarchy" ON public.email_templates;

CREATE POLICY "Users can update templates in their org hierarchy"
  ON public.email_templates
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );


-- ---------------------------------------------------------------------------
-- 7. client_portal_users — "Org members can update client portal users"
--    Baseline (line 21479): USING with has_anew_permission only — no org
--    scope and no WITH CHECK. Any user globally holding proposals.edit
--    could update any portal user row regardless of org membership.
--    WITH CHECK adds the org-scope constraint. USING is also tightened to
--    require org-scope so that the pre-write row is validated too.
--
--    The companion policy "Client can update own portal record" (line 21358)
--    already has both USING and WITH CHECK and is not touched.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Org members can update client portal users" ON public.client_portal_users;

CREATE POLICY "Org members can update client portal users"
  ON public.client_portal_users
  FOR UPDATE
  TO authenticated
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'proposals.edit')
    AND organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    public.has_anew_permission((SELECT auth.uid()), 'proposals.edit')
    AND organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );


-- =============================================================================
-- Notes
-- =============================================================================
-- 1. The (SELECT auth.uid()) pattern is used throughout so Postgres evaluates
--    auth.uid() once per query rather than once per row, consistent with the
--    performance fix in 20260623150000 and 20260626110000.
--
-- 2. The remaining ~84 unpatched UPDATE policies across the full schema are
--    tracked in finding DB-NEW-002-A. They should be addressed in subsequent
--    migrations grouped by module (scheduling, inventory, contracts, etc.).
--    This migration covers the five highest-risk tables confirmed in the
--    security review plus email_templates and client_portal_users.
--
-- 3. The activities WITH CHECK intentionally uses a narrower predicate than
--    USING (org-scope only, no identity-path bypass) because the post-write
--    state of the row is what determines its future visibility — not who the
--    caller is relative to the row they just wrote.
-- =============================================================================
