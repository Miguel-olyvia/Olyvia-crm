-- ============================================================
-- Testes: 20270119700000_catalogo_precos_grossista_distribuidor.sql (base RH)
-- ============================================================
-- Tudo dentro de BEGIN … ROLLBACK. Na Mudelar (3242e925-…) só LÊ (os preços preenchidos e a página). As escritas são na
-- nike (b6ffce4f-…): 2 produtos próprios («Teste 2027 revenda»), como um membro da nike que não é system admin
-- (role authenticated, auth.uid() pelas claims; products.edit, products.manage_prices e services.view dadas só nesta
-- transação se faltarem), e desfaz-se tudo.
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked -f supabase/tests/catalogo_precos_grossista_distribuidor.test.sql
-- O passo 0 FALHA antes da migration (a função não existe e os 42 produtos não têm grossista/distribuidor).
--
-- Cobre:
--   0. A função de gravar existe e os 42 produtos da Mudelar têm os preços (vermelho antes)
--   1. Mudelar: 30 grossista + 42 distribuidor, valores do ficheiro, nenhum grossista nos acessórios
--   2. Mudelar, página (membro com services.view): as chaves grossista/distribuidor, valores e null
--   3. nike, gravar: fora da organização → CT001; inexistente → CT003
--   4. Define os dois (insere 1+1, custo e PVP intactos); o mesmo valor → nada; valor novo → a mesma linha; 0 aceite
--   5. NULL apaga só esse tipo, só desse produto
--   6. Negativo, 3 casas, demasiado alto → CT002, e nada escrito
--   7. Leituras: a página e cat_ler_catalogo (a ficha) devolvem os dois
--   8. Membro sem products.edit nem manage_prices → CT001
--   9. Acessos
-- ============================================================

BEGIN;

