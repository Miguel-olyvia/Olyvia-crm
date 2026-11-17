-- =============================================================================
-- Catálogo — importação das COLUNAS DE DUCHE e CHUVEIROS HIGIÉNICOS da MUDELAR (Excel do utilizador, 315ba043-Colunas_de_Duche__Chuveiros_Higi_nicos.xlsx).
-- Base de RH (uetjghdkwbywbftedtth). Ficheiro GERADO por script (gerar.js) a partir do Excel: as linhas de dados
-- abaixo não se editam à mão — regeneram-se.
-- =============================================================================
--
-- Decisões do utilizador (17/11):
--   * Um produto = modelo + combinação de atributos: 91 produtos (as 91 linhas do Excel), todos com o
--     estado do Excel (Draft → status 'draft', is_active true). Categoria «Duche & Banho», marca e fornecedor do Excel.
--   * O SKU antigo do Excel NÃO se guarda. O SKU é o do Catálogo: SIGLA_CAT-SIGLA_SUB-NNNN(modelo)-<siglas dos atributos
--     pela ordem configurada da Mudelar>, calculado com fn_cat_sku_partes (a regra de cat_gerar_sku_produto).
--   * Preço Compra arredondado a 2 casas (vem com casas a mais); Desconto 1 e Desconto 2 ignoram-se; Preço Grossista e
--     Preço Distribuidor são todos 0 no Excel e por isso não se grava nenhum (a regra é gravar só quando > 0). IVA 23.
--   * Fornecedor: o que já existe na Mudelar (pelo nome); o código do fornecedor do Excel fica em item_suppliers.supplier_sku.
--   * Subcategorias «Colunas Duche» (CD, 74 produtos) e «Chuveiro Higiénico» (CH, 17) de «Duche & Banho». Marcas GME, Duplach e
--     Moovlux; fornecedores Anlorbel (GME e Moovlux) e «DUPLACH Group, SAU» (Duplach), os que já existem.
--   * 19 modelos = o nome sem a cor (nem a marca nem a medida), com o número do SKU antigo (já sem buracos):
--     Colunas Duche: 0001 INVERTER R, 0002 INVERTER C, 0003 QUADRA ELITE, 0004 ROUND ELITE, 0005 NIGEL, 0006 NILO, 0007 ELBA,
--     0008 Chuveiro de encastre SIRIO, 0009 Braço de Teto SIRIO, 0010 Chuveiro de encastre ORION, 0011 Braço de Teto ORION,
--     0012 HIDROMASSAGEM GOTCHA, 0013 Braço de Parede SIRIO, 0014 Prato Redondo SIRIO, 0015 Braço de Parede ORION, 0016 Prato ORION.
--     Chuveiro Higiénico: 0001 ROUND MONOCOMANDO, 0002 ORION MONOCOMANDO, 0003 WATER BLISS ÁGUA FRIA.
--   * Cor como atributo (CROMO, NEGRO, ORO, NIQUEL, TITANIO, COBRE, BRANCO, ROSA GOLD ESCOVADO, GUN METAL), reutilizando as
--     opções existentes pelo nome (BRANCO = «Branco», GUN METAL = «Gun Metal»).
--   * «Prato 25x25 ORION»: Medida 2D 25X25 cm; o modelo é «Prato ORION» e o nome do produto fica o do Excel.
--
-- Decisões desta migration (a confirmar pelo utilizador):
--   * ROSA GOLD ESCOVADO: a Mudelar já tem «Rosa Gold» (RG), mas o Excel diz «ROSA GOLD ESCOVADO»; como o nome não é igual,
--     cria-se a opção «ROSA GOLD ESCOVADO» (sigla livre) em vez de a juntar à «Rosa Gold» (só o WATER BLISS usa esta cor).
--   * Estado: o Excel diz «Draft» e o produto entra em draft.
--   * Nome do modelo «Chuveiro de encastre SIRIO»: o Excel diz «Chuveiro de encastre de SIRIO» (com um «de» a mais face ao ORION).
--   * Nome do produto: o do Excel, sem mexer.
--   * Auditoria normal, linha a linha, com app.audit_source = 'migration:catalogo_colunas_duche_mudelar'. Escrita só na Mudelar.
--
-- GUARDA (inerte: RAISE NOTICE e sai sem escrever nada) se: a organização 3242e925-… não existir com o nome 'Mudelar';
-- faltar a versão dos modelos (20270118300000); faltar «Duche & Banho» ou uma das subcategorias; já estiver aplicada
-- (todos os produtos com os nomes do Excel já existem); as subcategorias já tiverem produtos que não são estes; ou já
-- houver modelos com estes nomes/números que não sejam exatamente os desta importação.
-- Falha (RAISE EXCEPTION, nada fica) se: só uma parte dos produtos já existir; faltar marca, atributo ou membro para
-- created_by; uma opção estiver ambígua ou desativada; um fornecedor estiver desativado; o SKU calculado tiver faltas,
-- for repetido ou já usado noutro produto da Mudelar.
-- Idempotente e independente: procura sempre pelo nome antes de criar (opções de Cor e de Largura, modelos, fornecedores),
-- por isso pode ser aplicada antes ou depois das outras importações do Catálogo.
--
-- Conferir no fim (conta o que está ERRADO e faz RAISE se não for 0): 91 produtos e a contagem por modelo; os
-- modelos; cada produto como a linha do Excel (nome, SKU, modelo, marca, fornecedor, código do fornecedor, estado,
-- unidade, custo, PVP, atributos); nem linhas a mais; SKUs únicos, no formato, iguais ao recalculado e a
-- cat_prever_sku_modelo; nenhuma linha de outra organização com o xmin desta transação.
--
-- ORDEM: depois de 20270118300000_catalogo_modelos_e_sku_por_modelo.sql e de 20270119000000 (atributo Largura).
-- Teste: supabase/tests/catalogo_colunas_duche_mudelar.test.sql (BEGIN … ROLLBACK, só leitura; o passo 0 falha antes).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '5min';

