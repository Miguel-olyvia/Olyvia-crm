-- Migration: scope workflow_execution_log SELECT by organization
--
-- Why: "Users can view workflow execution logs" was `FOR SELECT USING (true)`
-- with no `TO` clause and no organization filter at all — any role that can
-- reach this table (including `authenticated`) sees every automation-rule
-- execution log row for every organization in the system: which rule fired,
-- on which record, targeting which entity, for every tenant. This is a
-- cross-tenant metadata leak, found while auditing execute-workflow's
-- service_role usage for the blast-radius reduction plan (slide 60).
--
-- Fix: require system_admin, OR that the row's rule (workflow_automation_
-- rules.id = workflow_execution_log.rule_id) belongs to an organization the
-- caller can see. Rows with a NULL rule_id (no rule reference) become
-- visible only to system_admin — conservative default, since there is no
-- other column to scope them by.
--
-- INSERT is intentionally left service_role-only (no new INSERT policy):
-- today's only writer is execute-workflow's own service_role client, and no
-- scoped/authenticated write path exists yet.

DROP POLICY IF EXISTS "Users can view workflow execution logs" ON "public"."workflow_execution_log";

CREATE POLICY "workflow_execution_log_select" ON "public"."workflow_execution_log"
FOR SELECT
TO authenticated
USING (
  public.is_system_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.workflow_automation_rules r
    WHERE r.id = workflow_execution_log.rule_id
      AND r.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  )
);
