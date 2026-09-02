-- Corrigir um email de cliente deixa de ser bloqueado pela RLS das propostas.
--
-- O DEFEITO
-- ---------
-- Corrigir o email de uma entidade falhava com:
--
--     42501: new row violates row-level security policy for table "proposals"
--
-- ...e ninguem via o erro, porque `AnewLeadEditDialog` engole a falha do email
-- num `catch` que so escreve na consola (ao contrario da morada, que mostra um
-- aviso). O ecra dizia "Lead guardada" e o email nao mudava.
--
-- A cascata:
--
--     escrever em anew_entity_emails
--       -> trg_anew_entity_emails_sync_entities_search_text
--            UPDATE anew_entities.search_text                    (passa)
--         -> trg_anew_entities_sync_proposals_search_text
--              UPDATE public.proposals.search_text               (RECUSADO)
--
-- A funcao do ultimo passo corre com os privilegios de quem escreveu o email.
-- Faz `UPDATE public.proposals`, e a politica de UPDATE das propostas exige,
-- desde 20261005010000, que o utilizador seja o dono da proposta OU tenha um
-- ambito ORG/TEAM configurado -- por omissao o ambito e OWNED. Logo: quem
-- corrige o contacto de um cliente cuja proposta foi criada por OUTRA pessoa
-- ve a correcao ser cancelada. Que e o caso normal: quem cria a proposta
-- raramente e quem anda a corrigir contactos.
--
-- Caso real que motivou isto: a proposta "Modelo 3 wc" foi criada por um
-- comercial; qualquer outra pessoa que tentasse corrigir o email daquele
-- cliente batia nesta parede, sem aviso.
--
-- O QUE ESTA CORRECCAO NAO FAZ
-- ----------------------------
-- NAO usa SECURITY DEFINER. Poe-se a funcao a correr como dono e a RLS deixa
-- de contar naquele ponto -- e nao e isso que se quer para uma tabela com
-- propostas de clientes.
--
-- NAO altera politica nenhuma. Quem podia editar propostas antes, pode agora;
-- quem nao podia, continua sem poder. Valor, titulo, cliente e estado de uma
-- proposta ficam protegidos exactamente como estavam.
--
-- O QUE FAZ: TIRA A DUPLICACAO
-- ----------------------------
-- O `proposals.search_text` era
--
--     titulo da proposta + titulo do negocio + search_text DA ENTIDADE
--
-- A ultima parte e uma copia: o `anew_entities.search_text` ja existe, ja e
-- mantido, e ja tem indice GIN trigram (idx_anew_entities_search_text_trgm).
-- Era so para poupar uma junccao na listagem -- e o preco dessa optimizacao
-- era este bug.
--
-- Passa a ser lido de onde vive. A listagem ja varria `anew_entities` num CTE
-- (`visible_entities`), portanto nao se acrescenta junccao nova: leva-se o
-- `search_text` desse CTE ate a comparacao.
--
-- Sem a copia, o gatilho `anew_entities -> proposals` deixa de ter razao de
-- existir e e removido. Sem esse gatilho, nao ha escrita em `proposals`, nao
-- ha permissao a verificar, e corrigir um email volta a ser corrigir um email.
--
-- POR QUE A PESQUISA NAO PIORA
-- ----------------------------
-- Duas razoes.
--
-- 1. Procurar por cliente ja nao dependia deste campo: o frontend resolve as
--    entidades por nome, email OU telefone com a RPC `search_entity_ids_by_word`
--    e passa-as em `_search_entity_ids`, que a consulta ja aceita.
--
-- 2. Para as pesquisas MISTAS -- uma palavra do cliente e outra do titulo, como
--    "joao modelo" -- a condicao passa a comparar cada palavra contra os DOIS
--    campos juntos. Sem isto haveria regressao real: cada palavra tem de
--    aparecer em algum sitio, e apos a separacao "joao" viveria so do lado da
--    entidade e "modelo" so do lado da proposta.
--
-- FICA POR RESOLVER (nao e desta migration)
-- -----------------------------------------
-- - `trg_deals_sync_proposals_search_text` faz UPDATE em proposals a partir de
--   `deals` e tem exactamente o mesmo defeito latente: mudar o titulo de um
--   negocio pode falhar para quem nao seja dono da proposta. O titulo do
--   negocio continua (legitimamente) dentro do search_text da proposta,
--   portanto esse gatilho mantem-se.
-- - O `catch` silencioso no `AnewLeadEditDialog`: enquanto o erro do email nao
--   chegar ao ecra como o da morada, qualquer falha futura repete-se invisivel.

