-- ============================================================
-- Testes: 20270120400000_catalogo_mobiliario_medidas.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 120400000 (falha no passo 0: o Mobiliário & Componentes Cozinha da Mudelar tem 40
-- produtos sem medida nem largura em vez de 25); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355) e, para provar que nada foi escrito fora dela, as outras organizações (só
-- contagens pelo xmin da transação da migration, o do produto «Estrutura de Pimenteiro…»; vale enquanto nada voltar a
-- escrever nesse produto). Para comparar os SKUs com cat_prever_sku_modelo usa, só nesta transação, as claims de um
-- membro ativo da Mudelar com products.edit (a função é só de leitura). Nenhuma chamada recusada de propósito.
-- Não assume que a opção «20» da Largura foi criada por esta migration (pode já existir).
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_mobiliario_medidas.test.sql
--
-- O que PROVA:
--   1. Os 13 modelos que ficam, vivos e ativos, com o nome sem a medida e o número de sempre; AC 0013 e AC 0017
--      apagados (não removidos).
--   2. Cada um dos 15 produtos, pelo nome de sempre: o modelo, a Medida (value_json em mm, value_text, unit) ou a
--      Largura, nenhum outro atributo, o SKU novo gerado.
--   2b. A ligação ao fornecedor: o SKU novo (14) ou o código do fornecedor (LAUNDRY CARRIER).
--   3. Os 25 que ficam com a medida no nome: sem Medida nem Largura, SKU MCC-SUB-NNNN; nenhum dos 15 entre eles.
--   4. As opções 20, 60, 80 e 140 da Largura: ativas, sigla = número.
--   5. SKUs únicos no Mobiliário e no formato; nenhum provisório.
--   6. Os 15: o SKU recalculado pela regra e o de cat_prever_sku_modelo são o gravado.
--   7. Nada escrito fora dos 15 produtos, dos 15 modelos e das 14 ligações; nem preços, atributos, categorias.
--   8. A auditoria registou as alterações dos 15 produtos e dos 15 modelos com a fonte da migration.
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A migration foi aplicada? ────────────────────────────────────────────
DO $t0$
DECLARE v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM products p JOIN product_categories c ON c.id = p.category_id
  WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted AND c.parent_id IS NULL
    AND c.organization_id = p.organization_id AND c.sigla = 'MCC'
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values v JOIN product_attributes a ON a.id = v.attribute_id
                    WHERE v.product_id = p.id AND a.organization_id = p.organization_id AND a.deleted_at IS NULL
                      AND a.code::text IN ('medida', 'largura'));
  IF v_n <> 25 THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — o Mobiliário & Componentes Cozinha da Mudelar tem % produtos sem medida nem largura em vez de 25 (aplicar 20270120400000).', v_n;
  END IF;
END $t0$;

