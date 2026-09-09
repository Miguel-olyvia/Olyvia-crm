-- ============================================================
-- fn_contract_supplier_request() gerava sempre uma Encomenda ao Fornecedor
-- para todo o produto sem manages_stock ativo, sem nunca consultar a tabela
-- stocks — a maioria dos produtos não tem manages_stock ligado (confirmado
-- pelo utilizador: "o botão de ligado ao stock automático na maior parte
-- das vezes não vai acontecer"), por isso isto gerava encomendas
-- desnecessárias sempre que o produto já tinha stock físico parado no
-- armazém, só porque ninguém tinha ativado o toggle de dedução automática
-- nesse produto.
--
-- Reproduzido ao vivo: CC-2026-0254, produto "Bide Elegant BTW" (LSB0004,
-- manages_stock=false) — já havia 1 unidade em stocks ANTES da assinatura
-- do contrato. fn_contract_supplier_request() gerou PO-2026-0014 na mesma
-- (16:10:14), sem olhar ao stock. O utilizador deu saída manual desse stock
-- ligada ao contrato 1 minuto depois (16:11:24) — a linha em "Encomendas
-- Clientes" ficou corretamente "servido por stock" (20261120150000), mas a
-- encomenda ao fornecedor ficou parada, pendente, sem nunca ter sido
-- realmente necessária.
--
-- manages_stock controla só a DEDUÇÃO automática (Fase 5.0B) — não significa
-- que o produto nunca tem stock físico. Um produto pode ter unidades
-- paradas no armazém mesmo sem esse toggle ligado.
--
-- Correção: antes de resolver o fornecedor preferencial para uma linha,
-- soma-se o stock real do produto em todos os armazéns ativos da
-- organização (stocks.quantity, deleted_at IS NULL, armazém não apagado).
-- Se esse total já cobre a quantidade pedida na linha, a linha é ignorada
-- (mesmo tratamento que "sem quantidade válida" — log informativo, nunca
-- aborta as restantes linhas) e NENHUMA encomenda é gerada para esse
-- produto. Se o stock existente for insuficiente (parcial), a encomenda
-- continua a ser gerada para a quantidade total da linha — dividir a
-- encomenda em "o que falta" fica fora do âmbito deste pedido.
--
-- Não verifica QUAL armazém específico (ao contrário de
-- fn_contract_stock_deduction(), que resolve 1 armazém para deduzir) —
-- aqui só interessa "existe stock suficiente nalgum lado da organização
-- para não precisar de encomendar", não "de que armazém sai" (isso só
-- importa quando o profissional efetivamente regista a saída manual).
--
-- Mesma assinatura — CREATE OR REPLACE seguro.
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

    -- ── 5. Walk every quote line whose product does NOT manage stock (the
    --      majority — sold to order). Bundle-expanded lines (bundle_id set)
    --      are NOT excluded — same plan decision as Fase 5.0B: they are
    --      already real product lines. Validate quantity (null/not positive/
    --      fractional skipped with a warning, never aborts the rest); NOVO
    --      (20261120160000) — skip the line entirely, no PO at all, when
    --      existing stock across the org's active warehouses already covers
    --      the requested quantity (manages_stock=false only gates automatic
    --      deduction, it does not mean the product never has physical
    --      stock); resolve the preferred supplier per product (item_
    --      suppliers, is_preferred=true, deleted_at IS NULL — at most 1 row
    --      thanks to the partial unique index from Fase 1, LIMIT 1 as a
    --      defensive measure); accumulate eligible lines grouped by resolved
    --      supplier into a jsonb map (keyed by supplier_id::text) — avoids a
    --      temp table, safe to build incrementally inside a single trigger
    --      invocation. ─────────────────────────────────────────────────────
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

      -- NOVO (20261120160000): já existe stock físico suficiente? Soma-se
      -- em todos os armazéns ATIVOS da organização — não interessa qual
      -- especificamente, só se há o suficiente nalgum lado para não valer a
      -- pena encomendar. Cobertura parcial (stock &lt; pedido) ainda gera a
      -- encomenda pela quantidade total da linha, de propósito — dividir a
      -- encomenda pelo que falta fica fora do âmbito desta correção.
      SELECT COALESCE(SUM(s.quantity), 0) INTO v_available_stock
      FROM public.stocks s
      JOIN public.warehouses w ON w.id = s.warehouse_id
      WHERE s.product_id = v_line.product_id
        AND s.deleted_at IS NULL
        AND w.organization_id = NEW.organization_id
        AND w.deleted_at IS NULL;

      IF v_available_stock >= v_line.qt THEN
        v_lines_covered_by_stock := v_lines_covered_by_stock + 1;
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, execution_data
        ) VALUES (
          'contract', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:contract_po_request_covered_by_stock', 'info',
          jsonb_build_object('product_id', v_line.product_id, 'required_qty', v_line.qt, 'available_stock', v_available_stock)
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

COMMENT ON FUNCTION public.fn_contract_supplier_request() IS
  'Fase 5.0C (corrigida em 20261115080000, e em 20261120160000): resolve o '
  'orçamento via client_contracts.quote_id, com fallback para a quote mais '
  'recente de quotes.proposal_id quando quote_id está NULL. Gera 1 '
  'purchase_orders em rascunho por fornecedor preferencial distinto, '
  'agrupando as quote_lines com manages_stock=false, na transição para '
  'assinado — EXCETO linhas cujo stock real (somado em todos os armazéns '
  'ativos da organização) já cobre a quantidade pedida (20261120160000): '
  'manages_stock só controla a dedução automática, não significa que o '
  'produto nunca tem stock físico parado. Idempotente por (contrato, '
  'fornecedor). Best-effort.';
