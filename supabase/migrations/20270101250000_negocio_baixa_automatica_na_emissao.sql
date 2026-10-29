-- 29/10: Negócios — baixa automática de stock na emissão da encomenda de cliente (EC).
-- Base RH (uetjghdkwbywbftedtth). Sem tabelas nem colunas novas: só funções e uma linha de definições.
--
-- Fluxo (aprovado pelo utilizador): proposta aceite (venda direta) ou contrato assinado → o Financeiro regista a fatura e valida o
-- pagamento → a EC é emitida (fn_neg_emitir_ec_se_pronta, ec_emitida_em) → o que há em stock serve-se pela reserva FIFO e desconta-se
-- logo (stock_movements 'venda'); o que falta pede-se ao fornecedor (fn_client_order_request_missing), como sempre.
--
-- 1. NOVA fn_contract_deduct_stock(contrato) (interna, sem grant a authenticated): o corpo de fn_contract_stock_deduction tal como está
--    vivo, sem alterações de comportamento (NEW → linha do contrato lida pelo id). Idempotente por linha do orçamento (qualquer 'venda'
--    desta linha nesta origem → não volta a descontar) e limitada à reserva FIFO (fn_client_order_line_reservations). Defensivo: não faz
--    nada se o contrato não estiver assinado ou se o modo da organização não for 'contract_signed'.
-- 2. fn_contract_stock_deduction (gatilho, sobre a versão viva): mantém o portão (passagem para signed/assinado) e o modo; passa a chamar
--    fn_contract_deduct_stock. NOVO: se a EC ainda não está emitida (contrato ou adenda de um negócio da Emylia — fn_ec_emitida), em vez
--    de tentar descontar (a reserva é sempre 0 antes da emissão) chama fn_neg_emitir_ec_se_pronta: assim um contrato assinado DEPOIS da
--    fatura e do pagamento validados emite a EC na assinatura (e desconta/pede ao fornecedor conforme o modo). Sem pagamento, a emissão
--    devolve emitida=false e nada muda.
-- 3. fn_neg_emitir_ec_se_pronta (sobre a versão viva): lê o modo da organização (sem linha = 'contract_signed', como os gatilhos do CRM).
--    Logo depois de escrever ec_emitida_em (contrato e ciclo das adendas): 'contract_signed' → fn_contract_deduct_stock e depois o pedido
--    ao fornecedor (só do que falta); 'manual' → não desconta nem pede ao fornecedor; 'proposal_accepted' (antigo) → como antes (só o
--    pedido). O ramo da venda direta não muda: o contrato de suporte nasce já emitido e a assinatura sintética dispara os gatilhos do CRM
--    (que respeitam o modo) — não é chamado outra vez aqui (sem dupla baixa).
-- 4. rpc_upsert_inventory_settings (sobre a versão viva): aceita também 'manual' (e recusa NULL); o resto igual.
-- 5. Dados: Nike (b6ffce4f-…) volta a 'contract_signed' (estava 'manual' desde 20261231950000).
-- Guarda: só substitui as funções se forem exatamente as medidas a 29/10/2026 na base RH (md5 de pg_get_functiondef).

SET lock_timeout = '5s';

