-- ----------------------------------------------------------------------------
-- client_contracts_list_metrics(): cartoes de KPI da pagina de Contratos
-- (src/pages/ClientContracts.tsx), calculados no servidor em vez de sobre a
-- lista inteira carregada no browser.
--
-- Motivo: a lista de Contratos nao pagina hoje (sem .range()/.limit()), por
-- isso os cartoes, computados sobre `filteredContracts` no cliente, ainda
-- batem com a lista. O dia em que a pagina ganhar paginacao para aliviar o
-- peso, os cartoes passam a contar so a pagina visivel sem ninguem dar por
-- isso -- foi exactamente este padrao que fez os graficos de Orcamentos
-- mostrarem 48 ganhos quando o cartao ao lado dizia 113. Ver
-- 20261113070000_proposals_list_pagination_and_metrics_rpcs.sql (o mesmo
-- padrao, ja aplicado a Propostas): esta funcao segue-o.
--
-- Ambito: NAO decide autorizacao. Recebe `_organization_ids` JA RESOLVIDO
-- pelo cliente (activeCompany + subarvore de anew_hierarchy, exactamente
-- como a query de listagem em ClientContracts.tsx monta `subtreeIds`) e
-- filtra so por isso. SECURITY INVOKER (default): corre com os privilegios
-- de quem chama, por isso a RLS de client_contracts continua a aplicar-se por
-- cima -- a policy `client_contracts_select` (organization_id IN
-- get_user_crm_org_ids(auth.uid()) AND has_anew_permission(...,
-- 'client_contracts.view')) e quem decide, em ultima instancia, que linhas
-- esta funcao pode somar. Um `_organization_ids` mal resolvido no cliente
-- nunca revela dados de outra organizacao: a RLS filtra por baixo.
--
-- Filtros: espelham EXACTAMENTE o predicado de `filteredContracts` em
-- ClientContracts.tsx (comentario la: "este e o unico sitio onde [o filtro
-- Comercial] e aplicado"). Nao duplicar aqui uma segunda copia divergente --
-- se um filtro novo for adicionado a lista, tem de ser adicionado aqui
-- tambem, na mesma funcao, para os dois nunca saírem de sincronia.
--
-- Valor efectivo: getEffectiveContractValue (src/utils/contractValue.ts)
-- prefere quotes.total (inclui desconto global) a client_contracts.total_value
-- quando ha quote_id. O cliente procura essa quote APENAS dentro de
-- `contract.proposals.quotes`, por isso o JOIN aqui replica essa restricao
-- (`q.id = cc.quote_id AND q.proposal_id = cc.proposal_id`) -- ver o
-- comentario no proprio JOIN.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_contracts_list_metrics(
  _organization_ids uuid[],
  _status_filter    text,
  _search           text,
  _date_from        timestamptz,
  _date_to          timestamptz,
  _only_mine        uuid,
  _comercial        uuid,
  _comercial_none   boolean,
  _now              timestamptz
)
RETURNS TABLE (
  total_count      integer,
  total_value      numeric,
  draft_count      integer,
  draft_value      numeric,
  sent_count       integer,
  sent_value       numeric,
  signed_count     integer,
  signed_value     numeric,
  expired_count    integer,
  expired_value    numeric,
  active_value     numeric,
  avg_value        numeric,
  sign_rate        integer,
  expiring90_count integer,
  avg_sign_days    integer
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      cc.status,
      cc.created_at,
      cc.updated_at,
      cc.end_date,
      CASE
        WHEN cc.quote_id IS NOT NULL AND q.total IS NOT NULL THEN q.total
        ELSE COALESCE(cc.total_value, 0)
      END AS effective_value
    FROM public.client_contracts cc
    -- O JOIN exige `q.proposal_id = cc.proposal_id` de proposito: no cliente,
    -- getEffectiveContractValue procura a quote SO dentro de
    -- `contract.proposals.quotes`, por isso uma quote_id que aponte para uma
    -- quote de OUTRA proposta nao e encontrada e o valor cai para
    -- total_value. Um JOIN so por `q.id = cc.quote_id` encontraria essa quote
    -- e o cartao passaria a somar um valor diferente do que a linha da lista
    -- mostra. Paridade com a lista manda aqui.
    LEFT JOIN public.quotes q ON q.id = cc.quote_id AND q.proposal_id = cc.proposal_id
    LEFT JOIN public.anew_entities e ON e.id = cc.entity_id
    LEFT JOIN public.proposals p ON p.id = cc.proposal_id
    WHERE cc.organization_id = ANY(_organization_ids)
      AND cc.deleted_at IS NULL
      AND (_only_mine IS NULL OR cc.created_by = _only_mine)
      AND (_comercial_none IS NOT TRUE OR COALESCE(cc.assigned_to, cc.created_by) IS NULL)
      AND (_comercial IS NULL OR COALESCE(cc.assigned_to, cc.created_by) = _comercial)
      AND (
        _status_filter IS NULL
        OR _status_filter = 'all'
        OR (
          _status_filter = 'expiring'
          AND cc.end_date IS NOT NULL
          AND ceil(extract(epoch FROM (cc.end_date::timestamptz - _now)) / 86400) > 0
          AND ceil(extract(epoch FROM (cc.end_date::timestamptz - _now)) / 86400) <= 90
        )
        OR (_status_filter = 'signed' AND cc.status IN ('signed', 'active'))
        OR (_status_filter NOT IN ('expiring', 'signed') AND cc.status = _status_filter)
      )
      AND (
        _search IS NULL OR _search = ''
        OR strpos(lower(COALESCE(cc.contract_number, '')), lower(_search)) > 0
        OR strpos(lower(COALESCE(e.display_name, '')), lower(_search)) > 0
        OR strpos(lower(COALESCE(p.title, '')), lower(_search)) > 0
      )
      AND (_date_from IS NULL OR cc.created_at >= _date_from)
      AND (_date_to IS NULL OR cc.created_at <= _date_to)
  )
  SELECT
    count(*)::int AS total_count,
    COALESCE(sum(effective_value), 0) AS total_value,
    count(*) FILTER (WHERE status = 'draft')::int AS draft_count,
    COALESCE(sum(effective_value) FILTER (WHERE status = 'draft'), 0) AS draft_value,
    count(*) FILTER (WHERE status = 'pending_signature')::int AS sent_count,
    COALESCE(sum(effective_value) FILTER (WHERE status = 'pending_signature'), 0) AS sent_value,
    count(*) FILTER (WHERE status IN ('signed', 'active'))::int AS signed_count,
    COALESCE(sum(effective_value) FILTER (WHERE status IN ('signed', 'active')), 0) AS signed_value,
    count(*) FILTER (
      WHERE status = 'expired' OR (end_date IS NOT NULL AND end_date::timestamptz < _now AND status <> 'cancelled')
    )::int AS expired_count,
    COALESCE(sum(effective_value) FILTER (
      WHERE status = 'expired' OR (end_date IS NOT NULL AND end_date::timestamptz < _now AND status <> 'cancelled')
    ), 0) AS expired_value,
    COALESCE(sum(effective_value) FILTER (
      WHERE status IN ('signed', 'active') AND (end_date IS NULL OR end_date::timestamptz >= _now)
    ), 0) AS active_value,
    CASE WHEN count(*) > 0 THEN COALESCE(sum(effective_value), 0) / count(*) ELSE 0 END AS avg_value,
    CASE
      WHEN (count(*) FILTER (WHERE status = 'pending_signature') + count(*) FILTER (WHERE status IN ('signed', 'active'))) > 0
      THEN round(
        (count(*) FILTER (WHERE status IN ('signed', 'active'))::numeric * 100)
        / (count(*) FILTER (WHERE status = 'pending_signature') + count(*) FILTER (WHERE status IN ('signed', 'active')))
      )
      ELSE 0
    END::int AS sign_rate,
    count(*) FILTER (
      WHERE end_date IS NOT NULL
        AND status NOT IN ('expired', 'cancelled')
        AND ceil(extract(epoch FROM (end_date::timestamptz - _now)) / 86400) > 0
        AND ceil(extract(epoch FROM (end_date::timestamptz - _now)) / 86400) <= 90
    )::int AS expiring90_count,
    COALESCE(
      round(
        avg(GREATEST(1, ceil(extract(epoch FROM (updated_at - created_at)) / 86400)))
          FILTER (WHERE status IN ('signed', 'active') AND updated_at IS NOT NULL AND created_at IS NOT NULL)
      ),
      0
    )::int AS avg_sign_days
  FROM base
$function$;

COMMENT ON FUNCTION public.client_contracts_list_metrics(uuid[], text, text, timestamptz, timestamptz, uuid, uuid, boolean, timestamptz) IS
  'Metricas dos cartoes de KPI de Contratos (src/pages/ClientContracts.tsx). '
  'Ambito JA RESOLVIDO no cliente (_organization_ids); nao decide autorizacao. '
  'SECURITY INVOKER -- a RLS de client_contracts continua a aplicar-se.';

GRANT EXECUTE ON FUNCTION public.client_contracts_list_metrics(uuid[], text, text, timestamptz, timestamptz, uuid, uuid, boolean, timestamptz) TO authenticated;
