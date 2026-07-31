-- Purely additive fix for the lead-journey stepper bug: when a lead is
-- rejected/lost, compute_lead_stage_v2 (20261110510000:99-144) correctly
-- resolves resolved_stage_id to the rejection stage (highest stage_order by
-- design), but both stepper UIs were using stage_order <= resolved.stage_order
-- as a naive "reached" threshold, which incorrectly marks every earlier
-- stage (including ones the lead never passed, e.g. qualified/proposal/
-- negotiation/converted) as reached for a lead rejected right after
-- "contacted".
--
-- Fix strategy (frontend work done separately): expose a second signal,
-- furthest_progress_stage_id, which is the furthest-order stage on the
-- genuine positive path (excluding is_rejection/counts_as_lost stages
-- entirely from candidacy) that the lead's real signals currently satisfy.
-- The stepper can then fill up to furthest_progress_stage_id and separately
-- flag the terminal rejection stage, instead of filling everything below
-- resolved_stage_id.
--
-- compute_lead_stage_v2 itself is NOT touched: it has other real callers
-- (get_lead_dashboard_stats_scoped, simulate_lead_workflow_stage_rules, a
-- nightly recompute job) that depend on resolved_stage_id staying literally
-- the rejection stage for bucketing a lost lead. This migration only adds a
-- new function and extends get_lead_resolved_stage's jsonb payload with two
-- new keys; existing keys (resolved_stage_id, resolved_stage, stages) are
-- unchanged, so no existing frontend caller can regress.

