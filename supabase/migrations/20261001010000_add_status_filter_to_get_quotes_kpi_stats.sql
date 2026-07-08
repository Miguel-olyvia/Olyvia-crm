-- Add status/estado filtering to get_quotes_kpi_stats so the Quotes KPI cards
-- reflect the Estado dropdown (Rascunho/Enviado/Aceite/Perdido/Rejeitado).
--
-- Forward-only migration. The previous migration
--   20260929010000_extend_get_quotes_kpi_stats_filters.sql
-- added the p_filters jsonb parameter but never wired a status filter, so any
-- status value passed by the frontend was silently ignored.
--
-- The function signature (p_org_id uuid, p_is_parent_org boolean,
-- p_root_org_id uuid, p_filters jsonb) is UNCHANGED here: we only read one more
-- optional key from the existing p_filters bag. A plain CREATE OR REPLACE is
-- therefore sufficient (no DROP + CREATE, no new overload, no grant changes).
--
-- New p_filters key (optional; absent / json null / '' => no restriction):
--   status / estado : text -> matches quotes.estado exactly. Both key names are
--                     accepted (frontend sends 'status'); 'estado' is honoured
--                     as a fallback for callers using the Portuguese key.
--
-- Only the v_status extraction and the base-CTE WHERE clause change. The
-- bucket/aggregation math (rascunho/enviado/aceite/perdido/finalizado/
-- rejeitado/outros and their *_value sums) is intentionally left untouched.

CREATE OR REPLACE FUNCTION public.get_quotes_kpi_stats(
  p_org_id uuid,
  p_is_parent_org boolean DEFAULT false,
  p_root_org_id uuid DEFAULT NULL::uuid,
  p_filters jsonb DEFAULT '{}'::jsonb
)
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
      SELECT estado, total, created_at, accepted_at
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
$function$;
