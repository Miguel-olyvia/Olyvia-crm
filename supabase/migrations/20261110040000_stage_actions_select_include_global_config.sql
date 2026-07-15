-- Migration: include global (organization_id IS NULL) rows in *_stage_actions SELECT
--
-- Why: found while auditing execute-workflow's service_role usage for the
-- blast-radius reduction plan (slide 60, Phase 2). execute-workflow reads
-- lead_stage_actions/quote_stage_actions with an explicit fallback to
-- globally-configured rows (`.is("organization_id", null)`, index.ts:206
-- and :681-688) when no org-specific row exists. The SELECT policies on
-- lead_stage_actions, deal_stage_actions and quote_stage_actions only
-- checked `organization_id IN get_user_visible_org_ids(...)`, which never
-- matches a NULL organization_id.
--
-- This is a correctness gap, not a security one: under a hypothetical
-- future scoped-auth client, these global fallback rows would silently
-- become invisible, and organization-wide automation configured at the
-- global level would stop firing with no error. It doesn't affect today's
-- service_role-based execute-workflow (which bypasses RLS entirely), but
-- fixing it now keeps these three tables consistent with
-- lead_workflow_stages / proposal_workflow_stages / quote_workflow_stages /
-- workflow_automation_rules, which already include the NULL-org case.

ALTER POLICY "anew_select_lead_stage_actions" ON "public"."lead_stage_actions"
  USING (
    ("organization_id" IS NULL)
    OR ("organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"())))
  );

ALTER POLICY "anew_select_deal_stage_actions" ON "public"."deal_stage_actions"
  USING (
    ("organization_id" IS NULL)
    OR ("organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"())))
  );

ALTER POLICY "quote_stage_actions_select" ON "public"."quote_stage_actions"
  USING (
    ("organization_id" IS NULL)
    OR ("organization_id" IN (SELECT "public"."get_user_visible_org_ids"("auth"."uid"())))
  );
