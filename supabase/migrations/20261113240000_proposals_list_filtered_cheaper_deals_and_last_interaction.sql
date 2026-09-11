-- Custo da listagem de Propostas: menos trabalho por linha nas duas partes
-- caras de public.proposals_list_filtered.
--
-- MEDICAO (remoto, como `authenticated` com RLS, claims reais do utilizador
-- carvalhomiguel319@gmail.com, org Mudelar, EXPLAIN (ANALYZE, BUFFERS),
-- mediana de 5 execucoes, 527 propostas visiveis):
--
--   get_proposals_list_page(25 linhas)   243.6 ms  233 940 buffers  (antes)
--                                        131.2 ms   99 166 buffers  (depois)
--   get_proposals_list_metrics           251.9 ms  233 940 buffers  (antes)
--                                        137.0 ms   99 166 buffers  (depois)
--
-- Shared Read Blocks era 0 nas duas: 233 940 buffers sao ~1,8 GB de paginas
-- lidas da cache. Com a cache fria, ou com mais propostas, isto e o que se
-- aproxima do statement_timeout de 8s do role authenticated.
--
-- ONDE ESTAVA O TRABALHO DESPERDICADO
--
-- 1. LEFT JOIN public.deals (63 168 buffers, 27% do total)
--    O join servia so para o fallback COALESCE(p.entity_id, dl.entity_id).
--    O planeador materializava a tabela toda em hash: varrimento sequencial
--    de 1001 negocios, com as politicas RLS de deals a correr LINHA A LINHA
--    (~63 buffers por linha, dominados por is_system_admin(auth.uid()), que
--    o Postgres nao pode cachear dentro de um Filter). Na org Mudelar apenas
--    11 das 527 propostas nao tem entity_id proprio. Passa a subconsulta
--    escalar guardada por CASE: 11 acessos por deals_pkey, 451 buffers.
--    (Uma juncao LATERAL nao chega -- o planeador volta a converte-la em
--    Hash Left Join com `Join Filter: (p.entity_id IS NULL)` e a varrer a
--    tabela toda na mesma; medido.)
--
-- 2. max(interaction_at) agrupado sobre entity_interactions
--    (99 385 buffers, 42% do total)
--    O GROUP BY tinha de ler as 1540 interacoes das 452 entidades visiveis e
--    aplicar o RLS de entity_interactions a cada uma. Como so interessa o
--    maximo por entidade, passa a top-1 por entidade sobre um indice novo
--    (entity_id, interaction_at DESC NULLS LAST): 452 linhas examinadas em
--    vez de 1540, 27 247 buffers.
--
--    NULLS LAST e deliberado: replica max(), que ignora NULLs. Sem ele, uma
--    interacao com interaction_at NULL ficava em primeiro num ORDER BY DESC.
--
--    Isto NAO reintroduz a resolucao por linha que partiu a producao em
--    20261113160000: a forma set-based mantem-se (scoped / visible_entities /
--    last_interactions, todas MATERIALIZED), o predicado continua a ser
--    Index Cond sobre uma coluna concreta, e o lateral corre uma vez por
--    ENTIDADE VISIVEL (452), nao uma vez por proposta com o indice por data.
--
-- EQUIVALENCIA VERIFICADA antes de aplicar, na mesma transacao, com ROLLBACK:
-- resultado completo de proposals_list_filtered (todas as colunas, ORDER BY
-- id) e de get_proposals_list_metrics comparado byte a byte entre a versao
-- viva e esta, em 14 combinacoes de filtros (sem filtro, por estado, estado
-- 'all', pesquisa de uma e de duas palavras, pesquisa por entidade, intervalo
-- de datas, sem resposta, expiradas, sem validade, sem comercial,
-- follow_up_days=0, fuso UTC, ambito DEAL) e os ids de
-- get_proposals_list_page nas 5 ordenacoes. Zero diferencas.
--
-- NAO SE MEXEU na pesquisa por titulo palavra a palavra de 20261113220000,
-- nem nas assinaturas, nem em get_proposals_list_page / _metrics.
--
-- CAUSA DE FUNDO QUE ESTA MIGRATION NAO RESOLVE: o custo restante (99 166
-- buffers) e quase todo is_system_admin(auth.uid()) avaliado uma vez por
-- linha dentro das politicas restritivas `system_admin_pii_default_deny`
-- (27 tabelas). Uma chamada isolada custa 80 buffers. Envolve-la numa
-- subconsulta escalar tornaria-a um InitPlan avaliado uma unica vez por
-- query, mas isso e uma alteracao as politicas RLS de 27 tabelas e sai do
-- ambito desta migration.
--
-- Timestamp 240000 e nao 230000: a versao 20261113230000
-- (bulk_import_products_sync_item_suppliers) ja esta registada em
-- supabase_migrations.schema_migrations no remoto, apesar de o ficheiro local
-- correspondente nao existir no repositorio. Reutilizar esse timestamp faria o
-- db push saltar esta migration em silencio.
--
-- Forward-only: nao se editou nenhuma migration ja aplicada. O corpo abaixo
-- parte da versao VIVA extraida do remoto com pg_get_functiondef (soma de
-- 20261113180000 + 20261113220000), nao de um ficheiro de migration.

