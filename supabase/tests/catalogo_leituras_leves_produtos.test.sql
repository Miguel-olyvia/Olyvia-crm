-- ============================================================
-- Testes: 20270120800000_catalogo_leituras_leves_produtos.sql (base RH)
-- ============================================================
-- Tudo dentro de BEGIN … ROLLBACK, só na nike (b6ffce4f-…). Fixtures: 1 modelo e 1 produto («Teste 2027 leitura leve»)
-- com 6 linhas de preço, criados como postgres e desfeitos no ROLLBACK. As leituras correm como membros reais da nike
-- (role authenticated, auth.uid() pelas claims), escolhidos pelo que as permissões lhes dão, nunca system admin:
--   A  services.view e products.edit           (vê tudo)
--   T  corte de técnico com negocios.obra.materiais, sem services.view nem products.edit (vê produtos, sem valores nem modelos)
--   S  corte de técnico SEM negocios.obra.materiais (cat_ler_catalogo dá-lhe "produtos": [])
--   N  sem services.view, sem pessoas.view, sem negocios.*  (CT001 em tudo)
-- Da Mudelar lê-se só o id de UM produto (para o CT003 «produto de outra organização»).
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com 'FALHOU: …'):
--   supabase db query --linked -f supabase/tests/catalogo_leituras_leves_produtos.test.sql
-- Ensaio (verde antes do push): BEGIN; <migration>; <este ficheiro sem o BEGIN/ROLLBACK>; ROLLBACK;
-- O passo 0 FALHA antes da migration (as funções não existem).
--
-- Cobre:
--   0. As duas funções existem (vermelho antes)
--   1. A, referências: as chaves exatas; categoriasProduto, marcas, unidades e exige iguais a cat_ler_produtos_tabelas;
--      os modelos = os de cat_ler_modelos_gestao, no formato {id, nome, numero, ativo, subcategoria:{id}}
--   2. A, produto da fixture: as chaves exatas; os campos comuns iguais a cat_ler_catalogo.produtos[] e a
--      cat_ler_produtos_tabelas.produtos[]; precosProduto igual; custo/pvp/grossista(0)/distribuidor/modelo calculados certos
--   3. A, um produto da nike com fornecedor ligado: fornecedores igual a cat_ler_catalogo.fornecedores; custo do fornecedor
--   4. T: referências sem modelos (null) e iguais às de cat_ler_produtos_tabelas; produto sem valores (null / []), campos
--      comuns iguais aos de cat_ler_catalogo para o mesmo membro
--   5. Recusas (4 chamadas): N → CT001 nas duas; S → CT001 no produto; A com produto da Mudelar → CT003
--   6. Acessos: anon não executa, authenticated executa
-- ============================================================

BEGIN;

