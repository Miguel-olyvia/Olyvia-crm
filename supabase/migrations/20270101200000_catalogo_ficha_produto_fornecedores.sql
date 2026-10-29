-- RASCUNHO (não aplicado). Catálogo: ficha do produto com os fornecedores ligados, fornecedor preferido atómico, custo do produto com histórico
-- e data do preço do fornecedor. Base RH (uetjghdkwbywbftedtth). Sem tabelas nem colunas novas: só funções e permissões.
--
-- 1. NOVA cat_produto_fornecedores(p_product_id) → jsonb: as ligações item_suppliers do produto (não apagadas, ativas e inativas), com o artigo
--    do catálogo do portal quando ligado. Preferido primeiro, depois o nome do fornecedor. Acesso como cat_ler_catalogo (services.view na
--    organização do produto, ou system admin); os preços (purchase_price, catalogo.base_price) só com products.view_cost ou
--    suppliers.view_pricing nessa organização (como a RLS de item_suppliers e rpc_supplier_catalog_list), senão vêm null.
-- 2. NOVA cat_definir_fornecedor_preferido(p_item_supplier_id) → jsonb: numa só transação desmarca os outros preferidos do produto, marca este
--    (os gatilhos sincronizam products.supplier_id) e aplica o preço da ligação ao custo do produto por fn_apply_product_cost_from_supplier
--    (mesmas regras de fn_price_change_cost_plan). products.edit na organização da ligação e do produto; com preço na ligação exige também
--    products.manage_prices (como rpc_catalog_link quando usa o preço do catálogo).
-- 3. fn_apply_product_cost_from_supplier (sobre a versão viva): em vez de reescrever TODAS as linhas purchase da moeda, muda só a linha
--    ATUAL dessa moeda (valid_from DESC NULLS LAST, created_at DESC, id) com price (2 casas) e preco_exato (custo por unidade a 6 casas);
--    as outras linhas ficam intactas e o número de linhas não cresce (decisão do utilizador, opção A: sem histórico de custo por agora,
--    porque ~10 leitores assumem uma só linha purchase). Sem linhas: o INSERT de sempre (agora também com preco_exato). Custo igual: nada.
--    Assinatura, retorno, SECURITY DEFINER, search_path e permissões iguais.
-- 4. rpc_catalog_link e rpc_price_changes_decide (sobre as versões vivas): item_suppliers.preco_data = hoje onde gravam o preço
--    (ligar com o preço do catálogo; aceitar um pedido de preço, mesmo sem mudança de valor — o fornecedor confirmou o preço).
--    Tudo o resto igual.
-- Guarda: só substitui se as 3 funções na base forem exatamente as medidas a 29/10/2026 na base RH (md5 de pg_get_functiondef).

SET lock_timeout = '5s';

DO $guarda$
DECLARE v_h text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'item_suppliers' AND column_name = 'preco_data')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_prices' AND column_name = 'preco_exato') THEN
    RAISE EXCEPTION 'Guarda: faltam as colunas item_suppliers.preco_data ou product_prices.preco_exato.';
  END IF;
  IF to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta fn_cat_exigir.';
  END IF;
  SELECT md5(pg_get_functiondef('public.fn_apply_product_cost_from_supplier(uuid,uuid,numeric,text,uuid)'::regprocedure)) INTO v_h;
  IF v_h <> 'e6621e15056e7e365d430ccfd4309407' THEN
    RAISE EXCEPTION 'Guarda: fn_apply_product_cost_from_supplier no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  SELECT md5(pg_get_functiondef('public.rpc_catalog_link(uuid,uuid,uuid,uuid,boolean)'::regprocedure)) INTO v_h;
  IF v_h <> '705eb7080bcb5c1841428a40dbfbd83b' THEN
    RAISE EXCEPTION 'Guarda: rpc_catalog_link no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  SELECT md5(pg_get_functiondef('public.rpc_price_changes_decide(uuid[],boolean,text,boolean)'::regprocedure)) INTO v_h;
  IF v_h <> 'ea93772e3fa9aeb98f489a12a98f9648' THEN
    RAISE EXCEPTION 'Guarda: rpc_price_changes_decide no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
END $guarda$;

