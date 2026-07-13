-- Data retention policy (RGPD Art. 5(1)(e) — "limitação da conservação").
-- Forward-only migration. Do not fold into the baseline.
--
-- See RETENTION_POLICY.md at the repo root for the full table-by-table policy
-- and rationale. This migration only wires up the automatic purge jobs that
-- were judged safe to run unattended (short-lived security/technical data
-- with no business value once expired). It deliberately does NOT touch:
--   - anew_leads / anew_contacts / anew_clients / deals / proposals / quotes
--     (business data — retention needs a product decision, not a migration)
--   - entity_audit_log, support_access_log, data_export_audit,
--     client_portal_access_log (compliance/security audit trails — retention
--     period needs a product/legal decision; see RETENTION_POLICY.md, item 6)
--
-- Sections:
--   1. auth_login_attempts — schedule the purge function added in
--      20261103010000_add_login_rate_limiting.sql (it existed but was never
--      scheduled).
--   2. sms_otp_codes — new purge function + schedule.
--   3. anew_leads stale-lead reporting view (read-only, NO deletion) so stale
--      unconverted leads can be reviewed manually instead of being purged
--      automatically.

-- ============================================================
-- 1. auth_login_attempts — schedule existing purge function
-- ============================================================
-- Policy: keep 30 days (covers abuse investigation / IP-block decisions),
-- purge nightly. The function created failed+successful attempts older than
-- 7 days originally; we widen the window to 30 days here to leave enough
-- history for incident response while still bounding table growth, and we
-- are the ones actually scheduling it.

CREATE OR REPLACE FUNCTION "public"."purge_old_login_attempts"()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  DELETE FROM "public"."auth_login_attempts"
  WHERE "created_at" < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION "public"."purge_old_login_attempts"() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-login-attempts')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-login-attempts');

    PERFORM cron.schedule(
      'purge-login-attempts',
      '0 3 * * *',
      $cron$SELECT public.purge_old_login_attempts()$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron registration is best-effort; never fail the migration.
  NULL;
END;
$$;

-- ============================================================
-- 2. sms_otp_codes — purge expired/consumed codes
-- ============================================================
-- Policy: codes are single-purpose and expire after 5 minutes (see
-- supabase/functions/sms-otp/index.ts). There is no reason to keep the code
-- value itself once it is unusable. Keep a 7-day window (matches the
-- pre-existing convention used for auth_login_attempts before this
-- migration) so recent OTP activity remains available for a few days of
-- support/debugging, then purge.

CREATE OR REPLACE FUNCTION "public"."purge_old_otp_codes"()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  DELETE FROM "public"."sms_otp_codes"
  WHERE "expires_at" < now() - interval '7 days';
$$;

REVOKE ALL ON FUNCTION "public"."purge_old_otp_codes"() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-otp-codes')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-otp-codes');

    PERFORM cron.schedule(
      'purge-otp-codes',
      '15 3 * * *',
      $cron$SELECT public.purge_old_otp_codes()$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- ============================================================
-- 3. Stale-lead reporting (READ-ONLY — no automatic deletion)
-- ============================================================
-- Policy: leads that were never converted may still hold business value
-- (re-engagement, pipeline history), so they are never deleted
-- automatically. This view only flags leads with no contact/update activity
-- in the last 24 months, for a human to review before any manual archival
-- or deletion decision. It is a plain view (not SECURITY DEFINER), so the
-- existing RLS policies on anew_leads apply exactly as they do for direct
-- queries — no privilege escalation is introduced.

CREATE OR REPLACE VIEW "public"."leads_pending_retention_review" AS
SELECT
  l.id,
  l.organization_id,
  l.entity_id,
  l.status,
  l.source,
  l.assigned_to,
  l.created_at,
  l.last_contact_at,
  l.converted_at,
  GREATEST(l.updated_at, l.last_contact_at, l.created_at) AS last_activity_at
FROM public.anew_leads l
WHERE l.deleted_at IS NULL
  AND l.converted_at IS NULL
  AND l.converted_to_contact_id IS NULL
  AND l.converted_to_client_id IS NULL
  AND GREATEST(l.updated_at, l.last_contact_at, l.created_at) < now() - interval '24 months';

COMMENT ON VIEW "public"."leads_pending_retention_review" IS
  'Read-only report of unconverted leads with no activity in 24+ months, for manual retention review. Never deletes anything; see RETENTION_POLICY.md.';
