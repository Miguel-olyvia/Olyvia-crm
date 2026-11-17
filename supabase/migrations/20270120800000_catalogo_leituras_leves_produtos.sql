-- =============================================================================
-- Catálogo — LEITURAS LEVES para a página de Produtos (base de RH, uetjghdkwbywbftedtth).
-- =============================================================================
--
-- PORQUÊ: a página de Produtos (src/emylia/ProdutosPagina.tsx) já lista por páginas de 50 (cat_ler_produtos_pagina) e conta
-- (cat_ler_produtos_contagens), mas no arranque ainda carrega cat_ler_catalogo (todos os produtos, preços e fornecedores) e
-- cat_ler_produtos_tabelas (uma linha por produto) só para ter a árvore, as marcas, as unidades, os modelos e o produto da ficha.
-- Medido a 17/11 na Mudelar desta base (29 000 produtos, membro com services.view, 10 chamadas, octet_length(jsonb::text)):
--     cat_ler_catalogo          30,4 MB   6,1 s em média (máx. 15,5 s)
--     cat_ler_produtos_tabelas   8,6 MB   0,46 s em média (máx. 0,67 s)
--     cat_ler_modelos_gestao     0,34 MB  0,04 s em média
--
-- O QUE FAZ: só cria DUAS funções NOVAS. Não altera nenhuma função, tabela, vista, índice nem dado. O ecrã atual continua a
-- funcionar igual sem mudar nada; passa a poder chamar estas em vez das duas pesadas.
--
-- 1. cat_ler_referencias_produtos(p_org uuid) → jsonb
--    O que cat_ler_produtos_tabelas devolve MENOS o array "produtos" (o de uma linha por produto), com as mesmas chaves e os
--    mesmos valores, e mais os modelos:
--      { "categoriasProduto": [{id, name, parent_id, sort_order, ativa}],   -- igual a cat_ler_produtos_tabelas
--        "marcas":   [text],                                               -- igual
--        "unidades": [text],                                               -- igual
--        "exige":    [{service_id, categoria_produto_id}],                 -- igual
--        "modelos":  [{id, nome, numero, ativo, subcategoria: {id}}] | null }
--    "modelos": os modelos vivos da organização, na ordem de cat_ler_modelos_gestao (categoria, subcategoria, número), no formato
--    que juntarModelos (lerCatalogo.ts) já lê. Só a quem cat_ler_modelos_gestao os daria (products.edit ou services.view);
--    sem isso, null (= «não se leu», como hoje quando essa função dá CT001). Não traz «usados» (a contagem por modelo, que é
--    o que pesa) nem as siglas e nomes de subcategoria/categoria (estão em categoriasProduto).
--    Permissões e cortes: os de cat_ler_produtos_tabelas (= cat_ler_catalogo, 20270113100000): CT001 sem services.view, sem
--    pessoas.view e sem negocios.*; a quem só tem o corte de técnico sem negocios.obra.materiais, as categorias e marcas que
--    vêm só pelos produtos ficam de fora (exatamente como lá).
--
-- 2. cat_ler_produto(p_org uuid, p_produto uuid) → jsonb — UM produto do Catálogo (tipo_catalogo não nulo, não apagado).
--    Chaves por produto de cat_ler_catalogo.produtos[] (mesmos nomes e valores):
--      id, name, sku, tipo_catalogo, unidade, catalogo_categoria_id, servico_id, fator_servico, entulho_m3, entulho_kg,
--      short_description, marca_livre, fornecedor_livre, image_urls
--    Chaves por produto de cat_ler_produtos_tabelas.produtos[] (mesmos nomes e valores):
--      brand_id, marca, uom_id, uom, category_id, subcategory_id
--    Chaves de cat_ler_produtos_pagina.produtos[] (mesmos nomes):
--      sku_gerado, categoria (nome da categoria, a do produto ou a mãe da subcategoria), subcategoria (nome), ativo,
--      modelo_id, modelo, modelo_numero (modelo apagado = null)
--    Mais:
--      estado          products.status (texto)
--      ve_valores      true = quem lê tem services.view e os valores abaixo são reais; false = vêm todos null/[] por permissão
--      precosProduto   [{product_id, price_type, price, valid_from}] — as linhas deste produto, como cat_ler_catalogo.precosProduto
--      fornecedores    [{product_id, purchase_price, preco_data, ligacao, fornecedor, supplier_id, supplier_sku, fornecedor_codigo}]
--                      — a linha de cat_ler_catalogo.fornecedores (a vista dá sempre uma, com ligacao 'por_ligar' e o resto
--                      null quando não há fornecedor; [] sem services.view), mais o fornecedor (id e código) e o código do
--                      artigo no fornecedor
--      custo, custo_data, pvp, grossista, distribuidor, fornecedor — já calculados com a regra do ecrã (catalogoReal.ts
--        montarCatalogo/custoDe/ultimo): custo = o do fornecedor ligado (purchase_price não nulo e ligacao <> 'por_ligar'),
--        senão o último custo ('purchase'); custo_data = preco_data do fornecedor ou a data desse custo (AAAA-MM-DD);
--        pvp = o último 'retail' se > 0, senão null; grossista / distribuidor = o último 'wholesale' / 'distributor' (0 é
--        valor); fornecedor = o nome do fornecedor ligado, senão fornecedor_livre. «O último» = valid_from DESC NULLS LAST,
--        created_at DESC, id (a regra de cat_ler_produtos_pagina). null = não há (o ecrã mostra 0 no custo, como hoje).
--    Permissões e cortes: os de cat_ler_catalogo. CT001 sem services.view, sem pessoas.view e sem negocios.*; CT001 também
--    a quem só tem o corte de técnico sem negocios.obra.materiais (lá recebe "produtos": []). Com o corte de técnico (sem
--    services.view): custos, preços e fornecedor ligado vêm null / [] e ve_valores false; fornecedor_livre continua (vem
--    em cat_ler_catalogo.produtos). Depois da permissão: CT003 se o produto não existe, está apagado, não é do Catálogo ou
--    é de outra organização (a permissão vem primeiro: quem não tem acesso à organização não sabe se o produto existe).
--
-- As duas: STABLE, SECURITY DEFINER, SET search_path = public, pg_temp; EXECUTE só authenticated e service_role.
--
-- O ECRÃ (por fazer, noutra tarefa): lerCatalogo.ts / catalogoReal.ts passam a ler cat_ler_referencias_produtos para a
-- árvore, marcas, unidades, exige e modelos (juntarTabelas sem produtos e juntarModelos com o objeto inteiro), e a ficha
-- (FichaProdutoAberto.tsx / FichaProduto.tsx) lê cat_ler_produto em vez de procurar em K.produtos e em vez de
-- lerModeloDoProduto (produtosPaginados.ts). Esta migration não precisa de código novo para nada continuar a funcionar.
--
-- Teste: supabase/tests/catalogo_leituras_leves_produtos.test.sql (BEGIN … ROLLBACK, nike; o passo 0 falha antes).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_falta text;
BEGIN
  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.fn_cat_exigir(uuid,text)', 'public.fn_cat_pode(uuid,text)', 'public.fn_neg_so_execucao(uuid,text)',
                    'public.cat_ler_catalogo(uuid)', 'public.cat_ler_produtos_tabelas(uuid)', 'public.cat_ler_modelos_gestao(uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_falta IS NOT NULL THEN RAISE EXCEPTION 'Faltam funções: %. Rever esta migration.', v_falta; END IF;
  IF to_regclass('public.cat_v_produto_fornecedor') IS NULL OR to_regclass('public.product_models') IS NULL THEN
    RAISE EXCEPTION 'Falta cat_v_produto_fornecedor ou product_models. Rever esta migration.';
  END IF;

  -- só funções NOVAS: se já existir uma com estes nomes (qualquer assinatura), parar
  SELECT string_agg(pr.oid::regprocedure::text, ', ') INTO v_falta FROM pg_proc pr
  WHERE pr.pronamespace = 'public'::regnamespace AND pr.proname::text IN ('cat_ler_referencias_produtos', 'cat_ler_produto');
  IF v_falta IS NOT NULL THEN RAISE EXCEPTION 'Já existe %: rever esta migration.', v_falta; END IF;
