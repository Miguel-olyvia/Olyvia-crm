-- Catálogo ↔ Inventário: produtos e consumíveis do Catálogo entram no Inventário; os armazéns de cada produto escolhem-se na ficha e
-- são eles que ligam/desligam a gestão de stock. Base RH (uetjghdkwbywbftedtth). Sem tabelas nem colunas novas.
--
-- 1. Dados (idempotente): product_organizations para todos os produtos não apagados com tipo_catalogo 'produto'/'consumivel'
--    (organização = products.organization_id), como rpc_create_product (product_id, organization_id, created_by). Não muda
--    manages_stock nem cria linhas em stocks.
-- 2. cat_guardar_produto (sobre a versão viva): garante essa linha ao criar e em cada gravação.
-- 3. NOVA cat_produto_stock(p_product_id) → { gere_stock, pode_editar, armazens: [{ warehouse_id, nome, codigo, ativo, quantidade,
--    reservado, minimo, maximo, ponto_encomenda, localizacao }] } — todos os armazéns não apagados da organização do produto.
--    reservado = null: as reservas FIFO das EC são por produto na organização (fn_client_order_line_reservations soma os armazéns
--    ativos que servem clientes), não por armazém.
--    Ler: services.view (como cat_ler_catalogo) ou inventory.view na organização; pode_editar = inventory.edit (ou system admin).
-- 4. NOVA cat_definir_armazem_produto(produto, armazém, ativo, mínimo, máximo, ponto de encomenda, localização) → { ok, motivo, gere_stock }
--    • ativo = true: cria a linha de stocks com quantidade 0 (colunas como rpc_create_inventory_count) ou reativa a que está na reciclagem
--      (como rpc_restore_stock) e/ou atualiza mínimo/máximo/ponto de encomenda/localização (NULL = não mexe). Se o produto não geria
--      stock, passa a gerir (manages_stock = true): as EC passam a reservar/descontar stock e a falta segue para o fornecedor por
--      fn_client_order_request_missing.
--    • ativo = false: só com quantidade 0, sem contagem aberta deste produto neste armazém, sem reservas/faltas abertas de EC do produto
--      e sem linhas de PO por receber do produto (as PO não têm armazém de destino: escolhe-se ao receber, e um movimento num par
--      produto/armazém na reciclagem atualiza a linha apagada sem a reativar — fn_stock_movements_apply). Apaga na reciclagem
--      (deleted_at/deleted_by, como rpc_delete_stock). Se não sobrar nenhum armazém ativo, manages_stock = false (volta a ir direto
--      ao fornecedor).
--    • Nunca mexe na quantidade. Armazém de outra organização → CT003; armazém inativo não se liga → CT002.
--    • Permissão: inventory.edit na organização do produto (ou system admin).
-- Guarda: só substitui cat_guardar_produto se for exatamente a medida a 29/10/2026 na base RH (md5 de pg_get_functiondef).

SET lock_timeout = '5s';

