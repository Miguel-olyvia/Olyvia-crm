-- get_lead_dashboard_stats_scoped: fix "Visitas Agendadas" (visits_scheduled)
-- ============================================================
-- Bug 1: visits_scheduled contava leads com effective_status='visit_scheduled'
-- filtradas pelo INTERVALO aplicado a anew_leads.created_at (data de CRIAÇÃO
-- da lead), nunca pela data real da visita (schedule_items.start_datetime).
-- Resultado: uma lead criada em março com visita marcada para janeiro não
-- aparecia em "janeiro"; uma visita já cancelada continuava a contar
-- indefinidamente enquanto scheduled_visit_id estivesse preenchido, porque
-- nada verificava schedule_items.status.
--
-- Bug 2: quando p_assigned_to é passado (filtro de comercial no dashboard),
-- só comparava anew_leads.assigned_to -- nunca schedule_item_assignees /
-- schedule_resources.user_id. Uma lead reatribuída depois de a visita já
-- estar agendada a outra pessoa fazia a visita "desaparecer" para quem a
-- tinha realmente marcada, ou "aparecer" para quem só ficou dono da lead
-- depois.
--
-- Fix (escopo estrito: só a métrica visits_scheduled, mais nada muda):
--   - visits_scheduled passa a ser calculado a partir de um JOIN explícito
--     a schedule_items via anew_leads.scheduled_visit_id, filtrando pelo
--     intervalo p_date_from/p_date_to aplicado a schedule_items.start_datetime
--     (não a created_at), e excluindo status = 'cancelled'.
--   - quando p_assigned_to está definido, a visita conta se
--     anew_leads.assigned_to = p_assigned_to OU existe uma linha em
--     schedule_item_assignees/schedule_resources ligando esse schedule_item
--     ao p_assigned_to (OR, não substituição -- ver nota de decisão no
--     relatório de auditoria).
--   - fonte das leads candidatas: get_scoped_leads_base chamada com
--     p_date_from/p_date_to => NULL e p_assigned_to => NULL (a data e o
--     assignee desta métrica são agora resolvidos aqui, não delegados à
--     função base), mantendo TODOS os outros filtros (p_status, campanha,
--     resultado de contacto, fonte, pesquisa) e o scope ORG/OWNED/TEAM
--     inteiramente intactos (resolvidos dentro de get_scoped_leads_base,
--     via v_ctx.applied_scope -- não tocado por esta migração).
--
-- Nenhuma outra métrica (leads_in_period, active_pipeline, contact_attempts,
-- status_counts, resolved_stage_counts, stage_distribution, etc.) é alterada.
-- Assinatura da função 100% preservada (17 parâmetros, mesma ordem, mesmos
-- defaults) -- nenhum caller (LeadsDashboard.tsx, AnewLeads.tsx, edge
-- function leads-dashboard-ai-report) precisa de mudar.
--
-- Visitas órfãs (scheduled_visit_id a apontar para um schedule_item que já
-- não existe) deixam de contar -- comportamento correto, aprovado.

CREATE INDEX IF NOT EXISTS idx_anew_leads_scheduled_visit_id
  ON public.anew_leads USING btree (scheduled_visit_id)
  WHERE scheduled_visit_id IS NOT NULL;

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
  -- ── visits_scheduled: candidatas independentes de created_at/assigned_to ──
  -- Reaproveita get_scoped_leads_base (mesmo scope ORG/OWNED/TEAM, mesmo
  -- p_status/campanha/contact_result/source/search) mas SEM aplicar
  -- p_date_from/p_date_to (que aqui significam data da lead, não da visita)
  -- nem p_assigned_to (reaplicado abaixo com a lógica OR lead/visita).
  visit_candidate_rows AS (
    SELECT lead_id, assigned_to, scheduled_visit_id
    FROM public.get_scoped_leads_base(
      p_org_id => p_org_id,
      p_is_root => p_is_root,
      p_scope => p_scope,
      p_status => p_status,
      p_campaign_id => p_campaign_id,
      p_assigned_to => NULL,
      p_assigned_unassigned => p_assigned_unassigned,
      p_contact_result => p_contact_result,
      p_contact_result_none => p_contact_result_none,
      p_source => p_source,
      p_source_is_null => p_source_is_null,
      p_search => p_search,
      p_date_from => NULL,
      p_date_to => NULL
    )
    WHERE effective_status = 'visit_scheduled'
      AND scheduled_visit_id IS NOT NULL
  ),
  visit_join AS (
    SELECT
      vcr.lead_id,
      vcr.assigned_to AS lead_assigned_to,
      si.id AS schedule_item_id,
      si.start_datetime
    FROM visit_candidate_rows vcr
    JOIN public.schedule_items si
      ON si.id = vcr.scheduled_visit_id
    WHERE si.status <> 'cancelled'
      AND (p_date_from IS NULL OR si.start_datetime >= p_date_from)
      AND (p_date_to IS NULL OR si.start_datetime <= p_date_to)
  ),
  visit_assignee_matches AS (
    SELECT DISTINCT vj.lead_id
    FROM visit_join vj
    JOIN public.schedule_item_assignees sia ON sia.item_id = vj.schedule_item_id
    JOIN public.schedule_resources sr ON sr.id = sia.resource_id
    WHERE p_assigned_to IS NOT NULL
      AND sr.user_id = p_assigned_to
  ),
  visits_scheduled_summary AS (
    SELECT COUNT(DISTINCT vj.lead_id) FILTER (
      WHERE p_assigned_to IS NULL
         OR vj.lead_assigned_to = p_assigned_to
         OR vj.lead_id IN (SELECT lead_id FROM visit_assignee_matches)
    )::bigint AS value
    FROM visit_join vj
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
    'visits_scheduled', vss.value,
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
  CROSS JOIN visits_scheduled_summary vss
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
