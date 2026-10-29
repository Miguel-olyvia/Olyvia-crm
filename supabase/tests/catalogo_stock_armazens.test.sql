-- ============================================================
-- Testes: 20270101230000_catalogo_stock_armazens.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: na organização do Catálogo cria 1 produto pela ficha
-- (cat_guardar_produto) e 2 armazéns de teste (um ativo, um inativo), como um utilizador com products.edit que não é system admin
-- (role authenticated, auth.uid() pelas claims; inventory.edit/view/count e services.view dadas só nesta transação) e desfaz tudo.
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/catalogo_stock_armazens.test.sql
--
-- Cobre:
--   1. Correção de dados: nenhum produto/consumível do Catálogo sem product_organizations; cat_guardar_produto cria a linha
--   2. cat_produto_stock: chaves do contrato, gere_stock false, todos os armazéns da organização, ativo false
--   3. Ligar armazém: linha de stocks a 0 com mínimo, manages_stock passa a true; atualizar só a localização mantém o mínimo
--   4. Armazém inativo → CT002; mínimo não inteiro → CT002; armazém que não é da organização → CT003
--   5. Desligar com stock (5 un.) → CT002 com a quantidade na mensagem; a 0 → desliga, gere_stock continua (outro armazém ativo)
--   6. Desligar com linha de PO por receber → CT002
--   7. Desligar o último armazém → manages_stock false; voltar a ligar reativa a MESMA linha, sem mexer na quantidade
--   8. Sem inventory.edit → CT001; fora da organização → CT001 na leitura
--   9. Contagem inicial (rpc_create_inventory_count) já inclui produtos e consumíveis do Catálogo
--  10. Grants
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
  CROSS JOIN unnest(ARRAY['products.edit', 'services.view', 'inventory.view', 'inventory.edit', 'inventory.count']) c
  WHERE am.user_id = v_act AND am.organization_id = v_org AND am.status = 'active'
  ON CONFLICT (role_id, permission_code) DO NOTHING;
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO warehouses (id, name, code, is_active, created_by, organization_id)
  VALUES ('2027b400-0000-4000-8000-000000000001', 'Teste 2027 armazém consumíveis', 'TESTE2027W1', true,  v_act, v_org),
         ('2027b400-0000-4000-8000-000000000002', 'Teste 2027 armazém inativo',     'TESTE2027W2', false, v_act, v_org);

  PERFORM set_config('teste.org', v_org::text, true);
  PERFORM set_config('teste.act', v_act::text, true);
  PERFORM set_config('teste.lx', (SELECT id::text FROM warehouses WHERE organization_id = v_org AND deleted_at IS NULL AND is_active
                                  AND id::text NOT LIKE '2027b400-%' ORDER BY created_at LIMIT 1), true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
END $fx$;

-- ─── 1. Correção de dados e cat_guardar_produto ──────────────────────────────
DO $t$
BEGIN
  IF current_setting('teste.lx', true) IS NULL OR current_setting('teste.lx') = '' THEN RAISE EXCEPTION 'FALHOU: organização sem armazém ativo'; END IF;
  IF EXISTS (SELECT 1 FROM products p WHERE p.tipo_catalogo IN ('produto', 'consumivel') AND NOT p.is_deleted AND p.deleted_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM product_organizations po WHERE po.product_id = p.id AND po.organization_id = p.organization_id)) THEN
    RAISE EXCEPTION 'FALHOU: há produtos do Catálogo sem product_organizations';
  END IF;
  IF EXISTS (SELECT 1 FROM products WHERE tipo_catalogo IS NOT NULL AND manages_stock AND NOT is_deleted
               AND id NOT IN (SELECT product_id FROM stocks WHERE deleted_at IS NULL)) THEN
    RAISE NOTICE 'há produtos do Catálogo com manages_stock sem armazém (anteriores a esta migration)';
  END IF;
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_id uuid; j jsonb; k text[]; a jsonb;
BEGIN
  v_id := public.cat_guardar_produto(current_setting('teste.org')::uuid, NULL, 'produto', 'Teste 2027 stock produto', 'TESTE-2027S-1',
                                     'un', NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM set_config('teste.p', v_id::text, true);

  -- ─── 2. Leitura ───
  j := public.cat_produto_stock(v_id);
  SELECT array_agg(x ORDER BY x COLLATE "C") INTO k FROM jsonb_object_keys(j) x;
  IF k <> ARRAY['armazens', 'gere_stock', 'pode_editar'] THEN RAISE EXCEPTION 'FALHOU: chaves de topo: %', k; END IF;
  IF (j->>'gere_stock')::boolean IS NOT FALSE OR (j->>'pode_editar')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: topo: %', j; END IF;
  IF jsonb_array_length(j->'armazens') <> (SELECT count(*) FROM warehouses WHERE organization_id = current_setting('teste.org')::uuid AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'FALHOU: devia listar todos os armazéns da organização: %', j;
  END IF;
  SELECT e INTO a FROM jsonb_array_elements(j->'armazens') e WHERE e->>'warehouse_id' = current_setting('teste.lx');
  SELECT array_agg(x ORDER BY x COLLATE "C") INTO k FROM jsonb_object_keys(a) x;
  IF k <> ARRAY['ativo', 'codigo', 'localizacao', 'maximo', 'minimo', 'nome', 'ponto_encomenda', 'quantidade', 'reservado', 'warehouse_id'] THEN
    RAISE EXCEPTION 'FALHOU: chaves do armazém: %', k;
  END IF;
  IF (a->>'ativo')::boolean IS NOT FALSE OR a->'quantidade' <> 'null'::jsonb THEN RAISE EXCEPTION 'FALHOU: armazém por ligar: %', a; END IF;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM product_organizations WHERE product_id = current_setting('teste.p')::uuid
                 AND organization_id = current_setting('teste.org')::uuid) THEN
    RAISE EXCEPTION 'FALHOU: cat_guardar_produto não criou product_organizations';
  END IF;
END $t$;

-- ─── 3, 4. Ligar; inválidos ──────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE p uuid := current_setting('teste.p')::uuid; lx uuid := current_setting('teste.lx')::uuid; r jsonb; a jsonb;
BEGIN
  r := public.cat_definir_armazem_produto(p, lx, true, 2, 10, 3, 'Corredor 1');
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'gere_stock')::boolean IS NOT TRUE OR r->>'motivo' IS NULL THEN RAISE EXCEPTION 'FALHOU: ligar: %', r; END IF;
  r := public.cat_definir_armazem_produto(p, '2027b400-0000-4000-8000-000000000001', true);
  IF (r->>'gere_stock')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: ligar o 2.º armazém: %', r; END IF;
  r := public.cat_definir_armazem_produto(p, lx, true, NULL, NULL, NULL, 'Corredor 2');
  SELECT e INTO a FROM jsonb_array_elements(public.cat_produto_stock(p)->'armazens') e WHERE e->>'warehouse_id' = lx::text;
  IF (a->>'ativo')::boolean IS NOT TRUE OR (a->>'quantidade')::int <> 0 OR (a->>'minimo')::int <> 2 OR (a->>'maximo')::int <> 10
     OR (a->>'ponto_encomenda')::int <> 3 OR a->>'localizacao' <> 'Corredor 2' OR a->'reservado' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: dados do armazém: %', a;
  END IF;
  BEGIN
    PERFORM public.cat_definir_armazem_produto(p, '2027b400-0000-4000-8000-000000000002', true);
    RAISE EXCEPTION 'FALHOU: armazém inativo foi ligado';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_definir_armazem_produto(p, lx, true, 1.5);
    RAISE EXCEPTION 'FALHOU: mínimo não inteiro aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_definir_armazem_produto(p, gen_random_uuid(), true);
    RAISE EXCEPTION 'FALHOU: armazém de fora aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL;
  END;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF NOT (SELECT manages_stock FROM products WHERE id = current_setting('teste.p')::uuid) THEN
    RAISE EXCEPTION 'FALHOU: ligar um armazém devia pôr manages_stock = true';
  END IF;
  PERFORM set_config('teste.slx', (SELECT id::text FROM stocks WHERE product_id = current_setting('teste.p')::uuid
                                   AND warehouse_id = current_setting('teste.lx')::uuid), true);
  -- 5 un. no armazém de teste (só para o teste)
  UPDATE stocks SET quantity = 5 WHERE product_id = current_setting('teste.p')::uuid AND warehouse_id = '2027b400-0000-4000-8000-000000000001';
