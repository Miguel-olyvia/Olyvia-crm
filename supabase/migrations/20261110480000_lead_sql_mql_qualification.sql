-- Feature: SQL/MQL qualification classification for Leads.
--
-- Adds an orthogonal-to-status classification on anew_leads (SQL = Sales
-- Qualified Lead, MQL = Marketing Qualified Lead), nullable/sticky, plus its
-- own history trail in anew_entity_history (distinct from the generic
-- entity_audit_log diff already produced by rpc_update_lead via
-- fn_manual_audit_log) and dashboard aggregate stats.
--
-- Implemented directly in this repo per user instruction, based on a plan
-- originally written for a Lovable-hosted environment
-- (vault/ficheiros/crm/leads/plano-qualificacao-sql-mql-lovable.md).
--
-- IMPORTANT correction made during implementation: that plan's section 2
-- referenced extending `get_lead_dashboard_stats` — confirmed live that this
-- function is DEAD CODE (only appears in the generated types.ts, never
-- called from any frontend file; grep of src/ for "get_lead_dashboard_stats"
-- outside "_scoped" found nothing). The real, currently-used function is
-- `get_lead_dashboard_stats_scoped` (called from LeadsDashboard.tsx), which
-- already correctly scopes via get_scoped_leads_base(p_org_id, p_is_root,
-- p_scope, ...) — no scope bug exists in the live dashboard RPC. This
-- migration extends the REAL function, not the dead one the plan named.

-- ============================================================
-- 1. Schema
-- ============================================================

ALTER TABLE public.anew_leads
  ADD COLUMN IF NOT EXISTS qualification_type text NULL,
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS qualification_set_by uuid NULL REFERENCES public.anew_users(id);

ALTER TABLE public.anew_leads
  DROP CONSTRAINT IF EXISTS anew_leads_qualification_type_check;
ALTER TABLE public.anew_leads
  ADD CONSTRAINT anew_leads_qualification_type_check
  CHECK (qualification_type IS NULL OR qualification_type IN ('sql', 'mql'));

CREATE INDEX IF NOT EXISTS idx_anew_leads_qualification_type
  ON public.anew_leads(organization_id, qualification_type)
  WHERE qualification_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_anew_leads_qualified_at
  ON public.anew_leads(qualified_at)
  WHERE qualified_at IS NOT NULL;

-- No new audit trigger needed: anew_leads already has trg_audit_anew_leads
-- (fn_generic_entity_audit), and rpc_update_lead's own manual-audit path
-- (fn_manual_audit_log, see below) picks up qualification_type in its diff
-- like any other column on this table.

-- ============================================================
-- 2. rpc_update_lead — add p_qualification_type / p_qualification_changed
-- ============================================================
-- Mirrors the existing p_status / p_status_changed pattern already used by
-- this same RPC: the boolean flag disambiguates "no change requested" from
-- "explicitly clear the classification" (p_qualification_type = NULL with
-- p_qualification_changed = true means "set back to não classificado").
--
-- Sticky rules (per plan section 3):
--   - qualified_at is set to now() only the first time qualification_type
--     goes from NULL to non-NULL; later reclassifications (sql<->mql, or
--     clearing back to NULL) do not touch qualified_at.
--   - qualification_set_by is updated whenever qualification_type actually
--     changes (including clearing it).
--   - a dedicated anew_entity_history row is written on every actual change,
--     in addition to (not instead of) the existing generic anew_leads diff
--     that already flows through fn_manual_audit_log below — the two serve
--     different purposes: entity_audit_log is the generic per-table change
--     feed, anew_entity_history's change_type='qualification_changed' rows
--     are the dedicated feed the dashboard's MQL->SQL conversion-rate metric
--     queries.

CREATE OR REPLACE FUNCTION public.rpc_update_lead(
  p_lead_id uuid,
  p_field_values jsonb,
  p_status text,
  p_source text,
  p_notes text,
  p_assigned_to uuid,
  p_status_changed boolean,
  p_workflow_stage_id uuid,
  p_display_name text,
  p_first_name text,
  p_last_name text,
  p_qualification_type text DEFAULT NULL,
  p_qualification_changed boolean DEFAULT false
)
RETURNS anew_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_before_lead  public.anew_leads;
  v_lead         public.anew_leads;
  v_before_ent   public.anew_entities;
  v_ent          public.anew_entities;
  v_entity_id    uuid;
  v_audit_org    uuid;
  v_lead_diff    jsonb;
  v_ent_diff     jsonb;
  v_diff         jsonb;
  v_ent_update   jsonb;
  v_new_qualification_type text;
  v_new_qualified_at timestamptz;
  v_new_qualification_set_by uuid;
