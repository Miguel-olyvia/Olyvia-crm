-- ============================================================
-- Testes: 20270101240000_catalogo_armazens_em_massa_contagem_inicial.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: na organização do Catálogo cria um armazém de teste e usa
-- TODOS os produtos/consumíveis do Catálogo dessa organização, como um utilizador com products.edit que não é system admin (role
-- authenticated, auth.uid() pelas claims; inventory.edit/count e services.view dadas só nesta transação), com o statement_timeout
-- de authenticated (8s) em cada chamada em massa, e desfaz tudo. Mede o tempo das chamadas em massa (vem no resultado).
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/catalogo_armazens_em_massa_contagem_inicial.test.sql
--
-- Cobre:
--   1. Dados: todos os produtos/consumíveis do Catálogo gerem stock; cat_guardar_produto cria a gerir stock; rpc_catalog_link põe
--      manages_stock = true quando o produto entra no Catálogo (se houver fornecedor ligado ao portal)
--   2. Contagem inicial num armazém sem produtos marcados → erro explicativo (Catálogo e custos), sem criar stocks
--   3. Em massa, ligar todos os produtos do Catálogo (+ 1 id que não existe → recusado): linhas a 0, < 8s; manages_stock não muda
--   4. Em massa, desligar todos com 1 produto com stock (5 un.) → esse fica em recusados com a quantidade, os outros saem (continuam a
--      gerir stock); religar reativa as mesmas linhas
--   5. Contagem inicial = só os marcados (rascunhos fora), stock_rows_created = 0, nenhuma linha de stocks criada
--   6. Desligar em massa com a contagem aberta → todos recusados, nada muda
--   7. cat_definir_armazem_produto (via fn_cat_armazem_bloqueios) mantém a mensagem com a quantidade; desligar o último armazém
--      não desliga a gestão de stock
--   8. Mais de 5000 → CT002; sem inventory.edit → CT001; grants
-- ============================================================

