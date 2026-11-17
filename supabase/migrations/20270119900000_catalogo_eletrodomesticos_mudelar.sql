-- =============================================================================
-- Catálogo — importação dos ELETRODOMÉSTICOS da MUDELAR (ficheiro do utilizador dc010119-Eletrodomésticos.csv).
-- Base de RH (uetjghdkwbywbftedtth). Ficheiro GERADO por script (gerar_eletro.js) a partir do CSV: as linhas de dados
-- abaixo não se editam à mão — regeneram-se. Molde: 20270118900000 (importação) + 20270119000000 (modelos e atributos).
-- =============================================================================
--
-- Decisões (17/11, do utilizador):
--   * Um produto por linha do ficheiro: 72 produtos em 13 subcategorias de «Eletrodomésticos» (já existem, com
--     sigla; a categoria já tem a sigla EL). Produto = MODELO + combinação de atributos; 49 modelos.
--   * Modelo = o tipo + a marca, sem cor e sem medida (a marca fica no nome porque senão produtos de marcas diferentes
--     colidem): «Forno de encastre Indesit», «Exaustor telescópico Whirlpool», «Máquina lavar roupa encastre Whirlpool».
--     Ficam no nome as características «s/ ligação à rede», «OBI», «s/ motor», «Integ.», «Americano», «Combinado», «Slim»,
--     «Sommelier» (e «Cristal», das placas Teka, que não é cor nem medida). Números por subcategoria, de 0001, pela ordem
--     alfabética do nome do modelo. O nome do PRODUTO é o do ficheiro, sem o código do fabricante (BSSA315K4SN, TH84CB03FB,
--     TAB7N12EF, 3VT4031NA, IN2FD10CS70W, DGE5661HM).
--   * Atributos: Cor (Inox, Preto, Branco, Silver; o atributo e as opções Preto e Branco já existem; Inox e Silver criam-se
--     com a sigla livre que sobrar), Largura (lista que já existe: 45, 60, 80, 100 existem; 90 cria-se), Capacidade (lista
--     NOVA: litros 15 L … 150 L e garrafas 24 e 41; siglas 15L … 150L, 24G, 41G) e Gás (lista NOVA: Natural NAT,
--     Propano/Butano PB; só nos 2 esquentadores de 15 L). Os atributos e as opções procuram-se primeiro pelo nome (sem
--     acentos nem maiúsculas) e só se criam se faltarem: outras importações podem ter-se aplicado antes. A lista de 125
--     cores do Ventax ignora-se (o produto entra sem cor). Atributos novos entram no SKU, no fim da ordem.
--   * SKU gerado pela regra do Catálogo (a de cat_gerar_sku_produto, set-based, calculado ANTES de inserir):
--     EL-SUB-NNNN[-cor][-largura][-capacidade][-gás], na ordem sku_ordem. O SKU antigo do ficheiro não se guarda.
--   * Marcas: a coluna Marca; WHIRPOOL é gralha de Whirlpool. As marcas que já existem na Mudelar reutilizam-se pelo nome
--     (INDESIT, TEKA, VULCANO, FRASA, LG); Whirlpool: se não houver, a marca WHIRPOOL da Mudelar (sem produtos) passa a
--     chamar-se Whirlpool (o slug não muda); BEKO, AEG e BALAY criam-se. Ventax WC fica sem marca.
--   * Fornecedor: Prome Retail S.A. (sem o espaço final do ficheiro): reutiliza-se pelo nome ou cria-se. Ligado a cada produto
--     (item_suppliers, preferido, preço de compra = custo). supplier_sku = «Código Forneceor» do ficheiro (21 linhas) ou,
--     sem ele (51), o SKU novo.
--   * Preços: custo = Preço Compra, PVP = Preço Venda, IVA 23; Preço Grossista (18 linhas) e Preço Distribuidor
--     (18 linhas) entram como product_prices wholesale / distributor quando > 0 (0 = não se grava). Estado 'active',
--     vendável e comprável, unidade un.
--   * Auditoria normal, linha a linha, com app.audit_source = 'migration:eletrodomesticos_mudelar'.
--
-- GUARDA (inerte: RAISE NOTICE e sai sem escrever nada) se: a organização 3242e925-… não existir com o nome 'Mudelar';
-- faltar a versão dos modelos (20270118300000); não existir «Eletrodomésticos» ou uma das 13 subcategorias; já houver produtos
-- (vivos ou apagados) na categoria; já houver um produto vivo da Mudelar com um dos nomes; ou já houver nas subcategorias
-- um modelo com um dos nomes ou números que não seja exatamente o mesmo. Inerte numa segunda execução.
-- Falha (RAISE EXCEPTION, nada fica) se: a sigla da categoria não for EL ou as das subcategorias não forem as esperadas; um
-- atributo existente não for de lista; uma opção existente estiver desativada ou repetida; a marca/fornecedor estiver
-- desativado ou repetido; faltar a unidade ou um membro para created_by; SKU repetido, com faltas ou já usado.
--
-- Conferir no fim (conta o que está ERRADO e faz RAISE se não for 0): produtos por subcategoria e por modelo; cada produto com
-- nome, SKU, modelo, marca, fornecedor, supplier_sku, os 2 a 4 preços e os atributos certos (faltam e sobram); atributos e
-- opções criados; SKUs únicos, no formato, iguais ao recalculado e a cat_prever_sku_modelo (todos); nada escrito fora da
-- Mudelar nem em outros produtos (xmin); amostra de SKUs de Duche & Banho, Loiças e Acessórios intacta.
--
-- ORDEM: depois de 20270119600000 (e de todas as importações do Catálogo). Teste:
-- supabase/tests/catalogo_eletrodomesticos_mudelar.test.sql (BEGIN … ROLLBACK, só leitura; o passo 0 falha antes). ATENÇÃO
-- antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com `supabase migration list --linked`
-- imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '5min';