-- ─── 0. Passo vermelho ───────────────────────────────────────────────────────
DO $t$
BEGIN
  IF to_regprocedure('public.cat_ler_referencias_produtos(uuid)') IS NULL OR to_regprocedure('public.cat_ler_produto(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — cat_ler_referencias_produtos / cat_ler_produto não existem (migration por aplicar).';
  END IF;
END $t$;

-- ─── Fixtures e membros (como postgres) ──────────────────────────────────────
DO $fx$
DECLARE
  c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  r record; v_tec boolean; v_mat boolean; v_sv boolean; v_pe boolean; v_acesso boolean;
  v_a uuid; v_t uuid; v_s uuid; v_n uuid; v_a_user uuid; v_sub uuid; v_cat uuid; v_brand uuid; v_uom uuid; v_num int; v_forn uuid; v_mud uuid;
BEGIN
  FOR r IN SELECT u.auth_user_id AS a, u.id FROM anew_memberships m
           JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
           WHERE m.organization_id = c_nike AND m.status = 'active' AND NOT public.is_system_admin_user(u.auth_user_id)
           ORDER BY m.created_at, u.id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.a, 'role', 'authenticated')::text, true);
    v_sv := public.fn_cat_pode(c_nike, 'services.view');
    v_pe := public.fn_cat_pode(c_nike, 'products.edit');
    -- o corte de cat_ler_catalogo
    v_tec := public.fn_neg_so_execucao(c_nike, 'services.view');
    IF NOT v_tec AND NOT v_sv THEN
      v_tec := public.fn_cat_pode(c_nike, 'pessoas.view')
        OR EXISTS (SELECT 1 FROM anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(c_nike, ap.code));
    END IF;
    v_acesso := v_tec OR v_sv;
    v_mat := NOT v_tec OR public.fn_cat_pode(c_nike, 'negocios.obra.materiais');
    IF v_a IS NULL AND v_sv AND v_pe THEN v_a := r.a; v_a_user := r.id; END IF;
    IF v_t IS NULL AND v_tec AND v_mat AND NOT v_sv AND NOT v_pe THEN v_t := r.a; END IF;
    IF v_s IS NULL AND v_tec AND NOT v_mat THEN v_s := r.a; END IF;
    IF v_n IS NULL AND NOT v_acesso THEN v_n := r.a; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_a IS NULL OR v_t IS NULL OR v_s IS NULL OR v_n IS NULL THEN
    RAISE EXCEPTION 'FALHOU: fixtures — faltam membros da nike (A % / T % / S % / N %).', v_a IS NOT NULL, v_t IS NOT NULL, v_s IS NOT NULL, v_n IS NOT NULL;
  END IF;

  -- uma subcategoria viva da nike, uma marca viva da nike e uma unidade base ativa
  SELECT s.id, s.parent_id INTO v_sub, v_cat FROM product_categories s
  WHERE s.organization_id = c_nike AND s.parent_id IS NOT NULL AND s.deleted_at IS NULL AND coalesce(s.is_active, true)
  ORDER BY s.id LIMIT 1;
  SELECT b.id INTO v_brand FROM brands b WHERE b.organization_id = c_nike AND b.deleted_at IS NULL AND coalesce(b.is_active, true) ORDER BY b.id LIMIT 1;
  SELECT u.id INTO v_uom FROM uom u WHERE u.is_active AND u.base_uom_id IS NULL AND (u.organization_id IS NULL OR u.organization_id = c_nike) ORDER BY u.code, u.id LIMIT 1;
  IF v_sub IS NULL OR v_brand IS NULL OR v_uom IS NULL THEN RAISE EXCEPTION 'FALHOU: fixtures — sem subcategoria, marca ou unidade na nike.'; END IF;
  SELECT coalesce(max(numero), 0) + 1 INTO v_num FROM product_models WHERE organization_id = c_nike AND subcategory_id = v_sub;

  INSERT INTO product_models (id, organization_id, subcategory_id, name, numero, is_active, created_by)
  VALUES ('2027b080-0000-4000-8000-000000000001', c_nike, v_sub, 'Teste 2027 modelo leve', v_num, true, v_a_user);
  INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                        manages_stock, created_by, tipo_catalogo, unidade, brand_id, uom_id, category_id, subcategory_id, model_id,
                        short_description, fornecedor_livre, image_urls, entulho_m3, entulho_kg, fator_servico)
  VALUES ('2027a080-0000-4000-8000-000000000001', c_nike, 'TESTE-2027LL-1', 'Teste 2027 leitura leve', 'active', true, true, true, false, false,
          false, v_a_user, 'produto', 'un', v_brand, v_uom, v_cat, v_sub, '2027b080-0000-4000-8000-000000000001',
          'descrição de teste', 'Fornecedor livre teste', ARRAY['https://exemplo.invalid/a.jpg', 'https://exemplo.invalid/b.jpg'], 0.05, 3.5, 1);
  -- dois custos (o mais recente conta), um PVP, grossista 0 (é valor), distribuidor, e um custo SEM data (fica o mais antigo)
  INSERT INTO product_prices (id, product_id, price_type, price, preco_exato, currency, valid_from, created_by)
  VALUES ('2027f080-0000-4000-8000-000000000001', '2027a080-0000-4000-8000-000000000001', 'purchase',    8.00,  8.004, 'EUR', now() - interval '10 days', v_a_user),
         ('2027f080-0000-4000-8000-000000000002', '2027a080-0000-4000-8000-000000000001', 'purchase',    9.00,  NULL,  'EUR', now() - interval '3 days',  v_a_user),
         ('2027f080-0000-4000-8000-000000000003', '2027a080-0000-4000-8000-000000000001', 'retail',     20.00,  NULL,  'EUR', now() - interval '2 days',  v_a_user),
         ('2027f080-0000-4000-8000-000000000004', '2027a080-0000-4000-8000-000000000001', 'wholesale',   0.00,  0.00,  'EUR', now() - interval '1 day',   v_a_user),
         ('2027f080-0000-4000-8000-000000000005', '2027a080-0000-4000-8000-000000000001', 'distributor', 14.50, 14.50, 'EUR', now() - interval '1 day' + interval '1 second', v_a_user);

  -- um produto da nike com fornecedor ligado e custo do fornecedor (só leitura)
  SELECT v.product_id INTO v_forn FROM cat_v_produto_fornecedor v
  WHERE v.organization_id = c_nike AND v.ligacao <> 'por_ligar' AND v.purchase_price IS NOT NULL ORDER BY v.product_id LIMIT 1;
  IF v_forn IS NULL THEN RAISE EXCEPTION 'FALHOU: fixtures — a nike não tem produto com fornecedor ligado.'; END IF;
  -- o id de um produto do Catálogo da Mudelar (só o id; para o CT003)
  SELECT p.id INTO v_mud FROM products p WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND p.tipo_catalogo IS NOT NULL AND NOT p.is_deleted LIMIT 1;
  IF v_mud IS NULL THEN RAISE EXCEPTION 'FALHOU: fixtures — sem produto da Mudelar para o CT003.'; END IF;

  PERFORM set_config('teste.a', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.t', json_build_object('sub', v_t, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.s', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.n', json_build_object('sub', v_n, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.forn', v_forn::text, true);
  PERFORM set_config('teste.mud', v_mud::text, true);
  PERFORM set_config('teste.num', v_num::text, true);
  PERFORM set_config('teste.sub', v_sub::text, true);
