-- Receber encomendas a fornecedor deixa de exigir purchase_orders.edit.
--
-- Um perfil de armazém (ex.: warehouse manager) tem "Receber encomendas de
-- compra" + "Editar registos de inventário", mas não deve poder editar as
-- encomendas (linhas, preços, fornecedor). Até aqui as duas RPCs de receção
-- exigiam também purchase_orders.edit e devolviam "Sem permissão para receber
-- encomendas desta organização".
--
-- Continua a exigir: organização visível + purchase_orders.receive +
-- inventory.edit (a receção dá entrada de stock). Corpo copiado da versão
-- viva (pg_get_functiondef, 30/09/2026); a única alteração é a linha de
-- purchase_orders.edit retirada. CREATE OR REPLACE mantém os GRANTs.
CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order_lines(p_purchase_order_id uuid, p_warehouse_id uuid, p_lines jsonb, p_actual_delivery_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- NOVO (20261204203500): embalagens — fator congelado na linha.
  v_units            integer;
  v_stock_qty        bigint;
  v_unit_cost        numeric;
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
  -- stock geral (20261115210000).
  v_skip_stock := (v_po.source_type = 'contract');

  FOR v_line_input IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_id       := nullif(v_line_input ->> 'purchase_order_item_id', '')::uuid;
    v_qty_requested := nullif(v_line_input ->> 'quantity', '')::numeric;

    IF v_line_id IS NULL THEN
      RAISE EXCEPTION 'purchase_order_item_id em falta numa linha de receção' USING ERRCODE = 'check_violation';
    END IF;

    SELECT id, product_id, item_type, quantity, unit_price, received_quantity, description,
           uom_id, units_per_uom, supplier_sku
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

    -- NOVO (20261204203500): a linha está na unidade de compra (ex. PK100);
    -- o stock entra na unidade do produto. received_quantity continua na
    -- unidade da linha. Custo por unidade de stock = preço da linha / fator.
    -- Com fator 1 tudo fica exatamente como antes.
    v_units     := COALESCE(v_item.units_per_uom, 1);
    v_stock_qty := v_qty_int::bigint * v_units;
    IF v_stock_qty > 2147483647 THEN
      RAISE EXCEPTION 'A linha "%" excede o limite de stock (% unidades)', v_item.description, v_stock_qty
        USING ERRCODE = 'numeric_value_out_of_range';
    END IF;
    v_unit_cost := CASE WHEN v_units = 1 THEN v_item.unit_price
                        ELSE round(v_item.unit_price / v_units, 6) END;

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
      -- NOVO (20261204203500): primeiro a ligação na MESMA unidade da linha.
      ORDER BY (uom_id IS NOT DISTINCT FROM v_item.uom_id) DESC, is_preferred DESC
      LIMIT 1;

      INSERT INTO public.stock_movements (
        organization_id, product_id, warehouse_id, movement_type, quantity,
        document_number, document_type, item_supplier_id, unit_cost_at_time,
        reference_id, notes, created_by
      ) VALUES (
        v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_stock_qty::integer,
        v_po.order_number, 'compra', v_item_supplier_id, v_unit_cost,
        v_item.id,
        CASE WHEN v_units = 1 THEN
          format('Receção de %s: %s unidades agora nesta linha (total recebido %s de %s)',
                 v_po.order_number, v_qty_int, v_item.received_quantity + v_qty_requested, v_item.quantity)
        ELSE
          format('Receção de %s: %s × %s un. (%s unidades de stock) agora nesta linha (total recebido %s de %s)',
                 v_po.order_number, v_qty_int, v_units, v_stock_qty, v_item.received_quantity + v_qty_requested, v_item.quantity)
        END,
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
      'stock_updated',            NOT v_skip_stock,
      -- NOVO (20261204203500): chaves acrescentadas; as anteriores não mudam.
      'units_per_uom',            v_units,
      'stock_quantity_now',       CASE WHEN v_skip_stock THEN NULL ELSE v_stock_qty END
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

  -- NOVO (20261130010000): actual_delivery_date só é gravada quando a
  -- encomenda fica TOTALMENTE recebida — numa receção parcial ainda não há
  -- "data de entrega" da encomenda como um todo.
  IF v_new_status = 'received' THEN
    UPDATE public.purchase_orders
    SET status = v_new_status,
        updated_at = now(),
        actual_delivery_date = COALESCE(p_actual_delivery_date, current_date)
    WHERE id = p_purchase_order_id;
  ELSE
    UPDATE public.purchase_orders
    SET status = v_new_status, updated_at = now()
    WHERE id = p_purchase_order_id;
  END IF;

  RETURN jsonb_build_object(
    'order_number',   v_po.order_number,
    'warehouse_id',   p_warehouse_id,
    'status',         v_new_status,
    'lines',          v_lines_out,
    'stock_skipped',  v_skip_stock
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order(p_purchase_order_id uuid, p_warehouse_id uuid, p_actual_delivery_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_has_product_lines boolean;
  v_lines             jsonb;
  v_actor             uuid;
  v_org               uuid;
  v_status            text;
  v_order_number      text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product'
  ) INTO v_has_product_lines;

  IF NOT v_has_product_lines THEN
    -- Edge case documentado desde 20261114040000: encomenda só com linhas de
    -- serviço (sem stock físico) não tem p_lines possível para construir
    -- (rpc_receive_purchase_order_lines exige não-vazio). Replica o
    -- comportamento do RPC original (20261113280000): marca a encomenda como
    -- recebida diretamente, sem stock_movements nenhum, com os mesmos checks
    -- de status/permissão/organização/armazém. É sempre receção TOTAL, por
    -- isso grava actual_delivery_date aqui também (20261130010000).
    v_actor := public.current_business_user_id();
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
    END IF;

    SELECT organization_id, status, order_number
    INTO v_org, v_status, v_order_number
    FROM public.purchase_orders
    WHERE id = p_purchase_order_id AND deleted_at IS NULL
    FOR UPDATE;

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
       OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
       OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
      RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.warehouses
      WHERE id = p_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.purchase_orders
    SET status = 'received',
        updated_at = now(),
        actual_delivery_date = COALESCE(p_actual_delivery_date, current_date)
    WHERE id = p_purchase_order_id;

    RETURN jsonb_build_object(
      'order_number', v_order_number,
      'warehouse_id', p_warehouse_id,
      'status',       'received',
      'lines',        '[]'::jsonb
    );
  END IF;

  -- Caminho normal: monta p_lines com todas as linhas de produto ainda por
  -- receber, na quantidade remanescente — e delega, incluindo
  -- p_actual_delivery_date. Linhas já totalmente recebidas (quantity <=
  -- received_quantity) ficam de fora.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'purchase_order_item_id', id,
           'quantity', (quantity - received_quantity)
         )), '[]'::jsonb)
  INTO v_lines
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id
    AND item_type = 'product'
    AND quantity > received_quantity;

  RETURN public.rpc_receive_purchase_order_lines(p_purchase_order_id, p_warehouse_id, v_lines, p_actual_delivery_date);
END;
$function$;
