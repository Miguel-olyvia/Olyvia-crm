-- =============================================================================
-- 20270108230000 — Lote B (P1.4): permissão por organização · fornecedores (fichas, portal, catálogo do fornecedor, pedidos de preço, SLA)
-- =============================================================================
-- Só verificação de permissão: cada has_anew_permission / has_scheduling_permission
-- (globais) passa a has_anew_permission_for_org(uid, código, organização da linha)
-- ou, quando a organização só se conhece depois, a verificação de âmbito usa
-- get_user_permission_org_ids(uid, código) em vez de get_user_visible_org_ids.
-- As verificações globais que já existiam ficam (mesmas mensagens). Nada mais muda.
-- Cada função parte de pg_get_functiondef da versão viva (05/11/2026).
-- Funções: fn_sc_pode_ver, fn_sp_crm_supplier_org, rpc_bulk_delete_supplier, rpc_catalog_dismiss, rpc_catalog_link, rpc_catalog_link_service, rpc_catalog_link_suggestions, rpc_catalog_service_search, rpc_catalog_unlink, rpc_delete_item_supplier, rpc_delete_supplier, rpc_get_supplier_sla_orders, rpc_get_supplier_sla_report, rpc_po_supplier_status, rpc_price_changes_decide, rpc_price_changes_list, rpc_register_supplier_return, rpc_restore_item_supplier, rpc_restore_supplier, rpc_supplier_catalog_list, rpc_supplier_portal_invite_prepare, rpc_supplier_portal_profile_status, rpc_supplier_portal_resend_prepare, rpc_supplier_portal_status
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_sc_pode_ver(p_uid uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_uid IS NOT NULL AND p_org IS NOT NULL
     AND p_org IN (SELECT public.get_user_visible_org_ids(p_uid))
     AND (public.has_anew_permission_for_org(p_uid, 'suppliers.view', p_org)
          OR public.fn_sc_pode(p_uid, 'suppliers.contract_manage', p_org))
$function$;

CREATE OR REPLACE FUNCTION public.fn_sp_crm_supplier_org(p_supplier_id uuid, p_permission text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL OR public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  SELECT s.organization_id INTO v_org
  FROM public.suppliers s
  WHERE s.id = p_supplier_id AND s.deleted_at IS NULL;
  IF v_org IS NULL OR v_org NOT IN (SELECT public.get_user_visible_org_ids(v_uid)) THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF NOT public.has_anew_permission_for_org(v_uid, p_permission, v_org) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (%)', p_permission
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  RETURN v_org;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_supplier(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_ids    uuid[];
  v_before public.suppliers;
  v_count  integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'suppliers.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar fornecedores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ids IS NULL THEN
    v_ids := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT o), ARRAY[]::uuid[])
    INTO   v_ids
    FROM   unnest(p_ids) AS u(o)
    WHERE  o IS NOT NULL;
  END IF;

  IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  FOR v_before IN
    SELECT * FROM public.suppliers
    WHERE id = ANY (v_ids)
      AND deleted_at IS NULL
      AND organization_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'suppliers.delete'))
  LOOP
    UPDATE public.suppliers
    SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
    WHERE  id = v_before.id;

    PERFORM public.fn_manual_audit_log(
      'suppliers', v_before.id, v_before.organization_id, 'UPDATE',
      jsonb_build_object(
        'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
        'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
      ),
      'web_app', v_before.id
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_catalog_dismiss(p_supplier_id uuid, p_catalog_item_ids uuid[], p_dismissed boolean DEFAULT true, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org   uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_actor uuid := public.current_business_user_id();
  l       public.supplier_account_links;
  v_n     integer;
  v_reason text := NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '');
  -- 20270103610000: produtos exigem products.edit; serviços exigem services.edit.
  v_p_edit boolean := public.has_anew_permission_for_org(auth.uid(), 'products.edit', v_org);
  v_s_edit boolean := public.has_anew_permission_for_org(auth.uid(), 'services.edit', v_org);
BEGIN
  IF NOT (v_p_edit OR v_s_edit) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF p_catalog_item_ids IS NULL OR cardinality(p_catalog_item_ids) = 0 THEN
    RAISE EXCEPTION 'Indique os artigos' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF cardinality(p_catalog_item_ids) > 5000 THEN
    RAISE EXCEPTION 'Demasiados artigos (máx. 5000)' USING ERRCODE = 'check_violation', HINT = 'too_many_rows';
  END IF;
  SELECT * INTO l FROM public.supplier_account_links WHERE supplier_id = p_supplier_id AND status = 'active';
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não está ligado ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;
  IF NOT v_p_edit AND EXISTS (SELECT 1 FROM public.supplier_catalog_items ci
                              WHERE ci.supplier_account_id = l.supplier_account_id AND ci.id = ANY (p_catalog_item_ids)
                                AND ci.item_kind <> 'servico') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF NOT v_s_edit AND EXISTS (SELECT 1 FROM public.supplier_catalog_items ci
                              WHERE ci.supplier_account_id = l.supplier_account_id AND ci.id = ANY (p_catalog_item_ids)
                                AND ci.item_kind = 'servico') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (services.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  IF COALESCE(p_dismissed, true) THEN
    INSERT INTO public.supplier_catalog_dismissals (organization_id, link_id, catalog_item_id, dismissed_by, reason)
    SELECT v_org, l.id, ci.id, v_actor, v_reason
    FROM public.supplier_catalog_items ci
    WHERE ci.supplier_account_id = l.supplier_account_id AND ci.id = ANY (p_catalog_item_ids)
    ON CONFLICT (link_id, catalog_item_id) DO NOTHING;
  ELSE
    DELETE FROM public.supplier_catalog_dismissals
    WHERE link_id = l.id AND catalog_item_id = ANY (p_catalog_item_ids);
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('changed', v_n);
END;
$function$;

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
  IF NOT public.has_anew_permission_for_org(auth.uid(), 'products.edit', v_org) THEN
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
     AND NOT public.has_anew_permission_for_org(auth.uid(), 'products.manage_prices', v_org) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_catalog_link_service(p_supplier_id uuid, p_catalog_item_id uuid, p_service_id uuid, p_apply_catalog_price boolean DEFAULT true)
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
  s          record;
  isup       public.item_suppliers;
  v_other    record;
  v_created  boolean := false;
  v_warn     jsonb := '[]'::jsonb;
  v_price    boolean := COALESCE(p_apply_catalog_price, true);
  v_use_price boolean;
  v_old_price numeric;
  v_old_ccy  text;
  v_price_upd boolean := false;
  v_pref     boolean;
BEGIN
  IF NOT public.has_anew_permission_for_org(auth.uid(), 'services.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (services.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT * INTO l FROM public.supplier_account_links WHERE supplier_id = p_supplier_id AND status = 'active';
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não está ligado ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;
  SELECT * INTO ci FROM public.supplier_catalog_items WHERE id = p_catalog_item_id AND supplier_account_id = l.supplier_account_id;
  IF ci.id IS NULL THEN
    RAISE EXCEPTION 'Artigo do catálogo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF ci.item_kind <> 'servico' THEN
    RAISE EXCEPTION 'Este artigo é um produto: ligue-o a um produto nosso' USING ERRCODE = 'check_violation', HINT = 'kind_mismatch';
  END IF;
  SELECT id, name, sku INTO s FROM public.services
  WHERE id = p_service_id AND organization_id = v_org AND NOT is_deleted AND deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Serviço não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  IF v_price AND ci.base_price IS NOT NULL
     AND NOT public.has_anew_permission_for_org(auth.uid(), 'services.manage_prices', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para alterar preços: liga sem usar o preço do catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_price_permission';
  END IF;
  v_use_price := v_price AND ci.base_price IS NOT NULL;

  PERFORM pg_advisory_xact_lock(hashtextextended('catalog_link:' || p_supplier_id::text, 0));
  PERFORM set_config('app.audit_source', 'supplier_catalog', true);

  -- Este artigo já está ligado?
  SELECT * INTO isup FROM public.item_suppliers
  WHERE supplier_id = p_supplier_id AND catalog_item_id = ci.id AND deleted_at IS NULL;
  IF isup.id IS NOT NULL THEN
    IF isup.service_id = s.id THEN
      RETURN jsonb_build_object('item_supplier_id', isup.id, 'created', false, 'already_linked', true,
                                'codes', '[]'::jsonb, 'warnings', '[]'::jsonb, 'service_id', s.id,
                                'item_supplier_price_updated', false, 'product_cost_updated', false,
                                'product_cost_reason', 'already_linked', 'product_cost_message', NULL);
    END IF;
    SELECT COALESCE(pr.name, sv.name) AS name, COALESCE(pr.sku, sv.sku) AS sku INTO v_other
    FROM (SELECT 1) x
    LEFT JOIN public.products pr ON pr.id = isup.product_id
    LEFT JOIN public.services sv ON sv.id = isup.service_id;
    RAISE EXCEPTION 'A referência «%» já está ligada a «%» (%)', ci.supplier_ref, v_other.name, v_other.sku
      USING ERRCODE = 'unique_violation', HINT = 'conflict';
  END IF;

  -- Associação (serviço, fornecedor) existente? (única por item_suppliers_service_supplier_active_uniq)
  SELECT * INTO isup FROM public.item_suppliers
  WHERE service_id = s.id AND supplier_id = p_supplier_id AND deleted_at IS NULL
  FOR UPDATE;

  IF isup.id IS NOT NULL THEN
    IF isup.catalog_item_id IS NOT NULL THEN
      SELECT supplier_ref INTO v_other FROM public.supplier_catalog_items WHERE id = isup.catalog_item_id;
      RAISE EXCEPTION 'Este serviço já está ligado a outra referência do catálogo («%»)', v_other.supplier_ref
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
      purchase_price = CASE WHEN v_use_price THEN round(ci.base_price, 2) ELSE purchase_price END,
      currency = CASE WHEN v_use_price THEN ci.currency ELSE currency END,
      preco_data = CASE WHEN v_use_price THEN current_date ELSE preco_data END,
      lead_time_days = COALESCE(lead_time_days, ci.mobilization_days),
      updated_at = now()
    WHERE id = isup.id
    RETURNING * INTO isup;
    v_price_upd := v_use_price
                   AND (isup.purchase_price IS DISTINCT FROM v_old_price OR isup.currency IS DISTINCT FROM v_old_ccy);
  ELSE
    v_pref := NOT EXISTS (SELECT 1 FROM public.item_suppliers WHERE service_id = s.id AND deleted_at IS NULL);
    INSERT INTO public.item_suppliers (
      organization_id, item_type, service_id, supplier_id, supplier_sku, purchase_price,
      currency, lead_time_days, is_preferred, is_active, created_by, catalog_item_id, preco_data
    ) VALUES (
      v_org, 'service', s.id, p_supplier_id, ci.supplier_ref,
      CASE WHEN v_use_price THEN round(ci.base_price, 2) END, ci.currency, ci.mobilization_days,
      v_pref, true, v_actor, ci.id, CASE WHEN v_use_price THEN current_date END
    ) RETURNING * INTO isup;
    v_created := true;
    v_price_upd := v_use_price;
  END IF;

  -- Ligado deixa de estar "dispensado".
  DELETE FROM public.supplier_catalog_dismissals WHERE link_id = l.id AND catalog_item_id = ci.id;

  RETURN jsonb_build_object(
    'item_supplier_id', isup.id,
    'service_id', s.id,
    'created', v_created,
    'already_linked', false,
    'is_preferred', isup.is_preferred,
    'codes', '[]'::jsonb,
    'warnings', v_warn,
    'item_supplier_price_updated', v_price_upd,
    'product_cost_updated', false,
    'product_cost_rows', 0,
    'product_cost_reason', 'not_product',
    'product_cost_message', NULL,
    'new_unit_cost', NULL,
    'units_per_purchase_uom', NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_catalog_link_suggestions(p_supplier_id uuid, p_catalog_item_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_acc uuid;
  v_res jsonb;
BEGIN
  IF NOT public.has_anew_permission_for_org(auth.uid(), 'products.view', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.view)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF p_catalog_item_ids IS NULL OR cardinality(p_catalog_item_ids) = 0 THEN
    RETURN jsonb_build_object('items', '[]'::jsonb);
  END IF;
  IF cardinality(p_catalog_item_ids) > 200 THEN
    RAISE EXCEPTION 'Demasiados artigos (máx. 200 por pedido)' USING ERRCODE = 'check_violation', HINT = 'too_many_rows';
  END IF;

  SELECT supplier_account_id INTO v_acc FROM public.supplier_account_links
  WHERE supplier_id = p_supplier_id AND status = 'active';
  IF v_acc IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não está ligado ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;

  WITH ci AS (
    SELECT c.id, c.ref_key, c.barcode_key, c.name,
           lower(extensions.unaccent('extensions.unaccent'::regdictionary, c.name)) AS uname
    FROM public.supplier_catalog_items c
    WHERE c.supplier_account_id = v_acc AND c.id = ANY (p_catalog_item_ids)
      AND c.item_kind = 'produto'   -- 20270103600000
  ),
  cand AS (
    SELECT ci.id AS catalog_item_id, isup.product_id, 'supplier_sku'::text AS reason, 1.00::numeric AS score, isup.id AS item_supplier_id
    FROM ci
    JOIN public.item_suppliers isup
      ON isup.supplier_id = p_supplier_id AND isup.deleted_at IS NULL AND isup.product_id IS NOT NULL
     AND isup.catalog_item_id IS NULL
     AND public.fn_product_code_key(isup.supplier_sku) = ci.ref_key
    UNION ALL
    SELECT ci.id, pc.product_id, 'supplier_ref_code', 0.98, NULL
    FROM ci
    JOIN public.product_codes pc
      ON pc.organization_id = v_org AND pc.supplier_id = p_supplier_id AND pc.kind = 'supplier_ref'
     AND pc.deleted_at IS NULL AND pc.code_key = ci.ref_key
    UNION ALL
    SELECT ci.id, p.id, 'barcode', 0.95, NULL
    FROM ci
    JOIN public.products p
      ON ci.barcode_key IS NOT NULL AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
     AND public.fn_product_code_key(p.barcode) = ci.barcode_key
    UNION ALL
    SELECT ci.id, pc.product_id, 'barcode', 0.95, NULL
    FROM ci
    JOIN public.product_codes pc
      ON ci.barcode_key IS NOT NULL AND pc.organization_id = v_org AND pc.kind = 'barcode'
     AND pc.deleted_at IS NULL AND pc.code_key = ci.barcode_key
    UNION ALL
    SELECT ci.id, n.id, 'name', n.score, NULL
    FROM ci
    CROSS JOIN LATERAL (
      SELECT p.id,
             round(extensions.similarity(lower(extensions.unaccent('extensions.unaccent'::regdictionary, p.name)), ci.uname)::numeric, 3) AS score
      FROM public.products p
      WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
        AND p.name OPERATOR(extensions.%) ci.name
      ORDER BY 2 DESC, p.id
      LIMIT 10
    ) n
    WHERE n.score >= 0.30
  ),
  best AS (
    SELECT DISTINCT ON (c.catalog_item_id, c.product_id)
           c.catalog_item_id, c.product_id, c.reason, c.score, c.item_supplier_id
    FROM cand c
    JOIN public.products p ON p.id = c.product_id AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    WHERE NOT EXISTS (
      SELECT 1 FROM public.item_suppliers x
      WHERE x.supplier_id = p_supplier_id AND x.catalog_item_id = c.catalog_item_id
        AND x.product_id = c.product_id AND x.deleted_at IS NULL)
    ORDER BY c.catalog_item_id, c.product_id, c.score DESC, c.item_supplier_id NULLS LAST
  ),
  ranked AS (
    SELECT b.*, row_number() OVER (PARTITION BY b.catalog_item_id ORDER BY b.score DESC, b.product_id) AS rn
    FROM best b
  )
  SELECT jsonb_build_object('items', COALESCE(jsonb_agg(jsonb_build_object(
           'catalog_item_id', ci.id,
           'suggestions', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'product_id', p.id,
                      'product_name', p.name,
                      'product_sku', p.sku,
                      'product_barcode', p.barcode,
                      'reason', r.reason,
                      'score', r.score,
                      'exact', r.reason <> 'name',
                      'item_supplier_id', r.item_supplier_id) ORDER BY r.rn)
             FROM ranked r JOIN public.products p ON p.id = r.product_id
             WHERE r.catalog_item_id = ci.id AND r.rn <= 5
           ), '[]'::jsonb)) ORDER BY ci.id), '[]'::jsonb))
  INTO v_res
  FROM ci;

  RETURN v_res;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_catalog_service_search(p_supplier_id uuid, p_catalog_item_id uuid, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org   uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_acc   uuid;
  ci      public.supplier_catalog_items;
  v_q     text := NULLIF(left(btrim(regexp_replace(COALESCE(p_query, ''), '[\x01-\x1F\x7F]', '', 'g')), 100), '');
  v_like  text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_res   jsonb;
BEGIN
  IF NOT public.has_anew_permission_for_org(auth.uid(), 'services.view', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (services.view)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  SELECT supplier_account_id INTO v_acc FROM public.supplier_account_links
  WHERE supplier_id = p_supplier_id AND status = 'active';
  IF v_acc IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não está ligado ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;
  SELECT * INTO ci FROM public.supplier_catalog_items WHERE id = p_catalog_item_id AND supplier_account_id = v_acc;
  IF ci.id IS NULL THEN
    RAISE EXCEPTION 'Artigo do catálogo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF v_q IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH base AS (
    SELECT s.id, s.name, s.sku, s.unidade, s.is_active,
           round(extensions.similarity(lower(extensions.unaccent('extensions.unaccent'::regdictionary, s.name)),
                                       lower(extensions.unaccent('extensions.unaccent'::regdictionary, COALESCE(v_q, ci.name))))::numeric, 3) AS score,
           public.fn_product_code_key(s.sku) = ci.ref_key AS same_ref
    FROM public.services s
    WHERE s.organization_id = v_org AND NOT s.is_deleted AND s.deleted_at IS NULL
      AND (v_like IS NULL OR s.name ILIKE v_like OR s.sku ILIKE v_like)
  ),
  hits AS (
    SELECT b.*,
           CASE WHEN b.same_ref THEN 'supplier_ref_code' WHEN v_q IS NOT NULL THEN 'search' ELSE 'name' END AS reason
    FROM base b
    WHERE v_q IS NOT NULL OR b.same_ref OR b.score >= 0.20
    ORDER BY b.same_ref DESC, b.is_active DESC, b.score DESC, b.name, b.id
    LIMIT CASE WHEN v_q IS NULL THEN LEAST(v_limit, 5) ELSE v_limit END
  )
  SELECT jsonb_build_object(
           'catalog_item_id', ci.id,
           'items', COALESCE(jsonb_agg(jsonb_build_object(
             'service_id', h.id,
             'service_name', h.name,
             'service_sku', h.sku,
             'unidade', h.unidade,
             'is_active', h.is_active,
             'reason', h.reason,
             'score', CASE WHEN h.same_ref THEN 1 ELSE h.score END,
             'exact', h.same_ref,
             'item_supplier_id', (SELECT x.id FROM public.item_suppliers x
                                  WHERE x.service_id = h.id AND x.supplier_id = p_supplier_id AND x.deleted_at IS NULL LIMIT 1),
             'linked_to_other', EXISTS (SELECT 1 FROM public.item_suppliers x
                                        WHERE x.service_id = h.id AND x.supplier_id = p_supplier_id AND x.deleted_at IS NULL
                                          AND x.catalog_item_id IS NOT NULL AND x.catalog_item_id <> ci.id))
             ORDER BY h.same_ref DESC, h.is_active DESC, h.score DESC, h.name, h.id), '[]'::jsonb))
  INTO v_res
  FROM hits h;

  RETURN v_res;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_catalog_unlink(p_supplier_id uuid, p_catalog_item_id uuid, p_remove_item_supplier boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org   uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_actor uuid := public.current_business_user_id();
  v_n     integer;
  v_codes integer;
  -- 20270103610000: ligação a produto exige products.edit; ligação a serviço exige services.edit.
  v_p_edit boolean := public.has_anew_permission_for_org(auth.uid(), 'products.edit', v_org);
  v_s_edit boolean := public.has_anew_permission_for_org(auth.uid(), 'services.edit', v_org);
BEGIN
  IF NOT (v_p_edit OR v_s_edit) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF NOT v_p_edit AND EXISTS (SELECT 1 FROM public.item_suppliers
                              WHERE supplier_id = p_supplier_id AND organization_id = v_org
                                AND catalog_item_id = p_catalog_item_id AND deleted_at IS NULL
                                AND item_type <> 'service') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF NOT v_s_edit AND EXISTS (SELECT 1 FROM public.item_suppliers
                              WHERE supplier_id = p_supplier_id AND organization_id = v_org
                                AND catalog_item_id = p_catalog_item_id AND deleted_at IS NULL
                                AND item_type = 'service') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (services.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  PERFORM set_config('app.audit_source', 'supplier_catalog', true);

  IF COALESCE(p_remove_item_supplier, false) THEN
    UPDATE public.item_suppliers
       SET catalog_item_id = NULL, deleted_at = now(), deleted_by = v_actor, is_preferred = false, updated_at = now()
     WHERE supplier_id = p_supplier_id AND organization_id = v_org
       AND catalog_item_id = p_catalog_item_id AND deleted_at IS NULL;
  ELSE
    UPDATE public.item_suppliers
       SET catalog_item_id = NULL, updated_at = now()
     WHERE supplier_id = p_supplier_id AND organization_id = v_org
       AND catalog_item_id = p_catalog_item_id AND deleted_at IS NULL;
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Este artigo não está ligado a nenhum produto deste fornecedor' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  UPDATE public.product_codes
     SET deleted_at = now(), deleted_by = v_actor, delete_reason = 'Ligação ao catálogo do fornecedor removida'
   WHERE organization_id = v_org AND supplier_id = p_supplier_id AND source = 'catalog'
     AND deleted_at IS NULL AND context ->> 'catalog_item_id' = p_catalog_item_id::text;
  GET DIAGNOSTICS v_codes = ROW_COUNT;

  RETURN jsonb_build_object('unlinked', v_n, 'codes_removed', v_codes,
                            'item_supplier_removed', COALESCE(p_remove_item_supplier, false));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_item_supplier(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_before public.item_suppliers;
  v_perm   text;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.item_suppliers WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associação fornecedor/artigo não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_perm := CASE v_before.item_type WHEN 'product' THEN 'products.edit' ELSE 'services.edit' END;
  IF NOT public.has_anew_permission_for_org(auth.uid(), v_perm, v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para remover este fornecedor do artigo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Associação já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.item_suppliers
  SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'item_suppliers', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
    ),
    'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_supplier(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_before public.suppliers;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.suppliers WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id IS NULL
     OR v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission_for_org(auth.uid(), 'suppliers.delete', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar fornecedores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Fornecedor já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.suppliers
  SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'suppliers', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
    ),
    'web_app', p_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_supplier_sla_orders(p_supplier_id uuid)
 RETURNS TABLE(order_number text, order_date date, expected_delivery date, actual_delivery_date date, delivery_sla_days integer, days_taken integer, is_within_sla boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org      uuid;
  v_sla_days integer;
BEGIN
  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'supplier_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT s.organization_id, s.delivery_sla_days
  INTO v_org, v_sla_days
  FROM public.suppliers s
  WHERE s.id = p_supplier_id AND s.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- NOVO (20261130080000): suppliers.view_sla_report exigida ADICIONALMENTE
  -- a suppliers.view + purchase_orders.view (ambos mantidos).
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'suppliers.view', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'suppliers.view_sla_report', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.view', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para ver encomendas deste fornecedor' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    po.order_number,
    po.order_date,
    po.expected_delivery,
    po.actual_delivery_date,
    v_sla_days AS delivery_sla_days,
    (po.actual_delivery_date - po.order_date)::integer AS days_taken,
    CASE WHEN v_sla_days IS NULL THEN NULL
         ELSE (po.actual_delivery_date - po.order_date) <= v_sla_days
    END AS is_within_sla
  FROM public.purchase_orders po
  WHERE po.supplier_id = p_supplier_id
    AND po.deleted_at IS NULL
    AND po.status = 'received'
    AND po.actual_delivery_date IS NOT NULL
  ORDER BY po.actual_delivery_date DESC, po.order_number DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_supplier_sla_report(p_supplier_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(supplier_id uuid, supplier_name text, total_received integer, within_sla integer, over_sla integer, avg_delay_days numeric, compliance_pct numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- NOVO (20261130080000): suppliers.view_sla_report exigida ADICIONALMENTE
  -- a suppliers.view + purchase_orders.view (ambos mantidos).
  IF NOT public.has_anew_permission(auth.uid(), 'suppliers.view')
     OR NOT public.has_anew_permission(auth.uid(), 'suppliers.view_sla_report')
     OR NOT public.has_anew_permission(auth.uid(), 'purchase_orders.view') THEN
    RAISE EXCEPTION 'Sem permissão para ver o relatório de SLA de fornecedores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      s.id                 AS b_supplier_id,
      s.name                AS b_supplier_name,
      s.delivery_sla_days   AS b_sla_days
    FROM public.suppliers s
    WHERE s.deleted_at IS NULL
      AND s.organization_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'suppliers.view'))
      AND s.organization_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'suppliers.view_sla_report'))
      AND s.organization_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'purchase_orders.view'))
      AND (p_supplier_id IS NULL OR s.id = p_supplier_id)
  ),
  received AS (
    SELECT
      po.supplier_id           AS r_supplier_id,
      po.order_date             AS r_order_date,
      po.actual_delivery_date   AS r_actual_delivery_date
    FROM public.purchase_orders po
    WHERE po.deleted_at IS NULL
      AND po.status = 'received'
      AND po.actual_delivery_date IS NOT NULL
  )
  SELECT
    b.b_supplier_id   AS supplier_id,
    b.b_supplier_name AS supplier_name,
    COUNT(r.r_actual_delivery_date)::integer AS total_received,
    CASE WHEN b.b_sla_days IS NULL THEN NULL ELSE
      COUNT(*) FILTER (
        WHERE r.r_actual_delivery_date IS NOT NULL
          AND (r.r_actual_delivery_date - r.r_order_date) <= b.b_sla_days
      )::integer
    END AS within_sla,
    CASE WHEN b.b_sla_days IS NULL THEN NULL ELSE
      COUNT(*) FILTER (
        WHERE r.r_actual_delivery_date IS NOT NULL
          AND (r.r_actual_delivery_date - r.r_order_date) > b.b_sla_days
      )::integer
    END AS over_sla,
    CASE WHEN b.b_sla_days IS NULL THEN NULL ELSE
      ROUND(
        AVG(r.r_actual_delivery_date - r.r_order_date - b.b_sla_days) FILTER (
          WHERE r.r_actual_delivery_date IS NOT NULL
            AND (r.r_actual_delivery_date - r.r_order_date) > b.b_sla_days
        ),
        1
      )
    END AS avg_delay_days,
    CASE WHEN b.b_sla_days IS NULL OR COUNT(r.r_actual_delivery_date) = 0 THEN NULL ELSE
      ROUND(
        COUNT(*) FILTER (
          WHERE r.r_actual_delivery_date IS NOT NULL
            AND (r.r_actual_delivery_date - r.r_order_date) <= b.b_sla_days
        )::numeric
        / COUNT(r.r_actual_delivery_date) * 100
      )
    END AS compliance_pct
  FROM base b
  LEFT JOIN received r ON r.r_supplier_id = b.b_supplier_id
  GROUP BY b.b_supplier_id, b.b_supplier_name, b.b_sla_days
  ORDER BY b.b_supplier_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_po_supplier_status(p_po_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_po       public.purchase_orders := public.fn_po_crm_load(p_po_id, 'purchase_orders.view', false);
  v_link     public.supplier_account_links;
  v_pub      public.supplier_po_publications;
  v_users    integer := 0;
  v_rcv      boolean;
  v_active   boolean;
  v_approve  boolean := public.has_anew_permission_for_org(v_uid, 'purchase_orders.approve', v_po.organization_id);
  v_edit     boolean := public.has_anew_permission_for_org(v_uid, 'purchase_orders.edit', v_po.organization_id);
  v_emails   jsonb;
BEGIN
  SELECT l.* INTO v_link
  FROM public.supplier_account_links l
  JOIN public.supplier_accounts a ON a.id = l.supplier_account_id
  WHERE l.supplier_id = v_po.supplier_id AND l.organization_id = v_po.organization_id
    AND l.status = 'active' AND a.status = 'active'
  LIMIT 1;
  IF v_link.id IS NOT NULL THEN
    SELECT count(*) INTO v_users
    FROM public.supplier_portal_user_access x
    JOIN public.supplier_portal_users u ON u.id = x.portal_user_id
    WHERE x.link_id = v_link.id AND x.revoked_at IS NULL AND u.status = 'active';
  END IF;

  SELECT * INTO v_pub FROM public.supplier_po_publications WHERE purchase_order_id = v_po.id;
  v_active := v_pub.purchase_order_id IS NOT NULL AND v_pub.status <> 'withdrawn';
  v_rcv := EXISTS (SELECT 1 FROM public.purchase_order_items WHERE purchase_order_id = v_po.id AND received_quantity > 0);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'to_email', e.to_email, 'status', e.status, 'scheduled_for', e.scheduled_for,
           'sent_at', e.sent_at, 'error_message', e.error_message) ORDER BY e.created_at DESC), '[]'::jsonb)
  INTO v_emails
  FROM (
    SELECT * FROM public.scheduled_emails
    WHERE entity_type = 'purchase_orders' AND entity_id = v_po.id
      AND organization_id = v_po.organization_id
    ORDER BY created_at DESC
    LIMIT 10
  ) e;

  RETURN jsonb_build_object(
    'purchase_order_id', v_po.id,
    'order_status', v_po.status,
    'supplier_id', v_po.supplier_id,
    'expected_delivery', v_po.expected_delivery,
    'portal', jsonb_build_object('linked', v_link.id IS NOT NULL, 'link_id', v_link.id, 'active_users', v_users),
    'publication', CASE WHEN v_pub.purchase_order_id IS NULL THEN NULL ELSE jsonb_build_object(
        'status', v_pub.status,
        'revision', v_pub.revision,
        'sent_at', v_pub.sent_at,
        'sent_by', jsonb_build_object('id', v_pub.sent_by, 'name', (SELECT name FROM public.anew_users WHERE id = v_pub.sent_by)),
        'viewed_at', v_pub.viewed_at,
        'confirmed_at', v_pub.confirmed_at,
        'confirmed_by_name', (SELECT COALESCE(name, email) FROM public.supplier_portal_users WHERE id = v_pub.confirmed_by),
        'promised_date', v_pub.promised_date,
        'supplier_comment', v_pub.supplier_comment,
        'promised_date_accepted_at', v_pub.promised_date_accepted_at,
        'promised_date_accepted_by_name', (SELECT name FROM public.anew_users WHERE id = v_pub.promised_date_accepted_by),
        'withdrawn_at', v_pub.withdrawn_at,
        'withdrawn_by_name', (SELECT name FROM public.anew_users WHERE id = v_pub.withdrawn_by),
        'withdraw_reason', v_pub.withdraw_reason) END,
    'emails', v_emails,
    'can_send', v_approve AND v_po.supplier_id IS NOT NULL
                AND (v_po.status = 'pending' OR (v_po.status = 'ordered' AND NOT v_active AND v_link.id IS NOT NULL)),
    'can_withdraw', v_approve AND v_active AND v_pub.status <> 'confirmed' AND NOT v_rcv,
    'can_accept_date', v_edit AND v_active AND v_pub.status = 'confirmed' AND v_pub.promised_date IS NOT NULL
                       AND v_pub.promised_date IS DISTINCT FROM v_po.expected_delivery,
    'can_edit_lines', NOT v_active AND NOT v_rcv
  );
