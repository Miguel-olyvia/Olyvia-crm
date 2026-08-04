-- Follow-up to 20261111400000_lead_journey_stage_dynamic_flags.sql.
--
-- Bug found live: a lead resolved to the "Negotiation" stage
-- (counts_as_negotiation = true, correctly resolved by compute_lead_stage_v2
-- from the org's own configured rules) but with no row in public.proposals
-- (org nike, test lead "miguel teste portal", 0 interactions/45 days idle)
-- showed the Percurso stuck at "Lead" instead of "Negociacao".
--
-- Root cause: journey_bucket_for_stage required counts_as_negotiation AND
-- has_active_proposal -- an extra gate that isn't part of any rule the
-- organization can configure in the Workflow screen, so a lead legitimately
-- at "Negotiation" per the org's own rules could still fail to show as
-- "Negociacao" in the Percurso. The sibling "qualified" bucket never had
-- this problem: it already treats its extra signals
-- (has_visit_done/has_qualification_sql) as OR-enhancements on top of
-- counts_as_qualified, never as extra requirements.
--
-- Fix: make negotiation consistent with qualified -- reaching a stage the
-- org has flagged counts_as_negotiation is enough on its own (that already
-- fully respects whatever reached_when/matching_statuses rules resolved the
-- lead there); has_active_proposal is only an additional signal that can
-- independently promote a lead into this bucket even before the Funil stage
-- formally catches up, exactly like has_visit_done does for "qualified" --
-- never a reason to hold a lead back.
CREATE OR REPLACE FUNCTION public.journey_bucket_for_stage(
  p_counts_as_converted boolean,
  p_counts_as_negotiation boolean,
  p_counts_as_qualified boolean,
  p_signals jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN COALESCE(p_counts_as_converted, false) THEN 'client'
    WHEN COALESCE(p_counts_as_negotiation, false)
      OR COALESCE((p_signals->>'has_active_proposal')::boolean, false) THEN 'negotiation'
    WHEN COALESCE(p_counts_as_qualified, false)
      OR COALESCE((p_signals->>'has_visit_done')::boolean, false)
      OR COALESCE((p_signals->>'has_qualification_sql')::boolean, false) THEN 'qualified'
    WHEN COALESCE((p_signals->>'has_contact_logged')::boolean, false)
      OR COALESCE((p_signals->>'has_call_answered')::boolean, false)
      OR COALESCE((p_signals->>'has_email_sent')::boolean, false) THEN 'contacted'
    ELSE 'lead'
  END;
$function$;
