-- 20261206140000: anular o que falta receber numa encomenda a fornecedor
--
-- O fornecedor não vai entregar (ou encontrou-se stock): a quantidade em falta
-- de uma linha de PO — ou de todas as linhas da PO — é anulada com motivo.
-- Mecanismo: purchase_order_items.quantity desce para received_quantity
-- (CHECK received_quantity <= quantity continua válido). Total e IVA da linha
-- descem na mesma proporção e o total_value da PO desce a diferença.
--
-- A Encomenda Cliente ligada reage sozinha: fn_client_order_line_reservations
-- usa poi.quantity como "encomendado", por isso o resto deixa de estar "a
-- aguardar fornecedor" e passa para a fila FIFO (reservado / em falta).
--
-- Estados aceites: pending, ordered, partially_received (recusa received e
-- cancelled). Uma PO pendente que nunca chegou pode ser anulada por inteiro.
--
-- Estado da PO, mesma regra das receções (linhas de produto):
--   * tudo recebido (soma > 0)        → 'received' (data de entrega = hoje se vazia)
--   * algo recebido                   → 'partially_received'
--   * nada recebido, soma fica a 0 e a PO não tem linhas de serviço
--                                     → 'cancelled' — mesmo resultado do
--     cancelamento pelo formulário (rpc_update_purchase_order só muda o
--     estado; não há gatilhos com efeitos). As linhas não são reescritas.
--   * idem mas com linhas de serviço  → estado mantém-se (os serviços não são
--     anulados aqui); o retorno indica-o (products_all_cancelled /
--     has_service_lines) para o utilizador decidir se cancela a PO.
--   * caso contrário                  → estado mantém-se
--
-- Custos operacionais (ops_custo.compra_linha_id) acima da nova quantidade
-- impedem a anulação dessa linha.
--
-- Cada anulação fica em purchase_order_item_cancellations (antes/depois) e
-- pode ser desfeita: por linha, ou por lote (anulação da PO inteira). O
-- histórico sobrevive à linha (FK SET NULL — rpc_update_purchase_order apaga e
-- recria as linhas de POs sem receções); sem linha, o undo é recusado.
--
-- Desfazer é recusado quando:
--   * já foi desfeita; PO apagada; PO cancelada por outra via;
--   * a linha já não existe ou mudou (quantity <> quantity_after);
--   * linha anulada em lote (desfaz-se o lote, tudo ou nada);
--   * PO de Encomenda Cliente e, depois da anulação, foi pedido novo material
--     para a mesma linha da EC (linha de PO nova não cancelada no mesmo
--     contrato, ou quantidade aumentada segundo entity_audit_log) — desfazer
--     duplicaria a encomenda. Serializa com fn_client_order_request_missing
--     pelo mesmo advisory lock.
--
-- Objetos (todos NOVOS — nada existente é alterado):
--   + purchase_order_item_cancellations (RLS só leitura)
--   + fn_po_cancel_remainder_status        (interna)
--   + fn_po_cancel_remainder_guard         (interna)
--   + fn_po_cancel_line_remainder_internal (interna)
--   + fn_po_undo_cancellations_internal    (interna)
--   + rpc_cancel_po_line_remainder, rpc_cancel_po_remainder
--   + rpc_undo_po_line_cancellation, rpc_undo_po_cancellation_batch
--
-- Segurança: mesmas verificações de rpc_receive_purchase_order_lines
-- (organização visível + purchase_orders.receive + inventory.edit), lock da
-- PO e advisory lock da EC. SECURITY DEFINER, search_path public, pg_temp.
-- Internas sem EXECUTE para PUBLIC/anon/authenticated/service_role (só
-- executadas pelas RPCs, como owner). RPCs: authenticated e service_role.
-- Auditoria: uma linha em entity_audit_log por operação (fn_manual_audit_log,
-- gatilhos em bypass como em rpc_revert_purchase_order_receipt).
--
-- Partiu das definições VIVAS (pg_get_functiondef em 2026-10-02). Testado na
-- BD viva em transação com ROLLBACK. Reversão no fim do ficheiro.

SET lock_timeout = '5s';