DO $mig$
DECLARE
  c_org        constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte      constant text    := 'migration:catalogo_colunas_duche_mudelar';
  c_total      constant integer := 91;
  c_n_modelos  constant integer := 19;
  c_n_valores  constant integer := 94;
  c_iva        constant numeric := 23;
  c_cat_nome   constant text    := 'Duche & Banho';
  c_cat_sigla  constant text    := 'DB';
  c_unidade    constant text    := 'un';
  c_max_modelos_ativos constant integer := 2000;
  c_max_modelos_vivos  constant integer := 10000;
  v_agora   timestamptz := clock_timestamp();
  v_n bigint; v_m bigint; v_k bigint; v_xid text; v_txt text; v_nome text; v_criadas text := ''; v_forn_criados text := '';
  v_cat uuid; v_cat_sigla text; v_cat_ativa boolean; v_sub uuid; v_sub_sigla text; v_sub_ativa boolean;
  v_uom uuid; v_criador uuid; v_a_cor uuid; v_a_larg uuid; v_a_med uuid; v_g_cor uuid; v_g_larg uuid; v_med_unit text;
  v_opc uuid; v_ativa boolean; v_mod uuid; v_regex text; v_auth uuid; v_claims text; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  -- ─── 0. Guarda (inerte) ───────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'catalogo_colunas_duche_mudelar: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  IF to_regclass('public.product_models') IS NULL
     OR to_regprocedure('public.fn_cat_modelo_numero(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)') IS NULL THEN
    RAISE NOTICE 'catalogo_colunas_duche_mudelar: falta a versão dos modelos (20270118300000) — nada a fazer.';
    RETURN;
  END IF;
  SELECT string_agg(s, ', ') INTO v_txt
  FROM unnest(ARRAY['public.fn_cat_chave_opcao(text)', 'public.fn_cat_limpar_nome(text)', 'public.fn_cat_num_texto(numeric)',
                    'public.fn_cat_grupo_do_atributo(uuid,uuid)', 'public.fn_cat_medida_ler(jsonb,text)',
                    'public.fn_cat_sku_medida(jsonb)', 'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)',
                    'public.fn_cat_sigla_opcao_livre(uuid,text,uuid)', 'public.fn_cat_unidade(uuid,text)',
                    'public.has_anew_permission_in_org(uuid,text,uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: faltam funções do Catálogo (%).', v_txt; END IF;

  -- categoria
  SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(c.sigla ORDER BY c.created_at, c.id))[1],
         (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1]
    INTO v_n, v_cat, v_cat_sigla, v_cat_ativa
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(c_cat_nome);
  IF v_n = 0 THEN
    RAISE NOTICE 'catalogo_colunas_duche_mudelar: a Mudelar não tem a categoria «%» — nada a fazer.', c_cat_nome;
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: há % categorias «%» na Mudelar.', v_n, c_cat_nome;
  END IF;
  IF v_cat_sigla IS DISTINCT FROM c_cat_sigla OR NOT v_cat_ativa THEN
    RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: «%» tem a sigla «%» (esperada %) ou está desativada.', c_cat_nome, v_cat_sigla, c_cat_sigla;
  END IF;

  -- ─── Os dados do Excel (gerados) ──────────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._imp_subs, pg_temp._imp_modelos, pg_temp._imp_opcoes, pg_temp._imp_marcas, pg_temp._imp_forn,
                       pg_temp._imp_linhas, pg_temp._imp_b, pg_temp._imp;

  CREATE TEMP TABLE _imp_subs (nome text PRIMARY KEY, sigla text NOT NULL, sub_id uuid) ON COMMIT DROP;
  INSERT INTO _imp_subs (nome, sigla) VALUES
    ('Chuveiro Higiénico', 'CH'),
    ('Colunas Duche', 'CD');

  -- os modelos: subcategoria, número (NNNN do SKU), nome, quantos produtos tem
  CREATE TEMP TABLE _imp_modelos (sub text NOT NULL, numero smallint NOT NULL, nome text NOT NULL, esperados integer NOT NULL,
                                  modelo_id uuid, PRIMARY KEY (sub, numero)) ON COMMIT DROP;
  INSERT INTO _imp_modelos (sub, numero, nome, esperados) VALUES
    ('Chuveiro Higiénico', 1, 'ROUND MONOCOMANDO', 6),
    ('Chuveiro Higiénico', 2, 'ORION MONOCOMANDO', 6),
    ('Chuveiro Higiénico', 3, 'WATER BLISS ÁGUA FRIA', 5),
    ('Colunas Duche', 1, 'INVERTER R', 7),
    ('Colunas Duche', 2, 'INVERTER C', 7),
    ('Colunas Duche', 3, 'QUADRA ELITE', 2),
    ('Colunas Duche', 4, 'ROUND ELITE', 6),
    ('Colunas Duche', 5, 'NIGEL', 3),
    ('Colunas Duche', 6, 'NILO', 4),
    ('Colunas Duche', 7, 'ELBA', 2),
    ('Colunas Duche', 8, 'Chuveiro de encastre SIRIO', 7),
    ('Colunas Duche', 9, 'Braço de Teto SIRIO', 7),
    ('Colunas Duche', 10, 'Chuveiro de encastre ORION', 3),
    ('Colunas Duche', 11, 'Braço de Teto ORION', 3),
    ('Colunas Duche', 12, 'HIDROMASSAGEM GOTCHA', 3),
    ('Colunas Duche', 13, 'Braço de Parede SIRIO', 7),
    ('Colunas Duche', 14, 'Prato Redondo SIRIO', 7),
    ('Colunas Duche', 15, 'Braço de Parede ORION', 3),
    ('Colunas Duche', 16, 'Prato ORION', 3);

  -- as opções de Cor e de Largura que os produtos usam (procuradas pelo nome; criadas se faltarem)
  CREATE TEMP TABLE _imp_opcoes (papel text NOT NULL, nome text NOT NULL, ordem integer NOT NULL, grupo uuid, opcao_id uuid,
                                 valor text, sigla text, PRIMARY KEY (papel, nome)) ON COMMIT DROP;
  INSERT INTO _imp_opcoes (papel, nome, ordem) VALUES
    ('cor', 'CROMO', 1),
    ('cor', 'NEGRO', 2),
    ('cor', 'ORO', 3),
    ('cor', 'NIQUEL', 4),
    ('cor', 'TITANIO', 5),
    ('cor', 'COBRE', 6),
    ('cor', 'BRANCO', 7),
    ('cor', 'ROSA GOLD ESCOVADO', 8),
    ('cor', 'GUN METAL', 9);

  CREATE TEMP TABLE _imp_marcas (nome text PRIMARY KEY, id uuid, nome_db text) ON COMMIT DROP;
  INSERT INTO _imp_marcas (nome) VALUES
    ('Duplach'),
    ('GME'),
    ('Moovlux');
  CREATE TEMP TABLE _imp_forn (nome text PRIMARY KEY, id uuid, criado boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _imp_forn (nome) VALUES
    ('ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('DUPLACH Group, SAU');

  -- as 91 linhas do Excel, pela ordem do Excel
  CREATE TEMP TABLE _imp_linhas (linha integer PRIMARY KEY, sub text NOT NULL, modelo smallint NOT NULL, nome text NOT NULL,
                                 marca text NOT NULL, forn text NOT NULL, cod text, custo numeric NOT NULL, pvp numeric NOT NULL,
                                 cor text, larg text, ml integer, mc integer, status text NOT NULL) ON COMMIT DROP;
  INSERT INTO _imp_linhas (linha, sub, modelo, nome, marca, forn, cod, custo, pvp, cor, larg, ml, mc, status) VALUES
    (2, 'Colunas Duche', 1, 'Coluna de Duche INVERTER R CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3080', 104.40, 174.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (3, 'Colunas Duche', 1, 'Coluna de Duche INVERTER R NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3135', 127.80, 213.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (4, 'Colunas Duche', 1, 'Coluna de Duche INVERTER R ORO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3080OR', 161.40, 269.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (5, 'Colunas Duche', 1, 'Coluna de Duche INVERTER R NIQUEL', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3080NK', 139.80, 233.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (6, 'Colunas Duche', 1, 'Coluna de Duche INVERTER R TITANIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3080T', 161.40, 269.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (7, 'Colunas Duche', 1, 'Coluna de Duche INVERTER R COBRE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3080CB', 161.40, 269.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (8, 'Colunas Duche', 1, 'Coluna de Duche INVERTER R BRANCO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3080BL', 132.60, 221.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (9, 'Colunas Duche', 2, 'Coluna de Duche INVERTER C CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3081', 132.60, 221.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (10, 'Colunas Duche', 2, 'Coluna de Duche INVERTER C NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3136', 157.20, 262.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (11, 'Colunas Duche', 2, 'Coluna de Duche INVERTER C ORO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3081OR', 191.40, 319.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (12, 'Colunas Duche', 2, 'Coluna de Duche INVERTER C NIQUEL', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3081NK', 171.60, 286.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (13, 'Colunas Duche', 2, 'Coluna de Duche INVERTER C TITANIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3081T', 191.40, 319.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (14, 'Colunas Duche', 2, 'Coluna de Duche INVERTER C COBRE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3081CB', 191.40, 319.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (15, 'Colunas Duche', 2, 'Coluna de Duche INVERTER C BRANCO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3081BL', 168.00, 280.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (16, 'Colunas Duche', 3, 'Coluna de Duche QUADRA ELITE CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3012', 203.40, 339.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (17, 'Colunas Duche', 3, 'Coluna de Duche QUADRA ELITE NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3095', 217.20, 362.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (18, 'Colunas Duche', 4, 'Coluna de Duche ROUND ELITE CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3014', 156.60, 261.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (19, 'Colunas Duche', 4, 'Coluna de Duche ROUND ELITE NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3097', 173.40, 289.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (20, 'Colunas Duche', 4, 'Coluna de Duche ROUND ELITE ORO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3250OR', 197.40, 329.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (21, 'Colunas Duche', 4, 'Coluna de Duche ROUND ELITE NIQUEL', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3250NK', 197.40, 329.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (22, 'Colunas Duche', 4, 'Coluna de Duche ROUND ELITE TITANIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3250T', 197.40, 329.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (23, 'Colunas Duche', 4, 'Coluna de Duche ROUND ELITE COBRE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3250CB', 197.40, 329.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (24, 'Colunas Duche', 5, 'Coluna de Duche NIGEL CROMO', 'Duplach', 'DUPLACH Group, SAU', 'NIGEL_C', 150.15, 273.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (25, 'Colunas Duche', 5, 'Coluna de Duche NIGEL NEGRO', 'Duplach', 'DUPLACH Group, SAU', 'NIGEL_N', 141.35, 257.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (26, 'Colunas Duche', 5, 'Coluna de Duche NIGEL BRANCO', 'Duplach', 'DUPLACH Group, SAU', 'NIGEL_B', 141.35, 257.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (27, 'Colunas Duche', 6, 'Coluna de Duche NILO CROMO', 'Duplach', 'DUPLACH Group, SAU', 'NILO_C', 199.10, 362.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (28, 'Colunas Duche', 6, 'Coluna de Duche NILO NEGRO', 'Duplach', 'DUPLACH Group, SAU', 'NILO_N', 198.55, 361.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (29, 'Colunas Duche', 6, 'Coluna de Duche NILO ORO', 'Duplach', 'DUPLACH Group, SAU', 'NILO_B', 243.10, 442.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (30, 'Colunas Duche', 6, 'Coluna de Duche NILO TITANIO', 'Duplach', 'DUPLACH Group, SAU', 'NILO_A', 212.85, 387.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (31, 'Colunas Duche', 7, 'Coluna de Duche ELBA NEGRO', 'Duplach', 'DUPLACH Group, SAU', 'ELBA_N', 142.45, 259.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (32, 'Colunas Duche', 7, 'Coluna de Duche ELBA BRANCO', 'Duplach', 'DUPLACH Group, SAU', 'ELBA_B', 142.45, 259.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (33, 'Colunas Duche', 8, 'Chuveiro de encastre de SIRIO CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3086', 101.40, 169.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (34, 'Colunas Duche', 8, 'Chuveiro de encastre de SIRIO NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3087', 113.40, 189.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (35, 'Colunas Duche', 8, 'Chuveiro de encastre de SIRIO ORO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3086OR', 143.40, 239.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (36, 'Colunas Duche', 8, 'Chuveiro de encastre de SIRIO NIQUEL', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3086NK', 131.40, 219.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (37, 'Colunas Duche', 8, 'Chuveiro de encastre de SIRIO TITANIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3086T', 143.40, 239.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (38, 'Colunas Duche', 8, 'Chuveiro de encastre de SIRIO COBRE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3086CB', 143.40, 239.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (39, 'Colunas Duche', 8, 'Chuveiro de encastre de SIRIO BRANCO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3086BL', 113.40, 189.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (40, 'Colunas Duche', 9, 'Braço de Teto SIRIO CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3026', 9.00, 15.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (41, 'Colunas Duche', 9, 'Braço de Teto SIRIO NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3162', 9.60, 16.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (42, 'Colunas Duche', 9, 'Braço de Teto SIRIO ORO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3026OR', 13.80, 23.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (43, 'Colunas Duche', 9, 'Braço de Teto SIRIO NIQUEL', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3026NK', 13.80, 23.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (44, 'Colunas Duche', 9, 'Braço de Teto SIRIO TITANIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3026T', 13.80, 23.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (45, 'Colunas Duche', 9, 'Braço de Teto SIRIO COBRE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3026CB', 13.80, 23.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (46, 'Colunas Duche', 9, 'Braço de Teto SIRIO BRANCO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3026BL', 11.40, 19.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (47, 'Colunas Duche', 13, 'Braço de Parede SIRIO CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3025', 10.80, 18.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (48, 'Colunas Duche', 13, 'Braço de Parede SIRIO NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3161', 12.00, 20.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (49, 'Colunas Duche', 13, 'Braço de Parede SIRIO ORO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3025OR', 16.80, 28.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (50, 'Colunas Duche', 13, 'Braço de Parede SIRIO NIQUEL', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3025NK', 16.80, 28.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (51, 'Colunas Duche', 13, 'Braço de Parede SIRIO TITANIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3025T', 16.80, 28.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (52, 'Colunas Duche', 13, 'Braço de Parede SIRIO COBRE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3025CB', 16.80, 28.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (53, 'Colunas Duche', 13, 'Braço de Parede SIRIO BRANCO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3025BL', 13.80, 23.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (54, 'Colunas Duche', 14, 'Prato Redondo SIRIO CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3059', 19.20, 32.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (55, 'Colunas Duche', 14, 'Prato Redondo SIRIO NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3155', 26.40, 44.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (56, 'Colunas Duche', 14, 'Prato Redondo SIRIO ORO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3059OR', 30.00, 50.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (57, 'Colunas Duche', 14, 'Prato Redondo SIRIO NIQUEL', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3059NK', 30.00, 50.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (58, 'Colunas Duche', 14, 'Prato Redondo SIRIO TITANIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3059T', 30.00, 50.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (59, 'Colunas Duche', 14, 'Prato Redondo SIRIO COBRE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3059CB', 30.00, 50.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (60, 'Colunas Duche', 14, 'Prato Redondo SIRIO BRANCO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3059BL', 27.60, 46.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (61, 'Colunas Duche', 10, 'Chuveiro de encastre ORION CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3088', 107.40, 179.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (62, 'Colunas Duche', 10, 'Chuveiro de encastre ORION NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3089', 119.40, 199.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (63, 'Colunas Duche', 10, 'Chuveiro de encastre ORION BRANCO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3088BL', 119.40, 199.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (64, 'Colunas Duche', 11, 'Braço de Teto ORION CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3027', 12.60, 21.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (65, 'Colunas Duche', 11, 'Braço de Teto ORION NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3160', 13.80, 23.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (66, 'Colunas Duche', 11, 'Braço de Teto ORION BRANCO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3027BL', 15.60, 26.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (67, 'Colunas Duche', 15, 'Braço de Parede ORION CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3024', 14.40, 24.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (68, 'Colunas Duche', 15, 'Braço de Parede ORION NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3159', 15.00, 25.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (69, 'Colunas Duche', 15, 'Braço de Parede ORION BRANCO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3024BL', 16.80, 28.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (70, 'Colunas Duche', 16, 'Prato 25x25 ORION CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3058', 21.60, 36.00, 'CROMO', NULL::text, 25, 25, 'draft'),
    (71, 'Colunas Duche', 16, 'Prato 25x25 ORION NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3157', 26.40, 44.00, 'NEGRO', NULL::text, 25, 25, 'draft'),
    (72, 'Colunas Duche', 16, 'Prato 25x25 ORION BRANCO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3058BL', 28.80, 48.00, 'BRANCO', NULL::text, 25, 25, 'draft'),
    (73, 'Colunas Duche', 12, 'Coluna de Duche HIDROMASSAGEM GOTCHA CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0508', 250.80, 418.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (74, 'Colunas Duche', 12, 'Coluna de Duche HIDROMASSAGEM GOTCHA NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0523', 250.80, 418.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (75, 'Colunas Duche', 12, 'Coluna de Duche HIDROMASSAGEM GOTCHA BRANCO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0521', 250.80, 418.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (76, 'Chuveiro Higiénico', 1, 'Chuveiro Higiénico ROUND MONOCOMANDO CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0390', 65.40, 109.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (77, 'Chuveiro Higiénico', 1, 'Chuveiro Higiénico ROUND MONOCOMANDO NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0391', 73.20, 122.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (78, 'Chuveiro Higiénico', 1, 'Chuveiro Higiénico ROUND MONOCOMANDO ORO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0390OR', 84.60, 141.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (79, 'Chuveiro Higiénico', 1, 'Chuveiro Higiénico ROUND MONOCOMANDO NIQUEL', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0390NK', 84.60, 141.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (80, 'Chuveiro Higiénico', 1, 'Chuveiro Higiénico ROUND MONOCOMANDO TITANIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0390T', 84.60, 141.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (81, 'Chuveiro Higiénico', 1, 'Chuveiro Higiénico ROUND MONOCOMANDO COBRE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0390CB', 84.60, 141.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (82, 'Chuveiro Higiénico', 2, 'Chuveiro Higiénico ORION MONOCOMANDO CROMO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0398', 65.40, 109.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (83, 'Chuveiro Higiénico', 2, 'Chuveiro Higiénico ORION MONOCOMANDO NEGRO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0398NG', 73.20, 122.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (84, 'Chuveiro Higiénico', 2, 'Chuveiro Higiénico ORION MONOCOMANDO ORO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0398OR', 84.60, 141.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (85, 'Chuveiro Higiénico', 2, 'Chuveiro Higiénico ORION MONOCOMANDO NIQUEL', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0398NK', 84.60, 141.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (86, 'Chuveiro Higiénico', 2, 'Chuveiro Higiénico ORION MONOCOMANDO TITANIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0398T', 84.60, 141.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (87, 'Chuveiro Higiénico', 2, 'Chuveiro Higiénico ORION MONOCOMANDO COBRE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0398CB', 84.60, 141.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (88, 'Chuveiro Higiénico', 3, 'Chuveiro Higiénico WATER BLISS ÁGUA FRIA CROMO', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'DH1011', 29.70, 55.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (89, 'Chuveiro Higiénico', 3, 'Chuveiro Higiénico WATER BLISS ÁGUA FRIA NEGRO', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'DH1012', 35.10, 65.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (90, 'Chuveiro Higiénico', 3, 'Chuveiro Higiénico WATER BLISS ÁGUA FRIA ORO', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'DH1013', 45.90, 85.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (91, 'Chuveiro Higiénico', 3, 'Chuveiro Higiénico WATER BLISS ÁGUA FRIA ROSA GOLD ESCOVADO', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'DH1014', 45.90, 85.00, 'ROSA GOLD ESCOVADO', NULL::text, NULL::integer, NULL::integer, 'draft'),
    (92, 'Chuveiro Higiénico', 3, 'Chuveiro Higiénico WATER BLISS ÁGUA FRIA GUN METAL', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'DH1015', 45.90, 85.00, 'GUN METAL', NULL::text, NULL::integer, NULL::integer, 'draft');

  -- os dados gerados estão inteiros
  SELECT count(*), count(DISTINCT l.nome),
         count(*) FILTER (WHERE l.cor IS NOT NULL) + count(*) FILTER (WHERE l.larg IS NOT NULL) + count(*) FILTER (WHERE l.ml IS NOT NULL)
    INTO v_n, v_m, v_k FROM _imp_linhas l;
  IF v_n <> c_total OR v_m <> c_total OR v_k <> c_n_valores THEN
    RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: os dados gerados têm % linhas (% nomes distintos, % valores de atributos) em vez de % (%, %).',
      v_n, v_m, v_k, c_total, c_total, c_n_valores;
  END IF;
  IF (SELECT count(*) FROM _imp_modelos) <> c_n_modelos OR (SELECT sum(m.esperados) FROM _imp_modelos m) <> c_total
     OR EXISTS (SELECT 1 FROM _imp_linhas l WHERE NOT EXISTS (SELECT 1 FROM _imp_modelos m WHERE m.sub = l.sub AND m.numero = l.modelo)
                OR NOT EXISTS (SELECT 1 FROM _imp_subs s WHERE s.nome = l.sub)
                OR NOT EXISTS (SELECT 1 FROM _imp_marcas k WHERE k.nome = l.marca)
                OR NOT EXISTS (SELECT 1 FROM _imp_forn f WHERE f.nome = l.forn)
                OR (l.cor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _imp_opcoes o WHERE o.papel = 'cor' AND o.nome = l.cor))
                OR (l.larg IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _imp_opcoes o WHERE o.papel = 'largura' AND o.nome = l.larg))
                OR (l.ml IS NULL) <> (l.mc IS NULL))
     OR EXISTS (SELECT 1 FROM _imp_modelos m WHERE m.esperados <> (SELECT count(*) FROM _imp_linhas l WHERE l.sub = m.sub AND l.modelo = m.numero)) THEN
    RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: os dados gerados têm linhas com modelo, subcategoria, marca, fornecedor ou opção fora das tabelas geradas.';
  END IF;

  -- subcategorias
  FOR r IN SELECT s.nome, s.sigla FROM _imp_subs s ORDER BY s.nome LOOP
    SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(c.sigla ORDER BY c.created_at, c.id))[1],
           (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1]
      INTO v_n, v_sub, v_sub_sigla, v_sub_ativa
    FROM product_categories c
    WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n = 0 THEN
      RAISE NOTICE 'catalogo_colunas_duche_mudelar: a Mudelar não tem a subcategoria «%» › «%» — nada a fazer.', c_cat_nome, r.nome;
      RETURN;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: há % subcategorias «%» em «%».', v_n, r.nome, c_cat_nome;
    END IF;
    IF v_sub_sigla IS DISTINCT FROM r.sigla OR NOT v_sub_ativa THEN
      RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: a subcategoria «%» tem a sigla «%» (esperada %) ou está desativada.', r.nome, v_sub_sigla, r.sigla;
    END IF;
    UPDATE _imp_subs s SET sub_id = v_sub WHERE s.nome = r.nome;
  END LOOP;

  -- já aplicada / produtos de outros / modelos em conflito → inerte
  SELECT count(*) INTO v_n FROM products p JOIN _imp_subs s ON s.sub_id = p.subcategory_id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT l.nome FROM _imp_linhas l WHERE l.sub = s.nome);
  IF v_n = c_total THEN
    RAISE NOTICE 'catalogo_colunas_duche_mudelar: já aplicada (os % produtos já existem) — nada a fazer.', c_total;
    RETURN;
  ELSIF v_n > 0 THEN
    RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: só % dos % produtos já existem na Mudelar. Rever antes de aplicar.', v_n, c_total;
  END IF;
  IF EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             AND p.subcategory_id IN (SELECT s.sub_id FROM _imp_subs s)) THEN
    RAISE NOTICE 'catalogo_colunas_duche_mudelar: as subcategorias já têm produtos que não são estes — nada a fazer.';
    RETURN;
  END IF;
  SELECT string_agg(pm.name || ' (' || lpad(pm.numero::text, 4, '0') || (CASE WHEN pm.deleted_at IS NOT NULL THEN ', apagado' ELSE '' END) || ')', ', ')
    INTO v_txt
  FROM product_models pm JOIN _imp_subs s ON s.sub_id = pm.subcategory_id
  WHERE pm.organization_id = c_org
    AND EXISTS (SELECT 1 FROM _imp_modelos m
                WHERE m.sub = s.nome
                  AND (pm.numero = m.numero OR (pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)))
                  AND NOT (pm.numero = m.numero AND pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)));
  IF v_txt IS NOT NULL THEN
    RAISE NOTICE 'catalogo_colunas_duche_mudelar: as subcategorias já têm modelos com estes nomes ou números, diferentes dos do Excel (%) — nada a fazer.', v_txt;
    RETURN;
  END IF;

  -- ─── Configuração que tem de existir (senão: erro) ───────────────────────────
  SELECT m.user_id INTO v_criador
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND coalesce(m.role_is_client, false) = false
  ORDER BY m.created_at, m.user_id LIMIT 1;
  IF v_criador IS NULL THEN RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: a Mudelar não tem um membro ativo para created_by.'; END IF;

  FOR r IN SELECT k.nome FROM _imp_marcas k ORDER BY k.nome LOOP
    SELECT count(*), (array_agg(b.id ORDER BY b.created_at, b.id))[1], (array_agg(coalesce(b.is_active, true) ORDER BY b.created_at, b.id))[1],
           (array_agg(b.name ORDER BY b.created_at, b.id))[1]
      INTO v_n, v_opc, v_ativa, v_nome
    FROM brands b
    WHERE b.organization_id = c_org AND b.deleted_at IS NULL AND public.fn_cat_chave_opcao(b.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n <> 1 THEN RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: a Mudelar tem % marcas «%» (tem de ter uma).', v_n, r.nome; END IF;
    IF NOT v_ativa THEN RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: a marca «%» está desativada.', r.nome; END IF;
    UPDATE _imp_marcas k SET id = v_opc, nome_db = v_nome WHERE k.nome = r.nome;
  END LOOP;

  SELECT count(*) FILTER (WHERE a.code::text = 'cor'), count(*) FILTER (WHERE a.code::text = 'largura'), count(*) FILTER (WHERE a.code::text = 'medida'),
         (array_agg(a.id) FILTER (WHERE a.code::text = 'cor' AND NOT a.is_measurement))[1],
         (array_agg(a.id) FILTER (WHERE a.code::text = 'largura' AND NOT a.is_measurement))[1],
         (array_agg(a.id) FILTER (WHERE a.code::text = 'medida' AND a.is_measurement))[1],
         (array_agg(a.unit::text) FILTER (WHERE a.code::text = 'medida'))[1]
    INTO v_n, v_m, v_k, v_a_cor, v_a_larg, v_a_med, v_med_unit
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL;
  IF v_n <> 1 OR v_m <> 1 OR v_k <> 1 OR v_a_cor IS NULL OR v_a_larg IS NULL OR v_a_med IS NULL THEN
    RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: a Mudelar tem de ter um atributo cor, um largura (de lista) e uma medida (is_measurement).';
  END IF;
  IF coalesce(lower(v_med_unit), 'cm') <> 'cm' THEN
    RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: a Medida da Mudelar está em «%»; as medidas do Excel são em cm.', v_med_unit;
  END IF;
  v_g_cor := public.fn_cat_grupo_do_atributo(v_a_cor, c_org);
  v_g_larg := public.fn_cat_grupo_do_atributo(v_a_larg, c_org);
  IF NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_cor AND g.organization_id = c_org)
     OR NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_larg AND g.organization_id = c_org) THEN
    RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: as opções de Cor ou de Largura em uso na Mudelar não são de um grupo da Mudelar.';
  END IF;
  UPDATE _imp_opcoes o SET grupo = (CASE WHEN o.papel = 'cor' THEN v_g_cor ELSE v_g_larg END);

  -- ─── Locks (as chaves das funções de gestão do Catálogo), depois as escritas ─────
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text, 0));
  FOR r IN SELECT s.sub_id FROM _imp_subs s ORDER BY s.sub_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text || ':' || r.sub_id::text, 0));
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || v_g_cor::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || v_g_larg::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_fornecedores:' || c_org::text, 0));

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', v_criador::text, true);

  -- ─── 1. Opções de Cor e de Largura: reutiliza pelo nome; cria as que faltarem ──────────
  FOR r IN SELECT o.papel, o.nome, o.grupo FROM _imp_opcoes o ORDER BY o.papel, o.ordem LOOP
    SELECT count(*), (array_agg(v.id ORDER BY v.id))[1], (array_agg(v.is_active ORDER BY v.id))[1] INTO v_n, v_opc, v_ativa
    FROM attribute_option_group_values v
    WHERE v.group_id = r.grupo AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(r.nome);
    IF v_n > 1 THEN RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: há % opções «%» na % da Mudelar.', v_n, r.nome, r.papel; END IF;
    IF v_n = 1 AND NOT v_ativa THEN RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: a opção «%» (%) da Mudelar está desativada.', r.nome, r.papel; END IF;
    IF v_n = 0 THEN
      -- Largura: a sigla é o número, se estiver livre; Cor: a sugestão livre
      IF r.papel = 'largura' AND NOT EXISTS (SELECT 1 FROM attribute_option_group_values v WHERE v.group_id = r.grupo AND v.sigla = r.nome) THEN
        v_txt := r.nome;
      ELSE
        v_txt := public.fn_cat_sigla_opcao_livre(r.grupo, r.nome, NULL);
      END IF;
      IF v_txt IS NULL THEN RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: sem sigla livre para a opção «%» (%).', r.nome, r.papel; END IF;
      INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active, sigla)
      VALUES (r.grupo, r.nome, r.nome, NULL,
              coalesce((SELECT max(v.sort_order) FROM attribute_option_group_values v WHERE v.group_id = r.grupo), 0) + 1, true, v_txt)
      RETURNING id INTO v_opc;
      v_criadas := v_criadas || r.papel || ' ' || r.nome || ' (' || v_txt || '); ';
    END IF;
    UPDATE _imp_opcoes o SET opcao_id = v_opc WHERE o.papel = r.papel AND o.nome = r.nome;
  END LOOP;
  UPDATE _imp_opcoes o SET valor = v.value_text::text, sigla = v.sigla FROM attribute_option_group_values v WHERE v.id = o.opcao_id;
  IF EXISTS (SELECT 1 FROM _imp_opcoes o WHERE o.sigla IS NULL OR o.valor IS NULL) THEN
    RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: há opções sem sigla (o SKU precisa dela).';
  END IF;

  -- ─── 2. Os modelos nas subcategorias ──────────────────────────────────────────
  SELECT count(*) FILTER (WHERE pm.is_active), count(*) INTO v_n, v_m
  FROM product_models pm WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL;
  IF v_n + c_n_modelos > c_max_modelos_ativos OR v_m + c_n_modelos > c_max_modelos_vivos THEN
    RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: a Mudelar passaria o teto de modelos (% ativos, % vivos).', v_n, v_m;
  END IF;
  FOR r IN SELECT m.sub, m.numero, m.nome, s.sub_id FROM _imp_modelos m JOIN _imp_subs s ON s.nome = m.sub ORDER BY m.sub, m.numero LOOP
    v_mod := NULL;
    SELECT pm.id, pm.is_active INTO v_mod, v_ativa FROM product_models pm
    WHERE pm.organization_id = c_org AND pm.subcategory_id = r.sub_id AND pm.numero = r.numero AND pm.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_mod IS NOT NULL AND NOT v_ativa THEN
      RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: o modelo % (%) já existe e está desativado.', r.nome, lpad(r.numero::text, 4, '0');
    END IF;
    IF v_mod IS NULL THEN
      INSERT INTO product_models (organization_id, subcategory_id, name, numero, is_active, created_by)
      VALUES (c_org, r.sub_id, r.nome, r.numero, true, v_criador)
      RETURNING id INTO v_mod;
    END IF;
    UPDATE _imp_modelos m SET modelo_id = v_mod WHERE m.sub = r.sub AND m.numero = r.numero;
  END LOOP;

  -- ─── 3. Unidade «un» e fornecedores (procura pelo nome; cria só se não existir) ──────
  v_uom := public.fn_cat_unidade(c_org, c_unidade);
  IF v_uom IS NULL THEN RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: sem unidade «%».', c_unidade; END IF;
  FOR r IN SELECT f.nome FROM _imp_forn f ORDER BY f.nome LOOP
    v_opc := NULL;
    SELECT s.id, coalesce(s.is_active, true) INTO v_opc, v_ativa FROM suppliers s
    WHERE s.organization_id = c_org AND s.deleted_at IS NULL AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(r.nome)
    ORDER BY s.created_at, s.id LIMIT 1;
    IF v_opc IS NOT NULL AND NOT v_ativa THEN RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: o fornecedor «%» da Mudelar está desativado.', r.nome; END IF;
    IF v_opc IS NULL THEN
      INSERT INTO suppliers (organization_id, name, is_active, created_by)
      VALUES (c_org, public.fn_cat_limpar_nome(r.nome), true, v_criador)
      RETURNING id INTO v_opc;
      UPDATE _imp_forn f SET criado = true WHERE f.nome = r.nome;
      v_forn_criados := v_forn_criados || r.nome || '; ';
    END IF;
    UPDATE _imp_forn f SET id = v_opc WHERE f.nome = r.nome;
  END LOOP;

  -- ─── 4. As linhas a gravar, com o SKU (a regra de fn_cat_sku_partes, antes de inserir) ──────────
  CREATE TEMP TABLE _imp_b ON COMMIT DROP AS
  SELECT gen_random_uuid() AS id, l.linha, s.sub_id, l.modelo AS numero, m.modelo_id, l.nome, l.marca, k.id AS marca_id, k.nome_db AS marca_nome,
         l.forn, f.id AS forn_id, l.cod, l.custo, l.pvp, l.status,
         l.cor, oc.opcao_id AS cor_opcao, oc.valor AS cor_valor, oc.sigla AS cor_sigla,
         l.larg, ol.opcao_id AS larg_opcao, ol.valor AS larg_valor, ol.sigla AS larg_sigla,
         l.ml, l.mc,
         (CASE WHEN l.ml IS NOT NULL THEN jsonb_build_object('tipo', '2D', 'largura', l.ml::numeric, 'comprimento', l.mc::numeric,
                                                             'espessura', NULL, 'unidade', 'cm') END) AS med_json
  FROM _imp_linhas l
  JOIN _imp_subs s ON s.nome = l.sub
  JOIN _imp_modelos m ON m.sub = l.sub AND m.numero = l.modelo
  JOIN _imp_marcas k ON k.nome = l.marca
  JOIN _imp_forn f ON f.nome = l.forn
  LEFT JOIN _imp_opcoes oc ON oc.papel = 'cor' AND oc.nome = l.cor
  LEFT JOIN _imp_opcoes ol ON ol.papel = 'largura' AND ol.nome = l.larg;
  SELECT count(*) INTO v_n FROM _imp_b;
  IF v_n <> c_total THEN RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: % linhas a gravar em vez de %.', v_n, c_total; END IF;

  CREATE TEMP TABLE _imp ON COMMIT DROP AS
  SELECT b.*, (z.pt ->> 'prefixo') AS prefixo, (z.pt -> 'faltas') AS faltas,
         concat_ws('-', z.pt ->> 'prefixo', lpad(b.numero::text, 4, '0'), z.pt ->> 'resto') AS sku
  FROM _imp_b b
  CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, v_cat, b.sub_id,
      coalesce(CASE WHEN b.cor IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_cor, 'sigla', b.cor_sigla)) END, '[]'::jsonb)
      || coalesce(CASE WHEN b.larg IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_larg, 'sigla', b.larg_sigla)) END, '[]'::jsonb)
      || coalesce(CASE WHEN b.ml IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_med,
                         'medida', public.fn_cat_medida_ler(b.med_json, 'cm'))) END, '[]'::jsonb)) AS pt) z;
  SELECT count(*), string_agg(x.nome || ' → ' || coalesce(x.sku, 'null') || ' ' || coalesce(x.faltas::text, ''), '; ')
    INTO v_n, v_txt
  FROM (SELECT b.nome, b.sku, b.faltas FROM _imp b WHERE b.prefixo IS NULL OR b.faltas IS DISTINCT FROM '[]'::jsonb ORDER BY b.linha LIMIT 5) x;
  IF v_n > 0 THEN RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: SKU com faltas ou sem prefixo (ex.: %).', v_txt; END IF;

  -- SKU repetido entre as linhas (o mesmo produto duas vezes): para e diz quais
  SELECT string_agg(x.sku || ' ×' || x.n || ' (' || x.nomes || ')', '; ') INTO v_txt
  FROM (SELECT b.sku, count(*) AS n, string_agg(b.nome, ' | ' ORDER BY b.linha) AS nomes FROM _imp b
        GROUP BY b.sku HAVING count(*) > 1 ORDER BY b.sku LIMIT 10) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: SKUs repetidos: %', v_txt; END IF;
  -- já usado por outro produto da Mudelar (vivo ou apagado)
  SELECT string_agg(b.sku || ' (' || p.name || ')', '; ') INTO v_txt
  FROM (SELECT b2.sku FROM _imp b2 JOIN products p2 ON p2.organization_id = c_org AND p2.sku = b2.sku ORDER BY b2.sku LIMIT 10) b
  JOIN products p ON p.organization_id = c_org AND p.sku = b.sku;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: SKUs já usados noutros produtos da Mudelar: %', v_txt; END IF;
  v_regex := '^' || c_cat_sigla || '-(' || (SELECT string_agg(s.sigla, '|' ORDER BY s.sigla) FROM _imp_subs s) || ')-[0-9]{4}(-[A-Z0-9]+){0,3}$';
  IF EXISTS (SELECT 1 FROM _imp b WHERE b.sku !~ v_regex) THEN
    RAISE EXCEPTION 'catalogo_colunas_duche_mudelar: SKU fora do formato (ex.: %).', (SELECT b.sku FROM _imp b WHERE b.sku !~ v_regex LIMIT 1);
  END IF;

  -- ─── 5. Gravar (como cat_guardar_produto e cat_ligar_fornecedor_produto, set-based) ───────────────
  INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                        manages_stock, created_by, tipo_catalogo, category_id, subcategory_id, model_id, brand_id, uom_id,
                        supplier_id, fornecedor_livre, sku_gerado)
  SELECT b.id, c_org, b.sku, b.nome, b.status::product_status, true, true, true, false, false,
         true, v_criador, 'produto', v_cat, b.sub_id, b.modelo_id, b.marca_id, v_uom,
         b.forn_id, public.fn_cat_limpar_nome(b.forn), true
  FROM _imp b ORDER BY b.linha;

  INSERT INTO product_organizations (product_id, organization_id, created_by)
  SELECT b.id, c_org, v_criador FROM _imp b ORDER BY b.linha;

  -- custo (preco_exato = o mesmo valor a 2 casas) e PVP 1 µs depois (unicidade product_id+currency+valid_from)
  INSERT INTO product_prices (product_id, currency, price, preco_exato, valid_from, created_by, price_type, vat_rate)
  SELECT b.id, 'EUR'::currency_code, round(b.custo, 2), round(b.custo, 2), v_agora, v_criador, 'purchase'::price_type, c_iva FROM _imp b
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.pvp, 2), NULL::numeric, v_agora + interval '1 microsecond', v_criador, 'retail'::price_type, c_iva FROM _imp b;

  -- como cat_guardar_produto_atributos: opção = value_text da opção; medida = «150 × 70 cm» e value_json 2D em cm
  INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_json, unit)
  SELECT b.id, v_a_cor, b.cor_valor, NULL::jsonb, NULL::text FROM _imp b WHERE b.cor IS NOT NULL
  UNION ALL
  SELECT b.id, v_a_larg, b.larg_valor, NULL::jsonb, NULL::text FROM _imp b WHERE b.larg IS NOT NULL
  UNION ALL
  SELECT b.id, v_a_med, public.fn_cat_num_texto(b.ml::numeric) || ' × ' || public.fn_cat_num_texto(b.mc::numeric) || ' cm', b.med_json, 'cm'
  FROM _imp b WHERE b.ml IS NOT NULL;

  -- fornecedor preferido; supplier_sku = código do fornecedor do Excel (sem código: o SKU novo)
  INSERT INTO item_suppliers (organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price, currency,
                              is_preferred, is_active, created_by, preco_data)
  SELECT c_org, 'product', b.id, b.forn_id, NULL, coalesce(b.cod, b.sku), round(b.custo, 2), 'EUR', true, true, v_criador, current_date
  FROM _imp b ORDER BY b.linha;

  -- ─── 6. Conferir (cada contagem é do que está ERRADO; tem de dar 0) ───────────
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
    AND p.subcategory_id IN (SELECT s.sub_id FROM _imp_subs s);
  IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: % produtos nas subcategorias em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(m.sub || ' ' || m.nome || ' ' || coalesce(x.n, 0) || ' em vez de ' || m.esperados, '; ') INTO v_txt
  FROM _imp_modelos m
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p
             WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id IN (SELECT s.sub_id FROM _imp_subs s)
             GROUP BY p.model_id) x ON x.model_id = m.modelo_id
  WHERE coalesce(x.n, 0) <> m.esperados;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: contagem por modelo errada: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM _imp_modelos m JOIN _imp_subs s ON s.nome = m.sub
  LEFT JOIN product_models pm ON pm.id = m.modelo_id
  WHERE NOT coalesce(pm.organization_id = c_org AND pm.subcategory_id = s.sub_id AND pm.deleted_at IS NULL AND pm.is_active
                     AND pm.numero = m.numero AND pm.name = m.nome, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % modelos sem o nome, o número ou vivos.', v_n; END IF;

  -- cada produto tal como a linha do Excel
  SELECT count(*) INTO v_n
  FROM _imp b
  LEFT JOIN products p ON p.id = b.id
  LEFT JOIN product_attribute_values vc ON vc.product_id = b.id AND vc.attribute_id = v_a_cor
  LEFT JOIN product_attribute_values vl ON vl.product_id = b.id AND vl.attribute_id = v_a_larg
  LEFT JOIN product_attribute_values vm ON vm.product_id = b.id AND vm.attribute_id = v_a_med
  LEFT JOIN product_prices pc ON pc.product_id = b.id AND pc.price_type = 'purchase'
  LEFT JOIN product_prices pv ON pv.product_id = b.id AND pv.price_type = 'retail'
  LEFT JOIN item_suppliers i ON i.product_id = b.id AND i.deleted_at IS NULL
  WHERE NOT coalesce(p.organization_id = c_org AND p.name = b.nome AND p.sku = b.sku AND p.sku_gerado AND p.model_id = b.modelo_id
        AND p.category_id = v_cat AND p.subcategory_id = b.sub_id AND p.brand_id = b.marca_id AND p.marca_livre = b.marca_nome
        AND p.uom_id = v_uom AND p.unidade = c_unidade AND p.status::text = b.status AND p.tipo_catalogo = 'produto'
        AND p.manages_stock AND p.is_active AND NOT p.is_deleted AND p.supplier_id = b.forn_id
        AND p.fornecedor_livre = public.fn_cat_limpar_nome(b.forn)
        AND ((b.cor IS NULL AND vc.product_id IS NULL) OR (vc.value_text = b.cor_valor AND vc.value_json IS NULL))
        AND ((b.larg IS NULL AND vl.product_id IS NULL) OR (vl.value_text = b.larg_valor AND vl.value_json IS NULL))
        AND ((b.ml IS NULL AND vm.product_id IS NULL)
             OR (vm.value_json = b.med_json AND vm.unit = 'cm' AND public.fn_cat_medida_ler(vm.value_json, vm.unit) IS NOT NULL
                 AND vm.value_text = public.fn_cat_num_texto(b.ml::numeric) || ' × ' || public.fn_cat_num_texto(b.mc::numeric) || ' cm'))
        AND pc.price = round(b.custo, 2) AND pc.preco_exato = round(b.custo, 2) AND pc.vat_rate = c_iva
        AND pv.price = round(b.pvp, 2) AND pv.vat_rate = c_iva
        AND i.supplier_id = b.forn_id AND i.is_preferred AND i.is_active AND i.purchase_price = round(b.custo, 2)
        AND i.supplier_sku = coalesce(b.cod, b.sku),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos não ficaram como a linha do Excel.', v_n; END IF;
  -- nem linhas a mais: valores de atributos, 2 preços, 1 fornecedor e 1 product_organizations por produto
  SELECT (SELECT count(*) FROM product_attribute_values v JOIN _imp b ON b.id = v.product_id),
         (SELECT count(*) FROM product_prices x JOIN _imp b ON b.id = x.product_id)
    INTO v_n, v_m;
  IF v_n <> c_n_valores OR v_m <> 2 * c_total THEN
    RAISE EXCEPTION 'Conferir: % valores de atributos (esperados %) e % preços (esperados %).', v_n, c_n_valores, v_m, 2 * c_total;
  END IF;
  SELECT (SELECT count(*) FROM item_suppliers x JOIN _imp b ON b.id = x.product_id),
         (SELECT count(*) FROM product_organizations x JOIN _imp b ON b.id = x.product_id)
    INTO v_n, v_m;
  IF v_n <> c_total OR v_m <> c_total THEN
    RAISE EXCEPTION 'Conferir: % ligações a fornecedor e % product_organizations (esperados %).', v_n, v_m, c_total;
  END IF;

  -- SKUs: únicos, no formato, iguais ao recalculado a partir do que ficou gravado (todos)
  SELECT count(*), count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ v_regex OR p.sku ~ '^CAT-') INTO v_n, v_m, v_k
  FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id IN (SELECT s.sub_id FROM _imp_subs s);
  IF v_m <> c_total OR v_n <> c_total OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: SKUs: % distintos em %, % fora do formato.', v_m, v_n, v_k;
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
          WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id IN (SELECT s.sub_id FROM _imp_subs s)) x
        WHERE x.calc IS DISTINCT FROM x.sku OR x.prefixo IS NULL OR x.faltas <> '[]') y;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs diferentes do recalculado pela regra do Catálogo (ex.: %).', v_n, v_txt; END IF;

  -- todos com cat_prever_sku_modelo, como um membro da Mudelar com products.edit (só leitura; claims locais)
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE NOTICE 'catalogo_colunas_duche_mudelar: sem membro da Mudelar com products.edit — a comparação com cat_prever_sku_modelo ficou por fazer (o recálculo de todos foi feito).';
  ELSE
    v_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    v_n := 0;
    FOR r IN SELECT b.id, b.sku, b.sub_id, b.modelo_id, b.cor_opcao, b.larg_opcao, b.med_json FROM _imp b ORDER BY b.linha LOOP
      v_attrs := coalesce(CASE WHEN r.cor_opcao IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_cor, 'opcao', r.cor_opcao)) END, '[]'::jsonb)
              || coalesce(CASE WHEN r.larg_opcao IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_larg, 'opcao', r.larg_opcao)) END, '[]'::jsonb)
              || coalesce(CASE WHEN r.med_json IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_med, 'medida', r.med_json)) END, '[]'::jsonb);
      v_prev := public.cat_prever_sku_modelo(c_org, v_cat, r.sub_id, r.modelo_id, v_attrs, r.id);
      IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Conferir: cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
      END IF;
      v_n := v_n + 1;
    END LOOP;
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: só % de % comparados com cat_prever_sku_modelo.', v_n, c_total; END IF;
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
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_attributes', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_groups', count(*) FROM attribute_option_groups x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_group_values', count(*) FROM attribute_option_group_values v JOIN attribute_option_groups g ON g.id = v.group_id
              WHERE v.xmin::text = v_xid AND g.organization_id IS DISTINCT FROM c_org) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: foram escritas linhas fora da Mudelar: %', v_txt; END IF;
  IF NOT EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND p.xmin::text = v_xid AND p.subcategory_id IN (SELECT s.sub_id FROM _imp_subs s)) THEN
    RAISE EXCEPTION 'Conferir: os produtos importados não têm o xmin desta transação: a verificação de «nada fora da Mudelar» não vale.';
  END IF;

  RAISE NOTICE 'catalogo_colunas_duche_mudelar: % produtos em «%» (% modelos), fornecedores criados: %. Opções criadas: %. Conferido.',
    c_total, c_cat_nome, c_n_modelos, coalesce(nullif(v_forn_criados, ''), 'nenhum'), coalesce(nullif(v_criadas, ''), 'nenhuma');
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
