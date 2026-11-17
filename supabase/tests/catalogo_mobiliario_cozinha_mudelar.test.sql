-- ============================================================
-- Testes: 20270119800000_catalogo_mobiliario_cozinha_mudelar.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 119800000 (falha no passo 0: as 6 subcategorias de «Mobiliário & Componentes
-- Cozinha» da Mudelar não têm os 328 produtos); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
-- Ficheiro GERADO (gerar.js + sql.js, em import-mobiliario) a partir do mesmo CSV da migration.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355) e, para provar que nada foi escrito fora dela, as outras organizações (só
-- contagens pelo xmin da transação da migration, o dos produtos importados). Para comparar os SKUs com
-- cat_prever_sku_modelo usa, só nesta transação, as claims de um membro ativo da Mudelar com products.edit (a função é
-- só de leitura). Nenhuma chamada recusada de propósito.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_mobiliario_cozinha_mudelar.test.sql
--
-- O que PROVA:
--   1. 328 produtos vivos nas 6 subcategorias, por subcategoria.
--   2. Cada produto, pelo nome: subcategoria, modelo (nome e número), SKU gerado, cor (só os 66 verdes), largura, medida
--      2D (valor e intervalo), unidade (ml nos 2), custo, PVP (+40 / +10 nos verdes), grossista e distribuidor (só > 0),
--      fornecedor preferido com o supplier_sku, descrição, sem marca, nada a mais.
--   3. As opções da Largura usadas e as duas cores verdes: ativas, com sigla.
--   4. SKUs únicos na Mudelar, no formato, nenhum provisório; recalculado pela regra = gravado = cat_prever_sku_modelo.
--   5. Nada escrito fora da Mudelar, nem noutros produtos, atributos ou categorias dela.
--   6. A auditoria registou a criação dos 328 produtos com a fonte da migration.
-- O que NÃO cobre: o ecrã (um produto com medida em intervalo precisa do ecrã que já sabe mostrá-lo).
-- ============================================================

BEGIN;

-- ─── 0. A migration foi aplicada? ────────────────────────────────────────────
DO $t0$
DECLARE v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM products p JOIN product_categories s ON s.id = p.subcategory_id
  JOIN product_categories c ON c.id = s.parent_id
  WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
    AND c.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND c.parent_id IS NULL
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao('Mobiliário & Componentes Cozinha')
    AND s.sigla IN ('AC', 'ACL', 'AI', 'AS', 'CCP', 'PX');
  IF v_n <> 328 THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — as subcategorias de «Mobiliário & Componentes Cozinha» da Mudelar têm % produtos vivos em vez de 328 (aplicar 20270119800000).', v_n;
  END IF;
END $t0$;

