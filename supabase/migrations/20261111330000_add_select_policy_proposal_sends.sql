-- Add missing SELECT policy for proposal_sends (RLS gap)
-- Forward-only migration. Do not fold into or edit any prior migration.
--
-- Context: 20261107010000_add_insert_policies_email_logs_proposal_sends.sql
-- added an org-scoped INSERT policy for proposal_sends but no SELECT policy.
-- RLS has been enabled on this table since the baseline
-- (20260615130000_baseline_new_database.sql:27366) with no SELECT policy at
-- all, so every authenticated read of this table — including the app's own
-- "Histórico de Envios" UI (src/components/proposals/ProposalSendHistory.tsx,
-- a plain `.from("proposal_sends").select(...)`) and my own verification
-- queries while confirming the proposal-reopen-on-republish feature records
-- history correctly — silently returns zero rows regardless of what's
-- actually in the table. Confirmed live: a real republish call via
-- create-client-portal-access (service_role, bypasses RLS) succeeded and the
-- insert executed without error, but an authenticated SELECT immediately
-- after returned []. This is the real cause, not a bug in the insert path.
--
-- Fix: mirror the existing org-scoped INSERT policy with an equivalent
-- SELECT policy.

CREATE POLICY "org_select_proposal_sends" ON "public"."proposal_sends"
  FOR SELECT TO "authenticated"
  USING (
    "organization_id" IN (
      SELECT "public"."get_user_visible_org_ids"("auth"."uid"())
    )
  );

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. As an authenticated user scoped to org X, SELECT on proposal_sends now
--    returns rows with organization_id = X; rows belonging to other orgs
--    stay invisible.
-- 2. service_role callers are unaffected (RLS does not apply to that role).