-- ─── 0. Passo vermelho ───────────────────────────────────────────────────────
DO $t$
DECLARE v_g bigint; v_d bigint;
BEGIN
  CREATE TEMP TABLE _t_linhas (fonte text NOT NULL, linha integer NOT NULL, nome text NOT NULL, grossista numeric, distribuidor numeric) ON COMMIT DROP;
  INSERT INTO _t_linhas (fonte, linha, nome, grossista, distribuidor) VALUES
    ('lava', 2, 'Lava-louças AMBAR 86 C/ESCORREDOR 1 CUBA', 12.00, 11.00),
    ('lava', 3, 'Lava-louças VELAR 1 CUBA 45', 12.00, 11.00),
    ('lava', 4, 'Lava-louças KERAN 80 C/ESCORREDOR 1 CUBA', 12.00, 11.00),
    ('lava', 5, 'Lava-louças AMBAR 1 CUBA 40 N', 12.00, 11.00),
    ('lava', 7, 'Lava-louças AMBAR 105 C/ESCORREDOR 2 CUBAS', 12.00, 11.00),
    ('lava', 8, 'Lava-louças VELAR 1 CUBA 34', 12.00, 11.00),
    ('lava', 9, 'Lava-louças UNA 55 - 2 CUBAS', 12.00, 11.00),
    ('lava', 10, 'Lava-louças VELAR 1 CUBA 50', 12.00, 11.00),
    ('lava', 11, 'Lava-louças LODY PVD 1 CUBA 50', 12.00, 11.00),
    ('lava', 12, 'Lava-louças DUO 80 - 2 CUBAS', 12.00, 11.00),
    ('lava', 13, 'Lava-louças BAHIA 1 CUBA', 12.00, 11.00),
    ('lava', 14, 'Lava-louças AMBAR 100 C/ESCORREDOR 1 CUBA', 12.00, 11.00),
    ('lava', 15, 'Lava-louças LODY PVD 1 CUBA 40', 12.00, 11.00),
    ('lava', 16, 'Lava-louças VELAR 1 CUBA 40', 12.00, 11.00),
    ('lava', 17, 'Lava-louças BELÉM 1 CUBA', 12.00, 11.00),
    ('lava', 18, 'Lava-louças AMBAR 1.5 CUBA 55', 12.00, 11.00),
    ('lava', 19, 'Lava-louças UNA 75 - 2 CUBAS', 12.00, 11.00),
    ('lava', 20, 'Lava-louças LAGUNA 1 CUBA', 12.00, 11.00),
    ('lava', 21, 'Lava-louças BRASILIA 1 CUBA', 12.00, 11.00),
    ('lava', 22, 'Lava-louças DUO 60 - 2 CUBAS', 12.00, 11.00),
    ('lava', 23, 'Lava-louças AMBAR 1 CUBA 40', 12.00, 11.00),
    ('lava', 24, 'Lava-louças KERAN 86 C/ESCORREDOR 1 CUBA', 12.00, 11.00),
    ('lava', 25, 'Lava-louças LODY PVD 1 CUBA 70', 12.00, 11.00),
    ('lava', 26, 'Lava-louças AMBAR 1 CUBA 57', 12.00, 11.00),
    ('lava', 27, 'Lava-louças AMBAR 1 CUBA 80', 12.00, 11.00),
    ('lava', 29, 'Lava-louças AMBAR 1 CUBA 70', 12.00, 11.00),
    ('lava', 31, 'Lava-louças KERAN 100 C/ESCORREDOR 2 CUBAS', 12.00, 11.00),
    ('lava', 32, 'Lava-louças AMBAR 116 C/ESCORREDOR 2 CUBAS', 12.00, 11.00),
    ('lava', 33, 'Lava-louças KERAN 116 C/ESCORREDOR 2 CUBAS', 12.00, 11.00),
    ('lava', 34, 'Lava-louças VELAR 1 CUBA 70', 12.00, 11.00),
    ('wc', 56, 'Piaçaba SMOOTH CROMADO', NULL, 30.00),
    ('wc', 57, 'Piaçaba SMOOTH PRETO MATE', NULL, 35.00),
    ('wc', 58, 'Piaçaba SMOOTH GUN METAL', NULL, 40.00),
    ('wc', 59, 'Piaçaba SMOOTH BRANCO MATE', NULL, 35.00),
    ('wc', 60, 'Piaçaba SMOOTH DOURADO ESCOVADO', NULL, 40.00),
    ('wc', 61, 'Piaçaba SMOOTH ROSA GOLD ESCOVADO', NULL, 40.00),
    ('wc', 81, 'Toalheiro SMOOTH BARRA 60cm CROMADO', NULL, 40.00),
    ('wc', 82, 'Toalheiro SMOOTH BARRA 60cm PRETO MATE', NULL, 40.00),
    ('wc', 83, 'Toalheiro SMOOTH BARRA 60cm GUN METAL', NULL, 40.00),
    ('wc', 84, 'Toalheiro SMOOTH BARRA 60cm BRANCO MATE', NULL, 40.00),
    ('wc', 85, 'Toalheiro SMOOTH BARRA 60cm DOURADO ESCOVADO', NULL, 40.00),
    ('wc', 86, 'Toalheiro SMOOTH BARRA 60cm ROSA GOLD ESCOVADO', NULL, 40.00);
  SELECT count(*) FILTER (WHERE x.price_type = 'wholesale'), count(*) FILTER (WHERE x.price_type = 'distributor') INTO v_g, v_d
  FROM _t_linhas l
  JOIN products p ON p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted AND p.tipo_catalogo = 'produto'
   AND lower(regexp_replace(btrim(p.name), '[[:space:]]+', ' ', 'g')) = lower(l.nome)
  JOIN product_prices x ON x.product_id = p.id;
  IF v_g <> 30 OR v_d <> 42 THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — os produtos da Mudelar têm % grossista e % distribuidor em vez de 30 e 42.', v_g, v_d;
  END IF;
  IF to_regprocedure('public.cat_definir_grossista_distribuidor(uuid,numeric,numeric)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — cat_definir_grossista_distribuidor não existe (migration por aplicar).';
  END IF;
END $t$;

-- ─── 1. Mudelar: os valores do ficheiro ──────────────────────────────────────
DO $t$
DECLARE v_n bigint;
BEGIN
  CREATE TEMP TABLE _t ON COMMIT DROP AS
  SELECT l.*, (SELECT count(*) FROM products p WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
                 AND p.tipo_catalogo = 'produto' AND lower(regexp_replace(btrim(p.name), '[[:space:]]+', ' ', 'g')) = lower(l.nome)) AS n,
         (SELECT p.id FROM products p WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
                 AND p.tipo_catalogo = 'produto' AND lower(regexp_replace(btrim(p.name), '[[:space:]]+', ' ', 'g')) = lower(l.nome) LIMIT 1) AS id
  FROM _t_linhas l;
  IF (SELECT count(*) FROM _t) <> 42 OR EXISTS (SELECT 1 FROM _t WHERE n <> 1) THEN
    RAISE EXCEPTION 'FALHOU: 1 — nem todos os 42 nomes dão exatamente um produto da Mudelar.';
  END IF;
  SELECT count(*) INTO v_n FROM _t b
  WHERE (SELECT count(*) FROM product_prices x WHERE x.product_id = b.id AND x.price_type = 'wholesale') <> (b.grossista IS NOT NULL)::int
     OR (SELECT count(*) FROM product_prices x WHERE x.product_id = b.id AND x.price_type = 'distributor') <> (b.distribuidor IS NOT NULL)::int
     OR EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = b.id
                  AND ((x.price_type = 'wholesale' AND coalesce(x.preco_exato, x.price) IS DISTINCT FROM b.grossista)
                    OR (x.price_type = 'distributor' AND coalesce(x.preco_exato, x.price) IS DISTINCT FROM b.distribuidor)));
  IF v_n <> 0 THEN RAISE EXCEPTION 'FALHOU: 1 — % produtos com grossista/distribuidor diferente do ficheiro.', v_n; END IF;
  IF (SELECT count(*) FROM _t WHERE fonte = 'lava' AND grossista = 12 AND distribuidor = 11) <> 30
     OR (SELECT count(*) FROM _t WHERE fonte = 'wc' AND grossista IS NULL AND distribuidor BETWEEN 30 AND 40) <> 12 THEN
    RAISE EXCEPTION 'FALHOU: 1 — os dados do ficheiro não são 30 lava-louças a 12/11 e 12 acessórios só com distribuidor.';
  END IF;
  -- os produtos fora do ficheiro na mesma categoria ficam sem nada (AMBAR 1 CUBA 50 e 50 N)
  SELECT count(*) INTO v_n FROM products p JOIN product_prices x ON x.product_id = p.id
  WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND p.name IN ('Lava-louças AMBAR 1 CUBA 50', 'Lava-louças AMBAR 1 CUBA 50 N')
    AND x.price_type IN ('wholesale', 'distributor');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FALHOU: 1 — AMBAR 1 CUBA 50 / 50 N têm % preços grossista/distribuidor.', v_n; END IF;
  -- (não se conta a base inteira: outras importações aplicadas depois também gravam grossista/distribuidor)
