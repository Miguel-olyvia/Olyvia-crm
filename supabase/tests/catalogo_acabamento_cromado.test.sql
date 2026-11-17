-- ============================================================
-- Testes: 20270120500000_catalogo_acabamento_cromado.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 120500000 (falha no passo 0: a Mudelar tem 797 produtos com Cor Cromo /
-- ROSA GOLD ESCOVADO sem Acabamento); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
-- Não depende da importação das Torneiras (20270120600000): só olha para as 11 subcategorias que a correção toca.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355). Para comparar os SKUs com cat_prever_sku_modelo usa, só nesta transação, as
-- claims de um membro ativo da Mudelar com products.edit (a função é só de leitura). Nenhuma chamada recusada de propósito.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_acabamento_cromado.test.sql
--
-- O que PROVA:
--   1. Nenhum produto vivo da Mudelar com Cor Cromo/Cromado/ROSA GOLD ESCOVADO sem Acabamento.
--   2. Por subcategoria, os produtos com Acabamento Cromado e sem Cor: Auxiliares 1, Cabides 2, Cestos 1, Pega De
--      Segurança 1, Piaçaba 2, Porta-rolos 2, Toalheiros 13, Chuveiro Higiénico 3, Colunas Duche 15, Resguardos de
--      Duche 754, Kit´s para Sanitários 2 (796).
--   3. O WATER BLISS: Cor Rosa Gold + Acabamento Escovado; ninguém com Cor ROSA GOLD ESCOVADO.
--   4. Os 227 Resguardos com Cor CROMO + Frost Plus ficaram como estavam.
--   5. O Acabamento tem Cromado, Escovado, Mate e PVD ativos, com sigla, e entra no SKU.
--   6. Nas 11 subcategorias: SKUs únicos na Mudelar, no formato, sem provisórios, iguais ao recalculado pela regra; os
--      com Cromado terminam no segmento do Cromado e não têm o da Cor CROMO; cat_prever_sku_modelo dá o mesmo (amostra).
--   7. Ligações a fornecedor: nenhuma com um SKU do Catálogo que não seja o do próprio produto; 41 com o SKU novo.
--   8. A auditoria tem a linha consolidada com a fonte da migration.
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A correção foi aplicada? ─────────────────────────────────────────────
DO $t0$
DECLARE v_n bigint;
BEGIN
  SELECT count(*) INTO v_n
  FROM products p
  JOIN product_attributes a ON a.organization_id = p.organization_id AND a.code::text = 'cor' AND a.deleted_at IS NULL
  JOIN product_attribute_values pv ON pv.product_id = p.id AND pv.attribute_id = a.id
  WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
    AND public.fn_cat_chave_opcao(pv.value_text) IN ('cromo', 'cromado', 'rosa gold escovado')
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values x JOIN product_attributes b ON b.id = x.attribute_id AND b.code::text = 'acabamento'
                    WHERE x.product_id = p.id AND b.organization_id = p.organization_id);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — a Mudelar tem % produtos com Cor Cromo / ROSA GOLD ESCOVADO sem Acabamento (aplicar 20270120500000).', v_n;
  END IF;
END $t0$;

