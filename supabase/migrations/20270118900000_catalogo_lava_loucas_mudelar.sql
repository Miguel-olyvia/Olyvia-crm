-- =============================================================================
-- Catálogo — importação dos LAVA-LOUÇAS & CUBAS da MUDELAR (ficheiro do utilizador lava.csv, exportado do Excel).
-- Base de RH (uetjghdkwbywbftedtth). Ficheiro GERADO por script (gerar_lava.js) a partir do CSV: as linhas de dados
-- abaixo não se editam à mão — regeneram-se. Mesmo molde de 20270118700000 (Acessórios WC), sem atributos.
-- =============================================================================
--
-- Decisões (17/11):
--   * Um produto por linha do ficheiro: 32 produtos. Por subcategoria: Cubas compósito 12, Cubas inox 20. Fica de fora a linha
--     LLCCI0021 («LAVA LOUÇA BLANCO INOX LEMIS…»), que não tem marca.
--   * Sigla da categoria «Lava-louças & Cubas» passa de LLC para LLC (a categoria não tem produtos nem modelos;
--     nenhuma outra categoria de topo da Mudelar tem LLC). Subcategorias Cubas compósito CC e Cubas inox CI (já
--     são); «Cubas encastrar / pousar / embutir» (CEPE) não se mexe.
--   * Um MODELO por linha, com o número NNNN do SKU antigo (LLC{CC|CI}NNNN), por subcategoria; nome do modelo = o nome
--     do produto sem «Lava-louças » (ex.: «AMBAR 86 C/ESCORREDOR 1 CUBA», «AMBAR 1 CUBA 40 N» — o «N» fica no nome).
--   * SEM atributos (a medida só traz a largura e a Medida exige 2D/3D; a cor não se sabe): nenhum valor de atributo.
--     SKU = regras do Catálogo: LLC-SUB-NNNN, ex. LLC-CC-0001. O SKU antigo não se guarda.
--   * Marcas Rodi e FRASA (já existem). Fornecedores: «Anlorbel - Com. de Mat. …» = o «ANLORBEL COMERCIO MATERIAIS
--     CONSTRUCAO E DECORACAO» que já existe (Rodi); «BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.» (FRASA) cria-se
--     se faltar, com o nome do ficheiro. Ligados a cada produto (item_suppliers, preferido, preço de compra = custo).
--   * supplier_sku = «Código de Fornecedor» quando vem preenchido (19 linhas); nas outras (13) = o SKU,
--     como cat_ligar_fornecedor_produto e as importações anteriores.
--   * Preço por linha: custo = «Preço Compra», PVP = «Preço Venda», IVA 23. Unidade un. Espaços a mais cortados.
--   * Estado 'active', vendável e comprável, como cat_guardar_produto.
--   * Auditoria normal, linha a linha, com app.audit_source = 'migration:lava_loucas_mudelar'.
--
-- GUARDA (inerte: RAISE NOTICE e sai sem escrever nada) se: a organização 3242e925-… não existir com o nome 'Mudelar';
-- faltar a versão dos modelos (20270118300000); não existir «Lava-louças & Cubas» ou uma das 2 subcategorias; já houver
-- produtos (vivos ou apagados) na categoria ou em qualquer subcategoria dela; já houver um produto vivo da Mudelar com um
-- dos nomes; ou já houver numa das 2 um modelo com um dos nomes ou números que não seja exatamente o mesmo. Inerte numa
-- segunda execução.
-- Falha (RAISE EXCEPTION, nada fica) se: a categoria ou uma subcategoria estiver desativada; a sigla LLC for de
-- outra categoria de topo da Mudelar; uma sigla CC/CI for de outra irmã; faltarem marcas, a unidade ou um membro para
-- created_by; SKU repetido (diz quais) ou já usado.
--
-- Conferir no fim (RAISE EXCEPTION se divergir): 32 produtos, por subcategoria e por modelo (1 cada); 32
-- modelos; cada produto com nome, SKU, modelo, marca, fornecedor e supplier_sku, preços e nenhum atributo; SKUs únicos,
-- no formato e iguais ao recalculado (todos) e a cat_prever_sku_modelo (todos); as siglas; nada escrito fora da Mudelar
-- (xmin); nenhum outro produto da Mudelar escrito, e uma amostra de SKUs de Duche & Banho, Loiças e Acessórios intacta.
--
-- ORDEM: depois de 20270118300000 e 20270118700000. Teste: supabase/tests/catalogo_lava_loucas_mudelar.test.sql
-- (BEGIN … ROLLBACK, só leitura; o passo 0 falha antes). ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que
-- estiver pendente; listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '5min';

DO $mig$
DECLARE
  c_org        constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte      constant text    := 'migration:lava_loucas_mudelar';
  c_total      constant integer := 32;
  c_iva        constant numeric := 23;
  c_cat_nome   constant text    := 'Lava-louças & Cubas';
  c_cat_sigla  constant text    := 'LLC';
  c_unidade    constant text    := 'un';
  c_max_modelos_ativos constant integer := 2000;
  c_max_modelos_vivos  constant integer := 10000;
  v_agora   timestamptz := clock_timestamp();
  v_n bigint; v_m bigint; v_k bigint; v_xid text; v_txt text; v_forn_criados text := '';
  v_cat uuid; v_cat_sigla_antes text; v_cat_ativa boolean; v_sub uuid; v_ativa boolean; v_criador uuid; v_uom uuid; v_sup uuid;
  v_mod uuid; v_regex text;
  v_auth uuid; v_claims text; v_prev jsonb; r record;
