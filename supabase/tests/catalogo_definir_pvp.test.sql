-- ============================================================
-- Testes: 20270101220000_catalogo_definir_pvp.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: cria 2 produtos próprios (prefixo "Teste 2027 pvp") na
-- organização do Catálogo, como um utilizador com products.edit que não é system admin (role authenticated, auth.uid() pelas claims;
-- products.manage_prices dada só nesta transação) e desfaz tudo.
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/catalogo_definir_pvp.test.sql
--
-- Cobre:
--   1. Fora da organização → CT001
--   2. Produto sem PVP: insere 1 linha retail (25,50, preco_exato), o custo (purchase) fica intacto
--   3. O mesmo valor → nada escrito
--   4. Valor novo → a MESMA linha muda (price 2 casas, preco_exato 6), continua 1 linha retail
--   5. Produto com 1 linha retail com preco_exato → atualizada, continua 1
--   6. 0 e negativo → CT002
--   7. NULL → apaga as linhas retail só desse produto; o outro e o custo ficam
--   8. Sem products.manage_prices → CT001
--   9. Grants
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
  SELECT am.role_id, 'products.manage_prices', NULL::uuid FROM anew_memberships am
  WHERE am.user_id = v_act AND am.organization_id = v_org AND am.status = 'active'
  ON CONFLICT (role_id, permission_code) DO NOTHING;
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                        manages_stock, created_by, tipo_catalogo, unidade)
  VALUES ('2027a300-0000-4000-8000-000000000001', v_org, 'TESTE-2027V-1', 'Teste 2027 pvp 1', 'active', true, true, true, false, false, false, v_act, 'produto', 'un'),
         ('2027a300-0000-4000-8000-000000000002', v_org, 'TESTE-2027V-2', 'Teste 2027 pvp 2', 'active', true, true, true, false, false, false, v_act, 'produto', 'un');
  INSERT INTO product_prices (id, product_id, price_type, price, preco_exato, currency, valid_from, created_by, updated_at)
  VALUES ('2027f300-0000-4000-8000-000000000001', '2027a300-0000-4000-8000-000000000001', 'purchase', 10.00, 10.004, 'EUR', now() - interval '2 days', v_act, '2026-01-01'),
         ('2027f300-0000-4000-8000-000000000002', '2027a300-0000-4000-8000-000000000002', 'purchase',  8.00, NULL,   'EUR', now() - interval '2 days', v_act, '2026-01-01'),
         ('2027f300-0000-4000-8000-000000000003', '2027a300-0000-4000-8000-000000000002', 'retail',   20.00, 19.999, 'EUR', now() - interval '1 day',  v_act, '2026-01-01');

  PERFORM set_config('teste.org', v_org::text, true);
  PERFORM set_config('teste.act', v_act::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
END $fx$;

-- ─── 1. Fora da organização ──────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.cat_definir_pvp('2027a300-0000-4000-8000-000000000001', 25.5);
    RAISE EXCEPTION 'FALHOU: PVP fora da organização foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
END $t$;
RESET ROLE;

-- ─── 2. Sem PVP → insere ─────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.cat_definir_pvp('2027a300-0000-4000-8000-000000000001', 25.5);
  IF r <> '{"ok": true, "pvp": 25.50}'::jsonb THEN RAISE EXCEPTION 'FALHOU: retorno ao definir: %', r; END IF;
END $t$;
RESET ROLE;
DO $t$
DECLARE v record;
BEGIN
  IF (SELECT count(*) FROM product_prices WHERE product_id = '2027a300-0000-4000-8000-000000000001' AND price_type = 'retail') <> 1 THEN
    RAISE EXCEPTION 'FALHOU: devia haver 1 linha retail';
  END IF;
  SELECT id, price, preco_exato, currency::text AS ccy, valid_from INTO v FROM product_prices
  WHERE product_id = '2027a300-0000-4000-8000-000000000001' AND price_type = 'retail';
  IF v.price <> 25.50 OR v.preco_exato <> 25.5 OR v.ccy <> 'EUR' OR v.valid_from IS NULL THEN RAISE EXCEPTION 'FALHOU: linha retail: %', v; END IF;
  PERFORM set_config('teste.linha', v.id::text, true);
  -- para ver o «nada escrito» a seguir: um UPDATE cria uma versão nova da linha (ctid muda); updated_at não serve (o gatilho põe now())
  PERFORM set_config('teste.ctid', (SELECT ctid::text FROM product_prices WHERE id = v.id), true);
  SELECT price, preco_exato, updated_at INTO v FROM product_prices WHERE id = '2027f300-0000-4000-8000-000000000001';
  IF v.price <> 10.00 OR v.preco_exato <> 10.004 OR v.updated_at <> '2026-01-01' THEN RAISE EXCEPTION 'FALHOU: o custo mexeu: %', v; END IF;
END $t$;

-- ─── 3, 4, 5, 6. Igual; novo; produto com PVP; inválidos ─────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.cat_definir_pvp('2027a300-0000-4000-8000-000000000001', 25.50);
  IF (r->>'pvp')::numeric <> 25.50 THEN RAISE EXCEPTION 'FALHOU: retorno no mesmo valor: %', r; END IF;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF (SELECT ctid::text FROM product_prices WHERE id = current_setting('teste.linha')::uuid) <> current_setting('teste.ctid') THEN
    RAISE EXCEPTION 'FALHOU: o mesmo PVP escreveu na linha';
  END IF;
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.cat_definir_pvp('2027a300-0000-4000-8000-000000000001', 30.123);
  IF (r->>'pvp')::numeric <> 30.12 THEN RAISE EXCEPTION 'FALHOU: retorno ao mudar: %', r; END IF;
  r := public.cat_definir_pvp('2027a300-0000-4000-8000-000000000002', 20);
  IF (r->>'pvp')::numeric <> 20 THEN RAISE EXCEPTION 'FALHOU: retorno no produto com PVP: %', r; END IF;
  BEGIN
    PERFORM public.cat_definir_pvp('2027a300-0000-4000-8000-000000000001', 0);
    RAISE EXCEPTION 'FALHOU: PVP 0 foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_definir_pvp('2027a300-0000-4000-8000-000000000001', -5);
    RAISE EXCEPTION 'FALHOU: PVP negativo foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
END $t$;
RESET ROLE;
DO $t$
DECLARE v record;
BEGIN
  IF (SELECT count(*) FROM product_prices WHERE product_id = '2027a300-0000-4000-8000-000000000001' AND price_type = 'retail') <> 1 THEN
    RAISE EXCEPTION 'FALHOU: mudar o PVP criou linhas';
  END IF;
  SELECT price, preco_exato INTO v FROM product_prices WHERE id = current_setting('teste.linha')::uuid;
  IF v.price <> 30.12 OR v.preco_exato <> 30.123 THEN RAISE EXCEPTION 'FALHOU: a linha atual devia ter 30,12/30,123: %', v; END IF;
  IF (SELECT count(*) FROM product_prices WHERE product_id = '2027a300-0000-4000-8000-000000000002' AND price_type = 'retail') <> 1 THEN
    RAISE EXCEPTION 'FALHOU: o produto 2 devia continuar com 1 linha retail';
  END IF;
  SELECT price, preco_exato INTO v FROM product_prices WHERE id = '2027f300-0000-4000-8000-000000000003';
  IF v.price <> 20.00 OR v.preco_exato <> 20 THEN RAISE EXCEPTION 'FALHOU: produto 2 (preco_exato antigo 19,999): %', v; END IF;
END $t$;

-- ─── 7. Limpar ───────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  r := public.cat_definir_pvp('2027a300-0000-4000-8000-000000000001', NULL);
  IF r <> '{"ok": true, "pvp": null}'::jsonb THEN RAISE EXCEPTION 'FALHOU: retorno ao limpar: %', r; END IF;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF EXISTS (SELECT 1 FROM product_prices WHERE product_id = '2027a300-0000-4000-8000-000000000001' AND price_type = 'retail') THEN
    RAISE EXCEPTION 'FALHOU: limpar devia apagar as linhas retail do produto';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM product_prices WHERE id = '2027f300-0000-4000-8000-000000000001' AND price = 10.00 AND updated_at = '2026-01-01')
     OR NOT EXISTS (SELECT 1 FROM product_prices WHERE id = '2027f300-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'FALHOU: limpar mexeu no custo ou noutro produto';
  END IF;

  -- ─── 8. Sem products.manage_prices ───
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  DELETE FROM anew_role_permissions rp USING anew_memberships am
  WHERE rp.role_id = am.role_id AND am.user_id = current_setting('teste.act')::uuid AND am.organization_id = current_setting('teste.org')::uuid
    AND am.status = 'active' AND rp.permission_code = 'products.manage_prices';
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.cat_definir_pvp('2027a300-0000-4000-8000-000000000002', 40);
    RAISE EXCEPTION 'FALHOU: sem products.manage_prices foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
END $t$;
RESET ROLE;

-- ─── 9. Grants ───────────────────────────────────────────────────────────────
DO $t$
BEGIN
  IF has_function_privilege('anon', 'public.cat_definir_pvp(uuid,numeric)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_definir_pvp(uuid,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: grants de cat_definir_pvp';
  END IF;
END $t$;

SELECT 'OK: 20270101220000 — 9 grupos de testes passaram' AS resultado;

ROLLBACK;
