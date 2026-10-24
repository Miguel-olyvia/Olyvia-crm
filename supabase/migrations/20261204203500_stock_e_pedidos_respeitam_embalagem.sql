-- ============================================================================
-- Stock e pedidos a fornecedor passam a respeitar a embalagem da linha
--
-- Redefine (a partir da versão VIVA, pg_get_functiondef de 23/09/2026 —
-- só se acrescenta o fator, todo o resto fica igual):
--   public.rpc_receive_purchase_order_lines(uuid,uuid,jsonb,date)
--       stock += quantidade × units_per_uom; custo unitário do movimento =
--       unit_price / units_per_uom (arredondado a 6 casas, só se fator > 1);
--       a ligação item_suppliers preferida é a da MESMA unidade da linha
--       (supplier_sku_at_time continua NULL como hoje — o snapshot da
--       referência fica em purchase_order_items.supplier_sku, ligada ao
--       movimento por reference_id); received_quantity continua
--       na unidade da linha. Saída ganha 'units_per_uom' e 'stock_quantity_now'.
--   public.fn_contract_stock_deduction() / public.fn_proposal_stock_deduction()
--       baixa = qt × units_per_uom (fator gravado na linha, nunca relido da uom);
--       a validação de inteiro aplica-se a esse resultado.
--   public.fn_contract_supplier_request() / public.fn_proposal_supplier_request()
--       unidades vendidas (qt × fator da linha) -> unidade da ligação preferida
--       (item_suppliers.uom_id), arredondando PARA CIMA: 12 un com ligação
--       PK100 => 1 PK100. Grava uom_id/supplier_sku na purchase_order_item
--       (units_per_uom pelo gatilho). O preço de recurso (product_prices, por
--       unidade de stock) é multiplicado pelo fator da ligação. Unidade da
--       ligação incompatível => linha saltada com aviso (nunca aborta).
--       A verificação "stock já cobre" (só contrato) compara unidades de stock.
--   public.rpc_get_client_order_document(uuid)
--       'quantity' passa a vir em unidades de stock (qt × fator) — é o valor
--       que o ecrã envia a rpc_confirm_client_order_stock_exit, que por isso
--       NÃO precisa de mudar. Chaves novas: line_quantity, uom_id, unidade,
--       units_per_uom.
--   public.rpc_list_client_order_documents(...)
--       a comparação com o stock disponível usa unidades de stock.
--
-- NÃO altera: fn_contract_cancelled_stock_reversal / fn_proposal_cancelled_
--   stock_reversal (estornam a quantidade do PRÓPRIO movimento — já são
--   simétricas), rpc_receive_purchase_order (delega nas linhas, quantidades
--   na unidade da linha), rpc_register_sale_stock_movement, rpc_confirm_client_
--   order_stock_exit, fn_stock_movements_apply, nenhuma política/GRANT.
--
-- Com units_per_uom = 1 (todas as linhas existentes) cada função produz
-- exatamente os mesmos movimentos, quantidades, custos e notas de hoje.
-- ============================================================================

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

CREATE OR REPLACE FUNCTION public.fn_contract_stock_deduction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_signed_aliases       text[] := ARRAY['signed', 'assinado'];
  v_trigger_mode         text;
  v_default_warehouse_id uuid;
  v_resolved_warehouse   uuid;
  v_active_warehouse_cnt integer;
  v_resolved_quote_id    uuid;
  v_line                 record;
  v_qty_int              integer;
  v_result               jsonb;
  v_lines_processed      integer := 0;
  v_lines_skipped        integer := 0;
BEGIN
  -- Only ever react to a transition into the signed stage — exact same gate
  -- as fn_contract_signed_convert_to_client() (20261113190000), replicated
  -- here on purpose (not a new style).
  IF NEW.status IS NULL OR NOT (NEW.status = ANY (v_signed_aliases)) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block the write to client_contracts.
  BEGIN
    -- ── 1. Organization inventory settings (default when the org has no row
    --      configured yet: 'contract_signed', no default warehouse). ───────
    SELECT stock_deduction_trigger, default_warehouse_id
    INTO v_trigger_mode, v_default_warehouse_id
    FROM public.organization_inventory_settings
    WHERE organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      v_trigger_mode := 'contract_signed';
      v_default_warehouse_id := NULL;
    END IF;

    -- ── 2. This organization chose "deduct on proposal acceptance" instead
    --      — that is Fase 5.0C, not implemented yet. Do nothing here. ──────
    IF v_trigger_mode <> 'contract_signed' THEN
      RETURN NEW;
    END IF;

    -- ── 3. Resolve the quote (NOVO 20261115080000): prefer the direct FK,
    --      fall back to the proposal's own quote when execute-workflow left
    --      quote_id NULL (see migration header — confirmed on 84% of real
    --      contracts with an actual quote behind them). No quote resolvable
    --      at all → nothing to deduct. ──────────────────────────────────────
    v_resolved_quote_id := NEW.quote_id;
    IF v_resolved_quote_id IS NULL AND NEW.proposal_id IS NOT NULL THEN
      SELECT id INTO v_resolved_quote_id
      FROM public.quotes
      WHERE proposal_id = NEW.proposal_id
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    IF v_resolved_quote_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- ── 4. Resolve the warehouse: settings default, else exactly-one-active
    --      -warehouse fallback, else no movement at all (never guess). ─────
    v_resolved_warehouse := v_default_warehouse_id;

    IF v_resolved_warehouse IS NULL THEN
      SELECT count(*) INTO v_active_warehouse_cnt
      FROM public.warehouses
      WHERE organization_id = NEW.organization_id
        AND deleted_at IS NULL;

      IF v_active_warehouse_cnt = 1 THEN
        SELECT id INTO v_resolved_warehouse
        FROM public.warehouses
        WHERE organization_id = NEW.organization_id
          AND deleted_at IS NULL;
      ELSE
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'stock_movement', NULL,
          'trigger:contract_stock_deduction_no_warehouse', 'warning',
          jsonb_build_object(
            'reason', 'No default_warehouse_id configured and organization does not have exactly one active warehouse',
            'active_warehouse_count', v_active_warehouse_cnt
          )
        );
        RETURN NEW;
      END IF;
    END IF;

    -- ── 5. One sale stock movement per quote line whose product has
    --      manages_stock=true. Bundle-expanded lines (bundle_id set) are NOT
    --      excluded — they are already real product lines (plan decision 4:
    --      BundleSelectionTab already expands a bundle into individual
    --      quote_lines at quote-creation time). A line with a fractional
    --      quantity is skipped with a warning log — it must never abort the
    --      remaining lines of the same contract. Likewise, any other
    --      unexpected failure on a single line (caught per-line below) never
    --      stops the loop. ─────────────────────────────────────────────────
    FOR v_line IN
      SELECT ql.id, ql.product_id, ql.qt,
             COALESCE(ql.units_per_uom, 1) AS units_per_uom  -- NOVO (20261204203500)
      FROM public.quote_lines ql
      JOIN public.products p ON p.id = ql.product_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.product_id IS NOT NULL
        AND p.manages_stock = true
    LOOP
      IF v_line.qt IS NULL OR v_line.qt <= 0 THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'quantity_null_or_not_positive', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- NOVO (20261204203500): a validação de inteiro aplica-se à quantidade
      -- em unidades de stock (qt × fator). Com fator 1 é a mesma de antes.
      IF (v_line.qt * v_line.units_per_uom) <> floor(v_line.qt * v_line.units_per_uom) THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      v_qty_int := (v_line.qt * v_line.units_per_uom)::integer;

      -- Per-line guard: a failure registering one line's movement (e.g. an
      -- unexpected RPC-level rejection) must never abort the remaining lines
      -- of the same contract.
      BEGIN
        v_result := public.rpc_register_sale_stock_movement(
          p_product_id        => v_line.product_id,
          p_warehouse_id       => v_resolved_warehouse,
          p_quantity           => v_qty_int,
          p_quote_line_id      => v_line.id,
          p_sale_source_type   => 'contract',
          p_sale_source_id     => NEW.id,
          p_document_number    => NEW.contract_number,
          p_unit_cost_at_time  => NULL,
          p_organization_id    => NEW.organization_id
        );

        v_lines_processed := v_lines_processed + 1;

        -- Traceable for Fase 5.0D (user-visible alerts, not implemented
        -- here) — nunca bloqueia nem impede o resto do fluxo.
        IF COALESCE((v_result ->> 'was_insufficient')::boolean, false) THEN
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, execution_data
          ) VALUES (
            'contract', NEW.id, 'stock_movement', (v_result ->> 'movement_id')::uuid,
            'trigger:contract_stock_deduction_insufficient', 'warning',
            jsonb_build_object('quote_line_id', v_line.id, 'product_id', v_line.product_id, 'result', v_result)
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_error', 'error', SQLERRM,
          jsonb_build_object('product_id', v_line.product_id, 'qt', v_line.qt)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'contract', NEW.id, 'stock_movement', NULL,
      'trigger:contract_stock_deduction', 'success',
      jsonb_build_object('lines_processed', v_lines_processed, 'lines_skipped', v_lines_skipped, 'warehouse_id', v_resolved_warehouse, 'resolved_quote_id', v_resolved_quote_id)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'contract', NEW.id, 'stock_movement', NULL,
        'trigger:contract_stock_deduction', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      -- Even the error-log insert must never propagate.
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_proposal_stock_deduction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trigger_mode         text;
  v_default_warehouse_id uuid;
  v_resolved_warehouse   uuid;
  v_active_warehouse_cnt integer;
  v_resolved_quote_id    uuid;
  v_line                 record;
  v_qty_int              integer;
  v_result               jsonb;
  v_lines_processed      integer := 0;
  v_lines_skipped        integer := 0;
BEGIN
  -- Only ever react to a transition into 'accepted' — proposals_status_check
  -- has a single literal for acceptance (no alias array needed, unlike
  -- client_contracts' 'signed'/'assinado').
  IF NEW.status IS DISTINCT FROM 'accepted' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- proposals.organization_id is NULLABLE (unlike client_contracts.
  -- organization_id, NOT NULL) — nothing to resolve settings/warehouse
  -- against, and stock_movements.organization_id is NOT NULL. Never guess.
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block accept_proposal_atomic's UPDATE
  -- (which has no BEGIN/EXCEPTION of its own — confirmed by reading
  -- 20261115020000).
  BEGIN
    -- ── 1. Organization inventory settings (default when the org has no row
    --      configured yet: 'contract_signed', no default warehouse). ───────
    SELECT stock_deduction_trigger, default_warehouse_id
    INTO v_trigger_mode, v_default_warehouse_id
    FROM public.organization_inventory_settings
    WHERE organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      v_trigger_mode := 'contract_signed';
      v_default_warehouse_id := NULL;
    END IF;

    -- ── 2. This organization deducts on contract signature instead (the
    --      default) — that is Fase 5.0B, handled by fn_contract_stock_
    --      deduction(). Do nothing here (inverse guard of that function's
    --      own point 2). ───────────────────────────────────────────────────
    IF v_trigger_mode <> 'proposal_accepted' THEN
      RETURN NEW;
    END IF;

    -- ── 3. Resolve the quote: proposals has no quote_id column (unlike
    --      client_contracts) — always use the same fallback subquery
    --      20261115080000 introduced for contracts, applied directly here.
    --      No quote resolvable → nothing to deduct. ─────────────────────────
    SELECT id INTO v_resolved_quote_id
    FROM public.quotes
    WHERE proposal_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_resolved_quote_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- ── 4. Resolve the warehouse: settings default, else exactly-one-active
    --      -warehouse fallback, else no movement at all (never guess). ─────
    v_resolved_warehouse := v_default_warehouse_id;

    IF v_resolved_warehouse IS NULL THEN
      SELECT count(*) INTO v_active_warehouse_cnt
      FROM public.warehouses
      WHERE organization_id = NEW.organization_id
        AND deleted_at IS NULL;

      IF v_active_warehouse_cnt = 1 THEN
        SELECT id INTO v_resolved_warehouse
        FROM public.warehouses
        WHERE organization_id = NEW.organization_id
          AND deleted_at IS NULL;
      ELSE
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'proposal', NEW.id, 'stock_movement', NULL,
          'trigger:proposal_stock_deduction_no_warehouse', 'warning',
          jsonb_build_object(
            'reason', 'No default_warehouse_id configured and organization does not have exactly one active warehouse',
            'active_warehouse_count', v_active_warehouse_cnt
          )
        );
        RETURN NEW;
      END IF;
    END IF;

    -- ── 5. One sale stock movement per quote line whose product has
    --      manages_stock=true. Bundle-expanded lines (bundle_id set) are NOT
    --      excluded — same plan decision as Fase 5.0B. A line with a
    --      fractional/invalid quantity is skipped with a warning log — it
    --      must never abort the remaining lines. Any other unexpected
    --      failure on a single line (caught per-line below) never stops the
    --      loop. ─────────────────────────────────────────────────────────────
    FOR v_line IN
      SELECT ql.id, ql.product_id, ql.qt,
             COALESCE(ql.units_per_uom, 1) AS units_per_uom  -- NOVO (20261204203500)
      FROM public.quote_lines ql
      JOIN public.products p ON p.id = ql.product_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.product_id IS NOT NULL
        AND p.manages_stock = true
    LOOP
      IF v_line.qt IS NULL OR v_line.qt <= 0 THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'proposal', NEW.id, 'quote_line', v_line.id,
          'trigger:proposal_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'quantity_null_or_not_positive', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- NOVO (20261204203500): a validação de inteiro aplica-se à quantidade
      -- em unidades de stock (qt × fator). Com fator 1 é a mesma de antes.
      IF (v_line.qt * v_line.units_per_uom) <> floor(v_line.qt * v_line.units_per_uom) THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'proposal', NEW.id, 'quote_line', v_line.id,
          'trigger:proposal_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      v_qty_int := (v_line.qt * v_line.units_per_uom)::integer;

      -- Per-line guard: a failure registering one line's movement must never
      -- abort the remaining lines of the same proposal.
      BEGIN
        v_result := public.rpc_register_sale_stock_movement(
          p_product_id        => v_line.product_id,
          p_warehouse_id       => v_resolved_warehouse,
          p_quantity           => v_qty_int,
          p_quote_line_id      => v_line.id,
          p_sale_source_type   => 'proposal',
          p_sale_source_id     => NEW.id,
          p_document_number    => COALESCE(NEW.proposal_number, NEW.id::text),
          p_unit_cost_at_time  => NULL,
          p_organization_id    => NEW.organization_id
        );

        v_lines_processed := v_lines_processed + 1;

        -- Traceable for Fase 5.0D (user-visible alerts, not implemented
        -- here) — never blocks nor stops the rest of the flow.
        IF COALESCE((v_result ->> 'was_insufficient')::boolean, false) THEN
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, execution_data
          ) VALUES (
            'proposal', NEW.id, 'stock_movement', (v_result ->> 'movement_id')::uuid,
            'trigger:proposal_stock_deduction_insufficient', 'warning',
            jsonb_build_object('quote_line_id', v_line.id, 'product_id', v_line.product_id, 'result', v_result)
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'proposal', NEW.id, 'quote_line', v_line.id,
          'trigger:proposal_stock_deduction_line_error', 'error', SQLERRM,
          jsonb_build_object('product_id', v_line.product_id, 'qt', v_line.qt)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'proposal', NEW.id, 'stock_movement', NULL,
      'trigger:proposal_stock_deduction', 'success',
      jsonb_build_object('lines_processed', v_lines_processed, 'lines_skipped', v_lines_skipped, 'warehouse_id', v_resolved_warehouse, 'resolved_quote_id', v_resolved_quote_id)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'proposal', NEW.id, 'stock_movement', NULL,
        'trigger:proposal_stock_deduction', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      -- Even the error-log insert must never propagate.
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_contract_supplier_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_signed_aliases       text[] := ARRAY['signed', 'assinado'];
  v_trigger_mode         text;
  v_resolved_quote_id    uuid;
  v_actor                uuid;
  v_line                 record;
  v_supplier_id          uuid;
  v_purchase_price       numeric;
  v_supplier_map         jsonb := '{}'::jsonb;
  v_supplier_key         text;
  v_supplier_lines       jsonb;
  v_po_id                uuid;
  v_po_item              jsonb;
  v_qty_int              integer;
  v_unit_price           numeric;
  v_line_total           numeric;
  v_po_total             numeric;
  v_lines_processed      integer := 0;
  v_lines_skipped        integer := 0;
  -- NOVO (20261204203500): unidade da ligação item_suppliers escolhida.
  v_link_uom             uuid;
  v_link_sku             text;
  v_link_units           integer;
  v_base_qty             numeric;
  v_purchase_orders_created integer := 0;
  v_suppliers_skipped_idempotent integer := 0;
  v_available_stock      numeric;
  v_lines_covered_by_stock integer := 0;
BEGIN
  IF NEW.status IS NULL OR NOT (NEW.status = ANY (v_signed_aliases)) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT stock_deduction_trigger INTO v_trigger_mode
    FROM public.organization_inventory_settings
    WHERE organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      v_trigger_mode := 'contract_signed';
    END IF;

    IF v_trigger_mode <> 'contract_signed' THEN
      RETURN NEW;
    END IF;

    v_resolved_quote_id := NEW.quote_id;
    IF v_resolved_quote_id IS NULL AND NEW.proposal_id IS NOT NULL THEN
      SELECT id INTO v_resolved_quote_id
      FROM public.quotes
      WHERE proposal_id = NEW.proposal_id
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    IF v_resolved_quote_id IS NULL THEN
      RETURN NEW;
    END IF;

    v_actor := public.current_business_user_id();
    IF v_actor IS NULL THEN
      SELECT q.created_by INTO v_actor
      FROM public.quotes q
      WHERE q.id = v_resolved_quote_id;
    END IF;

    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Não foi possível determinar o autor do pedido a fornecedor (contrato %, quote %)', NEW.id, v_resolved_quote_id;
    END IF;

    -- ── 5. Walk every product line whose product does NOT manage stock (the
    --      majority — sold to order): linhas diretas + produtos reais dentro
    --      de linhas de Bundle (20261120170000 — ver cabeçalho). Validate
    --      quantity (null/not positive/fractional skipped with a warning,
    --      never aborts the rest); skip the line entirely, no PO at all,
    --      when existing stock across the org's active warehouses already
    --      covers the requested quantity (20261120160000); resolve the
    --      preferred supplier per product (item_suppliers, is_preferred=
    --      true, deleted_at IS NULL — at most 1 row thanks to the partial
    --      unique index from Fase 1, LIMIT 1 as a defensive measure);
    --      accumulate eligible lines grouped by resolved supplier into a
    --      jsonb map (keyed by supplier_id::text) — avoids a temp table,
    --      safe to build incrementally inside a single trigger
    --      invocation. ─────────────────────────────────────────────────────
    FOR v_line IN
      SELECT ql.id AS quote_line_id, ql.product_id, ql.qt,
             p.name AS product_name, p.sku AS product_sku,
             COALESCE(ql.units_per_uom, 1) AS units_per_uom  -- NOVO (20261204203500)
      FROM public.quote_lines ql
      JOIN public.products p ON p.id = ql.product_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.product_id IS NOT NULL
        AND p.manages_stock = false

      UNION ALL

      SELECT
        ql.id AS quote_line_id,
        p.id AS product_id,
        (COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1)) AS qt,
        p.name AS product_name, p.sku AS product_sku,
        1 AS units_per_uom  -- componente de bundle: já em unidades do produto
      FROM public.quote_lines ql
      JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
        ON true
      JOIN public.products p ON p.id = (comp.value ->> 'source_id')::uuid
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.bundle_id IS NOT NULL
        AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
        AND comp.value ->> 'type' = 'product'
        AND comp.value ->> 'source_id' IS NOT NULL
        AND p.manages_stock = false
    LOOP
      IF v_line.qt IS NULL OR v_line.qt <= 0 THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:contract_po_request_line_skipped', 'warning',
          jsonb_build_object('reason', 'quantity_null_or_not_positive', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- NOVO (20261204203500): quantidade vendida em unidades de stock.
      v_base_qty := v_line.qt * v_line.units_per_uom;

      IF v_base_qty <> floor(v_base_qty) THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:contract_po_request_line_skipped', 'warning',
          jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- 20261120160000: já existe stock físico suficiente? Soma-se em todos
      -- os armazéns ATIVOS da organização. Cobertura parcial (stock < pedido)
      -- ainda gera a encomenda pela quantidade total da linha, de propósito.
      SELECT COALESCE(SUM(s.quantity), 0) INTO v_available_stock
      FROM public.stocks s
      JOIN public.warehouses w ON w.id = s.warehouse_id
      WHERE s.product_id = v_line.product_id
        AND s.deleted_at IS NULL
        AND w.organization_id = NEW.organization_id
        AND w.deleted_at IS NULL;

      IF v_available_stock >= v_base_qty THEN
        v_lines_covered_by_stock := v_lines_covered_by_stock + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:contract_po_request_covered_by_stock', 'info',
          jsonb_build_object('product_id', v_line.product_id, 'required_qty', v_base_qty, 'available_stock', v_available_stock)
        );
        CONTINUE;
      END IF;

      SELECT supplier_id, purchase_price, uom_id, supplier_sku
        INTO v_supplier_id, v_purchase_price, v_link_uom, v_link_sku
      FROM public.item_suppliers
      WHERE product_id = v_line.product_id
        AND is_preferred = true
        AND deleted_at IS NULL
      LIMIT 1;

      IF v_supplier_id IS NULL THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:contract_po_request_no_supplier', 'warning',
          jsonb_build_object('reason', 'no_preferred_supplier', 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- 20261115090000, reposto aqui: item_suppliers.purchase_price nem
      -- sempre está preenchido — cai para o preço de compra do próprio
      -- produto antes de aceitar 0,00.
      -- NOVO (20261204203500): a ligação pode vender em embalagem (ex. PK100).
      -- Unidade incompatível => a linha é saltada com aviso, nunca aborta as outras.
      BEGIN
        v_link_units := public.fn_uom_units_per(v_link_uom, v_line.product_id);
      EXCEPTION WHEN OTHERS THEN
        v_link_units := NULL;
      END;

      IF v_link_units IS NULL OR v_link_units < 1 THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:contract_po_request_line_skipped', 'warning',
          jsonb_build_object('reason', 'incompatible_supplier_uom', 'product_id', v_line.product_id, 'uom_id', v_link_uom)
        );
        CONTINUE;
      END IF;

      IF v_purchase_price IS NULL THEN
        SELECT price INTO v_purchase_price
        FROM public.product_prices
        WHERE product_id = v_line.product_id AND price_type = 'purchase'
        ORDER BY valid_from DESC NULLS LAST
        LIMIT 1;
        -- NOVO (20261204203500): o preço do produto é por unidade de stock;
        -- a linha da encomenda é na unidade da ligação.
        IF v_link_units <> 1 THEN
          v_purchase_price := v_purchase_price * v_link_units;
        END IF;
      END IF;

      -- NOVO (20261204203500): unidades vendidas -> unidade da ligação,
      -- arredondando para cima (12 un com ligação PK100 => 1 PK100).
      v_qty_int := ceil(v_base_qty / v_link_units)::integer;
      v_lines_processed := v_lines_processed + 1;

      v_supplier_key := v_supplier_id::text;
      v_supplier_map := v_supplier_map || jsonb_build_object(
        v_supplier_key,
        COALESCE(v_supplier_map -> v_supplier_key, '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'quote_line_id',  v_line.quote_line_id,
            'product_id',     v_line.product_id,
            'quantity',       v_qty_int,
            'product_name',   v_line.product_name,
            'product_sku',    v_line.product_sku,
            'unit_price',     v_purchase_price,
            'uom_id',         v_link_uom,
            'units_per_uom',  v_link_units,
            'supplier_sku',   v_link_sku
          )
        )
      );
    END LOOP;

    -- ── 6. One purchase_orders per distinct resolved supplier — idempotent
    --      per (source_type='contract', source_id=NEW.id, supplier_id). ────
    FOR v_supplier_key IN SELECT jsonb_object_keys(v_supplier_map)
    LOOP
      v_supplier_id    := v_supplier_key::uuid;
      v_supplier_lines := v_supplier_map -> v_supplier_key;

      IF EXISTS (
        SELECT 1 FROM public.purchase_orders
        WHERE source_type = 'contract' AND source_id = NEW.id AND supplier_id = v_supplier_id
      ) THEN
        v_suppliers_skipped_idempotent := v_suppliers_skipped_idempotent + 1;
        CONTINUE;
      END IF;

      BEGIN
        INSERT INTO public.purchase_orders (
          organization_id, supplier_id, order_date, status,
          source_type, source_id, notes, created_by
        ) VALUES (
          NEW.organization_id, v_supplier_id, now()::date, 'pending',
          'contract', NEW.id,
          format('Gerada automaticamente a partir do contrato %s', COALESCE(NEW.contract_number, NEW.id::text)),
          v_actor
        )
        RETURNING id INTO v_po_id;

        v_po_total := 0;

        FOR v_po_item IN SELECT * FROM jsonb_array_elements(v_supplier_lines)
        LOOP
          v_unit_price := COALESCE((v_po_item ->> 'unit_price')::numeric, 0);
          v_line_total := v_unit_price * (v_po_item ->> 'quantity')::numeric;
          v_po_total   := v_po_total + v_line_total;

          INSERT INTO public.purchase_order_items (
            purchase_order_id, item_type, product_id, description, sku,
            quantity, unit_price, total_price,
            uom_id, supplier_sku  -- NOVO (20261204203500); units_per_uom pelo gatilho
          ) VALUES (
            v_po_id, 'product', (v_po_item ->> 'product_id')::uuid,
            v_po_item ->> 'product_name', v_po_item ->> 'product_sku',
            (v_po_item ->> 'quantity')::numeric, v_unit_price, v_line_total,
            nullif(v_po_item ->> 'uom_id', '')::uuid, nullif(v_po_item ->> 'supplier_sku', '')
          );
        END LOOP;

        UPDATE public.purchase_orders SET total_value = v_po_total WHERE id = v_po_id;

        v_purchase_orders_created := v_purchase_orders_created + 1;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'contract', NEW.id, 'purchase_order', NULL,
          'trigger:contract_po_request_supplier_error', 'error', SQLERRM,
          jsonb_build_object('supplier_id', v_supplier_id)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'contract', NEW.id, 'purchase_order', NULL,
      'trigger:contract_po_request', 'success',
      jsonb_build_object(
        'lines_processed', v_lines_processed,
        'lines_skipped', v_lines_skipped,
        'lines_covered_by_stock', v_lines_covered_by_stock,
        'purchase_orders_created', v_purchase_orders_created,
        'suppliers_skipped_idempotent', v_suppliers_skipped_idempotent,
        'resolved_quote_id', v_resolved_quote_id
      )
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'contract', NEW.id, 'purchase_order', NULL,
        'trigger:contract_po_request', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_proposal_supplier_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trigger_mode         text;
  v_resolved_quote_id    uuid;
  v_actor                uuid;
  v_line                 record;
  v_supplier_id          uuid;
  v_purchase_price       numeric;
  v_supplier_map         jsonb := '{}'::jsonb;
  v_supplier_key         text;
  v_supplier_lines       jsonb;
  v_po_id                uuid;
  v_po_item              jsonb;
  v_qty_int              integer;
  v_unit_price           numeric;
  v_line_total           numeric;
  v_po_total             numeric;
  v_lines_processed      integer := 0;
  v_lines_skipped        integer := 0;
  -- NOVO (20261204203500): unidade da ligação item_suppliers escolhida.
  v_link_uom             uuid;
  v_link_sku             text;
  v_link_units           integer;
  v_base_qty             numeric;
  v_purchase_orders_created integer := 0;
  v_suppliers_skipped_idempotent integer := 0;
