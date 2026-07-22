-- Fixes 2 gaps found while stress-testing the configurable pipeline engine
-- against real Nike org data with the user:
--
-- 1) "Lost exclusivity" was not enforced. The 4 "Contabiliza como" switches
--    in the UI are independent (no mutual exclusion, unlike is_conversion/
--    is_rejection in the same dialog). Confirmed live (rolled back, no data
--    changed): marking the real "Qualified" stage as ALSO counts_as_lost
--    made 12 real Nike leads get counted in BOTH buckets simultaneously in
--    get_lead_dashboard_stats_scoped's resolved_stage_counts (independent
--    COUNT(*) FILTER clauses, not a single exclusive bucket per lead).
--    Fixed here with resolve_stage_bucket(), a single mutually-exclusive
--    CASE (lost > converted > negotiation > qualified priority - Lost wins
--    if a stage is misconfigured with multiple flags), reused by the
--    dashboard RPC, get_leads_v2_ids_by_pipeline_status, and
--    simulate_lead_v2_bucket_changes so all three agree by construction.
--
-- 2) auto_advance was a dead switch: persisted since Fase 1, exposed in the
--    UI, but no function anywhere read it (confirmed via grep before
--    writing this migration - only schema/RPC-payload/UI references
--    existed). Implemented for real: fn_mark_lead_pipeline_dirty (the
--    trigger already firing on deals/quotes/proposals/client_contracts/
--    entity_interactions changes) now resolves each affected lead's stage
--    via compute_lead_stage_v2 and, if that stage has auto_advance = true,
--    writes anew_leads.status/workflow_stage_id immediately instead of just
--    marking pipeline_dirty_at. Confirmed live before writing this that
--    anew_leads has no trigger reacting specifically to status changes
--    beyond the standard Group-A audit trigger, so this write is safe and
--    gets audited like any other status change.