END $fx$;

-- igualdade de dois arrays jsonb como conjuntos (a ordem não interessa)
CREATE FUNCTION pg_temp.mesmo_conjunto(a jsonb, b jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
  SELECT jsonb_typeof(a) = 'array' AND jsonb_typeof(b) = 'array'
     AND NOT EXISTS (SELECT 1 FROM (SELECT e FROM jsonb_array_elements(a) e EXCEPT ALL SELECT e FROM jsonb_array_elements(b) e) x)
     AND NOT EXISTS (SELECT 1 FROM (SELECT e FROM jsonb_array_elements(b) e EXCEPT ALL SELECT e FROM jsonb_array_elements(a) e) x)
$f$;
-- as chaves de um objeto, ordenadas
CREATE FUNCTION pg_temp.chaves(o jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$
  SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(o) k
$f$;
-- só as chaves pedidas de um objeto
CREATE FUNCTION pg_temp.so(o jsonb, ks text[]) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) FROM jsonb_each(o) e WHERE e.key = ANY (ks)
$f$;

-- ─── 1, 2, 3. Membro A (services.view e products.edit) ───────────────────────
DO $t$
DECLARE
  c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_p constant uuid := '2027a080-0000-4000-8000-000000000001';
  c_cat constant text[] := ARRAY['id', 'name', 'sku', 'tipo_catalogo', 'unidade', 'catalogo_categoria_id', 'servico_id', 'fator_servico',
                                 'entulho_m3', 'entulho_kg', 'short_description', 'marca_livre', 'fornecedor_livre', 'image_urls'];
  c_tab constant text[] := ARRAY['id', 'brand_id', 'marca', 'uom_id', 'uom', 'category_id', 'subcategory_id'];
  c_forn constant text[] := ARRAY['product_id', 'purchase_price', 'preco_data', 'ligacao', 'fornecedor'];
  v_forn uuid := current_setting('teste.forn')::uuid;
  ref jsonb; tab jsonb; modg jsonb; cat jsonb; pr jsonb; pf jsonb; e jsonb; v_esp text[];
BEGIN
  PERFORM set_config('request.jwt.claims', current_setting('teste.a'), true);
  SET LOCAL ROLE authenticated;
  ref  := public.cat_ler_referencias_produtos(c_nike);
  tab  := public.cat_ler_produtos_tabelas(c_nike);
  modg := public.cat_ler_modelos_gestao(c_nike);
  cat  := public.cat_ler_catalogo(c_nike);
  pr   := public.cat_ler_produto(c_nike, c_p);
  pf   := public.cat_ler_produto(c_nike, v_forn);
  RESET ROLE;

  -- 1. referências
  IF pg_temp.chaves(ref) IS DISTINCT FROM ARRAY['categoriasProduto', 'exige', 'marcas', 'modelos', 'unidades'] THEN
    RAISE EXCEPTION 'FALHOU: 1 — chaves das referências: %', pg_temp.chaves(ref);
  END IF;
  IF NOT pg_temp.mesmo_conjunto(ref -> 'categoriasProduto', tab -> 'categoriasProduto') OR NOT pg_temp.mesmo_conjunto(ref -> 'marcas', tab -> 'marcas')
     OR NOT pg_temp.mesmo_conjunto(ref -> 'unidades', tab -> 'unidades') OR NOT pg_temp.mesmo_conjunto(ref -> 'exige', tab -> 'exige') THEN
    RAISE EXCEPTION 'FALHOU: 1 — categoriasProduto/marcas/unidades/exige diferentes de cat_ler_produtos_tabelas.';
  END IF;
  IF jsonb_array_length(ref -> 'categoriasProduto') = 0 OR jsonb_array_length(ref -> 'unidades') = 0 THEN
    RAISE EXCEPTION 'FALHOU: 1 — referências vazias (categorias %, unidades %).', jsonb_array_length(ref -> 'categoriasProduto'), jsonb_array_length(ref -> 'unidades');
  END IF;
  IF jsonb_typeof(ref -> 'modelos') <> 'array'
     OR NOT pg_temp.mesmo_conjunto((SELECT jsonb_agg(m -> 'id') FROM jsonb_array_elements(ref -> 'modelos') m),
                                   (SELECT jsonb_agg(m -> 'id') FROM jsonb_array_elements(modg -> 'modelos') m)) THEN
    RAISE EXCEPTION 'FALHOU: 1 — os modelos não são os de cat_ler_modelos_gestao.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(ref -> 'modelos') m
                 WHERE m = jsonb_build_object('id', '2027b080-0000-4000-8000-000000000001', 'nome', 'Teste 2027 modelo leve',
                                              'numero', current_setting('teste.num')::int, 'ativo', true,
                                              'subcategoria', jsonb_build_object('id', current_setting('teste.sub')))) THEN
    RAISE EXCEPTION 'FALHOU: 1 — o modelo da fixture não vem no formato {id, nome, numero, ativo, subcategoria:{id}}.';
  END IF;

  -- 2. o produto da fixture: chaves exatas
  v_esp := ARRAY(SELECT unnest(c_cat || ARRAY['brand_id', 'marca', 'uom_id', 'uom', 'category_id', 'subcategory_id',
                       'sku_gerado', 'categoria', 'subcategoria', 'ativo', 'modelo_id', 'modelo', 'modelo_numero', 'estado', 've_valores',
                       'precosProduto', 'fornecedores', 'custo', 'custo_data', 'pvp', 'grossista', 'distribuidor', 'fornecedor']) ORDER BY 1);
  IF pg_temp.chaves(pr) IS DISTINCT FROM v_esp THEN
    RAISE EXCEPTION 'FALHOU: 2 — chaves do produto: % (esperadas %)', pg_temp.chaves(pr), v_esp;
  END IF;
  -- campos comuns = cat_ler_catalogo.produtos[] e cat_ler_produtos_tabelas.produtos[]
  SELECT x INTO e FROM jsonb_array_elements(cat -> 'produtos') x WHERE x ->> 'id' = c_p::text;
  IF e IS NULL OR pg_temp.so(pr, c_cat) IS DISTINCT FROM e THEN
    RAISE EXCEPTION 'FALHOU: 2 — campos diferentes de cat_ler_catalogo: % vs %', pg_temp.so(pr, c_cat), e;
  END IF;
  SELECT x INTO e FROM jsonb_array_elements(tab -> 'produtos') x WHERE x ->> 'id' = c_p::text;
  -- só as chaves comuns (cat_ler_produtos_tabelas ganhou estado/ativo em 20270120900000)
  IF e IS NULL OR pg_temp.so(pr, c_tab) IS DISTINCT FROM pg_temp.so(e, c_tab) THEN
    RAISE EXCEPTION 'FALHOU: 2 — campos diferentes de cat_ler_produtos_tabelas: % vs %', pg_temp.so(pr, c_tab), e;
  END IF;
  IF NOT pg_temp.mesmo_conjunto(pr -> 'precosProduto',
                                (SELECT jsonb_agg(x) FROM jsonb_array_elements(cat -> 'precosProduto') x WHERE x ->> 'product_id' = c_p::text)) THEN
    RAISE EXCEPTION 'FALHOU: 2 — precosProduto diferente de cat_ler_catalogo.';
  END IF;
  -- a vista dá uma linha a todos os produtos ('por_ligar' sem fornecedor), tal como cat_ler_catalogo.fornecedores
  SELECT x INTO e FROM jsonb_array_elements(cat -> 'fornecedores') x WHERE x ->> 'product_id' = c_p::text;
  IF e IS NULL OR pg_temp.so(pr -> 'fornecedores' -> 0, c_forn) IS DISTINCT FROM e THEN
    RAISE EXCEPTION 'FALHOU: 2 — fornecedores diferente de cat_ler_catalogo: % vs %', pr -> 'fornecedores', e;
  END IF;
  -- os valores calculados
  IF (pr ->> 'custo')::numeric <> 9 OR pr ->> 'custo_data' <> to_char(now() - interval '3 days', 'YYYY-MM-DD')
     OR (pr ->> 'pvp')::numeric <> 20 OR pr -> 'grossista' <> '0'::jsonb OR (pr ->> 'distribuidor')::numeric <> 14.5
     OR pr ->> 'fornecedor' <> 'Fornecedor livre teste' OR pr -> 've_valores' <> 'true'::jsonb
     OR jsonb_array_length(pr -> 'fornecedores') <> 1 OR pr -> 'fornecedores' -> 0 ->> 'ligacao' <> 'por_ligar'
     OR jsonb_array_length(pr -> 'precosProduto') <> 5 THEN
    RAISE EXCEPTION 'FALHOU: 2 — valores calculados errados: %', pg_temp.so(pr, ARRAY['custo', 'custo_data', 'pvp', 'grossista', 'distribuidor', 'fornecedor', 've_valores', 'fornecedores']);
  END IF;
  IF pr ->> 'modelo_id' <> '2027b080-0000-4000-8000-000000000001' OR pr ->> 'modelo' <> 'Teste 2027 modelo leve'
     OR (pr ->> 'modelo_numero')::int <> current_setting('teste.num')::int OR pr ->> 'subcategory_id' <> current_setting('teste.sub')
     OR pr -> 'subcategoria' = 'null'::jsonb OR pr -> 'categoria' = 'null'::jsonb OR pr -> 'ativo' <> 'true'::jsonb OR pr ->> 'estado' <> 'active'
     OR pr ->> 'name' <> 'Teste 2027 leitura leve' OR pr ->> 'short_description' <> 'descrição de teste' OR jsonb_array_length(pr -> 'image_urls') <> 2 THEN
    RAISE EXCEPTION 'FALHOU: 2 — modelo, categoria ou campos do produto errados: %', pr;
  END IF;

  -- 3. produto com fornecedor ligado
  SELECT x INTO e FROM jsonb_array_elements(cat -> 'fornecedores') x WHERE x ->> 'product_id' = v_forn::text;
  IF jsonb_array_length(pf -> 'fornecedores') <> 1 OR pg_temp.so(pf -> 'fornecedores' -> 0, c_forn) IS DISTINCT FROM e THEN
    RAISE EXCEPTION 'FALHOU: 3 — fornecedores diferente de cat_ler_catalogo: % vs %', pf -> 'fornecedores', e;
  END IF;
  IF (pf ->> 'custo')::numeric IS DISTINCT FROM (e ->> 'purchase_price')::numeric
     OR (pf ->> 'fornecedor') IS DISTINCT FROM coalesce(nullif(e ->> 'fornecedor', ''), nullif(pf ->> 'fornecedor_livre', ''))
     OR NOT (pf -> 'fornecedores' -> 0 ?& ARRAY['supplier_id', 'supplier_sku', 'fornecedor_codigo']) THEN
    RAISE EXCEPTION 'FALHOU: 3 — custo/fornecedor do produto ligado: %', pg_temp.so(pf, ARRAY['custo', 'fornecedor', 'fornecedores']);
  END IF;
  SELECT x INTO e FROM jsonb_array_elements(cat -> 'produtos') x WHERE x ->> 'id' = v_forn::text;
  IF pg_temp.so(pf, c_cat) IS DISTINCT FROM e
     OR NOT pg_temp.mesmo_conjunto(pf -> 'precosProduto',
            coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(cat -> 'precosProduto') x WHERE x ->> 'product_id' = v_forn::text), '[]')) THEN
    RAISE EXCEPTION 'FALHOU: 3 — o produto ligado difere de cat_ler_catalogo.';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