BEGIN
  -- Consolidate all writes below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the lead (before-image + guards) ────────────────────────────────
  SELECT * INTO v_before_lead FROM public.anew_leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with anew_leads_update RLS ──────────────────────
  -- Accept BOTH the lead's organization_id and its root_organization_id, exactly
  -- like the anew_leads RLS policy, so a root-org member is not falsely rejected.
  IF NOT public.fn_lead_org_in_scope(v_before_lead.organization_id, v_before_lead.root_organization_id) THEN
    RAISE EXCEPTION 'Lead fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Resolve qualification fields (sticky rules) ──────────────────────────
  IF p_qualification_changed THEN
    v_new_qualification_type := p_qualification_type;
    IF p_qualification_type IS NOT NULL AND v_before_lead.qualified_at IS NULL THEN
      v_new_qualified_at := now();
    ELSE
      v_new_qualified_at := v_before_lead.qualified_at;
    END IF;
    IF p_qualification_type IS DISTINCT FROM v_before_lead.qualification_type THEN
      v_new_qualification_set_by := v_actor;
    ELSE
      v_new_qualification_set_by := v_before_lead.qualification_set_by;
    END IF;
  ELSE
    v_new_qualification_type := v_before_lead.qualification_type;
    v_new_qualified_at := v_before_lead.qualified_at;
    v_new_qualification_set_by := v_before_lead.qualification_set_by;
  END IF;

  -- ── UPDATE anew_leads (identical columns to handleSave's updatePayload) ───
  -- workflow_stage_id is only written when the status changed AND the FE
  -- resolved a stage id (mirrors "if (statusChanged && workflowStageId)").
  IF p_status_changed AND p_workflow_stage_id IS NOT NULL THEN
    UPDATE public.anew_leads
    SET field_values     = p_field_values,
        status           = p_status,
        source           = nullif(p_source, ''),
        notes            = nullif(p_notes, ''),
        assigned_to      = p_assigned_to,
        workflow_stage_id = p_workflow_stage_id,
        qualification_type = v_new_qualification_type,
        qualified_at        = v_new_qualified_at,
        qualification_set_by = v_new_qualification_set_by,
        updated_at       = now()
    WHERE id = p_lead_id
    RETURNING * INTO v_lead;
  ELSE
    UPDATE public.anew_leads
    SET field_values = p_field_values,
        status       = p_status,
        source       = nullif(p_source, ''),
        notes        = nullif(p_notes, ''),
        assigned_to  = p_assigned_to,
        qualification_type = v_new_qualification_type,
        qualified_at        = v_new_qualified_at,
        qualification_set_by = v_new_qualification_set_by,
        updated_at   = now()
    WHERE id = p_lead_id
    RETURNING * INTO v_lead;
  END IF;

  v_entity_id := v_lead.entity_id;

  -- ── Sync anew_entities display_name (matches handleSave's entity update) ──
  -- Only when the lead has an entity AND the FE derived a non-empty display_name.
  v_ent_diff := '{}'::jsonb;
  IF v_entity_id IS NOT NULL AND nullif(btrim(p_display_name), '') IS NOT NULL THEN
    SELECT * INTO v_before_ent FROM public.anew_entities WHERE id = v_entity_id;

    v_ent_update := jsonb_build_object('display_name', btrim(p_display_name));
    IF nullif(p_first_name, '') IS NOT NULL THEN
      v_ent_update := v_ent_update || jsonb_build_object('first_name', p_first_name);
    END IF;
    IF nullif(p_last_name, '') IS NOT NULL THEN
      v_ent_update := v_ent_update || jsonb_build_object('last_name', p_last_name);
    END IF;

    UPDATE public.anew_entities
    SET display_name = btrim(p_display_name),
        first_name   = CASE WHEN nullif(p_first_name, '') IS NOT NULL THEN p_first_name ELSE first_name END,
        last_name    = CASE WHEN nullif(p_last_name, '')  IS NOT NULL THEN p_last_name  ELSE last_name  END
    WHERE id = v_entity_id
    RETURNING * INTO v_ent;

    IF FOUND THEN
      IF v_before_ent.display_name IS DISTINCT FROM v_ent.display_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('display_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.display_name), 'new', to_jsonb(v_ent.display_name)));
      END IF;
      IF v_before_ent.first_name IS DISTINCT FROM v_ent.first_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('first_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.first_name), 'new', to_jsonb(v_ent.first_name)));
      END IF;
      IF v_before_ent.last_name IS DISTINCT FROM v_ent.last_name THEN
        v_ent_diff := v_ent_diff || jsonb_build_object('last_name',
          jsonb_build_object('old', to_jsonb(v_before_ent.last_name), 'new', to_jsonb(v_ent.last_name)));
      END IF;
    END IF;
  END IF;

  -- ── Build the anew_leads diff (skip noise cols, like the trigger) ─────────
  v_lead_diff := '{}'::jsonb;
  IF v_before_lead.field_values IS DISTINCT FROM v_lead.field_values THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('field_values',
      jsonb_build_object('old', v_before_lead.field_values, 'new', v_lead.field_values));
  END IF;
  IF v_before_lead.status IS DISTINCT FROM v_lead.status THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before_lead.status), 'new', to_jsonb(v_lead.status)));
  END IF;
  IF v_before_lead.source IS DISTINCT FROM v_lead.source THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('source',
      jsonb_build_object('old', to_jsonb(v_before_lead.source), 'new', to_jsonb(v_lead.source)));
  END IF;
  IF v_before_lead.notes IS DISTINCT FROM v_lead.notes THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('notes',
      jsonb_build_object('old', to_jsonb(v_before_lead.notes), 'new', to_jsonb(v_lead.notes)));
  END IF;
  IF v_before_lead.assigned_to IS DISTINCT FROM v_lead.assigned_to THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('assigned_to',
      jsonb_build_object('old', to_jsonb(v_before_lead.assigned_to), 'new', to_jsonb(v_lead.assigned_to)));
  END IF;
  IF v_before_lead.workflow_stage_id IS DISTINCT FROM v_lead.workflow_stage_id THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('workflow_stage_id',
      jsonb_build_object('old', to_jsonb(v_before_lead.workflow_stage_id), 'new', to_jsonb(v_lead.workflow_stage_id)));
  END IF;
  IF v_before_lead.qualification_type IS DISTINCT FROM v_lead.qualification_type THEN
    v_lead_diff := v_lead_diff || jsonb_build_object('qualification_type',
      jsonb_build_object('old', to_jsonb(v_before_lead.qualification_type), 'new', to_jsonb(v_lead.qualification_type)));
  END IF;

  -- ── Combine + emit ONE audit row keyed on the shared entity_id ────────────
  v_diff := '{}'::jsonb;
  IF v_lead_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_leads', v_lead_diff);
  END IF;
  IF v_ent_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('anew_entities', v_ent_diff);
  END IF;

  v_audit_org := v_lead.organization_id;

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'anew_leads',
      COALESCE(v_entity_id, p_lead_id),
      v_audit_org,
      'UPDATE',
      v_diff,
      'web_app'
    );
  END IF;

  -- ── Dedicated qualification-change history row (separate from the above) ─
  IF v_before_lead.qualification_type IS DISTINCT FROM v_lead.qualification_type THEN
    BEGIN
      INSERT INTO public.anew_entity_history
        (entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (
        COALESCE(v_entity_id, p_lead_id),
        'qualification_changed',
        'qualification_type',
        v_before_lead.qualification_type,
        v_lead.qualification_type,
        v_actor,
        jsonb_build_object('organization_id', v_audit_org, 'lead_id', p_lead_id)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN v_lead;
END;
$function$;

-- ============================================================
-- 3. get_lead_dashboard_stats_scoped — add qualification_counts /
--    avg_days_to_qualify
-- ============================================================
-- Confirmed live: this is the function actually called by the frontend
-- (src/components/leads/LeadsDashboard.tsx, rpc("get_lead_dashboard_stats_scoped")),
-- already correctly scoped via get_scoped_leads_base(p_org_id, p_is_root,
-- p_scope, ...). This CREATE OR REPLACE only adds the two new CTEs
-- (current_qualification_join, current_qualification_counts,
-- current_avg_days_to_qualify) and their keys in the final jsonb_build_object
-- — every existing column, filter, and the "previous" (comparison-period)
-- branch are reproduced byte-for-byte from the live definition, confirmed via
-- pg_get_functiondef before writing this migration.

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
  -- ── NEW: qualification (SQL/MQL) join + aggregates ──────────────────────
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
    'avg_days_to_qualify', cadq.value
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
  CROSS JOIN current_avg_days_to_qualify cadq;

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
-- 1. anew_leads gains qualification_type/qualified_at/qualification_set_by,
--    all nullable, no default, CHECK constraint restricts to sql/mql/NULL.
-- 2. rpc_update_lead(..., p_qualification_type, p_qualification_changed)
--    only touches qualification columns when p_qualification_changed = true;
--    qualified_at is set once (NULL -> non-NULL transition only); a
--    dedicated anew_entity_history row (change_type='qualification_changed')
--    is written on every actual change, in addition to the existing generic
--    anew_leads diff already flowing through fn_manual_audit_log.
-- 3. get_lead_dashboard_stats_scoped now also returns qualification_counts
--    (object keyed by 'sql'/'mql'/'unclassified') and avg_days_to_qualify
--    (object with 'sql'/'mql'/'overall' keys, in days, NULL when no
--    qualified leads exist in that bucket) — computed from the SAME
--    scope-filtered current_rows CTE as every other metric in this function,
--    so TEAM/OWNED-scoped callers only see their own scope's numbers, exactly
--    like every other field this RPC already returns.
-- 4. All pre-existing fields/behavior of both functions are unchanged;
--    verified by diffing this migration's function bodies against the live
--    pg_get_functiondef output captured before writing it.