-- ── 1. Histórico de anulações ──────────────────────────────────────────────
CREATE TABLE public.purchase_order_item_cancellations (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                uuid NOT NULL,
  -- Como purchase_order_receipts: PO apagada leva o histórico; linha apagada
  -- (rpc_update_purchase_order recria as linhas) deixa-o com NULL.
  purchase_order_id              uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  purchase_order_item_id         uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  -- Anulação da PO inteira: todas as linhas do lote partilham o batch_id.
  -- Anulação de uma só linha: NULL.
  batch_id                       uuid,
  quantity_cancelled             numeric(10,2) NOT NULL CHECK (quantity_cancelled > 0),
  quantity_before                numeric(10,2) NOT NULL,
  quantity_after                 numeric(10,2) NOT NULL,
  total_price_before             numeric,
  total_price_after              numeric,
  vat_amount_before              numeric,
  vat_amount_after               numeric,
  po_total_value_before          numeric,
  po_total_value_after           numeric,
  -- Estado da PO no início da operação e no fim (no lote: o da operação toda).
  po_status_before               text,
  po_status_after                text,
  po_actual_delivery_date_before date,
  reason                         text NOT NULL
    CHECK (reason IN ('found_stock', 'supplier_unavailable', 'other')),
  notes                          text,
  created_by                     uuid,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  undone_at                      timestamptz,
  undone_by                      uuid,
  undo_reason                    text,
  CONSTRAINT purchase_order_item_cancellations_other_needs_notes
    CHECK (reason <> 'other' OR length(btrim(COALESCE(notes, ''))) > 0),
  CONSTRAINT purchase_order_item_cancellations_qty_coherent
    CHECK (quantity_after >= 0 AND quantity_before = quantity_after + quantity_cancelled)
);

CREATE INDEX idx_po_item_cancellations_po   ON public.purchase_order_item_cancellations (purchase_order_id);
CREATE INDEX idx_po_item_cancellations_item ON public.purchase_order_item_cancellations (purchase_order_item_id);
CREATE INDEX idx_po_item_cancellations_batch ON public.purchase_order_item_cancellations (batch_id)
  WHERE batch_id IS NOT NULL;

COMMENT ON TABLE public.purchase_order_item_cancellations IS
  'Anulações da quantidade em falta de linhas de PO (antes/depois). Escrita só pelas RPCs rpc_cancel_po_* / rpc_undo_po_*.';

ALTER TABLE public.purchase_order_item_cancellations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.purchase_order_item_cancellations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.purchase_order_item_cancellations TO authenticated;
GRANT ALL ON TABLE public.purchase_order_item_cancellations TO service_role;

-- Mesmo critério de organização de purchase_orders / purchase_order_receipts.
-- Sem policies de escrita.
CREATE POLICY purchase_order_item_cancellations_select ON public.purchase_order_item_cancellations
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))));