-- ============================================================
-- resolve_stage_bucket — single mutually-exclusive bucket per stage
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_stage_bucket(p_stage_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $function$
  SELECT CASE
    WHEN lws.counts_as_lost THEN 'lost'
    WHEN lws.counts_as_converted THEN 'converted'
    WHEN lws.counts_as_negotiation THEN 'negotiation'
    WHEN lws.counts_as_qualified THEN 'qualified'
    ELSE NULL
  END
  FROM public.lead_workflow_stages lws
  WHERE lws.id = p_stage_id;
$function$;

REVOKE ALL ON FUNCTION public.resolve_stage_bucket(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_stage_bucket(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_stage_bucket(uuid) TO service_role;

-- ============================================================
-- get_lead_dashboard_stats_scoped — resolved_stage_counts now mutually exclusive
-- ============================================================
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
  -- ── resolved-stage counts (Fase 2/3) — now a single exclusive bucket ────
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
    'resolved_stage_counts', crsc.value
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
  CROSS JOIN current_resolved_stage_counts crsc;

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
-- get_leads_v2_ids_by_pipeline_status — now mutually exclusive too
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_leads_v2_ids_by_pipeline_status(
  p_org_id uuid,
  p_filter text,
  p_is_root boolean DEFAULT false,
  p_scope text DEFAULT 'ORG'::text
)
RETURNS TABLE(lead_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH visible_leads AS (
    SELECT l.lead_id
    FROM public.get_scoped_leads_base(
      p_org_id => p_org_id,
      p_is_root => p_is_root,
      p_scope => p_scope
    ) l
  ),
  resolved AS (
    SELECT v.lead_id, public.compute_lead_stage_v2(v.lead_id) AS stage_id
    FROM visible_leads v
  ),
  bucketed AS (
    SELECT r.lead_id, r.stage_id, public.resolve_stage_bucket(r.stage_id) AS bucket
    FROM resolved r
  )
  SELECT b.lead_id
  FROM bucketed b
  WHERE
    (p_filter IN ('qualified', 'negotiation', 'converted', 'lost') AND b.bucket = p_filter)
    OR (p_filter LIKE 'stage:%' AND b.stage_id = substring(p_filter FROM 7)::uuid);
$function$;

-- ============================================================
-- simulate_lead_v2_bucket_changes — bucket priority reordered lost-first
-- ============================================================
CREATE OR REPLACE FUNCTION public.simulate_lead_v2_bucket_changes(
  p_org uuid,
  p_stages jsonb,
  p_qual jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_authorized boolean;
  v_result jsonb;
BEGIN
  SELECT p_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RAISE EXCEPTION 'not authorized for organization %', p_org;
  END IF;

  WITH stage_defs AS (
    SELECT
      COALESCE((elem->>'stage_order')::int, -ord::int) AS stage_order,
      elem->'reached_when' AS reached_when,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(elem->'matching_statuses', '[]'::jsonb))) AS matching_statuses,
      COALESCE((elem->>'counts_as_qualified')::boolean, false) AS counts_as_qualified,
      COALESCE((elem->>'counts_as_negotiation')::boolean, false) AS counts_as_negotiation,
      COALESCE((elem->>'counts_as_converted')::boolean, false) AS counts_as_converted,
      COALESCE((elem->>'counts_as_lost')::boolean, false) AS counts_as_lost,
      COALESCE(elem->>'label', elem->>'name') AS label
    FROM jsonb_array_elements(COALESCE(p_stages, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
  ),
  org_leads AS (
    SELECT id AS lead_id, status
    FROM public.anew_leads
    WHERE organization_id = p_org AND deleted_at IS NULL
  ),
  before_resolved AS (
    SELECT ol.lead_id, public.compute_lead_stage_v2(ol.lead_id) AS stage_id
    FROM org_leads ol
  ),
  before_bucketed AS (
    SELECT br.lead_id,
      COALESCE(public.resolve_stage_bucket(br.stage_id), lws.name, 'unresolved') AS bucket
    FROM before_resolved br
    LEFT JOIN public.lead_workflow_stages lws ON lws.id = br.stage_id
  ),
  lead_signals AS (
    SELECT ol.lead_id, public.evaluate_lead_signals_v2(ol.lead_id) AS signals
    FROM org_leads ol
  ),
  after_matches AS (
    SELECT DISTINCT ON (ol.lead_id)
      ol.lead_id,
      sd.label,
      sd.counts_as_qualified,
      sd.counts_as_negotiation,
      sd.counts_as_converted,
      sd.counts_as_lost
    FROM org_leads ol
    JOIN lead_signals ls ON ls.lead_id = ol.lead_id
    JOIN stage_defs sd
      ON public.stage_reached(ls.signals, sd.reached_when, ol.status, sd.matching_statuses)
    ORDER BY ol.lead_id, sd.stage_order DESC
  ),
  after_bucketed AS (
    SELECT ol.lead_id,
      CASE
        WHEN am.counts_as_lost THEN 'lost'
        WHEN am.counts_as_converted THEN 'converted'
        WHEN am.counts_as_negotiation THEN 'negotiation'
        WHEN am.counts_as_qualified THEN 'qualified'
        WHEN am.label IS NOT NULL THEN am.label
        ELSE 'unresolved'
      END AS bucket
    FROM org_leads ol
    LEFT JOIN after_matches am ON am.lead_id = ol.lead_id
  ),
  combined AS (
    SELECT bb.lead_id, bb.bucket AS before_bucket, ab.bucket AS after_bucket
    FROM before_bucketed bb
    JOIN after_bucketed ab ON ab.lead_id = bb.lead_id
  ),
  before_totals AS (
    SELECT COALESCE(jsonb_object_agg(before_bucket, cnt), '{}'::jsonb) AS value
    FROM (SELECT before_bucket, COUNT(*)::bigint AS cnt FROM combined GROUP BY before_bucket) s
  ),
  after_totals AS (
    SELECT COALESCE(jsonb_object_agg(after_bucket, cnt), '{}'::jsonb) AS value
    FROM (SELECT after_bucket, COUNT(*)::bigint AS cnt FROM combined GROUP BY after_bucket) s
  ),
  changed AS (
    SELECT * FROM combined WHERE before_bucket IS DISTINCT FROM after_bucket
  ),
  changed_examples AS (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object('lead_id', lead_id, 'before', before_bucket, 'after', after_bucket)),
      '[]'::jsonb
    ) AS value
    FROM (SELECT * FROM changed LIMIT 20) s
  )
  SELECT jsonb_build_object(
    'total_leads', (SELECT COUNT(*) FROM combined),
    'before_totals', bt.value,
    'after_totals', at.value,
    'changed_count', (SELECT COUNT(*) FROM changed),
    'changed_examples', ce.value
  )
  INTO v_result
  FROM before_totals bt
  CROSS JOIN after_totals at
  CROSS JOIN changed_examples ce;

  RETURN v_result;
END;
$function$;

-- ============================================================
-- fn_mark_lead_pipeline_dirty — real auto_advance
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_mark_lead_pipeline_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_lead record;
  v_new_stage_id uuid;
  v_new_stage record;
BEGIN
  v_entity_id := COALESCE(NEW.entity_id, OLD.entity_id);
  IF v_entity_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR v_lead IN
    SELECT id, status, workflow_stage_id
    FROM public.anew_leads
    WHERE entity_id = v_entity_id AND deleted_at IS NULL
  LOOP
    v_new_stage_id := public.compute_lead_stage_v2(v_lead.id);

    IF v_new_stage_id IS NOT NULL AND v_new_stage_id IS DISTINCT FROM v_lead.workflow_stage_id THEN
      SELECT * INTO v_new_stage FROM public.lead_workflow_stages WHERE id = v_new_stage_id;

      IF v_new_stage.auto_advance THEN
        UPDATE public.anew_leads
        SET status = COALESCE(v_new_stage.default_status, v_new_stage.name),
            workflow_stage_id = v_new_stage.id,
            pipeline_dirty_at = NULL
        WHERE id = v_lead.id;
        CONTINUE;
      END IF;
    END IF;

    UPDATE public.anew_leads
    SET pipeline_dirty_at = now()
    WHERE id = v_lead.id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Repetir o teste que encontrou o bug (marcar Qualified como
--    counts_as_lost também) e confirmar resolved_stage_counts.qualified e
--    .lost já não contam a mesma lead - deve ficar só em 'lost'.
-- 2. Configurar um estágio com auto_advance=true e uma condição alcançável
--    (ex.: has_active_deal), criar/actualizar um deal para uma lead
--    elegível, e confirmar que anew_leads.status/workflow_stage_id mudam
--    automaticamente sem qualquer acção manual do utilizador.
-- 3. Confirmar que leads cujo novo estágio resolvido NÃO tem auto_advance
--    continuam apenas com pipeline_dirty_at actualizado (comportamento
--    anterior preservado).
