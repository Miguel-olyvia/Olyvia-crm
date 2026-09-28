-- ============================================================
-- Fase 5.0C — correção: unit_price da Encomenda gerada automaticamente
-- ficava a 0,00 quando o fornecedor preferencial (item_suppliers) não tem
-- purchase_price definido. Achado ao testar (PO-2026-0005, produto "Base de
-- Duche MIO 70x100" — DUPLACH GROUP S.A.U não tinha preço de compra
-- registado nesse item_suppliers, apesar de o próprio produto ter um preço
-- de compra em product_prices, price_type='purchase' — 92,25).
--
-- Correção: se item_suppliers.purchase_price for NULL, cai para o preço de
-- compra do produto (product_prices, price_type='purchase', o mais recente
-- por valid_from). Se também não existir, mantém-se o comportamento
-- anterior (0 — nunca bloqueia a criação da Encomenda por falta de preço).
--
-- Único código alterado: a resolução de v_purchase_price dentro de
-- fn_contract_supplier_request(). Resto do corpo inalterado.
-- ============================================================

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
  v_purchase_orders_created integer := 0;
  v_suppliers_skipped_idempotent integer := 0;
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

    FOR v_line IN
      SELECT ql.id AS quote_line_id, ql.product_id, ql.qt,
             p.name AS product_name, p.sku AS product_sku
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
          'contract', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:contract_po_request_line_skipped', 'warning',
          jsonb_build_object('reason', 'quantity_null_or_not_positive', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      IF v_line.qt <> floor(v_line.qt) THEN
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

      SELECT supplier_id, purchase_price INTO v_supplier_id, v_purchase_price
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

      -- NOVO (20261115090000): item_suppliers.purchase_price nem sempre está
      -- preenchido (confirmado ao vivo) — cai para o preço de compra do
      -- próprio produto antes de aceitar 0,00.
      IF v_purchase_price IS NULL THEN
        SELECT price INTO v_purchase_price
        FROM public.product_prices
        WHERE product_id = v_line.product_id AND price_type = 'purchase'
        ORDER BY valid_from DESC NULLS LAST
        LIMIT 1;
      END IF;

      v_qty_int := v_line.qt::integer;
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
            'unit_price',     v_purchase_price
          )
        )
      );
    END LOOP;

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
            quantity, unit_price, total_price
          ) VALUES (
            v_po_id, 'product', (v_po_item ->> 'product_id')::uuid,
            v_po_item ->> 'product_name', v_po_item ->> 'product_sku',
            (v_po_item ->> 'quantity')::numeric, v_unit_price, v_line_total
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

COMMENT ON FUNCTION public.fn_contract_supplier_request() IS
  'Fase 5.0C (corrigida em 20261115090000): unit_price da Encomenda gerada '
  'usa item_suppliers.purchase_price quando definido, senão cai para '
  'product_prices.price_type=''purchase'' do próprio produto, senão 0 — '
  'nunca bloqueia a criação da Encomenda por falta de preço. Resto do '
  'comportamento igual a 20261115080000 (resolução de quote_id com '
  'fallback via proposal_id).';