END;
$function$;

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
  -- 20270103610000: pedidos de serviços decidem-se com services.edit + services.manage_prices;
  -- os de produtos continuam com products.edit + products.manage_prices.
  v_prod_ok  boolean;
  v_svc_ok   boolean;
  v_bad_kind text;
BEGIN
  IF v_uid IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  v_prod_ok := public.has_anew_permission(v_uid, 'products.edit') AND public.has_anew_permission(v_uid, 'products.manage_prices');
  v_svc_ok := public.has_anew_permission(v_uid, 'services.edit') AND public.has_anew_permission(v_uid, 'services.manage_prices');
  IF NOT (v_prod_ok OR v_svc_ok) THEN
    IF NOT public.has_anew_permission(v_uid, 'products.edit') THEN
      RAISE EXCEPTION 'Sem permissão para esta operação (products.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
    END IF;
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

  -- Cada pedido com a permissão do seu tipo, antes de mudar o que quer que seja (o tipo é o da
  -- ligação; sem ligação, o do artigo do catálogo).
  SELECT CASE WHEN COALESCE(kx_is.item_type, CASE WHEN kx_ci.item_kind = 'servico' THEN 'service' ELSE 'product' END) = 'service'
              THEN 'services' ELSE 'products' END
  INTO v_bad_kind
  FROM public.supplier_price_change_requests kx_r
  LEFT JOIN public.item_suppliers kx_is ON kx_is.id = kx_r.item_supplier_id
  LEFT JOIN public.supplier_catalog_items kx_ci ON kx_ci.id = kx_r.catalog_item_id
  WHERE kx_r.id = ANY (v_ids)
    AND CASE WHEN COALESCE(kx_is.item_type, CASE WHEN kx_ci.item_kind = 'servico' THEN 'service' ELSE 'product' END) = 'service'
             THEN NOT (v_svc_ok
                       AND public.has_anew_permission_for_org(v_uid, 'services.edit', kx_r.organization_id)
                       AND public.has_anew_permission_for_org(v_uid, 'services.manage_prices', kx_r.organization_id))
             ELSE NOT (v_prod_ok
                       AND public.has_anew_permission_for_org(v_uid, 'products.edit', kx_r.organization_id)
                       AND public.has_anew_permission_for_org(v_uid, 'products.manage_prices', kx_r.organization_id)) END
  ORDER BY 1
  LIMIT 1;
  IF v_bad_kind IS NOT NULL THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (%.manage_prices)', v_bad_kind
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
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