END $t$;
RESET ROLE;

-- ─── 4. Membro T (corte de técnico com materiais): sem valores nem modelos ───
DO $t$
DECLARE
  c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_p constant uuid := '2027a080-0000-4000-8000-000000000001';
  c_cat constant text[] := ARRAY['id', 'name', 'sku', 'tipo_catalogo', 'unidade', 'catalogo_categoria_id', 'servico_id', 'fator_servico',
                                 'entulho_m3', 'entulho_kg', 'short_description', 'marca_livre', 'fornecedor_livre', 'image_urls'];
  ref jsonb; tab jsonb; cat jsonb; pr jsonb; e jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', current_setting('teste.t'), true);
  SET LOCAL ROLE authenticated;
  ref := public.cat_ler_referencias_produtos(c_nike);
  tab := public.cat_ler_produtos_tabelas(c_nike);
  cat := public.cat_ler_catalogo(c_nike);
  pr  := public.cat_ler_produto(c_nike, c_p);
  RESET ROLE;
  IF ref -> 'modelos' <> 'null'::jsonb THEN RAISE EXCEPTION 'FALHOU: 4 — T recebeu modelos sem products.edit nem services.view.'; END IF;
  IF NOT pg_temp.mesmo_conjunto(ref -> 'categoriasProduto', tab -> 'categoriasProduto') OR NOT pg_temp.mesmo_conjunto(ref -> 'marcas', tab -> 'marcas') THEN
    RAISE EXCEPTION 'FALHOU: 4 — as referências de T diferem de cat_ler_produtos_tabelas.';
  END IF;
  IF pr -> 've_valores' <> 'false'::jsonb OR pr -> 'custo' <> 'null'::jsonb OR pr -> 'custo_data' <> 'null'::jsonb OR pr -> 'pvp' <> 'null'::jsonb
     OR pr -> 'grossista' <> 'null'::jsonb OR pr -> 'distribuidor' <> 'null'::jsonb
     OR pr -> 'precosProduto' <> '[]'::jsonb OR pr -> 'fornecedores' <> '[]'::jsonb OR pr ->> 'fornecedor' <> 'Fornecedor livre teste' THEN
    RAISE EXCEPTION 'FALHOU: 4 — sem services.view vieram valores: %', pg_temp.so(pr, ARRAY['ve_valores', 'custo', 'custo_data', 'pvp', 'grossista', 'distribuidor', 'precosProduto', 'fornecedores', 'fornecedor']);
  END IF;
  -- o mesmo corte de cat_ler_catalogo para este membro
  IF cat -> 'precosProduto' <> '[]'::jsonb OR cat -> 'fornecedores' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: 4 — o membro T vê preços em cat_ler_catalogo (o perfil escolhido não é de corte).';
  END IF;
  SELECT x INTO e FROM jsonb_array_elements(cat -> 'produtos') x WHERE x ->> 'id' = c_p::text;
  IF e IS NULL OR pg_temp.so(pr, c_cat) IS DISTINCT FROM e THEN
    RAISE EXCEPTION 'FALHOU: 4 — o produto de T difere de cat_ler_catalogo: % vs %', pg_temp.so(pr, c_cat), e;
  END IF;
  IF pr ->> 'modelo_id' <> '2027b080-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'FALHOU: 4 — T não recebe o modelo do produto.'; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