BEGIN
  -- ─── 0. Guarda (inerte) ───────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'lava_loucas_mudelar: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  IF to_regclass('public.product_models') IS NULL
     OR to_regprocedure('public.fn_cat_modelo_numero(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)') IS NULL
     OR position('fn_cat_modelo_numero' IN coalesce((SELECT pr.prosrc FROM pg_proc pr
                                                     WHERE pr.oid = to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)')::oid), '')) = 0 THEN
    RAISE NOTICE 'lava_loucas_mudelar: falta a versão dos modelos (20270118300000) — nada a fazer.';
    RETURN;
  END IF;
  SELECT string_agg(s, ', ') INTO v_txt
  FROM unnest(ARRAY['public.fn_cat_chave_opcao(text)', 'public.fn_cat_limpar_nome(text)', 'public.fn_cat_grupo_do_atributo(uuid,uuid)',
                    'public.fn_cat_medida_ler(jsonb,text)', 'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)',
                    'public.fn_cat_unidade(uuid,text)', 'public.has_anew_permission_in_org(uuid,text,uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'lava_loucas_mudelar: faltam funções do Catálogo (%).', v_txt; END IF;

  SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(c.sigla ORDER BY c.created_at, c.id))[1],
         (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1]
    INTO v_n, v_cat, v_cat_sigla_antes, v_cat_ativa
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(c_cat_nome);
  IF v_n = 0 THEN
    RAISE NOTICE 'lava_loucas_mudelar: a Mudelar não tem a categoria «%» — nada a fazer.', c_cat_nome;
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'lava_loucas_mudelar: há % categorias «%» na Mudelar.', v_n, c_cat_nome;
  END IF;

  -- ─── Os dados do ficheiro (gerados) ───────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._llm_subs, pg_temp._llm_forn, pg_temp._llm_marcas, pg_temp._llm_linhas, pg_temp._llm_amostra, pg_temp._llm;

  -- as subcategorias: sigla, nome na Mudelar, quantos produtos
  CREATE TEMP TABLE _llm_subs (codigo text PRIMARY KEY, nome text NOT NULL, esperados integer NOT NULL, ordem integer NOT NULL,
                               sub_id uuid, sigla_antes text) ON COMMIT DROP;
  INSERT INTO _llm_subs (codigo, nome, esperados, ordem) VALUES
    ('CC', 'Cubas compósito', 12, 1),
    ('CI', 'Cubas inox', 20, 2);

  CREATE TEMP TABLE _llm_forn (nome text PRIMARY KEY, id uuid, criado boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _llm_forn (nome) VALUES
    ('ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.');
  CREATE TEMP TABLE _llm_marcas (nome text PRIMARY KEY, id uuid) ON COMMIT DROP;
  INSERT INTO _llm_marcas (nome) VALUES
    ('FRASA'),
    ('Rodi');

  -- as 32 linhas: (linha do ficheiro, subcategoria, modelo, nome do modelo, nome do produto, marca, fornecedor,
  -- código de fornecedor (NULL = não vem), custo, pvp). Cada linha é um modelo.
  CREATE TEMP TABLE _llm_linhas (linha integer PRIMARY KEY, sub text NOT NULL, modelo smallint NOT NULL, modelo_nome text NOT NULL,
                                 nome text NOT NULL, marca text NOT NULL, fornecedor text NOT NULL, cod_forn text,
                                 custo numeric NOT NULL, pvp numeric NOT NULL, modelo_id uuid) ON COMMIT DROP;
  INSERT INTO _llm_linhas (linha, sub, modelo, modelo_nome, nome, marca, fornecedor, cod_forn, custo, pvp) VALUES
    (2, 'CC', 1, 'AMBAR 86 C/ESCORREDOR 1 CUBA', 'Lava-louças AMBAR 86 C/ESCORREDOR 1 CUBA', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 209.28, 327.00),
    (14, 'CC', 2, 'AMBAR 100 C/ESCORREDOR 1 CUBA', 'Lava-louças AMBAR 100 C/ESCORREDOR 1 CUBA', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 219.52, 343.00),
    (7, 'CC', 3, 'AMBAR 105 C/ESCORREDOR 2 CUBAS', 'Lava-louças AMBAR 105 C/ESCORREDOR 2 CUBAS', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 216.32, 338.00),
    (32, 'CC', 4, 'AMBAR 116 C/ESCORREDOR 2 CUBAS', 'Lava-louças AMBAR 116 C/ESCORREDOR 2 CUBAS', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 233.60, 365.00),
    (23, 'CC', 5, 'AMBAR 1 CUBA 40', 'Lava-louças AMBAR 1 CUBA 40', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 204.80, 320.00),
    (5, 'CC', 6, 'AMBAR 1 CUBA 40 N', 'Lava-louças AMBAR 1 CUBA 40 N', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'K0000004', 204.80, 320.00),
    (26, 'CC', 7, 'AMBAR 1 CUBA 57', 'Lava-louças AMBAR 1 CUBA 57', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 230.40, 360.00),
    (18, 'CC', 8, 'AMBAR 1.5 CUBA 55', 'Lava-louças AMBAR 1.5 CUBA 55', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 230.40, 360.00),
    (29, 'CC', 9, 'AMBAR 1 CUBA 70', 'Lava-louças AMBAR 1 CUBA 70', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 259.20, 405.00),
    (27, 'CC', 10, 'AMBAR 1 CUBA 80', 'Lava-louças AMBAR 1 CUBA 80', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 259.20, 405.00),
    (6, 'CC', 11, 'AMBAR 1 CUBA 50', 'Lava-louças AMBAR 1 CUBA 50', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 224.00, 350.00),
    (30, 'CC', 12, 'AMBAR 1 CUBA 50 N', 'Lava-louças AMBAR 1 CUBA 50 N', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'K0000001', 224.00, 350.00),
    (15, 'CI', 1, 'LODY PVD 1 CUBA 40', 'Lava-louças LODY PVD 1 CUBA 40', 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', NULL, 371.84, 581.00),
    (11, 'CI', 2, 'LODY PVD 1 CUBA 50', 'Lava-louças LODY PVD 1 CUBA 50', 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', NULL, 377.60, 590.00),
    (25, 'CI', 3, 'LODY PVD 1 CUBA 70', 'Lava-louças LODY PVD 1 CUBA 70', 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', NULL, 557.44, 871.00),
    (4, 'CI', 4, 'KERAN 80 C/ESCORREDOR 1 CUBA', 'Lava-louças KERAN 80 C/ESCORREDOR 1 CUBA', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '16F7KF1K321AO', 56.32, 88.00),
    (24, 'CI', 5, 'KERAN 86 C/ESCORREDOR 1 CUBA', 'Lava-louças KERAN 86 C/ESCORREDOR 1 CUBA', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '16F7KH1K321A0', 58.24, 91.00),
    (31, 'CI', 6, 'KERAN 100 C/ESCORREDOR 2 CUBAS', 'Lava-louças KERAN 100 C/ESCORREDOR 2 CUBAS', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '16F7KL4K321AO', 75.52, 118.00),
    (33, 'CI', 7, 'KERAN 116 C/ESCORREDOR 2 CUBAS', 'Lava-louças KERAN 116 C/ESCORREDOR 2 CUBAS', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '16F7KO2K321AO', 87.04, 136.00),
    (8, 'CI', 8, 'VELAR 1 CUBA 34', 'Lava-louças VELAR 1 CUBA 34', 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', 'FS200260', 95.36, 149.00),
    (16, 'CI', 9, 'VELAR 1 CUBA 40', 'Lava-louças VELAR 1 CUBA 40', 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', 'FS200261', 99.20, 155.00),
    (3, 'CI', 10, 'VELAR 1 CUBA 45', 'Lava-louças VELAR 1 CUBA 45', 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', 'FS200269', 101.12, 158.00),
    (10, 'CI', 11, 'VELAR 1 CUBA 50', 'Lava-louças VELAR 1 CUBA 50', 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', 'FS200262', 102.40, 160.00),
    (34, 'CI', 12, 'VELAR 1 CUBA 70', 'Lava-louças VELAR 1 CUBA 70', 'FRASA', 'BLUAWAY - Equip. para o Lar e Enêrgias Renov., S.A.', 'FS200263', 176.00, 275.00),
    (9, 'CI', 13, 'UNA 55 - 2 CUBAS', 'Lava-louças UNA 55 - 2 CUBAS', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '18U8EMX0688A0', 235.52, 368.00),
    (19, 'CI', 14, 'UNA 75 - 2 CUBAS', 'Lava-louças UNA 75 - 2 CUBAS', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '18U8ETX0688A0', 239.36, 374.00),
    (21, 'CI', 15, 'BRASILIA 1 CUBA', 'Lava-louças BRASILIA 1 CUBA', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '17G7AA10021A0', 82.56, 129.00),
    (13, 'CI', 16, 'BAHIA 1 CUBA', 'Lava-louças BAHIA 1 CUBA', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '17G8AC10021AO', 84.48, 132.00),
    (20, 'CI', 17, 'LAGUNA 1 CUBA', 'Lava-louças LAGUNA 1 CUBA', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '17G8AD10021AO', 89.60, 140.00),
    (17, 'CI', 18, 'BELÉM 1 CUBA', 'Lava-louças BELÉM 1 CUBA', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '17G8AG10021A0', 94.08, 147.00),
    (22, 'CI', 19, 'DUO 60 - 2 CUBAS', 'Lava-louças DUO 60 - 2 CUBAS', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'K0000570', 128.00, 200.00),
    (12, 'CI', 20, 'DUO 80 - 2 CUBAS', 'Lava-louças DUO 80 - 2 CUBAS', 'Rodi', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '17G1FJ20021AO', 142.08, 222.00);

  -- os dados gerados estão inteiros
  SELECT count(*), count(DISTINCT l.nome), count(DISTINCT (l.sub, l.modelo)) INTO v_n, v_m, v_k FROM _llm_linhas l;
  IF v_n <> c_total OR v_m <> c_total OR v_k <> c_total THEN
    RAISE EXCEPTION 'lava_loucas_mudelar: os dados gerados têm % linhas (% nomes, % modelos) em vez de %.', v_n, v_m, v_k, c_total;
  END IF;
  SELECT count(DISTINCT (l.sub, public.fn_cat_chave_opcao(l.modelo_nome))) INTO v_n FROM _llm_linhas l;
  IF v_n <> c_total THEN RAISE EXCEPTION 'lava_loucas_mudelar: há nomes de modelo repetidos na mesma subcategoria.'; END IF;
  IF EXISTS (SELECT 1 FROM _llm_linhas l
             WHERE NOT EXISTS (SELECT 1 FROM _llm_subs s WHERE s.codigo = l.sub)
                OR NOT EXISTS (SELECT 1 FROM _llm_forn f WHERE f.nome = l.fornecedor)
                OR NOT EXISTS (SELECT 1 FROM _llm_marcas b WHERE b.nome = l.marca)
                OR l.modelo NOT BETWEEN 1 AND 9999 OR l.custo <= 0 OR l.pvp <= 0) THEN
    RAISE EXCEPTION 'lava_loucas_mudelar: há linhas com subcategoria, marca, fornecedor, modelo ou preço fora do esperado.';
  END IF;
  IF (SELECT sum(s.esperados) FROM _llm_subs s) <> c_total THEN
    RAISE EXCEPTION 'lava_loucas_mudelar: as contagens por subcategoria não somam %.', c_total;
  END IF;

  -- as subcategorias (têm de existir as duas)
  FOR r IN SELECT s.codigo, s.nome FROM _llm_subs s ORDER BY s.ordem LOOP
    SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1],
           (array_agg(c.sigla ORDER BY c.created_at, c.id))[1]
      INTO v_n, v_sub, v_ativa, v_txt
    FROM product_categories c
    WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n = 0 THEN
      RAISE NOTICE 'lava_loucas_mudelar: a Mudelar não tem a subcategoria «%» › «%» — nada a fazer.', c_cat_nome, r.nome;
      RETURN;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'lava_loucas_mudelar: há % subcategorias «%» em «%».', v_n, r.nome, c_cat_nome;
    END IF;
    IF NOT v_ativa THEN RAISE EXCEPTION 'lava_loucas_mudelar: a subcategoria «%» está desativada.', r.nome; END IF;
    UPDATE _llm_subs s SET sub_id = v_sub, sigla_antes = v_txt WHERE s.codigo = r.codigo;
  END LOOP;
  -- produtos na categoria ou em QUALQUER subcategoria dela (vivos ou apagados: a sigla da categoria muda e um produto,
  -- mesmo apagado, guarda o SKU com a sigla antiga) → inerte
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org
    AND (p.category_id = v_cat
         OR p.subcategory_id IN (SELECT c.id FROM product_categories c WHERE c.parent_id = v_cat AND c.organization_id = c_org));
  IF v_n > 0 THEN
    RAISE NOTICE 'lava_loucas_mudelar: «%» já tem % produtos — nada a fazer.', c_cat_nome, v_n;
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT l.nome FROM _llm_linhas l);
  IF v_n > 0 THEN
    RAISE NOTICE 'lava_loucas_mudelar: a Mudelar já tem % produtos vivos com nomes do ficheiro — nada a fazer.', v_n;
    RETURN;
  END IF;
  SELECT string_agg(s.codigo || ': ' || pm.name || ' (' || lpad(pm.numero::text, 4, '0') || (CASE WHEN pm.deleted_at IS NOT NULL THEN ', apagado' ELSE '' END) || ')', ', ')
    INTO v_txt
  FROM product_models pm JOIN _llm_subs s ON s.sub_id = pm.subcategory_id
  WHERE pm.organization_id = c_org
    AND EXISTS (SELECT 1 FROM _llm_linhas m
                WHERE m.sub = s.codigo
                  AND (pm.numero = m.modelo OR (pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.modelo_nome)))
                  AND NOT (pm.numero = m.modelo AND pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.modelo_nome)));
  IF v_txt IS NOT NULL THEN
    RAISE NOTICE 'lava_loucas_mudelar: as subcategorias já têm modelos com estes nomes ou números, diferentes dos do ficheiro (%) — nada a fazer.', v_txt;
    RETURN;
  END IF;

  -- ─── Configuração que tem de existir (senão: erro) ───────────────────────────
  IF NOT v_cat_ativa THEN RAISE EXCEPTION 'lava_loucas_mudelar: «%» está desativada.', c_cat_nome; END IF;
  -- a sigla nova da categoria não pode ser de outra categoria de topo da Mudelar
  SELECT string_agg(c.name, ', ') INTO v_txt FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND c.sigla = c_cat_sigla AND c.id <> v_cat;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'lava_loucas_mudelar: a sigla % já é de: %.', c_cat_sigla, v_txt; END IF;
  -- uma irmã que não é destas com uma das siglas: erro (não se lhe mexe). NOT EXISTS e não NOT IN (um NULL na lista
  -- tornava a verificação sempre falsa)
  SELECT string_agg(c.name || ' (' || c.sigla || ')', ', ') INTO v_txt
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
    AND c.sigla IN (SELECT s.codigo FROM _llm_subs s)
    AND NOT EXISTS (SELECT 1 FROM _llm_subs s WHERE s.sub_id = c.id);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'lava_loucas_mudelar: outras subcategorias de «%» já têm as siglas: %.', c_cat_nome, v_txt; END IF;

  SELECT m.user_id INTO v_criador
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND coalesce(m.role_is_client, false) = false
  ORDER BY m.created_at, m.user_id LIMIT 1;
  IF v_criador IS NULL THEN RAISE EXCEPTION 'lava_loucas_mudelar: a Mudelar não tem um membro ativo para created_by.'; END IF;

  -- marcas: uma e ativa, cada
  FOR r IN SELECT b.nome FROM _llm_marcas b ORDER BY b.nome LOOP
    SELECT count(*), (array_agg(x.id ORDER BY x.created_at, x.id))[1], (array_agg(coalesce(x.is_active, true) ORDER BY x.created_at, x.id))[1]
      INTO v_n, v_sup, v_ativa
    FROM brands x WHERE x.organization_id = c_org AND x.deleted_at IS NULL AND public.fn_cat_chave_opcao(x.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n <> 1 THEN RAISE EXCEPTION 'lava_loucas_mudelar: a Mudelar tem % marcas «%» (tem de ter uma).', v_n, r.nome; END IF;
    IF NOT v_ativa THEN RAISE EXCEPTION 'lava_loucas_mudelar: a marca «%» está desativada.', r.nome; END IF;
    UPDATE _llm_marcas b SET id = v_sup WHERE b.nome = r.nome;
  END LOOP;

  -- amostra de SKUs de outras categorias (Duche & Banho, Loiças, Acessórios), para conferir que ficam iguais
  CREATE TEMP TABLE _llm_amostra ON COMMIT DROP AS
  SELECT x.id, x.sku FROM (
    SELECT p.id, p.sku, row_number() OVER (PARTITION BY c.id ORDER BY p.sku, p.id) AS n
    FROM products p JOIN product_categories c ON c.id = p.category_id
    WHERE p.organization_id = c_org AND NOT p.is_deleted AND c.organization_id = c_org AND c.parent_id IS NULL
      AND c.sigla IN ('DB', 'LS', 'ACB')) x
  WHERE x.n <= 3;

  -- ─── Locks (as chaves das funções de gestão do Catálogo) ─────────────────────
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_marcas:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text, 0));
  FOR r IN SELECT s.sub_id FROM _llm_subs s ORDER BY s.sub_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text || ':' || r.sub_id::text, 0));
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_cat:' || c_org::text || ':-', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_cat:' || c_org::text || ':' || v_cat::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_fornecedores:' || c_org::text, 0));

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', v_criador::text, true);

  -- ─── 1. Siglas: categoria (LLC → LLC) e subcategorias (CC/CI, já são) ──────────
  UPDATE product_categories c SET sigla = c_cat_sigla WHERE c.id = v_cat AND c.sigla IS DISTINCT FROM c_cat_sigla;
  IF EXISTS (SELECT 1 FROM _llm_subs a JOIN _llm_subs b ON a.codigo = b.sigla_antes AND a.codigo <> b.codigo) THEN
    RAISE EXCEPTION 'lava_loucas_mudelar: uma sigla nova de subcategoria é a antiga de outra (trocar em dois passos).';
  END IF;
  UPDATE product_categories c SET sigla = s.codigo FROM _llm_subs s WHERE c.id = s.sub_id AND c.sigla IS DISTINCT FROM s.codigo;

  -- ─── 2. Os modelos, um por linha, com os números do ficheiro ─────────────────
  SELECT count(*) FILTER (WHERE pm.is_active), count(*) INTO v_n, v_m
  FROM product_models pm WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL;
  IF v_n + c_total > c_max_modelos_ativos OR v_m + c_total > c_max_modelos_vivos THEN
    RAISE EXCEPTION 'lava_loucas_mudelar: a Mudelar passaria o teto de modelos (% ativos, % vivos).', v_n, v_m;
  END IF;
  FOR r IN SELECT l.linha, l.sub, l.modelo, l.modelo_nome, s.sub_id FROM _llm_linhas l JOIN _llm_subs s ON s.codigo = l.sub
           ORDER BY s.ordem, l.modelo LOOP
    v_mod := NULL;
    SELECT pm.id, pm.is_active INTO v_mod, v_ativa FROM product_models pm
    WHERE pm.organization_id = c_org AND pm.subcategory_id = r.sub_id AND pm.numero = r.modelo AND pm.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(r.modelo_nome);
    IF v_mod IS NOT NULL AND NOT v_ativa THEN
      RAISE EXCEPTION 'lava_loucas_mudelar: o modelo % (% %) já existe e está desativado.', r.modelo_nome, r.sub, lpad(r.modelo::text, 4, '0');
    END IF;
    IF v_mod IS NULL THEN
      INSERT INTO product_models (organization_id, subcategory_id, name, numero, is_active, created_by)
      VALUES (c_org, r.sub_id, r.modelo_nome, r.modelo, true, v_criador)
      RETURNING id INTO v_mod;
    END IF;
    UPDATE _llm_linhas l SET modelo_id = v_mod WHERE l.linha = r.linha;
  END LOOP;

  -- ─── 3. Unidade «un» e fornecedores ──────────────────────────────────────────
  v_uom := public.fn_cat_unidade(c_org, c_unidade);
  IF v_uom IS NULL THEN RAISE EXCEPTION 'lava_loucas_mudelar: sem unidade «%».', c_unidade; END IF;
  FOR r IN SELECT f.nome FROM _llm_forn f ORDER BY f.nome LOOP
    v_sup := NULL;
    SELECT s.id, coalesce(s.is_active, true) INTO v_sup, v_ativa FROM suppliers s
    WHERE s.organization_id = c_org AND s.deleted_at IS NULL AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(r.nome)
    ORDER BY s.created_at, s.id LIMIT 1;
    IF v_sup IS NOT NULL AND NOT v_ativa THEN
      RAISE EXCEPTION 'lava_loucas_mudelar: o fornecedor «%» da Mudelar está desativado.', r.nome;
    END IF;
    IF v_sup IS NULL THEN
      INSERT INTO suppliers (organization_id, name, is_active, created_by)
      VALUES (c_org, public.fn_cat_limpar_nome(r.nome), true, v_criador)
      RETURNING id INTO v_sup;
      UPDATE _llm_forn f SET id = v_sup, criado = true WHERE f.nome = r.nome;
      v_forn_criados := v_forn_criados || r.nome || '; ';
    ELSE
      UPDATE _llm_forn f SET id = v_sup WHERE f.nome = r.nome;
    END IF;
  END LOOP;

  -- ─── 4. As linhas a gravar, com o SKU final (CAT-SUB-NNNN; sem atributos não há mais segmentos) ─────────────
  CREATE TEMP TABLE _llm ON COMMIT DROP AS
  SELECT gen_random_uuid() AS id, l.linha, l.sub, s.sub_id, l.modelo, l.modelo_id, l.nome, l.custo, l.pvp,
         b.id AS marca_id, l.marca, f.id AS forn_id, l.fornecedor, l.cod_forn, NULL::text AS sku
  FROM _llm_linhas l
  JOIN _llm_subs s ON s.codigo = l.sub
  JOIN _llm_marcas b ON b.nome = l.marca
  JOIN _llm_forn f ON f.nome = l.fornecedor;
  SELECT count(*) INTO v_n FROM _llm;
  IF v_n <> c_total THEN RAISE EXCEPTION 'lava_loucas_mudelar: % linhas a gravar em vez de %.', v_n, c_total; END IF;
  IF EXISTS (SELECT 1 FROM _llm b WHERE b.sub_id IS NULL OR b.modelo_id IS NULL OR b.marca_id IS NULL OR b.forn_id IS NULL) THEN
    RAISE EXCEPTION 'lava_loucas_mudelar: há linhas sem subcategoria, modelo, marca ou fornecedor resolvidos.';
  END IF;
  UPDATE _llm b SET sku = concat_ws('-', c_cat_sigla, b.sub, lpad(b.modelo::text, 4, '0'));

  SELECT string_agg(x.sku || ' ×' || x.n || ' (' || x.nomes || ')', '; ') INTO v_txt
  FROM (SELECT b.sku, count(*) AS n, string_agg(b.nome, ' | ' ORDER BY b.linha) AS nomes FROM _llm b
        GROUP BY b.sku HAVING count(*) > 1 ORDER BY b.sku LIMIT 10) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'lava_loucas_mudelar: SKUs repetidos: %', v_txt; END IF;
  SELECT string_agg(b.sku || ' (' || p.name || ')', '; ') INTO v_txt
  FROM (SELECT b2.sku FROM _llm b2 JOIN products p2 ON p2.organization_id = c_org AND p2.sku = b2.sku ORDER BY b2.sku LIMIT 10) b
  JOIN products p ON p.organization_id = c_org AND p.sku = b.sku;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'lava_loucas_mudelar: SKUs já usados noutros produtos da Mudelar: %', v_txt; END IF;
  v_regex := '^' || c_cat_sigla || '-(' || (SELECT string_agg(s.codigo, '|' ORDER BY s.ordem) FROM _llm_subs s) || ')-[0-9]{4}$';
  IF EXISTS (SELECT 1 FROM _llm b WHERE b.sku !~ v_regex) THEN
    RAISE EXCEPTION 'lava_loucas_mudelar: SKU fora do formato (ex.: %).', (SELECT b.sku FROM _llm b WHERE b.sku !~ v_regex LIMIT 1);
  END IF;

  -- ─── 5. Gravar (auditoria normal, linha a linha) ─────────────────────────────
  INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                        manages_stock, created_by, tipo_catalogo, category_id, subcategory_id, model_id, brand_id, uom_id,
                        supplier_id, fornecedor_livre, sku_gerado)
  SELECT b.id, c_org, b.sku, b.nome, 'active'::product_status, true, true, true, false, false,
         true, v_criador, 'produto', v_cat, b.sub_id, b.modelo_id, b.marca_id, v_uom,
         b.forn_id, public.fn_cat_limpar_nome(b.fornecedor), true
  FROM _llm b ORDER BY b.linha;

  INSERT INTO product_organizations (product_id, organization_id, created_by)
  SELECT b.id, c_org, v_criador FROM _llm b ORDER BY b.linha;

  INSERT INTO product_prices (product_id, currency, price, preco_exato, valid_from, created_by, price_type, vat_rate)
  SELECT b.id, 'EUR'::currency_code, round(b.custo, 2), round(b.custo, 6), v_agora, v_criador, 'purchase'::price_type, c_iva
  FROM _llm b
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.pvp, 2), NULL::numeric, v_agora + interval '1 microsecond', v_criador, 'retail'::price_type, c_iva
  FROM _llm b;

  -- como cat_ligar_fornecedor_produto: preferido, preço = custo; supplier_sku = código de fornecedor, ou o SKU se não vier
  INSERT INTO item_suppliers (organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price, currency,
                              is_preferred, is_active, created_by, preco_data)
  SELECT c_org, 'product', b.id, b.forn_id, NULL, coalesce(b.cod_forn, b.sku), round(b.custo, 2), 'EUR', true, true, v_criador, current_date
  FROM _llm b ORDER BY b.linha;

  -- ─── 6. Conferir ──────────────────────────────────────────────────────────────
  -- (as contagens são feitas sobre a BASE e comparadas com o esperado; cada IF dispara quando DIVERGE)
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _llm_subs s) AND NOT p.is_deleted;
  IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: % produtos nas subcategorias em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(s.nome || ' ' || coalesce(x.n, 0) || ' em vez de ' || s.esperados, '; ') INTO v_txt
  FROM _llm_subs s
  LEFT JOIN (SELECT p.subcategory_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.subcategory_id) x ON x.subcategory_id = s.sub_id
  WHERE coalesce(x.n, 0) <> s.esperados;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: contagem por subcategoria errada: %', v_txt; END IF;
  -- cada modelo com exatamente 1 produto (LEFT JOIN: um modelo sem produto conta 0 e falha)
  SELECT string_agg(l.sub || lpad(l.modelo::text, 4, '0') || ' ' || coalesce(x.n, 0), '; ') INTO v_txt
  FROM _llm_linhas l
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.model_id) x ON x.model_id = l.modelo_id
  WHERE coalesce(x.n, 0) <> 1;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: modelos sem exatamente um produto: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM product_models pm JOIN _llm_linhas l ON l.modelo_id = pm.id JOIN _llm_subs s ON s.codigo = l.sub
  WHERE pm.organization_id = c_org AND pm.subcategory_id = s.sub_id AND pm.deleted_at IS NULL AND pm.is_active
    AND pm.numero = l.modelo AND pm.name = l.modelo_nome;
  SELECT count(*) INTO v_m FROM product_models pm
  WHERE pm.organization_id = c_org AND pm.subcategory_id IN (SELECT s.sub_id FROM _llm_subs s);
  IF v_n <> c_total OR v_m <> c_total THEN
    RAISE EXCEPTION 'Conferir: % modelos certos e % nas subcategorias, em vez de %.', v_n, v_m, c_total;
  END IF;

  -- cada produto como a sua linha; conta os que NÃO batem (LEFT JOIN + NOT coalesce(…, false): um produto, preço ou
  -- fornecedor em falta dá NULL e também conta como errado)
  SELECT count(*) INTO v_n
  FROM _llm b
  LEFT JOIN products p ON p.id = b.id
  LEFT JOIN product_prices pc ON pc.product_id = b.id AND pc.price_type = 'purchase'
  LEFT JOIN product_prices pv ON pv.product_id = b.id AND pv.price_type = 'retail'
  LEFT JOIN item_suppliers i ON i.product_id = b.id AND i.deleted_at IS NULL
  WHERE NOT coalesce(p.organization_id = c_org AND p.name = b.nome AND p.sku = b.sku AND p.sku_gerado AND p.model_id = b.modelo_id
        AND p.category_id = v_cat AND p.subcategory_id = b.sub_id AND p.brand_id = b.marca_id AND p.marca_livre = b.marca
        AND p.uom_id = v_uom AND p.unidade = c_unidade AND p.status = 'active'::product_status AND p.tipo_catalogo = 'produto'
        AND p.manages_stock AND p.is_active AND NOT p.is_deleted AND p.supplier_id = b.forn_id
        AND p.fornecedor_livre = public.fn_cat_limpar_nome(b.fornecedor)
        AND pc.price = round(b.custo, 2) AND pc.preco_exato = round(b.custo, 6) AND pc.vat_rate = c_iva
        AND pv.price = round(b.pvp, 2) AND pv.vat_rate = c_iva
        AND i.organization_id = c_org AND i.supplier_id = b.forn_id AND i.is_preferred AND i.is_active
        AND i.purchase_price = round(b.custo, 2) AND i.supplier_sku = coalesce(b.cod_forn, p.sku),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos não ficaram como a linha do ficheiro.', v_n; END IF;
  -- nem linhas a mais: 0 valores de atributos, 2 preços, 1 fornecedor e 1 product_organizations por produto
  SELECT (SELECT count(*) FROM product_attribute_values v JOIN _llm b ON b.id = v.product_id),
         (SELECT count(*) FROM product_prices x JOIN _llm b ON b.id = x.product_id)
    INTO v_n, v_m;
  IF v_n <> 0 OR v_m <> 2 * c_total THEN
    RAISE EXCEPTION 'Conferir: % valores de atributos (esperados 0) e % preços (esperados %).', v_n, v_m, 2 * c_total;
  END IF;
  SELECT (SELECT count(*) FROM item_suppliers x JOIN _llm b ON b.id = x.product_id),
         (SELECT count(*) FROM product_organizations x JOIN _llm b ON b.id = x.product_id)
    INTO v_n, v_m;
  IF v_n <> c_total OR v_m <> c_total THEN
    RAISE EXCEPTION 'Conferir: % ligações a fornecedor e % product_organizations (esperados %).', v_n, v_m, c_total;
  END IF;
  -- os códigos de fornecedor que vieram no ficheiro ficaram todos (conta os que FALTAM)
  SELECT count(*) INTO v_n FROM _llm b
  WHERE b.cod_forn IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM item_suppliers i WHERE i.product_id = b.id AND i.deleted_at IS NULL AND i.supplier_sku = b.cod_forn);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % códigos de fornecedor do ficheiro não ficaram em supplier_sku.', v_n; END IF;

  -- SKUs: únicos, no formato, e iguais ao que a regra do Catálogo calcula a partir do que ficou gravado (todos)
  SELECT count(*), count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ v_regex) INTO v_n, v_m, v_k
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _llm_subs s) AND NOT p.is_deleted;
  IF v_m <> c_total OR v_n <> c_total THEN RAISE EXCEPTION 'Conferir: SKUs não únicos (% distintos em %).', v_m, v_n; END IF;
  IF v_k > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs fora do formato %.', v_k, v_regex; END IF;
  -- conta os que DIVERGEM do recalculado (ou sem prefixo, ou com faltas); tem de dar 0
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
          WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _llm_subs s) AND NOT p.is_deleted) x
        WHERE x.calc IS DISTINCT FROM x.sku OR x.prefixo IS NULL OR x.faltas IS DISTINCT FROM '[]') y;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs diferentes do recalculado pela regra do Catálogo (ex.: %).', v_n, v_txt; END IF;

  -- todos com cat_prever_sku_modelo, como um membro da Mudelar com products.edit (só leitura; claims locais)
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE NOTICE 'lava_loucas_mudelar: sem membro da Mudelar com products.edit — a comparação com cat_prever_sku_modelo ficou por fazer (o recálculo de todos foi feito).';
  ELSE
    v_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    v_n := 0;
    FOR r IN SELECT b.id, b.sku, b.sub_id, b.modelo_id FROM _llm b ORDER BY b.linha LOOP
      v_prev := public.cat_prever_sku_modelo(c_org, v_cat, r.sub_id, r.modelo_id, '[]'::jsonb, r.id);
      IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Conferir: cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
      END IF;
      v_n := v_n + 1;
    END LOOP;
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: só % de % comparados com cat_prever_sku_modelo.', v_n, c_total; END IF;
  END IF;

  -- as siglas: categoria e subcategorias (conta as CERTAS e compara com o total)
  IF NOT EXISTS (SELECT 1 FROM product_categories c WHERE c.id = v_cat AND c.sigla = c_cat_sigla AND c.parent_id IS NULL
                 AND c.organization_id = c_org AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Conferir: a sigla de «%» não ficou %.', c_cat_nome, c_cat_sigla;
  END IF;
  SELECT count(*) INTO v_n FROM _llm_subs s JOIN product_categories c ON c.id = s.sub_id
  WHERE c.sigla = s.codigo AND c.parent_id = v_cat AND c.organization_id = c_org AND c.deleted_at IS NULL AND coalesce(c.is_active, true);
  IF v_n <> (SELECT count(*) FROM _llm_subs) THEN
    RAISE EXCEPTION 'Conferir: só % das % subcategorias ficaram com a sigla certa.', v_n, (SELECT count(*) FROM _llm_subs);
  END IF;

  -- nada foi escrito fora da Mudelar: nenhuma linha de outra organização tem o xmin desta transação
  v_xid := (txid_current() % 4294967296)::text;
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
    UNION ALL SELECT 'brands', count(*) FROM brands x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: foram escritas linhas fora da Mudelar: %', v_txt; END IF;
  IF NOT EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND p.xmin::text = v_xid
                 AND p.subcategory_id IN (SELECT s.sub_id FROM _llm_subs s)) THEN
    RAISE EXCEPTION 'Conferir: os produtos importados não têm o xmin desta transação: a verificação de «nada fora da Mudelar» não vale.';
  END IF;
  -- nenhum outro produto da Mudelar foi escrito nesta transação, nem as categorias além desta e das 2 subcategorias
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _llm b WHERE b.id = p.id);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % outros produtos da Mudelar foram escritos.', v_n; END IF;
  SELECT count(*) INTO v_n FROM product_categories c
  WHERE c.organization_id = c_org AND c.xmin::text = v_xid AND c.id <> v_cat AND NOT EXISTS (SELECT 1 FROM _llm_subs s WHERE s.sub_id = c.id);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % outras categorias da Mudelar foram escritas.', v_n; END IF;
  -- a amostra de SKUs de Duche & Banho, Loiças e Acessórios ficou igual (LEFT JOIN: um produto desaparecido também conta)
  SELECT count(*), string_agg(a.sku, ', ') INTO v_n, v_txt
  FROM _llm_amostra a LEFT JOIN products p ON p.id = a.id
  WHERE NOT coalesce(p.sku = a.sku AND NOT p.is_deleted AND p.organization_id = c_org, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs da amostra de outras categorias mudaram: %', v_n, v_txt; END IF;
  IF (SELECT count(*) FROM _llm_amostra) = 0 THEN
    RAISE NOTICE 'lava_loucas_mudelar: sem produtos em DB/LS/ACB para a amostra de SKUs (a verificação pelo xmin foi feita).';
  END IF;

  RAISE NOTICE 'lava_loucas_mudelar: % produtos em «%» (% modelos, SKU %-SUB-NNNN). Sigla da categoria: % → %. Fornecedores criados: %. Amostra de outras categorias: % SKUs iguais. Conferido.',
    c_total, c_cat_nome, c_total, c_cat_sigla, coalesce(v_cat_sigla_antes, 'nenhuma'), c_cat_sigla,
    coalesce(nullif(v_forn_criados, ''), 'nenhum'), (SELECT count(*) FROM _llm_amostra);
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
