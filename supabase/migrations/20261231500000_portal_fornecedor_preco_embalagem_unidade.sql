-- ============================================================
-- 20261231500000_portal_fornecedor_preco_embalagem_unidade  (base RH)
-- ============================================================
-- Portal do Fornecedor — preço de embalagem numa ligação à unidade.
--
-- O modelo de packs (uom com base_uom_id/conversion_factor,
-- fn_uom_get_or_create_pack) NÃO está aplicado na BD. Quando um artigo do
-- catálogo vem em embalagem (supplier_catalog_items.units_per_pack = N > 1)
-- a ligação item_suppliers fica à unidade do produto (uom_id NULL ou = unidade
-- do produto) e fn_uom_units_per dá 1. Resultado (confirmado na RH): aceitar
-- 987 654 € num artigo "un × 34" pôs o custo do produto a 987 654 €/unidade
-- (devia 29 048,65) e item_suppliers.purchase_price 34× acima.
--
-- Regra nova: ligação à unidade do produto (fn_uom_units_per(uom_id, produto)
-- = 1) a um artigo com units_per_pack N > 1 → o preço do catálogo é de uma
-- embalagem de N; preço por unidade = round(preço / N, 2). N tem de ser
-- inteiro (e caber em integer); se não for, não se converte nada: o custo não
-- muda (reason 'pack_not_integer') e o pedido não é aceite.
--
-- Semântica dos valores (fica coerente em todo o lado):
--   • supplier_price_change_requests.catalog_new_price = preço do catálogo
--     (embalagem); new_price = preço a gravar na ligação (item_suppliers),
--     já dividido nestas ligações. old_price/current_price comparam com ele.
--   • fn_price_change_cost_plan recebe o PREÇO DO CATÁLOGO e divide por N.
--
-- O que muda (CREATE OR REPLACE a partir da definição viva na RH, 26/10/2026;
-- assinaturas, SECURITY DEFINER, search_path, grants e verificações de
-- permissão iguais):
--   1. fn_price_change_cost_plan: deteta a embalagem do artigo ligado
--      (isup.catalog_item_id) — units_per_purchase_uom = N, new_unit_cost =
--      preço / N; chaves novas no retorno: catalog_units_per_pack,
--      catalog_pack_units, catalog_pack_not_integer; reason nova
--      'pack_not_integer'.
--   2. rpc_price_changes_decide: grava na ligação o preço por unidade (÷N) e
--      passa ao custo do produto o preço do catálogo (o plano divide uma vez).
--      Embalagem não inteira → pedido não decidido (skipped,
--      reason 'pack_not_integer'). Histórico/auditoria como antes.
--   3. rpc_catalog_link: com "usar o preço do catálogo" nestas ligações grava
--      purchase_price = round(base_price / N, 2) e o custo do produto (via
--      fn_apply_product_cost_from_supplier) = esse valor unitário. Embalagem
--      não inteira → a ligação fica sem preço (ou mantém o que tinha).
--   4. fn_supplier_catalog_price_change_requests (gatilho): new_price já
--      dividido nestas ligações; a comparação "não criar pedido se igual ao
--      atual" passa a comparar unidade com unidade (antes comparava o preço da
--      embalagem com o unitário da ligação → criava pedidos sempre).
--   5. rpc_price_changes_list: o plano do "custo do produto" recebe o preço do
--      catálogo (catalog_new_price), como o decide.
-- fn_apply_product_cost_from_supplier NÃO muda: aplica o new_unit_cost do
-- plano, que agora já vem dividido.
--
-- SÓ RH. Não aplicar na base principal.
-- Aplicada na RH a 26/10/2026 (supabase db query, numa transação; não
-- registada em schema_migrations). Versão 20261231500000 porque 20261231300000
-- e 20261231400000 já estão registadas na RH por outra sessão.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. fn_price_change_cost_plan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_price_change_cost_plan(p_item_supplier_id uuid, p_organization_id uuid, p_new_price numeric, p_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  isup       public.item_suppliers;
  p          record;
  v_factor   integer;
  v_unit     numeric;
  v_cur      numeric;
  v_cur_ccy  text;
  v_sale     numeric;
  v_reason   text;
  v_msg      text;
  v_pref     text;
  v_same_ccy boolean;
  v_any_rows boolean;
  v_upp      numeric;           -- units_per_pack do artigo do catálogo ligado
  v_pack     integer;           -- N quando o preço do catálogo é de embalagem de N
  v_pack_bad boolean := false;  -- embalagem > 1 mas N não inteiro: não converter
BEGIN
  SELECT * INTO isup FROM public.item_suppliers WHERE id = p_item_supplier_id;
  IF isup.id IS NULL OR isup.product_id IS NULL THEN
    RETURN jsonb_build_object('will_update', false, 'reason', 'not_product',
                              'message', 'Esta ligação não é de um produto: o custo não muda');
  END IF;

  SELECT pr.id, pr.organization_id, pr.deleted_at, pr.is_deleted INTO p
  FROM public.products pr WHERE pr.id = isup.product_id;

  SELECT pp.price, pp.currency::text INTO v_cur, v_cur_ccy
  FROM public.product_prices pp
  WHERE pp.product_id = isup.product_id AND pp.price_type = 'purchase'
  ORDER BY (pp.currency::text = p_currency) DESC, pp.updated_at DESC, pp.created_at DESC
  LIMIT 1;

  SELECT pp.price INTO v_sale
  FROM public.product_prices pp
  WHERE pp.product_id = isup.product_id AND pp.price_type = 'retail' AND pp.currency::text = p_currency
  ORDER BY pp.updated_at DESC, pp.created_at DESC
  LIMIT 1;

  BEGIN
    v_factor := public.fn_uom_units_per(isup.uom_id, isup.product_id);
  EXCEPTION WHEN OTHERS THEN
    v_factor := NULL;
  END;

  -- Ligação à unidade do produto a um artigo vendido em embalagem de N: o
  -- preço do catálogo (p_new_price) é da embalagem → por unidade = ÷ N.
  IF v_factor = 1 AND isup.catalog_item_id IS NOT NULL THEN
    SELECT ci.units_per_pack INTO v_upp
    FROM public.supplier_catalog_items ci WHERE ci.id = isup.catalog_item_id;
    IF v_upp > 1 THEN
      IF v_upp = trunc(v_upp) AND v_upp <= 2147483647 THEN
        v_pack := v_upp::integer;
        v_factor := v_pack;
      ELSE
        v_pack_bad := true;
        v_factor := NULL;
      END IF;
    END IF;
  END IF;

  IF v_factor IS NOT NULL AND v_factor > 0 AND p_new_price IS NOT NULL THEN
    v_unit := round(p_new_price / v_factor, 2);
  END IF;

  v_same_ccy := EXISTS (SELECT 1 FROM public.product_prices
                        WHERE product_id = isup.product_id AND price_type = 'purchase' AND currency::text = p_currency);
  v_any_rows := EXISTS (SELECT 1 FROM public.product_prices
                        WHERE product_id = isup.product_id AND price_type = 'purchase');

  IF p.id IS NULL OR p.deleted_at IS NOT NULL OR p.is_deleted THEN
    v_reason := 'product_deleted';
    v_msg := 'O produto foi apagado: só o preço do fornecedor foi atualizado';
  ELSIF p.organization_id IS DISTINCT FROM p_organization_id THEN
    v_reason := 'other_primary_company';
    v_msg := 'O custo do produto só muda na empresa principal do produto: só o preço deste fornecedor foi atualizado';
  ELSIF NOT (isup.is_preferred AND isup.is_active AND isup.deleted_at IS NULL) THEN
    SELECT s.name INTO v_pref
    FROM public.item_suppliers i JOIN public.suppliers s ON s.id = i.supplier_id
    WHERE i.product_id = isup.product_id AND i.is_preferred AND i.deleted_at IS NULL
    LIMIT 1;
    v_reason := 'not_preferred';
    v_msg := CASE WHEN v_pref IS NULL
                  THEN 'Este fornecedor não é o preferencial do produto: só o preço deste fornecedor foi atualizado'
                  ELSE format('O custo do produto vem do fornecedor preferencial (%s): só o preço deste fornecedor foi atualizado', v_pref) END;
  ELSIF v_pack_bad THEN
    v_reason := 'pack_not_integer';
    v_msg := format('O fornecedor vende este artigo em embalagens de %s unidades (não inteiro): não é possível passar o preço para a unidade, o custo do produto não mudou', trim_scale(v_upp));
  ELSIF v_factor IS NULL THEN
    v_reason := 'uom_incompatible';
    v_msg := 'A unidade de compra desta ligação não é compatível com a unidade do produto: o custo do produto não mudou';
  ELSIF p_new_price IS NULL OR v_unit <= 0 THEN
    v_reason := 'zero_price';
    v_msg := 'O custo unitário daria 0: o custo do produto não mudou';
  ELSIF v_unit >= 100000000 THEN
    v_reason := 'out_of_range';
    v_msg := 'O custo unitário é demasiado alto para a ficha do produto: o custo do produto não mudou';
  ELSIF v_any_rows AND NOT v_same_ccy THEN
    v_reason := 'currency_mismatch';
    v_msg := format('O custo do produto está noutra moeda (%s): o custo do produto não mudou', v_cur_ccy);
  ELSIF NOT v_any_rows AND NOT EXISTS (SELECT 1 FROM pg_enum
                                       WHERE enumtypid = 'public.currency_code'::regtype AND enumlabel = p_currency) THEN
    v_reason := 'currency_unsupported';
    v_msg := format('A moeda %s não é suportada no custo do produto: o custo do produto não mudou', p_currency);
  END IF;

  RETURN jsonb_build_object(
    'will_update', v_reason IS NULL,
    'reason', v_reason,
    'message', v_msg,
    'is_preferred', (isup.is_preferred AND isup.is_active AND isup.deleted_at IS NULL),
    'preferred_supplier_name', v_pref,
    'units_per_purchase_uom', v_factor,
    'catalog_units_per_pack', v_upp,
    'catalog_pack_units', v_pack,
    'catalog_pack_not_integer', v_pack_bad,
    'new_unit_cost', v_unit,
    'current_unit_cost', v_cur,
    'current_cost_currency', v_cur_ccy,
    'sale_price', v_sale,
    'margin_current_pct', CASE WHEN v_sale > 0 AND v_cur IS NOT NULL AND v_cur_ccy = p_currency
                               THEN round((v_sale - v_cur) / v_sale * 100, 2) END,
    'margin_new_pct', CASE WHEN v_sale > 0 AND v_unit IS NOT NULL
                           THEN round((v_sale - v_unit) / v_sale * 100, 2) END
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. rpc_price_changes_decide
-- ---------------------------------------------------------------------------
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

    -- Preço do fornecedor (histórico pelo gatilho existente).
    v_is_upd := isup.purchase_price IS DISTINCT FROM v_link_price OR isup.currency IS DISTINCT FROM r.currency;
    IF v_is_upd THEN
      UPDATE public.item_suppliers
         SET purchase_price = v_link_price, currency = r.currency, updated_at = now()
       WHERE id = isup.id;
      v_items_upd := v_items_upd + 1;
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

-- ---------------------------------------------------------------------------
-- 3. rpc_catalog_link
-- ---------------------------------------------------------------------------
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
      currency, moq, lead_time_days, is_preferred, is_active, created_by, catalog_item_id
    ) VALUES (
      v_org, 'product', p.id, p_supplier_id, p_uom_id, ci.supplier_ref,
      CASE WHEN v_use_price THEN v_link_price END, ci.currency, ci.moq, ci.lead_time_days,
      v_pref, true, v_actor, ci.id
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

-- ---------------------------------------------------------------------------
-- 4. fn_supplier_catalog_price_change_requests
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_supplier_catalog_price_change_requests()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sci_new n JOIN sci_old o ON o.id = n.id
    WHERE n.base_price IS DISTINCT FROM o.base_price
       OR n.currency IS DISTINCT FROM o.currency
       OR n.unit_label IS DISTINCT FROM o.unit_label
       OR n.units_per_pack IS DISTINCT FROM o.units_per_pack
  ) THEN
    RETURN NULL;
  END IF;

  IF COALESCE(current_setting('app.audit_source', true), '') = '' THEN
    PERFORM set_config('app.audit_source', 'supplier_portal', true);
  END IF;

  -- 1. O estado novo do artigo substitui qualquer pedido pendente dele.
  UPDATE public.supplier_price_change_requests r
     SET status = 'superseded', superseded_at = now(), superseded_batch_id = v_batch
    FROM sci_new n
    JOIN sci_old o ON o.id = n.id
   WHERE r.catalog_item_id = n.id
     AND r.status = 'pending'
     AND (n.base_price IS DISTINCT FROM o.base_price
          OR n.currency IS DISTINCT FROM o.currency
          OR n.unit_label IS DISTINCT FROM o.unit_label
          OR n.units_per_pack IS DISTINCT FROM o.units_per_pack);

  -- 2. Um pedido por ligação ativa (empresa) cujo preço/unidade difere.
  INSERT INTO public.supplier_price_change_requests (
    organization_id, link_id, supplier_id, catalog_item_id, item_supplier_id, product_id, uom_id,
    old_price, old_currency, new_price, currency, catalog_old_price, catalog_new_price,
    old_unit_label, unit_label, old_units_per_pack, units_per_pack, unit_changed,
    status, batch_id, requested_by_portal_user
  )
  SELECT isup.organization_id, l.id, isup.supplier_id, n.id, isup.id, isup.product_id, isup.uom_id,
         isup.purchase_price, isup.currency, x.np, n.currency, o.base_price, n.base_price,
         x.old_unit, n.unit_label, x.old_upp, n.units_per_pack, x.unit_chg,
         'pending', v_batch, n.updated_by_portal_user
  FROM sci_new n
  JOIN sci_old o ON o.id = n.id
  JOIN public.item_suppliers isup ON isup.catalog_item_id = n.id AND isup.deleted_at IS NULL
  JOIN public.supplier_account_links l
    ON l.supplier_id = isup.supplier_id AND l.supplier_account_id = n.supplier_account_id AND l.status = 'active'
  -- Embalagem de N (inteiro) numa ligação à unidade do produto (os casos em que
  -- fn_uom_units_per dá 1, sem exceções): o pedido traz o preço por unidade.
  LEFT JOIN public.products pr ON pr.id = isup.product_id
  LEFT JOIN public.uom lu ON lu.id = isup.uom_id
  CROSS JOIN LATERAL (
    SELECT CASE WHEN isup.product_id IS NOT NULL
                 AND n.units_per_pack > 1
                 AND n.units_per_pack = trunc(n.units_per_pack)
                 AND n.units_per_pack <= 2147483647
                 AND (isup.uom_id IS NULL
                      OR isup.uom_id = pr.uom_id
                      OR (pr.uom_id IS NULL AND lu.id IS NOT NULL AND lu.base_uom_id IS NULL))
                THEN n.units_per_pack END AS pack_n
  ) pk
  LEFT JOIN LATERAL (
    SELECT pv.unit_changed, pv.old_unit_label, pv.old_units_per_pack
    FROM public.supplier_price_change_requests pv
    WHERE pv.item_supplier_id = isup.id AND pv.superseded_batch_id = v_batch
    ORDER BY pv.requested_at DESC, pv.id
    LIMIT 1
  ) prev ON true
  CROSS JOIN LATERAL (
    SELECT CASE WHEN pk.pack_n IS NOT NULL THEN round(n.base_price / pk.pack_n, 2)
                ELSE round(n.base_price, 2) END AS np,
           CASE WHEN prev.unit_changed THEN prev.old_unit_label ELSE o.unit_label END AS old_unit,
           CASE WHEN prev.unit_changed THEN prev.old_units_per_pack ELSE o.units_per_pack END AS old_upp
  ) x0
  CROSS JOIN LATERAL (
    SELECT x0.np, x0.old_unit, x0.old_upp,
           (x0.old_unit IS DISTINCT FROM n.unit_label OR x0.old_upp IS DISTINCT FROM n.units_per_pack) AS unit_chg
  ) x
  WHERE n.base_price IS NOT NULL
    AND (n.base_price IS DISTINCT FROM o.base_price
         OR n.currency IS DISTINCT FROM o.currency
         OR n.unit_label IS DISTINCT FROM o.unit_label
         OR n.units_per_pack IS DISTINCT FROM o.units_per_pack)
    AND (x.unit_chg
         OR x.np IS DISTINCT FROM isup.purchase_price
         OR n.currency IS DISTINCT FROM isup.currency);

  -- 3. Encadear os substituídos ao novo pedido da mesma ligação.
  UPDATE public.supplier_price_change_requests s
     SET superseded_by = nw.id
    FROM public.supplier_price_change_requests nw
   WHERE s.superseded_batch_id = v_batch
     AND nw.batch_id = v_batch
     AND nw.item_supplier_id = s.item_supplier_id;

  -- 4. Sino: um aviso por pessoa e fornecedor (atualizado a cada lote).
  BEGIN
    INSERT INTO public.notifications
      (user_id, organization_id, kind, type, title, message, link, entity_type, entity_id, priority, data)
    SELECT u.auth_user_id, g.organization_id, 'notification', 'supplier_price_pending',
           'Preços do fornecedor por aprovar',
           format('%s alterou o preço de %s %s no portal. Por aprovar: %s.',
                  COALESCE(s.name, 'O fornecedor'), g.n_batch,
                  CASE WHEN g.n_batch = 1 THEN 'artigo' ELSE 'artigos' END, pc.n_pending),
           '/suppliers?open=' || g.supplier_id::text || '&tab=portal&prices=pending',
           'supplier', g.supplier_id, 'medium',
           jsonb_build_object('modulo', 'compras', 'supplier_id', g.supplier_id, 'batch_id', v_batch,
                              'batch_count', g.n_batch, 'pending_count', pc.n_pending)
    FROM (
      SELECT organization_id, supplier_id, count(*) AS n_batch
      FROM public.supplier_price_change_requests
      WHERE batch_id = v_batch
      GROUP BY organization_id, supplier_id
    ) g
    JOIN public.suppliers s ON s.id = g.supplier_id
    CROSS JOIN LATERAL (
      SELECT count(*) AS n_pending
      FROM public.supplier_price_change_requests q
      WHERE q.organization_id = g.organization_id AND q.supplier_id = g.supplier_id AND q.status = 'pending'
    ) pc
    JOIN LATERAL (
      SELECT DISTINCT au.auth_user_id
      FROM public.anew_memberships m
      JOIN public.anew_users au ON au.id = m.user_id
      WHERE m.organization_id = g.organization_id
        AND m.status = 'active' AND m.role_is_client IS NOT TRUE
        AND au.deleted_at IS NULL AND au.auth_user_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                    WHERE rp.role_id = m.role_id AND rp.permission_code = 'products.manage_prices')
        AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                    WHERE rp.role_id = m.role_id AND rp.permission_code = 'products.edit')
    ) u ON true
    ON CONFLICT (type, entity_id, user_id) WHERE is_resolved = false DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      title = EXCLUDED.title,
      message = EXCLUDED.message,
      link = EXCLUDED.link,
      data = EXCLUDED.data,
      priority = EXCLUDED.priority,
      is_read = false,
      read_at = NULL,
      is_dismissed = false,
      created_at = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Aviso de preços por aprovar não enviado: %', SQLERRM;
  END;

  RETURN NULL;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. rpc_price_changes_list
