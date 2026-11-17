-- ============================================================
-- Testes: 20270118700000_catalogo_acessorios_wc_mudelar.sql (base RH)
-- Ficheiro GERADO por script (gerar_acessorios.js) a partir do Excel acess.xlsx, como a migration.
-- ============================================================
-- ORDEM: correr ANTES do db push da 118700000 (falha no passo 0: a subcategoria «Toalheiros» da Mudelar não tem
-- produtos); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355) e, para provar que nada foi escrito fora dela, as outras organizações (só
-- contagens pelo xmin da transação da importação). Para comparar os SKUs com cat_prever_sku_modelo usa, só nesta
-- transação, as claims de um membro ativo da Mudelar com products.edit (a função é só de leitura). Nenhuma chamada
-- recusada de propósito.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_acessorios_wc_mudelar.test.sql
--
-- O que PROVA:
--   1. 87 produtos vivos nas 9 subcategorias de «Acessórios de Casa de Banho» (Porta-rolos 8, Piaçaba 8, Toalheiros 52, Cabides 8, Pega De Segurança 6, Auxiliares 2, Cestos 1, Cadeiras 1, Bancos 1); 26
--      modelos com os números e nomes do Excel e o número certo de produtos cada (ELETRICO HOT: um modelo, T 0013, com 2).
--   2. Cada um dos 87 produtos, pelo nome: o SKU exato, a sigla da Cor e da Tonalidade que o nome indica (nenhuma
--      na cadeira, no banco e na barra de apoio) e nenhum outro atributo, custo, PVP e IVA 23, marca, fornecedor
--      preferido (preço = custo, supplier_sku = SKU), unidade un, estado active, SKU gerado.
--   3. «Auxiliares» existe uma só vez em «Acessórios de Casa de Banho» da Mudelar, ativa, sigla A, com caminho de subcategoria;
--      a opção ESCOVADO existe uma só vez na Tonalidade da Mudelar.
--   4. SKUs todos únicos e no formato ACB-(PR|P|T|C|PS|A|CE|CA|B)-NNNN[-COR[-TON]].
--   5. As siglas: ACB; as das subcategorias; as das opções de Cor e de Tonalidade.
--   6. Os 2 fornecedores existem uma vez cada na Mudelar.
--   7. Nenhuma linha de outra organização tem o xmin da transação que criou os produtos.
--   8. Todos os produtos: cat_prever_sku_modelo dá o SKU gravado, sem faltas.
--   9. A auditoria registou os produtos com a fonte migration:acessorios_wc_mudelar.
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A importação foi aplicada? ───────────────────────────────────────────
DO $t0$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products p JOIN product_categories s ON s.id = p.subcategory_id
                 JOIN product_categories c ON c.id = s.parent_id
                 WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
                   AND public.fn_cat_chave_opcao(s.name) = 'toalheiros' AND public.fn_cat_chave_opcao(c.name) = 'acessorios de casa de banho') THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — a subcategoria «Toalheiros» da Mudelar não tem produtos (aplicar 20270118700000).';
  END IF;
END $t0$;