-- ─── 1 a 8 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  v_a_cor uuid; v_a_acab uuid; v_g_acab uuid; v_subs uuid[]; v_cromado text; v_cromado_sigla text; v_escovado text;
  v_cromo_sigla text;
  v_n bigint; v_m bigint; v_k bigint; v_txt text; v_auth uuid; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  SELECT a.id INTO v_a_cor FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'cor';
  SELECT a.id INTO v_a_acab FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'acabamento';
  IF v_a_cor IS NULL OR v_a_acab IS NULL THEN RAISE EXCEPTION 'FALHOU: a Mudelar não tem os atributos cor e acabamento.'; END IF;
  v_g_acab := public.fn_cat_grupo_do_atributo(v_a_acab, c_org);

  -- 5. as opções do Acabamento
  SELECT count(*) INTO v_n FROM (VALUES ('cromado'), ('escovado'), ('mate'), ('pvd')) AS e(k)
  WHERE (SELECT count(*) FROM attribute_option_group_values v WHERE v.group_id = v_g_acab AND v.is_active AND v.sigla IS NOT NULL
         AND public.fn_cat_chave_opcao(v.value_text::text) = e.k) <> 1;
  IF v_n > 0 OR NOT EXISTS (SELECT 1 FROM product_attributes a WHERE a.id = v_a_acab AND a.sku_entra AND NOT a.is_measurement) THEN
    RAISE EXCEPTION 'FALHOU: passo 5 — faltam % das opções Cromado/Escovado/Mate/PVD do Acabamento (ou não entra no SKU).', v_n;
  END IF;
  SELECT v.value_text::text, v.sigla INTO v_cromado, v_cromado_sigla FROM attribute_option_group_values v
  WHERE v.group_id = v_g_acab AND public.fn_cat_chave_opcao(v.value_text::text) = 'cromado';
  SELECT v.value_text::text INTO v_escovado FROM attribute_option_group_values v
  WHERE v.group_id = v_g_acab AND public.fn_cat_chave_opcao(v.value_text::text) = 'escovado';
  SELECT v.sigla INTO v_cromo_sigla FROM attribute_option_group_values v
  WHERE v.group_id = public.fn_cat_grupo_do_atributo(v_a_cor, c_org) AND v.value_text = 'CROMO';

  -- as 11 subcategorias
  SELECT array_agg(s.id) INTO v_subs
  FROM (VALUES ('Acessórios de Casa de Banho', 'Auxiliares'), ('Acessórios de Casa de Banho', 'Cabides'),
               ('Acessórios de Casa de Banho', 'Cestos'), ('Acessórios de Casa de Banho', 'Pega De Segurança'),
               ('Acessórios de Casa de Banho', 'Piaçaba'), ('Acessórios de Casa de Banho', 'Porta-rolos'),
               ('Acessórios de Casa de Banho', 'Toalheiros'), ('Duche & Banho', 'Chuveiro Higiénico'),
               ('Duche & Banho', 'Colunas Duche'), ('Duche & Banho', 'Resguardos de Duche'),
               ('Loiças Sanitárias', 'Kit´s para Sanitários')) AS e(cat, sub)
  JOIN product_categories c ON c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
   AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(e.cat)
  JOIN product_categories s ON s.organization_id = c_org AND s.parent_id = c.id AND s.deleted_at IS NULL
   AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.sub);
  IF cardinality(v_subs) IS DISTINCT FROM 11 THEN RAISE EXCEPTION 'FALHOU: as 11 subcategorias não existem uma vez cada (%).', cardinality(v_subs); END IF;

  -- 1. ninguém com Cor Cromo sem Acabamento (o passo 0 já o disse; aqui também ROSA GOLD ESCOVADO em uso)
  SELECT count(*) INTO v_n FROM product_attribute_values pv JOIN products p ON p.id = pv.product_id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND pv.attribute_id = v_a_cor
    AND public.fn_cat_chave_opcao(pv.value_text) = 'rosa gold escovado';
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 3 — % produtos ainda com Cor ROSA GOLD ESCOVADO.', v_n; END IF;

  -- 2. por subcategoria: Cromado e sem Cor
  SELECT string_agg(e.sub || ' ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM (VALUES ('Auxiliares', 1), ('Cabides', 2), ('Cestos', 1), ('Pega De Segurança', 1), ('Piaçaba', 2), ('Porta-rolos', 2),
               ('Toalheiros', 13), ('Chuveiro Higiénico', 3), ('Colunas Duche', 15), ('Resguardos de Duche', 754),
               ('Kit´s para Sanitários', 2)) AS e(sub, n)
  JOIN product_categories s ON s.id = ANY (v_subs) AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.sub)
  LEFT JOIN (SELECT p.subcategory_id, count(*) AS n FROM products p
             JOIN product_attribute_values ac ON ac.product_id = p.id AND ac.attribute_id = v_a_acab AND ac.value_text = v_cromado
             WHERE p.organization_id = c_org AND NOT p.is_deleted
               AND NOT EXISTS (SELECT 1 FROM product_attribute_values vc WHERE vc.product_id = p.id AND vc.attribute_id = v_a_cor)
             GROUP BY p.subcategory_id) x ON x.subcategory_id = s.id
  WHERE coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 2 — Cromado sem Cor por subcategoria: %', v_txt; END IF;
  -- e nenhum Cromado COM Cor nas 11 (seria um Cromo que ficou a meio)
  SELECT count(*) INTO v_n FROM products p
  JOIN product_attribute_values ac ON ac.product_id = p.id AND ac.attribute_id = v_a_acab AND ac.value_text = v_cromado
  JOIN product_attribute_values vc ON vc.product_id = p.id AND vc.attribute_id = v_a_cor
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2 — % produtos com Cromado e com Cor nas 11 subcategorias.', v_n; END IF;

  -- 3. o WATER BLISS Rosa Gold
  SELECT count(*) INTO v_n FROM products p
  JOIN product_categories s ON s.id = p.subcategory_id AND public.fn_cat_chave_opcao(s.name) = 'chuveiro higienico'
  JOIN product_attribute_values vc ON vc.product_id = p.id AND vc.attribute_id = v_a_cor AND public.fn_cat_chave_opcao(vc.value_text) = 'rosa gold'
  JOIN product_attribute_values ac ON ac.product_id = p.id AND ac.attribute_id = v_a_acab AND ac.value_text = v_escovado
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name LIKE '%WATER BLISS%ROSA GOLD ESCOVADO';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHOU: passo 3 — % WATER BLISS com Rosa Gold + Escovado (esperado 1).', v_n; END IF;

  -- 4. os 227 Resguardos Cromo + Frost Plus
  SELECT count(*) INTO v_n FROM products p
  JOIN product_attribute_values vc ON vc.product_id = p.id AND vc.attribute_id = v_a_cor AND vc.value_text = 'CROMO'
  JOIN product_attribute_values ac ON ac.product_id = p.id AND ac.attribute_id = v_a_acab AND public.fn_cat_chave_opcao(ac.value_text) = 'frost plus'
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs)
    AND p.sku ~ ('-' || v_cromo_sigla || '-');
  IF v_n <> 227 THEN RAISE EXCEPTION 'FALHOU: passo 4 — % Resguardos com CROMO + Frost Plus (esperados 227).', v_n; END IF;

  -- 6. SKUs: únicos, formato, recalculados; os Cromado acabam no segmento do Cromado e sem o da Cor CROMO
  SELECT count(*) INTO v_n FROM (SELECT p.sku FROM products p WHERE p.organization_id = c_org GROUP BY p.sku HAVING count(*) > 1) d;
  SELECT count(*) INTO v_m FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs)
    AND (p.sku ~ '^CAT-' OR NOT p.sku_gerado OR p.sku !~ '^[A-Z0-9]+-[A-Z0-9]+-[0-9]{4}(-[A-Z0-9]+){0,5}$');
  SELECT count(*) INTO v_k FROM products p
  JOIN product_attribute_values ac ON ac.product_id = p.id AND ac.attribute_id = v_a_acab AND ac.value_text = v_cromado
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs)
    AND (p.sku !~ ('-' || v_cromado_sigla || '$') OR p.sku ~ ('-' || v_cromo_sigla || '(-|$)'));
  IF v_n > 0 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 6 — % SKUs repetidos na Mudelar; % fora do formato/provisórios; % Cromado com o SKU errado.', v_n, v_m, v_k;
  END IF;
  SELECT count(*), string_agg(y.sku || ' ≠ ' || coalesce(y.calc, 'null'), '; ') FILTER (WHERE y.k <= 5) INTO v_n, v_txt
  FROM (SELECT x.sku, x.calc, row_number() OVER (ORDER BY x.sku) AS k FROM (
          SELECT p.sku, pt ->> 'faltas' AS faltas, (pt ->> 'prefixo') AS prefixo,
                 concat_ws('-', pt ->> 'prefixo', lpad(public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id)::text, 4, '0'),
                           pt ->> 'resto') AS calc
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
          WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs)
            AND EXISTS (SELECT 1 FROM product_attribute_values ac WHERE ac.product_id = p.id AND ac.attribute_id = v_a_acab
                        AND ac.value_text IN (v_cromado, v_escovado))) x
        WHERE x.calc IS DISTINCT FROM x.sku OR x.prefixo IS NULL OR x.faltas <> '[]') y;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 6 — % SKUs diferentes do recalculado (ex.: %).', v_n, v_txt; END IF;
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    v_n := 0;
    FOR r IN SELECT p.id, p.sku, p.category_id, p.subcategory_id, p.model_id FROM products p
             JOIN product_attribute_values ac ON ac.product_id = p.id AND ac.attribute_id = v_a_acab AND ac.value_text IN (v_cromado, v_escovado)
             WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs)
             ORDER BY random() LIMIT 25 LOOP
      SELECT coalesce(jsonb_agg(CASE WHEN a.is_measurement THEN jsonb_build_object('atributo', v.attribute_id, 'medida', v.value_json)
                                     ELSE jsonb_build_object('atributo', v.attribute_id, 'opcao', o.id) END), '[]'::jsonb) INTO v_attrs
      FROM product_attribute_values v JOIN product_attributes a ON a.id = v.attribute_id
      LEFT JOIN attribute_option_group_values o
        ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(v.attribute_id, c_org) AND o.value_text = v.value_text
      WHERE v.product_id = r.id;
      v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.id);
      IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
        RAISE EXCEPTION 'FALHOU: passo 6 — cat_prever_sku_modelo dá % para o SKU %.', v_prev, r.sku;
      END IF;
      v_n := v_n + 1;
    END LOOP;
    IF v_n <> 25 THEN RAISE EXCEPTION 'FALHOU: passo 6 — só % comparados com cat_prever_sku_modelo.', v_n; END IF;
  END IF;

  -- 7. ligações a fornecedor dos Cromado/Escovado das 11: nenhuma com um SKU do Catálogo que não seja o do produto
  SELECT count(*) FILTER (WHERE i.supplier_sku ~ '^[A-Z0-9]+-[A-Z0-9]+-[0-9]{4}' AND i.supplier_sku <> p.sku),
         count(*) FILTER (WHERE i.supplier_sku = p.sku)
    INTO v_n, v_m
  FROM products p
  JOIN product_attribute_values ac ON ac.product_id = p.id AND ac.attribute_id = v_a_acab AND ac.value_text IN (v_cromado, v_escovado)
  JOIN item_suppliers i ON i.product_id = p.id AND i.deleted_at IS NULL
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs);
  IF v_n > 0 OR v_m <> 41 THEN
    RAISE EXCEPTION 'FALHOU: passo 7 — % ligações com um SKU que não é o do produto; % com o SKU do produto (esperadas 41).', v_n, v_m;
  END IF;

  -- 8. a auditoria
  IF NOT EXISTS (SELECT 1 FROM entity_audit_log e WHERE e.organization_id = c_org AND e.source = 'migration:catalogo_acabamento_cromado'
                 AND e.table_name = 'products') THEN
    RAISE EXCEPTION 'FALHOU: passo 8 — falta a linha da auditoria da migration.';
  END IF;

  RAISE NOTICE 'OK: catalogo_acabamento_cromado — 796 Cromo passaram a Acabamento % (%), WATER BLISS Rosa Gold + Escovado, 227 Frost Plus intactos, SKUs conferidos.',
    v_cromado, v_cromado_sigla;
END $t$;

ROLLBACK;
