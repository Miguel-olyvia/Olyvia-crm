-- ============================================================
-- Pedido do utilizador (2026-08-31): quando uma Encomenda de fornecedor está
-- ligada a uma Encomenda Cliente (source_type='contract', 20261115200000 —
-- já tem destino certo, foi comprada especificamente para aquele cliente),
-- marcar a encomenda como recebida NÃO deve inflacionar o stock geral. A
-- justificação do utilizador: "se tiver cliente final para que é que vai
-- aumentar o stock depois da encomenda chegar se vais dar logo saída se tem
-- cliente final?" — mostrar unidades "disponíveis" que já estão comprometidas
-- é enganador.
--
-- rpc_receive_purchase_order_lines passa a saltar o INSERT em
-- stock_movements (e portanto a atualização de stocks.quantity via
-- fn_stock_movements_apply) quando a encomenda tem source_type='contract'.
-- Continua a atualizar purchase_order_items.received_quantity e
-- purchase_orders.status normalmente — a receção fica registada, só não
-- mexe no stock geral. Encomendas SEM ligação (source_type IS NULL,
-- a maioria) continuam a gerar entrada automaticamente, sem alteração.
--
-- rpc_receive_purchase_order (wrapper fino) não precisa de alteração — já
-- delega tudo para este RPC.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order_lines(
    p_purchase_order_id uuid,
    p_warehouse_id      uuid,
    p_lines             jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor            uuid;
  v_po               public.purchase_orders%ROWTYPE;
  v_line_input       jsonb;
  v_line_id          uuid;
  v_qty_requested    numeric;
  v_qty_int          integer;
  v_item             record;
  v_item_supplier_id uuid;
  v_remaining        numeric;
  v_balance          integer;
  v_received_total   numeric;
  v_lines_out        jsonb := '[]'::jsonb;
  v_sum_quantity     numeric;
  v_sum_received     numeric;
  v_new_status       text;
  v_skip_stock       boolean;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_po.status = 'received' THEN
    RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = v_po.organization_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Linhas de receção não podem estar vazias' USING ERRCODE = 'check_violation';
  END IF;

  -- Ligada a uma Encomenda Cliente = já tem destino certo, não entra no
  -- stock geral (ver cabeçalho desta migration).
  v_skip_stock := (v_po.source_type = 'contract');

  FOR v_line_input IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_id       := nullif(v_line_input ->> 'purchase_order_item_id', '')::uuid;
    v_qty_requested := nullif(v_line_input ->> 'quantity', '')::numeric;

    IF v_line_id IS NULL THEN
      RAISE EXCEPTION 'purchase_order_item_id em falta numa linha de receção' USING ERRCODE = 'check_violation';
    END IF;

    SELECT id, product_id, item_type, quantity, unit_price, received_quantity, description
    INTO v_item
    FROM public.purchase_order_items
    WHERE id = v_line_id AND purchase_order_id = p_purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', v_line_id
        USING ERRCODE = 'no_data_found';
    END IF;

    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto — serviços não têm stock físico e não podem ser recebidos', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_qty_requested IS NULL OR v_qty_requested <= 0 THEN
      RAISE EXCEPTION 'A quantidade a receber na linha "%" tem de ser positiva', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_qty_requested <> floor(v_qty_requested) THEN
      RAISE EXCEPTION 'A linha "%" tem uma quantidade não inteira (%) — o stock só regista unidades inteiras. Corrige a linha antes de receber.', v_item.description, v_qty_requested
        USING ERRCODE = 'check_violation';
    END IF;

    v_remaining := v_item.quantity - v_item.received_quantity;
    IF v_qty_requested > v_remaining THEN
      RAISE EXCEPTION 'A quantidade a receber (%) na linha "%" excede o saldo por receber desta linha (% de % por receber; já recebido % de %)',
        v_qty_requested, v_item.description, v_remaining, v_item.quantity, v_item.received_quantity, v_item.quantity
        USING ERRCODE = 'check_violation';
    END IF;

    v_qty_int := v_qty_requested::integer;
    v_balance := NULL;

    IF v_skip_stock THEN
      -- Sem movimento de entrada — a encomenda já tem destino certo (cliente
      -- final), não passa pelo stock geral. balance_after fica NULL no
      -- output (informativo, não há stock_movements gerado para esta linha).
      NULL;
    ELSE
      SELECT id INTO v_item_supplier_id
      FROM public.item_suppliers
      WHERE product_id = v_item.product_id
        AND supplier_id = v_po.supplier_id
        AND deleted_at IS NULL
      ORDER BY is_preferred DESC
      LIMIT 1;

      INSERT INTO public.stock_movements (
        organization_id, product_id, warehouse_id, movement_type, quantity,
        document_number, document_type, item_supplier_id, unit_cost_at_time,
        reference_id, notes, created_by
      ) VALUES (
        v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_qty_int,
        v_po.order_number, 'compra', v_item_supplier_id, v_item.unit_price,
        v_item.id,
        format('Receção de %s: %s unidades agora nesta linha (total recebido %s de %s)',
               v_po.order_number, v_qty_int, v_item.received_quantity + v_qty_requested, v_item.quantity),
        v_actor
      )
      RETURNING balance_after INTO v_balance;
    END IF;

    UPDATE public.purchase_order_items
    SET received_quantity = received_quantity + v_qty_requested
    WHERE id = v_item.id
    RETURNING received_quantity INTO v_received_total;

    v_lines_out := v_lines_out || jsonb_build_object(
      'product_id',               v_item.product_id,
      'quantity_received_now',    v_qty_int,
      'received_quantity_total',  v_received_total,
      'remaining',                v_item.quantity - v_received_total,
      'balance_after',            v_balance,
      'stock_updated',            NOT v_skip_stock
    );
  END LOOP;

  SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(received_quantity), 0)
  INTO v_sum_quantity, v_sum_received
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';

  IF v_sum_quantity > 0 AND v_sum_received >= v_sum_quantity THEN
    v_new_status := 'received';
  ELSIF v_sum_received > 0 THEN
    v_new_status := 'partially_received';
  ELSE
    v_new_status := v_po.status;
  END IF;

  UPDATE public.purchase_orders
  SET status = v_new_status, updated_at = now()
  WHERE id = p_purchase_order_id;

  RETURN jsonb_build_object(
    'order_number',   v_po.order_number,
    'warehouse_id',   p_warehouse_id,
    'status',         v_new_status,
    'lines',          v_lines_out,
    'stock_skipped',  v_skip_stock
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_receive_purchase_order_lines IS
  'Regista a receção (total ou parcial) de 1+ linhas de produto de uma '
  'encomenda. Se a encomenda NÃO estiver ligada a uma Encomenda Cliente '
  '(source_type IS DISTINCT FROM ''contract''): gera 1 movimento de entrada '
  'em stock_movements por linha (reference_id = purchase_order_items.id), '
  'como sempre. Se estiver ligada (já tem cliente final): salta o stock, só '
  'atualiza received_quantity/status — pedido do utilizador 2026-08-31, ver '
  'cabeçalho da migration 20261115210000. Exige purchase_orders.edit + '
  '.receive + inventory.edit.';

REVOKE ALL ON FUNCTION public.rpc_receive_purchase_order_lines FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_receive_purchase_order_lines TO authenticated;