-- ─── 1 a 8 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_total constant integer := 15;
  v_cat uuid; v_subs uuid[]; v_a_med uuid; v_a_larg uuid; v_g_larg uuid; v_pim uuid;
  v_n bigint; v_m bigint; v_k bigint; v_txt text; v_xid text; v_auth uuid; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  SELECT c.id INTO v_cat FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND c.sigla = 'MCC';
  SELECT array_agg(c.id ORDER BY c.sigla) INTO v_subs FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL AND c.sigla IN ('AC', 'ACL');
  SELECT a.id INTO v_a_med FROM product_attributes a
  WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'medida' AND a.is_measurement;
  SELECT a.id INTO v_a_larg FROM product_attributes a
  WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'largura' AND NOT a.is_measurement;
  IF v_cat IS NULL OR cardinality(v_subs) IS DISTINCT FROM 2 OR v_a_med IS NULL OR v_a_larg IS NULL THEN
    RAISE EXCEPTION 'FALHOU: configuração da Mudelar incompleta (categoria MCC, subcategorias AC e ACL, Medida, Largura).';
  END IF;
  v_g_larg := public.fn_cat_grupo_do_atributo(v_a_larg, c_org);

  -- 1. modelos: os 13 vivos e ativos, com nome e número; AC 0013 e AC 0017 apagados e não removidos
  SELECT count(*), string_agg(e.sub || ' ' || e.nome, ', ') INTO v_n, v_txt
  FROM (VALUES ('AC', 1, 'Estrutura de Pimenteiro para Interior do móvel'),
               ('AC', 5, 'Porta talheres'),
               ('AC', 12, 'BLOCO EM TERMOLAMINADO BRANCO BRILHO - 1 GAVETÃO + TAMPO'),
               ('AC', 14, 'TAMPO EM TERMOLAMINADO BRANCO BRILHO C/ PÉ INOX'),
               ('AC', 15, 'PRATELEIRA SUSPENSA TERMOLAMINADO BRANCO BRILHO'),
               ('AC', 16, 'Prateleira em Melamina Nogueira C/Fixação Oculta'),
               ('AC', 18, 'ESTRUTURA LAUNDRY CARRIER 500 2X33L ANTRACITE'),
               ('AC', 19, 'PRATELEIRA VIDRO INCOLOR 6MM C/ ARESTAS P/Móvel de Cozinha'),
               ('AC', 20, 'ARO + ESTRUTURA + FRENTE P/ PRATELEIRA EXTRAIVEL ( P/ COLOCAR POR BAIXO DA ZONHA DE MAQ)'),
               ('AC', 21, 'RIPADOS MELAMINA ORC2691/2118'),
               ('ACL', 1, 'Armário de Coluna C/Espaço Interior'),
               ('ACL', 2, 'COLUNA CRISTALEIRA C/ 4 PRATELEIRS E 2 FRENTES EM VIDRO INCOLOR'),
               ('ACL', 3, 'ARMÁRIO DE COLUNA COM CANTO DE ARRUMAÇÃO')) AS e(sub, numero, nome)
  WHERE (SELECT count(*) FROM product_models pm JOIN product_categories s ON s.id = pm.subcategory_id
         WHERE pm.organization_id = c_org AND s.parent_id = v_cat AND s.sigla = e.sub
           AND pm.deleted_at IS NULL AND pm.is_active AND pm.name = e.nome AND pm.numero = e.numero) <> 1;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 1 — modelos em falta ou errados: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM product_models pm JOIN product_categories s ON s.id = pm.subcategory_id
  WHERE pm.organization_id = c_org AND s.parent_id = v_cat AND s.sigla = 'AC' AND pm.numero IN (13, 17) AND pm.deleted_at IS NOT NULL;
  SELECT count(*) INTO v_m FROM products p JOIN product_models pm ON pm.id = p.model_id
  WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND pm.deleted_at IS NOT NULL;
  IF v_n <> 2 OR v_m > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — % de AC 0013/0017 apagados (2); % produtos num modelo apagado (0).', v_n, v_m;
  END IF;

  -- 2. cada produto: modelo, medida (3D/2D em mm) ou largura, nada mais, SKU
  SELECT count(*), string_agg(e.nome, ' | ') INTO v_n, v_txt
  FROM (VALUES
    ('Estrutura de Pimenteiro para Interior do móvel de 200mm', 'Estrutura de Pimenteiro para Interior do móvel', NULL, '20', 'MCC-AC-0001-20'),
    ('Porta talheres até 80cm', 'Porta talheres', NULL, '80', 'MCC-AC-0005-80'),
    ('BLOCO EM TERMOLAMINADO BRANCO BRILHO C/ 450X400X600 - 1 GAVETÃO + TAMPO', 'BLOCO EM TERMOLAMINADO BRANCO BRILHO - 1 GAVETÃO + TAMPO',
     '{"tipo":"3D","largura":450,"comprimento":400,"espessura":600,"unidade":"mm"}', NULL, 'MCC-AC-0012-450X400X600MM'),
    ('BLOCO EM TERMOLAMINADO BRANCO BRILHO C/ 450X400X750 - 1 GAVETÃO + TAMPO', 'BLOCO EM TERMOLAMINADO BRANCO BRILHO - 1 GAVETÃO + TAMPO',
     '{"tipo":"3D","largura":450,"comprimento":400,"espessura":750,"unidade":"mm"}', NULL, 'MCC-AC-0012-450X400X750MM'),
    ('TAMPO EM TERMOLAMINADO BRANCO BRILHO C/ 750X600XPÉ INOX', 'TAMPO EM TERMOLAMINADO BRANCO BRILHO C/ PÉ INOX',
     '{"tipo":"2D","largura":750,"comprimento":600,"espessura":null,"unidade":"mm"}', NULL, 'MCC-AC-0014-750X600MM'),
    ('PRATELEIRA SUSPENSA TERMOLAMINADO BRANCO BRILHO C/ 1400', 'PRATELEIRA SUSPENSA TERMOLAMINADO BRANCO BRILHO', NULL, '140', 'MCC-AC-0015-140'),
    ('Prateleira em Melamina Nogueira C/Fixação Oculta 250x650x40', 'Prateleira em Melamina Nogueira C/Fixação Oculta',
     '{"tipo":"3D","largura":250,"comprimento":650,"espessura":40,"unidade":"mm"}', NULL, 'MCC-AC-0016-250X650X40MM'),
    ('Prateleira em Melamina Nogueira C/Fixação Oculta 250x1100x250', 'Prateleira em Melamina Nogueira C/Fixação Oculta',
     '{"tipo":"3D","largura":250,"comprimento":1100,"espessura":250,"unidade":"mm"}', NULL, 'MCC-AC-0016-250X1100X250MM'),
    ('ESTRUTURA LAUNDRY CARRIER 500 2X33L 528MM ALT 545MM ANTRACITE', 'ESTRUTURA LAUNDRY CARRIER 500 2X33L ANTRACITE',
     '{"tipo":"2D","largura":528,"comprimento":545,"espessura":null,"unidade":"mm"}', NULL, 'MCC-AC-0018-528X545MM'),
    ('PRATELEIRA VIDRO INCOLOR 6MM C/ ARESTAS C/ 600X400 P/Móvel de Cozinha', 'PRATELEIRA VIDRO INCOLOR 6MM C/ ARESTAS P/Móvel de Cozinha',
     '{"tipo":"2D","largura":600,"comprimento":400,"espessura":null,"unidade":"mm"}', NULL, 'MCC-AC-0019-600X400MM'),
    ('ARO + ESTRUTURA + FRENTE P/ PRATELEIRA EXTRAIVEL DE 600 DE LARGURA ( P/ COLOCAR POR BAIXO DA ZONHA DE MAQ)',
     'ARO + ESTRUTURA + FRENTE P/ PRATELEIRA EXTRAIVEL ( P/ COLOCAR POR BAIXO DA ZONHA DE MAQ)', NULL, '60', 'MCC-AC-0020-60'),
    ('RIPADOS MELAMINA 2400X700 ORC2691/2118', 'RIPADOS MELAMINA ORC2691/2118',
     '{"tipo":"2D","largura":2400,"comprimento":700,"espessura":null,"unidade":"mm"}', NULL, 'MCC-AC-0021-2400X700MM'),
    ('Armário de Coluna C/Espaço Interior 2400x1000x600', 'Armário de Coluna C/Espaço Interior',
     '{"tipo":"3D","largura":2400,"comprimento":1000,"espessura":600,"unidade":"mm"}', NULL, 'MCC-ACL-0001-2400X1000X600MM'),
    ('COLUNA CRISTALEIRA C/ 2500X400X400 C/ 4 PRATELEIRS E 2 FRENTES EM VIDRO INCOLOR', 'COLUNA CRISTALEIRA C/ 4 PRATELEIRS E 2 FRENTES EM VIDRO INCOLOR',
     '{"tipo":"3D","largura":2500,"comprimento":400,"espessura":400,"unidade":"mm"}', NULL, 'MCC-ACL-0002-2500X400X400MM'),
    ('ARMÁRIO DE COLUNA COM CANTO DE ARRUMAÇÃO 1200X2400X600', 'ARMÁRIO DE COLUNA COM CANTO DE ARRUMAÇÃO',
     '{"tipo":"3D","largura":1200,"comprimento":2400,"espessura":600,"unidade":"mm"}', NULL, 'MCC-ACL-0003-1200X2400X600MM')
    ) AS e(nome, modelo, medida, largura, sku)
  LEFT JOIN products p ON p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted AND p.name = e.nome
  WHERE NOT coalesce(
        p.sku = e.sku AND p.sku_gerado AND p.category_id = v_cat
        AND EXISTS (SELECT 1 FROM product_models pm WHERE pm.id = p.model_id AND pm.subcategory_id = p.subcategory_id
                    AND pm.deleted_at IS NULL AND pm.name = e.modelo)
        AND (e.medida IS NULL) = NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id = v_a_med)
        AND (e.medida IS NULL OR EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id = v_a_med
                                         AND v.value_json = e.medida::jsonb AND v.unit = 'mm'
                                         AND v.value_text = replace(public.fn_cat_medida_texto(e.medida::jsonb), '×', ' × ')))
        AND (e.largura IS NULL) = NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id = v_a_larg)
        AND (e.largura IS NULL OR EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id = v_a_larg
                                          AND v.value_text = e.largura AND v.value_json IS NULL))
        AND NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id NOT IN (v_a_med, v_a_larg)),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2 — % produtos diferentes do esperado: %', v_n, left(v_txt, 1500); END IF;

  -- 2b. a ligação ao fornecedor: uma viva por produto; o SKU novo, ou o código do fornecedor no LAUNDRY CARRIER
  SELECT count(*), string_agg(p.name, ' | ') INTO v_n, v_txt
  FROM products p
  WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted
    AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id IN (v_a_med, v_a_larg))
    AND (SELECT count(*) FROM item_suppliers i WHERE i.product_id = p.id AND i.deleted_at IS NULL
           AND i.supplier_sku = (CASE WHEN p.name LIKE 'ESTRUTURA LAUNDRY CARRIER%' THEN '940TUL0000004 3270821' ELSE p.sku END)) <> 1;
  SELECT count(*) INTO v_m FROM products p JOIN item_suppliers i ON i.product_id = p.id AND i.deleted_at IS NULL
  WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND i.supplier_sku ~ '^MCC-(AC|ACL)-[0-9]{4}$'
    AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id IN (v_a_med, v_a_larg));
  IF v_n > 0 OR v_m > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 2b — % produtos sem a ligação esperada (%); % ligações com o SKU antigo.', v_n, left(coalesce(v_txt, ''), 800), v_m;
  END IF;

  -- 3. os 25 que ficam com a medida no nome (nenhum dos 15), sem medida nem largura, SKU sem atributos
  SELECT count(*), count(*) FILTER (WHERE p.sku !~ '^MCC-(AC|ACL|AI|AS|CCP|PX)-[0-9]{4}(-(VNR|VC))?$'),
         count(*) FILTER (WHERE p.subcategory_id = ANY (v_subs) AND p.name ~ '(\d+\s*[xX]\s*\d{3,})|(200mm|1400$|DE 600 DE|até 80cm)')
    INTO v_n, v_m, v_k
  FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.category_id = v_cat
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id IN (v_a_med, v_a_larg));
  IF v_n <> 25 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — % sem medida (25), % com SKU fora do formato (0), % dos 15 ainda sem medida (0).', v_n, v_m, v_k;
  END IF;

  -- 4. as opções da Largura usadas: ativas, sigla = número
  SELECT count(*) INTO v_n FROM unnest(ARRAY['20', '60', '80', '140']) AS x(v)
  WHERE (SELECT count(*) FROM attribute_option_group_values o WHERE o.group_id = v_g_larg AND o.value_text = x.v AND o.sigla = x.v AND o.is_active) <> 1;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 4 — % opções da Largura (20, 60, 80, 140) em falta ou com outra sigla.', v_n; END IF;

  -- 5. SKUs únicos no Mobiliário, no formato, nenhum provisório
  SELECT count(*) INTO v_n FROM (SELECT p.sku FROM products p WHERE p.organization_id = c_org AND p.category_id = v_cat AND NOT p.is_deleted
                                 GROUP BY p.sku HAVING count(*) > 1) x;
  SELECT count(*) INTO v_m FROM products p
  WHERE p.organization_id = c_org AND p.category_id = v_cat AND NOT p.is_deleted
    AND (p.sku !~ '^MCC-(AC|ACL|AI|AS|CCP|PX)-[0-9]{4}(-[A-Z0-9]+){0,3}$' OR NOT p.sku_gerado);
  SELECT count(*) INTO v_k FROM (SELECT p.sku FROM products p WHERE p.organization_id = c_org AND p.sku LIKE 'MCC-%'
                                 GROUP BY p.sku HAVING count(*) > 1) x;
  IF v_n > 0 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 5 — % SKUs repetidos no Mobiliário, % fora do formato ou não gerados, % MCC repetidos na Mudelar.', v_n, v_m, v_k;
  END IF;

  -- 6. os 15: recalculado pela regra e cat_prever_sku_modelo (só leitura) como um membro da Mudelar com products.edit
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
        WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted
          AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id IN (v_a_med, v_a_larg))) y
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
           FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted
             AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id IN (v_a_med, v_a_larg))
           ORDER BY p.sku LOOP
    SELECT coalesce(jsonb_agg(CASE WHEN a.is_measurement THEN jsonb_build_object('atributo', v.attribute_id, 'medida', v.value_json)
                                   ELSE jsonb_build_object('atributo', v.attribute_id, 'opcao', o.id) END), '[]'::jsonb)
      INTO v_attrs
    FROM product_attribute_values v
    JOIN product_attributes a ON a.id = v.attribute_id
    LEFT JOIN attribute_option_group_values o
      ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(v.attribute_id, c_org) AND o.value_text = v.value_text
    WHERE v.product_id = r.id;
    v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.id);
    IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'FALHOU: passo 6 — cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 6 — % produtos comparados (15).', v_n; END IF;

  -- 7. nada escrito fora do âmbito (o xmin é o da transação que mudou o produto «Estrutura de Pimenteiro…»)
  SELECT p.id, p.xmin::text INTO v_pim, v_xid FROM products p
  WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted
    AND p.name = 'Estrutura de Pimenteiro para Interior do móvel de 200mm';
  SELECT count(*) INTO v_n FROM products p WHERE p.xmin::text = v_xid AND p.organization_id = c_org AND p.subcategory_id = ANY (v_subs);
  IF v_n <> c_total THEN
    RAISE EXCEPTION 'FALHOU: passo 7 — % produtos com o xmin da migration (15): outra escrita depois dela invalida esta prova.', v_n;
  END IF;
  SELECT string_agg(x.t || ' ' || x.n, ', ') INTO v_txt FROM (
    SELECT 'products (fora)' AS t, count(*) AS n FROM products p
    WHERE p.xmin::text = v_xid AND NOT (p.organization_id = c_org AND p.subcategory_id = ANY (v_subs))
    UNION ALL SELECT 'product_attribute_values (fora)', count(*) FROM product_attribute_values x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND NOT (p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND p.xmin::text = v_xid)
    UNION ALL SELECT 'product_models (fora)', count(*) FROM product_models x
              WHERE x.xmin::text = v_xid AND NOT (x.organization_id = c_org AND x.subcategory_id = ANY (v_subs))
    UNION ALL SELECT 'product_attributes', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'attribute_option_groups', count(*) FROM attribute_option_groups x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'attribute_option_group_values (fora da Largura, ou não «20»)', count(*) FROM attribute_option_group_values x
              WHERE x.xmin::text = v_xid AND NOT (x.group_id = v_g_larg AND x.value_text = '20')
    UNION ALL SELECT 'product_prices', count(*) FROM product_prices x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'item_suppliers (fora)', count(*) FROM item_suppliers x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND NOT (p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND x.supplier_sku = p.sku)
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 7 — linhas escritas fora do âmbito: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM product_models x WHERE x.xmin::text = v_xid;
  SELECT count(*) INTO v_m FROM item_suppliers x WHERE x.xmin::text = v_xid;
  SELECT count(*) INTO v_k FROM product_attribute_values x WHERE x.xmin::text = v_xid;
  IF v_n <> 15 OR v_m <> 14 OR v_k <> 15 THEN
    RAISE EXCEPTION 'FALHOU: passo 7 — % modelos (15), % ligações a fornecedor (14) e % valores (15) escritos pela migration.', v_n, v_m, v_k;
  END IF;

  -- 8. a auditoria: 15 produtos e 15 modelos alterados com a fonte da migration
  SELECT count(DISTINCT e.record_id) INTO v_n FROM entity_audit_log e
  WHERE e.source = 'migration:mobiliario_medidas' AND e.table_name = 'products' AND e.operation = 'UPDATE'
    AND e.record_id IN (SELECT p.id FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs));
  SELECT count(DISTINCT e.record_id) INTO v_m FROM entity_audit_log e
  WHERE e.source = 'migration:mobiliario_medidas' AND e.table_name = 'product_models' AND e.operation = 'UPDATE'
    AND e.record_id IN (SELECT pm.id FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id = ANY (v_subs));
  IF v_n <> 15 OR v_m <> 15 THEN
    RAISE EXCEPTION 'FALHOU: passo 8 — a auditoria tem % produtos (15) e % modelos (15) com a fonte da migration.', v_n, v_m;
  END IF;
END $t$;

SELECT 'OK: mobiliário da Mudelar (15 produtos com a medida em atributo: 11 Medida em mm, 4 Largura; 13 modelos, AC 0013 e 0017 juntados; 15 SKUs novos; 25 ficam com a medida no nome) conferido nos passos 0 a 8.' AS resultado;

ROLLBACK;
