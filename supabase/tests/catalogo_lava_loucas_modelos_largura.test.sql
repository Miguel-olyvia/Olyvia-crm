-- ============================================================
-- Testes: 20270119000000_catalogo_lava_loucas_modelos_largura.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 119000000 (falha no passo 0: as 2 subcategorias de Lava-louças da Mudelar têm 32
-- modelos vivos em vez de 10); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355) e, para provar que nada foi escrito fora dela, as outras organizações (só
-- contagens pelo xmin da transação da migration, o do atributo Largura). Para comparar os SKUs com
-- cat_prever_sku_modelo usa, só nesta transação, as claims de um membro ativo da Mudelar com products.edit (a função é
-- só de leitura). Nenhuma chamada recusada de propósito.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_lava_loucas_modelos_largura.test.sql
--
-- O que PROVA:
--   1. 10 modelos vivos nas 2 subcategorias (AMBAR 0001; LODY PVD 0001, KERAN 0004, VELAR 0008, UNA 0013, BRASILIA 0015,
--      BAHIA 0016, LAGUNA 0017, BELÉM 0018, DUO 0019), ativos; os outros 22 apagados e não removidos (32 linhas).
--   2. Cada um dos 32 produtos, pelo nome de sempre: o modelo novo, a largura (ou nenhuma), a cor (NEGRO só nos 2 «N»),
--      nenhum outro atributo, o SKU novo gerado.
--   2b. A ligação ao fornecedor: o código de fornecedor real, ou (os 13 sem ele) o SKU NOVO; nenhuma com o SKU antigo.
--   3. 30 produtos com Largura e 2 com Cor; nenhum produto fora dos 32 com Largura.
--   4. O atributo Largura: lista, entra no SKU, o último da ordem; 15 opções ativas com sigla = número.
--   5. SKUs únicos na Mudelar e no formato; nenhum provisório.
--   6. Todos: o SKU recalculado pela regra e o de cat_prever_sku_modelo são o gravado.
--   7. Nada escrito fora da Mudelar, nem noutros produtos, modelos ou atributos dela, nem em preços; nas ligações a
--      fornecedor só as 13 que passaram ao SKU novo.
--   8. A auditoria registou as alterações dos produtos e dos modelos com a fonte da migration.
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A migration foi aplicada? ────────────────────────────────────────────
DO $t0$
DECLARE v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM product_models pm JOIN product_categories s ON s.id = pm.subcategory_id
  JOIN product_categories c ON c.id = s.parent_id
  WHERE pm.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND pm.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) = 'lava-loucas & cubas'
    AND public.fn_cat_chave_opcao(s.name) IN ('cubas composito', 'cubas inox');
  IF v_n <> 10 THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — as subcategorias de Lava-louças da Mudelar têm % modelos vivos em vez de 10 (aplicar 20270119000000).', v_n;
  END IF;
END $t0$;