DO $mig$
DECLARE
  c_org        constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte      constant text    := 'migration:eletrodomesticos_mudelar';
  c_total      constant integer := 72;
  c_n_modelos  constant integer := 49;
  c_iva        constant numeric := 23;
  c_cat_nome   constant text    := 'Eletrodomésticos';
  c_cat_sigla  constant text    := 'EL';
  c_forn_nome  constant text    := 'Prome Retail S.A.';
  c_unidade    constant text    := 'un';
  c_n_gross    constant integer := 18;
  c_n_dist     constant integer := 18;
  c_max_atributos      constant integer := 200;
  c_max_modelos_ativos constant integer := 2000;
  c_max_modelos_vivos  constant integer := 10000;
  v_agora   timestamptz := clock_timestamp();
  v_n bigint; v_m bigint; v_k bigint; v_xid text; v_txt text; v_regex text; v_i integer; v_ordem integer; v_code text;
  v_marcas_criadas text := ''; v_attrs_criados text := ''; v_opcoes_criadas text := ''; v_forn_criado text := 'não';
  v_cat uuid; v_sub uuid; v_ativa boolean; v_criador uuid; v_uom uuid; v_sup uuid; v_mod uuid; v_marca uuid; v_attr uuid; v_grupo uuid;
  v_opc uuid; v_valor text; v_sigla text; v_n_attrs_criados integer := 0; v_n_opcoes_criadas integer := 0;
  v_auth uuid; v_claims text; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  -- ─── 0. Guarda (inerte) ───────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'eletrodomesticos_mudelar: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  IF to_regclass('public.product_models') IS NULL
     OR to_regprocedure('public.fn_cat_modelo_numero(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)') IS NULL THEN
    RAISE NOTICE 'eletrodomesticos_mudelar: falta a versão dos modelos (20270118300000) — nada a fazer.';
    RETURN;
  END IF;
  SELECT string_agg(s, ', ') INTO v_txt
  FROM unnest(ARRAY['public.fn_cat_chave_opcao(text)', 'public.fn_cat_limpar_nome(text)', 'public.fn_cat_grupo_do_atributo(uuid,uuid)',
                    'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)', 'public.fn_cat_sigla_opcao_livre(uuid,text,uuid)',
                    'public.fn_cat_slug(text)', 'public.fn_cat_medida_ler(jsonb,text)',
                    'public.fn_cat_unidade(uuid,text)', 'public.has_anew_permission_in_org(uuid,text,uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: faltam funções do Catálogo (%).', v_txt; END IF;

  SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1] INTO v_n, v_cat
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(c_cat_nome);
  IF v_n = 0 THEN
    RAISE NOTICE 'eletrodomesticos_mudelar: a Mudelar não tem a categoria «%» — nada a fazer.', c_cat_nome;
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'eletrodomesticos_mudelar: há % categorias «%» na Mudelar.', v_n, c_cat_nome;
  END IF;

  -- ─── Os dados do ficheiro (gerados) ───────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._eli_subs, pg_temp._eli_marcas, pg_temp._eli_modelos, pg_temp._eli_linhas, pg_temp._eli_attrs,
                       pg_temp._eli_opcoes, pg_temp._eli_amostra, pg_temp._eli;

  -- as 13 subcategorias: sigla, nome na Mudelar, quantos produtos
  CREATE TEMP TABLE _eli_subs (codigo text PRIMARY KEY, nome text NOT NULL, esperados integer NOT NULL, ordem integer NOT NULL,
                               sub_id uuid) ON COMMIT DROP;
  INSERT INTO _eli_subs (codigo, nome, esperados, ordem) VALUES
    ('ES', 'Esquentador', 2, 1),
    ('EX', 'Exaustores', 13, 2),
    ('FR', 'Fornos', 3, 3),
    ('FRG', 'Frigoríficos', 10, 4),
    ('GR', 'Garrafeira', 2, 5),
    ('MLSR', 'Máquinas lavar & secar roupa', 4, 6),
    ('MLL', 'Máquinas lavar loiça', 8, 7),
    ('MLR', 'Máquinas lavar roupa', 5, 8),
    ('MSR', 'Máquinas secar roupa', 2, 9),
    ('MO', 'Micro-ondas', 3, 10),
    ('PL', 'Placas', 12, 11),
    ('TR', 'Termoacumulador', 7, 12),
    ('VN', 'Ventax', 1, 13);

  -- as marcas (nome na Mudelar; «gralha» = a grafia errada que já existe e se corrige)
  CREATE TEMP TABLE _eli_marcas (nome text PRIMARY KEY, gralha text, id uuid, criada boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _eli_marcas (nome, gralha) VALUES
    ('AEG', NULL),
    ('BALAY', NULL),
    ('BEKO', NULL),
    ('FRASA', NULL),
    ('INDESIT', NULL),
    ('LG', NULL),
    ('TEKA', NULL),
    ('VULCANO', NULL),
    ('Whirlpool', 'WHIRPOOL');

  -- os modelos: subcategoria, número (1… por subcategoria), nome, quantos produtos
  CREATE TEMP TABLE _eli_modelos (sub text NOT NULL, numero smallint NOT NULL, nome text NOT NULL, esperados integer NOT NULL, modelo_id uuid,
                                  PRIMARY KEY (sub, numero)) ON COMMIT DROP;
  INSERT INTO _eli_modelos (sub, numero, nome, esperados) VALUES
    ('ES', 1, 'Esquentador Vulcano', 2),
    ('EX', 1, 'Exaustor AEG', 1),
    ('EX', 2, 'Exaustor convencional Indesit', 2),
    ('EX', 3, 'Exaustor de encastre Frasa OBI s/ motor', 2),
    ('EX', 4, 'Exaustor de ilha Whirlpool', 1),
    ('EX', 5, 'Exaustor de parede Whirlpool', 2),
    ('EX', 6, 'Exaustor decorativo Whirlpool', 1),
    ('EX', 7, 'Exaustor integrável Whirlpool', 1),
    ('EX', 8, 'Exaustor telescópico Indesit', 1),
    ('EX', 9, 'Exaustor telescópico Whirlpool', 2),
    ('FR', 1, 'Forno de encastre Indesit', 2),
    ('FR', 2, 'Forno de encastre Whirlpool', 1),
    ('FRG', 1, 'Arca vertical AEG', 1),
    ('FRG', 2, 'Frigorífico Americano LG s/ ligação à rede', 1),
    ('FRG', 3, 'Frigorífico Americano Whirlpool', 1),
    ('FRG', 4, 'Frigorífico Combinado de encastre Indesit', 1),
    ('FRG', 5, 'Frigorífico Combinado de encastre Whirlpool', 1),
    ('FRG', 6, 'Frigorífico Combinado Indesit', 2),
    ('FRG', 7, 'Frigorífico Combinado Whirlpool', 2),
    ('FRG', 8, 'Frigorífico Integ. Beko', 1),
    ('GR', 1, 'Garrafeira Sommelier Teka', 2),
    ('MLSR', 1, 'Máquina lavar & secar roupa encastre Indesit', 1),
    ('MLSR', 2, 'Máquina lavar & secar roupa encastre Whirlpool', 1),
    ('MLSR', 3, 'Máquina lavar & secar roupa Indesit', 1),
    ('MLSR', 4, 'Máquina lavar & secar roupa Whirlpool', 1),
    ('MLL', 1, 'Máquina lavar loiça Balay', 1),
    ('MLL', 2, 'Máquina lavar loiça encastre Indesit', 1),
    ('MLL', 3, 'Máquina lavar loiça encastre Whirlpool', 1),
    ('MLL', 4, 'Máquina lavar loiça Indesit', 3),
    ('MLL', 5, 'Máquina lavar loiça Whirlpool', 2),
    ('MLR', 1, 'Máquina lavar roupa encastre Indesit', 1),
    ('MLR', 2, 'Máquina lavar roupa encastre Whirlpool', 1),
    ('MLR', 3, 'Máquina lavar roupa Indesit', 1),
    ('MLR', 4, 'Máquina lavar roupa Whirlpool', 2),
    ('MSR', 1, 'Máquina secar roupa Indesit', 1),
    ('MSR', 2, 'Máquina secar roupa Whirlpool', 1),
    ('MO', 1, 'Micro-ondas de encastre Indesit', 2),
    ('MO', 2, 'Micro-ondas de encastre Whirlpool', 1),
    ('PL', 1, 'Placa com exaustor integrado AEG', 1),
    ('PL', 2, 'Placa de gás Indesit', 3),
    ('PL', 3, 'Placa de gás Whirlpool', 2),
    ('PL', 4, 'Placa de indução e gás Teka Cristal', 2),
    ('PL', 5, 'Placa de indução Indesit', 1),
    ('PL', 6, 'Placa de indução Whirlpool', 1),
    ('PL', 7, 'Placa vitrocerâmica Indesit', 1),
    ('PL', 8, 'Placa vitrocerâmica Whirlpool', 1),
    ('TR', 1, 'Termoacumulador Slim Teka', 3),
    ('TR', 2, 'Termoacumulador Vulcano', 4),
    ('VN', 1, 'Ventax WC', 1);

  -- os atributos de lista: código, nome
  CREATE TEMP TABLE _eli_attrs (codigo text PRIMARY KEY, nome text NOT NULL, atributo_id uuid, grupo_id uuid, criado boolean NOT NULL DEFAULT false)
    ON COMMIT DROP;
  INSERT INTO _eli_attrs (codigo, nome) VALUES
    ('cor', 'Cor'),
    ('largura', 'Largura'),
    ('capacidade', 'Capacidade'),
    ('gas', 'Gás');

  -- as opções usadas: atributo, valor, sigla pedida (NULL = a livre que sobrar), ordem
  CREATE TEMP TABLE _eli_opcoes (attr text NOT NULL, valor text NOT NULL, sigla_pedida text, ordem integer NOT NULL,
                                 opcao_id uuid, valor_db text, sigla text, criada boolean NOT NULL DEFAULT false, PRIMARY KEY (attr, valor)) ON COMMIT DROP;
  INSERT INTO _eli_opcoes (attr, valor, sigla_pedida, ordem) VALUES
    ('cor', 'Inox', NULL, 1),
    ('cor', 'Preto', NULL, 2),
    ('cor', 'Branco', NULL, 3),
    ('cor', 'Silver', NULL, 4),
    ('largura', '45', '45', 5),
    ('largura', '60', '60', 6),
    ('largura', '80', '80', 7),
    ('largura', '90', '90', 8),
    ('largura', '100', '100', 9),
    ('capacidade', '15 L', '15L', 10),
    ('capacidade', '50 L', '50L', 11),
    ('capacidade', '57 L', '57L', 12),
    ('capacidade', '74 L', '74L', 13),
    ('capacidade', '80 L', '80L', 14),
    ('capacidade', '93 L', '93L', 15),
    ('capacidade', '100 L', '100L', 16),
    ('capacidade', '150 L', '150L', 17),
    ('capacidade', '24 garrafas', '24G', 18),
    ('capacidade', '41 garrafas', '41G', 19),
    ('gas', 'Natural', 'NAT', 20),
    ('gas', 'Propano/Butano', 'PB', 21);

  -- as 72 linhas: (linha do ficheiro, subcategoria, modelo, nome do produto, marca, código de fornecedor, custo, pvp, grossista,
  -- distribuidor, cor, largura, capacidade, gás)
  CREATE TEMP TABLE _eli_linhas (linha integer PRIMARY KEY, sub text NOT NULL, modelo_nome text NOT NULL, nome text NOT NULL, marca text,
                                 cod_forn text, custo numeric NOT NULL, pvp numeric NOT NULL, grossista numeric, distribuidor numeric,
                                 cor text, largura text, capacidade text, gas text) ON COMMIT DROP;
  INSERT INTO _eli_linhas (linha, sub, modelo_nome, nome, marca, cod_forn, custo, pvp, grossista, distribuidor, cor, largura, capacidade, gas) VALUES
    (2, 'FR', 'Forno de encastre Indesit', 'Forno DE ENCASTRE INDESIT INOX', 'INDESIT', '074.F.IFW3844HX', 225.28, 352.00, NULL, NULL, 'Inox', NULL, NULL, NULL),
    (3, 'PL', 'Placa de indução e gás Teka Cristal', 'Placa DE INDUÇÃO E GÁS TEKA CRISTAL PRETO 60', 'TEKA', NULL, 519.68, 812.00, NULL, NULL, 'Preto', '60', NULL, NULL),
    (4, 'EX', 'Exaustor telescópico Whirlpool', 'Exaustor TELESCÓPICO WHIRPOOL 60CM', 'Whirlpool', NULL, 192.64, 301.00, NULL, NULL, NULL, '60', NULL, NULL),
    (5, 'TR', 'Termoacumulador Vulcano', 'Termoacumulador VULCANO 74L', 'VULCANO', NULL, 206.08, 322.00, NULL, NULL, NULL, NULL, '74 L', NULL),
    (6, 'FRG', 'Frigorífico Combinado de encastre Whirlpool', 'Frigorifico Combinado DE ENCASTRE WHIRPOOL', 'Whirlpool', NULL, 643.20, 1005.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (7, 'EX', 'Exaustor de encastre Frasa OBI s/ motor', 'Exaustor de Encastre Frasa OBI 90cm S/Motor', 'FRASA', NULL, 204.75, 315.00, NULL, NULL, NULL, '90', NULL, NULL),
    (8, 'PL', 'Placa de indução Indesit', 'Placa DE INDUÇÃO INDESIT', 'INDESIT', '074.P.IB65B60NE', 250.88, 392.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (9, 'FRG', 'Frigorífico Americano LG s/ ligação à rede', 'Frigorifico Americano LG S/LIGAÇÃO À REDE', 'LG', NULL, 1051.52, 1643.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (10, 'EX', 'Exaustor convencional Indesit', 'Exaustor CONVENCIONAL INDESIT 90CM', 'INDESIT', NULL, 186.24, 291.00, NULL, NULL, NULL, '90', NULL, NULL),
    (11, 'ES', 'Esquentador Vulcano', 'Esquentador VULCANO 15L GÁS NATURAL', 'VULCANO', '012.E.736506294', 417.28, 652.00, NULL, NULL, NULL, NULL, '15 L', 'Natural'),
    (12, 'FRG', 'Frigorífico Integ. Beko', 'Frigorifico Integ. Beko', 'BEKO', NULL, 391.17, 651.95, NULL, NULL, NULL, NULL, NULL, NULL),
    (13, 'EX', 'Exaustor de parede Whirlpool', 'Exaustor DE PAREDE WHIRPOOL 90CM', 'Whirlpool', NULL, 349.44, 546.00, NULL, NULL, NULL, '90', NULL, NULL),
    (14, 'FR', 'Forno de encastre Indesit', 'Forno DE ENCASTRE INDESIT PRETO', 'INDESIT', NULL, 225.28, 352.00, NULL, NULL, 'Preto', NULL, NULL, NULL),
    (15, 'EX', 'Exaustor convencional Indesit', 'Exaustor CONVENCIONAL INDESIT 60CM', 'INDESIT', NULL, 155.52, 243.00, NULL, NULL, NULL, '60', NULL, NULL),
    (16, 'VN', 'Ventax WC', 'Ventax WC', NULL, NULL, 30.00, 45.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (17, 'FRG', 'Frigorífico Combinado Indesit', 'Frigorifico Combinado INDESIT INOX', 'INDESIT', '073.C.XITBT2EX', 312.96, 489.00, NULL, NULL, 'Inox', NULL, NULL, NULL),
    (18, 'MLSR', 'Máquina lavar & secar roupa encastre Indesit', 'Máquina lavar & secar roupa ENCASTRE INDESIT', 'INDESIT', '1024.M.WDL861485', 435.20, 680.00, 12.00, 11.00, NULL, NULL, NULL, NULL),
    (19, 'MO', 'Micro-ondas de encastre Whirlpool', 'Micro-ondas DE ENCASTRE WHIRPOOL', 'Whirlpool', '035.M.AMW4900IX', 357.12, 558.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (20, 'ES', 'Esquentador Vulcano', 'Esquentador VULCANO 15L PROPANO OU BUTANO', 'VULCANO', NULL, 417.28, 652.00, NULL, NULL, NULL, NULL, '15 L', 'Propano/Butano'),
    (21, 'EX', 'Exaustor telescópico Indesit', 'Exaustor TELESCÓPICO INDESIT', 'INDESIT', '074.B.H461IX', 103.68, 162.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (22, 'PL', 'Placa vitrocerâmica Indesit', 'Placa VITROCERÂMICA INDESIT', 'INDESIT', '074.P.RI161C', 149.76, 234.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (23, 'MLR', 'Máquina lavar roupa encastre Whirlpool', 'Máquina lavar roupa ENCASTRE WHIRPOOL', 'Whirlpool', NULL, 447.36, 699.00, 12.00, 11.00, NULL, NULL, NULL, NULL),
    (24, 'FR', 'Forno de encastre Whirlpool', 'Forno DE ENCASTRE WHIRPOOL', 'Whirlpool', NULL, 526.72, 823.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (25, 'MLR', 'Máquina lavar roupa Whirlpool', 'Máquina lavar roupa WHIRPOOL BRANCO', 'Whirlpool', NULL, 486.40, 760.00, 12.00, 11.00, 'Branco', NULL, NULL, NULL),
    (26, 'PL', 'Placa com exaustor integrado AEG', 'PLACA COM EXAUSTOR INTGRADO AEG 80CM', 'AEG', NULL, 1111.83, 1853.05, NULL, NULL, NULL, '80', NULL, NULL),
    (27, 'MLL', 'Máquina lavar loiça Whirlpool', 'Máquina lavar loiça WHIRPOOL SILVER', 'Whirlpool', NULL, 447.36, 699.00, 12.00, 11.00, 'Silver', NULL, NULL, NULL),
    (28, 'MLL', 'Máquina lavar loiça Indesit', 'Máquina lavar loiça INDESIT BRANCO', 'INDESIT', '073.M.DFO3T133AF', 295.68, 462.00, 12.00, 11.00, 'Branco', NULL, NULL, NULL),
    (29, 'MLL', 'Máquina lavar loiça encastre Indesit', 'Máquina lavar loiça ENCASTRE INDESIT', 'INDESIT', '074.M.DIC3C24A', 298.88, 467.00, 12.00, 11.00, NULL, NULL, NULL, NULL),
    (30, 'PL', 'Placa de gás Whirlpool', 'Placa DE GÁS WHIRPOOL INOX 90', 'Whirlpool', NULL, 280.32, 438.00, NULL, NULL, 'Inox', '90', NULL, NULL),
    (31, 'MLR', 'Máquina lavar roupa encastre Indesit', 'Máquina lavar roupa ENCASTRE INDESIT', 'INDESIT', NULL, 331.52, 518.00, 12.00, 11.00, NULL, NULL, NULL, NULL),
    (32, 'PL', 'Placa de gás Indesit', 'Placa DE GÁS INDESIT PRETO', 'INDESIT', '074.P.ING61TBK', 213.12, 333.00, NULL, NULL, 'Preto', NULL, NULL, NULL),
    (33, 'PL', 'Placa de indução e gás Teka Cristal', 'Placa DE INDUÇÃO E GÁS TEKA CRISTAL PRETO 90', 'TEKA', NULL, 399.36, 624.00, NULL, NULL, 'Preto', '90', NULL, NULL),
    (34, 'PL', 'Placa vitrocerâmica Whirlpool', 'Placa VITROCERÂMICA WHIRPOOL', 'Whirlpool', NULL, 192.64, 301.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (35, 'FRG', 'Frigorífico Combinado de encastre Indesit', 'Frigorifico Combinado DE ENCASTRE INDESIT', 'INDESIT', NULL, 469.12, 733.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (36, 'FRG', 'Frigorífico Americano Whirlpool', 'Frigorifico Americano WHIRPOOL SILVER', 'Whirlpool', NULL, 1246.72, 1948.00, NULL, NULL, 'Silver', NULL, NULL, NULL),
    (37, 'MLL', 'Máquina lavar loiça Whirlpool', 'Máquina lavar loiça WHIRPOOL BRANCO', 'Whirlpool', NULL, 447.36, 699.00, 12.00, 11.00, 'Branco', NULL, NULL, NULL),
    (38, 'EX', 'Exaustor integrável Whirlpool', 'Exaustor INTEGRÁVEL WHIRPOOL 60CM', 'Whirlpool', NULL, 206.08, 322.00, NULL, NULL, NULL, '60', NULL, NULL),
    (39, 'FRG', 'Frigorífico Combinado Whirlpool', 'Frigorifico Combinado WHIRPOOL BRANCO', 'Whirlpool', NULL, 453.12, 708.00, NULL, NULL, 'Branco', NULL, NULL, NULL),
    (40, 'EX', 'Exaustor telescópico Whirlpool', 'Exaustor TELESCÓPICO WHIRPOOL 90CM', 'Whirlpool', '035.E.4KR443', 257.28, 402.00, NULL, NULL, NULL, '90', NULL, NULL),
    (41, 'TR', 'Termoacumulador Slim Teka', 'Termoacumulador SLIM TEKA 50L', 'TEKA', '1086.T.42080060', 168.32, 263.00, NULL, NULL, NULL, NULL, '50 L', NULL),
    (42, 'MLL', 'Máquina lavar loiça Indesit', 'Máquina lavar loiça INDESIT SILVER', 'INDESIT', '073.M.DFO3T133AFX', 295.68, 462.00, 12.00, 11.00, 'Silver', NULL, NULL, NULL),
    (43, 'TR', 'Termoacumulador Slim Teka', 'Termoacumulador SLIM TEKA 80L', 'TEKA', '1086.T.42080090', 211.20, 330.00, NULL, NULL, NULL, NULL, '80 L', NULL),
    (44, 'MLSR', 'Máquina lavar & secar roupa Whirlpool', 'Máquina lavar & secar roupa WHIRPOOL', 'Whirlpool', NULL, 544.00, 850.00, 12.00, 11.00, NULL, NULL, NULL, NULL),
    (45, 'TR', 'Termoacumulador Vulcano', 'Termoacumulador VULCANO 57L', 'VULCANO', NULL, 179.84, 281.00, NULL, NULL, NULL, NULL, '57 L', NULL),
    (46, 'FRG', 'Arca vertical AEG', 'ARCA VERTICAL AEG', 'AEG', NULL, 675.30, 1125.50, NULL, NULL, NULL, NULL, NULL, NULL),
    (47, 'PL', 'Placa de gás Whirlpool', 'Placa DE GÁS WHIRPOOL INOX 60', 'Whirlpool', NULL, 188.80, 295.00, NULL, NULL, 'Inox', '60', NULL, NULL),
    (48, 'EX', 'Exaustor decorativo Whirlpool', 'Exaustor DECORATIVO WHIRPOOL 60CM', 'Whirlpool', '035.C.AKR62FLTK', 228.48, 357.00, NULL, NULL, NULL, '60', NULL, NULL),
    (49, 'MLL', 'Máquina lavar loiça Indesit', 'Máquina lavar loiça INDESIT 45CM', 'INDESIT', NULL, 259.05, 423.90, 12.00, 11.00, NULL, '45', NULL, NULL),
    (50, 'MLL', 'Máquina lavar loiça Balay', 'MÁQUINA DE LAVAR LOUÇA BALAY 45CM', 'BALAY', NULL, 360.30, 600.50, NULL, NULL, NULL, '45', NULL, NULL),
    (51, 'EX', 'Exaustor de ilha Whirlpool', 'Exaustor DE ILHA WHIRPOOL 100CM', 'Whirlpool', NULL, 681.60, 1065.00, NULL, NULL, NULL, '100', NULL, NULL),
    (52, 'TR', 'Termoacumulador Vulcano', 'Termoacumulador VULCANO 93L', 'VULCANO', NULL, 234.88, 367.00, NULL, NULL, NULL, NULL, '93 L', NULL),
    (53, 'TR', 'Termoacumulador Slim Teka', 'Termoacumulador SLIM TEKA 100L', 'TEKA', NULL, 229.12, 358.00, NULL, NULL, NULL, NULL, '100 L', NULL),
    (54, 'MLSR', 'Máquina lavar & secar roupa encastre Whirlpool', 'Máquina lavar & secar roupa ENCASTRE WHIRPOOL', 'Whirlpool', NULL, 567.04, 886.00, 12.00, 11.00, NULL, NULL, NULL, NULL),
    (55, 'TR', 'Termoacumulador Vulcano', 'Termoacumulador VULCANO 150L', 'VULCANO', NULL, 266.88, 417.00, NULL, NULL, NULL, NULL, '150 L', NULL),
    (56, 'MLSR', 'Máquina lavar & secar roupa Indesit', 'Máquina lavar & secar roupa INDESIT', 'INDESIT', '073.M.964369W', 359.04, 561.00, 12.00, 11.00, NULL, NULL, NULL, NULL),
    (57, 'MLR', 'Máquina lavar roupa Indesit', 'Máquina lavar roupa INDESIT', 'INDESIT', NULL, 284.80, 445.00, 12.00, 11.00, NULL, NULL, NULL, NULL),
    (58, 'EX', 'Exaustor AEG', 'Exaustor AEG', 'AEG', NULL, 290.28, 483.80, NULL, NULL, NULL, NULL, NULL, NULL),
    (59, 'EX', 'Exaustor de encastre Frasa OBI s/ motor', 'Exaustor de Encastre Frasa OBI 60cm S/Motor', 'FRASA', NULL, 180.70, 278.00, NULL, NULL, NULL, '60', NULL, NULL),
    (60, 'FRG', 'Frigorífico Combinado Indesit', 'Frigorifico Combinado INDESIT BRANCO', 'INDESIT', '074.C.INC18T311', 312.96, 489.00, NULL, NULL, 'Branco', NULL, NULL, NULL),
    (61, 'PL', 'Placa de gás Indesit', 'Placa DE GÁS INDESIT INOX', 'INDESIT', '074.P.THP642IX', 110.08, 172.00, NULL, NULL, 'Inox', NULL, NULL, NULL),
    (62, 'PL', 'Placa de gás Indesit', 'Placa DE GÁS INDESIT BRANCO', 'INDESIT', NULL, 213.12, 333.00, NULL, NULL, 'Branco', NULL, NULL, NULL),
    (63, 'FRG', 'Frigorífico Combinado Whirlpool', 'Frigorifico Combinado WHIRPOOL SILVER', 'Whirlpool', NULL, 460.80, 720.00, NULL, NULL, 'Silver', NULL, NULL, NULL),
    (64, 'MLL', 'Máquina lavar loiça encastre Whirlpool', 'Máquina lavar loiça ENCASTRE WHIRPOOL', 'Whirlpool', NULL, 454.40, 710.00, 12.00, 11.00, NULL, NULL, NULL, NULL),
    (65, 'GR', 'Garrafeira Sommelier Teka', 'Garrafeira SOMMELIER TEKA 41 GARRAFAS', 'TEKA', NULL, 656.00, 1025.00, NULL, NULL, NULL, NULL, '41 garrafas', NULL),
    (66, 'MLR', 'Máquina lavar roupa Whirlpool', 'Máquina lavar roupa SILVER', 'Whirlpool', NULL, 538.24, 841.00, 12.00, 11.00, 'Silver', NULL, NULL, NULL),
    (67, 'MSR', 'Máquina secar roupa Whirlpool', 'Máquina secar roupa WHIRPOOL', 'Whirlpool', NULL, 487.04, 761.00, 12.00, 11.00, NULL, NULL, NULL, NULL),
    (68, 'PL', 'Placa de indução Whirlpool', 'Placa DE INDUÇÃO WHIRPOOL', 'Whirlpool', NULL, 282.88, 442.00, NULL, NULL, NULL, NULL, NULL, NULL),
    (69, 'MO', 'Micro-ondas de encastre Indesit', 'Micro-ondas DE ENCASTRE INDESIT PRETO', 'INDESIT', NULL, 239.36, 374.00, NULL, NULL, 'Preto', NULL, NULL, NULL),
    (70, 'MO', 'Micro-ondas de encastre Indesit', 'Micro-ondas DE ENCASTRE INDESIT INOX', 'INDESIT', '074.M.MWI6211X', 239.36, 374.00, NULL, NULL, 'Inox', NULL, NULL, NULL),
    (71, 'MSR', 'Máquina secar roupa Indesit', 'Máquina secar roupa INDESIT', 'INDESIT', NULL, 270.08, 422.00, 12.00, 11.00, NULL, NULL, NULL, NULL),
    (72, 'GR', 'Garrafeira Sommelier Teka', 'Garrafeira SOMMELIER TEKA 24 GARRAFAS', 'TEKA', '026.F.113600009', 577.28, 902.00, NULL, NULL, NULL, NULL, '24 garrafas', NULL),
    (73, 'EX', 'Exaustor de parede Whirlpool', 'Exaustor DE PAREDE WHIRPOOL 60CM', 'Whirlpool', NULL, 314.88, 492.00, NULL, NULL, NULL, '60', NULL, NULL);

  -- os dados gerados estão inteiros
  SELECT count(*), count(DISTINCT l.nome) INTO v_n, v_m FROM _eli_linhas l;
  IF v_n <> c_total OR v_m <> c_total THEN
    RAISE EXCEPTION 'eletrodomesticos_mudelar: os dados gerados têm % linhas (% nomes) em vez de %.', v_n, v_m, c_total;
  END IF;
  IF (SELECT count(*) FROM _eli_modelos) <> c_n_modelos
     OR EXISTS (SELECT 1 FROM _eli_linhas l WHERE NOT EXISTS (SELECT 1 FROM _eli_modelos m WHERE m.sub = l.sub AND m.nome = l.modelo_nome))
     OR EXISTS (SELECT 1 FROM _eli_modelos m WHERE m.esperados <> (SELECT count(*) FROM _eli_linhas l WHERE l.sub = m.sub AND l.modelo_nome = m.nome))
     OR EXISTS (SELECT 1 FROM _eli_linhas l WHERE NOT EXISTS (SELECT 1 FROM _eli_subs s WHERE s.codigo = l.sub)
                   OR (l.marca IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _eli_marcas b WHERE b.nome = l.marca))
                   OR l.custo <= 0 OR l.pvp <= 0 OR l.grossista <= 0 OR l.distribuidor <= 0
                   OR (l.cor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _eli_opcoes o WHERE o.attr = 'cor' AND o.valor = l.cor))
                   OR (l.largura IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _eli_opcoes o WHERE o.attr = 'largura' AND o.valor = l.largura))
                   OR (l.capacidade IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _eli_opcoes o WHERE o.attr = 'capacidade' AND o.valor = l.capacidade))
                   OR (l.gas IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _eli_opcoes o WHERE o.attr = 'gas' AND o.valor = l.gas))) THEN
    RAISE EXCEPTION 'eletrodomesticos_mudelar: os dados gerados têm modelos, subcategorias, marcas, preços ou atributos fora do esperado.';
  END IF;
  -- dois produtos do mesmo modelo não podem ter os mesmos atributos (o SKU seria igual)
  SELECT count(*) INTO v_n FROM (SELECT l.sub, l.modelo_nome, l.cor, l.largura, l.capacidade, l.gas FROM _eli_linhas l
                                 GROUP BY 1, 2, 3, 4, 5, 6 HAVING count(*) > 1) x;
  IF v_n > 0 THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: % pares de produtos com o mesmo modelo e os mesmos atributos.', v_n; END IF;

  -- a categoria: sigla EL; as subcategorias: existem, ativas, com a sigla esperada
  IF (SELECT c.sigla FROM product_categories c WHERE c.id = v_cat) IS DISTINCT FROM c_cat_sigla
     OR NOT coalesce((SELECT c.is_active FROM product_categories c WHERE c.id = v_cat), true) THEN
    RAISE EXCEPTION 'eletrodomesticos_mudelar: «%» não tem a sigla % ou está desativada.', c_cat_nome, c_cat_sigla;
  END IF;
  FOR r IN SELECT s.codigo, s.nome FROM _eli_subs s ORDER BY s.ordem LOOP
    SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1],
           (array_agg(c.sigla ORDER BY c.created_at, c.id))[1]
      INTO v_n, v_sub, v_ativa, v_txt
    FROM product_categories c
    WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n = 0 THEN
      RAISE NOTICE 'eletrodomesticos_mudelar: a Mudelar não tem a subcategoria «%» › «%» — nada a fazer.', c_cat_nome, r.nome;
      RETURN;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'eletrodomesticos_mudelar: há % subcategorias «%» em «%».', v_n, r.nome, c_cat_nome;
    END IF;
    IF NOT v_ativa THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: a subcategoria «%» está desativada.', r.nome; END IF;
    IF v_txt IS DISTINCT FROM r.codigo THEN
      RAISE EXCEPTION 'eletrodomesticos_mudelar: a subcategoria «%» tem a sigla % em vez de %.', r.nome, coalesce(v_txt, 'nenhuma'), r.codigo;
    END IF;
    UPDATE _eli_subs s SET sub_id = v_sub WHERE s.codigo = r.codigo;
  END LOOP;

  -- produtos na categoria (vivos ou apagados) → já aplicada: inerte
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.category_id = v_cat;
  IF v_n > 0 THEN
    RAISE NOTICE 'eletrodomesticos_mudelar: «%» já tem % produtos — nada a fazer.', c_cat_nome, v_n;
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT l.nome FROM _eli_linhas l);
  IF v_n > 0 THEN
    RAISE NOTICE 'eletrodomesticos_mudelar: a Mudelar já tem % produtos vivos com nomes do ficheiro — nada a fazer.', v_n;
    RETURN;
  END IF;
  SELECT string_agg(s.codigo || ': ' || pm.name || ' (' || lpad(pm.numero::text, 4, '0') || (CASE WHEN pm.deleted_at IS NOT NULL THEN ', apagado' ELSE '' END) || ')', ', ')
    INTO v_txt
  FROM product_models pm JOIN _eli_subs s ON s.sub_id = pm.subcategory_id
  WHERE pm.organization_id = c_org
    AND EXISTS (SELECT 1 FROM _eli_modelos m
                WHERE m.sub = s.codigo
                  AND (pm.numero = m.numero OR (pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)))
                  AND NOT (pm.numero = m.numero AND pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)));
  IF v_txt IS NOT NULL THEN
    RAISE NOTICE 'eletrodomesticos_mudelar: as subcategorias já têm modelos com estes nomes ou números, diferentes dos do ficheiro (%) — nada a fazer.', v_txt;
    RETURN;
  END IF;

  -- ─── Configuração que tem de existir (senão: erro) ───────────────────────────
  SELECT m.user_id INTO v_criador
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND coalesce(m.role_is_client, false) = false
  ORDER BY m.created_at, m.user_id LIMIT 1;
  IF v_criador IS NULL THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: a Mudelar não tem um membro ativo para created_by.'; END IF;
  v_uom := public.fn_cat_unidade(c_org, c_unidade);
  IF v_uom IS NULL THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: sem unidade «%».', c_unidade; END IF;

  -- amostra de SKUs de outras categorias (Duche & Banho, Loiças, Acessórios), para conferir que ficam iguais
  CREATE TEMP TABLE _eli_amostra ON COMMIT DROP AS
  SELECT x.id, x.sku FROM (
    SELECT p.id, p.sku, row_number() OVER (PARTITION BY c.id ORDER BY p.sku, p.id) AS n
    FROM products p JOIN product_categories c ON c.id = p.category_id
    WHERE p.organization_id = c_org AND NOT p.is_deleted AND c.organization_id = c_org AND c.parent_id IS NULL
      AND c.sigla IN ('DB', 'LS', 'ACB')) x
  WHERE x.n <= 3;

  -- ─── Locks (as chaves das funções de gestão do Catálogo) ─────────────────────
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_marcas:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_guardar_atributo:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text, 0));
  FOR r IN SELECT s.sub_id FROM _eli_subs s ORDER BY s.sub_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text || ':' || r.sub_id::text, 0));
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_fornecedores:' || c_org::text, 0));

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', v_criador::text, true);

  -- ─── 1. Marcas: reutiliza pelo nome; a gralha WHIRPOOL passa a Whirlpool; as que faltam criam-se ─────
  FOR r IN SELECT b.nome, b.gralha FROM _eli_marcas b ORDER BY b.nome LOOP
    SELECT count(*), (array_agg(x.id ORDER BY x.created_at, x.id))[1], (array_agg(coalesce(x.is_active, true) ORDER BY x.created_at, x.id))[1]
      INTO v_n, v_marca, v_ativa
    FROM brands x WHERE x.organization_id = c_org AND x.deleted_at IS NULL AND public.fn_cat_chave_opcao(x.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n > 1 THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: a Mudelar tem % marcas «%».', v_n, r.nome; END IF;
    IF v_n = 0 AND r.gralha IS NOT NULL THEN
      -- a grafia errada: renomeia-se a marca existente (só se não tiver produtos); senão cria-se a certa
      SELECT count(*), (array_agg(x.id ORDER BY x.created_at, x.id))[1], (array_agg(coalesce(x.is_active, true) ORDER BY x.created_at, x.id))[1]
        INTO v_m, v_marca, v_ativa
      FROM brands x WHERE x.organization_id = c_org AND x.deleted_at IS NULL AND public.fn_cat_chave_opcao(x.name) = public.fn_cat_chave_opcao(r.gralha);
      IF v_m > 1 THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: a Mudelar tem % marcas «%».', v_m, r.gralha; END IF;
      IF v_m = 1 AND v_ativa AND NOT EXISTS (SELECT 1 FROM products p WHERE p.brand_id = v_marca) THEN
        UPDATE brands x SET name = r.nome WHERE x.id = v_marca;
        v_marcas_criadas := v_marcas_criadas || r.gralha || ' → ' || r.nome || ' (renomeada); ';
        v_n := 1;
      ELSE
        v_marca := NULL; v_ativa := NULL; v_n := 0;
      END IF;
    END IF;
    IF v_n = 1 AND NOT v_ativa THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: a marca «%» está desativada.', r.nome; END IF;
    IF v_n = 0 THEN
      IF EXISTS (SELECT 1 FROM brands x WHERE x.organization_id IS NULL AND x.deleted_at IS NULL
                   AND public.fn_cat_chave_opcao(x.name) = public.fn_cat_chave_opcao(r.nome)) THEN
        RAISE EXCEPTION 'eletrodomesticos_mudelar: há uma marca global «%» (rever).', r.nome;
      END IF;
      INSERT INTO brands (name, slug, created_by, organization_id, is_active)
      VALUES (public.fn_cat_limpar_nome(r.nome), public.fn_cat_slug(r.nome) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6),
              v_criador, c_org, true)
      RETURNING id INTO v_marca;
      UPDATE _eli_marcas b SET criada = true WHERE b.nome = r.nome;
      v_marcas_criadas := v_marcas_criadas || r.nome || ' (criada); ';
    END IF;
    UPDATE _eli_marcas b SET id = v_marca WHERE b.nome = r.nome;
  END LOOP;

  -- ─── 2. Fornecedor ────────────────────────────────────────────────────────────
  SELECT s.id, coalesce(s.is_active, true) INTO v_sup, v_ativa FROM suppliers s
  WHERE s.organization_id = c_org AND s.deleted_at IS NULL AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(c_forn_nome)
  ORDER BY s.created_at, s.id LIMIT 1;
  IF v_sup IS NOT NULL AND NOT v_ativa THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: o fornecedor «%» da Mudelar está desativado.', c_forn_nome; END IF;
  IF v_sup IS NULL THEN
    INSERT INTO suppliers (organization_id, name, is_active, created_by)
    VALUES (c_org, public.fn_cat_limpar_nome(c_forn_nome), true, v_criador)
    RETURNING id INTO v_sup;
    v_forn_criado := 'sim';
  END IF;

  -- ─── 3. Atributos: procura-se pelo nome; Capacidade e Gás criam-se (lista, grupo da organização) se faltarem ─────
  FOR r IN SELECT a.codigo, a.nome FROM _eli_attrs a ORDER BY a.codigo LOOP
    SELECT count(*), (array_agg(pa.id ORDER BY pa.created_at, pa.id))[1] INTO v_n, v_attr
    FROM product_attributes pa
    WHERE pa.organization_id = c_org AND pa.deleted_at IS NULL AND public.fn_cat_chave_opcao(pa.label) = public.fn_cat_chave_opcao(r.nome);
    IF v_n > 1 THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: a Mudelar tem % atributos «%».', v_n, r.nome; END IF;
    IF v_n = 1 THEN
      IF EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.id = v_attr AND (pa.is_measurement OR pa.value_type <> 'list' OR NOT pa.sku_entra)) THEN
        RAISE EXCEPTION 'eletrodomesticos_mudelar: o atributo «%» existe mas não é uma lista que entra no SKU.', r.nome;
      END IF;
      v_grupo := public.fn_cat_grupo_do_atributo(v_attr, c_org);
      IF v_grupo IS NULL OR NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_grupo AND g.organization_id = c_org) THEN
        RAISE EXCEPTION 'eletrodomesticos_mudelar: as opções de «%» não são de um grupo próprio da Mudelar.', r.nome;
      END IF;
    ELSE
      IF r.codigo = 'cor' THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: a Mudelar não tem o atributo Cor.'; END IF;
      SELECT count(*)::integer, coalesce(max(pa.sort_order), 0) + 1 INTO v_i, v_ordem FROM product_attributes pa
      WHERE pa.organization_id = c_org AND pa.deleted_at IS NULL;
      IF v_i >= c_max_atributos THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: a Mudelar já tem o máximo de atributos (%).', c_max_atributos; END IF;
      v_code := r.codigo; v_i := 1;
      WHILE EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.organization_id = c_org AND pa.code = v_code) LOOP
        v_i := v_i + 1;
        v_code := r.codigo || '_' || v_i::text;
      END LOOP;
      -- sku_ordem: o gatilho trg_cat_sku_ordem põe a maior + 1 (fica no fim); sku_entra = true
      INSERT INTO product_attributes (organization_id, code, label, type, value_type, has_hex_color, is_measurement,
                                      measurement_type, unit, pricing_type, valorization_type, is_variant_option,
                                      is_variant_attribute, sort_order, created_by, sku_entra)
      VALUES (c_org, v_code, r.nome, 'select'::public.attribute_type, 'list', false, false,
              NULL, NULL, 'none', 'none', false, false, v_ordem, v_criador, true)
      RETURNING id INTO v_attr;
      INSERT INTO attribute_option_groups (attribute_id, organization_id, name, sort_order, is_active, created_by)
      VALUES (v_attr, c_org, r.nome, v_ordem, true, v_criador)
      RETURNING id INTO v_grupo;
      IF public.fn_cat_grupo_do_atributo(v_attr, c_org) IS DISTINCT FROM v_grupo THEN
        RAISE EXCEPTION 'eletrodomesticos_mudelar: o grupo de «%» não ficou o grupo em uso do atributo.', r.nome;
      END IF;
      UPDATE _eli_attrs a SET criado = true WHERE a.codigo = r.codigo;
      v_n_attrs_criados := v_n_attrs_criados + 1;
      v_attrs_criados := v_attrs_criados || r.nome || ' (' || v_code || '); ';
    END IF;
    UPDATE _eli_attrs a SET atributo_id = v_attr, grupo_id = v_grupo WHERE a.codigo = r.codigo;
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || v_grupo::text, 0));
  END LOOP;

  -- ─── 4. Opções: reutiliza pelo nome; as que faltam criam-se (sigla pedida, ou a livre que sobrar) ─────
  FOR r IN SELECT o.attr, o.valor, o.sigla_pedida, a.grupo_id FROM _eli_opcoes o JOIN _eli_attrs a ON a.codigo = o.attr ORDER BY o.ordem LOOP
    SELECT count(*), (array_agg(v.id ORDER BY v.id))[1], (array_agg(v.is_active ORDER BY v.id))[1],
           (array_agg(v.value_text::text ORDER BY v.id))[1], (array_agg(v.sigla ORDER BY v.id))[1]
      INTO v_n, v_opc, v_ativa, v_valor, v_sigla
    FROM attribute_option_group_values v
    WHERE v.group_id = r.grupo_id AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(r.valor);
    IF v_n > 1 THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: há % opções «%» em «%».', v_n, r.valor, r.attr; END IF;
    IF v_n = 1 AND NOT v_ativa THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: a opção «%» de «%» está desativada.', r.valor, r.attr; END IF;
    IF v_n = 1 AND v_sigla IS NULL THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: a opção «%» de «%» não tem sigla.', r.valor, r.attr; END IF;
    IF v_n = 0 THEN
      v_sigla := r.sigla_pedida;
      IF v_sigla IS NULL OR EXISTS (SELECT 1 FROM attribute_option_group_values x WHERE x.group_id = r.grupo_id AND x.sigla = v_sigla) THEN
        v_sigla := public.fn_cat_sigla_opcao_livre(r.grupo_id, r.valor, NULL);
      END IF;
      IF v_sigla IS NULL THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: sem sigla livre para «%» em «%».', r.valor, r.attr; END IF;
      INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active, sigla)
      VALUES (r.grupo_id, r.valor, r.valor, NULL,
              coalesce((SELECT max(x.sort_order) FROM attribute_option_group_values x WHERE x.group_id = r.grupo_id), 0) + 1, true, v_sigla)
      RETURNING id, value_text::text INTO v_opc, v_valor;
      UPDATE _eli_opcoes o SET criada = true WHERE o.attr = r.attr AND o.valor = r.valor;
      v_n_opcoes_criadas := v_n_opcoes_criadas + 1;
      v_opcoes_criadas := v_opcoes_criadas || r.attr || ' ' || r.valor || ' (' || v_sigla || '); ';
    END IF;
    UPDATE _eli_opcoes o SET opcao_id = v_opc, valor_db = v_valor, sigla = v_sigla WHERE o.attr = r.attr AND o.valor = r.valor;
  END LOOP;

  -- ─── 5. Modelos, um por (subcategoria, número) ───────────────────────────────
  SELECT count(*) FILTER (WHERE pm.is_active), count(*) INTO v_n, v_m
  FROM product_models pm WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL;
  IF v_n + c_n_modelos > c_max_modelos_ativos OR v_m + c_n_modelos > c_max_modelos_vivos THEN
    RAISE EXCEPTION 'eletrodomesticos_mudelar: a Mudelar passaria o teto de modelos (% ativos, % vivos).', v_n, v_m;
  END IF;
  FOR r IN SELECT m.sub, m.numero, m.nome, s.sub_id FROM _eli_modelos m JOIN _eli_subs s ON s.codigo = m.sub ORDER BY s.ordem, m.numero LOOP
    v_mod := NULL;
    SELECT pm.id, pm.is_active INTO v_mod, v_ativa FROM product_models pm
    WHERE pm.organization_id = c_org AND pm.subcategory_id = r.sub_id AND pm.numero = r.numero AND pm.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_mod IS NOT NULL AND NOT v_ativa THEN
      RAISE EXCEPTION 'eletrodomesticos_mudelar: o modelo % (% %) já existe e está desativado.', r.nome, r.sub, lpad(r.numero::text, 4, '0');
    END IF;
    IF v_mod IS NULL THEN
      INSERT INTO product_models (organization_id, subcategory_id, name, numero, is_active, created_by)
      VALUES (c_org, r.sub_id, r.nome, r.numero, true, v_criador)
      RETURNING id INTO v_mod;
    END IF;
    UPDATE _eli_modelos m SET modelo_id = v_mod WHERE m.sub = r.sub AND m.numero = r.numero;
  END LOOP;

  -- ─── 6. As linhas a gravar, com o SKU final (a regra de cat_gerar_sku_produto, calculada antes de inserir) ─────
  CREATE TEMP TABLE _eli ON COMMIT DROP AS
  SELECT gen_random_uuid() AS id, y.linha, y.sub, y.sub_id, y.modelo, y.modelo_id, y.nome, y.custo, y.pvp, y.grossista, y.distribuidor,
         y.marca_id, y.marca, y.cod_forn, y.cor, y.largura, y.capacidade, y.gas,
         concat_ws('-', z.pt ->> 'prefixo', lpad(y.modelo::text, 4, '0'), z.pt ->> 'resto') AS sku,
         (z.pt ->> 'prefixo') AS prefixo, (z.pt -> 'faltas') AS faltas
  FROM (SELECT l.linha, l.sub, s.sub_id, m.numero AS modelo, m.modelo_id, l.nome, l.custo, l.pvp, l.grossista, l.distribuidor,
               b.id AS marca_id, l.marca, l.cod_forn, l.cor, l.largura, l.capacidade, l.gas,
               (SELECT coalesce(jsonb_agg(jsonb_build_object('atributo', a.atributo_id, 'sigla', o.sigla, 'medida', NULL::jsonb)), '[]'::jsonb)
                FROM _eli_opcoes o JOIN _eli_attrs a ON a.codigo = o.attr
                WHERE (o.attr = 'cor' AND o.valor = l.cor) OR (o.attr = 'largura' AND o.valor = l.largura)
                   OR (o.attr = 'capacidade' AND o.valor = l.capacidade) OR (o.attr = 'gas' AND o.valor = l.gas)) AS attrs
        FROM _eli_linhas l
        JOIN _eli_subs s ON s.codigo = l.sub
        JOIN _eli_modelos m ON m.sub = l.sub AND m.nome = l.modelo_nome
        LEFT JOIN _eli_marcas b ON b.nome = l.marca) y
  CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, v_cat, y.sub_id, y.attrs) AS pt) z;
  SELECT count(*) INTO v_n FROM _eli;
  IF v_n <> c_total THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: % linhas a gravar em vez de %.', v_n, c_total; END IF;
  IF EXISTS (SELECT 1 FROM _eli b WHERE b.sub_id IS NULL OR b.modelo_id IS NULL OR (b.marca IS NOT NULL AND b.marca_id IS NULL)) THEN
    RAISE EXCEPTION 'eletrodomesticos_mudelar: há linhas sem subcategoria, modelo ou marca resolvidos.';
  END IF;
  SELECT count(*), string_agg(b.nome || ' ' || coalesce(b.faltas::text, ''), '; ') INTO v_n, v_txt
  FROM _eli b WHERE b.prefixo IS NULL OR b.faltas IS DISTINCT FROM '[]'::jsonb OR b.sku IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: % SKUs sem prefixo ou com faltas: %', v_n, left(v_txt, 1500); END IF;

  SELECT string_agg(x.sku || ' ×' || x.n || ' (' || x.nomes || ')', '; ') INTO v_txt
  FROM (SELECT b.sku, count(*) AS n, string_agg(b.nome, ' | ' ORDER BY b.linha) AS nomes FROM _eli b
        GROUP BY b.sku HAVING count(*) > 1 ORDER BY b.sku LIMIT 10) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: SKUs repetidos: %', v_txt; END IF;
  SELECT string_agg(b.sku || ' (' || p.name || ')', '; ') INTO v_txt
  FROM (SELECT b2.sku FROM _eli b2 JOIN products p2 ON p2.organization_id = c_org AND p2.sku = b2.sku ORDER BY b2.sku LIMIT 10) b
  JOIN products p ON p.organization_id = c_org AND p.sku = b.sku;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'eletrodomesticos_mudelar: SKUs já usados noutros produtos da Mudelar: %', v_txt; END IF;
  v_regex := '^' || c_cat_sigla || '-(' || (SELECT string_agg(s.codigo, '|' ORDER BY s.ordem) FROM _eli_subs s) || ')-[0-9]{4}(-[A-Z0-9]{1,6}){0,4}$';
  IF EXISTS (SELECT 1 FROM _eli b WHERE b.sku !~ v_regex) THEN
    RAISE EXCEPTION 'eletrodomesticos_mudelar: SKU fora do formato (ex.: %).', (SELECT b.sku FROM _eli b WHERE b.sku !~ v_regex LIMIT 1);
  END IF;

  -- ─── 7. Gravar (auditoria normal, linha a linha) ─────────────────────────────
  INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                        manages_stock, created_by, tipo_catalogo, category_id, subcategory_id, model_id, brand_id, uom_id,
                        supplier_id, fornecedor_livre, sku_gerado)
  SELECT b.id, c_org, b.sku, b.nome, 'active'::product_status, true, true, true, false, false,
         true, v_criador, 'produto', v_cat, b.sub_id, b.modelo_id, b.marca_id, v_uom,
         v_sup, public.fn_cat_limpar_nome(c_forn_nome), true
  FROM _eli b ORDER BY b.linha;

  INSERT INTO product_organizations (product_id, organization_id, created_by)
  SELECT b.id, c_org, v_criador FROM _eli b ORDER BY b.linha;

  INSERT INTO product_prices (product_id, currency, price, preco_exato, valid_from, created_by, price_type, vat_rate)
  SELECT b.id, 'EUR'::currency_code, round(b.custo, 2), round(b.custo, 6), v_agora, v_criador, 'purchase'::price_type, c_iva FROM _eli b
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.pvp, 2), NULL::numeric, v_agora + interval '1 microsecond', v_criador, 'retail'::price_type, c_iva FROM _eli b
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.grossista, 2), NULL::numeric, v_agora + interval '2 microsecond', v_criador, 'wholesale'::price_type, c_iva
  FROM _eli b WHERE b.grossista > 0
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.distribuidor, 2), NULL::numeric, v_agora + interval '3 microsecond', v_criador, 'distributor'::price_type, c_iva
  FROM _eli b WHERE b.distribuidor > 0;

  -- como cat_ligar_fornecedor_produto: preferido, preço = custo; supplier_sku = código de fornecedor, ou o SKU se não vier
  INSERT INTO item_suppliers (organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price, currency,
                              is_preferred, is_active, created_by, preco_data)
  SELECT c_org, 'product', b.id, v_sup, NULL, coalesce(b.cod_forn, b.sku), round(b.custo, 2), 'EUR', true, true, v_criador, current_date
  FROM _eli b ORDER BY b.linha;

  -- os valores dos atributos (value_text = o da opção, como cat_guardar_produto_atributos)
  INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_json, unit)
  SELECT b.id, a.atributo_id, o.valor_db, NULL::jsonb, NULL::text
  FROM _eli b
  JOIN _eli_opcoes o ON (o.attr = 'cor' AND o.valor = b.cor) OR (o.attr = 'largura' AND o.valor = b.largura)
                     OR (o.attr = 'capacidade' AND o.valor = b.capacidade) OR (o.attr = 'gas' AND o.valor = b.gas)
  JOIN _eli_attrs a ON a.codigo = o.attr
  ORDER BY b.linha, a.codigo;

  -- ─── 8. Conferir (cada contagem é do que está ERRADO; tem de dar 0) ───────────
  -- produtos por subcategoria
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _eli_subs s) AND NOT p.is_deleted;
  IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: % produtos nas subcategorias em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(s.nome || ' ' || coalesce(x.n, 0) || ' em vez de ' || s.esperados, '; ') INTO v_txt
  FROM _eli_subs s
  LEFT JOIN (SELECT p.subcategory_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.subcategory_id) x ON x.subcategory_id = s.sub_id
  WHERE coalesce(x.n, 0) <> s.esperados;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: contagem por subcategoria errada: %', v_txt; END IF;
  -- modelos: nome, número, vivos, e os produtos de cada um
  SELECT string_agg(m.sub || lpad(m.numero::text, 4, '0') || ' ' || m.nome || ' (' || coalesce(x.n, 0) || ' em vez de ' || m.esperados || ')', '; ') INTO v_txt
  FROM _eli_modelos m
  JOIN _eli_subs s ON s.codigo = m.sub
  LEFT JOIN product_models pm ON pm.id = m.modelo_id AND pm.organization_id = c_org AND pm.subcategory_id = s.sub_id AND pm.deleted_at IS NULL
                              AND pm.is_active AND pm.numero = m.numero AND pm.name = m.nome
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted GROUP BY p.model_id) x
         ON x.model_id = m.modelo_id
  WHERE pm.id IS NULL OR coalesce(x.n, 0) <> m.esperados;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: modelos com nome, número ou produtos errados: %', left(v_txt, 1500); END IF;
  SELECT count(*) INTO v_n FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id IN (SELECT s.sub_id FROM _eli_subs s);
  IF v_n <> c_n_modelos THEN RAISE EXCEPTION 'Conferir: % modelos nas subcategorias em vez de %.', v_n, c_n_modelos; END IF;

  -- cada produto como a sua linha (LEFT JOIN + NOT coalesce(…, false): em falta também conta)
  SELECT count(*), string_agg(b.nome, ' | ') INTO v_n, v_txt
  FROM _eli b
  LEFT JOIN products p ON p.id = b.id
  LEFT JOIN product_prices pc ON pc.product_id = b.id AND pc.price_type = 'purchase'
  LEFT JOIN product_prices pv ON pv.product_id = b.id AND pv.price_type = 'retail'
  LEFT JOIN item_suppliers i ON i.product_id = b.id AND i.deleted_at IS NULL
  WHERE NOT coalesce(p.organization_id = c_org AND p.name = b.nome AND p.sku = b.sku AND p.sku_gerado AND p.model_id = b.modelo_id
        AND p.category_id = v_cat AND p.subcategory_id = b.sub_id AND p.brand_id IS NOT DISTINCT FROM b.marca_id
        AND p.marca_livre IS NOT DISTINCT FROM b.marca
        AND p.uom_id = v_uom AND p.unidade = c_unidade AND p.status = 'active'::product_status AND p.tipo_catalogo = 'produto'
        AND p.manages_stock AND p.is_active AND NOT p.is_deleted AND p.supplier_id = v_sup
        AND p.fornecedor_livre = public.fn_cat_limpar_nome(c_forn_nome)
        AND pc.price = round(b.custo, 2) AND pc.preco_exato = round(b.custo, 6) AND pc.vat_rate = c_iva
        AND pv.price = round(b.pvp, 2) AND pv.vat_rate = c_iva
        AND i.organization_id = c_org AND i.supplier_id = v_sup AND i.is_preferred AND i.is_active
        AND i.purchase_price = round(b.custo, 2) AND i.supplier_sku = coalesce(b.cod_forn, p.sku),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos não ficaram como a linha do ficheiro: %', v_n, left(v_txt, 1500); END IF;
  -- preços grossista e distribuidor: certos nas linhas com valor, ausentes nas outras; e o total de preços
  SELECT count(*) INTO v_n FROM _eli b
  WHERE coalesce(b.grossista > 0, false) IS DISTINCT FROM EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = b.id AND x.price_type = 'wholesale'
                                                    AND x.price = round(b.grossista, 2) AND x.vat_rate = c_iva AND x.currency = 'EUR')
     OR coalesce(b.distribuidor > 0, false) IS DISTINCT FROM EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = b.id AND x.price_type = 'distributor'
                                                       AND x.price = round(b.distribuidor, 2) AND x.vat_rate = c_iva AND x.currency = 'EUR');
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos com os preços grossista/distribuidor errados.', v_n; END IF;
  SELECT (SELECT count(*) FROM product_prices x JOIN _eli b ON b.id = x.product_id),
         (SELECT count(*) FROM product_prices x JOIN _eli b ON b.id = x.product_id WHERE x.price_type = 'wholesale'),
         (SELECT count(*) FROM product_prices x JOIN _eli b ON b.id = x.product_id WHERE x.price_type = 'distributor')
    INTO v_n, v_m, v_k;
  IF v_n <> 2 * c_total + c_n_gross + c_n_dist OR v_m <> c_n_gross OR v_k <> c_n_dist THEN
    RAISE EXCEPTION 'Conferir: % preços (esperados %), % grossista (esperados %), % distribuidor (esperados %).',
      v_n, 2 * c_total + c_n_gross + c_n_dist, v_m, c_n_gross, v_k, c_n_dist;
  END IF;
  SELECT (SELECT count(*) FROM item_suppliers x JOIN _eli b ON b.id = x.product_id),
         (SELECT count(*) FROM product_organizations x JOIN _eli b ON b.id = x.product_id)
    INTO v_n, v_m;
  IF v_n <> c_total OR v_m <> c_total THEN
    RAISE EXCEPTION 'Conferir: % ligações a fornecedor e % product_organizations (esperados %).', v_n, v_m, c_total;
  END IF;
  SELECT count(*) INTO v_n FROM _eli b
  WHERE b.cod_forn IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM item_suppliers i WHERE i.product_id = b.id AND i.deleted_at IS NULL AND i.supplier_sku = b.cod_forn);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % códigos de fornecedor do ficheiro não ficaram em supplier_sku.', v_n; END IF;

  -- atributos: o que FALTA e o que SOBRA (por atributo), e o total gravado
  SELECT count(*) INTO v_n FROM _eli b
  CROSS JOIN LATERAL (VALUES ('cor', b.cor), ('largura', b.largura), ('capacidade', b.capacidade), ('gas', b.gas)) t(attr, valor)
  WHERE t.valor IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values v JOIN _eli_attrs a ON a.atributo_id = v.attribute_id AND a.codigo = t.attr
                    JOIN _eli_opcoes o ON o.attr = t.attr AND o.valor = t.valor
                    WHERE v.product_id = b.id AND v.value_text = o.valor_db AND v.value_json IS NULL);
  SELECT count(*) INTO v_m FROM product_attribute_values v JOIN _eli b ON b.id = v.product_id
  WHERE NOT EXISTS (SELECT 1 FROM _eli_attrs a JOIN _eli_opcoes o ON o.attr = a.codigo
                    WHERE a.atributo_id = v.attribute_id AND o.valor_db = v.value_text
                      AND ((a.codigo = 'cor' AND o.valor = b.cor) OR (a.codigo = 'largura' AND o.valor = b.largura)
                           OR (a.codigo = 'capacidade' AND o.valor = b.capacidade) OR (a.codigo = 'gas' AND o.valor = b.gas)));
  IF v_n > 0 OR v_m > 0 THEN RAISE EXCEPTION 'Conferir: % valores de atributos em falta e % a mais.', v_n, v_m; END IF;
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN _eli b ON b.id = v.product_id;
  SELECT count(*) INTO v_m FROM _eli b, LATERAL (VALUES (b.cor), (b.largura), (b.capacidade), (b.gas)) t(x) WHERE t.x IS NOT NULL;
  IF v_n <> v_m THEN RAISE EXCEPTION 'Conferir: % valores de atributos gravados em vez de %.', v_n, v_m; END IF;
  -- os atributos: lista, entram no SKU, e os criados ficam no fim da ordem; as opções ativas com sigla
  SELECT count(*) INTO v_n FROM _eli_attrs a
  LEFT JOIN product_attributes pa ON pa.id = a.atributo_id AND pa.organization_id = c_org AND pa.deleted_at IS NULL
  WHERE NOT coalesce(NOT pa.is_measurement AND pa.value_type = 'list' AND pa.sku_entra AND pa.sku_ordem IS NOT NULL, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % atributos que não são lista, não entram no SKU ou não têm ordem.', v_n; END IF;
  SELECT count(*) INTO v_n FROM _eli_opcoes o
  LEFT JOIN attribute_option_group_values v ON v.id = o.opcao_id
  JOIN _eli_attrs a ON a.codigo = o.attr
  WHERE NOT coalesce(v.group_id = a.grupo_id AND v.is_active AND v.sigla = o.sigla AND v.value_text = o.valor_db, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % opções erradas (grupo, ativa, sigla ou valor).', v_n; END IF;
  SELECT count(*) INTO v_n FROM _eli_opcoes o WHERE o.criada AND o.sigla_pedida IS NOT NULL AND o.sigla IS DISTINCT FROM o.sigla_pedida
                                                   AND o.attr IN ('capacidade', 'gas');
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % opções de Capacidade/Gás sem a sigla pedida.', v_n; END IF;

  -- SKUs: únicos, no formato, e iguais ao recalculado a partir do que ficou gravado (todos)
  SELECT count(*), count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ v_regex OR p.sku ~ '^CAT-' OR NOT p.sku_gerado) INTO v_n, v_m, v_k
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _eli_subs s) AND NOT p.is_deleted;
  IF v_m <> c_total OR v_n <> c_total OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: % produtos, % SKUs distintos, % fora do formato % ou não gerados.', v_n, v_m, v_k, v_regex;
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
          WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _eli_subs s) AND NOT p.is_deleted) x
        WHERE x.calc IS DISTINCT FROM x.sku OR x.prefixo IS NULL OR x.faltas IS DISTINCT FROM '[]') y;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs diferentes do recalculado pela regra do Catálogo (ex.: %).', v_n, v_txt; END IF;

  -- todos com cat_prever_sku_modelo e os atributos gravados, como um membro da Mudelar com products.edit (só leitura)
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE NOTICE 'eletrodomesticos_mudelar: sem membro da Mudelar com products.edit — a comparação com cat_prever_sku_modelo ficou por fazer (o recálculo de todos foi feito).';
  ELSE
    v_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    v_n := 0;
    FOR r IN SELECT b.id, b.sku, b.sub_id, b.modelo_id FROM _eli b ORDER BY b.linha LOOP
      SELECT coalesce(jsonb_agg(jsonb_build_object('atributo', v.attribute_id, 'opcao', o.id)), '[]'::jsonb) INTO v_attrs
      FROM product_attribute_values v
      JOIN attribute_option_group_values o ON o.group_id = public.fn_cat_grupo_do_atributo(v.attribute_id, c_org) AND o.value_text = v.value_text
      WHERE v.product_id = r.id;
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
    UNION ALL SELECT 'brands', count(*) FROM brands x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_attributes', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_groups', count(*) FROM attribute_option_groups x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_group_values', count(*) FROM attribute_option_group_values x JOIN attribute_option_groups g ON g.id = x.group_id
              WHERE x.xmin::text = v_xid AND g.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: foram escritas linhas fora da Mudelar ou nas categorias: %', v_txt; END IF;
  IF NOT EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND p.xmin::text = v_xid
                 AND p.subcategory_id IN (SELECT s.sub_id FROM _eli_subs s)) THEN
    RAISE EXCEPTION 'Conferir: os produtos importados não têm o xmin desta transação: a verificação de «nada fora da Mudelar» não vale.';
  END IF;
  -- nenhum outro produto da Mudelar escrito; dos atributos só os criados; das marcas só as criadas ou renomeadas
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _eli b WHERE b.id = p.id);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % outros produtos da Mudelar foram escritos.', v_n; END IF;
  SELECT count(*) INTO v_n FROM product_attributes a WHERE a.organization_id = c_org AND a.xmin::text = v_xid
                                                         AND NOT EXISTS (SELECT 1 FROM _eli_attrs x WHERE x.atributo_id = a.id AND x.criado);
  SELECT count(*) INTO v_m FROM attribute_option_group_values v WHERE v.xmin::text = v_xid
                                                                  AND NOT EXISTS (SELECT 1 FROM _eli_opcoes o WHERE o.opcao_id = v.id AND o.criada);
  SELECT count(*) INTO v_k FROM brands x WHERE x.organization_id = c_org AND x.xmin::text = v_xid
                                             AND NOT EXISTS (SELECT 1 FROM _eli_marcas b WHERE b.id = x.id);
  IF v_n > 0 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: escritos % outros atributos, % outras opções e % outras marcas da Mudelar.', v_n, v_m, v_k;
  END IF;
  SELECT count(*) INTO v_n FROM attribute_option_group_values v WHERE v.xmin::text = v_xid;
  IF v_n <> v_n_opcoes_criadas THEN RAISE EXCEPTION 'Conferir: % opções escritas (criadas %).', v_n, v_n_opcoes_criadas; END IF;
  IF v_n_attrs_criados > 0 AND (SELECT count(*) FROM product_attributes a WHERE a.xmin::text = v_xid) <> v_n_attrs_criados THEN
    RAISE EXCEPTION 'Conferir: o número de atributos escritos não é o dos criados (%).', v_n_attrs_criados;
  END IF;
  -- a amostra de SKUs de Duche & Banho, Loiças e Acessórios ficou igual (LEFT JOIN: um produto desaparecido também conta)
  SELECT count(*), string_agg(a.sku, ', ') INTO v_n, v_txt
  FROM _eli_amostra a LEFT JOIN products p ON p.id = a.id
  WHERE NOT coalesce(p.sku = a.sku AND NOT p.is_deleted AND p.organization_id = c_org, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs da amostra de outras categorias mudaram: %', v_n, v_txt; END IF;

  RAISE NOTICE 'eletrodomesticos_mudelar: % produtos em «%» (% modelos). Marcas: %. Fornecedor criado: %. Atributos criados: %. Opções criadas: %. Amostra de outras categorias: % SKUs iguais. Conferido.',
    c_total, c_cat_nome, c_n_modelos, coalesce(nullif(v_marcas_criadas, ''), 'nenhuma criada nem renomeada'), v_forn_criado,
    coalesce(nullif(v_attrs_criados, ''), 'nenhum'), coalesce(nullif(v_opcoes_criadas, ''), 'nenhuma'), (SELECT count(*) FROM _eli_amostra);
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
