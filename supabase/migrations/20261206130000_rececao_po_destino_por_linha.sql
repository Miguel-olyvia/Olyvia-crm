-- 20261206130000: receção de encomendas a fornecedor com destino por linha
--
-- Antes: PO ligada a uma Encomenda Cliente (source_type='contract') nunca dava
-- entrada em stock em nenhuma linha; o recebido contava todo como entregue à
-- EC, mesmo o excedente, e mesmo com a EC cancelada/apagada.
--
-- Agora, por linha recebida (fn_po_receipt_allocation):
--   * EC ativa (assinada, não apagada): vai para a EC o que a linha da EC
--     ainda precisa; o excedente entra em stock (e fica disponível para as
--     reservas FIFO das outras ECs).
--   * EC inativa: tudo entra em stock.
--   * PO de stock: tudo entra em stock, exatamente como antes (mesmo
--     movimento, mesmo texto, mesmo custo).
-- Receção acima do encomendado continua recusada.
--
-- Objetos:
--   + idx_quote_lines_quote_id (desempenho de fn_client_order_line_reservations)
--   + purchase_order_items.received_to_stock_units (unidades de stock; CHECK;
--     backfill sem movimentos; guarda contra escrita direta por authenticated)
--   + purchase_order_receipts (histórico append-only; RLS só leitura)
--   + fn_po_receipt_allocation (interna)
--   ~ rpc_receive_purchase_order_lines (rpc_receive_purchase_order delega
--     nela e não muda)
--   ~ rpc_revert_purchase_order_receipt
--   ~ fn_client_order_line_reservations (recebido da EC = recebido − stock)
--   + rpc_po_receipt_release_to_stock, rpc_preview_po_receipt
--
-- Segurança: mesmas assinaturas e retornos (só chaves novas no jsonb), SECURITY
-- DEFINER, search_path public, pg_temp, mesmas verificações de organização e
-- permissão. CREATE OR REPLACE mantém owner e GRANTs. Funções novas sem
-- EXECUTE para PUBLIC/anon.
--
-- Partiu das definições VIVAS (pg_get_functiondef em 2026-10-01). Reversão no
-- fim do ficheiro.

SET lock_timeout = '5s';

-- ── 0. Índice quote_lines(quote_id) ────────────────────────────────────────
-- Não existia. fn_client_order_line_reservations (agora chamada por cada
-- linha recebida de uma PO de contrato) fazia nested loop de todas as linhas
-- de bundle × contratos: ~450 ms por chamada na org maior; com o índice
-- ~15 ms (1 produto) / ~25 ms (org inteira). Medido em ROLLBACK a 2026-10-01.
-- quote_lines tem ~18 mil linhas: construção ~20 ms (bloqueia escritas
-- nesse intervalo; CONCURRENTLY não é possível dentro da transação).
CREATE INDEX IF NOT EXISTS idx_quote_lines_quote_id ON public.quote_lines (quote_id);
ANALYZE public.quote_lines;

-- ── 1. Coluna received_to_stock_units ──────────────────────────────────────
-- Unidades de STOCK (unidade do produto, como stock_movements.quantity) que
-- desta linha entraram no stock geral. O resto do recebido
-- (received_quantity × units_per_uom − received_to_stock_units) foi entregue
-- à Encomenda Cliente da PO. Guardado em unidades de stock (e não na unidade
-- da linha) para que uma embalagem possa ser repartida sem arredondamentos:
-- 2 × PK100 para uma necessidade de 150 → 150 para a EC e 50 para stock.
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS received_to_stock_units numeric NOT NULL DEFAULT 0;

DO $c$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.purchase_order_items'::regclass
      AND conname = 'purchase_order_items_received_to_stock_units_range'
  ) THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT purchase_order_items_received_to_stock_units_range
      CHECK (received_to_stock_units >= 0
             AND received_to_stock_units <= received_quantity * units_per_uom);
  END IF;
END
$c$;

COMMENT ON COLUMN public.purchase_order_items.received_to_stock_units IS
  'Unidades de stock (unidade do produto) desta linha que deram entrada no stock geral. '
  'received_quantity × units_per_uom − received_to_stock_units = entregue à Encomenda Cliente. '
  'Só escrito pelas RPCs de receção/reversão/passagem para stock (gatilho de guarda).';

-- ── 2. Backfill ────────────────────────────────────────────────────────────
-- POs de stock: tudo o que foi recebido entrou em stock (verificado em
-- 2026-10-01: soma das entradas 'compra' por estornar = received × fator em
-- todas as linhas). POs de contrato: 0 (a receção não passava pelo stock).
-- Exceção conhecida: PO-2026-0010 (contrato, 1 un. "Banheira EVA") tem uma
-- entrada de stock de antes da regra de 20261115210000; fica com 0 para não
-- alterar a vista da EC — a reversão aceita esse legado (ver abaixo).
-- Não cria movimentos nem linhas em purchase_order_receipts. Idempotente.
SELECT set_config('app.audit_bypass', 'on', true);

UPDATE public.purchase_order_items poi
SET received_to_stock_units = poi.received_quantity * poi.units_per_uom
FROM public.purchase_orders po
WHERE po.id = poi.purchase_order_id
  AND po.source_type IS DISTINCT FROM 'contract'
  AND poi.item_type = 'product'
  AND poi.received_quantity > 0
  AND poi.received_to_stock_units = 0;

SELECT set_config('app.audit_bypass', '', true);

-- ── 3. Guarda: só funções do sistema escrevem received_to_stock_units ──────
-- purchase_order_items tem UPDATE/INSERT para authenticated por RLS (só
-- âmbito de organização). Sem esta guarda bastava um PATCH para mudar o que
-- conta como entregue à EC. SECURITY INVOKER de propósito (current_user é o
-- role do statement; as RPCs SECURITY DEFINER correm como postgres).
CREATE OR REPLACE FUNCTION public.fn_purchase_order_items_guard_system_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND COALESCE(NEW.received_to_stock_units, 0) <> 0 THEN
      RAISE EXCEPTION 'received_to_stock_units só pode ser escrito pelas funções do sistema'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.received_to_stock_units IS DISTINCT FROM OLD.received_to_stock_units THEN
      RAISE EXCEPTION 'received_to_stock_units só pode ser escrito pelas funções do sistema'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_purchase_order_items_guard_system_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_purchase_order_items_00_guard_system_columns ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_00_guard_system_columns
  BEFORE INSERT OR UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_order_items_guard_system_columns();

-- ── 4. Histórico de receções (append-only) ─────────────────────────────────
-- Uma linha por linha de PO recebida (ou passada para stock). Só escrita
-- pelas RPCs SECURITY DEFINER; authenticated só lê (mesma regra de
-- purchase_order_items). Receções anteriores a esta migração não têm linhas.
CREATE TABLE IF NOT EXISTS public.purchase_order_receipts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.anew_organizations(id),
  purchase_order_id      uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  -- SET NULL: rpc_update_purchase_order apaga e recria as linhas de uma PO
  -- sem receções (p.ex. depois de uma reversão); o histórico fica pela PO.
  purchase_order_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  product_id             uuid,
  kind                   text NOT NULL DEFAULT 'receipt'
                         CHECK (kind IN ('receipt', 'release_to_stock')),
  warehouse_id           uuid REFERENCES public.warehouses(id),
  quantity               numeric NOT NULL CHECK (quantity >= 0),   -- unidade da linha
  units_per_uom          integer NOT NULL DEFAULT 1 CHECK (units_per_uom >= 1),
  units_to_order         numeric NOT NULL DEFAULT 0 CHECK (units_to_order >= 0),  -- unidades de stock entregues à EC
  units_to_stock         numeric NOT NULL DEFAULT 0 CHECK (units_to_stock >= 0),  -- unidades de stock que entraram em stock
  contract_id            uuid REFERENCES public.client_contracts(id) ON DELETE SET NULL,
  allocation_reason      text,
  stock_movement_id      uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  delivery_note_id       uuid,  -- Fase 2/4 (guia de remessa); sem FK por agora
  notes                  text,
  received_by            uuid,
  received_at            timestamptz NOT NULL DEFAULT now(),
  reverted_at            timestamptz,
  reverted_by            uuid,
  revert_reason          text,
  revert_movement_id     uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.purchase_order_receipts IS
  'Histórico das receções de encomendas a fornecedor por linha: quanto foi para a Encomenda Cliente e quanto para stock. Só escrito por RPCs.';

CREATE INDEX IF NOT EXISTS idx_purchase_order_receipts_item
  ON public.purchase_order_receipts (purchase_order_item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_receipts_po
  ON public.purchase_order_receipts (purchase_order_id, received_at);
CREATE INDEX IF NOT EXISTS idx_purchase_order_receipts_contract
  ON public.purchase_order_receipts (contract_id) WHERE contract_id IS NOT NULL;

ALTER TABLE public.purchase_order_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.purchase_order_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.purchase_order_receipts TO authenticated;
GRANT ALL ON TABLE public.purchase_order_receipts TO service_role;

DROP POLICY IF EXISTS purchase_order_receipts_select ON public.purchase_order_receipts;
CREATE POLICY purchase_order_receipts_select ON public.purchase_order_receipts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_receipts.purchase_order_id
      AND po.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  ));

