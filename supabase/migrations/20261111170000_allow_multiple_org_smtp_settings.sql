-- The one-default-per-org partial index (20261111160000) turned out to be
-- inert: this table has carried a blanket UNIQUE(organization_id) constraint
-- since the baseline schema, which permits at most one SMTP row per
-- organization, period — confirmed live, a second insert for an org that
-- already had one row failed with company_smtp_settings_company_id_key
-- before it ever reached the new partial index.
--
-- That contradicts the per-form SMTP selection feature (form_branding.
-- email_smtp_id) and the app code, which already assumes multiple rows per
-- org: SmtpManagement.tsx lists them ordered by is_default, and
-- _shared/smtp.ts resolves "the" org SMTP via
-- .eq(is_active, true).order(is_default desc).limit(1) — both written for a
-- one-of-many default, never for a single mandatory row. Ported from
-- upstream (20260726205004), which drops this same constraint for the same
-- reason.

ALTER TABLE public.organization_smtp_settings
  DROP CONSTRAINT IF EXISTS company_smtp_settings_company_id_key;
