-- Follow-up to 20261111390000_lead_journey_stage_rpc.sql.
--
-- That migration's journey_bucket_for_status matched hardcoded literal
-- status strings ('proposal', 'negotiation', ...). But lead_workflow_stages
-- is fully dynamic per organization -- stages (and which literal statuses
-- they match, via matching_statuses) can be freely created/deleted per org
-- (LeadWorkflowConfig.tsx). Hardcoding literal status text is therefore
-- wrong: an org that renames/removes a stage, or whose lead never passed
-- through a stage with that literal status, silently falls through to the
-- lowest bucket even when clearly past it operationally (verified live: a
-- lead with status 'proposal' but no currently-active proposal row fell all
-- the way back to 'Lead').
--
-- Fix: resolve the bucket from the lead's already-computed CURRENT workflow
-- stage (compute_lead_stage_v2 -- the same org-aware, reached_when/
-- matching_statuses-driven resolution already used by the Funil) and that
-- stage's semantic flags (counts_as_qualified/counts_as_negotiation/
-- counts_as_converted/is_rejection/counts_as_lost), which are configurable
-- per stage regardless of its name or literal status. No literal status
-- strings are compared anywhere in this migration.

DROP FUNCTION IF EXISTS public.journey_bucket_for_status(text, jsonb);

-- ============================================================
-- journey_bucket_for_stage — maps a workflow stage's semantic flags (plus
-- the lead's signals, for the visita-confirmada/proposta-em-curso gating
-- requested) to one of the 5 fixed Percurso buckets.
-- ============================================================
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
      AND COALESCE((p_signals->>'has_active_proposal')::boolean, false) THEN 'negotiation'
    WHEN COALESCE(p_counts_as_qualified, false)
      OR COALESCE((p_signals->>'has_visit_done')::boolean, false)
      OR COALESCE((p_signals->>'has_qualification_sql')::boolean, false) THEN 'qualified'
    WHEN COALESCE((p_signals->>'has_contact_logged')::boolean, false)
      OR COALESCE((p_signals->>'has_call_answered')::boolean, false)
      OR COALESCE((p_signals->>'has_email_sent')::boolean, false) THEN 'contacted'
    ELSE 'lead'
  END;
$function$;
REVOKE ALL ON FUNCTION public.journey_bucket_for_stage(boolean, boolean, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.journey_bucket_for_stage(boolean, boolean, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.journey_bucket_for_stage(boolean, boolean, boolean, jsonb) TO service_role;

-- ============================================================
-- get_lead_journey_stage — same 5-stage Percurso response shape as before,
-- now resolved via compute_lead_stage_v2 + stage flags instead of literal
-- status text.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_lead_journey_stage(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_authorized boolean;
  v_signals jsonb;
  v_resolved_stage_id uuid;
  v_resolved_stage record;
  v_is_lost boolean;
  v_resolved_key text;
  v_furthest_key text;
  v_furthest_stage_id uuid;
  v_furthest_stage record;
  v_stages jsonb;
BEGIN
  SELECT organization_id INTO v_org
  FROM public.anew_leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead % not found', p_lead_id;
  END IF;

  SELECT v_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RAISE EXCEPTION 'not authorized for organization %', v_org;
  END IF;

  v_signals := public.evaluate_lead_signals_v2(p_lead_id);
  v_resolved_stage_id := public.compute_lead_stage_v2(p_lead_id);

  SELECT counts_as_converted, counts_as_negotiation, counts_as_qualified,
         (COALESCE(counts_as_lost, false) OR COALESCE(is_rejection, false)) AS is_lost
  INTO v_resolved_stage
  FROM public.lead_workflow_stages
  WHERE id = v_resolved_stage_id;

  v_is_lost := COALESCE(v_resolved_stage.is_lost, false);

  IF v_is_lost THEN
    v_resolved_key := NULL;
    v_furthest_stage_id := public.get_lead_last_stage_before_terminal(p_lead_id);
    IF v_furthest_stage_id IS NOT NULL THEN
      SELECT counts_as_converted, counts_as_negotiation, counts_as_qualified
      INTO v_furthest_stage
      FROM public.lead_workflow_stages
      WHERE id = v_furthest_stage_id;

      v_furthest_key := public.journey_bucket_for_stage(
        v_furthest_stage.counts_as_converted,
        v_furthest_stage.counts_as_negotiation,
        v_furthest_stage.counts_as_qualified,
        v_signals
      );
    ELSE
      v_furthest_key := NULL;
    END IF;
  ELSE
    v_resolved_key := public.journey_bucket_for_stage(
      v_resolved_stage.counts_as_converted,
      v_resolved_stage.counts_as_negotiation,
      v_resolved_stage.counts_as_qualified,
      v_signals
    );
    v_furthest_key := v_resolved_key;
  END IF;

  WITH catalog(key, label, stage_order, counts_as_qualified, counts_as_negotiation, counts_as_converted) AS (
    VALUES
      ('lead', 'Lead', 1, false, false, false),
      ('contacted', 'Contactado', 2, false, false, false),
      ('qualified', 'Qualificado', 3, true, false, false),
      ('negotiation', 'Negociação', 4, false, true, false),
      ('client', 'Cliente', 5, false, false, true)
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.key,
      'label', c.label,
      'color', NULL,
      'stage_order', c.stage_order,
      'qualification_hint', 'none',
      'counts_as_qualified', c.counts_as_qualified,
      'counts_as_negotiation', c.counts_as_negotiation,
      'counts_as_converted', c.counts_as_converted,
      'counts_as_lost', false
    ) ORDER BY c.stage_order
  )
  INTO v_stages
  FROM catalog c;

  RETURN jsonb_build_object(
    'resolved_stage_id', v_resolved_key,
    'resolved_stage', (SELECT s FROM jsonb_array_elements(v_stages) s WHERE s->>'id' = v_resolved_key LIMIT 1),
    'stages', COALESCE(v_stages, '[]'::jsonb),
    'is_lost', v_is_lost,
    'furthest_progress_stage_id', v_furthest_key,
    'furthest_progress_stage', (SELECT s FROM jsonb_array_elements(v_stages) s WHERE s->>'id' = v_furthest_key LIMIT 1)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_lead_journey_stage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lead_journey_stage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_journey_stage(uuid) TO service_role;
