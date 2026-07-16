-- Enable real, non-bypassable account lockout for portal-login
-- =================================================================
-- portal-login's failed-attempt lockout (5 attempts / 15 min) only ever
-- gated its OWN edge function. GoTrue's native password-grant endpoint
-- (/auth/v1/token?grant_type=password) has no CORS restriction and accepts
-- the same public anon key from any origin, so an attacker who skips
-- portal-login entirely and calls GoTrue directly bypasses the lockout
-- and the audit trail completely -- CORS on portal-login was never a real
-- brute-force defense, only a same-origin convenience for the SPA.
--
-- Fix: once the failure threshold is hit, portal-login now bans the
-- account at the GoTrue level itself (auth.users.banned_until, via the
-- admin API), which GoTrue enforces on every endpoint and every origin,
-- closing the bypass regardless of which URL the attacker calls.
--
-- This function resolves email -> auth user id via an indexed lookup on
-- auth.users.email (unique index, O(1)), avoiding the previously-noted
-- concern in portal-login about auth.admin.listUsers() being an unbounded
-- paginated scan with attacker-observable latency. Restricted to
-- service_role only: it must never be callable by anon/authenticated,
-- since it would otherwise leak account existence by email.
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) TO service_role;
