-- =============================================================================
-- Movimentos de stock com o número certo nas encomendas sintéticas
-- =============================================================================
-- client_contracts inclui contratos sintéticos (is_manual_order = true):
--   * Encomendas de Cliente manuais (order_number EC-…);
--   * Vendas Diretas (direct_sales.client_contract_id = contrato, sale_number VD-…).
-- Os movimentos de stock destas encomendas ficavam com o contract_number CC-…
-- no document_number / nas notas, o que é enganador.
--
-- Regra (venda direta testada ANTES de manual — as de VD também têm
-- is_manual_order = true):
--   * venda direta   -> ds.sale_number (VD-…)
--   * manual         -> COALESCE(order_number, contract_number) (EC-…)
--   * contrato real  -> contract_number (comportamento de antes, sem mudança)
--
-- SÓ ETIQUETA. Nenhuma função muda quantidades, reservas (FIFO), saídas,
-- estornos, pedidos a fornecedor, validações, permissões nem locks.
-- Cada função parte EXATAMENTE da definição viva (pg_get_functiondef em
-- 2026-09-29); as alterações estão marcadas com "NOVO (20261204620000)".
-- CREATE OR REPLACE mantém owner, grants, SECURITY DEFINER e search_path.
--
-- 1. fn_contract_stock_deduction         — p_document_number (era contract_number)
-- 2. rpc_confirm_client_order_stock_exit — p_notes (era sempre o CC-…)
-- 3. rpc_revert_client_order_stock_exit  — notas do estorno: VD-… na venda direta
-- 4. fn_contract_cancelled_stock_reversal — notas do estorno automático
-- 5. rpc_create_direct_sale_order        — a ligação direct_sales.client_contract_id
--    passa a ser escrita ANTES do UPDATE para 'signed' (mesma transação), senão
--    os gatilhos AFTER UPDATE OF status não conseguem saber que é venda direta.
--    Corrige também, sem lhe tocar, as notas da encomenda a fornecedor de
--    fn_client_order_request_missing (20261204610000), que pelo mesmo motivo
--    caíam no ramo "Encomenda Cliente EC-…" em vez de "venda direta VD-…".
-- 6. Backfill dos movimentos existentes — só quando o valor atual é
--    exatamente o contract_number / o texto automático exato de um contrato
--    sintético. Movimentos de contratos reais não são tocados.
-- =============================================================================

-- ── 1. fn_contract_stock_deduction ──
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
  -- NOVO (20261204620000): número que fica no movimento
  v_document_number      text;
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

    -- NOVO (20261204620000): número do documento de origem. Venda direta
    -- ANTES de manual (as de VD também têm is_manual_order): VD-…; encomenda
    -- manual: EC-… (order_number já vem do BEFORE trg_set_client_order_number);
    -- contrato real: contract_number, como antes.
    v_document_number := COALESCE(
      (
        SELECT COALESCE(ds.sale_number, NEW.order_number, NEW.contract_number)
        FROM public.direct_sales ds
        WHERE ds.client_contract_id = NEW.id
        ORDER BY ds.created_at DESC
        LIMIT 1
      ),
      CASE WHEN COALESCE(NEW.is_manual_order, false)
           THEN COALESCE(NEW.order_number, NEW.contract_number)
      END,
      NEW.contract_number
    );

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
          p_document_number    => v_document_number,  -- NOVO (20261204620000)
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
$function$
;