-- ─── 1 a 6 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_total constant integer := 328;
  v_cat uuid; v_subs uuid[]; v_a_larg uuid; v_a_cor uuid; v_a_med uuid; v_g_larg uuid; v_g_cor uuid;
  v_n bigint; v_m bigint; v_k bigint; v_txt text; v_xid text; v_auth uuid; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  SELECT c.id INTO v_cat FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao('Mobiliário & Componentes Cozinha');
  SELECT array_agg(c.id) INTO v_subs FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL AND c.sigla IN ('AC', 'ACL', 'AI', 'AS', 'CCP', 'PX');
  SELECT a.id INTO v_a_larg FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'largura' AND NOT a.is_measurement;
  SELECT a.id INTO v_a_cor FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'cor' AND NOT a.is_measurement;
  SELECT a.id INTO v_a_med FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'medida' AND a.is_measurement;
  IF v_cat IS NULL OR cardinality(v_subs) IS DISTINCT FROM 6 OR v_a_larg IS NULL OR v_a_cor IS NULL OR v_a_med IS NULL THEN
    RAISE EXCEPTION 'FALHOU: configuração da Mudelar incompleta (categoria, 6 subcategorias, Largura, Cor, Medida).';
  END IF;
  v_g_larg := public.fn_cat_grupo_do_atributo(v_a_larg, c_org);
  v_g_cor := public.fn_cat_grupo_do_atributo(v_a_cor, c_org);

  -- 1. por subcategoria
  SELECT count(*), string_agg(e.nome || ' ' || coalesce(x.n, 0), ', ') INTO v_n, v_txt
  FROM (VALUES ('AC', 'Acessórios de Cozinha', 22), ('ACL', 'Armários de Coluna', 3), ('AI', 'Armários Inferiores', 103), ('AS', 'Armários superiores', 197), ('CCP', 'Cozinha Completa - Projetos', 1), ('PX', 'Puxadores', 2)) AS e(sigla, nome, esperados)
  LEFT JOIN (SELECT s.sigla, count(*) AS n FROM products p JOIN product_categories s ON s.id = p.subcategory_id
             WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.subcategory_id = ANY (v_subs) GROUP BY s.sigla) x ON x.sigla = e.sigla
  WHERE coalesce(x.n, 0) <> e.esperados;
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 1 — contagem por subcategoria errada: %', v_txt; END IF;

  -- 2. cada produto
  SELECT count(*), string_agg(e.nome, ' | ') INTO v_n, v_txt
  FROM (VALUES
    ('Estrutura de Pimenteiro para Interior do móvel de 200mm', 'AC', 'Estrutura de Pimenteiro para Interior do móvel de 200mm', 1, 'MCC-AC-0001', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 65.80, 109.67, 0.00, 0.00, 'MCC-AC-0001', NULL),
    ('Garrafeira Superior / Inferior de 15cm / 30cm (valor unitário)', 'AC', 'Garrafeira Superior / Inferior de 15cm / 30cm (valor unitário)', 2, 'MCC-AC-0002', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 122.50, 204.17, 0.00, 0.00, 'MCC-AC-0002', NULL),
    ('Garrafeira Coluna de 15cm / 30cm (valor unitário)', 'AC', 'Garrafeira Coluna de 15cm / 30cm (valor unitário)', 3, 'MCC-AC-0003', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 280.00, 466.67, 0.00, 0.00, 'MCC-AC-0003', NULL),
    ('Puxadores asa prata (valor unitário)', 'AC', 'Puxadores asa prata (valor unitário)', 4, 'MCC-AC-0004', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 4.83, 8.05, 0.00, 0.00, 'MCC-AC-0004', NULL),
    ('Porta talheres até 80cm', 'AC', 'Porta talheres até 80cm', 5, 'MCC-AC-0005', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 21.91, 36.52, 0.00, 0.00, 'MCC-AC-0005', NULL),
    ('Estrutura para gavetão (valor unitário)', 'AC', 'Estrutura para gavetão (valor unitário)', 6, 'MCC-AC-0006', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 39.48, 65.80, 0.00, 0.00, 'MCC-AC-0006', NULL),
    ('Estrutura para gaveta (valor unitário)', 'AC', 'Estrutura para gaveta (valor unitário)', 7, 'MCC-AC-0007', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 34.58, 57.63, 0.00, 0.00, 'MCC-AC-0007', NULL),
    ('Estrutura de Gavetões Internos para dispenseiro (valor até 4 unidades)', 'AC', 'Estrutura de Gavetões Internos para dispenseiro (valor até 4 unidades)', 8, 'MCC-AC-0008', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 122.50, 204.17, 0.00, 0.00, 'MCC-AC-0008', NULL),
    ('Iluminação LED móveis superiores (valor p/ml)', 'AC', 'Iluminação LED móveis superiores (valor p/ml)', 9, 'MCC-AC-0009', NULL, NULL, NULL::jsonb, NULL::jsonb, 'ml', 94.50, 157.50, 0.00, 0.00, 'MCC-AC-0009', NULL),
    ('Vista superior até 20cm de altura (valor p/ml)', 'AC', 'Vista superior até 20cm de altura (valor p/ml)', 10, 'MCC-AC-0010', NULL, NULL, NULL::jsonb, NULL::jsonb, 'ml', 35.00, 58.33, 0.00, 0.00, 'MCC-AC-0010', NULL),
    ('Caixote do Lixo para Mobiliário de cozinha', 'AC', 'Caixote do Lixo para Mobiliário de cozinha', 11, 'MCC-AC-0011', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 63.00, 105.00, 0.00, 0.00, 'MCC-AC-0011', NULL),
    ('BLOCO EM TERMOLAMINADO BRANCO BRILHO C/ 450X400X600 - 1 GAVETÃO + TAMPO', 'AC', 'BLOCO EM TERMOLAMINADO BRANCO BRILHO C/ 450X400X600 - 1 GAVETÃO + TAMPO', 12, 'MCC-AC-0012', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 429.00, 715.00, 0.00, 0.00, 'MCC-AC-0012', NULL),
    ('BLOCO EM TERMOLAMINADO BRANCO BRILHO C/ 450X400X750 - 1 GAVETÃO + TAMPO', 'AC', 'BLOCO EM TERMOLAMINADO BRANCO BRILHO C/ 450X400X750 - 1 GAVETÃO + TAMPO', 13, 'MCC-AC-0013', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 494.00, 823.33, 0.00, 0.00, 'MCC-AC-0013', 'Abertura de gaveta até 60cm no máximo (corrediças de 60cm)'),
    ('TAMPO EM TERMOLAMINADO BRANCO BRILHO C/ 750X600XPÉ INOX', 'AC', 'TAMPO EM TERMOLAMINADO BRANCO BRILHO C/ 750X600XPÉ INOX', 14, 'MCC-AC-0014', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 234.00, 390.00, 0.00, 0.00, 'MCC-AC-0014', NULL),
    ('PRATELEIRA SUSPENSA TERMOLAMINADO BRANCO BRILHO C/ 1400', 'AC', 'PRATELEIRA SUSPENSA TERMOLAMINADO BRANCO BRILHO C/ 1400', 15, 'MCC-AC-0015', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 260.00, 433.33, 0.00, 0.00, 'MCC-AC-0015', NULL),
    ('Prateleira em Melamina Nogueira C/Fixação Oculta 250x650x40', 'AC', 'Prateleira em Melamina Nogueira C/Fixação Oculta 250x650x40', 16, 'MCC-AC-0016', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 65.00, 108.33, 0.00, 0.00, 'MCC-AC-0016', NULL),
    ('Prateleira em Melamina Nogueira C/Fixação Oculta 250x1100x250', 'AC', 'Prateleira em Melamina Nogueira C/Fixação Oculta 250x1100x250', 17, 'MCC-AC-0017', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 104.00, 173.33, 0.00, 0.00, 'MCC-AC-0017', NULL),
    ('ESTRUTURA LAUNDRY CARRIER 500 2X33L 528MM ALT 545MM ANTRACITE', 'AC', 'ESTRUTURA LAUNDRY CARRIER 500 2X33L 528MM ALT 545MM ANTRACITE', 18, 'MCC-AC-0018', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 332.21, 553.68, 0.00, 0.00, '940TUL0000004 3270821', 'P/ MOVEL INFERIOR DE 600 LARG'),
    ('PRATELEIRA VIDRO INCOLOR 6MM C/ ARESTAS C/ 600X400 P/Móvel de Cozinha', 'AC', 'PRATELEIRA VIDRO INCOLOR 6MM C/ ARESTAS C/ 600X400 P/Móvel de Cozinha', 19, 'MCC-AC-0019', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 91.00, 151.66, 0.00, 0.00, 'MCC-AC-0019', NULL),
    ('ARO + ESTRUTURA + FRENTE P/ PRATELEIRA EXTRAIVEL DE 600 DE LARGURA ( P/ COLOCAR POR BAIXO DA ZONHA DE MAQ)', 'AC', 'ARO + ESTRUTURA + FRENTE P/ PRATELEIRA EXTRAIVEL DE 600 DE LARGURA ( P/ COLOCAR POR BAIXO DA ZONHA DE MAQ)', 20, 'MCC-AC-0020', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 85.00, 141.66, 0.00, 0.00, 'MCC-AC-0020', NULL),
    ('RIPADOS MELAMINA 2400X700 ORC2691/2118', 'AC', 'RIPADOS MELAMINA 2400X700 ORC2691/2118', 21, 'MCC-AC-0021', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 325.00, 541.66, 0.00, 0.00, 'MCC-AC-0021', NULL),
    ('Reparação de Estrutura p/ Gaveta + Gavetão', 'AC', 'Reparação de Estrutura p/ Gaveta + Gavetão', 22, 'MCC-AC-0022', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 155.20, 258.66, 0.00, 0.00, 'MCC-AC-0022', NULL),
    ('Armário de Coluna C/Espaço Interior 2400x1000x600', 'ACL', 'Armário de Coluna C/Espaço Interior 2400x1000x600', 1, 'MCC-ACL-0001', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 845.00, 1408.33, 0.00, 0.00, 'MCC-ACL-0001', NULL),
    ('COLUNA CRISTALEIRA C/ 2500X400X400 C/ 4 PRATELEIRS E 2 FRENTES EM VIDRO INCOLOR', 'ACL', 'COLUNA CRISTALEIRA C/ 2500X400X400 C/ 4 PRATELEIRS E 2 FRENTES EM VIDRO INCOLOR', 2, 'MCC-ACL-0002', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 689.00, 1148.34, 0.00, 0.00, 'MCC-ACL-0002', NULL),
    ('ARMÁRIO DE COLUNA COM CANTO DE ARRUMAÇÃO 1200X2400X600', 'ACL', 'ARMÁRIO DE COLUNA COM CANTO DE ARRUMAÇÃO 1200X2400X600', 3, 'MCC-ACL-0003', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 1480.00, 2467.00, 0.00, 0.00, 'MCC-ACL-0003', NULL),
    ('Armário Inferior TERMOLAMINADO', 'AI', 'Armário Inferior TERMOLAMINADO', 1, 'MCC-AI-0001', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, 'MCC-AI-0001', NULL),
    ('Armário Inferior MELAMINA', 'AI', 'Armário Inferior MELAMINA', 2, 'MCC-AI-0002', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, 'MCC-AI-0002', NULL),
    ('Armário Inferior LACADO', 'AI', 'Armário Inferior LACADO', 3, 'MCC-AI-0003', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, 'MCC-AI-0003', NULL),
    ('Armário Inferior de cozinha de 91cm a 100cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-91A100', NULL, '91-100', NULL::jsonb, NULL::jsonb, 'un', 289.84, 483.07, 0.00, 0.00, 'MCC-AI-0004-91A100', NULL),
    ('Armário Inferior de cozinha de 91cm a 100cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-91A100', 'verde normal', '91-100', NULL::jsonb, NULL::jsonb, 'un', 289.84, 523.07, 0.00, 0.00, 'MCC-AI-0004-VNR-91A100', NULL),
    ('Armário Inferior de cozinha de 91cm a 100cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-91A100', 'verde claro', '91-100', NULL::jsonb, NULL::jsonb, 'un', 289.84, 493.07, 0.00, 0.00, 'MCC-AI-0004-VC-91A100', NULL),
    ('Armário Inferior de cozinha 30cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-30', NULL, '30', NULL::jsonb, NULL::jsonb, 'un', 87.50, 145.83, 0.00, 0.00, 'MCC-AI-0004-30', NULL),
    ('Armário Inferior de cozinha 30cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-30', 'verde normal', '30', NULL::jsonb, NULL::jsonb, 'un', 87.50, 185.83, 0.00, 0.00, 'MCC-AI-0004-VNR-30', NULL),
    ('Armário Inferior de cozinha 30cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-30', 'verde claro', '30', NULL::jsonb, NULL::jsonb, 'un', 87.50, 155.83, 0.00, 0.00, 'MCC-AI-0004-VC-30', NULL),
    ('Armário Inferior de cozinha 100cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-100', NULL, '100', NULL::jsonb, NULL::jsonb, 'un', 231.88, 386.47, 0.00, 0.00, 'MCC-AI-0004-100', NULL),
    ('Armário Inferior de cozinha 100cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-100', 'verde normal', '100', NULL::jsonb, NULL::jsonb, 'un', 231.88, 426.47, 0.00, 0.00, 'MCC-AI-0004-VNR-100', NULL),
    ('Armário Inferior de cozinha 100cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-100', 'verde claro', '100', NULL::jsonb, NULL::jsonb, 'un', 231.88, 396.47, 0.00, 0.00, 'MCC-AI-0004-VC-100', NULL),
    ('Armário Inferior de cozinha 70cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-70', NULL, '70', NULL::jsonb, NULL::jsonb, 'un', 179.38, 298.97, 0.00, 0.00, 'MCC-AI-0004-70', NULL),
    ('Armário Inferior de cozinha 70cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-70', 'verde normal', '70', NULL::jsonb, NULL::jsonb, 'un', 179.38, 338.97, 0.00, 0.00, 'MCC-AI-0004-VNR-70', NULL),
    ('Armário Inferior de cozinha 70cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-70', 'verde claro', '70', NULL::jsonb, NULL::jsonb, 'un', 179.38, 308.97, 0.00, 0.00, 'MCC-AI-0004-VC-70', NULL),
    ('Armário Inferior de cozinha 60cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-60', NULL, '60', NULL::jsonb, NULL::jsonb, 'un', 157.50, 262.50, 0.00, 0.00, 'MCC-AI-0004-60', NULL),
    ('Armário Inferior de cozinha 60cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-60', 'verde normal', '60', NULL::jsonb, NULL::jsonb, 'un', 157.50, 302.50, 0.00, 0.00, 'MCC-AI-0004-VNR-60', NULL),
    ('Armário Inferior de cozinha 60cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-60', 'verde claro', '60', NULL::jsonb, NULL::jsonb, 'un', 157.50, 272.50, 0.00, 0.00, 'MCC-AI-0004-VC-60', NULL),
    ('Armário Inferior de cozinha de 61cm a 70cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-61A70', NULL, '61-70', NULL::jsonb, NULL::jsonb, 'un', 224.22, 373.70, 0.00, 0.00, 'MCC-AI-0004-61A70', NULL),
    ('Armário Inferior de cozinha de 61cm a 70cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-61A70', 'verde normal', '61-70', NULL::jsonb, NULL::jsonb, 'un', 224.22, 413.70, 0.00, 0.00, 'MCC-AI-0004-VNR-61A70', NULL),
    ('Armário Inferior de cozinha de 61cm a 70cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-61A70', 'verde claro', '61-70', NULL::jsonb, NULL::jsonb, 'un', 224.22, 383.70, 0.00, 0.00, 'MCC-AI-0004-VC-61A70', NULL),
    ('Armário Inferior de cozinha de 71cm a 80cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-71A80', NULL, '71-80', NULL::jsonb, NULL::jsonb, 'un', 235.16, 391.93, 0.00, 0.00, 'MCC-AI-0004-71A80', NULL),
    ('Armário Inferior de cozinha de 71cm a 80cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-71A80', 'verde normal', '71-80', NULL::jsonb, NULL::jsonb, 'un', 235.16, 431.93, 0.00, 0.00, 'MCC-AI-0004-VNR-71A80', NULL),
    ('Armário Inferior de cozinha de 71cm a 80cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-71A80', 'verde claro', '71-80', NULL::jsonb, NULL::jsonb, 'un', 235.16, 401.93, 0.00, 0.00, 'MCC-AI-0004-VC-71A80', NULL),
    ('Armário Inferior de cozinha de 51cm a 60cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-51A60', NULL, '51-60', NULL::jsonb, NULL::jsonb, 'un', 196.88, 328.13, 0.00, 0.00, 'MCC-AI-0004-51A60', NULL),
    ('Armário Inferior de cozinha de 51cm a 60cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-51A60', 'verde normal', '51-60', NULL::jsonb, NULL::jsonb, 'un', 196.88, 368.13, 0.00, 0.00, 'MCC-AI-0004-VNR-51A60', NULL),
    ('Armário Inferior de cozinha de 51cm a 60cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-51A60', 'verde claro', '51-60', NULL::jsonb, NULL::jsonb, 'un', 196.88, 338.13, 0.00, 0.00, 'MCC-AI-0004-VC-51A60', NULL),
    ('Armário Inferior de cozinha de 41cm a 50cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-41A50', NULL, '41-50', NULL::jsonb, NULL::jsonb, 'un', 175.00, 291.67, 0.00, 0.00, 'MCC-AI-0004-41A50', NULL),
    ('Armário Inferior de cozinha de 41cm a 50cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-41A50', 'verde normal', '41-50', NULL::jsonb, NULL::jsonb, 'un', 175.00, 331.67, 0.00, 0.00, 'MCC-AI-0004-VNR-41A50', NULL),
    ('Armário Inferior de cozinha de 41cm a 50cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-41A50', 'verde claro', '41-50', NULL::jsonb, NULL::jsonb, 'un', 175.00, 301.67, 0.00, 0.00, 'MCC-AI-0004-VC-41A50', NULL),
    ('Armário Inferior de cozinha 80cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-80', NULL, '80', NULL::jsonb, NULL::jsonb, 'un', 188.13, 313.55, 0.00, 0.00, 'MCC-AI-0004-80', NULL),
    ('Armário Inferior de cozinha 80cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-80', 'verde normal', '80', NULL::jsonb, NULL::jsonb, 'un', 188.13, 353.55, 0.00, 0.00, 'MCC-AI-0004-VNR-80', NULL),
    ('Armário Inferior de cozinha 80cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-80', 'verde claro', '80', NULL::jsonb, NULL::jsonb, 'un', 188.13, 323.55, 0.00, 0.00, 'MCC-AI-0004-VC-80', NULL),
    ('Armário Inferior de cozinha de 0 a 30cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-0A30', NULL, '0-30', NULL::jsonb, NULL::jsonb, 'un', 109.38, 182.30, 0.00, 0.00, 'MCC-AI-0004-0A30', NULL),
    ('Armário Inferior de cozinha de 0 a 30cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-0A30', 'verde normal', '0-30', NULL::jsonb, NULL::jsonb, 'un', 109.38, 222.30, 0.00, 0.00, 'MCC-AI-0004-VNR-0A30', NULL),
    ('Armário Inferior de cozinha de 0 a 30cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-0A30', 'verde claro', '0-30', NULL::jsonb, NULL::jsonb, 'un', 109.38, 192.30, 0.00, 0.00, 'MCC-AI-0004-VC-0A30', NULL),
    ('Armário Inferior de cozinha de 31cm a 40cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-31A40', NULL, '31-40', NULL::jsonb, NULL::jsonb, 'un', 147.66, 246.10, 0.00, 0.00, 'MCC-AI-0004-31A40', NULL),
    ('Armário Inferior de cozinha de 31cm a 40cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-31A40', 'verde normal', '31-40', NULL::jsonb, NULL::jsonb, 'un', 147.66, 286.10, 0.00, 0.00, 'MCC-AI-0004-VNR-31A40', NULL),
    ('Armário Inferior de cozinha de 31cm a 40cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-31A40', 'verde claro', '31-40', NULL::jsonb, NULL::jsonb, 'un', 147.66, 256.10, 0.00, 0.00, 'MCC-AI-0004-VC-31A40', NULL),
    ('Armário Inferior de cozinha 50cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-50', NULL, '50', NULL::jsonb, NULL::jsonb, 'un', 140.00, 233.33, 0.00, 0.00, 'MCC-AI-0004-50', NULL),
    ('Armário Inferior de cozinha 50cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-50', 'verde normal', '50', NULL::jsonb, NULL::jsonb, 'un', 140.00, 273.33, 0.00, 0.00, 'MCC-AI-0004-VNR-50', NULL),
    ('Armário Inferior de cozinha 50cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-50', 'verde claro', '50', NULL::jsonb, NULL::jsonb, 'un', 140.00, 243.33, 0.00, 0.00, 'MCC-AI-0004-VC-50', NULL),
    ('Armário Inferior de cozinha 40cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-40', NULL, '40', NULL::jsonb, NULL::jsonb, 'un', 118.13, 196.88, 0.00, 0.00, 'MCC-AI-0004-40', NULL),
    ('Armário Inferior de cozinha 40cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-40', 'verde normal', '40', NULL::jsonb, NULL::jsonb, 'un', 118.13, 236.88, 0.00, 0.00, 'MCC-AI-0004-VNR-40', NULL),
    ('Armário Inferior de cozinha 40cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-40', 'verde claro', '40', NULL::jsonb, NULL::jsonb, 'un', 118.13, 206.88, 0.00, 0.00, 'MCC-AI-0004-VC-40', NULL),
    ('Armário Inferior de cozinha de 81cm a 90cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-81A90', NULL, '81-90', NULL::jsonb, NULL::jsonb, 'un', 246.09, 410.15, 0.00, 0.00, 'MCC-AI-0004-81A90', NULL),
    ('Armário Inferior de cozinha de 81cm a 90cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-81A90', 'verde normal', '81-90', NULL::jsonb, NULL::jsonb, 'un', 246.09, 450.15, 0.00, 0.00, 'MCC-AI-0004-VNR-81A90', NULL),
    ('Armário Inferior de cozinha de 81cm a 90cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-81A90', 'verde claro', '81-90', NULL::jsonb, NULL::jsonb, 'un', 246.09, 420.15, 0.00, 0.00, 'MCC-AI-0004-VC-81A90', NULL),
    ('Armário Inferior de cozinha 90cm', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-90', NULL, '90', NULL::jsonb, NULL::jsonb, 'un', 196.88, 328.13, 0.00, 0.00, 'MCC-AI-0004-90', NULL),
    ('Armário Inferior de cozinha 90cm - Verde normal', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VNR-90', 'verde normal', '90', NULL::jsonb, NULL::jsonb, 'un', 196.88, 368.13, 0.00, 0.00, 'MCC-AI-0004-VNR-90', NULL),
    ('Armário Inferior de cozinha 90cm - Verde claro', 'AI', 'Armário Inferior de cozinha', 4, 'MCC-AI-0004-VC-90', 'verde claro', '90', NULL::jsonb, NULL::jsonb, 'un', 196.88, 338.13, 0.00, 0.00, 'MCC-AI-0004-VC-90', NULL),
    ('Armário Inferior de cozinha lacado 90cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-90', NULL, '90', NULL::jsonb, NULL::jsonb, 'un', 359.10, 598.50, 0.00, 0.00, 'MCC-AI-0005-90', NULL),
    ('Armário Inferior de cozinha lacado 90cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-90', 'verde normal', '90', NULL::jsonb, NULL::jsonb, 'un', 359.10, 638.50, 0.00, 0.00, 'MCC-AI-0005-VNR-90', NULL),
    ('Armário Inferior de cozinha lacado 90cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-90', 'verde claro', '90', NULL::jsonb, NULL::jsonb, 'un', 359.10, 608.50, 0.00, 0.00, 'MCC-AI-0005-VC-90', NULL),
    ('Armário Inferior de cozinha lacado de 41cm a 50cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-41A50', NULL, '41-50', NULL::jsonb, NULL::jsonb, 'un', 248.06, 413.43, 0.00, 0.00, 'MCC-AI-0005-41A50', NULL),
    ('Armário Inferior de cozinha lacado de 41cm a 50cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-41A50', 'verde normal', '41-50', NULL::jsonb, NULL::jsonb, 'un', 248.06, 453.43, 0.00, 0.00, 'MCC-AI-0005-VNR-41A50', NULL),
    ('Armário Inferior de cozinha lacado de 41cm a 50cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-41A50', 'verde claro', '41-50', NULL::jsonb, NULL::jsonb, 'un', 248.06, 423.43, 0.00, 0.00, 'MCC-AI-0005-VC-41A50', NULL),
    ('Armário Inferior de cozinha lacado 40cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-40', NULL, '40', NULL::jsonb, NULL::jsonb, 'un', 160.65, 267.75, 0.00, 0.00, 'MCC-AI-0005-40', NULL),
    ('Armário Inferior de cozinha lacado 40cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-40', 'verde normal', '40', NULL::jsonb, NULL::jsonb, 'un', 160.65, 307.75, 0.00, 0.00, 'MCC-AI-0005-VNR-40', NULL),
    ('Armário Inferior de cozinha lacado 40cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-40', 'verde claro', '40', NULL::jsonb, NULL::jsonb, 'un', 160.65, 277.75, 0.00, 0.00, 'MCC-AI-0005-VC-40', NULL),
    ('Armário Inferior de cozinha lacado 60cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-60', NULL, '60', NULL::jsonb, NULL::jsonb, 'un', 236.25, 393.75, 0.00, 0.00, 'MCC-AI-0005-60', NULL),
    ('Armário Inferior de cozinha lacado 60cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-60', 'verde normal', '60', NULL::jsonb, NULL::jsonb, 'un', 236.25, 433.75, 0.00, 0.00, 'MCC-AI-0005-VNR-60', NULL),
    ('Armário Inferior de cozinha lacado 60cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-60', 'verde claro', '60', NULL::jsonb, NULL::jsonb, 'un', 236.25, 403.75, 0.00, 0.00, 'MCC-AI-0005-VC-60', NULL),
    ('Armário Inferior de cozinha lacado de 0 a 30cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-0A30', NULL, '0-30', NULL::jsonb, NULL::jsonb, 'un', 148.84, 248.07, 0.00, 0.00, 'MCC-AI-0005-0A30', NULL),
    ('Armário Inferior de cozinha lacado de 0 a 30cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-0A30', 'verde normal', '0-30', NULL::jsonb, NULL::jsonb, 'un', 148.84, 288.07, 0.00, 0.00, 'MCC-AI-0005-VNR-0A30', NULL),
    ('Armário Inferior de cozinha lacado de 0 a 30cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-0A30', 'verde claro', '0-30', NULL::jsonb, NULL::jsonb, 'un', 148.84, 258.07, 0.00, 0.00, 'MCC-AI-0005-VC-0A30', NULL),
    ('Armário Inferior de cozinha lacado 80cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-80', NULL, '80', NULL::jsonb, NULL::jsonb, 'un', 311.85, 519.75, 0.00, 0.00, 'MCC-AI-0005-80', NULL),
    ('Armário Inferior de cozinha lacado 80cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-80', 'verde normal', '80', NULL::jsonb, NULL::jsonb, 'un', 311.85, 559.75, 0.00, 0.00, 'MCC-AI-0005-VNR-80', NULL),
    ('Armário Inferior de cozinha lacado 80cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-80', 'verde claro', '80', NULL::jsonb, NULL::jsonb, 'un', 311.85, 529.75, 0.00, 0.00, 'MCC-AI-0005-VC-80', NULL),
    ('Armário Inferior de cozinha lacado 30cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-30', NULL, '30', NULL::jsonb, NULL::jsonb, 'un', 119.07, 198.45, 0.00, 0.00, 'MCC-AI-0005-30', NULL),
    ('Armário Inferior de cozinha lacado 30cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-30', 'verde normal', '30', NULL::jsonb, NULL::jsonb, 'un', 119.07, 238.45, 0.00, 0.00, 'MCC-AI-0005-VNR-30', NULL),
    ('Armário Inferior de cozinha lacado 30cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-30', 'verde claro', '30', NULL::jsonb, NULL::jsonb, 'un', 119.07, 208.45, 0.00, 0.00, 'MCC-AI-0005-VC-30', NULL),
    ('Armário Inferior de cozinha lacado de 61cm a 70cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-61A70', NULL, '61-70', NULL::jsonb, NULL::jsonb, 'un', 348.47, 580.78, 0.00, 0.00, 'MCC-AI-0005-61A70', NULL),
    ('Armário Inferior de cozinha lacado de 61cm a 70cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-61A70', 'verde normal', '61-70', NULL::jsonb, NULL::jsonb, 'un', 348.47, 620.78, 0.00, 0.00, 'MCC-AI-0005-VNR-61A70', NULL),
    ('Armário Inferior de cozinha lacado de 61cm a 70cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-61A70', 'verde claro', '61-70', NULL::jsonb, NULL::jsonb, 'un', 348.47, 590.78, 0.00, 0.00, 'MCC-AI-0005-VC-61A70', NULL),
    ('Armário Inferior de cozinha lacado 50cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-50', NULL, '50', NULL::jsonb, NULL::jsonb, 'un', 198.45, 330.75, 0.00, 0.00, 'MCC-AI-0005-50', NULL),
    ('Armário Inferior de cozinha lacado 50cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-50', 'verde normal', '50', NULL::jsonb, NULL::jsonb, 'un', 198.45, 370.75, 0.00, 0.00, 'MCC-AI-0005-VNR-50', NULL),
    ('Armário Inferior de cozinha lacado 50cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-50', 'verde claro', '50', NULL::jsonb, NULL::jsonb, 'un', 198.45, 340.75, 0.00, 0.00, 'MCC-AI-0005-VC-50', NULL),
    ('Armário Inferior de cozinha lacado 70cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-70', NULL, '70', NULL::jsonb, NULL::jsonb, 'un', 278.78, 464.63, 0.00, 0.00, 'MCC-AI-0005-70', NULL),
    ('Armário Inferior de cozinha lacado 70cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-70', 'verde normal', '70', NULL::jsonb, NULL::jsonb, 'un', 278.78, 504.63, 0.00, 0.00, 'MCC-AI-0005-VNR-70', NULL),
    ('Armário Inferior de cozinha lacado 70cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-70', 'verde claro', '70', NULL::jsonb, NULL::jsonb, 'un', 278.78, 474.63, 0.00, 0.00, 'MCC-AI-0005-VC-70', NULL),
    ('Armário Inferior de cozinha lacado de 91cm a 100cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-91A100', NULL, '91-100', NULL::jsonb, NULL::jsonb, 'un', 496.13, 826.88, 0.00, 0.00, 'MCC-AI-0005-91A100', NULL),
    ('Armário Inferior de cozinha lacado de 91cm a 100cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-91A100', 'verde normal', '91-100', NULL::jsonb, NULL::jsonb, 'un', 496.13, 866.88, 0.00, 0.00, 'MCC-AI-0005-VNR-91A100', NULL),
    ('Armário Inferior de cozinha lacado de 91cm a 100cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-91A100', 'verde claro', '91-100', NULL::jsonb, NULL::jsonb, 'un', 496.13, 836.88, 0.00, 0.00, 'MCC-AI-0005-VC-91A100', NULL),
    ('Armário Inferior de cozinha lacado de 71cm a 80cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-71A80', NULL, '71-80', NULL::jsonb, NULL::jsonb, 'un', 389.81, 649.68, 0.00, 0.00, 'MCC-AI-0005-71A80', NULL),
    ('Armário Inferior de cozinha lacado de 71cm a 80cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-71A80', 'verde normal', '71-80', NULL::jsonb, NULL::jsonb, 'un', 389.81, 689.68, 0.00, 0.00, 'MCC-AI-0005-VNR-71A80', NULL),
    ('Armário Inferior de cozinha lacado de 71cm a 80cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-71A80', 'verde claro', '71-80', NULL::jsonb, NULL::jsonb, 'un', 389.81, 659.68, 0.00, 0.00, 'MCC-AI-0005-VC-71A80', NULL),
    ('Armário Inferior de cozinha lacado de 51cm a 60cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-51A60', NULL, '51-60', NULL::jsonb, NULL::jsonb, 'un', 295.31, 492.18, 0.00, 0.00, 'MCC-AI-0005-51A60', NULL),
    ('Armário Inferior de cozinha lacado de 51cm a 60cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-51A60', 'verde normal', '51-60', NULL::jsonb, NULL::jsonb, 'un', 295.31, 532.18, 0.00, 0.00, 'MCC-AI-0005-VNR-51A60', NULL),
    ('Armário Inferior de cozinha lacado de 51cm a 60cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-51A60', 'verde claro', '51-60', NULL::jsonb, NULL::jsonb, 'un', 295.31, 502.18, 0.00, 0.00, 'MCC-AI-0005-VC-51A60', NULL),
    ('Armário Inferior de cozinha lacado de 31cm a 40cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-31A40', NULL, '31-40', NULL::jsonb, NULL::jsonb, 'un', 200.81, 334.68, 0.00, 0.00, 'MCC-AI-0005-31A40', NULL),
    ('Armário Inferior de cozinha lacado de 31cm a 40cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-31A40', 'verde normal', '31-40', NULL::jsonb, NULL::jsonb, 'un', 200.81, 374.68, 0.00, 0.00, 'MCC-AI-0005-VNR-31A40', NULL),
    ('Armário Inferior de cozinha lacado de 31cm a 40cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-31A40', 'verde claro', '31-40', NULL::jsonb, NULL::jsonb, 'un', 200.81, 344.68, 0.00, 0.00, 'MCC-AI-0005-VC-31A40', NULL),
    ('Armário Inferior de cozinha lacado de 81cm a 90cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-81A90', NULL, '81-90', NULL::jsonb, NULL::jsonb, 'un', 448.88, 748.13, 0.00, 0.00, 'MCC-AI-0005-81A90', NULL),
    ('Armário Inferior de cozinha lacado de 81cm a 90cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-81A90', 'verde normal', '81-90', NULL::jsonb, NULL::jsonb, 'un', 448.88, 788.13, 0.00, 0.00, 'MCC-AI-0005-VNR-81A90', NULL),
    ('Armário Inferior de cozinha lacado de 81cm a 90cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-81A90', 'verde claro', '81-90', NULL::jsonb, NULL::jsonb, 'un', 448.88, 758.13, 0.00, 0.00, 'MCC-AI-0005-VC-81A90', NULL),
    ('Armário Inferior de cozinha lacado 100cm', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-100', NULL, '100', NULL::jsonb, NULL::jsonb, 'un', 396.90, 661.50, 0.00, 0.00, 'MCC-AI-0005-100', NULL),
    ('Armário Inferior de cozinha lacado 100cm - Verde normal', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VNR-100', 'verde normal', '100', NULL::jsonb, NULL::jsonb, 'un', 396.90, 701.50, 0.00, 0.00, 'MCC-AI-0005-VNR-100', NULL),
    ('Armário Inferior de cozinha lacado 100cm - Verde claro', 'AI', 'Armário Inferior de cozinha lacado', 5, 'MCC-AI-0005-VC-100', 'verde claro', '100', NULL::jsonb, NULL::jsonb, 'un', 396.90, 671.50, 0.00, 0.00, 'MCC-AI-0005-VC-100', NULL),
    ('Armário Inferior de cozinha Canto em L', 'AI', 'Armário Inferior de cozinha Canto em L', 6, 'MCC-AI-0006', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 249.20, 415.33, 0.00, 0.00, 'MCC-AI-0006', NULL),
    ('Armário Inferior de cozinha Canto em L - Verde normal', 'AI', 'Armário Inferior de cozinha Canto em L', 6, 'MCC-AI-0006-VNR', 'verde normal', NULL, NULL::jsonb, NULL::jsonb, 'un', 249.20, 455.33, 0.00, 0.00, 'MCC-AI-0006-VNR', NULL),
    ('Armário Inferior de cozinha Canto em L - Verde claro', 'AI', 'Armário Inferior de cozinha Canto em L', 6, 'MCC-AI-0006-VC', 'verde claro', NULL, NULL::jsonb, NULL::jsonb, 'un', 249.20, 425.33, 0.00, 0.00, 'MCC-AI-0006-VC', NULL),
    ('Armários Inferiores de cozinha Conforme Layout MD1394 Acréscimo 5 cm de Altura', 'AI', 'Armários Inferiores de cozinha Conforme Layout MD1394 Acréscimo 5 cm de Altura', 7, 'MCC-AI-0007', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 373.65, 622.75, 0.00, 0.00, 'MCC-AI-0007', NULL),
    ('Armário superior TERMOLAMINADO', 'AS', 'Armário superior TERMOLAMINADO', 1, 'MCC-AS-0001', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, 'MCC-AS-0001', NULL),
    ('Armário superior MELAMINA', 'AS', 'Armário superior MELAMINA', 2, 'MCC-AS-0002', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, 'MCC-AS-0002', NULL),
    ('Armário superior LACADO', 'AS', 'Armário superior LACADO', 3, 'MCC-AS-0003', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, 'MCC-AS-0003', NULL),
    ('Armário Superior de cozinha de 91 a 100x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-91A100X90', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '90'::jsonb, 'un', 295.31, 492.18, 0.00, 0.00, 'MCC-AS-0004-91A100X90', NULL),
    ('Armário Superior de cozinha de 61 a 70x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-61A70X90', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '90'::jsonb, 'un', 229.69, 382.82, 0.00, 0.00, 'MCC-AS-0004-61A70X90', NULL),
    ('Armário Superior de cozinha de 81 a 90x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-81A90X90', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '90'::jsonb, 'un', 251.57, 419.28, 0.00, 0.00, 'MCC-AS-0004-81A90X90', NULL),
    ('Armário Superior de cozinha 90x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-90X70', NULL, NULL, '90'::jsonb, '70'::jsonb, 'un', 188.13, 328.13, 0.00, 0.00, 'MCC-AS-0004-90X70', NULL),
    ('Armário Superior de cozinha 70x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-70X90', NULL, NULL, '70'::jsonb, '90'::jsonb, 'un', 183.75, 306.25, 0.00, 0.00, 'MCC-AS-0004-70X90', NULL),
    ('Armário Superior de cozinha 60x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-60X70', NULL, NULL, '60'::jsonb, '70'::jsonb, 'un', 140.00, 262.50, 0.00, 0.00, 'MCC-AS-0004-60X70', NULL),
    ('Armário Superior de cozinha de 0 a 30x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-1A30X70', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '70'::jsonb, 'un', 98.44, 164.07, 0.00, 0.00, 'MCC-AS-0004-1A30X70', NULL),
    ('Armário Superior de cozinha 80x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-80X90', NULL, NULL, '80'::jsonb, '90'::jsonb, 'un', 192.50, 320.83, 0.00, 0.00, 'MCC-AS-0004-80X90', NULL),
    ('Armário Superior de cozinha 60x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-60X90', NULL, NULL, '60'::jsonb, '90'::jsonb, 'un', 161.88, 269.80, 0.00, 0.00, 'MCC-AS-0004-60X90', NULL),
    ('Armário Superior de cozinha 100x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-100X70', NULL, NULL, '100'::jsonb, '70'::jsonb, 'un', 223.13, 386.47, 0.00, 0.00, 'MCC-AS-0004-100X70', NULL),
    ('Armário Superior de cozinha 50x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-50X90', NULL, NULL, '50'::jsonb, '90'::jsonb, 'un', 144.38, 240.63, 0.00, 0.00, 'MCC-AS-0004-50X90', NULL),
    ('Armário Superior de cozinha de 0 a 30x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-1A30X90', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '90'::jsonb, 'un', 120.31, 200.52, 0.00, 0.00, 'MCC-AS-0004-1A30X90', NULL),
    ('Armário Superior de cozinha de 41 a 50x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-41A50X90', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '90'::jsonb, 'un', 180.47, 300.78, 0.00, 0.00, 'MCC-AS-0004-41A50X90', NULL),
    ('Armário Superior de cozinha 30x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-30X70', NULL, NULL, '30'::jsonb, '70'::jsonb, 'un', 78.75, 145.83, 0.00, 0.00, 'MCC-AS-0004-30X70', NULL),
    ('Armário Superior de cozinha de 71 a 80x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-71A80X70', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '70'::jsonb, 'un', 229.69, 382.82, 0.00, 0.00, 'MCC-AS-0004-71A80X70', NULL),
    ('Armário Superior de cozinha de 31 a 40x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-31A40X90', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '90'::jsonb, 'un', 142.19, 236.98, 0.00, 0.00, 'MCC-AS-0004-31A40X90', NULL),
    ('Armário Superior de cozinha de 81 a 90x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-81A90X70', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '70'::jsonb, 'un', 235.16, 391.93, 0.00, 0.00, 'MCC-AS-0004-81A90X70', NULL),
    ('Armário Superior de cozinha 70x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-70X70', NULL, NULL, '70'::jsonb, '70'::jsonb, 'un', 166.25, 298.97, 0.00, 0.00, 'MCC-AS-0004-70X70', NULL),
    ('Armário Superior de cozinha 40x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-40X70', NULL, NULL, '40'::jsonb, '70'::jsonb, 'un', 105.00, 196.88, 0.00, 0.00, 'MCC-AS-0004-40X70', NULL),
    ('Armário Superior de cozinha de 61 a 70x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-61A70X70', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '70'::jsonb, 'un', 207.81, 346.35, 0.00, 0.00, 'MCC-AS-0004-61A70X70', NULL),
    ('Armário Superior de cozinha 90x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-90X90', NULL, NULL, '90'::jsonb, '90'::jsonb, 'un', 201.25, 335.42, 0.00, 0.00, 'MCC-AS-0004-90X90', NULL),
    ('Armário Superior de cozinha de 51 a 60x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-51A60X70', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '70'::jsonb, 'un', 175.00, 291.67, 0.00, 0.00, 'MCC-AS-0004-51A60X70', NULL),
    ('Armário Superior de cozinha de 41 a 50x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-41A50X70', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '70'::jsonb, 'un', 158.59, 264.32, 0.00, 0.00, 'MCC-AS-0004-41A50X70', NULL),
    ('Armário Superior de cozinha 40x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-40X90', NULL, NULL, '40'::jsonb, '90'::jsonb, 'un', 113.75, 189.58, 0.00, 0.00, 'MCC-AS-0004-40X90', NULL),
    ('Armário Superior de cozinha de 71 a 80x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-71A80X90', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '90'::jsonb, 'un', 240.63, 401.05, 0.00, 0.00, 'MCC-AS-0004-71A80X90', NULL),
    ('Armário Superior de cozinha de 51 a 60x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-51A60X90', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '90'::jsonb, 'un', 202.34, 337.23, 0.00, 0.00, 'MCC-AS-0004-51A60X90', NULL),
    ('Armário Superior de cozinha de 31 a 40x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-31A40X70', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '70'::jsonb, 'un', 131.25, 218.75, 0.00, 0.00, 'MCC-AS-0004-31A40X70', NULL),
    ('Armário Superior de cozinha 30x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-30X90', NULL, NULL, '30'::jsonb, '90'::jsonb, 'un', 96.25, 160.42, 0.00, 0.00, 'MCC-AS-0004-30X90', NULL),
    ('Armário Superior de cozinha de 91 a 100x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-91A100X70', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '70'::jsonb, 'un', 278.91, 464.85, 0.00, 0.00, 'MCC-AS-0004-91A100X70', NULL),
    ('Armário Superior de cozinha 50x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-50X70', NULL, NULL, '50'::jsonb, '70'::jsonb, 'un', 126.88, 233.33, 0.00, 0.00, 'MCC-AS-0004-50X70', NULL),
    ('Armário Superior de cozinha 80x70cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-80X70', NULL, NULL, '80'::jsonb, '70'::jsonb, 'un', 183.75, 313.55, 0.00, 0.00, 'MCC-AS-0004-80X70', NULL),
    ('Armário Superior de cozinha 100x90cm Altura', 'AS', 'Armário Superior de cozinha', 4, 'MCC-AS-0004-100X90', NULL, NULL, '100'::jsonb, '90'::jsonb, 'un', 236.25, 393.75, 0.00, 0.00, 'MCC-AS-0004-100X90', NULL),
    ('Armário Superior de cozinha em vidro de 81 a 90x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-81A90X90', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '90'::jsonb, 'un', 322.00, 536.67, 0.00, 0.00, 'MCC-AS-0005-81A90X90', NULL),
    ('Armário Superior de cozinha em vidro 70x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-70X90', NULL, NULL, '70'::jsonb, '90'::jsonb, 'un', 248.06, 413.43, 0.00, 0.00, 'MCC-AS-0005-70X90', NULL),
    ('Armário Superior de cozinha em vidro de 41 a 50x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-41A50X70', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '70'::jsonb, 'un', 203.00, 338.33, 0.00, 0.00, 'MCC-AS-0005-41A50X70', NULL),
    ('Armário Superior de cozinha em vidro 70x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-70X70', NULL, NULL, '70'::jsonb, '70'::jsonb, 'un', 224.44, 374.07, 0.00, 0.00, 'MCC-AS-0005-70X70', NULL),
    ('Armário Superior de cozinha em vidro 40x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-40X90', NULL, NULL, '40'::jsonb, '90'::jsonb, 'un', 153.56, 255.93, 0.00, 0.00, 'MCC-AS-0005-40X90', NULL),
    ('Armário Superior de cozinha em vidro 60x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-60X70', NULL, NULL, '60'::jsonb, '70'::jsonb, 'un', 189.00, 315.00, 0.00, 0.00, 'MCC-AS-0005-60X70', NULL),
    ('Armário Superior de cozinha em vidro de 0 a 30x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-1A30X90', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '90'::jsonb, 'un', 154.00, 256.67, 0.00, 0.00, 'MCC-AS-0005-1A30X90', NULL),
    ('Armário Superior de cozinha em vidro 100x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-100X70', NULL, NULL, '100'::jsonb, '70'::jsonb, 'un', 301.22, 502.03, 0.00, 0.00, 'MCC-AS-0005-100X70', NULL),
    ('Armário Superior de cozinha em vidro 90x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-90X70', NULL, NULL, '90'::jsonb, '70'::jsonb, 'un', 253.97, 423.28, 0.00, 0.00, 'MCC-AS-0005-90X70', NULL),
    ('Armário Superior de cozinha em vidro de 61 a 70x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-61A70X90', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '90'::jsonb, 'un', 294.00, 490.00, 0.00, 0.00, 'MCC-AS-0005-61A70X90', NULL),
    ('Armário Superior de cozinha em vidro 50x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-50X90', NULL, NULL, '50'::jsonb, '90'::jsonb, 'un', 194.91, 324.85, 0.00, 0.00, 'MCC-AS-0005-50X90', NULL),
    ('Armário Superior de cozinha em vidro 100x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-100X90', NULL, NULL, '100'::jsonb, '90'::jsonb, 'un', 318.94, 531.57, 0.00, 0.00, 'MCC-AS-0005-100X90', NULL),
    ('Armário Superior de cozinha em vidro de 41 a 50x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-41A50X90', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '90'::jsonb, 'un', 231.00, 385.00, 0.00, 0.00, 'MCC-AS-0005-41A50X90', NULL),
    ('Armário Superior de cozinha em vidro de 31 a 40x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-31A40X90', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '90'::jsonb, 'un', 182.00, 303.33, 0.00, 0.00, 'MCC-AS-0005-31A40X90', NULL),
    ('Armário Superior de cozinha em vidro 80x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-80X70', NULL, NULL, '80'::jsonb, '70'::jsonb, 'un', 248.06, 413.43, 0.00, 0.00, 'MCC-AS-0005-80X70', NULL),
    ('Armário Superior de cozinha em vidro 30x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-30X90', NULL, NULL, '30'::jsonb, '90'::jsonb, 'un', 129.94, 216.57, 0.00, 0.00, 'MCC-AS-0005-30X90', NULL),
    ('Armário Superior de cozinha em vidro 80x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-80X90', NULL, NULL, '80'::jsonb, '90'::jsonb, 'un', 259.88, 433.13, 0.00, 0.00, 'MCC-AS-0005-80X90', NULL),
    ('Armário Superior de cozinha em vidro de 71 a 80x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-71A80X90', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '90'::jsonb, 'un', 308.00, 513.33, 0.00, 0.00, 'MCC-AS-0005-71A80X90', NULL),
    ('Armário Superior de cozinha em vidro 60x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-60X90', NULL, NULL, '60'::jsonb, '90'::jsonb, 'un', 218.53, 364.22, 0.00, 0.00, 'MCC-AS-0005-60X90', NULL),
    ('Armário Superior de cozinha em vidro de 31 a 40x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-31A40X70', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '70'::jsonb, 'un', 168.00, 280.00, 0.00, 0.00, 'MCC-AS-0005-31A40X70', NULL),
    ('Armário Superior de cozinha em vidro 50x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-50X70', NULL, NULL, '50'::jsonb, '70'::jsonb, 'un', 171.28, 285.47, 0.00, 0.00, 'MCC-AS-0005-50X70', NULL),
    ('Armário Superior de cozinha em vidro de 51 a 60x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-51A60X90', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '90'::jsonb, 'un', 259.00, 431.67, 0.00, 0.00, 'MCC-AS-0005-51A60X90', NULL),
    ('Armário Superior de cozinha em vidro de 61 a 70x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-61A70X70', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '70'::jsonb, 'un', 266.00, 443.33, 0.00, 0.00, 'MCC-AS-0005-61A70X70', NULL),
    ('Armário Superior de cozinha em vidro 30x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-30X70', NULL, NULL, '30'::jsonb, '70'::jsonb, 'un', 106.31, 177.18, 0.00, 0.00, 'MCC-AS-0005-30X70', NULL),
    ('Armário Superior de cozinha em vidro 90x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-90X90', NULL, NULL, '90'::jsonb, '90'::jsonb, 'un', 271.69, 452.82, 0.00, 0.00, 'MCC-AS-0005-90X90', NULL),
    ('Armário Superior de cozinha em vidro 40x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-40X70', NULL, NULL, '40'::jsonb, '70'::jsonb, 'un', 141.75, 236.25, 0.00, 0.00, 'MCC-AS-0005-40X70', NULL),
    ('Armário Superior de cozinha em vidro de 0 a 30x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-1A30X70', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '70'::jsonb, 'un', 126.00, 210.00, 0.00, 0.00, 'MCC-AS-0005-1A30X70', NULL),
    ('Armário Superior de cozinha em vidro de 81 a 90x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-81A90X70', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '70'::jsonb, 'un', 301.00, 501.67, 0.00, 0.00, 'MCC-AS-0005-81A90X70', NULL),
    ('Armário Superior de cozinha em vidro de 91 a 100x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-91A100X70', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '70'::jsonb, 'un', 357.00, 595.00, 0.00, 0.00, 'MCC-AS-0005-91A100X70', NULL),
    ('Armário Superior de cozinha em vidro de 91 a 100x90cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-91A100X90', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '90'::jsonb, 'un', 378.00, 630.00, 0.00, 0.00, 'MCC-AS-0005-91A100X90', NULL),
    ('Armário Superior de cozinha em vidro de 51 a 60x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-51A60X70', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '70'::jsonb, 'un', 224.00, 373.33, 0.00, 0.00, 'MCC-AS-0005-51A60X70', NULL),
    ('Armário Superior de cozinha em vidro de 71 a 80x70cm Altura', 'AS', 'Armário Superior de cozinha em vidro', 5, 'MCC-AS-0005-71A80X70', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '70'::jsonb, 'un', 294.00, 490.00, 0.00, 0.00, 'MCC-AS-0005-71A80X70', NULL),
    ('Armário Superior de cozinha basculante 90x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-90X70', NULL, NULL, '90'::jsonb, '70'::jsonb, 'un', 293.17, 488.62, 0.00, 0.00, 'MCC-AS-0006-90X70', NULL),
    ('Armário Superior de cozinha basculante 80x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-80X90', NULL, NULL, '80'::jsonb, '90'::jsonb, 'un', 299.08, 498.47, 0.00, 0.00, 'MCC-AS-0006-80X90', NULL),
    ('Armário Superior de cozinha basculante de 31 a 40x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-31A40X70', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '70'::jsonb, 'un', 216.39, 360.65, 0.00, 0.00, 'MCC-AS-0006-31A40X70', NULL),
    ('Armário Superior de cozinha basculante de 81 a 90x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-81A90X90', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '90'::jsonb, 'un', 378.81, 631.35, 0.00, 0.00, 'MCC-AS-0006-81A90X90', NULL),
    ('Armário Superior de cozinha basculante de 91 a 100x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-91A100X90', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '90'::jsonb, 'un', 437.87, 729.78, 0.00, 0.00, 'MCC-AS-0006-91A100X90', NULL),
    ('Armário Superior de cozinha basculante de 41 a 50x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-41A50X70', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '70'::jsonb, 'un', 253.30, 422.17, 0.00, 0.00, 'MCC-AS-0006-41A50X70', NULL),
    ('Armário Superior de cozinha basculante 70x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-70X90', NULL, NULL, '70'::jsonb, '90'::jsonb, 'un', 287.26, 478.77, 0.00, 0.00, 'MCC-AS-0006-70X90', NULL),
    ('Armário Superior de cozinha basculante 80x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-80X70', NULL, NULL, '80'::jsonb, '70'::jsonb, 'un', 287.26, 478.77, 0.00, 0.00, 'MCC-AS-0006-80X70', NULL),
    ('Armário Superior de cozinha basculante 30x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-30X90', NULL, NULL, '30'::jsonb, '90'::jsonb, 'un', 169.14, 281.90, 0.00, 0.00, 'MCC-AS-0006-30X90', NULL),
    ('Armário Superior de cozinha basculante de 31 a 40x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-31A40X90', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '90'::jsonb, 'un', 231.15, 385.25, 0.00, 0.00, 'MCC-AS-0006-31A40X90', NULL),
    ('Armário Superior de cozinha basculante 100x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-100X70', NULL, NULL, '100'::jsonb, '70'::jsonb, 'un', 340.42, 567.37, 0.00, 0.00, 'MCC-AS-0006-100X70', NULL),
    ('Armário Superior de cozinha basculante 50x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-50X90', NULL, NULL, '50'::jsonb, '90'::jsonb, 'un', 234.11, 390.18, 0.00, 0.00, 'MCC-AS-0006-50X90', NULL),
    ('Armário Superior de cozinha basculante 60x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-60X70', NULL, NULL, '60'::jsonb, '70'::jsonb, 'un', 228.20, 380.33, 0.00, 0.00, 'MCC-AS-0006-60X70', NULL),
    ('Armário Superior de cozinha basculante de 61 a 70x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-61A70X70', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '70'::jsonb, 'un', 319.75, 532.92, 0.00, 0.00, 'MCC-AS-0006-61A70X70', NULL),
    ('Armário Superior de cozinha basculante de 81 a 90x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-81A90X70', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '70'::jsonb, 'un', 356.66, 594.43, 0.00, 0.00, 'MCC-AS-0006-81A90X70', NULL),
    ('Armário Superior de cozinha basculante 70x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-70X70', NULL, NULL, '70'::jsonb, '70'::jsonb, 'un', 263.64, 439.40, 0.00, 0.00, 'MCC-AS-0006-70X70', NULL),
    ('Armário Superior de cozinha basculante 60x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-60X90', NULL, NULL, '60'::jsonb, '90'::jsonb, 'un', 257.73, 429.55, 0.00, 0.00, 'MCC-AS-0006-60X90', NULL),
    ('Armário Superior de cozinha basculante de 51 a 60x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-51A60X70', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '70'::jsonb, 'un', 275.45, 459.08, 0.00, 0.00, 'MCC-AS-0006-51A60X70', NULL),
    ('Armário Superior de cozinha basculante de 41 a 50x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-41A50X90', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '90'::jsonb, 'un', 282.83, 471.38, 0.00, 0.00, 'MCC-AS-0006-41A50X90', NULL),
    ('Armário Superior de cozinha basculante de 0 a 30x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-1A30X90', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '90'::jsonb, 'un', 201.62, 336.03, 0.00, 0.00, 'MCC-AS-0006-1A30X90', NULL),
    ('Armário Superior de cozinha basculante de 71 a 80x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-71A80X70', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '70'::jsonb, 'un', 349.28, 582.13, 0.00, 0.00, 'MCC-AS-0006-71A80X70', NULL),
    ('Armário Superior de cozinha basculante 30x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-30X70', NULL, NULL, '30'::jsonb, '70'::jsonb, 'un', 145.51, 242.52, 0.00, 0.00, 'MCC-AS-0006-30X70', NULL),
    ('Armário Superior de cozinha basculante de 91 a 100x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-91A100X70', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '70'::jsonb, 'un', 415.72, 692.87, 0.00, 0.00, 'MCC-AS-0006-91A100X70', NULL),
    ('Armário Superior de cozinha basculante de 51 a 60x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-51A60X90', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '90'::jsonb, 'un', 312.36, 520.60, 0.00, 0.00, 'MCC-AS-0006-51A60X90', NULL),
    ('Armário Superior de cozinha basculante de 61 a 70x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-61A70X90', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '90'::jsonb, 'un', 349.28, 582.13, 0.00, 0.00, 'MCC-AS-0006-61A70X90', NULL),
    ('Armário Superior de cozinha basculante 50x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-50X70', NULL, NULL, '50'::jsonb, '70'::jsonb, 'un', 210.48, 350.80, 0.00, 0.00, 'MCC-AS-0006-50X70', NULL),
    ('Armário Superior de cozinha basculante 90x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-90X90', NULL, NULL, '90'::jsonb, '90'::jsonb, 'un', 310.89, 518.15, 0.00, 0.00, 'MCC-AS-0006-90X90', NULL),
    ('Armário Superior de cozinha basculante 40x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-40X90', NULL, NULL, '40'::jsonb, '90'::jsonb, 'un', 192.76, 321.27, 0.00, 0.00, 'MCC-AS-0006-40X90', NULL),
    ('Armário Superior de cozinha basculante de 71 a 80x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-71A80X90', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '90'::jsonb, 'un', 364.04, 606.73, 0.00, 0.00, 'MCC-AS-0006-71A80X90', NULL),
    ('Armário Superior de cozinha basculante 40x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-40X70', NULL, NULL, '40'::jsonb, '70'::jsonb, 'un', 180.95, 301.58, 0.00, 0.00, 'MCC-AS-0006-40X70', NULL),
    ('Armário Superior de cozinha basculante de 0 a 30x70cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-1A30X70', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '70'::jsonb, 'un', 172.09, 286.82, 0.00, 0.00, 'MCC-AS-0006-1A30X70', NULL),
    ('Armário Superior de cozinha basculante 100x90cm Altura', 'AS', 'Armário Superior de cozinha basculante', 6, 'MCC-AS-0006-100X90', NULL, NULL, '100'::jsonb, '90'::jsonb, 'un', 358.14, 596.90, 0.00, 0.00, 'MCC-AS-0006-100X90', NULL),
    ('Armário Superior de cozinha lacado de 91 a 100x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-91A100X90', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '90'::jsonb, 'un', 513.84, 856.40, 0.00, 0.00, 'MCC-AS-0007-91A100X90', NULL),
    ('Armário Superior de cozinha lacado 50x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-50X90', NULL, NULL, '50'::jsonb, '90'::jsonb, 'un', 203.18, 338.63, 0.00, 0.00, 'MCC-AS-0007-50X90', NULL),
    ('Armário Superior de cozinha lacado 90x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-90X90', NULL, NULL, '90'::jsonb, '90'::jsonb, 'un', 373.28, 622.13, 0.00, 0.00, 'MCC-AS-0007-90X90', NULL),
    ('Armário Superior de cozinha lacado 80x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-80X70', NULL, NULL, '80'::jsonb, '70'::jsonb, 'un', 283.50, 472.50, 0.00, 0.00, 'MCC-AS-0007-80X70', NULL),
    ('Armário Superior de cozinha lacado de 0 a 30x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-1A30X70', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '70'::jsonb, 'un', 135.84, 226.40, 0.00, 0.00, 'MCC-AS-0007-1A30X70', NULL),
    ('Armário Superior de cozinha lacado de 0 a 30x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-1A30X90', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '90'::jsonb, 'un', 155.93, 259.88, 0.00, 0.00, 'MCC-AS-0007-1A30X90', NULL),
    ('Armário Superior de cozinha lacado de 91 a 100x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-91A100X70', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '70'::jsonb, 'un', 448.88, 748.13, 0.00, 0.00, 'MCC-AS-0007-91A100X70', NULL),
    ('Armário Superior de cozinha lacado 40x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-40X70', NULL, NULL, '40'::jsonb, '70'::jsonb, 'un', 141.75, 236.25, 0.00, 0.00, 'MCC-AS-0007-40X70', NULL),
    ('Armário Superior de cozinha lacado 80x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-80X90', NULL, NULL, '80'::jsonb, '90'::jsonb, 'un', 330.75, 551.25, 0.00, 0.00, 'MCC-AS-0007-80X90', NULL),
    ('Armário Superior de cozinha lacado 30x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-30X70', NULL, NULL, '30'::jsonb, '70'::jsonb, 'un', 108.68, 181.13, 0.00, 0.00, 'MCC-AS-0007-30X70', NULL),
    ('Armário Superior de cozinha lacado 70x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-70X90', NULL, NULL, '70'::jsonb, '90'::jsonb, 'un', 288.23, 480.38, 0.00, 0.00, 'MCC-AS-0007-70X90', NULL),
    ('Armário Superior de cozinha lacado de 81 a 90x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-81A90X90', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '90'::jsonb, 'un', 466.59, 777.65, 0.00, 0.00, 'MCC-AS-0007-81A90X90', NULL),
    ('Armário Superior de cozinha lacado 100x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-100X90', NULL, NULL, '100'::jsonb, '90'::jsonb, 'un', 411.08, 685.13, 0.00, 0.00, 'MCC-AS-0007-100X90', NULL),
    ('Armário Superior de cozinha lacado de 51 a 60x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-51A60X70', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '70'::jsonb, 'un', 253.97, 423.28, 0.00, 0.00, 'MCC-AS-0007-51A60X70', NULL),
    ('Armário Superior de cozinha lacado de 71 a 80x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-71A80X90', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '90'::jsonb, 'un', 413.44, 689.07, 0.00, 0.00, 'MCC-AS-0007-71A80X90', NULL),
    ('Armário Superior de cozinha lacado 60x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-60X70', NULL, NULL, '60'::jsonb, '70'::jsonb, 'un', 203.18, 338.63, 0.00, 0.00, 'MCC-AS-0007-60X70', NULL),
    ('Armário Superior de cozinha lacado de 41 a 50x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-41A50X90', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '90'::jsonb, 'un', 253.97, 423.28, 0.00, 0.00, 'MCC-AS-0007-41A50X90', NULL),
    ('Armário Superior de cozinha lacado de 61 a 70x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-61A70X90', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '90'::jsonb, 'un', 360.28, 600.47, 0.00, 0.00, 'MCC-AS-0007-61A70X90', NULL),
    ('Armário Superior de cozinha lacado de 51 a 60x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-51A60X90', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '90'::jsonb, 'un', 313.03, 521.72, 0.00, 0.00, 'MCC-AS-0007-51A60X90', NULL),
    ('Armário Superior de cozinha lacado 90x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-90X70', NULL, NULL, '90'::jsonb, '70'::jsonb, 'un', 321.30, 535.50, 0.00, 0.00, 'MCC-AS-0007-90X70', NULL),
    ('Armário Superior de cozinha lacado 60x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-60X90', NULL, NULL, '60'::jsonb, '90'::jsonb, 'un', 250.43, 417.38, 0.00, 0.00, 'MCC-AS-0007-60X90', NULL),
    ('Armário Superior de cozinha lacado 50x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-50X70', NULL, NULL, '50'::jsonb, '70'::jsonb, 'un', 184.28, 307.13, 0.00, 0.00, 'MCC-AS-0007-50X70', NULL),
    ('Armário Superior de cozinha lacado 100x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-100X70', NULL, NULL, '100'::jsonb, '70'::jsonb, 'un', 359.10, 598.50, 0.00, 0.00, 'MCC-AS-0007-100X70', NULL),
    ('Armário Superior de cozinha lacado de 31 a 40x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-31A40X90', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '90'::jsonb, 'un', 206.72, 344.53, 0.00, 0.00, 'MCC-AS-0007-31A40X90', NULL),
    ('Armário Superior de cozinha lacado de 81 a 90x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-81A90X70', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '70'::jsonb, 'un', 401.63, 669.38, 0.00, 0.00, 'MCC-AS-0007-81A90X70', NULL),
    ('Armário Superior de cozinha lacado de 61 a 70x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-61A70X70', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '70'::jsonb, 'un', 307.13, 511.88, 0.00, 0.00, 'MCC-AS-0007-61A70X70', NULL),
    ('Armário Superior de cozinha lacado de 41 a 50x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-41A50X70', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '70'::jsonb, 'un', 230.34, 383.90, 0.00, 0.00, 'MCC-AS-0007-41A50X70', NULL),
    ('Armário Superior de cozinha lacado de 71 a 80x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-71A80X70', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '70'::jsonb, 'un', 354.38, 590.63, 0.00, 0.00, 'MCC-AS-0007-71A80X70', NULL),
    ('Armário Superior de cozinha lacado 40x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-40X90', NULL, NULL, '40'::jsonb, '90'::jsonb, 'un', 165.38, 275.63, 0.00, 0.00, 'MCC-AS-0007-40X90', NULL),
    ('Armário Superior de cozinha lacado 30x90cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-30X90', NULL, NULL, '30'::jsonb, '90'::jsonb, 'un', 124.74, 207.90, 0.00, 0.00, 'MCC-AS-0007-30X90', NULL),
    ('Armário Superior de cozinha lacado 70x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-70X70', NULL, NULL, '70'::jsonb, '70'::jsonb, 'un', 245.70, 409.50, 0.00, 0.00, 'MCC-AS-0007-70X70', NULL),
    ('Armário Superior de cozinha lacado de 31 a 40x70cm Altura', 'AS', 'Armário Superior de cozinha lacado', 7, 'MCC-AS-0007-31A40X70', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '70'::jsonb, 'un', 177.19, 295.32, 0.00, 0.00, 'MCC-AS-0007-31A40X70', NULL),
    ('Armário Superior de cozinha lacado em vidro 70x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-70X70', NULL, NULL, '70'::jsonb, '70'::jsonb, 'un', 226.04, 376.73, 0.00, 0.00, 'MCC-AS-0008-70X70', NULL),
    ('Armário Superior de cozinha lacado em vidro de 71 a 80x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-71A80X70', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '70'::jsonb, 'un', 317.52, 529.20, 0.00, 0.00, 'MCC-AS-0008-71A80X70', NULL),
    ('Armário Superior de cozinha lacado em vidro de 81 a 90x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-81A90X70', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '70'::jsonb, 'un', 359.86, 599.77, 0.00, 0.00, 'MCC-AS-0008-81A90X70', NULL),
    ('Armário Superior de cozinha lacado em vidro de 31 a 40x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-31A40X70', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '70'::jsonb, 'un', 158.76, 264.60, 0.00, 0.00, 'MCC-AS-0008-31A40X70', NULL),
    ('Armário Superior de cozinha lacado em vidro 100x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-100X70', NULL, NULL, '100'::jsonb, '70'::jsonb, 'un', 330.37, 550.62, 0.00, 0.00, 'MCC-AS-0008-100X70', NULL),
    ('Armário Superior de cozinha lacado em vidro de 31 a 40x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-31A40X90', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '90'::jsonb, 'un', 185.22, 308.70, 0.00, 0.00, 'MCC-AS-0008-31A40X90', NULL),
    ('Armário Superior de cozinha lacado em vidro de 81 a 90x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-81A90X90', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '90'::jsonb, 'un', 418.07, 696.78, 0.00, 0.00, 'MCC-AS-0008-81A90X90', NULL),
    ('Armário Superior de cozinha lacado em vidro 40x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-40X70', NULL, NULL, '40'::jsonb, '70'::jsonb, 'un', 130.41, 217.35, 0.00, 0.00, 'MCC-AS-0008-40X70', NULL),
    ('Armário Superior de cozinha lacado em vidro de 51 a 60x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-51A60X70', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '70'::jsonb, 'un', 227.56, 379.27, 0.00, 0.00, 'MCC-AS-0008-51A60X70', NULL),
    ('Armário Superior de cozinha lacado em vidro de 41 a 50x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-41A50X70', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '70'::jsonb, 'un', 206.39, 343.98, 0.00, 0.00, 'MCC-AS-0008-41A50X70', NULL),
    ('Armário Superior de cozinha lacado em vidro 100x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-100X90', NULL, NULL, '100'::jsonb, '90'::jsonb, 'un', 378.19, 630.32, 0.00, 0.00, 'MCC-AS-0008-100X90', NULL),
    ('Armário Superior de cozinha lacado em vidro 80x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-80X90', NULL, NULL, '80'::jsonb, '90'::jsonb, 'un', 304.29, 507.15, 0.00, 0.00, 'MCC-AS-0008-80X90', NULL),
    ('Armário Superior de cozinha lacado em vidro de 61 a 70x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-61A70X90', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '90'::jsonb, 'un', 322.81, 538.02, 0.00, 0.00, 'MCC-AS-0008-61A70X90', NULL),
    ('Armário Superior de cozinha lacado em vidro 50x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-50X90', NULL, NULL, '50'::jsonb, '90'::jsonb, 'un', 186.92, 311.53, 0.00, 0.00, 'MCC-AS-0008-50X90', NULL),
    ('Armário Superior de cozinha lacado em vidro 50x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-50X70', NULL, NULL, '50'::jsonb, '70'::jsonb, 'un', 169.53, 282.55, 0.00, 0.00, 'MCC-AS-0008-50X70', NULL),
    ('Armário Superior de cozinha lacado em vidro 30x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-30X70', NULL, NULL, '30'::jsonb, '70'::jsonb, 'un', 99.98, 166.63, 0.00, 0.00, 'MCC-AS-0008-30X70', NULL),
    ('Armário Superior de cozinha lacado em vidro de 71 a 80x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-71A80X90', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '90'::jsonb, 'un', 370.44, 617.40, 0.00, 0.00, 'MCC-AS-0008-71A80X90', NULL),
    ('Armário Superior de cozinha lacado em vidro de 61 a 70x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-61A70X70', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '70'::jsonb, 'un', 275.18, 458.63, 0.00, 0.00, 'MCC-AS-0008-61A70X70', NULL),
    ('Armário Superior de cozinha lacado em vidro 40x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-40X90', NULL, NULL, '40'::jsonb, '90'::jsonb, 'un', 152.15, 253.58, 0.00, 0.00, 'MCC-AS-0008-40X90', NULL),
    ('Armário Superior de cozinha lacado em vidro de 91 a 100x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-91A100X90', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '90'::jsonb, 'un', 460.40, 767.33, 0.00, 0.00, 'MCC-AS-0008-91A100X90', NULL),
    ('Armário Superior de cozinha lacado em vidro 90x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-90X70', NULL, NULL, '90'::jsonb, '70'::jsonb, 'un', 295.60, 492.67, 0.00, 0.00, 'MCC-AS-0008-90X70', NULL),
    ('Armário Superior de cozinha lacado em vidro 80x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-80X70', NULL, NULL, '80'::jsonb, '70'::jsonb, 'un', 260.82, 434.70, 0.00, 0.00, 'MCC-AS-0008-80X70', NULL),
    ('Armário Superior de cozinha lacado em vidro 90x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-90X90', NULL, NULL, '90'::jsonb, '90'::jsonb, 'un', 343.41, 572.35, 0.00, 0.00, 'MCC-AS-0008-90X90', NULL),
    ('Armário Superior de cozinha lacado em vidro 70x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-70X90', NULL, NULL, '70'::jsonb, '90'::jsonb, 'un', 265.17, 441.95, 0.00, 0.00, 'MCC-AS-0008-70X90', NULL),
    ('Armário Superior de cozinha lacado em vidro de 0 a 30x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-1A30X90', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '90'::jsonb, 'un', 139.71, 232.85, 0.00, 0.00, 'MCC-AS-0008-1A30X90', NULL),
    ('Armário Superior de cozinha lacado em vidro de 91 a 100x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-91A100X70', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '70'::jsonb, 'un', 402.19, 670.32, 0.00, 0.00, 'MCC-AS-0008-91A100X70', NULL),
    ('Armário Superior de cozinha lacado em vidro de 0 a 30x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-1A30X70', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '70'::jsonb, 'un', 121.72, 202.87, 0.00, 0.00, 'MCC-AS-0008-1A30X70', NULL),
    ('Armário Superior de cozinha lacado em vidro 30x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-30X90', NULL, NULL, '30'::jsonb, '90'::jsonb, 'un', 114.76, 191.27, 0.00, 0.00, 'MCC-AS-0008-30X90', NULL),
    ('Armário Superior de cozinha lacado em vidro de 51 a 60x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-51A60X90', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '90'::jsonb, 'un', 280.48, 467.47, 0.00, 0.00, 'MCC-AS-0008-51A60X90', NULL),
    ('Armário Superior de cozinha lacado em vidro 60x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-60X90', NULL, NULL, '60'::jsonb, '90'::jsonb, 'un', 230.39, 383.98, 0.00, 0.00, 'MCC-AS-0008-60X90', NULL),
    ('Armário Superior de cozinha lacado em vidro 60x70cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-60X70', NULL, NULL, '60'::jsonb, '70'::jsonb, 'un', 186.92, 311.53, 0.00, 0.00, 'MCC-AS-0008-60X70', NULL),
    ('Armário Superior de cozinha lacado em vidro de 41 a 50x90cm Altura', 'AS', 'Armário Superior de cozinha lacado em vidro', 8, 'MCC-AS-0008-41A50X90', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '90'::jsonb, 'un', 227.56, 379.27, 0.00, 0.00, 'MCC-AS-0008-41A50X90', NULL),
    ('Armário Superior de cozinha lacado basculante de 41 a 50x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-41A50X70', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '70'::jsonb, 'un', 247.10, 411.83, 0.00, 0.00, 'MCC-AS-0009-41A50X70', NULL),
    ('Armário Superior de cozinha lacado basculante 30x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-30X90', NULL, NULL, '30'::jsonb, '90'::jsonb, 'un', 146.26, 243.77, 0.00, 0.00, 'MCC-AS-0009-30X90', NULL),
    ('Armário Superior de cozinha lacado basculante 60x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-60X70', NULL, NULL, '60'::jsonb, '70'::jsonb, 'un', 218.42, 364.03, 0.00, 0.00, 'MCC-AS-0009-60X70', NULL),
    ('Armário Superior de cozinha lacado basculante de 51 a 60x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-51A60X90', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '90'::jsonb, 'un', 324.50, 540.83, 0.00, 0.00, 'MCC-AS-0009-51A60X90', NULL),
    ('Armário Superior de cozinha lacado basculante de 71 a 80x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-71A80X70', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '70'::jsonb, 'un', 363.20, 605.33, 0.00, 0.00, 'MCC-AS-0009-71A80X70', NULL),
    ('Armário Superior de cozinha lacado basculante 90x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-90X90', NULL, NULL, '90'::jsonb, '90'::jsonb, 'un', 374.91, 624.85, 0.00, 0.00, 'MCC-AS-0009-90X90', NULL),
    ('Armário Superior de cozinha lacado basculante 30x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-30X70', NULL, NULL, '30'::jsonb, '70'::jsonb, 'un', 131.48, 219.13, 0.00, 0.00, 'MCC-AS-0009-30X70', NULL),
    ('Armário Superior de cozinha lacado basculante 70x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-70X70', NULL, NULL, '70'::jsonb, '70'::jsonb, 'un', 257.54, 429.23, 0.00, 0.00, 'MCC-AS-0009-70X70', NULL),
    ('Armário Superior de cozinha lacado basculante de 0 a 30x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-1A30X70', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '70'::jsonb, 'un', 158.65, 264.42, 0.00, 0.00, 'MCC-AS-0009-1A30X70', NULL),
    ('Armário Superior de cozinha lacado basculante de 81 a 90x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-81A90X70', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '70'::jsonb, 'un', 407.42, 679.03, 0.00, 0.00, 'MCC-AS-0009-81A90X70', NULL),
    ('Armário Superior de cozinha lacado basculante de 61 a 70x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-61A70X70', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '70'::jsonb, 'un', 318.97, 531.62, 0.00, 0.00, 'MCC-AS-0009-61A70X70', NULL),
    ('Armário Superior de cozinha lacado basculante de 31 a 40x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-31A40X90', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '90'::jsonb, 'un', 224.99, 374.98, 0.00, 0.00, 'MCC-AS-0009-31A40X90', NULL),
    ('Armário Superior de cozinha lacado basculante de 81 a 90x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-81A90X90', NULL, NULL, '{"de":81,"ate":90}'::jsonb, '90'::jsonb, 'un', 468.23, 780.38, 0.00, 0.00, 'MCC-AS-0009-81A90X90', NULL),
    ('Armário Superior de cozinha lacado basculante 50x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-50X90', NULL, NULL, '50'::jsonb, '90'::jsonb, 'un', 218.42, 364.03, 0.00, 0.00, 'MCC-AS-0009-50X90', NULL),
    ('Armário Superior de cozinha lacado basculante de 41 a 50x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-41A50X90', NULL, NULL, '{"de":41,"ate":50}'::jsonb, '90'::jsonb, 'un', 269.21, 448.68, 0.00, 0.00, 'MCC-AS-0009-41A50X90', NULL),
    ('Armário Superior de cozinha lacado basculante 40x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-40X90', NULL, NULL, '40'::jsonb, '90'::jsonb, 'un', 183.65, 306.08, 0.00, 0.00, 'MCC-AS-0009-40X90', NULL),
    ('Armário Superior de cozinha lacado basculante 100x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-100X90', NULL, NULL, '100'::jsonb, '90'::jsonb, 'un', 409.69, 682.82, 0.00, 0.00, 'MCC-AS-0009-100X90', NULL),
    ('Armário Superior de cozinha lacado basculante de 61 a 70x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-61A70X90', NULL, NULL, '{"de":61,"ate":70}'::jsonb, '90'::jsonb, 'un', 368.72, 614.53, 0.00, 0.00, 'MCC-AS-0009-61A70X90', NULL),
    ('Armário Superior de cozinha lacado basculante 40x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-40X70', NULL, NULL, '40'::jsonb, '70'::jsonb, 'un', 161.91, 269.85, 0.00, 0.00, 'MCC-AS-0009-40X70', NULL),
    ('Armário Superior de cozinha lacado basculante de 71 a 80x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-71A80X90', NULL, NULL, '{"de":71,"ate":80}'::jsonb, '90'::jsonb, 'un', 418.48, 697.47, 0.00, 0.00, 'MCC-AS-0009-71A80X90', NULL),
    ('Armário Superior de cozinha lacado basculante 80x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-80X70', NULL, NULL, '80'::jsonb, '70'::jsonb, 'un', 292.32, 487.20, 0.00, 0.00, 'MCC-AS-0009-80X70', NULL),
    ('Armário Superior de cozinha lacado basculante 80x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-80X90', NULL, NULL, '80'::jsonb, '90'::jsonb, 'un', 335.79, 559.65, 0.00, 0.00, 'MCC-AS-0009-80X90', NULL),
    ('Armário Superior de cozinha lacado basculante de 91 a 100x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-91A100X90', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '90'::jsonb, 'un', 512.46, 854.10, 0.00, 0.00, 'MCC-AS-0009-91A100X90', NULL),
    ('Armário Superior de cozinha lacado basculante 70x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-70X90', NULL, NULL, '70'::jsonb, '90'::jsonb, 'un', 296.67, 494.45, 0.00, 0.00, 'MCC-AS-0009-70X90', NULL),
    ('Armário Superior de cozinha lacado basculante 60x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-60X90', NULL, NULL, '60'::jsonb, '90'::jsonb, 'un', 261.89, 436.48, 0.00, 0.00, 'MCC-AS-0009-60X90', NULL),
    ('Armário Superior de cozinha lacado basculante de 0 a 30x90cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-1A30X90', NULL, NULL, '{"de":1,"ate":30}'::jsonb, '90'::jsonb, 'un', 177.45, 295.75, 0.00, 0.00, 'MCC-AS-0009-1A30X90', NULL),
    ('Armário Superior de cozinha lacado basculante de 31 a 40x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-31A40X70', NULL, NULL, '{"de":31,"ate":40}'::jsonb, '70'::jsonb, 'un', 197.35, 328.92, 0.00, 0.00, 'MCC-AS-0009-31A40X70', NULL),
    ('Armário Superior de cozinha lacado basculante 50x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-50X70', NULL, NULL, '50'::jsonb, '70'::jsonb, 'un', 201.03, 335.05, 0.00, 0.00, 'MCC-AS-0009-50X70', NULL),
    ('Armário Superior de cozinha lacado basculante de 51 a 60x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-51A60X70', NULL, NULL, '{"de":51,"ate":60}'::jsonb, '70'::jsonb, 'un', 269.21, 448.68, 0.00, 0.00, 'MCC-AS-0009-51A60X70', NULL),
    ('Armário Superior de cozinha lacado basculante 100x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-100X70', NULL, NULL, '100'::jsonb, '70'::jsonb, 'un', 361.87, 603.12, 0.00, 0.00, 'MCC-AS-0009-100X70', NULL),
    ('Armário Superior de cozinha lacado basculante 90x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-90X70', NULL, NULL, '90'::jsonb, '70'::jsonb, 'un', 327.10, 545.17, 0.00, 0.00, 'MCC-AS-0009-90X70', NULL),
    ('Armário Superior de cozinha lacado basculante de 91 a 100x70cm Altura', 'AS', 'Armário Superior de cozinha lacado basculante', 9, 'MCC-AS-0009-91A100X70', NULL, NULL, '{"de":91,"ate":100}'::jsonb, '70'::jsonb, 'un', 451.65, 752.75, 0.00, 0.00, 'MCC-AS-0009-91A100X70', NULL),
    ('Armário Superior de cozinha Canto em L 70cm Alt', 'AS', 'Armário Superior de cozinha Canto em L 70cm Alt', 10, 'MCC-AS-0010', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 218.75, 364.58, 0.00, 0.00, 'MCC-AS-0010', NULL),
    ('Armário Superior de cozinha Canto em L 90cm Alt', 'AS', 'Armário Superior de cozinha Canto em L 90cm Alt', 11, 'MCC-AS-0011', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 223.16, 371.93, 0.00, 0.00, 'MCC-AS-0011', NULL),
    ('COZINHA EM TERMOLAMINADO CINZA ANTRACITE MOVEIS EM MELAMINA HIDROFUGO CINZA 166TF PERFIL GOLA E RODAPÉ PRETO', 'CCP', 'COZINHA EM TERMOLAMINADO CINZA ANTRACITE MOVEIS EM MELAMINA HIDROFUGO CINZA 166TF PERFIL GOLA E RODAPÉ PRETO', 1, 'MCC-CCP-0001', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 3764.70, 8281.90, 0.00, 0.00, 'MCC-CCP-0001', NULL),
    ('Puxador GOLA', 'PX', 'Puxador GOLA', 1, 'MCC-PX-0001', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, 'MCC-PX-0001', NULL),
    ('Puxador PEGA', 'PX', 'Puxador PEGA', 2, 'MCC-PX-0002', NULL, NULL, NULL::jsonb, NULL::jsonb, 'un', 10.00, 15.00, 12.00, 11.00, 'MCC-PX-0002', NULL)) AS e(nome, sub, modelo, numero, sku, cor, largura, med_l, med_c, unidade, custo, pvp, grossista, distribuidor, supplier_sku, descricao)
  LEFT JOIN products p ON p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted AND p.name = e.nome
  WHERE NOT coalesce(
        p.sku = e.sku AND p.sku_gerado AND p.category_id = v_cat AND p.brand_id IS NULL AND p.is_active AND p.status = 'active'::product_status
        AND p.description IS NOT DISTINCT FROM e.descricao
        AND EXISTS (SELECT 1 FROM product_categories s WHERE s.id = p.subcategory_id AND s.sigla = e.sub)
        AND EXISTS (SELECT 1 FROM product_models pm WHERE pm.id = p.model_id AND pm.subcategory_id = p.subcategory_id
                    AND pm.deleted_at IS NULL AND pm.is_active AND pm.name = e.modelo AND pm.numero = e.numero)
        AND EXISTS (SELECT 1 FROM uom u WHERE u.id = p.uom_id AND u.code = e.unidade) AND p.unidade = e.unidade
        AND EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = p.id AND x.price_type = 'purchase' AND x.price = e.custo)
        AND EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = p.id AND x.price_type = 'retail' AND x.price = e.pvp)
        AND (SELECT count(*) FROM product_prices x WHERE x.product_id = p.id) = 2 + (e.grossista > 0)::integer + (e.distribuidor > 0)::integer
        AND (e.grossista = 0 OR EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = p.id AND x.price_type = 'wholesale' AND x.price = e.grossista))
        AND (e.distribuidor = 0 OR EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = p.id AND x.price_type = 'distributor' AND x.price = e.distribuidor))
        AND (SELECT count(*) FROM item_suppliers i WHERE i.product_id = p.id AND i.deleted_at IS NULL) = 1
        AND EXISTS (SELECT 1 FROM item_suppliers i WHERE i.product_id = p.id AND i.deleted_at IS NULL AND i.organization_id = c_org
                    AND i.supplier_id = p.supplier_id AND i.is_preferred AND i.supplier_sku = e.supplier_sku AND i.purchase_price = e.custo)
        AND (SELECT count(*) FROM product_attribute_values v WHERE v.product_id = p.id)
            = (e.cor IS NOT NULL)::integer + (e.largura IS NOT NULL)::integer + (e.med_l IS NOT NULL)::integer
        AND (e.cor IS NULL OR EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id = v_a_cor
                                      AND public.fn_cat_chave_opcao(v.value_text) = public.fn_cat_chave_opcao(e.cor)))
        AND (e.largura IS NULL OR EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id = v_a_larg
                                          AND v.value_text = e.largura))
        AND (e.med_l IS NULL OR EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id AND v.attribute_id = v_a_med
                                        AND v.unit = 'cm' AND v.value_json = jsonb_build_object('tipo', '2D', 'largura', e.med_l,
                                            'comprimento', e.med_c, 'espessura', NULL, 'unidade', 'cm'))),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2 — % produtos diferentes do esperado: %', v_n, left(v_txt, 1500); END IF;

  -- 3. as opções usadas
  SELECT count(*) INTO v_n FROM (VALUES ('0-30'), ('30'), ('31-40'), ('40'), ('41-50'), ('50'), ('51-60'), ('60'), ('61-70'), ('70'), ('71-80'), ('80'), ('81-90'), ('90'), ('91-100'), ('100')) AS x(v)
  WHERE NOT EXISTS (SELECT 1 FROM attribute_option_group_values o WHERE o.group_id = v_g_larg AND o.value_text = x.v AND o.is_active AND o.sigla IS NOT NULL);
  SELECT count(*) INTO v_m FROM (VALUES ('verde normal'), ('verde claro')) AS x(v)
  WHERE (SELECT count(*) FROM attribute_option_group_values o WHERE o.group_id = v_g_cor AND o.is_active AND o.sigla IS NOT NULL
         AND public.fn_cat_chave_opcao(o.value_text) = x.v) <> 1;
  IF v_n > 0 OR v_m > 0 THEN RAISE EXCEPTION 'FALHOU: passo 3 — % larguras e % cores em falta.', v_n, v_m; END IF;

  -- 4. SKUs únicos, no formato, recalculados e previstos
  SELECT count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ '^MCC-(AC|ACL|AI|AS|CCP|PX)-[0-9]{4}(-[A-Z0-9]+){0,3}$' OR NOT p.sku_gerado)
    INTO v_n, v_m
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted;
  SELECT count(*) INTO v_k FROM (SELECT p.sku FROM products p WHERE p.organization_id = c_org AND p.sku LIKE 'MCC-%'
                                 GROUP BY p.sku HAVING count(*) > 1) x;
  IF v_n <> c_total OR v_m > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — % SKUs distintos (328), % fora do formato ou não gerados, % repetidos.', v_n, v_m, v_k;
  END IF;
  SELECT count(*), string_agg(y.sku || ' ≠ ' || coalesce(y.calc, 'null'), '; ') INTO v_n, v_txt
  FROM (SELECT p.sku, z.pt ->> 'faltas' AS faltas,
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
        WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted) y
  WHERE y.calc IS DISTINCT FROM y.sku OR y.faltas IS DISTINCT FROM '[]';
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 4 — % SKUs diferentes do recalculado: %', v_n, left(v_txt, 1500); END IF;
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 4 — sem membro ativo da Mudelar com products.edit.'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  v_n := 0;
  FOR r IN SELECT p.id, p.sku, p.category_id, p.subcategory_id, p.model_id
           FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted ORDER BY p.sku LOOP
    SELECT coalesce(jsonb_agg(CASE WHEN a.is_measurement THEN jsonb_build_object('atributo', v.attribute_id, 'medida', v.value_json)
                                   ELSE jsonb_build_object('atributo', v.attribute_id, 'opcao', o.id) END), '[]'::jsonb)
      INTO v_attrs
    FROM product_attribute_values v
    JOIN product_attributes a ON a.id = v.attribute_id
    LEFT JOIN attribute_option_group_values o
      ON NOT a.is_measurement AND o.group_id = public.fn_cat_grupo_do_atributo(v.attribute_id, c_org) AND o.value_text = v.value_text
    WHERE v.product_id = r.id;
    v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.id);
    IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'FALHOU: passo 4 — cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 4 — só % produtos comparados.', v_n; END IF;

  -- 5. nada escrito fora do âmbito (o xmin é o da transação que criou os produtos)
  SELECT min(p.xmin::text) INTO v_xid FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs);
  SELECT string_agg(x.t || ' ' || x.n, ', ') INTO v_txt FROM (
    SELECT 'products (fora)' AS t, count(*) AS n FROM products p
              WHERE p.xmin::text = v_xid AND NOT (p.organization_id = c_org AND p.subcategory_id = ANY (v_subs))
    UNION ALL SELECT 'product_attribute_values (fora)', count(*) FROM product_attribute_values x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND NOT (p.organization_id = c_org AND p.subcategory_id = ANY (v_subs))
    UNION ALL SELECT 'product_prices (fora)', count(*) FROM product_prices x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND NOT (p.organization_id = c_org AND p.subcategory_id = ANY (v_subs))
    UNION ALL SELECT 'item_suppliers (fora)', count(*) FROM item_suppliers x
              WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'product_models (fora)', count(*) FROM product_models x
              WHERE x.xmin::text = v_xid AND NOT (x.organization_id = c_org AND x.subcategory_id = ANY (v_subs))
    UNION ALL SELECT 'product_attributes', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'attribute_option_groups', count(*) FROM attribute_option_groups x WHERE x.xmin::text = v_xid
    UNION ALL SELECT 'attribute_option_group_values (fora da Cor e da Largura)', count(*) FROM attribute_option_group_values x
              WHERE x.xmin::text = v_xid AND x.group_id NOT IN (v_g_cor, v_g_larg)
    UNION ALL SELECT 'uom (fora)', count(*) FROM uom x WHERE x.xmin::text = v_xid AND (x.organization_id IS DISTINCT FROM c_org OR x.code <> 'ml')
    UNION ALL SELECT 'product_categories (fora)', count(*) FROM product_categories x
              WHERE x.xmin::text = v_xid AND NOT (x.organization_id = c_org AND x.parent_id = v_cat AND x.sigla = 'CCP')) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — linhas escritas fora do âmbito: %', v_txt; END IF;

  -- 6. a auditoria
  SELECT count(DISTINCT e.record_id) INTO v_n FROM entity_audit_log e
  WHERE e.source = 'migration:mobiliario_cozinha_mudelar' AND e.table_name = 'products' AND e.operation = 'INSERT'
    AND e.record_id IN (SELECT p.id FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs));
  IF v_n <> c_total THEN
    RAISE EXCEPTION 'FALHOU: passo 6 — a auditoria tem % produtos criados com a fonte da migration (esperados 328).', v_n;
  END IF;
END $t$;

SELECT 'OK: mobiliário & componentes cozinha da Mudelar (328 produtos, 192 com medida, 96 com largura, 66 verdes, 2 em ml) conferidos nos passos 0 a 6.' AS resultado;

ROLLBACK;
