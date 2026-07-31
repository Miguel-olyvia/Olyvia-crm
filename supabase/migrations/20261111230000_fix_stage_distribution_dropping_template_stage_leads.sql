-- get_lead_dashboard_stats_scoped: fix stage_distribution silently dropping
-- leads whose resolved stage is the shared TEMPLATE stage set rather than
-- the dashboard org's own custom stages.
-- ============================================================
-- Confirmed live (org Nike, b6ffce4f-f630-4933-833a-008649757a33): with
-- p_is_root=true / p_scope='ORG', 'resolved_stage_counts.qualified' = 13 but
-- the sum of "Qualified"-bucketed rows in 'stage_distribution' = 12 -- one
-- lead was invisible in the funnel breakdown despite being correctly counted
-- in the bucket totals.
--
-- Root cause: the two "current pipeline" computations in this function
-- (current def: 20261111210000_lead_dashboard_unscope_pipeline_snapshot.sql)
-- used two DIFFERENT, inconsistent rules for which stage set a lead can
-- resolve against:
--
--   - snapshot_resolved_stage_join / _counts (the qualified/negotiation/
--     converted/lost buckets) call compute_lead_stage_v2(lead_id), which
--     resolves EACH LEAD against ITS OWN organization_id's active
--     lead_workflow_stages if that org has any, else falls back to the
--     shared TEMPLATE set (lead_workflow_stages.organization_id IS NULL).
--     (20261110510000_lead_v2_stage_resolution_engine.sql:112-134)
--
--   - stage_distribution's `current_org_stages` CTE only selected
--     lead_workflow_stages WHERE organization_id = p_org_id (the org passed
--     to the dashboard, e.g. Nike's own stages) -- it did NOT include the
--     template stage set, and did not account for leads belonging to CHILD
--     organizations (pulled in via p_is_root=true / resolve_lead_access_
--     context) that have no custom stages of their own and therefore
--     resolve to a TEMPLATE stage id via compute_lead_stage_v2. Because
--     `snapshot_stage_distribution` LEFT JOINed FROM `current_org_stages`,
--     any lead whose resolved_stage_id was a template-stage id (absent from
--     `current_org_stages`, which only lists Nike's own stages) had no
--     matching row and was silently dropped from the distribution entirely,
--     while still being correctly counted in resolved_stage_counts.
--
-- Fix: stop building the stage list from a single org-scoped CTE and then
-- LEFT JOINing FROM it. Instead, group `snapshot_resolved_stage_join`
-- (the same per-lead resolved-stage-id computation resolved_stage_counts
-- already relies on) directly by resolved_stage_id -- this can never drop a
-- row, since every lead in the snapshot contributes its own resolved stage
-- id (or NULL, unchanged from before: a NULL resolved_stage_id still can't
-- join to any real stage and is excluded from the funnel, exactly as
-- before). Then join to lead_workflow_stages BY ID, regardless of org, to
-- fetch each stage's label/stage_order for display -- a resolved_stage_id
-- is always a real row in that table, whether it belongs to the dashboard
-- org's own custom stages or the template set inherited by a child org's
-- fallback. The `current_org_stages` CTE is no longer needed and is
-- removed; every other CTE, key, filter, and behavior in this function is
-- unchanged.
--
-- No signature change, no return-key change, no other computation changed.
-- CREATE OR REPLACE only, identical parameter list to the previous
-- definition (20261111210000_lead_dashboard_unscope_pipeline_snapshot.sql).

CREATE OR REPLACE FUNCTION public.get_lead_dashboard_stats_scoped(p_org_id uuid, p_is_root boolean DEFAULT false, p_scope text DEFAULT 'ORG'::text, p_anew_user_id uuid DEFAULT NULL::uuid, p_auth_user_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_assigned_to uuid DEFAULT NULL::uuid, p_assigned_unassigned boolean DEFAULT false, p_contact_result text DEFAULT NULL::text, p_contact_result_none boolean DEFAULT false, p_source text DEFAULT NULL::text, p_source_is_null boolean DEFAULT false, p_search text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_compare_previous boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx RECORD;
  v_previous_from timestamp with time zone;
  v_previous_to timestamp with time zone;
  v_current jsonb;
  v_previous jsonb;
BEGIN
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_to < p_date_from THEN
    RAISE EXCEPTION 'invalid date range';
  END IF;

  SELECT *
  INTO v_ctx
  FROM public.resolve_lead_access_context(p_org_id, p_scope, 'leads.view');

  IF p_compare_previous AND p_date_from IS NOT NULL AND p_date_to IS NOT NULL THEN
    v_previous_to := p_date_from - interval '1 second';
    v_previous_from := v_previous_to - (p_date_to - p_date_from);
  END IF;

  WITH current_rows AS (
    SELECT *
    FROM public.get_scoped_leads_base(
      p_org_id => p_org_id,
      p_is_root => p_is_root,
      p_scope => p_scope,
      p_status => p_status,
      p_campaign_id => p_campaign_id,
      p_assigned_to => p_assigned_to,
      p_assigned_unassigned => p_assigned_unassigned,
      p_contact_result => p_contact_result,
      p_contact_result_none => p_contact_result_none,
      p_source => p_source,
      p_source_is_null => p_source_is_null,
      p_search => p_search,
      p_date_from => p_date_from,
      p_date_to => p_date_to
    )
  ),
  -- ── unscoped "current state" snapshot ──────────────────────────────
  snapshot_rows AS (
    SELECT *
    FROM public.get_scoped_leads_base(
      p_org_id => p_org_id,
      p_is_root => p_is_root,
      p_scope => p_scope,
      p_status => p_status,
      p_campaign_id => p_campaign_id,
      p_assigned_to => p_assigned_to,
      p_assigned_unassigned => p_assigned_unassigned,
      p_contact_result => p_contact_result,
      p_contact_result_none => p_contact_result_none,
      p_source => p_source,
      p_source_is_null => p_source_is_null,
      p_search => p_search,
      p_date_from => NULL,
      p_date_to => NULL
    )
  ),
  current_summary AS (
    SELECT
      COUNT(*)::bigint AS leads_in_period,
      COUNT(*) FILTER (
        WHERE (created_at AT TIME ZONE 'Europe/Lisbon')::date = (now() AT TIME ZONE 'Europe/Lisbon')::date
      )::bigint AS leads_today,
      COUNT(*) FILTER (WHERE effective_status = 'converted')::bigint AS converted_in_period,
      COUNT(*) FILTER (
        WHERE effective_status = 'converted'
          AND p_date_from IS NOT NULL
          AND p_date_to IS NOT NULL
          AND created_at >= p_date_from
          AND created_at <= p_date_to
      )::bigint AS cohort_conversions,
      COUNT(*) FILTER (WHERE effective_status = 'visit_scheduled')::bigint AS visits_scheduled,
      COALESCE(SUM(contact_attempts), 0)::bigint AS contact_attempts
    FROM current_rows
  ),
  snapshot_summary AS (
    SELECT
      COUNT(*) FILTER (WHERE effective_status <> 'converted')::bigint AS active_pipeline
    FROM snapshot_rows
  ),
  current_status_counts AS (
    SELECT COALESCE(jsonb_object_agg(effective_status, cnt), '{}'::jsonb) AS value
    FROM (
      SELECT effective_status, COUNT(*)::bigint AS cnt
      FROM current_rows
      GROUP BY effective_status
    ) s
  ),
  current_source_counts AS (
    SELECT COALESCE(jsonb_object_agg(COALESCE(NULLIF(source, ''), '__none__'), cnt), '{}'::jsonb) AS value
    FROM (
      SELECT COALESCE(NULLIF(source, ''), '__none__') AS source, COUNT(*)::bigint AS cnt
      FROM current_rows
      GROUP BY COALESCE(NULLIF(source, ''), '__none__')
    ) s
  ),
  current_campaign_counts AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'campaign_id', c.campaign_id,
          'campaign_name', camp.name,
          'count', c.cnt
        )
        ORDER BY c.cnt DESC, camp.name NULLS LAST
      ),
      '[]'::jsonb
    ) AS value
    FROM (
      SELECT campaign_id, COUNT(*)::bigint AS cnt
      FROM current_rows
      GROUP BY campaign_id
    ) c
    LEFT JOIN public.campaigns camp
      ON camp.id = c.campaign_id
  ),
  current_assigned_counts AS (
    SELECT COALESCE(jsonb_object_agg(COALESCE(assigned_to::text, 'unassigned'), cnt), '{}'::jsonb) AS value
    FROM (
      SELECT assigned_to, COUNT(*)::bigint AS cnt
      FROM current_rows
      GROUP BY assigned_to
    ) s
  ),
  current_daily_counts AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date', TO_CHAR(day_bucket, 'YYYY-MM-DD'),
          'count', cnt
        )
        ORDER BY day_bucket
      ),
      '[]'::jsonb
    ) AS value
    FROM (
      SELECT (created_at AT TIME ZONE 'Europe/Lisbon')::date AS day_bucket, COUNT(*)::bigint AS cnt
      FROM current_rows
      GROUP BY (created_at AT TIME ZONE 'Europe/Lisbon')::date
    ) s
  ),
  current_deal_counts AS (
    SELECT jsonb_build_object(
      'open_deals_total', COUNT(d.*)::bigint,
      'leads_with_open_deals', COUNT(DISTINCT d.lead_id)::bigint
    ) AS value
    FROM current_rows cr
    LEFT JOIN public.deals d
      ON d.lead_id = cr.lead_id
     AND d.deleted_at IS NULL
  ),
  -- ── qualification (SQL/MQL) join + aggregates ──────────────────────
  current_qualification_join AS (
    SELECT cr.lead_id, al.qualification_type, al.qualified_at, cr.created_at
    FROM current_rows cr
    JOIN public.anew_leads al ON al.id = cr.lead_id
  ),
  current_qualification_counts AS (
    SELECT COALESCE(jsonb_object_agg(qt, cnt), '{}'::jsonb) AS value
    FROM (
      SELECT COALESCE(qualification_type, 'unclassified') AS qt, COUNT(*)::bigint AS cnt
      FROM current_qualification_join
      GROUP BY 1
    ) s
  ),
  current_avg_days_to_qualify AS (
    SELECT jsonb_build_object(
      'sql', (
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (qualified_at - created_at)) / 86400.0)::numeric, 1)
        FROM current_qualification_join
        WHERE qualification_type = 'sql' AND qualified_at IS NOT NULL
      ),
      'mql', (
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (qualified_at - created_at)) / 86400.0)::numeric, 1)
        FROM current_qualification_join
        WHERE qualification_type = 'mql' AND qualified_at IS NOT NULL
      ),
      'overall', (
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (qualified_at - created_at)) / 86400.0)::numeric, 1)
        FROM current_qualification_join
        WHERE qualified_at IS NOT NULL
      )
    ) AS value
  ),
  -- ── resolved-stage counts ───────────────────────────────────────────
  snapshot_resolved_stage_join AS (
    SELECT
      sr.lead_id,
      public.compute_lead_stage_v2(sr.lead_id) AS resolved_stage_id
    FROM snapshot_rows sr
  ),
  snapshot_resolved_stage_bucketed AS (
    SELECT rsj.lead_id, public.resolve_stage_bucket(rsj.resolved_stage_id) AS bucket
    FROM snapshot_resolved_stage_join rsj
  ),
  snapshot_resolved_stage_counts AS (
    SELECT jsonb_build_object(
      'qualified', COUNT(*) FILTER (WHERE bucket = 'qualified')::bigint,
      'negotiation', COUNT(*) FILTER (WHERE bucket = 'negotiation')::bigint,
      'converted', COUNT(*) FILTER (WHERE bucket = 'converted')::bigint,
      'lost', COUNT(*) FILTER (WHERE bucket = 'lost')::bigint
    ) AS value
    FROM snapshot_resolved_stage_bucketed
  ),
  -- ── per-stage funnel distribution ──────────────────────────────────
  -- Fixed: driven FROM the per-lead resolved-stage-id computation itself
  -- (grouping snapshot_resolved_stage_join directly), so no lead is ever
  -- silently dropped just because its resolved stage happens to belong to
  -- the shared template set rather than this org's own custom stages.
  -- lead_workflow_stages is then joined BY ID (not by organization_id) only
  -- to fetch display label/stage_order -- a resolved_stage_id is always a
  -- real row in that table regardless of which org (or the template) it
  -- belongs to.
  snapshot_resolved_stage_agg AS (
    SELECT resolved_stage_id, COUNT(*)::bigint AS cnt
    FROM snapshot_resolved_stage_join
    WHERE resolved_stage_id IS NOT NULL
    GROUP BY resolved_stage_id
  ),
  snapshot_stage_distribution AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'stage_id', srsa.resolved_stage_id,
          'stage_name', COALESCE(lws.label, lws.name),
          'count', srsa.cnt
        )
        ORDER BY lws.stage_order DESC
      ),
      '[]'::jsonb
    ) AS value
    FROM snapshot_resolved_stage_agg srsa
    JOIN public.lead_workflow_stages lws
      ON lws.id = srsa.resolved_stage_id
  )
  SELECT jsonb_build_object(
    'active_pipeline', ss.active_pipeline,
    'leads_in_period', cs.leads_in_period,
    'leads_today', cs.leads_today,
    'converted_in_period', cs.converted_in_period,
    'cohort_conversions', cs.cohort_conversions,
    'conversion_rate', CASE
      WHEN cs.leads_in_period = 0 THEN 0
      ELSE ROUND((cs.converted_in_period::numeric / cs.leads_in_period::numeric) * 100, 2)
    END,
    'visits_scheduled', cs.visits_scheduled,
    'contact_attempts', cs.contact_attempts,
    'contact_attempts_in_period', cs.contact_attempts,
    'status_counts', csc.value,
    'source_counts', csrc.value,
    'campaign_counts', ccc.value,
    'assigned_counts', cac.value,
    'daily_counts', cdc.value,
    'deal_counts', cdeal.value,
    'qualification_counts', cqc.value,
    'avg_days_to_qualify', cadq.value,
    'resolved_stage_counts', srsc.value,
    'stage_distribution', ssd.value
  )
  INTO v_current
  FROM current_summary cs
  CROSS JOIN snapshot_summary ss
  CROSS JOIN current_status_counts csc
  CROSS JOIN current_source_counts csrc
  CROSS JOIN current_campaign_counts ccc
  CROSS JOIN current_assigned_counts cac
  CROSS JOIN current_daily_counts cdc
  CROSS JOIN current_deal_counts cdeal
  CROSS JOIN current_qualification_counts cqc
  CROSS JOIN current_avg_days_to_qualify cadq
  CROSS JOIN snapshot_resolved_stage_counts srsc
  CROSS JOIN snapshot_stage_distribution ssd;

  IF p_compare_previous AND v_previous_from IS NOT NULL AND v_previous_to IS NOT NULL THEN
    WITH previous_rows AS (
      SELECT *
      FROM public.get_scoped_leads_base(
        p_org_id => p_org_id,
        p_is_root => p_is_root,
        p_scope => p_scope,
        p_status => p_status,
        p_campaign_id => p_campaign_id,
        p_assigned_to => p_assigned_to,
        p_assigned_unassigned => p_assigned_unassigned,
        p_contact_result => p_contact_result,
        p_contact_result_none => p_contact_result_none,
        p_source => p_source,
        p_source_is_null => p_source_is_null,
        p_search => p_search,
        p_date_from => v_previous_from,
        p_date_to => v_previous_to
      )
    ),
    previous_summary AS (
      SELECT
        COUNT(*)::bigint AS leads_in_period,
        COUNT(*) FILTER (WHERE effective_status = 'converted')::bigint AS converted_in_period,
        COUNT(*) FILTER (WHERE effective_status = 'converted')::bigint AS cohort_conversions,
        COALESCE(SUM(contact_attempts), 0)::bigint AS contact_attempts
      FROM previous_rows
    ),
    previous_daily_counts AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'date', TO_CHAR(day_bucket, 'YYYY-MM-DD'),
            'count', cnt
          )
          ORDER BY day_bucket
        ),
        '[]'::jsonb
      ) AS value
      FROM (
        SELECT (created_at AT TIME ZONE 'Europe/Lisbon')::date AS day_bucket, COUNT(*)::bigint AS cnt
        FROM previous_rows
        GROUP BY (created_at AT TIME ZONE 'Europe/Lisbon')::date
      ) s
    )
    SELECT jsonb_build_object(
      'leads_in_period', ps.leads_in_period,
      'converted_in_period', ps.converted_in_period,
      'cohort_conversions', ps.cohort_conversions,
      'contact_attempts', ps.contact_attempts,
      'contact_attempts_in_period', ps.contact_attempts,
      'daily_counts', pdc.value
    )
    INTO v_previous
    FROM previous_summary ps
    CROSS JOIN previous_daily_counts pdc;
  ELSE
    v_previous := NULL;
  END IF;

  RETURN COALESCE(v_current, '{}'::jsonb) || jsonb_build_object(
    'meta', jsonb_build_object(
      'scope_applied', v_ctx.applied_scope,
      'date_from', p_date_from,
      'date_to', p_date_to,
      'comparison_from', v_previous_from,
      'comparison_to', v_previous_to
    ),
    'current', COALESCE(v_current, '{}'::jsonb),
    'previous', v_previous
  );
END;
$function$;
-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. For org Nike (b6ffce4f-f630-4933-833a-008649757a33), p_is_root=true,
--    p_scope='ORG', date range 2026-06-28..2026-07-28: confirm
--    'current'.'resolved_stage_counts'.'qualified' equals the sum of
--    'count' across all 'current'.'stage_distribution' entries whose
--    stage_name buckets to "qualified" (should both be 13, not 13 vs 12).
-- 2. Confirm the sum of ALL stage_distribution counts (every bucket, not
--    just qualified) equals the sum of resolved_stage_counts' 4 buckets --
--    the general form of the invariant this migration restores.
-- 3. Confirm a lead whose resolved stage is a TEMPLATE stage (inherited via
--    a child org with no custom lead_workflow_stages of its own) now
--    appears in stage_distribution under that template stage's label.
-- 4. Confirm function signature (17 parameters, defaults, return type) is
--    unchanged and every other JSON key/behavior is identical to the
--    previous definition.;
