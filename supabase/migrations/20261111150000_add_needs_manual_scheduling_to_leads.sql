-- Ported from upstream fork's "finish scheduling" recovery flow: create-lead
-- flags a lead as needing manual scheduling when it completed a form with a
-- scheduling step but didn't pick a slot. Used to decide whether to queue the
-- recovery-nudge email (queueSchedulingInviteRecovery in _shared/formEmails.ts)
-- and, going forward, to let staff filter/report on these leads.

ALTER TABLE public.anew_leads
  ADD COLUMN IF NOT EXISTS needs_manual_scheduling BOOLEAN NOT NULL DEFAULT false;