END $t$;

-- ─── 5. Desligar com stock / a 0 ─────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE p uuid := current_setting('teste.p')::uuid; r jsonb;
BEGIN
  BEGIN
    PERFORM public.cat_definir_armazem_produto(p, '2027b400-0000-4000-8000-000000000001', false);
    RAISE EXCEPTION 'FALHOU: desligar com stock foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    IF position('5 unidade' IN SQLERRM) = 0 THEN RAISE EXCEPTION 'FALHOU: a mensagem devia dizer a quantidade: %', SQLERRM; END IF;
  END;
END $t$;
RESET ROLE;
UPDATE stocks SET quantity = 0 WHERE product_id = current_setting('teste.p')::uuid AND warehouse_id = '2027b400-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.cat_definir_armazem_produto(current_setting('teste.p')::uuid, '2027b400-0000-4000-8000-000000000001', false);
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'gere_stock')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: desligar com outro armazém ativo devia manter gere_stock: %', r;
  END IF;
END $t$;
RESET ROLE;

-- ─── 6. Desligar com PO por receber ──────────────────────────────────────────
DO $t$
DECLARE v_po uuid;
BEGIN
  INSERT INTO purchase_orders (id, order_number, order_date, status, created_by, organization_id)
  VALUES ('2027e400-0000-4000-8000-000000000001', 'TESTE-2027-PO', current_date, 'pending', current_setting('teste.act')::uuid,
          current_setting('teste.org')::uuid);
  INSERT INTO purchase_order_items (purchase_order_id, item_type, product_id, description, quantity)
  VALUES ('2027e400-0000-4000-8000-000000000001', 'product', current_setting('teste.p')::uuid, 'Teste 2027', 3);
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.cat_definir_armazem_produto(current_setting('teste.p')::uuid, current_setting('teste.lx')::uuid, false);
    RAISE EXCEPTION 'FALHOU: desligar com PO por receber foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
