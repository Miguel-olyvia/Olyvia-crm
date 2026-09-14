-- ============================================================
-- Fase 5.0 — correção urgente: client_contracts.quote_id é NULL na maioria
-- dos contratos reais, mesmo quando a proposta tem um orçamento associado.
--
-- Achado ao testar a Fase 5.0B/5.0C num contrato real (CC-2026-0099, org
-- Mudelar): quote_id ficou NULL apesar de a proposta ter uma quote real
-- ligada via quotes.proposal_id (confirmado, total batia certo). Medido em
-- toda a BD: 80 de 91 contratos (88%) têm quote_id NULL; olhando só para
-- propostas que têm mesmo uma quote associada, 81 de 96 (84%) caem neste
-- gap.
--
-- Causa raiz (fora do âmbito do inventário, módulo de Contratos):
-- supabase/functions/execute-workflow/index.ts, ao criar o contrato
-- automaticamente na aceitação da proposta, só resolve quote_id através de
-- `pipeline_links.quote_id` (linha ~656) — e essa tabela intermédia quase
-- nunca fica preenchida quando o orçamento é criado normalmente a partir da
-- Proposta (só parece ficar preenchida quando o orçamento nasce a partir da
-- vista de Pipeline/Negócio). O caminho alternativo que preencheria
-- quote_id corretamente (hook usePipelineAutomation.createContractFromQuote)
-- está morto — importado em src/pages/Quotes.tsx mas nunca chamado.
--
-- Correção adotada aqui (âmbito contido, decisão do utilizador dado o prazo
-- de teste): em vez de corrigir a origem (execute-workflow, fora do
-- inventário, exigiria testar/reimplantar um edge function partilhado),
-- as duas triggers da Fase 5.0B/5.0C passam a resolver o orçamento de forma
-- resiliente — usam client_contracts.quote_id quando presente, e caem para
-- a quote mais recente de quotes.proposal_id quando não está. Isto cobre
-- tanto contratos novos como os já assinados no passado com este gap (a
-- trigger só corre de novo numa transição real de estado, mas o efeito é o
-- mesmo independentemente de quando o contrato foi criado).
--
-- Não resolve a causa raiz em execute-workflow (fica por corrigir, também
-- afeta o cálculo de contractValue nalguns casos) — decisão explícita do
-- utilizador, por rapidez e por ficar contido ao módulo de Inventário.
--
-- Único código alterado: a resolução da quote dentro de
-- fn_contract_stock_deduction() e fn_contract_supplier_request() (variável
-- nova v_resolved_quote_id em cada uma). Resto do corpo de cada função
-- inalterado — mesma assinatura, mesmos triggers já criados em
-- 20261115060000/20261115070000, sem overload novo.
-- ============================================================


-- ============================================================
-- 1. fn_contract_stock_deduction() — resolve v_resolved_quote_id em vez de
--    usar NEW.quote_id diretamente.
-- ============================================================

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
      SELECT ql.id, ql.product_id, ql.qt
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

      IF v_line.qt <> floor(v_line.qt) THEN
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

      v_qty_int := v_line.qt::integer;

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

COMMENT ON FUNCTION public.fn_contract_stock_deduction() IS
  'Fase 5.0B (corrigida em 20261115080000): resolve o orçamento via '
  'client_contracts.quote_id, com fallback para a quote mais recente de '
  'quotes.proposal_id quando quote_id está NULL (gap confirmado em 84% dos '
  'contratos reais com orçamento associado — ver cabeçalho da migration '
  '20261115080000). Gera 1 stock_movement tipo venda por quote_line com '
  'produto manages_stock=true, na transição para assinado, quando '
  'organization_inventory_settings.stock_deduction_trigger=contract_signed '
  '(omissão). Nunca bloqueia por saldo insuficiente. Best-effort.';


-- ============================================================
-- 2. fn_contract_supplier_request() — mesma correção de resolução de quote.
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
  -- Only ever react to a transition into the signed stage — exact same gate
  -- as fn_contract_signed_convert_to_client() / fn_contract_stock_deduction()
  -- (replicated on purpose, not a new style).
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
    --      configured yet: 'contract_signed'). ───────────────────────────────
    SELECT stock_deduction_trigger INTO v_trigger_mode
    FROM public.organization_inventory_settings
    WHERE organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      v_trigger_mode := 'contract_signed';
    END IF;

    -- ── 2. This organization chose "act on proposal acceptance" instead —
    --      that is a future phase, not implemented yet. Do nothing here. ────
    IF v_trigger_mode <> 'contract_signed' THEN
      RETURN NEW;
    END IF;

    -- ── 3. Resolve the quote (NOVO 20261115080000) — mesmo fallback de
    --      fn_contract_stock_deduction(), ver cabeçalho da migration
    --      20261115080000. ────────────────────────────────────────────────
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

    -- ── 4. Resolve the actor once for the whole contract (quote_id is fixed
    --      per contract) — same fallback pattern as rpc_register_sale_stock_
    --      movement: current_business_user_id() first, else the quote's own
    --      creator (NOT NULL), covering signature via the client portal
    --      (no staff session present). ───────────────────────────────────────
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
    --      fractional skipped with a warning, never aborts the rest);
    --      resolve the preferred supplier per product (item_suppliers,
    --      is_preferred=true, deleted_at IS NULL — at most 1 row thanks to
    --      the partial unique index from Fase 1, LIMIT 1 as a defensive
    --      measure); accumulate eligible lines grouped by resolved supplier
    --      into a jsonb map (keyed by supplier_id::text) — avoids a temp
    --      table, safe to build incrementally inside a single trigger
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

      -- Per-supplier guard: a failure creating one supplier's PO must never
      -- abort the remaining suppliers of the same contract.
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
      -- Even the error-log insert must never propagate.
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_contract_supplier_request() IS
  'Fase 5.0C (corrigida em 20261115080000): resolve o orçamento via '
  'client_contracts.quote_id, com fallback para a quote mais recente de '
  'quotes.proposal_id quando quote_id está NULL (mesmo gap documentado em '
  'fn_contract_stock_deduction(), ver cabeçalho da migration '
  '20261115080000). Gera 1 purchase_orders em rascunho por fornecedor '
  'preferencial distinto, agrupando as quote_lines com manages_stock=false, '
  'na transição para assinado. Idempotente por (contrato, fornecedor). '
  'Best-effort.';
