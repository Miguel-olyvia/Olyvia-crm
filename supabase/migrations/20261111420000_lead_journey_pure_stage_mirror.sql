-- Follow-up to 20261111410000_lead_journey_negotiation_or_signal.sql.
--
-- That migration's OR-with-has_active_proposal fixed one live case (a lead
-- resolved to "Negotiation" per the org's own rules but with no proposal row
-- showed stuck at "Lead") but immediately created the opposite case: a lead
-- resolved to "Contacted" by compute_lead_stage_v2 (the org's own rules) but
-- with a leftover active proposal row now jumps the Percurso straight to
-- "Negociacao" even though the Funil itself still says "Contacted".
-- Confirmed live: lead 708292f0-4d16-4676-8256-7ad5ea83ca63 (org
-- Gromicho.lda) -- compute_lead_stage_v2 resolves it to "Contacted"
-- (counts_as_qualified/negotiation/converted all false), but
-- has_active_proposal = true, so the OR-signal alone pushed it to
-- 'negotiation'.
--
-- Root cause, in both directions: journey_bucket_for_stage kept its own
-- independent DB signals (has_visit_done/has_qualification_sql/
-- has_active_proposal/has_contact_logged/...) running in parallel to the
-- org's configured stage rules, instead of trusting ONLY the stage that
-- compute_lead_stage_v2 (which already fully evaluates reached_when /
-- matching_statuses exactly as configured in the Workflow screen) resolved.
-- Whatever "visita confirmada"/"proposta em curso" gating an organization
-- wants belongs in that stage's own reached_when rule (the condition
-- catalog already supports has_visit_done/has_active_proposal/etc for
-- exactly this), not duplicated here.
--
-- Fix: get_lead_journey_stage becomes a pure, signal-free mirror of the
-- already-resolved stage's own flags. The one piece that isn't a boolean
-- flag on lead_workflow_stages -- telling "Lead" apart from "Contactado" --
-- is derived structurally from stage_order (is this the org's lowest-order
-- active stage?), not from any independent business signal.

DROP FUNCTION IF EXISTS public.journey_bucket_for_stage(boolean, boolean, boolean, jsonb);

-- ============================================================
-- journey_bucket_for_stage — pure mapping from a stage's own flags (plus
-- whether it's the org's initial stage, for the Lead/Contactado split) to
-- one of the 5 fixed Percurso buckets. No independent signals of any kind.
-- ============================================================
CREATE OR REPLACE FUNCTION public.journey_bucket_for_stage(
  p_counts_as_converted boolean,
  p_counts_as_negotiation boolean,
  p_counts_as_qualified boolean,
  p_is_initial_stage boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN COALESCE(p_counts_as_converted, false) THEN 'client'
    WHEN COALESCE(p_counts_as_negotiation, false) THEN 'negotiation'
    WHEN COALESCE(p_counts_as_qualified, false) THEN 'qualified'
    WHEN COALESCE(p_is_initial_stage, false) THEN 'lead'
    ELSE 'contacted'
  END;
$function$;
REVOKE ALL ON FUNCTION public.journey_bucket_for_stage(boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.journey_bucket_for_stage(boolean, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.journey_bucket_for_stage(boolean, boolean, boolean, boolean) TO service_role;

-- ============================================================
-- get_lead_journey_stage — same 5-stage Percurso response shape as before,
-- now a pure mirror of compute_lead_stage_v2's resolved stage (and, for the
-- furthest-before-terminal case, get_lead_last_stage_before_terminal's
-- resolved stage). No evaluate_lead_signals_v2 call anymore -- the bucket
-- depends only on stage flags and stage_order, both fully governed by the
-- org's own Workflow configuration.
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
  v_has_org_stages boolean;
  v_min_stage_order int;
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

  SELECT EXISTS (
    SELECT 1 FROM public.lead_workflow_stages
    WHERE organization_id = v_org AND is_active = true
  ) INTO v_has_org_stages;

  SELECT MIN(stage_order) INTO v_min_stage_order
  FROM public.lead_workflow_stages lws
  WHERE lws.is_active = true
    AND (
      (v_has_org_stages AND lws.organization_id = v_org)
      OR (NOT v_has_org_stages AND lws.organization_id IS NULL)
    );

  v_resolved_stage_id := public.compute_lead_stage_v2(p_lead_id);

  SELECT counts_as_converted, counts_as_negotiation, counts_as_qualified, stage_order,
         (COALESCE(counts_as_lost, false) OR COALESCE(is_rejection, false)) AS is_lost
  INTO v_resolved_stage
  FROM public.lead_workflow_stages
  WHERE id = v_resolved_stage_id;

  v_is_lost := COALESCE(v_resolved_stage.is_lost, false);

  IF v_is_lost THEN
    v_resolved_key := NULL;
    v_furthest_stage_id := public.get_lead_last_stage_before_terminal(p_lead_id);
    IF v_furthest_stage_id IS NOT NULL THEN
      SELECT counts_as_converted, counts_as_negotiation, counts_as_qualified, stage_order
      INTO v_furthest_stage
      FROM public.lead_workflow_stages
      WHERE id = v_furthest_stage_id;

      v_furthest_key := public.journey_bucket_for_stage(
        v_furthest_stage.counts_as_converted,
        v_furthest_stage.counts_as_negotiation,
        v_furthest_stage.counts_as_qualified,
        v_furthest_stage.stage_order <= v_min_stage_order
      );
    ELSE
      v_furthest_key := NULL;
    END IF;
  ELSE
    v_resolved_key := public.journey_bucket_for_stage(
      v_resolved_stage.counts_as_converted,
      v_resolved_stage.counts_as_negotiation,
      v_resolved_stage.counts_as_qualified,
      v_resolved_stage.stage_order <= v_min_stage_order
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
