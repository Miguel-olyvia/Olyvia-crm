-- Deals / Pedidos de Proposta: fix per-stage KPI bucketing under a stage filter.
--
-- Problem: get_deals_kpi_stats computed `by_stage` (stageStats/stageValues) from
-- the fully-filtered `base` CTE. When the caller filtered by a single stage_id,
-- `by_stage` contained only that one stage's row, so every other stage key was
-- absent from the stageStats/stageValues JSON. The frontend's per-stage cards
-- (which double as clickable stage-picker buttons) then fell back to a
-- client-side UNFILTERED whole-org count for the missing keys, leaking org-wide
-- numbers instead of a properly scoped stage distribution.
--
-- Fix (forward-only, new migration): introduce a `base_all_stages` CTE that
-- duplicates `base`'s WHERE clause EXCEPT the stage_id predicate, and point only
-- `by_stage`'s GROUP BY at it. Every other aggregate (total, wonCount, lostCount,
-- openCount, stalledCount/Value, conversionRate, avgCloseTimeDays, totals/value)
-- keeps using the fully-filtered `base` verbatim — behavior unchanged for them.
--
-- Net effect: per-stage counts reflect org + ownership + date + search scope but
-- ignore the stage_id filter itself, so all stage keys are always present and the
-- stage picker shows the full distribution. Signature is unchanged, so no DROP is
-- needed; CREATE OR REPLACE is sufficient.

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
    -- Same scope as `base` but WITHOUT the stage_id predicate, so the per-stage
    -- distribution stays complete (all stage keys present) even when the caller
    -- is filtering by one stage. Used ONLY by by_stage.
    base_all_stages AS (
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
        AND (
          p_scope = 'ORG'
          OR p_scope_user_ids IS NULL
          OR d.assigned_to = ANY(p_scope_user_ids)
          OR d.created_by  = ANY(p_scope_user_ids)
        )
        -- NOTE: stage_id predicate intentionally omitted here.
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
      FROM base_all_stages
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