-- ─── 3. fn_apply_product_cost_from_supplier: só a linha atual, com preco_exato ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_apply_product_cost_from_supplier(p_item_supplier_id uuid, p_organization_id uuid, p_new_price numeric, p_currency text, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_plan    jsonb := public.fn_price_change_cost_plan(p_item_supplier_id, p_organization_id, p_new_price, p_currency);
  v_product uuid;
  v_unit    numeric;
  v_rows    integer := 0;
  v_upd     boolean := false;
  v_exato   numeric;   -- custo por unidade sem o arredondamento a 2 casas (product_prices.preco_exato)
  v_atual   numeric;   -- custo da linha atual
  v_linha   uuid;      -- a linha purchase atual do produto nesta moeda (só esta muda)
BEGIN
  IF (v_plan ->> 'will_update')::boolean THEN
    SELECT product_id INTO v_product FROM public.item_suppliers WHERE id = p_item_supplier_id;
    v_unit := (v_plan ->> 'new_unit_cost')::numeric;
    -- 20270101200000: só a linha purchase ATUAL desta moeda (a mais recente) recebe o custo, com preco_exato;
    -- as outras linhas (antigas) ficam como estão. Sem mudança de custo não se escreve nada.
    -- O plano só autoriza com units_per_purchase_uom > 0 e preço não nulo.
    v_exato := round(p_new_price / (v_plan ->> 'units_per_purchase_uom')::numeric, 6);
    SELECT pp.id, COALESCE(pp.preco_exato, pp.price) INTO v_linha, v_atual
    FROM public.product_prices pp
    WHERE pp.product_id = v_product AND pp.price_type = 'purchase' AND pp.currency::text = p_currency
    ORDER BY pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id
    LIMIT 1;
    IF v_linha IS NOT NULL AND v_atual IS DISTINCT FROM v_exato THEN
      UPDATE public.product_prices
         SET price = v_unit, preco_exato = v_exato, created_by = p_actor
       WHERE id = v_linha;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.product_prices
                   WHERE product_id = v_product AND price_type = 'purchase') THEN
      INSERT INTO public.product_prices (product_id, price_type, price, preco_exato, currency, vat_rate, created_by)
      VALUES (v_product, 'purchase', v_unit, v_exato, p_currency::public.currency_code,
              COALESCE((SELECT pp.vat_rate FROM public.product_prices pp
                        WHERE pp.product_id = v_product AND pp.vat_rate IS NOT NULL
                        ORDER BY pp.updated_at DESC LIMIT 1), 23),
              p_actor);
      v_rows := 1;
    END IF;
    v_upd := true;
  END IF;

  RETURN jsonb_build_object(
    'product_cost_updated', v_upd,
    'product_cost_rows', v_rows,
    'product_cost_reason', v_plan ->> 'reason',
    'product_cost_message', v_plan ->> 'message',
    'new_unit_cost', CASE WHEN v_upd THEN v_unit END,
    'units_per_purchase_uom', (v_plan ->> 'units_per_purchase_uom')::integer);
END;
$function$;

