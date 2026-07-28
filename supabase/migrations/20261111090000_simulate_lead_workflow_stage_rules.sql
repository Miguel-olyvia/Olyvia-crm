-- Dry-run simulation for a single stage's rules while it is still being
-- edited in LeadWorkflowConfig.tsx's "Regras" tab (per-stage dialog), before
-- the user clicks "Guardar" (which persists via saveStages) or the outer
-- "Guardar & Recalcular" (recompute_leads_v2_buckets).
--
-- Unlike simulate_lead_v2_bucket_changes (20261110540000 / redefined in
-- 20261110570000), which replays an entire *proposed* stage array, this RPC
-- takes only the ONE stage currently open in the edit dialog and substitutes
-- its proposed field values into the org's real, currently-stored stage set
-- (or the template set, same fallback compute_lead_stage_v2 uses) — every
-- other stage keeps its stored rules untouched. This lets the UI preview the
-- effect of editing a single stage without needing to serialize the whole
-- stage list on every keystroke.
--
-- Read-only: STABLE, no INSERT/UPDATE/DELETE anywhere in this function.
--
-- Note: p_auto_advance and p_qualification_hint are accepted for API
-- completeness (they are real columns on lead_workflow_stages and the caller
-- naturally has them in the edited-but-unsaved form state) but do NOT affect
-- stage resolution — stage_reached()/compute_lead_stage_v2() never read
-- auto_advance or qualification_hint (confirmed against
-- 20261110510000_lead_v2_stage_resolution_engine.sql and
-- 20261110600000_trim_condition_catalog_to_12.sql). They are accepted, not
-- silently dropped, so the RPC signature matches the full edit-form shape.

