-- Leads — close a privilege-escalation gap introduced by
-- 20260728010000_leads_creation_followup_rpcs.sql (formerly 20260727010000, renamed to
-- resolve a duplicate migration-version collision with the deals audit-bypass migration
-- that shared timestamp 20260727010000 and is now 20260730010000_deals_audit_bypass_and_rpcs.sql).
-- 2026-07-29 | Module: Leads (creation follow-up) — security fix
--
-- Problem
-- -------
-- public._fn_leads_creation_critical_writes(...) is an INTERNAL helper: it takes a raw
-- p_actor uuid parameter (never resolves the caller's identity itself) and does NOT call
-- fn_lead_org_in_scope() — that authorization check only happens in the two wrapping public
-- RPCs (rpc_create_lead_manual / rpc_create_lead_duplicate_override). The helper's migration
-- only ran:
--   REVOKE ALL ... FROM PUBLIC, anon;
--   GRANT EXECUTE ... TO service_role;
-- This project's baseline configures ALTER DEFAULT PRIVILEGES that grant EXECUTE on newly
-- created functions to `authenticated` by default. Because the helper's REVOKE did not
-- explicitly include `authenticated`, that default grant was NOT revoked, and
-- has_function_privilege('authenticated', ..., 'EXECUTE') was TRUE immediately after the
-- migration was applied (confirmed by direct query against the live database).
--
-- Impact (CRITICAL — fixed live via emergency REVOKE at discovery, before this migration
-- was written; this migration persists that fix in version control):
-- Any authenticated user could call _fn_leads_creation_critical_writes(...) DIRECTLY —
-- bypassing rpc_create_lead_manual / rpc_create_lead_duplicate_override entirely, and
-- therefore bypassing fn_lead_org_in_scope(). Because the function is SECURITY DEFINER
-- (owned by postgres), a direct call would run with elevated privileges and could:
--   · Insert anew_entity_emails / anew_entity_phones / anew_leads / anew_entity_roles rows
--     for ANY entity_id / organization_id, including organizations the caller has no
--     membership in (cross-tenant write).
--   · Attribute the write to an ARBITRARY p_actor uuid (audit/identity spoofing), since the
--     helper trusts the caller-supplied p_actor instead of resolving it internally.
--
-- Fix
-- ---
-- Explicitly revoke EXECUTE from `authenticated` (and PUBLIC, anon again for defense in
-- depth) on the helper, leaving ONLY service_role able to call it. The two public RPCs are
-- unaffected: they are SECURITY DEFINER, owned by the same role as the helper (postgres),
-- so their internal call to the helper executes as the definer, not as the original
-- `authenticated` caller — revoking the caller's own direct EXECUTE does not break the
-- RPC -> helper call chain. Verified against the deals module's sibling migration
-- (20260730010000_deals_audit_bypass_and_rpcs.sql) and the other _fn_-prefixed internal
-- helpers in this codebase: none of them exhibited this specific gap for a directly
-- callable (non-trigger) SECURITY DEFINER function — this was isolated to this helper.
--
-- Prerequisites:
--   20260728010000_leads_creation_followup_rpcs.sql — defines the affected function

REVOKE ALL ON FUNCTION public._fn_leads_creation_critical_writes(
  uuid, uuid, uuid, uuid, boolean, jsonb, text, text, text, text, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._fn_leads_creation_critical_writes(
  uuid, uuid, uuid, uuid, boolean, jsonb, text, text, text, text, uuid, uuid, uuid
) TO service_role;

-- ============================================================
-- Verification (not executed)
-- ============================================================
-- SELECT has_function_privilege('authenticated', 'public._fn_leads_creation_critical_writes(uuid,uuid,uuid,uuid,boolean,jsonb,text,text,text,text,uuid,uuid,uuid)', 'EXECUTE'); -- false
-- SELECT has_function_privilege('service_role', 'public._fn_leads_creation_critical_writes(uuid,uuid,uuid,uuid,boolean,jsonb,text,text,text,text,uuid,uuid,uuid)', 'EXECUTE');     -- true
-- rpc_create_lead_manual / rpc_create_lead_duplicate_override remain callable by
-- `authenticated` and continue to work end-to-end (their internal call to the helper runs
-- as the SECURITY DEFINER owner, unaffected by this REVOKE).
