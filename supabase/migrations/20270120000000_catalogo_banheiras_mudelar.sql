-- =============================================================================
-- Catálogo — importação das BANHEIRAS da MUDELAR (Excel do utilizador, 98358fd2-Banheiras.xlsx).
-- Base de RH (uetjghdkwbywbftedtth). Ficheiro GERADO por script (gerar.js) a partir do Excel: as linhas de dados
-- abaixo não se editam à mão — regeneram-se.
-- =============================================================================
--
-- Decisões do utilizador (17/11):
--   * Um produto = modelo + combinação de atributos: 23 produtos (as 23 linhas do Excel), todos com o
--     estado do Excel (Draft → status 'draft', is_active true). Categoria «Duche & Banho», marca e fornecedor do Excel.
--   * O SKU antigo do Excel NÃO se guarda. O SKU é o do Catálogo: SIGLA_CAT-SIGLA_SUB-NNNN(modelo)-<siglas dos atributos
--     pela ordem configurada da Mudelar>, calculado com fn_cat_sku_partes (a regra de cat_gerar_sku_produto).
--   * Preço Compra arredondado a 2 casas (vem com casas a mais); Desconto 1 e Desconto 2 ignoram-se; Preço Grossista e
--     Preço Distribuidor são todos 0 no Excel e por isso não se grava nenhum (a regra é gravar só quando > 0). IVA 23.
--   * Fornecedor: o que já existe na Mudelar (pelo nome); o código do fornecedor do Excel fica em item_suppliers.supplier_sku.
--   * Subcategoria «Banheiras» de «Duche & Banho» (BN), marca Sanindusa, fornecedor Anlorbel (o que já existe).
--   * 4 modelos (números pela ordem do SKU antigo, sem buracos): Banheira Easy 0001 (2 produtos), Banheira Vértice 0002 (8),
--     Pés de banheira c/ kit fixação 0003 (3) e Painel 0004 (10). Sem cor.
--   * Banheira Easy e Vértice: Medida 2D em cm («150X70» … «190X90»; o primeiro número é a largura, como nas Bases de Duche).
--     Pés de banheira: atributo de lista Largura 60, 70 e 80. Painel: Largura 70, 75, 80, 90, 150, 160, 170, 175, 180 e 190.
--     As opções da Largura procuram-se pelo nome (a Mudelar já tem 60, 70, 75 e 80); criam-se 90, 150, 160, 170, 175, 180 e 190,
--     com a sigla igual ao número.
--
-- Decisões desta migration (a confirmar pelo utilizador):
--   * Estado: o Excel diz «Draft» e o produto entra em draft (as importações anteriores, cujo Excel dizia «active», entraram active).
--   * Nome do produto: o do Excel, sem mexer («BANHEIRA VÉRTICE 150x70», «PAINEL 70»); o modelo leva o nome pedido.
--   * Medida 2D: largura = o primeiro número («150X70» → largura 150, comprimento 70).
--   * Auditoria normal, linha a linha, com app.audit_source = 'migration:catalogo_banheiras_mudelar'. Escrita só na Mudelar.
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
-- Conferir no fim (conta o que está ERRADO e faz RAISE se não for 0): 23 produtos e a contagem por modelo; os
-- modelos; cada produto como a linha do Excel (nome, SKU, modelo, marca, fornecedor, código do fornecedor, estado,
-- unidade, custo, PVP, atributos); nem linhas a mais; SKUs únicos, no formato, iguais ao recalculado e a
-- cat_prever_sku_modelo; nenhuma linha de outra organização com o xmin desta transação.
--
-- ORDEM: depois de 20270118300000_catalogo_modelos_e_sku_por_modelo.sql e de 20270119000000 (atributo Largura).
-- Teste: supabase/tests/catalogo_banheiras_mudelar.test.sql (BEGIN … ROLLBACK, só leitura; o passo 0 falha antes).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '5min';

