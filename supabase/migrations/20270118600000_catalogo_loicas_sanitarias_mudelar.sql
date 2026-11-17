-- =============================================================================
-- Catálogo — importação das LOIÇAS SANITÁRIAS da MUDELAR (Excel do utilizador loicas.xlsx, folha «Folha1»).
-- Base de RH (uetjghdkwbywbftedtth). Ficheiro GERADO por script (gerar_loicas.js) a partir do Excel: as linhas de
-- dados abaixo não se editam à mão — regeneram-se.
-- =============================================================================
--
-- Decisões do utilizador (17/11):
--   * Um produto por linha do Excel (modelo + cor + tonalidade): 93 produtos (a linha vazia do fim fica de fora).
--     Por subcategoria: Sanitas 36, Bidés 29, Kit´s para Sanitários 14, Lavatórios 14.
--   * Cor e Tonalidade são atributos SEPARADOS: o «BB» antigo é Cor Branco (B) + Tonalidade Brilho (B). A cor e a
--     tonalidade tiram-se do NOME do produto, não do código antigo (o Excel tem 6 SKUs repetidos por engano, ex.:
--     LSS0005PM em «PRETO MATE» e em «BRANCO MATE»). Sem cor no nome (a estrutura) = sem Cor e sem Tonalidade; cor
--     sem acabamento no nome (ex.: «CINZA ESCURO», «CROMADO») = só Cor.
--   * O SKU antigo do Excel NÃO se guarda. O SKU é o das regras do Catálogo: SIGLA_CAT-SIGLA_SUB-NNNN(modelo)-<cor>-<tonalidade>
--     (ordem configurada da Mudelar: Cor 1, Tonalidade 2), ex. SANITA GLAMIC BTW BRANCO BRILHO → LS-S-0003-B-B.
--   * Siglas: Loiças Sanitárias LS; Sanitas S, Bidés B, Kit´s para Sanitários KS, Lavatórios L (eram SN, BD, KSS, LV;
--     nenhum produto as usa). Cor: Branco B, Cinza C, Preto P, Dourado D, Cappuccino CC, Cinza Escuro CE, Ouro OR,
--     Prata PR, Preto e Gold PG, Rosa Gold RG. Tonalidade: BRILHO B, MATE M. Se outra opção do mesmo grupo já tinha a
--     sigla, fica com a sugestão seguinte (fn_cat_sigla_opcao_livre) e o NOTICE diz qual (lido a 17/11: Cinza Claro, CC).
--   * Modelos com os números do Excel, por subcategoria; o nome do modelo = o nome do produto sem o tipo (SANITA, BIDÉ,
--     Sanita de Chão, PLACA DE ACIONAMENTO, ESTRUTURA PARA, Lavatório) e sem a cor/acabamento, mantendo «S/TANQUE» e
--     «SUSPENSO» (ex.: S 0004 «GLAMIC BTW S/TANQUE»). 36 modelos.
--   * Marcas Rubicer e Moovlux (já existem). Fornecedores «RUBICER, Lda.» (Rubicer) e «ANLORBEL COMERCIO MATERIAIS
--     CONSTRUCAO E DECORACAO» (Moovlux), criados na Mudelar se não existirem e ligados a cada produto (item_suppliers,
--     preferido, preço de compra = custo, supplier_sku = SKU, como cat_ligar_fornecedor_produto).
--   * Preço por linha (muda com a cor/acabamento): custo = «Preço Compra», PVP = «Preço Venda», IVA 23.
--
-- Decisões desta migration (a confirmar pelo utilizador):
--   * Cromado = a opção «CROMO» que já existe na Cor da Mudelar, com a sigla que já tem (CRO). A sigla pedida (CR) é a
--     de CREMA, que está em 796 SKUs das Bases de Duche: trocá-la deixava esses SKUs diferentes do recalculado.
--   * Gun Metal (criada) fica com GMT, a sugestão do Catálogo. A sigla GM é a de GRIS MEDIO, em 796 SKUs das Bases.
--   * Cappuccino = a opção «Capuccino» que já existe (sigla CP → CC). Não se cria «Cappuccino» ao lado.
--   * «DOURADO» (código antigo OR) é a Cor Dourado (D); «OURO» é a Cor Ouro (OR): o nome manda.
--   * «Cappucinno Mate» (FLY BTW, sanita e bidé) leva Tonalidade Mate; «CAPPUCINNO» sozinho fica só com a Cor.
--   * O «Codigo do Fornecedor» do Excel não se grava (supplier_sku = SKU, como o ecrã).
--   * IVA 23 em todos: as linhas 69 a 80 do Excel (placas de acionamento) dizem 24, 25 … 32 — preenchimento
--     arrastado no Excel, não uma taxa.
--   * O modelo KS 0001 chama-se «Sanita Suspensa» (o produto é «ESTRUTURA PARA Sanita Suspensa», sem cor).
--   * São 36 modelos (14 Sanitas, 10 Bidés, 4 Kit´s, 8 Lavatórios), não 37: nos Bidés não há 0004, 0007 nem 0010.
--   * Auditoria normal, linha a linha (são 93 produtos), com app.audit_source = 'migration:loicas_sanitarias_mudelar'.
--   * Estado 'active', vendável e comprável, como cat_guardar_produto.
--
-- GUARDA (inerte: RAISE NOTICE e sai sem escrever nada) se: a organização 3242e925-… não existir com o nome 'Mudelar';
-- faltar a versão dos modelos (20270118300000); não existir «Loiças Sanitárias» ou uma das 4 subcategorias; já houver
-- produtos (vivos ou apagados) numa delas; já houver um produto vivo da Mudelar com um dos nomes do Excel; ou já houver
-- numa delas um modelo com um dos nomes ou números que não seja exatamente o mesmo. Inerte numa segunda execução.
-- Falha (RAISE EXCEPTION, nada fica) se faltar o resto: sigla LS, marcas, atributos Cor/Tonalidade, membro para
-- created_by; uma opção ambígua ou desativada; uma sigla a mudar numa opção que algum produto da Mudelar já usa (o SKU
-- dele deixaria de bater); uma sigla de subcategoria ocupada por outra irmã; SKU repetido (diz quais) ou já usado.
--
-- Conferir no fim (RAISE EXCEPTION se divergir): 93 produtos e por subcategoria e por modelo; 36 modelos;
-- cada produto com nome, SKU, marca, fornecedor, preços e só os atributos que o nome indica; SKUs únicos, no formato e
-- iguais ao recalculado (todos) e a cat_prever_sku_modelo (todos); as siglas; nada escrito fora da Mudelar (xmin).
--
-- ORDEM: depois de 20270118300000 e 20270118400000. Teste: supabase/tests/catalogo_loicas_sanitarias_mudelar.test.sql
-- (BEGIN … ROLLBACK, só leitura; o passo 0 falha antes). ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que
-- estiver pendente; listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '5min';