-- ── 5. Destino de cada receção ─────────────────────────────────────────────
-- Destino de uma receção de p_units unidades de STOCK numa linha de PO:
-- quanto vai para a Encomenda Cliente da PO e quanto para stock.
-- Interna (sem EXECUTE para authenticated); chamada pelas RPCs SECURITY
-- DEFINER de receção. Lê o estado atual (inclui receções anteriores da mesma
-- transação).
--
-- Regra:
--  * PO sem ligação a EC (source_type <> 'contract') → tudo para stock.
--  * EC inexistente, apagada ou não assinada → tudo para stock.
--  * EC ativa → para a EC vai LEAST(p_units, ceil(LEAST(em_aberto, teto))):
--     em_aberto = Σ GREATEST(0, necessário − servido − recebido) das linhas da
--                 EC que esta linha de PO cobre (fn_client_order_line_reservations);
--     teto      = o que fn_client_order_line_reservations ainda consegue contar
--                 como recebido desta origem — garante que tudo o que vai para
--                 a EC aparece como recebido na EC (nada se "perde").
--    - linha de PO ligada (quote_line_id): linhas da EC com a mesma
--      (quote_line_id, component_index, produto); teto =
--      LEAST(necessário, encomendado ligado) − recebido ligado.
--    - linha de PO sem quote_line_id (POs antigas, p.ex. PO-2026-0012): a
--      mesma regra do "pool" de fn_client_order_line_reservations — todas as
--      linhas da EC com o mesmo produto; teto = LEAST(pool encomendado,
--      Σ (necessário − parte coberta por POs ligadas)) − pool recebido.
--    ceil: se a necessidade não for inteira, a parte fracionária fica na EC
--    (o stock só regista unidades inteiras).
CREATE OR REPLACE FUNCTION public.fn_po_receipt_allocation(p_purchase_order_item_id uuid, p_units numeric)
 RETURNS TABLE(contract_id uuid, contract_order_number text, contract_active boolean, units_to_order numeric, units_to_stock numeric, allocation_reason text, open_units numeric, cap_units numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item     record;
  v_cc       record;
  v_units    numeric := GREATEST(COALESCE(p_units, 0), 0);
  v_open     numeric := 0;
  v_cap      numeric := 0;
  v_to_order numeric := 0;
  v_reason   text;
BEGIN
  SELECT poi.id, poi.product_id, poi.quote_line_id, poi.component_index,
         po.organization_id, po.source_type, po.source_id
  INTO v_item
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.id = p_purchase_order_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha de encomenda % não encontrada', p_purchase_order_item_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_item.source_type IS DISTINCT FROM 'contract' OR v_item.source_id IS NULL OR v_item.product_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::boolean, 0::numeric, v_units, 'stock_order'::text, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;

  SELECT cc.id,
         COALESCE(cc.order_number, cc.contract_number) AS num,
         (cc.deleted_at IS NULL AND cc.status IN ('signed', 'assinado')) AS active
  INTO v_cc
  FROM public.client_contracts cc
  WHERE cc.id = v_item.source_id
    AND cc.organization_id = v_item.organization_id;

  IF NOT FOUND OR NOT v_cc.active THEN
    RETURN QUERY SELECT v_item.source_id, v_cc.num, false, 0::numeric, v_units, 'client_order_inactive'::text, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;

  WITH r AS (
    SELECT x.quote_line_id, x.component_index, x.qty_needed, x.qty_served, x.qty_received
    FROM public.fn_client_order_line_reservations(v_item.organization_id, ARRAY[v_item.product_id]) x
    WHERE x.contract_id = v_item.source_id
      AND x.product_id  = v_item.product_id
  ),
  -- Mesmas regras de po_items em fn_client_order_line_reservations.
  pi AS (
    SELECT poi.quote_line_id   AS ql,
           poi.component_index AS ci,
           (poi.quantity * COALESCE(poi.units_per_uom, 1))::numeric AS q,
           GREATEST(0,
             CASE WHEN po.status = 'received' THEN poi.quantity
                  ELSE LEAST(COALESCE(poi.received_quantity, 0), poi.quantity)
             END * COALESCE(poi.units_per_uom, 1)
             - COALESCE(poi.received_to_stock_units, 0)
           )::numeric AS rv
    FROM public.purchase_orders po
    JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
    WHERE po.source_type = 'contract'
      AND po.source_id = v_item.source_id
      AND po.status IS DISTINCT FROM 'cancelled'
      AND po.deleted_at IS NULL
      AND poi.product_id = v_item.product_id
  ),
  linked AS (
    SELECT ql, ci, SUM(q) AS lq, SUM(rv) AS lrv
    FROM pi WHERE ql IS NOT NULL
    GROUP BY ql, ci
  ),
  rl AS (
    SELECT r.*, COALESCE(l.lq, 0) AS lq, COALESCE(l.lrv, 0) AS lrv
    FROM r
    LEFT JOIN linked l
      ON l.ql = r.quote_line_id
     AND l.ci IS NOT DISTINCT FROM r.component_index
  )
  SELECT
    CASE WHEN v_item.quote_line_id IS NOT NULL THEN
      COALESCE(SUM(GREATEST(0, rl.qty_needed - rl.qty_served - rl.qty_received))
               FILTER (WHERE rl.quote_line_id = v_item.quote_line_id
                         AND rl.component_index IS NOT DISTINCT FROM v_item.component_index), 0)
    ELSE
      COALESCE(SUM(GREATEST(0, rl.qty_needed - rl.qty_served - rl.qty_received)), 0)
    END,
    CASE WHEN v_item.quote_line_id IS NOT NULL THEN
      GREATEST(0,
        LEAST(
          COALESCE(SUM(rl.qty_needed) FILTER (WHERE rl.quote_line_id = v_item.quote_line_id
                                                AND rl.component_index IS NOT DISTINCT FROM v_item.component_index), 0),
          COALESCE((SELECT l.lq FROM linked l WHERE l.ql = v_item.quote_line_id
                      AND l.ci IS NOT DISTINCT FROM v_item.component_index), 0)
        )
        - COALESCE((SELECT l.lrv FROM linked l WHERE l.ql = v_item.quote_line_id
                      AND l.ci IS NOT DISTINCT FROM v_item.component_index), 0))
    ELSE
      GREATEST(0,
        LEAST(
          COALESCE((SELECT SUM(q) FROM pi WHERE ql IS NULL), 0),
          COALESCE(SUM(rl.qty_needed - LEAST(rl.qty_needed, rl.lq)), 0)
        )
        - COALESCE((SELECT SUM(rv) FROM pi WHERE ql IS NULL), 0))
    END
  INTO v_open, v_cap
  FROM rl;

  v_to_order := LEAST(v_units, ceil(LEAST(COALESCE(v_open, 0), COALESCE(v_cap, 0))));
  v_reason := CASE
    WHEN v_to_order >= v_units AND v_units > 0 THEN 'client_order'
    WHEN v_to_order > 0 THEN 'client_order_surplus_to_stock'
    ELSE 'client_order_already_covered'
  END;

  RETURN QUERY SELECT v_item.source_id, v_cc.num, true, v_to_order, v_units - v_to_order, v_reason, v_open, v_cap;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_po_receipt_allocation(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_po_receipt_allocation(uuid, numeric) TO service_role;

-- ── 6. Receção por linhas (CREATE OR REPLACE; mesma assinatura, ACL mantido) ──
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

  IF v_po.status = 'received' THEN
    RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
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

-- ── 7. Reversão da receção (CREATE OR REPLACE; mesma assinatura, ACL mantido) ──
CREATE OR REPLACE FUNCTION public.rpc_revert_purchase_order_receipt(p_purchase_order_id uuid, p_item_ids uuid[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor          uuid;
  v_po             public.purchase_orders%ROWTYPE;
  v_reason         text;
  v_skip_stock     boolean;
  v_item_id        uuid;
  v_item           record;
  v_line_mov_ids   uuid[];
  v_line_mov_units bigint;
  v_line_expected  numeric;
  v_all_mov_ids    uuid[] := ARRAY[]::uuid[];
  v_lines_out      jsonb := '[]'::jsonb;
  v_audit_lines    jsonb := '[]'::jsonb;
  v_grp            record;
  v_stock_qty      integer;
  v_stock_cost     numeric;
  v_new_cost       numeric;
  v_mov            public.stock_movements%ROWTYPE;
  v_sum_quantity   numeric;
  v_sum_received   numeric;
  v_new_status     text;
  v_prev_bypass    text;
  v_diff           jsonb;
  -- NOVO (20261206130000)
  v_line_legacy    boolean;
  v_rev_mov_id     uuid;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Trancar a encomenda serializa com receções e reversões concorrentes
  -- (rpc_receive_purchase_order_lines tranca-a da mesma forma).
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_po.status NOT IN ('received', 'partially_received') THEN
    RAISE EXCEPTION 'Só é possível reverter a receção de encomendas recebidas ou parcialmente recebidas (estado atual: %)', v_po.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.revert_receipt')
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para reverter receções desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Indica o motivo da reversão (pelo menos 3 caracteres)' USING ERRCODE = 'check_violation';
  END IF;

  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'Escolhe pelo menos uma linha para reverter' USING ERRCODE = 'check_violation';
  END IF;
  IF array_position(p_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A lista de linhas tem valores vazios' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_item_ids) AS t(x)) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'A lista de linhas tem linhas repetidas' USING ERRCODE = 'check_violation';
  END IF;

  v_skip_stock := (v_po.source_type = 'contract');

  -- ── 1. Validar e trancar as linhas e as entradas de stock de cada uma ──
  FOREACH v_item_id IN ARRAY p_item_ids
  LOOP
    SELECT id, product_id, item_type, quantity, received_quantity, description,
           COALESCE(units_per_uom, 1) AS units_per_uom,
           received_to_stock_units  -- NOVO (20261206130000)
    INTO v_item
    FROM public.purchase_order_items
    WHERE id = v_item_id AND purchase_order_id = p_purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', v_item_id
        USING ERRCODE = 'no_data_found';
    END IF;

    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto — serviços não têm receção de stock a reverter', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_item.received_quantity IS NULL OR v_item.received_quantity <= 0 THEN
      RAISE EXCEPTION 'A linha "%" não tem quantidade recebida para reverter', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    -- Entradas da receção desta linha ainda sem estorno. O filtro por
    -- organização e produto usa idx_stock_movements_product (não há índice
    -- em reference_id).
    SELECT COALESCE(array_agg(t.id ORDER BY t.id), ARRAY[]::uuid[]),
           COALESCE(sum(t.quantity), 0)
    INTO v_line_mov_ids, v_line_mov_units
    FROM (
      SELECT m.id, m.quantity
      FROM public.stock_movements m
      WHERE m.reference_id = v_item.id
        AND m.organization_id = v_po.organization_id
        AND m.product_id = v_item.product_id
        AND m.document_type = 'compra'
        AND m.movement_type = 'entrada'
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversal_of_movement_id = m.id
        )
      ORDER BY m.id
      FOR UPDATE OF m
    ) t;

    -- NOVO (20261206130000): as entradas por estornar têm de explicar a
    -- parte da linha que foi para stock (received_to_stock_units); a parte
    -- entregue à Encomenda Cliente não tem movimento e só repõe contadores.
    -- PO de stock: received_to_stock_units = recebido × fator (backfill),
    -- exatamente a verificação anterior. PO de contrato sem entradas: 0.
    -- Legado (receção anterior a esta migração, sem linhas em
    -- purchase_order_receipts) com entradas = recebido × fator, como antes
    -- (PO-2026-0010): continua a reverter-se.
    v_line_expected := v_item.received_to_stock_units;
    v_line_legacy := NOT EXISTS (
        SELECT 1 FROM public.purchase_order_receipts pr
        WHERE pr.purchase_order_item_id = v_item.id
      )
      AND v_line_mov_units = v_item.received_quantity * v_item.units_per_uom;

    IF v_line_mov_units <> v_line_expected AND NOT v_line_legacy THEN
      RAISE EXCEPTION 'Não é possível reverter "%" automaticamente: a linha tem % recebidas (% unidades de stock deram entrada em stock), mas as entradas de stock por estornar somam % unidades',
        v_item.description, v_item.received_quantity, v_line_expected, v_line_mov_units
        USING ERRCODE = 'check_violation';
    END IF;

    v_all_mov_ids := v_all_mov_ids || v_line_mov_ids;

    v_lines_out := v_lines_out || jsonb_build_object(
      'purchase_order_item_id', v_item.id,
      'description',            v_item.description,
      'quantity_reverted',      v_item.received_quantity,
      'stock_reverted',         cardinality(v_line_mov_ids) > 0,
      'movements_reverted',     cardinality(v_line_mov_ids),
      -- NOVO (20261206130000)
      'units_reverted_from_stock',        v_line_mov_units,
      'units_reverted_from_client_order', GREATEST(0, v_item.received_quantity * v_item.units_per_uom - v_line_mov_units)
    );
  END LOOP;

  -- ── 2. Stock suficiente e custo médio, por produto/armazém ──
  -- Tudo verificado antes do primeiro estorno. Ordem fixa para trancar
  -- stocks sempre pela mesma sequência.
  FOR v_grp IN
    SELECT m.product_id,
           m.warehouse_id,
           sum(m.quantity)::bigint                        AS qty,
           bool_or(m.unit_cost_at_time IS NULL)           AS any_cost_null,
           sum(m.unit_cost_at_time * m.quantity)          AS cost_total,
           string_agg(DISTINCT poi.description, '", "')   AS descriptions,
           w.name                                         AS warehouse_name
    FROM public.stock_movements m
    JOIN public.purchase_order_items poi ON poi.id = m.reference_id
    LEFT JOIN public.warehouses w ON w.id = m.warehouse_id
    WHERE m.id = ANY (v_all_mov_ids)
    GROUP BY m.product_id, m.warehouse_id, w.name
    ORDER BY m.product_id, m.warehouse_id
  LOOP
    v_stock_qty  := NULL;
    v_stock_cost := NULL;

    SELECT s.quantity, s.average_cost
    INTO v_stock_qty, v_stock_cost
    FROM public.stocks s
    WHERE s.product_id = v_grp.product_id
      AND s.warehouse_id = v_grp.warehouse_id
    FOR UPDATE;

    IF COALESCE(v_stock_qty, 0) < v_grp.qty THEN
      RAISE EXCEPTION 'Não é possível reverter "%": o armazém % tem % unidades e a receção deu entrada de % (já saiu stock)',
        v_grp.descriptions, COALESCE(v_grp.warehouse_name, v_grp.warehouse_id::text),
        COALESCE(v_stock_qty, 0), v_grp.qty
        USING ERRCODE = 'check_violation';
    END IF;

    -- Repor o custo médio antes dos estornos: o apply lê average_cost desta
    -- linha e volta a gravá-lo tal como está.
    IF v_stock_qty - v_grp.qty > 0
       AND v_stock_cost IS NOT NULL
       AND NOT v_grp.any_cost_null THEN
      v_new_cost := round(
        ((v_stock_cost * v_stock_qty) - v_grp.cost_total) / (v_stock_qty - v_grp.qty),
        4
      );
      IF v_new_cost >= 0 AND v_new_cost IS DISTINCT FROM v_stock_cost THEN
        UPDATE public.stocks
        SET average_cost = v_new_cost,
            updated_at   = now()
        WHERE product_id = v_grp.product_id
          AND warehouse_id = v_grp.warehouse_id;
      END IF;
    END IF;
  END LOOP;

  -- ── 3. Estornos ──
  FOR v_mov IN
    SELECT m.*
    FROM public.stock_movements m
    WHERE m.id = ANY (v_all_mov_ids)
    ORDER BY m.product_id, m.warehouse_id, m.created_at, m.id
  LOOP
    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, item_supplier_id, unit_cost_at_time,
      supplier_sku_at_time, reference_id, reversal_of_movement_id, notes, created_by
    ) VALUES (
      v_mov.organization_id, v_mov.product_id, v_mov.warehouse_id, 'ajuste_negativo', v_mov.quantity,
      v_mov.document_number, 'compra', v_mov.item_supplier_id, v_mov.unit_cost_at_time,
      v_mov.supplier_sku_at_time, v_mov.reference_id, v_mov.id,
      format('Estorno da receção de %s: %s unidades (motivo: %s)', v_po.order_number, v_mov.quantity, v_reason),
      v_actor
    )
    RETURNING id INTO v_rev_mov_id;  -- NOVO (20261206130000)

    UPDATE public.purchase_order_receipts
    SET revert_movement_id = v_rev_mov_id
    WHERE stock_movement_id = v_mov.id
      AND purchase_order_item_id = v_mov.reference_id;
  END LOOP;

  -- NOVO (20261206130000): receções destas linhas ficam marcadas como
  -- revertidas (o histórico não se apaga).
  UPDATE public.purchase_order_receipts
  SET reverted_at   = now(),
      reverted_by   = v_actor,
      revert_reason = v_reason
  WHERE purchase_order_item_id = ANY (p_item_ids)
    AND purchase_order_id = p_purchase_order_id
    AND reverted_at IS NULL;

  -- ── 4. Linhas e estado da encomenda ──
  -- A encomenda e as linhas ficam numa única linha de auditoria (abaixo);
  -- o bypass só cobre estes dois UPDATE e é reposto a seguir.
  v_prev_bypass := current_setting('app.audit_bypass', true);
  PERFORM set_config('app.audit_bypass', 'on', true);

  UPDATE public.purchase_order_items
  SET received_quantity       = 0,
      received_to_stock_units = 0  -- NOVO (20261206130000)
  WHERE id = ANY (p_item_ids)
    AND purchase_order_id = p_purchase_order_id;

  SELECT COALESCE(sum(quantity), 0), COALESCE(sum(received_quantity), 0)
  INTO v_sum_quantity, v_sum_received
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';

  IF v_sum_received > 0 THEN
    v_new_status := 'partially_received';
  ELSE
    -- Último estado anterior à receção. Gatilho genérico: status em
    -- changed_fields (UPDATE) ou full_record (INSERT), record_id = PO;
    -- rpc_update_purchase_order: changed_fields.purchase_orders.status,
    -- entity_id = PO e record_id NULL. Dentro da mesma linha, 'new' é
    -- posterior a 'old'.
    SELECT v.val
    INTO v_new_status
    FROM public.entity_audit_log a
    CROSS JOIN LATERAL (VALUES
      (1, a.full_record ->> 'status'),
      (2, a.changed_fields #>> '{status,old}'),
      (3, a.changed_fields #>> '{status,new}'),
      (2, a.changed_fields #>> '{purchase_orders,status,old}'),
      (3, a.changed_fields #>> '{purchase_orders,status,new}')
    ) AS v(ord, val)
    WHERE a.table_name = 'purchase_orders'
      AND (a.record_id = p_purchase_order_id OR a.entity_id = p_purchase_order_id)
      AND v.val IN ('pending', 'ordered')
    ORDER BY a.created_at DESC, v.ord DESC
    LIMIT 1;

    v_new_status := COALESCE(v_new_status, 'ordered');
  END IF;

  UPDATE public.purchase_orders
  SET status               = v_new_status,
      actual_delivery_date = NULL,
      updated_at           = now()
  WHERE id = p_purchase_order_id;

  PERFORM set_config('app.audit_bypass', COALESCE(v_prev_bypass, ''), true);

  SELECT COALESCE(jsonb_agg(
           (l.value - 'quantity_reverted')
           || jsonb_build_object(
                'received_quantity', jsonb_build_object('old', l.value -> 'quantity_reverted', 'new', 0)
              )
         ), '[]'::jsonb)
  INTO v_audit_lines
  FROM jsonb_array_elements(v_lines_out) AS l(value);

  v_diff := jsonb_build_object(
    'status', jsonb_build_object('old', v_po.status, 'new', v_new_status),
    'receipt_reversal', jsonb_build_object(
      'reason',               v_reason,
      'lines',                v_audit_lines,
      'reversal_of_movement_ids', to_jsonb(v_all_mov_ids)
    )
  );
  IF v_po.actual_delivery_date IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object(
      'actual_delivery_date', jsonb_build_object('old', v_po.actual_delivery_date, 'new', NULL)
    );
  END IF;

  PERFORM public.fn_manual_audit_log(
    'purchase_orders', p_purchase_order_id, v_po.organization_id, 'UPDATE', v_diff, 'web_app', p_purchase_order_id
  );

  RETURN jsonb_build_object(
    'order_number', v_po.order_number,
    'status',       v_new_status,
    'lines',        v_lines_out
  );
END;
$function$;

-- ── 8. Reservas das ECs: recebido da EC exclui o que entrou em stock ───────
CREATE OR REPLACE FUNCTION public.fn_client_order_line_reservations(p_organization_id uuid, p_product_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(contract_id uuid, quote_line_id uuid, component_index integer, product_id uuid, seq bigint, is_served boolean, is_sold boolean, qty_needed numeric, qty_served numeric, qty_ordered numeric, qty_received numeric, qty_reserved numeric, qty_missing numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH contracts AS (
    SELECT
      cc.id AS c_id,
      COALESCE(cc.signature_date, cc.status_changed_at, cc.created_at) AS c_sort_ts,
      COALESCE(
        cc.quote_id,
        (
          SELECT q2.id
          FROM public.quotes q2
          WHERE q2.proposal_id = cc.proposal_id
          ORDER BY q2.created_at DESC
          LIMIT 1
        )
      ) AS c_quote_id
    FROM public.client_contracts cc
    WHERE cc.organization_id = p_organization_id
      AND cc.deleted_at IS NULL
      AND cc.status IN ('signed', 'assinado')
  ),
  lines AS (
    SELECT
      c.c_id                AS l_contract_id,
      c.c_sort_ts           AS l_sort_ts,
      ql.id                 AS l_quote_line_id,
      NULL::integer         AS l_component_index,
      ql.product_id         AS l_product_id,
      GREATEST(COALESCE(ql.qt * COALESCE(ql.units_per_uom, 1), 0), 0)::numeric AS l_qty_needed
    FROM contracts c
    JOIN public.quote_lines ql ON ql.quote_id = c.c_quote_id
    JOIN public.products p ON p.id = ql.product_id
    WHERE ql.product_id IS NOT NULL
      AND (p_product_ids IS NULL OR ql.product_id = ANY (p_product_ids))

    UNION ALL

    SELECT
      c.c_id,
      c.c_sort_ts,
      ql.id,
      comp.ord::integer,
      p.id,
      GREATEST(COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1), 0)::numeric
    FROM contracts c
    JOIN public.quote_lines ql
      ON ql.quote_id = c.c_quote_id
     AND ql.bundle_id IS NOT NULL
     AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
    CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components')
      WITH ORDINALITY AS comp(value, ord)
    JOIN public.products p ON p.id = (comp.value ->> 'source_id')::uuid
    WHERE comp.value ->> 'type' = 'product'
      AND comp.value ->> 'source_id' IS NOT NULL
      AND (p_product_ids IS NULL OR p.id = ANY (p_product_ids))
  ),
  org_stock AS (
    SELECT s.product_id AS os_product_id, SUM(s.quantity)::numeric AS os_qty
    FROM public.stocks s
    JOIN public.warehouses w ON w.id = s.warehouse_id
    WHERE s.deleted_at IS NULL
      AND w.organization_id = p_organization_id
      AND w.deleted_at IS NULL
      AND s.product_id IN (SELECT l.l_product_id FROM lines l)
    GROUP BY s.product_id
  ),
  sold AS (
    SELECT
      sm.sale_source_id AS sd_contract_id,
      sm.reference_id   AS sd_quote_line_id,
      sm.product_id     AS sd_product_id,
      SUM(LEAST(sm.quantity, GREATEST(0, -sm.balance_after)))::numeric AS sd_short,
      -- NOVO (20261204630000): quantidade realmente vendida (unidades base,
      -- como l_qty_needed). A dedução passou a poder ser parcial.
      SUM(sm.quantity)::numeric AS sd_qty
    FROM public.stock_movements sm
    WHERE sm.sale_source_type = 'contract'
      AND sm.movement_type = 'venda'
      AND sm.sale_source_id IN (SELECT c.c_id FROM contracts c)
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements r
        WHERE r.reversal_of_movement_id = sm.id
      )
    GROUP BY sm.sale_source_id, sm.reference_id, sm.product_id
  ),
  exits AS (
    SELECT
      sm.sale_source_id AS ex_contract_id,
      sm.product_id     AS ex_product_id,
      SUM(sm.quantity)::numeric AS ex_qty
    FROM public.stock_movements sm
    WHERE sm.sale_source_type = 'contract'
      AND sm.movement_type = 'saida'
      AND sm.sale_source_id IN (SELECT c.c_id FROM contracts c)
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements r
        WHERE r.reversal_of_movement_id = sm.id
      )
    GROUP BY sm.sale_source_id, sm.product_id
  ),
  po_items AS (
    SELECT
      po.source_id         AS pi_contract_id,
      poi.product_id       AS pi_product_id,
      poi.quote_line_id    AS pi_quote_line_id,
      poi.component_index  AS pi_component_index,
      (poi.quantity * COALESCE(poi.units_per_uom, 1))::numeric AS pi_qty,
      -- NOVO (20261206130000): só conta como recebido pela EC o que não
      -- entrou em stock (received_to_stock_units, unidades de stock).
      GREATEST(0,
        CASE WHEN po.status = 'received' THEN poi.quantity
             ELSE LEAST(COALESCE(poi.received_quantity, 0), poi.quantity)
        END * COALESCE(poi.units_per_uom, 1)
        - COALESCE(poi.received_to_stock_units, 0)
      )::numeric AS pi_recv
    FROM public.purchase_orders po
    JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
    WHERE po.source_type = 'contract'
      AND po.source_id IN (SELECT c.c_id FROM contracts c)
      AND po.status IS DISTINCT FROM 'cancelled'
      AND po.deleted_at IS NULL
      AND poi.product_id IS NOT NULL
  ),
  po_linked AS (
    SELECT pi_contract_id, pi_quote_line_id, pi_component_index, pi_product_id,
           SUM(pi_qty) AS pl_qty, SUM(pi_recv) AS pl_recv
    FROM po_items
    WHERE pi_quote_line_id IS NOT NULL
    GROUP BY pi_contract_id, pi_quote_line_id, pi_component_index, pi_product_id
  ),
  po_pool AS (
    SELECT pi_contract_id, pi_product_id,
           SUM(pi_qty) AS pp_qty, SUM(pi_recv) AS pp_recv
    FROM po_items
    WHERE pi_quote_line_id IS NULL
    GROUP BY pi_contract_id, pi_product_id
  ),
  step1 AS (
    SELECT
      l.*,
      COALESCE(l.l_component_index, 0)                          AS s1_comp_key,
      (sd.sd_contract_id IS NOT NULL)                           AS s1_is_sold,
      COALESCE(sd.sd_short, 0)                                  AS s1_short_at_sale,
      COALESCE(sd.sd_qty, 0)                                    AS s1_sold_qty,  -- NOVO (20261204630000)
      (ex.ex_contract_id IS NOT NULL)                           AS s1_has_exit,
      COALESCE(ex.ex_qty, 0)                                    AS s1_exit_pool,
      LEAST(l.l_qty_needed, COALESCE(pl.pl_qty, 0))             AS s1_linked_qty,
      LEAST(COALESCE(pl.pl_recv, 0), l.l_qty_needed, COALESCE(pl.pl_qty, 0)) AS s1_linked_recv,
      COALESCE(pp.pp_qty, 0)                                    AS s1_pool_qty,
      COALESCE(pp.pp_recv, 0)                                   AS s1_pool_recv,
      GREATEST(0, COALESCE(os.os_qty, 0))                       AS s1_stock,
      GREATEST(0, -COALESCE(os.os_qty, 0))                      AS s1_stock_debt
    FROM lines l
    LEFT JOIN sold sd
      ON sd.sd_contract_id   = l.l_contract_id
     AND sd.sd_quote_line_id = l.l_quote_line_id
     AND sd.sd_product_id    = l.l_product_id
     AND l.l_component_index IS NULL
    LEFT JOIN exits ex
      ON ex.ex_contract_id = l.l_contract_id
     AND ex.ex_product_id  = l.l_product_id
    LEFT JOIN po_linked pl
      ON pl.pi_contract_id   = l.l_contract_id
     AND pl.pi_quote_line_id = l.l_quote_line_id
     AND pl.pi_component_index IS NOT DISTINCT FROM l.l_component_index
     AND pl.pi_product_id    = l.l_product_id
    LEFT JOIN po_pool pp
      ON pp.pi_contract_id = l.l_contract_id
     AND pp.pi_product_id  = l.l_product_id
    LEFT JOIN org_stock os
      ON os.os_product_id = l.l_product_id
  ),
  -- Repartição do pool de itens de PO sem ligação por (contrato, produto).
  step2 AS (
    SELECT
      s.*,
      LEAST(
        s.l_qty_needed - s.s1_linked_qty,
        GREATEST(0, s.s1_pool_qty - COALESCE(SUM(s.l_qty_needed - s.s1_linked_qty) OVER (
          PARTITION BY s.l_contract_id, s.l_product_id
          ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0))
      ) AS s2_pool_alloc
    FROM step1 s
  ),
  -- Parte recebida do pool e repartição das saídas manuais.
  step3 AS (
    SELECT
      s.*,
      s.s1_linked_qty + s.s2_pool_alloc AS s3_ordered,
      LEAST(
        s.s2_pool_alloc,
        GREATEST(0, s.s1_pool_recv - COALESCE(SUM(s.s2_pool_alloc) OVER (
          PARTITION BY s.l_contract_id, s.l_product_id
          ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0))
      ) AS s3_pool_recv_alloc,
      LEAST(
        CASE WHEN s.s1_is_sold THEN 0
             ELSE s.l_qty_needed - s.s1_linked_qty - s.s2_pool_alloc END,
        GREATEST(0, s.s1_exit_pool - COALESCE(SUM(
          CASE WHEN s.s1_is_sold THEN 0
               ELSE s.l_qty_needed - s.s1_linked_qty - s.s2_pool_alloc END
        ) OVER (
          PARTITION BY s.l_contract_id, s.l_product_id
          ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0))
      ) AS s3_exit_alloc
    FROM step2 s
  ),
  -- Quantidade ainda por cobrir das linhas pendentes (entra na fila).
  step4 AS (
    SELECT
      s.*,
      CASE WHEN s.s1_is_sold OR s.s1_has_exit THEN 0
           ELSE GREATEST(0, s.l_qty_needed - s.s3_ordered) END AS s4_rem
    FROM step3 s
  ),
  -- Fila por produto (window) — reserva do stock livre por ordem.
  step5 AS (
    SELECT
      s.*,
      row_number() OVER w_prod AS s5_seq,
      SUM(s.s4_rem) OVER (w_prod ROWS UNBOUNDED PRECEDING) AS s5_cum_rem
    FROM step4 s
    WINDOW w_prod AS (
      PARTITION BY s.l_product_id
      ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
    )
  ),
  final AS (
    SELECT
      s.*,
      (LEAST(s.s1_stock, s.s5_cum_rem) - LEAST(s.s1_stock, s.s5_cum_rem - s.s4_rem)) AS f_reserved
    FROM step5 s
  ),
  -- NOVO (20261204340000): quantidade realmente servida por stock e
  -- recebida do fornecedor, por linha.
  --  * venda automática: servida = necessária menos a parte que ficou a
  --    descoberto no momento da venda (e continua em dívida no stock);
  --    NOVO (20261204630000): limitada à quantidade realmente vendida
  --    (LEAST(necessária, vendida)) — a dedução pode ser parcial. Com
  --    vendida = necessária (todas as vendas anteriores) é igual a antes;
  --  * saída manual: a saída do (contrato, produto) é repartida pelas linhas
  --    por ordem (seq) até à quantidade realmente saída (s3_exit_alloc) — uma
  --    saída pequena já não serve todas as linhas;
  --  * a receção de POs de contrato não entra em stock (vai direto à
  --    encomenda), por isso a parte recebida conta como entregue.
  --    NOVO (20261206130000): exceto a parte que entrou em stock
  --    (excedente / EC inativa / passagem para stock), descontada em pi_recv.
  served AS (
    SELECT
      f.*,
      CASE
        WHEN f.s1_is_sold THEN
          GREATEST(0, LEAST(f.l_qty_needed, f.s1_sold_qty)
                      - LEAST(f.l_qty_needed, f.s1_short_at_sale, f.s1_stock_debt))  -- NOVO (20261204630000)
        WHEN f.s1_has_exit THEN f.s3_exit_alloc
        ELSE 0
      END::numeric AS sv_served,
      (f.s1_linked_recv + f.s3_pool_recv_alloc)::numeric AS sv_received
    FROM final f
  )
  SELECT
    f.l_contract_id,
    f.l_quote_line_id,
    f.l_component_index,
    f.l_product_id,
    f.s5_seq,
    -- NOVO (20261204340000): is_served = linha concluída —
    -- qty_served + qty_received >= qty_needed (antes: qualquer saída do
    -- (contrato, produto) marcava todas as linhas como servidas).
    ((f.sv_served + f.sv_received) >= f.l_qty_needed
      AND (f.l_qty_needed > 0 OR f.s1_is_sold OR f.s1_has_exit)),
    f.s1_is_sold,
    f.l_qty_needed,
    f.sv_served,
    f.s3_ordered,
    f.sv_received,
    -- Linhas com venda/saída não entram na fila (uma saída por (contrato,
    -- produto)): a reserva nunca conta a parte já servida; o que ficou por
    -- servir passa a qty_missing.
    CASE WHEN f.s1_is_sold OR f.s1_has_exit THEN 0 ELSE f.f_reserved END::numeric,
    CASE
      WHEN f.s1_is_sold THEN
        -- NOVO (20261204630000): necessário − servido − encomendado. Com
        -- vendida = necessária dá exatamente o de antes:
        -- LEAST(necessário, short, dívida) − encomendado.
        GREATEST(0, f.l_qty_needed - f.sv_served - f.s3_ordered)
      WHEN f.s1_has_exit THEN
        GREATEST(0, f.l_qty_needed - f.s3_ordered - f.s3_exit_alloc)
      ELSE
        GREATEST(0, f.s4_rem - f.f_reserved)
    END::numeric
  FROM served f;
$function$;

-- ── 9. Passar para stock o recebido de ECs inativas ────────────────────────
-- Passa para stock o que já foi recebido numa linha de PO de Encomenda
-- Cliente e ficou "na EC", quando a EC deixou de estar ativa (cancelada,
-- apagada ou não assinada). Cria uma entrada 'compra' por linha (custo como
-- na receção) e soma a received_to_stock_units — a reversão da receção
-- estorna-a como qualquer outra entrada da linha.
-- Permissões: purchase_orders.receive + inventory.edit (as da receção).
CREATE OR REPLACE FUNCTION public.rpc_po_receipt_release_to_stock(p_item_ids uuid[], p_warehouse_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor            uuid;
  v_org              uuid;
  v_org_count        integer;
  v_po               record;
  v_item             record;
  v_cc               record;
  v_units            integer;
  v_pending          numeric;
  v_mov_units        numeric;
  v_unit_cost        numeric;
  v_item_supplier_id uuid;
  v_movement_id      uuid;
  v_balance          integer;
  v_reason           text := nullif(btrim(COALESCE(p_reason, '')), '');
  v_lines_out        jsonb := '[]'::jsonb;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'Escolhe pelo menos uma linha para passar para stock' USING ERRCODE = 'check_violation';
  END IF;
  IF array_position(p_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A lista de linhas tem valores vazios' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_item_ids) AS t(x)) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'A lista de linhas tem linhas repetidas' USING ERRCODE = 'check_violation';
  END IF;

  -- Todas as linhas da mesma organização.
  SELECT min(po.organization_id::text)::uuid, count(DISTINCT po.organization_id)
  INTO v_org, v_org_count
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.id = ANY (p_item_ids);

  IF v_org IS NULL OR (SELECT count(*) FROM public.purchase_order_items WHERE id = ANY (p_item_ids)) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'Linha de encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'As linhas têm de ser todas da mesma organização' USING ERRCODE = 'check_violation';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
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

  -- Trancar as POs (mesma ordem sempre) — serializa com receções/reversões.
  PERFORM 1
  FROM public.purchase_orders po
  WHERE po.id IN (SELECT purchase_order_id FROM public.purchase_order_items WHERE id = ANY (p_item_ids))
  ORDER BY po.id
  FOR UPDATE;

  FOR v_item IN
    SELECT poi.id, poi.purchase_order_id, poi.product_id, poi.item_type, poi.description,
           poi.quantity, poi.received_quantity, poi.received_to_stock_units, poi.unit_price,
           poi.uom_id, COALESCE(poi.units_per_uom, 1) AS units_per_uom
    FROM public.purchase_order_items poi
    WHERE poi.id = ANY (p_item_ids)
    ORDER BY poi.id
    FOR UPDATE
  LOOP
    SELECT id, organization_id, order_number, status, source_type, source_id, supplier_id, deleted_at
    INTO v_po
    FROM public.purchase_orders WHERE id = v_item.purchase_order_id;

    IF v_po.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'A encomenda % foi apagada', v_po.order_number USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto', v_item.description USING ERRCODE = 'check_violation';
    END IF;
    IF v_po.source_type IS DISTINCT FROM 'contract' THEN
      RAISE EXCEPTION 'A linha "%" é de uma encomenda de stock — o recebido já está em stock', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT cc.id, COALESCE(cc.order_number, cc.contract_number) AS num,
           (cc.deleted_at IS NULL AND cc.status IN ('signed', 'assinado')) AS active
    INTO v_cc
    FROM public.client_contracts cc
    WHERE cc.id = v_po.source_id AND cc.organization_id = v_po.organization_id;

    IF FOUND AND v_cc.active THEN
      RAISE EXCEPTION 'A encomenda cliente % da linha "%" está ativa — o recebido pertence-lhe e não pode passar para stock',
        v_cc.num, v_item.description USING ERRCODE = 'check_violation';
    END IF;

    v_units   := v_item.units_per_uom;
    v_pending := v_item.received_quantity * v_units - v_item.received_to_stock_units;

    IF v_pending <= 0 THEN
      RAISE EXCEPTION 'A linha "%" não tem quantidade recebida por passar para stock', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_pending <> floor(v_pending) OR v_pending > 2147483647 THEN
      RAISE EXCEPTION 'A linha "%" tem uma quantidade por passar para stock inválida (%)', v_item.description, v_pending
        USING ERRCODE = 'check_violation';
    END IF;

    -- As entradas por estornar da linha têm de bater com o que já está
    -- marcado como stock; senão (p.ex. entrada antiga de PO-2026-0010) a
    -- passagem duplicaria stock.
    SELECT COALESCE(sum(m.quantity), 0) INTO v_mov_units
    FROM public.stock_movements m
    WHERE m.reference_id = v_item.id
      AND m.organization_id = v_po.organization_id
      AND m.product_id = v_item.product_id
      AND m.document_type = 'compra'
      AND m.movement_type = 'entrada'
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = m.id);

    IF v_mov_units <> v_item.received_to_stock_units THEN
      RAISE EXCEPTION 'Não é possível passar "%" para stock automaticamente: as entradas de stock da linha (% un.) não batem com o registado (% un.)',
        v_item.description, v_mov_units, v_item.received_to_stock_units
        USING ERRCODE = 'check_violation';
    END IF;

    v_unit_cost := CASE WHEN v_units = 1 THEN v_item.unit_price
                        ELSE round(v_item.unit_price / v_units, 6) END;

    SELECT id INTO v_item_supplier_id
    FROM public.item_suppliers
    WHERE product_id = v_item.product_id
      AND supplier_id = v_po.supplier_id
      AND deleted_at IS NULL
    ORDER BY (uom_id IS NOT DISTINCT FROM v_item.uom_id) DESC, is_preferred DESC
    LIMIT 1;

    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, item_supplier_id, unit_cost_at_time,
      reference_id, notes, created_by
    ) VALUES (
      v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_pending::integer,
      v_po.order_number, 'compra', v_item_supplier_id, v_unit_cost,
      v_item.id,
      format('Passagem para stock de %s: %s unidades recebidas para a encomenda cliente %s (inativa)%s',
             v_po.order_number, v_pending, COALESCE(v_cc.num, '?'),
             CASE WHEN v_reason IS NOT NULL THEN format(' (motivo: %s)', v_reason) ELSE '' END),
      v_actor
    )
    RETURNING id, balance_after INTO v_movement_id, v_balance;

    UPDATE public.purchase_order_items
    SET received_to_stock_units = received_to_stock_units + v_pending
    WHERE id = v_item.id;

    INSERT INTO public.purchase_order_receipts (
      organization_id, purchase_order_id, purchase_order_item_id, product_id, kind,
      warehouse_id, quantity, units_per_uom, units_to_order, units_to_stock,
      contract_id, allocation_reason, stock_movement_id, notes, received_by
    ) VALUES (
      v_po.organization_id, v_po.id, v_item.id, v_item.product_id, 'release_to_stock',
      p_warehouse_id, 0, v_units, 0, v_pending,
      v_po.source_id, 'client_order_inactive', v_movement_id, v_reason, v_actor
    );

    v_lines_out := v_lines_out || jsonb_build_object(
      'purchase_order_item_id', v_item.id,
      'purchase_order_id',      v_po.id,
      'order_number',           v_po.order_number,
      'product_id',             v_item.product_id,
      'units_to_stock',         v_pending,
      'qty_to_stock',           round(v_pending / v_units, 4),
      'contract_id',            v_po.source_id,
      'contract_order_number',  v_cc.num,
      'balance_after',          v_balance
    );
  END LOOP;

  RETURN jsonb_build_object('warehouse_id', p_warehouse_id, 'lines', v_lines_out);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_po_receipt_release_to_stock(uuid[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_po_receipt_release_to_stock(uuid[], uuid, text) TO authenticated, service_role;

-- ── 10. Pré-visualização da receção ───────────────────────────────────────
-- Pré-visualização do destino de uma receção (diálogo de receção): corre a
-- própria rpc_receive_purchase_order_lines dentro de um subtransação e
-- desfá-la sempre (exceção própria apanhada aqui). O resultado é, por
-- construção, igual ao da receção real feita no mesmo momento — não há uma
-- segunda cópia da regra que possa divergir. Nada fica gravado.
-- p_lines NULL = todas as linhas por receber no saldo (como
-- rpc_receive_purchase_order). p_warehouse_id NULL = primeiro armazém ativo
-- da organização (o destino não depende do armazém; balance_after é retirado).
-- Exige as permissões da receção (purchase_orders.receive + inventory.edit);
-- os mesmos erros de validação da receção são devolvidos como erro.
CREATE OR REPLACE FUNCTION public.rpc_preview_po_receipt(p_purchase_order_id uuid, p_lines jsonb DEFAULT NULL::jsonb, p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org     uuid;
  v_wh      uuid := p_warehouse_id;
  v_lines   jsonb := p_lines;
  v_result  jsonb;
BEGIN
  SELECT organization_id INTO v_org
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_wh IS NULL THEN
    SELECT id INTO v_wh
    FROM public.warehouses
    WHERE organization_id = v_org AND deleted_at IS NULL
    ORDER BY created_at, id
    LIMIT 1;
  END IF;

  IF v_lines IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'purchase_order_item_id', id,
             'quantity', (quantity - received_quantity)
           )), '[]'::jsonb)
    INTO v_lines
    FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id
      AND item_type = 'product'
      AND quantity > received_quantity;
  END IF;

  BEGIN
    v_result := public.rpc_receive_purchase_order_lines(p_purchase_order_id, v_wh, v_lines, NULL);
    RAISE EXCEPTION USING ERRCODE = 'OLPV1', MESSAGE = 'preview_rollback';
  EXCEPTION WHEN SQLSTATE 'OLPV1' THEN
    NULL;  -- tudo o que a receção escreveu foi desfeito com a subtransação
  END;

  RETURN jsonb_build_object(
    'preview',              true,
    'order_number',         v_result -> 'order_number',
    'status',               v_result -> 'status',
    'stock_skipped',        v_result -> 'stock_skipped',
    'units_to_order_total', v_result -> 'units_to_order_total',
    'units_to_stock_total', v_result -> 'units_to_stock_total',
    'lines', COALESCE((
      SELECT jsonb_agg(l.value - 'balance_after' ORDER BY l.ord)
      FROM jsonb_array_elements(v_result -> 'lines') WITH ORDINALITY AS l(value, ord)
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_preview_po_receipt(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_preview_po_receipt(uuid, jsonb, uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- REVERSÃO (não executar com a migration).
-- 1) Repor as três funções vivas anteriores (pg_get_functiondef, 2026-10-01):
--    retirar o prefixo '-- ' dos blocos abaixo e executar.
-- 2) DROP FUNCTION public.rpc_preview_po_receipt(uuid, jsonb, uuid);
--    DROP FUNCTION public.rpc_po_receipt_release_to_stock(uuid[], uuid, text);
--    DROP FUNCTION public.fn_po_receipt_allocation(uuid, numeric);
--    DROP TRIGGER trg_purchase_order_items_00_guard_system_columns ON public.purchase_order_items;
--    DROP FUNCTION public.fn_purchase_order_items_guard_system_columns();
--    (opcional, só desempenho) DROP INDEX public.idx_quote_lines_quote_id;
-- 3) Só depois de verificar que nenhuma receção nova repartiu stock (senão o
--    stock que entrou deixaria de estar refletido): DROP TABLE
--    public.purchase_order_receipts; ALTER TABLE public.purchase_order_items
--    DROP COLUMN received_to_stock_units;
-- ---------------------------------------------------------------------------

-- [anterior] rpc_receive_purchase_order_lines
-- CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order_lines(p_purchase_order_id uuid, p_warehouse_id uuid, p_lines jsonb, p_actual_delivery_date date DEFAULT NULL::date)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor            uuid;
--   v_po               public.purchase_orders%ROWTYPE;
--   v_line_input       jsonb;
--   v_line_id          uuid;
--   v_qty_requested    numeric;
--   v_qty_int          integer;
--   v_item             record;
--   v_item_supplier_id uuid;
--   v_remaining        numeric;
--   v_balance          integer;
--   v_received_total   numeric;
--   v_lines_out        jsonb := '[]'::jsonb;
--   v_sum_quantity     numeric;
--   v_sum_received     numeric;
--   v_new_status       text;
--   v_skip_stock       boolean;
--   -- NOVO (20261204203500): embalagens — fator congelado na linha.
--   v_units            integer;
--   v_stock_qty        bigint;
--   v_unit_cost        numeric;
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   SELECT * INTO v_po
--   FROM public.purchase_orders
--   WHERE id = p_purchase_order_id AND deleted_at IS NULL
--   FOR UPDATE;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF v_po.status = 'received' THEN
--     RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
--   END IF;
--   IF v_po.status = 'cancelled' THEN
--     RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
--      OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
--     RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   IF NOT EXISTS (
--     SELECT 1 FROM public.warehouses
--     WHERE id = p_warehouse_id AND organization_id = v_po.organization_id AND deleted_at IS NULL
--   ) THEN
--     RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
--     RAISE EXCEPTION 'Linhas de receção não podem estar vazias' USING ERRCODE = 'check_violation';
--   END IF;
--
--   -- Ligada a uma Encomenda Cliente = já tem destino certo, não entra no
--   -- stock geral (20261115210000).
--   v_skip_stock := (v_po.source_type = 'contract');
--
--   FOR v_line_input IN SELECT * FROM jsonb_array_elements(p_lines)
--   LOOP
--     v_line_id       := nullif(v_line_input ->> 'purchase_order_item_id', '')::uuid;
--     v_qty_requested := nullif(v_line_input ->> 'quantity', '')::numeric;
--
--     IF v_line_id IS NULL THEN
--       RAISE EXCEPTION 'purchase_order_item_id em falta numa linha de receção' USING ERRCODE = 'check_violation';
--     END IF;
--
--     SELECT id, product_id, item_type, quantity, unit_price, received_quantity, description,
--            uom_id, units_per_uom, supplier_sku
--     INTO v_item
--     FROM public.purchase_order_items
--     WHERE id = v_line_id AND purchase_order_id = p_purchase_order_id
--     FOR UPDATE;
--
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', v_line_id
--         USING ERRCODE = 'no_data_found';
--     END IF;
--
--     IF v_item.item_type <> 'product' THEN
--       RAISE EXCEPTION 'A linha "%" não é um produto — serviços não têm stock físico e não podem ser recebidos', v_item.description
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     IF v_qty_requested IS NULL OR v_qty_requested <= 0 THEN
--       RAISE EXCEPTION 'A quantidade a receber na linha "%" tem de ser positiva', v_item.description
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     IF v_qty_requested <> floor(v_qty_requested) THEN
--       RAISE EXCEPTION 'A linha "%" tem uma quantidade não inteira (%) — o stock só regista unidades inteiras. Corrige a linha antes de receber.', v_item.description, v_qty_requested
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     v_remaining := v_item.quantity - v_item.received_quantity;
--     IF v_qty_requested > v_remaining THEN
--       RAISE EXCEPTION 'A quantidade a receber (%) na linha "%" excede o saldo por receber desta linha (% de % por receber; já recebido % de %)',
--         v_qty_requested, v_item.description, v_remaining, v_item.quantity, v_item.received_quantity, v_item.quantity
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     v_qty_int := v_qty_requested::integer;
--     v_balance := NULL;
--
--     -- NOVO (20261204203500): a linha está na unidade de compra (ex. PK100);
--     -- o stock entra na unidade do produto. received_quantity continua na
--     -- unidade da linha. Custo por unidade de stock = preço da linha / fator.
--     -- Com fator 1 tudo fica exatamente como antes.
--     v_units     := COALESCE(v_item.units_per_uom, 1);
--     v_stock_qty := v_qty_int::bigint * v_units;
--     IF v_stock_qty > 2147483647 THEN
--       RAISE EXCEPTION 'A linha "%" excede o limite de stock (% unidades)', v_item.description, v_stock_qty
--         USING ERRCODE = 'numeric_value_out_of_range';
--     END IF;
--     v_unit_cost := CASE WHEN v_units = 1 THEN v_item.unit_price
--                         ELSE round(v_item.unit_price / v_units, 6) END;
--
--     IF v_skip_stock THEN
--       -- Sem movimento de entrada — a encomenda já tem destino certo (cliente
--       -- final), não passa pelo stock geral. balance_after fica NULL no
--       -- output (informativo, não há stock_movements gerado para esta linha).
--       NULL;
--     ELSE
--       SELECT id INTO v_item_supplier_id
--       FROM public.item_suppliers
--       WHERE product_id = v_item.product_id
--         AND supplier_id = v_po.supplier_id
--         AND deleted_at IS NULL
--       -- NOVO (20261204203500): primeiro a ligação na MESMA unidade da linha.
--       ORDER BY (uom_id IS NOT DISTINCT FROM v_item.uom_id) DESC, is_preferred DESC
--       LIMIT 1;
--
--       INSERT INTO public.stock_movements (
--         organization_id, product_id, warehouse_id, movement_type, quantity,
--         document_number, document_type, item_supplier_id, unit_cost_at_time,
--         reference_id, notes, created_by
--       ) VALUES (
--         v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_stock_qty::integer,
--         v_po.order_number, 'compra', v_item_supplier_id, v_unit_cost,
--         v_item.id,
--         CASE WHEN v_units = 1 THEN
--           format('Receção de %s: %s unidades agora nesta linha (total recebido %s de %s)',
--                  v_po.order_number, v_qty_int, v_item.received_quantity + v_qty_requested, v_item.quantity)
--         ELSE
--           format('Receção de %s: %s × %s un. (%s unidades de stock) agora nesta linha (total recebido %s de %s)',
--                  v_po.order_number, v_qty_int, v_units, v_stock_qty, v_item.received_quantity + v_qty_requested, v_item.quantity)
--         END,
--         v_actor
--       )
--       RETURNING balance_after INTO v_balance;
--     END IF;
--
--     UPDATE public.purchase_order_items
--     SET received_quantity = received_quantity + v_qty_requested
--     WHERE id = v_item.id
--     RETURNING received_quantity INTO v_received_total;
--
--     v_lines_out := v_lines_out || jsonb_build_object(
--       'product_id',               v_item.product_id,
--       'quantity_received_now',    v_qty_int,
--       'received_quantity_total',  v_received_total,
--       'remaining',                v_item.quantity - v_received_total,
--       'balance_after',            v_balance,
--       'stock_updated',            NOT v_skip_stock,
--       -- NOVO (20261204203500): chaves acrescentadas; as anteriores não mudam.
--       'units_per_uom',            v_units,
--       'stock_quantity_now',       CASE WHEN v_skip_stock THEN NULL ELSE v_stock_qty END
--     );
--   END LOOP;
--
--   SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(received_quantity), 0)
--   INTO v_sum_quantity, v_sum_received
--   FROM public.purchase_order_items
--   WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';
--
--   IF v_sum_quantity > 0 AND v_sum_received >= v_sum_quantity THEN
--     v_new_status := 'received';
--   ELSIF v_sum_received > 0 THEN
--     v_new_status := 'partially_received';
--   ELSE
--     v_new_status := v_po.status;
--   END IF;
--
--   -- NOVO (20261130010000): actual_delivery_date só é gravada quando a
--   -- encomenda fica TOTALMENTE recebida — numa receção parcial ainda não há
--   -- "data de entrega" da encomenda como um todo.
--   IF v_new_status = 'received' THEN
--     UPDATE public.purchase_orders
--     SET status = v_new_status,
--         updated_at = now(),
--         actual_delivery_date = COALESCE(p_actual_delivery_date, current_date)
--     WHERE id = p_purchase_order_id;
--   ELSE
--     UPDATE public.purchase_orders
--     SET status = v_new_status, updated_at = now()
--     WHERE id = p_purchase_order_id;
--   END IF;
--
--   RETURN jsonb_build_object(
--     'order_number',   v_po.order_number,
--     'warehouse_id',   p_warehouse_id,
--     'status',         v_new_status,
--     'lines',          v_lines_out,
--     'stock_skipped',  v_skip_stock
--   );
-- END;
-- $function$;

-- [anterior] rpc_revert_purchase_order_receipt
-- CREATE OR REPLACE FUNCTION public.rpc_revert_purchase_order_receipt(p_purchase_order_id uuid, p_item_ids uuid[], p_reason text)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor          uuid;
--   v_po             public.purchase_orders%ROWTYPE;
--   v_reason         text;
--   v_skip_stock     boolean;
--   v_item_id        uuid;
--   v_item           record;
--   v_line_mov_ids   uuid[];
--   v_line_mov_units bigint;
--   v_line_expected  numeric;
--   v_all_mov_ids    uuid[] := ARRAY[]::uuid[];
--   v_lines_out      jsonb := '[]'::jsonb;
--   v_audit_lines    jsonb := '[]'::jsonb;
--   v_grp            record;
--   v_stock_qty      integer;
--   v_stock_cost     numeric;
--   v_new_cost       numeric;
--   v_mov            public.stock_movements%ROWTYPE;
--   v_sum_quantity   numeric;
--   v_sum_received   numeric;
--   v_new_status     text;
--   v_prev_bypass    text;
--   v_diff           jsonb;
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   -- Trancar a encomenda serializa com receções e reversões concorrentes
--   -- (rpc_receive_purchase_order_lines tranca-a da mesma forma).
--   SELECT * INTO v_po
--   FROM public.purchase_orders
--   WHERE id = p_purchase_order_id AND deleted_at IS NULL
--   FOR UPDATE;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF v_po.status NOT IN ('received', 'partially_received') THEN
--     RAISE EXCEPTION 'Só é possível reverter a receção de encomendas recebidas ou parcialmente recebidas (estado atual: %)', v_po.status
--       USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.revert_receipt')
--      OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
--     RAISE EXCEPTION 'Sem permissão para reverter receções desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   v_reason := btrim(COALESCE(p_reason, ''));
--   IF char_length(v_reason) < 3 THEN
--     RAISE EXCEPTION 'Indica o motivo da reversão (pelo menos 3 caracteres)' USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
--     RAISE EXCEPTION 'Escolhe pelo menos uma linha para reverter' USING ERRCODE = 'check_violation';
--   END IF;
--   IF array_position(p_item_ids, NULL) IS NOT NULL THEN
--     RAISE EXCEPTION 'A lista de linhas tem valores vazios' USING ERRCODE = 'check_violation';
--   END IF;
--   IF (SELECT count(DISTINCT x) FROM unnest(p_item_ids) AS t(x)) <> cardinality(p_item_ids) THEN
--     RAISE EXCEPTION 'A lista de linhas tem linhas repetidas' USING ERRCODE = 'check_violation';
--   END IF;
--
--   v_skip_stock := (v_po.source_type = 'contract');
--
--   -- ── 1. Validar e trancar as linhas e as entradas de stock de cada uma ──
--   FOREACH v_item_id IN ARRAY p_item_ids
--   LOOP
--     SELECT id, product_id, item_type, quantity, received_quantity, description,
--            COALESCE(units_per_uom, 1) AS units_per_uom
--     INTO v_item
--     FROM public.purchase_order_items
--     WHERE id = v_item_id AND purchase_order_id = p_purchase_order_id
--     FOR UPDATE;
--
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', v_item_id
--         USING ERRCODE = 'no_data_found';
--     END IF;
--
--     IF v_item.item_type <> 'product' THEN
--       RAISE EXCEPTION 'A linha "%" não é um produto — serviços não têm receção de stock a reverter', v_item.description
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     IF v_item.received_quantity IS NULL OR v_item.received_quantity <= 0 THEN
--       RAISE EXCEPTION 'A linha "%" não tem quantidade recebida para reverter', v_item.description
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     -- Entradas da receção desta linha ainda sem estorno. O filtro por
--     -- organização e produto usa idx_stock_movements_product (não há índice
--     -- em reference_id).
--     SELECT COALESCE(array_agg(t.id ORDER BY t.id), ARRAY[]::uuid[]),
--            COALESCE(sum(t.quantity), 0)
--     INTO v_line_mov_ids, v_line_mov_units
--     FROM (
--       SELECT m.id, m.quantity
--       FROM public.stock_movements m
--       WHERE m.reference_id = v_item.id
--         AND m.organization_id = v_po.organization_id
--         AND m.product_id = v_item.product_id
--         AND m.document_type = 'compra'
--         AND m.movement_type = 'entrada'
--         AND NOT EXISTS (
--           SELECT 1 FROM public.stock_movements r
--           WHERE r.reversal_of_movement_id = m.id
--         )
--       ORDER BY m.id
--       FOR UPDATE OF m
--     ) t;
--
--     v_line_expected := v_item.received_quantity * v_item.units_per_uom;
--
--     -- Contrato sem entradas: a receção não passou pelo stock geral. Em todos
--     -- os outros casos os movimentos têm de explicar a quantidade recebida.
--     IF NOT (v_skip_stock AND cardinality(v_line_mov_ids) = 0)
--        AND v_line_mov_units <> v_line_expected THEN
--       RAISE EXCEPTION 'Não é possível reverter "%" automaticamente: a linha tem % recebidas (% unidades de stock), mas as entradas de stock por estornar somam % unidades',
--         v_item.description, v_item.received_quantity, v_line_expected, v_line_mov_units
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     v_all_mov_ids := v_all_mov_ids || v_line_mov_ids;
--
--     v_lines_out := v_lines_out || jsonb_build_object(
--       'purchase_order_item_id', v_item.id,
--       'description',            v_item.description,
--       'quantity_reverted',      v_item.received_quantity,
--       'stock_reverted',         cardinality(v_line_mov_ids) > 0,
--       'movements_reverted',     cardinality(v_line_mov_ids)
--     );
--   END LOOP;
--
--   -- ── 2. Stock suficiente e custo médio, por produto/armazém ──
--   -- Tudo verificado antes do primeiro estorno. Ordem fixa para trancar
--   -- stocks sempre pela mesma sequência.
--   FOR v_grp IN
--     SELECT m.product_id,
--            m.warehouse_id,
--            sum(m.quantity)::bigint                        AS qty,
--            bool_or(m.unit_cost_at_time IS NULL)           AS any_cost_null,
--            sum(m.unit_cost_at_time * m.quantity)          AS cost_total,
--            string_agg(DISTINCT poi.description, '", "')   AS descriptions,
--            w.name                                         AS warehouse_name
--     FROM public.stock_movements m
--     JOIN public.purchase_order_items poi ON poi.id = m.reference_id
--     LEFT JOIN public.warehouses w ON w.id = m.warehouse_id
--     WHERE m.id = ANY (v_all_mov_ids)
--     GROUP BY m.product_id, m.warehouse_id, w.name
--     ORDER BY m.product_id, m.warehouse_id
--   LOOP
--     v_stock_qty  := NULL;
--     v_stock_cost := NULL;
--
--     SELECT s.quantity, s.average_cost
--     INTO v_stock_qty, v_stock_cost
--     FROM public.stocks s
--     WHERE s.product_id = v_grp.product_id
--       AND s.warehouse_id = v_grp.warehouse_id
--     FOR UPDATE;
--
--     IF COALESCE(v_stock_qty, 0) < v_grp.qty THEN
--       RAISE EXCEPTION 'Não é possível reverter "%": o armazém % tem % unidades e a receção deu entrada de % (já saiu stock)',
--         v_grp.descriptions, COALESCE(v_grp.warehouse_name, v_grp.warehouse_id::text),
--         COALESCE(v_stock_qty, 0), v_grp.qty
--         USING ERRCODE = 'check_violation';
--     END IF;
--
--     -- Repor o custo médio antes dos estornos: o apply lê average_cost desta
--     -- linha e volta a gravá-lo tal como está.
--     IF v_stock_qty - v_grp.qty > 0
--        AND v_stock_cost IS NOT NULL
--        AND NOT v_grp.any_cost_null THEN
--       v_new_cost := round(
--         ((v_stock_cost * v_stock_qty) - v_grp.cost_total) / (v_stock_qty - v_grp.qty),
--         4
--       );
--       IF v_new_cost >= 0 AND v_new_cost IS DISTINCT FROM v_stock_cost THEN
--         UPDATE public.stocks
--         SET average_cost = v_new_cost,
--             updated_at   = now()
--         WHERE product_id = v_grp.product_id
--           AND warehouse_id = v_grp.warehouse_id;
--       END IF;
--     END IF;
--   END LOOP;
--
--   -- ── 3. Estornos ──
--   FOR v_mov IN
--     SELECT m.*
--     FROM public.stock_movements m
--     WHERE m.id = ANY (v_all_mov_ids)
--     ORDER BY m.product_id, m.warehouse_id, m.created_at, m.id
--   LOOP
--     INSERT INTO public.stock_movements (
--       organization_id, product_id, warehouse_id, movement_type, quantity,
--       document_number, document_type, item_supplier_id, unit_cost_at_time,
--       supplier_sku_at_time, reference_id, reversal_of_movement_id, notes, created_by
--     ) VALUES (
--       v_mov.organization_id, v_mov.product_id, v_mov.warehouse_id, 'ajuste_negativo', v_mov.quantity,
--       v_mov.document_number, 'compra', v_mov.item_supplier_id, v_mov.unit_cost_at_time,
--       v_mov.supplier_sku_at_time, v_mov.reference_id, v_mov.id,
--       format('Estorno da receção de %s: %s unidades (motivo: %s)', v_po.order_number, v_mov.quantity, v_reason),
--       v_actor
--     );
--   END LOOP;
--
--   -- ── 4. Linhas e estado da encomenda ──
--   -- A encomenda e as linhas ficam numa única linha de auditoria (abaixo);
--   -- o bypass só cobre estes dois UPDATE e é reposto a seguir.
--   v_prev_bypass := current_setting('app.audit_bypass', true);
--   PERFORM set_config('app.audit_bypass', 'on', true);
--
--   UPDATE public.purchase_order_items
--   SET received_quantity = 0
--   WHERE id = ANY (p_item_ids)
--     AND purchase_order_id = p_purchase_order_id;
--
--   SELECT COALESCE(sum(quantity), 0), COALESCE(sum(received_quantity), 0)
--   INTO v_sum_quantity, v_sum_received
--   FROM public.purchase_order_items
--   WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';
--
--   IF v_sum_received > 0 THEN
--     v_new_status := 'partially_received';
--   ELSE
--     -- Último estado anterior à receção. Gatilho genérico: status em
--     -- changed_fields (UPDATE) ou full_record (INSERT), record_id = PO;
--     -- rpc_update_purchase_order: changed_fields.purchase_orders.status,
--     -- entity_id = PO e record_id NULL. Dentro da mesma linha, 'new' é
--     -- posterior a 'old'.
--     SELECT v.val
--     INTO v_new_status
--     FROM public.entity_audit_log a
--     CROSS JOIN LATERAL (VALUES
--       (1, a.full_record ->> 'status'),
--       (2, a.changed_fields #>> '{status,old}'),
--       (3, a.changed_fields #>> '{status,new}'),
--       (2, a.changed_fields #>> '{purchase_orders,status,old}'),
--       (3, a.changed_fields #>> '{purchase_orders,status,new}')
--     ) AS v(ord, val)
--     WHERE a.table_name = 'purchase_orders'
--       AND (a.record_id = p_purchase_order_id OR a.entity_id = p_purchase_order_id)
--       AND v.val IN ('pending', 'ordered')
--     ORDER BY a.created_at DESC, v.ord DESC
--     LIMIT 1;
--
--     v_new_status := COALESCE(v_new_status, 'ordered');
--   END IF;
--
--   UPDATE public.purchase_orders
--   SET status               = v_new_status,
--       actual_delivery_date = NULL,
--       updated_at           = now()
--   WHERE id = p_purchase_order_id;
--
--   PERFORM set_config('app.audit_bypass', COALESCE(v_prev_bypass, ''), true);
--
--   SELECT COALESCE(jsonb_agg(
--            (l.value - 'quantity_reverted')
--            || jsonb_build_object(
--                 'received_quantity', jsonb_build_object('old', l.value -> 'quantity_reverted', 'new', 0)
--               )
--          ), '[]'::jsonb)
--   INTO v_audit_lines
--   FROM jsonb_array_elements(v_lines_out) AS l(value);
--
--   v_diff := jsonb_build_object(
--     'status', jsonb_build_object('old', v_po.status, 'new', v_new_status),
--     'receipt_reversal', jsonb_build_object(
--       'reason',               v_reason,
--       'lines',                v_audit_lines,
--       'reversal_of_movement_ids', to_jsonb(v_all_mov_ids)
--     )
--   );
--   IF v_po.actual_delivery_date IS NOT NULL THEN
--     v_diff := v_diff || jsonb_build_object(
--       'actual_delivery_date', jsonb_build_object('old', v_po.actual_delivery_date, 'new', NULL)
--     );
--   END IF;
--
--   PERFORM public.fn_manual_audit_log(
--     'purchase_orders', p_purchase_order_id, v_po.organization_id, 'UPDATE', v_diff, 'web_app', p_purchase_order_id
--   );
--
--   RETURN jsonb_build_object(
--     'order_number', v_po.order_number,
--     'status',       v_new_status,
--     'lines',        v_lines_out
--   );
-- END;
-- $function$;

-- [anterior] fn_client_order_line_reservations
-- CREATE OR REPLACE FUNCTION public.fn_client_order_line_reservations(p_organization_id uuid, p_product_ids uuid[] DEFAULT NULL::uuid[])
--  RETURNS TABLE(contract_id uuid, quote_line_id uuid, component_index integer, product_id uuid, seq bigint, is_served boolean, is_sold boolean, qty_needed numeric, qty_served numeric, qty_ordered numeric, qty_received numeric, qty_reserved numeric, qty_missing numeric)
--  LANGUAGE sql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
--   WITH contracts AS (
--     SELECT
--       cc.id AS c_id,
--       COALESCE(cc.signature_date, cc.status_changed_at, cc.created_at) AS c_sort_ts,
--       COALESCE(
--         cc.quote_id,
--         (
--           SELECT q2.id
--           FROM public.quotes q2
--           WHERE q2.proposal_id = cc.proposal_id
--           ORDER BY q2.created_at DESC
--           LIMIT 1
--         )
--       ) AS c_quote_id
--     FROM public.client_contracts cc
--     WHERE cc.organization_id = p_organization_id
--       AND cc.deleted_at IS NULL
--       AND cc.status IN ('signed', 'assinado')
--   ),
--   lines AS (
--     SELECT
--       c.c_id                AS l_contract_id,
--       c.c_sort_ts           AS l_sort_ts,
--       ql.id                 AS l_quote_line_id,
--       NULL::integer         AS l_component_index,
--       ql.product_id         AS l_product_id,
--       GREATEST(COALESCE(ql.qt * COALESCE(ql.units_per_uom, 1), 0), 0)::numeric AS l_qty_needed
--     FROM contracts c
--     JOIN public.quote_lines ql ON ql.quote_id = c.c_quote_id
--     JOIN public.products p ON p.id = ql.product_id
--     WHERE ql.product_id IS NOT NULL
--       AND (p_product_ids IS NULL OR ql.product_id = ANY (p_product_ids))
--
--     UNION ALL
--
--     SELECT
--       c.c_id,
--       c.c_sort_ts,
--       ql.id,
--       comp.ord::integer,
--       p.id,
--       GREATEST(COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1), 0)::numeric
--     FROM contracts c
--     JOIN public.quote_lines ql
--       ON ql.quote_id = c.c_quote_id
--      AND ql.bundle_id IS NOT NULL
--      AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
--     CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components')
--       WITH ORDINALITY AS comp(value, ord)
--     JOIN public.products p ON p.id = (comp.value ->> 'source_id')::uuid
--     WHERE comp.value ->> 'type' = 'product'
--       AND comp.value ->> 'source_id' IS NOT NULL
--       AND (p_product_ids IS NULL OR p.id = ANY (p_product_ids))
--   ),
--   org_stock AS (
--     SELECT s.product_id AS os_product_id, SUM(s.quantity)::numeric AS os_qty
--     FROM public.stocks s
--     JOIN public.warehouses w ON w.id = s.warehouse_id
--     WHERE s.deleted_at IS NULL
--       AND w.organization_id = p_organization_id
--       AND w.deleted_at IS NULL
--       AND s.product_id IN (SELECT l.l_product_id FROM lines l)
--     GROUP BY s.product_id
--   ),
--   sold AS (
--     SELECT
--       sm.sale_source_id AS sd_contract_id,
--       sm.reference_id   AS sd_quote_line_id,
--       sm.product_id     AS sd_product_id,
--       SUM(LEAST(sm.quantity, GREATEST(0, -sm.balance_after)))::numeric AS sd_short,
--       -- NOVO (20261204630000): quantidade realmente vendida (unidades base,
--       -- como l_qty_needed). A dedução passou a poder ser parcial.
--       SUM(sm.quantity)::numeric AS sd_qty
--     FROM public.stock_movements sm
--     WHERE sm.sale_source_type = 'contract'
--       AND sm.movement_type = 'venda'
--       AND sm.sale_source_id IN (SELECT c.c_id FROM contracts c)
--       AND NOT EXISTS (
--         SELECT 1 FROM public.stock_movements r
--         WHERE r.reversal_of_movement_id = sm.id
--       )
--     GROUP BY sm.sale_source_id, sm.reference_id, sm.product_id
--   ),
--   exits AS (
--     SELECT
--       sm.sale_source_id AS ex_contract_id,
--       sm.product_id     AS ex_product_id,
--       SUM(sm.quantity)::numeric AS ex_qty
--     FROM public.stock_movements sm
--     WHERE sm.sale_source_type = 'contract'
--       AND sm.movement_type = 'saida'
--       AND sm.sale_source_id IN (SELECT c.c_id FROM contracts c)
--       AND NOT EXISTS (
--         SELECT 1 FROM public.stock_movements r
--         WHERE r.reversal_of_movement_id = sm.id
--       )
--     GROUP BY sm.sale_source_id, sm.product_id
--   ),
--   po_items AS (
--     SELECT
--       po.source_id         AS pi_contract_id,
--       poi.product_id       AS pi_product_id,
--       poi.quote_line_id    AS pi_quote_line_id,
--       poi.component_index  AS pi_component_index,
--       (poi.quantity * COALESCE(poi.units_per_uom, 1))::numeric AS pi_qty,
--       (
--         CASE WHEN po.status = 'received' THEN poi.quantity
--              ELSE LEAST(COALESCE(poi.received_quantity, 0), poi.quantity)
--         END * COALESCE(poi.units_per_uom, 1)
--       )::numeric AS pi_recv
--     FROM public.purchase_orders po
--     JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
--     WHERE po.source_type = 'contract'
--       AND po.source_id IN (SELECT c.c_id FROM contracts c)
--       AND po.status IS DISTINCT FROM 'cancelled'
--       AND po.deleted_at IS NULL
--       AND poi.product_id IS NOT NULL
--   ),
--   po_linked AS (
--     SELECT pi_contract_id, pi_quote_line_id, pi_component_index, pi_product_id,
--            SUM(pi_qty) AS pl_qty, SUM(pi_recv) AS pl_recv
--     FROM po_items
--     WHERE pi_quote_line_id IS NOT NULL
--     GROUP BY pi_contract_id, pi_quote_line_id, pi_component_index, pi_product_id
--   ),
--   po_pool AS (
--     SELECT pi_contract_id, pi_product_id,
--            SUM(pi_qty) AS pp_qty, SUM(pi_recv) AS pp_recv
--     FROM po_items
--     WHERE pi_quote_line_id IS NULL
--     GROUP BY pi_contract_id, pi_product_id
--   ),
--   step1 AS (
--     SELECT
--       l.*,
--       COALESCE(l.l_component_index, 0)                          AS s1_comp_key,
--       (sd.sd_contract_id IS NOT NULL)                           AS s1_is_sold,
--       COALESCE(sd.sd_short, 0)                                  AS s1_short_at_sale,
--       COALESCE(sd.sd_qty, 0)                                    AS s1_sold_qty,  -- NOVO (20261204630000)
--       (ex.ex_contract_id IS NOT NULL)                           AS s1_has_exit,
--       COALESCE(ex.ex_qty, 0)                                    AS s1_exit_pool,
--       LEAST(l.l_qty_needed, COALESCE(pl.pl_qty, 0))             AS s1_linked_qty,
--       LEAST(COALESCE(pl.pl_recv, 0), l.l_qty_needed, COALESCE(pl.pl_qty, 0)) AS s1_linked_recv,
--       COALESCE(pp.pp_qty, 0)                                    AS s1_pool_qty,
--       COALESCE(pp.pp_recv, 0)                                   AS s1_pool_recv,
--       GREATEST(0, COALESCE(os.os_qty, 0))                       AS s1_stock,
--       GREATEST(0, -COALESCE(os.os_qty, 0))                      AS s1_stock_debt
--     FROM lines l
--     LEFT JOIN sold sd
--       ON sd.sd_contract_id   = l.l_contract_id
--      AND sd.sd_quote_line_id = l.l_quote_line_id
--      AND sd.sd_product_id    = l.l_product_id
--      AND l.l_component_index IS NULL
--     LEFT JOIN exits ex
--       ON ex.ex_contract_id = l.l_contract_id
--      AND ex.ex_product_id  = l.l_product_id
--     LEFT JOIN po_linked pl
--       ON pl.pi_contract_id   = l.l_contract_id
--      AND pl.pi_quote_line_id = l.l_quote_line_id
--      AND pl.pi_component_index IS NOT DISTINCT FROM l.l_component_index
--      AND pl.pi_product_id    = l.l_product_id
--     LEFT JOIN po_pool pp
--       ON pp.pi_contract_id = l.l_contract_id
--      AND pp.pi_product_id  = l.l_product_id
--     LEFT JOIN org_stock os
--       ON os.os_product_id = l.l_product_id
--   ),
--   -- Repartição do pool de itens de PO sem ligação por (contrato, produto).
--   step2 AS (
--     SELECT
--       s.*,
--       LEAST(
--         s.l_qty_needed - s.s1_linked_qty,
--         GREATEST(0, s.s1_pool_qty - COALESCE(SUM(s.l_qty_needed - s.s1_linked_qty) OVER (
--           PARTITION BY s.l_contract_id, s.l_product_id
--           ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
--           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
--         ), 0))
--       ) AS s2_pool_alloc
--     FROM step1 s
--   ),
--   -- Parte recebida do pool e repartição das saídas manuais.
--   step3 AS (
--     SELECT
--       s.*,
--       s.s1_linked_qty + s.s2_pool_alloc AS s3_ordered,
--       LEAST(
--         s.s2_pool_alloc,
--         GREATEST(0, s.s1_pool_recv - COALESCE(SUM(s.s2_pool_alloc) OVER (
--           PARTITION BY s.l_contract_id, s.l_product_id
--           ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
--           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
--         ), 0))
--       ) AS s3_pool_recv_alloc,
--       LEAST(
--         CASE WHEN s.s1_is_sold THEN 0
--              ELSE s.l_qty_needed - s.s1_linked_qty - s.s2_pool_alloc END,
--         GREATEST(0, s.s1_exit_pool - COALESCE(SUM(
--           CASE WHEN s.s1_is_sold THEN 0
--                ELSE s.l_qty_needed - s.s1_linked_qty - s.s2_pool_alloc END
--         ) OVER (
--           PARTITION BY s.l_contract_id, s.l_product_id
--           ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
--           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
--         ), 0))
--       ) AS s3_exit_alloc
--     FROM step2 s
--   ),
--   -- Quantidade ainda por cobrir das linhas pendentes (entra na fila).
--   step4 AS (
--     SELECT
--       s.*,
--       CASE WHEN s.s1_is_sold OR s.s1_has_exit THEN 0
--            ELSE GREATEST(0, s.l_qty_needed - s.s3_ordered) END AS s4_rem
--     FROM step3 s
--   ),
--   -- Fila por produto (window) — reserva do stock livre por ordem.
--   step5 AS (
--     SELECT
--       s.*,
--       row_number() OVER w_prod AS s5_seq,
--       SUM(s.s4_rem) OVER (w_prod ROWS UNBOUNDED PRECEDING) AS s5_cum_rem
--     FROM step4 s
--     WINDOW w_prod AS (
--       PARTITION BY s.l_product_id
--       ORDER BY s.l_sort_ts, s.l_contract_id, s.l_quote_line_id, s.s1_comp_key
--     )
--   ),
--   final AS (
--     SELECT
--       s.*,
--       (LEAST(s.s1_stock, s.s5_cum_rem) - LEAST(s.s1_stock, s.s5_cum_rem - s.s4_rem)) AS f_reserved
--     FROM step5 s
--   ),
--   -- NOVO (20261204340000): quantidade realmente servida por stock e
--   -- recebida do fornecedor, por linha.
--   --  * venda automática: servida = necessária menos a parte que ficou a
--   --    descoberto no momento da venda (e continua em dívida no stock);
--   --    NOVO (20261204630000): limitada à quantidade realmente vendida
--   --    (LEAST(necessária, vendida)) — a dedução pode ser parcial. Com
--   --    vendida = necessária (todas as vendas anteriores) é igual a antes;
--   --  * saída manual: a saída do (contrato, produto) é repartida pelas linhas
--   --    por ordem (seq) até à quantidade realmente saída (s3_exit_alloc) — uma
--   --    saída pequena já não serve todas as linhas;
--   --  * a receção de POs de contrato não entra em stock (vai direto à
--   --    encomenda), por isso a parte recebida conta como entregue.
--   served AS (
--     SELECT
--       f.*,
--       CASE
--         WHEN f.s1_is_sold THEN
--           GREATEST(0, LEAST(f.l_qty_needed, f.s1_sold_qty)
--                       - LEAST(f.l_qty_needed, f.s1_short_at_sale, f.s1_stock_debt))  -- NOVO (20261204630000)
--         WHEN f.s1_has_exit THEN f.s3_exit_alloc
--         ELSE 0
--       END::numeric AS sv_served,
--       (f.s1_linked_recv + f.s3_pool_recv_alloc)::numeric AS sv_received
--     FROM final f
--   )
--   SELECT
--     f.l_contract_id,
--     f.l_quote_line_id,
--     f.l_component_index,
--     f.l_product_id,
--     f.s5_seq,
--     -- NOVO (20261204340000): is_served = linha concluída —
--     -- qty_served + qty_received >= qty_needed (antes: qualquer saída do
--     -- (contrato, produto) marcava todas as linhas como servidas).
--     ((f.sv_served + f.sv_received) >= f.l_qty_needed
--       AND (f.l_qty_needed > 0 OR f.s1_is_sold OR f.s1_has_exit)),
--     f.s1_is_sold,
--     f.l_qty_needed,
--     f.sv_served,
--     f.s3_ordered,
--     f.sv_received,
--     -- Linhas com venda/saída não entram na fila (uma saída por (contrato,
--     -- produto)): a reserva nunca conta a parte já servida; o que ficou por
--     -- servir passa a qty_missing.
--     CASE WHEN f.s1_is_sold OR f.s1_has_exit THEN 0 ELSE f.f_reserved END::numeric,
--     CASE
--       WHEN f.s1_is_sold THEN
--         -- NOVO (20261204630000): necessário − servido − encomendado. Com
--         -- vendida = necessária dá exatamente o de antes:
--         -- LEAST(necessário, short, dívida) − encomendado.
--         GREATEST(0, f.l_qty_needed - f.sv_served - f.s3_ordered)
--       WHEN f.s1_has_exit THEN
--         GREATEST(0, f.l_qty_needed - f.s3_ordered - f.s3_exit_alloc)
--       ELSE
--         GREATEST(0, f.s4_rem - f.f_reserved)
--     END::numeric
--   FROM served f;
-- $function$;
