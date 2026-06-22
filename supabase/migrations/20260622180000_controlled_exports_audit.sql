-- Slide 9: immutable audit trail for controlled data exports.
-- Forward-only migration. Do not fold into the baseline.

CREATE TABLE IF NOT EXISTS public.data_export_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE RESTRICT,
  auth_user_id uuid NOT NULL,
  business_user_id uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  module text NOT NULL CHECK (module IN ('clients', 'contacts', 'quotes')),
  format text NOT NULL DEFAULT 'xlsx' CHECK (format = 'xlsx'),
  requested_columns text[] NOT NULL DEFAULT '{}'::text[],
  effective_columns text[] NOT NULL DEFAULT '{}'::text[],
  sensitive_columns text[] NOT NULL DEFAULT '{}'::text[],
  scope text NOT NULL CHECK (scope IN ('NONE', 'OWNED', 'TEAM', 'ORG')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer CHECK (row_count IS NULL OR row_count >= 0),
  status text NOT NULL CHECK (status IN ('started', 'completed', 'denied', 'failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.data_export_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.data_export_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.data_export_audit TO authenticated;
GRANT ALL ON TABLE public.data_export_audit TO service_role;

DROP POLICY IF EXISTS data_export_audit_select_authorized ON public.data_export_audit;
CREATE POLICY data_export_audit_select_authorized
  ON public.data_export_audit
  FOR SELECT
  TO authenticated
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'exports.audit.view')
    AND organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );

CREATE INDEX IF NOT EXISTS idx_data_export_audit_org_created
  ON public.data_export_audit (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_export_audit_user_created
  ON public.data_export_audit (auth_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_export_audit_module_created
  ON public.data_export_audit (module, created_at DESC);

COMMENT ON TABLE public.data_export_audit IS
  'Immutable metadata-only audit trail for controlled XLSX data exports. Exported values and PII must never be stored here.';