DO $mig$
DECLARE
  c_org        constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte      constant text    := 'migration:loicas_sanitarias_mudelar';
  c_total      constant integer := 93;
  c_n_modelos  constant integer := 36;
  c_iva        constant numeric := 23;
  c_cat_nome   constant text    := 'Loiças Sanitárias';
  c_cat_sigla  constant text    := 'LS';
  c_unidade    constant text    := 'un';
  c_max_modelos_ativos constant integer := 2000;
  c_max_modelos_vivos  constant integer := 10000;
  v_agora   timestamptz := clock_timestamp();
  v_n bigint; v_m bigint; v_k bigint; v_xid text; v_txt text; v_trocas text := ''; v_criadas text := ''; v_forn_criados text := '';
  v_cat uuid; v_cat_sigla text; v_cat_ativa boolean; v_sub uuid; v_ativa boolean; v_criador uuid; v_uom uuid; v_sup uuid;
  v_a_cor uuid; v_a_ton uuid; v_g_cor uuid; v_g_ton uuid;
  v_grupo uuid; v_opc uuid; v_mod uuid; v_regex text; v_n_entra integer;
  v_auth uuid; v_claims text; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  -- ─── 0. Guarda (inerte) ───────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'loicas_sanitarias_mudelar: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  IF to_regclass('public.product_models') IS NULL
     OR to_regprocedure('public.fn_cat_modelo_numero(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)') IS NULL
     OR position('fn_cat_modelo_numero' IN coalesce((SELECT pr.prosrc FROM pg_proc pr
                                                     WHERE pr.oid = to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)')::oid), '')) = 0 THEN
    RAISE NOTICE 'loicas_sanitarias_mudelar: falta a versão dos modelos (20270118300000) — nada a fazer.';
    RETURN;
  END IF;
  SELECT string_agg(s, ', ') INTO v_txt
  FROM unnest(ARRAY['public.fn_cat_chave_opcao(text)', 'public.fn_cat_limpar_nome(text)',
                    'public.fn_cat_grupo_do_atributo(uuid,uuid)', 'public.fn_cat_medida_ler(jsonb,text)',
                    'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)', 'public.fn_cat_sigla_opcao_livre(uuid,text,uuid)',
                    'public.fn_cat_unidade(uuid,text)', 'public.has_anew_permission_in_org(uuid,text,uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: faltam funções do Catálogo (%).', v_txt; END IF;

  SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(c.sigla ORDER BY c.created_at, c.id))[1],
         (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1]
    INTO v_n, v_cat, v_cat_sigla, v_cat_ativa
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(c_cat_nome);
  IF v_n = 0 THEN
    RAISE NOTICE 'loicas_sanitarias_mudelar: a Mudelar não tem a categoria «%» — nada a fazer.', c_cat_nome;
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'loicas_sanitarias_mudelar: há % categorias «%» na Mudelar.', v_n, c_cat_nome;
  END IF;

  -- ─── Os dados do Excel (gerados) ──────────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._lsm_subs, pg_temp._lsm_modelos, pg_temp._lsm_opcoes, pg_temp._lsm_forn, pg_temp._lsm_marcas,
                       pg_temp._lsm_linhas, pg_temp._lsm_deslocadas, pg_temp._lsm_attr, pg_temp._lsm;

  -- as 4 subcategorias: sigla nova (= a do Excel), nome na Mudelar, quantos produtos
  CREATE TEMP TABLE _lsm_subs (codigo text PRIMARY KEY, nome text NOT NULL, esperados integer NOT NULL, ordem integer NOT NULL,
                               sub_id uuid, sigla_antes text) ON COMMIT DROP;
  INSERT INTO _lsm_subs (codigo, nome, esperados, ordem) VALUES
    ('S', 'Sanitas', 36, 1),
    ('B', 'Bidés', 29, 2),
    ('KS', 'Kit´s para Sanitários', 14, 3),
    ('L', 'Lavatórios', 14, 4);

  -- os modelos: subcategoria, número (NNNN do SKU), nome, quantos produtos
  CREATE TEMP TABLE _lsm_modelos (sub text NOT NULL, numero smallint NOT NULL, nome text NOT NULL, esperados integer NOT NULL,
                                  modelo_id uuid, PRIMARY KEY (sub, numero)) ON COMMIT DROP;
  INSERT INTO _lsm_modelos (sub, numero, nome, esperados) VALUES
    ('S', 1, 'MAX BTW', 1),
    ('S', 2, 'ROUND', 1),
    ('S', 3, 'GLAMIC BTW', 3),
    ('S', 4, 'GLAMIC BTW S/TANQUE', 2),
    ('S', 5, 'GLAMIC SUSPENSO', 4),
    ('S', 6, 'ELEGANT BTW', 4),
    ('S', 7, 'ELEGANT BTW S/TANQUE', 2),
    ('S', 8, 'ELEGANT SUSPENSO', 5),
    ('S', 9, 'FLY BTW', 3),
    ('S', 10, 'FLY BTW S/TANQUE', 2),
    ('S', 11, 'FLY PLUS SUSPENSO', 1),
    ('S', 12, 'FLY SUSPENSO', 4),
    ('S', 13, 'BOHEMIC BTW', 3),
    ('S', 14, 'SMART TOILET WISH', 1),
    ('B', 1, 'MAX BTW', 1),
    ('B', 2, 'ROUND', 1),
    ('B', 3, 'GLAMIC BTW', 3),
    ('B', 5, 'GLAMIC SUSPENSO', 4),
    ('B', 6, 'ELEGANT BTW', 4),
    ('B', 8, 'ELEGANT SUSPENSO', 5),
    ('B', 9, 'FLY BTW', 3),
    ('B', 11, 'FLY PLUS SUSPENSO', 1),
    ('B', 12, 'FLY SUSPENSO', 4),
    ('B', 13, 'BOHEMIC BTW', 3),
    ('KS', 1, 'Sanita Suspensa', 1),
    ('KS', 2, 'FINA', 2),
    ('KS', 3, 'RETANGULAR', 6),
    ('KS', 4, 'REDONDO', 5),
    ('L', 1, 'BREAK RULES', 4),
    ('L', 2, 'ALMERIA', 1),
    ('L', 3, 'DETROIT', 1),
    ('L', 4, 'MOSCOVO', 1),
    ('L', 5, 'BARCELONA', 4),
    ('L', 6, 'VIRGINIA', 1),
    ('L', 7, 'LILLE', 1),
    ('L', 8, 'LERIDA', 1);

  -- as opções de Cor e de Tonalidade: sigla que fica, nome da opção na Mudelar (cria-se com este nome se faltar)
  CREATE TEMP TABLE _lsm_opcoes (papel text NOT NULL, codigo text NOT NULL, nome text NOT NULL, ordem integer NOT NULL,
                                 grupo uuid, opcao_id uuid, valor text, PRIMARY KEY (papel, codigo)) ON COMMIT DROP;
  INSERT INTO _lsm_opcoes (papel, codigo, nome, ordem) VALUES
    ('cor', 'B', 'Branco', 1),
    ('cor', 'C', 'Cinza', 2),
    ('cor', 'P', 'Preto', 3),
    ('cor', 'D', 'Dourado', 4),
    ('cor', 'CC', 'Capuccino', 5),
    ('cor', 'CE', 'Cinza Escuro', 6),
    ('cor', 'CRO', 'CROMO', 7),
    ('cor', 'OR', 'Ouro', 8),
    ('cor', 'PR', 'Prata', 9),
    ('cor', 'PG', 'Preto e Gold', 10),
    ('cor', 'RG', 'Rosa Gold', 11),
    ('cor', 'GMT', 'Gun Metal', 12),
    ('tonalidade', 'B', 'BRILHO', 1),
    ('tonalidade', 'M', 'MATE', 2);

  CREATE TEMP TABLE _lsm_forn (nome text PRIMARY KEY, id uuid, criado boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _lsm_forn (nome) VALUES
    ('RUBICER, Lda.'),
    ('ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO');
  CREATE TEMP TABLE _lsm_marcas (nome text PRIMARY KEY, id uuid) ON COMMIT DROP;
  INSERT INTO _lsm_marcas (nome) VALUES
    ('Rubicer'),
    ('Moovlux');

  -- as 93 linhas: (linha do Excel, subcategoria, modelo, nome, sigla da cor, sigla da tonalidade, marca, fornecedor, custo, pvp)
  CREATE TEMP TABLE _lsm_linhas (linha integer PRIMARY KEY, sub text NOT NULL, modelo smallint NOT NULL, nome text NOT NULL,
                                 cor text, ton text, marca text NOT NULL, fornecedor text NOT NULL,
                                 custo numeric NOT NULL, pvp numeric NOT NULL) ON COMMIT DROP;
  INSERT INTO _lsm_linhas (linha, sub, modelo, nome, cor, ton, marca, fornecedor, custo, pvp) VALUES
    (2, 'S', 1, 'SANITA MAX BTW BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 92.50, 185.00),
    (3, 'S', 2, 'SANITA ROUND BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 85.00, 170.00),
    (4, 'S', 3, 'SANITA GLAMIC BTW BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 140.00, 280.00),
    (5, 'S', 3, 'SANITA GLAMIC BTW BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 200.00, 400.00),
    (6, 'S', 3, 'SANITA GLAMIC BTW CINZA MATE', 'C', 'M', 'Rubicer', 'RUBICER, Lda.', 225.00, 450.00),
    (7, 'S', 4, 'SANITA GLAMIC BTW BRANCO BRILHO S/TANQUE', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 100.00, 200.00),
    (8, 'S', 4, 'SANITA GLAMIC BTW BRANCO MATE S/TANQUE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 150.00, 300.00),
    (9, 'S', 5, 'SANITA GLAMIC SUSPENSO CINZA MATE', 'C', 'M', 'Rubicer', 'RUBICER, Lda.', 150.00, 300.00),
    (10, 'S', 5, 'SANITA GLAMIC SUSPENSO PRETO MATE', 'P', 'M', 'Rubicer', 'RUBICER, Lda.', 150.00, 300.00),
    (11, 'S', 5, 'SANITA GLAMIC SUSPENSO BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 90.00, 180.00),
    (12, 'S', 5, 'SANITA GLAMIC SUSPENSO BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 130.00, 260.00),
    (13, 'S', 6, 'SANITA ELEGANT BTW BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 145.00, 290.00),
    (14, 'S', 6, 'SANITA ELEGANT BTW BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 200.00, 400.00),
    (15, 'S', 6, 'SANITA ELEGANT BTW CAPPUCINNO', 'CC', NULL, 'Rubicer', 'RUBICER, Lda.', 225.00, 450.00),
    (16, 'S', 6, 'SANITA ELEGANT BTW CINZA ESCURO', 'CE', NULL, 'Rubicer', 'RUBICER, Lda.', 225.00, 450.00),
    (17, 'S', 7, 'SANITA ELEGANT BTW BRANCO BRILHO S/TANQUE', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 105.00, 210.00),
    (18, 'S', 7, 'SANITA ELEGANT BTW BRANCO MATE S/TANQUE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 150.00, 300.00),
    (19, 'S', 8, 'SANITA ELEGANT SUSPENSO BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 92.50, 185.00),
    (20, 'S', 8, 'SANITA ELEGANT SUSPENSO PRETO MATE', 'P', 'M', 'Rubicer', 'RUBICER, Lda.', 150.00, 300.00),
    (21, 'S', 8, 'SANITA ELEGANT SUSPENSO BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 130.00, 260.00),
    (22, 'S', 8, 'SANITA ELEGANT SUSPENSO CAPPUCINNO', 'CC', NULL, 'Rubicer', 'RUBICER, Lda.', 150.00, 300.00),
    (23, 'S', 8, 'SANITA ELEGANT SUSPENSO CINZA ESCURO', 'CE', NULL, 'Rubicer', 'RUBICER, Lda.', 150.00, 300.00),
    (24, 'S', 9, 'SANITA FLY BTW Cappucinno Mate', 'CC', 'M', 'Rubicer', 'RUBICER, Lda.', 225.00, 450.00),
    (25, 'S', 9, 'SANITA FLY BTW BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 125.00, 250.00),
    (26, 'S', 9, 'SANITA FLY BTW BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 200.00, 400.00),
    (27, 'S', 10, 'SANITA FLY BTW BRANCO BRILHO S/TANQUE', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 100.00, 200.00),
    (28, 'S', 10, 'SANITA FLY BTW BRANCO MATE S/TANQUE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 150.00, 300.00),
    (29, 'S', 11, 'SANITA FLY PLUS SUSPENSO BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 95.00, 190.00),
    (30, 'S', 12, 'SANITA FLY SUSPENSO CAPPUCINNO', 'CC', NULL, 'Rubicer', 'RUBICER, Lda.', 150.00, 300.00),
    (31, 'S', 12, 'SANITA FLY SUSPENSO PRETO MATE', 'P', 'M', 'Rubicer', 'RUBICER, Lda.', 150.00, 300.00),
    (32, 'S', 12, 'SANITA FLY SUSPENSO BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 90.00, 180.00),
    (33, 'S', 12, 'SANITA FLY SUSPENSO BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 130.00, 260.00),
    (34, 'S', 13, 'SANITA BOHEMIC BTW BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 105.00, 210.00),
    (35, 'S', 13, 'SANITA BOHEMIC BTW PRETO MATE', 'P', 'M', 'Rubicer', 'RUBICER, Lda.', 225.00, 450.00),
    (36, 'S', 13, 'SANITA BOHEMIC BTW BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 200.00, 400.00),
    (37, 'S', 14, 'Sanita de Chão SMART TOILET WISH BRANCO BRILHO', 'B', 'B', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 410.40, 760.00),
    (38, 'B', 1, 'BIDÉ MAX BTW BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 70.00, 140.00),
    (39, 'B', 2, 'BIDÉ ROUND BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 67.50, 135.00),
    (40, 'B', 3, 'BIDÉ GLAMIC BTW BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 75.00, 150.00),
    (41, 'B', 3, 'BIDÉ GLAMIC BTW BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 125.00, 250.00),
    (42, 'B', 3, 'BIDÉ GLAMIC BTW CINZA MATE', 'C', 'M', 'Rubicer', 'RUBICER, Lda.', 140.00, 280.00),
    (43, 'B', 5, 'BIDÉ GLAMIC SUSPENSO CINZA MATE', 'C', 'M', 'Rubicer', 'RUBICER, Lda.', 130.00, 260.00),
    (44, 'B', 5, 'BIDÉ GLAMIC SUSPENSO PRETO MATE', 'P', 'M', 'Rubicer', 'RUBICER, Lda.', 130.00, 260.00),
    (45, 'B', 5, 'BIDÉ GLAMIC SUSPENSO BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 72.50, 145.00),
    (46, 'B', 5, 'BIDÉ GLAMIC SUSPENSO BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 110.00, 220.00),
    (47, 'B', 6, 'BIDÉ ELEGANT BTW BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 80.00, 160.00),
    (48, 'B', 6, 'BIDÉ ELEGANT BTW BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 125.00, 250.00),
    (49, 'B', 6, 'BIDÉ ELEGANT BTW CAPPUCINNO', 'CC', NULL, 'Rubicer', 'RUBICER, Lda.', 140.00, 280.00),
    (50, 'B', 6, 'BIDÉ ELEGANT BTW CINZA ESCURO', 'CE', NULL, 'Rubicer', 'RUBICER, Lda.', 140.00, 280.00),
    (51, 'B', 8, 'BIDÉ ELEGANT SUSPENSO BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 72.50, 145.00),
    (52, 'B', 8, 'BIDÉ ELEGANT SUSPENSO PRETO MATE', 'P', 'M', 'Rubicer', 'RUBICER, Lda.', 130.00, 260.00),
    (53, 'B', 8, 'BIDÉ ELEGANT SUSPENSO BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 110.00, 220.00),
    (54, 'B', 8, 'BIDÉ ELEGANT SUSPENSO CAPPUCINNO', 'CC', NULL, 'Rubicer', 'RUBICER, Lda.', 130.00, 260.00),
    (55, 'B', 8, 'BIDÉ ELEGANT SUSPENSO CINZA ESCURO', 'CE', NULL, 'Rubicer', 'RUBICER, Lda.', 130.00, 260.00),
    (56, 'B', 9, 'BIDÉ FLY BTW Cappucinno Mate', 'CC', 'M', 'Rubicer', 'RUBICER, Lda.', 140.00, 280.00),
    (57, 'B', 9, 'BIDÉ FLY BTW BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 85.00, 170.00),
    (58, 'B', 9, 'BIDÉ FLY BTW BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 125.00, 250.00),
    (59, 'B', 11, 'BIDÉ FLY PLUS SUSPENSO BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 85.00, 170.00),
    (60, 'B', 12, 'BIDÉ FLY SUSPENSO CAPPUCINNO', 'CC', NULL, 'Rubicer', 'RUBICER, Lda.', 130.00, 260.00),
    (61, 'B', 12, 'BIDÉ FLY SUSPENSO PRETO MATE', 'P', 'M', 'Rubicer', 'RUBICER, Lda.', 130.00, 260.00),
    (62, 'B', 12, 'BIDÉ FLY SUSPENSO BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 72.50, 145.00),
    (63, 'B', 12, 'BIDÉ FLY SUSPENSO BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 110.00, 220.00),
    (64, 'B', 13, 'BIDÉ BOHEMIC BTW BRANCO BRILHO', 'B', 'B', 'Rubicer', 'RUBICER, Lda.', 80.00, 160.00),
    (65, 'B', 13, 'BIDÉ BOHEMIC BTW PRETO MATE', 'P', 'M', 'Rubicer', 'RUBICER, Lda.', 140.00, 280.00),
    (66, 'B', 13, 'BIDÉ BOHEMIC BTW BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 125.00, 250.00),
    (67, 'KS', 1, 'ESTRUTURA PARA Sanita Suspensa', NULL, NULL, 'Rubicer', 'RUBICER, Lda.', 100.00, 200.00),
    (68, 'KS', 2, 'PLACA DE ACIONAMENTO FINA BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 20.00, 40.00),
    (69, 'KS', 2, 'PLACA DE ACIONAMENTO FINA PRETO MATE', 'P', 'M', 'Rubicer', 'RUBICER, Lda.', 30.00, 60.00),
    (70, 'KS', 3, 'PLACA DE ACIONAMENTO RETANGULAR CROMADO', 'CRO', NULL, 'Rubicer', 'RUBICER, Lda.', 18.00, 36.00),
    (71, 'KS', 3, 'PLACA DE ACIONAMENTO RETANGULAR ROSA GOLD', 'RG', NULL, 'Rubicer', 'RUBICER, Lda.', 50.00, 100.00),
    (72, 'KS', 3, 'PLACA DE ACIONAMENTO RETANGULAR GUN METAL', 'GMT', NULL, 'Rubicer', 'RUBICER, Lda.', 50.00, 100.00),
    (73, 'KS', 3, 'PLACA DE ACIONAMENTO RETANGULAR PRETO MATE', 'P', 'M', 'Rubicer', 'RUBICER, Lda.', 27.00, 54.00),
    (74, 'KS', 3, 'PLACA DE ACIONAMENTO RETANGULAR DOURADO', 'D', NULL, 'Rubicer', 'RUBICER, Lda.', 106.00, 212.00),
    (75, 'KS', 3, 'PLACA DE ACIONAMENTO RETANGULAR DOURADO MATE', 'D', 'M', 'Rubicer', 'RUBICER, Lda.', 50.00, 100.00),
    (76, 'KS', 4, 'PLACA DE ACIONAMENTO REDONDO BRANCO MATE', 'B', 'M', 'Rubicer', 'RUBICER, Lda.', 16.00, 32.00),
    (77, 'KS', 4, 'PLACA DE ACIONAMENTO REDONDO CROMADO', 'CRO', NULL, 'Rubicer', 'RUBICER, Lda.', 18.00, 36.00),
    (78, 'KS', 4, 'PLACA DE ACIONAMENTO REDONDO PRETO MATE', 'P', 'M', 'Rubicer', 'RUBICER, Lda.', 27.00, 54.00),
    (79, 'KS', 4, 'PLACA DE ACIONAMENTO REDONDO PRETO E GOLD', 'PG', NULL, 'Rubicer', 'RUBICER, Lda.', 50.00, 100.00),
    (80, 'KS', 4, 'PLACA DE ACIONAMENTO REDONDO DOURADO', 'D', NULL, 'Rubicer', 'RUBICER, Lda.', 106.00, 212.00),
    (81, 'L', 1, 'Lavatório BREAK RULES PRETO MATE', 'P', 'M', 'Rubicer', 'RUBICER, Lda.', 75.00, 150.00),
    (82, 'L', 1, 'Lavatório BREAK RULES CINZA MATE', 'C', 'M', 'Rubicer', 'RUBICER, Lda.', 75.00, 150.00),
    (83, 'L', 1, 'Lavatório BREAK RULES CINZA ESCURO', 'CE', NULL, 'Rubicer', 'RUBICER, Lda.', 75.00, 150.00),
    (84, 'L', 1, 'Lavatório BREAK RULES CAPPUCINO', 'CC', NULL, 'Rubicer', 'RUBICER, Lda.', 75.00, 150.00),
    (85, 'L', 2, 'Lavatório ALMERIA BRANCO BRILHO', 'B', 'B', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 32.40, 60.00),
    (86, 'L', 3, 'Lavatório DETROIT BRANCO BRILHO', 'B', 'B', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 32.40, 60.00),
    (87, 'L', 4, 'Lavatório MOSCOVO BRANCO BRILHO', 'B', 'B', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 37.80, 70.00),
    (88, 'L', 5, 'Lavatório BARCELONA BRANCO BRILHO', 'B', 'B', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 54.00, 100.00),
    (89, 'L', 5, 'Lavatório BARCELONA PRETO BRILHO', 'P', 'B', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 97.20, 180.00),
    (90, 'L', 5, 'Lavatório BARCELONA PRATA', 'PR', NULL, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 97.20, 180.00),
    (91, 'L', 5, 'Lavatório BARCELONA OURO', 'OR', NULL, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 97.20, 180.00),
    (92, 'L', 6, 'Lavatório VIRGINIA BRANCO BRILHO', 'B', 'B', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 48.60, 90.00),
    (93, 'L', 7, 'Lavatório LILLE BRANCO BRILHO', 'B', 'B', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 43.20, 80.00),
    (94, 'L', 8, 'Lavatório LERIDA BRANCO BRILHO', 'B', 'B', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 40.50, 75.00);

  -- os dados gerados estão inteiros
  SELECT count(*), count(DISTINCT l.nome), count(DISTINCT (l.sub, l.modelo, l.cor, l.ton)) INTO v_n, v_m, v_k FROM _lsm_linhas l;
  IF v_n <> c_total OR v_m <> c_total OR v_k <> c_total THEN
    RAISE EXCEPTION 'loicas_sanitarias_mudelar: os dados gerados têm % linhas (% nomes, % combinações) em vez de %.', v_n, v_m, v_k, c_total;
  END IF;
  IF EXISTS (SELECT 1 FROM _lsm_linhas l
             WHERE NOT EXISTS (SELECT 1 FROM _lsm_modelos m WHERE m.sub = l.sub AND m.numero = l.modelo)
                OR (l.cor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _lsm_opcoes o WHERE o.papel = 'cor' AND o.codigo = l.cor))
                OR (l.ton IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _lsm_opcoes o WHERE o.papel = 'tonalidade' AND o.codigo = l.ton))
                OR (l.ton IS NOT NULL AND l.cor IS NULL)
                OR NOT EXISTS (SELECT 1 FROM _lsm_forn f WHERE f.nome = l.fornecedor)
                OR NOT EXISTS (SELECT 1 FROM _lsm_marcas b WHERE b.nome = l.marca)) THEN
    RAISE EXCEPTION 'loicas_sanitarias_mudelar: há linhas com modelo, cor, tonalidade, marca ou fornecedor fora das tabelas geradas.';
  END IF;
  IF (SELECT sum(m.esperados) FROM _lsm_modelos m) <> c_total OR (SELECT sum(s.esperados) FROM _lsm_subs s) <> c_total
     OR (SELECT count(*) FROM _lsm_modelos) <> c_n_modelos THEN
    RAISE EXCEPTION 'loicas_sanitarias_mudelar: as contagens por modelo/subcategoria não somam % (ou não há % modelos).', c_total, c_n_modelos;
  END IF;

  -- as subcategorias
  FOR r IN SELECT s.codigo, s.nome FROM _lsm_subs s ORDER BY s.ordem LOOP
    SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1],
           (array_agg(c.sigla ORDER BY c.created_at, c.id))[1]
      INTO v_n, v_sub, v_ativa, v_txt
    FROM product_categories c
    WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n = 0 THEN
      RAISE NOTICE 'loicas_sanitarias_mudelar: a Mudelar não tem a subcategoria «%» › «%» — nada a fazer.', c_cat_nome, r.nome;
      RETURN;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'loicas_sanitarias_mudelar: há % subcategorias «%» em «%».', v_n, r.nome, c_cat_nome;
    END IF;
    IF NOT v_ativa THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: a subcategoria «%» está desativada.', r.nome; END IF;
    UPDATE _lsm_subs s SET sub_id = v_sub, sigla_antes = v_txt WHERE s.codigo = r.codigo;
  END LOOP;
  -- produtos nas subcategorias (vivos ou apagados: um apagado guarda o SKU com a sigla antiga) → inerte
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _lsm_subs s);
  IF v_n > 0 THEN
    RAISE NOTICE 'loicas_sanitarias_mudelar: as subcategorias de «%» já têm % produtos — nada a fazer.', c_cat_nome, v_n;
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT l.nome FROM _lsm_linhas l);
  IF v_n > 0 THEN
    RAISE NOTICE 'loicas_sanitarias_mudelar: a Mudelar já tem % produtos vivos com nomes do Excel — nada a fazer.', v_n;
    RETURN;
  END IF;
  SELECT string_agg(s.codigo || ': ' || pm.name || ' (' || lpad(pm.numero::text, 4, '0') || (CASE WHEN pm.deleted_at IS NOT NULL THEN ', apagado' ELSE '' END) || ')', ', ')
    INTO v_txt
  FROM product_models pm JOIN _lsm_subs s ON s.sub_id = pm.subcategory_id
  WHERE pm.organization_id = c_org
    AND EXISTS (SELECT 1 FROM _lsm_modelos m
                WHERE m.sub = s.codigo
                  AND (pm.numero = m.numero OR (pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)))
                  AND NOT (pm.numero = m.numero AND pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)));
  IF v_txt IS NOT NULL THEN
    RAISE NOTICE 'loicas_sanitarias_mudelar: as subcategorias já têm modelos com estes nomes ou números, diferentes dos do Excel (%) — nada a fazer.', v_txt;
    RETURN;
  END IF;

  -- ─── Configuração que tem de existir (senão: erro) ───────────────────────────
  IF v_cat_sigla IS DISTINCT FROM c_cat_sigla THEN
    RAISE EXCEPTION 'loicas_sanitarias_mudelar: a sigla de «%» é % (esperada %).', c_cat_nome, coalesce(v_cat_sigla, 'nenhuma'), c_cat_sigla;
  END IF;
  IF NOT v_cat_ativa THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: «%» está desativada.', c_cat_nome; END IF;
  -- uma irmã que não é destas quatro com uma das siglas novas: erro (não se lhe mexe)
  SELECT string_agg(c.name || ' (' || c.sigla || ')', ', ') INTO v_txt
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
    AND c.sigla IN (SELECT s.codigo FROM _lsm_subs s) AND c.id NOT IN (SELECT s.sub_id FROM _lsm_subs s);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: outras subcategorias de «%» já têm as siglas: %.', c_cat_nome, v_txt; END IF;

  SELECT m.user_id INTO v_criador
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND coalesce(m.role_is_client, false) = false
  ORDER BY m.created_at, m.user_id LIMIT 1;
  IF v_criador IS NULL THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: a Mudelar não tem um membro ativo para created_by.'; END IF;

  -- marcas: uma e ativa, cada
  FOR r IN SELECT b.nome FROM _lsm_marcas b ORDER BY b.nome LOOP
    SELECT count(*), (array_agg(x.id ORDER BY x.created_at, x.id))[1], (array_agg(coalesce(x.is_active, true) ORDER BY x.created_at, x.id))[1]
      INTO v_n, v_opc, v_ativa
    FROM brands x WHERE x.organization_id = c_org AND x.deleted_at IS NULL AND public.fn_cat_chave_opcao(x.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n <> 1 THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: a Mudelar tem % marcas «%» (tem de ter uma).', v_n, r.nome; END IF;
    IF NOT v_ativa THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: a marca «%» está desativada.', r.nome; END IF;
    UPDATE _lsm_marcas b SET id = v_opc WHERE b.nome = r.nome;
  END LOOP;

  -- atributos Cor e Tonalidade (pelo código) e os grupos de opções, que têm de ser da Mudelar
  SELECT count(*) FILTER (WHERE a.code::text = 'cor'), count(*) FILTER (WHERE a.code::text = 'tonalidade'),
         (array_agg(a.id) FILTER (WHERE a.code::text = 'cor'))[1], (array_agg(a.id) FILTER (WHERE a.code::text = 'tonalidade'))[1]
    INTO v_n, v_m, v_a_cor, v_a_ton
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL;
  IF v_n <> 1 OR v_m <> 1 THEN
    RAISE EXCEPTION 'loicas_sanitarias_mudelar: a Mudelar tem de ter um atributo cor e um tonalidade (tem % e %).', v_n, v_m;
  END IF;
  IF EXISTS (SELECT 1 FROM product_attributes a WHERE a.id IN (v_a_cor, v_a_ton) AND a.is_measurement) THEN
    RAISE EXCEPTION 'loicas_sanitarias_mudelar: cor ou tonalidade da Mudelar é uma medida.';
  END IF;
  v_g_cor := public.fn_cat_grupo_do_atributo(v_a_cor, c_org);
  v_g_ton := public.fn_cat_grupo_do_atributo(v_a_ton, c_org);
  IF NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_cor AND g.organization_id = c_org)
     OR NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_ton AND g.organization_id = c_org)
     OR v_g_cor = v_g_ton THEN
    RAISE EXCEPTION 'loicas_sanitarias_mudelar: as opções de Cor ou de Tonalidade em uso na Mudelar não são de um grupo próprio da Mudelar.';
  END IF;

  -- ─── Locks (as chaves das funções de gestão do Catálogo) ─────────────────────
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_marcas:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text, 0));
  FOR r IN SELECT s.sub_id FROM _lsm_subs s ORDER BY s.sub_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text || ':' || r.sub_id::text, 0));
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_cat:' || c_org::text || ':' || v_cat::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || v_g_cor::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || v_g_ton::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_fornecedores:' || c_org::text, 0));

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', v_criador::text, true);

  -- ─── 1. Siglas das opções de Cor e Tonalidade ────────────────────────────────
  FOR r IN SELECT o.papel, o.codigo, o.nome FROM _lsm_opcoes o ORDER BY o.papel, o.ordem LOOP
    v_grupo := (CASE WHEN r.papel = 'cor' THEN v_g_cor ELSE v_g_ton END);
    SELECT count(*), (array_agg(v.id ORDER BY v.id))[1], (array_agg(v.is_active ORDER BY v.id))[1] INTO v_n, v_opc, v_ativa
    FROM attribute_option_group_values v
    WHERE v.group_id = v_grupo AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(r.nome);
    IF v_n > 1 THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: há % opções «%» na % da Mudelar.', v_n, r.nome, r.papel; END IF;
    IF v_n = 1 AND NOT v_ativa THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: a opção «%» (%) da Mudelar está desativada.', r.nome, r.papel; END IF;
    UPDATE _lsm_opcoes o SET grupo = v_grupo, opcao_id = v_opc WHERE o.papel = r.papel AND o.codigo = r.codigo;
  END LOOP;

  -- quem já tem uma das siglas e não é uma das opções desta importação fica, por agora, sem sigla
  CREATE TEMP TABLE _lsm_deslocadas ON COMMIT DROP AS
  SELECT v.id, v.group_id, v.value_text::text AS valor, coalesce(v.display_name, v.value_text)::text AS nome, v.sigla AS sigla_antes,
         coalesce(v.sort_order, 0) AS ordem
  FROM attribute_option_group_values v JOIN _lsm_opcoes o ON o.grupo = v.group_id AND v.sigla = o.codigo
  WHERE v.id IS DISTINCT FROM o.opcao_id
    AND NOT EXISTS (SELECT 1 FROM _lsm_opcoes o2 WHERE o2.opcao_id = v.id);

  -- uma opção cuja sigla muda (deslocada, ou desta importação com outra sigla) não pode estar em uso num produto da
  -- Mudelar: o SKU desse produto deixava de ser o que a regra calcula
  SELECT string_agg(DISTINCT x.nome || ' (' || coalesce(x.sigla, '-') || ', ' || x.n || ' produtos)', '; ') INTO v_txt
  FROM (SELECT d.nome, d.sigla_antes AS sigla,
               (SELECT count(*) FROM product_attribute_values pv
                JOIN products p ON p.id = pv.product_id AND p.organization_id = c_org
                JOIN product_attributes a ON a.id = pv.attribute_id AND a.organization_id = c_org
                WHERE public.fn_cat_grupo_do_atributo(a.id, c_org) = d.group_id AND pv.value_text = d.valor) AS n
        FROM _lsm_deslocadas d
        UNION ALL
        SELECT v.value_text::text, v.sigla,
               (SELECT count(*) FROM product_attribute_values pv
                JOIN products p ON p.id = pv.product_id AND p.organization_id = c_org
                JOIN product_attributes a ON a.id = pv.attribute_id AND a.organization_id = c_org
                WHERE public.fn_cat_grupo_do_atributo(a.id, c_org) = v.group_id AND pv.value_text = v.value_text)
        FROM _lsm_opcoes o JOIN attribute_option_group_values v ON v.id = o.opcao_id
        WHERE v.sigla IS DISTINCT FROM o.codigo) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'loicas_sanitarias_mudelar: a sigla mudaria em opções já usadas em produtos da Mudelar: %', v_txt;
  END IF;

  UPDATE attribute_option_group_values v SET sigla = NULL FROM _lsm_deslocadas d WHERE v.id = d.id;
  UPDATE attribute_option_group_values v SET sigla = NULL FROM _lsm_opcoes o WHERE v.id = o.opcao_id AND v.sigla IS DISTINCT FROM o.codigo;
  UPDATE attribute_option_group_values v SET sigla = o.codigo FROM _lsm_opcoes o WHERE v.id = o.opcao_id AND v.sigla IS DISTINCT FROM o.codigo;
  -- as que faltarem criam-se no grupo da Mudelar, com a sigla e sem hex
  FOR r IN SELECT o.papel, o.codigo, o.nome, o.grupo FROM _lsm_opcoes o WHERE o.opcao_id IS NULL ORDER BY o.papel, o.ordem LOOP
    INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active, sigla)
    VALUES (r.grupo, r.nome, r.nome, NULL,
            coalesce((SELECT max(v.sort_order) FROM attribute_option_group_values v WHERE v.group_id = r.grupo), 0) + 1, true, r.codigo)
    RETURNING id INTO v_opc;
    UPDATE _lsm_opcoes o SET opcao_id = v_opc WHERE o.papel = r.papel AND o.codigo = r.codigo;
    v_criadas := v_criadas || r.nome || ' (' || r.codigo || '); ';
  END LOOP;
  UPDATE _lsm_opcoes o SET valor = v.value_text::text FROM attribute_option_group_values v WHERE v.id = o.opcao_id;
  FOR r IN SELECT d.id, d.group_id, d.nome, d.sigla_antes FROM _lsm_deslocadas d ORDER BY d.group_id, d.ordem, d.nome, d.id LOOP
    v_txt := public.fn_cat_sigla_opcao_livre(r.group_id, r.nome, r.id);
    IF v_txt IS NULL THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: sem sigla livre para a opção «%».', r.nome; END IF;
    UPDATE attribute_option_group_values v SET sigla = v_txt WHERE v.id = r.id;
    v_trocas := v_trocas || r.nome || ' ' || r.sigla_antes || '→' || v_txt || '; ';
  END LOOP;

  -- ─── 2. Siglas das 4 subcategorias (numa só instrução: nenhuma sigla nova é a antiga de outra destas) ────
  IF EXISTS (SELECT 1 FROM _lsm_subs a JOIN _lsm_subs b ON a.codigo = b.sigla_antes AND a.codigo <> b.codigo) THEN
    RAISE EXCEPTION 'loicas_sanitarias_mudelar: uma sigla nova de subcategoria é a antiga de outra (trocar em dois passos).';
  END IF;
  UPDATE product_categories c SET sigla = s.codigo FROM _lsm_subs s WHERE c.id = s.sub_id AND c.sigla IS DISTINCT FROM s.codigo;

  -- ─── 3. Os modelos, com os números do Excel ──────────────────────────────────
  SELECT count(*) FILTER (WHERE pm.is_active), count(*) INTO v_n, v_m
  FROM product_models pm WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL;
  IF v_n + c_n_modelos > c_max_modelos_ativos OR v_m + c_n_modelos > c_max_modelos_vivos THEN
    RAISE EXCEPTION 'loicas_sanitarias_mudelar: a Mudelar passaria o teto de modelos (% ativos, % vivos).', v_n, v_m;
  END IF;
  FOR r IN SELECT m.sub, m.numero, m.nome, s.sub_id FROM _lsm_modelos m JOIN _lsm_subs s ON s.codigo = m.sub ORDER BY s.ordem, m.numero LOOP
    v_mod := NULL;
    SELECT pm.id, pm.is_active INTO v_mod, v_ativa FROM product_models pm
    WHERE pm.organization_id = c_org AND pm.subcategory_id = r.sub_id AND pm.numero = r.numero AND pm.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_mod IS NOT NULL AND NOT v_ativa THEN
      RAISE EXCEPTION 'loicas_sanitarias_mudelar: o modelo % (% %) já existe e está desativado.', r.nome, r.sub, lpad(r.numero::text, 4, '0');
    END IF;
    IF v_mod IS NULL THEN
      INSERT INTO product_models (organization_id, subcategory_id, name, numero, is_active, created_by)
      VALUES (c_org, r.sub_id, r.nome, r.numero, true, v_criador)
      RETURNING id INTO v_mod;
    END IF;
    UPDATE _lsm_modelos m SET modelo_id = v_mod WHERE m.sub = r.sub AND m.numero = r.numero;
  END LOOP;

  -- ─── 4. Unidade «un» e fornecedores ──────────────────────────────────────────
  v_uom := public.fn_cat_unidade(c_org, c_unidade);
  IF v_uom IS NULL THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: sem unidade «%».', c_unidade; END IF;
  FOR r IN SELECT f.nome FROM _lsm_forn f ORDER BY f.nome LOOP
    SELECT s.id, coalesce(s.is_active, true) INTO v_sup, v_ativa FROM suppliers s
    WHERE s.organization_id = c_org AND s.deleted_at IS NULL AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(r.nome)
    ORDER BY s.created_at, s.id LIMIT 1;
    IF v_sup IS NOT NULL AND NOT v_ativa THEN
      RAISE EXCEPTION 'loicas_sanitarias_mudelar: o fornecedor «%» da Mudelar está desativado.', r.nome;
    END IF;
    IF v_sup IS NULL THEN
      INSERT INTO suppliers (organization_id, name, is_active, created_by)
      VALUES (c_org, public.fn_cat_limpar_nome(r.nome), true, v_criador)
      RETURNING id INTO v_sup;
      UPDATE _lsm_forn f SET id = v_sup, criado = true WHERE f.nome = r.nome;
      v_forn_criados := v_forn_criados || r.nome || '; ';
    ELSE
      UPDATE _lsm_forn f SET id = v_sup WHERE f.nome = r.nome;
    END IF;
  END LOOP;

  -- ─── 5. As linhas a gravar, com o SKU final (a regra de fn_cat_sku_partes, set-based) ─────────────
  CREATE TEMP TABLE _lsm_attr (id uuid PRIMARY KEY, papel text NOT NULL, sku_ordem integer, ordem integer NOT NULL, nome text NOT NULL,
                               entra boolean NOT NULL) ON COMMIT DROP;
  INSERT INTO _lsm_attr (id, papel, sku_ordem, ordem, nome, entra)
  SELECT a.id, x.papel, a.sku_ordem, coalesce(a.sort_order, 0), a.label::text, a.sku_entra
  FROM (VALUES ('cor', v_a_cor), ('tonalidade', v_a_ton)) AS x(papel, id)
  JOIN product_attributes a ON a.id = x.id;
  v_n_entra := (SELECT count(*) FROM _lsm_attr a WHERE a.entra);

  CREATE TEMP TABLE _lsm ON COMMIT DROP AS
  SELECT gen_random_uuid() AS id, l.linha, l.sub, s.sub_id, l.modelo, m.modelo_id, l.nome,
         l.cor, oc.valor AS cor_valor, oc.opcao_id AS cor_opcao, l.ton, ot.valor AS ton_valor, ot.opcao_id AS ton_opcao,
         l.custo, l.pvp, b.id AS marca_id, l.marca, f.id AS forn_id, l.fornecedor, NULL::text AS sku
  FROM _lsm_linhas l
  JOIN _lsm_subs s ON s.codigo = l.sub
  JOIN _lsm_modelos m ON m.sub = l.sub AND m.numero = l.modelo
  JOIN _lsm_marcas b ON b.nome = l.marca
  JOIN _lsm_forn f ON f.nome = l.fornecedor
  LEFT JOIN _lsm_opcoes oc ON oc.papel = 'cor' AND oc.codigo = l.cor
  LEFT JOIN _lsm_opcoes ot ON ot.papel = 'tonalidade' AND ot.codigo = l.ton;
  SELECT count(*) INTO v_n FROM _lsm;
  IF v_n <> c_total THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: % linhas a gravar em vez de %.', v_n, c_total; END IF;
  IF EXISTS (SELECT 1 FROM _lsm b WHERE b.modelo_id IS NULL OR b.marca_id IS NULL OR b.forn_id IS NULL
             OR (b.cor IS NOT NULL AND (b.cor_opcao IS NULL OR b.cor_valor IS NULL))
             OR (b.ton IS NOT NULL AND (b.ton_opcao IS NULL OR b.ton_valor IS NULL))) THEN
    RAISE EXCEPTION 'loicas_sanitarias_mudelar: há linhas sem modelo, marca, fornecedor ou opção resolvidos.';
  END IF;

  -- CAT-SUB-NNNN-<um segmento por atributo que entra e que o produto tem, por sku_ordem NULLS LAST, sort_order, nome, id>
  UPDATE _lsm b SET sku = concat_ws('-', v_cat_sigla, b.sub, lpad(b.modelo::text, 4, '0'),
    (SELECT nullif(string_agg(s.seg, '-' ORDER BY a.sku_ordem NULLS LAST, a.ordem, a.nome, a.id) FILTER (WHERE a.entra AND s.seg IS NOT NULL), '')
     FROM (VALUES ('cor', b.cor), ('tonalidade', b.ton)) AS s(papel, seg)
     JOIN _lsm_attr a ON a.papel = s.papel));

  SELECT string_agg(x.sku || ' ×' || x.n || ' (' || x.nomes || ')', '; ') INTO v_txt
  FROM (SELECT b.sku, count(*) AS n, string_agg(b.nome, ' | ' ORDER BY b.linha) AS nomes FROM _lsm b
        GROUP BY b.sku HAVING count(*) > 1 ORDER BY b.sku LIMIT 10) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: SKUs repetidos: %', v_txt; END IF;
  SELECT string_agg(b.sku || ' (' || p.name || ')', '; ') INTO v_txt
  FROM (SELECT b2.sku FROM _lsm b2 JOIN products p2 ON p2.organization_id = c_org AND p2.sku = b2.sku ORDER BY b2.sku LIMIT 10) b
  JOIN products p ON p.organization_id = c_org AND p.sku = b.sku;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'loicas_sanitarias_mudelar: SKUs já usados noutros produtos da Mudelar: %', v_txt; END IF;
  v_regex := '^' || v_cat_sigla || '-(' || (SELECT string_agg(s.codigo, '|' ORDER BY s.ordem) FROM _lsm_subs s) || ')-[0-9]{4}'
             || '(-[A-Z0-9]+){0,' || v_n_entra || '}$';
  IF EXISTS (SELECT 1 FROM _lsm b WHERE b.sku !~ v_regex) THEN
    RAISE EXCEPTION 'loicas_sanitarias_mudelar: SKU fora do formato (ex.: %).', (SELECT b.sku FROM _lsm b WHERE b.sku !~ v_regex LIMIT 1);
  END IF;

  -- ─── 6. Gravar (auditoria normal, linha a linha) ─────────────────────────────
  INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                        manages_stock, created_by, tipo_catalogo, category_id, subcategory_id, model_id, brand_id, uom_id,
                        supplier_id, fornecedor_livre, sku_gerado)
  SELECT b.id, c_org, b.sku, b.nome, 'active'::product_status, true, true, true, false, false,
         true, v_criador, 'produto', v_cat, b.sub_id, b.modelo_id, b.marca_id, v_uom,
         b.forn_id, public.fn_cat_limpar_nome(b.fornecedor), true
  FROM _lsm b ORDER BY b.linha;

  INSERT INTO product_organizations (product_id, organization_id, created_by)
  SELECT b.id, c_org, v_criador FROM _lsm b ORDER BY b.linha;

  INSERT INTO product_prices (product_id, currency, price, preco_exato, valid_from, created_by, price_type, vat_rate)
  SELECT b.id, 'EUR'::currency_code, round(b.custo, 2), round(b.custo, 6), v_agora, v_criador, 'purchase'::price_type, c_iva
  FROM _lsm b
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.pvp, 2), NULL::numeric, v_agora + interval '1 microsecond', v_criador, 'retail'::price_type, c_iva
  FROM _lsm b;

  -- como cat_guardar_produto_atributos: opção = value_text da opção; só os atributos que o nome indica
  INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_json, unit)
  SELECT b.id, v_a_cor, b.cor_valor, NULL::jsonb, NULL::text FROM _lsm b WHERE b.cor IS NOT NULL
  UNION ALL
  SELECT b.id, v_a_ton, b.ton_valor, NULL::jsonb, NULL::text FROM _lsm b WHERE b.ton IS NOT NULL;

  INSERT INTO item_suppliers (organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price, currency,
                              is_preferred, is_active, created_by, preco_data)
  SELECT c_org, 'product', b.id, b.forn_id, NULL, b.sku, round(b.custo, 2), 'EUR', true, true, v_criador, current_date
  FROM _lsm b ORDER BY b.linha;

  -- ─── 7. Conferir ──────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _lsm_subs s) AND NOT p.is_deleted;
  IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: % produtos nas subcategorias em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(s.nome || ' ' || coalesce(x.n, 0) || ' em vez de ' || s.esperados, '; ') INTO v_txt
  FROM _lsm_subs s
  LEFT JOIN (SELECT p.subcategory_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.subcategory_id) x ON x.subcategory_id = s.sub_id
  WHERE coalesce(x.n, 0) <> s.esperados;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: contagem por subcategoria errada: %', v_txt; END IF;
  SELECT string_agg(m.sub || lpad(m.numero::text, 4, '0') || ' ' || coalesce(x.n, 0) || ' em vez de ' || m.esperados, '; ') INTO v_txt
  FROM _lsm_modelos m
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.model_id) x ON x.model_id = m.modelo_id
  WHERE coalesce(x.n, 0) <> m.esperados;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: contagem por modelo errada: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM product_models pm JOIN _lsm_modelos m ON m.modelo_id = pm.id JOIN _lsm_subs s ON s.codigo = m.sub
  WHERE pm.organization_id = c_org AND pm.subcategory_id = s.sub_id AND pm.deleted_at IS NULL AND pm.is_active
    AND pm.numero = m.numero AND pm.name = m.nome;
  SELECT count(*) INTO v_m FROM product_models pm
  WHERE pm.organization_id = c_org AND pm.subcategory_id IN (SELECT s.sub_id FROM _lsm_subs s);
  IF v_n <> c_n_modelos OR v_m <> c_n_modelos THEN
    RAISE EXCEPTION 'Conferir: % modelos certos e % nas subcategorias, em vez de %.', v_n, v_m, c_n_modelos;
  END IF;

  -- cada produto como a sua linha do Excel; conta os que NÃO batem (NOT coalesce(…, false): uma comparação NULL também falha)
  SELECT count(*) INTO v_n
  FROM _lsm b
  JOIN products p ON p.id = b.id
  LEFT JOIN product_attribute_values vc ON vc.product_id = b.id AND vc.attribute_id = v_a_cor
  LEFT JOIN product_attribute_values vt ON vt.product_id = b.id AND vt.attribute_id = v_a_ton
  LEFT JOIN product_prices pc ON pc.product_id = b.id AND pc.price_type = 'purchase'
  LEFT JOIN product_prices pv ON pv.product_id = b.id AND pv.price_type = 'retail'
  LEFT JOIN item_suppliers i ON i.product_id = b.id AND i.deleted_at IS NULL
  WHERE NOT coalesce(p.organization_id = c_org AND p.name = b.nome AND p.sku = b.sku AND p.sku_gerado AND p.model_id = b.modelo_id
        AND p.category_id = v_cat AND p.subcategory_id = b.sub_id AND p.brand_id = b.marca_id AND p.marca_livre = b.marca
        AND p.uom_id = v_uom AND p.unidade = c_unidade AND p.status = 'active'::product_status AND p.tipo_catalogo = 'produto'
        AND p.manages_stock AND p.is_active AND NOT p.is_deleted AND p.supplier_id = b.forn_id
        AND p.fornecedor_livre = public.fn_cat_limpar_nome(b.fornecedor)
        AND vc.value_text IS NOT DISTINCT FROM b.cor_valor AND vt.value_text IS NOT DISTINCT FROM b.ton_valor
        AND pc.price = round(b.custo, 2) AND pc.preco_exato = round(b.custo, 6) AND pc.vat_rate = c_iva
        AND pv.price = round(b.pvp, 2) AND pv.vat_rate = c_iva
        AND i.supplier_id = b.forn_id AND i.is_preferred AND i.is_active AND i.purchase_price = round(b.custo, 2) AND i.supplier_sku = p.sku,
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos não ficaram como a linha do Excel.', v_n; END IF;
  -- nem linhas a mais: os valores de atributos que o nome indica, 2 preços, 1 fornecedor e 1 product_organizations por produto
  SELECT (SELECT count(*) FROM product_attribute_values v JOIN _lsm b ON b.id = v.product_id),
         (SELECT count(*) FILTER (WHERE b.cor IS NOT NULL) + count(*) FILTER (WHERE b.ton IS NOT NULL) FROM _lsm b),
         (SELECT count(*) FROM product_prices x JOIN _lsm b ON b.id = x.product_id)
    INTO v_n, v_k, v_m;
  IF v_n <> v_k OR v_m <> 2 * c_total THEN
    RAISE EXCEPTION 'Conferir: % valores de atributos (esperados %) e % preços (esperados %).', v_n, v_k, v_m, 2 * c_total;
  END IF;
  SELECT (SELECT count(*) FROM item_suppliers x JOIN _lsm b ON b.id = x.product_id),
         (SELECT count(*) FROM product_organizations x JOIN _lsm b ON b.id = x.product_id)
    INTO v_n, v_m;
  IF v_n <> c_total OR v_m <> c_total THEN
    RAISE EXCEPTION 'Conferir: % ligações a fornecedor e % product_organizations (esperados %).', v_n, v_m, c_total;
  END IF;

  -- SKUs: únicos, no formato, e iguais ao que a regra do Catálogo calcula a partir do que ficou gravado (todos)
  SELECT count(*), count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ v_regex) INTO v_n, v_m, v_k
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _lsm_subs s) AND NOT p.is_deleted;
  IF v_m <> c_total OR v_n <> c_total THEN RAISE EXCEPTION 'Conferir: SKUs não únicos (% distintos em %).', v_m, v_n; END IF;
  IF v_k > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs fora do formato %.', v_k, v_regex; END IF;
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
          WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _lsm_subs s) AND NOT p.is_deleted) x
        WHERE x.calc IS DISTINCT FROM x.sku OR x.prefixo IS NULL OR x.faltas <> '[]') y;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs diferentes do recalculado pela regra do Catálogo (ex.: %).', v_n, v_txt; END IF;

  -- todos com cat_prever_sku_modelo, como um membro da Mudelar com products.edit (só leitura; claims locais)
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE NOTICE 'loicas_sanitarias_mudelar: sem membro da Mudelar com products.edit — a comparação com cat_prever_sku_modelo ficou por fazer (o recálculo de todos foi feito).';
  ELSE
    v_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    v_n := 0;
    FOR r IN SELECT b.id, b.sku, b.sub_id, b.modelo_id, b.cor_opcao, b.ton_opcao FROM _lsm b ORDER BY b.linha LOOP
      v_attrs := '[]'::jsonb;
      IF r.cor_opcao IS NOT NULL THEN v_attrs := v_attrs || jsonb_build_array(jsonb_build_object('atributo', v_a_cor, 'opcao', r.cor_opcao)); END IF;
      IF r.ton_opcao IS NOT NULL THEN v_attrs := v_attrs || jsonb_build_array(jsonb_build_object('atributo', v_a_ton, 'opcao', r.ton_opcao)); END IF;
      v_prev := public.cat_prever_sku_modelo(c_org, v_cat, r.sub_id, r.modelo_id, v_attrs, r.id);
      IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Conferir: cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
      END IF;
      v_n := v_n + 1;
    END LOOP;
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: só % de % comparados com cat_prever_sku_modelo.', v_n, c_total; END IF;
  END IF;

  -- as siglas: opções e subcategorias
  SELECT count(*) INTO v_n FROM _lsm_opcoes o JOIN attribute_option_group_values v ON v.id = o.opcao_id AND v.group_id = o.grupo
  WHERE v.sigla = o.codigo AND v.is_active;
  IF v_n <> (SELECT count(*) FROM _lsm_opcoes) THEN
    RAISE EXCEPTION 'Conferir: só % das % opções ficaram com a sigla certa.', v_n, (SELECT count(*) FROM _lsm_opcoes);
  END IF;
  SELECT count(*) INTO v_n FROM _lsm_subs s JOIN product_categories c ON c.id = s.sub_id WHERE c.sigla = s.codigo AND c.parent_id = v_cat;
  IF v_n <> (SELECT count(*) FROM _lsm_subs) THEN RAISE EXCEPTION 'Conferir: só % das 4 subcategorias ficaram com a sigla do Excel.', v_n; END IF;

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
  IF NOT EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND p.xmin::text = v_xid
                 AND p.subcategory_id IN (SELECT s.sub_id FROM _lsm_subs s)) THEN
    RAISE EXCEPTION 'Conferir: os produtos importados não têm o xmin desta transação: a verificação de «nada fora da Mudelar» não vale.';
  END IF;

  RAISE NOTICE 'loicas_sanitarias_mudelar: % produtos em «%» (% modelos, SKU %-SUB-NNNN-…). Fornecedores criados: %. Siglas trocadas: %. Opções criadas: %. Conferido.',
    c_total, c_cat_nome, c_n_modelos, v_cat_sigla, coalesce(nullif(v_forn_criados, ''), 'nenhum'),
    coalesce(nullif(v_trocas, ''), 'nenhuma'), coalesce(nullif(v_criadas, ''), 'nenhuma');
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