DO $guarda$
DECLARE v_h text;
BEGIN
  SELECT md5(pg_get_functiondef('public.cat_guardar_produto(uuid,uuid,text,text,text,text,uuid,numeric,date,numeric,uuid,numeric,numeric,numeric,text)'::regprocedure)) INTO v_h;
  IF v_h <> 'c8999c0e1441fceeb46633738951d034' THEN
    RAISE EXCEPTION 'Guarda: cat_guardar_produto no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  IF to_regprocedure('public.cat_produto_stock(uuid)') IS NOT NULL
     OR to_regprocedure('public.cat_definir_armazem_produto(uuid,uuid,boolean,numeric,numeric,numeric,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: as funções novas já existem no remoto: rever antes de aplicar.';
  END IF;
  IF to_regprocedure('public.fn_client_order_line_reservations(uuid,uuid[])') IS NULL OR to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam fn_client_order_line_reservations / fn_cat_exigir.';
  END IF;
END $guarda$;

-- ─── 1. Dados: product_organizations dos produtos do Catálogo ──────────────────────────────────────────────────────────────────────────
DO $dados$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('app.audit_source', 'system', true);
  INSERT INTO public.product_organizations (product_id, organization_id, created_by)
  SELECT p.id, p.organization_id, (SELECT u.id FROM public.anew_users u WHERE u.id = p.created_by)
  FROM public.products p
  WHERE p.tipo_catalogo IN ('produto', 'consumivel') AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.organization_id IS NOT NULL
  ON CONFLICT (product_id, organization_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'product_organizations criadas para produtos do Catálogo: %', v_n;
END $dados$;

-- ─── 2. cat_guardar_produto: garante product_organizations (resto igual à versão viva) ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_guardar_produto(p_org uuid, p_id uuid, p_tipo text, p_nome text, p_sku text, p_unidade text, p_categoria_id uuid, p_custo numeric, p_custo_data date, p_pvp numeric, p_servico_id uuid, p_fator_servico numeric, p_entulho_m3 numeric DEFAULT NULL::numeric, p_entulho_kg numeric DEFAULT NULL::numeric, p_descricao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := public.fn_cat_exigir(p_org, 'products.edit'); v_id uuid; v_atual numeric;
  v_agora timestamptz := clock_timestamp();
BEGIN
  IF p_tipo NOT IN ('produto','consumivel') THEN RAISE EXCEPTION 'Tipo inválido.' USING ERRCODE = 'CT002'; END IF;
  IF length(btrim(coalesce(p_nome, ''))) = 0 THEN RAISE EXCEPTION 'O nome é obrigatório.' USING ERRCODE = 'CT002'; END IF;
  IF p_servico_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM services WHERE id = p_servico_id AND organization_id = p_org AND NOT is_deleted) THEN
    RAISE EXCEPTION 'Serviço desconhecido nesta organização.' USING ERRCODE = 'CT002';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO products (organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted, manages_stock,
      created_by, tipo_catalogo, unidade, catalogo_categoria_id, servico_id, fator_servico, entulho_m3, entulho_kg, short_description)
    VALUES (p_org, coalesce(nullif(btrim(p_sku), ''), 'CAT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
      btrim(p_nome), 'active', true, p_tipo = 'produto', true, false, false, false,
      v_user, p_tipo, p_unidade, p_categoria_id, p_servico_id, coalesce(p_fator_servico, 1), p_entulho_m3, p_entulho_kg, p_descricao)
    RETURNING id INTO v_id;
  ELSE
    UPDATE products SET name = btrim(p_nome), sku = coalesce(nullif(btrim(p_sku), ''), sku), tipo_catalogo = p_tipo, unidade = p_unidade,
      catalogo_categoria_id = p_categoria_id, servico_id = p_servico_id, fator_servico = coalesce(p_fator_servico, 1),
      entulho_m3 = p_entulho_m3, entulho_kg = p_entulho_kg, short_description = p_descricao, is_sellable = p_tipo = 'produto', updated_at = now()
    WHERE id = p_id AND organization_id = p_org AND NOT is_deleted RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  END IF;
  -- 20270101230000: o produto do Catálogo pertence à organização em product_organizations (é por aí que o Inventário o vê:
  -- contagem inicial, listagens). Idempotente: na criação e em cada gravação.
  INSERT INTO product_organizations (product_id, organization_id, created_by)
  VALUES (v_id, p_org, v_user)
  ON CONFLICT (product_id, organization_id) DO NOTHING;
  IF p_custo IS NOT NULL THEN
    SELECT coalesce(preco_exato, price) INTO v_atual FROM product_prices WHERE product_id = v_id AND price_type = 'purchase' ORDER BY valid_from DESC NULLS LAST, created_at DESC LIMIT 1;
    IF v_atual IS DISTINCT FROM round(p_custo, 6) THEN
      INSERT INTO product_prices (product_id, currency, price, preco_exato, valid_from, created_by, price_type)
      VALUES (v_id, 'EUR', round(p_custo, 2), round(p_custo, 6),
        greatest(CASE WHEN p_custo_data IS NULL OR p_custo_data >= current_date THEN v_agora
                      ELSE p_custo_data::timestamp + (v_agora - date_trunc('day', v_agora)) END,
                 public.fn_cat_depois_do_ultimo_preco(v_id)),
        v_user, 'purchase');
    END IF;
  END IF;
  IF p_pvp IS NOT NULL THEN
    SELECT price INTO v_atual FROM product_prices WHERE product_id = v_id AND price_type = 'retail' ORDER BY valid_from DESC NULLS LAST, created_at DESC LIMIT 1;
    IF v_atual IS DISTINCT FROM round(p_pvp, 2) THEN
      INSERT INTO product_prices (product_id, currency, price, valid_from, created_by, price_type)
      VALUES (v_id, 'EUR', round(p_pvp, 2), greatest(v_agora, public.fn_cat_depois_do_ultimo_preco(v_id)), v_user, 'retail');
    END IF;
  END IF;
  RETURN v_id;
END $function$;

-- ─── 3. cat_produto_stock ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_produto_stock(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_gere boolean; v_admin boolean; r jsonb;
BEGIN
  SELECT organization_id, manages_stock INTO v_org, v_gere FROM products WHERE id = p_product_id AND NOT is_deleted AND deleted_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  v_admin := public.is_system_admin_user(auth.uid());
  IF NOT (v_admin OR public.has_anew_permission_in_org(auth.uid(), 'services.view', v_org)
          OR public.has_anew_permission_in_org(auth.uid(), 'inventory.view', v_org)) THEN
    RAISE EXCEPTION 'Sem permissão (services.view / inventory.view).' USING ERRCODE = 'CT001';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'warehouse_id', w.id,
           'nome', w.name,
           'codigo', w.code,
           'ativo', s.id IS NOT NULL,
           'quantidade', s.quantity,
           'reservado', NULL,
           'minimo', s.minimum_quantity,
           'maximo', s.maximum_quantity,
           'ponto_encomenda', s.reorder_point,
           'localizacao', s.location)
         ORDER BY w.name, w.code, w.id), '[]'::jsonb)
  INTO r
  FROM warehouses w
  LEFT JOIN stocks s ON s.warehouse_id = w.id AND s.product_id = p_product_id AND s.deleted_at IS NULL
  WHERE w.organization_id = v_org AND w.deleted_at IS NULL;
  RETURN jsonb_build_object(
    'gere_stock', coalesce(v_gere, false),
    'pode_editar', v_admin OR public.has_anew_permission_in_org(auth.uid(), 'inventory.edit', v_org),
    'armazens', r);
END $function$;

-- ─── 4. cat_definir_armazem_produto ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_definir_armazem_produto(p_product_id uuid, p_warehouse_id uuid, p_ativo boolean,
  p_minimo numeric DEFAULT NULL::numeric, p_maximo numeric DEFAULT NULL::numeric, p_ponto_encomenda numeric DEFAULT NULL::numeric,
  p_localizacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prod   record;
  v_wh     warehouses;
  v_user   uuid;
  s        stocks;
  v_motivo text;
  v_n      integer;
  v_loc    text := nullif(btrim(coalesce(p_localizacao, '')), '');
BEGIN
  SELECT id, organization_id, manages_stock, name INTO v_prod FROM products
  WHERE id = p_product_id AND NOT is_deleted AND deleted_at IS NULL;
  IF v_prod.id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  v_user := public.fn_cat_exigir(v_prod.organization_id, 'inventory.edit');
  IF v_user IS NULL THEN RAISE EXCEPTION 'Perfil de utilizador não encontrado.' USING ERRCODE = 'CT001'; END IF;
  IF p_ativo IS NULL THEN RAISE EXCEPTION 'Indique se o armazém fica ativo.' USING ERRCODE = 'CT002'; END IF;
  SELECT * INTO v_wh FROM warehouses WHERE id = p_warehouse_id AND organization_id = v_prod.organization_id AND deleted_at IS NULL;
  IF v_wh.id IS NULL THEN RAISE EXCEPTION 'Armazém não encontrado nesta organização.' USING ERRCODE = 'CT003'; END IF;
  -- stocks guarda inteiros ≥ 0
  IF (p_minimo IS NOT NULL AND (p_minimo < 0 OR p_minimo <> trunc(p_minimo) OR p_minimo > 2147483647))
     OR (p_maximo IS NOT NULL AND (p_maximo < 0 OR p_maximo <> trunc(p_maximo) OR p_maximo > 2147483647))
     OR (p_ponto_encomenda IS NOT NULL AND (p_ponto_encomenda < 0 OR p_ponto_encomenda <> trunc(p_ponto_encomenda) OR p_ponto_encomenda > 2147483647)) THEN
    RAISE EXCEPTION 'Mínimo, máximo e ponto de encomenda são números inteiros, 0 ou mais.' USING ERRCODE = 'CT002';
  END IF;
  IF v_loc IS NOT NULL AND char_length(v_loc) > 200 THEN
    RAISE EXCEPTION 'Localização demasiado longa (máx. 200 caracteres).' USING ERRCODE = 'CT002';
  END IF;

  -- a mesma ordem de bloqueio dos movimentos (produto, depois a linha de stocks)
  PERFORM 1 FROM products WHERE id = p_product_id FOR NO KEY UPDATE;
  SELECT * INTO s FROM stocks WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id FOR UPDATE;
  PERFORM set_config('app.audit_source', 'catalogo', true);

  IF p_ativo THEN
    IF NOT v_wh.is_active AND (s.id IS NULL OR s.deleted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'O armazém % está inativo: ative-o no Inventário antes de lhe ligar produtos.', v_wh.name USING ERRCODE = 'CT002';
    END IF;
    IF s.id IS NULL THEN
      INSERT INTO stocks (organization_id, product_id, warehouse_id, quantity, minimum_quantity, maximum_quantity, reorder_point,
                          location, created_by)
      VALUES (v_wh.organization_id, p_product_id, p_warehouse_id, 0, coalesce(p_minimo, 0)::integer, coalesce(p_maximo, 0)::integer,
              coalesce(p_ponto_encomenda, 0)::integer, v_loc, v_user);
      v_motivo := 'Armazém ligado ao produto.';
    ELSE
      UPDATE stocks SET
        deleted_at = NULL, deleted_by = NULL,
        minimum_quantity = coalesce(p_minimo::integer, minimum_quantity),
        maximum_quantity = coalesce(p_maximo::integer, maximum_quantity),
        reorder_point = coalesce(p_ponto_encomenda::integer, reorder_point),
        location = CASE WHEN p_localizacao IS NULL THEN location ELSE v_loc END,
        updated_at = now()
      WHERE id = s.id;
      v_motivo := CASE WHEN s.deleted_at IS NOT NULL THEN 'Armazém voltou a ficar ligado ao produto.' ELSE 'Dados do armazém atualizados.' END;
    END IF;
    IF NOT v_prod.manages_stock THEN
      UPDATE products SET manages_stock = true, updated_at = now() WHERE id = p_product_id;
      v_motivo := v_motivo || ' O produto passou a gerir stock.';
    END IF;
    RETURN jsonb_build_object('ok', true, 'motivo', v_motivo, 'gere_stock', true);
  END IF;

  -- ── desligar ──
  IF s.id IS NULL OR s.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'motivo', 'O armazém já não estava ligado ao produto.', 'gere_stock', v_prod.manages_stock);
  END IF;
  IF s.quantity <> 0 THEN
    RAISE EXCEPTION 'Não é possível desligar: o armazém % ainda tem % unidade(s) deste produto. Transfira ou acerte o stock primeiro.',
      v_wh.name, s.quantity USING ERRCODE = 'CT002';
  END IF;
  IF EXISTS (SELECT 1 FROM inventory_count_lines l JOIN inventory_counts c ON c.id = l.inventory_count_id
             WHERE l.product_id = p_product_id AND c.warehouse_id = p_warehouse_id AND c.status = 'em_contagem') THEN
    RAISE EXCEPTION 'Não é possível desligar: há uma contagem de inventário aberta com este produto no armazém %.', v_wh.name
      USING ERRCODE = 'CT002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fn_client_order_line_reservations(v_prod.organization_id, ARRAY[p_product_id]) r
             WHERE coalesce(r.qty_reserved, 0) > 0 OR coalesce(r.qty_missing, 0) > 0) THEN
    RAISE EXCEPTION 'Não é possível desligar: há encomendas de cliente em aberto com este produto (reservas ou faltas).'
      USING ERRCODE = 'CT002';
  END IF;
  SELECT count(*) INTO v_n FROM purchase_order_items i JOIN purchase_orders o ON o.id = i.purchase_order_id
  WHERE i.product_id = p_product_id AND o.organization_id = v_prod.organization_id AND o.deleted_at IS NULL
    AND o.status NOT IN ('received', 'cancelled')
    AND coalesce(i.received_to_stock_units, 0) < i.quantity * coalesce(i.units_per_uom, 1);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Não é possível desligar: há % linha(s) de encomenda a fornecedor deste produto por receber.', v_n USING ERRCODE = 'CT002';
  END IF;

  UPDATE stocks SET deleted_at = now(), deleted_by = v_user, updated_at = now() WHERE id = s.id;
  v_motivo := 'Armazém desligado do produto.';
  IF NOT EXISTS (SELECT 1 FROM stocks WHERE product_id = p_product_id AND deleted_at IS NULL) THEN
    IF v_prod.manages_stock THEN
      UPDATE products SET manages_stock = false, updated_at = now() WHERE id = p_product_id;
      v_motivo := v_motivo || ' Sem armazéns, o produto deixou de gerir stock (as encomendas vão direto ao fornecedor).';
    END IF;
    RETURN jsonb_build_object('ok', true, 'motivo', v_motivo, 'gere_stock', false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'motivo', v_motivo, 'gere_stock', v_prod.manages_stock);
END $function$;

-- ─── Permissões ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.cat_produto_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_produto_stock(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cat_definir_armazem_produto(uuid,uuid,boolean,numeric,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_definir_armazem_produto(uuid,uuid,boolean,numeric,numeric,numeric,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_produto_stock(uuid) IS 'Catálogo, ficha do produto: armazéns da organização com a linha de stocks do produto (ativo/quantidade/mínimos). services.view ou inventory.view; pode_editar = inventory.edit.';
COMMENT ON FUNCTION public.cat_definir_armazem_produto(uuid,uuid,boolean,numeric,numeric,numeric,text) IS 'Catálogo, ficha do produto: liga/desliga um armazém ao produto (linha de stocks a 0 / reciclagem) e liga/desliga manages_stock em conformidade. Nunca mexe na quantidade. inventory.edit.';

-- ─── Conferir ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $conferir$
BEGIN
  IF position('INSERT INTO product_organizations' IN pg_get_functiondef(
       'public.cat_guardar_produto(uuid,uuid,text,text,text,text,uuid,numeric,date,numeric,uuid,numeric,numeric,numeric,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Conferir: cat_guardar_produto não garante product_organizations.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.products p
             WHERE p.tipo_catalogo IN ('produto', 'consumivel') AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.organization_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM public.product_organizations po WHERE po.product_id = p.id AND po.organization_id = p.organization_id)) THEN
    RAISE EXCEPTION 'Conferir: ainda há produtos do Catálogo sem product_organizations.';
  END IF;
  IF has_function_privilege('anon', 'public.cat_produto_stock(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cat_definir_armazem_produto(uuid,uuid,boolean,numeric,numeric,numeric,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_definir_armazem_produto(uuid,uuid,boolean,numeric,numeric,numeric,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: grants.';
  END IF;
END $conferir$;
