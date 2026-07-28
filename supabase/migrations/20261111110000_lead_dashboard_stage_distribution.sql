-- Fase 2 (item #5) — per-stage funnel distribution for the leads v2 dashboard.
--
-- get_lead_dashboard_stats_scoped (final def before this migration:
-- 20261110570000_lead_v2_bucket_exclusivity_and_auto_advance.sql:56-351) only
-- ever exposed the 4 aggregated buckets (qualified/negotiation/converted/lost)
-- via resolved_stage_counts, collapsed through resolve_stage_bucket(). The raw
-- per-lead resolved_stage_id was already computed one CTE earlier
-- (current_resolved_stage_join) but discarded after bucketing — there was no
-- per-individual-stage breakdown anywhere.
--
-- This migration adds a new `stage_distribution` key: a jsonb array of
-- {stage_id, stage_name, count}, one entry per active stage that applies to
-- the org (mirroring compute_lead_stage_v2's own org-stages-else-template
-- fallback, so the same stages that can actually be resolved are the ones
-- listed), ordered by stage_order DESC, including stages with 0 leads.
--
-- Every previously-existing key in the returned JSON (active_pipeline,
-- leads_in_period, leads_today, converted_in_period, cohort_conversions,
-- conversion_rate, visits_scheduled, contact_attempts,
-- contact_attempts_in_period, status_counts, source_counts, campaign_counts,
-- assigned_counts, daily_counts, deal_counts, qualification_counts,
-- avg_days_to_qualify, resolved_stage_counts, meta, current, previous) is
-- kept byte-for-byte. The function signature (all 17 parameters, defaults,
-- return type) is unchanged. Only a CREATE OR REPLACE — no signature-breaking
-- DROP FUNCTION needed since the parameter list is identical.

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
  current_summary AS (
    SELECT
      COUNT(*) FILTER (WHERE effective_status <> 'converted')::bigint AS active_pipeline,
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
  -- ── resolved-stage counts (Fase 2/3) — single exclusive bucket ────
  current_resolved_stage_join AS (
    SELECT
      cr.lead_id,
      public.compute_lead_stage_v2(cr.lead_id) AS resolved_stage_id
    FROM current_rows cr
  ),
  current_resolved_stage_bucketed AS (
    SELECT rsj.lead_id, public.resolve_stage_bucket(rsj.resolved_stage_id) AS bucket
    FROM current_resolved_stage_join rsj
  ),
  current_resolved_stage_counts AS (
    SELECT jsonb_build_object(
      'qualified', COUNT(*) FILTER (WHERE bucket = 'qualified')::bigint,
      'negotiation', COUNT(*) FILTER (WHERE bucket = 'negotiation')::bigint,
      'converted', COUNT(*) FILTER (WHERE bucket = 'converted')::bigint,
      'lost', COUNT(*) FILTER (WHERE bucket = 'lost')::bigint
    ) AS value
    FROM current_resolved_stage_bucketed
  ),
  -- ── per-stage funnel distribution (Fase 2 §2, new) ─────────────────
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
  current_resolved_stage_agg AS (
    SELECT resolved_stage_id, COUNT(*)::bigint AS cnt
    FROM current_resolved_stage_join
    GROUP BY resolved_stage_id
  ),
  current_stage_distribution AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'stage_id', cos.stage_id,
          'stage_name', cos.stage_name,
          'count', COALESCE(crsa.cnt, 0)
        )
        ORDER BY cos.stage_order DESC
      ),
      '[]'::jsonb
    ) AS value
    FROM current_org_stages cos
    LEFT JOIN current_resolved_stage_agg crsa
      ON crsa.resolved_stage_id = cos.stage_id
  )
  SELECT jsonb_build_object(
    'active_pipeline', cs.active_pipeline,
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
    'resolved_stage_counts', crsc.value,
    'stage_distribution', csd.value
  )
  INTO v_current
  FROM current_summary cs
  CROSS JOIN current_status_counts csc
  CROSS JOIN current_source_counts csrc
  CROSS JOIN current_campaign_counts ccc
  CROSS JOIN current_assigned_counts cac
  CROSS JOIN current_daily_counts cdc
  CROSS JOIN current_deal_counts cdeal
  CROSS JOIN current_qualification_counts cqc
  CROSS JOIN current_avg_days_to_qualify cadq
  CROSS JOIN current_resolved_stage_counts crsc
  CROSS JOIN current_stage_distribution csd;

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
-- 1. Chamar get_lead_dashboard_stats_scoped para uma org com etapas próprias
--    configuradas e confirmar que 'current'.'stage_distribution' devolve uma
--    entrada por cada etapa activa da org (stage_order DESC), incluindo
--    etapas com count = 0.
-- 2. Confirmar que 'resolved_stage_counts' (os 4 buckets agregados) continua
--    a bater com a soma dos counts de 'stage_distribution' agrupados por
--    counts_as_* da mesma etapa.
-- 3. Confirmar que todas as restantes chaves do JSON devolvido (active_pipeline,
--    leads_in_period, leads_today, converted_in_period, cohort_conversions,
--    conversion_rate, visits_scheduled, contact_attempts,
--    contact_attempts_in_period, status_counts, source_counts,
--    campaign_counts, assigned_counts, daily_counts, deal_counts,
--    qualification_counts, avg_days_to_qualify, meta, current, previous)
--    permanecem inalteradas e com o mesmo formato de antes desta migration.
-- 4. Confirmar que a assinatura da função (17 parâmetros, defaults, tipo de
--    retorno) não mudou e chamadas existentes no frontend continuam a
--    funcionar sem alterações.
