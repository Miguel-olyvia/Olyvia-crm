-- ============================================================
-- Testes: 20270118400000_catalogo_bases_duche_mudelar.sql (base RH)
-- Ficheiro GERADO por script (gerar_bases_duche.js) a partir do Excel bases.xlsx, como a migration.
-- ============================================================
-- ORDEM: correr ANTES do db push da 118400000 (falha no passo 0: a subcategoria «Bases Duche» da Mudelar não tem
-- produtos, ou ainda não há product_models); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355) e, para provar que nada foi escrito fora dela, as outras organizações (só
-- contagens pelo xmin da transação da importação). Para comparar 20 SKUs com cat_prever_sku_modelo usa, só nesta
-- transação, as claims de um membro ativo da Mudelar com products.edit (a função é só de leitura). Nenhuma chamada
-- recusada de propósito.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_bases_duche_mudelar.test.sql
--
-- O que PROVA:
--   1. 14328 produtos vivos na subcategoria; por modelo SORTY 1386, STONE PLUS 2988, CACH 1512, MIO 1386, SIDE 2772, SMART 1512, ZEUS 2772; 7 modelos com os números 1..7.
--   2. Cada modelo com as 18 cores e as texturas do Excel; cada produto com Cor, Textura e Medida (2D, cm) e só essas.
--   3. O preço depende só da medida: custo e PVP de cada produto = os da sua medida no Excel (89 medidas), IVA 23.
--   4. 5 SKUs exatos (ex.: SORTY Blanco 70X70 PIZARRA → DB-BD-0001-BL-PZ-70X70) e todos únicos e no formato.
--   5. As siglas das 18 cores e 3 texturas são os códigos do Excel.
--   6. Fornecedor «DUPLACH Group, SAU» ligado a cada produto (preferido, preço = custo, supplier_sku = SKU), marca
--      Duplach, unidade un, estado active, SKU gerado.
--   7. Nenhuma linha de outra organização tem o xmin da transação que criou os produtos (nada escrito fora da Mudelar).
--   8. 20 produtos ao acaso: cat_prever_sku_modelo dá o SKU gravado, sem faltas.
--   9. A linha consolidada da auditoria (source migration:bases_duche_mudelar).
-- O que NÃO cobre: o ecrã; as escritas por produto que a auditoria deixou de registar (bypass, de propósito).
-- ============================================================

BEGIN;

-- ─── 0. A importação foi aplicada? ───────────────────────────────────────────
DO $t0$
BEGIN
  IF to_regclass('public.product_models') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — não há product_models (aplicar 20270118300000 e 20270118400000).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM products p JOIN product_categories s ON s.id = p.subcategory_id
                 WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
                   AND public.fn_cat_chave_opcao(s.name) = 'bases duche') THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — a subcategoria «Bases Duche» da Mudelar não tem produtos (aplicar 20270118400000).';
  END IF;
END $t0$;

-- ─── 1 a 9 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_total constant integer := 14328;
  c_iva constant numeric := 23;
  v_cat uuid; v_sub uuid; v_a_cor uuid; v_a_tex uuid; v_a_med uuid; v_g_cor uuid; v_g_tex uuid; v_sup uuid; v_marca uuid;
  v_n bigint; v_m bigint; v_txt text; v_xid text; v_auth uuid; v_prev jsonb; r record;
