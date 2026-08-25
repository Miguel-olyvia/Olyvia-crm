-- Pesquisa por TITULO nas Propostas: palavra a palavra, em qualquer ordem.
--
-- DEFEITO
-- public.proposals_list_filtered() pesquisava o titulo por FRASE UNICA:
--
--     OR strpos(lower(d.title), lower(_search)) > 0
--     OR EXISTS (SELECT 1 FROM public.deals dd
--                 WHERE dd.id = d.deal_id
--                   AND strpos(lower(dd.title), lower(_search)) > 0)
--
-- Procurar "remodelacao ferreira" nao encontrava "Remodelacao Cozinha Parcial
-- - Suellem Ferreira": as palavras estao la, mas nao contiguas nem por aquela
-- ordem. Medido ao vivo como `authenticated` contra o remoto ANTES desta
-- migration: "remodelacao silva" -> 0 linhas, "remodelacao cozinha ferreira"
-- -> 0 linhas, ambas com correspondencias reais na base.
--
-- CORRECAO
-- Cada palavra do termo tem de aparecer ALGURES em proposals.search_text --
-- a coluna denormalizada que ja existe desde 20261113160000 (titulo da
-- proposta + titulo do negocio + search_text da entidade), mantida por
-- trigger e coberta por indice GIN trigram, e que ate agora ninguem lia.
-- E a mesma regra do lado do cliente (anew_entities.search_text) e dos
-- Orcamentos (get_quotes_kpi_stats), e o mesmo split que
-- src/lib/searchTextFilter.ts faz em TypeScript.
--
-- O que NAO muda: _search_entity_ids (NIF, resolvido pela Edge Function)
-- continua OR'd por cima, exactamente como estava.
--
-- BASE DESTA VERSAO
-- O corpo abaixo e o da funcao VIVA no remoto (extraido com
-- pg_get_functiondef, nao de um ficheiro de migration, porque houve
-- reposicoes), ou seja a versao de 20261113180000, com a resolucao da ultima
-- interacao POR CONJUNTO (scoped / visible_entities / last_interactions
-- MATERIALIZED). Apenas tres coisas mudam:
--   1. `scoped` passa a levar p.search_text;
--   2. `derived` expoe s.search_text;
--   3. o predicado de pesquisa acima.
-- Nada mais no corpo foi tocado. Isto e deliberado: hoje a 20261113160000 fez
-- CREATE OR REPLACE nesta funcao com uma assinatura identica, trocando ao
-- mesmo tempo o predicado E a resolucao da ultima interacao pela forma
-- lateral por linha; o db push passou verde e a pagina passou a dar
-- "canceling statement due to statement timeout" com zero propostas. Foi
-- reposta pela 20261113180000.
--
-- MEDICAO (ao vivo, contra o remoto, como `authenticated` com RLS e o
-- statement_timeout de 8s desse role -- nao como `postgres`. EXPLAIN
-- (ANALYZE, BUFFERS) sobre get_proposals_list_page com os argumentos
-- EXACTOS capturados do browser na org Mudelar (560 propostas, ORG,
-- created_at desc, limite 25, offset 0). Antes e depois medidos NO MESMO
-- INSTANTE, na mesma transaccao e na mesma ligacao: para cada termo mede-se
-- a versao viva, instala-se esta versao num SAVEPOINT, mede-se de novo e
-- faz-se ROLLBACK. Mediana de 5 corridas cada.
--
--   termo                          | ANTES                    | DEPOIS
--   -------------------------------+--------------------------+--------------------------
--   (sem pesquisa)                 | 262,0 ms  233 729 blk 25 | 253,7 ms  233 729 blk 25
--   "remodelacao"                  | 246,4 ms  234 915 blk 25 | 234,9 ms  233 144 blk 25
--   "remodelacao silva"            | 110,9 ms  104 400 blk  0 | 255,9 ms  232 668 blk 18
--   "remodelacao cozinha ferreira" | 114,8 ms  104 400 blk  0 | 235,2 ms  232 638 blk  3
--
-- Leitura dos buffers, que era a condicao desta tarefa:
--   * sem pesquisa -- o unico caso em que as duas versoes devolvem
--     exactamente o mesmo conjunto, e por isso o unico comparavel linha a
--     linha -- ficam IGUAIS: 233 729 blocos nos dois lados.
--   * uma palavra: DESCE, 234 915 -> 233 144. A subconsulta correlacionada a
--     public.deals desapareceu (o titulo do negocio ja esta em search_text) e
--     com ela uma passagem com RLS por linha.
--   * duas e tres palavras: sobem face ao ANTES, mas o ANTES devolvia ZERO
--     linhas -- e o defeito. Ler menos por nao encontrar nada nao e uma
--     poupanca. O tecto real e o caso sem pesquisa, 233 729, e nenhum caso
--     novo o ultrapassa: 233 144 / 232 668 / 232 638 ficam todos ABAIXO.
--
-- O custo de base desta funcao -- 233 729 buffers (~1,8 GB) para devolver 25
-- linhas -- ja existia antes desta migration e NAO e resolvido por ela. Fica
-- registado porque a margem para o statement_timeout de 8s do role
-- authenticated e pequena e so nao aparece porque esta tudo em cache
-- (Shared Read Blocks = 0 em todas as corridas).
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
      COALESCE(p.entity_id, dl.entity_id) AS eid
    FROM public.proposals_in_scope(
           _organization_id, _scope_mode, _scope_deal_ids,
           _scope_created_by_ids, _created_by_fallback_only
         ) p
    LEFT JOIN public.deals dl ON dl.id = p.deal_id
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
    SELECT i.entity_id, max(i.interaction_at) AS interaction_at
    FROM public.entity_interactions i
    WHERE i.entity_id IN (SELECT ve.id FROM visible_entities ve)
    GROUP BY i.entity_id
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
$function$
;

COMMENT ON FUNCTION public.proposals_list_filtered(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text) IS
  'Ambito resolvido + filtros da UI da listagem de Propostas, com o estado '
  'resolvido e as flags derivadas. Base unica da pagina e das metricas para '
  'que nao possam divergir. A ultima interacao por entidade e resolvida POR '
  'CONJUNTO (max agrupado) e nao por linha: como expressao COALESCE numa '
  'juncao lateral, o predicado caia para Filter em vez de Index Cond e '
  'varria o indice por data com o RLS a correr linha a linha, o que estourava '
  'o statement_timeout de 8s do role authenticated. A pesquisa e palavra a '
  'palavra contra proposals.search_text (AND entre palavras, ordem '
  'irrelevante), nao strpos de frase unica; o NIF continua a entrar por '
  '_search_entity_ids. SECURITY INVOKER.';

GRANT EXECUTE ON FUNCTION public.proposals_list_filtered(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text) TO authenticated;
