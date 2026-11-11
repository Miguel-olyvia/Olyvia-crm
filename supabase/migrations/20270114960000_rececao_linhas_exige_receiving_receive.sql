-- ============================================================
-- 20270114960000_rececao_linhas_exige_receiving_receive
-- ============================================================
-- Falha (F10 do reteste): a receção por leitura (rpc_receive_by_code) pede receiving.receive + purchase_orders.receive +
--   inventory.edit, mas rpc_receive_purchase_order_lines (EXECUTE para authenticated) só pedia as duas últimas: pela API
--   recebia-se mercadoria sem a permissão de receber.
-- Alterações (as únicas; o resto é o texto vivo): à condição de permissão junta-se
--   OR NOT has_anew_permission_for_org(auth.uid(), 'receiving.receive', <organização da PO>), com a mesma mensagem; e o
--   bloco de permissão passa para antes dos dois testes de estado (recebida / cancelada), que ficam iguais.
-- Custo: mais uma consulta de permissão por receção (na chamada interna de rpc_receive_by_code, a segunda).
-- Decisão (D3): manter receiving.receive e acrescentar a verificação nas duas funções que gravam a receção
--   (20270114960000 e 20270114970000). Revisão de segurança (MEDIUM): a verificação de permissão fica ANTES dos testes de
--   estado (como em rpc_receive_by_code e rpc_preview_po_receipt): quem não pode receber não fica a saber se a PO está
--   recebida ou cancelada. A existência continua primeiro (é dela que vem a organização).
-- Não se alteram (revisão da base): rpc_preview_po_receipt e rpc_receive_by_code chamam a de linhas por dentro e a recusa
--   dela propaga-se (a pré-visualização só apanha o seu próprio OLPV1); rpc_receive_by_code já exige as três.
-- Quem chama, lido em pg_proc a 11/11: rpc_receive_by_code, rpc_receive_purchase_order, rpc_preview_po_receipt e o diálogo
--   antigo de PurchaseOrders.tsx (já não é aberto).
-- Uso normal: nada. A Receção já pede as três; na nike, todos os papéis com purchase_orders.receive têm também
--   receiving.receive e inventory.edit (E2E-PERM ×2, «tecnico de armazem», System Admin, Super Admin: lido a 11/11).
--   Quem tem as três vê as mesmas mensagens de estado de hoje.
-- Fica de fora: retirar receiving.receive (alternativa B de D3), o editor de permissões (F13, outro agente),
--   rpc_po_receipt_release_to_stock (não é uma receção do fornecedor), a permissão de rpc_cancel_po_remainder.
--
-- Desenho: vault/ficheiros/inventario/correcao-reteste-desenho.md (fechado, com as decisões D1 a D6 do coordenador).
-- Base: RH (uetjghdkwbywbftedtth), que só tem a nike. Nada disto chega à Mudelar por esta base; na base principal só entra
--   com o ramo, e antes disso diz-se ao utilizador o que muda.
-- Partida: a definição VIVA (pg_get_functiondef, lida a 11/11), não um ficheiro. Pré-condição md5 da definição viva e do
--   ACL; no fim confere-se o md5 da definição nova, o SECURITY, o search_path e o ACL (CREATE OR REPLACE conserva o ACL).
--   O md5 esperado depois conta com os CR deste ficheiro (o corpo de uma função guarda os bytes do ficheiro): este ficheiro
--   tem de ficar em CRLF; convertido para LF, a conferência falha e a transação desfaz-se (falha segura).
-- Aplicar: SET lock_timeout de sessão antes do BEGIN e RESET no fim (o CLI pode não correr o ficheiro numa só transação).
-- Teste: supabase/tests/inventario_reteste_buracos.test.sql — correr ANTES do db push (vermelho) e DEPOIS (verde).

SET lock_timeout = '5s';

BEGIN;

