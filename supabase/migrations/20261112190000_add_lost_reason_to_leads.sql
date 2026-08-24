-- Adds the missing "lost_reason" column to anew_leads, mirroring the pattern
-- already used by quotes.lost_reason (20261112100000) and deals.lost_reason.
-- Today, marking a lead as "Perdida" (status = 'lost' or moving it into a
-- lead_workflow_stages row with is_rejection = true) via drag-and-drop on the
-- Kanban, bulk status change, or the edit dialog's status Select never asks
-- for a reason, and there is nowhere to store one even if it were asked.
ALTER TABLE public.anew_leads ADD COLUMN IF NOT EXISTS lost_reason text;