-- ── 2. rpc_confirm_client_order_stock_exit ──
CREATE OR REPLACE FUNCTION public.rpc_confirm_client_order_stock_exit(p_contract_id uuid, p_product_id uuid, p_quantity integer, p_warehouse_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org             uuid;
  v_contract_number text;
  v_balance_after   integer;
  -- NOVO (20261204310000)
  v_reserved        numeric;
  v_line_count      integer;
  -- NOVO (20261204340000)
  v_wh_qty          integer;
  -- NOVO (20261204620000): número da encomenda nas notas
  v_order_number    text;
  v_is_manual       boolean;
  v_sale_number     text;
  v_is_direct_sale  boolean;
  v_notes           text;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  SELECT cc.organization_id, cc.contract_number,
         cc.order_number, COALESCE(cc.is_manual_order, false)  -- NOVO (20261204620000)
  INTO v_org, v_contract_number,
       v_order_number, v_is_manual
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para ver esta encomenda de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (20261130080000): client_orders.confirm_stock_exit exigida
  -- ADICIONALMENTE a inventory.edit + client_contracts.view (ambos mantidos).
  IF NOT public.has_anew_permission(auth.uid(), 'inventory.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view')
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.confirm_stock_exit') THEN
    RAISE EXCEPTION 'Sem permissão para confirmar saída de stock desta encomenda' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (20261204310000): lock por produto (mesma ordem que
  -- fn_client_order_request_missing).
  PERFORM 1
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = p_product_id
    AND w.organization_id = v_org
  ORDER BY s.product_id, s.warehouse_id
  FOR UPDATE OF s;

  -- Guarda de idempotência: não duplicar a saída se já houver um movimento
  -- (automático ou manual) registado para este contrato/produto — mesma
  -- deteção usada em rpc_get_client_order_document para line_status =
  -- 'servido_por_stock'.
  -- NOVO (20261204290000): movimentos já estornados não contam — depois de
  -- estornar uma saída é possível confirmá-la de novo.
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = p_product_id
      AND sm.movement_type IN ('venda', 'saida')
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements r
        WHERE r.reversal_of_movement_id = sm.id
      )
  ) THEN
    RAISE EXCEPTION 'Este produto já teve saída de stock registada para esta encomenda' USING ERRCODE = 'unique_violation';
  END IF;

  -- NOVO (20261204310000): só se pode consumir o stock reservado para esta
  -- encomenda (fila por ordem de assinatura).
  SELECT COALESCE(SUM(r.qty_reserved), 0), count(*)
    INTO v_reserved, v_line_count
  FROM public.fn_client_order_line_reservations(v_org, ARRAY[p_product_id]) r
  WHERE r.contract_id = p_contract_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Este produto não faz parte desta encomenda assinada' USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity > v_reserved THEN
    IF v_reserved <= 0 THEN
      RAISE EXCEPTION 'Não há stock livre para esta encomenda: o stock existente deste produto está reservado para encomendas assinadas antes desta. Peça a quantidade em falta ao fornecedor.'
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'Só pode dar saída de % unidade(s) deste produto nesta encomenda — o restante stock está reservado para encomendas assinadas antes desta. Peça a diferença ao fornecedor.',
        trim_scale(v_reserved)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- NOVO (20261204340000): o armazém escolhido tem de ter a quantidade (as
  -- linhas de stocks deste produto já estão bloqueadas acima). Só conta stock
  -- ativo, de um armazém ativo da organização do contrato — o mesmo universo
  -- que a reserva por ordem usa.
  SELECT s.quantity
    INTO v_wh_qty
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = p_product_id
    AND s.warehouse_id = p_warehouse_id
    AND s.deleted_at IS NULL
    AND w.organization_id = v_org
    AND w.deleted_at IS NULL;

  IF COALESCE(v_wh_qty, 0) < p_quantity THEN
    RAISE EXCEPTION 'O armazém escolhido só tem % un — escolha outro armazém',
      GREATEST(COALESCE(v_wh_qty, 0), 0)
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261204620000): notas com o número certo. Venda direta ANTES de
  -- manual (as de VD também têm is_manual_order); contrato real mantém o
  -- texto de antes. Só texto — nada acima nem abaixo muda.
  SELECT ds.sale_number
    INTO v_sale_number
  FROM public.direct_sales ds
  WHERE ds.client_contract_id = p_contract_id
  ORDER BY ds.created_at DESC
  LIMIT 1;
  v_is_direct_sale := FOUND;

  v_notes := CASE
    WHEN v_is_direct_sale THEN
      format('Saída confirmada a partir da venda direta %s',
             COALESCE(v_sale_number, v_order_number, v_contract_number))
    WHEN v_is_manual THEN
      format('Saída confirmada a partir do documento de Encomenda Cliente %s',
             COALESCE(v_order_number, v_contract_number))
    ELSE
      format('Saída confirmada a partir do documento de Encomenda Cliente %s', v_contract_number)
  END;

  v_balance_after := public.rpc_decrement_stock(
    p_product_id       => p_product_id,
    p_warehouse_id     => p_warehouse_id,
    p_qty              => p_quantity,
    p_document_number  => NULL,
    p_document_type    => 'venda',
    p_counterparty     => NULL,
    p_notes            => v_notes,  -- NOVO (20261204620000)
    p_sale_source_type => 'contract',
    p_sale_source_id   => p_contract_id
  );

  RETURN jsonb_build_object(
    'success',       true,
    'balance_after', v_balance_after
  );
