-- Add missing INSERT policies for email_logs and proposal_sends (RLS gap)
-- 2026-11-07 | Modules: Emails / Propostas
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Both public.email_logs and public.proposal_sends have RLS ENABLEd but NO
-- INSERT policy for "authenticated". Today they only work at all because
-- supabase/functions/send-proposal-email and supabase/functions/send-quote-email
-- write these rows using the SERVICE_ROLE client, which bypasses RLS entirely.
-- This blocks reducing those two Edge Functions to the caller's own JWT
-- (RLS would otherwise reject every insert with "new row violates row-level
-- security policy").
--
-- Reference pattern: public.quote_sends already has correct org-scoped
-- policies for all four operations (20260615130000_baseline_new_database.sql,
-- "org_insert_quote_sends" et al.), each gated on:
--   organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
--
-- Column verification (from 20260615130000_baseline_new_database.sql):
--   email_logs.organization_id      uuid, nullable
--   proposal_sends.organization_id  uuid, nullable
-- Both tables carry organization_id directly on the row (same shape as
-- quote_sends.organization_id), so the same predicate applies unchanged.
--
-- Solution
-- --------
-- Add one INSERT policy per table, matching quote_sends' naming convention
-- and predicate exactly. SELECT/UPDATE/DELETE policies are out of scope here:
-- email_logs already has a SELECT policy ("Company admins can view email
-- logs") and no UPDATE/DELETE path is used by the app; proposal_sends' other
-- operations are handled elsewhere and are not part of this gap.

CREATE POLICY "org_insert_email_logs" ON "public"."email_logs"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "organization_id" IN (
      SELECT "public"."get_user_visible_org_ids"("auth"."uid"())
    )
  );

CREATE POLICY "org_insert_proposal_sends" ON "public"."proposal_sends"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "organization_id" IN (
      SELECT "public"."get_user_visible_org_ids"("auth"."uid"())
    )
  );

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. As an authenticated user scoped to org X, inserting a row into
--    email_logs / proposal_sends with organization_id = X now succeeds; with
--    organization_id = some other org it is rejected by RLS.
-- 2. service_role callers are unaffected (RLS does not apply to that role).
