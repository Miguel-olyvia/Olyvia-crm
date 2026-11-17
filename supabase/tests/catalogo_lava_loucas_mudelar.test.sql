-- ============================================================
-- Testes: 20270118900000_catalogo_lava_loucas_mudelar.sql (base RH)
-- Ficheiro GERADO por script (gerar_lava.js) a partir de lava.csv, como a migration.
-- ============================================================
-- ORDEM: correr ANTES do db push da 118900000 (falha no passo 0: a subcategoria «Cubas inox» da Mudelar não tem
-- produtos); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355) e, para provar que nada foi escrito fora dela, as outras organizações (só
-- contagens pelo xmin da transação da importação). Para comparar os SKUs com cat_prever_sku_modelo usa, só nesta
-- transação, as claims de um membro ativo da Mudelar com products.edit (a função é só de leitura). Nenhuma chamada
-- recusada de propósito.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_lava_loucas_mudelar.test.sql
--
-- O que PROVA:
--   1. 32 produtos vivos nas 2 subcategorias de «Lava-louças & Cubas» (Cubas compósito 12, Cubas inox 20); 32 modelos, cada
--      um com o número e o nome do ficheiro e um só produto.
--   2. Cada um dos 32 produtos, pelo nome: o SKU exato, o modelo, nenhum atributo, custo, PVP e IVA 23, marca,
--      fornecedor preferido (preço = custo, supplier_sku = código de fornecedor ou, sem ele, o SKU), unidade un,
--      estado active, SKU gerado.
--   3. Nenhum produto na subcategoria «Cubas encastrar / pousar / embutir» (CEPE), que fica com a sua sigla.
--   4. SKUs todos únicos e no formato LLC-(CC|CI)-NNNN.
--   5. As siglas: LLC na categoria (única entre as de topo da Mudelar); CC e CI nas subcategorias.
--   6. Os 2 fornecedores existem uma vez cada na Mudelar.
--   7. Nenhuma linha de outra organização tem o xmin da transação que criou os produtos, e nenhum outro produto da
--      Mudelar foi escrito nela (os SKUs de Duche & Banho, Loiças e Acessórios não mudaram).
--   8. Todos os produtos: cat_prever_sku_modelo dá o SKU gravado, sem faltas.
--   9. A auditoria registou os produtos com a fonte migration:lava_loucas_mudelar.
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A importação foi aplicada? ───────────────────────────────────────────
DO $t0$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products p JOIN product_categories s ON s.id = p.subcategory_id
                 JOIN product_categories c ON c.id = s.parent_id
                 WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
                   AND public.fn_cat_chave_opcao(s.name) = 'cubas inox' AND public.fn_cat_chave_opcao(c.name) = 'lava-loucas & cubas') THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — a subcategoria «Cubas inox» da Mudelar não tem produtos (aplicar 20270118900000).';
  END IF;
END $t0$;

-- ─── 1 a 9 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_total constant integer := 32;
  c_n_subs constant integer := 2;
  c_iva constant numeric := 23;
  v_cat uuid; v_subs uuid[]; v_n bigint; v_m bigint; v_txt text; v_xid text; v_auth uuid; v_prev jsonb; r record;