-- ─── 4a. rpc_catalog_link: preco_data = hoje quando grava o preço do catálogo (resto igual à versão viva) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_catalog_link(p_supplier_id uuid, p_catalog_item_id uuid, p_product_id uuid, p_uom_id uuid DEFAULT NULL::uuid, p_apply_catalog_price boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org      uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_actor    uuid := public.current_business_user_id();
  l          public.supplier_account_links;
  ci         public.supplier_catalog_items;
  p          record;
  isup       public.item_suppliers;
  v_other    record;
  v_created  boolean := false;
  v_warn     jsonb := '[]'::jsonb;
  v_codes    jsonb := '[]'::jsonb;
  v_price    boolean := COALESCE(p_apply_catalog_price, true);
  v_pref     boolean;
  v_code_id  uuid;
  v_old_price numeric;
  v_old_ccy  text;
  v_price_upd boolean := false;
  v_cost     jsonb;
  v_link_factor integer;   -- fn_uom_units_per(p_uom_id, produto)
  v_pack     numeric;      -- units_per_pack do artigo quando a ligação é à unidade
  v_link_price numeric;    -- preço do catálogo a gravar na ligação (÷N nas embalagens)
  v_use_price boolean;     -- usar mesmo o preço (pedido, com preço e conversível)
BEGIN
  IF NOT public.has_anew_permission(auth.uid(), 'products.edit') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT * INTO l FROM public.supplier_account_links WHERE supplier_id = p_supplier_id AND status = 'active';
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não está ligado ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;
  SELECT * INTO ci FROM public.supplier_catalog_items WHERE id = p_catalog_item_id AND supplier_account_id = l.supplier_account_id;
  IF ci.id IS NULL THEN
    RAISE EXCEPTION 'Artigo do catálogo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  SELECT id, name, sku, barcode INTO p FROM public.products
  WHERE id = p_product_id AND organization_id = v_org AND deleted_at IS NULL AND NOT is_deleted
  FOR NO KEY UPDATE;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  -- F3.4b: usar o preço do catálogo muda preços (ligação e custo do produto):
  -- a mesma permissão de aceitar um pedido de alteração de preço.
  IF v_price AND ci.base_price IS NOT NULL
     AND NOT public.has_anew_permission(auth.uid(), 'products.manage_prices') THEN
    RAISE EXCEPTION 'Sem permissão para alterar preços: liga sem usar o preço do catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_price_permission';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('catalog_link:' || p_supplier_id::text, 0));
  PERFORM set_config('app.audit_source', 'supplier_catalog', true);

  -- Artigo em embalagem de N ligado à unidade do produto: o preço do catálogo é
  -- da embalagem; a ligação guarda o preço por unidade (÷ N, como
  -- fn_price_change_cost_plan). N não inteiro → não se grava preço.
  BEGIN
    v_link_factor := public.fn_uom_units_per(p_uom_id, p.id);
  EXCEPTION WHEN OTHERS THEN
    v_link_factor := NULL;
  END;
  v_pack := CASE WHEN v_link_factor = 1 AND ci.units_per_pack > 1 THEN ci.units_per_pack END;
  v_link_price := CASE
                    WHEN ci.base_price IS NULL THEN NULL
                    WHEN v_pack IS NULL THEN ci.base_price
                    WHEN v_pack = trunc(v_pack) AND v_pack <= 2147483647 THEN round(ci.base_price / v_pack, 2)
                    ELSE NULL
                  END;
  v_use_price := v_price AND v_link_price IS NOT NULL;

  -- Este artigo já está ligado?
  SELECT * INTO isup FROM public.item_suppliers
  WHERE supplier_id = p_supplier_id AND catalog_item_id = ci.id AND deleted_at IS NULL;
  IF isup.id IS NOT NULL THEN
    IF isup.product_id = p.id THEN
      RETURN jsonb_build_object('item_supplier_id', isup.id, 'created', false, 'already_linked', true,
                                'codes', '[]'::jsonb, 'warnings', '[]'::jsonb,
                                'item_supplier_price_updated', false, 'product_cost_updated', false,
                                'product_cost_reason', 'already_linked', 'product_cost_message', NULL);
    END IF;
    SELECT name, sku INTO v_other FROM public.products WHERE id = isup.product_id;
    RAISE EXCEPTION 'A referência «%» já está ligada ao produto «%» (%)', ci.supplier_ref, v_other.name, v_other.sku
      USING ERRCODE = 'unique_violation', HINT = 'conflict';
  END IF;

  -- A referência já aponta para outro produto em product_codes?
  SELECT pr.name, pr.sku INTO v_other
  FROM public.product_codes pc JOIN public.products pr ON pr.id = pc.product_id
  WHERE pc.organization_id = v_org AND pc.supplier_id = p_supplier_id AND pc.kind = 'supplier_ref'
    AND pc.deleted_at IS NULL AND pc.code_key = ci.ref_key AND pc.product_id <> p.id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'A referência «%» já está associada ao produto «%» (%) nos códigos do fornecedor', ci.supplier_ref, v_other.name, v_other.sku
      USING ERRCODE = 'unique_violation', HINT = 'conflict';
  END IF;

  -- Linha existente (produto, fornecedor, unidade)?
  SELECT * INTO isup FROM public.item_suppliers
  WHERE product_id = p.id AND supplier_id = p_supplier_id AND deleted_at IS NULL
    AND COALESCE(uom_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_uom_id, '00000000-0000-0000-0000-000000000000'::uuid)
  FOR UPDATE;

  IF isup.id IS NOT NULL THEN
    IF isup.catalog_item_id IS NOT NULL THEN
      SELECT supplier_ref INTO v_other FROM public.supplier_catalog_items WHERE id = isup.catalog_item_id;
      RAISE EXCEPTION 'Este produto já está ligado a outra referência do catálogo («%»)', v_other.supplier_ref
        USING ERRCODE = 'unique_violation', HINT = 'conflict';
    END IF;
    IF isup.supplier_sku IS NOT NULL AND public.fn_product_code_key(isup.supplier_sku) IS DISTINCT FROM ci.ref_key THEN
      v_warn := v_warn || jsonb_build_array(format('Referência do fornecedor alterada de «%s» para «%s»', isup.supplier_sku, ci.supplier_ref));
    END IF;
    v_old_price := isup.purchase_price;
    v_old_ccy := isup.currency;
    UPDATE public.item_suppliers SET
      catalog_item_id = ci.id,
      supplier_sku = ci.supplier_ref,
      purchase_price = CASE WHEN v_use_price THEN v_link_price ELSE purchase_price END,
      currency = CASE WHEN v_use_price THEN ci.currency ELSE currency END,
      preco_data = CASE WHEN v_use_price THEN current_date ELSE preco_data END,
      moq = COALESCE(moq, ci.moq),
      lead_time_days = COALESCE(lead_time_days, ci.lead_time_days),
      updated_at = now()
    WHERE id = isup.id
    RETURNING * INTO isup;
    v_price_upd := v_use_price
                   AND (isup.purchase_price IS DISTINCT FROM v_old_price OR isup.currency IS DISTINCT FROM v_old_ccy);
  ELSE
    v_pref := NOT EXISTS (SELECT 1 FROM public.item_suppliers WHERE product_id = p.id AND deleted_at IS NULL);
    INSERT INTO public.item_suppliers (
      organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price,
      currency, moq, lead_time_days, is_preferred, is_active, created_by, catalog_item_id, preco_data
    ) VALUES (
      v_org, 'product', p.id, p_supplier_id, p_uom_id, ci.supplier_ref,
      CASE WHEN v_use_price THEN v_link_price END, ci.currency, ci.moq, ci.lead_time_days,
      v_pref, true, v_actor, ci.id, CASE WHEN v_use_price THEN current_date END
    ) RETURNING * INTO isup;
    v_created := true;
    v_price_upd := v_use_price;
  END IF;

  -- F3.4b: com o preço do catálogo, o custo do produto segue a mesma regra
  -- de aceitar um preço (ligação preferencial, empresa principal, unidade).
  -- Embalagem: passa-se o preço do catálogo e o plano divide por N (o custo
  -- fica = preço por unidade gravado na ligação). N não inteiro: o plano
  -- devolve 'pack_not_integer' e o custo não muda.
  IF v_price AND ci.base_price IS NOT NULL THEN
    v_cost := public.fn_apply_product_cost_from_supplier(
                isup.id, v_org,
                CASE WHEN v_pack IS NOT NULL THEN ci.base_price ELSE isup.purchase_price END,
                CASE WHEN v_pack IS NOT NULL THEN ci.currency ELSE isup.currency END,
                v_actor);
  ELSE
    v_cost := jsonb_build_object(
      'product_cost_updated', false, 'product_cost_rows', 0,
      'product_cost_reason', CASE WHEN v_price THEN 'no_catalog_price' ELSE 'catalog_price_not_used' END,
      'product_cost_message', CASE WHEN v_price THEN 'O artigo não tem preço no catálogo: preços não mudaram'
                                   ELSE 'Preço do catálogo não usado: preços não mudaram' END,
      'new_unit_cost', NULL, 'units_per_purchase_uom', NULL);
  END IF;

  -- product_codes: referência do fornecedor
  IF NOT EXISTS (SELECT 1 FROM public.product_codes
                 WHERE organization_id = v_org AND supplier_id = p_supplier_id AND kind = 'supplier_ref'
                   AND deleted_at IS NULL AND code_key = ci.ref_key) THEN
    v_code_id := gen_random_uuid();
    INSERT INTO public.product_codes (id, organization_id, code, kind, product_id, uom_id, supplier_id, source, context, created_by)
    VALUES (v_code_id, v_org, ci.supplier_ref, 'supplier_ref', p.id, p_uom_id, p_supplier_id, 'catalog',
            jsonb_build_object('catalog_item_id', ci.id, 'link_id', l.id), v_actor);
    v_codes := v_codes || jsonb_build_array(jsonb_build_object('id', v_code_id, 'kind', 'supplier_ref', 'code', ci.supplier_ref));
  END IF;

  -- product_codes: código de barras do artigo, se faltar no produto e estiver livre
  IF ci.barcode_key IS NOT NULL
     AND public.fn_product_code_key(p.barcode) IS DISTINCT FROM ci.barcode_key
     AND NOT EXISTS (SELECT 1 FROM public.product_codes
                     WHERE organization_id = v_org AND kind = 'barcode' AND deleted_at IS NULL
                       AND code_key = ci.barcode_key AND product_id = p.id) THEN
    SELECT pr.name, pr.sku INTO v_other
    FROM public.products pr
    WHERE pr.organization_id = v_org AND pr.id <> p.id AND pr.deleted_at IS NULL AND NOT pr.is_deleted
      AND public.fn_product_code_key(pr.barcode) = ci.barcode_key
    UNION ALL
    SELECT pr.name, pr.sku
    FROM public.product_codes pc JOIN public.products pr ON pr.id = pc.product_id
    WHERE pc.organization_id = v_org AND pc.kind = 'barcode' AND pc.deleted_at IS NULL
      AND pc.code_key = ci.barcode_key AND pc.product_id <> p.id
    LIMIT 1;
    IF FOUND THEN
      v_warn := v_warn || jsonb_build_array(format('O código de barras %s já está no produto «%s» (%s); não foi associado', ci.barcode, v_other.name, v_other.sku));
    ELSE
      v_code_id := gen_random_uuid();
      INSERT INTO public.product_codes (id, organization_id, code, kind, product_id, uom_id, supplier_id, source, context, created_by)
      VALUES (v_code_id, v_org, ci.barcode, 'barcode', p.id, p_uom_id, p_supplier_id, 'catalog',
              jsonb_build_object('catalog_item_id', ci.id, 'link_id', l.id), v_actor);
      v_codes := v_codes || jsonb_build_array(jsonb_build_object('id', v_code_id, 'kind', 'barcode', 'code', ci.barcode));
    END IF;
  END IF;

  -- Ligado deixa de estar "dispensado".
  DELETE FROM public.supplier_catalog_dismissals WHERE link_id = l.id AND catalog_item_id = ci.id;

  RETURN jsonb_build_object(
    'item_supplier_id', isup.id,
    'created', v_created,
    'already_linked', false,
    'is_preferred', isup.is_preferred,
    'codes', v_codes,
    'warnings', v_warn,
    'item_supplier_price_updated', v_price_upd
  ) || v_cost;