-- ── 1. O search_text da proposta deixa de copiar o da entidade ──────────────
-- Assinatura mantida (title, entity_id, deal_id) para nao partir os chamadores;
-- `p_entity_id` fica sem uso.
CREATE OR REPLACE FUNCTION "public"."proposals_compute_search_text"(
  "p_title" "text",
  "p_entity_id" "uuid",
  "p_deal_id" "uuid"
) RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
DECLARE
  v_deal_title text;
BEGIN
  IF p_deal_id IS NOT NULL THEN
    SELECT d.title INTO v_deal_title
      FROM public.deals d
     WHERE d.id = p_deal_id;
  END IF;

  RETURN NULLIF(trim(
    coalesce(p_title, '') || ' ' || coalesce(v_deal_title, '')
  ), '');
END;
$$

-- ── 2. A cascata entidade -> propostas deixa de existir ─────────────────────
DROP TRIGGER IF EXISTS "trg_anew_entities_sync_proposals_search_text" ON "public"."anew_entities"

DROP FUNCTION IF EXISTS "public"."anew_entities_sync_proposals_search_text_trigger"()

-- ── 3. Realinhar o campo com a nova definicao ───────────────────────────────
UPDATE public.proposals AS p
   SET search_text = public.proposals_compute_search_text(p.title, p.entity_id, p.deal_id)

COMMENT ON FUNCTION public.proposals_list_filtered(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text) IS
  'Listagem filtrada de propostas. A pesquisa compara cada palavra contra o search_text da proposta (titulo dela + titulo do negocio) E contra o search_text da entidade, lido do CTE visible_entities. O search_text da entidade deixou de ser copiado para proposals.search_text em 20261116010000: essa copia obrigava a um UPDATE em proposals sempre que um email ou telefone mudava, e a RLS das propostas recusava-o a quem nao fosse dono da proposta, cancelando a correccao do contacto sem aviso.'

GRANT EXECUTE ON FUNCTION public.proposals_list_filtered(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text) TO authenticated

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
    SELECT e.id, e.search_text
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
    ,
      -- Lido aqui, do CTE que ja varria anew_entities, em vez de copiado para
      -- proposals.search_text (ver o cabecalho desta migration).
      ve.search_text AS entity_search_text
    FROM scoped s
    LEFT JOIN visible_entities ve
      ON ve.id = s.eid
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
          AND (COALESCE(d.search_text, '') || ' ' || COALESCE(d.entity_search_text, ''))
              NOT ILIKE '%' || w || '%'
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

COMMENT ON FUNCTION public.proposals_list_filtered(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text) IS
  'Listagem filtrada de propostas. A pesquisa compara cada palavra contra o search_text da proposta (titulo dela + titulo do negocio) E contra o search_text da entidade, lido do CTE visible_entities. O search_text da entidade deixou de ser copiado para proposals.search_text em 20261116010000: essa copia obrigava a um UPDATE em proposals sempre que um email ou telefone mudava, e a RLS das propostas recusava-o a quem nao fosse dono da proposta, cancelando a correccao do contacto sem aviso.'

GRANT EXECUTE ON FUNCTION public.proposals_list_filtered(uuid, text, uuid[], uuid[], boolean, uuid[], text, text, uuid[], timestamptz, timestamptz, uuid, uuid, boolean, boolean, boolean, boolean, integer, timestamptz, text) TO authenticated
