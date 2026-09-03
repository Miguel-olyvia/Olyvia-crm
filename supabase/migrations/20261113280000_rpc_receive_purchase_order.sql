-- Fase 4C do plano de inventário (plano-fornecedores-multi-stock.md, secção 5.4):
-- liga a receção de uma Encomenda ao ledger de stock. Resolve o aviso já
-- visível hoje em PurchaseOrders.tsx ("Marcar como recebida não atualiza
-- automaticamente o stock — atualize os armazéns manualmente em Stocks").
--
-- Âmbito desta migration: receção TOTAL de uma encomenda (todas as linhas de
-- produto de uma vez, para o armazém escolhido). Receção parcial fica fora
-- (já estava listado como item separado — "receção total/parcial" — no
-- levantamento da Fase 4 do plano, não bloqueia este passo).
--
-- Serviços (item_type='service') não têm stock físico — só as linhas de
-- produto geram movimento.
--
-- document_number: reutiliza o próprio purchase_orders.order_number (ex.
-- PO-2026-0003) em vez de gerar um NE-C-NNNN novo — mantém a receção
-- diretamente rastreável ao documento de origem, todas as linhas da mesma
-- receção partilham o mesmo número (mesmo padrão já usado para as 2 linhas
-- de uma transferência).
--
-- Prerequisitos: 20261113260000 (stock_movements), 20261113270000
-- (fn_next_stock_document_number, não usada aqui mas mesmo ficheiro de
-- RPCs), 20260814020000 (purchase_orders.edit já protege UPDATE).

CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order(
    p_purchase_order_id uuid,
    p_warehouse_id      uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_org         uuid;
  v_status      text;
  v_supplier_id uuid;
  v_order_number text;
  v_item        record;
  v_item_supplier_id uuid;
  v_qty         integer;
  v_balance     integer;
  v_lines       jsonb := '[]'::jsonb;
  v_line_count  integer := 0;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT organization_id, status, supplier_id, order_number
  INTO v_org, v_status, v_supplier_id, v_order_number
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status = 'received' THEN
    RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_item IN
    SELECT id, product_id, quantity, unit_price, description
    FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product'
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      CONTINUE;
    END IF;
    IF v_item.quantity <> floor(v_item.quantity) THEN
      RAISE EXCEPTION 'A linha "%" tem uma quantidade não inteira (%) — o stock só regista unidades inteiras. Corrige a linha antes de receber.', v_item.description, v_item.quantity
        USING ERRCODE = 'check_violation';
    END IF;
    v_qty := v_item.quantity::integer;

    -- Fornecedor concreto (item_suppliers) para este par produto/fornecedor da
    -- encomenda, se existir — melhor esforço, não bloqueia a receção se faltar
    -- (o produto pode ter sido descontinuado nesse fornecedor entretanto).
    SELECT id INTO v_item_supplier_id
    FROM public.item_suppliers
    WHERE product_id = v_item.product_id
      AND supplier_id = v_supplier_id
      AND deleted_at IS NULL
    ORDER BY is_preferred DESC
    LIMIT 1;

    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, item_supplier_id, unit_cost_at_time,
      notes, created_by
    ) VALUES (
      v_org, v_item.product_id, p_warehouse_id, 'entrada', v_qty,
      v_order_number, 'compra', v_item_supplier_id, v_item.unit_price,
      'Receção de ' || v_order_number, v_actor
    )
    RETURNING balance_after INTO v_balance;

    v_line_count := v_line_count + 1;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_item.product_id, 'quantity', v_qty, 'balance_after', v_balance
    );
  END LOOP;

  UPDATE public.purchase_orders
  SET status = 'received', updated_at = now()
  WHERE id = p_purchase_order_id;

  RETURN jsonb_build_object(
    'order_number', v_order_number,
    'warehouse_id', p_warehouse_id,
    'lines_received', v_line_count,
    'lines', v_lines
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_receive_purchase_order IS
  'Marca uma encomenda como recebida E gera a entrada de stock correspondente '
  '(uma linha em stock_movements por linha de produto da encomenda, no armazém '
  'escolhido) — tudo na mesma transação. Só receção total (todas as linhas de '
  'produto de uma vez); serviços não geram movimento. document_number reutiliza '
  'o order_number da própria encomenda.';

REVOKE ALL ON FUNCTION public.rpc_receive_purchase_order FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_receive_purchase_order TO authenticated;
