-- get_lead_dashboard_stats_scoped: stop restricting "current state" KPIs to
-- the selected creation-date window.
-- ============================================================
-- Found live: for orgs whose real leads mostly predate the dashboard's
-- default 30-day window, the "Total Pipeline Ativo" KPI card (and everything
-- derived from resolved_stage_counts) showed 0, while the page header's
-- separate, unfiltered get_lead_status_counts RPC correctly showed the real
-- total (e.g. 3962). Root cause: every KPI in this function -- including
-- active_pipeline -- was computed from `current_rows`, which comes from
-- get_scoped_leads_base(..., p_date_from, p_date_to) filtered by
-- `l.created_at >= p_date_from AND l.created_at <= p_date_to`
-- (get_scoped_leads_base, current def:
-- 20261110220000_qualified_negotiation_override_stale_visit_scheduled.sql:154-155).
-- A lead created before the selected window is invisible to `current_rows`
-- even though it is a real, currently-open lead that should count towards a
-- "current pipeline snapshot" metric.
--
-- Reviewed every key this function returns to classify each as genuinely
-- period-bound (created/happened *within* the selected window -- correctly
-- computed from the existing period-filtered `current_rows`) vs. a "current
-- state" snapshot that must reflect ALL of the org's currently-visible leads
-- regardless of when they were created:
--
--   Fixed (now computed from a new, unscoped `snapshot_rows` CTE):
--     - active_pipeline          ("Total Pipeline Ativo" KPI card -- the
--                                  confirmed bug. Conceptually "how many open
--                                  leads exist right now", not "... among
--                                  leads created in the selected window".)
--     - resolved_stage_counts    (feeds leadsDashboardHelpers.ts'
--                                  qualifiedLeads/convertedLeads KPIs, which
--                                  read as current snapshot counts the same
--                                  way active_pipeline does -- "how many
--                                  leads are qualified/converted right now",
--                                  not "... among leads created in period".
--                                  Same bug class: a lead that reached
--                                  qualified/negotiation/converted before the
--                                  selected window was invisible.)
--     - stage_distribution       (per-stage funnel breakdown built directly
--                                  on top of the same resolved-stage join;
--                                  same reasoning as resolved_stage_counts --
--                                  a funnel of "leads currently sitting in
--                                  each stage" is a snapshot, not a
--                                  period-bound cohort.)
--
--   Left unchanged (computed from the existing period-filtered
--   `current_rows`, exactly as before -- these are genuinely period-bound):
--     - leads_in_period, leads_today, converted_in_period,
--       cohort_conversions, conversion_rate: explicitly about leads
--       created/converted within the window (leads_today is "today" scoped
--       within the same filtered set, pre-existing behaviour, not part of
--       this bug); cohort_conversions/conversion_rate are a cohort metric by
--       definition (conversions *among leads created in this period*), which
--       legitimately needs the creation-date-bounded cohort.
--     - contact_attempts / contact_attempts_in_period, visits_scheduled:
--       the frontend explicitly labels these "no período" (KPICard
--       subtitles in LeadsDashboard.tsx) -- deliberately period-scoped.
--     - status_counts, source_counts, campaign_counts, assigned_counts,
--       daily_counts, deal_counts, qualification_counts,
--       avg_days_to_qualify: breakdowns of the leads *created* in the
--       selected period (e.g. daily_counts is literally a per-day series
--       across the window); no evidence they were meant as a live snapshot,
--       left untouched per the surgical scope of this fix.
--
-- `snapshot_rows` reuses get_scoped_leads_base with the exact same filter
-- params (status/campaign/assigned/contact_result/source/search/scope) the
-- caller already applied, but with p_date_from/p_date_to forced to NULL --
-- i.e. "all of the org's currently-visible leads matching today's other
-- filters", not "matching today's other filters AND created in this
-- window". This mirrors get_scoped_leads_base's own org-scope + soft-delete
-- handling instead of re-deriving it, so no new access-control logic is
-- introduced here.
--
-- No signature change, no return-key change: every existing JSON key keeps
-- its name and meaning, only the computation source changes for the three
-- keys above. CREATE OR REPLACE only, identical parameter list to the
-- previous definition (20261111110000_lead_dashboard_stage_distribution.sql).

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
  -- ── unscoped "current state" snapshot (this migration) ────────────
  -- Same filters as current_rows EXCEPT p_date_from/p_date_to, which are
  -- forced to NULL: a lead's creation date must not hide it from a KPI that
  -- is meant to describe the org's live pipeline right now.
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
  -- ── unscoped active-pipeline count (this migration) ────────────────
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
  -- ── resolved-stage counts (this migration: now unscoped) ──────────
  -- Computed from snapshot_rows instead of current_rows: qualified/
  -- negotiation/converted/lost are current pipeline states, not a
  -- period-bound cohort, so a lead that reached one of these states before
  -- the selected window must still be counted.
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
  -- ── per-stage funnel distribution (this migration: now unscoped) ──
  -- Same org-stages-else-template fallback as compute_lead_stage_v2, so the
  -- listed stages are exactly the ones a lead in this org could resolve to.
  current_org_stages AS (
    SELECT lws.id AS stage_id, COALESCE(lws.label, lws.name) AS stage_name, lws.stage_order
    FROM public.lead_workflow_stages lws
    WHERE lws.is_active = true
      AND (
        (
          EXISTS (
            SELECT 1 FROM public.lead_workflow_stages own
            WHERE own.organization_id = p_org_id AND own.is_active = true
          )
          AND lws.organization_id = p_org_id
        )
        OR (
          NOT EXISTS (
            SELECT 1 FROM public.lead_workflow_stages own
            WHERE own.organization_id = p_org_id AND own.is_active = true
          )
          AND lws.organization_id IS NULL
        )
      )
  ),
  snapshot_resolved_stage_agg AS (
    SELECT resolved_stage_id, COUNT(*)::bigint AS cnt
    FROM snapshot_resolved_stage_join
    GROUP BY resolved_stage_id
  ),
  snapshot_stage_distribution AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'stage_id', cos.stage_id,
          'stage_name', cos.stage_name,
          'count', COALESCE(srsa.cnt, 0)
        )
        ORDER BY cos.stage_order DESC
      ),
      '[]'::jsonb
    ) AS value
    FROM current_org_stages cos
    LEFT JOIN snapshot_resolved_stage_agg srsa
      ON srsa.resolved_stage_id = cos.stage_id
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
-- 1. For an org with real leads created BEFORE the default 30-day dashboard
--    window (e.g. a lead from 6 months ago, still status='qualified' and not
--    converted/deleted): call get_lead_dashboard_stats_scoped with the
--    default date range and confirm 'current'.'active_pipeline' > 0 and
--    includes that lead (previously 0 in this scenario).
-- 2. Confirm 'current'.'resolved_stage_counts' and 'current'.'stage_distribution'
--    likewise now count leads regardless of creation date, and that the sum
--    of stage_distribution counts still equals the sum of
--    resolved_stage_counts' 4 buckets (same invariant as before this fix,
--    just against the unscoped set).
-- 3. Confirm 'current'.'leads_in_period', 'leads_today', 'converted_in_period',
--    'cohort_conversions', 'conversion_rate', 'visits_scheduled',
--    'contact_attempts'/'contact_attempts_in_period', 'status_counts',
--    'source_counts', 'campaign_counts', 'assigned_counts', 'daily_counts',
--    'deal_counts', 'qualification_counts', 'avg_days_to_qualify' are
--    UNCHANGED vs. the previous definition for the same inputs (still
--    period-filtered via current_rows).
-- 4. Confirm applying a non-date filter (e.g. p_campaign_id, p_status,
--    p_assigned_to) still narrows active_pipeline/resolved_stage_counts/
--    stage_distribution accordingly -- only the date restriction was
--    dropped from snapshot_rows, every other filter still applies.
-- 5. Confirm the function signature (17 parameters, defaults, return type)
--    is unchanged and existing frontend calls work without changes.