-- ── 2. Estado da PO depois de mexer nas quantidades (interna) ──────────────
-- Mesma regra de rpc_receive_purchase_order_lines, mais: soma de quantidades
-- de produto a 0 (tudo anulado, nada recebido) e sem linhas de serviço →
-- 'cancelled'. Com serviços, o estado mantém-se.
-- p_fallback_status: estado quando nada foi recebido e não se cancela.
CREATE FUNCTION public.fn_po_cancel_remainder_status(p_purchase_order_id uuid, p_fallback_status text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
           WHEN s.sum_q > 0 AND s.sum_r >= s.sum_q THEN 'received'
           WHEN s.sum_r > 0 THEN 'partially_received'
           WHEN s.sum_q = 0 AND s.n_services = 0 THEN 'cancelled'
           ELSE p_fallback_status
         END
  FROM (
    SELECT COALESCE(SUM(quantity) FILTER (WHERE item_type = 'product'), 0)          AS sum_q,
           COALESCE(SUM(received_quantity) FILTER (WHERE item_type = 'product'), 0) AS sum_r,
           count(*) FILTER (WHERE item_type = 'service')                            AS n_services
    FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id
  ) s;
$function$;

REVOKE ALL ON FUNCTION public.fn_po_cancel_remainder_status(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- ── 3. Verificações comuns + lock da PO (interna) ──────────────────────────
-- Igual a rpc_receive_purchase_order_lines: utilizador, lock FOR UPDATE da PO
-- não apagada, organização visível + purchase_orders.receive + inventory.edit,
-- advisory lock da EC (serializa com receções de outras POs da mesma EC).
-- A permissão é verificada antes de revelar o estado da PO.
CREATE FUNCTION public.fn_po_cancel_remainder_guard(p_purchase_order_id uuid)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  IF public.current_business_user_id() IS NULL THEN
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
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.receive')
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para alterar encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_po.source_type = 'contract' AND v_po.source_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('po_receipt_contract:' || v_po.source_id::text, 0));
  END IF;

  RETURN v_po;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_po_cancel_remainder_guard(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ── 4. Anular o resto de uma linha (interna) ───────────────────────────────
-- Chamada com a PO já trancada e validada. Tranca a linha, valida, baixa
-- quantity para received_quantity, escala total/IVA, desce o total da PO e
-- grava a anulação (po_status_after é preenchido por quem chama).
CREATE FUNCTION public.fn_po_cancel_line_remainder_internal(
  p_po       public.purchase_orders,
  p_item_id  uuid,
  p_reason   text,
  p_notes    text,
  p_batch_id uuid,
  p_actor    uuid
)
RETURNS public.purchase_order_item_cancellations
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item      record;
  v_new_qty   numeric;
  v_new_tp    numeric;
  v_new_vat   numeric;
  v_assigned  numeric;
  v_tv_before numeric;
  v_tv_after  numeric;
  v_row       public.purchase_order_item_cancellations%ROWTYPE;
BEGIN
  SELECT id, item_type, quantity, received_quantity, total_price, vat_amount, description
  INTO v_item
  FROM public.purchase_order_items
  WHERE id = p_item_id AND purchase_order_id = p_po.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', p_item_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_item.item_type <> 'product' THEN
    RAISE EXCEPTION 'A linha "%" não é um produto — só se anula a quantidade em falta de produtos', v_item.description
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_item.quantity <= v_item.received_quantity THEN
    RAISE EXCEPTION 'A linha "%" não tem quantidade em falta para anular (% de % recebidas)',
      v_item.description, v_item.received_quantity, v_item.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  v_new_qty := v_item.received_quantity;

  -- Custos operacionais atribuídos à linha (ops_custo.compra_linha_id, na
  -- unidade da linha, como ops_v_compra_linha) não podem ficar acima do que
  -- a linha passa a ter. Os custos existentes ficam trancados (FOR SHARE)
  -- até ao fim da transação para não mudarem entre a soma e a escrita.
  PERFORM 1 FROM public.ops_custo c WHERE c.compra_linha_id = v_item.id FOR SHARE;

  SELECT COALESCE(SUM(c.quantidade), 0) INTO v_assigned
  FROM public.ops_custo c
  WHERE c.compra_linha_id = v_item.id;

  IF v_assigned > v_new_qty THEN
    RAISE EXCEPTION 'A linha "%" tem % atribuídas a custos de ordens de trabalho; ao anular ficaria com %. Retira primeiro esses custos.',
      v_item.description, v_assigned, v_new_qty
      USING ERRCODE = 'check_violation';
  END IF;

  -- quantity > received_quantity >= 0, logo quantity > 0.
  v_new_tp  := round(COALESCE(v_item.total_price, 0) * v_new_qty / v_item.quantity, 2);
  v_new_vat := CASE WHEN v_item.vat_amount IS NULL THEN NULL
                    ELSE round(v_item.vat_amount * v_new_qty / v_item.quantity, 2) END;

  UPDATE public.purchase_order_items
  SET quantity    = v_new_qty,
      total_price = v_new_tp,
      vat_amount  = v_new_vat
  WHERE id = v_item.id;

  UPDATE public.purchase_orders
  SET total_value = total_value - (COALESCE(v_item.total_price, 0) - v_new_tp)
  WHERE id = p_po.id
  RETURNING total_value + (COALESCE(v_item.total_price, 0) - v_new_tp), total_value
  INTO v_tv_before, v_tv_after;

  INSERT INTO public.purchase_order_item_cancellations (
    organization_id, purchase_order_id, purchase_order_item_id, batch_id,
    quantity_cancelled, quantity_before, quantity_after,
    total_price_before, total_price_after, vat_amount_before, vat_amount_after,
    po_total_value_before, po_total_value_after,
    po_status_before, po_actual_delivery_date_before,
    reason, notes, created_by
  ) VALUES (
    p_po.organization_id, p_po.id, v_item.id, p_batch_id,
    v_item.quantity - v_new_qty, v_item.quantity, v_new_qty,
    v_item.total_price, v_new_tp, v_item.vat_amount, v_new_vat,
    v_tv_before, v_tv_after,
    p_po.status, p_po.actual_delivery_date,
    p_reason, p_notes, p_actor
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_po_cancel_line_remainder_internal(public.purchase_orders, uuid, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ── 5. RPC: anular o resto de uma linha ────────────────────────────────────
CREATE FUNCTION public.rpc_cancel_po_line_remainder(
  p_purchase_order_item_id uuid,
  p_reason                 text,
  p_notes                  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_po_id       uuid;
  v_po          public.purchase_orders%ROWTYPE;
  v_notes       text := nullif(btrim(COALESCE(p_notes, '')), '');
  v_c           public.purchase_order_item_cancellations%ROWTYPE;
  v_new_status  text;
  v_new_date    date;
  v_prev_bypass text;
  v_diff        jsonb;
  v_desc        text;
  v_prod_zero   boolean;
  v_has_svc     boolean;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT purchase_order_id INTO v_po_id
  FROM public.purchase_order_items
  WHERE id = p_purchase_order_item_id;

  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Linha de encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_po := public.fn_po_cancel_remainder_guard(v_po_id);

  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'Esta encomenda está cancelada' USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'received' THEN
    RAISE EXCEPTION 'Esta encomenda já foi totalmente recebida — não há nada em falta' USING ERRCODE = 'check_violation';
  END IF;

  IF p_reason IS NULL OR p_reason NOT IN ('found_stock', 'supplier_unavailable', 'other') THEN
    RAISE EXCEPTION 'Motivo inválido: %', COALESCE(p_reason, '(vazio)') USING ERRCODE = 'check_violation';
  END IF;
  IF p_reason = 'other' AND v_notes IS NULL THEN
    RAISE EXCEPTION 'Com o motivo "outro" é obrigatório escrever uma nota' USING ERRCODE = 'check_violation';
  END IF;

  v_prev_bypass := current_setting('app.audit_bypass', true);
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_c := public.fn_po_cancel_line_remainder_internal(v_po, p_purchase_order_item_id, p_reason, v_notes, NULL, v_actor);

  v_new_status := public.fn_po_cancel_remainder_status(v_po.id, v_po.status);

  -- Informativo: todos os produtos a 0 numa PO com serviços (não é cancelada).
  SELECT COALESCE(SUM(quantity) FILTER (WHERE item_type = 'product'), 0) = 0,
         COALESCE(bool_or(item_type = 'service'), false)
  INTO v_prod_zero, v_has_svc
  FROM public.purchase_order_items
  WHERE purchase_order_id = v_po.id;
  v_new_date   := CASE WHEN v_new_status = 'received'
                       THEN COALESCE(v_po.actual_delivery_date, current_date)
                       ELSE v_po.actual_delivery_date END;

  UPDATE public.purchase_orders
  SET status               = v_new_status,
      actual_delivery_date = v_new_date,
      updated_at           = now()
  WHERE id = v_po.id;

  UPDATE public.purchase_order_item_cancellations
  SET po_status_after = v_new_status
  WHERE id = v_c.id;

  PERFORM set_config('app.audit_bypass', COALESCE(v_prev_bypass, ''), true);

  SELECT description INTO v_desc FROM public.purchase_order_items WHERE id = v_c.purchase_order_item_id;

  v_diff := jsonb_build_object(
    'total_value', jsonb_build_object('old', v_po.total_value, 'new', v_po.total_value - (COALESCE(v_c.total_price_before, 0) - COALESCE(v_c.total_price_after, 0))),
    'line_remainder_cancellation', jsonb_build_object(
      'reason', p_reason,
      'notes',  v_notes,
      'lines',  jsonb_build_array(jsonb_build_object(
        'cancellation_id',        v_c.id,
        'purchase_order_item_id', v_c.purchase_order_item_id,
        'description',            v_desc,
        'quantity',               jsonb_build_object('old', v_c.quantity_before, 'new', v_c.quantity_after),
        'total_price',            jsonb_build_object('old', v_c.total_price_before, 'new', v_c.total_price_after),
        'vat_amount',             jsonb_build_object('old', v_c.vat_amount_before, 'new', v_c.vat_amount_after)
      ))
    )
  );
  IF v_new_status IS DISTINCT FROM v_po.status THEN
    v_diff := v_diff || jsonb_build_object('status', jsonb_build_object('old', v_po.status, 'new', v_new_status));
  END IF;
  IF v_new_date IS DISTINCT FROM v_po.actual_delivery_date THEN
    v_diff := v_diff || jsonb_build_object('actual_delivery_date', jsonb_build_object('old', v_po.actual_delivery_date, 'new', v_new_date));
  END IF;

  PERFORM public.fn_manual_audit_log(
    'purchase_orders', v_po.id, v_po.organization_id, 'UPDATE', v_diff, 'web_app', v_po.id
  );

  RETURN jsonb_build_object(
    'cancellation_id',        v_c.id,
    'purchase_order_id',      v_po.id,
    'purchase_order_item_id', v_c.purchase_order_item_id,
    'quantity_cancelled',     v_c.quantity_cancelled,
    'status',                 v_new_status,
    'products_all_cancelled', v_prod_zero,
    'has_service_lines',      v_has_svc
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_cancel_po_line_remainder(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_po_line_remainder(uuid, text, text) TO authenticated, service_role;

-- ── 6. RPC: anular o resto da PO inteira ───────────────────────────────────
-- Todas as linhas de produto com quantidade em falta, num lote (batch_id).
-- Nada recebido em nenhuma linha → a PO fica 'cancelled'.
CREATE FUNCTION public.rpc_cancel_po_remainder(
  p_purchase_order_id uuid,
  p_reason            text,
  p_notes             text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_po          public.purchase_orders%ROWTYPE;
  v_notes       text := nullif(btrim(COALESCE(p_notes, '')), '');
  v_batch_id    uuid := gen_random_uuid();
  v_item_id     uuid;
  v_c           public.purchase_order_item_cancellations%ROWTYPE;
  v_ids         uuid[] := ARRAY[]::uuid[];
  v_lines       jsonb := '[]'::jsonb;
  v_delta_total numeric := 0;
  v_new_status  text;
  v_new_date    date;
  v_prev_bypass text;
  v_diff        jsonb;
  v_desc        text;
  v_prod_zero   boolean;
  v_has_svc     boolean;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_po := public.fn_po_cancel_remainder_guard(p_purchase_order_id);

  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'Esta encomenda já está cancelada' USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'received' THEN
    RAISE EXCEPTION 'Esta encomenda já foi totalmente recebida — não há nada em falta' USING ERRCODE = 'check_violation';
  END IF;

  IF p_reason IS NULL OR p_reason NOT IN ('found_stock', 'supplier_unavailable', 'other') THEN
    RAISE EXCEPTION 'Motivo inválido: %', COALESCE(p_reason, '(vazio)') USING ERRCODE = 'check_violation';
  END IF;
  IF p_reason = 'other' AND v_notes IS NULL THEN
    RAISE EXCEPTION 'Com o motivo "outro" é obrigatório escrever uma nota' USING ERRCODE = 'check_violation';
  END IF;

  v_prev_bypass := current_setting('app.audit_bypass', true);
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- Ordem fixa (id) para trancar as linhas sempre pela mesma sequência.
  FOR v_item_id IN
    SELECT id FROM public.purchase_order_items
    WHERE purchase_order_id = v_po.id
      AND item_type = 'product'
      AND quantity > received_quantity
    ORDER BY id
  LOOP
    v_c := public.fn_po_cancel_line_remainder_internal(v_po, v_item_id, p_reason, v_notes, v_batch_id, v_actor);
    v_ids := v_ids || v_c.id;
    v_delta_total := v_delta_total + (COALESCE(v_c.total_price_before, 0) - COALESCE(v_c.total_price_after, 0));

    SELECT description INTO v_desc FROM public.purchase_order_items WHERE id = v_item_id;
    v_lines := v_lines || jsonb_build_object(
      'cancellation_id',        v_c.id,
      'purchase_order_item_id', v_item_id,
      'description',            v_desc,
      'quantity',               jsonb_build_object('old', v_c.quantity_before, 'new', v_c.quantity_after),
      'total_price',            jsonb_build_object('old', v_c.total_price_before, 'new', v_c.total_price_after),
      'vat_amount',             jsonb_build_object('old', v_c.vat_amount_before, 'new', v_c.vat_amount_after)
    );
  END LOOP;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Esta encomenda não tem quantidades em falta para anular' USING ERRCODE = 'check_violation';
  END IF;

  v_new_status := public.fn_po_cancel_remainder_status(v_po.id, v_po.status);

  -- Informativo: todos os produtos a 0 numa PO com serviços (não é cancelada).
  SELECT COALESCE(SUM(quantity) FILTER (WHERE item_type = 'product'), 0) = 0,
         COALESCE(bool_or(item_type = 'service'), false)
  INTO v_prod_zero, v_has_svc
  FROM public.purchase_order_items
  WHERE purchase_order_id = v_po.id;
  v_new_date   := CASE WHEN v_new_status = 'received'
                       THEN COALESCE(v_po.actual_delivery_date, current_date)
                       ELSE v_po.actual_delivery_date END;

  UPDATE public.purchase_orders
  SET status               = v_new_status,
      actual_delivery_date = v_new_date,
      updated_at           = now()
  WHERE id = v_po.id;

  UPDATE public.purchase_order_item_cancellations
  SET po_status_after = v_new_status
  WHERE id = ANY (v_ids);

  PERFORM set_config('app.audit_bypass', COALESCE(v_prev_bypass, ''), true);

  v_diff := jsonb_build_object(
    'total_value', jsonb_build_object('old', v_po.total_value, 'new', v_po.total_value - v_delta_total),
    'line_remainder_cancellation', jsonb_build_object(
      'reason',   p_reason,
      'notes',    v_notes,
      'batch_id', v_batch_id,
      'lines',    v_lines
    )
  );
  IF v_new_status IS DISTINCT FROM v_po.status THEN
    v_diff := v_diff || jsonb_build_object('status', jsonb_build_object('old', v_po.status, 'new', v_new_status));
  END IF;
  IF v_new_date IS DISTINCT FROM v_po.actual_delivery_date THEN
    v_diff := v_diff || jsonb_build_object('actual_delivery_date', jsonb_build_object('old', v_po.actual_delivery_date, 'new', v_new_date));
  END IF;

  PERFORM public.fn_manual_audit_log(
    'purchase_orders', v_po.id, v_po.organization_id, 'UPDATE', v_diff, 'web_app', v_po.id
  );

  RETURN jsonb_build_object(
    'purchase_order_id', v_po.id,
    'batch_id',          v_batch_id,
    'status',            v_new_status,
    'cancellation_ids',  to_jsonb(v_ids),
    'lines_cancelled',   cardinality(v_ids),
    'products_all_cancelled', v_prod_zero,
    'has_service_lines', v_has_svc
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_cancel_po_remainder(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_po_remainder(uuid, text, text) TO authenticated, service_role;

-- ── 7. Desfazer (interna) ──────────────────────────────────────────────────
-- Desfaz um conjunto de anulações da MESMA PO (uma linha, ou um lote inteiro),
-- tudo ou nada. Chamada com a PO trancada e validada.
--   * recusa se alguma já foi desfeita, se a linha já não existe ou mudou
--     entretanto (quantity atual <> quantity_after);
--   * recusa se, depois da anulação, foi pedido novo material ao fornecedor
--     para a mesma linha da EC (ver cabeçalho);
--   * PO cancelada: só se foi esta operação a cancelá-la (po_status_after);
--   * repõe quantity/total/IVA e o total da PO; estado pela mesma regra
--     (sem nada recebido volta ao estado anterior se estava cancelada);
--   * a sair de 'received' por causa desta operação, repõe a data anterior.
CREATE FUNCTION public.fn_po_undo_cancellations_internal(
  p_po     public.purchase_orders,
  p_ids    uuid[],
  p_reason text,
  p_actor  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_c            record;
  v_item         record;
  v_reason       text := nullif(btrim(COALESCE(p_reason, '')), '');
  v_delta_total  numeric := 0;
  v_status_bef   text;
  v_status_aft   text;
  v_date_bef     date;
  v_new_status   text;
  v_new_date     date;
  v_lines        jsonb := '[]'::jsonb;
  v_prev_bypass  text;
  v_diff         jsonb;
  v_n            integer := 0;
BEGIN
  v_prev_bypass := current_setting('app.audit_bypass', true);
  PERFORM set_config('app.audit_bypass', 'on', true);

  FOR v_c IN
    SELECT * FROM public.purchase_order_item_cancellations
    WHERE id = ANY (p_ids)
    ORDER BY purchase_order_item_id, created_at DESC, id
    FOR UPDATE
  LOOP
    IF v_c.purchase_order_id <> p_po.id THEN
      RAISE EXCEPTION 'Anulação % não pertence a esta encomenda', v_c.id USING ERRCODE = 'check_violation';
    END IF;
    IF v_c.undone_at IS NOT NULL THEN
      RAISE EXCEPTION 'Esta anulação já foi desfeita' USING ERRCODE = 'check_violation';
    END IF;

    -- purchase_order_item_id NULL (linha apagada/recriada) → NOT FOUND.
    SELECT id, quantity, received_quantity, description, product_id, quote_line_id, component_index
    INTO v_item
    FROM public.purchase_order_items
    WHERE id = v_c.purchase_order_item_id AND purchase_order_id = p_po.id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A linha desta anulação já não existe na encomenda (foi apagada ou recriada) — não é possível desfazer'
        USING ERRCODE = 'no_data_found';
    END IF;
    IF v_item.quantity <> v_c.quantity_after THEN
      RAISE EXCEPTION 'A linha "%" mudou desde a anulação (quantidade % em vez de %) — não é possível desfazer',
        v_item.description, v_item.quantity, v_c.quantity_after
        USING ERRCODE = 'check_violation';
    END IF;

    -- Novo pedido ao fornecedor para a mesma linha da EC depois da anulação:
    -- linha de PO não cancelada/não apagada do mesmo contrato e produto, na
    -- mesma linha da EC (quote_line_id + component_index; uma das duas sem
    -- ligação também conta), criada depois da anulação ou com a quantidade
    -- aumentada depois (entity_audit_log do gatilho das linhas).
    -- fn_client_order_request_missing cria sempre linhas novas.
    -- >= porque created_at é o instante da transação.
    IF p_po.source_type = 'contract' AND p_po.source_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.purchase_order_items oi
      JOIN public.purchase_orders op ON op.id = oi.purchase_order_id
      WHERE op.source_type = 'contract'
        AND op.source_id = p_po.source_id
        AND op.deleted_at IS NULL
        AND op.status IS DISTINCT FROM 'cancelled'
        AND oi.id <> v_item.id
        AND oi.product_id = v_item.product_id
        AND (v_item.quote_line_id IS NULL
             OR oi.quote_line_id IS NULL
             OR (oi.quote_line_id = v_item.quote_line_id
                 AND oi.component_index IS NOT DISTINCT FROM v_item.component_index))
        AND (
          oi.created_at >= v_c.created_at
          OR EXISTS (
            SELECT 1 FROM public.entity_audit_log a
            WHERE a.entity_id = oi.id
              AND a.created_at >= v_c.created_at
              AND a.table_name = 'purchase_order_items'
              AND a.operation = 'UPDATE'
              AND (a.changed_fields -> 'quantity' ->> 'new')::numeric
                  > (a.changed_fields -> 'quantity' ->> 'old')::numeric
          )
        )
    ) THEN
      RAISE EXCEPTION 'Já foi pedido novo material ao fornecedor para esta linha da encomenda de cliente depois da anulação; desfazer duplicaria a encomenda.'
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.purchase_order_items
    SET quantity    = v_c.quantity_before,
        total_price = v_c.total_price_before,
        vat_amount  = v_c.vat_amount_before
    WHERE id = v_item.id;

    v_delta_total := v_delta_total + (COALESCE(v_c.total_price_before, 0) - COALESCE(v_c.total_price_after, 0));
    v_status_bef  := v_c.po_status_before;
    v_status_aft  := v_c.po_status_after;
    v_date_bef    := v_c.po_actual_delivery_date_before;
    v_n := v_n + 1;

    v_lines := v_lines || jsonb_build_object(
      'cancellation_id',        v_c.id,
      'purchase_order_item_id', v_item.id,
      'description',            v_item.description,
      'quantity',               jsonb_build_object('old', v_c.quantity_after, 'new', v_c.quantity_before),
      'total_price',            jsonb_build_object('old', v_c.total_price_after, 'new', v_c.total_price_before),
      'vat_amount',             jsonb_build_object('old', v_c.vat_amount_after, 'new', v_c.vat_amount_before)
    );
  END LOOP;

  IF v_n = 0 OR v_n <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'Anulação não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_po.status = 'cancelled' AND v_status_aft IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'Esta encomenda está cancelada — não é possível desfazer a anulação' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.purchase_orders
  SET total_value = total_value + v_delta_total
  WHERE id = p_po.id;

  v_new_status := public.fn_po_cancel_remainder_status(
    p_po.id,
    CASE WHEN p_po.status = 'cancelled' THEN v_status_bef ELSE p_po.status END
  );

  v_new_date := p_po.actual_delivery_date;
  IF v_new_status = 'received' THEN
    v_new_date := COALESCE(p_po.actual_delivery_date, current_date);
  ELSIF p_po.status = 'received' THEN
    v_new_date := CASE WHEN v_status_aft = 'received' THEN v_date_bef ELSE NULL END;
  END IF;

  UPDATE public.purchase_orders
  SET status               = v_new_status,
      actual_delivery_date = v_new_date,
      updated_at           = now()
  WHERE id = p_po.id;

  UPDATE public.purchase_order_item_cancellations
  SET undone_at   = now(),
      undone_by   = p_actor,
      undo_reason = v_reason
  WHERE id = ANY (p_ids);

  PERFORM set_config('app.audit_bypass', COALESCE(v_prev_bypass, ''), true);

  v_diff := jsonb_build_object(
    'total_value', jsonb_build_object('old', p_po.total_value, 'new', p_po.total_value + v_delta_total),
    'line_remainder_cancellation_undo', jsonb_build_object(
      'reason', v_reason,
      'lines',  v_lines
    )
  );
  IF v_new_status IS DISTINCT FROM p_po.status THEN
    v_diff := v_diff || jsonb_build_object('status', jsonb_build_object('old', p_po.status, 'new', v_new_status));
  END IF;
  IF v_new_date IS DISTINCT FROM p_po.actual_delivery_date THEN
    v_diff := v_diff || jsonb_build_object('actual_delivery_date', jsonb_build_object('old', p_po.actual_delivery_date, 'new', v_new_date));
  END IF;

  PERFORM public.fn_manual_audit_log(
    'purchase_orders', p_po.id, p_po.organization_id, 'UPDATE', v_diff, 'web_app', p_po.id
  );

  RETURN jsonb_build_object(
    'purchase_order_id', p_po.id,
    'status',            v_new_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_po_undo_cancellations_internal(public.purchase_orders, uuid[], text, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ── 8. RPC: desfazer a anulação de uma linha ───────────────────────────────
-- Linhas anuladas em lote desfazem-se pelo lote (rpc_undo_po_cancellation_batch).
CREATE FUNCTION public.rpc_undo_po_line_cancellation(p_cancellation_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor    uuid;
  v_po_id    uuid;
  v_batch_id uuid;
  v_src_type text;
  v_src_id   uuid;
  v_po       public.purchase_orders%ROWTYPE;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT purchase_order_id, batch_id INTO v_po_id, v_batch_id
  FROM public.purchase_order_item_cancellations
  WHERE id = p_cancellation_id;

  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Anulação não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Antes do lock da PO (mesma ordem de fn_client_order_request_missing:
  -- advisory lock da EC, depois a PO): um pedido de material em falta da
  -- mesma EC não corre em paralelo com o undo.
  SELECT source_type, source_id INTO v_src_type, v_src_id
  FROM public.purchase_orders WHERE id = v_po_id;
  IF v_src_type = 'contract' AND v_src_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('fn_client_order_request_missing:' || v_src_id::text, 0));
  END IF;

  v_po := public.fn_po_cancel_remainder_guard(v_po_id);

  IF v_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta linha foi anulada com a encomenda inteira — desfaz o lote completo' USING ERRCODE = 'check_violation';
  END IF;

  RETURN public.fn_po_undo_cancellations_internal(v_po, ARRAY[p_cancellation_id], p_reason, v_actor);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_undo_po_line_cancellation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_undo_po_line_cancellation(uuid, text) TO authenticated, service_role;

-- ── 9. RPC: desfazer a anulação da PO inteira (lote) ───────────────────────
CREATE FUNCTION public.rpc_undo_po_cancellation_batch(p_batch_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_po_id uuid;
  v_n_po  integer;
  v_ids   uuid[];
  v_src_type text;
  v_src_id   uuid;
  v_po    public.purchase_orders%ROWTYPE;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'Lote de anulação não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT min(purchase_order_id::text)::uuid, count(DISTINCT purchase_order_id)
  INTO v_po_id, v_n_po
  FROM public.purchase_order_item_cancellations
  WHERE batch_id = p_batch_id;

  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Lote de anulação não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_n_po <> 1 THEN
    RAISE EXCEPTION 'Lote de anulação inválido' USING ERRCODE = 'check_violation';
  END IF;

  -- Antes do lock da PO (mesma ordem de fn_client_order_request_missing:
  -- advisory lock da EC, depois a PO): um pedido de material em falta da
  -- mesma EC não corre em paralelo com o undo.
  SELECT source_type, source_id INTO v_src_type, v_src_id
  FROM public.purchase_orders WHERE id = v_po_id;
  IF v_src_type = 'contract' AND v_src_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('fn_client_order_request_missing:' || v_src_id::text, 0));
  END IF;

  v_po := public.fn_po_cancel_remainder_guard(v_po_id);

  -- Depois do lock da PO: a lista do lote já não muda.
  SELECT array_agg(id ORDER BY id) INTO v_ids
  FROM public.purchase_order_item_cancellations
  WHERE batch_id = p_batch_id;

  RETURN public.fn_po_undo_cancellations_internal(v_po, v_ids, p_reason, v_actor);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_undo_po_cancellation_batch(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_undo_po_cancellation_batch(uuid, text) TO authenticated, service_role;

RESET lock_timeout;

-- ── Reversão (manual) ──────────────────────────────────────────────────────
-- Não repõe quantidades já anuladas: desfazer primeiro as anulações ativas
-- (undone_at IS NULL) com as RPCs de undo, depois:
--   DROP FUNCTION public.rpc_undo_po_cancellation_batch(uuid, text);
--   DROP FUNCTION public.rpc_undo_po_line_cancellation(uuid, text);
--   DROP FUNCTION public.fn_po_undo_cancellations_internal(public.purchase_orders, uuid[], text, uuid);
--   DROP FUNCTION public.rpc_cancel_po_remainder(uuid, text, text);
--   DROP FUNCTION public.rpc_cancel_po_line_remainder(uuid, text, text);
--   DROP FUNCTION public.fn_po_cancel_line_remainder_internal(public.purchase_orders, uuid, text, text, uuid, uuid);
--   DROP FUNCTION public.fn_po_cancel_remainder_guard(uuid);
--   DROP FUNCTION public.fn_po_cancel_remainder_status(uuid, text);
--   DROP TABLE public.purchase_order_item_cancellations;