END;
$function$
;

-- ── 3. rpc_revert_client_order_stock_exit ──
CREATE OR REPLACE FUNCTION public.rpc_revert_client_order_stock_exit(p_contract_id uuid, p_movement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org             uuid;
  v_contract_number text;
  v_order_number    text;
  v_actor           uuid;
  v_mov             public.stock_movements;
  v_balance_after   integer;
  -- NOVO (20261204620000)
  v_sale_number     text;
  v_is_direct_sale  boolean;
BEGIN
  IF p_contract_id IS NULL OR p_movement_id IS NULL THEN
    RAISE EXCEPTION 'contract_id e movement_id são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT cc.organization_id, cc.contract_number, cc.order_number
  INTO v_org, v_contract_number, v_order_number
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesmas verificações de âmbito e permissão da confirmação.
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para ver esta encomenda de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'inventory.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'client_contracts.view')
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.confirm_stock_exit') THEN
    RAISE EXCEPTION 'Sem permissão para estornar saída de stock desta encomenda' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Trancar o movimento original serializa estornos concorrentes do mesmo
  -- movimento: o segundo espera e depois vê o estorno do primeiro.
  SELECT sm.* INTO v_mov
  FROM public.stock_movements sm
  WHERE sm.id = p_movement_id
  FOR UPDATE;

  IF v_mov.id IS NULL THEN
    RAISE EXCEPTION 'Movimento de stock não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_mov.movement_type IS DISTINCT FROM 'saida'
     OR v_mov.sale_source_type IS DISTINCT FROM 'contract'
     OR v_mov.sale_source_id IS DISTINCT FROM p_contract_id THEN
    RAISE EXCEPTION 'Este movimento não é uma saída confirmada desta encomenda' USING ERRCODE = 'check_violation';
  END IF;

  IF v_mov.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Movimento de stock de outra organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements r
    WHERE r.reversal_of_movement_id = v_mov.id
  ) THEN
    RAISE EXCEPTION 'Esta saída de stock já foi estornada' USING ERRCODE = 'unique_violation';
  END IF;

  -- NOVO (20261204620000): venda direta mostra o VD-… nas notas; os outros
  -- casos ficam exatamente como antes. Só texto.
  SELECT ds.sale_number
    INTO v_sale_number
  FROM public.direct_sales ds
  WHERE ds.client_contract_id = p_contract_id
  ORDER BY ds.created_at DESC
  LIMIT 1;
  v_is_direct_sale := FOUND;

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, reversal_of_movement_id,
    reference_id, sale_source_type, sale_source_id, notes, created_by
  ) VALUES (
    v_mov.organization_id, v_mov.product_id, v_mov.warehouse_id, 'estorno_venda', v_mov.quantity,
    v_mov.document_number, 'venda', v_mov.id,
    v_mov.reference_id, 'contract', p_contract_id,
    CASE
      WHEN v_is_direct_sale THEN
        format('Estorno da saída confirmada — venda direta %s',
               COALESCE(v_sale_number, v_order_number, v_contract_number))
      ELSE
        format('Estorno da saída confirmada — Encomenda %s', COALESCE(v_order_number, v_contract_number))
    END,  -- NOVO (20261204620000)
    v_actor
  )
  RETURNING balance_after INTO v_balance_after;

  RETURN jsonb_build_object(
    'success',       true,
    'balance_after', v_balance_after
  );
