-- Per-form scheduling/email options, ported from an upstream fork's booking/
-- scheduling feature (confirmation/meeting-notify/reminder emails, per-form
-- SMTP, scheduling-invite recovery for leads who didn't book a slot).
-- Consolidated from ~10 overlapping upstream migrations into one clean pass;
-- tenant-specific data (Mudelar copy/branding/URLs) intentionally excluded —
-- this only adds generic, reusable schema.

ALTER TABLE public.form_branding
  ADD COLUMN IF NOT EXISTS confirmation_email_enabled     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_email_template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meeting_notify_commercial       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meeting_notify_emails           TEXT,
  ADD COLUMN IF NOT EXISTS meeting_notify_template_id      UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reminder_enabled                BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_hours_before            INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS reminder_template_id            UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_locale_templates          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS booking_manage_url_template     TEXT,
  ADD COLUMN IF NOT EXISTS email_smtp_id                   UUID REFERENCES public.organization_smtp_settings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS public_form_url_template        TEXT,
  ADD COLUMN IF NOT EXISTS scheduling_invite_enabled       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scheduling_invite_delays_hours  INTEGER[] NOT NULL DEFAULT '{24}';

ALTER TABLE public.scheduled_emails
  ADD COLUMN IF NOT EXISTS smtp_id UUID REFERENCES public.organization_smtp_settings(id) ON DELETE SET NULL;

ALTER TABLE public.anew_leads
  ADD COLUMN IF NOT EXISTS locale VARCHAR(10);

-- Scheduling-invite tokens: when a lead completes a form that has a
-- scheduling step but doesn't pick a slot, and their district is covered, we
-- email a secure resume link. Distinct from booking_tokens (which requires a
-- schedule_item_id that doesn't exist yet at this point). Service-role only
-- via Edge Functions (get-scheduling-invite / book-slot) — no public RLS
-- policies, mirroring booking_tokens' own pattern.
CREATE TABLE IF NOT EXISTS public.scheduling_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  lead_id uuid NOT NULL REFERENCES public.anew_leads(id) ON DELETE CASCADE,
  form_id uuid NOT NULL,
  step_number integer NOT NULL,
  organization_id uuid,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduling_invites ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_scheduling_invites_token ON public.scheduling_invites(token);
CREATE INDEX IF NOT EXISTS idx_scheduling_invites_lead ON public.scheduling_invites(lead_id);
