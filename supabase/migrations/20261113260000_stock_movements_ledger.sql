-- Fase 4A do plano de inventário (plano-fornecedores-multi-stock.md, secções 5+6):
-- ledger de movimentos de stock. Fundação apenas — sem UI, sem ligação a
-- Encomendas/vendas (isso é Fase 4B/C), sem segregação .approve/.receive nem
-- products.view_cost (Fase 4 seguinte, secção 6.3/6.4 do plano).
--
-- Problema que resolve
-- ---------------------
-- stocks.quantity é hoje o único registo de stock — sem histórico. Uma venda,
-- entrada de compra, transferência entre armazéns ou ajuste de inventário só
-- fica visível como a diferença entre dois SELECTs, nunca como um evento
-- auditável com autor, documento, custo e contraparte. stock_movements passa
-- a ser a fonte única de verdade (5.2.5 do plano) para "o que aconteceu ao
-- stock deste produto neste armazém".
--
-- Decisões de implementação (algumas diferem da minuta literal do plano, sem
-- alterar a intenção — documentadas aqui para quem for rever):
--
-- 1. Tipos (quantity/balance_after): a minuta do plano usava
--    numeric(12,2); aqui ficaram integer, para bater certo com
--    stocks.quantity (também integer, baseline 20260615130000) e evitar casts
--    implícitos entre as duas tabelas.
--
-- 2. Atomicidade (secção 6.2 do plano): a minuta do plano descrevia
--    rpc_decrement_stock como um UPDATE atómico direto a `stocks`,
--    independente do ledger. Isso permitiria decrementar stock SEM criar
--    linha em stock_movements — quebra o "fonte única de verdade" (5.2.5) e
--    abre uma via para stocks e stock_movements dessincronizarem. Em vez
--    disso, a validação atómica (não deixar ir abaixo de zero) e a
--    atualização de stocks/average_cost ficam dentro de um trigger BEFORE
--    INSERT em stock_movements — a única forma de o stock mudar continua a
--    ser inserir um movimento, e o INSERT falha inteiro (RAISE EXCEPTION,
--    rollback da transação) se não houver stock suficiente. rpc_decrement_stock
--    passa a ser um wrapper fino que insere o movimento (tipo 'saida'),
--    devolvendo o saldo resultante — nunca escreve em `stocks` diretamente.
--
-- 3. balance_after tem de ficar correto no momento do INSERT: como
--    stock_movements nunca é editável (6.1 — ledger append-only, sem
--    soft-delete), um trigger AFTER INSERT não teria como lá voltar a
--    escrever depois de descobrir o saldo. Por isso o trigger é BEFORE
--    INSERT: calcula o novo saldo, valida, faz o UPSERT em `stocks`, e só
--    depois deixa o INSERT em stock_movements prosseguir com
--    NEW.balance_after já preenchido.
--
-- 4. Geração de document_number (sequências por tipo, ou reaproveitar a
--    numeração de purchase_orders) fica para quem realmente criar
--    movimentos a sério (Fase 4B, ecrã "Registar movimento") — nesta fase o
--    chamador (RPC ou, mais tarde, a UI) tem de fornecer document_number/
--    document_type explicitamente.
--
-- 5. Permissão reutilizada: inventory.view / inventory.edit — os mesmos
--    códigos que já protegem SELECT/INSERT/UPDATE em `stocks`
--    (20261102020000_fix_inventory_supplier_warehouse_select_permission_gap.sql),
--    não um código novo (YAGNI, secção 2 do plano). Um movimento é agora a
--    forma de editar o stock; quem já podia editar stock, continua a poder.
--
-- Prerequisitos: 20260615130000 (stocks/warehouses/products, has_anew_permission,
-- get_user_visible_org_ids), 20260625010000 (fn_generic_entity_audit,
-- padrão RESTRICTIVE ledger append-only), 20261108010000 (stocks.deleted_at).

-- ============================================================
-- 1. stocks.average_cost — custo médio ponderado (5.1.1 do plano)
-- ============================================================

ALTER TABLE public.stocks
  ADD COLUMN IF NOT EXISTS average_cost numeric(12,4);

COMMENT ON COLUMN public.stocks.average_cost IS
  'Custo médio ponderado (moving average), recalculado por fn_stock_movements_apply() '
  'em cada movimento de entrada real (entrada / transferencia_entrada) que traga '
  'unit_cost_at_time. NULL até ao primeiro movimento de entrada com custo.';

-- ============================================================
-- 2. Tabela stock_movements
-- ============================================================

