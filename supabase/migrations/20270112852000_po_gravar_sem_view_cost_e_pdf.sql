-- ============================================================
-- 20270112852000 — Encomendas a fornecedor: gravar sem products.view_cost + dados do PDF
-- ============================================================
-- Contexto: 20270112850000 (vistas po_v_*) e 20270112851000 (REVOKE das colunas de valor) fecham os valores das
--   encomendas a quem não tem products.view_cost. O formulário passa a ler as vistas, por isso quem não tem a permissão
--   recebe unit_price / vat_amount / total_price / total_value a NULL — e o formulário reenviava esses preços às RPCs
--   (substituição total das linhas). Sem esta migração, gravar dá 23502 (unit_price NOT NULL).
--
-- O quê (só para quem NÃO tem products.view_cost na organização da encomenda; com ela, tudo igual ao atual):
--   · rpc_update_purchase_order: o formulário envia o id de cada linha existente. Linhas existentes mantêm o preço da
--     base (unit_price); vat_amount/total_price ficam os da base se a quantidade e o IVA não mudaram, senão recalculam-se
--     com o preço guardado (a mesma conta do formulário). Linhas novas levam o preço de compra do fornecedor da encomenda
--     (fn_po_preco_fornecedor, a regra que o formulário já usa: preço da ligação item_suppliers ativa do fornecedor; se
--     estiver vazio, o preço de compra do catálogo; IVA do catálogo, 23 por omissão); sem preço → erro claro.
--     Os preços enviados são ignorados. total_value: o da base se as linhas não mudaram, senão a soma dos total_price.
--     A comparação de linhas das encomendas publicadas no portal (po_published) usa as linhas já com o preço da base,
--     por isso gravar notas/entrega prevista numa encomenda publicada continua a funcionar.
--     O valor devolvido (RETURNS purchase_orders) leva total_value a NULL (o ecrã não o usa).
--   · rpc_create_purchase_order: as linhas levam o preço do fornecedor (mesma regra), total_value = soma; idem RETURN.
--   · rpc_po_documento_fornecedor(p_po_id): a encomenda e as linhas para o PDF ao fornecedor, a quem pode ver a
--     encomenda (organização visível + purchase_orders.view — o botão PDF não pede mais nada no ecrã). Os valores
--     (total_value; unit_price/vat_amount/total_price) só com products.view_cost na organização; sem ela vêm a NULL e
--     com_precos = false — o PDF sai com artigos e quantidades, sem valores (decisão do utilizador, 10/11/2026).
-- As alterações às duas RPCs vivas são substituições exatas (cada âncora tem de aparecer exatamente 1 vez) sobre a
--   definição viva, com guarda md5. Nada mais muda nelas.
--
-- Guarda (10/11/2026): md5(pg_get_functiondef(rpc_update_purchase_order)) = 958c07db4acd24ceac6a4c3000ecdbee;
--   md5(pg_get_functiondef(rpc_create_purchase_order)) = 36021e65c1a9d8297b2bbbedf287b006.
-- Reversão: recriar as duas RPCs a partir das definições com aqueles md5 (ver 20261211130000 e seguintes);
--   DROP FUNCTION rpc_po_documento_fornecedor(uuid), fn_po_linhas_precos_guardados(uuid,uuid,uuid,jsonb),
--   fn_po_preco_fornecedor(uuid,uuid,text,uuid,uuid,uuid).
-- ============================================================
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF md5(pg_get_functiondef('public.rpc_update_purchase_order(uuid,jsonb,jsonb)'::regprocedure)) <> '958c07db4acd24ceac6a4c3000ecdbee' THEN
    RAISE EXCEPTION 'Guarda: rpc_update_purchase_order mudou desde 10/11/2026. Rever esta migration.';
  END IF;
  IF md5(pg_get_functiondef('public.rpc_create_purchase_order(uuid,jsonb,jsonb)'::regprocedure)) <> '36021e65c1a9d8297b2bbbedf287b006' THEN
    RAISE EXCEPTION 'Guarda: rpc_create_purchase_order mudou desde 10/11/2026. Rever esta migration.';
  END IF;
  IF to_regprocedure('public.fn_po_preco_fornecedor(uuid,uuid,text,uuid,uuid,uuid)') IS NOT NULL
     OR to_regprocedure('public.fn_po_linhas_precos_guardados(uuid,uuid,uuid,jsonb)') IS NOT NULL
     OR to_regprocedure('public.rpc_po_documento_fornecedor(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: já existe uma das funções novas. Rever esta migration.';
  END IF;
END $guarda$;

-- ------------------------------------------------------------
-- Preço de compra do fornecedor para um artigo (a regra do formulário, PurchaseOrders.tsx availableProductsForSupplier):
-- só se o fornecedor tem a ligação ativa ao artigo; preço da ligação, senão o preço de compra do catálogo; 0 = sem preço.
-- Interna: só as RPCs SECURITY DEFINER a usam.
-- ------------------------------------------------------------
CREATE FUNCTION public.fn_po_preco_fornecedor(p_org uuid, p_supplier uuid, p_item_type text, p_product uuid, p_service uuid, p_uom uuid)
RETURNS TABLE (unit_price numeric, vat_rate numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH ligacao AS (
    SELECT isup.purchase_price
    FROM public.item_suppliers isup
    WHERE isup.organization_id = p_org AND isup.supplier_id = p_supplier
      AND isup.is_active AND isup.deleted_at IS NULL
      AND ((p_item_type = 'product' AND isup.product_id = p_product) OR (p_item_type = 'service' AND isup.service_id = p_service))
    ORDER BY (isup.uom_id IS NOT DISTINCT FROM p_uom) DESC, isup.is_preferred DESC NULLS LAST, isup.updated_at DESC NULLS LAST
    LIMIT 1
  ), catalogo AS (
    SELECT x.price, x.vat_rate FROM (
      SELECT pp.price, pp.vat_rate, pp.valid_from, pp.updated_at
      FROM public.product_prices pp
      WHERE p_item_type = 'product' AND pp.product_id = p_product AND pp.price_type = 'purchase'
      UNION ALL
      SELECT sp.price, sp.vat_rate, sp.valid_from, sp.updated_at
      FROM public.service_prices sp
      WHERE p_item_type = 'service' AND sp.service_id = p_service AND sp.price_type = 'purchase'
    ) x
    ORDER BY x.valid_from DESC NULLS LAST, x.updated_at DESC NULLS LAST
    LIMIT 1
  )
  SELECT nullif(CASE WHEN l.purchase_price IS NOT NULL THEN l.purchase_price ELSE (SELECT c.price FROM catalogo c) END, 0),
         COALESCE(nullif((SELECT c.vat_rate FROM catalogo c), 0), 23)
  FROM ligacao l
$$;

-- ------------------------------------------------------------
-- As linhas enviadas pelo formulário com os preços que quem grava não vê: as existentes (id desta encomenda) com o
-- preço guardado, as novas com o preço do fornecedor. Interna: só as RPCs SECURITY DEFINER a usam.
-- ------------------------------------------------------------
CREATE FUNCTION public.fn_po_linhas_precos_guardados(p_po_id uuid, p_org uuid, p_supplier uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_out   jsonb := '[]'::jsonb;
  e       jsonb;
  o       public.purchase_order_items;
  v_found boolean;
  v_q     numeric;
  v_rate  numeric;
  v_unit  numeric;
  v_sub   numeric;
  v_vat   numeric;
  v_tot   numeric;
  r       record;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN p_items;
  END IF;

  FOR e IN SELECT t.x FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(x, n) ORDER BY t.n
  LOOP
    IF jsonb_typeof(e) <> 'object' THEN
      v_out := v_out || jsonb_build_array(e);
      CONTINUE;
    END IF;

    v_found := false;
    IF p_po_id IS NOT NULL AND nullif(e ->> 'id', '') IS NOT NULL THEN
      SELECT * INTO o FROM public.purchase_order_items i
      WHERE i.id = (e ->> 'id')::uuid AND i.purchase_order_id = p_po_id;
      v_found := FOUND;
    END IF;

    v_q := (e ->> 'quantity')::numeric;
    IF v_found THEN
      v_unit := o.unit_price;
      v_rate := COALESCE((e ->> 'vat_rate')::numeric, o.vat_rate);
      IF v_q IS NOT DISTINCT FROM o.quantity AND v_rate IS NOT DISTINCT FROM o.vat_rate THEN
        v_vat := o.vat_amount;
        v_tot := o.total_price;
      ELSE
        v_sub := v_unit * COALESCE(v_q, 0);
        v_vat := v_sub * COALESCE(v_rate, 0) / 100;
        v_tot := v_sub + v_vat;
      END IF;
    ELSE
      SELECT * INTO r FROM public.fn_po_preco_fornecedor(p_org, p_supplier, e ->> 'item_type',
        nullif(e ->> 'product_id', '')::uuid, nullif(e ->> 'service_id', '')::uuid, nullif(e ->> 'uom_id', '')::uuid);
      IF r.unit_price IS NULL THEN
        RAISE EXCEPTION 'Sem preço de compra deste fornecedor para «%». Peça a quem vê os custos para o definir na ficha do artigo.',
          COALESCE(nullif(e ->> 'description', ''), 'linha')
          USING ERRCODE = 'check_violation', HINT = 'po_sem_preco_fornecedor';
      END IF;
      v_unit := r.unit_price;
      v_rate := COALESCE((e ->> 'vat_rate')::numeric, r.vat_rate);
      v_sub  := v_unit * COALESCE(v_q, 0);
      v_vat  := v_sub * v_rate / 100;
      v_tot  := v_sub + v_vat;
    END IF;

    v_out := v_out || jsonb_build_array(e || jsonb_build_object(
      'unit_price', v_unit, 'vat_rate', v_rate, 'vat_amount', v_vat, 'total_price', v_tot));
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_po_preco_fornecedor(uuid,uuid,text,uuid,uuid,uuid),
  public.fn_po_linhas_precos_guardados(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_po_preco_fornecedor(uuid,uuid,text,uuid,uuid,uuid),
  public.fn_po_linhas_precos_guardados(uuid,uuid,uuid,jsonb) TO service_role;

-- ------------------------------------------------------------
-- rpc_update_purchase_order: substituições exatas na definição viva.
-- ------------------------------------------------------------
DO $update$
DECLARE
  v_def  text := pg_get_functiondef('public.rpc_update_purchase_order(uuid,jsonb,jsonb)'::regprocedure);
  v_pos  int;
  v_head text;
  v_body text;
  v_a    text[];
  v_b    text[];
  i      int;
BEGIN
  v_pos := strpos(v_def, E'\nBEGIN\n');
  v_head := left(v_def, v_pos - 1);
  v_body := substr(v_def, v_pos);
  IF (length(v_body) - length(replace(v_body, 'p_items', ''))) / 7 <> 8 THEN
    RAISE EXCEPTION 'Guarda: rpc_update_purchase_order não tem 8 p_items no corpo.';
  END IF;
  -- A partir daqui o corpo trabalha com v_items (= p_items com quem vê os custos).
  v_body := replace(v_body, 'p_items', 'v_items');

  v_a := ARRAY[
    'v_pub_msg    text;',
    '  SELECT * INTO v_pub FROM public.supplier_po_publications',
    $t$ELSE COALESCE((p_order ->> 'total_value')::numeric, 0) END,$t$,
    E'  RETURN v_order;\nEND;'
  ];
  v_b := ARRAY[
    $t$v_pub_msg    text;
  -- 20270112852000: sem products.view_cost, os preços vêm da base (fn_po_linhas_precos_guardados).
  v_items          jsonb := p_items;
  v_ver_custo      boolean := true;
  v_total_sem_custo numeric;$t$,
    $t$  -- 20270112852000: quem não tem products.view_cost não vê (nem envia) preços: as linhas existentes mantêm o preço da
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

  SELECT * INTO v_pub FROM public.supplier_po_publications$t$,
    $t$ELSE CASE WHEN v_ver_custo THEN COALESCE((p_order ->> 'total_value')::numeric, 0) ELSE v_total_sem_custo END END,$t$,
    $t$  -- 20270112852000: o valor só a quem tem products.view_cost.
  IF NOT v_ver_custo THEN
    v_order.total_value := NULL;
  END IF;
  RETURN v_order;
END;$t$
  ];

  FOR i IN 1 .. array_length(v_a, 1) LOOP
    IF (length(v_head || v_body) - length(replace(v_head || v_body, v_a[i], ''))) / length(v_a[i]) <> 1 THEN
      RAISE EXCEPTION 'Guarda: a âncora % de rpc_update_purchase_order não aparece exatamente uma vez.', i;
    END IF;
    v_head := replace(v_head, v_a[i], v_b[i]);
    v_body := replace(v_body, v_a[i], v_b[i]);
  END LOOP;

  EXECUTE v_head || v_body;
END $update$;

-- ------------------------------------------------------------
-- rpc_create_purchase_order: substituições exatas na definição viva.
-- ------------------------------------------------------------
DO $create$
DECLARE
  v_def  text := pg_get_functiondef('public.rpc_create_purchase_order(uuid,jsonb,jsonb)'::regprocedure);
  v_pos  int;
  v_head text;
  v_body text;
  v_a    text[];
  v_b    text[];
  i      int;
BEGIN
  v_pos := strpos(v_def, E'\nBEGIN\n');
  v_head := left(v_def, v_pos - 1);
  v_body := substr(v_def, v_pos);
  IF (length(v_body) - length(replace(v_body, 'p_items', ''))) / 7 <> 4 THEN
    RAISE EXCEPTION 'Guarda: rpc_create_purchase_order não tem 4 p_items no corpo.';
  END IF;
  v_body := replace(v_body, 'p_items', 'v_items');

  v_a := ARRAY[
    'v_source_id   uuid;',
    E'  INSERT INTO public.purchase_orders (\n',
    $t$    COALESCE((p_order ->> 'total_value')::numeric, 0),$t$,
    E'  RETURN v_order;\nEND;'
  ];
  v_b := ARRAY[
    $t$v_source_id   uuid;
  -- 20270112852000: sem products.view_cost, os preços vêm do fornecedor (fn_po_linhas_precos_guardados).
  v_items       jsonb := p_items;
  v_ver_custo   boolean := true;$t$,
    $t$  -- 20270112852000: quem não tem products.view_cost não vê (nem envia) preços: as linhas levam o preço do fornecedor.
  v_ver_custo := p_organization_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'products.view_cost'));
  IF NOT v_ver_custo THEN
    v_items := public.fn_po_linhas_precos_guardados(NULL, p_organization_id, nullif(p_order ->> 'supplier_id', '')::uuid, p_items);
  END IF;

  INSERT INTO public.purchase_orders (
$t$,
    $t$    CASE WHEN v_ver_custo THEN COALESCE((p_order ->> 'total_value')::numeric, 0)
         ELSE (SELECT COALESCE(sum((x ->> 'total_price')::numeric), 0)
                 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_items) = 'array' THEN v_items ELSE '[]'::jsonb END) x) END,$t$,
    $t$  -- 20270112852000: o valor só a quem tem products.view_cost.
  IF NOT v_ver_custo THEN
    v_order.total_value := NULL;
  END IF;
  RETURN v_order;
END;$t$
  ];

  FOR i IN 1 .. array_length(v_a, 1) LOOP
    IF (length(v_head || v_body) - length(replace(v_head || v_body, v_a[i], ''))) / length(v_a[i]) <> 1 THEN
      RAISE EXCEPTION 'Guarda: a âncora % de rpc_create_purchase_order não aparece exatamente uma vez.', i;
    END IF;
    v_head := replace(v_head, v_a[i], v_b[i]);
    v_body := replace(v_body, v_a[i], v_b[i]);
  END LOOP;

  EXECUTE v_head || v_body;
END $create$;

-- ------------------------------------------------------------
-- PDF ao fornecedor: encomenda + linhas com preços a quem pode ver a encomenda.
-- ------------------------------------------------------------
CREATE FUNCTION public.rpc_po_documento_fornecedor(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_po    public.purchase_orders;
  v_custo boolean;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND
     OR v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR v_po.organization_id NOT IN (SELECT public.get_user_permission_org_ids(v_uid, 'purchase_orders.view')) THEN
    RAISE EXCEPTION 'Encomenda não encontrada ou sem permissão para a ver.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_custo := v_po.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.view_cost'));

  RETURN jsonb_build_object(
    'com_precos', v_custo,
    'order', CASE WHEN v_custo THEN to_jsonb(v_po) ELSE to_jsonb(v_po) || jsonb_build_object('total_value', NULL) END,
    'items', COALESCE((SELECT jsonb_agg(CASE WHEN v_custo THEN to_jsonb(i)
                                             ELSE to_jsonb(i) || jsonb_build_object('unit_price', NULL, 'vat_amount', NULL, 'total_price', NULL) END
                                        ORDER BY i.created_at, i.id)
                        FROM public.purchase_order_items i WHERE i.purchase_order_id = p_po_id), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_po_documento_fornecedor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_po_documento_fornecedor(uuid) TO authenticated, service_role;

DO $verificar$
BEGIN
  IF pg_get_functiondef('public.rpc_update_purchase_order(uuid,jsonb,jsonb)'::regprocedure) NOT LIKE '%fn_po_linhas_precos_guardados(p_purchase_order_id%'
     OR pg_get_functiondef('public.rpc_update_purchase_order(uuid,jsonb,jsonb)'::regprocedure) NOT LIKE '%FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)%'
     OR pg_get_functiondef('public.rpc_create_purchase_order(uuid,jsonb,jsonb)'::regprocedure) NOT LIKE '%fn_po_linhas_precos_guardados(NULL, p_organization_id%'
     OR pg_get_functiondef('public.rpc_create_purchase_order(uuid,jsonb,jsonb)'::regprocedure) NOT LIKE '%FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)%' THEN
    RAISE EXCEPTION 'Verificação: as RPCs não ficaram com as alterações.';
  END IF;
  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.rpc_update_purchase_order(uuid,jsonb,jsonb)'::regprocedure)
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.rpc_create_purchase_order(uuid,jsonb,jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'Verificação: as RPCs deixaram de ser SECURITY DEFINER.';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_po_linhas_precos_guardados(uuid,uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_po_preco_fornecedor(uuid,uuid,text,uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Verificação: as funções internas ficaram executáveis por authenticated.';
  END IF;
END $verificar$;

NOTIFY pgrst, 'reload schema';