DO $guarda$
DECLARE v_h text;
BEGIN
  SELECT md5(pg_get_functiondef('public.fn_contract_stock_deduction()'::regprocedure)) INTO v_h;
  IF v_h <> '924a6c499bbd938666af39a6937be57f' THEN
    RAISE EXCEPTION 'Guarda: fn_contract_stock_deduction no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  SELECT md5(pg_get_functiondef('public.fn_neg_emitir_ec_se_pronta(uuid,uuid)'::regprocedure)) INTO v_h;
  IF v_h <> 'cfbae4afc2333c110752cd5c976274dd' THEN
    RAISE EXCEPTION 'Guarda: fn_neg_emitir_ec_se_pronta no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  SELECT md5(pg_get_functiondef('public.rpc_upsert_inventory_settings(uuid,text,uuid)'::regprocedure)) INTO v_h;
  IF v_h <> '89b69a9a62957f0b645e6e31afe93a66' THEN
    RAISE EXCEPTION 'Guarda: rpc_upsert_inventory_settings no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  -- dependências usadas tal como estão
  SELECT md5(pg_get_functiondef('public.fn_client_order_line_reservations(uuid,uuid[])'::regprocedure)) INTO v_h;
  IF v_h <> '06f8775c64784762f44bf3097702acc3' THEN
    RAISE EXCEPTION 'Guarda: fn_client_order_line_reservations no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  SELECT md5(pg_get_functiondef('public.fn_client_order_request_missing(uuid,uuid,uuid[])'::regprocedure)) INTO v_h;
  IF v_h <> 'dcf2627a3edc963d01a0db217c891b89' THEN
    RAISE EXCEPTION 'Guarda: fn_client_order_request_missing no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  SELECT md5(pg_get_functiondef('public.fn_ec_emitida(uuid)'::regprocedure)) INTO v_h;
  IF v_h <> '307b7d1ba12c572198babbd448f105d9' THEN
    RAISE EXCEPTION 'Guarda: fn_ec_emitida no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  IF to_regprocedure('public.fn_contract_deduct_stock(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: fn_contract_deduct_stock já existe no remoto: rever antes de aplicar.';
  END IF;
END $guarda$;

-- ─── 1. fn_contract_deduct_stock (corpo de fn_contract_stock_deduction, viva a 29/10) ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_contract_deduct_stock(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET lock_timeout TO '2s'
AS $function$
DECLARE
  v_signed_aliases       text[] := ARRAY['signed', 'assinado'];
  v_c                    public.client_contracts;  -- 29/10: era NEW (gatilho)
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
  -- NOVO (20261204630000): desconto limitado à reserva FIFO
  v_managed_products     uuid[];
  v_locked_products      uuid[] := ARRAY[]::uuid[];
  v_pid                  uuid;
  v_res_map              jsonb;
  v_reserved             numeric;
  v_wh_qty               integer;
  v_qty_deduct           integer;
  v_lines_partial        integer := 0;
  v_lines_not_reserved   integer := 0;
BEGIN
  -- 29/10: o contrato pelo id (o gatilho e a emissão da EC chamam com o contrato já assinado)
  SELECT * INTO v_c FROM public.client_contracts WHERE id = p_contract_id AND deleted_at IS NULL;
  IF v_c.id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'contract_not_found');
  END IF;
  IF v_c.status IS NULL OR NOT (v_c.status = ANY (v_signed_aliases)) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_signed');
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block the write to client_contracts.
  BEGIN
    -- ── 1. Organization inventory settings (default when the org has no row
    --      configured yet: 'contract_signed', no default warehouse). ───────
    SELECT stock_deduction_trigger, default_warehouse_id
    INTO v_trigger_mode, v_default_warehouse_id
    FROM public.organization_inventory_settings
    WHERE organization_id = v_c.organization_id;

    IF NOT FOUND THEN
      v_trigger_mode := 'contract_signed';
      v_default_warehouse_id := NULL;
    END IF;

    -- ── 2. Only 'contract_signed' deducts automatically ('manual' = só pela
    --      Saída para clientes; 'proposal_accepted' = antigo). ─────────────
    IF v_trigger_mode <> 'contract_signed' THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'mode', 'mode', v_trigger_mode);
    END IF;

    -- ── 3. Resolve the quote (NOVO 20261115080000): prefer the direct FK,
    --      fall back to the proposal's own quote when execute-workflow left
    --      quote_id NULL. No quote resolvable at all → nothing to deduct. ──
    v_resolved_quote_id := v_c.quote_id;
    IF v_resolved_quote_id IS NULL AND v_c.proposal_id IS NOT NULL THEN
      SELECT id INTO v_resolved_quote_id
      FROM public.quotes
      WHERE proposal_id = v_c.proposal_id
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    IF v_resolved_quote_id IS NULL THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'no_quote');
    END IF;

    -- ── 4. Resolve the warehouse: settings default, else exactly-one-active
    --      -warehouse fallback, else no movement at all (never guess). ─────
    v_resolved_warehouse := v_default_warehouse_id;

    IF v_resolved_warehouse IS NULL THEN
      SELECT count(*) INTO v_active_warehouse_cnt
      FROM public.warehouses
      WHERE organization_id = v_c.organization_id
        AND deleted_at IS NULL;

      IF v_active_warehouse_cnt = 1 THEN
        SELECT id INTO v_resolved_warehouse
        FROM public.warehouses
        WHERE organization_id = v_c.organization_id
          AND deleted_at IS NULL;
      ELSE
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', v_c.id, 'stock_movement', NULL,
          'trigger:contract_stock_deduction_no_warehouse', 'warning',
          jsonb_build_object(
            'reason', 'No default_warehouse_id configured and organization does not have exactly one active warehouse',
            'active_warehouse_count', v_active_warehouse_cnt
          )
        );
        RETURN jsonb_build_object('skipped', true, 'reason', 'no_warehouse');
      END IF;
    END IF;

    -- NOVO (20261204620000): número do documento de origem. Venda direta
    -- ANTES de manual (as de VD também têm is_manual_order): VD-…; encomenda
    -- manual: EC-…; contrato real: contract_number, como antes.
    v_document_number := COALESCE(
      (
        SELECT COALESCE(ds.sale_number, v_c.order_number, v_c.contract_number)
        FROM public.direct_sales ds
        WHERE ds.client_contract_id = v_c.id
        ORDER BY ds.created_at DESC
        LIMIT 1
      ),
      CASE WHEN COALESCE(v_c.is_manual_order, false)
           THEN COALESCE(v_c.order_number, v_c.contract_number)
      END,
      v_c.contract_number
    );

    -- ── NOVO (20261204630000): 4b. Trancar as linhas de stocks dos produtos
    --      com gestão de stock deste contrato, pela mesma ordem (produto,
    --      armazém) que rpc_confirm_client_order_stock_exit e
    --      fn_client_order_request_missing. Produto a produto, com
    --      lock_timeout 2s (SET na função): um timeout só afeta as linhas
    --      desse produto, que não descontam e ficam na fila. ──────────────
    SELECT array_agg(DISTINCT ql.product_id ORDER BY ql.product_id)
      INTO v_managed_products
    FROM public.quote_lines ql
    JOIN public.products p ON p.id = ql.product_id
    WHERE ql.quote_id = v_resolved_quote_id
      AND ql.product_id IS NOT NULL
      AND p.manages_stock = true;

    IF v_managed_products IS NOT NULL THEN
      FOREACH v_pid IN ARRAY v_managed_products LOOP
        BEGIN
          PERFORM 1
          FROM public.stocks s
          JOIN public.warehouses w ON w.id = s.warehouse_id
          WHERE s.product_id = v_pid
            AND w.organization_id = v_c.organization_id
          ORDER BY s.product_id, s.warehouse_id
          FOR UPDATE OF s;

          v_locked_products := v_locked_products || v_pid;
        EXCEPTION WHEN OTHERS THEN
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, error_message, execution_data
          ) VALUES (
            'contract', v_c.id, 'product', v_pid,
            'trigger:contract_stock_deduction_lock_timeout', 'warning', SQLERRM,
            jsonb_build_object('reason', 'lock_timeout', 'product_id', v_pid, 'sqlstate', SQLSTATE)
          );
        END;
      END LOOP;

      -- ── 4c. Reserva FIFO calculada uma vez, só para os produtos
      --        trancados. Chave: quote_line_id (linhas diretas,
      --        component_index NULL). ──────────────────────────────────────
      IF cardinality(v_locked_products) > 0 THEN
        SELECT jsonb_object_agg(r.quote_line_id::text, r.qty_reserved)
          INTO v_res_map
        FROM public.fn_client_order_line_reservations(v_c.organization_id, v_locked_products) r
        WHERE r.contract_id = v_c.id
          AND r.component_index IS NULL;
      END IF;
    END IF;

    -- ── 5. One sale stock movement per quote line whose product has
    --      manages_stock=true. A line with a fractional quantity is skipped
    --      with a warning log — it must never abort the remaining lines of
    --      the same contract. Likewise, any other unexpected failure on a
    --      single line (caught per-line below) never stops the loop. ──────
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
          'contract', v_c.id, 'quote_line', v_line.id,
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
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      v_qty_int := (v_line.qt * v_line.units_per_uom)::integer;

      -- NOVO (20261204630000): mesma idempotência de
      -- rpc_register_sale_stock_movement (qualquer 'venda' desta linha nesta
      -- origem, incluindo estornadas) testada antes do lock e da reserva.
      -- Conta como processada.
      IF EXISTS (
        SELECT 1 FROM public.stock_movements sm
        WHERE sm.sale_source_type = 'contract'
          AND sm.sale_source_id = v_c.id
          AND sm.reference_id = v_line.id
          AND sm.movement_type = 'venda'
      ) THEN
        v_lines_processed := v_lines_processed + 1;
        CONTINUE;
      END IF;

      -- NOVO (20261204630000): produto não trancado (lock_timeout) -> não
      -- desconta; a linha fica na fila.
      IF NOT (v_line.product_id = ANY (v_locked_products)) THEN
        v_lines_skipped := v_lines_skipped + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'lock_timeout', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      -- NOVO (20261204630000): desconto = LEAST(necessário, reservado para a
      -- linha, stock no armazém resolvido).
      v_reserved := COALESCE((v_res_map ->> v_line.id::text)::numeric, 0);

      v_wh_qty := NULL;
      SELECT s.quantity
        INTO v_wh_qty
      FROM public.stocks s
      JOIN public.warehouses w ON w.id = s.warehouse_id
      WHERE s.product_id = v_line.product_id
        AND s.warehouse_id = v_resolved_warehouse
        AND s.deleted_at IS NULL
        AND w.organization_id = v_c.organization_id
        AND w.deleted_at IS NULL;

      v_qty_deduct := LEAST(
        v_qty_int::numeric,
        floor(GREATEST(v_reserved, 0)),
        GREATEST(COALESCE(v_wh_qty, 0), 0)::numeric
      )::integer;

      IF v_qty_deduct <= 0 THEN
        v_lines_not_reserved := v_lines_not_reserved + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'skipped_not_reserved', 'qt', v_line.qt, 'product_id', v_line.product_id,
                             'qty_needed', v_qty_int, 'qty_reserved', v_reserved,
                             'warehouse_id', v_resolved_warehouse, 'warehouse_qty', v_wh_qty)
        );
        CONTINUE;
      END IF;

      -- Per-line guard: a failure registering one line's movement must never
      -- abort the remaining lines of the same contract.
      BEGIN
        v_result := public.rpc_register_sale_stock_movement(
          p_product_id        => v_line.product_id,
          p_warehouse_id       => v_resolved_warehouse,
          p_quantity           => v_qty_deduct,  -- NOVO (20261204630000): era v_qty_int
          p_quote_line_id      => v_line.id,
          p_sale_source_type   => 'contract',
          p_sale_source_id     => v_c.id,
          p_document_number    => v_document_number,  -- NOVO (20261204620000)
          p_unit_cost_at_time  => NULL,
          p_organization_id    => v_c.organization_id
        );

        v_lines_processed := v_lines_processed + 1;

        -- NOVO (20261204630000): desconto parcial — o resto passa a
        -- qty_missing e é pedido ao fornecedor por
        -- fn_client_order_request_missing.
        IF v_qty_deduct < v_qty_int
           AND NOT COALESCE((v_result ->> 'skipped')::boolean, false) THEN
          v_lines_partial := v_lines_partial + 1;
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, execution_data
          ) VALUES (
            'contract', v_c.id, 'stock_movement', (v_result ->> 'movement_id')::uuid,
            'trigger:contract_stock_deduction_partial', 'warning',
            jsonb_build_object('reason', 'partial', 'quote_line_id', v_line.id, 'product_id', v_line.product_id,
                               'qty_needed', v_qty_int, 'qty_deducted', v_qty_deduct,
                               'qty_reserved', v_reserved, 'warehouse_qty', v_wh_qty)
          );
        END IF;

        IF COALESCE((v_result ->> 'was_insufficient')::boolean, false) THEN
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, execution_data
          ) VALUES (
            'contract', v_c.id, 'stock_movement', (v_result ->> 'movement_id')::uuid,
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
          'contract', v_c.id, 'quote_line', v_line.id,
          'trigger:contract_stock_deduction_line_error', 'error', SQLERRM,
          jsonb_build_object('product_id', v_line.product_id, 'qt', v_line.qt)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'contract', v_c.id, 'stock_movement', NULL,
      'trigger:contract_stock_deduction', 'success',
      jsonb_build_object('lines_processed', v_lines_processed, 'lines_skipped', v_lines_skipped, 'warehouse_id', v_resolved_warehouse, 'resolved_quote_id', v_resolved_quote_id,
                         -- NOVO (20261204630000)
                         'lines_partial', v_lines_partial, 'lines_not_reserved', v_lines_not_reserved)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'contract', v_c.id, 'stock_movement', NULL,
        'trigger:contract_stock_deduction', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      -- Even the error-log insert must never propagate.
      NULL;
    END;
    RETURN jsonb_build_object('skipped', true, 'reason', 'error', 'error', SQLERRM);
  END;

  RETURN jsonb_build_object('skipped', false, 'lines_processed', v_lines_processed, 'lines_skipped', v_lines_skipped,
                            'lines_partial', v_lines_partial, 'lines_not_reserved', v_lines_not_reserved,
                            'warehouse_id', v_resolved_warehouse);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_contract_deduct_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_contract_deduct_stock(uuid) TO service_role;
COMMENT ON FUNCTION public.fn_contract_deduct_stock(uuid) IS
  '29/10: baixa de stock (venda) de uma encomenda de cliente assinada, limitada à reserva FIFO, idempotente por linha. Interna: gatilho trg_contract_stock_deduction e fn_neg_emitir_ec_se_pronta.';

-- ─── 2. fn_contract_stock_deduction (gatilho) ────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_contract_stock_deduction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET lock_timeout TO '2s'
AS $function$
DECLARE
  v_signed_aliases       text[] := ARRAY['signed', 'assinado'];
  v_trigger_mode         text;
  v_negocio              uuid;   -- 29/10
  v_r                    jsonb;  -- 29/10
BEGIN
  -- Only ever react to a transition into the signed stage — exact same gate
  -- as fn_contract_signed_convert_to_client() (20261113190000).
  IF NEW.status IS NULL OR NOT (NEW.status = ANY (v_signed_aliases)) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block the write to client_contracts.
  BEGIN
    -- 29/10: negócio da Emylia com a EC ainda por emitir (contrato ou adenda): antes da emissão a reserva é sempre 0, por isso não se
    -- tenta descontar aqui. Se a fatura e o pagamento já estiverem validados (contrato assinado depois deles), a EC emite-se já na
    -- assinatura: fn_neg_emitir_ec_se_pronta desconta e pede ao fornecedor conforme o modo. Sem pagamento devolve emitida=false.
    IF NOT public.fn_ec_emitida(NEW.id) THEN
      v_negocio := COALESCE(NEW.negocio_id, (SELECT ad.negocio_id FROM public.adendas ad WHERE ad.id = NEW.adenda_id));
      v_r := public.fn_neg_emitir_ec_se_pronta(v_negocio, public.current_business_user_id());
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', NEW.id, 'negocio', v_negocio,
        'trigger:contract_signed_emitir_ec', 'success', COALESCE(v_r, '{}'::jsonb)
      );
      RETURN NEW;
    END IF;

    -- ── 1. Organization inventory settings (default when the org has no row
    --      configured yet: 'contract_signed'). Só 'contract_signed' desconta
    --      na assinatura ('manual' = só pela Saída para clientes). ─────────
    SELECT stock_deduction_trigger
    INTO v_trigger_mode
    FROM public.organization_inventory_settings
    WHERE organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      v_trigger_mode := 'contract_signed';
    END IF;

    IF v_trigger_mode <> 'contract_signed' THEN
      RETURN NEW;
    END IF;

    -- 29/10: o corpo passou para fn_contract_deduct_stock (o mesmo que a emissão da EC usa)
    PERFORM public.fn_contract_deduct_stock(NEW.id);

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

