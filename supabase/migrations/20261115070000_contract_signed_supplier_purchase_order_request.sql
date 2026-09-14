-- ============================================================
-- Fase 5.0C do plano de inventário (plano-fornecedores-multi-stock-execucao.md,
-- secção "Fase 5.0 — Venda a stock fixo"): "Venda a stock fixo" cobriu o
-- caso dos produtos com manages_stock=true (baixa de stock, Fase 5.0A/5.0B).
-- Esta migration cobre o caso oposto — a MAIORIA dos produtos deste projeto,
-- vendidos por encomenda (manages_stock=false): quando um Contrato é
-- assinado, cada linha de orçamento desse tipo gera automaticamente uma
-- Encomenda de Compra em RASCUNHO ('pending') ao fornecedor preferencial do
-- produto, para aprovação humana posterior (mesmo fluxo .approve/.receive
-- já existente em Encomendas desde a Fase 4E) — nunca uma encomenda real ao
-- fornecedor sem intervenção humana.
--
-- Decisões de negócio já confirmadas pelo utilizador (não repetidas aqui em
-- detalhe, ver o pedido original):
--   1. O pedido ao fornecedor é sempre uma Encomenda em rascunho/pendente.
--   2. Gera-se SEMPRE que se vende um produto manages_stock=false,
--      independentemente de já haver stock informativo — não se verifica
--      stock antes de decidir.
--   3. Acontece no mesmo momento que a Fase 5.0B (por omissão, ao assinar o
--      Contrato — respeita organization_inventory_settings.
--      stock_deduction_trigger, exatamente como 5.0B).
--
-- Modelo de dados
-- ----------------
--   purchase_orders ganha 2 colunas de rastreabilidade/idempotência —
--   source_type/source_id — no mesmo espírito não-FK-rígida de
--   stock_movements.sale_source_type/sale_source_id (20261115040000):
--   polimórfico (aponta para client_contracts.id hoje; proposals.id quando a
--   Fase 5.0C-para-propostas avançar), sem FK rígida possível para uma única
--   tabela.
--
-- Porquê 2 triggers NOVAS e independentes das já existentes em
-- client_contracts (conversão a cliente, dedução de stock, reversão de
-- stock — Fase 5.0B, migration 20261115060000)
-- -----------------------------------------------------------------------
-- Mesmo raciocínio já documentado em 20261115060000: cada trigger é uma
-- responsabilidade de negócio distinta (CRM vs. Inventário-baixa vs.
-- Inventário-pedido-a-fornecedor) que só coincide por disparar no mesmo
-- evento (UPDATE OF status). Com triggers independentes, a pior falha
-- possível numa delas é essa trigger não fazer nada — nunca arrasta as
-- outras. fn_contract_supplier_request() (geração) e
-- fn_contract_cancelled_supplier_request_reversal() (estorno) são, elas
-- próprias, duas responsabilidades distintas sobre transições de status
-- diferentes, mantidas separadas pelo mesmo motivo que fn_contract_stock_
-- deduction()/fn_contract_cancelled_stock_reversal() já são duas funções —
-- e para que cada uma tenha a sua guarda de transição isolada.
--
-- Agrupamento por fornecedor — 1 só Encomenda por fornecedor por contrato
-- -----------------------------------------------------------------------
-- Um contrato pode ter várias linhas manages_stock=false cujo fornecedor
-- preferencial resolvido seja o mesmo — gera-se 1 só purchase_orders para
-- esse fornecedor, com 1 purchase_order_items por linha (não 1 Encomenda por
-- linha). Idempotência por (source_type='contract', source_id=<contrato>,
-- supplier_id=<fornecedor>): reassinar o mesmo contrato (ex. um UPDATE que
-- toca noutras colunas além de status, ou uma trigger que dispare 2x pelo
-- mesmo evento de negócio) nunca duplica a Encomenda já criada para esse
-- par contrato/fornecedor.
--
-- Linha sem fornecedor preferencial — nunca inventa, nunca aborta o resto
-- -----------------------------------------------------------------------
-- Uma linha cujo produto não tem fornecedor preferencial ativo em
-- item_suppliers é saltada (sem Encomenda gerada para essa linha) com aviso
-- em workflow_execution_log — nunca aborta as restantes linhas do mesmo
-- contrato, nem as linhas de outros fornecedores. Mesma postura para
-- quantidade nula/não positiva/fracionária (quote_lines.qt é numeric;
-- purchase_order_items.quantity aceita numeric(10,2), mas o stock só regista
-- unidades inteiras — mesma validação já usada em fn_contract_stock_
-- deduction e em rpc_receive_purchase_order_lines, replicada aqui por
-- consistência, ainda que este caminho não escreva em stock_movements).
--
-- unit_price — fallback documentado
-- -----------------------------------------------------------------------
-- item_suppliers.purchase_price é nullable (o par produto/fornecedor pode
-- nunca ter tido preço de compra registado). purchase_order_items.unit_price
-- é NOT NULL DEFAULT 0 — usa-se COALESCE(purchase_price, 0) em vez de
-- rejeitar a linha: uma Encomenda em rascunho com preço 0 é corrigível por
-- quem a aprovar (o mesmo fluxo humano de aprovação já exigido pela decisão
-- de negócio 1); abortar a linha por falta de preço seria pior (perderia o
-- pedido ao fornecedor por completo).
--
-- total_value — enriquecimento de baixo risco além do pedido literal
-- -----------------------------------------------------------------------
-- O pedido não menciona purchase_orders.total_value. Preenchê-lo (SUM
-- quantity*unit_price das linhas inseridas) evita uma Encomenda em rascunho
-- a mostrar "0,00" na listagem quando na realidade tem itens com preço —
-- mesmo cálculo trivial que rpc_update_purchase_order faz a partir do que o
-- frontend envia. Não interfere com nenhum fluxo existente (total_value
-- continua editável depois via rpc_update_purchase_order).
--
-- order_number — confirmado automático, não preenchido aqui
-- -----------------------------------------------------------------------
-- purchase_orders já tem uma trigger BEFORE INSERT (trigger_set_po_number →
-- set_po_number() → generate_po_number(p_organization_id), corrigida para
-- ser por organização em 20261110310000) que preenche order_number quando
-- NULL/''. Esta migration deixa order_number de fora do INSERT
-- explicitamente (fica NULL) — a trigger resolve sozinha, mesmo padrão já
-- confirmado em uso real por rpc_receive_purchase_order/rpc_import_
-- purchase_orders_csv.
--
-- created_by — mesmo padrão de fallback já usado em rpc_register_sale_
-- stock_movement (20261115040000/060000): current_business_user_id()
-- primeiro; se NULL (pode disparar sem staff presente, ex. assinatura pelo
-- portal do cliente), cai para quotes.created_by (NOT NULL) via
-- NEW.quote_id — resolvido UMA vez para o contrato inteiro (quote_id é fixo
-- por contrato), não por linha.
--
-- Reversão simétrica — só cancela rascunhos ainda não aprovados
-- -----------------------------------------------------------------------
-- fn_contract_cancelled_supplier_request_reversal() reage a status IN
-- ('cancelled','rejected') — mesmo par de aliases e mesmo motivo já
-- documentado em 20261115060000 (client-portal-action/reject_contract não
-- valida no servidor que o contrato já não foi assinado). Para cada
-- purchase_orders gerada a partir deste contrato: se ainda 'pending' (ninguém
-- agiu sobre ela), cancela-se automaticamente (UPDATE direto, não via
-- rpc_update_purchase_order — esta trigger corre em contexto de sistema
-- SECURITY DEFINER, e rpc_update_purchase_order faz DELETE+INSERT de itens,
-- que aqui seria destrutivo sem necessidade; confirmado que não há nenhuma
-- trigger própria de purchase_orders que rejeite um UPDATE direto de status
-- — só update_purchase_orders_updated_at e o audit trigger, nenhum dos dois
-- bloqueia). Se já estiver em qualquer outro estado ('ordered', 'received',
-- 'partially_received', ou já 'cancelled') — alguém já agiu sobre ela (ou já
-- estava cancelada) — NÃO se mexe, só se regista aviso em
-- workflow_execution_log.
--
-- Prerequisitos: 20261112110000 (item_suppliers), 20261113190000 (padrão de
-- trigger best-effort replicado aqui), 20261115040000/20261115060000
-- (fn_contract_stock_deduction/fn_contract_cancelled_stock_reversal — padrão
-- irmão desta migration, mesma filosofia BEGIN/EXCEPTION), 20261110310000
-- (order_number automático por organização), 20261114040000 (schema atual
-- de purchase_order_items, incluindo received_quantity).
-- ============================================================