CREATE TABLE public.stock_movements (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         uuid NOT NULL REFERENCES public.anew_organizations(id),
    product_id              uuid NOT NULL REFERENCES public.products(id),
    warehouse_id            uuid NOT NULL REFERENCES public.warehouses(id),
    movement_type           text NOT NULL CHECK (movement_type IN (
                                 'entrada', 'saida',
                                 'transferencia_entrada', 'transferencia_saida',
                                 'ajuste_positivo', 'ajuste_negativo',
                                 'devolucao_fornecedor', 'quebra'
                             )),
    quantity                integer NOT NULL CHECK (quantity > 0),
    document_number         text NOT NULL,
    document_type           text NOT NULL CHECK (document_type IN ('venda', 'compra', 'transferencia', 'ajuste')),
    item_supplier_id        uuid REFERENCES public.item_suppliers(id),
    unit_cost_at_time       numeric(12,4),
    supplier_sku_at_time    text,
    lot_id                  uuid,
    transfer_group_id       uuid,
    reversal_of_movement_id uuid REFERENCES public.stock_movements(id),
    counterparty            text,
    balance_after           integer NOT NULL,
    reference_id            uuid,
    notes                   text,
    created_by              uuid NOT NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
    created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stock_movements IS
  'Ledger append-only de movimentos de stock (produto x armazém). Fonte única de '
  'verdade — stocks.quantity/average_cost são derivados daqui pelo trigger '
  'fn_stock_movements_apply(), nunca escritos diretamente pelo frontend. '
  'Nunca editar nem apagar uma linha: correções fazem-se por lançamento inverso '
  '(reversal_of_movement_id), ver secção 6.1 do plano.';
COMMENT ON COLUMN public.stock_movements.balance_after IS
  'Saldo do armazém depois deste movimento — preenchido pelo trigger BEFORE INSERT '
  'fn_stock_movements_apply(), não pelo chamador.';
COMMENT ON COLUMN public.stock_movements.lot_id IS
  'Reservada para a Fase E (rastreio de lote/validade/série) do plano — sem FK '
  'ainda, propositadamente. Fica NULL para todos os produtos até essa fase existir.';
COMMENT ON COLUMN public.stock_movements.transfer_group_id IS
  'Liga as 2 linhas (transferencia_saida no armazém origem + transferencia_entrada '
  'no destino) da mesma transferência — ambas devem ser inseridas na mesma transação '
  'com o mesmo valor aqui.';

CREATE INDEX idx_stock_movements_product      ON public.stock_movements (product_id);
CREATE INDEX idx_stock_movements_warehouse    ON public.stock_movements (warehouse_id);
CREATE INDEX idx_stock_movements_org          ON public.stock_movements (organization_id);
CREATE INDEX idx_stock_movements_created_at   ON public.stock_movements (created_at DESC);
CREATE INDEX idx_stock_movements_transfer     ON public.stock_movements (transfer_group_id) WHERE transfer_group_id IS NOT NULL;
CREATE INDEX idx_stock_movements_document     ON public.stock_movements (document_number);
CREATE INDEX idx_stock_movements_item_supplier ON public.stock_movements (item_supplier_id) WHERE item_supplier_id IS NOT NULL;

-- ============================================================
-- 3. Trigger BEFORE INSERT — atualização atómica de stocks + average_cost
-- ============================================================
-- Corre ANTES do INSERT em stock_movements (não AFTER — ver decisão 3 no
-- cabeçalho): calcula o saldo resultante, valida que não fica negativo, e só
-- então deixa o movimento ser gravado com NEW.balance_after já correto.

CREATE OR REPLACE FUNCTION public.fn_stock_movements_apply()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_increment boolean;
  v_delta        integer;
  v_current_qty  integer;
  v_current_cost numeric(12,4);
  v_new_qty      integer;
  v_new_cost     numeric(12,4);
BEGIN
  v_is_increment := NEW.movement_type IN ('entrada', 'transferencia_entrada', 'ajuste_positivo');
  v_delta := CASE WHEN v_is_increment THEN NEW.quantity ELSE -NEW.quantity END;

  -- Lock da linha de stocks (se existir) para serializar movimentos
  -- concorrentes sobre o mesmo par produto/armazém.
  SELECT quantity, average_cost INTO v_current_qty, v_current_cost
  FROM public.stocks
  WHERE product_id = NEW.product_id AND warehouse_id = NEW.warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF NOT v_is_increment THEN
      RAISE EXCEPTION 'stock_insuficiente: não existe stock de % no armazém %', NEW.product_id, NEW.warehouse_id
        USING ERRCODE = 'check_violation';
    END IF;
    v_current_qty := 0;
    v_current_cost := NULL;
  END IF;

  v_new_qty := v_current_qty + v_delta;
  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'stock_insuficiente: saldo atual % é inferior à quantidade pedida %', v_current_qty, NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  -- Custo médio ponderado (5.1.1): só recalcula em entradas reais com custo
  -- conhecido. transferencia_entrada preserva o custo médio de origem quando
  -- o chamador não passa unit_cost_at_time (é o mesmo stock a mudar de sítio,
  -- não uma nova compra).
  IF NEW.movement_type IN ('entrada', 'transferencia_entrada') AND NEW.unit_cost_at_time IS NOT NULL THEN
    v_new_cost := CASE
      WHEN v_current_qty = 0 OR v_current_cost IS NULL THEN NEW.unit_cost_at_time
      ELSE ((v_current_cost * v_current_qty) + (NEW.unit_cost_at_time * NEW.quantity)) / v_new_qty
    END;
  ELSE
    v_new_cost := v_current_cost;
  END IF;

  INSERT INTO public.stocks (product_id, warehouse_id, organization_id, quantity, average_cost, created_by)
  VALUES (NEW.product_id, NEW.warehouse_id, NEW.organization_id, v_new_qty, v_new_cost, NEW.created_by)
  ON CONFLICT (product_id, warehouse_id) DO UPDATE
    SET quantity = v_new_qty,
        average_cost = v_new_cost,
        updated_at = now();

  NEW.balance_after := v_new_qty;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_stock_movements_apply() IS
  'BEFORE INSERT em stock_movements. Única via de escrita em stocks.quantity/'
  'average_cost — nunca UPDATE direto do frontend (secção 6.2 do plano). Faz '
  'SELECT ... FOR UPDATE sobre a linha de stocks correspondente para serializar '
  'movimentos concorrentes; RAISE EXCEPTION (rollback) se o movimento levaria o '
  'saldo abaixo de zero. Nota: se a linha de stocks encontrada estiver '
  'soft-deleted (stocks.deleted_at IS NOT NULL), esta função ainda assim '
  'atualiza-a — unique_product_warehouse não é um índice parcial por '
  'deleted_at, limitação pré-existente da tabela stocks, não introduzida aqui.';

DROP TRIGGER IF EXISTS trg_stock_movements_apply ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_apply
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.fn_stock_movements_apply();

-- Audit trigger — mesmo padrão (Strategy A) de todas as outras tabelas do
-- módulo. Só INSERT alguma vez vai disparar de facto (UPDATE/DELETE ficam
-- bloqueados pela RLS abaixo), mas regista-se para os 3 eventos por
-- consistência com o resto do projeto.
DROP TRIGGER IF EXISTS trg_audit_stock_movements ON public.stock_movements;
CREATE TRIGGER trg_audit_stock_movements
  AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- ============================================================
-- 4. RLS — reutiliza inventory.view/inventory.edit (mesmos códigos que já
--    protegem stocks); UPDATE/DELETE bloqueados sem exceção (6.1: ledger
--    append-only, correções só por lançamento inverso).
-- ============================================================

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_movements_select_policy ON public.stock_movements
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
    AND has_anew_permission((SELECT auth.uid()), 'inventory.view')
  );

