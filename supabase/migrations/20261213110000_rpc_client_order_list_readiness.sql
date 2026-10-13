-- =============================================================================
-- 20261213110000_rpc_client_order_list_readiness.sql
--
-- NOVA função de leitura: prontidão de expedição por Encomenda de Cliente,
-- para a lista (Compras › Encomendas de Clientes) numa só chamada. Só
-- leitura, sem tabelas nem colunas novas, sem alterar funções existentes.
--
-- Âmbito: os mesmos contratos de rpc_list_client_order_documents
-- (definição viva): organization_id = p_organization_id, deleted_at IS NULL,
-- status IN ('signed', 'assinado'). Opcionalmente só os p_contract_ids
-- (ids fora deste âmbito são ignorados). Uma linha por contrato, também os
-- sem linhas de produto (tudo a 0), como a lista.
--
-- Base: fn_client_order_line_reservations(p_organization_id, NULL) chamada
-- UMA vez (CTE MATERIALIZED), como em rpc_list_client_order_documents e
-- rpc_inventory_today. Unidades = unidades base (de stock). Componentes de
-- pack contam como linhas, como na lista.
--
-- Regras:
--   • Linha concluída (copiado de rpc_inventory_today, bloco client_orders):
--       is_served
--       OR (qty_reserved = 0 AND qty_served = 0 AND qty_missing = 0
--           AND qty_ordered > 0 AND qty_received >= qty_ordered)
--     O resto é linha "em aberto".
--   • Linha pronta a expedir = linha em aberto com qty_reserved > 0 — a mesma
--     de rpc_inventory_today.client_orders.ready_to_ship (has_ready) e a
--     mesma que no detalhe (rpc_get_client_order_document) dá
--     'stock_disponivel_confirmar' ou 'parcial' com reserva, i.e. as linhas
--     cuja saída de stock se pode confirmar (isStockExitConfirmable).
--     ready_to_ship de rpc_inventory_today = nº de contratos com
--     lines_ready > 0 (para os contratos com alguma linha em aberto).
--   • units_ready            = Σ qty_reserved das linhas prontas.
--   • units_in_stock_reserved = Σ qty_reserved de todas as linhas (as
--     concluídas têm sempre 0, por isso hoje é igual a units_ready; fica
--     separado para o contrato da API não depender disso).
--   • units_on_po            = Σ GREATEST(0, qty_ordered − qty_received) das
--     linhas em aberto (PO não cancelada nem apagada, incluindo por aprovar —
--     o mesmo que a função de reservas conta em qty_ordered).
--   • units_missing          = Σ qty_missing das linhas em aberto.
--   • units_received         = Σ qty_received (recebido do fornecedor direto
--     para a encomenda; não inclui o que entrou em stock).
--   • units_served           = Σ (qty_served + qty_received): entregue, por
--     stock ou recebido (a função de reservas trata o recebido como entregue;
--     is_served = qty_served + qty_received >= qty_needed).
--   • units_needed           = Σ qty_needed (necessidade efetiva, já sem o
--     anulado nas POs).
--   Numa linha em aberto: needed = served + reserved + on_po + missing
--   (served aqui já com o recebido).
--
-- Segurança: igual a rpc_list_client_order_documents — utilizador
-- autenticado, org visível (get_user_visible_org_ids) e client_orders.view;
-- senão exceção insufficient_privilege.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_client_order_list_readiness(
  p_organization_id uuid,
  p_contract_ids    uuid[] DEFAULT NULL
)
RETURNS TABLE(
  contract_id             uuid,
  lines_ready             integer,
  units_ready             numeric,
  units_in_stock_reserved numeric,
  units_on_po             numeric,
  units_missing           numeric,
  units_served            numeric,
  units_received          numeric,
  units_needed            numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- Mesma verificação que rpc_list_client_order_documents.
  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR NOT COALESCE(public.has_anew_permission(v_uid, 'client_orders.view'), false) THEN
    RAISE EXCEPTION 'Sem permissão para ver encomendas de clientes desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH r AS MATERIALIZED (
    -- Uma só passagem pela reserva FIFO da organização inteira.
    SELECT
      f.contract_id  AS r_contract_id,
      f.product_id   AS r_product_id,
      f.is_served    AS r_is_served,
      COALESCE(f.qty_needed,   0) AS r_needed,
      COALESCE(f.qty_served,   0) AS r_served,
      COALESCE(f.qty_ordered,  0) AS r_ordered,
      COALESCE(f.qty_received, 0) AS r_received,
      COALESCE(f.qty_reserved, 0) AS r_reserved,
      COALESCE(f.qty_missing,  0) AS r_missing
    FROM public.fn_client_order_line_reservations(p_organization_id, NULL) f
  ),
  rc AS (
    -- Contratos da lista (filtros de rpc_list_client_order_documents).
    SELECT cc.id AS rc_contract_id
    FROM public.client_contracts cc
    WHERE cc.organization_id = p_organization_id
      AND cc.deleted_at IS NULL
      AND cc.status = ANY (ARRAY['signed', 'assinado'])
      AND (p_contract_ids IS NULL OR cc.id = ANY (p_contract_ids))
  ),
  lx AS (
    SELECT
      r.*,
      -- Linha em aberto: negação da regra de concluída de rpc_inventory_today.
      NOT (
        r.r_is_served
        OR (r.r_reserved = 0
            AND r.r_served = 0
            AND r.r_missing = 0
            AND r.r_ordered > 0
            AND r.r_received >= r.r_ordered)
      ) AS r_open
    FROM r
    JOIN rc ON rc.rc_contract_id = r.r_contract_id
    WHERE r.r_product_id IS NOT NULL
  ),
  agg AS (
    SELECT
      lx.r_contract_id AS a_contract_id,
      count(*) FILTER (WHERE lx.r_open AND lx.r_reserved > 0)::integer           AS a_lines_ready,
      COALESCE(sum(lx.r_reserved) FILTER (WHERE lx.r_open AND lx.r_reserved > 0), 0) AS a_units_ready,
      COALESCE(sum(lx.r_reserved), 0)                                            AS a_units_reserved,
      COALESCE(sum(GREATEST(0, lx.r_ordered - lx.r_received)) FILTER (WHERE lx.r_open), 0) AS a_units_on_po,
      COALESCE(sum(lx.r_missing) FILTER (WHERE lx.r_open), 0)                    AS a_units_missing,
      COALESCE(sum(lx.r_served + lx.r_received), 0)                              AS a_units_served,
      COALESCE(sum(lx.r_received), 0)                                            AS a_units_received,
      COALESCE(sum(lx.r_needed), 0)                                              AS a_units_needed
    FROM lx
    GROUP BY lx.r_contract_id
  )
  SELECT
    rc.rc_contract_id,
    COALESCE(a.a_lines_ready, 0),
    COALESCE(a.a_units_ready, 0)::numeric,
    COALESCE(a.a_units_reserved, 0)::numeric,
    COALESCE(a.a_units_on_po, 0)::numeric,
    COALESCE(a.a_units_missing, 0)::numeric,
    COALESCE(a.a_units_served, 0)::numeric,
    COALESCE(a.a_units_received, 0)::numeric,
    COALESCE(a.a_units_needed, 0)::numeric
  FROM rc
  LEFT JOIN agg a ON a.a_contract_id = rc.rc_contract_id;
END;
$function$;

COMMENT ON FUNCTION public.rpc_client_order_list_readiness(uuid, uuid[]) IS
  'Prontidão de expedição por Encomenda de Cliente (contratos assinados, não apagados, da organização; opcionalmente só p_contract_ids): linhas/unidades prontas a sair (reserva de stock em linhas em aberto, mesma regra de rpc_inventory_today.ready_to_ship), reservadas, em PO por receber, em falta, servidas, recebidas e necessárias (unidades base). Uma passagem por fn_client_order_line_reservations. Exige org visível e client_orders.view. Só leitura.';

REVOKE ALL ON FUNCTION public.rpc_client_order_list_readiness(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_client_order_list_readiness(uuid, uuid[]) TO authenticated, service_role;

COMMIT;
