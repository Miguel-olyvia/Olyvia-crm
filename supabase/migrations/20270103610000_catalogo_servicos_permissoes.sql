-- Contrato de Fornecedor — Fase 5b: nos artigos do catálogo do tipo serviço, decidir preços,
-- desligar e dispensar exigem as permissões de serviços (services.edit; services.manage_prices
-- para preços). Nos produtos fica tudo como estava (products.edit / products.manage_prices).
-- O tipo de um pedido/ligação é o da ligação (item_suppliers.item_type); sem ligação, o do artigo.
-- Mesmo padrão de verificação (has_anew_permission, fn_sp_crm_supplier_org, orgs visíveis).
-- Funções a partir do pg_get_functiondef() vivo na BD RH (02/11/2026).

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
  v_p_edit boolean := public.has_anew_permission(auth.uid(), 'products.edit');
  v_s_edit boolean := public.has_anew_permission(auth.uid(), 'services.edit');
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
  v_p_edit boolean := public.has_anew_permission(auth.uid(), 'products.edit');
  v_s_edit boolean := public.has_anew_permission(auth.uid(), 'services.edit');
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
             THEN NOT v_svc_ok ELSE NOT v_prod_ok END
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
                  'can_decide', CASE WHEN pg.is_service THEN v_svc_decide ELSE v_prod_decide END,
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

NOTIFY pgrst, 'reload schema';