BEGIN
  IF NEW.status IS DISTINCT FROM 'accepted' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- proposals.organization_id is NULLABLE — purchase_orders.organization_id
  -- is NOT NULL, never guess.
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block accept_proposal_atomic's UPDATE.
  BEGIN
    -- ── 1. Organization inventory settings (default when the org has no row
    --      configured yet: 'contract_signed'). ───────────────────────────────
    SELECT stock_deduction_trigger INTO v_trigger_mode
    FROM public.organization_inventory_settings
    WHERE organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      v_trigger_mode := 'contract_signed';
    END IF;

    -- ── 2. This organization acts on contract signature instead (the
    --      default) — handled by fn_contract_supplier_request(). Do nothing
    --      here (inverse guard). ─────────────────────────────────────────────
    IF v_trigger_mode <> 'proposal_accepted' THEN
      RETURN NEW;
    END IF;

    -- ── 3. Resolve the quote — same fallback as fn_proposal_stock_deduction,
    --      applied directly (proposals has no quote_id column). ────────────
    SELECT id INTO v_resolved_quote_id
    FROM public.quotes
    WHERE proposal_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_resolved_quote_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- ── 4. Resolve the actor once for the whole proposal — same fallback
    --      pattern as rpc_register_sale_stock_movement/fn_contract_supplier_
    --      request: current_business_user_id() first, else the quote's own
    --      creator (NOT NULL), covering acceptance via the public link
    --      (accept-proposal edge function, no staff session present). ───────
    v_actor := public.current_business_user_id();
    IF v_actor IS NULL THEN
      SELECT q.created_by INTO v_actor
      FROM public.quotes q
      WHERE q.id = v_resolved_quote_id;
    END IF;

    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Não foi possível determinar o autor do pedido a fornecedor (proposta %, quote %)', NEW.id, v_resolved_quote_id;
    END IF;

    -- ── 5. Walk every quote line whose product does NOT manage stock (sold
    --      to order). Bundle-expanded lines are NOT excluded. Validate
    --      quantity (null/not positive/fractional skipped with a warning,
    --      never aborts the rest); resolve the preferred supplier per
    --      product; purchase_price falls back to product_prices (price_type
    --      = purchase) when item_suppliers.purchase_price is NULL, then to 0
    --      — same fallback fn_contract_supplier_request gained in
    --      20261115090000, incorporated here from the start. Accumulate
    --      eligible lines grouped by resolved supplier into a jsonb map. ────
    FOR v_line IN
      SELECT ql.id AS quote_line_id, ql.product_id, ql.qt,
             p.name AS product_name, p.sku AS product_sku,
             COALESCE(ql.units_per_uom, 1) AS units_per_uom  -- NOVO (20261204203500)
      FROM public.quote_lines ql
      JOIN public.products p ON p.id = ql.product_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.product_id IS NOT NULL
        AND p.manages_stock = false
    LOOP
      IF v_line.qt IS NULL OR v_line.qt <= 0 THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'proposal', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:proposal_po_request_line_skipped', 'warning',
          jsonb_build_object('reason', 'quantity_null_or_not_positive', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- NOVO (20261204203500): quantidade vendida em unidades de stock.
      v_base_qty := v_line.qt * v_line.units_per_uom;

      IF v_base_qty <> floor(v_base_qty) THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'proposal', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:proposal_po_request_line_skipped', 'warning',
          jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      SELECT supplier_id, purchase_price, uom_id, supplier_sku
        INTO v_supplier_id, v_purchase_price, v_link_uom, v_link_sku
      FROM public.item_suppliers
      WHERE product_id = v_line.product_id
        AND is_preferred = true
        AND deleted_at IS NULL
      LIMIT 1;

      IF v_supplier_id IS NULL THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'proposal', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:proposal_po_request_no_supplier', 'warning',
          jsonb_build_object('reason', 'no_preferred_supplier', 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- NOVO (20261204203500): a ligação pode vender em embalagem (ex. PK100).
      -- Unidade incompatível => a linha é saltada com aviso, nunca aborta as outras.
      BEGIN
        v_link_units := public.fn_uom_units_per(v_link_uom, v_line.product_id);
      EXCEPTION WHEN OTHERS THEN
        v_link_units := NULL;
      END;

      IF v_link_units IS NULL OR v_link_units < 1 THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'proposal', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:proposal_po_request_line_skipped', 'warning',
          jsonb_build_object('reason', 'incompatible_supplier_uom', 'product_id', v_line.product_id, 'uom_id', v_link_uom)
        );
        CONTINUE;
      END IF;

      IF v_purchase_price IS NULL THEN
        SELECT price INTO v_purchase_price
        FROM public.product_prices
        WHERE product_id = v_line.product_id AND price_type = 'purchase'
        ORDER BY valid_from DESC NULLS LAST
        LIMIT 1;
        -- NOVO (20261204203500): o preço do produto é por unidade de stock;
        -- a linha da encomenda é na unidade da ligação.
        IF v_link_units <> 1 THEN
          v_purchase_price := v_purchase_price * v_link_units;
        END IF;
      END IF;

      -- NOVO (20261204203500): unidades vendidas -> unidade da ligação,
      -- arredondando para cima (12 un com ligação PK100 => 1 PK100).
      v_qty_int := ceil(v_base_qty / v_link_units)::integer;
      v_lines_processed := v_lines_processed + 1;

      v_supplier_key := v_supplier_id::text;
      v_supplier_map := v_supplier_map || jsonb_build_object(
        v_supplier_key,
        COALESCE(v_supplier_map -> v_supplier_key, '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'quote_line_id',  v_line.quote_line_id,
            'product_id',     v_line.product_id,
            'quantity',       v_qty_int,
            'product_name',   v_line.product_name,
            'product_sku',    v_line.product_sku,
            'unit_price',     v_purchase_price,
            'uom_id',         v_link_uom,
            'units_per_uom',  v_link_units,
            'supplier_sku',   v_link_sku
          )
        )
      );
    END LOOP;

    -- ── 6. One purchase_orders per distinct resolved supplier — idempotent
    --      per (source_type='proposal', source_id=NEW.id, supplier_id). ────
    FOR v_supplier_key IN SELECT jsonb_object_keys(v_supplier_map)
    LOOP
      v_supplier_id    := v_supplier_key::uuid;
      v_supplier_lines := v_supplier_map -> v_supplier_key;

      IF EXISTS (
        SELECT 1 FROM public.purchase_orders
        WHERE source_type = 'proposal' AND source_id = NEW.id AND supplier_id = v_supplier_id
      ) THEN
        v_suppliers_skipped_idempotent := v_suppliers_skipped_idempotent + 1;
        CONTINUE;
      END IF;

      -- Per-supplier guard: a failure creating one supplier's PO must never
      -- abort the remaining suppliers of the same proposal.
      BEGIN
        INSERT INTO public.purchase_orders (
          organization_id, supplier_id, order_date, status,
          source_type, source_id, notes, created_by
        ) VALUES (
          NEW.organization_id, v_supplier_id, now()::date, 'pending',
          'proposal', NEW.id,
          format('Gerada automaticamente a partir da proposta %s', COALESCE(NEW.proposal_number, NEW.id::text)),
          v_actor
        )
        RETURNING id INTO v_po_id;

        v_po_total := 0;

        FOR v_po_item IN SELECT * FROM jsonb_array_elements(v_supplier_lines)
        LOOP
          v_unit_price := COALESCE((v_po_item ->> 'unit_price')::numeric, 0);
          v_line_total := v_unit_price * (v_po_item ->> 'quantity')::numeric;
          v_po_total   := v_po_total + v_line_total;

          INSERT INTO public.purchase_order_items (
            purchase_order_id, item_type, product_id, description, sku,
            quantity, unit_price, total_price,
            uom_id, supplier_sku  -- NOVO (20261204203500); units_per_uom pelo gatilho
          ) VALUES (
            v_po_id, 'product', (v_po_item ->> 'product_id')::uuid,
            v_po_item ->> 'product_name', v_po_item ->> 'product_sku',
            (v_po_item ->> 'quantity')::numeric, v_unit_price, v_line_total,
            nullif(v_po_item ->> 'uom_id', '')::uuid, nullif(v_po_item ->> 'supplier_sku', '')
          );
        END LOOP;

        UPDATE public.purchase_orders SET total_value = v_po_total WHERE id = v_po_id;

        v_purchase_orders_created := v_purchase_orders_created + 1;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'proposal', NEW.id, 'purchase_order', NULL,
          'trigger:proposal_po_request_supplier_error', 'error', SQLERRM,
          jsonb_build_object('supplier_id', v_supplier_id)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'proposal', NEW.id, 'purchase_order', NULL,
      'trigger:proposal_po_request', 'success',
      jsonb_build_object(
        'lines_processed', v_lines_processed,
        'lines_skipped', v_lines_skipped,
        'purchase_orders_created', v_purchase_orders_created,
        'suppliers_skipped_idempotent', v_suppliers_skipped_idempotent,
        'resolved_quote_id', v_resolved_quote_id
      )
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'proposal', NEW.id, 'purchase_order', NULL,
        'trigger:proposal_po_request', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_client_order_document(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org               uuid;
  v_status            text;
  v_contract_number   text;
  v_client_name       text;
  v_signature_date    timestamptz;
  v_total_value       numeric;
  v_resolved_quote_id uuid;
  v_lines             jsonb := '[]'::jsonb;
  v_line              record;
  v_line_status       text;
  v_stock_movement_id uuid;
  v_po_id             uuid;
  v_po_order_number   text;
  v_available_stock   numeric;
  v_available_wh      jsonb;
  -- NOVO (20261203050000): diagnóstico congelado do orçamento resolvido.
  v_diagnostic        jsonb := '[]'::jsonb;
BEGIN
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    cc.organization_id, cc.status, cc.contract_number, cc.signature_date,
    cc.total_value, e.display_name,
    COALESCE(
      cc.quote_id,
      (
        SELECT q2.id
        FROM public.quotes q2
        WHERE q2.proposal_id = cc.proposal_id
        ORDER BY q2.created_at DESC
        LIMIT 1
      )
    )
  INTO v_org, v_status, v_contract_number, v_signature_date, v_total_value,
       v_client_name, v_resolved_quote_id
  FROM public.client_contracts cc
  LEFT JOIN public.anew_entities e ON e.id = cc.entity_id
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.view')
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver esta encomenda de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_resolved_quote_id IS NOT NULL THEN
    FOR v_line IN
      SELECT
        ql.id AS quote_line_id, p.id AS product_id, NULL::uuid AS service_id,
        -- NOVO (20261204203500): quantity passa a vir em unidades de stock
        -- (qt × fator) — é o que o armazém move e o que
        -- rpc_confirm_client_order_stock_exit recebe. Fator 1 => igual.
        (ql.qt * COALESCE(ql.units_per_uom, 1)) AS qt,
        p.name AS product_name, p.sku AS product_sku,
        NULL::text AS service_name, NULL::text AS service_sku,
        ql.qt AS line_quantity, ql.uom_id AS line_uom_id, COALESCE(ql.units_per_uom, 1) AS units_per_uom, ql.unidade AS line_unidade
      FROM public.quote_lines ql
      JOIN public.products p ON p.id = ql.product_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.product_id IS NOT NULL

      UNION ALL

      SELECT
        ql.id AS quote_line_id,
        p.id AS product_id, NULL::uuid AS service_id,
        (COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1)) AS qt,
        p.name AS product_name, p.sku AS product_sku,
        NULL::text AS service_name, NULL::text AS service_sku,
        (COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1)) AS line_quantity,
        NULL::uuid AS line_uom_id, 1 AS units_per_uom, NULL::text AS line_unidade
      FROM public.quote_lines ql
      JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
        ON true
      JOIN public.products p ON p.id = (comp.value ->> 'source_id')::uuid
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.bundle_id IS NOT NULL
        AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
        AND comp.value ->> 'type' = 'product'
        AND comp.value ->> 'source_id' IS NOT NULL

      UNION ALL

      -- NOVO (20261130190000): linhas de serviço puro — sem stock/PO a
      -- rastrear; ver bloco IF v_line.product_id IS NULL abaixo.
      SELECT
        ql.id AS quote_line_id, NULL::uuid AS product_id, s.id AS service_id, ql.qt AS qt,
        NULL::text AS product_name, NULL::text AS product_sku,
        s.name AS service_name, s.sku AS service_sku,
        ql.qt AS line_quantity, ql.uom_id AS line_uom_id, COALESCE(ql.units_per_uom, 1) AS units_per_uom, ql.unidade AS line_unidade
      FROM public.quote_lines ql
      JOIN public.services s ON s.id = ql.service_id
      WHERE ql.quote_id = v_resolved_quote_id
        AND ql.service_id IS NOT NULL
        AND ql.product_id IS NULL

      ORDER BY 1
    LOOP
      v_line_status       := NULL;
      v_stock_movement_id := NULL;
      v_po_id             := NULL;
      v_po_order_number   := NULL;
      v_available_wh      := NULL;

      IF v_line.product_id IS NULL THEN
        -- Linha de serviço: nunca há stock físico nem PO de fornecedor
        -- (fn_contract_stock_deduction / fn_contract_supplier_request já
        -- ignoram estas linhas, de propósito). Estado fixo e distinto dos
        -- estados de produto.
        v_line_status := 'servico';
      ELSE
        -- (a) automático (venda + reference_id) OU (b) saída manual ligada
        -- via "Encomenda Cliente de origem" (saida, sem reference_id).
        SELECT sm.id INTO v_stock_movement_id
        FROM public.stock_movements sm
        WHERE sm.sale_source_type = 'contract'
          AND sm.sale_source_id = p_contract_id
          AND sm.product_id = v_line.product_id
          AND (
            (sm.movement_type = 'venda' AND sm.reference_id = v_line.quote_line_id)
            OR sm.movement_type = 'saida'
          )
        ORDER BY sm.created_at DESC
        LIMIT 1;

        IF v_stock_movement_id IS NOT NULL THEN
          v_line_status := 'servido_por_stock';
        ELSE
          SELECT po.id, po.order_number INTO v_po_id, v_po_order_number
          FROM public.purchase_orders po
          JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
          WHERE po.source_type = 'contract'
            AND po.source_id = p_contract_id
            AND poi.product_id = v_line.product_id
            AND (po.status = 'received' OR poi.received_quantity >= poi.quantity)
          LIMIT 1;

          IF v_po_id IS NOT NULL THEN
            v_line_status := 'recebido';
          ELSE
            SELECT po.id, po.order_number INTO v_po_id, v_po_order_number
            FROM public.purchase_orders po
            JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
            WHERE po.source_type = 'contract'
              AND po.source_id = p_contract_id
              AND poi.product_id = v_line.product_id
              AND po.status IN ('pending', 'ordered', 'partially_received')
              AND poi.received_quantity < poi.quantity
            LIMIT 1;

            IF v_po_id IS NOT NULL THEN
              v_line_status := 'a_aguardar_encomenda';
            ELSE
              -- NOVO (20261120190000): antes de aceitar "sem fornecedor", ver
              -- se já há stock real suficiente (o produto pode ter fornecedor
              -- preferencial configurado — fn_contract_supplier_request só não
              -- gerou PO porque não era preciso, 20261120160000).
              SELECT COALESCE(SUM(s.quantity), 0) INTO v_available_stock
              FROM public.stocks s
              JOIN public.warehouses w ON w.id = s.warehouse_id
              WHERE s.product_id = v_line.product_id
                AND s.deleted_at IS NULL
                AND w.organization_id = v_org
                AND w.deleted_at IS NULL;

              IF v_available_stock >= v_line.qt THEN
                v_line_status := 'stock_disponivel_confirmar';

                -- NOVO (20261130070000): lista de armazéns ativos da
                -- organização com stock > 0 deste produto, para o
                -- profissional escolher de onde confirmar a saída. Só se
                -- calcula para linhas neste estado — as restantes não
                -- precisam desta informação.
                SELECT COALESCE(
                  jsonb_agg(
                    jsonb_build_object(
                      'warehouse_id',   w.id,
                      'warehouse_name', w.name,
                      'quantity',       s.quantity
                    )
                    ORDER BY s.quantity DESC
                  ),
                  '[]'::jsonb
                ) INTO v_available_wh
                FROM public.stocks s
                JOIN public.warehouses w ON w.id = s.warehouse_id
                WHERE s.product_id = v_line.product_id
                  AND s.deleted_at IS NULL
                  AND s.quantity > 0
                  AND w.organization_id = v_org
                  AND w.deleted_at IS NULL;
              ELSE
                v_line_status := 'sem_fornecedor';
              END IF;
            END IF;
          END IF;
        END IF;
      END IF;

      v_lines := v_lines || jsonb_build_object(
        'quote_line_id',         v_line.quote_line_id,
        'item_type',             CASE WHEN v_line.product_id IS NOT NULL THEN 'product' ELSE 'service' END,
        'product_id',            v_line.product_id,
        'product_name',          v_line.product_name,
        'product_sku',           v_line.product_sku,
        'service_id',            v_line.service_id,
        'service_name',          v_line.service_name,
        'service_sku',           v_line.service_sku,
        'quantity',              v_line.qt,
        'line_status',           v_line_status,
        'stock_movement_id',     v_stock_movement_id,
        'purchase_order_id',     v_po_id,
        'purchase_order_number', v_po_order_number,
        'available_warehouses',  v_available_wh,
        -- NOVO (20261204203500): quantidade/unidade tal como na linha vendida.
        'line_quantity',         v_line.line_quantity,
        'uom_id',                v_line.line_uom_id,
        'unidade',               v_line.line_unidade,
        'units_per_uom',         v_line.units_per_uom
      );
    END LOOP;

    -- NOVO (20261203050000): diagnóstico congelado do MESMO orçamento já resolvido
    -- acima (inclui o fallback via proposal_id) — não se refaz a resolução.
    -- Informativo para o armazém: não soma ao total nem gera linhas.
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'deal_need_id',               qds.deal_need_id,
          'need_title',                 qds.need_title,
          'diag_area_m2',               qds.diag_area_m2,
          'diag_demolir_descricao',     qds.diag_demolir_descricao,
          'diag_demolir_m2',            qds.diag_demolir_m2,
          'diag_proteger_descricao',    qds.diag_proteger_descricao,
          'diag_intervencao_tipo',      qds.diag_intervencao_tipo,
          'diag_intervencao_descricao', qds.diag_intervencao_descricao,
          'materials',                  qds.materials
        )
        ORDER BY qds.created_at, qds.need_title
      ),
      '[]'::jsonb
    ) INTO v_diagnostic
    FROM public.quote_diagnostic_snapshot qds
    WHERE qds.quote_id = v_resolved_quote_id;
  END IF;

  RETURN jsonb_build_object(
    'contract_id',     p_contract_id,
    'contract_number', v_contract_number,
    'client_name',     v_client_name,
    'signature_date',  v_signature_date,
    'total_value',     v_total_value,
    'status',          v_status,
    'lines',           v_lines,
    -- NOVO (20261203050000): chave acrescentada; nenhuma das anteriores mudou.
    'diagnostic',      COALESCE(v_diagnostic, '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_list_client_order_documents(p_organization_id uuid, p_search text DEFAULT NULL::text, p_status_filter text DEFAULT NULL::text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS TABLE(contract_id uuid, contract_number text, client_name text, signature_date timestamp with time zone, total_lines integer, lines_from_stock integer, lines_awaiting_order integer, lines_received integer, lines_no_supplier integer, lines_service integer, overall_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_signed_aliases text[] := ARRAY['signed', 'assinado'];
  v_limit          int := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_offset         int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.view')
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver encomendas de clientes desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH resolved_contracts AS (
    SELECT
      cc.id                AS rc_contract_id,
      cc.contract_number   AS rc_contract_number,
      cc.signature_date    AS rc_signature_date,
      e.display_name       AS rc_client_name,
      COALESCE(
        cc.quote_id,
        (
          SELECT q2.id
          FROM public.quotes q2
          WHERE q2.proposal_id = cc.proposal_id
          ORDER BY q2.created_at DESC
          LIMIT 1
        )
      )                     AS rc_resolved_quote_id
    FROM public.client_contracts cc
    LEFT JOIN public.anew_entities e ON e.id = cc.entity_id
    WHERE cc.organization_id = p_organization_id
      AND cc.deleted_at IS NULL
      AND cc.status = ANY (v_signed_aliases)
  ),
  line_items AS (
    SELECT
      rc.rc_contract_id     AS li_contract_id,
      rc.rc_contract_number AS li_contract_number,
      rc.rc_client_name     AS li_client_name,
      rc.rc_signature_date  AS li_signature_date,
      ql.id                 AS li_quote_line_id,
      ql.product_id         AS li_product_id,
      (ql.qt * COALESCE(ql.units_per_uom, 1)) AS li_qty  -- NOVO (20261204203500): unidades de stock
    FROM resolved_contracts rc
    JOIN public.quote_lines ql ON ql.quote_id = rc.rc_resolved_quote_id
    WHERE rc.rc_resolved_quote_id IS NOT NULL
      AND ql.product_id IS NOT NULL

    UNION ALL

    SELECT
      rc.rc_contract_id                AS li_contract_id,
      rc.rc_contract_number            AS li_contract_number,
      rc.rc_client_name                AS li_client_name,
      rc.rc_signature_date             AS li_signature_date,
      ql.id                            AS li_quote_line_id,
      (comp.value ->> 'source_id')::uuid AS li_product_id,
      (COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1)) AS li_qty
    FROM resolved_contracts rc
    JOIN public.quote_lines ql
      ON ql.quote_id = rc.rc_resolved_quote_id
     AND ql.bundle_id IS NOT NULL
     AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
    CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
    WHERE rc.rc_resolved_quote_id IS NOT NULL
      AND comp.value ->> 'type' = 'product'
      AND comp.value ->> 'source_id' IS NOT NULL

    UNION ALL

    -- NOVO (20261130190000): linhas de serviço puro (sem produto associado).
    -- li_product_id fica NULL de propósito — não há stock_movements nem
    -- purchase_orders para casar (serviços não passam por armazém nem por
    -- pedido a fornecedor nestes fluxos); o CASE em `lines` reconhece
    -- li_product_id IS NULL como marcador de linha de serviço, antes de
    -- tentar qualquer verificação de stock/PO.
    SELECT
      rc.rc_contract_id     AS li_contract_id,
      rc.rc_contract_number AS li_contract_number,
      rc.rc_client_name     AS li_client_name,
      rc.rc_signature_date  AS li_signature_date,
      ql.id                 AS li_quote_line_id,
      NULL::uuid            AS li_product_id,
      ql.qt                 AS li_qty
    FROM resolved_contracts rc
    JOIN public.quote_lines ql ON ql.quote_id = rc.rc_resolved_quote_id
    WHERE rc.rc_resolved_quote_id IS NOT NULL
      AND ql.service_id IS NOT NULL
      AND ql.product_id IS NULL
  ),
  lines AS (
    SELECT
      li.li_contract_id     AS l_contract_id,
      li.li_contract_number AS l_contract_number,
      li.li_client_name     AS l_client_name,
      li.li_signature_date  AS l_signature_date,
      li.li_quote_line_id   AS l_quote_line_id,
      CASE
        -- NOVO (20261130190000): linha de serviço puro — nunca teve
        -- product_id, nunca vai ter stock_movements/purchase_orders.
        WHEN li.li_product_id IS NULL THEN 'servico'
        -- (a) automático (venda + reference_id) OU (b) saída manual ligada
        -- via "Encomenda Cliente de origem" (saida, sem reference_id — ver
        -- cabeçalho desta migration e 20261115180000).
        WHEN EXISTS (
          SELECT 1
          FROM public.stock_movements sm
          WHERE sm.sale_source_type = 'contract'
            AND sm.sale_source_id = li.li_contract_id
            AND sm.product_id = li.li_product_id
            AND (
              (sm.movement_type = 'venda' AND sm.reference_id = li.li_quote_line_id)
              OR sm.movement_type = 'saida'
            )
        ) THEN 'stock'
        WHEN EXISTS (
          SELECT 1
          FROM public.purchase_orders po
          JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
          WHERE po.source_type = 'contract'
            AND po.source_id = li.li_contract_id
            AND poi.product_id = li.li_product_id
            AND (po.status = 'received' OR poi.received_quantity >= poi.quantity)
        ) THEN 'received'
        WHEN EXISTS (
          SELECT 1
          FROM public.purchase_orders po
          JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
          WHERE po.source_type = 'contract'
            AND po.source_id = li.li_contract_id
            AND poi.product_id = li.li_product_id
            AND po.status IN ('pending', 'ordered', 'partially_received')
            AND poi.received_quantity < poi.quantity
        ) THEN 'awaiting'
        -- NOVO (20261120190000): coberto por stock, sem PO gerada de
        -- propósito (20261120160000) — conta como "a aguardar encomenda"
        -- no estado geral do contrato (decisão do utilizador: não introduz
        -- mais uma categoria no filtro de estados da listagem). O rótulo
        -- distinto ("Stock disponível — confirmar saída") só é mostrado no
        -- detalhe (rpc_get_client_order_document).
        WHEN (
          SELECT COALESCE(SUM(s.quantity), 0)
          FROM public.stocks s
          JOIN public.warehouses w ON w.id = s.warehouse_id
          WHERE s.product_id = li.li_product_id
            AND s.deleted_at IS NULL
            AND w.organization_id = p_organization_id
            AND w.deleted_at IS NULL
        ) >= li.li_qty THEN 'awaiting'
        ELSE 'no_supplier'
      END                                     AS l_line_status
    FROM line_items li
  ),
  aggregated AS (
    SELECT
      l.l_contract_id                                             AS a_contract_id,
      l.l_contract_number                                         AS a_contract_number,
      l.l_client_name                                              AS a_client_name,
      l.l_signature_date                                          AS a_signature_date,
      count(*)::int                                                AS a_total_lines,
      count(*) FILTER (WHERE l.l_line_status = 'stock')::int       AS a_lines_from_stock,
      count(*) FILTER (WHERE l.l_line_status = 'awaiting')::int    AS a_lines_awaiting_order,
      count(*) FILTER (WHERE l.l_line_status = 'received')::int    AS a_lines_received,
      count(*) FILTER (WHERE l.l_line_status = 'no_supplier')::int AS a_lines_no_supplier,
      count(*) FILTER (WHERE l.l_line_status = 'servico')::int     AS a_lines_service
    FROM lines l
    GROUP BY l.l_contract_id, l.l_contract_number, l.l_client_name, l.l_signature_date
  ),
  no_lines AS (
    SELECT
      rc.rc_contract_id     AS a_contract_id,
      rc.rc_contract_number AS a_contract_number,
      rc.rc_client_name     AS a_client_name,
      rc.rc_signature_date  AS a_signature_date,
      0 AS a_total_lines, 0 AS a_lines_from_stock, 0 AS a_lines_awaiting_order,
      0 AS a_lines_received, 0 AS a_lines_no_supplier, 0 AS a_lines_service
    FROM resolved_contracts rc
    WHERE NOT EXISTS (
      SELECT 1 FROM aggregated a WHERE a.a_contract_id = rc.rc_contract_id
    )
  ),
  combined AS (
    SELECT * FROM aggregated
    UNION ALL
    SELECT * FROM no_lines
  ),
  final AS (
    SELECT
      c.a_contract_id, c.a_contract_number, c.a_client_name, c.a_signature_date,
      c.a_total_lines, c.a_lines_from_stock, c.a_lines_awaiting_order,
      c.a_lines_received, c.a_lines_no_supplier, c.a_lines_service,
      CASE
        WHEN c.a_total_lines = 0 THEN 'totalmente_servido'
        WHEN c.a_lines_awaiting_order = 0 AND c.a_lines_no_supplier = 0 THEN 'totalmente_servido'
        WHEN (c.a_lines_from_stock + c.a_lines_received) = 0
             AND c.a_lines_no_supplier = 0
             AND c.a_lines_awaiting_order > 0 THEN 'a_aguardar_encomenda'
        WHEN (c.a_lines_from_stock + c.a_lines_received) = 0
             AND c.a_lines_awaiting_order = 0
             AND c.a_lines_no_supplier > 0 THEN 'sem_fornecedor'
        ELSE 'parcialmente_pendente'
      END AS a_overall_status
    FROM combined c
  )
  SELECT
    f.a_contract_id          AS contract_id,
    f.a_contract_number      AS contract_number,
    f.a_client_name          AS client_name,
    f.a_signature_date       AS signature_date,
    f.a_total_lines          AS total_lines,
    f.a_lines_from_stock     AS lines_from_stock,
    f.a_lines_awaiting_order AS lines_awaiting_order,
    f.a_lines_received       AS lines_received,
    f.a_lines_no_supplier    AS lines_no_supplier,
    f.a_lines_service        AS lines_service,
    f.a_overall_status       AS overall_status
  FROM final f
  WHERE
    (
      p_search IS NULL OR p_search = ''
      OR strpos(lower(COALESCE(f.a_contract_number, '')), lower(p_search)) > 0
      OR strpos(lower(COALESCE(f.a_client_name, '')), lower(p_search)) > 0
    )
    AND (
      p_status_filter IS NULL OR p_status_filter = 'all'
      OR f.a_overall_status = p_status_filter
    )
    AND (
      p_date_from IS NULL OR f.a_signature_date::date >= p_date_from
    )
    AND (
      p_date_to IS NULL OR f.a_signature_date::date <= p_date_to
    )
  ORDER BY f.a_signature_date DESC NULLS LAST, f.a_contract_number DESC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;


-- ============================================================================
-- REVERSÃO (manual): repor as definições anteriores, copiadas abaixo tal como
-- estavam vivas em 23/09/2026 (pg_get_functiondef). Retirar o prefixo "-- ".
-- Reverter ANTES de 20261204202500 (as versões anteriores não usam as colunas novas, podem correr com elas presentes).
-- ============================================================================
-- ---- rpc_receive_purchase_order_lines (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order_lines(p_purchase_order_id uuid, p_warehouse_id uuid, p_lines jsonb, p_actual_delivery_date date DEFAULT NULL::date)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor            uuid;
--   v_po               public.purchase_orders%ROWTYPE;
--   v_line_input       jsonb;
--   v_line_id          uuid;
--   v_qty_requested    numeric;
--   v_qty_int          integer;
--   v_item             record;
--   v_item_supplier_id uuid;
--   v_remaining        numeric;
--   v_balance          integer;
--   v_received_total   numeric;
--   v_lines_out        jsonb := '[]'::jsonb;
--   v_sum_quantity     numeric;
--   v_sum_received     numeric;
--   v_new_status       text;
--   v_skip_stock       boolean;
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   SELECT * INTO v_po
--   FROM public.purchase_orders
--   WHERE id = p_purchase_order_id AND deleted_at IS NULL
--   FOR UPDATE;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF v_po.status = 'received' THEN
--     RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
--   END IF;
--   IF v_po.status = 'cancelled' THEN
--     RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit')
--      OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
--      OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
--     RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   IF NOT EXISTS (
--     SELECT 1 FROM public.warehouses
--     WHERE id = p_warehouse_id AND organization_id = v_po.organization_id AND deleted_at IS NULL
--   ) THEN
--     RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
--     RAISE EXCEPTION 'Linhas de receção não podem estar vazias' USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- Ligada a uma Encomenda Cliente = já tem destino certo, não entra no
--   -- stock geral (20261115210000).
--   v_skip_stock := (v_po.source_type = 'contract');
--
--   FOR v_line_input IN SELECT * FROM jsonb_array_elements(p_lines)
--   LOOP
--     v_line_id       := nullif(v_line_input ->> 'purchase_order_item_id', '')::uuid;
--     v_qty_requested := nullif(v_line_input ->> 'quantity', '')::numeric;
--
--     IF v_line_id IS NULL THEN
--       RAISE EXCEPTION 'purchase_order_item_id em falta numa linha de receção' USING ERRCODE = 'check_violation';
--     END IF;
--
--     SELECT id, product_id, item_type, quantity, unit_price, received_quantity, description
--     INTO v_item
--     FROM public.purchase_order_items
--     WHERE id = v_line_id AND purchase_order_id = p_purchase_order_id
--     FOR UPDATE;
--
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', v_line_id
--         USING ERRCODE = 'no_data_found';
--     END IF;
--
--     IF v_item.item_type <> 'product' THEN
--       RAISE EXCEPTION 'A linha "%" não é um produto — serviços não têm stock físico e não podem ser recebidos', v_item.description
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     IF v_qty_requested IS NULL OR v_qty_requested <= 0 THEN
--       RAISE EXCEPTION 'A quantidade a receber na linha "%" tem de ser positiva', v_item.description
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     IF v_qty_requested <> floor(v_qty_requested) THEN
--       RAISE EXCEPTION 'A linha "%" tem uma quantidade não inteira (%) — o stock só regista unidades inteiras. Corrige a linha antes de receber.', v_item.description, v_qty_requested
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     v_remaining := v_item.quantity - v_item.received_quantity;
--     IF v_qty_requested > v_remaining THEN
--       RAISE EXCEPTION 'A quantidade a receber (%) na linha "%" excede o saldo por receber desta linha (% de % por receber; já recebido % de %)',
--         v_qty_requested, v_item.description, v_remaining, v_item.quantity, v_item.received_quantity, v_item.quantity
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     v_qty_int := v_qty_requested::integer;
--     v_balance := NULL;
--
--     IF v_skip_stock THEN
--       -- Sem movimento de entrada — a encomenda já tem destino certo (cliente
--       -- final), não passa pelo stock geral. balance_after fica NULL no
--       -- output (informativo, não há stock_movements gerado para esta linha).
--       NULL;
--     ELSE
--       SELECT id INTO v_item_supplier_id
--       FROM public.item_suppliers
--       WHERE product_id = v_item.product_id
--         AND supplier_id = v_po.supplier_id
--         AND deleted_at IS NULL
--       ORDER BY is_preferred DESC
--       LIMIT 1;
--
--       INSERT INTO public.stock_movements (
--         organization_id, product_id, warehouse_id, movement_type, quantity,
--         document_number, document_type, item_supplier_id, unit_cost_at_time,
--         reference_id, notes, created_by
--       ) VALUES (
--         v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_qty_int,
--         v_po.order_number, 'compra', v_item_supplier_id, v_item.unit_price,
--         v_item.id,
--         format('Receção de %s: %s unidades agora nesta linha (total recebido %s de %s)',
--                v_po.order_number, v_qty_int, v_item.received_quantity + v_qty_requested, v_item.quantity),
--         v_actor
--       )
--       RETURNING balance_after INTO v_balance;
--     END IF;
--
--     UPDATE public.purchase_order_items
--     SET received_quantity = received_quantity + v_qty_requested
--     WHERE id = v_item.id
--     RETURNING received_quantity INTO v_received_total;
--
--     v_lines_out := v_lines_out || jsonb_build_object(
--       'product_id',               v_item.product_id,
--       'quantity_received_now',    v_qty_int,
--       'received_quantity_total',  v_received_total,
--       'remaining',                v_item.quantity - v_received_total,
--       'balance_after',            v_balance,
--       'stock_updated',            NOT v_skip_stock
--     );
--   END LOOP;
--
--   SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(received_quantity), 0)
--   INTO v_sum_quantity, v_sum_received
--   FROM public.purchase_order_items
--   WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';
--
--   IF v_sum_quantity > 0 AND v_sum_received >= v_sum_quantity THEN
--     v_new_status := 'received';
--   ELSIF v_sum_received > 0 THEN
--     v_new_status := 'partially_received';
--   ELSE
--     v_new_status := v_po.status;
--   END IF;
--
--   -- NOVO (20261130010000): actual_delivery_date só é gravada quando a
--   -- encomenda fica TOTALMENTE recebida — numa receção parcial ainda não há
--   -- "data de entrega" da encomenda como um todo.
--   IF v_new_status = 'received' THEN
--     UPDATE public.purchase_orders
--     SET status = v_new_status,
--         updated_at = now(),
--         actual_delivery_date = COALESCE(p_actual_delivery_date, current_date)
--     WHERE id = p_purchase_order_id;
--   ELSE
--     UPDATE public.purchase_orders
--     SET status = v_new_status, updated_at = now()
--     WHERE id = p_purchase_order_id;
--   END IF;
--
--   RETURN jsonb_build_object(
--     'order_number',   v_po.order_number,
--     'warehouse_id',   p_warehouse_id,
--     'status',         v_new_status,
--     'lines',          v_lines_out,
--     'stock_skipped',  v_skip_stock
--   );
-- END;
-- $function$;
-- ---- fn_contract_stock_deduction (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.fn_contract_stock_deduction()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_signed_aliases       text[] := ARRAY['signed', 'assinado'];
--   v_trigger_mode         text;
--   v_default_warehouse_id uuid;
--   v_resolved_warehouse   uuid;
--   v_active_warehouse_cnt integer;
--   v_resolved_quote_id    uuid;
--   v_line                 record;
--   v_qty_int              integer;
--   v_result               jsonb;
--   v_lines_processed      integer := 0;
--   v_lines_skipped        integer := 0;
-- BEGIN
--   -- Only ever react to a transition into the signed stage — exact same gate
--   -- as fn_contract_signed_convert_to_client() (20261113190000), replicated
--   -- here on purpose (not a new style).
--   IF NEW.status IS NULL OR NOT (NEW.status = ANY (v_signed_aliases)) THEN
--     RETURN NEW;
--   END IF;
--   IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
--     RETURN NEW;
--   END IF;
--
--   -- Everything below is best-effort: any failure is caught and logged, never
--   -- propagated, so this can never block the write to client_contracts.
--   BEGIN
--     -- ── 1. Organization inventory settings (default when the org has no row
--     --      configured yet: 'contract_signed', no default warehouse). ───────
--     SELECT stock_deduction_trigger, default_warehouse_id
--     INTO v_trigger_mode, v_default_warehouse_id
--     FROM public.organization_inventory_settings
--     WHERE organization_id = NEW.organization_id;
--
--     IF NOT FOUND THEN
--       v_trigger_mode := 'contract_signed';
--       v_default_warehouse_id := NULL;
--     END IF;
--
--     -- ── 2. This organization chose "deduct on proposal acceptance" instead
--     --      — that is Fase 5.0C, not implemented yet. Do nothing here. ──────
--     IF v_trigger_mode <> 'contract_signed' THEN
--       RETURN NEW;
--     END IF;
--
--     -- ── 3. Resolve the quote (NOVO 20261115080000): prefer the direct FK,
--     --      fall back to the proposal's own quote when execute-workflow left
--     --      quote_id NULL (see migration header — confirmed on 84% of real
--     --      contracts with an actual quote behind them). No quote resolvable
--     --      at all → nothing to deduct. ──────────────────────────────────────
--     v_resolved_quote_id := NEW.quote_id;
--     IF v_resolved_quote_id IS NULL AND NEW.proposal_id IS NOT NULL THEN
--       SELECT id INTO v_resolved_quote_id
--       FROM public.quotes
--       WHERE proposal_id = NEW.proposal_id
--       ORDER BY created_at DESC
--       LIMIT 1;
--     END IF;
--
--     IF v_resolved_quote_id IS NULL THEN
--       RETURN NEW;
--     END IF;
--
--     -- ── 4. Resolve the warehouse: settings default, else exactly-one-active
--     --      -warehouse fallback, else no movement at all (never guess). ─────
--     v_resolved_warehouse := v_default_warehouse_id;
--
--     IF v_resolved_warehouse IS NULL THEN
--       SELECT count(*) INTO v_active_warehouse_cnt
--       FROM public.warehouses
--       WHERE organization_id = NEW.organization_id
--         AND deleted_at IS NULL;
--
--       IF v_active_warehouse_cnt = 1 THEN
--         SELECT id INTO v_resolved_warehouse
--         FROM public.warehouses
--         WHERE organization_id = NEW.organization_id
--           AND deleted_at IS NULL;
--       ELSE
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, execution_data
--         ) VALUES (
--           'contract', NEW.id, 'stock_movement', NULL,
--           'trigger:contract_stock_deduction_no_warehouse', 'warning',
--           jsonb_build_object(
--             'reason', 'No default_warehouse_id configured and organization does not have exactly one active warehouse',
--             'active_warehouse_count', v_active_warehouse_cnt
--           )
--         );
--         RETURN NEW;
--       END IF;
--     END IF;
--
--     -- ── 5. One sale stock movement per quote line whose product has
--     --      manages_stock=true. Bundle-expanded lines (bundle_id set) are NOT
--     --      excluded — they are already real product lines (plan decision 4:
--     --      BundleSelectionTab already expands a bundle into individual
--     --      quote_lines at quote-creation time). A line with a fractional
--     --      quantity is skipped with a warning log — it must never abort the
--     --      remaining lines of the same contract. Likewise, any other
--     --      unexpected failure on a single line (caught per-line below) never
--     --      stops the loop. ─────────────────────────────────────────────────
--     FOR v_line IN
--       SELECT ql.id, ql.product_id, ql.qt
--       FROM public.quote_lines ql
--       JOIN public.products p ON p.id = ql.product_id
--       WHERE ql.quote_id = v_resolved_quote_id
--         AND ql.product_id IS NOT NULL
--         AND p.manages_stock = true
--     LOOP
--       IF v_line.qt IS NULL OR v_line.qt <= 0 THEN
--         v_lines_skipped := v_lines_skipped + 1;
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, execution_data
--         ) VALUES (
--           'contract', NEW.id, 'quote_line', v_line.id,
--           'trigger:contract_stock_deduction_line_skipped', 'warning',
--           jsonb_build_object('reason', 'quantity_null_or_not_positive', 'qt', v_line.qt, 'product_id', v_line.product_id)
--         );
--         CONTINUE;
--       END IF;
--
--       IF v_line.qt <> floor(v_line.qt) THEN
--         v_lines_skipped := v_lines_skipped + 1;
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, execution_data
--         ) VALUES (
--           'contract', NEW.id, 'quote_line', v_line.id,
--           'trigger:contract_stock_deduction_line_skipped', 'warning',
--           jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
--         );
--         CONTINUE;
--       END IF;
--
--       v_qty_int := v_line.qt::integer;
--
--       -- Per-line guard: a failure registering one line's movement (e.g. an
--       -- unexpected RPC-level rejection) must never abort the remaining lines
--       -- of the same contract.
--       BEGIN
--         v_result := public.rpc_register_sale_stock_movement(
--           p_product_id        => v_line.product_id,
--           p_warehouse_id       => v_resolved_warehouse,
--           p_quantity           => v_qty_int,
--           p_quote_line_id      => v_line.id,
--           p_sale_source_type   => 'contract',
--           p_sale_source_id     => NEW.id,
--           p_document_number    => NEW.contract_number,
--           p_unit_cost_at_time  => NULL,
--           p_organization_id    => NEW.organization_id
--         );
--
--         v_lines_processed := v_lines_processed + 1;
--
--         -- Traceable for Fase 5.0D (user-visible alerts, not implemented
--         -- here) — nunca bloqueia nem impede o resto do fluxo.
--         IF COALESCE((v_result ->> 'was_insufficient')::boolean, false) THEN
--           INSERT INTO public.workflow_execution_log (
--             source_entity, source_record_id, target_entity, target_record_id,
--             action_type, status, execution_data
--           ) VALUES (
--             'contract', NEW.id, 'stock_movement', (v_result ->> 'movement_id')::uuid,
--             'trigger:contract_stock_deduction_insufficient', 'warning',
--             jsonb_build_object('quote_line_id', v_line.id, 'product_id', v_line.product_id, 'result', v_result)
--           );
--         END IF;
--       EXCEPTION WHEN OTHERS THEN
--         v_lines_skipped := v_lines_skipped + 1;
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, error_message, execution_data
--         ) VALUES (
--           'contract', NEW.id, 'quote_line', v_line.id,
--           'trigger:contract_stock_deduction_line_error', 'error', SQLERRM,
--           jsonb_build_object('product_id', v_line.product_id, 'qt', v_line.qt)
--         );
--       END;
--     END LOOP;
--
--     INSERT INTO public.workflow_execution_log (
--       source_entity, source_record_id, target_entity, target_record_id,
--       action_type, status, execution_data
--     ) VALUES (
--       'contract', NEW.id, 'stock_movement', NULL,
--       'trigger:contract_stock_deduction', 'success',
--       jsonb_build_object('lines_processed', v_lines_processed, 'lines_skipped', v_lines_skipped, 'warehouse_id', v_resolved_warehouse, 'resolved_quote_id', v_resolved_quote_id)
--     );
--
--   EXCEPTION WHEN OTHERS THEN
--     BEGIN
--       INSERT INTO public.workflow_execution_log (
--         source_entity, source_record_id, target_entity, target_record_id,
--         action_type, status, error_message
--       ) VALUES (
--         'contract', NEW.id, 'stock_movement', NULL,
--         'trigger:contract_stock_deduction', 'error', SQLERRM
--       );
--     EXCEPTION WHEN OTHERS THEN
--       -- Even the error-log insert must never propagate.
--       NULL;
--     END;
--   END;
--
--   RETURN NEW;
-- END;
-- $function$;
-- ---- fn_proposal_stock_deduction (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.fn_proposal_stock_deduction()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_trigger_mode         text;
--   v_default_warehouse_id uuid;
--   v_resolved_warehouse   uuid;
--   v_active_warehouse_cnt integer;
--   v_resolved_quote_id    uuid;
--   v_line                 record;
--   v_qty_int              integer;
--   v_result               jsonb;
--   v_lines_processed      integer := 0;
--   v_lines_skipped        integer := 0;
-- BEGIN
--   -- Only ever react to a transition into 'accepted' — proposals_status_check
--   -- has a single literal for acceptance (no alias array needed, unlike
--   -- client_contracts' 'signed'/'assinado').
--   IF NEW.status IS DISTINCT FROM 'accepted' THEN
--     RETURN NEW;
--   END IF;
--   IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
--     RETURN NEW;
--   END IF;
--
--   -- proposals.organization_id is NULLABLE (unlike client_contracts.
--   -- organization_id, NOT NULL) — nothing to resolve settings/warehouse
--   -- against, and stock_movements.organization_id is NOT NULL. Never guess.
--   IF NEW.organization_id IS NULL THEN
--     RETURN NEW;
--   END IF;
--
--   -- Everything below is best-effort: any failure is caught and logged, never
--   -- propagated, so this can never block accept_proposal_atomic's UPDATE
--   -- (which has no BEGIN/EXCEPTION of its own — confirmed by reading
--   -- 20261115020000).
--   BEGIN
--     -- ── 1. Organization inventory settings (default when the org has no row
--     --      configured yet: 'contract_signed', no default warehouse). ───────
--     SELECT stock_deduction_trigger, default_warehouse_id
--     INTO v_trigger_mode, v_default_warehouse_id
--     FROM public.organization_inventory_settings
--     WHERE organization_id = NEW.organization_id;
--
--     IF NOT FOUND THEN
--       v_trigger_mode := 'contract_signed';
--       v_default_warehouse_id := NULL;
--     END IF;
--
--     -- ── 2. This organization deducts on contract signature instead (the
--     --      default) — that is Fase 5.0B, handled by fn_contract_stock_
--     --      deduction(). Do nothing here (inverse guard of that function's
--     --      own point 2). ───────────────────────────────────────────────────
--     IF v_trigger_mode <> 'proposal_accepted' THEN
--       RETURN NEW;
--     END IF;
--
--     -- ── 3. Resolve the quote: proposals has no quote_id column (unlike
--     --      client_contracts) — always use the same fallback subquery
--     --      20261115080000 introduced for contracts, applied directly here.
--     --      No quote resolvable → nothing to deduct. ─────────────────────────
--     SELECT id INTO v_resolved_quote_id
--     FROM public.quotes
--     WHERE proposal_id = NEW.id
--     ORDER BY created_at DESC
--     LIMIT 1;
--
--     IF v_resolved_quote_id IS NULL THEN
--       RETURN NEW;
--     END IF;
--
--     -- ── 4. Resolve the warehouse: settings default, else exactly-one-active
--     --      -warehouse fallback, else no movement at all (never guess). ─────
--     v_resolved_warehouse := v_default_warehouse_id;
--
--     IF v_resolved_warehouse IS NULL THEN
--       SELECT count(*) INTO v_active_warehouse_cnt
--       FROM public.warehouses
--       WHERE organization_id = NEW.organization_id
--         AND deleted_at IS NULL;
--
--       IF v_active_warehouse_cnt = 1 THEN
--         SELECT id INTO v_resolved_warehouse
--         FROM public.warehouses
--         WHERE organization_id = NEW.organization_id
--           AND deleted_at IS NULL;
--       ELSE
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, execution_data
--         ) VALUES (
--           'proposal', NEW.id, 'stock_movement', NULL,
--           'trigger:proposal_stock_deduction_no_warehouse', 'warning',
--           jsonb_build_object(
--             'reason', 'No default_warehouse_id configured and organization does not have exactly one active warehouse',
--             'active_warehouse_count', v_active_warehouse_cnt
--           )
--         );
--         RETURN NEW;
--       END IF;
--     END IF;
--
--     -- ── 5. One sale stock movement per quote line whose product has
--     --      manages_stock=true. Bundle-expanded lines (bundle_id set) are NOT
--     --      excluded — same plan decision as Fase 5.0B. A line with a
--     --      fractional/invalid quantity is skipped with a warning log — it
--     --      must never abort the remaining lines. Any other unexpected
--     --      failure on a single line (caught per-line below) never stops the
--     --      loop. ─────────────────────────────────────────────────────────────
--     FOR v_line IN
--       SELECT ql.id, ql.product_id, ql.qt
--       FROM public.quote_lines ql
--       JOIN public.products p ON p.id = ql.product_id
--       WHERE ql.quote_id = v_resolved_quote_id
--         AND ql.product_id IS NOT NULL
--         AND p.manages_stock = true
--     LOOP
--       IF v_line.qt IS NULL OR v_line.qt <= 0 THEN
--         v_lines_skipped := v_lines_skipped + 1;
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, execution_data
--         ) VALUES (
--           'proposal', NEW.id, 'quote_line', v_line.id,
--           'trigger:proposal_stock_deduction_line_skipped', 'warning',
--           jsonb_build_object('reason', 'quantity_null_or_not_positive', 'qt', v_line.qt, 'product_id', v_line.product_id)
--         );
--         CONTINUE;
--       END IF;
--
--       IF v_line.qt <> floor(v_line.qt) THEN
--         v_lines_skipped := v_lines_skipped + 1;
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, execution_data
--         ) VALUES (
--           'proposal', NEW.id, 'quote_line', v_line.id,
--           'trigger:proposal_stock_deduction_line_skipped', 'warning',
--           jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
--         );
--         CONTINUE;
--       END IF;
--
--       v_qty_int := v_line.qt::integer;
--
--       -- Per-line guard: a failure registering one line's movement must never
--       -- abort the remaining lines of the same proposal.
--       BEGIN
--         v_result := public.rpc_register_sale_stock_movement(
--           p_product_id        => v_line.product_id,
--           p_warehouse_id       => v_resolved_warehouse,
--           p_quantity           => v_qty_int,
--           p_quote_line_id      => v_line.id,
--           p_sale_source_type   => 'proposal',
--           p_sale_source_id     => NEW.id,
--           p_document_number    => COALESCE(NEW.proposal_number, NEW.id::text),
--           p_unit_cost_at_time  => NULL,
--           p_organization_id    => NEW.organization_id
--         );
--
--         v_lines_processed := v_lines_processed + 1;
--
--         -- Traceable for Fase 5.0D (user-visible alerts, not implemented
--         -- here) — never blocks nor stops the rest of the flow.
--         IF COALESCE((v_result ->> 'was_insufficient')::boolean, false) THEN
--           INSERT INTO public.workflow_execution_log (
--             source_entity, source_record_id, target_entity, target_record_id,
--             action_type, status, execution_data
--           ) VALUES (
--             'proposal', NEW.id, 'stock_movement', (v_result ->> 'movement_id')::uuid,
--             'trigger:proposal_stock_deduction_insufficient', 'warning',
--             jsonb_build_object('quote_line_id', v_line.id, 'product_id', v_line.product_id, 'result', v_result)
--           );
--         END IF;
--       EXCEPTION WHEN OTHERS THEN
--         v_lines_skipped := v_lines_skipped + 1;
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, error_message, execution_data
--         ) VALUES (
--           'proposal', NEW.id, 'quote_line', v_line.id,
--           'trigger:proposal_stock_deduction_line_error', 'error', SQLERRM,
--           jsonb_build_object('product_id', v_line.product_id, 'qt', v_line.qt)
--         );
--       END;
--     END LOOP;
--
--     INSERT INTO public.workflow_execution_log (
--       source_entity, source_record_id, target_entity, target_record_id,
--       action_type, status, execution_data
--     ) VALUES (
--       'proposal', NEW.id, 'stock_movement', NULL,
--       'trigger:proposal_stock_deduction', 'success',
--       jsonb_build_object('lines_processed', v_lines_processed, 'lines_skipped', v_lines_skipped, 'warehouse_id', v_resolved_warehouse, 'resolved_quote_id', v_resolved_quote_id)
--     );
--
--   EXCEPTION WHEN OTHERS THEN
--     BEGIN
--       INSERT INTO public.workflow_execution_log (
--         source_entity, source_record_id, target_entity, target_record_id,
--         action_type, status, error_message
--       ) VALUES (
--         'proposal', NEW.id, 'stock_movement', NULL,
--         'trigger:proposal_stock_deduction', 'error', SQLERRM
--       );
--     EXCEPTION WHEN OTHERS THEN
--       -- Even the error-log insert must never propagate.
--       NULL;
--     END;
--   END;
--
--   RETURN NEW;
-- END;
-- $function$;
-- ---- fn_contract_supplier_request (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.fn_contract_supplier_request()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_signed_aliases       text[] := ARRAY['signed', 'assinado'];
--   v_trigger_mode         text;
--   v_resolved_quote_id    uuid;
--   v_actor                uuid;
--   v_line                 record;
--   v_supplier_id          uuid;
--   v_purchase_price       numeric;
--   v_supplier_map         jsonb := '{}'::jsonb;
--   v_supplier_key         text;
--   v_supplier_lines       jsonb;
--   v_po_id                uuid;
--   v_po_item              jsonb;
--   v_qty_int              integer;
--   v_unit_price           numeric;
--   v_line_total           numeric;
--   v_po_total             numeric;
--   v_lines_processed      integer := 0;
--   v_lines_skipped        integer := 0;
--   v_purchase_orders_created integer := 0;
--   v_suppliers_skipped_idempotent integer := 0;
--   v_available_stock      numeric;
--   v_lines_covered_by_stock integer := 0;
-- BEGIN
--   IF NEW.status IS NULL OR NOT (NEW.status = ANY (v_signed_aliases)) THEN
--     RETURN NEW;
--   END IF;
--   IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
--     RETURN NEW;
--   END IF;
--
--   BEGIN
--     SELECT stock_deduction_trigger INTO v_trigger_mode
--     FROM public.organization_inventory_settings
--     WHERE organization_id = NEW.organization_id;
--
--     IF NOT FOUND THEN
--       v_trigger_mode := 'contract_signed';
--     END IF;
--
--     IF v_trigger_mode <> 'contract_signed' THEN
--       RETURN NEW;
--     END IF;
--
--     v_resolved_quote_id := NEW.quote_id;
--     IF v_resolved_quote_id IS NULL AND NEW.proposal_id IS NOT NULL THEN
--       SELECT id INTO v_resolved_quote_id
--       FROM public.quotes
--       WHERE proposal_id = NEW.proposal_id
--       ORDER BY created_at DESC
--       LIMIT 1;
--     END IF;
--
--     IF v_resolved_quote_id IS NULL THEN
--       RETURN NEW;
--     END IF;
--
--     v_actor := public.current_business_user_id();
--     IF v_actor IS NULL THEN
--       SELECT q.created_by INTO v_actor
--       FROM public.quotes q
--       WHERE q.id = v_resolved_quote_id;
--     END IF;
--
--     IF v_actor IS NULL THEN
--       RAISE EXCEPTION 'Não foi possível determinar o autor do pedido a fornecedor (contrato %, quote %)', NEW.id, v_resolved_quote_id;
--     END IF;
--
--     -- ── 5. Walk every product line whose product does NOT manage stock (the
--     --      majority — sold to order): linhas diretas + produtos reais dentro
--     --      de linhas de Bundle (20261120170000 — ver cabeçalho). Validate
--     --      quantity (null/not positive/fractional skipped with a warning,
--     --      never aborts the rest); skip the line entirely, no PO at all,
--     --      when existing stock across the org's active warehouses already
--     --      covers the requested quantity (20261120160000); resolve the
--     --      preferred supplier per product (item_suppliers, is_preferred=
--     --      true, deleted_at IS NULL — at most 1 row thanks to the partial
--     --      unique index from Fase 1, LIMIT 1 as a defensive measure);
--     --      accumulate eligible lines grouped by resolved supplier into a
--     --      jsonb map (keyed by supplier_id::text) — avoids a temp table,
--     --      safe to build incrementally inside a single trigger
--     --      invocation. ─────────────────────────────────────────────────────
--     FOR v_line IN
--       SELECT ql.id AS quote_line_id, ql.product_id, ql.qt,
--              p.name AS product_name, p.sku AS product_sku
--       FROM public.quote_lines ql
--       JOIN public.products p ON p.id = ql.product_id
--       WHERE ql.quote_id = v_resolved_quote_id
--         AND ql.product_id IS NOT NULL
--         AND p.manages_stock = false
--
--       UNION ALL
--
--       SELECT
--         ql.id AS quote_line_id,
--         p.id AS product_id,
--         (COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1)) AS qt,
--         p.name AS product_name, p.sku AS product_sku
--       FROM public.quote_lines ql
--       JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
--         ON true
--       JOIN public.products p ON p.id = (comp.value ->> 'source_id')::uuid
--       WHERE ql.quote_id = v_resolved_quote_id
--         AND ql.bundle_id IS NOT NULL
--         AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
--         AND comp.value ->> 'type' = 'product'
--         AND comp.value ->> 'source_id' IS NOT NULL
--         AND p.manages_stock = false
--     LOOP
--       IF v_line.qt IS NULL OR v_line.qt <= 0 THEN
--         v_lines_skipped := v_lines_skipped + 1;
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, execution_data
--         ) VALUES (
--           'contract', NEW.id, 'quote_line', v_line.quote_line_id,
--           'trigger:contract_po_request_line_skipped', 'warning',
--           jsonb_build_object('reason', 'quantity_null_or_not_positive', 'qt', v_line.qt, 'product_id', v_line.product_id)
--         );
--         CONTINUE;
--       END IF;
--
--       IF v_line.qt <> floor(v_line.qt) THEN
--         v_lines_skipped := v_lines_skipped + 1;
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, execution_data
--         ) VALUES (
--           'contract', NEW.id, 'quote_line', v_line.quote_line_id,
--           'trigger:contract_po_request_line_skipped', 'warning',
--           jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
--         );
--         CONTINUE;
--       END IF;
--
--       -- 20261120160000: já existe stock físico suficiente? Soma-se em todos
--       -- os armazéns ATIVOS da organização. Cobertura parcial (stock < pedido)
--       -- ainda gera a encomenda pela quantidade total da linha, de propósito.
--       SELECT COALESCE(SUM(s.quantity), 0) INTO v_available_stock
--       FROM public.stocks s
--       JOIN public.warehouses w ON w.id = s.warehouse_id
--       WHERE s.product_id = v_line.product_id
--         AND s.deleted_at IS NULL
--         AND w.organization_id = NEW.organization_id
--         AND w.deleted_at IS NULL;
--
--       IF v_available_stock >= v_line.qt THEN
--         v_lines_covered_by_stock := v_lines_covered_by_stock + 1;
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, execution_data
--         ) VALUES (
--           'contract', NEW.id, 'quote_line', v_line.quote_line_id,
--           'trigger:contract_po_request_covered_by_stock', 'info',
--           jsonb_build_object('product_id', v_line.product_id, 'required_qty', v_line.qt, 'available_stock', v_available_stock)
--         );
--         CONTINUE;
--       END IF;
--
--       SELECT supplier_id, purchase_price INTO v_supplier_id, v_purchase_price
--       FROM public.item_suppliers
--       WHERE product_id = v_line.product_id
--         AND is_preferred = true
--         AND deleted_at IS NULL
--       LIMIT 1;
--
--       IF v_supplier_id IS NULL THEN
--         v_lines_skipped := v_lines_skipped + 1;
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, execution_data
--         ) VALUES (
--           'contract', NEW.id, 'quote_line', v_line.quote_line_id,
--           'trigger:contract_po_request_no_supplier', 'warning',
--           jsonb_build_object('reason', 'no_preferred_supplier', 'product_id', v_line.product_id)
--         );
--         CONTINUE;
--       END IF;
--
--       -- 20261115090000, reposto aqui: item_suppliers.purchase_price nem
--       -- sempre está preenchido — cai para o preço de compra do próprio
--       -- produto antes de aceitar 0,00.
--       IF v_purchase_price IS NULL THEN
--         SELECT price INTO v_purchase_price
--         FROM public.product_prices
--         WHERE product_id = v_line.product_id AND price_type = 'purchase'
--         ORDER BY valid_from DESC NULLS LAST
--         LIMIT 1;
--       END IF;
--
--       v_qty_int := v_line.qt::integer;
--       v_lines_processed := v_lines_processed + 1;
--
--       v_supplier_key := v_supplier_id::text;
--       v_supplier_map := v_supplier_map || jsonb_build_object(
--         v_supplier_key,
--         COALESCE(v_supplier_map -> v_supplier_key, '[]'::jsonb) || jsonb_build_array(
--           jsonb_build_object(
--             'quote_line_id',  v_line.quote_line_id,
--             'product_id',     v_line.product_id,
--             'quantity',       v_qty_int,
--             'product_name',   v_line.product_name,
--             'product_sku',    v_line.product_sku,
--             'unit_price',     v_purchase_price
--           )
--         )
--       );
--     END LOOP;
--
--     -- ── 6. One purchase_orders per distinct resolved supplier — idempotent
--     --      per (source_type='contract', source_id=NEW.id, supplier_id). ────
--     FOR v_supplier_key IN SELECT jsonb_object_keys(v_supplier_map)
--     LOOP
--       v_supplier_id    := v_supplier_key::uuid;
--       v_supplier_lines := v_supplier_map -> v_supplier_key;
--
--       IF EXISTS (
--         SELECT 1 FROM public.purchase_orders
--         WHERE source_type = 'contract' AND source_id = NEW.id AND supplier_id = v_supplier_id
--       ) THEN
--         v_suppliers_skipped_idempotent := v_suppliers_skipped_idempotent + 1;
--         CONTINUE;
--       END IF;
--
--       BEGIN
--         INSERT INTO public.purchase_orders (
--           organization_id, supplier_id, order_date, status,
--           source_type, source_id, notes, created_by
--         ) VALUES (
--           NEW.organization_id, v_supplier_id, now()::date, 'pending',
--           'contract', NEW.id,
--           format('Gerada automaticamente a partir do contrato %s', COALESCE(NEW.contract_number, NEW.id::text)),
--           v_actor
--         )
--         RETURNING id INTO v_po_id;
--
--         v_po_total := 0;
--
--         FOR v_po_item IN SELECT * FROM jsonb_array_elements(v_supplier_lines)
--         LOOP
--           v_unit_price := COALESCE((v_po_item ->> 'unit_price')::numeric, 0);
--           v_line_total := v_unit_price * (v_po_item ->> 'quantity')::numeric;
--           v_po_total   := v_po_total + v_line_total;
--
--           INSERT INTO public.purchase_order_items (
--             purchase_order_id, item_type, product_id, description, sku,
--             quantity, unit_price, total_price
--           ) VALUES (
--             v_po_id, 'product', (v_po_item ->> 'product_id')::uuid,
--             v_po_item ->> 'product_name', v_po_item ->> 'product_sku',
--             (v_po_item ->> 'quantity')::numeric, v_unit_price, v_line_total
--           );
--         END LOOP;
--
--         UPDATE public.purchase_orders SET total_value = v_po_total WHERE id = v_po_id;
--
--         v_purchase_orders_created := v_purchase_orders_created + 1;
--       EXCEPTION WHEN OTHERS THEN
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, error_message, execution_data
--         ) VALUES (
--           'contract', NEW.id, 'purchase_order', NULL,
--           'trigger:contract_po_request_supplier_error', 'error', SQLERRM,
--           jsonb_build_object('supplier_id', v_supplier_id)
--         );
--       END;
--     END LOOP;
--
--     INSERT INTO public.workflow_execution_log (
--       source_entity, source_record_id, target_entity, target_record_id,
--       action_type, status, execution_data
--     ) VALUES (
--       'contract', NEW.id, 'purchase_order', NULL,
--       'trigger:contract_po_request', 'success',
--       jsonb_build_object(
--         'lines_processed', v_lines_processed,
--         'lines_skipped', v_lines_skipped,
--         'lines_covered_by_stock', v_lines_covered_by_stock,
--         'purchase_orders_created', v_purchase_orders_created,
--         'suppliers_skipped_idempotent', v_suppliers_skipped_idempotent,
--         'resolved_quote_id', v_resolved_quote_id
--       )
--     );
--
--   EXCEPTION WHEN OTHERS THEN
--     BEGIN
--       INSERT INTO public.workflow_execution_log (
--         source_entity, source_record_id, target_entity, target_record_id,
--         action_type, status, error_message
--       ) VALUES (
--         'contract', NEW.id, 'purchase_order', NULL,
--         'trigger:contract_po_request', 'error', SQLERRM
--       );
--     EXCEPTION WHEN OTHERS THEN
--       NULL;
--     END;
--   END;
--
--   RETURN NEW;
-- END;
-- $function$;
-- ---- fn_proposal_supplier_request (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.fn_proposal_supplier_request()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_trigger_mode         text;
--   v_resolved_quote_id    uuid;
--   v_actor                uuid;
--   v_line                 record;
--   v_supplier_id          uuid;
--   v_purchase_price       numeric;
--   v_supplier_map         jsonb := '{}'::jsonb;
--   v_supplier_key         text;
--   v_supplier_lines       jsonb;
--   v_po_id                uuid;
--   v_po_item              jsonb;
--   v_qty_int              integer;
--   v_unit_price           numeric;
--   v_line_total           numeric;
--   v_po_total             numeric;
--   v_lines_processed      integer := 0;
--   v_lines_skipped        integer := 0;
--   v_purchase_orders_created integer := 0;
--   v_suppliers_skipped_idempotent integer := 0;
-- BEGIN
--   IF NEW.status IS DISTINCT FROM 'accepted' THEN
--     RETURN NEW;
--   END IF;
--   IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
--     RETURN NEW;
--   END IF;
--
--   -- proposals.organization_id is NULLABLE — purchase_orders.organization_id
--   -- is NOT NULL, never guess.
--   IF NEW.organization_id IS NULL THEN
--     RETURN NEW;
--   END IF;
--
--   -- Everything below is best-effort: any failure is caught and logged, never
--   -- propagated, so this can never block accept_proposal_atomic's UPDATE.
--   BEGIN
--     -- ── 1. Organization inventory settings (default when the org has no row
--     --      configured yet: 'contract_signed'). ───────────────────────────────
--     SELECT stock_deduction_trigger INTO v_trigger_mode
--     FROM public.organization_inventory_settings
--     WHERE organization_id = NEW.organization_id;
--
--     IF NOT FOUND THEN
--       v_trigger_mode := 'contract_signed';
--     END IF;
--
--     -- ── 2. This organization acts on contract signature instead (the
--     --      default) — handled by fn_contract_supplier_request(). Do nothing
--     --      here (inverse guard). ─────────────────────────────────────────────
--     IF v_trigger_mode <> 'proposal_accepted' THEN
--       RETURN NEW;
--     END IF;
--
--     -- ── 3. Resolve the quote — same fallback as fn_proposal_stock_deduction,
--     --      applied directly (proposals has no quote_id column). ────────────
--     SELECT id INTO v_resolved_quote_id
--     FROM public.quotes
--     WHERE proposal_id = NEW.id
--     ORDER BY created_at DESC
--     LIMIT 1;
--
--     IF v_resolved_quote_id IS NULL THEN
--       RETURN NEW;
--     END IF;
--
--     -- ── 4. Resolve the actor once for the whole proposal — same fallback
--     --      pattern as rpc_register_sale_stock_movement/fn_contract_supplier_
--     --      request: current_business_user_id() first, else the quote's own
--     --      creator (NOT NULL), covering acceptance via the public link
--     --      (accept-proposal edge function, no staff session present). ───────
--     v_actor := public.current_business_user_id();
--     IF v_actor IS NULL THEN
--       SELECT q.created_by INTO v_actor
--       FROM public.quotes q
--       WHERE q.id = v_resolved_quote_id;
--     END IF;
--
--     IF v_actor IS NULL THEN
--       RAISE EXCEPTION 'Não foi possível determinar o autor do pedido a fornecedor (proposta %, quote %)', NEW.id, v_resolved_quote_id;
--     END IF;
--
--     -- ── 5. Walk every quote line whose product does NOT manage stock (sold
--     --      to order). Bundle-expanded lines are NOT excluded. Validate
--     --      quantity (null/not positive/fractional skipped with a warning,
--     --      never aborts the rest); resolve the preferred supplier per
--     --      product; purchase_price falls back to product_prices (price_type
--     --      = purchase) when item_suppliers.purchase_price is NULL, then to 0
--     --      — same fallback fn_contract_supplier_request gained in
--     --      20261115090000, incorporated here from the start. Accumulate
--     --      eligible lines grouped by resolved supplier into a jsonb map. ────
--     FOR v_line IN
--       SELECT ql.id AS quote_line_id, ql.product_id, ql.qt,
--              p.name AS product_name, p.sku AS product_sku
--       FROM public.quote_lines ql
--       JOIN public.products p ON p.id = ql.product_id
--       WHERE ql.quote_id = v_resolved_quote_id
--         AND ql.product_id IS NOT NULL
--         AND p.manages_stock = false
--     LOOP
--       IF v_line.qt IS NULL OR v_line.qt <= 0 THEN
--         v_lines_skipped := v_lines_skipped + 1;
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, execution_data
--         ) VALUES (
--           'proposal', NEW.id, 'quote_line', v_line.quote_line_id,
--           'trigger:proposal_po_request_line_skipped', 'warning',
--           jsonb_build_object('reason', 'quantity_null_or_not_positive', 'qt', v_line.qt, 'product_id', v_line.product_id)
--         );
--         CONTINUE;
--       END IF;
--
--       IF v_line.qt <> floor(v_line.qt) THEN
--         v_lines_skipped := v_lines_skipped + 1;
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, execution_data
--         ) VALUES (
--           'proposal', NEW.id, 'quote_line', v_line.quote_line_id,
--           'trigger:proposal_po_request_line_skipped', 'warning',
--           jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
--         );
--         CONTINUE;
--       END IF;
--
--       SELECT supplier_id, purchase_price INTO v_supplier_id, v_purchase_price
--       FROM public.item_suppliers
--       WHERE product_id = v_line.product_id
--         AND is_preferred = true
--         AND deleted_at IS NULL
--       LIMIT 1;
--
--       IF v_supplier_id IS NULL THEN
--         v_lines_skipped := v_lines_skipped + 1;
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, execution_data
--         ) VALUES (
--           'proposal', NEW.id, 'quote_line', v_line.quote_line_id,
--           'trigger:proposal_po_request_no_supplier', 'warning',
--           jsonb_build_object('reason', 'no_preferred_supplier', 'product_id', v_line.product_id)
--         );
--         CONTINUE;
--       END IF;
--
--       IF v_purchase_price IS NULL THEN
--         SELECT price INTO v_purchase_price
--         FROM public.product_prices
--         WHERE product_id = v_line.product_id AND price_type = 'purchase'
--         ORDER BY valid_from DESC NULLS LAST
--         LIMIT 1;
--       END IF;
--
--       v_qty_int := v_line.qt::integer;
--       v_lines_processed := v_lines_processed + 1;
--
--       v_supplier_key := v_supplier_id::text;
--       v_supplier_map := v_supplier_map || jsonb_build_object(
--         v_supplier_key,
--         COALESCE(v_supplier_map -> v_supplier_key, '[]'::jsonb) || jsonb_build_array(
--           jsonb_build_object(
--             'quote_line_id',  v_line.quote_line_id,
--             'product_id',     v_line.product_id,
--             'quantity',       v_qty_int,
--             'product_name',   v_line.product_name,
--             'product_sku',    v_line.product_sku,
--             'unit_price',     v_purchase_price
--           )
--         )
--       );
--     END LOOP;
--
--     -- ── 6. One purchase_orders per distinct resolved supplier — idempotent
--     --      per (source_type='proposal', source_id=NEW.id, supplier_id). ────
--     FOR v_supplier_key IN SELECT jsonb_object_keys(v_supplier_map)
--     LOOP
--       v_supplier_id    := v_supplier_key::uuid;
--       v_supplier_lines := v_supplier_map -> v_supplier_key;
--
--       IF EXISTS (
--         SELECT 1 FROM public.purchase_orders
--         WHERE source_type = 'proposal' AND source_id = NEW.id AND supplier_id = v_supplier_id
--       ) THEN
--         v_suppliers_skipped_idempotent := v_suppliers_skipped_idempotent + 1;
--         CONTINUE;
--       END IF;
--
--       -- Per-supplier guard: a failure creating one supplier's PO must never
--       -- abort the remaining suppliers of the same proposal.
--       BEGIN
--         INSERT INTO public.purchase_orders (
--           organization_id, supplier_id, order_date, status,
--           source_type, source_id, notes, created_by
--         ) VALUES (
--           NEW.organization_id, v_supplier_id, now()::date, 'pending',
--           'proposal', NEW.id,
--           format('Gerada automaticamente a partir da proposta %s', COALESCE(NEW.proposal_number, NEW.id::text)),
--           v_actor
--         )
--         RETURNING id INTO v_po_id;
--
--         v_po_total := 0;
--
--         FOR v_po_item IN SELECT * FROM jsonb_array_elements(v_supplier_lines)
--         LOOP
--           v_unit_price := COALESCE((v_po_item ->> 'unit_price')::numeric, 0);
--           v_line_total := v_unit_price * (v_po_item ->> 'quantity')::numeric;
--           v_po_total   := v_po_total + v_line_total;
--
--           INSERT INTO public.purchase_order_items (
--             purchase_order_id, item_type, product_id, description, sku,
--             quantity, unit_price, total_price
--           ) VALUES (
--             v_po_id, 'product', (v_po_item ->> 'product_id')::uuid,
--             v_po_item ->> 'product_name', v_po_item ->> 'product_sku',
--             (v_po_item ->> 'quantity')::numeric, v_unit_price, v_line_total
--           );
--         END LOOP;
--
--         UPDATE public.purchase_orders SET total_value = v_po_total WHERE id = v_po_id;
--
--         v_purchase_orders_created := v_purchase_orders_created + 1;
--       EXCEPTION WHEN OTHERS THEN
--         INSERT INTO public.workflow_execution_log (
--           source_entity, source_record_id, target_entity, target_record_id,
--           action_type, status, error_message, execution_data
--         ) VALUES (
--           'proposal', NEW.id, 'purchase_order', NULL,
--           'trigger:proposal_po_request_supplier_error', 'error', SQLERRM,
--           jsonb_build_object('supplier_id', v_supplier_id)
--         );
--       END;
--     END LOOP;
--
--     INSERT INTO public.workflow_execution_log (
--       source_entity, source_record_id, target_entity, target_record_id,
--       action_type, status, execution_data
--     ) VALUES (
--       'proposal', NEW.id, 'purchase_order', NULL,
--       'trigger:proposal_po_request', 'success',
--       jsonb_build_object(
--         'lines_processed', v_lines_processed,
--         'lines_skipped', v_lines_skipped,
--         'purchase_orders_created', v_purchase_orders_created,
--         'suppliers_skipped_idempotent', v_suppliers_skipped_idempotent,
--         'resolved_quote_id', v_resolved_quote_id
--       )
--     );
--
--   EXCEPTION WHEN OTHERS THEN
--     BEGIN
--       INSERT INTO public.workflow_execution_log (
--         source_entity, source_record_id, target_entity, target_record_id,
--         action_type, status, error_message
--       ) VALUES (
--         'proposal', NEW.id, 'purchase_order', NULL,
--         'trigger:proposal_po_request', 'error', SQLERRM
--       );
--     EXCEPTION WHEN OTHERS THEN
--       NULL;
--     END;
--   END;
--
--   RETURN NEW;
-- END;
-- $function$;
-- ---- rpc_get_client_order_document (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.rpc_get_client_order_document(p_contract_id uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_org               uuid;
--   v_status            text;
--   v_contract_number   text;
--   v_client_name       text;
--   v_signature_date    timestamptz;
--   v_total_value       numeric;
--   v_resolved_quote_id uuid;
--   v_lines             jsonb := '[]'::jsonb;
--   v_line              record;
--   v_line_status       text;
--   v_stock_movement_id uuid;
--   v_po_id             uuid;
--   v_po_order_number   text;
--   v_available_stock   numeric;
--   v_available_wh      jsonb;
--   -- NOVO (20261203050000): diagnóstico congelado do orçamento resolvido.
--   v_diagnostic        jsonb := '[]'::jsonb;
-- BEGIN
--   IF p_contract_id IS NULL THEN
--     RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
--   END IF;
--
--   SELECT
--     cc.organization_id, cc.status, cc.contract_number, cc.signature_date,
--     cc.total_value, e.display_name,
--     COALESCE(
--       cc.quote_id,
--       (
--         SELECT q2.id
--         FROM public.quotes q2
--         WHERE q2.proposal_id = cc.proposal_id
--         ORDER BY q2.created_at DESC
--         LIMIT 1
--       )
--     )
--   INTO v_org, v_status, v_contract_number, v_signature_date, v_total_value,
--        v_client_name, v_resolved_quote_id
--   FROM public.client_contracts cc
--   LEFT JOIN public.anew_entities e ON e.id = cc.entity_id
--   WHERE cc.id = p_contract_id
--     AND cc.deleted_at IS NULL;
--
--   IF v_org IS NULL THEN
--     RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT public.has_anew_permission(auth.uid(), 'inventory.view')
--      OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view') THEN
--     RAISE EXCEPTION 'Sem permissão para ver esta encomenda de cliente' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   IF v_resolved_quote_id IS NOT NULL THEN
--     FOR v_line IN
--       SELECT
--         ql.id AS quote_line_id, p.id AS product_id, NULL::uuid AS service_id, ql.qt AS qt,
--         p.name AS product_name, p.sku AS product_sku,
--         NULL::text AS service_name, NULL::text AS service_sku
--       FROM public.quote_lines ql
--       JOIN public.products p ON p.id = ql.product_id
--       WHERE ql.quote_id = v_resolved_quote_id
--         AND ql.product_id IS NOT NULL
--
--       UNION ALL
--
--       SELECT
--         ql.id AS quote_line_id,
--         p.id AS product_id, NULL::uuid AS service_id,
--         (COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1)) AS qt,
--         p.name AS product_name, p.sku AS product_sku,
--         NULL::text AS service_name, NULL::text AS service_sku
--       FROM public.quote_lines ql
--       JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
--         ON true
--       JOIN public.products p ON p.id = (comp.value ->> 'source_id')::uuid
--       WHERE ql.quote_id = v_resolved_quote_id
--         AND ql.bundle_id IS NOT NULL
--         AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
--         AND comp.value ->> 'type' = 'product'
--         AND comp.value ->> 'source_id' IS NOT NULL
--
--       UNION ALL
--
--       -- NOVO (20261130190000): linhas de serviço puro — sem stock/PO a
--       -- rastrear; ver bloco IF v_line.product_id IS NULL abaixo.
--       SELECT
--         ql.id AS quote_line_id, NULL::uuid AS product_id, s.id AS service_id, ql.qt AS qt,
--         NULL::text AS product_name, NULL::text AS product_sku,
--         s.name AS service_name, s.sku AS service_sku
--       FROM public.quote_lines ql
--       JOIN public.services s ON s.id = ql.service_id
--       WHERE ql.quote_id = v_resolved_quote_id
--         AND ql.service_id IS NOT NULL
--         AND ql.product_id IS NULL
--
--       ORDER BY 1
--     LOOP
--       v_line_status       := NULL;
--       v_stock_movement_id := NULL;
--       v_po_id             := NULL;
--       v_po_order_number   := NULL;
--       v_available_wh      := NULL;
--
--       IF v_line.product_id IS NULL THEN
--         -- Linha de serviço: nunca há stock físico nem PO de fornecedor
--         -- (fn_contract_stock_deduction / fn_contract_supplier_request já
--         -- ignoram estas linhas, de propósito). Estado fixo e distinto dos
--         -- estados de produto.
--         v_line_status := 'servico';
--       ELSE
--         -- (a) automático (venda + reference_id) OU (b) saída manual ligada
--         -- via "Encomenda Cliente de origem" (saida, sem reference_id).
--         SELECT sm.id INTO v_stock_movement_id
--         FROM public.stock_movements sm
--         WHERE sm.sale_source_type = 'contract'
--           AND sm.sale_source_id = p_contract_id
--           AND sm.product_id = v_line.product_id
--           AND (
--             (sm.movement_type = 'venda' AND sm.reference_id = v_line.quote_line_id)
--             OR sm.movement_type = 'saida'
--           )
--         ORDER BY sm.created_at DESC
--         LIMIT 1;
--
--         IF v_stock_movement_id IS NOT NULL THEN
--           v_line_status := 'servido_por_stock';
--         ELSE
--           SELECT po.id, po.order_number INTO v_po_id, v_po_order_number
--           FROM public.purchase_orders po
--           JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
--           WHERE po.source_type = 'contract'
--             AND po.source_id = p_contract_id
--             AND poi.product_id = v_line.product_id
--             AND (po.status = 'received' OR poi.received_quantity >= poi.quantity)
--           LIMIT 1;
--
--           IF v_po_id IS NOT NULL THEN
--             v_line_status := 'recebido';
--           ELSE
--             SELECT po.id, po.order_number INTO v_po_id, v_po_order_number
--             FROM public.purchase_orders po
--             JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
--             WHERE po.source_type = 'contract'
--               AND po.source_id = p_contract_id
--               AND poi.product_id = v_line.product_id
--               AND po.status IN ('pending', 'ordered', 'partially_received')
--               AND poi.received_quantity < poi.quantity
--             LIMIT 1;
--
--             IF v_po_id IS NOT NULL THEN
--               v_line_status := 'a_aguardar_encomenda';
--             ELSE
--               -- NOVO (20261120190000): antes de aceitar "sem fornecedor", ver
--               -- se já há stock real suficiente (o produto pode ter fornecedor
--               -- preferencial configurado — fn_contract_supplier_request só não
--               -- gerou PO porque não era preciso, 20261120160000).
--               SELECT COALESCE(SUM(s.quantity), 0) INTO v_available_stock
--               FROM public.stocks s
--               JOIN public.warehouses w ON w.id = s.warehouse_id
--               WHERE s.product_id = v_line.product_id
--                 AND s.deleted_at IS NULL
--                 AND w.organization_id = v_org
--                 AND w.deleted_at IS NULL;
--
--               IF v_available_stock >= v_line.qt THEN
--                 v_line_status := 'stock_disponivel_confirmar';
--
--                 -- NOVO (20261130070000): lista de armazéns ativos da
--                 -- organização com stock > 0 deste produto, para o
--                 -- profissional escolher de onde confirmar a saída. Só se
--                 -- calcula para linhas neste estado — as restantes não
--                 -- precisam desta informação.
--                 SELECT COALESCE(
--                   jsonb_agg(
--                     jsonb_build_object(
--                       'warehouse_id',   w.id,
--                       'warehouse_name', w.name,
--                       'quantity',       s.quantity
--                     )
--                     ORDER BY s.quantity DESC
--                   ),
--                   '[]'::jsonb
--                 ) INTO v_available_wh
--                 FROM public.stocks s
--                 JOIN public.warehouses w ON w.id = s.warehouse_id
--                 WHERE s.product_id = v_line.product_id
--                   AND s.deleted_at IS NULL
--                   AND s.quantity > 0
--                   AND w.organization_id = v_org
--                   AND w.deleted_at IS NULL;
--               ELSE
--                 v_line_status := 'sem_fornecedor';
--               END IF;
--             END IF;
--           END IF;
--         END IF;
--       END IF;
--
--       v_lines := v_lines || jsonb_build_object(
--         'quote_line_id',         v_line.quote_line_id,
--         'item_type',             CASE WHEN v_line.product_id IS NOT NULL THEN 'product' ELSE 'service' END,
--         'product_id',            v_line.product_id,
--         'product_name',          v_line.product_name,
--         'product_sku',           v_line.product_sku,
--         'service_id',            v_line.service_id,
--         'service_name',          v_line.service_name,
--         'service_sku',           v_line.service_sku,
--         'quantity',              v_line.qt,
--         'line_status',           v_line_status,
--         'stock_movement_id',     v_stock_movement_id,
--         'purchase_order_id',     v_po_id,
--         'purchase_order_number', v_po_order_number,
--         'available_warehouses',  v_available_wh
--       );
--     END LOOP;
--
--     -- NOVO (20261203050000): diagnóstico congelado do MESMO orçamento já resolvido
--     -- acima (inclui o fallback via proposal_id) — não se refaz a resolução.
--     -- Informativo para o armazém: não soma ao total nem gera linhas.
--     SELECT COALESCE(
--       jsonb_agg(
--         jsonb_build_object(
--           'deal_need_id',               qds.deal_need_id,
--           'need_title',                 qds.need_title,
--           'diag_area_m2',               qds.diag_area_m2,
--           'diag_demolir_descricao',     qds.diag_demolir_descricao,
--           'diag_demolir_m2',            qds.diag_demolir_m2,
--           'diag_proteger_descricao',    qds.diag_proteger_descricao,
--           'diag_intervencao_tipo',      qds.diag_intervencao_tipo,
--           'diag_intervencao_descricao', qds.diag_intervencao_descricao,
--           'materials',                  qds.materials
--         )
--         ORDER BY qds.created_at, qds.need_title
--       ),
--       '[]'::jsonb
--     ) INTO v_diagnostic
--     FROM public.quote_diagnostic_snapshot qds
--     WHERE qds.quote_id = v_resolved_quote_id;
--   END IF;
--
--   RETURN jsonb_build_object(
--     'contract_id',     p_contract_id,
--     'contract_number', v_contract_number,
--     'client_name',     v_client_name,
--     'signature_date',  v_signature_date,
--     'total_value',     v_total_value,
--     'status',          v_status,
--     'lines',           v_lines,
--     -- NOVO (20261203050000): chave acrescentada; nenhuma das anteriores mudou.
--     'diagnostic',      COALESCE(v_diagnostic, '[]'::jsonb)
--   );
-- END;
-- $function$;
-- ---- rpc_list_client_order_documents (versão anterior) ----
-- CREATE OR REPLACE FUNCTION public.rpc_list_client_order_documents(p_organization_id uuid, p_search text DEFAULT NULL::text, p_status_filter text DEFAULT NULL::text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
--  RETURNS TABLE(contract_id uuid, contract_number text, client_name text, signature_date timestamp with time zone, total_lines integer, lines_from_stock integer, lines_awaiting_order integer, lines_received integer, lines_no_supplier integer, lines_service integer, overall_status text)
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_signed_aliases text[] := ARRAY['signed', 'assinado'];
--   v_limit          int := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
--   v_offset         int := GREATEST(COALESCE(p_offset, 0), 0);
-- BEGIN
--   IF p_organization_id IS NULL THEN
--     RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT public.has_anew_permission(auth.uid(), 'inventory.view')
--      OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view') THEN
--     RAISE EXCEPTION 'Sem permissão para ver encomendas de clientes desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   RETURN QUERY
--   WITH resolved_contracts AS (
--     SELECT
--       cc.id                AS rc_contract_id,
--       cc.contract_number   AS rc_contract_number,
--       cc.signature_date    AS rc_signature_date,
--       e.display_name       AS rc_client_name,
--       COALESCE(
--         cc.quote_id,
--         (
--           SELECT q2.id
--           FROM public.quotes q2
--           WHERE q2.proposal_id = cc.proposal_id
--           ORDER BY q2.created_at DESC
--           LIMIT 1
--         )
--       )                     AS rc_resolved_quote_id
--     FROM public.client_contracts cc
--     LEFT JOIN public.anew_entities e ON e.id = cc.entity_id
--     WHERE cc.organization_id = p_organization_id
--       AND cc.deleted_at IS NULL
--       AND cc.status = ANY (v_signed_aliases)
--   ),
--   line_items AS (
--     SELECT
--       rc.rc_contract_id     AS li_contract_id,
--       rc.rc_contract_number AS li_contract_number,
--       rc.rc_client_name     AS li_client_name,
--       rc.rc_signature_date  AS li_signature_date,
--       ql.id                 AS li_quote_line_id,
--       ql.product_id         AS li_product_id,
--       ql.qt                 AS li_qty
--     FROM resolved_contracts rc
--     JOIN public.quote_lines ql ON ql.quote_id = rc.rc_resolved_quote_id
--     WHERE rc.rc_resolved_quote_id IS NOT NULL
--       AND ql.product_id IS NOT NULL
--
--     UNION ALL
--
--     SELECT
--       rc.rc_contract_id                AS li_contract_id,
--       rc.rc_contract_number            AS li_contract_number,
--       rc.rc_client_name                AS li_client_name,
--       rc.rc_signature_date             AS li_signature_date,
--       ql.id                            AS li_quote_line_id,
--       (comp.value ->> 'source_id')::uuid AS li_product_id,
--       (COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1)) AS li_qty
--     FROM resolved_contracts rc
--     JOIN public.quote_lines ql
--       ON ql.quote_id = rc.rc_resolved_quote_id
--      AND ql.bundle_id IS NOT NULL
--      AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
--     CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
--     WHERE rc.rc_resolved_quote_id IS NOT NULL
--       AND comp.value ->> 'type' = 'product'
--       AND comp.value ->> 'source_id' IS NOT NULL
--
--     UNION ALL
--
--     -- NOVO (20261130190000): linhas de serviço puro (sem produto associado).
--     -- li_product_id fica NULL de propósito — não há stock_movements nem
--     -- purchase_orders para casar (serviços não passam por armazém nem por
--     -- pedido a fornecedor nestes fluxos); o CASE em `lines` reconhece
--     -- li_product_id IS NULL como marcador de linha de serviço, antes de
--     -- tentar qualquer verificação de stock/PO.
--     SELECT
--       rc.rc_contract_id     AS li_contract_id,
--       rc.rc_contract_number AS li_contract_number,
--       rc.rc_client_name     AS li_client_name,
--       rc.rc_signature_date  AS li_signature_date,
--       ql.id                 AS li_quote_line_id,
--       NULL::uuid            AS li_product_id,
--       ql.qt                 AS li_qty
--     FROM resolved_contracts rc
--     JOIN public.quote_lines ql ON ql.quote_id = rc.rc_resolved_quote_id
--     WHERE rc.rc_resolved_quote_id IS NOT NULL
--       AND ql.service_id IS NOT NULL
--       AND ql.product_id IS NULL
--   ),
--   lines AS (
--     SELECT
--       li.li_contract_id     AS l_contract_id,
--       li.li_contract_number AS l_contract_number,
--       li.li_client_name     AS l_client_name,
--       li.li_signature_date  AS l_signature_date,
--       li.li_quote_line_id   AS l_quote_line_id,
--       CASE
--         -- NOVO (20261130190000): linha de serviço puro — nunca teve
--         -- product_id, nunca vai ter stock_movements/purchase_orders.
--         WHEN li.li_product_id IS NULL THEN 'servico'
--         -- (a) automático (venda + reference_id) OU (b) saída manual ligada
--         -- via "Encomenda Cliente de origem" (saida, sem reference_id — ver
--         -- cabeçalho desta migration e 20261115180000).
--         WHEN EXISTS (
--           SELECT 1
--           FROM public.stock_movements sm
--           WHERE sm.sale_source_type = 'contract'
--             AND sm.sale_source_id = li.li_contract_id
--             AND sm.product_id = li.li_product_id
--             AND (
--               (sm.movement_type = 'venda' AND sm.reference_id = li.li_quote_line_id)
--               OR sm.movement_type = 'saida'
--             )
--         ) THEN 'stock'
--         WHEN EXISTS (
--           SELECT 1
--           FROM public.purchase_orders po
--           JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
--           WHERE po.source_type = 'contract'
--             AND po.source_id = li.li_contract_id
--             AND poi.product_id = li.li_product_id
--             AND (po.status = 'received' OR poi.received_quantity >= poi.quantity)
--         ) THEN 'received'
--         WHEN EXISTS (
--           SELECT 1
--           FROM public.purchase_orders po
--           JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
--           WHERE po.source_type = 'contract'
--             AND po.source_id = li.li_contract_id
--             AND poi.product_id = li.li_product_id
--             AND po.status IN ('pending', 'ordered', 'partially_received')
--             AND poi.received_quantity < poi.quantity
--         ) THEN 'awaiting'
--         -- NOVO (20261120190000): coberto por stock, sem PO gerada de
--         -- propósito (20261120160000) — conta como "a aguardar encomenda"
--         -- no estado geral do contrato (decisão do utilizador: não introduz
--         -- mais uma categoria no filtro de estados da listagem). O rótulo
--         -- distinto ("Stock disponível — confirmar saída") só é mostrado no
--         -- detalhe (rpc_get_client_order_document).
--         WHEN (
--           SELECT COALESCE(SUM(s.quantity), 0)
--           FROM public.stocks s
--           JOIN public.warehouses w ON w.id = s.warehouse_id
--           WHERE s.product_id = li.li_product_id
--             AND s.deleted_at IS NULL
--             AND w.organization_id = p_organization_id
--             AND w.deleted_at IS NULL
--         ) >= li.li_qty THEN 'awaiting'
--         ELSE 'no_supplier'
--       END                                     AS l_line_status
--     FROM line_items li
--   ),
--   aggregated AS (
--     SELECT
--       l.l_contract_id                                             AS a_contract_id,
--       l.l_contract_number                                         AS a_contract_number,
--       l.l_client_name                                              AS a_client_name,
--       l.l_signature_date                                          AS a_signature_date,
--       count(*)::int                                                AS a_total_lines,
--       count(*) FILTER (WHERE l.l_line_status = 'stock')::int       AS a_lines_from_stock,
--       count(*) FILTER (WHERE l.l_line_status = 'awaiting')::int    AS a_lines_awaiting_order,
--       count(*) FILTER (WHERE l.l_line_status = 'received')::int    AS a_lines_received,
--       count(*) FILTER (WHERE l.l_line_status = 'no_supplier')::int AS a_lines_no_supplier,
--       count(*) FILTER (WHERE l.l_line_status = 'servico')::int     AS a_lines_service
--     FROM lines l
--     GROUP BY l.l_contract_id, l.l_contract_number, l.l_client_name, l.l_signature_date
--   ),
--   no_lines AS (
--     SELECT
--       rc.rc_contract_id     AS a_contract_id,
--       rc.rc_contract_number AS a_contract_number,
--       rc.rc_client_name     AS a_client_name,
--       rc.rc_signature_date  AS a_signature_date,
--       0 AS a_total_lines, 0 AS a_lines_from_stock, 0 AS a_lines_awaiting_order,
--       0 AS a_lines_received, 0 AS a_lines_no_supplier, 0 AS a_lines_service
--     FROM resolved_contracts rc
--     WHERE NOT EXISTS (
--       SELECT 1 FROM aggregated a WHERE a.a_contract_id = rc.rc_contract_id
--     )
--   ),
--   combined AS (
--     SELECT * FROM aggregated
--     UNION ALL
--     SELECT * FROM no_lines
--   ),
--   final AS (
--     SELECT
--       c.a_contract_id, c.a_contract_number, c.a_client_name, c.a_signature_date,
--       c.a_total_lines, c.a_lines_from_stock, c.a_lines_awaiting_order,
--       c.a_lines_received, c.a_lines_no_supplier, c.a_lines_service,
--       CASE
--         WHEN c.a_total_lines = 0 THEN 'totalmente_servido'
--         WHEN c.a_lines_awaiting_order = 0 AND c.a_lines_no_supplier = 0 THEN 'totalmente_servido'
--         WHEN (c.a_lines_from_stock + c.a_lines_received) = 0
--              AND c.a_lines_no_supplier = 0
--              AND c.a_lines_awaiting_order > 0 THEN 'a_aguardar_encomenda'
--         WHEN (c.a_lines_from_stock + c.a_lines_received) = 0
--              AND c.a_lines_awaiting_order = 0
--              AND c.a_lines_no_supplier > 0 THEN 'sem_fornecedor'
--         ELSE 'parcialmente_pendente'
--       END AS a_overall_status
--     FROM combined c
--   )
--   SELECT
--     f.a_contract_id          AS contract_id,
--     f.a_contract_number      AS contract_number,
--     f.a_client_name          AS client_name,
--     f.a_signature_date       AS signature_date,
--     f.a_total_lines          AS total_lines,
--     f.a_lines_from_stock     AS lines_from_stock,
--     f.a_lines_awaiting_order AS lines_awaiting_order,
--     f.a_lines_received       AS lines_received,
--     f.a_lines_no_supplier    AS lines_no_supplier,
--     f.a_lines_service        AS lines_service,
--     f.a_overall_status       AS overall_status
--   FROM final f
--   WHERE
--     (
--       p_search IS NULL OR p_search = ''
--       OR strpos(lower(COALESCE(f.a_contract_number, '')), lower(p_search)) > 0
--       OR strpos(lower(COALESCE(f.a_client_name, '')), lower(p_search)) > 0
--     )
--     AND (
--       p_status_filter IS NULL OR p_status_filter = 'all'
--       OR f.a_overall_status = p_status_filter
--     )
--     AND (
--       p_date_from IS NULL OR f.a_signature_date::date >= p_date_from
--     )
--     AND (
--       p_date_to IS NULL OR f.a_signature_date::date <= p_date_to
--     )
--   ORDER BY f.a_signature_date DESC NULLS LAST, f.a_contract_number DESC
--   LIMIT v_limit OFFSET v_offset;
-- END;
-- $function$;