END;
$function$
;

-- ── 4. fn_contract_cancelled_stock_reversal ──
CREATE OR REPLACE FUNCTION public.fn_contract_cancelled_stock_reversal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reversal_aliases text[] := ARRAY['cancelled', 'rejected'];
  v_staff_actor    uuid;
  v_actor          uuid;
  v_mov            record;
  v_reversed_count integer := 0;
  -- NOVO (20261204620000): origem nas notas do estorno
  v_origin_label   text;
BEGIN
  IF NEW.status IS NULL OR NOT (NEW.status = ANY (v_reversal_aliases)) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block the write to client_contracts.
  BEGIN
    v_staff_actor := public.current_business_user_id();

    -- NOVO (20261204620000): venda direta ANTES de manual; contrato real
    -- mantém exatamente 'contrato <contract_number>'. Só texto.
    v_origin_label := COALESCE(
      (
        SELECT format('venda direta %s', COALESCE(ds.sale_number, NEW.order_number, NEW.contract_number))
        FROM public.direct_sales ds
        WHERE ds.client_contract_id = NEW.id
        ORDER BY ds.created_at DESC
        LIMIT 1
      ),
      CASE WHEN COALESCE(NEW.is_manual_order, false)
           THEN format('Encomenda Cliente %s', COALESCE(NEW.order_number, NEW.contract_number))
      END,
      format('contrato %s', NEW.contract_number)
    );

    FOR v_mov IN
      SELECT sm.*
      FROM public.stock_movements sm
      WHERE sm.sale_source_type = 'contract'
        AND sm.sale_source_id = NEW.id
        AND sm.movement_type = 'venda'
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversal_of_movement_id = sm.id
        )
    LOOP
      -- Per-movement guard: a failure reversing one movement must never
      -- abort the reversal of the remaining movements of the same contract.
      BEGIN
        -- v_mov.created_by is guaranteed to satisfy the FK to anew_users
        -- (it already exists on the original movement row) — safe final
        -- fallback when there is no staff session present (e.g. cancellation
        -- triggered from a service_role context without auth.uid()).
        v_actor := COALESCE(v_staff_actor, v_mov.created_by);

        INSERT INTO public.stock_movements (
          organization_id, product_id, warehouse_id, movement_type, quantity,
          document_number, document_type, reversal_of_movement_id,
          reference_id, sale_source_type, sale_source_id, notes, created_by
        ) VALUES (
          v_mov.organization_id, v_mov.product_id, v_mov.warehouse_id, 'estorno_venda', v_mov.quantity,
          v_mov.document_number, 'venda', v_mov.id,
          v_mov.reference_id, 'contract', NEW.id,
          format('Estorno automático da venda %s (%s, status %s)', v_mov.id, v_origin_label, NEW.status),  -- NOVO (20261204620000)
          v_actor
        );

        v_reversed_count := v_reversed_count + 1;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'contract', NEW.id, 'stock_movement', v_mov.id,
          'trigger:contract_stock_reversal_line_error', 'error', SQLERRM,
          jsonb_build_object('movement_id', v_mov.id, 'product_id', v_mov.product_id)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'contract', NEW.id, 'stock_movement', NULL,
      'trigger:contract_stock_reversal', 'success',
      jsonb_build_object('reversed_count', v_reversed_count, 'status', NEW.status)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'contract', NEW.id, 'stock_movement', NULL,
        'trigger:contract_stock_reversal', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$
;

-- ── 5. rpc_create_direct_sale_order ──
CREATE OR REPLACE FUNCTION public.rpc_create_direct_sale_order(p_direct_sale_id uuid)
 RETURNS client_contracts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sale         public.direct_sales;
  v_contract     public.client_contracts;
  v_client_id    uuid;
  v_root_org_id  uuid;
  v_entity_name  text;
  v_quote_id     uuid;
  v_line_count   integer;
