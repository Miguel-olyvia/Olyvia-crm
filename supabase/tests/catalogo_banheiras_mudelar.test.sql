-- ============================================================
-- Testes: 20270120000000_catalogo_banheiras_mudelar.sql (base RH)
-- Ficheiro GERADO por script (gerar.js) a partir do Excel, como a migration.
-- ============================================================
-- ORDEM: correr ANTES do db push da 20270120000000 (falha no passo 0: os produtos desta importação ainda não existem na
-- Mudelar); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355) e, para provar que nada foi escrito fora dela, as outras organizações (só
-- contagens pelo xmin da transação da importação). Para comparar os SKUs com cat_prever_sku_modelo usa, só nesta
-- transação, as claims de um membro ativo da Mudelar com products.edit (a função é só de leitura). Nenhuma chamada
-- recusada de propósito. Não assume que as opções de Cor/Largura, marcas ou fornecedores NÃO existiam (outras
-- importações podem tê-los criado antes): confere o resultado, não a origem.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_banheiras_mudelar.test.sql
--
-- O que PROVA:
--   0. Os produtos desta importação (pelos nomes do Excel) existem na Mudelar.
--   1. 23 produtos vivos nas subcategorias; por modelo Banheira Easy 2, Banheira Vértice 8, Pés de banheira c/ kit fixação 3, Painel 10; 4 modelos com nome e número.
--   2. Cada produto como a linha do Excel: nome, SKU exato, modelo, marca, fornecedor, código do fornecedor (supplier_sku),
--      estado, unidade, custo (2 casas), PVP, IVA 23 e os atributos (cor, largura, medida 2D em cm) — e só esses.
--   3. Nenhum preço grossista/distribuidor (o Excel tem 0); 2 preços e 1 ligação a fornecedor por produto.
--   4. SKUs únicos e no formato.
--   5. As opções de Cor e de Largura usadas existem, ativas, com sigla (as conhecidas com a sigla esperada).
--   6. Nenhuma linha de outra organização tem o xmin da transação que criou os produtos.
--   7. Todos os produtos: cat_prever_sku_modelo dá o SKU gravado, sem faltas.
--   8. Auditoria: há linhas com a fonte migration:catalogo_banheiras_mudelar.
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A importação foi aplicada? ───────────────────────────────────────────
DO $t0$
DECLARE v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
    AND p.name IN ('BANHEIRA VÉRTICE 150x70', 'BANHEIRA VÉRTICE 160x70', 'BANHEIRA VÉRTICE 160x75', 'BANHEIRA VÉRTICE 170x75', 'BANHEIRA VÉRTICE 170x70', 'BANHEIRA VÉRTICE 175x80', 'BANHEIRA VÉRTICE 180x80', 'BANHEIRA VÉRTICE 190x90', 'BANHEIRA EASY 170x70', 'BANHEIRA EASY 170x75', 'PÉS DE BANHEIRA C/KIT FIXAÇÃO 60', 'PÉS DE BANHEIRA C/KIT FIXAÇÃO 70', 'PÉS DE BANHEIRA C/KIT FIXAÇÃO 80', 'PAINEL 70', 'PAINEL 75', 'PAINEL 80', 'PAINEL 90', 'PAINEL 150', 'PAINEL 160', 'PAINEL 170', 'PAINEL 175', 'PAINEL 180', 'PAINEL 190');
  IF v_n <> 23 THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — a Mudelar tem % dos 23 produtos desta importação (aplicar 20270120000000).', v_n;
  END IF;
END $t0$;