-- ─── 1 a 9 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_total constant integer := 87;
  c_n_modelos constant integer := 26;
  c_n_subs constant integer := 9;
  c_iva constant numeric := 23;
  v_cat uuid; v_cat_nome text; v_subs uuid[]; v_a_cor uuid; v_a_ton uuid; v_g_cor uuid; v_g_ton uuid;
  v_n bigint; v_m bigint; v_txt text; v_xid text; v_auth uuid; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  SELECT c.id, c.name INTO v_cat, v_cat_nome FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND public.fn_cat_chave_opcao(c.name) = 'acessorios de casa de banho';
  SELECT array_agg(c.id) INTO v_subs FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) IN (SELECT public.fn_cat_chave_opcao(e.nome) FROM (VALUES ('PR', 'Porta-rolos', 8), ('P', 'Piaçaba', 8), ('T', 'Toalheiros', 52), ('C', 'Cabides', 8), ('PS', 'Pega De Segurança', 6), ('A', 'Auxiliares', 2), ('CE', 'Cestos', 1), ('CA', 'Cadeiras', 1), ('B', 'Bancos', 1)) AS e(sigla, nome, n));
  SELECT a.id INTO v_a_cor FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'cor';
  SELECT a.id INTO v_a_ton FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'tonalidade';
  v_g_cor := public.fn_cat_grupo_do_atributo(v_a_cor, c_org);
  v_g_ton := public.fn_cat_grupo_do_atributo(v_a_ton, c_org);
  IF v_cat IS NULL OR cardinality(v_subs) IS DISTINCT FROM c_n_subs OR v_a_cor IS NULL OR v_a_ton IS NULL THEN
    RAISE EXCEPTION 'FALHOU: configuração da Mudelar incompleta (categoria, % subcategorias ou atributos).', c_n_subs;
  END IF;

  -- 1. quantos, por subcategoria e por modelo
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted;
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 1 — % produtos em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(e.nome || ': ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM (VALUES ('PR', 'Porta-rolos', 8), ('P', 'Piaçaba', 8), ('T', 'Toalheiros', 52), ('C', 'Cabides', 8), ('PS', 'Pega De Segurança', 6), ('A', 'Auxiliares', 2), ('CE', 'Cestos', 1), ('CA', 'Cadeiras', 1), ('B', 'Bancos', 1)) AS e(sigla, nome, n)
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
                                AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(e.nome)
  LEFT JOIN (SELECT p.subcategory_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.subcategory_id) x ON x.subcategory_id = c.id
  WHERE coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — por subcategoria: %', v_txt; END IF;
  SELECT string_agg(e.sub || lpad(e.numero::text, 4, '0') || ' ' || e.nome || ': ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM (VALUES
    ('PR', 1, 'SMOOTH', 6),
    ('PR', 2, 'MARINA', 2),
    ('P', 1, 'SMOOTH', 6),
    ('P', 2, 'MARINA', 2),
    ('T', 1, 'SMOOTH BARRA 45cm', 6),
    ('T', 2, 'SMOOTH BARRA 60cm', 6),
    ('T', 3, 'SMOOTH C/PRATELEIRA 60cm', 6),
    ('T', 4, 'SMOOTH BIDE 25cm', 6),
    ('T', 5, 'MARINA BARRA 35cm', 2),
    ('T', 6, 'MARINA BARRA 45cm', 2),
    ('T', 7, 'MARINA BARRA 60cm', 2),
    ('T', 8, 'MARINA BIDE 15cm', 2),
    ('T', 9, 'DE MOVEL MOSS 36cm', 5),
    ('T', 10, 'DE MOVEL MOSS 26cm', 5),
    ('T', 11, 'DE MOVEL SAND 36cm', 5),
    ('T', 12, 'DE PE ALTO MT', 2),
    ('T', 13, 'ELETRICO HOT', 2),
    ('T', 15, 'ELETRICO CONFY', 1),
    ('C', 1, 'SMOOTH', 6),
    ('C', 2, 'MARINA', 2),
    ('PS', 1, 'Pega 30cm', 5),
    ('PS', 3, 'Barra de Apoio para Sanita 76cm', 1),
    ('A', 1, 'Auxiliar c/porta Rolo + Piaçaba DE PE ALTO', 2),
    ('CE', 2, 'DE COLUNA DE DUCHE', 1),
    ('CA', 1, 'AJUSTADA', 1),
    ('B', 1, 'REBATIVEL', 1)) AS e(sub, numero, nome, n)
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
    ('Porta-Rolos SMOOTH CROMADO', 'ACB-PR-0001-CRO', 'CRO', NULL, 12.50, 25.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Porta-Rolos SMOOTH PRETO MATE', 'ACB-PR-0001-P-M', 'P', 'M', 12.50, 25.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Porta-Rolos SMOOTH GUN METAL', 'ACB-PR-0001-GMT', 'GMT', NULL, 15.00, 30.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Porta-Rolos SMOOTH BRANCO MATE', 'ACB-PR-0001-B-M', 'B', 'M', 12.50, 25.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Porta-Rolos SMOOTH DOURADO ESCOVADO', 'ACB-PR-0001-D-E', 'D', 'E', 15.00, 30.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Porta-Rolos SMOOTH ROSA GOLD ESCOVADO', 'ACB-PR-0001-RG-E', 'RG', 'E', 15.00, 30.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Piaçaba MARINA CROMADO', 'ACB-P-0002-CRO', 'CRO', NULL, 58.08, 88.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Piaçaba MARINA PRETO MATE', 'ACB-P-0002-P-M', 'P', 'M', 62.70, 95.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro ELETRICO HOT BRANCO', 'ACB-T-0013-B', 'B', NULL, 175.00, 350.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Barra de Apoio para Sanita 76cm', 'ACB-PS-0003', NULL, NULL, 64.20, 107.00, 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Porta-Rolos MARINA CROMADO', 'ACB-PR-0002-CRO', 'CRO', NULL, 29.70, 45.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Porta-Rolos MARINA PRETO MATE', 'ACB-PR-0002-P-M', 'P', 'M', 29.70, 45.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro ELETRICO CONFY CROMADO', 'ACB-T-0015-CRO', 'CRO', NULL, 200.00, 400.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro MARINA BARRA 35cm CROMADO', 'ACB-T-0005-CRO', 'CRO', NULL, 40.92, 62.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro MARINA BARRA 35cm PRETO MATE', 'ACB-T-0005-P-M', 'P', 'M', 40.92, 62.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro MARINA BARRA 45cm CROMADO', 'ACB-T-0006-CRO', 'CRO', NULL, 42.90, 65.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro MARINA BARRA 45cm PRETO MATE', 'ACB-T-0006-P-M', 'P', 'M', 42.90, 65.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro SMOOTH BIDE 25cm CROMADO', 'ACB-T-0004-CRO', 'CRO', NULL, 15.00, 30.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BIDE 25cm PRETO MATE', 'ACB-T-0004-P-M', 'P', 'M', 15.00, 30.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BIDE 25cm GUN METAL', 'ACB-T-0004-GMT', 'GMT', NULL, 17.50, 35.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BIDE 25cm BRANCO MATE', 'ACB-T-0004-B-M', 'B', 'M', 15.00, 30.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BIDE 25cm DOURADO ESCOVADO', 'ACB-T-0004-D-E', 'D', 'E', 17.50, 35.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BIDE 25cm ROSA GOLD ESCOVADO', 'ACB-T-0004-RG-E', 'RG', 'E', 17.50, 35.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH C/PRATELEIRA 60cm CROMADO', 'ACB-T-0003-CRO', 'CRO', NULL, 40.00, 80.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH C/PRATELEIRA 60cm PRETO MATE', 'ACB-T-0003-P-M', 'P', 'M', 50.00, 100.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH C/PRATELEIRA 60cm GUN METAL', 'ACB-T-0003-GMT', 'GMT', NULL, 55.00, 110.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH C/PRATELEIRA 60cm BRANCO MATE', 'ACB-T-0003-B-M', 'B', 'M', 50.00, 100.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH C/PRATELEIRA 60cm DOURADO ESCOVADO', 'ACB-T-0003-D-E', 'D', 'E', 55.00, 110.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH C/PRATELEIRA 60cm ROSA GOLD ESCOVADO', 'ACB-T-0003-RG-E', 'RG', 'E', 55.00, 110.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BARRA 45cm CROMADO', 'ACB-T-0001-CRO', 'CRO', NULL, 16.50, 33.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BARRA 45cm PRETO MATE', 'ACB-T-0001-P-M', 'P', 'M', 16.50, 33.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BARRA 45cm GUN METAL', 'ACB-T-0001-GMT', 'GMT', NULL, 19.00, 38.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BARRA 45cm BRANCO MATE', 'ACB-T-0001-B-M', 'B', 'M', 16.50, 33.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BARRA 45cm DOURADO ESCOVADO', 'ACB-T-0001-D-E', 'D', 'E', 19.00, 38.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BARRA 45cm ROSA GOLD ESCOVADO', 'ACB-T-0001-RG-E', 'RG', 'E', 19.00, 38.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro ELETRICO HOT PRETO', 'ACB-T-0013-P', 'P', NULL, 175.00, 350.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro MARINA BARRA 60cm CROMADO', 'ACB-T-0007-CRO', 'CRO', NULL, 46.20, 70.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro MARINA BARRA 60cm PRETO MATE', 'ACB-T-0007-P-M', 'P', 'M', 46.20, 70.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL MOSS 26cm CROMADO', 'ACB-T-0010-CRO', 'CRO', NULL, 19.98, 37.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL MOSS 26cm PRETO MATE', 'ACB-T-0010-P-M', 'P', 'M', 19.98, 37.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL MOSS 26cm BRANCO MATE', 'ACB-T-0010-B-M', 'B', 'M', 19.98, 37.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL MOSS 26cm DOURADO ESCOVADO', 'ACB-T-0010-D-E', 'D', 'E', 19.98, 37.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL MOSS 26cm ROSA GOLD ESCOVADO', 'ACB-T-0010-RG-E', 'RG', 'E', 19.98, 37.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Cabide SMOOTH CROMADO', 'ACB-C-0001-CRO', 'CRO', NULL, 10.00, 20.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Cabide SMOOTH PRETO MATE', 'ACB-C-0001-P-M', 'P', 'M', 10.00, 20.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Cabide SMOOTH GUN METAL', 'ACB-C-0001-GMT', 'GMT', NULL, 12.50, 25.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Cabide SMOOTH BRANCO MATE', 'ACB-C-0001-B-M', 'B', 'M', 10.00, 20.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Cabide SMOOTH DOURADO ESCOVADO', 'ACB-C-0001-D-E', 'D', 'E', 12.50, 25.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Cabide SMOOTH ROSA GOLD ESCOVADO', 'ACB-C-0001-RG-E', 'RG', 'E', 12.50, 25.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro DE PE ALTO MT CROMADO', 'ACB-T-0012-CRO', 'CRO', NULL, 103.62, 157.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE PE ALTO MT PRETO MATE', 'ACB-T-0012-P-M', 'P', 'M', 103.62, 157.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Auxiliar c/porta Rolo + Piaçaba DE PE ALTO CROMADO', 'ACB-A-0001-CRO', 'CRO', NULL, 85.14, 129.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Auxiliar c/porta Rolo + Piaçaba DE PE ALTO PRETO MATE', 'ACB-A-0001-P-M', 'P', 'M', 85.14, 129.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Cesto DE COLUNA DE DUCHE CROMADO', 'ACB-CE-0002-CRO', 'CRO', NULL, 22.20, 37.00, 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Piaçaba SMOOTH CROMADO', 'ACB-P-0001-CRO', 'CRO', NULL, 12.50, 25.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Piaçaba SMOOTH PRETO MATE', 'ACB-P-0001-P-M', 'P', 'M', 12.50, 25.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Piaçaba SMOOTH GUN METAL', 'ACB-P-0001-GMT', 'GMT', NULL, 12.50, 25.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Piaçaba SMOOTH BRANCO MATE', 'ACB-P-0001-B-M', 'B', 'M', 12.50, 25.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Piaçaba SMOOTH DOURADO ESCOVADO', 'ACB-P-0001-D-E', 'D', 'E', 12.50, 25.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Piaçaba SMOOTH ROSA GOLD ESCOVADO', 'ACB-P-0001-RG-E', 'RG', 'E', 12.50, 25.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro DE MOVEL MOSS 36cm CROMADO', 'ACB-T-0009-CRO', 'CRO', NULL, 19.98, 37.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL MOSS 36cm PRETO MATE', 'ACB-T-0009-P-M', 'P', 'M', 19.98, 37.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL MOSS 36cm BRANCO MATE', 'ACB-T-0009-B-M', 'B', 'M', 19.98, 37.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL MOSS 36cm DOURADO ESCOVADO', 'ACB-T-0009-D-E', 'D', 'E', 19.98, 37.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL MOSS 36cm ROSA GOLD ESCOVADO', 'ACB-T-0009-RG-E', 'RG', 'E', 19.98, 37.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Pega De Segurança 30cm CROMADO', 'ACB-PS-0001-CRO', 'CRO', NULL, 11.40, 19.00, 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Pega De Segurança 30cm PRETO MATE', 'ACB-PS-0001-P-M', 'P', 'M', 13.20, 22.00, 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Pega De Segurança 30cm GUN METAL', 'ACB-PS-0001-GMT', 'GMT', NULL, 16.20, 27.00, 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Pega De Segurança 30cm DOURADO ESCOVADO', 'ACB-PS-0001-D-E', 'D', 'E', 16.20, 27.00, 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Pega De Segurança 30cm ROSA GOLD ESCOVADO', 'ACB-PS-0001-RG-E', 'RG', 'E', 16.20, 27.00, 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Cadeira AJUSTADA', 'ACB-CA-0001', NULL, NULL, 51.48, 78.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Banco REBATIVEL', 'ACB-B-0001', NULL, NULL, 64.20, 107.00, 'GME', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro MARINA BIDE 15cm CROMADO', 'ACB-T-0008-CRO', 'CRO', NULL, 33.00, 50.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro MARINA BIDE 15cm PRETO MATE', 'ACB-T-0008-P-M', 'P', 'M', 33.00, 50.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL SAND 36cm CROMADO', 'ACB-T-0011-CRO', 'CRO', NULL, 25.92, 48.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL SAND 36cm PRETO MATE', 'ACB-T-0011-P-M', 'P', 'M', 25.92, 48.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL SAND 36cm BRANCO MATE', 'ACB-T-0011-B-M', 'B', 'M', 25.92, 48.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL SAND 36cm DOURADO ESCOVADO', 'ACB-T-0011-D-E', 'D', 'E', 25.92, 48.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro DE MOVEL SAND 36cm ROSA GOLD ESCOVADO', 'ACB-T-0011-RG-E', 'RG', 'E', 25.92, 48.00, 'Moovlux', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Toalheiro SMOOTH BARRA 60cm CROMADO', 'ACB-T-0002-CRO', 'CRO', NULL, 17.50, 35.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BARRA 60cm PRETO MATE', 'ACB-T-0002-P-M', 'P', 'M', 17.50, 35.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BARRA 60cm GUN METAL', 'ACB-T-0002-GMT', 'GMT', NULL, 20.00, 40.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BARRA 60cm BRANCO MATE', 'ACB-T-0002-B-M', 'B', 'M', 17.50, 35.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BARRA 60cm DOURADO ESCOVADO', 'ACB-T-0002-D-E', 'D', 'E', 20.00, 40.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Toalheiro SMOOTH BARRA 60cm ROSA GOLD ESCOVADO', 'ACB-T-0002-RG-E', 'RG', 'E', 20.00, 40.00, 'Rubicer', 'RUBICER, Lda.'),
    ('Cabide MARINA CROMADO', 'ACB-C-0002-CRO', 'CRO', NULL, 16.50, 25.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'),
    ('Cabide MARINA PRETO MATE', 'ACB-C-0002-P-M', 'P', 'M', 16.50, 25.00, 'Manillons Torrent', 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO')) AS e(nome, sku, cor, ton, custo, pvp, marca, fornecedor)
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

  -- 3. a subcategoria criada (Auxiliares) e a opção criada (ESCOVADO), uma vez cada e no sítio certo
  SELECT count(*) INTO v_n FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL AND public.fn_cat_chave_opcao(c.name) = 'auxiliares'
    AND c.name = 'Auxiliares' AND c.sigla = 'A' AND coalesce(c.is_active, true) AND c.path = lower(v_cat_nome) || '/' || c.slug;
  SELECT count(*) INTO v_m FROM product_categories c
  WHERE c.organization_id = c_org AND c.deleted_at IS NULL AND public.fn_cat_chave_opcao(c.name) = 'auxiliares';
  IF v_n <> 1 OR v_m <> 1 THEN RAISE EXCEPTION 'FALHOU: passo 3 — «Auxiliares»: % certas e % com esse nome na Mudelar (esperada 1).', v_n, v_m; END IF;
  SELECT count(*) INTO v_n FROM attribute_option_group_values o
  WHERE o.group_id = v_g_ton AND public.fn_cat_chave_opcao(o.value_text::text) = 'escovado' AND o.sigla = 'E' AND o.is_active;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FALHOU: passo 3 — ESCOVADO na Tonalidade da Mudelar: % (esperada 1, sigla E, ativa).', v_n; END IF;

  -- 4. SKUs únicos e no formato
  SELECT count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ '^ACB-(PR|P|T|C|PS|A|CE|CA|B)-[0-9]{4}(-[A-Z0-9]+){0,2}$' OR NOT p.sku_gerado)
    INTO v_n, v_m
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted;
  IF v_n <> c_total OR v_m > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — % SKUs distintos (esperados %), % fora do formato ou não gerados.', v_n, c_total, v_m;
  END IF;

  -- 5. siglas: categoria, subcategorias, opções
  IF (SELECT c.sigla FROM product_categories c WHERE c.id = v_cat) IS DISTINCT FROM 'ACB' THEN
    RAISE EXCEPTION 'FALHOU: passo 5 — a sigla de Acessórios de Casa de Banho não é ACB.';
  END IF;
  SELECT string_agg(e.nome || ': ' || coalesce(c.sigla, 'sem subcategoria') || ' em vez de ' || e.sigla, '; ') INTO v_txt
  FROM (VALUES ('PR', 'Porta-rolos', 8), ('P', 'Piaçaba', 8), ('T', 'Toalheiros', 52), ('C', 'Cabides', 8), ('PS', 'Pega De Segurança', 6), ('A', 'Auxiliares', 2), ('CE', 'Cestos', 1), ('CA', 'Cadeiras', 1), ('B', 'Bancos', 1)) AS e(sigla, nome, n)
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
                                AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(e.nome)
  WHERE c.sigla IS DISTINCT FROM e.sigla;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — siglas das subcategorias: %', v_txt; END IF;
  SELECT string_agg(e.papel || ' ' || e.nome || ': ' || coalesce(o.sigla, 'sem opção') || ' em vez de ' || e.codigo, '; ') INTO v_txt
  FROM (VALUES ('cor', 'Branco', 'B'), ('cor', 'Preto', 'P'), ('cor', 'Dourado', 'D'), ('cor', 'CROMO', 'CRO'), ('cor', 'Gun Metal', 'GMT'), ('cor', 'Rosa Gold', 'RG'), ('tonalidade', 'MATE', 'M'), ('tonalidade', 'ESCOVADO', 'E')) AS e(papel, nome, codigo)
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
  WHERE e.organization_id = c_org AND e.source = 'migration:acessorios_wc_mudelar' AND e.table_name = 'products'
    AND e.operation = 'INSERT'
    AND e.record_id IN (SELECT p.id FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs));
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 9 — a auditoria tem % dos % produtos com a fonte da importação.', v_n, c_total; END IF;
END $t$;

SELECT 'OK: acessórios de casa de banho da Mudelar (87 produtos, 26 modelos) conferidos nos passos 0 a 9.' AS resultado;

ROLLBACK;