END;
$function$;

-- ─── 4b. rpc_price_changes_decide: preco_data = hoje ao aceitar (resto igual à versão viva) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_price_changes_decide(p_ids uuid[], p_approve boolean, p_note text DEFAULT NULL::text, p_accept_unit_change boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_actor    uuid := public.current_business_user_id();
  v_ids      uuid[];
  v_orgs     uuid[];
  v_note     text;
  v_n        integer;
  r          public.supplier_price_change_requests;
  isup       public.item_suppliers;
  v_stale    boolean;
  v_is_upd   boolean;
  v_plan     jsonb;
  v_res      jsonb;
  v_results  jsonb := '[]'::jsonb;
  v_approved integer := 0;
  v_rejected integer := 0;
  v_skipped  integer := 0;
  v_items_upd integer := 0;
  v_costs_upd integer := 0;
  v_pack_plan  jsonb;    -- plano só para ler a embalagem do artigo ligado
  v_cat_price  numeric;  -- preço do catálogo (embalagem) do pedido
  v_link_price numeric;  -- preço a gravar na ligação (por unidade nas embalagens)
  v_cost_price numeric;  -- preço passado ao custo do produto (o plano divide)
BEGIN
  IF v_uid IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF NOT public.has_anew_permission(v_uid, 'products.edit') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF NOT public.has_anew_permission(v_uid, 'products.manage_prices') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.manage_prices)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Indique se aceita ou recusa' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_ids, ARRAY[]::uuid[])) x WHERE x IS NOT NULL);
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Indique os pedidos' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF cardinality(v_ids) > 1000 THEN
    RAISE EXCEPTION 'Demasiados pedidos (máx. 1000)' USING ERRCODE = 'check_violation', HINT = 'too_many_rows';
  END IF;
  v_note := NULLIF(btrim(regexp_replace(COALESCE(p_note, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Nota demasiado longa (máx. 500 caracteres)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  v_orgs := ARRAY(SELECT public.get_user_visible_org_ids(v_uid));
  SELECT count(*) INTO v_n
  FROM public.supplier_price_change_requests
  WHERE id = ANY (v_ids) AND organization_id = ANY (v_orgs);
  IF v_n <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Pedido de alteração de preço não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  PERFORM set_config('app.audit_source', 'supplier_price_approval', true);

  FOR r IN
    SELECT * FROM public.supplier_price_change_requests
    WHERE id = ANY (v_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF r.status <> 'pending' THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', r.id, 'outcome', 'skipped', 'reason', 'not_pending', 'status', r.status,
        'message', 'Este pedido já não está por aprovar'));
      CONTINUE;
    END IF;

    SELECT * INTO isup FROM public.item_suppliers WHERE id = r.item_supplier_id FOR UPDATE;
    v_stale := isup.id IS NULL OR isup.deleted_at IS NOT NULL
               OR isup.catalog_item_id IS DISTINCT FROM r.catalog_item_id
               OR isup.supplier_id IS DISTINCT FROM r.supplier_id;

    IF NOT p_approve THEN
      UPDATE public.supplier_price_change_requests
         SET status = 'rejected', decided_at = now(), decided_by = v_actor, decision_note = v_note,
             result = jsonb_build_object('item_supplier_updated', false, 'product_cost_updated', false)
       WHERE id = r.id;
      v_rejected := v_rejected + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('id', r.id, 'outcome', 'rejected'));
      CONTINUE;
    END IF;

    IF v_stale THEN
      UPDATE public.supplier_price_change_requests
         SET status = 'superseded', superseded_at = now(),
             result = jsonb_build_object('reason', 'link_changed')
       WHERE id = r.id;
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', r.id, 'outcome', 'skipped', 'reason', 'stale',
        'message', 'A ligação deste artigo ao produto mudou ou foi removida: o pedido foi arquivado'));
      CONTINUE;
    END IF;

    IF r.unit_changed AND NOT COALESCE(p_accept_unit_change, false) THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', r.id, 'outcome', 'skipped', 'reason', 'unit_changed',
        'message', 'O fornecedor mudou a unidade/embalagem deste artigo: confirme que a ligação continua certa antes de aceitar'));
      CONTINUE;
    END IF;

    -- Artigo em embalagem de N numa ligação à unidade do produto: a ligação
    -- guarda o preço por unidade (preço do catálogo ÷ N) e o custo do produto
    -- recebe o preço do catálogo (o plano divide uma vez). N não inteiro →
    -- não há conversão segura: o pedido fica por decidir.
    v_cat_price := COALESCE(r.catalog_new_price, r.new_price);
    v_pack_plan := public.fn_price_change_cost_plan(isup.id, r.organization_id, v_cat_price, r.currency);
    IF COALESCE((v_pack_plan ->> 'catalog_pack_not_integer')::boolean, false) THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', r.id, 'outcome', 'skipped', 'reason', 'pack_not_integer',
        'message', format('O fornecedor vende este artigo em embalagens de %s unidades (não inteiro): não é possível passar o preço para a unidade. Recuse ou ligue o artigo de outra forma',
                          trim_scale((v_pack_plan ->> 'catalog_units_per_pack')::numeric))));
      CONTINUE;
    END IF;
    IF (v_pack_plan ->> 'catalog_pack_units') IS NOT NULL THEN
      v_link_price := (v_pack_plan ->> 'new_unit_cost')::numeric;
      v_cost_price := v_cat_price;
    ELSE
      v_link_price := r.new_price;
      v_cost_price := r.new_price;
    END IF;

    -- Preço do fornecedor (histórico pelo gatilho existente). Aceitar o
    -- pedido confirma o preço hoje: preco_data = hoje, mesmo sem mudança.
    v_is_upd := isup.purchase_price IS DISTINCT FROM v_link_price OR isup.currency IS DISTINCT FROM r.currency;
    IF v_is_upd THEN
      UPDATE public.item_suppliers
         SET purchase_price = v_link_price, currency = r.currency, preco_data = current_date, updated_at = now()
       WHERE id = isup.id;
      v_items_upd := v_items_upd + 1;
    ELSIF isup.preco_data IS DISTINCT FROM current_date THEN
      UPDATE public.item_suppliers SET preco_data = current_date, updated_at = now() WHERE id = isup.id;
    END IF;

    -- Custo do produto (mesma regra que rpc_catalog_link com preço do catálogo).
    v_plan := public.fn_apply_product_cost_from_supplier(isup.id, r.organization_id, v_cost_price, r.currency, v_actor);
    IF (v_plan ->> 'product_cost_rows')::integer > 0 THEN
      v_costs_upd := v_costs_upd + 1;
    END IF;

    v_res := jsonb_build_object(
      'item_supplier_updated', v_is_upd,
      'item_supplier_price', v_link_price,
      'catalog_pack_units', (v_pack_plan ->> 'catalog_pack_units')::integer,
      'accepted_unit_change', r.unit_changed) || v_plan;

    UPDATE public.supplier_price_change_requests
       SET status = 'approved', decided_at = now(), decided_by = v_actor, decision_note = v_note, result = v_res
     WHERE id = r.id;
    v_approved := v_approved + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object('id', r.id, 'outcome', 'approved') || v_res);
  END LOOP;

  -- Sino: sem pendentes para o fornecedor nessa empresa → aviso resolvido.
  BEGIN
    UPDATE public.notifications n
       SET is_resolved = true, resolved_at = now(), resolved_reason = 'prices_decided'
      FROM (SELECT DISTINCT organization_id, supplier_id
              FROM public.supplier_price_change_requests WHERE id = ANY (v_ids)) s
     WHERE n.type = 'supplier_price_pending'
       AND n.entity_id = s.supplier_id
       AND n.organization_id = s.organization_id
       AND n.is_resolved = false
       AND NOT EXISTS (SELECT 1 FROM public.supplier_price_change_requests q
                       WHERE q.organization_id = s.organization_id AND q.supplier_id = s.supplier_id
                         AND q.status = 'pending');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Aviso de preços não resolvido: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'approved', v_approved,
    'rejected', v_rejected,
    'skipped', v_skipped,
    'item_suppliers_updated', v_items_upd,
    'product_costs_updated', v_costs_upd,
    'results', v_results
  );