CREATE POLICY stock_movements_insert_policy ON public.stock_movements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid())))
    AND has_anew_permission((SELECT auth.uid()), 'inventory.edit')
  );

CREATE POLICY stock_movements_no_update ON public.stock_movements
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY stock_movements_no_delete ON public.stock_movements
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 5. rpc_decrement_stock — wrapper fino sobre um INSERT em stock_movements
--    (tipo 'saida'). A atomicidade real vive no trigger acima; este RPC
--    existe para dar ao frontend um único ponto de entrada explícito para
--    "dar baixa de stock", sem o chamador ter de saber construir a linha do
--    ledger nem ler saldo antes de escrever (o anti-padrão que a secção 6.2
--    do plano avisa contra).
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_decrement_stock(
    p_product_id     uuid,
    p_warehouse_id   uuid,
    p_qty            integer,
    p_document_number text,
    p_document_type   text,
    p_counterparty    text DEFAULT NULL,
    p_notes           text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_result integer;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.stocks
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, counterparty, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'saida', p_qty,
    p_document_number, p_document_type, p_counterparty, p_notes, v_actor
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.rpc_decrement_stock IS
  'Dá baixa de stock inserindo um movimento tipo ''saida'' — nunca faz UPDATE '
  'direto a stocks. A validação atómica (não deixar o saldo negativo) é feita '
  'pelo trigger fn_stock_movements_apply(), não por esta função.';

REVOKE ALL ON FUNCTION public.rpc_decrement_stock FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_decrement_stock TO authenticated;
