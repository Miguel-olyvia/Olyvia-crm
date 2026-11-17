-- ============================================================
-- Testes: 20270118600000_catalogo_loicas_sanitarias_mudelar.sql (base RH)
-- Ficheiro GERADO por script (gerar_loicas.js) a partir do Excel loicas.xlsx, como a migration.
-- ============================================================
-- ORDEM: correr ANTES do db push da 118600000 (falha no passo 0: a subcategoria «Sanitas» da Mudelar não tem
-- produtos); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355) e, para provar que nada foi escrito fora dela, as outras organizações (só
-- contagens pelo xmin da transação da importação). Para comparar os SKUs com cat_prever_sku_modelo usa, só nesta
-- transação, as claims de um membro ativo da Mudelar com products.edit (a função é só de leitura). Nenhuma chamada
-- recusada de propósito.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_loicas_sanitarias_mudelar.test.sql
--
-- O que PROVA:
--   1. 93 produtos vivos nas 4 subcategorias de «Loiças Sanitárias» (Sanitas 36, Bidés 29, Kit´s para Sanitários 14, Lavatórios 14); 36 modelos com os
--      números e nomes do Excel e o número certo de produtos cada.
--   2. Cada um dos 93 produtos, pelo nome: o SKU exato, a sigla da Cor e da Tonalidade que o nome indica (nenhuma
--      na estrutura) e nenhum outro atributo, custo, PVP e IVA 23, marca, fornecedor preferido (preço = custo,
--      supplier_sku = SKU), unidade un, estado active, SKU gerado.
--   3. Os 6 SKUs que estavam repetidos no Excel deram SKUs novos distintos (os dois lados de cada par).
--   4. SKUs todos únicos e no formato LS-(S|B|KS|L)-NNNN[-COR[-TON]].
--   5. As siglas: LS; S, B, KS, L; as das opções de Cor e de Tonalidade.
--   6. Os 2 fornecedores existem uma vez cada na Mudelar.
--   7. Nenhuma linha de outra organização tem o xmin da transação que criou os produtos.
--   8. Todos os produtos: cat_prever_sku_modelo dá o SKU gravado, sem faltas.
--   9. A auditoria registou os produtos com a fonte migration:loicas_sanitarias_mudelar.
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A importação foi aplicada? ───────────────────────────────────────────
DO $t0$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products p JOIN product_categories s ON s.id = p.subcategory_id
                 JOIN product_categories c ON c.id = s.parent_id
                 WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
                   AND public.fn_cat_chave_opcao(s.name) = 'sanitas' AND public.fn_cat_chave_opcao(c.name) = 'loicas sanitarias') THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — a subcategoria «Sanitas» da Mudelar não tem produtos (aplicar 20270118600000).';
  END IF;
END $t0$;