END $t$;
RESET ROLE;
DELETE FROM purchase_order_items WHERE purchase_order_id = '2027e400-0000-4000-8000-000000000001';
DELETE FROM purchase_orders WHERE id = '2027e400-0000-4000-8000-000000000001';

-- ─── 7. Desligar o último; religar ───────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.cat_definir_armazem_produto(current_setting('teste.p')::uuid, current_setting('teste.lx')::uuid, false);
  IF (r->>'gere_stock')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FALHOU: sem armazéns devia deixar de gerir stock: %', r; END IF;
  IF (public.cat_produto_stock(current_setting('teste.p')::uuid)->>'gere_stock')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FALHOU: leitura gere_stock'; END IF;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF (SELECT manages_stock FROM products WHERE id = current_setting('teste.p')::uuid)
     OR (SELECT deleted_at FROM stocks WHERE id = current_setting('teste.slx')::uuid) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: desligar o último devia apagar a linha (reciclagem) e pôr manages_stock = false';
  END IF;
  UPDATE stocks SET quantity = 0 WHERE id = current_setting('teste.slx')::uuid;
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
SELECT public.cat_definir_armazem_produto(current_setting('teste.p')::uuid, current_setting('teste.lx')::uuid, true) IS NOT NULL AS religado;
RESET ROLE;
DO $t$
BEGIN
  IF (SELECT count(*) FROM stocks WHERE product_id = current_setting('teste.p')::uuid AND warehouse_id = current_setting('teste.lx')::uuid) <> 1
     OR (SELECT deleted_at FROM stocks WHERE id = current_setting('teste.slx')::uuid) IS NOT NULL
     OR (SELECT minimum_quantity FROM stocks WHERE id = current_setting('teste.slx')::uuid) <> 2
     OR NOT (SELECT manages_stock FROM products WHERE id = current_setting('teste.p')::uuid) THEN
    RAISE EXCEPTION 'FALHOU: religar devia reativar a mesma linha e voltar a gerir stock';
  END IF;

  -- ─── 8. Sem inventory.edit ───
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
    PERFORM public.cat_definir_armazem_produto(current_setting('teste.p')::uuid, '2027b400-0000-4000-8000-000000000001', true);
    RAISE EXCEPTION 'FALHOU: sem inventory.edit foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  IF (public.cat_produto_stock(current_setting('teste.p')::uuid)->>'pode_editar')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU: pode_editar devia ser false sem inventory.edit';
  END IF;
END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.cat_produto_stock(current_setting('teste.p')::uuid);
    RAISE EXCEPTION 'FALHOU: leitura fora da organização aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
END $t$;
RESET ROLE;

-- ─── 9. Contagem inicial com o Catálogo ──────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_cons uuid;
BEGIN
  r := public.rpc_create_inventory_count(current_setting('teste.org')::uuid, '2027b400-0000-4000-8000-000000000001', NULL, true);
  SELECT id INTO v_cons FROM products WHERE organization_id = current_setting('teste.org')::uuid AND tipo_catalogo = 'consumivel'
    AND NOT is_deleted AND deleted_at IS NULL AND status <> 'draft' LIMIT 1;
  IF (r->>'lines_seeded')::int < (SELECT count(*) FROM products WHERE organization_id = current_setting('teste.org')::uuid
                                   AND tipo_catalogo IS NOT NULL AND NOT is_deleted AND deleted_at IS NULL AND status <> 'draft') THEN
    RAISE EXCEPTION 'FALHOU: a contagem inicial não trouxe os produtos do Catálogo: %', r;
  END IF;
  IF v_cons IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inventory_count_lines WHERE inventory_count_id = (r->>'id')::uuid AND product_id = v_cons) THEN
    RAISE EXCEPTION 'FALHOU: os consumíveis deviam entrar na contagem inicial';
  END IF;
  PERFORM set_config('teste.cont', r::text, true);
END $t$;
RESET ROLE;

-- ─── 10. Grants ──────────────────────────────────────────────────────────────
DO $t$
BEGIN
  IF has_function_privilege('anon', 'public.cat_produto_stock(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_produto_stock(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cat_definir_armazem_produto(uuid,uuid,boolean,numeric,numeric,numeric,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_definir_armazem_produto(uuid,uuid,boolean,numeric,numeric,numeric,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: grants';
  END IF;
END $t$;

SELECT 'OK: 20270101230000 — 10 grupos de testes passaram; contagem inicial: ' || current_setting('teste.cont') AS resultado;

ROLLBACK;
