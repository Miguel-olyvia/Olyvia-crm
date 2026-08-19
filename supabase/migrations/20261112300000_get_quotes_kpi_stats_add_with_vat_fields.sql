-- Estende get_quotes_kpi_stats() (20261112050000_get_quotes_kpi_stats_use_subtotal.sql,
-- que ja soma quotes.subtotal como valor principal, sem IVA) para devolver
-- ADICIONALMENTE os totais COM IVA, somando quotes.total nas mesmas
-- condicoes/filtros ja usados (mesma CTE "base", mesmos filtros de scope,
-- pesquisa, datas, comercial e estado). Nenhuma chave existente e removida
-- ou alterada — apenas novas chaves acrescentadas ao JSON de retorno:
--   totalValueWithVat, aceiteValueWithVat
--
-- CORRIGE TAMBEM um bug herdado ja em producao: a CTE "base" fazia
-- "SELECT estado, subtotal AS total, ..." sem somar total_fees. Confirmado em
-- src/utils/quotes/computeQuoteTotals.ts (fonte de verdade do calculo) que
-- quotes.total_fees e o valor das taxas de servico JA SEM IVA
-- (totalFeesValueRounded, gravado tal-e-qual — ver
-- 20261112240000_rpc_save_quote_add_lost_reason.sql), pelo que o valor
-- liquido real de uma quote e (subtotal + total_fees), nao so subtotal. Todos
-- os *Value existentes (totalValue, aceiteValue, etc.) passam a refletir este
-- valor correto.

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
      SELECT estado, (subtotal + COALESCE(total_fees, 0)) AS total, total AS total_com_iva, created_at, accepted_at
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
          ('rascunho','enviado','aceite','perdido','finalizado','rejeitado')), 0)        AS outros_value,
        COALESCE(SUM(total_com_iva), 0)                                                 AS total_value_with_vat,
        COALESCE(SUM(total_com_iva) FILTER (WHERE estado = 'aceite'), 0)                AS aceite_value_with_vat
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
      'total',              a.total,
      'rascunho',           a.rascunho,
      'enviado',            a.enviado,
      'aceite',             a.aceite,
      'perdido',            a.perdido,
      'finalizado',         a.finalizado,
      'rejeitado',          a.rejeitado,
      'outros',             a.outros,
      'totalValue',         a.total_value,
      'rascunhoValue',      a.rascunho_value,
      'enviadoValue',       a.enviado_value,
      'aceiteValue',        a.aceite_value,
      'perdidoValue',       a.perdido_value,
      'finalizadoValue',    a.finalizado_value,
      'rejeitadoValue',     a.rejeitado_value,
      'outrosValue',        a.outros_value,
      'avgValue',           CASE WHEN a.total > 0 THEN a.total_value / a.total ELSE 0 END,
      'taxaAceitacao',      CASE WHEN a.total > 0
                              THEN ROUND((a.aceite::numeric / a.total) * 100)
                              ELSE 0 END,
      'avgAcceptTime',      COALESCE((SELECT avg_days FROM accept_time), 0),
      'totalValueWithVat',  a.total_value_with_vat,
      'aceiteValueWithVat', a.aceite_value_with_vat
    )
    FROM agg a
  );
END;
$function$
;
