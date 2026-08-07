-- Regista em migration a alteracao ja aplicada diretamente na base de dados:
-- get_quotes_kpi_stats() passou a somar quotes.subtotal (valor liquido, sem
-- IVA) em vez de quotes.total (valor com IVA). Como todos os KPIs derivam da
-- CTE interna "base", todos os valores (total, medias e valores por estado)
-- passaram a refletir o valor liquido dos orcamentos.
--
-- Definicao atual completa, obtida via pg_get_functiondef, reaplicada de
-- forma idempotente com CREATE OR REPLACE FUNCTION.

CREATE OR REPLACE FUNCTION public.get_quotes_kpi_stats(p_org_id uuid, p_is_parent_org boolean DEFAULT false, p_root_org_id uuid DEFAULT NULL::uuid, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_filters     jsonb       := COALESCE(p_filters, '{}'::jsonb);
  v_visible_ids jsonb       := v_filters->'visible_ids';
  v_search      text        := NULLIF(v_filters->>'search', '');
  v_date_from   timestamptz := NULLIF(v_filters->>'date_from', '')::timestamptz;
  v_date_to     timestamptz := NULLIF(v_filters->>'date_to', '')::timestamptz;
  v_comercial   text        := NULLIF(v_filters->>'comercial_id', '');
  v_status      text        := COALESCE(NULLIF(v_filters->>'status', ''), NULLIF(v_filters->>'estado', ''));
BEGIN
  RETURN (
    WITH base AS (
      SELECT estado, subtotal AS total, created_at, accepted_at
      FROM quotes
      WHERE deleted_at IS NULL
        AND CASE
              WHEN p_is_parent_org THEN root_organization_id = p_root_org_id
              ELSE organization_id = p_org_id
            END
        -- permission scope: visible_ids (NULL / json null / absent => unrestricted)
        AND (
          v_visible_ids IS NULL
          OR jsonb_typeof(v_visible_ids) = 'null'
          OR id IN (SELECT (jsonb_array_elements_text(v_visible_ids))::uuid)
        )
        -- search on quote_number
        AND (v_search IS NULL OR quote_number ILIKE '%' || v_search || '%')
        -- created_at range
        AND (v_date_from IS NULL OR created_at >= v_date_from)
        AND (v_date_to   IS NULL OR created_at <= v_date_to)
        -- commercial owner (assigned_to); 'none' sentinel => unassigned
        AND (
          v_comercial IS NULL
          OR (v_comercial = 'none' AND assigned_to IS NULL)
          OR (v_comercial <> 'none' AND assigned_to = v_comercial::uuid)
        )
        -- status / estado exact match
        AND (v_status IS NULL OR estado = v_status)
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
$function$
;
