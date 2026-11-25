-- =============================================================================
-- Catálogo — MUDELAR: apagar os atributos sem produtos («Brilho», «Tipo de grelha») e ligar a «Tonalidade» ao 3D.
-- Base de RH (uetjghdkwbywbftedtth). DADOS: 2 atributos apagados por SOFT DELETE (deleted_at), 1 atributo com
-- has_aspect, 3 opções com superficie. Sem DDL, sem funções novas (por isso sem REVOKE/GRANT), sem INSERT nas tabelas,
-- sem DELETE, sem tocar em products nem em valores de produto.
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). Os ids foram lidos só na RH a 25/11/2026. Na base principal (Mudelar
-- !!! de produção, clientes reais) estes ids não existem e a migration sai com RAISE NOTICE sem escrever nada. Antes do
-- !!! `db push`, confirmar o projeto ligado (supabase/.temp/project-ref).
--
-- NÃO DEPENDE DE CÓDIGO NOVO: as leituras (cat_ler_atributos, cat_ler_atributos_gestao, cat_ler_atributos_definicoes,
-- cat_ler_atributos_produto, cat_ler_config_3d, SKU) já filtram `deleted_at IS NULL`; o 3D (planta3d/aspetoZonas.ts)
-- já reconhece a «Tonalidade» pelo código quando tem «Tem aspeto» ligado e não depende do atributo «Brilho» existir.
--
-- Decisão do dono (25/11): «apagar todos os atributos que não têm produtos ligados»; a Tonalidade tem de afectar o 3D
-- (a superfície do atributo Brilho/Tonalidade do produto vale mais do que a da opção do acabamento).
-- =============================================================================
--
-- PORQUÊ SOFT DELETE: product_attributes tem deleted_at/deleted_by e é assim que a própria aplicação apaga um atributo
-- (rpc_delete_product_attribute: só deleted_at/deleted_by, grupos e opções intactos) e o repõe
-- (rpc_restore_product_attribute: só limpa deleted_at). Os grupos e as opções destes 2 atributos ficam por isso como
-- estão (is_active incluído): deixam de ser alcançáveis porque todas as leituras chegam a eles pelo atributo, e o
-- «Restaurar» da aplicação devolve o atributo inteiro. Apagar fisicamente levaria em cascata grupos, opções, paletas e
-- preços (FKs ON DELETE CASCADE) e não teria volta pela aplicação.
--
-- O que faz (organização Mudelar 3242e925-…):
--   A. deleted_at = now() nos 2 atributos com 0 produtos: «Brilho» (brilho, f8caabe2-…, grupo c91cfa63-…, opções
--      NATURAL e POLIDO) e «Tipo de grelha» (tipo_grelha, e4367ab0-…, grupo 6984951e-…, opções INOX e Ñ COR).
--      deleted_by fica NULL (não há utilizador de negócio numa migration).
--   B. has_aspect = true na «Tonalidade» (tonalidade, af171aa4-…, grupo em uso 17ab62b0-…) e a superfície por omissão
--      das suas 3 opções, is_metal false: BRILHO = polida, MATE = mate, ESCOVADO = mate.
--
-- Referências procuradas (lido no remoto RH a 25/11/2026, só SELECT; todas 0 para os 2 atributos, os 2 grupos e as 4
-- opções): FKs reais por pg_constraint para product_attributes (attribute_option_groups, category_attributes,
-- category_attribute_palettes, product_attribute_values, product_attribute_value_prices,
-- product_attribute_price_ranges, product_config_slots, product_family_axes) e para attribute_option_groups
-- (attribute_option_group_values, category_attribute_palettes.base_group_id); colunas sem FK
-- (product_attribute_organizations.attribute_id, product_config_slot_options.attribute_value_id,
-- ops_ordem_tarefa_medicao.opcao_id); e os ids por texto nos JSON (cat_config_3d.ligacoes/eixos,
-- category_attribute_palettes.additional_values/excluded_values, product_config_slots/_slot_options.metadata,
-- product_config_rules, product_codes.context, quote_lines/purchase_order_items.selected_attributes,
-- quote_template_items.default_attributes, product_attribute_values.value_json, product_attributes.options/
-- allowed_values, ops_obra_tarefa, ops_obra_servico_tarefa). A guarda G2 repete-as todas e aborta se alguma existir.
--
-- Âmbito (inerte, RAISE NOTICE e sai): a organização Mudelar não existe nesta base, ou nenhum dos 3 atributos existe
-- nela. Falha (RAISE EXCEPTION, nada fica): um atributo não é o lido; alguma referência existe; alguma opção da
-- Tonalidade não é a lida ou já tem aspeto; estado a meio. Idempotente: tudo no estado final sai por NOTICE.
--
-- Efeitos laterais: triggers de auditoria (2 + 1 + 3 linhas, app.audit_source = 'migration:limpeza_atributos_tonalidade')
-- e updated_at nas linhas mexidas. trg_cat_sku_ordem só actua com sku_ordem NULL (não é o caso). O SKU dos produtos não
-- muda (os 2 atributos não têm produtos; a sigla da Tonalidade não se toca). As posições 14 e 15 da ordem do SKU ficam
-- livres (sem efeito: o SKU lê os atributos vivos por ordem).
--
-- REVERSÃO: fora da pasta das migrations (não se guarda aqui: estar aqui é ser aplicada).
--
-- ORDEM: depois da A (20270126400000) e da C2 (20270126440000). `supabase db push` aplica TUDO o que estiver pendente
-- (a 25/11 20270126420000 e 20270126500000 estavam por aplicar no remoto, e 20270126600000/700000 já aplicadas):
-- listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '2min';

