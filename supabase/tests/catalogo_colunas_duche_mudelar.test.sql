-- ============================================================
-- Testes: 20270120100000_catalogo_colunas_duche_mudelar.sql (base RH)
-- Ficheiro GERADO por script (gerar.js) a partir do Excel, como a migration.
-- ============================================================
-- ORDEM: correr ANTES do db push da 20270120100000 (falha no passo 0: os produtos desta importação ainda não existem na
-- Mudelar); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355) e, para provar que nada foi escrito fora dela, as outras organizações (só
-- contagens pelo xmin da transação da importação). Para comparar os SKUs com cat_prever_sku_modelo usa, só nesta
-- transação, as claims de um membro ativo da Mudelar com products.edit (a função é só de leitura). Nenhuma chamada
-- recusada de propósito. Não assume que as opções de Cor/Largura, marcas ou fornecedores NÃO existiam (outras
-- importações podem tê-los criado antes): confere o resultado, não a origem.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_colunas_duche_mudelar.test.sql
--
-- O que PROVA:
--   0. Os produtos desta importação (pelos nomes do Excel) existem na Mudelar.
--   1. 91 produtos vivos nas subcategorias; por modelo ROUND MONOCOMANDO 6, ORION MONOCOMANDO 6, WATER BLISS ÁGUA FRIA 5, INVERTER R 7, INVERTER C 7, QUADRA ELITE 2, ROUND ELITE 6, NIGEL 3, NILO 4, ELBA 2, Chuveiro de encastre SIRIO 7, Braço de Teto SIRIO 7, Chuveiro de encastre ORION 3, Braço de Teto ORION 3, HIDROMASSAGEM GOTCHA 3, Braço de Parede SIRIO 7, Prato Redondo SIRIO 7, Braço de Parede ORION 3, Prato ORION 3; 19 modelos com nome e número.
--   2. Cada produto como a linha do Excel: nome, SKU exato, modelo, marca, fornecedor, código do fornecedor (supplier_sku),
--      estado, unidade, custo (2 casas), PVP, IVA 23 e os atributos (cor, largura, medida 2D em cm) — e só esses.
--   3. Nenhum preço grossista/distribuidor (o Excel tem 0); 2 preços e 1 ligação a fornecedor por produto.
--   4. SKUs únicos e no formato.
--   5. As opções de Cor e de Largura usadas existem, ativas, com sigla (as conhecidas com a sigla esperada).
--   6. Nenhuma linha de outra organização tem o xmin da transação que criou os produtos.
--   7. Todos os produtos: cat_prever_sku_modelo dá o SKU gravado, sem faltas.
--   8. Auditoria: há linhas com a fonte migration:catalogo_colunas_duche_mudelar.
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A importação foi aplicada? ───────────────────────────────────────────
DO $t0$
DECLARE v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
    AND p.name IN ('Coluna de Duche INVERTER R CROMO', 'Coluna de Duche INVERTER R NEGRO', 'Coluna de Duche INVERTER R ORO', 'Coluna de Duche INVERTER R NIQUEL', 'Coluna de Duche INVERTER R TITANIO', 'Coluna de Duche INVERTER R COBRE', 'Coluna de Duche INVERTER R BRANCO', 'Coluna de Duche INVERTER C CROMO', 'Coluna de Duche INVERTER C NEGRO', 'Coluna de Duche INVERTER C ORO', 'Coluna de Duche INVERTER C NIQUEL', 'Coluna de Duche INVERTER C TITANIO', 'Coluna de Duche INVERTER C COBRE', 'Coluna de Duche INVERTER C BRANCO', 'Coluna de Duche QUADRA ELITE CROMO', 'Coluna de Duche QUADRA ELITE NEGRO', 'Coluna de Duche ROUND ELITE CROMO', 'Coluna de Duche ROUND ELITE NEGRO', 'Coluna de Duche ROUND ELITE ORO', 'Coluna de Duche ROUND ELITE NIQUEL', 'Coluna de Duche ROUND ELITE TITANIO', 'Coluna de Duche ROUND ELITE COBRE', 'Coluna de Duche NIGEL CROMO', 'Coluna de Duche NIGEL NEGRO', 'Coluna de Duche NIGEL BRANCO', 'Coluna de Duche NILO CROMO', 'Coluna de Duche NILO NEGRO', 'Coluna de Duche NILO ORO', 'Coluna de Duche NILO TITANIO', 'Coluna de Duche ELBA NEGRO', 'Coluna de Duche ELBA BRANCO', 'Chuveiro de encastre de SIRIO CROMO', 'Chuveiro de encastre de SIRIO NEGRO', 'Chuveiro de encastre de SIRIO ORO', 'Chuveiro de encastre de SIRIO NIQUEL', 'Chuveiro de encastre de SIRIO TITANIO', 'Chuveiro de encastre de SIRIO COBRE', 'Chuveiro de encastre de SIRIO BRANCO', 'Braço de Teto SIRIO CROMO', 'Braço de Teto SIRIO NEGRO', 'Braço de Teto SIRIO ORO', 'Braço de Teto SIRIO NIQUEL', 'Braço de Teto SIRIO TITANIO', 'Braço de Teto SIRIO COBRE', 'Braço de Teto SIRIO BRANCO', 'Braço de Parede SIRIO CROMO', 'Braço de Parede SIRIO NEGRO', 'Braço de Parede SIRIO ORO', 'Braço de Parede SIRIO NIQUEL', 'Braço de Parede SIRIO TITANIO', 'Braço de Parede SIRIO COBRE', 'Braço de Parede SIRIO BRANCO', 'Prato Redondo SIRIO CROMO', 'Prato Redondo SIRIO NEGRO', 'Prato Redondo SIRIO ORO', 'Prato Redondo SIRIO NIQUEL', 'Prato Redondo SIRIO TITANIO', 'Prato Redondo SIRIO COBRE', 'Prato Redondo SIRIO BRANCO', 'Chuveiro de encastre ORION CROMO', 'Chuveiro de encastre ORION NEGRO', 'Chuveiro de encastre ORION BRANCO', 'Braço de Teto ORION CROMO', 'Braço de Teto ORION NEGRO', 'Braço de Teto ORION BRANCO', 'Braço de Parede ORION CROMO', 'Braço de Parede ORION NEGRO', 'Braço de Parede ORION BRANCO', 'Prato 25x25 ORION CROMO', 'Prato 25x25 ORION NEGRO', 'Prato 25x25 ORION BRANCO', 'Coluna de Duche HIDROMASSAGEM GOTCHA CROMO', 'Coluna de Duche HIDROMASSAGEM GOTCHA NEGRO', 'Coluna de Duche HIDROMASSAGEM GOTCHA BRANCO', 'Chuveiro Higiénico ROUND MONOCOMANDO CROMO', 'Chuveiro Higiénico ROUND MONOCOMANDO NEGRO', 'Chuveiro Higiénico ROUND MONOCOMANDO ORO', 'Chuveiro Higiénico ROUND MONOCOMANDO NIQUEL', 'Chuveiro Higiénico ROUND MONOCOMANDO TITANIO', 'Chuveiro Higiénico ROUND MONOCOMANDO COBRE', 'Chuveiro Higiénico ORION MONOCOMANDO CROMO', 'Chuveiro Higiénico ORION MONOCOMANDO NEGRO', 'Chuveiro Higiénico ORION MONOCOMANDO ORO', 'Chuveiro Higiénico ORION MONOCOMANDO NIQUEL', 'Chuveiro Higiénico ORION MONOCOMANDO TITANIO', 'Chuveiro Higiénico ORION MONOCOMANDO COBRE', 'Chuveiro Higiénico WATER BLISS ÁGUA FRIA CROMO', 'Chuveiro Higiénico WATER BLISS ÁGUA FRIA NEGRO', 'Chuveiro Higiénico WATER BLISS ÁGUA FRIA ORO', 'Chuveiro Higiénico WATER BLISS ÁGUA FRIA ROSA GOLD ESCOVADO', 'Chuveiro Higiénico WATER BLISS ÁGUA FRIA GUN METAL');
  IF v_n <> 91 THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — a Mudelar tem % dos 91 produtos desta importação (aplicar 20270120100000).', v_n;
  END IF;
