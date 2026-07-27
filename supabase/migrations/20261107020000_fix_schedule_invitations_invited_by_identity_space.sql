-- Fix schedule_invitations RLS: invited_by is anew_users.id, not auth.uid()
-- 2026-11-07 | Module: Agendamento
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- public.schedule_invitations.invited_by is populated by
-- supabase/functions/send-schedule-invite/index.ts as:
--   invited_by: scheduleItem.created_by
-- i.e. an public.anew_users.id value (schedule_items.created_by is the
-- app-internal user id space).
--
-- But the three RLS policies defined in 20260615130000_baseline_new_database.sql
-- compare invited_by directly against auth.uid() (the auth.users.id / JWT
-- subject space):
--   "Users can create invitations"                   WITH CHECK (invited_by = auth.uid())
--   "Users can update their own invitation responses" USING (... OR invited_by = auth.uid())
--   "Users can view invitations they sent or received" USING (invited_by = auth.uid() OR ...)
--
-- Since invited_by never actually holds an auth.users.id value, these three
-- predicates are always false for real rows — they only appear to work today
-- because send-schedule-invite uses the SERVICE_ROLE client (RLS bypassed
-- entirely). Scoping that function to the caller's own JWT would make every
-- insert/update/select relying on the invited_by branch fail.
--
-- invitee_id is NOT touched by this migration: for invitee_type = 'user',
-- send-schedule-invite stores the auth_user_id (auth.users.id space) directly
-- as invitee_id (see getUsersFromEntity / the invitee.id passed in from the
-- frontend), so "invitee_id = auth.uid()" is already correct and left as-is.
--
-- Solution
-- --------
-- Resolve invited_by through anew_users.auth_user_id = auth.uid(), the same
-- two-space mapping pattern used by resolveCallerIdentity()
-- (supabase/functions/_shared/auth.ts: anewUserId resolved from auth_user_id)
-- and by other RLS policies in this project that bridge the two id spaces.
-- anew_users.auth_user_id is UNIQUE + indexed (anew_users_auth_user_id_unique,
-- idx_anew_users_auth_user_id), so the subquery below returns at most one row.

DROP POLICY IF EXISTS "Users can create invitations" ON "public"."schedule_invitations";
DROP POLICY IF EXISTS "Users can update their own invitation responses" ON "public"."schedule_invitations";
DROP POLICY IF EXISTS "Users can view invitations they sent or received" ON "public"."schedule_invitations";

CREATE POLICY "Users can create invitations" ON "public"."schedule_invitations"
  FOR INSERT
  WITH CHECK (
    "invited_by" = (
      SELECT "au"."id" FROM "public"."anew_users" "au"
      WHERE "au"."auth_user_id" = "auth"."uid"()
    )
  );

CREATE POLICY "Users can update their own invitation responses" ON "public"."schedule_invitations"
  FOR UPDATE
  USING (
    (("invitee_type" = 'user'::"text") AND ("invitee_id" = "auth"."uid"()))
    OR "invited_by" = (
      SELECT "au"."id" FROM "public"."anew_users" "au"
      WHERE "au"."auth_user_id" = "auth"."uid"()
    )
  );

CREATE POLICY "Users can view invitations they sent or received" ON "public"."schedule_invitations"
  FOR SELECT
  USING (
    "invited_by" = (
      SELECT "au"."id" FROM "public"."anew_users" "au"
      WHERE "au"."auth_user_id" = "auth"."uid"()
    )
    OR (("invitee_type" = 'user'::"text") AND ("invitee_id" = "auth"."uid"()))
  );

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. As an authenticated user whose anew_users.id = X, inserting a row with
--    invited_by = X now succeeds under RLS (previously always rejected for
--    any real caller).
-- 2. Existing invitee_id = auth.uid() branches (view/update as the invitee)
--    are unchanged and continue to work.
-- 3. select policyname, cmd, qual, with_check from pg_policies
--    where tablename = 'schedule_invitations' order by policyname;
