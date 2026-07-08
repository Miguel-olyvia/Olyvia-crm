-- Deals / Pedidos de Proposta: close data-exposure gap in KPI/Dashboard stats.
--
-- Problem: get_deals_kpi_stats(p_org_ids uuid[]) aggregated over the whole org
-- with no ownership scoping and no display-filter awareness, so a TEAM/OWNED
-- scoped user saw KPI cards + Dashboard tab computed over the entire org, and
-- the numbers ignored stage/date/search filters that List and Kanban apply.
--
-- Fix (forward-only, new migration): replace the function with a version that
-- adds a security-critical ownership predicate (p_scope + p_scope_user_ids) and
-- optional display filters (p_filters jsonb). All existing aggregate math is
-- preserved verbatim; only the base CTE WHERE clause gains new predicates.
--
-- p_scope:          'ORG' (full scope, no ownership restriction) or anything
--                   else (e.g. 'TEAM_OR_OWNED') to restrict by owner.
-- p_scope_user_ids: internal user ids allowed when scope is not full. NULL is
--                   treated as "no restriction" (defensive; callers pass the
--                   scoped ids for non-full scope).
-- p_filters:        { stage_id, date_from, date_to, deal_ids } — all optional.
--                   A missing/JSON-null key means "do not filter on it".
--                   deal_ids as an array (even empty) is applied as an IN list.

DROP FUNCTION IF EXISTS public.get_deals_kpi_stats(uuid[]);

CREATE OR REPLACE FUNCTION public.get_deals_kpi_stats(
  p_org_ids        uuid[],
  p_scope          text  DEFAULT 'ORG',
  p_scope_user_ids uuid[] DEFAULT NULL,
  p_filters        jsonb DEFAULT '{}'::jsonb
)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN (
    WITH base AS (
      SELECT
        d.id,
        d.value,
        d.created_at,
        ds.is_won,
        ds.is_lost,
        ds.is_final,
        ds.id AS stage_id
      FROM deals d
      LEFT JOIN deal_stages ds ON d.stage_id = ds.id
      WHERE d.deleted_at IS NULL
        AND d.organization_id = ANY(p_org_ids)
        -- Ownership predicate (security-critical): restrict to owned/team rows
        -- unless the caller has full (ORG) scope.
        AND (
          p_scope = 'ORG'
          OR p_scope_user_ids IS NULL
          OR d.assigned_to = ANY(p_scope_user_ids)
          OR d.created_by  = ANY(p_scope_user_ids)
        )
        -- Optional display filters (mirror List/Kanban filtering).
        AND (
          (p_filters->>'stage_id') IS NULL
          OR d.stage_id = (p_filters->>'stage_id')::uuid
        )
        AND (
          (p_filters->>'date_from') IS NULL
          OR d.created_at >= (p_filters->>'date_from')::timestamptz
        )
        AND (
          (p_filters->>'date_to') IS NULL
          OR d.created_at <= (p_filters->>'date_to')::timestamptz
        )
        AND (
          NOT (p_filters ? 'deal_ids')
          OR jsonb_typeof(p_filters->'deal_ids') <> 'array'
          OR d.id IN (
            SELECT (jsonb_array_elements_text(p_filters->'deal_ids'))::uuid
          )
        )
    ),
    by_stage AS (
      SELECT
        stage_id,
        COUNT(*)::int           AS cnt,
        COALESCE(SUM(value), 0) AS val
      FROM base
      GROUP BY stage_id
    ),
    totals AS (
      SELECT COUNT(*)::int AS cnt, COALESCE(SUM(value), 0) AS val FROM base
    ),
    won AS (
      SELECT COUNT(*)::int AS cnt, COALESCE(SUM(value), 0) AS val FROM base WHERE is_won
    ),
    lost AS (
      SELECT COUNT(*)::int AS cnt FROM base WHERE is_lost
    ),
    stalled AS (
      SELECT COUNT(*)::int AS cnt, COALESCE(SUM(value), 0) AS val
      FROM base
      WHERE NOT COALESCE(is_final, false)
        AND EXTRACT(EPOCH FROM (now() - created_at)) / 86400 > 30
    ),
    open_d AS (
      SELECT COUNT(*)::int AS cnt, COALESCE(SUM(value), 0) AS val
      FROM base
      WHERE NOT COALESCE(is_final, false)
    )
    SELECT json_build_object(
      'total',            (SELECT cnt FROM totals),
      'totalValue',       (SELECT val FROM totals),
      'wonCount',         (SELECT cnt FROM won),
      'wonValue',         (SELECT val FROM won),
      'lostCount',        (SELECT cnt FROM lost),
      'conversionRate',   CASE WHEN (SELECT cnt FROM totals) > 0
                            THEN ROUND(((SELECT cnt FROM won)::numeric / (SELECT cnt FROM totals)) * 100, 1)
                            ELSE 0 END,
      'avgCloseTimeDays', CASE WHEN (SELECT cnt FROM won) > 0
                            THEN ROUND((
                              SELECT AVG(EXTRACT(EPOCH FROM (now() - created_at)) / 86400)
                              FROM base WHERE is_won
                            ))
                            ELSE 0 END,
      'stalledCount',     (SELECT cnt FROM stalled),
      'stalledValue',     (SELECT val FROM stalled),
      'openCount',        (SELECT cnt FROM open_d),
      'openValue',        (SELECT val FROM open_d),
      'stageStats',       (SELECT json_object_agg(stage_id::text, cnt) FROM by_stage),
      'stageValues',      (SELECT json_object_agg(stage_id::text, val) FROM by_stage)
    )
  );
END;
$function$;