-- ─── 1 a 8 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_total constant integer := 32;
  v_cat uuid; v_subs uuid[]; v_a_larg uuid; v_a_cor uuid; v_g_larg uuid;
  v_n bigint; v_m bigint; v_k bigint; v_txt text; v_xid text; v_auth uuid; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  SELECT c.id INTO v_cat FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND public.fn_cat_chave_opcao(c.name) = 'lava-loucas & cubas';
  SELECT array_agg(c.id) INTO v_subs FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) IN ('cubas composito', 'cubas inox');
  SELECT a.id INTO v_a_larg FROM product_attributes a
  WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND public.fn_cat_chave_opcao(a.label) = 'largura';
  SELECT a.id INTO v_a_cor FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'cor';
  IF v_cat IS NULL OR cardinality(v_subs) IS DISTINCT FROM 2 OR v_a_larg IS NULL OR v_a_cor IS NULL THEN
    RAISE EXCEPTION 'FALHOU: configuração da Mudelar incompleta (categoria, 2 subcategorias, Largura, Cor).';
  END IF;
  v_g_larg := public.fn_cat_grupo_do_atributo(v_a_larg, c_org);

  -- 1. modelos: os 10 vivos e ativos, com nome e número; 22 apagados; 32 linhas
  SELECT count(*), string_agg(e.sub || ' ' || e.nome, ', ') INTO v_n, v_txt
  FROM (VALUES ('Cubas compósito', 'CC', 'AMBAR', 1), ('Cubas inox', 'CI', 'LODY PVD', 1), ('Cubas inox', 'CI', 'KERAN', 4),
               ('Cubas inox', 'CI', 'VELAR', 8), ('Cubas inox', 'CI', 'UNA', 13), ('Cubas inox', 'CI', 'BRASILIA', 15),
               ('Cubas inox', 'CI', 'BAHIA', 16), ('Cubas inox', 'CI', 'LAGUNA', 17), ('Cubas inox', 'CI', 'BELÉM', 18),
               ('Cubas inox', 'CI', 'DUO', 19)) AS e(sub_nome, sub, nome, numero)
  WHERE (SELECT count(*) FROM product_models pm JOIN product_categories s ON s.id = pm.subcategory_id
         WHERE pm.organization_id = c_org AND s.parent_id = v_cat AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.sub_nome)
           AND s.sigla = e.sub AND pm.deleted_at IS NULL AND pm.is_active AND pm.name = e.nome AND pm.numero = e.numero) <> 1;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 1 — modelos em falta ou errados: %', v_txt; END IF;
  SELECT count(*) FILTER (WHERE pm.deleted_at IS NULL), count(*) FILTER (WHERE pm.deleted_at IS NOT NULL), count(*)
    INTO v_n, v_m, v_k
  FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id = ANY (v_subs);
  IF v_n <> 10 OR v_m <> 22 OR v_k <> 32 THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — % modelos vivos, % apagados, % no total (esperados 10, 22, 32).', v_n, v_m, v_k;
  END IF;

  -- 2. cada produto: modelo, largura, cor, nada mais, SKU (SKU antigo do Excel → novo)
  SELECT count(*), string_agg(e.antigo || ' ' || e.nome, ' | ') INTO v_n, v_txt
  FROM (VALUES
    ('LLCCC0001', 'Lava-louças AMBAR 86 C/ESCORREDOR 1 CUBA', 'AMBAR', '86', NULL, 'LLC-CC-0001-86'),
    ('LLCCC0002', 'Lava-louças AMBAR 100 C/ESCORREDOR 1 CUBA', 'AMBAR', '100', NULL, 'LLC-CC-0001-100'),
    ('LLCCC0003', 'Lava-louças AMBAR 105 C/ESCORREDOR 2 CUBAS', 'AMBAR', '105', NULL, 'LLC-CC-0001-105'),
    ('LLCCC0004', 'Lava-louças AMBAR 116 C/ESCORREDOR 2 CUBAS', 'AMBAR', '116', NULL, 'LLC-CC-0001-116'),
    ('LLCCC0005', 'Lava-louças AMBAR 1 CUBA 40', 'AMBAR', '40', NULL, 'LLC-CC-0001-40'),
    ('LLCCC0006', 'Lava-louças AMBAR 1 CUBA 40 N', 'AMBAR', '40', 'NEGRO', 'LLC-CC-0001-NG-40'),
    ('LLCCC0007', 'Lava-louças AMBAR 1 CUBA 57', 'AMBAR', '57', NULL, 'LLC-CC-0001-57'),
    ('LLCCC0008', 'Lava-louças AMBAR 1.5 CUBA 55', 'AMBAR', '55', NULL, 'LLC-CC-0001-55'),
    ('LLCCC0009', 'Lava-louças AMBAR 1 CUBA 70', 'AMBAR', '70', NULL, 'LLC-CC-0001-70'),
    ('LLCCC0010', 'Lava-louças AMBAR 1 CUBA 80', 'AMBAR', '80', NULL, 'LLC-CC-0001-80'),
    ('LLCCC0011', 'Lava-louças AMBAR 1 CUBA 50', 'AMBAR', '50', NULL, 'LLC-CC-0001-50'),
    ('LLCCC0012', 'Lava-louças AMBAR 1 CUBA 50 N', 'AMBAR', '50', 'NEGRO', 'LLC-CC-0001-NG-50'),
    ('LLCCI0001', 'Lava-louças LODY PVD 1 CUBA 40', 'LODY PVD', '40', NULL, 'LLC-CI-0001-40'),
    ('LLCCI0002', 'Lava-louças LODY PVD 1 CUBA 50', 'LODY PVD', '50', NULL, 'LLC-CI-0001-50'),
    ('LLCCI0003', 'Lava-louças LODY PVD 1 CUBA 70', 'LODY PVD', '70', NULL, 'LLC-CI-0001-70'),
    ('LLCCI0004', 'Lava-louças KERAN 80 C/ESCORREDOR 1 CUBA', 'KERAN', '80', NULL, 'LLC-CI-0004-80'),
    ('LLCCI0005', 'Lava-louças KERAN 86 C/ESCORREDOR 1 CUBA', 'KERAN', '86', NULL, 'LLC-CI-0004-86'),
    ('LLCCI0006', 'Lava-louças KERAN 100 C/ESCORREDOR 2 CUBAS', 'KERAN', '100', NULL, 'LLC-CI-0004-100'),
    ('LLCCI0007', 'Lava-louças KERAN 116 C/ESCORREDOR 2 CUBAS', 'KERAN', '116', NULL, 'LLC-CI-0004-116'),
    ('LLCCI0008', 'Lava-louças VELAR 1 CUBA 34', 'VELAR', '34', NULL, 'LLC-CI-0008-34'),
    ('LLCCI0009', 'Lava-louças VELAR 1 CUBA 40', 'VELAR', '40', NULL, 'LLC-CI-0008-40'),
    ('LLCCI0010', 'Lava-louças VELAR 1 CUBA 45', 'VELAR', '45', NULL, 'LLC-CI-0008-45'),
    ('LLCCI0011', 'Lava-louças VELAR 1 CUBA 50', 'VELAR', '50', NULL, 'LLC-CI-0008-50'),
    ('LLCCI0012', 'Lava-louças VELAR 1 CUBA 70', 'VELAR', '70', NULL, 'LLC-CI-0008-70'),
    ('LLCCI0013', 'Lava-louças UNA 55 - 2 CUBAS', 'UNA', '55', NULL, 'LLC-CI-0013-55'),
    ('LLCCI0014', 'Lava-louças UNA 75 - 2 CUBAS', 'UNA', '75', NULL, 'LLC-CI-0013-75'),
    ('LLCCI0015', 'Lava-louças BRASILIA 1 CUBA', 'BRASILIA', '38', NULL, 'LLC-CI-0015-38'),
    ('LLCCI0016', 'Lava-louças BAHIA 1 CUBA', 'BAHIA', NULL, NULL, 'LLC-CI-0016'),
    ('LLCCI0017', 'Lava-louças LAGUNA 1 CUBA', 'LAGUNA', NULL, NULL, 'LLC-CI-0017'),
    ('LLCCI0018', 'Lava-louças BELÉM 1 CUBA', 'BELÉM', '50', NULL, 'LLC-CI-0018-50'),
    ('LLCCI0019', 'Lava-louças DUO 60 - 2 CUBAS', 'DUO', '60', NULL, 'LLC-CI-0019-60'),
    ('LLCCI0020', 'Lava-louças DUO 80 - 2 CUBAS', 'DUO', '80', NULL, 'LLC-CI-0019-80')) AS e(antigo, nome, modelo, largura, cor, sku)
  LEFT JOIN products p ON p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted AND p.name = e.nome
  WHERE NOT coalesce(
        p.sku = e.sku AND p.sku_gerado AND p.category_id = v_cat
        AND EXISTS (SELECT 1 FROM product_models pm WHERE pm.id = p.model_id AND pm.subcategory_id = p.subcategory_id
                    AND pm.deleted_at IS NULL AND pm.name = e.modelo)
        AND (e.largura IS NULL) = NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id = v_a_larg)
        AND (e.largura IS NULL OR EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id = v_a_larg
                                          AND v.value_text = e.largura))
        AND (e.cor IS NULL) = NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id = v_a_cor)
        AND (e.cor IS NULL OR EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id = v_a_cor
                                      AND public.fn_cat_chave_opcao(v.value_text) = public.fn_cat_chave_opcao(e.cor)))
        AND NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id NOT IN (v_a_larg, v_a_cor)),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2 — % produtos diferentes do esperado: %', v_n, left(v_txt, 1500); END IF;

  -- 2b. a ligação ao fornecedor: uma viva, com o código de fornecedor real ou, sem ele (13), o SKU NOVO
  SELECT count(*), string_agg(e.nome, ' | ') INTO v_n, v_txt
  FROM (VALUES
    ('Lava-louças AMBAR 86 C/ESCORREDOR 1 CUBA', 'LLC-CC-0001-86'),
    ('Lava-louças AMBAR 100 C/ESCORREDOR 1 CUBA', 'LLC-CC-0001-100'),
    ('Lava-louças AMBAR 105 C/ESCORREDOR 2 CUBAS', 'LLC-CC-0001-105'),
    ('Lava-louças AMBAR 116 C/ESCORREDOR 2 CUBAS', 'LLC-CC-0001-116'),
    ('Lava-louças AMBAR 1 CUBA 40', 'LLC-CC-0001-40'),
    ('Lava-louças AMBAR 1 CUBA 40 N', 'K0000004'),
    ('Lava-louças AMBAR 1 CUBA 57', 'LLC-CC-0001-57'),
    ('Lava-louças AMBAR 1.5 CUBA 55', 'LLC-CC-0001-55'),
    ('Lava-louças AMBAR 1 CUBA 70', 'LLC-CC-0001-70'),
    ('Lava-louças AMBAR 1 CUBA 80', 'LLC-CC-0001-80'),
    ('Lava-louças AMBAR 1 CUBA 50', 'LLC-CC-0001-50'),
    ('Lava-louças AMBAR 1 CUBA 50 N', 'K0000001'),
    ('Lava-louças LODY PVD 1 CUBA 40', 'LLC-CI-0001-40'),
    ('Lava-louças LODY PVD 1 CUBA 50', 'LLC-CI-0001-50'),
    ('Lava-louças LODY PVD 1 CUBA 70', 'LLC-CI-0001-70'),
    ('Lava-louças KERAN 80 C/ESCORREDOR 1 CUBA', '16F7KF1K321AO'),
    ('Lava-louças KERAN 86 C/ESCORREDOR 1 CUBA', '16F7KH1K321A0'),
    ('Lava-louças KERAN 100 C/ESCORREDOR 2 CUBAS', '16F7KL4K321AO'),
    ('Lava-louças KERAN 116 C/ESCORREDOR 2 CUBAS', '16F7KO2K321AO'),
    ('Lava-louças VELAR 1 CUBA 34', 'FS200260'),
    ('Lava-louças VELAR 1 CUBA 40', 'FS200261'),
    ('Lava-louças VELAR 1 CUBA 45', 'FS200269'),
    ('Lava-louças VELAR 1 CUBA 50', 'FS200262'),
    ('Lava-louças VELAR 1 CUBA 70', 'FS200263'),
    ('Lava-louças UNA 55 - 2 CUBAS', '18U8EMX0688A0'),
    ('Lava-louças UNA 75 - 2 CUBAS', '18U8ETX0688A0'),
    ('Lava-louças BRASILIA 1 CUBA', '17G7AA10021A0'),
    ('Lava-louças BAHIA 1 CUBA', '17G8AC10021AO'),
    ('Lava-louças LAGUNA 1 CUBA', '17G8AD10021AO'),
    ('Lava-louças BELÉM 1 CUBA', '17G8AG10021A0'),
    ('Lava-louças DUO 60 - 2 CUBAS', 'K0000570'),
    ('Lava-louças DUO 80 - 2 CUBAS', '17G1FJ20021AO')) AS e(nome, supplier_sku)
  LEFT JOIN products p ON p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted AND p.name = e.nome
  WHERE NOT coalesce(
        (SELECT count(*) FROM item_suppliers i WHERE i.product_id = p.id AND i.deleted_at IS NULL) = 1
        AND EXISTS (SELECT 1 FROM item_suppliers i WHERE i.product_id = p.id AND i.deleted_at IS NULL AND i.organization_id = c_org
                    AND i.supplier_id = p.supplier_id AND i.is_preferred AND i.supplier_sku = e.supplier_sku),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2b — % ligações a fornecedor sem o supplier_sku esperado: %', v_n, left(v_txt, 1500); END IF;
  SELECT count(*) INTO v_n FROM item_suppliers i JOIN products p ON p.id = i.product_id
  WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND i.deleted_at IS NULL AND i.supplier_sku ~ '^LLC-C[CI]-[0-9]{4}$';
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2b — % ligações ainda com o SKU antigo como supplier_sku.', v_n; END IF;

  -- 3. 30 com largura, 2 com cor, nenhum produto fora destes com Largura
  SELECT count(*) FILTER (WHERE v.attribute_id = v_a_larg), count(*) FILTER (WHERE v.attribute_id = v_a_cor) INTO v_n, v_m
  FROM product_attribute_values v JOIN products p ON p.id = v.product_id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs);
  SELECT count(*) INTO v_k FROM product_attribute_values v JOIN products p ON p.id = v.product_id
  WHERE v.attribute_id = v_a_larg AND NOT (p.organization_id = c_org AND p.subcategory_id = ANY (v_subs));
  IF v_n <> 30 OR v_m <> 2 OR v_k > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — % com largura (30), % com cor (2), % fora com Largura (0).', v_n, v_m, v_k;
  END IF;

  -- 4. o atributo Largura e as 15 opções
  IF NOT EXISTS (SELECT 1 FROM product_attributes a WHERE a.id = v_a_larg AND NOT a.is_measurement AND a.sku_entra AND a.sku_ordem IS NOT NULL
                 AND a.sku_ordem > ALL (SELECT coalesce(b.sku_ordem, 0) FROM product_attributes b
                                        WHERE b.organization_id = c_org AND b.deleted_at IS NULL AND b.id <> v_a_larg))
     OR NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_larg AND g.organization_id = c_org) THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — a Largura não é uma lista da Mudelar a entrar no SKU no fim da ordem.';
  END IF;
  SELECT count(*) INTO v_n FROM unnest(ARRAY['34', '38', '40', '45', '50', '55', '57', '60', '70', '75', '80', '86', '100', '105', '116']) AS x(v)
  WHERE NOT EXISTS (SELECT 1 FROM attribute_option_group_values o WHERE o.group_id = v_g_larg AND o.value_text = x.v AND o.sigla = x.v AND o.is_active);
  SELECT count(*) INTO v_m FROM attribute_option_group_values o WHERE o.group_id = v_g_larg;
  IF v_n > 0 OR v_m <> 15 THEN RAISE EXCEPTION 'FALHOU: passo 4 — % opções em falta, % no grupo (esperadas 15).', v_n, v_m; END IF;

  -- 5. SKUs únicos na Mudelar, no formato, nenhum provisório
  SELECT count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ '^LLC-(CC|CI)-[0-9]{4}(-[A-Z0-9]+){0,2}$' OR NOT p.sku_gerado)
    INTO v_n, v_m
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted;
  SELECT count(*) INTO v_k FROM (SELECT p.sku FROM products p WHERE p.organization_id = c_org AND p.sku LIKE 'LLC-%'
                                 GROUP BY p.sku HAVING count(*) > 1) x;
  IF v_n <> c_total OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 5 — % SKUs distintos (32), % fora do formato ou não gerados, % repetidos.', v_n, v_m, v_k;
  END IF;

  -- 6. recalculado pela regra e cat_prever_sku_modelo (só leitura) como um membro da Mudelar com products.edit
  SELECT count(*), string_agg(y.sku || ' ≠ ' || coalesce(y.calc, 'null'), '; ') INTO v_n, v_txt
  FROM (SELECT p.sku, z.pt ->> 'faltas' AS faltas,
               concat_ws('-', z.pt ->> 'prefixo', lpad(public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id)::text, 4, '0'),
                         z.pt ->> 'resto') AS calc
        FROM products p
        CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, p.category_id, p.subcategory_id, (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'atributo', v.attribute_id, 'sigla', o.sigla,
                     'medida', (CASE WHEN a.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END))), '[]'::jsonb)
            FROM product_attribute_values v
            JOIN product_attributes a ON a.id = v.attribute_id AND a.organization_id = c_org AND a.deleted_at IS NULL
            LEFT JOIN attribute_option_group_values o
              ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(a.id, c_org) AND o.value_text = v.value_text
            WHERE v.product_id = p.id)) AS pt) z
        WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted) y
  WHERE y.calc IS DISTINCT FROM y.sku OR y.faltas IS DISTINCT FROM '[]';
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 6 — % SKUs diferentes do recalculado: %', v_n, left(v_txt, 1500); END IF;
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 6 — sem membro ativo da Mudelar com products.edit.'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  v_n := 0;
  FOR r IN SELECT p.id, p.sku, p.category_id, p.subcategory_id, p.model_id
           FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted ORDER BY p.sku LOOP
    SELECT coalesce(jsonb_agg(jsonb_build_object('atributo', v.attribute_id, 'opcao', o.id)), '[]'::jsonb) INTO v_attrs
    FROM product_attribute_values v
    JOIN attribute_option_group_values o ON o.group_id = public.fn_cat_grupo_do_atributo(v.attribute_id, c_org) AND o.value_text = v.value_text
    WHERE v.product_id = r.id;
    v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.id);
    IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'FALHOU: passo 6 — cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 6 — só % produtos comparados.', v_n; END IF;

  -- 7. nada escrito fora da Mudelar nem fora do âmbito (o xmin é o da transação que criou o atributo Largura)
  SELECT a.xmin::text INTO v_xid FROM product_attributes a WHERE a.id = v_a_larg;
  SELECT string_agg(x.t || ' ' || x.n, ', ') INTO v_txt FROM (
    SELECT 'products (fora)' AS t, count(*) AS n FROM products p WHERE p.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'products (Mudelar, outros)', count(*) FROM products p
              WHERE p.xmin::text = v_xid AND p.organization_id = c_org AND NOT (p.subcategory_id = ANY (v_subs))
    UNION ALL SELECT 'product_attribute_values (fora)', count(*) FROM product_attribute_values x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND NOT (p.organization_id = c_org AND p.subcategory_id = ANY (v_subs))
    UNION ALL SELECT 'product_models (fora)', count(*) FROM product_models x
              WHERE x.xmin::text = v_xid AND NOT (x.organization_id = c_org AND x.subcategory_id = ANY (v_subs))
    UNION ALL SELECT 'product_attributes (outros)', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid AND x.id <> v_a_larg
    UNION ALL SELECT 'attribute_option_groups (fora)', count(*) FROM attribute_option_groups x
              WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_group_values (fora)', count(*) FROM attribute_option_group_values x JOIN attribute_option_groups g ON g.id = x.group_id
              WHERE x.xmin::text = v_xid AND g.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_prices', count(*) FROM product_prices x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'item_suppliers (fora)', count(*) FROM item_suppliers x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND NOT (p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND x.supplier_sku = p.sku)
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 7 — linhas escritas fora do âmbito: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM item_suppliers x WHERE x.xmin::text = v_xid;
  IF v_n <> 13 THEN RAISE EXCEPTION 'FALHOU: passo 7 — % ligações a fornecedor escritas (esperadas 13).', v_n; END IF;

  -- 8. a auditoria: 30 produtos alterados (todos menos BAHIA e LAGUNA, que só mudam de nome de modelo) e 32 modelos
  SELECT count(DISTINCT e.record_id) INTO v_n FROM entity_audit_log e
  WHERE e.source = 'migration:lava_loucas_modelos_largura' AND e.table_name = 'products' AND e.operation = 'UPDATE'
    AND e.record_id IN (SELECT p.id FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs));
  SELECT count(DISTINCT e.record_id) INTO v_m FROM entity_audit_log e
  WHERE e.source = 'migration:lava_loucas_modelos_largura' AND e.table_name = 'product_models' AND e.operation = 'UPDATE'
    AND e.record_id IN (SELECT pm.id FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id = ANY (v_subs));
  IF v_n <> 30 OR v_m <> 32 THEN
    RAISE EXCEPTION 'FALHOU: passo 8 — a auditoria tem % produtos (30) e % modelos (32) com a fonte da migration.', v_n, v_m;
  END IF;
END $t$;

SELECT 'OK: lava-louças & cubas da Mudelar (10 modelos, Largura em 30, NEGRO em 2, 32 SKUs novos) conferidos nos passos 0 a 8.' AS resultado;

ROLLBACK;
