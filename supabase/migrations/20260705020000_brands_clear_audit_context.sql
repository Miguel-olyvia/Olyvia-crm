-- Brands post-wave corrections — Wave 2
-- 2026-07-05 | Module: Brands / Cross-cutting | Wave: 2 (missing clear_audit_context RPC)
-- Forward-only migration. Do not fold into the baseline.
--
-- Problem:
--   set_audit_context() was introduced in 20260625010000_entity_audit_log.sql.
--   The frontend (useBulkActions.ts, auditContext.ts, servicesExportImport.ts) calls
--   supabase.rpc('clear_audit_context') in every audit finally-block to reset the GUC.
--   No clear_audit_context() function has ever been defined in any migration.
--
--   The missing function means every finally-block cleanup silently returns a
--   PostgREST "function does not exist" error, which is swallowed by .catch(() => {}).
--   There is no runtime breakage because set_audit_context() uses SET LOCAL (true),
--   making the GUC transaction-scoped and automatically cleared at transaction end.
--   However:
--     (a) The silent error pollutes client-side error handling.
--     (b) If the GUC is ever changed from LOCAL to SESSION-scoped, the missing
--         clear function would become a real security issue (context leakage).
--     (c) TypeScript TS2345 errors are reported by tsc for both RPCs because
--         neither is registered in src/integrations/supabase/types.ts — caused by
--         the Supabase type generator not finding the function definition.
--
-- Fix:
--   Define clear_audit_context() as a companion to set_audit_context().
--   It clears both app.audit_user_id and app.audit_source GUCs using SET LOCAL ''.
--   SECURITY DEFINER is not required (no sensitive data access).
--   Same GRANT/REVOKE pattern as set_audit_context().
--
-- Idempotent: CREATE OR REPLACE.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql (defines set_audit_context)
--   20260705010000_brands_audit_triggers.sql (Wave 1, ordered after Wave 1)

CREATE OR REPLACE FUNCTION public.clear_audit_context()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Empty string resets the GUC for the current transaction (SET LOCAL).
  -- This matches the LOCAL scope used by set_audit_context(), so the reset
  -- is bounded to the transaction regardless of connection pooling.
  PERFORM set_config('app.audit_user_id', '', true);
  PERFORM set_config('app.audit_source',  '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_audit_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_audit_context()
  TO authenticated, service_role;