END $t0$;

-- ─── 1 a 8 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_total constant integer := 91;
  c_n_valores constant integer := 94;
  v_cat uuid; v_a_cor uuid; v_a_larg uuid; v_a_med uuid; v_g_cor uuid; v_g_larg uuid;
  v_n bigint; v_m bigint; v_k bigint; v_txt text; v_xid text; v_auth uuid; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  SELECT c.id INTO v_cat FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND public.fn_cat_chave_opcao(c.name) = 'duche & banho';
  SELECT a.id INTO v_a_cor FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'cor';
  SELECT a.id INTO v_a_larg FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'largura';
  SELECT a.id INTO v_a_med FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'medida';
  IF v_cat IS NULL OR v_a_cor IS NULL OR v_a_larg IS NULL OR v_a_med IS NULL THEN
    RAISE EXCEPTION 'FALHOU: configuração da Mudelar incompleta (categoria ou atributos).';
  END IF;
  v_g_cor := public.fn_cat_grupo_do_atributo(v_a_cor, c_org);
  v_g_larg := public.fn_cat_grupo_do_atributo(v_a_larg, c_org);

  DROP TABLE IF EXISTS pg_temp._t_esp;
  CREATE TEMP TABLE _t_esp (nome text, sub text, numero integer, modelo text, marca text, forn text, cod text, custo numeric, pvp numeric,
                            cor text, larg text, ml integer, mc integer, status text, sku text) ON COMMIT DROP;
  INSERT INTO _t_esp VALUES
    ('Coluna de Duche INVERTER R CROMO', 'Colunas Duche', 1, 'INVERTER R', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3080', 104.40, 174.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0001-CRO'),
    ('Coluna de Duche INVERTER R NEGRO', 'Colunas Duche', 1, 'INVERTER R', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3135', 127.80, 213.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0001-NG'),
    ('Coluna de Duche INVERTER R ORO', 'Colunas Duche', 1, 'INVERTER R', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3080OR', 161.40, 269.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0001-ORO'),
    ('Coluna de Duche INVERTER R NIQUEL', 'Colunas Duche', 1, 'INVERTER R', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3080NK', 139.80, 233.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0001-NQ'),
    ('Coluna de Duche INVERTER R TITANIO', 'Colunas Duche', 1, 'INVERTER R', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3080T', 161.40, 269.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0001-TT'),
    ('Coluna de Duche INVERTER R COBRE', 'Colunas Duche', 1, 'INVERTER R', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3080CB', 161.40, 269.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0001-CB'),
    ('Coluna de Duche INVERTER R BRANCO', 'Colunas Duche', 1, 'INVERTER R', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3080BL', 132.60, 221.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0001-B'),
    ('Coluna de Duche INVERTER C CROMO', 'Colunas Duche', 2, 'INVERTER C', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3081', 132.60, 221.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0002-CRO'),
    ('Coluna de Duche INVERTER C NEGRO', 'Colunas Duche', 2, 'INVERTER C', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3136', 157.20, 262.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0002-NG'),
    ('Coluna de Duche INVERTER C ORO', 'Colunas Duche', 2, 'INVERTER C', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3081OR', 191.40, 319.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0002-ORO'),
    ('Coluna de Duche INVERTER C NIQUEL', 'Colunas Duche', 2, 'INVERTER C', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3081NK', 171.60, 286.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0002-NQ'),
    ('Coluna de Duche INVERTER C TITANIO', 'Colunas Duche', 2, 'INVERTER C', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3081T', 191.40, 319.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0002-TT'),
    ('Coluna de Duche INVERTER C COBRE', 'Colunas Duche', 2, 'INVERTER C', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3081CB', 191.40, 319.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0002-CB'),
    ('Coluna de Duche INVERTER C BRANCO', 'Colunas Duche', 2, 'INVERTER C', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3081BL', 168.00, 280.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0002-B'),
    ('Coluna de Duche QUADRA ELITE CROMO', 'Colunas Duche', 3, 'QUADRA ELITE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3012', 203.40, 339.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0003-CRO'),
    ('Coluna de Duche QUADRA ELITE NEGRO', 'Colunas Duche', 3, 'QUADRA ELITE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3095', 217.20, 362.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0003-NG'),
    ('Coluna de Duche ROUND ELITE CROMO', 'Colunas Duche', 4, 'ROUND ELITE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3014', 156.60, 261.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0004-CRO'),
    ('Coluna de Duche ROUND ELITE NEGRO', 'Colunas Duche', 4, 'ROUND ELITE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3097', 173.40, 289.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0004-NG'),
    ('Coluna de Duche ROUND ELITE ORO', 'Colunas Duche', 4, 'ROUND ELITE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3250OR', 197.40, 329.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0004-ORO'),
    ('Coluna de Duche ROUND ELITE NIQUEL', 'Colunas Duche', 4, 'ROUND ELITE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3250NK', 197.40, 329.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0004-NQ'),
    ('Coluna de Duche ROUND ELITE TITANIO', 'Colunas Duche', 4, 'ROUND ELITE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3250T', 197.40, 329.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0004-TT'),
    ('Coluna de Duche ROUND ELITE COBRE', 'Colunas Duche', 4, 'ROUND ELITE', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3250CB', 197.40, 329.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0004-CB'),
    ('Coluna de Duche NIGEL CROMO', 'Colunas Duche', 5, 'NIGEL', 'Duplach', 'DUPLACH Group, SAU', 'NIGEL_C', 150.15, 273.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0005-CRO'),
    ('Coluna de Duche NIGEL NEGRO', 'Colunas Duche', 5, 'NIGEL', 'Duplach', 'DUPLACH Group, SAU', 'NIGEL_N', 141.35, 257.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0005-NG'),
    ('Coluna de Duche NIGEL BRANCO', 'Colunas Duche', 5, 'NIGEL', 'Duplach', 'DUPLACH Group, SAU', 'NIGEL_B', 141.35, 257.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0005-B'),
    ('Coluna de Duche NILO CROMO', 'Colunas Duche', 6, 'NILO', 'Duplach', 'DUPLACH Group, SAU', 'NILO_C', 199.10, 362.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0006-CRO'),
    ('Coluna de Duche NILO NEGRO', 'Colunas Duche', 6, 'NILO', 'Duplach', 'DUPLACH Group, SAU', 'NILO_N', 198.55, 361.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0006-NG'),
    ('Coluna de Duche NILO ORO', 'Colunas Duche', 6, 'NILO', 'Duplach', 'DUPLACH Group, SAU', 'NILO_B', 243.10, 442.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0006-ORO'),
    ('Coluna de Duche NILO TITANIO', 'Colunas Duche', 6, 'NILO', 'Duplach', 'DUPLACH Group, SAU', 'NILO_A', 212.85, 387.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0006-TT'),
    ('Coluna de Duche ELBA NEGRO', 'Colunas Duche', 7, 'ELBA', 'Duplach', 'DUPLACH Group, SAU', 'ELBA_N', 142.45, 259.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0007-NG'),
    ('Coluna de Duche ELBA BRANCO', 'Colunas Duche', 7, 'ELBA', 'Duplach', 'DUPLACH Group, SAU', 'ELBA_B', 142.45, 259.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0007-B'),
    ('Chuveiro de encastre de SIRIO CROMO', 'Colunas Duche', 8, 'Chuveiro de encastre SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3086', 101.40, 169.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0008-CRO'),
    ('Chuveiro de encastre de SIRIO NEGRO', 'Colunas Duche', 8, 'Chuveiro de encastre SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3087', 113.40, 189.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0008-NG'),
    ('Chuveiro de encastre de SIRIO ORO', 'Colunas Duche', 8, 'Chuveiro de encastre SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3086OR', 143.40, 239.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0008-ORO'),
    ('Chuveiro de encastre de SIRIO NIQUEL', 'Colunas Duche', 8, 'Chuveiro de encastre SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3086NK', 131.40, 219.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0008-NQ'),
    ('Chuveiro de encastre de SIRIO TITANIO', 'Colunas Duche', 8, 'Chuveiro de encastre SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3086T', 143.40, 239.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0008-TT'),
    ('Chuveiro de encastre de SIRIO COBRE', 'Colunas Duche', 8, 'Chuveiro de encastre SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3086CB', 143.40, 239.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0008-CB'),
    ('Chuveiro de encastre de SIRIO BRANCO', 'Colunas Duche', 8, 'Chuveiro de encastre SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3086BL', 113.40, 189.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0008-B'),
    ('Braço de Teto SIRIO CROMO', 'Colunas Duche', 9, 'Braço de Teto SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3026', 9.00, 15.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0009-CRO'),
    ('Braço de Teto SIRIO NEGRO', 'Colunas Duche', 9, 'Braço de Teto SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3162', 9.60, 16.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0009-NG'),
    ('Braço de Teto SIRIO ORO', 'Colunas Duche', 9, 'Braço de Teto SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3026OR', 13.80, 23.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0009-ORO'),
    ('Braço de Teto SIRIO NIQUEL', 'Colunas Duche', 9, 'Braço de Teto SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3026NK', 13.80, 23.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0009-NQ'),
    ('Braço de Teto SIRIO TITANIO', 'Colunas Duche', 9, 'Braço de Teto SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3026T', 13.80, 23.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0009-TT'),
    ('Braço de Teto SIRIO COBRE', 'Colunas Duche', 9, 'Braço de Teto SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3026CB', 13.80, 23.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0009-CB'),
    ('Braço de Teto SIRIO BRANCO', 'Colunas Duche', 9, 'Braço de Teto SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3026BL', 11.40, 19.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0009-B'),
    ('Braço de Parede SIRIO CROMO', 'Colunas Duche', 13, 'Braço de Parede SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3025', 10.80, 18.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0013-CRO'),
    ('Braço de Parede SIRIO NEGRO', 'Colunas Duche', 13, 'Braço de Parede SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3161', 12.00, 20.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0013-NG'),
    ('Braço de Parede SIRIO ORO', 'Colunas Duche', 13, 'Braço de Parede SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3025OR', 16.80, 28.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0013-ORO'),
    ('Braço de Parede SIRIO NIQUEL', 'Colunas Duche', 13, 'Braço de Parede SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3025NK', 16.80, 28.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0013-NQ'),
    ('Braço de Parede SIRIO TITANIO', 'Colunas Duche', 13, 'Braço de Parede SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3025T', 16.80, 28.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0013-TT'),
    ('Braço de Parede SIRIO COBRE', 'Colunas Duche', 13, 'Braço de Parede SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3025CB', 16.80, 28.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0013-CB'),
    ('Braço de Parede SIRIO BRANCO', 'Colunas Duche', 13, 'Braço de Parede SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3025BL', 13.80, 23.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0013-B'),
    ('Prato Redondo SIRIO CROMO', 'Colunas Duche', 14, 'Prato Redondo SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3059', 19.20, 32.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0014-CRO'),
    ('Prato Redondo SIRIO NEGRO', 'Colunas Duche', 14, 'Prato Redondo SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3155', 26.40, 44.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0014-NG'),
    ('Prato Redondo SIRIO ORO', 'Colunas Duche', 14, 'Prato Redondo SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3059OR', 30.00, 50.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0014-ORO'),
    ('Prato Redondo SIRIO NIQUEL', 'Colunas Duche', 14, 'Prato Redondo SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3059NK', 30.00, 50.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0014-NQ'),
    ('Prato Redondo SIRIO TITANIO', 'Colunas Duche', 14, 'Prato Redondo SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3059T', 30.00, 50.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0014-TT'),
    ('Prato Redondo SIRIO COBRE', 'Colunas Duche', 14, 'Prato Redondo SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3059CB', 30.00, 50.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0014-CB'),
    ('Prato Redondo SIRIO BRANCO', 'Colunas Duche', 14, 'Prato Redondo SIRIO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3059BL', 27.60, 46.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0014-B'),
    ('Chuveiro de encastre ORION CROMO', 'Colunas Duche', 10, 'Chuveiro de encastre ORION', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3088', 107.40, 179.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0010-CRO'),
    ('Chuveiro de encastre ORION NEGRO', 'Colunas Duche', 10, 'Chuveiro de encastre ORION', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3089', 119.40, 199.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0010-NG'),
    ('Chuveiro de encastre ORION BRANCO', 'Colunas Duche', 10, 'Chuveiro de encastre ORION', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3088BL', 119.40, 199.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0010-B'),
    ('Braço de Teto ORION CROMO', 'Colunas Duche', 11, 'Braço de Teto ORION', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3027', 12.60, 21.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0011-CRO'),
    ('Braço de Teto ORION NEGRO', 'Colunas Duche', 11, 'Braço de Teto ORION', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3160', 13.80, 23.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0011-NG'),
    ('Braço de Teto ORION BRANCO', 'Colunas Duche', 11, 'Braço de Teto ORION', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3027BL', 15.60, 26.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0011-B'),
    ('Braço de Parede ORION CROMO', 'Colunas Duche', 15, 'Braço de Parede ORION', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3024', 14.40, 24.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0015-CRO'),
    ('Braço de Parede ORION NEGRO', 'Colunas Duche', 15, 'Braço de Parede ORION', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3159', 15.00, 25.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0015-NG'),
    ('Braço de Parede ORION BRANCO', 'Colunas Duche', 15, 'Braço de Parede ORION', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3024BL', 16.80, 28.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0015-B'),
    ('Prato 25x25 ORION CROMO', 'Colunas Duche', 16, 'Prato ORION', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3058', 21.60, 36.00, 'CROMO', NULL::text, 25, 25, 'draft', 'DB-CD-0016-CRO-25X25'),
    ('Prato 25x25 ORION NEGRO', 'Colunas Duche', 16, 'Prato ORION', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3157', 26.40, 44.00, 'NEGRO', NULL::text, 25, 25, 'draft', 'DB-CD-0016-NG-25X25'),
    ('Prato 25x25 ORION BRANCO', 'Colunas Duche', 16, 'Prato ORION', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '3058BL', 28.80, 48.00, 'BRANCO', NULL::text, 25, 25, 'draft', 'DB-CD-0016-B-25X25'),
    ('Coluna de Duche HIDROMASSAGEM GOTCHA CROMO', 'Colunas Duche', 12, 'HIDROMASSAGEM GOTCHA', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0508', 250.80, 418.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0012-CRO'),
    ('Coluna de Duche HIDROMASSAGEM GOTCHA NEGRO', 'Colunas Duche', 12, 'HIDROMASSAGEM GOTCHA', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0523', 250.80, 418.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0012-NG'),
    ('Coluna de Duche HIDROMASSAGEM GOTCHA BRANCO', 'Colunas Duche', 12, 'HIDROMASSAGEM GOTCHA', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0521', 250.80, 418.00, 'BRANCO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CD-0012-B'),
    ('Chuveiro Higiénico ROUND MONOCOMANDO CROMO', 'Chuveiro Higiénico', 1, 'ROUND MONOCOMANDO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0390', 65.40, 109.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0001-CRO'),
    ('Chuveiro Higiénico ROUND MONOCOMANDO NEGRO', 'Chuveiro Higiénico', 1, 'ROUND MONOCOMANDO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0391', 73.20, 122.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0001-NG'),
    ('Chuveiro Higiénico ROUND MONOCOMANDO ORO', 'Chuveiro Higiénico', 1, 'ROUND MONOCOMANDO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0390OR', 84.60, 141.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0001-ORO'),
    ('Chuveiro Higiénico ROUND MONOCOMANDO NIQUEL', 'Chuveiro Higiénico', 1, 'ROUND MONOCOMANDO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0390NK', 84.60, 141.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0001-NQ'),
    ('Chuveiro Higiénico ROUND MONOCOMANDO TITANIO', 'Chuveiro Higiénico', 1, 'ROUND MONOCOMANDO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0390T', 84.60, 141.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0001-TT'),
    ('Chuveiro Higiénico ROUND MONOCOMANDO COBRE', 'Chuveiro Higiénico', 1, 'ROUND MONOCOMANDO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0390CB', 84.60, 141.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0001-CB'),
    ('Chuveiro Higiénico ORION MONOCOMANDO CROMO', 'Chuveiro Higiénico', 2, 'ORION MONOCOMANDO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0398', 65.40, 109.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0002-CRO'),
    ('Chuveiro Higiénico ORION MONOCOMANDO NEGRO', 'Chuveiro Higiénico', 2, 'ORION MONOCOMANDO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0398NG', 73.20, 122.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0002-NG'),
    ('Chuveiro Higiénico ORION MONOCOMANDO ORO', 'Chuveiro Higiénico', 2, 'ORION MONOCOMANDO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0398OR', 84.60, 141.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0002-ORO'),
    ('Chuveiro Higiénico ORION MONOCOMANDO NIQUEL', 'Chuveiro Higiénico', 2, 'ORION MONOCOMANDO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0398NK', 84.60, 141.00, 'NIQUEL', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0002-NQ'),
    ('Chuveiro Higiénico ORION MONOCOMANDO TITANIO', 'Chuveiro Higiénico', 2, 'ORION MONOCOMANDO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0398T', 84.60, 141.00, 'TITANIO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0002-TT'),
    ('Chuveiro Higiénico ORION MONOCOMANDO COBRE', 'Chuveiro Higiénico', 2, 'ORION MONOCOMANDO', 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', '0398CB', 84.60, 141.00, 'COBRE', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0002-CB'),
    ('Chuveiro Higiénico WATER BLISS ÁGUA FRIA CROMO', 'Chuveiro Higiénico', 3, 'WATER BLISS ÁGUA FRIA', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'DH1011', 29.70, 55.00, 'CROMO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0003-CRO'),
    ('Chuveiro Higiénico WATER BLISS ÁGUA FRIA NEGRO', 'Chuveiro Higiénico', 3, 'WATER BLISS ÁGUA FRIA', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'DH1012', 35.10, 65.00, 'NEGRO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0003-NG'),
    ('Chuveiro Higiénico WATER BLISS ÁGUA FRIA ORO', 'Chuveiro Higiénico', 3, 'WATER BLISS ÁGUA FRIA', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'DH1013', 45.90, 85.00, 'ORO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0003-ORO'),
    ('Chuveiro Higiénico WATER BLISS ÁGUA FRIA ROSA GOLD ESCOVADO', 'Chuveiro Higiénico', 3, 'WATER BLISS ÁGUA FRIA', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'DH1014', 45.90, 85.00, 'ROSA GOLD ESCOVADO', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0003-{cor}'),
    ('Chuveiro Higiénico WATER BLISS ÁGUA FRIA GUN METAL', 'Chuveiro Higiénico', 3, 'WATER BLISS ÁGUA FRIA', 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO', 'DH1015', 45.90, 85.00, 'GUN METAL', NULL::text, NULL::integer, NULL::integer, 'draft', 'DB-CH-0003-GMT');

  -- 1. quantos, por modelo, e os modelos
  SELECT count(*) INTO v_n FROM products p JOIN product_categories s ON s.id = p.subcategory_id AND s.parent_id = v_cat
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND public.fn_cat_chave_opcao(s.name) IN ('chuveiro higienico', 'colunas duche');
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 1 — % produtos nas subcategorias em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(e.sub || ' ' || e.nome || ': ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM (VALUES ('Chuveiro Higiénico', 1, 'ROUND MONOCOMANDO', 6), ('Chuveiro Higiénico', 2, 'ORION MONOCOMANDO', 6), ('Chuveiro Higiénico', 3, 'WATER BLISS ÁGUA FRIA', 5), ('Colunas Duche', 1, 'INVERTER R', 7), ('Colunas Duche', 2, 'INVERTER C', 7), ('Colunas Duche', 3, 'QUADRA ELITE', 2), ('Colunas Duche', 4, 'ROUND ELITE', 6), ('Colunas Duche', 5, 'NIGEL', 3), ('Colunas Duche', 6, 'NILO', 4), ('Colunas Duche', 7, 'ELBA', 2), ('Colunas Duche', 8, 'Chuveiro de encastre SIRIO', 7), ('Colunas Duche', 9, 'Braço de Teto SIRIO', 7), ('Colunas Duche', 10, 'Chuveiro de encastre ORION', 3), ('Colunas Duche', 11, 'Braço de Teto ORION', 3), ('Colunas Duche', 12, 'HIDROMASSAGEM GOTCHA', 3), ('Colunas Duche', 13, 'Braço de Parede SIRIO', 7), ('Colunas Duche', 14, 'Prato Redondo SIRIO', 7), ('Colunas Duche', 15, 'Braço de Parede ORION', 3), ('Colunas Duche', 16, 'Prato ORION', 3)) AS e(sub, numero, nome, n)
  LEFT JOIN product_categories s ON s.organization_id = c_org AND s.parent_id = v_cat AND s.deleted_at IS NULL
                                AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.sub)
  LEFT JOIN product_models pm ON pm.organization_id = c_org AND pm.subcategory_id = s.id AND pm.deleted_at IS NULL
                             AND pm.numero = e.numero AND pm.name = e.nome AND pm.is_active
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p
             WHERE p.organization_id = c_org AND NOT p.is_deleted GROUP BY p.model_id) x ON x.model_id = pm.id
  WHERE coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — por modelo: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM product_models pm JOIN product_categories s ON s.id = pm.subcategory_id AND s.parent_id = v_cat
  WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(s.name) IN ('chuveiro higienico', 'colunas duche');
  IF v_n <> 19 THEN RAISE EXCEPTION 'FALHOU: passo 1 — % modelos vivos nas subcategorias em vez de 19.', v_n; END IF;

  -- 2. cada produto como a linha do Excel
  SELECT count(*), string_agg(x.nome, ' | ') FILTER (WHERE x.k <= 5) INTO v_n, v_txt
  FROM (SELECT e.nome, row_number() OVER (ORDER BY e.nome) AS k
        FROM _t_esp e
        LEFT JOIN product_categories s ON s.organization_id = c_org AND s.parent_id = v_cat AND s.deleted_at IS NULL
                                      AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.sub)
        LEFT JOIN products p ON p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = s.id AND p.name = e.nome
        LEFT JOIN product_models pm ON pm.id = p.model_id
        LEFT JOIN brands bk ON bk.id = p.brand_id
        LEFT JOIN suppliers su ON su.id = p.supplier_id
        LEFT JOIN attribute_option_group_values oc ON oc.group_id = v_g_cor AND public.fn_cat_chave_opcao(oc.value_text::text) = public.fn_cat_chave_opcao(e.cor)
        LEFT JOIN attribute_option_group_values ol ON ol.group_id = v_g_larg AND public.fn_cat_chave_opcao(ol.value_text::text) = public.fn_cat_chave_opcao(e.larg)
        LEFT JOIN product_attribute_values vc ON vc.product_id = p.id AND vc.attribute_id = v_a_cor
        LEFT JOIN product_attribute_values vl ON vl.product_id = p.id AND vl.attribute_id = v_a_larg
        LEFT JOIN product_attribute_values vm ON vm.product_id = p.id AND vm.attribute_id = v_a_med
        LEFT JOIN product_prices pc ON pc.product_id = p.id AND pc.price_type = 'purchase'
        LEFT JOIN product_prices pv ON pv.product_id = p.id AND pv.price_type = 'retail'
        LEFT JOIN item_suppliers i ON i.product_id = p.id AND i.deleted_at IS NULL
        WHERE NOT coalesce(p.sku = replace(e.sku, '{cor}', coalesce(oc.sigla, '?')) AND p.sku_gerado
              AND pm.numero = e.numero AND pm.name = e.modelo AND pm.subcategory_id = s.id AND pm.deleted_at IS NULL
              AND p.category_id = v_cat AND p.brand_id = bk.id AND bk.name = e.marca AND p.marca_livre = e.marca
              AND public.fn_cat_chave_opcao(su.name) = public.fn_cat_chave_opcao(e.forn) AND p.supplier_id = su.id
              AND p.status::text = e.status AND p.is_active AND p.unidade = 'un' AND p.uom_id IS NOT NULL AND p.tipo_catalogo = 'produto'
              AND p.manages_stock
              AND ((e.cor IS NULL AND vc.product_id IS NULL) OR (oc.id IS NOT NULL AND vc.value_text = oc.value_text::text AND oc.is_active AND oc.sigla IS NOT NULL))
              AND ((e.larg IS NULL AND vl.product_id IS NULL) OR (ol.id IS NOT NULL AND vl.value_text = ol.value_text::text AND ol.is_active AND ol.sigla = e.larg))
              AND ((e.ml IS NULL AND vm.product_id IS NULL)
                   OR (vm.unit = 'cm' AND vm.value_json ->> 'tipo' = '2D' AND vm.value_json ->> 'unidade' = 'cm'
                       AND (vm.value_json ->> 'largura')::numeric = e.ml AND (vm.value_json ->> 'comprimento')::numeric = e.mc
                       AND public.fn_cat_medida_ler(vm.value_json, vm.unit) IS NOT NULL
                       AND vm.value_text = public.fn_cat_num_texto(e.ml::numeric) || ' × ' || public.fn_cat_num_texto(e.mc::numeric) || ' cm'))
              AND pc.price = e.custo AND pc.vat_rate = 23 AND pc.currency = 'EUR'
              AND pv.price = e.pvp AND pv.vat_rate = 23 AND pv.currency = 'EUR'
              AND i.supplier_id = su.id AND i.is_preferred AND i.is_active AND i.organization_id = c_org
              AND i.purchase_price = e.custo AND i.supplier_sku = e.cod,
              false)) x;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2 — % produtos diferentes da linha do Excel (ex.: %).', v_n, v_txt; END IF;
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN products p ON p.id = v.product_id
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT e.nome FROM _t_esp e);
  IF v_n <> c_n_valores THEN RAISE EXCEPTION 'FALHOU: passo 2 — % valores de atributos nos produtos (esperados %).', v_n, c_n_valores; END IF;

  -- 3. preços e fornecedores: nada a mais
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT e.nome FROM _t_esp e)
    AND ((SELECT count(*) FROM product_prices x WHERE x.product_id = p.id) <> 2
         OR (SELECT count(*) FROM item_suppliers x WHERE x.product_id = p.id AND x.deleted_at IS NULL) <> 1
         OR (SELECT count(*) FROM product_organizations x WHERE x.product_id = p.id) <> 1);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 3 — % produtos com preços, ligações a fornecedor ou product_organizations a mais ou a menos.', v_n; END IF;

  -- 4. SKUs únicos e no formato
  SELECT count(*), count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ '^DB-(CD|CH)-[0-9]{4}(-[A-Z0-9]+){0,3}$' OR p.sku ~ '^CAT-')
    INTO v_n, v_m, v_k
  FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT e.nome FROM _t_esp e);
  IF v_n <> c_total OR v_m <> c_total OR v_k > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — % produtos, % SKUs distintos, % fora do formato.', v_n, v_m, v_k;
  END IF;

  -- 5. as opções usadas
  SELECT string_agg(e.papel || ' ' || e.nome || ': ' || coalesce(o.sigla, 'sem opção/sigla') || ' em vez de ' || e.sigla, '; ') INTO v_txt
  FROM (VALUES ('cor', 'CROMO', 'CRO'), ('cor', 'NEGRO', 'NG'), ('cor', 'ORO', 'ORO'), ('cor', 'NIQUEL', 'NQ'), ('cor', 'TITANIO', 'TT'), ('cor', 'COBRE', 'CB'), ('cor', 'BRANCO', 'B'), ('cor', 'ROSA GOLD ESCOVADO', '*'), ('cor', 'GUN METAL', 'GMT')) AS e(papel, nome, sigla)
  LEFT JOIN attribute_option_group_values o
    ON o.group_id = (CASE WHEN e.papel = 'cor' THEN v_g_cor ELSE v_g_larg END)
   AND public.fn_cat_chave_opcao(o.value_text::text) = public.fn_cat_chave_opcao(e.nome) AND o.is_active
  WHERE o.id IS NULL OR o.sigla IS NULL OR (e.sigla <> '*' AND o.sigla IS DISTINCT FROM e.sigla);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — opções: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM (SELECT o.papel, o.nome FROM (VALUES ('cor', 'CROMO', 'CRO'), ('cor', 'NEGRO', 'NG'), ('cor', 'ORO', 'ORO'), ('cor', 'NIQUEL', 'NQ'), ('cor', 'TITANIO', 'TT'), ('cor', 'COBRE', 'CB'), ('cor', 'BRANCO', 'B'), ('cor', 'ROSA GOLD ESCOVADO', '*'), ('cor', 'GUN METAL', 'GMT')) AS o(papel, nome, sigla)) o2
  WHERE (SELECT count(*) FROM attribute_option_group_values v
         WHERE v.group_id = (CASE WHEN o2.papel = 'cor' THEN v_g_cor ELSE v_g_larg END)
           AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(o2.nome)) <> 1;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 5 — % opções repetidas ou em falta.', v_n; END IF;

  -- 6. nada escrito fora da Mudelar
  SELECT mode() WITHIN GROUP (ORDER BY p.xmin::text) INTO v_xid FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT e.nome FROM _t_esp e);
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
    UNION ALL SELECT 'attribute_option_group_values', count(*) FROM attribute_option_group_values v JOIN attribute_option_groups g ON g.id = v.group_id
              WHERE v.xmin::text = v_xid AND g.organization_id IS DISTINCT FROM c_org) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 6 — linhas de outras organizações escritas pela importação: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id IS DISTINCT FROM c_org
    AND (p.subcategory_id IN (SELECT s.id FROM product_categories s WHERE s.organization_id = c_org AND s.parent_id = v_cat
                              AND public.fn_cat_chave_opcao(s.name) IN ('chuveiro higienico', 'colunas duche'))
         OR p.model_id IN (SELECT pm.id FROM product_models pm WHERE pm.organization_id = c_org));
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 6 — % produtos de outras organizações apontam para subcategorias ou modelos da Mudelar.', v_n; END IF;

  -- 7. cat_prever_sku_modelo (só leitura) como um membro da Mudelar com products.edit, para todos
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 7 — sem membro ativo da Mudelar com products.edit.'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  v_n := 0;
  FOR r IN SELECT p.id, p.sku, p.category_id, p.subcategory_id, p.model_id, oc.id AS cor, ol.id AS larg, vm.value_json
           FROM products p
           LEFT JOIN product_attribute_values vc ON vc.product_id = p.id AND vc.attribute_id = v_a_cor
           LEFT JOIN attribute_option_group_values oc ON oc.group_id = v_g_cor AND oc.value_text = vc.value_text
           LEFT JOIN product_attribute_values vl ON vl.product_id = p.id AND vl.attribute_id = v_a_larg
           LEFT JOIN attribute_option_group_values ol ON ol.group_id = v_g_larg AND ol.value_text = vl.value_text
           LEFT JOIN product_attribute_values vm ON vm.product_id = p.id AND vm.attribute_id = v_a_med
           WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT e.nome FROM _t_esp e)
           ORDER BY p.sku LOOP
    v_attrs := coalesce(CASE WHEN r.cor IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_cor, 'opcao', r.cor)) END, '[]'::jsonb)
            || coalesce(CASE WHEN r.larg IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_larg, 'opcao', r.larg)) END, '[]'::jsonb)
            || coalesce(CASE WHEN r.value_json IS NOT NULL THEN jsonb_build_array(jsonb_build_object('atributo', v_a_med, 'medida', r.value_json)) END, '[]'::jsonb);
    v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.id);
    IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'FALHOU: passo 7 — cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 7 — só % produtos comparados.', v_n; END IF;

  -- 8. auditoria
  IF NOT EXISTS (SELECT 1 FROM entity_audit_log e WHERE e.organization_id = c_org AND e.source = 'migration:catalogo_colunas_duche_mudelar'
                 AND e.table_name = 'products') THEN
    RAISE EXCEPTION 'FALHOU: passo 8 — não há linhas de auditoria com a fonte migration:catalogo_colunas_duche_mudelar.';
  END IF;
END $t$;

SELECT 'OK: Colunas de Duche e Chuveiros Higiénicos da Mudelar (91 produtos, 19 modelos) conferidos nos passos 0 a 8.' AS resultado;

ROLLBACK;