CREATE OR REPLACE FUNCTION public.rpc_price_changes_list(p_supplier_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'pending'::text, p_product_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text := lower(COALESCE(NULLIF(btrim(p_status), ''), 'pending'));
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 100), 0), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_orgs   uuid[];
  v_counts jsonb;
  v_total  integer;
  v_items  jsonb;
  -- 20270103610000: ver preços de produtos como antes; quem só tem services.view_cost vê os de serviços.
  v_prod_pricing boolean;
  v_svc_pricing  boolean;
  v_prod_decide  boolean;
  v_svc_decide   boolean;
BEGIN
  IF v_uid IS NULL OR public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF v_status NOT IN ('pending', 'approved', 'rejected', 'superseded', 'decided', 'all') THEN
    RAISE EXCEPTION 'Estado inválido (pending, approved, rejected, superseded, decided, all)'
      USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF p_supplier_id IS NOT NULL THEN
    PERFORM public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  ELSIF NOT public.has_anew_permission(v_uid, 'suppliers.view') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (suppliers.view)'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  v_prod_pricing := public.has_anew_permission(v_uid, 'suppliers.view_pricing')
                    OR public.has_anew_permission(v_uid, 'products.view_cost');
  v_svc_pricing := v_prod_pricing OR public.has_anew_permission(v_uid, 'services.view_cost');
  IF NOT v_svc_pricing THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (suppliers.view_pricing)'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  v_prod_decide := public.has_anew_permission(v_uid, 'products.edit') AND public.has_anew_permission(v_uid, 'products.manage_prices');
  v_svc_decide := public.has_anew_permission(v_uid, 'services.edit') AND public.has_anew_permission(v_uid, 'services.manage_prices');

  v_orgs := ARRAY(SELECT public.get_user_visible_org_ids(v_uid));
  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY (v_orgs)) THEN
    RAISE EXCEPTION 'Empresa não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF p_product_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.products pr
       WHERE pr.id = p_product_id
         AND (pr.organization_id = ANY (v_orgs)
              OR EXISTS (SELECT 1 FROM public.product_organizations po
                         WHERE po.product_id = pr.id AND po.organization_id = ANY (v_orgs)))) THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  WITH sc AS (
    SELECT r.*,
           (COALESCE(ix.item_type, CASE WHEN cx.item_kind = 'servico' THEN 'service' ELSE 'product' END) = 'service') AS is_service
    FROM public.supplier_price_change_requests r
    LEFT JOIN public.item_suppliers ix ON ix.id = r.item_supplier_id
    LEFT JOIN public.supplier_catalog_items cx ON cx.id = r.catalog_item_id
    WHERE r.organization_id = ANY (v_orgs)
      AND (v_prod_pricing OR COALESCE(ix.item_type, CASE WHEN cx.item_kind = 'servico' THEN 'service' ELSE 'product' END) = 'service')
      AND r.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'suppliers.view'))
      AND (r.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'suppliers.view_pricing'))
           OR r.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.view_cost'))
           OR (COALESCE(ix.item_type, CASE WHEN cx.item_kind = 'servico' THEN 'service' ELSE 'product' END) = 'service'
               AND r.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.view_cost'))))
      AND (p_supplier_id IS NULL OR r.supplier_id = p_supplier_id)
      AND (p_product_id IS NULL OR r.product_id = p_product_id)
      AND (p_organization_id IS NULL OR r.organization_id = p_organization_id)
  ),
  f AS (
    SELECT sc.* FROM sc
    WHERE v_status = 'all' OR sc.status = v_status
       OR (v_status = 'decided' AND sc.status IN ('approved', 'rejected'))
  ),
  page AS (
    SELECT f.* FROM f
    ORDER BY f.requested_at DESC, f.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    (SELECT jsonb_build_object(
              'pending', count(*) FILTER (WHERE status = 'pending'),
              'approved', count(*) FILTER (WHERE status = 'approved'),
              'rejected', count(*) FILTER (WHERE status = 'rejected'),
              'superseded', count(*) FILTER (WHERE status = 'superseded'))
       FROM sc),
    (SELECT count(*) FROM f),
    (SELECT COALESCE(jsonb_agg(x.item ORDER BY x.requested_at DESC, x.id), '[]'::jsonb)
       FROM (
         SELECT pg.requested_at, pg.id,
                jsonb_build_object(
                  'id', pg.id,
                  'status', pg.status,
                  'is_service', pg.is_service,
                  'can_decide', CASE WHEN pg.is_service
                                THEN v_svc_decide AND public.has_anew_permission_for_org(v_uid, 'services.edit', pg.organization_id)
                                     AND public.has_anew_permission_for_org(v_uid, 'services.manage_prices', pg.organization_id)
                                ELSE v_prod_decide AND public.has_anew_permission_for_org(v_uid, 'products.edit', pg.organization_id)
                                     AND public.has_anew_permission_for_org(v_uid, 'products.manage_prices', pg.organization_id) END,
                  'organization_id', pg.organization_id,
                  'requested_at', pg.requested_at,
                  'batch_id', pg.batch_id,
                  'supplier', jsonb_build_object('id', s.id, 'name', s.name),
                  'catalog_item', jsonb_build_object(
                    'id', ci.id, 'supplier_ref', ci.supplier_ref, 'name', ci.name, 'is_active', ci.is_active,
                    'item_kind', ci.item_kind),
                  'item_supplier_id', pg.item_supplier_id,
                  'product', CASE WHEN pr.id IS NULL THEN NULL
                                  ELSE jsonb_build_object('id', pr.id, 'name', pr.name, 'sku', pr.sku) END,
                  -- 20270103600000: ligação a um serviço nosso
                  'service', CASE WHEN sv.id IS NULL THEN NULL
                                  ELSE jsonb_build_object('id', sv.id, 'name', sv.name, 'sku', sv.sku) END,
                  'purchase_uom', jsonb_build_object('id', isup.uom_id, 'code', um.code),
                  'is_preferred', COALESCE(isup.is_preferred AND isup.is_active, false),
                  'current_price', isup.purchase_price,
                  'current_currency', isup.currency,
                  'old_price', pg.old_price,
                  'new_price', pg.new_price,
                  'currency', pg.currency,
                  'catalog_old_price', pg.catalog_old_price,
                  'catalog_new_price', pg.catalog_new_price,
                  'diff', CASE WHEN isup.purchase_price IS NOT NULL THEN pg.new_price - isup.purchase_price END,
                  'diff_pct', CASE WHEN isup.purchase_price > 0
                                   THEN round((pg.new_price - isup.purchase_price) / isup.purchase_price * 100, 2) END,
                  'unit_changed', pg.unit_changed,
                  'old_unit_label', pg.old_unit_label,
                  'unit_label', pg.unit_label,
                  'old_units_per_pack', pg.old_units_per_pack,
                  'units_per_pack', pg.units_per_pack,
                  'stale', (isup.id IS NULL OR isup.deleted_at IS NOT NULL
                            OR isup.catalog_item_id IS DISTINCT FROM pg.catalog_item_id
                            OR isup.supplier_id IS DISTINCT FROM pg.supplier_id),
                  'already_applied', (isup.purchase_price IS NOT DISTINCT FROM pg.new_price
                                      AND isup.currency IS NOT DISTINCT FROM pg.currency),
                  'product_cost', CASE WHEN pg.status = 'pending'
                                       -- Preço do catálogo: o plano divide por N nas embalagens ligadas à unidade.
                                       THEN public.fn_price_change_cost_plan(pg.item_supplier_id, pg.organization_id,
                                                                             CASE WHEN pg.catalog_new_price IS NOT NULL
                                                                                   AND COALESCE(pg.units_per_pack, 1) > 1
                                                                                  THEN pg.catalog_new_price ELSE pg.new_price END,
                                                                             pg.currency) END,
                  'decided_at', pg.decided_at,
                  'decided_by', CASE WHEN du.id IS NULL THEN NULL
                                     ELSE jsonb_build_object('id', du.id, 'name', du.name) END,
                  'decision_note', pg.decision_note,
                  'superseded_at', pg.superseded_at,
                  'superseded_by', pg.superseded_by,
                  'result', pg.result
                ) AS item
         FROM page pg
         JOIN public.suppliers s ON s.id = pg.supplier_id
         JOIN public.supplier_catalog_items ci ON ci.id = pg.catalog_item_id
         LEFT JOIN public.item_suppliers isup ON isup.id = pg.item_supplier_id
         LEFT JOIN public.uom um ON um.id = isup.uom_id
         LEFT JOIN public.products pr ON pr.id = pg.product_id
         LEFT JOIN public.services sv ON sv.id = isup.service_id
         LEFT JOIN public.anew_users du ON du.id = pg.decided_by
       ) x)
  INTO v_counts, v_total, v_items;

  RETURN jsonb_build_object(
    'counts', v_counts,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items,
    'can_decide', v_prod_decide,
    'can_decide_services', v_svc_decide
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_register_supplier_return(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_item_supplier_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_result integer;
  v_doc    text;
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
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ao contrário de rpc_register_stock_entry, não exige is_active: devolver a
  -- um fornecedor que entretanto ficou inativo continua a ser uma operação
  -- válida (é o histórico da compra original que importa, não o estado atual).
  IF NOT EXISTS (
    SELECT 1 FROM public.item_suppliers
    WHERE id = p_item_supplier_id AND product_id = p_product_id AND organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Fornecedor não associado a este produto' USING ERRCODE = 'check_violation';
  END IF;

  v_doc := public.fn_next_stock_document_number(v_org, 'compra');

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, item_supplier_id, notes, created_by
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'devolucao_fornecedor', p_qty,
    v_doc, 'compra', p_item_supplier_id, p_notes, v_actor
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_item_supplier(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_before public.item_suppliers;
  v_perm   text;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.item_suppliers WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associação fornecedor/artigo não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_perm := CASE v_before.item_type WHEN 'product' THEN 'products.edit' ELSE 'services.edit' END;
  IF NOT public.has_anew_permission_for_org(auth.uid(), v_perm, v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar este fornecedor do artigo' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Associação já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.item_suppliers
  SET    deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'item_suppliers', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', NULL)
    ),
    'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_supplier(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_before public.suppliers;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.suppliers WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id IS NULL
     OR v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission_for_org(auth.uid(), 'suppliers.delete', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar fornecedores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Fornecedor já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.suppliers
  SET    deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'suppliers', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', NULL)
    ),
    'web_app', p_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_supplier_catalog_list(p_supplier_id uuid, p_filter text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_inactive boolean DEFAULT false, p_kind text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org     uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_uid     uuid := auth.uid();
  v_pricing boolean;
  v_filter  text := lower(COALESCE(NULLIF(btrim(p_filter), ''), 'all'));
  v_kind    text := NULLIF(lower(btrim(COALESCE(p_kind, ''))), '');
  v_limit   integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_offset  integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_q       text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_like    text;
  l         public.supplier_account_links;
  v_counts  jsonb;
  v_kinds   jsonb;
  v_total   integer;
  v_items   jsonb;
BEGIN
  IF v_filter NOT IN ('all', 'linked', 'unlinked', 'dismissed') THEN
    RAISE EXCEPTION 'Filtro inválido (all, linked, unlinked, dismissed)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_kind IS NOT NULL AND v_kind NOT IN ('produto', 'servico') THEN
    RAISE EXCEPTION 'Tipo inválido (produto, servico)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  v_pricing := public.has_anew_permission_for_org(v_uid, 'suppliers.view_pricing', v_org)
            OR public.has_anew_permission_for_org(v_uid, 'products.view_cost', v_org);

  SELECT * INTO l FROM public.supplier_account_links WHERE supplier_id = p_supplier_id AND status = 'active';
  IF l.id IS NULL THEN
    RETURN jsonb_build_object('linked_account', false, 'counts', jsonb_build_object('all', 0, 'linked', 0, 'unlinked', 0, 'dismissed', 0),
                              'kind_counts', jsonb_build_object('produto', 0, 'servico', 0),
                              'total', 0, 'limit', v_limit, 'offset', v_offset, 'items', '[]'::jsonb,
                              'can_link', false, 'can_link_services', false, 'can_view_pricing', v_pricing,
                              'can_manage_prices', public.has_anew_permission_for_org(v_uid, 'products.manage_prices', v_org),
                              'can_manage_service_prices', public.has_anew_permission_for_org(v_uid, 'services.manage_prices', v_org));
  END IF;

  IF v_q IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH f0 AS (
    SELECT ci.id, ci.supplier_ref, ci.item_kind,
           EXISTS (SELECT 1 FROM public.item_suppliers isup
                   WHERE isup.supplier_id = p_supplier_id AND isup.catalog_item_id = ci.id AND isup.deleted_at IS NULL) AS is_linked,
           EXISTS (SELECT 1 FROM public.supplier_catalog_dismissals d WHERE d.link_id = l.id AND d.catalog_item_id = ci.id) AS is_dismissed
    FROM public.supplier_catalog_items ci
    WHERE ci.supplier_account_id = l.supplier_account_id
      AND (COALESCE(p_include_inactive, false) OR ci.is_active)
      AND (v_like IS NULL OR ci.supplier_ref ILIKE v_like OR ci.name ILIKE v_like
           OR ci.barcode ILIKE v_like OR ci.brand ILIKE v_like)
  ),
  f AS (
    SELECT f0.* FROM f0 WHERE v_kind IS NULL OR f0.item_kind = v_kind
  ),
  fx AS (
    SELECT f.*,
           (v_filter = 'all'
            OR (v_filter = 'linked' AND f.is_linked)
            OR (v_filter = 'unlinked' AND NOT f.is_linked AND NOT f.is_dismissed)
            OR (v_filter = 'dismissed' AND f.is_dismissed AND NOT f.is_linked)) AS in_filter
    FROM f
  ),
  page AS (
    SELECT fx.id, fx.is_linked, fx.is_dismissed
    FROM fx WHERE fx.in_filter
    ORDER BY fx.supplier_ref, fx.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    (SELECT jsonb_build_object(
              'all', count(*),
              'linked', count(*) FILTER (WHERE is_linked),
              'unlinked', count(*) FILTER (WHERE NOT is_linked AND NOT is_dismissed),
              'dismissed', count(*) FILTER (WHERE is_dismissed AND NOT is_linked))
       FROM fx),
    -- Por tipo, no filtro de estado escolhido (para os botões Produtos/Serviços).
    (SELECT jsonb_build_object(
              'produto', count(*) FILTER (WHERE f0.item_kind = 'produto'),
              'servico', count(*) FILTER (WHERE f0.item_kind = 'servico'))
       FROM f0
       WHERE (v_filter = 'all'
              OR (v_filter = 'linked' AND f0.is_linked)
              OR (v_filter = 'unlinked' AND NOT f0.is_linked AND NOT f0.is_dismissed)
              OR (v_filter = 'dismissed' AND f0.is_dismissed AND NOT f0.is_linked))),
    (SELECT count(*) FROM fx WHERE in_filter),
    (SELECT COALESCE(jsonb_agg(
           public.fn_sp_catalog_item_json(ci, v_pricing)
           || jsonb_build_object(
                'is_linked', f.is_linked,
                'is_dismissed', f.is_dismissed,
                'links', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                           'item_supplier_id', isup.id,
                           'item_type', isup.item_type,
                           'product_id', p.id,
                           'product_name', COALESCE(p.name, sv.name),
                           'product_sku', COALESCE(p.sku, sv.sku),
                           'service_id', sv.id,
                           'service_name', sv.name,
                           'service_sku', sv.sku,
                           'uom_id', isup.uom_id,
                           'supplier_sku', isup.supplier_sku,
                           'purchase_price', CASE WHEN v_pricing THEN isup.purchase_price END,
                           'currency', isup.currency,
                           'is_preferred', isup.is_preferred) ORDER BY COALESCE(p.name, sv.name))
                  FROM public.item_suppliers isup
                  LEFT JOIN public.products p ON p.id = isup.product_id
                  LEFT JOIN public.services sv ON sv.id = isup.service_id
                  WHERE isup.supplier_id = p_supplier_id AND isup.catalog_item_id = ci.id AND isup.deleted_at IS NULL
                    AND (p.id IS NOT NULL OR sv.id IS NOT NULL)
                ), '[]'::jsonb))
           ORDER BY ci.supplier_ref, ci.id), '[]'::jsonb)
       FROM page f
       JOIN public.supplier_catalog_items ci ON ci.id = f.id)
  INTO v_counts, v_kinds, v_total, v_items;

  RETURN jsonb_build_object(
    'linked_account', true,
    'counts', v_counts,
    'kind_counts', v_kinds,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items,
    'can_link', public.has_anew_permission_for_org(v_uid, 'products.edit', v_org),
    'can_link_services', public.has_anew_permission_for_org(v_uid, 'services.edit', v_org),
    'can_view_pricing', v_pricing,
    'can_manage_prices', public.has_anew_permission_for_org(v_uid, 'products.manage_prices', v_org),
    'can_manage_service_prices', public.has_anew_permission_for_org(v_uid, 'services.manage_prices', v_org)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_supplier_portal_invite_prepare(p_caller_auth_uid uuid, p_organization_id uuid, p_supplier_id uuid, p_email text, p_name text DEFAULT NULL::text, p_check_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller   uuid;
  v_email    text := lower(btrim(COALESCE(p_email, '')));
  v_name     text := NULLIF(left(btrim(regexp_replace(COALESCE(p_name, ''), '[\x01-\x1F\x7F]', '', 'g')), 200), '');
  s          record;
  v_key      text;
  v_auth     uuid;
  v_anew     public.anew_users;
  v_kind     text;
  a          public.supplier_accounts;
  l          public.supplier_account_links;
  pu         public.supplier_portal_users;
  v_new_user boolean := false;
  v_may_temp boolean := false;
  v_org_name text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Só disponível para o servidor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT u.id INTO v_caller FROM public.anew_users u
  WHERE u.auth_user_id = p_caller_auth_uid AND u.status = 'active' AND u.deleted_at IS NULL;
  IF v_caller IS NULL
     OR p_organization_id IS NULL
     OR p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(p_caller_auth_uid))
     OR NOT public.has_anew_permission_for_org(p_caller_auth_uid, 'suppliers.portal_manage', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para gerir o acesso dos fornecedores ao portal'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT id, name, tax_id, vat_number, organization_id, primary_contact_name INTO s
  FROM public.suppliers
  WHERE id = p_supplier_id AND organization_id = p_organization_id AND deleted_at IS NULL
  FOR UPDATE;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  v_key := public.fn_nif_key(COALESCE(NULLIF(btrim(s.tax_id), ''), NULLIF(btrim(s.vat_number), '')));
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'O NIF do fornecedor é inválido ou está vazio. Para fornecedores estrangeiros use o prefixo do país (ex.: ESB12345678).'
      USING ERRCODE = 'check_violation', HINT = 'invalid_nif';
  END IF;

  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 320 THEN
    RAISE EXCEPTION 'Email inválido' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  SELECT id INTO v_auth FROM auth.users WHERE lower(email) = v_email ORDER BY created_at LIMIT 1;

  -- Perfil do CRM/portal do cliente com este email que não é desta conta Auth
  -- (ou não tem conta) → recusado.
  IF EXISTS (SELECT 1 FROM public.anew_users
             WHERE lower(email) = v_email AND auth_user_id IS DISTINCT FROM v_auth) THEN
    RAISE EXCEPTION 'Este email não pode ser usado no portal do fornecedor. Indique outro email.'
      USING ERRCODE = 'check_violation', HINT = 'email_not_allowed';
  END IF;

  IF v_auth IS NOT NULL THEN
    SELECT * INTO v_anew FROM public.anew_users WHERE auth_user_id = v_auth;
    IF v_anew.id IS NOT NULL THEN
      -- (i) interna → recusada. (ii) só-cliente → aceite ('client_existing').
      -- Só-cliente: perfil ativo, ≥ 1 membership ativa e todas de cliente,
      -- acesso dado ao portal do cliente, email confirmado. Zero memberships
      -- ativas = registo próprio / onboarding do CRM → interna.
      IF v_anew.status <> 'active' OR v_anew.deleted_at IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.anew_memberships m
                    WHERE m.user_id = v_anew.id AND m.status = 'active' AND m.role_is_client IS NOT TRUE)
         OR NOT EXISTS (SELECT 1 FROM public.anew_memberships m
                        WHERE m.user_id = v_anew.id AND m.status = 'active' AND m.role_is_client IS TRUE)
         OR NOT EXISTS (SELECT 1 FROM public.client_portal_users c WHERE c.auth_user_id = v_auth)
         OR NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = v_auth AND au.email_confirmed_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Este email não pode ser usado no portal do fornecedor. Indique outro email.'
          USING ERRCODE = 'check_violation', HINT = 'email_not_allowed';
      END IF;
      v_kind := 'client_existing';
    ELSE
      -- (iii) sem perfil: acesso ao portal do cliente sem perfil é um estado
      -- inválido (legado) → recusado, como antes.
      IF EXISTS (SELECT 1 FROM public.client_portal_users WHERE auth_user_id = v_auth) THEN
        RAISE EXCEPTION 'Este email não pode ser usado no portal do fornecedor. Indique outro email.'
          USING ERRCODE = 'check_violation', HINT = 'email_not_allowed';
      END IF;
      v_kind := 'supplier';
    END IF;

    -- Já é utilizador do portal de OUTRO fornecedor (ou suspenso) → recusado.
    IF EXISTS (SELECT 1 FROM public.supplier_portal_users x
               JOIN public.supplier_accounts xa ON xa.id = x.supplier_account_id
               WHERE x.auth_user_id = v_auth AND (xa.nif_key <> v_key OR x.status <> 'active')) THEN
      RAISE EXCEPTION 'Este email não pode ser usado no portal do fornecedor. Indique outro email.'
        USING ERRCODE = 'check_violation', HINT = 'email_not_allowed';
    END IF;
  END IF;

  -- F3.1 (convite seguro): uma conta Auth SEM perfil que ainda NÃO é
  -- utilizador do portal só é aproveitada se foi criada pelo servidor para o
  -- portal do fornecedor (app_metadata.supplier_portal = true — o utilizador
  -- não altera app_metadata) e nunca iniciou sessão. Fecha o caso de uma
  -- conta registada por terceiros com o mesmo email (e
  -- user_metadata.admin_created='true', que faz handle_new_user saltá-la)
  -- ser ligada ao fornecedor. Contas já ligadas (têm supplier_portal_users)
  -- não passam por aqui — podem já ter iniciado sessão com a password
  -- temporária. Contas 'client_existing' foram verificadas acima.
  IF v_kind = 'supplier'
     AND NOT EXISTS (SELECT 1 FROM public.supplier_portal_users x WHERE x.auth_user_id = v_auth)
     AND EXISTS (SELECT 1 FROM auth.users au
                 WHERE au.id = v_auth
                   AND (au.raw_app_meta_data->>'supplier_portal' IS DISTINCT FROM 'true'
                        OR au.last_sign_in_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Este email não pode ser usado no portal do fornecedor. Indique outro email.'
      USING ERRCODE = 'check_violation', HINT = 'email_not_allowed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.supplier_accounts WHERE nif_key = v_key AND status <> 'active') THEN
    RAISE EXCEPTION 'Não foi possível enviar o convite para este fornecedor. Contacte o suporte.'
      USING ERRCODE = 'check_violation', HINT = 'account_unavailable';
  END IF;

  -- Já ligado a outra conta (NIF mudou fora do gatilho)? Pede para desligar.
  IF EXISTS (SELECT 1 FROM public.supplier_account_links sl JOIN public.supplier_accounts sa ON sa.id = sl.supplier_account_id
             WHERE sl.supplier_id = s.id AND sl.status = 'active' AND sa.nif_key <> v_key) THEN
    RAISE EXCEPTION 'Este fornecedor está ligado ao portal com outro NIF. Desligue o portal e volte a convidar.'
      USING ERRCODE = 'check_violation', HINT = 'conflict';
  END IF;

  IF COALESCE(p_check_only, false) THEN
    RETURN jsonb_build_object('ok', true, 'auth_user_exists', v_auth IS NOT NULL, 'account_kind', v_kind);
  END IF;

  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'A conta de acesso ainda não existe' USING ERRCODE = 'no_data_found', HINT = 'auth_user_missing';
  END IF;

  PERFORM set_config('app.audit_user_id', v_caller::text, true);
  PERFORM set_config('app.audit_source', 'supplier_portal_invite', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('supplier_account:' || v_key, 0));

  -- Conta
  INSERT INTO public.supplier_accounts (nif_key, display_name, created_by_org_id)
  VALUES (v_key, left(btrim(s.name), 200), p_organization_id)
  ON CONFLICT (nif_key) DO NOTHING;
  SELECT * INTO a FROM public.supplier_accounts WHERE nif_key = v_key FOR UPDATE;

  -- Ligação
  SELECT * INTO l FROM public.supplier_account_links
  WHERE supplier_id = s.id AND supplier_account_id = a.id FOR UPDATE;
  IF l.id IS NULL THEN
    INSERT INTO public.supplier_account_links (supplier_account_id, organization_id, supplier_id, invited_by)
    VALUES (a.id, p_organization_id, s.id, v_caller)
    RETURNING * INTO l;
  ELSIF l.status <> 'active' THEN
    UPDATE public.supplier_account_links
       SET status = 'active', revoked_at = NULL, revoked_by = NULL, invited_by = v_caller,
           organization_id = p_organization_id, updated_at = now()
     WHERE id = l.id
    RETURNING * INTO l;
  END IF;

  -- Utilizador do portal
  SELECT * INTO pu FROM public.supplier_portal_users WHERE auth_user_id = v_auth FOR UPDATE;
  IF pu.id IS NULL THEN
    -- Cliente existente: já tem password própria (a do portal do cliente)
    -- → marcada como definida (sem modal de 1.º acesso no portal do
    -- fornecedor).
    -- O gatilho trg_supplier_portal_users_00_block_internal volta a verificar
    -- (sob lock) que a conta não é interna.
    INSERT INTO public.supplier_portal_users (supplier_account_id, auth_user_id, email, name, role, created_by_org_id, invited_by,
                                              first_login, password_changed_at)
    VALUES (a.id, v_auth, v_email, COALESCE(v_name, NULLIF(btrim(s.primary_contact_name), ''), left(btrim(s.name), 200)),
            CASE WHEN EXISTS (SELECT 1 FROM public.supplier_portal_users
                              WHERE supplier_account_id = a.id AND role = 'owner' AND status = 'active')
                 THEN 'member' ELSE 'owner' END,
            p_organization_id, v_caller,
            v_kind IS DISTINCT FROM 'client_existing',
            CASE WHEN v_kind = 'client_existing' THEN now() END)
    RETURNING * INTO pu;
    v_new_user := true;
  END IF;

  -- Password temporária só numa conta de fornecedor criada para o convite,
  -- ligada agora, que nunca iniciou sessão.
  v_may_temp := v_new_user AND v_kind = 'supplier'
                AND EXISTS (SELECT 1 FROM auth.users au
                            WHERE au.id = v_auth
                              AND au.raw_app_meta_data->>'supplier_portal' = 'true'
                              AND au.last_sign_in_at IS NULL);

  -- Acesso desta empresa
  INSERT INTO public.supplier_portal_user_access AS x (portal_user_id, link_id, organization_id, granted_by)
  VALUES (pu.id, l.id, p_organization_id, v_caller)
  ON CONFLICT (portal_user_id, link_id) DO UPDATE
    SET revoked_at = NULL, revoked_by = NULL, granted_by = EXCLUDED.granted_by, granted_at = now(),
        organization_id = EXCLUDED.organization_id
    WHERE x.revoked_at IS NOT NULL;

  SELECT name INTO v_org_name FROM public.anew_organizations WHERE id = p_organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'portal_user_id', pu.id,
    'link_id', l.id,
    'auth_user_id', v_auth,
    'email', pu.email,
    'user_name', pu.name,
    'is_new_user', v_new_user,
    'password_set', pu.password_changed_at IS NOT NULL,
    'account_kind', v_kind,
    'may_set_temp_password', v_may_temp,
    'organization_name', v_org_name,
    'supplier_name', s.name
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_supplier_portal_profile_status(p_organization_id uuid)
 RETURNS TABLE(supplier_id uuid, portal_status text, awaiting_profile boolean, account_status text, catalog_unlinked integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_can_catalog boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR NOT COALESCE(public.has_anew_permission_for_org(v_uid, 'suppliers.view', p_organization_id), false) THEN
    RAISE EXCEPTION 'Sem permissão para ver os fornecedores desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Mesma condição de rpc_inventory_today.catalog_unlinked
  -- (fn_sp_crm_supplier_org exige perfil do CRM).
  v_can_catalog := public.current_business_user_id() IS NOT NULL;

  RETURN QUERY
  WITH s AS (
    SELECT sp.id AS s_id
    FROM public.suppliers sp
    WHERE sp.organization_id = p_organization_id
      AND sp.deleted_at IS NULL
  ),
  al AS (
    -- Ligação ativa (no máximo uma por fornecedor).
    SELECT l.id                  AS al_link_id,
           l.supplier_id         AS al_supplier_id,
           l.supplier_account_id AS al_account_id,
           l.organization_id     AS al_org_id,
           a.status              AS al_account_status
    FROM public.supplier_account_links l
    JOIN s ON s.s_id = l.supplier_id
    LEFT JOIN public.supplier_accounts a ON a.id = l.supplier_account_id
    WHERE l.status = 'active'
  ),
  anyl AS (
    SELECT DISTINCT l.supplier_id AS any_supplier_id
    FROM public.supplier_account_links l
    JOIN s ON s.s_id = l.supplier_id
  ),
  aw AS (
    -- Regra de rpc_inventory_today.suppliers.awaiting_profile.
    SELECT al.al_supplier_id AS aw_supplier_id,
           (al.al_org_id = p_organization_id
            AND al.al_account_status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM public.supplier_portal_users u
               WHERE u.supplier_account_id = al.al_account_id
                 AND u.role = 'owner'
                 AND u.status = 'active'
                 AND u.profile_confirmed_at IS NOT NULL
            )) AS aw_awaiting
    FROM al
  ),
  cat AS (
    -- Fila "por ligar" de rpc_supplier_catalog_list (counts.unlinked).
    SELECT al.al_supplier_id AS cat_supplier_id, count(*)::integer AS cat_unlinked
    FROM al
    JOIN public.supplier_catalog_items ci
      ON ci.supplier_account_id = al.al_account_id AND ci.is_active
    WHERE v_can_catalog
      AND NOT EXISTS (SELECT 1 FROM public.item_suppliers isup
                       WHERE isup.supplier_id = al.al_supplier_id
                         AND isup.catalog_item_id = ci.id
                         AND isup.deleted_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM public.supplier_catalog_dismissals d
                       WHERE d.link_id = al.al_link_id
                         AND d.catalog_item_id = ci.id)
    GROUP BY al.al_supplier_id
  )
  SELECT
    s.s_id,
    CASE
      WHEN al.al_link_id IS NOT NULL AND COALESCE(aw.aw_awaiting, false) THEN 'invited_awaiting'
      WHEN al.al_link_id IS NOT NULL THEN 'active'
      WHEN anyl.any_supplier_id IS NOT NULL THEN 'revoked'
      ELSE 'none'
    END::text,
    COALESCE(aw.aw_awaiting, false),
    al.al_account_status::text,
    CASE WHEN v_can_catalog THEN COALESCE(cat.cat_unlinked, 0) END
  FROM s
  LEFT JOIN al   ON al.al_supplier_id = s.s_id
  LEFT JOIN aw   ON aw.aw_supplier_id = s.s_id
  LEFT JOIN anyl ON anyl.any_supplier_id = s.s_id
  LEFT JOIN cat  ON cat.cat_supplier_id = s.s_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_supplier_portal_resend_prepare(p_caller_auth_uid uuid, p_organization_id uuid, p_supplier_id uuid, p_portal_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller   uuid;
  r          record;
  v_org_name text;
  v_kind     text;
  v_may_temp boolean;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Só disponível para o servidor' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT u.id INTO v_caller FROM public.anew_users u
  WHERE u.auth_user_id = p_caller_auth_uid AND u.status = 'active' AND u.deleted_at IS NULL;
  IF v_caller IS NULL
     OR p_organization_id IS NULL
     OR p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(p_caller_auth_uid))
     OR NOT public.has_anew_permission_for_org(p_caller_auth_uid, 'suppliers.portal_manage', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para gerir o acesso dos fornecedores ao portal'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT pu.id, pu.email, pu.name, pu.auth_user_id, pu.password_changed_at, s.name AS supplier_name
  INTO r
  FROM public.supplier_portal_user_access x
  JOIN public.supplier_account_links l ON l.id = x.link_id
  JOIN public.supplier_portal_users pu ON pu.id = x.portal_user_id
  JOIN public.supplier_accounts a ON a.id = l.supplier_account_id
  JOIN public.suppliers s ON s.id = l.supplier_id
  WHERE l.supplier_id = p_supplier_id AND l.organization_id = p_organization_id
    AND l.status = 'active' AND x.revoked_at IS NULL AND x.portal_user_id = p_portal_user_id
    AND pu.status = 'active' AND a.status = 'active' AND s.deleted_at IS NULL;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Utilizador do portal não encontrado neste fornecedor' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  -- Conta que também é cliente (tem perfil): a password é a do portal do
  -- cliente — nunca reposta daqui.
  v_kind := CASE WHEN EXISTS (SELECT 1 FROM public.anew_users WHERE auth_user_id = r.auth_user_id)
                 THEN 'client_existing' ELSE 'supplier' END;
  -- Nova password temporária só se ainda não definiu a sua e a conta foi
  -- criada pelo convite do portal do fornecedor.
  v_may_temp := v_kind = 'supplier' AND r.password_changed_at IS NULL
                AND EXISTS (SELECT 1 FROM auth.users au
                            WHERE au.id = r.auth_user_id
                              AND au.raw_app_meta_data->>'supplier_portal' = 'true');

  SELECT name INTO v_org_name FROM public.anew_organizations WHERE id = p_organization_id;

  RETURN jsonb_build_object(
    'ok', true,
    'portal_user_id', r.id,
    'auth_user_id', r.auth_user_id,
    'email', r.email,
    'user_name', r.name,
    'password_set', r.password_changed_at IS NOT NULL,
    'account_kind', v_kind,
    'may_set_temp_password', v_may_temp,
    'organization_name', v_org_name,
    'supplier_name', r.supplier_name
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_supplier_portal_status(p_supplier_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org   uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  s       record;
  l       public.supplier_account_links;
  v_key   text;
  v_users jsonb := '[]'::jsonb;
  v_items integer;
BEGIN
  SELECT id, name, tax_id, vat_number, email INTO s FROM public.suppliers WHERE id = p_supplier_id;
  v_key := public.fn_nif_key(COALESCE(NULLIF(btrim(s.tax_id), ''), NULLIF(btrim(s.vat_number), '')));

  SELECT * INTO l FROM public.supplier_account_links
  WHERE supplier_id = p_supplier_id
  ORDER BY (status = 'active') DESC, created_at DESC
  LIMIT 1;

  IF l.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'portal_user_id', pu.id,
             'email', pu.email,
             'name', pu.name,
             'access_status', CASE WHEN x.revoked_at IS NULL AND pu.status = 'active' THEN 'active' ELSE 'revoked' END,
             'granted_at', x.granted_at,
             'revoked_at', x.revoked_at,
             'password_set', pu.password_changed_at IS NOT NULL,
             'last_login_at', pu.last_login_at
           ) ORDER BY x.granted_at), '[]'::jsonb)
    INTO v_users
    FROM public.supplier_portal_user_access x
    JOIN public.supplier_portal_users pu ON pu.id = x.portal_user_id
    WHERE x.link_id = l.id;
  END IF;

  IF l.status = 'active' THEN
    SELECT count(*) INTO v_items FROM public.supplier_catalog_items
    WHERE supplier_account_id = l.supplier_account_id AND is_active;
  END IF;

  RETURN jsonb_build_object(
    'supplier_id', p_supplier_id,
    'nif', COALESCE(NULLIF(btrim(s.tax_id), ''), NULLIF(btrim(s.vat_number), '')),
    'nif_valid', v_key IS NOT NULL,
    'nif_key', v_key,
    'supplier_email', s.email,
    'portal_status', CASE WHEN l.id IS NULL THEN 'not_invited' WHEN l.status = 'active' THEN 'active' ELSE 'revoked' END,
    'link_id', l.id,
    'linked_at', l.created_at,
    'revoked_at', l.revoked_at,
    'users', v_users,
    'catalog_active_items', v_items,
    'can_manage', public.has_anew_permission_for_org(auth.uid(), 'suppliers.portal_manage', v_org)
  );
END;
$function$;
