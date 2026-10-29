-- Catálogo: um produto ligado a um artigo do catálogo do portal do fornecedor entra no Catálogo (/catalogo-custos › Produtos).
-- Base RH (uetjghdkwbywbftedtth). Sem tabelas nem colunas novas: uma função auxiliar nova, rpc_catalog_link e uma correção de dados.
--
-- Problema: /catalogo-custos (cat_ler_catalogo) só lista produtos com tipo_catalogo não nulo; os produtos ligados (ou criados) a partir
-- do catálogo do portal ficavam com tipo_catalogo e unidade NULL. Criar a partir do portal (CreateProductFromCatalogDialog e
-- BulkCreateProductsDialog → catalogProductCreate.createProductFromCatalog) é sempre rpc_create_product + rpc_catalog_link, por isso
-- basta tratar rpc_catalog_link (se a ligação falhar, o produto fica criado mas não ligado, e não entra — como deve).
--
-- 1. NOVA fn_cat_unidade_do_artigo(unit_label, units_per_pack) → text (interna): a unidade do produto no formato do Catálogo
--    ('un','kg','m²','cx','l','ml','m','saco','rolo','tubo','kit','t','g','emb.'). Embalagem de N > 1 → 'un' (o custo do produto é por
--    unidade: fn_price_change_cost_plan divide por N; é também a regra de matchUom no frontend). Sem rótulo → 'un'. Rótulo
--    desconhecido → o próprio rótulo (aparado, máx. 30).
-- 2. rpc_catalog_link (sobre a versão viva, a da 20270101200000): depois das verificações de permissão, preenche no produto
--    tipo_catalogo = 'produto' e unidade (da função acima) só quando estão NULL. Tudo o resto igual.
-- 3. Dados (idempotente): produtos não apagados com uma ligação viva a um artigo do catálogo e tipo_catalogo NULL → tipo_catalogo =
--    'produto' e unidade (se NULL) a partir do artigo (o da ligação preferida, senão a mais recente). Produtos sem ligação não mudam.
-- Guarda: só substitui rpc_catalog_link se for exatamente a medida a 29/10/2026 na base RH (md5 de pg_get_functiondef).

SET lock_timeout = '5s';

DO $guarda$
DECLARE v_h text;
BEGIN
  SELECT md5(pg_get_functiondef('public.rpc_catalog_link(uuid,uuid,uuid,uuid,boolean)'::regprocedure)) INTO v_h;
  IF v_h <> 'ab3a222dabd106d9591a348436b8dc15' THEN
    RAISE EXCEPTION 'Guarda: rpc_catalog_link no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'tipo_catalogo')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'unidade') THEN
    RAISE EXCEPTION 'Guarda: faltam products.tipo_catalogo / products.unidade.';
  END IF;
END $guarda$;

