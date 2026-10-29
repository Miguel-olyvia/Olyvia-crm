-- ============================================================
-- Testes: 20270101200000_catalogo_ficha_produto_fornecedores.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: cria 2 produtos, 4 fornecedores e (se a organização tiver um
-- fornecedor ligado ao portal) 1 artigo do catálogo próprios (prefixo "Teste 2027"), na organização dos produtos do Catálogo, como um
-- utilizador com products.edit que não é system admin (role authenticated, auth.uid() pelas claims); as permissões que faltarem são dadas
-- ao papel dele só dentro da transação. Desfaz tudo no fim.
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/catalogo_ficha_produto.test.sql
--
-- Cobre:
--   1. cat_produto_fornecedores: 4 ligações, preferido primeiro e depois o nome; as chaves exatas; preços visíveis; catalogo null
--   2. cat_definir_fornecedor_preferido: troca atómica (um só preferido, products.supplier_id); o custo muda só na linha purchase
--      ATUAL (price + preco_exato), a linha mais antiga fica intacta e o número de linhas não cresce (opção A: sem histórico)
--   3. Repetir o mesmo preferido: custo_aplicado, nada escrito (o custo atual já é esse)
--   4. Fornecedor inativo → CT002
--   5. Fornecedor sem preço: passa a preferido, custo_aplicado = false, codigo no_price, custo intacto
--   6. (com portal) rpc_catalog_link com o preço do catálogo (embalagem de 12) num produto sem custo: preco_data = hoje, a linha
--      purchase criada com preco_exato a 6 casas; catalogo na leitura; rpc_price_changes_decide: preço novo → preco_data = hoje e a
--      MESMA linha atualizada (continua 1); mesmo preço → só preco_data
--   7. Sem products.manage_prices: trocar para um fornecedor com preço → CT001
--   8. Sem products.view_cost / suppliers.view_pricing: purchase_price vem null
--   9. Fora da organização → CT001 nas duas
--  10. Grants
-- ============================================================

BEGIN;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  v_org  uuid;
  v_auth uuid;
  v_act  uuid;
  v_sup  uuid;  -- fornecedor ligado ao portal (opcional)
  v_acc  uuid;
  p1 uuid := '2027a000-0000-4000-8000-000000000001';
  p2 uuid := '2027a000-0000-4000-8000-000000000002';
  sa uuid := '2027b000-0000-4000-8000-00000000000a';
  sb uuid := '2027b000-0000-4000-8000-00000000000b';
  sc uuid := '2027b000-0000-4000-8000-00000000000c';
  sd uuid := '2027b000-0000-4000-8000-00000000000d';
