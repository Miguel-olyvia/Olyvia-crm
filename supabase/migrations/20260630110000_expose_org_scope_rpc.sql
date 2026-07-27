-- =============================================================================
-- Migration: 20260630110000_expose_org_scope_rpc.sql
-- Purpose  : (1) Revoke the unnecessary GRANT ALL to anon on
--                get_user_visible_org_ids — finding BASE-USR-013-RPC.
--                Unauthenticated callers can enumerate visible organizations
--                by passing an arbitrary UUID via PostgREST RPC exposure,
--                leaking org membership structure without any authentication
--                requirement.
--            (2) Ensure the function is callable as a typed RPC by
--                authenticated users and service_role, documented as the
--                authoritative scope-resolution primitive for both DB-level
--                RLS and Edge Function scope checks.
--
-- The function itself (defined at baseline line 3976) is NOT recreated here —
-- its body is correct. Only the grant surface is adjusted.
--
-- Safe     : Forward-only. REVOKE on a privilege that does not exist is a
--            no-op in Postgres. No schema or data changes.
-- Prerequisites:
--   20260615130000_baseline_new_database.sql
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Revoke anon GRANT on get_user_visible_org_ids
--    Baseline (line 28714) grants GRANT ALL TO anon — this is unnecessary
--    and exposes org membership enumeration to unauthenticated callers via
--    PostgREST (which exposes public SECURITY DEFINER functions with grants
--    to anon as anonymous RPC endpoints).
--
--    Retain: authenticated, service_role (required for RLS and Edge Functions)
--    Remove: anon, PUBLIC
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_user_visible_org_ids(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_visible_org_ids(uuid) FROM PUBLIC;

-- Re-assert the grants that must remain.
-- (These are already present from the baseline; the explicit re-grant here
-- is defensive and ensures the revoke-then-grant sequence is atomic.)
GRANT EXECUTE ON FUNCTION public.get_user_visible_org_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_visible_org_ids(uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 2. Verification comment (for human review / pg_catalog query)
--    After applying this migration, confirm via:
--
--    SELECT grantee, privilege_type
--    FROM information_schema.routine_privileges
--    WHERE specific_name LIKE '%get_user_visible_org_ids%';
--
--    Expected result: rows only for 'authenticated' and 'service_role'.
--    No row for 'anon' or 'PUBLIC'.
-- ---------------------------------------------------------------------------


-- =============================================================================
-- Notes
-- =============================================================================
-- 1. get_user_visible_org_ids is LANGUAGE sql STABLE SECURITY DEFINER
--    (baseline line 3977). It runs as the function owner (postgres/supabase),
--    not as the caller. The anon grant therefore allowed unauthenticated HTTP
--    requests to call it via PostgREST and receive the full set of org IDs
--    visible to any auth UUID supplied as the argument — a data-disclosure
--    risk even though the function cannot write data.
--
-- 2. The authenticated grant retained here is the one relied upon by:
--    - All RLS policies that call get_user_visible_org_ids() in USING/WITH CHECK
--    - The Edge Function _shared/auth.ts validateOrgScope (via supabase.rpc())
--    - Any future migration that calls this function in a policy or trigger
--
-- 3. The function is intentionally NOT wrapped or replaced. Its recursive CTE
--    body (full ancestor + descendant + cross-association traversal) is the
--    canonical implementation. The companion finding BASE-USR-013-SCOPE
--    recommends that Edge Function validateOrgScope be updated to call this
--    function via RPC instead of the current 1-hop TypeScript query — that
--    is an application-layer change outside the scope of this migration.
-- =============================================================================
