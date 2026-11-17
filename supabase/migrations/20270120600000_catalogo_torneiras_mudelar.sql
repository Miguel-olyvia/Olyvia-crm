-- =============================================================================
-- Catálogo — importação das TORNEIRAS & MISTURADORAS da MUDELAR (Excel do utilizador
-- cd143172-Torneiras__Misturadoras_Rev1.xlsx, folha «Folha1», 281 linhas, todas active).
-- Base de RH (uetjghdkwbywbftedtth). Ficheiro GERADO por script (gerar.cjs + montar.cjs) a partir do Excel: as linhas
-- de dados abaixo não se editam à mão — regeneram-se. Molde: 20270120100000 (colunas de duche).
-- =============================================================================
--
-- Decisões do utilizador (17/11):
--   * Categoria «Torneiras & Misturadoras» (TM), com as 11 subcategorias do Excel. As 11 já existem na Mudelar (com
--     acentos: «Torneira Lavatório», «Torneira Bidé», «Torneira Pé Alto», «… Abatível», «… Extraível», «… Giratória»),
--     e reutilizam-se pelo nome sem acentos; se alguma faltar, cria-se com a sigla de baixo.
--   * Produto = modelo + Cor + Acabamento; 281 produtos. Sem medida. Estado active, exceto os sem preço de venda
--     (regra do utilizador, 17/11: sem preço de venda → draft): as 12 SOPHIE entram em draft.
--   * Modelo = as palavras em maiúsculas depois do tipo (SIRIO, HELIOS, MARRIOT, IONY, DIOR, CASSIO, RHIO, TARSIO, NOAH,
--     ROUND, ALEXIA, SMOOTH, GRANADA); nas Marti 1921 com a edição: «CIRA Metal Edition», «CIRA Silicone Edition»,
--     «SOPHIE Pastel Edition», «SOPHIE Metal Edition». 54 modelos (o mesmo nome em subcategorias diferentes é outro
--     modelo); NNNN = a ordem da primeira linha de cada modelo na subcategoria (o SKU antigo não se guarda).
--   * Cor ≠ Acabamento. Cor = o que se vê; Acabamento = Cromado, Escovado, Mate, PVD (opções novas do atributo
--     «Acabamento» que já existe; procuradas pelo nome primeiro — a correção 20270120500000 cria as mesmas).
--     Cromo/Cromado → só Acabamento Cromado; Negro → Preto; Preto Mate/Negro Mate → Preto + Mate; Blanco → Branco;
--     Branco Mate → Branco + Mate; Oro → Dourado; Dourado Escovado/Oro Cepillado → Dourado + Escovado; Niquel → Níquel;
--     Niquel Escovado/Cepillado → Níquel + Escovado; Titanio, Gun Metal, Cobre, Rosa Gold, Grafite, Inox → a própria
--     cor (Rosa Gold Escovado → Rosa Gold + Escovado); Acero Oro PVD → Dourado + PVD; Blanco/Cromo → Branco + Cromado;
--     Cromo/Negro e Cromo Negro → Preto + Cromado; as outras duplas são uma opção de Cor (Escovado se tiverem
--     Cepillado); as cores pastel da SOPHIE ficam como vêm.
--   * Marcas GME, Marti 1921 e Rubicer (as que existem). Fornecedores: Anlorbel = o que já existe («ANLORBEL COMERCIO
--     MATERIAIS CONSTRUCAO E DECORACAO»), «RUBICER, Lda.» (existe) e «SAN CARLO LUXURY BATHROOM S.L.» (criado se faltar).
--   * Código do fornecedor na ligação (item_suppliers.supplier_sku), EXCETO nos RHIO e TARSIO (50 produtos; os códigos
--     repetem-se entre os dois modelos): nesses a ligação fica com o SKU novo.
--   * SOPHIE (12): preço 0 no Excel → « (sem preço)» no nome, estado draft, sem product_prices, ligação sem preço.
--   * Nome = o do Excel sem «(cod. GN)»; o resto fica como vem. Preço Compra vem como texto com vírgula: convertido e
--     arredondado a 2 casas; PVP = Preço Venda; IVA 23; Desconto 1/2 ignorados; Grossista/Distribuidor = 0 (não se gravam).
--     As notas da coluna Atributos não vão para o produto.
--
-- Decisões desta migration (a confirmar pelo utilizador):
--   * Opções de Cor reutilizadas pelo nome sem acentos/maiúsculas: Preto («Preto», P), Branco («Branco», B), Dourado
--     («Dourado», D), Níquel («NIQUEL», NQ), Titânio («TITANIO», TT), Cobre, Inox, Gun Metal, Rosa Gold. A Mudelar tem
--     também NEGRO (1431 produtos), BLANCO (796) e ORO (300): todas têm produtos; usa-se a que tem o nome da regra
--     (Preto/Branco/Dourado).
--   * «Acero» sozinho (IONY, NOAH, ROUND; o Excel diz «Corpo em Aço Inox») → Cor Inox (a opção com produtos; ACERO
--     existe sem nenhum). Com outra cor («Acero Negro Mate», «Acero Cobre PVD»…) o Acero cai e fica a outra cor.
--   * Duplas traduzidas como as simples: Negro/Rojo → «Preto/Vermelho», Niquel Cepillado/Negro → «Níquel/Preto» +
--     Escovado, Niquel Cepillado/Blanco → «Níquel/Branco» + Escovado, Oro/Negro → «Dourado/Preto», Oro/Blanco →
--     «Dourado/Branco».
--   * Siglas novas do Acabamento: Cromado CRD, Escovado ESC, Mate MAT, PVD PVD (não repetem siglas da Cor; se a sigla
--     estiver ocupada no Acabamento, a sugestão livre). Cores novas: sigla livre (fn_cat_sigla_opcao_livre).
--   * Auditoria normal, linha a linha, com app.audit_source = 'migration:catalogo_torneiras_mudelar'. Escrita só na Mudelar.
--
-- GUARDA (inerte: RAISE NOTICE e sai sem escrever nada) se: a organização 3242e925-… não existir com o nome 'Mudelar';
-- faltar a versão dos modelos (20270118300000); faltar «Torneiras & Misturadoras»; já estiver aplicada (os 281 produtos
-- com os nomes do Excel já existem); as subcategorias já tiverem produtos que não são estes; ou já houver modelos com
-- estes nomes/números que não sejam exatamente os desta importação.
-- Falha (RAISE EXCEPTION, nada fica) se: só uma parte dos produtos já existir; faltar marca, atributo cor/acabamento ou
-- membro para created_by; uma opção estiver ambígua ou desativada; um fornecedor estiver desativado; uma subcategoria
-- tiver outra sigla; o SKU calculado tiver faltas, for repetido (diz quais) ou já usado noutro produto da Mudelar.
-- Idempotente e independente: procura sempre pelo nome antes de criar (subcategorias, opções de Cor e de Acabamento,
-- modelos, fornecedores), por isso pode ser aplicada antes ou depois das outras importações do Catálogo.
--
-- Conferir no fim (conta o que está ERRADO e faz RAISE se não for 0): 281 produtos e a contagem por modelo; os 54
-- modelos; cada produto como a linha do Excel (nome, SKU, modelo, marca, fornecedor, código do fornecedor, estado,
-- unidade, custo, PVP, Cor, Acabamento e só esses); nem linhas a mais; SKUs únicos, no formato, iguais ao recalculado e a
-- cat_prever_sku_modelo (todos); nada escrito fora da Mudelar nem noutros produtos dela (xmin).
--
-- ORDEM: depois de 20270118300000 (modelos). Pode correr antes ou depois de 20270120500000 (Cor ≠ Acabamento).
-- Teste: supabase/tests/catalogo_torneiras_mudelar.test.sql (BEGIN … ROLLBACK, só leitura; o passo 0 falha antes).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '10min';