BEGIN
  SELECT organization_id INTO v_org FROM products WHERE tipo_catalogo IS NOT NULL AND NOT is_deleted
  GROUP BY organization_id ORDER BY count(*) DESC LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'FALHOU: base sem produtos do Catálogo'; END IF;
  SELECT u.auth_user_id, u.id INTO v_auth, v_act FROM anew_users u
  WHERE u.auth_user_id IS NOT NULL AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', v_org)
    AND NOT public.is_system_admin_user(u.auth_user_id)
  ORDER BY u.created_at NULLS LAST, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: sem utilizador (não system admin) com products.edit na organização %', v_org; END IF;

  -- as permissões usadas, ao(s) papel(éis) desse utilizador nesta organização (só nesta transação)
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO anew_role_permissions (role_id, permission_code, created_by)
  SELECT am.role_id, c, NULL::uuid
  FROM anew_memberships am
  CROSS JOIN unnest(ARRAY['products.edit', 'products.view', 'products.view_cost', 'products.manage_prices',
                          'services.view', 'suppliers.view', 'suppliers.view_pricing']) c
  WHERE am.user_id = v_act AND am.organization_id = v_org AND am.status = 'active'
  ON CONFLICT (role_id, permission_code) DO NOTHING;
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                        manages_stock, created_by, tipo_catalogo, unidade)
  VALUES (p1, v_org, 'TESTE-2027A-1', 'Teste 2027 produto 1', 'active', true, true, true, false, false, false, v_act, 'produto', 'un'),
         (p2, v_org, 'TESTE-2027A-2', 'Teste 2027 produto 2', 'active', true, true, true, false, false, false, v_act, 'produto', 'un');
  -- P1: uma linha purchase antiga (8,00) e a atual (10,00)
  INSERT INTO product_prices (id, product_id, price_type, price, currency, valid_from, created_by, updated_at)
  VALUES ('2027f000-0000-4000-8000-000000000001', p1, 'purchase',  8.00, 'EUR', now() - interval '10 days', v_act, '2026-01-01'),
         ('2027f000-0000-4000-8000-000000000002', p1, 'purchase', 10.00, 'EUR', now() - interval '1 day', v_act, '2026-01-01'),
         ('2027f000-0000-4000-8000-000000000003', p1, 'retail',   20.00, 'EUR', now() - interval '1 day' + interval '1 second', v_act, '2026-01-01');

  INSERT INTO suppliers (id, organization_id, name, is_active, created_by)
  VALUES (sa, v_org, 'Teste 2027 A fornecedor', true, v_act), (sb, v_org, 'Teste 2027 B fornecedor', true, v_act),
         (sc, v_org, 'Teste 2027 C fornecedor', true, v_act), (sd, v_org, 'Teste 2027 D fornecedor', true, v_act);
  INSERT INTO item_suppliers (id, organization_id, item_type, product_id, supplier_id, supplier_sku, purchase_price, currency,
                              is_preferred, is_active, created_by, preco_data)
  VALUES ('2027c000-0000-4000-8000-00000000000a', v_org, 'product', p1, sa, 'REF-A', 10.00, 'EUR', true,  true,  v_act, NULL),
         ('2027c000-0000-4000-8000-00000000000b', v_org, 'product', p1, sb, 'REF-B', 12.50, 'EUR', false, true,  v_act, '2026-01-01'),
         ('2027c000-0000-4000-8000-00000000000c', v_org, 'product', p1, sc, 'REF-C',  9.00, 'EUR', false, false, v_act, NULL),
         ('2027c000-0000-4000-8000-00000000000d', v_org, 'product', p1, sd, 'REF-D',  NULL, 'EUR', false, true,  v_act, NULL);

  -- artigo do catálogo num fornecedor desta organização ligado ao portal (se houver)
  SELECT l.supplier_id, l.supplier_account_id INTO v_sup, v_acc FROM supplier_account_links l
  JOIN suppliers s ON s.id = l.supplier_id AND s.deleted_at IS NULL
  WHERE l.organization_id = v_org AND l.status = 'active' AND l.revoked_at IS NULL LIMIT 1;
  IF v_sup IS NOT NULL THEN
    INSERT INTO supplier_catalog_items (id, supplier_account_id, supplier_ref, name, unit_label, units_per_pack, base_price, currency)
    VALUES ('2027d000-0000-4000-8000-000000000001', v_acc, 'TESTE2027A1', 'Teste 2027 artigo', 'cx', 12, 25.00, 'EUR');
  END IF;

  PERFORM set_config('teste.org', v_org::text, true);
  PERFORM set_config('teste.act', v_act::text, true);
  PERFORM set_config('teste.portal', coalesce(v_sup::text, ''), true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
END $fx$;

-- ─── 1. Leitura ──────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE j jsonb; k text[];
BEGIN
  j := public.cat_produto_fornecedores('2027a000-0000-4000-8000-000000000001');
  IF jsonb_typeof(j) <> 'array' OR jsonb_array_length(j) <> 4 THEN RAISE EXCEPTION 'FALHOU: esperava 4 ligações, veio %', j; END IF;
  IF j->0->>'item_supplier_id' <> '2027c000-0000-4000-8000-00000000000a' OR (j->0->>'is_preferred')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: o preferido devia vir primeiro: %', j->0;
  END IF;
  IF j->1->>'supplier_name' <> 'Teste 2027 B fornecedor' OR j->2->>'supplier_name' <> 'Teste 2027 C fornecedor'
     OR j->3->>'supplier_name' <> 'Teste 2027 D fornecedor' THEN
    RAISE EXCEPTION 'FALHOU: os outros deviam vir pelo nome: %', j;
  END IF;
  SELECT array_agg(x ORDER BY x COLLATE "C") INTO k FROM jsonb_object_keys(j->0) x;
  IF k <> ARRAY['catalog_item_id', 'catalogo', 'currency', 'is_active', 'is_preferred', 'item_supplier_id', 'lead_time_days', 'moq',
                'preco_data', 'purchase_price', 'supplier_id', 'supplier_name', 'supplier_sku'] THEN
    RAISE EXCEPTION 'FALHOU: chaves diferentes do contrato: %', k;
  END IF;
  IF (j->0->>'purchase_price')::numeric <> 10 OR j->1->>'preco_data' <> '2026-01-01' OR j->0->'catalogo' <> 'null'::jsonb
     OR (j->2->>'is_active')::boolean IS NOT FALSE OR j->3->'purchase_price' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: valores da leitura: %', j;
  END IF;
END $t$;

-- ─── 2. Trocar o preferido: custo em linha nova ─────────────────────────────
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.cat_definir_fornecedor_preferido('2027c000-0000-4000-8000-00000000000b');
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'custo_aplicado')::boolean IS NOT TRUE OR r->>'motivo' IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: preferido B devia aplicar o custo: %', r;
  END IF;