-- ─── 3. fn_neg_emitir_ec_se_pronta ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_neg_emitir_ec_se_pronta(p_negocio uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_neg negocios; v_q quotes; v_c client_contracts; v_pago timestamptz; v_por text; v_autor uuid; v_nome text;
  v_nova boolean := false; v_ads jsonb := '[]'::jsonb; v_r jsonb; r record;
  v_modo text;  -- 29/10: modo de baixa de stock da organização
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_neg.anulado_em IS NOT NULL THEN
    RETURN jsonb_build_object('emitida', false, 'motivo', 'O negócio está anulado.');
  END IF;
  SELECT * INTO v_q FROM quotes WHERE negocio_id = p_negocio AND fluxo_emylia AND adenda_id IS NULL AND deleted_at IS NULL AND estado = 'aceite'
  ORDER BY versao DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('emitida', false, 'motivo', 'O negócio não tem orçamento aceite.');
  END IF;
  -- o pagamento validado da fatura da 1.ª prestação
  SELECT min(pg.validado_em) INTO v_pago
  FROM quote_prestacoes p
  JOIN faturas f ON f.quote_prestacao_id = p.id AND f.estado <> 'anulada'
  JOIN pagamentos pg ON pg.fatura_id = f.id AND pg.validado_em IS NOT NULL
  WHERE p.quote_id = v_q.id AND p.ordem = (SELECT min(p2.ordem) FROM quote_prestacoes p2 WHERE p2.quote_id = v_q.id);

  v_por := coalesce((SELECT coalesce(nullif(btrim(u.name), ''), u.email) FROM anew_users u WHERE u.id = p_user), 'Financeiro');
  v_autor := coalesce(p_user, v_q.created_by);
  SELECT * INTO v_c FROM client_contracts WHERE id = public.fn_neg_contrato_ec(p_negocio);

  -- 29/10: o modo de baixa de stock (sem linha = 'contract_signed', como os gatilhos do CRM). 'contract_signed': desconta da reserva
  -- FIFO e pede ao fornecedor o que falta; 'manual': nem desconta nem pede (só pela Saída para clientes); 'proposal_accepted' (antigo):
  -- só o pedido, como antes.
  SELECT s.stock_deduction_trigger INTO v_modo FROM organization_inventory_settings s WHERE s.organization_id = v_neg.organization_id;
  v_modo := coalesce(v_modo, 'contract_signed');

  IF v_pago IS NOT NULL AND v_c.id IS NULL AND v_q.venda_direta THEN
    -- venda direta: o contrato de suporte, como rpc_create_direct_sale_order (rascunho ligado ao orçamento aceite e promovido a assinado na
    -- mesma transação: os gatilhos AFTER UPDATE OF status reservam o stock e pedem ao fornecedor o que falta). Fica sem negócio (o CRM
    -- não liga contratos a um negócio que fecha na proposta nem a um negócio ganho) e já emitido (ec_emitida_em).
    -- 29/10: a baixa e o pedido ficam com esses gatilhos (respeitam o modo); não se chamam outra vez aqui.
    SELECT coalesce(nullif(btrim(e.fiscal_name), ''), e.display_name) INTO v_nome FROM anew_entities e WHERE e.id = v_neg.entity_id;
    INSERT INTO client_contracts (contract_number, entity_id, organization_id, root_organization_id, created_by, status, total_value, currency,
      start_date, notes, ec_emitida_em, ec_emitida_por)
    VALUES (NULL, v_neg.entity_id, v_neg.organization_id, coalesce(v_neg.root_organization_id, v_neg.organization_id), v_autor, 'draft',
      coalesce(v_q.total_com_iva, v_q.total, 0), 'EUR', current_date,
      'Encomenda de cliente da venda direta do negócio ' || coalesce(v_neg.numero::text, v_neg.id::text) || ' (Emylia: emitida ao validar o pagamento)',
      now(), v_por)
    RETURNING * INTO v_c;
    UPDATE client_contracts SET quote_id = v_q.id WHERE id = v_c.id;
    UPDATE client_contracts
       SET status = 'signed', signature_date = coalesce(v_q.accepted_at, now()), accepted_at = coalesce(v_q.accepted_at, now()),
           signed_by_name = coalesce(v_nome, 'Cliente'), status_changed_by = v_autor, status_changed_at = now()
     WHERE id = v_c.id
    RETURNING * INTO v_c;
    v_nova := true;
  ELSIF v_pago IS NOT NULL AND v_c.id IS NOT NULL AND v_c.ec_emitida_em IS NULL THEN
    UPDATE client_contracts SET ec_emitida_em = now(), ec_emitida_por = v_por WHERE id = v_c.id RETURNING * INTO v_c;
    v_nova := true;
    -- 29/10: o que há em stock serve-se já (reserva FIFO, movimento 'venda'; idempotente por linha, nunca falha)
    IF v_modo = 'contract_signed' THEN
      PERFORM public.fn_contract_deduct_stock(v_c.id);
    END IF;
    -- o que falta pede-se ao fornecedor (como o gatilho do CRM faz na assinatura, aqui na emissão); nunca faz falhar a validação
    IF v_modo <> 'manual' THEN  -- 29/10
    BEGIN
      v_r := public.fn_client_order_request_missing(v_c.id, v_autor, NULL);
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, execution_data)
      VALUES ('contract', v_c.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'success', coalesce(v_r, '{}'::jsonb));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, error_message, execution_data)
      VALUES ('contract', v_c.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'error', SQLERRM, jsonb_build_object('sqlstate', SQLSTATE));
    END;
    END IF;
  END IF;

  IF v_c.id IS NULL OR v_c.ec_emitida_em IS NULL THEN
    RETURN jsonb_build_object('emitida', false, 'motivo', CASE
      WHEN v_pago IS NULL THEN 'Falta a fatura registada e o pagamento validado da 1.ª prestação.'
      ELSE 'O contrato ainda não está assinado.' END);
  END IF;

  -- as adendas assinadas com a 1.ª parcela paga: a sua encomenda, depois da inicial (decisão B da Emylia)
  FOR r IN
    SELECT ca.id, a.referencia FROM adendas a JOIN client_contracts ca ON ca.adenda_id = a.id
    WHERE a.negocio_id = p_negocio AND ca.deleted_at IS NULL AND ca.replaced_by_contract_id IS NULL
      AND ca.status IN ('signed', 'assinado') AND ca.ec_emitida_em IS NULL
      AND EXISTS (SELECT 1 FROM quotes qa JOIN quote_prestacoes p ON p.quote_id = qa.id
                  JOIN faturas f ON f.quote_prestacao_id = p.id AND f.estado <> 'anulada'
                  JOIN pagamentos pg ON pg.fatura_id = f.id AND pg.validado_em IS NOT NULL
                  WHERE qa.adenda_id = a.id AND qa.deleted_at IS NULL AND p.ordem = 1)
    ORDER BY a.numero
  LOOP
    UPDATE client_contracts SET ec_emitida_em = now(), ec_emitida_por = v_por WHERE id = r.id;
    -- 29/10: a baixa da adenda, como a do contrato
    IF v_modo = 'contract_signed' THEN
      PERFORM public.fn_contract_deduct_stock(r.id);
    END IF;
    IF v_modo <> 'manual' THEN  -- 29/10
    BEGIN
      v_r := public.fn_client_order_request_missing(r.id, v_autor, NULL);
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, execution_data)
      VALUES ('contract', r.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'success', coalesce(v_r, '{}'::jsonb));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO workflow_execution_log (source_entity, source_record_id, target_entity, target_record_id, action_type, status, error_message, execution_data)
      VALUES ('contract', r.id, 'purchase_order', NULL, 'negocio:ec_emitida', 'error', SQLERRM, jsonb_build_object('sqlstate', SQLSTATE));
    END;
    END IF;
    v_ads := v_ads || jsonb_build_object('referencia', r.referencia, 'contract_id', r.id,
      'order_number', (SELECT order_number FROM client_contracts WHERE id = r.id));
  END LOOP;

  -- a encomenda emitida põe o negócio na Obra
  IF coalesce(v_neg.fase, 0) < 5 THEN
    UPDATE negocios SET fase = 5 WHERE id = p_negocio;
  END IF;

  RETURN jsonb_build_object('emitida', true, 'nova', v_nova, 'contract_id', v_c.id, 'order_number', v_c.order_number,
    'emitida_em', v_c.ec_emitida_em, 'adendas', v_ads);
