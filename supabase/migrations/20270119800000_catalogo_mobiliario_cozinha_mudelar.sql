-- =============================================================================
-- Catálogo — importação de MOBILIÁRIO & COMPONENTES COZINHA da MUDELAR (CSV do utilizador «Mobiliário & Componentes
-- Cozinha.csv», 262 linhas). Base de RH (uetjghdkwbywbftedtth). Ficheiro GERADO por script (gerar.js + parse.js +
-- sql.js, em import-mobiliario) a partir do CSV: as linhas de dados abaixo não se editam à mão — regeneram-se.
-- Molde: 20270118900000 (importação), 20270119000000 (Largura de lista), 20270118400000 (medida 2D e cor),
-- 20270119600000 (medida com intervalo).
-- =============================================================================
--
-- Decisões (17/11):
--   * 328 produtos = as 262 linhas + 66 (os 33 «Armários Inferiores» com «Cor: VERDE NORMAL (+40,00€), VERDE CLARO
--     (+10,00€)» entram 3 vezes: sem cor; Cor = verde normal com PVP + 40; Cor = verde claro com PVP + 10; o custo não
--     muda). Por subcategoria: Acessórios de Cozinha 22 (22 modelos), Armários de Coluna 3 (3 modelos), Armários Inferiores 103 (7 modelos), Armários superiores 197 (11 modelos), Cozinha Completa - Projetos 1 (1 modelos), Puxadores 2 (2 modelos).
--   * Todos sem marca. As listas de cores (colunas Cor, Cor de Móveis de Cozinha, Tonalidade) ignoram-se. A «Medida : 0-60
--     (40,00€/un)» do MCCAI0003 ignora-se.
--   * Modelo = o nome sem a medida («Armário Superior de cozinha lacado basculante»); 46 modelos, numerados 0001…
--     em cada subcategoria pela ordem do menor SKU antigo. Os nomes sem medida separável (acessórios, colunas, projeto,
--     puxadores, os genéricos LACADO/MELAMINA/TERMOLAMINADO, os «Canto em L … Alt») são um modelo cada, com o nome todo.
--   * Medida (atributo «medida» da Mudelar, 2D em cm): «<L>x<A>cm Altura» → largura L, comprimento A; «de 91 a 100x90cm
--     Altura» → largura {de 91, ate 100}. «de 0 a 30» numa MEDIDA: a medida só aceita números > 0 → a largura fica
--     {de 1, ate 30} (12 produtos; POR DECIDIR). 192 produtos com medida.
--   * Largura (atributo de LISTA «largura»): «<n>cm» → a opção <n>; «de 41cm a 50cm» → a opção «41-50» com sigla 41A50
--     (uma lista não guarda intervalos). Opções que faltarem criam-se (sigla = o número ou <de>A<ate>); as que já
--     existirem reutilizam-se. 96 produtos com largura.
--   * Cor: as opções «verde normal» e «verde claro» da Cor da Mudelar (lidas a 17/11: VNR e VC); criadas se faltarem.
--   * SKU gerado (MCC-SUB-NNNN-<cor>-<medida>-<largura>, pela sku_ordem), calculado aqui pela regra do Catálogo
--     (fn_cat_sku_partes) e comparado com o esperado pelo gerador; um diferente, repetido ou já usado PARA tudo.
--   * Unidade: «un»; os 2 «(valor p/ml)» (MCCAC0009, MCCAC0010) ficam na unidade «ml» (metro linear), criada na Mudelar
--     por fn_cat_unidade se faltar (lido a 17/11: a Mudelar só tem «un»).
--   * Preços: custo = Preço Compra, PVP = Preço Venda, IVA 23; Preço Grossista e Preço Distribuidor (8 linhas > 0)
--     entram como price_type wholesale e distributor.
--   * Fornecedor «Anlorbel - Com. de Mat. de Construção e Decoração, SA» = o «ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E
--     DECORACAO» da Mudelar (criado se faltar). supplier_sku = o SKU novo; no MCCAC0018 = «940TUL0000004 3270821», o
--     código que sai do nome. Descrição gravada nos 2 que a têm.
--   * Subcategoria «Cozinha Completa - Projetos» (CCP): usa-se a que existir; cria-se se faltar (lida a 17/11: existe).
--   * Estado active, vendável e comprável (os 2 «venda» também), gere stock — como cat_guardar_produto.
--   * Auditoria normal, linha a linha, com app.audit_source = 'migration:mobiliario_cozinha_mudelar'.
--
-- GUARDA (inerte: RAISE NOTICE e sai) se: a organização 3242e925-… não existir com o nome 'Mudelar'; faltar a categoria
-- ou uma das 5 subcategorias que não se criam; já houver produtos (vivos ou apagados) numa das 6 subcategorias; já houver
-- um produto vivo da Mudelar com um dos nomes; ou já houver nelas um modelo com um dos nomes ou números que não seja
-- exatamente o mesmo. Inerte numa segunda execução.
-- Falha (RAISE EXCEPTION, nada fica) se: faltar uma função do Catálogo ou a medida com intervalo (20270119600000);
-- siglas da categoria ou das subcategorias diferentes de MCC/AC/ACL/AI/AS/CCP/PX; desativadas; faltar o atributo cor,
-- medida ou largura; uma opção ambígua, desativada ou sem sigla livre; SKU calculado diferente do esperado, repetido ou
-- já usado.
--
-- Conferir no fim (conta o que está ERRADO e faz RAISE se não for 0): produtos por subcategoria e por modelo; cada produto
-- como a sua linha (nome, SKU, modelo, unidade, preços, fornecedor, atributos, nada a mais); SKUs únicos, no formato,
-- iguais ao recalculado e a cat_prever_sku_modelo (todos); as opções; nada escrito fora da Mudelar nem noutros produtos,
-- atributos ou categorias dela (xmin); amostra de SKUs de outras categorias intacta.
--
-- ORDEM: depois de 20270119600000. Teste: supabase/tests/catalogo_mobiliario_cozinha_mudelar.test.sql (BEGIN …
-- ROLLBACK, só leitura; o passo 0 falha antes). ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver
-- pendente; listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '5min';

