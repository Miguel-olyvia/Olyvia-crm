-- Record-only migration: applied directly to the remote DB via pg on 2026-07-02.
-- Registered with `supabase migration repair --status applied` so it is not lost on a future reset.
-- Forward-only. Do not fold into the baseline.
--
-- Purpose: expose auth.audit_log_entries safely to system administrators only.
--
-- Context (PASSO 1 findings): auth.audit_log_entries has 0 rows despite 53 real
-- users and recent sign-ins. pg_stat_all_tables shows n_tup_ins = 0 / n_tup_del = 0,
-- so rows were NEVER written (not a retention/purge issue). The table is owned by
-- supabase_auth_admin (GoTrue), which therefore already has implicit write access,
-- so this is NOT a SQL/permissions problem. GoTrue audit logging is disabled at the
-- Auth SERVICE level (equivalent of GOTRUE_AUDIT_LOG_DISABLE / dashboard Auth settings).
-- Enabling actual audit writes CANNOT be done via SQL — it requires Supabase
-- Dashboard > Authentication settings (or Supabase support). This migration only
-- provides the secure read path for when/if entries start being written.

CREATE OR REPLACE FUNCTION public.get_auth_audit_log(
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0,
  _event_type text DEFAULT NULL,
  _actor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  event_type text,
  actor_id uuid,
  actor_username text,
  actor_via_sso boolean,
  log_type text,
  ip_address text,
  created_at timestamptz,
  payload json
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
  SELECT
    a.id,
    (a.payload ->> 'action')::text                              AS event_type,
    NULLIF(a.payload ->> 'actor_id', '')::uuid                  AS actor_id,
    (a.payload ->> 'actor_username')::text                      AS actor_username,
    NULLIF(a.payload ->> 'actor_via_sso', '')::boolean          AS actor_via_sso,
    (a.payload ->> 'log_type')::text                            AS log_type,
    a.ip_address::text                                          AS ip_address,
    a.created_at,
    a.payload
  FROM auth.audit_log_entries a
  WHERE public.is_system_admin_user(auth.uid())                 -- hard gate: only system_admin
    AND (_event_type IS NULL OR (a.payload ->> 'action') = _event_type)
    AND (_actor_id  IS NULL OR NULLIF(a.payload ->> 'actor_id','')::uuid = _actor_id)
  ORDER BY a.created_at DESC
  LIMIT  GREATEST(0, LEAST(COALESCE(_limit, 100), 1000))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
$$;

COMMENT ON FUNCTION public.get_auth_audit_log(integer, integer, text, uuid) IS
  'System-admin-only accessor for auth.audit_log_entries. SECURITY DEFINER, gated on is_system_admin_user(auth.uid()). Parses GoTrue payload into typed columns.';

-- Least privilege: never expose to anon/public; only authenticated (gated internally) + service_role.
REVOKE ALL ON FUNCTION public.get_auth_audit_log(integer, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_audit_log(integer, integer, text, uuid) TO authenticated, service_role;
