-- ============================================================
-- Fase 5.0C-propostas do plano de inventário
-- (plano-fornecedores-multi-stock-execucao.md, secção "Fase 5.0 — Venda a
-- stock fixo" → "Ainda por fazer na Fase 5.0" → "5.0C-propostas"): dispara o
-- mesmo mecanismo já existente do lado de "Contrato assinado" (Fase 5.0B/
-- 5.0C, migrations 20261115060000/070000/080000/090000), agora do lado de
-- "Proposta aceite", para organizações que escolheram
-- organization_inventory_settings.stock_deduction_trigger='proposal_accepted'.
--
-- A guarda já existia dos DOIS lados desde a Fase 5.0B/5.0C — as triggers de
-- client_contracts já saem cedo quando a organização escolheu
-- 'proposal_accepted' (nada acontece ao assinar o contrato nesse caso); esta
-- migration fecha o lado simétrico que ainda faltava: nada acontecia ao
-- aceitar a proposta nessas mesmas organizações. Organizações no valor por
-- omissão ('contract_signed') continuam com o comportamento inalterado —
-- aceitar uma proposta nunca gera nada aqui quando o modo é 'contract_signed'
-- (guarda inversa, ponto 2 de cada função abaixo).
--
-- 4 funções novas, réplica quase literal das 4 já existentes em
-- client_contracts, com as seguintes diferenças (a razão de cada uma):
--
--   1. Disparam em `proposals` (AFTER UPDATE OF status), não em
--      `client_contracts`. Gate de entrada mais simples que o dos contratos
--      (`v_signed_aliases := ARRAY['signed','assinado']`) porque
--      proposals_status_check só admite um único literal de aceitação:
--      'accepted' (confirmado no CHECK constraint da tabela, baseline
--      20260615130000 — draft/sent/accepted/rejected, sem alias nenhum).
--
--   2. Guarda invertida: só correm quando stock_deduction_trigger =
--      'proposal_accepted' (as de client_contracts só correm quando é
--      'contract_signed') — nunca as duas em simultâneo para o mesmo evento
--      de negócio, exatamente como o plano exige.
--
--   3. proposals NÃO TEM coluna quote_id (confirmado no schema — só
--      client_contracts tem essa FK direta). Por isso não há "preferir
--      quote_id, cair para proposal_id" como em 20261115080000 — usa-se
--      diretamente o mesmo lado do fallback que já existia lá: a quote mais
--      recente de `quotes.proposal_id = <proposta>` (ORDER BY created_at
--      DESC LIMIT 1, réplica literal da subquery de 20261115080000).
--      DECISÃO NÃO 100% EXPLÍCITA NO PEDIDO: uma proposta pode, em teoria,
--      ter mais do que uma quote associada via proposal_id (é o que
--      compute_proposal_content_hash(), 20261111320000, assume ao fazer
--      array_agg sobre TODAS as quotes da proposta) — mas o pedido aponta
--      explicitamente para o padrão de 20261115080000 como "o padrão exato
--      de fallback a replicar", que é singular (LIMIT 1). Replicado à letra
--      aqui; se uma proposta real vier a ter 2+ quotes distintas ligadas,
--      só a mais recente participa nesta dedução/pedido — mesma limitação
--      que já existia (de forma inversa) no lado do contrato antes desta
--      migration.
--
--   4. proposals.organization_id é NULLABLE (ao contrário de
--      client_contracts.organization_id, NOT NULL — confirmado nos dois
--      schemas). Guarda nova, sem equivalente do lado do contrato: se
--      NEW.organization_id for NULL, nenhuma das 4 funções tenta prosseguir
--      (não há organização para resolver definições/armazém/fornecedor, nem
--      para gravar em stock_movements.organization_id/purchase_orders.
--      organization_id, ambas NOT NULL) — sai cedo, sem erro, sem log
--      (mesmo espírito de "nunca inventar", como o resto desta fase já faz
--      para armazém/fornecedor em falta).
--
--   5. sale_source_type/source_type = 'proposal' (não 'contract'),
--      sale_source_id/source_id = proposals.id — ambas as colunas já
--      suportam este valor desde a Fase 5.0A/5.0C (CHECK IN
--      ('contract','proposal'), confirmado em 20261115040000/070000) — sem
--      alteração de schema nesta migration.
--
--   6. document_number / texto das notas usa proposals.proposal_number (o
--      equivalente de contract_number) com o mesmo COALESCE(…, id::text) de
--      defesa que fn_contract_supplier_request já usa para contract_number —
--      proposal_number é gerado automaticamente desde 20261112140000 e foi
--      retro-preenchido, mas o COALESCE cobre qualquer linha antiga que
--      ainda assim tenha ficado NULL.
--
-- Reversão (fn_proposal_cancelled_stock_reversal /
-- fn_proposal_cancelled_supplier_request_reversal) — só reage a 'rejected'
-- --------------------------------------------------------------------------
-- client_contracts reage a ('cancelled','rejected') porque tem os dois
-- estados de anulação. proposals_status_check (confirmado no schema) só tem
-- 4 valores possíveis: draft/sent/accepted/rejected — NÃO existe
-- 'cancelled' em proposals. 'rejected' é por isso o único estado de anulação
-- possível e o único ao qual esta reversão reage.
--
-- DECISÃO NÃO 100% EXPLÍCITA NO PEDIDO — o caminho "sent" via
-- reopen_accepted_proposal_if_changed (20261111320000) NÃO é tratado como
-- reversão aqui: quando o conteúdo de uma proposta aceite muda antes de
-- haver contrato assinado, essa função já reabre a proposta (accepted→sent,
-- accepted_at limpo) para nova assinatura, mas não faz (nem pede) nenhuma
-- reversão de stock. Decidido não estender esta migration a esse caminho
-- porque (a) não foi pedido explicitamente, (b) reject_proposal_atomic
-- (20260819010000) já bloqueia rejeitar uma proposta accepted
-- ('already_processed') — logo 'rejected' só é alcançável a partir de
-- 'accepted' por escrita direta (ex. futura ferramenta interna), não pelo
-- fluxo normal do produto hoje — e (c) tratar "sent" como reversão
-- implicaria decidir se uma proposta reaberta e depois reaceite deve gerar
-- um NOVO movimento de venda (as linhas da quote podem ter mudado de
-- quantidade) — decisão de negócio fora do âmbito deste pedido. Nota para o
-- futuro: enquanto isto não for resolvido, reabrir uma proposta aceite não
-- reverte o movimento de venda/pedido a fornecedor já gerado — o stock fica
-- coerente com a ACEITAÇÃO original, não com o conteúdo editado depois.
-- Idempotência (rpc_register_sale_stock_movement por reference_id=quote_line_id,
-- fn_proposal_supplier_request por source_id+supplier_id) garante, pelo
-- menos, que reaceitar a mesma proposta depois de reaberta nunca duplica o
-- que já foi gerado na 1ª aceitação.
--
-- Idempotência / dupla aceitação
-- --------------------------------------------------------------------------
-- Nenhum mecanismo novo — reaproveita os dois já existentes, sem alteração:
--   · rpc_register_sale_stock_movement (20261115060000): idempotente por
--     (sale_source_type, sale_source_id, reference_id=quote_line_id,
--     movement_type='venda').
--   · fn_proposal_supplier_request (esta migration, cópia de
--     fn_contract_supplier_request): idempotente por (source_type='proposal',
--     source_id=<proposta>, supplier_id).
--
-- BEGIN/EXCEPTION best-effort — accept_proposal_atomic não tem proteção
-- equivalente
-- --------------------------------------------------------------------------
-- Confirmado ao ler accept_proposal_atomic (20261115020000): é um único
-- UPDATE public.proposals SET status='accepted', ... sem bloco
-- BEGIN/EXCEPTION nenhum à volta — uma exceção não apanhada dentro de uma
-- trigger AFTER UPDATE OF status disparada por este UPDATE propagaria e
-- desfaria a aceitação inteira (a mesma transação). As 4 funções desta
-- migration são por isso 100% self-contained: todo o corpo depois da guarda
-- de transição está dentro de um BEGIN...EXCEPTION WHEN OTHERS que nunca
-- deixa nada propagar (mesmo o INSERT de log de erro tem o seu próprio
-- BEGIN/EXCEPTION aninhado) — réplica exata do padrão já usado nas 4 funções
-- irmãs de client_contracts (20261115060000/070000).
--
-- Prerequisitos: 20261115040000 (fundação: products.manages_stock,
-- organization_inventory_settings, stock_movements.sale_source_type/
-- sale_source_id, rpc_register_sale_stock_movement, movement_type
-- venda/estorno_venda), 20261115060000 (rpc_register_sale_stock_movement com
-- p_organization_id explícito, fn_contract_stock_deduction/fn_contract_
-- cancelled_stock_reversal — padrão replicado aqui), 20261115070000
-- (purchase_orders.source_type/source_id, fn_contract_supplier_request/
-- fn_contract_cancelled_supplier_request_reversal — padrão replicado aqui),
-- 20261115090000 (fallback de purchase_price via product_prices, já
-- incorporado de origem nesta versão, sem precisar de uma migration de
-- correção separada), 20261112110000 (item_suppliers), 20261115020000
-- (accept_proposal_atomic), 20260819010000 (reject_proposal_atomic).
-- ============================================================


-- ============================================================
-- 1. fn_proposal_stock_deduction() / trg_proposal_stock_deduction —
--    AFTER UPDATE OF status ON proposals. Réplica de
--    fn_contract_stock_deduction() (20261115060000/080000).
-- ============================================================

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
          'proposal', NEW.id, 'quote_line', v_line.id,
          'trigger:proposal_stock_deduction_line_skipped', 'warning',
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
          'proposal', NEW.id, 'quote_line', v_line.id,
          'trigger:proposal_stock_deduction_line_skipped', 'warning',
          jsonb_build_object('reason', 'fractional_quantity', 'qt', v_line.qt, 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

      v_qty_int := v_line.qt::integer;

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

COMMENT ON FUNCTION public.fn_proposal_stock_deduction() IS
  'Fase 5.0C-propostas: gera movimentos de stock (movement_type=venda) para '
  'as linhas de quote_lines da quote mais recente ligada à proposta (via '
  'quotes.proposal_id — proposals não tem coluna quote_id), na transição '
  'para accepted, quando organization_inventory_settings.stock_deduction_'
  'trigger=proposal_accepted (guarda inversa de fn_contract_stock_deduction, '
  'que só corre em contract_signed) e o produto de cada linha tem '
  'manages_stock=true. Passa NEW.organization_id (a organização da '
  'proposta, quem vende) a rpc_register_sale_stock_movement. Best-effort '
  '(BEGIN/EXCEPTION), nunca bloqueia o UPDATE de proposals — necessário '
  'porque accept_proposal_atomic (20261115020000) não tem nenhuma proteção '
  'equivalente à volta do seu UPDATE. Réplica de fn_contract_stock_deduction '
  '(20261115060000/080000), ver cabeçalho da migration 20261116030000 para '
  'as diferenças (gate simplificado, guarda de organização nula, ausência '
  'de quote_id direto).';

DROP TRIGGER IF EXISTS trg_proposal_stock_deduction ON public.proposals;

CREATE TRIGGER trg_proposal_stock_deduction
AFTER UPDATE OF status ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.fn_proposal_stock_deduction();


-- ============================================================
-- 2. fn_proposal_cancelled_stock_reversal() /
--    trg_proposal_cancelled_stock_reversal — AFTER UPDATE OF status ON
--    proposals. Reverte (estorno_venda) cada movimento 'venda' ainda não
--    revertido, gerado a partir desta proposta, quando ela passa a
--    'rejected'. Réplica de fn_contract_cancelled_stock_reversal
--    (20261115060000) — só reage a 'rejected' porque proposals_status_check
--    não tem 'cancelled' (ver cabeçalho desta migration).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_proposal_cancelled_stock_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staff_actor    uuid;
  v_actor          uuid;
  v_mov            record;
  v_reversed_count integer := 0;
BEGIN
  IF NEW.status IS DISTINCT FROM 'rejected' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block the write to proposals.
  BEGIN
    v_staff_actor := public.current_business_user_id();

    FOR v_mov IN
      SELECT sm.*
      FROM public.stock_movements sm
      WHERE sm.sale_source_type = 'proposal'
        AND sm.sale_source_id = NEW.id
        AND sm.movement_type = 'venda'
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversal_of_movement_id = sm.id
        )
    LOOP
      -- Per-movement guard: a failure reversing one movement must never
      -- abort the reversal of the remaining movements of the same proposal.
      BEGIN
        -- v_mov.created_by is guaranteed to satisfy the FK to anew_users
        -- (it already exists on the original movement row) — safe final
        -- fallback when there is no staff session present.
        v_actor := COALESCE(v_staff_actor, v_mov.created_by);

        INSERT INTO public.stock_movements (
          organization_id, product_id, warehouse_id, movement_type, quantity,
          document_number, document_type, reversal_of_movement_id,
          reference_id, sale_source_type, sale_source_id, notes, created_by
        ) VALUES (
          v_mov.organization_id, v_mov.product_id, v_mov.warehouse_id, 'estorno_venda', v_mov.quantity,
          v_mov.document_number, 'venda', v_mov.id,
          v_mov.reference_id, 'proposal', NEW.id,
          format('Estorno automático da venda %s (proposta %s, status %s)', v_mov.id, COALESCE(NEW.proposal_number, NEW.id::text), NEW.status),
          v_actor
        );

        v_reversed_count := v_reversed_count + 1;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.workflow_execution_log (
          source_entity, source_record_id, target_entity, target_record_id,
          action_type, status, error_message, execution_data
        ) VALUES (
          'proposal', NEW.id, 'stock_movement', v_mov.id,
          'trigger:proposal_stock_reversal_line_error', 'error', SQLERRM,
          jsonb_build_object('movement_id', v_mov.id, 'product_id', v_mov.product_id)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'proposal', NEW.id, 'stock_movement', NULL,
      'trigger:proposal_stock_reversal', 'success',
      jsonb_build_object('reversed_count', v_reversed_count, 'status', NEW.status)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'proposal', NEW.id, 'stock_movement', NULL,
        'trigger:proposal_stock_reversal', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_proposal_cancelled_stock_reversal() IS
  'Fase 5.0C-propostas: quando uma proposta passa a rejected, gera um '
  'movimento estorno_venda (mesma quantidade, reversal_of_movement_id '
  'apontado ao movimento original) para cada stock_movements venda dessa '
  'proposta ainda sem reversão. Só reage a rejected — proposals_status_check '
  'não tem cancelled (ver cabeçalho da migration 20261116030000). NÃO reage '
  'à transição accepted→sent feita por reopen_accepted_proposal_if_changed '
  '(20261111320000) — decisão registada no cabeçalho da migration '
  '20261116030000. Nunca edita o movimento original — append-only. '
  'Best-effort (BEGIN/EXCEPTION), nunca bloqueia o UPDATE de proposals. '
  'Réplica de fn_contract_cancelled_stock_reversal (20261115060000).';

DROP TRIGGER IF EXISTS trg_proposal_cancelled_stock_reversal ON public.proposals;

CREATE TRIGGER trg_proposal_cancelled_stock_reversal
AFTER UPDATE OF status ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.fn_proposal_cancelled_stock_reversal();


-- ============================================================
-- 3. fn_proposal_supplier_request() / trg_proposal_supplier_request —
--    AFTER UPDATE OF status ON proposals. Réplica de fn_contract_supplier_
--    request (20261115070000/080000/090000, já com o fallback de
--    purchase_price incorporado de origem).
-- ============================================================

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
          'proposal', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:proposal_po_request_line_skipped', 'warning',
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
          'proposal', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:proposal_po_request_line_skipped', 'warning',
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
          'proposal', NEW.id, 'quote_line', v_line.quote_line_id,
          'trigger:proposal_po_request_no_supplier', 'warning',
          jsonb_build_object('reason', 'no_preferred_supplier', 'product_id', v_line.product_id)
        );
        CONTINUE;
      END IF;

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

COMMENT ON FUNCTION public.fn_proposal_supplier_request() IS
  'Fase 5.0C-propostas: gera 1 purchase_orders em rascunho (status=pending) '
  'por fornecedor preferencial distinto, agrupando as quote_lines da quote '
  'mais recente ligada à proposta cujo produto tem manages_stock=false, na '
  'transição para accepted, quando organization_inventory_settings.stock_'
  'deduction_trigger=proposal_accepted (guarda inversa de fn_contract_'
  'supplier_request, que só corre em contract_signed). unit_price cai de '
  'item_suppliers.purchase_price para product_prices (purchase) para 0, '
  'nesta ordem. Idempotente por (source_type=proposal, source_id, '
  'supplier_id). Best-effort (BEGIN/EXCEPTION), nunca bloqueia o UPDATE de '
  'proposals. Réplica de fn_contract_supplier_request (20261115070000/'
  '080000/090000).';

DROP TRIGGER IF EXISTS trg_proposal_supplier_request ON public.proposals;

CREATE TRIGGER trg_proposal_supplier_request
AFTER UPDATE OF status ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.fn_proposal_supplier_request();


-- ============================================================
-- 4. fn_proposal_cancelled_supplier_request_reversal() /
--    trg_proposal_cancelled_supplier_request_reversal — AFTER UPDATE OF
--    status ON proposals. Cancela automaticamente as Encomendas em rascunho
--    ('pending') geradas a partir desta proposta quando ela passa a
--    'rejected'. Réplica de fn_contract_cancelled_supplier_request_reversal
--    (20261115070000) — só reage a 'rejected' (ver ponto 2 desta migration).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_proposal_cancelled_supplier_request_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_po               record;
  v_cancelled_count  integer := 0;
  v_untouched_count  integer := 0;
BEGIN
  IF NEW.status IS DISTINCT FROM 'rejected' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block the write to proposals.
  BEGIN
    FOR v_po IN
      SELECT id, status, order_number
      FROM public.purchase_orders
      WHERE source_type = 'proposal' AND source_id = NEW.id
    LOOP
      -- Per-PO guard: a failure handling one purchase order must never
      -- abort the handling of the remaining ones from the same proposal.
      BEGIN
        IF v_po.status = 'pending' THEN
          -- Direct UPDATE (not via rpc_update_purchase_order) — same
          -- reasoning as fn_contract_cancelled_supplier_request_reversal
          -- (20261115070000): this trigger runs in a SECURITY DEFINER
          -- system context, and that RPC does a destructive DELETE+INSERT
          -- of items just to change status.
          UPDATE public.purchase_orders
          SET status = 'cancelled', updated_at = now()
          WHERE id = v_po.id;

          v_cancelled_count := v_cancelled_count + 1;
        ELSE
          -- Already 'ordered'/'received'/'partially_received'/'cancelled' —
          -- someone already acted on it. Never silently touch a purchase
          -- order already in progress.
          v_untouched_count := v_untouched_count + 1;
          INSERT INTO public.workflow_execution_log (
            source_entity, source_record_id, target_entity, target_record_id,
            action_type, status, execution_data
          ) VALUES (
            'proposal', NEW.id, 'purchase_order', v_po.id,
            'trigger:proposal_po_reversal_not_touched', 'warning',
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
          'proposal', NEW.id, 'purchase_order', v_po.id,
          'trigger:proposal_po_reversal_line_error', 'error', SQLERRM,
          jsonb_build_object('purchase_order_id', v_po.id)
        );
      END;
    END LOOP;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status, execution_data
    ) VALUES (
      'proposal', NEW.id, 'purchase_order', NULL,
      'trigger:proposal_po_reversal', 'success',
      jsonb_build_object('cancelled_count', v_cancelled_count, 'untouched_count', v_untouched_count, 'status', NEW.status)
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'proposal', NEW.id, 'purchase_order', NULL,
        'trigger:proposal_po_reversal', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_proposal_cancelled_supplier_request_reversal() IS
  'Fase 5.0C-propostas: quando uma proposta passa a rejected, cancela '
  'automaticamente (status=cancelled) cada purchase_orders gerada a partir '
  'dela (source_type=proposal, source_id=<proposta>) que ainda esteja '
  'pending. Uma Encomenda já noutro estado NÃO é tocada — só fica aviso em '
  'workflow_execution_log. Best-effort (BEGIN/EXCEPTION), nunca bloqueia o '
  'UPDATE de proposals. Réplica de fn_contract_cancelled_supplier_request_'
  'reversal (20261115070000).';

DROP TRIGGER IF EXISTS trg_proposal_cancelled_supplier_request_reversal ON public.proposals;

CREATE TRIGGER trg_proposal_cancelled_supplier_request_reversal
AFTER UPDATE OF status ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.fn_proposal_cancelled_supplier_request_reversal();


-- ============================================================
-- Verification notes (para revisão humana / testes em transação com
-- ROLLBACK — não executadas nesta migration; ver relatório do agente para os
-- resultados reais)
-- ============================================================
--
-- 1. Organização com stock_deduction_trigger='proposal_accepted', produto
--    manages_stock=true numa quote ligada a uma proposta: aceitar a
--    proposta (UPDATE proposals SET status='accepted') gera stock_movements
--    movement_type=venda, stocks.quantity desce, balance_after correto.
-- 2. Mesma organização, produto manages_stock=false: aceitar a proposta gera
--    1 purchase_orders em rascunho (pending) para o fornecedor preferencial.
-- 3. Organização com stock_deduction_trigger='contract_signed' (omissão, ou
--    sem linha em organization_inventory_settings): aceitar a proposta NÃO
--    gera nada em nenhum dos dois casos — continua a exigir assinatura do
--    contrato (fn_contract_stock_deduction/fn_contract_supplier_request,
--    inalteradas, continuam a ser o único caminho).
-- 4. Cancelar/rejeitar a proposta depois de aceite
--    (UPDATE proposals SET status='rejected'): gera estorno_venda para cada
--    venda ainda não revertida, e cancela cada purchase_orders ainda pending
--    gerada a partir dela.
-- 5. Reaceitar a mesma proposta (re-UPDATE para o mesmo status, ou oscilando
--    accepted→outro→accepted): não duplica nem o movimento de venda
--    (idempotência por reference_id=quote_line_id em rpc_register_sale_
--    stock_movement) nem a Encomenda a fornecedor (idempotência por
--    source_id+supplier_id).
-- 6. proposals.organization_id NULL: nenhuma das 4 funções tenta prosseguir
--    (guarda nova, sem equivalente do lado do contrato).
-- 7. accept_proposal_atomic continua a funcionar mesmo que uma das 4
--    triggers falhe a meio (simulável forçando um erro dentro do bloco
--    BEGIN) — a aceitação em si (UPDATE proposals) nunca é desfeita.