DO $mig$
DECLARE
  c_org         constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte       constant text    := 'migration:mobiliario_cozinha_mudelar';
  c_total       constant integer := 328;
  c_n_modelos   constant integer := 46;
  c_n_opcoes    constant integer := 16;
  c_n_cores     constant integer := 66;
  c_n_medidas   constant integer := 192;
  c_n_larguras  constant integer := 96;
  c_n_ml        constant integer := 2;
  c_n_gross     constant integer := 8;
  c_n_dist      constant integer := 8;
  c_n_cod       constant integer := 1;
  c_iva         constant numeric := 23;
  c_cat_nome    constant text    := 'Mobiliário & Componentes Cozinha';
  c_cat_sigla   constant text    := 'MCC';
  c_forn_nome   constant text    := 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO';
  c_max_categorias     constant integer := 300;
  c_max_modelos_ativos constant integer := 2000;
  c_max_modelos_vivos  constant integer := 10000;
  v_agora   timestamptz := clock_timestamp();
  v_n bigint; v_m bigint; v_k bigint; v_opc_n_med bigint; v_opc_n_larg bigint; v_xid text; v_txt text; v_slug text; v_regex text;
  v_criadas text := ''; v_subs_criadas text := ''; v_ml_criada boolean := false; v_forn_criado boolean := false;
  v_cat uuid; v_cat_sigla text; v_cat_ativa boolean; v_cat_nome_real text; v_sub uuid; v_ativa boolean; v_criador uuid;
  v_sup uuid; v_mod uuid; v_opc uuid; v_ordem integer;
  v_a_cor uuid; v_a_med uuid; v_a_larg uuid; v_g_cor uuid; v_g_larg uuid; v_med_unit text;
  v_auth uuid; v_claims text; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  -- ─── 0. Guarda ────────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'mobiliario_cozinha_mudelar: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  SELECT string_agg(s, ', ') INTO v_txt
  FROM unnest(ARRAY['public.fn_cat_chave_opcao(text)', 'public.fn_cat_limpar_nome(text)', 'public.fn_cat_slug(text)',
                    'public.fn_cat_grupo_do_atributo(uuid,uuid)', 'public.fn_cat_medida_ler(jsonb,text)',
                    'public.fn_cat_sku_medida(jsonb)', 'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)',
                    'public.fn_cat_dimensao_medida(jsonb,text)', 'public.fn_cat_dimensao_texto(jsonb)',
                    'public.fn_cat_sigla_opcao_livre(uuid,text,uuid)', 'public.fn_cat_unidade(uuid,text)',
                    'public.fn_cat_modelo_numero(uuid,uuid,uuid)', 'public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)',
                    'public.has_anew_permission_in_org(uuid,text,uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: faltam funções do Catálogo (%).', v_txt; END IF;
  IF public.fn_cat_sku_medida('{"tipo":"2D","largura":{"de":91,"ate":100},"comprimento":90,"unidade":"cm"}'::jsonb)
     IS DISTINCT FROM '91A100X90' THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: a medida não aceita intervalos (aplicar 20270119600000 antes).';
  END IF;

  SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(c.sigla ORDER BY c.created_at, c.id))[1],
         (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1], (array_agg(c.name ORDER BY c.created_at, c.id))[1]
    INTO v_n, v_cat, v_cat_sigla, v_cat_ativa, v_cat_nome_real
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(c_cat_nome);
  IF v_n = 0 THEN
    RAISE NOTICE 'mobiliario_cozinha_mudelar: a Mudelar não tem a categoria «%» — nada a fazer.', c_cat_nome;
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: há % categorias «%» na Mudelar.', v_n, c_cat_nome;
  END IF;

  -- ─── Os dados do CSV (gerados) ────────────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._mcc_subs, pg_temp._mcc_modelos, pg_temp._mcc_larguras, pg_temp._mcc_cores,
                       pg_temp._mcc_linhas, pg_temp._mcc_unidades, pg_temp._mcc, pg_temp._mcc_amostra;

  -- as subcategorias: sigla, nome na Mudelar, quantos produtos, ordem, cria-se se faltar
  CREATE TEMP TABLE _mcc_subs (codigo text PRIMARY KEY, nome text NOT NULL, esperados integer NOT NULL, ordem integer NOT NULL,
                               criar boolean NOT NULL, sub_id uuid, criada boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _mcc_subs (codigo, nome, esperados, ordem, criar) VALUES
    ('AC', 'Acessórios de Cozinha', 22, 1, false),
    ('ACL', 'Armários de Coluna', 3, 2, false),
    ('AI', 'Armários Inferiores', 103, 3, false),
    ('AS', 'Armários superiores', 197, 4, false),
    ('CCP', 'Cozinha Completa - Projetos', 1, 5, true),
    ('PX', 'Puxadores', 2, 6, false);

  -- os modelos: subcategoria, número, nome, quantos produtos
  CREATE TEMP TABLE _mcc_modelos (sub text NOT NULL, numero smallint NOT NULL, nome text NOT NULL, esperados integer NOT NULL,
                                  modelo_id uuid, PRIMARY KEY (sub, numero)) ON COMMIT DROP;
  INSERT INTO _mcc_modelos (sub, numero, nome, esperados) VALUES
    ('AC', 1, 'Estrutura de Pimenteiro para Interior do móvel de 200mm', 1),
    ('AC', 2, 'Garrafeira Superior / Inferior de 15cm / 30cm (valor unitário)', 1),
    ('AC', 3, 'Garrafeira Coluna de 15cm / 30cm (valor unitário)', 1),
    ('AC', 4, 'Puxadores asa prata (valor unitário)', 1),
    ('AC', 5, 'Porta talheres até 80cm', 1),
    ('AC', 6, 'Estrutura para gavetão (valor unitário)', 1),
    ('AC', 7, 'Estrutura para gaveta (valor unitário)', 1),
    ('AC', 8, 'Estrutura de Gavetões Internos para dispenseiro (valor até 4 unidades)', 1),
    ('AC', 9, 'Iluminação LED móveis superiores (valor p/ml)', 1),
    ('AC', 10, 'Vista superior até 20cm de altura (valor p/ml)', 1),
    ('AC', 11, 'Caixote do Lixo para Mobiliário de cozinha', 1),
    ('AC', 12, 'BLOCO EM TERMOLAMINADO BRANCO BRILHO C/ 450X400X600 - 1 GAVETÃO + TAMPO', 1),
    ('AC', 13, 'BLOCO EM TERMOLAMINADO BRANCO BRILHO C/ 450X400X750 - 1 GAVETÃO + TAMPO', 1),
    ('AC', 14, 'TAMPO EM TERMOLAMINADO BRANCO BRILHO C/ 750X600XPÉ INOX', 1),
    ('AC', 15, 'PRATELEIRA SUSPENSA TERMOLAMINADO BRANCO BRILHO C/ 1400', 1),
    ('AC', 16, 'Prateleira em Melamina Nogueira C/Fixação Oculta 250x650x40', 1),
    ('AC', 17, 'Prateleira em Melamina Nogueira C/Fixação Oculta 250x1100x250', 1),
    ('AC', 18, 'ESTRUTURA LAUNDRY CARRIER 500 2X33L 528MM ALT 545MM ANTRACITE', 1),
    ('AC', 19, 'PRATELEIRA VIDRO INCOLOR 6MM C/ ARESTAS C/ 600X400 P/Móvel de Cozinha', 1),
    ('AC', 20, 'ARO + ESTRUTURA + FRENTE P/ PRATELEIRA EXTRAIVEL DE 600 DE LARGURA ( P/ COLOCAR POR BAIXO DA ZONHA DE MAQ)', 1),
    ('AC', 21, 'RIPADOS MELAMINA 2400X700 ORC2691/2118', 1),
    ('AC', 22, 'Reparação de Estrutura p/ Gaveta + Gavetão', 1),
    ('ACL', 1, 'Armário de Coluna C/Espaço Interior 2400x1000x600', 1),
    ('ACL', 2, 'COLUNA CRISTALEIRA C/ 2500X400X400 C/ 4 PRATELEIRS E 2 FRENTES EM VIDRO INCOLOR', 1),
    ('ACL', 3, 'ARMÁRIO DE COLUNA COM CANTO DE ARRUMAÇÃO 1200X2400X600', 1),
    ('AI', 1, 'Armário Inferior TERMOLAMINADO', 1),
    ('AI', 2, 'Armário Inferior MELAMINA', 1),
    ('AI', 3, 'Armário Inferior LACADO', 1),
    ('AI', 4, 'Armário Inferior de cozinha', 48),
    ('AI', 5, 'Armário Inferior de cozinha lacado', 48),
    ('AI', 6, 'Armário Inferior de cozinha Canto em L', 3),
    ('AI', 7, 'Armários Inferiores de cozinha Conforme Layout MD1394 Acréscimo 5 cm de Altura', 1),
    ('AS', 1, 'Armário superior TERMOLAMINADO', 1),
    ('AS', 2, 'Armário superior MELAMINA', 1),
    ('AS', 3, 'Armário superior LACADO', 1),
    ('AS', 4, 'Armário Superior de cozinha', 32),
    ('AS', 5, 'Armário Superior de cozinha em vidro', 32),
    ('AS', 6, 'Armário Superior de cozinha basculante', 32),
    ('AS', 7, 'Armário Superior de cozinha lacado', 32),
    ('AS', 8, 'Armário Superior de cozinha lacado em vidro', 32),
    ('AS', 9, 'Armário Superior de cozinha lacado basculante', 32),
    ('AS', 10, 'Armário Superior de cozinha Canto em L 70cm Alt', 1),
    ('AS', 11, 'Armário Superior de cozinha Canto em L 90cm Alt', 1),
    ('CCP', 1, 'COZINHA EM TERMOLAMINADO CINZA ANTRACITE MOVEIS EM MELAMINA HIDROFUGO CINZA 166TF PERFIL GOLA E RODAPÉ PRETO', 1),
    ('PX', 1, 'Puxador GOLA', 1),
    ('PX', 2, 'Puxador PEGA', 1);

  -- as opções da Largura usadas (valor, sigla se for criada, ordem)
  CREATE TEMP TABLE _mcc_larguras (valor text PRIMARY KEY, sigla text NOT NULL, ordem integer NOT NULL, opcao_id uuid, sigla_real text,
                                   valor_real text, criada boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _mcc_larguras (valor, sigla, ordem) VALUES
    ('0-30', '0A30', 1),
    ('30', '30', 2),
    ('31-40', '31A40', 3),
    ('40', '40', 4),
    ('41-50', '41A50', 5),
    ('50', '50', 6),
    ('51-60', '51A60', 7),
    ('60', '60', 8),
    ('61-70', '61A70', 9),
    ('70', '70', 10),
    ('71-80', '71A80', 11),
    ('80', '80', 12),
    ('81-90', '81A90', 13),
    ('90', '90', 14),
    ('91-100', '91A100', 15),
    ('100', '100', 16);

  -- as duas cores (chave do nome, nome se for criada, sigla esperada)
  CREATE TEMP TABLE _mcc_cores (chave text PRIMARY KEY, nome text NOT NULL, sigla text NOT NULL, opcao_id uuid, sigla_real text,
                                valor text, criada boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _mcc_cores (chave, nome, sigla) VALUES
    ('verde normal', 'Verde normal', 'VNR'),
    ('verde claro', 'Verde claro', 'VC');

  -- os 328 produtos: (linha = linha do CSV × 10 + 0 sem cor / 1 verde normal / 2 verde claro, SKU antigo, subcategoria,
  -- modelo, nome, cor, largura, medida (largura e comprimento: número ou {de, ate}), unidade, custo, pvp, grossista,
  -- distribuidor, descrição, código de fornecedor, SKU esperado)
  CREATE TEMP TABLE _mcc_linhas (linha integer PRIMARY KEY, sku_antigo text NOT NULL, sub text NOT NULL, modelo smallint NOT NULL,
                                 nome text NOT NULL, cor text, largura text, med_l jsonb, med_c jsonb, unidade text NOT NULL,
                                 custo numeric NOT NULL, pvp numeric NOT NULL, grossista numeric NOT NULL, distribuidor numeric NOT NULL,
                                 descricao text, cod_forn text, sku_esperado text NOT NULL) ON COMMIT DROP;
  INSERT INTO _mcc_linhas (linha, sku_antigo, sub, modelo, nome, cor, largura, med_l, med_c, unidade, custo, pvp, grossista,
                           distribuidor, descricao, cod_forn, sku_esperado) VALUES
    (2230, 'MCCAC0001', 'AC', 1, 'Estrutura de Pimenteiro para Interior do móvel de 200mm', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 65.80, 109.67, 0.00, 0.00, NULL, NULL, 'MCC-AC-0001'),
    (860, 'MCCAC0002', 'AC', 2, 'Garrafeira Superior / Inferior de 15cm / 30cm (valor unitário)', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 122.50, 204.17, 0.00, 0.00, NULL, NULL, 'MCC-AC-0002'),
    (910, 'MCCAC0003', 'AC', 3, 'Garrafeira Coluna de 15cm / 30cm (valor unitário)', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 280.00, 466.67, 0.00, 0.00, NULL, NULL, 'MCC-AC-0003'),
    (2530, 'MCCAC0004', 'AC', 4, 'Puxadores asa prata (valor unitário)', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 4.83, 8.05, 0.00, 0.00, NULL, NULL, 'MCC-AC-0004'),
    (1670, 'MCCAC0005', 'AC', 5, 'Porta talheres até 80cm', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 21.91, 36.52, 0.00, 0.00, NULL, NULL, 'MCC-AC-0005'),
    (870, 'MCCAC0006', 'AC', 6, 'Estrutura para gavetão (valor unitário)', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 39.48, 65.80, 0.00, 0.00, NULL, NULL, 'MCC-AC-0006'),
    (160, 'MCCAC0007', 'AC', 7, 'Estrutura para gaveta (valor unitário)', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 34.58, 57.63, 0.00, 0.00, NULL, NULL, 'MCC-AC-0007'),
    (1850, 'MCCAC0008', 'AC', 8, 'Estrutura de Gavetões Internos para dispenseiro (valor até 4 unidades)', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 122.50, 204.17, 0.00, 0.00, NULL, NULL, 'MCC-AC-0008'),
    (1000, 'MCCAC0009', 'AC', 9, 'Iluminação LED móveis superiores (valor p/ml)', NULL, NULL, NULL::jsonb, NULL::jsonb, 'ml', 94.50, 157.50, 0.00, 0.00, NULL, NULL, 'MCC-AC-0009'),
    (20, 'MCCAC0010', 'AC', 10, 'Vista superior até 20cm de altura (valor p/ml)', NULL, NULL, NULL::jsonb, NULL::jsonb, 'ml', 35.00, 58.33, 0.00, 0.00, NULL, NULL, 'MCC-AC-0010'),
    (650, 'MCCAC0011', 'AC', 11, 'Caixote do Lixo para Mobiliário de cozinha', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 63.00, 105.00, 0.00, 0.00, NULL, NULL, 'MCC-AC-0011'),
    (250, 'MCCAC0012', 'AC', 12, 'BLOCO EM TERMOLAMINADO BRANCO BRILHO C/ 450X400X600 - 1 GAVETÃO + TAMPO', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 429.00, 715.00, 0.00, 0.00, NULL, NULL, 'MCC-AC-0012'),
    (210, 'MCCAC0013', 'AC', 13, 'BLOCO EM TERMOLAMINADO BRANCO BRILHO C/ 450X400X750 - 1 GAVETÃO + TAMPO', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 494.00, 823.33, 0.00, 0.00, 'Abertura de gaveta até 60cm no máximo (corrediças de 60cm)', NULL, 'MCC-AC-0013'),
    (2420, 'MCCAC0014', 'AC', 14, 'TAMPO EM TERMOLAMINADO BRANCO BRILHO C/ 750X600XPÉ INOX', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 234.00, 390.00, 0.00, 0.00, NULL, NULL, 'MCC-AC-0014'),
    (370, 'MCCAC0015', 'AC', 15, 'PRATELEIRA SUSPENSA TERMOLAMINADO BRANCO BRILHO C/ 1400', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 260.00, 433.33, 0.00, 0.00, NULL, NULL, 'MCC-AC-0015'),
    (680, 'MCCAC0016', 'AC', 16, 'Prateleira em Melamina Nogueira C/Fixação Oculta 250x650x40', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 65.00, 108.33, 0.00, 0.00, NULL, NULL, 'MCC-AC-0016'),
    (1480, 'MCCAC0017', 'AC', 17, 'Prateleira em Melamina Nogueira C/Fixação Oculta 250x1100x250', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 104.00, 173.33, 0.00, 0.00, NULL, NULL, 'MCC-AC-0017'),
    (220, 'MCCAC0018', 'AC', 18, 'ESTRUTURA LAUNDRY CARRIER 500 2X33L 528MM ALT 545MM ANTRACITE', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 332.21, 553.68, 0.00, 0.00, 'P/ MOVEL INFERIOR DE 600 LARG', '940TUL0000004 3270821', 'MCC-AC-0018'),
    (1940, 'MCCAC0019', 'AC', 19, 'PRATELEIRA VIDRO INCOLOR 6MM C/ ARESTAS C/ 600X400 P/Móvel de Cozinha', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 91.00, 151.66, 0.00, 0.00, NULL, NULL, 'MCC-AC-0019'),
    (450, 'MCCAC0020', 'AC', 20, 'ARO + ESTRUTURA + FRENTE P/ PRATELEIRA EXTRAIVEL DE 600 DE LARGURA ( P/ COLOCAR POR BAIXO DA ZONHA DE MAQ)', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 85.00, 141.66, 0.00, 0.00, NULL, NULL, 'MCC-AC-0020'),
    (1490, 'MCCAC0021', 'AC', 21, 'RIPADOS MELAMINA 2400X700 ORC2691/2118', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 325.00, 541.66, 0.00, 0.00, NULL, NULL, 'MCC-AC-0021'),
    (260, 'MCCEG0001', 'AC', 22, 'Reparação de Estrutura p/ Gaveta + Gavetão', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 155.20, 258.66, 0.00, 0.00, NULL, NULL, 'MCC-AC-0022'),
    (1350, 'MCCACC0001', 'ACL', 1, 'Armário de Coluna C/Espaço Interior 2400x1000x600', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 845.00, 1408.33, 0.00, 0.00, NULL, NULL, 'MCC-ACL-0001'),
    (180, 'MCCACC0002', 'ACL', 2, 'COLUNA CRISTALEIRA C/ 2500X400X400 C/ 4 PRATELEIRS E 2 FRENTES EM VIDRO INCOLOR', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 689.00, 1148.34, 0.00, 0.00, NULL, NULL, 'MCC-ACL-0002'),
    (2150, 'MCCACC0003', 'ACL', 3, 'ARMÁRIO DE COLUNA COM CANTO DE ARRUMAÇÃO 1200X2400X600', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 1480.00, 2467.00, 0.00, 0.00, NULL, NULL, 'MCC-ACL-0003'),
    (2130, 'MCCAI0001', 'AI', 1, 'Armário Inferior TERMOLAMINADO', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, NULL, NULL, 'MCC-AI-0001'),
    (1930, 'MCCAI0002', 'AI', 2, 'Armário Inferior MELAMINA', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, NULL, NULL, 'MCC-AI-0002'),
    (1950, 'MCCAI0003', 'AI', 3, 'Armário Inferior LACADO', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, NULL, NULL, 'MCC-AI-0003'),
    (360, 'MCCAIC0024', 'AI', 4, 'Armário Inferior de cozinha de 91cm a 100cm', NULL, '91-100', NULL::jsonb, NULL::jsonb, 'un', 289.84, 483.07, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-91A100'),
    (361, 'MCCAIC0024', 'AI', 4, 'Armário Inferior de cozinha de 91cm a 100cm - Verde normal', 'verde normal', '91-100', NULL::jsonb, NULL::jsonb, 'un', 289.84, 523.07, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-91A100'),
    (362, 'MCCAIC0024', 'AI', 4, 'Armário Inferior de cozinha de 91cm a 100cm - Verde claro', 'verde claro', '91-100', NULL::jsonb, NULL::jsonb, 'un', 289.84, 493.07, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-91A100'),
    (490, 'MCCAIC0001', 'AI', 4, 'Armário Inferior de cozinha 30cm', NULL, '30', NULL::jsonb, NULL::jsonb, 'un', 87.50, 145.83, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-30'),
    (491, 'MCCAIC0001', 'AI', 4, 'Armário Inferior de cozinha 30cm - Verde normal', 'verde normal', '30', NULL::jsonb, NULL::jsonb, 'un', 87.50, 185.83, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-30'),
    (492, 'MCCAIC0001', 'AI', 4, 'Armário Inferior de cozinha 30cm - Verde claro', 'verde claro', '30', NULL::jsonb, NULL::jsonb, 'un', 87.50, 155.83, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-30'),
    (780, 'MCCAIC0008', 'AI', 4, 'Armário Inferior de cozinha 100cm', NULL, '100', NULL::jsonb, NULL::jsonb, 'un', 231.88, 386.47, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-100'),
    (781, 'MCCAIC0008', 'AI', 4, 'Armário Inferior de cozinha 100cm - Verde normal', 'verde normal', '100', NULL::jsonb, NULL::jsonb, 'un', 231.88, 426.47, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-100'),
    (782, 'MCCAIC0008', 'AI', 4, 'Armário Inferior de cozinha 100cm - Verde claro', 'verde claro', '100', NULL::jsonb, NULL::jsonb, 'un', 231.88, 396.47, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-100'),
    (1010, 'MCCAIC0005', 'AI', 4, 'Armário Inferior de cozinha 70cm', NULL, '70', NULL::jsonb, NULL::jsonb, 'un', 179.38, 298.97, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-70'),
    (1011, 'MCCAIC0005', 'AI', 4, 'Armário Inferior de cozinha 70cm - Verde normal', 'verde normal', '70', NULL::jsonb, NULL::jsonb, 'un', 179.38, 338.97, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-70'),
    (1012, 'MCCAIC0005', 'AI', 4, 'Armário Inferior de cozinha 70cm - Verde claro', 'verde claro', '70', NULL::jsonb, NULL::jsonb, 'un', 179.38, 308.97, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-70'),
    (1200, 'MCCAIC0004', 'AI', 4, 'Armário Inferior de cozinha 60cm', NULL, '60', NULL::jsonb, NULL::jsonb, 'un', 157.50, 262.50, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-60'),
    (1201, 'MCCAIC0004', 'AI', 4, 'Armário Inferior de cozinha 60cm - Verde normal', 'verde normal', '60', NULL::jsonb, NULL::jsonb, 'un', 157.50, 302.50, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-60'),
    (1202, 'MCCAIC0004', 'AI', 4, 'Armário Inferior de cozinha 60cm - Verde claro', 'verde claro', '60', NULL::jsonb, NULL::jsonb, 'un', 157.50, 272.50, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-60'),
    (1260, 'MCCAIC0021', 'AI', 4, 'Armário Inferior de cozinha de 61cm a 70cm', NULL, '61-70', NULL::jsonb, NULL::jsonb, 'un', 224.22, 373.70, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-61A70'),
    (1261, 'MCCAIC0021', 'AI', 4, 'Armário Inferior de cozinha de 61cm a 70cm - Verde normal', 'verde normal', '61-70', NULL::jsonb, NULL::jsonb, 'un', 224.22, 413.70, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-61A70'),
    (1262, 'MCCAIC0021', 'AI', 4, 'Armário Inferior de cozinha de 61cm a 70cm - Verde claro', 'verde claro', '61-70', NULL::jsonb, NULL::jsonb, 'un', 224.22, 383.70, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-61A70'),
    (1550, 'MCCAIC0022', 'AI', 4, 'Armário Inferior de cozinha de 71cm a 80cm', NULL, '71-80', NULL::jsonb, NULL::jsonb, 'un', 235.16, 391.93, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-71A80'),
    (1551, 'MCCAIC0022', 'AI', 4, 'Armário Inferior de cozinha de 71cm a 80cm - Verde normal', 'verde normal', '71-80', NULL::jsonb, NULL::jsonb, 'un', 235.16, 431.93, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-71A80'),
    (1552, 'MCCAIC0022', 'AI', 4, 'Armário Inferior de cozinha de 71cm a 80cm - Verde claro', 'verde claro', '71-80', NULL::jsonb, NULL::jsonb, 'un', 235.16, 401.93, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-71A80'),
    (1590, 'MCCAIC0020', 'AI', 4, 'Armário Inferior de cozinha de 51cm a 60cm', NULL, '51-60', NULL::jsonb, NULL::jsonb, 'un', 196.88, 328.13, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-51A60'),
    (1591, 'MCCAIC0020', 'AI', 4, 'Armário Inferior de cozinha de 51cm a 60cm - Verde normal', 'verde normal', '51-60', NULL::jsonb, NULL::jsonb, 'un', 196.88, 368.13, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-51A60'),
    (1592, 'MCCAIC0020', 'AI', 4, 'Armário Inferior de cozinha de 51cm a 60cm - Verde claro', 'verde claro', '51-60', NULL::jsonb, NULL::jsonb, 'un', 196.88, 338.13, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-51A60'),
    (1600, 'MCCAIC0019', 'AI', 4, 'Armário Inferior de cozinha de 41cm a 50cm', NULL, '41-50', NULL::jsonb, NULL::jsonb, 'un', 175.00, 291.67, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-41A50'),
    (1601, 'MCCAIC0019', 'AI', 4, 'Armário Inferior de cozinha de 41cm a 50cm - Verde normal', 'verde normal', '41-50', NULL::jsonb, NULL::jsonb, 'un', 175.00, 331.67, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-41A50'),
    (1602, 'MCCAIC0019', 'AI', 4, 'Armário Inferior de cozinha de 41cm a 50cm - Verde claro', 'verde claro', '41-50', NULL::jsonb, NULL::jsonb, 'un', 175.00, 301.67, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-41A50'),
    (1650, 'MCCAIC0006', 'AI', 4, 'Armário Inferior de cozinha 80cm', NULL, '80', NULL::jsonb, NULL::jsonb, 'un', 188.13, 313.55, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-80'),
    (1651, 'MCCAIC0006', 'AI', 4, 'Armário Inferior de cozinha 80cm - Verde normal', 'verde normal', '80', NULL::jsonb, NULL::jsonb, 'un', 188.13, 353.55, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-80'),
    (1652, 'MCCAIC0006', 'AI', 4, 'Armário Inferior de cozinha 80cm - Verde claro', 'verde claro', '80', NULL::jsonb, NULL::jsonb, 'un', 188.13, 323.55, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-80'),
    (1730, 'MCCAIC0017', 'AI', 4, 'Armário Inferior de cozinha de 0 a 30cm', NULL, '0-30', NULL::jsonb, NULL::jsonb, 'un', 109.38, 182.30, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-0A30'),
    (1731, 'MCCAIC0017', 'AI', 4, 'Armário Inferior de cozinha de 0 a 30cm - Verde normal', 'verde normal', '0-30', NULL::jsonb, NULL::jsonb, 'un', 109.38, 222.30, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-0A30'),
    (1732, 'MCCAIC0017', 'AI', 4, 'Armário Inferior de cozinha de 0 a 30cm - Verde claro', 'verde claro', '0-30', NULL::jsonb, NULL::jsonb, 'un', 109.38, 192.30, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-0A30'),
    (1830, 'MCCAIC0018', 'AI', 4, 'Armário Inferior de cozinha de 31cm a 40cm', NULL, '31-40', NULL::jsonb, NULL::jsonb, 'un', 147.66, 246.10, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-31A40'),
    (1831, 'MCCAIC0018', 'AI', 4, 'Armário Inferior de cozinha de 31cm a 40cm - Verde normal', 'verde normal', '31-40', NULL::jsonb, NULL::jsonb, 'un', 147.66, 286.10, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-31A40'),
    (1832, 'MCCAIC0018', 'AI', 4, 'Armário Inferior de cozinha de 31cm a 40cm - Verde claro', 'verde claro', '31-40', NULL::jsonb, NULL::jsonb, 'un', 147.66, 256.10, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-31A40'),
    (2090, 'MCCAIC0003', 'AI', 4, 'Armário Inferior de cozinha 50cm', NULL, '50', NULL::jsonb, NULL::jsonb, 'un', 140.00, 233.33, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-50'),
    (2091, 'MCCAIC0003', 'AI', 4, 'Armário Inferior de cozinha 50cm - Verde normal', 'verde normal', '50', NULL::jsonb, NULL::jsonb, 'un', 140.00, 273.33, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-50'),
    (2092, 'MCCAIC0003', 'AI', 4, 'Armário Inferior de cozinha 50cm - Verde claro', 'verde claro', '50', NULL::jsonb, NULL::jsonb, 'un', 140.00, 243.33, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-50'),
    (2270, 'MCCAIC0002', 'AI', 4, 'Armário Inferior de cozinha 40cm', NULL, '40', NULL::jsonb, NULL::jsonb, 'un', 118.13, 196.88, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-40'),
    (2271, 'MCCAIC0002', 'AI', 4, 'Armário Inferior de cozinha 40cm - Verde normal', 'verde normal', '40', NULL::jsonb, NULL::jsonb, 'un', 118.13, 236.88, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-40'),
    (2272, 'MCCAIC0002', 'AI', 4, 'Armário Inferior de cozinha 40cm - Verde claro', 'verde claro', '40', NULL::jsonb, NULL::jsonb, 'un', 118.13, 206.88, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-40'),
    (2280, 'MCCAIC0023', 'AI', 4, 'Armário Inferior de cozinha de 81cm a 90cm', NULL, '81-90', NULL::jsonb, NULL::jsonb, 'un', 246.09, 410.15, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-81A90'),
    (2281, 'MCCAIC0023', 'AI', 4, 'Armário Inferior de cozinha de 81cm a 90cm - Verde normal', 'verde normal', '81-90', NULL::jsonb, NULL::jsonb, 'un', 246.09, 450.15, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-81A90'),
    (2282, 'MCCAIC0023', 'AI', 4, 'Armário Inferior de cozinha de 81cm a 90cm - Verde claro', 'verde claro', '81-90', NULL::jsonb, NULL::jsonb, 'un', 246.09, 420.15, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-81A90'),
    (2570, 'MCCAIC0007', 'AI', 4, 'Armário Inferior de cozinha 90cm', NULL, '90', NULL::jsonb, NULL::jsonb, 'un', 196.88, 328.13, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-90'),
    (2571, 'MCCAIC0007', 'AI', 4, 'Armário Inferior de cozinha 90cm - Verde normal', 'verde normal', '90', NULL::jsonb, NULL::jsonb, 'un', 196.88, 368.13, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VNR-90'),
    (2572, 'MCCAIC0007', 'AI', 4, 'Armário Inferior de cozinha 90cm - Verde claro', 'verde claro', '90', NULL::jsonb, NULL::jsonb, 'un', 196.88, 338.13, 0.00, 0.00, NULL, NULL, 'MCC-AI-0004-VC-90'),
    (430, 'MCCAIC0015', 'AI', 5, 'Armário Inferior de cozinha lacado 90cm', NULL, '90', NULL::jsonb, NULL::jsonb, 'un', 359.10, 598.50, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-90'),
    (431, 'MCCAIC0015', 'AI', 5, 'Armário Inferior de cozinha lacado 90cm - Verde normal', 'verde normal', '90', NULL::jsonb, NULL::jsonb, 'un', 359.10, 638.50, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-90'),
    (432, 'MCCAIC0015', 'AI', 5, 'Armário Inferior de cozinha lacado 90cm - Verde claro', 'verde claro', '90', NULL::jsonb, NULL::jsonb, 'un', 359.10, 608.50, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-90'),
    (470, 'MCCAIC0027', 'AI', 5, 'Armário Inferior de cozinha lacado de 41cm a 50cm', NULL, '41-50', NULL::jsonb, NULL::jsonb, 'un', 248.06, 413.43, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-41A50'),
    (471, 'MCCAIC0027', 'AI', 5, 'Armário Inferior de cozinha lacado de 41cm a 50cm - Verde normal', 'verde normal', '41-50', NULL::jsonb, NULL::jsonb, 'un', 248.06, 453.43, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-41A50'),
    (472, 'MCCAIC0027', 'AI', 5, 'Armário Inferior de cozinha lacado de 41cm a 50cm - Verde claro', 'verde claro', '41-50', NULL::jsonb, NULL::jsonb, 'un', 248.06, 423.43, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-41A50'),
    (580, 'MCCAIC0010', 'AI', 5, 'Armário Inferior de cozinha lacado 40cm', NULL, '40', NULL::jsonb, NULL::jsonb, 'un', 160.65, 267.75, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-40'),
    (581, 'MCCAIC0010', 'AI', 5, 'Armário Inferior de cozinha lacado 40cm - Verde normal', 'verde normal', '40', NULL::jsonb, NULL::jsonb, 'un', 160.65, 307.75, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-40'),
    (582, 'MCCAIC0010', 'AI', 5, 'Armário Inferior de cozinha lacado 40cm - Verde claro', 'verde claro', '40', NULL::jsonb, NULL::jsonb, 'un', 160.65, 277.75, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-40'),
    (630, 'MCCAIC0012', 'AI', 5, 'Armário Inferior de cozinha lacado 60cm', NULL, '60', NULL::jsonb, NULL::jsonb, 'un', 236.25, 393.75, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-60'),
    (631, 'MCCAIC0012', 'AI', 5, 'Armário Inferior de cozinha lacado 60cm - Verde normal', 'verde normal', '60', NULL::jsonb, NULL::jsonb, 'un', 236.25, 433.75, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-60'),
    (632, 'MCCAIC0012', 'AI', 5, 'Armário Inferior de cozinha lacado 60cm - Verde claro', 'verde claro', '60', NULL::jsonb, NULL::jsonb, 'un', 236.25, 403.75, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-60'),
    (640, 'MCCAIC0025', 'AI', 5, 'Armário Inferior de cozinha lacado de 0 a 30cm', NULL, '0-30', NULL::jsonb, NULL::jsonb, 'un', 148.84, 248.07, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-0A30'),
    (641, 'MCCAIC0025', 'AI', 5, 'Armário Inferior de cozinha lacado de 0 a 30cm - Verde normal', 'verde normal', '0-30', NULL::jsonb, NULL::jsonb, 'un', 148.84, 288.07, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-0A30'),
    (642, 'MCCAIC0025', 'AI', 5, 'Armário Inferior de cozinha lacado de 0 a 30cm - Verde claro', 'verde claro', '0-30', NULL::jsonb, NULL::jsonb, 'un', 148.84, 258.07, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-0A30'),
    (980, 'MCCAIC0014', 'AI', 5, 'Armário Inferior de cozinha lacado 80cm', NULL, '80', NULL::jsonb, NULL::jsonb, 'un', 311.85, 519.75, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-80'),
    (981, 'MCCAIC0014', 'AI', 5, 'Armário Inferior de cozinha lacado 80cm - Verde normal', 'verde normal', '80', NULL::jsonb, NULL::jsonb, 'un', 311.85, 559.75, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-80'),
    (982, 'MCCAIC0014', 'AI', 5, 'Armário Inferior de cozinha lacado 80cm - Verde claro', 'verde claro', '80', NULL::jsonb, NULL::jsonb, 'un', 311.85, 529.75, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-80'),
    (1340, 'MCCAIC0009', 'AI', 5, 'Armário Inferior de cozinha lacado 30cm', NULL, '30', NULL::jsonb, NULL::jsonb, 'un', 119.07, 198.45, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-30'),
    (1341, 'MCCAIC0009', 'AI', 5, 'Armário Inferior de cozinha lacado 30cm - Verde normal', 'verde normal', '30', NULL::jsonb, NULL::jsonb, 'un', 119.07, 238.45, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-30'),
    (1342, 'MCCAIC0009', 'AI', 5, 'Armário Inferior de cozinha lacado 30cm - Verde claro', 'verde claro', '30', NULL::jsonb, NULL::jsonb, 'un', 119.07, 208.45, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-30'),
    (1400, 'MCCAIC0029', 'AI', 5, 'Armário Inferior de cozinha lacado de 61cm a 70cm', NULL, '61-70', NULL::jsonb, NULL::jsonb, 'un', 348.47, 580.78, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-61A70'),
    (1401, 'MCCAIC0029', 'AI', 5, 'Armário Inferior de cozinha lacado de 61cm a 70cm - Verde normal', 'verde normal', '61-70', NULL::jsonb, NULL::jsonb, 'un', 348.47, 620.78, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-61A70'),
    (1402, 'MCCAIC0029', 'AI', 5, 'Armário Inferior de cozinha lacado de 61cm a 70cm - Verde claro', 'verde claro', '61-70', NULL::jsonb, NULL::jsonb, 'un', 348.47, 590.78, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-61A70'),
    (1410, 'MCCAIC0011', 'AI', 5, 'Armário Inferior de cozinha lacado 50cm', NULL, '50', NULL::jsonb, NULL::jsonb, 'un', 198.45, 330.75, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-50'),
    (1411, 'MCCAIC0011', 'AI', 5, 'Armário Inferior de cozinha lacado 50cm - Verde normal', 'verde normal', '50', NULL::jsonb, NULL::jsonb, 'un', 198.45, 370.75, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-50'),
    (1412, 'MCCAIC0011', 'AI', 5, 'Armário Inferior de cozinha lacado 50cm - Verde claro', 'verde claro', '50', NULL::jsonb, NULL::jsonb, 'un', 198.45, 340.75, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-50'),
    (1620, 'MCCAIC0013', 'AI', 5, 'Armário Inferior de cozinha lacado 70cm', NULL, '70', NULL::jsonb, NULL::jsonb, 'un', 278.78, 464.63, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-70'),
    (1621, 'MCCAIC0013', 'AI', 5, 'Armário Inferior de cozinha lacado 70cm - Verde normal', 'verde normal', '70', NULL::jsonb, NULL::jsonb, 'un', 278.78, 504.63, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-70'),
    (1622, 'MCCAIC0013', 'AI', 5, 'Armário Inferior de cozinha lacado 70cm - Verde claro', 'verde claro', '70', NULL::jsonb, NULL::jsonb, 'un', 278.78, 474.63, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-70'),
    (1690, 'MCCAIC0032', 'AI', 5, 'Armário Inferior de cozinha lacado de 91cm a 100cm', NULL, '91-100', NULL::jsonb, NULL::jsonb, 'un', 496.13, 826.88, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-91A100'),
    (1691, 'MCCAIC0032', 'AI', 5, 'Armário Inferior de cozinha lacado de 91cm a 100cm - Verde normal', 'verde normal', '91-100', NULL::jsonb, NULL::jsonb, 'un', 496.13, 866.88, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-91A100'),
    (1692, 'MCCAIC0032', 'AI', 5, 'Armário Inferior de cozinha lacado de 91cm a 100cm - Verde claro', 'verde claro', '91-100', NULL::jsonb, NULL::jsonb, 'un', 496.13, 836.88, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-91A100'),
    (2290, 'MCCAIC0030', 'AI', 5, 'Armário Inferior de cozinha lacado de 71cm a 80cm', NULL, '71-80', NULL::jsonb, NULL::jsonb, 'un', 389.81, 649.68, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-71A80'),
    (2291, 'MCCAIC0030', 'AI', 5, 'Armário Inferior de cozinha lacado de 71cm a 80cm - Verde normal', 'verde normal', '71-80', NULL::jsonb, NULL::jsonb, 'un', 389.81, 689.68, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-71A80'),
    (2292, 'MCCAIC0030', 'AI', 5, 'Armário Inferior de cozinha lacado de 71cm a 80cm - Verde claro', 'verde claro', '71-80', NULL::jsonb, NULL::jsonb, 'un', 389.81, 659.68, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-71A80'),
    (2350, 'MCCAIC0028', 'AI', 5, 'Armário Inferior de cozinha lacado de 51cm a 60cm', NULL, '51-60', NULL::jsonb, NULL::jsonb, 'un', 295.31, 492.18, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-51A60'),
    (2351, 'MCCAIC0028', 'AI', 5, 'Armário Inferior de cozinha lacado de 51cm a 60cm - Verde normal', 'verde normal', '51-60', NULL::jsonb, NULL::jsonb, 'un', 295.31, 532.18, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-51A60'),
    (2352, 'MCCAIC0028', 'AI', 5, 'Armário Inferior de cozinha lacado de 51cm a 60cm - Verde claro', 'verde claro', '51-60', NULL::jsonb, NULL::jsonb, 'un', 295.31, 502.18, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-51A60'),
    (2430, 'MCCAIC0026', 'AI', 5, 'Armário Inferior de cozinha lacado de 31cm a 40cm', NULL, '31-40', NULL::jsonb, NULL::jsonb, 'un', 200.81, 334.68, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-31A40'),
    (2431, 'MCCAIC0026', 'AI', 5, 'Armário Inferior de cozinha lacado de 31cm a 40cm - Verde normal', 'verde normal', '31-40', NULL::jsonb, NULL::jsonb, 'un', 200.81, 374.68, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-31A40'),
    (2432, 'MCCAIC0026', 'AI', 5, 'Armário Inferior de cozinha lacado de 31cm a 40cm - Verde claro', 'verde claro', '31-40', NULL::jsonb, NULL::jsonb, 'un', 200.81, 344.68, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-31A40'),
    (2460, 'MCCAIC0031', 'AI', 5, 'Armário Inferior de cozinha lacado de 81cm a 90cm', NULL, '81-90', NULL::jsonb, NULL::jsonb, 'un', 448.88, 748.13, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-81A90'),
    (2461, 'MCCAIC0031', 'AI', 5, 'Armário Inferior de cozinha lacado de 81cm a 90cm - Verde normal', 'verde normal', '81-90', NULL::jsonb, NULL::jsonb, 'un', 448.88, 788.13, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-81A90'),
    (2462, 'MCCAIC0031', 'AI', 5, 'Armário Inferior de cozinha lacado de 81cm a 90cm - Verde claro', 'verde claro', '81-90', NULL::jsonb, NULL::jsonb, 'un', 448.88, 758.13, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-81A90'),
    (2490, 'MCCAIC0016', 'AI', 5, 'Armário Inferior de cozinha lacado 100cm', NULL, '100', NULL::jsonb, NULL::jsonb, 'un', 396.90, 661.50, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-100'),
    (2491, 'MCCAIC0016', 'AI', 5, 'Armário Inferior de cozinha lacado 100cm - Verde normal', 'verde normal', '100', NULL::jsonb, NULL::jsonb, 'un', 396.90, 701.50, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VNR-100'),
    (2492, 'MCCAIC0016', 'AI', 5, 'Armário Inferior de cozinha lacado 100cm - Verde claro', 'verde claro', '100', NULL::jsonb, NULL::jsonb, 'un', 396.90, 671.50, 0.00, 0.00, NULL, NULL, 'MCC-AI-0005-VC-100'),
    (950, 'MCCASC0195', 'AI', 6, 'Armário Inferior de cozinha Canto em L', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 249.20, 415.33, 0.00, 0.00, NULL, NULL, 'MCC-AI-0006'),
    (951, 'MCCASC0195', 'AI', 6, 'Armário Inferior de cozinha Canto em L - Verde normal', 'verde normal', NULL, NULL::jsonb, NULL::jsonb, 'un', 249.20, 455.33, 0.00, 0.00, NULL, NULL, 'MCC-AI-0006-VNR'),
    (952, 'MCCASC0195', 'AI', 6, 'Armário Inferior de cozinha Canto em L - Verde claro', 'verde claro', NULL, NULL::jsonb, NULL::jsonb, 'un', 249.20, 425.33, 0.00, 0.00, NULL, NULL, 'MCC-AI-0006-VC'),
    (2310, 'MCCASC0196', 'AI', 7, 'Armários Inferiores de cozinha Conforme Layout MD1394 Acréscimo 5 cm de Altura', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 373.65, 622.75, 0.00, 0.00, NULL, NULL, 'MCC-AI-0007'),
    (560, 'MCCAS0001', 'AS', 1, 'Armário superior TERMOLAMINADO', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, NULL, NULL, 'MCC-AS-0001'),
    (2330, 'MCCAS0002', 'AS', 2, 'Armário superior MELAMINA', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, NULL, NULL, 'MCC-AS-0002'),
    (2470, 'MCCAS0003', 'AS', 3, 'Armário superior LACADO', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, NULL, NULL, 'MCC-AS-0003'),
    (70, 'MCCASC0112', 'AS', 4, 'Armário Superior de cozinha de 91 a 100x90cm Altura', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '90'::jsonb, 'un', 295.31, 492.18, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-91A100X90'),
    (140, 'MCCASC0109', 'AS', 4, 'Armário Superior de cozinha de 61 a 70x90cm Altura', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '90'::jsonb, 'un', 229.69, 382.82, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-61A70X90'),
    (200, 'MCCASC0111', 'AS', 4, 'Armário Superior de cozinha de 81 a 90x90cm Altura', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '90'::jsonb, 'un', 251.57, 419.28, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-81A90X90'),
    (290, 'MCCASC0007', 'AS', 4, 'Armário Superior de cozinha 90x70cm Altura', NULL, NULL, '90'::jsonb, '70'::jsonb, 'un', 188.13, 328.13, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-90X70'),
    (500, 'MCCASC0013', 'AS', 4, 'Armário Superior de cozinha 70x90cm Altura', NULL, NULL, '70'::jsonb, '90'::jsonb, 'un', 183.75, 306.25, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-70X90'),
    (520, 'MCCASC0004', 'AS', 4, 'Armário Superior de cozinha 60x70cm Altura', NULL, NULL, '60'::jsonb, '70'::jsonb, 'un', 140.00, 262.50, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-60X70'),
    (540, 'MCCASC0097', 'AS', 4, 'Armário Superior de cozinha de 0 a 30x70cm Altura', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '70'::jsonb, 'un', 98.44, 164.07, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-1A30X70'),
    (660, 'MCCASC0014', 'AS', 4, 'Armário Superior de cozinha 80x90cm Altura', NULL, NULL, '80'::jsonb, '90'::jsonb, 'un', 192.50, 320.83, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-80X90'),
    (710, 'MCCASC0012', 'AS', 4, 'Armário Superior de cozinha 60x90cm Altura', NULL, NULL, '60'::jsonb, '90'::jsonb, 'un', 161.88, 269.80, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-60X90'),
    (770, 'MCCASC0008', 'AS', 4, 'Armário Superior de cozinha 100x70cm Altura', NULL, NULL, '100'::jsonb, '70'::jsonb, 'un', 223.13, 386.47, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-100X70'),
    (900, 'MCCASC0011', 'AS', 4, 'Armário Superior de cozinha 50x90cm Altura', NULL, NULL, '50'::jsonb, '90'::jsonb, 'un', 144.38, 240.63, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-50X90'),
    (940, 'MCCASC0105', 'AS', 4, 'Armário Superior de cozinha de 0 a 30x90cm Altura', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '90'::jsonb, 'un', 120.31, 200.52, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-1A30X90'),
    (1020, 'MCCASC0107', 'AS', 4, 'Armário Superior de cozinha de 41 a 50x90cm Altura', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '90'::jsonb, 'un', 180.47, 300.78, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-41A50X90'),
    (1060, 'MCCASC0001', 'AS', 4, 'Armário Superior de cozinha 30x70cm Altura', NULL, NULL, '30'::jsonb, '70'::jsonb, 'un', 78.75, 145.83, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-30X70'),
    (1080, 'MCCASC0102', 'AS', 4, 'Armário Superior de cozinha de 71 a 80x70cm Altura', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '70'::jsonb, 'un', 229.69, 382.82, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-71A80X70'),
    (1100, 'MCCASC0106', 'AS', 4, 'Armário Superior de cozinha de 31 a 40x90cm Altura', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '90'::jsonb, 'un', 142.19, 236.98, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-31A40X90'),
    (1180, 'MCCASC0103', 'AS', 4, 'Armário Superior de cozinha de 81 a 90x70cm Altura', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '70'::jsonb, 'un', 235.16, 391.93, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-81A90X70'),
    (1190, 'MCCASC0005', 'AS', 4, 'Armário Superior de cozinha 70x70cm Altura', NULL, NULL, '70'::jsonb, '70'::jsonb, 'un', 166.25, 298.97, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-70X70'),
    (1250, 'MCCASC0002', 'AS', 4, 'Armário Superior de cozinha 40x70cm Altura', NULL, NULL, '40'::jsonb, '70'::jsonb, 'un', 105.00, 196.88, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-40X70'),
    (1370, 'MCCASC0101', 'AS', 4, 'Armário Superior de cozinha de 61 a 70x70cm Altura', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '70'::jsonb, 'un', 207.81, 346.35, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-61A70X70'),
    (1380, 'MCCASC0015', 'AS', 4, 'Armário Superior de cozinha 90x90cm Altura', NULL, NULL, '90'::jsonb, '90'::jsonb, 'un', 201.25, 335.42, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-90X90'),
    (1510, 'MCCASC0100', 'AS', 4, 'Armário Superior de cozinha de 51 a 60x70cm Altura', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '70'::jsonb, 'un', 175.00, 291.67, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-51A60X70'),
    (1720, 'MCCASC0099', 'AS', 4, 'Armário Superior de cozinha de 41 a 50x70cm Altura', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '70'::jsonb, 'un', 158.59, 264.32, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-41A50X70'),
    (1820, 'MCCASC0010', 'AS', 4, 'Armário Superior de cozinha 40x90cm Altura', NULL, NULL, '40'::jsonb, '90'::jsonb, 'un', 113.75, 189.58, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-40X90'),
    (1860, 'MCCASC0110', 'AS', 4, 'Armário Superior de cozinha de 71 a 80x90cm Altura', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '90'::jsonb, 'un', 240.63, 401.05, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-71A80X90'),
    (1960, 'MCCASC0108', 'AS', 4, 'Armário Superior de cozinha de 51 a 60x90cm Altura', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '90'::jsonb, 'un', 202.34, 337.23, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-51A60X90'),
    (1970, 'MCCASC0098', 'AS', 4, 'Armário Superior de cozinha de 31 a 40x70cm Altura', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '70'::jsonb, 'un', 131.25, 218.75, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-31A40X70'),
    (1990, 'MCCASC0009', 'AS', 4, 'Armário Superior de cozinha 30x90cm Altura', NULL, NULL, '30'::jsonb, '90'::jsonb, 'un', 96.25, 160.42, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-30X90'),
    (2040, 'MCCASC0104', 'AS', 4, 'Armário Superior de cozinha de 91 a 100x70cm Altura', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '70'::jsonb, 'un', 278.91, 464.85, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-91A100X70'),
    (2140, 'MCCASC0003', 'AS', 4, 'Armário Superior de cozinha 50x70cm Altura', NULL, NULL, '50'::jsonb, '70'::jsonb, 'un', 126.88, 233.33, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-50X70'),
    (2390, 'MCCASC0006', 'AS', 4, 'Armário Superior de cozinha 80x70cm Altura', NULL, NULL, '80'::jsonb, '70'::jsonb, 'un', 183.75, 313.55, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-80X70'),
    (2630, 'MCCASC0016', 'AS', 4, 'Armário Superior de cozinha 100x90cm Altura', NULL, NULL, '100'::jsonb, '90'::jsonb, 'un', 236.25, 393.75, 0.00, 0.00, NULL, NULL, 'MCC-AS-0004-100X90'),
    (190, 'MCCASC0127', 'AS', 5, 'Armário Superior de cozinha em vidro de 81 a 90x90cm Altura', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '90'::jsonb, 'un', 322.00, 536.67, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-81A90X90'),
    (230, 'MCCASC0029', 'AS', 5, 'Armário Superior de cozinha em vidro 70x90cm Altura', NULL, NULL, '70'::jsonb, '90'::jsonb, 'un', 248.06, 413.43, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-70X90'),
    (340, 'MCCASC0115', 'AS', 5, 'Armário Superior de cozinha em vidro de 41 a 50x70cm Altura', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '70'::jsonb, 'un', 203.00, 338.33, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-41A50X70'),
    (410, 'MCCASC0021', 'AS', 5, 'Armário Superior de cozinha em vidro 70x70cm Altura', NULL, NULL, '70'::jsonb, '70'::jsonb, 'un', 224.44, 374.07, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-70X70'),
    (530, 'MCCASC0026', 'AS', 5, 'Armário Superior de cozinha em vidro 40x90cm Altura', NULL, NULL, '40'::jsonb, '90'::jsonb, 'un', 153.56, 255.93, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-40X90'),
    (570, 'MCCASC0020', 'AS', 5, 'Armário Superior de cozinha em vidro 60x70cm Altura', NULL, NULL, '60'::jsonb, '70'::jsonb, 'un', 189.00, 315.00, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-60X70'),
    (690, 'MCCASC0121', 'AS', 5, 'Armário Superior de cozinha em vidro de 0 a 30x90cm Altura', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '90'::jsonb, 'un', 154.00, 256.67, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-1A30X90'),
    (720, 'MCCASC0024', 'AS', 5, 'Armário Superior de cozinha em vidro 100x70cm Altura', NULL, NULL, '100'::jsonb, '70'::jsonb, 'un', 301.22, 502.03, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-100X70'),
    (810, 'MCCASC0023', 'AS', 5, 'Armário Superior de cozinha em vidro 90x70cm Altura', NULL, NULL, '90'::jsonb, '70'::jsonb, 'un', 253.97, 423.28, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-90X70'),
    (820, 'MCCASC0125', 'AS', 5, 'Armário Superior de cozinha em vidro de 61 a 70x90cm Altura', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '90'::jsonb, 'un', 294.00, 490.00, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-61A70X90'),
    (840, 'MCCASC0027', 'AS', 5, 'Armário Superior de cozinha em vidro 50x90cm Altura', NULL, NULL, '50'::jsonb, '90'::jsonb, 'un', 194.91, 324.85, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-50X90'),
    (850, 'MCCASC0032', 'AS', 5, 'Armário Superior de cozinha em vidro 100x90cm Altura', NULL, NULL, '100'::jsonb, '90'::jsonb, 'un', 318.94, 531.57, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-100X90'),
    (880, 'MCCASC0123', 'AS', 5, 'Armário Superior de cozinha em vidro de 41 a 50x90cm Altura', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '90'::jsonb, 'un', 231.00, 385.00, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-41A50X90'),
    (890, 'MCCASC0122', 'AS', 5, 'Armário Superior de cozinha em vidro de 31 a 40x90cm Altura', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '90'::jsonb, 'un', 182.00, 303.33, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-31A40X90'),
    (1040, 'MCCASC0022', 'AS', 5, 'Armário Superior de cozinha em vidro 80x70cm Altura', NULL, NULL, '80'::jsonb, '70'::jsonb, 'un', 248.06, 413.43, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-80X70'),
    (1240, 'MCCASC0025', 'AS', 5, 'Armário Superior de cozinha em vidro 30x90cm Altura', NULL, NULL, '30'::jsonb, '90'::jsonb, 'un', 129.94, 216.57, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-30X90'),
    (1270, 'MCCASC0030', 'AS', 5, 'Armário Superior de cozinha em vidro 80x90cm Altura', NULL, NULL, '80'::jsonb, '90'::jsonb, 'un', 259.88, 433.13, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-80X90'),
    (1290, 'MCCASC0126', 'AS', 5, 'Armário Superior de cozinha em vidro de 71 a 80x90cm Altura', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '90'::jsonb, 'un', 308.00, 513.33, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-71A80X90'),
    (1530, 'MCCASC0028', 'AS', 5, 'Armário Superior de cozinha em vidro 60x90cm Altura', NULL, NULL, '60'::jsonb, '90'::jsonb, 'un', 218.53, 364.22, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-60X90'),
    (1640, 'MCCASC0114', 'AS', 5, 'Armário Superior de cozinha em vidro de 31 a 40x70cm Altura', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '70'::jsonb, 'un', 168.00, 280.00, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-31A40X70'),
    (1900, 'MCCASC0019', 'AS', 5, 'Armário Superior de cozinha em vidro 50x70cm Altura', NULL, NULL, '50'::jsonb, '70'::jsonb, 'un', 171.28, 285.47, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-50X70'),
    (2070, 'MCCASC0124', 'AS', 5, 'Armário Superior de cozinha em vidro de 51 a 60x90cm Altura', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '90'::jsonb, 'un', 259.00, 431.67, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-51A60X90'),
    (2170, 'MCCASC0117', 'AS', 5, 'Armário Superior de cozinha em vidro de 61 a 70x70cm Altura', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '70'::jsonb, 'un', 266.00, 443.33, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-61A70X70'),
    (2210, 'MCCASC0017', 'AS', 5, 'Armário Superior de cozinha em vidro 30x70cm Altura', NULL, NULL, '30'::jsonb, '70'::jsonb, 'un', 106.31, 177.18, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-30X70'),
    (2220, 'MCCASC0031', 'AS', 5, 'Armário Superior de cozinha em vidro 90x90cm Altura', NULL, NULL, '90'::jsonb, '90'::jsonb, 'un', 271.69, 452.82, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-90X90'),
    (2250, 'MCCASC0018', 'AS', 5, 'Armário Superior de cozinha em vidro 40x70cm Altura', NULL, NULL, '40'::jsonb, '70'::jsonb, 'un', 141.75, 236.25, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-40X70'),
    (2320, 'MCCASC0113', 'AS', 5, 'Armário Superior de cozinha em vidro de 0 a 30x70cm Altura', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '70'::jsonb, 'un', 126.00, 210.00, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-1A30X70'),
    (2340, 'MCCASC0119', 'AS', 5, 'Armário Superior de cozinha em vidro de 81 a 90x70cm Altura', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '70'::jsonb, 'un', 301.00, 501.67, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-81A90X70'),
    (2380, 'MCCASC0120', 'AS', 5, 'Armário Superior de cozinha em vidro de 91 a 100x70cm Altura', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '70'::jsonb, 'un', 357.00, 595.00, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-91A100X70'),
    (2400, 'MCCASC0128', 'AS', 5, 'Armário Superior de cozinha em vidro de 91 a 100x90cm Altura', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '90'::jsonb, 'un', 378.00, 630.00, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-91A100X90'),
    (2410, 'MCCASC0116', 'AS', 5, 'Armário Superior de cozinha em vidro de 51 a 60x70cm Altura', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '70'::jsonb, 'un', 224.00, 373.33, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-51A60X70'),
    (2510, 'MCCASC0118', 'AS', 5, 'Armário Superior de cozinha em vidro de 71 a 80x70cm Altura', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '70'::jsonb, 'un', 294.00, 490.00, 0.00, 0.00, NULL, NULL, 'MCC-AS-0005-71A80X70'),
    (30, 'MCCASC0039', 'AS', 6, 'Armário Superior de cozinha basculante 90x70cm Altura', NULL, NULL, '90'::jsonb, '70'::jsonb, 'un', 293.17, 488.62, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-90X70'),
    (90, 'MCCASC0046', 'AS', 6, 'Armário Superior de cozinha basculante 80x90cm Altura', NULL, NULL, '80'::jsonb, '90'::jsonb, 'un', 299.08, 498.47, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-80X90'),
    (130, 'MCCASC0130', 'AS', 6, 'Armário Superior de cozinha basculante de 31 a 40x70cm Altura', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '70'::jsonb, 'un', 216.39, 360.65, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-31A40X70'),
    (170, 'MCCASC0143', 'AS', 6, 'Armário Superior de cozinha basculante de 81 a 90x90cm Altura', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '90'::jsonb, 'un', 378.81, 631.35, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-81A90X90'),
    (280, 'MCCASC0144', 'AS', 6, 'Armário Superior de cozinha basculante de 91 a 100x90cm Altura', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '90'::jsonb, 'un', 437.87, 729.78, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-91A100X90'),
    (320, 'MCCASC0131', 'AS', 6, 'Armário Superior de cozinha basculante de 41 a 50x70cm Altura', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '70'::jsonb, 'un', 253.30, 422.17, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-41A50X70'),
    (330, 'MCCASC0045', 'AS', 6, 'Armário Superior de cozinha basculante 70x90cm Altura', NULL, NULL, '70'::jsonb, '90'::jsonb, 'un', 287.26, 478.77, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-70X90'),
    (400, 'MCCASC0038', 'AS', 6, 'Armário Superior de cozinha basculante 80x70cm Altura', NULL, NULL, '80'::jsonb, '70'::jsonb, 'un', 287.26, 478.77, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-80X70'),
    (550, 'MCCASC0041', 'AS', 6, 'Armário Superior de cozinha basculante 30x90cm Altura', NULL, NULL, '30'::jsonb, '90'::jsonb, 'un', 169.14, 281.90, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-30X90'),
    (590, 'MCCASC0138', 'AS', 6, 'Armário Superior de cozinha basculante de 31 a 40x90cm Altura', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '90'::jsonb, 'un', 231.15, 385.25, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-31A40X90'),
    (670, 'MCCASC0040', 'AS', 6, 'Armário Superior de cozinha basculante 100x70cm Altura', NULL, NULL, '100'::jsonb, '70'::jsonb, 'un', 340.42, 567.37, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-100X70'),
    (960, 'MCCASC0043', 'AS', 6, 'Armário Superior de cozinha basculante 50x90cm Altura', NULL, NULL, '50'::jsonb, '90'::jsonb, 'un', 234.11, 390.18, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-50X90'),
    (1120, 'MCCASC0036', 'AS', 6, 'Armário Superior de cozinha basculante 60x70cm Altura', NULL, NULL, '60'::jsonb, '70'::jsonb, 'un', 228.20, 380.33, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-60X70'),
    (1170, 'MCCASC0133', 'AS', 6, 'Armário Superior de cozinha basculante de 61 a 70x70cm Altura', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '70'::jsonb, 'un', 319.75, 532.92, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-61A70X70'),
    (1230, 'MCCASC0135', 'AS', 6, 'Armário Superior de cozinha basculante de 81 a 90x70cm Altura', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '70'::jsonb, 'un', 356.66, 594.43, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-81A90X70'),
    (1300, 'MCCASC0037', 'AS', 6, 'Armário Superior de cozinha basculante 70x70cm Altura', NULL, NULL, '70'::jsonb, '70'::jsonb, 'un', 263.64, 439.40, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-70X70'),
    (1320, 'MCCASC0044', 'AS', 6, 'Armário Superior de cozinha basculante 60x90cm Altura', NULL, NULL, '60'::jsonb, '90'::jsonb, 'un', 257.73, 429.55, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-60X90'),
    (1610, 'MCCASC0132', 'AS', 6, 'Armário Superior de cozinha basculante de 51 a 60x70cm Altura', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '70'::jsonb, 'un', 275.45, 459.08, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-51A60X70'),
    (1700, 'MCCASC0139', 'AS', 6, 'Armário Superior de cozinha basculante de 41 a 50x90cm Altura', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '90'::jsonb, 'un', 282.83, 471.38, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-41A50X90'),
    (1760, 'MCCASC0137', 'AS', 6, 'Armário Superior de cozinha basculante de 0 a 30x90cm Altura', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '90'::jsonb, 'un', 201.62, 336.03, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-1A30X90'),
    (1770, 'MCCASC0134', 'AS', 6, 'Armário Superior de cozinha basculante de 71 a 80x70cm Altura', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '70'::jsonb, 'un', 349.28, 582.13, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-71A80X70'),
    (1790, 'MCCASC0033', 'AS', 6, 'Armário Superior de cozinha basculante 30x70cm Altura', NULL, NULL, '30'::jsonb, '70'::jsonb, 'un', 145.51, 242.52, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-30X70'),
    (1880, 'MCCASC0136', 'AS', 6, 'Armário Superior de cozinha basculante de 91 a 100x70cm Altura', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '70'::jsonb, 'un', 415.72, 692.87, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-91A100X70'),
    (1890, 'MCCASC0140', 'AS', 6, 'Armário Superior de cozinha basculante de 51 a 60x90cm Altura', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '90'::jsonb, 'un', 312.36, 520.60, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-51A60X90'),
    (1910, 'MCCASC0141', 'AS', 6, 'Armário Superior de cozinha basculante de 61 a 70x90cm Altura', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '90'::jsonb, 'un', 349.28, 582.13, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-61A70X90'),
    (2030, 'MCCASC0035', 'AS', 6, 'Armário Superior de cozinha basculante 50x70cm Altura', NULL, NULL, '50'::jsonb, '70'::jsonb, 'un', 210.48, 350.80, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-50X70'),
    (2120, 'MCCASC0047', 'AS', 6, 'Armário Superior de cozinha basculante 90x90cm Altura', NULL, NULL, '90'::jsonb, '90'::jsonb, 'un', 310.89, 518.15, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-90X90'),
    (2300, 'MCCASC0042', 'AS', 6, 'Armário Superior de cozinha basculante 40x90cm Altura', NULL, NULL, '40'::jsonb, '90'::jsonb, 'un', 192.76, 321.27, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-40X90'),
    (2440, 'MCCASC0142', 'AS', 6, 'Armário Superior de cozinha basculante de 71 a 80x90cm Altura', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '90'::jsonb, 'un', 364.04, 606.73, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-71A80X90'),
    (2500, 'MCCASC0034', 'AS', 6, 'Armário Superior de cozinha basculante 40x70cm Altura', NULL, NULL, '40'::jsonb, '70'::jsonb, 'un', 180.95, 301.58, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-40X70'),
    (2550, 'MCCASC0129', 'AS', 6, 'Armário Superior de cozinha basculante de 0 a 30x70cm Altura', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '70'::jsonb, 'un', 172.09, 286.82, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-1A30X70'),
    (2590, 'MCCASC0048', 'AS', 6, 'Armário Superior de cozinha basculante 100x90cm Altura', NULL, NULL, '100'::jsonb, '90'::jsonb, 'un', 358.14, 596.90, 0.00, 0.00, NULL, NULL, 'MCC-AS-0006-100X90'),
    (40, 'MCCASC0160', 'AS', 7, 'Armário Superior de cozinha lacado de 91 a 100x90cm Altura', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '90'::jsonb, 'un', 513.84, 856.40, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-91A100X90'),
    (80, 'MCCASC0059', 'AS', 7, 'Armário Superior de cozinha lacado 50x90cm Altura', NULL, NULL, '50'::jsonb, '90'::jsonb, 'un', 203.18, 338.63, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-50X90'),
    (120, 'MCCASC0063', 'AS', 7, 'Armário Superior de cozinha lacado 90x90cm Altura', NULL, NULL, '90'::jsonb, '90'::jsonb, 'un', 373.28, 622.13, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-90X90'),
    (300, 'MCCASC0054', 'AS', 7, 'Armário Superior de cozinha lacado 80x70cm Altura', NULL, NULL, '80'::jsonb, '70'::jsonb, 'un', 283.50, 472.50, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-80X70'),
    (310, 'MCCASC0145', 'AS', 7, 'Armário Superior de cozinha lacado de 0 a 30x70cm Altura', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '70'::jsonb, 'un', 135.84, 226.40, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-1A30X70'),
    (380, 'MCCASC0153', 'AS', 7, 'Armário Superior de cozinha lacado de 0 a 30x90cm Altura', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '90'::jsonb, 'un', 155.93, 259.88, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-1A30X90'),
    (420, 'MCCASC0152', 'AS', 7, 'Armário Superior de cozinha lacado de 91 a 100x70cm Altura', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '70'::jsonb, 'un', 448.88, 748.13, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-91A100X70'),
    (600, 'MCCASC0050', 'AS', 7, 'Armário Superior de cozinha lacado 40x70cm Altura', NULL, NULL, '40'::jsonb, '70'::jsonb, 'un', 141.75, 236.25, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-40X70'),
    (700, 'MCCASC0062', 'AS', 7, 'Armário Superior de cozinha lacado 80x90cm Altura', NULL, NULL, '80'::jsonb, '90'::jsonb, 'un', 330.75, 551.25, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-80X90'),
    (730, 'MCCASC0049', 'AS', 7, 'Armário Superior de cozinha lacado 30x70cm Altura', NULL, NULL, '30'::jsonb, '70'::jsonb, 'un', 108.68, 181.13, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-30X70'),
    (930, 'MCCASC0061', 'AS', 7, 'Armário Superior de cozinha lacado 70x90cm Altura', NULL, NULL, '70'::jsonb, '90'::jsonb, 'un', 288.23, 480.38, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-70X90'),
    (970, 'MCCASC0159', 'AS', 7, 'Armário Superior de cozinha lacado de 81 a 90x90cm Altura', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '90'::jsonb, 'un', 466.59, 777.65, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-81A90X90'),
    (1130, 'MCCASC0064', 'AS', 7, 'Armário Superior de cozinha lacado 100x90cm Altura', NULL, NULL, '100'::jsonb, '90'::jsonb, 'un', 411.08, 685.13, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-100X90'),
    (1140, 'MCCASC0148', 'AS', 7, 'Armário Superior de cozinha lacado de 51 a 60x70cm Altura', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '70'::jsonb, 'un', 253.97, 423.28, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-51A60X70'),
    (1210, 'MCCASC0158', 'AS', 7, 'Armário Superior de cozinha lacado de 71 a 80x90cm Altura', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '90'::jsonb, 'un', 413.44, 689.07, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-71A80X90'),
    (1220, 'MCCASC0052', 'AS', 7, 'Armário Superior de cozinha lacado 60x70cm Altura', NULL, NULL, '60'::jsonb, '70'::jsonb, 'un', 203.18, 338.63, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-60X70'),
    (1520, 'MCCASC0155', 'AS', 7, 'Armário Superior de cozinha lacado de 41 a 50x90cm Altura', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '90'::jsonb, 'un', 253.97, 423.28, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-41A50X90'),
    (1580, 'MCCASC0157', 'AS', 7, 'Armário Superior de cozinha lacado de 61 a 70x90cm Altura', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '90'::jsonb, 'un', 360.28, 600.47, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-61A70X90'),
    (1660, 'MCCASC0156', 'AS', 7, 'Armário Superior de cozinha lacado de 51 a 60x90cm Altura', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '90'::jsonb, 'un', 313.03, 521.72, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-51A60X90'),
    (1680, 'MCCASC0055', 'AS', 7, 'Armário Superior de cozinha lacado 90x70cm Altura', NULL, NULL, '90'::jsonb, '70'::jsonb, 'un', 321.30, 535.50, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-90X70'),
    (1750, 'MCCASC0060', 'AS', 7, 'Armário Superior de cozinha lacado 60x90cm Altura', NULL, NULL, '60'::jsonb, '90'::jsonb, 'un', 250.43, 417.38, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-60X90'),
    (1780, 'MCCASC0051', 'AS', 7, 'Armário Superior de cozinha lacado 50x70cm Altura', NULL, NULL, '50'::jsonb, '70'::jsonb, 'un', 184.28, 307.13, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-50X70'),
    (1810, 'MCCASC0056', 'AS', 7, 'Armário Superior de cozinha lacado 100x70cm Altura', NULL, NULL, '100'::jsonb, '70'::jsonb, 'un', 359.10, 598.50, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-100X70'),
    (1870, 'MCCASC0154', 'AS', 7, 'Armário Superior de cozinha lacado de 31 a 40x90cm Altura', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '90'::jsonb, 'un', 206.72, 344.53, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-31A40X90'),
    (1980, 'MCCASC0151', 'AS', 7, 'Armário Superior de cozinha lacado de 81 a 90x70cm Altura', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '70'::jsonb, 'un', 401.63, 669.38, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-81A90X70'),
    (2000, 'MCCASC0149', 'AS', 7, 'Armário Superior de cozinha lacado de 61 a 70x70cm Altura', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '70'::jsonb, 'un', 307.13, 511.88, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-61A70X70'),
    (2020, 'MCCASC0147', 'AS', 7, 'Armário Superior de cozinha lacado de 41 a 50x70cm Altura', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '70'::jsonb, 'un', 230.34, 383.90, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-41A50X70'),
    (2050, 'MCCASC0150', 'AS', 7, 'Armário Superior de cozinha lacado de 71 a 80x70cm Altura', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '70'::jsonb, 'un', 354.38, 590.63, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-71A80X70'),
    (2100, 'MCCASC0058', 'AS', 7, 'Armário Superior de cozinha lacado 40x90cm Altura', NULL, NULL, '40'::jsonb, '90'::jsonb, 'un', 165.38, 275.63, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-40X90'),
    (2160, 'MCCASC0057', 'AS', 7, 'Armário Superior de cozinha lacado 30x90cm Altura', NULL, NULL, '30'::jsonb, '90'::jsonb, 'un', 124.74, 207.90, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-30X90'),
    (2560, 'MCCASC0053', 'AS', 7, 'Armário Superior de cozinha lacado 70x70cm Altura', NULL, NULL, '70'::jsonb, '70'::jsonb, 'un', 245.70, 409.50, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-70X70'),
    (2580, 'MCCASC0146', 'AS', 7, 'Armário Superior de cozinha lacado de 31 a 40x70cm Altura', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '70'::jsonb, 'un', 177.19, 295.32, 0.00, 0.00, NULL, NULL, 'MCC-AS-0007-31A40X70'),
    (50, 'MCCASC0069', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 70x70cm Altura', NULL, NULL, '70'::jsonb, '70'::jsonb, 'un', 226.04, 376.73, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-70X70'),
    (100, 'MCCASC0166', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 71 a 80x70cm Altura', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '70'::jsonb, 'un', 317.52, 529.20, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-71A80X70'),
    (110, 'MCCASC0167', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 81 a 90x70cm Altura', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '70'::jsonb, 'un', 359.86, 599.77, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-81A90X70'),
    (240, 'MCCASC0162', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 31 a 40x70cm Altura', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '70'::jsonb, 'un', 158.76, 264.60, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-31A40X70'),
    (350, 'MCCASC0072', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 100x70cm Altura', NULL, NULL, '100'::jsonb, '70'::jsonb, 'un', 330.37, 550.62, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-100X70'),
    (440, 'MCCASC0170', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 31 a 40x90cm Altura', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '90'::jsonb, 'un', 185.22, 308.70, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-31A40X90'),
    (480, 'MCCASC0175', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 81 a 90x90cm Altura', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '90'::jsonb, 'un', 418.07, 696.78, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-81A90X90'),
    (620, 'MCCASC0066', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 40x70cm Altura', NULL, NULL, '40'::jsonb, '70'::jsonb, 'un', 130.41, 217.35, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-40X70'),
    (740, 'MCCASC0164', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 51 a 60x70cm Altura', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '70'::jsonb, 'un', 227.56, 379.27, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-51A60X70'),
    (750, 'MCCASC0163', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 41 a 50x70cm Altura', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '70'::jsonb, 'un', 206.39, 343.98, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-41A50X70'),
    (760, 'MCCASC0080', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 100x90cm Altura', NULL, NULL, '100'::jsonb, '90'::jsonb, 'un', 378.19, 630.32, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-100X90'),
    (830, 'MCCASC0078', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 80x90cm Altura', NULL, NULL, '80'::jsonb, '90'::jsonb, 'un', 304.29, 507.15, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-80X90'),
    (990, 'MCCASC0173', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 61 a 70x90cm Altura', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '90'::jsonb, 'un', 322.81, 538.02, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-61A70X90'),
    (1110, 'MCCASC0075', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 50x90cm Altura', NULL, NULL, '50'::jsonb, '90'::jsonb, 'un', 186.92, 311.53, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-50X90'),
    (1160, 'MCCASC0067', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 50x70cm Altura', NULL, NULL, '50'::jsonb, '70'::jsonb, 'un', 169.53, 282.55, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-50X70'),
    (1280, 'MCCASC0065', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 30x70cm Altura', NULL, NULL, '30'::jsonb, '70'::jsonb, 'un', 99.98, 166.63, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-30X70'),
    (1330, 'MCCASC0174', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 71 a 80x90cm Altura', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '90'::jsonb, 'un', 370.44, 617.40, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-71A80X90'),
    (1430, 'MCCASC0165', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 61 a 70x70cm Altura', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '70'::jsonb, 'un', 275.18, 458.63, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-61A70X70'),
    (1450, 'MCCASC0074', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 40x90cm Altura', NULL, NULL, '40'::jsonb, '90'::jsonb, 'un', 152.15, 253.58, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-40X90'),
    (1470, 'MCCASC0176', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 91 a 100x90cm Altura', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '90'::jsonb, 'un', 460.40, 767.33, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-91A100X90'),
    (1560, 'MCCASC0071', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 90x70cm Altura', NULL, NULL, '90'::jsonb, '70'::jsonb, 'un', 295.60, 492.67, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-90X70'),
    (1710, 'MCCASC0070', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 80x70cm Altura', NULL, NULL, '80'::jsonb, '70'::jsonb, 'un', 260.82, 434.70, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-80X70'),
    (2010, 'MCCASC0079', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 90x90cm Altura', NULL, NULL, '90'::jsonb, '90'::jsonb, 'un', 343.41, 572.35, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-90X90'),
    (2180, 'MCCASC0077', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 70x90cm Altura', NULL, NULL, '70'::jsonb, '90'::jsonb, 'un', 265.17, 441.95, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-70X90'),
    (2240, 'MCCASC0169', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 0 a 30x90cm Altura', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '90'::jsonb, 'un', 139.71, 232.85, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-1A30X90'),
    (2260, 'MCCASC0168', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 91 a 100x70cm Altura', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '70'::jsonb, 'un', 402.19, 670.32, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-91A100X70'),
    (2360, 'MCCASC0161', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 0 a 30x70cm Altura', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '70'::jsonb, 'un', 121.72, 202.87, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-1A30X70'),
    (2450, 'MCCASC0073', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 30x90cm Altura', NULL, NULL, '30'::jsonb, '90'::jsonb, 'un', 114.76, 191.27, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-30X90'),
    (2480, 'MCCASC0172', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 51 a 60x90cm Altura', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '90'::jsonb, 'un', 280.48, 467.47, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-51A60X90'),
    (2520, 'MCCASC0076', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 60x90cm Altura', NULL, NULL, '60'::jsonb, '90'::jsonb, 'un', 230.39, 383.98, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-60X90'),
    (2540, 'MCCASC0068', 'AS', 8, 'Armário Superior de cozinha lacado em vidro 60x70cm Altura', NULL, NULL, '60'::jsonb, '70'::jsonb, 'un', 186.92, 311.53, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-60X70'),
    (2610, 'MCCASC0171', 'AS', 8, 'Armário Superior de cozinha lacado em vidro de 41 a 50x90cm Altura', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '90'::jsonb, 'un', 227.56, 379.27, 0.00, 0.00, NULL, NULL, 'MCC-AS-0008-41A50X90'),
    (60, 'MCCASC0179', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 41 a 50x70cm Altura', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '70'::jsonb, 'un', 247.10, 411.83, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-41A50X70'),
    (150, 'MCCASC0089', 'AS', 9, 'Armário Superior de cozinha lacado basculante 30x90cm Altura', NULL, NULL, '30'::jsonb, '90'::jsonb, 'un', 146.26, 243.77, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-30X90'),
    (390, 'MCCASC0084', 'AS', 9, 'Armário Superior de cozinha lacado basculante 60x70cm Altura', NULL, NULL, '60'::jsonb, '70'::jsonb, 'un', 218.42, 364.03, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-60X70'),
    (460, 'MCCASC0188', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 51 a 60x90cm Altura', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '90'::jsonb, 'un', 324.50, 540.83, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-51A60X90'),
    (510, 'MCCASC0182', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 71 a 80x70cm Altura', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '70'::jsonb, 'un', 363.20, 605.33, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-71A80X70'),
    (610, 'MCCASC0095', 'AS', 9, 'Armário Superior de cozinha lacado basculante 90x90cm Altura', NULL, NULL, '90'::jsonb, '90'::jsonb, 'un', 374.91, 624.85, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-90X90'),
    (790, 'MCCASC0081', 'AS', 9, 'Armário Superior de cozinha lacado basculante 30x70cm Altura', NULL, NULL, '30'::jsonb, '70'::jsonb, 'un', 131.48, 219.13, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-30X70'),
    (920, 'MCCASC0085', 'AS', 9, 'Armário Superior de cozinha lacado basculante 70x70cm Altura', NULL, NULL, '70'::jsonb, '70'::jsonb, 'un', 257.54, 429.23, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-70X70'),
    (1030, 'MCCASC0177', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 0 a 30x70cm Altura', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '70'::jsonb, 'un', 158.65, 264.42, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-1A30X70'),
    (1050, 'MCCASC0183', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 81 a 90x70cm Altura', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '70'::jsonb, 'un', 407.42, 679.03, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-81A90X70'),
    (1070, 'MCCASC0181', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 61 a 70x70cm Altura', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '70'::jsonb, 'un', 318.97, 531.62, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-61A70X70'),
    (1090, 'MCCASC0186', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 31 a 40x90cm Altura', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '90'::jsonb, 'un', 224.99, 374.98, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-31A40X90'),
    (1150, 'MCCASC0191', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 81 a 90x90cm Altura', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '90'::jsonb, 'un', 468.23, 780.38, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-81A90X90'),
    (1310, 'MCCASC0091', 'AS', 9, 'Armário Superior de cozinha lacado basculante 50x90cm Altura', NULL, NULL, '50'::jsonb, '90'::jsonb, 'un', 218.42, 364.03, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-50X90'),
    (1360, 'MCCASC0187', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 41 a 50x90cm Altura', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '90'::jsonb, 'un', 269.21, 448.68, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-41A50X90'),
    (1420, 'MCCASC0090', 'AS', 9, 'Armário Superior de cozinha lacado basculante 40x90cm Altura', NULL, NULL, '40'::jsonb, '90'::jsonb, 'un', 183.65, 306.08, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-40X90'),
    (1440, 'MCCASC0096', 'AS', 9, 'Armário Superior de cozinha lacado basculante 100x90cm Altura', NULL, NULL, '100'::jsonb, '90'::jsonb, 'un', 409.69, 682.82, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-100X90'),
    (1460, 'MCCASC0189', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 61 a 70x90cm Altura', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '90'::jsonb, 'un', 368.72, 614.53, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-61A70X90'),
    (1500, 'MCCASC0082', 'AS', 9, 'Armário Superior de cozinha lacado basculante 40x70cm Altura', NULL, NULL, '40'::jsonb, '70'::jsonb, 'un', 161.91, 269.85, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-40X70'),
    (1570, 'MCCASC0190', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 71 a 80x90cm Altura', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '90'::jsonb, 'un', 418.48, 697.47, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-71A80X90'),
    (1630, 'MCCASC0086', 'AS', 9, 'Armário Superior de cozinha lacado basculante 80x70cm Altura', NULL, NULL, '80'::jsonb, '70'::jsonb, 'un', 292.32, 487.20, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-80X70'),
    (1740, 'MCCASC0094', 'AS', 9, 'Armário Superior de cozinha lacado basculante 80x90cm Altura', NULL, NULL, '80'::jsonb, '90'::jsonb, 'un', 335.79, 559.65, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-80X90'),
    (1800, 'MCCASC0192', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 91 a 100x90cm Altura', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '90'::jsonb, 'un', 512.46, 854.10, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-91A100X90'),
    (1920, 'MCCASC0093', 'AS', 9, 'Armário Superior de cozinha lacado basculante 70x90cm Altura', NULL, NULL, '70'::jsonb, '90'::jsonb, 'un', 296.67, 494.45, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-70X90'),
    (2060, 'MCCASC0092', 'AS', 9, 'Armário Superior de cozinha lacado basculante 60x90cm Altura', NULL, NULL, '60'::jsonb, '90'::jsonb, 'un', 261.89, 436.48, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-60X90'),
    (2080, 'MCCASC0185', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 0 a 30x90cm Altura', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '90'::jsonb, 'un', 177.45, 295.75, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-1A30X90'),
    (2110, 'MCCASC0178', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 31 a 40x70cm Altura', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '70'::jsonb, 'un', 197.35, 328.92, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-31A40X70'),
    (2190, 'MCCASC0083', 'AS', 9, 'Armário Superior de cozinha lacado basculante 50x70cm Altura', NULL, NULL, '50'::jsonb, '70'::jsonb, 'un', 201.03, 335.05, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-50X70'),
    (2200, 'MCCASC0180', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 51 a 60x70cm Altura', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '70'::jsonb, 'un', 269.21, 448.68, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-51A60X70'),
    (2370, 'MCCASC0088', 'AS', 9, 'Armário Superior de cozinha lacado basculante 100x70cm Altura', NULL, NULL, '100'::jsonb, '70'::jsonb, 'un', 361.87, 603.12, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-100X70'),
    (2600, 'MCCASC0087', 'AS', 9, 'Armário Superior de cozinha lacado basculante 90x70cm Altura', NULL, NULL, '90'::jsonb, '70'::jsonb, 'un', 327.10, 545.17, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-90X70'),
    (2620, 'MCCASC0184', 'AS', 9, 'Armário Superior de cozinha lacado basculante de 91 a 100x70cm Altura', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '70'::jsonb, 'un', 451.65, 752.75, 0.00, 0.00, NULL, NULL, 'MCC-AS-0009-91A100X70'),
    (270, 'MCCASC0193', 'AS', 10, 'Armário Superior de cozinha Canto em L 70cm Alt', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 218.75, 364.58, 0.00, 0.00, NULL, NULL, 'MCC-AS-0010'),
    (1540, 'MCCASC0194', 'AS', 11, 'Armário Superior de cozinha Canto em L 90cm Alt', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 223.16, 371.93, 0.00, 0.00, NULL, NULL, 'MCC-AS-0011'),
    (1840, 'CCP00001', 'CCP', 1, 'COZINHA EM TERMOLAMINADO CINZA ANTRACITE MOVEIS EM MELAMINA HIDROFUGO CINZA 166TF PERFIL GOLA E RODAPÉ PRETO', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 3764.70, 8281.90, 0.00, 0.00, NULL, NULL, 'MCC-CCP-0001'),
    (800, 'MCCP0001', 'PX', 1, 'Puxador GOLA', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, NULL, NULL, 'MCC-PX-0001'),
    (1390, 'MCCP0002', 'PX', 2, 'Puxador PEGA', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, NULL, NULL, 'MCC-PX-0002');

  -- os dados gerados estão inteiros
  SELECT count(*), count(DISTINCT l.nome), count(DISTINCT l.sku_esperado), count(*) FILTER (WHERE l.cor IS NOT NULL),
         count(*) FILTER (WHERE l.med_l IS NOT NULL), count(*) FILTER (WHERE l.largura IS NOT NULL)
    INTO v_n, v_m, v_k, v_ordem, v_opc_n_med, v_opc_n_larg
  FROM _mcc_linhas l;
  IF v_n <> c_total OR v_m <> c_total OR v_k <> c_total OR v_ordem <> c_n_cores OR v_opc_n_med <> c_n_medidas
     OR v_opc_n_larg <> c_n_larguras THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: os dados têm % linhas, % nomes, % SKUs, % cores, % medidas, % larguras (esperados %, %, %, %, %, %).',
      v_n, v_m, v_k, v_ordem, v_opc_n_med, v_opc_n_larg, c_total, c_total, c_total, c_n_cores, c_n_medidas, c_n_larguras;
  END IF;
  IF (SELECT count(*) FROM _mcc_modelos) <> c_n_modelos OR (SELECT count(*) FROM _mcc_larguras) <> c_n_opcoes
     OR (SELECT sum(s.esperados) FROM _mcc_subs s) <> c_total
     OR (SELECT sum(m.esperados) FROM _mcc_modelos m) <> c_total
     OR (SELECT count(DISTINCT (m.sub, public.fn_cat_chave_opcao(m.nome))) FROM _mcc_modelos m) <> c_n_modelos
     OR EXISTS (SELECT 1 FROM _mcc_linhas l
                WHERE NOT EXISTS (SELECT 1 FROM _mcc_modelos m WHERE m.sub = l.sub AND m.numero = l.modelo)
                   OR (l.cor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _mcc_cores c WHERE c.chave = l.cor))
                   OR (l.largura IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _mcc_larguras x WHERE x.valor = l.largura))
                   OR (l.med_l IS NULL) <> (l.med_c IS NULL) OR (l.med_l IS NOT NULL AND l.largura IS NOT NULL)
                   OR l.unidade NOT IN ('un', 'ml') OR l.custo <= 0 OR l.pvp <= 0 OR l.grossista < 0 OR l.distribuidor < 0)
     OR EXISTS (SELECT 1 FROM _mcc_larguras x WHERE NOT EXISTS (SELECT 1 FROM _mcc_linhas l WHERE l.largura = x.valor)) THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: os dados têm modelos, cores, larguras, medidas, unidades ou preços fora do esperado.';
  END IF;
  IF (SELECT count(*) FROM _mcc_linhas l WHERE l.unidade = 'ml') <> c_n_ml
     OR (SELECT count(*) FROM _mcc_linhas l WHERE l.grossista > 0) <> c_n_gross
     OR (SELECT count(*) FROM _mcc_linhas l WHERE l.distribuidor > 0) <> c_n_dist
     OR (SELECT count(*) FROM _mcc_linhas l WHERE l.cod_forn IS NOT NULL) <> c_n_cod THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: as contagens de ml, grossista, distribuidor ou códigos de fornecedor não batem.';
  END IF;
  -- as medidas são válidas (a regra de fn_cat_sku_medida: números > 0 e de < ate)
  SELECT count(*) INTO v_n FROM _mcc_linhas l
  WHERE l.med_l IS NOT NULL
    AND public.fn_cat_sku_medida(jsonb_build_object('tipo', '2D', 'largura', l.med_l, 'comprimento', l.med_c, 'unidade', 'cm')) IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: % medidas inválidas nos dados.', v_n; END IF;

  -- as subcategorias (filhas da categoria; CCP cria-se se faltar)
  FOR r IN SELECT s.codigo, s.nome, s.criar FROM _mcc_subs s ORDER BY s.ordem LOOP
    SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1],
           (array_agg(c.sigla ORDER BY c.created_at, c.id))[1]
      INTO v_n, v_sub, v_ativa, v_txt
    FROM product_categories c
    WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n = 0 AND NOT r.criar THEN
      RAISE NOTICE 'mobiliario_cozinha_mudelar: a Mudelar não tem a subcategoria «%» › «%» — nada a fazer.', c_cat_nome, r.nome;
      RETURN;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'mobiliario_cozinha_mudelar: há % subcategorias «%» em «%».', v_n, r.nome, c_cat_nome;
    ELSIF v_n = 1 THEN
      IF NOT v_ativa THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: a subcategoria «%» está desativada.', r.nome; END IF;
      IF v_txt IS DISTINCT FROM r.codigo THEN
        RAISE EXCEPTION 'mobiliario_cozinha_mudelar: a subcategoria «%» tem a sigla % (esperada %).', r.nome, coalesce(v_txt, 'nenhuma'), r.codigo;
      END IF;
      UPDATE _mcc_subs s SET sub_id = v_sub WHERE s.codigo = r.codigo;
    END IF;
  END LOOP;

  -- produtos (vivos ou apagados) numa das subcategorias → inerte (já aplicada, ou outra importação)
  SELECT count(*), count(*) FILTER (WHERE NOT p.is_deleted AND p.name IN (SELECT l.nome FROM _mcc_linhas l)) INTO v_n, v_m
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _mcc_subs s WHERE s.sub_id IS NOT NULL);
  IF v_n > 0 THEN
    RAISE NOTICE 'mobiliario_cozinha_mudelar: as subcategorias já têm % produtos (% vivos com os nomes do ficheiro; % = já aplicada) — nada a fazer.',
      v_n, v_m, c_total;
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT l.nome FROM _mcc_linhas l);
  IF v_n > 0 THEN
    RAISE NOTICE 'mobiliario_cozinha_mudelar: a Mudelar já tem % produtos vivos com nomes do ficheiro — nada a fazer.', v_n;
    RETURN;
  END IF;
  SELECT string_agg(s.codigo || ': ' || pm.name || ' (' || lpad(pm.numero::text, 4, '0') || (CASE WHEN pm.deleted_at IS NOT NULL THEN ', apagado' ELSE '' END) || ')', ', ')
    INTO v_txt
  FROM product_models pm JOIN _mcc_subs s ON s.sub_id = pm.subcategory_id
  WHERE pm.organization_id = c_org
    AND EXISTS (SELECT 1 FROM _mcc_modelos m
                WHERE m.sub = s.codigo
                  AND (pm.numero = m.numero OR (pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)))
                  AND NOT (pm.numero = m.numero AND pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)));
  IF v_txt IS NOT NULL THEN
    RAISE NOTICE 'mobiliario_cozinha_mudelar: as subcategorias já têm modelos com estes nomes ou números, diferentes dos do ficheiro (%) — nada a fazer.', left(v_txt, 1500);
    RETURN;
  END IF;

  -- ─── Configuração que tem de existir (senão: erro) ───────────────────────────
  IF NOT v_cat_ativa THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: «%» está desativada.', c_cat_nome; END IF;
  IF v_cat_sigla IS DISTINCT FROM c_cat_sigla THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: «%» tem a sigla % (esperada %).', c_cat_nome, coalesce(v_cat_sigla, 'nenhuma'), c_cat_sigla;
  END IF;
  -- uma subcategoria a criar não pode ter a sigla de uma irmã
  SELECT string_agg(c.name || ' (' || c.sigla || ')', ', ') INTO v_txt
  FROM product_categories c JOIN _mcc_subs s ON s.sub_id IS NULL AND s.codigo = c.sigla
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: outras subcategorias já têm as siglas: %.', v_txt; END IF;

  SELECT m.user_id INTO v_criador
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND coalesce(m.role_is_client, false) = false
  ORDER BY m.created_at, m.user_id LIMIT 1;
  IF v_criador IS NULL THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: a Mudelar não tem um membro ativo para created_by.'; END IF;

  -- os atributos (pelo código): cor e largura de lista, medida
  SELECT count(*) FILTER (WHERE a.code::text = 'cor' AND NOT a.is_measurement),
         count(*) FILTER (WHERE a.code::text = 'medida' AND a.is_measurement),
         count(*) FILTER (WHERE a.code::text = 'largura' AND NOT a.is_measurement),
         (array_agg(a.id) FILTER (WHERE a.code::text = 'cor' AND NOT a.is_measurement))[1],
         (array_agg(a.id) FILTER (WHERE a.code::text = 'medida' AND a.is_measurement))[1],
         (array_agg(a.id) FILTER (WHERE a.code::text = 'largura' AND NOT a.is_measurement))[1],
         (array_agg(a.unit::text) FILTER (WHERE a.code::text = 'medida' AND a.is_measurement))[1]
    INTO v_n, v_m, v_k, v_a_cor, v_a_med, v_a_larg, v_med_unit
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL;
  IF v_n <> 1 OR v_m <> 1 OR v_k <> 1 THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: a Mudelar tem de ter um atributo cor (lista), um medida (medida) e um largura (lista); tem %, %, %.', v_n, v_m, v_k;
  END IF;
  IF coalesce(lower(v_med_unit), 'cm') <> 'cm' THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: a Medida da Mudelar está em «%»; as medidas do ficheiro são em cm.', v_med_unit;
  END IF;
  v_g_cor := public.fn_cat_grupo_do_atributo(v_a_cor, c_org);
  v_g_larg := public.fn_cat_grupo_do_atributo(v_a_larg, c_org);
  IF NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_cor AND g.organization_id = c_org)
     OR NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_larg AND g.organization_id = c_org) THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: as opções da Cor ou da Largura em uso na Mudelar não são de um grupo da Mudelar.';
  END IF;

  -- amostra de SKUs de outras categorias, para conferir que ficam iguais
  CREATE TEMP TABLE _mcc_amostra ON COMMIT DROP AS
  SELECT x.id, x.sku FROM (
    SELECT p.id, p.sku, row_number() OVER (PARTITION BY c.id ORDER BY p.sku, p.id) AS n
    FROM products p JOIN product_categories c ON c.id = p.category_id
    WHERE p.organization_id = c_org AND NOT p.is_deleted AND c.organization_id = c_org AND c.parent_id IS NULL
      AND c.id <> v_cat) x
  WHERE x.n <= 3;

  -- ─── Locks (as chaves das funções de gestão do Catálogo) ─────────────────────
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text, 0));
  FOR r IN SELECT s.sub_id FROM _mcc_subs s WHERE s.sub_id IS NOT NULL ORDER BY s.sub_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text || ':' || r.sub_id::text, 0));
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_cat:' || c_org::text || ':' || v_cat::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || least(v_g_cor, v_g_larg)::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || greatest(v_g_cor, v_g_larg)::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_fornecedores:' || c_org::text, 0));

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', v_criador::text, true);

  -- ─── 1. Subcategoria que falte (só CCP pode faltar) ──────────────────────────
  IF EXISTS (SELECT 1 FROM _mcc_subs s WHERE s.sub_id IS NULL) THEN
    SELECT count(*) INTO v_n FROM product_categories pc
    WHERE pc.organization_id = c_org AND pc.deleted_at IS NULL AND coalesce(pc.is_active, true);
    IF v_n + (SELECT count(*) FROM _mcc_subs s WHERE s.sub_id IS NULL) > c_max_categorias THEN
      RAISE EXCEPTION 'mobiliario_cozinha_mudelar: a Mudelar passaria o teto de % categorias ativas (tem %).', c_max_categorias, v_n;
    END IF;
    -- slug e path como cat_guardar_categoria (sub = nome do pai em minúsculas / slug); sigla explícita
    FOR r IN SELECT s.codigo, s.nome FROM _mcc_subs s WHERE s.sub_id IS NULL ORDER BY s.ordem LOOP
      v_slug := public.fn_cat_slug(r.nome);
      INSERT INTO product_categories (name, slug, path, parent_id, sort_order, is_active, created_by, organization_id, sigla)
      VALUES (r.nome, v_slug, lower(v_cat_nome_real) || '/' || v_slug, v_cat,
              coalesce((SELECT max(pc.sort_order) + 1 FROM product_categories pc WHERE pc.parent_id = v_cat AND pc.organization_id = c_org), 0),
              true, v_criador, c_org, r.codigo)
      RETURNING id INTO v_sub;
      UPDATE _mcc_subs s SET sub_id = v_sub, criada = true WHERE s.codigo = r.codigo;
      PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text || ':' || v_sub::text, 0));
      v_subs_criadas := v_subs_criadas || r.nome || ' (' || r.codigo || '); ';
    END LOOP;
  END IF;
  IF EXISTS (SELECT 1 FROM _mcc_subs s WHERE s.sub_id IS NULL) THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: há subcategorias por resolver.';
  END IF;

  -- ─── 2. As opções verde normal / verde claro da Cor (as que existem; criadas se faltarem) ─────
  FOR r IN SELECT c.chave, c.nome FROM _mcc_cores c ORDER BY c.chave LOOP
    SELECT count(*), (array_agg(v.id ORDER BY v.id))[1], (array_agg(v.is_active ORDER BY v.id))[1] INTO v_n, v_opc, v_ativa
    FROM attribute_option_group_values v
    WHERE v.group_id = v_g_cor AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(r.chave);
    IF v_n > 1 THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: há % opções «%» na Cor da Mudelar.', v_n, r.chave; END IF;
    IF v_n = 1 AND NOT v_ativa THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: a opção «%» da Cor está desativada.', r.chave; END IF;
    IF v_n = 0 THEN
      v_txt := public.fn_cat_sigla_opcao_livre(v_g_cor, r.nome, NULL);
      IF v_txt IS NULL THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: sem sigla livre para «%».', r.nome; END IF;
      INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active, sigla)
      VALUES (v_g_cor, r.nome, r.nome, NULL,
              coalesce((SELECT max(v.sort_order) FROM attribute_option_group_values v WHERE v.group_id = v_g_cor), 0) + 1, true, v_txt)
      RETURNING id INTO v_opc;
      UPDATE _mcc_cores c SET criada = true WHERE c.chave = r.chave;
      v_criadas := v_criadas || 'Cor ' || r.nome || ' (' || v_txt || '); ';
    END IF;
    UPDATE _mcc_cores c SET opcao_id = v_opc WHERE c.chave = r.chave;
  END LOOP;
  UPDATE _mcc_cores c SET valor = v.value_text::text, sigla_real = v.sigla FROM attribute_option_group_values v WHERE v.id = c.opcao_id;
  IF EXISTS (SELECT 1 FROM _mcc_cores c WHERE c.sigla_real IS NULL) THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: uma das cores verdes da Mudelar não tem sigla.';
  END IF;

  -- ─── 3. As opções da Largura (as que existem; as outras criadas, sigla = o número ou <de>A<ate>) ─────
  FOR r IN SELECT x.valor, x.sigla FROM _mcc_larguras x ORDER BY x.ordem LOOP
    SELECT count(*), (array_agg(v.id ORDER BY v.id))[1], (array_agg(v.is_active ORDER BY v.id))[1] INTO v_n, v_opc, v_ativa
    FROM attribute_option_group_values v
    WHERE v.group_id = v_g_larg AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(r.valor);
    IF v_n > 1 THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: há % opções «%» na Largura da Mudelar.', v_n, r.valor; END IF;
    IF v_n = 1 AND NOT v_ativa THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: a opção «%» da Largura está desativada.', r.valor; END IF;
    IF v_n = 0 THEN
      SELECT string_agg(v.value_text::text, ', ') INTO v_txt FROM attribute_option_group_values v WHERE v.group_id = v_g_larg AND v.sigla = r.sigla;
      IF v_txt IS NOT NULL THEN
        RAISE EXCEPTION 'mobiliario_cozinha_mudelar: a sigla % da Largura já é da opção «%».', r.sigla, v_txt;
      END IF;
      INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active, sigla)
      VALUES (v_g_larg, r.valor, r.valor, NULL,
              coalesce((SELECT max(v.sort_order) FROM attribute_option_group_values v WHERE v.group_id = v_g_larg), 0) + 1, true, r.sigla)
      RETURNING id INTO v_opc;
      UPDATE _mcc_larguras x SET criada = true WHERE x.valor = r.valor;
      v_criadas := v_criadas || 'Largura ' || r.valor || ' (' || r.sigla || '); ';
    END IF;
    UPDATE _mcc_larguras x SET opcao_id = v_opc WHERE x.valor = r.valor;
  END LOOP;
  UPDATE _mcc_larguras x SET valor_real = v.value_text::text, sigla_real = v.sigla FROM attribute_option_group_values v WHERE v.id = x.opcao_id;
  IF EXISTS (SELECT 1 FROM _mcc_larguras x WHERE x.sigla_real IS NULL) THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: há opções da Largura sem sigla.';
  END IF;

  -- ─── 4. Os modelos, com os números do gerador ────────────────────────────────
  SELECT count(*) FILTER (WHERE pm.is_active), count(*) INTO v_n, v_m
  FROM product_models pm WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL;
  IF v_n + c_n_modelos > c_max_modelos_ativos OR v_m + c_n_modelos > c_max_modelos_vivos THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: a Mudelar passaria o teto de modelos (% ativos, % vivos).', v_n, v_m;
  END IF;
  FOR r IN SELECT m.sub, m.numero, m.nome, s.sub_id FROM _mcc_modelos m JOIN _mcc_subs s ON s.codigo = m.sub ORDER BY s.ordem, m.numero LOOP
    v_mod := NULL;
    SELECT pm.id, pm.is_active INTO v_mod, v_ativa FROM product_models pm
    WHERE pm.organization_id = c_org AND pm.subcategory_id = r.sub_id AND pm.numero = r.numero AND pm.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_mod IS NOT NULL AND NOT v_ativa THEN
      RAISE EXCEPTION 'mobiliario_cozinha_mudelar: o modelo % (% %) já existe e está desativado.', r.nome, r.sub, lpad(r.numero::text, 4, '0');
    END IF;
    IF v_mod IS NULL THEN
      INSERT INTO product_models (organization_id, subcategory_id, name, numero, is_active, created_by)
      VALUES (c_org, r.sub_id, r.nome, r.numero, true, v_criador)
      RETURNING id INTO v_mod;
    END IF;
    UPDATE _mcc_modelos m SET modelo_id = v_mod WHERE m.sub = r.sub AND m.numero = r.numero;
  END LOOP;

  -- ─── 5. Unidades «un» e «ml» (a de cat_guardar_produto_tabelas; criada na Mudelar se faltar) e fornecedor ─────
  v_ml_criada := NOT EXISTS (SELECT 1 FROM uom u WHERE (u.organization_id IS NULL OR u.organization_id = c_org)
                             AND lower(btrim(u.code)) = 'ml');
  CREATE TEMP TABLE _mcc_unidades ON COMMIT DROP AS
  SELECT x.codigo, public.fn_cat_unidade(c_org, x.codigo) AS id FROM (VALUES ('un'), ('ml')) AS x(codigo);
  IF EXISTS (SELECT 1 FROM _mcc_unidades u WHERE u.id IS NULL) THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: sem unidade «un» ou «ml».';
  END IF;

  SELECT s.id, coalesce(s.is_active, true) INTO v_sup, v_ativa FROM suppliers s
  WHERE s.organization_id = c_org AND s.deleted_at IS NULL AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(c_forn_nome)
  ORDER BY s.created_at, s.id LIMIT 1;
  IF v_sup IS NOT NULL AND NOT v_ativa THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: o fornecedor «%» da Mudelar está desativado.', c_forn_nome;
  END IF;
  IF v_sup IS NULL THEN
    INSERT INTO suppliers (organization_id, name, is_active, created_by)
    VALUES (c_org, public.fn_cat_limpar_nome(c_forn_nome), true, v_criador)
    RETURNING id INTO v_sup;
    v_forn_criado := true;
  END IF;

  -- ─── 6. As linhas a gravar: medida como cat_guardar_produto_atributos, SKU pela regra do Catálogo ─────
  CREATE TEMP TABLE _mcc ON COMMIT DROP AS
  SELECT gen_random_uuid() AS id, l.linha, l.sku_antigo, l.sub, s.sub_id, l.modelo AS numero, m.modelo_id, l.nome, l.unidade, u.id AS uom_id,
         l.custo, l.pvp, l.grossista, l.distribuidor, l.descricao, l.cod_forn, l.sku_esperado,
         c.opcao_id AS cor_opcao, c.valor AS cor_valor, c.sigla_real AS cor_sigla,
         x.opcao_id AS larg_opcao, x.valor_real AS larg_valor, x.sigla_real AS larg_sigla,
         l.med_l, l.med_c, NULL::jsonb AS med_json, NULL::text AS med_txt, NULL::text AS sku, NULL::jsonb AS faltas
  FROM _mcc_linhas l
  JOIN _mcc_subs s ON s.codigo = l.sub
  JOIN _mcc_modelos m ON m.sub = l.sub AND m.numero = l.modelo
  JOIN _mcc_unidades u ON u.codigo = l.unidade
  LEFT JOIN _mcc_cores c ON c.chave = l.cor
  LEFT JOIN _mcc_larguras x ON x.valor = l.largura;
  SELECT count(*) INTO v_n FROM _mcc;
  IF v_n <> c_total THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: % linhas a gravar em vez de %.', v_n, c_total; END IF;
  IF EXISTS (SELECT 1 FROM _mcc b WHERE b.sub_id IS NULL OR b.modelo_id IS NULL OR b.uom_id IS NULL) THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: há linhas sem subcategoria, modelo ou unidade resolvidos.';
  END IF;
  -- a medida guardada: value_json e value_text como cat_guardar_produto_atributos (fn_cat_dimensao_medida / _texto)
  UPDATE _mcc b SET
    med_json = jsonb_build_object('tipo', '2D', 'largura', public.fn_cat_dimensao_medida(b.med_l, 'A largura'),
                                  'comprimento', public.fn_cat_dimensao_medida(b.med_c, 'O comprimento'), 'espessura', NULL, 'unidade', 'cm'),
    med_txt = public.fn_cat_dimensao_texto(public.fn_cat_dimensao_medida(b.med_l, 'A largura')) || ' × '
              || public.fn_cat_dimensao_texto(public.fn_cat_dimensao_medida(b.med_c, 'O comprimento')) || ' cm'
  WHERE b.med_l IS NOT NULL;
  SELECT count(*) INTO v_n FROM _mcc b
  WHERE b.med_l IS NOT NULL
    AND (b.med_txt IS NULL OR public.fn_cat_medida_ler(b.med_json, 'cm') IS NULL
         OR b.med_json <> jsonb_build_object('tipo', '2D', 'largura', b.med_l, 'comprimento', b.med_c, 'espessura', NULL, 'unidade', 'cm'));
  IF v_n > 0 THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: % medidas não ficaram como os dados.', v_n; END IF;

  -- o SKU: fn_cat_sku_partes sobre (cor, medida, largura) + o número do modelo; tem de ser o esperado pelo gerador
  UPDATE _mcc b SET sku = z.calc, faltas = z.faltas
  FROM (SELECT b2.id, pt -> 'faltas' AS faltas,
               (CASE WHEN pt ->> 'prefixo' IS NULL THEN NULL
                     ELSE concat_ws('-', pt ->> 'prefixo', lpad(b2.numero::text, 4, '0'), pt ->> 'resto') END) AS calc
        FROM _mcc b2
        CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, v_cat, b2.sub_id, (
            SELECT coalesce(jsonb_agg(e.v), '[]'::jsonb)
            FROM (VALUES (CASE WHEN b2.cor_opcao IS NOT NULL THEN jsonb_build_object('atributo', v_a_cor, 'sigla', b2.cor_sigla) END),
                         (CASE WHEN b2.med_json IS NOT NULL THEN jsonb_build_object('atributo', v_a_med, 'medida', public.fn_cat_medida_ler(b2.med_json, 'cm')) END),
                         (CASE WHEN b2.larg_opcao IS NOT NULL THEN jsonb_build_object('atributo', v_a_larg, 'sigla', b2.larg_sigla) END)) AS e(v)
            WHERE e.v IS NOT NULL)) AS pt) y) z
  WHERE z.id = b.id;
  SELECT count(*), string_agg(b.sku_antigo || ' ' || coalesce(b.sku, 'null') || ' ≠ ' || b.sku_esperado || ' ' || coalesce(b.faltas::text, ''), '; ')
    INTO v_n, v_txt
  FROM _mcc b WHERE b.sku IS DISTINCT FROM b.sku_esperado OR b.faltas IS DISTINCT FROM '[]'::jsonb;
  IF v_n > 0 THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: % SKUs calculados diferentes do esperado: %', v_n, left(v_txt, 1500); END IF;
  SELECT string_agg(x.sku || ' ×' || x.n || ' (' || x.nomes || ')', '; ') INTO v_txt
  FROM (SELECT b.sku, count(*) AS n, string_agg(b.nome, ' | ' ORDER BY b.linha) AS nomes FROM _mcc b
        GROUP BY b.sku HAVING count(*) > 1 ORDER BY b.sku LIMIT 10) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: SKUs repetidos: %', v_txt; END IF;
  SELECT string_agg(b.sku || ' (' || p.name || ')', '; ') INTO v_txt
  FROM (SELECT b2.sku FROM _mcc b2 JOIN products p2 ON p2.organization_id = c_org AND p2.sku = b2.sku ORDER BY b2.sku LIMIT 10) b
  JOIN products p ON p.organization_id = c_org AND p.sku = b.sku;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'mobiliario_cozinha_mudelar: SKUs já usados noutros produtos da Mudelar: %', v_txt; END IF;
  v_regex := '^' || c_cat_sigla || '-(' || (SELECT string_agg(s.codigo, '|' ORDER BY s.ordem) FROM _mcc_subs s) || ')-[0-9]{4}(-[A-Z0-9]+){0,3}$';
  IF EXISTS (SELECT 1 FROM _mcc b WHERE b.sku !~ v_regex) THEN
    RAISE EXCEPTION 'mobiliario_cozinha_mudelar: SKU fora do formato (ex.: %).', (SELECT b.sku FROM _mcc b WHERE b.sku !~ v_regex LIMIT 1);
  END IF;

  -- ─── 7. Gravar (auditoria normal, linha a linha) ─────────────────────────────
  -- como cat_guardar_produto: ativo, vendável, comprável, sem variantes, gere stock; o gatilho trg_cat_produto_tabelas
  -- preenche marca_livre, unidade e catalogo_categoria_id a partir dos ids
  INSERT INTO products (id, organization_id, sku, name, description, status, is_active, is_sellable, is_purchasable, has_variants,
                        is_deleted, manages_stock, created_by, tipo_catalogo, category_id, subcategory_id, model_id, brand_id, uom_id,
                        supplier_id, fornecedor_livre, sku_gerado)
  SELECT b.id, c_org, b.sku, b.nome, b.descricao, 'active'::product_status, true, true, true, false,
         false, true, v_criador, 'produto', v_cat, b.sub_id, b.modelo_id, NULL, b.uom_id,
         v_sup, public.fn_cat_limpar_nome(c_forn_nome), true
  FROM _mcc b ORDER BY b.linha;

  INSERT INTO product_organizations (product_id, organization_id, created_by)
  SELECT b.id, c_org, v_criador FROM _mcc b ORDER BY b.linha;

  -- custo (preco_exato a 6 casas), PVP, grossista e distribuidor (só > 0), cada um 1 µs depois do anterior
  -- (product_prices_product_id_currency_valid_from_key), como fn_cat_depois_do_ultimo_preco
  INSERT INTO product_prices (product_id, currency, price, preco_exato, valid_from, created_by, price_type, vat_rate)
  SELECT b.id, 'EUR'::currency_code, round(b.custo, 2), round(b.custo, 6), v_agora, v_criador, 'purchase'::price_type, c_iva FROM _mcc b
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.pvp, 2), NULL::numeric, v_agora + interval '1 microsecond', v_criador, 'retail'::price_type, c_iva FROM _mcc b
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.grossista, 2), NULL::numeric, v_agora + interval '2 microseconds', v_criador, 'wholesale'::price_type, c_iva
  FROM _mcc b WHERE b.grossista > 0
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.distribuidor, 2), NULL::numeric, v_agora + interval '3 microseconds', v_criador, 'distributor'::price_type, c_iva
  FROM _mcc b WHERE b.distribuidor > 0;

  -- como cat_guardar_produto_atributos: opção = value_text da opção; medida = value_text «91–100 × 90 cm» e value_json 2D em cm
  INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_json, unit)
  SELECT b.id, v_a_cor, b.cor_valor, NULL::jsonb, NULL::text FROM _mcc b WHERE b.cor_opcao IS NOT NULL
  UNION ALL
  SELECT b.id, v_a_med, b.med_txt, b.med_json, 'cm' FROM _mcc b WHERE b.med_json IS NOT NULL
  UNION ALL
  SELECT b.id, v_a_larg, b.larg_valor, NULL::jsonb, NULL::text FROM _mcc b WHERE b.larg_opcao IS NOT NULL;

  -- como cat_ligar_fornecedor_produto: preferido, preço = custo; supplier_sku = código do fornecedor, ou o SKU
  INSERT INTO item_suppliers (organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price, currency,
                              is_preferred, is_active, created_by, preco_data)
  SELECT c_org, 'product', b.id, v_sup, NULL, coalesce(b.cod_forn, b.sku), round(b.custo, 2), 'EUR', true, true, v_criador, current_date
  FROM _mcc b ORDER BY b.linha;

  -- ─── 8. Conferir (cada contagem é do que está ERRADO; tem de dar 0) ──────────
  SELECT string_agg(s.nome || ' ' || coalesce(x.n, 0) || ' em vez de ' || s.esperados, '; ') INTO v_txt
  FROM _mcc_subs s
  LEFT JOIN (SELECT p.subcategory_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.subcategory_id) x ON x.subcategory_id = s.sub_id
  WHERE coalesce(x.n, 0) <> s.esperados;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: contagem por subcategoria errada: %', v_txt; END IF;
  SELECT string_agg(m.sub || lpad(m.numero::text, 4, '0') || ' ' || coalesce(x.n, 0) || '/' || m.esperados, '; ') INTO v_txt
  FROM _mcc_modelos m
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.model_id) x ON x.model_id = m.modelo_id
  WHERE coalesce(x.n, 0) <> m.esperados;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: contagem por modelo errada: %', left(v_txt, 1500); END IF;
  SELECT count(*) INTO v_n FROM _mcc_modelos m JOIN _mcc_subs s ON s.codigo = m.sub
  LEFT JOIN product_models pm ON pm.id = m.modelo_id
  WHERE NOT coalesce(pm.organization_id = c_org AND pm.subcategory_id = s.sub_id AND pm.deleted_at IS NULL AND pm.is_active
                     AND pm.numero = m.numero AND pm.name = m.nome, false);
  SELECT count(*) INTO v_m FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id IN (SELECT s.sub_id FROM _mcc_subs s);
  IF v_n > 0 OR v_m <> c_n_modelos THEN
    RAISE EXCEPTION 'Conferir: % modelos errados; % nas subcategorias (esperados %).', v_n, v_m, c_n_modelos;
  END IF;

  -- cada produto como a sua linha (LEFT JOIN + NOT coalesce(…, false): o que faltar também conta)
  SELECT count(*), string_agg(b.sku_antigo, ', ') INTO v_n, v_txt
  FROM _mcc b
  LEFT JOIN products p ON p.id = b.id
  LEFT JOIN product_prices pc ON pc.product_id = b.id AND pc.price_type = 'purchase'
  LEFT JOIN product_prices pv ON pv.product_id = b.id AND pv.price_type = 'retail'
  LEFT JOIN item_suppliers i ON i.product_id = b.id AND i.deleted_at IS NULL
  WHERE NOT coalesce(p.organization_id = c_org AND p.name = b.nome AND p.sku = b.sku_esperado AND p.sku_gerado AND p.model_id = b.modelo_id
        AND p.category_id = v_cat AND p.subcategory_id = b.sub_id AND p.brand_id IS NULL
        AND p.uom_id = b.uom_id AND p.unidade = b.unidade AND p.status = 'active'::product_status AND p.tipo_catalogo = 'produto'
        AND p.manages_stock AND p.is_active AND p.is_sellable AND p.is_purchasable AND NOT p.is_deleted AND p.supplier_id = v_sup
        AND p.fornecedor_livre = public.fn_cat_limpar_nome(c_forn_nome) AND p.description IS NOT DISTINCT FROM b.descricao
        AND pc.price = round(b.custo, 2) AND pc.preco_exato = round(b.custo, 6) AND pc.vat_rate = c_iva
        AND pv.price = round(b.pvp, 2) AND pv.vat_rate = c_iva
        AND (SELECT count(*) FROM product_prices x WHERE x.product_id = b.id)
            = 2 + (b.grossista > 0)::integer + (b.distribuidor > 0)::integer
        AND (b.grossista = 0 OR EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = b.id AND x.price_type = 'wholesale'
                                        AND x.price = round(b.grossista, 2) AND x.vat_rate = c_iva))
        AND (b.distribuidor = 0 OR EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = b.id AND x.price_type = 'distributor'
                                           AND x.price = round(b.distribuidor, 2) AND x.vat_rate = c_iva))
        AND i.organization_id = c_org AND i.supplier_id = v_sup AND i.is_preferred AND i.is_active
        AND i.purchase_price = round(b.custo, 2) AND i.supplier_sku = coalesce(b.cod_forn, b.sku_esperado)
        AND (SELECT count(*) FROM product_attribute_values v WHERE v.product_id = b.id)
            = (b.cor_opcao IS NOT NULL)::integer + (b.med_json IS NOT NULL)::integer + (b.larg_opcao IS NOT NULL)::integer
        AND (b.cor_opcao IS NULL OR EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = b.id
                                            AND v.attribute_id = v_a_cor AND v.value_text = b.cor_valor))
        AND (b.med_json IS NULL OR EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = b.id AND v.attribute_id = v_a_med
                                           AND v.value_json = jsonb_build_object('tipo', '2D', 'largura', b.med_l, 'comprimento', b.med_c,
                                                                                 'espessura', NULL, 'unidade', 'cm')
                                           AND v.value_text = b.med_txt AND v.unit = 'cm'))
        AND (b.larg_opcao IS NULL OR EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = b.id
                                             AND v.attribute_id = v_a_larg AND v.value_text = b.larg_valor)),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos não ficaram como a linha do ficheiro: %', v_n, left(v_txt, 1500); END IF;
  -- nem linhas a mais
  SELECT (SELECT count(*) FROM product_attribute_values v JOIN _mcc b ON b.id = v.product_id),
         (SELECT count(*) FROM product_prices x JOIN _mcc b ON b.id = x.product_id),
         (SELECT count(*) FROM item_suppliers x JOIN _mcc b ON b.id = x.product_id)
    INTO v_n, v_m, v_k;
  IF v_n <> c_n_cores + c_n_medidas + c_n_larguras OR v_m <> 2 * c_total + c_n_gross + c_n_dist OR v_k <> c_total THEN
    RAISE EXCEPTION 'Conferir: % valores de atributos (%), % preços (%), % ligações a fornecedor (%).',
      v_n, c_n_cores + c_n_medidas + c_n_larguras, v_m, 2 * c_total + c_n_gross + c_n_dist, v_k, c_total;
  END IF;
  SELECT count(*) INTO v_n FROM product_organizations x JOIN _mcc b ON b.id = x.product_id;
  IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: % product_organizations (esperados %).', v_n, c_total; END IF;
  SELECT count(*) INTO v_n FROM products p JOIN uom u ON u.id = p.uom_id
  WHERE p.id IN (SELECT b.id FROM _mcc b) AND lower(u.code) = 'ml';
  IF v_n <> c_n_ml THEN RAISE EXCEPTION 'Conferir: % produtos em ml (esperados %).', v_n, c_n_ml; END IF;

  -- as opções: as cores e as larguras ativas, com sigla; criadas só as que faltavam
  SELECT count(*) INTO v_n FROM _mcc_larguras x LEFT JOIN attribute_option_group_values v ON v.id = x.opcao_id
  WHERE NOT coalesce(v.group_id = v_g_larg AND v.is_active AND v.sigla IS NOT NULL
                     AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(x.valor)
                     AND (NOT x.criada OR (v.sigla = x.sigla AND v.value_text = x.valor)), false);
  SELECT count(*) INTO v_m FROM _mcc_cores c LEFT JOIN attribute_option_group_values v ON v.id = c.opcao_id
  WHERE NOT coalesce(v.group_id = v_g_cor AND v.is_active AND v.sigla IS NOT NULL, false);
  IF v_n > 0 OR v_m > 0 THEN RAISE EXCEPTION 'Conferir: % opções da Largura e % da Cor erradas.', v_n, v_m; END IF;

  -- SKUs: únicos, no formato, e iguais ao recalculado a partir do que ficou gravado (todos)
  SELECT count(*), count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ v_regex OR p.sku ~ '^CAT-' OR NOT p.sku_gerado) INTO v_n, v_m, v_k
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _mcc_subs s) AND NOT p.is_deleted;
  IF v_n <> c_total OR v_m <> c_total OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: % produtos, % SKUs distintos, % fora do formato ou não gerados.', v_n, v_m, v_k;
  END IF;
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
        WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _mcc_subs s) AND NOT p.is_deleted) y
  WHERE y.calc IS DISTINCT FROM y.sku OR y.prefixo IS NULL OR y.faltas IS DISTINCT FROM '[]';
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs diferentes do recalculado (ex.: %).', v_n, left(v_txt, 1500); END IF;

  -- todos com cat_prever_sku_modelo e os atributos gravados, como um membro da Mudelar com products.edit (só leitura)
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE NOTICE 'mobiliario_cozinha_mudelar: sem membro da Mudelar com products.edit — a comparação com cat_prever_sku_modelo ficou por fazer (o recálculo foi feito).';
  ELSE
    v_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    v_n := 0;
    FOR r IN SELECT b.id, b.sku_esperado, b.sub_id, b.modelo_id FROM _mcc b ORDER BY b.linha LOOP
      SELECT coalesce(jsonb_agg(CASE WHEN a.is_measurement THEN jsonb_build_object('atributo', v.attribute_id, 'medida', v.value_json)
                                     ELSE jsonb_build_object('atributo', v.attribute_id, 'opcao', o.id) END), '[]'::jsonb)
        INTO v_attrs
      FROM product_attribute_values v
      JOIN product_attributes a ON a.id = v.attribute_id
      LEFT JOIN attribute_option_group_values o
        ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(v.attribute_id, c_org) AND o.value_text = v.value_text
      WHERE v.product_id = r.id;
      v_prev := public.cat_prever_sku_modelo(c_org, v_cat, r.sub_id, r.modelo_id, v_attrs, r.id);
      IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku_esperado OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Conferir: cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku_esperado;
      END IF;
      v_n := v_n + 1;
    END LOOP;
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: só % de % comparados com cat_prever_sku_modelo.', v_n, c_total; END IF;
  END IF;

  -- nada escrito fora da Mudelar (xmin desta transação)
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
    UNION ALL SELECT 'brands', count(*) FROM brands x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'product_attributes', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'attribute_option_groups', count(*) FROM attribute_option_groups x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'attribute_option_group_values (fora da Cor e da Largura)', count(*) FROM attribute_option_group_values x
              WHERE x.xmin::text = v_xid AND x.group_id NOT IN (v_g_cor, v_g_larg)
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x
              WHERE x.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _mcc_subs s WHERE s.sub_id = x.id AND s.criada)) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: foram escritas linhas fora do âmbito: %', v_txt; END IF;
  IF NOT EXISTS (SELECT 1 FROM products p JOIN _mcc b ON b.id = p.id WHERE p.xmin::text = v_xid) THEN
    RAISE EXCEPTION 'Conferir: os produtos importados não têm o xmin desta transação: a verificação pelo xmin não vale.';
  END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _mcc b WHERE b.id = p.id);
  SELECT count(*) INTO v_m FROM attribute_option_group_values x WHERE x.xmin::text = v_xid;
  SELECT count(*) INTO v_k FROM uom x WHERE x.xmin::text = v_xid;
  IF v_n > 0 OR v_m <> (SELECT count(*) FROM _mcc_larguras WHERE criada) + (SELECT count(*) FROM _mcc_cores WHERE criada)
     OR v_k <> v_ml_criada::integer THEN
    RAISE EXCEPTION 'Conferir: escritos % outros produtos da Mudelar, % opções (esperadas as criadas) e % unidades.', v_n, v_m, v_k;
  END IF;
  SELECT count(*), string_agg(a.sku, ', ') INTO v_n, v_txt
  FROM _mcc_amostra a LEFT JOIN products p ON p.id = a.id
  WHERE NOT coalesce(p.sku = a.sku AND NOT p.is_deleted AND p.organization_id = c_org, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs da amostra de outras categorias mudaram: %', v_n, v_txt; END IF;

  RAISE NOTICE 'mobiliario_cozinha_mudelar: % produtos em «%» (% modelos), % com medida, % com largura, % com cor, % em ml, % com preço grossista. Subcategorias criadas: %. Opções criadas: %. Unidade ml criada: %. Fornecedor criado: %. Amostra de outras categorias: % SKUs iguais. Conferido.',
    c_total, c_cat_nome, c_n_modelos, c_n_medidas, c_n_larguras, c_n_cores, c_n_ml, c_n_gross,
    coalesce(nullif(v_subs_criadas, ''), 'nenhuma'), coalesce(nullif(v_criadas, ''), 'nenhuma'),
    (CASE WHEN v_ml_criada THEN 'sim' ELSE 'não (já existia)' END), (CASE WHEN v_forn_criado THEN 'sim' ELSE 'não' END),
    (SELECT count(*) FROM _mcc_amostra);
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
