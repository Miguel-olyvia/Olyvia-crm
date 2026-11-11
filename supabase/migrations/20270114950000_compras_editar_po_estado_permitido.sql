-- ============================================================
-- 20270114950000_compras_editar_po_estado_permitido
-- ============================================================
-- Falha (revisão de segurança do desenho, HIGH): rpc_update_purchase_order grava status = v_new_status com qualquer texto;
--   só 'ordered' pede purchase_orders.approve. Uma PO sem receções posta à mão em 'received' conta como totalmente recebida
--   na reserva da EC (fn_client_order_line_reservations_wh, pi_recv) sem mercadoria nenhuma — a mesma família do O11.
-- Decisão: ao editar, o estado só pode ser 'pending', 'ordered' (com purchase_orders.approve quando muda para 'ordered',
--   como já era) ou 'cancelled', ou ficar o ATUAL inalterado ('received' / 'partially_received' só se já for o estado da
--   PO). Qualquer outro texto é recusado (check_violation). Sem normalização: a comparação é a exata que a função já usa.
-- Alteração (a única; o resto é o texto vivo): a seguir ao cálculo de v_new_status, antes da verificação de approve:
--   IF v_new_status IS DISTINCT FROM v_before.status AND v_new_status NOT IN ('pending', 'ordered', 'cancelled') → recusa.
-- Uso normal: nada. O ecrã só oferece pendente e cancelada; 'encomendada' e 'recebida' aparecem só quando já são o estado
--   atual (PurchaseOrders.tsx, seletor de estado). A rede de segurança na tabela é o CHECK de 20270114980000.
-- Fica de fora (registado, não desta leva): validar a organização do fornecedor e dos produtos; a guarda de
--   source_type/source_id; a permissão de rpc_cancel_po_remainder.
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
  v_oid oid := to_regprocedure('public.rpc_update_purchase_order(uuid,jsonb,jsonb)');
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION '20270114950000: a função public.rpc_update_purchase_order(uuid,jsonb,jsonb) não existe';
  END IF;
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM '4cb7981509ec3044022a330a28451544' THEN
    RAISE EXCEPTION '20270114950000: a definição viva de rpc_update_purchase_order mudou desde que foi lida (md5 %); reler antes de aplicar',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114950000: o ACL de rpc_update_purchase_order mudou desde que foi lido';
  END IF;
END $pre$;