END $t$;
RESET ROLE;
DO $t$
DECLARE n int; v record;
BEGIN
  IF (SELECT array_agg(supplier_id ORDER BY supplier_id) FROM item_suppliers
      WHERE product_id = '2027a000-0000-4000-8000-000000000001' AND is_preferred AND deleted_at IS NULL)
     <> ARRAY['2027b000-0000-4000-8000-00000000000b'::uuid] THEN
    RAISE EXCEPTION 'FALHOU: devia haver só um preferido (B)';
  END IF;
  IF (SELECT supplier_id FROM products WHERE id = '2027a000-0000-4000-8000-000000000001') <> '2027b000-0000-4000-8000-00000000000b' THEN
    RAISE EXCEPTION 'FALHOU: products.supplier_id não seguiu o preferido';
  END IF;
  SELECT count(*) INTO n FROM product_prices WHERE product_id = '2027a000-0000-4000-8000-000000000001' AND price_type = 'purchase';
  IF n <> 2 THEN RAISE EXCEPTION 'FALHOU: o número de linhas purchase não devia mudar (2), há %', n; END IF;
  SELECT price, preco_exato, updated_at INTO v FROM product_prices WHERE id = '2027f000-0000-4000-8000-000000000001';
  IF v.price <> 8.00 OR v.preco_exato IS NOT NULL OR v.updated_at <> '2026-01-01' THEN
    RAISE EXCEPTION 'FALHOU: a linha antiga (8,00) foi mexida: %', v;
  END IF;
  SELECT price, preco_exato, updated_at INTO v FROM product_prices WHERE id = '2027f000-0000-4000-8000-000000000002';
  IF v.price <> 12.50 OR v.preco_exato <> 12.5 OR v.updated_at = '2026-01-01' THEN RAISE EXCEPTION 'FALHOU: a linha atual devia ter 12,50: %', v; END IF;
  IF (SELECT price FROM product_prices WHERE id = '2027f000-0000-4000-8000-000000000003') <> 20.00 THEN
    RAISE EXCEPTION 'FALHOU: o PVP não devia mudar';
  END IF;
END $t$;

-- ─── 3, 4, 5. Repetir; inativo; sem preço ─────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.cat_definir_fornecedor_preferido('2027c000-0000-4000-8000-00000000000b');
  IF (r->>'custo_aplicado')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: repetir devia dizer custo aplicado: %', r; END IF;
  BEGIN
    PERFORM public.cat_definir_fornecedor_preferido('2027c000-0000-4000-8000-00000000000c');
    RAISE EXCEPTION 'FALHOU: fornecedor inativo foi aceite como preferido';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  r := public.cat_definir_fornecedor_preferido('2027c000-0000-4000-8000-00000000000d');
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'custo_aplicado')::boolean IS NOT FALSE OR r->>'codigo' <> 'no_price' OR r->>'motivo' IS NULL THEN
    RAISE EXCEPTION 'FALHOU: sem preço devia dar no_price: %', r;
  END IF;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF (SELECT count(*) FROM product_prices WHERE product_id = '2027a000-0000-4000-8000-000000000001' AND price_type = 'purchase') <> 2 THEN
    RAISE EXCEPTION 'FALHOU: repetir o preferido ou um sem preço não devia criar linhas de custo';
  END IF;
  IF (SELECT price FROM product_prices WHERE id = '2027f000-0000-4000-8000-000000000002') <> 12.50
     OR (SELECT price FROM product_prices WHERE id = '2027f000-0000-4000-8000-000000000001') <> 8.00 THEN
    RAISE EXCEPTION 'FALHOU: repetir o preferido ou um sem preço não devia mudar o custo';
  END IF;
  IF NOT (SELECT is_preferred FROM item_suppliers WHERE id = '2027c000-0000-4000-8000-00000000000d')
     OR (SELECT is_preferred FROM item_suppliers WHERE id = '2027c000-0000-4000-8000-00000000000b')
     OR (SELECT supplier_id FROM products WHERE id = '2027a000-0000-4000-8000-000000000001') <> '2027b000-0000-4000-8000-00000000000d' THEN
    RAISE EXCEPTION 'FALHOU: D devia ser o único preferido';
  END IF;
