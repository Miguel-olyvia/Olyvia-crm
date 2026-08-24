-- ============================================================================
-- Paginacao + metricas da listagem de Propostas.
--
-- PROBLEMA MEDIDO. /proposals carregava as 519 linhas da organizacao Mudelar
-- numa unica query sem .range() nem .limit() -- 1,03 MB de payload, ~4531 ms
-- de render mediano em build de producao. A base de dados e o numero de
-- pedidos ja tinham sido otimizados; o que faltava era o payload.
--
-- PORQUE NAO BASTAVA POR .range(). Os cartoes de KPI da pagina eram calculados
-- no cliente sobre o array completo (Proposals.tsx, ~2065-2134): valor total,
-- valor total sem IVA, taxa de conversao, tempo medio de fecho, "sem resposta"
-- e respetivos valores, contagens/valores por estado, sem validade e
-- expiradas. Paginar sem mais nada faria esses numeros passarem a refletir so
-- a pagina visivel. Daqui as funcoes abaixo.
--
-- AUTORIZACAO. A resolucao de ambito (quem ve o que) NAO esta replicada aqui.
-- Continua no TypeScript, onde esta revista: o cliente resolve
-- anew_leads -> deals -> ids e passa o ambito JA RESOLVIDO
-- (_organization_id + _scope_deal_ids + _scope_created_by_ids). Estas funcoes
-- so aplicam o predicado que lhes e dado. Foi uma escolha deliberada: e em SQL
-- duplicado que nascem os furos de isolamento entre organizacoes.
--
-- SECURITY INVOKER (o valor por omissao) DE PROPOSITO, e nunca SECURITY
-- DEFINER: proposals, proposal_workflow_stages, deals, entity_interactions,
-- anew_entities e pipeline_links sao hoje lidas pelo cliente sob RLS. Com
-- privilegio elevado estas funcoes devolveriam agregados sobre propostas que o
-- utilizador nao pode ver, o que seria exatamente a fuga que a arquitetura
-- acima procura evitar.
--
-- ARITMETICA DE DATAS. difference_in_days_local() e uma transcricao linha a
-- linha do differenceInDays do date-fns 3.6 (o que o cliente usava), incluindo
-- o compareLocalAsc em hora local e o ajuste isLastDayNotFull. Sem isso os
-- valores divergiriam do que a pagina mostrava hoje em intervalos que cruzam
-- mudanca de hora. O fuso horario e o instante de referencia sao PARAMETROS,
-- enviados pelo cliente (Intl...timeZone e um unico Date.now() por vaga), para
-- que servidor e cliente nao possam discordar sobre "agora".
--
-- Aditiva: cria funcoes novas, nao altera tabelas, dados nem politicas.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- difference_in_days_local(): differenceInDays do date-fns, em SQL.
--
-- date-fns opera em hora LOCAL, nao em UTC, e conta "dias cheios" de
-- hora-de-parede: 1 de marco a 1 de junho da sempre 92 dias mesmo quando o
-- periodo tem 92*24-1 horas por causa do horario de verao. Um simples
-- floor(epoch/86400) daria 91 nesses casos. Transcricao do algoritmo:
--
--   sign             = compareLocalAsc(left, right)
--   difference       = abs(differenceInCalendarDays(left, right))
--   left.setDate(left.getDate() - sign * difference)      -- desloca a parede
--   isLastDayNotFull = compareLocalAsc(left, right) == -sign
--   result           = sign * (difference - isLastDayNotFull)
--
-- Comparar os timestamps convertidos para hora local (AT TIME ZONE) equivale
-- ao compareLocalAsc, que compara ano/mes/dia/hora/... locais. Deslocar um
-- timestamp SEM fuso por N dias equivale ao setDate do JS: mantem a
-- hora-de-parede.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.difference_in_days_local(
  _left  timestamptz,
  _right timestamptz,
  _tz    text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT s.sign * (
    s.cal - CASE
      WHEN (CASE WHEN s.shifted > s.lb THEN 1 WHEN s.shifted < s.lb THEN -1 ELSE 0 END) = -s.sign
        THEN 1 ELSE 0
    END
  )
  FROM (
    SELECT
      b.sign,
      b.cal,
      b.lb,
      b.la - make_interval(days => b.sign * b.cal) AS shifted
    FROM (
      SELECT
        CASE WHEN a.la > a.lb THEN 1 WHEN a.la < a.lb THEN -1 ELSE 0 END AS sign,
        abs(a.la::date - a.lb::date)                                     AS cal,
        a.la,
        a.lb
      FROM (
        SELECT (_left AT TIME ZONE _tz) AS la, (_right AT TIME ZONE _tz) AS lb
      ) a
    ) b
  ) s
$function$;

COMMENT ON FUNCTION public.difference_in_days_local(timestamptz, timestamptz, text) IS
  'differenceInDays do date-fns 3.6 transcrito para SQL, em hora local do fuso '
  'recebido. Existe para que as metricas de propostas calculadas no servidor '
  'sejam identicas as que o cliente calculava com date-fns, incluindo em '
  'intervalos que cruzam mudanca de hora.';


-- ----------------------------------------------------------------------------
-- proposals_in_scope(): o predicado de ambito, num sitio so.
--
-- Recebe o ambito JA RESOLVIDO pelo cliente. _scope_mode = 'ORG' significa
-- "toda a organizacao" (o caminho de viewScope ORG / system admin).
-- _scope_mode = 'IDS' restringe a uniao dos dois arrays -- e falha FECHADA:
-- com os dois arrays nulos nao devolve nada, em vez de silenciosamente abrir
-- para a organizacao inteira.
--
-- _created_by_fallback_only reproduz uma assimetria que existe hoje no cliente
-- e que nao alterei sem pedido explicito: em ambito OWNED, a uniao por
-- created_by so e aplicada quando a consulta por deal_id nao devolveu nada
-- (Proposals.tsx: if (proposalsData.length === 0 || viewScope === "TEAM")).
-- Em TEAM a uniao e sempre aplicada, e ai a flag vem false. A CONDICAO esta
-- aqui, mas os ids -- que sao a decisao de autorizacao -- vem de fora.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proposals_in_scope(
  _organization_id          uuid,
  _scope_mode               text,
  _scope_deal_ids           uuid[],
  _scope_created_by_ids     uuid[],
  _created_by_fallback_only boolean
)
RETURNS SETOF public.proposals
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT p.*
  FROM public.proposals p
  WHERE p.organization_id = _organization_id
    AND p.deleted_at IS NULL
    AND (
      _scope_mode = 'ORG'
      OR (_scope_deal_ids IS NOT NULL AND p.deal_id = ANY (_scope_deal_ids))
      OR (
        _scope_created_by_ids IS NOT NULL
        AND p.created_by = ANY (_scope_created_by_ids)
        AND (
          NOT _created_by_fallback_only
          OR NOT EXISTS (
            SELECT 1
            FROM public.proposals p2
            WHERE p2.organization_id = _organization_id
              AND p2.deleted_at IS NULL
              AND _scope_deal_ids IS NOT NULL
              AND p2.deal_id = ANY (_scope_deal_ids)
          )
        )
      )
    )
$function$;

COMMENT ON FUNCTION public.proposals_in_scope(uuid, text, uuid[], uuid[], boolean) IS
  'Propostas nao apagadas de uma organizacao, restritas ao ambito JA RESOLVIDO '
  'pelo cliente. Nao decide autorizacao: aplica o predicado que recebe. '
  'SECURITY INVOKER -- o RLS de proposals continua a aplicar-se.';


-- ----------------------------------------------------------------------------
-- proposals_list_filtered(): ambito + filtros da UI + colunas derivadas.
--
-- Base partilhada pela pagina da listagem e pelas metricas dos cartoes. Estar
-- numa funcao so e o que garante que a pagina e os cartoes nunca divergem: nao
-- ha duas copias do predicado para sair de sincronia.
--
-- Resolucao do estado (espelha getProposalStage no cliente):
--   1. o estado apontado por stage_id (era o embed proposal_workflow_stages);
--   2. se esse nao existir/nao for visivel, o primeiro estado da lista que o
--      cliente carregou (_workflow_stage_ids, por stage_order) cujo name
--      iguala o status.
-- _workflow_stage_ids vem do cliente exatamente como ele o tem, para que a
-- lista candidata do passo 2 seja a mesma nos dois lados.
--
-- Pesquisa: strpos(lower(...), lower(...)) e nao ILIKE, porque no cliente era
-- String.includes -- os caracteres % e _ no termo tem de ser literais.
--
-- Nota sobre os pares de flags: o filtro "expiradas" da UI e a metrica
-- "Expiradas" NAO tem o mesmo predicado (a metrica exclui ganhas/perdidas, o
-- filtro nao), e o mesmo acontece com "sem validade". Por isso devolvem-se as
-- flags cruas (is_past_validity / has_no_validity) e as metricas aplicam a
-- exclusao em cima -- e nao o contrario.
-- ----------------------------------------------------------------------------
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
  WITH derived AS (
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
           AND li.interaction_at > COALESCE(p.sent_at, p.created_at)
            THEN li.interaction_at
          ELSE COALESCE(p.sent_at, p.created_at)
        END,
        _tz
      ) AS follow_up_days
    FROM public.proposals_in_scope(
           _organization_id, _scope_mode, _scope_deal_ids,
           _scope_created_by_ids, _created_by_fallback_only
         ) p
    LEFT JOIN public.proposal_workflow_stages emb
      ON emb.id = p.stage_id
    LEFT JOIN LATERAL (
      SELECT w.id, w.name, w.stage_order, w.is_won, w.is_lost
      FROM public.proposal_workflow_stages w
      WHERE emb.id IS NULL
        AND w.id = ANY (_workflow_stage_ids)
        AND w.name = p.status
      ORDER BY w.stage_order, w.id
      LIMIT 1
    ) fb ON true
    LEFT JOIN LATERAL (
      SELECT d.entity_id
      FROM public.deals d
      WHERE d.id = p.deal_id
    ) dl ON true
    LEFT JOIN LATERAL (
      SELECT i.interaction_at
      FROM public.entity_interactions i
      WHERE i.entity_id = COALESCE(p.entity_id, dl.entity_id)
        AND EXISTS (
          SELECT 1 FROM public.anew_entities e WHERE e.id = i.entity_id
        )
      ORDER BY i.interaction_at DESC
      LIMIT 1
    ) li ON true
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
  'que nao possam divergir. SECURITY INVOKER.';


-- ----------------------------------------------------------------------------
-- get_proposals_list_metrics(): tudo o que os cartoes de KPI mostravam.
--
-- Uma linha, com os mesmos arredondamentos e o mesmo tratamento de nulos do
-- codigo que substitui:
--   * Number(p.value) com value NULL dava 0            -> COALESCE(value, 0)
--   * Number(p.value_sem_iva ?? 0)                     -> COALESCE(value_sem_iva, 0)
--   * conversao e tempo medio: divisao em virgula flutuante e Math.round, por
--     isso a divisao e feita em float8 antes de arredondar -- e nao em numeric
--     exato, que arredondaria de forma diferente nos casos de meio.
--   * denominador zero devolvia 0, nao NULL nem erro.
--   * as contagens/valores por estado eram um objeto indexado por stage id, e
--     a UI le com `|| 0`; por isso um estado sem propostas pode simplesmente
--     nao vir no jsonb.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_proposals_list_metrics(
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
  total                    integer,
  total_value              numeric,
  total_value_ex_vat       numeric,
  won_value                numeric,
  won_value_ex_vat         numeric,
  accepted_count           integer,
  sent_or_later_count      integer,
  conversion_rate          integer,
  avg_close_time           integer,
  no_response_count        integer,
  no_response_value        numeric,
  no_response_value_ex_vat numeric,
  no_validity_count        integer,
  expired_count            integer,
  stage_counts             jsonb,
  stage_values             jsonb,
  stage_values_ex_vat      jsonb
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH f AS (
    SELECT * FROM public.proposals_list_filtered(
      _organization_id, _scope_mode, _scope_deal_ids, _scope_created_by_ids,
      _created_by_fallback_only, _workflow_stage_ids, _stage_filter, _search,
      _search_entity_ids, _date_from, _date_to, _only_mine, _comercial,
      _comercial_none, _no_response, _expired, _no_validity, _follow_up_days,
      _now, _tz
    )
  ),
  close_times AS (
    -- Tempo de fecho das aceites: accepted_at - created_at, ou agora -
    -- created_at quando ainda nao ha accepted_at. Negativos descartados, como
    -- no cliente (.filter(d => d >= 0)).
    SELECT public.difference_in_days_local(
             COALESCE(f.accepted_at, _now), f.created_at, _tz
           ) AS d
    FROM f
    WHERE f.is_won
  ),
  per_stage AS (
    SELECT
      f.stage_id,
      count(*)                            AS c,
      sum(COALESCE(f.value, 0))           AS v,
      sum(COALESCE(f.value_sem_iva, 0))   AS vx
    FROM f
    WHERE f.stage_id IS NOT NULL
    GROUP BY f.stage_id
  ),
  agg AS (
    SELECT
      count(*)::integer                                             AS total,
      COALESCE(sum(COALESCE(f.value, 0)), 0)                        AS total_value,
      COALESCE(sum(COALESCE(f.value_sem_iva, 0)), 0)                AS total_value_ex_vat,
      COALESCE(sum(COALESCE(f.value, 0))         FILTER (WHERE f.is_won), 0) AS won_value,
      COALESCE(sum(COALESCE(f.value_sem_iva, 0)) FILTER (WHERE f.is_won), 0) AS won_value_ex_vat,
      count(*) FILTER (WHERE f.is_won)::integer                     AS accepted_count,
      count(*) FILTER (WHERE f.stage_id IS NOT NULL
                         AND f.stage_order > 1)::integer            AS sent_or_later_count,
      count(*) FILTER (WHERE f.is_no_response)::integer             AS no_response_count,
      COALESCE(sum(COALESCE(f.value, 0))         FILTER (WHERE f.is_no_response), 0) AS no_response_value,
      COALESCE(sum(COALESCE(f.value_sem_iva, 0)) FILTER (WHERE f.is_no_response), 0) AS no_response_value_ex_vat,
      count(*) FILTER (WHERE f.has_no_validity
                         AND NOT f.is_lost)::integer                AS no_validity_count,
      count(*) FILTER (WHERE f.is_past_validity
                         AND NOT f.is_won
                         AND NOT f.is_lost)::integer                AS expired_count
    FROM f
  )
  SELECT
    agg.total,
    agg.total_value,
    agg.total_value_ex_vat,
    agg.won_value,
    agg.won_value_ex_vat,
    agg.accepted_count,
    agg.sent_or_later_count,
    CASE
      WHEN agg.sent_or_later_count > 0
        THEN round((agg.accepted_count::float8 / agg.sent_or_later_count::float8 * 100)::numeric)::integer
      ELSE 0
    END AS conversion_rate,
    COALESCE((
      SELECT round((avg(ct.d)::float8)::numeric)::integer
      FROM close_times ct
      WHERE ct.d >= 0
    ), 0) AS avg_close_time,
    agg.no_response_count,
    agg.no_response_value,
    agg.no_response_value_ex_vat,
    agg.no_validity_count,
    agg.expired_count,
    COALESCE((SELECT jsonb_object_agg(ps.stage_id::text, ps.c)  FROM per_stage ps), '{}'::jsonb) AS stage_counts,
    COALESCE((SELECT jsonb_object_agg(ps.stage_id::text, ps.v)  FROM per_stage ps), '{}'::jsonb) AS stage_values,
    COALESCE((SELECT jsonb_object_agg(ps.stage_id::text, ps.vx) FROM per_stage ps), '{}'::jsonb) AS stage_values_ex_vat
  FROM agg
$function$;

COMMENT ON FUNCTION public.get_proposals_list_metrics(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text) IS
  'Metricas dos cartoes de KPI de /proposals sobre o CONJUNTO COMPLETO do '
  'ambito e dos filtros, para que a listagem possa ser paginada sem que os '
  'numeros passem a refletir so a pagina visivel. SECURITY INVOKER.';


-- ----------------------------------------------------------------------------
-- get_proposals_list_page(): os ids de UMA pagina, pela ordem pedida.
--
-- Devolve so ids. As linhas em si continuam a ser lidas pelo PostgREST com o
-- mesmo select (e os mesmos embeds) que a pagina ja usava -- 25 ids num .in()
-- sao menos de 1 kB de URL, e assim os tipos gerados e tudo o que consome as
-- linhas ficam intocados.
--
-- A ordenacao termina sempre em (created_at DESC, id) para ser DETERMINISTICA.
-- Sem desempate, duas paginas com valores iguais na coluna de ordenacao podiam
-- sobrepor-se ou perder linhas entre pedidos.
--
-- created_at DESC antes de id nao e decorativo: no cliente o Array.prototype.sort
-- e ESTAVEL e corria sobre um array que vinha do servidor por created_at desc,
-- por isso empates em valor/estado/validade mantinham a ordem por data
-- decrescente. Sem esta chave secundaria as paginas ficavam com o mesmo
-- CONJUNTO mas outra ORDEM -- foi o que a verificacao apanhou em 29 casos
-- (value desc, status asc e valid_until asc, onde quase tudo empata).
--
-- title ordena com a collation pt-PT-x-icu por ser o que mais se aproxima do
-- String.localeCompare que o cliente usava (acentos ordenados como em
-- portugues, e nao por code point).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_proposals_list_page(
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
  _tz                       text,
  _sort_column              text,
  _sort_direction           text,
  _limit                    integer,
  _offset                   integer
)
RETURNS TABLE (proposal_id uuid)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH f AS (
    SELECT * FROM public.proposals_list_filtered(
      _organization_id, _scope_mode, _scope_deal_ids, _scope_created_by_ids,
      _created_by_fallback_only, _workflow_stage_ids, _stage_filter, _search,
      _search_entity_ids, _date_from, _date_to, _only_mine, _comercial,
      _comercial_none, _no_response, _expired, _no_validity, _follow_up_days,
      _now, _tz
    )
  ),
  keyed AS (
    SELECT
      f.id,
      CASE _sort_column
        WHEN 'title'       THEN NULL
        WHEN 'value'       THEN COALESCE(f.value, 0)
        WHEN 'status'      THEN COALESCE(f.stage_order, 0)::numeric
        WHEN 'valid_until' THEN COALESCE(extract(epoch FROM f.valid_until), 0)::numeric
        ELSE extract(epoch FROM f.created_at)::numeric
      END AS k_num,
      CASE WHEN _sort_column = 'title' THEN f.title ELSE NULL END AS k_txt,
      f.created_at
    FROM f
  )
  SELECT keyed.id
  FROM keyed
  ORDER BY
    CASE WHEN _sort_direction = 'asc' THEN keyed.k_num END ASC  NULLS LAST,
    CASE WHEN _sort_direction = 'asc' THEN NULL ELSE keyed.k_num END DESC NULLS LAST,
    CASE WHEN _sort_direction = 'asc' THEN keyed.k_txt END COLLATE "pt-PT-x-icu" ASC  NULLS LAST,
    CASE WHEN _sort_direction = 'asc' THEN NULL ELSE keyed.k_txt END COLLATE "pt-PT-x-icu" DESC NULLS LAST,
    keyed.created_at DESC,
    keyed.id ASC
  LIMIT  GREATEST(COALESCE(_limit, 25), 0)
  OFFSET GREATEST(COALESCE(_offset, 0), 0)
$function$;

COMMENT ON FUNCTION public.get_proposals_list_page(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text, text, text, integer, integer) IS
  'Ids de uma pagina da listagem de Propostas, com ordenacao deterministica '
  '(termina sempre em id). As linhas continuam a ser lidas pelo PostgREST com '
  'os embeds que a pagina ja usava. SECURITY INVOKER.';


-- ----------------------------------------------------------------------------
-- get_proposals_alert_feed(): alimento das barras de alerta.
--
-- ProposalsAlertBars corria sobre o array COMPLETO e sem filtros da UI, com as
-- suas proprias regras (limiares configuraveis, rascunhos parados, aceites com
-- contrato) e mostrando titulos. Paginar a listagem deixaria essas barras a
-- ver so a pagina visivel, por isso passam a ter a sua propria leitura -- mas
-- magra: dez colunas, sem os snapshots JSONB nem os embeds de itens/orcamentos
-- que dominavam o 1,03 MB.
--
-- E uma RPC e nao um select normal porque em ambito TEAM/OWNED o filtro seria
-- .in('deal_id', [...centenas de uuids]) na query string; medido hoje, o
-- gateway rejeita URLs a partir de ~12 kB. Num POST os ids vao no corpo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_proposals_alert_feed(
  _organization_id          uuid,
  _scope_mode               text,
  _scope_deal_ids           uuid[],
  _scope_created_by_ids     uuid[],
  _created_by_fallback_only boolean,
  _workflow_stage_ids       uuid[],
  _limit                    integer DEFAULT 2000
)
RETURNS TABLE (
  id          uuid,
  title       text,
  value       numeric,
  status      text,
  stage_name  text,
  valid_until date,
  created_at  timestamptz,
  sent_at     timestamptz,
  updated_at  timestamptz,
  contract_id uuid
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.title,
    p.value,
    p.status,
    COALESCE(emb.name, fb.name) AS stage_name,
    p.valid_until,
    p.created_at,
    p.sent_at,
    p.updated_at,
    pl.contract_id
  FROM public.proposals_in_scope(
         _organization_id, _scope_mode, _scope_deal_ids,
         _scope_created_by_ids, _created_by_fallback_only
       ) p
  LEFT JOIN public.proposal_workflow_stages emb
    ON emb.id = p.stage_id
  LEFT JOIN LATERAL (
    SELECT w.name
    FROM public.proposal_workflow_stages w
    WHERE emb.id IS NULL
      AND w.id = ANY (_workflow_stage_ids)
      AND w.name = p.status
    ORDER BY w.stage_order, w.id
    LIMIT 1
  ) fb ON true
  LEFT JOIN LATERAL (
    SELECT l.contract_id
    FROM public.pipeline_links l
    WHERE l.proposal_id = p.id
      AND l.organization_id = _organization_id
    LIMIT 1
  ) pl ON true
  ORDER BY p.created_at DESC, p.id
  LIMIT GREATEST(COALESCE(_limit, 2000), 0)
$function$;

COMMENT ON FUNCTION public.get_proposals_alert_feed(uuid, text, uuid[], uuid[], boolean, uuid[], integer) IS
  'Leitura magra do conjunto completo do ambito para as barras de alerta de '
  '/proposals, que sempre correram sobre todas as propostas e nao sobre a '
  'pagina visivel. SECURITY INVOKER.';


GRANT EXECUTE ON FUNCTION public.difference_in_days_local(timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposals_in_scope(uuid, text, uuid[], uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposals_list_filtered(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proposals_list_metrics(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proposals_list_page(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proposals_alert_feed(uuid, text, uuid[], uuid[], boolean, uuid[], integer) TO authenticated;
