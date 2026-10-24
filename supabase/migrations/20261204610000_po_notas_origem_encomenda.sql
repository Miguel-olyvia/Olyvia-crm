-- ─────────────────────────────────────────────────────────────────────────────
-- Pedidos a fornecedor: notas com a origem certa (venda direta / Encomenda Cliente)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- fn_client_order_request_missing escrevia sempre
--   'Gerada automaticamente a partir do contrato <contract_number>'
-- mas client_contracts também tem contratos sintéticos (is_manual_order=true):
-- Encomendas de Cliente manuais e as geradas por Venda Direta. Nesses casos o
-- número do contrato (CC-...) não diz nada ao utilizador.
--
-- Agora:
--   * venda direta (existe direct_sales com client_contract_id = contrato,
--     sem filtro de deleted_at, como rpc_list_client_order_documents):
--       'Gerada automaticamente a partir da venda direta VD-... (Encomenda Cliente EC-...)'
--       (sem o parêntese se order_number for NULL);
--   * senão, is_manual_order=true:
--       'Gerada automaticamente a partir da Encomenda Cliente EC-...'
--       (COALESCE(order_number, contract_number));
--   * senão: texto antigo, sem mudança.
--
-- Parte-se EXATAMENTE da definição viva (pg_get_functiondef em 2026-09-29).
-- Só muda a expressão das notas no INSERT de purchase_orders. Owner, SECURITY
-- DEFINER, search_path, lock_timeout e grants mantêm-se (CREATE OR REPLACE
-- preserva owner e ACL; reafirmam-se abaixo por segurança).
--
-- Backfill: só pedidos de contratos sintéticos cuja nota é EXATAMENTE o texto
-- automático antigo (notas editadas à mão não são tocadas).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_client_order_request_missing(p_contract_id uuid, p_actor uuid, p_quote_line_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '2s'
AS $function$
DECLARE
  v_signed_aliases      text[] := ARRAY['signed', 'assinado'];
  v_org                 uuid;
  v_status              text;
  v_contract_number     text;
  v_quote_id            uuid;
  v_products            uuid[];
  v_line                record;
  v_supplier_id         uuid;
  v_purchase_price      numeric;
  v_link_uom            uuid;
  v_link_sku            text;
  v_link_units          integer;
  v_qty_int             integer;
  v_unit_price          numeric;
  v_po_id               uuid;
  v_po_is_new           boolean;
  v_touched_pos         uuid[] := ARRAY[]::uuid[];
  v_pos_created         integer := 0;
  v_items_created       integer := 0;
  v_skipped_no_supplier integer := 0;
  v_skipped_other       integer := 0;
  v_errors              integer := 0;
BEGIN
  IF p_contract_id IS NULL OR p_actor IS NULL THEN
    RAISE EXCEPTION 'contract_id e autor são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    cc.organization_id, cc.status, cc.contract_number,
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
  INTO v_org, v_status, v_contract_number, v_quote_id
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status IS NULL OR NOT (v_status = ANY (v_signed_aliases)) OR v_quote_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'purchase_orders_created', 0,
      'items_created', 0,
      'skipped_no_supplier', 0,
      'skipped_other', 0,
      'errors', 0,
      'reason', CASE WHEN v_quote_id IS NULL THEN 'no_quote' ELSE 'not_signed' END
    );
  END IF;

  -- Serializa pedidos concorrentes da mesma encomenda.
  PERFORM pg_advisory_xact_lock(hashtextextended('fn_client_order_request_missing:' || p_contract_id::text, 0));

  SELECT array_agg(DISTINCT t.pid ORDER BY t.pid)
    INTO v_products
  FROM (
    SELECT ql.product_id AS pid
    FROM public.quote_lines ql
    WHERE ql.quote_id = v_quote_id
      AND ql.product_id IS NOT NULL
    UNION
    SELECT (comp.value ->> 'source_id')::uuid
    FROM public.quote_lines ql
    CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
    WHERE ql.quote_id = v_quote_id
      AND ql.bundle_id IS NOT NULL
      AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
      AND comp.value ->> 'type' = 'product'
      AND comp.value ->> 'source_id' IS NOT NULL
  ) t;

  IF v_products IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'purchase_orders_created', 0,
      'items_created', 0,
      'skipped_no_supplier', 0,
      'skipped_other', 0,
      'errors', 0
    );
  END IF;

  -- Mesmo lock que rpc_confirm_client_order_stock_exit (ordem fixa).
  PERFORM 1
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = ANY (v_products)
    AND w.organization_id = v_org
  ORDER BY s.product_id, s.warehouse_id
  FOR UPDATE OF s;

  FOR v_line IN
    SELECT r.quote_line_id, r.component_index, r.product_id,
           r.qty_needed, r.qty_missing,
           p.name AS product_name, p.sku AS product_sku
    FROM public.fn_client_order_line_reservations(v_org, v_products) r
    JOIN public.products p ON p.id = r.product_id
    WHERE r.contract_id = p_contract_id
      AND r.qty_missing > 0
      AND (p_quote_line_ids IS NULL OR r.quote_line_id = ANY (p_quote_line_ids))
    ORDER BY r.quote_line_id, r.component_index NULLS FIRST
  LOOP
    -- Paridade com o gatilho antigo: quantidade vendida fracionária em
    -- unidades de stock é saltada com aviso.
    IF v_line.qty_needed <> floor(v_line.qty_needed) THEN
      v_skipped_other := v_skipped_other + 1;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', p_contract_id, 'quote_line', v_line.quote_line_id,
        'trigger:contract_po_request_line_skipped', 'warning',
        jsonb_build_object('reason', 'fractional_quantity', 'qty_needed', v_line.qty_needed,
                           'product_id', v_line.product_id, 'component_index', v_line.component_index)
      );
      CONTINUE;
    END IF;

    v_supplier_id := NULL; v_purchase_price := NULL; v_link_uom := NULL; v_link_sku := NULL;

    SELECT supplier_id, purchase_price, uom_id, supplier_sku
      INTO v_supplier_id, v_purchase_price, v_link_uom, v_link_sku
    FROM public.item_suppliers
    WHERE product_id = v_line.product_id
      AND is_preferred = true
      AND deleted_at IS NULL
      -- NOVO (20261204340000): só ligações ativas e da organização do
      -- contrato (is_active e organization_id são NOT NULL). Mesmo critério
      -- que has_preferred_supplier em rpc_get_client_order_document.
      AND is_active = true
      AND organization_id = v_org
    LIMIT 1;

    IF v_supplier_id IS NULL THEN
      v_skipped_no_supplier := v_skipped_no_supplier + 1;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', p_contract_id, 'quote_line', v_line.quote_line_id,
        'trigger:contract_po_request_no_supplier', 'warning',
        jsonb_build_object('reason', 'no_preferred_supplier', 'product_id', v_line.product_id,
                           'component_index', v_line.component_index, 'qty_missing', v_line.qty_missing)
      );
      CONTINUE;
    END IF;

    BEGIN
      v_link_units := public.fn_uom_units_per(v_link_uom, v_line.product_id);
    EXCEPTION WHEN OTHERS THEN
      v_link_units := NULL;
    END;

    IF v_link_units IS NULL OR v_link_units < 1 THEN
      v_skipped_other := v_skipped_other + 1;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', p_contract_id, 'quote_line', v_line.quote_line_id,
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
      IF v_link_units <> 1 THEN
        v_purchase_price := v_purchase_price * v_link_units;
      END IF;
    END IF;

    v_unit_price := COALESCE(v_purchase_price, 0);
    -- Unidades em falta -> unidade da ligação, arredondando para cima.
    v_qty_int := ceil(v_line.qty_missing / v_link_units)::integer;

    BEGIN
      v_po_id := NULL;

      SELECT po.id INTO v_po_id
      FROM public.purchase_orders po
      WHERE po.source_type = 'contract'
        AND po.source_id = p_contract_id
        AND po.supplier_id = v_supplier_id
        AND po.status = 'pending'
        AND po.deleted_at IS NULL
      ORDER BY po.created_at DESC
      LIMIT 1
      FOR UPDATE;

      v_po_is_new := v_po_id IS NULL;

      IF v_po_is_new THEN
        INSERT INTO public.purchase_orders (
          organization_id, supplier_id, order_date, status,
          source_type, source_id, notes, created_by
        ) VALUES (
          v_org, v_supplier_id, now()::date, 'pending',
          'contract', p_contract_id,
          -- NOVO (20261204610000): a origem certa nos contratos sintéticos.
          -- Venda direta ANTES de manual (as de VD também têm is_manual_order).
          COALESCE(
            (
              SELECT CASE
                       WHEN cc.order_number IS NOT NULL THEN
                         format('Gerada automaticamente a partir da venda direta %s (Encomenda Cliente %s)',
                                COALESCE(ds.sale_number, ds.id::text), cc.order_number)
                       ELSE
                         format('Gerada automaticamente a partir da venda direta %s',
                                COALESCE(ds.sale_number, ds.id::text))
                     END
              FROM public.direct_sales ds
              JOIN public.client_contracts cc ON cc.id = ds.client_contract_id
              WHERE ds.client_contract_id = p_contract_id
              ORDER BY ds.created_at DESC
              LIMIT 1
            ),
            (
              SELECT format('Gerada automaticamente a partir da Encomenda Cliente %s',
                            COALESCE(cc.order_number, cc.contract_number, p_contract_id::text))
              FROM public.client_contracts cc
              WHERE cc.id = p_contract_id
                AND cc.is_manual_order = true
            ),
            format('Gerada automaticamente a partir do contrato %s', COALESCE(v_contract_number, p_contract_id::text))
          ),
          p_actor
        )
        RETURNING id INTO v_po_id;
      END IF;

      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, description, sku,
        quantity, unit_price, total_price,
        uom_id, supplier_sku,          -- units_per_uom pelo gatilho
        quote_line_id, component_index -- NOVO: pertence à linha que o gerou
      ) VALUES (
        v_po_id, 'product', v_line.product_id,
        v_line.product_name, v_line.product_sku,
        v_qty_int, v_unit_price, v_unit_price * v_qty_int,
        v_link_uom, nullif(v_link_sku, ''),
        v_line.quote_line_id, v_line.component_index
      );

      IF v_po_is_new THEN
        v_pos_created := v_pos_created + 1;
      END IF;
      v_items_created := v_items_created + 1;
      IF NOT (v_po_id = ANY (v_touched_pos)) THEN
        v_touched_pos := v_touched_pos || v_po_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message, execution_data
      ) VALUES (
        'contract', p_contract_id, 'quote_line', v_line.quote_line_id,
        'trigger:contract_po_request_supplier_error', 'error', SQLERRM,
        jsonb_build_object('supplier_id', v_supplier_id, 'product_id', v_line.product_id,
                           'component_index', v_line.component_index)
      );
    END;
  END LOOP;

  IF cardinality(v_touched_pos) > 0 THEN
    UPDATE public.purchase_orders po
       SET total_value = (
             SELECT COALESCE(SUM(poi.total_price), 0)
             FROM public.purchase_order_items poi
             WHERE poi.purchase_order_id = po.id
           )
     WHERE po.id = ANY (v_touched_pos);
  END IF;

  INSERT INTO public.workflow_execution_log (
    source_entity, source_record_id, target_entity, target_record_id,
    action_type, status, execution_data
  ) VALUES (
    'contract', p_contract_id, 'purchase_order', NULL,
    'fn:client_order_request_missing', 'success',
    jsonb_build_object(
      'purchase_orders_created', v_pos_created,
      'items_created', v_items_created,
      'skipped_no_supplier', v_skipped_no_supplier,
      'skipped_other', v_skipped_other,
      'errors', v_errors,
      'quote_line_ids', to_jsonb(p_quote_line_ids),
      'resolved_quote_id', v_quote_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_orders_created', v_pos_created,
    'items_created', v_items_created,
    'skipped_no_supplier', v_skipped_no_supplier,
    'skipped_other', v_skipped_other,
    'errors', v_errors
  );
END;
$function$
;

ALTER FUNCTION public.fn_client_order_request_missing(uuid, uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_client_order_request_missing(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_client_order_request_missing(uuid, uuid, uuid[]) TO service_role;

-- ── Backfill ────────────────────────────────────────────────────────────────
WITH alvo AS (
  SELECT
    po.id,
    CASE
      WHEN ds.client_contract_id IS NOT NULL THEN
        CASE
          WHEN cc.order_number IS NOT NULL THEN
            format('Gerada automaticamente a partir da venda direta %s (Encomenda Cliente %s)',
                   COALESCE(ds.sale_number, ds.id::text), cc.order_number)
          ELSE
            format('Gerada automaticamente a partir da venda direta %s',
                   COALESCE(ds.sale_number, ds.id::text))
        END
      ELSE
        format('Gerada automaticamente a partir da Encomenda Cliente %s',
               COALESCE(cc.order_number, cc.contract_number, cc.id::text))
    END AS nova_nota
  FROM public.purchase_orders po
  JOIN public.client_contracts cc ON cc.id = po.source_id
  LEFT JOIN LATERAL (
    SELECT d.id, d.sale_number, d.client_contract_id
    FROM public.direct_sales d
    WHERE d.client_contract_id = cc.id
    ORDER BY d.created_at DESC
    LIMIT 1
  ) ds ON true
  WHERE po.source_type = 'contract'
    AND cc.is_manual_order = true
    AND po.notes = format('Gerada automaticamente a partir do contrato %s', cc.contract_number)
)
UPDATE public.purchase_orders po
   SET notes = alvo.nova_nota
  FROM alvo
 WHERE po.id = alvo.id
   AND po.notes IS DISTINCT FROM alvo.nova_nota;