DO $mig$
DECLARE
  c_org         constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte       constant text := 'migration:limpeza_atributos_tonalidade';
  -- A: os 2 atributos a apagar e os seus grupos (ids fixos)
  c_brilho      constant uuid := 'f8caabe2-8622-4457-90a8-47f28c6bd9d8';
  c_grelha      constant uuid := 'e4367ab0-9817-4474-a8e8-81665fad8a2a';
  c_g_brilho    constant uuid := 'c91cfa63-438b-4452-8591-a89a1d891a28';
  c_g_grelha    constant uuid := '6984951e-e003-494d-8762-32b2c69a3bb8';
  -- B: a Tonalidade e o seu grupo em uso
  c_tonalidade  constant uuid := 'af171aa4-98a6-41b8-804c-470570d8ce0e';
  c_g_ton       constant uuid := '17ab62b0-5fd1-46f7-87a4-9844f51170d2';
  v_n bigint; v_m bigint; v_k bigint; v_txt text;
  v_h_atr text; v_h_grp text; v_h_opc text; v_n_apagados bigint;
BEGIN
  -- ─── 0. Âmbito (inerte) ───────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'limpeza_atributos_tonalidade: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM product_attributes a
  WHERE a.id IN (c_brilho, c_grelha, c_tonalidade) AND a.organization_id = c_org;
  IF v_n = 0 THEN
    RAISE NOTICE 'limpeza_atributos_tonalidade: os atributos lidos na RH não existem aqui — nada a fazer.';
    RETURN;
  END IF;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'limpeza_atributos_tonalidade: só % dos 3 atributos existem na Mudelar. Rever antes de aplicar.', v_n;
  END IF;

  -- os 3 atributos ficam presos até ao fim, por ordem fixa (o mesmo que as RPCs de aspeto prendem)
  PERFORM 1 FROM product_attributes a WHERE a.id IN (c_brilho, c_grelha, c_tonalidade) ORDER BY a.id FOR NO KEY UPDATE;

  DROP TABLE IF EXISTS pg_temp._lt_apagar, pg_temp._lt_ids, pg_temp._lt_ton, pg_temp._lt_antes;
  -- os 2 atributos a apagar: código, nome e grupo lidos
  CREATE TEMP TABLE _lt_apagar (id uuid PRIMARY KEY, code text NOT NULL, label text NOT NULL, grupo uuid NOT NULL) ON COMMIT DROP;
  INSERT INTO _lt_apagar VALUES
    (c_brilho, 'brilho',      'Brilho',         c_g_brilho),
    (c_grelha, 'tipo_grelha', 'Tipo de grelha', c_g_grelha);
  -- as 3 opções da Tonalidade: id, value_text exacto, superfície por omissão
  CREATE TEMP TABLE _lt_ton (id uuid PRIMARY KEY, value_text text NOT NULL, superficie text NOT NULL) ON COMMIT DROP;
  INSERT INTO _lt_ton VALUES
    ('6ecc970f-327f-4717-8ff9-05250aee5ae8', 'BRILHO',   'polida'),
    ('d4ee3620-d258-4e36-8a9d-6cb95eae37cd', 'MATE',     'mate'),
    ('96ee7df1-13a2-4503-a236-0bc21a0ae6ad', 'ESCOVADO', 'mate');

  -- ─── 1. Guardas: o estado é o lido ────────────────────────────────────────────────
  -- G0: os 2 atributos a apagar são os lidos (código, nome, não medida, 1 grupo próprio da Mudelar com 2 opções)
  SELECT count(*) INTO v_n FROM _lt_apagar e JOIN product_attributes a ON a.id = e.id
  WHERE a.organization_id = c_org AND a.code = e.code AND a.label::text = e.label AND NOT a.is_measurement
    AND EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = e.grupo AND g.attribute_id = e.id AND g.organization_id = c_org)
    AND (SELECT count(*) FROM attribute_option_groups g WHERE g.attribute_id = e.id) = 1
    AND (SELECT count(DISTINCT o.id) FROM attribute_option_group_values o WHERE o.group_id = e.grupo) = 2;
  IF v_n <> 2 THEN
    SELECT string_agg(e.code || ': ' || coalesce(a.code, '(sem linha)') || ' / ' || coalesce(a.label::text, '-'), '; ')
      INTO v_txt FROM _lt_apagar e LEFT JOIN product_attributes a ON a.id = e.id;
    RAISE EXCEPTION 'G0: só % dos 2 atributos a apagar são os lidos (código, nome, não medida, 1 grupo da Mudelar com 2 opções): %.', v_n, v_txt;
  END IF;

  -- G1: a Tonalidade é a lida e o seu grupo em uso é o da Mudelar; as 3 opções são as lidas e são as únicas do grupo
  IF NOT EXISTS (SELECT 1 FROM product_attributes a WHERE a.id = c_tonalidade AND a.organization_id = c_org
                 AND a.code = 'tonalidade' AND a.deleted_at IS NULL AND NOT a.is_measurement
                 AND public.fn_cat_grupo_do_atributo(a.id, c_org) = c_g_ton)
     OR NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = c_g_ton AND g.organization_id = c_org) THEN
    RAISE EXCEPTION 'G1: a «Tonalidade» (%) não é a lida (código, viva, não medida, grupo em uso % da Mudelar). Rever.', c_tonalidade, c_g_ton;
  END IF;
  SELECT count(DISTINCT o.id) INTO v_n FROM _lt_ton t
  JOIN attribute_option_group_values o ON o.id = t.id AND o.group_id = c_g_ton AND o.value_text::text = t.value_text;
  SELECT count(DISTINCT o.id) INTO v_m FROM attribute_option_group_values o WHERE o.group_id = c_g_ton;
  IF v_n <> 3 OR v_m <> 3 THEN
    RAISE EXCEPTION 'G1: só % das 3 opções da Tonalidade são as lidas, e o grupo tem % opções (esperadas 3 e 3).', v_n, v_m;
  END IF;
  SELECT count(*) INTO v_n FROM attribute_option_group_values o
  WHERE o.id IN (SELECT t.id FROM _lt_ton t) AND o.is_metal;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'G1: % opções da Tonalidade estão marcadas como metal (esperado 0). Rever.', v_n;
  END IF;

  -- G2: nada referencia os 2 atributos, os seus grupos ou as suas opções
  CREATE TEMP TABLE _lt_ids (u text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _lt_ids SELECT e.id::text FROM _lt_apagar e;
  INSERT INTO _lt_ids SELECT e.grupo::text FROM _lt_apagar e;
  INSERT INTO _lt_ids SELECT o.id::text FROM attribute_option_group_values o WHERE o.group_id IN (c_g_brilho, c_g_grelha);
  SELECT count(*) INTO v_n FROM _lt_ids;
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'G2: % ids a procurar (esperados 8: 2 atributos, 2 grupos, 4 opções).', v_n;
  END IF;

  SELECT string_agg(r.t || ' ' || r.n::text, ', ') INTO v_txt FROM (
              SELECT 'product_attribute_values' t, count(*) n FROM product_attribute_values x WHERE x.attribute_id IN (c_brilho, c_grelha)
    UNION ALL SELECT 'product_attribute_value_prices', count(*) FROM product_attribute_value_prices x WHERE x.attribute_id IN (c_brilho, c_grelha)
    UNION ALL SELECT 'product_attribute_price_ranges', count(*) FROM product_attribute_price_ranges x WHERE x.attribute_id IN (c_brilho, c_grelha)
    UNION ALL SELECT 'product_attribute_organizations', count(*) FROM product_attribute_organizations x WHERE x.attribute_id IN (c_brilho, c_grelha)
    UNION ALL SELECT 'category_attributes', count(*) FROM category_attributes x WHERE x.attribute_id IN (c_brilho, c_grelha)
    UNION ALL SELECT 'category_attribute_palettes', count(*) FROM category_attribute_palettes x
              WHERE x.attribute_id IN (c_brilho, c_grelha) OR x.base_group_id IN (c_g_brilho, c_g_grelha)
                 OR EXISTS (SELECT 1 FROM _lt_ids i WHERE coalesce(x.additional_values::text, '') || coalesce(x.excluded_values::text, '') LIKE '%' || i.u || '%')
    UNION ALL SELECT 'product_family_axes', count(*) FROM product_family_axes x WHERE x.attribute_id IN (c_brilho, c_grelha)
    UNION ALL SELECT 'product_config_slots', count(*) FROM product_config_slots x
              WHERE x.attribute_id IN (c_brilho, c_grelha) OR EXISTS (SELECT 1 FROM _lt_ids i WHERE coalesce(x.metadata::text, '') LIKE '%' || i.u || '%')
    UNION ALL SELECT 'product_config_slot_options', count(*) FROM product_config_slot_options x
              WHERE x.attribute_value_id::text IN (SELECT i.u FROM _lt_ids i)
                 OR EXISTS (SELECT 1 FROM _lt_ids i WHERE coalesce(x.metadata::text, '') LIKE '%' || i.u || '%')
    UNION ALL SELECT 'product_config_rules', count(*) FROM product_config_rules x WHERE EXISTS (SELECT 1 FROM _lt_ids i WHERE to_jsonb(x)::text LIKE '%' || i.u || '%')
    UNION ALL SELECT 'product_codes', count(*) FROM product_codes x WHERE EXISTS (SELECT 1 FROM _lt_ids i WHERE coalesce(x.context::text, '') LIKE '%' || i.u || '%')
    UNION ALL SELECT 'cat_config_3d', count(*) FROM cat_config_3d x
              WHERE EXISTS (SELECT 1 FROM _lt_ids i WHERE coalesce(x.ligacoes::text, '') || coalesce(x.eixos::text, '') LIKE '%' || i.u || '%')
    UNION ALL SELECT 'quote_lines', count(*) FROM quote_lines x
              WHERE EXISTS (SELECT 1 FROM _lt_ids i WHERE coalesce(x.selected_attributes::text, '') LIKE '%' || i.u || '%')
    UNION ALL SELECT 'purchase_order_items', count(*) FROM purchase_order_items x
              WHERE EXISTS (SELECT 1 FROM _lt_ids i WHERE coalesce(x.selected_attributes::text, '') LIKE '%' || i.u || '%')
    UNION ALL SELECT 'quote_template_items', count(*) FROM quote_template_items x
              WHERE EXISTS (SELECT 1 FROM _lt_ids i WHERE coalesce(x.default_attributes::text, '') LIKE '%' || i.u || '%')
    UNION ALL SELECT 'product_attribute_values.value_json', count(*) FROM product_attribute_values x
              WHERE EXISTS (SELECT 1 FROM _lt_ids i WHERE coalesce(x.value_json::text, '') LIKE '%' || i.u || '%')
    UNION ALL SELECT 'product_attributes.options', count(*) FROM product_attributes x
              WHERE EXISTS (SELECT 1 FROM _lt_ids i WHERE coalesce(x.options::text, '') || coalesce(x.allowed_values::text, '') LIKE '%' || i.u || '%')
    UNION ALL SELECT 'ops_ordem_tarefa_medicao', count(*) FROM ops_ordem_tarefa_medicao x WHERE x.opcao_id::text IN (SELECT i.u FROM _lt_ids i)
    UNION ALL SELECT 'ops_obra_tarefa', count(*) FROM ops_obra_tarefa x
              WHERE EXISTS (SELECT 1 FROM _lt_ids i WHERE coalesce(x.materiais_crm::text, '') || coalesce(x.fatores::text, '') LIKE '%' || i.u || '%')
    UNION ALL SELECT 'ops_obra_servico_tarefa', count(*) FROM ops_obra_servico_tarefa x
              WHERE EXISTS (SELECT 1 FROM _lt_ids i WHERE coalesce(x.condicao::text, '') || coalesce(x.encaixe::text, '') LIKE '%' || i.u || '%')
  ) r WHERE r.n > 0;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'G2: os atributos a apagar ainda são referenciados (%). Nada se apaga: rever.', v_txt;
  END IF;

  -- G3: já aplicada? a meio?
  SELECT count(*) INTO v_n FROM product_attributes a WHERE a.id IN (c_brilho, c_grelha) AND a.deleted_at IS NOT NULL;
  SELECT count(*) INTO v_m FROM product_attributes a WHERE a.id = c_tonalidade AND a.has_aspect;
  SELECT count(*) INTO v_k FROM _lt_ton t JOIN attribute_option_group_values o ON o.id = t.id
  WHERE o.superficie IS NOT DISTINCT FROM t.superficie;
  IF v_n = 2 AND v_m = 1 AND v_k = 3 THEN
    RAISE NOTICE 'limpeza_atributos_tonalidade: já aplicada (2 atributos apagados, Tonalidade com aspeto e 3 superfícies) — nada a fazer.';
    RETURN;
  END IF;
  SELECT count(*) INTO v_k FROM _lt_ton t JOIN attribute_option_group_values o ON o.id = t.id WHERE o.superficie IS NULL;
  IF v_n <> 0 OR v_m <> 0 OR v_k <> 3 THEN
    RAISE EXCEPTION 'limpeza_atributos_tonalidade: estado a meio (% de 2 apagados, Tonalidade com aspeto: %, % de 3 opções sem superfície). Não se completa às cegas: rever.',
      v_n, v_m, v_k;
  END IF;

  -- ─── 2. Fotografia antes (toda a base) ────────────────────────────────────────────
  -- os atributos que não são estes 3, todos os grupos, e as opções que não são as 3 da Tonalidade: têm de ficar iguais
  SELECT md5(coalesce(string_agg(to_jsonb(a)::text, '|' ORDER BY a.id), '')) INTO v_h_atr
  FROM product_attributes a WHERE a.id NOT IN (c_brilho, c_grelha, c_tonalidade);
  SELECT md5(coalesce(string_agg(to_jsonb(g)::text, '|' ORDER BY g.id), '')) INTO v_h_grp FROM attribute_option_groups g;
  SELECT md5(coalesce(string_agg(to_jsonb(o)::text, '|' ORDER BY o.id), '')) INTO v_h_opc
  FROM attribute_option_group_values o WHERE o.id NOT IN (SELECT t.id FROM _lt_ton t);
  SELECT count(*) INTO v_n_apagados FROM product_attributes a WHERE a.deleted_at IS NOT NULL;
  CREATE TEMP TABLE _lt_antes ON COMMIT DROP AS
    SELECT a.id, 'atributo'::text AS k, to_jsonb(a) - 'deleted_at' - 'has_aspect' - 'updated_at' AS j
    FROM product_attributes a WHERE a.id IN (c_brilho, c_grelha, c_tonalidade)
    UNION ALL
    SELECT o.id, 'opcao'::text, to_jsonb(o) - 'superficie' - 'updated_at'
    FROM attribute_option_group_values o WHERE o.id IN (SELECT t.id FROM _lt_ton t);

  PERFORM set_config('app.audit_source', c_fonte, true);

  -- ─── 3. Escrever ──────────────────────────────────────────────────────────────────
  -- A: soft delete, como rpc_delete_product_attribute (grupos e opções ficam, para o «Restaurar» os devolver)
  UPDATE product_attributes a SET deleted_at = now(), deleted_by = NULL
  WHERE a.id IN (c_brilho, c_grelha) AND a.organization_id = c_org AND a.deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 2 THEN RAISE EXCEPTION 'limpeza_atributos_tonalidade: % atributos apagados em vez de 2.', v_n; END IF;

  -- B: a Tonalidade com aspeto e a superfície das 3 opções (não metal)
  UPDATE product_attributes a SET has_aspect = true
  WHERE a.id = c_tonalidade AND a.organization_id = c_org AND NOT a.has_aspect AND NOT a.is_measurement AND a.deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'limpeza_atributos_tonalidade: % atributos Tonalidade ligados em vez de 1.', v_n; END IF;

  UPDATE attribute_option_group_values o SET superficie = t.superficie, is_metal = false
  FROM _lt_ton t
  WHERE o.id = t.id AND o.group_id = c_g_ton AND o.value_text::text = t.value_text AND NOT o.is_metal AND o.superficie IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 3 THEN RAISE EXCEPTION 'limpeza_atributos_tonalidade: % opções da Tonalidade com superfície em vez de 3.', v_n; END IF;

  -- ─── 4. Conferir ──────────────────────────────────────────────────────────────────
  -- C1: exactamente estes 2 apagados (na base toda, mais 2 do que antes)
  SELECT count(*) INTO v_n FROM product_attributes a WHERE a.id IN (c_brilho, c_grelha) AND a.deleted_at IS NOT NULL;
  SELECT count(*) INTO v_m FROM product_attributes a WHERE a.deleted_at IS NOT NULL;
  IF v_n <> 2 OR v_m <> v_n_apagados + 2 THEN
    RAISE EXCEPTION 'C1: % de 2 apagados; % apagados na base (antes %, esperado mais 2).', v_n, v_m, v_n_apagados;
  END IF;

  -- C2: a Tonalidade com aspeto e as 3 superfícies certas (1 polida, 2 mate), não metal, distintas
  SELECT count(DISTINCT o.id), count(DISTINCT o.id) FILTER (WHERE o.superficie = 'polida'), count(DISTINCT o.id) FILTER (WHERE o.superficie = 'mate')
    INTO v_n, v_m, v_k
  FROM _lt_ton t JOIN attribute_option_group_values o ON o.id = t.id
  WHERE o.superficie = t.superficie AND NOT o.is_metal AND o.group_id = c_g_ton;
  IF v_n <> 3 OR v_m <> 1 OR v_k <> 2
     OR NOT EXISTS (SELECT 1 FROM product_attributes a WHERE a.id = c_tonalidade AND a.has_aspect AND a.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'C2: % de 3 opções da Tonalidade com a superfície certa (% polida, % mate; esperadas 1 e 2), ou a Tonalidade sem aspeto.', v_n, v_m, v_k;
  END IF;

  -- C3: nas linhas mexidas só mudou o que se queria
  SELECT count(*) INTO v_n FROM _lt_antes b JOIN product_attributes a ON a.id = b.id
  WHERE b.k = 'atributo' AND (to_jsonb(a) - 'deleted_at' - 'has_aspect' - 'updated_at') <> b.j;
  SELECT count(*) INTO v_m FROM _lt_antes b JOIN attribute_option_group_values o ON o.id = b.id
  WHERE b.k = 'opcao' AND (to_jsonb(o) - 'superficie' - 'updated_at') <> b.j;
  IF v_n > 0 OR v_m > 0 THEN
    RAISE EXCEPTION 'C3: % atributos e % opções mexidos mudaram além do pretendido (esperado 0 e 0).', v_n, v_m;
  END IF;

  -- C4: fora do âmbito (toda a base), nada mudou: os outros atributos, todos os grupos, as outras opções
  SELECT md5(coalesce(string_agg(to_jsonb(a)::text, '|' ORDER BY a.id), '')) INTO v_txt
  FROM product_attributes a WHERE a.id NOT IN (c_brilho, c_grelha, c_tonalidade);
  IF v_txt IS DISTINCT FROM v_h_atr THEN RAISE EXCEPTION 'C4: fora do âmbito, os outros atributos mudaram.'; END IF;
  SELECT md5(coalesce(string_agg(to_jsonb(g)::text, '|' ORDER BY g.id), '')) INTO v_txt FROM attribute_option_groups g;
  IF v_txt IS DISTINCT FROM v_h_grp THEN RAISE EXCEPTION 'C4: fora do âmbito, os grupos de opções mudaram.'; END IF;
  SELECT md5(coalesce(string_agg(to_jsonb(o)::text, '|' ORDER BY o.id), '')) INTO v_txt
  FROM attribute_option_group_values o WHERE o.id NOT IN (SELECT t.id FROM _lt_ton t);
  IF v_txt IS DISTINCT FROM v_h_opc THEN RAISE EXCEPTION 'C4: fora do âmbito, as outras opções mudaram.'; END IF;

  RAISE NOTICE 'limpeza_atributos_tonalidade: «Brilho» e «Tipo de grelha» apagados (soft delete); Tonalidade com aspeto (BRILHO polida, MATE e ESCOVADO mate). Conferido.';
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