-- ─── Pré-condição: a definição viva é a que foi lida (md5) e o ACL é o de hoje ──────────────────────────────────────────
DO $pre$
DECLARE
  v_oid oid := to_regprocedure('public.rpc_receive_purchase_order_lines(uuid,uuid,jsonb,date)');
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION '20270114960000: a função public.rpc_receive_purchase_order_lines(uuid,uuid,jsonb,date) não existe';
  END IF;
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM '09a0e6b4011628430a57d802f289d5f1' THEN
    RAISE EXCEPTION '20270114960000: a definição viva de rpc_receive_purchase_order_lines mudou desde que foi lida (md5 %); reler antes de aplicar',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114960000: o ACL de rpc_receive_purchase_order_lines mudou desde que foi lido';
  END IF;
END $pre$;

-- ─── A função (texto vivo + a alteração descrita no cabeçalho) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order_lines(p_purchase_order_id uuid, p_warehouse_id uuid, p_lines jsonb, p_actual_delivery_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_skip_stock       boolean;
  -- NOVO (20261204203500): embalagens — fator congelado na linha.
  v_units            integer;
  v_stock_qty        bigint;
  v_unit_cost        numeric;
  -- NOVO (20261206130000): destino por linha (EC / stock).
  v_alloc            record;
  v_to_order         bigint;
  v_to_stock         bigint;
  v_movement_id      uuid;
  v_sum_to_order     bigint := 0;
  v_sum_to_stock     bigint := 0;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_po.organization_id)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_po.organization_id)
     -- 20270114960000 (F10): a mesma terceira permissão que a Receção (rpc_receive_by_code) já pede.
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'receiving.receive', v_po.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270114960000 (F10): os testes de estado vêm depois da permissão.
  IF v_po.status = 'received' THEN
    RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
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

  -- NOVO (20261206130000): o destino passa a ser decidido por linha
  -- (fn_po_receipt_allocation). PO ligada a uma Encomenda Cliente ativa: a
  -- parte que a EC ainda precisa vai para a EC (sem stock geral, como desde
  -- 20261115210000); o excedente, ou tudo se a EC estiver cancelada/apagada/
  -- não assinada, entra em stock. PO de stock: tudo para stock, como antes.
  -- v_skip_stock (stock_skipped no resultado) = nada entrou em stock numa PO
  -- de contrato; é calculado no fim.
  v_skip_stock := false;

  -- Serializa receções de POs diferentes da mesma EC (cada uma lê a
  -- necessidade em aberto da EC antes de escrever).
  IF v_po.source_type = 'contract' AND v_po.source_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('po_receipt_contract:' || v_po.source_id::text, 0));
  END IF;

  FOR v_line_input IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_id       := nullif(v_line_input ->> 'purchase_order_item_id', '')::uuid;
    v_qty_requested := nullif(v_line_input ->> 'quantity', '')::numeric;

    IF v_line_id IS NULL THEN
      RAISE EXCEPTION 'purchase_order_item_id em falta numa linha de receção' USING ERRCODE = 'check_violation';
    END IF;

    SELECT id, product_id, item_type, quantity, unit_price, received_quantity, description,
           uom_id, units_per_uom, supplier_sku
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
    v_balance := NULL;

    -- NOVO (20261204203500): a linha está na unidade de compra (ex. PK100);
    -- o stock entra na unidade do produto. received_quantity continua na
    -- unidade da linha. Custo por unidade de stock = preço da linha / fator.
    -- Com fator 1 tudo fica exatamente como antes.
    v_units     := COALESCE(v_item.units_per_uom, 1);
    v_stock_qty := v_qty_int::bigint * v_units;
    IF v_stock_qty > 2147483647 THEN
      RAISE EXCEPTION 'A linha "%" excede o limite de stock (% unidades)', v_item.description, v_stock_qty
        USING ERRCODE = 'numeric_value_out_of_range';
    END IF;
    v_unit_cost := CASE WHEN v_units = 1 THEN v_item.unit_price
                        ELSE round(v_item.unit_price / v_units, 6) END;

    -- NOVO (20261206130000): repartição EC / stock em unidades de stock.
    SELECT * INTO v_alloc
    FROM public.fn_po_receipt_allocation(v_item.id, v_stock_qty);
    v_to_order := v_alloc.units_to_order::bigint;
    v_to_stock := v_stock_qty - v_to_order;
    v_movement_id := NULL;

    IF v_to_stock <= 0 THEN
      -- Sem movimento de entrada — tudo vai para a Encomenda Cliente, não
      -- passa pelo stock geral. balance_after fica NULL no output
      -- (informativo, não há stock_movements gerado para esta linha).
      NULL;
    ELSE
      SELECT id INTO v_item_supplier_id
      FROM public.item_suppliers
      WHERE product_id = v_item.product_id
        AND supplier_id = v_po.supplier_id
        AND deleted_at IS NULL
      -- NOVO (20261204203500): primeiro a ligação na MESMA unidade da linha.
      ORDER BY (uom_id IS NOT DISTINCT FROM v_item.uom_id) DESC, is_preferred DESC
      LIMIT 1;

      INSERT INTO public.stock_movements (
        organization_id, product_id, warehouse_id, movement_type, quantity,
        document_number, document_type, item_supplier_id, unit_cost_at_time,
        reference_id, notes, created_by
      ) VALUES (
        v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_to_stock::integer,
        v_po.order_number, 'compra', v_item_supplier_id, v_unit_cost,
        v_item.id,
        CASE
          -- Tudo para stock: texto exatamente como antes.
          WHEN v_to_order = 0 AND v_alloc.allocation_reason = 'stock_order' AND v_units = 1 THEN
            format('Receção de %s: %s unidades agora nesta linha (total recebido %s de %s)',
                   v_po.order_number, v_qty_int, v_item.received_quantity + v_qty_requested, v_item.quantity)
          WHEN v_to_order = 0 AND v_alloc.allocation_reason = 'stock_order' THEN
            format('Receção de %s: %s × %s un. (%s unidades de stock) agora nesta linha (total recebido %s de %s)',
                   v_po.order_number, v_qty_int, v_units, v_stock_qty, v_item.received_quantity + v_qty_requested, v_item.quantity)
          -- NOVO (20261206130000): PO de Encomenda Cliente.
          WHEN v_to_order = 0 THEN
            format('Receção de %s: %s unidades de stock agora nesta linha (total recebido %s de %s) — %s',
                   v_po.order_number, v_to_stock, v_item.received_quantity + v_qty_requested, v_item.quantity,
                   CASE WHEN v_alloc.allocation_reason = 'client_order_inactive'
                        THEN format('encomenda cliente %s inativa, entra em stock', COALESCE(v_alloc.contract_order_number, '?'))
                        ELSE format('necessidade da encomenda cliente %s já coberta, entra em stock', COALESCE(v_alloc.contract_order_number, '?'))
                   END)
          ELSE
            format('Receção de %s: %s unidades de stock recebidas nesta linha, %s para a encomenda cliente %s e %s para stock (total recebido %s de %s)',
                   v_po.order_number, v_stock_qty, v_to_order, COALESCE(v_alloc.contract_order_number, '?'), v_to_stock,
                   v_item.received_quantity + v_qty_requested, v_item.quantity)
        END,
        v_actor
      )
      RETURNING id, balance_after INTO v_movement_id, v_balance;
    END IF;

    UPDATE public.purchase_order_items
    SET received_quantity       = received_quantity + v_qty_requested,
        received_to_stock_units = received_to_stock_units + v_to_stock  -- NOVO (20261206130000)
    WHERE id = v_item.id
    RETURNING received_quantity INTO v_received_total;

    -- NOVO (20261206130000): histórico da receção.
    INSERT INTO public.purchase_order_receipts (
      organization_id, purchase_order_id, purchase_order_item_id, product_id, kind,
      warehouse_id, quantity, units_per_uom, units_to_order, units_to_stock,
      contract_id, allocation_reason, stock_movement_id, received_by
    ) VALUES (
      v_po.organization_id, p_purchase_order_id, v_item.id, v_item.product_id, 'receipt',
      p_warehouse_id, v_qty_requested, v_units, v_to_order, v_to_stock,
      CASE WHEN v_po.source_type = 'contract' THEN v_alloc.contract_id END,
      v_alloc.allocation_reason, v_movement_id, v_actor
    );

    v_sum_to_order := v_sum_to_order + v_to_order;
    v_sum_to_stock := v_sum_to_stock + v_to_stock;

    v_lines_out := v_lines_out || jsonb_build_object(
      'product_id',               v_item.product_id,
      'quantity_received_now',    v_qty_int,
      'received_quantity_total',  v_received_total,
      'remaining',                v_item.quantity - v_received_total,
      'balance_after',            v_balance,
      'stock_updated',            (v_to_stock > 0),
      -- NOVO (20261204203500): chaves acrescentadas; as anteriores não mudam.
      'units_per_uom',            v_units,
      'stock_quantity_now',       CASE WHEN v_to_stock > 0 THEN v_to_stock END,
      -- NOVO (20261206130000): destino da receção. qty_* na unidade da linha
      -- (pode ser fracionária numa embalagem repartida); units_* em unidades
      -- de stock.
      'purchase_order_item_id',   v_item.id,
      'qty_to_order',             round(v_to_order::numeric / v_units, 4),
      'qty_to_stock',             round(v_to_stock::numeric / v_units, 4),
      'units_to_order',           v_to_order,
      'units_to_stock',           v_to_stock,
      'contract_id',              v_alloc.contract_id,
      'contract_order_number',    v_alloc.contract_order_number,
      'contract_active',          v_alloc.contract_active,
      'allocation_reason',        v_alloc.allocation_reason,
      'destination',              CASE WHEN v_to_order > 0 AND v_to_stock > 0 THEN 'split'
                                       WHEN v_to_order > 0 THEN 'client_order'
                                       ELSE 'stock' END
    );
  END LOOP;

  -- NOVO (20261206130000): stock_skipped = PO de contrato em que nada entrou
  -- em stock nesta receção (tudo foi para a EC). PO de stock: false.
  v_skip_stock := (v_po.source_type = 'contract' AND v_sum_to_stock = 0);

  SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(received_quantity), 0)
  INTO v_sum_quantity, v_sum_received
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';

  IF v_sum_quantity > 0 AND v_sum_received >= v_sum_quantity THEN
    v_new_status := 'received';
  ELSIF v_sum_received > 0 THEN
    v_new_status := 'partially_received';
  ELSE
    v_new_status := v_po.status;
  END IF;

  -- NOVO (20261130010000): actual_delivery_date só é gravada quando a
  -- encomenda fica TOTALMENTE recebida — numa receção parcial ainda não há
  -- "data de entrega" da encomenda como um todo.
  IF v_new_status = 'received' THEN
    UPDATE public.purchase_orders
    SET status = v_new_status,
        updated_at = now(),
        actual_delivery_date = COALESCE(p_actual_delivery_date, current_date)
    WHERE id = p_purchase_order_id;
  ELSE
    UPDATE public.purchase_orders
    SET status = v_new_status, updated_at = now()
    WHERE id = p_purchase_order_id;
  END IF;

  RETURN jsonb_build_object(
    'order_number',   v_po.order_number,
    'warehouse_id',   p_warehouse_id,
    'status',         v_new_status,
    'lines',          v_lines_out,
    'stock_skipped',  v_skip_stock,
    -- NOVO (20261206130000)
    'units_to_order_total', v_sum_to_order,
    'units_to_stock_total', v_sum_to_stock
  );
END;
$function$;

-- ─── Conferir: corpo novo (md5 com os CR deste ficheiro), DEFINER/INVOKER, search_path e ACL mantidos ───────────────────
DO $chk$
DECLARE
  v_oid oid := to_regprocedure('public.rpc_receive_purchase_order_lines(uuid,uuid,jsonb,date)');
BEGIN
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM '35159f1ea2eeeea221c887daf13cd9f8' THEN
    RAISE EXCEPTION '20270114960000: a definição nova de rpc_receive_purchase_order_lines não é a esperada (md5 %); o ficheiro tem de estar em CRLF',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM true
     OR (SELECT array_to_string(p.proconfig, ',')::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM 'search_path=public, pg_temp'
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114960000: rpc_receive_purchase_order_lines perdeu o SECURITY, o search_path ou o ACL';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
