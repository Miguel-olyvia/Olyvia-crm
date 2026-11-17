-- =============================================================================
-- Catálogo — LAVA-LOUÇAS & CUBAS da MUDELAR: de um modelo por produto para 10 modelos, com a LARGURA como atributo
-- de lista e a cor Negro nos dois AMBAR «N». Base de RH (uetjghdkwbywbftedtth). Não cria nem apaga produtos.
-- Dados por linha: «Lava Louça e Cubas_organizado.xlsx» (colunas SKU antigo, Modelo, Largura (cm), Cor).
-- =============================================================================
--
-- Antes (20270118900000): 32 produtos, 32 modelos (um por produto, com o NNNN do SKU antigo), SKU LLC-SUB-NNNN, sem
-- atributos. Cada produto liga-se à sua linha pelo NOME e pelo NÚMERO do modelo atual (= o NNNN do SKU antigo).
--
-- Decisões (17/11):
--   1. Modelos. Para cada modelo novo fica a linha de product_models com o MENOR número entre as dos seus produtos,
--      renomeada; as outras ficam apagadas (deleted_at; a app não tem caminho para apagar modelos) e os números delas
--      ficam retirados (o índice único conta os apagados). Os números que ficam:
--        Cubas compósito: AMBAR 0001.
--        Cubas inox: LODY PVD 0001, KERAN 0004, VELAR 0008, UNA 0013, BRASILIA 0015, BAHIA 0016, LAGUNA 0017,
--                    BELÉM 0018, DUO 0019.
--      Ordem: mudar o modelo dos produtos → apagar os outros → renomear (o nome é único entre os vivos).
--   2. Largura. Atributo de LISTA «Largura» da Mudelar (a medida exige 2D), código largura, com as opções 34, 38, 40, 45,
--      50, 55, 57, 60, 70, 75, 80, 86, 100, 105, 116, sigla = o número. Entra no SKU no fim da ordem (sku_ordem = a
--      maior + 1, sku_entra). Largura por produto = a coluna do Excel: BELÉM 50 e BRASILIA 38 (do fornecedor), VELAR 70
--      fica 70 (o fornecedor diz 71); BAHIA e LAGUNA sem largura. A linha LEMIS não existe na base: fica de fora.
--      São 30 produtos com largura (32 menos BAHIA e LAGUNA).
--   3. Cor. Os dois AMBAR «N» (LLCCC0006 = 40 N, LLCCC0012 = 50 N) levam a Cor NEGRO, a opção que a Mudelar já tem no
--      grupo da Cor (sigla NG, lida a 17/11). Se faltar, cria-se com uma sigla livre e o NOTICE diz qual. Os outros
--      produtos não levam cor.
--   4. Os nomes dos produtos não mudam; muda o model_id.
--   5. SKU de novo para os 32, pela regra do Catálogo (a de cat_gerar_sku_produto, feita set-based: fn_cat_sku_partes
--      sobre o que ficou gravado + o número do modelo): LLC-SUB-NNNN[-NG][-largura], ex. LLC-CC-0001-NG-40,
--      LLC-CI-0016 (BAHIA). Cor antes da largura (sku_ordem 1).
--   6. supplier_sku (decisão de 17/11): nas ligações a fornecedor cujo supplier_sku é o SKU atual do próprio produto (os
--      13 sem código de fornecedor: 10 AMBAR e 3 LODY PVD) passa a ser o SKU NOVO. Quem tem código de fornecedor real
--      não muda.
--   * Auditoria normal, linha a linha, com app.audit_source = 'migration:lava_loucas_modelos_largura'.
--
-- GUARDA (inerte: RAISE NOTICE e sai sem escrever) se: a organização 3242e925-… não existir com o nome 'Mudelar';
-- faltar a versão dos modelos (20270118300000); faltar «Lava-louças & Cubas» ou uma das 2 subcategorias; ou já estiver
-- aplicada (atributo Largura e os 10 modelos vivos, com os nomes e números de cima).
-- Falha (RAISE EXCEPTION, nada fica) se o estado não for o de 20270118900000 (32 produtos vivos, cada um com a sua linha
-- e o seu modelo; só esses 32 modelos; nenhum atributo nos produtos); se já houver um atributo «Largura» sem os 10
-- modelos; se o menor número de um modelo novo não for o de cima; se faltar o atributo cor ou o membro para
-- created_by; se o SKU calculado não for o esperado, tiver faltas ou repetir outro produto da Mudelar.
--
-- Conferir no fim (conta o que está ERRADO e faz RAISE se não for 0): 10 modelos vivos com nome e número, 22 apagados
-- nesta transação, 32 linhas nas subcategorias; 32 produtos com o modelo certo e o nome de sempre; 30 com a largura
-- certa, 2 com NEGRO e nenhum outro valor; SKUs únicos, no formato, iguais ao esperado, ao recalculado e a
-- cat_prever_sku_modelo; o atributo Largura (lista, entra, último na ordem, 15 opções com sigla = número); 13 ligações a
-- fornecedor com o SKU novo e as outras intactas; preços intactos; nada escrito fora da Mudelar nem noutros produtos, modelos ou atributos dela (xmin);
-- amostra de SKUs de Duche & Banho, Loiças e Acessórios intacta.
--
-- ORDEM: depois de 20270118900000. Teste: supabase/tests/catalogo_lava_loucas_modelos_largura.test.sql (BEGIN …
-- ROLLBACK, só leitura; o passo 0 falha antes). Depois deste push o teste de 20270118900000 (32 modelos, SKU sem
-- largura) deixa de passar — é esperado. ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver
-- pendente; listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '5min';