-- ─── 1 a 9 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_total constant integer := 93;
  c_n_modelos constant integer := 36;
  c_iva constant numeric := 23;
  v_cat uuid; v_subs uuid[]; v_a_cor uuid; v_a_ton uuid; v_g_cor uuid; v_g_ton uuid;
  v_n bigint; v_m bigint; v_txt text; v_xid text; v_auth uuid; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  SELECT c.id INTO v_cat FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND public.fn_cat_chave_opcao(c.name) = 'loicas sanitarias';
  SELECT array_agg(c.id) INTO v_subs FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) IN (SELECT public.fn_cat_chave_opcao(e.nome) FROM (VALUES ('S', 'Sanitas', 36), ('B', 'Bidés', 29), ('KS', 'Kit´s para Sanitários', 14), ('L', 'Lavatórios', 14)) AS e(sigla, nome, n));
  SELECT a.id INTO v_a_cor FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'cor';
  SELECT a.id INTO v_a_ton FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'tonalidade';
  v_g_cor := public.fn_cat_grupo_do_atributo(v_a_cor, c_org);
  v_g_ton := public.fn_cat_grupo_do_atributo(v_a_ton, c_org);
  IF v_cat IS NULL OR cardinality(v_subs) IS DISTINCT FROM 4 OR v_a_cor IS NULL OR v_a_ton IS NULL THEN
    RAISE EXCEPTION 'FALHOU: configuração da Mudelar incompleta (categoria, 4 subcategorias ou atributos).';
  END IF;

  -- 1. quantos, por subcategoria e por modelo
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted;
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 1 — % produtos em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(e.nome || ': ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM (VALUES ('S', 'Sanitas', 36), ('B', 'Bidés', 29), ('KS', 'Kit´s para Sanitários', 14), ('L', 'Lavatórios', 14)) AS e(sigla, nome, n)
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
                                AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(e.nome)
  LEFT JOIN (SELECT p.subcategory_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.subcategory_id) x ON x.subcategory_id = c.id
  WHERE coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — por subcategoria: %', v_txt; END IF;
  SELECT string_agg(e.sub || lpad(e.numero::text, 4, '0') || ' ' || e.nome || ': ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM (VALUES
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
    ('L', 8, 'LERIDA', 1)) AS e(sub, numero, nome, n)
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL AND c.sigla = e.sub
  LEFT JOIN product_models pm ON pm.organization_id = c_org AND pm.subcategory_id = c.id AND pm.deleted_at IS NULL
                             AND pm.numero = e.numero AND pm.name = e.nome AND pm.is_active
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.model_id) x ON x.model_id = pm.id
  WHERE coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — por modelo: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id = ANY (v_subs);
  IF v_n <> c_n_modelos THEN RAISE EXCEPTION 'FALHOU: passo 1 — % modelos nas subcategorias em vez de %.', v_n, c_n_modelos; END IF;

  -- 2. cada produto, pelo nome: SKU, siglas de Cor e Tonalidade, só esses atributos, preços, marca, fornecedor
  SELECT count(*), string_agg(e.nome, ' | ') INTO v_n, v_txt
  FROM (VALUES
    ('SANITA MAX BTW BRANCO BRILHO', 'LS-S-0001-B-B', 'B', 'B', 92.50, 185.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA ROUND BRANCO BRILHO', 'LS-S-0002-B-B', 'B', 'B', 85.00, 170.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA GLAMIC BTW BRANCO BRILHO', 'LS-S-0003-B-B', 'B', 'B', 140.00, 280.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA GLAMIC BTW BRANCO MATE', 'LS-S-0003-B-M', 'B', 'M', 200.00, 400.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA GLAMIC BTW CINZA MATE', 'LS-S-0003-C-M', 'C', 'M', 225.00, 450.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA GLAMIC BTW BRANCO BRILHO S/TANQUE', 'LS-S-0004-B-B', 'B', 'B', 100.00, 200.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA GLAMIC BTW BRANCO MATE S/TANQUE', 'LS-S-0004-B-M', 'B', 'M', 150.00, 300.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA GLAMIC SUSPENSO CINZA MATE', 'LS-S-0005-C-M', 'C', 'M', 150.00, 300.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA GLAMIC SUSPENSO PRETO MATE', 'LS-S-0005-P-M', 'P', 'M', 150.00, 300.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA GLAMIC SUSPENSO BRANCO BRILHO', 'LS-S-0005-B-B', 'B', 'B', 90.00, 180.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA GLAMIC SUSPENSO BRANCO MATE', 'LS-S-0005-B-M', 'B', 'M', 130.00, 260.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA ELEGANT BTW BRANCO BRILHO', 'LS-S-0006-B-B', 'B', 'B', 145.00, 290.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA ELEGANT BTW BRANCO MATE', 'LS-S-0006-B-M', 'B', 'M', 200.00, 400.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA ELEGANT BTW CAPPUCINNO', 'LS-S-0006-CC', 'CC', NULL, 225.00, 450.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA ELEGANT BTW CINZA ESCURO', 'LS-S-0006-CE', 'CE', NULL, 225.00, 450.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA ELEGANT BTW BRANCO BRILHO S/TANQUE', 'LS-S-0007-B-B', 'B', 'B', 105.00, 210.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA ELEGANT BTW BRANCO MATE S/TANQUE', 'LS-S-0007-B-M', 'B', 'M', 150.00, 300.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA ELEGANT SUSPENSO BRANCO BRILHO', 'LS-S-0008-B-B', 'B', 'B', 92.50, 185.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA ELEGANT SUSPENSO PRETO MATE', 'LS-S-0008-P-M', 'P', 'M', 150.00, 300.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA ELEGANT SUSPENSO BRANCO MATE', 'LS-S-0008-B-M', 'B', 'M', 130.00, 260.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA ELEGANT SUSPENSO CAPPUCINNO', 'LS-S-0008-CC', 'CC', NULL, 150.00, 300.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA ELEGANT SUSPENSO CINZA ESCURO', 'LS-S-0008-CE', 'CE', NULL, 150.00, 300.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA FLY BTW Cappucinno Mate', 'LS-S-0009-CC-M', 'CC', 'M', 225.00, 450.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA FLY BTW BRANCO BRILHO', 'LS-S-0009-B-B', 'B', 'B', 125.00, 250.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA FLY BTW BRANCO MATE', 'LS-S-0009-B-M', 'B', 'M', 200.00, 400.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA FLY BTW BRANCO BRILHO S/TANQUE', 'LS-S-0010-B-B', 'B', 'B', 100.00, 200.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA FLY BTW BRANCO MATE S/TANQUE', 'LS-S-0010-B-M', 'B', 'M', 150.00, 300.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA FLY PLUS SUSPENSO BRANCO BRILHO', 'LS-S-0011-B-B', 'B', 'B', 95.00, 190.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA FLY SUSPENSO CAPPUCINNO', 'LS-S-0012-CC', 'CC', NULL, 150.00, 300.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA FLY SUSPENSO PRETO MATE', 'LS-S-0012-P-M', 'P', 'M', 150.00, 300.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA FLY SUSPENSO BRANCO BRILHO', 'LS-S-0012-B-B', 'B', 'B', 90.00, 180.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA FLY SUSPENSO BRANCO MATE', 'LS-S-0012-B-M', 'B', 'M', 130.00, 260.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA BOHEMIC BTW BRANCO BRILHO', 'LS-S-0013-B-B', 'B', 'B', 105.00, 210.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA BOHEMIC BTW PRETO MATE', 'LS-S-0013-P-M', 'P', 'M', 225.00, 450.00, 'Rubicer', 'RUBICER, Lda.'),
    ('SANITA BOHEMIC BTW BRANCO MATE', 'LS-S-0013-B-M', 'B', 'M', 200.00, 400.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Sanita de Chão SMART TOILET WISH BRANCO BRILHO', 'LS-S-0014-B-B', 'B', 'B', 410.40, 760.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('BIDÉ MAX BTW BRANCO BRILHO', 'LS-B-0001-B-B', 'B', 'B', 70.00, 140.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ ROUND BRANCO BRILHO', 'LS-B-0002-B-B', 'B', 'B', 67.50, 135.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ GLAMIC BTW BRANCO BRILHO', 'LS-B-0003-B-B', 'B', 'B', 75.00, 150.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ GLAMIC BTW BRANCO MATE', 'LS-B-0003-B-M', 'B', 'M', 125.00, 250.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ GLAMIC BTW CINZA MATE', 'LS-B-0003-C-M', 'C', 'M', 140.00, 280.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ GLAMIC SUSPENSO CINZA MATE', 'LS-B-0005-C-M', 'C', 'M', 130.00, 260.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ GLAMIC SUSPENSO PRETO MATE', 'LS-B-0005-P-M', 'P', 'M', 130.00, 260.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ GLAMIC SUSPENSO BRANCO BRILHO', 'LS-B-0005-B-B', 'B', 'B', 72.50, 145.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ GLAMIC SUSPENSO BRANCO MATE', 'LS-B-0005-B-M', 'B', 'M', 110.00, 220.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ ELEGANT BTW BRANCO BRILHO', 'LS-B-0006-B-B', 'B', 'B', 80.00, 160.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ ELEGANT BTW BRANCO MATE', 'LS-B-0006-B-M', 'B', 'M', 125.00, 250.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ ELEGANT BTW CAPPUCINNO', 'LS-B-0006-CC', 'CC', NULL, 140.00, 280.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ ELEGANT BTW CINZA ESCURO', 'LS-B-0006-CE', 'CE', NULL, 140.00, 280.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ ELEGANT SUSPENSO BRANCO BRILHO', 'LS-B-0008-B-B', 'B', 'B', 72.50, 145.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ ELEGANT SUSPENSO PRETO MATE', 'LS-B-0008-P-M', 'P', 'M', 130.00, 260.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ ELEGANT SUSPENSO BRANCO MATE', 'LS-B-0008-B-M', 'B', 'M', 110.00, 220.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ ELEGANT SUSPENSO CAPPUCINNO', 'LS-B-0008-CC', 'CC', NULL, 130.00, 260.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ ELEGANT SUSPENSO CINZA ESCURO', 'LS-B-0008-CE', 'CE', NULL, 130.00, 260.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ FLY BTW Cappucinno Mate', 'LS-B-0009-CC-M', 'CC', 'M', 140.00, 280.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ FLY BTW BRANCO BRILHO', 'LS-B-0009-B-B', 'B', 'B', 85.00, 170.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ FLY BTW BRANCO MATE', 'LS-B-0009-B-M', 'B', 'M', 125.00, 250.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ FLY PLUS SUSPENSO BRANCO BRILHO', 'LS-B-0011-B-B', 'B', 'B', 85.00, 170.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ FLY SUSPENSO CAPPUCINNO', 'LS-B-0012-CC', 'CC', NULL, 130.00, 260.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ FLY SUSPENSO PRETO MATE', 'LS-B-0012-P-M', 'P', 'M', 130.00, 260.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ FLY SUSPENSO BRANCO BRILHO', 'LS-B-0012-B-B', 'B', 'B', 72.50, 145.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ FLY SUSPENSO BRANCO MATE', 'LS-B-0012-B-M', 'B', 'M', 110.00, 220.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ BOHEMIC BTW BRANCO BRILHO', 'LS-B-0013-B-B', 'B', 'B', 80.00, 160.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ BOHEMIC BTW PRETO MATE', 'LS-B-0013-P-M', 'P', 'M', 140.00, 280.00, 'Rubicer', 'RUBICER, Lda.'),
    ('BIDÉ BOHEMIC BTW BRANCO MATE', 'LS-B-0013-B-M', 'B', 'M', 125.00, 250.00, 'Rubicer', 'RUBICER, Lda.'),
    ('ESTRUTURA PARA Sanita Suspensa', 'LS-KS-0001', NULL, NULL, 100.00, 200.00, 'Rubicer', 'RUBICER, Lda.'),
    ('PLACA DE ACIONAMENTO FINA BRANCO MATE', 'LS-KS-0002-B-M', 'B', 'M', 20.00, 40.00, 'Rubicer', 'RUBICER, Lda.'),
    ('PLACA DE ACIONAMENTO FINA PRETO MATE', 'LS-KS-0002-P-M', 'P', 'M', 30.00, 60.00, 'Rubicer', 'RUBICER, Lda.'),
    ('PLACA DE ACIONAMENTO RETANGULAR CROMADO', 'LS-KS-0003-CRO', 'CRO', NULL, 18.00, 36.00, 'Rubicer', 'RUBICER, Lda.'),
    ('PLACA DE ACIONAMENTO RETANGULAR ROSA GOLD', 'LS-KS-0003-RG', 'RG', NULL, 50.00, 100.00, 'Rubicer', 'RUBICER, Lda.'),
    ('PLACA DE ACIONAMENTO RETANGULAR GUN METAL', 'LS-KS-0003-GMT', 'GMT', NULL, 50.00, 100.00, 'Rubicer', 'RUBICER, Lda.'),
    ('PLACA DE ACIONAMENTO RETANGULAR PRETO MATE', 'LS-KS-0003-P-M', 'P', 'M', 27.00, 54.00, 'Rubicer', 'RUBICER, Lda.'),
    ('PLACA DE ACIONAMENTO RETANGULAR DOURADO', 'LS-KS-0003-D', 'D', NULL, 106.00, 212.00, 'Rubicer', 'RUBICER, Lda.'),
    ('PLACA DE ACIONAMENTO RETANGULAR DOURADO MATE', 'LS-KS-0003-D-M', 'D', 'M', 50.00, 100.00, 'Rubicer', 'RUBICER, Lda.'),
    ('PLACA DE ACIONAMENTO REDONDO BRANCO MATE', 'LS-KS-0004-B-M', 'B', 'M', 16.00, 32.00, 'Rubicer', 'RUBICER, Lda.'),
    ('PLACA DE ACIONAMENTO REDONDO CROMADO', 'LS-KS-0004-CRO', 'CRO', NULL, 18.00, 36.00, 'Rubicer', 'RUBICER, Lda.'),
    ('PLACA DE ACIONAMENTO REDONDO PRETO MATE', 'LS-KS-0004-P-M', 'P', 'M', 27.00, 54.00, 'Rubicer', 'RUBICER, Lda.'),
    ('PLACA DE ACIONAMENTO REDONDO PRETO E GOLD', 'LS-KS-0004-PG', 'PG', NULL, 50.00, 100.00, 'Rubicer', 'RUBICER, Lda.'),
    ('PLACA DE ACIONAMENTO REDONDO DOURADO', 'LS-KS-0004-D', 'D', NULL, 106.00, 212.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Lavatório BREAK RULES PRETO MATE', 'LS-L-0001-P-M', 'P', 'M', 75.00, 150.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Lavatório BREAK RULES CINZA MATE', 'LS-L-0001-C-M', 'C', 'M', 75.00, 150.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Lavatório BREAK RULES CINZA ESCURO', 'LS-L-0001-CE', 'CE', NULL, 75.00, 150.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Lavatório BREAK RULES CAPPUCINO', 'LS-L-0001-CC', 'CC', NULL, 75.00, 150.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Lavatório ALMERIA BRANCO BRILHO', 'LS-L-0002-B-B', 'B', 'B', 32.40, 60.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Lavatório DETROIT BRANCO BRILHO', 'LS-L-0003-B-B', 'B', 'B', 32.40, 60.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Lavatório MOSCOVO BRANCO BRILHO', 'LS-L-0004-B-B', 'B', 'B', 37.80, 70.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Lavatório BARCELONA BRANCO BRILHO', 'LS-L-0005-B-B', 'B', 'B', 54.00, 100.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Lavatório BARCELONA PRETO BRILHO', 'LS-L-0005-P-B', 'P', 'B', 97.20, 180.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Lavatório BARCELONA PRATA', 'LS-L-0005-PR', 'PR', NULL, 97.20, 180.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Lavatório BARCELONA OURO', 'LS-L-0005-OR', 'OR', NULL, 97.20, 180.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Lavatório VIRGINIA BRANCO BRILHO', 'LS-L-0006-B-B', 'B', 'B', 48.60, 90.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Lavatório LILLE BRANCO BRILHO', 'LS-L-0007-B-B', 'B', 'B', 43.20, 80.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Lavatório LERIDA BRANCO BRILHO', 'LS-L-0008-B-B', 'B', 'B', 40.50, 75.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO')) AS e(nome, sku, cor, ton, custo, pvp, marca, fornecedor)
  LEFT JOIN products p ON p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted AND p.name = e.nome
  WHERE NOT coalesce(
        p.sku = e.sku AND p.sku_gerado AND p.category_id = v_cat AND p.status = 'active' AND p.tipo_catalogo = 'produto'
        AND p.is_active AND p.manages_stock AND p.unidade = 'un' AND p.uom_id IS NOT NULL
        AND p.marca_livre = e.marca
        AND EXISTS (SELECT 1 FROM brands b WHERE b.id = p.brand_id AND b.organization_id = c_org AND b.name = e.marca)
        AND p.fornecedor_livre = e.fornecedor
        AND EXISTS (SELECT 1 FROM suppliers s WHERE s.id = p.supplier_id AND s.organization_id = c_org AND s.name = e.fornecedor)
        -- a cor e a tonalidade que o nome indica (NULL = não tem), e nenhum outro atributo
        AND (SELECT o.sigla FROM product_attribute_values v JOIN attribute_option_group_values o ON o.group_id = v_g_cor AND o.value_text = v.value_text
             WHERE v.product_id = p.id AND v.attribute_id = v_a_cor) IS NOT DISTINCT FROM e.cor
        AND (SELECT o.sigla FROM product_attribute_values v JOIN attribute_option_group_values o ON o.group_id = v_g_ton AND o.value_text = v.value_text
             WHERE v.product_id = p.id AND v.attribute_id = v_a_ton) IS NOT DISTINCT FROM e.ton
        AND (SELECT count(*) FROM product_attribute_values v WHERE v.product_id = p.id)
            = (CASE WHEN e.cor IS NULL THEN 0 ELSE 1 END) + (CASE WHEN e.ton IS NULL THEN 0 ELSE 1 END)
        -- 2 preços: custo e PVP do Excel
        AND (SELECT count(*) FROM product_prices x WHERE x.product_id = p.id) = 2
        AND EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = p.id AND x.price_type = 'purchase'
                    AND x.price = round(e.custo, 2) AND x.preco_exato = round(e.custo, 6) AND x.vat_rate = c_iva AND x.currency = 'EUR')
        AND EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = p.id AND x.price_type = 'retail'
                    AND x.price = round(e.pvp, 2) AND x.vat_rate = c_iva AND x.currency = 'EUR')
        -- um fornecedor, o preferido, preço = custo, supplier_sku = SKU
        AND (SELECT count(*) FROM item_suppliers i WHERE i.product_id = p.id AND i.deleted_at IS NULL) = 1
        AND EXISTS (SELECT 1 FROM item_suppliers i WHERE i.product_id = p.id AND i.deleted_at IS NULL AND i.supplier_id = p.supplier_id
                    AND i.is_preferred AND i.is_active AND i.organization_id = c_org AND i.supplier_sku = p.sku
                    AND i.purchase_price = round(e.custo, 2)),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2 — % produtos diferentes da linha do Excel: %', v_n, left(v_txt, 1500); END IF;

  -- 3. os SKUs que estavam repetidos no Excel deram SKUs novos distintos
  SELECT count(*), string_agg(e.antigo || ': ' || coalesce(p1.sku, 'sem produto') || ' / ' || coalesce(p2.sku, 'sem produto'), '; ') INTO v_n, v_txt
  FROM (VALUES
    ('LSS0005PM', 'SANITA GLAMIC SUSPENSO PRETO MATE', 'LS-S-0005-P-M', 'SANITA GLAMIC SUSPENSO BRANCO MATE', 'LS-S-0005-B-M'),
    ('LSS0008PM', 'SANITA ELEGANT SUSPENSO PRETO MATE', 'LS-S-0008-P-M', 'SANITA ELEGANT SUSPENSO BRANCO MATE', 'LS-S-0008-B-M'),
    ('LSS0013BB', 'SANITA BOHEMIC BTW BRANCO BRILHO', 'LS-S-0013-B-B', 'SANITA BOHEMIC BTW BRANCO MATE', 'LS-S-0013-B-M'),
    ('LSB0005PM', 'BIDÉ GLAMIC SUSPENSO PRETO MATE', 'LS-B-0005-P-M', 'BIDÉ GLAMIC SUSPENSO BRANCO MATE', 'LS-B-0005-B-M'),
    ('LSB0008PM', 'BIDÉ ELEGANT SUSPENSO PRETO MATE', 'LS-B-0008-P-M', 'BIDÉ ELEGANT SUSPENSO BRANCO MATE', 'LS-B-0008-B-M'),
    ('LSB0013BB', 'BIDÉ BOHEMIC BTW BRANCO BRILHO', 'LS-B-0013-B-B', 'BIDÉ BOHEMIC BTW BRANCO MATE', 'LS-B-0013-B-M')) AS e(antigo, nome1, sku1, nome2, sku2)
  LEFT JOIN products p1 ON p1.organization_id = c_org AND p1.subcategory_id = ANY (v_subs) AND NOT p1.is_deleted AND p1.name = e.nome1
  LEFT JOIN products p2 ON p2.organization_id = c_org AND p2.subcategory_id = ANY (v_subs) AND NOT p2.is_deleted AND p2.name = e.nome2
  WHERE NOT coalesce(p1.sku = e.sku1 AND p2.sku = e.sku2 AND p1.sku <> p2.sku, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 3 — repetidos do Excel: %', v_txt; END IF;

  -- 4. SKUs únicos e no formato
  SELECT count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ '^LS-(S|B|KS|L)-[0-9]{4}(-[A-Z0-9]+){0,2}$' OR NOT p.sku_gerado)
    INTO v_n, v_m
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted;
  IF v_n <> c_total OR v_m > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — % SKUs distintos (esperados %), % fora do formato ou não gerados.', v_n, c_total, v_m;
  END IF;

  -- 5. siglas: categoria, subcategorias, opções
  IF (SELECT c.sigla FROM product_categories c WHERE c.id = v_cat) IS DISTINCT FROM 'LS' THEN
    RAISE EXCEPTION 'FALHOU: passo 5 — a sigla de Loiças Sanitárias não é LS.';
  END IF;
  SELECT string_agg(e.nome || ': ' || coalesce(c.sigla, 'sem subcategoria') || ' em vez de ' || e.sigla, '; ') INTO v_txt
  FROM (VALUES ('S', 'Sanitas', 36), ('B', 'Bidés', 29), ('KS', 'Kit´s para Sanitários', 14), ('L', 'Lavatórios', 14)) AS e(sigla, nome, n)
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
                                AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(e.nome)
  WHERE c.sigla IS DISTINCT FROM e.sigla;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — siglas das subcategorias: %', v_txt; END IF;
  SELECT string_agg(e.papel || ' ' || e.nome || ': ' || coalesce(o.sigla, 'sem opção') || ' em vez de ' || e.codigo, '; ') INTO v_txt
  FROM (VALUES ('cor', 'Branco', 'B'), ('cor', 'Cinza', 'C'), ('cor', 'Preto', 'P'), ('cor', 'Dourado', 'D'), ('cor', 'Capuccino', 'CC'), ('cor', 'Cinza Escuro', 'CE'), ('cor', 'CROMO', 'CRO'), ('cor', 'Ouro', 'OR'), ('cor', 'Prata', 'PR'), ('cor', 'Preto e Gold', 'PG'), ('cor', 'Rosa Gold', 'RG'), ('cor', 'Gun Metal', 'GMT'), ('tonalidade', 'BRILHO', 'B'), ('tonalidade', 'MATE', 'M')) AS e(papel, nome, codigo)
  LEFT JOIN attribute_option_group_values o
    ON o.group_id = (CASE WHEN e.papel = 'cor' THEN v_g_cor ELSE v_g_ton END)
   AND public.fn_cat_chave_opcao(o.value_text::text) = public.fn_cat_chave_opcao(e.nome)
  WHERE o.sigla IS DISTINCT FROM e.codigo;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — siglas das opções: %', v_txt; END IF;

  -- 6. os 2 fornecedores, uma vez cada
  SELECT string_agg(e.nome || ' ×' || (SELECT count(*) FROM suppliers s WHERE s.organization_id = c_org AND s.deleted_at IS NULL
                                        AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.nome)), '; ') INTO v_txt
  FROM (VALUES ('RUBICER, Lda.'), ('ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO')) AS e(nome)
  WHERE (SELECT count(*) FROM suppliers s WHERE s.organization_id = c_org AND s.deleted_at IS NULL
         AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.nome)) <> 1;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 6 — fornecedores: %', v_txt; END IF;

  -- 7. nada escrito fora da Mudelar
  SELECT mode() WITHIN GROUP (ORDER BY p.xmin::text) INTO v_xid FROM products p
  WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted;
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
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_group_values', count(*) FROM attribute_option_group_values v JOIN attribute_option_groups g ON g.id = v.group_id
              WHERE v.xmin::text = v_xid AND g.organization_id IS DISTINCT FROM c_org) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 7 — linhas de outras organizações escritas pela importação: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id IS DISTINCT FROM c_org
    AND (p.subcategory_id = ANY (v_subs) OR p.model_id IN (SELECT pm.id FROM product_models pm WHERE pm.organization_id = c_org));
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 7 — % produtos de outras organizações apontam para dados da Mudelar.', v_n; END IF;

  -- 8. todos: cat_prever_sku_modelo (só leitura) como um membro da Mudelar com products.edit
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 8 — sem membro ativo da Mudelar com products.edit.'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  v_n := 0;
  FOR r IN SELECT p.id, p.sku, p.category_id, p.subcategory_id, p.model_id,
                  (SELECT o.id FROM product_attribute_values v JOIN attribute_option_group_values o ON o.group_id = v_g_cor AND o.value_text = v.value_text
                   WHERE v.product_id = p.id AND v.attribute_id = v_a_cor) AS cor,
                  (SELECT o.id FROM product_attribute_values v JOIN attribute_option_group_values o ON o.group_id = v_g_ton AND o.value_text = v.value_text
                   WHERE v.product_id = p.id AND v.attribute_id = v_a_ton) AS ton
           FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted ORDER BY p.sku LOOP
    v_attrs := '[]'::jsonb;
    IF r.cor IS NOT NULL THEN v_attrs := v_attrs || jsonb_build_array(jsonb_build_object('atributo', v_a_cor, 'opcao', r.cor)); END IF;
    IF r.ton IS NOT NULL THEN v_attrs := v_attrs || jsonb_build_array(jsonb_build_object('atributo', v_a_ton, 'opcao', r.ton)); END IF;
    v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.id);
    IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'FALHOU: passo 8 — cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 8 — só % produtos comparados.', v_n; END IF;

  -- 9. a auditoria registou a criação dos produtos, com a fonte da importação
  SELECT count(DISTINCT e.record_id) INTO v_n FROM entity_audit_log e
  WHERE e.organization_id = c_org AND e.source = 'migration:loicas_sanitarias_mudelar' AND e.table_name = 'products'
    AND e.operation = 'INSERT'
    AND e.record_id IN (SELECT p.id FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs));
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 9 — a auditoria tem % dos % produtos com a fonte da importação.', v_n, c_total; END IF;
END $t$;

SELECT 'OK: loiças sanitárias da Mudelar (93 produtos, 36 modelos) conferidas nos passos 0 a 9.' AS resultado;

ROLLBACK;
