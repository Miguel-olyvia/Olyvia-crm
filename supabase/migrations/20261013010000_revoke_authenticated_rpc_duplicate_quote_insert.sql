-- Fix: rpc_duplicate_quote_insert must be service_role-only (quotes-duplicate)
-- 2026-10-13 | Module: Orçamentos
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- 20261012010000_fix_duplicate_quote_audit_attribution.sql created
-- public.rpc_duplicate_quote_insert(p_actor_id, p_source, p_quote, p_lines, p_fees)
-- as SECURITY DEFINER with NO authorization checks of its own: it performs no
-- org-scope predicate on p_quote->>'organization_id' / entity_id / deal_id, and
-- it does not verify that p_actor_id corresponds to the calling identity before
-- using it to attribute audit rows via set_audit_context().
--
-- The function's own header comment states it is "only ever invoked by
-- [duplicate-quote Edge Function]'s SERVICE_ROLE client" and that the Edge
-- Function (resolveCallerIdentity / validateOrgScope in
-- supabase/functions/duplicate-quote/index.ts) already performs org-scope
-- authorization and caller-identity resolution BEFORE calling this RPC.
-- Verified against supabase/functions/duplicate-quote/index.ts: the Edge
-- Function's supabaseAdmin client is created exclusively with
-- SUPABASE_SERVICE_ROLE_KEY, and rpc_duplicate_quote_insert is called only
-- through that client — there is no code path where it is invoked with a
-- caller's own (authenticated-role) session.
--
-- Despite this stated intent, the previous migration granted EXECUTE to the
-- `authenticated` role in addition to `service_role`:
--   GRANT EXECUTE ON FUNCTION public.rpc_duplicate_quote_insert(...)
--     TO authenticated, service_role;
--
-- Because the function is SECURITY DEFINER and performs no authorization of
-- its own, this grant lets ANY authenticated user call it directly via
-- supabase-js/PostgREST (bypassing the Edge Function entirely) to:
--   1. Insert a public.quotes row for an arbitrary organization_id/entity_id/
--      deal_id outside their own organization (cross-tenant write).
--   2. Insert arbitrary public.quote_lines / public.quote_fees rows with
--      attacker-controlled totals, attached to that forged quote.
--   3. Pass an arbitrary p_actor_id, which set_audit_context() uses to
--      populate entity_audit_log.changed_by — forging audit attribution to
--      any other anew_users.id, including users in other organizations.
--
-- Solution
-- --------
-- Revoke EXECUTE from `authenticated`, keeping the function service_role-only,
-- which matches the function's documented design intent and requires no
-- change to the Edge Function (it already uses the service-role key
-- exclusively). This is the minimal, correct fix: no org-scope /
-- actor-identity verification is added to the function body because the
-- Edge Function already performs that verification upstream, and adding a
-- second copy of it here without a documented reason for direct
-- `authenticated` access would be speculative and duplicate logic that must
-- then be kept in sync in two places.
--
-- Prerequisites:
--   20261012010000_fix_duplicate_quote_audit_attribution.sql — defines the
--   function and the over-broad grant being corrected here.

REVOKE EXECUTE ON FUNCTION public.rpc_duplicate_quote_insert(uuid, text, jsonb, jsonb, jsonb)
  FROM authenticated;

-- Belt-and-suspenders: explicitly reaffirm PUBLIC/anon have no access either
-- (already revoked by the prior migration; restated here for auditability).
REVOKE ALL ON FUNCTION public.rpc_duplicate_quote_insert(uuid, text, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon;

-- service_role keeps EXECUTE — this is the only role the Edge Function uses.
GRANT EXECUTE ON FUNCTION public.rpc_duplicate_quote_insert(uuid, text, jsonb, jsonb, jsonb)
  TO service_role;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. As an authenticated (non-service-role) user, calling the RPC directly
--    must now fail with a permission-denied error:
--      select * from rpc_duplicate_quote_insert(
--        '00000000-0000-0000-0000-000000000000'::uuid, 'web_app',
--        '{}'::jsonb, '[]'::jsonb, '[]'::jsonb
--      );
--      -- ERROR: permission denied for function rpc_duplicate_quote_insert
--
-- 2. Confirm the resulting grants:
--      select grantee, privilege_type
--      from information_schema.routine_privileges
--      where routine_name = 'rpc_duplicate_quote_insert';
--      -- expect exactly one row: grantee = 'service_role', privilege_type = 'EXECUTE'
--
-- 3. The duplicate-quote Edge Function flow is unaffected: it calls this RPC
--    only via its supabaseAdmin client, which is constructed with
--    SUPABASE_SERVICE_ROLE_KEY (supabase/functions/duplicate-quote/index.ts),
--    i.e. as service_role — never as authenticated.