-- ─── 1. fn_cat_unidade_do_artigo ──────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cat_unidade_do_artigo(p_unit_label text, p_units_per_pack numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH r AS (
    SELECT btrim(regexp_replace(translate(lower(coalesce(p_unit_label, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
                                '[.[:space:]]+', ' ', 'g')) AS f)
  SELECT CASE
    WHEN p_units_per_pack > 1 THEN 'un'
    WHEN r.f = '' THEN 'un'
    WHEN r.f IN ('un', 'u', 'und', 'unid', 'uni', 'unidade', 'unidades', 'unit', 'ea', 'each', 'pc', 'pcs', 'peca', 'pecas') THEN 'un'
    WHEN r.f IN ('cx', 'caixa', 'caixas', 'box') THEN 'cx'
    WHEN r.f IN ('kg', 'quilo', 'quilos', 'kilo', 'kilos') THEN 'kg'
    WHEN r.f IN ('g', 'gr', 'grama', 'gramas') THEN 'g'
    WHEN r.f IN ('l', 'lt', 'litro', 'litros') THEN 'l'
    WHEN r.f = 'ml' THEN 'ml'
    WHEN r.f IN ('m', 'mt', 'metro', 'metros') THEN 'm'
    WHEN r.f IN ('m2', 'm²', 'metro quadrado', 'metros quadrados') THEN 'm²'
    WHEN r.f IN ('emb', 'embalagem', 'pack', 'pkg') THEN 'emb.'
    WHEN r.f IN ('saco', 'sacos') THEN 'saco'
    WHEN r.f IN ('rolo', 'rolos') THEN 'rolo'
    WHEN r.f IN ('tubo', 'tubos') THEN 'tubo'
    WHEN r.f IN ('kit', 'kits') THEN 'kit'
    WHEN r.f IN ('t', 'ton', 'tonelada', 'toneladas') THEN 't'
    ELSE left(btrim(p_unit_label), 30)
  END
  FROM r
$function$;

REVOKE ALL ON FUNCTION public.fn_cat_unidade_do_artigo(text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cat_unidade_do_artigo(text, numeric) TO service_role;
COMMENT ON FUNCTION public.fn_cat_unidade_do_artigo(text, numeric) IS 'Catálogo: unidade do produto (formato do Catálogo) a partir do rótulo e da embalagem de um artigo do catálogo do portal. Interna (rpc_catalog_link).';

-- ─── 2. rpc_catalog_link: o produto ligado entra no Catálogo (resto igual à versão viva) ─────────────────────────────────────────────────
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

  -- 20270101210000: ligado a um artigo do portal, o produto entra no Catálogo (/catalogo-custos lista tipo_catalogo não nulo).
  -- Só preenche o que está vazio: nunca muda tipo_catalogo/unidade já escolhidos. Qualquer erro mais abaixo desfaz isto também.
  UPDATE public.products
     SET tipo_catalogo = COALESCE(tipo_catalogo, 'produto'),
         unidade = COALESCE(unidade, public.fn_cat_unidade_do_artigo(ci.unit_label, ci.units_per_pack))
   WHERE id = p.id AND (tipo_catalogo IS NULL OR unidade IS NULL);

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

-- ─── 3. Dados: produtos já ligados ao portal que ficaram fora do Catálogo ────────────────────────────────────────────────────────────────
DO $dados$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('app.audit_source', 'system', true);
  WITH alvo AS (
    SELECT DISTINCT ON (p.id) p.id, ci.unit_label, ci.units_per_pack
    FROM public.products p
    JOIN public.item_suppliers i ON i.product_id = p.id AND i.catalog_item_id IS NOT NULL AND i.deleted_at IS NULL
    JOIN public.supplier_catalog_items ci ON ci.id = i.catalog_item_id
    WHERE p.tipo_catalogo IS NULL AND NOT p.is_deleted AND p.deleted_at IS NULL
    ORDER BY p.id, i.is_preferred DESC, i.updated_at DESC, i.id
  )
  UPDATE public.products p
     SET tipo_catalogo = 'produto',
         unidade = COALESCE(p.unidade, public.fn_cat_unidade_do_artigo(a.unit_label, a.units_per_pack))
    FROM alvo a
   WHERE p.id = a.id AND p.tipo_catalogo IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Produtos ligados ao portal que entraram no Catálogo: %', v_n;
END $dados$;

-- ─── Conferir ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $conferir$
BEGIN
  IF position('fn_cat_unidade_do_artigo(ci.unit_label, ci.units_per_pack)' IN
              pg_get_functiondef('public.rpc_catalog_link(uuid,uuid,uuid,uuid,boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Conferir: rpc_catalog_link não põe o produto no Catálogo.';
  END IF;
  IF public.fn_cat_unidade_do_artigo('cx', 12) <> 'un' OR public.fn_cat_unidade_do_artigo(' Kg ', NULL) <> 'kg'
     OR public.fn_cat_unidade_do_artigo('m2', 1) <> 'm²' OR public.fn_cat_unidade_do_artigo(NULL, NULL) <> 'un'
     OR public.fn_cat_unidade_do_artigo('Peça', 1) <> 'un' OR public.fn_cat_unidade_do_artigo('Emb.', NULL) <> 'emb.' THEN
    RAISE EXCEPTION 'Conferir: fn_cat_unidade_do_artigo devolve unidades erradas.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.products p
             JOIN public.item_suppliers i ON i.product_id = p.id AND i.catalog_item_id IS NOT NULL AND i.deleted_at IS NULL
             WHERE p.tipo_catalogo IS NULL AND NOT p.is_deleted AND p.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Conferir: ainda há produtos ligados ao portal fora do Catálogo.';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_cat_unidade_do_artigo(text,numeric)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_cat_unidade_do_artigo(text,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: fn_cat_unidade_do_artigo é interna.';
  END IF;
END $conferir$;