BEGIN
  IF p_direct_sale_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar a venda direta' USING ERRCODE = 'check_violation';
  END IF;

  -- FOR UPDATE serializa aceitações concorrentes da mesma venda: sem isto,
  -- dois pedidos simultâneos passariam os dois pela guarda de idempotência
  -- abaixo e criariam duas encomendas (com dedução de stock a dobrar).
  SELECT * INTO v_sale
    FROM public.direct_sales
   WHERE id = p_direct_sale_id
     AND deleted_at IS NULL
     FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venda direta não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Idempotência ─────────────────────────────────────────────────────────
  -- Reaceitação não cria uma segunda encomenda, pela mesma razão por que não
  -- gera um segundo número de proforma: um documento emitido não se duplica.
  IF v_sale.client_contract_id IS NOT NULL THEN
    SELECT * INTO v_contract
      FROM public.client_contracts
     WHERE id = v_sale.client_contract_id;

    IF v_contract.id IS NOT NULL THEN
      RETURN v_contract;
    END IF;
    -- Ponteiro pendurado (contrato apagado à mão): cai para a criação normal.
  END IF;

  IF v_sale.status IS DISTINCT FROM 'aceite' THEN
    RAISE EXCEPTION 'A encomenda só é criada depois de a venda direta ser aceite (estado actual: %)', v_sale.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_sale.created_by IS NULL THEN
    RAISE EXCEPTION 'Venda direta sem autor; não é possível atribuir a encomenda' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Cliente ──────────────────────────────────────────────────────────────
  -- Exigir a ficha em anew_clients é também a validação de âmbito: a
  -- encomenda só pode existir para um cliente real desta organização.
  -- Mesma regra de rpc_create_manual_client_order.
  IF v_sale.entity_id IS NULL THEN
    RAISE EXCEPTION 'Venda direta sem cliente associado' USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.id, c.root_organization_id
    INTO v_client_id, v_root_org_id
    FROM public.anew_clients c
   WHERE c.entity_id = v_sale.entity_id
     AND c.organization_id = v_sale.organization_id
     AND c.deleted_at IS NULL
   LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta organização' USING ERRCODE = 'no_data_found';
  END IF;

  v_root_org_id := COALESCE(v_sale.root_organization_id, v_root_org_id, v_sale.organization_id);

  SELECT e.display_name INTO v_entity_name
    FROM public.anew_entities e
   WHERE e.id = v_sale.entity_id;

  SELECT count(*) INTO v_line_count
    FROM public.direct_sale_lines l
   WHERE l.direct_sale_id = v_sale.id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'A venda direta não tem linhas' USING ERRCODE = 'check_violation';
  END IF;

  -- Dentro da função de propósito: set_audit_context usa set_config(..., true),
  -- ou seja é LOCAL à transação. Chamada antes, de fora, não chegaria aqui.
  PERFORM public.set_audit_context(v_sale.created_by, 'portal_direct_sale');

  -- ── 1. Orçamento sintético (is_internal: nunca aparece em Quotes.tsx) ─────
  INSERT INTO public.quotes (
    entity_id, cliente_id, organization_id, root_organization_id,
    created_by, assigned_to, estado, is_internal, moeda,
    subtotal, total, iva_rate, accepted_at,
    title, obra_notas
  )
  VALUES (
    v_sale.entity_id, v_client_id, v_sale.organization_id, v_root_org_id,
    v_sale.created_by, COALESCE(v_sale.assigned_to, v_sale.created_by),
    'aceite', true, COALESCE(v_sale.currency, 'EUR'),
    COALESCE(v_sale.subtotal, 0), COALESCE(v_sale.total, 0),
    COALESCE(v_sale.iva_rate, 23), COALESCE(v_sale.accepted_at, now()),
    'Venda Direta — ' || COALESCE(v_sale.sale_number, v_sale.id::text),
    v_sale.notes
  )
  RETURNING id INTO v_quote_id;

  -- ── 2. Linhas, incluindo as internas (ver cabeçalho) ─────────────────────
  INSERT INTO public.quote_lines (
    quote_id, categoria, descricao_snapshot,
    qt, unidade, product_id, service_id,
    cost_price, custo_material_unit, retail_price_unit,
    margem_percent, iva_percent, discount_percent,
    total_sem_iva, total_com_iva, total_com_desconto,
    ordem, section_name, visible_to_client,
    uom_id  -- NOVO (20261204204500)
  )
  SELECT
    v_quote_id, 'Geral', l.descricao_snapshot,
    COALESCE(l.qt, 0), l.unidade, l.product_id, l.service_id,
    COALESCE(l.cost_price, 0), COALESCE(l.cost_price, 0), l.retail_price_unit,
    COALESCE(l.margem_percent, 0), COALESCE(l.iva_percent, 23), COALESCE(l.discount_percent, 0),
    COALESCE(l.total_sem_iva, 0), COALESCE(l.total_com_iva, 0), COALESCE(l.total_com_desconto, 0),
    COALESCE(l.ordem, 0), 'Geral', l.visible_to_client,
    l.uom_id
  FROM public.direct_sale_lines l
  WHERE l.direct_sale_id = v_sale.id
  ORDER BY COALESCE(l.ordem, 0), l.created_at;

  -- ── 3. Contrato em rascunho ──────────────────────────────────────────────
  -- contract_number fica NULL de propósito: trigger_set_client_contract_number
  -- (BEFORE INSERT) só gera o número quando o valor vem NULL — um '' passaria
  -- incólume e a encomenda ficaria sem número.
  INSERT INTO public.client_contracts (
    contract_number, client_id, entity_id, quote_id,
    organization_id, root_organization_id, created_by,
    status, total_value, currency, start_date, notes,
    is_manual_order
  )
  VALUES (
    NULL, v_client_id, v_sale.entity_id, v_quote_id,
    v_sale.organization_id, v_root_org_id, v_sale.created_by,
    'draft', COALESCE(v_sale.total, 0), COALESCE(v_sale.currency, 'EUR'),
    COALESCE(v_sale.accepted_at::date, current_date),
    'Gerada automaticamente a partir da venda direta ' || COALESCE(v_sale.sale_number, v_sale.id::text),
    true
  )
  RETURNING * INTO v_contract;

  -- ── 4. Ligação de volta (a coluna estava reservada desde 20261130230000) ──
  -- NOVO (20261204620000): feita ANTES de promover a assinado, para que os
  -- gatilhos AFTER UPDATE OF status (fn_contract_stock_deduction,
  -- fn_client_order_request_missing) já reconheçam a venda direta e escrevam
  -- o VD-… no movimento de stock e nas notas da encomenda a fornecedor. Só
  -- muda o momento da escrita, na mesma transação; o valor é o mesmo.
  UPDATE public.direct_sales
     SET client_contract_id = v_contract.id
   WHERE id = v_sale.id;

  -- ── 5. Promover a assinado: é ESTE UPDATE que dispara stock e fornecedor ──
  UPDATE public.client_contracts
     SET status            = 'signed',
         signature_date    = COALESCE(v_sale.accepted_at, now()),
         accepted_at       = COALESCE(v_sale.accepted_at, now()),
         signed_by_name    = COALESCE(v_entity_name, 'Cliente'),
         status_changed_by = v_sale.created_by,
         status_changed_at = now()
   WHERE id = v_contract.id
  RETURNING * INTO v_contract;

  RETURN v_contract;
