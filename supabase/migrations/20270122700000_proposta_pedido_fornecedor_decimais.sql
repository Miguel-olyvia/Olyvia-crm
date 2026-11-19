-- Pedido ao fornecedor na proposta aceite (fn_proposal_supplier_request) deixa
-- de saltar quantidades decimais em unidades mensuráveis (m², ml, kg).
-- Alinha com 20270122600000_stock_quantidades_decimais (fluxo do contrato).
-- Base: definição viva do ramo RH (md5 13ac226f02ed1110e4983bd41db118d6).

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

      -- 20270122700000: só unidades contáveis exigem inteiro; em m²/ml/kg o
      -- ceil mais abaixo arredonda para cima o pedido ao fornecedor.
      IF public.fn_product_requires_integer_qty(v_line.product_id)
         AND v_base_qty <> floor(v_base_qty) THEN
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