DO $mig$
DECLARE
  c_org         constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte       constant text    := 'migration:catalogo_torneiras_mudelar';
  c_total       constant integer := 281;
  c_n_modelos   constant integer := 54;
  c_n_com_preco constant integer := 269;
  c_n_sem_cod   constant integer := 50;
  c_n_cor       constant integer := 231;
  c_n_acab      constant integer := 77;
  c_iva         constant numeric := 23;
  c_cat_nome    constant text    := 'Torneiras & Misturadoras';
  c_cat_sigla   constant text    := 'TM';
  c_unidade     constant text    := 'un';
  c_max_modelos_ativos constant integer := 2000;
  c_max_modelos_vivos  constant integer := 10000;
  v_agora   timestamptz := clock_timestamp();
  v_n bigint; v_m bigint; v_k bigint; v_xid text; v_txt text; v_nome text; v_criadas text := ''; v_forn_criados text := '';
  v_subs_criadas text := '';
  v_cat uuid; v_cat_sigla text; v_cat_ativa boolean; v_cat_path text; v_sub uuid; v_sub_sigla text; v_sub_ativa boolean;
  v_uom uuid; v_criador uuid; v_a_cor uuid; v_a_acab uuid; v_g_cor uuid; v_g_acab uuid;
  v_opc uuid; v_ativa boolean; v_mod uuid; v_regex text; v_auth uuid; v_claims text; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  -- ─── 0. Guarda (inerte) ───────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'catalogo_torneiras_mudelar: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  IF to_regclass('public.product_models') IS NULL
     OR to_regprocedure('public.fn_cat_modelo_numero(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)') IS NULL THEN
    RAISE NOTICE 'catalogo_torneiras_mudelar: falta a versão dos modelos (20270118300000) — nada a fazer.';
    RETURN;
  END IF;
  SELECT string_agg(s, ', ') INTO v_txt
  FROM unnest(ARRAY['public.fn_cat_chave_opcao(text)', 'public.fn_cat_limpar_nome(text)',
                    'public.fn_cat_grupo_do_atributo(uuid,uuid)', 'public.fn_cat_medida_ler(jsonb,text)',
                    'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)',
                    'public.fn_cat_sigla_opcao_livre(uuid,text,uuid)', 'public.fn_cat_unidade(uuid,text)',
                    'public.has_anew_permission_in_org(uuid,text,uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: faltam funções do Catálogo (%).', v_txt; END IF;

  -- categoria
  SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(c.sigla ORDER BY c.created_at, c.id))[1],
         (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1], (array_agg(c.path ORDER BY c.created_at, c.id))[1]
    INTO v_n, v_cat, v_cat_sigla, v_cat_ativa, v_cat_path
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(c_cat_nome);
  IF v_n = 0 THEN
    RAISE NOTICE 'catalogo_torneiras_mudelar: a Mudelar não tem a categoria «%» — nada a fazer.', c_cat_nome;
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'catalogo_torneiras_mudelar: há % categorias «%» na Mudelar.', v_n, c_cat_nome;
  END IF;
  IF v_cat_sigla IS DISTINCT FROM c_cat_sigla OR NOT v_cat_ativa THEN
    RAISE EXCEPTION 'catalogo_torneiras_mudelar: «%» tem a sigla «%» (esperada %) ou está desativada.', c_cat_nome, v_cat_sigla, c_cat_sigla;
  END IF;

  -- ─── Os dados do Excel (gerados) ──────────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._tm_subs, pg_temp._tm_modelos, pg_temp._tm_opcoes, pg_temp._tm_marcas, pg_temp._tm_forn,
                       pg_temp._tm_linhas, pg_temp._tm_b, pg_temp._tm, pg_temp._tm_ja;

  CREATE TEMP TABLE _tm_subs (nome text PRIMARY KEY, sigla text NOT NULL, ordem integer NOT NULL, sub_id uuid, criada boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _tm_subs (nome, sigla, ordem) VALUES
    ('Torneira Lavatorio', 'TL', 1),
    ('Torneira Pe Alto', 'TPA', 2),
    ('Torneira Bide', 'TBD', 3),
    ('Torneira Banheira', 'TB', 4),
    ('Torneira Encastre', 'TE', 5),
    ('Torneira Duche', 'TD', 6),
    ('Misturadoras Monocomando', 'MM', 7),
    ('Misturadoras Monocomando Abativel', 'MMA', 8),
    ('Misturadoras Monocomando Extraivel', 'MME', 9),
    ('Misturadoras Monocomando Flexivel', 'MMF', 10),
    ('Misturadoras Monocomando Giratoria', 'MMG', 11);

  -- os modelos: subcategoria, número (NNNN do SKU, pela ordem da primeira linha), nome, quantos produtos tem
  CREATE TEMP TABLE _tm_modelos (sub text NOT NULL, numero smallint NOT NULL, nome text NOT NULL, esperados integer NOT NULL,
                                modelo_id uuid, PRIMARY KEY (sub, numero)) ON COMMIT DROP;
  INSERT INTO _tm_modelos (sub, numero, nome, esperados) VALUES
    ('Torneira Lavatorio', 1, 'SIRIO', 7),
    ('Torneira Pe Alto', 1, 'SIRIO', 7),
    ('Torneira Bide', 1, 'SIRIO', 7),
    ('Torneira Banheira', 1, 'SIRIO', 7),
    ('Torneira Encastre', 1, 'SIRIO', 7),
    ('Torneira Duche', 1, 'SIRIO', 7),
    ('Torneira Lavatorio', 2, 'HELIOS', 7),
    ('Torneira Pe Alto', 2, 'HELIOS', 7),
    ('Torneira Bide', 2, 'HELIOS', 7),
    ('Torneira Banheira', 2, 'HELIOS', 7),
    ('Torneira Duche', 2, 'HELIOS', 7),
    ('Torneira Lavatorio', 3, 'MARRIOT', 7),
    ('Torneira Pe Alto', 3, 'MARRIOT', 7),
    ('Torneira Bide', 3, 'MARRIOT', 7),
    ('Torneira Banheira', 3, 'MARRIOT', 7),
    ('Torneira Encastre', 2, 'MARRIOT', 7),
    ('Torneira Duche', 3, 'MARRIOT', 7),
    ('Torneira Lavatorio', 4, 'IONY', 3),
    ('Torneira Pe Alto', 4, 'IONY', 3),
    ('Torneira Bide', 4, 'IONY', 3),
    ('Torneira Banheira', 4, 'IONY', 3),
    ('Torneira Duche', 4, 'IONY', 3),
    ('Torneira Lavatorio', 5, 'DIOR', 3),
    ('Torneira Pe Alto', 5, 'DIOR', 3),
    ('Torneira Bide', 5, 'DIOR', 3),
    ('Torneira Banheira', 5, 'DIOR', 3),
    ('Torneira Duche', 5, 'DIOR', 3),
    ('Torneira Lavatorio', 6, 'CASSIO', 5),
    ('Torneira Pe Alto', 6, 'CASSIO', 5),
    ('Torneira Bide', 6, 'CASSIO', 5),
    ('Torneira Banheira', 6, 'CASSIO', 5),
    ('Torneira Encastre', 3, 'CASSIO', 3),
    ('Torneira Duche', 6, 'CASSIO', 5),
    ('Torneira Lavatorio', 7, 'RHIO', 5),
    ('Torneira Pe Alto', 7, 'RHIO', 5),
    ('Torneira Bide', 7, 'RHIO', 5),
    ('Torneira Banheira', 7, 'RHIO', 5),
    ('Torneira Duche', 7, 'RHIO', 5),
    ('Torneira Lavatorio', 8, 'TARSIO', 5),
    ('Torneira Pe Alto', 8, 'TARSIO', 5),
    ('Torneira Bide', 8, 'TARSIO', 5),
    ('Torneira Banheira', 8, 'TARSIO', 5),
    ('Torneira Duche', 8, 'TARSIO', 5),
    ('Torneira Banheira', 9, 'SMOOTH', 7),
    ('Misturadoras Monocomando Extraivel', 1, 'SMOOTH', 7),
    ('Misturadoras Monocomando', 1, 'NOAH', 5),
    ('Misturadoras Monocomando Extraivel', 2, 'ROUND', 6),
    ('Misturadoras Monocomando Abativel', 1, 'ALEXIA', 1),
    ('Misturadoras Monocomando Flexivel', 1, 'CIRA Metal Edition', 4),
    ('Misturadoras Monocomando Flexivel', 2, 'CIRA Silicone Edition', 8),
    ('Misturadoras Monocomando Abativel', 2, 'GRANADA', 3),
    ('Misturadoras Monocomando Extraivel', 3, 'GRANADA', 1),
    ('Misturadoras Monocomando Giratoria', 1, 'SOPHIE Pastel Edition', 8),
    ('Misturadoras Monocomando Giratoria', 2, 'SOPHIE Metal Edition', 4);

  -- as opções de Cor e de Acabamento que os produtos usam (procuradas pelo nome sem acentos/maiúsculas; criadas se faltarem)
  CREATE TEMP TABLE _tm_opcoes (papel text NOT NULL, nome text NOT NULL, sigla_pref text, ordem integer NOT NULL, grupo uuid,
                               opcao_id uuid, valor text, sigla text, criada boolean NOT NULL DEFAULT false, PRIMARY KEY (papel, nome)) ON COMMIT DROP;
  INSERT INTO _tm_opcoes (papel, nome, sigla_pref, ordem) VALUES
    ('cor', 'Preto', NULL, 1),
    ('cor', 'Dourado', NULL, 2),
    ('cor', 'Níquel', NULL, 3),
    ('cor', 'Titânio', NULL, 4),
    ('cor', 'Cobre', NULL, 5),
    ('cor', 'Branco', NULL, 6),
    ('cor', 'Inox', NULL, 7),
    ('cor', 'Gun Metal', NULL, 8),
    ('cor', 'Rosa Gold', NULL, 9),
    ('cor', 'Preto/Vermelho', NULL, 10),
    ('cor', 'Níquel/Preto', NULL, 11),
    ('cor', 'Níquel/Branco', NULL, 12),
    ('cor', 'Dourado/Preto', NULL, 13),
    ('cor', 'Dourado/Branco', NULL, 14),
    ('cor', 'Amarillo Arena', NULL, 15),
    ('cor', 'Rojo Beige', NULL, 16),
    ('cor', 'Violeta Pastel', NULL, 17),
    ('cor', 'Azul Colombino', NULL, 18),
    ('cor', 'Gris Guijarro', NULL, 19),
    ('cor', 'Verde Reseda', NULL, 20),
    ('cor', 'Turquesa Pastel', NULL, 21),
    ('cor', 'Blanco Crema', NULL, 22),
    ('cor', 'Grafite', NULL, 23),
    ('acabamento', 'Cromado', 'CRD', 1),
    ('acabamento', 'Escovado', 'ESC', 2),
    ('acabamento', 'Mate', 'MAT', 3),
    ('acabamento', 'PVD', 'PVD', 4);

  -- as 281 linhas do Excel, pela ordem do Excel (linha = a linha da folha)
  CREATE TEMP TABLE _tm_linhas (linha integer PRIMARY KEY, sub text NOT NULL, modelo smallint NOT NULL, nome text NOT NULL,
                               marca text NOT NULL, forn text NOT NULL, cod text, custo numeric, pvp numeric,
                               cor text, acab text, status text NOT NULL) ON COMMIT DROP;
  INSERT INTO _tm_linhas (linha, sub, modelo, nome, marca, forn, cod, custo, pvp, cor, acab, status) VALUES
    (2, 'Torneira Lavatorio', 1, 'Torneira de Lavatorio SIRIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170', 35.40, 59.00, NULL::text, 'Cromado', 'active'),
    (3, 'Torneira Lavatorio', 1, 'Torneira de Lavatorio SIRIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170NG', 41.40, 69.00, 'Preto', NULL::text, 'active'),
    (4, 'Torneira Lavatorio', 1, 'Torneira de Lavatorio SIRIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170OR', 43.80, 73.00, 'Dourado', NULL::text, 'active'),
    (5, 'Torneira Lavatorio', 1, 'Torneira de Lavatorio SIRIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170NK', 43.80, 73.00, 'Níquel', NULL::text, 'active'),
    (6, 'Torneira Lavatorio', 1, 'Torneira de Lavatorio SIRIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170T', 43.80, 73.00, 'Titânio', NULL::text, 'active'),
    (7, 'Torneira Lavatorio', 1, 'Torneira de Lavatorio SIRIO Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170CB', 43.80, 73.00, 'Cobre', NULL::text, 'active'),
    (8, 'Torneira Lavatorio', 1, 'Torneira de Lavatorio SIRIO Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170BL', 43.80, 73.00, 'Branco', NULL::text, 'active'),
    (9, 'Torneira Pe Alto', 1, 'Torneira de Pe Alto SIRIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172', 57.00, 95.00, NULL::text, 'Cromado', 'active'),
    (10, 'Torneira Pe Alto', 1, 'Torneira de Pe Alto SIRIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172NG', 65.40, 109.00, 'Preto', NULL::text, 'active'),
    (11, 'Torneira Pe Alto', 1, 'Torneira de Pe Alto SIRIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172OR', 71.40, 119.00, 'Dourado', NULL::text, 'active'),
    (12, 'Torneira Pe Alto', 1, 'Torneira de Pe Alto SIRIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172NK', 71.40, 119.00, 'Níquel', NULL::text, 'active'),
    (13, 'Torneira Pe Alto', 1, 'Torneira de Pe Alto SIRIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172T', 71.40, 119.00, 'Titânio', NULL::text, 'active'),
    (14, 'Torneira Pe Alto', 1, 'Torneira de Pe Alto SIRIO Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172CB', 71.40, 119.00, 'Cobre', NULL::text, 'active'),
    (15, 'Torneira Pe Alto', 1, 'Torneira de Pe Alto SIRIO Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172BL', 71.40, 119.00, 'Branco', NULL::text, 'active'),
    (16, 'Torneira Bide', 1, 'Torneira de Bide SIRIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171', 35.40, 59.00, NULL::text, 'Cromado', 'active'),
    (17, 'Torneira Bide', 1, 'Torneira de Bide SIRIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171NG', 41.40, 69.00, 'Preto', NULL::text, 'active'),
    (18, 'Torneira Bide', 1, 'Torneira de Bide SIRIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171OR', 43.80, 73.00, 'Dourado', NULL::text, 'active'),
    (19, 'Torneira Bide', 1, 'Torneira de Bide SIRIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171NK', 43.80, 73.00, 'Níquel', NULL::text, 'active'),
    (20, 'Torneira Bide', 1, 'Torneira de Bide SIRIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171T', 43.80, 73.00, 'Titânio', NULL::text, 'active'),
    (21, 'Torneira Bide', 1, 'Torneira de Bide SIRIO Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171CB', 43.80, 73.00, 'Cobre', NULL::text, 'active'),
    (22, 'Torneira Bide', 1, 'Torneira de Bide SIRIO Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171BL', 43.80, 73.00, 'Branco', NULL::text, 'active'),
    (23, 'Torneira Banheira', 1, 'Torneira de Banheira SIRIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173', 83.40, 139.00, NULL::text, 'Cromado', 'active'),
    (24, 'Torneira Banheira', 1, 'Torneira de Banheira SIRIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173NG', 101.40, 169.00, 'Preto', NULL::text, 'active'),
    (25, 'Torneira Banheira', 1, 'Torneira de Banheira SIRIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173OR', 113.40, 189.00, 'Dourado', NULL::text, 'active'),
    (26, 'Torneira Banheira', 1, 'Torneira de Banheira SIRIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173NK', 113.40, 189.00, 'Níquel', NULL::text, 'active'),
    (27, 'Torneira Banheira', 1, 'Torneira de Banheira SIRIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173T', 113.40, 189.00, 'Titânio', NULL::text, 'active'),
    (28, 'Torneira Banheira', 1, 'Torneira de Banheira SIRIO Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173CB', 113.40, 189.00, 'Cobre', NULL::text, 'active'),
    (29, 'Torneira Banheira', 1, 'Torneira de Banheira SIRIO Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173BL', 113.40, 189.00, 'Branco', NULL::text, 'active'),
    (30, 'Torneira Encastre', 1, 'Torneira de Encastre SIRIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190', 48.60, 81.00, NULL::text, 'Cromado', 'active'),
    (31, 'Torneira Encastre', 1, 'Torneira de Encastre SIRIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190NG', 53.40, 89.00, 'Preto', NULL::text, 'active'),
    (32, 'Torneira Encastre', 1, 'Torneira de Encastre SIRIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190OR', 61.20, 102.00, 'Dourado', NULL::text, 'active'),
    (33, 'Torneira Encastre', 1, 'Torneira de Encastre SIRIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190NK', 61.20, 102.00, 'Níquel', NULL::text, 'active'),
    (34, 'Torneira Encastre', 1, 'Torneira de Encastre SIRIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190T', 61.20, 102.00, 'Titânio', NULL::text, 'active'),
    (35, 'Torneira Encastre', 1, 'Torneira de Encastre SIRIO Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190CB', 61.20, 102.00, 'Cobre', NULL::text, 'active'),
    (36, 'Torneira Encastre', 1, 'Torneira de Encastre SIRIO Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190BL', 61.20, 102.00, 'Branco', NULL::text, 'active'),
    (37, 'Torneira Duche', 1, 'Torneira de Duche SIRIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174', 57.00, 95.00, NULL::text, 'Cromado', 'active'),
    (38, 'Torneira Duche', 1, 'Torneira de Duche SIRIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174NG', 65.40, 109.00, 'Preto', NULL::text, 'active'),
    (39, 'Torneira Duche', 1, 'Torneira de Duche SIRIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174OR', 71.40, 119.00, 'Dourado', NULL::text, 'active'),
    (40, 'Torneira Duche', 1, 'Torneira de Duche SIRIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174NK', 71.40, 119.00, 'Níquel', NULL::text, 'active'),
    (41, 'Torneira Duche', 1, 'Torneira de Duche SIRIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174T', 71.40, 119.00, 'Titânio', NULL::text, 'active'),
    (42, 'Torneira Duche', 1, 'Torneira de Duche SIRIO Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174CB', 71.40, 119.00, 'Cobre', NULL::text, 'active'),
    (43, 'Torneira Duche', 1, 'Torneira de Duche SIRIO Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174BL', 71.40, 119.00, 'Branco', NULL::text, 'active'),
    (44, 'Torneira Lavatorio', 2, 'Torneira de Lavatorio HELIOS Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218', 39.00, 65.00, NULL::text, 'Cromado', 'active'),
    (45, 'Torneira Lavatorio', 2, 'Torneira de Lavatorio HELIOS Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218NG', 45.00, 75.00, 'Preto', NULL::text, 'active'),
    (46, 'Torneira Lavatorio', 2, 'Torneira de Lavatorio HELIOS Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218OR', 49.80, 83.00, 'Dourado', NULL::text, 'active'),
    (47, 'Torneira Lavatorio', 2, 'Torneira de Lavatorio HELIOS Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218NK', 49.80, 83.00, 'Níquel', NULL::text, 'active'),
    (48, 'Torneira Lavatorio', 2, 'Torneira de Lavatorio HELIOS Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218T', 49.80, 83.00, 'Titânio', NULL::text, 'active'),
    (49, 'Torneira Lavatorio', 2, 'Torneira de Lavatorio HELIOS Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218CB', 49.80, 83.00, 'Cobre', NULL::text, 'active'),
    (50, 'Torneira Lavatorio', 2, 'Torneira de Lavatorio HELIOS Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218BL', 49.80, 83.00, 'Branco', NULL::text, 'active'),
    (51, 'Torneira Pe Alto', 2, 'Torneira de Pe Alto HELIOS Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219', 59.40, 99.00, NULL::text, 'Cromado', 'active'),
    (52, 'Torneira Pe Alto', 2, 'Torneira de Pe Alto HELIOS Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219NG', 69.00, 115.00, 'Preto', NULL::text, 'active'),
    (53, 'Torneira Pe Alto', 2, 'Torneira de Pe Alto HELIOS Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219OR', 75.00, 125.00, 'Dourado', NULL::text, 'active'),
    (54, 'Torneira Pe Alto', 2, 'Torneira de Pe Alto HELIOS Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219NK', 75.00, 125.00, 'Níquel', NULL::text, 'active'),
    (55, 'Torneira Pe Alto', 2, 'Torneira de Pe Alto HELIOS Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219T', 75.00, 125.00, 'Titânio', NULL::text, 'active'),
    (56, 'Torneira Pe Alto', 2, 'Torneira de Pe Alto HELIOS Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219CB', 75.00, 125.00, 'Cobre', NULL::text, 'active'),
    (57, 'Torneira Pe Alto', 2, 'Torneira de Pe Alto HELIOS Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219BL', 75.00, 125.00, 'Branco', NULL::text, 'active'),
    (58, 'Torneira Bide', 2, 'Torneira de Bide HELIOS Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222', 39.00, 65.00, NULL::text, 'Cromado', 'active'),
    (59, 'Torneira Bide', 2, 'Torneira de Bide HELIOS Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222NG', 45.00, 75.00, 'Preto', NULL::text, 'active'),
    (60, 'Torneira Bide', 2, 'Torneira de Bide HELIOS Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222OR', 49.80, 83.00, 'Dourado', NULL::text, 'active'),
    (61, 'Torneira Bide', 2, 'Torneira de Bide HELIOS Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222NK', 49.80, 83.00, 'Níquel', NULL::text, 'active'),
    (62, 'Torneira Bide', 2, 'Torneira de Bide HELIOS Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222T', 49.80, 83.00, 'Titânio', NULL::text, 'active'),
    (63, 'Torneira Bide', 2, 'Torneira de Bide HELIOS Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222CB', 49.80, 83.00, 'Cobre', NULL::text, 'active'),
    (64, 'Torneira Bide', 2, 'Torneira de Bide HELIOS Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222BL', 49.80, 83.00, 'Branco', NULL::text, 'active'),
    (65, 'Torneira Banheira', 2, 'Torneira de Banheira HELIOS Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223', 87.00, 145.00, NULL::text, 'Cromado', 'active'),
    (66, 'Torneira Banheira', 2, 'Torneira de Banheira HELIOS Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223NG', 105.00, 175.00, 'Preto', NULL::text, 'active'),
    (67, 'Torneira Banheira', 2, 'Torneira de Banheira HELIOS Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223OR', 114.00, 190.00, 'Dourado', NULL::text, 'active'),
    (68, 'Torneira Banheira', 2, 'Torneira de Banheira HELIOS Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223NK', 114.00, 190.00, 'Níquel', NULL::text, 'active'),
    (69, 'Torneira Banheira', 2, 'Torneira de Banheira HELIOS Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223T', 114.00, 190.00, 'Titânio', NULL::text, 'active'),
    (70, 'Torneira Banheira', 2, 'Torneira de Banheira HELIOS Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223CB', 114.00, 190.00, 'Cobre', NULL::text, 'active'),
    (71, 'Torneira Banheira', 2, 'Torneira de Banheira HELIOS Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223BL', 114.00, 190.00, 'Branco', NULL::text, 'active'),
    (72, 'Torneira Duche', 2, 'Torneira de Duche HELIOS Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224', 59.40, 99.00, NULL::text, 'Cromado', 'active'),
    (73, 'Torneira Duche', 2, 'Torneira de Duche HELIOS Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224NG', 69.00, 115.00, 'Preto', NULL::text, 'active'),
    (74, 'Torneira Duche', 2, 'Torneira de Duche HELIOS Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224OR', 75.00, 125.00, 'Dourado', NULL::text, 'active'),
    (75, 'Torneira Duche', 2, 'Torneira de Duche HELIOS Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224NK', 75.00, 125.00, 'Níquel', NULL::text, 'active'),
    (76, 'Torneira Duche', 2, 'Torneira de Duche HELIOS Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224T', 75.00, 125.00, 'Titânio', NULL::text, 'active'),
    (77, 'Torneira Duche', 2, 'Torneira de Duche HELIOS Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224CB', 75.00, 125.00, 'Cobre', NULL::text, 'active'),
    (78, 'Torneira Duche', 2, 'Torneira de Duche HELIOS Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224BL', 75.00, 125.00, 'Branco', NULL::text, 'active'),
    (79, 'Torneira Lavatorio', 3, 'Torneira de Lavatorio MARRIOT Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150', 38.40, 64.00, NULL::text, 'Cromado', 'active'),
    (80, 'Torneira Lavatorio', 3, 'Torneira de Lavatorio MARRIOT Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150NG', 43.20, 72.00, 'Preto', NULL::text, 'active'),
    (81, 'Torneira Lavatorio', 3, 'Torneira de Lavatorio MARRIOT Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150OR', 51.00, 85.00, 'Dourado', NULL::text, 'active'),
    (82, 'Torneira Lavatorio', 3, 'Torneira de Lavatorio MARRIOT Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150NK', 51.00, 85.00, 'Níquel', NULL::text, 'active'),
    (83, 'Torneira Lavatorio', 3, 'Torneira de Lavatorio MARRIOT Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150T', 51.00, 85.00, 'Titânio', NULL::text, 'active'),
    (84, 'Torneira Lavatorio', 3, 'Torneira de Lavatorio MARRIOT Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150CB', 51.00, 85.00, 'Cobre', NULL::text, 'active'),
    (85, 'Torneira Lavatorio', 3, 'Torneira de Lavatorio MARRIOT Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150BL', 51.00, 85.00, 'Branco', NULL::text, 'active'),
    (86, 'Torneira Pe Alto', 3, 'Torneira de Pe Alto MARRIOT Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154', 67.20, 112.00, NULL::text, 'Cromado', 'active'),
    (87, 'Torneira Pe Alto', 3, 'Torneira de Pe Alto MARRIOT Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154NG', 77.40, 129.00, 'Preto', NULL::text, 'active'),
    (88, 'Torneira Pe Alto', 3, 'Torneira de Pe Alto MARRIOT Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154OR', 84.00, 140.00, 'Dourado', NULL::text, 'active'),
    (89, 'Torneira Pe Alto', 3, 'Torneira de Pe Alto MARRIOT Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154NK', 84.00, 140.00, 'Níquel', NULL::text, 'active'),
    (90, 'Torneira Pe Alto', 3, 'Torneira de Pe Alto MARRIOT Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154T', 84.00, 140.00, 'Titânio', NULL::text, 'active'),
    (91, 'Torneira Pe Alto', 3, 'Torneira de Pe Alto MARRIOT Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154CB', 84.00, 140.00, 'Cobre', NULL::text, 'active'),
    (92, 'Torneira Pe Alto', 3, 'Torneira de Pe Alto MARRIOT Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154BL', 84.00, 140.00, 'Branco', NULL::text, 'active'),
    (93, 'Torneira Bide', 3, 'Torneira de Bide MARRIOT Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151', 38.40, 64.00, NULL::text, 'Cromado', 'active'),
    (94, 'Torneira Bide', 3, 'Torneira de Bide MARRIOT Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151NG', 43.20, 72.00, 'Preto', NULL::text, 'active'),
    (95, 'Torneira Bide', 3, 'Torneira de Bide MARRIOT Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151OR', 51.00, 85.00, 'Dourado', NULL::text, 'active'),
    (96, 'Torneira Bide', 3, 'Torneira de Bide MARRIOT Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151NK', 51.00, 85.00, 'Níquel', NULL::text, 'active'),
    (97, 'Torneira Bide', 3, 'Torneira de Bide MARRIOT Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151T', 51.00, 85.00, 'Titânio', NULL::text, 'active'),
    (98, 'Torneira Bide', 3, 'Torneira de Bide MARRIOT Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151CB', 51.00, 85.00, 'Cobre', NULL::text, 'active'),
    (99, 'Torneira Bide', 3, 'Torneira de Bide MARRIOT Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151BL', 51.00, 85.00, 'Branco', NULL::text, 'active'),
    (100, 'Torneira Banheira', 3, 'Torneira de Banheira MARRIOT Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152', 52.20, 87.00, NULL::text, 'Cromado', 'active'),
    (101, 'Torneira Banheira', 3, 'Torneira de Banheira MARRIOT Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152NG', 65.40, 109.00, 'Preto', NULL::text, 'active'),
    (102, 'Torneira Banheira', 3, 'Torneira de Banheira MARRIOT Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152OR', 76.80, 128.00, 'Dourado', NULL::text, 'active'),
    (103, 'Torneira Banheira', 3, 'Torneira de Banheira MARRIOT Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152NK', 76.80, 128.00, 'Níquel', NULL::text, 'active'),
    (104, 'Torneira Banheira', 3, 'Torneira de Banheira MARRIOT Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152T', 76.80, 128.00, 'Titânio', NULL::text, 'active'),
    (105, 'Torneira Banheira', 3, 'Torneira de Banheira MARRIOT Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152CB', 76.80, 128.00, 'Cobre', NULL::text, 'active'),
    (106, 'Torneira Banheira', 3, 'Torneira de Banheira MARRIOT Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152BL', 76.80, 128.00, 'Branco', NULL::text, 'active'),
    (107, 'Torneira Encastre', 2, 'Torneira de Encastre MARRIOT Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252', 52.20, 87.00, NULL::text, 'Cromado', 'active'),
    (108, 'Torneira Encastre', 2, 'Torneira de Encastre MARRIOT Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252NG', 55.80, 93.00, 'Preto', NULL::text, 'active'),
    (109, 'Torneira Encastre', 2, 'Torneira de Encastre MARRIOT Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252OR', 65.40, 109.00, 'Dourado', NULL::text, 'active'),
    (110, 'Torneira Encastre', 2, 'Torneira de Encastre MARRIOT Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252NK', 65.40, 109.00, 'Níquel', NULL::text, 'active'),
    (111, 'Torneira Encastre', 2, 'Torneira de Encastre MARRIOT Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252T', 65.40, 109.00, 'Titânio', NULL::text, 'active'),
    (112, 'Torneira Encastre', 2, 'Torneira de Encastre MARRIOT Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252CB', 65.40, 109.00, 'Cobre', NULL::text, 'active'),
    (113, 'Torneira Encastre', 2, 'Torneira de Encastre MARRIOT Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252BL', 65.40, 109.00, 'Branco', NULL::text, 'active'),
    (114, 'Torneira Duche', 3, 'Torneira de Duche MARRIOT Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153', 45.00, 75.00, NULL::text, 'Cromado', 'active'),
    (115, 'Torneira Duche', 3, 'Torneira de Duche MARRIOT Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153NG', 55.20, 92.00, 'Preto', NULL::text, 'active'),
    (116, 'Torneira Duche', 3, 'Torneira de Duche MARRIOT Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153OR', 67.80, 113.00, 'Dourado', NULL::text, 'active'),
    (117, 'Torneira Duche', 3, 'Torneira de Duche MARRIOT Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153NK', 67.80, 113.00, 'Níquel', NULL::text, 'active'),
    (118, 'Torneira Duche', 3, 'Torneira de Duche MARRIOT Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153T', 67.80, 113.00, 'Titânio', NULL::text, 'active'),
    (119, 'Torneira Duche', 3, 'Torneira de Duche MARRIOT Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153CB', 67.80, 113.00, 'Cobre', NULL::text, 'active'),
    (120, 'Torneira Duche', 3, 'Torneira de Duche MARRIOT Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153BL', 67.80, 113.00, 'Branco', NULL::text, 'active'),
    (121, 'Torneira Lavatorio', 4, 'Torneira de Lavatorio IONY Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3284', 27.60, 46.00, NULL::text, 'Cromado', 'active'),
    (122, 'Torneira Lavatorio', 4, 'Torneira de Lavatorio IONY Acero', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3280', 21.00, 35.00, 'Inox', NULL::text, 'active'),
    (123, 'Torneira Lavatorio', 4, 'Torneira de Lavatorio IONY Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3280N', 23.40, 39.00, 'Preto', NULL::text, 'active'),
    (124, 'Torneira Pe Alto', 4, 'Torneira de Pe Alto IONY Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3285', 38.40, 64.00, NULL::text, 'Cromado', 'active'),
    (125, 'Torneira Pe Alto', 4, 'Torneira de Pe Alto IONY Acero', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3281', 27.00, 45.00, 'Inox', NULL::text, 'active'),
    (126, 'Torneira Pe Alto', 4, 'Torneira de Pe Alto IONY Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3281N', 27.00, 45.00, 'Preto', NULL::text, 'active'),
    (127, 'Torneira Bide', 4, 'Torneira de Bide IONY Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3289', 27.60, 46.00, NULL::text, 'Cromado', 'active'),
    (128, 'Torneira Bide', 4, 'Torneira de Bide IONY Acero', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3288', 21.00, 35.00, 'Inox', NULL::text, 'active'),
    (129, 'Torneira Bide', 4, 'Torneira de Bide IONY Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3288N', 23.40, 39.00, 'Preto', NULL::text, 'active'),
    (130, 'Torneira Banheira', 4, 'Torneira de Banheira IONY Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3287', 48.00, 80.00, NULL::text, 'Cromado', 'active'),
    (131, 'Torneira Banheira', 4, 'Torneira de Banheira IONY Acero', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3283', 43.20, 72.00, 'Inox', NULL::text, 'active'),
    (132, 'Torneira Banheira', 4, 'Torneira de Banheira IONY Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3283N', 46.20, 77.00, 'Preto', NULL::text, 'active'),
    (133, 'Torneira Duche', 4, 'Torneira de Duche IONY Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3286', 36.00, 60.00, NULL::text, 'Cromado', 'active'),
    (134, 'Torneira Duche', 4, 'Torneira de Duche IONY Acero', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3282', 36.00, 60.00, 'Inox', NULL::text, 'active'),
    (135, 'Torneira Duche', 4, 'Torneira de Duche IONY Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3282N', 39.00, 65.00, 'Preto', NULL::text, 'active'),
    (136, 'Torneira Lavatorio', 5, 'Torneira de Lavatorio DIOR Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3120', 53.40, 89.00, NULL::text, 'Cromado', 'active'),
    (137, 'Torneira Lavatorio', 5, 'Torneira de Lavatorio DIOR Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3125', 62.40, 104.00, 'Preto', NULL::text, 'active'),
    (138, 'Torneira Lavatorio', 5, 'Torneira de Lavatorio DIOR Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3130', 69.00, 115.00, 'Titânio', NULL::text, 'active'),
    (139, 'Torneira Pe Alto', 5, 'Torneira de Pe Alto DIOR Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3121', 67.80, 113.00, NULL::text, 'Cromado', 'active'),
    (140, 'Torneira Pe Alto', 5, 'Torneira de Pe Alto DIOR Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3126', 79.80, 133.00, 'Preto', NULL::text, 'active'),
    (141, 'Torneira Pe Alto', 5, 'Torneira de Pe Alto DIOR Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3131', 89.40, 149.00, 'Titânio', NULL::text, 'active'),
    (142, 'Torneira Bide', 5, 'Torneira de Bide DIOR Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3122', 53.40, 89.00, NULL::text, 'Cromado', 'active'),
    (143, 'Torneira Bide', 5, 'Torneira de Bide DIOR Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3127', 62.40, 104.00, 'Preto', NULL::text, 'active'),
    (144, 'Torneira Bide', 5, 'Torneira de Bide DIOR Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3132', 69.00, 115.00, 'Titânio', NULL::text, 'active'),
    (145, 'Torneira Banheira', 5, 'Torneira de Banheira DIOR Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3123', 90.60, 151.00, NULL::text, 'Cromado', 'active'),
    (146, 'Torneira Banheira', 5, 'Torneira de Banheira DIOR Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3128', 113.40, 189.00, 'Preto', NULL::text, 'active'),
    (147, 'Torneira Banheira', 5, 'Torneira de Banheira DIOR Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3133', 143.40, 239.00, 'Titânio', NULL::text, 'active'),
    (148, 'Torneira Duche', 5, 'Torneira de Duche DIOR Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3124', 60.60, 101.00, NULL::text, 'Cromado', 'active'),
    (149, 'Torneira Duche', 5, 'Torneira de Duche DIOR Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3129', 76.20, 127.00, 'Preto', NULL::text, 'active'),
    (150, 'Torneira Duche', 5, 'Torneira de Duche DIOR Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3134', 99.00, 165.00, 'Titânio', NULL::text, 'active'),
    (151, 'Torneira Lavatorio', 6, 'Torneira de Lavatorio CASSIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3060', 48.60, 81.00, NULL::text, 'Cromado', 'active'),
    (152, 'Torneira Lavatorio', 6, 'Torneira de Lavatorio CASSIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3070', 53.40, 89.00, 'Preto', NULL::text, 'active'),
    (153, 'Torneira Lavatorio', 6, 'Torneira de Lavatorio CASSIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3105', 58.80, 98.00, 'Titânio', NULL::text, 'active'),
    (154, 'Torneira Lavatorio', 6, 'Torneira de Lavatorio CASSIO Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3175', 58.80, 98.00, 'Branco', NULL::text, 'active'),
    (155, 'Torneira Lavatorio', 6, 'Torneira de Lavatorio CASSIO Blanco/Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3064', 51.60, 86.00, 'Branco', 'Cromado', 'active'),
    (156, 'Torneira Pe Alto', 6, 'Torneira de Pe Alto CASSIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3100', 67.80, 113.00, NULL::text, 'Cromado', 'active'),
    (157, 'Torneira Pe Alto', 6, 'Torneira de Pe Alto CASSIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3102', 77.40, 129.00, 'Preto', NULL::text, 'active'),
    (158, 'Torneira Pe Alto', 6, 'Torneira de Pe Alto CASSIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3103', 81.00, 135.00, 'Titânio', NULL::text, 'active'),
    (159, 'Torneira Pe Alto', 6, 'Torneira de Pe Alto CASSIO Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3177', 81.00, 135.00, 'Branco', NULL::text, 'active'),
    (160, 'Torneira Pe Alto', 6, 'Torneira de Pe Alto CASSIO Blanco/Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3101', 77.40, 129.00, 'Branco', 'Cromado', 'active'),
    (161, 'Torneira Bide', 6, 'Torneira de Bide CASSIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3061', 48.60, 81.00, NULL::text, 'Cromado', 'active'),
    (162, 'Torneira Bide', 6, 'Torneira de Bide CASSIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3071', 53.40, 89.00, 'Preto', NULL::text, 'active'),
    (163, 'Torneira Bide', 6, 'Torneira de Bide CASSIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3106', 58.80, 98.00, 'Titânio', NULL::text, 'active'),
    (164, 'Torneira Bide', 6, 'Torneira de Bide CASSIO Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3176', 58.80, 98.00, 'Branco', NULL::text, 'active'),
    (165, 'Torneira Bide', 6, 'Torneira de Bide CASSIO Blanco/Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3065', 51.60, 86.00, 'Branco', 'Cromado', 'active'),
    (166, 'Torneira Banheira', 6, 'Torneira de Banheira CASSIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3062', 89.40, 149.00, NULL::text, 'Cromado', 'active'),
    (167, 'Torneira Banheira', 6, 'Torneira de Banheira CASSIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3072', 90.60, 151.00, 'Preto', NULL::text, 'active'),
    (168, 'Torneira Banheira', 6, 'Torneira de Banheira CASSIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3107', 143.40, 239.00, 'Titânio', NULL::text, 'active'),
    (169, 'Torneira Banheira', 6, 'Torneira de Banheira CASSIO Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3178', 97.20, 162.00, 'Branco', NULL::text, 'active'),
    (170, 'Torneira Banheira', 6, 'Torneira de Banheira CASSIO Blanco/Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3066', 88.20, 147.00, 'Branco', 'Cromado', 'active'),
    (171, 'Torneira Encastre', 3, 'Torneira de Encastre CASSIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3048', 89.40, 149.00, NULL::text, 'Cromado', 'active'),
    (172, 'Torneira Encastre', 3, 'Torneira de Encastre CASSIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3049', 92.40, 154.00, 'Preto', NULL::text, 'active'),
    (173, 'Torneira Encastre', 3, 'Torneira de Encastre CASSIO Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3048BL', 92.40, 154.00, 'Branco', NULL::text, 'active'),
    (174, 'Torneira Duche', 6, 'Torneira de Duche CASSIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3063', 64.80, 108.00, NULL::text, 'Cromado', 'active'),
    (175, 'Torneira Duche', 6, 'Torneira de Duche CASSIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3073', 67.80, 113.00, 'Preto', NULL::text, 'active'),
    (176, 'Torneira Duche', 6, 'Torneira de Duche CASSIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3108', 117.60, 196.00, 'Titânio', NULL::text, 'active'),
    (177, 'Torneira Duche', 6, 'Torneira de Duche CASSIO Blanco', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3179', 70.20, 117.00, 'Branco', NULL::text, 'active'),
    (178, 'Torneira Duche', 6, 'Torneira de Duche CASSIO Blanco/Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3067', 66.00, 110.00, 'Branco', 'Cromado', 'active'),
    (179, 'Torneira Lavatorio', 7, 'Torneira de Lavatorio RHIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 30.60, 51.00, NULL::text, 'Cromado', 'active'),
    (180, 'Torneira Lavatorio', 7, 'Torneira de Lavatorio RHIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 36.60, 61.00, 'Preto', NULL::text, 'active'),
    (181, 'Torneira Lavatorio', 7, 'Torneira de Lavatorio RHIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 41.40, 69.00, 'Dourado', NULL::text, 'active'),
    (182, 'Torneira Lavatorio', 7, 'Torneira de Lavatorio RHIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 41.40, 69.00, 'Níquel', NULL::text, 'active'),
    (183, 'Torneira Lavatorio', 7, 'Torneira de Lavatorio RHIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 41.40, 69.00, 'Titânio', NULL::text, 'active'),
    (184, 'Torneira Pe Alto', 7, 'Torneira de Pe Alto RHIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 49.20, 82.00, NULL::text, 'Cromado', 'active'),
    (185, 'Torneira Pe Alto', 7, 'Torneira de Pe Alto RHIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 57.00, 95.00, 'Preto', NULL::text, 'active'),
    (186, 'Torneira Pe Alto', 7, 'Torneira de Pe Alto RHIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 61.80, 103.00, 'Dourado', NULL::text, 'active'),
    (187, 'Torneira Pe Alto', 7, 'Torneira de Pe Alto RHIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 61.80, 103.00, 'Níquel', NULL::text, 'active'),
    (188, 'Torneira Pe Alto', 7, 'Torneira de Pe Alto RHIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 61.80, 103.00, 'Titânio', NULL::text, 'active'),
    (189, 'Torneira Bide', 7, 'Torneira de Bide RHIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 30.60, 51.00, NULL::text, 'Cromado', 'active'),
    (190, 'Torneira Bide', 7, 'Torneira de Bide RHIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 36.60, 61.00, 'Preto', NULL::text, 'active'),
    (191, 'Torneira Bide', 7, 'Torneira de Bide RHIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 41.40, 69.00, 'Dourado', NULL::text, 'active'),
    (192, 'Torneira Bide', 7, 'Torneira de Bide RHIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 41.40, 69.00, 'Níquel', NULL::text, 'active'),
    (193, 'Torneira Bide', 7, 'Torneira de Bide RHIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 41.40, 69.00, 'Titânio', NULL::text, 'active'),
    (194, 'Torneira Banheira', 7, 'Torneira de Banheira RHIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 64.80, 108.00, NULL::text, 'Cromado', 'active'),
    (195, 'Torneira Banheira', 7, 'Torneira de Banheira RHIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 67.80, 113.00, 'Preto', NULL::text, 'active'),
    (196, 'Torneira Banheira', 7, 'Torneira de Banheira RHIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 75.60, 126.00, 'Dourado', NULL::text, 'active'),
    (197, 'Torneira Banheira', 7, 'Torneira de Banheira RHIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 75.60, 126.00, 'Níquel', NULL::text, 'active'),
    (198, 'Torneira Banheira', 7, 'Torneira de Banheira RHIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 75.60, 126.00, 'Titânio', NULL::text, 'active'),
    (199, 'Torneira Duche', 7, 'Torneira de Duche RHIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 53.40, 89.00, NULL::text, 'Cromado', 'active'),
    (200, 'Torneira Duche', 7, 'Torneira de Duche RHIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 57.60, 96.00, 'Preto', NULL::text, 'active'),
    (201, 'Torneira Duche', 7, 'Torneira de Duche RHIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 63.60, 106.00, 'Dourado', NULL::text, 'active'),
    (202, 'Torneira Duche', 7, 'Torneira de Duche RHIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 63.60, 106.00, 'Níquel', NULL::text, 'active'),
    (203, 'Torneira Duche', 7, 'Torneira de Duche RHIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 63.60, 106.00, 'Titânio', NULL::text, 'active'),
    (204, 'Torneira Lavatorio', 8, 'Torneira de Lavatorio TARSIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 41.40, 69.00, NULL::text, 'Cromado', 'active'),
    (205, 'Torneira Lavatorio', 8, 'Torneira de Lavatorio TARSIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 47.40, 79.00, 'Preto', NULL::text, 'active'),
    (206, 'Torneira Lavatorio', 8, 'Torneira de Lavatorio TARSIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 53.40, 89.00, 'Dourado', NULL::text, 'active'),
    (207, 'Torneira Lavatorio', 8, 'Torneira de Lavatorio TARSIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 53.40, 89.00, 'Níquel', NULL::text, 'active'),
    (208, 'Torneira Lavatorio', 8, 'Torneira de Lavatorio TARSIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 53.40, 89.00, 'Titânio', NULL::text, 'active'),
    (209, 'Torneira Pe Alto', 8, 'Torneira de Pe Alto TARSIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 72.00, 120.00, NULL::text, 'Cromado', 'active'),
    (210, 'Torneira Pe Alto', 8, 'Torneira de Pe Alto TARSIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 77.40, 129.00, 'Preto', NULL::text, 'active'),
    (211, 'Torneira Pe Alto', 8, 'Torneira de Pe Alto TARSIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 87.00, 145.00, 'Dourado', NULL::text, 'active'),
    (212, 'Torneira Pe Alto', 8, 'Torneira de Pe Alto TARSIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 87.00, 145.00, 'Níquel', NULL::text, 'active'),
    (213, 'Torneira Pe Alto', 8, 'Torneira de Pe Alto TARSIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 87.00, 145.00, 'Titânio', NULL::text, 'active'),
    (214, 'Torneira Bide', 8, 'Torneira de Bide TARSIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 41.40, 69.00, NULL::text, 'Cromado', 'active'),
    (215, 'Torneira Bide', 8, 'Torneira de Bide TARSIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 47.40, 79.00, 'Preto', NULL::text, 'active'),
    (216, 'Torneira Bide', 8, 'Torneira de Bide TARSIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 53.40, 89.00, 'Dourado', NULL::text, 'active'),
    (217, 'Torneira Bide', 8, 'Torneira de Bide TARSIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 53.40, 89.00, 'Níquel', NULL::text, 'active'),
    (218, 'Torneira Bide', 8, 'Torneira de Bide TARSIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 53.40, 89.00, 'Titânio', NULL::text, 'active'),
    (219, 'Torneira Banheira', 8, 'Torneira de Banheira TARSIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 64.80, 108.00, NULL::text, 'Cromado', 'active'),
    (220, 'Torneira Banheira', 8, 'Torneira de Banheira TARSIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 67.80, 113.00, 'Preto', NULL::text, 'active'),
    (221, 'Torneira Banheira', 8, 'Torneira de Banheira TARSIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 75.60, 126.00, 'Dourado', NULL::text, 'active'),
    (222, 'Torneira Banheira', 8, 'Torneira de Banheira TARSIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 75.60, 126.00, 'Níquel', NULL::text, 'active'),
    (223, 'Torneira Banheira', 8, 'Torneira de Banheira TARSIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 75.60, 126.00, 'Titânio', NULL::text, 'active'),
    (224, 'Torneira Duche', 8, 'Torneira de Duche TARSIO Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 53.40, 89.00, NULL::text, 'Cromado', 'active'),
    (225, 'Torneira Duche', 8, 'Torneira de Duche TARSIO Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 57.60, 96.00, 'Preto', NULL::text, 'active'),
    (226, 'Torneira Duche', 8, 'Torneira de Duche TARSIO Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 63.60, 106.00, 'Dourado', NULL::text, 'active'),
    (227, 'Torneira Duche', 8, 'Torneira de Duche TARSIO Niquel', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 63.60, 106.00, 'Níquel', NULL::text, 'active'),
    (228, 'Torneira Duche', 8, 'Torneira de Duche TARSIO Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL::text, 63.60, 106.00, 'Titânio', NULL::text, 'active'),
    (229, 'Torneira Banheira', 9, 'Torneira de Banheira SMOOTH Cromado', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMCR', 300.00, 600.00, NULL::text, 'Cromado', 'active'),
    (230, 'Torneira Banheira', 9, 'Torneira de Banheira SMOOTH Preto Mate', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMPRM', 250.00, 500.00, 'Preto', 'Mate', 'active'),
    (231, 'Torneira Banheira', 9, 'Torneira de Banheira SMOOTH Branco Mate', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMBRM', 250.00, 500.00, 'Branco', 'Mate', 'active'),
    (232, 'Torneira Banheira', 9, 'Torneira de Banheira SMOOTH Dourado Escovado', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMGLDM', 275.00, 550.00, 'Dourado', 'Escovado', 'active'),
    (233, 'Torneira Banheira', 9, 'Torneira de Banheira SMOOTH Niquel Escovado', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMNQ', 250.00, 500.00, 'Níquel', 'Escovado', 'active'),
    (234, 'Torneira Banheira', 9, 'Torneira de Banheira SMOOTH Gun Metal', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMGM', 275.00, 550.00, 'Gun Metal', NULL::text, 'active'),
    (235, 'Torneira Banheira', 9, 'Torneira de Banheira SMOOTH Rosa Gold Escovado', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMRSGM', 275.00, 550.00, 'Rosa Gold', 'Escovado', 'active'),
    (236, 'Misturadoras Monocomando Extraivel', 1, 'Misturadoras Monocomando Extraivel SMOOTH Cromo', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMCR', 60.00, 120.00, NULL::text, 'Cromado', 'active'),
    (237, 'Misturadoras Monocomando Extraivel', 1, 'Misturadoras Monocomando Extraivel SMOOTH Preto Mate', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMPRM', 65.00, 130.00, 'Preto', 'Mate', 'active'),
    (238, 'Misturadoras Monocomando Extraivel', 1, 'Misturadoras Monocomando Extraivel SMOOTH Branco Mate', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMBRM', 65.00, 130.00, 'Branco', 'Mate', 'active'),
    (239, 'Misturadoras Monocomando Extraivel', 1, 'Misturadoras Monocomando Extraivel SMOOTH Gun Metal', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMGM', 80.00, 160.00, 'Gun Metal', NULL::text, 'active'),
    (240, 'Misturadoras Monocomando Extraivel', 1, 'Misturadoras Monocomando Extraivel SMOOTH Niquel Escovado', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMNQ', 70.00, 140.00, 'Níquel', 'Escovado', 'active'),
    (241, 'Misturadoras Monocomando Extraivel', 1, 'Misturadoras Monocomando Extraivel SMOOTH Dourado Escovado', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMGLDM', 80.00, 160.00, 'Dourado', 'Escovado', 'active'),
    (242, 'Misturadoras Monocomando Extraivel', 1, 'Misturadoras Monocomando Extraivel SMOOTH Rosa Gold Escovado', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMRSGM', 80.00, 160.00, 'Rosa Gold', 'Escovado', 'active'),
    (243, 'Misturadoras Monocomando', 1, 'Misturadoras Monocomando NOAH Acero', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3184', 40.20, 67.00, 'Inox', NULL::text, 'active'),
    (244, 'Misturadoras Monocomando', 1, 'Misturadoras Monocomando NOAH Negro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3183', 45.00, 75.00, 'Preto', NULL::text, 'active'),
    (245, 'Misturadoras Monocomando', 1, 'Misturadoras Monocomando NOAH Oro', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3185', 51.00, 85.00, 'Dourado', NULL::text, 'active'),
    (246, 'Misturadoras Monocomando', 1, 'Misturadoras Monocomando NOAH Titanio', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3187', 51.00, 85.00, 'Titânio', NULL::text, 'active'),
    (247, 'Misturadoras Monocomando', 1, 'Misturadoras Monocomando NOAH Cobre', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3186', 51.00, 85.00, 'Cobre', NULL::text, 'active'),
    (248, 'Misturadoras Monocomando Extraivel', 2, 'Misturadoras Monocomando Extraivel ROUND Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3144', 60.60, 101.00, NULL::text, 'Cromado', 'active'),
    (249, 'Misturadoras Monocomando Extraivel', 2, 'Misturadoras Monocomando Extraivel ROUND Acero', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3180', 62.40, 104.00, 'Inox', NULL::text, 'active'),
    (250, 'Misturadoras Monocomando Extraivel', 2, 'Misturadoras Monocomando Extraivel ROUND Acero Negro Mate', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3180NG', 65.40, 109.00, 'Preto', 'Mate', 'active'),
    (251, 'Misturadoras Monocomando Extraivel', 2, 'Misturadoras Monocomando Extraivel ROUND Acero Oro PVD', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3180OR', 69.00, 115.00, 'Dourado', 'PVD', 'active'),
    (252, 'Misturadoras Monocomando Extraivel', 2, 'Misturadoras Monocomando Extraivel ROUND Acero Cobre PVD', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3180CB', 69.00, 115.00, 'Cobre', 'PVD', 'active'),
    (253, 'Misturadoras Monocomando Extraivel', 2, 'Misturadoras Monocomando Extraivel ROUND Acero Titanio PVD', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3180T', 69.00, 115.00, 'Titânio', 'PVD', 'active'),
    (254, 'Misturadoras Monocomando Abativel', 1, 'Misturadoras Monocomando Abativel ALEXIA Cromo', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3233', 58.80, 98.00, NULL::text, 'Cromado', 'active'),
    (255, 'Misturadoras Monocomando Flexivel', 1, 'Misturadoras Monocomando Flexivel CIRA Metal Edition Cromo', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503CR', 99.00, 220.00, NULL::text, 'Cromado', 'active'),
    (256, 'Misturadoras Monocomando Flexivel', 1, 'Misturadoras Monocomando Flexivel CIRA Metal Edition Niquel Cepillado', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503NKM', 103.50, 230.00, 'Níquel', 'Escovado', 'active'),
    (257, 'Misturadoras Monocomando Flexivel', 1, 'Misturadoras Monocomando Flexivel CIRA Metal Edition Negro Mate', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503NE', 103.50, 230.00, 'Preto', 'Mate', 'active'),
    (258, 'Misturadoras Monocomando Flexivel', 1, 'Misturadoras Monocomando Flexivel CIRA Metal Edition Oro', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503OR', 108.00, 240.00, 'Dourado', NULL::text, 'active'),
    (259, 'Misturadoras Monocomando Flexivel', 2, 'Misturadoras Monocomando Flexivel CIRA Silicone Edition Negro', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503NENE', 99.00, 220.00, 'Preto', NULL::text, 'active'),
    (260, 'Misturadoras Monocomando Flexivel', 2, 'Misturadoras Monocomando Flexivel CIRA Silicone Edition Negro/Rojo', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503NERJ', 99.00, 220.00, 'Preto/Vermelho', NULL::text, 'active'),
    (261, 'Misturadoras Monocomando Flexivel', 2, 'Misturadoras Monocomando Flexivel CIRA Silicone Edition Niquel Cepillado/Negro', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503NKNE', 103.50, 230.00, 'Níquel/Preto', 'Escovado', 'active'),
    (262, 'Misturadoras Monocomando Flexivel', 2, 'Misturadoras Monocomando Flexivel CIRA Silicone Edition Niquel Cepillado/Blanco', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503NKBL', 103.50, 230.00, 'Níquel/Branco', 'Escovado', 'active'),
    (263, 'Misturadoras Monocomando Flexivel', 2, 'Misturadoras Monocomando Flexivel CIRA Silicone Edition Cromo/Negro', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503CRNE', 99.00, 220.00, 'Preto', 'Cromado', 'active'),
    (264, 'Misturadoras Monocomando Flexivel', 2, 'Misturadoras Monocomando Flexivel CIRA Silicone Edition Cromo/Blanco', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503CRBL', 99.00, 220.00, 'Branco', 'Cromado', 'active'),
    (265, 'Misturadoras Monocomando Flexivel', 2, 'Misturadoras Monocomando Flexivel CIRA Silicone Edition Oro/Negro', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503ORNE', 108.00, 240.00, 'Dourado/Preto', NULL::text, 'active'),
    (266, 'Misturadoras Monocomando Flexivel', 2, 'Misturadoras Monocomando Flexivel CIRA Silicone Edition Oro/Blanco', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503ORBL', 108.00, 240.00, 'Dourado/Branco', NULL::text, 'active'),
    (267, 'Misturadoras Monocomando Abativel', 2, 'Misturadoras Monocomando Abativel GRANADA Cromo', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', '664022H504CR', 72.00, 160.00, NULL::text, 'Cromado', 'active'),
    (268, 'Misturadoras Monocomando Abativel', 2, 'Misturadoras Monocomando Abativel GRANADA Cromo Negro', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', '664022H504NE', 74.25, 165.00, 'Preto', 'Cromado', 'active'),
    (269, 'Misturadoras Monocomando Abativel', 2, 'Misturadoras Monocomando Abativel GRANADA Blanco', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', '664022H504BL', 74.25, 165.00, 'Branco', NULL::text, 'active'),
    (270, 'Misturadoras Monocomando Extraivel', 3, 'Misturadoras Monocomando Extraivel GRANADA Cromo', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', '6635TEL504CR', 96.75, 215.00, NULL::text, 'Cromado', 'active'),
    (271, 'Misturadoras Monocomando Giratoria', 1, 'Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Amarillo Arena (sem preço)', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP3522H501AA', NULL::numeric, NULL::numeric, 'Amarillo Arena', NULL::text, 'draft'),
    (272, 'Misturadoras Monocomando Giratoria', 1, 'Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Rojo Beige (sem preço)', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.RB', NULL::numeric, NULL::numeric, 'Rojo Beige', NULL::text, 'draft'),
    (273, 'Misturadoras Monocomando Giratoria', 1, 'Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Violeta Pastel (sem preço)', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.VP', NULL::numeric, NULL::numeric, 'Violeta Pastel', NULL::text, 'draft'),
    (274, 'Misturadoras Monocomando Giratoria', 1, 'Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Azul Colombino (sem preço)', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.AC', NULL::numeric, NULL::numeric, 'Azul Colombino', NULL::text, 'draft'),
    (275, 'Misturadoras Monocomando Giratoria', 1, 'Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Gris Guijarro (sem preço)', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.GG', NULL::numeric, NULL::numeric, 'Gris Guijarro', NULL::text, 'draft'),
    (276, 'Misturadoras Monocomando Giratoria', 1, 'Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Verde Reseda (sem preço)', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.VR', NULL::numeric, NULL::numeric, 'Verde Reseda', NULL::text, 'draft'),
    (277, 'Misturadoras Monocomando Giratoria', 1, 'Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Turquesa Pastel (sem preço)', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.TP', NULL::numeric, NULL::numeric, 'Turquesa Pastel', NULL::text, 'draft'),
    (278, 'Misturadoras Monocomando Giratoria', 1, 'Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Blanco Crema (sem preço)', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.BC', NULL::numeric, NULL::numeric, 'Blanco Crema', NULL::text, 'draft'),
    (279, 'Misturadoras Monocomando Giratoria', 2, 'Misturadoras Monocomando Giratoria SOPHIE Metal Edition Inox (sem preço)', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.NX', NULL::numeric, NULL::numeric, 'Inox', NULL::text, 'draft'),
    (280, 'Misturadoras Monocomando Giratoria', 2, 'Misturadoras Monocomando Giratoria SOPHIE Metal Edition Oro Cepillado (sem preço)', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.OC', NULL::numeric, NULL::numeric, 'Dourado', 'Escovado', 'draft'),
    (281, 'Misturadoras Monocomando Giratoria', 2, 'Misturadoras Monocomando Giratoria SOPHIE Metal Edition Negro (sem preço)', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.NE', NULL::numeric, NULL::numeric, 'Preto', NULL::text, 'draft'),
    (282, 'Misturadoras Monocomando Giratoria', 2, 'Misturadoras Monocomando Giratoria SOPHIE Metal Edition Grafite (sem preço)', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.GN', NULL::numeric, NULL::numeric, 'Grafite', NULL::text, 'draft');

  CREATE TEMP TABLE _tm_marcas (nome text PRIMARY KEY, id uuid, nome_db text) ON COMMIT DROP;
  INSERT INTO _tm_marcas (nome) SELECT DISTINCT l.marca FROM _tm_linhas l;
  CREATE TEMP TABLE _tm_forn (nome text PRIMARY KEY, id uuid, criado boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _tm_forn (nome) SELECT DISTINCT l.forn FROM _tm_linhas l;

  -- os dados gerados estão inteiros
  SELECT count(*), count(DISTINCT l.nome), count(*) FILTER (WHERE l.custo IS NOT NULL)
    INTO v_n, v_m, v_k
  FROM _tm_linhas l;
  IF v_n <> c_total OR v_m <> c_total OR v_k <> c_n_com_preco THEN
    RAISE EXCEPTION 'catalogo_torneiras_mudelar: os dados gerados têm % linhas (% nomes distintos, % com preço) em vez de % (%, %).',
      v_n, v_m, v_k, c_total, c_total, c_n_com_preco;
  END IF;
  IF (SELECT count(*) FILTER (WHERE l.cod IS NULL) FROM _tm_linhas l) <> c_n_sem_cod
     OR (SELECT count(*) FILTER (WHERE l.cor IS NOT NULL) FROM _tm_linhas l) <> c_n_cor
     OR (SELECT count(*) FILTER (WHERE l.acab IS NOT NULL) FROM _tm_linhas l) <> c_n_acab
     OR (SELECT count(*) FROM _tm_subs) <> 11 OR (SELECT count(*) FROM _tm_marcas) <> 3 OR (SELECT count(*) FROM _tm_forn) <> 3 THEN
    RAISE EXCEPTION 'catalogo_torneiras_mudelar: os dados gerados não batem (sem código, Cor, Acabamento, subcategorias, marcas ou fornecedores).';
  END IF;
  IF (SELECT count(*) FROM _tm_modelos) <> c_n_modelos OR (SELECT sum(m.esperados) FROM _tm_modelos m) <> c_total
     OR EXISTS (SELECT 1 FROM _tm_linhas l WHERE NOT EXISTS (SELECT 1 FROM _tm_modelos m WHERE m.sub = l.sub AND m.numero = l.modelo)
                OR NOT EXISTS (SELECT 1 FROM _tm_subs s WHERE s.nome = l.sub)
                OR (l.cor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _tm_opcoes o WHERE o.papel = 'cor' AND o.nome = l.cor))
                OR (l.acab IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _tm_opcoes o WHERE o.papel = 'acabamento' AND o.nome = l.acab))
                OR (l.cor IS NULL AND l.acab IS NULL)
                OR (l.custo IS NULL) <> (l.pvp IS NULL) OR l.custo <= 0 OR l.pvp <= 0
                OR (l.custo IS NULL) <> (l.nome LIKE '% (sem preço)') OR l.nome ~ '\(cod\.'
                OR l.status <> (CASE WHEN l.pvp IS NULL THEN 'draft' ELSE 'active' END))
     OR EXISTS (SELECT 1 FROM _tm_modelos m WHERE m.esperados <> (SELECT count(*) FROM _tm_linhas l WHERE l.sub = m.sub AND l.modelo = m.numero))
     OR (SELECT count(DISTINCT (m.sub, public.fn_cat_chave_opcao(m.nome))) FROM _tm_modelos m) <> c_n_modelos THEN
    RAISE EXCEPTION 'catalogo_torneiras_mudelar: os dados gerados têm linhas com modelo, subcategoria, opção, preço ou nome fora do esperado.';
  END IF;
  -- produto = modelo + atributos: nenhuma combinação repetida (senão o SKU repetia) — PARA e diz quais
  SELECT string_agg(x.k, '; ') INTO v_txt FROM (
    SELECT l.sub || '/' || l.modelo || '/' || coalesce(l.cor, '-') || '/' || coalesce(l.acab, '-') || ' (' || string_agg(l.nome, ' | ') || ')' AS k
    FROM _tm_linhas l GROUP BY l.sub, l.modelo, l.cor, l.acab HAVING count(*) > 1 LIMIT 10) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: combinações repetidas (subcategoria/modelo/cor/acabamento): %', v_txt; END IF;

  -- subcategorias (as que já existem; as que faltarem criam-se depois dos locks)
  FOR r IN SELECT s.nome, s.sigla FROM _tm_subs s ORDER BY s.ordem LOOP
    SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(c.sigla ORDER BY c.created_at, c.id))[1],
           (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1]
      INTO v_n, v_sub, v_sub_sigla, v_sub_ativa
    FROM product_categories c
    WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n > 1 THEN
      RAISE EXCEPTION 'catalogo_torneiras_mudelar: há % subcategorias «%» em «%».', v_n, r.nome, c_cat_nome;
    ELSIF v_n = 1 THEN
      IF v_sub_sigla IS DISTINCT FROM r.sigla OR NOT v_sub_ativa THEN
        RAISE EXCEPTION 'catalogo_torneiras_mudelar: a subcategoria «%» tem a sigla «%» (esperada %) ou está desativada.', r.nome, v_sub_sigla, r.sigla;
      END IF;
      UPDATE _tm_subs s SET sub_id = v_sub WHERE s.nome = r.nome;
    ELSIF EXISTS (SELECT 1 FROM product_categories c WHERE c.organization_id = c_org AND c.parent_id = v_cat
                  AND c.deleted_at IS NULL AND c.sigla = r.sigla) THEN
      RAISE EXCEPTION 'catalogo_torneiras_mudelar: falta a subcategoria «%» e a sigla % já é de outra.', r.nome, r.sigla;
    END IF;
  END LOOP;

  -- já aplicada / produtos de outros / modelos em conflito → inerte
  SELECT count(*) INTO v_n FROM products p JOIN _tm_subs s ON s.sub_id = p.subcategory_id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT l.nome FROM _tm_linhas l WHERE l.sub = s.nome);
  IF v_n = c_total THEN
    RAISE NOTICE 'catalogo_torneiras_mudelar: já aplicada (os % produtos já existem) — nada a fazer.', c_total;
    RETURN;
  ELSIF v_n > 0 THEN
    RAISE EXCEPTION 'catalogo_torneiras_mudelar: só % dos % produtos já existem na Mudelar. Rever antes de aplicar.', v_n, c_total;
  END IF;
  IF EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             AND p.subcategory_id IN (SELECT s.sub_id FROM _tm_subs s WHERE s.sub_id IS NOT NULL)) THEN
    RAISE NOTICE 'catalogo_torneiras_mudelar: as subcategorias já têm produtos que não são estes — nada a fazer.';
    RETURN;
  END IF;
  SELECT string_agg(pm.name || ' (' || lpad(pm.numero::text, 4, '0') || (CASE WHEN pm.deleted_at IS NOT NULL THEN ', apagado' ELSE '' END) || ')', ', ')
    INTO v_txt
  FROM product_models pm JOIN _tm_subs s ON s.sub_id = pm.subcategory_id
  WHERE pm.organization_id = c_org
    AND EXISTS (SELECT 1 FROM _tm_modelos m
                WHERE m.sub = s.nome
                  AND (pm.numero = m.numero OR (pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)))
                  AND NOT (pm.numero = m.numero AND pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)));
  IF v_txt IS NOT NULL THEN
    RAISE NOTICE 'catalogo_torneiras_mudelar: as subcategorias já têm modelos com estes nomes ou números, diferentes dos do Excel (%) — nada a fazer.', v_txt;
    RETURN;
  END IF;

  -- ─── Configuração que tem de existir (senão: erro) ───────────────────────────
  SELECT m.user_id INTO v_criador
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND coalesce(m.role_is_client, false) = false
  ORDER BY m.created_at, m.user_id LIMIT 1;
  IF v_criador IS NULL THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: a Mudelar não tem um membro ativo para created_by.'; END IF;

  FOR r IN SELECT k.nome FROM _tm_marcas k ORDER BY k.nome LOOP
    SELECT count(*), (array_agg(b.id ORDER BY b.created_at, b.id))[1], (array_agg(coalesce(b.is_active, true) ORDER BY b.created_at, b.id))[1],
           (array_agg(b.name ORDER BY b.created_at, b.id))[1]
      INTO v_n, v_opc, v_ativa, v_nome
    FROM brands b
    WHERE b.organization_id = c_org AND b.deleted_at IS NULL AND public.fn_cat_chave_opcao(b.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n <> 1 THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: a Mudelar tem % marcas «%» (tem de ter uma).', v_n, r.nome; END IF;
    IF NOT v_ativa THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: a marca «%» está desativada.', r.nome; END IF;
    UPDATE _tm_marcas k SET id = v_opc, nome_db = v_nome WHERE k.nome = r.nome;
  END LOOP;

  SELECT count(*) FILTER (WHERE a.code::text = 'cor'), count(*) FILTER (WHERE a.code::text = 'acabamento'),
         (array_agg(a.id) FILTER (WHERE a.code::text = 'cor'))[1], (array_agg(a.id) FILTER (WHERE a.code::text = 'acabamento'))[1]
    INTO v_n, v_m, v_a_cor, v_a_acab
  FROM product_attributes a
  WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND NOT a.is_measurement AND a.code::text IN ('cor', 'acabamento');
  IF v_n <> 1 OR v_m <> 1 THEN
    RAISE EXCEPTION 'catalogo_torneiras_mudelar: a Mudelar tem de ter um atributo cor e um acabamento de lista (tem % e %).', v_n, v_m;
  END IF;
  IF EXISTS (SELECT 1 FROM product_attributes a WHERE a.id IN (v_a_cor, v_a_acab) AND NOT coalesce(a.sku_entra, false)) THEN
    RAISE EXCEPTION 'catalogo_torneiras_mudelar: a Cor ou o Acabamento da Mudelar não entram no SKU.';
  END IF;
  v_g_cor := public.fn_cat_grupo_do_atributo(v_a_cor, c_org);
  v_g_acab := public.fn_cat_grupo_do_atributo(v_a_acab, c_org);
  IF NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_cor AND g.organization_id = c_org)
     OR NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_acab AND g.organization_id = c_org) THEN
    RAISE EXCEPTION 'catalogo_torneiras_mudelar: as opções de Cor ou de Acabamento em uso na Mudelar não são de um grupo da Mudelar.';
  END IF;
  UPDATE _tm_opcoes o SET grupo = (CASE WHEN o.papel = 'cor' THEN v_g_cor ELSE v_g_acab END);

  -- o que esta transação já tinha escrito antes desta migration (se correr no mesmo BEGIN que outra), para a
  -- verificação pelo xmin no fim contar só o que esta escreveu
  v_xid := (txid_current() % 4294967296)::text;
  CREATE TEMP TABLE _tm_ja ON COMMIT DROP AS
  SELECT 'products'::text AS t, x.id FROM products x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'item_suppliers', x.id FROM item_suppliers x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_models', x.id FROM product_models x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_categories', x.id FROM product_categories x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_attributes', x.id FROM product_attributes x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'attribute_option_groups', x.id FROM attribute_option_groups x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'attribute_option_group_values', x.id FROM attribute_option_group_values x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'brands', x.id FROM brands x WHERE x.xmin::text = v_xid;

  -- ─── Locks (as chaves das funções de gestão do Catálogo), depois as escritas ─────
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || v_g_cor::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || v_g_acab::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_fornecedores:' || c_org::text, 0));

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', v_criador::text, true);

  -- ─── 1. Subcategorias que faltarem (como a gestão de categorias: slug e path a partir do nome) ─────
  FOR r IN SELECT s.nome, s.sigla FROM _tm_subs s WHERE s.sub_id IS NULL ORDER BY s.ordem LOOP
    v_txt := trim(both '-' FROM regexp_replace(public.fn_cat_chave_opcao(r.nome), '[^a-z0-9]+', '-', 'g'));
    INSERT INTO product_categories (parent_id, name, slug, path, is_active, sort_order, created_by, organization_id, sigla)
    VALUES (v_cat, r.nome, v_txt, coalesce(lower(v_cat_path), 'torneiras-misturadoras') || '/' || v_txt, true,
            coalesce((SELECT max(c.sort_order) FROM product_categories c WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL), 0) + 1,
            v_criador, c_org, r.sigla)
    RETURNING id INTO v_sub;
    UPDATE _tm_subs s SET sub_id = v_sub, criada = true WHERE s.nome = r.nome;
    v_subs_criadas := v_subs_criadas || r.nome || ' (' || r.sigla || '); ';
  END LOOP;
  IF EXISTS (SELECT 1 FROM _tm_subs s LEFT JOIN product_categories c ON c.id = s.sub_id
             WHERE NOT coalesce(c.sigla = s.sigla AND c.parent_id = v_cat AND c.deleted_at IS NULL, false)) THEN
    RAISE EXCEPTION 'catalogo_torneiras_mudelar: há subcategorias sem a sigla esperada depois de criadas.';
  END IF;
  FOR r IN SELECT s.sub_id FROM _tm_subs s ORDER BY s.sub_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text || ':' || r.sub_id::text, 0));
  END LOOP;

  -- ─── 2. Opções de Cor e de Acabamento: reutiliza pelo nome; cria as que faltarem ──────────
  FOR r IN SELECT o.papel, o.nome, o.grupo, o.sigla_pref FROM _tm_opcoes o ORDER BY o.papel DESC, o.ordem LOOP
    SELECT count(*), (array_agg(v.id ORDER BY v.id))[1], (array_agg(v.is_active ORDER BY v.id))[1] INTO v_n, v_opc, v_ativa
    FROM attribute_option_group_values v
    WHERE v.group_id = r.grupo AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(r.nome);
    IF v_n > 1 THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: há % opções «%» na % da Mudelar.', v_n, r.nome, r.papel; END IF;
    IF v_n = 1 AND NOT v_ativa THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: a opção «%» (%) da Mudelar está desativada.', r.nome, r.papel; END IF;
    IF v_n = 0 THEN
      v_txt := CASE WHEN r.sigla_pref IS NOT NULL
                         AND NOT EXISTS (SELECT 1 FROM attribute_option_group_values v WHERE v.group_id = r.grupo AND v.sigla = r.sigla_pref)
                    THEN r.sigla_pref ELSE public.fn_cat_sigla_opcao_livre(r.grupo, r.nome, NULL) END;
      IF v_txt IS NULL THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: sem sigla livre para a opção «%» (%).', r.nome, r.papel; END IF;
      INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active, sigla)
      VALUES (r.grupo, r.nome, r.nome, NULL,
              coalesce((SELECT max(v.sort_order) FROM attribute_option_group_values v WHERE v.group_id = r.grupo), 0) + 1, true, v_txt)
      RETURNING id INTO v_opc;
      v_criadas := v_criadas || r.papel || ' ' || r.nome || ' (' || v_txt || '); ';
      UPDATE _tm_opcoes o SET criada = true WHERE o.papel = r.papel AND o.nome = r.nome;
    END IF;
    UPDATE _tm_opcoes o SET opcao_id = v_opc WHERE o.papel = r.papel AND o.nome = r.nome;
  END LOOP;
  UPDATE _tm_opcoes o SET valor = v.value_text::text, sigla = v.sigla FROM attribute_option_group_values v WHERE v.id = o.opcao_id;
  IF EXISTS (SELECT 1 FROM _tm_opcoes o WHERE o.sigla IS NULL OR o.valor IS NULL) THEN
    RAISE EXCEPTION 'catalogo_torneiras_mudelar: há opções sem sigla (o SKU precisa dela).';
  END IF;

  -- ─── 3. Os modelos nas subcategorias ──────────────────────────────────────────
  SELECT count(*) FILTER (WHERE pm.is_active), count(*) INTO v_n, v_m
  FROM product_models pm WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL;
  IF v_n + c_n_modelos > c_max_modelos_ativos OR v_m + c_n_modelos > c_max_modelos_vivos THEN
    RAISE EXCEPTION 'catalogo_torneiras_mudelar: a Mudelar passaria o teto de modelos (% ativos, % vivos).', v_n, v_m;
  END IF;
  FOR r IN SELECT m.sub, m.numero, m.nome, s.sub_id FROM _tm_modelos m JOIN _tm_subs s ON s.nome = m.sub ORDER BY s.ordem, m.numero LOOP
    v_mod := NULL;
    SELECT pm.id, pm.is_active INTO v_mod, v_ativa FROM product_models pm
    WHERE pm.organization_id = c_org AND pm.subcategory_id = r.sub_id AND pm.numero = r.numero AND pm.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_mod IS NOT NULL AND NOT v_ativa THEN
      RAISE EXCEPTION 'catalogo_torneiras_mudelar: o modelo % (%) já existe e está desativado.', r.nome, lpad(r.numero::text, 4, '0');
    END IF;
    IF v_mod IS NULL THEN
      INSERT INTO product_models (organization_id, subcategory_id, name, numero, is_active, created_by)
      VALUES (c_org, r.sub_id, r.nome, r.numero, true, v_criador)
      RETURNING id INTO v_mod;
    END IF;
    UPDATE _tm_modelos m SET modelo_id = v_mod WHERE m.sub = r.sub AND m.numero = r.numero;
  END LOOP;

  -- ─── 4. Unidade «un» e fornecedores (procura pelo nome; cria só se não existir) ──────
  v_uom := public.fn_cat_unidade(c_org, c_unidade);
  IF v_uom IS NULL THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: sem unidade «%».', c_unidade; END IF;
  FOR r IN SELECT f.nome FROM _tm_forn f ORDER BY f.nome LOOP
    SELECT count(*), (array_agg(s.id ORDER BY s.created_at, s.id))[1], (array_agg(coalesce(s.is_active, true) ORDER BY s.created_at, s.id))[1]
      INTO v_n, v_opc, v_ativa
    FROM suppliers s
    WHERE s.organization_id = c_org AND s.deleted_at IS NULL AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n > 1 THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: a Mudelar tem % fornecedores «%».', v_n, r.nome; END IF;
    IF v_n = 1 AND NOT v_ativa THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: o fornecedor «%» da Mudelar está desativado.', r.nome; END IF;
    IF v_n = 0 THEN
      INSERT INTO suppliers (organization_id, name, is_active, created_by)
      VALUES (c_org, public.fn_cat_limpar_nome(r.nome), true, v_criador)
      RETURNING id INTO v_opc;
      UPDATE _tm_forn f SET criado = true WHERE f.nome = r.nome;
      v_forn_criados := v_forn_criados || r.nome || '; ';
    END IF;
    UPDATE _tm_forn f SET id = v_opc WHERE f.nome = r.nome;
  END LOOP;

  -- ─── 5. As linhas a gravar, com o SKU (a regra de fn_cat_sku_partes, antes de inserir) ──────────
  CREATE TEMP TABLE _tm_b ON COMMIT DROP AS
  SELECT gen_random_uuid() AS id, l.linha, s.sub_id, s.ordem AS sub_ordem, l.modelo AS numero, m.modelo_id, l.nome, l.marca, k.id AS marca_id,
         k.nome_db AS marca_nome, l.forn, f.id AS forn_id, l.cod, l.custo, l.pvp, l.status,
         l.cor, oc.opcao_id AS cor_opcao, oc.valor AS cor_valor, oc.sigla AS cor_sigla,
         l.acab, oa.opcao_id AS acab_opcao, oa.valor AS acab_valor, oa.sigla AS acab_sigla
  FROM _tm_linhas l
  JOIN _tm_subs s ON s.nome = l.sub
  JOIN _tm_modelos m ON m.sub = l.sub AND m.numero = l.modelo
  JOIN _tm_marcas k ON k.nome = l.marca
  JOIN _tm_forn f ON f.nome = l.forn
  LEFT JOIN _tm_opcoes oc ON oc.papel = 'cor' AND oc.nome = l.cor
  LEFT JOIN _tm_opcoes oa ON oa.papel = 'acabamento' AND oa.nome = l.acab;
  SELECT count(*) INTO v_n FROM _tm_b;
  IF v_n <> c_total THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: % linhas a gravar em vez de %.', v_n, c_total; END IF;

  CREATE TEMP TABLE _tm ON COMMIT DROP AS
  SELECT b.*, (z.pt ->> 'prefixo') AS prefixo, (z.pt -> 'faltas') AS faltas,
         concat_ws('-', z.pt ->> 'prefixo', lpad(b.numero::text, 4, '0'), z.pt ->> 'resto') AS sku
  FROM _tm_b b
  CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, v_cat, b.sub_id,
      coalesce(CASE WHEN b.cor IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_cor, 'sigla', b.cor_sigla)) END, '[]'::jsonb)
      || coalesce(CASE WHEN b.acab IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_acab, 'sigla', b.acab_sigla)) END, '[]'::jsonb)) AS pt) z;
  SELECT count(*), string_agg(x.nome || ' → ' || coalesce(x.sku, 'null') || ' ' || coalesce(x.faltas::text, ''), '; ')
    INTO v_n, v_txt
  FROM (SELECT b.nome, b.sku, b.faltas FROM _tm b WHERE b.prefixo IS NULL OR b.faltas IS DISTINCT FROM '[]'::jsonb ORDER BY b.linha LIMIT 5) x;
  IF v_n > 0 THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: SKU com faltas ou sem prefixo (ex.: %).', v_txt; END IF;

  -- SKU repetido entre as linhas (o mesmo produto duas vezes): PARA e diz quais
  SELECT string_agg(x.sku || ' ×' || x.n || ' (' || x.nomes || ')', '; ') INTO v_txt
  FROM (SELECT b.sku, count(*) AS n, string_agg(b.nome, ' | ' ORDER BY b.linha) AS nomes FROM _tm b
        GROUP BY b.sku HAVING count(*) > 1 ORDER BY b.sku LIMIT 10) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: SKUs repetidos: %', v_txt; END IF;
  -- já usado por outro produto da Mudelar (vivo ou apagado: products_sku_organization_id_key cobre os dois)
  SELECT string_agg(b.sku || ' (' || p.name || ')', '; ') INTO v_txt
  FROM (SELECT b2.sku FROM _tm b2 JOIN products p2 ON p2.organization_id = c_org AND p2.sku = b2.sku ORDER BY b2.sku LIMIT 10) b
  JOIN products p ON p.organization_id = c_org AND p.sku = b.sku;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: SKUs já usados noutros produtos da Mudelar: %', v_txt; END IF;
  v_regex := '^' || c_cat_sigla || '-(' || (SELECT string_agg(s.sigla, '|' ORDER BY s.sigla) FROM _tm_subs s) || ')-[0-9]{4}(-[A-Z0-9]+){1,2}$';
  IF EXISTS (SELECT 1 FROM _tm b WHERE b.sku !~ v_regex) THEN
    RAISE EXCEPTION 'catalogo_torneiras_mudelar: SKU fora do formato (ex.: %).', (SELECT b.sku FROM _tm b WHERE b.sku !~ v_regex LIMIT 1);
  END IF;
  -- o código do fornecedor não se repete entre produtos que o levam (os RHIO/TARSIO não o levam)
  SELECT string_agg(x.forn || ' ' || x.cod, ', ') INTO v_txt
  FROM (SELECT b.forn, b.cod FROM _tm b WHERE b.cod IS NOT NULL GROUP BY b.forn, b.cod HAVING count(*) > 1) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_torneiras_mudelar: códigos de fornecedor repetidos: %', v_txt; END IF;

  -- ─── 6. Gravar (como cat_guardar_produto e cat_ligar_fornecedor_produto, set-based) ───────────────
  INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                        manages_stock, created_by, tipo_catalogo, category_id, subcategory_id, model_id, brand_id, uom_id,
                        supplier_id, fornecedor_livre, sku_gerado)
  SELECT b.id, c_org, b.sku, b.nome, b.status::product_status, true, true, true, false, false,
         true, v_criador, 'produto', v_cat, b.sub_id, b.modelo_id, b.marca_id, v_uom,
         b.forn_id, public.fn_cat_limpar_nome(b.forn), true
  FROM _tm b ORDER BY b.linha;

  INSERT INTO product_organizations (product_id, organization_id, created_by)
  SELECT b.id, c_org, v_criador FROM _tm b ORDER BY b.linha;

  -- custo (preco_exato = o mesmo valor a 2 casas) e PVP 1 µs depois, só para quem tem preço (as SOPHIE não têm)
  INSERT INTO product_prices (product_id, currency, price, preco_exato, valid_from, created_by, price_type, vat_rate)
  SELECT b.id, 'EUR'::currency_code, round(b.custo, 2), round(b.custo, 2), v_agora, v_criador, 'purchase'::price_type, c_iva
  FROM _tm b WHERE b.custo IS NOT NULL
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.pvp, 2), NULL::numeric, v_agora + interval '1 microsecond', v_criador, 'retail'::price_type, c_iva
  FROM _tm b WHERE b.pvp IS NOT NULL;

  -- como cat_guardar_produto_atributos: o value_text é o da opção
  INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_json, unit)
  SELECT b.id, v_a_cor, b.cor_valor, NULL::jsonb, NULL::text FROM _tm b WHERE b.cor IS NOT NULL
  UNION ALL
  SELECT b.id, v_a_acab, b.acab_valor, NULL::jsonb, NULL::text FROM _tm b WHERE b.acab IS NOT NULL;

  -- fornecedor preferido; supplier_sku = código do fornecedor do Excel (RHIO/TARSIO: o SKU novo); preço = custo
  INSERT INTO item_suppliers (organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price, currency,
                              is_preferred, is_active, created_by, preco_data)
  SELECT c_org, 'product', b.id, b.forn_id, NULL, coalesce(b.cod, b.sku), round(b.custo, 2), 'EUR', true, true, v_criador,
         (CASE WHEN b.custo IS NOT NULL THEN current_date END)
  FROM _tm b ORDER BY b.linha;

  -- ─── 7. Conferir (cada contagem é do que está ERRADO; tem de dar 0) ───────────
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
    AND p.subcategory_id IN (SELECT s.sub_id FROM _tm_subs s);
  IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: % produtos nas subcategorias em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(m.sub || ' ' || m.nome || ' ' || coalesce(x.n, 0) || ' em vez de ' || m.esperados, '; ') INTO v_txt
  FROM _tm_modelos m
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p
             WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id IN (SELECT s.sub_id FROM _tm_subs s)
             GROUP BY p.model_id) x ON x.model_id = m.modelo_id
  WHERE coalesce(x.n, 0) <> m.esperados;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: contagem por modelo errada: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM _tm_modelos m JOIN _tm_subs s ON s.nome = m.sub
  LEFT JOIN product_models pm ON pm.id = m.modelo_id
  WHERE NOT coalesce(pm.organization_id = c_org AND pm.subcategory_id = s.sub_id AND pm.deleted_at IS NULL AND pm.is_active
                     AND pm.numero = m.numero AND pm.name = m.nome, false);
  SELECT count(*) INTO v_m FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id IN (SELECT s.sub_id FROM _tm_subs s);
  IF v_n > 0 OR v_m <> c_n_modelos THEN RAISE EXCEPTION 'Conferir: % modelos sem o nome, o número ou vivos; % nas subcategorias (esperados %).', v_n, v_m, c_n_modelos; END IF;

  -- cada produto tal como a linha do Excel (LEFT JOIN + NOT coalesce(…, false): o que falta também conta como errado)
  SELECT count(*), string_agg(b.linha::text, ', ') INTO v_n, v_txt
  FROM _tm b
  LEFT JOIN products p ON p.id = b.id
  LEFT JOIN product_attribute_values vc ON vc.product_id = b.id AND vc.attribute_id = v_a_cor
  LEFT JOIN product_attribute_values va ON va.product_id = b.id AND va.attribute_id = v_a_acab
  LEFT JOIN product_prices pc ON pc.product_id = b.id AND pc.price_type = 'purchase'
  LEFT JOIN product_prices pv ON pv.product_id = b.id AND pv.price_type = 'retail'
  LEFT JOIN item_suppliers i ON i.product_id = b.id AND i.deleted_at IS NULL
  WHERE NOT coalesce(p.organization_id = c_org AND p.name = b.nome AND p.sku = b.sku AND p.sku_gerado AND p.model_id = b.modelo_id
        AND p.category_id = v_cat AND p.subcategory_id = b.sub_id AND p.brand_id = b.marca_id AND p.marca_livre = b.marca_nome
        AND p.uom_id = v_uom AND p.unidade = c_unidade AND p.status::text = b.status AND p.tipo_catalogo = 'produto'
        AND p.manages_stock AND p.is_active AND NOT p.is_deleted AND p.supplier_id = b.forn_id
        AND p.fornecedor_livre = public.fn_cat_limpar_nome(b.forn)
        AND vc.value_text IS NOT DISTINCT FROM b.cor_valor AND (vc.product_id IS NULL OR vc.value_json IS NULL)
        AND va.value_text IS NOT DISTINCT FROM b.acab_valor AND (va.product_id IS NULL OR va.value_json IS NULL)
        AND pc.price IS NOT DISTINCT FROM round(b.custo, 2) AND pc.preco_exato IS NOT DISTINCT FROM round(b.custo, 2)
        AND (pc.product_id IS NULL OR pc.vat_rate = c_iva)
        AND pv.price IS NOT DISTINCT FROM round(b.pvp, 2) AND (pv.product_id IS NULL OR pv.vat_rate = c_iva)
        AND i.supplier_id = b.forn_id AND i.is_preferred AND i.is_active AND i.organization_id = c_org
        AND i.purchase_price IS NOT DISTINCT FROM round(b.custo, 2) AND i.supplier_sku = coalesce(b.cod, b.sku)
        AND i.preco_data IS NOT DISTINCT FROM (CASE WHEN b.custo IS NOT NULL THEN current_date END),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos não ficaram como a linha do Excel (linhas %).', v_n, left(v_txt, 1000); END IF;
  -- nem linhas a mais: Cor + Acabamento, 2 preços por produto com preço, 1 fornecedor e 1 product_organizations por produto
  SELECT (SELECT count(*) FROM product_attribute_values v JOIN _tm b ON b.id = v.product_id),
         (SELECT count(*) FROM product_prices x JOIN _tm b ON b.id = x.product_id)
    INTO v_n, v_m;
  IF v_n <> c_n_cor + c_n_acab OR v_m <> 2 * c_n_com_preco THEN
    RAISE EXCEPTION 'Conferir: % valores de atributos (esperados %) e % preços (esperados %).', v_n, c_n_cor + c_n_acab, v_m, 2 * c_n_com_preco;
  END IF;
  SELECT (SELECT count(*) FROM item_suppliers x JOIN _tm b ON b.id = x.product_id),
         (SELECT count(*) FROM product_organizations x JOIN _tm b ON b.id = x.product_id),
         (SELECT count(*) FROM item_suppliers x JOIN _tm b ON b.id = x.product_id WHERE x.supplier_sku = b.sku)
    INTO v_n, v_m, v_k;
  IF v_n <> c_total OR v_m <> c_total OR v_k <> c_n_sem_cod THEN
    RAISE EXCEPTION 'Conferir: % ligações a fornecedor, % product_organizations (esperados %), % ligações com o SKU novo (esperadas %).',
      v_n, v_m, c_total, v_k, c_n_sem_cod;
  END IF;

  -- SKUs: únicos, no formato, iguais ao recalculado a partir do que ficou gravado (todos)
  SELECT count(*), count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ v_regex OR p.sku ~ '^CAT-') INTO v_n, v_m, v_k
  FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id IN (SELECT s.sub_id FROM _tm_subs s);
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
          WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id IN (SELECT s.sub_id FROM _tm_subs s)) x
        WHERE x.calc IS DISTINCT FROM x.sku OR x.prefixo IS NULL OR x.faltas <> '[]') y;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs diferentes do recalculado pela regra do Catálogo (ex.: %).', v_n, v_txt; END IF;

  -- todos com cat_prever_sku_modelo, como um membro da Mudelar com products.edit (só leitura; claims locais)
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE NOTICE 'catalogo_torneiras_mudelar: sem membro da Mudelar com products.edit — a comparação com cat_prever_sku_modelo ficou por fazer (o recálculo de todos foi feito).';
  ELSE
    v_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    v_n := 0;
    FOR r IN SELECT b.id, b.sku, b.sub_id, b.modelo_id, b.cor_opcao, b.acab_opcao FROM _tm b ORDER BY b.linha LOOP
      v_attrs := coalesce(CASE WHEN r.cor_opcao IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_cor, 'opcao', r.cor_opcao)) END, '[]'::jsonb)
              || coalesce(CASE WHEN r.acab_opcao IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_acab, 'opcao', r.acab_opcao)) END, '[]'::jsonb);
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
              AND NOT EXISTS (SELECT 1 FROM _tm_ja j WHERE j.t = 'brands' AND j.id = x.id)
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid
              AND (x.organization_id IS DISTINCT FROM c_org OR NOT EXISTS (SELECT 1 FROM _tm_subs s WHERE s.criada AND s.sub_id = x.id))
              AND NOT EXISTS (SELECT 1 FROM _tm_ja j WHERE j.t = 'product_categories' AND j.id = x.id)
    UNION ALL SELECT 'product_attributes', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid
              AND NOT EXISTS (SELECT 1 FROM _tm_ja j WHERE j.t = 'product_attributes' AND j.id = x.id)
    UNION ALL SELECT 'attribute_option_groups', count(*) FROM attribute_option_groups x WHERE x.xmin::text = v_xid
              AND NOT EXISTS (SELECT 1 FROM _tm_ja j WHERE j.t = 'attribute_option_groups' AND j.id = x.id)
    UNION ALL SELECT 'attribute_option_group_values', count(*) FROM attribute_option_group_values v
              WHERE v.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _tm_opcoes o WHERE o.opcao_id = v.id AND o.criada)
                AND NOT EXISTS (SELECT 1 FROM _tm_ja j WHERE j.t = 'attribute_option_group_values' AND j.id = v.id)) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: foram escritas linhas fora do âmbito: %', v_txt; END IF;
  IF NOT EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND p.xmin::text = v_xid AND p.subcategory_id IN (SELECT s.sub_id FROM _tm_subs s)) THEN
    RAISE EXCEPTION 'Conferir: os produtos importados não têm o xmin desta transação: a verificação de «nada fora da Mudelar» não vale.';
  END IF;
  -- nenhum outro produto, modelo ou ligação da Mudelar escrito
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _tm b WHERE b.id = p.id)
    AND NOT EXISTS (SELECT 1 FROM _tm_ja j WHERE j.t = 'products' AND j.id = p.id);
  SELECT count(*) INTO v_m FROM product_models pm WHERE pm.organization_id = c_org AND pm.xmin::text = v_xid
    AND NOT EXISTS (SELECT 1 FROM _tm_modelos m WHERE m.modelo_id = pm.id)
    AND NOT EXISTS (SELECT 1 FROM _tm_ja j WHERE j.t = 'product_models' AND j.id = pm.id);
  SELECT count(*) INTO v_k FROM item_suppliers i WHERE i.organization_id = c_org AND i.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _tm b WHERE b.id = i.product_id)
    AND NOT EXISTS (SELECT 1 FROM _tm_ja j WHERE j.t = 'item_suppliers' AND j.id = i.id);
  IF v_n > 0 OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: escritos % outros produtos, % outros modelos e % outras ligações a fornecedor da Mudelar.', v_n, v_m, v_k;
  END IF;

  RAISE NOTICE 'catalogo_torneiras_mudelar: % produtos em «%» (% modelos, % com preço, % sem código de fornecedor). Subcategorias criadas: %. Fornecedores criados: %. Opções criadas: %. Conferido.',
    c_total, c_cat_nome, c_n_modelos, c_n_com_preco, c_n_sem_cod, coalesce(nullif(v_subs_criadas, ''), 'nenhuma'),
    coalesce(nullif(v_forn_criados, ''), 'nenhum'), coalesce(nullif(v_criadas, ''), 'nenhuma');
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
