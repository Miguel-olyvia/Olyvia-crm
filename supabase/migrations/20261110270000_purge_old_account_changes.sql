-- Data retention policy addendum (RGPD Art. 5(1)(e) / Art. 32) --
-- purge_old_account_changes for public.auth_account_changes.
--
-- Context: 20261110260000_auth_account_changes_audit.sql created
-- public.auth_account_changes (RGPD Art. 32 audit trail of email/password
-- changes on auth.users) but deliberately left retention scheduling to a
-- follow-up migration. This is that follow-up.
--
-- Retention window: 30 days, matching public.auth_login_attempts'
-- purge_old_login_attempts() window (20261105020000_data_retention_policy.sql).
-- auth_account_changes is the sibling audit table for the same RGPD Art. 32
-- authentication-audit purpose (auth_login_attempts records WHO tried to
-- sign in and whether it succeeded; auth_account_changes records WHEN a
-- user's email/password changed) — there is no reason for these two
-- sibling tables to have different retention windows, so we reuse the
-- already-established 30-day window rather than inventing a new one.
--
-- Same pattern as purge_old_login_attempts(): SECURITY DEFINER SQL
-- function, search_path pinned to 'public', scheduled via pg_cron inside a
-- DO block that checks the pg_cron extension is installed before
-- scheduling (so this migration does not fail in environments without
-- pg_cron), and explicit REVOKE ALL lockdown matching the sibling function.
--
-- Schedule: daily at 03:20 -- after purge-login-attempts' 03:00 run and
-- purge-otp-codes' 03:15 run (both from 20261105020000_data_retention_policy.sql),
-- so this job does not contend with either for the same moment.

CREATE OR REPLACE FUNCTION "public"."purge_old_account_changes"()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  DELETE FROM "public"."auth_account_changes"
  WHERE "created_at" < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION "public"."purge_old_account_changes"() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-account-changes')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-account-changes');

    PERFORM cron.schedule(
      'purge-account-changes',
      '20 3 * * *',
      $cron$SELECT public.purge_old_account_changes()$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron registration is best-effort; never fail the migration.
  NULL;
END;
$$;
