-- ============================================================
-- Testes: 20270101210000_catalogo_ligar_portal_entra_no_catalogo.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: cria 3 produtos e 3 artigos do catálogo próprios (prefixo
-- "Teste 2027 portal") no fornecedor ligado ao portal da organização, liga-os por rpc_catalog_link como um utilizador com products.edit
-- que não é system admin (role authenticated, auth.uid() pelas claims; permissões em falta dadas só nesta transação) e desfaz tudo.
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/catalogo_ligar_portal_entra_no_catalogo.test.sql
--
-- Cobre:
--   1. Produto sem tipo nem unidade ligado a um artigo 'Kg' → tipo_catalogo 'produto', unidade 'kg'; aparece em cat_ler_catalogo.produtos
--   2. Produto 'consumivel' / 'saco' ligado a um artigo em caixa de 12 → nada muda
--   3. Produto sem tipo mas com unidade 'm' ligado a uma caixa de 12 → tipo 'produto', a unidade fica 'm'
--   4. Correção de dados: não há produtos ligados ao portal fora do Catálogo; um produto sem ligação continua fora
--   5. fn_cat_unidade_do_artigo: rótulos frequentes e grants (interna)
--   6. Em massa: 4 artigos importados, 4 produtos ligados um a um (como BulkCreateProductsDialog); uma ligação falha a meio → essa
--      fica sem ligação e sem tipo (nada a meio), as outras entram com unidade; religada depois, entra
-- ============================================================

BEGIN;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  v_org uuid; v_auth uuid; v_act uuid; v_sup uuid; v_acc uuid;
BEGIN
  SELECT l.organization_id, l.supplier_id, l.supplier_account_id INTO v_org, v_sup, v_acc
  FROM supplier_account_links l JOIN suppliers s ON s.id = l.supplier_id AND s.deleted_at IS NULL
  WHERE l.status = 'active' AND l.revoked_at IS NULL ORDER BY l.created_at LIMIT 1;
  IF v_sup IS NULL THEN RAISE EXCEPTION 'FALHOU: base sem fornecedor ligado ao portal'; END IF;
  SELECT u.auth_user_id, u.id INTO v_auth, v_act FROM anew_users u
  WHERE u.auth_user_id IS NOT NULL AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', v_org)
    AND NOT public.is_system_admin_user(u.auth_user_id)
  ORDER BY u.created_at NULLS LAST, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: sem utilizador (não system admin) com products.edit na organização %', v_org; END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO anew_role_permissions (role_id, permission_code, created_by)
  SELECT am.role_id, c, NULL::uuid
  FROM anew_memberships am CROSS JOIN unnest(ARRAY['products.edit', 'suppliers.view', 'services.view']) c
  WHERE am.user_id = v_act AND am.organization_id = v_org AND am.status = 'active'
  ON CONFLICT (role_id, permission_code) DO NOTHING;
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                        manages_stock, created_by, tipo_catalogo, unidade)
  VALUES ('2027a100-0000-4000-8000-000000000001', v_org, 'TESTE-2027P-1', 'Teste 2027 portal 1', 'active', true, true, true, false, false, false, v_act, NULL, NULL),
         ('2027a100-0000-4000-8000-000000000002', v_org, 'TESTE-2027P-2', 'Teste 2027 portal 2', 'active', true, false, true, false, false, false, v_act, 'consumivel', 'saco'),
         ('2027a100-0000-4000-8000-000000000003', v_org, 'TESTE-2027P-3', 'Teste 2027 portal 3', 'active', true, true, true, false, false, false, v_act, NULL, 'm'),
         ('2027a100-0000-4000-8000-000000000004', v_org, 'TESTE-2027P-4', 'Teste 2027 portal 4 sem ligação', 'active', true, true, true, false, false, false, v_act, NULL, NULL);
  INSERT INTO supplier_catalog_items (id, supplier_account_id, supplier_ref, name, unit_label, units_per_pack, base_price, currency)
  VALUES ('2027d100-0000-4000-8000-000000000001', v_acc, 'TESTE2027P1', 'Teste 2027 portal artigo kg', 'Kg', NULL, 3.00, 'EUR'),
         ('2027d100-0000-4000-8000-000000000002', v_acc, 'TESTE2027P2', 'Teste 2027 portal artigo cx A', 'cx', 12, 24.00, 'EUR'),
         ('2027d100-0000-4000-8000-000000000003', v_acc, 'TESTE2027P3', 'Teste 2027 portal artigo cx B', 'cx', 12, 24.00, 'EUR');

  PERFORM set_config('teste.org', v_org::text, true);
  PERFORM set_config('teste.sup', v_sup::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
END $fx$;

-- ─── 1, 2, 3. Ligar ──────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_sup uuid := current_setting('teste.sup')::uuid; j jsonb;
BEGIN
  PERFORM public.rpc_catalog_link(v_sup, '2027d100-0000-4000-8000-000000000001', '2027a100-0000-4000-8000-000000000001', NULL, false);
  PERFORM public.rpc_catalog_link(v_sup, '2027d100-0000-4000-8000-000000000002', '2027a100-0000-4000-8000-000000000002', NULL, false);
  PERFORM public.rpc_catalog_link(v_sup, '2027d100-0000-4000-8000-000000000003', '2027a100-0000-4000-8000-000000000003', NULL, false);
  j := public.cat_ler_catalogo(current_setting('teste.org')::uuid);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'produtos') e
                 WHERE e->>'id' = '2027a100-0000-4000-8000-000000000001' AND e->>'tipo_catalogo' = 'produto' AND e->>'unidade' = 'kg') THEN
    RAISE EXCEPTION 'FALHOU: o produto ligado não aparece em cat_ler_catalogo.produtos';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(j->'produtos') e WHERE e->>'id' = '2027a100-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'FALHOU: o produto sem ligação apareceu no Catálogo';
  END IF;