BEGIN;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE v_org uuid; v_auth uuid; v_act uuid;
BEGIN
  SELECT organization_id INTO v_org FROM products WHERE tipo_catalogo IS NOT NULL AND NOT is_deleted
  GROUP BY organization_id ORDER BY count(*) DESC LIMIT 1;
  SELECT u.auth_user_id, u.id INTO v_auth, v_act FROM anew_users u
  WHERE u.auth_user_id IS NOT NULL AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', v_org)
    AND NOT public.is_system_admin_user(u.auth_user_id)
  ORDER BY u.created_at NULLS LAST, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: sem utilizador (não system admin) com products.edit na organização %', v_org; END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO anew_role_permissions (role_id, permission_code, created_by)
  SELECT am.role_id, c, NULL::uuid FROM anew_memberships am
  CROSS JOIN unnest(ARRAY['services.view', 'inventory.view', 'inventory.edit', 'inventory.count']) c
  WHERE am.user_id = v_act AND am.organization_id = v_org AND am.status = 'active'
  ON CONFLICT (role_id, permission_code) DO NOTHING;
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO warehouses (id, name, code, is_active, created_by, organization_id)
  VALUES ('2027b500-0000-4000-8000-000000000001', 'Teste 2027 armazém massa', 'TESTE2027M1', true, v_act, v_org);

  PERFORM set_config('teste.org', v_org::text, true);
  PERFORM set_config('teste.act', v_act::text, true);
  PERFORM set_config('teste.ids', (SELECT array_agg(id ORDER BY id)::text FROM products
                                   WHERE organization_id = v_org AND tipo_catalogo IS NOT NULL AND NOT is_deleted AND deleted_at IS NULL), true);
  PERFORM set_config('teste.stocks0', (SELECT count(*)::text FROM stocks), true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
END $fx$;

-- ─── 1. Dados ────────────────────────────────────────────────────────────────
DO $t$
BEGIN
  IF EXISTS (SELECT 1 FROM products p WHERE p.tipo_catalogo IN ('produto', 'consumivel') AND NOT p.manages_stock AND NOT p.is_deleted
             AND p.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'FALHOU: há produtos do Catálogo que não gerem stock';
  END IF;
  IF cardinality(current_setting('teste.ids')::uuid[]) < 100 THEN RAISE EXCEPTION 'FALHOU: poucos produtos no Catálogo para medir'; END IF;
END $t$;

-- cat_guardar_produto cria a gerir stock; rpc_catalog_link põe-no a gerir stock ao entrar no Catálogo
DO $fx$
DECLARE v_sup uuid; v_acc uuid;
BEGIN
  SELECT l.supplier_id, l.supplier_account_id INTO v_sup, v_acc FROM supplier_account_links l
  JOIN suppliers s ON s.id = l.supplier_id AND s.deleted_at IS NULL
  WHERE l.organization_id = current_setting('teste.org')::uuid AND l.status = 'active' AND l.revoked_at IS NULL LIMIT 1;
  PERFORM set_config('teste.portal', coalesce(v_sup::text, ''), true);
  IF v_sup IS NOT NULL THEN
    INSERT INTO supplier_catalog_items (id, supplier_account_id, supplier_ref, name, unit_label, base_price, currency)
    VALUES ('2027d500-0000-4000-8000-000000000001', v_acc, 'TESTE2027M1', 'Teste 2027 massa artigo', 'un', 2, 'EUR');
    INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                          manages_stock, created_by)
    VALUES ('2027a500-0000-4000-8000-000000000001', current_setting('teste.org')::uuid, 'TESTE-2027M-1', 'Teste 2027 massa portal',
            'active', true, true, true, false, false, false, current_setting('teste.act')::uuid);
    INSERT INTO product_organizations (product_id, organization_id) VALUES ('2027a500-0000-4000-8000-000000000001', current_setting('teste.org')::uuid);
  END IF;
END $fx$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_id uuid;
BEGIN
  v_id := public.cat_guardar_produto(current_setting('teste.org')::uuid, NULL, 'consumivel', 'Teste 2027 massa consumível', 'TESTE-2027M-2',
                                     'un', NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM set_config('teste.novo', v_id::text, true);
  IF current_setting('teste.portal') <> '' THEN
    PERFORM public.rpc_catalog_link(current_setting('teste.portal')::uuid, '2027d500-0000-4000-8000-000000000001',
                                    '2027a500-0000-4000-8000-000000000001', NULL, false);
  END IF;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF NOT (SELECT manages_stock FROM products WHERE id = current_setting('teste.novo')::uuid) THEN
    RAISE EXCEPTION 'FALHOU: cat_guardar_produto devia criar a gerir stock';
  END IF;
  IF current_setting('teste.portal') <> ''
     AND (SELECT tipo_catalogo || '/' || manages_stock::text FROM products WHERE id = '2027a500-0000-4000-8000-000000000001') <> 'produto/true' THEN
    RAISE EXCEPTION 'FALHOU: rpc_catalog_link devia pôr o produto no Catálogo a gerir stock';
  END IF;
  -- a lista dos produtos em massa: todos os do Catálogo, já com os dois novos
  PERFORM set_config('teste.ids', (SELECT array_agg(id ORDER BY id)::text FROM products
                                   WHERE organization_id = current_setting('teste.org')::uuid AND tipo_catalogo IS NOT NULL
                                     AND NOT is_deleted AND deleted_at IS NULL), true);
END $t$;

-- ─── 2. Contagem inicial sem marcados ────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.rpc_create_inventory_count(current_setting('teste.org')::uuid, '2027b500-0000-4000-8000-000000000001', NULL, true);
    RAISE EXCEPTION 'FALHOU: contagem inicial sem produtos marcados foi criada';
  EXCEPTION WHEN no_data_found THEN
    IF position('Catálogo e custos' IN SQLERRM) = 0 THEN RAISE EXCEPTION 'FALHOU: mensagem da contagem vazia: %', SQLERRM; END IF;
  END;
END $t$;
RESET ROLE;

-- ─── 3. Ligar em massa ───────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
SET LOCAL statement_timeout = '8s';
DO $t$
DECLARE r jsonb; t0 timestamptz := clock_timestamp(); n int := cardinality(current_setting('teste.ids')::uuid[]);
BEGIN
  r := public.cat_definir_armazem_produtos(current_setting('teste.ids')::uuid[] || '2027a500-0000-4000-8000-0000000000ff'::uuid,
                                           '2027b500-0000-4000-8000-000000000001', true);
  PERFORM set_config('teste.t_ligar', round(extract(epoch FROM clock_timestamp() - t0) * 1000)::text, true);
  IF (r->>'alterados')::int <> n OR jsonb_array_length(r->'recusados') <> 1
     OR r->'recusados'->0->>'product_id' <> '2027a500-0000-4000-8000-0000000000ff' THEN
    RAISE EXCEPTION 'FALHOU: ligar em massa: %', left(r::text, 500);
  END IF;
  IF (r->>'gere_stock_ligados')::int <> 0 OR (r->>'gere_stock_desligados')::int <> 0 THEN
    RAISE EXCEPTION 'FALHOU: ligar armazéns não devia mexer na gestão de stock: %', left(r::text, 300);
  END IF;
END $t$;
SET LOCAL statement_timeout = 0;
RESET ROLE;
DO $t$
DECLARE n int := cardinality(current_setting('teste.ids')::uuid[]);
BEGIN
  IF (SELECT count(*) FROM stocks WHERE warehouse_id = '2027b500-0000-4000-8000-000000000001' AND deleted_at IS NULL AND quantity = 0) <> n
     OR EXISTS (SELECT 1 FROM products WHERE id = ANY (current_setting('teste.ids')::uuid[]) AND NOT manages_stock) THEN
    RAISE EXCEPTION 'FALHOU: depois de ligar todos deviam ter linha a 0 e gerir stock';
  END IF;
  -- 5 un. num produto (só para o teste)
  PERFORM set_config('teste.p5', (current_setting('teste.ids')::uuid[])[1]::text, true);
  UPDATE stocks SET quantity = 5 WHERE product_id = current_setting('teste.p5')::uuid AND warehouse_id = '2027b500-0000-4000-8000-000000000001';
END $t$;

-- ─── 4. Desligar em massa com um bloqueado; religar ──────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
SET LOCAL statement_timeout = '8s';
DO $t$
DECLARE r jsonb; t0 timestamptz := clock_timestamp(); n int := cardinality(current_setting('teste.ids')::uuid[]);
BEGIN
  r := public.cat_definir_armazem_produtos(current_setting('teste.ids')::uuid[], '2027b500-0000-4000-8000-000000000001', false);
  PERFORM set_config('teste.t_desligar', round(extract(epoch FROM clock_timestamp() - t0) * 1000)::text, true);
  IF (r->>'alterados')::int <> n - 1 OR jsonb_array_length(r->'recusados') <> 1
     OR r->'recusados'->0->>'product_id' <> current_setting('teste.p5') OR position('5 unidade' IN r->'recusados'->0->>'motivo') = 0
     OR r->'recusados'->0->>'nome' IS NULL THEN
    RAISE EXCEPTION 'FALHOU: desligar em massa: %', left(r::text, 500);
  END IF;
  IF (r->>'gere_stock_desligados')::int <> 0 OR (r->>'gere_stock_ligados')::int <> 0 THEN
    RAISE EXCEPTION 'FALHOU: desligar armazéns não devia mexer na gestão de stock: %', left(r::text, 300);
  END IF;
  t0 := clock_timestamp();
  r := public.cat_definir_armazem_produtos(current_setting('teste.ids')::uuid[], '2027b500-0000-4000-8000-000000000001', true);
  PERFORM set_config('teste.t_religar', round(extract(epoch FROM clock_timestamp() - t0) * 1000)::text, true);
  IF (r->>'alterados')::int <> n - 1 OR jsonb_array_length(r->'recusados') <> 0 THEN RAISE EXCEPTION 'FALHOU: religar: %', left(r::text, 500); END IF;
END $t$;
SET LOCAL statement_timeout = 0;
RESET ROLE;
DO $t$
DECLARE n int := cardinality(current_setting('teste.ids')::uuid[]);
BEGIN
  IF EXISTS (SELECT 1 FROM products WHERE id = ANY (current_setting('teste.ids')::uuid[]) AND NOT manages_stock) THEN
    RAISE EXCEPTION 'FALHOU: desligar todos os armazéns não pode desligar a gestão de stock';
  END IF;
  IF (SELECT count(*) FROM stocks WHERE warehouse_id = '2027b500-0000-4000-8000-000000000001') <> n
     OR (SELECT count(*) FROM stocks WHERE warehouse_id = '2027b500-0000-4000-8000-000000000001' AND deleted_at IS NULL) <> n
     OR (SELECT quantity FROM stocks WHERE product_id = current_setting('teste.p5')::uuid AND warehouse_id = '2027b500-0000-4000-8000-000000000001') <> 5 THEN
    RAISE EXCEPTION 'FALHOU: religar devia reativar as mesmas linhas sem mexer na quantidade';
  END IF;
  -- produto em rascunho marcado: não entra na contagem
  UPDATE products SET status = 'draft' WHERE id = (current_setting('teste.ids')::uuid[])[2];
END $t$;

-- ─── 5, 6, 7. Contagem inicial; desligar com contagem aberta; mensagem individual ─
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
SET LOCAL statement_timeout = '8s';
DO $t$
DECLARE r jsonb; t0 timestamptz := clock_timestamp(); n int := cardinality(current_setting('teste.ids')::uuid[]);
BEGIN
  r := public.rpc_create_inventory_count(current_setting('teste.org')::uuid, '2027b500-0000-4000-8000-000000000001', NULL, true);
  PERFORM set_config('teste.t_contagem', round(extract(epoch FROM clock_timestamp() - t0) * 1000)::text, true);
  IF (r->>'lines_seeded')::int <> n - 1 OR (r->>'stock_rows_created')::int <> 0 OR (r->>'initial')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: contagem inicial: %', r;
  END IF;
  IF (SELECT count(*) FROM stocks) <> current_setting('teste.stocks0')::int + n THEN
    RAISE EXCEPTION 'FALHOU: a contagem inicial criou linhas de stocks';
  END IF;
  t0 := clock_timestamp();
  r := public.cat_definir_armazem_produtos(current_setting('teste.ids')::uuid[], '2027b500-0000-4000-8000-000000000001', false);
  PERFORM set_config('teste.t_bloq', round(extract(epoch FROM clock_timestamp() - t0) * 1000)::text, true);
  -- todos recusados: o rascunho não entrou na contagem, mas os outros sim; o de 5 un. pela quantidade
  IF (r->>'alterados')::int <> 1 OR jsonb_array_length(r->'recusados') <> n - 1 THEN
    RAISE EXCEPTION 'FALHOU: desligar com contagem aberta (só o rascunho sai): alterados %, recusados %', r->>'alterados', jsonb_array_length(r->'recusados');
  END IF;
  BEGIN
    PERFORM public.cat_definir_armazem_produto(current_setting('teste.p5')::uuid, '2027b500-0000-4000-8000-000000000001', false);
    RAISE EXCEPTION 'FALHOU: individual com stock aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    IF position('5 unidade' IN SQLERRM) = 0 THEN RAISE EXCEPTION 'FALHOU: mensagem individual: %', SQLERRM; END IF;
  END;
  -- desligar o último armazém do consumível novo: gere_stock continua true
  IF (public.cat_definir_armazem_produto(current_setting('teste.novo')::uuid, '2027b500-0000-4000-8000-000000000001', true)->>'gere_stock')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: ligar devia devolver gere_stock true';
  END IF;
  -- ─── 8. Limite ───
  BEGIN
    PERFORM public.cat_definir_armazem_produtos(ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 5001)), '2027b500-0000-4000-8000-000000000001', true);
    RAISE EXCEPTION 'FALHOU: mais de 5000 aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