END;
$function$;

-- ─── 1. cat_produto_fornecedores ──────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_produto_fornecedores(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_precos boolean; r jsonb;
BEGIN
  SELECT organization_id INTO v_org FROM products WHERE id = p_product_id AND NOT is_deleted AND deleted_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  -- a mesma leitura que cat_ler_catalogo (a lista do Catálogo)
  PERFORM public.fn_cat_exigir(v_org, 'services.view');
  -- preços como a RLS de item_suppliers / rpc_supplier_catalog_list, mas na organização do produto
  v_precos := public.is_system_admin_user(auth.uid())
              OR public.has_anew_permission_in_org(auth.uid(), 'products.view_cost', v_org)
              OR public.has_anew_permission_in_org(auth.uid(), 'suppliers.view_pricing', v_org);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'item_supplier_id', i.id,
           'supplier_id', i.supplier_id,
           'supplier_name', s.name,
           'supplier_sku', i.supplier_sku,
           'purchase_price', CASE WHEN v_precos THEN i.purchase_price END,
           'currency', i.currency,
           'lead_time_days', i.lead_time_days,
           'moq', i.moq,
           'is_preferred', i.is_preferred,
           'is_active', i.is_active,
           'preco_data', i.preco_data,
           'catalog_item_id', i.catalog_item_id,
           'catalogo', CASE WHEN ci.id IS NULL THEN NULL ELSE jsonb_build_object(
             'supplier_ref', ci.supplier_ref,
             'barcode', ci.barcode,
             'nome', ci.name,
             'base_price', CASE WHEN v_precos THEN ci.base_price END,
             'units_per_pack', ci.units_per_pack,
             'unidade', ci.unit_label) END)
         ORDER BY i.is_preferred DESC, s.name NULLS LAST, i.created_at, i.id), '[]'::jsonb)
  INTO r
  FROM item_suppliers i
  LEFT JOIN suppliers s ON s.id = i.supplier_id
  LEFT JOIN supplier_catalog_items ci ON ci.id = i.catalog_item_id
  WHERE i.product_id = p_product_id AND i.deleted_at IS NULL;
  RETURN r;
