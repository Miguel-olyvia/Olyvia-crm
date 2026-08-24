-- ============================================================================
-- proposals_list_filtered(): resolver a ultima interacao POR CONJUNTO em vez
-- de por linha. Sem isto a listagem de Propostas nao abre de todo.
--
-- SINTOMA MEDIDO. Com a versao de 20261113070000, /proposals em producao
-- devolvia dois 500 seguidos e a tabela ficava a zero linhas:
--
--   500 rpc/get_proposals_list_page    :: 57014 canceling statement due to statement timeout
--   500 rpc/get_proposals_list_metrics :: 57014 canceling statement due to statement timeout
--
-- O role `authenticated` -- o que o PostgREST usa -- tem
-- `statement_timeout=8s` (o `anon` tem 3s). Pela ligacao direta corre-se como
-- `postgres`, que nao tem timeout NEM RLS, e por isso a versao anterior
-- passou numa verificacao que so provava a CORRECAO dos numeros, nunca o
-- custo. Medido como `authenticated`, com RLS: `proposals_in_scope` sozinho
-- 113 ms, `proposals_list_filtered` >180 s.
--
-- CAUSA. O plano, na juncao lateral que ia buscar a ultima interacao:
--
--   ->  Index Scan using idx_entity_interactions_at on entity_interactions i
--         Filter: (<predicados de RLS> AND (entity_id = COALESCE(p.entity_id, d.entity_id)))
--
-- Repare-se que `entity_id = COALESCE(...)` aparece como **Filter** e nao como
-- Index Cond. Como a chave da juncao e uma EXPRESSAO sobre uma coluna vinda de
-- outra juncao (`d.entity_id`, do left join a `deals`), o planeador nao a pode
-- usar como condicao de indice; escolhe o indice por `interaction_at DESC`
-- (por causa do ORDER BY ... LIMIT 1) e percorre-o de cima ate encontrar a
-- entidade certa, avaliando os predicados de RLS de `entity_interactions`
-- linha a linha. Para uma proposta cuja entidade nao tem interacoes nenhumas,
-- isso e a tabela inteira. Vezes 522 propostas.
--
-- Nao era o `auth.uid()` sem `(select ...)` -- isso ja se mediu noutro
-- contexto e vale ~1%. E tambem nao sao, aqui, as funcoes de RLS que recebem
-- colunas da linha: essas custam, mas o que fazia explodir era serem
-- executadas sobre um varrimento praticamente completo do indice.
--
-- CORRECAO. Resolver as entidades primeiro e agregar de uma vez:
--   1. `scoped` materializa as propostas do ambito com a entidade ja resolvida
--      (`eid`), de modo que `eid` passe a ser uma COLUNA e nao uma expressao;
--   2. `visible_entities` mantem a regra do cliente -- so contam entidades
--      visiveis em `anew_entities`, que era de onde `get_entity_contact_summary`
--      partia;
--   3. `last_interactions` faz um `max(interaction_at)` agrupado sobre as
--      entidades desse conjunto, um passo unico com `idx_entity_interactions_entity`,
--      em vez de 522 varrimentos.
-- Depois e um LEFT JOIN por igualdade de colunas.
--
-- `max(interaction_at)` e exatamente equivalente ao `ORDER BY interaction_at
-- DESC LIMIT 1` que estava aqui e que `get_entity_contact_summary` usa:
-- confirmado que `entity_interactions.interaction_at` e NOT NULL (17412
-- linhas, zero nulos), portanto nao ha o caso em que `DESC` traria um NULL a
-- frente por causa do NULLS FIRST implicito.
--
-- A juncao lateral a `deals` passou a LEFT JOIN simples: `deals.id` e chave
-- primaria, da no maximo uma linha, e o plano ja fazia hash join na pratica.
--
-- Nada mais muda. Os numeros devolvidos sao os mesmos -- reverificados contra
-- o algoritmo do cliente depois desta alteracao.
--
-- Aditiva: CREATE OR REPLACE de uma funcao. Sem alteracoes a tabelas, dados ou
-- politicas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proposals_list_filtered(
  _organization_id          uuid,
  _scope_mode               text,
  _scope_deal_ids           uuid[],
  _scope_created_by_ids     uuid[],
  _created_by_fallback_only boolean,
  _workflow_stage_ids       uuid[],
  _stage_filter             text,
  _search                   text,
  _search_entity_ids        uuid[],
  _date_from                timestamptz,
  _date_to                  timestamptz,
  _only_mine                uuid,
  _comercial                uuid,
  _comercial_none           boolean,
  _no_response              boolean,
  _expired                  boolean,
  _no_validity              boolean,
  _follow_up_days           integer,
  _now                      timestamptz,
  _tz                       text
)
RETURNS TABLE (
  id               uuid,
  created_at       timestamptz,
  title            text,
  value            numeric,
  value_sem_iva    numeric,
  valid_until      date,
  accepted_at      timestamptz,
  stage_id         uuid,
  stage_order      integer,
  stage_name       text,
  is_won           boolean,
  is_lost          boolean,
  is_no_response   boolean,
  is_past_validity boolean,
  has_no_validity  boolean
)
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
      OR strpos(lower(d.title), lower(_search)) > 0
      OR EXISTS (
        SELECT 1 FROM public.deals dd
        WHERE dd.id = d.deal_id
          AND strpos(lower(dd.title), lower(_search)) > 0
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
  'CONJUNTO (max agrupado) e nao por linha: como expressao COALESCE numa '
  'juncao lateral, o predicado caia para Filter em vez de Index Cond e '
  'varria o indice por data com o RLS a correr linha a linha, o que estourava '
  'o statement_timeout de 8s do role authenticated. SECURITY INVOKER.';

GRANT EXECUTE ON FUNCTION public.proposals_list_filtered(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text) TO authenticated;