-- ============================================================
-- 1. purchase_orders: source_type/source_id (rastreabilidade + idempotência)
-- ============================================================

ALTER TABLE public.purchase_orders
  ADD COLUMN source_type text CHECK (source_type IN ('contract','proposal')),
  ADD COLUMN source_id uuid;

COMMENT ON COLUMN public.purchase_orders.source_type IS
  'Fase 5.0C: só preenchido quando esta Encomenda foi gerada automaticamente '
  'a partir de uma venda de produto por encomenda (manages_stock=false). '
  '''contract'' hoje (Contrato assinado); ''proposal'' reservado para quando a '
  'Fase 5.0C-para-propostas for implementada.';
COMMENT ON COLUMN public.purchase_orders.source_id IS
  'Fase 5.0C: id de client_contracts (ou, futuramente, de proposals) que deu '
  'origem a esta Encomenda — sem foreign key rígida de propósito (polimórfico, '
  'mesmo espírito de stock_movements.sale_source_id). Usado com source_type + '
  'supplier_id para idempotência (1 só Encomenda por par contrato/fornecedor) '
  'e por fn_contract_cancelled_supplier_request_reversal() para localizar as '
  'Encomendas a cancelar quando o contrato é anulado.';

CREATE INDEX idx_purchase_orders_source
  ON public.purchase_orders (source_type, source_id)
  WHERE source_id IS NOT NULL;


-- ============================================================
-- 2. fn_contract_supplier_request() / trg_contract_supplier_request —
--    AFTER UPDATE OF status ON client_contracts. Gera 1 Encomenda em
--    rascunho por fornecedor preferencial distinto, agrupando as linhas de
--    quote_lines com manages_stock=false. Independente de fn_contract_
--    signed_convert_to_client (CRM), fn_contract_stock_deduction e
--    fn_contract_cancelled_stock_reversal (Fase 5.0B) — nenhuma falha nesta
--    trigger afeta as outras, e vice-versa.
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

    -- ── 3. No quote attached to this contract — nothing to request. ───────
    IF NEW.quote_id IS NULL THEN
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
      WHERE q.id = NEW.quote_id;
    END IF;

    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Não foi possível determinar o autor do pedido a fornecedor (contrato %, quote %)', NEW.id, NEW.quote_id;
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
      WHERE ql.quote_id = NEW.quote_id
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
        'suppliers_skipped_idempotent', v_suppliers_skipped_idempotent
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
  'Fase 5.0C: gera 1 purchase_orders em rascunho (status=pending) por '
  'fornecedor preferencial distinto, agrupando as quote_lines do orçamento '
  'ligado ao contrato cujo produto tem manages_stock=false (a maioria — '
  'vendido por encomenda), na transição para assinado, quando organization_'
  'inventory_settings.stock_deduction_trigger=contract_signed (omissão). '
  'Idempotente por (source_type=contract, source_id, supplier_id) — '
  'reassinar o mesmo contrato nunca duplica as Encomendas já criadas. Linha '
  'sem fornecedor preferencial ou com quantidade inválida/fracionária é '
  'saltada com aviso em workflow_execution_log, nunca aborta as restantes. '
  'Best-effort (BEGIN/EXCEPTION), nunca bloqueia o UPDATE de client_contracts. '
  'Independente de fn_contract_signed_convert_to_client() (CRM) e de '
  'fn_contract_stock_deduction()/fn_contract_cancelled_stock_reversal() (Fase '
  '5.0B, baixa de stock de manages_stock=true) — ver cabeçalho da migration '
  '20261115070000 para o porquê de serem triggers separadas.';

DROP TRIGGER IF EXISTS trg_contract_supplier_request ON public.client_contracts;

CREATE TRIGGER trg_contract_supplier_request
AFTER UPDATE OF status ON public.client_contracts
FOR EACH ROW
EXECUTE FUNCTION public.fn_contract_supplier_request();


-- ============================================================
-- 3. fn_contract_cancelled_supplier_request_reversal() /
--    trg_contract_cancelled_supplier_request_reversal — AFTER UPDATE OF
--    status ON client_contracts. Cancela automaticamente as Encomendas em
--    rascunho ('pending') geradas a partir deste contrato quando ele passa a
--    'cancelled' OU 'rejected' (mesmos aliases e mesmo motivo de defesa em
--    profundidade já documentados em fn_contract_cancelled_stock_reversal,
--    20261115060000). Encomendas em qualquer outro estado (alguém já agiu
--    sobre elas) não são tocadas — só fica aviso em workflow_execution_log.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_contract_cancelled_supplier_request_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reversal_aliases text[] := ARRAY['cancelled', 'rejected'];
  v_po               record;
  v_cancelled_count  integer := 0;
  v_untouched_count  integer := 0;
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
    FOR v_po IN
      SELECT id, status, order_number
      FROM public.purchase_orders
      WHERE source_type = 'contract' AND source_id = NEW.id
    LOOP
      -- Per-PO guard: a failure handling one purchase order must never
      -- abort the handling of the remaining ones from the same contract.
      BEGIN
        IF v_po.status = 'pending' THEN
          -- Direct UPDATE (not via rpc_update_purchase_order — this trigger
          -- runs in a SECURITY DEFINER system context, and that RPC does a
          -- destructive DELETE+INSERT of items just to change status, which
          -- is unnecessary here). No BEFORE UPDATE trigger on purchase_orders
          -- rejects a plain status change (only updated_at maintenance and
          -- the audit trigger fire), confirmed by reading the schema.
          UPDATE public.purchase_orders
          SET status = 'cancelled', updated_at = now()
          WHERE id = v_po.id;

          v_cancelled_count := v_cancelled_count + 1;
        ELSE
          -- Already 'ordered'/'received'/'partially_received'/'cancelled' —
          -- someone already acted on it (or it was already cancelled). Never
          -- silently touch a purchase order already in progress.
          v_untouched_count := v_untouched_count + 1;
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, execution_data
          ) VALUES (
            'contract', NEW.id, 'purchase_order', v_po.id,
            'trigger:contract_po_reversal_not_touched', 'warning',
            jsonb_build_object(
              'reason', 'purchase_order_already_in_progress',
              'purchase_order_status', v_po.status,
              'order_number', v_po.order_number
            )
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'contract', NEW.id, 'purchase_order', v_po.id,
          'trigger:contract_po_reversal_line_error', 'error', SQLERRM,
          jsonb_build_object('purchase_order_id', v_po.id)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'contract', NEW.id, 'purchase_order', NULL,
      'trigger:contract_po_reversal', 'success',
      jsonb_build_object('cancelled_count', v_cancelled_count, 'untouched_count', v_untouched_count, 'status', NEW.status)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'contract', NEW.id, 'purchase_order', NULL,
        'trigger:contract_po_reversal', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_contract_cancelled_supplier_request_reversal() IS
  'Fase 5.0C: quando um contrato passa a cancelled OU rejected, cancela '
  'automaticamente (status=cancelled) cada purchase_orders gerada a partir '
  'deste contrato (source_type=contract, source_id=<contrato>) que ainda '
  'esteja pending (ninguém agiu sobre ela). Uma Encomenda já noutro estado '
  '(ordered/received/partially_received/já cancelled) NÃO é tocada — só fica '
  'aviso em workflow_execution_log, nunca se cancela silenciosamente uma '
  'compra já em curso. ''rejected'' incluído por defesa em profundidade, '
  'mesmo motivo já documentado em fn_contract_cancelled_stock_reversal '
  '(20261115060000). Best-effort (BEGIN/EXCEPTION), nunca bloqueia o UPDATE '
  'de client_contracts; falhas por Encomenda ficam em workflow_execution_log '
  'sem abortar o tratamento das restantes do mesmo contrato.';

DROP TRIGGER IF EXISTS trg_contract_cancelled_supplier_request_reversal ON public.client_contracts;

CREATE TRIGGER trg_contract_cancelled_supplier_request_reversal
AFTER UPDATE OF status ON public.client_contracts
FOR EACH ROW
EXECUTE FUNCTION public.fn_contract_cancelled_supplier_request_reversal();


-- ============================================================
-- Verification notes (para revisão humana / testes em transação com
-- ROLLBACK — não executadas nesta migration; ver relatório do agente para os
-- resultados reais)
-- ============================================================
--
-- 1. Contrato com 2 linhas manages_stock=false de produtos com o MESMO
--    fornecedor preferencial: assinar o contrato gera 1 só purchase_orders
--    (source_type=contract, source_id=<contrato>, supplier_id=<fornecedor>)
--    com 2 purchase_order_items.
-- 2. Contrato com 1 linha manages_stock=false cujo produto NÃO tem
--    fornecedor preferencial: nenhuma Encomenda gerada para essa linha,
--    aviso 'trigger:contract_po_request_no_supplier' em
--    workflow_execution_log.
-- 3. Contrato com linhas de 2 fornecedores preferenciais distintos: 2
--    purchase_orders distintas, cada uma só com as linhas do seu fornecedor.
-- 4. Reassinar o mesmo contrato (re-UPDATE para o mesmo status, ou outro
--    campo que não status): não duplica as Encomendas já criadas
--    (idempotência por source_type/source_id/supplier_id).
-- 5. Contrato com produto manages_stock=true misturado com manages_stock=
--    false: só o manages_stock=false gera Encomenda (o outro é coberto pela
--    Fase 5.0B, gera stock_movements, não Encomenda).
-- 6. Cancelar o contrato (a Encomenda gerada continua pending): passa a
--    cancelled automaticamente.
-- 7. Cancelar um contrato cuja Encomenda gerada já mudou de estado (ex.
--    'ordered'): a Encomenda NÃO é tocada, só fica aviso
--    'trigger:contract_po_reversal_not_touched'.
-- 8. As outras 3 triggers de client_contracts (conversão a cliente, dedução
--    de stock — Fase 5.0B, reversão de stock — Fase 5.0B) continuam a
--    funcionar normalmente em paralelo, sem interferência.