-- ---------------------------------------------------------------------------
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
  IF NOT (public.has_anew_permission(v_uid, 'suppliers.view_pricing')
          OR public.has_anew_permission(v_uid, 'products.view_cost')) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (suppliers.view_pricing)'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

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
    SELECT r.*
    FROM public.supplier_price_change_requests r
    WHERE r.organization_id = ANY (v_orgs)
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
                  'organization_id', pg.organization_id,
                  'requested_at', pg.requested_at,
                  'batch_id', pg.batch_id,
                  'supplier', jsonb_build_object('id', s.id, 'name', s.name),
                  'catalog_item', jsonb_build_object(
                    'id', ci.id, 'supplier_ref', ci.supplier_ref, 'name', ci.name, 'is_active', ci.is_active),
                  'item_supplier_id', pg.item_supplier_id,
                  'product', CASE WHEN pr.id IS NULL THEN NULL
                                  ELSE jsonb_build_object('id', pr.id, 'name', pr.name, 'sku', pr.sku) END,
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
         LEFT JOIN public.anew_users du ON du.id = pg.decided_by
       ) x)
  INTO v_counts, v_total, v_items;

  RETURN jsonb_build_object(
    'counts', v_counts,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items,
    'can_decide', public.has_anew_permission(v_uid, 'products.edit')
                  AND public.has_anew_permission(v_uid, 'products.manage_prices')
  );
END;
$function$;
