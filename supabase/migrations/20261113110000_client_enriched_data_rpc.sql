-- ============================================================================
-- Enriquecimento da listagem de Clientes numa unica RPC.
--
-- PROBLEMA MEDIDO. useClientEnrichedData fazia TRES varrimentos sequenciais
-- (client_contracts, entity_interactions, contact_tags), cada um em lotes de
-- 100 entity_ids -- ou seja ceil(n/100) * 3 pedidos GET, em serie. A pagina
-- /clients instancia o hook DUAS vezes (25 ids da pagina visivel + todos os
-- ids para os cartoes/dashboard), o que na organizacao Mudelar (170 clientes
-- visiveis) dava 3 + 6 = 9 idas ao servidor so para enriquecer.
--
-- Alem do numero de idas, a leitura de entity_interactions trazia TODAS as
-- linhas de interacao das entidades (medido: 495 linhas, 32 220 buffers) para
-- o cliente calcular tres numeros por entidade -- ultima interacao, contagem a
-- 30 dias e ultimo sentimento. Aqui isso passa a um agregado: uma linha por
-- entidade.
--
-- AUTORIZACAO. Nao ha aqui nenhuma resolucao de ambito. A funcao recebe o
-- organization_id e a lista de entity_ids JA resolvidos pelo TypeScript
-- (AnewClients.tsx / usePermissionScope), tal como as RPCs das Propostas, e
-- limita-se a agregar. A regra de isolamento entre organizacoes continua a
-- existir num sitio so.
--
-- SECURITY INVOKER (omissao) DE PROPOSITO, nunca DEFINER: client_contracts,
-- entity_interactions e contact_tags sao hoje lidas pelo cliente sob RLS. Com
-- privilegio elevado esta funcao devolveria agregados sobre contratos e
-- interacoes que o utilizador nao pode ver.
--
-- FIDELIDADE AO QUE O CLIENTE JA CALCULAVA. Esta funcao e uma transcricao, nao
-- uma correcao:
--   * contratos: mesmo predicado status IN ('signed','active') e, tal como
--     hoje, SEM filtro de deleted_at. Acrescentar esse filtro mudaria os
--     valores mostrados nos cartoes; fica registado como observacao separada,
--     nao alterado em silencio aqui.
--   * "a expirar": difference_in_days_local(end_date, agora) entre 0 e 30,
--     usando a mesma funcao que as Propostas ja usam para reproduzir o
--     differenceInDays do date-fns em hora local. end_date e uma coluna DATE e
--     o cliente fazia new Date('YYYY-MM-DD'), que em JS e meia-noite UTC --
--     daqui o AT TIME ZONE 'UTC' abaixo, em vez do fuso local.
--   * ultima interacao / ultimo sentimento: o cliente ordenava por
--     interaction_at DESC e ficava com a primeira linha de cada entidade; aqui
--     e um DISTINCT ON (entity_id) com a mesma ordenacao.
--   * contagem a 30 dias: interaction_at >= _since, com _since enviado pelo
--     cliente (o mesmo instante unico por vaga), para que servidor e cliente
--     nao possam discordar sobre "agora".
--
-- Aditiva: cria uma funcao nova, nao altera tabelas, dados nem politicas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_client_enriched_data(
  _organization_id uuid,
  _entity_ids      uuid[],
  _since           timestamptz,
  _now             timestamptz,
  _tz              text DEFAULT 'UTC'
)
RETURNS TABLE (
  entity_id                 uuid,
  active_contract_count     integer,
  contract_total_value      numeric,
  contract_total_value_sem_iva numeric,
  expiring_contracts        jsonb,
  last_interaction_at       timestamptz,
  interaction_count_30d     integer,
  last_sentiment            text,
  tags                      jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH ids AS (
    SELECT DISTINCT e AS entity_id
    FROM unnest(coalesce(_entity_ids, '{}'::uuid[])) AS e
    WHERE e IS NOT NULL
  ),
  contracts AS (
    SELECT
      c.entity_id,
      count(*)::integer                              AS active_contract_count,
      coalesce(sum(c.total_value), 0)                AS contract_total_value,
      coalesce(sum(c.total_value_sem_iva), 0)        AS contract_total_value_sem_iva,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'end_date', c.end_date,
            'total_value', coalesce(c.total_value, 0)
          )
          ORDER BY c.end_date
        ) FILTER (WHERE c.is_expiring),
        '[]'::jsonb
      )                                              AS expiring_contracts
    FROM (
      SELECT
        cc.id,
        cc.entity_id,
        cc.total_value,
        cc.total_value_sem_iva,
        cc.end_date,
        (
          cc.end_date IS NOT NULL
          AND public.difference_in_days_local(
                (cc.end_date::timestamp AT TIME ZONE 'UTC'), _now, _tz
              ) BETWEEN 0 AND 30
        ) AS is_expiring
      FROM public.client_contracts cc
      JOIN ids ON ids.entity_id = cc.entity_id
      WHERE cc.organization_id = _organization_id
        AND cc.status IN ('signed', 'active')
    ) c
    GROUP BY c.entity_id
  ),
  last_interaction AS (
    SELECT DISTINCT ON (ei.entity_id)
      ei.entity_id,
      ei.interaction_at,
      ei.sentiment
    FROM public.entity_interactions ei
    JOIN ids ON ids.entity_id = ei.entity_id
    WHERE ei.organization_id = _organization_id
    ORDER BY ei.entity_id, ei.interaction_at DESC
  ),
  recent_interactions AS (
    SELECT ei.entity_id, count(*)::integer AS interaction_count_30d
    FROM public.entity_interactions ei
    JOIN ids ON ids.entity_id = ei.entity_id
    WHERE ei.organization_id = _organization_id
      AND ei.interaction_at >= _since
    GROUP BY ei.entity_id
  ),
  entity_tags AS (
    SELECT
      ct.entity_id,
      jsonb_agg(
        jsonb_build_object('id', ct.id, 'tag', ct.tag, 'color', ct.color)
        ORDER BY ct.created_at, ct.id
      ) AS tags
    FROM public.contact_tags ct
    JOIN ids ON ids.entity_id = ct.entity_id
    WHERE ct.organization_id = _organization_id
    GROUP BY ct.entity_id
  )
  SELECT
    ids.entity_id,
    coalesce(contracts.active_contract_count, 0),
    coalesce(contracts.contract_total_value, 0),
    coalesce(contracts.contract_total_value_sem_iva, 0),
    coalesce(contracts.expiring_contracts, '[]'::jsonb),
    last_interaction.interaction_at,
    coalesce(recent_interactions.interaction_count_30d, 0),
    last_interaction.sentiment,
    coalesce(entity_tags.tags, '[]'::jsonb)
  FROM ids
  LEFT JOIN contracts           ON contracts.entity_id           = ids.entity_id
  LEFT JOIN last_interaction    ON last_interaction.entity_id    = ids.entity_id
  LEFT JOIN recent_interactions ON recent_interactions.entity_id = ids.entity_id
  LEFT JOIN entity_tags         ON entity_tags.entity_id         = ids.entity_id
  -- Entidades sem contratos, sem interacoes e sem tags sao devolvidas na mesma
  -- (a linha existe, com zeros): o cliente distingue "sem interacoes" de
  -- "entidade desconhecida" no calculo do health score.
$function$;

COMMENT ON FUNCTION public.get_client_enriched_data(uuid, uuid[], timestamptz, timestamptz, text) IS
  'Agregados de contratos, interacoes e tags por entidade para a listagem de '
  'Clientes, num unico POST. Substitui os 3 x ceil(n/100) GETs sequenciais que '
  'useClientEnrichedData fazia. SECURITY INVOKER: aplica-se RLS. O ambito vem '
  'JA resolvido do TypeScript (_organization_id + _entity_ids).';

GRANT EXECUTE ON FUNCTION public.get_client_enriched_data(uuid, uuid[], timestamptz, timestamptz, text) TO authenticated;