DO $mig$
DECLARE
  c_org         constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte       constant text    := 'migration:lava_loucas_modelos_largura';
  c_total       constant integer := 32;
  c_n_modelos   constant integer := 10;
  c_n_larguras  constant integer := 30;
  c_n_negro     constant integer := 2;
  c_n_opcoes    constant integer := 15;
  c_n_forn_sku  constant integer := 13;
  c_cat_nome    constant text    := 'Lava-louças & Cubas';
  c_cat_sigla   constant text    := 'LLC';
  c_attr_nome   constant text    := 'Largura';
  c_cor_opcao   constant text    := 'NEGRO';
  c_max_atributos constant integer := 200;
  v_agora   timestamptz := clock_timestamp();
  v_n bigint; v_m bigint; v_k bigint; v_xid text; v_txt text; v_negro_criada text; v_ativa boolean;
  v_cat uuid; v_sub uuid; v_criador uuid; v_a_cor uuid; v_g_cor uuid; v_negro uuid; v_negro_valor text; v_negro_sigla text;
  v_a_larg uuid; v_g_larg uuid; v_code text; v_i integer; v_ordem integer; v_regex text;
  v_auth uuid; v_claims text; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  -- ─── 0. Guarda ────────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'lava_loucas_modelos_largura: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  IF to_regclass('public.product_models') IS NULL
     OR to_regprocedure('public.fn_cat_modelo_numero(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)') IS NULL THEN
    RAISE NOTICE 'lava_loucas_modelos_largura: falta a versão dos modelos (20270118300000) — nada a fazer.';
    RETURN;
  END IF;
  SELECT string_agg(s, ', ') INTO v_txt
  FROM unnest(ARRAY['public.fn_cat_chave_opcao(text)', 'public.fn_cat_grupo_do_atributo(uuid,uuid)',
                    'public.fn_cat_medida_ler(jsonb,text)', 'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)',
                    'public.fn_cat_sigla_opcao_livre(uuid,text,uuid)', 'public.has_anew_permission_in_org(uuid,text,uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'lava_loucas_modelos_largura: faltam funções do Catálogo (%).', v_txt; END IF;

  SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1] INTO v_n, v_cat
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(c_cat_nome);
  IF v_n = 0 THEN
    RAISE NOTICE 'lava_loucas_modelos_largura: a Mudelar não tem a categoria «%» — nada a fazer.', c_cat_nome;
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'lava_loucas_modelos_largura: há % categorias «%» na Mudelar.', v_n, c_cat_nome;
  END IF;

  -- ─── Os dados (Excel organizado) ──────────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._llml_subs, pg_temp._llml_modelos, pg_temp._llml_linhas, pg_temp._llml_larguras,
                       pg_temp._llml_antes, pg_temp._llml_amostra, pg_temp._llml_sku, pg_temp._llml_forn;

  CREATE TEMP TABLE _llml_subs (codigo text PRIMARY KEY, nome text NOT NULL, ordem integer NOT NULL, sub_id uuid) ON COMMIT DROP;
  INSERT INTO _llml_subs (codigo, nome, ordem) VALUES
    ('CC', 'Cubas compósito', 1),
    ('CI', 'Cubas inox', 2);

  -- os 10 modelos novos e o número que cada um guarda (o menor dos seus produtos)
  CREATE TEMP TABLE _llml_modelos (sub text NOT NULL, nome text NOT NULL, numero smallint NOT NULL, modelo_id uuid,
                                   PRIMARY KEY (sub, nome)) ON COMMIT DROP;
  INSERT INTO _llml_modelos (sub, nome, numero) VALUES
    ('CC', 'AMBAR', 1),
    ('CI', 'LODY PVD', 1),
    ('CI', 'KERAN', 4),
    ('CI', 'VELAR', 8),
    ('CI', 'UNA', 13),
    ('CI', 'BRASILIA', 15),
    ('CI', 'BAHIA', 16),
    ('CI', 'LAGUNA', 17),
    ('CI', 'BELÉM', 18),
    ('CI', 'DUO', 19);

  -- as 32 linhas: SKU antigo (o NNNN = número do modelo atual), subcategoria, nome do produto (não muda), modelo novo,
  -- largura (NULL = sem), cor (NULL = sem), SKU esperado
  CREATE TEMP TABLE _llml_linhas (sku_antigo text PRIMARY KEY, sub text NOT NULL, nome text NOT NULL, modelo text NOT NULL,
                                  largura text, cor text, sku_novo text NOT NULL,
                                  produto_id uuid, modelo_antigo_id uuid, modelo_novo_id uuid, sku_atual text) ON COMMIT DROP;
  INSERT INTO _llml_linhas (sku_antigo, sub, nome, modelo, largura, cor, sku_novo) VALUES
    ('LLCCC0001', 'CC', 'Lava-louças AMBAR 86 C/ESCORREDOR 1 CUBA', 'AMBAR', '86', NULL, 'LLC-CC-0001-86'),
    ('LLCCC0002', 'CC', 'Lava-louças AMBAR 100 C/ESCORREDOR 1 CUBA', 'AMBAR', '100', NULL, 'LLC-CC-0001-100'),
    ('LLCCC0003', 'CC', 'Lava-louças AMBAR 105 C/ESCORREDOR 2 CUBAS', 'AMBAR', '105', NULL, 'LLC-CC-0001-105'),
    ('LLCCC0004', 'CC', 'Lava-louças AMBAR 116 C/ESCORREDOR 2 CUBAS', 'AMBAR', '116', NULL, 'LLC-CC-0001-116'),
    ('LLCCC0005', 'CC', 'Lava-louças AMBAR 1 CUBA 40', 'AMBAR', '40', NULL, 'LLC-CC-0001-40'),
    ('LLCCC0006', 'CC', 'Lava-louças AMBAR 1 CUBA 40 N', 'AMBAR', '40', 'NEGRO', 'LLC-CC-0001-NG-40'),
    ('LLCCC0007', 'CC', 'Lava-louças AMBAR 1 CUBA 57', 'AMBAR', '57', NULL, 'LLC-CC-0001-57'),
    ('LLCCC0008', 'CC', 'Lava-louças AMBAR 1.5 CUBA 55', 'AMBAR', '55', NULL, 'LLC-CC-0001-55'),
    ('LLCCC0009', 'CC', 'Lava-louças AMBAR 1 CUBA 70', 'AMBAR', '70', NULL, 'LLC-CC-0001-70'),
    ('LLCCC0010', 'CC', 'Lava-louças AMBAR 1 CUBA 80', 'AMBAR', '80', NULL, 'LLC-CC-0001-80'),
    ('LLCCC0011', 'CC', 'Lava-louças AMBAR 1 CUBA 50', 'AMBAR', '50', NULL, 'LLC-CC-0001-50'),
    ('LLCCC0012', 'CC', 'Lava-louças AMBAR 1 CUBA 50 N', 'AMBAR', '50', 'NEGRO', 'LLC-CC-0001-NG-50'),
    ('LLCCI0001', 'CI', 'Lava-louças LODY PVD 1 CUBA 40', 'LODY PVD', '40', NULL, 'LLC-CI-0001-40'),
    ('LLCCI0002', 'CI', 'Lava-louças LODY PVD 1 CUBA 50', 'LODY PVD', '50', NULL, 'LLC-CI-0001-50'),
    ('LLCCI0003', 'CI', 'Lava-louças LODY PVD 1 CUBA 70', 'LODY PVD', '70', NULL, 'LLC-CI-0001-70'),
    ('LLCCI0004', 'CI', 'Lava-louças KERAN 80 C/ESCORREDOR 1 CUBA', 'KERAN', '80', NULL, 'LLC-CI-0004-80'),
    ('LLCCI0005', 'CI', 'Lava-louças KERAN 86 C/ESCORREDOR 1 CUBA', 'KERAN', '86', NULL, 'LLC-CI-0004-86'),
    ('LLCCI0006', 'CI', 'Lava-louças KERAN 100 C/ESCORREDOR 2 CUBAS', 'KERAN', '100', NULL, 'LLC-CI-0004-100'),
    ('LLCCI0007', 'CI', 'Lava-louças KERAN 116 C/ESCORREDOR 2 CUBAS', 'KERAN', '116', NULL, 'LLC-CI-0004-116'),
    ('LLCCI0008', 'CI', 'Lava-louças VELAR 1 CUBA 34', 'VELAR', '34', NULL, 'LLC-CI-0008-34'),
    ('LLCCI0009', 'CI', 'Lava-louças VELAR 1 CUBA 40', 'VELAR', '40', NULL, 'LLC-CI-0008-40'),
    ('LLCCI0010', 'CI', 'Lava-louças VELAR 1 CUBA 45', 'VELAR', '45', NULL, 'LLC-CI-0008-45'),
    ('LLCCI0011', 'CI', 'Lava-louças VELAR 1 CUBA 50', 'VELAR', '50', NULL, 'LLC-CI-0008-50'),
    ('LLCCI0012', 'CI', 'Lava-louças VELAR 1 CUBA 70', 'VELAR', '70', NULL, 'LLC-CI-0008-70'),
    ('LLCCI0013', 'CI', 'Lava-louças UNA 55 - 2 CUBAS', 'UNA', '55', NULL, 'LLC-CI-0013-55'),
    ('LLCCI0014', 'CI', 'Lava-louças UNA 75 - 2 CUBAS', 'UNA', '75', NULL, 'LLC-CI-0013-75'),
    ('LLCCI0015', 'CI', 'Lava-louças BRASILIA 1 CUBA', 'BRASILIA', '38', NULL, 'LLC-CI-0015-38'),
    ('LLCCI0016', 'CI', 'Lava-louças BAHIA 1 CUBA', 'BAHIA', NULL, NULL, 'LLC-CI-0016'),
    ('LLCCI0017', 'CI', 'Lava-louças LAGUNA 1 CUBA', 'LAGUNA', NULL, NULL, 'LLC-CI-0017'),
    ('LLCCI0018', 'CI', 'Lava-louças BELÉM 1 CUBA', 'BELÉM', '50', NULL, 'LLC-CI-0018-50'),
    ('LLCCI0019', 'CI', 'Lava-louças DUO 60 - 2 CUBAS', 'DUO', '60', NULL, 'LLC-CI-0019-60'),
    ('LLCCI0020', 'CI', 'Lava-louças DUO 80 - 2 CUBAS', 'DUO', '80', NULL, 'LLC-CI-0019-80');

  -- as opções da Largura, pela ordem do ecrã (sigla = o número)
  CREATE TEMP TABLE _llml_larguras (valor text PRIMARY KEY, ordem integer NOT NULL, opcao_id uuid) ON COMMIT DROP;
  INSERT INTO _llml_larguras (valor, ordem)
  SELECT x.v, x.o::integer FROM unnest(ARRAY['34', '38', '40', '45', '50', '55', '57', '60', '70', '75', '80', '86', '100', '105', '116'])
         WITH ORDINALITY AS x(v, o);

  -- os dados estão inteiros
  SELECT count(*), count(*) FILTER (WHERE l.largura IS NOT NULL), count(*) FILTER (WHERE l.cor IS NOT NULL),
         count(DISTINCT l.sku_novo)
    INTO v_n, v_m, v_k, v_i
  FROM _llml_linhas l;
  IF v_n <> c_total OR v_m <> c_n_larguras OR v_k <> c_n_negro OR v_i <> c_total THEN
    RAISE EXCEPTION 'lava_loucas_modelos_largura: os dados têm % linhas, % larguras, % cores, % SKUs distintos (esperados %, %, %, %).',
      v_n, v_m, v_k, v_i, c_total, c_n_larguras, c_n_negro, c_total;
  END IF;
  IF (SELECT count(*) FROM _llml_modelos) <> c_n_modelos OR (SELECT count(*) FROM _llml_larguras) <> c_n_opcoes
     OR EXISTS (SELECT 1 FROM _llml_linhas l WHERE NOT EXISTS (SELECT 1 FROM _llml_modelos m WHERE m.sub = l.sub AND m.nome = l.modelo))
     OR EXISTS (SELECT 1 FROM _llml_linhas l WHERE l.largura IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _llml_larguras x WHERE x.valor = l.largura))
     OR EXISTS (SELECT 1 FROM _llml_larguras x WHERE NOT EXISTS (SELECT 1 FROM _llml_linhas l WHERE l.largura = x.valor))
     OR EXISTS (SELECT 1 FROM _llml_linhas l WHERE l.cor IS NOT NULL AND l.cor <> c_cor_opcao)
     OR EXISTS (SELECT 1 FROM _llml_linhas l WHERE l.sku_antigo !~ ('^LLC' || l.sub || '[0-9]{4}$')) THEN
    RAISE EXCEPTION 'lava_loucas_modelos_largura: os dados têm modelos, larguras, cores ou SKUs antigos fora do esperado.';
  END IF;

  -- as subcategorias (filhas de «Lava-louças & Cubas», com as siglas CC e CI)
  FOR r IN SELECT s.codigo, s.nome FROM _llml_subs s ORDER BY s.ordem LOOP
    SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1] INTO v_n, v_sub
    FROM product_categories c
    WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n = 0 THEN
      RAISE NOTICE 'lava_loucas_modelos_largura: a Mudelar não tem a subcategoria «%» — nada a fazer.', r.nome;
      RETURN;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'lava_loucas_modelos_largura: há % subcategorias «%».', v_n, r.nome;
    END IF;
    UPDATE _llml_subs s SET sub_id = v_sub WHERE s.codigo = r.codigo;
  END LOOP;
  IF (SELECT c.sigla FROM product_categories c WHERE c.id = v_cat) IS DISTINCT FROM c_cat_sigla
     OR EXISTS (SELECT 1 FROM _llml_subs s JOIN product_categories c ON c.id = s.sub_id WHERE c.sigla IS DISTINCT FROM s.codigo) THEN
    RAISE EXCEPTION 'lava_loucas_modelos_largura: as siglas de «%» e das subcategorias não são LLC, CC e CI.', c_cat_nome;
  END IF;

  -- já aplicada? (o atributo Largura e os 10 modelos vivos com estes nomes e números) → inerte
  SELECT count(*) INTO v_n FROM product_attributes a
  WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND public.fn_cat_chave_opcao(a.label) = public.fn_cat_chave_opcao(c_attr_nome);
  SELECT count(*) INTO v_m FROM product_models pm JOIN _llml_subs s ON s.sub_id = pm.subcategory_id
  WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL;
  SELECT count(*) INTO v_k FROM product_models pm JOIN _llml_subs s ON s.sub_id = pm.subcategory_id
  JOIN _llml_modelos m ON m.sub = s.codigo AND m.numero = pm.numero AND m.nome = pm.name
  WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL;
  IF v_n = 1 AND v_m = c_n_modelos AND v_k = c_n_modelos THEN
    RAISE NOTICE 'lava_loucas_modelos_largura: já aplicada (Largura e os 10 modelos) — nada a fazer.';
    RETURN;
  END IF;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'lava_loucas_modelos_largura: a Mudelar já tem um atributo «%», mas os modelos não são os 10 desta migration (% vivos). Rever antes de aplicar.',
      c_attr_nome, v_m;
  END IF;

  -- ─── O estado tem de ser o de 20270118900000 (senão: erro) ───────────────────
  -- cada linha: o produto vivo com o nome, na subcategoria, com o modelo vivo do número do SKU antigo
  UPDATE _llml_linhas l SET produto_id = x.pid, modelo_antigo_id = x.mid, sku_atual = x.sku
  FROM (SELECT l2.sku_antigo, (array_agg(p.id))[1] AS pid, (array_agg(pm.id))[1] AS mid, (array_agg(p.sku))[1] AS sku, count(*) AS n
        FROM _llml_linhas l2
        JOIN _llml_subs s ON s.codigo = l2.sub
        JOIN products p ON p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = s.sub_id AND p.name = l2.nome
        JOIN product_models pm ON pm.id = p.model_id AND pm.organization_id = c_org AND pm.subcategory_id = s.sub_id
                              AND pm.deleted_at IS NULL AND pm.numero = right(l2.sku_antigo, 4)::smallint
        GROUP BY l2.sku_antigo) x
  WHERE x.sku_antigo = l.sku_antigo AND x.n = 1;
  SELECT string_agg(l.sku_antigo || ' ' || l.nome, '; ') INTO v_txt FROM _llml_linhas l WHERE l.produto_id IS NULL;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'lava_loucas_modelos_largura: produtos não encontrados com o nome e o modelo do SKU antigo: %', v_txt;
  END IF;
  SELECT count(*), count(DISTINCT l.produto_id), count(DISTINCT l.modelo_antigo_id) INTO v_n, v_m, v_k FROM _llml_linhas l;
  IF v_m <> c_total OR v_k <> c_total THEN
    RAISE EXCEPTION 'lava_loucas_modelos_largura: % produtos e % modelos distintos para % linhas.', v_m, v_k, v_n;
  END IF;
  -- nas subcategorias: só estes 32 produtos (vivos ou apagados) e só estes 32 modelos (vivos ou apagados)
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _llml_subs s)
    AND NOT EXISTS (SELECT 1 FROM _llml_linhas l WHERE l.produto_id = p.id);
  SELECT count(*) INTO v_m FROM product_models pm
  WHERE pm.organization_id = c_org AND pm.subcategory_id IN (SELECT s.sub_id FROM _llml_subs s)
    AND NOT EXISTS (SELECT 1 FROM _llml_linhas l WHERE l.modelo_antigo_id = pm.id);
  IF v_n > 0 OR v_m > 0 THEN
    RAISE EXCEPTION 'lava_loucas_modelos_largura: as subcategorias têm % produtos e % modelos que não são os de 20270118900000.', v_n, v_m;
  END IF;
  -- nenhum atributo ainda nos 32
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN _llml_linhas l ON l.produto_id = v.product_id;
  IF v_n > 0 THEN RAISE EXCEPTION 'lava_loucas_modelos_largura: os produtos já têm % valores de atributos.', v_n; END IF;
  -- o modelo que fica é o do MENOR número entre os dos seus produtos, e tem de ser o de cima
  UPDATE _llml_modelos m SET modelo_id = x.mid
  FROM (SELECT l.sub, l.modelo, (array_agg(pm.id ORDER BY pm.numero))[1] AS mid, min(pm.numero) AS menor
        FROM _llml_linhas l JOIN product_models pm ON pm.id = l.modelo_antigo_id GROUP BY l.sub, l.modelo) x
  WHERE x.sub = m.sub AND x.modelo = m.nome AND x.menor = m.numero;
  SELECT string_agg(m.sub || ' ' || m.nome || ' ' || lpad(m.numero::text, 4, '0') || ' (menor na base: '
                    || coalesce((SELECT lpad(min(pm.numero)::text, 4, '0') FROM _llml_linhas l JOIN product_models pm ON pm.id = l.modelo_antigo_id
                                 WHERE l.sub = m.sub AND l.modelo = m.nome), '-') || ')', '; ')
    INTO v_txt
  FROM _llml_modelos m WHERE m.modelo_id IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'lava_loucas_modelos_largura: números de modelo diferentes do esperado: %', v_txt; END IF;
  UPDATE _llml_linhas l SET modelo_novo_id = m.modelo_id FROM _llml_modelos m WHERE m.sub = l.sub AND m.nome = l.modelo;

  SELECT m.user_id INTO v_criador
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND coalesce(m.role_is_client, false) = false
  ORDER BY m.created_at, m.user_id LIMIT 1;
  IF v_criador IS NULL THEN RAISE EXCEPTION 'lava_loucas_modelos_largura: a Mudelar não tem um membro ativo para created_by.'; END IF;

  -- o atributo Cor da Mudelar (o das Bases de Duche e das Loiças) e o seu grupo
  SELECT count(*), (array_agg(a.id))[1] INTO v_n, v_a_cor
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'cor' AND NOT a.is_measurement;
  IF v_n <> 1 THEN RAISE EXCEPTION 'lava_loucas_modelos_largura: a Mudelar tem % atributos cor de lista (tem de ter um).', v_n; END IF;
  v_g_cor := public.fn_cat_grupo_do_atributo(v_a_cor, c_org);
  IF NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_cor AND g.organization_id = c_org) THEN
    RAISE EXCEPTION 'lava_loucas_modelos_largura: as opções da Cor em uso na Mudelar não são de um grupo próprio da Mudelar.';
  END IF;

  -- amostra de SKUs de outras categorias, e o que não pode mudar nos 32 (fornecedores com supplier_sku, preços)
  CREATE TEMP TABLE _llml_amostra ON COMMIT DROP AS
  SELECT x.id, x.sku FROM (
    SELECT p.id, p.sku, row_number() OVER (PARTITION BY c.id ORDER BY p.sku, p.id) AS n
    FROM products p JOIN product_categories c ON c.id = p.category_id
    WHERE p.organization_id = c_org AND NOT p.is_deleted AND c.organization_id = c_org AND c.parent_id IS NULL
      AND c.sigla IN ('DB', 'LS', 'ACB')) x
  WHERE x.n <= 3;
  CREATE TEMP TABLE _llml_antes ON COMMIT DROP AS
  SELECT l.produto_id,
         (SELECT string_agg(x.id::text || ':' || coalesce(x.price::text, ''), ',' ORDER BY x.id)
          FROM product_prices x WHERE x.product_id = l.produto_id) AS precos
  FROM _llml_linhas l;
  -- as ligações a fornecedor dos 32, uma a uma: as que têm como supplier_sku o SKU atual do próprio produto (sem código
  -- de fornecedor) passam ao SKU novo; as outras não mudam
  CREATE TEMP TABLE _llml_forn ON COMMIT DROP AS
  SELECT i.id, i.product_id, i.supplier_id, i.supplier_sku, i.purchase_price, i.is_preferred, i.is_active, i.deleted_at,
         (i.deleted_at IS NULL AND i.supplier_sku = l.sku_atual) AS muda, l.sku_novo
  FROM item_suppliers i JOIN _llml_linhas l ON l.produto_id = i.product_id;
  SELECT count(*) INTO v_n FROM _llml_forn f WHERE f.muda;
  IF v_n <> c_n_forn_sku THEN
    RAISE EXCEPTION 'lava_loucas_modelos_largura: % ligações a fornecedor com o SKU atual como supplier_sku (esperadas %).', v_n, c_n_forn_sku;
  END IF;

  -- ─── Locks (as chaves das funções de gestão do Catálogo, na ordem delas) ─────
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_guardar_atributo:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text, 0));
  FOR r IN SELECT s.sub_id FROM _llml_subs s ORDER BY s.sub_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text || ':' || r.sub_id::text, 0));
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || v_g_cor::text, 0));

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', v_criador::text, true);

  -- ─── 1. A opção NEGRO da Cor (a que existe; criada se faltar) ────────────────
  SELECT count(*), (array_agg(v.id ORDER BY v.id))[1], (array_agg(v.is_active ORDER BY v.id))[1]
    INTO v_n, v_negro, v_ativa
  FROM attribute_option_group_values v
  WHERE v.group_id = v_g_cor AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(c_cor_opcao);
  IF v_n > 1 THEN RAISE EXCEPTION 'lava_loucas_modelos_largura: há % opções «%» na Cor da Mudelar.', v_n, c_cor_opcao; END IF;
  IF v_n = 1 AND NOT v_ativa THEN
    RAISE EXCEPTION 'lava_loucas_modelos_largura: a opção «%» da Cor da Mudelar está desativada.', c_cor_opcao;
  END IF;
  IF v_n = 0 THEN
    v_txt := public.fn_cat_sigla_opcao_livre(v_g_cor, c_cor_opcao, NULL);
    IF v_txt IS NULL THEN RAISE EXCEPTION 'lava_loucas_modelos_largura: sem sigla livre para «%».', c_cor_opcao; END IF;
    INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active, sigla)
    VALUES (v_g_cor, c_cor_opcao, c_cor_opcao, NULL,
            coalesce((SELECT max(v.sort_order) FROM attribute_option_group_values v WHERE v.group_id = v_g_cor), 0) + 1, true, v_txt)
    RETURNING id INTO v_negro;
    v_negro_criada := c_cor_opcao || ' (' || v_txt || ')';
  END IF;
  SELECT v.value_text::text, v.sigla INTO v_negro_valor, v_negro_sigla FROM attribute_option_group_values v WHERE v.id = v_negro;
  IF v_negro_sigla IS NULL THEN RAISE EXCEPTION 'lava_loucas_modelos_largura: a opção «%» da Cor não tem sigla.', c_cor_opcao; END IF;

  -- ─── 2. O atributo Largura (como cat_guardar_atributo: lista, grupo da organização) ─────
  SELECT count(*)::integer, coalesce(max(pa.sort_order), 0) + 1 INTO v_i, v_ordem FROM product_attributes pa
  WHERE pa.organization_id = c_org AND pa.deleted_at IS NULL;
  IF v_i >= c_max_atributos THEN RAISE EXCEPTION 'lava_loucas_modelos_largura: a Mudelar já tem o máximo de atributos (%).', c_max_atributos; END IF;
  v_code := 'largura'; v_i := 1;
  WHILE EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.organization_id = c_org AND pa.code = v_code) LOOP
    v_i := v_i + 1;
    v_code := 'largura_' || v_i::text;
  END LOOP;
  -- sku_ordem: o gatilho trg_cat_sku_ordem põe a maior + 1 (fica no fim); sku_entra = true
  INSERT INTO product_attributes (organization_id, code, label, type, value_type, has_hex_color, is_measurement,
                                  measurement_type, unit, pricing_type, valorization_type, is_variant_option,
                                  is_variant_attribute, sort_order, created_by, sku_entra)
  VALUES (c_org, v_code, c_attr_nome, 'select'::public.attribute_type, 'list', false, false,
          NULL, NULL, 'none', 'none', false, false, v_ordem, v_criador, true)
  RETURNING id INTO v_a_larg;
  INSERT INTO attribute_option_groups (attribute_id, organization_id, name, sort_order, is_active, created_by)
  VALUES (v_a_larg, c_org, c_attr_nome, v_ordem, true, v_criador)
  RETURNING id INTO v_g_larg;
  IF public.fn_cat_grupo_do_atributo(v_a_larg, c_org) IS DISTINCT FROM v_g_larg THEN
    RAISE EXCEPTION 'lava_loucas_modelos_largura: o grupo da Largura não ficou o grupo em uso do atributo.';
  END IF;
  INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active, sigla)
  SELECT v_g_larg, x.valor, x.valor, NULL, x.ordem, true, x.valor FROM _llml_larguras x ORDER BY x.ordem;
  UPDATE _llml_larguras x SET opcao_id = v.id
  FROM attribute_option_group_values v WHERE v.group_id = v_g_larg AND v.value_text = x.valor;

  -- ─── 3. Modelos: produtos para o modelo que fica → apagar os outros → renomear ─────
  UPDATE products p SET model_id = l.modelo_novo_id
  FROM _llml_linhas l
  WHERE p.id = l.produto_id AND p.organization_id = c_org AND p.model_id IS DISTINCT FROM l.modelo_novo_id;
  UPDATE product_models pm SET deleted_at = v_agora
  FROM _llml_linhas l
  WHERE pm.id = l.modelo_antigo_id AND pm.organization_id = c_org AND pm.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM _llml_modelos m WHERE m.modelo_id = pm.id);
  UPDATE product_models pm SET name = m.nome
  FROM _llml_modelos m
  WHERE pm.id = m.modelo_id AND pm.organization_id = c_org AND pm.name IS DISTINCT FROM m.nome;

  -- ─── 4. Os valores: Largura (30) e Cor NEGRO (2) — value_text = o da opção, como cat_guardar_produto_atributos ─────
  INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_json, unit)
  SELECT l.produto_id, v_a_larg, l.largura, NULL::jsonb, NULL::text FROM _llml_linhas l WHERE l.largura IS NOT NULL
  UNION ALL
  SELECT l.produto_id, v_a_cor, v_negro_valor, NULL::jsonb, NULL::text FROM _llml_linhas l WHERE l.cor IS NOT NULL;

  -- ─── 5. O SKU de novo (a regra de cat_gerar_sku_produto, set-based, sobre o que ficou gravado) ─────
  CREATE TEMP TABLE _llml_sku ON COMMIT DROP AS
  SELECT l.produto_id, l.sku_novo, (z.pt ->> 'prefixo') AS prefixo, (z.pt -> 'faltas') AS faltas,
         public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id) AS numero,
         concat_ws('-', z.pt ->> 'prefixo', lpad(public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id)::text, 4, '0'),
                   z.pt ->> 'resto') AS calc
  FROM _llml_linhas l
  JOIN products p ON p.id = l.produto_id
  CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, p.category_id, p.subcategory_id, (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'atributo', v.attribute_id, 'sigla', o.sigla,
               'medida', (CASE WHEN a.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END))), '[]'::jsonb)
      FROM product_attribute_values v
      JOIN product_attributes a ON a.id = v.attribute_id AND a.organization_id = c_org AND a.deleted_at IS NULL
      LEFT JOIN attribute_option_group_values o
        ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(a.id, c_org) AND o.value_text = v.value_text
      WHERE v.product_id = p.id)) AS pt) z;
  SELECT count(*), string_agg(s.sku_novo || ' ≠ ' || coalesce(s.calc, 'null') || ' ' || coalesce(s.faltas::text, ''), '; ')
    INTO v_n, v_txt
  FROM _llml_sku s
  WHERE s.prefixo IS NULL OR s.numero IS NULL OR s.faltas IS DISTINCT FROM '[]'::jsonb OR s.calc IS DISTINCT FROM s.sku_novo;
  IF v_n > 0 THEN RAISE EXCEPTION 'lava_loucas_modelos_largura: % SKUs calculados diferentes do esperado: %', v_n, left(v_txt, 1500); END IF;
  SELECT string_agg(s.calc || ' (' || p.name || ')', '; ') INTO v_txt
  FROM _llml_sku s JOIN products p ON p.organization_id = c_org AND p.sku = s.calc AND p.id <> s.produto_id;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'lava_loucas_modelos_largura: SKUs já usados noutros produtos da Mudelar: %', left(v_txt, 1500); END IF;
  UPDATE products p SET sku = s.calc, sku_gerado = true
  FROM _llml_sku s
  WHERE p.id = s.produto_id AND p.organization_id = c_org AND (p.sku IS DISTINCT FROM s.calc OR NOT p.sku_gerado);

  -- ─── 5b. supplier_sku: o SKU antigo do próprio produto passa ao SKU novo (quem tem código de fornecedor não muda) ─────
  UPDATE item_suppliers i SET supplier_sku = f.sku_novo
  FROM _llml_forn f
  WHERE i.id = f.id AND f.muda AND i.organization_id = c_org AND i.supplier_sku IS DISTINCT FROM f.sku_novo;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_n_forn_sku THEN
    RAISE EXCEPTION 'lava_loucas_modelos_largura: % supplier_sku mudados em vez de %.', v_n, c_n_forn_sku;
  END IF;

  -- ─── 6. Conferir (cada contagem é do que está ERRADO; tem de dar 0) ───────────
  -- modelos: 10 vivos com nome e número; 22 apagados agora; 32 linhas no total (nenhuma removida)
  SELECT count(*) INTO v_n FROM _llml_modelos m
  JOIN _llml_subs s ON s.codigo = m.sub
  LEFT JOIN product_models pm ON pm.id = m.modelo_id
  WHERE NOT coalesce(pm.organization_id = c_org AND pm.subcategory_id = s.sub_id AND pm.deleted_at IS NULL AND pm.is_active
                     AND pm.name = m.nome AND pm.numero = m.numero, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % dos % modelos novos não ficaram com o nome, o número ou vivos.', v_n, c_n_modelos; END IF;
  SELECT count(*) FILTER (WHERE pm.deleted_at IS NULL), count(*) FILTER (WHERE pm.deleted_at = v_agora), count(*)
    INTO v_n, v_m, v_k
  FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id IN (SELECT s.sub_id FROM _llml_subs s);
  IF v_n <> c_n_modelos OR v_m <> c_total - c_n_modelos OR v_k <> c_total THEN
    RAISE EXCEPTION 'Conferir: modelos nas subcategorias: % vivos (esperados %), % apagados agora (esperados %), % no total (esperados %).',
      v_n, c_n_modelos, v_m, c_total - c_n_modelos, v_k, c_total;
  END IF;

  -- produtos: o nome de sempre, o modelo novo, o SKU esperado e gerado, vivos (LEFT JOIN: um produto em falta conta)
  SELECT count(*), string_agg(l.sku_antigo, ', ') INTO v_n, v_txt
  FROM _llml_linhas l
  JOIN _llml_subs s ON s.codigo = l.sub
  LEFT JOIN products p ON p.id = l.produto_id
  WHERE NOT coalesce(p.organization_id = c_org AND p.name = l.nome AND p.model_id = l.modelo_novo_id AND p.sku = l.sku_novo
                     AND p.sku_gerado AND NOT p.is_deleted AND p.category_id = v_cat AND p.subcategory_id = s.sub_id, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos sem o nome, o modelo ou o SKU esperados: %', v_n, v_txt; END IF;

  -- valores: largura certa nos 30, NEGRO nos 2, nada mais (conta os que FALTAM e os A MAIS)
  SELECT count(*) INTO v_n FROM _llml_linhas l
  WHERE l.largura IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = l.produto_id AND v.attribute_id = v_a_larg
                    AND v.value_text = l.largura AND v.value_json IS NULL);
  SELECT count(*) INTO v_m FROM _llml_linhas l
  WHERE l.cor IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = l.produto_id AND v.attribute_id = v_a_cor
                    AND v.value_text = v_negro_valor);
  SELECT count(*) INTO v_k FROM product_attribute_values v JOIN _llml_linhas l ON l.produto_id = v.product_id
  WHERE NOT coalesce((v.attribute_id = v_a_larg AND v.value_text = l.largura) OR (v.attribute_id = v_a_cor AND l.cor IS NOT NULL), false);
  IF v_n > 0 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: % larguras em falta, % NEGRO em falta, % valores a mais nos 32 produtos.', v_n, v_m, v_k;
  END IF;
  SELECT count(*) FILTER (WHERE v.attribute_id = v_a_larg), count(*) FILTER (WHERE v.attribute_id = v_a_cor) INTO v_n, v_m
  FROM product_attribute_values v JOIN products p ON p.id = v.product_id AND p.organization_id = c_org AND NOT p.is_deleted
  WHERE v.attribute_id IN (v_a_larg, v_a_cor) AND p.subcategory_id IN (SELECT s.sub_id FROM _llml_subs s);
  IF v_n <> c_n_larguras OR v_m <> c_n_negro THEN
    RAISE EXCEPTION 'Conferir: % produtos com largura (esperados %) e % com cor (esperados %).', v_n, c_n_larguras, v_m, c_n_negro;
  END IF;
  SELECT count(*) INTO v_n FROM product_attribute_values v
  WHERE v.attribute_id = v_a_larg AND NOT EXISTS (SELECT 1 FROM _llml_linhas l WHERE l.produto_id = v.product_id);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos fora dos 32 com Largura.', v_n; END IF;

  -- o atributo Largura: lista, entra no SKU, o último da ordem, 15 opções ativas com sigla = número
  IF NOT EXISTS (SELECT 1 FROM product_attributes a WHERE a.id = v_a_larg AND a.organization_id = c_org AND a.deleted_at IS NULL
                 AND NOT a.is_measurement AND a.sku_entra AND a.label = c_attr_nome AND a.sku_ordem IS NOT NULL
                 AND a.sku_ordem > ALL (SELECT coalesce(b.sku_ordem, 0) FROM product_attributes b
                                        WHERE b.organization_id = c_org AND b.deleted_at IS NULL AND b.id <> v_a_larg)) THEN
    RAISE EXCEPTION 'Conferir: o atributo Largura não ficou lista, a entrar no SKU e no fim da ordem.';
  END IF;
  SELECT count(*) INTO v_n FROM _llml_larguras x LEFT JOIN attribute_option_group_values v ON v.id = x.opcao_id
  WHERE NOT coalesce(v.group_id = v_g_larg AND v.value_text = x.valor AND v.sigla = x.valor AND v.is_active, false);
  SELECT count(*) INTO v_m FROM attribute_option_group_values v WHERE v.group_id = v_g_larg;
  IF v_n > 0 OR v_m <> c_n_opcoes THEN
    RAISE EXCEPTION 'Conferir: % opções da Largura erradas; % no grupo (esperadas %).', v_n, v_m, c_n_opcoes;
  END IF;

  -- SKUs: únicos na Mudelar, no formato, sem provisórios, e iguais ao recalculado a partir do que ficou gravado
  v_regex := '^LLC-(CC-0001|CI-00(01|04|08|13|15|16|17|18|19))(-' || v_negro_sigla || ')?(-(34|38|40|45|50|55|57|60|70|75|80|86|100|105|116))?$';
  SELECT count(*), count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ v_regex OR p.sku ~ '^CAT-' OR NOT p.sku_gerado)
    INTO v_n, v_m, v_k
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _llml_subs s) AND NOT p.is_deleted;
  IF v_n <> c_total OR v_m <> c_total OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: % produtos, % SKUs distintos, % fora do formato ou não gerados.', v_n, v_m, v_k;
  END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.sku IN (SELECT l.sku_novo FROM _llml_linhas l)
    AND NOT EXISTS (SELECT 1 FROM _llml_linhas l WHERE l.produto_id = p.id);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % outros produtos da Mudelar com um dos SKUs novos.', v_n; END IF;
  SELECT count(*), string_agg(y.sku || ' ≠ ' || coalesce(y.calc, 'null'), '; ') INTO v_n, v_txt
  FROM (SELECT p.sku, z.pt ->> 'faltas' AS faltas, (z.pt ->> 'prefixo') AS prefixo,
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
        WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _llml_subs s) AND NOT p.is_deleted) y
  WHERE y.calc IS DISTINCT FROM y.sku OR y.prefixo IS NULL OR y.faltas IS DISTINCT FROM '[]';
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs diferentes do recalculado (ex.: %).', v_n, left(v_txt, 1500); END IF;

  -- todos com cat_prever_sku_modelo e os atributos gravados, como um membro da Mudelar com products.edit (só leitura)
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE NOTICE 'lava_loucas_modelos_largura: sem membro da Mudelar com products.edit — a comparação com cat_prever_sku_modelo ficou por fazer (o recálculo foi feito).';
  ELSE
    v_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    v_n := 0;
    FOR r IN SELECT l.produto_id, l.sku_novo, p.category_id, p.subcategory_id, p.model_id
             FROM _llml_linhas l JOIN products p ON p.id = l.produto_id ORDER BY l.sku_antigo LOOP
      SELECT coalesce(jsonb_agg(jsonb_build_object('atributo', v.attribute_id, 'opcao', o.id)), '[]'::jsonb) INTO v_attrs
      FROM product_attribute_values v
      JOIN attribute_option_group_values o ON o.group_id = public.fn_cat_grupo_do_atributo(v.attribute_id, c_org) AND o.value_text = v.value_text
      WHERE v.product_id = r.produto_id;
      v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.produto_id);
      IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku_novo OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Conferir: cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku_novo;
      END IF;
      v_n := v_n + 1;
    END LOOP;
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: só % de % comparados com cat_prever_sku_modelo.', v_n, c_total; END IF;
  END IF;

  -- preços dos 32 iguais a antes
  SELECT count(*) INTO v_n FROM _llml_antes a
  WHERE a.precos IS DISTINCT FROM (SELECT string_agg(x.id::text || ':' || coalesce(x.price::text, ''), ',' ORDER BY x.id)
                                   FROM product_prices x WHERE x.product_id = a.produto_id);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos com preços mudados.', v_n; END IF;
  -- ligações a fornecedor: as 13 sem código de fornecedor com o SKU novo, as outras iguais a antes; nenhuma a mais ou a menos
  SELECT count(*) FILTER (WHERE f.muda), count(*) FILTER (WHERE NOT f.muda) INTO v_n, v_m
  FROM _llml_forn f LEFT JOIN item_suppliers i ON i.id = f.id
  WHERE NOT coalesce(i.product_id = f.product_id AND i.supplier_id = f.supplier_id
                     AND i.purchase_price IS NOT DISTINCT FROM f.purchase_price AND i.is_preferred IS NOT DISTINCT FROM f.is_preferred
                     AND i.is_active IS NOT DISTINCT FROM f.is_active AND i.deleted_at IS NOT DISTINCT FROM f.deleted_at
                     AND i.supplier_sku IS NOT DISTINCT FROM (CASE WHEN f.muda THEN f.sku_novo ELSE f.supplier_sku END), false);
  SELECT count(*) INTO v_k FROM item_suppliers i JOIN _llml_linhas l ON l.produto_id = i.product_id
  WHERE NOT EXISTS (SELECT 1 FROM _llml_forn f WHERE f.id = i.id);
  IF v_n > 0 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: % ligações sem o SKU novo, % ligações com código de fornecedor mudadas, % ligações novas.', v_n, v_m, v_k;
  END IF;
  SELECT count(*) INTO v_n FROM _llml_linhas l
  WHERE NOT EXISTS (SELECT 1 FROM item_suppliers i WHERE i.product_id = l.produto_id AND i.deleted_at IS NULL
                    AND i.supplier_sku = l.sku_novo)
    AND EXISTS (SELECT 1 FROM _llml_forn f WHERE f.product_id = l.produto_id AND f.muda);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos sem código de fornecedor não ficaram com o SKU novo na ligação.', v_n; END IF;

  -- nada escrito fora da Mudelar, nem em preços, fornecedores ou categorias (xmin desta transação)
  v_xid := (txid_current() % 4294967296)::text;
  SELECT string_agg(x.t || ' ' || x.n, ', ') INTO v_txt FROM (
    SELECT 'products' AS t, count(*) AS n FROM products p WHERE p.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_attribute_values', count(*) FROM product_attribute_values x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_models', count(*) FROM product_models x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_attributes', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_groups', count(*) FROM attribute_option_groups x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_group_values', count(*) FROM attribute_option_group_values x JOIN attribute_option_groups g ON g.id = x.group_id
              WHERE x.xmin::text = v_xid AND g.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_prices', count(*) FROM product_prices x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'item_suppliers (além das 13)', count(*) FROM item_suppliers x
              WHERE x.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _llml_forn f WHERE f.id = x.id AND f.muda)
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: foram escritas linhas fora do âmbito: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM item_suppliers x WHERE x.xmin::text = v_xid;
  IF v_n <> c_n_forn_sku THEN RAISE EXCEPTION 'Conferir: % ligações a fornecedor escritas (esperadas %).', v_n, c_n_forn_sku; END IF;
  IF NOT EXISTS (SELECT 1 FROM product_attributes a WHERE a.id = v_a_larg AND a.xmin::text = v_xid) THEN
    RAISE EXCEPTION 'Conferir: o atributo criado não tem o xmin desta transação: a verificação pelo xmin não vale.';
  END IF;
  -- nenhum outro produto, modelo ou atributo da Mudelar escrito
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _llml_linhas l WHERE l.produto_id = p.id);
  SELECT count(*) INTO v_m FROM product_models pm
  WHERE pm.organization_id = c_org AND pm.xmin::text = v_xid AND pm.subcategory_id NOT IN (SELECT s.sub_id FROM _llml_subs s);
  SELECT count(*) INTO v_k FROM product_attributes a
  WHERE a.organization_id = c_org AND a.xmin::text = v_xid AND a.id <> v_a_larg;
  IF v_n > 0 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: escritos % outros produtos, % outros modelos e % outros atributos da Mudelar.', v_n, v_m, v_k;
  END IF;
  -- a amostra de SKUs de Duche & Banho, Loiças e Acessórios ficou igual
  SELECT count(*), string_agg(a.sku, ', ') INTO v_n, v_txt
  FROM _llml_amostra a LEFT JOIN products p ON p.id = a.id
  WHERE NOT coalesce(p.sku = a.sku AND NOT p.is_deleted AND p.organization_id = c_org, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs da amostra de outras categorias mudaram: %', v_n, v_txt; END IF;

  RAISE NOTICE 'lava_loucas_modelos_largura: % modelos vivos (% apagados), Largura (código %, % opções, sku_ordem %), % produtos com largura, % com Cor % (%), % SKUs gerados de novo. Opção criada: %. Amostra de outras categorias: % SKUs iguais. Conferido.',
    c_n_modelos, c_total - c_n_modelos, v_code, c_n_opcoes, (SELECT a.sku_ordem FROM product_attributes a WHERE a.id = v_a_larg),
    c_n_larguras, c_n_negro, v_negro_valor, v_negro_sigla, c_total, coalesce(v_negro_criada, 'nenhuma'),
    (SELECT count(*) FROM _llml_amostra);
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
