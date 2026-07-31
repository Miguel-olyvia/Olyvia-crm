-- Follow-up to 20261111260000_furthest_progress_stage_v2.sql.
--
-- That migration's compute_lead_furthest_progress_stage_v2 re-evaluates
-- CURRENT signals/status excluding rejection/lost stages -- but empirically
-- verified against live org Nike data, this does not solve the real bug:
-- Nike's stages (and, per stage_reached's own comments, most orgs' default
-- template stages) have reached_when = NULL and rely purely on
-- matching_statuses compared against the lead's CURRENT, single-valued
-- `status` column. The moment status flips to 'rejected', that column no
-- longer equals any earlier stage's matching_statuses, so there is no
-- present-tense signal left that can answer "what status was this lead in
-- right before it was rejected" -- that fact only ever existed in history.
--
-- Confirmed live (2026-07-31) against public.entity_audit_log for lead
-- 51501d34-ad2b-41b1-acd4-4286310388ee (org Nike,
-- b6ffce4f-f630-4933-833a-008649757a33): a plain PATCH of anew_leads.status
-- produces exactly the documented shape from
-- 20260625010000_entity_audit_log.sql / 20261009010000_..._add_record_id.sql:
--   table_name = 'anew_leads', operation = 'UPDATE',
--   changed_fields = {"status": {"old": "contacted", "new": "rejected"}}
-- (and, when workflow_stage_id is also touched by whatever wrote the status
-- change, changed_fields additionally contains
-- {"workflow_stage_id": {"old": <uuid>, "new": <uuid-or-null>}}).
--
-- This migration adds a new function that reads that real history instead of
-- re-deriving it from current state, and wires get_lead_resolved_stage to use
-- it only for the rejection/lost case (the non-lost case keeps
-- furthest_progress_stage_id = resolved_stage_id, which was already correct).
--
-- compute_lead_furthest_progress_stage_v2 (20261111260000) is left in place,
-- unused by get_lead_resolved_stage now, but harmless -- dropping it isn't
-- necessary and keeps this migration purely additive/forward-only.

-- ============================================================
-- get_lead_last_stage_before_terminal — resolves, from entity_audit_log, the
-- workflow stage the lead was actually in immediately before its most recent
-- status change (which, for a currently-rejected/lost lead, is the
-- transition INTO the terminal stage).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_lead_last_stage_before_terminal(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_org uuid;
  v_has_org_stages boolean;
  v_audit record;
  v_old_workflow_stage_id uuid;
  v_old_status text;
  v_stage_id uuid;
BEGIN
  SELECT entity_id, organization_id INTO v_entity_id, v_org
  FROM public.anew_leads
  WHERE id = p_lead_id;

  IF NOT FOUND OR v_entity_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT changed_fields
  INTO v_audit
  FROM public.entity_audit_log
  WHERE entity_id = v_entity_id
    AND table_name = 'anew_leads'
    AND operation = 'UPDATE'
    AND changed_fields ? 'status'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.lead_workflow_stages
    WHERE organization_id = v_org AND is_active = true
  ) INTO v_has_org_stages;

  -- Preferred path: the audit row's own workflow_stage_id.old, if it
  -- resolves to a real, still-active, non-terminal stage.
  BEGIN
    v_old_workflow_stage_id := NULLIF(v_audit.changed_fields->'workflow_stage_id'->>'old', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_old_workflow_stage_id := NULL;
  END;

  IF v_old_workflow_stage_id IS NOT NULL THEN
    SELECT lws.id INTO v_stage_id
    FROM public.lead_workflow_stages lws
    WHERE lws.id = v_old_workflow_stage_id
      AND lws.is_active = true
      AND COALESCE(lws.is_rejection, false) = false
      AND COALESCE(lws.counts_as_lost, false) = false
      AND (
        (v_has_org_stages AND lws.organization_id = v_org)
        OR (NOT v_has_org_stages AND lws.organization_id IS NULL)
      );

    IF v_stage_id IS NOT NULL THEN
      RETURN v_stage_id;
    END IF;
  END IF;

  -- Fallback: resolve the audit row's status.old text against
  -- matching_statuses, same org-stages-else-template fallback used
  -- elsewhere in this file (get_lead_resolved_stage's effective_stages CTE).
  v_old_status := v_audit.changed_fields->'status'->>'old';

  IF v_old_status IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT lws.id INTO v_stage_id
  FROM public.lead_workflow_stages lws
  WHERE lws.is_active = true
    AND COALESCE(lws.is_rejection, false) = false
    AND COALESCE(lws.counts_as_lost, false) = false
    AND lws.matching_statuses IS NOT NULL
    AND v_old_status = ANY(lws.matching_statuses)
    AND (
      (v_has_org_stages AND lws.organization_id = v_org)
      OR (NOT v_has_org_stages AND lws.organization_id IS NULL)
    )
  ORDER BY lws.stage_order DESC
  LIMIT 1;

  RETURN v_stage_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_lead_last_stage_before_terminal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lead_last_stage_before_terminal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_last_stage_before_terminal(uuid) TO service_role;

-- ============================================================
-- get_lead_resolved_stage — use the audit-log-based function for
-- furthest_progress_stage_id only when the resolved stage is itself
-- rejection/lost. Otherwise keep furthest_progress_stage_id =
-- resolved_stage_id (already correct: no history lookup needed when the
-- lead isn't in a terminal-lost state).
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
  v_resolved_is_terminal boolean;
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
      lws.counts_as_converted, lws.counts_as_lost, lws.is_rejection
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
      SELECT COALESCE(es.counts_as_lost, false) OR COALESCE(es.is_rejection, false)
      FROM effective_stages es
      WHERE es.id = v_resolved_stage_id
    )
  INTO v_stages, v_resolved_stage, v_resolved_is_terminal
  FROM effective_stages es;

  IF COALESCE(v_resolved_is_terminal, false) THEN
    v_furthest_progress_stage_id := public.get_lead_last_stage_before_terminal(p_lead_id);
  ELSE
    v_furthest_progress_stage_id := v_resolved_stage_id;
  END IF;

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
  INTO v_furthest_progress_stage
  FROM (
    SELECT lws.id, lws.label, lws.color, lws.stage_order, lws.qualification_hint,
      lws.counts_as_qualified, lws.counts_as_negotiation,
      lws.counts_as_converted, lws.counts_as_lost
    FROM public.lead_workflow_stages lws
    WHERE lws.id = v_furthest_progress_stage_id
  ) es;

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
-- 1. Non-rejected lead: furthest_progress_stage_id = resolved_stage_id
--    (unchanged behavior, no audit lookup performed).
-- 2. Lead PATCHed status='contacted' -> 'rejected': resolved_stage_id stays
--    the "Lost / Rejected" stage id; furthest_progress_stage_id now resolves
--    via get_lead_last_stage_before_terminal to the "Contacted" stage id
--    (confirmed live on lead 51501d34-ad2b-41b1-acd4-4286310388ee, org Nike,
--    during authoring of this migration).
-- 3. Multi-hop: contacted -> qualified -> rejected (3 real PATCHes, 3 audit
--    rows) -> furthest_progress_stage_id resolves to "Qualified" (the LAST
--    stage before the terminal transition), not "Contacted" -- proving the
--    "most recent status-change audit row" logic, not "first ever" logic.
-- 4. No audit row at all (lead created directly as rejected, or predates the
--    audit trigger) -> furthest_progress_stage_id is NULL, which is the
--    honest answer, not a guessed default.