-- ─── A função (texto vivo + a alteração descrita no cabeçalho) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_update_purchase_order(p_purchase_order_id uuid, p_order jsonb, p_items jsonb)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    'supplier_id','order_date','expected_delivery','status','total_value','notes',
    'supplier_notes'  -- F3.2 (20261211130000)
  ];
  -- F3.2 (20261211130000)
  v_pub        public.supplier_po_publications;
  v_published  boolean := false;
  v_opt_keys   text[];
  v_drop_keys  text[];
  v_sent_sig   text[];
  v_cur_sig    text[];
  v_pub_msg    text;
  -- 20270112852000: sem products.view_cost, os preços vêm da base (fn_po_linhas_precos_guardados).
  v_items          jsonb := p_items;
  v_ver_custo      boolean := true;
  v_total_sem_custo numeric;
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
  -- F3.2 (20261211130000): FOR UPDATE — serializa com rpc_po_send_to_supplier.
  SELECT * INTO v_before FROM public.purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Predicate (1): the existing row's org must be in the caller's visible-org scope.
  IF NOT public.fn_deal_org_in_scope(v_before.organization_id)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.edit', v_before.organization_id) THEN
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
  -- 20270114950000: ao editar só se escolhe pendente, encomendada (com aprovar, abaixo) ou cancelada; o estado atual pode
  -- ficar como está. 'received' / 'partially_received' só nascem de uma receção.
  IF v_new_status IS DISTINCT FROM v_before.status AND v_new_status NOT IN ('pending', 'ordered', 'cancelled') THEN
    RAISE EXCEPTION 'O estado % não se escolhe ao editar: use pendente ou cancelada; «Aprovar e enviar» encomenda e a Receção regista a mercadoria.', v_new_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_new_status = 'ordered' AND v_before.status IS DISTINCT FROM 'ordered' THEN
    IF NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.approve', v_before.organization_id) THEN
      RAISE EXCEPTION 'Sem permissão para aprovar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── F3.2 (20261211130000): encomenda publicada no portal do fornecedor ───
  -- 20270112852000: quem não tem products.view_cost não vê (nem envia) preços: as linhas existentes mantêm o preço da
  -- base e as novas levam o do fornecedor; o total é o da base se as linhas não mudaram, senão a soma.
  v_ver_custo := v_before.organization_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'products.view_cost'));
  IF NOT v_ver_custo THEN
    v_items := public.fn_po_linhas_precos_guardados(p_purchase_order_id, v_before.organization_id,
                 nullif(p_order ->> 'supplier_id', '')::uuid, p_items);
    IF jsonb_typeof(v_items) = 'array' THEN
      IF (SELECT array_agg(z.s ORDER BY z.s) FROM (
            SELECT (x ->> 'id') || ':' || trim_scale((x ->> 'quantity')::numeric) || ':' || trim_scale((x ->> 'vat_rate')::numeric) AS s
            FROM jsonb_array_elements(v_items) x) z)
         IS NOT DISTINCT FROM
         (SELECT array_agg(z.s ORDER BY z.s) FROM (
            SELECT i.id::text || ':' || trim_scale(i.quantity) || ':' || trim_scale(i.vat_rate) AS s
            FROM public.purchase_order_items i WHERE i.purchase_order_id = p_purchase_order_id) z) THEN
        v_total_sem_custo := v_before.total_value;
      ELSE
        SELECT COALESCE(sum((x ->> 'total_price')::numeric), 0) INTO v_total_sem_custo FROM jsonb_array_elements(v_items) x;
      END IF;
    ELSE
      v_total_sem_custo := 0;
    END IF;
  END IF;

  SELECT * INTO v_pub FROM public.supplier_po_publications
  WHERE purchase_order_id = p_purchase_order_id AND status <> 'withdrawn';
  v_published := FOUND;
  IF v_published THEN
    v_pub_msg := CASE WHEN v_pub.status = 'confirmed'
      THEN 'O fornecedor já confirmou esta encomenda no portal: as linhas, o fornecedor, a data da encomenda e o estado já não podem ser alterados (pode mudar as notas e a entrega prevista; para reduzir quantidades use "Anular resto").'
      ELSE 'Esta encomenda está no portal do fornecedor: para alterar linhas, fornecedor, data da encomenda ou estado, retire-a primeiro do portal (pode mudar as notas e a entrega prevista).' END;

    IF nullif(p_order ->> 'supplier_id', '')::uuid IS DISTINCT FROM v_before.supplier_id
       OR (p_order ->> 'order_date')::date IS DISTINCT FROM v_before.order_date
       OR v_new_status IS DISTINCT FROM v_before.status THEN
      RAISE EXCEPTION '%', v_pub_msg USING ERRCODE = 'check_violation', HINT = 'po_published';
    END IF;

    IF v_items IS NOT NULL THEN
      IF jsonb_typeof(v_items) <> 'array' THEN
        RAISE EXCEPTION '%', v_pub_msg USING ERRCODE = 'check_violation', HINT = 'po_published';
      END IF;
      -- Chaves opcionais que não vêm em nenhuma linha enviada ficam de fora.
      v_opt_keys := ARRAY['sku', 'uom_id', 'supplier_sku', 'notes', 'selected_attributes', 'description', 'vat_rate'];
      SELECT COALESCE(array_agg(k), ARRAY[]::text[]) INTO v_drop_keys
      FROM unnest(v_opt_keys) k
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) e WHERE jsonb_typeof(e) = 'object' AND e ? k);

      SELECT COALESCE(array_agg(s ORDER BY s), ARRAY[]::text[]) INTO v_sent_sig
      FROM (
        SELECT (jsonb_build_object(
                  'item_type', e ->> 'item_type',
                  'product_id', nullif(e ->> 'product_id', '')::uuid,
                  'service_id', nullif(e ->> 'service_id', '')::uuid,
                  'description', e ->> 'description',
                  'sku', nullif(e ->> 'sku', ''),
                  'quantity', trim_scale((e ->> 'quantity')::numeric),
                  'unit_price', trim_scale((e ->> 'unit_price')::numeric),
                  'vat_rate', trim_scale((e ->> 'vat_rate')::numeric),
                  'uom_id', nullif(e ->> 'uom_id', '')::uuid,
                  'supplier_sku', nullif(btrim(e ->> 'supplier_sku'), ''),
                  'notes', nullif(e ->> 'notes', ''),
                  'selected_attributes', COALESCE(nullif(nullif(e -> 'selected_attributes', 'null'::jsonb), '{}'::jsonb), '{}'::jsonb)
                ) - v_drop_keys)::text AS s
        FROM jsonb_array_elements(v_items) e
      ) z;

      SELECT COALESCE(array_agg(s ORDER BY s), ARRAY[]::text[]) INTO v_cur_sig
      FROM (
        SELECT (jsonb_build_object(
                  'item_type', i.item_type,
                  'product_id', i.product_id,
                  'service_id', i.service_id,
                  'description', i.description,
                  'sku', nullif(i.sku, ''),
                  'quantity', trim_scale(i.quantity),
                  'unit_price', trim_scale(i.unit_price),
                  'vat_rate', trim_scale(i.vat_rate),
                  'uom_id', i.uom_id,
                  'supplier_sku', nullif(btrim(i.supplier_sku), ''),
                  'notes', nullif(i.notes, ''),
                  'selected_attributes', COALESCE(nullif(nullif(i.selected_attributes, 'null'::jsonb), '{}'::jsonb), '{}'::jsonb)
                ) - v_drop_keys)::text AS s
        FROM public.purchase_order_items i
        WHERE i.purchase_order_id = p_purchase_order_id
      ) z;

      IF v_sent_sig IS DISTINCT FROM v_cur_sig THEN
        RAISE EXCEPTION '%', v_pub_msg USING ERRCODE = 'check_violation', HINT = 'po_published';
      END IF;
    END IF;
  END IF;

  -- ── UPDATE the order (identical column set to the FE update) ──────────────
  UPDATE public.purchase_orders
  SET supplier_id       = nullif(p_order ->> 'supplier_id', '')::uuid,
      order_date        = (p_order ->> 'order_date')::date,
      expected_delivery = nullif(p_order ->> 'expected_delivery', '')::date,
      status            = v_new_status,
      -- F3.2: publicada → as linhas não mudam, o total também não.
      total_value       = CASE WHEN v_published THEN total_value
                               ELSE CASE WHEN v_ver_custo THEN COALESCE((p_order ->> 'total_value')::numeric, 0) ELSE v_total_sem_custo END END,
      notes             = nullif(p_order ->> 'notes', ''),
      -- F3.2 (20261211130000): só muda se a chave vier no pedido.
      supplier_notes    = CASE WHEN p_order ? 'supplier_notes'
                               THEN nullif(p_order ->> 'supplier_notes', '')
                               ELSE supplier_notes END
  WHERE id = p_purchase_order_id
  RETURNING * INTO v_order;

  -- ── Rewrite items: delete-all then re-insert (matches the FE) ─────────────
  -- F3.2 (20261211130000): não com publicação ativa (linhas já verificadas
  -- iguais acima; os ids mantêm-se).
  IF NOT v_published THEN
  DELETE FROM public.purchase_order_items WHERE purchase_order_id = p_purchase_order_id;

  IF v_items IS NOT NULL AND jsonb_typeof(v_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, service_id, description, sku,
        quantity, unit_price, vat_rate, vat_amount, total_price,
        selected_attributes, notes,
        uom_id, supplier_sku  -- NOVO (20261204204500); units_per_uom pelo gatilho
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
        nullif(v_item ->> 'notes', ''),
        nullif(v_item ->> 'uom_id', '')::uuid,
        -- Snapshot da referência do fornecedor: a enviada, senão a da ligação
        -- item_suppliers deste fornecedor na mesma unidade.
        COALESCE(
          nullif(btrim(v_item ->> 'supplier_sku'), ''),
          (SELECT isup.supplier_sku
             FROM public.item_suppliers isup
            WHERE isup.product_id = nullif(v_item ->> 'product_id', '')::uuid
              AND isup.supplier_id = v_order.supplier_id
              AND isup.uom_id IS NOT DISTINCT FROM nullif(v_item ->> 'uom_id', '')::uuid
              AND isup.deleted_at IS NULL
            LIMIT 1)
        )
      );
    END LOOP;
  END IF;
  END IF;  -- F3.2: NOT v_published

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
           'purchase_order_items', jsonb_build_object('new', COALESCE(v_items, '[]'::jsonb))
         );

    PERFORM public.fn_manual_audit_log(
      'purchase_orders', p_purchase_order_id, v_order.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  -- 20270112852000: o valor só a quem tem products.view_cost.
  IF NOT v_ver_custo THEN
    v_order.total_value := NULL;
  END IF;
  RETURN v_order;
END;
$function$;

-- ─── Conferir: corpo novo (md5 com os CR deste ficheiro), DEFINER/INVOKER, search_path e ACL mantidos ───────────────────
DO $chk$
DECLARE
  v_oid oid := to_regprocedure('public.rpc_update_purchase_order(uuid,jsonb,jsonb)');
BEGIN
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM 'f3ca5bea4835c164b5eb7e2e9bcacce9' THEN
    RAISE EXCEPTION '20270114950000: a definição nova de rpc_update_purchase_order não é a esperada (md5 %); o ficheiro tem de estar em CRLF',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM true
     OR (SELECT array_to_string(p.proconfig, ',')::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM 'search_path=public, pg_temp'
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114950000: rpc_update_purchase_order perdeu o SECURITY, o search_path ou o ACL';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