END $t$;
RESET ROLE;
DO $t$
DECLARE v record;
BEGIN
  SELECT tipo_catalogo, unidade INTO v FROM products WHERE id = '2027a100-0000-4000-8000-000000000001';
  IF v.tipo_catalogo IS DISTINCT FROM 'produto' OR v.unidade IS DISTINCT FROM 'kg' THEN RAISE EXCEPTION 'FALHOU: produto 1: %', v; END IF;
  SELECT tipo_catalogo, unidade INTO v FROM products WHERE id = '2027a100-0000-4000-8000-000000000002';
  IF v.tipo_catalogo IS DISTINCT FROM 'consumivel' OR v.unidade IS DISTINCT FROM 'saco' THEN RAISE EXCEPTION 'FALHOU: produto 2 mudou: %', v; END IF;
  SELECT tipo_catalogo, unidade INTO v FROM products WHERE id = '2027a100-0000-4000-8000-000000000003';
  IF v.tipo_catalogo IS DISTINCT FROM 'produto' OR v.unidade IS DISTINCT FROM 'm' THEN RAISE EXCEPTION 'FALHOU: produto 3: %', v; END IF;
  SELECT tipo_catalogo, unidade INTO v FROM products WHERE id = '2027a100-0000-4000-8000-000000000004';
  IF v.tipo_catalogo IS NOT NULL OR v.unidade IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: produto sem ligação mudou: %', v; END IF;

  -- ─── 4. Correção de dados ───
  IF EXISTS (SELECT 1 FROM products p
             JOIN item_suppliers i ON i.product_id = p.id AND i.catalog_item_id IS NOT NULL AND i.deleted_at IS NULL
             WHERE p.tipo_catalogo IS NULL AND NOT p.is_deleted AND p.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'FALHOU: há produtos ligados ao portal fora do Catálogo';
  END IF;

  -- ─── 5. Unidades e grants ───
  IF public.fn_cat_unidade_do_artigo('un', 50) <> 'un' OR public.fn_cat_unidade_do_artigo('kg', 12) <> 'un'
     OR public.fn_cat_unidade_do_artigo('Litros', NULL) <> 'l' OR public.fn_cat_unidade_do_artigo('M²', 1) <> 'm²'
     OR public.fn_cat_unidade_do_artigo('Caixa', 1) <> 'cx' OR public.fn_cat_unidade_do_artigo('', NULL) <> 'un'
     OR public.fn_cat_unidade_do_artigo('palete', NULL) <> 'palete' THEN
    RAISE EXCEPTION 'FALHOU: fn_cat_unidade_do_artigo';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_cat_unidade_do_artigo(text,numeric)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_cat_unidade_do_artigo(text,numeric)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_catalog_link(uuid,uuid,uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: grants';
  END IF;
END $t$;

-- ─── 6. Em massa (como BulkCreateProductsDialog: um produto + um rpc_catalog_link por artigo, em sequência) ─
-- 4 artigos chegados de uma vez (como os grava sp_catalog_import), 4 produtos novos sem tipo; o 3.º falha (artigo já ligado a outro
-- produto): essa ligação é recusada por inteiro, o produto fica como estava (sem ligação, sem tipo) e as outras entram no Catálogo.
DO $fx$
DECLARE v_acc uuid; v_org uuid := current_setting('teste.org')::uuid; v_act uuid; k int;
BEGIN
  SELECT supplier_account_id INTO v_acc FROM supplier_account_links WHERE supplier_id = current_setting('teste.sup')::uuid AND status = 'active';
  SELECT created_by INTO v_act FROM products WHERE id = '2027a100-0000-4000-8000-000000000001';
  FOR k IN 1..4 LOOP
    INSERT INTO supplier_catalog_items (id, supplier_account_id, supplier_ref, name, unit_label, units_per_pack, base_price, currency)
    VALUES (('2027d200-0000-4000-8000-00000000000' || k)::uuid, v_acc, 'TESTE2027B' || k, 'Teste 2027 massa artigo ' || k,
            (ARRAY['un', 'm2', 'Litros', 'saco'])[k], CASE WHEN k = 4 THEN 25 END, 10 * k, 'EUR');
    INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                          manages_stock, created_by)
    VALUES (('2027a200-0000-4000-8000-00000000000' || k)::uuid, v_org, 'TESTE-2027B-' || k, 'Teste 2027 massa ' || k, 'active',
            true, true, true, false, false, false, v_act);
  END LOOP;
END $fx$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_sup uuid := current_setting('teste.sup')::uuid; k int; v_falhas int := 0;
BEGIN
  FOR k IN 1..4 LOOP
    BEGIN
      PERFORM public.rpc_catalog_link(v_sup,
        -- o 3.º tenta o artigo 1 (já ligado ao produto 1 neste ciclo) → unique_violation
        ('2027d200-0000-4000-8000-00000000000' || CASE WHEN k = 3 THEN 1 ELSE k END)::uuid,
        ('2027a200-0000-4000-8000-00000000000' || k)::uuid, NULL, false);
    EXCEPTION WHEN unique_violation THEN v_falhas := v_falhas + 1;
    END;
  END LOOP;
  IF v_falhas <> 1 THEN RAISE EXCEPTION 'FALHOU: esperava 1 falha na massa, houve %', v_falhas; END IF;
END $t$;
RESET ROLE;
DO $t$
DECLARE v record;
BEGIN
  FOR v IN SELECT p.id, p.tipo_catalogo, p.unidade,
                  EXISTS (SELECT 1 FROM item_suppliers i WHERE i.product_id = p.id AND i.catalog_item_id IS NOT NULL AND i.deleted_at IS NULL) AS ligado
           FROM products p WHERE p.id::text LIKE '2027a200-%' ORDER BY p.sku LOOP
    IF v.id = '2027a200-0000-4000-8000-000000000003' THEN
      IF v.ligado OR v.tipo_catalogo IS NOT NULL OR v.unidade IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: a ligação falhada deixou meio estado: %', v; END IF;
    ELSIF NOT v.ligado OR v.tipo_catalogo IS DISTINCT FROM 'produto' THEN
      RAISE EXCEPTION 'FALHOU: produto da massa fora do Catálogo: %', v;
    END IF;
  END LOOP;
  IF (SELECT unidade FROM products WHERE id = '2027a200-0000-4000-8000-000000000001') <> 'un'
     OR (SELECT unidade FROM products WHERE id = '2027a200-0000-4000-8000-000000000002') <> 'm²'
     OR (SELECT unidade FROM products WHERE id = '2027a200-0000-4000-8000-000000000004') <> 'un' THEN
    RAISE EXCEPTION 'FALHOU: unidades da massa';
  END IF;
END $t$;
-- voltar a ligar o que falhou (ao artigo 3, livre) → entra
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
SELECT public.rpc_catalog_link(current_setting('teste.sup')::uuid, '2027d200-0000-4000-8000-000000000003',
                               '2027a200-0000-4000-8000-000000000003', NULL, false) IS NOT NULL AS religado;
RESET ROLE;
DO $t$
BEGIN
  IF (SELECT tipo_catalogo || '/' || unidade FROM products WHERE id = '2027a200-0000-4000-8000-000000000003') IS DISTINCT FROM 'produto/l' THEN
    RAISE EXCEPTION 'FALHOU: o produto religado não entrou no Catálogo com a unidade l';
  END IF;
END $t$;

SELECT 'OK: 20270101210000 — 6 grupos de testes passaram' AS resultado;

ROLLBACK;