END $t$;

-- ─── 2. Mudelar: a página (membro com services.view) ─────────────────────────
DO $t$
DECLARE c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355'; v_auth uuid; j jsonb; j2 jsonb; v_n bigint;
BEGIN
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND public.has_anew_permission_in_org(u.auth_user_id, 'services.view', c_org)
    AND NOT public.is_system_admin_user(u.auth_user_id)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: 2 — sem membro da Mudelar com services.view.'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  j := public.cat_ler_produtos_pagina(c_org, 'lava-louças', NULL, NULL, NULL, NULL, false, 200, 1);
  j2 := public.cat_ler_produtos_pagina(c_org, 'piaçaba smooth', NULL, NULL, NULL, NULL, false, 50, 1);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(j -> 'produtos') e WHERE NOT (e ? 'grossista' AND e ? 'distribuidor')) THEN
    RAISE EXCEPTION 'FALHOU: 2 — há produtos na página sem as chaves grossista/distribuidor.';
  END IF;
  SELECT count(*) INTO v_n FROM _t b JOIN jsonb_array_elements(j -> 'produtos') e ON (e ->> 'id')::uuid = b.id
  WHERE b.fonte = 'lava' AND (e ->> 'grossista')::numeric = 12 AND (e ->> 'distribuidor')::numeric = 11;
  IF v_n <> 30 THEN RAISE EXCEPTION 'FALHOU: 2 — só % lava-louças com 12/11 na página.', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j -> 'produtos') e WHERE e ->> 'nome' = 'Lava-louças AMBAR 1 CUBA 50 N'
                 AND e -> 'grossista' = 'null'::jsonb AND e -> 'distribuidor' = 'null'::jsonb AND (e ->> 'pvp')::numeric = 350) THEN
    RAISE EXCEPTION 'FALHOU: 2 — AMBAR 1 CUBA 50 N devia vir com grossista/distribuidor null e PVP 350.';
  END IF;

  SELECT count(*) INTO v_n FROM _t b JOIN jsonb_array_elements(j2 -> 'produtos') e ON (e ->> 'id')::uuid = b.id
  WHERE b.fonte = 'wc' AND e -> 'grossista' = 'null'::jsonb AND (e ->> 'distribuidor')::numeric = b.distribuidor
    AND (e ->> 'pvp')::numeric = 25 AND (e ->> 'custo')::numeric = 12.5;
  IF v_n <> 6 THEN RAISE EXCEPTION 'FALHOU: 2 — só % Piaçaba SMOOTH com distribuidor certo, grossista null, custo e PVP.', v_n; END IF;