END $function$;

-- ─── 2. cat_definir_fornecedor_preferido ──────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_definir_fornecedor_preferido(p_item_supplier_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  isup      item_suppliers;
  v_user    uuid;
  v_org_p   uuid;
  v_plan    jsonb;
  v_pack    integer;
  v_preco   numeric;
  v_cost    jsonb;
BEGIN
  SELECT * INTO isup FROM item_suppliers WHERE id = p_item_supplier_id AND deleted_at IS NULL;
  -- sem linha → organização nula → CT001 (não diz se o id existe)
  v_user := public.fn_cat_exigir(isup.organization_id, 'products.edit');
  IF isup.product_id IS NULL THEN RAISE EXCEPTION 'Fornecedor do produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Perfil de utilizador não encontrado.' USING ERRCODE = 'CT001'; END IF;

  -- o produto, trancado para duas trocas de preferido não se cruzarem (como rpc_catalog_link)
  SELECT organization_id INTO v_org_p FROM products
  WHERE id = isup.product_id AND NOT is_deleted AND deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF v_org_p IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  IF v_org_p IS DISTINCT FROM isup.organization_id THEN
    PERFORM public.fn_cat_exigir(v_org_p, 'products.edit');
  END IF;
  -- reler depois do bloqueio (a linha pode ter mudado entretanto)
  SELECT * INTO isup FROM item_suppliers WHERE id = p_item_supplier_id AND deleted_at IS NULL;
  IF isup.id IS NULL THEN RAISE EXCEPTION 'Fornecedor do produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  IF NOT isup.is_active THEN
    RAISE EXCEPTION 'O fornecedor está inativo neste produto: ative-o antes de o tornar preferido.' USING ERRCODE = 'CT002';
  END IF;
  -- o preferido define o custo do produto: com preço, é preciso poder alterar preços (como rpc_catalog_link com o preço do catálogo)
  IF isup.purchase_price IS NOT NULL
     AND NOT (public.is_system_admin_user(auth.uid())
              OR public.has_anew_permission_in_org(auth.uid(), 'products.manage_prices', isup.organization_id)) THEN
    RAISE EXCEPTION 'Sem permissão (products.manage_prices): o fornecedor preferido muda o custo do produto.' USING ERRCODE = 'CT001';
  END IF;

  PERFORM set_config('app.audit_source', 'catalogo', true);
  -- desmarcar primeiro (trg_item_suppliers_preferred_guard e o índice único só aceitam um preferido por produto)
  UPDATE item_suppliers SET is_preferred = false, updated_at = now()
  WHERE product_id = isup.product_id AND is_preferred AND deleted_at IS NULL AND id <> isup.id;
  UPDATE item_suppliers SET is_preferred = true, updated_at = now()
  WHERE id = isup.id AND NOT is_preferred;

  IF isup.purchase_price IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'custo_aplicado', false, 'codigo', 'no_price',
      'motivo', 'Este fornecedor não tem preço de compra: o custo do produto não mudou');
  END IF;

  -- Ligação à unidade de um artigo em embalagem de N: a ligação guarda o preço por unidade e o plano divide o preço
  -- recebido por N, por isso passa-se preço × N (rpc_catalog_link / rpc_price_changes_decide passam o da embalagem).
  v_plan := public.fn_price_change_cost_plan(isup.id, isup.organization_id, isup.purchase_price, isup.currency);
  v_pack := (v_plan ->> 'catalog_pack_units')::integer;
  v_preco := CASE WHEN v_pack IS NOT NULL THEN isup.purchase_price * v_pack ELSE isup.purchase_price END;
  v_cost := public.fn_apply_product_cost_from_supplier(isup.id, isup.organization_id, v_preco, isup.currency, v_user);

  RETURN jsonb_build_object(
    'ok', true,
    'custo_aplicado', coalesce((v_cost ->> 'product_cost_updated')::boolean, false),
    'motivo', v_cost ->> 'product_cost_message',
    'codigo', v_cost ->> 'product_cost_reason');