END $g$;

-- ─── 1. As referências da página de Produtos (sem a linha por produto) ──────────
-- Corpo de cat_ler_produtos_tabelas (20270117700000, lido no remoto a 17/11) sem a chave "produtos"; "prod" só com as três
-- colunas que as referências usam. Mais "modelos".
CREATE FUNCTION public.cat_ler_referencias_produtos(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tec boolean; v_mat boolean; v_mod boolean;
BEGIN
  -- as mesmas permissões e o mesmo corte de cat_ler_produtos_tabelas e cat_ler_catalogo (20270113100000)
  v_tec := public.fn_neg_so_execucao(p_org, 'services.view');
  IF NOT v_tec AND NOT public.fn_cat_pode(p_org, 'services.view') THEN
    v_tec := public.fn_cat_pode(p_org, 'pessoas.view')
      OR EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(p_org, ap.code));
  END IF;
  IF NOT v_tec THEN PERFORM public.fn_cat_exigir(p_org, 'services.view'); END IF;
  v_mat := NOT v_tec OR public.fn_cat_pode(p_org, 'negocios.obra.materiais');
  -- os modelos: a quem cat_ler_modelos_gestao os daria (products.edit ou services.view)
  v_mod := public.fn_cat_pode(p_org, 'products.edit') OR public.fn_cat_pode(p_org, 'services.view');
  RETURN (
    WITH prod AS (SELECT category_id, subcategory_id, brand_id FROM products
                  WHERE organization_id = p_org AND tipo_catalogo IS NOT NULL AND NOT is_deleted AND v_mat),
         exige AS (SELECT id, exige_categoria_produto_id FROM services
                   WHERE organization_id = p_org AND no_catalogo AND NOT is_deleted AND exige_categoria_produto_id IS NOT NULL),
         usadas AS (SELECT category_id AS id FROM prod UNION SELECT subcategory_id FROM prod UNION SELECT exige_categoria_produto_id FROM exige),
         cats AS (SELECT c.id, c.name, c.parent_id, c.sort_order, coalesce(c.is_active, true) AS ativa FROM product_categories c
                  WHERE c.id IN (SELECT id FROM usadas WHERE id IS NOT NULL)
                     OR (c.deleted_at IS NULL AND (c.organization_id = p_org
                         OR c.id IN (SELECT o.category_id FROM product_category_organizations o WHERE o.organization_id = p_org))))
    SELECT jsonb_build_object(
      'categoriasProduto', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
                    SELECT id, name, parent_id, sort_order, ativa FROM cats
                    UNION SELECT c.id, c.name, c.parent_id, c.sort_order, coalesce(c.is_active, true) FROM product_categories c WHERE c.id IN (SELECT parent_id FROM cats)) x), '[]'),
      'marcas', coalesce((SELECT jsonb_agg(DISTINCT b.name) FROM brands b
                  WHERE b.deleted_at IS NULL AND coalesce(b.is_active, true)
                    AND (b.organization_id = p_org OR b.id IN (SELECT brand_id FROM prod))), '[]'),
      'unidades', coalesce((SELECT jsonb_agg(DISTINCT u.code) FROM uom u
                  WHERE u.is_active AND u.base_uom_id IS NULL AND (u.organization_id IS NULL OR u.organization_id = p_org)), '[]'),
      'exige', coalesce((SELECT jsonb_agg(jsonb_build_object('service_id', id, 'categoria_produto_id', exige_categoria_produto_id)) FROM exige), '[]'),
      -- os modelos vivos, como cat_ler_modelos_gestao (mesma junção e ordem), só com o que o ecrã usa
      'modelos', CASE WHEN v_mod THEN coalesce((
                  SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'nome', pm.name, 'numero', pm.numero, 'ativo', pm.is_active,
                                                      'subcategoria', jsonb_build_object('id', s.id))
                                   ORDER BY coalesce(c.sort_order, 0), c.name, coalesce(s.sort_order, 0), s.name, pm.numero, pm.id)
                  FROM product_models pm
                  JOIN product_categories s ON s.id = pm.subcategory_id
                  LEFT JOIN product_categories c ON c.id = s.parent_id
                  WHERE pm.organization_id = p_org AND pm.deleted_at IS NULL), '[]'::jsonb) END
    ));
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_referencias_produtos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_referencias_produtos(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_referencias_produtos(uuid) IS
  'Catálogo (20270120800000): as referências da página de Produtos — categoriasProduto, marcas, unidades e exige iguais a cat_ler_produtos_tabelas (sem o array por produto) e os modelos vivos ({id, nome, numero, ativo, subcategoria:{id}}; null sem products.edit nem services.view). Permissões e cortes de cat_ler_catalogo.';

-- ─── 2. Um produto (a ficha) ────────────────────────────────────────────────────
CREATE FUNCTION public.cat_ler_produto(p_org uuid, p_produto uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tec boolean; v_mat boolean; v_val boolean; v_id uuid; r jsonb;
BEGIN
  -- as mesmas permissões e o mesmo corte de cat_ler_catalogo (20270113100000)
  v_tec := public.fn_neg_so_execucao(p_org, 'services.view');
  IF NOT v_tec AND NOT public.fn_cat_pode(p_org, 'services.view') THEN
    v_tec := public.fn_cat_pode(p_org, 'pessoas.view')
      OR EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(p_org, ap.code));
  END IF;
  IF NOT v_tec THEN PERFORM public.fn_cat_exigir(p_org, 'services.view'); END IF;
  v_mat := NOT v_tec OR public.fn_cat_pode(p_org, 'negocios.obra.materiais');
  -- lá, sem negocios.obra.materiais, "produtos" vem vazio: aqui não há produto para dar
  IF NOT v_mat THEN RAISE EXCEPTION 'Sem permissão (negocios.obra.materiais).' USING ERRCODE = 'CT001'; END IF;
  -- custos, preços e fornecedor ligado: só sem o corte (= services.view), como precosProduto e fornecedores lá
  v_val := NOT v_tec;

  -- o produto do Catálogo desta organização (o mesmo filtro de "prod" em cat_ler_catalogo)
  SELECT p.id INTO v_id FROM products p
  WHERE p.id = p_produto AND p.organization_id = p_org AND p.tipo_catalogo IS NOT NULL AND NOT p.is_deleted;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;

  WITH pr AS (
         SELECT pp.product_id, pp.price_type::text AS price_type, coalesce(pp.preco_exato, pp.price) AS price, pp.valid_from,
                pp.created_at, pp.id
         FROM product_prices pp WHERE v_val AND pp.product_id = v_id),
       ult AS (
         SELECT DISTINCT ON (pr.price_type) pr.price_type, pr.price, pr.valid_from FROM pr
         ORDER BY pr.price_type, pr.valid_from DESC NULLS LAST, pr.created_at DESC, pr.id),
       fo AS (
         SELECT v.product_id, v.purchase_price, v.preco_data, v.ligacao, su.name AS fornecedor,
                v.supplier_id, v.supplier_sku, su.code AS fornecedor_codigo
         FROM cat_v_produto_fornecedor v LEFT JOIN suppliers su ON su.id = v.supplier_id
         WHERE v_val AND v.product_id = v_id AND v.organization_id = p_org),
       cu AS (
         SELECT CASE WHEN f.purchase_price IS NOT NULL AND f.ligacao <> 'por_ligar' THEN f.purchase_price ELSE c.price END AS custo,
                CASE WHEN f.purchase_price IS NOT NULL AND f.ligacao <> 'por_ligar'
                     THEN coalesce(to_char(f.preco_data, 'YYYY-MM-DD'), to_char(c.valid_from, 'YYYY-MM-DD'))
                     ELSE to_char(c.valid_from, 'YYYY-MM-DD') END AS custo_data,
                CASE WHEN f.purchase_price IS NOT NULL AND f.ligacao <> 'por_ligar' THEN nullif(f.fornecedor, '') END AS fornecedor
         FROM (SELECT 1) um
         LEFT JOIN fo f ON true
         LEFT JOIN ult c ON c.price_type = 'purchase')
  SELECT jsonb_build_object(
           -- de cat_ler_catalogo.produtos[]
           'id', p.id, 'name', p.name, 'sku', p.sku, 'tipo_catalogo', p.tipo_catalogo, 'unidade', p.unidade,
           'catalogo_categoria_id', p.catalogo_categoria_id, 'servico_id', p.servico_id, 'fator_servico', p.fator_servico,
           'entulho_m3', p.entulho_m3, 'entulho_kg', p.entulho_kg, 'short_description', p.short_description,
           'marca_livre', p.marca_livre, 'fornecedor_livre', p.fornecedor_livre, 'image_urls', p.image_urls,
           -- de cat_ler_produtos_tabelas.produtos[]
           'brand_id', p.brand_id, 'marca', b.name, 'uom_id', p.uom_id, 'uom', u.code,
           'category_id', p.category_id, 'subcategory_id', p.subcategory_id,
           -- de cat_ler_produtos_pagina.produtos[]
           'sku_gerado', p.sku_gerado, 'categoria', c.name, 'subcategoria', s.name, 'ativo', p.is_active,
           'modelo_id', pm.id, 'modelo', pm.name, 'modelo_numero', pm.numero,
           'estado', p.status::text,
           've_valores', v_val,
           'precosProduto', coalesce((SELECT jsonb_agg(jsonb_build_object('product_id', x.product_id, 'price_type', x.price_type,
                                                                          'price', x.price, 'valid_from', x.valid_from)
                                                       ORDER BY x.valid_from NULLS FIRST, x.created_at, x.id) FROM pr x), '[]'::jsonb),
           'fornecedores', coalesce((SELECT jsonb_agg(to_jsonb(f)) FROM fo f), '[]'::jsonb),
           'custo', cu.custo, 'custo_data', cu.custo_data,
           'pvp', (SELECT CASE WHEN x.price > 0 THEN x.price END FROM ult x WHERE x.price_type = 'retail'),
           'grossista', (SELECT x.price FROM ult x WHERE x.price_type = 'wholesale'),
           'distribuidor', (SELECT x.price FROM ult x WHERE x.price_type = 'distributor'),
           'fornecedor', coalesce(cu.fornecedor, nullif(p.fornecedor_livre, '')))
  INTO r
  FROM products p
  CROSS JOIN cu
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN uom u ON u.id = p.uom_id
  LEFT JOIN product_categories s ON s.id = p.subcategory_id
  LEFT JOIN product_categories c ON c.id = coalesce(p.category_id, s.parent_id)
  LEFT JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
  WHERE p.id = v_id;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_produto(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_produto(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_produto(uuid, uuid) IS
  'Catálogo (20270120800000): um produto do Catálogo para a ficha — os campos de cat_ler_catalogo.produtos[] e de cat_ler_produtos_tabelas.produtos[] com os mesmos nomes, o modelo, as categorias, as linhas de preço e o fornecedor ligado, e custo/pvp/grossista/distribuidor/fornecedor já calculados. Permissões e cortes de cat_ler_catalogo (valores só com services.view; CT001 sem acesso ou sem negocios.obra.materiais no corte de técnico); CT003 se o produto não for desta organização.';

-- ─── 3. Conferir ────────────────────────────────────────────────────────────────
DO $c$
DECLARE
  c_sp constant text := 'search_path=public, pg_temp';
  v_sig text; v_oid oid; p record;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_referencias_produtos(uuid)', 'public.cat_ler_produto(uuid,uuid)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_sig; END IF;
    SELECT pr.prosecdef, pr.proconfig, pr.proacl, pr.provolatile::text AS vol INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
    IF NOT p.prosecdef THEN RAISE EXCEPTION 'Conferir: % não é SECURITY DEFINER.', v_sig; END IF;
    IF p.vol <> 's' THEN RAISE EXCEPTION 'Conferir: % não é STABLE.', v_sig; END IF;
    IF p.proconfig IS NULL OR NOT (c_sp = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'Conferir: % sem search_path = public, pg_temp.', v_sig;
    END IF;
    IF p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type::text = 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % ainda dá EXECUTE a PUBLIC.', v_sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'Conferir: anon pode executar %.', v_sig; END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'Conferir: authenticated não pode executar %.', v_sig; END IF;
  END LOOP;
  RAISE NOTICE 'catalogo_leituras_leves_produtos: cat_ler_referencias_produtos e cat_ler_produto criadas — conferidas.';
END $c$;
