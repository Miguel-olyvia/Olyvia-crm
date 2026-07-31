-- Freezes each proposal's template/layout at creation time, so editing the
-- shared proposal_templates row (or a future per-proposal editor) never
-- retroactively changes proposals that already exist. Purely additive: one
-- new nullable column, no existing column touched, no row deleted.
--
-- Rendering paths (client portal, CRM preview, PDF, proposal-send email) are
-- updated separately (application code) to prefer this snapshot over the
-- live proposal_templates join, falling back to the live join only for rows
-- where this column is still null (should not happen after the backfill
-- below, but kept as a safety net for any future proposal created before
-- app code deploys, or a race during the deploy window).

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS template_snapshot JSONB;

-- Non-destructive backfill: copy the FULL resolved template row (not a
-- filtered subset) so the snapshot is a faithful, complete copy — mirrors
-- exactly the same resolution priority already used by the application's
-- loadTemplate() today (explicit template_id, else the org's default
-- active "proposal" template, else no template at all).
UPDATE public.proposals p
SET template_snapshot = to_jsonb(pt.*)
FROM public.proposal_templates pt
WHERE p.template_snapshot IS NULL
  AND p.template_id IS NOT NULL
  AND pt.id = p.template_id;

UPDATE public.proposals p
SET template_snapshot = to_jsonb(pt.*)
FROM public.proposal_templates pt
WHERE p.template_snapshot IS NULL
  AND p.template_id IS NULL
  AND pt.organization_id = p.organization_id
  AND pt.template_type = 'proposal'
  AND pt.is_default = true
  AND pt.is_active = true;