DO $mig$
DECLARE
  c_org        constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte      constant text    := 'migration:catalogo_banheiras_mudelar';
  c_total      constant integer := 23;
  c_n_modelos  constant integer := 4;
  c_n_valores  constant integer := 23;
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
    RAISE NOTICE 'catalogo_banheiras_mudelar: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  IF to_regclass('public.product_models') IS NULL
     OR to_regprocedure('public.fn_cat_modelo_numero(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)') IS NULL THEN
    RAISE NOTICE 'catalogo_banheiras_mudelar: falta a versão dos modelos (20270118300000) — nada a fazer.';
    RETURN;
  END IF;
  SELECT string_agg(s, ', ') INTO v_txt
  FROM unnest(ARRAY['public.fn_cat_chave_opcao(text)', 'public.fn_cat_limpar_nome(text)', 'public.fn_cat_num_texto(numeric)',
                    'public.fn_cat_grupo_do_atributo(uuid,uuid)', 'public.fn_cat_medida_ler(jsonb,text)',
                    'public.fn_cat_sku_medida(jsonb)', 'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)',
                    'public.fn_cat_sigla_opcao_livre(uuid,text,uuid)', 'public.fn_cat_unidade(uuid,text)',
                    'public.has_anew_permission_in_org(uuid,text,uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_banheiras_mudelar: faltam funções do Catálogo (%).', v_txt; END IF;

  -- categoria
  SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(c.sigla ORDER BY c.created_at, c.id))[1],
         (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1]
    INTO v_n, v_cat, v_cat_sigla, v_cat_ativa
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(c_cat_nome);
  IF v_n = 0 THEN
    RAISE NOTICE 'catalogo_banheiras_mudelar: a Mudelar não tem a categoria «%» — nada a fazer.', c_cat_nome;
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'catalogo_banheiras_mudelar: há % categorias «%» na Mudelar.', v_n, c_cat_nome;
  END IF;
  IF v_cat_sigla IS DISTINCT FROM c_cat_sigla OR NOT v_cat_ativa THEN
    RAISE EXCEPTION 'catalogo_banheiras_mudelar: «%» tem a sigla «%» (esperada %) ou está desativada.', c_cat_nome, v_cat_sigla, c_cat_sigla;
  END IF;

  -- ─── Os dados do Excel (gerados) ──────────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._imp_subs, pg_temp._imp_modelos, pg_temp._imp_opcoes, pg_temp._imp_marcas, pg_temp._imp_forn,
                       pg_temp._imp_linhas, pg_temp._imp_b, pg_temp._imp;

  CREATE TEMP TABLE _imp_subs (nome text PRIMARY KEY, sigla text NOT NULL, sub_id uuid) ON COMMIT DROP;
  INSERT INTO _imp_subs (nome, sigla) VALUES
    ('Banheiras', 'BN');

  -- os modelos: subcategoria, número (NNNN do SKU), nome, quantos produtos tem
  CREATE TEMP TABLE _imp_modelos (sub text NOT NULL, numero smallint NOT NULL, nome text NOT NULL, esperados integer NOT NULL,
                                  modelo_id uuid, PRIMARY KEY (sub, numero)) ON COMMIT DROP;
  INSERT INTO _imp_modelos (sub, numero, nome, esperados) VALUES
    ('Banheiras', 1, 'Banheira Easy', 2),
    ('Banheiras', 2, 'Banheira Vértice', 8),
    ('Banheiras', 3, 'Pés de banheira c/ kit fixação', 3),
    ('Banheiras', 4, 'Painel', 10);

  -- as opções de Cor e de Largura que os produtos usam (procuradas pelo nome; criadas se faltarem)
  CREATE TEMP TABLE _imp_opcoes (papel text NOT NULL, nome text NOT NULL, ordem integer NOT NULL, grupo uuid, opcao_id uuid,
                                 valor text, sigla text, PRIMARY KEY (papel, nome)) ON COMMIT DROP;
  INSERT INTO _imp_opcoes (papel, nome, ordem) VALUES
    ('largura', '60', 1),
    ('largura', '70', 2),
    ('largura', '75', 3),
    ('largura', '80', 4),
    ('largura', '90', 5),
    ('largura', '150', 6),
    ('largura', '160', 7),
    ('largura', '170', 8),
    ('largura', '175', 9),
    ('largura', '180', 10),
    ('largura', '190', 11);

  CREATE TEMP TABLE _imp_marcas (nome text PRIMARY KEY, id uuid, nome_db text) ON COMMIT DROP;
  INSERT INTO _imp_marcas (nome) VALUES
    ('Sanindusa');
  CREATE TEMP TABLE _imp_forn (nome text PRIMARY KEY, id uuid, criado boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _imp_forn (nome) VALUES
    ('ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO');

  -- as 23 linhas do Excel, pela ordem do Excel
  CREATE TEMP TABLE _imp_linhas (linha integer PRIMARY KEY, sub text NOT NULL, modelo smallint NOT NULL, nome text NOT NULL,
                                 marca text NOT NULL, forn text NOT NULL, cod text, custo numeric NOT NULL, pvp numeric NOT NULL,
                                 cor text, larg text, ml integer, mc integer, status text NOT NULL) ON COMMIT DROP;
  INSERT INTO _imp_linhas (linha, sub, modelo, nome, marca, forn, cod, custo, pvp, cor, larg, ml, mc, status) VALUES
    (2, 'Banheiras', 2, 'BANHEIRA VÉRTICE 150x70', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '807500', 121.27, 189.49, NULL::text, NULL::text, 150, 70, 'draft'),
    (3, 'Banheiras', 2, 'BANHEIRA VÉRTICE 160x70', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805600', 135.53, 211.77, NULL::text, NULL::text, 160, 70, 'draft'),
    (4, 'Banheiras', 2, 'BANHEIRA VÉRTICE 160x75', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805700', 143.50, 224.22, NULL::text, NULL::text, 160, 75, 'draft'),
    (5, 'Banheiras', 2, 'BANHEIRA VÉRTICE 170x75', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805900', 159.46, 249.16, NULL::text, NULL::text, 170, 75, 'draft'),
    (6, 'Banheiras', 2, 'BANHEIRA VÉRTICE 170x70', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805800', 151.49, 236.70, NULL::text, NULL::text, 170, 70, 'draft'),
    (7, 'Banheiras', 2, 'BANHEIRA VÉRTICE 175x80', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806000', 169.43, 264.74, NULL::text, NULL::text, 175, 80, 'draft'),
    (8, 'Banheiras', 2, 'BANHEIRA VÉRTICE 180x80', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806100', 179.39, 280.30, NULL::text, NULL::text, 180, 80, 'draft'),
    (9, 'Banheiras', 2, 'BANHEIRA VÉRTICE 190x90', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806200', 189.34, 295.85, NULL::text, NULL::text, 190, 90, 'draft'),
    (10, 'Banheiras', 1, 'BANHEIRA EASY 170x70', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806800', 106.54, 166.47, NULL::text, NULL::text, 170, 70, 'draft'),
    (11, 'Banheiras', 1, 'BANHEIRA EASY 170x75', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806900', 112.15, 175.23, NULL::text, NULL::text, 170, 75, 'draft'),
    (12, 'Banheiras', 3, 'PÉS DE BANHEIRA C/KIT FIXAÇÃO 60', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '810', 12.95, 20.23, NULL::text, '60', NULL::integer, NULL::integer, 'draft'),
    (13, 'Banheiras', 3, 'PÉS DE BANHEIRA C/KIT FIXAÇÃO 70', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '811', 12.95, 20.23, NULL::text, '70', NULL::integer, NULL::integer, 'draft'),
    (14, 'Banheiras', 3, 'PÉS DE BANHEIRA C/KIT FIXAÇÃO 80', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '813', 12.95, 20.23, NULL::text, '80', NULL::integer, NULL::integer, 'draft'),
    (15, 'Banheiras', 4, 'PAINEL 70', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '800203', 43.97, 68.70, NULL::text, '70', NULL::integer, NULL::integer, 'draft'),
    (16, 'Banheiras', 4, 'PAINEL 75', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '800202', 46.16, 72.13, NULL::text, '75', NULL::integer, NULL::integer, 'draft'),
    (17, 'Banheiras', 4, 'PAINEL 80', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '800302', 53.52, 83.62, NULL::text, '80', NULL::integer, NULL::integer, 'draft'),
    (18, 'Banheiras', 4, 'PAINEL 90', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806202', 66.05, 103.21, NULL::text, '90', NULL::integer, NULL::integer, 'draft'),
    (19, 'Banheiras', 4, 'PAINEL 150', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '800601', 78.01, 121.89, NULL::text, '150', NULL::integer, NULL::integer, 'draft'),
    (20, 'Banheiras', 4, 'PAINEL 160', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805601', 82.34, 128.66, NULL::text, '160', NULL::integer, NULL::integer, 'draft'),
    (21, 'Banheiras', 4, 'PAINEL 170', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805801', 90.56, 141.50, NULL::text, '170', NULL::integer, NULL::integer, 'draft'),
    (22, 'Banheiras', 4, 'PAINEL 175', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806001', 95.33, 148.95, NULL::text, '175', NULL::integer, NULL::integer, 'draft'),
    (23, 'Banheiras', 4, 'PAINEL 180', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '805101', 102.95, 160.86, NULL::text, '180', NULL::integer, NULL::integer, 'draft'),
    (24, 'Banheiras', 4, 'PAINEL 190', 'Sanindusa', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '806201', 115.46, 180.41, NULL::text, '190', NULL::integer, NULL::integer, 'draft');

  -- os dados gerados estão inteiros
  SELECT count(*), count(DISTINCT l.nome),
         count(*) FILTER (WHERE l.cor IS NOT NULL) + count(*) FILTER (WHERE l.larg IS NOT NULL) + count(*) FILTER (WHERE l.ml IS NOT NULL)
    INTO v_n, v_m, v_k FROM _imp_linhas l;
  IF v_n <> c_total OR v_m <> c_total OR v_k <> c_n_valores THEN
    RAISE EXCEPTION 'catalogo_banheiras_mudelar: os dados gerados têm % linhas (% nomes distintos, % valores de atributos) em vez de % (%, %).',
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
    RAISE EXCEPTION 'catalogo_banheiras_mudelar: os dados gerados têm linhas com modelo, subcategoria, marca, fornecedor ou opção fora das tabelas geradas.';
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
      RAISE NOTICE 'catalogo_banheiras_mudelar: a Mudelar não tem a subcategoria «%» › «%» — nada a fazer.', c_cat_nome, r.nome;
      RETURN;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'catalogo_banheiras_mudelar: há % subcategorias «%» em «%».', v_n, r.nome, c_cat_nome;
    END IF;
    IF v_sub_sigla IS DISTINCT FROM r.sigla OR NOT v_sub_ativa THEN
      RAISE EXCEPTION 'catalogo_banheiras_mudelar: a subcategoria «%» tem a sigla «%» (esperada %) ou está desativada.', r.nome, v_sub_sigla, r.sigla;
    END IF;
    UPDATE _imp_subs s SET sub_id = v_sub WHERE s.nome = r.nome;
  END LOOP;

  -- já aplicada / produtos de outros / modelos em conflito → inerte
  SELECT count(*) INTO v_n FROM products p JOIN _imp_subs s ON s.sub_id = p.subcategory_id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT l.nome FROM _imp_linhas l WHERE l.sub = s.nome);
  IF v_n = c_total THEN
    RAISE NOTICE 'catalogo_banheiras_mudelar: já aplicada (os % produtos já existem) — nada a fazer.', c_total;
    RETURN;
  ELSIF v_n > 0 THEN
    RAISE EXCEPTION 'catalogo_banheiras_mudelar: só % dos % produtos já existem na Mudelar. Rever antes de aplicar.', v_n, c_total;
  END IF;
  IF EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             AND p.subcategory_id IN (SELECT s.sub_id FROM _imp_subs s)) THEN
    RAISE NOTICE 'catalogo_banheiras_mudelar: as subcategorias já têm produtos que não são estes — nada a fazer.';
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
    RAISE NOTICE 'catalogo_banheiras_mudelar: as subcategorias já têm modelos com estes nomes ou números, diferentes dos do Excel (%) — nada a fazer.', v_txt;
    RETURN;
  END IF;

  -- ─── Configuração que tem de existir (senão: erro) ───────────────────────────
  SELECT m.user_id INTO v_criador
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND coalesce(m.role_is_client, false) = false
  ORDER BY m.created_at, m.user_id LIMIT 1;
  IF v_criador IS NULL THEN RAISE EXCEPTION 'catalogo_banheiras_mudelar: a Mudelar não tem um membro ativo para created_by.'; END IF;

  FOR r IN SELECT k.nome FROM _imp_marcas k ORDER BY k.nome LOOP
    SELECT count(*), (array_agg(b.id ORDER BY b.created_at, b.id))[1], (array_agg(coalesce(b.is_active, true) ORDER BY b.created_at, b.id))[1],
           (array_agg(b.name ORDER BY b.created_at, b.id))[1]
      INTO v_n, v_opc, v_ativa, v_nome
    FROM brands b
    WHERE b.organization_id = c_org AND b.deleted_at IS NULL AND public.fn_cat_chave_opcao(b.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n <> 1 THEN RAISE EXCEPTION 'catalogo_banheiras_mudelar: a Mudelar tem % marcas «%» (tem de ter uma).', v_n, r.nome; END IF;
    IF NOT v_ativa THEN RAISE EXCEPTION 'catalogo_banheiras_mudelar: a marca «%» está desativada.', r.nome; END IF;
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
    RAISE EXCEPTION 'catalogo_banheiras_mudelar: a Mudelar tem de ter um atributo cor, um largura (de lista) e uma medida (is_measurement).';
  END IF;
  IF coalesce(lower(v_med_unit), 'cm') <> 'cm' THEN
    RAISE EXCEPTION 'catalogo_banheiras_mudelar: a Medida da Mudelar está em «%»; as medidas do Excel são em cm.', v_med_unit;
  END IF;
  v_g_cor := public.fn_cat_grupo_do_atributo(v_a_cor, c_org);
  v_g_larg := public.fn_cat_grupo_do_atributo(v_a_larg, c_org);
  IF NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_cor AND g.organization_id = c_org)
     OR NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = v_g_larg AND g.organization_id = c_org) THEN
    RAISE EXCEPTION 'catalogo_banheiras_mudelar: as opções de Cor ou de Largura em uso na Mudelar não são de um grupo da Mudelar.';
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
    IF v_n > 1 THEN RAISE EXCEPTION 'catalogo_banheiras_mudelar: há % opções «%» na % da Mudelar.', v_n, r.nome, r.papel; END IF;
    IF v_n = 1 AND NOT v_ativa THEN RAISE EXCEPTION 'catalogo_banheiras_mudelar: a opção «%» (%) da Mudelar está desativada.', r.nome, r.papel; END IF;
    IF v_n = 0 THEN
      -- Largura: a sigla é o número, se estiver livre; Cor: a sugestão livre
      IF r.papel = 'largura' AND NOT EXISTS (SELECT 1 FROM attribute_option_group_values v WHERE v.group_id = r.grupo AND v.sigla = r.nome) THEN
        v_txt := r.nome;
      ELSE
        v_txt := public.fn_cat_sigla_opcao_livre(r.grupo, r.nome, NULL);
      END IF;
      IF v_txt IS NULL THEN RAISE EXCEPTION 'catalogo_banheiras_mudelar: sem sigla livre para a opção «%» (%).', r.nome, r.papel; END IF;
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
    RAISE EXCEPTION 'catalogo_banheiras_mudelar: há opções sem sigla (o SKU precisa dela).';
  END IF;

  -- ─── 2. Os modelos nas subcategorias ──────────────────────────────────────────
  SELECT count(*) FILTER (WHERE pm.is_active), count(*) INTO v_n, v_m
  FROM product_models pm WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL;
  IF v_n + c_n_modelos > c_max_modelos_ativos OR v_m + c_n_modelos > c_max_modelos_vivos THEN
    RAISE EXCEPTION 'catalogo_banheiras_mudelar: a Mudelar passaria o teto de modelos (% ativos, % vivos).', v_n, v_m;
  END IF;
  FOR r IN SELECT m.sub, m.numero, m.nome, s.sub_id FROM _imp_modelos m JOIN _imp_subs s ON s.nome = m.sub ORDER BY m.sub, m.numero LOOP
    v_mod := NULL;
    SELECT pm.id, pm.is_active INTO v_mod, v_ativa FROM product_models pm
    WHERE pm.organization_id = c_org AND pm.subcategory_id = r.sub_id AND pm.numero = r.numero AND pm.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_mod IS NOT NULL AND NOT v_ativa THEN
      RAISE EXCEPTION 'catalogo_banheiras_mudelar: o modelo % (%) já existe e está desativado.', r.nome, lpad(r.numero::text, 4, '0');
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
  IF v_uom IS NULL THEN RAISE EXCEPTION 'catalogo_banheiras_mudelar: sem unidade «%».', c_unidade; END IF;
  FOR r IN SELECT f.nome FROM _imp_forn f ORDER BY f.nome LOOP
    v_opc := NULL;
    SELECT s.id, coalesce(s.is_active, true) INTO v_opc, v_ativa FROM suppliers s
    WHERE s.organization_id = c_org AND s.deleted_at IS NULL AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(r.nome)
    ORDER BY s.created_at, s.id LIMIT 1;
    IF v_opc IS NOT NULL AND NOT v_ativa THEN RAISE EXCEPTION 'catalogo_banheiras_mudelar: o fornecedor «%» da Mudelar está desativado.', r.nome; END IF;
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
  IF v_n <> c_total THEN RAISE EXCEPTION 'catalogo_banheiras_mudelar: % linhas a gravar em vez de %.', v_n, c_total; END IF;

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
  IF v_n > 0 THEN RAISE EXCEPTION 'catalogo_banheiras_mudelar: SKU com faltas ou sem prefixo (ex.: %).', v_txt; END IF;

  -- SKU repetido entre as linhas (o mesmo produto duas vezes): para e diz quais
  SELECT string_agg(x.sku || ' ×' || x.n || ' (' || x.nomes || ')', '; ') INTO v_txt
  FROM (SELECT b.sku, count(*) AS n, string_agg(b.nome, ' | ' ORDER BY b.linha) AS nomes FROM _imp b
        GROUP BY b.sku HAVING count(*) > 1 ORDER BY b.sku LIMIT 10) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_banheiras_mudelar: SKUs repetidos: %', v_txt; END IF;
  -- já usado por outro produto da Mudelar (vivo ou apagado)
  SELECT string_agg(b.sku || ' (' || p.name || ')', '; ') INTO v_txt
  FROM (SELECT b2.sku FROM _imp b2 JOIN products p2 ON p2.organization_id = c_org AND p2.sku = b2.sku ORDER BY b2.sku LIMIT 10) b
  JOIN products p ON p.organization_id = c_org AND p.sku = b.sku;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'catalogo_banheiras_mudelar: SKUs já usados noutros produtos da Mudelar: %', v_txt; END IF;
  v_regex := '^' || c_cat_sigla || '-(' || (SELECT string_agg(s.sigla, '|' ORDER BY s.sigla) FROM _imp_subs s) || ')-[0-9]{4}(-[A-Z0-9]+){0,3}$';
  IF EXISTS (SELECT 1 FROM _imp b WHERE b.sku !~ v_regex) THEN
    RAISE EXCEPTION 'catalogo_banheiras_mudelar: SKU fora do formato (ex.: %).', (SELECT b.sku FROM _imp b WHERE b.sku !~ v_regex LIMIT 1);
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
    RAISE NOTICE 'catalogo_banheiras_mudelar: sem membro da Mudelar com products.edit — a comparação com cat_prever_sku_modelo ficou por fazer (o recálculo de todos foi feito).';
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

  RAISE NOTICE 'catalogo_banheiras_mudelar: % produtos em «%» (% modelos), fornecedores criados: %. Opções criadas: %. Conferido.',
    c_total, c_cat_nome, c_n_modelos, coalesce(nullif(v_forn_criados, ''), 'nenhum'), coalesce(nullif(v_criadas, ''), 'nenhuma');
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
