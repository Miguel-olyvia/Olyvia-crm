-- Fix: self-revoke of an approved support_access_log session always failed
-- with a CHECK-constraint violation (surfaced by approve-support-access as a
-- generic 500), because support_access_log_no_self_approval blocked ANY row
-- where reviewed_by = admin_user_id, including the legitimate self-revoke
-- path (isOwnRevoke in approve-support-access/index.ts).
--
-- Self-APPROVAL (reviewed_by = admin_user_id AND status = 'approved') must
-- stay blocked as defense-in-depth — the Edge Function already blocks it at
-- the application layer, but the DB constraint is the last line of defense
-- against a bypass. Self-REVOKE (reviewed_by = admin_user_id AND
-- status = 'rejected') is benign — a requester cancelling their own access
-- early is not a privilege-escalation path — so it is now allowed.
--
-- Forward-only migration. Do not fold into the baseline or edit
-- 20260624110000_support_access_log.sql.

ALTER TABLE public.support_access_log
  DROP CONSTRAINT support_access_log_no_self_approval;

ALTER TABLE public.support_access_log
  ADD CONSTRAINT support_access_log_no_self_approval CHECK (
    reviewed_by IS NULL
    OR reviewed_by <> admin_user_id
    OR status = 'rejected'
  );