END $t$;
RESET ROLE;

-- ─── Fixtures na nike (como postgres) ────────────────────────────────────────
DO $fx$
DECLARE c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'; v_auth uuid; v_act uuid; v_sem uuid;
BEGIN
  SELECT u.auth_user_id, u.id INTO v_auth, v_act
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_nike AND m.status = 'active' AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_nike)
    AND NOT public.is_system_admin_user(u.auth_user_id)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: fixtures — sem membro da nike (não system admin) com products.edit.'; END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO anew_role_permissions (role_id, permission_code, created_by)
  SELECT am.role_id, k.code, NULL::uuid FROM anew_memberships am CROSS JOIN (VALUES ('products.manage_prices'), ('services.view')) k(code)
  WHERE am.user_id = v_act AND am.organization_id = c_nike AND am.status = 'active' AND am.role_id IS NOT NULL
  ON CONFLICT (role_id, permission_code) DO NOTHING;
  PERFORM set_config('request.jwt.claims', '', true);
  IF NOT public.has_anew_permission_in_org(v_auth, 'products.manage_prices', c_nike) OR NOT public.has_anew_permission_in_org(v_auth, 'services.view', c_nike) THEN
    RAISE EXCEPTION 'FALHOU: fixtures — o membro da nike não ficou com manage_prices e services.view.';
  END IF;

  -- um membro da nike para quem fn_cat_pode nega products.edit E products.manage_prices (passo 8; pode não haver)
  FOR v_sem IN SELECT u.auth_user_id
    FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
    WHERE m.organization_id = c_nike AND m.status = 'active' AND u.id <> v_act
    ORDER BY m.created_at, u.id LIMIT 20
  LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
    EXIT WHEN NOT public.fn_cat_pode(c_nike, 'products.edit') AND NOT public.fn_cat_pode(c_nike, 'products.manage_prices');
    v_sem := NULL;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                        manages_stock, created_by, tipo_catalogo, unidade)
  VALUES ('2027a970-0000-4000-8000-000000000001', c_nike, 'TESTE-2027GD-1', 'Teste 2027 revenda 1', 'active', true, true, true, false, false, false, v_act, 'produto', 'un'),
         ('2027a970-0000-4000-8000-000000000002', c_nike, 'TESTE-2027GD-2', 'Teste 2027 revenda 2', 'active', true, true, true, false, false, false, v_act, 'produto', 'un');
  INSERT INTO product_prices (id, product_id, price_type, price, preco_exato, currency, valid_from, created_by)
  VALUES ('2027f970-0000-4000-8000-000000000001', '2027a970-0000-4000-8000-000000000001', 'purchase', 10.00, 10.004, 'EUR', now() - interval '2 days', v_act),
         ('2027f970-0000-4000-8000-000000000002', '2027a970-0000-4000-8000-000000000001', 'retail',   20.00, NULL,   'EUR', now() - interval '1 day',  v_act),
         ('2027f970-0000-4000-8000-000000000003', '2027a970-0000-4000-8000-000000000002', 'wholesale', 5.00, 5.00,   'EUR', now() - interval '1 day',  v_act),
         ('2027f970-0000-4000-8000-000000000004', '2027a970-0000-4000-8000-000000000002', 'distributor', 4.00, 4.00, 'EUR', now() - interval '1 day' + interval '1 second', v_act);

  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.sem', coalesce(json_build_object('sub', v_sem, 'role', 'authenticated')::text, ''), true);
