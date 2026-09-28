-- Encomendas Clientes manuais — marcar e esconder da pagina de Contratos.
--
-- Uma Encomenda Cliente manual (rpc_create_manual_client_order) cria por baixo
-- um client_contracts real, ja assinado, para reaproveitar toda a automacao
-- (deducao de stock, pedido a fornecedor, PDF). Efeito colateral: esse
-- "contrato" aparecia na pagina de Contratos como um contrato sem documento
-- nem assinatura, o que confunde quem gere contratos a serio.
--
-- Marcador proprio na tabela (em vez de ir por quotes.is_internal via join):
-- o filtro fica trivial no frontend e na funcao de metricas, e nao depende de
-- o contrato ter quote associada.
--
--   client_contracts.is_manual_order boolean NOT NULL DEFAULT false
--
-- default false = nenhum contrato existente muda de comportamento.

ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS is_manual_order boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.client_contracts.is_manual_order IS
  'true quando o contrato foi criado por rpc_create_manual_client_order para suportar uma Encomenda Cliente manual. Nao deve aparecer na pagina de Contratos (ClientContracts.tsx) nem nas suas metricas; aparece normalmente em Encomendas Clientes, que e o seu proposito.';

-- Metricas da pagina de Contratos: recriada a partir da definicao VIVA
-- (pg_get_functiondef), com uma unica linha acrescentada.

CREATE OR REPLACE FUNCTION public.client_contracts_list_metrics(_organization_ids uuid[], _status_filter text, _search text, _date_from timestamp with time zone, _date_to timestamp with time zone, _only_mine uuid, _comercial uuid, _comercial_none boolean, _now timestamp with time zone, _allowed_user_ids uuid[])
 RETURNS TABLE(total_count integer, total_value numeric, draft_count integer, draft_value numeric, sent_count integer, sent_value numeric, signed_count integer, signed_value numeric, expired_count integer, expired_value numeric, active_value numeric, avg_value numeric, sign_rate integer, expiring90_count integer, avg_sign_days integer)
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
    AND cc.is_manual_order IS NOT TRUE

      -- Ambito client_contracts.view (ver comentario da funcao): o MESMO

      -- predicado que a query da lista aplica. Uniao dos dois campos, igual ao predicado da lista e ao das Leads.

      -- So `created_by` escondia contratos ATRIBUIDOS ao utilizador que outra

      -- pessoa criou (medido na Mudelar: 8 criados vs 9 atribuidos), apesar de

      -- a coluna COMERCIAL os mostrar como dele.

      AND (

        _allowed_user_ids IS NULL

        OR cc.created_by = ANY(_allowed_user_ids)

        OR cc.assigned_to = ANY(_allowed_user_ids)

      )

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

$function$
;