BEGIN
  SELECT c.id INTO v_cat FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND public.fn_cat_chave_opcao(c.name) = 'duche & banho';
  SELECT c.id INTO v_sub FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL AND public.fn_cat_chave_opcao(c.name) = 'bases duche';
  SELECT a.id INTO v_a_cor FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'cor';
  SELECT a.id INTO v_a_tex FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'textura';
  SELECT a.id INTO v_a_med FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'medida';
  v_g_cor := public.fn_cat_grupo_do_atributo(v_a_cor, c_org);
  v_g_tex := public.fn_cat_grupo_do_atributo(v_a_tex, c_org);
  IF v_sub IS NULL OR v_a_cor IS NULL OR v_a_tex IS NULL OR v_a_med IS NULL THEN
    RAISE EXCEPTION 'FALHOU: configuração da Mudelar incompleta (subcategoria ou atributos).';
  END IF;

  -- 1. quantos, por modelo, e os modelos
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = v_sub AND NOT p.is_deleted;
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 1 — % produtos em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(e.nome || ': ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM (VALUES (1, 'SORTY', 1386, 'PZ'), (2, 'STONE PLUS', 2988, 'LS,PZ'), (3, 'CACH', 1512, 'LS,PZ'), (4, 'MIO', 1386, 'LS'), (5, 'SIDE', 2772, 'LS,PZ'), (6, 'SMART', 1512, 'LS,PZ'), (7, 'ZEUS', 2772, 'PD,PZ')) AS e(numero, nome, n, texturas)
  LEFT JOIN product_models pm ON pm.organization_id = c_org AND pm.subcategory_id = v_sub AND pm.deleted_at IS NULL
                             AND pm.numero = e.numero AND pm.name = e.nome AND pm.is_active
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p
             WHERE p.organization_id = c_org AND p.subcategory_id = v_sub AND NOT p.is_deleted GROUP BY p.model_id) x ON x.model_id = pm.id
  WHERE coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — por modelo: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id = v_sub AND pm.deleted_at IS NULL;
  IF v_n <> 7 THEN RAISE EXCEPTION 'FALHOU: passo 1 — % modelos na subcategoria em vez de 7.', v_n; END IF;

  -- 2. 18 cores e as texturas por modelo; cada produto com Cor, Textura e Medida e só essas
  SELECT string_agg(e.nome || ' (' || coalesce(x.cores, 0) || ' cores, texturas ' || coalesce(x.tex, '-') || ')', '; ') INTO v_txt
  FROM (VALUES (1, 'SORTY', 1386, 'PZ'), (2, 'STONE PLUS', 2988, 'LS,PZ'), (3, 'CACH', 1512, 'LS,PZ'), (4, 'MIO', 1386, 'LS'), (5, 'SIDE', 2772, 'LS,PZ'), (6, 'SMART', 1512, 'LS,PZ'), (7, 'ZEUS', 2772, 'PD,PZ')) AS e(numero, nome, n, texturas)
  JOIN product_models pm ON pm.organization_id = c_org AND pm.subcategory_id = v_sub AND pm.deleted_at IS NULL AND pm.numero = e.numero
  LEFT JOIN (SELECT p.model_id, count(DISTINCT vc.value_text) AS cores,
                    string_agg(DISTINCT o.sigla, ',' ORDER BY o.sigla) AS tex
             FROM products p
             JOIN product_attribute_values vc ON vc.product_id = p.id AND vc.attribute_id = v_a_cor
             JOIN product_attribute_values vt ON vt.product_id = p.id AND vt.attribute_id = v_a_tex
             JOIN attribute_option_group_values o ON o.group_id = v_g_tex AND o.value_text = vt.value_text
             WHERE p.organization_id = c_org AND p.subcategory_id = v_sub AND NOT p.is_deleted GROUP BY p.model_id) x ON x.model_id = pm.id
  WHERE coalesce(x.cores, 0) <> 18 OR x.tex IS DISTINCT FROM e.texturas;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 2 — cores/texturas por modelo: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.subcategory_id = v_sub AND NOT p.is_deleted
    AND NOT ((SELECT count(*) FROM product_attribute_values v WHERE v.product_id = p.id) = 3
             AND EXISTS (SELECT 1 FROM product_attribute_values v JOIN attribute_option_group_values o ON o.group_id = v_g_cor AND o.value_text = v.value_text
                         WHERE v.product_id = p.id AND v.attribute_id = v_a_cor)
             AND EXISTS (SELECT 1 FROM product_attribute_values v JOIN attribute_option_group_values o ON o.group_id = v_g_tex AND o.value_text = v.value_text
                         WHERE v.product_id = p.id AND v.attribute_id = v_a_tex)
             AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id = v_a_med
                         AND v.unit = 'cm' AND v.value_json ->> 'tipo' = '2D' AND v.value_json ->> 'unidade' = 'cm'
                         AND public.fn_cat_medida_ler(v.value_json, v.unit) IS NOT NULL
                         AND v.value_text = public.fn_cat_num_texto((v.value_json ->> 'largura')::numeric) || ' × '
                                            || public.fn_cat_num_texto((v.value_json ->> 'comprimento')::numeric) || ' cm'));
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2 — % produtos sem Cor, Textura e Medida certas (ou com outros atributos).', v_n; END IF;

  -- 3. preço por medida (custo e PVP do Excel), IVA
  WITH med(largura, comprimento, custo, pvp) AS (VALUES
    (70, 70, 95.15, 173.00),
    (70, 80, 97.90, 178.00),
    (70, 90, 104.50, 190.00),
    (70, 100, 112.75, 205.00),
    (70, 110, 119.90, 218.00),
    (70, 120, 126.50, 230.00),
    (70, 130, 137.50, 250.00),
    (70, 140, 143.55, 261.00),
    (70, 150, 152.90, 278.00),
    (70, 160, 166.10, 302.00),
    (70, 170, 178.20, 324.00),
    (70, 180, 182.05, 331.00),
    (70, 190, 196.35, 357.00),
    (70, 200, 201.85, 367.00),
    (70, 210, 207.90, 378.00),
    (75, 100, 116.60, 212.00),
    (75, 110, 125.95, 229.00),
    (75, 120, 132.00, 240.00),
    (75, 130, 143.55, 261.00),
    (75, 140, 149.05, 271.00),
    (75, 150, 159.50, 290.00),
    (75, 160, 174.90, 318.00),
    (75, 170, 186.45, 339.00),
    (75, 180, 190.85, 347.00),
    (75, 190, 207.90, 378.00),
    (75, 200, 213.40, 388.00),
    (75, 210, 219.45, 399.00),
    (80, 80, 103.95, 189.00),
    (80, 90, 114.95, 209.00),
    (80, 100, 120.45, 219.00),
    (80, 110, 132.00, 240.00),
    (80, 120, 138.05, 251.00),
    (80, 130, 150.15, 273.00),
    (80, 140, 155.10, 282.00),
    (80, 150, 166.65, 303.00),
    (80, 160, 184.25, 335.00),
    (80, 170, 194.70, 354.00),
    (80, 180, 199.65, 363.00),
    (80, 190, 219.45, 399.00),
    (80, 200, 224.95, 409.00),
    (80, 210, 230.45, 419.00),
    (85, 100, 128.15, 233.00),
    (85, 110, 139.70, 254.00),
    (85, 120, 146.30, 266.00),
    (85, 130, 160.05, 291.00),
    (85, 140, 165.55, 301.00),
    (85, 150, 177.10, 322.00),
    (85, 160, 194.70, 354.00),
    (85, 170, 203.50, 370.00),
    (85, 180, 210.65, 383.00),
    (85, 190, 229.35, 417.00),
    (85, 200, 236.50, 430.00),
    (85, 210, 244.75, 445.00),
    (90, 90, 127.05, 231.00),
    (90, 100, 135.85, 247.00),
    (90, 110, 147.40, 268.00),
    (90, 120, 155.10, 282.00),
    (90, 130, 170.50, 310.00),
    (90, 140, 176.55, 321.00),
    (90, 150, 187.55, 341.00),
    (90, 160, 205.15, 373.00),
    (90, 170, 212.30, 386.00),
    (90, 180, 222.20, 404.00),
    (90, 190, 239.80, 436.00),
    (90, 200, 248.05, 451.00),
    (90, 210, 259.60, 472.00),
    (95, 110, 158.40, 288.00),
    (95, 120, 163.90, 298.00),
    (95, 130, 176.00, 320.00),
    (95, 140, 184.80, 336.00),
    (95, 150, 194.70, 354.00),
    (95, 160, 212.30, 386.00),
    (95, 170, 221.10, 402.00),
    (95, 180, 231.00, 420.00),
    (95, 190, 249.70, 454.00),
    (95, 200, 257.95, 469.00),
    (95, 210, 271.15, 493.00),
    (100, 100, 162.80, 296.00),
    (100, 110, 169.95, 309.00),
    (100, 120, 173.25, 315.00),
    (100, 130, 182.05, 331.00),
    (100, 140, 192.50, 350.00),
    (100, 150, 201.85, 367.00),
    (100, 160, 219.45, 399.00),
    (100, 170, 230.45, 419.00),
    (100, 180, 239.80, 436.00),
    (100, 190, 259.60, 472.00),
    (100, 200, 268.40, 488.00),
    (100, 210, 282.70, 514.00)),
  prod AS (SELECT p.id, (vm.value_json ->> 'largura')::numeric AS l, (vm.value_json ->> 'comprimento')::numeric AS c
           FROM products p JOIN product_attribute_values vm ON vm.product_id = p.id AND vm.attribute_id = v_a_med
           WHERE p.organization_id = c_org AND p.subcategory_id = v_sub AND NOT p.is_deleted)
  SELECT count(*) FILTER (WHERE m.largura IS NULL
                             OR (SELECT count(*) FROM product_prices x WHERE x.product_id = pr.id) <> 2
                             OR NOT EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = pr.id AND x.price_type = 'purchase'
                                            AND x.price = round(m.custo, 2) AND x.preco_exato = round(m.custo, 6) AND x.vat_rate = c_iva AND x.currency = 'EUR')
                             OR NOT EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = pr.id AND x.price_type = 'retail'
                                            AND x.price = round(m.pvp, 2) AND x.vat_rate = c_iva AND x.currency = 'EUR')),
         (SELECT count(*) FROM med m2 WHERE NOT EXISTS (SELECT 1 FROM prod p2 WHERE p2.l = m2.largura AND p2.c = m2.comprimento))
    INTO v_n, v_m
  FROM prod pr LEFT JOIN med m ON m.largura = pr.l AND m.comprimento = pr.c;
  IF v_n > 0 OR v_m > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — % produtos com preço diferente do da sua medida; % medidas do Excel sem produto.', v_n, v_m;
  END IF;

  -- 4. SKUs exatos, únicos e no formato
  SELECT string_agg(e.nome || ': ' || coalesce(p.sku, 'sem produto') || ' em vez de ' || e.sku, '; ') INTO v_txt
  FROM (VALUES ('Base de Duche SORTY Blanco 70X70 PIZARRA', 'DB-BD-0001-BL-PZ-70X70'), ('Base de Duche PLUS Gris 7035 70X70 LISO', 'DB-BD-0002-GR7-LS-70X70'), ('Base de Duche ZEUS Oliva 70X70 PIEDRA', 'DB-BD-0007-OL-PD-70X70'), ('Base de Duche SMART Gris Medio 70X70 PIZARRA', 'DB-BD-0006-GM-PZ-70X70'), ('Base de Duche CACH Beige 70X70 LISO', 'DB-BD-0003-BG-LS-70X70')) AS e(nome, sku)
  LEFT JOIN products p ON p.organization_id = c_org AND p.subcategory_id = v_sub AND NOT p.is_deleted AND p.name = e.nome
  WHERE p.sku IS DISTINCT FROM e.sku;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 4 — SKUs: %', v_txt; END IF;
  SELECT count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ '^DB-BD-000[1-7]-[A-Z0-9]+-[A-Z0-9]+-[0-9]+X[0-9]+$' OR NOT p.sku_gerado)
    INTO v_n, v_m
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = v_sub AND NOT p.is_deleted;
  IF v_n <> c_total OR v_m > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — % SKUs distintos (esperados %), % fora do formato DB-BD-NNNN-COR-TEX-LXC ou não gerados.', v_n, c_total, v_m;
  END IF;

  -- 5. as siglas das 18 cores e 3 texturas
  SELECT string_agg(e.papel || ' ' || e.nome || ': ' || coalesce(o.sigla, 'sem opção') || ' em vez de ' || e.codigo, '; ') INTO v_txt
  FROM (VALUES ('cor', 'Blanco', 'BL'), ('cor', 'Gris 7035', 'GR7'), ('cor', 'Gris', 'GR'), ('cor', 'Gris Medio', 'GM'), ('cor', 'Antracita', 'AN'), ('cor', 'Negro', 'NG'), ('cor', 'Crema', 'CR'), ('cor', 'BEIG', 'BG'), ('cor', 'Arena', 'AR'), ('cor', 'Moka', 'MK'), ('cor', 'Topo', 'TP'), ('cor', 'Chocolate', 'CH'), ('cor', 'Terracota', 'TC'), ('cor', 'Coral', 'CL'), ('cor', 'Rosa', 'RS'), ('cor', 'Turquesa', 'TQ'), ('cor', 'Oceano', 'OC'), ('cor', 'Oliva', 'OL'), ('textura', 'PIZARRA', 'PZ'), ('textura', 'LISO', 'LS'), ('textura', 'PIEDRA', 'PD')) AS e(papel, nome, codigo)
  LEFT JOIN attribute_option_group_values o
    ON o.group_id = (CASE WHEN e.papel = 'cor' THEN v_g_cor ELSE v_g_tex END)
   AND public.fn_cat_chave_opcao(o.value_text::text) = public.fn_cat_chave_opcao(e.nome)
  WHERE o.sigla IS DISTINCT FROM e.codigo;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — siglas: %', v_txt; END IF;

  -- 6. fornecedor, marca, unidade, estado
  SELECT count(*), (array_agg(s.id))[1] INTO v_n, v_sup FROM suppliers s
  WHERE s.organization_id = c_org AND s.deleted_at IS NULL AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao('DUPLACH Group, SAU');
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHOU: passo 6 — % fornecedores «DUPLACH Group, SAU» na Mudelar (esperado 1).', v_n; END IF;
  SELECT b.id INTO v_marca FROM brands b WHERE b.organization_id = c_org AND b.deleted_at IS NULL AND b.name = 'Duplach';
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.subcategory_id = v_sub AND NOT p.is_deleted
    AND NOT coalesce(p.supplier_id = v_sup AND p.fornecedor_livre = 'DUPLACH Group, SAU' AND p.brand_id = v_marca AND p.marca_livre = 'Duplach'
                     AND p.unidade = 'un' AND p.uom_id IS NOT NULL AND p.status = 'active' AND p.tipo_catalogo = 'produto' AND p.category_id = v_cat
                     AND p.manages_stock AND p.is_active
                     AND (SELECT count(*) FROM item_suppliers i WHERE i.product_id = p.id AND i.deleted_at IS NULL) = 1
                     AND EXISTS (SELECT 1 FROM item_suppliers i JOIN product_prices x ON x.product_id = p.id AND x.price_type = 'purchase'
                                 WHERE i.product_id = p.id AND i.deleted_at IS NULL AND i.supplier_id = v_sup AND i.is_preferred AND i.is_active
                                   AND i.organization_id = c_org AND i.supplier_sku = p.sku AND i.purchase_price = x.price),
                     false);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 6 — % produtos sem o fornecedor, a marca, a unidade ou o estado certos.', v_n; END IF;

  -- 7. nada escrito fora da Mudelar: as linhas de outras organizações não têm o xmin da transação da importação
  SELECT mode() WITHIN GROUP (ORDER BY p.xmin::text) INTO v_xid FROM products p
  WHERE p.organization_id = c_org AND p.subcategory_id = v_sub AND NOT p.is_deleted;
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
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 7 — linhas de outras organizações escritas pela importação: %', v_txt; END IF;
  -- e nenhum produto de outra organização aponta para os modelos, a subcategoria ou o fornecedor da Mudelar
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id IS DISTINCT FROM c_org
    AND (p.subcategory_id = v_sub OR p.supplier_id = v_sup
         OR p.model_id IN (SELECT pm.id FROM product_models pm WHERE pm.organization_id = c_org));
  SELECT count(*) INTO v_m FROM item_suppliers i WHERE i.supplier_id = v_sup AND i.organization_id IS DISTINCT FROM c_org;
  IF v_n > 0 OR v_m > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 7 — % produtos e % ligações de outras organizações apontam para dados da Mudelar.', v_n, v_m;
  END IF;

  -- 8. 20 ao acaso: cat_prever_sku_modelo (só leitura) como um membro da Mudelar com products.edit
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 8 — sem membro ativo da Mudelar com products.edit.'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  v_n := 0;
  FOR r IN SELECT p.id, p.sku, p.category_id, p.subcategory_id, p.model_id, oc.id AS cor, ot.id AS tex, vm.value_json
           FROM products p
           JOIN product_attribute_values vc ON vc.product_id = p.id AND vc.attribute_id = v_a_cor
           JOIN attribute_option_group_values oc ON oc.group_id = v_g_cor AND oc.value_text = vc.value_text
           JOIN product_attribute_values vt ON vt.product_id = p.id AND vt.attribute_id = v_a_tex
           JOIN attribute_option_group_values ot ON ot.group_id = v_g_tex AND ot.value_text = vt.value_text
           JOIN product_attribute_values vm ON vm.product_id = p.id AND vm.attribute_id = v_a_med
           WHERE p.organization_id = c_org AND p.subcategory_id = v_sub AND NOT p.is_deleted
           ORDER BY random() LIMIT 20 LOOP
    v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id,
                jsonb_build_array(jsonb_build_object('atributo', v_a_cor, 'opcao', r.cor),
                                  jsonb_build_object('atributo', v_a_tex, 'opcao', r.tex),
                                  jsonb_build_object('atributo', v_a_med, 'medida', r.value_json)), r.id);
    IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'FALHOU: passo 8 — cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_n <> 20 THEN RAISE EXCEPTION 'FALHOU: passo 8 — só % produtos comparados.', v_n; END IF;

  -- 9. a linha consolidada da auditoria
  IF NOT EXISTS (SELECT 1 FROM entity_audit_log e WHERE e.organization_id = c_org AND e.source = 'migration:bases_duche_mudelar'
                 AND e.table_name = 'products' AND e.entity_id = v_sub AND (e.changed_fields ->> 'produtos')::integer = c_total) THEN
    RAISE EXCEPTION 'FALHOU: passo 9 — falta a linha consolidada da auditoria da importação.';
  END IF;
END $t$;

SELECT 'OK: bases de duche da Mudelar (14328 produtos, 7 modelos) conferidas nos passos 0 a 9.' AS resultado;

ROLLBACK;
