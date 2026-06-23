-- Add 'leads' to the module CHECK constraint on data_export_audit.
-- The original constraint was created inline in 20260622180000_controlled_exports_audit.sql
-- and was auto-named data_export_audit_module_check by PostgreSQL.
-- Forward-only migration. Do not fold into the baseline.

BEGIN;

ALTER TABLE public.data_export_audit
  DROP CONSTRAINT IF EXISTS data_export_audit_module_check;

ALTER TABLE public.data_export_audit
  ADD CONSTRAINT data_export_audit_module_check
  CHECK (module IN ('clients', 'contacts', 'quotes', 'leads'));

COMMIT;