END $t$;

-- ─── 6. Portal: ligar com o preço do catálogo e aceitar pedidos de preço ─────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; j jsonb;
BEGIN
  IF current_setting('teste.portal') = '' THEN RAISE NOTICE 'Sem fornecedor ligado ao portal: grupo 6 saltado'; RETURN; END IF;
  r := public.rpc_catalog_link(current_setting('teste.portal')::uuid, '2027d000-0000-4000-8000-000000000001',
                               '2027a000-0000-4000-8000-000000000002', NULL, true);
  IF (r->>'product_cost_updated')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: ligar devia aplicar o custo: %', r; END IF;
  PERFORM set_config('teste.link', r->>'item_supplier_id', true);
  j := public.cat_produto_fornecedores('2027a000-0000-4000-8000-000000000002');
  IF jsonb_array_length(j) <> 1 OR j->0->'catalogo'->>'nome' <> 'Teste 2027 artigo' OR j->0->'catalogo'->>'unidade' <> 'cx'
     OR (j->0->'catalogo'->>'units_per_pack')::numeric <> 12 OR (j->0->'catalogo'->>'base_price')::numeric <> 25
     OR j->0->'catalogo'->>'supplier_ref' <> 'TESTE2027A1' OR (j->0->>'purchase_price')::numeric <> 2.08
     OR j->0->>'preco_data' <> current_date::text THEN
    RAISE EXCEPTION 'FALHOU: leitura da ligação ao catálogo: %', j;
  END IF;
END $t$;
RESET ROLE;
DO $t$
DECLARE v record; v_org uuid := current_setting('teste.org')::uuid; v_link uuid;
BEGIN
  IF current_setting('teste.portal') = '' THEN RETURN; END IF;
  v_link := current_setting('teste.link')::uuid;
  IF (SELECT count(*) FROM product_prices WHERE product_id = '2027a000-0000-4000-8000-000000000002' AND price_type = 'purchase') <> 1 THEN
    RAISE EXCEPTION 'FALHOU: ligar um produto sem custo devia criar 1 linha purchase';
  END IF;
  SELECT id, price, preco_exato INTO v FROM product_prices WHERE product_id = '2027a000-0000-4000-8000-000000000002' AND price_type = 'purchase';
  IF v.price <> 2.08 OR v.preco_exato <> 2.083333 THEN RAISE EXCEPTION 'FALHOU: custo da embalagem de 12 a 25,00: %', v; END IF;
  PERFORM set_config('teste.p2linha', v.id::text, true);
  -- dois pedidos do fornecedor: 30,00 (muda) e depois 30,00 outra vez (igual)
  UPDATE item_suppliers SET preco_data = '2026-01-01' WHERE id = v_link;
  INSERT INTO supplier_price_change_requests (id, organization_id, link_id, supplier_id, catalog_item_id, item_supplier_id, product_id,
    old_price, new_price, currency, catalog_old_price, catalog_new_price, old_units_per_pack, units_per_pack, batch_id)
  SELECT '2027e000-0000-4000-8000-000000000001', v_org, l.id, l.supplier_id, '2027d000-0000-4000-8000-000000000001', v_link,
         '2027a000-0000-4000-8000-000000000002', 2.08, 2.50, 'EUR', 25, 30, 12, 12, gen_random_uuid()
  FROM supplier_account_links l WHERE l.supplier_id = current_setting('teste.portal')::uuid AND l.status = 'active';
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  IF current_setting('teste.portal') = '' THEN RETURN; END IF;
  r := public.rpc_price_changes_decide(ARRAY['2027e000-0000-4000-8000-000000000001']::uuid[], true, NULL, false);
  IF (r->>'approved')::int <> 1 OR (r->>'item_suppliers_updated')::int <> 1 THEN RAISE EXCEPTION 'FALHOU: aceitar o pedido: %', r; END IF;