END $function$;

-- ─── Permissões ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- as substituídas mantêm as suas (CREATE OR REPLACE não mexe); reafirma-se a do ajudante interno
REVOKE ALL ON FUNCTION public.fn_apply_product_cost_from_supplier(uuid,uuid,numeric,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apply_product_cost_from_supplier(uuid,uuid,numeric,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cat_produto_fornecedores(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_produto_fornecedores(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cat_definir_fornecedor_preferido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_definir_fornecedor_preferido(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.cat_produto_fornecedores(uuid) IS 'Catálogo, ficha do produto: ligações item_suppliers do produto com o artigo do catálogo do portal. services.view na organização do produto; preços só com products.view_cost / suppliers.view_pricing.';
COMMENT ON FUNCTION public.cat_definir_fornecedor_preferido(uuid) IS 'Catálogo, ficha do produto: torna a ligação o fornecedor preferido (atómico) e aplica o preço ao custo do produto pelas regras de fn_price_change_cost_plan. products.edit; com preço também products.manage_prices.';

-- ─── Conferir ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $conferir$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.fn_apply_product_cost_from_supplier(uuid,uuid,numeric,text,uuid)'::regprocedure);
  IF position('WHERE id = v_linha' IN v_def) = 0 OR position('preco_exato = v_exato' IN v_def) = 0
     OR position('AND currency::text = p_currency AND price IS DISTINCT FROM v_unit' IN v_def) > 0 THEN
    RAISE EXCEPTION 'Conferir: fn_apply_product_cost_from_supplier ainda reescreve todas as linhas ou não grava preco_exato.';
  END IF;
  IF position('preco_data = CASE WHEN v_use_price THEN current_date' IN
              pg_get_functiondef('public.rpc_catalog_link(uuid,uuid,uuid,uuid,boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Conferir: rpc_catalog_link não grava preco_data.';
  END IF;
  IF position('preco_data = current_date' IN
              pg_get_functiondef('public.rpc_price_changes_decide(uuid[],boolean,text,boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Conferir: rpc_price_changes_decide não grava preco_data.';
  END IF;
  IF has_function_privilege('anon', 'public.cat_produto_fornecedores(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cat_definir_fornecedor_preferido(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_apply_product_cost_from_supplier(uuid,uuid,numeric,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: permissões de EXECUTE a mais.';
  END IF;
END $conferir$;