END $fx$;

-- ─── 3. Fora da organização e produto inexistente ────────────────────────────
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.cat_definir_grossista_distribuidor('2027a970-0000-4000-8000-000000000001', 10, 9);
    RAISE EXCEPTION 'FALHOU: 3 — gravar fora da organização foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.cat_definir_grossista_distribuidor(gen_random_uuid(), 10, 9);
    RAISE EXCEPTION 'FALHOU: 3 — produto inexistente foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL;
  END;
END $t$;

RESET ROLE;

-- as gravações correm como o membro da nike (authenticated); as verificações leem as tabelas como postgres
CREATE FUNCTION pg_temp.gd(p uuid, g numeric, d numeric) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  r := public.cat_definir_grossista_distribuidor(p, g, d);
  RESET ROLE;
  RETURN r;
END $f$;

-- ─── 4. Definir, repetir, mudar, 0 ───────────────────────────────────────────
DO $t$
DECLARE r jsonb; v_id_g uuid; v_id_d uuid; v_n bigint;
BEGIN
  r := pg_temp.gd('2027a970-0000-4000-8000-000000000001', 10.5, 9.25);
  IF r <> '{"ok": true, "grossista": 10.50, "distribuidor": 9.25}'::jsonb THEN RAISE EXCEPTION 'FALHOU: 4 — retorno ao definir: %', r; END IF;
  IF (SELECT count(*) FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000001') <> 4
     OR (SELECT count(*) FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000001' AND price_type = 'wholesale' AND price = 10.50 AND preco_exato = 10.50) <> 1
     OR (SELECT count(*) FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000001' AND price_type = 'distributor' AND price = 9.25 AND preco_exato = 9.25) <> 1
     OR NOT EXISTS (SELECT 1 FROM product_prices WHERE id = '2027f970-0000-4000-8000-000000000001' AND price = 10.00 AND preco_exato = 10.004)
     OR NOT EXISTS (SELECT 1 FROM product_prices WHERE id = '2027f970-0000-4000-8000-000000000002' AND price = 20.00 AND preco_exato IS NULL) THEN
    RAISE EXCEPTION 'FALHOU: 4 — depois de definir não ficou 1 grossista 10,50 + 1 distribuidor 9,25 com custo e PVP intactos.';
  END IF;
  SELECT id INTO v_id_g FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000001' AND price_type = 'wholesale';
  SELECT id INTO v_id_d FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000001' AND price_type = 'distributor';

  -- o mesmo valor: nada escrito (o histórico de preços não ganha linha)
  SELECT count(*) INTO v_n FROM product_price_history WHERE product_id = '2027a970-0000-4000-8000-000000000001';
  PERFORM pg_temp.gd('2027a970-0000-4000-8000-000000000001', 10.50, 9.25);
  IF (SELECT count(*) FROM product_price_history WHERE product_id = '2027a970-0000-4000-8000-000000000001') <> v_n
     OR (SELECT count(*) FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000001') <> 4 THEN
    RAISE EXCEPTION 'FALHOU: 4 — o mesmo valor escreveu alguma coisa.';
  END IF;

  -- valor novo: a MESMA linha muda; 0 é um valor (fica 0, não apaga)
  r := pg_temp.gd('2027a970-0000-4000-8000-000000000001', 11, 0);
  IF r <> '{"ok": true, "grossista": 11.00, "distribuidor": 0.00}'::jsonb THEN RAISE EXCEPTION 'FALHOU: 4 — retorno ao mudar: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM product_prices WHERE id = v_id_g AND price = 11 AND preco_exato = 11)
     OR NOT EXISTS (SELECT 1 FROM product_prices WHERE id = v_id_d AND price = 0 AND preco_exato = 0)
     OR (SELECT count(*) FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000001') <> 4 THEN
    RAISE EXCEPTION 'FALHOU: 4 — o valor novo não ficou na mesma linha (ou o 0 não ficou).';
  END IF;
END $t$;

-- ─── 5. NULL apaga só esse tipo, só desse produto ────────────────────────────
DO $t$
DECLARE r jsonb;
BEGIN
  r := pg_temp.gd('2027a970-0000-4000-8000-000000000001', NULL, 7.5);
  IF r <> '{"ok": true, "grossista": null, "distribuidor": 7.50}'::jsonb THEN RAISE EXCEPTION 'FALHOU: 5 — retorno: %', r; END IF;
  IF EXISTS (SELECT 1 FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000001' AND price_type = 'wholesale')
     OR (SELECT count(*) FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000001' AND price_type = 'distributor' AND price = 7.5) <> 1
     OR (SELECT count(*) FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000001' AND price_type IN ('purchase', 'retail')) <> 2
     OR (SELECT count(*) FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000002') <> 2 THEN
    RAISE EXCEPTION 'FALHOU: 5 — NULL não apagou só o grossista deste produto.';
  END IF;
  -- os dois NULL: o produto 2 fica sem grossista nem distribuidor (e sem custo nem PVP, que não tinha)
  PERFORM pg_temp.gd('2027a970-0000-4000-8000-000000000002', NULL, NULL);
  IF EXISTS (SELECT 1 FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'FALHOU: 5 — NULL, NULL não apagou as linhas do produto 2.';
  END IF;
  -- e voltam a criar-se
  PERFORM pg_temp.gd('2027a970-0000-4000-8000-000000000002', 3.1, 2.99);
  IF (SELECT count(*) FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000002') <> 2 THEN
    RAISE EXCEPTION 'FALHOU: 5 — não voltou a criar as duas linhas do produto 2.';
  END IF;
END $t$;

-- ─── 6. Valores inválidos → CT002, nada escrito ──────────────────────────────
DO $t$
DECLARE v_antes text; v_caso numeric[]; i int;
BEGIN
  SELECT string_agg(id::text || price::text, ',' ORDER BY id) INTO v_antes FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000001';
  FOR i IN 1..5 LOOP
    v_caso := CASE i WHEN 1 THEN ARRAY[-1, 5] WHEN 2 THEN ARRAY[5, -0.01] WHEN 3 THEN ARRAY[1.234, 5]
                     WHEN 4 THEN ARRAY[5, 9.999] ELSE ARRAY[100000000, 5] END;
    BEGIN
      PERFORM pg_temp.gd('2027a970-0000-4000-8000-000000000001', v_caso[1], v_caso[2]);
      RAISE EXCEPTION 'FALHOU: 6 — o caso % (%) foi aceite', i, v_caso;
    EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
    END;
  END LOOP;
  IF (SELECT string_agg(id::text || price::text, ',' ORDER BY id) FROM product_prices WHERE product_id = '2027a970-0000-4000-8000-000000000001') IS DISTINCT FROM v_antes THEN
    RAISE EXCEPTION 'FALHOU: 6 — um valor inválido escreveu alguma coisa.';
  END IF;
END $t$;

-- ─── 7. Leituras: a página e a ficha (cat_ler_catalogo) ──────────────────────
DO $t$
DECLARE j jsonb; j2 jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  j := public.cat_ler_produtos_pagina('b6ffce4f-f630-4933-833a-008649757a33', 'Teste 2027 revenda', NULL, NULL, NULL, NULL, false, 50, 1);
  j2 := public.cat_ler_catalogo('b6ffce4f-f630-4933-833a-008649757a33');
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j -> 'produtos') e WHERE e ->> 'id' = '2027a970-0000-4000-8000-000000000001'
                   AND e -> 'grossista' = 'null'::jsonb AND (e ->> 'distribuidor')::numeric = 7.5
                   AND (e ->> 'custo')::numeric = 10.004 AND (e ->> 'pvp')::numeric = 20)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j -> 'produtos') e WHERE e ->> 'id' = '2027a970-0000-4000-8000-000000000002'
                   AND (e ->> 'grossista')::numeric = 3.1 AND (e ->> 'distribuidor')::numeric = 2.99 AND e -> 'pvp' = 'null'::jsonb) THEN
    RAISE EXCEPTION 'FALHOU: 7 — a página não devolve grossista/distribuidor certos: %', j -> 'produtos';
  END IF;

  IF (SELECT count(*) FROM jsonb_array_elements(j2 -> 'precosProduto') e
      WHERE (e ->> 'product_id' = '2027a970-0000-4000-8000-000000000001' AND e ->> 'price_type' = 'distributor' AND (e ->> 'price')::numeric = 7.5)
         OR (e ->> 'product_id' = '2027a970-0000-4000-8000-000000000002' AND e ->> 'price_type' = 'wholesale' AND (e ->> 'price')::numeric = 3.1)
         OR (e ->> 'product_id' = '2027a970-0000-4000-8000-000000000002' AND e ->> 'price_type' = 'distributor' AND (e ->> 'price')::numeric = 2.99)) <> 3 THEN
    RAISE EXCEPTION 'FALHOU: 7 — cat_ler_catalogo (a ficha) não devolve as linhas wholesale/distributor.';
  END IF;
END $t$;
RESET ROLE;

-- ─── 8. Sem products.edit nem manage_prices → CT001 ──────────────────────────
DO $t$
BEGIN
  IF current_setting('teste.sem') = '' THEN
    RAISE NOTICE '8 — a nike não tem um membro sem products.edit nem manage_prices: passo não corrido.';
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claims', current_setting('teste.sem'), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.cat_definir_grossista_distribuidor('2027a970-0000-4000-8000-000000000001', 1, 1);
    RAISE EXCEPTION 'FALHOU: 8 — membro sem permissão gravou';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END $t$;
RESET ROLE;

-- ─── 9. Acessos ──────────────────────────────────────────────────────────────
DO $t$
BEGIN
  IF has_function_privilege('anon', 'public.cat_definir_grossista_distribuidor(uuid,numeric,numeric)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_definir_grossista_distribuidor(uuid,numeric,numeric)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: 9 — EXECUTE tem de ser só authenticated/service_role.';
  END IF;
END $t$;

SELECT 'OK: catalogo_precos_grossista_distribuidor — 10 passos' AS resultado;

ROLLBACK;