END $t$;
RESET ROLE;
DO $t$
DECLARE v record; v_link uuid;
BEGIN
  IF current_setting('teste.portal') = '' THEN RETURN; END IF;
  v_link := current_setting('teste.link')::uuid;
  SELECT purchase_price, preco_data INTO v FROM item_suppliers WHERE id = v_link;
  IF v.purchase_price <> 2.50 OR v.preco_data <> current_date THEN RAISE EXCEPTION 'FALHOU: ligação depois de aceitar: %', v; END IF;
  IF (SELECT count(*) FROM product_prices WHERE product_id = '2027a000-0000-4000-8000-000000000002' AND price_type = 'purchase') <> 1
     OR (SELECT price FROM product_prices WHERE id = current_setting('teste.p2linha')::uuid) <> 2.50
     OR (SELECT preco_exato FROM product_prices WHERE id = current_setting('teste.p2linha')::uuid) <> 2.5 THEN
    RAISE EXCEPTION 'FALHOU: aceitar devia pôr 2,50 na mesma linha (continua 1)';
  END IF;
  -- o mesmo preço outra vez: só a data
  UPDATE item_suppliers SET preco_data = '2026-01-01' WHERE id = v_link;
  INSERT INTO supplier_price_change_requests (id, organization_id, link_id, supplier_id, catalog_item_id, item_supplier_id, product_id,
    old_price, new_price, currency, catalog_old_price, catalog_new_price, old_units_per_pack, units_per_pack, batch_id)
  SELECT '2027e000-0000-4000-8000-000000000002', organization_id, link_id, supplier_id, catalog_item_id, item_supplier_id, product_id,
         2.50, 2.50, 'EUR', 30, 30, 12, 12, gen_random_uuid()
  FROM supplier_price_change_requests WHERE id = '2027e000-0000-4000-8000-000000000001';
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  IF current_setting('teste.portal') = '' THEN RETURN; END IF;
  r := public.rpc_price_changes_decide(ARRAY['2027e000-0000-4000-8000-000000000002']::uuid[], true, NULL, false);
  IF (r->>'approved')::int <> 1 OR (r->>'item_suppliers_updated')::int <> 0 THEN RAISE EXCEPTION 'FALHOU: aceitar o mesmo preço: %', r; END IF;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF current_setting('teste.portal') = '' THEN RETURN; END IF;
  IF (SELECT preco_data FROM item_suppliers WHERE id = current_setting('teste.link')::uuid) <> current_date THEN
    RAISE EXCEPTION 'FALHOU: aceitar o mesmo preço devia pôr preco_data = hoje';
  END IF;
  IF (SELECT count(*) FROM product_prices WHERE product_id = '2027a000-0000-4000-8000-000000000002' AND price_type = 'purchase') <> 1 THEN
    RAISE EXCEPTION 'FALHOU: aceitar o mesmo preço não devia criar linha de custo';
  END IF;
END $t$;

-- ─── 7, 8. Sem manage_prices; sem ver custos ─────────────────────────────────
DO $t$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  DELETE FROM anew_role_permissions rp USING anew_memberships am
  WHERE rp.role_id = am.role_id AND am.user_id = current_setting('teste.act')::uuid AND am.organization_id = current_setting('teste.org')::uuid
    AND am.status = 'active' AND rp.permission_code IN ('products.manage_prices', 'products.view_cost', 'suppliers.view_pricing');
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE j jsonb;
BEGIN
  BEGIN
    PERFORM public.cat_definir_fornecedor_preferido('2027c000-0000-4000-8000-00000000000a');
    RAISE EXCEPTION 'FALHOU: trocar para um fornecedor com preço sem products.manage_prices foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  j := public.cat_produto_fornecedores('2027a000-0000-4000-8000-000000000001');
  IF jsonb_array_length(j) <> 4 OR EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE e->'purchase_price' <> 'null'::jsonb) THEN
    RAISE EXCEPTION 'FALHOU: sem view_cost/view_pricing os preços deviam vir null: %', j;
  END IF;
END $t$;
RESET ROLE;

-- ─── 9. Fora da organização ──────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.cat_produto_fornecedores('2027a000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'FALHOU: leitura fora da organização foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_definir_fornecedor_preferido('2027c000-0000-4000-8000-00000000000b');
    RAISE EXCEPTION 'FALHOU: trocar o preferido fora da organização foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
END $t$;
RESET ROLE;

-- ─── 10. Grants ──────────────────────────────────────────────────────────────
DO $t$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.cat_produto_fornecedores(uuid)', 'public.cat_definir_fornecedor_preferido(uuid)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHOU: % devia ter EXECUTE só para authenticated', f;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.fn_apply_product_cost_from_supplier(uuid,uuid,numeric,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_apply_product_cost_from_supplier(uuid,uuid,numeric,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: fn_apply_product_cost_from_supplier é interna';
  END IF;
END $t$;

SELECT 'OK: 20270101200000 — 10 grupos de testes passaram' || CASE WHEN current_setting('teste.portal') = '' THEN ' (6 saltado: sem portal)' ELSE '' END AS resultado;

ROLLBACK;
