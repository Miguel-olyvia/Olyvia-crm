-- ============================================================
-- Testes: 20270120600000_catalogo_torneiras_mudelar.sql (base RH)
-- ============================================================
-- Ficheiro GERADO (gerar.cjs + montar.cjs) a partir do mesmo Excel da migration.
-- ORDEM: correr ANTES do db push da 120600000 (falha no passo 0: «Torneiras & Misturadoras» da Mudelar tem 0
-- produtos em vez de 281); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
-- Não depende da correção 20270120500000 (Cor ≠ Acabamento): procura as opções pelo nome e só olha para as Torneiras.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355). Para comparar os SKUs com cat_prever_sku_modelo usa, só nesta transação, as
-- claims de um membro ativo da Mudelar com products.edit (a função é só de leitura). Nenhuma chamada recusada de propósito.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_torneiras_mudelar.test.sql
--
-- O que PROVA:
--   1. Os 54 modelos nas 11 subcategorias (nome e número), vivos e ativos, e nenhum outro.
--   2. Cada um dos 281 produtos, pelo nome: subcategoria, modelo, marca, fornecedor, estado (active; as 12 SOPHIE sem preço em draft), Cor e Acabamento (e só
--      esses), custo e PVP (as 12 SOPHIE sem preço), e a ligação ao fornecedor com o código do Excel ou, nos 50 RHIO/TARSIO,
--      o SKU novo.
--   3. Nenhum produto a mais nas subcategorias; nenhum nome com «(cod.».
--   4. SKUs únicos na Mudelar, no formato TM-SUB-NNNN-…, sem provisórios, iguais ao recalculado pela regra (todos) e a
--      cat_prever_sku_modelo (amostra de 40).
--   5. A Cor dos produtos usa Preto/Branco/Dourado (não NEGRO/BLANCO/ORO) e nenhum tem Cor Cromo.
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A importação foi aplicada? ───────────────────────────────────────────
DO $t0$
DECLARE v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM products p
  JOIN product_categories s ON s.id = p.subcategory_id
  JOIN product_categories c ON c.id = s.parent_id
  WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
    AND c.parent_id IS NULL AND public.fn_cat_chave_opcao(c.name) = 'torneiras & misturadoras';
  IF v_n <> 281 THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — «Torneiras & Misturadoras» da Mudelar tem % produtos em vez de 281 (aplicar 20270120600000).', v_n;
  END IF;
END $t0$;

-- ─── 1 a 5 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  v_cat uuid; v_subs uuid[]; v_a_cor uuid; v_a_acab uuid;
  v_n bigint; v_m bigint; v_k bigint; v_txt text; v_auth uuid; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  SELECT c.id INTO v_cat FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND public.fn_cat_chave_opcao(c.name) = 'torneiras & misturadoras';
  SELECT a.id INTO v_a_cor FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'cor';
  SELECT a.id INTO v_a_acab FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'acabamento';
  CREATE TEMP TABLE _tt_subs (nome text PRIMARY KEY, sigla text NOT NULL, sub_id uuid) ON COMMIT DROP;
  INSERT INTO _tt_subs (nome, sigla) VALUES
    ('Torneira Lavatorio', 'TL'),
    ('Torneira Pe Alto', 'TPA'),
    ('Torneira Bide', 'TBD'),
    ('Torneira Banheira', 'TB'),
    ('Torneira Encastre', 'TE'),
    ('Torneira Duche', 'TD'),
    ('Misturadoras Monocomando', 'MM'),
    ('Misturadoras Monocomando Abativel', 'MMA'),
    ('Misturadoras Monocomando Extraivel', 'MME'),
    ('Misturadoras Monocomando Flexivel', 'MMF'),
    ('Misturadoras Monocomando Giratoria', 'MMG');
  UPDATE _tt_subs t SET sub_id = c.id FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL AND c.sigla = t.sigla
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(t.nome);
  SELECT array_agg(t.sub_id) INTO v_subs FROM _tt_subs t WHERE t.sub_id IS NOT NULL;
  IF v_cat IS NULL OR v_a_cor IS NULL OR v_a_acab IS NULL OR cardinality(v_subs) IS DISTINCT FROM 11 THEN
    RAISE EXCEPTION 'FALHOU: configuração da Mudelar incompleta (categoria, 11 subcategorias com a sigla, Cor, Acabamento).';
  END IF;

  -- 1. modelos
  CREATE TEMP TABLE _tt_modelos (sub text NOT NULL, numero smallint NOT NULL, nome text NOT NULL, n integer NOT NULL) ON COMMIT DROP;
  INSERT INTO _tt_modelos (sub, numero, nome, n) VALUES
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
  SELECT count(*), string_agg(m.sub || ' ' || m.nome, ', ') INTO v_n, v_txt FROM _tt_modelos m JOIN _tt_subs t ON t.nome = m.sub
  WHERE (SELECT count(*) FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id = t.sub_id AND pm.deleted_at IS NULL
         AND pm.is_active AND pm.name = m.nome AND pm.numero = m.numero) <> 1;
  SELECT count(*) INTO v_m FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id = ANY (v_subs);
  IF v_n > 0 OR v_m <> 54 THEN RAISE EXCEPTION 'FALHOU: passo 1 — modelos em falta (%): %; % nas subcategorias (esperados 54).', v_n, v_txt, v_m; END IF;

  -- 2. cada produto
  CREATE TEMP TABLE _tt (nome text PRIMARY KEY, sub text NOT NULL, modelo text NOT NULL, marca text NOT NULL, forn text NOT NULL,
                         cod text, custo numeric, pvp numeric, cor text, acab text, status text NOT NULL) ON COMMIT DROP;
  INSERT INTO _tt (nome, sub, modelo, marca, forn, cod, custo, pvp, cor, acab, status) VALUES
    ('Torneira de Lavatorio SIRIO Cromo', 'Torneira Lavatorio', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170', 35.40, 59.00, NULL, 'Cromado', 'active'),
    ('Torneira de Lavatorio SIRIO Negro', 'Torneira Lavatorio', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170NG', 41.40, 69.00, 'Preto', NULL, 'active'),
    ('Torneira de Lavatorio SIRIO Oro', 'Torneira Lavatorio', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170OR', 43.80, 73.00, 'Dourado', NULL, 'active'),
    ('Torneira de Lavatorio SIRIO Niquel', 'Torneira Lavatorio', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170NK', 43.80, 73.00, 'Níquel', NULL, 'active'),
    ('Torneira de Lavatorio SIRIO Titanio', 'Torneira Lavatorio', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170T', 43.80, 73.00, 'Titânio', NULL, 'active'),
    ('Torneira de Lavatorio SIRIO Cobre', 'Torneira Lavatorio', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170CB', 43.80, 73.00, 'Cobre', NULL, 'active'),
    ('Torneira de Lavatorio SIRIO Blanco', 'Torneira Lavatorio', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3170BL', 43.80, 73.00, 'Branco', NULL, 'active'),
    ('Torneira de Pe Alto SIRIO Cromo', 'Torneira Pe Alto', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172', 57.00, 95.00, NULL, 'Cromado', 'active'),
    ('Torneira de Pe Alto SIRIO Negro', 'Torneira Pe Alto', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172NG', 65.40, 109.00, 'Preto', NULL, 'active'),
    ('Torneira de Pe Alto SIRIO Oro', 'Torneira Pe Alto', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172OR', 71.40, 119.00, 'Dourado', NULL, 'active'),
    ('Torneira de Pe Alto SIRIO Niquel', 'Torneira Pe Alto', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172NK', 71.40, 119.00, 'Níquel', NULL, 'active'),
    ('Torneira de Pe Alto SIRIO Titanio', 'Torneira Pe Alto', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172T', 71.40, 119.00, 'Titânio', NULL, 'active'),
    ('Torneira de Pe Alto SIRIO Cobre', 'Torneira Pe Alto', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172CB', 71.40, 119.00, 'Cobre', NULL, 'active'),
    ('Torneira de Pe Alto SIRIO Blanco', 'Torneira Pe Alto', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3172BL', 71.40, 119.00, 'Branco', NULL, 'active'),
    ('Torneira de Bide SIRIO Cromo', 'Torneira Bide', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171', 35.40, 59.00, NULL, 'Cromado', 'active'),
    ('Torneira de Bide SIRIO Negro', 'Torneira Bide', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171NG', 41.40, 69.00, 'Preto', NULL, 'active'),
    ('Torneira de Bide SIRIO Oro', 'Torneira Bide', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171OR', 43.80, 73.00, 'Dourado', NULL, 'active'),
    ('Torneira de Bide SIRIO Niquel', 'Torneira Bide', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171NK', 43.80, 73.00, 'Níquel', NULL, 'active'),
    ('Torneira de Bide SIRIO Titanio', 'Torneira Bide', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171T', 43.80, 73.00, 'Titânio', NULL, 'active'),
    ('Torneira de Bide SIRIO Cobre', 'Torneira Bide', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171CB', 43.80, 73.00, 'Cobre', NULL, 'active'),
    ('Torneira de Bide SIRIO Blanco', 'Torneira Bide', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3171BL', 43.80, 73.00, 'Branco', NULL, 'active'),
    ('Torneira de Banheira SIRIO Cromo', 'Torneira Banheira', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173', 83.40, 139.00, NULL, 'Cromado', 'active'),
    ('Torneira de Banheira SIRIO Negro', 'Torneira Banheira', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173NG', 101.40, 169.00, 'Preto', NULL, 'active'),
    ('Torneira de Banheira SIRIO Oro', 'Torneira Banheira', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173OR', 113.40, 189.00, 'Dourado', NULL, 'active'),
    ('Torneira de Banheira SIRIO Niquel', 'Torneira Banheira', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173NK', 113.40, 189.00, 'Níquel', NULL, 'active'),
    ('Torneira de Banheira SIRIO Titanio', 'Torneira Banheira', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173T', 113.40, 189.00, 'Titânio', NULL, 'active'),
    ('Torneira de Banheira SIRIO Cobre', 'Torneira Banheira', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173CB', 113.40, 189.00, 'Cobre', NULL, 'active'),
    ('Torneira de Banheira SIRIO Blanco', 'Torneira Banheira', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3173BL', 113.40, 189.00, 'Branco', NULL, 'active'),
    ('Torneira de Encastre SIRIO Cromo', 'Torneira Encastre', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190', 48.60, 81.00, NULL, 'Cromado', 'active'),
    ('Torneira de Encastre SIRIO Negro', 'Torneira Encastre', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190NG', 53.40, 89.00, 'Preto', NULL, 'active'),
    ('Torneira de Encastre SIRIO Oro', 'Torneira Encastre', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190OR', 61.20, 102.00, 'Dourado', NULL, 'active'),
    ('Torneira de Encastre SIRIO Niquel', 'Torneira Encastre', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190NK', 61.20, 102.00, 'Níquel', NULL, 'active'),
    ('Torneira de Encastre SIRIO Titanio', 'Torneira Encastre', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190T', 61.20, 102.00, 'Titânio', NULL, 'active'),
    ('Torneira de Encastre SIRIO Cobre', 'Torneira Encastre', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190CB', 61.20, 102.00, 'Cobre', NULL, 'active'),
    ('Torneira de Encastre SIRIO Blanco', 'Torneira Encastre', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3190BL', 61.20, 102.00, 'Branco', NULL, 'active'),
    ('Torneira de Duche SIRIO Cromo', 'Torneira Duche', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174', 57.00, 95.00, NULL, 'Cromado', 'active'),
    ('Torneira de Duche SIRIO Negro', 'Torneira Duche', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174NG', 65.40, 109.00, 'Preto', NULL, 'active'),
    ('Torneira de Duche SIRIO Oro', 'Torneira Duche', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174OR', 71.40, 119.00, 'Dourado', NULL, 'active'),
    ('Torneira de Duche SIRIO Niquel', 'Torneira Duche', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174NK', 71.40, 119.00, 'Níquel', NULL, 'active'),
    ('Torneira de Duche SIRIO Titanio', 'Torneira Duche', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174T', 71.40, 119.00, 'Titânio', NULL, 'active'),
    ('Torneira de Duche SIRIO Cobre', 'Torneira Duche', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174CB', 71.40, 119.00, 'Cobre', NULL, 'active'),
    ('Torneira de Duche SIRIO Blanco', 'Torneira Duche', 'SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3174BL', 71.40, 119.00, 'Branco', NULL, 'active'),
    ('Torneira de Lavatorio HELIOS Cromo', 'Torneira Lavatorio', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218', 39.00, 65.00, NULL, 'Cromado', 'active'),
    ('Torneira de Lavatorio HELIOS Negro', 'Torneira Lavatorio', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218NG', 45.00, 75.00, 'Preto', NULL, 'active'),
    ('Torneira de Lavatorio HELIOS Oro', 'Torneira Lavatorio', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218OR', 49.80, 83.00, 'Dourado', NULL, 'active'),
    ('Torneira de Lavatorio HELIOS Niquel', 'Torneira Lavatorio', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218NK', 49.80, 83.00, 'Níquel', NULL, 'active'),
    ('Torneira de Lavatorio HELIOS Titanio', 'Torneira Lavatorio', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218T', 49.80, 83.00, 'Titânio', NULL, 'active'),
    ('Torneira de Lavatorio HELIOS Cobre', 'Torneira Lavatorio', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218CB', 49.80, 83.00, 'Cobre', NULL, 'active'),
    ('Torneira de Lavatorio HELIOS Blanco', 'Torneira Lavatorio', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3218BL', 49.80, 83.00, 'Branco', NULL, 'active'),
    ('Torneira de Pe Alto HELIOS Cromo', 'Torneira Pe Alto', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219', 59.40, 99.00, NULL, 'Cromado', 'active'),
    ('Torneira de Pe Alto HELIOS Negro', 'Torneira Pe Alto', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219NG', 69.00, 115.00, 'Preto', NULL, 'active'),
    ('Torneira de Pe Alto HELIOS Oro', 'Torneira Pe Alto', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219OR', 75.00, 125.00, 'Dourado', NULL, 'active'),
    ('Torneira de Pe Alto HELIOS Niquel', 'Torneira Pe Alto', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219NK', 75.00, 125.00, 'Níquel', NULL, 'active'),
    ('Torneira de Pe Alto HELIOS Titanio', 'Torneira Pe Alto', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219T', 75.00, 125.00, 'Titânio', NULL, 'active'),
    ('Torneira de Pe Alto HELIOS Cobre', 'Torneira Pe Alto', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219CB', 75.00, 125.00, 'Cobre', NULL, 'active'),
    ('Torneira de Pe Alto HELIOS Blanco', 'Torneira Pe Alto', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3219BL', 75.00, 125.00, 'Branco', NULL, 'active'),
    ('Torneira de Bide HELIOS Cromo', 'Torneira Bide', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222', 39.00, 65.00, NULL, 'Cromado', 'active'),
    ('Torneira de Bide HELIOS Negro', 'Torneira Bide', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222NG', 45.00, 75.00, 'Preto', NULL, 'active'),
    ('Torneira de Bide HELIOS Oro', 'Torneira Bide', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222OR', 49.80, 83.00, 'Dourado', NULL, 'active'),
    ('Torneira de Bide HELIOS Niquel', 'Torneira Bide', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222NK', 49.80, 83.00, 'Níquel', NULL, 'active'),
    ('Torneira de Bide HELIOS Titanio', 'Torneira Bide', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222T', 49.80, 83.00, 'Titânio', NULL, 'active'),
    ('Torneira de Bide HELIOS Cobre', 'Torneira Bide', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222CB', 49.80, 83.00, 'Cobre', NULL, 'active'),
    ('Torneira de Bide HELIOS Blanco', 'Torneira Bide', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3222BL', 49.80, 83.00, 'Branco', NULL, 'active'),
    ('Torneira de Banheira HELIOS Cromo', 'Torneira Banheira', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223', 87.00, 145.00, NULL, 'Cromado', 'active'),
    ('Torneira de Banheira HELIOS Negro', 'Torneira Banheira', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223NG', 105.00, 175.00, 'Preto', NULL, 'active'),
    ('Torneira de Banheira HELIOS Oro', 'Torneira Banheira', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223OR', 114.00, 190.00, 'Dourado', NULL, 'active'),
    ('Torneira de Banheira HELIOS Niquel', 'Torneira Banheira', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223NK', 114.00, 190.00, 'Níquel', NULL, 'active'),
    ('Torneira de Banheira HELIOS Titanio', 'Torneira Banheira', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223T', 114.00, 190.00, 'Titânio', NULL, 'active'),
    ('Torneira de Banheira HELIOS Cobre', 'Torneira Banheira', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223CB', 114.00, 190.00, 'Cobre', NULL, 'active'),
    ('Torneira de Banheira HELIOS Blanco', 'Torneira Banheira', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3223BL', 114.00, 190.00, 'Branco', NULL, 'active'),
    ('Torneira de Duche HELIOS Cromo', 'Torneira Duche', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224', 59.40, 99.00, NULL, 'Cromado', 'active'),
    ('Torneira de Duche HELIOS Negro', 'Torneira Duche', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224NG', 69.00, 115.00, 'Preto', NULL, 'active'),
    ('Torneira de Duche HELIOS Oro', 'Torneira Duche', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224OR', 75.00, 125.00, 'Dourado', NULL, 'active'),
    ('Torneira de Duche HELIOS Niquel', 'Torneira Duche', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224NK', 75.00, 125.00, 'Níquel', NULL, 'active'),
    ('Torneira de Duche HELIOS Titanio', 'Torneira Duche', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224T', 75.00, 125.00, 'Titânio', NULL, 'active'),
    ('Torneira de Duche HELIOS Cobre', 'Torneira Duche', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224CB', 75.00, 125.00, 'Cobre', NULL, 'active'),
    ('Torneira de Duche HELIOS Blanco', 'Torneira Duche', 'HELIOS', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3224BL', 75.00, 125.00, 'Branco', NULL, 'active'),
    ('Torneira de Lavatorio MARRIOT Cromo', 'Torneira Lavatorio', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150', 38.40, 64.00, NULL, 'Cromado', 'active'),
    ('Torneira de Lavatorio MARRIOT Negro', 'Torneira Lavatorio', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150NG', 43.20, 72.00, 'Preto', NULL, 'active'),
    ('Torneira de Lavatorio MARRIOT Oro', 'Torneira Lavatorio', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150OR', 51.00, 85.00, 'Dourado', NULL, 'active'),
    ('Torneira de Lavatorio MARRIOT Niquel', 'Torneira Lavatorio', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150NK', 51.00, 85.00, 'Níquel', NULL, 'active'),
    ('Torneira de Lavatorio MARRIOT Titanio', 'Torneira Lavatorio', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150T', 51.00, 85.00, 'Titânio', NULL, 'active'),
    ('Torneira de Lavatorio MARRIOT Cobre', 'Torneira Lavatorio', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150CB', 51.00, 85.00, 'Cobre', NULL, 'active'),
    ('Torneira de Lavatorio MARRIOT Blanco', 'Torneira Lavatorio', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3150BL', 51.00, 85.00, 'Branco', NULL, 'active'),
    ('Torneira de Pe Alto MARRIOT Cromo', 'Torneira Pe Alto', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154', 67.20, 112.00, NULL, 'Cromado', 'active'),
    ('Torneira de Pe Alto MARRIOT Negro', 'Torneira Pe Alto', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154NG', 77.40, 129.00, 'Preto', NULL, 'active'),
    ('Torneira de Pe Alto MARRIOT Oro', 'Torneira Pe Alto', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154OR', 84.00, 140.00, 'Dourado', NULL, 'active'),
    ('Torneira de Pe Alto MARRIOT Niquel', 'Torneira Pe Alto', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154NK', 84.00, 140.00, 'Níquel', NULL, 'active'),
    ('Torneira de Pe Alto MARRIOT Titanio', 'Torneira Pe Alto', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154T', 84.00, 140.00, 'Titânio', NULL, 'active'),
    ('Torneira de Pe Alto MARRIOT Cobre', 'Torneira Pe Alto', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154CB', 84.00, 140.00, 'Cobre', NULL, 'active'),
    ('Torneira de Pe Alto MARRIOT Blanco', 'Torneira Pe Alto', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3154BL', 84.00, 140.00, 'Branco', NULL, 'active'),
    ('Torneira de Bide MARRIOT Cromo', 'Torneira Bide', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151', 38.40, 64.00, NULL, 'Cromado', 'active'),
    ('Torneira de Bide MARRIOT Negro', 'Torneira Bide', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151NG', 43.20, 72.00, 'Preto', NULL, 'active'),
    ('Torneira de Bide MARRIOT Oro', 'Torneira Bide', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151OR', 51.00, 85.00, 'Dourado', NULL, 'active'),
    ('Torneira de Bide MARRIOT Niquel', 'Torneira Bide', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151NK', 51.00, 85.00, 'Níquel', NULL, 'active'),
    ('Torneira de Bide MARRIOT Titanio', 'Torneira Bide', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151T', 51.00, 85.00, 'Titânio', NULL, 'active'),
    ('Torneira de Bide MARRIOT Cobre', 'Torneira Bide', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151CB', 51.00, 85.00, 'Cobre', NULL, 'active'),
    ('Torneira de Bide MARRIOT Blanco', 'Torneira Bide', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3151BL', 51.00, 85.00, 'Branco', NULL, 'active'),
    ('Torneira de Banheira MARRIOT Cromo', 'Torneira Banheira', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152', 52.20, 87.00, NULL, 'Cromado', 'active'),
    ('Torneira de Banheira MARRIOT Negro', 'Torneira Banheira', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152NG', 65.40, 109.00, 'Preto', NULL, 'active'),
    ('Torneira de Banheira MARRIOT Oro', 'Torneira Banheira', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152OR', 76.80, 128.00, 'Dourado', NULL, 'active'),
    ('Torneira de Banheira MARRIOT Niquel', 'Torneira Banheira', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152NK', 76.80, 128.00, 'Níquel', NULL, 'active'),
    ('Torneira de Banheira MARRIOT Titanio', 'Torneira Banheira', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152T', 76.80, 128.00, 'Titânio', NULL, 'active'),
    ('Torneira de Banheira MARRIOT Cobre', 'Torneira Banheira', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152CB', 76.80, 128.00, 'Cobre', NULL, 'active'),
    ('Torneira de Banheira MARRIOT Blanco', 'Torneira Banheira', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3152BL', 76.80, 128.00, 'Branco', NULL, 'active'),
    ('Torneira de Encastre MARRIOT Cromo', 'Torneira Encastre', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252', 52.20, 87.00, NULL, 'Cromado', 'active'),
    ('Torneira de Encastre MARRIOT Negro', 'Torneira Encastre', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252NG', 55.80, 93.00, 'Preto', NULL, 'active'),
    ('Torneira de Encastre MARRIOT Oro', 'Torneira Encastre', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252OR', 65.40, 109.00, 'Dourado', NULL, 'active'),
    ('Torneira de Encastre MARRIOT Niquel', 'Torneira Encastre', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252NK', 65.40, 109.00, 'Níquel', NULL, 'active'),
    ('Torneira de Encastre MARRIOT Titanio', 'Torneira Encastre', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252T', 65.40, 109.00, 'Titânio', NULL, 'active'),
    ('Torneira de Encastre MARRIOT Cobre', 'Torneira Encastre', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252CB', 65.40, 109.00, 'Cobre', NULL, 'active'),
    ('Torneira de Encastre MARRIOT Blanco', 'Torneira Encastre', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3252BL', 65.40, 109.00, 'Branco', NULL, 'active'),
    ('Torneira de Duche MARRIOT Cromo', 'Torneira Duche', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153', 45.00, 75.00, NULL, 'Cromado', 'active'),
    ('Torneira de Duche MARRIOT Negro', 'Torneira Duche', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153NG', 55.20, 92.00, 'Preto', NULL, 'active'),
    ('Torneira de Duche MARRIOT Oro', 'Torneira Duche', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153OR', 67.80, 113.00, 'Dourado', NULL, 'active'),
    ('Torneira de Duche MARRIOT Niquel', 'Torneira Duche', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153NK', 67.80, 113.00, 'Níquel', NULL, 'active'),
    ('Torneira de Duche MARRIOT Titanio', 'Torneira Duche', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153T', 67.80, 113.00, 'Titânio', NULL, 'active'),
    ('Torneira de Duche MARRIOT Cobre', 'Torneira Duche', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153CB', 67.80, 113.00, 'Cobre', NULL, 'active'),
    ('Torneira de Duche MARRIOT Blanco', 'Torneira Duche', 'MARRIOT', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3153BL', 67.80, 113.00, 'Branco', NULL, 'active'),
    ('Torneira de Lavatorio IONY Cromo', 'Torneira Lavatorio', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3284', 27.60, 46.00, NULL, 'Cromado', 'active'),
    ('Torneira de Lavatorio IONY Acero', 'Torneira Lavatorio', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3280', 21.00, 35.00, 'Inox', NULL, 'active'),
    ('Torneira de Lavatorio IONY Negro', 'Torneira Lavatorio', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3280N', 23.40, 39.00, 'Preto', NULL, 'active'),
    ('Torneira de Pe Alto IONY Cromo', 'Torneira Pe Alto', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3285', 38.40, 64.00, NULL, 'Cromado', 'active'),
    ('Torneira de Pe Alto IONY Acero', 'Torneira Pe Alto', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3281', 27.00, 45.00, 'Inox', NULL, 'active'),
    ('Torneira de Pe Alto IONY Negro', 'Torneira Pe Alto', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3281N', 27.00, 45.00, 'Preto', NULL, 'active'),
    ('Torneira de Bide IONY Cromo', 'Torneira Bide', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3289', 27.60, 46.00, NULL, 'Cromado', 'active'),
    ('Torneira de Bide IONY Acero', 'Torneira Bide', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3288', 21.00, 35.00, 'Inox', NULL, 'active'),
    ('Torneira de Bide IONY Negro', 'Torneira Bide', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3288N', 23.40, 39.00, 'Preto', NULL, 'active'),
    ('Torneira de Banheira IONY Cromo', 'Torneira Banheira', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3287', 48.00, 80.00, NULL, 'Cromado', 'active'),
    ('Torneira de Banheira IONY Acero', 'Torneira Banheira', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3283', 43.20, 72.00, 'Inox', NULL, 'active'),
    ('Torneira de Banheira IONY Negro', 'Torneira Banheira', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3283N', 46.20, 77.00, 'Preto', NULL, 'active'),
    ('Torneira de Duche IONY Cromo', 'Torneira Duche', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3286', 36.00, 60.00, NULL, 'Cromado', 'active'),
    ('Torneira de Duche IONY Acero', 'Torneira Duche', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3282', 36.00, 60.00, 'Inox', NULL, 'active'),
    ('Torneira de Duche IONY Negro', 'Torneira Duche', 'IONY', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3282N', 39.00, 65.00, 'Preto', NULL, 'active'),
    ('Torneira de Lavatorio DIOR Cromo', 'Torneira Lavatorio', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3120', 53.40, 89.00, NULL, 'Cromado', 'active'),
    ('Torneira de Lavatorio DIOR Negro', 'Torneira Lavatorio', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3125', 62.40, 104.00, 'Preto', NULL, 'active'),
    ('Torneira de Lavatorio DIOR Titanio', 'Torneira Lavatorio', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3130', 69.00, 115.00, 'Titânio', NULL, 'active'),
    ('Torneira de Pe Alto DIOR Cromo', 'Torneira Pe Alto', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3121', 67.80, 113.00, NULL, 'Cromado', 'active'),
    ('Torneira de Pe Alto DIOR Negro', 'Torneira Pe Alto', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3126', 79.80, 133.00, 'Preto', NULL, 'active'),
    ('Torneira de Pe Alto DIOR Titanio', 'Torneira Pe Alto', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3131', 89.40, 149.00, 'Titânio', NULL, 'active'),
    ('Torneira de Bide DIOR Cromo', 'Torneira Bide', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3122', 53.40, 89.00, NULL, 'Cromado', 'active'),
    ('Torneira de Bide DIOR Negro', 'Torneira Bide', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3127', 62.40, 104.00, 'Preto', NULL, 'active'),
    ('Torneira de Bide DIOR Titanio', 'Torneira Bide', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3132', 69.00, 115.00, 'Titânio', NULL, 'active'),
    ('Torneira de Banheira DIOR Cromo', 'Torneira Banheira', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3123', 90.60, 151.00, NULL, 'Cromado', 'active'),
    ('Torneira de Banheira DIOR Negro', 'Torneira Banheira', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3128', 113.40, 189.00, 'Preto', NULL, 'active'),
    ('Torneira de Banheira DIOR Titanio', 'Torneira Banheira', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3133', 143.40, 239.00, 'Titânio', NULL, 'active'),
    ('Torneira de Duche DIOR Cromo', 'Torneira Duche', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3124', 60.60, 101.00, NULL, 'Cromado', 'active'),
    ('Torneira de Duche DIOR Negro', 'Torneira Duche', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3129', 76.20, 127.00, 'Preto', NULL, 'active'),
    ('Torneira de Duche DIOR Titanio', 'Torneira Duche', 'DIOR', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3134', 99.00, 165.00, 'Titânio', NULL, 'active'),
    ('Torneira de Lavatorio CASSIO Cromo', 'Torneira Lavatorio', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3060', 48.60, 81.00, NULL, 'Cromado', 'active'),
    ('Torneira de Lavatorio CASSIO Negro', 'Torneira Lavatorio', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3070', 53.40, 89.00, 'Preto', NULL, 'active'),
    ('Torneira de Lavatorio CASSIO Titanio', 'Torneira Lavatorio', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3105', 58.80, 98.00, 'Titânio', NULL, 'active'),
    ('Torneira de Lavatorio CASSIO Blanco', 'Torneira Lavatorio', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3175', 58.80, 98.00, 'Branco', NULL, 'active'),
    ('Torneira de Lavatorio CASSIO Blanco/Cromo', 'Torneira Lavatorio', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3064', 51.60, 86.00, 'Branco', 'Cromado', 'active'),
    ('Torneira de Pe Alto CASSIO Cromo', 'Torneira Pe Alto', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3100', 67.80, 113.00, NULL, 'Cromado', 'active'),
    ('Torneira de Pe Alto CASSIO Negro', 'Torneira Pe Alto', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3102', 77.40, 129.00, 'Preto', NULL, 'active'),
    ('Torneira de Pe Alto CASSIO Titanio', 'Torneira Pe Alto', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3103', 81.00, 135.00, 'Titânio', NULL, 'active'),
    ('Torneira de Pe Alto CASSIO Blanco', 'Torneira Pe Alto', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3177', 81.00, 135.00, 'Branco', NULL, 'active'),
    ('Torneira de Pe Alto CASSIO Blanco/Cromo', 'Torneira Pe Alto', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3101', 77.40, 129.00, 'Branco', 'Cromado', 'active'),
    ('Torneira de Bide CASSIO Cromo', 'Torneira Bide', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3061', 48.60, 81.00, NULL, 'Cromado', 'active'),
    ('Torneira de Bide CASSIO Negro', 'Torneira Bide', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3071', 53.40, 89.00, 'Preto', NULL, 'active'),
    ('Torneira de Bide CASSIO Titanio', 'Torneira Bide', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3106', 58.80, 98.00, 'Titânio', NULL, 'active'),
    ('Torneira de Bide CASSIO Blanco', 'Torneira Bide', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3176', 58.80, 98.00, 'Branco', NULL, 'active'),
    ('Torneira de Bide CASSIO Blanco/Cromo', 'Torneira Bide', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3065', 51.60, 86.00, 'Branco', 'Cromado', 'active'),
    ('Torneira de Banheira CASSIO Cromo', 'Torneira Banheira', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3062', 89.40, 149.00, NULL, 'Cromado', 'active'),
    ('Torneira de Banheira CASSIO Negro', 'Torneira Banheira', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3072', 90.60, 151.00, 'Preto', NULL, 'active'),
    ('Torneira de Banheira CASSIO Titanio', 'Torneira Banheira', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3107', 143.40, 239.00, 'Titânio', NULL, 'active'),
    ('Torneira de Banheira CASSIO Blanco', 'Torneira Banheira', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3178', 97.20, 162.00, 'Branco', NULL, 'active'),
    ('Torneira de Banheira CASSIO Blanco/Cromo', 'Torneira Banheira', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3066', 88.20, 147.00, 'Branco', 'Cromado', 'active'),
    ('Torneira de Encastre CASSIO Cromo', 'Torneira Encastre', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3048', 89.40, 149.00, NULL, 'Cromado', 'active'),
    ('Torneira de Encastre CASSIO Negro', 'Torneira Encastre', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3049', 92.40, 154.00, 'Preto', NULL, 'active'),
    ('Torneira de Encastre CASSIO Blanco', 'Torneira Encastre', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3048BL', 92.40, 154.00, 'Branco', NULL, 'active'),
    ('Torneira de Duche CASSIO Cromo', 'Torneira Duche', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3063', 64.80, 108.00, NULL, 'Cromado', 'active'),
    ('Torneira de Duche CASSIO Negro', 'Torneira Duche', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3073', 67.80, 113.00, 'Preto', NULL, 'active'),
    ('Torneira de Duche CASSIO Titanio', 'Torneira Duche', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3108', 117.60, 196.00, 'Titânio', NULL, 'active'),
    ('Torneira de Duche CASSIO Blanco', 'Torneira Duche', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3179', 70.20, 117.00, 'Branco', NULL, 'active'),
    ('Torneira de Duche CASSIO Blanco/Cromo', 'Torneira Duche', 'CASSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3067', 66.00, 110.00, 'Branco', 'Cromado', 'active'),
    ('Torneira de Lavatorio RHIO Cromo', 'Torneira Lavatorio', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 30.60, 51.00, NULL, 'Cromado', 'active'),
    ('Torneira de Lavatorio RHIO Negro', 'Torneira Lavatorio', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 36.60, 61.00, 'Preto', NULL, 'active'),
    ('Torneira de Lavatorio RHIO Oro', 'Torneira Lavatorio', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 41.40, 69.00, 'Dourado', NULL, 'active'),
    ('Torneira de Lavatorio RHIO Niquel', 'Torneira Lavatorio', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 41.40, 69.00, 'Níquel', NULL, 'active'),
    ('Torneira de Lavatorio RHIO Titanio', 'Torneira Lavatorio', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 41.40, 69.00, 'Titânio', NULL, 'active'),
    ('Torneira de Pe Alto RHIO Cromo', 'Torneira Pe Alto', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 49.20, 82.00, NULL, 'Cromado', 'active'),
    ('Torneira de Pe Alto RHIO Negro', 'Torneira Pe Alto', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 57.00, 95.00, 'Preto', NULL, 'active'),
    ('Torneira de Pe Alto RHIO Oro', 'Torneira Pe Alto', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 61.80, 103.00, 'Dourado', NULL, 'active'),
    ('Torneira de Pe Alto RHIO Niquel', 'Torneira Pe Alto', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 61.80, 103.00, 'Níquel', NULL, 'active'),
    ('Torneira de Pe Alto RHIO Titanio', 'Torneira Pe Alto', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 61.80, 103.00, 'Titânio', NULL, 'active'),
    ('Torneira de Bide RHIO Cromo', 'Torneira Bide', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 30.60, 51.00, NULL, 'Cromado', 'active'),
    ('Torneira de Bide RHIO Negro', 'Torneira Bide', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 36.60, 61.00, 'Preto', NULL, 'active'),
    ('Torneira de Bide RHIO Oro', 'Torneira Bide', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 41.40, 69.00, 'Dourado', NULL, 'active'),
    ('Torneira de Bide RHIO Niquel', 'Torneira Bide', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 41.40, 69.00, 'Níquel', NULL, 'active'),
    ('Torneira de Bide RHIO Titanio', 'Torneira Bide', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 41.40, 69.00, 'Titânio', NULL, 'active'),
    ('Torneira de Banheira RHIO Cromo', 'Torneira Banheira', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 64.80, 108.00, NULL, 'Cromado', 'active'),
    ('Torneira de Banheira RHIO Negro', 'Torneira Banheira', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 67.80, 113.00, 'Preto', NULL, 'active'),
    ('Torneira de Banheira RHIO Oro', 'Torneira Banheira', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 75.60, 126.00, 'Dourado', NULL, 'active'),
    ('Torneira de Banheira RHIO Niquel', 'Torneira Banheira', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 75.60, 126.00, 'Níquel', NULL, 'active'),
    ('Torneira de Banheira RHIO Titanio', 'Torneira Banheira', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 75.60, 126.00, 'Titânio', NULL, 'active'),
    ('Torneira de Duche RHIO Cromo', 'Torneira Duche', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 53.40, 89.00, NULL, 'Cromado', 'active'),
    ('Torneira de Duche RHIO Negro', 'Torneira Duche', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 57.60, 96.00, 'Preto', NULL, 'active'),
    ('Torneira de Duche RHIO Oro', 'Torneira Duche', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 63.60, 106.00, 'Dourado', NULL, 'active'),
    ('Torneira de Duche RHIO Niquel', 'Torneira Duche', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 63.60, 106.00, 'Níquel', NULL, 'active'),
    ('Torneira de Duche RHIO Titanio', 'Torneira Duche', 'RHIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 63.60, 106.00, 'Titânio', NULL, 'active'),
    ('Torneira de Lavatorio TARSIO Cromo', 'Torneira Lavatorio', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 41.40, 69.00, NULL, 'Cromado', 'active'),
    ('Torneira de Lavatorio TARSIO Negro', 'Torneira Lavatorio', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 47.40, 79.00, 'Preto', NULL, 'active'),
    ('Torneira de Lavatorio TARSIO Oro', 'Torneira Lavatorio', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 53.40, 89.00, 'Dourado', NULL, 'active'),
    ('Torneira de Lavatorio TARSIO Niquel', 'Torneira Lavatorio', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 53.40, 89.00, 'Níquel', NULL, 'active'),
    ('Torneira de Lavatorio TARSIO Titanio', 'Torneira Lavatorio', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 53.40, 89.00, 'Titânio', NULL, 'active'),
    ('Torneira de Pe Alto TARSIO Cromo', 'Torneira Pe Alto', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 72.00, 120.00, NULL, 'Cromado', 'active'),
    ('Torneira de Pe Alto TARSIO Negro', 'Torneira Pe Alto', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 77.40, 129.00, 'Preto', NULL, 'active'),
    ('Torneira de Pe Alto TARSIO Oro', 'Torneira Pe Alto', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 87.00, 145.00, 'Dourado', NULL, 'active'),
    ('Torneira de Pe Alto TARSIO Niquel', 'Torneira Pe Alto', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 87.00, 145.00, 'Níquel', NULL, 'active'),
    ('Torneira de Pe Alto TARSIO Titanio', 'Torneira Pe Alto', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 87.00, 145.00, 'Titânio', NULL, 'active'),
    ('Torneira de Bide TARSIO Cromo', 'Torneira Bide', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 41.40, 69.00, NULL, 'Cromado', 'active'),
    ('Torneira de Bide TARSIO Negro', 'Torneira Bide', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 47.40, 79.00, 'Preto', NULL, 'active'),
    ('Torneira de Bide TARSIO Oro', 'Torneira Bide', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 53.40, 89.00, 'Dourado', NULL, 'active'),
    ('Torneira de Bide TARSIO Niquel', 'Torneira Bide', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 53.40, 89.00, 'Níquel', NULL, 'active'),
    ('Torneira de Bide TARSIO Titanio', 'Torneira Bide', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 53.40, 89.00, 'Titânio', NULL, 'active'),
    ('Torneira de Banheira TARSIO Cromo', 'Torneira Banheira', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 64.80, 108.00, NULL, 'Cromado', 'active'),
    ('Torneira de Banheira TARSIO Negro', 'Torneira Banheira', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 67.80, 113.00, 'Preto', NULL, 'active'),
    ('Torneira de Banheira TARSIO Oro', 'Torneira Banheira', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 75.60, 126.00, 'Dourado', NULL, 'active'),
    ('Torneira de Banheira TARSIO Niquel', 'Torneira Banheira', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 75.60, 126.00, 'Níquel', NULL, 'active'),
    ('Torneira de Banheira TARSIO Titanio', 'Torneira Banheira', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 75.60, 126.00, 'Titânio', NULL, 'active'),
    ('Torneira de Duche TARSIO Cromo', 'Torneira Duche', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 53.40, 89.00, NULL, 'Cromado', 'active'),
    ('Torneira de Duche TARSIO Negro', 'Torneira Duche', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 57.60, 96.00, 'Preto', NULL, 'active'),
    ('Torneira de Duche TARSIO Oro', 'Torneira Duche', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 63.60, 106.00, 'Dourado', NULL, 'active'),
    ('Torneira de Duche TARSIO Niquel', 'Torneira Duche', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 63.60, 106.00, 'Níquel', NULL, 'active'),
    ('Torneira de Duche TARSIO Titanio', 'Torneira Duche', 'TARSIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', NULL, 63.60, 106.00, 'Titânio', NULL, 'active'),
    ('Torneira de Banheira SMOOTH Cromado', 'Torneira Banheira', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMCR', 300.00, 600.00, NULL, 'Cromado', 'active'),
    ('Torneira de Banheira SMOOTH Preto Mate', 'Torneira Banheira', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMPRM', 250.00, 500.00, 'Preto', 'Mate', 'active'),
    ('Torneira de Banheira SMOOTH Branco Mate', 'Torneira Banheira', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMBRM', 250.00, 500.00, 'Branco', 'Mate', 'active'),
    ('Torneira de Banheira SMOOTH Dourado Escovado', 'Torneira Banheira', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMGLDM', 275.00, 550.00, 'Dourado', 'Escovado', 'active'),
    ('Torneira de Banheira SMOOTH Niquel Escovado', 'Torneira Banheira', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMNQ', 250.00, 500.00, 'Níquel', 'Escovado', 'active'),
    ('Torneira de Banheira SMOOTH Gun Metal', 'Torneira Banheira', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMGM', 275.00, 550.00, 'Gun Metal', NULL, 'active'),
    ('Torneira de Banheira SMOOTH Rosa Gold Escovado', 'Torneira Banheira', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RTSE4007SMRSGM', 275.00, 550.00, 'Rosa Gold', 'Escovado', 'active'),
    ('Misturadoras Monocomando Extraivel SMOOTH Cromo', 'Misturadoras Monocomando Extraivel', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMCR', 60.00, 120.00, NULL, 'Cromado', 'active'),
    ('Misturadoras Monocomando Extraivel SMOOTH Preto Mate', 'Misturadoras Monocomando Extraivel', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMPRM', 65.00, 130.00, 'Preto', 'Mate', 'active'),
    ('Misturadoras Monocomando Extraivel SMOOTH Branco Mate', 'Misturadoras Monocomando Extraivel', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMBRM', 65.00, 130.00, 'Branco', 'Mate', 'active'),
    ('Misturadoras Monocomando Extraivel SMOOTH Gun Metal', 'Misturadoras Monocomando Extraivel', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMGM', 80.00, 160.00, 'Gun Metal', NULL, 'active'),
    ('Misturadoras Monocomando Extraivel SMOOTH Niquel Escovado', 'Misturadoras Monocomando Extraivel', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMNQ', 70.00, 140.00, 'Níquel', 'Escovado', 'active'),
    ('Misturadoras Monocomando Extraivel SMOOTH Dourado Escovado', 'Misturadoras Monocomando Extraivel', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMGLDM', 80.00, 160.00, 'Dourado', 'Escovado', 'active'),
    ('Misturadoras Monocomando Extraivel SMOOTH Rosa Gold Escovado', 'Misturadoras Monocomando Extraivel', 'SMOOTH', 'Rubicer', 'RUBICER, Lda.', 'RT1000SMRSGM', 80.00, 160.00, 'Rosa Gold', 'Escovado', 'active'),
    ('Misturadoras Monocomando NOAH Acero', 'Misturadoras Monocomando', 'NOAH', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3184', 40.20, 67.00, 'Inox', NULL, 'active'),
    ('Misturadoras Monocomando NOAH Negro', 'Misturadoras Monocomando', 'NOAH', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3183', 45.00, 75.00, 'Preto', NULL, 'active'),
    ('Misturadoras Monocomando NOAH Oro', 'Misturadoras Monocomando', 'NOAH', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3185', 51.00, 85.00, 'Dourado', NULL, 'active'),
    ('Misturadoras Monocomando NOAH Titanio', 'Misturadoras Monocomando', 'NOAH', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3187', 51.00, 85.00, 'Titânio', NULL, 'active'),
    ('Misturadoras Monocomando NOAH Cobre', 'Misturadoras Monocomando', 'NOAH', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3186', 51.00, 85.00, 'Cobre', NULL, 'active'),
    ('Misturadoras Monocomando Extraivel ROUND Cromo', 'Misturadoras Monocomando Extraivel', 'ROUND', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3144', 60.60, 101.00, NULL, 'Cromado', 'active'),
    ('Misturadoras Monocomando Extraivel ROUND Acero', 'Misturadoras Monocomando Extraivel', 'ROUND', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3180', 62.40, 104.00, 'Inox', NULL, 'active'),
    ('Misturadoras Monocomando Extraivel ROUND Acero Negro Mate', 'Misturadoras Monocomando Extraivel', 'ROUND', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3180NG', 65.40, 109.00, 'Preto', 'Mate', 'active'),
    ('Misturadoras Monocomando Extraivel ROUND Acero Oro PVD', 'Misturadoras Monocomando Extraivel', 'ROUND', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3180OR', 69.00, 115.00, 'Dourado', 'PVD', 'active'),
    ('Misturadoras Monocomando Extraivel ROUND Acero Cobre PVD', 'Misturadoras Monocomando Extraivel', 'ROUND', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3180CB', 69.00, 115.00, 'Cobre', 'PVD', 'active'),
    ('Misturadoras Monocomando Extraivel ROUND Acero Titanio PVD', 'Misturadoras Monocomando Extraivel', 'ROUND', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3180T', 69.00, 115.00, 'Titânio', 'PVD', 'active'),
    ('Misturadoras Monocomando Abativel ALEXIA Cromo', 'Misturadoras Monocomando Abativel', 'ALEXIA', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3233', 58.80, 98.00, NULL, 'Cromado', 'active'),
    ('Misturadoras Monocomando Flexivel CIRA Metal Edition Cromo', 'Misturadoras Monocomando Flexivel', 'CIRA Metal Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503CR', 99.00, 220.00, NULL, 'Cromado', 'active'),
    ('Misturadoras Monocomando Flexivel CIRA Metal Edition Niquel Cepillado', 'Misturadoras Monocomando Flexivel', 'CIRA Metal Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503NKM', 103.50, 230.00, 'Níquel', 'Escovado', 'active'),
    ('Misturadoras Monocomando Flexivel CIRA Metal Edition Negro Mate', 'Misturadoras Monocomando Flexivel', 'CIRA Metal Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503NE', 103.50, 230.00, 'Preto', 'Mate', 'active'),
    ('Misturadoras Monocomando Flexivel CIRA Metal Edition Oro', 'Misturadoras Monocomando Flexivel', 'CIRA Metal Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503OR', 108.00, 240.00, 'Dourado', NULL, 'active'),
    ('Misturadoras Monocomando Flexivel CIRA Silicone Edition Negro', 'Misturadoras Monocomando Flexivel', 'CIRA Silicone Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503NENE', 99.00, 220.00, 'Preto', NULL, 'active'),
    ('Misturadoras Monocomando Flexivel CIRA Silicone Edition Negro/Rojo', 'Misturadoras Monocomando Flexivel', 'CIRA Silicone Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503NERJ', 99.00, 220.00, 'Preto/Vermelho', NULL, 'active'),
    ('Misturadoras Monocomando Flexivel CIRA Silicone Edition Niquel Cepillado/Negro', 'Misturadoras Monocomando Flexivel', 'CIRA Silicone Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503NKNE', 103.50, 230.00, 'Níquel/Preto', 'Escovado', 'active'),
    ('Misturadoras Monocomando Flexivel CIRA Silicone Edition Niquel Cepillado/Blanco', 'Misturadoras Monocomando Flexivel', 'CIRA Silicone Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503NKBL', 103.50, 230.00, 'Níquel/Branco', 'Escovado', 'active'),
    ('Misturadoras Monocomando Flexivel CIRA Silicone Edition Cromo/Negro', 'Misturadoras Monocomando Flexivel', 'CIRA Silicone Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503CRNE', 99.00, 220.00, 'Preto', 'Cromado', 'active'),
    ('Misturadoras Monocomando Flexivel CIRA Silicone Edition Cromo/Blanco', 'Misturadoras Monocomando Flexivel', 'CIRA Silicone Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503CRBL', 99.00, 220.00, 'Branco', 'Cromado', 'active'),
    ('Misturadoras Monocomando Flexivel CIRA Silicone Edition Oro/Negro', 'Misturadoras Monocomando Flexivel', 'CIRA Silicone Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503ORNE', 108.00, 240.00, 'Dourado/Preto', NULL, 'active'),
    ('Misturadoras Monocomando Flexivel CIRA Silicone Edition Oro/Blanco', 'Misturadoras Monocomando Flexivel', 'CIRA Silicone Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'CR35TEL503ORBL', 108.00, 240.00, 'Dourado/Branco', NULL, 'active'),
    ('Misturadoras Monocomando Abativel GRANADA Cromo', 'Misturadoras Monocomando Abativel', 'GRANADA', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', '664022H504CR', 72.00, 160.00, NULL, 'Cromado', 'active'),
    ('Misturadoras Monocomando Abativel GRANADA Cromo Negro', 'Misturadoras Monocomando Abativel', 'GRANADA', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', '664022H504NE', 74.25, 165.00, 'Preto', 'Cromado', 'active'),
    ('Misturadoras Monocomando Abativel GRANADA Blanco', 'Misturadoras Monocomando Abativel', 'GRANADA', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', '664022H504BL', 74.25, 165.00, 'Branco', NULL, 'active'),
    ('Misturadoras Monocomando Extraivel GRANADA Cromo', 'Misturadoras Monocomando Extraivel', 'GRANADA', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', '6635TEL504CR', 96.75, 215.00, NULL, 'Cromado', 'active'),
    ('Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Amarillo Arena (sem preço)', 'Misturadoras Monocomando Giratoria', 'SOPHIE Pastel Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP3522H501AA', NULL, NULL, 'Amarillo Arena', NULL, 'draft'),
    ('Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Rojo Beige (sem preço)', 'Misturadoras Monocomando Giratoria', 'SOPHIE Pastel Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.RB', NULL, NULL, 'Rojo Beige', NULL, 'draft'),
    ('Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Violeta Pastel (sem preço)', 'Misturadoras Monocomando Giratoria', 'SOPHIE Pastel Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.VP', NULL, NULL, 'Violeta Pastel', NULL, 'draft'),
    ('Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Azul Colombino (sem preço)', 'Misturadoras Monocomando Giratoria', 'SOPHIE Pastel Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.AC', NULL, NULL, 'Azul Colombino', NULL, 'draft'),
    ('Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Gris Guijarro (sem preço)', 'Misturadoras Monocomando Giratoria', 'SOPHIE Pastel Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.GG', NULL, NULL, 'Gris Guijarro', NULL, 'draft'),
    ('Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Verde Reseda (sem preço)', 'Misturadoras Monocomando Giratoria', 'SOPHIE Pastel Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.VR', NULL, NULL, 'Verde Reseda', NULL, 'draft'),
    ('Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Turquesa Pastel (sem preço)', 'Misturadoras Monocomando Giratoria', 'SOPHIE Pastel Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.TP', NULL, NULL, 'Turquesa Pastel', NULL, 'draft'),
    ('Misturadoras Monocomando Giratoria SOPHIE Pastel Edition Blanco Crema (sem preço)', 'Misturadoras Monocomando Giratoria', 'SOPHIE Pastel Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.BC', NULL, NULL, 'Blanco Crema', NULL, 'draft'),
    ('Misturadoras Monocomando Giratoria SOPHIE Metal Edition Inox (sem preço)', 'Misturadoras Monocomando Giratoria', 'SOPHIE Metal Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.NX', NULL, NULL, 'Inox', NULL, 'draft'),
    ('Misturadoras Monocomando Giratoria SOPHIE Metal Edition Oro Cepillado (sem preço)', 'Misturadoras Monocomando Giratoria', 'SOPHIE Metal Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.OC', NULL, NULL, 'Dourado', 'Escovado', 'draft'),
    ('Misturadoras Monocomando Giratoria SOPHIE Metal Edition Negro (sem preço)', 'Misturadoras Monocomando Giratoria', 'SOPHIE Metal Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.NE', NULL, NULL, 'Preto', NULL, 'draft'),
    ('Misturadoras Monocomando Giratoria SOPHIE Metal Edition Grafite (sem preço)', 'Misturadoras Monocomando Giratoria', 'SOPHIE Metal Edition', 'Marti 1921', 'SAN CARLO LUXURY BATHROOM S.L.', 'SP.501.3522H.GN', NULL, NULL, 'Grafite', NULL, 'draft');
  SELECT count(*), string_agg(e.nome, ' | ') INTO v_n, v_txt
  FROM _tt e JOIN _tt_subs t ON t.nome = e.sub
  LEFT JOIN products p ON p.organization_id = c_org AND p.subcategory_id = t.sub_id AND NOT p.is_deleted AND p.name = e.nome
  LEFT JOIN product_models pm ON pm.id = p.model_id
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  LEFT JOIN product_attribute_values vc ON vc.product_id = p.id AND vc.attribute_id = v_a_cor
  LEFT JOIN product_attribute_values va ON va.product_id = p.id AND va.attribute_id = v_a_acab
  LEFT JOIN product_prices pc ON pc.product_id = p.id AND pc.price_type = 'purchase'
  LEFT JOIN product_prices pv ON pv.product_id = p.id AND pv.price_type = 'retail'
  LEFT JOIN item_suppliers i ON i.product_id = p.id AND i.deleted_at IS NULL
  WHERE NOT coalesce(
        p.category_id = v_cat AND p.status::text = e.status AND (e.status = 'draft') = (e.custo IS NULL) AND p.sku_gerado AND pm.name = e.modelo AND pm.deleted_at IS NULL
        AND public.fn_cat_chave_opcao(b.name) = public.fn_cat_chave_opcao(e.marca)
        AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.forn)
        AND public.fn_cat_chave_opcao(vc.value_text) IS NOT DISTINCT FROM public.fn_cat_chave_opcao(e.cor)
        AND (e.cor IS NOT NULL OR vc.product_id IS NULL)
        AND public.fn_cat_chave_opcao(va.value_text) IS NOT DISTINCT FROM public.fn_cat_chave_opcao(e.acab)
        AND (e.acab IS NOT NULL OR va.product_id IS NULL)
        AND NOT EXISTS (SELECT 1 FROM product_attribute_values x WHERE x.product_id = p.id AND x.attribute_id NOT IN (v_a_cor, v_a_acab))
        AND pc.price IS NOT DISTINCT FROM e.custo AND pv.price IS NOT DISTINCT FROM e.pvp
        AND (SELECT count(*) FROM product_prices x WHERE x.product_id = p.id) = (CASE WHEN e.custo IS NULL THEN 0 ELSE 2 END)
        AND i.supplier_id = p.supplier_id AND i.is_preferred AND i.supplier_sku = coalesce(e.cod, p.sku)
        AND i.purchase_price IS NOT DISTINCT FROM e.custo
        AND (SELECT count(*) FROM item_suppliers x WHERE x.product_id = p.id AND x.deleted_at IS NULL) = 1,
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2 — % produtos diferentes do Excel: %', v_n, left(v_txt, 1500); END IF;

  -- 3. nada a mais
  SELECT count(*), count(*) FILTER (WHERE p.name ~ '\(cod\.') INTO v_n, v_m FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs);
  SELECT count(*) INTO v_k FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs)
    AND p.status::text = 'draft' AND p.name LIKE '% (sem preço)';
  IF v_k <> 12 THEN RAISE EXCEPTION 'FALHOU: passo 3 — % produtos sem preço em draft (esperados 12).', v_k; END IF;
  IF v_n <> 281 OR v_m > 0 THEN RAISE EXCEPTION 'FALHOU: passo 3 — % produtos nas subcategorias (esperados 281), % com «(cod.».', v_n, v_m; END IF;

  -- 4. SKUs
  SELECT count(*) INTO v_n FROM (SELECT p.sku FROM products p WHERE p.organization_id = c_org GROUP BY p.sku HAVING count(*) > 1) d;
  SELECT count(*) INTO v_m FROM products p JOIN _tt_subs t ON t.sub_id = p.subcategory_id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND (p.sku !~ ('^TM-' || t.sigla || '-[0-9]{4}(-[A-Z0-9]+){1,2}$') OR p.sku ~ '^CAT-');
  IF v_n > 0 OR v_m > 0 THEN RAISE EXCEPTION 'FALHOU: passo 4 — % SKUs repetidos na Mudelar; % fora do formato.', v_n, v_m; END IF;
  SELECT count(*), string_agg(y.sku || ' ≠ ' || coalesce(y.calc, 'null'), '; ') FILTER (WHERE y.k <= 5) INTO v_n, v_txt
  FROM (SELECT x.sku, x.calc, row_number() OVER (ORDER BY x.sku) AS k FROM (
          SELECT p.sku, pt ->> 'faltas' AS faltas, (pt ->> 'prefixo') AS prefixo,
                 concat_ws('-', pt ->> 'prefixo', lpad(public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id)::text, 4, '0'),
                           pt ->> 'resto') AS calc
          FROM products p
          CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, p.category_id, p.subcategory_id, (
              SELECT coalesce(jsonb_agg(jsonb_build_object('atributo', v.attribute_id, 'sigla', o.sigla)), '[]'::jsonb)
              FROM product_attribute_values v
              LEFT JOIN attribute_option_group_values o
                ON o.group_id = public.fn_cat_grupo_do_atributo(v.attribute_id, c_org) AND o.value_text = v.value_text
              WHERE v.product_id = p.id)) AS pt) z
          WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs)) x
        WHERE x.calc IS DISTINCT FROM x.sku OR x.prefixo IS NULL OR x.faltas <> '[]') y;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 4 — % SKUs diferentes do recalculado (ex.: %).', v_n, v_txt; END IF;
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    v_n := 0;
    FOR r IN SELECT p.id, p.sku, p.category_id, p.subcategory_id, p.model_id FROM products p
             WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs) ORDER BY random() LIMIT 40 LOOP
      SELECT coalesce(jsonb_agg(jsonb_build_object('atributo', v.attribute_id, 'opcao', o.id)), '[]'::jsonb) INTO v_attrs
      FROM product_attribute_values v
      JOIN attribute_option_group_values o ON o.group_id = public.fn_cat_grupo_do_atributo(v.attribute_id, c_org) AND o.value_text = v.value_text
      WHERE v.product_id = r.id;
      v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.id);
      IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
        RAISE EXCEPTION 'FALHOU: passo 4 — cat_prever_sku_modelo dá % para o SKU %.', v_prev, r.sku;
      END IF;
      v_n := v_n + 1;
    END LOOP;
    IF v_n <> 40 THEN RAISE EXCEPTION 'FALHOU: passo 4 — só % comparados com cat_prever_sku_modelo.', v_n; END IF;
  END IF;

  -- 5. as cores usadas: Preto/Branco/Dourado (não NEGRO/BLANCO/ORO), nenhuma Cromo
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN products p ON p.id = v.product_id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs) AND v.attribute_id = v_a_cor
    AND public.fn_cat_chave_opcao(v.value_text) IN ('negro', 'blanco', 'oro', 'cromo', 'cromado', 'acero');
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 5 — % produtos com Cor NEGRO/BLANCO/ORO/Cromo/Acero.', v_n; END IF;

  RAISE NOTICE 'OK: catalogo_torneiras_mudelar — 281 produtos, 54 modelos, Cor e Acabamento conferidos, SKUs recalculados.';
END $t$;

ROLLBACK;
