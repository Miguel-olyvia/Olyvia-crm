-- Fase 4 (item "Receção parcial de Encomendas") do plano de inventário
-- (plano-fornecedores-multi-stock.md, secção 5.4 / execução, "Ainda por
-- fazer na Fase 4", item 2).
--
-- Problema resolvido
-- -------------------
-- rpc_receive_purchase_order (20261113280000, endurecido em 20261113290000)
-- só suporta receção TOTAL: todas as linhas de produto de uma encomenda de
-- uma vez, no mesmo armazém. Um fornecedor que entrega em várias tranches
-- (comum em compras de maior volume/lead time) não tinha forma de refletir
-- isso no stock sem "fingir" que recebeu tudo de uma vez.
--
-- O que esta migration faz
-- --------------------------
--   1. purchase_order_items.received_quantity (nova coluna) — quantidade já
--      recebida por linha, acumulada ao longo de várias entregas parciais.
--   2. rpc_receive_purchase_order_lines(p_purchase_order_id, p_warehouse_id,
--      p_lines jsonb) — RPC novo, o verdadeiro motor da receção (total ou
--      parcial). p_lines = array de {purchase_order_item_id, quantity}.
--   3. rpc_receive_purchase_order(p_purchase_order_id, p_warehouse_id) passa
--      a ser um WRAPPER FINO sobre o RPC novo: monta p_lines com todas as
--      linhas de produto ainda por receber, na quantidade remanescente
--      (quantity - received_quantity), e delega. Quem já chama este RPC
--      (PurchaseOrders.tsx) continua a funcionar sem alteração — recebe tudo
--      de uma vez, exatamente como hoje.
--   4. Guarda nova em rpc_update_purchase_order: rejeita a edição (que faz
--      DELETE+INSERT de purchase_order_items) se alguma linha já tiver
--      received_quantity > 0 — impede apagar progresso de receção. Isto
--      bloqueia também, de facto, status='cancelled' numa encomenda já
--      parcialmente recebida (a chamada inteira falha antes de tocar em
--      nada) — comportamento pretendido: não se cancela uma encomenda já
--      parcialmente recebida, o caminho correto é rpc_register_supplier_return
--      (devolução do que já entrou em stock) seguido de cancelamento só
--      depois de a devolução zerar o que foi recebido.
--   5. Nenhuma tabela nova, nenhuma permissão nova — reaproveita
--      purchase_orders.edit + purchase_orders.receive + inventory.edit
--      (mesmo trio já exigido pelo RPC de receção total desde 20261113290000).
--
-- Decisão de design — porquê wrapper fino e não duplicar lógica
-- -----------------------------------------------------------------
-- rpc_receive_purchase_order_lines é a única função que sabe validar linha a
-- linha, escrever no ledger e recalcular o status da encomenda. Manter
-- rpc_receive_purchase_order como wrapper (em vez de duplicar essa lógica)
-- garante que os dois caminhos (receção total via UI antiga, receção
-- parcial via UI nova) nunca divergem — uma correção feita num só sítio
-- cobre ambos. A única exceção documentada abaixo (ponto "Edge case") é uma
-- encomenda sem NENHUMA linha de produto (só serviços): nesse caso não há
-- p_lines possível para construir (RPC novo exige p_lines não vazio), e o
-- wrapper trata esse caso à parte, replicando o comportamento do RPC
-- original (20261113280000) — marca a encomenda como recebida diretamente,
-- sem gerar nenhum stock_movements, com os mesmos checks de
-- status/permissão/organização/armazém.
--
-- Porque document_number continua a ser o order_number da encomenda em
-- TODAS as entregas parciais (não um sufixo por entrega)
-- -----------------------------------------------------------------------
-- Uma "nota de encomenda" (ver execução Fase 4, levantamento 2026-08-25) é
-- sinónimo da própria encomenda neste projeto — não existe um documento
-- distinto tipo guia de remessa por entrega parcial. Sufixar o
-- document_number (ex. "PO-2026-0003-1", "PO-2026-0003-2") inventaria um
-- esquema de numeração que não existe em lado nenhum do projeto e que
-- partiria a pesquisa/filtro por document_number no ecrã de Stocks
-- (StockMovementsHistoryDialog.tsx já filtra por document_number exato em
-- alguns fluxos). A rastreabilidade de QUAL entrega parcial gerou QUAL
-- movimento já está garantida por dois campos que já existem no ledger desde
-- a Fase A e nunca tinham sido usados até agora:
--   · reference_id  — aponta para o id da própria purchase_order_items (a
--     linha exata desta encomenda), nunca usado até esta migration.
--   · created_at    — o timestamp do próprio movimento já ordena
--     cronologicamente as várias entregas parciais da mesma linha.
-- Juntos (reference_id + created_at) dão rastreabilidade completa sem
-- inventar sufixos de documento.
--
-- Desvios ao plano original (documentados)
-- -----------------------------------------
-- 1. Edge case "encomenda só com linhas de serviço" (ver acima) — o plano
--    não previa este caso; sem o tratamento à parte no wrapper, uma
--    encomenda sem stock físico deixaria de poder ser marcada como recebida
--    (rpc_receive_purchase_order_lines rejeitaria p_lines vazio). Resolvido
--    replicando o comportamento pré-existente só para esse caso específico.
-- 2. rpc_receive_purchase_order_lines faz lock da encomenda com
--    SELECT ... FOR UPDATE desde o início (pedido explícito do plano, novo
--    face ao RPC anterior, que só fazia SELECT simples) — serializa duas
--    receções concorrentes da mesma encomenda, para que o recálculo final
--    de status nunca leia um SUM(received_quantity) desatualizado.
--
-- Prerequisitos: 20260615130000 (purchase_orders/purchase_order_items),
-- 20261113260000 (stock_movements, fn_stock_movements_apply), 20261113270000
-- (item_suppliers em uso), 20261113280000 + 20261113290000
-- (rpc_receive_purchase_order + purchase_orders.receive/.edit/inventory.edit),
-- 20260814020000 (rpc_update_purchase_order).


-- ============================================================
-- 1. purchase_order_items.received_quantity
-- ============================================================

ALTER TABLE public.purchase_order_items
  ADD COLUMN received_quantity numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_order_items
  ADD CONSTRAINT purchase_order_items_received_quantity_non_negative
    CHECK (received_quantity >= 0);

ALTER TABLE public.purchase_order_items
  ADD CONSTRAINT purchase_order_items_received_quantity_le_quantity
    CHECK (received_quantity <= quantity);

COMMENT ON COLUMN public.purchase_order_items.received_quantity IS
  'Quantidade já recebida desta linha, acumulada ao longo de 1 ou mais '
  'receções parciais via rpc_receive_purchase_order_lines(). 0 até à primeira '
  'receção; nunca excede quantity (CHECK). Só tem sentido para item_type='
  '''product'' — linhas de serviço ficam sempre a 0 (não passam pelo RPC).';


-- ============================================================
-- 2. rpc_receive_purchase_order_lines — motor real da receção (total ou
--    parcial). SECURITY DEFINER, mesmos checks de permissão/organização do
--    RPC de receção total.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order_lines(
    p_purchase_order_id uuid,
    p_warehouse_id      uuid,
    p_lines             jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor            uuid;
  v_po               public.purchase_orders%ROWTYPE;
  v_line_input       jsonb;
  v_line_id          uuid;
  v_qty_requested    numeric;
  v_qty_int          integer;
  v_item             record;
  v_item_supplier_id uuid;
  v_remaining        numeric;
  v_balance          integer;
  v_received_total   numeric;
  v_lines_out        jsonb := '[]'::jsonb;
  v_sum_quantity     numeric;
  v_sum_received     numeric;
  v_new_status       text;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Lock da encomenda inteira desde o início (novo face ao RPC de receção
  -- total anterior, que só lia sem lock) — serializa duas receções
  -- concorrentes da mesma encomenda, para o recálculo de status no fim nunca
  -- ler um SUM(received_quantity) desatualizado.
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_po.status = 'received' THEN
    RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
  END IF;

  -- Mesmos checks de permissão/organização do RPC de receção total
  -- (20261113290000): purchase_orders.edit + purchase_orders.receive +
  -- inventory.edit, scope de organização.
  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit')
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = v_po.organization_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Linhas de receção não podem estar vazias' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_line_input IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_id       := nullif(v_line_input ->> 'purchase_order_item_id', '')::uuid;
    v_qty_requested := nullif(v_line_input ->> 'quantity', '')::numeric;

    IF v_line_id IS NULL THEN
      RAISE EXCEPTION 'purchase_order_item_id em falta numa linha de receção' USING ERRCODE = 'check_violation';
    END IF;

    SELECT id, product_id, item_type, quantity, unit_price, received_quantity, description
    INTO v_item
    FROM public.purchase_order_items
    WHERE id = v_line_id AND purchase_order_id = p_purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', v_line_id
        USING ERRCODE = 'no_data_found';
    END IF;

    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto — serviços não têm stock físico e não podem ser recebidos', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_qty_requested IS NULL OR v_qty_requested <= 0 THEN
      RAISE EXCEPTION 'A quantidade a receber na linha "%" tem de ser positiva', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_qty_requested <> floor(v_qty_requested) THEN
      RAISE EXCEPTION 'A linha "%" tem uma quantidade não inteira (%) — o stock só regista unidades inteiras. Corrige a linha antes de receber.', v_item.description, v_qty_requested
        USING ERRCODE = 'check_violation';
    END IF;

    v_remaining := v_item.quantity - v_item.received_quantity;
    IF v_qty_requested > v_remaining THEN
      RAISE EXCEPTION 'A quantidade a receber (%) na linha "%" excede o saldo por receber desta linha (% de % por receber; já recebido % de %)',
        v_qty_requested, v_item.description, v_remaining, v_item.quantity, v_item.received_quantity, v_item.quantity
        USING ERRCODE = 'check_violation';
    END IF;

    v_qty_int := v_qty_requested::integer;

    -- Fornecedor concreto (item_suppliers) para este par produto/fornecedor
    -- da encomenda, se existir — melhor esforço, não bloqueia a receção se
    -- faltar (o produto pode ter sido descontinuado nesse fornecedor
    -- entretanto). Igual ao RPC de receção total.
    SELECT id INTO v_item_supplier_id
    FROM public.item_suppliers
    WHERE product_id = v_item.product_id
      AND supplier_id = v_po.supplier_id
      AND deleted_at IS NULL
    ORDER BY is_preferred DESC
    LIMIT 1;

    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, item_supplier_id, unit_cost_at_time,
      reference_id, notes, created_by
    ) VALUES (
      v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_qty_int,
      v_po.order_number, 'compra', v_item_supplier_id, v_item.unit_price,
      v_item.id,
      format('Receção de %s: %s unidades agora nesta linha (total recebido %s de %s)',
             v_po.order_number, v_qty_int, v_item.received_quantity + v_qty_requested, v_item.quantity),
      v_actor
    )
    RETURNING balance_after INTO v_balance;

    UPDATE public.purchase_order_items
    SET received_quantity = received_quantity + v_qty_requested
    WHERE id = v_item.id
    RETURNING received_quantity INTO v_received_total;

    v_lines_out := v_lines_out || jsonb_build_object(
      'product_id',               v_item.product_id,
      'quantity_received_now',    v_qty_int,
      'received_quantity_total',  v_received_total,
      'remaining',                v_item.quantity - v_received_total,
      'balance_after',            v_balance
    );
  END LOOP;

  -- Recalcula o status da encomenda a partir do saldo real de todas as
  -- linhas de produto (não só as tocadas nesta chamada) — uma receção
  -- parcial anterior + esta podem, juntas, fechar a encomenda.
  SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(received_quantity), 0)
  INTO v_sum_quantity, v_sum_received
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';

  IF v_sum_quantity > 0 AND v_sum_received >= v_sum_quantity THEN
    v_new_status := 'received';
  ELSIF v_sum_received > 0 THEN
    v_new_status := 'partially_received';
  ELSE
    -- Por segurança (não deveria acontecer com p_lines não vazio já
    -- validado acima): mantém o estado atual.
    v_new_status := v_po.status;
  END IF;

  UPDATE public.purchase_orders
  SET status = v_new_status, updated_at = now()
  WHERE id = p_purchase_order_id;

  RETURN jsonb_build_object(
    'order_number',  v_po.order_number,
    'warehouse_id',  p_warehouse_id,
    'status',        v_new_status,
    'lines',         v_lines_out
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_receive_purchase_order_lines IS
  'Regista a receção (total ou parcial) de 1+ linhas de produto de uma '
  'encomenda: gera 1 movimento de entrada em stock_movements por linha '
  '(reference_id = purchase_order_items.id), acumula '
  'purchase_order_items.received_quantity, e recalcula purchase_orders.status '
  '(''received'' se tudo recebido, ''partially_received'' se parcial). Exige '
  'purchase_orders.edit + purchase_orders.receive + inventory.edit. '
  'p_lines = array de {purchase_order_item_id, quantity}.';

REVOKE ALL ON FUNCTION public.rpc_receive_purchase_order_lines FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_receive_purchase_order_lines TO authenticated;


-- ============================================================
-- 3. rpc_receive_purchase_order — wrapper fino sobre o RPC acima. Mesma
--    assinatura de sempre (p_purchase_order_id, p_warehouse_id): quem já a
--    chama (PurchaseOrders.tsx, "Marcar como recebida") continua a receber
--    tudo de uma vez, sem alteração de comportamento.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order(
    p_purchase_order_id uuid,
    p_warehouse_id      uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_has_product_lines boolean;
  v_lines             jsonb;
  v_actor             uuid;
  v_org               uuid;
  v_status            text;
  v_order_number      text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product'
  ) INTO v_has_product_lines;

  IF NOT v_has_product_lines THEN
    -- Edge case documentado no cabeçalho desta migration: encomenda só com
    -- linhas de serviço (sem stock físico) não tem p_lines possível para
    -- construir (rpc_receive_purchase_order_lines exige não-vazio).
    -- Replica o comportamento do RPC original (20261113280000): marca a
    -- encomenda como recebida diretamente, sem stock_movements nenhum, com
    -- os mesmos checks de status/permissão/organização/armazém.
    v_actor := public.current_business_user_id();
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
    END IF;

    SELECT organization_id, status, order_number
    INTO v_org, v_status, v_order_number
    FROM public.purchase_orders
    WHERE id = p_purchase_order_id AND deleted_at IS NULL
    FOR UPDATE;

    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_status = 'received' THEN
      RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
    END IF;
    IF v_status = 'cancelled' THEN
      RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
    END IF;

    IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
       OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit')
       OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
       OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
      RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.warehouses
      WHERE id = p_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.purchase_orders
    SET status = 'received', updated_at = now()
    WHERE id = p_purchase_order_id;

    RETURN jsonb_build_object(
      'order_number', v_order_number,
      'warehouse_id', p_warehouse_id,
      'status',       'received',
      'lines',        '[]'::jsonb
    );
  END IF;

  -- Caminho normal: monta p_lines com todas as linhas de produto ainda por
  -- receber, na quantidade remanescente — e delega. Linhas já totalmente
  -- recebidas (quantity <= received_quantity) ficam de fora.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'purchase_order_item_id', id,
           'quantity', (quantity - received_quantity)
         )), '[]'::jsonb)
  INTO v_lines
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id
    AND item_type = 'product'
    AND quantity > received_quantity;

  RETURN public.rpc_receive_purchase_order_lines(p_purchase_order_id, p_warehouse_id, v_lines);
END;
$$;

COMMENT ON FUNCTION public.rpc_receive_purchase_order IS
  'Wrapper fino (20261114040000) sobre rpc_receive_purchase_order_lines: '
  'recebe TODAS as linhas de produto ainda por receber, na quantidade '
  'remanescente — mesmo comportamento de sempre para quem já chama este RPC '
  '(receção total). Exige purchase_orders.edit + purchase_orders.receive + '
  'inventory.edit. Para receção parcial explícita, usar '
  'rpc_receive_purchase_order_lines diretamente.';

REVOKE ALL ON FUNCTION public.rpc_receive_purchase_order FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_receive_purchase_order TO authenticated;


-- ============================================================
-- 4. rpc_update_purchase_order — guarda nova: rejeita a edição (DELETE+
--    INSERT de purchase_order_items) se alguma linha já tiver
--    received_quantity > 0. Corpo idêntico ao de 20261113290000 exceto o
--    bloco assinalado "NOVO (20261114040000)" abaixo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_update_purchase_order(
  p_purchase_order_id uuid,
  p_order             jsonb,
  p_items             jsonb
)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      uuid;
  v_before     public.purchase_orders;
  v_order      public.purchase_orders;
  v_item       jsonb;
  v_diff       jsonb := '{}'::jsonb;
  v_po_diff    jsonb := '{}'::jsonb;
  v_old_json   jsonb;
  v_new_json   jsonb;
  v_key        text;
  v_new_status text;
  v_editable_cols text[] := ARRAY[
    'supplier_id','order_date','expected_delivery','status','total_value','notes'
  ];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_update RLS ──────────────────
  -- Predicate (2): the edit permission (checked first — fail before any read/write).
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Load the before-image (for the diff + org-scope guard) ────────────────
  SELECT * INTO v_before FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Predicate (1): the existing row's org must be in the caller's visible-org scope.
  IF NOT public.fn_deal_org_in_scope(v_before.organization_id) THEN
    RAISE EXCEPTION 'Encomenda fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── NOVO (20261114040000): impede editar (DELETE+INSERT de itens) uma
  --    encomenda com progresso de receção — apagaria received_quantity sem
  --    deixar rasto. Isto bloqueia também, de facto, status='cancelled'
  --    (a chamada inteira falha antes de qualquer escrita): não se cancela
  --    uma encomenda já parcial/totalmente recebida, o caminho correto é
  --    rpc_register_supplier_return.
  IF EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id AND received_quantity > 0
  ) THEN
    RAISE EXCEPTION 'Esta encomenda já tem linhas recebidas (parcial ou totalmente) — não é possível editá-la nem cancelá-la. Para devolver mercadoria já recebida, usa rpc_register_supplier_return.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── NOVO (20261113290000): exige purchase_orders.approve ADICIONALMENTE a
  --    .edit, só quando esta chamada está mesmo a transitar o status para
  --    'ordered' (não em updates que já estavam em 'ordered' e mantêm o
  --    estado, nem em updates que mudam outros campos sem tocar no status).
  v_new_status := COALESCE(nullif(p_order ->> 'status', ''), 'pending');
  IF v_new_status = 'ordered' AND v_before.status IS DISTINCT FROM 'ordered' THEN
    IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.approve') THEN
      RAISE EXCEPTION 'Sem permissão para aprovar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE the order (identical column set to the FE update) ──────────────
  UPDATE public.purchase_orders
  SET supplier_id       = nullif(p_order ->> 'supplier_id', '')::uuid,
      order_date        = (p_order ->> 'order_date')::date,
      expected_delivery = nullif(p_order ->> 'expected_delivery', '')::date,
      status            = v_new_status,
      total_value       = COALESCE((p_order ->> 'total_value')::numeric, 0),
      notes             = nullif(p_order ->> 'notes', '')
  WHERE id = p_purchase_order_id
  RETURNING * INTO v_order;

  -- ── Rewrite items: delete-all then re-insert (matches the FE) ─────────────
  DELETE FROM public.purchase_order_items WHERE purchase_order_id = p_purchase_order_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, service_id, description, sku,
        quantity, unit_price, vat_rate, vat_amount, total_price,
        selected_attributes, notes
      )
      VALUES (
        p_purchase_order_id,
        v_item ->> 'item_type',
        nullif(v_item ->> 'product_id', '')::uuid,
        nullif(v_item ->> 'service_id', '')::uuid,
        v_item ->> 'description',
        nullif(v_item ->> 'sku', ''),
        (v_item ->> 'quantity')::numeric,
        (v_item ->> 'unit_price')::numeric,
        (v_item ->> 'vat_rate')::numeric,
        (v_item ->> 'vat_amount')::numeric,
        (v_item ->> 'total_price')::numeric,
        COALESCE(v_item -> 'selected_attributes', '{}'::jsonb),
        nullif(v_item ->> 'notes', '')
      );
    END LOOP;
  END IF;

  -- ── Build the combined diff across both tables ────────────────────────────
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_order);
  FOREACH v_key IN ARRAY v_editable_cols LOOP
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_po_diff := v_po_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  -- ── Emit the single consolidated UPDATE audit row only when the PO itself
  --    actually changed — same pattern as rpc_update_deal (20260730010000), which
  --    skips the write when its diff is '{}'. This avoids an "empty" UPDATE row
  --    (no real change in purchase_orders) every time the user re-submits the form
  --    without editing any field. When there IS a real PO change we also attach the
  --    resulting item set so the single row reflects the full save. ───────────
  IF v_po_diff <> '{}'::jsonb THEN
    v_diff := v_diff
      || jsonb_build_object('purchase_orders', v_po_diff)
      || jsonb_build_object(
           'purchase_order_items', jsonb_build_object('new', COALESCE(p_items, '[]'::jsonb))
         );

    PERFORM public.fn_manual_audit_log(
      'purchase_orders', p_purchase_order_id, v_order.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_order;
END;
$$;

COMMENT ON FUNCTION public.rpc_update_purchase_order IS
  'Edita uma encomenda e reescreve as suas linhas (DELETE+INSERT). Exige '
  'purchase_orders.edit sempre, purchase_orders.approve adicionalmente só na '
  'transição real para ''ordered'' (20261113290000). Rejeita a edição por '
  'inteiro (20261114040000) se alguma linha já tiver received_quantity > 0 — '
  'inclui de facto bloquear status=''cancelled'' numa encomenda já recebida '
  '(parcial ou totalmente); usar rpc_register_supplier_return nesse caso.';

REVOKE ALL ON FUNCTION public.rpc_update_purchase_order(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_purchase_order(uuid, jsonb, jsonb) TO authenticated;


-- ============================================================
-- Verification notes (para revisão humana / testes em transação com
-- ROLLBACK — não executadas nesta migration)
-- ============================================================
--
-- 1. Encomenda com 2 linhas de produto (100 e 50 unidades). Receber
--    parcialmente a 1ª linha (60 de 100):
--      SELECT rpc_receive_purchase_order_lines(po_id, warehouse_id,
--        jsonb_build_array(jsonb_build_object('purchase_order_item_id', item1_id, 'quantity', 60)));
--    Esperado: status devolvido = 'partially_received'; purchase_order_items
--    da linha 1 com received_quantity=60; stocks.quantity/average_cost
--    atualizados; stock_movements com 1 linha nova, reference_id=item1_id.
--
-- 2. Receber o resto da 1ª linha (40) + a 2ª linha toda (50) numa só chamada:
--      SELECT rpc_receive_purchase_order_lines(po_id, warehouse_id,
--        jsonb_build_array(
--          jsonb_build_object('purchase_order_item_id', item1_id, 'quantity', 40),
--          jsonb_build_object('purchase_order_item_id', item2_id, 'quantity', 50)
--        ));
--    Esperado: status devolvido = 'received'; ambas as linhas com
--    received_quantity = quantity.
--
-- 3. Tentar receber mais do que o disponível numa linha (ex. 10 numa linha
--    já 100% recebida, ou mais do que a diferença quantity-received_quantity)
--    deve ser rejeitado com mensagem clara incluindo os números.
--
-- 4. rpc_update_purchase_order numa encomenda com received_quantity > 0 em
--    qualquer linha deve ser rejeitado, ANTES de qualquer DELETE.
--
-- 5. rpc_receive_purchase_order (wrapper) numa encomenda sem receções
--    prévias deve continuar a receber tudo de uma vez, devolvendo
--    status='received' — comportamento idêntico ao de antes desta migration.
--
-- 6. RLS/permissões inalteradas: mesmas 3 (purchase_orders.edit/.receive +
--    inventory.edit) do RPC de receção total; nenhuma tabela nova, nenhuma
--    policy nova.