END;
$function$
;

-- ── 6. Backfill ─────────────────────────────────────────────────────────────
-- stock_movements não tem gatilho de UPDATE que mexa em stock
-- (fn_stock_movements_apply é só BEFORE INSERT); trg_audit_stock_movements
-- regista a alteração em entity_audit_log.
-- Contagem em 2026-09-29 (leitura): 26 saídas manuais de Encomendas Cliente
-- manuais com a nota "…Encomenda Cliente CC-…"; 0 movimentos com
-- document_number = contract_number; 0 estornos a corrigir.
DO $backfill$
DECLARE
  v_docnum   integer;
  v_saida    integer;
  v_revert   integer;
  v_auto     integer;
BEGIN
  PERFORM set_config('app.audit_source', 'migration:20261204620000', true);

  CREATE TEMP TABLE _mvs_syn ON COMMIT DROP AS
  SELECT
    cc.id,
    cc.contract_number,
    cc.order_number,
    ds.sale_number,
    (ds.client_contract_id IS NOT NULL) AS is_vd,
    CASE
      WHEN ds.client_contract_id IS NOT NULL
        THEN COALESCE(ds.sale_number, cc.order_number, cc.contract_number)
      ELSE COALESCE(cc.order_number, cc.contract_number)
    END AS new_number
  FROM public.client_contracts cc
  LEFT JOIN LATERAL (
    SELECT d.client_contract_id, d.sale_number
    FROM public.direct_sales d
    WHERE d.client_contract_id = cc.id
    ORDER BY d.created_at DESC
    LIMIT 1
  ) ds ON true
  WHERE COALESCE(cc.is_manual_order, false) = true
     OR ds.client_contract_id IS NOT NULL;

  -- 6a. document_number = contract_number (venda automática e estornos que o
  --     copiaram).
  UPDATE public.stock_movements sm
     SET document_number = s.new_number
    FROM _mvs_syn s
   WHERE sm.sale_source_type = 'contract'
     AND sm.sale_source_id = s.id
     AND s.contract_number IS NOT NULL
     AND sm.document_number = s.contract_number
     AND s.new_number IS DISTINCT FROM s.contract_number;
  GET DIAGNOSTICS v_docnum = ROW_COUNT;

  -- 6b. Nota automática exata de rpc_confirm_client_order_stock_exit.
  UPDATE public.stock_movements sm
     SET notes = CASE
                   WHEN s.is_vd THEN format('Saída confirmada a partir da venda direta %s', s.new_number)
                   ELSE format('Saída confirmada a partir do documento de Encomenda Cliente %s', s.new_number)
                 END
    FROM _mvs_syn s
   WHERE sm.sale_source_type = 'contract'
     AND sm.sale_source_id = s.id
     AND sm.movement_type = 'saida'
     AND s.contract_number IS NOT NULL
     AND sm.notes = format('Saída confirmada a partir do documento de Encomenda Cliente %s', s.contract_number)
     AND (s.is_vd OR s.new_number IS DISTINCT FROM s.contract_number);
  GET DIAGNOSTICS v_saida = ROW_COUNT;

  -- 6c. Nota automática exata de rpc_revert_client_order_stock_exit, só nas
  --     vendas diretas (nas manuais já mostrava o EC-…).
  UPDATE public.stock_movements sm
     SET notes = format('Estorno da saída confirmada — venda direta %s', s.new_number)
    FROM _mvs_syn s
   WHERE sm.sale_source_type = 'contract'
     AND sm.sale_source_id = s.id
     AND sm.movement_type = 'estorno_venda'
     AND s.is_vd
     AND sm.notes = format('Estorno da saída confirmada — Encomenda %s', COALESCE(s.order_number, s.contract_number));
  GET DIAGNOSTICS v_revert = ROW_COUNT;

  -- 6d. Nota automática exata de fn_contract_cancelled_stock_reversal.
  UPDATE public.stock_movements sm
     SET notes = format('Estorno automático da venda %s (%s, status %s)',
                        sm.reversal_of_movement_id,
                        CASE WHEN s.is_vd THEN format('venda direta %s', s.new_number)
                             ELSE format('Encomenda Cliente %s', s.new_number) END,
                        st.status)
    FROM _mvs_syn s
    CROSS JOIN (VALUES ('cancelled'), ('rejected')) AS st(status)
   WHERE sm.sale_source_type = 'contract'
     AND sm.sale_source_id = s.id
     AND sm.movement_type = 'estorno_venda'
     AND sm.reversal_of_movement_id IS NOT NULL
     AND s.contract_number IS NOT NULL
     AND sm.notes = format('Estorno automático da venda %s (contrato %s, status %s)',
                           sm.reversal_of_movement_id, s.contract_number, st.status);
  GET DIAGNOSTICS v_auto = ROW_COUNT;

  RAISE NOTICE 'movimentos_stock_numero_encomenda: document_number=%, saida_notes=%, estorno_vd_notes=%, estorno_auto_notes=%',
    v_docnum, v_saida, v_revert, v_auto;
END
$backfill$;