END $function$;

-- ─── 4. rpc_upsert_inventory_settings: aceita 'manual' ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_upsert_inventory_settings(p_organization_id uuid, p_stock_deduction_trigger text, p_default_warehouse_id uuid)
 RETURNS organization_inventory_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_row   public.organization_inventory_settings;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar definições de inventário desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 29/10: 'manual' (só pela Saída para clientes) também é válido; NULL recusa-se
  IF p_stock_deduction_trigger IS NULL OR p_stock_deduction_trigger NOT IN ('contract_signed', 'proposal_accepted', 'manual') THEN
    RAISE EXCEPTION 'stock_deduction_trigger inválido: %', p_stock_deduction_trigger USING ERRCODE = 'check_violation';
  END IF;

  IF p_default_warehouse_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_default_warehouse_id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.organization_inventory_settings (
    organization_id, stock_deduction_trigger, default_warehouse_id, created_by
  ) VALUES (
    p_organization_id, p_stock_deduction_trigger, p_default_warehouse_id, v_actor
  )
  ON CONFLICT (organization_id) DO UPDATE
    SET stock_deduction_trigger = EXCLUDED.stock_deduction_trigger,
        default_warehouse_id    = EXCLUDED.default_warehouse_id,
        updated_at              = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- ─── 5. Dados: Nike volta a 'contract_signed' ────────────────────────────────────────────────────────────────────────────────────────
