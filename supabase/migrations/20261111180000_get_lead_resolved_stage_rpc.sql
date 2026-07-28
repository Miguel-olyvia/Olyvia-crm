-- get_lead_resolved_stage — single-lead resolved stage + full org stage list,
-- for rendering a stage stepper on a lead's detail page.
--
-- Why a new RPC instead of reusing compute_lead_stage_v2 directly from the
-- frontend: compute_lead_stage_v2(p_lead_id) (20261110510000) only returns
-- the resolved stage_id. Nothing currently combines that with the org's full
-- ordered lead_workflow_stages list (org-specific if the org has any active
-- rows, else the organization_id IS NULL template rows — the exact fallback
-- compute_lead_stage_v2 itself uses) into one payload a stepper component can
-- render in a single round trip.
--
-- Org-visibility check: compute_lead_stage_v2 is SECURITY DEFINER and does
-- NOT check auth.uid() scope internally (confirmed by reading
-- 20261110510000_lead_v2_stage_resolution_engine.sql:99-144 — it only does
-- `SELECT organization_id, status INTO v_org, v_status FROM anew_leads WHERE
-- id = p_lead_id`, no visibility filter). Its only current callers
-- (get_lead_dashboard_stats_scoped, simulate_lead_workflow_stage_rules) are
-- themselves already org-scoped before they ever call it — the org check
-- happens one layer up, not inside compute_lead_stage_v2. This new RPC is
-- different: it is called directly from the frontend with an arbitrary
-- p_lead_id and no org parameter, so the org-visibility check has to live
-- here. We use the same public.get_user_visible_org_ids(auth.uid()) pattern
-- already used for org-level checks elsewhere (e.g.
-- simulate_lead_workflow_stage_rules, 20261111090000:52), applied to the
-- lead's own organization_id instead of a caller-supplied org id.

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
    )
  INTO v_stages, v_resolved_stage
  FROM effective_stages es;

  RETURN jsonb_build_object(
    'resolved_stage_id', v_resolved_stage_id,
    'resolved_stage', v_resolved_stage,
    'stages', COALESCE(v_stages, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_lead_resolved_stage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lead_resolved_stage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_resolved_stage(uuid) TO service_role;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Call get_lead_resolved_stage for a real lead in an org whose caller can
--    see it (e.g. lead 76cc1f7e-996c-47a3-b54e-5b5beb8c8c74, org Nike
--    b6ffce4f-f630-4933-833a-008649757a33, confirmed live via REST during
--    authoring of this migration) -> expect resolved_stage_id to equal
--    compute_lead_stage_v2(lead_id), resolved_stage to be the matching entry
--    from stages (or null if compute_lead_stage_v2 returned null), and
--    stages to list every active stage for that org (or the template set if
--    the org has none), ordered by stage_order ASC.
-- 2. Call with a lead id that does not exist -> expect the "lead % not
--    found" exception.
-- 3. Call as a user whose visible orgs do not include the lead's
--    organization_id -> expect the "not authorized for organization %"
--    exception.
-- 4. Compare 'stages' against a direct SELECT on lead_workflow_stages using
--    the same org-stages-else-template fallback to confirm the set and order
--    match exactly.
