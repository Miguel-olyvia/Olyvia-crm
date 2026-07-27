-- RGPD Art. 32 authentication audit trail on top of auth_login_attempts.
--
-- Context: "public"."auth_login_attempts" (20261103010000_add_login_rate_limiting.sql)
-- already logs every password sign-in attempt (identifier, success, ip_address,
-- user_agent, created_at). It was written purely for server-side rate limiting
-- and is populated exclusively by the service role (portal-login Edge
-- Function); RLS is default-deny with no anon/authenticated grants.
--
-- We now also rely on this table as the authentication audit trail required by
-- RGPD Art. 32 ("security of processing"). System admins need read-only access
-- to review it. Rather than opening up the table itself (and breaking the
-- service-role-only invariant the rate limiter depends on), we add a
-- SECURITY DEFINER RPC gated the same way as
-- public.get_system_admin_dashboard_stats
-- (20261110120000_system_admin_dashboard_stats_leads_not_contacts.sql).
--
-- Note on retention scheduling: purge_old_login_attempts() was already wired
-- into pg_cron by 20261105020000_data_retention_policy.sql (job
-- 'purge-login-attempts', daily at 03:00, 30-day window — widened there from
-- the original 7-day window in 20261103010000). That scheduling is NOT
-- redone here to avoid reverting the retention window back to 7 days.

-- ============================================================
-- 1. auth_user_id — link attempts to a resolved auth identity
-- ============================================================
-- Nullable: most historical rows predate this column, and failed attempts
-- against a wrong/unknown email will never resolve to a user.

ALTER TABLE "public"."auth_login_attempts"
    ADD COLUMN IF NOT EXISTS "auth_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN "public"."auth_login_attempts"."auth_user_id" IS
    'Resolved auth.users identity for this login attempt, when known. Nullable: failed attempts against an unknown/wrong email, and rows predating this column, have no value here.';

-- ============================================================
-- 2. Index — used to filter/join in get_auth_audit_log below
-- ============================================================

CREATE INDEX IF NOT EXISTS "idx_auth_login_attempts_auth_user_id"
    ON "public"."auth_login_attempts" USING btree ("auth_user_id");

-- ============================================================
-- 3. get_login_attempts_audit_log — system-admin read-only access
-- ============================================================
-- Named distinctly from the pre-existing public.get_auth_audit_log
-- (20260821010000_auth_audit_log_accessor_record.sql, already live —
-- reads auth.audit_log_entries, unrelated shape/purpose) to avoid creating
-- an ambiguous same-name overload in the schema.
--
-- Same permission gate as public.get_system_admin_dashboard_stats: resolve
-- auth.uid(), require public.is_system_admin(v_uid). Joins auth_user_id
-- against anew_users.auth_user_id to surface a human-readable display name
-- (anew_users.name); null when auth_user_id is null or has no match.

CREATE OR REPLACE FUNCTION public.get_login_attempts_audit_log(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_identifier text DEFAULT NULL,
  p_success boolean DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  identifier text,
  auth_user_id uuid,
  user_display_name text,
  success boolean,
  ip_address text,
  user_agent text,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_system_admin(v_uid) THEN
    RAISE EXCEPTION 'permission denied: system_admin required';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.identifier,
    a.auth_user_id,
    u.name AS user_display_name,
    a.success,
    a.ip_address,
    a.user_agent,
    a.created_at
  FROM public.auth_login_attempts a
  LEFT JOIN public.anew_users u ON u.auth_user_id = a.auth_user_id
  WHERE (p_identifier IS NULL OR a.identifier ILIKE p_identifier)
    AND (p_success IS NULL OR a.success = p_success)
  ORDER BY a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_login_attempts_audit_log(int, int, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_login_attempts_audit_log(int, int, text, boolean) TO authenticated, service_role;