UPDATE public.organization_inventory_settings
   SET stock_deduction_trigger = 'contract_signed', updated_at = now()
 WHERE organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'
   AND stock_deduction_trigger = 'manual';

-- ─── Verificação ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $verifica$
BEGIN
  IF to_regprocedure('public.fn_contract_deduct_stock(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Verificação: fn_contract_deduct_stock não ficou criada';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_contract_deduct_stock(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_contract_deduct_stock(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Verificação: fn_contract_deduct_stock ficou aberta a anon/authenticated';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_contract_stock_deduction()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_neg_emitir_ec_se_pronta(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Verificação: as funções internas ficaram abertas a authenticated';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_upsert_inventory_settings(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Verificação: rpc_upsert_inventory_settings perdeu o grant a authenticated';
  END IF;
  IF pg_get_functiondef('public.fn_contract_stock_deduction()'::regprocedure) NOT LIKE '%fn_contract_deduct_stock(NEW.id)%'
     OR pg_get_functiondef('public.fn_neg_emitir_ec_se_pronta(uuid,uuid)'::regprocedure) NOT LIKE '%fn_contract_deduct_stock(v_c.id)%'
     OR pg_get_functiondef('public.rpc_upsert_inventory_settings(uuid,text,uuid)'::regprocedure) NOT LIKE '%''manual''%' THEN
    RAISE EXCEPTION 'Verificação: os corpos novos não ficaram';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_inventory_settings
             WHERE organization_id = 'b6ffce4f-f630-4933-833a-008649757a33' AND stock_deduction_trigger <> 'contract_signed') THEN
    RAISE EXCEPTION 'Verificação: Nike não ficou em contract_signed';
  END IF;
END $verifica$;
