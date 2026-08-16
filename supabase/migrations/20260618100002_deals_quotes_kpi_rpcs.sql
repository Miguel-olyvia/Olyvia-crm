-- P7: KPIs de Deals agregados no servidor
-- P8: KPIs de Quotes agregados no servidor
-- Ambas com SECURITY INVOKER — a RLS do utilizador aplica-se automaticamente

CREATE OR REPLACE FUNCTION get_deals_kpi_stats(p_org_ids uuid[])
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
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
$$;


CREATE OR REPLACE FUNCTION get_quotes_kpi_stats(
  p_org_id        uuid,
  p_is_parent_org boolean DEFAULT false,
  p_root_org_id   uuid    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN (
    WITH base AS (
      SELECT estado, total, created_at, accepted_at
      FROM quotes
      WHERE deleted_at IS NULL
        AND CASE
              WHEN p_is_parent_org THEN root_organization_id = p_root_org_id
              ELSE organization_id = p_org_id
            END
    ),
    agg AS (
      SELECT
        COUNT(*)::int                                                                    AS total,
        COUNT(*) FILTER (WHERE estado = 'rascunho')::int                                AS rascunho,
        COUNT(*) FILTER (WHERE estado = 'enviado')::int                                 AS enviado,
        COUNT(*) FILTER (WHERE estado = 'aceite')::int                                  AS aceite,
        COUNT(*) FILTER (WHERE estado = 'perdido')::int                                 AS perdido,
        COUNT(*) FILTER (WHERE estado = 'finalizado')::int                              AS finalizado,
        COUNT(*) FILTER (WHERE estado = 'rejeitado')::int                               AS rejeitado,
        COUNT(*) FILTER (WHERE estado NOT IN
          ('rascunho','enviado','aceite','perdido','finalizado','rejeitado'))::int       AS outros,
        COALESCE(SUM(total), 0)                                                         AS total_value,
        COALESCE(SUM(total) FILTER (WHERE estado = 'rascunho'), 0)                      AS rascunho_value,
        COALESCE(SUM(total) FILTER (WHERE estado = 'enviado'), 0)                       AS enviado_value,
        COALESCE(SUM(total) FILTER (WHERE estado = 'aceite'), 0)                        AS aceite_value,
        COALESCE(SUM(total) FILTER (WHERE estado = 'perdido'), 0)                       AS perdido_value,
        COALESCE(SUM(total) FILTER (WHERE estado = 'finalizado'), 0)                    AS finalizado_value,
        COALESCE(SUM(total) FILTER (WHERE estado = 'rejeitado'), 0)                     AS rejeitado_value,
        COALESCE(SUM(total) FILTER (WHERE estado NOT IN
          ('rascunho','enviado','aceite','perdido','finalizado','rejeitado')), 0)        AS outros_value
      FROM base
    ),
    accept_time AS (
      SELECT ROUND(AVG(
        EXTRACT(EPOCH FROM (accepted_at::timestamptz - created_at::timestamptz)) / 86400
      ))::int AS avg_days
      FROM base
      WHERE estado IN ('aceite', 'finalizado') AND accepted_at IS NOT NULL
    )
    SELECT json_build_object(
      'total',           a.total,
      'rascunho',        a.rascunho,
      'enviado',         a.enviado,
      'aceite',          a.aceite,
      'perdido',         a.perdido,
      'finalizado',      a.finalizado,
      'rejeitado',       a.rejeitado,
      'outros',          a.outros,
      'totalValue',      a.total_value,
      'rascunhoValue',   a.rascunho_value,
      'enviadoValue',    a.enviado_value,
      'aceiteValue',     a.aceite_value,
      'perdidoValue',    a.perdido_value,
      'finalizadoValue', a.finalizado_value,
      'rejeitadoValue',  a.rejeitado_value,
      'outrosValue',     a.outros_value,
      'avgValue',        CASE WHEN a.total > 0 THEN a.total_value / a.total ELSE 0 END,
      'taxaAceitacao',   CASE WHEN a.total > 0
                           THEN ROUND((a.aceite::numeric / a.total) * 100)
                           ELSE 0 END,
      'avgAcceptTime',   COALESCE((SELECT avg_days FROM accept_time), 0)
    )
    FROM agg a
  );
END;
$$;
