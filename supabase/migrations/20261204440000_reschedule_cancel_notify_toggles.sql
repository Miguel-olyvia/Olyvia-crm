-- Adds independent "notify the commercial" toggles for reschedule and
-- cancel, mirroring the existing meeting_notify_commercial/meeting_notify_emails
-- pair (which stays as the "on new booking" toggle). Purely additive, all
-- default to false/null, so no existing behaviour changes until the UI and
-- the two edge functions are updated to read them.
ALTER TABLE public.form_branding
  ADD COLUMN IF NOT EXISTS reschedule_notify_commercial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reschedule_notify_emails     TEXT,
  ADD COLUMN IF NOT EXISTS cancel_notify_commercial     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_notify_emails         TEXT;
