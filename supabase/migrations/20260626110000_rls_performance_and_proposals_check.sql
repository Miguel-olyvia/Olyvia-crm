-- =============================================================================
-- Migration: 20260626110000_rls_performance_and_proposals_check.sql
-- Purpose  : (1) Replace direct auth.uid() calls in PERMISSIVE policies with
--                (SELECT auth.uid()) to allow Postgres to evaluate the
--                expression once per query instead of once per row.
--            (2) Add WITH CHECK to proposals UPDATE policy so that a write
--                cannot move a proposal to an organization_id outside the
--                user's visible scope.
-- Affected : anew_entities (INSERT), proposals (UPDATE)
-- Safe     : Forward-only. Drops the old policy then recreates it.
--            No data changes. No schema changes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. anew_entities INSERT
--    Problem : WITH CHECK uses bare `auth.uid() IS NOT NULL`.
--              Postgres re-evaluates auth.uid() for every candidate row.
--    Fix     : Wrap in (SELECT auth.uid()) so the stable function is called
--              once and the result is re-used for all rows in the statement.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "authenticated_insert_anew_entities" ON public.anew_entities;

CREATE POLICY "authenticated_insert_anew_entities"
  ON public.anew_entities
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND public.user_has_active_membership((SELECT auth.uid()))
  );


-- ---------------------------------------------------------------------------
-- 2. proposals UPDATE
--    Problem : The existing policy has only USING — no WITH CHECK.
--              A user who can see a proposal could UPDATE it and set
--              organization_id to any value, including orgs outside their
--              scope, because the post-write row is never validated.
--    Fix     : Add WITH CHECK that mirrors the write-side constraints:
--              - organization_id must stay within the user's visible orgs
--                (same guard already on INSERT).
--              - If organization_id is NULL the deal-ownership path still
--                controls access, so we allow NULL through (consistent with
--                INSERT policy).
--              The USING clause is left unchanged so row visibility is
--              identical to before.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users with permission can update proposals" ON public.proposals;

CREATE POLICY "Users with permission can update proposals"
  ON public.proposals
  FOR UPDATE
  USING (
    created_by = public.current_business_user_id()
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'proposals.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.has_anew_permission((SELECT auth.uid()), 'proposals.edit')
    AND (
      organization_id IS NULL
      OR organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- The remaining auth.uid() usages in other policies (has_anew_permission,
-- get_user_visible_org_ids, can_see_entity, is_entity_in_user_scope) pass
-- auth.uid() as a function argument. Postgres does NOT guarantee those are
-- stable-inlined in the same way, but those functions are already marked
-- SECURITY DEFINER / STABLE in the codebase, so planner caching applies at
-- the function level. A follow-up migration can wrap those calls too if
-- pg_stat_statements reveals per-row evaluation overhead in production.
--
-- The proposals WITH CHECK intentionally does NOT re-assert
-- `created_by = current_business_user_id()` as a sufficient condition on its
-- own: if a non-owner editor (proposals.edit permission) updates a proposal,
-- they must still keep it within a visible org. Separating creator bypass
-- from permission-based edit in the USING clause vs. requiring org-scope in
-- WITH CHECK is deliberate — it mirrors the INSERT policy's logic.
-- =============================================================================