BEGIN
  SELECT c.id INTO v_cat FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND public.fn_cat_chave_opcao(c.name) = 'lava-loucas & cubas';
  SELECT array_agg(c.id) INTO v_subs FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) IN (SELECT public.fn_cat_chave_opcao(e.nome) FROM (VALUES ('CC', 'Cubas compósito', 12), ('CI', 'Cubas inox', 20)) AS e(sigla, nome, n));
  IF v_cat IS NULL OR cardinality(v_subs) IS DISTINCT FROM c_n_subs THEN
    RAISE EXCEPTION 'FALHOU: configuração da Mudelar incompleta (categoria ou % subcategorias).', c_n_subs;
  END IF;

  -- 1. quantos, por subcategoria e por modelo
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted;
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 1 — % produtos em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(e.nome || ': ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM (VALUES ('CC', 'Cubas compósito', 12), ('CI', 'Cubas inox', 20)) AS e(sigla, nome, n)
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
                                AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(e.nome)
  LEFT JOIN (SELECT p.subcategory_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.subcategory_id) x ON x.subcategory_id = c.id
  WHERE coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — por subcategoria: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id = ANY (v_subs);
  SELECT count(*) INTO v_m FROM product_models pm
  WHERE pm.organization_id = c_org AND pm.subcategory_id = ANY (v_subs) AND pm.deleted_at IS NULL AND pm.is_active
    AND (SELECT count(*) FROM products p WHERE p.model_id = pm.id AND NOT p.is_deleted) = 1;
  IF v_n <> c_total OR v_m <> c_total THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — % modelos nas subcategorias, % ativos com um só produto (esperados %).', v_n, v_m, c_total;
  END IF;

  -- 2. cada produto, pelo nome: SKU, modelo, nenhum atributo, preços, marca, fornecedor e supplier_sku
  SELECT count(*), string_agg(e.nome, ' | ') INTO v_n, v_txt
  FROM (VALUES
    ('Lava-louças AMBAR 86 C/ESCORREDOR 1 CUBA', 'LLC-CC-0001', 'AMBAR 86 C/ESCORREDOR 1 CUBA', 209.28, 327.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'LLC-CC-0001'),
    ('Lava-louças AMBAR 100 C/ESCORREDOR 1 CUBA', 'LLC-CC-0002', 'AMBAR 100 C/ESCORREDOR 1 CUBA', 219.52, 343.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'LLC-CC-0002'),
    ('Lava-louças AMBAR 105 C/ESCORREDOR 2 CUBAS', 'LLC-CC-0003', 'AMBAR 105 C/ESCORREDOR 2 CUBAS', 216.32, 338.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'LLC-CC-0003'),
    ('Lava-louças AMBAR 116 C/ESCORREDOR 2 CUBAS', 'LLC-CC-0004', 'AMBAR 116 C/ESCORREDOR 2 CUBAS', 233.60, 365.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'LLC-CC-0004'),
    ('Lava-louças AMBAR 1 CUBA 40', 'LLC-CC-0005', 'AMBAR 1 CUBA 40', 204.80, 320.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'LLC-CC-0005'),
    ('Lava-louças AMBAR 1 CUBA 40 N', 'LLC-CC-0006', 'AMBAR 1 CUBA 40 N', 204.80, 320.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'K0000004'),
    ('Lava-louças AMBAR 1 CUBA 57', 'LLC-CC-0007', 'AMBAR 1 CUBA 57', 230.40, 360.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'LLC-CC-0007'),
    ('Lava-louças AMBAR 1.5 CUBA 55', 'LLC-CC-0008', 'AMBAR 1.5 CUBA 55', 230.40, 360.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'LLC-CC-0008'),
    ('Lava-louças AMBAR 1 CUBA 70', 'LLC-CC-0009', 'AMBAR 1 CUBA 70', 259.20, 405.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'LLC-CC-0009'),
    ('Lava-louças AMBAR 1 CUBA 80', 'LLC-CC-0010', 'AMBAR 1 CUBA 80', 259.20, 405.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'LLC-CC-0010'),
    ('Lava-louças AMBAR 1 CUBA 50', 'LLC-CC-0011', 'AMBAR 1 CUBA 50', 224.00, 350.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'LLC-CC-0011'),
    ('Lava-louças AMBAR 1 CUBA 50 N', 'LLC-CC-0012', 'AMBAR 1 CUBA 50 N', 224.00, 350.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'K0000001'),
    ('Lava-louças LODY PVD 1 CUBA 40', 'LLC-CI-0001', 'LODY PVD 1 CUBA 40', 371.84, 581.00, 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', 'LLC-CI-0001'),
    ('Lava-louças LODY PVD 1 CUBA 50', 'LLC-CI-0002', 'LODY PVD 1 CUBA 50', 377.60, 590.00, 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', 'LLC-CI-0002'),
    ('Lava-louças LODY PVD 1 CUBA 70', 'LLC-CI-0003', 'LODY PVD 1 CUBA 70', 557.44, 871.00, 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', 'LLC-CI-0003'),
    ('Lava-louças KERAN 80 C/ESCORREDOR 1 CUBA', 'LLC-CI-0004', 'KERAN 80 C/ESCORREDOR 1 CUBA', 56.32, 88.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '16F7KF1K321AO'),
    ('Lava-louças KERAN 86 C/ESCORREDOR 1 CUBA', 'LLC-CI-0005', 'KERAN 86 C/ESCORREDOR 1 CUBA', 58.24, 91.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '16F7KH1K321A0'),
    ('Lava-louças KERAN 100 C/ESCORREDOR 2 CUBAS', 'LLC-CI-0006', 'KERAN 100 C/ESCORREDOR 2 CUBAS', 75.52, 118.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '16F7KL4K321AO'),
    ('Lava-louças KERAN 116 C/ESCORREDOR 2 CUBAS', 'LLC-CI-0007', 'KERAN 116 C/ESCORREDOR 2 CUBAS', 87.04, 136.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '16F7KO2K321AO'),
    ('Lava-louças VELAR 1 CUBA 34', 'LLC-CI-0008', 'VELAR 1 CUBA 34', 95.36, 149.00, 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', 'FS200260'),
    ('Lava-louças VELAR 1 CUBA 40', 'LLC-CI-0009', 'VELAR 1 CUBA 40', 99.20, 155.00, 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', 'FS200261'),
    ('Lava-louças VELAR 1 CUBA 45', 'LLC-CI-0010', 'VELAR 1 CUBA 45', 101.12, 158.00, 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', 'FS200269'),
    ('Lava-louças VELAR 1 CUBA 50', 'LLC-CI-0011', 'VELAR 1 CUBA 50', 102.40, 160.00, 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', 'FS200262'),
    ('Lava-louças VELAR 1 CUBA 70', 'LLC-CI-0012', 'VELAR 1 CUBA 70', 176.00, 275.00, 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', 'FS200263'),
    ('Lava-louças UNA 55 - 2 CUBAS', 'LLC-CI-0013', 'UNA 55 - 2 CUBAS', 235.52, 368.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '18U8EMX0688A0'),
    ('Lava-louças UNA 75 - 2 CUBAS', 'LLC-CI-0014', 'UNA 75 - 2 CUBAS', 239.36, 374.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '18U8ETX0688A0'),
    ('Lava-louças BRASILIA 1 CUBA', 'LLC-CI-0015', 'BRASILIA 1 CUBA', 82.56, 129.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '17G7AA10021A0'),
    ('Lava-louças BAHIA 1 CUBA', 'LLC-CI-0016', 'BAHIA 1 CUBA', 84.48, 132.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '17G8AC10021AO'),
    ('Lava-louças LAGUNA 1 CUBA', 'LLC-CI-0017', 'LAGUNA 1 CUBA', 89.60, 140.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '17G8AD10021AO'),
    ('Lava-louças BELÉM 1 CUBA', 'LLC-CI-0018', 'BELÉM 1 CUBA', 94.08, 147.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '17G8AG10021A0'),
    ('Lava-louças DUO 60 - 2 CUBAS', 'LLC-CI-0019', 'DUO 60 - 2 CUBAS', 128.00, 200.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'K0000570'),
    ('Lava-louças DUO 80 - 2 CUBAS', 'LLC-CI-0020', 'DUO 80 - 2 CUBAS', 142.08, 222.00, 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '17G1FJ20021AO')) AS e(nome, sku, modelo, custo, pvp, marca, fornecedor, supplier_sku)
  LEFT JOIN products p ON p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted AND p.name = e.nome
  WHERE NOT coalesce(
        p.sku = e.sku AND p.sku_gerado AND p.category_id = v_cat AND p.status = 'active' AND p.tipo_catalogo = 'produto'
        AND p.is_active AND p.manages_stock AND p.unidade = 'un' AND p.uom_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM product_models pm WHERE pm.id = p.model_id AND pm.subcategory_id = p.subcategory_id
                    AND pm.name = e.modelo AND lpad(pm.numero::text, 4, '0') = right(e.sku, 4))
        AND p.marca_livre = e.marca
        AND EXISTS (SELECT 1 FROM brands b WHERE b.id = p.brand_id AND b.organization_id = c_org AND b.name = e.marca)
        AND p.fornecedor_livre = e.fornecedor
        AND EXISTS (SELECT 1 FROM suppliers s WHERE s.id = p.supplier_id AND s.organization_id = c_org AND s.name = e.fornecedor)
        AND NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id)
        -- 2 preços: custo e PVP do ficheiro
        AND (SELECT count(*) FROM product_prices x WHERE x.product_id = p.id) = 2
        AND EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = p.id AND x.price_type = 'purchase'
                    AND x.price = round(e.custo, 2) AND x.preco_exato = round(e.custo, 6) AND x.vat_rate = c_iva AND x.currency = 'EUR')
        AND EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = p.id AND x.price_type = 'retail'
                    AND x.price = round(e.pvp, 2) AND x.vat_rate = c_iva AND x.currency = 'EUR')
        -- um fornecedor, o preferido, preço = custo, supplier_sku = o do ficheiro (ou o SKU)
        AND (SELECT count(*) FROM item_suppliers i WHERE i.product_id = p.id AND i.deleted_at IS NULL) = 1
        AND EXISTS (SELECT 1 FROM item_suppliers i WHERE i.product_id = p.id AND i.deleted_at IS NULL AND i.supplier_id = p.supplier_id
                    AND i.is_preferred AND i.is_active AND i.organization_id = c_org AND i.supplier_sku = e.supplier_sku
                    AND i.purchase_price = round(e.custo, 2)),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2 — % produtos diferentes da linha do ficheiro: %', v_n, left(v_txt, 1500); END IF;

  -- 3. CEPE não recebeu produtos e manteve a sigla
  SELECT count(*) INTO v_n FROM products p JOIN product_categories c ON c.id = p.subcategory_id
  WHERE p.organization_id = c_org AND c.parent_id = v_cat AND NOT (c.id = ANY (v_subs));
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 3 — % produtos noutras subcategorias de Lava-louças.', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM product_categories c WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
                 AND public.fn_cat_chave_opcao(c.name) = 'cubas encastrar / pousar / embutir' AND c.sigla = 'CEPE') THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — «Cubas encastrar / pousar / embutir» já não tem a sigla CEPE.';
  END IF;

  -- 4. SKUs únicos e no formato
  SELECT count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ '^LLC-(CC|CI)-[0-9]{4}$' OR NOT p.sku_gerado)
    INTO v_n, v_m
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted;
  IF v_n <> c_total OR v_m > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — % SKUs distintos (esperados %), % fora do formato ou não gerados.', v_n, c_total, v_m;
  END IF;

  -- 5. siglas: categoria (e única entre as de topo), subcategorias
  IF (SELECT c.sigla FROM product_categories c WHERE c.id = v_cat) IS DISTINCT FROM 'LLC' THEN
    RAISE EXCEPTION 'FALHOU: passo 5 — a sigla de Lava-louças & Cubas não é LLC.';
  END IF;
  SELECT count(*) INTO v_n FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND c.sigla = 'LLC';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHOU: passo 5 — % categorias de topo da Mudelar com a sigla LLC.', v_n; END IF;
  SELECT string_agg(e.nome || ': ' || coalesce(c.sigla, 'sem subcategoria') || ' em vez de ' || e.sigla, '; ') INTO v_txt
  FROM (VALUES ('CC', 'Cubas compósito', 12), ('CI', 'Cubas inox', 20)) AS e(sigla, nome, n)
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
                                AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(e.nome)
  WHERE c.sigla IS DISTINCT FROM e.sigla;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — siglas das subcategorias: %', v_txt; END IF;

  -- 6. os 2 fornecedores, uma vez cada
  SELECT string_agg(e.nome || ' ×' || (SELECT count(*) FROM suppliers s WHERE s.organization_id = c_org AND s.deleted_at IS NULL
                                        AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.nome)), '; ') INTO v_txt
  FROM (VALUES ('ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'), ('BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.')) AS e(nome)
  WHERE (SELECT count(*) FROM suppliers s WHERE s.organization_id = c_org AND s.deleted_at IS NULL
         AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.nome)) <> 1;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 6 — fornecedores: %', v_txt; END IF;

  -- 7. nada escrito fora da Mudelar, nem outros produtos da Mudelar
  SELECT mode() WITHIN GROUP (ORDER BY p.xmin::text) INTO v_xid FROM products p
  WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted;
  SELECT string_agg(x.t || ' ' || x.n, ', ') INTO v_txt FROM (
    SELECT 'products' AS t, count(*) AS n FROM products p WHERE p.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_prices', count(*) FROM product_prices x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_organizations', count(*) FROM product_organizations x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'item_suppliers', count(*) FROM item_suppliers x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'suppliers', count(*) FROM suppliers x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_models', count(*) FROM product_models x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 7 — linhas de outras organizações escritas pela importação: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.xmin::text = v_xid AND NOT (p.subcategory_id = ANY (v_subs));
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 7 — % outros produtos da Mudelar escritos pela importação.', v_n; END IF;
  -- a regra de SKU continua a dar o mesmo nos produtos de Duche & Banho, Loiças e Acessórios (amostra de 3 por categoria)
  SELECT count(*), string_agg(x.sku || ' ≠ ' || coalesce(x.prev, 'null'), '; ') INTO v_n, v_txt
  FROM (SELECT p.sku, p.id, row_number() OVER (PARTITION BY c.id ORDER BY p.sku, p.id) AS k,
               concat_ws('-', pt ->> 'prefixo', lpad(public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id)::text, 4, '0'), pt ->> 'resto') AS prev
        FROM products p JOIN product_categories c ON c.id = p.category_id
        CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, p.category_id, p.subcategory_id, (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'atributo', v.attribute_id, 'sigla', o.sigla,
                     'medida', (CASE WHEN a.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END))), '[]'::jsonb)
            FROM product_attribute_values v
            JOIN product_attributes a ON a.id = v.attribute_id AND a.organization_id = c_org AND a.deleted_at IS NULL
            LEFT JOIN attribute_option_group_values o
              ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(a.id, c_org) AND o.value_text = v.value_text
            WHERE v.product_id = p.id)) AS pt) z
        WHERE p.organization_id = c_org AND NOT p.is_deleted AND c.parent_id IS NULL AND c.sigla IN ('DB', 'LS', 'ACB')) x
  WHERE x.k <= 3 AND x.prev IS DISTINCT FROM x.sku;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 7 — % SKUs da amostra de outras categorias já não batem com a regra: %', v_n, v_txt; END IF;

  -- 8. todos: cat_prever_sku_modelo (só leitura) como um membro da Mudelar com products.edit
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 8 — sem membro ativo da Mudelar com products.edit.'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  v_n := 0;
  FOR r IN SELECT p.id, p.sku, p.category_id, p.subcategory_id, p.model_id
           FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted ORDER BY p.sku LOOP
    v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, '[]'::jsonb, r.id);
    IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'FALHOU: passo 8 — cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 8 — só % produtos comparados.', v_n; END IF;

  -- 9. a auditoria registou a criação dos produtos, com a fonte da importação
  SELECT count(DISTINCT e.record_id) INTO v_n FROM entity_audit_log e
  WHERE e.organization_id = c_org AND e.source = 'migration:lava_loucas_mudelar' AND e.table_name = 'products'
    AND e.operation = 'INSERT'
    AND e.record_id IN (SELECT p.id FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs));
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 9 — a auditoria tem % dos % produtos com a fonte da importação.', v_n, c_total; END IF;
END $t$;

SELECT 'OK: lava-louças & cubas da Mudelar (32 produtos, 32 modelos, SKU LLC-SUB-NNNN) conferidos nos passos 0 a 9.' AS resultado;

ROLLBACK;