-- ============================================================
-- compute_lead_furthest_progress_stage_v2 — near-copy of
-- compute_lead_stage_v2's loop (20261110510000:99-144), reusing
-- evaluate_lead_signals_v2 and stage_reached exactly as-is, but excluding
-- is_rejection / counts_as_lost stages from candidacy.
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_lead_furthest_progress_stage_v2(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_status text;
  v_signals jsonb;
  v_has_org_stages boolean;
  v_stage record;
BEGIN
  SELECT organization_id, status INTO v_org, v_status
  FROM public.anew_leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_signals := public.evaluate_lead_signals_v2(p_lead_id);

  SELECT EXISTS (
    SELECT 1 FROM public.lead_workflow_stages
    WHERE organization_id = v_org AND is_active = true
  ) INTO v_has_org_stages;

  FOR v_stage IN
    SELECT id, reached_when, matching_statuses
    FROM public.lead_workflow_stages
    WHERE is_active = true
      AND COALESCE(is_rejection, false) = false
      AND COALESCE(counts_as_lost, false) = false
      AND (
        (v_has_org_stages AND organization_id = v_org)
        OR (NOT v_has_org_stages AND organization_id IS NULL)
      )
    ORDER BY stage_order DESC
  LOOP
    IF public.stage_reached(v_signals, v_stage.reached_when, v_status, v_stage.matching_statuses) THEN
      RETURN v_stage.id;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.compute_lead_furthest_progress_stage_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_lead_furthest_progress_stage_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_lead_furthest_progress_stage_v2(uuid) TO service_role;
-- ============================================================
-- get_lead_resolved_stage — additive extension only. Adds
-- furthest_progress_stage_id / furthest_progress_stage alongside the
-- existing resolved_stage_id / resolved_stage / stages keys, which are left
-- byte-for-byte identical in shape and computation.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_lead_resolved_stage(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_authorized boolean;
  v_resolved_stage_id uuid;
  v_resolved_stage jsonb;
  v_furthest_progress_stage_id uuid;
  v_furthest_progress_stage jsonb;
  v_stages jsonb;
BEGIN
  SELECT organization_id
  INTO v_org
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

  v_resolved_stage_id := public.compute_lead_stage_v2(p_lead_id);
  v_furthest_progress_stage_id := public.compute_lead_furthest_progress_stage_v2(p_lead_id);

  -- Same org-stages-else-template fallback as compute_lead_stage_v2
  -- (20261110510000:122-134): the org's own active stages if it has any,
  -- otherwise the shared organization_id IS NULL template stages.
  WITH v_has_org_stages AS (
    SELECT EXISTS (
      SELECT 1 FROM public.lead_workflow_stages
      WHERE organization_id = v_org AND is_active = true
    ) AS val
  ),
  effective_stages AS (
    SELECT lws.id, lws.label, lws.color, lws.stage_order, lws.qualification_hint,
      lws.counts_as_qualified, lws.counts_as_negotiation,
      lws.counts_as_converted, lws.counts_as_lost
    FROM public.lead_workflow_stages lws
    CROSS JOIN v_has_org_stages h
    WHERE lws.is_active = true
      AND (
        (h.val AND lws.organization_id = v_org)
        OR (NOT h.val AND lws.organization_id IS NULL)
      )
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', es.id,
          'label', es.label,
          'color', es.color,
          'stage_order', es.stage_order,
          'qualification_hint', es.qualification_hint,
          'counts_as_qualified', es.counts_as_qualified,
          'counts_as_negotiation', es.counts_as_negotiation,
          'counts_as_converted', es.counts_as_converted,
          'counts_as_lost', es.counts_as_lost
        )
        ORDER BY es.stage_order ASC
      ),
      '[]'::jsonb
    ),
    (
      SELECT jsonb_build_object(
        'id', es.id,
        'label', es.label,
        'color', es.color,
        'stage_order', es.stage_order,
        'qualification_hint', es.qualification_hint,
        'counts_as_qualified', es.counts_as_qualified,
        'counts_as_negotiation', es.counts_as_negotiation,
        'counts_as_converted', es.counts_as_converted,
        'counts_as_lost', es.counts_as_lost
      )
      FROM effective_stages es
      WHERE es.id = v_resolved_stage_id
    ),
    (
      SELECT jsonb_build_object(
        'id', es.id,
        'label', es.label,
        'color', es.color,
        'stage_order', es.stage_order,
        'qualification_hint', es.qualification_hint,
        'counts_as_qualified', es.counts_as_qualified,
        'counts_as_negotiation', es.counts_as_negotiation,
        'counts_as_converted', es.counts_as_converted,
        'counts_as_lost', es.counts_as_lost
      )
      FROM effective_stages es
      WHERE es.id = v_furthest_progress_stage_id
    )
  INTO v_stages, v_resolved_stage, v_furthest_progress_stage
  FROM effective_stages es;

  RETURN jsonb_build_object(
    'resolved_stage_id', v_resolved_stage_id,
    'resolved_stage', v_resolved_stage,
    'stages', COALESCE(v_stages, '[]'::jsonb),
    'furthest_progress_stage_id', v_furthest_progress_stage_id,
    'furthest_progress_stage', v_furthest_progress_stage
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_lead_resolved_stage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lead_resolved_stage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_resolved_stage(uuid) TO service_role;
-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. For a lead not currently rejected, furthest_progress_stage_id should
--    normally equal resolved_stage_id (same signals, same stage_reached
--    logic, just excluding rejection/lost candidates which weren't going to
--    win anyway for a non-rejected lead).
-- 2. For a lead with status='rejected' (or any is_rejection/counts_as_lost
--    stage as its resolved stage), resolved_stage_id should remain the
--    rejection stage (unchanged from before this migration), while
--    furthest_progress_stage_id should be the highest-order non-rejection
--    stage whose reached_when/matching_statuses still evaluate true against
--    the lead's persisted signals (e.g. "contacted" for a lead that never
--    got further before being rejected) -- confirmed live against org Nike
--    (b6ffce4f-f630-4933-833a-008649757a33) during authoring of this
--    migration.
-- 3. furthest_progress_stage_id can legitimately be NULL (lead still at the
--    very first stage, no other stage's conditions met) -- not an error.;
