-- Ported from upstream (20260726205004): enforce at the DB level that an
-- organization has at most one default SMTP config. The app already unsets
-- other defaults before setting a new one (SmtpManagement.tsx), but that's a
-- two-step client-side sequence with no DB-level guarantee against a race or
-- a partial failure leaving two rows marked default. Confirmed live: zero
-- existing rows currently have is_default=true, so this is safe to add.

CREATE UNIQUE INDEX IF NOT EXISTS org_smtp_one_default_per_org
  ON public.organization_smtp_settings (organization_id)
  WHERE is_default = true;
