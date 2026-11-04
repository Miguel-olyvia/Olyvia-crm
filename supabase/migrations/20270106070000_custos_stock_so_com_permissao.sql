-- ============================================================
-- 20270106070000_custos_stock_so_com_permissao
-- ============================================================
-- O que faz (Lote A, item 9, parte segura):
--   1. stocks.average_cost e stock_movements.unit_cost_at_time liam-se diretamente com inventory.view (o ecrã escondia-os, a base não).
--      REVOKE SELECT da tabela a anon/authenticated e GRANT SELECT de todas as OUTRAS colunas (lista explícita): a coluna de custo
--      deixa de se poder ler diretamente (nem por select=*). INSERT/UPDATE/DELETE ficam como estavam (as políticas decidem).
--      Lê-se agora por duas RPCs SECURITY DEFINER que exigem products.view_cost NA organização (has_anew_permission_in_org), além do
--      que a política de leitura já pedia (organização visível + inventory.view):
--        inv_valor_stock_armazens(p_org)  -> valor (quantidade x custo médio) por armazém  (ecrã Armazéns)
--        inv_custos_movimentos(p_ids)     -> custo unitário de cada movimento pedido      (ecrã Movimentos)
--      O frontend (Warehouses.tsx, StockMovements.tsx, Stocks.tsx select=*) passa a usá-las no mesmo commit.
--   2. product_stock (grelha de stock antiga, só lida pelo assistente de IA) lia-se com a simples associação à organização do produto:
--      a política SELECT passa a pedir também inventory.view nessa organização.
-- Verificado antes: nenhuma função INVOKER lê estas colunas (só fn_stock_movements_apply, gatilho do INSERT direto em stock_movements,
--   que nenhum ecrã faz e o 20270106080000 já recusa); nenhuma view security_invoker sobre stocks/stock_movements; nenhum ecrã/edge
--   function usa select=* nestas tabelas além de Stocks.tsx (corrigido).
-- ATENÇÃO para o futuro: uma coluna NOVA em stocks/stock_movements não fica legível por authenticated sem GRANT SELECT (coluna).
-- Fica por fazer (reportado): purchase_order_items.unit_price/total_price/vat_amount com purchase_orders.view_prices (o editor de
--   encomendas lê-os com select=* e escreve-os; PoKpis e a view ops_v_compra_linha também; e purchase_orders.total_value expõe o total).
-- Políticas reescritas a partir de pg_policies (vivas, 4/11/2026). Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

-- 1a. stocks: tudo menos average_cost
REVOKE SELECT ON TABLE public.stocks FROM anon, authenticated;
GRANT SELECT (id, product_id, warehouse_id, quantity, minimum_quantity, maximum_quantity, reorder_point, location, last_counted,
              created_by, created_at, updated_at, organization_id, deleted_at, deleted_by)
  ON TABLE public.stocks TO anon, authenticated;

-- 1b. stock_movements: tudo menos unit_cost_at_time
REVOKE SELECT ON TABLE public.stock_movements FROM anon, authenticated;
GRANT SELECT (id, organization_id, product_id, warehouse_id, movement_type, quantity, document_number, document_type, item_supplier_id,
              supplier_sku_at_time, lot_id, transfer_group_id, reversal_of_movement_id, counterparty, balance_after, reference_id,
              notes, created_by, created_at, sale_source_type, sale_source_id)
  ON TABLE public.stock_movements TO anon, authenticated;

-- 1c. leitura do custo com permissão
CREATE OR REPLACE FUNCTION public.inv_valor_stock_armazens(p_org uuid)
 RETURNS TABLE(warehouse_id uuid, valor numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270106070000: o valor do stock (quantidade x custo médio) só com products.view_cost na organização, e com a leitura que
  -- stocks_select_policy já pede (organização visível + inventory.view).
  IF auth.uid() IS NULL OR p_org IS NULL
     OR p_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.view')
     OR NOT public.has_anew_permission_in_org(auth.uid(), 'products.view_cost', p_org) THEN
    RAISE EXCEPTION 'Sem permissão para ver o custo do stock (products.view_cost) nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.warehouse_id, sum(coalesce(s.quantity, 0) * coalesce(s.average_cost, 0))::numeric
  FROM public.stocks s
  WHERE s.organization_id = p_org AND s.deleted_at IS NULL
  GROUP BY s.warehouse_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.inv_custos_movimentos(p_ids uuid[])
 RETURNS TABLE(id uuid, unit_cost_at_time numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270106070000: o custo unitário de cada movimento pedido, só dos movimentos que a pessoa vê (organização visível +
  -- inventory.view, como stock_movements_select_policy) e cuja organização lhe dá products.view_cost. Os outros não vêm.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(cardinality(p_ids), 0) > 2000 THEN
    RAISE EXCEPTION 'Demasiados movimentos num pedido (máximo 2000).' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT public.has_anew_permission(auth.uid(), 'inventory.view') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.id, m.unit_cost_at_time::numeric
  FROM public.stock_movements m
  WHERE m.id = ANY (p_ids)
    AND m.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    AND public.has_anew_permission_in_org(auth.uid(), 'products.view_cost', m.organization_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.inv_valor_stock_armazens(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inv_custos_movimentos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_valor_stock_armazens(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inv_custos_movimentos(uuid[]) TO authenticated, service_role;

-- 2. product_stock: a leitura pede também inventory.view na organização do produto
DROP POLICY IF EXISTS auth_select_product_stock ON public.product_stock;
CREATE POLICY auth_select_product_stock ON public.product_stock
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (product_id IN (
    SELECT products.id FROM public.products
    WHERE products.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
      AND public.has_anew_permission_in_org(auth.uid(), 'inventory.view', products.organization_id)));

NOTIFY pgrst, 'reload schema';
