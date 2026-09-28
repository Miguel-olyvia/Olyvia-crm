-- =============================================================================
-- 20261204320000_rpc_reservas_stock_por_produto.sql
--
-- NOVA função de leitura: reservas e faltas de stock das Encomendas de Cliente,
-- agregadas por produto. Base: public.fn_client_order_line_reservations
-- (migration 20261204310000), que faz a reserva do stock livre por ordem de
-- assinatura dos contratos.
--
-- Devolve só produtos com qty_reserved > 0 ou qty_missing > 0.
-- orders_count = nº de contratos distintos com algo reservado ou em falta
-- para esse produto.
--
-- Segurança: utilizador autenticado, org visível (get_user_visible_org_ids)
-- e permissão inventory.view (has_anew_permission), como nas RPCs vizinhas
-- rpc_list_client_order_documents / rpc_get_client_order_document.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_get_product_stock_reservations(
  p_organization_id uuid,
  p_product_ids     uuid[] DEFAULT NULL
)
RETURNS TABLE(
  product_id   uuid,
  qty_reserved numeric,
  qty_missing  numeric,
  orders_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver reservas de stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    r.product_id,
    SUM(COALESCE(r.qty_reserved, 0))::numeric,
    SUM(COALESCE(r.qty_missing, 0))::numeric,
    (COUNT(DISTINCT r.contract_id) FILTER (
       WHERE COALESCE(r.qty_reserved, 0) > 0 OR COALESCE(r.qty_missing, 0) > 0
    ))::integer
  FROM public.fn_client_order_line_reservations(p_organization_id, p_product_ids) r
  WHERE r.product_id IS NOT NULL
  GROUP BY r.product_id
  HAVING SUM(COALESCE(r.qty_reserved, 0)) > 0
      OR SUM(COALESCE(r.qty_missing, 0)) > 0;
END;
$function$;

COMMENT ON FUNCTION public.rpc_get_product_stock_reservations(uuid, uuid[]) IS
  'Reservas (qty_reserved) e faltas (qty_missing) de stock das Encomendas de Cliente, agregadas por produto, a partir de fn_client_order_line_reservations. Só produtos com algo > 0. Exige org visível e inventory.view.';

REVOKE ALL ON FUNCTION public.rpc_get_product_stock_reservations(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_product_stock_reservations(uuid, uuid[]) TO authenticated, service_role;

COMMIT;
