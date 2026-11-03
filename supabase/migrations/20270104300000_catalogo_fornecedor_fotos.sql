-- ============================================================
-- 20270104300000_catalogo_fornecedor_fotos
-- ============================================================
-- Portal do Fornecedor: cada artigo do catálogo (supplier_catalog_items) pode ter até 4 fotos; a 1.ª é a
-- principal. Cada cor é um artigo próprio (SKU próprio), por isso a foto de cada cor vive no seu artigo.
-- Base RH (uetjghdkwbywbftedtth). NUNCA a principal.
--
-- Estrutura
--   • supplier_catalog_items.image_paths text[] NOT NULL DEFAULT '{}' — caminhos no bucket, ordem = ordem de
--     apresentação; CHECK: no máximo 4 e sem NULL.
--   • Bucket supplier-catalog-images: público (leitura pelo URL público), só JPEG/PNG/WEBP, 5 MB.
--     Escrita/alteração/remoção só pela service_role (Edge supplier-catalog-image): políticas RESTRICTIVE que
--     bloqueiam anon/authenticated, como em supplier-contracts. Sem política de SELECT (não se lista o bucket).
--     Caminho: {supplier_account_id}/{catalog_item_id}/{uuid}.{jpg|png|webp}.
--
-- Funções novas
--   • sp_catalog_image_register(item, path)  — portal, titular (fn_sp_actor + role owner), artigo da própria conta;
--     o objeto tem de existir no bucket debaixo do prefixo da conta/artigo (só a Edge lá escreve, depois de ver os
--     magic bytes). Máx. 4 (HINT limit). Repetir o mesmo caminho devolve o que está.
--   • sp_catalog_image_remove(item, path)    — idem; tira da lista e devolve storage_path (validado no prefixo da
--     conta/artigo) para a Edge apagar o objeto.
--   • sp_catalog_image_reorder(item, paths)  — idem; a lista nova tem de ser uma permutação da atual.
--   • fn_sp_catalog_image_path_ok(conta, artigo, path) — interna: formato do caminho.
--   • fn_sp_catalog_image_public_url(path)   — interna: URL público a partir do emissor do JWT de quem chama
--     (iss = https://<projeto>/auth/v1), sem endereço do projeto escrito na BD. Sem JWT válido → NULL.
--   • fn_sp_catalog_copy_images_to_product(produto, artigo) — interna: copia as URLs públicas para
--     products.image_urls só se o produto não tiver fotos (NULL ou vazio). Devolve quantas copiou.
--
-- Funções reescritas (a partir da versão viva, pg_get_functiondef, 03/11/2026)
--   • fn_sp_catalog_item_json  + 'image_paths' (portal: sp_catalog_list/upsert/classificar; CRM: rpc_supplier_catalog_list)
--   • rpc_catalog_link         + cópia das fotos para o produto; resposta + 'images_copied'
--   • cat_ligar_produto_artigo + cópia das fotos para o produto
--
-- A mudança de fotos NÃO mexe em updated_at do artigo (é a data do preço em cat_ligar_produto_artigo).

BEGIN;

-- ═══ 1. Estrutura ═══════════════════════════════════════════════════════════

ALTER TABLE public.supplier_catalog_items
  ADD COLUMN IF NOT EXISTS image_paths text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.supplier_catalog_items
  ADD CONSTRAINT supplier_catalog_items_image_paths_chk
  CHECK (cardinality(image_paths) <= 4 AND array_position(image_paths, NULL) IS NULL);

COMMENT ON COLUMN public.supplier_catalog_items.image_paths IS
  'Fotos do artigo (até 4; a 1.ª é a principal): caminhos no bucket público supplier-catalog-images, {supplier_account_id}/{id}/{uuid}.{ext}. Escritas só pelas RPCs sp_catalog_image_* via Edge supplier-catalog-image.';

-- ═══ 2. Storage ═════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('supplier-catalog-images', 'supplier-catalog-images', true, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Escrita só pela service_role (a Edge valida os bytes antes de gravar).
CREATE POLICY supplier_catalog_images_block_insert ON storage.objects AS RESTRICTIVE
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id <> 'supplier-catalog-images');
CREATE POLICY supplier_catalog_images_block_update ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated USING (bucket_id <> 'supplier-catalog-images')
  WITH CHECK (bucket_id <> 'supplier-catalog-images');
CREATE POLICY supplier_catalog_images_block_delete ON storage.objects AS RESTRICTIVE
  FOR DELETE TO anon, authenticated USING (bucket_id <> 'supplier-catalog-images');

-- ═══ 3. Auxiliares ══════════════════════════════════════════════════════════

-- Caminho válido para (conta, artigo): {conta}/{artigo}/{uuid}.{jpg|png|webp}.
CREATE OR REPLACE FUNCTION public.fn_sp_catalog_image_path_ok(p_account uuid, p_item uuid, p_path text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    p_account IS NOT NULL AND p_item IS NOT NULL AND p_path IS NOT NULL
    AND p_path ~ ('^' || p_account::text || '/' || p_item::text
                  || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'),
    false)
$function$;

-- URL público do objeto, a partir do emissor do JWT de quem chama (https://<projeto>/auth/v1).
CREATE OR REPLACE FUNCTION public.fn_sp_catalog_image_public_url(p_path text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_iss text := NULLIF(btrim(COALESCE(auth.jwt() ->> 'iss', '')), '');
BEGIN
  IF p_path IS NULL OR v_iss IS NULL
     OR v_iss !~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?/auth/v1/?$' THEN
    RETURN NULL;
  END IF;
  RETURN regexp_replace(v_iss, '/auth/v1/?$', '') || '/storage/v1/object/public/supplier-catalog-images/' || p_path;
END;
$function$;

-- Produto sem fotos (NULL ou vazio) → fica com as fotos do artigo. Devolve quantas copiou (0 = nada mudou).
CREATE OR REPLACE FUNCTION public.fn_sp_catalog_copy_images_to_product(p_product_id uuid, p_catalog_item_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_paths text[];
  v_urls  text[];
  v_n     integer;
BEGIN
  SELECT image_paths INTO v_paths FROM public.supplier_catalog_items WHERE id = p_catalog_item_id;
  IF COALESCE(cardinality(v_paths), 0) = 0 THEN
    RETURN 0;
  END IF;
  SELECT array_agg(public.fn_sp_catalog_image_public_url(x.p) ORDER BY x.o) INTO v_urls
  FROM unnest(v_paths) WITH ORDINALITY AS x(p, o);
  IF v_urls IS NULL OR array_position(v_urls, NULL) IS NOT NULL THEN
    RETURN 0;   -- sem JWT válido não se sabe o endereço público: não se copia
  END IF;
  UPDATE public.products SET image_urls = v_urls
  WHERE id = p_product_id AND (image_urls IS NULL OR cardinality(image_urls) = 0);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN CASE WHEN v_n > 0 THEN cardinality(v_urls) ELSE 0 END;
END;
$function$;

-- ═══ 4. Portal: registar / remover / reordenar ══════════════════════════════

CREATE OR REPLACE FUNCTION public.sp_catalog_image_register(p_catalog_item_id uuid, p_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u      public.supplier_portal_users := public.fn_sp_actor();
  ci     public.supplier_catalog_items;
  v_mime text;
  v_size bigint;
BEGIN
  IF u.role <> 'owner' THEN
    RAISE EXCEPTION 'Só o utilizador principal da conta pode alterar o catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  SELECT * INTO ci FROM public.supplier_catalog_items
  WHERE id = p_catalog_item_id AND supplier_account_id = u.supplier_account_id FOR UPDATE;
  IF ci.id IS NULL THEN
    RAISE EXCEPTION 'Artigo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF NOT public.fn_sp_catalog_image_path_ok(u.supplier_account_id, ci.id, p_path) THEN
    RAISE EXCEPTION 'Caminho da foto inválido para este artigo' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF p_path = ANY (ci.image_paths) THEN
    RETURN jsonb_build_object('item', public.fn_sp_catalog_item_json(ci, true), 'already_registered', true);
  END IF;

  -- Só a Edge escreve no bucket (políticas RESTRICTIVE): o objeto existir é prova de que os bytes foram vistos.
  SELECT lower(o.metadata ->> 'mimetype'), (o.metadata ->> 'size')::bigint INTO v_mime, v_size
  FROM storage.objects o
  WHERE o.bucket_id = 'supplier-catalog-images' AND o.name = p_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A foto não foi carregada' USING ERRCODE = 'no_data_found', HINT = 'validation';
  END IF;
  IF v_mime IS NULL OR v_mime NOT IN ('image/jpeg', 'image/png', 'image/webp')
     OR v_size IS NULL OR v_size <= 0 OR v_size > 5242880 THEN
    RAISE EXCEPTION 'Só se aceitam fotos JPEG, PNG ou WEBP até 5 MB' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF cardinality(ci.image_paths) >= 4 THEN
    RAISE EXCEPTION 'Cada artigo pode ter no máximo 4 fotos' USING ERRCODE = 'check_violation', HINT = 'limit';
  END IF;

  UPDATE public.supplier_catalog_items
     SET image_paths = image_paths || p_path, updated_by_portal_user = u.id
   WHERE id = ci.id
  RETURNING * INTO ci;

  RETURN jsonb_build_object('item', public.fn_sp_catalog_item_json(ci, true), 'already_registered', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sp_catalog_image_remove(p_catalog_item_id uuid, p_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u     public.supplier_portal_users := public.fn_sp_actor();
  ci    public.supplier_catalog_items;
  v_was boolean;
BEGIN
  IF u.role <> 'owner' THEN
    RAISE EXCEPTION 'Só o utilizador principal da conta pode alterar o catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  SELECT * INTO ci FROM public.supplier_catalog_items
  WHERE id = p_catalog_item_id AND supplier_account_id = u.supplier_account_id FOR UPDATE;
  IF ci.id IS NULL THEN
    RAISE EXCEPTION 'Artigo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF NOT public.fn_sp_catalog_image_path_ok(u.supplier_account_id, ci.id, p_path) THEN
    RAISE EXCEPTION 'Caminho da foto inválido para este artigo' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  v_was := p_path = ANY (ci.image_paths);
  IF v_was THEN
    UPDATE public.supplier_catalog_items
       SET image_paths = array_remove(image_paths, p_path), updated_by_portal_user = u.id
     WHERE id = ci.id
    RETURNING * INTO ci;
  END IF;

  -- storage_path: o objeto a apagar pela Edge (validado no prefixo desta conta/artigo; também limpa órfãos).
  RETURN jsonb_build_object('item', public.fn_sp_catalog_item_json(ci, true), 'removed', v_was,
                            'storage_path', p_path);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sp_catalog_image_reorder(p_catalog_item_id uuid, p_paths text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u  public.supplier_portal_users := public.fn_sp_actor();
  ci public.supplier_catalog_items;
BEGIN
  IF u.role <> 'owner' THEN
    RAISE EXCEPTION 'Só o utilizador principal da conta pode alterar o catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  SELECT * INTO ci FROM public.supplier_catalog_items
  WHERE id = p_catalog_item_id AND supplier_account_id = u.supplier_account_id FOR UPDATE;
  IF ci.id IS NULL THEN
    RAISE EXCEPTION 'Artigo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF p_paths IS NULL OR array_position(p_paths, NULL) IS NOT NULL
     OR cardinality(p_paths) <> cardinality(ci.image_paths)
     OR (SELECT count(DISTINCT x) FROM unnest(p_paths) x) <> cardinality(p_paths)
     OR NOT (p_paths <@ ci.image_paths) THEN
    RAISE EXCEPTION 'A nova ordem tem de ter exatamente as fotos atuais do artigo'
      USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF p_paths IS DISTINCT FROM ci.image_paths THEN
    UPDATE public.supplier_catalog_items
       SET image_paths = p_paths, updated_by_portal_user = u.id
     WHERE id = ci.id
    RETURNING * INTO ci;
  END IF;

  RETURN jsonb_build_object('item', public.fn_sp_catalog_item_json(ci, true));
END;
$function$;

-- ═══ 5. JSON do artigo (portal e CRM) ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_sp_catalog_item_json(p_item supplier_catalog_items, p_with_price boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id', p_item.id,
    'supplier_ref', p_item.supplier_ref,
    'barcode', p_item.barcode,
    'name', p_item.name,
    'description', p_item.description,
    'brand', p_item.brand,
    'unit_label', p_item.unit_label,
    'units_per_pack', p_item.units_per_pack,
    'base_price', CASE WHEN p_with_price THEN p_item.base_price END,
    'currency', p_item.currency,
    'moq', p_item.moq,
    'lead_time_days', p_item.lead_time_days,
    'is_active', p_item.is_active,
    'updated_at', p_item.updated_at,
    -- 20270101310000: a classificação e o SKU gerado
    'categoria_id', p_item.categoria_id,
    'subcategoria_id', p_item.subcategoria_id,
    'medida', p_item.medida,
    'cor', p_item.cor,
    'sku', p_item.sku,
    -- 20270103600000: produto | serviço
    'item_kind', p_item.item_kind,
    'service_districts', to_jsonb(p_item.service_districts),
    'mobilization_days', p_item.mobilization_days,
    -- 20270104300000: fotos (caminhos no bucket público supplier-catalog-images; a 1.ª é a principal)
    'image_paths', to_jsonb(COALESCE(p_item.image_paths, ARRAY[]::text[]))
  )
$function$
;

-- ═══ 6. Ligação ao nosso produto: copiar as fotos se o produto não tiver ════

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
  v_imgs     integer := 0; -- 20270104300000: fotos do artigo copiadas para o produto
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
  -- 20270103600000: um serviço do fornecedor liga-se a um serviço nosso.
  IF ci.item_kind = 'servico' THEN
    RAISE EXCEPTION 'Este artigo é um serviço: ligue-o a um serviço nosso' USING ERRCODE = 'check_violation', HINT = 'kind_mismatch';
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
         -- 20270101240000: ao entrar no Catálogo passa a gerir stock (como todos os produtos do Catálogo)
         manages_stock = CASE WHEN tipo_catalogo IS NULL THEN true ELSE manages_stock END,
         unidade = COALESCE(unidade, public.fn_cat_unidade_do_artigo(ci.unit_label, ci.units_per_pack))
   WHERE id = p.id AND (tipo_catalogo IS NULL OR unidade IS NULL);

  -- 20270104300000: o produto sem fotos fica com as fotos do artigo (URLs públicos). Com fotos, nada muda.
  v_imgs := public.fn_sp_catalog_copy_images_to_product(p.id, ci.id);

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
                                'product_cost_reason', 'already_linked', 'product_cost_message', NULL,
                                'images_copied', v_imgs);
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
    'item_supplier_price_updated', v_price_upd,
    'images_copied', v_imgs
  ) || v_cost;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cat_ligar_produto_artigo(p_org uuid, p_product_id uuid, p_supplier_id uuid, p_catalog_item_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := public.fn_cat_exigir(p_org, 'products.edit'); v_id uuid; a record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND organization_id = p_org AND NOT is_deleted) THEN
    RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = p_supplier_id AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Fornecedor não encontrado.' USING ERRCODE = 'CT003';
  END IF;
  SELECT * INTO a FROM supplier_catalog_items WHERE id = p_catalog_item_id AND is_active;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Artigo do fornecedor não encontrado.' USING ERRCODE = 'CT003'; END IF;
  -- o artigo tem de ser deste fornecedor (a conta do portal ligada a este fornecedor da organização)
  IF NOT EXISTS (SELECT 1 FROM supplier_account_links l WHERE l.supplier_account_id = a.supplier_account_id AND l.supplier_id = p_supplier_id
                 AND l.organization_id = p_org AND l.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'O artigo não é deste fornecedor.' USING ERRCODE = 'CT002';
  END IF;
  -- 20270103600000: um serviço do fornecedor não se liga a um produto.
  IF a.item_kind = 'servico' THEN
    RAISE EXCEPTION 'Este artigo do fornecedor é um serviço: não se liga a um produto.' USING ERRCODE = 'CT002';
  END IF;
  -- 20270104300000: o produto sem fotos fica com as fotos do artigo (URLs públicos). Com fotos, nada muda.
  PERFORM public.fn_sp_catalog_copy_images_to_product(p_product_id, a.id);
  UPDATE item_suppliers SET is_preferred = false, updated_at = now()
  WHERE product_id = p_product_id AND organization_id = p_org AND is_preferred AND deleted_at IS NULL;
  SELECT id INTO v_id FROM item_suppliers WHERE product_id = p_product_id AND supplier_id = p_supplier_id AND organization_id = p_org AND deleted_at IS NULL LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO item_suppliers (organization_id, item_type, product_id, supplier_id, supplier_sku, purchase_price, currency, lead_time_days, moq,
      is_preferred, is_active, created_by, catalog_item_id, preco_data)
    VALUES (p_org, 'product', p_product_id, p_supplier_id, a.supplier_ref,
      round(a.base_price / nullif(coalesce(a.units_per_pack, 1), 0), 2), coalesce(a.currency, 'EUR'), a.lead_time_days, a.moq,
      true, true, v_user, a.id, a.updated_at::date)
    RETURNING id INTO v_id;
  ELSE
    UPDATE item_suppliers SET supplier_sku = a.supplier_ref, purchase_price = round(a.base_price / nullif(coalesce(a.units_per_pack, 1), 0), 2),
      lead_time_days = a.lead_time_days, moq = a.moq, is_preferred = true, is_active = true, catalog_item_id = a.id,
      preco_data = a.updated_at::date, updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $function$
;

-- ═══ 7. Privilégios ═════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.fn_sp_catalog_image_path_ok(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_sp_catalog_image_public_url(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_sp_catalog_copy_images_to_product(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sp_catalog_image_register(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sp_catalog_image_remove(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sp_catalog_image_reorder(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_catalog_image_register(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_catalog_image_remove(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sp_catalog_image_reorder(uuid, text[]) TO authenticated, service_role;
-- As reescritas (CREATE OR REPLACE) mantêm os privilégios que tinham.

COMMIT;