-- Suporta o top-1 por entidade em last_interactions. Sem ele o lateral
-- ordena as interacoes de cada entidade e a poupanca desaparece (medido:
-- 171 217 buffers sem indice, 99 166 com indice).
CREATE INDEX IF NOT EXISTS idx_entity_interactions_entity_at
  ON public.entity_interactions (entity_id, interaction_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.proposals_list_filtered(_organization_id uuid, _scope_mode text, _scope_deal_ids uuid[], _scope_created_by_ids uuid[], _created_by_fallback_only boolean, _workflow_stage_ids uuid[], _stage_filter text, _search text, _search_entity_ids uuid[], _date_from timestamp with time zone, _date_to timestamp with time zone, _only_mine uuid, _comercial uuid, _comercial_none boolean, _no_response boolean, _expired boolean, _no_validity boolean, _follow_up_days integer, _now timestamp with time zone, _tz text)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, title text, value numeric, value_sem_iva numeric, valid_until date, accepted_at timestamp with time zone, stage_id uuid, stage_order integer, stage_name text, is_won boolean, is_lost boolean, is_no_response boolean, is_past_validity boolean, has_no_validity boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- MATERIALIZED de proposito: `eid` tem de ficar uma coluna concreta antes de
  -- servir de chave de juncao, senao volta a ser uma expressao e o planeador
  -- volta a cair no varrimento do indice por data.
  WITH scoped AS MATERIALIZED (
    SELECT
      p.id,
      p.created_at,
      p.title,
      p.value,
      p.value_sem_iva,
      p.valid_until,
      p.accepted_at,
      p.status,
      p.deal_id,
      p.entity_id,
      p.assigned_to,
      p.sent_at,
      p.stage_id,
      p.search_text,
      -- Antes: LEFT JOIN public.deals. O planeador materializava a tabela
      -- inteira em hash (varrimento sequencial de ~1000 negocios com RLS por
      -- linha, 63k buffers) so para recuperar o entity_id dos poucos casos em
      -- que a proposta nao tem entidade propria. Aqui sao 11 em 527. A
      -- subconsulta escalar guardada pelo CASE so corre nessas 11 linhas, por
      -- indice primario, e devolve exactamente o mesmo valor.
      CASE
        WHEN p.entity_id IS NOT NULL THEN p.entity_id
        ELSE (SELECT d0.entity_id FROM public.deals d0 WHERE d0.id = p.deal_id)
      END AS eid
    FROM public.proposals_in_scope(
           _organization_id, _scope_mode, _scope_deal_ids,
           _scope_created_by_ids, _created_by_fallback_only
         ) p
  ),
  -- O cliente so tinha ultima interacao para entidades que
  -- get_entity_contact_summary devolvia, e essa parte de anew_entities: uma
  -- entidade que o RLS esconda nao tinha entrada nenhuma no mapa.
  visible_entities AS MATERIALIZED (
    SELECT e.id
    FROM public.anew_entities e
    WHERE e.id IN (SELECT s.eid FROM scoped s WHERE s.eid IS NOT NULL)
  ),
  last_interactions AS MATERIALIZED (
    SELECT ve.id AS entity_id, li.interaction_at
    FROM visible_entities ve
    CROSS JOIN LATERAL (
      SELECT i.interaction_at
      FROM public.entity_interactions i
      WHERE i.entity_id = ve.id
      ORDER BY i.interaction_at DESC NULLS LAST
      LIMIT 1
    ) li
  ),
  derived AS (
    SELECT
      s.id,
      s.created_at,
      s.title,
      s.value,
      s.value_sem_iva,
      s.valid_until,
      s.accepted_at,
      s.status,
      s.deal_id,
      s.entity_id,
      s.assigned_to,
      s.search_text,
      COALESCE(emb.id, fb.id)                   AS r_stage_id,
      COALESCE(emb.stage_order, fb.stage_order) AS r_stage_order,
      COALESCE(emb.name, fb.name)               AS r_stage_name,
      COALESCE(emb.is_won, fb.is_won, false)    AS r_is_won,
      COALESCE(emb.is_lost, fb.is_lost, false)  AS r_is_lost,
      -- "sem resposta ha N dias": dias desde o mais recente entre o envio da
      -- proposta e a ultima atividade registada para a entidade. Usar so
      -- created_at fazia o indicador piscar para sempre por muitos contactos
      -- que se registassem -- e a mesma regra do cliente.
      public.difference_in_days_local(
        _now,
        CASE
          WHEN li.interaction_at IS NOT NULL
           AND li.interaction_at > COALESCE(s.sent_at, s.created_at)
            THEN li.interaction_at
          ELSE COALESCE(s.sent_at, s.created_at)
        END,
        _tz
      ) AS follow_up_days
    FROM scoped s
    LEFT JOIN public.proposal_workflow_stages emb
      ON emb.id = s.stage_id
    LEFT JOIN LATERAL (
      SELECT w.id, w.name, w.stage_order, w.is_won, w.is_lost
      FROM public.proposal_workflow_stages w
      WHERE emb.id IS NULL
        AND w.id = ANY (_workflow_stage_ids)
        AND w.name = s.status
      ORDER BY w.stage_order, w.id
      LIMIT 1
    ) fb ON true
    LEFT JOIN last_interactions li
      ON li.entity_id = s.eid
  )
  SELECT
    d.id,
    d.created_at,
    d.title,
    d.value,
    d.value_sem_iva,
    d.valid_until,
    d.accepted_at,
    d.r_stage_id                          AS stage_id,
    d.r_stage_order                       AS stage_order,
    COALESCE(d.r_stage_name, d.status, '') AS stage_name,
    d.r_is_won                            AS is_won,
    d.r_is_lost                           AS is_lost,
    (COALESCE(d.r_stage_name, d.status, '') IN ('sent', 'enviada')
       AND d.follow_up_days > _follow_up_days) AS is_no_response,
    (d.valid_until IS NOT NULL
       AND (d.valid_until::timestamp AT TIME ZONE _tz) < _now) AS is_past_validity,
    (d.valid_until IS NULL)               AS has_no_validity
  FROM derived d
  WHERE (_only_mine IS NULL OR d.assigned_to = _only_mine)
    AND (
      _stage_filter IS NULL
      OR _stage_filter = 'all'
      OR d.r_stage_id::text = _stage_filter
      OR d.status = _stage_filter
    )
    AND (_date_from IS NULL OR d.created_at >= _date_from)
    AND (_date_to   IS NULL OR d.created_at <= _date_to)
    AND (
      _search IS NULL
      -- Palavra a palavra, em qualquer ordem, contra proposals.search_text
      -- (titulo da proposta + titulo do negocio + search_text da entidade,
      -- ver 20261113160000). Cada palavra do termo tem de aparecer algures.
      -- Substitui o strpos de frase unica, que exigia as palavras contiguas e
      -- por ordem exacta, e substitui tambem a subconsulta correlacionada a
      -- public.deals (o titulo do negocio ja esta em search_text), poupando
      -- uma passagem com RLS por linha.
      OR NOT EXISTS (
        SELECT 1
        FROM unnest(regexp_split_to_array(lower(trim(_search)), '\s+')) AS w
        WHERE w <> ''
          AND COALESCE(d.search_text, '') NOT ILIKE '%' || w || '%'
      )
      OR (_search_entity_ids IS NOT NULL AND d.entity_id = ANY (_search_entity_ids))
    )
    AND (
      CASE
        WHEN _comercial_none        THEN d.assigned_to IS NULL
        WHEN _comercial IS NOT NULL THEN d.assigned_to = _comercial
        ELSE true
      END
    )
    AND (
      NOT _no_response
      OR (COALESCE(d.r_stage_name, d.status, '') IN ('sent', 'enviada')
          AND d.follow_up_days > _follow_up_days)
    )
    AND (
      NOT _expired
      OR (d.valid_until IS NOT NULL
          AND (d.valid_until::timestamp AT TIME ZONE _tz) < _now)
    )
    AND (NOT _no_validity OR d.valid_until IS NULL)
$function$;

COMMENT ON FUNCTION public.proposals_list_filtered(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text) IS
  'Ambito resolvido + filtros da UI da listagem de Propostas, com o estado '
  'resolvido e as flags derivadas. Base unica da pagina e das metricas para '
  'que nao possam divergir. A ultima interacao por entidade e resolvida POR '
  'CONJUNTO -- uma passagem por ENTIDADE VISIVEL, top-1 sobre o indice '
  '(entity_id, interaction_at DESC NULLS LAST) desde 20261113240000 -- e '
  'nunca por proposta: como expressao COALESCE numa '
  'juncao lateral, o predicado caia para Filter em vez de Index Cond e '
  'varria o indice por data com o RLS a correr linha a linha, o que estourava '
  'o statement_timeout de 8s do role authenticated. A pesquisa e palavra a '
  'palavra contra proposals.search_text (AND entre palavras, ordem '
  'irrelevante), nao strpos de frase unica; o NIF continua a entrar por '
  '_search_entity_ids. SECURITY INVOKER.';

GRANT EXECUTE ON FUNCTION public.proposals_list_filtered(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text) TO authenticated;