END $t$;
RESET ROLE;

-- ─── 5. Recusas (4 chamadas) ─────────────────────────────────────────────────
DO $t$
DECLARE c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'; c_p constant uuid := '2027a080-0000-4000-8000-000000000001';
BEGIN
  -- N: sem acesso nenhum → CT001 nas duas
  PERFORM set_config('request.jwt.claims', current_setting('teste.n'), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.cat_ler_produto(c_nike, c_p);
    RAISE EXCEPTION 'FALHOU: 5 — N leu o produto';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_ler_referencias_produtos(c_nike);
    RAISE EXCEPTION 'FALHOU: 5 — N leu as referências';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  RESET ROLE;
  -- S: corte de técnico sem negocios.obra.materiais → CT001 no produto
  PERFORM set_config('request.jwt.claims', current_setting('teste.s'), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.cat_ler_produto(c_nike, c_p);
    RAISE EXCEPTION 'FALHOU: 5 — S (sem materiais) leu o produto';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  RESET ROLE;
  -- A: um produto da Mudelar pedido pela nike → CT003
  PERFORM set_config('request.jwt.claims', current_setting('teste.a'), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.cat_ler_produto(c_nike, current_setting('teste.mud')::uuid);
    RAISE EXCEPTION 'FALHOU: 5 — A leu um produto de outra organização';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END $t$;
RESET ROLE;

-- ─── 6. Acessos ──────────────────────────────────────────────────────────────
DO $t$
BEGIN
  IF has_function_privilege('anon', 'public.cat_ler_referencias_produtos(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cat_ler_produto(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_ler_referencias_produtos(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_ler_produto(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: 6 — EXECUTE tem de ser só authenticated/service_role.';
  END IF;
END $t$;

SELECT 'OK: catalogo_leituras_leves_produtos — 7 passos' AS resultado;

ROLLBACK;