CREATE OR REPLACE FUNCTION public.simulate_lead_workflow_stage_rules(
  p_org_id uuid,
  p_stage_id uuid,
  p_matching_statuses text[],
  p_reached_when jsonb,
  p_auto_advance boolean,
  p_qualification_hint text,
  p_counts_as_converted boolean,
  p_counts_as_lost boolean,
  p_counts_as_qualified boolean,
  p_counts_as_negotiation boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_authorized boolean;
  v_stage_org uuid;
  v_stage_active boolean;
  v_result jsonb;
BEGIN
  -- Org-scope check, same pattern as simulate_lead_v2_bucket_changes
  -- (20261110570000): never allow simulating for an org the caller cannot
  -- access.
  SELECT p_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RAISE EXCEPTION 'not authorized for organization %', p_org_id;
  END IF;

  SELECT organization_id, is_active
  INTO v_stage_org, v_stage_active
  FROM public.lead_workflow_stages
  WHERE id = p_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stage % not found', p_stage_id;
  END IF;

  -- The stage being edited must belong to this org, or be a shared
  -- organization_id IS NULL template stage (only reachable by an org that
  -- has no active stages of its own — same fallback compute_lead_stage_v2
  -- applies below).
  IF v_stage_org IS NOT NULL AND v_stage_org <> p_org_id THEN
    RAISE EXCEPTION 'stage % does not belong to organization %', p_stage_id, p_org_id;
  END IF;

  WITH v_has_org_stages AS (
    SELECT EXISTS (
      SELECT 1 FROM public.lead_workflow_stages
      WHERE organization_id = p_org_id AND is_active = true
    ) AS val
  ),
  base_stages AS (
    SELECT lws.id, lws.stage_order, lws.reached_when, lws.matching_statuses,
      lws.counts_as_qualified, lws.counts_as_negotiation,
      lws.counts_as_converted, lws.counts_as_lost
    FROM public.lead_workflow_stages lws
    CROSS JOIN v_has_org_stages h
    WHERE lws.is_active = true
      AND (
        (h.val AND lws.organization_id = p_org_id)
        OR (NOT h.val AND lws.organization_id IS NULL)
      )
  ),
  -- Same stage set as "before", but with p_stage_id's rule fields replaced
  -- by the proposed (unsaved) values. If p_stage_id is not part of the set
  -- actually in effect for this org (e.g. edited stage is inactive, or the
  -- org fell back to templates while editing one of its own inactive
  -- stages), proposed_stages is identical to base_stages and before/after
  -- totals will simply match — a safe no-op rather than an error.
  proposed_stages AS (
    SELECT
      bs.id,
      bs.stage_order,
      CASE WHEN bs.id = p_stage_id THEN p_reached_when ELSE bs.reached_when END AS reached_when,
      CASE WHEN bs.id = p_stage_id THEN p_matching_statuses ELSE bs.matching_statuses END AS matching_statuses,
      CASE WHEN bs.id = p_stage_id THEN p_counts_as_qualified ELSE bs.counts_as_qualified END AS counts_as_qualified,
      CASE WHEN bs.id = p_stage_id THEN p_counts_as_negotiation ELSE bs.counts_as_negotiation END AS counts_as_negotiation,
      CASE WHEN bs.id = p_stage_id THEN p_counts_as_converted ELSE bs.counts_as_converted END AS counts_as_converted,
      CASE WHEN bs.id = p_stage_id THEN p_counts_as_lost ELSE bs.counts_as_lost END AS counts_as_lost
    FROM base_stages bs
  ),
  org_leads AS (
    SELECT id AS lead_id, status
    FROM public.anew_leads
    WHERE organization_id = p_org_id AND deleted_at IS NULL
  ),
  lead_signals AS (
    SELECT ol.lead_id, public.evaluate_lead_signals_v2(ol.lead_id) AS signals
    FROM org_leads ol
  ),
  -- "Before" uses the real, currently-stored resolution engine untouched.
  before_resolved AS (
    SELECT ol.lead_id, public.compute_lead_stage_v2(ol.lead_id) AS stage_id
    FROM org_leads ol
  ),
  before_bucketed AS (
    SELECT br.lead_id, br.stage_id,
      public.resolve_stage_bucket(br.stage_id) AS bucket
    FROM before_resolved br
  ),
  -- "After" mirrors compute_lead_stage_v2's own loop (highest stage_order
  -- match wins) but against proposed_stages instead of the stored rows.
  after_matches AS (
    SELECT DISTINCT ON (ol.lead_id)
      ol.lead_id,
      ps.id AS stage_id,
      ps.counts_as_qualified, ps.counts_as_negotiation,
      ps.counts_as_converted, ps.counts_as_lost
    FROM org_leads ol
    JOIN lead_signals ls ON ls.lead_id = ol.lead_id
    JOIN proposed_stages ps
      ON public.stage_reached(ls.signals, ps.reached_when, ol.status, ps.matching_statuses)
    ORDER BY ol.lead_id, ps.stage_order DESC
  ),
  after_bucketed AS (
    SELECT ol.lead_id, am.stage_id,
      CASE
        WHEN am.counts_as_lost THEN 'lost'
        WHEN am.counts_as_converted THEN 'converted'
        WHEN am.counts_as_negotiation THEN 'negotiation'
        WHEN am.counts_as_qualified THEN 'qualified'
        ELSE NULL
      END AS bucket
    FROM org_leads ol
    LEFT JOIN after_matches am ON am.lead_id = ol.lead_id
  ),
  combined AS (
    SELECT
      bb.lead_id,
      bb.bucket AS before_bucket,
      ab.bucket AS after_bucket,
      (bb.stage_id = p_stage_id) AS matched_stage_before,
      (ab.stage_id = p_stage_id) AS matched_stage_after
    FROM before_bucketed bb
    JOIN after_bucketed ab ON ab.lead_id = bb.lead_id
  ),
  before_totals AS (
    SELECT jsonb_build_object(
      'qualified', COUNT(*) FILTER (WHERE before_bucket = 'qualified')::bigint,
      'negotiation', COUNT(*) FILTER (WHERE before_bucket = 'negotiation')::bigint,
      'converted', COUNT(*) FILTER (WHERE before_bucket = 'converted')::bigint,
      'lost', COUNT(*) FILTER (WHERE before_bucket = 'lost')::bigint
    ) AS value
    FROM combined
  ),
  after_totals AS (
    SELECT jsonb_build_object(
      'qualified', COUNT(*) FILTER (WHERE after_bucket = 'qualified')::bigint,
      'negotiation', COUNT(*) FILTER (WHERE after_bucket = 'negotiation')::bigint,
      'converted', COUNT(*) FILTER (WHERE after_bucket = 'converted')::bigint,
      'lost', COUNT(*) FILTER (WHERE after_bucket = 'lost')::bigint
    ) AS value
    FROM combined
  )
  SELECT jsonb_build_object(
    'total_leads', (SELECT COUNT(*) FROM combined),
    'stage_match_count_before', (SELECT COUNT(*) FROM combined WHERE matched_stage_before),
    'stage_match_count_after', (SELECT COUNT(*) FROM combined WHERE matched_stage_after),
    'before_totals', bt.value,
    'after_totals', at.value
  )
  INTO v_result
  FROM before_totals bt
  CROSS JOIN after_totals at;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.simulate_lead_workflow_stage_rules(
  uuid, uuid, text[], jsonb, boolean, text, boolean, boolean, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simulate_lead_workflow_stage_rules(
  uuid, uuid, text[], jsonb, boolean, text, boolean, boolean, boolean, boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_lead_workflow_stage_rules(
  uuid, uuid, text[], jsonb, boolean, text, boolean, boolean, boolean, boolean
) TO service_role;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Pick a real org + a real stage id belonging to it. Call with the
--    stage's own current values unchanged -> stage_match_count_before must
--    equal stage_match_count_after, and before_totals must equal
--    after_totals exactly (pure no-op check).
-- 2. Call with matching_statuses/reached_when broadened (e.g. add a status)
--    -> stage_match_count_after should increase, and the bucket this stage
--    counts_as should show a corresponding total change if it differs from
--    what the lead previously resolved to.
-- 3. Call with an org_id the current auth.uid() does not belong to ->
--    expect the "not authorized" exception.
-- 4. Call with a stage_id from a different organization -> expect the
--    "does not belong to organization" exception.