END $t$;
SET LOCAL statement_timeout = 0;
RESET ROLE;
DO $t$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  DELETE FROM anew_role_permissions rp USING anew_memberships am
  WHERE rp.role_id = am.role_id AND am.user_id = current_setting('teste.act')::uuid AND am.organization_id = current_setting('teste.org')::uuid
    AND am.status = 'active' AND rp.permission_code = 'inventory.edit';
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.cat_definir_armazem_produtos(current_setting('teste.ids')::uuid[], '2027b500-0000-4000-8000-000000000001', true);
    RAISE EXCEPTION 'FALHOU: sem inventory.edit aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_cat_armazem_bloqueios(uuid,uuid,uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cat_definir_armazem_produtos(uuid[],uuid,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_definir_armazem_produtos(uuid[],uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: grants';
  END IF;
END $t$;

SELECT format('OK: 20270101240000 — 8 grupos passaram%s; %s produtos; ms: ligar %s, desligar %s, religar %s, contagem inicial %s, desligar bloqueado %s',
              CASE WHEN current_setting('teste.portal') = '' THEN ' (rpc_catalog_link saltado: sem portal)' ELSE '' END,
              cardinality(current_setting('teste.ids')::uuid[]), current_setting('teste.t_ligar'), current_setting('teste.t_desligar'),
              current_setting('teste.t_religar'), current_setting('teste.t_contagem'), current_setting('teste.t_bloq')) AS resultado;

ROLLBACK;