-- ─── 1 a 8 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_total constant integer := 23;
  c_n_valores constant integer := 23;
  v_cat uuid; v_a_cor uuid; v_a_larg uuid; v_a_med uuid; v_g_cor uuid; v_g_larg uuid;
  v_n bigint; v_m bigint; v_k bigint; v_txt text; v_xid text; v_auth uuid; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  SELECT c.id INTO v_cat FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND public.fn_cat_chave_opcao(c.name) = 'duche & banho';
  SELECT a.id INTO v_a_cor FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'cor';
  SELECT a.id INTO v_a_larg FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'largura';
  SELECT a.id INTO v_a_med FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'medida';
  IF v_cat IS NULL OR v_a_cor IS NULL OR v_a_larg IS NULL OR v_a_med IS NULL THEN
    RAISE EXCEPTION 'FALHOU: configuração da Mudelar incompleta (categoria ou atributos).';
  END IF;
  v_g_cor := public.fn_cat_grupo_do_atributo(v_a_cor, c_org);
  v_g_larg := public.fn_cat_grupo_do_atributo(v_a_larg, c_org);

  DROP TABLE IF EXISTS pg_temp._t_esp;
  CREATE TEMP TABLE _t_esp (nome text, sub text, numero integer, modelo text, marca text, forn text, cod text, custo numeric, pvp numeric,
                            cor text, larg text, ml integer, mc integer, status text, sku text) ON COMMIT DROP;
  INSERT INTO _t_esp VALUES
    ('BANHEIRA VÉRTICE 150x70', 'Banheiras', 2, 'Banheira Vértice', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '807500', 121.27, 189.49, NULL::text, NULL::text, 150, 70, 'draft', 'DB-BN-0002-150X70'),
    ('BANHEIRA VÉRTICE 160x70', 'Banheiras', 2, 'Banheira Vértice', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805600', 135.53, 211.77, NULL::text, NULL::text, 160, 70, 'draft', 'DB-BN-0002-160X70'),
    ('BANHEIRA VÉRTICE 160x75', 'Banheiras', 2, 'Banheira Vértice', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805700', 143.50, 224.22, NULL::text, NULL::text, 160, 75, 'draft', 'DB-BN-0002-160X75'),
    ('BANHEIRA VÉRTICE 170x75', 'Banheiras', 2, 'Banheira Vértice', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805900', 159.46, 249.16, NULL::text, NULL::text, 170, 75, 'draft', 'DB-BN-0002-170X75'),
    ('BANHEIRA VÉRTICE 170x70', 'Banheiras', 2, 'Banheira Vértice', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805800', 151.49, 236.70, NULL::text, NULL::text, 170, 70, 'draft', 'DB-BN-0002-170X70'),
    ('BANHEIRA VÉRTICE 175x80', 'Banheiras', 2, 'Banheira Vértice', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806000', 169.43, 264.74, NULL::text, NULL::text, 175, 80, 'draft', 'DB-BN-0002-175X80'),
    ('BANHEIRA VÉRTICE 180x80', 'Banheiras', 2, 'Banheira Vértice', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806100', 179.39, 280.30, NULL::text, NULL::text, 180, 80, 'draft', 'DB-BN-0002-180X80'),
    ('BANHEIRA VÉRTICE 190x90', 'Banheiras', 2, 'Banheira Vértice', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806200', 189.34, 295.85, NULL::text, NULL::text, 190, 90, 'draft', 'DB-BN-0002-190X90'),
    ('BANHEIRA EASY 170x70', 'Banheiras', 1, 'Banheira Easy', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806800', 106.54, 166.47, NULL::text, NULL::text, 170, 70, 'draft', 'DB-BN-0001-170X70'),
    ('BANHEIRA EASY 170x75', 'Banheiras', 1, 'Banheira Easy', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806900', 112.15, 175.23, NULL::text, NULL::text, 170, 75, 'draft', 'DB-BN-0001-170X75'),
    ('PÉS DE BANHEIRA C/KIT FIXAÇÃO 60', 'Banheiras', 3, 'Pés de banheira c/ kit fixação', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '810', 12.95, 20.23, NULL::text, '60', NULL::integer, NULL::integer, 'draft', 'DB-BN-0003-60'),
    ('PÉS DE BANHEIRA C/KIT FIXAÇÃO 70', 'Banheiras', 3, 'Pés de banheira c/ kit fixação', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '811', 12.95, 20.23, NULL::text, '70', NULL::integer, NULL::integer, 'draft', 'DB-BN-0003-70'),
    ('PÉS DE BANHEIRA C/KIT FIXAÇÃO 80', 'Banheiras', 3, 'Pés de banheira c/ kit fixação', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '813', 12.95, 20.23, NULL::text, '80', NULL::integer, NULL::integer, 'draft', 'DB-BN-0003-80'),
    ('PAINEL 70', 'Banheiras', 4, 'Painel', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '800203', 43.97, 68.70, NULL::text, '70', NULL::integer, NULL::integer, 'draft', 'DB-BN-0004-70'),
    ('PAINEL 75', 'Banheiras', 4, 'Painel', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '800202', 46.16, 72.13, NULL::text, '75', NULL::integer, NULL::integer, 'draft', 'DB-BN-0004-75'),
    ('PAINEL 80', 'Banheiras', 4, 'Painel', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '800302', 53.52, 83.62, NULL::text, '80', NULL::integer, NULL::integer, 'draft', 'DB-BN-0004-80'),
    ('PAINEL 90', 'Banheiras', 4, 'Painel', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806202', 66.05, 103.21, NULL::text, '90', NULL::integer, NULL::integer, 'draft', 'DB-BN-0004-90'),
    ('PAINEL 150', 'Banheiras', 4, 'Painel', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '800601', 78.01, 121.89, NULL::text, '150', NULL::integer, NULL::integer, 'draft', 'DB-BN-0004-150'),
    ('PAINEL 160', 'Banheiras', 4, 'Painel', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805601', 82.34, 128.66, NULL::text, '160', NULL::integer, NULL::integer, 'draft', 'DB-BN-0004-160'),
    ('PAINEL 170', 'Banheiras', 4, 'Painel', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805801', 90.56, 141.50, NULL::text, '170', NULL::integer, NULL::integer, 'draft', 'DB-BN-0004-170'),
    ('PAINEL 175', 'Banheiras', 4, 'Painel', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806001', 95.33, 148.95, NULL::text, '175', NULL::integer, NULL::integer, 'draft', 'DB-BN-0004-175'),
    ('PAINEL 180', 'Banheiras', 4, 'Painel', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805101', 102.95, 160.86, NULL::text, '180', NULL::integer, NULL::integer, 'draft', 'DB-BN-0004-180'),
    ('PAINEL 190', 'Banheiras', 4, 'Painel', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806201', 115.46, 180.41, NULL::text, '190', NULL::integer, NULL::integer, 'draft', 'DB-BN-0004-190');

  -- 1. quantos, por modelo, e os modelos
  SELECT count(*) INTO v_n FROM products p JOIN product_categories s ON s.id = p.subcategory_id AND s.parent_id = v_cat
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND public.fn_cat_chave_opcao(s.name) IN ('banheiras');
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 1 — % produtos nas subcategorias em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(e.sub || ' ' || e.nome || ': ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM (VALUES ('Banheiras', 1, 'Banheira Easy', 2), ('Banheiras', 2, 'Banheira Vértice', 8), ('Banheiras', 3, 'Pés de banheira c/ kit fixação', 3), ('Banheiras', 4, 'Painel', 10)) AS e(sub, numero, nome, n)
  LEFT JOIN product_categories s ON s.organization_id = c_org AND s.parent_id = v_cat AND s.deleted_at IS NULL
                                AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.sub)
  LEFT JOIN product_models pm ON pm.organization_id = c_org AND pm.subcategory_id = s.id AND pm.deleted_at IS NULL
                             AND pm.numero = e.numero AND pm.name = e.nome AND pm.is_active
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p
             WHERE p.organization_id = c_org AND NOT p.is_deleted GROUP BY p.model_id) x ON x.model_id = pm.id
  WHERE coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — por modelo: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM product_models pm JOIN product_categories s ON s.id = pm.subcategory_id AND s.parent_id = v_cat
  WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(s.name) IN ('banheiras');
  IF v_n <> 4 THEN RAISE EXCEPTION 'FALHOU: passo 1 — % modelos vivos nas subcategorias em vez de 4.', v_n; END IF;

  -- 2. cada produto como a linha do Excel
  SELECT count(*), string_agg(x.nome, ' | ') FILTER (WHERE x.k <= 5) INTO v_n, v_txt
  FROM (SELECT e.nome, row_number() OVER (ORDER BY e.nome) AS k
        FROM _t_esp e
        LEFT JOIN product_categories s ON s.organization_id = c_org AND s.parent_id = v_cat AND s.deleted_at IS NULL
                                      AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.sub)
        LEFT JOIN products p ON p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = s.id AND p.name = e.nome
        LEFT JOIN product_models pm ON pm.id = p.model_id
        LEFT JOIN brands bk ON bk.id = p.brand_id
        LEFT JOIN suppliers su ON su.id = p.supplier_id
        LEFT JOIN attribute_option_group_values oc ON oc.group_id = v_g_cor AND public.fn_cat_chave_opcao(oc.value_text::text) = public.fn_cat_chave_opcao(e.cor)
        LEFT JOIN attribute_option_group_values ol ON ol.group_id = v_g_larg AND public.fn_cat_chave_opcao(ol.value_text::text) = public.fn_cat_chave_opcao(e.larg)
        LEFT JOIN product_attribute_values vc ON vc.product_id = p.id AND vc.attribute_id = v_a_cor
        LEFT JOIN product_attribute_values vl ON vl.product_id = p.id AND vl.attribute_id = v_a_larg
        LEFT JOIN product_attribute_values vm ON vm.product_id = p.id AND vm.attribute_id = v_a_med
        LEFT JOIN product_prices pc ON pc.product_id = p.id AND pc.price_type = 'purchase'
        LEFT JOIN product_prices pv ON pv.product_id = p.id AND pv.price_type = 'retail'
        LEFT JOIN item_suppliers i ON i.product_id = p.id AND i.deleted_at IS NULL
        WHERE NOT coalesce(p.sku = replace(e.sku, '{cor}', coalesce(oc.sigla, '?')) AND p.sku_gerado
              AND pm.numero = e.numero AND pm.name = e.modelo AND pm.subcategory_id = s.id AND pm.deleted_at IS NULL
              AND p.category_id = v_cat AND p.brand_id = bk.id AND bk.name = e.marca AND p.marca_livre = e.marca
              AND public.fn_cat_chave_opcao(su.name) = public.fn_cat_chave_opcao(e.forn) AND p.supplier_id = su.id
              AND p.status::text = e.status AND p.is_active AND p.unidade = 'un' AND p.uom_id IS NOT NULL AND p.tipo_catalogo = 'produto'
              AND p.manages_stock
              AND ((e.cor IS NULL AND vc.product_id IS NULL) OR (oc.id IS NOT NULL AND vc.value_text = oc.value_text::text AND oc.is_active AND oc.sigla IS NOT NULL))
              AND ((e.larg IS NULL AND vl.product_id IS NULL) OR (ol.id IS NOT NULL AND vl.value_text = ol.value_text::text AND ol.is_active AND ol.sigla = e.larg))
              AND ((e.ml IS NULL AND vm.product_id IS NULL)
                   OR (vm.unit = 'cm' AND vm.value_json ->> 'tipo' = '2D' AND vm.value_json ->> 'unidade' = 'cm'
                       AND (vm.value_json ->> 'largura')::numeric = e.ml AND (vm.value_json ->> 'comprimento')::numeric = e.mc
                       AND public.fn_cat_medida_ler(vm.value_json, vm.unit) IS NOT NULL
                       AND vm.value_text = public.fn_cat_num_texto(e.ml::numeric) || ' × ' || public.fn_cat_num_texto(e.mc::numeric) || ' cm'))
              AND pc.price = e.custo AND pc.vat_rate = 23 AND pc.currency = 'EUR'
              AND pv.price = e.pvp AND pv.vat_rate = 23 AND pv.currency = 'EUR'
              AND i.supplier_id = su.id AND i.is_preferred AND i.is_active AND i.organization_id = c_org
              AND i.purchase_price = e.custo AND i.supplier_sku = e.cod,
              false)) x;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2 — % produtos diferentes da linha do Excel (ex.: %).', v_n, v_txt; END IF;
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN products p ON p.id = v.product_id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT e.nome FROM _t_esp e);
  IF v_n <> c_n_valores THEN RAISE EXCEPTION 'FALHOU: passo 2 — % valores de atributos nos produtos (esperados %).', v_n, c_n_valores; END IF;

  -- 3. preços e fornecedores: nada a mais
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT e.nome FROM _t_esp e)
    AND ((SELECT count(*) FROM product_prices x WHERE x.product_id = p.id) <> 2
         OR (SELECT count(*) FROM item_suppliers x WHERE x.product_id = p.id AND x.deleted_at IS NULL) <> 1
         OR (SELECT count(*) FROM product_organizations x WHERE x.product_id = p.id) <> 1);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 3 — % produtos com preços, ligações a fornecedor ou product_organizations a mais ou a menos.', v_n; END IF;

  -- 4. SKUs únicos e no formato
  SELECT count(*), count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ '^DB-(BN)-[0-9]{4}(-[A-Z0-9]+){0,3}$' OR p.sku ~ '^CAT-')
    INTO v_n, v_m, v_k
  FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT e.nome FROM _t_esp e);
  IF v_n <> c_total OR v_m <> c_total OR v_k > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — % produtos, % SKUs distintos, % fora do formato.', v_n, v_m, v_k;
  END IF;

  -- 5. as opções usadas
  SELECT string_agg(e.papel || ' ' || e.nome || ': ' || coalesce(o.sigla, 'sem opção/sigla') || ' em vez de ' || e.sigla, '; ') INTO v_txt
  FROM (VALUES ('largura', '60', '60'), ('largura', '70', '70'), ('largura', '75', '75'), ('largura', '80', '80'), ('largura', '90', '90'), ('largura', '150', '150'), ('largura', '160', '160'), ('largura', '170', '170'), ('largura', '175', '175'), ('largura', '180', '180'), ('largura', '190', '190')) AS e(papel, nome, sigla)
  LEFT JOIN attribute_option_group_values o
    ON o.group_id = (CASE WHEN e.papel = 'cor' THEN v_g_cor ELSE v_g_larg END)
   AND public.fn_cat_chave_opcao(o.value_text::text) = public.fn_cat_chave_opcao(e.nome) AND o.is_active
  WHERE o.id IS NULL OR o.sigla IS NULL OR (e.sigla <> '*' AND o.sigla IS DISTINCT FROM e.sigla);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — opções: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM (SELECT o.papel, o.nome FROM (VALUES ('largura', '60', '60'), ('largura', '70', '70'), ('largura', '75', '75'), ('largura', '80', '80'), ('largura', '90', '90'), ('largura', '150', '150'), ('largura', '160', '160'), ('largura', '170', '170'), ('largura', '175', '175'), ('largura', '180', '180'), ('largura', '190', '190')) AS o(papel, nome, sigla)) o2
  WHERE (SELECT count(*) FROM attribute_option_group_values v
         WHERE v.group_id = (CASE WHEN o2.papel = 'cor' THEN v_g_cor ELSE v_g_larg END)
           AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(o2.nome)) <> 1;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 5 — % opções repetidas ou em falta.', v_n; END IF;

  -- 6. nada escrito fora da Mudelar
  SELECT mode() WITHIN GROUP (ORDER BY p.xmin::text) INTO v_xid FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT e.nome FROM _t_esp e);
  SELECT string_agg(x.t || ' ' || x.n, ', ') INTO v_txt FROM (
    SELECT 'products' AS t, count(*) AS n FROM products p WHERE p.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_prices', count(*) FROM product_prices x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_attribute_values', count(*) FROM product_attribute_values x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_organizations', count(*) FROM product_organizations x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'item_suppliers', count(*) FROM item_suppliers x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'suppliers', count(*) FROM suppliers x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_models', count(*) FROM product_models x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'uom', count(*) FROM uom x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_group_values', count(*) FROM attribute_option_group_values v JOIN attribute_option_groups g ON g.id = v.group_id
              WHERE v.xmin::text = v_xid AND g.organization_id IS DISTINCT FROM c_org) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 6 — linhas de outras organizações escritas pela importação: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id IS DISTINCT FROM c_org
    AND (p.subcategory_id IN (SELECT s.id FROM product_categories s WHERE s.organization_id = c_org AND s.parent_id = v_cat
                              AND public.fn_cat_chave_opcao(s.name) IN ('banheiras'))
         OR p.model_id IN (SELECT pm.id FROM product_models pm WHERE pm.organization_id = c_org));
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 6 — % produtos de outras organizações apontam para subcategorias ou modelos da Mudelar.', v_n; END IF;

  -- 7. cat_prever_sku_modelo (só leitura) como um membro da Mudelar com products.edit, para todos
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 7 — sem membro ativo da Mudelar com products.edit.'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  v_n := 0;
  FOR r IN SELECT p.id, p.sku, p.category_id, p.subcategory_id, p.model_id, oc.id AS cor, ol.id AS larg, vm.value_json
           FROM products p
           LEFT JOIN product_attribute_values vc ON vc.product_id = p.id AND vc.attribute_id = v_a_cor
           LEFT JOIN attribute_option_group_values oc ON oc.group_id = v_g_cor AND oc.value_text = vc.value_text
           LEFT JOIN product_attribute_values vl ON vl.product_id = p.id AND vl.attribute_id = v_a_larg
           LEFT JOIN attribute_option_group_values ol ON ol.group_id = v_g_larg AND ol.value_text = vl.value_text
           LEFT JOIN product_attribute_values vm ON vm.product_id = p.id AND vm.attribute_id = v_a_med
           WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT e.nome FROM _t_esp e)
           ORDER BY p.sku LOOP
    v_attrs := coalesce(CASE WHEN r.cor IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_cor, 'opcao', r.cor)) END, '[]'::jsonb)
            || coalesce(CASE WHEN r.larg IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_larg, 'opcao', r.larg)) END, '[]'::jsonb)
            || coalesce(CASE WHEN r.value_json IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_med, 'medida', r.value_json)) END, '[]'::jsonb);
    v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.id);
    IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'FALHOU: passo 7 — cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 7 — só % produtos comparados.', v_n; END IF;

  -- 8. auditoria
  IF NOT EXISTS (SELECT 1 FROM entity_audit_log e WHERE e.organization_id = c_org AND e.source = 'migration:catalogo_banheiras_mudelar'
                 AND e.table_name = 'products') THEN
    RAISE EXCEPTION 'FALHOU: passo 8 — não há linhas de auditoria com a fonte migration:catalogo_banheiras_mudelar.';
  END IF;
END $t$;

SELECT 'OK: Banheiras da Mudelar (23 produtos, 4 modelos) conferidos nos passos 0 a 8.' AS resultado;

ROLLBACK;
