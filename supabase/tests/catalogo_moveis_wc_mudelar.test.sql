-- ============================================================
-- Testes: 20270120300000_catalogo_moveis_wc_mudelar.sql (base RH)
-- Ficheiro GERADO por script (gerar.js) a partir do Excel «Moveis & Arrumação Casa de Banho_Rev1.xlsx», como a migration.
-- ============================================================
-- ORDEM: correr ANTES do db push da 20270120300000 (falha no passo 0: as subcategorias de «Móveis & Arrumação Casa de
-- Banho» da Mudelar não têm produtos); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355) e, para provar que nada foi escrito fora dela, as outras organizações (só
-- contagens pelo xmin da transação da importação). Para comparar SKUs com cat_prever_sku_modelo usa, só nesta
-- transação, as claims de um membro ativo da Mudelar com products.edit (a função é só de leitura). Nenhuma chamada
-- recusada de propósito. Não assume que um atributo ou opção não existia: procura-os pelo nome.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_moveis_wc_mudelar.test.sql
--
-- O que PROVA:
--   1. 11397 produtos vivos nas 5 subcategorias (Móveis de lavatório 10226, Colunas 940, Espelhos 142, Tampos & Bancadas WC 84, Apliques LED 5); 176 modelos com os números e nomes do gerador
--      e o número certo de produtos cada.
--   2. Cada um dos 11397 produtos, pelo nome: subcategoria, modelo, exatamente os atributos do nome (pelo nome do
--      atributo e da opção; 45100 valores ao todo), custo e PVP com IVA 23 só quando o Excel os tem
--      (50 sem custo, 2 sem PVP), sem grossista/distribuidor a mais, marca, fornecedor preferido
--      (supplier_sku = código do fornecedor ou o SKU; preço = custo), descrição (a coluna «Atributos»), unidade un, active.
--   3. O SKU de cada produto é o que a regra do Catálogo recalcula do que está gravado (todos).
--   4. SKUs únicos e no formato MACB-(ML|C|E|TB|AL)-NNNN[-…], com NNNN = o número do modelo.
--   5. Siglas das subcategorias; os atributos usados são de lista (Medida: medida), entram no SKU e as opções usadas
--      estão ativas e com sigla.
--   6. Fornecedores e marcas existem uma vez cada na Mudelar.
--   7. Nenhuma linha de outra organização tem o xmin da transação que criou os produtos.
--   8. cat_prever_sku_modelo dá o SKU gravado para 200 móveis ao acaso e 25 produtos de outras categorias.
--   9. A auditoria tem a linha consolidada da importação (fonte migration:moveis_wc_mudelar).
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A importação foi aplicada? ───────────────────────────────────────────
DO $t0$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products p JOIN product_categories s ON s.id = p.subcategory_id
                 JOIN product_categories c ON c.id = s.parent_id
                 WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
                   AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao('Móveis & Arrumação Casa de Banho')) THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — as subcategorias de «Móveis & Arrumação Casa de Banho» da Mudelar não têm produtos (aplicar 20270120300000).';
  END IF;
END $t0$;

-- ─── 1 a 9 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_total constant integer := 11397;
  c_n_modelos constant integer := 176;
  c_n_valores constant integer := 45100;
  c_iva constant numeric := 23;
  v_cat uuid; v_subs uuid[]; v_n bigint; v_m bigint; v_txt text; v_xid text; v_auth uuid; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  SELECT c.id INTO v_cat FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND c.sigla = 'MACB'
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao('Móveis & Arrumação Casa de Banho');
  SELECT array_agg(c.id) INTO v_subs FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) IN (SELECT public.fn_cat_chave_opcao(e.nome) FROM (VALUES ('ML', 'Móveis de lavatório', 10226), ('C', 'Colunas', 940), ('E', 'Espelhos', 142), ('TB', 'Tampos & Bancadas WC', 84), ('AL', 'Apliques LED', 5)) AS e(sigla, nome, n));
  IF v_cat IS NULL OR cardinality(v_subs) IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'FALHOU: configuração da Mudelar incompleta (categoria MACB ou 5 subcategorias).';
  END IF;

  -- 1. quantos, por subcategoria e por modelo
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted;
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 1 — % produtos em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(e.nome || ': ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM (VALUES ('ML', 'Móveis de lavatório', 10226), ('C', 'Colunas', 940), ('E', 'Espelhos', 142), ('TB', 'Tampos & Bancadas WC', 84), ('AL', 'Apliques LED', 5)) AS e(sigla, nome, n)
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
                                AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(e.nome)
  LEFT JOIN (SELECT p.subcategory_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.subcategory_id) x ON x.subcategory_id = c.id
  WHERE coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — por subcategoria: %', v_txt; END IF;
  CREATE TEMP TABLE _tmv_modelos (sub text, numero smallint, nome text, n integer, PRIMARY KEY (sub, numero)) ON COMMIT DROP;
  INSERT INTO _tmv_modelos (sub, numero, nome, n) VALUES
    ('ML', 1, 'OMNI Suspenso 1 Pio / 2 Gav + Porta c/Lavatório Cerâmico', 522),
    ('ML', 2, 'OMNI Suspenso 1 Pio / 2 Gav + Porta c/Lavatório Misy', 522),
    ('ML', 3, 'IBIS Suspenso 1 Pio / 2 Gav + Cubo Aberto c/Lavatório Cerâmico', 522),
    ('ML', 4, 'IBIS Suspenso 1 Pio / 2 Gav + Cubo Aberto c/Lavatório Misy', 522),
    ('ML', 5, 'AXIS Suspenso 1 Pio / 2 Gav c/Lavatório Cerâmico', 504),
    ('ML', 6, 'AXIS Suspenso 1 Pio / 2 Gav c/Tampo', 504),
    ('ML', 7, 'AXIS Suspenso 1 Pio / 2 Gav c/Lavatório Misy', 252),
    ('ML', 8, 'AXIS Suspenso 2 Pios / 2 Gav c/Lavatório Cerâmico', 84),
    ('ML', 9, 'AXIS Suspenso 2 Pios / 2 Gav c/Tampo', 84),
    ('ML', 10, 'AXIS Suspenso 2 Pios / 2 Gav c/Lavatório Misy', 84),
    ('ML', 11, 'AXIS Suspenso 2 Pios / 4 Gav c/Lavatório Cerâmico', 84),
    ('ML', 12, 'AXIS Suspenso 2 Pios / 4 Gav c/Tampo', 84),
    ('ML', 13, 'AXIS Suspenso 2 Pios / 4 Gav c/Lavatório Misy', 84),
    ('ML', 14, 'AXIS Suspenso 2 Pios / 4 Gav (entrega 4/5 semanas) c/Tampo', 336),
    ('ML', 15, 'AXIS Suspenso 2 Pios / 4 Gav (entrega 4/5 semanas) c/Lavatório Misy', 84),
    ('ML', 16, 'AXIS Suspenso 2 Pios / 4 Gav (entrega 4/5 semanas) c/Lavatório Cerâmico', 84),
    ('ML', 17, 'AXIS Suspenso 1 Pio / 2 Gav c/Fundo Reduzido c/Lavatório Cerâmico', 252),
    ('ML', 18, 'AXIS c/Pés 1 Pio / 3 Gav c/Lavatório Cerâmico', 336),
    ('ML', 19, 'AXIS c/Pés 1 Pio / 3 Gav c/Lavatório Misy', 252),
    ('ML', 20, 'AXIS c/Pés 2 Pios / 3 Gav c/Lavatório Cerâmico', 84),
    ('ML', 21, 'AXIS c/Pés 2 Pios / 3 Gav c/Lavatório Misy', 84),
    ('ML', 22, 'AXIS c/Pés 2 Pios / 6 Gav (entrega 4/5 semanas) c/Lavatório Cerâmico', 84),
    ('ML', 23, 'AXIS c/Pés 2 Pios / 6 Gav (entrega 4/5 semanas) c/Lavatório Misy', 84),
    ('ML', 24, 'COIMBRA 1 Pio / 1 Porta + 2 Gav c/Lavatório Cerâmico', 84),
    ('ML', 25, 'COIMBRA 1 Pio / 1 Porta + 2 Gav c/Tampo', 84),
    ('ML', 26, 'COIMBRA 1 Pio / 2 Portas + 2 Gav c/Lavatório Cerâmico', 252),
    ('ML', 27, 'COIMBRA 1 Pio / 2 Portas + 2 Gav c/Tampo', 252),
    ('ML', 28, 'COIMBRA 1 Pio / 2 Portas + 4 Gav c/Lavatório Cerâmico', 84),
    ('ML', 29, 'COIMBRA 1 Pio / 2 Portas + 4 Gav c/Tampo', 84),
    ('ML', 30, 'COIMBRA 2 Pios / 2 Portas + 4 Gav c/Lavatório Cerâmico', 84),
    ('ML', 31, 'COIMBRA 2 Pios / 2 Portas + 4 Gav c/Tampo', 84),
    ('ML', 32, 'COIMBRA 1 Pio / 1 Porta + 2 Gav c/Fundo Reduzido c/Lavatório Cerâmico', 84),
    ('ML', 33, 'COIMBRA 1 Pio / 2 Portas + 2 Gav c/Fundo Reduzido c/Lavatório Cerâmico', 84),
    ('ML', 34, 'BRAGA c/Pés 1 Pio / 1 Porta c/1 Prat + 2 Gav c/Lavatório Cerâmico', 168),
    ('ML', 35, 'BRAGA c/Pés 1 Pio / 1 Porta c/1 Prat + 2 Gav c/Tampo', 168),
    ('ML', 36, 'BRAGA c/Pés 1 Pio / 2 Portas c/1 Prat + 2 Gav c/Lavatório Cerâmico', 252),
    ('ML', 37, 'BRAGA c/Pés 1 Pio / 2 Portas c/1 Prat + 2 Gav c/Tampo', 252),
    ('ML', 38, 'BRAGA c/Pés 1 Pio / 2 Portas c/1 Prat + 4 Gav c/Lavatório Cerâmico', 84),
    ('ML', 39, 'BRAGA c/Pés 1 Pio / 2 Portas c/1 Prat + 4 Gav c/Tampo', 84),
    ('ML', 40, 'BRAGA c/Pés 2 Pios / 2 Portas c/1 Prat + 4 Gav c/Lavatório Cerâmico', 84),
    ('ML', 41, 'BRAGA c/Pés 2 Pios / 2 Portas c/1 Prat + 4 Gav c/Tampo', 84),
    ('ML', 42, 'BRAGA c/Pés 1 Pio / 1 Porta c/1 Prat + 2 Gav c/Fundo Reduzido c/Lavatório Cerâmico', 84),
    ('ML', 43, 'BRAGA c/Pés 1 Pio / 2 Portas c/1 Prat + 2 Gav c/Fundo Reduzido c/Lavatório Cerâmico', 84),
    ('ML', 44, 'PORTO 1 Pio / 2 Portas c/Lavatório Cerâmico', 252),
    ('ML', 45, 'PORTO 1 Pio / 2 Portas c/Tampo', 252),
    ('ML', 46, 'PORTO 1 Pio / 3 Portas c/Lavatório Cerâmico', 168),
    ('ML', 47, 'PORTO 1 Pio / 3 Portas c/Tampo', 168),
    ('ML', 48, 'PORTO 2 Pios / 3 Portas c/Lavatório Cerâmico', 84),
    ('ML', 49, 'PORTO 2 Pios / 3 Portas c/Tampo', 84),
    ('ML', 50, 'PORTO 1 Pio / 2 Portas c/Fundo Reduzido c/Lavatório Cerâmico', 168),
    ('ML', 51, 'BEJA c/Pés 1 Pio / 2 Portas c/1 Prat c/Lavatório Cerâmico', 168),
    ('ML', 52, 'BEJA c/Pés 1 Pio / 3 Portas c/1 Prat c/Lavatório Cerâmico', 84),
    ('ML', 53, 'BREDA 1 cajón 27', 96),
    ('ML', 54, 'BREDA 1 cajón 42 y cajón interior', 96),
    ('ML', 55, 'BREDA 2 cajones simétricos', 144),
    ('ML', 56, 'BREDA 2 cajones asimétricos', 144),
    ('ML', 57, 'BREDA 3 cajones', 96),
    ('ML', 58, 'RIGA 1 cajón 27', 18),
    ('ML', 59, 'RIGA 1 cajón 42 y cajón interior', 18),
    ('ML', 60, 'RIGA 1 cajón - hueco inferior', 18),
    ('ML', 61, 'RIGA 2 cajones simétricos', 18),
    ('ML', 62, 'RIGA 2 cajones asimétricos', 18),
    ('ML', 63, 'RIGA 3 cajones', 18),
    ('ML', 64, 'MILANO 1 cajón 27', 6),
    ('ML', 65, 'MILANO 1 cajón 42 y cajón interior', 6),
    ('ML', 66, 'MILANO 2 cajones simétricos', 6),
    ('ML', 67, 'MILANO 2 cajones asimétricos', 6),
    ('ML', 68, 'MILANO 3 cajones', 6),
    ('ML', 69, 'MILANO 2 cajones - 1 puerta - Lavabo Esquerda', 3),
    ('ML', 70, 'MILANO 2 cajones - 1 puerta - Lavabo Direita', 3),
    ('ML', 71, 'MILANO 2 cajones - 1 puerta - Centrado - Porta Esquerda', 3),
    ('ML', 72, 'MILANO 2 cajones - 1 puerta - Centrado - Porta Direita', 3),
    ('ML', 73, 'MANÁ', 4),
    ('ML', 74, 'SIA', 4),
    ('ML', 75, 'ETNA', 4),
    ('ML', 76, 'ZAO', 4),
    ('ML', 77, 'VESUBIO', 4),
    ('C', 1, 'Suspensa AXIS', 84),
    ('C', 2, 'Lacado 1H (p/ Sia/Maná)', 1),
    ('C', 3, 'Lacado 3H (p/ Sia/Maná)', 1),
    ('C', 4, 'Lacado Puerta (p/ Sia/Maná)', 2),
    ('C', 5, 'Lacado Puerta+Hueco Bajo (p/ Sia/Maná)', 2),
    ('C', 6, 'Lacado Puerta+Hueco Alto (p/ Sia/Maná)', 2),
    ('C', 7, 'Melamina 1H (p/ Etna/Zao/Vesubio)', 1),
    ('C', 8, 'Melamina 3H (p/ Etna/Zao/Vesubio)', 1),
    ('C', 9, 'Melamina Puerta (p/ Etna/Zao/Vesubio)', 2),
    ('C', 10, 'Melamina Puerta+Hueco Bajo (p/ Etna/Zao/Vesubio)', 2),
    ('C', 11, 'Melamina Puerta+Hueco Alto (p/ Etna/Zao/Vesubio)', 2),
    ('C', 12, 'Line 2 Portas c/2 Prat', 84),
    ('C', 13, 'Line 4 Portas c/2 Prat', 84),
    ('C', 14, 'Alta Lux 2 Portas c/2 Prat + 2 Gav', 84),
    ('C', 15, 'Alta Lux 1 Porta c/1 Prat + 2 Gav + 1 Tulha', 84),
    ('C', 16, 'Alta Lux 4 Portas c/2 Prat + 2 Gav', 84),
    ('C', 17, 'Alta Lux 2 Portas c/2 Prat + 2 Gav + 1 Tulha', 84),
    ('C', 18, 'Baixa Lux 1 Gav + 1 Porta c/1 Prat', 84),
    ('C', 19, 'Baixa Lux 1 Gav + 1 Tulha', 168),
    ('C', 20, 'Baixa Lux 1 Gav + 2 Portas c/1 Prat', 84),
    ('E', 1, 'Rectangular Liso', 4),
    ('E', 2, 'Rectangular LED', 4),
    ('E', 3, 'Redondo Marco', 3),
    ('E', 4, 'Redondo Marco LED', 3),
    ('E', 5, 'Redondo Retroiluminado', 3),
    ('E', 6, 'Óvalo Liso', 1),
    ('E', 7, 'Óvalo Marco', 1),
    ('E', 8, 'Óvalo Repisa', 1),
    ('E', 9, 'Óvalo LED', 1),
    ('E', 10, 'Óvalo Marco LED', 1),
    ('E', 11, 'Óvalo Repisa LED', 1),
    ('E', 12, 'LIPI', 3),
    ('E', 13, 'Oval c/Moldura de 1cm', 1),
    ('E', 14, 'Circular c/Moldura de 3cm', 1),
    ('E', 15, 'Circular c/Moldura de 1cm', 1),
    ('E', 16, 'c/Moldura de 3cm', 3),
    ('E', 17, 'c/Moldura de 1cm', 4),
    ('E', 18, 'Round c/Cantos Redondos', 4),
    ('E', 19, 'Classic c/Moldura de 3cm', 4),
    ('E', 20, 'c/Prateleira', 5),
    ('E', 21, 'c/Orla Alumínio', 22),
    ('E', 22, 'LED Eris', 4),
    ('E', 23, 'LED MERCÚRIO', 2),
    ('E', 24, 'LED Plutão', 1),
    ('E', 25, 'LED MARTE', 5),
    ('E', 26, 'LED Urano', 3),
    ('E', 27, 'LED Lua', 1),
    ('E', 28, 'LED Neptuno', 3),
    ('E', 29, 'LED Calisto', 1),
    ('E', 30, 'LED Sol', 3),
    ('E', 31, 'LED Verona', 1),
    ('E', 32, 'LED Latina', 4),
    ('E', 33, 'LED Trentino', 12),
    ('E', 34, 'LED Roma', 3),
    ('E', 35, 'LED Milão', 3),
    ('E', 36, 'LED Florença', 3),
    ('E', 37, 'LED Modena', 4),
    ('E', 38, 'LED Rimini', 4),
    ('E', 39, 'LED Tivoli', 4),
    ('E', 40, 'LED Lucci', 3),
    ('E', 41, 'LED Bari', 4),
    ('E', 42, 'LED Vinci', 3),
    ('TB', 1, 'BREDA de tablero a medida', 6),
    ('TB', 2, 'BREDA sem lavabo Solid Bath a medida', 6),
    ('TB', 3, 'BREDA porcelana Munich dupla', 1),
    ('TB', 4, 'BREDA porcelana Bonn Verde Olivo', 1),
    ('TB', 5, 'BREDA porcelana Bremen Negro', 1),
    ('TB', 6, 'BREDA Solid Bath Toulon', 1),
    ('TB', 7, 'BREDA porcelana Munich Centrado', 6),
    ('TB', 8, 'RIGA Solid Bath Rondo', 1),
    ('TB', 9, 'RIGA Solid Bath Oh', 1),
    ('TB', 10, 'RIGA porcelana Alice Centrado', 6),
    ('TB', 11, 'RIGA porcelana Berlin Centrado', 6),
    ('TB', 12, 'MILANO tablero estándar', 6),
    ('TB', 13, 'MILANO porcelana Olfer', 1),
    ('TB', 14, 'MILANO Solid Bath Alice Desplazado Izq.', 3),
    ('TB', 15, 'MILANO mineral Pilsen Negro', 3),
    ('TB', 16, 'Estrutura Suspendida Inferior MILANO', 3),
    ('TB', 17, 'Repisa Estrutura MILANO', 3),
    ('TB', 18, 'Melamina (p/ Etna/Zao/Vesubio)', 6),
    ('TB', 19, 'Piedra Compacta (Resina) (p/ Maná/Sia)', 6),
    ('TB', 20, 'Serviço de Corte de Encimera Personalizado', 1),
    ('TB', 21, 'Serviço de Perfuração de Encimera para Lavabo', 1),
    ('TB', 22, 'Cerámica ST', 3),
    ('TB', 23, 'Cerámica ST Desplazado Izquierda', 1),
    ('TB', 24, 'Cerámica ST Desplazado Derecha', 1),
    ('TB', 25, 'Cerámica ST 2 Senos', 1),
    ('TB', 26, 'Resina HE+', 3),
    ('TB', 27, 'Resina Round', 1),
    ('TB', 28, 'Resina Libra', 1),
    ('TB', 29, 'Resina Ronda', 1),
    ('TB', 30, 'Resina Oval', 1),
    ('TB', 31, 'Resina Kuvic', 1),
    ('TB', 32, 'Resina Kuvic XL', 1),
    ('AL', 1, 'LED Lara Cromado', 1),
    ('AL', 2, 'LED Dourado', 1),
    ('AL', 3, 'LED Preto', 1),
    ('AL', 4, 'LED Beatriz', 1),
    ('AL', 5, 'LED Ana', 1);
  SELECT string_agg(e.sub || lpad(e.numero::text, 4, '0') || ' ' || e.nome || ': ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM _tmv_modelos e
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL AND c.sigla = e.sub
  LEFT JOIN product_models pm ON pm.organization_id = c_org AND pm.subcategory_id = c.id AND pm.deleted_at IS NULL
                             AND pm.numero = e.numero AND pm.name = e.nome AND pm.is_active
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.model_id) x ON x.model_id = pm.id
  WHERE coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — por modelo: %', left(v_txt, 1500); END IF;
  SELECT count(*) INTO v_n FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id = ANY (v_subs);
  IF v_n <> c_n_modelos THEN RAISE EXCEPTION 'FALHOU: passo 1 — % modelos nas subcategorias em vez de %.', v_n, c_n_modelos; END IF;

  -- 2. cada produto, pelo nome
  -- os nomes do Excel partidos em « - » (cada linha guarda os números dos pedaços) e as combinações de atributos
  -- («Atributo=Opção;…», a Medida como «80 × 50 × 45 cm»)
  CREATE TEMP TABLE _tmv_nomes (n integer PRIMARY KEY, texto text NOT NULL) ON COMMIT DROP;
  INSERT INTO _tmv_nomes (n, texto) VALUES
    (1, 'Móvel OMNI Suspenso 80x50x45'),
    (2, '1 Pio Esquerdo / 2 Gav + Porta (60+20)'),
    (3, 'Corpo White, Frente White c/Lavatório Cerâmico'),
    (4, 'Corpo White, Frente White c/Lavatório Misy'),
    (5, 'Corpo White, Frente Azabache c/Lavatório Cerâmico'),
    (6, 'Corpo White, Frente Azabache c/Lavatório Misy'),
    (7, 'Corpo White, Frente Denver c/Lavatório Cerâmico'),
    (8, 'Corpo White, Frente Denver c/Lavatório Misy'),
    (9, 'Corpo White, Frente Branco Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (10, 'Corpo White, Frente Branco Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (11, 'Corpo White, Frente Branco Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (12, 'Corpo White, Frente Branco Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (13, 'Corpo White, Frente Cinza Claro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (14, 'Corpo White, Frente Cinza Claro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (15, 'Corpo White, Frente Cinza Claro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (16, 'Corpo White, Frente Cinza Claro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (17, 'Corpo White, Frente Cinza Médio Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (18, 'Corpo White, Frente Cinza Médio Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (19, 'Corpo White, Frente Cinza Médio Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (20, 'Corpo White, Frente Cinza Médio Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (21, 'Corpo White, Frente Antracite Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (22, 'Corpo White, Frente Antracite Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (23, 'Corpo White, Frente Antracite Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (24, 'Corpo White, Frente Antracite Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (25, 'Corpo White, Frente Preto Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (26, 'Corpo White, Frente Preto Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (27, 'Corpo White, Frente Preto Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (28, 'Corpo White, Frente Preto Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (29, 'Corpo White, Frente Creme Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (30, 'Corpo White, Frente Creme Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (31, 'Corpo White, Frente Creme Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (32, 'Corpo White, Frente Creme Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (33, 'Corpo White, Frente Camel Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (34, 'Corpo White, Frente Camel Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (35, 'Corpo White, Frente Camel Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (36, 'Corpo White, Frente Camel Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (37, 'Corpo White, Frente Ouro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (38, 'Corpo White, Frente Ouro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (39, 'Corpo White, Frente Ouro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (40, 'Corpo White, Frente Ouro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (41, 'Corpo White, Frente Cobre Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (42, 'Corpo White, Frente Cobre Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (43, 'Corpo White, Frente Cobre Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (44, 'Corpo White, Frente Cobre Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (45, 'Corpo White, Frente Chocolate Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (46, 'Corpo White, Frente Chocolate Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (47, 'Corpo White, Frente Chocolate Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (48, 'Corpo White, Frente Chocolate Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (49, 'Corpo White, Frente Verde Água Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (50, 'Corpo White, Frente Verde Água Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (51, 'Corpo White, Frente Verde Água Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (52, 'Corpo White, Frente Verde Água Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (53, 'Corpo White, Frente Azeitona Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (54, 'Corpo White, Frente Azeitona Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (55, 'Corpo White, Frente Azeitona Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (56, 'Corpo White, Frente Azeitona Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (57, 'Corpo White, Frente Azul Mar Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (58, 'Corpo White, Frente Azul Mar Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (59, 'Corpo White, Frente Azul Mar Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (60, 'Corpo White, Frente Azul Mar Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (61, 'Corpo White, Frente Azul Escuro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (62, 'Corpo White, Frente Azul Escuro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (63, 'Corpo White, Frente Azul Escuro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (64, 'Corpo White, Frente Azul Escuro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (65, 'Corpo White, Frente Prata Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (66, 'Corpo White, Frente Prata Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (67, 'Corpo White, Frente Prata Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (68, 'Corpo White, Frente Prata Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (69, 'Corpo White, Frente Rosa Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (70, 'Corpo White, Frente Rosa Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (71, 'Corpo White, Frente Rosa Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (72, 'Corpo White, Frente Rosa Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (73, 'Corpo White, Frente Vermelho Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (74, 'Corpo White, Frente Vermelho Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (75, 'Corpo White, Frente Vermelho Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (76, 'Corpo White, Frente Vermelho Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (77, 'Corpo White, Frente Oak (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (78, 'Corpo White, Frente Oak (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (79, 'Corpo White, Frente Tea (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (80, 'Corpo White, Frente Tea (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (81, 'Corpo White, Frente Joplim (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (82, 'Corpo White, Frente Joplim (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (83, 'Corpo White, Frente Black (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (84, 'Corpo White, Frente Black (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (85, 'Corpo White, Frente Artisan (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (86, 'Corpo White, Frente Artisan (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (87, 'Corpo White, Frente Lincoln (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (88, 'Corpo White, Frente Lincoln (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (89, 'Corpo White, Frente Halifax (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (90, 'Corpo White, Frente Halifax (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (91, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (92, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (93, 'Corpo e Frente Branco Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (94, 'Corpo e Frente Branco Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (95, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (96, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (97, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (98, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (99, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (100, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (101, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (102, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (103, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (104, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (105, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (106, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (107, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (108, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (109, 'Corpo e Frente Preto Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (110, 'Corpo e Frente Preto Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (111, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (112, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (113, 'Corpo e Frente Creme Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (114, 'Corpo e Frente Creme Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (115, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (116, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (117, 'Corpo e Frente Camel Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (118, 'Corpo e Frente Camel Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (119, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (120, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (121, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (122, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (123, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (124, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (125, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (126, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (127, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (128, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (129, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (130, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (131, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (132, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (133, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (134, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (135, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (136, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (137, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (138, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (139, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (140, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (141, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (142, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (143, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (144, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (145, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (146, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (147, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (148, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (149, 'Corpo e Frente Prata Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (150, 'Corpo e Frente Prata Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (151, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (152, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (153, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (154, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (155, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (156, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (157, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (158, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (159, 'Corpo e Frente Oak (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (160, 'Corpo e Frente Oak (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (161, 'Corpo e Frente Tea (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (162, 'Corpo e Frente Tea (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (163, 'Corpo e Frente Joplim (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (164, 'Corpo e Frente Joplim (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (165, 'Corpo e Frente Azabache (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (166, 'Corpo e Frente Azabache (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (167, 'Corpo e Frente Denver (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (168, 'Corpo e Frente Denver (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (169, 'Corpo e Frente Black (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (170, 'Corpo e Frente Black (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (171, 'Corpo e Frente Artisan (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (172, 'Corpo e Frente Artisan (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (173, 'Corpo e Frente Lincoln (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (174, 'Corpo e Frente Lincoln (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (175, 'Corpo e Frente Halifax (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (176, 'Corpo e Frente Halifax (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Lavatório Misy'),
    (177, '1 Pio Direito (+20% PVP) / 2 Gav + Porta (60+20)'),
    (178, 'Móvel OMNI Suspenso 100x50x45'),
    (179, '1 Pio Esquerdo / 2 Gav + Porta (70+30)'),
    (180, '1 Pio Direito (+20% PVP) / 2 Gav + Porta (70+30)'),
    (181, 'Móvel OMNI Suspenso 120x50x45'),
    (182, '1 Pio Esquerdo / 2 Gav + Porta (80+40)'),
    (183, '1 Pio Direito (+20% PVP) / 2 Gav + Porta (80+40)'),
    (184, 'Móvel IBIS Suspenso 80x50x45'),
    (185, '1 Pio Direito / 2 Gav + Cubo Aberto (60+20)'),
    (186, 'Corpo White, Frente Denver (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (187, 'Corpo White, Frente Denver (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (188, '1 Pio Esquerdo (+20% PVP) / 2 Gav + Cubo Aberto (60+20)'),
    (189, 'Móvel IBIS Suspenso 100x50x45'),
    (190, '1 Pio Direito / 2 Gav + Cubo Aberto (70+30)'),
    (191, '1 Pio Esquerdo (+20% PVP) / 2 Gav + Cubo Aberto (70+30)'),
    (192, 'Móvel IBIS Suspenso 120x50x45'),
    (193, '1 Pio Direito / 2 Gav + Cubo Aberto (80+40)'),
    (194, '1 Pio Esquerdo (+20% PVP) / 2 Gav + Cubo Aberto (80+40)'),
    (195, 'Móvel AXIS Suspenso 60x50x45'),
    (196, '1 Pio / 2 Gav'),
    (197, 'Todo Branco Lacado c/Lavatório Cerâmico'),
    (198, 'Todo Tea c/Lavatório Cerâmico'),
    (199, 'Todo Oak c/Lavatório Cerâmico'),
    (200, 'Todo Joplim c/Lavatório Cerâmico'),
    (201, 'Corpo Todo Branco Lacado, Frente Branco Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (202, 'Corpo Todo Branco Lacado, Frente Branco Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (203, 'Corpo Todo Branco Lacado, Frente Cinza Claro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (204, 'Corpo Todo Branco Lacado, Frente Cinza Claro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (205, 'Corpo Todo Branco Lacado, Frente Cinza Médio Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (206, 'Corpo Todo Branco Lacado, Frente Cinza Médio Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (207, 'Corpo Todo Branco Lacado, Frente Antracite Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (208, 'Corpo Todo Branco Lacado, Frente Antracite Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (209, 'Corpo Todo Branco Lacado, Frente Preto Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (210, 'Corpo Todo Branco Lacado, Frente Preto Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (211, 'Corpo Todo Branco Lacado, Frente Creme Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (212, 'Corpo Todo Branco Lacado, Frente Creme Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (213, 'Corpo Todo Branco Lacado, Frente Camel Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (214, 'Corpo Todo Branco Lacado, Frente Camel Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (215, 'Corpo Todo Branco Lacado, Frente Ouro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (216, 'Corpo Todo Branco Lacado, Frente Ouro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (217, 'Corpo Todo Branco Lacado, Frente Cobre Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (218, 'Corpo Todo Branco Lacado, Frente Cobre Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (219, 'Corpo Todo Branco Lacado, Frente Chocolate Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (220, 'Corpo Todo Branco Lacado, Frente Chocolate Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (221, 'Corpo Todo Branco Lacado, Frente Verde Água Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (222, 'Corpo Todo Branco Lacado, Frente Verde Água Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (223, 'Corpo Todo Branco Lacado, Frente Azeitona Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (224, 'Corpo Todo Branco Lacado, Frente Azeitona Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (225, 'Corpo Todo Branco Lacado, Frente Azul Mar Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (226, 'Corpo Todo Branco Lacado, Frente Azul Mar Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (227, 'Corpo Todo Branco Lacado, Frente Azul Escuro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (228, 'Corpo Todo Branco Lacado, Frente Azul Escuro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (229, 'Corpo Todo Branco Lacado, Frente Prata Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (230, 'Corpo Todo Branco Lacado, Frente Prata Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (231, 'Corpo Todo Branco Lacado, Frente Rosa Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (232, 'Corpo Todo Branco Lacado, Frente Rosa Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (233, 'Corpo Todo Branco Lacado, Frente Vermelho Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (234, 'Corpo Todo Branco Lacado, Frente Vermelho Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (235, 'Corpo Todo Branco Lacado, Frente Azabache (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (236, 'Corpo Todo Branco Lacado, Frente Denver (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (237, 'Corpo Todo Branco Lacado, Frente Black (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (238, 'Corpo Todo Branco Lacado, Frente Artisan (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (239, 'Corpo Todo Branco Lacado, Frente Lincoln (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (240, 'Corpo Todo Branco Lacado, Frente Halifax (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (241, 'Todo Branco Lacado c/Tampo'),
    (242, 'Todo Tea c/Tampo'),
    (243, 'Todo Oak c/Tampo'),
    (244, 'Todo Joplim c/Tampo'),
    (245, 'Corpo Todo Branco Lacado, Frente Branco Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (246, 'Corpo Todo Branco Lacado, Frente Branco Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (247, 'Corpo Todo Branco Lacado, Frente Cinza Claro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (248, 'Corpo Todo Branco Lacado, Frente Cinza Claro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (249, 'Corpo Todo Branco Lacado, Frente Cinza Médio Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (250, 'Corpo Todo Branco Lacado, Frente Cinza Médio Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (251, 'Corpo Todo Branco Lacado, Frente Antracite Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (252, 'Corpo Todo Branco Lacado, Frente Antracite Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (253, 'Corpo Todo Branco Lacado, Frente Preto Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (254, 'Corpo Todo Branco Lacado, Frente Preto Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (255, 'Corpo Todo Branco Lacado, Frente Creme Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (256, 'Corpo Todo Branco Lacado, Frente Creme Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (257, 'Corpo Todo Branco Lacado, Frente Camel Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (258, 'Corpo Todo Branco Lacado, Frente Camel Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (259, 'Corpo Todo Branco Lacado, Frente Ouro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (260, 'Corpo Todo Branco Lacado, Frente Ouro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (261, 'Corpo Todo Branco Lacado, Frente Cobre Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (262, 'Corpo Todo Branco Lacado, Frente Cobre Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (263, 'Corpo Todo Branco Lacado, Frente Chocolate Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (264, 'Corpo Todo Branco Lacado, Frente Chocolate Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (265, 'Corpo Todo Branco Lacado, Frente Verde Água Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (266, 'Corpo Todo Branco Lacado, Frente Verde Água Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (267, 'Corpo Todo Branco Lacado, Frente Azeitona Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (268, 'Corpo Todo Branco Lacado, Frente Azeitona Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (269, 'Corpo Todo Branco Lacado, Frente Azul Mar Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (270, 'Corpo Todo Branco Lacado, Frente Azul Mar Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (271, 'Corpo Todo Branco Lacado, Frente Azul Escuro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (272, 'Corpo Todo Branco Lacado, Frente Azul Escuro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (273, 'Corpo Todo Branco Lacado, Frente Prata Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (274, 'Corpo Todo Branco Lacado, Frente Prata Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (275, 'Corpo Todo Branco Lacado, Frente Rosa Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (276, 'Corpo Todo Branco Lacado, Frente Rosa Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (277, 'Corpo Todo Branco Lacado, Frente Vermelho Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (278, 'Corpo Todo Branco Lacado, Frente Vermelho Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (279, 'Corpo Todo Branco Lacado, Frente Azabache (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (280, 'Corpo Todo Branco Lacado, Frente Denver (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (281, 'Corpo Todo Branco Lacado, Frente Black (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (282, 'Corpo Todo Branco Lacado, Frente Artisan (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (283, 'Corpo Todo Branco Lacado, Frente Lincoln (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (284, 'Corpo Todo Branco Lacado, Frente Halifax (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Tampo'),
    (285, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (286, 'Corpo e Frente Branco Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (287, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (288, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (289, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (290, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (291, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (292, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (293, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (294, 'Corpo e Frente Preto Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (295, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (296, 'Corpo e Frente Creme Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (297, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (298, 'Corpo e Frente Camel Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (299, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (300, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (301, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (302, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (303, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (304, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (305, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (306, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (307, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (308, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (309, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (310, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (311, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (312, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (313, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (314, 'Corpo e Frente Prata Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (315, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (316, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (317, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (318, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (319, 'Corpo e Frente Azabache (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (320, 'Corpo e Frente Denver (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (321, 'Corpo e Frente Black (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (322, 'Corpo e Frente Artisan (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (323, 'Corpo e Frente Lincoln (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (324, 'Corpo e Frente Halifax (Lacado/Melamina, +90€, entrega 4/5 sem.) c/Tampo'),
    (325, 'Móvel AXIS Suspenso 70x50x45'),
    (326, 'Móvel AXIS Suspenso 80x50x45'),
    (327, 'Todo Branco Lacado c/Lavatório Misy'),
    (328, 'Todo Tea c/Lavatório Misy'),
    (329, 'Todo Oak c/Lavatório Misy'),
    (330, 'Todo Joplim c/Lavatório Misy'),
    (331, 'Corpo Todo Branco Lacado, Frente Branco Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (332, 'Corpo Todo Branco Lacado, Frente Branco Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (333, 'Corpo Todo Branco Lacado, Frente Cinza Claro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (334, 'Corpo Todo Branco Lacado, Frente Cinza Claro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (335, 'Corpo Todo Branco Lacado, Frente Cinza Médio Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (336, 'Corpo Todo Branco Lacado, Frente Cinza Médio Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (337, 'Corpo Todo Branco Lacado, Frente Antracite Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (338, 'Corpo Todo Branco Lacado, Frente Antracite Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (339, 'Corpo Todo Branco Lacado, Frente Preto Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (340, 'Corpo Todo Branco Lacado, Frente Preto Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (341, 'Corpo Todo Branco Lacado, Frente Creme Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (342, 'Corpo Todo Branco Lacado, Frente Creme Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (343, 'Corpo Todo Branco Lacado, Frente Camel Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (344, 'Corpo Todo Branco Lacado, Frente Camel Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (345, 'Corpo Todo Branco Lacado, Frente Ouro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (346, 'Corpo Todo Branco Lacado, Frente Ouro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (347, 'Corpo Todo Branco Lacado, Frente Cobre Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (348, 'Corpo Todo Branco Lacado, Frente Cobre Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (349, 'Corpo Todo Branco Lacado, Frente Chocolate Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (350, 'Corpo Todo Branco Lacado, Frente Chocolate Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (351, 'Corpo Todo Branco Lacado, Frente Verde Água Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (352, 'Corpo Todo Branco Lacado, Frente Verde Água Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (353, 'Corpo Todo Branco Lacado, Frente Azeitona Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (354, 'Corpo Todo Branco Lacado, Frente Azeitona Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (355, 'Corpo Todo Branco Lacado, Frente Azul Mar Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (356, 'Corpo Todo Branco Lacado, Frente Azul Mar Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (357, 'Corpo Todo Branco Lacado, Frente Azul Escuro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (358, 'Corpo Todo Branco Lacado, Frente Azul Escuro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (359, 'Corpo Todo Branco Lacado, Frente Prata Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (360, 'Corpo Todo Branco Lacado, Frente Prata Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (361, 'Corpo Todo Branco Lacado, Frente Rosa Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (362, 'Corpo Todo Branco Lacado, Frente Rosa Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (363, 'Corpo Todo Branco Lacado, Frente Vermelho Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (364, 'Corpo Todo Branco Lacado, Frente Vermelho Mate (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (365, 'Corpo Todo Branco Lacado, Frente Azabache (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (366, 'Corpo Todo Branco Lacado, Frente Denver (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (367, 'Corpo Todo Branco Lacado, Frente Black (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (368, 'Corpo Todo Branco Lacado, Frente Artisan (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (369, 'Corpo Todo Branco Lacado, Frente Lincoln (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (370, 'Corpo Todo Branco Lacado, Frente Halifax (Lacado/Melamina, +50€, entrega 4/5 sem.) c/Lavatório Misy'),
    (371, 'Móvel AXIS Suspenso 90x50x45'),
    (372, 'Móvel AXIS Suspenso 100x50x45'),
    (373, 'Móvel AXIS Suspenso 120x50x45'),
    (374, '2 Pios / 2 Gav'),
    (375, '2 Pios / 4 Gav'),
    (376, 'Móvel AXIS Suspenso 140x50x45'),
    (377, '2 Pios / 4 Gav (entrega 4/5 semanas)'),
    (378, 'Móvel AXIS Suspenso 150x50x45'),
    (379, 'Móvel AXIS Suspenso 160x50x45'),
    (380, 'Móvel AXIS Suspenso 180x50x45'),
    (381, 'Móvel AXIS Suspenso 60x50x36'),
    (382, '1 Pio / 2 Gav c/Fundo Reduzido'),
    (383, 'Móvel AXIS Suspenso 80x50x36'),
    (384, 'Móvel AXIS Suspenso 100x50x36'),
    (385, 'Móvel AXIS c/Pés 60x81x45'),
    (386, '1 Pio / 3 Gav'),
    (387, 'Móvel AXIS c/Pés 80x81x45'),
    (388, 'Móvel AXIS c/Pés 100x81x45'),
    (389, 'Móvel AXIS c/Pés 120x81x45'),
    (390, '2 Pios / 3 Gav'),
    (391, '2 Pios / 6 Gav (entrega 4/5 semanas)'),
    (392, 'Móvel COIMBRA 60x50x45'),
    (393, '1 Pio / 1 Porta + 2 Gav'),
    (394, 'Todo Branco c/Lavatório Cerâmico'),
    (395, 'Corpo Todo Branco, Frente Branco Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (396, 'Corpo Todo Branco, Frente Branco Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (397, 'Corpo Todo Branco, Frente Cinza Claro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (398, 'Corpo Todo Branco, Frente Cinza Claro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (399, 'Corpo Todo Branco, Frente Cinza Médio Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (400, 'Corpo Todo Branco, Frente Cinza Médio Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (401, 'Corpo Todo Branco, Frente Antracite Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (402, 'Corpo Todo Branco, Frente Antracite Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (403, 'Corpo Todo Branco, Frente Preto Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (404, 'Corpo Todo Branco, Frente Preto Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (405, 'Corpo Todo Branco, Frente Creme Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (406, 'Corpo Todo Branco, Frente Creme Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (407, 'Corpo Todo Branco, Frente Camel Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (408, 'Corpo Todo Branco, Frente Camel Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (409, 'Corpo Todo Branco, Frente Ouro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (410, 'Corpo Todo Branco, Frente Ouro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (411, 'Corpo Todo Branco, Frente Cobre Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (412, 'Corpo Todo Branco, Frente Cobre Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (413, 'Corpo Todo Branco, Frente Chocolate Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (414, 'Corpo Todo Branco, Frente Chocolate Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (415, 'Corpo Todo Branco, Frente Verde Água Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (416, 'Corpo Todo Branco, Frente Verde Água Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (417, 'Corpo Todo Branco, Frente Azeitona Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (418, 'Corpo Todo Branco, Frente Azeitona Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (419, 'Corpo Todo Branco, Frente Azul Mar Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (420, 'Corpo Todo Branco, Frente Azul Mar Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (421, 'Corpo Todo Branco, Frente Azul Escuro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (422, 'Corpo Todo Branco, Frente Azul Escuro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (423, 'Corpo Todo Branco, Frente Prata Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (424, 'Corpo Todo Branco, Frente Prata Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (425, 'Corpo Todo Branco, Frente Rosa Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (426, 'Corpo Todo Branco, Frente Rosa Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (427, 'Corpo Todo Branco, Frente Vermelho Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (428, 'Corpo Todo Branco, Frente Vermelho Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (429, 'Corpo Todo Branco, Frente Azabache (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (430, 'Corpo Todo Branco, Frente Denver (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (431, 'Corpo Todo Branco, Frente Black (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (432, 'Corpo Todo Branco, Frente Artisan (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (433, 'Corpo Todo Branco, Frente Lincoln (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (434, 'Corpo Todo Branco, Frente Halifax (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (435, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (436, 'Corpo e Frente Branco Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (437, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (438, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (439, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (440, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (441, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (442, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (443, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (444, 'Corpo e Frente Preto Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (445, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (446, 'Corpo e Frente Creme Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (447, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (448, 'Corpo e Frente Camel Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (449, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (450, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (451, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (452, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (453, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (454, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (455, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (456, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (457, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (458, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (459, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (460, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (461, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (462, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (463, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (464, 'Corpo e Frente Prata Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (465, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (466, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (467, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (468, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (469, 'Corpo e Frente Azabache (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (470, 'Corpo e Frente Denver (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (471, 'Corpo e Frente Black (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (472, 'Corpo e Frente Artisan (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (473, 'Corpo e Frente Lincoln (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (474, 'Corpo e Frente Halifax (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Lavatório Cerâmico'),
    (475, 'Todo Branco c/Tampo'),
    (476, 'Corpo Todo Branco, Frente Branco Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (477, 'Corpo Todo Branco, Frente Branco Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (478, 'Corpo Todo Branco, Frente Cinza Claro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (479, 'Corpo Todo Branco, Frente Cinza Claro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (480, 'Corpo Todo Branco, Frente Cinza Médio Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (481, 'Corpo Todo Branco, Frente Cinza Médio Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (482, 'Corpo Todo Branco, Frente Antracite Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (483, 'Corpo Todo Branco, Frente Antracite Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (484, 'Corpo Todo Branco, Frente Preto Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (485, 'Corpo Todo Branco, Frente Preto Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (486, 'Corpo Todo Branco, Frente Creme Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (487, 'Corpo Todo Branco, Frente Creme Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (488, 'Corpo Todo Branco, Frente Camel Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (489, 'Corpo Todo Branco, Frente Camel Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (490, 'Corpo Todo Branco, Frente Ouro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (491, 'Corpo Todo Branco, Frente Ouro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (492, 'Corpo Todo Branco, Frente Cobre Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (493, 'Corpo Todo Branco, Frente Cobre Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (494, 'Corpo Todo Branco, Frente Chocolate Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (495, 'Corpo Todo Branco, Frente Chocolate Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (496, 'Corpo Todo Branco, Frente Verde Água Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (497, 'Corpo Todo Branco, Frente Verde Água Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (498, 'Corpo Todo Branco, Frente Azeitona Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (499, 'Corpo Todo Branco, Frente Azeitona Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (500, 'Corpo Todo Branco, Frente Azul Mar Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (501, 'Corpo Todo Branco, Frente Azul Mar Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (502, 'Corpo Todo Branco, Frente Azul Escuro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (503, 'Corpo Todo Branco, Frente Azul Escuro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (504, 'Corpo Todo Branco, Frente Prata Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (505, 'Corpo Todo Branco, Frente Prata Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (506, 'Corpo Todo Branco, Frente Rosa Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (507, 'Corpo Todo Branco, Frente Rosa Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (508, 'Corpo Todo Branco, Frente Vermelho Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (509, 'Corpo Todo Branco, Frente Vermelho Mate (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (510, 'Corpo Todo Branco, Frente Azabache (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (511, 'Corpo Todo Branco, Frente Denver (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (512, 'Corpo Todo Branco, Frente Black (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (513, 'Corpo Todo Branco, Frente Artisan (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (514, 'Corpo Todo Branco, Frente Lincoln (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (515, 'Corpo Todo Branco, Frente Halifax (Lacado/Melamina, +80€, entrega 4/5 sem.) c/Tampo'),
    (516, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (517, 'Corpo e Frente Branco Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (518, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (519, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (520, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (521, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (522, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (523, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (524, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (525, 'Corpo e Frente Preto Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (526, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (527, 'Corpo e Frente Creme Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (528, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (529, 'Corpo e Frente Camel Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (530, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (531, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (532, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (533, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (534, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (535, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (536, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (537, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (538, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (539, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (540, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (541, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (542, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (543, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (544, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (545, 'Corpo e Frente Prata Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (546, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (547, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (548, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (549, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (550, 'Corpo e Frente Azabache (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (551, 'Corpo e Frente Denver (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (552, 'Corpo e Frente Black (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (553, 'Corpo e Frente Artisan (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (554, 'Corpo e Frente Lincoln (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (555, 'Corpo e Frente Halifax (Lacado/Melamina, +120€, entrega 4/5 sem.) c/Tampo'),
    (556, 'Móvel COIMBRA 70x50x45'),
    (557, '1 Pio / 2 Portas + 2 Gav'),
    (558, 'Móvel COIMBRA 80x50x45'),
    (559, 'Móvel COIMBRA 100x50x45'),
    (560, 'Móvel COIMBRA 120x50x45'),
    (561, '1 Pio / 2 Portas + 4 Gav'),
    (562, '2 Pios / 2 Portas + 4 Gav'),
    (563, 'Móvel COIMBRA 60x50x36'),
    (564, '1 Pio / 1 Porta + 2 Gav c/Fundo Reduzido'),
    (565, 'Móvel COIMBRA 80x50x36'),
    (566, '1 Pio / 2 Portas + 2 Gav c/Fundo Reduzido'),
    (567, 'Móvel BRAGA c/Pés 50x81x41'),
    (568, '1 Pio / 1 Porta c/1 Prat + 2 Gav'),
    (569, 'Móvel BRAGA c/Pés 60x81x45'),
    (570, 'Móvel BRAGA c/Pés 70x81x45'),
    (571, '1 Pio / 2 Portas c/1 Prat + 2 Gav'),
    (572, 'Móvel BRAGA c/Pés 80x81x45'),
    (573, 'Móvel BRAGA c/Pés 100x81x45'),
    (574, 'Móvel BRAGA c/Pés 120x81x45'),
    (575, '1 Pio / 2 Portas c/1 Prat + 4 Gav'),
    (576, '2 Pios / 2 Portas c/1 Prat + 4 Gav'),
    (577, 'Móvel BRAGA c/Pés 60x81x36'),
    (578, '1 Pio / 1 Porta c/1 Prat + 2 Gav c/Fundo Reduzido'),
    (579, 'Móvel BRAGA c/Pés 80x81x36'),
    (580, '1 Pio / 2 Portas c/1 Prat + 2 Gav c/Fundo Reduzido'),
    (581, 'Móvel PORTO 50x50x41'),
    (582, '1 Pio / 2 Portas'),
    (583, 'Móvel PORTO 60x50x45'),
    (584, 'Móvel PORTO 80x50x45'),
    (585, 'Móvel PORTO 100x50x45'),
    (586, '1 Pio / 3 Portas'),
    (587, 'Móvel PORTO 120x50x45'),
    (588, '2 Pios / 3 Portas'),
    (589, 'Móvel PORTO 60x50x36'),
    (590, '1 Pio / 2 Portas c/Fundo Reduzido'),
    (591, 'Móvel PORTO 80x50x36'),
    (592, 'Móvel BEJA c/Pés 60x81x36'),
    (593, '1 Pio / 2 Portas c/1 Prat'),
    (594, 'Móvel BEJA c/Pés 80x81x36'),
    (595, 'Móvel BEJA c/Pés 100x81x36'),
    (596, '1 Pio / 3 Portas c/1 Prat'),
    (597, 'Bajo Lavabo BREDA 1 cajón 27 60cm'),
    (598, 'Veta Horizontal'),
    (599, 'Frente Elite Claro(71) Armazón Roble Noruega(52) Tirador Negro(2)'),
    (600, 'Frente Elite Claro(71) Armazón Roble Noruega(52) Tirador Plata Brillo(3)'),
    (601, 'Frente Elite Claro(71) Armazón Elite Claro(71) Tirador Negro(2)'),
    (602, 'Frente Elite Claro(71) Armazón Elite Claro(71) Tirador Plata Brillo(3)'),
    (603, 'Frente Elite Oscuro(70) Armazón Olmo California(32) Tirador Negro(2)'),
    (604, 'Frente Elite Oscuro(70) Armazón Olmo California(32) Tirador Plata Brillo(3)'),
    (605, 'Frente Elite Oscuro(70) Armazón Elite Oscuro(70) Tirador Negro(2)'),
    (606, 'Frente Elite Oscuro(70) Armazón Elite Oscuro(70) Tirador Plata Brillo(3)'),
    (607, 'Bajo Lavabo BREDA 1 cajón 27 70cm'),
    (608, 'Bajo Lavabo BREDA 1 cajón 27 80cm'),
    (609, 'Bajo Lavabo BREDA 1 cajón 27 90cm'),
    (610, 'Bajo Lavabo BREDA 1 cajón 27 100cm'),
    (611, 'Bajo Lavabo BREDA 1 cajón 27 120cm'),
    (612, 'Veta Vertical'),
    (613, 'Bajo Lavabo BREDA 1 cajón 42 y cajón interior 60cm'),
    (614, 'Bajo Lavabo BREDA 1 cajón 42 y cajón interior 70cm'),
    (615, 'Bajo Lavabo BREDA 1 cajón 42 y cajón interior 80cm'),
    (616, 'Bajo Lavabo BREDA 1 cajón 42 y cajón interior 90cm'),
    (617, 'Bajo Lavabo BREDA 1 cajón 42 y cajón interior 100cm'),
    (618, 'Bajo Lavabo BREDA 1 cajón 42 y cajón interior 120cm'),
    (619, 'Bajo Lavabo BREDA 2 cajones simétricos 60cm'),
    (620, 'Bajo Lavabo BREDA 2 cajones simétricos 70cm'),
    (621, 'Bajo Lavabo BREDA 2 cajones simétricos 80cm'),
    (622, 'Bajo Lavabo BREDA 2 cajones simétricos 90cm'),
    (623, 'Bajo Lavabo BREDA 2 cajones simétricos 100cm'),
    (624, 'Bajo Lavabo BREDA 2 cajones simétricos 120cm'),
    (625, 'Veta Mixta (H/V)'),
    (626, 'Bajo Lavabo BREDA 2 cajones asimétricos 60cm'),
    (627, 'Bajo Lavabo BREDA 2 cajones asimétricos 70cm'),
    (628, 'Bajo Lavabo BREDA 2 cajones asimétricos 80cm'),
    (629, 'Bajo Lavabo BREDA 2 cajones asimétricos 90cm'),
    (630, 'Bajo Lavabo BREDA 2 cajones asimétricos 100cm'),
    (631, 'Bajo Lavabo BREDA 2 cajones asimétricos 120cm'),
    (632, 'Bajo Lavabo BREDA 3 cajones 60cm'),
    (633, 'Bajo Lavabo BREDA 3 cajones 70cm'),
    (634, 'Bajo Lavabo BREDA 3 cajones 80cm'),
    (635, 'Bajo Lavabo BREDA 3 cajones 90cm'),
    (636, 'Bajo Lavabo BREDA 3 cajones 100cm'),
    (637, 'Bajo Lavabo BREDA 3 cajones 120cm'),
    (638, 'Encimera BREDA de tablero a medida 60cm'),
    (639, 'Encimera BREDA de tablero a medida 70cm'),
    (640, 'Encimera BREDA de tablero a medida 80cm'),
    (641, 'Encimera BREDA de tablero a medida 90cm'),
    (642, 'Encimera BREDA de tablero a medida 100cm'),
    (643, 'Encimera BREDA de tablero a medida 120cm'),
    (644, 'Encimera BREDA sem lavabo Solid Bath a medida 60cm'),
    (645, 'Encimera BREDA sem lavabo Solid Bath a medida 70cm'),
    (646, 'Encimera BREDA sem lavabo Solid Bath a medida 80cm'),
    (647, 'Encimera BREDA sem lavabo Solid Bath a medida 90cm'),
    (648, 'Encimera BREDA sem lavabo Solid Bath a medida 100cm'),
    (649, 'Encimera BREDA sem lavabo Solid Bath a medida 120cm'),
    (650, 'Encimera BREDA porcelana Munich dupla 120cm'),
    (651, 'Lavabo BREDA porcelana Bonn Verde Olivo'),
    (652, 'Lavabo BREDA porcelana Bremen Negro'),
    (653, 'Lavabo BREDA Solid Bath Toulon Ø40'),
    (654, 'Lavabo BREDA porcelana Munich Centrado (p/ móvel 60cm)'),
    (655, 'Lavabo BREDA porcelana Munich Centrado (p/ móvel 70cm)'),
    (656, 'Lavabo BREDA porcelana Munich Centrado (p/ móvel 80cm)'),
    (657, 'Lavabo BREDA porcelana Munich Centrado (p/ móvel 90cm)'),
    (658, 'Lavabo BREDA porcelana Munich Centrado (p/ móvel 100cm)'),
    (659, 'Lavabo BREDA porcelana Munich Centrado (p/ móvel 120cm)'),
    (660, 'Bajo Lavabo RIGA 1 cajón 27 60cm'),
    (661, 'Tirador Centrado'),
    (662, 'Tirador Izquierda'),
    (663, 'Tirador Derecha'),
    (664, 'Bajo Lavabo RIGA 1 cajón 27 70cm'),
    (665, 'Bajo Lavabo RIGA 1 cajón 27 80cm'),
    (666, 'Bajo Lavabo RIGA 1 cajón 27 90cm'),
    (667, 'Bajo Lavabo RIGA 1 cajón 27 100cm'),
    (668, 'Bajo Lavabo RIGA 1 cajón 27 120cm'),
    (669, 'Bajo Lavabo RIGA 1 cajón 42 y cajón interior 60cm'),
    (670, 'Bajo Lavabo RIGA 1 cajón 42 y cajón interior 70cm'),
    (671, 'Bajo Lavabo RIGA 1 cajón 42 y cajón interior 80cm'),
    (672, 'Bajo Lavabo RIGA 1 cajón 42 y cajón interior 90cm'),
    (673, 'Bajo Lavabo RIGA 1 cajón 42 y cajón interior 100cm'),
    (674, 'Bajo Lavabo RIGA 1 cajón 42 y cajón interior 120cm'),
    (675, 'Bajo Lavabo RIGA 1 cajón'),
    (676, 'hueco inferior 60cm'),
    (677, 'hueco inferior 70cm'),
    (678, 'hueco inferior 80cm'),
    (679, 'hueco inferior 90cm'),
    (680, 'hueco inferior 100cm'),
    (681, 'hueco inferior 120cm'),
    (682, 'Bajo Lavabo RIGA 2 cajones simétricos 60cm'),
    (683, 'Bajo Lavabo RIGA 2 cajones simétricos 70cm'),
    (684, 'Bajo Lavabo RIGA 2 cajones simétricos 80cm'),
    (685, 'Bajo Lavabo RIGA 2 cajones simétricos 90cm'),
    (686, 'Bajo Lavabo RIGA 2 cajones simétricos 100cm'),
    (687, 'Bajo Lavabo RIGA 2 cajones simétricos 120cm'),
    (688, 'Bajo Lavabo RIGA 2 cajones asimétricos 60cm'),
    (689, 'Bajo Lavabo RIGA 2 cajones asimétricos 70cm'),
    (690, 'Bajo Lavabo RIGA 2 cajones asimétricos 80cm'),
    (691, 'Bajo Lavabo RIGA 2 cajones asimétricos 90cm'),
    (692, 'Bajo Lavabo RIGA 2 cajones asimétricos 100cm'),
    (693, 'Bajo Lavabo RIGA 2 cajones asimétricos 120cm'),
    (694, 'Bajo Lavabo RIGA 3 cajones 60cm'),
    (695, 'Bajo Lavabo RIGA 3 cajones 70cm'),
    (696, 'Bajo Lavabo RIGA 3 cajones 80cm'),
    (697, 'Bajo Lavabo RIGA 3 cajones 90cm'),
    (698, 'Bajo Lavabo RIGA 3 cajones 100cm'),
    (699, 'Bajo Lavabo RIGA 3 cajones 120cm'),
    (700, 'Lavabo RIGA Solid Bath Rondo Ø40'),
    (701, 'Lavabo RIGA Solid Bath Oh Ø35'),
    (702, 'Lavabo RIGA porcelana Alice Centrado (p/ móvel 60cm)'),
    (703, 'Lavabo RIGA porcelana Alice Centrado (p/ móvel 70cm)'),
    (704, 'Lavabo RIGA porcelana Alice Centrado (p/ móvel 80cm)'),
    (705, 'Lavabo RIGA porcelana Alice Centrado (p/ móvel 90cm)'),
    (706, 'Lavabo RIGA porcelana Alice Centrado (p/ móvel 100cm)'),
    (707, 'Lavabo RIGA porcelana Alice Centrado (p/ móvel 120cm)'),
    (708, 'Lavabo RIGA porcelana Berlin Centrado (p/ móvel 60cm)'),
    (709, 'Lavabo RIGA porcelana Berlin Centrado (p/ móvel 70cm)'),
    (710, 'Lavabo RIGA porcelana Berlin Centrado (p/ móvel 80cm)'),
    (711, 'Lavabo RIGA porcelana Berlin Centrado (p/ móvel 90cm)'),
    (712, 'Lavabo RIGA porcelana Berlin Centrado (p/ móvel 100cm)'),
    (713, 'Lavabo RIGA porcelana Berlin Centrado (p/ móvel 120cm)'),
    (714, 'Bajo Lavabo MILANO 1 cajón 27 60cm'),
    (715, 'Bajo Lavabo MILANO 1 cajón 27 70cm'),
    (716, 'Bajo Lavabo MILANO 1 cajón 27 80cm'),
    (717, 'Bajo Lavabo MILANO 1 cajón 27 90cm'),
    (718, 'Bajo Lavabo MILANO 1 cajón 27 100cm'),
    (719, 'Bajo Lavabo MILANO 1 cajón 27 120cm'),
    (720, 'Bajo Lavabo MILANO 1 cajón 42 y cajón interior 60cm'),
    (721, 'Bajo Lavabo MILANO 1 cajón 42 y cajón interior 70cm'),
    (722, 'Bajo Lavabo MILANO 1 cajón 42 y cajón interior 80cm'),
    (723, 'Bajo Lavabo MILANO 1 cajón 42 y cajón interior 90cm'),
    (724, 'Bajo Lavabo MILANO 1 cajón 42 y cajón interior 100cm'),
    (725, 'Bajo Lavabo MILANO 1 cajón 42 y cajón interior 120cm'),
    (726, 'Bajo Lavabo MILANO 2 cajones simétricos 60cm'),
    (727, 'Bajo Lavabo MILANO 2 cajones simétricos 70cm'),
    (728, 'Bajo Lavabo MILANO 2 cajones simétricos 80cm'),
    (729, 'Bajo Lavabo MILANO 2 cajones simétricos 90cm'),
    (730, 'Bajo Lavabo MILANO 2 cajones simétricos 100cm'),
    (731, 'Bajo Lavabo MILANO 2 cajones simétricos 120cm'),
    (732, 'Bajo Lavabo MILANO 2 cajones asimétricos 60cm'),
    (733, 'Bajo Lavabo MILANO 2 cajones asimétricos 70cm'),
    (734, 'Bajo Lavabo MILANO 2 cajones asimétricos 80cm'),
    (735, 'Bajo Lavabo MILANO 2 cajones asimétricos 90cm'),
    (736, 'Bajo Lavabo MILANO 2 cajones asimétricos 100cm'),
    (737, 'Bajo Lavabo MILANO 2 cajones asimétricos 120cm'),
    (738, 'Bajo Lavabo MILANO 3 cajones 60cm'),
    (739, 'Bajo Lavabo MILANO 3 cajones 70cm'),
    (740, 'Bajo Lavabo MILANO 3 cajones 80cm'),
    (741, 'Bajo Lavabo MILANO 3 cajones 90cm'),
    (742, 'Bajo Lavabo MILANO 3 cajones 100cm'),
    (743, 'Bajo Lavabo MILANO 3 cajones 120cm'),
    (744, 'Bajo Lavabo MILANO 2 cajones'),
    (745, '1 puerta 90cm'),
    (746, 'Lavabo Esquerda'),
    (747, 'Lavabo Direita'),
    (748, 'Centrado'),
    (749, 'Porta Esquerda'),
    (750, 'Porta Direita'),
    (751, '1 puerta 100cm'),
    (752, '1 puerta 120cm'),
    (753, 'Encimera MILANO tablero estándar 60cm'),
    (754, 'Encimera MILANO tablero estándar 70cm'),
    (755, 'Encimera MILANO tablero estándar 80cm'),
    (756, 'Encimera MILANO tablero estándar 90cm'),
    (757, 'Encimera MILANO tablero estándar 100cm'),
    (758, 'Encimera MILANO tablero estándar 120cm'),
    (759, 'Lavabo MILANO porcelana Olfer'),
    (760, 'Lavabo MILANO Solid Bath Alice Desplazado Izq. (p/ móvel 90cm)'),
    (761, 'Lavabo MILANO Solid Bath Alice Desplazado Izq. (p/ móvel 100cm)'),
    (762, 'Lavabo MILANO Solid Bath Alice Desplazado Izq. (p/ móvel 120cm)'),
    (763, 'Lavabo MILANO mineral Pilsen Negro (p/ móvel 80cm)'),
    (764, 'Lavabo MILANO mineral Pilsen Negro (p/ móvel 100cm)'),
    (765, 'Lavabo MILANO mineral Pilsen Negro (p/ móvel 120cm)'),
    (766, 'Estrutura Suspendida Inferior MILANO (p/ móvel 80cm)'),
    (767, 'Estrutura Suspendida Inferior MILANO (p/ móvel 100cm)'),
    (768, 'Estrutura Suspendida Inferior MILANO (p/ móvel 120cm)'),
    (769, 'Repisa Estrutura MILANO (p/ móvel 80cm)'),
    (770, 'Repisa Estrutura MILANO (p/ móvel 100cm)'),
    (771, 'Repisa Estrutura MILANO (p/ móvel 120cm)'),
    (772, 'Mueble MANÁ 60cm'),
    (773, 'Mueble MANÁ 80cm'),
    (774, 'Mueble MANÁ 100cm'),
    (775, 'Mueble MANÁ 120cm (2 módulos de 60cm)'),
    (776, 'Mueble SIA 60cm'),
    (777, 'Mueble SIA 80cm'),
    (778, 'Mueble SIA 100cm'),
    (779, 'Mueble SIA 120cm (2 módulos de 60cm)'),
    (780, 'Mueble ETNA 60cm'),
    (781, 'Mueble ETNA 80cm'),
    (782, 'Mueble ETNA 100cm'),
    (783, 'Mueble ETNA 120cm (2 módulos de 60cm)'),
    (784, 'Mueble ZAO 60cm'),
    (785, 'Mueble ZAO 80cm'),
    (786, 'Mueble ZAO 100cm'),
    (787, 'Mueble ZAO 120cm (2 módulos de 60cm)'),
    (788, 'Mueble VESUBIO 60cm'),
    (789, 'Mueble VESUBIO 80cm'),
    (790, 'Mueble VESUBIO 100cm'),
    (791, 'Mueble VESUBIO 120cm (2 módulos de 60cm)'),
    (792, 'Encimera Melamina 60x46 (p/ Etna/Zao/Vesubio)'),
    (793, 'Encimera Melamina 80x46 (p/ Etna/Zao/Vesubio)'),
    (794, 'Encimera Melamina 100x46 (p/ Etna/Zao/Vesubio)'),
    (795, 'Encimera Melamina 120x46 (p/ Etna/Zao/Vesubio)'),
    (796, 'Encimera Melamina 140x46 (p/ Etna/Zao/Vesubio)'),
    (797, 'Encimera Melamina 160x46 (p/ Etna/Zao/Vesubio)'),
    (798, 'Encimera Piedra Compacta (Resina) 60x46 (p/ Maná/Sia)'),
    (799, 'Encimera Piedra Compacta (Resina) 80x46 (p/ Maná/Sia)'),
    (800, 'Encimera Piedra Compacta (Resina) 100x46 (p/ Maná/Sia)'),
    (801, 'Encimera Piedra Compacta (Resina) 120x46 (p/ Maná/Sia)'),
    (802, 'Encimera Piedra Compacta (Resina) 140x46 (p/ Maná/Sia)'),
    (803, 'Encimera Piedra Compacta (Resina) 160x46 (p/ Maná/Sia)'),
    (804, 'Serviço de Corte de Encimera Personalizado'),
    (805, 'Serviço de Perfuração de Encimera para Lavabo'),
    (806, 'Lavabo Cerámica ST 60x46'),
    (807, 'Lavabo Cerámica ST 80x46'),
    (808, 'Lavabo Cerámica ST 100x46'),
    (809, 'Lavabo Cerámica ST 120x46 Desplazado Izquierda'),
    (810, 'Lavabo Cerámica ST 120x46 Desplazado Derecha'),
    (811, 'Lavabo Cerámica ST 120x46 2 Senos'),
    (812, 'Lavabo Resina HE+ 60x46x8'),
    (813, 'Lavabo Resina HE+ 80x46x8'),
    (814, 'Lavabo Resina HE+ 100x46x8'),
    (815, 'Lavabo Sobreencimera Resina Round Ø40x8'),
    (816, 'Lavabo Sobreencimera Resina Libra 40x40x8'),
    (817, 'Lavabo Sobreencimera Resina Ronda Ø37x8'),
    (818, 'Lavabo Sobreencimera Resina Oval 50x37x8'),
    (819, 'Lavabo Sobreencimera Resina Kuvic 37x37x8'),
    (820, 'Lavabo Sobreencimera Resina Kuvic XL 50x37x8'),
    (821, 'Espelho Rectangular Liso 60x70cm'),
    (822, 'Espelho Rectangular Liso 80x70cm'),
    (823, 'Espelho Rectangular Liso 100x70cm'),
    (824, 'Espelho Rectangular Liso 120x70cm'),
    (825, 'Espelho Rectangular LED 60x70cm'),
    (826, 'Espelho Rectangular LED 80x70cm'),
    (827, 'Espelho Rectangular LED 100x70cm'),
    (828, 'Espelho Rectangular LED 120x70cm'),
    (829, 'Espelho Redondo Marco Ø60cm'),
    (830, 'Espelho Redondo Marco Ø80cm'),
    (831, 'Espelho Redondo Marco Ø100cm'),
    (832, 'Espelho Redondo Marco LED Ø60cm'),
    (833, 'Espelho Redondo Marco LED Ø80cm'),
    (834, 'Espelho Redondo Marco LED Ø100cm'),
    (835, 'Espelho Redondo Retroiluminado Ø60cm'),
    (836, 'Espelho Redondo Retroiluminado Ø80cm'),
    (837, 'Espelho Redondo Retroiluminado Ø100cm'),
    (838, 'Espelho Óvalo Liso 60x100'),
    (839, 'Espelho Óvalo Marco 60x100'),
    (840, 'Espelho Óvalo Repisa 60x90 (altura total 105cm)'),
    (841, 'Espelho Óvalo LED 60x100'),
    (842, 'Espelho Óvalo Marco LED 60x100'),
    (843, 'Espelho Óvalo Repisa LED 60x90 (altura total 105cm)'),
    (844, 'Coluna Suspensa AXIS 40x160x25'),
    (845, 'Todo Branco Lacado'),
    (846, 'Todo Tea'),
    (847, 'Todo Oak'),
    (848, 'Todo Joplim'),
    (849, 'Corpo Todo Branco Lacado, Frente Branco Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (850, 'Corpo Todo Branco Lacado, Frente Branco Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (851, 'Corpo Todo Branco Lacado, Frente Cinza Claro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (852, 'Corpo Todo Branco Lacado, Frente Cinza Claro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (853, 'Corpo Todo Branco Lacado, Frente Cinza Médio Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (854, 'Corpo Todo Branco Lacado, Frente Cinza Médio Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (855, 'Corpo Todo Branco Lacado, Frente Antracite Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (856, 'Corpo Todo Branco Lacado, Frente Antracite Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (857, 'Corpo Todo Branco Lacado, Frente Preto Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (858, 'Corpo Todo Branco Lacado, Frente Preto Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (859, 'Corpo Todo Branco Lacado, Frente Creme Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (860, 'Corpo Todo Branco Lacado, Frente Creme Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (861, 'Corpo Todo Branco Lacado, Frente Camel Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (862, 'Corpo Todo Branco Lacado, Frente Camel Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (863, 'Corpo Todo Branco Lacado, Frente Ouro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (864, 'Corpo Todo Branco Lacado, Frente Ouro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (865, 'Corpo Todo Branco Lacado, Frente Cobre Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (866, 'Corpo Todo Branco Lacado, Frente Cobre Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (867, 'Corpo Todo Branco Lacado, Frente Chocolate Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (868, 'Corpo Todo Branco Lacado, Frente Chocolate Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (869, 'Corpo Todo Branco Lacado, Frente Verde Água Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (870, 'Corpo Todo Branco Lacado, Frente Verde Água Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (871, 'Corpo Todo Branco Lacado, Frente Azeitona Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (872, 'Corpo Todo Branco Lacado, Frente Azeitona Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (873, 'Corpo Todo Branco Lacado, Frente Azul Mar Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (874, 'Corpo Todo Branco Lacado, Frente Azul Mar Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (875, 'Corpo Todo Branco Lacado, Frente Azul Escuro Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (876, 'Corpo Todo Branco Lacado, Frente Azul Escuro Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (877, 'Corpo Todo Branco Lacado, Frente Prata Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (878, 'Corpo Todo Branco Lacado, Frente Prata Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (879, 'Corpo Todo Branco Lacado, Frente Rosa Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (880, 'Corpo Todo Branco Lacado, Frente Rosa Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (881, 'Corpo Todo Branco Lacado, Frente Vermelho Brilho (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (882, 'Corpo Todo Branco Lacado, Frente Vermelho Mate (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (883, 'Corpo Todo Branco Lacado, Frente Azabache (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (884, 'Corpo Todo Branco Lacado, Frente Denver (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (885, 'Corpo Todo Branco Lacado, Frente Black (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (886, 'Corpo Todo Branco Lacado, Frente Artisan (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (887, 'Corpo Todo Branco Lacado, Frente Lincoln (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (888, 'Corpo Todo Branco Lacado, Frente Halifax (Lacado/Melamina, +50€, entrega 4/5 sem.)'),
    (889, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (890, 'Corpo e Frente Branco Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (891, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (892, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (893, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (894, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (895, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (896, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (897, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (898, 'Corpo e Frente Preto Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (899, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (900, 'Corpo e Frente Creme Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (901, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (902, 'Corpo e Frente Camel Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (903, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (904, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (905, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (906, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (907, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (908, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (909, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (910, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (911, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (912, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (913, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (914, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (915, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (916, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (917, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (918, 'Corpo e Frente Prata Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (919, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (920, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (921, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (922, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (923, 'Corpo e Frente Azabache (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (924, 'Corpo e Frente Denver (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (925, 'Corpo e Frente Black (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (926, 'Corpo e Frente Artisan (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (927, 'Corpo e Frente Lincoln (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (928, 'Corpo e Frente Halifax (Lacado/Melamina, +90€, entrega 4/5 sem.)'),
    (929, 'Auxiliar de Colgar Lacado 1H 35x35x20 (p/ Sia/Maná)'),
    (930, 'Auxiliar de Colgar Lacado 3H 75x35x20 (p/ Sia/Maná)'),
    (931, 'Auxiliar de Colgar Lacado Puerta 75x35x20'),
    (932, 'Abertura Izquierda (p/ Sia/Maná)'),
    (933, 'Abertura Derecha (p/ Sia/Maná)'),
    (934, 'Auxiliar de Colgar Lacado Puerta+Hueco Bajo, Abertura Izquierda 75x35x20 (p/ Sia/Maná)'),
    (935, 'Auxiliar de Colgar Lacado Puerta+Hueco Bajo, Abertura Derecha 75x35x20 (p/ Sia/Maná)'),
    (936, 'Auxiliar de Colgar Lacado Puerta+Hueco Alto, Abertura Izquierda 75x35x20 (p/ Sia/Maná)'),
    (937, 'Auxiliar de Colgar Lacado Puerta+Hueco Alto, Abertura Derecha 75x35x20 (p/ Sia/Maná)'),
    (938, 'Auxiliar de Colgar Melamina 1H 35x35x20 (p/ Etna/Zao/Vesubio)'),
    (939, 'Auxiliar de Colgar Melamina 3H 75x35x20 (p/ Etna/Zao/Vesubio)'),
    (940, 'Auxiliar de Colgar Melamina Puerta 75x35x20'),
    (941, 'Abertura Izquierda (p/ Etna/Zao/Vesubio)'),
    (942, 'Abertura Derecha (p/ Etna/Zao/Vesubio)'),
    (943, 'Auxiliar de Colgar Melamina Puerta+Hueco Bajo, Abertura Izquierda 75x35x20 (p/ Etna/Zao/Vesubio)'),
    (944, 'Auxiliar de Colgar Melamina Puerta+Hueco Bajo, Abertura Derecha 75x35x20 (p/ Etna/Zao/Vesubio)'),
    (945, 'Auxiliar de Colgar Melamina Puerta+Hueco Alto, Abertura Izquierda 75x35x20 (p/ Etna/Zao/Vesubio)'),
    (946, 'Auxiliar de Colgar Melamina Puerta+Hueco Alto, Abertura Derecha 75x35x20 (p/ Etna/Zao/Vesubio)'),
    (947, 'Coluna Line 30x170x32'),
    (948, '2 Portas c/2 Prat'),
    (949, 'Corpo Todo Branco, Frente Branco Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (950, 'Corpo Todo Branco, Frente Branco Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (951, 'Corpo Todo Branco, Frente Cinza Claro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (952, 'Corpo Todo Branco, Frente Cinza Claro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (953, 'Corpo Todo Branco, Frente Cinza Médio Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (954, 'Corpo Todo Branco, Frente Cinza Médio Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (955, 'Corpo Todo Branco, Frente Antracite Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (956, 'Corpo Todo Branco, Frente Antracite Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (957, 'Corpo Todo Branco, Frente Preto Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (958, 'Corpo Todo Branco, Frente Preto Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (959, 'Corpo Todo Branco, Frente Creme Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (960, 'Corpo Todo Branco, Frente Creme Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (961, 'Corpo Todo Branco, Frente Camel Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (962, 'Corpo Todo Branco, Frente Camel Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (963, 'Corpo Todo Branco, Frente Ouro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (964, 'Corpo Todo Branco, Frente Ouro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (965, 'Corpo Todo Branco, Frente Cobre Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (966, 'Corpo Todo Branco, Frente Cobre Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (967, 'Corpo Todo Branco, Frente Chocolate Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (968, 'Corpo Todo Branco, Frente Chocolate Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (969, 'Corpo Todo Branco, Frente Verde Água Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (970, 'Corpo Todo Branco, Frente Verde Água Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (971, 'Corpo Todo Branco, Frente Azeitona Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (972, 'Corpo Todo Branco, Frente Azeitona Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (973, 'Corpo Todo Branco, Frente Azul Mar Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (974, 'Corpo Todo Branco, Frente Azul Mar Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (975, 'Corpo Todo Branco, Frente Azul Escuro Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (976, 'Corpo Todo Branco, Frente Azul Escuro Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (977, 'Corpo Todo Branco, Frente Prata Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (978, 'Corpo Todo Branco, Frente Prata Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (979, 'Corpo Todo Branco, Frente Rosa Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (980, 'Corpo Todo Branco, Frente Rosa Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (981, 'Corpo Todo Branco, Frente Vermelho Brilho (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (982, 'Corpo Todo Branco, Frente Vermelho Mate (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (983, 'Corpo Todo Branco, Frente Azabache (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (984, 'Corpo Todo Branco, Frente Denver (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (985, 'Corpo Todo Branco, Frente Black (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (986, 'Corpo Todo Branco, Frente Artisan (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (987, 'Corpo Todo Branco, Frente Lincoln (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (988, 'Corpo Todo Branco, Frente Halifax (Lacado/Melamina, +80€, entrega 4/5 sem.)'),
    (989, 'Corpo e Frente Branco Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (990, 'Corpo e Frente Branco Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (991, 'Corpo e Frente Cinza Claro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (992, 'Corpo e Frente Cinza Claro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (993, 'Corpo e Frente Cinza Médio Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (994, 'Corpo e Frente Cinza Médio Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (995, 'Corpo e Frente Antracite Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (996, 'Corpo e Frente Antracite Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (997, 'Corpo e Frente Preto Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (998, 'Corpo e Frente Preto Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (999, 'Corpo e Frente Creme Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1000, 'Corpo e Frente Creme Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1001, 'Corpo e Frente Camel Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1002, 'Corpo e Frente Camel Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1003, 'Corpo e Frente Ouro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1004, 'Corpo e Frente Ouro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1005, 'Corpo e Frente Cobre Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1006, 'Corpo e Frente Cobre Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1007, 'Corpo e Frente Chocolate Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1008, 'Corpo e Frente Chocolate Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1009, 'Corpo e Frente Verde Água Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1010, 'Corpo e Frente Verde Água Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1011, 'Corpo e Frente Azeitona Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1012, 'Corpo e Frente Azeitona Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1013, 'Corpo e Frente Azul Mar Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1014, 'Corpo e Frente Azul Mar Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1015, 'Corpo e Frente Azul Escuro Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1016, 'Corpo e Frente Azul Escuro Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1017, 'Corpo e Frente Prata Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1018, 'Corpo e Frente Prata Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1019, 'Corpo e Frente Rosa Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1020, 'Corpo e Frente Rosa Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1021, 'Corpo e Frente Vermelho Brilho (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1022, 'Corpo e Frente Vermelho Mate (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1023, 'Corpo e Frente Azabache (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1024, 'Corpo e Frente Denver (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1025, 'Corpo e Frente Black (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1026, 'Corpo e Frente Artisan (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1027, 'Corpo e Frente Lincoln (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1028, 'Corpo e Frente Halifax (Lacado/Melamina, +120€, entrega 4/5 sem.)'),
    (1029, 'Coluna Line 50x170x32'),
    (1030, '4 Portas c/2 Prat'),
    (1031, 'Coluna Alta Lux 40x170x32'),
    (1032, '2 Portas c/2 Prat + 2 Gav'),
    (1033, '1 Porta c/1 Prat + 2 Gav + 1 Tulha'),
    (1034, 'Coluna Alta Lux 60x170x32'),
    (1035, '4 Portas c/2 Prat + 2 Gav'),
    (1036, '2 Portas c/2 Prat + 2 Gav + 1 Tulha'),
    (1037, 'Coluna Baixa Lux 40x80x32'),
    (1038, '1 Gav + 1 Porta c/1 Prat'),
    (1039, '1 Gav + 1 Tulha'),
    (1040, 'Coluna Baixa Lux 60x80x32'),
    (1041, '1 Gav + 2 Portas c/1 Prat'),
    (1042, 'Aplique LED Lara Cromado 30CM'),
    (1043, 'Aplique LED Dourado 30CM'),
    (1044, 'Aplique LED Preto 30CM'),
    (1045, 'Aplique LED Beatriz 60CM'),
    (1046, 'Aplique LED Ana 18CM'),
    (1047, 'Espelho LIPI Ø80'),
    (1048, 'Espelho LIPI Ø100'),
    (1049, 'Espelho LIPI Ø120'),
    (1050, 'Espelho Oval c/Moldura de 1cm 90x50'),
    (1051, 'Espelho Circular c/Moldura de 3cm Ø70'),
    (1052, 'Espelho Circular c/Moldura de 1cm Ø70'),
    (1053, 'Espelho c/Moldura de 3cm 80x70'),
    (1054, 'Espelho c/Moldura de 3cm 100x70'),
    (1055, 'Espelho c/Moldura de 3cm 120x70'),
    (1056, 'Espelho c/Moldura de 1cm 80x70'),
    (1057, 'Espelho c/Moldura de 1cm 100x70'),
    (1058, 'Espelho c/Moldura de 1cm 120x70'),
    (1059, 'Espelho c/Moldura de 1cm 150x70'),
    (1060, 'Espelho Round c/Cantos Redondos 80x70'),
    (1061, 'Espelho Round c/Cantos Redondos 100x70'),
    (1062, 'Espelho Round c/Cantos Redondos 120x70'),
    (1063, 'Espelho Round c/Cantos Redondos 140x70'),
    (1064, 'Espelho Classic c/Moldura de 3cm 80x70'),
    (1065, 'Espelho Classic c/Moldura de 3cm 90x70'),
    (1066, 'Espelho Classic c/Moldura de 3cm 100x70'),
    (1067, 'Espelho Classic c/Moldura de 3cm 120x70'),
    (1068, 'Espelho c/Prateleira 60x72'),
    (1069, 'Espelho c/Prateleira 80x72'),
    (1070, 'Espelho c/Prateleira 100x72'),
    (1071, 'Espelho c/Prateleira 120x72'),
    (1072, 'Espelho c/Prateleira 140x72'),
    (1073, 'Espelho c/Orla Alumínio 100x50'),
    (1074, 'Espelho c/Orla Alumínio 100x60'),
    (1075, 'Espelho c/Orla Alumínio 100x70'),
    (1076, 'Espelho c/Orla Alumínio 100x80'),
    (1077, 'Espelho c/Orla Alumínio 120x50'),
    (1078, 'Espelho c/Orla Alumínio 120x60'),
    (1079, 'Espelho c/Orla Alumínio 120x70'),
    (1080, 'Espelho c/Orla Alumínio 120x80'),
    (1081, 'Espelho c/Orla Alumínio 60x40'),
    (1082, 'Espelho c/Orla Alumínio 60x50'),
    (1083, 'Espelho c/Orla Alumínio 60x60'),
    (1084, 'Espelho c/Orla Alumínio 70x50'),
    (1085, 'Espelho c/Orla Alumínio 70x60'),
    (1086, 'Espelho c/Orla Alumínio 70x70'),
    (1087, 'Espelho c/Orla Alumínio 80x50'),
    (1088, 'Espelho c/Orla Alumínio 80x60'),
    (1089, 'Espelho c/Orla Alumínio 80x70'),
    (1090, 'Espelho c/Orla Alumínio 80x80'),
    (1091, 'Espelho c/Orla Alumínio 90x50'),
    (1092, 'Espelho c/Orla Alumínio 90x60'),
    (1093, 'Espelho c/Orla Alumínio 90x70'),
    (1094, 'Espelho c/Orla Alumínio 90x80'),
    (1095, 'Espelho LED Eris 100x80'),
    (1096, 'Espelho LED Eris 120x80'),
    (1097, 'Espelho LED Eris 60x70'),
    (1098, 'Espelho LED Eris 80x80'),
    (1099, 'Espelho LED MERCÚRIO Ø60'),
    (1100, 'Espelho LED MERCÚRIO Ø80'),
    (1101, 'Espelho LED Plutão Ø80'),
    (1102, 'Espelho LED MARTE 45x90'),
    (1103, 'Espelho LED MARTE 100x80'),
    (1104, 'Espelho LED MARTE 120x80'),
    (1105, 'Espelho LED MARTE 60x70'),
    (1106, 'Espelho LED MARTE 80x80'),
    (1107, 'Espelho LED Urano 100x80'),
    (1108, 'Espelho LED Urano 120x80'),
    (1109, 'Espelho LED Urano 80x80'),
    (1110, 'Espelho LED Lua Ø80'),
    (1111, 'Espelho LED Neptuno 100x80'),
    (1112, 'Espelho LED Neptuno 120x80'),
    (1113, 'Espelho LED Neptuno 80x80'),
    (1114, 'Espelho LED Calisto 170x75'),
    (1115, 'Espelho LED Sol 50x100'),
    (1116, 'Espelho LED Sol 50x120'),
    (1117, 'Espelho LED Sol 50x90'),
    (1118, 'Espelho LED Verona 80x50'),
    (1119, 'Espelho LED Latina Ø60'),
    (1120, 'Espelho LED Latina Ø70'),
    (1121, 'Espelho LED Latina Ø80'),
    (1122, 'Espelho LED Latina Ø90'),
    (1123, 'Espelho LED Trentino Ø50'),
    (1124, 'Moldura Preto Mate'),
    (1125, 'Moldura Branco Mate'),
    (1126, 'Moldura Dourado Brilho'),
    (1127, 'Espelho LED Trentino Ø60'),
    (1128, 'Espelho LED Trentino Ø70'),
    (1129, 'Espelho LED Trentino Ø80'),
    (1130, 'Espelho LED Roma Ø60'),
    (1131, 'Espelho LED Roma Ø70'),
    (1132, 'Espelho LED Roma Ø80'),
    (1133, 'Espelho LED Milão Ø60'),
    (1134, 'Espelho LED Milão Ø70'),
    (1135, 'Espelho LED Milão Ø80'),
    (1136, 'Espelho LED Florença 100x50'),
    (1137, 'Espelho LED Florença 120x50'),
    (1138, 'Espelho LED Florença 80x50'),
    (1139, 'Espelho LED Modena 100x80'),
    (1140, 'Espelho LED Modena 120x80'),
    (1141, 'Espelho LED Modena 60x80'),
    (1142, 'Espelho LED Modena 80x80'),
    (1143, 'Espelho LED Rimini 100x80'),
    (1144, 'Espelho LED Rimini 120x80'),
    (1145, 'Espelho LED Rimini 60x80'),
    (1146, 'Espelho LED Rimini 80x80'),
    (1147, 'Espelho LED Tivoli 100x80'),
    (1148, 'Espelho LED Tivoli 120x80'),
    (1149, 'Espelho LED Tivoli 60x80'),
    (1150, 'Espelho LED Tivoli 80x80'),
    (1151, 'Espelho LED Lucci 100x60'),
    (1152, 'Espelho LED Lucci 60x50'),
    (1153, 'Espelho LED Lucci 80x65'),
    (1154, 'Espelho LED Bari 100x70'),
    (1155, 'Espelho LED Bari 120x70'),
    (1156, 'Espelho LED Bari 140x70'),
    (1157, 'Espelho LED Bari 80x70'),
    (1158, 'Espelho LED Vinci 50x100'),
    (1159, 'Espelho LED Vinci 50x120'),
    (1160, 'Espelho LED Vinci 50x80');
  CREATE TEMP TABLE _tmv_opc (papel text NOT NULL, rotulo text NOT NULL, codigo text NOT NULL, nome text NOT NULL, PRIMARY KEY (papel, codigo)) ON COMMIT DROP;
  INSERT INTO _tmv_opc (papel, rotulo, codigo, nome) VALUES
    ('cor', 'Cor', 'P', 'Preto'),
    ('cor', 'Cor', 'B', 'Branco'),
    ('cor', 'Cor', 'D', 'Dourado'),
    ('cor_corpo', 'Cor do corpo', 'WH', 'White'),
    ('cor_corpo', 'Cor do corpo', 'TBL', 'Todo Branco Lacado'),
    ('cor_corpo', 'Cor do corpo', 'TBR', 'Todo Branco'),
    ('cor_corpo', 'Cor do corpo', 'BCO', 'Branco'),
    ('cor_corpo', 'Cor do corpo', 'CCL', 'Cinza Claro'),
    ('cor_corpo', 'Cor do corpo', 'CME', 'Cinza Médio'),
    ('cor_corpo', 'Cor do corpo', 'ANT', 'Antracite'),
    ('cor_corpo', 'Cor do corpo', 'PTO', 'Preto'),
    ('cor_corpo', 'Cor do corpo', 'CRE', 'Creme'),
    ('cor_corpo', 'Cor do corpo', 'CAM', 'Camel'),
    ('cor_corpo', 'Cor do corpo', 'OUR', 'Ouro'),
    ('cor_corpo', 'Cor do corpo', 'COB', 'Cobre'),
    ('cor_corpo', 'Cor do corpo', 'CHO', 'Chocolate'),
    ('cor_corpo', 'Cor do corpo', 'VAG', 'Verde Água'),
    ('cor_corpo', 'Cor do corpo', 'AZE', 'Azeitona'),
    ('cor_corpo', 'Cor do corpo', 'AMA', 'Azul Mar'),
    ('cor_corpo', 'Cor do corpo', 'AES', 'Azul Escuro'),
    ('cor_corpo', 'Cor do corpo', 'PRA', 'Prata'),
    ('cor_corpo', 'Cor do corpo', 'ROS', 'Rosa'),
    ('cor_corpo', 'Cor do corpo', 'VER', 'Vermelho'),
    ('cor_corpo', 'Cor do corpo', 'AZB', 'Azabache'),
    ('cor_corpo', 'Cor do corpo', 'DEN', 'Denver'),
    ('cor_corpo', 'Cor do corpo', 'BLK', 'Black'),
    ('cor_corpo', 'Cor do corpo', 'ART', 'Artisan'),
    ('cor_corpo', 'Cor do corpo', 'LIN', 'Lincoln'),
    ('cor_corpo', 'Cor do corpo', 'HAL', 'Halifax'),
    ('cor_corpo', 'Cor do corpo', 'OAK', 'Oak'),
    ('cor_corpo', 'Cor do corpo', 'TEA', 'Tea'),
    ('cor_corpo', 'Cor do corpo', 'JOP', 'Joplim'),
    ('cor_corpo', 'Cor do corpo', 'ARN', 'Roble Noruega'),
    ('cor_corpo', 'Cor do corpo', 'AEC', 'Elite Claro'),
    ('cor_corpo', 'Cor do corpo', 'AOC', 'Olmo California'),
    ('cor_corpo', 'Cor do corpo', 'AEO', 'Elite Oscuro'),
    ('cor_frente', 'Cor da frente', 'WH', 'White'),
    ('cor_frente', 'Cor da frente', 'TBL', 'Todo Branco Lacado'),
    ('cor_frente', 'Cor da frente', 'TBR', 'Todo Branco'),
    ('cor_frente', 'Cor da frente', 'BCO', 'Branco'),
    ('cor_frente', 'Cor da frente', 'CCL', 'Cinza Claro'),
    ('cor_frente', 'Cor da frente', 'CME', 'Cinza Médio'),
    ('cor_frente', 'Cor da frente', 'ANT', 'Antracite'),
    ('cor_frente', 'Cor da frente', 'PTO', 'Preto'),
    ('cor_frente', 'Cor da frente', 'CRE', 'Creme'),
    ('cor_frente', 'Cor da frente', 'CAM', 'Camel'),
    ('cor_frente', 'Cor da frente', 'OUR', 'Ouro'),
    ('cor_frente', 'Cor da frente', 'COB', 'Cobre'),
    ('cor_frente', 'Cor da frente', 'CHO', 'Chocolate'),
    ('cor_frente', 'Cor da frente', 'VAG', 'Verde Água'),
    ('cor_frente', 'Cor da frente', 'AZE', 'Azeitona'),
    ('cor_frente', 'Cor da frente', 'AMA', 'Azul Mar'),
    ('cor_frente', 'Cor da frente', 'AES', 'Azul Escuro'),
    ('cor_frente', 'Cor da frente', 'PRA', 'Prata'),
    ('cor_frente', 'Cor da frente', 'ROS', 'Rosa'),
    ('cor_frente', 'Cor da frente', 'VER', 'Vermelho'),
    ('cor_frente', 'Cor da frente', 'AZB', 'Azabache'),
    ('cor_frente', 'Cor da frente', 'DEN', 'Denver'),
    ('cor_frente', 'Cor da frente', 'BLK', 'Black'),
    ('cor_frente', 'Cor da frente', 'ART', 'Artisan'),
    ('cor_frente', 'Cor da frente', 'LIN', 'Lincoln'),
    ('cor_frente', 'Cor da frente', 'HAL', 'Halifax'),
    ('cor_frente', 'Cor da frente', 'OAK', 'Oak'),
    ('cor_frente', 'Cor da frente', 'TEA', 'Tea'),
    ('cor_frente', 'Cor da frente', 'JOP', 'Joplim'),
    ('cor_frente', 'Cor da frente', 'FC', 'Elite Claro'),
    ('cor_frente', 'Cor da frente', 'FO', 'Elite Oscuro'),
    ('tonalidade', 'Tonalidade', 'B', 'BRILHO'),
    ('tonalidade', 'Tonalidade', 'M', 'MATE'),
    ('veta', 'Veta', 'H', 'Horizontal'),
    ('veta', 'Veta', 'V', 'Vertical'),
    ('veta', 'Veta', 'MX', 'Mixta'),
    ('puxador', 'Puxador', 'TN', 'Negro'),
    ('puxador', 'Puxador', 'TP', 'Plata Brillo'),
    ('posicao_puxador', 'Posição do puxador', 'CEN', 'Centrado'),
    ('posicao_puxador', 'Posição do puxador', 'ESQ', 'Esquerda'),
    ('posicao_puxador', 'Posição do puxador', 'DIR', 'Direita'),
    ('lado', 'Lado', 'ESQ', 'Esquerdo'),
    ('lado', 'Lado', 'DIR', 'Direito'),
    ('largura', 'Largura', '18', '18'),
    ('largura', 'Largura', '30', '30'),
    ('largura', 'Largura', '60', '60'),
    ('largura', 'Largura', '70', '70'),
    ('largura', 'Largura', '80', '80'),
    ('largura', 'Largura', '90', '90'),
    ('largura', 'Largura', '100', '100'),
    ('largura', 'Largura', '120', '120');
  CREATE TEMP TABLE _tmv_med (n integer PRIMARY KEY, texto text NOT NULL) ON COMMIT DROP;
  INSERT INTO _tmv_med (n, texto) VALUES
    (1, '80 × 50 × 45 cm'),
    (2, '100 × 50 × 45 cm'),
    (3, '120 × 50 × 45 cm'),
    (4, '60 × 50 × 45 cm'),
    (5, '70 × 50 × 45 cm'),
    (6, '90 × 50 × 45 cm'),
    (7, '140 × 50 × 45 cm'),
    (8, '150 × 50 × 45 cm'),
    (9, '160 × 50 × 45 cm'),
    (10, '180 × 50 × 45 cm'),
    (11, '60 × 50 × 36 cm'),
    (12, '80 × 50 × 36 cm'),
    (13, '100 × 50 × 36 cm'),
    (14, '60 × 81 × 45 cm'),
    (15, '80 × 81 × 45 cm'),
    (16, '100 × 81 × 45 cm'),
    (17, '120 × 81 × 45 cm'),
    (18, '50 × 81 × 41 cm'),
    (19, '70 × 81 × 45 cm'),
    (20, '60 × 81 × 36 cm'),
    (21, '80 × 81 × 36 cm'),
    (22, '50 × 50 × 41 cm'),
    (23, '100 × 81 × 36 cm'),
    (24, '40 × 40 cm'),
    (25, '35 × 35 cm'),
    (26, '60 × 60 × 45 cm'),
    (27, '80 × 60 × 45 cm'),
    (28, '100 × 60 × 45 cm'),
    (29, '120 × 60 × 45 cm'),
    (30, '60 × 46 cm'),
    (31, '80 × 46 cm'),
    (32, '100 × 46 cm'),
    (33, '120 × 46 cm'),
    (34, '140 × 46 cm'),
    (35, '160 × 46 cm'),
    (36, '60 × 46 × 8 cm'),
    (37, '80 × 46 × 8 cm'),
    (38, '100 × 46 × 8 cm'),
    (39, '40 × 40 × 8 cm'),
    (40, '37 × 37 × 8 cm'),
    (41, '50 × 37 × 8 cm'),
    (42, '60 × 70 cm'),
    (43, '80 × 70 cm'),
    (44, '100 × 70 cm'),
    (45, '120 × 70 cm'),
    (46, '60 × 60 cm'),
    (47, '80 × 80 cm'),
    (48, '100 × 100 cm'),
    (49, '60 × 100 cm'),
    (50, '60 × 90 cm'),
    (51, '40 × 160 × 25 cm'),
    (52, '35 × 35 × 20 cm'),
    (53, '75 × 35 × 20 cm'),
    (54, '30 × 170 × 32 cm'),
    (55, '50 × 170 × 32 cm'),
    (56, '40 × 170 × 32 cm'),
    (57, '60 × 170 × 32 cm'),
    (58, '40 × 80 × 32 cm'),
    (59, '60 × 80 × 32 cm'),
    (60, '120 × 120 cm'),
    (61, '90 × 50 cm'),
    (62, '70 × 70 cm'),
    (63, '150 × 70 cm'),
    (64, '140 × 70 cm'),
    (65, '90 × 70 cm'),
    (66, '60 × 72 cm'),
    (67, '80 × 72 cm'),
    (68, '100 × 72 cm'),
    (69, '120 × 72 cm'),
    (70, '140 × 72 cm'),
    (71, '100 × 50 cm'),
    (72, '100 × 60 cm'),
    (73, '100 × 80 cm'),
    (74, '120 × 50 cm'),
    (75, '120 × 60 cm'),
    (76, '120 × 80 cm'),
    (77, '60 × 40 cm'),
    (78, '60 × 50 cm'),
    (79, '70 × 50 cm'),
    (80, '70 × 60 cm'),
    (81, '80 × 50 cm'),
    (82, '80 × 60 cm'),
    (83, '90 × 60 cm'),
    (84, '90 × 80 cm'),
    (85, '45 × 90 cm'),
    (86, '170 × 75 cm'),
    (87, '50 × 100 cm'),
    (88, '50 × 120 cm'),
    (89, '50 × 90 cm'),
    (90, '90 × 90 cm'),
    (91, '50 × 50 cm'),
    (92, '60 × 80 cm'),
    (93, '80 × 65 cm'),
    (94, '50 × 80 cm');
  -- uma linha de texto por produto, campos separados por «|» (vazio = sem valor): pedaços do nome | sem preço (1/0) |
  -- sub | modelo | custo | pvp | marca | fornecedor | descrição | código do fornecedor | cor | corpo | frente | tonalidade |
  -- veta | puxador | posição do puxador | lado | largura | medida
  CREATE TEMP TABLE _tmv (partes integer[] NOT NULL, sem_preco boolean NOT NULL, sub text NOT NULL, numero smallint NOT NULL,
                          custo numeric, pvp numeric, marca integer NOT NULL, fornecedor integer NOT NULL, descricao integer,
                          cod_forn text, cods text[] NOT NULL, medida integer, nome text, attrs text) ON COMMIT DROP;
  INSERT INTO _tmv (partes, sem_preco, sub, numero, custo, pvp, marca, fornecedor, descricao, cod_forn, cods, medida)
  SELECT string_to_array(f[1], '.')::integer[], f[2] = '1', f[3], f[4]::smallint, nullif(f[5], '')::numeric, nullif(f[6], '')::numeric,
         f[7]::integer, f[8]::integer, nullif(f[9], '')::integer, nullif(f[10], ''), f[11:19], nullif(f[20], '')::integer
  FROM (SELECT string_to_array(s, '|') AS f
        FROM regexp_split_to_table($linhas$
1.2.3|0|ML|1|172.80|320.00|1|1|1|||WH|WH|||||ESQ||1
1.2.4|0|ML|2|302.40|560.00|1|1|1|||WH|WH|||||ESQ||1
1.2.5|0|ML|1|172.80|320.00|1|1|1|||WH|AZB|||||ESQ||1
1.2.6|0|ML|2|302.40|560.00|1|1|1|||WH|AZB|||||ESQ||1
1.2.7|0|ML|1|172.80|320.00|1|1|1|||WH|DEN|||||ESQ||1
1.2.8|0|ML|2|302.40|560.00|1|1|1|||WH|DEN|||||ESQ||1
1.2.9|0|ML|1|199.80|370.00|1|1|1|||WH|BCO|B||||ESQ||1
1.2.10|0|ML|2|329.40|610.00|1|1|1|||WH|BCO|B||||ESQ||1
1.2.11|0|ML|1|199.80|370.00|1|1|1|||WH|BCO|M||||ESQ||1
1.2.12|0|ML|2|329.40|610.00|1|1|1|||WH|BCO|M||||ESQ||1
1.2.13|0|ML|1|199.80|370.00|1|1|1|||WH|CCL|B||||ESQ||1
1.2.14|0|ML|2|329.40|610.00|1|1|1|||WH|CCL|B||||ESQ||1
1.2.15|0|ML|1|199.80|370.00|1|1|1|||WH|CCL|M||||ESQ||1
1.2.16|0|ML|2|329.40|610.00|1|1|1|||WH|CCL|M||||ESQ||1
1.2.17|0|ML|1|199.80|370.00|1|1|1|||WH|CME|B||||ESQ||1
1.2.18|0|ML|2|329.40|610.00|1|1|1|||WH|CME|B||||ESQ||1
1.2.19|0|ML|1|199.80|370.00|1|1|1|||WH|CME|M||||ESQ||1
1.2.20|0|ML|2|329.40|610.00|1|1|1|||WH|CME|M||||ESQ||1
1.2.21|0|ML|1|199.80|370.00|1|1|1|||WH|ANT|B||||ESQ||1
1.2.22|0|ML|2|329.40|610.00|1|1|1|||WH|ANT|B||||ESQ||1
1.2.23|0|ML|1|199.80|370.00|1|1|1|||WH|ANT|M||||ESQ||1
1.2.24|0|ML|2|329.40|610.00|1|1|1|||WH|ANT|M||||ESQ||1
1.2.25|0|ML|1|199.80|370.00|1|1|1|||WH|PTO|B||||ESQ||1
1.2.26|0|ML|2|329.40|610.00|1|1|1|||WH|PTO|B||||ESQ||1
1.2.27|0|ML|1|199.80|370.00|1|1|1|||WH|PTO|M||||ESQ||1
1.2.28|0|ML|2|329.40|610.00|1|1|1|||WH|PTO|M||||ESQ||1
1.2.29|0|ML|1|199.80|370.00|1|1|1|||WH|CRE|B||||ESQ||1
1.2.30|0|ML|2|329.40|610.00|1|1|1|||WH|CRE|B||||ESQ||1
1.2.31|0|ML|1|199.80|370.00|1|1|1|||WH|CRE|M||||ESQ||1
1.2.32|0|ML|2|329.40|610.00|1|1|1|||WH|CRE|M||||ESQ||1
1.2.33|0|ML|1|199.80|370.00|1|1|1|||WH|CAM|B||||ESQ||1
1.2.34|0|ML|2|329.40|610.00|1|1|1|||WH|CAM|B||||ESQ||1
1.2.35|0|ML|1|199.80|370.00|1|1|1|||WH|CAM|M||||ESQ||1
1.2.36|0|ML|2|329.40|610.00|1|1|1|||WH|CAM|M||||ESQ||1
1.2.37|0|ML|1|199.80|370.00|1|1|1|||WH|OUR|B||||ESQ||1
1.2.38|0|ML|2|329.40|610.00|1|1|1|||WH|OUR|B||||ESQ||1
1.2.39|0|ML|1|199.80|370.00|1|1|1|||WH|OUR|M||||ESQ||1
1.2.40|0|ML|2|329.40|610.00|1|1|1|||WH|OUR|M||||ESQ||1
1.2.41|0|ML|1|199.80|370.00|1|1|1|||WH|COB|B||||ESQ||1
1.2.42|0|ML|2|329.40|610.00|1|1|1|||WH|COB|B||||ESQ||1
1.2.43|0|ML|1|199.80|370.00|1|1|1|||WH|COB|M||||ESQ||1
1.2.44|0|ML|2|329.40|610.00|1|1|1|||WH|COB|M||||ESQ||1
1.2.45|0|ML|1|199.80|370.00|1|1|1|||WH|CHO|B||||ESQ||1
1.2.46|0|ML|2|329.40|610.00|1|1|1|||WH|CHO|B||||ESQ||1
1.2.47|0|ML|1|199.80|370.00|1|1|1|||WH|CHO|M||||ESQ||1
1.2.48|0|ML|2|329.40|610.00|1|1|1|||WH|CHO|M||||ESQ||1
1.2.49|0|ML|1|199.80|370.00|1|1|1|||WH|VAG|B||||ESQ||1
1.2.50|0|ML|2|329.40|610.00|1|1|1|||WH|VAG|B||||ESQ||1
1.2.51|0|ML|1|199.80|370.00|1|1|1|||WH|VAG|M||||ESQ||1
1.2.52|0|ML|2|329.40|610.00|1|1|1|||WH|VAG|M||||ESQ||1
1.2.53|0|ML|1|199.80|370.00|1|1|1|||WH|AZE|B||||ESQ||1
1.2.54|0|ML|2|329.40|610.00|1|1|1|||WH|AZE|B||||ESQ||1
1.2.55|0|ML|1|199.80|370.00|1|1|1|||WH|AZE|M||||ESQ||1
1.2.56|0|ML|2|329.40|610.00|1|1|1|||WH|AZE|M||||ESQ||1
1.2.57|0|ML|1|199.80|370.00|1|1|1|||WH|AMA|B||||ESQ||1
1.2.58|0|ML|2|329.40|610.00|1|1|1|||WH|AMA|B||||ESQ||1
1.2.59|0|ML|1|199.80|370.00|1|1|1|||WH|AMA|M||||ESQ||1
1.2.60|0|ML|2|329.40|610.00|1|1|1|||WH|AMA|M||||ESQ||1
1.2.61|0|ML|1|199.80|370.00|1|1|1|||WH|AES|B||||ESQ||1
1.2.62|0|ML|2|329.40|610.00|1|1|1|||WH|AES|B||||ESQ||1
1.2.63|0|ML|1|199.80|370.00|1|1|1|||WH|AES|M||||ESQ||1
1.2.64|0|ML|2|329.40|610.00|1|1|1|||WH|AES|M||||ESQ||1
1.2.65|0|ML|1|199.80|370.00|1|1|1|||WH|PRA|B||||ESQ||1
1.2.66|0|ML|2|329.40|610.00|1|1|1|||WH|PRA|B||||ESQ||1
1.2.67|0|ML|1|199.80|370.00|1|1|1|||WH|PRA|M||||ESQ||1
1.2.68|0|ML|2|329.40|610.00|1|1|1|||WH|PRA|M||||ESQ||1
1.2.69|0|ML|1|199.80|370.00|1|1|1|||WH|ROS|B||||ESQ||1
1.2.70|0|ML|2|329.40|610.00|1|1|1|||WH|ROS|B||||ESQ||1
1.2.71|0|ML|1|199.80|370.00|1|1|1|||WH|ROS|M||||ESQ||1
1.2.72|0|ML|2|329.40|610.00|1|1|1|||WH|ROS|M||||ESQ||1
1.2.73|0|ML|1|199.80|370.00|1|1|1|||WH|VER|B||||ESQ||1
1.2.74|0|ML|2|329.40|610.00|1|1|1|||WH|VER|B||||ESQ||1
1.2.75|0|ML|1|199.80|370.00|1|1|1|||WH|VER|M||||ESQ||1
1.2.76|0|ML|2|329.40|610.00|1|1|1|||WH|VER|M||||ESQ||1
1.2.77|0|ML|1|199.80|370.00|1|1|1|||WH|OAK|||||ESQ||1
1.2.78|0|ML|2|329.40|610.00|1|1|1|||WH|OAK|||||ESQ||1
1.2.79|0|ML|1|199.80|370.00|1|1|1|||WH|TEA|||||ESQ||1
1.2.80|0|ML|2|329.40|610.00|1|1|1|||WH|TEA|||||ESQ||1
1.2.81|0|ML|1|199.80|370.00|1|1|1|||WH|JOP|||||ESQ||1
1.2.82|0|ML|2|329.40|610.00|1|1|1|||WH|JOP|||||ESQ||1
1.2.83|0|ML|1|199.80|370.00|1|1|1|||WH|BLK|||||ESQ||1
1.2.84|0|ML|2|329.40|610.00|1|1|1|||WH|BLK|||||ESQ||1
1.2.85|0|ML|1|199.80|370.00|1|1|1|||WH|ART|||||ESQ||1
1.2.86|0|ML|2|329.40|610.00|1|1|1|||WH|ART|||||ESQ||1
1.2.87|0|ML|1|199.80|370.00|1|1|1|||WH|LIN|||||ESQ||1
1.2.88|0|ML|2|329.40|610.00|1|1|1|||WH|LIN|||||ESQ||1
1.2.89|0|ML|1|199.80|370.00|1|1|1|||WH|HAL|||||ESQ||1
1.2.90|0|ML|2|329.40|610.00|1|1|1|||WH|HAL|||||ESQ||1
1.2.91|0|ML|1|221.40|410.00|1|1|1|||BCO|BCO|B||||ESQ||1
1.2.92|0|ML|2|351.00|650.00|1|1|1|||BCO|BCO|B||||ESQ||1
1.2.93|0|ML|1|221.40|410.00|1|1|1|||BCO|BCO|M||||ESQ||1
1.2.94|0|ML|2|351.00|650.00|1|1|1|||BCO|BCO|M||||ESQ||1
1.2.95|0|ML|1|221.40|410.00|1|1|1|||CCL|CCL|B||||ESQ||1
1.2.96|0|ML|2|351.00|650.00|1|1|1|||CCL|CCL|B||||ESQ||1
1.2.97|0|ML|1|221.40|410.00|1|1|1|||CCL|CCL|M||||ESQ||1
1.2.98|0|ML|2|351.00|650.00|1|1|1|||CCL|CCL|M||||ESQ||1
1.2.99|0|ML|1|221.40|410.00|1|1|1|||CME|CME|B||||ESQ||1
1.2.100|0|ML|2|351.00|650.00|1|1|1|||CME|CME|B||||ESQ||1
1.2.101|0|ML|1|221.40|410.00|1|1|1|||CME|CME|M||||ESQ||1
1.2.102|0|ML|2|351.00|650.00|1|1|1|||CME|CME|M||||ESQ||1
1.2.103|0|ML|1|221.40|410.00|1|1|1|||ANT|ANT|B||||ESQ||1
1.2.104|0|ML|2|351.00|650.00|1|1|1|||ANT|ANT|B||||ESQ||1
1.2.105|0|ML|1|221.40|410.00|1|1|1|||ANT|ANT|M||||ESQ||1
1.2.106|0|ML|2|351.00|650.00|1|1|1|||ANT|ANT|M||||ESQ||1
1.2.107|0|ML|1|221.40|410.00|1|1|1|||PTO|PTO|B||||ESQ||1
1.2.108|0|ML|2|351.00|650.00|1|1|1|||PTO|PTO|B||||ESQ||1
1.2.109|0|ML|1|221.40|410.00|1|1|1|||PTO|PTO|M||||ESQ||1
1.2.110|0|ML|2|351.00|650.00|1|1|1|||PTO|PTO|M||||ESQ||1
1.2.111|0|ML|1|221.40|410.00|1|1|1|||CRE|CRE|B||||ESQ||1
1.2.112|0|ML|2|351.00|650.00|1|1|1|||CRE|CRE|B||||ESQ||1
1.2.113|0|ML|1|221.40|410.00|1|1|1|||CRE|CRE|M||||ESQ||1
1.2.114|0|ML|2|351.00|650.00|1|1|1|||CRE|CRE|M||||ESQ||1
1.2.115|0|ML|1|221.40|410.00|1|1|1|||CAM|CAM|B||||ESQ||1
1.2.116|0|ML|2|351.00|650.00|1|1|1|||CAM|CAM|B||||ESQ||1
1.2.117|0|ML|1|221.40|410.00|1|1|1|||CAM|CAM|M||||ESQ||1
1.2.118|0|ML|2|351.00|650.00|1|1|1|||CAM|CAM|M||||ESQ||1
1.2.119|0|ML|1|221.40|410.00|1|1|1|||OUR|OUR|B||||ESQ||1
1.2.120|0|ML|2|351.00|650.00|1|1|1|||OUR|OUR|B||||ESQ||1
1.2.121|0|ML|1|221.40|410.00|1|1|1|||OUR|OUR|M||||ESQ||1
1.2.122|0|ML|2|351.00|650.00|1|1|1|||OUR|OUR|M||||ESQ||1
1.2.123|0|ML|1|221.40|410.00|1|1|1|||COB|COB|B||||ESQ||1
1.2.124|0|ML|2|351.00|650.00|1|1|1|||COB|COB|B||||ESQ||1
1.2.125|0|ML|1|221.40|410.00|1|1|1|||COB|COB|M||||ESQ||1
1.2.126|0|ML|2|351.00|650.00|1|1|1|||COB|COB|M||||ESQ||1
1.2.127|0|ML|1|221.40|410.00|1|1|1|||CHO|CHO|B||||ESQ||1
1.2.128|0|ML|2|351.00|650.00|1|1|1|||CHO|CHO|B||||ESQ||1
1.2.129|0|ML|1|221.40|410.00|1|1|1|||CHO|CHO|M||||ESQ||1
1.2.130|0|ML|2|351.00|650.00|1|1|1|||CHO|CHO|M||||ESQ||1
1.2.131|0|ML|1|221.40|410.00|1|1|1|||VAG|VAG|B||||ESQ||1
1.2.132|0|ML|2|351.00|650.00|1|1|1|||VAG|VAG|B||||ESQ||1
1.2.133|0|ML|1|221.40|410.00|1|1|1|||VAG|VAG|M||||ESQ||1
1.2.134|0|ML|2|351.00|650.00|1|1|1|||VAG|VAG|M||||ESQ||1
1.2.135|0|ML|1|221.40|410.00|1|1|1|||AZE|AZE|B||||ESQ||1
1.2.136|0|ML|2|351.00|650.00|1|1|1|||AZE|AZE|B||||ESQ||1
1.2.137|0|ML|1|221.40|410.00|1|1|1|||AZE|AZE|M||||ESQ||1
1.2.138|0|ML|2|351.00|650.00|1|1|1|||AZE|AZE|M||||ESQ||1
1.2.139|0|ML|1|221.40|410.00|1|1|1|||AMA|AMA|B||||ESQ||1
1.2.140|0|ML|2|351.00|650.00|1|1|1|||AMA|AMA|B||||ESQ||1
1.2.141|0|ML|1|221.40|410.00|1|1|1|||AMA|AMA|M||||ESQ||1
1.2.142|0|ML|2|351.00|650.00|1|1|1|||AMA|AMA|M||||ESQ||1
1.2.143|0|ML|1|221.40|410.00|1|1|1|||AES|AES|B||||ESQ||1
1.2.144|0|ML|2|351.00|650.00|1|1|1|||AES|AES|B||||ESQ||1
1.2.145|0|ML|1|221.40|410.00|1|1|1|||AES|AES|M||||ESQ||1
1.2.146|0|ML|2|351.00|650.00|1|1|1|||AES|AES|M||||ESQ||1
1.2.147|0|ML|1|221.40|410.00|1|1|1|||PRA|PRA|B||||ESQ||1
1.2.148|0|ML|2|351.00|650.00|1|1|1|||PRA|PRA|B||||ESQ||1
1.2.149|0|ML|1|221.40|410.00|1|1|1|||PRA|PRA|M||||ESQ||1
1.2.150|0|ML|2|351.00|650.00|1|1|1|||PRA|PRA|M||||ESQ||1
1.2.151|0|ML|1|221.40|410.00|1|1|1|||ROS|ROS|B||||ESQ||1
1.2.152|0|ML|2|351.00|650.00|1|1|1|||ROS|ROS|B||||ESQ||1
1.2.153|0|ML|1|221.40|410.00|1|1|1|||ROS|ROS|M||||ESQ||1
1.2.154|0|ML|2|351.00|650.00|1|1|1|||ROS|ROS|M||||ESQ||1
1.2.155|0|ML|1|221.40|410.00|1|1|1|||VER|VER|B||||ESQ||1
1.2.156|0|ML|2|351.00|650.00|1|1|1|||VER|VER|B||||ESQ||1
1.2.157|0|ML|1|221.40|410.00|1|1|1|||VER|VER|M||||ESQ||1
1.2.158|0|ML|2|351.00|650.00|1|1|1|||VER|VER|M||||ESQ||1
1.2.159|0|ML|1|221.40|410.00|1|1|1|||OAK|OAK|||||ESQ||1
1.2.160|0|ML|2|351.00|650.00|1|1|1|||OAK|OAK|||||ESQ||1
1.2.161|0|ML|1|221.40|410.00|1|1|1|||TEA|TEA|||||ESQ||1
1.2.162|0|ML|2|351.00|650.00|1|1|1|||TEA|TEA|||||ESQ||1
1.2.163|0|ML|1|221.40|410.00|1|1|1|||JOP|JOP|||||ESQ||1
1.2.164|0|ML|2|351.00|650.00|1|1|1|||JOP|JOP|||||ESQ||1
1.2.165|0|ML|1|221.40|410.00|1|1|1|||AZB|AZB|||||ESQ||1
1.2.166|0|ML|2|351.00|650.00|1|1|1|||AZB|AZB|||||ESQ||1
1.2.167|0|ML|1|221.40|410.00|1|1|1|||DEN|DEN|||||ESQ||1
1.2.168|0|ML|2|351.00|650.00|1|1|1|||DEN|DEN|||||ESQ||1
1.2.169|0|ML|1|221.40|410.00|1|1|1|||BLK|BLK|||||ESQ||1
1.2.170|0|ML|2|351.00|650.00|1|1|1|||BLK|BLK|||||ESQ||1
1.2.171|0|ML|1|221.40|410.00|1|1|1|||ART|ART|||||ESQ||1
1.2.172|0|ML|2|351.00|650.00|1|1|1|||ART|ART|||||ESQ||1
1.2.173|0|ML|1|221.40|410.00|1|1|1|||LIN|LIN|||||ESQ||1
1.2.174|0|ML|2|351.00|650.00|1|1|1|||LIN|LIN|||||ESQ||1
1.2.175|0|ML|1|221.40|410.00|1|1|1|||HAL|HAL|||||ESQ||1
1.2.176|0|ML|2|351.00|650.00|1|1|1|||HAL|HAL|||||ESQ||1
1.177.3|0|ML|1|207.36|384.00|1|1|1|||WH|WH|||||DIR||1
1.177.4|0|ML|2|362.88|672.00|1|1|1|||WH|WH|||||DIR||1
1.177.5|0|ML|1|207.36|384.00|1|1|1|||WH|AZB|||||DIR||1
1.177.6|0|ML|2|362.88|672.00|1|1|1|||WH|AZB|||||DIR||1
1.177.7|0|ML|1|207.36|384.00|1|1|1|||WH|DEN|||||DIR||1
1.177.8|0|ML|2|362.88|672.00|1|1|1|||WH|DEN|||||DIR||1
1.177.9|0|ML|1|234.36|434.00|1|1|1|||WH|BCO|B||||DIR||1
1.177.10|0|ML|2|389.88|722.00|1|1|1|||WH|BCO|B||||DIR||1
1.177.11|0|ML|1|234.36|434.00|1|1|1|||WH|BCO|M||||DIR||1
1.177.12|0|ML|2|389.88|722.00|1|1|1|||WH|BCO|M||||DIR||1
1.177.13|0|ML|1|234.36|434.00|1|1|1|||WH|CCL|B||||DIR||1
1.177.14|0|ML|2|389.88|722.00|1|1|1|||WH|CCL|B||||DIR||1
1.177.15|0|ML|1|234.36|434.00|1|1|1|||WH|CCL|M||||DIR||1
1.177.16|0|ML|2|389.88|722.00|1|1|1|||WH|CCL|M||||DIR||1
1.177.17|0|ML|1|234.36|434.00|1|1|1|||WH|CME|B||||DIR||1
1.177.18|0|ML|2|389.88|722.00|1|1|1|||WH|CME|B||||DIR||1
1.177.19|0|ML|1|234.36|434.00|1|1|1|||WH|CME|M||||DIR||1
1.177.20|0|ML|2|389.88|722.00|1|1|1|||WH|CME|M||||DIR||1
1.177.21|0|ML|1|234.36|434.00|1|1|1|||WH|ANT|B||||DIR||1
1.177.22|0|ML|2|389.88|722.00|1|1|1|||WH|ANT|B||||DIR||1
1.177.23|0|ML|1|234.36|434.00|1|1|1|||WH|ANT|M||||DIR||1
1.177.24|0|ML|2|389.88|722.00|1|1|1|||WH|ANT|M||||DIR||1
1.177.25|0|ML|1|234.36|434.00|1|1|1|||WH|PTO|B||||DIR||1
1.177.26|0|ML|2|389.88|722.00|1|1|1|||WH|PTO|B||||DIR||1
1.177.27|0|ML|1|234.36|434.00|1|1|1|||WH|PTO|M||||DIR||1
1.177.28|0|ML|2|389.88|722.00|1|1|1|||WH|PTO|M||||DIR||1
1.177.29|0|ML|1|234.36|434.00|1|1|1|||WH|CRE|B||||DIR||1
1.177.30|0|ML|2|389.88|722.00|1|1|1|||WH|CRE|B||||DIR||1
1.177.31|0|ML|1|234.36|434.00|1|1|1|||WH|CRE|M||||DIR||1
1.177.32|0|ML|2|389.88|722.00|1|1|1|||WH|CRE|M||||DIR||1
1.177.33|0|ML|1|234.36|434.00|1|1|1|||WH|CAM|B||||DIR||1
1.177.34|0|ML|2|389.88|722.00|1|1|1|||WH|CAM|B||||DIR||1
1.177.35|0|ML|1|234.36|434.00|1|1|1|||WH|CAM|M||||DIR||1
1.177.36|0|ML|2|389.88|722.00|1|1|1|||WH|CAM|M||||DIR||1
1.177.37|0|ML|1|234.36|434.00|1|1|1|||WH|OUR|B||||DIR||1
1.177.38|0|ML|2|389.88|722.00|1|1|1|||WH|OUR|B||||DIR||1
1.177.39|0|ML|1|234.36|434.00|1|1|1|||WH|OUR|M||||DIR||1
1.177.40|0|ML|2|389.88|722.00|1|1|1|||WH|OUR|M||||DIR||1
1.177.41|0|ML|1|234.36|434.00|1|1|1|||WH|COB|B||||DIR||1
1.177.42|0|ML|2|389.88|722.00|1|1|1|||WH|COB|B||||DIR||1
1.177.43|0|ML|1|234.36|434.00|1|1|1|||WH|COB|M||||DIR||1
1.177.44|0|ML|2|389.88|722.00|1|1|1|||WH|COB|M||||DIR||1
1.177.45|0|ML|1|234.36|434.00|1|1|1|||WH|CHO|B||||DIR||1
1.177.46|0|ML|2|389.88|722.00|1|1|1|||WH|CHO|B||||DIR||1
1.177.47|0|ML|1|234.36|434.00|1|1|1|||WH|CHO|M||||DIR||1
1.177.48|0|ML|2|389.88|722.00|1|1|1|||WH|CHO|M||||DIR||1
1.177.49|0|ML|1|234.36|434.00|1|1|1|||WH|VAG|B||||DIR||1
1.177.50|0|ML|2|389.88|722.00|1|1|1|||WH|VAG|B||||DIR||1
1.177.51|0|ML|1|234.36|434.00|1|1|1|||WH|VAG|M||||DIR||1
1.177.52|0|ML|2|389.88|722.00|1|1|1|||WH|VAG|M||||DIR||1
1.177.53|0|ML|1|234.36|434.00|1|1|1|||WH|AZE|B||||DIR||1
1.177.54|0|ML|2|389.88|722.00|1|1|1|||WH|AZE|B||||DIR||1
1.177.55|0|ML|1|234.36|434.00|1|1|1|||WH|AZE|M||||DIR||1
1.177.56|0|ML|2|389.88|722.00|1|1|1|||WH|AZE|M||||DIR||1
1.177.57|0|ML|1|234.36|434.00|1|1|1|||WH|AMA|B||||DIR||1
1.177.58|0|ML|2|389.88|722.00|1|1|1|||WH|AMA|B||||DIR||1
1.177.59|0|ML|1|234.36|434.00|1|1|1|||WH|AMA|M||||DIR||1
1.177.60|0|ML|2|389.88|722.00|1|1|1|||WH|AMA|M||||DIR||1
1.177.61|0|ML|1|234.36|434.00|1|1|1|||WH|AES|B||||DIR||1
1.177.62|0|ML|2|389.88|722.00|1|1|1|||WH|AES|B||||DIR||1
1.177.63|0|ML|1|234.36|434.00|1|1|1|||WH|AES|M||||DIR||1
1.177.64|0|ML|2|389.88|722.00|1|1|1|||WH|AES|M||||DIR||1
1.177.65|0|ML|1|234.36|434.00|1|1|1|||WH|PRA|B||||DIR||1
1.177.66|0|ML|2|389.88|722.00|1|1|1|||WH|PRA|B||||DIR||1
1.177.67|0|ML|1|234.36|434.00|1|1|1|||WH|PRA|M||||DIR||1
1.177.68|0|ML|2|389.88|722.00|1|1|1|||WH|PRA|M||||DIR||1
1.177.69|0|ML|1|234.36|434.00|1|1|1|||WH|ROS|B||||DIR||1
1.177.70|0|ML|2|389.88|722.00|1|1|1|||WH|ROS|B||||DIR||1
1.177.71|0|ML|1|234.36|434.00|1|1|1|||WH|ROS|M||||DIR||1
1.177.72|0|ML|2|389.88|722.00|1|1|1|||WH|ROS|M||||DIR||1
1.177.73|0|ML|1|234.36|434.00|1|1|1|||WH|VER|B||||DIR||1
1.177.74|0|ML|2|389.88|722.00|1|1|1|||WH|VER|B||||DIR||1
1.177.75|0|ML|1|234.36|434.00|1|1|1|||WH|VER|M||||DIR||1
1.177.76|0|ML|2|389.88|722.00|1|1|1|||WH|VER|M||||DIR||1
1.177.77|0|ML|1|234.36|434.00|1|1|1|||WH|OAK|||||DIR||1
1.177.78|0|ML|2|389.88|722.00|1|1|1|||WH|OAK|||||DIR||1
1.177.79|0|ML|1|234.36|434.00|1|1|1|||WH|TEA|||||DIR||1
1.177.80|0|ML|2|389.88|722.00|1|1|1|||WH|TEA|||||DIR||1
1.177.81|0|ML|1|234.36|434.00|1|1|1|||WH|JOP|||||DIR||1
1.177.82|0|ML|2|389.88|722.00|1|1|1|||WH|JOP|||||DIR||1
1.177.83|0|ML|1|234.36|434.00|1|1|1|||WH|BLK|||||DIR||1
1.177.84|0|ML|2|389.88|722.00|1|1|1|||WH|BLK|||||DIR||1
1.177.85|0|ML|1|234.36|434.00|1|1|1|||WH|ART|||||DIR||1
1.177.86|0|ML|2|389.88|722.00|1|1|1|||WH|ART|||||DIR||1
1.177.87|0|ML|1|234.36|434.00|1|1|1|||WH|LIN|||||DIR||1
1.177.88|0|ML|2|389.88|722.00|1|1|1|||WH|LIN|||||DIR||1
1.177.89|0|ML|1|234.36|434.00|1|1|1|||WH|HAL|||||DIR||1
1.177.90|0|ML|2|389.88|722.00|1|1|1|||WH|HAL|||||DIR||1
1.177.91|0|ML|1|255.96|474.00|1|1|1|||BCO|BCO|B||||DIR||1
1.177.92|0|ML|2|411.48|762.00|1|1|1|||BCO|BCO|B||||DIR||1
1.177.93|0|ML|1|255.96|474.00|1|1|1|||BCO|BCO|M||||DIR||1
1.177.94|0|ML|2|411.48|762.00|1|1|1|||BCO|BCO|M||||DIR||1
1.177.95|0|ML|1|255.96|474.00|1|1|1|||CCL|CCL|B||||DIR||1
1.177.96|0|ML|2|411.48|762.00|1|1|1|||CCL|CCL|B||||DIR||1
1.177.97|0|ML|1|255.96|474.00|1|1|1|||CCL|CCL|M||||DIR||1
1.177.98|0|ML|2|411.48|762.00|1|1|1|||CCL|CCL|M||||DIR||1
1.177.99|0|ML|1|255.96|474.00|1|1|1|||CME|CME|B||||DIR||1
1.177.100|0|ML|2|411.48|762.00|1|1|1|||CME|CME|B||||DIR||1
1.177.101|0|ML|1|255.96|474.00|1|1|1|||CME|CME|M||||DIR||1
1.177.102|0|ML|2|411.48|762.00|1|1|1|||CME|CME|M||||DIR||1
1.177.103|0|ML|1|255.96|474.00|1|1|1|||ANT|ANT|B||||DIR||1
1.177.104|0|ML|2|411.48|762.00|1|1|1|||ANT|ANT|B||||DIR||1
1.177.105|0|ML|1|255.96|474.00|1|1|1|||ANT|ANT|M||||DIR||1
1.177.106|0|ML|2|411.48|762.00|1|1|1|||ANT|ANT|M||||DIR||1
1.177.107|0|ML|1|255.96|474.00|1|1|1|||PTO|PTO|B||||DIR||1
1.177.108|0|ML|2|411.48|762.00|1|1|1|||PTO|PTO|B||||DIR||1
1.177.109|0|ML|1|255.96|474.00|1|1|1|||PTO|PTO|M||||DIR||1
1.177.110|0|ML|2|411.48|762.00|1|1|1|||PTO|PTO|M||||DIR||1
1.177.111|0|ML|1|255.96|474.00|1|1|1|||CRE|CRE|B||||DIR||1
1.177.112|0|ML|2|411.48|762.00|1|1|1|||CRE|CRE|B||||DIR||1
1.177.113|0|ML|1|255.96|474.00|1|1|1|||CRE|CRE|M||||DIR||1
1.177.114|0|ML|2|411.48|762.00|1|1|1|||CRE|CRE|M||||DIR||1
1.177.115|0|ML|1|255.96|474.00|1|1|1|||CAM|CAM|B||||DIR||1
1.177.116|0|ML|2|411.48|762.00|1|1|1|||CAM|CAM|B||||DIR||1
1.177.117|0|ML|1|255.96|474.00|1|1|1|||CAM|CAM|M||||DIR||1
1.177.118|0|ML|2|411.48|762.00|1|1|1|||CAM|CAM|M||||DIR||1
1.177.119|0|ML|1|255.96|474.00|1|1|1|||OUR|OUR|B||||DIR||1
1.177.120|0|ML|2|411.48|762.00|1|1|1|||OUR|OUR|B||||DIR||1
1.177.121|0|ML|1|255.96|474.00|1|1|1|||OUR|OUR|M||||DIR||1
1.177.122|0|ML|2|411.48|762.00|1|1|1|||OUR|OUR|M||||DIR||1
1.177.123|0|ML|1|255.96|474.00|1|1|1|||COB|COB|B||||DIR||1
1.177.124|0|ML|2|411.48|762.00|1|1|1|||COB|COB|B||||DIR||1
1.177.125|0|ML|1|255.96|474.00|1|1|1|||COB|COB|M||||DIR||1
1.177.126|0|ML|2|411.48|762.00|1|1|1|||COB|COB|M||||DIR||1
1.177.127|0|ML|1|255.96|474.00|1|1|1|||CHO|CHO|B||||DIR||1
1.177.128|0|ML|2|411.48|762.00|1|1|1|||CHO|CHO|B||||DIR||1
1.177.129|0|ML|1|255.96|474.00|1|1|1|||CHO|CHO|M||||DIR||1
1.177.130|0|ML|2|411.48|762.00|1|1|1|||CHO|CHO|M||||DIR||1
1.177.131|0|ML|1|255.96|474.00|1|1|1|||VAG|VAG|B||||DIR||1
1.177.132|0|ML|2|411.48|762.00|1|1|1|||VAG|VAG|B||||DIR||1
1.177.133|0|ML|1|255.96|474.00|1|1|1|||VAG|VAG|M||||DIR||1
1.177.134|0|ML|2|411.48|762.00|1|1|1|||VAG|VAG|M||||DIR||1
1.177.135|0|ML|1|255.96|474.00|1|1|1|||AZE|AZE|B||||DIR||1
1.177.136|0|ML|2|411.48|762.00|1|1|1|||AZE|AZE|B||||DIR||1
1.177.137|0|ML|1|255.96|474.00|1|1|1|||AZE|AZE|M||||DIR||1
1.177.138|0|ML|2|411.48|762.00|1|1|1|||AZE|AZE|M||||DIR||1
1.177.139|0|ML|1|255.96|474.00|1|1|1|||AMA|AMA|B||||DIR||1
1.177.140|0|ML|2|411.48|762.00|1|1|1|||AMA|AMA|B||||DIR||1
1.177.141|0|ML|1|255.96|474.00|1|1|1|||AMA|AMA|M||||DIR||1
1.177.142|0|ML|2|411.48|762.00|1|1|1|||AMA|AMA|M||||DIR||1
1.177.143|0|ML|1|255.96|474.00|1|1|1|||AES|AES|B||||DIR||1
1.177.144|0|ML|2|411.48|762.00|1|1|1|||AES|AES|B||||DIR||1
1.177.145|0|ML|1|255.96|474.00|1|1|1|||AES|AES|M||||DIR||1
1.177.146|0|ML|2|411.48|762.00|1|1|1|||AES|AES|M||||DIR||1
1.177.147|0|ML|1|255.96|474.00|1|1|1|||PRA|PRA|B||||DIR||1
1.177.148|0|ML|2|411.48|762.00|1|1|1|||PRA|PRA|B||||DIR||1
1.177.149|0|ML|1|255.96|474.00|1|1|1|||PRA|PRA|M||||DIR||1
1.177.150|0|ML|2|411.48|762.00|1|1|1|||PRA|PRA|M||||DIR||1
1.177.151|0|ML|1|255.96|474.00|1|1|1|||ROS|ROS|B||||DIR||1
1.177.152|0|ML|2|411.48|762.00|1|1|1|||ROS|ROS|B||||DIR||1
1.177.153|0|ML|1|255.96|474.00|1|1|1|||ROS|ROS|M||||DIR||1
1.177.154|0|ML|2|411.48|762.00|1|1|1|||ROS|ROS|M||||DIR||1
1.177.155|0|ML|1|255.96|474.00|1|1|1|||VER|VER|B||||DIR||1
1.177.156|0|ML|2|411.48|762.00|1|1|1|||VER|VER|B||||DIR||1
1.177.157|0|ML|1|255.96|474.00|1|1|1|||VER|VER|M||||DIR||1
1.177.158|0|ML|2|411.48|762.00|1|1|1|||VER|VER|M||||DIR||1
1.177.159|0|ML|1|255.96|474.00|1|1|1|||OAK|OAK|||||DIR||1
1.177.160|0|ML|2|411.48|762.00|1|1|1|||OAK|OAK|||||DIR||1
1.177.161|0|ML|1|255.96|474.00|1|1|1|||TEA|TEA|||||DIR||1
1.177.162|0|ML|2|411.48|762.00|1|1|1|||TEA|TEA|||||DIR||1
1.177.163|0|ML|1|255.96|474.00|1|1|1|||JOP|JOP|||||DIR||1
1.177.164|0|ML|2|411.48|762.00|1|1|1|||JOP|JOP|||||DIR||1
1.177.165|0|ML|1|255.96|474.00|1|1|1|||AZB|AZB|||||DIR||1
1.177.166|0|ML|2|411.48|762.00|1|1|1|||AZB|AZB|||||DIR||1
1.177.167|0|ML|1|255.96|474.00|1|1|1|||DEN|DEN|||||DIR||1
1.177.168|0|ML|2|411.48|762.00|1|1|1|||DEN|DEN|||||DIR||1
1.177.169|0|ML|1|255.96|474.00|1|1|1|||BLK|BLK|||||DIR||1
1.177.170|0|ML|2|411.48|762.00|1|1|1|||BLK|BLK|||||DIR||1
1.177.171|0|ML|1|255.96|474.00|1|1|1|||ART|ART|||||DIR||1
1.177.172|0|ML|2|411.48|762.00|1|1|1|||ART|ART|||||DIR||1
1.177.173|0|ML|1|255.96|474.00|1|1|1|||LIN|LIN|||||DIR||1
1.177.174|0|ML|2|411.48|762.00|1|1|1|||LIN|LIN|||||DIR||1
1.177.175|0|ML|1|255.96|474.00|1|1|1|||HAL|HAL|||||DIR||1
1.177.176|0|ML|2|411.48|762.00|1|1|1|||HAL|HAL|||||DIR||1
178.179.3|0|ML|1|216.00|400.00|1|1|1|||WH|WH|||||ESQ||2
178.179.4|0|ML|2|332.10|615.00|1|1|1|||WH|WH|||||ESQ||2
178.179.5|0|ML|1|216.00|400.00|1|1|1|||WH|AZB|||||ESQ||2
178.179.6|0|ML|2|332.10|615.00|1|1|1|||WH|AZB|||||ESQ||2
178.179.7|0|ML|1|216.00|400.00|1|1|1|||WH|DEN|||||ESQ||2
178.179.8|0|ML|2|332.10|615.00|1|1|1|||WH|DEN|||||ESQ||2
178.179.9|0|ML|1|243.00|450.00|1|1|1|||WH|BCO|B||||ESQ||2
178.179.10|0|ML|2|359.10|665.00|1|1|1|||WH|BCO|B||||ESQ||2
178.179.11|0|ML|1|243.00|450.00|1|1|1|||WH|BCO|M||||ESQ||2
178.179.12|0|ML|2|359.10|665.00|1|1|1|||WH|BCO|M||||ESQ||2
178.179.13|0|ML|1|243.00|450.00|1|1|1|||WH|CCL|B||||ESQ||2
178.179.14|0|ML|2|359.10|665.00|1|1|1|||WH|CCL|B||||ESQ||2
178.179.15|0|ML|1|243.00|450.00|1|1|1|||WH|CCL|M||||ESQ||2
178.179.16|0|ML|2|359.10|665.00|1|1|1|||WH|CCL|M||||ESQ||2
178.179.17|0|ML|1|243.00|450.00|1|1|1|||WH|CME|B||||ESQ||2
178.179.18|0|ML|2|359.10|665.00|1|1|1|||WH|CME|B||||ESQ||2
178.179.19|0|ML|1|243.00|450.00|1|1|1|||WH|CME|M||||ESQ||2
178.179.20|0|ML|2|359.10|665.00|1|1|1|||WH|CME|M||||ESQ||2
178.179.21|0|ML|1|243.00|450.00|1|1|1|||WH|ANT|B||||ESQ||2
178.179.22|0|ML|2|359.10|665.00|1|1|1|||WH|ANT|B||||ESQ||2
178.179.23|0|ML|1|243.00|450.00|1|1|1|||WH|ANT|M||||ESQ||2
178.179.24|0|ML|2|359.10|665.00|1|1|1|||WH|ANT|M||||ESQ||2
178.179.25|0|ML|1|243.00|450.00|1|1|1|||WH|PTO|B||||ESQ||2
178.179.26|0|ML|2|359.10|665.00|1|1|1|||WH|PTO|B||||ESQ||2
178.179.27|0|ML|1|243.00|450.00|1|1|1|||WH|PTO|M||||ESQ||2
178.179.28|0|ML|2|359.10|665.00|1|1|1|||WH|PTO|M||||ESQ||2
178.179.29|0|ML|1|243.00|450.00|1|1|1|||WH|CRE|B||||ESQ||2
178.179.30|0|ML|2|359.10|665.00|1|1|1|||WH|CRE|B||||ESQ||2
178.179.31|0|ML|1|243.00|450.00|1|1|1|||WH|CRE|M||||ESQ||2
178.179.32|0|ML|2|359.10|665.00|1|1|1|||WH|CRE|M||||ESQ||2
178.179.33|0|ML|1|243.00|450.00|1|1|1|||WH|CAM|B||||ESQ||2
178.179.34|0|ML|2|359.10|665.00|1|1|1|||WH|CAM|B||||ESQ||2
178.179.35|0|ML|1|243.00|450.00|1|1|1|||WH|CAM|M||||ESQ||2
178.179.36|0|ML|2|359.10|665.00|1|1|1|||WH|CAM|M||||ESQ||2
178.179.37|0|ML|1|243.00|450.00|1|1|1|||WH|OUR|B||||ESQ||2
178.179.38|0|ML|2|359.10|665.00|1|1|1|||WH|OUR|B||||ESQ||2
178.179.39|0|ML|1|243.00|450.00|1|1|1|||WH|OUR|M||||ESQ||2
178.179.40|0|ML|2|359.10|665.00|1|1|1|||WH|OUR|M||||ESQ||2
178.179.41|0|ML|1|243.00|450.00|1|1|1|||WH|COB|B||||ESQ||2
178.179.42|0|ML|2|359.10|665.00|1|1|1|||WH|COB|B||||ESQ||2
178.179.43|0|ML|1|243.00|450.00|1|1|1|||WH|COB|M||||ESQ||2
178.179.44|0|ML|2|359.10|665.00|1|1|1|||WH|COB|M||||ESQ||2
178.179.45|0|ML|1|243.00|450.00|1|1|1|||WH|CHO|B||||ESQ||2
178.179.46|0|ML|2|359.10|665.00|1|1|1|||WH|CHO|B||||ESQ||2
178.179.47|0|ML|1|243.00|450.00|1|1|1|||WH|CHO|M||||ESQ||2
178.179.48|0|ML|2|359.10|665.00|1|1|1|||WH|CHO|M||||ESQ||2
178.179.49|0|ML|1|243.00|450.00|1|1|1|||WH|VAG|B||||ESQ||2
178.179.50|0|ML|2|359.10|665.00|1|1|1|||WH|VAG|B||||ESQ||2
178.179.51|0|ML|1|243.00|450.00|1|1|1|||WH|VAG|M||||ESQ||2
178.179.52|0|ML|2|359.10|665.00|1|1|1|||WH|VAG|M||||ESQ||2
178.179.53|0|ML|1|243.00|450.00|1|1|1|||WH|AZE|B||||ESQ||2
178.179.54|0|ML|2|359.10|665.00|1|1|1|||WH|AZE|B||||ESQ||2
178.179.55|0|ML|1|243.00|450.00|1|1|1|||WH|AZE|M||||ESQ||2
178.179.56|0|ML|2|359.10|665.00|1|1|1|||WH|AZE|M||||ESQ||2
178.179.57|0|ML|1|243.00|450.00|1|1|1|||WH|AMA|B||||ESQ||2
178.179.58|0|ML|2|359.10|665.00|1|1|1|||WH|AMA|B||||ESQ||2
178.179.59|0|ML|1|243.00|450.00|1|1|1|||WH|AMA|M||||ESQ||2
178.179.60|0|ML|2|359.10|665.00|1|1|1|||WH|AMA|M||||ESQ||2
178.179.61|0|ML|1|243.00|450.00|1|1|1|||WH|AES|B||||ESQ||2
178.179.62|0|ML|2|359.10|665.00|1|1|1|||WH|AES|B||||ESQ||2
178.179.63|0|ML|1|243.00|450.00|1|1|1|||WH|AES|M||||ESQ||2
178.179.64|0|ML|2|359.10|665.00|1|1|1|||WH|AES|M||||ESQ||2
178.179.65|0|ML|1|243.00|450.00|1|1|1|||WH|PRA|B||||ESQ||2
178.179.66|0|ML|2|359.10|665.00|1|1|1|||WH|PRA|B||||ESQ||2
178.179.67|0|ML|1|243.00|450.00|1|1|1|||WH|PRA|M||||ESQ||2
178.179.68|0|ML|2|359.10|665.00|1|1|1|||WH|PRA|M||||ESQ||2
178.179.69|0|ML|1|243.00|450.00|1|1|1|||WH|ROS|B||||ESQ||2
178.179.70|0|ML|2|359.10|665.00|1|1|1|||WH|ROS|B||||ESQ||2
178.179.71|0|ML|1|243.00|450.00|1|1|1|||WH|ROS|M||||ESQ||2
178.179.72|0|ML|2|359.10|665.00|1|1|1|||WH|ROS|M||||ESQ||2
178.179.73|0|ML|1|243.00|450.00|1|1|1|||WH|VER|B||||ESQ||2
178.179.74|0|ML|2|359.10|665.00|1|1|1|||WH|VER|B||||ESQ||2
178.179.75|0|ML|1|243.00|450.00|1|1|1|||WH|VER|M||||ESQ||2
178.179.76|0|ML|2|359.10|665.00|1|1|1|||WH|VER|M||||ESQ||2
178.179.77|0|ML|1|243.00|450.00|1|1|1|||WH|OAK|||||ESQ||2
178.179.78|0|ML|2|359.10|665.00|1|1|1|||WH|OAK|||||ESQ||2
178.179.79|0|ML|1|243.00|450.00|1|1|1|||WH|TEA|||||ESQ||2
178.179.80|0|ML|2|359.10|665.00|1|1|1|||WH|TEA|||||ESQ||2
178.179.81|0|ML|1|243.00|450.00|1|1|1|||WH|JOP|||||ESQ||2
178.179.82|0|ML|2|359.10|665.00|1|1|1|||WH|JOP|||||ESQ||2
178.179.83|0|ML|1|243.00|450.00|1|1|1|||WH|BLK|||||ESQ||2
178.179.84|0|ML|2|359.10|665.00|1|1|1|||WH|BLK|||||ESQ||2
178.179.85|0|ML|1|243.00|450.00|1|1|1|||WH|ART|||||ESQ||2
178.179.86|0|ML|2|359.10|665.00|1|1|1|||WH|ART|||||ESQ||2
178.179.87|0|ML|1|243.00|450.00|1|1|1|||WH|LIN|||||ESQ||2
178.179.88|0|ML|2|359.10|665.00|1|1|1|||WH|LIN|||||ESQ||2
178.179.89|0|ML|1|243.00|450.00|1|1|1|||WH|HAL|||||ESQ||2
178.179.90|0|ML|2|359.10|665.00|1|1|1|||WH|HAL|||||ESQ||2
178.179.91|0|ML|1|264.60|490.00|1|1|1|||BCO|BCO|B||||ESQ||2
178.179.92|0|ML|2|380.70|705.00|1|1|1|||BCO|BCO|B||||ESQ||2
178.179.93|0|ML|1|264.60|490.00|1|1|1|||BCO|BCO|M||||ESQ||2
178.179.94|0|ML|2|380.70|705.00|1|1|1|||BCO|BCO|M||||ESQ||2
178.179.95|0|ML|1|264.60|490.00|1|1|1|||CCL|CCL|B||||ESQ||2
178.179.96|0|ML|2|380.70|705.00|1|1|1|||CCL|CCL|B||||ESQ||2
178.179.97|0|ML|1|264.60|490.00|1|1|1|||CCL|CCL|M||||ESQ||2
178.179.98|0|ML|2|380.70|705.00|1|1|1|||CCL|CCL|M||||ESQ||2
178.179.99|0|ML|1|264.60|490.00|1|1|1|||CME|CME|B||||ESQ||2
178.179.100|0|ML|2|380.70|705.00|1|1|1|||CME|CME|B||||ESQ||2
178.179.101|0|ML|1|264.60|490.00|1|1|1|||CME|CME|M||||ESQ||2
178.179.102|0|ML|2|380.70|705.00|1|1|1|||CME|CME|M||||ESQ||2
178.179.103|0|ML|1|264.60|490.00|1|1|1|||ANT|ANT|B||||ESQ||2
178.179.104|0|ML|2|380.70|705.00|1|1|1|||ANT|ANT|B||||ESQ||2
178.179.105|0|ML|1|264.60|490.00|1|1|1|||ANT|ANT|M||||ESQ||2
178.179.106|0|ML|2|380.70|705.00|1|1|1|||ANT|ANT|M||||ESQ||2
178.179.107|0|ML|1|264.60|490.00|1|1|1|||PTO|PTO|B||||ESQ||2
178.179.108|0|ML|2|380.70|705.00|1|1|1|||PTO|PTO|B||||ESQ||2
178.179.109|0|ML|1|264.60|490.00|1|1|1|||PTO|PTO|M||||ESQ||2
178.179.110|0|ML|2|380.70|705.00|1|1|1|||PTO|PTO|M||||ESQ||2
178.179.111|0|ML|1|264.60|490.00|1|1|1|||CRE|CRE|B||||ESQ||2
178.179.112|0|ML|2|380.70|705.00|1|1|1|||CRE|CRE|B||||ESQ||2
178.179.113|0|ML|1|264.60|490.00|1|1|1|||CRE|CRE|M||||ESQ||2
178.179.114|0|ML|2|380.70|705.00|1|1|1|||CRE|CRE|M||||ESQ||2
178.179.115|0|ML|1|264.60|490.00|1|1|1|||CAM|CAM|B||||ESQ||2
178.179.116|0|ML|2|380.70|705.00|1|1|1|||CAM|CAM|B||||ESQ||2
178.179.117|0|ML|1|264.60|490.00|1|1|1|||CAM|CAM|M||||ESQ||2
178.179.118|0|ML|2|380.70|705.00|1|1|1|||CAM|CAM|M||||ESQ||2
178.179.119|0|ML|1|264.60|490.00|1|1|1|||OUR|OUR|B||||ESQ||2
178.179.120|0|ML|2|380.70|705.00|1|1|1|||OUR|OUR|B||||ESQ||2
178.179.121|0|ML|1|264.60|490.00|1|1|1|||OUR|OUR|M||||ESQ||2
178.179.122|0|ML|2|380.70|705.00|1|1|1|||OUR|OUR|M||||ESQ||2
178.179.123|0|ML|1|264.60|490.00|1|1|1|||COB|COB|B||||ESQ||2
178.179.124|0|ML|2|380.70|705.00|1|1|1|||COB|COB|B||||ESQ||2
178.179.125|0|ML|1|264.60|490.00|1|1|1|||COB|COB|M||||ESQ||2
178.179.126|0|ML|2|380.70|705.00|1|1|1|||COB|COB|M||||ESQ||2
178.179.127|0|ML|1|264.60|490.00|1|1|1|||CHO|CHO|B||||ESQ||2
178.179.128|0|ML|2|380.70|705.00|1|1|1|||CHO|CHO|B||||ESQ||2
178.179.129|0|ML|1|264.60|490.00|1|1|1|||CHO|CHO|M||||ESQ||2
178.179.130|0|ML|2|380.70|705.00|1|1|1|||CHO|CHO|M||||ESQ||2
178.179.131|0|ML|1|264.60|490.00|1|1|1|||VAG|VAG|B||||ESQ||2
178.179.132|0|ML|2|380.70|705.00|1|1|1|||VAG|VAG|B||||ESQ||2
178.179.133|0|ML|1|264.60|490.00|1|1|1|||VAG|VAG|M||||ESQ||2
178.179.134|0|ML|2|380.70|705.00|1|1|1|||VAG|VAG|M||||ESQ||2
178.179.135|0|ML|1|264.60|490.00|1|1|1|||AZE|AZE|B||||ESQ||2
178.179.136|0|ML|2|380.70|705.00|1|1|1|||AZE|AZE|B||||ESQ||2
178.179.137|0|ML|1|264.60|490.00|1|1|1|||AZE|AZE|M||||ESQ||2
178.179.138|0|ML|2|380.70|705.00|1|1|1|||AZE|AZE|M||||ESQ||2
178.179.139|0|ML|1|264.60|490.00|1|1|1|||AMA|AMA|B||||ESQ||2
178.179.140|0|ML|2|380.70|705.00|1|1|1|||AMA|AMA|B||||ESQ||2
178.179.141|0|ML|1|264.60|490.00|1|1|1|||AMA|AMA|M||||ESQ||2
178.179.142|0|ML|2|380.70|705.00|1|1|1|||AMA|AMA|M||||ESQ||2
178.179.143|0|ML|1|264.60|490.00|1|1|1|||AES|AES|B||||ESQ||2
178.179.144|0|ML|2|380.70|705.00|1|1|1|||AES|AES|B||||ESQ||2
178.179.145|0|ML|1|264.60|490.00|1|1|1|||AES|AES|M||||ESQ||2
178.179.146|0|ML|2|380.70|705.00|1|1|1|||AES|AES|M||||ESQ||2
178.179.147|0|ML|1|264.60|490.00|1|1|1|||PRA|PRA|B||||ESQ||2
178.179.148|0|ML|2|380.70|705.00|1|1|1|||PRA|PRA|B||||ESQ||2
178.179.149|0|ML|1|264.60|490.00|1|1|1|||PRA|PRA|M||||ESQ||2
178.179.150|0|ML|2|380.70|705.00|1|1|1|||PRA|PRA|M||||ESQ||2
178.179.151|0|ML|1|264.60|490.00|1|1|1|||ROS|ROS|B||||ESQ||2
178.179.152|0|ML|2|380.70|705.00|1|1|1|||ROS|ROS|B||||ESQ||2
178.179.153|0|ML|1|264.60|490.00|1|1|1|||ROS|ROS|M||||ESQ||2
178.179.154|0|ML|2|380.70|705.00|1|1|1|||ROS|ROS|M||||ESQ||2
178.179.155|0|ML|1|264.60|490.00|1|1|1|||VER|VER|B||||ESQ||2
178.179.156|0|ML|2|380.70|705.00|1|1|1|||VER|VER|B||||ESQ||2
178.179.157|0|ML|1|264.60|490.00|1|1|1|||VER|VER|M||||ESQ||2
178.179.158|0|ML|2|380.70|705.00|1|1|1|||VER|VER|M||||ESQ||2
178.179.159|0|ML|1|264.60|490.00|1|1|1|||OAK|OAK|||||ESQ||2
178.179.160|0|ML|2|380.70|705.00|1|1|1|||OAK|OAK|||||ESQ||2
178.179.161|0|ML|1|264.60|490.00|1|1|1|||TEA|TEA|||||ESQ||2
178.179.162|0|ML|2|380.70|705.00|1|1|1|||TEA|TEA|||||ESQ||2
178.179.163|0|ML|1|264.60|490.00|1|1|1|||JOP|JOP|||||ESQ||2
178.179.164|0|ML|2|380.70|705.00|1|1|1|||JOP|JOP|||||ESQ||2
178.179.165|0|ML|1|264.60|490.00|1|1|1|||AZB|AZB|||||ESQ||2
178.179.166|0|ML|2|380.70|705.00|1|1|1|||AZB|AZB|||||ESQ||2
178.179.167|0|ML|1|264.60|490.00|1|1|1|||DEN|DEN|||||ESQ||2
178.179.168|0|ML|2|380.70|705.00|1|1|1|||DEN|DEN|||||ESQ||2
178.179.169|0|ML|1|264.60|490.00|1|1|1|||BLK|BLK|||||ESQ||2
178.179.170|0|ML|2|380.70|705.00|1|1|1|||BLK|BLK|||||ESQ||2
178.179.171|0|ML|1|264.60|490.00|1|1|1|||ART|ART|||||ESQ||2
178.179.172|0|ML|2|380.70|705.00|1|1|1|||ART|ART|||||ESQ||2
178.179.173|0|ML|1|264.60|490.00|1|1|1|||LIN|LIN|||||ESQ||2
178.179.174|0|ML|2|380.70|705.00|1|1|1|||LIN|LIN|||||ESQ||2
178.179.175|0|ML|1|264.60|490.00|1|1|1|||HAL|HAL|||||ESQ||2
178.179.176|0|ML|2|380.70|705.00|1|1|1|||HAL|HAL|||||ESQ||2
178.180.3|0|ML|1|259.20|480.00|1|1|1|||WH|WH|||||DIR||2
178.180.4|0|ML|2|398.52|738.00|1|1|1|||WH|WH|||||DIR||2
178.180.5|0|ML|1|259.20|480.00|1|1|1|||WH|AZB|||||DIR||2
178.180.6|0|ML|2|398.52|738.00|1|1|1|||WH|AZB|||||DIR||2
178.180.7|0|ML|1|259.20|480.00|1|1|1|||WH|DEN|||||DIR||2
178.180.8|0|ML|2|398.52|738.00|1|1|1|||WH|DEN|||||DIR||2
178.180.9|0|ML|1|286.20|530.00|1|1|1|||WH|BCO|B||||DIR||2
178.180.10|0|ML|2|425.52|788.00|1|1|1|||WH|BCO|B||||DIR||2
178.180.11|0|ML|1|286.20|530.00|1|1|1|||WH|BCO|M||||DIR||2
178.180.12|0|ML|2|425.52|788.00|1|1|1|||WH|BCO|M||||DIR||2
178.180.13|0|ML|1|286.20|530.00|1|1|1|||WH|CCL|B||||DIR||2
178.180.14|0|ML|2|425.52|788.00|1|1|1|||WH|CCL|B||||DIR||2
178.180.15|0|ML|1|286.20|530.00|1|1|1|||WH|CCL|M||||DIR||2
178.180.16|0|ML|2|425.52|788.00|1|1|1|||WH|CCL|M||||DIR||2
178.180.17|0|ML|1|286.20|530.00|1|1|1|||WH|CME|B||||DIR||2
178.180.18|0|ML|2|425.52|788.00|1|1|1|||WH|CME|B||||DIR||2
178.180.19|0|ML|1|286.20|530.00|1|1|1|||WH|CME|M||||DIR||2
178.180.20|0|ML|2|425.52|788.00|1|1|1|||WH|CME|M||||DIR||2
178.180.21|0|ML|1|286.20|530.00|1|1|1|||WH|ANT|B||||DIR||2
178.180.22|0|ML|2|425.52|788.00|1|1|1|||WH|ANT|B||||DIR||2
178.180.23|0|ML|1|286.20|530.00|1|1|1|||WH|ANT|M||||DIR||2
178.180.24|0|ML|2|425.52|788.00|1|1|1|||WH|ANT|M||||DIR||2
178.180.25|0|ML|1|286.20|530.00|1|1|1|||WH|PTO|B||||DIR||2
178.180.26|0|ML|2|425.52|788.00|1|1|1|||WH|PTO|B||||DIR||2
178.180.27|0|ML|1|286.20|530.00|1|1|1|||WH|PTO|M||||DIR||2
178.180.28|0|ML|2|425.52|788.00|1|1|1|||WH|PTO|M||||DIR||2
178.180.29|0|ML|1|286.20|530.00|1|1|1|||WH|CRE|B||||DIR||2
178.180.30|0|ML|2|425.52|788.00|1|1|1|||WH|CRE|B||||DIR||2
178.180.31|0|ML|1|286.20|530.00|1|1|1|||WH|CRE|M||||DIR||2
178.180.32|0|ML|2|425.52|788.00|1|1|1|||WH|CRE|M||||DIR||2
178.180.33|0|ML|1|286.20|530.00|1|1|1|||WH|CAM|B||||DIR||2
178.180.34|0|ML|2|425.52|788.00|1|1|1|||WH|CAM|B||||DIR||2
178.180.35|0|ML|1|286.20|530.00|1|1|1|||WH|CAM|M||||DIR||2
178.180.36|0|ML|2|425.52|788.00|1|1|1|||WH|CAM|M||||DIR||2
178.180.37|0|ML|1|286.20|530.00|1|1|1|||WH|OUR|B||||DIR||2
178.180.38|0|ML|2|425.52|788.00|1|1|1|||WH|OUR|B||||DIR||2
178.180.39|0|ML|1|286.20|530.00|1|1|1|||WH|OUR|M||||DIR||2
178.180.40|0|ML|2|425.52|788.00|1|1|1|||WH|OUR|M||||DIR||2
178.180.41|0|ML|1|286.20|530.00|1|1|1|||WH|COB|B||||DIR||2
178.180.42|0|ML|2|425.52|788.00|1|1|1|||WH|COB|B||||DIR||2
178.180.43|0|ML|1|286.20|530.00|1|1|1|||WH|COB|M||||DIR||2
178.180.44|0|ML|2|425.52|788.00|1|1|1|||WH|COB|M||||DIR||2
178.180.45|0|ML|1|286.20|530.00|1|1|1|||WH|CHO|B||||DIR||2
178.180.46|0|ML|2|425.52|788.00|1|1|1|||WH|CHO|B||||DIR||2
178.180.47|0|ML|1|286.20|530.00|1|1|1|||WH|CHO|M||||DIR||2
178.180.48|0|ML|2|425.52|788.00|1|1|1|||WH|CHO|M||||DIR||2
178.180.49|0|ML|1|286.20|530.00|1|1|1|||WH|VAG|B||||DIR||2
178.180.50|0|ML|2|425.52|788.00|1|1|1|||WH|VAG|B||||DIR||2
178.180.51|0|ML|1|286.20|530.00|1|1|1|||WH|VAG|M||||DIR||2
178.180.52|0|ML|2|425.52|788.00|1|1|1|||WH|VAG|M||||DIR||2
178.180.53|0|ML|1|286.20|530.00|1|1|1|||WH|AZE|B||||DIR||2
178.180.54|0|ML|2|425.52|788.00|1|1|1|||WH|AZE|B||||DIR||2
178.180.55|0|ML|1|286.20|530.00|1|1|1|||WH|AZE|M||||DIR||2
178.180.56|0|ML|2|425.52|788.00|1|1|1|||WH|AZE|M||||DIR||2
178.180.57|0|ML|1|286.20|530.00|1|1|1|||WH|AMA|B||||DIR||2
178.180.58|0|ML|2|425.52|788.00|1|1|1|||WH|AMA|B||||DIR||2
178.180.59|0|ML|1|286.20|530.00|1|1|1|||WH|AMA|M||||DIR||2
178.180.60|0|ML|2|425.52|788.00|1|1|1|||WH|AMA|M||||DIR||2
178.180.61|0|ML|1|286.20|530.00|1|1|1|||WH|AES|B||||DIR||2
178.180.62|0|ML|2|425.52|788.00|1|1|1|||WH|AES|B||||DIR||2
178.180.63|0|ML|1|286.20|530.00|1|1|1|||WH|AES|M||||DIR||2
178.180.64|0|ML|2|425.52|788.00|1|1|1|||WH|AES|M||||DIR||2
178.180.65|0|ML|1|286.20|530.00|1|1|1|||WH|PRA|B||||DIR||2
178.180.66|0|ML|2|425.52|788.00|1|1|1|||WH|PRA|B||||DIR||2
178.180.67|0|ML|1|286.20|530.00|1|1|1|||WH|PRA|M||||DIR||2
178.180.68|0|ML|2|425.52|788.00|1|1|1|||WH|PRA|M||||DIR||2
178.180.69|0|ML|1|286.20|530.00|1|1|1|||WH|ROS|B||||DIR||2
178.180.70|0|ML|2|425.52|788.00|1|1|1|||WH|ROS|B||||DIR||2
178.180.71|0|ML|1|286.20|530.00|1|1|1|||WH|ROS|M||||DIR||2
178.180.72|0|ML|2|425.52|788.00|1|1|1|||WH|ROS|M||||DIR||2
178.180.73|0|ML|1|286.20|530.00|1|1|1|||WH|VER|B||||DIR||2
178.180.74|0|ML|2|425.52|788.00|1|1|1|||WH|VER|B||||DIR||2
178.180.75|0|ML|1|286.20|530.00|1|1|1|||WH|VER|M||||DIR||2
178.180.76|0|ML|2|425.52|788.00|1|1|1|||WH|VER|M||||DIR||2
178.180.77|0|ML|1|286.20|530.00|1|1|1|||WH|OAK|||||DIR||2
178.180.78|0|ML|2|425.52|788.00|1|1|1|||WH|OAK|||||DIR||2
178.180.79|0|ML|1|286.20|530.00|1|1|1|||WH|TEA|||||DIR||2
178.180.80|0|ML|2|425.52|788.00|1|1|1|||WH|TEA|||||DIR||2
178.180.81|0|ML|1|286.20|530.00|1|1|1|||WH|JOP|||||DIR||2
178.180.82|0|ML|2|425.52|788.00|1|1|1|||WH|JOP|||||DIR||2
178.180.83|0|ML|1|286.20|530.00|1|1|1|||WH|BLK|||||DIR||2
178.180.84|0|ML|2|425.52|788.00|1|1|1|||WH|BLK|||||DIR||2
178.180.85|0|ML|1|286.20|530.00|1|1|1|||WH|ART|||||DIR||2
178.180.86|0|ML|2|425.52|788.00|1|1|1|||WH|ART|||||DIR||2
178.180.87|0|ML|1|286.20|530.00|1|1|1|||WH|LIN|||||DIR||2
178.180.88|0|ML|2|425.52|788.00|1|1|1|||WH|LIN|||||DIR||2
178.180.89|0|ML|1|286.20|530.00|1|1|1|||WH|HAL|||||DIR||2
178.180.90|0|ML|2|425.52|788.00|1|1|1|||WH|HAL|||||DIR||2
178.180.91|0|ML|1|307.80|570.00|1|1|1|||BCO|BCO|B||||DIR||2
178.180.92|0|ML|2|447.12|828.00|1|1|1|||BCO|BCO|B||||DIR||2
178.180.93|0|ML|1|307.80|570.00|1|1|1|||BCO|BCO|M||||DIR||2
178.180.94|0|ML|2|447.12|828.00|1|1|1|||BCO|BCO|M||||DIR||2
178.180.95|0|ML|1|307.80|570.00|1|1|1|||CCL|CCL|B||||DIR||2
178.180.96|0|ML|2|447.12|828.00|1|1|1|||CCL|CCL|B||||DIR||2
178.180.97|0|ML|1|307.80|570.00|1|1|1|||CCL|CCL|M||||DIR||2
178.180.98|0|ML|2|447.12|828.00|1|1|1|||CCL|CCL|M||||DIR||2
178.180.99|0|ML|1|307.80|570.00|1|1|1|||CME|CME|B||||DIR||2
178.180.100|0|ML|2|447.12|828.00|1|1|1|||CME|CME|B||||DIR||2
178.180.101|0|ML|1|307.80|570.00|1|1|1|||CME|CME|M||||DIR||2
178.180.102|0|ML|2|447.12|828.00|1|1|1|||CME|CME|M||||DIR||2
178.180.103|0|ML|1|307.80|570.00|1|1|1|||ANT|ANT|B||||DIR||2
178.180.104|0|ML|2|447.12|828.00|1|1|1|||ANT|ANT|B||||DIR||2
178.180.105|0|ML|1|307.80|570.00|1|1|1|||ANT|ANT|M||||DIR||2
178.180.106|0|ML|2|447.12|828.00|1|1|1|||ANT|ANT|M||||DIR||2
178.180.107|0|ML|1|307.80|570.00|1|1|1|||PTO|PTO|B||||DIR||2
178.180.108|0|ML|2|447.12|828.00|1|1|1|||PTO|PTO|B||||DIR||2
178.180.109|0|ML|1|307.80|570.00|1|1|1|||PTO|PTO|M||||DIR||2
178.180.110|0|ML|2|447.12|828.00|1|1|1|||PTO|PTO|M||||DIR||2
178.180.111|0|ML|1|307.80|570.00|1|1|1|||CRE|CRE|B||||DIR||2
178.180.112|0|ML|2|447.12|828.00|1|1|1|||CRE|CRE|B||||DIR||2
178.180.113|0|ML|1|307.80|570.00|1|1|1|||CRE|CRE|M||||DIR||2
178.180.114|0|ML|2|447.12|828.00|1|1|1|||CRE|CRE|M||||DIR||2
178.180.115|0|ML|1|307.80|570.00|1|1|1|||CAM|CAM|B||||DIR||2
178.180.116|0|ML|2|447.12|828.00|1|1|1|||CAM|CAM|B||||DIR||2
178.180.117|0|ML|1|307.80|570.00|1|1|1|||CAM|CAM|M||||DIR||2
178.180.118|0|ML|2|447.12|828.00|1|1|1|||CAM|CAM|M||||DIR||2
178.180.119|0|ML|1|307.80|570.00|1|1|1|||OUR|OUR|B||||DIR||2
178.180.120|0|ML|2|447.12|828.00|1|1|1|||OUR|OUR|B||||DIR||2
178.180.121|0|ML|1|307.80|570.00|1|1|1|||OUR|OUR|M||||DIR||2
178.180.122|0|ML|2|447.12|828.00|1|1|1|||OUR|OUR|M||||DIR||2
178.180.123|0|ML|1|307.80|570.00|1|1|1|||COB|COB|B||||DIR||2
178.180.124|0|ML|2|447.12|828.00|1|1|1|||COB|COB|B||||DIR||2
178.180.125|0|ML|1|307.80|570.00|1|1|1|||COB|COB|M||||DIR||2
178.180.126|0|ML|2|447.12|828.00|1|1|1|||COB|COB|M||||DIR||2
178.180.127|0|ML|1|307.80|570.00|1|1|1|||CHO|CHO|B||||DIR||2
178.180.128|0|ML|2|447.12|828.00|1|1|1|||CHO|CHO|B||||DIR||2
178.180.129|0|ML|1|307.80|570.00|1|1|1|||CHO|CHO|M||||DIR||2
178.180.130|0|ML|2|447.12|828.00|1|1|1|||CHO|CHO|M||||DIR||2
178.180.131|0|ML|1|307.80|570.00|1|1|1|||VAG|VAG|B||||DIR||2
178.180.132|0|ML|2|447.12|828.00|1|1|1|||VAG|VAG|B||||DIR||2
178.180.133|0|ML|1|307.80|570.00|1|1|1|||VAG|VAG|M||||DIR||2
178.180.134|0|ML|2|447.12|828.00|1|1|1|||VAG|VAG|M||||DIR||2
178.180.135|0|ML|1|307.80|570.00|1|1|1|||AZE|AZE|B||||DIR||2
178.180.136|0|ML|2|447.12|828.00|1|1|1|||AZE|AZE|B||||DIR||2
178.180.137|0|ML|1|307.80|570.00|1|1|1|||AZE|AZE|M||||DIR||2
178.180.138|0|ML|2|447.12|828.00|1|1|1|||AZE|AZE|M||||DIR||2
178.180.139|0|ML|1|307.80|570.00|1|1|1|||AMA|AMA|B||||DIR||2
178.180.140|0|ML|2|447.12|828.00|1|1|1|||AMA|AMA|B||||DIR||2
178.180.141|0|ML|1|307.80|570.00|1|1|1|||AMA|AMA|M||||DIR||2
178.180.142|0|ML|2|447.12|828.00|1|1|1|||AMA|AMA|M||||DIR||2
178.180.143|0|ML|1|307.80|570.00|1|1|1|||AES|AES|B||||DIR||2
178.180.144|0|ML|2|447.12|828.00|1|1|1|||AES|AES|B||||DIR||2
178.180.145|0|ML|1|307.80|570.00|1|1|1|||AES|AES|M||||DIR||2
178.180.146|0|ML|2|447.12|828.00|1|1|1|||AES|AES|M||||DIR||2
178.180.147|0|ML|1|307.80|570.00|1|1|1|||PRA|PRA|B||||DIR||2
178.180.148|0|ML|2|447.12|828.00|1|1|1|||PRA|PRA|B||||DIR||2
178.180.149|0|ML|1|307.80|570.00|1|1|1|||PRA|PRA|M||||DIR||2
178.180.150|0|ML|2|447.12|828.00|1|1|1|||PRA|PRA|M||||DIR||2
178.180.151|0|ML|1|307.80|570.00|1|1|1|||ROS|ROS|B||||DIR||2
178.180.152|0|ML|2|447.12|828.00|1|1|1|||ROS|ROS|B||||DIR||2
178.180.153|0|ML|1|307.80|570.00|1|1|1|||ROS|ROS|M||||DIR||2
178.180.154|0|ML|2|447.12|828.00|1|1|1|||ROS|ROS|M||||DIR||2
178.180.155|0|ML|1|307.80|570.00|1|1|1|||VER|VER|B||||DIR||2
178.180.156|0|ML|2|447.12|828.00|1|1|1|||VER|VER|B||||DIR||2
178.180.157|0|ML|1|307.80|570.00|1|1|1|||VER|VER|M||||DIR||2
178.180.158|0|ML|2|447.12|828.00|1|1|1|||VER|VER|M||||DIR||2
178.180.159|0|ML|1|307.80|570.00|1|1|1|||OAK|OAK|||||DIR||2
178.180.160|0|ML|2|447.12|828.00|1|1|1|||OAK|OAK|||||DIR||2
178.180.161|0|ML|1|307.80|570.00|1|1|1|||TEA|TEA|||||DIR||2
178.180.162|0|ML|2|447.12|828.00|1|1|1|||TEA|TEA|||||DIR||2
178.180.163|0|ML|1|307.80|570.00|1|1|1|||JOP|JOP|||||DIR||2
178.180.164|0|ML|2|447.12|828.00|1|1|1|||JOP|JOP|||||DIR||2
178.180.165|0|ML|1|307.80|570.00|1|1|1|||AZB|AZB|||||DIR||2
178.180.166|0|ML|2|447.12|828.00|1|1|1|||AZB|AZB|||||DIR||2
178.180.167|0|ML|1|307.80|570.00|1|1|1|||DEN|DEN|||||DIR||2
178.180.168|0|ML|2|447.12|828.00|1|1|1|||DEN|DEN|||||DIR||2
178.180.169|0|ML|1|307.80|570.00|1|1|1|||BLK|BLK|||||DIR||2
178.180.170|0|ML|2|447.12|828.00|1|1|1|||BLK|BLK|||||DIR||2
178.180.171|0|ML|1|307.80|570.00|1|1|1|||ART|ART|||||DIR||2
178.180.172|0|ML|2|447.12|828.00|1|1|1|||ART|ART|||||DIR||2
178.180.173|0|ML|1|307.80|570.00|1|1|1|||LIN|LIN|||||DIR||2
178.180.174|0|ML|2|447.12|828.00|1|1|1|||LIN|LIN|||||DIR||2
178.180.175|0|ML|1|307.80|570.00|1|1|1|||HAL|HAL|||||DIR||2
178.180.176|0|ML|2|447.12|828.00|1|1|1|||HAL|HAL|||||DIR||2
181.182.3|0|ML|1|243.00|450.00|1|1|1|||WH|WH|||||ESQ||3
181.182.4|0|ML|2|356.40|660.00|1|1|1|||WH|WH|||||ESQ||3
181.182.5|0|ML|1|243.00|450.00|1|1|1|||WH|AZB|||||ESQ||3
181.182.6|0|ML|2|356.40|660.00|1|1|1|||WH|AZB|||||ESQ||3
181.182.7|0|ML|1|243.00|450.00|1|1|1|||WH|DEN|||||ESQ||3
181.182.8|0|ML|2|356.40|660.00|1|1|1|||WH|DEN|||||ESQ||3
181.182.9|0|ML|1|270.00|500.00|1|1|1|||WH|BCO|B||||ESQ||3
181.182.10|0|ML|2|383.40|710.00|1|1|1|||WH|BCO|B||||ESQ||3
181.182.11|0|ML|1|270.00|500.00|1|1|1|||WH|BCO|M||||ESQ||3
181.182.12|0|ML|2|383.40|710.00|1|1|1|||WH|BCO|M||||ESQ||3
181.182.13|0|ML|1|270.00|500.00|1|1|1|||WH|CCL|B||||ESQ||3
181.182.14|0|ML|2|383.40|710.00|1|1|1|||WH|CCL|B||||ESQ||3
181.182.15|0|ML|1|270.00|500.00|1|1|1|||WH|CCL|M||||ESQ||3
181.182.16|0|ML|2|383.40|710.00|1|1|1|||WH|CCL|M||||ESQ||3
181.182.17|0|ML|1|270.00|500.00|1|1|1|||WH|CME|B||||ESQ||3
181.182.18|0|ML|2|383.40|710.00|1|1|1|||WH|CME|B||||ESQ||3
181.182.19|0|ML|1|270.00|500.00|1|1|1|||WH|CME|M||||ESQ||3
181.182.20|0|ML|2|383.40|710.00|1|1|1|||WH|CME|M||||ESQ||3
181.182.21|0|ML|1|270.00|500.00|1|1|1|||WH|ANT|B||||ESQ||3
181.182.22|0|ML|2|383.40|710.00|1|1|1|||WH|ANT|B||||ESQ||3
181.182.23|0|ML|1|270.00|500.00|1|1|1|||WH|ANT|M||||ESQ||3
181.182.24|0|ML|2|383.40|710.00|1|1|1|||WH|ANT|M||||ESQ||3
181.182.25|0|ML|1|270.00|500.00|1|1|1|||WH|PTO|B||||ESQ||3
181.182.26|0|ML|2|383.40|710.00|1|1|1|||WH|PTO|B||||ESQ||3
181.182.27|0|ML|1|270.00|500.00|1|1|1|||WH|PTO|M||||ESQ||3
181.182.28|0|ML|2|383.40|710.00|1|1|1|||WH|PTO|M||||ESQ||3
181.182.29|0|ML|1|270.00|500.00|1|1|1|||WH|CRE|B||||ESQ||3
181.182.30|0|ML|2|383.40|710.00|1|1|1|||WH|CRE|B||||ESQ||3
181.182.31|0|ML|1|270.00|500.00|1|1|1|||WH|CRE|M||||ESQ||3
181.182.32|0|ML|2|383.40|710.00|1|1|1|||WH|CRE|M||||ESQ||3
181.182.33|0|ML|1|270.00|500.00|1|1|1|||WH|CAM|B||||ESQ||3
181.182.34|0|ML|2|383.40|710.00|1|1|1|||WH|CAM|B||||ESQ||3
181.182.35|0|ML|1|270.00|500.00|1|1|1|||WH|CAM|M||||ESQ||3
181.182.36|0|ML|2|383.40|710.00|1|1|1|||WH|CAM|M||||ESQ||3
181.182.37|0|ML|1|270.00|500.00|1|1|1|||WH|OUR|B||||ESQ||3
181.182.38|0|ML|2|383.40|710.00|1|1|1|||WH|OUR|B||||ESQ||3
181.182.39|0|ML|1|270.00|500.00|1|1|1|||WH|OUR|M||||ESQ||3
181.182.40|0|ML|2|383.40|710.00|1|1|1|||WH|OUR|M||||ESQ||3
181.182.41|0|ML|1|270.00|500.00|1|1|1|||WH|COB|B||||ESQ||3
181.182.42|0|ML|2|383.40|710.00|1|1|1|||WH|COB|B||||ESQ||3
181.182.43|0|ML|1|270.00|500.00|1|1|1|||WH|COB|M||||ESQ||3
181.182.44|0|ML|2|383.40|710.00|1|1|1|||WH|COB|M||||ESQ||3
181.182.45|0|ML|1|270.00|500.00|1|1|1|||WH|CHO|B||||ESQ||3
181.182.46|0|ML|2|383.40|710.00|1|1|1|||WH|CHO|B||||ESQ||3
181.182.47|0|ML|1|270.00|500.00|1|1|1|||WH|CHO|M||||ESQ||3
181.182.48|0|ML|2|383.40|710.00|1|1|1|||WH|CHO|M||||ESQ||3
181.182.49|0|ML|1|270.00|500.00|1|1|1|||WH|VAG|B||||ESQ||3
181.182.50|0|ML|2|383.40|710.00|1|1|1|||WH|VAG|B||||ESQ||3
181.182.51|0|ML|1|270.00|500.00|1|1|1|||WH|VAG|M||||ESQ||3
181.182.52|0|ML|2|383.40|710.00|1|1|1|||WH|VAG|M||||ESQ||3
181.182.53|0|ML|1|270.00|500.00|1|1|1|||WH|AZE|B||||ESQ||3
181.182.54|0|ML|2|383.40|710.00|1|1|1|||WH|AZE|B||||ESQ||3
181.182.55|0|ML|1|270.00|500.00|1|1|1|||WH|AZE|M||||ESQ||3
181.182.56|0|ML|2|383.40|710.00|1|1|1|||WH|AZE|M||||ESQ||3
181.182.57|0|ML|1|270.00|500.00|1|1|1|||WH|AMA|B||||ESQ||3
181.182.58|0|ML|2|383.40|710.00|1|1|1|||WH|AMA|B||||ESQ||3
181.182.59|0|ML|1|270.00|500.00|1|1|1|||WH|AMA|M||||ESQ||3
181.182.60|0|ML|2|383.40|710.00|1|1|1|||WH|AMA|M||||ESQ||3
181.182.61|0|ML|1|270.00|500.00|1|1|1|||WH|AES|B||||ESQ||3
181.182.62|0|ML|2|383.40|710.00|1|1|1|||WH|AES|B||||ESQ||3
181.182.63|0|ML|1|270.00|500.00|1|1|1|||WH|AES|M||||ESQ||3
181.182.64|0|ML|2|383.40|710.00|1|1|1|||WH|AES|M||||ESQ||3
181.182.65|0|ML|1|270.00|500.00|1|1|1|||WH|PRA|B||||ESQ||3
181.182.66|0|ML|2|383.40|710.00|1|1|1|||WH|PRA|B||||ESQ||3
181.182.67|0|ML|1|270.00|500.00|1|1|1|||WH|PRA|M||||ESQ||3
181.182.68|0|ML|2|383.40|710.00|1|1|1|||WH|PRA|M||||ESQ||3
181.182.69|0|ML|1|270.00|500.00|1|1|1|||WH|ROS|B||||ESQ||3
181.182.70|0|ML|2|383.40|710.00|1|1|1|||WH|ROS|B||||ESQ||3
181.182.71|0|ML|1|270.00|500.00|1|1|1|||WH|ROS|M||||ESQ||3
181.182.72|0|ML|2|383.40|710.00|1|1|1|||WH|ROS|M||||ESQ||3
181.182.73|0|ML|1|270.00|500.00|1|1|1|||WH|VER|B||||ESQ||3
181.182.74|0|ML|2|383.40|710.00|1|1|1|||WH|VER|B||||ESQ||3
181.182.75|0|ML|1|270.00|500.00|1|1|1|||WH|VER|M||||ESQ||3
181.182.76|0|ML|2|383.40|710.00|1|1|1|||WH|VER|M||||ESQ||3
181.182.77|0|ML|1|270.00|500.00|1|1|1|||WH|OAK|||||ESQ||3
181.182.78|0|ML|2|383.40|710.00|1|1|1|||WH|OAK|||||ESQ||3
181.182.79|0|ML|1|270.00|500.00|1|1|1|||WH|TEA|||||ESQ||3
181.182.80|0|ML|2|383.40|710.00|1|1|1|||WH|TEA|||||ESQ||3
181.182.81|0|ML|1|270.00|500.00|1|1|1|||WH|JOP|||||ESQ||3
181.182.82|0|ML|2|383.40|710.00|1|1|1|||WH|JOP|||||ESQ||3
181.182.83|0|ML|1|270.00|500.00|1|1|1|||WH|BLK|||||ESQ||3
181.182.84|0|ML|2|383.40|710.00|1|1|1|||WH|BLK|||||ESQ||3
181.182.85|0|ML|1|270.00|500.00|1|1|1|||WH|ART|||||ESQ||3
181.182.86|0|ML|2|383.40|710.00|1|1|1|||WH|ART|||||ESQ||3
181.182.87|0|ML|1|270.00|500.00|1|1|1|||WH|LIN|||||ESQ||3
181.182.88|0|ML|2|383.40|710.00|1|1|1|||WH|LIN|||||ESQ||3
181.182.89|0|ML|1|270.00|500.00|1|1|1|||WH|HAL|||||ESQ||3
181.182.90|0|ML|2|383.40|710.00|1|1|1|||WH|HAL|||||ESQ||3
181.182.91|0|ML|1|291.60|540.00|1|1|1|||BCO|BCO|B||||ESQ||3
181.182.92|0|ML|2|405.00|750.00|1|1|1|||BCO|BCO|B||||ESQ||3
181.182.93|0|ML|1|291.60|540.00|1|1|1|||BCO|BCO|M||||ESQ||3
181.182.94|0|ML|2|405.00|750.00|1|1|1|||BCO|BCO|M||||ESQ||3
181.182.95|0|ML|1|291.60|540.00|1|1|1|||CCL|CCL|B||||ESQ||3
181.182.96|0|ML|2|405.00|750.00|1|1|1|||CCL|CCL|B||||ESQ||3
181.182.97|0|ML|1|291.60|540.00|1|1|1|||CCL|CCL|M||||ESQ||3
181.182.98|0|ML|2|405.00|750.00|1|1|1|||CCL|CCL|M||||ESQ||3
181.182.99|0|ML|1|291.60|540.00|1|1|1|||CME|CME|B||||ESQ||3
181.182.100|0|ML|2|405.00|750.00|1|1|1|||CME|CME|B||||ESQ||3
181.182.101|0|ML|1|291.60|540.00|1|1|1|||CME|CME|M||||ESQ||3
181.182.102|0|ML|2|405.00|750.00|1|1|1|||CME|CME|M||||ESQ||3
181.182.103|0|ML|1|291.60|540.00|1|1|1|||ANT|ANT|B||||ESQ||3
181.182.104|0|ML|2|405.00|750.00|1|1|1|||ANT|ANT|B||||ESQ||3
181.182.105|0|ML|1|291.60|540.00|1|1|1|||ANT|ANT|M||||ESQ||3
181.182.106|0|ML|2|405.00|750.00|1|1|1|||ANT|ANT|M||||ESQ||3
181.182.107|0|ML|1|291.60|540.00|1|1|1|||PTO|PTO|B||||ESQ||3
181.182.108|0|ML|2|405.00|750.00|1|1|1|||PTO|PTO|B||||ESQ||3
181.182.109|0|ML|1|291.60|540.00|1|1|1|||PTO|PTO|M||||ESQ||3
181.182.110|0|ML|2|405.00|750.00|1|1|1|||PTO|PTO|M||||ESQ||3
181.182.111|0|ML|1|291.60|540.00|1|1|1|||CRE|CRE|B||||ESQ||3
181.182.112|0|ML|2|405.00|750.00|1|1|1|||CRE|CRE|B||||ESQ||3
181.182.113|0|ML|1|291.60|540.00|1|1|1|||CRE|CRE|M||||ESQ||3
181.182.114|0|ML|2|405.00|750.00|1|1|1|||CRE|CRE|M||||ESQ||3
181.182.115|0|ML|1|291.60|540.00|1|1|1|||CAM|CAM|B||||ESQ||3
181.182.116|0|ML|2|405.00|750.00|1|1|1|||CAM|CAM|B||||ESQ||3
181.182.117|0|ML|1|291.60|540.00|1|1|1|||CAM|CAM|M||||ESQ||3
181.182.118|0|ML|2|405.00|750.00|1|1|1|||CAM|CAM|M||||ESQ||3
181.182.119|0|ML|1|291.60|540.00|1|1|1|||OUR|OUR|B||||ESQ||3
181.182.120|0|ML|2|405.00|750.00|1|1|1|||OUR|OUR|B||||ESQ||3
181.182.121|0|ML|1|291.60|540.00|1|1|1|||OUR|OUR|M||||ESQ||3
181.182.122|0|ML|2|405.00|750.00|1|1|1|||OUR|OUR|M||||ESQ||3
181.182.123|0|ML|1|291.60|540.00|1|1|1|||COB|COB|B||||ESQ||3
181.182.124|0|ML|2|405.00|750.00|1|1|1|||COB|COB|B||||ESQ||3
181.182.125|0|ML|1|291.60|540.00|1|1|1|||COB|COB|M||||ESQ||3
181.182.126|0|ML|2|405.00|750.00|1|1|1|||COB|COB|M||||ESQ||3
181.182.127|0|ML|1|291.60|540.00|1|1|1|||CHO|CHO|B||||ESQ||3
181.182.128|0|ML|2|405.00|750.00|1|1|1|||CHO|CHO|B||||ESQ||3
181.182.129|0|ML|1|291.60|540.00|1|1|1|||CHO|CHO|M||||ESQ||3
181.182.130|0|ML|2|405.00|750.00|1|1|1|||CHO|CHO|M||||ESQ||3
181.182.131|0|ML|1|291.60|540.00|1|1|1|||VAG|VAG|B||||ESQ||3
181.182.132|0|ML|2|405.00|750.00|1|1|1|||VAG|VAG|B||||ESQ||3
181.182.133|0|ML|1|291.60|540.00|1|1|1|||VAG|VAG|M||||ESQ||3
181.182.134|0|ML|2|405.00|750.00|1|1|1|||VAG|VAG|M||||ESQ||3
181.182.135|0|ML|1|291.60|540.00|1|1|1|||AZE|AZE|B||||ESQ||3
181.182.136|0|ML|2|405.00|750.00|1|1|1|||AZE|AZE|B||||ESQ||3
181.182.137|0|ML|1|291.60|540.00|1|1|1|||AZE|AZE|M||||ESQ||3
181.182.138|0|ML|2|405.00|750.00|1|1|1|||AZE|AZE|M||||ESQ||3
181.182.139|0|ML|1|291.60|540.00|1|1|1|||AMA|AMA|B||||ESQ||3
181.182.140|0|ML|2|405.00|750.00|1|1|1|||AMA|AMA|B||||ESQ||3
181.182.141|0|ML|1|291.60|540.00|1|1|1|||AMA|AMA|M||||ESQ||3
181.182.142|0|ML|2|405.00|750.00|1|1|1|||AMA|AMA|M||||ESQ||3
181.182.143|0|ML|1|291.60|540.00|1|1|1|||AES|AES|B||||ESQ||3
181.182.144|0|ML|2|405.00|750.00|1|1|1|||AES|AES|B||||ESQ||3
181.182.145|0|ML|1|291.60|540.00|1|1|1|||AES|AES|M||||ESQ||3
181.182.146|0|ML|2|405.00|750.00|1|1|1|||AES|AES|M||||ESQ||3
181.182.147|0|ML|1|291.60|540.00|1|1|1|||PRA|PRA|B||||ESQ||3
181.182.148|0|ML|2|405.00|750.00|1|1|1|||PRA|PRA|B||||ESQ||3
181.182.149|0|ML|1|291.60|540.00|1|1|1|||PRA|PRA|M||||ESQ||3
181.182.150|0|ML|2|405.00|750.00|1|1|1|||PRA|PRA|M||||ESQ||3
181.182.151|0|ML|1|291.60|540.00|1|1|1|||ROS|ROS|B||||ESQ||3
181.182.152|0|ML|2|405.00|750.00|1|1|1|||ROS|ROS|B||||ESQ||3
181.182.153|0|ML|1|291.60|540.00|1|1|1|||ROS|ROS|M||||ESQ||3
181.182.154|0|ML|2|405.00|750.00|1|1|1|||ROS|ROS|M||||ESQ||3
181.182.155|0|ML|1|291.60|540.00|1|1|1|||VER|VER|B||||ESQ||3
181.182.156|0|ML|2|405.00|750.00|1|1|1|||VER|VER|B||||ESQ||3
181.182.157|0|ML|1|291.60|540.00|1|1|1|||VER|VER|M||||ESQ||3
181.182.158|0|ML|2|405.00|750.00|1|1|1|||VER|VER|M||||ESQ||3
181.182.159|0|ML|1|291.60|540.00|1|1|1|||OAK|OAK|||||ESQ||3
181.182.160|0|ML|2|405.00|750.00|1|1|1|||OAK|OAK|||||ESQ||3
181.182.161|0|ML|1|291.60|540.00|1|1|1|||TEA|TEA|||||ESQ||3
181.182.162|0|ML|2|405.00|750.00|1|1|1|||TEA|TEA|||||ESQ||3
181.182.163|0|ML|1|291.60|540.00|1|1|1|||JOP|JOP|||||ESQ||3
181.182.164|0|ML|2|405.00|750.00|1|1|1|||JOP|JOP|||||ESQ||3
181.182.165|0|ML|1|291.60|540.00|1|1|1|||AZB|AZB|||||ESQ||3
181.182.166|0|ML|2|405.00|750.00|1|1|1|||AZB|AZB|||||ESQ||3
181.182.167|0|ML|1|291.60|540.00|1|1|1|||DEN|DEN|||||ESQ||3
181.182.168|0|ML|2|405.00|750.00|1|1|1|||DEN|DEN|||||ESQ||3
181.182.169|0|ML|1|291.60|540.00|1|1|1|||BLK|BLK|||||ESQ||3
181.182.170|0|ML|2|405.00|750.00|1|1|1|||BLK|BLK|||||ESQ||3
181.182.171|0|ML|1|291.60|540.00|1|1|1|||ART|ART|||||ESQ||3
181.182.172|0|ML|2|405.00|750.00|1|1|1|||ART|ART|||||ESQ||3
181.182.173|0|ML|1|291.60|540.00|1|1|1|||LIN|LIN|||||ESQ||3
181.182.174|0|ML|2|405.00|750.00|1|1|1|||LIN|LIN|||||ESQ||3
181.182.175|0|ML|1|291.60|540.00|1|1|1|||HAL|HAL|||||ESQ||3
181.182.176|0|ML|2|405.00|750.00|1|1|1|||HAL|HAL|||||ESQ||3
181.183.3|0|ML|1|291.60|540.00|1|1|1|||WH|WH|||||DIR||3
181.183.4|0|ML|2|427.68|792.00|1|1|1|||WH|WH|||||DIR||3
181.183.5|0|ML|1|291.60|540.00|1|1|1|||WH|AZB|||||DIR||3
181.183.6|0|ML|2|427.68|792.00|1|1|1|||WH|AZB|||||DIR||3
181.183.7|0|ML|1|291.60|540.00|1|1|1|||WH|DEN|||||DIR||3
181.183.8|0|ML|2|427.68|792.00|1|1|1|||WH|DEN|||||DIR||3
181.183.9|0|ML|1|318.60|590.00|1|1|1|||WH|BCO|B||||DIR||3
181.183.10|0|ML|2|454.68|842.00|1|1|1|||WH|BCO|B||||DIR||3
181.183.11|0|ML|1|318.60|590.00|1|1|1|||WH|BCO|M||||DIR||3
181.183.12|0|ML|2|454.68|842.00|1|1|1|||WH|BCO|M||||DIR||3
181.183.13|0|ML|1|318.60|590.00|1|1|1|||WH|CCL|B||||DIR||3
181.183.14|0|ML|2|454.68|842.00|1|1|1|||WH|CCL|B||||DIR||3
181.183.15|0|ML|1|318.60|590.00|1|1|1|||WH|CCL|M||||DIR||3
181.183.16|0|ML|2|454.68|842.00|1|1|1|||WH|CCL|M||||DIR||3
181.183.17|0|ML|1|318.60|590.00|1|1|1|||WH|CME|B||||DIR||3
181.183.18|0|ML|2|454.68|842.00|1|1|1|||WH|CME|B||||DIR||3
181.183.19|0|ML|1|318.60|590.00|1|1|1|||WH|CME|M||||DIR||3
181.183.20|0|ML|2|454.68|842.00|1|1|1|||WH|CME|M||||DIR||3
181.183.21|0|ML|1|318.60|590.00|1|1|1|||WH|ANT|B||||DIR||3
181.183.22|0|ML|2|454.68|842.00|1|1|1|||WH|ANT|B||||DIR||3
181.183.23|0|ML|1|318.60|590.00|1|1|1|||WH|ANT|M||||DIR||3
181.183.24|0|ML|2|454.68|842.00|1|1|1|||WH|ANT|M||||DIR||3
181.183.25|0|ML|1|318.60|590.00|1|1|1|||WH|PTO|B||||DIR||3
181.183.26|0|ML|2|454.68|842.00|1|1|1|||WH|PTO|B||||DIR||3
181.183.27|0|ML|1|318.60|590.00|1|1|1|||WH|PTO|M||||DIR||3
181.183.28|0|ML|2|454.68|842.00|1|1|1|||WH|PTO|M||||DIR||3
181.183.29|0|ML|1|318.60|590.00|1|1|1|||WH|CRE|B||||DIR||3
181.183.30|0|ML|2|454.68|842.00|1|1|1|||WH|CRE|B||||DIR||3
181.183.31|0|ML|1|318.60|590.00|1|1|1|||WH|CRE|M||||DIR||3
181.183.32|0|ML|2|454.68|842.00|1|1|1|||WH|CRE|M||||DIR||3
181.183.33|0|ML|1|318.60|590.00|1|1|1|||WH|CAM|B||||DIR||3
181.183.34|0|ML|2|454.68|842.00|1|1|1|||WH|CAM|B||||DIR||3
181.183.35|0|ML|1|318.60|590.00|1|1|1|||WH|CAM|M||||DIR||3
181.183.36|0|ML|2|454.68|842.00|1|1|1|||WH|CAM|M||||DIR||3
181.183.37|0|ML|1|318.60|590.00|1|1|1|||WH|OUR|B||||DIR||3
181.183.38|0|ML|2|454.68|842.00|1|1|1|||WH|OUR|B||||DIR||3
181.183.39|0|ML|1|318.60|590.00|1|1|1|||WH|OUR|M||||DIR||3
181.183.40|0|ML|2|454.68|842.00|1|1|1|||WH|OUR|M||||DIR||3
181.183.41|0|ML|1|318.60|590.00|1|1|1|||WH|COB|B||||DIR||3
181.183.42|0|ML|2|454.68|842.00|1|1|1|||WH|COB|B||||DIR||3
181.183.43|0|ML|1|318.60|590.00|1|1|1|||WH|COB|M||||DIR||3
181.183.44|0|ML|2|454.68|842.00|1|1|1|||WH|COB|M||||DIR||3
181.183.45|0|ML|1|318.60|590.00|1|1|1|||WH|CHO|B||||DIR||3
181.183.46|0|ML|2|454.68|842.00|1|1|1|||WH|CHO|B||||DIR||3
181.183.47|0|ML|1|318.60|590.00|1|1|1|||WH|CHO|M||||DIR||3
181.183.48|0|ML|2|454.68|842.00|1|1|1|||WH|CHO|M||||DIR||3
181.183.49|0|ML|1|318.60|590.00|1|1|1|||WH|VAG|B||||DIR||3
181.183.50|0|ML|2|454.68|842.00|1|1|1|||WH|VAG|B||||DIR||3
181.183.51|0|ML|1|318.60|590.00|1|1|1|||WH|VAG|M||||DIR||3
181.183.52|0|ML|2|454.68|842.00|1|1|1|||WH|VAG|M||||DIR||3
181.183.53|0|ML|1|318.60|590.00|1|1|1|||WH|AZE|B||||DIR||3
181.183.54|0|ML|2|454.68|842.00|1|1|1|||WH|AZE|B||||DIR||3
181.183.55|0|ML|1|318.60|590.00|1|1|1|||WH|AZE|M||||DIR||3
181.183.56|0|ML|2|454.68|842.00|1|1|1|||WH|AZE|M||||DIR||3
181.183.57|0|ML|1|318.60|590.00|1|1|1|||WH|AMA|B||||DIR||3
181.183.58|0|ML|2|454.68|842.00|1|1|1|||WH|AMA|B||||DIR||3
181.183.59|0|ML|1|318.60|590.00|1|1|1|||WH|AMA|M||||DIR||3
181.183.60|0|ML|2|454.68|842.00|1|1|1|||WH|AMA|M||||DIR||3
181.183.61|0|ML|1|318.60|590.00|1|1|1|||WH|AES|B||||DIR||3
181.183.62|0|ML|2|454.68|842.00|1|1|1|||WH|AES|B||||DIR||3
181.183.63|0|ML|1|318.60|590.00|1|1|1|||WH|AES|M||||DIR||3
181.183.64|0|ML|2|454.68|842.00|1|1|1|||WH|AES|M||||DIR||3
181.183.65|0|ML|1|318.60|590.00|1|1|1|||WH|PRA|B||||DIR||3
181.183.66|0|ML|2|454.68|842.00|1|1|1|||WH|PRA|B||||DIR||3
181.183.67|0|ML|1|318.60|590.00|1|1|1|||WH|PRA|M||||DIR||3
181.183.68|0|ML|2|454.68|842.00|1|1|1|||WH|PRA|M||||DIR||3
181.183.69|0|ML|1|318.60|590.00|1|1|1|||WH|ROS|B||||DIR||3
181.183.70|0|ML|2|454.68|842.00|1|1|1|||WH|ROS|B||||DIR||3
181.183.71|0|ML|1|318.60|590.00|1|1|1|||WH|ROS|M||||DIR||3
181.183.72|0|ML|2|454.68|842.00|1|1|1|||WH|ROS|M||||DIR||3
181.183.73|0|ML|1|318.60|590.00|1|1|1|||WH|VER|B||||DIR||3
181.183.74|0|ML|2|454.68|842.00|1|1|1|||WH|VER|B||||DIR||3
181.183.75|0|ML|1|318.60|590.00|1|1|1|||WH|VER|M||||DIR||3
181.183.76|0|ML|2|454.68|842.00|1|1|1|||WH|VER|M||||DIR||3
181.183.77|0|ML|1|318.60|590.00|1|1|1|||WH|OAK|||||DIR||3
181.183.78|0|ML|2|454.68|842.00|1|1|1|||WH|OAK|||||DIR||3
181.183.79|0|ML|1|318.60|590.00|1|1|1|||WH|TEA|||||DIR||3
181.183.80|0|ML|2|454.68|842.00|1|1|1|||WH|TEA|||||DIR||3
181.183.81|0|ML|1|318.60|590.00|1|1|1|||WH|JOP|||||DIR||3
181.183.82|0|ML|2|454.68|842.00|1|1|1|||WH|JOP|||||DIR||3
181.183.83|0|ML|1|318.60|590.00|1|1|1|||WH|BLK|||||DIR||3
181.183.84|0|ML|2|454.68|842.00|1|1|1|||WH|BLK|||||DIR||3
181.183.85|0|ML|1|318.60|590.00|1|1|1|||WH|ART|||||DIR||3
181.183.86|0|ML|2|454.68|842.00|1|1|1|||WH|ART|||||DIR||3
181.183.87|0|ML|1|318.60|590.00|1|1|1|||WH|LIN|||||DIR||3
181.183.88|0|ML|2|454.68|842.00|1|1|1|||WH|LIN|||||DIR||3
181.183.89|0|ML|1|318.60|590.00|1|1|1|||WH|HAL|||||DIR||3
181.183.90|0|ML|2|454.68|842.00|1|1|1|||WH|HAL|||||DIR||3
181.183.91|0|ML|1|340.20|630.00|1|1|1|||BCO|BCO|B||||DIR||3
181.183.92|0|ML|2|476.28|882.00|1|1|1|||BCO|BCO|B||||DIR||3
181.183.93|0|ML|1|340.20|630.00|1|1|1|||BCO|BCO|M||||DIR||3
181.183.94|0|ML|2|476.28|882.00|1|1|1|||BCO|BCO|M||||DIR||3
181.183.95|0|ML|1|340.20|630.00|1|1|1|||CCL|CCL|B||||DIR||3
181.183.96|0|ML|2|476.28|882.00|1|1|1|||CCL|CCL|B||||DIR||3
181.183.97|0|ML|1|340.20|630.00|1|1|1|||CCL|CCL|M||||DIR||3
181.183.98|0|ML|2|476.28|882.00|1|1|1|||CCL|CCL|M||||DIR||3
181.183.99|0|ML|1|340.20|630.00|1|1|1|||CME|CME|B||||DIR||3
181.183.100|0|ML|2|476.28|882.00|1|1|1|||CME|CME|B||||DIR||3
181.183.101|0|ML|1|340.20|630.00|1|1|1|||CME|CME|M||||DIR||3
181.183.102|0|ML|2|476.28|882.00|1|1|1|||CME|CME|M||||DIR||3
181.183.103|0|ML|1|340.20|630.00|1|1|1|||ANT|ANT|B||||DIR||3
181.183.104|0|ML|2|476.28|882.00|1|1|1|||ANT|ANT|B||||DIR||3
181.183.105|0|ML|1|340.20|630.00|1|1|1|||ANT|ANT|M||||DIR||3
181.183.106|0|ML|2|476.28|882.00|1|1|1|||ANT|ANT|M||||DIR||3
181.183.107|0|ML|1|340.20|630.00|1|1|1|||PTO|PTO|B||||DIR||3
181.183.108|0|ML|2|476.28|882.00|1|1|1|||PTO|PTO|B||||DIR||3
181.183.109|0|ML|1|340.20|630.00|1|1|1|||PTO|PTO|M||||DIR||3
181.183.110|0|ML|2|476.28|882.00|1|1|1|||PTO|PTO|M||||DIR||3
181.183.111|0|ML|1|340.20|630.00|1|1|1|||CRE|CRE|B||||DIR||3
181.183.112|0|ML|2|476.28|882.00|1|1|1|||CRE|CRE|B||||DIR||3
181.183.113|0|ML|1|340.20|630.00|1|1|1|||CRE|CRE|M||||DIR||3
181.183.114|0|ML|2|476.28|882.00|1|1|1|||CRE|CRE|M||||DIR||3
181.183.115|0|ML|1|340.20|630.00|1|1|1|||CAM|CAM|B||||DIR||3
181.183.116|0|ML|2|476.28|882.00|1|1|1|||CAM|CAM|B||||DIR||3
181.183.117|0|ML|1|340.20|630.00|1|1|1|||CAM|CAM|M||||DIR||3
181.183.118|0|ML|2|476.28|882.00|1|1|1|||CAM|CAM|M||||DIR||3
181.183.119|0|ML|1|340.20|630.00|1|1|1|||OUR|OUR|B||||DIR||3
181.183.120|0|ML|2|476.28|882.00|1|1|1|||OUR|OUR|B||||DIR||3
181.183.121|0|ML|1|340.20|630.00|1|1|1|||OUR|OUR|M||||DIR||3
181.183.122|0|ML|2|476.28|882.00|1|1|1|||OUR|OUR|M||||DIR||3
181.183.123|0|ML|1|340.20|630.00|1|1|1|||COB|COB|B||||DIR||3
181.183.124|0|ML|2|476.28|882.00|1|1|1|||COB|COB|B||||DIR||3
181.183.125|0|ML|1|340.20|630.00|1|1|1|||COB|COB|M||||DIR||3
181.183.126|0|ML|2|476.28|882.00|1|1|1|||COB|COB|M||||DIR||3
181.183.127|0|ML|1|340.20|630.00|1|1|1|||CHO|CHO|B||||DIR||3
181.183.128|0|ML|2|476.28|882.00|1|1|1|||CHO|CHO|B||||DIR||3
181.183.129|0|ML|1|340.20|630.00|1|1|1|||CHO|CHO|M||||DIR||3
181.183.130|0|ML|2|476.28|882.00|1|1|1|||CHO|CHO|M||||DIR||3
181.183.131|0|ML|1|340.20|630.00|1|1|1|||VAG|VAG|B||||DIR||3
181.183.132|0|ML|2|476.28|882.00|1|1|1|||VAG|VAG|B||||DIR||3
181.183.133|0|ML|1|340.20|630.00|1|1|1|||VAG|VAG|M||||DIR||3
181.183.134|0|ML|2|476.28|882.00|1|1|1|||VAG|VAG|M||||DIR||3
181.183.135|0|ML|1|340.20|630.00|1|1|1|||AZE|AZE|B||||DIR||3
181.183.136|0|ML|2|476.28|882.00|1|1|1|||AZE|AZE|B||||DIR||3
181.183.137|0|ML|1|340.20|630.00|1|1|1|||AZE|AZE|M||||DIR||3
181.183.138|0|ML|2|476.28|882.00|1|1|1|||AZE|AZE|M||||DIR||3
181.183.139|0|ML|1|340.20|630.00|1|1|1|||AMA|AMA|B||||DIR||3
181.183.140|0|ML|2|476.28|882.00|1|1|1|||AMA|AMA|B||||DIR||3
181.183.141|0|ML|1|340.20|630.00|1|1|1|||AMA|AMA|M||||DIR||3
181.183.142|0|ML|2|476.28|882.00|1|1|1|||AMA|AMA|M||||DIR||3
181.183.143|0|ML|1|340.20|630.00|1|1|1|||AES|AES|B||||DIR||3
181.183.144|0|ML|2|476.28|882.00|1|1|1|||AES|AES|B||||DIR||3
181.183.145|0|ML|1|340.20|630.00|1|1|1|||AES|AES|M||||DIR||3
181.183.146|0|ML|2|476.28|882.00|1|1|1|||AES|AES|M||||DIR||3
181.183.147|0|ML|1|340.20|630.00|1|1|1|||PRA|PRA|B||||DIR||3
181.183.148|0|ML|2|476.28|882.00|1|1|1|||PRA|PRA|B||||DIR||3
181.183.149|0|ML|1|340.20|630.00|1|1|1|||PRA|PRA|M||||DIR||3
181.183.150|0|ML|2|476.28|882.00|1|1|1|||PRA|PRA|M||||DIR||3
181.183.151|0|ML|1|340.20|630.00|1|1|1|||ROS|ROS|B||||DIR||3
181.183.152|0|ML|2|476.28|882.00|1|1|1|||ROS|ROS|B||||DIR||3
181.183.153|0|ML|1|340.20|630.00|1|1|1|||ROS|ROS|M||||DIR||3
181.183.154|0|ML|2|476.28|882.00|1|1|1|||ROS|ROS|M||||DIR||3
181.183.155|0|ML|1|340.20|630.00|1|1|1|||VER|VER|B||||DIR||3
181.183.156|0|ML|2|476.28|882.00|1|1|1|||VER|VER|B||||DIR||3
181.183.157|0|ML|1|340.20|630.00|1|1|1|||VER|VER|M||||DIR||3
181.183.158|0|ML|2|476.28|882.00|1|1|1|||VER|VER|M||||DIR||3
181.183.159|0|ML|1|340.20|630.00|1|1|1|||OAK|OAK|||||DIR||3
181.183.160|0|ML|2|476.28|882.00|1|1|1|||OAK|OAK|||||DIR||3
181.183.161|0|ML|1|340.20|630.00|1|1|1|||TEA|TEA|||||DIR||3
181.183.162|0|ML|2|476.28|882.00|1|1|1|||TEA|TEA|||||DIR||3
181.183.163|0|ML|1|340.20|630.00|1|1|1|||JOP|JOP|||||DIR||3
181.183.164|0|ML|2|476.28|882.00|1|1|1|||JOP|JOP|||||DIR||3
181.183.165|0|ML|1|340.20|630.00|1|1|1|||AZB|AZB|||||DIR||3
181.183.166|0|ML|2|476.28|882.00|1|1|1|||AZB|AZB|||||DIR||3
181.183.167|0|ML|1|340.20|630.00|1|1|1|||DEN|DEN|||||DIR||3
181.183.168|0|ML|2|476.28|882.00|1|1|1|||DEN|DEN|||||DIR||3
181.183.169|0|ML|1|340.20|630.00|1|1|1|||BLK|BLK|||||DIR||3
181.183.170|0|ML|2|476.28|882.00|1|1|1|||BLK|BLK|||||DIR||3
181.183.171|0|ML|1|340.20|630.00|1|1|1|||ART|ART|||||DIR||3
181.183.172|0|ML|2|476.28|882.00|1|1|1|||ART|ART|||||DIR||3
181.183.173|0|ML|1|340.20|630.00|1|1|1|||LIN|LIN|||||DIR||3
181.183.174|0|ML|2|476.28|882.00|1|1|1|||LIN|LIN|||||DIR||3
181.183.175|0|ML|1|340.20|630.00|1|1|1|||HAL|HAL|||||DIR||3
181.183.176|0|ML|2|476.28|882.00|1|1|1|||HAL|HAL|||||DIR||3
184.185.3|0|ML|3|178.20|330.00|1|1|2|||WH|WH|||||DIR||1
184.185.4|0|ML|4|307.80|570.00|1|1|2|||WH|WH|||||DIR||1
184.185.5|0|ML|3|178.20|330.00|1|1|2|||WH|AZB|||||DIR||1
184.185.6|0|ML|4|307.80|570.00|1|1|2|||WH|AZB|||||DIR||1
184.185.9|0|ML|3|205.20|380.00|1|1|2|||WH|BCO|B||||DIR||1
184.185.10|0|ML|4|334.80|620.00|1|1|2|||WH|BCO|B||||DIR||1
184.185.11|0|ML|3|205.20|380.00|1|1|2|||WH|BCO|M||||DIR||1
184.185.12|0|ML|4|334.80|620.00|1|1|2|||WH|BCO|M||||DIR||1
184.185.13|0|ML|3|205.20|380.00|1|1|2|||WH|CCL|B||||DIR||1
184.185.14|0|ML|4|334.80|620.00|1|1|2|||WH|CCL|B||||DIR||1
184.185.15|0|ML|3|205.20|380.00|1|1|2|||WH|CCL|M||||DIR||1
184.185.16|0|ML|4|334.80|620.00|1|1|2|||WH|CCL|M||||DIR||1
184.185.17|0|ML|3|205.20|380.00|1|1|2|||WH|CME|B||||DIR||1
184.185.18|0|ML|4|334.80|620.00|1|1|2|||WH|CME|B||||DIR||1
184.185.19|0|ML|3|205.20|380.00|1|1|2|||WH|CME|M||||DIR||1
184.185.20|0|ML|4|334.80|620.00|1|1|2|||WH|CME|M||||DIR||1
184.185.21|0|ML|3|205.20|380.00|1|1|2|||WH|ANT|B||||DIR||1
184.185.22|0|ML|4|334.80|620.00|1|1|2|||WH|ANT|B||||DIR||1
184.185.23|0|ML|3|205.20|380.00|1|1|2|||WH|ANT|M||||DIR||1
184.185.24|0|ML|4|334.80|620.00|1|1|2|||WH|ANT|M||||DIR||1
184.185.25|0|ML|3|205.20|380.00|1|1|2|||WH|PTO|B||||DIR||1
184.185.26|0|ML|4|334.80|620.00|1|1|2|||WH|PTO|B||||DIR||1
184.185.27|0|ML|3|205.20|380.00|1|1|2|||WH|PTO|M||||DIR||1
184.185.28|0|ML|4|334.80|620.00|1|1|2|||WH|PTO|M||||DIR||1
184.185.29|0|ML|3|205.20|380.00|1|1|2|||WH|CRE|B||||DIR||1
184.185.30|0|ML|4|334.80|620.00|1|1|2|||WH|CRE|B||||DIR||1
184.185.31|0|ML|3|205.20|380.00|1|1|2|||WH|CRE|M||||DIR||1
184.185.32|0|ML|4|334.80|620.00|1|1|2|||WH|CRE|M||||DIR||1
184.185.33|0|ML|3|205.20|380.00|1|1|2|||WH|CAM|B||||DIR||1
184.185.34|0|ML|4|334.80|620.00|1|1|2|||WH|CAM|B||||DIR||1
184.185.35|0|ML|3|205.20|380.00|1|1|2|||WH|CAM|M||||DIR||1
184.185.36|0|ML|4|334.80|620.00|1|1|2|||WH|CAM|M||||DIR||1
184.185.37|0|ML|3|205.20|380.00|1|1|2|||WH|OUR|B||||DIR||1
184.185.38|0|ML|4|334.80|620.00|1|1|2|||WH|OUR|B||||DIR||1
184.185.39|0|ML|3|205.20|380.00|1|1|2|||WH|OUR|M||||DIR||1
184.185.40|0|ML|4|334.80|620.00|1|1|2|||WH|OUR|M||||DIR||1
184.185.41|0|ML|3|205.20|380.00|1|1|2|||WH|COB|B||||DIR||1
184.185.42|0|ML|4|334.80|620.00|1|1|2|||WH|COB|B||||DIR||1
184.185.43|0|ML|3|205.20|380.00|1|1|2|||WH|COB|M||||DIR||1
184.185.44|0|ML|4|334.80|620.00|1|1|2|||WH|COB|M||||DIR||1
184.185.45|0|ML|3|205.20|380.00|1|1|2|||WH|CHO|B||||DIR||1
184.185.46|0|ML|4|334.80|620.00|1|1|2|||WH|CHO|B||||DIR||1
184.185.47|0|ML|3|205.20|380.00|1|1|2|||WH|CHO|M||||DIR||1
184.185.48|0|ML|4|334.80|620.00|1|1|2|||WH|CHO|M||||DIR||1
184.185.49|0|ML|3|205.20|380.00|1|1|2|||WH|VAG|B||||DIR||1
184.185.50|0|ML|4|334.80|620.00|1|1|2|||WH|VAG|B||||DIR||1
184.185.51|0|ML|3|205.20|380.00|1|1|2|||WH|VAG|M||||DIR||1
184.185.52|0|ML|4|334.80|620.00|1|1|2|||WH|VAG|M||||DIR||1
184.185.53|0|ML|3|205.20|380.00|1|1|2|||WH|AZE|B||||DIR||1
184.185.54|0|ML|4|334.80|620.00|1|1|2|||WH|AZE|B||||DIR||1
184.185.55|0|ML|3|205.20|380.00|1|1|2|||WH|AZE|M||||DIR||1
184.185.56|0|ML|4|334.80|620.00|1|1|2|||WH|AZE|M||||DIR||1
184.185.57|0|ML|3|205.20|380.00|1|1|2|||WH|AMA|B||||DIR||1
184.185.58|0|ML|4|334.80|620.00|1|1|2|||WH|AMA|B||||DIR||1
184.185.59|0|ML|3|205.20|380.00|1|1|2|||WH|AMA|M||||DIR||1
184.185.60|0|ML|4|334.80|620.00|1|1|2|||WH|AMA|M||||DIR||1
184.185.61|0|ML|3|205.20|380.00|1|1|2|||WH|AES|B||||DIR||1
184.185.62|0|ML|4|334.80|620.00|1|1|2|||WH|AES|B||||DIR||1
184.185.63|0|ML|3|205.20|380.00|1|1|2|||WH|AES|M||||DIR||1
184.185.64|0|ML|4|334.80|620.00|1|1|2|||WH|AES|M||||DIR||1
184.185.65|0|ML|3|205.20|380.00|1|1|2|||WH|PRA|B||||DIR||1
184.185.66|0|ML|4|334.80|620.00|1|1|2|||WH|PRA|B||||DIR||1
184.185.67|0|ML|3|205.20|380.00|1|1|2|||WH|PRA|M||||DIR||1
184.185.68|0|ML|4|334.80|620.00|1|1|2|||WH|PRA|M||||DIR||1
184.185.69|0|ML|3|205.20|380.00|1|1|2|||WH|ROS|B||||DIR||1
184.185.70|0|ML|4|334.80|620.00|1|1|2|||WH|ROS|B||||DIR||1
184.185.71|0|ML|3|205.20|380.00|1|1|2|||WH|ROS|M||||DIR||1
184.185.72|0|ML|4|334.80|620.00|1|1|2|||WH|ROS|M||||DIR||1
184.185.73|0|ML|3|205.20|380.00|1|1|2|||WH|VER|B||||DIR||1
184.185.74|0|ML|4|334.80|620.00|1|1|2|||WH|VER|B||||DIR||1
184.185.75|0|ML|3|205.20|380.00|1|1|2|||WH|VER|M||||DIR||1
184.185.76|0|ML|4|334.80|620.00|1|1|2|||WH|VER|M||||DIR||1
184.185.77|0|ML|3|205.20|380.00|1|1|2|||WH|OAK|||||DIR||1
184.185.78|0|ML|4|334.80|620.00|1|1|2|||WH|OAK|||||DIR||1
184.185.79|0|ML|3|205.20|380.00|1|1|2|||WH|TEA|||||DIR||1
184.185.80|0|ML|4|334.80|620.00|1|1|2|||WH|TEA|||||DIR||1
184.185.81|0|ML|3|205.20|380.00|1|1|2|||WH|JOP|||||DIR||1
184.185.82|0|ML|4|334.80|620.00|1|1|2|||WH|JOP|||||DIR||1
184.185.186|0|ML|3|205.20|380.00|1|1|2|||WH|DEN|||||DIR||1
184.185.187|0|ML|4|334.80|620.00|1|1|2|||WH|DEN|||||DIR||1
184.185.83|0|ML|3|205.20|380.00|1|1|2|||WH|BLK|||||DIR||1
184.185.84|0|ML|4|334.80|620.00|1|1|2|||WH|BLK|||||DIR||1
184.185.85|0|ML|3|205.20|380.00|1|1|2|||WH|ART|||||DIR||1
184.185.86|0|ML|4|334.80|620.00|1|1|2|||WH|ART|||||DIR||1
184.185.87|0|ML|3|205.20|380.00|1|1|2|||WH|LIN|||||DIR||1
184.185.88|0|ML|4|334.80|620.00|1|1|2|||WH|LIN|||||DIR||1
184.185.89|0|ML|3|205.20|380.00|1|1|2|||WH|HAL|||||DIR||1
184.185.90|0|ML|4|334.80|620.00|1|1|2|||WH|HAL|||||DIR||1
184.185.91|0|ML|3|226.80|420.00|1|1|2|||BCO|BCO|B||||DIR||1
184.185.92|0|ML|4|356.40|660.00|1|1|2|||BCO|BCO|B||||DIR||1
184.185.93|0|ML|3|226.80|420.00|1|1|2|||BCO|BCO|M||||DIR||1
184.185.94|0|ML|4|356.40|660.00|1|1|2|||BCO|BCO|M||||DIR||1
184.185.95|0|ML|3|226.80|420.00|1|1|2|||CCL|CCL|B||||DIR||1
184.185.96|0|ML|4|356.40|660.00|1|1|2|||CCL|CCL|B||||DIR||1
184.185.97|0|ML|3|226.80|420.00|1|1|2|||CCL|CCL|M||||DIR||1
184.185.98|0|ML|4|356.40|660.00|1|1|2|||CCL|CCL|M||||DIR||1
184.185.99|0|ML|3|226.80|420.00|1|1|2|||CME|CME|B||||DIR||1
184.185.100|0|ML|4|356.40|660.00|1|1|2|||CME|CME|B||||DIR||1
184.185.101|0|ML|3|226.80|420.00|1|1|2|||CME|CME|M||||DIR||1
184.185.102|0|ML|4|356.40|660.00|1|1|2|||CME|CME|M||||DIR||1
184.185.103|0|ML|3|226.80|420.00|1|1|2|||ANT|ANT|B||||DIR||1
184.185.104|0|ML|4|356.40|660.00|1|1|2|||ANT|ANT|B||||DIR||1
184.185.105|0|ML|3|226.80|420.00|1|1|2|||ANT|ANT|M||||DIR||1
184.185.106|0|ML|4|356.40|660.00|1|1|2|||ANT|ANT|M||||DIR||1
184.185.107|0|ML|3|226.80|420.00|1|1|2|||PTO|PTO|B||||DIR||1
184.185.108|0|ML|4|356.40|660.00|1|1|2|||PTO|PTO|B||||DIR||1
184.185.109|0|ML|3|226.80|420.00|1|1|2|||PTO|PTO|M||||DIR||1
184.185.110|0|ML|4|356.40|660.00|1|1|2|||PTO|PTO|M||||DIR||1
184.185.111|0|ML|3|226.80|420.00|1|1|2|||CRE|CRE|B||||DIR||1
184.185.112|0|ML|4|356.40|660.00|1|1|2|||CRE|CRE|B||||DIR||1
184.185.113|0|ML|3|226.80|420.00|1|1|2|||CRE|CRE|M||||DIR||1
184.185.114|0|ML|4|356.40|660.00|1|1|2|||CRE|CRE|M||||DIR||1
184.185.115|0|ML|3|226.80|420.00|1|1|2|||CAM|CAM|B||||DIR||1
184.185.116|0|ML|4|356.40|660.00|1|1|2|||CAM|CAM|B||||DIR||1
184.185.117|0|ML|3|226.80|420.00|1|1|2|||CAM|CAM|M||||DIR||1
184.185.118|0|ML|4|356.40|660.00|1|1|2|||CAM|CAM|M||||DIR||1
184.185.119|0|ML|3|226.80|420.00|1|1|2|||OUR|OUR|B||||DIR||1
184.185.120|0|ML|4|356.40|660.00|1|1|2|||OUR|OUR|B||||DIR||1
184.185.121|0|ML|3|226.80|420.00|1|1|2|||OUR|OUR|M||||DIR||1
184.185.122|0|ML|4|356.40|660.00|1|1|2|||OUR|OUR|M||||DIR||1
184.185.123|0|ML|3|226.80|420.00|1|1|2|||COB|COB|B||||DIR||1
184.185.124|0|ML|4|356.40|660.00|1|1|2|||COB|COB|B||||DIR||1
184.185.125|0|ML|3|226.80|420.00|1|1|2|||COB|COB|M||||DIR||1
184.185.126|0|ML|4|356.40|660.00|1|1|2|||COB|COB|M||||DIR||1
184.185.127|0|ML|3|226.80|420.00|1|1|2|||CHO|CHO|B||||DIR||1
184.185.128|0|ML|4|356.40|660.00|1|1|2|||CHO|CHO|B||||DIR||1
184.185.129|0|ML|3|226.80|420.00|1|1|2|||CHO|CHO|M||||DIR||1
184.185.130|0|ML|4|356.40|660.00|1|1|2|||CHO|CHO|M||||DIR||1
184.185.131|0|ML|3|226.80|420.00|1|1|2|||VAG|VAG|B||||DIR||1
184.185.132|0|ML|4|356.40|660.00|1|1|2|||VAG|VAG|B||||DIR||1
184.185.133|0|ML|3|226.80|420.00|1|1|2|||VAG|VAG|M||||DIR||1
184.185.134|0|ML|4|356.40|660.00|1|1|2|||VAG|VAG|M||||DIR||1
184.185.135|0|ML|3|226.80|420.00|1|1|2|||AZE|AZE|B||||DIR||1
184.185.136|0|ML|4|356.40|660.00|1|1|2|||AZE|AZE|B||||DIR||1
184.185.137|0|ML|3|226.80|420.00|1|1|2|||AZE|AZE|M||||DIR||1
184.185.138|0|ML|4|356.40|660.00|1|1|2|||AZE|AZE|M||||DIR||1
184.185.139|0|ML|3|226.80|420.00|1|1|2|||AMA|AMA|B||||DIR||1
184.185.140|0|ML|4|356.40|660.00|1|1|2|||AMA|AMA|B||||DIR||1
184.185.141|0|ML|3|226.80|420.00|1|1|2|||AMA|AMA|M||||DIR||1
184.185.142|0|ML|4|356.40|660.00|1|1|2|||AMA|AMA|M||||DIR||1
184.185.143|0|ML|3|226.80|420.00|1|1|2|||AES|AES|B||||DIR||1
184.185.144|0|ML|4|356.40|660.00|1|1|2|||AES|AES|B||||DIR||1
184.185.145|0|ML|3|226.80|420.00|1|1|2|||AES|AES|M||||DIR||1
184.185.146|0|ML|4|356.40|660.00|1|1|2|||AES|AES|M||||DIR||1
184.185.147|0|ML|3|226.80|420.00|1|1|2|||PRA|PRA|B||||DIR||1
184.185.148|0|ML|4|356.40|660.00|1|1|2|||PRA|PRA|B||||DIR||1
184.185.149|0|ML|3|226.80|420.00|1|1|2|||PRA|PRA|M||||DIR||1
184.185.150|0|ML|4|356.40|660.00|1|1|2|||PRA|PRA|M||||DIR||1
184.185.151|0|ML|3|226.80|420.00|1|1|2|||ROS|ROS|B||||DIR||1
184.185.152|0|ML|4|356.40|660.00|1|1|2|||ROS|ROS|B||||DIR||1
184.185.153|0|ML|3|226.80|420.00|1|1|2|||ROS|ROS|M||||DIR||1
184.185.154|0|ML|4|356.40|660.00|1|1|2|||ROS|ROS|M||||DIR||1
184.185.155|0|ML|3|226.80|420.00|1|1|2|||VER|VER|B||||DIR||1
184.185.156|0|ML|4|356.40|660.00|1|1|2|||VER|VER|B||||DIR||1
184.185.157|0|ML|3|226.80|420.00|1|1|2|||VER|VER|M||||DIR||1
184.185.158|0|ML|4|356.40|660.00|1|1|2|||VER|VER|M||||DIR||1
184.185.159|0|ML|3|226.80|420.00|1|1|2|||OAK|OAK|||||DIR||1
184.185.160|0|ML|4|356.40|660.00|1|1|2|||OAK|OAK|||||DIR||1
184.185.161|0|ML|3|226.80|420.00|1|1|2|||TEA|TEA|||||DIR||1
184.185.162|0|ML|4|356.40|660.00|1|1|2|||TEA|TEA|||||DIR||1
184.185.163|0|ML|3|226.80|420.00|1|1|2|||JOP|JOP|||||DIR||1
184.185.164|0|ML|4|356.40|660.00|1|1|2|||JOP|JOP|||||DIR||1
184.185.165|0|ML|3|226.80|420.00|1|1|2|||AZB|AZB|||||DIR||1
184.185.166|0|ML|4|356.40|660.00|1|1|2|||AZB|AZB|||||DIR||1
184.185.167|0|ML|3|226.80|420.00|1|1|2|||DEN|DEN|||||DIR||1
184.185.168|0|ML|4|356.40|660.00|1|1|2|||DEN|DEN|||||DIR||1
184.185.169|0|ML|3|226.80|420.00|1|1|2|||BLK|BLK|||||DIR||1
184.185.170|0|ML|4|356.40|660.00|1|1|2|||BLK|BLK|||||DIR||1
184.185.171|0|ML|3|226.80|420.00|1|1|2|||ART|ART|||||DIR||1
184.185.172|0|ML|4|356.40|660.00|1|1|2|||ART|ART|||||DIR||1
184.185.173|0|ML|3|226.80|420.00|1|1|2|||LIN|LIN|||||DIR||1
184.185.174|0|ML|4|356.40|660.00|1|1|2|||LIN|LIN|||||DIR||1
184.185.175|0|ML|3|226.80|420.00|1|1|2|||HAL|HAL|||||DIR||1
184.185.176|0|ML|4|356.40|660.00|1|1|2|||HAL|HAL|||||DIR||1
184.188.3|0|ML|3|213.84|396.00|1|1|2|||WH|WH|||||ESQ||1
184.188.4|0|ML|4|369.36|684.00|1|1|2|||WH|WH|||||ESQ||1
184.188.5|0|ML|3|213.84|396.00|1|1|2|||WH|AZB|||||ESQ||1
184.188.6|0|ML|4|369.36|684.00|1|1|2|||WH|AZB|||||ESQ||1
184.188.9|0|ML|3|240.84|446.00|1|1|2|||WH|BCO|B||||ESQ||1
184.188.10|0|ML|4|396.36|734.00|1|1|2|||WH|BCO|B||||ESQ||1
184.188.11|0|ML|3|240.84|446.00|1|1|2|||WH|BCO|M||||ESQ||1
184.188.12|0|ML|4|396.36|734.00|1|1|2|||WH|BCO|M||||ESQ||1
184.188.13|0|ML|3|240.84|446.00|1|1|2|||WH|CCL|B||||ESQ||1
184.188.14|0|ML|4|396.36|734.00|1|1|2|||WH|CCL|B||||ESQ||1
184.188.15|0|ML|3|240.84|446.00|1|1|2|||WH|CCL|M||||ESQ||1
184.188.16|0|ML|4|396.36|734.00|1|1|2|||WH|CCL|M||||ESQ||1
184.188.17|0|ML|3|240.84|446.00|1|1|2|||WH|CME|B||||ESQ||1
184.188.18|0|ML|4|396.36|734.00|1|1|2|||WH|CME|B||||ESQ||1
184.188.19|0|ML|3|240.84|446.00|1|1|2|||WH|CME|M||||ESQ||1
184.188.20|0|ML|4|396.36|734.00|1|1|2|||WH|CME|M||||ESQ||1
184.188.21|0|ML|3|240.84|446.00|1|1|2|||WH|ANT|B||||ESQ||1
184.188.22|0|ML|4|396.36|734.00|1|1|2|||WH|ANT|B||||ESQ||1
184.188.23|0|ML|3|240.84|446.00|1|1|2|||WH|ANT|M||||ESQ||1
184.188.24|0|ML|4|396.36|734.00|1|1|2|||WH|ANT|M||||ESQ||1
184.188.25|0|ML|3|240.84|446.00|1|1|2|||WH|PTO|B||||ESQ||1
184.188.26|0|ML|4|396.36|734.00|1|1|2|||WH|PTO|B||||ESQ||1
184.188.27|0|ML|3|240.84|446.00|1|1|2|||WH|PTO|M||||ESQ||1
184.188.28|0|ML|4|396.36|734.00|1|1|2|||WH|PTO|M||||ESQ||1
184.188.29|0|ML|3|240.84|446.00|1|1|2|||WH|CRE|B||||ESQ||1
184.188.30|0|ML|4|396.36|734.00|1|1|2|||WH|CRE|B||||ESQ||1
184.188.31|0|ML|3|240.84|446.00|1|1|2|||WH|CRE|M||||ESQ||1
184.188.32|0|ML|4|396.36|734.00|1|1|2|||WH|CRE|M||||ESQ||1
184.188.33|0|ML|3|240.84|446.00|1|1|2|||WH|CAM|B||||ESQ||1
184.188.34|0|ML|4|396.36|734.00|1|1|2|||WH|CAM|B||||ESQ||1
184.188.35|0|ML|3|240.84|446.00|1|1|2|||WH|CAM|M||||ESQ||1
184.188.36|0|ML|4|396.36|734.00|1|1|2|||WH|CAM|M||||ESQ||1
184.188.37|0|ML|3|240.84|446.00|1|1|2|||WH|OUR|B||||ESQ||1
184.188.38|0|ML|4|396.36|734.00|1|1|2|||WH|OUR|B||||ESQ||1
184.188.39|0|ML|3|240.84|446.00|1|1|2|||WH|OUR|M||||ESQ||1
184.188.40|0|ML|4|396.36|734.00|1|1|2|||WH|OUR|M||||ESQ||1
184.188.41|0|ML|3|240.84|446.00|1|1|2|||WH|COB|B||||ESQ||1
184.188.42|0|ML|4|396.36|734.00|1|1|2|||WH|COB|B||||ESQ||1
184.188.43|0|ML|3|240.84|446.00|1|1|2|||WH|COB|M||||ESQ||1
184.188.44|0|ML|4|396.36|734.00|1|1|2|||WH|COB|M||||ESQ||1
184.188.45|0|ML|3|240.84|446.00|1|1|2|||WH|CHO|B||||ESQ||1
184.188.46|0|ML|4|396.36|734.00|1|1|2|||WH|CHO|B||||ESQ||1
184.188.47|0|ML|3|240.84|446.00|1|1|2|||WH|CHO|M||||ESQ||1
184.188.48|0|ML|4|396.36|734.00|1|1|2|||WH|CHO|M||||ESQ||1
184.188.49|0|ML|3|240.84|446.00|1|1|2|||WH|VAG|B||||ESQ||1
184.188.50|0|ML|4|396.36|734.00|1|1|2|||WH|VAG|B||||ESQ||1
184.188.51|0|ML|3|240.84|446.00|1|1|2|||WH|VAG|M||||ESQ||1
184.188.52|0|ML|4|396.36|734.00|1|1|2|||WH|VAG|M||||ESQ||1
184.188.53|0|ML|3|240.84|446.00|1|1|2|||WH|AZE|B||||ESQ||1
184.188.54|0|ML|4|396.36|734.00|1|1|2|||WH|AZE|B||||ESQ||1
184.188.55|0|ML|3|240.84|446.00|1|1|2|||WH|AZE|M||||ESQ||1
184.188.56|0|ML|4|396.36|734.00|1|1|2|||WH|AZE|M||||ESQ||1
184.188.57|0|ML|3|240.84|446.00|1|1|2|||WH|AMA|B||||ESQ||1
184.188.58|0|ML|4|396.36|734.00|1|1|2|||WH|AMA|B||||ESQ||1
184.188.59|0|ML|3|240.84|446.00|1|1|2|||WH|AMA|M||||ESQ||1
184.188.60|0|ML|4|396.36|734.00|1|1|2|||WH|AMA|M||||ESQ||1
184.188.61|0|ML|3|240.84|446.00|1|1|2|||WH|AES|B||||ESQ||1
184.188.62|0|ML|4|396.36|734.00|1|1|2|||WH|AES|B||||ESQ||1
184.188.63|0|ML|3|240.84|446.00|1|1|2|||WH|AES|M||||ESQ||1
184.188.64|0|ML|4|396.36|734.00|1|1|2|||WH|AES|M||||ESQ||1
184.188.65|0|ML|3|240.84|446.00|1|1|2|||WH|PRA|B||||ESQ||1
184.188.66|0|ML|4|396.36|734.00|1|1|2|||WH|PRA|B||||ESQ||1
184.188.67|0|ML|3|240.84|446.00|1|1|2|||WH|PRA|M||||ESQ||1
184.188.68|0|ML|4|396.36|734.00|1|1|2|||WH|PRA|M||||ESQ||1
184.188.69|0|ML|3|240.84|446.00|1|1|2|||WH|ROS|B||||ESQ||1
184.188.70|0|ML|4|396.36|734.00|1|1|2|||WH|ROS|B||||ESQ||1
184.188.71|0|ML|3|240.84|446.00|1|1|2|||WH|ROS|M||||ESQ||1
184.188.72|0|ML|4|396.36|734.00|1|1|2|||WH|ROS|M||||ESQ||1
184.188.73|0|ML|3|240.84|446.00|1|1|2|||WH|VER|B||||ESQ||1
184.188.74|0|ML|4|396.36|734.00|1|1|2|||WH|VER|B||||ESQ||1
184.188.75|0|ML|3|240.84|446.00|1|1|2|||WH|VER|M||||ESQ||1
184.188.76|0|ML|4|396.36|734.00|1|1|2|||WH|VER|M||||ESQ||1
184.188.77|0|ML|3|240.84|446.00|1|1|2|||WH|OAK|||||ESQ||1
184.188.78|0|ML|4|396.36|734.00|1|1|2|||WH|OAK|||||ESQ||1
184.188.79|0|ML|3|240.84|446.00|1|1|2|||WH|TEA|||||ESQ||1
184.188.80|0|ML|4|396.36|734.00|1|1|2|||WH|TEA|||||ESQ||1
184.188.81|0|ML|3|240.84|446.00|1|1|2|||WH|JOP|||||ESQ||1
184.188.82|0|ML|4|396.36|734.00|1|1|2|||WH|JOP|||||ESQ||1
184.188.186|0|ML|3|240.84|446.00|1|1|2|||WH|DEN|||||ESQ||1
184.188.187|0|ML|4|396.36|734.00|1|1|2|||WH|DEN|||||ESQ||1
184.188.83|0|ML|3|240.84|446.00|1|1|2|||WH|BLK|||||ESQ||1
184.188.84|0|ML|4|396.36|734.00|1|1|2|||WH|BLK|||||ESQ||1
184.188.85|0|ML|3|240.84|446.00|1|1|2|||WH|ART|||||ESQ||1
184.188.86|0|ML|4|396.36|734.00|1|1|2|||WH|ART|||||ESQ||1
184.188.87|0|ML|3|240.84|446.00|1|1|2|||WH|LIN|||||ESQ||1
184.188.88|0|ML|4|396.36|734.00|1|1|2|||WH|LIN|||||ESQ||1
184.188.89|0|ML|3|240.84|446.00|1|1|2|||WH|HAL|||||ESQ||1
184.188.90|0|ML|4|396.36|734.00|1|1|2|||WH|HAL|||||ESQ||1
184.188.91|0|ML|3|262.44|486.00|1|1|2|||BCO|BCO|B||||ESQ||1
184.188.92|0|ML|4|417.96|774.00|1|1|2|||BCO|BCO|B||||ESQ||1
184.188.93|0|ML|3|262.44|486.00|1|1|2|||BCO|BCO|M||||ESQ||1
184.188.94|0|ML|4|417.96|774.00|1|1|2|||BCO|BCO|M||||ESQ||1
184.188.95|0|ML|3|262.44|486.00|1|1|2|||CCL|CCL|B||||ESQ||1
184.188.96|0|ML|4|417.96|774.00|1|1|2|||CCL|CCL|B||||ESQ||1
184.188.97|0|ML|3|262.44|486.00|1|1|2|||CCL|CCL|M||||ESQ||1
184.188.98|0|ML|4|417.96|774.00|1|1|2|||CCL|CCL|M||||ESQ||1
184.188.99|0|ML|3|262.44|486.00|1|1|2|||CME|CME|B||||ESQ||1
184.188.100|0|ML|4|417.96|774.00|1|1|2|||CME|CME|B||||ESQ||1
184.188.101|0|ML|3|262.44|486.00|1|1|2|||CME|CME|M||||ESQ||1
184.188.102|0|ML|4|417.96|774.00|1|1|2|||CME|CME|M||||ESQ||1
184.188.103|0|ML|3|262.44|486.00|1|1|2|||ANT|ANT|B||||ESQ||1
184.188.104|0|ML|4|417.96|774.00|1|1|2|||ANT|ANT|B||||ESQ||1
184.188.105|0|ML|3|262.44|486.00|1|1|2|||ANT|ANT|M||||ESQ||1
184.188.106|0|ML|4|417.96|774.00|1|1|2|||ANT|ANT|M||||ESQ||1
184.188.107|0|ML|3|262.44|486.00|1|1|2|||PTO|PTO|B||||ESQ||1
184.188.108|0|ML|4|417.96|774.00|1|1|2|||PTO|PTO|B||||ESQ||1
184.188.109|0|ML|3|262.44|486.00|1|1|2|||PTO|PTO|M||||ESQ||1
184.188.110|0|ML|4|417.96|774.00|1|1|2|||PTO|PTO|M||||ESQ||1
184.188.111|0|ML|3|262.44|486.00|1|1|2|||CRE|CRE|B||||ESQ||1
184.188.112|0|ML|4|417.96|774.00|1|1|2|||CRE|CRE|B||||ESQ||1
184.188.113|0|ML|3|262.44|486.00|1|1|2|||CRE|CRE|M||||ESQ||1
184.188.114|0|ML|4|417.96|774.00|1|1|2|||CRE|CRE|M||||ESQ||1
184.188.115|0|ML|3|262.44|486.00|1|1|2|||CAM|CAM|B||||ESQ||1
184.188.116|0|ML|4|417.96|774.00|1|1|2|||CAM|CAM|B||||ESQ||1
184.188.117|0|ML|3|262.44|486.00|1|1|2|||CAM|CAM|M||||ESQ||1
184.188.118|0|ML|4|417.96|774.00|1|1|2|||CAM|CAM|M||||ESQ||1
184.188.119|0|ML|3|262.44|486.00|1|1|2|||OUR|OUR|B||||ESQ||1
184.188.120|0|ML|4|417.96|774.00|1|1|2|||OUR|OUR|B||||ESQ||1
184.188.121|0|ML|3|262.44|486.00|1|1|2|||OUR|OUR|M||||ESQ||1
184.188.122|0|ML|4|417.96|774.00|1|1|2|||OUR|OUR|M||||ESQ||1
184.188.123|0|ML|3|262.44|486.00|1|1|2|||COB|COB|B||||ESQ||1
184.188.124|0|ML|4|417.96|774.00|1|1|2|||COB|COB|B||||ESQ||1
184.188.125|0|ML|3|262.44|486.00|1|1|2|||COB|COB|M||||ESQ||1
184.188.126|0|ML|4|417.96|774.00|1|1|2|||COB|COB|M||||ESQ||1
184.188.127|0|ML|3|262.44|486.00|1|1|2|||CHO|CHO|B||||ESQ||1
184.188.128|0|ML|4|417.96|774.00|1|1|2|||CHO|CHO|B||||ESQ||1
184.188.129|0|ML|3|262.44|486.00|1|1|2|||CHO|CHO|M||||ESQ||1
184.188.130|0|ML|4|417.96|774.00|1|1|2|||CHO|CHO|M||||ESQ||1
184.188.131|0|ML|3|262.44|486.00|1|1|2|||VAG|VAG|B||||ESQ||1
184.188.132|0|ML|4|417.96|774.00|1|1|2|||VAG|VAG|B||||ESQ||1
184.188.133|0|ML|3|262.44|486.00|1|1|2|||VAG|VAG|M||||ESQ||1
184.188.134|0|ML|4|417.96|774.00|1|1|2|||VAG|VAG|M||||ESQ||1
184.188.135|0|ML|3|262.44|486.00|1|1|2|||AZE|AZE|B||||ESQ||1
184.188.136|0|ML|4|417.96|774.00|1|1|2|||AZE|AZE|B||||ESQ||1
184.188.137|0|ML|3|262.44|486.00|1|1|2|||AZE|AZE|M||||ESQ||1
184.188.138|0|ML|4|417.96|774.00|1|1|2|||AZE|AZE|M||||ESQ||1
184.188.139|0|ML|3|262.44|486.00|1|1|2|||AMA|AMA|B||||ESQ||1
184.188.140|0|ML|4|417.96|774.00|1|1|2|||AMA|AMA|B||||ESQ||1
184.188.141|0|ML|3|262.44|486.00|1|1|2|||AMA|AMA|M||||ESQ||1
184.188.142|0|ML|4|417.96|774.00|1|1|2|||AMA|AMA|M||||ESQ||1
184.188.143|0|ML|3|262.44|486.00|1|1|2|||AES|AES|B||||ESQ||1
184.188.144|0|ML|4|417.96|774.00|1|1|2|||AES|AES|B||||ESQ||1
184.188.145|0|ML|3|262.44|486.00|1|1|2|||AES|AES|M||||ESQ||1
184.188.146|0|ML|4|417.96|774.00|1|1|2|||AES|AES|M||||ESQ||1
184.188.147|0|ML|3|262.44|486.00|1|1|2|||PRA|PRA|B||||ESQ||1
184.188.148|0|ML|4|417.96|774.00|1|1|2|||PRA|PRA|B||||ESQ||1
184.188.149|0|ML|3|262.44|486.00|1|1|2|||PRA|PRA|M||||ESQ||1
184.188.150|0|ML|4|417.96|774.00|1|1|2|||PRA|PRA|M||||ESQ||1
184.188.151|0|ML|3|262.44|486.00|1|1|2|||ROS|ROS|B||||ESQ||1
184.188.152|0|ML|4|417.96|774.00|1|1|2|||ROS|ROS|B||||ESQ||1
184.188.153|0|ML|3|262.44|486.00|1|1|2|||ROS|ROS|M||||ESQ||1
184.188.154|0|ML|4|417.96|774.00|1|1|2|||ROS|ROS|M||||ESQ||1
184.188.155|0|ML|3|262.44|486.00|1|1|2|||VER|VER|B||||ESQ||1
184.188.156|0|ML|4|417.96|774.00|1|1|2|||VER|VER|B||||ESQ||1
184.188.157|0|ML|3|262.44|486.00|1|1|2|||VER|VER|M||||ESQ||1
184.188.158|0|ML|4|417.96|774.00|1|1|2|||VER|VER|M||||ESQ||1
184.188.159|0|ML|3|262.44|486.00|1|1|2|||OAK|OAK|||||ESQ||1
184.188.160|0|ML|4|417.96|774.00|1|1|2|||OAK|OAK|||||ESQ||1
184.188.161|0|ML|3|262.44|486.00|1|1|2|||TEA|TEA|||||ESQ||1
184.188.162|0|ML|4|417.96|774.00|1|1|2|||TEA|TEA|||||ESQ||1
184.188.163|0|ML|3|262.44|486.00|1|1|2|||JOP|JOP|||||ESQ||1
184.188.164|0|ML|4|417.96|774.00|1|1|2|||JOP|JOP|||||ESQ||1
184.188.165|0|ML|3|262.44|486.00|1|1|2|||AZB|AZB|||||ESQ||1
184.188.166|0|ML|4|417.96|774.00|1|1|2|||AZB|AZB|||||ESQ||1
184.188.167|0|ML|3|262.44|486.00|1|1|2|||DEN|DEN|||||ESQ||1
184.188.168|0|ML|4|417.96|774.00|1|1|2|||DEN|DEN|||||ESQ||1
184.188.169|0|ML|3|262.44|486.00|1|1|2|||BLK|BLK|||||ESQ||1
184.188.170|0|ML|4|417.96|774.00|1|1|2|||BLK|BLK|||||ESQ||1
184.188.171|0|ML|3|262.44|486.00|1|1|2|||ART|ART|||||ESQ||1
184.188.172|0|ML|4|417.96|774.00|1|1|2|||ART|ART|||||ESQ||1
184.188.173|0|ML|3|262.44|486.00|1|1|2|||LIN|LIN|||||ESQ||1
184.188.174|0|ML|4|417.96|774.00|1|1|2|||LIN|LIN|||||ESQ||1
184.188.175|0|ML|3|262.44|486.00|1|1|2|||HAL|HAL|||||ESQ||1
184.188.176|0|ML|4|417.96|774.00|1|1|2|||HAL|HAL|||||ESQ||1
189.190.3|0|ML|3|216.00|400.00|1|1|2|||WH|WH|||||DIR||2
189.190.4|0|ML|4|332.10|615.00|1|1|2|||WH|WH|||||DIR||2
189.190.5|0|ML|3|216.00|400.00|1|1|2|||WH|AZB|||||DIR||2
189.190.6|0|ML|4|332.10|615.00|1|1|2|||WH|AZB|||||DIR||2
189.190.9|0|ML|3|243.00|450.00|1|1|2|||WH|BCO|B||||DIR||2
189.190.10|0|ML|4|359.10|665.00|1|1|2|||WH|BCO|B||||DIR||2
189.190.11|0|ML|3|243.00|450.00|1|1|2|||WH|BCO|M||||DIR||2
189.190.12|0|ML|4|359.10|665.00|1|1|2|||WH|BCO|M||||DIR||2
189.190.13|0|ML|3|243.00|450.00|1|1|2|||WH|CCL|B||||DIR||2
189.190.14|0|ML|4|359.10|665.00|1|1|2|||WH|CCL|B||||DIR||2
189.190.15|0|ML|3|243.00|450.00|1|1|2|||WH|CCL|M||||DIR||2
189.190.16|0|ML|4|359.10|665.00|1|1|2|||WH|CCL|M||||DIR||2
189.190.17|0|ML|3|243.00|450.00|1|1|2|||WH|CME|B||||DIR||2
189.190.18|0|ML|4|359.10|665.00|1|1|2|||WH|CME|B||||DIR||2
189.190.19|0|ML|3|243.00|450.00|1|1|2|||WH|CME|M||||DIR||2
189.190.20|0|ML|4|359.10|665.00|1|1|2|||WH|CME|M||||DIR||2
189.190.21|0|ML|3|243.00|450.00|1|1|2|||WH|ANT|B||||DIR||2
189.190.22|0|ML|4|359.10|665.00|1|1|2|||WH|ANT|B||||DIR||2
189.190.23|0|ML|3|243.00|450.00|1|1|2|||WH|ANT|M||||DIR||2
189.190.24|0|ML|4|359.10|665.00|1|1|2|||WH|ANT|M||||DIR||2
189.190.25|0|ML|3|243.00|450.00|1|1|2|||WH|PTO|B||||DIR||2
189.190.26|0|ML|4|359.10|665.00|1|1|2|||WH|PTO|B||||DIR||2
189.190.27|0|ML|3|243.00|450.00|1|1|2|||WH|PTO|M||||DIR||2
189.190.28|0|ML|4|359.10|665.00|1|1|2|||WH|PTO|M||||DIR||2
189.190.29|0|ML|3|243.00|450.00|1|1|2|||WH|CRE|B||||DIR||2
189.190.30|0|ML|4|359.10|665.00|1|1|2|||WH|CRE|B||||DIR||2
189.190.31|0|ML|3|243.00|450.00|1|1|2|||WH|CRE|M||||DIR||2
189.190.32|0|ML|4|359.10|665.00|1|1|2|||WH|CRE|M||||DIR||2
189.190.33|0|ML|3|243.00|450.00|1|1|2|||WH|CAM|B||||DIR||2
189.190.34|0|ML|4|359.10|665.00|1|1|2|||WH|CAM|B||||DIR||2
189.190.35|0|ML|3|243.00|450.00|1|1|2|||WH|CAM|M||||DIR||2
189.190.36|0|ML|4|359.10|665.00|1|1|2|||WH|CAM|M||||DIR||2
189.190.37|0|ML|3|243.00|450.00|1|1|2|||WH|OUR|B||||DIR||2
189.190.38|0|ML|4|359.10|665.00|1|1|2|||WH|OUR|B||||DIR||2
189.190.39|0|ML|3|243.00|450.00|1|1|2|||WH|OUR|M||||DIR||2
189.190.40|0|ML|4|359.10|665.00|1|1|2|||WH|OUR|M||||DIR||2
189.190.41|0|ML|3|243.00|450.00|1|1|2|||WH|COB|B||||DIR||2
189.190.42|0|ML|4|359.10|665.00|1|1|2|||WH|COB|B||||DIR||2
189.190.43|0|ML|3|243.00|450.00|1|1|2|||WH|COB|M||||DIR||2
189.190.44|0|ML|4|359.10|665.00|1|1|2|||WH|COB|M||||DIR||2
189.190.45|0|ML|3|243.00|450.00|1|1|2|||WH|CHO|B||||DIR||2
189.190.46|0|ML|4|359.10|665.00|1|1|2|||WH|CHO|B||||DIR||2
189.190.47|0|ML|3|243.00|450.00|1|1|2|||WH|CHO|M||||DIR||2
189.190.48|0|ML|4|359.10|665.00|1|1|2|||WH|CHO|M||||DIR||2
189.190.49|0|ML|3|243.00|450.00|1|1|2|||WH|VAG|B||||DIR||2
189.190.50|0|ML|4|359.10|665.00|1|1|2|||WH|VAG|B||||DIR||2
189.190.51|0|ML|3|243.00|450.00|1|1|2|||WH|VAG|M||||DIR||2
189.190.52|0|ML|4|359.10|665.00|1|1|2|||WH|VAG|M||||DIR||2
189.190.53|0|ML|3|243.00|450.00|1|1|2|||WH|AZE|B||||DIR||2
189.190.54|0|ML|4|359.10|665.00|1|1|2|||WH|AZE|B||||DIR||2
189.190.55|0|ML|3|243.00|450.00|1|1|2|||WH|AZE|M||||DIR||2
189.190.56|0|ML|4|359.10|665.00|1|1|2|||WH|AZE|M||||DIR||2
189.190.57|0|ML|3|243.00|450.00|1|1|2|||WH|AMA|B||||DIR||2
189.190.58|0|ML|4|359.10|665.00|1|1|2|||WH|AMA|B||||DIR||2
189.190.59|0|ML|3|243.00|450.00|1|1|2|||WH|AMA|M||||DIR||2
189.190.60|0|ML|4|359.10|665.00|1|1|2|||WH|AMA|M||||DIR||2
189.190.61|0|ML|3|243.00|450.00|1|1|2|||WH|AES|B||||DIR||2
189.190.62|0|ML|4|359.10|665.00|1|1|2|||WH|AES|B||||DIR||2
189.190.63|0|ML|3|243.00|450.00|1|1|2|||WH|AES|M||||DIR||2
189.190.64|0|ML|4|359.10|665.00|1|1|2|||WH|AES|M||||DIR||2
189.190.65|0|ML|3|243.00|450.00|1|1|2|||WH|PRA|B||||DIR||2
189.190.66|0|ML|4|359.10|665.00|1|1|2|||WH|PRA|B||||DIR||2
189.190.67|0|ML|3|243.00|450.00|1|1|2|||WH|PRA|M||||DIR||2
189.190.68|0|ML|4|359.10|665.00|1|1|2|||WH|PRA|M||||DIR||2
189.190.69|0|ML|3|243.00|450.00|1|1|2|||WH|ROS|B||||DIR||2
189.190.70|0|ML|4|359.10|665.00|1|1|2|||WH|ROS|B||||DIR||2
189.190.71|0|ML|3|243.00|450.00|1|1|2|||WH|ROS|M||||DIR||2
189.190.72|0|ML|4|359.10|665.00|1|1|2|||WH|ROS|M||||DIR||2
189.190.73|0|ML|3|243.00|450.00|1|1|2|||WH|VER|B||||DIR||2
189.190.74|0|ML|4|359.10|665.00|1|1|2|||WH|VER|B||||DIR||2
189.190.75|0|ML|3|243.00|450.00|1|1|2|||WH|VER|M||||DIR||2
189.190.76|0|ML|4|359.10|665.00|1|1|2|||WH|VER|M||||DIR||2
189.190.77|0|ML|3|243.00|450.00|1|1|2|||WH|OAK|||||DIR||2
189.190.78|0|ML|4|359.10|665.00|1|1|2|||WH|OAK|||||DIR||2
189.190.79|0|ML|3|243.00|450.00|1|1|2|||WH|TEA|||||DIR||2
189.190.80|0|ML|4|359.10|665.00|1|1|2|||WH|TEA|||||DIR||2
189.190.81|0|ML|3|243.00|450.00|1|1|2|||WH|JOP|||||DIR||2
189.190.82|0|ML|4|359.10|665.00|1|1|2|||WH|JOP|||||DIR||2
189.190.186|0|ML|3|243.00|450.00|1|1|2|||WH|DEN|||||DIR||2
189.190.187|0|ML|4|359.10|665.00|1|1|2|||WH|DEN|||||DIR||2
189.190.83|0|ML|3|243.00|450.00|1|1|2|||WH|BLK|||||DIR||2
189.190.84|0|ML|4|359.10|665.00|1|1|2|||WH|BLK|||||DIR||2
189.190.85|0|ML|3|243.00|450.00|1|1|2|||WH|ART|||||DIR||2
189.190.86|0|ML|4|359.10|665.00|1|1|2|||WH|ART|||||DIR||2
189.190.87|0|ML|3|243.00|450.00|1|1|2|||WH|LIN|||||DIR||2
189.190.88|0|ML|4|359.10|665.00|1|1|2|||WH|LIN|||||DIR||2
189.190.89|0|ML|3|243.00|450.00|1|1|2|||WH|HAL|||||DIR||2
189.190.90|0|ML|4|359.10|665.00|1|1|2|||WH|HAL|||||DIR||2
189.190.91|0|ML|3|264.60|490.00|1|1|2|||BCO|BCO|B||||DIR||2
189.190.92|0|ML|4|380.70|705.00|1|1|2|||BCO|BCO|B||||DIR||2
189.190.93|0|ML|3|264.60|490.00|1|1|2|||BCO|BCO|M||||DIR||2
189.190.94|0|ML|4|380.70|705.00|1|1|2|||BCO|BCO|M||||DIR||2
189.190.95|0|ML|3|264.60|490.00|1|1|2|||CCL|CCL|B||||DIR||2
189.190.96|0|ML|4|380.70|705.00|1|1|2|||CCL|CCL|B||||DIR||2
189.190.97|0|ML|3|264.60|490.00|1|1|2|||CCL|CCL|M||||DIR||2
189.190.98|0|ML|4|380.70|705.00|1|1|2|||CCL|CCL|M||||DIR||2
189.190.99|0|ML|3|264.60|490.00|1|1|2|||CME|CME|B||||DIR||2
189.190.100|0|ML|4|380.70|705.00|1|1|2|||CME|CME|B||||DIR||2
189.190.101|0|ML|3|264.60|490.00|1|1|2|||CME|CME|M||||DIR||2
189.190.102|0|ML|4|380.70|705.00|1|1|2|||CME|CME|M||||DIR||2
189.190.103|0|ML|3|264.60|490.00|1|1|2|||ANT|ANT|B||||DIR||2
189.190.104|0|ML|4|380.70|705.00|1|1|2|||ANT|ANT|B||||DIR||2
189.190.105|0|ML|3|264.60|490.00|1|1|2|||ANT|ANT|M||||DIR||2
189.190.106|0|ML|4|380.70|705.00|1|1|2|||ANT|ANT|M||||DIR||2
189.190.107|0|ML|3|264.60|490.00|1|1|2|||PTO|PTO|B||||DIR||2
189.190.108|0|ML|4|380.70|705.00|1|1|2|||PTO|PTO|B||||DIR||2
189.190.109|0|ML|3|264.60|490.00|1|1|2|||PTO|PTO|M||||DIR||2
189.190.110|0|ML|4|380.70|705.00|1|1|2|||PTO|PTO|M||||DIR||2
189.190.111|0|ML|3|264.60|490.00|1|1|2|||CRE|CRE|B||||DIR||2
189.190.112|0|ML|4|380.70|705.00|1|1|2|||CRE|CRE|B||||DIR||2
189.190.113|0|ML|3|264.60|490.00|1|1|2|||CRE|CRE|M||||DIR||2
189.190.114|0|ML|4|380.70|705.00|1|1|2|||CRE|CRE|M||||DIR||2
189.190.115|0|ML|3|264.60|490.00|1|1|2|||CAM|CAM|B||||DIR||2
189.190.116|0|ML|4|380.70|705.00|1|1|2|||CAM|CAM|B||||DIR||2
189.190.117|0|ML|3|264.60|490.00|1|1|2|||CAM|CAM|M||||DIR||2
189.190.118|0|ML|4|380.70|705.00|1|1|2|||CAM|CAM|M||||DIR||2
189.190.119|0|ML|3|264.60|490.00|1|1|2|||OUR|OUR|B||||DIR||2
189.190.120|0|ML|4|380.70|705.00|1|1|2|||OUR|OUR|B||||DIR||2
189.190.121|0|ML|3|264.60|490.00|1|1|2|||OUR|OUR|M||||DIR||2
189.190.122|0|ML|4|380.70|705.00|1|1|2|||OUR|OUR|M||||DIR||2
189.190.123|0|ML|3|264.60|490.00|1|1|2|||COB|COB|B||||DIR||2
189.190.124|0|ML|4|380.70|705.00|1|1|2|||COB|COB|B||||DIR||2
189.190.125|0|ML|3|264.60|490.00|1|1|2|||COB|COB|M||||DIR||2
189.190.126|0|ML|4|380.70|705.00|1|1|2|||COB|COB|M||||DIR||2
189.190.127|0|ML|3|264.60|490.00|1|1|2|||CHO|CHO|B||||DIR||2
189.190.128|0|ML|4|380.70|705.00|1|1|2|||CHO|CHO|B||||DIR||2
189.190.129|0|ML|3|264.60|490.00|1|1|2|||CHO|CHO|M||||DIR||2
189.190.130|0|ML|4|380.70|705.00|1|1|2|||CHO|CHO|M||||DIR||2
189.190.131|0|ML|3|264.60|490.00|1|1|2|||VAG|VAG|B||||DIR||2
189.190.132|0|ML|4|380.70|705.00|1|1|2|||VAG|VAG|B||||DIR||2
189.190.133|0|ML|3|264.60|490.00|1|1|2|||VAG|VAG|M||||DIR||2
189.190.134|0|ML|4|380.70|705.00|1|1|2|||VAG|VAG|M||||DIR||2
189.190.135|0|ML|3|264.60|490.00|1|1|2|||AZE|AZE|B||||DIR||2
189.190.136|0|ML|4|380.70|705.00|1|1|2|||AZE|AZE|B||||DIR||2
189.190.137|0|ML|3|264.60|490.00|1|1|2|||AZE|AZE|M||||DIR||2
189.190.138|0|ML|4|380.70|705.00|1|1|2|||AZE|AZE|M||||DIR||2
189.190.139|0|ML|3|264.60|490.00|1|1|2|||AMA|AMA|B||||DIR||2
189.190.140|0|ML|4|380.70|705.00|1|1|2|||AMA|AMA|B||||DIR||2
189.190.141|0|ML|3|264.60|490.00|1|1|2|||AMA|AMA|M||||DIR||2
189.190.142|0|ML|4|380.70|705.00|1|1|2|||AMA|AMA|M||||DIR||2
189.190.143|0|ML|3|264.60|490.00|1|1|2|||AES|AES|B||||DIR||2
189.190.144|0|ML|4|380.70|705.00|1|1|2|||AES|AES|B||||DIR||2
189.190.145|0|ML|3|264.60|490.00|1|1|2|||AES|AES|M||||DIR||2
189.190.146|0|ML|4|380.70|705.00|1|1|2|||AES|AES|M||||DIR||2
189.190.147|0|ML|3|264.60|490.00|1|1|2|||PRA|PRA|B||||DIR||2
189.190.148|0|ML|4|380.70|705.00|1|1|2|||PRA|PRA|B||||DIR||2
189.190.149|0|ML|3|264.60|490.00|1|1|2|||PRA|PRA|M||||DIR||2
189.190.150|0|ML|4|380.70|705.00|1|1|2|||PRA|PRA|M||||DIR||2
189.190.151|0|ML|3|264.60|490.00|1|1|2|||ROS|ROS|B||||DIR||2
189.190.152|0|ML|4|380.70|705.00|1|1|2|||ROS|ROS|B||||DIR||2
189.190.153|0|ML|3|264.60|490.00|1|1|2|||ROS|ROS|M||||DIR||2
189.190.154|0|ML|4|380.70|705.00|1|1|2|||ROS|ROS|M||||DIR||2
189.190.155|0|ML|3|264.60|490.00|1|1|2|||VER|VER|B||||DIR||2
189.190.156|0|ML|4|380.70|705.00|1|1|2|||VER|VER|B||||DIR||2
189.190.157|0|ML|3|264.60|490.00|1|1|2|||VER|VER|M||||DIR||2
189.190.158|0|ML|4|380.70|705.00|1|1|2|||VER|VER|M||||DIR||2
189.190.159|0|ML|3|264.60|490.00|1|1|2|||OAK|OAK|||||DIR||2
189.190.160|0|ML|4|380.70|705.00|1|1|2|||OAK|OAK|||||DIR||2
189.190.161|0|ML|3|264.60|490.00|1|1|2|||TEA|TEA|||||DIR||2
189.190.162|0|ML|4|380.70|705.00|1|1|2|||TEA|TEA|||||DIR||2
189.190.163|0|ML|3|264.60|490.00|1|1|2|||JOP|JOP|||||DIR||2
189.190.164|0|ML|4|380.70|705.00|1|1|2|||JOP|JOP|||||DIR||2
189.190.165|0|ML|3|264.60|490.00|1|1|2|||AZB|AZB|||||DIR||2
189.190.166|0|ML|4|380.70|705.00|1|1|2|||AZB|AZB|||||DIR||2
189.190.167|0|ML|3|264.60|490.00|1|1|2|||DEN|DEN|||||DIR||2
189.190.168|0|ML|4|380.70|705.00|1|1|2|||DEN|DEN|||||DIR||2
189.190.169|0|ML|3|264.60|490.00|1|1|2|||BLK|BLK|||||DIR||2
189.190.170|0|ML|4|380.70|705.00|1|1|2|||BLK|BLK|||||DIR||2
189.190.171|0|ML|3|264.60|490.00|1|1|2|||ART|ART|||||DIR||2
189.190.172|0|ML|4|380.70|705.00|1|1|2|||ART|ART|||||DIR||2
189.190.173|0|ML|3|264.60|490.00|1|1|2|||LIN|LIN|||||DIR||2
189.190.174|0|ML|4|380.70|705.00|1|1|2|||LIN|LIN|||||DIR||2
189.190.175|0|ML|3|264.60|490.00|1|1|2|||HAL|HAL|||||DIR||2
189.190.176|0|ML|4|380.70|705.00|1|1|2|||HAL|HAL|||||DIR||2
189.191.3|0|ML|3|259.20|480.00|1|1|2|||WH|WH|||||ESQ||2
189.191.4|0|ML|4|398.52|738.00|1|1|2|||WH|WH|||||ESQ||2
189.191.5|0|ML|3|259.20|480.00|1|1|2|||WH|AZB|||||ESQ||2
189.191.6|0|ML|4|398.52|738.00|1|1|2|||WH|AZB|||||ESQ||2
189.191.9|0|ML|3|286.20|530.00|1|1|2|||WH|BCO|B||||ESQ||2
189.191.10|0|ML|4|425.52|788.00|1|1|2|||WH|BCO|B||||ESQ||2
189.191.11|0|ML|3|286.20|530.00|1|1|2|||WH|BCO|M||||ESQ||2
189.191.12|0|ML|4|425.52|788.00|1|1|2|||WH|BCO|M||||ESQ||2
189.191.13|0|ML|3|286.20|530.00|1|1|2|||WH|CCL|B||||ESQ||2
189.191.14|0|ML|4|425.52|788.00|1|1|2|||WH|CCL|B||||ESQ||2
189.191.15|0|ML|3|286.20|530.00|1|1|2|||WH|CCL|M||||ESQ||2
189.191.16|0|ML|4|425.52|788.00|1|1|2|||WH|CCL|M||||ESQ||2
189.191.17|0|ML|3|286.20|530.00|1|1|2|||WH|CME|B||||ESQ||2
189.191.18|0|ML|4|425.52|788.00|1|1|2|||WH|CME|B||||ESQ||2
189.191.19|0|ML|3|286.20|530.00|1|1|2|||WH|CME|M||||ESQ||2
189.191.20|0|ML|4|425.52|788.00|1|1|2|||WH|CME|M||||ESQ||2
189.191.21|0|ML|3|286.20|530.00|1|1|2|||WH|ANT|B||||ESQ||2
189.191.22|0|ML|4|425.52|788.00|1|1|2|||WH|ANT|B||||ESQ||2
189.191.23|0|ML|3|286.20|530.00|1|1|2|||WH|ANT|M||||ESQ||2
189.191.24|0|ML|4|425.52|788.00|1|1|2|||WH|ANT|M||||ESQ||2
189.191.25|0|ML|3|286.20|530.00|1|1|2|||WH|PTO|B||||ESQ||2
189.191.26|0|ML|4|425.52|788.00|1|1|2|||WH|PTO|B||||ESQ||2
189.191.27|0|ML|3|286.20|530.00|1|1|2|||WH|PTO|M||||ESQ||2
189.191.28|0|ML|4|425.52|788.00|1|1|2|||WH|PTO|M||||ESQ||2
189.191.29|0|ML|3|286.20|530.00|1|1|2|||WH|CRE|B||||ESQ||2
189.191.30|0|ML|4|425.52|788.00|1|1|2|||WH|CRE|B||||ESQ||2
189.191.31|0|ML|3|286.20|530.00|1|1|2|||WH|CRE|M||||ESQ||2
189.191.32|0|ML|4|425.52|788.00|1|1|2|||WH|CRE|M||||ESQ||2
189.191.33|0|ML|3|286.20|530.00|1|1|2|||WH|CAM|B||||ESQ||2
189.191.34|0|ML|4|425.52|788.00|1|1|2|||WH|CAM|B||||ESQ||2
189.191.35|0|ML|3|286.20|530.00|1|1|2|||WH|CAM|M||||ESQ||2
189.191.36|0|ML|4|425.52|788.00|1|1|2|||WH|CAM|M||||ESQ||2
189.191.37|0|ML|3|286.20|530.00|1|1|2|||WH|OUR|B||||ESQ||2
189.191.38|0|ML|4|425.52|788.00|1|1|2|||WH|OUR|B||||ESQ||2
189.191.39|0|ML|3|286.20|530.00|1|1|2|||WH|OUR|M||||ESQ||2
189.191.40|0|ML|4|425.52|788.00|1|1|2|||WH|OUR|M||||ESQ||2
189.191.41|0|ML|3|286.20|530.00|1|1|2|||WH|COB|B||||ESQ||2
189.191.42|0|ML|4|425.52|788.00|1|1|2|||WH|COB|B||||ESQ||2
189.191.43|0|ML|3|286.20|530.00|1|1|2|||WH|COB|M||||ESQ||2
189.191.44|0|ML|4|425.52|788.00|1|1|2|||WH|COB|M||||ESQ||2
189.191.45|0|ML|3|286.20|530.00|1|1|2|||WH|CHO|B||||ESQ||2
189.191.46|0|ML|4|425.52|788.00|1|1|2|||WH|CHO|B||||ESQ||2
189.191.47|0|ML|3|286.20|530.00|1|1|2|||WH|CHO|M||||ESQ||2
189.191.48|0|ML|4|425.52|788.00|1|1|2|||WH|CHO|M||||ESQ||2
189.191.49|0|ML|3|286.20|530.00|1|1|2|||WH|VAG|B||||ESQ||2
189.191.50|0|ML|4|425.52|788.00|1|1|2|||WH|VAG|B||||ESQ||2
189.191.51|0|ML|3|286.20|530.00|1|1|2|||WH|VAG|M||||ESQ||2
189.191.52|0|ML|4|425.52|788.00|1|1|2|||WH|VAG|M||||ESQ||2
189.191.53|0|ML|3|286.20|530.00|1|1|2|||WH|AZE|B||||ESQ||2
189.191.54|0|ML|4|425.52|788.00|1|1|2|||WH|AZE|B||||ESQ||2
189.191.55|0|ML|3|286.20|530.00|1|1|2|||WH|AZE|M||||ESQ||2
189.191.56|0|ML|4|425.52|788.00|1|1|2|||WH|AZE|M||||ESQ||2
189.191.57|0|ML|3|286.20|530.00|1|1|2|||WH|AMA|B||||ESQ||2
189.191.58|0|ML|4|425.52|788.00|1|1|2|||WH|AMA|B||||ESQ||2
189.191.59|0|ML|3|286.20|530.00|1|1|2|||WH|AMA|M||||ESQ||2
189.191.60|0|ML|4|425.52|788.00|1|1|2|||WH|AMA|M||||ESQ||2
189.191.61|0|ML|3|286.20|530.00|1|1|2|||WH|AES|B||||ESQ||2
189.191.62|0|ML|4|425.52|788.00|1|1|2|||WH|AES|B||||ESQ||2
189.191.63|0|ML|3|286.20|530.00|1|1|2|||WH|AES|M||||ESQ||2
189.191.64|0|ML|4|425.52|788.00|1|1|2|||WH|AES|M||||ESQ||2
189.191.65|0|ML|3|286.20|530.00|1|1|2|||WH|PRA|B||||ESQ||2
189.191.66|0|ML|4|425.52|788.00|1|1|2|||WH|PRA|B||||ESQ||2
189.191.67|0|ML|3|286.20|530.00|1|1|2|||WH|PRA|M||||ESQ||2
189.191.68|0|ML|4|425.52|788.00|1|1|2|||WH|PRA|M||||ESQ||2
189.191.69|0|ML|3|286.20|530.00|1|1|2|||WH|ROS|B||||ESQ||2
189.191.70|0|ML|4|425.52|788.00|1|1|2|||WH|ROS|B||||ESQ||2
189.191.71|0|ML|3|286.20|530.00|1|1|2|||WH|ROS|M||||ESQ||2
189.191.72|0|ML|4|425.52|788.00|1|1|2|||WH|ROS|M||||ESQ||2
189.191.73|0|ML|3|286.20|530.00|1|1|2|||WH|VER|B||||ESQ||2
189.191.74|0|ML|4|425.52|788.00|1|1|2|||WH|VER|B||||ESQ||2
189.191.75|0|ML|3|286.20|530.00|1|1|2|||WH|VER|M||||ESQ||2
189.191.76|0|ML|4|425.52|788.00|1|1|2|||WH|VER|M||||ESQ||2
189.191.77|0|ML|3|286.20|530.00|1|1|2|||WH|OAK|||||ESQ||2
189.191.78|0|ML|4|425.52|788.00|1|1|2|||WH|OAK|||||ESQ||2
189.191.79|0|ML|3|286.20|530.00|1|1|2|||WH|TEA|||||ESQ||2
189.191.80|0|ML|4|425.52|788.00|1|1|2|||WH|TEA|||||ESQ||2
189.191.81|0|ML|3|286.20|530.00|1|1|2|||WH|JOP|||||ESQ||2
189.191.82|0|ML|4|425.52|788.00|1|1|2|||WH|JOP|||||ESQ||2
189.191.186|0|ML|3|286.20|530.00|1|1|2|||WH|DEN|||||ESQ||2
189.191.187|0|ML|4|425.52|788.00|1|1|2|||WH|DEN|||||ESQ||2
189.191.83|0|ML|3|286.20|530.00|1|1|2|||WH|BLK|||||ESQ||2
189.191.84|0|ML|4|425.52|788.00|1|1|2|||WH|BLK|||||ESQ||2
189.191.85|0|ML|3|286.20|530.00|1|1|2|||WH|ART|||||ESQ||2
189.191.86|0|ML|4|425.52|788.00|1|1|2|||WH|ART|||||ESQ||2
189.191.87|0|ML|3|286.20|530.00|1|1|2|||WH|LIN|||||ESQ||2
189.191.88|0|ML|4|425.52|788.00|1|1|2|||WH|LIN|||||ESQ||2
189.191.89|0|ML|3|286.20|530.00|1|1|2|||WH|HAL|||||ESQ||2
189.191.90|0|ML|4|425.52|788.00|1|1|2|||WH|HAL|||||ESQ||2
189.191.91|0|ML|3|307.80|570.00|1|1|2|||BCO|BCO|B||||ESQ||2
189.191.92|0|ML|4|447.12|828.00|1|1|2|||BCO|BCO|B||||ESQ||2
189.191.93|0|ML|3|307.80|570.00|1|1|2|||BCO|BCO|M||||ESQ||2
189.191.94|0|ML|4|447.12|828.00|1|1|2|||BCO|BCO|M||||ESQ||2
189.191.95|0|ML|3|307.80|570.00|1|1|2|||CCL|CCL|B||||ESQ||2
189.191.96|0|ML|4|447.12|828.00|1|1|2|||CCL|CCL|B||||ESQ||2
189.191.97|0|ML|3|307.80|570.00|1|1|2|||CCL|CCL|M||||ESQ||2
189.191.98|0|ML|4|447.12|828.00|1|1|2|||CCL|CCL|M||||ESQ||2
189.191.99|0|ML|3|307.80|570.00|1|1|2|||CME|CME|B||||ESQ||2
189.191.100|0|ML|4|447.12|828.00|1|1|2|||CME|CME|B||||ESQ||2
189.191.101|0|ML|3|307.80|570.00|1|1|2|||CME|CME|M||||ESQ||2
189.191.102|0|ML|4|447.12|828.00|1|1|2|||CME|CME|M||||ESQ||2
189.191.103|0|ML|3|307.80|570.00|1|1|2|||ANT|ANT|B||||ESQ||2
189.191.104|0|ML|4|447.12|828.00|1|1|2|||ANT|ANT|B||||ESQ||2
189.191.105|0|ML|3|307.80|570.00|1|1|2|||ANT|ANT|M||||ESQ||2
189.191.106|0|ML|4|447.12|828.00|1|1|2|||ANT|ANT|M||||ESQ||2
189.191.107|0|ML|3|307.80|570.00|1|1|2|||PTO|PTO|B||||ESQ||2
189.191.108|0|ML|4|447.12|828.00|1|1|2|||PTO|PTO|B||||ESQ||2
189.191.109|0|ML|3|307.80|570.00|1|1|2|||PTO|PTO|M||||ESQ||2
189.191.110|0|ML|4|447.12|828.00|1|1|2|||PTO|PTO|M||||ESQ||2
189.191.111|0|ML|3|307.80|570.00|1|1|2|||CRE|CRE|B||||ESQ||2
189.191.112|0|ML|4|447.12|828.00|1|1|2|||CRE|CRE|B||||ESQ||2
189.191.113|0|ML|3|307.80|570.00|1|1|2|||CRE|CRE|M||||ESQ||2
189.191.114|0|ML|4|447.12|828.00|1|1|2|||CRE|CRE|M||||ESQ||2
189.191.115|0|ML|3|307.80|570.00|1|1|2|||CAM|CAM|B||||ESQ||2
189.191.116|0|ML|4|447.12|828.00|1|1|2|||CAM|CAM|B||||ESQ||2
189.191.117|0|ML|3|307.80|570.00|1|1|2|||CAM|CAM|M||||ESQ||2
189.191.118|0|ML|4|447.12|828.00|1|1|2|||CAM|CAM|M||||ESQ||2
189.191.119|0|ML|3|307.80|570.00|1|1|2|||OUR|OUR|B||||ESQ||2
189.191.120|0|ML|4|447.12|828.00|1|1|2|||OUR|OUR|B||||ESQ||2
189.191.121|0|ML|3|307.80|570.00|1|1|2|||OUR|OUR|M||||ESQ||2
189.191.122|0|ML|4|447.12|828.00|1|1|2|||OUR|OUR|M||||ESQ||2
189.191.123|0|ML|3|307.80|570.00|1|1|2|||COB|COB|B||||ESQ||2
189.191.124|0|ML|4|447.12|828.00|1|1|2|||COB|COB|B||||ESQ||2
189.191.125|0|ML|3|307.80|570.00|1|1|2|||COB|COB|M||||ESQ||2
189.191.126|0|ML|4|447.12|828.00|1|1|2|||COB|COB|M||||ESQ||2
189.191.127|0|ML|3|307.80|570.00|1|1|2|||CHO|CHO|B||||ESQ||2
189.191.128|0|ML|4|447.12|828.00|1|1|2|||CHO|CHO|B||||ESQ||2
189.191.129|0|ML|3|307.80|570.00|1|1|2|||CHO|CHO|M||||ESQ||2
189.191.130|0|ML|4|447.12|828.00|1|1|2|||CHO|CHO|M||||ESQ||2
189.191.131|0|ML|3|307.80|570.00|1|1|2|||VAG|VAG|B||||ESQ||2
189.191.132|0|ML|4|447.12|828.00|1|1|2|||VAG|VAG|B||||ESQ||2
189.191.133|0|ML|3|307.80|570.00|1|1|2|||VAG|VAG|M||||ESQ||2
189.191.134|0|ML|4|447.12|828.00|1|1|2|||VAG|VAG|M||||ESQ||2
189.191.135|0|ML|3|307.80|570.00|1|1|2|||AZE|AZE|B||||ESQ||2
189.191.136|0|ML|4|447.12|828.00|1|1|2|||AZE|AZE|B||||ESQ||2
189.191.137|0|ML|3|307.80|570.00|1|1|2|||AZE|AZE|M||||ESQ||2
189.191.138|0|ML|4|447.12|828.00|1|1|2|||AZE|AZE|M||||ESQ||2
189.191.139|0|ML|3|307.80|570.00|1|1|2|||AMA|AMA|B||||ESQ||2
189.191.140|0|ML|4|447.12|828.00|1|1|2|||AMA|AMA|B||||ESQ||2
189.191.141|0|ML|3|307.80|570.00|1|1|2|||AMA|AMA|M||||ESQ||2
189.191.142|0|ML|4|447.12|828.00|1|1|2|||AMA|AMA|M||||ESQ||2
189.191.143|0|ML|3|307.80|570.00|1|1|2|||AES|AES|B||||ESQ||2
189.191.144|0|ML|4|447.12|828.00|1|1|2|||AES|AES|B||||ESQ||2
189.191.145|0|ML|3|307.80|570.00|1|1|2|||AES|AES|M||||ESQ||2
189.191.146|0|ML|4|447.12|828.00|1|1|2|||AES|AES|M||||ESQ||2
189.191.147|0|ML|3|307.80|570.00|1|1|2|||PRA|PRA|B||||ESQ||2
189.191.148|0|ML|4|447.12|828.00|1|1|2|||PRA|PRA|B||||ESQ||2
189.191.149|0|ML|3|307.80|570.00|1|1|2|||PRA|PRA|M||||ESQ||2
189.191.150|0|ML|4|447.12|828.00|1|1|2|||PRA|PRA|M||||ESQ||2
189.191.151|0|ML|3|307.80|570.00|1|1|2|||ROS|ROS|B||||ESQ||2
189.191.152|0|ML|4|447.12|828.00|1|1|2|||ROS|ROS|B||||ESQ||2
189.191.153|0|ML|3|307.80|570.00|1|1|2|||ROS|ROS|M||||ESQ||2
189.191.154|0|ML|4|447.12|828.00|1|1|2|||ROS|ROS|M||||ESQ||2
189.191.155|0|ML|3|307.80|570.00|1|1|2|||VER|VER|B||||ESQ||2
189.191.156|0|ML|4|447.12|828.00|1|1|2|||VER|VER|B||||ESQ||2
189.191.157|0|ML|3|307.80|570.00|1|1|2|||VER|VER|M||||ESQ||2
189.191.158|0|ML|4|447.12|828.00|1|1|2|||VER|VER|M||||ESQ||2
189.191.159|0|ML|3|307.80|570.00|1|1|2|||OAK|OAK|||||ESQ||2
189.191.160|0|ML|4|447.12|828.00|1|1|2|||OAK|OAK|||||ESQ||2
189.191.161|0|ML|3|307.80|570.00|1|1|2|||TEA|TEA|||||ESQ||2
189.191.162|0|ML|4|447.12|828.00|1|1|2|||TEA|TEA|||||ESQ||2
189.191.163|0|ML|3|307.80|570.00|1|1|2|||JOP|JOP|||||ESQ||2
189.191.164|0|ML|4|447.12|828.00|1|1|2|||JOP|JOP|||||ESQ||2
189.191.165|0|ML|3|307.80|570.00|1|1|2|||AZB|AZB|||||ESQ||2
189.191.166|0|ML|4|447.12|828.00|1|1|2|||AZB|AZB|||||ESQ||2
189.191.167|0|ML|3|307.80|570.00|1|1|2|||DEN|DEN|||||ESQ||2
189.191.168|0|ML|4|447.12|828.00|1|1|2|||DEN|DEN|||||ESQ||2
189.191.169|0|ML|3|307.80|570.00|1|1|2|||BLK|BLK|||||ESQ||2
189.191.170|0|ML|4|447.12|828.00|1|1|2|||BLK|BLK|||||ESQ||2
189.191.171|0|ML|3|307.80|570.00|1|1|2|||ART|ART|||||ESQ||2
189.191.172|0|ML|4|447.12|828.00|1|1|2|||ART|ART|||||ESQ||2
189.191.173|0|ML|3|307.80|570.00|1|1|2|||LIN|LIN|||||ESQ||2
189.191.174|0|ML|4|447.12|828.00|1|1|2|||LIN|LIN|||||ESQ||2
189.191.175|0|ML|3|307.80|570.00|1|1|2|||HAL|HAL|||||ESQ||2
189.191.176|0|ML|4|447.12|828.00|1|1|2|||HAL|HAL|||||ESQ||2
192.193.3|0|ML|3|243.00|450.00|1|1|2|||WH|WH|||||DIR||3
192.193.4|0|ML|4|356.40|660.00|1|1|2|||WH|WH|||||DIR||3
192.193.5|0|ML|3|243.00|450.00|1|1|2|||WH|AZB|||||DIR||3
192.193.6|0|ML|4|356.40|660.00|1|1|2|||WH|AZB|||||DIR||3
192.193.9|0|ML|3|270.00|500.00|1|1|2|||WH|BCO|B||||DIR||3
192.193.10|0|ML|4|383.40|710.00|1|1|2|||WH|BCO|B||||DIR||3
192.193.11|0|ML|3|270.00|500.00|1|1|2|||WH|BCO|M||||DIR||3
192.193.12|0|ML|4|383.40|710.00|1|1|2|||WH|BCO|M||||DIR||3
192.193.13|0|ML|3|270.00|500.00|1|1|2|||WH|CCL|B||||DIR||3
192.193.14|0|ML|4|383.40|710.00|1|1|2|||WH|CCL|B||||DIR||3
192.193.15|0|ML|3|270.00|500.00|1|1|2|||WH|CCL|M||||DIR||3
192.193.16|0|ML|4|383.40|710.00|1|1|2|||WH|CCL|M||||DIR||3
192.193.17|0|ML|3|270.00|500.00|1|1|2|||WH|CME|B||||DIR||3
192.193.18|0|ML|4|383.40|710.00|1|1|2|||WH|CME|B||||DIR||3
192.193.19|0|ML|3|270.00|500.00|1|1|2|||WH|CME|M||||DIR||3
192.193.20|0|ML|4|383.40|710.00|1|1|2|||WH|CME|M||||DIR||3
192.193.21|0|ML|3|270.00|500.00|1|1|2|||WH|ANT|B||||DIR||3
192.193.22|0|ML|4|383.40|710.00|1|1|2|||WH|ANT|B||||DIR||3
192.193.23|0|ML|3|270.00|500.00|1|1|2|||WH|ANT|M||||DIR||3
192.193.24|0|ML|4|383.40|710.00|1|1|2|||WH|ANT|M||||DIR||3
192.193.25|0|ML|3|270.00|500.00|1|1|2|||WH|PTO|B||||DIR||3
192.193.26|0|ML|4|383.40|710.00|1|1|2|||WH|PTO|B||||DIR||3
192.193.27|0|ML|3|270.00|500.00|1|1|2|||WH|PTO|M||||DIR||3
192.193.28|0|ML|4|383.40|710.00|1|1|2|||WH|PTO|M||||DIR||3
192.193.29|0|ML|3|270.00|500.00|1|1|2|||WH|CRE|B||||DIR||3
192.193.30|0|ML|4|383.40|710.00|1|1|2|||WH|CRE|B||||DIR||3
192.193.31|0|ML|3|270.00|500.00|1|1|2|||WH|CRE|M||||DIR||3
192.193.32|0|ML|4|383.40|710.00|1|1|2|||WH|CRE|M||||DIR||3
192.193.33|0|ML|3|270.00|500.00|1|1|2|||WH|CAM|B||||DIR||3
192.193.34|0|ML|4|383.40|710.00|1|1|2|||WH|CAM|B||||DIR||3
192.193.35|0|ML|3|270.00|500.00|1|1|2|||WH|CAM|M||||DIR||3
192.193.36|0|ML|4|383.40|710.00|1|1|2|||WH|CAM|M||||DIR||3
192.193.37|0|ML|3|270.00|500.00|1|1|2|||WH|OUR|B||||DIR||3
192.193.38|0|ML|4|383.40|710.00|1|1|2|||WH|OUR|B||||DIR||3
192.193.39|0|ML|3|270.00|500.00|1|1|2|||WH|OUR|M||||DIR||3
192.193.40|0|ML|4|383.40|710.00|1|1|2|||WH|OUR|M||||DIR||3
192.193.41|0|ML|3|270.00|500.00|1|1|2|||WH|COB|B||||DIR||3
192.193.42|0|ML|4|383.40|710.00|1|1|2|||WH|COB|B||||DIR||3
192.193.43|0|ML|3|270.00|500.00|1|1|2|||WH|COB|M||||DIR||3
192.193.44|0|ML|4|383.40|710.00|1|1|2|||WH|COB|M||||DIR||3
192.193.45|0|ML|3|270.00|500.00|1|1|2|||WH|CHO|B||||DIR||3
192.193.46|0|ML|4|383.40|710.00|1|1|2|||WH|CHO|B||||DIR||3
192.193.47|0|ML|3|270.00|500.00|1|1|2|||WH|CHO|M||||DIR||3
192.193.48|0|ML|4|383.40|710.00|1|1|2|||WH|CHO|M||||DIR||3
192.193.49|0|ML|3|270.00|500.00|1|1|2|||WH|VAG|B||||DIR||3
192.193.50|0|ML|4|383.40|710.00|1|1|2|||WH|VAG|B||||DIR||3
192.193.51|0|ML|3|270.00|500.00|1|1|2|||WH|VAG|M||||DIR||3
192.193.52|0|ML|4|383.40|710.00|1|1|2|||WH|VAG|M||||DIR||3
192.193.53|0|ML|3|270.00|500.00|1|1|2|||WH|AZE|B||||DIR||3
192.193.54|0|ML|4|383.40|710.00|1|1|2|||WH|AZE|B||||DIR||3
192.193.55|0|ML|3|270.00|500.00|1|1|2|||WH|AZE|M||||DIR||3
192.193.56|0|ML|4|383.40|710.00|1|1|2|||WH|AZE|M||||DIR||3
192.193.57|0|ML|3|270.00|500.00|1|1|2|||WH|AMA|B||||DIR||3
192.193.58|0|ML|4|383.40|710.00|1|1|2|||WH|AMA|B||||DIR||3
192.193.59|0|ML|3|270.00|500.00|1|1|2|||WH|AMA|M||||DIR||3
192.193.60|0|ML|4|383.40|710.00|1|1|2|||WH|AMA|M||||DIR||3
192.193.61|0|ML|3|270.00|500.00|1|1|2|||WH|AES|B||||DIR||3
192.193.62|0|ML|4|383.40|710.00|1|1|2|||WH|AES|B||||DIR||3
192.193.63|0|ML|3|270.00|500.00|1|1|2|||WH|AES|M||||DIR||3
192.193.64|0|ML|4|383.40|710.00|1|1|2|||WH|AES|M||||DIR||3
192.193.65|0|ML|3|270.00|500.00|1|1|2|||WH|PRA|B||||DIR||3
192.193.66|0|ML|4|383.40|710.00|1|1|2|||WH|PRA|B||||DIR||3
192.193.67|0|ML|3|270.00|500.00|1|1|2|||WH|PRA|M||||DIR||3
192.193.68|0|ML|4|383.40|710.00|1|1|2|||WH|PRA|M||||DIR||3
192.193.69|0|ML|3|270.00|500.00|1|1|2|||WH|ROS|B||||DIR||3
192.193.70|0|ML|4|383.40|710.00|1|1|2|||WH|ROS|B||||DIR||3
192.193.71|0|ML|3|270.00|500.00|1|1|2|||WH|ROS|M||||DIR||3
192.193.72|0|ML|4|383.40|710.00|1|1|2|||WH|ROS|M||||DIR||3
192.193.73|0|ML|3|270.00|500.00|1|1|2|||WH|VER|B||||DIR||3
192.193.74|0|ML|4|383.40|710.00|1|1|2|||WH|VER|B||||DIR||3
192.193.75|0|ML|3|270.00|500.00|1|1|2|||WH|VER|M||||DIR||3
192.193.76|0|ML|4|383.40|710.00|1|1|2|||WH|VER|M||||DIR||3
192.193.77|0|ML|3|270.00|500.00|1|1|2|||WH|OAK|||||DIR||3
192.193.78|0|ML|4|383.40|710.00|1|1|2|||WH|OAK|||||DIR||3
192.193.79|0|ML|3|270.00|500.00|1|1|2|||WH|TEA|||||DIR||3
192.193.80|0|ML|4|383.40|710.00|1|1|2|||WH|TEA|||||DIR||3
192.193.81|0|ML|3|270.00|500.00|1|1|2|||WH|JOP|||||DIR||3
192.193.82|0|ML|4|383.40|710.00|1|1|2|||WH|JOP|||||DIR||3
192.193.186|0|ML|3|270.00|500.00|1|1|2|||WH|DEN|||||DIR||3
192.193.187|0|ML|4|383.40|710.00|1|1|2|||WH|DEN|||||DIR||3
192.193.83|0|ML|3|270.00|500.00|1|1|2|||WH|BLK|||||DIR||3
192.193.84|0|ML|4|383.40|710.00|1|1|2|||WH|BLK|||||DIR||3
192.193.85|0|ML|3|270.00|500.00|1|1|2|||WH|ART|||||DIR||3
192.193.86|0|ML|4|383.40|710.00|1|1|2|||WH|ART|||||DIR||3
192.193.87|0|ML|3|270.00|500.00|1|1|2|||WH|LIN|||||DIR||3
192.193.88|0|ML|4|383.40|710.00|1|1|2|||WH|LIN|||||DIR||3
192.193.89|0|ML|3|270.00|500.00|1|1|2|||WH|HAL|||||DIR||3
192.193.90|0|ML|4|383.40|710.00|1|1|2|||WH|HAL|||||DIR||3
192.193.91|0|ML|3|291.60|540.00|1|1|2|||BCO|BCO|B||||DIR||3
192.193.92|0|ML|4|405.00|750.00|1|1|2|||BCO|BCO|B||||DIR||3
192.193.93|0|ML|3|291.60|540.00|1|1|2|||BCO|BCO|M||||DIR||3
192.193.94|0|ML|4|405.00|750.00|1|1|2|||BCO|BCO|M||||DIR||3
192.193.95|0|ML|3|291.60|540.00|1|1|2|||CCL|CCL|B||||DIR||3
192.193.96|0|ML|4|405.00|750.00|1|1|2|||CCL|CCL|B||||DIR||3
192.193.97|0|ML|3|291.60|540.00|1|1|2|||CCL|CCL|M||||DIR||3
192.193.98|0|ML|4|405.00|750.00|1|1|2|||CCL|CCL|M||||DIR||3
192.193.99|0|ML|3|291.60|540.00|1|1|2|||CME|CME|B||||DIR||3
192.193.100|0|ML|4|405.00|750.00|1|1|2|||CME|CME|B||||DIR||3
192.193.101|0|ML|3|291.60|540.00|1|1|2|||CME|CME|M||||DIR||3
192.193.102|0|ML|4|405.00|750.00|1|1|2|||CME|CME|M||||DIR||3
192.193.103|0|ML|3|291.60|540.00|1|1|2|||ANT|ANT|B||||DIR||3
192.193.104|0|ML|4|405.00|750.00|1|1|2|||ANT|ANT|B||||DIR||3
192.193.105|0|ML|3|291.60|540.00|1|1|2|||ANT|ANT|M||||DIR||3
192.193.106|0|ML|4|405.00|750.00|1|1|2|||ANT|ANT|M||||DIR||3
192.193.107|0|ML|3|291.60|540.00|1|1|2|||PTO|PTO|B||||DIR||3
192.193.108|0|ML|4|405.00|750.00|1|1|2|||PTO|PTO|B||||DIR||3
192.193.109|0|ML|3|291.60|540.00|1|1|2|||PTO|PTO|M||||DIR||3
192.193.110|0|ML|4|405.00|750.00|1|1|2|||PTO|PTO|M||||DIR||3
192.193.111|0|ML|3|291.60|540.00|1|1|2|||CRE|CRE|B||||DIR||3
192.193.112|0|ML|4|405.00|750.00|1|1|2|||CRE|CRE|B||||DIR||3
192.193.113|0|ML|3|291.60|540.00|1|1|2|||CRE|CRE|M||||DIR||3
192.193.114|0|ML|4|405.00|750.00|1|1|2|||CRE|CRE|M||||DIR||3
192.193.115|0|ML|3|291.60|540.00|1|1|2|||CAM|CAM|B||||DIR||3
192.193.116|0|ML|4|405.00|750.00|1|1|2|||CAM|CAM|B||||DIR||3
192.193.117|0|ML|3|291.60|540.00|1|1|2|||CAM|CAM|M||||DIR||3
192.193.118|0|ML|4|405.00|750.00|1|1|2|||CAM|CAM|M||||DIR||3
192.193.119|0|ML|3|291.60|540.00|1|1|2|||OUR|OUR|B||||DIR||3
192.193.120|0|ML|4|405.00|750.00|1|1|2|||OUR|OUR|B||||DIR||3
192.193.121|0|ML|3|291.60|540.00|1|1|2|||OUR|OUR|M||||DIR||3
192.193.122|0|ML|4|405.00|750.00|1|1|2|||OUR|OUR|M||||DIR||3
192.193.123|0|ML|3|291.60|540.00|1|1|2|||COB|COB|B||||DIR||3
192.193.124|0|ML|4|405.00|750.00|1|1|2|||COB|COB|B||||DIR||3
192.193.125|0|ML|3|291.60|540.00|1|1|2|||COB|COB|M||||DIR||3
192.193.126|0|ML|4|405.00|750.00|1|1|2|||COB|COB|M||||DIR||3
192.193.127|0|ML|3|291.60|540.00|1|1|2|||CHO|CHO|B||||DIR||3
192.193.128|0|ML|4|405.00|750.00|1|1|2|||CHO|CHO|B||||DIR||3
192.193.129|0|ML|3|291.60|540.00|1|1|2|||CHO|CHO|M||||DIR||3
192.193.130|0|ML|4|405.00|750.00|1|1|2|||CHO|CHO|M||||DIR||3
192.193.131|0|ML|3|291.60|540.00|1|1|2|||VAG|VAG|B||||DIR||3
192.193.132|0|ML|4|405.00|750.00|1|1|2|||VAG|VAG|B||||DIR||3
192.193.133|0|ML|3|291.60|540.00|1|1|2|||VAG|VAG|M||||DIR||3
192.193.134|0|ML|4|405.00|750.00|1|1|2|||VAG|VAG|M||||DIR||3
192.193.135|0|ML|3|291.60|540.00|1|1|2|||AZE|AZE|B||||DIR||3
192.193.136|0|ML|4|405.00|750.00|1|1|2|||AZE|AZE|B||||DIR||3
192.193.137|0|ML|3|291.60|540.00|1|1|2|||AZE|AZE|M||||DIR||3
192.193.138|0|ML|4|405.00|750.00|1|1|2|||AZE|AZE|M||||DIR||3
192.193.139|0|ML|3|291.60|540.00|1|1|2|||AMA|AMA|B||||DIR||3
192.193.140|0|ML|4|405.00|750.00|1|1|2|||AMA|AMA|B||||DIR||3
192.193.141|0|ML|3|291.60|540.00|1|1|2|||AMA|AMA|M||||DIR||3
192.193.142|0|ML|4|405.00|750.00|1|1|2|||AMA|AMA|M||||DIR||3
192.193.143|0|ML|3|291.60|540.00|1|1|2|||AES|AES|B||||DIR||3
192.193.144|0|ML|4|405.00|750.00|1|1|2|||AES|AES|B||||DIR||3
192.193.145|0|ML|3|291.60|540.00|1|1|2|||AES|AES|M||||DIR||3
192.193.146|0|ML|4|405.00|750.00|1|1|2|||AES|AES|M||||DIR||3
192.193.147|0|ML|3|291.60|540.00|1|1|2|||PRA|PRA|B||||DIR||3
192.193.148|0|ML|4|405.00|750.00|1|1|2|||PRA|PRA|B||||DIR||3
192.193.149|0|ML|3|291.60|540.00|1|1|2|||PRA|PRA|M||||DIR||3
192.193.150|0|ML|4|405.00|750.00|1|1|2|||PRA|PRA|M||||DIR||3
192.193.151|0|ML|3|291.60|540.00|1|1|2|||ROS|ROS|B||||DIR||3
192.193.152|0|ML|4|405.00|750.00|1|1|2|||ROS|ROS|B||||DIR||3
192.193.153|0|ML|3|291.60|540.00|1|1|2|||ROS|ROS|M||||DIR||3
192.193.154|0|ML|4|405.00|750.00|1|1|2|||ROS|ROS|M||||DIR||3
192.193.155|0|ML|3|291.60|540.00|1|1|2|||VER|VER|B||||DIR||3
192.193.156|0|ML|4|405.00|750.00|1|1|2|||VER|VER|B||||DIR||3
192.193.157|0|ML|3|291.60|540.00|1|1|2|||VER|VER|M||||DIR||3
192.193.158|0|ML|4|405.00|750.00|1|1|2|||VER|VER|M||||DIR||3
192.193.159|0|ML|3|291.60|540.00|1|1|2|||OAK|OAK|||||DIR||3
192.193.160|0|ML|4|405.00|750.00|1|1|2|||OAK|OAK|||||DIR||3
192.193.161|0|ML|3|291.60|540.00|1|1|2|||TEA|TEA|||||DIR||3
192.193.162|0|ML|4|405.00|750.00|1|1|2|||TEA|TEA|||||DIR||3
192.193.163|0|ML|3|291.60|540.00|1|1|2|||JOP|JOP|||||DIR||3
192.193.164|0|ML|4|405.00|750.00|1|1|2|||JOP|JOP|||||DIR||3
192.193.165|0|ML|3|291.60|540.00|1|1|2|||AZB|AZB|||||DIR||3
192.193.166|0|ML|4|405.00|750.00|1|1|2|||AZB|AZB|||||DIR||3
192.193.167|0|ML|3|291.60|540.00|1|1|2|||DEN|DEN|||||DIR||3
192.193.168|0|ML|4|405.00|750.00|1|1|2|||DEN|DEN|||||DIR||3
192.193.169|0|ML|3|291.60|540.00|1|1|2|||BLK|BLK|||||DIR||3
192.193.170|0|ML|4|405.00|750.00|1|1|2|||BLK|BLK|||||DIR||3
192.193.171|0|ML|3|291.60|540.00|1|1|2|||ART|ART|||||DIR||3
192.193.172|0|ML|4|405.00|750.00|1|1|2|||ART|ART|||||DIR||3
192.193.173|0|ML|3|291.60|540.00|1|1|2|||LIN|LIN|||||DIR||3
192.193.174|0|ML|4|405.00|750.00|1|1|2|||LIN|LIN|||||DIR||3
192.193.175|0|ML|3|291.60|540.00|1|1|2|||HAL|HAL|||||DIR||3
192.193.176|0|ML|4|405.00|750.00|1|1|2|||HAL|HAL|||||DIR||3
192.194.3|0|ML|3|291.60|540.00|1|1|2|||WH|WH|||||ESQ||3
192.194.4|0|ML|4|427.68|792.00|1|1|2|||WH|WH|||||ESQ||3
192.194.5|0|ML|3|291.60|540.00|1|1|2|||WH|AZB|||||ESQ||3
192.194.6|0|ML|4|427.68|792.00|1|1|2|||WH|AZB|||||ESQ||3
192.194.9|0|ML|3|318.60|590.00|1|1|2|||WH|BCO|B||||ESQ||3
192.194.10|0|ML|4|454.68|842.00|1|1|2|||WH|BCO|B||||ESQ||3
192.194.11|0|ML|3|318.60|590.00|1|1|2|||WH|BCO|M||||ESQ||3
192.194.12|0|ML|4|454.68|842.00|1|1|2|||WH|BCO|M||||ESQ||3
192.194.13|0|ML|3|318.60|590.00|1|1|2|||WH|CCL|B||||ESQ||3
192.194.14|0|ML|4|454.68|842.00|1|1|2|||WH|CCL|B||||ESQ||3
192.194.15|0|ML|3|318.60|590.00|1|1|2|||WH|CCL|M||||ESQ||3
192.194.16|0|ML|4|454.68|842.00|1|1|2|||WH|CCL|M||||ESQ||3
192.194.17|0|ML|3|318.60|590.00|1|1|2|||WH|CME|B||||ESQ||3
192.194.18|0|ML|4|454.68|842.00|1|1|2|||WH|CME|B||||ESQ||3
192.194.19|0|ML|3|318.60|590.00|1|1|2|||WH|CME|M||||ESQ||3
192.194.20|0|ML|4|454.68|842.00|1|1|2|||WH|CME|M||||ESQ||3
192.194.21|0|ML|3|318.60|590.00|1|1|2|||WH|ANT|B||||ESQ||3
192.194.22|0|ML|4|454.68|842.00|1|1|2|||WH|ANT|B||||ESQ||3
192.194.23|0|ML|3|318.60|590.00|1|1|2|||WH|ANT|M||||ESQ||3
192.194.24|0|ML|4|454.68|842.00|1|1|2|||WH|ANT|M||||ESQ||3
192.194.25|0|ML|3|318.60|590.00|1|1|2|||WH|PTO|B||||ESQ||3
192.194.26|0|ML|4|454.68|842.00|1|1|2|||WH|PTO|B||||ESQ||3
192.194.27|0|ML|3|318.60|590.00|1|1|2|||WH|PTO|M||||ESQ||3
192.194.28|0|ML|4|454.68|842.00|1|1|2|||WH|PTO|M||||ESQ||3
192.194.29|0|ML|3|318.60|590.00|1|1|2|||WH|CRE|B||||ESQ||3
192.194.30|0|ML|4|454.68|842.00|1|1|2|||WH|CRE|B||||ESQ||3
192.194.31|0|ML|3|318.60|590.00|1|1|2|||WH|CRE|M||||ESQ||3
192.194.32|0|ML|4|454.68|842.00|1|1|2|||WH|CRE|M||||ESQ||3
192.194.33|0|ML|3|318.60|590.00|1|1|2|||WH|CAM|B||||ESQ||3
192.194.34|0|ML|4|454.68|842.00|1|1|2|||WH|CAM|B||||ESQ||3
192.194.35|0|ML|3|318.60|590.00|1|1|2|||WH|CAM|M||||ESQ||3
192.194.36|0|ML|4|454.68|842.00|1|1|2|||WH|CAM|M||||ESQ||3
192.194.37|0|ML|3|318.60|590.00|1|1|2|||WH|OUR|B||||ESQ||3
192.194.38|0|ML|4|454.68|842.00|1|1|2|||WH|OUR|B||||ESQ||3
192.194.39|0|ML|3|318.60|590.00|1|1|2|||WH|OUR|M||||ESQ||3
192.194.40|0|ML|4|454.68|842.00|1|1|2|||WH|OUR|M||||ESQ||3
192.194.41|0|ML|3|318.60|590.00|1|1|2|||WH|COB|B||||ESQ||3
192.194.42|0|ML|4|454.68|842.00|1|1|2|||WH|COB|B||||ESQ||3
192.194.43|0|ML|3|318.60|590.00|1|1|2|||WH|COB|M||||ESQ||3
192.194.44|0|ML|4|454.68|842.00|1|1|2|||WH|COB|M||||ESQ||3
192.194.45|0|ML|3|318.60|590.00|1|1|2|||WH|CHO|B||||ESQ||3
192.194.46|0|ML|4|454.68|842.00|1|1|2|||WH|CHO|B||||ESQ||3
192.194.47|0|ML|3|318.60|590.00|1|1|2|||WH|CHO|M||||ESQ||3
192.194.48|0|ML|4|454.68|842.00|1|1|2|||WH|CHO|M||||ESQ||3
192.194.49|0|ML|3|318.60|590.00|1|1|2|||WH|VAG|B||||ESQ||3
192.194.50|0|ML|4|454.68|842.00|1|1|2|||WH|VAG|B||||ESQ||3
192.194.51|0|ML|3|318.60|590.00|1|1|2|||WH|VAG|M||||ESQ||3
192.194.52|0|ML|4|454.68|842.00|1|1|2|||WH|VAG|M||||ESQ||3
192.194.53|0|ML|3|318.60|590.00|1|1|2|||WH|AZE|B||||ESQ||3
192.194.54|0|ML|4|454.68|842.00|1|1|2|||WH|AZE|B||||ESQ||3
192.194.55|0|ML|3|318.60|590.00|1|1|2|||WH|AZE|M||||ESQ||3
192.194.56|0|ML|4|454.68|842.00|1|1|2|||WH|AZE|M||||ESQ||3
192.194.57|0|ML|3|318.60|590.00|1|1|2|||WH|AMA|B||||ESQ||3
192.194.58|0|ML|4|454.68|842.00|1|1|2|||WH|AMA|B||||ESQ||3
192.194.59|0|ML|3|318.60|590.00|1|1|2|||WH|AMA|M||||ESQ||3
192.194.60|0|ML|4|454.68|842.00|1|1|2|||WH|AMA|M||||ESQ||3
192.194.61|0|ML|3|318.60|590.00|1|1|2|||WH|AES|B||||ESQ||3
192.194.62|0|ML|4|454.68|842.00|1|1|2|||WH|AES|B||||ESQ||3
192.194.63|0|ML|3|318.60|590.00|1|1|2|||WH|AES|M||||ESQ||3
192.194.64|0|ML|4|454.68|842.00|1|1|2|||WH|AES|M||||ESQ||3
192.194.65|0|ML|3|318.60|590.00|1|1|2|||WH|PRA|B||||ESQ||3
192.194.66|0|ML|4|454.68|842.00|1|1|2|||WH|PRA|B||||ESQ||3
192.194.67|0|ML|3|318.60|590.00|1|1|2|||WH|PRA|M||||ESQ||3
192.194.68|0|ML|4|454.68|842.00|1|1|2|||WH|PRA|M||||ESQ||3
192.194.69|0|ML|3|318.60|590.00|1|1|2|||WH|ROS|B||||ESQ||3
192.194.70|0|ML|4|454.68|842.00|1|1|2|||WH|ROS|B||||ESQ||3
192.194.71|0|ML|3|318.60|590.00|1|1|2|||WH|ROS|M||||ESQ||3
192.194.72|0|ML|4|454.68|842.00|1|1|2|||WH|ROS|M||||ESQ||3
192.194.73|0|ML|3|318.60|590.00|1|1|2|||WH|VER|B||||ESQ||3
192.194.74|0|ML|4|454.68|842.00|1|1|2|||WH|VER|B||||ESQ||3
192.194.75|0|ML|3|318.60|590.00|1|1|2|||WH|VER|M||||ESQ||3
192.194.76|0|ML|4|454.68|842.00|1|1|2|||WH|VER|M||||ESQ||3
192.194.77|0|ML|3|318.60|590.00|1|1|2|||WH|OAK|||||ESQ||3
192.194.78|0|ML|4|454.68|842.00|1|1|2|||WH|OAK|||||ESQ||3
192.194.79|0|ML|3|318.60|590.00|1|1|2|||WH|TEA|||||ESQ||3
192.194.80|0|ML|4|454.68|842.00|1|1|2|||WH|TEA|||||ESQ||3
192.194.81|0|ML|3|318.60|590.00|1|1|2|||WH|JOP|||||ESQ||3
192.194.82|0|ML|4|454.68|842.00|1|1|2|||WH|JOP|||||ESQ||3
192.194.186|0|ML|3|318.60|590.00|1|1|2|||WH|DEN|||||ESQ||3
192.194.187|0|ML|4|454.68|842.00|1|1|2|||WH|DEN|||||ESQ||3
192.194.83|0|ML|3|318.60|590.00|1|1|2|||WH|BLK|||||ESQ||3
192.194.84|0|ML|4|454.68|842.00|1|1|2|||WH|BLK|||||ESQ||3
192.194.85|0|ML|3|318.60|590.00|1|1|2|||WH|ART|||||ESQ||3
192.194.86|0|ML|4|454.68|842.00|1|1|2|||WH|ART|||||ESQ||3
192.194.87|0|ML|3|318.60|590.00|1|1|2|||WH|LIN|||||ESQ||3
192.194.88|0|ML|4|454.68|842.00|1|1|2|||WH|LIN|||||ESQ||3
192.194.89|0|ML|3|318.60|590.00|1|1|2|||WH|HAL|||||ESQ||3
192.194.90|0|ML|4|454.68|842.00|1|1|2|||WH|HAL|||||ESQ||3
192.194.91|0|ML|3|340.20|630.00|1|1|2|||BCO|BCO|B||||ESQ||3
192.194.92|0|ML|4|476.28|882.00|1|1|2|||BCO|BCO|B||||ESQ||3
192.194.93|0|ML|3|340.20|630.00|1|1|2|||BCO|BCO|M||||ESQ||3
192.194.94|0|ML|4|476.28|882.00|1|1|2|||BCO|BCO|M||||ESQ||3
192.194.95|0|ML|3|340.20|630.00|1|1|2|||CCL|CCL|B||||ESQ||3
192.194.96|0|ML|4|476.28|882.00|1|1|2|||CCL|CCL|B||||ESQ||3
192.194.97|0|ML|3|340.20|630.00|1|1|2|||CCL|CCL|M||||ESQ||3
192.194.98|0|ML|4|476.28|882.00|1|1|2|||CCL|CCL|M||||ESQ||3
192.194.99|0|ML|3|340.20|630.00|1|1|2|||CME|CME|B||||ESQ||3
192.194.100|0|ML|4|476.28|882.00|1|1|2|||CME|CME|B||||ESQ||3
192.194.101|0|ML|3|340.20|630.00|1|1|2|||CME|CME|M||||ESQ||3
192.194.102|0|ML|4|476.28|882.00|1|1|2|||CME|CME|M||||ESQ||3
192.194.103|0|ML|3|340.20|630.00|1|1|2|||ANT|ANT|B||||ESQ||3
192.194.104|0|ML|4|476.28|882.00|1|1|2|||ANT|ANT|B||||ESQ||3
192.194.105|0|ML|3|340.20|630.00|1|1|2|||ANT|ANT|M||||ESQ||3
192.194.106|0|ML|4|476.28|882.00|1|1|2|||ANT|ANT|M||||ESQ||3
192.194.107|0|ML|3|340.20|630.00|1|1|2|||PTO|PTO|B||||ESQ||3
192.194.108|0|ML|4|476.28|882.00|1|1|2|||PTO|PTO|B||||ESQ||3
192.194.109|0|ML|3|340.20|630.00|1|1|2|||PTO|PTO|M||||ESQ||3
192.194.110|0|ML|4|476.28|882.00|1|1|2|||PTO|PTO|M||||ESQ||3
192.194.111|0|ML|3|340.20|630.00|1|1|2|||CRE|CRE|B||||ESQ||3
192.194.112|0|ML|4|476.28|882.00|1|1|2|||CRE|CRE|B||||ESQ||3
192.194.113|0|ML|3|340.20|630.00|1|1|2|||CRE|CRE|M||||ESQ||3
192.194.114|0|ML|4|476.28|882.00|1|1|2|||CRE|CRE|M||||ESQ||3
192.194.115|0|ML|3|340.20|630.00|1|1|2|||CAM|CAM|B||||ESQ||3
192.194.116|0|ML|4|476.28|882.00|1|1|2|||CAM|CAM|B||||ESQ||3
192.194.117|0|ML|3|340.20|630.00|1|1|2|||CAM|CAM|M||||ESQ||3
192.194.118|0|ML|4|476.28|882.00|1|1|2|||CAM|CAM|M||||ESQ||3
192.194.119|0|ML|3|340.20|630.00|1|1|2|||OUR|OUR|B||||ESQ||3
192.194.120|0|ML|4|476.28|882.00|1|1|2|||OUR|OUR|B||||ESQ||3
192.194.121|0|ML|3|340.20|630.00|1|1|2|||OUR|OUR|M||||ESQ||3
192.194.122|0|ML|4|476.28|882.00|1|1|2|||OUR|OUR|M||||ESQ||3
192.194.123|0|ML|3|340.20|630.00|1|1|2|||COB|COB|B||||ESQ||3
192.194.124|0|ML|4|476.28|882.00|1|1|2|||COB|COB|B||||ESQ||3
192.194.125|0|ML|3|340.20|630.00|1|1|2|||COB|COB|M||||ESQ||3
192.194.126|0|ML|4|476.28|882.00|1|1|2|||COB|COB|M||||ESQ||3
192.194.127|0|ML|3|340.20|630.00|1|1|2|||CHO|CHO|B||||ESQ||3
192.194.128|0|ML|4|476.28|882.00|1|1|2|||CHO|CHO|B||||ESQ||3
192.194.129|0|ML|3|340.20|630.00|1|1|2|||CHO|CHO|M||||ESQ||3
192.194.130|0|ML|4|476.28|882.00|1|1|2|||CHO|CHO|M||||ESQ||3
192.194.131|0|ML|3|340.20|630.00|1|1|2|||VAG|VAG|B||||ESQ||3
192.194.132|0|ML|4|476.28|882.00|1|1|2|||VAG|VAG|B||||ESQ||3
192.194.133|0|ML|3|340.20|630.00|1|1|2|||VAG|VAG|M||||ESQ||3
192.194.134|0|ML|4|476.28|882.00|1|1|2|||VAG|VAG|M||||ESQ||3
192.194.135|0|ML|3|340.20|630.00|1|1|2|||AZE|AZE|B||||ESQ||3
192.194.136|0|ML|4|476.28|882.00|1|1|2|||AZE|AZE|B||||ESQ||3
192.194.137|0|ML|3|340.20|630.00|1|1|2|||AZE|AZE|M||||ESQ||3
192.194.138|0|ML|4|476.28|882.00|1|1|2|||AZE|AZE|M||||ESQ||3
192.194.139|0|ML|3|340.20|630.00|1|1|2|||AMA|AMA|B||||ESQ||3
192.194.140|0|ML|4|476.28|882.00|1|1|2|||AMA|AMA|B||||ESQ||3
192.194.141|0|ML|3|340.20|630.00|1|1|2|||AMA|AMA|M||||ESQ||3
192.194.142|0|ML|4|476.28|882.00|1|1|2|||AMA|AMA|M||||ESQ||3
192.194.143|0|ML|3|340.20|630.00|1|1|2|||AES|AES|B||||ESQ||3
192.194.144|0|ML|4|476.28|882.00|1|1|2|||AES|AES|B||||ESQ||3
192.194.145|0|ML|3|340.20|630.00|1|1|2|||AES|AES|M||||ESQ||3
192.194.146|0|ML|4|476.28|882.00|1|1|2|||AES|AES|M||||ESQ||3
192.194.147|0|ML|3|340.20|630.00|1|1|2|||PRA|PRA|B||||ESQ||3
192.194.148|0|ML|4|476.28|882.00|1|1|2|||PRA|PRA|B||||ESQ||3
192.194.149|0|ML|3|340.20|630.00|1|1|2|||PRA|PRA|M||||ESQ||3
192.194.150|0|ML|4|476.28|882.00|1|1|2|||PRA|PRA|M||||ESQ||3
192.194.151|0|ML|3|340.20|630.00|1|1|2|||ROS|ROS|B||||ESQ||3
192.194.152|0|ML|4|476.28|882.00|1|1|2|||ROS|ROS|B||||ESQ||3
192.194.153|0|ML|3|340.20|630.00|1|1|2|||ROS|ROS|M||||ESQ||3
192.194.154|0|ML|4|476.28|882.00|1|1|2|||ROS|ROS|M||||ESQ||3
192.194.155|0|ML|3|340.20|630.00|1|1|2|||VER|VER|B||||ESQ||3
192.194.156|0|ML|4|476.28|882.00|1|1|2|||VER|VER|B||||ESQ||3
192.194.157|0|ML|3|340.20|630.00|1|1|2|||VER|VER|M||||ESQ||3
192.194.158|0|ML|4|476.28|882.00|1|1|2|||VER|VER|M||||ESQ||3
192.194.159|0|ML|3|340.20|630.00|1|1|2|||OAK|OAK|||||ESQ||3
192.194.160|0|ML|4|476.28|882.00|1|1|2|||OAK|OAK|||||ESQ||3
192.194.161|0|ML|3|340.20|630.00|1|1|2|||TEA|TEA|||||ESQ||3
192.194.162|0|ML|4|476.28|882.00|1|1|2|||TEA|TEA|||||ESQ||3
192.194.163|0|ML|3|340.20|630.00|1|1|2|||JOP|JOP|||||ESQ||3
192.194.164|0|ML|4|476.28|882.00|1|1|2|||JOP|JOP|||||ESQ||3
192.194.165|0|ML|3|340.20|630.00|1|1|2|||AZB|AZB|||||ESQ||3
192.194.166|0|ML|4|476.28|882.00|1|1|2|||AZB|AZB|||||ESQ||3
192.194.167|0|ML|3|340.20|630.00|1|1|2|||DEN|DEN|||||ESQ||3
192.194.168|0|ML|4|476.28|882.00|1|1|2|||DEN|DEN|||||ESQ||3
192.194.169|0|ML|3|340.20|630.00|1|1|2|||BLK|BLK|||||ESQ||3
192.194.170|0|ML|4|476.28|882.00|1|1|2|||BLK|BLK|||||ESQ||3
192.194.171|0|ML|3|340.20|630.00|1|1|2|||ART|ART|||||ESQ||3
192.194.172|0|ML|4|476.28|882.00|1|1|2|||ART|ART|||||ESQ||3
192.194.173|0|ML|3|340.20|630.00|1|1|2|||LIN|LIN|||||ESQ||3
192.194.174|0|ML|4|476.28|882.00|1|1|2|||LIN|LIN|||||ESQ||3
192.194.175|0|ML|3|340.20|630.00|1|1|2|||HAL|HAL|||||ESQ||3
192.194.176|0|ML|4|476.28|882.00|1|1|2|||HAL|HAL|||||ESQ||3
195.196.197|0|ML|5|129.60|240.00|1|1|3|||TBL|TBL|||||||4
195.196.198|0|ML|5|129.60|240.00|1|1|3|||TEA|TEA|||||||4
195.196.199|0|ML|5|129.60|240.00|1|1|3|||OAK|OAK|||||||4
195.196.200|0|ML|5|129.60|240.00|1|1|3|||JOP|JOP|||||||4
195.196.201|0|ML|5|156.60|290.00|1|1|3|||TBL|BCO|B||||||4
195.196.202|0|ML|5|156.60|290.00|1|1|3|||TBL|BCO|M||||||4
195.196.203|0|ML|5|156.60|290.00|1|1|3|||TBL|CCL|B||||||4
195.196.204|0|ML|5|156.60|290.00|1|1|3|||TBL|CCL|M||||||4
195.196.205|0|ML|5|156.60|290.00|1|1|3|||TBL|CME|B||||||4
195.196.206|0|ML|5|156.60|290.00|1|1|3|||TBL|CME|M||||||4
195.196.207|0|ML|5|156.60|290.00|1|1|3|||TBL|ANT|B||||||4
195.196.208|0|ML|5|156.60|290.00|1|1|3|||TBL|ANT|M||||||4
195.196.209|0|ML|5|156.60|290.00|1|1|3|||TBL|PTO|B||||||4
195.196.210|0|ML|5|156.60|290.00|1|1|3|||TBL|PTO|M||||||4
195.196.211|0|ML|5|156.60|290.00|1|1|3|||TBL|CRE|B||||||4
195.196.212|0|ML|5|156.60|290.00|1|1|3|||TBL|CRE|M||||||4
195.196.213|0|ML|5|156.60|290.00|1|1|3|||TBL|CAM|B||||||4
195.196.214|0|ML|5|156.60|290.00|1|1|3|||TBL|CAM|M||||||4
195.196.215|0|ML|5|156.60|290.00|1|1|3|||TBL|OUR|B||||||4
195.196.216|0|ML|5|156.60|290.00|1|1|3|||TBL|OUR|M||||||4
195.196.217|0|ML|5|156.60|290.00|1|1|3|||TBL|COB|B||||||4
195.196.218|0|ML|5|156.60|290.00|1|1|3|||TBL|COB|M||||||4
195.196.219|0|ML|5|156.60|290.00|1|1|3|||TBL|CHO|B||||||4
195.196.220|0|ML|5|156.60|290.00|1|1|3|||TBL|CHO|M||||||4
195.196.221|0|ML|5|156.60|290.00|1|1|3|||TBL|VAG|B||||||4
195.196.222|0|ML|5|156.60|290.00|1|1|3|||TBL|VAG|M||||||4
195.196.223|0|ML|5|156.60|290.00|1|1|3|||TBL|AZE|B||||||4
195.196.224|0|ML|5|156.60|290.00|1|1|3|||TBL|AZE|M||||||4
195.196.225|0|ML|5|156.60|290.00|1|1|3|||TBL|AMA|B||||||4
195.196.226|0|ML|5|156.60|290.00|1|1|3|||TBL|AMA|M||||||4
195.196.227|0|ML|5|156.60|290.00|1|1|3|||TBL|AES|B||||||4
195.196.228|0|ML|5|156.60|290.00|1|1|3|||TBL|AES|M||||||4
195.196.229|0|ML|5|156.60|290.00|1|1|3|||TBL|PRA|B||||||4
195.196.230|0|ML|5|156.60|290.00|1|1|3|||TBL|PRA|M||||||4
195.196.231|0|ML|5|156.60|290.00|1|1|3|||TBL|ROS|B||||||4
195.196.232|0|ML|5|156.60|290.00|1|1|3|||TBL|ROS|M||||||4
195.196.233|0|ML|5|156.60|290.00|1|1|3|||TBL|VER|B||||||4
195.196.234|0|ML|5|156.60|290.00|1|1|3|||TBL|VER|M||||||4
195.196.235|0|ML|5|156.60|290.00|1|1|3|||TBL|AZB|||||||4
195.196.236|0|ML|5|156.60|290.00|1|1|3|||TBL|DEN|||||||4
195.196.237|0|ML|5|156.60|290.00|1|1|3|||TBL|BLK|||||||4
195.196.238|0|ML|5|156.60|290.00|1|1|3|||TBL|ART|||||||4
195.196.239|0|ML|5|156.60|290.00|1|1|3|||TBL|LIN|||||||4
195.196.240|0|ML|5|156.60|290.00|1|1|3|||TBL|HAL|||||||4
195.196.91|0|ML|5|178.20|330.00|1|1|3|||BCO|BCO|B||||||4
195.196.93|0|ML|5|178.20|330.00|1|1|3|||BCO|BCO|M||||||4
195.196.95|0|ML|5|178.20|330.00|1|1|3|||CCL|CCL|B||||||4
195.196.97|0|ML|5|178.20|330.00|1|1|3|||CCL|CCL|M||||||4
195.196.99|0|ML|5|178.20|330.00|1|1|3|||CME|CME|B||||||4
195.196.101|0|ML|5|178.20|330.00|1|1|3|||CME|CME|M||||||4
195.196.103|0|ML|5|178.20|330.00|1|1|3|||ANT|ANT|B||||||4
195.196.105|0|ML|5|178.20|330.00|1|1|3|||ANT|ANT|M||||||4
195.196.107|0|ML|5|178.20|330.00|1|1|3|||PTO|PTO|B||||||4
195.196.109|0|ML|5|178.20|330.00|1|1|3|||PTO|PTO|M||||||4
195.196.111|0|ML|5|178.20|330.00|1|1|3|||CRE|CRE|B||||||4
195.196.113|0|ML|5|178.20|330.00|1|1|3|||CRE|CRE|M||||||4
195.196.115|0|ML|5|178.20|330.00|1|1|3|||CAM|CAM|B||||||4
195.196.117|0|ML|5|178.20|330.00|1|1|3|||CAM|CAM|M||||||4
195.196.119|0|ML|5|178.20|330.00|1|1|3|||OUR|OUR|B||||||4
195.196.121|0|ML|5|178.20|330.00|1|1|3|||OUR|OUR|M||||||4
195.196.123|0|ML|5|178.20|330.00|1|1|3|||COB|COB|B||||||4
195.196.125|0|ML|5|178.20|330.00|1|1|3|||COB|COB|M||||||4
195.196.127|0|ML|5|178.20|330.00|1|1|3|||CHO|CHO|B||||||4
195.196.129|0|ML|5|178.20|330.00|1|1|3|||CHO|CHO|M||||||4
195.196.131|0|ML|5|178.20|330.00|1|1|3|||VAG|VAG|B||||||4
195.196.133|0|ML|5|178.20|330.00|1|1|3|||VAG|VAG|M||||||4
195.196.135|0|ML|5|178.20|330.00|1|1|3|||AZE|AZE|B||||||4
195.196.137|0|ML|5|178.20|330.00|1|1|3|||AZE|AZE|M||||||4
195.196.139|0|ML|5|178.20|330.00|1|1|3|||AMA|AMA|B||||||4
195.196.141|0|ML|5|178.20|330.00|1|1|3|||AMA|AMA|M||||||4
195.196.143|0|ML|5|178.20|330.00|1|1|3|||AES|AES|B||||||4
195.196.145|0|ML|5|178.20|330.00|1|1|3|||AES|AES|M||||||4
195.196.147|0|ML|5|178.20|330.00|1|1|3|||PRA|PRA|B||||||4
195.196.149|0|ML|5|178.20|330.00|1|1|3|||PRA|PRA|M||||||4
195.196.151|0|ML|5|178.20|330.00|1|1|3|||ROS|ROS|B||||||4
195.196.153|0|ML|5|178.20|330.00|1|1|3|||ROS|ROS|M||||||4
195.196.155|0|ML|5|178.20|330.00|1|1|3|||VER|VER|B||||||4
195.196.157|0|ML|5|178.20|330.00|1|1|3|||VER|VER|M||||||4
195.196.165|0|ML|5|178.20|330.00|1|1|3|||AZB|AZB|||||||4
195.196.167|0|ML|5|178.20|330.00|1|1|3|||DEN|DEN|||||||4
195.196.169|0|ML|5|178.20|330.00|1|1|3|||BLK|BLK|||||||4
195.196.171|0|ML|5|178.20|330.00|1|1|3|||ART|ART|||||||4
195.196.173|0|ML|5|178.20|330.00|1|1|3|||LIN|LIN|||||||4
195.196.175|0|ML|5|178.20|330.00|1|1|3|||HAL|HAL|||||||4
195.196.241|0|ML|6|124.20|230.00|1|1|3|||TBL|TBL|||||||4
195.196.242|0|ML|6|124.20|230.00|1|1|3|||TEA|TEA|||||||4
195.196.243|0|ML|6|124.20|230.00|1|1|3|||OAK|OAK|||||||4
195.196.244|0|ML|6|124.20|230.00|1|1|3|||JOP|JOP|||||||4
195.196.245|0|ML|6|151.20|280.00|1|1|3|||TBL|BCO|B||||||4
195.196.246|0|ML|6|151.20|280.00|1|1|3|||TBL|BCO|M||||||4
195.196.247|0|ML|6|151.20|280.00|1|1|3|||TBL|CCL|B||||||4
195.196.248|0|ML|6|151.20|280.00|1|1|3|||TBL|CCL|M||||||4
195.196.249|0|ML|6|151.20|280.00|1|1|3|||TBL|CME|B||||||4
195.196.250|0|ML|6|151.20|280.00|1|1|3|||TBL|CME|M||||||4
195.196.251|0|ML|6|151.20|280.00|1|1|3|||TBL|ANT|B||||||4
195.196.252|0|ML|6|151.20|280.00|1|1|3|||TBL|ANT|M||||||4
195.196.253|0|ML|6|151.20|280.00|1|1|3|||TBL|PTO|B||||||4
195.196.254|0|ML|6|151.20|280.00|1|1|3|||TBL|PTO|M||||||4
195.196.255|0|ML|6|151.20|280.00|1|1|3|||TBL|CRE|B||||||4
195.196.256|0|ML|6|151.20|280.00|1|1|3|||TBL|CRE|M||||||4
195.196.257|0|ML|6|151.20|280.00|1|1|3|||TBL|CAM|B||||||4
195.196.258|0|ML|6|151.20|280.00|1|1|3|||TBL|CAM|M||||||4
195.196.259|0|ML|6|151.20|280.00|1|1|3|||TBL|OUR|B||||||4
195.196.260|0|ML|6|151.20|280.00|1|1|3|||TBL|OUR|M||||||4
195.196.261|0|ML|6|151.20|280.00|1|1|3|||TBL|COB|B||||||4
195.196.262|0|ML|6|151.20|280.00|1|1|3|||TBL|COB|M||||||4
195.196.263|0|ML|6|151.20|280.00|1|1|3|||TBL|CHO|B||||||4
195.196.264|0|ML|6|151.20|280.00|1|1|3|||TBL|CHO|M||||||4
195.196.265|0|ML|6|151.20|280.00|1|1|3|||TBL|VAG|B||||||4
195.196.266|0|ML|6|151.20|280.00|1|1|3|||TBL|VAG|M||||||4
195.196.267|0|ML|6|151.20|280.00|1|1|3|||TBL|AZE|B||||||4
195.196.268|0|ML|6|151.20|280.00|1|1|3|||TBL|AZE|M||||||4
195.196.269|0|ML|6|151.20|280.00|1|1|3|||TBL|AMA|B||||||4
195.196.270|0|ML|6|151.20|280.00|1|1|3|||TBL|AMA|M||||||4
195.196.271|0|ML|6|151.20|280.00|1|1|3|||TBL|AES|B||||||4
195.196.272|0|ML|6|151.20|280.00|1|1|3|||TBL|AES|M||||||4
195.196.273|0|ML|6|151.20|280.00|1|1|3|||TBL|PRA|B||||||4
195.196.274|0|ML|6|151.20|280.00|1|1|3|||TBL|PRA|M||||||4
195.196.275|0|ML|6|151.20|280.00|1|1|3|||TBL|ROS|B||||||4
195.196.276|0|ML|6|151.20|280.00|1|1|3|||TBL|ROS|M||||||4
195.196.277|0|ML|6|151.20|280.00|1|1|3|||TBL|VER|B||||||4
195.196.278|0|ML|6|151.20|280.00|1|1|3|||TBL|VER|M||||||4
195.196.279|0|ML|6|151.20|280.00|1|1|3|||TBL|AZB|||||||4
195.196.280|0|ML|6|151.20|280.00|1|1|3|||TBL|DEN|||||||4
195.196.281|0|ML|6|151.20|280.00|1|1|3|||TBL|BLK|||||||4
195.196.282|0|ML|6|151.20|280.00|1|1|3|||TBL|ART|||||||4
195.196.283|0|ML|6|151.20|280.00|1|1|3|||TBL|LIN|||||||4
195.196.284|0|ML|6|151.20|280.00|1|1|3|||TBL|HAL|||||||4
195.196.285|0|ML|6|172.80|320.00|1|1|3|||BCO|BCO|B||||||4
195.196.286|0|ML|6|172.80|320.00|1|1|3|||BCO|BCO|M||||||4
195.196.287|0|ML|6|172.80|320.00|1|1|3|||CCL|CCL|B||||||4
195.196.288|0|ML|6|172.80|320.00|1|1|3|||CCL|CCL|M||||||4
195.196.289|0|ML|6|172.80|320.00|1|1|3|||CME|CME|B||||||4
195.196.290|0|ML|6|172.80|320.00|1|1|3|||CME|CME|M||||||4
195.196.291|0|ML|6|172.80|320.00|1|1|3|||ANT|ANT|B||||||4
195.196.292|0|ML|6|172.80|320.00|1|1|3|||ANT|ANT|M||||||4
195.196.293|0|ML|6|172.80|320.00|1|1|3|||PTO|PTO|B||||||4
195.196.294|0|ML|6|172.80|320.00|1|1|3|||PTO|PTO|M||||||4
195.196.295|0|ML|6|172.80|320.00|1|1|3|||CRE|CRE|B||||||4
195.196.296|0|ML|6|172.80|320.00|1|1|3|||CRE|CRE|M||||||4
195.196.297|0|ML|6|172.80|320.00|1|1|3|||CAM|CAM|B||||||4
195.196.298|0|ML|6|172.80|320.00|1|1|3|||CAM|CAM|M||||||4
195.196.299|0|ML|6|172.80|320.00|1|1|3|||OUR|OUR|B||||||4
195.196.300|0|ML|6|172.80|320.00|1|1|3|||OUR|OUR|M||||||4
195.196.301|0|ML|6|172.80|320.00|1|1|3|||COB|COB|B||||||4
195.196.302|0|ML|6|172.80|320.00|1|1|3|||COB|COB|M||||||4
195.196.303|0|ML|6|172.80|320.00|1|1|3|||CHO|CHO|B||||||4
195.196.304|0|ML|6|172.80|320.00|1|1|3|||CHO|CHO|M||||||4
195.196.305|0|ML|6|172.80|320.00|1|1|3|||VAG|VAG|B||||||4
195.196.306|0|ML|6|172.80|320.00|1|1|3|||VAG|VAG|M||||||4
195.196.307|0|ML|6|172.80|320.00|1|1|3|||AZE|AZE|B||||||4
195.196.308|0|ML|6|172.80|320.00|1|1|3|||AZE|AZE|M||||||4
195.196.309|0|ML|6|172.80|320.00|1|1|3|||AMA|AMA|B||||||4
195.196.310|0|ML|6|172.80|320.00|1|1|3|||AMA|AMA|M||||||4
195.196.311|0|ML|6|172.80|320.00|1|1|3|||AES|AES|B||||||4
195.196.312|0|ML|6|172.80|320.00|1|1|3|||AES|AES|M||||||4
195.196.313|0|ML|6|172.80|320.00|1|1|3|||PRA|PRA|B||||||4
195.196.314|0|ML|6|172.80|320.00|1|1|3|||PRA|PRA|M||||||4
195.196.315|0|ML|6|172.80|320.00|1|1|3|||ROS|ROS|B||||||4
195.196.316|0|ML|6|172.80|320.00|1|1|3|||ROS|ROS|M||||||4
195.196.317|0|ML|6|172.80|320.00|1|1|3|||VER|VER|B||||||4
195.196.318|0|ML|6|172.80|320.00|1|1|3|||VER|VER|M||||||4
195.196.319|0|ML|6|172.80|320.00|1|1|3|||AZB|AZB|||||||4
195.196.320|0|ML|6|172.80|320.00|1|1|3|||DEN|DEN|||||||4
195.196.321|0|ML|6|172.80|320.00|1|1|3|||BLK|BLK|||||||4
195.196.322|0|ML|6|172.80|320.00|1|1|3|||ART|ART|||||||4
195.196.323|0|ML|6|172.80|320.00|1|1|3|||LIN|LIN|||||||4
195.196.324|0|ML|6|172.80|320.00|1|1|3|||HAL|HAL|||||||4
325.196.197|0|ML|5|135.00|250.00|1|1|3|||TBL|TBL|||||||5
325.196.198|0|ML|5|135.00|250.00|1|1|3|||TEA|TEA|||||||5
325.196.199|0|ML|5|135.00|250.00|1|1|3|||OAK|OAK|||||||5
325.196.200|0|ML|5|135.00|250.00|1|1|3|||JOP|JOP|||||||5
325.196.201|0|ML|5|162.00|300.00|1|1|3|||TBL|BCO|B||||||5
325.196.202|0|ML|5|162.00|300.00|1|1|3|||TBL|BCO|M||||||5
325.196.203|0|ML|5|162.00|300.00|1|1|3|||TBL|CCL|B||||||5
325.196.204|0|ML|5|162.00|300.00|1|1|3|||TBL|CCL|M||||||5
325.196.205|0|ML|5|162.00|300.00|1|1|3|||TBL|CME|B||||||5
325.196.206|0|ML|5|162.00|300.00|1|1|3|||TBL|CME|M||||||5
325.196.207|0|ML|5|162.00|300.00|1|1|3|||TBL|ANT|B||||||5
325.196.208|0|ML|5|162.00|300.00|1|1|3|||TBL|ANT|M||||||5
325.196.209|0|ML|5|162.00|300.00|1|1|3|||TBL|PTO|B||||||5
325.196.210|0|ML|5|162.00|300.00|1|1|3|||TBL|PTO|M||||||5
325.196.211|0|ML|5|162.00|300.00|1|1|3|||TBL|CRE|B||||||5
325.196.212|0|ML|5|162.00|300.00|1|1|3|||TBL|CRE|M||||||5
325.196.213|0|ML|5|162.00|300.00|1|1|3|||TBL|CAM|B||||||5
325.196.214|0|ML|5|162.00|300.00|1|1|3|||TBL|CAM|M||||||5
325.196.215|0|ML|5|162.00|300.00|1|1|3|||TBL|OUR|B||||||5
325.196.216|0|ML|5|162.00|300.00|1|1|3|||TBL|OUR|M||||||5
325.196.217|0|ML|5|162.00|300.00|1|1|3|||TBL|COB|B||||||5
325.196.218|0|ML|5|162.00|300.00|1|1|3|||TBL|COB|M||||||5
325.196.219|0|ML|5|162.00|300.00|1|1|3|||TBL|CHO|B||||||5
325.196.220|0|ML|5|162.00|300.00|1|1|3|||TBL|CHO|M||||||5
325.196.221|0|ML|5|162.00|300.00|1|1|3|||TBL|VAG|B||||||5
325.196.222|0|ML|5|162.00|300.00|1|1|3|||TBL|VAG|M||||||5
325.196.223|0|ML|5|162.00|300.00|1|1|3|||TBL|AZE|B||||||5
325.196.224|0|ML|5|162.00|300.00|1|1|3|||TBL|AZE|M||||||5
325.196.225|0|ML|5|162.00|300.00|1|1|3|||TBL|AMA|B||||||5
325.196.226|0|ML|5|162.00|300.00|1|1|3|||TBL|AMA|M||||||5
325.196.227|0|ML|5|162.00|300.00|1|1|3|||TBL|AES|B||||||5
325.196.228|0|ML|5|162.00|300.00|1|1|3|||TBL|AES|M||||||5
325.196.229|0|ML|5|162.00|300.00|1|1|3|||TBL|PRA|B||||||5
325.196.230|0|ML|5|162.00|300.00|1|1|3|||TBL|PRA|M||||||5
325.196.231|0|ML|5|162.00|300.00|1|1|3|||TBL|ROS|B||||||5
325.196.232|0|ML|5|162.00|300.00|1|1|3|||TBL|ROS|M||||||5
325.196.233|0|ML|5|162.00|300.00|1|1|3|||TBL|VER|B||||||5
325.196.234|0|ML|5|162.00|300.00|1|1|3|||TBL|VER|M||||||5
325.196.235|0|ML|5|162.00|300.00|1|1|3|||TBL|AZB|||||||5
325.196.236|0|ML|5|162.00|300.00|1|1|3|||TBL|DEN|||||||5
325.196.237|0|ML|5|162.00|300.00|1|1|3|||TBL|BLK|||||||5
325.196.238|0|ML|5|162.00|300.00|1|1|3|||TBL|ART|||||||5
325.196.239|0|ML|5|162.00|300.00|1|1|3|||TBL|LIN|||||||5
325.196.240|0|ML|5|162.00|300.00|1|1|3|||TBL|HAL|||||||5
325.196.91|0|ML|5|183.60|340.00|1|1|3|||BCO|BCO|B||||||5
325.196.93|0|ML|5|183.60|340.00|1|1|3|||BCO|BCO|M||||||5
325.196.95|0|ML|5|183.60|340.00|1|1|3|||CCL|CCL|B||||||5
325.196.97|0|ML|5|183.60|340.00|1|1|3|||CCL|CCL|M||||||5
325.196.99|0|ML|5|183.60|340.00|1|1|3|||CME|CME|B||||||5
325.196.101|0|ML|5|183.60|340.00|1|1|3|||CME|CME|M||||||5
325.196.103|0|ML|5|183.60|340.00|1|1|3|||ANT|ANT|B||||||5
325.196.105|0|ML|5|183.60|340.00|1|1|3|||ANT|ANT|M||||||5
325.196.107|0|ML|5|183.60|340.00|1|1|3|||PTO|PTO|B||||||5
325.196.109|0|ML|5|183.60|340.00|1|1|3|||PTO|PTO|M||||||5
325.196.111|0|ML|5|183.60|340.00|1|1|3|||CRE|CRE|B||||||5
325.196.113|0|ML|5|183.60|340.00|1|1|3|||CRE|CRE|M||||||5
325.196.115|0|ML|5|183.60|340.00|1|1|3|||CAM|CAM|B||||||5
325.196.117|0|ML|5|183.60|340.00|1|1|3|||CAM|CAM|M||||||5
325.196.119|0|ML|5|183.60|340.00|1|1|3|||OUR|OUR|B||||||5
325.196.121|0|ML|5|183.60|340.00|1|1|3|||OUR|OUR|M||||||5
325.196.123|0|ML|5|183.60|340.00|1|1|3|||COB|COB|B||||||5
325.196.125|0|ML|5|183.60|340.00|1|1|3|||COB|COB|M||||||5
325.196.127|0|ML|5|183.60|340.00|1|1|3|||CHO|CHO|B||||||5
325.196.129|0|ML|5|183.60|340.00|1|1|3|||CHO|CHO|M||||||5
325.196.131|0|ML|5|183.60|340.00|1|1|3|||VAG|VAG|B||||||5
325.196.133|0|ML|5|183.60|340.00|1|1|3|||VAG|VAG|M||||||5
325.196.135|0|ML|5|183.60|340.00|1|1|3|||AZE|AZE|B||||||5
325.196.137|0|ML|5|183.60|340.00|1|1|3|||AZE|AZE|M||||||5
325.196.139|0|ML|5|183.60|340.00|1|1|3|||AMA|AMA|B||||||5
325.196.141|0|ML|5|183.60|340.00|1|1|3|||AMA|AMA|M||||||5
325.196.143|0|ML|5|183.60|340.00|1|1|3|||AES|AES|B||||||5
325.196.145|0|ML|5|183.60|340.00|1|1|3|||AES|AES|M||||||5
325.196.147|0|ML|5|183.60|340.00|1|1|3|||PRA|PRA|B||||||5
325.196.149|0|ML|5|183.60|340.00|1|1|3|||PRA|PRA|M||||||5
325.196.151|0|ML|5|183.60|340.00|1|1|3|||ROS|ROS|B||||||5
325.196.153|0|ML|5|183.60|340.00|1|1|3|||ROS|ROS|M||||||5
325.196.155|0|ML|5|183.60|340.00|1|1|3|||VER|VER|B||||||5
325.196.157|0|ML|5|183.60|340.00|1|1|3|||VER|VER|M||||||5
325.196.165|0|ML|5|183.60|340.00|1|1|3|||AZB|AZB|||||||5
325.196.167|0|ML|5|183.60|340.00|1|1|3|||DEN|DEN|||||||5
325.196.169|0|ML|5|183.60|340.00|1|1|3|||BLK|BLK|||||||5
325.196.171|0|ML|5|183.60|340.00|1|1|3|||ART|ART|||||||5
325.196.173|0|ML|5|183.60|340.00|1|1|3|||LIN|LIN|||||||5
325.196.175|0|ML|5|183.60|340.00|1|1|3|||HAL|HAL|||||||5
325.196.241|0|ML|6|129.60|240.00|1|1|3|||TBL|TBL|||||||5
325.196.242|0|ML|6|129.60|240.00|1|1|3|||TEA|TEA|||||||5
325.196.243|0|ML|6|129.60|240.00|1|1|3|||OAK|OAK|||||||5
325.196.244|0|ML|6|129.60|240.00|1|1|3|||JOP|JOP|||||||5
325.196.245|0|ML|6|156.60|290.00|1|1|3|||TBL|BCO|B||||||5
325.196.246|0|ML|6|156.60|290.00|1|1|3|||TBL|BCO|M||||||5
325.196.247|0|ML|6|156.60|290.00|1|1|3|||TBL|CCL|B||||||5
325.196.248|0|ML|6|156.60|290.00|1|1|3|||TBL|CCL|M||||||5
325.196.249|0|ML|6|156.60|290.00|1|1|3|||TBL|CME|B||||||5
325.196.250|0|ML|6|156.60|290.00|1|1|3|||TBL|CME|M||||||5
325.196.251|0|ML|6|156.60|290.00|1|1|3|||TBL|ANT|B||||||5
325.196.252|0|ML|6|156.60|290.00|1|1|3|||TBL|ANT|M||||||5
325.196.253|0|ML|6|156.60|290.00|1|1|3|||TBL|PTO|B||||||5
325.196.254|0|ML|6|156.60|290.00|1|1|3|||TBL|PTO|M||||||5
325.196.255|0|ML|6|156.60|290.00|1|1|3|||TBL|CRE|B||||||5
325.196.256|0|ML|6|156.60|290.00|1|1|3|||TBL|CRE|M||||||5
325.196.257|0|ML|6|156.60|290.00|1|1|3|||TBL|CAM|B||||||5
325.196.258|0|ML|6|156.60|290.00|1|1|3|||TBL|CAM|M||||||5
325.196.259|0|ML|6|156.60|290.00|1|1|3|||TBL|OUR|B||||||5
325.196.260|0|ML|6|156.60|290.00|1|1|3|||TBL|OUR|M||||||5
325.196.261|0|ML|6|156.60|290.00|1|1|3|||TBL|COB|B||||||5
325.196.262|0|ML|6|156.60|290.00|1|1|3|||TBL|COB|M||||||5
325.196.263|0|ML|6|156.60|290.00|1|1|3|||TBL|CHO|B||||||5
325.196.264|0|ML|6|156.60|290.00|1|1|3|||TBL|CHO|M||||||5
325.196.265|0|ML|6|156.60|290.00|1|1|3|||TBL|VAG|B||||||5
325.196.266|0|ML|6|156.60|290.00|1|1|3|||TBL|VAG|M||||||5
325.196.267|0|ML|6|156.60|290.00|1|1|3|||TBL|AZE|B||||||5
325.196.268|0|ML|6|156.60|290.00|1|1|3|||TBL|AZE|M||||||5
325.196.269|0|ML|6|156.60|290.00|1|1|3|||TBL|AMA|B||||||5
325.196.270|0|ML|6|156.60|290.00|1|1|3|||TBL|AMA|M||||||5
325.196.271|0|ML|6|156.60|290.00|1|1|3|||TBL|AES|B||||||5
325.196.272|0|ML|6|156.60|290.00|1|1|3|||TBL|AES|M||||||5
325.196.273|0|ML|6|156.60|290.00|1|1|3|||TBL|PRA|B||||||5
325.196.274|0|ML|6|156.60|290.00|1|1|3|||TBL|PRA|M||||||5
325.196.275|0|ML|6|156.60|290.00|1|1|3|||TBL|ROS|B||||||5
325.196.276|0|ML|6|156.60|290.00|1|1|3|||TBL|ROS|M||||||5
325.196.277|0|ML|6|156.60|290.00|1|1|3|||TBL|VER|B||||||5
325.196.278|0|ML|6|156.60|290.00|1|1|3|||TBL|VER|M||||||5
325.196.279|0|ML|6|156.60|290.00|1|1|3|||TBL|AZB|||||||5
325.196.280|0|ML|6|156.60|290.00|1|1|3|||TBL|DEN|||||||5
325.196.281|0|ML|6|156.60|290.00|1|1|3|||TBL|BLK|||||||5
325.196.282|0|ML|6|156.60|290.00|1|1|3|||TBL|ART|||||||5
325.196.283|0|ML|6|156.60|290.00|1|1|3|||TBL|LIN|||||||5
325.196.284|0|ML|6|156.60|290.00|1|1|3|||TBL|HAL|||||||5
325.196.285|0|ML|6|178.20|330.00|1|1|3|||BCO|BCO|B||||||5
325.196.286|0|ML|6|178.20|330.00|1|1|3|||BCO|BCO|M||||||5
325.196.287|0|ML|6|178.20|330.00|1|1|3|||CCL|CCL|B||||||5
325.196.288|0|ML|6|178.20|330.00|1|1|3|||CCL|CCL|M||||||5
325.196.289|0|ML|6|178.20|330.00|1|1|3|||CME|CME|B||||||5
325.196.290|0|ML|6|178.20|330.00|1|1|3|||CME|CME|M||||||5
325.196.291|0|ML|6|178.20|330.00|1|1|3|||ANT|ANT|B||||||5
325.196.292|0|ML|6|178.20|330.00|1|1|3|||ANT|ANT|M||||||5
325.196.293|0|ML|6|178.20|330.00|1|1|3|||PTO|PTO|B||||||5
325.196.294|0|ML|6|178.20|330.00|1|1|3|||PTO|PTO|M||||||5
325.196.295|0|ML|6|178.20|330.00|1|1|3|||CRE|CRE|B||||||5
325.196.296|0|ML|6|178.20|330.00|1|1|3|||CRE|CRE|M||||||5
325.196.297|0|ML|6|178.20|330.00|1|1|3|||CAM|CAM|B||||||5
325.196.298|0|ML|6|178.20|330.00|1|1|3|||CAM|CAM|M||||||5
325.196.299|0|ML|6|178.20|330.00|1|1|3|||OUR|OUR|B||||||5
325.196.300|0|ML|6|178.20|330.00|1|1|3|||OUR|OUR|M||||||5
325.196.301|0|ML|6|178.20|330.00|1|1|3|||COB|COB|B||||||5
325.196.302|0|ML|6|178.20|330.00|1|1|3|||COB|COB|M||||||5
325.196.303|0|ML|6|178.20|330.00|1|1|3|||CHO|CHO|B||||||5
325.196.304|0|ML|6|178.20|330.00|1|1|3|||CHO|CHO|M||||||5
325.196.305|0|ML|6|178.20|330.00|1|1|3|||VAG|VAG|B||||||5
325.196.306|0|ML|6|178.20|330.00|1|1|3|||VAG|VAG|M||||||5
325.196.307|0|ML|6|178.20|330.00|1|1|3|||AZE|AZE|B||||||5
325.196.308|0|ML|6|178.20|330.00|1|1|3|||AZE|AZE|M||||||5
325.196.309|0|ML|6|178.20|330.00|1|1|3|||AMA|AMA|B||||||5
325.196.310|0|ML|6|178.20|330.00|1|1|3|||AMA|AMA|M||||||5
325.196.311|0|ML|6|178.20|330.00|1|1|3|||AES|AES|B||||||5
325.196.312|0|ML|6|178.20|330.00|1|1|3|||AES|AES|M||||||5
325.196.313|0|ML|6|178.20|330.00|1|1|3|||PRA|PRA|B||||||5
325.196.314|0|ML|6|178.20|330.00|1|1|3|||PRA|PRA|M||||||5
325.196.315|0|ML|6|178.20|330.00|1|1|3|||ROS|ROS|B||||||5
325.196.316|0|ML|6|178.20|330.00|1|1|3|||ROS|ROS|M||||||5
325.196.317|0|ML|6|178.20|330.00|1|1|3|||VER|VER|B||||||5
325.196.318|0|ML|6|178.20|330.00|1|1|3|||VER|VER|M||||||5
325.196.319|0|ML|6|178.20|330.00|1|1|3|||AZB|AZB|||||||5
325.196.320|0|ML|6|178.20|330.00|1|1|3|||DEN|DEN|||||||5
325.196.321|0|ML|6|178.20|330.00|1|1|3|||BLK|BLK|||||||5
325.196.322|0|ML|6|178.20|330.00|1|1|3|||ART|ART|||||||5
325.196.323|0|ML|6|178.20|330.00|1|1|3|||LIN|LIN|||||||5
325.196.324|0|ML|6|178.20|330.00|1|1|3|||HAL|HAL|||||||5
326.196.197|0|ML|5|140.40|260.00|1|1|3|||TBL|TBL|||||||1
326.196.198|0|ML|5|140.40|260.00|1|1|3|||TEA|TEA|||||||1
326.196.199|0|ML|5|140.40|260.00|1|1|3|||OAK|OAK|||||||1
326.196.200|0|ML|5|140.40|260.00|1|1|3|||JOP|JOP|||||||1
326.196.201|0|ML|5|167.40|310.00|1|1|3|||TBL|BCO|B||||||1
326.196.202|0|ML|5|167.40|310.00|1|1|3|||TBL|BCO|M||||||1
326.196.203|0|ML|5|167.40|310.00|1|1|3|||TBL|CCL|B||||||1
326.196.204|0|ML|5|167.40|310.00|1|1|3|||TBL|CCL|M||||||1
326.196.205|0|ML|5|167.40|310.00|1|1|3|||TBL|CME|B||||||1
326.196.206|0|ML|5|167.40|310.00|1|1|3|||TBL|CME|M||||||1
326.196.207|0|ML|5|167.40|310.00|1|1|3|||TBL|ANT|B||||||1
326.196.208|0|ML|5|167.40|310.00|1|1|3|||TBL|ANT|M||||||1
326.196.209|0|ML|5|167.40|310.00|1|1|3|||TBL|PTO|B||||||1
326.196.210|0|ML|5|167.40|310.00|1|1|3|||TBL|PTO|M||||||1
326.196.211|0|ML|5|167.40|310.00|1|1|3|||TBL|CRE|B||||||1
326.196.212|0|ML|5|167.40|310.00|1|1|3|||TBL|CRE|M||||||1
326.196.213|0|ML|5|167.40|310.00|1|1|3|||TBL|CAM|B||||||1
326.196.214|0|ML|5|167.40|310.00|1|1|3|||TBL|CAM|M||||||1
326.196.215|0|ML|5|167.40|310.00|1|1|3|||TBL|OUR|B||||||1
326.196.216|0|ML|5|167.40|310.00|1|1|3|||TBL|OUR|M||||||1
326.196.217|0|ML|5|167.40|310.00|1|1|3|||TBL|COB|B||||||1
326.196.218|0|ML|5|167.40|310.00|1|1|3|||TBL|COB|M||||||1
326.196.219|0|ML|5|167.40|310.00|1|1|3|||TBL|CHO|B||||||1
326.196.220|0|ML|5|167.40|310.00|1|1|3|||TBL|CHO|M||||||1
326.196.221|0|ML|5|167.40|310.00|1|1|3|||TBL|VAG|B||||||1
326.196.222|0|ML|5|167.40|310.00|1|1|3|||TBL|VAG|M||||||1
326.196.223|0|ML|5|167.40|310.00|1|1|3|||TBL|AZE|B||||||1
326.196.224|0|ML|5|167.40|310.00|1|1|3|||TBL|AZE|M||||||1
326.196.225|0|ML|5|167.40|310.00|1|1|3|||TBL|AMA|B||||||1
326.196.226|0|ML|5|167.40|310.00|1|1|3|||TBL|AMA|M||||||1
326.196.227|0|ML|5|167.40|310.00|1|1|3|||TBL|AES|B||||||1
326.196.228|0|ML|5|167.40|310.00|1|1|3|||TBL|AES|M||||||1
326.196.229|0|ML|5|167.40|310.00|1|1|3|||TBL|PRA|B||||||1
326.196.230|0|ML|5|167.40|310.00|1|1|3|||TBL|PRA|M||||||1
326.196.231|0|ML|5|167.40|310.00|1|1|3|||TBL|ROS|B||||||1
326.196.232|0|ML|5|167.40|310.00|1|1|3|||TBL|ROS|M||||||1
326.196.233|0|ML|5|167.40|310.00|1|1|3|||TBL|VER|B||||||1
326.196.234|0|ML|5|167.40|310.00|1|1|3|||TBL|VER|M||||||1
326.196.235|0|ML|5|167.40|310.00|1|1|3|||TBL|AZB|||||||1
326.196.236|0|ML|5|167.40|310.00|1|1|3|||TBL|DEN|||||||1
326.196.237|0|ML|5|167.40|310.00|1|1|3|||TBL|BLK|||||||1
326.196.238|0|ML|5|167.40|310.00|1|1|3|||TBL|ART|||||||1
326.196.239|0|ML|5|167.40|310.00|1|1|3|||TBL|LIN|||||||1
326.196.240|0|ML|5|167.40|310.00|1|1|3|||TBL|HAL|||||||1
326.196.91|0|ML|5|189.00|350.00|1|1|3|||BCO|BCO|B||||||1
326.196.93|0|ML|5|189.00|350.00|1|1|3|||BCO|BCO|M||||||1
326.196.95|0|ML|5|189.00|350.00|1|1|3|||CCL|CCL|B||||||1
326.196.97|0|ML|5|189.00|350.00|1|1|3|||CCL|CCL|M||||||1
326.196.99|0|ML|5|189.00|350.00|1|1|3|||CME|CME|B||||||1
326.196.101|0|ML|5|189.00|350.00|1|1|3|||CME|CME|M||||||1
326.196.103|0|ML|5|189.00|350.00|1|1|3|||ANT|ANT|B||||||1
326.196.105|0|ML|5|189.00|350.00|1|1|3|||ANT|ANT|M||||||1
326.196.107|0|ML|5|189.00|350.00|1|1|3|||PTO|PTO|B||||||1
326.196.109|0|ML|5|189.00|350.00|1|1|3|||PTO|PTO|M||||||1
326.196.111|0|ML|5|189.00|350.00|1|1|3|||CRE|CRE|B||||||1
326.196.113|0|ML|5|189.00|350.00|1|1|3|||CRE|CRE|M||||||1
326.196.115|0|ML|5|189.00|350.00|1|1|3|||CAM|CAM|B||||||1
326.196.117|0|ML|5|189.00|350.00|1|1|3|||CAM|CAM|M||||||1
326.196.119|0|ML|5|189.00|350.00|1|1|3|||OUR|OUR|B||||||1
326.196.121|0|ML|5|189.00|350.00|1|1|3|||OUR|OUR|M||||||1
326.196.123|0|ML|5|189.00|350.00|1|1|3|||COB|COB|B||||||1
326.196.125|0|ML|5|189.00|350.00|1|1|3|||COB|COB|M||||||1
326.196.127|0|ML|5|189.00|350.00|1|1|3|||CHO|CHO|B||||||1
326.196.129|0|ML|5|189.00|350.00|1|1|3|||CHO|CHO|M||||||1
326.196.131|0|ML|5|189.00|350.00|1|1|3|||VAG|VAG|B||||||1
326.196.133|0|ML|5|189.00|350.00|1|1|3|||VAG|VAG|M||||||1
326.196.135|0|ML|5|189.00|350.00|1|1|3|||AZE|AZE|B||||||1
326.196.137|0|ML|5|189.00|350.00|1|1|3|||AZE|AZE|M||||||1
326.196.139|0|ML|5|189.00|350.00|1|1|3|||AMA|AMA|B||||||1
326.196.141|0|ML|5|189.00|350.00|1|1|3|||AMA|AMA|M||||||1
326.196.143|0|ML|5|189.00|350.00|1|1|3|||AES|AES|B||||||1
326.196.145|0|ML|5|189.00|350.00|1|1|3|||AES|AES|M||||||1
326.196.147|0|ML|5|189.00|350.00|1|1|3|||PRA|PRA|B||||||1
326.196.149|0|ML|5|189.00|350.00|1|1|3|||PRA|PRA|M||||||1
326.196.151|0|ML|5|189.00|350.00|1|1|3|||ROS|ROS|B||||||1
326.196.153|0|ML|5|189.00|350.00|1|1|3|||ROS|ROS|M||||||1
326.196.155|0|ML|5|189.00|350.00|1|1|3|||VER|VER|B||||||1
326.196.157|0|ML|5|189.00|350.00|1|1|3|||VER|VER|M||||||1
326.196.165|0|ML|5|189.00|350.00|1|1|3|||AZB|AZB|||||||1
326.196.167|0|ML|5|189.00|350.00|1|1|3|||DEN|DEN|||||||1
326.196.169|0|ML|5|189.00|350.00|1|1|3|||BLK|BLK|||||||1
326.196.171|0|ML|5|189.00|350.00|1|1|3|||ART|ART|||||||1
326.196.173|0|ML|5|189.00|350.00|1|1|3|||LIN|LIN|||||||1
326.196.175|0|ML|5|189.00|350.00|1|1|3|||HAL|HAL|||||||1
326.196.241|0|ML|6|135.00|250.00|1|1|3|||TBL|TBL|||||||1
326.196.242|0|ML|6|135.00|250.00|1|1|3|||TEA|TEA|||||||1
326.196.243|0|ML|6|135.00|250.00|1|1|3|||OAK|OAK|||||||1
326.196.244|0|ML|6|135.00|250.00|1|1|3|||JOP|JOP|||||||1
326.196.245|0|ML|6|162.00|300.00|1|1|3|||TBL|BCO|B||||||1
326.196.246|0|ML|6|162.00|300.00|1|1|3|||TBL|BCO|M||||||1
326.196.247|0|ML|6|162.00|300.00|1|1|3|||TBL|CCL|B||||||1
326.196.248|0|ML|6|162.00|300.00|1|1|3|||TBL|CCL|M||||||1
326.196.249|0|ML|6|162.00|300.00|1|1|3|||TBL|CME|B||||||1
326.196.250|0|ML|6|162.00|300.00|1|1|3|||TBL|CME|M||||||1
326.196.251|0|ML|6|162.00|300.00|1|1|3|||TBL|ANT|B||||||1
326.196.252|0|ML|6|162.00|300.00|1|1|3|||TBL|ANT|M||||||1
326.196.253|0|ML|6|162.00|300.00|1|1|3|||TBL|PTO|B||||||1
326.196.254|0|ML|6|162.00|300.00|1|1|3|||TBL|PTO|M||||||1
326.196.255|0|ML|6|162.00|300.00|1|1|3|||TBL|CRE|B||||||1
326.196.256|0|ML|6|162.00|300.00|1|1|3|||TBL|CRE|M||||||1
326.196.257|0|ML|6|162.00|300.00|1|1|3|||TBL|CAM|B||||||1
326.196.258|0|ML|6|162.00|300.00|1|1|3|||TBL|CAM|M||||||1
326.196.259|0|ML|6|162.00|300.00|1|1|3|||TBL|OUR|B||||||1
326.196.260|0|ML|6|162.00|300.00|1|1|3|||TBL|OUR|M||||||1
326.196.261|0|ML|6|162.00|300.00|1|1|3|||TBL|COB|B||||||1
326.196.262|0|ML|6|162.00|300.00|1|1|3|||TBL|COB|M||||||1
326.196.263|0|ML|6|162.00|300.00|1|1|3|||TBL|CHO|B||||||1
326.196.264|0|ML|6|162.00|300.00|1|1|3|||TBL|CHO|M||||||1
326.196.265|0|ML|6|162.00|300.00|1|1|3|||TBL|VAG|B||||||1
326.196.266|0|ML|6|162.00|300.00|1|1|3|||TBL|VAG|M||||||1
326.196.267|0|ML|6|162.00|300.00|1|1|3|||TBL|AZE|B||||||1
326.196.268|0|ML|6|162.00|300.00|1|1|3|||TBL|AZE|M||||||1
326.196.269|0|ML|6|162.00|300.00|1|1|3|||TBL|AMA|B||||||1
326.196.270|0|ML|6|162.00|300.00|1|1|3|||TBL|AMA|M||||||1
326.196.271|0|ML|6|162.00|300.00|1|1|3|||TBL|AES|B||||||1
326.196.272|0|ML|6|162.00|300.00|1|1|3|||TBL|AES|M||||||1
326.196.273|0|ML|6|162.00|300.00|1|1|3|||TBL|PRA|B||||||1
326.196.274|0|ML|6|162.00|300.00|1|1|3|||TBL|PRA|M||||||1
326.196.275|0|ML|6|162.00|300.00|1|1|3|||TBL|ROS|B||||||1
326.196.276|0|ML|6|162.00|300.00|1|1|3|||TBL|ROS|M||||||1
326.196.277|0|ML|6|162.00|300.00|1|1|3|||TBL|VER|B||||||1
326.196.278|0|ML|6|162.00|300.00|1|1|3|||TBL|VER|M||||||1
326.196.279|0|ML|6|162.00|300.00|1|1|3|||TBL|AZB|||||||1
326.196.280|0|ML|6|162.00|300.00|1|1|3|||TBL|DEN|||||||1
326.196.281|0|ML|6|162.00|300.00|1|1|3|||TBL|BLK|||||||1
326.196.282|0|ML|6|162.00|300.00|1|1|3|||TBL|ART|||||||1
326.196.283|0|ML|6|162.00|300.00|1|1|3|||TBL|LIN|||||||1
326.196.284|0|ML|6|162.00|300.00|1|1|3|||TBL|HAL|||||||1
326.196.285|0|ML|6|183.60|340.00|1|1|3|||BCO|BCO|B||||||1
326.196.286|0|ML|6|183.60|340.00|1|1|3|||BCO|BCO|M||||||1
326.196.287|0|ML|6|183.60|340.00|1|1|3|||CCL|CCL|B||||||1
326.196.288|0|ML|6|183.60|340.00|1|1|3|||CCL|CCL|M||||||1
326.196.289|0|ML|6|183.60|340.00|1|1|3|||CME|CME|B||||||1
326.196.290|0|ML|6|183.60|340.00|1|1|3|||CME|CME|M||||||1
326.196.291|0|ML|6|183.60|340.00|1|1|3|||ANT|ANT|B||||||1
326.196.292|0|ML|6|183.60|340.00|1|1|3|||ANT|ANT|M||||||1
326.196.293|0|ML|6|183.60|340.00|1|1|3|||PTO|PTO|B||||||1
326.196.294|0|ML|6|183.60|340.00|1|1|3|||PTO|PTO|M||||||1
326.196.295|0|ML|6|183.60|340.00|1|1|3|||CRE|CRE|B||||||1
326.196.296|0|ML|6|183.60|340.00|1|1|3|||CRE|CRE|M||||||1
326.196.297|0|ML|6|183.60|340.00|1|1|3|||CAM|CAM|B||||||1
326.196.298|0|ML|6|183.60|340.00|1|1|3|||CAM|CAM|M||||||1
326.196.299|0|ML|6|183.60|340.00|1|1|3|||OUR|OUR|B||||||1
326.196.300|0|ML|6|183.60|340.00|1|1|3|||OUR|OUR|M||||||1
326.196.301|0|ML|6|183.60|340.00|1|1|3|||COB|COB|B||||||1
326.196.302|0|ML|6|183.60|340.00|1|1|3|||COB|COB|M||||||1
326.196.303|0|ML|6|183.60|340.00|1|1|3|||CHO|CHO|B||||||1
326.196.304|0|ML|6|183.60|340.00|1|1|3|||CHO|CHO|M||||||1
326.196.305|0|ML|6|183.60|340.00|1|1|3|||VAG|VAG|B||||||1
326.196.306|0|ML|6|183.60|340.00|1|1|3|||VAG|VAG|M||||||1
326.196.307|0|ML|6|183.60|340.00|1|1|3|||AZE|AZE|B||||||1
326.196.308|0|ML|6|183.60|340.00|1|1|3|||AZE|AZE|M||||||1
326.196.309|0|ML|6|183.60|340.00|1|1|3|||AMA|AMA|B||||||1
326.196.310|0|ML|6|183.60|340.00|1|1|3|||AMA|AMA|M||||||1
326.196.311|0|ML|6|183.60|340.00|1|1|3|||AES|AES|B||||||1
326.196.312|0|ML|6|183.60|340.00|1|1|3|||AES|AES|M||||||1
326.196.313|0|ML|6|183.60|340.00|1|1|3|||PRA|PRA|B||||||1
326.196.314|0|ML|6|183.60|340.00|1|1|3|||PRA|PRA|M||||||1
326.196.315|0|ML|6|183.60|340.00|1|1|3|||ROS|ROS|B||||||1
326.196.316|0|ML|6|183.60|340.00|1|1|3|||ROS|ROS|M||||||1
326.196.317|0|ML|6|183.60|340.00|1|1|3|||VER|VER|B||||||1
326.196.318|0|ML|6|183.60|340.00|1|1|3|||VER|VER|M||||||1
326.196.319|0|ML|6|183.60|340.00|1|1|3|||AZB|AZB|||||||1
326.196.320|0|ML|6|183.60|340.00|1|1|3|||DEN|DEN|||||||1
326.196.321|0|ML|6|183.60|340.00|1|1|3|||BLK|BLK|||||||1
326.196.322|0|ML|6|183.60|340.00|1|1|3|||ART|ART|||||||1
326.196.323|0|ML|6|183.60|340.00|1|1|3|||LIN|LIN|||||||1
326.196.324|0|ML|6|183.60|340.00|1|1|3|||HAL|HAL|||||||1
326.196.327|0|ML|7|264.60|490.00|1|1|3|||TBL|TBL|||||||1
326.196.328|0|ML|7|264.60|490.00|1|1|3|||TEA|TEA|||||||1
326.196.329|0|ML|7|264.60|490.00|1|1|3|||OAK|OAK|||||||1
326.196.330|0|ML|7|264.60|490.00|1|1|3|||JOP|JOP|||||||1
326.196.331|0|ML|7|291.60|540.00|1|1|3|||TBL|BCO|B||||||1
326.196.332|0|ML|7|291.60|540.00|1|1|3|||TBL|BCO|M||||||1
326.196.333|0|ML|7|291.60|540.00|1|1|3|||TBL|CCL|B||||||1
326.196.334|0|ML|7|291.60|540.00|1|1|3|||TBL|CCL|M||||||1
326.196.335|0|ML|7|291.60|540.00|1|1|3|||TBL|CME|B||||||1
326.196.336|0|ML|7|291.60|540.00|1|1|3|||TBL|CME|M||||||1
326.196.337|0|ML|7|291.60|540.00|1|1|3|||TBL|ANT|B||||||1
326.196.338|0|ML|7|291.60|540.00|1|1|3|||TBL|ANT|M||||||1
326.196.339|0|ML|7|291.60|540.00|1|1|3|||TBL|PTO|B||||||1
326.196.340|0|ML|7|291.60|540.00|1|1|3|||TBL|PTO|M||||||1
326.196.341|0|ML|7|291.60|540.00|1|1|3|||TBL|CRE|B||||||1
326.196.342|0|ML|7|291.60|540.00|1|1|3|||TBL|CRE|M||||||1
326.196.343|0|ML|7|291.60|540.00|1|1|3|||TBL|CAM|B||||||1
326.196.344|0|ML|7|291.60|540.00|1|1|3|||TBL|CAM|M||||||1
326.196.345|0|ML|7|291.60|540.00|1|1|3|||TBL|OUR|B||||||1
326.196.346|0|ML|7|291.60|540.00|1|1|3|||TBL|OUR|M||||||1
326.196.347|0|ML|7|291.60|540.00|1|1|3|||TBL|COB|B||||||1
326.196.348|0|ML|7|291.60|540.00|1|1|3|||TBL|COB|M||||||1
326.196.349|0|ML|7|291.60|540.00|1|1|3|||TBL|CHO|B||||||1
326.196.350|0|ML|7|291.60|540.00|1|1|3|||TBL|CHO|M||||||1
326.196.351|0|ML|7|291.60|540.00|1|1|3|||TBL|VAG|B||||||1
326.196.352|0|ML|7|291.60|540.00|1|1|3|||TBL|VAG|M||||||1
326.196.353|0|ML|7|291.60|540.00|1|1|3|||TBL|AZE|B||||||1
326.196.354|0|ML|7|291.60|540.00|1|1|3|||TBL|AZE|M||||||1
326.196.355|0|ML|7|291.60|540.00|1|1|3|||TBL|AMA|B||||||1
326.196.356|0|ML|7|291.60|540.00|1|1|3|||TBL|AMA|M||||||1
326.196.357|0|ML|7|291.60|540.00|1|1|3|||TBL|AES|B||||||1
326.196.358|0|ML|7|291.60|540.00|1|1|3|||TBL|AES|M||||||1
326.196.359|0|ML|7|291.60|540.00|1|1|3|||TBL|PRA|B||||||1
326.196.360|0|ML|7|291.60|540.00|1|1|3|||TBL|PRA|M||||||1
326.196.361|0|ML|7|291.60|540.00|1|1|3|||TBL|ROS|B||||||1
326.196.362|0|ML|7|291.60|540.00|1|1|3|||TBL|ROS|M||||||1
326.196.363|0|ML|7|291.60|540.00|1|1|3|||TBL|VER|B||||||1
326.196.364|0|ML|7|291.60|540.00|1|1|3|||TBL|VER|M||||||1
326.196.365|0|ML|7|291.60|540.00|1|1|3|||TBL|AZB|||||||1
326.196.366|0|ML|7|291.60|540.00|1|1|3|||TBL|DEN|||||||1
326.196.367|0|ML|7|291.60|540.00|1|1|3|||TBL|BLK|||||||1
326.196.368|0|ML|7|291.60|540.00|1|1|3|||TBL|ART|||||||1
326.196.369|0|ML|7|291.60|540.00|1|1|3|||TBL|LIN|||||||1
326.196.370|0|ML|7|291.60|540.00|1|1|3|||TBL|HAL|||||||1
326.196.92|0|ML|7|313.20|580.00|1|1|3|||BCO|BCO|B||||||1
326.196.94|0|ML|7|313.20|580.00|1|1|3|||BCO|BCO|M||||||1
326.196.96|0|ML|7|313.20|580.00|1|1|3|||CCL|CCL|B||||||1
326.196.98|0|ML|7|313.20|580.00|1|1|3|||CCL|CCL|M||||||1
326.196.100|0|ML|7|313.20|580.00|1|1|3|||CME|CME|B||||||1
326.196.102|0|ML|7|313.20|580.00|1|1|3|||CME|CME|M||||||1
326.196.104|0|ML|7|313.20|580.00|1|1|3|||ANT|ANT|B||||||1
326.196.106|0|ML|7|313.20|580.00|1|1|3|||ANT|ANT|M||||||1
326.196.108|0|ML|7|313.20|580.00|1|1|3|||PTO|PTO|B||||||1
326.196.110|0|ML|7|313.20|580.00|1|1|3|||PTO|PTO|M||||||1
326.196.112|0|ML|7|313.20|580.00|1|1|3|||CRE|CRE|B||||||1
326.196.114|0|ML|7|313.20|580.00|1|1|3|||CRE|CRE|M||||||1
326.196.116|0|ML|7|313.20|580.00|1|1|3|||CAM|CAM|B||||||1
326.196.118|0|ML|7|313.20|580.00|1|1|3|||CAM|CAM|M||||||1
326.196.120|0|ML|7|313.20|580.00|1|1|3|||OUR|OUR|B||||||1
326.196.122|0|ML|7|313.20|580.00|1|1|3|||OUR|OUR|M||||||1
326.196.124|0|ML|7|313.20|580.00|1|1|3|||COB|COB|B||||||1
326.196.126|0|ML|7|313.20|580.00|1|1|3|||COB|COB|M||||||1
326.196.128|0|ML|7|313.20|580.00|1|1|3|||CHO|CHO|B||||||1
326.196.130|0|ML|7|313.20|580.00|1|1|3|||CHO|CHO|M||||||1
326.196.132|0|ML|7|313.20|580.00|1|1|3|||VAG|VAG|B||||||1
326.196.134|0|ML|7|313.20|580.00|1|1|3|||VAG|VAG|M||||||1
326.196.136|0|ML|7|313.20|580.00|1|1|3|||AZE|AZE|B||||||1
326.196.138|0|ML|7|313.20|580.00|1|1|3|||AZE|AZE|M||||||1
326.196.140|0|ML|7|313.20|580.00|1|1|3|||AMA|AMA|B||||||1
326.196.142|0|ML|7|313.20|580.00|1|1|3|||AMA|AMA|M||||||1
326.196.144|0|ML|7|313.20|580.00|1|1|3|||AES|AES|B||||||1
326.196.146|0|ML|7|313.20|580.00|1|1|3|||AES|AES|M||||||1
326.196.148|0|ML|7|313.20|580.00|1|1|3|||PRA|PRA|B||||||1
326.196.150|0|ML|7|313.20|580.00|1|1|3|||PRA|PRA|M||||||1
326.196.152|0|ML|7|313.20|580.00|1|1|3|||ROS|ROS|B||||||1
326.196.154|0|ML|7|313.20|580.00|1|1|3|||ROS|ROS|M||||||1
326.196.156|0|ML|7|313.20|580.00|1|1|3|||VER|VER|B||||||1
326.196.158|0|ML|7|313.20|580.00|1|1|3|||VER|VER|M||||||1
326.196.166|0|ML|7|313.20|580.00|1|1|3|||AZB|AZB|||||||1
326.196.168|0|ML|7|313.20|580.00|1|1|3|||DEN|DEN|||||||1
326.196.170|0|ML|7|313.20|580.00|1|1|3|||BLK|BLK|||||||1
326.196.172|0|ML|7|313.20|580.00|1|1|3|||ART|ART|||||||1
326.196.174|0|ML|7|313.20|580.00|1|1|3|||LIN|LIN|||||||1
326.196.176|0|ML|7|313.20|580.00|1|1|3|||HAL|HAL|||||||1
371.196.197|0|ML|5|162.00|300.00|1|1|3|||TBL|TBL|||||||6
371.196.198|0|ML|5|162.00|300.00|1|1|3|||TEA|TEA|||||||6
371.196.199|0|ML|5|162.00|300.00|1|1|3|||OAK|OAK|||||||6
371.196.200|0|ML|5|162.00|300.00|1|1|3|||JOP|JOP|||||||6
371.196.201|0|ML|5|189.00|350.00|1|1|3|||TBL|BCO|B||||||6
371.196.202|0|ML|5|189.00|350.00|1|1|3|||TBL|BCO|M||||||6
371.196.203|0|ML|5|189.00|350.00|1|1|3|||TBL|CCL|B||||||6
371.196.204|0|ML|5|189.00|350.00|1|1|3|||TBL|CCL|M||||||6
371.196.205|0|ML|5|189.00|350.00|1|1|3|||TBL|CME|B||||||6
371.196.206|0|ML|5|189.00|350.00|1|1|3|||TBL|CME|M||||||6
371.196.207|0|ML|5|189.00|350.00|1|1|3|||TBL|ANT|B||||||6
371.196.208|0|ML|5|189.00|350.00|1|1|3|||TBL|ANT|M||||||6
371.196.209|0|ML|5|189.00|350.00|1|1|3|||TBL|PTO|B||||||6
371.196.210|0|ML|5|189.00|350.00|1|1|3|||TBL|PTO|M||||||6
371.196.211|0|ML|5|189.00|350.00|1|1|3|||TBL|CRE|B||||||6
371.196.212|0|ML|5|189.00|350.00|1|1|3|||TBL|CRE|M||||||6
371.196.213|0|ML|5|189.00|350.00|1|1|3|||TBL|CAM|B||||||6
371.196.214|0|ML|5|189.00|350.00|1|1|3|||TBL|CAM|M||||||6
371.196.215|0|ML|5|189.00|350.00|1|1|3|||TBL|OUR|B||||||6
371.196.216|0|ML|5|189.00|350.00|1|1|3|||TBL|OUR|M||||||6
371.196.217|0|ML|5|189.00|350.00|1|1|3|||TBL|COB|B||||||6
371.196.218|0|ML|5|189.00|350.00|1|1|3|||TBL|COB|M||||||6
371.196.219|0|ML|5|189.00|350.00|1|1|3|||TBL|CHO|B||||||6
371.196.220|0|ML|5|189.00|350.00|1|1|3|||TBL|CHO|M||||||6
371.196.221|0|ML|5|189.00|350.00|1|1|3|||TBL|VAG|B||||||6
371.196.222|0|ML|5|189.00|350.00|1|1|3|||TBL|VAG|M||||||6
371.196.223|0|ML|5|189.00|350.00|1|1|3|||TBL|AZE|B||||||6
371.196.224|0|ML|5|189.00|350.00|1|1|3|||TBL|AZE|M||||||6
371.196.225|0|ML|5|189.00|350.00|1|1|3|||TBL|AMA|B||||||6
371.196.226|0|ML|5|189.00|350.00|1|1|3|||TBL|AMA|M||||||6
371.196.227|0|ML|5|189.00|350.00|1|1|3|||TBL|AES|B||||||6
371.196.228|0|ML|5|189.00|350.00|1|1|3|||TBL|AES|M||||||6
371.196.229|0|ML|5|189.00|350.00|1|1|3|||TBL|PRA|B||||||6
371.196.230|0|ML|5|189.00|350.00|1|1|3|||TBL|PRA|M||||||6
371.196.231|0|ML|5|189.00|350.00|1|1|3|||TBL|ROS|B||||||6
371.196.232|0|ML|5|189.00|350.00|1|1|3|||TBL|ROS|M||||||6
371.196.233|0|ML|5|189.00|350.00|1|1|3|||TBL|VER|B||||||6
371.196.234|0|ML|5|189.00|350.00|1|1|3|||TBL|VER|M||||||6
371.196.235|0|ML|5|189.00|350.00|1|1|3|||TBL|AZB|||||||6
371.196.236|0|ML|5|189.00|350.00|1|1|3|||TBL|DEN|||||||6
371.196.237|0|ML|5|189.00|350.00|1|1|3|||TBL|BLK|||||||6
371.196.238|0|ML|5|189.00|350.00|1|1|3|||TBL|ART|||||||6
371.196.239|0|ML|5|189.00|350.00|1|1|3|||TBL|LIN|||||||6
371.196.240|0|ML|5|189.00|350.00|1|1|3|||TBL|HAL|||||||6
371.196.91|0|ML|5|210.60|390.00|1|1|3|||BCO|BCO|B||||||6
371.196.93|0|ML|5|210.60|390.00|1|1|3|||BCO|BCO|M||||||6
371.196.95|0|ML|5|210.60|390.00|1|1|3|||CCL|CCL|B||||||6
371.196.97|0|ML|5|210.60|390.00|1|1|3|||CCL|CCL|M||||||6
371.196.99|0|ML|5|210.60|390.00|1|1|3|||CME|CME|B||||||6
371.196.101|0|ML|5|210.60|390.00|1|1|3|||CME|CME|M||||||6
371.196.103|0|ML|5|210.60|390.00|1|1|3|||ANT|ANT|B||||||6
371.196.105|0|ML|5|210.60|390.00|1|1|3|||ANT|ANT|M||||||6
371.196.107|0|ML|5|210.60|390.00|1|1|3|||PTO|PTO|B||||||6
371.196.109|0|ML|5|210.60|390.00|1|1|3|||PTO|PTO|M||||||6
371.196.111|0|ML|5|210.60|390.00|1|1|3|||CRE|CRE|B||||||6
371.196.113|0|ML|5|210.60|390.00|1|1|3|||CRE|CRE|M||||||6
371.196.115|0|ML|5|210.60|390.00|1|1|3|||CAM|CAM|B||||||6
371.196.117|0|ML|5|210.60|390.00|1|1|3|||CAM|CAM|M||||||6
371.196.119|0|ML|5|210.60|390.00|1|1|3|||OUR|OUR|B||||||6
371.196.121|0|ML|5|210.60|390.00|1|1|3|||OUR|OUR|M||||||6
371.196.123|0|ML|5|210.60|390.00|1|1|3|||COB|COB|B||||||6
371.196.125|0|ML|5|210.60|390.00|1|1|3|||COB|COB|M||||||6
371.196.127|0|ML|5|210.60|390.00|1|1|3|||CHO|CHO|B||||||6
371.196.129|0|ML|5|210.60|390.00|1|1|3|||CHO|CHO|M||||||6
371.196.131|0|ML|5|210.60|390.00|1|1|3|||VAG|VAG|B||||||6
371.196.133|0|ML|5|210.60|390.00|1|1|3|||VAG|VAG|M||||||6
371.196.135|0|ML|5|210.60|390.00|1|1|3|||AZE|AZE|B||||||6
371.196.137|0|ML|5|210.60|390.00|1|1|3|||AZE|AZE|M||||||6
371.196.139|0|ML|5|210.60|390.00|1|1|3|||AMA|AMA|B||||||6
371.196.141|0|ML|5|210.60|390.00|1|1|3|||AMA|AMA|M||||||6
371.196.143|0|ML|5|210.60|390.00|1|1|3|||AES|AES|B||||||6
371.196.145|0|ML|5|210.60|390.00|1|1|3|||AES|AES|M||||||6
371.196.147|0|ML|5|210.60|390.00|1|1|3|||PRA|PRA|B||||||6
371.196.149|0|ML|5|210.60|390.00|1|1|3|||PRA|PRA|M||||||6
371.196.151|0|ML|5|210.60|390.00|1|1|3|||ROS|ROS|B||||||6
371.196.153|0|ML|5|210.60|390.00|1|1|3|||ROS|ROS|M||||||6
371.196.155|0|ML|5|210.60|390.00|1|1|3|||VER|VER|B||||||6
371.196.157|0|ML|5|210.60|390.00|1|1|3|||VER|VER|M||||||6
371.196.165|0|ML|5|210.60|390.00|1|1|3|||AZB|AZB|||||||6
371.196.167|0|ML|5|210.60|390.00|1|1|3|||DEN|DEN|||||||6
371.196.169|0|ML|5|210.60|390.00|1|1|3|||BLK|BLK|||||||6
371.196.171|0|ML|5|210.60|390.00|1|1|3|||ART|ART|||||||6
371.196.173|0|ML|5|210.60|390.00|1|1|3|||LIN|LIN|||||||6
371.196.175|0|ML|5|210.60|390.00|1|1|3|||HAL|HAL|||||||6
371.196.241|0|ML|6|156.60|290.00|1|1|3|||TBL|TBL|||||||6
371.196.242|0|ML|6|156.60|290.00|1|1|3|||TEA|TEA|||||||6
371.196.243|0|ML|6|156.60|290.00|1|1|3|||OAK|OAK|||||||6
371.196.244|0|ML|6|156.60|290.00|1|1|3|||JOP|JOP|||||||6
371.196.245|0|ML|6|183.60|340.00|1|1|3|||TBL|BCO|B||||||6
371.196.246|0|ML|6|183.60|340.00|1|1|3|||TBL|BCO|M||||||6
371.196.247|0|ML|6|183.60|340.00|1|1|3|||TBL|CCL|B||||||6
371.196.248|0|ML|6|183.60|340.00|1|1|3|||TBL|CCL|M||||||6
371.196.249|0|ML|6|183.60|340.00|1|1|3|||TBL|CME|B||||||6
371.196.250|0|ML|6|183.60|340.00|1|1|3|||TBL|CME|M||||||6
371.196.251|0|ML|6|183.60|340.00|1|1|3|||TBL|ANT|B||||||6
371.196.252|0|ML|6|183.60|340.00|1|1|3|||TBL|ANT|M||||||6
371.196.253|0|ML|6|183.60|340.00|1|1|3|||TBL|PTO|B||||||6
371.196.254|0|ML|6|183.60|340.00|1|1|3|||TBL|PTO|M||||||6
371.196.255|0|ML|6|183.60|340.00|1|1|3|||TBL|CRE|B||||||6
371.196.256|0|ML|6|183.60|340.00|1|1|3|||TBL|CRE|M||||||6
371.196.257|0|ML|6|183.60|340.00|1|1|3|||TBL|CAM|B||||||6
371.196.258|0|ML|6|183.60|340.00|1|1|3|||TBL|CAM|M||||||6
371.196.259|0|ML|6|183.60|340.00|1|1|3|||TBL|OUR|B||||||6
371.196.260|0|ML|6|183.60|340.00|1|1|3|||TBL|OUR|M||||||6
371.196.261|0|ML|6|183.60|340.00|1|1|3|||TBL|COB|B||||||6
371.196.262|0|ML|6|183.60|340.00|1|1|3|||TBL|COB|M||||||6
371.196.263|0|ML|6|183.60|340.00|1|1|3|||TBL|CHO|B||||||6
371.196.264|0|ML|6|183.60|340.00|1|1|3|||TBL|CHO|M||||||6
371.196.265|0|ML|6|183.60|340.00|1|1|3|||TBL|VAG|B||||||6
371.196.266|0|ML|6|183.60|340.00|1|1|3|||TBL|VAG|M||||||6
371.196.267|0|ML|6|183.60|340.00|1|1|3|||TBL|AZE|B||||||6
371.196.268|0|ML|6|183.60|340.00|1|1|3|||TBL|AZE|M||||||6
371.196.269|0|ML|6|183.60|340.00|1|1|3|||TBL|AMA|B||||||6
371.196.270|0|ML|6|183.60|340.00|1|1|3|||TBL|AMA|M||||||6
371.196.271|0|ML|6|183.60|340.00|1|1|3|||TBL|AES|B||||||6
371.196.272|0|ML|6|183.60|340.00|1|1|3|||TBL|AES|M||||||6
371.196.273|0|ML|6|183.60|340.00|1|1|3|||TBL|PRA|B||||||6
371.196.274|0|ML|6|183.60|340.00|1|1|3|||TBL|PRA|M||||||6
371.196.275|0|ML|6|183.60|340.00|1|1|3|||TBL|ROS|B||||||6
371.196.276|0|ML|6|183.60|340.00|1|1|3|||TBL|ROS|M||||||6
371.196.277|0|ML|6|183.60|340.00|1|1|3|||TBL|VER|B||||||6
371.196.278|0|ML|6|183.60|340.00|1|1|3|||TBL|VER|M||||||6
371.196.279|0|ML|6|183.60|340.00|1|1|3|||TBL|AZB|||||||6
371.196.280|0|ML|6|183.60|340.00|1|1|3|||TBL|DEN|||||||6
371.196.281|0|ML|6|183.60|340.00|1|1|3|||TBL|BLK|||||||6
371.196.282|0|ML|6|183.60|340.00|1|1|3|||TBL|ART|||||||6
371.196.283|0|ML|6|183.60|340.00|1|1|3|||TBL|LIN|||||||6
371.196.284|0|ML|6|183.60|340.00|1|1|3|||TBL|HAL|||||||6
371.196.285|0|ML|6|205.20|380.00|1|1|3|||BCO|BCO|B||||||6
371.196.286|0|ML|6|205.20|380.00|1|1|3|||BCO|BCO|M||||||6
371.196.287|0|ML|6|205.20|380.00|1|1|3|||CCL|CCL|B||||||6
371.196.288|0|ML|6|205.20|380.00|1|1|3|||CCL|CCL|M||||||6
371.196.289|0|ML|6|205.20|380.00|1|1|3|||CME|CME|B||||||6
371.196.290|0|ML|6|205.20|380.00|1|1|3|||CME|CME|M||||||6
371.196.291|0|ML|6|205.20|380.00|1|1|3|||ANT|ANT|B||||||6
371.196.292|0|ML|6|205.20|380.00|1|1|3|||ANT|ANT|M||||||6
371.196.293|0|ML|6|205.20|380.00|1|1|3|||PTO|PTO|B||||||6
371.196.294|0|ML|6|205.20|380.00|1|1|3|||PTO|PTO|M||||||6
371.196.295|0|ML|6|205.20|380.00|1|1|3|||CRE|CRE|B||||||6
371.196.296|0|ML|6|205.20|380.00|1|1|3|||CRE|CRE|M||||||6
371.196.297|0|ML|6|205.20|380.00|1|1|3|||CAM|CAM|B||||||6
371.196.298|0|ML|6|205.20|380.00|1|1|3|||CAM|CAM|M||||||6
371.196.299|0|ML|6|205.20|380.00|1|1|3|||OUR|OUR|B||||||6
371.196.300|0|ML|6|205.20|380.00|1|1|3|||OUR|OUR|M||||||6
371.196.301|0|ML|6|205.20|380.00|1|1|3|||COB|COB|B||||||6
371.196.302|0|ML|6|205.20|380.00|1|1|3|||COB|COB|M||||||6
371.196.303|0|ML|6|205.20|380.00|1|1|3|||CHO|CHO|B||||||6
371.196.304|0|ML|6|205.20|380.00|1|1|3|||CHO|CHO|M||||||6
371.196.305|0|ML|6|205.20|380.00|1|1|3|||VAG|VAG|B||||||6
371.196.306|0|ML|6|205.20|380.00|1|1|3|||VAG|VAG|M||||||6
371.196.307|0|ML|6|205.20|380.00|1|1|3|||AZE|AZE|B||||||6
371.196.308|0|ML|6|205.20|380.00|1|1|3|||AZE|AZE|M||||||6
371.196.309|0|ML|6|205.20|380.00|1|1|3|||AMA|AMA|B||||||6
371.196.310|0|ML|6|205.20|380.00|1|1|3|||AMA|AMA|M||||||6
371.196.311|0|ML|6|205.20|380.00|1|1|3|||AES|AES|B||||||6
371.196.312|0|ML|6|205.20|380.00|1|1|3|||AES|AES|M||||||6
371.196.313|0|ML|6|205.20|380.00|1|1|3|||PRA|PRA|B||||||6
371.196.314|0|ML|6|205.20|380.00|1|1|3|||PRA|PRA|M||||||6
371.196.315|0|ML|6|205.20|380.00|1|1|3|||ROS|ROS|B||||||6
371.196.316|0|ML|6|205.20|380.00|1|1|3|||ROS|ROS|M||||||6
371.196.317|0|ML|6|205.20|380.00|1|1|3|||VER|VER|B||||||6
371.196.318|0|ML|6|205.20|380.00|1|1|3|||VER|VER|M||||||6
371.196.319|0|ML|6|205.20|380.00|1|1|3|||AZB|AZB|||||||6
371.196.320|0|ML|6|205.20|380.00|1|1|3|||DEN|DEN|||||||6
371.196.321|0|ML|6|205.20|380.00|1|1|3|||BLK|BLK|||||||6
371.196.322|0|ML|6|205.20|380.00|1|1|3|||ART|ART|||||||6
371.196.323|0|ML|6|205.20|380.00|1|1|3|||LIN|LIN|||||||6
371.196.324|0|ML|6|205.20|380.00|1|1|3|||HAL|HAL|||||||6
372.196.197|0|ML|5|178.20|330.00|1|1|3|||TBL|TBL|||||||2
372.196.198|0|ML|5|178.20|330.00|1|1|3|||TEA|TEA|||||||2
372.196.199|0|ML|5|178.20|330.00|1|1|3|||OAK|OAK|||||||2
372.196.200|0|ML|5|178.20|330.00|1|1|3|||JOP|JOP|||||||2
372.196.201|0|ML|5|205.20|380.00|1|1|3|||TBL|BCO|B||||||2
372.196.202|0|ML|5|205.20|380.00|1|1|3|||TBL|BCO|M||||||2
372.196.203|0|ML|5|205.20|380.00|1|1|3|||TBL|CCL|B||||||2
372.196.204|0|ML|5|205.20|380.00|1|1|3|||TBL|CCL|M||||||2
372.196.205|0|ML|5|205.20|380.00|1|1|3|||TBL|CME|B||||||2
372.196.206|0|ML|5|205.20|380.00|1|1|3|||TBL|CME|M||||||2
372.196.207|0|ML|5|205.20|380.00|1|1|3|||TBL|ANT|B||||||2
372.196.208|0|ML|5|205.20|380.00|1|1|3|||TBL|ANT|M||||||2
372.196.209|0|ML|5|205.20|380.00|1|1|3|||TBL|PTO|B||||||2
372.196.210|0|ML|5|205.20|380.00|1|1|3|||TBL|PTO|M||||||2
372.196.211|0|ML|5|205.20|380.00|1|1|3|||TBL|CRE|B||||||2
372.196.212|0|ML|5|205.20|380.00|1|1|3|||TBL|CRE|M||||||2
372.196.213|0|ML|5|205.20|380.00|1|1|3|||TBL|CAM|B||||||2
372.196.214|0|ML|5|205.20|380.00|1|1|3|||TBL|CAM|M||||||2
372.196.215|0|ML|5|205.20|380.00|1|1|3|||TBL|OUR|B||||||2
372.196.216|0|ML|5|205.20|380.00|1|1|3|||TBL|OUR|M||||||2
372.196.217|0|ML|5|205.20|380.00|1|1|3|||TBL|COB|B||||||2
372.196.218|0|ML|5|205.20|380.00|1|1|3|||TBL|COB|M||||||2
372.196.219|0|ML|5|205.20|380.00|1|1|3|||TBL|CHO|B||||||2
372.196.220|0|ML|5|205.20|380.00|1|1|3|||TBL|CHO|M||||||2
372.196.221|0|ML|5|205.20|380.00|1|1|3|||TBL|VAG|B||||||2
372.196.222|0|ML|5|205.20|380.00|1|1|3|||TBL|VAG|M||||||2
372.196.223|0|ML|5|205.20|380.00|1|1|3|||TBL|AZE|B||||||2
372.196.224|0|ML|5|205.20|380.00|1|1|3|||TBL|AZE|M||||||2
372.196.225|0|ML|5|205.20|380.00|1|1|3|||TBL|AMA|B||||||2
372.196.226|0|ML|5|205.20|380.00|1|1|3|||TBL|AMA|M||||||2
372.196.227|0|ML|5|205.20|380.00|1|1|3|||TBL|AES|B||||||2
372.196.228|0|ML|5|205.20|380.00|1|1|3|||TBL|AES|M||||||2
372.196.229|0|ML|5|205.20|380.00|1|1|3|||TBL|PRA|B||||||2
372.196.230|0|ML|5|205.20|380.00|1|1|3|||TBL|PRA|M||||||2
372.196.231|0|ML|5|205.20|380.00|1|1|3|||TBL|ROS|B||||||2
372.196.232|0|ML|5|205.20|380.00|1|1|3|||TBL|ROS|M||||||2
372.196.233|0|ML|5|205.20|380.00|1|1|3|||TBL|VER|B||||||2
372.196.234|0|ML|5|205.20|380.00|1|1|3|||TBL|VER|M||||||2
372.196.235|0|ML|5|205.20|380.00|1|1|3|||TBL|AZB|||||||2
372.196.236|0|ML|5|205.20|380.00|1|1|3|||TBL|DEN|||||||2
372.196.237|0|ML|5|205.20|380.00|1|1|3|||TBL|BLK|||||||2
372.196.238|0|ML|5|205.20|380.00|1|1|3|||TBL|ART|||||||2
372.196.239|0|ML|5|205.20|380.00|1|1|3|||TBL|LIN|||||||2
372.196.240|0|ML|5|205.20|380.00|1|1|3|||TBL|HAL|||||||2
372.196.91|0|ML|5|226.80|420.00|1|1|3|||BCO|BCO|B||||||2
372.196.93|0|ML|5|226.80|420.00|1|1|3|||BCO|BCO|M||||||2
372.196.95|0|ML|5|226.80|420.00|1|1|3|||CCL|CCL|B||||||2
372.196.97|0|ML|5|226.80|420.00|1|1|3|||CCL|CCL|M||||||2
372.196.99|0|ML|5|226.80|420.00|1|1|3|||CME|CME|B||||||2
372.196.101|0|ML|5|226.80|420.00|1|1|3|||CME|CME|M||||||2
372.196.103|0|ML|5|226.80|420.00|1|1|3|||ANT|ANT|B||||||2
372.196.105|0|ML|5|226.80|420.00|1|1|3|||ANT|ANT|M||||||2
372.196.107|0|ML|5|226.80|420.00|1|1|3|||PTO|PTO|B||||||2
372.196.109|0|ML|5|226.80|420.00|1|1|3|||PTO|PTO|M||||||2
372.196.111|0|ML|5|226.80|420.00|1|1|3|||CRE|CRE|B||||||2
372.196.113|0|ML|5|226.80|420.00|1|1|3|||CRE|CRE|M||||||2
372.196.115|0|ML|5|226.80|420.00|1|1|3|||CAM|CAM|B||||||2
372.196.117|0|ML|5|226.80|420.00|1|1|3|||CAM|CAM|M||||||2
372.196.119|0|ML|5|226.80|420.00|1|1|3|||OUR|OUR|B||||||2
372.196.121|0|ML|5|226.80|420.00|1|1|3|||OUR|OUR|M||||||2
372.196.123|0|ML|5|226.80|420.00|1|1|3|||COB|COB|B||||||2
372.196.125|0|ML|5|226.80|420.00|1|1|3|||COB|COB|M||||||2
372.196.127|0|ML|5|226.80|420.00|1|1|3|||CHO|CHO|B||||||2
372.196.129|0|ML|5|226.80|420.00|1|1|3|||CHO|CHO|M||||||2
372.196.131|0|ML|5|226.80|420.00|1|1|3|||VAG|VAG|B||||||2
372.196.133|0|ML|5|226.80|420.00|1|1|3|||VAG|VAG|M||||||2
372.196.135|0|ML|5|226.80|420.00|1|1|3|||AZE|AZE|B||||||2
372.196.137|0|ML|5|226.80|420.00|1|1|3|||AZE|AZE|M||||||2
372.196.139|0|ML|5|226.80|420.00|1|1|3|||AMA|AMA|B||||||2
372.196.141|0|ML|5|226.80|420.00|1|1|3|||AMA|AMA|M||||||2
372.196.143|0|ML|5|226.80|420.00|1|1|3|||AES|AES|B||||||2
372.196.145|0|ML|5|226.80|420.00|1|1|3|||AES|AES|M||||||2
372.196.147|0|ML|5|226.80|420.00|1|1|3|||PRA|PRA|B||||||2
372.196.149|0|ML|5|226.80|420.00|1|1|3|||PRA|PRA|M||||||2
372.196.151|0|ML|5|226.80|420.00|1|1|3|||ROS|ROS|B||||||2
372.196.153|0|ML|5|226.80|420.00|1|1|3|||ROS|ROS|M||||||2
372.196.155|0|ML|5|226.80|420.00|1|1|3|||VER|VER|B||||||2
372.196.157|0|ML|5|226.80|420.00|1|1|3|||VER|VER|M||||||2
372.196.165|0|ML|5|226.80|420.00|1|1|3|||AZB|AZB|||||||2
372.196.167|0|ML|5|226.80|420.00|1|1|3|||DEN|DEN|||||||2
372.196.169|0|ML|5|226.80|420.00|1|1|3|||BLK|BLK|||||||2
372.196.171|0|ML|5|226.80|420.00|1|1|3|||ART|ART|||||||2
372.196.173|0|ML|5|226.80|420.00|1|1|3|||LIN|LIN|||||||2
372.196.175|0|ML|5|226.80|420.00|1|1|3|||HAL|HAL|||||||2
372.196.241|0|ML|6|172.80|320.00|1|1|3|||TBL|TBL|||||||2
372.196.242|0|ML|6|172.80|320.00|1|1|3|||TEA|TEA|||||||2
372.196.243|0|ML|6|172.80|320.00|1|1|3|||OAK|OAK|||||||2
372.196.244|0|ML|6|172.80|320.00|1|1|3|||JOP|JOP|||||||2
372.196.245|0|ML|6|199.80|370.00|1|1|3|||TBL|BCO|B||||||2
372.196.246|0|ML|6|199.80|370.00|1|1|3|||TBL|BCO|M||||||2
372.196.247|0|ML|6|199.80|370.00|1|1|3|||TBL|CCL|B||||||2
372.196.248|0|ML|6|199.80|370.00|1|1|3|||TBL|CCL|M||||||2
372.196.249|0|ML|6|199.80|370.00|1|1|3|||TBL|CME|B||||||2
372.196.250|0|ML|6|199.80|370.00|1|1|3|||TBL|CME|M||||||2
372.196.251|0|ML|6|199.80|370.00|1|1|3|||TBL|ANT|B||||||2
372.196.252|0|ML|6|199.80|370.00|1|1|3|||TBL|ANT|M||||||2
372.196.253|0|ML|6|199.80|370.00|1|1|3|||TBL|PTO|B||||||2
372.196.254|0|ML|6|199.80|370.00|1|1|3|||TBL|PTO|M||||||2
372.196.255|0|ML|6|199.80|370.00|1|1|3|||TBL|CRE|B||||||2
372.196.256|0|ML|6|199.80|370.00|1|1|3|||TBL|CRE|M||||||2
372.196.257|0|ML|6|199.80|370.00|1|1|3|||TBL|CAM|B||||||2
372.196.258|0|ML|6|199.80|370.00|1|1|3|||TBL|CAM|M||||||2
372.196.259|0|ML|6|199.80|370.00|1|1|3|||TBL|OUR|B||||||2
372.196.260|0|ML|6|199.80|370.00|1|1|3|||TBL|OUR|M||||||2
372.196.261|0|ML|6|199.80|370.00|1|1|3|||TBL|COB|B||||||2
372.196.262|0|ML|6|199.80|370.00|1|1|3|||TBL|COB|M||||||2
372.196.263|0|ML|6|199.80|370.00|1|1|3|||TBL|CHO|B||||||2
372.196.264|0|ML|6|199.80|370.00|1|1|3|||TBL|CHO|M||||||2
372.196.265|0|ML|6|199.80|370.00|1|1|3|||TBL|VAG|B||||||2
372.196.266|0|ML|6|199.80|370.00|1|1|3|||TBL|VAG|M||||||2
372.196.267|0|ML|6|199.80|370.00|1|1|3|||TBL|AZE|B||||||2
372.196.268|0|ML|6|199.80|370.00|1|1|3|||TBL|AZE|M||||||2
372.196.269|0|ML|6|199.80|370.00|1|1|3|||TBL|AMA|B||||||2
372.196.270|0|ML|6|199.80|370.00|1|1|3|||TBL|AMA|M||||||2
372.196.271|0|ML|6|199.80|370.00|1|1|3|||TBL|AES|B||||||2
372.196.272|0|ML|6|199.80|370.00|1|1|3|||TBL|AES|M||||||2
372.196.273|0|ML|6|199.80|370.00|1|1|3|||TBL|PRA|B||||||2
372.196.274|0|ML|6|199.80|370.00|1|1|3|||TBL|PRA|M||||||2
372.196.275|0|ML|6|199.80|370.00|1|1|3|||TBL|ROS|B||||||2
372.196.276|0|ML|6|199.80|370.00|1|1|3|||TBL|ROS|M||||||2
372.196.277|0|ML|6|199.80|370.00|1|1|3|||TBL|VER|B||||||2
372.196.278|0|ML|6|199.80|370.00|1|1|3|||TBL|VER|M||||||2
372.196.279|0|ML|6|199.80|370.00|1|1|3|||TBL|AZB|||||||2
372.196.280|0|ML|6|199.80|370.00|1|1|3|||TBL|DEN|||||||2
372.196.281|0|ML|6|199.80|370.00|1|1|3|||TBL|BLK|||||||2
372.196.282|0|ML|6|199.80|370.00|1|1|3|||TBL|ART|||||||2
372.196.283|0|ML|6|199.80|370.00|1|1|3|||TBL|LIN|||||||2
372.196.284|0|ML|6|199.80|370.00|1|1|3|||TBL|HAL|||||||2
372.196.285|0|ML|6|221.40|410.00|1|1|3|||BCO|BCO|B||||||2
372.196.286|0|ML|6|221.40|410.00|1|1|3|||BCO|BCO|M||||||2
372.196.287|0|ML|6|221.40|410.00|1|1|3|||CCL|CCL|B||||||2
372.196.288|0|ML|6|221.40|410.00|1|1|3|||CCL|CCL|M||||||2
372.196.289|0|ML|6|221.40|410.00|1|1|3|||CME|CME|B||||||2
372.196.290|0|ML|6|221.40|410.00|1|1|3|||CME|CME|M||||||2
372.196.291|0|ML|6|221.40|410.00|1|1|3|||ANT|ANT|B||||||2
372.196.292|0|ML|6|221.40|410.00|1|1|3|||ANT|ANT|M||||||2
372.196.293|0|ML|6|221.40|410.00|1|1|3|||PTO|PTO|B||||||2
372.196.294|0|ML|6|221.40|410.00|1|1|3|||PTO|PTO|M||||||2
372.196.295|0|ML|6|221.40|410.00|1|1|3|||CRE|CRE|B||||||2
372.196.296|0|ML|6|221.40|410.00|1|1|3|||CRE|CRE|M||||||2
372.196.297|0|ML|6|221.40|410.00|1|1|3|||CAM|CAM|B||||||2
372.196.298|0|ML|6|221.40|410.00|1|1|3|||CAM|CAM|M||||||2
372.196.299|0|ML|6|221.40|410.00|1|1|3|||OUR|OUR|B||||||2
372.196.300|0|ML|6|221.40|410.00|1|1|3|||OUR|OUR|M||||||2
372.196.301|0|ML|6|221.40|410.00|1|1|3|||COB|COB|B||||||2
372.196.302|0|ML|6|221.40|410.00|1|1|3|||COB|COB|M||||||2
372.196.303|0|ML|6|221.40|410.00|1|1|3|||CHO|CHO|B||||||2
372.196.304|0|ML|6|221.40|410.00|1|1|3|||CHO|CHO|M||||||2
372.196.305|0|ML|6|221.40|410.00|1|1|3|||VAG|VAG|B||||||2
372.196.306|0|ML|6|221.40|410.00|1|1|3|||VAG|VAG|M||||||2
372.196.307|0|ML|6|221.40|410.00|1|1|3|||AZE|AZE|B||||||2
372.196.308|0|ML|6|221.40|410.00|1|1|3|||AZE|AZE|M||||||2
372.196.309|0|ML|6|221.40|410.00|1|1|3|||AMA|AMA|B||||||2
372.196.310|0|ML|6|221.40|410.00|1|1|3|||AMA|AMA|M||||||2
372.196.311|0|ML|6|221.40|410.00|1|1|3|||AES|AES|B||||||2
372.196.312|0|ML|6|221.40|410.00|1|1|3|||AES|AES|M||||||2
372.196.313|0|ML|6|221.40|410.00|1|1|3|||PRA|PRA|B||||||2
372.196.314|0|ML|6|221.40|410.00|1|1|3|||PRA|PRA|M||||||2
372.196.315|0|ML|6|221.40|410.00|1|1|3|||ROS|ROS|B||||||2
372.196.316|0|ML|6|221.40|410.00|1|1|3|||ROS|ROS|M||||||2
372.196.317|0|ML|6|221.40|410.00|1|1|3|||VER|VER|B||||||2
372.196.318|0|ML|6|221.40|410.00|1|1|3|||VER|VER|M||||||2
372.196.319|0|ML|6|221.40|410.00|1|1|3|||AZB|AZB|||||||2
372.196.320|0|ML|6|221.40|410.00|1|1|3|||DEN|DEN|||||||2
372.196.321|0|ML|6|221.40|410.00|1|1|3|||BLK|BLK|||||||2
372.196.322|0|ML|6|221.40|410.00|1|1|3|||ART|ART|||||||2
372.196.323|0|ML|6|221.40|410.00|1|1|3|||LIN|LIN|||||||2
372.196.324|0|ML|6|221.40|410.00|1|1|3|||HAL|HAL|||||||2
372.196.327|0|ML|7|332.10|615.00|1|1|3|||TBL|TBL|||||||2
372.196.328|0|ML|7|332.10|615.00|1|1|3|||TEA|TEA|||||||2
372.196.329|0|ML|7|332.10|615.00|1|1|3|||OAK|OAK|||||||2
372.196.330|0|ML|7|332.10|615.00|1|1|3|||JOP|JOP|||||||2
372.196.331|0|ML|7|359.10|665.00|1|1|3|||TBL|BCO|B||||||2
372.196.332|0|ML|7|359.10|665.00|1|1|3|||TBL|BCO|M||||||2
372.196.333|0|ML|7|359.10|665.00|1|1|3|||TBL|CCL|B||||||2
372.196.334|0|ML|7|359.10|665.00|1|1|3|||TBL|CCL|M||||||2
372.196.335|0|ML|7|359.10|665.00|1|1|3|||TBL|CME|B||||||2
372.196.336|0|ML|7|359.10|665.00|1|1|3|||TBL|CME|M||||||2
372.196.337|0|ML|7|359.10|665.00|1|1|3|||TBL|ANT|B||||||2
372.196.338|0|ML|7|359.10|665.00|1|1|3|||TBL|ANT|M||||||2
372.196.339|0|ML|7|359.10|665.00|1|1|3|||TBL|PTO|B||||||2
372.196.340|0|ML|7|359.10|665.00|1|1|3|||TBL|PTO|M||||||2
372.196.341|0|ML|7|359.10|665.00|1|1|3|||TBL|CRE|B||||||2
372.196.342|0|ML|7|359.10|665.00|1|1|3|||TBL|CRE|M||||||2
372.196.343|0|ML|7|359.10|665.00|1|1|3|||TBL|CAM|B||||||2
372.196.344|0|ML|7|359.10|665.00|1|1|3|||TBL|CAM|M||||||2
372.196.345|0|ML|7|359.10|665.00|1|1|3|||TBL|OUR|B||||||2
372.196.346|0|ML|7|359.10|665.00|1|1|3|||TBL|OUR|M||||||2
372.196.347|0|ML|7|359.10|665.00|1|1|3|||TBL|COB|B||||||2
372.196.348|0|ML|7|359.10|665.00|1|1|3|||TBL|COB|M||||||2
372.196.349|0|ML|7|359.10|665.00|1|1|3|||TBL|CHO|B||||||2
372.196.350|0|ML|7|359.10|665.00|1|1|3|||TBL|CHO|M||||||2
372.196.351|0|ML|7|359.10|665.00|1|1|3|||TBL|VAG|B||||||2
372.196.352|0|ML|7|359.10|665.00|1|1|3|||TBL|VAG|M||||||2
372.196.353|0|ML|7|359.10|665.00|1|1|3|||TBL|AZE|B||||||2
372.196.354|0|ML|7|359.10|665.00|1|1|3|||TBL|AZE|M||||||2
372.196.355|0|ML|7|359.10|665.00|1|1|3|||TBL|AMA|B||||||2
372.196.356|0|ML|7|359.10|665.00|1|1|3|||TBL|AMA|M||||||2
372.196.357|0|ML|7|359.10|665.00|1|1|3|||TBL|AES|B||||||2
372.196.358|0|ML|7|359.10|665.00|1|1|3|||TBL|AES|M||||||2
372.196.359|0|ML|7|359.10|665.00|1|1|3|||TBL|PRA|B||||||2
372.196.360|0|ML|7|359.10|665.00|1|1|3|||TBL|PRA|M||||||2
372.196.361|0|ML|7|359.10|665.00|1|1|3|||TBL|ROS|B||||||2
372.196.362|0|ML|7|359.10|665.00|1|1|3|||TBL|ROS|M||||||2
372.196.363|0|ML|7|359.10|665.00|1|1|3|||TBL|VER|B||||||2
372.196.364|0|ML|7|359.10|665.00|1|1|3|||TBL|VER|M||||||2
372.196.365|0|ML|7|359.10|665.00|1|1|3|||TBL|AZB|||||||2
372.196.366|0|ML|7|359.10|665.00|1|1|3|||TBL|DEN|||||||2
372.196.367|0|ML|7|359.10|665.00|1|1|3|||TBL|BLK|||||||2
372.196.368|0|ML|7|359.10|665.00|1|1|3|||TBL|ART|||||||2
372.196.369|0|ML|7|359.10|665.00|1|1|3|||TBL|LIN|||||||2
372.196.370|0|ML|7|359.10|665.00|1|1|3|||TBL|HAL|||||||2
372.196.92|0|ML|7|380.70|705.00|1|1|3|||BCO|BCO|B||||||2
372.196.94|0|ML|7|380.70|705.00|1|1|3|||BCO|BCO|M||||||2
372.196.96|0|ML|7|380.70|705.00|1|1|3|||CCL|CCL|B||||||2
372.196.98|0|ML|7|380.70|705.00|1|1|3|||CCL|CCL|M||||||2
372.196.100|0|ML|7|380.70|705.00|1|1|3|||CME|CME|B||||||2
372.196.102|0|ML|7|380.70|705.00|1|1|3|||CME|CME|M||||||2
372.196.104|0|ML|7|380.70|705.00|1|1|3|||ANT|ANT|B||||||2
372.196.106|0|ML|7|380.70|705.00|1|1|3|||ANT|ANT|M||||||2
372.196.108|0|ML|7|380.70|705.00|1|1|3|||PTO|PTO|B||||||2
372.196.110|0|ML|7|380.70|705.00|1|1|3|||PTO|PTO|M||||||2
372.196.112|0|ML|7|380.70|705.00|1|1|3|||CRE|CRE|B||||||2
372.196.114|0|ML|7|380.70|705.00|1|1|3|||CRE|CRE|M||||||2
372.196.116|0|ML|7|380.70|705.00|1|1|3|||CAM|CAM|B||||||2
372.196.118|0|ML|7|380.70|705.00|1|1|3|||CAM|CAM|M||||||2
372.196.120|0|ML|7|380.70|705.00|1|1|3|||OUR|OUR|B||||||2
372.196.122|0|ML|7|380.70|705.00|1|1|3|||OUR|OUR|M||||||2
372.196.124|0|ML|7|380.70|705.00|1|1|3|||COB|COB|B||||||2
372.196.126|0|ML|7|380.70|705.00|1|1|3|||COB|COB|M||||||2
372.196.128|0|ML|7|380.70|705.00|1|1|3|||CHO|CHO|B||||||2
372.196.130|0|ML|7|380.70|705.00|1|1|3|||CHO|CHO|M||||||2
372.196.132|0|ML|7|380.70|705.00|1|1|3|||VAG|VAG|B||||||2
372.196.134|0|ML|7|380.70|705.00|1|1|3|||VAG|VAG|M||||||2
372.196.136|0|ML|7|380.70|705.00|1|1|3|||AZE|AZE|B||||||2
372.196.138|0|ML|7|380.70|705.00|1|1|3|||AZE|AZE|M||||||2
372.196.140|0|ML|7|380.70|705.00|1|1|3|||AMA|AMA|B||||||2
372.196.142|0|ML|7|380.70|705.00|1|1|3|||AMA|AMA|M||||||2
372.196.144|0|ML|7|380.70|705.00|1|1|3|||AES|AES|B||||||2
372.196.146|0|ML|7|380.70|705.00|1|1|3|||AES|AES|M||||||2
372.196.148|0|ML|7|380.70|705.00|1|1|3|||PRA|PRA|B||||||2
372.196.150|0|ML|7|380.70|705.00|1|1|3|||PRA|PRA|M||||||2
372.196.152|0|ML|7|380.70|705.00|1|1|3|||ROS|ROS|B||||||2
372.196.154|0|ML|7|380.70|705.00|1|1|3|||ROS|ROS|M||||||2
372.196.156|0|ML|7|380.70|705.00|1|1|3|||VER|VER|B||||||2
372.196.158|0|ML|7|380.70|705.00|1|1|3|||VER|VER|M||||||2
372.196.166|0|ML|7|380.70|705.00|1|1|3|||AZB|AZB|||||||2
372.196.168|0|ML|7|380.70|705.00|1|1|3|||DEN|DEN|||||||2
372.196.170|0|ML|7|380.70|705.00|1|1|3|||BLK|BLK|||||||2
372.196.172|0|ML|7|380.70|705.00|1|1|3|||ART|ART|||||||2
372.196.174|0|ML|7|380.70|705.00|1|1|3|||LIN|LIN|||||||2
372.196.176|0|ML|7|380.70|705.00|1|1|3|||HAL|HAL|||||||2
373.196.197|0|ML|5|243.00|450.00|1|1|3|||TBL|TBL|||||||3
373.196.198|0|ML|5|243.00|450.00|1|1|3|||TEA|TEA|||||||3
373.196.199|0|ML|5|243.00|450.00|1|1|3|||OAK|OAK|||||||3
373.196.200|0|ML|5|243.00|450.00|1|1|3|||JOP|JOP|||||||3
373.196.201|0|ML|5|270.00|500.00|1|1|3|||TBL|BCO|B||||||3
373.196.202|0|ML|5|270.00|500.00|1|1|3|||TBL|BCO|M||||||3
373.196.203|0|ML|5|270.00|500.00|1|1|3|||TBL|CCL|B||||||3
373.196.204|0|ML|5|270.00|500.00|1|1|3|||TBL|CCL|M||||||3
373.196.205|0|ML|5|270.00|500.00|1|1|3|||TBL|CME|B||||||3
373.196.206|0|ML|5|270.00|500.00|1|1|3|||TBL|CME|M||||||3
373.196.207|0|ML|5|270.00|500.00|1|1|3|||TBL|ANT|B||||||3
373.196.208|0|ML|5|270.00|500.00|1|1|3|||TBL|ANT|M||||||3
373.196.209|0|ML|5|270.00|500.00|1|1|3|||TBL|PTO|B||||||3
373.196.210|0|ML|5|270.00|500.00|1|1|3|||TBL|PTO|M||||||3
373.196.211|0|ML|5|270.00|500.00|1|1|3|||TBL|CRE|B||||||3
373.196.212|0|ML|5|270.00|500.00|1|1|3|||TBL|CRE|M||||||3
373.196.213|0|ML|5|270.00|500.00|1|1|3|||TBL|CAM|B||||||3
373.196.214|0|ML|5|270.00|500.00|1|1|3|||TBL|CAM|M||||||3
373.196.215|0|ML|5|270.00|500.00|1|1|3|||TBL|OUR|B||||||3
373.196.216|0|ML|5|270.00|500.00|1|1|3|||TBL|OUR|M||||||3
373.196.217|0|ML|5|270.00|500.00|1|1|3|||TBL|COB|B||||||3
373.196.218|0|ML|5|270.00|500.00|1|1|3|||TBL|COB|M||||||3
373.196.219|0|ML|5|270.00|500.00|1|1|3|||TBL|CHO|B||||||3
373.196.220|0|ML|5|270.00|500.00|1|1|3|||TBL|CHO|M||||||3
373.196.221|0|ML|5|270.00|500.00|1|1|3|||TBL|VAG|B||||||3
373.196.222|0|ML|5|270.00|500.00|1|1|3|||TBL|VAG|M||||||3
373.196.223|0|ML|5|270.00|500.00|1|1|3|||TBL|AZE|B||||||3
373.196.224|0|ML|5|270.00|500.00|1|1|3|||TBL|AZE|M||||||3
373.196.225|0|ML|5|270.00|500.00|1|1|3|||TBL|AMA|B||||||3
373.196.226|0|ML|5|270.00|500.00|1|1|3|||TBL|AMA|M||||||3
373.196.227|0|ML|5|270.00|500.00|1|1|3|||TBL|AES|B||||||3
373.196.228|0|ML|5|270.00|500.00|1|1|3|||TBL|AES|M||||||3
373.196.229|0|ML|5|270.00|500.00|1|1|3|||TBL|PRA|B||||||3
373.196.230|0|ML|5|270.00|500.00|1|1|3|||TBL|PRA|M||||||3
373.196.231|0|ML|5|270.00|500.00|1|1|3|||TBL|ROS|B||||||3
373.196.232|0|ML|5|270.00|500.00|1|1|3|||TBL|ROS|M||||||3
373.196.233|0|ML|5|270.00|500.00|1|1|3|||TBL|VER|B||||||3
373.196.234|0|ML|5|270.00|500.00|1|1|3|||TBL|VER|M||||||3
373.196.235|0|ML|5|270.00|500.00|1|1|3|||TBL|AZB|||||||3
373.196.236|0|ML|5|270.00|500.00|1|1|3|||TBL|DEN|||||||3
373.196.237|0|ML|5|270.00|500.00|1|1|3|||TBL|BLK|||||||3
373.196.238|0|ML|5|270.00|500.00|1|1|3|||TBL|ART|||||||3
373.196.239|0|ML|5|270.00|500.00|1|1|3|||TBL|LIN|||||||3
373.196.240|0|ML|5|270.00|500.00|1|1|3|||TBL|HAL|||||||3
373.196.91|0|ML|5|291.60|540.00|1|1|3|||BCO|BCO|B||||||3
373.196.93|0|ML|5|291.60|540.00|1|1|3|||BCO|BCO|M||||||3
373.196.95|0|ML|5|291.60|540.00|1|1|3|||CCL|CCL|B||||||3
373.196.97|0|ML|5|291.60|540.00|1|1|3|||CCL|CCL|M||||||3
373.196.99|0|ML|5|291.60|540.00|1|1|3|||CME|CME|B||||||3
373.196.101|0|ML|5|291.60|540.00|1|1|3|||CME|CME|M||||||3
373.196.103|0|ML|5|291.60|540.00|1|1|3|||ANT|ANT|B||||||3
373.196.105|0|ML|5|291.60|540.00|1|1|3|||ANT|ANT|M||||||3
373.196.107|0|ML|5|291.60|540.00|1|1|3|||PTO|PTO|B||||||3
373.196.109|0|ML|5|291.60|540.00|1|1|3|||PTO|PTO|M||||||3
373.196.111|0|ML|5|291.60|540.00|1|1|3|||CRE|CRE|B||||||3
373.196.113|0|ML|5|291.60|540.00|1|1|3|||CRE|CRE|M||||||3
373.196.115|0|ML|5|291.60|540.00|1|1|3|||CAM|CAM|B||||||3
373.196.117|0|ML|5|291.60|540.00|1|1|3|||CAM|CAM|M||||||3
373.196.119|0|ML|5|291.60|540.00|1|1|3|||OUR|OUR|B||||||3
373.196.121|0|ML|5|291.60|540.00|1|1|3|||OUR|OUR|M||||||3
373.196.123|0|ML|5|291.60|540.00|1|1|3|||COB|COB|B||||||3
373.196.125|0|ML|5|291.60|540.00|1|1|3|||COB|COB|M||||||3
373.196.127|0|ML|5|291.60|540.00|1|1|3|||CHO|CHO|B||||||3
373.196.129|0|ML|5|291.60|540.00|1|1|3|||CHO|CHO|M||||||3
373.196.131|0|ML|5|291.60|540.00|1|1|3|||VAG|VAG|B||||||3
373.196.133|0|ML|5|291.60|540.00|1|1|3|||VAG|VAG|M||||||3
373.196.135|0|ML|5|291.60|540.00|1|1|3|||AZE|AZE|B||||||3
373.196.137|0|ML|5|291.60|540.00|1|1|3|||AZE|AZE|M||||||3
373.196.139|0|ML|5|291.60|540.00|1|1|3|||AMA|AMA|B||||||3
373.196.141|0|ML|5|291.60|540.00|1|1|3|||AMA|AMA|M||||||3
373.196.143|0|ML|5|291.60|540.00|1|1|3|||AES|AES|B||||||3
373.196.145|0|ML|5|291.60|540.00|1|1|3|||AES|AES|M||||||3
373.196.147|0|ML|5|291.60|540.00|1|1|3|||PRA|PRA|B||||||3
373.196.149|0|ML|5|291.60|540.00|1|1|3|||PRA|PRA|M||||||3
373.196.151|0|ML|5|291.60|540.00|1|1|3|||ROS|ROS|B||||||3
373.196.153|0|ML|5|291.60|540.00|1|1|3|||ROS|ROS|M||||||3
373.196.155|0|ML|5|291.60|540.00|1|1|3|||VER|VER|B||||||3
373.196.157|0|ML|5|291.60|540.00|1|1|3|||VER|VER|M||||||3
373.196.165|0|ML|5|291.60|540.00|1|1|3|||AZB|AZB|||||||3
373.196.167|0|ML|5|291.60|540.00|1|1|3|||DEN|DEN|||||||3
373.196.169|0|ML|5|291.60|540.00|1|1|3|||BLK|BLK|||||||3
373.196.171|0|ML|5|291.60|540.00|1|1|3|||ART|ART|||||||3
373.196.173|0|ML|5|291.60|540.00|1|1|3|||LIN|LIN|||||||3
373.196.175|0|ML|5|291.60|540.00|1|1|3|||HAL|HAL|||||||3
373.196.241|0|ML|6|237.60|440.00|1|1|3|||TBL|TBL|||||||3
373.196.242|0|ML|6|237.60|440.00|1|1|3|||TEA|TEA|||||||3
373.196.243|0|ML|6|237.60|440.00|1|1|3|||OAK|OAK|||||||3
373.196.244|0|ML|6|237.60|440.00|1|1|3|||JOP|JOP|||||||3
373.196.245|0|ML|6|264.60|490.00|1|1|3|||TBL|BCO|B||||||3
373.196.246|0|ML|6|264.60|490.00|1|1|3|||TBL|BCO|M||||||3
373.196.247|0|ML|6|264.60|490.00|1|1|3|||TBL|CCL|B||||||3
373.196.248|0|ML|6|264.60|490.00|1|1|3|||TBL|CCL|M||||||3
373.196.249|0|ML|6|264.60|490.00|1|1|3|||TBL|CME|B||||||3
373.196.250|0|ML|6|264.60|490.00|1|1|3|||TBL|CME|M||||||3
373.196.251|0|ML|6|264.60|490.00|1|1|3|||TBL|ANT|B||||||3
373.196.252|0|ML|6|264.60|490.00|1|1|3|||TBL|ANT|M||||||3
373.196.253|0|ML|6|264.60|490.00|1|1|3|||TBL|PTO|B||||||3
373.196.254|0|ML|6|264.60|490.00|1|1|3|||TBL|PTO|M||||||3
373.196.255|0|ML|6|264.60|490.00|1|1|3|||TBL|CRE|B||||||3
373.196.256|0|ML|6|264.60|490.00|1|1|3|||TBL|CRE|M||||||3
373.196.257|0|ML|6|264.60|490.00|1|1|3|||TBL|CAM|B||||||3
373.196.258|0|ML|6|264.60|490.00|1|1|3|||TBL|CAM|M||||||3
373.196.259|0|ML|6|264.60|490.00|1|1|3|||TBL|OUR|B||||||3
373.196.260|0|ML|6|264.60|490.00|1|1|3|||TBL|OUR|M||||||3
373.196.261|0|ML|6|264.60|490.00|1|1|3|||TBL|COB|B||||||3
373.196.262|0|ML|6|264.60|490.00|1|1|3|||TBL|COB|M||||||3
373.196.263|0|ML|6|264.60|490.00|1|1|3|||TBL|CHO|B||||||3
373.196.264|0|ML|6|264.60|490.00|1|1|3|||TBL|CHO|M||||||3
373.196.265|0|ML|6|264.60|490.00|1|1|3|||TBL|VAG|B||||||3
373.196.266|0|ML|6|264.60|490.00|1|1|3|||TBL|VAG|M||||||3
373.196.267|0|ML|6|264.60|490.00|1|1|3|||TBL|AZE|B||||||3
373.196.268|0|ML|6|264.60|490.00|1|1|3|||TBL|AZE|M||||||3
373.196.269|0|ML|6|264.60|490.00|1|1|3|||TBL|AMA|B||||||3
373.196.270|0|ML|6|264.60|490.00|1|1|3|||TBL|AMA|M||||||3
373.196.271|0|ML|6|264.60|490.00|1|1|3|||TBL|AES|B||||||3
373.196.272|0|ML|6|264.60|490.00|1|1|3|||TBL|AES|M||||||3
373.196.273|0|ML|6|264.60|490.00|1|1|3|||TBL|PRA|B||||||3
373.196.274|0|ML|6|264.60|490.00|1|1|3|||TBL|PRA|M||||||3
373.196.275|0|ML|6|264.60|490.00|1|1|3|||TBL|ROS|B||||||3
373.196.276|0|ML|6|264.60|490.00|1|1|3|||TBL|ROS|M||||||3
373.196.277|0|ML|6|264.60|490.00|1|1|3|||TBL|VER|B||||||3
373.196.278|0|ML|6|264.60|490.00|1|1|3|||TBL|VER|M||||||3
373.196.279|0|ML|6|264.60|490.00|1|1|3|||TBL|AZB|||||||3
373.196.280|0|ML|6|264.60|490.00|1|1|3|||TBL|DEN|||||||3
373.196.281|0|ML|6|264.60|490.00|1|1|3|||TBL|BLK|||||||3
373.196.282|0|ML|6|264.60|490.00|1|1|3|||TBL|ART|||||||3
373.196.283|0|ML|6|264.60|490.00|1|1|3|||TBL|LIN|||||||3
373.196.284|0|ML|6|264.60|490.00|1|1|3|||TBL|HAL|||||||3
373.196.285|0|ML|6|286.20|530.00|1|1|3|||BCO|BCO|B||||||3
373.196.286|0|ML|6|286.20|530.00|1|1|3|||BCO|BCO|M||||||3
373.196.287|0|ML|6|286.20|530.00|1|1|3|||CCL|CCL|B||||||3
373.196.288|0|ML|6|286.20|530.00|1|1|3|||CCL|CCL|M||||||3
373.196.289|0|ML|6|286.20|530.00|1|1|3|||CME|CME|B||||||3
373.196.290|0|ML|6|286.20|530.00|1|1|3|||CME|CME|M||||||3
373.196.291|0|ML|6|286.20|530.00|1|1|3|||ANT|ANT|B||||||3
373.196.292|0|ML|6|286.20|530.00|1|1|3|||ANT|ANT|M||||||3
373.196.293|0|ML|6|286.20|530.00|1|1|3|||PTO|PTO|B||||||3
373.196.294|0|ML|6|286.20|530.00|1|1|3|||PTO|PTO|M||||||3
373.196.295|0|ML|6|286.20|530.00|1|1|3|||CRE|CRE|B||||||3
373.196.296|0|ML|6|286.20|530.00|1|1|3|||CRE|CRE|M||||||3
373.196.297|0|ML|6|286.20|530.00|1|1|3|||CAM|CAM|B||||||3
373.196.298|0|ML|6|286.20|530.00|1|1|3|||CAM|CAM|M||||||3
373.196.299|0|ML|6|286.20|530.00|1|1|3|||OUR|OUR|B||||||3
373.196.300|0|ML|6|286.20|530.00|1|1|3|||OUR|OUR|M||||||3
373.196.301|0|ML|6|286.20|530.00|1|1|3|||COB|COB|B||||||3
373.196.302|0|ML|6|286.20|530.00|1|1|3|||COB|COB|M||||||3
373.196.303|0|ML|6|286.20|530.00|1|1|3|||CHO|CHO|B||||||3
373.196.304|0|ML|6|286.20|530.00|1|1|3|||CHO|CHO|M||||||3
373.196.305|0|ML|6|286.20|530.00|1|1|3|||VAG|VAG|B||||||3
373.196.306|0|ML|6|286.20|530.00|1|1|3|||VAG|VAG|M||||||3
373.196.307|0|ML|6|286.20|530.00|1|1|3|||AZE|AZE|B||||||3
373.196.308|0|ML|6|286.20|530.00|1|1|3|||AZE|AZE|M||||||3
373.196.309|0|ML|6|286.20|530.00|1|1|3|||AMA|AMA|B||||||3
373.196.310|0|ML|6|286.20|530.00|1|1|3|||AMA|AMA|M||||||3
373.196.311|0|ML|6|286.20|530.00|1|1|3|||AES|AES|B||||||3
373.196.312|0|ML|6|286.20|530.00|1|1|3|||AES|AES|M||||||3
373.196.313|0|ML|6|286.20|530.00|1|1|3|||PRA|PRA|B||||||3
373.196.314|0|ML|6|286.20|530.00|1|1|3|||PRA|PRA|M||||||3
373.196.315|0|ML|6|286.20|530.00|1|1|3|||ROS|ROS|B||||||3
373.196.316|0|ML|6|286.20|530.00|1|1|3|||ROS|ROS|M||||||3
373.196.317|0|ML|6|286.20|530.00|1|1|3|||VER|VER|B||||||3
373.196.318|0|ML|6|286.20|530.00|1|1|3|||VER|VER|M||||||3
373.196.319|0|ML|6|286.20|530.00|1|1|3|||AZB|AZB|||||||3
373.196.320|0|ML|6|286.20|530.00|1|1|3|||DEN|DEN|||||||3
373.196.321|0|ML|6|286.20|530.00|1|1|3|||BLK|BLK|||||||3
373.196.322|0|ML|6|286.20|530.00|1|1|3|||ART|ART|||||||3
373.196.323|0|ML|6|286.20|530.00|1|1|3|||LIN|LIN|||||||3
373.196.324|0|ML|6|286.20|530.00|1|1|3|||HAL|HAL|||||||3
373.196.327|0|ML|7|402.30|745.00|1|1|3|||TBL|TBL|||||||3
373.196.328|0|ML|7|402.30|745.00|1|1|3|||TEA|TEA|||||||3
373.196.329|0|ML|7|402.30|745.00|1|1|3|||OAK|OAK|||||||3
373.196.330|0|ML|7|402.30|745.00|1|1|3|||JOP|JOP|||||||3
373.196.331|0|ML|7|429.30|795.00|1|1|3|||TBL|BCO|B||||||3
373.196.332|0|ML|7|429.30|795.00|1|1|3|||TBL|BCO|M||||||3
373.196.333|0|ML|7|429.30|795.00|1|1|3|||TBL|CCL|B||||||3
373.196.334|0|ML|7|429.30|795.00|1|1|3|||TBL|CCL|M||||||3
373.196.335|0|ML|7|429.30|795.00|1|1|3|||TBL|CME|B||||||3
373.196.336|0|ML|7|429.30|795.00|1|1|3|||TBL|CME|M||||||3
373.196.337|0|ML|7|429.30|795.00|1|1|3|||TBL|ANT|B||||||3
373.196.338|0|ML|7|429.30|795.00|1|1|3|||TBL|ANT|M||||||3
373.196.339|0|ML|7|429.30|795.00|1|1|3|||TBL|PTO|B||||||3
373.196.340|0|ML|7|429.30|795.00|1|1|3|||TBL|PTO|M||||||3
373.196.341|0|ML|7|429.30|795.00|1|1|3|||TBL|CRE|B||||||3
373.196.342|0|ML|7|429.30|795.00|1|1|3|||TBL|CRE|M||||||3
373.196.343|0|ML|7|429.30|795.00|1|1|3|||TBL|CAM|B||||||3
373.196.344|0|ML|7|429.30|795.00|1|1|3|||TBL|CAM|M||||||3
373.196.345|0|ML|7|429.30|795.00|1|1|3|||TBL|OUR|B||||||3
373.196.346|0|ML|7|429.30|795.00|1|1|3|||TBL|OUR|M||||||3
373.196.347|0|ML|7|429.30|795.00|1|1|3|||TBL|COB|B||||||3
373.196.348|0|ML|7|429.30|795.00|1|1|3|||TBL|COB|M||||||3
373.196.349|0|ML|7|429.30|795.00|1|1|3|||TBL|CHO|B||||||3
373.196.350|0|ML|7|429.30|795.00|1|1|3|||TBL|CHO|M||||||3
373.196.351|0|ML|7|429.30|795.00|1|1|3|||TBL|VAG|B||||||3
373.196.352|0|ML|7|429.30|795.00|1|1|3|||TBL|VAG|M||||||3
373.196.353|0|ML|7|429.30|795.00|1|1|3|||TBL|AZE|B||||||3
373.196.354|0|ML|7|429.30|795.00|1|1|3|||TBL|AZE|M||||||3
373.196.355|0|ML|7|429.30|795.00|1|1|3|||TBL|AMA|B||||||3
373.196.356|0|ML|7|429.30|795.00|1|1|3|||TBL|AMA|M||||||3
373.196.357|0|ML|7|429.30|795.00|1|1|3|||TBL|AES|B||||||3
373.196.358|0|ML|7|429.30|795.00|1|1|3|||TBL|AES|M||||||3
373.196.359|0|ML|7|429.30|795.00|1|1|3|||TBL|PRA|B||||||3
373.196.360|0|ML|7|429.30|795.00|1|1|3|||TBL|PRA|M||||||3
373.196.361|0|ML|7|429.30|795.00|1|1|3|||TBL|ROS|B||||||3
373.196.362|0|ML|7|429.30|795.00|1|1|3|||TBL|ROS|M||||||3
373.196.363|0|ML|7|429.30|795.00|1|1|3|||TBL|VER|B||||||3
373.196.364|0|ML|7|429.30|795.00|1|1|3|||TBL|VER|M||||||3
373.196.365|0|ML|7|429.30|795.00|1|1|3|||TBL|AZB|||||||3
373.196.366|0|ML|7|429.30|795.00|1|1|3|||TBL|DEN|||||||3
373.196.367|0|ML|7|429.30|795.00|1|1|3|||TBL|BLK|||||||3
373.196.368|0|ML|7|429.30|795.00|1|1|3|||TBL|ART|||||||3
373.196.369|0|ML|7|429.30|795.00|1|1|3|||TBL|LIN|||||||3
373.196.370|0|ML|7|429.30|795.00|1|1|3|||TBL|HAL|||||||3
373.196.92|0|ML|7|450.90|835.00|1|1|3|||BCO|BCO|B||||||3
373.196.94|0|ML|7|450.90|835.00|1|1|3|||BCO|BCO|M||||||3
373.196.96|0|ML|7|450.90|835.00|1|1|3|||CCL|CCL|B||||||3
373.196.98|0|ML|7|450.90|835.00|1|1|3|||CCL|CCL|M||||||3
373.196.100|0|ML|7|450.90|835.00|1|1|3|||CME|CME|B||||||3
373.196.102|0|ML|7|450.90|835.00|1|1|3|||CME|CME|M||||||3
373.196.104|0|ML|7|450.90|835.00|1|1|3|||ANT|ANT|B||||||3
373.196.106|0|ML|7|450.90|835.00|1|1|3|||ANT|ANT|M||||||3
373.196.108|0|ML|7|450.90|835.00|1|1|3|||PTO|PTO|B||||||3
373.196.110|0|ML|7|450.90|835.00|1|1|3|||PTO|PTO|M||||||3
373.196.112|0|ML|7|450.90|835.00|1|1|3|||CRE|CRE|B||||||3
373.196.114|0|ML|7|450.90|835.00|1|1|3|||CRE|CRE|M||||||3
373.196.116|0|ML|7|450.90|835.00|1|1|3|||CAM|CAM|B||||||3
373.196.118|0|ML|7|450.90|835.00|1|1|3|||CAM|CAM|M||||||3
373.196.120|0|ML|7|450.90|835.00|1|1|3|||OUR|OUR|B||||||3
373.196.122|0|ML|7|450.90|835.00|1|1|3|||OUR|OUR|M||||||3
373.196.124|0|ML|7|450.90|835.00|1|1|3|||COB|COB|B||||||3
373.196.126|0|ML|7|450.90|835.00|1|1|3|||COB|COB|M||||||3
373.196.128|0|ML|7|450.90|835.00|1|1|3|||CHO|CHO|B||||||3
373.196.130|0|ML|7|450.90|835.00|1|1|3|||CHO|CHO|M||||||3
373.196.132|0|ML|7|450.90|835.00|1|1|3|||VAG|VAG|B||||||3
373.196.134|0|ML|7|450.90|835.00|1|1|3|||VAG|VAG|M||||||3
373.196.136|0|ML|7|450.90|835.00|1|1|3|||AZE|AZE|B||||||3
373.196.138|0|ML|7|450.90|835.00|1|1|3|||AZE|AZE|M||||||3
373.196.140|0|ML|7|450.90|835.00|1|1|3|||AMA|AMA|B||||||3
373.196.142|0|ML|7|450.90|835.00|1|1|3|||AMA|AMA|M||||||3
373.196.144|0|ML|7|450.90|835.00|1|1|3|||AES|AES|B||||||3
373.196.146|0|ML|7|450.90|835.00|1|1|3|||AES|AES|M||||||3
373.196.148|0|ML|7|450.90|835.00|1|1|3|||PRA|PRA|B||||||3
373.196.150|0|ML|7|450.90|835.00|1|1|3|||PRA|PRA|M||||||3
373.196.152|0|ML|7|450.90|835.00|1|1|3|||ROS|ROS|B||||||3
373.196.154|0|ML|7|450.90|835.00|1|1|3|||ROS|ROS|M||||||3
373.196.156|0|ML|7|450.90|835.00|1|1|3|||VER|VER|B||||||3
373.196.158|0|ML|7|450.90|835.00|1|1|3|||VER|VER|M||||||3
373.196.166|0|ML|7|450.90|835.00|1|1|3|||AZB|AZB|||||||3
373.196.168|0|ML|7|450.90|835.00|1|1|3|||DEN|DEN|||||||3
373.196.170|0|ML|7|450.90|835.00|1|1|3|||BLK|BLK|||||||3
373.196.172|0|ML|7|450.90|835.00|1|1|3|||ART|ART|||||||3
373.196.174|0|ML|7|450.90|835.00|1|1|3|||LIN|LIN|||||||3
373.196.176|0|ML|7|450.90|835.00|1|1|3|||HAL|HAL|||||||3
373.374.197|0|ML|8|264.60|490.00|1|1|3|||TBL|TBL|||||||3
373.374.198|0|ML|8|264.60|490.00|1|1|3|||TEA|TEA|||||||3
373.374.199|0|ML|8|264.60|490.00|1|1|3|||OAK|OAK|||||||3
373.374.200|0|ML|8|264.60|490.00|1|1|3|||JOP|JOP|||||||3
373.374.201|0|ML|8|291.60|540.00|1|1|3|||TBL|BCO|B||||||3
373.374.202|0|ML|8|291.60|540.00|1|1|3|||TBL|BCO|M||||||3
373.374.203|0|ML|8|291.60|540.00|1|1|3|||TBL|CCL|B||||||3
373.374.204|0|ML|8|291.60|540.00|1|1|3|||TBL|CCL|M||||||3
373.374.205|0|ML|8|291.60|540.00|1|1|3|||TBL|CME|B||||||3
373.374.206|0|ML|8|291.60|540.00|1|1|3|||TBL|CME|M||||||3
373.374.207|0|ML|8|291.60|540.00|1|1|3|||TBL|ANT|B||||||3
373.374.208|0|ML|8|291.60|540.00|1|1|3|||TBL|ANT|M||||||3
373.374.209|0|ML|8|291.60|540.00|1|1|3|||TBL|PTO|B||||||3
373.374.210|0|ML|8|291.60|540.00|1|1|3|||TBL|PTO|M||||||3
373.374.211|0|ML|8|291.60|540.00|1|1|3|||TBL|CRE|B||||||3
373.374.212|0|ML|8|291.60|540.00|1|1|3|||TBL|CRE|M||||||3
373.374.213|0|ML|8|291.60|540.00|1|1|3|||TBL|CAM|B||||||3
373.374.214|0|ML|8|291.60|540.00|1|1|3|||TBL|CAM|M||||||3
373.374.215|0|ML|8|291.60|540.00|1|1|3|||TBL|OUR|B||||||3
373.374.216|0|ML|8|291.60|540.00|1|1|3|||TBL|OUR|M||||||3
373.374.217|0|ML|8|291.60|540.00|1|1|3|||TBL|COB|B||||||3
373.374.218|0|ML|8|291.60|540.00|1|1|3|||TBL|COB|M||||||3
373.374.219|0|ML|8|291.60|540.00|1|1|3|||TBL|CHO|B||||||3
373.374.220|0|ML|8|291.60|540.00|1|1|3|||TBL|CHO|M||||||3
373.374.221|0|ML|8|291.60|540.00|1|1|3|||TBL|VAG|B||||||3
373.374.222|0|ML|8|291.60|540.00|1|1|3|||TBL|VAG|M||||||3
373.374.223|0|ML|8|291.60|540.00|1|1|3|||TBL|AZE|B||||||3
373.374.224|0|ML|8|291.60|540.00|1|1|3|||TBL|AZE|M||||||3
373.374.225|0|ML|8|291.60|540.00|1|1|3|||TBL|AMA|B||||||3
373.374.226|0|ML|8|291.60|540.00|1|1|3|||TBL|AMA|M||||||3
373.374.227|0|ML|8|291.60|540.00|1|1|3|||TBL|AES|B||||||3
373.374.228|0|ML|8|291.60|540.00|1|1|3|||TBL|AES|M||||||3
373.374.229|0|ML|8|291.60|540.00|1|1|3|||TBL|PRA|B||||||3
373.374.230|0|ML|8|291.60|540.00|1|1|3|||TBL|PRA|M||||||3
373.374.231|0|ML|8|291.60|540.00|1|1|3|||TBL|ROS|B||||||3
373.374.232|0|ML|8|291.60|540.00|1|1|3|||TBL|ROS|M||||||3
373.374.233|0|ML|8|291.60|540.00|1|1|3|||TBL|VER|B||||||3
373.374.234|0|ML|8|291.60|540.00|1|1|3|||TBL|VER|M||||||3
373.374.235|0|ML|8|291.60|540.00|1|1|3|||TBL|AZB|||||||3
373.374.236|0|ML|8|291.60|540.00|1|1|3|||TBL|DEN|||||||3
373.374.237|0|ML|8|291.60|540.00|1|1|3|||TBL|BLK|||||||3
373.374.238|0|ML|8|291.60|540.00|1|1|3|||TBL|ART|||||||3
373.374.239|0|ML|8|291.60|540.00|1|1|3|||TBL|LIN|||||||3
373.374.240|0|ML|8|291.60|540.00|1|1|3|||TBL|HAL|||||||3
373.374.91|0|ML|8|313.20|580.00|1|1|3|||BCO|BCO|B||||||3
373.374.93|0|ML|8|313.20|580.00|1|1|3|||BCO|BCO|M||||||3
373.374.95|0|ML|8|313.20|580.00|1|1|3|||CCL|CCL|B||||||3
373.374.97|0|ML|8|313.20|580.00|1|1|3|||CCL|CCL|M||||||3
373.374.99|0|ML|8|313.20|580.00|1|1|3|||CME|CME|B||||||3
373.374.101|0|ML|8|313.20|580.00|1|1|3|||CME|CME|M||||||3
373.374.103|0|ML|8|313.20|580.00|1|1|3|||ANT|ANT|B||||||3
373.374.105|0|ML|8|313.20|580.00|1|1|3|||ANT|ANT|M||||||3
373.374.107|0|ML|8|313.20|580.00|1|1|3|||PTO|PTO|B||||||3
373.374.109|0|ML|8|313.20|580.00|1|1|3|||PTO|PTO|M||||||3
373.374.111|0|ML|8|313.20|580.00|1|1|3|||CRE|CRE|B||||||3
373.374.113|0|ML|8|313.20|580.00|1|1|3|||CRE|CRE|M||||||3
373.374.115|0|ML|8|313.20|580.00|1|1|3|||CAM|CAM|B||||||3
373.374.117|0|ML|8|313.20|580.00|1|1|3|||CAM|CAM|M||||||3
373.374.119|0|ML|8|313.20|580.00|1|1|3|||OUR|OUR|B||||||3
373.374.121|0|ML|8|313.20|580.00|1|1|3|||OUR|OUR|M||||||3
373.374.123|0|ML|8|313.20|580.00|1|1|3|||COB|COB|B||||||3
373.374.125|0|ML|8|313.20|580.00|1|1|3|||COB|COB|M||||||3
373.374.127|0|ML|8|313.20|580.00|1|1|3|||CHO|CHO|B||||||3
373.374.129|0|ML|8|313.20|580.00|1|1|3|||CHO|CHO|M||||||3
373.374.131|0|ML|8|313.20|580.00|1|1|3|||VAG|VAG|B||||||3
373.374.133|0|ML|8|313.20|580.00|1|1|3|||VAG|VAG|M||||||3
373.374.135|0|ML|8|313.20|580.00|1|1|3|||AZE|AZE|B||||||3
373.374.137|0|ML|8|313.20|580.00|1|1|3|||AZE|AZE|M||||||3
373.374.139|0|ML|8|313.20|580.00|1|1|3|||AMA|AMA|B||||||3
373.374.141|0|ML|8|313.20|580.00|1|1|3|||AMA|AMA|M||||||3
373.374.143|0|ML|8|313.20|580.00|1|1|3|||AES|AES|B||||||3
373.374.145|0|ML|8|313.20|580.00|1|1|3|||AES|AES|M||||||3
373.374.147|0|ML|8|313.20|580.00|1|1|3|||PRA|PRA|B||||||3
373.374.149|0|ML|8|313.20|580.00|1|1|3|||PRA|PRA|M||||||3
373.374.151|0|ML|8|313.20|580.00|1|1|3|||ROS|ROS|B||||||3
373.374.153|0|ML|8|313.20|580.00|1|1|3|||ROS|ROS|M||||||3
373.374.155|0|ML|8|313.20|580.00|1|1|3|||VER|VER|B||||||3
373.374.157|0|ML|8|313.20|580.00|1|1|3|||VER|VER|M||||||3
373.374.165|0|ML|8|313.20|580.00|1|1|3|||AZB|AZB|||||||3
373.374.167|0|ML|8|313.20|580.00|1|1|3|||DEN|DEN|||||||3
373.374.169|0|ML|8|313.20|580.00|1|1|3|||BLK|BLK|||||||3
373.374.171|0|ML|8|313.20|580.00|1|1|3|||ART|ART|||||||3
373.374.173|0|ML|8|313.20|580.00|1|1|3|||LIN|LIN|||||||3
373.374.175|0|ML|8|313.20|580.00|1|1|3|||HAL|HAL|||||||3
373.374.241|0|ML|9|259.20|480.00|1|1|3|||TBL|TBL|||||||3
373.374.242|0|ML|9|259.20|480.00|1|1|3|||TEA|TEA|||||||3
373.374.243|0|ML|9|259.20|480.00|1|1|3|||OAK|OAK|||||||3
373.374.244|0|ML|9|259.20|480.00|1|1|3|||JOP|JOP|||||||3
373.374.245|0|ML|9|286.20|530.00|1|1|3|||TBL|BCO|B||||||3
373.374.246|0|ML|9|286.20|530.00|1|1|3|||TBL|BCO|M||||||3
373.374.247|0|ML|9|286.20|530.00|1|1|3|||TBL|CCL|B||||||3
373.374.248|0|ML|9|286.20|530.00|1|1|3|||TBL|CCL|M||||||3
373.374.249|0|ML|9|286.20|530.00|1|1|3|||TBL|CME|B||||||3
373.374.250|0|ML|9|286.20|530.00|1|1|3|||TBL|CME|M||||||3
373.374.251|0|ML|9|286.20|530.00|1|1|3|||TBL|ANT|B||||||3
373.374.252|0|ML|9|286.20|530.00|1|1|3|||TBL|ANT|M||||||3
373.374.253|0|ML|9|286.20|530.00|1|1|3|||TBL|PTO|B||||||3
373.374.254|0|ML|9|286.20|530.00|1|1|3|||TBL|PTO|M||||||3
373.374.255|0|ML|9|286.20|530.00|1|1|3|||TBL|CRE|B||||||3
373.374.256|0|ML|9|286.20|530.00|1|1|3|||TBL|CRE|M||||||3
373.374.257|0|ML|9|286.20|530.00|1|1|3|||TBL|CAM|B||||||3
373.374.258|0|ML|9|286.20|530.00|1|1|3|||TBL|CAM|M||||||3
373.374.259|0|ML|9|286.20|530.00|1|1|3|||TBL|OUR|B||||||3
373.374.260|0|ML|9|286.20|530.00|1|1|3|||TBL|OUR|M||||||3
373.374.261|0|ML|9|286.20|530.00|1|1|3|||TBL|COB|B||||||3
373.374.262|0|ML|9|286.20|530.00|1|1|3|||TBL|COB|M||||||3
373.374.263|0|ML|9|286.20|530.00|1|1|3|||TBL|CHO|B||||||3
373.374.264|0|ML|9|286.20|530.00|1|1|3|||TBL|CHO|M||||||3
373.374.265|0|ML|9|286.20|530.00|1|1|3|||TBL|VAG|B||||||3
373.374.266|0|ML|9|286.20|530.00|1|1|3|||TBL|VAG|M||||||3
373.374.267|0|ML|9|286.20|530.00|1|1|3|||TBL|AZE|B||||||3
373.374.268|0|ML|9|286.20|530.00|1|1|3|||TBL|AZE|M||||||3
373.374.269|0|ML|9|286.20|530.00|1|1|3|||TBL|AMA|B||||||3
373.374.270|0|ML|9|286.20|530.00|1|1|3|||TBL|AMA|M||||||3
373.374.271|0|ML|9|286.20|530.00|1|1|3|||TBL|AES|B||||||3
373.374.272|0|ML|9|286.20|530.00|1|1|3|||TBL|AES|M||||||3
373.374.273|0|ML|9|286.20|530.00|1|1|3|||TBL|PRA|B||||||3
373.374.274|0|ML|9|286.20|530.00|1|1|3|||TBL|PRA|M||||||3
373.374.275|0|ML|9|286.20|530.00|1|1|3|||TBL|ROS|B||||||3
373.374.276|0|ML|9|286.20|530.00|1|1|3|||TBL|ROS|M||||||3
373.374.277|0|ML|9|286.20|530.00|1|1|3|||TBL|VER|B||||||3
373.374.278|0|ML|9|286.20|530.00|1|1|3|||TBL|VER|M||||||3
373.374.279|0|ML|9|286.20|530.00|1|1|3|||TBL|AZB|||||||3
373.374.280|0|ML|9|286.20|530.00|1|1|3|||TBL|DEN|||||||3
373.374.281|0|ML|9|286.20|530.00|1|1|3|||TBL|BLK|||||||3
373.374.282|0|ML|9|286.20|530.00|1|1|3|||TBL|ART|||||||3
373.374.283|0|ML|9|286.20|530.00|1|1|3|||TBL|LIN|||||||3
373.374.284|0|ML|9|286.20|530.00|1|1|3|||TBL|HAL|||||||3
373.374.285|0|ML|9|307.80|570.00|1|1|3|||BCO|BCO|B||||||3
373.374.286|0|ML|9|307.80|570.00|1|1|3|||BCO|BCO|M||||||3
373.374.287|0|ML|9|307.80|570.00|1|1|3|||CCL|CCL|B||||||3
373.374.288|0|ML|9|307.80|570.00|1|1|3|||CCL|CCL|M||||||3
373.374.289|0|ML|9|307.80|570.00|1|1|3|||CME|CME|B||||||3
373.374.290|0|ML|9|307.80|570.00|1|1|3|||CME|CME|M||||||3
373.374.291|0|ML|9|307.80|570.00|1|1|3|||ANT|ANT|B||||||3
373.374.292|0|ML|9|307.80|570.00|1|1|3|||ANT|ANT|M||||||3
373.374.293|0|ML|9|307.80|570.00|1|1|3|||PTO|PTO|B||||||3
373.374.294|0|ML|9|307.80|570.00|1|1|3|||PTO|PTO|M||||||3
373.374.295|0|ML|9|307.80|570.00|1|1|3|||CRE|CRE|B||||||3
373.374.296|0|ML|9|307.80|570.00|1|1|3|||CRE|CRE|M||||||3
373.374.297|0|ML|9|307.80|570.00|1|1|3|||CAM|CAM|B||||||3
373.374.298|0|ML|9|307.80|570.00|1|1|3|||CAM|CAM|M||||||3
373.374.299|0|ML|9|307.80|570.00|1|1|3|||OUR|OUR|B||||||3
373.374.300|0|ML|9|307.80|570.00|1|1|3|||OUR|OUR|M||||||3
373.374.301|0|ML|9|307.80|570.00|1|1|3|||COB|COB|B||||||3
373.374.302|0|ML|9|307.80|570.00|1|1|3|||COB|COB|M||||||3
373.374.303|0|ML|9|307.80|570.00|1|1|3|||CHO|CHO|B||||||3
373.374.304|0|ML|9|307.80|570.00|1|1|3|||CHO|CHO|M||||||3
373.374.305|0|ML|9|307.80|570.00|1|1|3|||VAG|VAG|B||||||3
373.374.306|0|ML|9|307.80|570.00|1|1|3|||VAG|VAG|M||||||3
373.374.307|0|ML|9|307.80|570.00|1|1|3|||AZE|AZE|B||||||3
373.374.308|0|ML|9|307.80|570.00|1|1|3|||AZE|AZE|M||||||3
373.374.309|0|ML|9|307.80|570.00|1|1|3|||AMA|AMA|B||||||3
373.374.310|0|ML|9|307.80|570.00|1|1|3|||AMA|AMA|M||||||3
373.374.311|0|ML|9|307.80|570.00|1|1|3|||AES|AES|B||||||3
373.374.312|0|ML|9|307.80|570.00|1|1|3|||AES|AES|M||||||3
373.374.313|0|ML|9|307.80|570.00|1|1|3|||PRA|PRA|B||||||3
373.374.314|0|ML|9|307.80|570.00|1|1|3|||PRA|PRA|M||||||3
373.374.315|0|ML|9|307.80|570.00|1|1|3|||ROS|ROS|B||||||3
373.374.316|0|ML|9|307.80|570.00|1|1|3|||ROS|ROS|M||||||3
373.374.317|0|ML|9|307.80|570.00|1|1|3|||VER|VER|B||||||3
373.374.318|0|ML|9|307.80|570.00|1|1|3|||VER|VER|M||||||3
373.374.319|0|ML|9|307.80|570.00|1|1|3|||AZB|AZB|||||||3
373.374.320|0|ML|9|307.80|570.00|1|1|3|||DEN|DEN|||||||3
373.374.321|0|ML|9|307.80|570.00|1|1|3|||BLK|BLK|||||||3
373.374.322|0|ML|9|307.80|570.00|1|1|3|||ART|ART|||||||3
373.374.323|0|ML|9|307.80|570.00|1|1|3|||LIN|LIN|||||||3
373.374.324|0|ML|9|307.80|570.00|1|1|3|||HAL|HAL|||||||3
373.374.327|0|ML|10|507.60|940.00|1|1|3|||TBL|TBL|||||||3
373.374.328|0|ML|10|507.60|940.00|1|1|3|||TEA|TEA|||||||3
373.374.329|0|ML|10|507.60|940.00|1|1|3|||OAK|OAK|||||||3
373.374.330|0|ML|10|507.60|940.00|1|1|3|||JOP|JOP|||||||3
373.374.331|0|ML|10|534.60|990.00|1|1|3|||TBL|BCO|B||||||3
373.374.332|0|ML|10|534.60|990.00|1|1|3|||TBL|BCO|M||||||3
373.374.333|0|ML|10|534.60|990.00|1|1|3|||TBL|CCL|B||||||3
373.374.334|0|ML|10|534.60|990.00|1|1|3|||TBL|CCL|M||||||3
373.374.335|0|ML|10|534.60|990.00|1|1|3|||TBL|CME|B||||||3
373.374.336|0|ML|10|534.60|990.00|1|1|3|||TBL|CME|M||||||3
373.374.337|0|ML|10|534.60|990.00|1|1|3|||TBL|ANT|B||||||3
373.374.338|0|ML|10|534.60|990.00|1|1|3|||TBL|ANT|M||||||3
373.374.339|0|ML|10|534.60|990.00|1|1|3|||TBL|PTO|B||||||3
373.374.340|0|ML|10|534.60|990.00|1|1|3|||TBL|PTO|M||||||3
373.374.341|0|ML|10|534.60|990.00|1|1|3|||TBL|CRE|B||||||3
373.374.342|0|ML|10|534.60|990.00|1|1|3|||TBL|CRE|M||||||3
373.374.343|0|ML|10|534.60|990.00|1|1|3|||TBL|CAM|B||||||3
373.374.344|0|ML|10|534.60|990.00|1|1|3|||TBL|CAM|M||||||3
373.374.345|0|ML|10|534.60|990.00|1|1|3|||TBL|OUR|B||||||3
373.374.346|0|ML|10|534.60|990.00|1|1|3|||TBL|OUR|M||||||3
373.374.347|0|ML|10|534.60|990.00|1|1|3|||TBL|COB|B||||||3
373.374.348|0|ML|10|534.60|990.00|1|1|3|||TBL|COB|M||||||3
373.374.349|0|ML|10|534.60|990.00|1|1|3|||TBL|CHO|B||||||3
373.374.350|0|ML|10|534.60|990.00|1|1|3|||TBL|CHO|M||||||3
373.374.351|0|ML|10|534.60|990.00|1|1|3|||TBL|VAG|B||||||3
373.374.352|0|ML|10|534.60|990.00|1|1|3|||TBL|VAG|M||||||3
373.374.353|0|ML|10|534.60|990.00|1|1|3|||TBL|AZE|B||||||3
373.374.354|0|ML|10|534.60|990.00|1|1|3|||TBL|AZE|M||||||3
373.374.355|0|ML|10|534.60|990.00|1|1|3|||TBL|AMA|B||||||3
373.374.356|0|ML|10|534.60|990.00|1|1|3|||TBL|AMA|M||||||3
373.374.357|0|ML|10|534.60|990.00|1|1|3|||TBL|AES|B||||||3
373.374.358|0|ML|10|534.60|990.00|1|1|3|||TBL|AES|M||||||3
373.374.359|0|ML|10|534.60|990.00|1|1|3|||TBL|PRA|B||||||3
373.374.360|0|ML|10|534.60|990.00|1|1|3|||TBL|PRA|M||||||3
373.374.361|0|ML|10|534.60|990.00|1|1|3|||TBL|ROS|B||||||3
373.374.362|0|ML|10|534.60|990.00|1|1|3|||TBL|ROS|M||||||3
373.374.363|0|ML|10|534.60|990.00|1|1|3|||TBL|VER|B||||||3
373.374.364|0|ML|10|534.60|990.00|1|1|3|||TBL|VER|M||||||3
373.374.365|0|ML|10|534.60|990.00|1|1|3|||TBL|AZB|||||||3
373.374.366|0|ML|10|534.60|990.00|1|1|3|||TBL|DEN|||||||3
373.374.367|0|ML|10|534.60|990.00|1|1|3|||TBL|BLK|||||||3
373.374.368|0|ML|10|534.60|990.00|1|1|3|||TBL|ART|||||||3
373.374.369|0|ML|10|534.60|990.00|1|1|3|||TBL|LIN|||||||3
373.374.370|0|ML|10|534.60|990.00|1|1|3|||TBL|HAL|||||||3
373.374.92|0|ML|10|556.20|1030.00|1|1|3|||BCO|BCO|B||||||3
373.374.94|0|ML|10|556.20|1030.00|1|1|3|||BCO|BCO|M||||||3
373.374.96|0|ML|10|556.20|1030.00|1|1|3|||CCL|CCL|B||||||3
373.374.98|0|ML|10|556.20|1030.00|1|1|3|||CCL|CCL|M||||||3
373.374.100|0|ML|10|556.20|1030.00|1|1|3|||CME|CME|B||||||3
373.374.102|0|ML|10|556.20|1030.00|1|1|3|||CME|CME|M||||||3
373.374.104|0|ML|10|556.20|1030.00|1|1|3|||ANT|ANT|B||||||3
373.374.106|0|ML|10|556.20|1030.00|1|1|3|||ANT|ANT|M||||||3
373.374.108|0|ML|10|556.20|1030.00|1|1|3|||PTO|PTO|B||||||3
373.374.110|0|ML|10|556.20|1030.00|1|1|3|||PTO|PTO|M||||||3
373.374.112|0|ML|10|556.20|1030.00|1|1|3|||CRE|CRE|B||||||3
373.374.114|0|ML|10|556.20|1030.00|1|1|3|||CRE|CRE|M||||||3
373.374.116|0|ML|10|556.20|1030.00|1|1|3|||CAM|CAM|B||||||3
373.374.118|0|ML|10|556.20|1030.00|1|1|3|||CAM|CAM|M||||||3
373.374.120|0|ML|10|556.20|1030.00|1|1|3|||OUR|OUR|B||||||3
373.374.122|0|ML|10|556.20|1030.00|1|1|3|||OUR|OUR|M||||||3
373.374.124|0|ML|10|556.20|1030.00|1|1|3|||COB|COB|B||||||3
373.374.126|0|ML|10|556.20|1030.00|1|1|3|||COB|COB|M||||||3
373.374.128|0|ML|10|556.20|1030.00|1|1|3|||CHO|CHO|B||||||3
373.374.130|0|ML|10|556.20|1030.00|1|1|3|||CHO|CHO|M||||||3
373.374.132|0|ML|10|556.20|1030.00|1|1|3|||VAG|VAG|B||||||3
373.374.134|0|ML|10|556.20|1030.00|1|1|3|||VAG|VAG|M||||||3
373.374.136|0|ML|10|556.20|1030.00|1|1|3|||AZE|AZE|B||||||3
373.374.138|0|ML|10|556.20|1030.00|1|1|3|||AZE|AZE|M||||||3
373.374.140|0|ML|10|556.20|1030.00|1|1|3|||AMA|AMA|B||||||3
373.374.142|0|ML|10|556.20|1030.00|1|1|3|||AMA|AMA|M||||||3
373.374.144|0|ML|10|556.20|1030.00|1|1|3|||AES|AES|B||||||3
373.374.146|0|ML|10|556.20|1030.00|1|1|3|||AES|AES|M||||||3
373.374.148|0|ML|10|556.20|1030.00|1|1|3|||PRA|PRA|B||||||3
373.374.150|0|ML|10|556.20|1030.00|1|1|3|||PRA|PRA|M||||||3
373.374.152|0|ML|10|556.20|1030.00|1|1|3|||ROS|ROS|B||||||3
373.374.154|0|ML|10|556.20|1030.00|1|1|3|||ROS|ROS|M||||||3
373.374.156|0|ML|10|556.20|1030.00|1|1|3|||VER|VER|B||||||3
373.374.158|0|ML|10|556.20|1030.00|1|1|3|||VER|VER|M||||||3
373.374.166|0|ML|10|556.20|1030.00|1|1|3|||AZB|AZB|||||||3
373.374.168|0|ML|10|556.20|1030.00|1|1|3|||DEN|DEN|||||||3
373.374.170|0|ML|10|556.20|1030.00|1|1|3|||BLK|BLK|||||||3
373.374.172|0|ML|10|556.20|1030.00|1|1|3|||ART|ART|||||||3
373.374.174|0|ML|10|556.20|1030.00|1|1|3|||LIN|LIN|||||||3
373.374.176|0|ML|10|556.20|1030.00|1|1|3|||HAL|HAL|||||||3
373.375.197|0|ML|11|345.60|640.00|1|1|3|||TBL|TBL|||||||3
373.375.198|0|ML|11|345.60|640.00|1|1|3|||TEA|TEA|||||||3
373.375.199|0|ML|11|345.60|640.00|1|1|3|||OAK|OAK|||||||3
373.375.200|0|ML|11|345.60|640.00|1|1|3|||JOP|JOP|||||||3
373.375.201|0|ML|11|372.60|690.00|1|1|3|||TBL|BCO|B||||||3
373.375.202|0|ML|11|372.60|690.00|1|1|3|||TBL|BCO|M||||||3
373.375.203|0|ML|11|372.60|690.00|1|1|3|||TBL|CCL|B||||||3
373.375.204|0|ML|11|372.60|690.00|1|1|3|||TBL|CCL|M||||||3
373.375.205|0|ML|11|372.60|690.00|1|1|3|||TBL|CME|B||||||3
373.375.206|0|ML|11|372.60|690.00|1|1|3|||TBL|CME|M||||||3
373.375.207|0|ML|11|372.60|690.00|1|1|3|||TBL|ANT|B||||||3
373.375.208|0|ML|11|372.60|690.00|1|1|3|||TBL|ANT|M||||||3
373.375.209|0|ML|11|372.60|690.00|1|1|3|||TBL|PTO|B||||||3
373.375.210|0|ML|11|372.60|690.00|1|1|3|||TBL|PTO|M||||||3
373.375.211|0|ML|11|372.60|690.00|1|1|3|||TBL|CRE|B||||||3
373.375.212|0|ML|11|372.60|690.00|1|1|3|||TBL|CRE|M||||||3
373.375.213|0|ML|11|372.60|690.00|1|1|3|||TBL|CAM|B||||||3
373.375.214|0|ML|11|372.60|690.00|1|1|3|||TBL|CAM|M||||||3
373.375.215|0|ML|11|372.60|690.00|1|1|3|||TBL|OUR|B||||||3
373.375.216|0|ML|11|372.60|690.00|1|1|3|||TBL|OUR|M||||||3
373.375.217|0|ML|11|372.60|690.00|1|1|3|||TBL|COB|B||||||3
373.375.218|0|ML|11|372.60|690.00|1|1|3|||TBL|COB|M||||||3
373.375.219|0|ML|11|372.60|690.00|1|1|3|||TBL|CHO|B||||||3
373.375.220|0|ML|11|372.60|690.00|1|1|3|||TBL|CHO|M||||||3
373.375.221|0|ML|11|372.60|690.00|1|1|3|||TBL|VAG|B||||||3
373.375.222|0|ML|11|372.60|690.00|1|1|3|||TBL|VAG|M||||||3
373.375.223|0|ML|11|372.60|690.00|1|1|3|||TBL|AZE|B||||||3
373.375.224|0|ML|11|372.60|690.00|1|1|3|||TBL|AZE|M||||||3
373.375.225|0|ML|11|372.60|690.00|1|1|3|||TBL|AMA|B||||||3
373.375.226|0|ML|11|372.60|690.00|1|1|3|||TBL|AMA|M||||||3
373.375.227|0|ML|11|372.60|690.00|1|1|3|||TBL|AES|B||||||3
373.375.228|0|ML|11|372.60|690.00|1|1|3|||TBL|AES|M||||||3
373.375.229|0|ML|11|372.60|690.00|1|1|3|||TBL|PRA|B||||||3
373.375.230|0|ML|11|372.60|690.00|1|1|3|||TBL|PRA|M||||||3
373.375.231|0|ML|11|372.60|690.00|1|1|3|||TBL|ROS|B||||||3
373.375.232|0|ML|11|372.60|690.00|1|1|3|||TBL|ROS|M||||||3
373.375.233|0|ML|11|372.60|690.00|1|1|3|||TBL|VER|B||||||3
373.375.234|0|ML|11|372.60|690.00|1|1|3|||TBL|VER|M||||||3
373.375.235|0|ML|11|372.60|690.00|1|1|3|||TBL|AZB|||||||3
373.375.236|0|ML|11|372.60|690.00|1|1|3|||TBL|DEN|||||||3
373.375.237|0|ML|11|372.60|690.00|1|1|3|||TBL|BLK|||||||3
373.375.238|0|ML|11|372.60|690.00|1|1|3|||TBL|ART|||||||3
373.375.239|0|ML|11|372.60|690.00|1|1|3|||TBL|LIN|||||||3
373.375.240|0|ML|11|372.60|690.00|1|1|3|||TBL|HAL|||||||3
373.375.91|0|ML|11|394.20|730.00|1|1|3|||BCO|BCO|B||||||3
373.375.93|0|ML|11|394.20|730.00|1|1|3|||BCO|BCO|M||||||3
373.375.95|0|ML|11|394.20|730.00|1|1|3|||CCL|CCL|B||||||3
373.375.97|0|ML|11|394.20|730.00|1|1|3|||CCL|CCL|M||||||3
373.375.99|0|ML|11|394.20|730.00|1|1|3|||CME|CME|B||||||3
373.375.101|0|ML|11|394.20|730.00|1|1|3|||CME|CME|M||||||3
373.375.103|0|ML|11|394.20|730.00|1|1|3|||ANT|ANT|B||||||3
373.375.105|0|ML|11|394.20|730.00|1|1|3|||ANT|ANT|M||||||3
373.375.107|0|ML|11|394.20|730.00|1|1|3|||PTO|PTO|B||||||3
373.375.109|0|ML|11|394.20|730.00|1|1|3|||PTO|PTO|M||||||3
373.375.111|0|ML|11|394.20|730.00|1|1|3|||CRE|CRE|B||||||3
373.375.113|0|ML|11|394.20|730.00|1|1|3|||CRE|CRE|M||||||3
373.375.115|0|ML|11|394.20|730.00|1|1|3|||CAM|CAM|B||||||3
373.375.117|0|ML|11|394.20|730.00|1|1|3|||CAM|CAM|M||||||3
373.375.119|0|ML|11|394.20|730.00|1|1|3|||OUR|OUR|B||||||3
373.375.121|0|ML|11|394.20|730.00|1|1|3|||OUR|OUR|M||||||3
373.375.123|0|ML|11|394.20|730.00|1|1|3|||COB|COB|B||||||3
373.375.125|0|ML|11|394.20|730.00|1|1|3|||COB|COB|M||||||3
373.375.127|0|ML|11|394.20|730.00|1|1|3|||CHO|CHO|B||||||3
373.375.129|0|ML|11|394.20|730.00|1|1|3|||CHO|CHO|M||||||3
373.375.131|0|ML|11|394.20|730.00|1|1|3|||VAG|VAG|B||||||3
373.375.133|0|ML|11|394.20|730.00|1|1|3|||VAG|VAG|M||||||3
373.375.135|0|ML|11|394.20|730.00|1|1|3|||AZE|AZE|B||||||3
373.375.137|0|ML|11|394.20|730.00|1|1|3|||AZE|AZE|M||||||3
373.375.139|0|ML|11|394.20|730.00|1|1|3|||AMA|AMA|B||||||3
373.375.141|0|ML|11|394.20|730.00|1|1|3|||AMA|AMA|M||||||3
373.375.143|0|ML|11|394.20|730.00|1|1|3|||AES|AES|B||||||3
373.375.145|0|ML|11|394.20|730.00|1|1|3|||AES|AES|M||||||3
373.375.147|0|ML|11|394.20|730.00|1|1|3|||PRA|PRA|B||||||3
373.375.149|0|ML|11|394.20|730.00|1|1|3|||PRA|PRA|M||||||3
373.375.151|0|ML|11|394.20|730.00|1|1|3|||ROS|ROS|B||||||3
373.375.153|0|ML|11|394.20|730.00|1|1|3|||ROS|ROS|M||||||3
373.375.155|0|ML|11|394.20|730.00|1|1|3|||VER|VER|B||||||3
373.375.157|0|ML|11|394.20|730.00|1|1|3|||VER|VER|M||||||3
373.375.165|0|ML|11|394.20|730.00|1|1|3|||AZB|AZB|||||||3
373.375.167|0|ML|11|394.20|730.00|1|1|3|||DEN|DEN|||||||3
373.375.169|0|ML|11|394.20|730.00|1|1|3|||BLK|BLK|||||||3
373.375.171|0|ML|11|394.20|730.00|1|1|3|||ART|ART|||||||3
373.375.173|0|ML|11|394.20|730.00|1|1|3|||LIN|LIN|||||||3
373.375.175|0|ML|11|394.20|730.00|1|1|3|||HAL|HAL|||||||3
373.375.241|0|ML|12|318.60|590.00|1|1|3|||TBL|TBL|||||||3
373.375.242|0|ML|12|318.60|590.00|1|1|3|||TEA|TEA|||||||3
373.375.243|0|ML|12|318.60|590.00|1|1|3|||OAK|OAK|||||||3
373.375.244|0|ML|12|318.60|590.00|1|1|3|||JOP|JOP|||||||3
373.375.245|0|ML|12|345.60|640.00|1|1|3|||TBL|BCO|B||||||3
373.375.246|0|ML|12|345.60|640.00|1|1|3|||TBL|BCO|M||||||3
373.375.247|0|ML|12|345.60|640.00|1|1|3|||TBL|CCL|B||||||3
373.375.248|0|ML|12|345.60|640.00|1|1|3|||TBL|CCL|M||||||3
373.375.249|0|ML|12|345.60|640.00|1|1|3|||TBL|CME|B||||||3
373.375.250|0|ML|12|345.60|640.00|1|1|3|||TBL|CME|M||||||3
373.375.251|0|ML|12|345.60|640.00|1|1|3|||TBL|ANT|B||||||3
373.375.252|0|ML|12|345.60|640.00|1|1|3|||TBL|ANT|M||||||3
373.375.253|0|ML|12|345.60|640.00|1|1|3|||TBL|PTO|B||||||3
373.375.254|0|ML|12|345.60|640.00|1|1|3|||TBL|PTO|M||||||3
373.375.255|0|ML|12|345.60|640.00|1|1|3|||TBL|CRE|B||||||3
373.375.256|0|ML|12|345.60|640.00|1|1|3|||TBL|CRE|M||||||3
373.375.257|0|ML|12|345.60|640.00|1|1|3|||TBL|CAM|B||||||3
373.375.258|0|ML|12|345.60|640.00|1|1|3|||TBL|CAM|M||||||3
373.375.259|0|ML|12|345.60|640.00|1|1|3|||TBL|OUR|B||||||3
373.375.260|0|ML|12|345.60|640.00|1|1|3|||TBL|OUR|M||||||3
373.375.261|0|ML|12|345.60|640.00|1|1|3|||TBL|COB|B||||||3
373.375.262|0|ML|12|345.60|640.00|1|1|3|||TBL|COB|M||||||3
373.375.263|0|ML|12|345.60|640.00|1|1|3|||TBL|CHO|B||||||3
373.375.264|0|ML|12|345.60|640.00|1|1|3|||TBL|CHO|M||||||3
373.375.265|0|ML|12|345.60|640.00|1|1|3|||TBL|VAG|B||||||3
373.375.266|0|ML|12|345.60|640.00|1|1|3|||TBL|VAG|M||||||3
373.375.267|0|ML|12|345.60|640.00|1|1|3|||TBL|AZE|B||||||3
373.375.268|0|ML|12|345.60|640.00|1|1|3|||TBL|AZE|M||||||3
373.375.269|0|ML|12|345.60|640.00|1|1|3|||TBL|AMA|B||||||3
373.375.270|0|ML|12|345.60|640.00|1|1|3|||TBL|AMA|M||||||3
373.375.271|0|ML|12|345.60|640.00|1|1|3|||TBL|AES|B||||||3
373.375.272|0|ML|12|345.60|640.00|1|1|3|||TBL|AES|M||||||3
373.375.273|0|ML|12|345.60|640.00|1|1|3|||TBL|PRA|B||||||3
373.375.274|0|ML|12|345.60|640.00|1|1|3|||TBL|PRA|M||||||3
373.375.275|0|ML|12|345.60|640.00|1|1|3|||TBL|ROS|B||||||3
373.375.276|0|ML|12|345.60|640.00|1|1|3|||TBL|ROS|M||||||3
373.375.277|0|ML|12|345.60|640.00|1|1|3|||TBL|VER|B||||||3
373.375.278|0|ML|12|345.60|640.00|1|1|3|||TBL|VER|M||||||3
373.375.279|0|ML|12|345.60|640.00|1|1|3|||TBL|AZB|||||||3
373.375.280|0|ML|12|345.60|640.00|1|1|3|||TBL|DEN|||||||3
373.375.281|0|ML|12|345.60|640.00|1|1|3|||TBL|BLK|||||||3
373.375.282|0|ML|12|345.60|640.00|1|1|3|||TBL|ART|||||||3
373.375.283|0|ML|12|345.60|640.00|1|1|3|||TBL|LIN|||||||3
373.375.284|0|ML|12|345.60|640.00|1|1|3|||TBL|HAL|||||||3
373.375.285|0|ML|12|367.20|680.00|1|1|3|||BCO|BCO|B||||||3
373.375.286|0|ML|12|367.20|680.00|1|1|3|||BCO|BCO|M||||||3
373.375.287|0|ML|12|367.20|680.00|1|1|3|||CCL|CCL|B||||||3
373.375.288|0|ML|12|367.20|680.00|1|1|3|||CCL|CCL|M||||||3
373.375.289|0|ML|12|367.20|680.00|1|1|3|||CME|CME|B||||||3
373.375.290|0|ML|12|367.20|680.00|1|1|3|||CME|CME|M||||||3
373.375.291|0|ML|12|367.20|680.00|1|1|3|||ANT|ANT|B||||||3
373.375.292|0|ML|12|367.20|680.00|1|1|3|||ANT|ANT|M||||||3
373.375.293|0|ML|12|367.20|680.00|1|1|3|||PTO|PTO|B||||||3
373.375.294|0|ML|12|367.20|680.00|1|1|3|||PTO|PTO|M||||||3
373.375.295|0|ML|12|367.20|680.00|1|1|3|||CRE|CRE|B||||||3
373.375.296|0|ML|12|367.20|680.00|1|1|3|||CRE|CRE|M||||||3
373.375.297|0|ML|12|367.20|680.00|1|1|3|||CAM|CAM|B||||||3
373.375.298|0|ML|12|367.20|680.00|1|1|3|||CAM|CAM|M||||||3
373.375.299|0|ML|12|367.20|680.00|1|1|3|||OUR|OUR|B||||||3
373.375.300|0|ML|12|367.20|680.00|1|1|3|||OUR|OUR|M||||||3
373.375.301|0|ML|12|367.20|680.00|1|1|3|||COB|COB|B||||||3
373.375.302|0|ML|12|367.20|680.00|1|1|3|||COB|COB|M||||||3
373.375.303|0|ML|12|367.20|680.00|1|1|3|||CHO|CHO|B||||||3
373.375.304|0|ML|12|367.20|680.00|1|1|3|||CHO|CHO|M||||||3
373.375.305|0|ML|12|367.20|680.00|1|1|3|||VAG|VAG|B||||||3
373.375.306|0|ML|12|367.20|680.00|1|1|3|||VAG|VAG|M||||||3
373.375.307|0|ML|12|367.20|680.00|1|1|3|||AZE|AZE|B||||||3
373.375.308|0|ML|12|367.20|680.00|1|1|3|||AZE|AZE|M||||||3
373.375.309|0|ML|12|367.20|680.00|1|1|3|||AMA|AMA|B||||||3
373.375.310|0|ML|12|367.20|680.00|1|1|3|||AMA|AMA|M||||||3
373.375.311|0|ML|12|367.20|680.00|1|1|3|||AES|AES|B||||||3
373.375.312|0|ML|12|367.20|680.00|1|1|3|||AES|AES|M||||||3
373.375.313|0|ML|12|367.20|680.00|1|1|3|||PRA|PRA|B||||||3
373.375.314|0|ML|12|367.20|680.00|1|1|3|||PRA|PRA|M||||||3
373.375.315|0|ML|12|367.20|680.00|1|1|3|||ROS|ROS|B||||||3
373.375.316|0|ML|12|367.20|680.00|1|1|3|||ROS|ROS|M||||||3
373.375.317|0|ML|12|367.20|680.00|1|1|3|||VER|VER|B||||||3
373.375.318|0|ML|12|367.20|680.00|1|1|3|||VER|VER|M||||||3
373.375.319|0|ML|12|367.20|680.00|1|1|3|||AZB|AZB|||||||3
373.375.320|0|ML|12|367.20|680.00|1|1|3|||DEN|DEN|||||||3
373.375.321|0|ML|12|367.20|680.00|1|1|3|||BLK|BLK|||||||3
373.375.322|0|ML|12|367.20|680.00|1|1|3|||ART|ART|||||||3
373.375.323|0|ML|12|367.20|680.00|1|1|3|||LIN|LIN|||||||3
373.375.324|0|ML|12|367.20|680.00|1|1|3|||HAL|HAL|||||||3
373.375.327|0|ML|13|567.00|1050.00|1|1|3|||TBL|TBL|||||||3
373.375.328|0|ML|13|567.00|1050.00|1|1|3|||TEA|TEA|||||||3
373.375.329|0|ML|13|567.00|1050.00|1|1|3|||OAK|OAK|||||||3
373.375.330|0|ML|13|567.00|1050.00|1|1|3|||JOP|JOP|||||||3
373.375.331|0|ML|13|594.00|1100.00|1|1|3|||TBL|BCO|B||||||3
373.375.332|0|ML|13|594.00|1100.00|1|1|3|||TBL|BCO|M||||||3
373.375.333|0|ML|13|594.00|1100.00|1|1|3|||TBL|CCL|B||||||3
373.375.334|0|ML|13|594.00|1100.00|1|1|3|||TBL|CCL|M||||||3
373.375.335|0|ML|13|594.00|1100.00|1|1|3|||TBL|CME|B||||||3
373.375.336|0|ML|13|594.00|1100.00|1|1|3|||TBL|CME|M||||||3
373.375.337|0|ML|13|594.00|1100.00|1|1|3|||TBL|ANT|B||||||3
373.375.338|0|ML|13|594.00|1100.00|1|1|3|||TBL|ANT|M||||||3
373.375.339|0|ML|13|594.00|1100.00|1|1|3|||TBL|PTO|B||||||3
373.375.340|0|ML|13|594.00|1100.00|1|1|3|||TBL|PTO|M||||||3
373.375.341|0|ML|13|594.00|1100.00|1|1|3|||TBL|CRE|B||||||3
373.375.342|0|ML|13|594.00|1100.00|1|1|3|||TBL|CRE|M||||||3
373.375.343|0|ML|13|594.00|1100.00|1|1|3|||TBL|CAM|B||||||3
373.375.344|0|ML|13|594.00|1100.00|1|1|3|||TBL|CAM|M||||||3
373.375.345|0|ML|13|594.00|1100.00|1|1|3|||TBL|OUR|B||||||3
373.375.346|0|ML|13|594.00|1100.00|1|1|3|||TBL|OUR|M||||||3
373.375.347|0|ML|13|594.00|1100.00|1|1|3|||TBL|COB|B||||||3
373.375.348|0|ML|13|594.00|1100.00|1|1|3|||TBL|COB|M||||||3
373.375.349|0|ML|13|594.00|1100.00|1|1|3|||TBL|CHO|B||||||3
373.375.350|0|ML|13|594.00|1100.00|1|1|3|||TBL|CHO|M||||||3
373.375.351|0|ML|13|594.00|1100.00|1|1|3|||TBL|VAG|B||||||3
373.375.352|0|ML|13|594.00|1100.00|1|1|3|||TBL|VAG|M||||||3
373.375.353|0|ML|13|594.00|1100.00|1|1|3|||TBL|AZE|B||||||3
373.375.354|0|ML|13|594.00|1100.00|1|1|3|||TBL|AZE|M||||||3
373.375.355|0|ML|13|594.00|1100.00|1|1|3|||TBL|AMA|B||||||3
373.375.356|0|ML|13|594.00|1100.00|1|1|3|||TBL|AMA|M||||||3
373.375.357|0|ML|13|594.00|1100.00|1|1|3|||TBL|AES|B||||||3
373.375.358|0|ML|13|594.00|1100.00|1|1|3|||TBL|AES|M||||||3
373.375.359|0|ML|13|594.00|1100.00|1|1|3|||TBL|PRA|B||||||3
373.375.360|0|ML|13|594.00|1100.00|1|1|3|||TBL|PRA|M||||||3
373.375.361|0|ML|13|594.00|1100.00|1|1|3|||TBL|ROS|B||||||3
373.375.362|0|ML|13|594.00|1100.00|1|1|3|||TBL|ROS|M||||||3
373.375.363|0|ML|13|594.00|1100.00|1|1|3|||TBL|VER|B||||||3
373.375.364|0|ML|13|594.00|1100.00|1|1|3|||TBL|VER|M||||||3
373.375.365|0|ML|13|594.00|1100.00|1|1|3|||TBL|AZB|||||||3
373.375.366|0|ML|13|594.00|1100.00|1|1|3|||TBL|DEN|||||||3
373.375.367|0|ML|13|594.00|1100.00|1|1|3|||TBL|BLK|||||||3
373.375.368|0|ML|13|594.00|1100.00|1|1|3|||TBL|ART|||||||3
373.375.369|0|ML|13|594.00|1100.00|1|1|3|||TBL|LIN|||||||3
373.375.370|0|ML|13|594.00|1100.00|1|1|3|||TBL|HAL|||||||3
373.375.92|0|ML|13|615.60|1140.00|1|1|3|||BCO|BCO|B||||||3
373.375.94|0|ML|13|615.60|1140.00|1|1|3|||BCO|BCO|M||||||3
373.375.96|0|ML|13|615.60|1140.00|1|1|3|||CCL|CCL|B||||||3
373.375.98|0|ML|13|615.60|1140.00|1|1|3|||CCL|CCL|M||||||3
373.375.100|0|ML|13|615.60|1140.00|1|1|3|||CME|CME|B||||||3
373.375.102|0|ML|13|615.60|1140.00|1|1|3|||CME|CME|M||||||3
373.375.104|0|ML|13|615.60|1140.00|1|1|3|||ANT|ANT|B||||||3
373.375.106|0|ML|13|615.60|1140.00|1|1|3|||ANT|ANT|M||||||3
373.375.108|0|ML|13|615.60|1140.00|1|1|3|||PTO|PTO|B||||||3
373.375.110|0|ML|13|615.60|1140.00|1|1|3|||PTO|PTO|M||||||3
373.375.112|0|ML|13|615.60|1140.00|1|1|3|||CRE|CRE|B||||||3
373.375.114|0|ML|13|615.60|1140.00|1|1|3|||CRE|CRE|M||||||3
373.375.116|0|ML|13|615.60|1140.00|1|1|3|||CAM|CAM|B||||||3
373.375.118|0|ML|13|615.60|1140.00|1|1|3|||CAM|CAM|M||||||3
373.375.120|0|ML|13|615.60|1140.00|1|1|3|||OUR|OUR|B||||||3
373.375.122|0|ML|13|615.60|1140.00|1|1|3|||OUR|OUR|M||||||3
373.375.124|0|ML|13|615.60|1140.00|1|1|3|||COB|COB|B||||||3
373.375.126|0|ML|13|615.60|1140.00|1|1|3|||COB|COB|M||||||3
373.375.128|0|ML|13|615.60|1140.00|1|1|3|||CHO|CHO|B||||||3
373.375.130|0|ML|13|615.60|1140.00|1|1|3|||CHO|CHO|M||||||3
373.375.132|0|ML|13|615.60|1140.00|1|1|3|||VAG|VAG|B||||||3
373.375.134|0|ML|13|615.60|1140.00|1|1|3|||VAG|VAG|M||||||3
373.375.136|0|ML|13|615.60|1140.00|1|1|3|||AZE|AZE|B||||||3
373.375.138|0|ML|13|615.60|1140.00|1|1|3|||AZE|AZE|M||||||3
373.375.140|0|ML|13|615.60|1140.00|1|1|3|||AMA|AMA|B||||||3
373.375.142|0|ML|13|615.60|1140.00|1|1|3|||AMA|AMA|M||||||3
373.375.144|0|ML|13|615.60|1140.00|1|1|3|||AES|AES|B||||||3
373.375.146|0|ML|13|615.60|1140.00|1|1|3|||AES|AES|M||||||3
373.375.148|0|ML|13|615.60|1140.00|1|1|3|||PRA|PRA|B||||||3
373.375.150|0|ML|13|615.60|1140.00|1|1|3|||PRA|PRA|M||||||3
373.375.152|0|ML|13|615.60|1140.00|1|1|3|||ROS|ROS|B||||||3
373.375.154|0|ML|13|615.60|1140.00|1|1|3|||ROS|ROS|M||||||3
373.375.156|0|ML|13|615.60|1140.00|1|1|3|||VER|VER|B||||||3
373.375.158|0|ML|13|615.60|1140.00|1|1|3|||VER|VER|M||||||3
373.375.166|0|ML|13|615.60|1140.00|1|1|3|||AZB|AZB|||||||3
373.375.168|0|ML|13|615.60|1140.00|1|1|3|||DEN|DEN|||||||3
373.375.170|0|ML|13|615.60|1140.00|1|1|3|||BLK|BLK|||||||3
373.375.172|0|ML|13|615.60|1140.00|1|1|3|||ART|ART|||||||3
373.375.174|0|ML|13|615.60|1140.00|1|1|3|||LIN|LIN|||||||3
373.375.176|0|ML|13|615.60|1140.00|1|1|3|||HAL|HAL|||||||3
376.377.241|0|ML|14|399.60|740.00|1|1|3|||TBL|TBL|||||||7
376.377.242|0|ML|14|399.60|740.00|1|1|3|||TEA|TEA|||||||7
376.377.243|0|ML|14|399.60|740.00|1|1|3|||OAK|OAK|||||||7
376.377.244|0|ML|14|399.60|740.00|1|1|3|||JOP|JOP|||||||7
376.377.245|0|ML|14|426.60|790.00|1|1|3|||TBL|BCO|B||||||7
376.377.246|0|ML|14|426.60|790.00|1|1|3|||TBL|BCO|M||||||7
376.377.247|0|ML|14|426.60|790.00|1|1|3|||TBL|CCL|B||||||7
376.377.248|0|ML|14|426.60|790.00|1|1|3|||TBL|CCL|M||||||7
376.377.249|0|ML|14|426.60|790.00|1|1|3|||TBL|CME|B||||||7
376.377.250|0|ML|14|426.60|790.00|1|1|3|||TBL|CME|M||||||7
376.377.251|0|ML|14|426.60|790.00|1|1|3|||TBL|ANT|B||||||7
376.377.252|0|ML|14|426.60|790.00|1|1|3|||TBL|ANT|M||||||7
376.377.253|0|ML|14|426.60|790.00|1|1|3|||TBL|PTO|B||||||7
376.377.254|0|ML|14|426.60|790.00|1|1|3|||TBL|PTO|M||||||7
376.377.255|0|ML|14|426.60|790.00|1|1|3|||TBL|CRE|B||||||7
376.377.256|0|ML|14|426.60|790.00|1|1|3|||TBL|CRE|M||||||7
376.377.257|0|ML|14|426.60|790.00|1|1|3|||TBL|CAM|B||||||7
376.377.258|0|ML|14|426.60|790.00|1|1|3|||TBL|CAM|M||||||7
376.377.259|0|ML|14|426.60|790.00|1|1|3|||TBL|OUR|B||||||7
376.377.260|0|ML|14|426.60|790.00|1|1|3|||TBL|OUR|M||||||7
376.377.261|0|ML|14|426.60|790.00|1|1|3|||TBL|COB|B||||||7
376.377.262|0|ML|14|426.60|790.00|1|1|3|||TBL|COB|M||||||7
376.377.263|0|ML|14|426.60|790.00|1|1|3|||TBL|CHO|B||||||7
376.377.264|0|ML|14|426.60|790.00|1|1|3|||TBL|CHO|M||||||7
376.377.265|0|ML|14|426.60|790.00|1|1|3|||TBL|VAG|B||||||7
376.377.266|0|ML|14|426.60|790.00|1|1|3|||TBL|VAG|M||||||7
376.377.267|0|ML|14|426.60|790.00|1|1|3|||TBL|AZE|B||||||7
376.377.268|0|ML|14|426.60|790.00|1|1|3|||TBL|AZE|M||||||7
376.377.269|0|ML|14|426.60|790.00|1|1|3|||TBL|AMA|B||||||7
376.377.270|0|ML|14|426.60|790.00|1|1|3|||TBL|AMA|M||||||7
376.377.271|0|ML|14|426.60|790.00|1|1|3|||TBL|AES|B||||||7
376.377.272|0|ML|14|426.60|790.00|1|1|3|||TBL|AES|M||||||7
376.377.273|0|ML|14|426.60|790.00|1|1|3|||TBL|PRA|B||||||7
376.377.274|0|ML|14|426.60|790.00|1|1|3|||TBL|PRA|M||||||7
376.377.275|0|ML|14|426.60|790.00|1|1|3|||TBL|ROS|B||||||7
376.377.276|0|ML|14|426.60|790.00|1|1|3|||TBL|ROS|M||||||7
376.377.277|0|ML|14|426.60|790.00|1|1|3|||TBL|VER|B||||||7
376.377.278|0|ML|14|426.60|790.00|1|1|3|||TBL|VER|M||||||7
376.377.279|0|ML|14|426.60|790.00|1|1|3|||TBL|AZB|||||||7
376.377.280|0|ML|14|426.60|790.00|1|1|3|||TBL|DEN|||||||7
376.377.281|0|ML|14|426.60|790.00|1|1|3|||TBL|BLK|||||||7
376.377.282|0|ML|14|426.60|790.00|1|1|3|||TBL|ART|||||||7
376.377.283|0|ML|14|426.60|790.00|1|1|3|||TBL|LIN|||||||7
376.377.284|0|ML|14|426.60|790.00|1|1|3|||TBL|HAL|||||||7
376.377.285|0|ML|14|448.20|830.00|1|1|3|||BCO|BCO|B||||||7
376.377.286|0|ML|14|448.20|830.00|1|1|3|||BCO|BCO|M||||||7
376.377.287|0|ML|14|448.20|830.00|1|1|3|||CCL|CCL|B||||||7
376.377.288|0|ML|14|448.20|830.00|1|1|3|||CCL|CCL|M||||||7
376.377.289|0|ML|14|448.20|830.00|1|1|3|||CME|CME|B||||||7
376.377.290|0|ML|14|448.20|830.00|1|1|3|||CME|CME|M||||||7
376.377.291|0|ML|14|448.20|830.00|1|1|3|||ANT|ANT|B||||||7
376.377.292|0|ML|14|448.20|830.00|1|1|3|||ANT|ANT|M||||||7
376.377.293|0|ML|14|448.20|830.00|1|1|3|||PTO|PTO|B||||||7
376.377.294|0|ML|14|448.20|830.00|1|1|3|||PTO|PTO|M||||||7
376.377.295|0|ML|14|448.20|830.00|1|1|3|||CRE|CRE|B||||||7
376.377.296|0|ML|14|448.20|830.00|1|1|3|||CRE|CRE|M||||||7
376.377.297|0|ML|14|448.20|830.00|1|1|3|||CAM|CAM|B||||||7
376.377.298|0|ML|14|448.20|830.00|1|1|3|||CAM|CAM|M||||||7
376.377.299|0|ML|14|448.20|830.00|1|1|3|||OUR|OUR|B||||||7
376.377.300|0|ML|14|448.20|830.00|1|1|3|||OUR|OUR|M||||||7
376.377.301|0|ML|14|448.20|830.00|1|1|3|||COB|COB|B||||||7
376.377.302|0|ML|14|448.20|830.00|1|1|3|||COB|COB|M||||||7
376.377.303|0|ML|14|448.20|830.00|1|1|3|||CHO|CHO|B||||||7
376.377.304|0|ML|14|448.20|830.00|1|1|3|||CHO|CHO|M||||||7
376.377.305|0|ML|14|448.20|830.00|1|1|3|||VAG|VAG|B||||||7
376.377.306|0|ML|14|448.20|830.00|1|1|3|||VAG|VAG|M||||||7
376.377.307|0|ML|14|448.20|830.00|1|1|3|||AZE|AZE|B||||||7
376.377.308|0|ML|14|448.20|830.00|1|1|3|||AZE|AZE|M||||||7
376.377.309|0|ML|14|448.20|830.00|1|1|3|||AMA|AMA|B||||||7
376.377.310|0|ML|14|448.20|830.00|1|1|3|||AMA|AMA|M||||||7
376.377.311|0|ML|14|448.20|830.00|1|1|3|||AES|AES|B||||||7
376.377.312|0|ML|14|448.20|830.00|1|1|3|||AES|AES|M||||||7
376.377.313|0|ML|14|448.20|830.00|1|1|3|||PRA|PRA|B||||||7
376.377.314|0|ML|14|448.20|830.00|1|1|3|||PRA|PRA|M||||||7
376.377.315|0|ML|14|448.20|830.00|1|1|3|||ROS|ROS|B||||||7
376.377.316|0|ML|14|448.20|830.00|1|1|3|||ROS|ROS|M||||||7
376.377.317|0|ML|14|448.20|830.00|1|1|3|||VER|VER|B||||||7
376.377.318|0|ML|14|448.20|830.00|1|1|3|||VER|VER|M||||||7
376.377.319|0|ML|14|448.20|830.00|1|1|3|||AZB|AZB|||||||7
376.377.320|0|ML|14|448.20|830.00|1|1|3|||DEN|DEN|||||||7
376.377.321|0|ML|14|448.20|830.00|1|1|3|||BLK|BLK|||||||7
376.377.322|0|ML|14|448.20|830.00|1|1|3|||ART|ART|||||||7
376.377.323|0|ML|14|448.20|830.00|1|1|3|||LIN|LIN|||||||7
376.377.324|0|ML|14|448.20|830.00|1|1|3|||HAL|HAL|||||||7
376.377.327|0|ML|15|702.00|1300.00|1|1|3|||TBL|TBL|||||||7
376.377.328|0|ML|15|702.00|1300.00|1|1|3|||TEA|TEA|||||||7
376.377.329|0|ML|15|702.00|1300.00|1|1|3|||OAK|OAK|||||||7
376.377.330|0|ML|15|702.00|1300.00|1|1|3|||JOP|JOP|||||||7
376.377.331|0|ML|15|729.00|1350.00|1|1|3|||TBL|BCO|B||||||7
376.377.332|0|ML|15|729.00|1350.00|1|1|3|||TBL|BCO|M||||||7
376.377.333|0|ML|15|729.00|1350.00|1|1|3|||TBL|CCL|B||||||7
376.377.334|0|ML|15|729.00|1350.00|1|1|3|||TBL|CCL|M||||||7
376.377.335|0|ML|15|729.00|1350.00|1|1|3|||TBL|CME|B||||||7
376.377.336|0|ML|15|729.00|1350.00|1|1|3|||TBL|CME|M||||||7
376.377.337|0|ML|15|729.00|1350.00|1|1|3|||TBL|ANT|B||||||7
376.377.338|0|ML|15|729.00|1350.00|1|1|3|||TBL|ANT|M||||||7
376.377.339|0|ML|15|729.00|1350.00|1|1|3|||TBL|PTO|B||||||7
376.377.340|0|ML|15|729.00|1350.00|1|1|3|||TBL|PTO|M||||||7
376.377.341|0|ML|15|729.00|1350.00|1|1|3|||TBL|CRE|B||||||7
376.377.342|0|ML|15|729.00|1350.00|1|1|3|||TBL|CRE|M||||||7
376.377.343|0|ML|15|729.00|1350.00|1|1|3|||TBL|CAM|B||||||7
376.377.344|0|ML|15|729.00|1350.00|1|1|3|||TBL|CAM|M||||||7
376.377.345|0|ML|15|729.00|1350.00|1|1|3|||TBL|OUR|B||||||7
376.377.346|0|ML|15|729.00|1350.00|1|1|3|||TBL|OUR|M||||||7
376.377.347|0|ML|15|729.00|1350.00|1|1|3|||TBL|COB|B||||||7
376.377.348|0|ML|15|729.00|1350.00|1|1|3|||TBL|COB|M||||||7
376.377.349|0|ML|15|729.00|1350.00|1|1|3|||TBL|CHO|B||||||7
376.377.350|0|ML|15|729.00|1350.00|1|1|3|||TBL|CHO|M||||||7
376.377.351|0|ML|15|729.00|1350.00|1|1|3|||TBL|VAG|B||||||7
376.377.352|0|ML|15|729.00|1350.00|1|1|3|||TBL|VAG|M||||||7
376.377.353|0|ML|15|729.00|1350.00|1|1|3|||TBL|AZE|B||||||7
376.377.354|0|ML|15|729.00|1350.00|1|1|3|||TBL|AZE|M||||||7
376.377.355|0|ML|15|729.00|1350.00|1|1|3|||TBL|AMA|B||||||7
376.377.356|0|ML|15|729.00|1350.00|1|1|3|||TBL|AMA|M||||||7
376.377.357|0|ML|15|729.00|1350.00|1|1|3|||TBL|AES|B||||||7
376.377.358|0|ML|15|729.00|1350.00|1|1|3|||TBL|AES|M||||||7
376.377.359|0|ML|15|729.00|1350.00|1|1|3|||TBL|PRA|B||||||7
376.377.360|0|ML|15|729.00|1350.00|1|1|3|||TBL|PRA|M||||||7
376.377.361|0|ML|15|729.00|1350.00|1|1|3|||TBL|ROS|B||||||7
376.377.362|0|ML|15|729.00|1350.00|1|1|3|||TBL|ROS|M||||||7
376.377.363|0|ML|15|729.00|1350.00|1|1|3|||TBL|VER|B||||||7
376.377.364|0|ML|15|729.00|1350.00|1|1|3|||TBL|VER|M||||||7
376.377.365|0|ML|15|729.00|1350.00|1|1|3|||TBL|AZB|||||||7
376.377.366|0|ML|15|729.00|1350.00|1|1|3|||TBL|DEN|||||||7
376.377.367|0|ML|15|729.00|1350.00|1|1|3|||TBL|BLK|||||||7
376.377.368|0|ML|15|729.00|1350.00|1|1|3|||TBL|ART|||||||7
376.377.369|0|ML|15|729.00|1350.00|1|1|3|||TBL|LIN|||||||7
376.377.370|0|ML|15|729.00|1350.00|1|1|3|||TBL|HAL|||||||7
376.377.92|0|ML|15|750.60|1390.00|1|1|3|||BCO|BCO|B||||||7
376.377.94|0|ML|15|750.60|1390.00|1|1|3|||BCO|BCO|M||||||7
376.377.96|0|ML|15|750.60|1390.00|1|1|3|||CCL|CCL|B||||||7
376.377.98|0|ML|15|750.60|1390.00|1|1|3|||CCL|CCL|M||||||7
376.377.100|0|ML|15|750.60|1390.00|1|1|3|||CME|CME|B||||||7
376.377.102|0|ML|15|750.60|1390.00|1|1|3|||CME|CME|M||||||7
376.377.104|0|ML|15|750.60|1390.00|1|1|3|||ANT|ANT|B||||||7
376.377.106|0|ML|15|750.60|1390.00|1|1|3|||ANT|ANT|M||||||7
376.377.108|0|ML|15|750.60|1390.00|1|1|3|||PTO|PTO|B||||||7
376.377.110|0|ML|15|750.60|1390.00|1|1|3|||PTO|PTO|M||||||7
376.377.112|0|ML|15|750.60|1390.00|1|1|3|||CRE|CRE|B||||||7
376.377.114|0|ML|15|750.60|1390.00|1|1|3|||CRE|CRE|M||||||7
376.377.116|0|ML|15|750.60|1390.00|1|1|3|||CAM|CAM|B||||||7
376.377.118|0|ML|15|750.60|1390.00|1|1|3|||CAM|CAM|M||||||7
376.377.120|0|ML|15|750.60|1390.00|1|1|3|||OUR|OUR|B||||||7
376.377.122|0|ML|15|750.60|1390.00|1|1|3|||OUR|OUR|M||||||7
376.377.124|0|ML|15|750.60|1390.00|1|1|3|||COB|COB|B||||||7
376.377.126|0|ML|15|750.60|1390.00|1|1|3|||COB|COB|M||||||7
376.377.128|0|ML|15|750.60|1390.00|1|1|3|||CHO|CHO|B||||||7
376.377.130|0|ML|15|750.60|1390.00|1|1|3|||CHO|CHO|M||||||7
376.377.132|0|ML|15|750.60|1390.00|1|1|3|||VAG|VAG|B||||||7
376.377.134|0|ML|15|750.60|1390.00|1|1|3|||VAG|VAG|M||||||7
376.377.136|0|ML|15|750.60|1390.00|1|1|3|||AZE|AZE|B||||||7
376.377.138|0|ML|15|750.60|1390.00|1|1|3|||AZE|AZE|M||||||7
376.377.140|0|ML|15|750.60|1390.00|1|1|3|||AMA|AMA|B||||||7
376.377.142|0|ML|15|750.60|1390.00|1|1|3|||AMA|AMA|M||||||7
376.377.144|0|ML|15|750.60|1390.00|1|1|3|||AES|AES|B||||||7
376.377.146|0|ML|15|750.60|1390.00|1|1|3|||AES|AES|M||||||7
376.377.148|0|ML|15|750.60|1390.00|1|1|3|||PRA|PRA|B||||||7
376.377.150|0|ML|15|750.60|1390.00|1|1|3|||PRA|PRA|M||||||7
376.377.152|0|ML|15|750.60|1390.00|1|1|3|||ROS|ROS|B||||||7
376.377.154|0|ML|15|750.60|1390.00|1|1|3|||ROS|ROS|M||||||7
376.377.156|0|ML|15|750.60|1390.00|1|1|3|||VER|VER|B||||||7
376.377.158|0|ML|15|750.60|1390.00|1|1|3|||VER|VER|M||||||7
376.377.166|0|ML|15|750.60|1390.00|1|1|3|||AZB|AZB|||||||7
376.377.168|0|ML|15|750.60|1390.00|1|1|3|||DEN|DEN|||||||7
376.377.170|0|ML|15|750.60|1390.00|1|1|3|||BLK|BLK|||||||7
376.377.172|0|ML|15|750.60|1390.00|1|1|3|||ART|ART|||||||7
376.377.174|0|ML|15|750.60|1390.00|1|1|3|||LIN|LIN|||||||7
376.377.176|0|ML|15|750.60|1390.00|1|1|3|||HAL|HAL|||||||7
378.377.197|0|ML|16|534.60|990.00|1|1|3|||TBL|TBL|||||||8
378.377.198|0|ML|16|534.60|990.00|1|1|3|||TEA|TEA|||||||8
378.377.199|0|ML|16|534.60|990.00|1|1|3|||OAK|OAK|||||||8
378.377.200|0|ML|16|534.60|990.00|1|1|3|||JOP|JOP|||||||8
378.377.201|0|ML|16|561.60|1040.00|1|1|3|||TBL|BCO|B||||||8
378.377.202|0|ML|16|561.60|1040.00|1|1|3|||TBL|BCO|M||||||8
378.377.203|0|ML|16|561.60|1040.00|1|1|3|||TBL|CCL|B||||||8
378.377.204|0|ML|16|561.60|1040.00|1|1|3|||TBL|CCL|M||||||8
378.377.205|0|ML|16|561.60|1040.00|1|1|3|||TBL|CME|B||||||8
378.377.206|0|ML|16|561.60|1040.00|1|1|3|||TBL|CME|M||||||8
378.377.207|0|ML|16|561.60|1040.00|1|1|3|||TBL|ANT|B||||||8
378.377.208|0|ML|16|561.60|1040.00|1|1|3|||TBL|ANT|M||||||8
378.377.209|0|ML|16|561.60|1040.00|1|1|3|||TBL|PTO|B||||||8
378.377.210|0|ML|16|561.60|1040.00|1|1|3|||TBL|PTO|M||||||8
378.377.211|0|ML|16|561.60|1040.00|1|1|3|||TBL|CRE|B||||||8
378.377.212|0|ML|16|561.60|1040.00|1|1|3|||TBL|CRE|M||||||8
378.377.213|0|ML|16|561.60|1040.00|1|1|3|||TBL|CAM|B||||||8
378.377.214|0|ML|16|561.60|1040.00|1|1|3|||TBL|CAM|M||||||8
378.377.215|0|ML|16|561.60|1040.00|1|1|3|||TBL|OUR|B||||||8
378.377.216|0|ML|16|561.60|1040.00|1|1|3|||TBL|OUR|M||||||8
378.377.217|0|ML|16|561.60|1040.00|1|1|3|||TBL|COB|B||||||8
378.377.218|0|ML|16|561.60|1040.00|1|1|3|||TBL|COB|M||||||8
378.377.219|0|ML|16|561.60|1040.00|1|1|3|||TBL|CHO|B||||||8
378.377.220|0|ML|16|561.60|1040.00|1|1|3|||TBL|CHO|M||||||8
378.377.221|0|ML|16|561.60|1040.00|1|1|3|||TBL|VAG|B||||||8
378.377.222|0|ML|16|561.60|1040.00|1|1|3|||TBL|VAG|M||||||8
378.377.223|0|ML|16|561.60|1040.00|1|1|3|||TBL|AZE|B||||||8
378.377.224|0|ML|16|561.60|1040.00|1|1|3|||TBL|AZE|M||||||8
378.377.225|0|ML|16|561.60|1040.00|1|1|3|||TBL|AMA|B||||||8
378.377.226|0|ML|16|561.60|1040.00|1|1|3|||TBL|AMA|M||||||8
378.377.227|0|ML|16|561.60|1040.00|1|1|3|||TBL|AES|B||||||8
378.377.228|0|ML|16|561.60|1040.00|1|1|3|||TBL|AES|M||||||8
378.377.229|0|ML|16|561.60|1040.00|1|1|3|||TBL|PRA|B||||||8
378.377.230|0|ML|16|561.60|1040.00|1|1|3|||TBL|PRA|M||||||8
378.377.231|0|ML|16|561.60|1040.00|1|1|3|||TBL|ROS|B||||||8
378.377.232|0|ML|16|561.60|1040.00|1|1|3|||TBL|ROS|M||||||8
378.377.233|0|ML|16|561.60|1040.00|1|1|3|||TBL|VER|B||||||8
378.377.234|0|ML|16|561.60|1040.00|1|1|3|||TBL|VER|M||||||8
378.377.235|0|ML|16|561.60|1040.00|1|1|3|||TBL|AZB|||||||8
378.377.236|0|ML|16|561.60|1040.00|1|1|3|||TBL|DEN|||||||8
378.377.237|0|ML|16|561.60|1040.00|1|1|3|||TBL|BLK|||||||8
378.377.238|0|ML|16|561.60|1040.00|1|1|3|||TBL|ART|||||||8
378.377.239|0|ML|16|561.60|1040.00|1|1|3|||TBL|LIN|||||||8
378.377.240|0|ML|16|561.60|1040.00|1|1|3|||TBL|HAL|||||||8
378.377.91|0|ML|16|583.20|1080.00|1|1|3|||BCO|BCO|B||||||8
378.377.93|0|ML|16|583.20|1080.00|1|1|3|||BCO|BCO|M||||||8
378.377.95|0|ML|16|583.20|1080.00|1|1|3|||CCL|CCL|B||||||8
378.377.97|0|ML|16|583.20|1080.00|1|1|3|||CCL|CCL|M||||||8
378.377.99|0|ML|16|583.20|1080.00|1|1|3|||CME|CME|B||||||8
378.377.101|0|ML|16|583.20|1080.00|1|1|3|||CME|CME|M||||||8
378.377.103|0|ML|16|583.20|1080.00|1|1|3|||ANT|ANT|B||||||8
378.377.105|0|ML|16|583.20|1080.00|1|1|3|||ANT|ANT|M||||||8
378.377.107|0|ML|16|583.20|1080.00|1|1|3|||PTO|PTO|B||||||8
378.377.109|0|ML|16|583.20|1080.00|1|1|3|||PTO|PTO|M||||||8
378.377.111|0|ML|16|583.20|1080.00|1|1|3|||CRE|CRE|B||||||8
378.377.113|0|ML|16|583.20|1080.00|1|1|3|||CRE|CRE|M||||||8
378.377.115|0|ML|16|583.20|1080.00|1|1|3|||CAM|CAM|B||||||8
378.377.117|0|ML|16|583.20|1080.00|1|1|3|||CAM|CAM|M||||||8
378.377.119|0|ML|16|583.20|1080.00|1|1|3|||OUR|OUR|B||||||8
378.377.121|0|ML|16|583.20|1080.00|1|1|3|||OUR|OUR|M||||||8
378.377.123|0|ML|16|583.20|1080.00|1|1|3|||COB|COB|B||||||8
378.377.125|0|ML|16|583.20|1080.00|1|1|3|||COB|COB|M||||||8
378.377.127|0|ML|16|583.20|1080.00|1|1|3|||CHO|CHO|B||||||8
378.377.129|0|ML|16|583.20|1080.00|1|1|3|||CHO|CHO|M||||||8
378.377.131|0|ML|16|583.20|1080.00|1|1|3|||VAG|VAG|B||||||8
378.377.133|0|ML|16|583.20|1080.00|1|1|3|||VAG|VAG|M||||||8
378.377.135|0|ML|16|583.20|1080.00|1|1|3|||AZE|AZE|B||||||8
378.377.137|0|ML|16|583.20|1080.00|1|1|3|||AZE|AZE|M||||||8
378.377.139|0|ML|16|583.20|1080.00|1|1|3|||AMA|AMA|B||||||8
378.377.141|0|ML|16|583.20|1080.00|1|1|3|||AMA|AMA|M||||||8
378.377.143|0|ML|16|583.20|1080.00|1|1|3|||AES|AES|B||||||8
378.377.145|0|ML|16|583.20|1080.00|1|1|3|||AES|AES|M||||||8
378.377.147|0|ML|16|583.20|1080.00|1|1|3|||PRA|PRA|B||||||8
378.377.149|0|ML|16|583.20|1080.00|1|1|3|||PRA|PRA|M||||||8
378.377.151|0|ML|16|583.20|1080.00|1|1|3|||ROS|ROS|B||||||8
378.377.153|0|ML|16|583.20|1080.00|1|1|3|||ROS|ROS|M||||||8
378.377.155|0|ML|16|583.20|1080.00|1|1|3|||VER|VER|B||||||8
378.377.157|0|ML|16|583.20|1080.00|1|1|3|||VER|VER|M||||||8
378.377.165|0|ML|16|583.20|1080.00|1|1|3|||AZB|AZB|||||||8
378.377.167|0|ML|16|583.20|1080.00|1|1|3|||DEN|DEN|||||||8
378.377.169|0|ML|16|583.20|1080.00|1|1|3|||BLK|BLK|||||||8
378.377.171|0|ML|16|583.20|1080.00|1|1|3|||ART|ART|||||||8
378.377.173|0|ML|16|583.20|1080.00|1|1|3|||LIN|LIN|||||||8
378.377.175|0|ML|16|583.20|1080.00|1|1|3|||HAL|HAL|||||||8
378.377.241|0|ML|14|432.00|800.00|1|1|3|||TBL|TBL|||||||8
378.377.242|0|ML|14|432.00|800.00|1|1|3|||TEA|TEA|||||||8
378.377.243|0|ML|14|432.00|800.00|1|1|3|||OAK|OAK|||||||8
378.377.244|0|ML|14|432.00|800.00|1|1|3|||JOP|JOP|||||||8
378.377.245|0|ML|14|459.00|850.00|1|1|3|||TBL|BCO|B||||||8
378.377.246|0|ML|14|459.00|850.00|1|1|3|||TBL|BCO|M||||||8
378.377.247|0|ML|14|459.00|850.00|1|1|3|||TBL|CCL|B||||||8
378.377.248|0|ML|14|459.00|850.00|1|1|3|||TBL|CCL|M||||||8
378.377.249|0|ML|14|459.00|850.00|1|1|3|||TBL|CME|B||||||8
378.377.250|0|ML|14|459.00|850.00|1|1|3|||TBL|CME|M||||||8
378.377.251|0|ML|14|459.00|850.00|1|1|3|||TBL|ANT|B||||||8
378.377.252|0|ML|14|459.00|850.00|1|1|3|||TBL|ANT|M||||||8
378.377.253|0|ML|14|459.00|850.00|1|1|3|||TBL|PTO|B||||||8
378.377.254|0|ML|14|459.00|850.00|1|1|3|||TBL|PTO|M||||||8
378.377.255|0|ML|14|459.00|850.00|1|1|3|||TBL|CRE|B||||||8
378.377.256|0|ML|14|459.00|850.00|1|1|3|||TBL|CRE|M||||||8
378.377.257|0|ML|14|459.00|850.00|1|1|3|||TBL|CAM|B||||||8
378.377.258|0|ML|14|459.00|850.00|1|1|3|||TBL|CAM|M||||||8
378.377.259|0|ML|14|459.00|850.00|1|1|3|||TBL|OUR|B||||||8
378.377.260|0|ML|14|459.00|850.00|1|1|3|||TBL|OUR|M||||||8
378.377.261|0|ML|14|459.00|850.00|1|1|3|||TBL|COB|B||||||8
378.377.262|0|ML|14|459.00|850.00|1|1|3|||TBL|COB|M||||||8
378.377.263|0|ML|14|459.00|850.00|1|1|3|||TBL|CHO|B||||||8
378.377.264|0|ML|14|459.00|850.00|1|1|3|||TBL|CHO|M||||||8
378.377.265|0|ML|14|459.00|850.00|1|1|3|||TBL|VAG|B||||||8
378.377.266|0|ML|14|459.00|850.00|1|1|3|||TBL|VAG|M||||||8
378.377.267|0|ML|14|459.00|850.00|1|1|3|||TBL|AZE|B||||||8
378.377.268|0|ML|14|459.00|850.00|1|1|3|||TBL|AZE|M||||||8
378.377.269|0|ML|14|459.00|850.00|1|1|3|||TBL|AMA|B||||||8
378.377.270|0|ML|14|459.00|850.00|1|1|3|||TBL|AMA|M||||||8
378.377.271|0|ML|14|459.00|850.00|1|1|3|||TBL|AES|B||||||8
378.377.272|0|ML|14|459.00|850.00|1|1|3|||TBL|AES|M||||||8
378.377.273|0|ML|14|459.00|850.00|1|1|3|||TBL|PRA|B||||||8
378.377.274|0|ML|14|459.00|850.00|1|1|3|||TBL|PRA|M||||||8
378.377.275|0|ML|14|459.00|850.00|1|1|3|||TBL|ROS|B||||||8
378.377.276|0|ML|14|459.00|850.00|1|1|3|||TBL|ROS|M||||||8
378.377.277|0|ML|14|459.00|850.00|1|1|3|||TBL|VER|B||||||8
378.377.278|0|ML|14|459.00|850.00|1|1|3|||TBL|VER|M||||||8
378.377.279|0|ML|14|459.00|850.00|1|1|3|||TBL|AZB|||||||8
378.377.280|0|ML|14|459.00|850.00|1|1|3|||TBL|DEN|||||||8
378.377.281|0|ML|14|459.00|850.00|1|1|3|||TBL|BLK|||||||8
378.377.282|0|ML|14|459.00|850.00|1|1|3|||TBL|ART|||||||8
378.377.283|0|ML|14|459.00|850.00|1|1|3|||TBL|LIN|||||||8
378.377.284|0|ML|14|459.00|850.00|1|1|3|||TBL|HAL|||||||8
378.377.285|0|ML|14|480.60|890.00|1|1|3|||BCO|BCO|B||||||8
378.377.286|0|ML|14|480.60|890.00|1|1|3|||BCO|BCO|M||||||8
378.377.287|0|ML|14|480.60|890.00|1|1|3|||CCL|CCL|B||||||8
378.377.288|0|ML|14|480.60|890.00|1|1|3|||CCL|CCL|M||||||8
378.377.289|0|ML|14|480.60|890.00|1|1|3|||CME|CME|B||||||8
378.377.290|0|ML|14|480.60|890.00|1|1|3|||CME|CME|M||||||8
378.377.291|0|ML|14|480.60|890.00|1|1|3|||ANT|ANT|B||||||8
378.377.292|0|ML|14|480.60|890.00|1|1|3|||ANT|ANT|M||||||8
378.377.293|0|ML|14|480.60|890.00|1|1|3|||PTO|PTO|B||||||8
378.377.294|0|ML|14|480.60|890.00|1|1|3|||PTO|PTO|M||||||8
378.377.295|0|ML|14|480.60|890.00|1|1|3|||CRE|CRE|B||||||8
378.377.296|0|ML|14|480.60|890.00|1|1|3|||CRE|CRE|M||||||8
378.377.297|0|ML|14|480.60|890.00|1|1|3|||CAM|CAM|B||||||8
378.377.298|0|ML|14|480.60|890.00|1|1|3|||CAM|CAM|M||||||8
378.377.299|0|ML|14|480.60|890.00|1|1|3|||OUR|OUR|B||||||8
378.377.300|0|ML|14|480.60|890.00|1|1|3|||OUR|OUR|M||||||8
378.377.301|0|ML|14|480.60|890.00|1|1|3|||COB|COB|B||||||8
378.377.302|0|ML|14|480.60|890.00|1|1|3|||COB|COB|M||||||8
378.377.303|0|ML|14|480.60|890.00|1|1|3|||CHO|CHO|B||||||8
378.377.304|0|ML|14|480.60|890.00|1|1|3|||CHO|CHO|M||||||8
378.377.305|0|ML|14|480.60|890.00|1|1|3|||VAG|VAG|B||||||8
378.377.306|0|ML|14|480.60|890.00|1|1|3|||VAG|VAG|M||||||8
378.377.307|0|ML|14|480.60|890.00|1|1|3|||AZE|AZE|B||||||8
378.377.308|0|ML|14|480.60|890.00|1|1|3|||AZE|AZE|M||||||8
378.377.309|0|ML|14|480.60|890.00|1|1|3|||AMA|AMA|B||||||8
378.377.310|0|ML|14|480.60|890.00|1|1|3|||AMA|AMA|M||||||8
378.377.311|0|ML|14|480.60|890.00|1|1|3|||AES|AES|B||||||8
378.377.312|0|ML|14|480.60|890.00|1|1|3|||AES|AES|M||||||8
378.377.313|0|ML|14|480.60|890.00|1|1|3|||PRA|PRA|B||||||8
378.377.314|0|ML|14|480.60|890.00|1|1|3|||PRA|PRA|M||||||8
378.377.315|0|ML|14|480.60|890.00|1|1|3|||ROS|ROS|B||||||8
378.377.316|0|ML|14|480.60|890.00|1|1|3|||ROS|ROS|M||||||8
378.377.317|0|ML|14|480.60|890.00|1|1|3|||VER|VER|B||||||8
378.377.318|0|ML|14|480.60|890.00|1|1|3|||VER|VER|M||||||8
378.377.319|0|ML|14|480.60|890.00|1|1|3|||AZB|AZB|||||||8
378.377.320|0|ML|14|480.60|890.00|1|1|3|||DEN|DEN|||||||8
378.377.321|0|ML|14|480.60|890.00|1|1|3|||BLK|BLK|||||||8
378.377.322|0|ML|14|480.60|890.00|1|1|3|||ART|ART|||||||8
378.377.323|0|ML|14|480.60|890.00|1|1|3|||LIN|LIN|||||||8
378.377.324|0|ML|14|480.60|890.00|1|1|3|||HAL|HAL|||||||8
379.377.241|0|ML|14|496.80|920.00|1|1|3|||TBL|TBL|||||||9
379.377.242|0|ML|14|496.80|920.00|1|1|3|||TEA|TEA|||||||9
379.377.243|0|ML|14|496.80|920.00|1|1|3|||OAK|OAK|||||||9
379.377.244|0|ML|14|496.80|920.00|1|1|3|||JOP|JOP|||||||9
379.377.245|0|ML|14|523.80|970.00|1|1|3|||TBL|BCO|B||||||9
379.377.246|0|ML|14|523.80|970.00|1|1|3|||TBL|BCO|M||||||9
379.377.247|0|ML|14|523.80|970.00|1|1|3|||TBL|CCL|B||||||9
379.377.248|0|ML|14|523.80|970.00|1|1|3|||TBL|CCL|M||||||9
379.377.249|0|ML|14|523.80|970.00|1|1|3|||TBL|CME|B||||||9
379.377.250|0|ML|14|523.80|970.00|1|1|3|||TBL|CME|M||||||9
379.377.251|0|ML|14|523.80|970.00|1|1|3|||TBL|ANT|B||||||9
379.377.252|0|ML|14|523.80|970.00|1|1|3|||TBL|ANT|M||||||9
379.377.253|0|ML|14|523.80|970.00|1|1|3|||TBL|PTO|B||||||9
379.377.254|0|ML|14|523.80|970.00|1|1|3|||TBL|PTO|M||||||9
379.377.255|0|ML|14|523.80|970.00|1|1|3|||TBL|CRE|B||||||9
379.377.256|0|ML|14|523.80|970.00|1|1|3|||TBL|CRE|M||||||9
379.377.257|0|ML|14|523.80|970.00|1|1|3|||TBL|CAM|B||||||9
379.377.258|0|ML|14|523.80|970.00|1|1|3|||TBL|CAM|M||||||9
379.377.259|0|ML|14|523.80|970.00|1|1|3|||TBL|OUR|B||||||9
379.377.260|0|ML|14|523.80|970.00|1|1|3|||TBL|OUR|M||||||9
379.377.261|0|ML|14|523.80|970.00|1|1|3|||TBL|COB|B||||||9
379.377.262|0|ML|14|523.80|970.00|1|1|3|||TBL|COB|M||||||9
379.377.263|0|ML|14|523.80|970.00|1|1|3|||TBL|CHO|B||||||9
379.377.264|0|ML|14|523.80|970.00|1|1|3|||TBL|CHO|M||||||9
379.377.265|0|ML|14|523.80|970.00|1|1|3|||TBL|VAG|B||||||9
379.377.266|0|ML|14|523.80|970.00|1|1|3|||TBL|VAG|M||||||9
379.377.267|0|ML|14|523.80|970.00|1|1|3|||TBL|AZE|B||||||9
379.377.268|0|ML|14|523.80|970.00|1|1|3|||TBL|AZE|M||||||9
379.377.269|0|ML|14|523.80|970.00|1|1|3|||TBL|AMA|B||||||9
379.377.270|0|ML|14|523.80|970.00|1|1|3|||TBL|AMA|M||||||9
379.377.271|0|ML|14|523.80|970.00|1|1|3|||TBL|AES|B||||||9
379.377.272|0|ML|14|523.80|970.00|1|1|3|||TBL|AES|M||||||9
379.377.273|0|ML|14|523.80|970.00|1|1|3|||TBL|PRA|B||||||9
379.377.274|0|ML|14|523.80|970.00|1|1|3|||TBL|PRA|M||||||9
379.377.275|0|ML|14|523.80|970.00|1|1|3|||TBL|ROS|B||||||9
379.377.276|0|ML|14|523.80|970.00|1|1|3|||TBL|ROS|M||||||9
379.377.277|0|ML|14|523.80|970.00|1|1|3|||TBL|VER|B||||||9
379.377.278|0|ML|14|523.80|970.00|1|1|3|||TBL|VER|M||||||9
379.377.279|0|ML|14|523.80|970.00|1|1|3|||TBL|AZB|||||||9
379.377.280|0|ML|14|523.80|970.00|1|1|3|||TBL|DEN|||||||9
379.377.281|0|ML|14|523.80|970.00|1|1|3|||TBL|BLK|||||||9
379.377.282|0|ML|14|523.80|970.00|1|1|3|||TBL|ART|||||||9
379.377.283|0|ML|14|523.80|970.00|1|1|3|||TBL|LIN|||||||9
379.377.284|0|ML|14|523.80|970.00|1|1|3|||TBL|HAL|||||||9
379.377.285|0|ML|14|545.40|1010.00|1|1|3|||BCO|BCO|B||||||9
379.377.286|0|ML|14|545.40|1010.00|1|1|3|||BCO|BCO|M||||||9
379.377.287|0|ML|14|545.40|1010.00|1|1|3|||CCL|CCL|B||||||9
379.377.288|0|ML|14|545.40|1010.00|1|1|3|||CCL|CCL|M||||||9
379.377.289|0|ML|14|545.40|1010.00|1|1|3|||CME|CME|B||||||9
379.377.290|0|ML|14|545.40|1010.00|1|1|3|||CME|CME|M||||||9
379.377.291|0|ML|14|545.40|1010.00|1|1|3|||ANT|ANT|B||||||9
379.377.292|0|ML|14|545.40|1010.00|1|1|3|||ANT|ANT|M||||||9
379.377.293|0|ML|14|545.40|1010.00|1|1|3|||PTO|PTO|B||||||9
379.377.294|0|ML|14|545.40|1010.00|1|1|3|||PTO|PTO|M||||||9
379.377.295|0|ML|14|545.40|1010.00|1|1|3|||CRE|CRE|B||||||9
379.377.296|0|ML|14|545.40|1010.00|1|1|3|||CRE|CRE|M||||||9
379.377.297|0|ML|14|545.40|1010.00|1|1|3|||CAM|CAM|B||||||9
379.377.298|0|ML|14|545.40|1010.00|1|1|3|||CAM|CAM|M||||||9
379.377.299|0|ML|14|545.40|1010.00|1|1|3|||OUR|OUR|B||||||9
379.377.300|0|ML|14|545.40|1010.00|1|1|3|||OUR|OUR|M||||||9
379.377.301|0|ML|14|545.40|1010.00|1|1|3|||COB|COB|B||||||9
379.377.302|0|ML|14|545.40|1010.00|1|1|3|||COB|COB|M||||||9
379.377.303|0|ML|14|545.40|1010.00|1|1|3|||CHO|CHO|B||||||9
379.377.304|0|ML|14|545.40|1010.00|1|1|3|||CHO|CHO|M||||||9
379.377.305|0|ML|14|545.40|1010.00|1|1|3|||VAG|VAG|B||||||9
379.377.306|0|ML|14|545.40|1010.00|1|1|3|||VAG|VAG|M||||||9
379.377.307|0|ML|14|545.40|1010.00|1|1|3|||AZE|AZE|B||||||9
379.377.308|0|ML|14|545.40|1010.00|1|1|3|||AZE|AZE|M||||||9
379.377.309|0|ML|14|545.40|1010.00|1|1|3|||AMA|AMA|B||||||9
379.377.310|0|ML|14|545.40|1010.00|1|1|3|||AMA|AMA|M||||||9
379.377.311|0|ML|14|545.40|1010.00|1|1|3|||AES|AES|B||||||9
379.377.312|0|ML|14|545.40|1010.00|1|1|3|||AES|AES|M||||||9
379.377.313|0|ML|14|545.40|1010.00|1|1|3|||PRA|PRA|B||||||9
379.377.314|0|ML|14|545.40|1010.00|1|1|3|||PRA|PRA|M||||||9
379.377.315|0|ML|14|545.40|1010.00|1|1|3|||ROS|ROS|B||||||9
379.377.316|0|ML|14|545.40|1010.00|1|1|3|||ROS|ROS|M||||||9
379.377.317|0|ML|14|545.40|1010.00|1|1|3|||VER|VER|B||||||9
379.377.318|0|ML|14|545.40|1010.00|1|1|3|||VER|VER|M||||||9
379.377.319|0|ML|14|545.40|1010.00|1|1|3|||AZB|AZB|||||||9
379.377.320|0|ML|14|545.40|1010.00|1|1|3|||DEN|DEN|||||||9
379.377.321|0|ML|14|545.40|1010.00|1|1|3|||BLK|BLK|||||||9
379.377.322|0|ML|14|545.40|1010.00|1|1|3|||ART|ART|||||||9
379.377.323|0|ML|14|545.40|1010.00|1|1|3|||LIN|LIN|||||||9
379.377.324|0|ML|14|545.40|1010.00|1|1|3|||HAL|HAL|||||||9
380.377.241|0|ML|14|583.20|1080.00|1|1|3|||TBL|TBL|||||||10
380.377.242|0|ML|14|583.20|1080.00|1|1|3|||TEA|TEA|||||||10
380.377.243|0|ML|14|583.20|1080.00|1|1|3|||OAK|OAK|||||||10
380.377.244|0|ML|14|583.20|1080.00|1|1|3|||JOP|JOP|||||||10
380.377.245|0|ML|14|610.20|1130.00|1|1|3|||TBL|BCO|B||||||10
380.377.246|0|ML|14|610.20|1130.00|1|1|3|||TBL|BCO|M||||||10
380.377.247|0|ML|14|610.20|1130.00|1|1|3|||TBL|CCL|B||||||10
380.377.248|0|ML|14|610.20|1130.00|1|1|3|||TBL|CCL|M||||||10
380.377.249|0|ML|14|610.20|1130.00|1|1|3|||TBL|CME|B||||||10
380.377.250|0|ML|14|610.20|1130.00|1|1|3|||TBL|CME|M||||||10
380.377.251|0|ML|14|610.20|1130.00|1|1|3|||TBL|ANT|B||||||10
380.377.252|0|ML|14|610.20|1130.00|1|1|3|||TBL|ANT|M||||||10
380.377.253|0|ML|14|610.20|1130.00|1|1|3|||TBL|PTO|B||||||10
380.377.254|0|ML|14|610.20|1130.00|1|1|3|||TBL|PTO|M||||||10
380.377.255|0|ML|14|610.20|1130.00|1|1|3|||TBL|CRE|B||||||10
380.377.256|0|ML|14|610.20|1130.00|1|1|3|||TBL|CRE|M||||||10
380.377.257|0|ML|14|610.20|1130.00|1|1|3|||TBL|CAM|B||||||10
380.377.258|0|ML|14|610.20|1130.00|1|1|3|||TBL|CAM|M||||||10
380.377.259|0|ML|14|610.20|1130.00|1|1|3|||TBL|OUR|B||||||10
380.377.260|0|ML|14|610.20|1130.00|1|1|3|||TBL|OUR|M||||||10
380.377.261|0|ML|14|610.20|1130.00|1|1|3|||TBL|COB|B||||||10
380.377.262|0|ML|14|610.20|1130.00|1|1|3|||TBL|COB|M||||||10
380.377.263|0|ML|14|610.20|1130.00|1|1|3|||TBL|CHO|B||||||10
380.377.264|0|ML|14|610.20|1130.00|1|1|3|||TBL|CHO|M||||||10
380.377.265|0|ML|14|610.20|1130.00|1|1|3|||TBL|VAG|B||||||10
380.377.266|0|ML|14|610.20|1130.00|1|1|3|||TBL|VAG|M||||||10
380.377.267|0|ML|14|610.20|1130.00|1|1|3|||TBL|AZE|B||||||10
380.377.268|0|ML|14|610.20|1130.00|1|1|3|||TBL|AZE|M||||||10
380.377.269|0|ML|14|610.20|1130.00|1|1|3|||TBL|AMA|B||||||10
380.377.270|0|ML|14|610.20|1130.00|1|1|3|||TBL|AMA|M||||||10
380.377.271|0|ML|14|610.20|1130.00|1|1|3|||TBL|AES|B||||||10
380.377.272|0|ML|14|610.20|1130.00|1|1|3|||TBL|AES|M||||||10
380.377.273|0|ML|14|610.20|1130.00|1|1|3|||TBL|PRA|B||||||10
380.377.274|0|ML|14|610.20|1130.00|1|1|3|||TBL|PRA|M||||||10
380.377.275|0|ML|14|610.20|1130.00|1|1|3|||TBL|ROS|B||||||10
380.377.276|0|ML|14|610.20|1130.00|1|1|3|||TBL|ROS|M||||||10
380.377.277|0|ML|14|610.20|1130.00|1|1|3|||TBL|VER|B||||||10
380.377.278|0|ML|14|610.20|1130.00|1|1|3|||TBL|VER|M||||||10
380.377.279|0|ML|14|610.20|1130.00|1|1|3|||TBL|AZB|||||||10
380.377.280|0|ML|14|610.20|1130.00|1|1|3|||TBL|DEN|||||||10
380.377.281|0|ML|14|610.20|1130.00|1|1|3|||TBL|BLK|||||||10
380.377.282|0|ML|14|610.20|1130.00|1|1|3|||TBL|ART|||||||10
380.377.283|0|ML|14|610.20|1130.00|1|1|3|||TBL|LIN|||||||10
380.377.284|0|ML|14|610.20|1130.00|1|1|3|||TBL|HAL|||||||10
380.377.285|0|ML|14|631.80|1170.00|1|1|3|||BCO|BCO|B||||||10
380.377.286|0|ML|14|631.80|1170.00|1|1|3|||BCO|BCO|M||||||10
380.377.287|0|ML|14|631.80|1170.00|1|1|3|||CCL|CCL|B||||||10
380.377.288|0|ML|14|631.80|1170.00|1|1|3|||CCL|CCL|M||||||10
380.377.289|0|ML|14|631.80|1170.00|1|1|3|||CME|CME|B||||||10
380.377.290|0|ML|14|631.80|1170.00|1|1|3|||CME|CME|M||||||10
380.377.291|0|ML|14|631.80|1170.00|1|1|3|||ANT|ANT|B||||||10
380.377.292|0|ML|14|631.80|1170.00|1|1|3|||ANT|ANT|M||||||10
380.377.293|0|ML|14|631.80|1170.00|1|1|3|||PTO|PTO|B||||||10
380.377.294|0|ML|14|631.80|1170.00|1|1|3|||PTO|PTO|M||||||10
380.377.295|0|ML|14|631.80|1170.00|1|1|3|||CRE|CRE|B||||||10
380.377.296|0|ML|14|631.80|1170.00|1|1|3|||CRE|CRE|M||||||10
380.377.297|0|ML|14|631.80|1170.00|1|1|3|||CAM|CAM|B||||||10
380.377.298|0|ML|14|631.80|1170.00|1|1|3|||CAM|CAM|M||||||10
380.377.299|0|ML|14|631.80|1170.00|1|1|3|||OUR|OUR|B||||||10
380.377.300|0|ML|14|631.80|1170.00|1|1|3|||OUR|OUR|M||||||10
380.377.301|0|ML|14|631.80|1170.00|1|1|3|||COB|COB|B||||||10
380.377.302|0|ML|14|631.80|1170.00|1|1|3|||COB|COB|M||||||10
380.377.303|0|ML|14|631.80|1170.00|1|1|3|||CHO|CHO|B||||||10
380.377.304|0|ML|14|631.80|1170.00|1|1|3|||CHO|CHO|M||||||10
380.377.305|0|ML|14|631.80|1170.00|1|1|3|||VAG|VAG|B||||||10
380.377.306|0|ML|14|631.80|1170.00|1|1|3|||VAG|VAG|M||||||10
380.377.307|0|ML|14|631.80|1170.00|1|1|3|||AZE|AZE|B||||||10
380.377.308|0|ML|14|631.80|1170.00|1|1|3|||AZE|AZE|M||||||10
380.377.309|0|ML|14|631.80|1170.00|1|1|3|||AMA|AMA|B||||||10
380.377.310|0|ML|14|631.80|1170.00|1|1|3|||AMA|AMA|M||||||10
380.377.311|0|ML|14|631.80|1170.00|1|1|3|||AES|AES|B||||||10
380.377.312|0|ML|14|631.80|1170.00|1|1|3|||AES|AES|M||||||10
380.377.313|0|ML|14|631.80|1170.00|1|1|3|||PRA|PRA|B||||||10
380.377.314|0|ML|14|631.80|1170.00|1|1|3|||PRA|PRA|M||||||10
380.377.315|0|ML|14|631.80|1170.00|1|1|3|||ROS|ROS|B||||||10
380.377.316|0|ML|14|631.80|1170.00|1|1|3|||ROS|ROS|M||||||10
380.377.317|0|ML|14|631.80|1170.00|1|1|3|||VER|VER|B||||||10
380.377.318|0|ML|14|631.80|1170.00|1|1|3|||VER|VER|M||||||10
380.377.319|0|ML|14|631.80|1170.00|1|1|3|||AZB|AZB|||||||10
380.377.320|0|ML|14|631.80|1170.00|1|1|3|||DEN|DEN|||||||10
380.377.321|0|ML|14|631.80|1170.00|1|1|3|||BLK|BLK|||||||10
380.377.322|0|ML|14|631.80|1170.00|1|1|3|||ART|ART|||||||10
380.377.323|0|ML|14|631.80|1170.00|1|1|3|||LIN|LIN|||||||10
380.377.324|0|ML|14|631.80|1170.00|1|1|3|||HAL|HAL|||||||10
381.382.197|0|ML|17|151.20|280.00|1|1|3|||TBL|TBL|||||||11
381.382.198|0|ML|17|151.20|280.00|1|1|3|||TEA|TEA|||||||11
381.382.199|0|ML|17|151.20|280.00|1|1|3|||OAK|OAK|||||||11
381.382.200|0|ML|17|151.20|280.00|1|1|3|||JOP|JOP|||||||11
381.382.201|0|ML|17|178.20|330.00|1|1|3|||TBL|BCO|B||||||11
381.382.202|0|ML|17|178.20|330.00|1|1|3|||TBL|BCO|M||||||11
381.382.203|0|ML|17|178.20|330.00|1|1|3|||TBL|CCL|B||||||11
381.382.204|0|ML|17|178.20|330.00|1|1|3|||TBL|CCL|M||||||11
381.382.205|0|ML|17|178.20|330.00|1|1|3|||TBL|CME|B||||||11
381.382.206|0|ML|17|178.20|330.00|1|1|3|||TBL|CME|M||||||11
381.382.207|0|ML|17|178.20|330.00|1|1|3|||TBL|ANT|B||||||11
381.382.208|0|ML|17|178.20|330.00|1|1|3|||TBL|ANT|M||||||11
381.382.209|0|ML|17|178.20|330.00|1|1|3|||TBL|PTO|B||||||11
381.382.210|0|ML|17|178.20|330.00|1|1|3|||TBL|PTO|M||||||11
381.382.211|0|ML|17|178.20|330.00|1|1|3|||TBL|CRE|B||||||11
381.382.212|0|ML|17|178.20|330.00|1|1|3|||TBL|CRE|M||||||11
381.382.213|0|ML|17|178.20|330.00|1|1|3|||TBL|CAM|B||||||11
381.382.214|0|ML|17|178.20|330.00|1|1|3|||TBL|CAM|M||||||11
381.382.215|0|ML|17|178.20|330.00|1|1|3|||TBL|OUR|B||||||11
381.382.216|0|ML|17|178.20|330.00|1|1|3|||TBL|OUR|M||||||11
381.382.217|0|ML|17|178.20|330.00|1|1|3|||TBL|COB|B||||||11
381.382.218|0|ML|17|178.20|330.00|1|1|3|||TBL|COB|M||||||11
381.382.219|0|ML|17|178.20|330.00|1|1|3|||TBL|CHO|B||||||11
381.382.220|0|ML|17|178.20|330.00|1|1|3|||TBL|CHO|M||||||11
381.382.221|0|ML|17|178.20|330.00|1|1|3|||TBL|VAG|B||||||11
381.382.222|0|ML|17|178.20|330.00|1|1|3|||TBL|VAG|M||||||11
381.382.223|0|ML|17|178.20|330.00|1|1|3|||TBL|AZE|B||||||11
381.382.224|0|ML|17|178.20|330.00|1|1|3|||TBL|AZE|M||||||11
381.382.225|0|ML|17|178.20|330.00|1|1|3|||TBL|AMA|B||||||11
381.382.226|0|ML|17|178.20|330.00|1|1|3|||TBL|AMA|M||||||11
381.382.227|0|ML|17|178.20|330.00|1|1|3|||TBL|AES|B||||||11
381.382.228|0|ML|17|178.20|330.00|1|1|3|||TBL|AES|M||||||11
381.382.229|0|ML|17|178.20|330.00|1|1|3|||TBL|PRA|B||||||11
381.382.230|0|ML|17|178.20|330.00|1|1|3|||TBL|PRA|M||||||11
381.382.231|0|ML|17|178.20|330.00|1|1|3|||TBL|ROS|B||||||11
381.382.232|0|ML|17|178.20|330.00|1|1|3|||TBL|ROS|M||||||11
381.382.233|0|ML|17|178.20|330.00|1|1|3|||TBL|VER|B||||||11
381.382.234|0|ML|17|178.20|330.00|1|1|3|||TBL|VER|M||||||11
381.382.235|0|ML|17|178.20|330.00|1|1|3|||TBL|AZB|||||||11
381.382.236|0|ML|17|178.20|330.00|1|1|3|||TBL|DEN|||||||11
381.382.237|0|ML|17|178.20|330.00|1|1|3|||TBL|BLK|||||||11
381.382.238|0|ML|17|178.20|330.00|1|1|3|||TBL|ART|||||||11
381.382.239|0|ML|17|178.20|330.00|1|1|3|||TBL|LIN|||||||11
381.382.240|0|ML|17|178.20|330.00|1|1|3|||TBL|HAL|||||||11
381.382.91|0|ML|17|199.80|370.00|1|1|3|||BCO|BCO|B||||||11
381.382.93|0|ML|17|199.80|370.00|1|1|3|||BCO|BCO|M||||||11
381.382.95|0|ML|17|199.80|370.00|1|1|3|||CCL|CCL|B||||||11
381.382.97|0|ML|17|199.80|370.00|1|1|3|||CCL|CCL|M||||||11
381.382.99|0|ML|17|199.80|370.00|1|1|3|||CME|CME|B||||||11
381.382.101|0|ML|17|199.80|370.00|1|1|3|||CME|CME|M||||||11
381.382.103|0|ML|17|199.80|370.00|1|1|3|||ANT|ANT|B||||||11
381.382.105|0|ML|17|199.80|370.00|1|1|3|||ANT|ANT|M||||||11
381.382.107|0|ML|17|199.80|370.00|1|1|3|||PTO|PTO|B||||||11
381.382.109|0|ML|17|199.80|370.00|1|1|3|||PTO|PTO|M||||||11
381.382.111|0|ML|17|199.80|370.00|1|1|3|||CRE|CRE|B||||||11
381.382.113|0|ML|17|199.80|370.00|1|1|3|||CRE|CRE|M||||||11
381.382.115|0|ML|17|199.80|370.00|1|1|3|||CAM|CAM|B||||||11
381.382.117|0|ML|17|199.80|370.00|1|1|3|||CAM|CAM|M||||||11
381.382.119|0|ML|17|199.80|370.00|1|1|3|||OUR|OUR|B||||||11
381.382.121|0|ML|17|199.80|370.00|1|1|3|||OUR|OUR|M||||||11
381.382.123|0|ML|17|199.80|370.00|1|1|3|||COB|COB|B||||||11
381.382.125|0|ML|17|199.80|370.00|1|1|3|||COB|COB|M||||||11
381.382.127|0|ML|17|199.80|370.00|1|1|3|||CHO|CHO|B||||||11
381.382.129|0|ML|17|199.80|370.00|1|1|3|||CHO|CHO|M||||||11
381.382.131|0|ML|17|199.80|370.00|1|1|3|||VAG|VAG|B||||||11
381.382.133|0|ML|17|199.80|370.00|1|1|3|||VAG|VAG|M||||||11
381.382.135|0|ML|17|199.80|370.00|1|1|3|||AZE|AZE|B||||||11
381.382.137|0|ML|17|199.80|370.00|1|1|3|||AZE|AZE|M||||||11
381.382.139|0|ML|17|199.80|370.00|1|1|3|||AMA|AMA|B||||||11
381.382.141|0|ML|17|199.80|370.00|1|1|3|||AMA|AMA|M||||||11
381.382.143|0|ML|17|199.80|370.00|1|1|3|||AES|AES|B||||||11
381.382.145|0|ML|17|199.80|370.00|1|1|3|||AES|AES|M||||||11
381.382.147|0|ML|17|199.80|370.00|1|1|3|||PRA|PRA|B||||||11
381.382.149|0|ML|17|199.80|370.00|1|1|3|||PRA|PRA|M||||||11
381.382.151|0|ML|17|199.80|370.00|1|1|3|||ROS|ROS|B||||||11
381.382.153|0|ML|17|199.80|370.00|1|1|3|||ROS|ROS|M||||||11
381.382.155|0|ML|17|199.80|370.00|1|1|3|||VER|VER|B||||||11
381.382.157|0|ML|17|199.80|370.00|1|1|3|||VER|VER|M||||||11
381.382.165|0|ML|17|199.80|370.00|1|1|3|||AZB|AZB|||||||11
381.382.167|0|ML|17|199.80|370.00|1|1|3|||DEN|DEN|||||||11
381.382.169|0|ML|17|199.80|370.00|1|1|3|||BLK|BLK|||||||11
381.382.171|0|ML|17|199.80|370.00|1|1|3|||ART|ART|||||||11
381.382.173|0|ML|17|199.80|370.00|1|1|3|||LIN|LIN|||||||11
381.382.175|0|ML|17|199.80|370.00|1|1|3|||HAL|HAL|||||||11
383.382.197|0|ML|17|156.60|290.00|1|1|3|||TBL|TBL|||||||12
383.382.198|0|ML|17|156.60|290.00|1|1|3|||TEA|TEA|||||||12
383.382.199|0|ML|17|156.60|290.00|1|1|3|||OAK|OAK|||||||12
383.382.200|0|ML|17|156.60|290.00|1|1|3|||JOP|JOP|||||||12
383.382.201|0|ML|17|183.60|340.00|1|1|3|||TBL|BCO|B||||||12
383.382.202|0|ML|17|183.60|340.00|1|1|3|||TBL|BCO|M||||||12
383.382.203|0|ML|17|183.60|340.00|1|1|3|||TBL|CCL|B||||||12
383.382.204|0|ML|17|183.60|340.00|1|1|3|||TBL|CCL|M||||||12
383.382.205|0|ML|17|183.60|340.00|1|1|3|||TBL|CME|B||||||12
383.382.206|0|ML|17|183.60|340.00|1|1|3|||TBL|CME|M||||||12
383.382.207|0|ML|17|183.60|340.00|1|1|3|||TBL|ANT|B||||||12
383.382.208|0|ML|17|183.60|340.00|1|1|3|||TBL|ANT|M||||||12
383.382.209|0|ML|17|183.60|340.00|1|1|3|||TBL|PTO|B||||||12
383.382.210|0|ML|17|183.60|340.00|1|1|3|||TBL|PTO|M||||||12
383.382.211|0|ML|17|183.60|340.00|1|1|3|||TBL|CRE|B||||||12
383.382.212|0|ML|17|183.60|340.00|1|1|3|||TBL|CRE|M||||||12
383.382.213|0|ML|17|183.60|340.00|1|1|3|||TBL|CAM|B||||||12
383.382.214|0|ML|17|183.60|340.00|1|1|3|||TBL|CAM|M||||||12
383.382.215|0|ML|17|183.60|340.00|1|1|3|||TBL|OUR|B||||||12
383.382.216|0|ML|17|183.60|340.00|1|1|3|||TBL|OUR|M||||||12
383.382.217|0|ML|17|183.60|340.00|1|1|3|||TBL|COB|B||||||12
383.382.218|0|ML|17|183.60|340.00|1|1|3|||TBL|COB|M||||||12
383.382.219|0|ML|17|183.60|340.00|1|1|3|||TBL|CHO|B||||||12
383.382.220|0|ML|17|183.60|340.00|1|1|3|||TBL|CHO|M||||||12
383.382.221|0|ML|17|183.60|340.00|1|1|3|||TBL|VAG|B||||||12
383.382.222|0|ML|17|183.60|340.00|1|1|3|||TBL|VAG|M||||||12
383.382.223|0|ML|17|183.60|340.00|1|1|3|||TBL|AZE|B||||||12
383.382.224|0|ML|17|183.60|340.00|1|1|3|||TBL|AZE|M||||||12
383.382.225|0|ML|17|183.60|340.00|1|1|3|||TBL|AMA|B||||||12
383.382.226|0|ML|17|183.60|340.00|1|1|3|||TBL|AMA|M||||||12
383.382.227|0|ML|17|183.60|340.00|1|1|3|||TBL|AES|B||||||12
383.382.228|0|ML|17|183.60|340.00|1|1|3|||TBL|AES|M||||||12
383.382.229|0|ML|17|183.60|340.00|1|1|3|||TBL|PRA|B||||||12
383.382.230|0|ML|17|183.60|340.00|1|1|3|||TBL|PRA|M||||||12
383.382.231|0|ML|17|183.60|340.00|1|1|3|||TBL|ROS|B||||||12
383.382.232|0|ML|17|183.60|340.00|1|1|3|||TBL|ROS|M||||||12
383.382.233|0|ML|17|183.60|340.00|1|1|3|||TBL|VER|B||||||12
383.382.234|0|ML|17|183.60|340.00|1|1|3|||TBL|VER|M||||||12
383.382.235|0|ML|17|183.60|340.00|1|1|3|||TBL|AZB|||||||12
383.382.236|0|ML|17|183.60|340.00|1|1|3|||TBL|DEN|||||||12
383.382.237|0|ML|17|183.60|340.00|1|1|3|||TBL|BLK|||||||12
383.382.238|0|ML|17|183.60|340.00|1|1|3|||TBL|ART|||||||12
383.382.239|0|ML|17|183.60|340.00|1|1|3|||TBL|LIN|||||||12
383.382.240|0|ML|17|183.60|340.00|1|1|3|||TBL|HAL|||||||12
383.382.91|0|ML|17|205.20|380.00|1|1|3|||BCO|BCO|B||||||12
383.382.93|0|ML|17|205.20|380.00|1|1|3|||BCO|BCO|M||||||12
383.382.95|0|ML|17|205.20|380.00|1|1|3|||CCL|CCL|B||||||12
383.382.97|0|ML|17|205.20|380.00|1|1|3|||CCL|CCL|M||||||12
383.382.99|0|ML|17|205.20|380.00|1|1|3|||CME|CME|B||||||12
383.382.101|0|ML|17|205.20|380.00|1|1|3|||CME|CME|M||||||12
383.382.103|0|ML|17|205.20|380.00|1|1|3|||ANT|ANT|B||||||12
383.382.105|0|ML|17|205.20|380.00|1|1|3|||ANT|ANT|M||||||12
383.382.107|0|ML|17|205.20|380.00|1|1|3|||PTO|PTO|B||||||12
383.382.109|0|ML|17|205.20|380.00|1|1|3|||PTO|PTO|M||||||12
383.382.111|0|ML|17|205.20|380.00|1|1|3|||CRE|CRE|B||||||12
383.382.113|0|ML|17|205.20|380.00|1|1|3|||CRE|CRE|M||||||12
383.382.115|0|ML|17|205.20|380.00|1|1|3|||CAM|CAM|B||||||12
383.382.117|0|ML|17|205.20|380.00|1|1|3|||CAM|CAM|M||||||12
383.382.119|0|ML|17|205.20|380.00|1|1|3|||OUR|OUR|B||||||12
383.382.121|0|ML|17|205.20|380.00|1|1|3|||OUR|OUR|M||||||12
383.382.123|0|ML|17|205.20|380.00|1|1|3|||COB|COB|B||||||12
383.382.125|0|ML|17|205.20|380.00|1|1|3|||COB|COB|M||||||12
383.382.127|0|ML|17|205.20|380.00|1|1|3|||CHO|CHO|B||||||12
383.382.129|0|ML|17|205.20|380.00|1|1|3|||CHO|CHO|M||||||12
383.382.131|0|ML|17|205.20|380.00|1|1|3|||VAG|VAG|B||||||12
383.382.133|0|ML|17|205.20|380.00|1|1|3|||VAG|VAG|M||||||12
383.382.135|0|ML|17|205.20|380.00|1|1|3|||AZE|AZE|B||||||12
383.382.137|0|ML|17|205.20|380.00|1|1|3|||AZE|AZE|M||||||12
383.382.139|0|ML|17|205.20|380.00|1|1|3|||AMA|AMA|B||||||12
383.382.141|0|ML|17|205.20|380.00|1|1|3|||AMA|AMA|M||||||12
383.382.143|0|ML|17|205.20|380.00|1|1|3|||AES|AES|B||||||12
383.382.145|0|ML|17|205.20|380.00|1|1|3|||AES|AES|M||||||12
383.382.147|0|ML|17|205.20|380.00|1|1|3|||PRA|PRA|B||||||12
383.382.149|0|ML|17|205.20|380.00|1|1|3|||PRA|PRA|M||||||12
383.382.151|0|ML|17|205.20|380.00|1|1|3|||ROS|ROS|B||||||12
383.382.153|0|ML|17|205.20|380.00|1|1|3|||ROS|ROS|M||||||12
383.382.155|0|ML|17|205.20|380.00|1|1|3|||VER|VER|B||||||12
383.382.157|0|ML|17|205.20|380.00|1|1|3|||VER|VER|M||||||12
383.382.165|0|ML|17|205.20|380.00|1|1|3|||AZB|AZB|||||||12
383.382.167|0|ML|17|205.20|380.00|1|1|3|||DEN|DEN|||||||12
383.382.169|0|ML|17|205.20|380.00|1|1|3|||BLK|BLK|||||||12
383.382.171|0|ML|17|205.20|380.00|1|1|3|||ART|ART|||||||12
383.382.173|0|ML|17|205.20|380.00|1|1|3|||LIN|LIN|||||||12
383.382.175|0|ML|17|205.20|380.00|1|1|3|||HAL|HAL|||||||12
384.382.197|0|ML|17|199.80|370.00|1|1|3|||TBL|TBL|||||||13
384.382.198|0|ML|17|199.80|370.00|1|1|3|||TEA|TEA|||||||13
384.382.199|0|ML|17|199.80|370.00|1|1|3|||OAK|OAK|||||||13
384.382.200|0|ML|17|199.80|370.00|1|1|3|||JOP|JOP|||||||13
384.382.201|0|ML|17|226.80|420.00|1|1|3|||TBL|BCO|B||||||13
384.382.202|0|ML|17|226.80|420.00|1|1|3|||TBL|BCO|M||||||13
384.382.203|0|ML|17|226.80|420.00|1|1|3|||TBL|CCL|B||||||13
384.382.204|0|ML|17|226.80|420.00|1|1|3|||TBL|CCL|M||||||13
384.382.205|0|ML|17|226.80|420.00|1|1|3|||TBL|CME|B||||||13
384.382.206|0|ML|17|226.80|420.00|1|1|3|||TBL|CME|M||||||13
384.382.207|0|ML|17|226.80|420.00|1|1|3|||TBL|ANT|B||||||13
384.382.208|0|ML|17|226.80|420.00|1|1|3|||TBL|ANT|M||||||13
384.382.209|0|ML|17|226.80|420.00|1|1|3|||TBL|PTO|B||||||13
384.382.210|0|ML|17|226.80|420.00|1|1|3|||TBL|PTO|M||||||13
384.382.211|0|ML|17|226.80|420.00|1|1|3|||TBL|CRE|B||||||13
384.382.212|0|ML|17|226.80|420.00|1|1|3|||TBL|CRE|M||||||13
384.382.213|0|ML|17|226.80|420.00|1|1|3|||TBL|CAM|B||||||13
384.382.214|0|ML|17|226.80|420.00|1|1|3|||TBL|CAM|M||||||13
384.382.215|0|ML|17|226.80|420.00|1|1|3|||TBL|OUR|B||||||13
384.382.216|0|ML|17|226.80|420.00|1|1|3|||TBL|OUR|M||||||13
384.382.217|0|ML|17|226.80|420.00|1|1|3|||TBL|COB|B||||||13
384.382.218|0|ML|17|226.80|420.00|1|1|3|||TBL|COB|M||||||13
384.382.219|0|ML|17|226.80|420.00|1|1|3|||TBL|CHO|B||||||13
384.382.220|0|ML|17|226.80|420.00|1|1|3|||TBL|CHO|M||||||13
384.382.221|0|ML|17|226.80|420.00|1|1|3|||TBL|VAG|B||||||13
384.382.222|0|ML|17|226.80|420.00|1|1|3|||TBL|VAG|M||||||13
384.382.223|0|ML|17|226.80|420.00|1|1|3|||TBL|AZE|B||||||13
384.382.224|0|ML|17|226.80|420.00|1|1|3|||TBL|AZE|M||||||13
384.382.225|0|ML|17|226.80|420.00|1|1|3|||TBL|AMA|B||||||13
384.382.226|0|ML|17|226.80|420.00|1|1|3|||TBL|AMA|M||||||13
384.382.227|0|ML|17|226.80|420.00|1|1|3|||TBL|AES|B||||||13
384.382.228|0|ML|17|226.80|420.00|1|1|3|||TBL|AES|M||||||13
384.382.229|0|ML|17|226.80|420.00|1|1|3|||TBL|PRA|B||||||13
384.382.230|0|ML|17|226.80|420.00|1|1|3|||TBL|PRA|M||||||13
384.382.231|0|ML|17|226.80|420.00|1|1|3|||TBL|ROS|B||||||13
384.382.232|0|ML|17|226.80|420.00|1|1|3|||TBL|ROS|M||||||13
384.382.233|0|ML|17|226.80|420.00|1|1|3|||TBL|VER|B||||||13
384.382.234|0|ML|17|226.80|420.00|1|1|3|||TBL|VER|M||||||13
384.382.235|0|ML|17|226.80|420.00|1|1|3|||TBL|AZB|||||||13
384.382.236|0|ML|17|226.80|420.00|1|1|3|||TBL|DEN|||||||13
384.382.237|0|ML|17|226.80|420.00|1|1|3|||TBL|BLK|||||||13
384.382.238|0|ML|17|226.80|420.00|1|1|3|||TBL|ART|||||||13
384.382.239|0|ML|17|226.80|420.00|1|1|3|||TBL|LIN|||||||13
384.382.240|0|ML|17|226.80|420.00|1|1|3|||TBL|HAL|||||||13
384.382.91|0|ML|17|248.40|460.00|1|1|3|||BCO|BCO|B||||||13
384.382.93|0|ML|17|248.40|460.00|1|1|3|||BCO|BCO|M||||||13
384.382.95|0|ML|17|248.40|460.00|1|1|3|||CCL|CCL|B||||||13
384.382.97|0|ML|17|248.40|460.00|1|1|3|||CCL|CCL|M||||||13
384.382.99|0|ML|17|248.40|460.00|1|1|3|||CME|CME|B||||||13
384.382.101|0|ML|17|248.40|460.00|1|1|3|||CME|CME|M||||||13
384.382.103|0|ML|17|248.40|460.00|1|1|3|||ANT|ANT|B||||||13
384.382.105|0|ML|17|248.40|460.00|1|1|3|||ANT|ANT|M||||||13
384.382.107|0|ML|17|248.40|460.00|1|1|3|||PTO|PTO|B||||||13
384.382.109|0|ML|17|248.40|460.00|1|1|3|||PTO|PTO|M||||||13
384.382.111|0|ML|17|248.40|460.00|1|1|3|||CRE|CRE|B||||||13
384.382.113|0|ML|17|248.40|460.00|1|1|3|||CRE|CRE|M||||||13
384.382.115|0|ML|17|248.40|460.00|1|1|3|||CAM|CAM|B||||||13
384.382.117|0|ML|17|248.40|460.00|1|1|3|||CAM|CAM|M||||||13
384.382.119|0|ML|17|248.40|460.00|1|1|3|||OUR|OUR|B||||||13
384.382.121|0|ML|17|248.40|460.00|1|1|3|||OUR|OUR|M||||||13
384.382.123|0|ML|17|248.40|460.00|1|1|3|||COB|COB|B||||||13
384.382.125|0|ML|17|248.40|460.00|1|1|3|||COB|COB|M||||||13
384.382.127|0|ML|17|248.40|460.00|1|1|3|||CHO|CHO|B||||||13
384.382.129|0|ML|17|248.40|460.00|1|1|3|||CHO|CHO|M||||||13
384.382.131|0|ML|17|248.40|460.00|1|1|3|||VAG|VAG|B||||||13
384.382.133|0|ML|17|248.40|460.00|1|1|3|||VAG|VAG|M||||||13
384.382.135|0|ML|17|248.40|460.00|1|1|3|||AZE|AZE|B||||||13
384.382.137|0|ML|17|248.40|460.00|1|1|3|||AZE|AZE|M||||||13
384.382.139|0|ML|17|248.40|460.00|1|1|3|||AMA|AMA|B||||||13
384.382.141|0|ML|17|248.40|460.00|1|1|3|||AMA|AMA|M||||||13
384.382.143|0|ML|17|248.40|460.00|1|1|3|||AES|AES|B||||||13
384.382.145|0|ML|17|248.40|460.00|1|1|3|||AES|AES|M||||||13
384.382.147|0|ML|17|248.40|460.00|1|1|3|||PRA|PRA|B||||||13
384.382.149|0|ML|17|248.40|460.00|1|1|3|||PRA|PRA|M||||||13
384.382.151|0|ML|17|248.40|460.00|1|1|3|||ROS|ROS|B||||||13
384.382.153|0|ML|17|248.40|460.00|1|1|3|||ROS|ROS|M||||||13
384.382.155|0|ML|17|248.40|460.00|1|1|3|||VER|VER|B||||||13
384.382.157|0|ML|17|248.40|460.00|1|1|3|||VER|VER|M||||||13
384.382.165|0|ML|17|248.40|460.00|1|1|3|||AZB|AZB|||||||13
384.382.167|0|ML|17|248.40|460.00|1|1|3|||DEN|DEN|||||||13
384.382.169|0|ML|17|248.40|460.00|1|1|3|||BLK|BLK|||||||13
384.382.171|0|ML|17|248.40|460.00|1|1|3|||ART|ART|||||||13
384.382.173|0|ML|17|248.40|460.00|1|1|3|||LIN|LIN|||||||13
384.382.175|0|ML|17|248.40|460.00|1|1|3|||HAL|HAL|||||||13
385.386.197|0|ML|18|162.00|300.00|1|1|4|||TBL|TBL|||||||14
385.386.198|0|ML|18|162.00|300.00|1|1|4|||TEA|TEA|||||||14
385.386.199|0|ML|18|162.00|300.00|1|1|4|||OAK|OAK|||||||14
385.386.200|0|ML|18|162.00|300.00|1|1|4|||JOP|JOP|||||||14
385.386.201|0|ML|18|189.00|350.00|1|1|4|||TBL|BCO|B||||||14
385.386.202|0|ML|18|189.00|350.00|1|1|4|||TBL|BCO|M||||||14
385.386.203|0|ML|18|189.00|350.00|1|1|4|||TBL|CCL|B||||||14
385.386.204|0|ML|18|189.00|350.00|1|1|4|||TBL|CCL|M||||||14
385.386.205|0|ML|18|189.00|350.00|1|1|4|||TBL|CME|B||||||14
385.386.206|0|ML|18|189.00|350.00|1|1|4|||TBL|CME|M||||||14
385.386.207|0|ML|18|189.00|350.00|1|1|4|||TBL|ANT|B||||||14
385.386.208|0|ML|18|189.00|350.00|1|1|4|||TBL|ANT|M||||||14
385.386.209|0|ML|18|189.00|350.00|1|1|4|||TBL|PTO|B||||||14
385.386.210|0|ML|18|189.00|350.00|1|1|4|||TBL|PTO|M||||||14
385.386.211|0|ML|18|189.00|350.00|1|1|4|||TBL|CRE|B||||||14
385.386.212|0|ML|18|189.00|350.00|1|1|4|||TBL|CRE|M||||||14
385.386.213|0|ML|18|189.00|350.00|1|1|4|||TBL|CAM|B||||||14
385.386.214|0|ML|18|189.00|350.00|1|1|4|||TBL|CAM|M||||||14
385.386.215|0|ML|18|189.00|350.00|1|1|4|||TBL|OUR|B||||||14
385.386.216|0|ML|18|189.00|350.00|1|1|4|||TBL|OUR|M||||||14
385.386.217|0|ML|18|189.00|350.00|1|1|4|||TBL|COB|B||||||14
385.386.218|0|ML|18|189.00|350.00|1|1|4|||TBL|COB|M||||||14
385.386.219|0|ML|18|189.00|350.00|1|1|4|||TBL|CHO|B||||||14
385.386.220|0|ML|18|189.00|350.00|1|1|4|||TBL|CHO|M||||||14
385.386.221|0|ML|18|189.00|350.00|1|1|4|||TBL|VAG|B||||||14
385.386.222|0|ML|18|189.00|350.00|1|1|4|||TBL|VAG|M||||||14
385.386.223|0|ML|18|189.00|350.00|1|1|4|||TBL|AZE|B||||||14
385.386.224|0|ML|18|189.00|350.00|1|1|4|||TBL|AZE|M||||||14
385.386.225|0|ML|18|189.00|350.00|1|1|4|||TBL|AMA|B||||||14
385.386.226|0|ML|18|189.00|350.00|1|1|4|||TBL|AMA|M||||||14
385.386.227|0|ML|18|189.00|350.00|1|1|4|||TBL|AES|B||||||14
385.386.228|0|ML|18|189.00|350.00|1|1|4|||TBL|AES|M||||||14
385.386.229|0|ML|18|189.00|350.00|1|1|4|||TBL|PRA|B||||||14
385.386.230|0|ML|18|189.00|350.00|1|1|4|||TBL|PRA|M||||||14
385.386.231|0|ML|18|189.00|350.00|1|1|4|||TBL|ROS|B||||||14
385.386.232|0|ML|18|189.00|350.00|1|1|4|||TBL|ROS|M||||||14
385.386.233|0|ML|18|189.00|350.00|1|1|4|||TBL|VER|B||||||14
385.386.234|0|ML|18|189.00|350.00|1|1|4|||TBL|VER|M||||||14
385.386.235|0|ML|18|189.00|350.00|1|1|4|||TBL|AZB|||||||14
385.386.236|0|ML|18|189.00|350.00|1|1|4|||TBL|DEN|||||||14
385.386.237|0|ML|18|189.00|350.00|1|1|4|||TBL|BLK|||||||14
385.386.238|0|ML|18|189.00|350.00|1|1|4|||TBL|ART|||||||14
385.386.239|0|ML|18|189.00|350.00|1|1|4|||TBL|LIN|||||||14
385.386.240|0|ML|18|189.00|350.00|1|1|4|||TBL|HAL|||||||14
385.386.91|0|ML|18|210.60|390.00|1|1|4|||BCO|BCO|B||||||14
385.386.93|0|ML|18|210.60|390.00|1|1|4|||BCO|BCO|M||||||14
385.386.95|0|ML|18|210.60|390.00|1|1|4|||CCL|CCL|B||||||14
385.386.97|0|ML|18|210.60|390.00|1|1|4|||CCL|CCL|M||||||14
385.386.99|0|ML|18|210.60|390.00|1|1|4|||CME|CME|B||||||14
385.386.101|0|ML|18|210.60|390.00|1|1|4|||CME|CME|M||||||14
385.386.103|0|ML|18|210.60|390.00|1|1|4|||ANT|ANT|B||||||14
385.386.105|0|ML|18|210.60|390.00|1|1|4|||ANT|ANT|M||||||14
385.386.107|0|ML|18|210.60|390.00|1|1|4|||PTO|PTO|B||||||14
385.386.109|0|ML|18|210.60|390.00|1|1|4|||PTO|PTO|M||||||14
385.386.111|0|ML|18|210.60|390.00|1|1|4|||CRE|CRE|B||||||14
385.386.113|0|ML|18|210.60|390.00|1|1|4|||CRE|CRE|M||||||14
385.386.115|0|ML|18|210.60|390.00|1|1|4|||CAM|CAM|B||||||14
385.386.117|0|ML|18|210.60|390.00|1|1|4|||CAM|CAM|M||||||14
385.386.119|0|ML|18|210.60|390.00|1|1|4|||OUR|OUR|B||||||14
385.386.121|0|ML|18|210.60|390.00|1|1|4|||OUR|OUR|M||||||14
385.386.123|0|ML|18|210.60|390.00|1|1|4|||COB|COB|B||||||14
385.386.125|0|ML|18|210.60|390.00|1|1|4|||COB|COB|M||||||14
385.386.127|0|ML|18|210.60|390.00|1|1|4|||CHO|CHO|B||||||14
385.386.129|0|ML|18|210.60|390.00|1|1|4|||CHO|CHO|M||||||14
385.386.131|0|ML|18|210.60|390.00|1|1|4|||VAG|VAG|B||||||14
385.386.133|0|ML|18|210.60|390.00|1|1|4|||VAG|VAG|M||||||14
385.386.135|0|ML|18|210.60|390.00|1|1|4|||AZE|AZE|B||||||14
385.386.137|0|ML|18|210.60|390.00|1|1|4|||AZE|AZE|M||||||14
385.386.139|0|ML|18|210.60|390.00|1|1|4|||AMA|AMA|B||||||14
385.386.141|0|ML|18|210.60|390.00|1|1|4|||AMA|AMA|M||||||14
385.386.143|0|ML|18|210.60|390.00|1|1|4|||AES|AES|B||||||14
385.386.145|0|ML|18|210.60|390.00|1|1|4|||AES|AES|M||||||14
385.386.147|0|ML|18|210.60|390.00|1|1|4|||PRA|PRA|B||||||14
385.386.149|0|ML|18|210.60|390.00|1|1|4|||PRA|PRA|M||||||14
385.386.151|0|ML|18|210.60|390.00|1|1|4|||ROS|ROS|B||||||14
385.386.153|0|ML|18|210.60|390.00|1|1|4|||ROS|ROS|M||||||14
385.386.155|0|ML|18|210.60|390.00|1|1|4|||VER|VER|B||||||14
385.386.157|0|ML|18|210.60|390.00|1|1|4|||VER|VER|M||||||14
385.386.165|0|ML|18|210.60|390.00|1|1|4|||AZB|AZB|||||||14
385.386.167|0|ML|18|210.60|390.00|1|1|4|||DEN|DEN|||||||14
385.386.169|0|ML|18|210.60|390.00|1|1|4|||BLK|BLK|||||||14
385.386.171|0|ML|18|210.60|390.00|1|1|4|||ART|ART|||||||14
385.386.173|0|ML|18|210.60|390.00|1|1|4|||LIN|LIN|||||||14
385.386.175|0|ML|18|210.60|390.00|1|1|4|||HAL|HAL|||||||14
387.386.197|0|ML|18|178.20|330.00|1|1|4|||TBL|TBL|||||||15
387.386.198|0|ML|18|178.20|330.00|1|1|4|||TEA|TEA|||||||15
387.386.199|0|ML|18|178.20|330.00|1|1|4|||OAK|OAK|||||||15
387.386.200|0|ML|18|178.20|330.00|1|1|4|||JOP|JOP|||||||15
387.386.201|0|ML|18|205.20|380.00|1|1|4|||TBL|BCO|B||||||15
387.386.202|0|ML|18|205.20|380.00|1|1|4|||TBL|BCO|M||||||15
387.386.203|0|ML|18|205.20|380.00|1|1|4|||TBL|CCL|B||||||15
387.386.204|0|ML|18|205.20|380.00|1|1|4|||TBL|CCL|M||||||15
387.386.205|0|ML|18|205.20|380.00|1|1|4|||TBL|CME|B||||||15
387.386.206|0|ML|18|205.20|380.00|1|1|4|||TBL|CME|M||||||15
387.386.207|0|ML|18|205.20|380.00|1|1|4|||TBL|ANT|B||||||15
387.386.208|0|ML|18|205.20|380.00|1|1|4|||TBL|ANT|M||||||15
387.386.209|0|ML|18|205.20|380.00|1|1|4|||TBL|PTO|B||||||15
387.386.210|0|ML|18|205.20|380.00|1|1|4|||TBL|PTO|M||||||15
387.386.211|0|ML|18|205.20|380.00|1|1|4|||TBL|CRE|B||||||15
387.386.212|0|ML|18|205.20|380.00|1|1|4|||TBL|CRE|M||||||15
387.386.213|0|ML|18|205.20|380.00|1|1|4|||TBL|CAM|B||||||15
387.386.214|0|ML|18|205.20|380.00|1|1|4|||TBL|CAM|M||||||15
387.386.215|0|ML|18|205.20|380.00|1|1|4|||TBL|OUR|B||||||15
387.386.216|0|ML|18|205.20|380.00|1|1|4|||TBL|OUR|M||||||15
387.386.217|0|ML|18|205.20|380.00|1|1|4|||TBL|COB|B||||||15
387.386.218|0|ML|18|205.20|380.00|1|1|4|||TBL|COB|M||||||15
387.386.219|0|ML|18|205.20|380.00|1|1|4|||TBL|CHO|B||||||15
387.386.220|0|ML|18|205.20|380.00|1|1|4|||TBL|CHO|M||||||15
387.386.221|0|ML|18|205.20|380.00|1|1|4|||TBL|VAG|B||||||15
387.386.222|0|ML|18|205.20|380.00|1|1|4|||TBL|VAG|M||||||15
387.386.223|0|ML|18|205.20|380.00|1|1|4|||TBL|AZE|B||||||15
387.386.224|0|ML|18|205.20|380.00|1|1|4|||TBL|AZE|M||||||15
387.386.225|0|ML|18|205.20|380.00|1|1|4|||TBL|AMA|B||||||15
387.386.226|0|ML|18|205.20|380.00|1|1|4|||TBL|AMA|M||||||15
387.386.227|0|ML|18|205.20|380.00|1|1|4|||TBL|AES|B||||||15
387.386.228|0|ML|18|205.20|380.00|1|1|4|||TBL|AES|M||||||15
387.386.229|0|ML|18|205.20|380.00|1|1|4|||TBL|PRA|B||||||15
387.386.230|0|ML|18|205.20|380.00|1|1|4|||TBL|PRA|M||||||15
387.386.231|0|ML|18|205.20|380.00|1|1|4|||TBL|ROS|B||||||15
387.386.232|0|ML|18|205.20|380.00|1|1|4|||TBL|ROS|M||||||15
387.386.233|0|ML|18|205.20|380.00|1|1|4|||TBL|VER|B||||||15
387.386.234|0|ML|18|205.20|380.00|1|1|4|||TBL|VER|M||||||15
387.386.235|0|ML|18|205.20|380.00|1|1|4|||TBL|AZB|||||||15
387.386.236|0|ML|18|205.20|380.00|1|1|4|||TBL|DEN|||||||15
387.386.237|0|ML|18|205.20|380.00|1|1|4|||TBL|BLK|||||||15
387.386.238|0|ML|18|205.20|380.00|1|1|4|||TBL|ART|||||||15
387.386.239|0|ML|18|205.20|380.00|1|1|4|||TBL|LIN|||||||15
387.386.240|0|ML|18|205.20|380.00|1|1|4|||TBL|HAL|||||||15
387.386.91|0|ML|18|226.80|420.00|1|1|4|||BCO|BCO|B||||||15
387.386.93|0|ML|18|226.80|420.00|1|1|4|||BCO|BCO|M||||||15
387.386.95|0|ML|18|226.80|420.00|1|1|4|||CCL|CCL|B||||||15
387.386.97|0|ML|18|226.80|420.00|1|1|4|||CCL|CCL|M||||||15
387.386.99|0|ML|18|226.80|420.00|1|1|4|||CME|CME|B||||||15
387.386.101|0|ML|18|226.80|420.00|1|1|4|||CME|CME|M||||||15
387.386.103|0|ML|18|226.80|420.00|1|1|4|||ANT|ANT|B||||||15
387.386.105|0|ML|18|226.80|420.00|1|1|4|||ANT|ANT|M||||||15
387.386.107|0|ML|18|226.80|420.00|1|1|4|||PTO|PTO|B||||||15
387.386.109|0|ML|18|226.80|420.00|1|1|4|||PTO|PTO|M||||||15
387.386.111|0|ML|18|226.80|420.00|1|1|4|||CRE|CRE|B||||||15
387.386.113|0|ML|18|226.80|420.00|1|1|4|||CRE|CRE|M||||||15
387.386.115|0|ML|18|226.80|420.00|1|1|4|||CAM|CAM|B||||||15
387.386.117|0|ML|18|226.80|420.00|1|1|4|||CAM|CAM|M||||||15
387.386.119|0|ML|18|226.80|420.00|1|1|4|||OUR|OUR|B||||||15
387.386.121|0|ML|18|226.80|420.00|1|1|4|||OUR|OUR|M||||||15
387.386.123|0|ML|18|226.80|420.00|1|1|4|||COB|COB|B||||||15
387.386.125|0|ML|18|226.80|420.00|1|1|4|||COB|COB|M||||||15
387.386.127|0|ML|18|226.80|420.00|1|1|4|||CHO|CHO|B||||||15
387.386.129|0|ML|18|226.80|420.00|1|1|4|||CHO|CHO|M||||||15
387.386.131|0|ML|18|226.80|420.00|1|1|4|||VAG|VAG|B||||||15
387.386.133|0|ML|18|226.80|420.00|1|1|4|||VAG|VAG|M||||||15
387.386.135|0|ML|18|226.80|420.00|1|1|4|||AZE|AZE|B||||||15
387.386.137|0|ML|18|226.80|420.00|1|1|4|||AZE|AZE|M||||||15
387.386.139|0|ML|18|226.80|420.00|1|1|4|||AMA|AMA|B||||||15
387.386.141|0|ML|18|226.80|420.00|1|1|4|||AMA|AMA|M||||||15
387.386.143|0|ML|18|226.80|420.00|1|1|4|||AES|AES|B||||||15
387.386.145|0|ML|18|226.80|420.00|1|1|4|||AES|AES|M||||||15
387.386.147|0|ML|18|226.80|420.00|1|1|4|||PRA|PRA|B||||||15
387.386.149|0|ML|18|226.80|420.00|1|1|4|||PRA|PRA|M||||||15
387.386.151|0|ML|18|226.80|420.00|1|1|4|||ROS|ROS|B||||||15
387.386.153|0|ML|18|226.80|420.00|1|1|4|||ROS|ROS|M||||||15
387.386.155|0|ML|18|226.80|420.00|1|1|4|||VER|VER|B||||||15
387.386.157|0|ML|18|226.80|420.00|1|1|4|||VER|VER|M||||||15
387.386.165|0|ML|18|226.80|420.00|1|1|4|||AZB|AZB|||||||15
387.386.167|0|ML|18|226.80|420.00|1|1|4|||DEN|DEN|||||||15
387.386.169|0|ML|18|226.80|420.00|1|1|4|||BLK|BLK|||||||15
387.386.171|0|ML|18|226.80|420.00|1|1|4|||ART|ART|||||||15
387.386.173|0|ML|18|226.80|420.00|1|1|4|||LIN|LIN|||||||15
387.386.175|0|ML|18|226.80|420.00|1|1|4|||HAL|HAL|||||||15
387.386.327|0|ML|19|280.80|520.00|1|1|4|||TBL|TBL|||||||15
387.386.328|0|ML|19|280.80|520.00|1|1|4|||TEA|TEA|||||||15
387.386.329|0|ML|19|280.80|520.00|1|1|4|||OAK|OAK|||||||15
387.386.330|0|ML|19|280.80|520.00|1|1|4|||JOP|JOP|||||||15
387.386.331|0|ML|19|307.80|570.00|1|1|4|||TBL|BCO|B||||||15
387.386.332|0|ML|19|307.80|570.00|1|1|4|||TBL|BCO|M||||||15
387.386.333|0|ML|19|307.80|570.00|1|1|4|||TBL|CCL|B||||||15
387.386.334|0|ML|19|307.80|570.00|1|1|4|||TBL|CCL|M||||||15
387.386.335|0|ML|19|307.80|570.00|1|1|4|||TBL|CME|B||||||15
387.386.336|0|ML|19|307.80|570.00|1|1|4|||TBL|CME|M||||||15
387.386.337|0|ML|19|307.80|570.00|1|1|4|||TBL|ANT|B||||||15
387.386.338|0|ML|19|307.80|570.00|1|1|4|||TBL|ANT|M||||||15
387.386.339|0|ML|19|307.80|570.00|1|1|4|||TBL|PTO|B||||||15
387.386.340|0|ML|19|307.80|570.00|1|1|4|||TBL|PTO|M||||||15
387.386.341|0|ML|19|307.80|570.00|1|1|4|||TBL|CRE|B||||||15
387.386.342|0|ML|19|307.80|570.00|1|1|4|||TBL|CRE|M||||||15
387.386.343|0|ML|19|307.80|570.00|1|1|4|||TBL|CAM|B||||||15
387.386.344|0|ML|19|307.80|570.00|1|1|4|||TBL|CAM|M||||||15
387.386.345|0|ML|19|307.80|570.00|1|1|4|||TBL|OUR|B||||||15
387.386.346|0|ML|19|307.80|570.00|1|1|4|||TBL|OUR|M||||||15
387.386.347|0|ML|19|307.80|570.00|1|1|4|||TBL|COB|B||||||15
387.386.348|0|ML|19|307.80|570.00|1|1|4|||TBL|COB|M||||||15
387.386.349|0|ML|19|307.80|570.00|1|1|4|||TBL|CHO|B||||||15
387.386.350|0|ML|19|307.80|570.00|1|1|4|||TBL|CHO|M||||||15
387.386.351|0|ML|19|307.80|570.00|1|1|4|||TBL|VAG|B||||||15
387.386.352|0|ML|19|307.80|570.00|1|1|4|||TBL|VAG|M||||||15
387.386.353|0|ML|19|307.80|570.00|1|1|4|||TBL|AZE|B||||||15
387.386.354|0|ML|19|307.80|570.00|1|1|4|||TBL|AZE|M||||||15
387.386.355|0|ML|19|307.80|570.00|1|1|4|||TBL|AMA|B||||||15
387.386.356|0|ML|19|307.80|570.00|1|1|4|||TBL|AMA|M||||||15
387.386.357|0|ML|19|307.80|570.00|1|1|4|||TBL|AES|B||||||15
387.386.358|0|ML|19|307.80|570.00|1|1|4|||TBL|AES|M||||||15
387.386.359|0|ML|19|307.80|570.00|1|1|4|||TBL|PRA|B||||||15
387.386.360|0|ML|19|307.80|570.00|1|1|4|||TBL|PRA|M||||||15
387.386.361|0|ML|19|307.80|570.00|1|1|4|||TBL|ROS|B||||||15
387.386.362|0|ML|19|307.80|570.00|1|1|4|||TBL|ROS|M||||||15
387.386.363|0|ML|19|307.80|570.00|1|1|4|||TBL|VER|B||||||15
387.386.364|0|ML|19|307.80|570.00|1|1|4|||TBL|VER|M||||||15
387.386.365|0|ML|19|307.80|570.00|1|1|4|||TBL|AZB|||||||15
387.386.366|0|ML|19|307.80|570.00|1|1|4|||TBL|DEN|||||||15
387.386.367|0|ML|19|307.80|570.00|1|1|4|||TBL|BLK|||||||15
387.386.368|0|ML|19|307.80|570.00|1|1|4|||TBL|ART|||||||15
387.386.369|0|ML|19|307.80|570.00|1|1|4|||TBL|LIN|||||||15
387.386.370|0|ML|19|307.80|570.00|1|1|4|||TBL|HAL|||||||15
387.386.92|0|ML|19|329.40|610.00|1|1|4|||BCO|BCO|B||||||15
387.386.94|0|ML|19|329.40|610.00|1|1|4|||BCO|BCO|M||||||15
387.386.96|0|ML|19|329.40|610.00|1|1|4|||CCL|CCL|B||||||15
387.386.98|0|ML|19|329.40|610.00|1|1|4|||CCL|CCL|M||||||15
387.386.100|0|ML|19|329.40|610.00|1|1|4|||CME|CME|B||||||15
387.386.102|0|ML|19|329.40|610.00|1|1|4|||CME|CME|M||||||15
387.386.104|0|ML|19|329.40|610.00|1|1|4|||ANT|ANT|B||||||15
387.386.106|0|ML|19|329.40|610.00|1|1|4|||ANT|ANT|M||||||15
387.386.108|0|ML|19|329.40|610.00|1|1|4|||PTO|PTO|B||||||15
387.386.110|0|ML|19|329.40|610.00|1|1|4|||PTO|PTO|M||||||15
387.386.112|0|ML|19|329.40|610.00|1|1|4|||CRE|CRE|B||||||15
387.386.114|0|ML|19|329.40|610.00|1|1|4|||CRE|CRE|M||||||15
387.386.116|0|ML|19|329.40|610.00|1|1|4|||CAM|CAM|B||||||15
387.386.118|0|ML|19|329.40|610.00|1|1|4|||CAM|CAM|M||||||15
387.386.120|0|ML|19|329.40|610.00|1|1|4|||OUR|OUR|B||||||15
387.386.122|0|ML|19|329.40|610.00|1|1|4|||OUR|OUR|M||||||15
387.386.124|0|ML|19|329.40|610.00|1|1|4|||COB|COB|B||||||15
387.386.126|0|ML|19|329.40|610.00|1|1|4|||COB|COB|M||||||15
387.386.128|0|ML|19|329.40|610.00|1|1|4|||CHO|CHO|B||||||15
387.386.130|0|ML|19|329.40|610.00|1|1|4|||CHO|CHO|M||||||15
387.386.132|0|ML|19|329.40|610.00|1|1|4|||VAG|VAG|B||||||15
387.386.134|0|ML|19|329.40|610.00|1|1|4|||VAG|VAG|M||||||15
387.386.136|0|ML|19|329.40|610.00|1|1|4|||AZE|AZE|B||||||15
387.386.138|0|ML|19|329.40|610.00|1|1|4|||AZE|AZE|M||||||15
387.386.140|0|ML|19|329.40|610.00|1|1|4|||AMA|AMA|B||||||15
387.386.142|0|ML|19|329.40|610.00|1|1|4|||AMA|AMA|M||||||15
387.386.144|0|ML|19|329.40|610.00|1|1|4|||AES|AES|B||||||15
387.386.146|0|ML|19|329.40|610.00|1|1|4|||AES|AES|M||||||15
387.386.148|0|ML|19|329.40|610.00|1|1|4|||PRA|PRA|B||||||15
387.386.150|0|ML|19|329.40|610.00|1|1|4|||PRA|PRA|M||||||15
387.386.152|0|ML|19|329.40|610.00|1|1|4|||ROS|ROS|B||||||15
387.386.154|0|ML|19|329.40|610.00|1|1|4|||ROS|ROS|M||||||15
387.386.156|0|ML|19|329.40|610.00|1|1|4|||VER|VER|B||||||15
387.386.158|0|ML|19|329.40|610.00|1|1|4|||VER|VER|M||||||15
387.386.166|0|ML|19|329.40|610.00|1|1|4|||AZB|AZB|||||||15
387.386.168|0|ML|19|329.40|610.00|1|1|4|||DEN|DEN|||||||15
387.386.170|0|ML|19|329.40|610.00|1|1|4|||BLK|BLK|||||||15
387.386.172|0|ML|19|329.40|610.00|1|1|4|||ART|ART|||||||15
387.386.174|0|ML|19|329.40|610.00|1|1|4|||LIN|LIN|||||||15
387.386.176|0|ML|19|329.40|610.00|1|1|4|||HAL|HAL|||||||15
388.386.197|0|ML|18|210.60|390.00|1|1|4|||TBL|TBL|||||||16
388.386.198|0|ML|18|210.60|390.00|1|1|4|||TEA|TEA|||||||16
388.386.199|0|ML|18|210.60|390.00|1|1|4|||OAK|OAK|||||||16
388.386.200|0|ML|18|210.60|390.00|1|1|4|||JOP|JOP|||||||16
388.386.201|0|ML|18|237.60|440.00|1|1|4|||TBL|BCO|B||||||16
388.386.202|0|ML|18|237.60|440.00|1|1|4|||TBL|BCO|M||||||16
388.386.203|0|ML|18|237.60|440.00|1|1|4|||TBL|CCL|B||||||16
388.386.204|0|ML|18|237.60|440.00|1|1|4|||TBL|CCL|M||||||16
388.386.205|0|ML|18|237.60|440.00|1|1|4|||TBL|CME|B||||||16
388.386.206|0|ML|18|237.60|440.00|1|1|4|||TBL|CME|M||||||16
388.386.207|0|ML|18|237.60|440.00|1|1|4|||TBL|ANT|B||||||16
388.386.208|0|ML|18|237.60|440.00|1|1|4|||TBL|ANT|M||||||16
388.386.209|0|ML|18|237.60|440.00|1|1|4|||TBL|PTO|B||||||16
388.386.210|0|ML|18|237.60|440.00|1|1|4|||TBL|PTO|M||||||16
388.386.211|0|ML|18|237.60|440.00|1|1|4|||TBL|CRE|B||||||16
388.386.212|0|ML|18|237.60|440.00|1|1|4|||TBL|CRE|M||||||16
388.386.213|0|ML|18|237.60|440.00|1|1|4|||TBL|CAM|B||||||16
388.386.214|0|ML|18|237.60|440.00|1|1|4|||TBL|CAM|M||||||16
388.386.215|0|ML|18|237.60|440.00|1|1|4|||TBL|OUR|B||||||16
388.386.216|0|ML|18|237.60|440.00|1|1|4|||TBL|OUR|M||||||16
388.386.217|0|ML|18|237.60|440.00|1|1|4|||TBL|COB|B||||||16
388.386.218|0|ML|18|237.60|440.00|1|1|4|||TBL|COB|M||||||16
388.386.219|0|ML|18|237.60|440.00|1|1|4|||TBL|CHO|B||||||16
388.386.220|0|ML|18|237.60|440.00|1|1|4|||TBL|CHO|M||||||16
388.386.221|0|ML|18|237.60|440.00|1|1|4|||TBL|VAG|B||||||16
388.386.222|0|ML|18|237.60|440.00|1|1|4|||TBL|VAG|M||||||16
388.386.223|0|ML|18|237.60|440.00|1|1|4|||TBL|AZE|B||||||16
388.386.224|0|ML|18|237.60|440.00|1|1|4|||TBL|AZE|M||||||16
388.386.225|0|ML|18|237.60|440.00|1|1|4|||TBL|AMA|B||||||16
388.386.226|0|ML|18|237.60|440.00|1|1|4|||TBL|AMA|M||||||16
388.386.227|0|ML|18|237.60|440.00|1|1|4|||TBL|AES|B||||||16
388.386.228|0|ML|18|237.60|440.00|1|1|4|||TBL|AES|M||||||16
388.386.229|0|ML|18|237.60|440.00|1|1|4|||TBL|PRA|B||||||16
388.386.230|0|ML|18|237.60|440.00|1|1|4|||TBL|PRA|M||||||16
388.386.231|0|ML|18|237.60|440.00|1|1|4|||TBL|ROS|B||||||16
388.386.232|0|ML|18|237.60|440.00|1|1|4|||TBL|ROS|M||||||16
388.386.233|0|ML|18|237.60|440.00|1|1|4|||TBL|VER|B||||||16
388.386.234|0|ML|18|237.60|440.00|1|1|4|||TBL|VER|M||||||16
388.386.235|0|ML|18|237.60|440.00|1|1|4|||TBL|AZB|||||||16
388.386.236|0|ML|18|237.60|440.00|1|1|4|||TBL|DEN|||||||16
388.386.237|0|ML|18|237.60|440.00|1|1|4|||TBL|BLK|||||||16
388.386.238|0|ML|18|237.60|440.00|1|1|4|||TBL|ART|||||||16
388.386.239|0|ML|18|237.60|440.00|1|1|4|||TBL|LIN|||||||16
388.386.240|0|ML|18|237.60|440.00|1|1|4|||TBL|HAL|||||||16
388.386.91|0|ML|18|259.20|480.00|1|1|4|||BCO|BCO|B||||||16
388.386.93|0|ML|18|259.20|480.00|1|1|4|||BCO|BCO|M||||||16
388.386.95|0|ML|18|259.20|480.00|1|1|4|||CCL|CCL|B||||||16
388.386.97|0|ML|18|259.20|480.00|1|1|4|||CCL|CCL|M||||||16
388.386.99|0|ML|18|259.20|480.00|1|1|4|||CME|CME|B||||||16
388.386.101|0|ML|18|259.20|480.00|1|1|4|||CME|CME|M||||||16
388.386.103|0|ML|18|259.20|480.00|1|1|4|||ANT|ANT|B||||||16
388.386.105|0|ML|18|259.20|480.00|1|1|4|||ANT|ANT|M||||||16
388.386.107|0|ML|18|259.20|480.00|1|1|4|||PTO|PTO|B||||||16
388.386.109|0|ML|18|259.20|480.00|1|1|4|||PTO|PTO|M||||||16
388.386.111|0|ML|18|259.20|480.00|1|1|4|||CRE|CRE|B||||||16
388.386.113|0|ML|18|259.20|480.00|1|1|4|||CRE|CRE|M||||||16
388.386.115|0|ML|18|259.20|480.00|1|1|4|||CAM|CAM|B||||||16
388.386.117|0|ML|18|259.20|480.00|1|1|4|||CAM|CAM|M||||||16
388.386.119|0|ML|18|259.20|480.00|1|1|4|||OUR|OUR|B||||||16
388.386.121|0|ML|18|259.20|480.00|1|1|4|||OUR|OUR|M||||||16
388.386.123|0|ML|18|259.20|480.00|1|1|4|||COB|COB|B||||||16
388.386.125|0|ML|18|259.20|480.00|1|1|4|||COB|COB|M||||||16
388.386.127|0|ML|18|259.20|480.00|1|1|4|||CHO|CHO|B||||||16
388.386.129|0|ML|18|259.20|480.00|1|1|4|||CHO|CHO|M||||||16
388.386.131|0|ML|18|259.20|480.00|1|1|4|||VAG|VAG|B||||||16
388.386.133|0|ML|18|259.20|480.00|1|1|4|||VAG|VAG|M||||||16
388.386.135|0|ML|18|259.20|480.00|1|1|4|||AZE|AZE|B||||||16
388.386.137|0|ML|18|259.20|480.00|1|1|4|||AZE|AZE|M||||||16
388.386.139|0|ML|18|259.20|480.00|1|1|4|||AMA|AMA|B||||||16
388.386.141|0|ML|18|259.20|480.00|1|1|4|||AMA|AMA|M||||||16
388.386.143|0|ML|18|259.20|480.00|1|1|4|||AES|AES|B||||||16
388.386.145|0|ML|18|259.20|480.00|1|1|4|||AES|AES|M||||||16
388.386.147|0|ML|18|259.20|480.00|1|1|4|||PRA|PRA|B||||||16
388.386.149|0|ML|18|259.20|480.00|1|1|4|||PRA|PRA|M||||||16
388.386.151|0|ML|18|259.20|480.00|1|1|4|||ROS|ROS|B||||||16
388.386.153|0|ML|18|259.20|480.00|1|1|4|||ROS|ROS|M||||||16
388.386.155|0|ML|18|259.20|480.00|1|1|4|||VER|VER|B||||||16
388.386.157|0|ML|18|259.20|480.00|1|1|4|||VER|VER|M||||||16
388.386.165|0|ML|18|259.20|480.00|1|1|4|||AZB|AZB|||||||16
388.386.167|0|ML|18|259.20|480.00|1|1|4|||DEN|DEN|||||||16
388.386.169|0|ML|18|259.20|480.00|1|1|4|||BLK|BLK|||||||16
388.386.171|0|ML|18|259.20|480.00|1|1|4|||ART|ART|||||||16
388.386.173|0|ML|18|259.20|480.00|1|1|4|||LIN|LIN|||||||16
388.386.175|0|ML|18|259.20|480.00|1|1|4|||HAL|HAL|||||||16
388.386.327|0|ML|19|326.70|605.00|1|1|4|||TBL|TBL|||||||16
388.386.328|0|ML|19|326.70|605.00|1|1|4|||TEA|TEA|||||||16
388.386.329|0|ML|19|326.70|605.00|1|1|4|||OAK|OAK|||||||16
388.386.330|0|ML|19|326.70|605.00|1|1|4|||JOP|JOP|||||||16
388.386.331|0|ML|19|353.70|655.00|1|1|4|||TBL|BCO|B||||||16
388.386.332|0|ML|19|353.70|655.00|1|1|4|||TBL|BCO|M||||||16
388.386.333|0|ML|19|353.70|655.00|1|1|4|||TBL|CCL|B||||||16
388.386.334|0|ML|19|353.70|655.00|1|1|4|||TBL|CCL|M||||||16
388.386.335|0|ML|19|353.70|655.00|1|1|4|||TBL|CME|B||||||16
388.386.336|0|ML|19|353.70|655.00|1|1|4|||TBL|CME|M||||||16
388.386.337|0|ML|19|353.70|655.00|1|1|4|||TBL|ANT|B||||||16
388.386.338|0|ML|19|353.70|655.00|1|1|4|||TBL|ANT|M||||||16
388.386.339|0|ML|19|353.70|655.00|1|1|4|||TBL|PTO|B||||||16
388.386.340|0|ML|19|353.70|655.00|1|1|4|||TBL|PTO|M||||||16
388.386.341|0|ML|19|353.70|655.00|1|1|4|||TBL|CRE|B||||||16
388.386.342|0|ML|19|353.70|655.00|1|1|4|||TBL|CRE|M||||||16
388.386.343|0|ML|19|353.70|655.00|1|1|4|||TBL|CAM|B||||||16
388.386.344|0|ML|19|353.70|655.00|1|1|4|||TBL|CAM|M||||||16
388.386.345|0|ML|19|353.70|655.00|1|1|4|||TBL|OUR|B||||||16
388.386.346|0|ML|19|353.70|655.00|1|1|4|||TBL|OUR|M||||||16
388.386.347|0|ML|19|353.70|655.00|1|1|4|||TBL|COB|B||||||16
388.386.348|0|ML|19|353.70|655.00|1|1|4|||TBL|COB|M||||||16
388.386.349|0|ML|19|353.70|655.00|1|1|4|||TBL|CHO|B||||||16
388.386.350|0|ML|19|353.70|655.00|1|1|4|||TBL|CHO|M||||||16
388.386.351|0|ML|19|353.70|655.00|1|1|4|||TBL|VAG|B||||||16
388.386.352|0|ML|19|353.70|655.00|1|1|4|||TBL|VAG|M||||||16
388.386.353|0|ML|19|353.70|655.00|1|1|4|||TBL|AZE|B||||||16
388.386.354|0|ML|19|353.70|655.00|1|1|4|||TBL|AZE|M||||||16
388.386.355|0|ML|19|353.70|655.00|1|1|4|||TBL|AMA|B||||||16
388.386.356|0|ML|19|353.70|655.00|1|1|4|||TBL|AMA|M||||||16
388.386.357|0|ML|19|353.70|655.00|1|1|4|||TBL|AES|B||||||16
388.386.358|0|ML|19|353.70|655.00|1|1|4|||TBL|AES|M||||||16
388.386.359|0|ML|19|353.70|655.00|1|1|4|||TBL|PRA|B||||||16
388.386.360|0|ML|19|353.70|655.00|1|1|4|||TBL|PRA|M||||||16
388.386.361|0|ML|19|353.70|655.00|1|1|4|||TBL|ROS|B||||||16
388.386.362|0|ML|19|353.70|655.00|1|1|4|||TBL|ROS|M||||||16
388.386.363|0|ML|19|353.70|655.00|1|1|4|||TBL|VER|B||||||16
388.386.364|0|ML|19|353.70|655.00|1|1|4|||TBL|VER|M||||||16
388.386.365|0|ML|19|353.70|655.00|1|1|4|||TBL|AZB|||||||16
388.386.366|0|ML|19|353.70|655.00|1|1|4|||TBL|DEN|||||||16
388.386.367|0|ML|19|353.70|655.00|1|1|4|||TBL|BLK|||||||16
388.386.368|0|ML|19|353.70|655.00|1|1|4|||TBL|ART|||||||16
388.386.369|0|ML|19|353.70|655.00|1|1|4|||TBL|LIN|||||||16
388.386.370|0|ML|19|353.70|655.00|1|1|4|||TBL|HAL|||||||16
388.386.92|0|ML|19|375.30|695.00|1|1|4|||BCO|BCO|B||||||16
388.386.94|0|ML|19|375.30|695.00|1|1|4|||BCO|BCO|M||||||16
388.386.96|0|ML|19|375.30|695.00|1|1|4|||CCL|CCL|B||||||16
388.386.98|0|ML|19|375.30|695.00|1|1|4|||CCL|CCL|M||||||16
388.386.100|0|ML|19|375.30|695.00|1|1|4|||CME|CME|B||||||16
388.386.102|0|ML|19|375.30|695.00|1|1|4|||CME|CME|M||||||16
388.386.104|0|ML|19|375.30|695.00|1|1|4|||ANT|ANT|B||||||16
388.386.106|0|ML|19|375.30|695.00|1|1|4|||ANT|ANT|M||||||16
388.386.108|0|ML|19|375.30|695.00|1|1|4|||PTO|PTO|B||||||16
388.386.110|0|ML|19|375.30|695.00|1|1|4|||PTO|PTO|M||||||16
388.386.112|0|ML|19|375.30|695.00|1|1|4|||CRE|CRE|B||||||16
388.386.114|0|ML|19|375.30|695.00|1|1|4|||CRE|CRE|M||||||16
388.386.116|0|ML|19|375.30|695.00|1|1|4|||CAM|CAM|B||||||16
388.386.118|0|ML|19|375.30|695.00|1|1|4|||CAM|CAM|M||||||16
388.386.120|0|ML|19|375.30|695.00|1|1|4|||OUR|OUR|B||||||16
388.386.122|0|ML|19|375.30|695.00|1|1|4|||OUR|OUR|M||||||16
388.386.124|0|ML|19|375.30|695.00|1|1|4|||COB|COB|B||||||16
388.386.126|0|ML|19|375.30|695.00|1|1|4|||COB|COB|M||||||16
388.386.128|0|ML|19|375.30|695.00|1|1|4|||CHO|CHO|B||||||16
388.386.130|0|ML|19|375.30|695.00|1|1|4|||CHO|CHO|M||||||16
388.386.132|0|ML|19|375.30|695.00|1|1|4|||VAG|VAG|B||||||16
388.386.134|0|ML|19|375.30|695.00|1|1|4|||VAG|VAG|M||||||16
388.386.136|0|ML|19|375.30|695.00|1|1|4|||AZE|AZE|B||||||16
388.386.138|0|ML|19|375.30|695.00|1|1|4|||AZE|AZE|M||||||16
388.386.140|0|ML|19|375.30|695.00|1|1|4|||AMA|AMA|B||||||16
388.386.142|0|ML|19|375.30|695.00|1|1|4|||AMA|AMA|M||||||16
388.386.144|0|ML|19|375.30|695.00|1|1|4|||AES|AES|B||||||16
388.386.146|0|ML|19|375.30|695.00|1|1|4|||AES|AES|M||||||16
388.386.148|0|ML|19|375.30|695.00|1|1|4|||PRA|PRA|B||||||16
388.386.150|0|ML|19|375.30|695.00|1|1|4|||PRA|PRA|M||||||16
388.386.152|0|ML|19|375.30|695.00|1|1|4|||ROS|ROS|B||||||16
388.386.154|0|ML|19|375.30|695.00|1|1|4|||ROS|ROS|M||||||16
388.386.156|0|ML|19|375.30|695.00|1|1|4|||VER|VER|B||||||16
388.386.158|0|ML|19|375.30|695.00|1|1|4|||VER|VER|M||||||16
388.386.166|0|ML|19|375.30|695.00|1|1|4|||AZB|AZB|||||||16
388.386.168|0|ML|19|375.30|695.00|1|1|4|||DEN|DEN|||||||16
388.386.170|0|ML|19|375.30|695.00|1|1|4|||BLK|BLK|||||||16
388.386.172|0|ML|19|375.30|695.00|1|1|4|||ART|ART|||||||16
388.386.174|0|ML|19|375.30|695.00|1|1|4|||LIN|LIN|||||||16
388.386.176|0|ML|19|375.30|695.00|1|1|4|||HAL|HAL|||||||16
389.386.197|0|ML|18|275.40|510.00|1|1|4|||TBL|TBL|||||||17
389.386.198|0|ML|18|275.40|510.00|1|1|4|||TEA|TEA|||||||17
389.386.199|0|ML|18|275.40|510.00|1|1|4|||OAK|OAK|||||||17
389.386.200|0|ML|18|275.40|510.00|1|1|4|||JOP|JOP|||||||17
389.386.201|0|ML|18|302.40|560.00|1|1|4|||TBL|BCO|B||||||17
389.386.202|0|ML|18|302.40|560.00|1|1|4|||TBL|BCO|M||||||17
389.386.203|0|ML|18|302.40|560.00|1|1|4|||TBL|CCL|B||||||17
389.386.204|0|ML|18|302.40|560.00|1|1|4|||TBL|CCL|M||||||17
389.386.205|0|ML|18|302.40|560.00|1|1|4|||TBL|CME|B||||||17
389.386.206|0|ML|18|302.40|560.00|1|1|4|||TBL|CME|M||||||17
389.386.207|0|ML|18|302.40|560.00|1|1|4|||TBL|ANT|B||||||17
389.386.208|0|ML|18|302.40|560.00|1|1|4|||TBL|ANT|M||||||17
389.386.209|0|ML|18|302.40|560.00|1|1|4|||TBL|PTO|B||||||17
389.386.210|0|ML|18|302.40|560.00|1|1|4|||TBL|PTO|M||||||17
389.386.211|0|ML|18|302.40|560.00|1|1|4|||TBL|CRE|B||||||17
389.386.212|0|ML|18|302.40|560.00|1|1|4|||TBL|CRE|M||||||17
389.386.213|0|ML|18|302.40|560.00|1|1|4|||TBL|CAM|B||||||17
389.386.214|0|ML|18|302.40|560.00|1|1|4|||TBL|CAM|M||||||17
389.386.215|0|ML|18|302.40|560.00|1|1|4|||TBL|OUR|B||||||17
389.386.216|0|ML|18|302.40|560.00|1|1|4|||TBL|OUR|M||||||17
389.386.217|0|ML|18|302.40|560.00|1|1|4|||TBL|COB|B||||||17
389.386.218|0|ML|18|302.40|560.00|1|1|4|||TBL|COB|M||||||17
389.386.219|0|ML|18|302.40|560.00|1|1|4|||TBL|CHO|B||||||17
389.386.220|0|ML|18|302.40|560.00|1|1|4|||TBL|CHO|M||||||17
389.386.221|0|ML|18|302.40|560.00|1|1|4|||TBL|VAG|B||||||17
389.386.222|0|ML|18|302.40|560.00|1|1|4|||TBL|VAG|M||||||17
389.386.223|0|ML|18|302.40|560.00|1|1|4|||TBL|AZE|B||||||17
389.386.224|0|ML|18|302.40|560.00|1|1|4|||TBL|AZE|M||||||17
389.386.225|0|ML|18|302.40|560.00|1|1|4|||TBL|AMA|B||||||17
389.386.226|0|ML|18|302.40|560.00|1|1|4|||TBL|AMA|M||||||17
389.386.227|0|ML|18|302.40|560.00|1|1|4|||TBL|AES|B||||||17
389.386.228|0|ML|18|302.40|560.00|1|1|4|||TBL|AES|M||||||17
389.386.229|0|ML|18|302.40|560.00|1|1|4|||TBL|PRA|B||||||17
389.386.230|0|ML|18|302.40|560.00|1|1|4|||TBL|PRA|M||||||17
389.386.231|0|ML|18|302.40|560.00|1|1|4|||TBL|ROS|B||||||17
389.386.232|0|ML|18|302.40|560.00|1|1|4|||TBL|ROS|M||||||17
389.386.233|0|ML|18|302.40|560.00|1|1|4|||TBL|VER|B||||||17
389.386.234|0|ML|18|302.40|560.00|1|1|4|||TBL|VER|M||||||17
389.386.235|0|ML|18|302.40|560.00|1|1|4|||TBL|AZB|||||||17
389.386.236|0|ML|18|302.40|560.00|1|1|4|||TBL|DEN|||||||17
389.386.237|0|ML|18|302.40|560.00|1|1|4|||TBL|BLK|||||||17
389.386.238|0|ML|18|302.40|560.00|1|1|4|||TBL|ART|||||||17
389.386.239|0|ML|18|302.40|560.00|1|1|4|||TBL|LIN|||||||17
389.386.240|0|ML|18|302.40|560.00|1|1|4|||TBL|HAL|||||||17
389.386.91|0|ML|18|324.00|600.00|1|1|4|||BCO|BCO|B||||||17
389.386.93|0|ML|18|324.00|600.00|1|1|4|||BCO|BCO|M||||||17
389.386.95|0|ML|18|324.00|600.00|1|1|4|||CCL|CCL|B||||||17
389.386.97|0|ML|18|324.00|600.00|1|1|4|||CCL|CCL|M||||||17
389.386.99|0|ML|18|324.00|600.00|1|1|4|||CME|CME|B||||||17
389.386.101|0|ML|18|324.00|600.00|1|1|4|||CME|CME|M||||||17
389.386.103|0|ML|18|324.00|600.00|1|1|4|||ANT|ANT|B||||||17
389.386.105|0|ML|18|324.00|600.00|1|1|4|||ANT|ANT|M||||||17
389.386.107|0|ML|18|324.00|600.00|1|1|4|||PTO|PTO|B||||||17
389.386.109|0|ML|18|324.00|600.00|1|1|4|||PTO|PTO|M||||||17
389.386.111|0|ML|18|324.00|600.00|1|1|4|||CRE|CRE|B||||||17
389.386.113|0|ML|18|324.00|600.00|1|1|4|||CRE|CRE|M||||||17
389.386.115|0|ML|18|324.00|600.00|1|1|4|||CAM|CAM|B||||||17
389.386.117|0|ML|18|324.00|600.00|1|1|4|||CAM|CAM|M||||||17
389.386.119|0|ML|18|324.00|600.00|1|1|4|||OUR|OUR|B||||||17
389.386.121|0|ML|18|324.00|600.00|1|1|4|||OUR|OUR|M||||||17
389.386.123|0|ML|18|324.00|600.00|1|1|4|||COB|COB|B||||||17
389.386.125|0|ML|18|324.00|600.00|1|1|4|||COB|COB|M||||||17
389.386.127|0|ML|18|324.00|600.00|1|1|4|||CHO|CHO|B||||||17
389.386.129|0|ML|18|324.00|600.00|1|1|4|||CHO|CHO|M||||||17
389.386.131|0|ML|18|324.00|600.00|1|1|4|||VAG|VAG|B||||||17
389.386.133|0|ML|18|324.00|600.00|1|1|4|||VAG|VAG|M||||||17
389.386.135|0|ML|18|324.00|600.00|1|1|4|||AZE|AZE|B||||||17
389.386.137|0|ML|18|324.00|600.00|1|1|4|||AZE|AZE|M||||||17
389.386.139|0|ML|18|324.00|600.00|1|1|4|||AMA|AMA|B||||||17
389.386.141|0|ML|18|324.00|600.00|1|1|4|||AMA|AMA|M||||||17
389.386.143|0|ML|18|324.00|600.00|1|1|4|||AES|AES|B||||||17
389.386.145|0|ML|18|324.00|600.00|1|1|4|||AES|AES|M||||||17
389.386.147|0|ML|18|324.00|600.00|1|1|4|||PRA|PRA|B||||||17
389.386.149|0|ML|18|324.00|600.00|1|1|4|||PRA|PRA|M||||||17
389.386.151|0|ML|18|324.00|600.00|1|1|4|||ROS|ROS|B||||||17
389.386.153|0|ML|18|324.00|600.00|1|1|4|||ROS|ROS|M||||||17
389.386.155|0|ML|18|324.00|600.00|1|1|4|||VER|VER|B||||||17
389.386.157|0|ML|18|324.00|600.00|1|1|4|||VER|VER|M||||||17
389.386.165|0|ML|18|324.00|600.00|1|1|4|||AZB|AZB|||||||17
389.386.167|0|ML|18|324.00|600.00|1|1|4|||DEN|DEN|||||||17
389.386.169|0|ML|18|324.00|600.00|1|1|4|||BLK|BLK|||||||17
389.386.171|0|ML|18|324.00|600.00|1|1|4|||ART|ART|||||||17
389.386.173|0|ML|18|324.00|600.00|1|1|4|||LIN|LIN|||||||17
389.386.175|0|ML|18|324.00|600.00|1|1|4|||HAL|HAL|||||||17
389.386.327|0|ML|19|375.30|695.00|1|1|4|||TBL|TBL|||||||17
389.386.328|0|ML|19|375.30|695.00|1|1|4|||TEA|TEA|||||||17
389.386.329|0|ML|19|375.30|695.00|1|1|4|||OAK|OAK|||||||17
389.386.330|0|ML|19|375.30|695.00|1|1|4|||JOP|JOP|||||||17
389.386.331|0|ML|19|402.30|745.00|1|1|4|||TBL|BCO|B||||||17
389.386.332|0|ML|19|402.30|745.00|1|1|4|||TBL|BCO|M||||||17
389.386.333|0|ML|19|402.30|745.00|1|1|4|||TBL|CCL|B||||||17
389.386.334|0|ML|19|402.30|745.00|1|1|4|||TBL|CCL|M||||||17
389.386.335|0|ML|19|402.30|745.00|1|1|4|||TBL|CME|B||||||17
389.386.336|0|ML|19|402.30|745.00|1|1|4|||TBL|CME|M||||||17
389.386.337|0|ML|19|402.30|745.00|1|1|4|||TBL|ANT|B||||||17
389.386.338|0|ML|19|402.30|745.00|1|1|4|||TBL|ANT|M||||||17
389.386.339|0|ML|19|402.30|745.00|1|1|4|||TBL|PTO|B||||||17
389.386.340|0|ML|19|402.30|745.00|1|1|4|||TBL|PTO|M||||||17
389.386.341|0|ML|19|402.30|745.00|1|1|4|||TBL|CRE|B||||||17
389.386.342|0|ML|19|402.30|745.00|1|1|4|||TBL|CRE|M||||||17
389.386.343|0|ML|19|402.30|745.00|1|1|4|||TBL|CAM|B||||||17
389.386.344|0|ML|19|402.30|745.00|1|1|4|||TBL|CAM|M||||||17
389.386.345|0|ML|19|402.30|745.00|1|1|4|||TBL|OUR|B||||||17
389.386.346|0|ML|19|402.30|745.00|1|1|4|||TBL|OUR|M||||||17
389.386.347|0|ML|19|402.30|745.00|1|1|4|||TBL|COB|B||||||17
389.386.348|0|ML|19|402.30|745.00|1|1|4|||TBL|COB|M||||||17
389.386.349|0|ML|19|402.30|745.00|1|1|4|||TBL|CHO|B||||||17
389.386.350|0|ML|19|402.30|745.00|1|1|4|||TBL|CHO|M||||||17
389.386.351|0|ML|19|402.30|745.00|1|1|4|||TBL|VAG|B||||||17
389.386.352|0|ML|19|402.30|745.00|1|1|4|||TBL|VAG|M||||||17
389.386.353|0|ML|19|402.30|745.00|1|1|4|||TBL|AZE|B||||||17
389.386.354|0|ML|19|402.30|745.00|1|1|4|||TBL|AZE|M||||||17
389.386.355|0|ML|19|402.30|745.00|1|1|4|||TBL|AMA|B||||||17
389.386.356|0|ML|19|402.30|745.00|1|1|4|||TBL|AMA|M||||||17
389.386.357|0|ML|19|402.30|745.00|1|1|4|||TBL|AES|B||||||17
389.386.358|0|ML|19|402.30|745.00|1|1|4|||TBL|AES|M||||||17
389.386.359|0|ML|19|402.30|745.00|1|1|4|||TBL|PRA|B||||||17
389.386.360|0|ML|19|402.30|745.00|1|1|4|||TBL|PRA|M||||||17
389.386.361|0|ML|19|402.30|745.00|1|1|4|||TBL|ROS|B||||||17
389.386.362|0|ML|19|402.30|745.00|1|1|4|||TBL|ROS|M||||||17
389.386.363|0|ML|19|402.30|745.00|1|1|4|||TBL|VER|B||||||17
389.386.364|0|ML|19|402.30|745.00|1|1|4|||TBL|VER|M||||||17
389.386.365|0|ML|19|402.30|745.00|1|1|4|||TBL|AZB|||||||17
389.386.366|0|ML|19|402.30|745.00|1|1|4|||TBL|DEN|||||||17
389.386.367|0|ML|19|402.30|745.00|1|1|4|||TBL|BLK|||||||17
389.386.368|0|ML|19|402.30|745.00|1|1|4|||TBL|ART|||||||17
389.386.369|0|ML|19|402.30|745.00|1|1|4|||TBL|LIN|||||||17
389.386.370|0|ML|19|402.30|745.00|1|1|4|||TBL|HAL|||||||17
389.386.92|0|ML|19|423.90|785.00|1|1|4|||BCO|BCO|B||||||17
389.386.94|0|ML|19|423.90|785.00|1|1|4|||BCO|BCO|M||||||17
389.386.96|0|ML|19|423.90|785.00|1|1|4|||CCL|CCL|B||||||17
389.386.98|0|ML|19|423.90|785.00|1|1|4|||CCL|CCL|M||||||17
389.386.100|0|ML|19|423.90|785.00|1|1|4|||CME|CME|B||||||17
389.386.102|0|ML|19|423.90|785.00|1|1|4|||CME|CME|M||||||17
389.386.104|0|ML|19|423.90|785.00|1|1|4|||ANT|ANT|B||||||17
389.386.106|0|ML|19|423.90|785.00|1|1|4|||ANT|ANT|M||||||17
389.386.108|0|ML|19|423.90|785.00|1|1|4|||PTO|PTO|B||||||17
389.386.110|0|ML|19|423.90|785.00|1|1|4|||PTO|PTO|M||||||17
389.386.112|0|ML|19|423.90|785.00|1|1|4|||CRE|CRE|B||||||17
389.386.114|0|ML|19|423.90|785.00|1|1|4|||CRE|CRE|M||||||17
389.386.116|0|ML|19|423.90|785.00|1|1|4|||CAM|CAM|B||||||17
389.386.118|0|ML|19|423.90|785.00|1|1|4|||CAM|CAM|M||||||17
389.386.120|0|ML|19|423.90|785.00|1|1|4|||OUR|OUR|B||||||17
389.386.122|0|ML|19|423.90|785.00|1|1|4|||OUR|OUR|M||||||17
389.386.124|0|ML|19|423.90|785.00|1|1|4|||COB|COB|B||||||17
389.386.126|0|ML|19|423.90|785.00|1|1|4|||COB|COB|M||||||17
389.386.128|0|ML|19|423.90|785.00|1|1|4|||CHO|CHO|B||||||17
389.386.130|0|ML|19|423.90|785.00|1|1|4|||CHO|CHO|M||||||17
389.386.132|0|ML|19|423.90|785.00|1|1|4|||VAG|VAG|B||||||17
389.386.134|0|ML|19|423.90|785.00|1|1|4|||VAG|VAG|M||||||17
389.386.136|0|ML|19|423.90|785.00|1|1|4|||AZE|AZE|B||||||17
389.386.138|0|ML|19|423.90|785.00|1|1|4|||AZE|AZE|M||||||17
389.386.140|0|ML|19|423.90|785.00|1|1|4|||AMA|AMA|B||||||17
389.386.142|0|ML|19|423.90|785.00|1|1|4|||AMA|AMA|M||||||17
389.386.144|0|ML|19|423.90|785.00|1|1|4|||AES|AES|B||||||17
389.386.146|0|ML|19|423.90|785.00|1|1|4|||AES|AES|M||||||17
389.386.148|0|ML|19|423.90|785.00|1|1|4|||PRA|PRA|B||||||17
389.386.150|0|ML|19|423.90|785.00|1|1|4|||PRA|PRA|M||||||17
389.386.152|0|ML|19|423.90|785.00|1|1|4|||ROS|ROS|B||||||17
389.386.154|0|ML|19|423.90|785.00|1|1|4|||ROS|ROS|M||||||17
389.386.156|0|ML|19|423.90|785.00|1|1|4|||VER|VER|B||||||17
389.386.158|0|ML|19|423.90|785.00|1|1|4|||VER|VER|M||||||17
389.386.166|0|ML|19|423.90|785.00|1|1|4|||AZB|AZB|||||||17
389.386.168|0|ML|19|423.90|785.00|1|1|4|||DEN|DEN|||||||17
389.386.170|0|ML|19|423.90|785.00|1|1|4|||BLK|BLK|||||||17
389.386.172|0|ML|19|423.90|785.00|1|1|4|||ART|ART|||||||17
389.386.174|0|ML|19|423.90|785.00|1|1|4|||LIN|LIN|||||||17
389.386.176|0|ML|19|423.90|785.00|1|1|4|||HAL|HAL|||||||17
389.390.197|0|ML|20|302.40|560.00|1|1|4|||TBL|TBL|||||||17
389.390.198|0|ML|20|302.40|560.00|1|1|4|||TEA|TEA|||||||17
389.390.199|0|ML|20|302.40|560.00|1|1|4|||OAK|OAK|||||||17
389.390.200|0|ML|20|302.40|560.00|1|1|4|||JOP|JOP|||||||17
389.390.201|0|ML|20|329.40|610.00|1|1|4|||TBL|BCO|B||||||17
389.390.202|0|ML|20|329.40|610.00|1|1|4|||TBL|BCO|M||||||17
389.390.203|0|ML|20|329.40|610.00|1|1|4|||TBL|CCL|B||||||17
389.390.204|0|ML|20|329.40|610.00|1|1|4|||TBL|CCL|M||||||17
389.390.205|0|ML|20|329.40|610.00|1|1|4|||TBL|CME|B||||||17
389.390.206|0|ML|20|329.40|610.00|1|1|4|||TBL|CME|M||||||17
389.390.207|0|ML|20|329.40|610.00|1|1|4|||TBL|ANT|B||||||17
389.390.208|0|ML|20|329.40|610.00|1|1|4|||TBL|ANT|M||||||17
389.390.209|0|ML|20|329.40|610.00|1|1|4|||TBL|PTO|B||||||17
389.390.210|0|ML|20|329.40|610.00|1|1|4|||TBL|PTO|M||||||17
389.390.211|0|ML|20|329.40|610.00|1|1|4|||TBL|CRE|B||||||17
389.390.212|0|ML|20|329.40|610.00|1|1|4|||TBL|CRE|M||||||17
389.390.213|0|ML|20|329.40|610.00|1|1|4|||TBL|CAM|B||||||17
389.390.214|0|ML|20|329.40|610.00|1|1|4|||TBL|CAM|M||||||17
389.390.215|0|ML|20|329.40|610.00|1|1|4|||TBL|OUR|B||||||17
389.390.216|0|ML|20|329.40|610.00|1|1|4|||TBL|OUR|M||||||17
389.390.217|0|ML|20|329.40|610.00|1|1|4|||TBL|COB|B||||||17
389.390.218|0|ML|20|329.40|610.00|1|1|4|||TBL|COB|M||||||17
389.390.219|0|ML|20|329.40|610.00|1|1|4|||TBL|CHO|B||||||17
389.390.220|0|ML|20|329.40|610.00|1|1|4|||TBL|CHO|M||||||17
389.390.221|0|ML|20|329.40|610.00|1|1|4|||TBL|VAG|B||||||17
389.390.222|0|ML|20|329.40|610.00|1|1|4|||TBL|VAG|M||||||17
389.390.223|0|ML|20|329.40|610.00|1|1|4|||TBL|AZE|B||||||17
389.390.224|0|ML|20|329.40|610.00|1|1|4|||TBL|AZE|M||||||17
389.390.225|0|ML|20|329.40|610.00|1|1|4|||TBL|AMA|B||||||17
389.390.226|0|ML|20|329.40|610.00|1|1|4|||TBL|AMA|M||||||17
389.390.227|0|ML|20|329.40|610.00|1|1|4|||TBL|AES|B||||||17
389.390.228|0|ML|20|329.40|610.00|1|1|4|||TBL|AES|M||||||17
389.390.229|0|ML|20|329.40|610.00|1|1|4|||TBL|PRA|B||||||17
389.390.230|0|ML|20|329.40|610.00|1|1|4|||TBL|PRA|M||||||17
389.390.231|0|ML|20|329.40|610.00|1|1|4|||TBL|ROS|B||||||17
389.390.232|0|ML|20|329.40|610.00|1|1|4|||TBL|ROS|M||||||17
389.390.233|0|ML|20|329.40|610.00|1|1|4|||TBL|VER|B||||||17
389.390.234|0|ML|20|329.40|610.00|1|1|4|||TBL|VER|M||||||17
389.390.235|0|ML|20|329.40|610.00|1|1|4|||TBL|AZB|||||||17
389.390.236|0|ML|20|329.40|610.00|1|1|4|||TBL|DEN|||||||17
389.390.237|0|ML|20|329.40|610.00|1|1|4|||TBL|BLK|||||||17
389.390.238|0|ML|20|329.40|610.00|1|1|4|||TBL|ART|||||||17
389.390.239|0|ML|20|329.40|610.00|1|1|4|||TBL|LIN|||||||17
389.390.240|0|ML|20|329.40|610.00|1|1|4|||TBL|HAL|||||||17
389.390.91|0|ML|20|351.00|650.00|1|1|4|||BCO|BCO|B||||||17
389.390.93|0|ML|20|351.00|650.00|1|1|4|||BCO|BCO|M||||||17
389.390.95|0|ML|20|351.00|650.00|1|1|4|||CCL|CCL|B||||||17
389.390.97|0|ML|20|351.00|650.00|1|1|4|||CCL|CCL|M||||||17
389.390.99|0|ML|20|351.00|650.00|1|1|4|||CME|CME|B||||||17
389.390.101|0|ML|20|351.00|650.00|1|1|4|||CME|CME|M||||||17
389.390.103|0|ML|20|351.00|650.00|1|1|4|||ANT|ANT|B||||||17
389.390.105|0|ML|20|351.00|650.00|1|1|4|||ANT|ANT|M||||||17
389.390.107|0|ML|20|351.00|650.00|1|1|4|||PTO|PTO|B||||||17
389.390.109|0|ML|20|351.00|650.00|1|1|4|||PTO|PTO|M||||||17
389.390.111|0|ML|20|351.00|650.00|1|1|4|||CRE|CRE|B||||||17
389.390.113|0|ML|20|351.00|650.00|1|1|4|||CRE|CRE|M||||||17
389.390.115|0|ML|20|351.00|650.00|1|1|4|||CAM|CAM|B||||||17
389.390.117|0|ML|20|351.00|650.00|1|1|4|||CAM|CAM|M||||||17
389.390.119|0|ML|20|351.00|650.00|1|1|4|||OUR|OUR|B||||||17
389.390.121|0|ML|20|351.00|650.00|1|1|4|||OUR|OUR|M||||||17
389.390.123|0|ML|20|351.00|650.00|1|1|4|||COB|COB|B||||||17
389.390.125|0|ML|20|351.00|650.00|1|1|4|||COB|COB|M||||||17
389.390.127|0|ML|20|351.00|650.00|1|1|4|||CHO|CHO|B||||||17
389.390.129|0|ML|20|351.00|650.00|1|1|4|||CHO|CHO|M||||||17
389.390.131|0|ML|20|351.00|650.00|1|1|4|||VAG|VAG|B||||||17
389.390.133|0|ML|20|351.00|650.00|1|1|4|||VAG|VAG|M||||||17
389.390.135|0|ML|20|351.00|650.00|1|1|4|||AZE|AZE|B||||||17
389.390.137|0|ML|20|351.00|650.00|1|1|4|||AZE|AZE|M||||||17
389.390.139|0|ML|20|351.00|650.00|1|1|4|||AMA|AMA|B||||||17
389.390.141|0|ML|20|351.00|650.00|1|1|4|||AMA|AMA|M||||||17
389.390.143|0|ML|20|351.00|650.00|1|1|4|||AES|AES|B||||||17
389.390.145|0|ML|20|351.00|650.00|1|1|4|||AES|AES|M||||||17
389.390.147|0|ML|20|351.00|650.00|1|1|4|||PRA|PRA|B||||||17
389.390.149|0|ML|20|351.00|650.00|1|1|4|||PRA|PRA|M||||||17
389.390.151|0|ML|20|351.00|650.00|1|1|4|||ROS|ROS|B||||||17
389.390.153|0|ML|20|351.00|650.00|1|1|4|||ROS|ROS|M||||||17
389.390.155|0|ML|20|351.00|650.00|1|1|4|||VER|VER|B||||||17
389.390.157|0|ML|20|351.00|650.00|1|1|4|||VER|VER|M||||||17
389.390.165|0|ML|20|351.00|650.00|1|1|4|||AZB|AZB|||||||17
389.390.167|0|ML|20|351.00|650.00|1|1|4|||DEN|DEN|||||||17
389.390.169|0|ML|20|351.00|650.00|1|1|4|||BLK|BLK|||||||17
389.390.171|0|ML|20|351.00|650.00|1|1|4|||ART|ART|||||||17
389.390.173|0|ML|20|351.00|650.00|1|1|4|||LIN|LIN|||||||17
389.390.175|0|ML|20|351.00|650.00|1|1|4|||HAL|HAL|||||||17
389.390.327|0|ML|21|475.20|880.00|1|1|4|||TBL|TBL|||||||17
389.390.328|0|ML|21|475.20|880.00|1|1|4|||TEA|TEA|||||||17
389.390.329|0|ML|21|475.20|880.00|1|1|4|||OAK|OAK|||||||17
389.390.330|0|ML|21|475.20|880.00|1|1|4|||JOP|JOP|||||||17
389.390.331|0|ML|21|502.20|930.00|1|1|4|||TBL|BCO|B||||||17
389.390.332|0|ML|21|502.20|930.00|1|1|4|||TBL|BCO|M||||||17
389.390.333|0|ML|21|502.20|930.00|1|1|4|||TBL|CCL|B||||||17
389.390.334|0|ML|21|502.20|930.00|1|1|4|||TBL|CCL|M||||||17
389.390.335|0|ML|21|502.20|930.00|1|1|4|||TBL|CME|B||||||17
389.390.336|0|ML|21|502.20|930.00|1|1|4|||TBL|CME|M||||||17
389.390.337|0|ML|21|502.20|930.00|1|1|4|||TBL|ANT|B||||||17
389.390.338|0|ML|21|502.20|930.00|1|1|4|||TBL|ANT|M||||||17
389.390.339|0|ML|21|502.20|930.00|1|1|4|||TBL|PTO|B||||||17
389.390.340|0|ML|21|502.20|930.00|1|1|4|||TBL|PTO|M||||||17
389.390.341|0|ML|21|502.20|930.00|1|1|4|||TBL|CRE|B||||||17
389.390.342|0|ML|21|502.20|930.00|1|1|4|||TBL|CRE|M||||||17
389.390.343|0|ML|21|502.20|930.00|1|1|4|||TBL|CAM|B||||||17
389.390.344|0|ML|21|502.20|930.00|1|1|4|||TBL|CAM|M||||||17
389.390.345|0|ML|21|502.20|930.00|1|1|4|||TBL|OUR|B||||||17
389.390.346|0|ML|21|502.20|930.00|1|1|4|||TBL|OUR|M||||||17
389.390.347|0|ML|21|502.20|930.00|1|1|4|||TBL|COB|B||||||17
389.390.348|0|ML|21|502.20|930.00|1|1|4|||TBL|COB|M||||||17
389.390.349|0|ML|21|502.20|930.00|1|1|4|||TBL|CHO|B||||||17
389.390.350|0|ML|21|502.20|930.00|1|1|4|||TBL|CHO|M||||||17
389.390.351|0|ML|21|502.20|930.00|1|1|4|||TBL|VAG|B||||||17
389.390.352|0|ML|21|502.20|930.00|1|1|4|||TBL|VAG|M||||||17
389.390.353|0|ML|21|502.20|930.00|1|1|4|||TBL|AZE|B||||||17
389.390.354|0|ML|21|502.20|930.00|1|1|4|||TBL|AZE|M||||||17
389.390.355|0|ML|21|502.20|930.00|1|1|4|||TBL|AMA|B||||||17
389.390.356|0|ML|21|502.20|930.00|1|1|4|||TBL|AMA|M||||||17
389.390.357|0|ML|21|502.20|930.00|1|1|4|||TBL|AES|B||||||17
389.390.358|0|ML|21|502.20|930.00|1|1|4|||TBL|AES|M||||||17
389.390.359|0|ML|21|502.20|930.00|1|1|4|||TBL|PRA|B||||||17
389.390.360|0|ML|21|502.20|930.00|1|1|4|||TBL|PRA|M||||||17
389.390.361|0|ML|21|502.20|930.00|1|1|4|||TBL|ROS|B||||||17
389.390.362|0|ML|21|502.20|930.00|1|1|4|||TBL|ROS|M||||||17
389.390.363|0|ML|21|502.20|930.00|1|1|4|||TBL|VER|B||||||17
389.390.364|0|ML|21|502.20|930.00|1|1|4|||TBL|VER|M||||||17
389.390.365|0|ML|21|502.20|930.00|1|1|4|||TBL|AZB|||||||17
389.390.366|0|ML|21|502.20|930.00|1|1|4|||TBL|DEN|||||||17
389.390.367|0|ML|21|502.20|930.00|1|1|4|||TBL|BLK|||||||17
389.390.368|0|ML|21|502.20|930.00|1|1|4|||TBL|ART|||||||17
389.390.369|0|ML|21|502.20|930.00|1|1|4|||TBL|LIN|||||||17
389.390.370|0|ML|21|502.20|930.00|1|1|4|||TBL|HAL|||||||17
389.390.92|0|ML|21|523.80|970.00|1|1|4|||BCO|BCO|B||||||17
389.390.94|0|ML|21|523.80|970.00|1|1|4|||BCO|BCO|M||||||17
389.390.96|0|ML|21|523.80|970.00|1|1|4|||CCL|CCL|B||||||17
389.390.98|0|ML|21|523.80|970.00|1|1|4|||CCL|CCL|M||||||17
389.390.100|0|ML|21|523.80|970.00|1|1|4|||CME|CME|B||||||17
389.390.102|0|ML|21|523.80|970.00|1|1|4|||CME|CME|M||||||17
389.390.104|0|ML|21|523.80|970.00|1|1|4|||ANT|ANT|B||||||17
389.390.106|0|ML|21|523.80|970.00|1|1|4|||ANT|ANT|M||||||17
389.390.108|0|ML|21|523.80|970.00|1|1|4|||PTO|PTO|B||||||17
389.390.110|0|ML|21|523.80|970.00|1|1|4|||PTO|PTO|M||||||17
389.390.112|0|ML|21|523.80|970.00|1|1|4|||CRE|CRE|B||||||17
389.390.114|0|ML|21|523.80|970.00|1|1|4|||CRE|CRE|M||||||17
389.390.116|0|ML|21|523.80|970.00|1|1|4|||CAM|CAM|B||||||17
389.390.118|0|ML|21|523.80|970.00|1|1|4|||CAM|CAM|M||||||17
389.390.120|0|ML|21|523.80|970.00|1|1|4|||OUR|OUR|B||||||17
389.390.122|0|ML|21|523.80|970.00|1|1|4|||OUR|OUR|M||||||17
389.390.124|0|ML|21|523.80|970.00|1|1|4|||COB|COB|B||||||17
389.390.126|0|ML|21|523.80|970.00|1|1|4|||COB|COB|M||||||17
389.390.128|0|ML|21|523.80|970.00|1|1|4|||CHO|CHO|B||||||17
389.390.130|0|ML|21|523.80|970.00|1|1|4|||CHO|CHO|M||||||17
389.390.132|0|ML|21|523.80|970.00|1|1|4|||VAG|VAG|B||||||17
389.390.134|0|ML|21|523.80|970.00|1|1|4|||VAG|VAG|M||||||17
389.390.136|0|ML|21|523.80|970.00|1|1|4|||AZE|AZE|B||||||17
389.390.138|0|ML|21|523.80|970.00|1|1|4|||AZE|AZE|M||||||17
389.390.140|0|ML|21|523.80|970.00|1|1|4|||AMA|AMA|B||||||17
389.390.142|0|ML|21|523.80|970.00|1|1|4|||AMA|AMA|M||||||17
389.390.144|0|ML|21|523.80|970.00|1|1|4|||AES|AES|B||||||17
389.390.146|0|ML|21|523.80|970.00|1|1|4|||AES|AES|M||||||17
389.390.148|0|ML|21|523.80|970.00|1|1|4|||PRA|PRA|B||||||17
389.390.150|0|ML|21|523.80|970.00|1|1|4|||PRA|PRA|M||||||17
389.390.152|0|ML|21|523.80|970.00|1|1|4|||ROS|ROS|B||||||17
389.390.154|0|ML|21|523.80|970.00|1|1|4|||ROS|ROS|M||||||17
389.390.156|0|ML|21|523.80|970.00|1|1|4|||VER|VER|B||||||17
389.390.158|0|ML|21|523.80|970.00|1|1|4|||VER|VER|M||||||17
389.390.166|0|ML|21|523.80|970.00|1|1|4|||AZB|AZB|||||||17
389.390.168|0|ML|21|523.80|970.00|1|1|4|||DEN|DEN|||||||17
389.390.170|0|ML|21|523.80|970.00|1|1|4|||BLK|BLK|||||||17
389.390.172|0|ML|21|523.80|970.00|1|1|4|||ART|ART|||||||17
389.390.174|0|ML|21|523.80|970.00|1|1|4|||LIN|LIN|||||||17
389.390.176|0|ML|21|523.80|970.00|1|1|4|||HAL|HAL|||||||17
389.391.197|0|ML|22|410.40|760.00|1|1|4|||TBL|TBL|||||||17
389.391.198|0|ML|22|410.40|760.00|1|1|4|||TEA|TEA|||||||17
389.391.199|0|ML|22|410.40|760.00|1|1|4|||OAK|OAK|||||||17
389.391.200|0|ML|22|410.40|760.00|1|1|4|||JOP|JOP|||||||17
389.391.201|0|ML|22|437.40|810.00|1|1|4|||TBL|BCO|B||||||17
389.391.202|0|ML|22|437.40|810.00|1|1|4|||TBL|BCO|M||||||17
389.391.203|0|ML|22|437.40|810.00|1|1|4|||TBL|CCL|B||||||17
389.391.204|0|ML|22|437.40|810.00|1|1|4|||TBL|CCL|M||||||17
389.391.205|0|ML|22|437.40|810.00|1|1|4|||TBL|CME|B||||||17
389.391.206|0|ML|22|437.40|810.00|1|1|4|||TBL|CME|M||||||17
389.391.207|0|ML|22|437.40|810.00|1|1|4|||TBL|ANT|B||||||17
389.391.208|0|ML|22|437.40|810.00|1|1|4|||TBL|ANT|M||||||17
389.391.209|0|ML|22|437.40|810.00|1|1|4|||TBL|PTO|B||||||17
389.391.210|0|ML|22|437.40|810.00|1|1|4|||TBL|PTO|M||||||17
389.391.211|0|ML|22|437.40|810.00|1|1|4|||TBL|CRE|B||||||17
389.391.212|0|ML|22|437.40|810.00|1|1|4|||TBL|CRE|M||||||17
389.391.213|0|ML|22|437.40|810.00|1|1|4|||TBL|CAM|B||||||17
389.391.214|0|ML|22|437.40|810.00|1|1|4|||TBL|CAM|M||||||17
389.391.215|0|ML|22|437.40|810.00|1|1|4|||TBL|OUR|B||||||17
389.391.216|0|ML|22|437.40|810.00|1|1|4|||TBL|OUR|M||||||17
389.391.217|0|ML|22|437.40|810.00|1|1|4|||TBL|COB|B||||||17
389.391.218|0|ML|22|437.40|810.00|1|1|4|||TBL|COB|M||||||17
389.391.219|0|ML|22|437.40|810.00|1|1|4|||TBL|CHO|B||||||17
389.391.220|0|ML|22|437.40|810.00|1|1|4|||TBL|CHO|M||||||17
389.391.221|0|ML|22|437.40|810.00|1|1|4|||TBL|VAG|B||||||17
389.391.222|0|ML|22|437.40|810.00|1|1|4|||TBL|VAG|M||||||17
389.391.223|0|ML|22|437.40|810.00|1|1|4|||TBL|AZE|B||||||17
389.391.224|0|ML|22|437.40|810.00|1|1|4|||TBL|AZE|M||||||17
389.391.225|0|ML|22|437.40|810.00|1|1|4|||TBL|AMA|B||||||17
389.391.226|0|ML|22|437.40|810.00|1|1|4|||TBL|AMA|M||||||17
389.391.227|0|ML|22|437.40|810.00|1|1|4|||TBL|AES|B||||||17
389.391.228|0|ML|22|437.40|810.00|1|1|4|||TBL|AES|M||||||17
389.391.229|0|ML|22|437.40|810.00|1|1|4|||TBL|PRA|B||||||17
389.391.230|0|ML|22|437.40|810.00|1|1|4|||TBL|PRA|M||||||17
389.391.231|0|ML|22|437.40|810.00|1|1|4|||TBL|ROS|B||||||17
389.391.232|0|ML|22|437.40|810.00|1|1|4|||TBL|ROS|M||||||17
389.391.233|0|ML|22|437.40|810.00|1|1|4|||TBL|VER|B||||||17
389.391.234|0|ML|22|437.40|810.00|1|1|4|||TBL|VER|M||||||17
389.391.235|0|ML|22|437.40|810.00|1|1|4|||TBL|AZB|||||||17
389.391.236|0|ML|22|437.40|810.00|1|1|4|||TBL|DEN|||||||17
389.391.237|0|ML|22|437.40|810.00|1|1|4|||TBL|BLK|||||||17
389.391.238|0|ML|22|437.40|810.00|1|1|4|||TBL|ART|||||||17
389.391.239|0|ML|22|437.40|810.00|1|1|4|||TBL|LIN|||||||17
389.391.240|0|ML|22|437.40|810.00|1|1|4|||TBL|HAL|||||||17
389.391.91|0|ML|22|459.00|850.00|1|1|4|||BCO|BCO|B||||||17
389.391.93|0|ML|22|459.00|850.00|1|1|4|||BCO|BCO|M||||||17
389.391.95|0|ML|22|459.00|850.00|1|1|4|||CCL|CCL|B||||||17
389.391.97|0|ML|22|459.00|850.00|1|1|4|||CCL|CCL|M||||||17
389.391.99|0|ML|22|459.00|850.00|1|1|4|||CME|CME|B||||||17
389.391.101|0|ML|22|459.00|850.00|1|1|4|||CME|CME|M||||||17
389.391.103|0|ML|22|459.00|850.00|1|1|4|||ANT|ANT|B||||||17
389.391.105|0|ML|22|459.00|850.00|1|1|4|||ANT|ANT|M||||||17
389.391.107|0|ML|22|459.00|850.00|1|1|4|||PTO|PTO|B||||||17
389.391.109|0|ML|22|459.00|850.00|1|1|4|||PTO|PTO|M||||||17
389.391.111|0|ML|22|459.00|850.00|1|1|4|||CRE|CRE|B||||||17
389.391.113|0|ML|22|459.00|850.00|1|1|4|||CRE|CRE|M||||||17
389.391.115|0|ML|22|459.00|850.00|1|1|4|||CAM|CAM|B||||||17
389.391.117|0|ML|22|459.00|850.00|1|1|4|||CAM|CAM|M||||||17
389.391.119|0|ML|22|459.00|850.00|1|1|4|||OUR|OUR|B||||||17
389.391.121|0|ML|22|459.00|850.00|1|1|4|||OUR|OUR|M||||||17
389.391.123|0|ML|22|459.00|850.00|1|1|4|||COB|COB|B||||||17
389.391.125|0|ML|22|459.00|850.00|1|1|4|||COB|COB|M||||||17
389.391.127|0|ML|22|459.00|850.00|1|1|4|||CHO|CHO|B||||||17
389.391.129|0|ML|22|459.00|850.00|1|1|4|||CHO|CHO|M||||||17
389.391.131|0|ML|22|459.00|850.00|1|1|4|||VAG|VAG|B||||||17
389.391.133|0|ML|22|459.00|850.00|1|1|4|||VAG|VAG|M||||||17
389.391.135|0|ML|22|459.00|850.00|1|1|4|||AZE|AZE|B||||||17
389.391.137|0|ML|22|459.00|850.00|1|1|4|||AZE|AZE|M||||||17
389.391.139|0|ML|22|459.00|850.00|1|1|4|||AMA|AMA|B||||||17
389.391.141|0|ML|22|459.00|850.00|1|1|4|||AMA|AMA|M||||||17
389.391.143|0|ML|22|459.00|850.00|1|1|4|||AES|AES|B||||||17
389.391.145|0|ML|22|459.00|850.00|1|1|4|||AES|AES|M||||||17
389.391.147|0|ML|22|459.00|850.00|1|1|4|||PRA|PRA|B||||||17
389.391.149|0|ML|22|459.00|850.00|1|1|4|||PRA|PRA|M||||||17
389.391.151|0|ML|22|459.00|850.00|1|1|4|||ROS|ROS|B||||||17
389.391.153|0|ML|22|459.00|850.00|1|1|4|||ROS|ROS|M||||||17
389.391.155|0|ML|22|459.00|850.00|1|1|4|||VER|VER|B||||||17
389.391.157|0|ML|22|459.00|850.00|1|1|4|||VER|VER|M||||||17
389.391.165|0|ML|22|459.00|850.00|1|1|4|||AZB|AZB|||||||17
389.391.167|0|ML|22|459.00|850.00|1|1|4|||DEN|DEN|||||||17
389.391.169|0|ML|22|459.00|850.00|1|1|4|||BLK|BLK|||||||17
389.391.171|0|ML|22|459.00|850.00|1|1|4|||ART|ART|||||||17
389.391.173|0|ML|22|459.00|850.00|1|1|4|||LIN|LIN|||||||17
389.391.175|0|ML|22|459.00|850.00|1|1|4|||HAL|HAL|||||||17
389.391.327|0|ML|23|583.20|1080.00|1|1|4|||TBL|TBL|||||||17
389.391.328|0|ML|23|583.20|1080.00|1|1|4|||TEA|TEA|||||||17
389.391.329|0|ML|23|583.20|1080.00|1|1|4|||OAK|OAK|||||||17
389.391.330|0|ML|23|583.20|1080.00|1|1|4|||JOP|JOP|||||||17
389.391.331|0|ML|23|610.20|1130.00|1|1|4|||TBL|BCO|B||||||17
389.391.332|0|ML|23|610.20|1130.00|1|1|4|||TBL|BCO|M||||||17
389.391.333|0|ML|23|610.20|1130.00|1|1|4|||TBL|CCL|B||||||17
389.391.334|0|ML|23|610.20|1130.00|1|1|4|||TBL|CCL|M||||||17
389.391.335|0|ML|23|610.20|1130.00|1|1|4|||TBL|CME|B||||||17
389.391.336|0|ML|23|610.20|1130.00|1|1|4|||TBL|CME|M||||||17
389.391.337|0|ML|23|610.20|1130.00|1|1|4|||TBL|ANT|B||||||17
389.391.338|0|ML|23|610.20|1130.00|1|1|4|||TBL|ANT|M||||||17
389.391.339|0|ML|23|610.20|1130.00|1|1|4|||TBL|PTO|B||||||17
389.391.340|0|ML|23|610.20|1130.00|1|1|4|||TBL|PTO|M||||||17
389.391.341|0|ML|23|610.20|1130.00|1|1|4|||TBL|CRE|B||||||17
389.391.342|0|ML|23|610.20|1130.00|1|1|4|||TBL|CRE|M||||||17
389.391.343|0|ML|23|610.20|1130.00|1|1|4|||TBL|CAM|B||||||17
389.391.344|0|ML|23|610.20|1130.00|1|1|4|||TBL|CAM|M||||||17
389.391.345|0|ML|23|610.20|1130.00|1|1|4|||TBL|OUR|B||||||17
389.391.346|0|ML|23|610.20|1130.00|1|1|4|||TBL|OUR|M||||||17
389.391.347|0|ML|23|610.20|1130.00|1|1|4|||TBL|COB|B||||||17
389.391.348|0|ML|23|610.20|1130.00|1|1|4|||TBL|COB|M||||||17
389.391.349|0|ML|23|610.20|1130.00|1|1|4|||TBL|CHO|B||||||17
389.391.350|0|ML|23|610.20|1130.00|1|1|4|||TBL|CHO|M||||||17
389.391.351|0|ML|23|610.20|1130.00|1|1|4|||TBL|VAG|B||||||17
389.391.352|0|ML|23|610.20|1130.00|1|1|4|||TBL|VAG|M||||||17
389.391.353|0|ML|23|610.20|1130.00|1|1|4|||TBL|AZE|B||||||17
389.391.354|0|ML|23|610.20|1130.00|1|1|4|||TBL|AZE|M||||||17
389.391.355|0|ML|23|610.20|1130.00|1|1|4|||TBL|AMA|B||||||17
389.391.356|0|ML|23|610.20|1130.00|1|1|4|||TBL|AMA|M||||||17
389.391.357|0|ML|23|610.20|1130.00|1|1|4|||TBL|AES|B||||||17
389.391.358|0|ML|23|610.20|1130.00|1|1|4|||TBL|AES|M||||||17
389.391.359|0|ML|23|610.20|1130.00|1|1|4|||TBL|PRA|B||||||17
389.391.360|0|ML|23|610.20|1130.00|1|1|4|||TBL|PRA|M||||||17
389.391.361|0|ML|23|610.20|1130.00|1|1|4|||TBL|ROS|B||||||17
389.391.362|0|ML|23|610.20|1130.00|1|1|4|||TBL|ROS|M||||||17
389.391.363|0|ML|23|610.20|1130.00|1|1|4|||TBL|VER|B||||||17
389.391.364|0|ML|23|610.20|1130.00|1|1|4|||TBL|VER|M||||||17
389.391.365|0|ML|23|610.20|1130.00|1|1|4|||TBL|AZB|||||||17
389.391.366|0|ML|23|610.20|1130.00|1|1|4|||TBL|DEN|||||||17
389.391.367|0|ML|23|610.20|1130.00|1|1|4|||TBL|BLK|||||||17
389.391.368|0|ML|23|610.20|1130.00|1|1|4|||TBL|ART|||||||17
389.391.369|0|ML|23|610.20|1130.00|1|1|4|||TBL|LIN|||||||17
389.391.370|0|ML|23|610.20|1130.00|1|1|4|||TBL|HAL|||||||17
389.391.92|0|ML|23|631.80|1170.00|1|1|4|||BCO|BCO|B||||||17
389.391.94|0|ML|23|631.80|1170.00|1|1|4|||BCO|BCO|M||||||17
389.391.96|0|ML|23|631.80|1170.00|1|1|4|||CCL|CCL|B||||||17
389.391.98|0|ML|23|631.80|1170.00|1|1|4|||CCL|CCL|M||||||17
389.391.100|0|ML|23|631.80|1170.00|1|1|4|||CME|CME|B||||||17
389.391.102|0|ML|23|631.80|1170.00|1|1|4|||CME|CME|M||||||17
389.391.104|0|ML|23|631.80|1170.00|1|1|4|||ANT|ANT|B||||||17
389.391.106|0|ML|23|631.80|1170.00|1|1|4|||ANT|ANT|M||||||17
389.391.108|0|ML|23|631.80|1170.00|1|1|4|||PTO|PTO|B||||||17
389.391.110|0|ML|23|631.80|1170.00|1|1|4|||PTO|PTO|M||||||17
389.391.112|0|ML|23|631.80|1170.00|1|1|4|||CRE|CRE|B||||||17
389.391.114|0|ML|23|631.80|1170.00|1|1|4|||CRE|CRE|M||||||17
389.391.116|0|ML|23|631.80|1170.00|1|1|4|||CAM|CAM|B||||||17
389.391.118|0|ML|23|631.80|1170.00|1|1|4|||CAM|CAM|M||||||17
389.391.120|0|ML|23|631.80|1170.00|1|1|4|||OUR|OUR|B||||||17
389.391.122|0|ML|23|631.80|1170.00|1|1|4|||OUR|OUR|M||||||17
389.391.124|0|ML|23|631.80|1170.00|1|1|4|||COB|COB|B||||||17
389.391.126|0|ML|23|631.80|1170.00|1|1|4|||COB|COB|M||||||17
389.391.128|0|ML|23|631.80|1170.00|1|1|4|||CHO|CHO|B||||||17
389.391.130|0|ML|23|631.80|1170.00|1|1|4|||CHO|CHO|M||||||17
389.391.132|0|ML|23|631.80|1170.00|1|1|4|||VAG|VAG|B||||||17
389.391.134|0|ML|23|631.80|1170.00|1|1|4|||VAG|VAG|M||||||17
389.391.136|0|ML|23|631.80|1170.00|1|1|4|||AZE|AZE|B||||||17
389.391.138|0|ML|23|631.80|1170.00|1|1|4|||AZE|AZE|M||||||17
389.391.140|0|ML|23|631.80|1170.00|1|1|4|||AMA|AMA|B||||||17
389.391.142|0|ML|23|631.80|1170.00|1|1|4|||AMA|AMA|M||||||17
389.391.144|0|ML|23|631.80|1170.00|1|1|4|||AES|AES|B||||||17
389.391.146|0|ML|23|631.80|1170.00|1|1|4|||AES|AES|M||||||17
389.391.148|0|ML|23|631.80|1170.00|1|1|4|||PRA|PRA|B||||||17
389.391.150|0|ML|23|631.80|1170.00|1|1|4|||PRA|PRA|M||||||17
389.391.152|0|ML|23|631.80|1170.00|1|1|4|||ROS|ROS|B||||||17
389.391.154|0|ML|23|631.80|1170.00|1|1|4|||ROS|ROS|M||||||17
389.391.156|0|ML|23|631.80|1170.00|1|1|4|||VER|VER|B||||||17
389.391.158|0|ML|23|631.80|1170.00|1|1|4|||VER|VER|M||||||17
389.391.166|0|ML|23|631.80|1170.00|1|1|4|||AZB|AZB|||||||17
389.391.168|0|ML|23|631.80|1170.00|1|1|4|||DEN|DEN|||||||17
389.391.170|0|ML|23|631.80|1170.00|1|1|4|||BLK|BLK|||||||17
389.391.172|0|ML|23|631.80|1170.00|1|1|4|||ART|ART|||||||17
389.391.174|0|ML|23|631.80|1170.00|1|1|4|||LIN|LIN|||||||17
389.391.176|0|ML|23|631.80|1170.00|1|1|4|||HAL|HAL|||||||17
392.393.394|0|ML|24|92.88|172.00|1|1|5|||TBR|TBR|||||||4
392.393.198|0|ML|24|92.88|172.00|1|1|5|||TEA|TEA|||||||4
392.393.199|0|ML|24|92.88|172.00|1|1|5|||OAK|OAK|||||||4
392.393.200|0|ML|24|92.88|172.00|1|1|5|||JOP|JOP|||||||4
392.393.395|0|ML|24|136.08|252.00|1|1|5|||TBR|BCO|B||||||4
392.393.396|0|ML|24|136.08|252.00|1|1|5|||TBR|BCO|M||||||4
392.393.397|0|ML|24|136.08|252.00|1|1|5|||TBR|CCL|B||||||4
392.393.398|0|ML|24|136.08|252.00|1|1|5|||TBR|CCL|M||||||4
392.393.399|0|ML|24|136.08|252.00|1|1|5|||TBR|CME|B||||||4
392.393.400|0|ML|24|136.08|252.00|1|1|5|||TBR|CME|M||||||4
392.393.401|0|ML|24|136.08|252.00|1|1|5|||TBR|ANT|B||||||4
392.393.402|0|ML|24|136.08|252.00|1|1|5|||TBR|ANT|M||||||4
392.393.403|0|ML|24|136.08|252.00|1|1|5|||TBR|PTO|B||||||4
392.393.404|0|ML|24|136.08|252.00|1|1|5|||TBR|PTO|M||||||4
392.393.405|0|ML|24|136.08|252.00|1|1|5|||TBR|CRE|B||||||4
392.393.406|0|ML|24|136.08|252.00|1|1|5|||TBR|CRE|M||||||4
392.393.407|0|ML|24|136.08|252.00|1|1|5|||TBR|CAM|B||||||4
392.393.408|0|ML|24|136.08|252.00|1|1|5|||TBR|CAM|M||||||4
392.393.409|0|ML|24|136.08|252.00|1|1|5|||TBR|OUR|B||||||4
392.393.410|0|ML|24|136.08|252.00|1|1|5|||TBR|OUR|M||||||4
392.393.411|0|ML|24|136.08|252.00|1|1|5|||TBR|COB|B||||||4
392.393.412|0|ML|24|136.08|252.00|1|1|5|||TBR|COB|M||||||4
392.393.413|0|ML|24|136.08|252.00|1|1|5|||TBR|CHO|B||||||4
392.393.414|0|ML|24|136.08|252.00|1|1|5|||TBR|CHO|M||||||4
392.393.415|0|ML|24|136.08|252.00|1|1|5|||TBR|VAG|B||||||4
392.393.416|0|ML|24|136.08|252.00|1|1|5|||TBR|VAG|M||||||4
392.393.417|0|ML|24|136.08|252.00|1|1|5|||TBR|AZE|B||||||4
392.393.418|0|ML|24|136.08|252.00|1|1|5|||TBR|AZE|M||||||4
392.393.419|0|ML|24|136.08|252.00|1|1|5|||TBR|AMA|B||||||4
392.393.420|0|ML|24|136.08|252.00|1|1|5|||TBR|AMA|M||||||4
392.393.421|0|ML|24|136.08|252.00|1|1|5|||TBR|AES|B||||||4
392.393.422|0|ML|24|136.08|252.00|1|1|5|||TBR|AES|M||||||4
392.393.423|0|ML|24|136.08|252.00|1|1|5|||TBR|PRA|B||||||4
392.393.424|0|ML|24|136.08|252.00|1|1|5|||TBR|PRA|M||||||4
392.393.425|0|ML|24|136.08|252.00|1|1|5|||TBR|ROS|B||||||4
392.393.426|0|ML|24|136.08|252.00|1|1|5|||TBR|ROS|M||||||4
392.393.427|0|ML|24|136.08|252.00|1|1|5|||TBR|VER|B||||||4
392.393.428|0|ML|24|136.08|252.00|1|1|5|||TBR|VER|M||||||4
392.393.429|0|ML|24|136.08|252.00|1|1|5|||TBR|AZB|||||||4
392.393.430|0|ML|24|136.08|252.00|1|1|5|||TBR|DEN|||||||4
392.393.431|0|ML|24|136.08|252.00|1|1|5|||TBR|BLK|||||||4
392.393.432|0|ML|24|136.08|252.00|1|1|5|||TBR|ART|||||||4
392.393.433|0|ML|24|136.08|252.00|1|1|5|||TBR|LIN|||||||4
392.393.434|0|ML|24|136.08|252.00|1|1|5|||TBR|HAL|||||||4
392.393.435|0|ML|24|157.68|292.00|1|1|5|||BCO|BCO|B||||||4
392.393.436|0|ML|24|157.68|292.00|1|1|5|||BCO|BCO|M||||||4
392.393.437|0|ML|24|157.68|292.00|1|1|5|||CCL|CCL|B||||||4
392.393.438|0|ML|24|157.68|292.00|1|1|5|||CCL|CCL|M||||||4
392.393.439|0|ML|24|157.68|292.00|1|1|5|||CME|CME|B||||||4
392.393.440|0|ML|24|157.68|292.00|1|1|5|||CME|CME|M||||||4
392.393.441|0|ML|24|157.68|292.00|1|1|5|||ANT|ANT|B||||||4
392.393.442|0|ML|24|157.68|292.00|1|1|5|||ANT|ANT|M||||||4
392.393.443|0|ML|24|157.68|292.00|1|1|5|||PTO|PTO|B||||||4
392.393.444|0|ML|24|157.68|292.00|1|1|5|||PTO|PTO|M||||||4
392.393.445|0|ML|24|157.68|292.00|1|1|5|||CRE|CRE|B||||||4
392.393.446|0|ML|24|157.68|292.00|1|1|5|||CRE|CRE|M||||||4
392.393.447|0|ML|24|157.68|292.00|1|1|5|||CAM|CAM|B||||||4
392.393.448|0|ML|24|157.68|292.00|1|1|5|||CAM|CAM|M||||||4
392.393.449|0|ML|24|157.68|292.00|1|1|5|||OUR|OUR|B||||||4
392.393.450|0|ML|24|157.68|292.00|1|1|5|||OUR|OUR|M||||||4
392.393.451|0|ML|24|157.68|292.00|1|1|5|||COB|COB|B||||||4
392.393.452|0|ML|24|157.68|292.00|1|1|5|||COB|COB|M||||||4
392.393.453|0|ML|24|157.68|292.00|1|1|5|||CHO|CHO|B||||||4
392.393.454|0|ML|24|157.68|292.00|1|1|5|||CHO|CHO|M||||||4
392.393.455|0|ML|24|157.68|292.00|1|1|5|||VAG|VAG|B||||||4
392.393.456|0|ML|24|157.68|292.00|1|1|5|||VAG|VAG|M||||||4
392.393.457|0|ML|24|157.68|292.00|1|1|5|||AZE|AZE|B||||||4
392.393.458|0|ML|24|157.68|292.00|1|1|5|||AZE|AZE|M||||||4
392.393.459|0|ML|24|157.68|292.00|1|1|5|||AMA|AMA|B||||||4
392.393.460|0|ML|24|157.68|292.00|1|1|5|||AMA|AMA|M||||||4
392.393.461|0|ML|24|157.68|292.00|1|1|5|||AES|AES|B||||||4
392.393.462|0|ML|24|157.68|292.00|1|1|5|||AES|AES|M||||||4
392.393.463|0|ML|24|157.68|292.00|1|1|5|||PRA|PRA|B||||||4
392.393.464|0|ML|24|157.68|292.00|1|1|5|||PRA|PRA|M||||||4
392.393.465|0|ML|24|157.68|292.00|1|1|5|||ROS|ROS|B||||||4
392.393.466|0|ML|24|157.68|292.00|1|1|5|||ROS|ROS|M||||||4
392.393.467|0|ML|24|157.68|292.00|1|1|5|||VER|VER|B||||||4
392.393.468|0|ML|24|157.68|292.00|1|1|5|||VER|VER|M||||||4
392.393.469|0|ML|24|157.68|292.00|1|1|5|||AZB|AZB|||||||4
392.393.470|0|ML|24|157.68|292.00|1|1|5|||DEN|DEN|||||||4
392.393.471|0|ML|24|157.68|292.00|1|1|5|||BLK|BLK|||||||4
392.393.472|0|ML|24|157.68|292.00|1|1|5|||ART|ART|||||||4
392.393.473|0|ML|24|157.68|292.00|1|1|5|||LIN|LIN|||||||4
392.393.474|0|ML|24|157.68|292.00|1|1|5|||HAL|HAL|||||||4
392.393.475|0|ML|25|92.88|172.00|1|1|5|||TBR|TBR|||||||4
392.393.242|0|ML|25|92.88|172.00|1|1|5|||TEA|TEA|||||||4
392.393.243|0|ML|25|92.88|172.00|1|1|5|||OAK|OAK|||||||4
392.393.244|0|ML|25|92.88|172.00|1|1|5|||JOP|JOP|||||||4
392.393.476|0|ML|25|136.08|252.00|1|1|5|||TBR|BCO|B||||||4
392.393.477|0|ML|25|136.08|252.00|1|1|5|||TBR|BCO|M||||||4
392.393.478|0|ML|25|136.08|252.00|1|1|5|||TBR|CCL|B||||||4
392.393.479|0|ML|25|136.08|252.00|1|1|5|||TBR|CCL|M||||||4
392.393.480|0|ML|25|136.08|252.00|1|1|5|||TBR|CME|B||||||4
392.393.481|0|ML|25|136.08|252.00|1|1|5|||TBR|CME|M||||||4
392.393.482|0|ML|25|136.08|252.00|1|1|5|||TBR|ANT|B||||||4
392.393.483|0|ML|25|136.08|252.00|1|1|5|||TBR|ANT|M||||||4
392.393.484|0|ML|25|136.08|252.00|1|1|5|||TBR|PTO|B||||||4
392.393.485|0|ML|25|136.08|252.00|1|1|5|||TBR|PTO|M||||||4
392.393.486|0|ML|25|136.08|252.00|1|1|5|||TBR|CRE|B||||||4
392.393.487|0|ML|25|136.08|252.00|1|1|5|||TBR|CRE|M||||||4
392.393.488|0|ML|25|136.08|252.00|1|1|5|||TBR|CAM|B||||||4
392.393.489|0|ML|25|136.08|252.00|1|1|5|||TBR|CAM|M||||||4
392.393.490|0|ML|25|136.08|252.00|1|1|5|||TBR|OUR|B||||||4
392.393.491|0|ML|25|136.08|252.00|1|1|5|||TBR|OUR|M||||||4
392.393.492|0|ML|25|136.08|252.00|1|1|5|||TBR|COB|B||||||4
392.393.493|0|ML|25|136.08|252.00|1|1|5|||TBR|COB|M||||||4
392.393.494|0|ML|25|136.08|252.00|1|1|5|||TBR|CHO|B||||||4
392.393.495|0|ML|25|136.08|252.00|1|1|5|||TBR|CHO|M||||||4
392.393.496|0|ML|25|136.08|252.00|1|1|5|||TBR|VAG|B||||||4
392.393.497|0|ML|25|136.08|252.00|1|1|5|||TBR|VAG|M||||||4
392.393.498|0|ML|25|136.08|252.00|1|1|5|||TBR|AZE|B||||||4
392.393.499|0|ML|25|136.08|252.00|1|1|5|||TBR|AZE|M||||||4
392.393.500|0|ML|25|136.08|252.00|1|1|5|||TBR|AMA|B||||||4
392.393.501|0|ML|25|136.08|252.00|1|1|5|||TBR|AMA|M||||||4
392.393.502|0|ML|25|136.08|252.00|1|1|5|||TBR|AES|B||||||4
392.393.503|0|ML|25|136.08|252.00|1|1|5|||TBR|AES|M||||||4
392.393.504|0|ML|25|136.08|252.00|1|1|5|||TBR|PRA|B||||||4
392.393.505|0|ML|25|136.08|252.00|1|1|5|||TBR|PRA|M||||||4
392.393.506|0|ML|25|136.08|252.00|1|1|5|||TBR|ROS|B||||||4
392.393.507|0|ML|25|136.08|252.00|1|1|5|||TBR|ROS|M||||||4
392.393.508|0|ML|25|136.08|252.00|1|1|5|||TBR|VER|B||||||4
392.393.509|0|ML|25|136.08|252.00|1|1|5|||TBR|VER|M||||||4
392.393.510|0|ML|25|136.08|252.00|1|1|5|||TBR|AZB|||||||4
392.393.511|0|ML|25|136.08|252.00|1|1|5|||TBR|DEN|||||||4
392.393.512|0|ML|25|136.08|252.00|1|1|5|||TBR|BLK|||||||4
392.393.513|0|ML|25|136.08|252.00|1|1|5|||TBR|ART|||||||4
392.393.514|0|ML|25|136.08|252.00|1|1|5|||TBR|LIN|||||||4
392.393.515|0|ML|25|136.08|252.00|1|1|5|||TBR|HAL|||||||4
392.393.516|0|ML|25|157.68|292.00|1|1|5|||BCO|BCO|B||||||4
392.393.517|0|ML|25|157.68|292.00|1|1|5|||BCO|BCO|M||||||4
392.393.518|0|ML|25|157.68|292.00|1|1|5|||CCL|CCL|B||||||4
392.393.519|0|ML|25|157.68|292.00|1|1|5|||CCL|CCL|M||||||4
392.393.520|0|ML|25|157.68|292.00|1|1|5|||CME|CME|B||||||4
392.393.521|0|ML|25|157.68|292.00|1|1|5|||CME|CME|M||||||4
392.393.522|0|ML|25|157.68|292.00|1|1|5|||ANT|ANT|B||||||4
392.393.523|0|ML|25|157.68|292.00|1|1|5|||ANT|ANT|M||||||4
392.393.524|0|ML|25|157.68|292.00|1|1|5|||PTO|PTO|B||||||4
392.393.525|0|ML|25|157.68|292.00|1|1|5|||PTO|PTO|M||||||4
392.393.526|0|ML|25|157.68|292.00|1|1|5|||CRE|CRE|B||||||4
392.393.527|0|ML|25|157.68|292.00|1|1|5|||CRE|CRE|M||||||4
392.393.528|0|ML|25|157.68|292.00|1|1|5|||CAM|CAM|B||||||4
392.393.529|0|ML|25|157.68|292.00|1|1|5|||CAM|CAM|M||||||4
392.393.530|0|ML|25|157.68|292.00|1|1|5|||OUR|OUR|B||||||4
392.393.531|0|ML|25|157.68|292.00|1|1|5|||OUR|OUR|M||||||4
392.393.532|0|ML|25|157.68|292.00|1|1|5|||COB|COB|B||||||4
392.393.533|0|ML|25|157.68|292.00|1|1|5|||COB|COB|M||||||4
392.393.534|0|ML|25|157.68|292.00|1|1|5|||CHO|CHO|B||||||4
392.393.535|0|ML|25|157.68|292.00|1|1|5|||CHO|CHO|M||||||4
392.393.536|0|ML|25|157.68|292.00|1|1|5|||VAG|VAG|B||||||4
392.393.537|0|ML|25|157.68|292.00|1|1|5|||VAG|VAG|M||||||4
392.393.538|0|ML|25|157.68|292.00|1|1|5|||AZE|AZE|B||||||4
392.393.539|0|ML|25|157.68|292.00|1|1|5|||AZE|AZE|M||||||4
392.393.540|0|ML|25|157.68|292.00|1|1|5|||AMA|AMA|B||||||4
392.393.541|0|ML|25|157.68|292.00|1|1|5|||AMA|AMA|M||||||4
392.393.542|0|ML|25|157.68|292.00|1|1|5|||AES|AES|B||||||4
392.393.543|0|ML|25|157.68|292.00|1|1|5|||AES|AES|M||||||4
392.393.544|0|ML|25|157.68|292.00|1|1|5|||PRA|PRA|B||||||4
392.393.545|0|ML|25|157.68|292.00|1|1|5|||PRA|PRA|M||||||4
392.393.546|0|ML|25|157.68|292.00|1|1|5|||ROS|ROS|B||||||4
392.393.547|0|ML|25|157.68|292.00|1|1|5|||ROS|ROS|M||||||4
392.393.548|0|ML|25|157.68|292.00|1|1|5|||VER|VER|B||||||4
392.393.549|0|ML|25|157.68|292.00|1|1|5|||VER|VER|M||||||4
392.393.550|0|ML|25|157.68|292.00|1|1|5|||AZB|AZB|||||||4
392.393.551|0|ML|25|157.68|292.00|1|1|5|||DEN|DEN|||||||4
392.393.552|0|ML|25|157.68|292.00|1|1|5|||BLK|BLK|||||||4
392.393.553|0|ML|25|157.68|292.00|1|1|5|||ART|ART|||||||4
392.393.554|0|ML|25|157.68|292.00|1|1|5|||LIN|LIN|||||||4
392.393.555|0|ML|25|157.68|292.00|1|1|5|||HAL|HAL|||||||4
556.557.394|0|ML|26|102.60|190.00|1|1|5|||TBR|TBR|||||||5
556.557.198|0|ML|26|102.60|190.00|1|1|5|||TEA|TEA|||||||5
556.557.199|0|ML|26|102.60|190.00|1|1|5|||OAK|OAK|||||||5
556.557.200|0|ML|26|102.60|190.00|1|1|5|||JOP|JOP|||||||5
556.557.395|0|ML|26|145.80|270.00|1|1|5|||TBR|BCO|B||||||5
556.557.396|0|ML|26|145.80|270.00|1|1|5|||TBR|BCO|M||||||5
556.557.397|0|ML|26|145.80|270.00|1|1|5|||TBR|CCL|B||||||5
556.557.398|0|ML|26|145.80|270.00|1|1|5|||TBR|CCL|M||||||5
556.557.399|0|ML|26|145.80|270.00|1|1|5|||TBR|CME|B||||||5
556.557.400|0|ML|26|145.80|270.00|1|1|5|||TBR|CME|M||||||5
556.557.401|0|ML|26|145.80|270.00|1|1|5|||TBR|ANT|B||||||5
556.557.402|0|ML|26|145.80|270.00|1|1|5|||TBR|ANT|M||||||5
556.557.403|0|ML|26|145.80|270.00|1|1|5|||TBR|PTO|B||||||5
556.557.404|0|ML|26|145.80|270.00|1|1|5|||TBR|PTO|M||||||5
556.557.405|0|ML|26|145.80|270.00|1|1|5|||TBR|CRE|B||||||5
556.557.406|0|ML|26|145.80|270.00|1|1|5|||TBR|CRE|M||||||5
556.557.407|0|ML|26|145.80|270.00|1|1|5|||TBR|CAM|B||||||5
556.557.408|0|ML|26|145.80|270.00|1|1|5|||TBR|CAM|M||||||5
556.557.409|0|ML|26|145.80|270.00|1|1|5|||TBR|OUR|B||||||5
556.557.410|0|ML|26|145.80|270.00|1|1|5|||TBR|OUR|M||||||5
556.557.411|0|ML|26|145.80|270.00|1|1|5|||TBR|COB|B||||||5
556.557.412|0|ML|26|145.80|270.00|1|1|5|||TBR|COB|M||||||5
556.557.413|0|ML|26|145.80|270.00|1|1|5|||TBR|CHO|B||||||5
556.557.414|0|ML|26|145.80|270.00|1|1|5|||TBR|CHO|M||||||5
556.557.415|0|ML|26|145.80|270.00|1|1|5|||TBR|VAG|B||||||5
556.557.416|0|ML|26|145.80|270.00|1|1|5|||TBR|VAG|M||||||5
556.557.417|0|ML|26|145.80|270.00|1|1|5|||TBR|AZE|B||||||5
556.557.418|0|ML|26|145.80|270.00|1|1|5|||TBR|AZE|M||||||5
556.557.419|0|ML|26|145.80|270.00|1|1|5|||TBR|AMA|B||||||5
556.557.420|0|ML|26|145.80|270.00|1|1|5|||TBR|AMA|M||||||5
556.557.421|0|ML|26|145.80|270.00|1|1|5|||TBR|AES|B||||||5
556.557.422|0|ML|26|145.80|270.00|1|1|5|||TBR|AES|M||||||5
556.557.423|0|ML|26|145.80|270.00|1|1|5|||TBR|PRA|B||||||5
556.557.424|0|ML|26|145.80|270.00|1|1|5|||TBR|PRA|M||||||5
556.557.425|0|ML|26|145.80|270.00|1|1|5|||TBR|ROS|B||||||5
556.557.426|0|ML|26|145.80|270.00|1|1|5|||TBR|ROS|M||||||5
556.557.427|0|ML|26|145.80|270.00|1|1|5|||TBR|VER|B||||||5
556.557.428|0|ML|26|145.80|270.00|1|1|5|||TBR|VER|M||||||5
556.557.429|0|ML|26|145.80|270.00|1|1|5|||TBR|AZB|||||||5
556.557.430|0|ML|26|145.80|270.00|1|1|5|||TBR|DEN|||||||5
556.557.431|0|ML|26|145.80|270.00|1|1|5|||TBR|BLK|||||||5
556.557.432|0|ML|26|145.80|270.00|1|1|5|||TBR|ART|||||||5
556.557.433|0|ML|26|145.80|270.00|1|1|5|||TBR|LIN|||||||5
556.557.434|0|ML|26|145.80|270.00|1|1|5|||TBR|HAL|||||||5
556.557.435|0|ML|26|167.40|310.00|1|1|5|||BCO|BCO|B||||||5
556.557.436|0|ML|26|167.40|310.00|1|1|5|||BCO|BCO|M||||||5
556.557.437|0|ML|26|167.40|310.00|1|1|5|||CCL|CCL|B||||||5
556.557.438|0|ML|26|167.40|310.00|1|1|5|||CCL|CCL|M||||||5
556.557.439|0|ML|26|167.40|310.00|1|1|5|||CME|CME|B||||||5
556.557.440|0|ML|26|167.40|310.00|1|1|5|||CME|CME|M||||||5
556.557.441|0|ML|26|167.40|310.00|1|1|5|||ANT|ANT|B||||||5
556.557.442|0|ML|26|167.40|310.00|1|1|5|||ANT|ANT|M||||||5
556.557.443|0|ML|26|167.40|310.00|1|1|5|||PTO|PTO|B||||||5
556.557.444|0|ML|26|167.40|310.00|1|1|5|||PTO|PTO|M||||||5
556.557.445|0|ML|26|167.40|310.00|1|1|5|||CRE|CRE|B||||||5
556.557.446|0|ML|26|167.40|310.00|1|1|5|||CRE|CRE|M||||||5
556.557.447|0|ML|26|167.40|310.00|1|1|5|||CAM|CAM|B||||||5
556.557.448|0|ML|26|167.40|310.00|1|1|5|||CAM|CAM|M||||||5
556.557.449|0|ML|26|167.40|310.00|1|1|5|||OUR|OUR|B||||||5
556.557.450|0|ML|26|167.40|310.00|1|1|5|||OUR|OUR|M||||||5
556.557.451|0|ML|26|167.40|310.00|1|1|5|||COB|COB|B||||||5
556.557.452|0|ML|26|167.40|310.00|1|1|5|||COB|COB|M||||||5
556.557.453|0|ML|26|167.40|310.00|1|1|5|||CHO|CHO|B||||||5
556.557.454|0|ML|26|167.40|310.00|1|1|5|||CHO|CHO|M||||||5
556.557.455|0|ML|26|167.40|310.00|1|1|5|||VAG|VAG|B||||||5
556.557.456|0|ML|26|167.40|310.00|1|1|5|||VAG|VAG|M||||||5
556.557.457|0|ML|26|167.40|310.00|1|1|5|||AZE|AZE|B||||||5
556.557.458|0|ML|26|167.40|310.00|1|1|5|||AZE|AZE|M||||||5
556.557.459|0|ML|26|167.40|310.00|1|1|5|||AMA|AMA|B||||||5
556.557.460|0|ML|26|167.40|310.00|1|1|5|||AMA|AMA|M||||||5
556.557.461|0|ML|26|167.40|310.00|1|1|5|||AES|AES|B||||||5
556.557.462|0|ML|26|167.40|310.00|1|1|5|||AES|AES|M||||||5
556.557.463|0|ML|26|167.40|310.00|1|1|5|||PRA|PRA|B||||||5
556.557.464|0|ML|26|167.40|310.00|1|1|5|||PRA|PRA|M||||||5
556.557.465|0|ML|26|167.40|310.00|1|1|5|||ROS|ROS|B||||||5
556.557.466|0|ML|26|167.40|310.00|1|1|5|||ROS|ROS|M||||||5
556.557.467|0|ML|26|167.40|310.00|1|1|5|||VER|VER|B||||||5
556.557.468|0|ML|26|167.40|310.00|1|1|5|||VER|VER|M||||||5
556.557.469|0|ML|26|167.40|310.00|1|1|5|||AZB|AZB|||||||5
556.557.470|0|ML|26|167.40|310.00|1|1|5|||DEN|DEN|||||||5
556.557.471|0|ML|26|167.40|310.00|1|1|5|||BLK|BLK|||||||5
556.557.472|0|ML|26|167.40|310.00|1|1|5|||ART|ART|||||||5
556.557.473|0|ML|26|167.40|310.00|1|1|5|||LIN|LIN|||||||5
556.557.474|0|ML|26|167.40|310.00|1|1|5|||HAL|HAL|||||||5
556.557.475|0|ML|27|102.60|190.00|1|1|5|||TBR|TBR|||||||5
556.557.242|0|ML|27|102.60|190.00|1|1|5|||TEA|TEA|||||||5
556.557.243|0|ML|27|102.60|190.00|1|1|5|||OAK|OAK|||||||5
556.557.244|0|ML|27|102.60|190.00|1|1|5|||JOP|JOP|||||||5
556.557.476|0|ML|27|145.80|270.00|1|1|5|||TBR|BCO|B||||||5
556.557.477|0|ML|27|145.80|270.00|1|1|5|||TBR|BCO|M||||||5
556.557.478|0|ML|27|145.80|270.00|1|1|5|||TBR|CCL|B||||||5
556.557.479|0|ML|27|145.80|270.00|1|1|5|||TBR|CCL|M||||||5
556.557.480|0|ML|27|145.80|270.00|1|1|5|||TBR|CME|B||||||5
556.557.481|0|ML|27|145.80|270.00|1|1|5|||TBR|CME|M||||||5
556.557.482|0|ML|27|145.80|270.00|1|1|5|||TBR|ANT|B||||||5
556.557.483|0|ML|27|145.80|270.00|1|1|5|||TBR|ANT|M||||||5
556.557.484|0|ML|27|145.80|270.00|1|1|5|||TBR|PTO|B||||||5
556.557.485|0|ML|27|145.80|270.00|1|1|5|||TBR|PTO|M||||||5
556.557.486|0|ML|27|145.80|270.00|1|1|5|||TBR|CRE|B||||||5
556.557.487|0|ML|27|145.80|270.00|1|1|5|||TBR|CRE|M||||||5
556.557.488|0|ML|27|145.80|270.00|1|1|5|||TBR|CAM|B||||||5
556.557.489|0|ML|27|145.80|270.00|1|1|5|||TBR|CAM|M||||||5
556.557.490|0|ML|27|145.80|270.00|1|1|5|||TBR|OUR|B||||||5
556.557.491|0|ML|27|145.80|270.00|1|1|5|||TBR|OUR|M||||||5
556.557.492|0|ML|27|145.80|270.00|1|1|5|||TBR|COB|B||||||5
556.557.493|0|ML|27|145.80|270.00|1|1|5|||TBR|COB|M||||||5
556.557.494|0|ML|27|145.80|270.00|1|1|5|||TBR|CHO|B||||||5
556.557.495|0|ML|27|145.80|270.00|1|1|5|||TBR|CHO|M||||||5
556.557.496|0|ML|27|145.80|270.00|1|1|5|||TBR|VAG|B||||||5
556.557.497|0|ML|27|145.80|270.00|1|1|5|||TBR|VAG|M||||||5
556.557.498|0|ML|27|145.80|270.00|1|1|5|||TBR|AZE|B||||||5
556.557.499|0|ML|27|145.80|270.00|1|1|5|||TBR|AZE|M||||||5
556.557.500|0|ML|27|145.80|270.00|1|1|5|||TBR|AMA|B||||||5
556.557.501|0|ML|27|145.80|270.00|1|1|5|||TBR|AMA|M||||||5
556.557.502|0|ML|27|145.80|270.00|1|1|5|||TBR|AES|B||||||5
556.557.503|0|ML|27|145.80|270.00|1|1|5|||TBR|AES|M||||||5
556.557.504|0|ML|27|145.80|270.00|1|1|5|||TBR|PRA|B||||||5
556.557.505|0|ML|27|145.80|270.00|1|1|5|||TBR|PRA|M||||||5
556.557.506|0|ML|27|145.80|270.00|1|1|5|||TBR|ROS|B||||||5
556.557.507|0|ML|27|145.80|270.00|1|1|5|||TBR|ROS|M||||||5
556.557.508|0|ML|27|145.80|270.00|1|1|5|||TBR|VER|B||||||5
556.557.509|0|ML|27|145.80|270.00|1|1|5|||TBR|VER|M||||||5
556.557.510|0|ML|27|145.80|270.00|1|1|5|||TBR|AZB|||||||5
556.557.511|0|ML|27|145.80|270.00|1|1|5|||TBR|DEN|||||||5
556.557.512|0|ML|27|145.80|270.00|1|1|5|||TBR|BLK|||||||5
556.557.513|0|ML|27|145.80|270.00|1|1|5|||TBR|ART|||||||5
556.557.514|0|ML|27|145.80|270.00|1|1|5|||TBR|LIN|||||||5
556.557.515|0|ML|27|145.80|270.00|1|1|5|||TBR|HAL|||||||5
556.557.516|0|ML|27|167.40|310.00|1|1|5|||BCO|BCO|B||||||5
556.557.517|0|ML|27|167.40|310.00|1|1|5|||BCO|BCO|M||||||5
556.557.518|0|ML|27|167.40|310.00|1|1|5|||CCL|CCL|B||||||5
556.557.519|0|ML|27|167.40|310.00|1|1|5|||CCL|CCL|M||||||5
556.557.520|0|ML|27|167.40|310.00|1|1|5|||CME|CME|B||||||5
556.557.521|0|ML|27|167.40|310.00|1|1|5|||CME|CME|M||||||5
556.557.522|0|ML|27|167.40|310.00|1|1|5|||ANT|ANT|B||||||5
556.557.523|0|ML|27|167.40|310.00|1|1|5|||ANT|ANT|M||||||5
556.557.524|0|ML|27|167.40|310.00|1|1|5|||PTO|PTO|B||||||5
556.557.525|0|ML|27|167.40|310.00|1|1|5|||PTO|PTO|M||||||5
556.557.526|0|ML|27|167.40|310.00|1|1|5|||CRE|CRE|B||||||5
556.557.527|0|ML|27|167.40|310.00|1|1|5|||CRE|CRE|M||||||5
556.557.528|0|ML|27|167.40|310.00|1|1|5|||CAM|CAM|B||||||5
556.557.529|0|ML|27|167.40|310.00|1|1|5|||CAM|CAM|M||||||5
556.557.530|0|ML|27|167.40|310.00|1|1|5|||OUR|OUR|B||||||5
556.557.531|0|ML|27|167.40|310.00|1|1|5|||OUR|OUR|M||||||5
556.557.532|0|ML|27|167.40|310.00|1|1|5|||COB|COB|B||||||5
556.557.533|0|ML|27|167.40|310.00|1|1|5|||COB|COB|M||||||5
556.557.534|0|ML|27|167.40|310.00|1|1|5|||CHO|CHO|B||||||5
556.557.535|0|ML|27|167.40|310.00|1|1|5|||CHO|CHO|M||||||5
556.557.536|0|ML|27|167.40|310.00|1|1|5|||VAG|VAG|B||||||5
556.557.537|0|ML|27|167.40|310.00|1|1|5|||VAG|VAG|M||||||5
556.557.538|0|ML|27|167.40|310.00|1|1|5|||AZE|AZE|B||||||5
556.557.539|0|ML|27|167.40|310.00|1|1|5|||AZE|AZE|M||||||5
556.557.540|0|ML|27|167.40|310.00|1|1|5|||AMA|AMA|B||||||5
556.557.541|0|ML|27|167.40|310.00|1|1|5|||AMA|AMA|M||||||5
556.557.542|0|ML|27|167.40|310.00|1|1|5|||AES|AES|B||||||5
556.557.543|0|ML|27|167.40|310.00|1|1|5|||AES|AES|M||||||5
556.557.544|0|ML|27|167.40|310.00|1|1|5|||PRA|PRA|B||||||5
556.557.545|0|ML|27|167.40|310.00|1|1|5|||PRA|PRA|M||||||5
556.557.546|0|ML|27|167.40|310.00|1|1|5|||ROS|ROS|B||||||5
556.557.547|0|ML|27|167.40|310.00|1|1|5|||ROS|ROS|M||||||5
556.557.548|0|ML|27|167.40|310.00|1|1|5|||VER|VER|B||||||5
556.557.549|0|ML|27|167.40|310.00|1|1|5|||VER|VER|M||||||5
556.557.550|0|ML|27|167.40|310.00|1|1|5|||AZB|AZB|||||||5
556.557.551|0|ML|27|167.40|310.00|1|1|5|||DEN|DEN|||||||5
556.557.552|0|ML|27|167.40|310.00|1|1|5|||BLK|BLK|||||||5
556.557.553|0|ML|27|167.40|310.00|1|1|5|||ART|ART|||||||5
556.557.554|0|ML|27|167.40|310.00|1|1|5|||LIN|LIN|||||||5
556.557.555|0|ML|27|167.40|310.00|1|1|5|||HAL|HAL|||||||5
558.557.394|0|ML|26|108.00|200.00|1|1|5|||TBR|TBR|||||||1
558.557.198|0|ML|26|108.00|200.00|1|1|5|||TEA|TEA|||||||1
558.557.199|0|ML|26|108.00|200.00|1|1|5|||OAK|OAK|||||||1
558.557.200|0|ML|26|108.00|200.00|1|1|5|||JOP|JOP|||||||1
558.557.395|0|ML|26|151.20|280.00|1|1|5|||TBR|BCO|B||||||1
558.557.396|0|ML|26|151.20|280.00|1|1|5|||TBR|BCO|M||||||1
558.557.397|0|ML|26|151.20|280.00|1|1|5|||TBR|CCL|B||||||1
558.557.398|0|ML|26|151.20|280.00|1|1|5|||TBR|CCL|M||||||1
558.557.399|0|ML|26|151.20|280.00|1|1|5|||TBR|CME|B||||||1
558.557.400|0|ML|26|151.20|280.00|1|1|5|||TBR|CME|M||||||1
558.557.401|0|ML|26|151.20|280.00|1|1|5|||TBR|ANT|B||||||1
558.557.402|0|ML|26|151.20|280.00|1|1|5|||TBR|ANT|M||||||1
558.557.403|0|ML|26|151.20|280.00|1|1|5|||TBR|PTO|B||||||1
558.557.404|0|ML|26|151.20|280.00|1|1|5|||TBR|PTO|M||||||1
558.557.405|0|ML|26|151.20|280.00|1|1|5|||TBR|CRE|B||||||1
558.557.406|0|ML|26|151.20|280.00|1|1|5|||TBR|CRE|M||||||1
558.557.407|0|ML|26|151.20|280.00|1|1|5|||TBR|CAM|B||||||1
558.557.408|0|ML|26|151.20|280.00|1|1|5|||TBR|CAM|M||||||1
558.557.409|0|ML|26|151.20|280.00|1|1|5|||TBR|OUR|B||||||1
558.557.410|0|ML|26|151.20|280.00|1|1|5|||TBR|OUR|M||||||1
558.557.411|0|ML|26|151.20|280.00|1|1|5|||TBR|COB|B||||||1
558.557.412|0|ML|26|151.20|280.00|1|1|5|||TBR|COB|M||||||1
558.557.413|0|ML|26|151.20|280.00|1|1|5|||TBR|CHO|B||||||1
558.557.414|0|ML|26|151.20|280.00|1|1|5|||TBR|CHO|M||||||1
558.557.415|0|ML|26|151.20|280.00|1|1|5|||TBR|VAG|B||||||1
558.557.416|0|ML|26|151.20|280.00|1|1|5|||TBR|VAG|M||||||1
558.557.417|0|ML|26|151.20|280.00|1|1|5|||TBR|AZE|B||||||1
558.557.418|0|ML|26|151.20|280.00|1|1|5|||TBR|AZE|M||||||1
558.557.419|0|ML|26|151.20|280.00|1|1|5|||TBR|AMA|B||||||1
558.557.420|0|ML|26|151.20|280.00|1|1|5|||TBR|AMA|M||||||1
558.557.421|0|ML|26|151.20|280.00|1|1|5|||TBR|AES|B||||||1
558.557.422|0|ML|26|151.20|280.00|1|1|5|||TBR|AES|M||||||1
558.557.423|0|ML|26|151.20|280.00|1|1|5|||TBR|PRA|B||||||1
558.557.424|0|ML|26|151.20|280.00|1|1|5|||TBR|PRA|M||||||1
558.557.425|0|ML|26|151.20|280.00|1|1|5|||TBR|ROS|B||||||1
558.557.426|0|ML|26|151.20|280.00|1|1|5|||TBR|ROS|M||||||1
558.557.427|0|ML|26|151.20|280.00|1|1|5|||TBR|VER|B||||||1
558.557.428|0|ML|26|151.20|280.00|1|1|5|||TBR|VER|M||||||1
558.557.429|0|ML|26|151.20|280.00|1|1|5|||TBR|AZB|||||||1
558.557.430|0|ML|26|151.20|280.00|1|1|5|||TBR|DEN|||||||1
558.557.431|0|ML|26|151.20|280.00|1|1|5|||TBR|BLK|||||||1
558.557.432|0|ML|26|151.20|280.00|1|1|5|||TBR|ART|||||||1
558.557.433|0|ML|26|151.20|280.00|1|1|5|||TBR|LIN|||||||1
558.557.434|0|ML|26|151.20|280.00|1|1|5|||TBR|HAL|||||||1
558.557.435|0|ML|26|172.80|320.00|1|1|5|||BCO|BCO|B||||||1
558.557.436|0|ML|26|172.80|320.00|1|1|5|||BCO|BCO|M||||||1
558.557.437|0|ML|26|172.80|320.00|1|1|5|||CCL|CCL|B||||||1
558.557.438|0|ML|26|172.80|320.00|1|1|5|||CCL|CCL|M||||||1
558.557.439|0|ML|26|172.80|320.00|1|1|5|||CME|CME|B||||||1
558.557.440|0|ML|26|172.80|320.00|1|1|5|||CME|CME|M||||||1
558.557.441|0|ML|26|172.80|320.00|1|1|5|||ANT|ANT|B||||||1
558.557.442|0|ML|26|172.80|320.00|1|1|5|||ANT|ANT|M||||||1
558.557.443|0|ML|26|172.80|320.00|1|1|5|||PTO|PTO|B||||||1
558.557.444|0|ML|26|172.80|320.00|1|1|5|||PTO|PTO|M||||||1
558.557.445|0|ML|26|172.80|320.00|1|1|5|||CRE|CRE|B||||||1
558.557.446|0|ML|26|172.80|320.00|1|1|5|||CRE|CRE|M||||||1
558.557.447|0|ML|26|172.80|320.00|1|1|5|||CAM|CAM|B||||||1
558.557.448|0|ML|26|172.80|320.00|1|1|5|||CAM|CAM|M||||||1
558.557.449|0|ML|26|172.80|320.00|1|1|5|||OUR|OUR|B||||||1
558.557.450|0|ML|26|172.80|320.00|1|1|5|||OUR|OUR|M||||||1
558.557.451|0|ML|26|172.80|320.00|1|1|5|||COB|COB|B||||||1
558.557.452|0|ML|26|172.80|320.00|1|1|5|||COB|COB|M||||||1
558.557.453|0|ML|26|172.80|320.00|1|1|5|||CHO|CHO|B||||||1
558.557.454|0|ML|26|172.80|320.00|1|1|5|||CHO|CHO|M||||||1
558.557.455|0|ML|26|172.80|320.00|1|1|5|||VAG|VAG|B||||||1
558.557.456|0|ML|26|172.80|320.00|1|1|5|||VAG|VAG|M||||||1
558.557.457|0|ML|26|172.80|320.00|1|1|5|||AZE|AZE|B||||||1
558.557.458|0|ML|26|172.80|320.00|1|1|5|||AZE|AZE|M||||||1
558.557.459|0|ML|26|172.80|320.00|1|1|5|||AMA|AMA|B||||||1
558.557.460|0|ML|26|172.80|320.00|1|1|5|||AMA|AMA|M||||||1
558.557.461|0|ML|26|172.80|320.00|1|1|5|||AES|AES|B||||||1
558.557.462|0|ML|26|172.80|320.00|1|1|5|||AES|AES|M||||||1
558.557.463|0|ML|26|172.80|320.00|1|1|5|||PRA|PRA|B||||||1
558.557.464|0|ML|26|172.80|320.00|1|1|5|||PRA|PRA|M||||||1
558.557.465|0|ML|26|172.80|320.00|1|1|5|||ROS|ROS|B||||||1
558.557.466|0|ML|26|172.80|320.00|1|1|5|||ROS|ROS|M||||||1
558.557.467|0|ML|26|172.80|320.00|1|1|5|||VER|VER|B||||||1
558.557.468|0|ML|26|172.80|320.00|1|1|5|||VER|VER|M||||||1
558.557.469|0|ML|26|172.80|320.00|1|1|5|||AZB|AZB|||||||1
558.557.470|0|ML|26|172.80|320.00|1|1|5|||DEN|DEN|||||||1
558.557.471|0|ML|26|172.80|320.00|1|1|5|||BLK|BLK|||||||1
558.557.472|0|ML|26|172.80|320.00|1|1|5|||ART|ART|||||||1
558.557.473|0|ML|26|172.80|320.00|1|1|5|||LIN|LIN|||||||1
558.557.474|0|ML|26|172.80|320.00|1|1|5|||HAL|HAL|||||||1
558.557.475|0|ML|27|108.00|200.00|1|1|5|||TBR|TBR|||||||1
558.557.242|0|ML|27|108.00|200.00|1|1|5|||TEA|TEA|||||||1
558.557.243|0|ML|27|108.00|200.00|1|1|5|||OAK|OAK|||||||1
558.557.244|0|ML|27|108.00|200.00|1|1|5|||JOP|JOP|||||||1
558.557.476|0|ML|27|151.20|280.00|1|1|5|||TBR|BCO|B||||||1
558.557.477|0|ML|27|151.20|280.00|1|1|5|||TBR|BCO|M||||||1
558.557.478|0|ML|27|151.20|280.00|1|1|5|||TBR|CCL|B||||||1
558.557.479|0|ML|27|151.20|280.00|1|1|5|||TBR|CCL|M||||||1
558.557.480|0|ML|27|151.20|280.00|1|1|5|||TBR|CME|B||||||1
558.557.481|0|ML|27|151.20|280.00|1|1|5|||TBR|CME|M||||||1
558.557.482|0|ML|27|151.20|280.00|1|1|5|||TBR|ANT|B||||||1
558.557.483|0|ML|27|151.20|280.00|1|1|5|||TBR|ANT|M||||||1
558.557.484|0|ML|27|151.20|280.00|1|1|5|||TBR|PTO|B||||||1
558.557.485|0|ML|27|151.20|280.00|1|1|5|||TBR|PTO|M||||||1
558.557.486|0|ML|27|151.20|280.00|1|1|5|||TBR|CRE|B||||||1
558.557.487|0|ML|27|151.20|280.00|1|1|5|||TBR|CRE|M||||||1
558.557.488|0|ML|27|151.20|280.00|1|1|5|||TBR|CAM|B||||||1
558.557.489|0|ML|27|151.20|280.00|1|1|5|||TBR|CAM|M||||||1
558.557.490|0|ML|27|151.20|280.00|1|1|5|||TBR|OUR|B||||||1
558.557.491|0|ML|27|151.20|280.00|1|1|5|||TBR|OUR|M||||||1
558.557.492|0|ML|27|151.20|280.00|1|1|5|||TBR|COB|B||||||1
558.557.493|0|ML|27|151.20|280.00|1|1|5|||TBR|COB|M||||||1
558.557.494|0|ML|27|151.20|280.00|1|1|5|||TBR|CHO|B||||||1
558.557.495|0|ML|27|151.20|280.00|1|1|5|||TBR|CHO|M||||||1
558.557.496|0|ML|27|151.20|280.00|1|1|5|||TBR|VAG|B||||||1
558.557.497|0|ML|27|151.20|280.00|1|1|5|||TBR|VAG|M||||||1
558.557.498|0|ML|27|151.20|280.00|1|1|5|||TBR|AZE|B||||||1
558.557.499|0|ML|27|151.20|280.00|1|1|5|||TBR|AZE|M||||||1
558.557.500|0|ML|27|151.20|280.00|1|1|5|||TBR|AMA|B||||||1
558.557.501|0|ML|27|151.20|280.00|1|1|5|||TBR|AMA|M||||||1
558.557.502|0|ML|27|151.20|280.00|1|1|5|||TBR|AES|B||||||1
558.557.503|0|ML|27|151.20|280.00|1|1|5|||TBR|AES|M||||||1
558.557.504|0|ML|27|151.20|280.00|1|1|5|||TBR|PRA|B||||||1
558.557.505|0|ML|27|151.20|280.00|1|1|5|||TBR|PRA|M||||||1
558.557.506|0|ML|27|151.20|280.00|1|1|5|||TBR|ROS|B||||||1
558.557.507|0|ML|27|151.20|280.00|1|1|5|||TBR|ROS|M||||||1
558.557.508|0|ML|27|151.20|280.00|1|1|5|||TBR|VER|B||||||1
558.557.509|0|ML|27|151.20|280.00|1|1|5|||TBR|VER|M||||||1
558.557.510|0|ML|27|151.20|280.00|1|1|5|||TBR|AZB|||||||1
558.557.511|0|ML|27|151.20|280.00|1|1|5|||TBR|DEN|||||||1
558.557.512|0|ML|27|151.20|280.00|1|1|5|||TBR|BLK|||||||1
558.557.513|0|ML|27|151.20|280.00|1|1|5|||TBR|ART|||||||1
558.557.514|0|ML|27|151.20|280.00|1|1|5|||TBR|LIN|||||||1
558.557.515|0|ML|27|151.20|280.00|1|1|5|||TBR|HAL|||||||1
558.557.516|0|ML|27|172.80|320.00|1|1|5|||BCO|BCO|B||||||1
558.557.517|0|ML|27|172.80|320.00|1|1|5|||BCO|BCO|M||||||1
558.557.518|0|ML|27|172.80|320.00|1|1|5|||CCL|CCL|B||||||1
558.557.519|0|ML|27|172.80|320.00|1|1|5|||CCL|CCL|M||||||1
558.557.520|0|ML|27|172.80|320.00|1|1|5|||CME|CME|B||||||1
558.557.521|0|ML|27|172.80|320.00|1|1|5|||CME|CME|M||||||1
558.557.522|0|ML|27|172.80|320.00|1|1|5|||ANT|ANT|B||||||1
558.557.523|0|ML|27|172.80|320.00|1|1|5|||ANT|ANT|M||||||1
558.557.524|0|ML|27|172.80|320.00|1|1|5|||PTO|PTO|B||||||1
558.557.525|0|ML|27|172.80|320.00|1|1|5|||PTO|PTO|M||||||1
558.557.526|0|ML|27|172.80|320.00|1|1|5|||CRE|CRE|B||||||1
558.557.527|0|ML|27|172.80|320.00|1|1|5|||CRE|CRE|M||||||1
558.557.528|0|ML|27|172.80|320.00|1|1|5|||CAM|CAM|B||||||1
558.557.529|0|ML|27|172.80|320.00|1|1|5|||CAM|CAM|M||||||1
558.557.530|0|ML|27|172.80|320.00|1|1|5|||OUR|OUR|B||||||1
558.557.531|0|ML|27|172.80|320.00|1|1|5|||OUR|OUR|M||||||1
558.557.532|0|ML|27|172.80|320.00|1|1|5|||COB|COB|B||||||1
558.557.533|0|ML|27|172.80|320.00|1|1|5|||COB|COB|M||||||1
558.557.534|0|ML|27|172.80|320.00|1|1|5|||CHO|CHO|B||||||1
558.557.535|0|ML|27|172.80|320.00|1|1|5|||CHO|CHO|M||||||1
558.557.536|0|ML|27|172.80|320.00|1|1|5|||VAG|VAG|B||||||1
558.557.537|0|ML|27|172.80|320.00|1|1|5|||VAG|VAG|M||||||1
558.557.538|0|ML|27|172.80|320.00|1|1|5|||AZE|AZE|B||||||1
558.557.539|0|ML|27|172.80|320.00|1|1|5|||AZE|AZE|M||||||1
558.557.540|0|ML|27|172.80|320.00|1|1|5|||AMA|AMA|B||||||1
558.557.541|0|ML|27|172.80|320.00|1|1|5|||AMA|AMA|M||||||1
558.557.542|0|ML|27|172.80|320.00|1|1|5|||AES|AES|B||||||1
558.557.543|0|ML|27|172.80|320.00|1|1|5|||AES|AES|M||||||1
558.557.544|0|ML|27|172.80|320.00|1|1|5|||PRA|PRA|B||||||1
558.557.545|0|ML|27|172.80|320.00|1|1|5|||PRA|PRA|M||||||1
558.557.546|0|ML|27|172.80|320.00|1|1|5|||ROS|ROS|B||||||1
558.557.547|0|ML|27|172.80|320.00|1|1|5|||ROS|ROS|M||||||1
558.557.548|0|ML|27|172.80|320.00|1|1|5|||VER|VER|B||||||1
558.557.549|0|ML|27|172.80|320.00|1|1|5|||VER|VER|M||||||1
558.557.550|0|ML|27|172.80|320.00|1|1|5|||AZB|AZB|||||||1
558.557.551|0|ML|27|172.80|320.00|1|1|5|||DEN|DEN|||||||1
558.557.552|0|ML|27|172.80|320.00|1|1|5|||BLK|BLK|||||||1
558.557.553|0|ML|27|172.80|320.00|1|1|5|||ART|ART|||||||1
558.557.554|0|ML|27|172.80|320.00|1|1|5|||LIN|LIN|||||||1
558.557.555|0|ML|27|172.80|320.00|1|1|5|||HAL|HAL|||||||1
559.557.394|0|ML|26|151.20|280.00|1|1|5|||TBR|TBR|||||||2
559.557.198|0|ML|26|151.20|280.00|1|1|5|||TEA|TEA|||||||2
559.557.199|0|ML|26|151.20|280.00|1|1|5|||OAK|OAK|||||||2
559.557.200|0|ML|26|151.20|280.00|1|1|5|||JOP|JOP|||||||2
559.557.395|0|ML|26|194.40|360.00|1|1|5|||TBR|BCO|B||||||2
559.557.396|0|ML|26|194.40|360.00|1|1|5|||TBR|BCO|M||||||2
559.557.397|0|ML|26|194.40|360.00|1|1|5|||TBR|CCL|B||||||2
559.557.398|0|ML|26|194.40|360.00|1|1|5|||TBR|CCL|M||||||2
559.557.399|0|ML|26|194.40|360.00|1|1|5|||TBR|CME|B||||||2
559.557.400|0|ML|26|194.40|360.00|1|1|5|||TBR|CME|M||||||2
559.557.401|0|ML|26|194.40|360.00|1|1|5|||TBR|ANT|B||||||2
559.557.402|0|ML|26|194.40|360.00|1|1|5|||TBR|ANT|M||||||2
559.557.403|0|ML|26|194.40|360.00|1|1|5|||TBR|PTO|B||||||2
559.557.404|0|ML|26|194.40|360.00|1|1|5|||TBR|PTO|M||||||2
559.557.405|0|ML|26|194.40|360.00|1|1|5|||TBR|CRE|B||||||2
559.557.406|0|ML|26|194.40|360.00|1|1|5|||TBR|CRE|M||||||2
559.557.407|0|ML|26|194.40|360.00|1|1|5|||TBR|CAM|B||||||2
559.557.408|0|ML|26|194.40|360.00|1|1|5|||TBR|CAM|M||||||2
559.557.409|0|ML|26|194.40|360.00|1|1|5|||TBR|OUR|B||||||2
559.557.410|0|ML|26|194.40|360.00|1|1|5|||TBR|OUR|M||||||2
559.557.411|0|ML|26|194.40|360.00|1|1|5|||TBR|COB|B||||||2
559.557.412|0|ML|26|194.40|360.00|1|1|5|||TBR|COB|M||||||2
559.557.413|0|ML|26|194.40|360.00|1|1|5|||TBR|CHO|B||||||2
559.557.414|0|ML|26|194.40|360.00|1|1|5|||TBR|CHO|M||||||2
559.557.415|0|ML|26|194.40|360.00|1|1|5|||TBR|VAG|B||||||2
559.557.416|0|ML|26|194.40|360.00|1|1|5|||TBR|VAG|M||||||2
559.557.417|0|ML|26|194.40|360.00|1|1|5|||TBR|AZE|B||||||2
559.557.418|0|ML|26|194.40|360.00|1|1|5|||TBR|AZE|M||||||2
559.557.419|0|ML|26|194.40|360.00|1|1|5|||TBR|AMA|B||||||2
559.557.420|0|ML|26|194.40|360.00|1|1|5|||TBR|AMA|M||||||2
559.557.421|0|ML|26|194.40|360.00|1|1|5|||TBR|AES|B||||||2
559.557.422|0|ML|26|194.40|360.00|1|1|5|||TBR|AES|M||||||2
559.557.423|0|ML|26|194.40|360.00|1|1|5|||TBR|PRA|B||||||2
559.557.424|0|ML|26|194.40|360.00|1|1|5|||TBR|PRA|M||||||2
559.557.425|0|ML|26|194.40|360.00|1|1|5|||TBR|ROS|B||||||2
559.557.426|0|ML|26|194.40|360.00|1|1|5|||TBR|ROS|M||||||2
559.557.427|0|ML|26|194.40|360.00|1|1|5|||TBR|VER|B||||||2
559.557.428|0|ML|26|194.40|360.00|1|1|5|||TBR|VER|M||||||2
559.557.429|0|ML|26|194.40|360.00|1|1|5|||TBR|AZB|||||||2
559.557.430|0|ML|26|194.40|360.00|1|1|5|||TBR|DEN|||||||2
559.557.431|0|ML|26|194.40|360.00|1|1|5|||TBR|BLK|||||||2
559.557.432|0|ML|26|194.40|360.00|1|1|5|||TBR|ART|||||||2
559.557.433|0|ML|26|194.40|360.00|1|1|5|||TBR|LIN|||||||2
559.557.434|0|ML|26|194.40|360.00|1|1|5|||TBR|HAL|||||||2
559.557.435|0|ML|26|216.00|400.00|1|1|5|||BCO|BCO|B||||||2
559.557.436|0|ML|26|216.00|400.00|1|1|5|||BCO|BCO|M||||||2
559.557.437|0|ML|26|216.00|400.00|1|1|5|||CCL|CCL|B||||||2
559.557.438|0|ML|26|216.00|400.00|1|1|5|||CCL|CCL|M||||||2
559.557.439|0|ML|26|216.00|400.00|1|1|5|||CME|CME|B||||||2
559.557.440|0|ML|26|216.00|400.00|1|1|5|||CME|CME|M||||||2
559.557.441|0|ML|26|216.00|400.00|1|1|5|||ANT|ANT|B||||||2
559.557.442|0|ML|26|216.00|400.00|1|1|5|||ANT|ANT|M||||||2
559.557.443|0|ML|26|216.00|400.00|1|1|5|||PTO|PTO|B||||||2
559.557.444|0|ML|26|216.00|400.00|1|1|5|||PTO|PTO|M||||||2
559.557.445|0|ML|26|216.00|400.00|1|1|5|||CRE|CRE|B||||||2
559.557.446|0|ML|26|216.00|400.00|1|1|5|||CRE|CRE|M||||||2
559.557.447|0|ML|26|216.00|400.00|1|1|5|||CAM|CAM|B||||||2
559.557.448|0|ML|26|216.00|400.00|1|1|5|||CAM|CAM|M||||||2
559.557.449|0|ML|26|216.00|400.00|1|1|5|||OUR|OUR|B||||||2
559.557.450|0|ML|26|216.00|400.00|1|1|5|||OUR|OUR|M||||||2
559.557.451|0|ML|26|216.00|400.00|1|1|5|||COB|COB|B||||||2
559.557.452|0|ML|26|216.00|400.00|1|1|5|||COB|COB|M||||||2
559.557.453|0|ML|26|216.00|400.00|1|1|5|||CHO|CHO|B||||||2
559.557.454|0|ML|26|216.00|400.00|1|1|5|||CHO|CHO|M||||||2
559.557.455|0|ML|26|216.00|400.00|1|1|5|||VAG|VAG|B||||||2
559.557.456|0|ML|26|216.00|400.00|1|1|5|||VAG|VAG|M||||||2
559.557.457|0|ML|26|216.00|400.00|1|1|5|||AZE|AZE|B||||||2
559.557.458|0|ML|26|216.00|400.00|1|1|5|||AZE|AZE|M||||||2
559.557.459|0|ML|26|216.00|400.00|1|1|5|||AMA|AMA|B||||||2
559.557.460|0|ML|26|216.00|400.00|1|1|5|||AMA|AMA|M||||||2
559.557.461|0|ML|26|216.00|400.00|1|1|5|||AES|AES|B||||||2
559.557.462|0|ML|26|216.00|400.00|1|1|5|||AES|AES|M||||||2
559.557.463|0|ML|26|216.00|400.00|1|1|5|||PRA|PRA|B||||||2
559.557.464|0|ML|26|216.00|400.00|1|1|5|||PRA|PRA|M||||||2
559.557.465|0|ML|26|216.00|400.00|1|1|5|||ROS|ROS|B||||||2
559.557.466|0|ML|26|216.00|400.00|1|1|5|||ROS|ROS|M||||||2
559.557.467|0|ML|26|216.00|400.00|1|1|5|||VER|VER|B||||||2
559.557.468|0|ML|26|216.00|400.00|1|1|5|||VER|VER|M||||||2
559.557.469|0|ML|26|216.00|400.00|1|1|5|||AZB|AZB|||||||2
559.557.470|0|ML|26|216.00|400.00|1|1|5|||DEN|DEN|||||||2
559.557.471|0|ML|26|216.00|400.00|1|1|5|||BLK|BLK|||||||2
559.557.472|0|ML|26|216.00|400.00|1|1|5|||ART|ART|||||||2
559.557.473|0|ML|26|216.00|400.00|1|1|5|||LIN|LIN|||||||2
559.557.474|0|ML|26|216.00|400.00|1|1|5|||HAL|HAL|||||||2
559.557.475|0|ML|27|151.20|280.00|1|1|5|||TBR|TBR|||||||2
559.557.242|0|ML|27|151.20|280.00|1|1|5|||TEA|TEA|||||||2
559.557.243|0|ML|27|151.20|280.00|1|1|5|||OAK|OAK|||||||2
559.557.244|0|ML|27|151.20|280.00|1|1|5|||JOP|JOP|||||||2
559.557.476|0|ML|27|194.40|360.00|1|1|5|||TBR|BCO|B||||||2
559.557.477|0|ML|27|194.40|360.00|1|1|5|||TBR|BCO|M||||||2
559.557.478|0|ML|27|194.40|360.00|1|1|5|||TBR|CCL|B||||||2
559.557.479|0|ML|27|194.40|360.00|1|1|5|||TBR|CCL|M||||||2
559.557.480|0|ML|27|194.40|360.00|1|1|5|||TBR|CME|B||||||2
559.557.481|0|ML|27|194.40|360.00|1|1|5|||TBR|CME|M||||||2
559.557.482|0|ML|27|194.40|360.00|1|1|5|||TBR|ANT|B||||||2
559.557.483|0|ML|27|194.40|360.00|1|1|5|||TBR|ANT|M||||||2
559.557.484|0|ML|27|194.40|360.00|1|1|5|||TBR|PTO|B||||||2
559.557.485|0|ML|27|194.40|360.00|1|1|5|||TBR|PTO|M||||||2
559.557.486|0|ML|27|194.40|360.00|1|1|5|||TBR|CRE|B||||||2
559.557.487|0|ML|27|194.40|360.00|1|1|5|||TBR|CRE|M||||||2
559.557.488|0|ML|27|194.40|360.00|1|1|5|||TBR|CAM|B||||||2
559.557.489|0|ML|27|194.40|360.00|1|1|5|||TBR|CAM|M||||||2
559.557.490|0|ML|27|194.40|360.00|1|1|5|||TBR|OUR|B||||||2
559.557.491|0|ML|27|194.40|360.00|1|1|5|||TBR|OUR|M||||||2
559.557.492|0|ML|27|194.40|360.00|1|1|5|||TBR|COB|B||||||2
559.557.493|0|ML|27|194.40|360.00|1|1|5|||TBR|COB|M||||||2
559.557.494|0|ML|27|194.40|360.00|1|1|5|||TBR|CHO|B||||||2
559.557.495|0|ML|27|194.40|360.00|1|1|5|||TBR|CHO|M||||||2
559.557.496|0|ML|27|194.40|360.00|1|1|5|||TBR|VAG|B||||||2
559.557.497|0|ML|27|194.40|360.00|1|1|5|||TBR|VAG|M||||||2
559.557.498|0|ML|27|194.40|360.00|1|1|5|||TBR|AZE|B||||||2
559.557.499|0|ML|27|194.40|360.00|1|1|5|||TBR|AZE|M||||||2
559.557.500|0|ML|27|194.40|360.00|1|1|5|||TBR|AMA|B||||||2
559.557.501|0|ML|27|194.40|360.00|1|1|5|||TBR|AMA|M||||||2
559.557.502|0|ML|27|194.40|360.00|1|1|5|||TBR|AES|B||||||2
559.557.503|0|ML|27|194.40|360.00|1|1|5|||TBR|AES|M||||||2
559.557.504|0|ML|27|194.40|360.00|1|1|5|||TBR|PRA|B||||||2
559.557.505|0|ML|27|194.40|360.00|1|1|5|||TBR|PRA|M||||||2
559.557.506|0|ML|27|194.40|360.00|1|1|5|||TBR|ROS|B||||||2
559.557.507|0|ML|27|194.40|360.00|1|1|5|||TBR|ROS|M||||||2
559.557.508|0|ML|27|194.40|360.00|1|1|5|||TBR|VER|B||||||2
559.557.509|0|ML|27|194.40|360.00|1|1|5|||TBR|VER|M||||||2
559.557.510|0|ML|27|194.40|360.00|1|1|5|||TBR|AZB|||||||2
559.557.511|0|ML|27|194.40|360.00|1|1|5|||TBR|DEN|||||||2
559.557.512|0|ML|27|194.40|360.00|1|1|5|||TBR|BLK|||||||2
559.557.513|0|ML|27|194.40|360.00|1|1|5|||TBR|ART|||||||2
559.557.514|0|ML|27|194.40|360.00|1|1|5|||TBR|LIN|||||||2
559.557.515|0|ML|27|194.40|360.00|1|1|5|||TBR|HAL|||||||2
559.557.516|0|ML|27|216.00|400.00|1|1|5|||BCO|BCO|B||||||2
559.557.517|0|ML|27|216.00|400.00|1|1|5|||BCO|BCO|M||||||2
559.557.518|0|ML|27|216.00|400.00|1|1|5|||CCL|CCL|B||||||2
559.557.519|0|ML|27|216.00|400.00|1|1|5|||CCL|CCL|M||||||2
559.557.520|0|ML|27|216.00|400.00|1|1|5|||CME|CME|B||||||2
559.557.521|0|ML|27|216.00|400.00|1|1|5|||CME|CME|M||||||2
559.557.522|0|ML|27|216.00|400.00|1|1|5|||ANT|ANT|B||||||2
559.557.523|0|ML|27|216.00|400.00|1|1|5|||ANT|ANT|M||||||2
559.557.524|0|ML|27|216.00|400.00|1|1|5|||PTO|PTO|B||||||2
559.557.525|0|ML|27|216.00|400.00|1|1|5|||PTO|PTO|M||||||2
559.557.526|0|ML|27|216.00|400.00|1|1|5|||CRE|CRE|B||||||2
559.557.527|0|ML|27|216.00|400.00|1|1|5|||CRE|CRE|M||||||2
559.557.528|0|ML|27|216.00|400.00|1|1|5|||CAM|CAM|B||||||2
559.557.529|0|ML|27|216.00|400.00|1|1|5|||CAM|CAM|M||||||2
559.557.530|0|ML|27|216.00|400.00|1|1|5|||OUR|OUR|B||||||2
559.557.531|0|ML|27|216.00|400.00|1|1|5|||OUR|OUR|M||||||2
559.557.532|0|ML|27|216.00|400.00|1|1|5|||COB|COB|B||||||2
559.557.533|0|ML|27|216.00|400.00|1|1|5|||COB|COB|M||||||2
559.557.534|0|ML|27|216.00|400.00|1|1|5|||CHO|CHO|B||||||2
559.557.535|0|ML|27|216.00|400.00|1|1|5|||CHO|CHO|M||||||2
559.557.536|0|ML|27|216.00|400.00|1|1|5|||VAG|VAG|B||||||2
559.557.537|0|ML|27|216.00|400.00|1|1|5|||VAG|VAG|M||||||2
559.557.538|0|ML|27|216.00|400.00|1|1|5|||AZE|AZE|B||||||2
559.557.539|0|ML|27|216.00|400.00|1|1|5|||AZE|AZE|M||||||2
559.557.540|0|ML|27|216.00|400.00|1|1|5|||AMA|AMA|B||||||2
559.557.541|0|ML|27|216.00|400.00|1|1|5|||AMA|AMA|M||||||2
559.557.542|0|ML|27|216.00|400.00|1|1|5|||AES|AES|B||||||2
559.557.543|0|ML|27|216.00|400.00|1|1|5|||AES|AES|M||||||2
559.557.544|0|ML|27|216.00|400.00|1|1|5|||PRA|PRA|B||||||2
559.557.545|0|ML|27|216.00|400.00|1|1|5|||PRA|PRA|M||||||2
559.557.546|0|ML|27|216.00|400.00|1|1|5|||ROS|ROS|B||||||2
559.557.547|0|ML|27|216.00|400.00|1|1|5|||ROS|ROS|M||||||2
559.557.548|0|ML|27|216.00|400.00|1|1|5|||VER|VER|B||||||2
559.557.549|0|ML|27|216.00|400.00|1|1|5|||VER|VER|M||||||2
559.557.550|0|ML|27|216.00|400.00|1|1|5|||AZB|AZB|||||||2
559.557.551|0|ML|27|216.00|400.00|1|1|5|||DEN|DEN|||||||2
559.557.552|0|ML|27|216.00|400.00|1|1|5|||BLK|BLK|||||||2
559.557.553|0|ML|27|216.00|400.00|1|1|5|||ART|ART|||||||2
559.557.554|0|ML|27|216.00|400.00|1|1|5|||LIN|LIN|||||||2
559.557.555|0|ML|27|216.00|400.00|1|1|5|||HAL|HAL|||||||2
560.561.394|0|ML|28|205.20|380.00|1|1|5|||TBR|TBR|||||||3
560.561.198|0|ML|28|205.20|380.00|1|1|5|||TEA|TEA|||||||3
560.561.199|0|ML|28|205.20|380.00|1|1|5|||OAK|OAK|||||||3
560.561.200|0|ML|28|205.20|380.00|1|1|5|||JOP|JOP|||||||3
560.561.395|0|ML|28|248.40|460.00|1|1|5|||TBR|BCO|B||||||3
560.561.396|0|ML|28|248.40|460.00|1|1|5|||TBR|BCO|M||||||3
560.561.397|0|ML|28|248.40|460.00|1|1|5|||TBR|CCL|B||||||3
560.561.398|0|ML|28|248.40|460.00|1|1|5|||TBR|CCL|M||||||3
560.561.399|0|ML|28|248.40|460.00|1|1|5|||TBR|CME|B||||||3
560.561.400|0|ML|28|248.40|460.00|1|1|5|||TBR|CME|M||||||3
560.561.401|0|ML|28|248.40|460.00|1|1|5|||TBR|ANT|B||||||3
560.561.402|0|ML|28|248.40|460.00|1|1|5|||TBR|ANT|M||||||3
560.561.403|0|ML|28|248.40|460.00|1|1|5|||TBR|PTO|B||||||3
560.561.404|0|ML|28|248.40|460.00|1|1|5|||TBR|PTO|M||||||3
560.561.405|0|ML|28|248.40|460.00|1|1|5|||TBR|CRE|B||||||3
560.561.406|0|ML|28|248.40|460.00|1|1|5|||TBR|CRE|M||||||3
560.561.407|0|ML|28|248.40|460.00|1|1|5|||TBR|CAM|B||||||3
560.561.408|0|ML|28|248.40|460.00|1|1|5|||TBR|CAM|M||||||3
560.561.409|0|ML|28|248.40|460.00|1|1|5|||TBR|OUR|B||||||3
560.561.410|0|ML|28|248.40|460.00|1|1|5|||TBR|OUR|M||||||3
560.561.411|0|ML|28|248.40|460.00|1|1|5|||TBR|COB|B||||||3
560.561.412|0|ML|28|248.40|460.00|1|1|5|||TBR|COB|M||||||3
560.561.413|0|ML|28|248.40|460.00|1|1|5|||TBR|CHO|B||||||3
560.561.414|0|ML|28|248.40|460.00|1|1|5|||TBR|CHO|M||||||3
560.561.415|0|ML|28|248.40|460.00|1|1|5|||TBR|VAG|B||||||3
560.561.416|0|ML|28|248.40|460.00|1|1|5|||TBR|VAG|M||||||3
560.561.417|0|ML|28|248.40|460.00|1|1|5|||TBR|AZE|B||||||3
560.561.418|0|ML|28|248.40|460.00|1|1|5|||TBR|AZE|M||||||3
560.561.419|0|ML|28|248.40|460.00|1|1|5|||TBR|AMA|B||||||3
560.561.420|0|ML|28|248.40|460.00|1|1|5|||TBR|AMA|M||||||3
560.561.421|0|ML|28|248.40|460.00|1|1|5|||TBR|AES|B||||||3
560.561.422|0|ML|28|248.40|460.00|1|1|5|||TBR|AES|M||||||3
560.561.423|0|ML|28|248.40|460.00|1|1|5|||TBR|PRA|B||||||3
560.561.424|0|ML|28|248.40|460.00|1|1|5|||TBR|PRA|M||||||3
560.561.425|0|ML|28|248.40|460.00|1|1|5|||TBR|ROS|B||||||3
560.561.426|0|ML|28|248.40|460.00|1|1|5|||TBR|ROS|M||||||3
560.561.427|0|ML|28|248.40|460.00|1|1|5|||TBR|VER|B||||||3
560.561.428|0|ML|28|248.40|460.00|1|1|5|||TBR|VER|M||||||3
560.561.429|0|ML|28|248.40|460.00|1|1|5|||TBR|AZB|||||||3
560.561.430|0|ML|28|248.40|460.00|1|1|5|||TBR|DEN|||||||3
560.561.431|0|ML|28|248.40|460.00|1|1|5|||TBR|BLK|||||||3
560.561.432|0|ML|28|248.40|460.00|1|1|5|||TBR|ART|||||||3
560.561.433|0|ML|28|248.40|460.00|1|1|5|||TBR|LIN|||||||3
560.561.434|0|ML|28|248.40|460.00|1|1|5|||TBR|HAL|||||||3
560.561.435|0|ML|28|270.00|500.00|1|1|5|||BCO|BCO|B||||||3
560.561.436|0|ML|28|270.00|500.00|1|1|5|||BCO|BCO|M||||||3
560.561.437|0|ML|28|270.00|500.00|1|1|5|||CCL|CCL|B||||||3
560.561.438|0|ML|28|270.00|500.00|1|1|5|||CCL|CCL|M||||||3
560.561.439|0|ML|28|270.00|500.00|1|1|5|||CME|CME|B||||||3
560.561.440|0|ML|28|270.00|500.00|1|1|5|||CME|CME|M||||||3
560.561.441|0|ML|28|270.00|500.00|1|1|5|||ANT|ANT|B||||||3
560.561.442|0|ML|28|270.00|500.00|1|1|5|||ANT|ANT|M||||||3
560.561.443|0|ML|28|270.00|500.00|1|1|5|||PTO|PTO|B||||||3
560.561.444|0|ML|28|270.00|500.00|1|1|5|||PTO|PTO|M||||||3
560.561.445|0|ML|28|270.00|500.00|1|1|5|||CRE|CRE|B||||||3
560.561.446|0|ML|28|270.00|500.00|1|1|5|||CRE|CRE|M||||||3
560.561.447|0|ML|28|270.00|500.00|1|1|5|||CAM|CAM|B||||||3
560.561.448|0|ML|28|270.00|500.00|1|1|5|||CAM|CAM|M||||||3
560.561.449|0|ML|28|270.00|500.00|1|1|5|||OUR|OUR|B||||||3
560.561.450|0|ML|28|270.00|500.00|1|1|5|||OUR|OUR|M||||||3
560.561.451|0|ML|28|270.00|500.00|1|1|5|||COB|COB|B||||||3
560.561.452|0|ML|28|270.00|500.00|1|1|5|||COB|COB|M||||||3
560.561.453|0|ML|28|270.00|500.00|1|1|5|||CHO|CHO|B||||||3
560.561.454|0|ML|28|270.00|500.00|1|1|5|||CHO|CHO|M||||||3
560.561.455|0|ML|28|270.00|500.00|1|1|5|||VAG|VAG|B||||||3
560.561.456|0|ML|28|270.00|500.00|1|1|5|||VAG|VAG|M||||||3
560.561.457|0|ML|28|270.00|500.00|1|1|5|||AZE|AZE|B||||||3
560.561.458|0|ML|28|270.00|500.00|1|1|5|||AZE|AZE|M||||||3
560.561.459|0|ML|28|270.00|500.00|1|1|5|||AMA|AMA|B||||||3
560.561.460|0|ML|28|270.00|500.00|1|1|5|||AMA|AMA|M||||||3
560.561.461|0|ML|28|270.00|500.00|1|1|5|||AES|AES|B||||||3
560.561.462|0|ML|28|270.00|500.00|1|1|5|||AES|AES|M||||||3
560.561.463|0|ML|28|270.00|500.00|1|1|5|||PRA|PRA|B||||||3
560.561.464|0|ML|28|270.00|500.00|1|1|5|||PRA|PRA|M||||||3
560.561.465|0|ML|28|270.00|500.00|1|1|5|||ROS|ROS|B||||||3
560.561.466|0|ML|28|270.00|500.00|1|1|5|||ROS|ROS|M||||||3
560.561.467|0|ML|28|270.00|500.00|1|1|5|||VER|VER|B||||||3
560.561.468|0|ML|28|270.00|500.00|1|1|5|||VER|VER|M||||||3
560.561.469|0|ML|28|270.00|500.00|1|1|5|||AZB|AZB|||||||3
560.561.470|0|ML|28|270.00|500.00|1|1|5|||DEN|DEN|||||||3
560.561.471|0|ML|28|270.00|500.00|1|1|5|||BLK|BLK|||||||3
560.561.472|0|ML|28|270.00|500.00|1|1|5|||ART|ART|||||||3
560.561.473|0|ML|28|270.00|500.00|1|1|5|||LIN|LIN|||||||3
560.561.474|0|ML|28|270.00|500.00|1|1|5|||HAL|HAL|||||||3
560.561.475|0|ML|29|205.20|380.00|1|1|5|||TBR|TBR|||||||3
560.561.242|0|ML|29|205.20|380.00|1|1|5|||TEA|TEA|||||||3
560.561.243|0|ML|29|205.20|380.00|1|1|5|||OAK|OAK|||||||3
560.561.244|0|ML|29|205.20|380.00|1|1|5|||JOP|JOP|||||||3
560.561.476|0|ML|29|248.40|460.00|1|1|5|||TBR|BCO|B||||||3
560.561.477|0|ML|29|248.40|460.00|1|1|5|||TBR|BCO|M||||||3
560.561.478|0|ML|29|248.40|460.00|1|1|5|||TBR|CCL|B||||||3
560.561.479|0|ML|29|248.40|460.00|1|1|5|||TBR|CCL|M||||||3
560.561.480|0|ML|29|248.40|460.00|1|1|5|||TBR|CME|B||||||3
560.561.481|0|ML|29|248.40|460.00|1|1|5|||TBR|CME|M||||||3
560.561.482|0|ML|29|248.40|460.00|1|1|5|||TBR|ANT|B||||||3
560.561.483|0|ML|29|248.40|460.00|1|1|5|||TBR|ANT|M||||||3
560.561.484|0|ML|29|248.40|460.00|1|1|5|||TBR|PTO|B||||||3
560.561.485|0|ML|29|248.40|460.00|1|1|5|||TBR|PTO|M||||||3
560.561.486|0|ML|29|248.40|460.00|1|1|5|||TBR|CRE|B||||||3
560.561.487|0|ML|29|248.40|460.00|1|1|5|||TBR|CRE|M||||||3
560.561.488|0|ML|29|248.40|460.00|1|1|5|||TBR|CAM|B||||||3
560.561.489|0|ML|29|248.40|460.00|1|1|5|||TBR|CAM|M||||||3
560.561.490|0|ML|29|248.40|460.00|1|1|5|||TBR|OUR|B||||||3
560.561.491|0|ML|29|248.40|460.00|1|1|5|||TBR|OUR|M||||||3
560.561.492|0|ML|29|248.40|460.00|1|1|5|||TBR|COB|B||||||3
560.561.493|0|ML|29|248.40|460.00|1|1|5|||TBR|COB|M||||||3
560.561.494|0|ML|29|248.40|460.00|1|1|5|||TBR|CHO|B||||||3
560.561.495|0|ML|29|248.40|460.00|1|1|5|||TBR|CHO|M||||||3
560.561.496|0|ML|29|248.40|460.00|1|1|5|||TBR|VAG|B||||||3
560.561.497|0|ML|29|248.40|460.00|1|1|5|||TBR|VAG|M||||||3
560.561.498|0|ML|29|248.40|460.00|1|1|5|||TBR|AZE|B||||||3
560.561.499|0|ML|29|248.40|460.00|1|1|5|||TBR|AZE|M||||||3
560.561.500|0|ML|29|248.40|460.00|1|1|5|||TBR|AMA|B||||||3
560.561.501|0|ML|29|248.40|460.00|1|1|5|||TBR|AMA|M||||||3
560.561.502|0|ML|29|248.40|460.00|1|1|5|||TBR|AES|B||||||3
560.561.503|0|ML|29|248.40|460.00|1|1|5|||TBR|AES|M||||||3
560.561.504|0|ML|29|248.40|460.00|1|1|5|||TBR|PRA|B||||||3
560.561.505|0|ML|29|248.40|460.00|1|1|5|||TBR|PRA|M||||||3
560.561.506|0|ML|29|248.40|460.00|1|1|5|||TBR|ROS|B||||||3
560.561.507|0|ML|29|248.40|460.00|1|1|5|||TBR|ROS|M||||||3
560.561.508|0|ML|29|248.40|460.00|1|1|5|||TBR|VER|B||||||3
560.561.509|0|ML|29|248.40|460.00|1|1|5|||TBR|VER|M||||||3
560.561.510|0|ML|29|248.40|460.00|1|1|5|||TBR|AZB|||||||3
560.561.511|0|ML|29|248.40|460.00|1|1|5|||TBR|DEN|||||||3
560.561.512|0|ML|29|248.40|460.00|1|1|5|||TBR|BLK|||||||3
560.561.513|0|ML|29|248.40|460.00|1|1|5|||TBR|ART|||||||3
560.561.514|0|ML|29|248.40|460.00|1|1|5|||TBR|LIN|||||||3
560.561.515|0|ML|29|248.40|460.00|1|1|5|||TBR|HAL|||||||3
560.561.516|0|ML|29|270.00|500.00|1|1|5|||BCO|BCO|B||||||3
560.561.517|0|ML|29|270.00|500.00|1|1|5|||BCO|BCO|M||||||3
560.561.518|0|ML|29|270.00|500.00|1|1|5|||CCL|CCL|B||||||3
560.561.519|0|ML|29|270.00|500.00|1|1|5|||CCL|CCL|M||||||3
560.561.520|0|ML|29|270.00|500.00|1|1|5|||CME|CME|B||||||3
560.561.521|0|ML|29|270.00|500.00|1|1|5|||CME|CME|M||||||3
560.561.522|0|ML|29|270.00|500.00|1|1|5|||ANT|ANT|B||||||3
560.561.523|0|ML|29|270.00|500.00|1|1|5|||ANT|ANT|M||||||3
560.561.524|0|ML|29|270.00|500.00|1|1|5|||PTO|PTO|B||||||3
560.561.525|0|ML|29|270.00|500.00|1|1|5|||PTO|PTO|M||||||3
560.561.526|0|ML|29|270.00|500.00|1|1|5|||CRE|CRE|B||||||3
560.561.527|0|ML|29|270.00|500.00|1|1|5|||CRE|CRE|M||||||3
560.561.528|0|ML|29|270.00|500.00|1|1|5|||CAM|CAM|B||||||3
560.561.529|0|ML|29|270.00|500.00|1|1|5|||CAM|CAM|M||||||3
560.561.530|0|ML|29|270.00|500.00|1|1|5|||OUR|OUR|B||||||3
560.561.531|0|ML|29|270.00|500.00|1|1|5|||OUR|OUR|M||||||3
560.561.532|0|ML|29|270.00|500.00|1|1|5|||COB|COB|B||||||3
560.561.533|0|ML|29|270.00|500.00|1|1|5|||COB|COB|M||||||3
560.561.534|0|ML|29|270.00|500.00|1|1|5|||CHO|CHO|B||||||3
560.561.535|0|ML|29|270.00|500.00|1|1|5|||CHO|CHO|M||||||3
560.561.536|0|ML|29|270.00|500.00|1|1|5|||VAG|VAG|B||||||3
560.561.537|0|ML|29|270.00|500.00|1|1|5|||VAG|VAG|M||||||3
560.561.538|0|ML|29|270.00|500.00|1|1|5|||AZE|AZE|B||||||3
560.561.539|0|ML|29|270.00|500.00|1|1|5|||AZE|AZE|M||||||3
560.561.540|0|ML|29|270.00|500.00|1|1|5|||AMA|AMA|B||||||3
560.561.541|0|ML|29|270.00|500.00|1|1|5|||AMA|AMA|M||||||3
560.561.542|0|ML|29|270.00|500.00|1|1|5|||AES|AES|B||||||3
560.561.543|0|ML|29|270.00|500.00|1|1|5|||AES|AES|M||||||3
560.561.544|0|ML|29|270.00|500.00|1|1|5|||PRA|PRA|B||||||3
560.561.545|0|ML|29|270.00|500.00|1|1|5|||PRA|PRA|M||||||3
560.561.546|0|ML|29|270.00|500.00|1|1|5|||ROS|ROS|B||||||3
560.561.547|0|ML|29|270.00|500.00|1|1|5|||ROS|ROS|M||||||3
560.561.548|0|ML|29|270.00|500.00|1|1|5|||VER|VER|B||||||3
560.561.549|0|ML|29|270.00|500.00|1|1|5|||VER|VER|M||||||3
560.561.550|0|ML|29|270.00|500.00|1|1|5|||AZB|AZB|||||||3
560.561.551|0|ML|29|270.00|500.00|1|1|5|||DEN|DEN|||||||3
560.561.552|0|ML|29|270.00|500.00|1|1|5|||BLK|BLK|||||||3
560.561.553|0|ML|29|270.00|500.00|1|1|5|||ART|ART|||||||3
560.561.554|0|ML|29|270.00|500.00|1|1|5|||LIN|LIN|||||||3
560.561.555|0|ML|29|270.00|500.00|1|1|5|||HAL|HAL|||||||3
560.562.394|0|ML|30|221.40|410.00|1|1|5|||TBR|TBR|||||||3
560.562.198|0|ML|30|221.40|410.00|1|1|5|||TEA|TEA|||||||3
560.562.199|0|ML|30|221.40|410.00|1|1|5|||OAK|OAK|||||||3
560.562.200|0|ML|30|221.40|410.00|1|1|5|||JOP|JOP|||||||3
560.562.395|0|ML|30|264.60|490.00|1|1|5|||TBR|BCO|B||||||3
560.562.396|0|ML|30|264.60|490.00|1|1|5|||TBR|BCO|M||||||3
560.562.397|0|ML|30|264.60|490.00|1|1|5|||TBR|CCL|B||||||3
560.562.398|0|ML|30|264.60|490.00|1|1|5|||TBR|CCL|M||||||3
560.562.399|0|ML|30|264.60|490.00|1|1|5|||TBR|CME|B||||||3
560.562.400|0|ML|30|264.60|490.00|1|1|5|||TBR|CME|M||||||3
560.562.401|0|ML|30|264.60|490.00|1|1|5|||TBR|ANT|B||||||3
560.562.402|0|ML|30|264.60|490.00|1|1|5|||TBR|ANT|M||||||3
560.562.403|0|ML|30|264.60|490.00|1|1|5|||TBR|PTO|B||||||3
560.562.404|0|ML|30|264.60|490.00|1|1|5|||TBR|PTO|M||||||3
560.562.405|0|ML|30|264.60|490.00|1|1|5|||TBR|CRE|B||||||3
560.562.406|0|ML|30|264.60|490.00|1|1|5|||TBR|CRE|M||||||3
560.562.407|0|ML|30|264.60|490.00|1|1|5|||TBR|CAM|B||||||3
560.562.408|0|ML|30|264.60|490.00|1|1|5|||TBR|CAM|M||||||3
560.562.409|0|ML|30|264.60|490.00|1|1|5|||TBR|OUR|B||||||3
560.562.410|0|ML|30|264.60|490.00|1|1|5|||TBR|OUR|M||||||3
560.562.411|0|ML|30|264.60|490.00|1|1|5|||TBR|COB|B||||||3
560.562.412|0|ML|30|264.60|490.00|1|1|5|||TBR|COB|M||||||3
560.562.413|0|ML|30|264.60|490.00|1|1|5|||TBR|CHO|B||||||3
560.562.414|0|ML|30|264.60|490.00|1|1|5|||TBR|CHO|M||||||3
560.562.415|0|ML|30|264.60|490.00|1|1|5|||TBR|VAG|B||||||3
560.562.416|0|ML|30|264.60|490.00|1|1|5|||TBR|VAG|M||||||3
560.562.417|0|ML|30|264.60|490.00|1|1|5|||TBR|AZE|B||||||3
560.562.418|0|ML|30|264.60|490.00|1|1|5|||TBR|AZE|M||||||3
560.562.419|0|ML|30|264.60|490.00|1|1|5|||TBR|AMA|B||||||3
560.562.420|0|ML|30|264.60|490.00|1|1|5|||TBR|AMA|M||||||3
560.562.421|0|ML|30|264.60|490.00|1|1|5|||TBR|AES|B||||||3
560.562.422|0|ML|30|264.60|490.00|1|1|5|||TBR|AES|M||||||3
560.562.423|0|ML|30|264.60|490.00|1|1|5|||TBR|PRA|B||||||3
560.562.424|0|ML|30|264.60|490.00|1|1|5|||TBR|PRA|M||||||3
560.562.425|0|ML|30|264.60|490.00|1|1|5|||TBR|ROS|B||||||3
560.562.426|0|ML|30|264.60|490.00|1|1|5|||TBR|ROS|M||||||3
560.562.427|0|ML|30|264.60|490.00|1|1|5|||TBR|VER|B||||||3
560.562.428|0|ML|30|264.60|490.00|1|1|5|||TBR|VER|M||||||3
560.562.429|0|ML|30|264.60|490.00|1|1|5|||TBR|AZB|||||||3
560.562.430|0|ML|30|264.60|490.00|1|1|5|||TBR|DEN|||||||3
560.562.431|0|ML|30|264.60|490.00|1|1|5|||TBR|BLK|||||||3
560.562.432|0|ML|30|264.60|490.00|1|1|5|||TBR|ART|||||||3
560.562.433|0|ML|30|264.60|490.00|1|1|5|||TBR|LIN|||||||3
560.562.434|0|ML|30|264.60|490.00|1|1|5|||TBR|HAL|||||||3
560.562.435|0|ML|30|286.20|530.00|1|1|5|||BCO|BCO|B||||||3
560.562.436|0|ML|30|286.20|530.00|1|1|5|||BCO|BCO|M||||||3
560.562.437|0|ML|30|286.20|530.00|1|1|5|||CCL|CCL|B||||||3
560.562.438|0|ML|30|286.20|530.00|1|1|5|||CCL|CCL|M||||||3
560.562.439|0|ML|30|286.20|530.00|1|1|5|||CME|CME|B||||||3
560.562.440|0|ML|30|286.20|530.00|1|1|5|||CME|CME|M||||||3
560.562.441|0|ML|30|286.20|530.00|1|1|5|||ANT|ANT|B||||||3
560.562.442|0|ML|30|286.20|530.00|1|1|5|||ANT|ANT|M||||||3
560.562.443|0|ML|30|286.20|530.00|1|1|5|||PTO|PTO|B||||||3
560.562.444|0|ML|30|286.20|530.00|1|1|5|||PTO|PTO|M||||||3
560.562.445|0|ML|30|286.20|530.00|1|1|5|||CRE|CRE|B||||||3
560.562.446|0|ML|30|286.20|530.00|1|1|5|||CRE|CRE|M||||||3
560.562.447|0|ML|30|286.20|530.00|1|1|5|||CAM|CAM|B||||||3
560.562.448|0|ML|30|286.20|530.00|1|1|5|||CAM|CAM|M||||||3
560.562.449|0|ML|30|286.20|530.00|1|1|5|||OUR|OUR|B||||||3
560.562.450|0|ML|30|286.20|530.00|1|1|5|||OUR|OUR|M||||||3
560.562.451|0|ML|30|286.20|530.00|1|1|5|||COB|COB|B||||||3
560.562.452|0|ML|30|286.20|530.00|1|1|5|||COB|COB|M||||||3
560.562.453|0|ML|30|286.20|530.00|1|1|5|||CHO|CHO|B||||||3
560.562.454|0|ML|30|286.20|530.00|1|1|5|||CHO|CHO|M||||||3
560.562.455|0|ML|30|286.20|530.00|1|1|5|||VAG|VAG|B||||||3
560.562.456|0|ML|30|286.20|530.00|1|1|5|||VAG|VAG|M||||||3
560.562.457|0|ML|30|286.20|530.00|1|1|5|||AZE|AZE|B||||||3
560.562.458|0|ML|30|286.20|530.00|1|1|5|||AZE|AZE|M||||||3
560.562.459|0|ML|30|286.20|530.00|1|1|5|||AMA|AMA|B||||||3
560.562.460|0|ML|30|286.20|530.00|1|1|5|||AMA|AMA|M||||||3
560.562.461|0|ML|30|286.20|530.00|1|1|5|||AES|AES|B||||||3
560.562.462|0|ML|30|286.20|530.00|1|1|5|||AES|AES|M||||||3
560.562.463|0|ML|30|286.20|530.00|1|1|5|||PRA|PRA|B||||||3
560.562.464|0|ML|30|286.20|530.00|1|1|5|||PRA|PRA|M||||||3
560.562.465|0|ML|30|286.20|530.00|1|1|5|||ROS|ROS|B||||||3
560.562.466|0|ML|30|286.20|530.00|1|1|5|||ROS|ROS|M||||||3
560.562.467|0|ML|30|286.20|530.00|1|1|5|||VER|VER|B||||||3
560.562.468|0|ML|30|286.20|530.00|1|1|5|||VER|VER|M||||||3
560.562.469|0|ML|30|286.20|530.00|1|1|5|||AZB|AZB|||||||3
560.562.470|0|ML|30|286.20|530.00|1|1|5|||DEN|DEN|||||||3
560.562.471|0|ML|30|286.20|530.00|1|1|5|||BLK|BLK|||||||3
560.562.472|0|ML|30|286.20|530.00|1|1|5|||ART|ART|||||||3
560.562.473|0|ML|30|286.20|530.00|1|1|5|||LIN|LIN|||||||3
560.562.474|0|ML|30|286.20|530.00|1|1|5|||HAL|HAL|||||||3
560.562.475|0|ML|31|205.20|380.00|1|1|5|||TBR|TBR|||||||3
560.562.242|0|ML|31|205.20|380.00|1|1|5|||TEA|TEA|||||||3
560.562.243|0|ML|31|205.20|380.00|1|1|5|||OAK|OAK|||||||3
560.562.244|0|ML|31|205.20|380.00|1|1|5|||JOP|JOP|||||||3
560.562.476|0|ML|31|248.40|460.00|1|1|5|||TBR|BCO|B||||||3
560.562.477|0|ML|31|248.40|460.00|1|1|5|||TBR|BCO|M||||||3
560.562.478|0|ML|31|248.40|460.00|1|1|5|||TBR|CCL|B||||||3
560.562.479|0|ML|31|248.40|460.00|1|1|5|||TBR|CCL|M||||||3
560.562.480|0|ML|31|248.40|460.00|1|1|5|||TBR|CME|B||||||3
560.562.481|0|ML|31|248.40|460.00|1|1|5|||TBR|CME|M||||||3
560.562.482|0|ML|31|248.40|460.00|1|1|5|||TBR|ANT|B||||||3
560.562.483|0|ML|31|248.40|460.00|1|1|5|||TBR|ANT|M||||||3
560.562.484|0|ML|31|248.40|460.00|1|1|5|||TBR|PTO|B||||||3
560.562.485|0|ML|31|248.40|460.00|1|1|5|||TBR|PTO|M||||||3
560.562.486|0|ML|31|248.40|460.00|1|1|5|||TBR|CRE|B||||||3
560.562.487|0|ML|31|248.40|460.00|1|1|5|||TBR|CRE|M||||||3
560.562.488|0|ML|31|248.40|460.00|1|1|5|||TBR|CAM|B||||||3
560.562.489|0|ML|31|248.40|460.00|1|1|5|||TBR|CAM|M||||||3
560.562.490|0|ML|31|248.40|460.00|1|1|5|||TBR|OUR|B||||||3
560.562.491|0|ML|31|248.40|460.00|1|1|5|||TBR|OUR|M||||||3
560.562.492|0|ML|31|248.40|460.00|1|1|5|||TBR|COB|B||||||3
560.562.493|0|ML|31|248.40|460.00|1|1|5|||TBR|COB|M||||||3
560.562.494|0|ML|31|248.40|460.00|1|1|5|||TBR|CHO|B||||||3
560.562.495|0|ML|31|248.40|460.00|1|1|5|||TBR|CHO|M||||||3
560.562.496|0|ML|31|248.40|460.00|1|1|5|||TBR|VAG|B||||||3
560.562.497|0|ML|31|248.40|460.00|1|1|5|||TBR|VAG|M||||||3
560.562.498|0|ML|31|248.40|460.00|1|1|5|||TBR|AZE|B||||||3
560.562.499|0|ML|31|248.40|460.00|1|1|5|||TBR|AZE|M||||||3
560.562.500|0|ML|31|248.40|460.00|1|1|5|||TBR|AMA|B||||||3
560.562.501|0|ML|31|248.40|460.00|1|1|5|||TBR|AMA|M||||||3
560.562.502|0|ML|31|248.40|460.00|1|1|5|||TBR|AES|B||||||3
560.562.503|0|ML|31|248.40|460.00|1|1|5|||TBR|AES|M||||||3
560.562.504|0|ML|31|248.40|460.00|1|1|5|||TBR|PRA|B||||||3
560.562.505|0|ML|31|248.40|460.00|1|1|5|||TBR|PRA|M||||||3
560.562.506|0|ML|31|248.40|460.00|1|1|5|||TBR|ROS|B||||||3
560.562.507|0|ML|31|248.40|460.00|1|1|5|||TBR|ROS|M||||||3
560.562.508|0|ML|31|248.40|460.00|1|1|5|||TBR|VER|B||||||3
560.562.509|0|ML|31|248.40|460.00|1|1|5|||TBR|VER|M||||||3
560.562.510|0|ML|31|248.40|460.00|1|1|5|||TBR|AZB|||||||3
560.562.511|0|ML|31|248.40|460.00|1|1|5|||TBR|DEN|||||||3
560.562.512|0|ML|31|248.40|460.00|1|1|5|||TBR|BLK|||||||3
560.562.513|0|ML|31|248.40|460.00|1|1|5|||TBR|ART|||||||3
560.562.514|0|ML|31|248.40|460.00|1|1|5|||TBR|LIN|||||||3
560.562.515|0|ML|31|248.40|460.00|1|1|5|||TBR|HAL|||||||3
560.562.516|0|ML|31|270.00|500.00|1|1|5|||BCO|BCO|B||||||3
560.562.517|0|ML|31|270.00|500.00|1|1|5|||BCO|BCO|M||||||3
560.562.518|0|ML|31|270.00|500.00|1|1|5|||CCL|CCL|B||||||3
560.562.519|0|ML|31|270.00|500.00|1|1|5|||CCL|CCL|M||||||3
560.562.520|0|ML|31|270.00|500.00|1|1|5|||CME|CME|B||||||3
560.562.521|0|ML|31|270.00|500.00|1|1|5|||CME|CME|M||||||3
560.562.522|0|ML|31|270.00|500.00|1|1|5|||ANT|ANT|B||||||3
560.562.523|0|ML|31|270.00|500.00|1|1|5|||ANT|ANT|M||||||3
560.562.524|0|ML|31|270.00|500.00|1|1|5|||PTO|PTO|B||||||3
560.562.525|0|ML|31|270.00|500.00|1|1|5|||PTO|PTO|M||||||3
560.562.526|0|ML|31|270.00|500.00|1|1|5|||CRE|CRE|B||||||3
560.562.527|0|ML|31|270.00|500.00|1|1|5|||CRE|CRE|M||||||3
560.562.528|0|ML|31|270.00|500.00|1|1|5|||CAM|CAM|B||||||3
560.562.529|0|ML|31|270.00|500.00|1|1|5|||CAM|CAM|M||||||3
560.562.530|0|ML|31|270.00|500.00|1|1|5|||OUR|OUR|B||||||3
560.562.531|0|ML|31|270.00|500.00|1|1|5|||OUR|OUR|M||||||3
560.562.532|0|ML|31|270.00|500.00|1|1|5|||COB|COB|B||||||3
560.562.533|0|ML|31|270.00|500.00|1|1|5|||COB|COB|M||||||3
560.562.534|0|ML|31|270.00|500.00|1|1|5|||CHO|CHO|B||||||3
560.562.535|0|ML|31|270.00|500.00|1|1|5|||CHO|CHO|M||||||3
560.562.536|0|ML|31|270.00|500.00|1|1|5|||VAG|VAG|B||||||3
560.562.537|0|ML|31|270.00|500.00|1|1|5|||VAG|VAG|M||||||3
560.562.538|0|ML|31|270.00|500.00|1|1|5|||AZE|AZE|B||||||3
560.562.539|0|ML|31|270.00|500.00|1|1|5|||AZE|AZE|M||||||3
560.562.540|0|ML|31|270.00|500.00|1|1|5|||AMA|AMA|B||||||3
560.562.541|0|ML|31|270.00|500.00|1|1|5|||AMA|AMA|M||||||3
560.562.542|0|ML|31|270.00|500.00|1|1|5|||AES|AES|B||||||3
560.562.543|0|ML|31|270.00|500.00|1|1|5|||AES|AES|M||||||3
560.562.544|0|ML|31|270.00|500.00|1|1|5|||PRA|PRA|B||||||3
560.562.545|0|ML|31|270.00|500.00|1|1|5|||PRA|PRA|M||||||3
560.562.546|0|ML|31|270.00|500.00|1|1|5|||ROS|ROS|B||||||3
560.562.547|0|ML|31|270.00|500.00|1|1|5|||ROS|ROS|M||||||3
560.562.548|0|ML|31|270.00|500.00|1|1|5|||VER|VER|B||||||3
560.562.549|0|ML|31|270.00|500.00|1|1|5|||VER|VER|M||||||3
560.562.550|0|ML|31|270.00|500.00|1|1|5|||AZB|AZB|||||||3
560.562.551|0|ML|31|270.00|500.00|1|1|5|||DEN|DEN|||||||3
560.562.552|0|ML|31|270.00|500.00|1|1|5|||BLK|BLK|||||||3
560.562.553|0|ML|31|270.00|500.00|1|1|5|||ART|ART|||||||3
560.562.554|0|ML|31|270.00|500.00|1|1|5|||LIN|LIN|||||||3
560.562.555|0|ML|31|270.00|500.00|1|1|5|||HAL|HAL|||||||3
563.564.394|0|ML|32|107.46|199.00|1|1|5|||TBR|TBR|||||||11
563.564.198|0|ML|32|107.46|199.00|1|1|5|||TEA|TEA|||||||11
563.564.199|0|ML|32|107.46|199.00|1|1|5|||OAK|OAK|||||||11
563.564.200|0|ML|32|107.46|199.00|1|1|5|||JOP|JOP|||||||11
563.564.395|0|ML|32|150.66|279.00|1|1|5|||TBR|BCO|B||||||11
563.564.396|0|ML|32|150.66|279.00|1|1|5|||TBR|BCO|M||||||11
563.564.397|0|ML|32|150.66|279.00|1|1|5|||TBR|CCL|B||||||11
563.564.398|0|ML|32|150.66|279.00|1|1|5|||TBR|CCL|M||||||11
563.564.399|0|ML|32|150.66|279.00|1|1|5|||TBR|CME|B||||||11
563.564.400|0|ML|32|150.66|279.00|1|1|5|||TBR|CME|M||||||11
563.564.401|0|ML|32|150.66|279.00|1|1|5|||TBR|ANT|B||||||11
563.564.402|0|ML|32|150.66|279.00|1|1|5|||TBR|ANT|M||||||11
563.564.403|0|ML|32|150.66|279.00|1|1|5|||TBR|PTO|B||||||11
563.564.404|0|ML|32|150.66|279.00|1|1|5|||TBR|PTO|M||||||11
563.564.405|0|ML|32|150.66|279.00|1|1|5|||TBR|CRE|B||||||11
563.564.406|0|ML|32|150.66|279.00|1|1|5|||TBR|CRE|M||||||11
563.564.407|0|ML|32|150.66|279.00|1|1|5|||TBR|CAM|B||||||11
563.564.408|0|ML|32|150.66|279.00|1|1|5|||TBR|CAM|M||||||11
563.564.409|0|ML|32|150.66|279.00|1|1|5|||TBR|OUR|B||||||11
563.564.410|0|ML|32|150.66|279.00|1|1|5|||TBR|OUR|M||||||11
563.564.411|0|ML|32|150.66|279.00|1|1|5|||TBR|COB|B||||||11
563.564.412|0|ML|32|150.66|279.00|1|1|5|||TBR|COB|M||||||11
563.564.413|0|ML|32|150.66|279.00|1|1|5|||TBR|CHO|B||||||11
563.564.414|0|ML|32|150.66|279.00|1|1|5|||TBR|CHO|M||||||11
563.564.415|0|ML|32|150.66|279.00|1|1|5|||TBR|VAG|B||||||11
563.564.416|0|ML|32|150.66|279.00|1|1|5|||TBR|VAG|M||||||11
563.564.417|0|ML|32|150.66|279.00|1|1|5|||TBR|AZE|B||||||11
563.564.418|0|ML|32|150.66|279.00|1|1|5|||TBR|AZE|M||||||11
563.564.419|0|ML|32|150.66|279.00|1|1|5|||TBR|AMA|B||||||11
563.564.420|0|ML|32|150.66|279.00|1|1|5|||TBR|AMA|M||||||11
563.564.421|0|ML|32|150.66|279.00|1|1|5|||TBR|AES|B||||||11
563.564.422|0|ML|32|150.66|279.00|1|1|5|||TBR|AES|M||||||11
563.564.423|0|ML|32|150.66|279.00|1|1|5|||TBR|PRA|B||||||11
563.564.424|0|ML|32|150.66|279.00|1|1|5|||TBR|PRA|M||||||11
563.564.425|0|ML|32|150.66|279.00|1|1|5|||TBR|ROS|B||||||11
563.564.426|0|ML|32|150.66|279.00|1|1|5|||TBR|ROS|M||||||11
563.564.427|0|ML|32|150.66|279.00|1|1|5|||TBR|VER|B||||||11
563.564.428|0|ML|32|150.66|279.00|1|1|5|||TBR|VER|M||||||11
563.564.429|0|ML|32|150.66|279.00|1|1|5|||TBR|AZB|||||||11
563.564.430|0|ML|32|150.66|279.00|1|1|5|||TBR|DEN|||||||11
563.564.431|0|ML|32|150.66|279.00|1|1|5|||TBR|BLK|||||||11
563.564.432|0|ML|32|150.66|279.00|1|1|5|||TBR|ART|||||||11
563.564.433|0|ML|32|150.66|279.00|1|1|5|||TBR|LIN|||||||11
563.564.434|0|ML|32|150.66|279.00|1|1|5|||TBR|HAL|||||||11
563.564.435|0|ML|32|172.26|319.00|1|1|5|||BCO|BCO|B||||||11
563.564.436|0|ML|32|172.26|319.00|1|1|5|||BCO|BCO|M||||||11
563.564.437|0|ML|32|172.26|319.00|1|1|5|||CCL|CCL|B||||||11
563.564.438|0|ML|32|172.26|319.00|1|1|5|||CCL|CCL|M||||||11
563.564.439|0|ML|32|172.26|319.00|1|1|5|||CME|CME|B||||||11
563.564.440|0|ML|32|172.26|319.00|1|1|5|||CME|CME|M||||||11
563.564.441|0|ML|32|172.26|319.00|1|1|5|||ANT|ANT|B||||||11
563.564.442|0|ML|32|172.26|319.00|1|1|5|||ANT|ANT|M||||||11
563.564.443|0|ML|32|172.26|319.00|1|1|5|||PTO|PTO|B||||||11
563.564.444|0|ML|32|172.26|319.00|1|1|5|||PTO|PTO|M||||||11
563.564.445|0|ML|32|172.26|319.00|1|1|5|||CRE|CRE|B||||||11
563.564.446|0|ML|32|172.26|319.00|1|1|5|||CRE|CRE|M||||||11
563.564.447|0|ML|32|172.26|319.00|1|1|5|||CAM|CAM|B||||||11
563.564.448|0|ML|32|172.26|319.00|1|1|5|||CAM|CAM|M||||||11
563.564.449|0|ML|32|172.26|319.00|1|1|5|||OUR|OUR|B||||||11
563.564.450|0|ML|32|172.26|319.00|1|1|5|||OUR|OUR|M||||||11
563.564.451|0|ML|32|172.26|319.00|1|1|5|||COB|COB|B||||||11
563.564.452|0|ML|32|172.26|319.00|1|1|5|||COB|COB|M||||||11
563.564.453|0|ML|32|172.26|319.00|1|1|5|||CHO|CHO|B||||||11
563.564.454|0|ML|32|172.26|319.00|1|1|5|||CHO|CHO|M||||||11
563.564.455|0|ML|32|172.26|319.00|1|1|5|||VAG|VAG|B||||||11
563.564.456|0|ML|32|172.26|319.00|1|1|5|||VAG|VAG|M||||||11
563.564.457|0|ML|32|172.26|319.00|1|1|5|||AZE|AZE|B||||||11
563.564.458|0|ML|32|172.26|319.00|1|1|5|||AZE|AZE|M||||||11
563.564.459|0|ML|32|172.26|319.00|1|1|5|||AMA|AMA|B||||||11
563.564.460|0|ML|32|172.26|319.00|1|1|5|||AMA|AMA|M||||||11
563.564.461|0|ML|32|172.26|319.00|1|1|5|||AES|AES|B||||||11
563.564.462|0|ML|32|172.26|319.00|1|1|5|||AES|AES|M||||||11
563.564.463|0|ML|32|172.26|319.00|1|1|5|||PRA|PRA|B||||||11
563.564.464|0|ML|32|172.26|319.00|1|1|5|||PRA|PRA|M||||||11
563.564.465|0|ML|32|172.26|319.00|1|1|5|||ROS|ROS|B||||||11
563.564.466|0|ML|32|172.26|319.00|1|1|5|||ROS|ROS|M||||||11
563.564.467|0|ML|32|172.26|319.00|1|1|5|||VER|VER|B||||||11
563.564.468|0|ML|32|172.26|319.00|1|1|5|||VER|VER|M||||||11
563.564.469|0|ML|32|172.26|319.00|1|1|5|||AZB|AZB|||||||11
563.564.470|0|ML|32|172.26|319.00|1|1|5|||DEN|DEN|||||||11
563.564.471|0|ML|32|172.26|319.00|1|1|5|||BLK|BLK|||||||11
563.564.472|0|ML|32|172.26|319.00|1|1|5|||ART|ART|||||||11
563.564.473|0|ML|32|172.26|319.00|1|1|5|||LIN|LIN|||||||11
563.564.474|0|ML|32|172.26|319.00|1|1|5|||HAL|HAL|||||||11
565.566.394|0|ML|33|113.40|210.00|1|1|5|||TBR|TBR|||||||12
565.566.198|0|ML|33|113.40|210.00|1|1|5|||TEA|TEA|||||||12
565.566.199|0|ML|33|113.40|210.00|1|1|5|||OAK|OAK|||||||12
565.566.200|0|ML|33|113.40|210.00|1|1|5|||JOP|JOP|||||||12
565.566.395|0|ML|33|156.60|290.00|1|1|5|||TBR|BCO|B||||||12
565.566.396|0|ML|33|156.60|290.00|1|1|5|||TBR|BCO|M||||||12
565.566.397|0|ML|33|156.60|290.00|1|1|5|||TBR|CCL|B||||||12
565.566.398|0|ML|33|156.60|290.00|1|1|5|||TBR|CCL|M||||||12
565.566.399|0|ML|33|156.60|290.00|1|1|5|||TBR|CME|B||||||12
565.566.400|0|ML|33|156.60|290.00|1|1|5|||TBR|CME|M||||||12
565.566.401|0|ML|33|156.60|290.00|1|1|5|||TBR|ANT|B||||||12
565.566.402|0|ML|33|156.60|290.00|1|1|5|||TBR|ANT|M||||||12
565.566.403|0|ML|33|156.60|290.00|1|1|5|||TBR|PTO|B||||||12
565.566.404|0|ML|33|156.60|290.00|1|1|5|||TBR|PTO|M||||||12
565.566.405|0|ML|33|156.60|290.00|1|1|5|||TBR|CRE|B||||||12
565.566.406|0|ML|33|156.60|290.00|1|1|5|||TBR|CRE|M||||||12
565.566.407|0|ML|33|156.60|290.00|1|1|5|||TBR|CAM|B||||||12
565.566.408|0|ML|33|156.60|290.00|1|1|5|||TBR|CAM|M||||||12
565.566.409|0|ML|33|156.60|290.00|1|1|5|||TBR|OUR|B||||||12
565.566.410|0|ML|33|156.60|290.00|1|1|5|||TBR|OUR|M||||||12
565.566.411|0|ML|33|156.60|290.00|1|1|5|||TBR|COB|B||||||12
565.566.412|0|ML|33|156.60|290.00|1|1|5|||TBR|COB|M||||||12
565.566.413|0|ML|33|156.60|290.00|1|1|5|||TBR|CHO|B||||||12
565.566.414|0|ML|33|156.60|290.00|1|1|5|||TBR|CHO|M||||||12
565.566.415|0|ML|33|156.60|290.00|1|1|5|||TBR|VAG|B||||||12
565.566.416|0|ML|33|156.60|290.00|1|1|5|||TBR|VAG|M||||||12
565.566.417|0|ML|33|156.60|290.00|1|1|5|||TBR|AZE|B||||||12
565.566.418|0|ML|33|156.60|290.00|1|1|5|||TBR|AZE|M||||||12
565.566.419|0|ML|33|156.60|290.00|1|1|5|||TBR|AMA|B||||||12
565.566.420|0|ML|33|156.60|290.00|1|1|5|||TBR|AMA|M||||||12
565.566.421|0|ML|33|156.60|290.00|1|1|5|||TBR|AES|B||||||12
565.566.422|0|ML|33|156.60|290.00|1|1|5|||TBR|AES|M||||||12
565.566.423|0|ML|33|156.60|290.00|1|1|5|||TBR|PRA|B||||||12
565.566.424|0|ML|33|156.60|290.00|1|1|5|||TBR|PRA|M||||||12
565.566.425|0|ML|33|156.60|290.00|1|1|5|||TBR|ROS|B||||||12
565.566.426|0|ML|33|156.60|290.00|1|1|5|||TBR|ROS|M||||||12
565.566.427|0|ML|33|156.60|290.00|1|1|5|||TBR|VER|B||||||12
565.566.428|0|ML|33|156.60|290.00|1|1|5|||TBR|VER|M||||||12
565.566.429|0|ML|33|156.60|290.00|1|1|5|||TBR|AZB|||||||12
565.566.430|0|ML|33|156.60|290.00|1|1|5|||TBR|DEN|||||||12
565.566.431|0|ML|33|156.60|290.00|1|1|5|||TBR|BLK|||||||12
565.566.432|0|ML|33|156.60|290.00|1|1|5|||TBR|ART|||||||12
565.566.433|0|ML|33|156.60|290.00|1|1|5|||TBR|LIN|||||||12
565.566.434|0|ML|33|156.60|290.00|1|1|5|||TBR|HAL|||||||12
565.566.435|0|ML|33|178.20|330.00|1|1|5|||BCO|BCO|B||||||12
565.566.436|0|ML|33|178.20|330.00|1|1|5|||BCO|BCO|M||||||12
565.566.437|0|ML|33|178.20|330.00|1|1|5|||CCL|CCL|B||||||12
565.566.438|0|ML|33|178.20|330.00|1|1|5|||CCL|CCL|M||||||12
565.566.439|0|ML|33|178.20|330.00|1|1|5|||CME|CME|B||||||12
565.566.440|0|ML|33|178.20|330.00|1|1|5|||CME|CME|M||||||12
565.566.441|0|ML|33|178.20|330.00|1|1|5|||ANT|ANT|B||||||12
565.566.442|0|ML|33|178.20|330.00|1|1|5|||ANT|ANT|M||||||12
565.566.443|0|ML|33|178.20|330.00|1|1|5|||PTO|PTO|B||||||12
565.566.444|0|ML|33|178.20|330.00|1|1|5|||PTO|PTO|M||||||12
565.566.445|0|ML|33|178.20|330.00|1|1|5|||CRE|CRE|B||||||12
565.566.446|0|ML|33|178.20|330.00|1|1|5|||CRE|CRE|M||||||12
565.566.447|0|ML|33|178.20|330.00|1|1|5|||CAM|CAM|B||||||12
565.566.448|0|ML|33|178.20|330.00|1|1|5|||CAM|CAM|M||||||12
565.566.449|0|ML|33|178.20|330.00|1|1|5|||OUR|OUR|B||||||12
565.566.450|0|ML|33|178.20|330.00|1|1|5|||OUR|OUR|M||||||12
565.566.451|0|ML|33|178.20|330.00|1|1|5|||COB|COB|B||||||12
565.566.452|0|ML|33|178.20|330.00|1|1|5|||COB|COB|M||||||12
565.566.453|0|ML|33|178.20|330.00|1|1|5|||CHO|CHO|B||||||12
565.566.454|0|ML|33|178.20|330.00|1|1|5|||CHO|CHO|M||||||12
565.566.455|0|ML|33|178.20|330.00|1|1|5|||VAG|VAG|B||||||12
565.566.456|0|ML|33|178.20|330.00|1|1|5|||VAG|VAG|M||||||12
565.566.457|0|ML|33|178.20|330.00|1|1|5|||AZE|AZE|B||||||12
565.566.458|0|ML|33|178.20|330.00|1|1|5|||AZE|AZE|M||||||12
565.566.459|0|ML|33|178.20|330.00|1|1|5|||AMA|AMA|B||||||12
565.566.460|0|ML|33|178.20|330.00|1|1|5|||AMA|AMA|M||||||12
565.566.461|0|ML|33|178.20|330.00|1|1|5|||AES|AES|B||||||12
565.566.462|0|ML|33|178.20|330.00|1|1|5|||AES|AES|M||||||12
565.566.463|0|ML|33|178.20|330.00|1|1|5|||PRA|PRA|B||||||12
565.566.464|0|ML|33|178.20|330.00|1|1|5|||PRA|PRA|M||||||12
565.566.465|0|ML|33|178.20|330.00|1|1|5|||ROS|ROS|B||||||12
565.566.466|0|ML|33|178.20|330.00|1|1|5|||ROS|ROS|M||||||12
565.566.467|0|ML|33|178.20|330.00|1|1|5|||VER|VER|B||||||12
565.566.468|0|ML|33|178.20|330.00|1|1|5|||VER|VER|M||||||12
565.566.469|0|ML|33|178.20|330.00|1|1|5|||AZB|AZB|||||||12
565.566.470|0|ML|33|178.20|330.00|1|1|5|||DEN|DEN|||||||12
565.566.471|0|ML|33|178.20|330.00|1|1|5|||BLK|BLK|||||||12
565.566.472|0|ML|33|178.20|330.00|1|1|5|||ART|ART|||||||12
565.566.473|0|ML|33|178.20|330.00|1|1|5|||LIN|LIN|||||||12
565.566.474|0|ML|33|178.20|330.00|1|1|5|||HAL|HAL|||||||12
567.568.394|0|ML|34|94.50|175.00|1|1|6|||TBR|TBR|||||||18
567.568.198|0|ML|34|94.50|175.00|1|1|6|||TEA|TEA|||||||18
567.568.199|0|ML|34|94.50|175.00|1|1|6|||OAK|OAK|||||||18
567.568.200|0|ML|34|94.50|175.00|1|1|6|||JOP|JOP|||||||18
567.568.395|0|ML|34|137.70|255.00|1|1|6|||TBR|BCO|B||||||18
567.568.396|0|ML|34|137.70|255.00|1|1|6|||TBR|BCO|M||||||18
567.568.397|0|ML|34|137.70|255.00|1|1|6|||TBR|CCL|B||||||18
567.568.398|0|ML|34|137.70|255.00|1|1|6|||TBR|CCL|M||||||18
567.568.399|0|ML|34|137.70|255.00|1|1|6|||TBR|CME|B||||||18
567.568.400|0|ML|34|137.70|255.00|1|1|6|||TBR|CME|M||||||18
567.568.401|0|ML|34|137.70|255.00|1|1|6|||TBR|ANT|B||||||18
567.568.402|0|ML|34|137.70|255.00|1|1|6|||TBR|ANT|M||||||18
567.568.403|0|ML|34|137.70|255.00|1|1|6|||TBR|PTO|B||||||18
567.568.404|0|ML|34|137.70|255.00|1|1|6|||TBR|PTO|M||||||18
567.568.405|0|ML|34|137.70|255.00|1|1|6|||TBR|CRE|B||||||18
567.568.406|0|ML|34|137.70|255.00|1|1|6|||TBR|CRE|M||||||18
567.568.407|0|ML|34|137.70|255.00|1|1|6|||TBR|CAM|B||||||18
567.568.408|0|ML|34|137.70|255.00|1|1|6|||TBR|CAM|M||||||18
567.568.409|0|ML|34|137.70|255.00|1|1|6|||TBR|OUR|B||||||18
567.568.410|0|ML|34|137.70|255.00|1|1|6|||TBR|OUR|M||||||18
567.568.411|0|ML|34|137.70|255.00|1|1|6|||TBR|COB|B||||||18
567.568.412|0|ML|34|137.70|255.00|1|1|6|||TBR|COB|M||||||18
567.568.413|0|ML|34|137.70|255.00|1|1|6|||TBR|CHO|B||||||18
567.568.414|0|ML|34|137.70|255.00|1|1|6|||TBR|CHO|M||||||18
567.568.415|0|ML|34|137.70|255.00|1|1|6|||TBR|VAG|B||||||18
567.568.416|0|ML|34|137.70|255.00|1|1|6|||TBR|VAG|M||||||18
567.568.417|0|ML|34|137.70|255.00|1|1|6|||TBR|AZE|B||||||18
567.568.418|0|ML|34|137.70|255.00|1|1|6|||TBR|AZE|M||||||18
567.568.419|0|ML|34|137.70|255.00|1|1|6|||TBR|AMA|B||||||18
567.568.420|0|ML|34|137.70|255.00|1|1|6|||TBR|AMA|M||||||18
567.568.421|0|ML|34|137.70|255.00|1|1|6|||TBR|AES|B||||||18
567.568.422|0|ML|34|137.70|255.00|1|1|6|||TBR|AES|M||||||18
567.568.423|0|ML|34|137.70|255.00|1|1|6|||TBR|PRA|B||||||18
567.568.424|0|ML|34|137.70|255.00|1|1|6|||TBR|PRA|M||||||18
567.568.425|0|ML|34|137.70|255.00|1|1|6|||TBR|ROS|B||||||18
567.568.426|0|ML|34|137.70|255.00|1|1|6|||TBR|ROS|M||||||18
567.568.427|0|ML|34|137.70|255.00|1|1|6|||TBR|VER|B||||||18
567.568.428|0|ML|34|137.70|255.00|1|1|6|||TBR|VER|M||||||18
567.568.429|0|ML|34|137.70|255.00|1|1|6|||TBR|AZB|||||||18
567.568.430|0|ML|34|137.70|255.00|1|1|6|||TBR|DEN|||||||18
567.568.431|0|ML|34|137.70|255.00|1|1|6|||TBR|BLK|||||||18
567.568.432|0|ML|34|137.70|255.00|1|1|6|||TBR|ART|||||||18
567.568.433|0|ML|34|137.70|255.00|1|1|6|||TBR|LIN|||||||18
567.568.434|0|ML|34|137.70|255.00|1|1|6|||TBR|HAL|||||||18
567.568.435|0|ML|34|159.30|295.00|1|1|6|||BCO|BCO|B||||||18
567.568.436|0|ML|34|159.30|295.00|1|1|6|||BCO|BCO|M||||||18
567.568.437|0|ML|34|159.30|295.00|1|1|6|||CCL|CCL|B||||||18
567.568.438|0|ML|34|159.30|295.00|1|1|6|||CCL|CCL|M||||||18
567.568.439|0|ML|34|159.30|295.00|1|1|6|||CME|CME|B||||||18
567.568.440|0|ML|34|159.30|295.00|1|1|6|||CME|CME|M||||||18
567.568.441|0|ML|34|159.30|295.00|1|1|6|||ANT|ANT|B||||||18
567.568.442|0|ML|34|159.30|295.00|1|1|6|||ANT|ANT|M||||||18
567.568.443|0|ML|34|159.30|295.00|1|1|6|||PTO|PTO|B||||||18
567.568.444|0|ML|34|159.30|295.00|1|1|6|||PTO|PTO|M||||||18
567.568.445|0|ML|34|159.30|295.00|1|1|6|||CRE|CRE|B||||||18
567.568.446|0|ML|34|159.30|295.00|1|1|6|||CRE|CRE|M||||||18
567.568.447|0|ML|34|159.30|295.00|1|1|6|||CAM|CAM|B||||||18
567.568.448|0|ML|34|159.30|295.00|1|1|6|||CAM|CAM|M||||||18
567.568.449|0|ML|34|159.30|295.00|1|1|6|||OUR|OUR|B||||||18
567.568.450|0|ML|34|159.30|295.00|1|1|6|||OUR|OUR|M||||||18
567.568.451|0|ML|34|159.30|295.00|1|1|6|||COB|COB|B||||||18
567.568.452|0|ML|34|159.30|295.00|1|1|6|||COB|COB|M||||||18
567.568.453|0|ML|34|159.30|295.00|1|1|6|||CHO|CHO|B||||||18
567.568.454|0|ML|34|159.30|295.00|1|1|6|||CHO|CHO|M||||||18
567.568.455|0|ML|34|159.30|295.00|1|1|6|||VAG|VAG|B||||||18
567.568.456|0|ML|34|159.30|295.00|1|1|6|||VAG|VAG|M||||||18
567.568.457|0|ML|34|159.30|295.00|1|1|6|||AZE|AZE|B||||||18
567.568.458|0|ML|34|159.30|295.00|1|1|6|||AZE|AZE|M||||||18
567.568.459|0|ML|34|159.30|295.00|1|1|6|||AMA|AMA|B||||||18
567.568.460|0|ML|34|159.30|295.00|1|1|6|||AMA|AMA|M||||||18
567.568.461|0|ML|34|159.30|295.00|1|1|6|||AES|AES|B||||||18
567.568.462|0|ML|34|159.30|295.00|1|1|6|||AES|AES|M||||||18
567.568.463|0|ML|34|159.30|295.00|1|1|6|||PRA|PRA|B||||||18
567.568.464|0|ML|34|159.30|295.00|1|1|6|||PRA|PRA|M||||||18
567.568.465|0|ML|34|159.30|295.00|1|1|6|||ROS|ROS|B||||||18
567.568.466|0|ML|34|159.30|295.00|1|1|6|||ROS|ROS|M||||||18
567.568.467|0|ML|34|159.30|295.00|1|1|6|||VER|VER|B||||||18
567.568.468|0|ML|34|159.30|295.00|1|1|6|||VER|VER|M||||||18
567.568.469|0|ML|34|159.30|295.00|1|1|6|||AZB|AZB|||||||18
567.568.470|0|ML|34|159.30|295.00|1|1|6|||DEN|DEN|||||||18
567.568.471|0|ML|34|159.30|295.00|1|1|6|||BLK|BLK|||||||18
567.568.472|0|ML|34|159.30|295.00|1|1|6|||ART|ART|||||||18
567.568.473|0|ML|34|159.30|295.00|1|1|6|||LIN|LIN|||||||18
567.568.474|0|ML|34|159.30|295.00|1|1|6|||HAL|HAL|||||||18
567.568.475|0|ML|35|94.50|175.00|1|1|6|||TBR|TBR|||||||18
567.568.242|0|ML|35|94.50|175.00|1|1|6|||TEA|TEA|||||||18
567.568.243|0|ML|35|94.50|175.00|1|1|6|||OAK|OAK|||||||18
567.568.244|0|ML|35|94.50|175.00|1|1|6|||JOP|JOP|||||||18
567.568.476|0|ML|35|137.70|255.00|1|1|6|||TBR|BCO|B||||||18
567.568.477|0|ML|35|137.70|255.00|1|1|6|||TBR|BCO|M||||||18
567.568.478|0|ML|35|137.70|255.00|1|1|6|||TBR|CCL|B||||||18
567.568.479|0|ML|35|137.70|255.00|1|1|6|||TBR|CCL|M||||||18
567.568.480|0|ML|35|137.70|255.00|1|1|6|||TBR|CME|B||||||18
567.568.481|0|ML|35|137.70|255.00|1|1|6|||TBR|CME|M||||||18
567.568.482|0|ML|35|137.70|255.00|1|1|6|||TBR|ANT|B||||||18
567.568.483|0|ML|35|137.70|255.00|1|1|6|||TBR|ANT|M||||||18
567.568.484|0|ML|35|137.70|255.00|1|1|6|||TBR|PTO|B||||||18
567.568.485|0|ML|35|137.70|255.00|1|1|6|||TBR|PTO|M||||||18
567.568.486|0|ML|35|137.70|255.00|1|1|6|||TBR|CRE|B||||||18
567.568.487|0|ML|35|137.70|255.00|1|1|6|||TBR|CRE|M||||||18
567.568.488|0|ML|35|137.70|255.00|1|1|6|||TBR|CAM|B||||||18
567.568.489|0|ML|35|137.70|255.00|1|1|6|||TBR|CAM|M||||||18
567.568.490|0|ML|35|137.70|255.00|1|1|6|||TBR|OUR|B||||||18
567.568.491|0|ML|35|137.70|255.00|1|1|6|||TBR|OUR|M||||||18
567.568.492|0|ML|35|137.70|255.00|1|1|6|||TBR|COB|B||||||18
567.568.493|0|ML|35|137.70|255.00|1|1|6|||TBR|COB|M||||||18
567.568.494|0|ML|35|137.70|255.00|1|1|6|||TBR|CHO|B||||||18
567.568.495|0|ML|35|137.70|255.00|1|1|6|||TBR|CHO|M||||||18
567.568.496|0|ML|35|137.70|255.00|1|1|6|||TBR|VAG|B||||||18
567.568.497|0|ML|35|137.70|255.00|1|1|6|||TBR|VAG|M||||||18
567.568.498|0|ML|35|137.70|255.00|1|1|6|||TBR|AZE|B||||||18
567.568.499|0|ML|35|137.70|255.00|1|1|6|||TBR|AZE|M||||||18
567.568.500|0|ML|35|137.70|255.00|1|1|6|||TBR|AMA|B||||||18
567.568.501|0|ML|35|137.70|255.00|1|1|6|||TBR|AMA|M||||||18
567.568.502|0|ML|35|137.70|255.00|1|1|6|||TBR|AES|B||||||18
567.568.503|0|ML|35|137.70|255.00|1|1|6|||TBR|AES|M||||||18
567.568.504|0|ML|35|137.70|255.00|1|1|6|||TBR|PRA|B||||||18
567.568.505|0|ML|35|137.70|255.00|1|1|6|||TBR|PRA|M||||||18
567.568.506|0|ML|35|137.70|255.00|1|1|6|||TBR|ROS|B||||||18
567.568.507|0|ML|35|137.70|255.00|1|1|6|||TBR|ROS|M||||||18
567.568.508|0|ML|35|137.70|255.00|1|1|6|||TBR|VER|B||||||18
567.568.509|0|ML|35|137.70|255.00|1|1|6|||TBR|VER|M||||||18
567.568.510|0|ML|35|137.70|255.00|1|1|6|||TBR|AZB|||||||18
567.568.511|0|ML|35|137.70|255.00|1|1|6|||TBR|DEN|||||||18
567.568.512|0|ML|35|137.70|255.00|1|1|6|||TBR|BLK|||||||18
567.568.513|0|ML|35|137.70|255.00|1|1|6|||TBR|ART|||||||18
567.568.514|0|ML|35|137.70|255.00|1|1|6|||TBR|LIN|||||||18
567.568.515|0|ML|35|137.70|255.00|1|1|6|||TBR|HAL|||||||18
567.568.516|0|ML|35|159.30|295.00|1|1|6|||BCO|BCO|B||||||18
567.568.517|0|ML|35|159.30|295.00|1|1|6|||BCO|BCO|M||||||18
567.568.518|0|ML|35|159.30|295.00|1|1|6|||CCL|CCL|B||||||18
567.568.519|0|ML|35|159.30|295.00|1|1|6|||CCL|CCL|M||||||18
567.568.520|0|ML|35|159.30|295.00|1|1|6|||CME|CME|B||||||18
567.568.521|0|ML|35|159.30|295.00|1|1|6|||CME|CME|M||||||18
567.568.522|0|ML|35|159.30|295.00|1|1|6|||ANT|ANT|B||||||18
567.568.523|0|ML|35|159.30|295.00|1|1|6|||ANT|ANT|M||||||18
567.568.524|0|ML|35|159.30|295.00|1|1|6|||PTO|PTO|B||||||18
567.568.525|0|ML|35|159.30|295.00|1|1|6|||PTO|PTO|M||||||18
567.568.526|0|ML|35|159.30|295.00|1|1|6|||CRE|CRE|B||||||18
567.568.527|0|ML|35|159.30|295.00|1|1|6|||CRE|CRE|M||||||18
567.568.528|0|ML|35|159.30|295.00|1|1|6|||CAM|CAM|B||||||18
567.568.529|0|ML|35|159.30|295.00|1|1|6|||CAM|CAM|M||||||18
567.568.530|0|ML|35|159.30|295.00|1|1|6|||OUR|OUR|B||||||18
567.568.531|0|ML|35|159.30|295.00|1|1|6|||OUR|OUR|M||||||18
567.568.532|0|ML|35|159.30|295.00|1|1|6|||COB|COB|B||||||18
567.568.533|0|ML|35|159.30|295.00|1|1|6|||COB|COB|M||||||18
567.568.534|0|ML|35|159.30|295.00|1|1|6|||CHO|CHO|B||||||18
567.568.535|0|ML|35|159.30|295.00|1|1|6|||CHO|CHO|M||||||18
567.568.536|0|ML|35|159.30|295.00|1|1|6|||VAG|VAG|B||||||18
567.568.537|0|ML|35|159.30|295.00|1|1|6|||VAG|VAG|M||||||18
567.568.538|0|ML|35|159.30|295.00|1|1|6|||AZE|AZE|B||||||18
567.568.539|0|ML|35|159.30|295.00|1|1|6|||AZE|AZE|M||||||18
567.568.540|0|ML|35|159.30|295.00|1|1|6|||AMA|AMA|B||||||18
567.568.541|0|ML|35|159.30|295.00|1|1|6|||AMA|AMA|M||||||18
567.568.542|0|ML|35|159.30|295.00|1|1|6|||AES|AES|B||||||18
567.568.543|0|ML|35|159.30|295.00|1|1|6|||AES|AES|M||||||18
567.568.544|0|ML|35|159.30|295.00|1|1|6|||PRA|PRA|B||||||18
567.568.545|0|ML|35|159.30|295.00|1|1|6|||PRA|PRA|M||||||18
567.568.546|0|ML|35|159.30|295.00|1|1|6|||ROS|ROS|B||||||18
567.568.547|0|ML|35|159.30|295.00|1|1|6|||ROS|ROS|M||||||18
567.568.548|0|ML|35|159.30|295.00|1|1|6|||VER|VER|B||||||18
567.568.549|0|ML|35|159.30|295.00|1|1|6|||VER|VER|M||||||18
567.568.550|0|ML|35|159.30|295.00|1|1|6|||AZB|AZB|||||||18
567.568.551|0|ML|35|159.30|295.00|1|1|6|||DEN|DEN|||||||18
567.568.552|0|ML|35|159.30|295.00|1|1|6|||BLK|BLK|||||||18
567.568.553|0|ML|35|159.30|295.00|1|1|6|||ART|ART|||||||18
567.568.554|0|ML|35|159.30|295.00|1|1|6|||LIN|LIN|||||||18
567.568.555|0|ML|35|159.30|295.00|1|1|6|||HAL|HAL|||||||18
569.568.394|0|ML|34|96.12|178.00|1|1|6|||TBR|TBR|||||||14
569.568.198|0|ML|34|96.12|178.00|1|1|6|||TEA|TEA|||||||14
569.568.199|0|ML|34|96.12|178.00|1|1|6|||OAK|OAK|||||||14
569.568.200|0|ML|34|96.12|178.00|1|1|6|||JOP|JOP|||||||14
569.568.395|0|ML|34|139.32|258.00|1|1|6|||TBR|BCO|B||||||14
569.568.396|0|ML|34|139.32|258.00|1|1|6|||TBR|BCO|M||||||14
569.568.397|0|ML|34|139.32|258.00|1|1|6|||TBR|CCL|B||||||14
569.568.398|0|ML|34|139.32|258.00|1|1|6|||TBR|CCL|M||||||14
569.568.399|0|ML|34|139.32|258.00|1|1|6|||TBR|CME|B||||||14
569.568.400|0|ML|34|139.32|258.00|1|1|6|||TBR|CME|M||||||14
569.568.401|0|ML|34|139.32|258.00|1|1|6|||TBR|ANT|B||||||14
569.568.402|0|ML|34|139.32|258.00|1|1|6|||TBR|ANT|M||||||14
569.568.403|0|ML|34|139.32|258.00|1|1|6|||TBR|PTO|B||||||14
569.568.404|0|ML|34|139.32|258.00|1|1|6|||TBR|PTO|M||||||14
569.568.405|0|ML|34|139.32|258.00|1|1|6|||TBR|CRE|B||||||14
569.568.406|0|ML|34|139.32|258.00|1|1|6|||TBR|CRE|M||||||14
569.568.407|0|ML|34|139.32|258.00|1|1|6|||TBR|CAM|B||||||14
569.568.408|0|ML|34|139.32|258.00|1|1|6|||TBR|CAM|M||||||14
569.568.409|0|ML|34|139.32|258.00|1|1|6|||TBR|OUR|B||||||14
569.568.410|0|ML|34|139.32|258.00|1|1|6|||TBR|OUR|M||||||14
569.568.411|0|ML|34|139.32|258.00|1|1|6|||TBR|COB|B||||||14
569.568.412|0|ML|34|139.32|258.00|1|1|6|||TBR|COB|M||||||14
569.568.413|0|ML|34|139.32|258.00|1|1|6|||TBR|CHO|B||||||14
569.568.414|0|ML|34|139.32|258.00|1|1|6|||TBR|CHO|M||||||14
569.568.415|0|ML|34|139.32|258.00|1|1|6|||TBR|VAG|B||||||14
569.568.416|0|ML|34|139.32|258.00|1|1|6|||TBR|VAG|M||||||14
569.568.417|0|ML|34|139.32|258.00|1|1|6|||TBR|AZE|B||||||14
569.568.418|0|ML|34|139.32|258.00|1|1|6|||TBR|AZE|M||||||14
569.568.419|0|ML|34|139.32|258.00|1|1|6|||TBR|AMA|B||||||14
569.568.420|0|ML|34|139.32|258.00|1|1|6|||TBR|AMA|M||||||14
569.568.421|0|ML|34|139.32|258.00|1|1|6|||TBR|AES|B||||||14
569.568.422|0|ML|34|139.32|258.00|1|1|6|||TBR|AES|M||||||14
569.568.423|0|ML|34|139.32|258.00|1|1|6|||TBR|PRA|B||||||14
569.568.424|0|ML|34|139.32|258.00|1|1|6|||TBR|PRA|M||||||14
569.568.425|0|ML|34|139.32|258.00|1|1|6|||TBR|ROS|B||||||14
569.568.426|0|ML|34|139.32|258.00|1|1|6|||TBR|ROS|M||||||14
569.568.427|0|ML|34|139.32|258.00|1|1|6|||TBR|VER|B||||||14
569.568.428|0|ML|34|139.32|258.00|1|1|6|||TBR|VER|M||||||14
569.568.429|0|ML|34|139.32|258.00|1|1|6|||TBR|AZB|||||||14
569.568.430|0|ML|34|139.32|258.00|1|1|6|||TBR|DEN|||||||14
569.568.431|0|ML|34|139.32|258.00|1|1|6|||TBR|BLK|||||||14
569.568.432|0|ML|34|139.32|258.00|1|1|6|||TBR|ART|||||||14
569.568.433|0|ML|34|139.32|258.00|1|1|6|||TBR|LIN|||||||14
569.568.434|0|ML|34|139.32|258.00|1|1|6|||TBR|HAL|||||||14
569.568.435|0|ML|34|160.92|298.00|1|1|6|||BCO|BCO|B||||||14
569.568.436|0|ML|34|160.92|298.00|1|1|6|||BCO|BCO|M||||||14
569.568.437|0|ML|34|160.92|298.00|1|1|6|||CCL|CCL|B||||||14
569.568.438|0|ML|34|160.92|298.00|1|1|6|||CCL|CCL|M||||||14
569.568.439|0|ML|34|160.92|298.00|1|1|6|||CME|CME|B||||||14
569.568.440|0|ML|34|160.92|298.00|1|1|6|||CME|CME|M||||||14
569.568.441|0|ML|34|160.92|298.00|1|1|6|||ANT|ANT|B||||||14
569.568.442|0|ML|34|160.92|298.00|1|1|6|||ANT|ANT|M||||||14
569.568.443|0|ML|34|160.92|298.00|1|1|6|||PTO|PTO|B||||||14
569.568.444|0|ML|34|160.92|298.00|1|1|6|||PTO|PTO|M||||||14
569.568.445|0|ML|34|160.92|298.00|1|1|6|||CRE|CRE|B||||||14
569.568.446|0|ML|34|160.92|298.00|1|1|6|||CRE|CRE|M||||||14
569.568.447|0|ML|34|160.92|298.00|1|1|6|||CAM|CAM|B||||||14
569.568.448|0|ML|34|160.92|298.00|1|1|6|||CAM|CAM|M||||||14
569.568.449|0|ML|34|160.92|298.00|1|1|6|||OUR|OUR|B||||||14
569.568.450|0|ML|34|160.92|298.00|1|1|6|||OUR|OUR|M||||||14
569.568.451|0|ML|34|160.92|298.00|1|1|6|||COB|COB|B||||||14
569.568.452|0|ML|34|160.92|298.00|1|1|6|||COB|COB|M||||||14
569.568.453|0|ML|34|160.92|298.00|1|1|6|||CHO|CHO|B||||||14
569.568.454|0|ML|34|160.92|298.00|1|1|6|||CHO|CHO|M||||||14
569.568.455|0|ML|34|160.92|298.00|1|1|6|||VAG|VAG|B||||||14
569.568.456|0|ML|34|160.92|298.00|1|1|6|||VAG|VAG|M||||||14
569.568.457|0|ML|34|160.92|298.00|1|1|6|||AZE|AZE|B||||||14
569.568.458|0|ML|34|160.92|298.00|1|1|6|||AZE|AZE|M||||||14
569.568.459|0|ML|34|160.92|298.00|1|1|6|||AMA|AMA|B||||||14
569.568.460|0|ML|34|160.92|298.00|1|1|6|||AMA|AMA|M||||||14
569.568.461|0|ML|34|160.92|298.00|1|1|6|||AES|AES|B||||||14
569.568.462|0|ML|34|160.92|298.00|1|1|6|||AES|AES|M||||||14
569.568.463|0|ML|34|160.92|298.00|1|1|6|||PRA|PRA|B||||||14
569.568.464|0|ML|34|160.92|298.00|1|1|6|||PRA|PRA|M||||||14
569.568.465|0|ML|34|160.92|298.00|1|1|6|||ROS|ROS|B||||||14
569.568.466|0|ML|34|160.92|298.00|1|1|6|||ROS|ROS|M||||||14
569.568.467|0|ML|34|160.92|298.00|1|1|6|||VER|VER|B||||||14
569.568.468|0|ML|34|160.92|298.00|1|1|6|||VER|VER|M||||||14
569.568.469|0|ML|34|160.92|298.00|1|1|6|||AZB|AZB|||||||14
569.568.470|0|ML|34|160.92|298.00|1|1|6|||DEN|DEN|||||||14
569.568.471|0|ML|34|160.92|298.00|1|1|6|||BLK|BLK|||||||14
569.568.472|0|ML|34|160.92|298.00|1|1|6|||ART|ART|||||||14
569.568.473|0|ML|34|160.92|298.00|1|1|6|||LIN|LIN|||||||14
569.568.474|0|ML|34|160.92|298.00|1|1|6|||HAL|HAL|||||||14
569.568.475|0|ML|35|96.12|178.00|1|1|6|||TBR|TBR|||||||14
569.568.242|0|ML|35|96.12|178.00|1|1|6|||TEA|TEA|||||||14
569.568.243|0|ML|35|96.12|178.00|1|1|6|||OAK|OAK|||||||14
569.568.244|0|ML|35|96.12|178.00|1|1|6|||JOP|JOP|||||||14
569.568.476|0|ML|35|139.32|258.00|1|1|6|||TBR|BCO|B||||||14
569.568.477|0|ML|35|139.32|258.00|1|1|6|||TBR|BCO|M||||||14
569.568.478|0|ML|35|139.32|258.00|1|1|6|||TBR|CCL|B||||||14
569.568.479|0|ML|35|139.32|258.00|1|1|6|||TBR|CCL|M||||||14
569.568.480|0|ML|35|139.32|258.00|1|1|6|||TBR|CME|B||||||14
569.568.481|0|ML|35|139.32|258.00|1|1|6|||TBR|CME|M||||||14
569.568.482|0|ML|35|139.32|258.00|1|1|6|||TBR|ANT|B||||||14
569.568.483|0|ML|35|139.32|258.00|1|1|6|||TBR|ANT|M||||||14
569.568.484|0|ML|35|139.32|258.00|1|1|6|||TBR|PTO|B||||||14
569.568.485|0|ML|35|139.32|258.00|1|1|6|||TBR|PTO|M||||||14
569.568.486|0|ML|35|139.32|258.00|1|1|6|||TBR|CRE|B||||||14
569.568.487|0|ML|35|139.32|258.00|1|1|6|||TBR|CRE|M||||||14
569.568.488|0|ML|35|139.32|258.00|1|1|6|||TBR|CAM|B||||||14
569.568.489|0|ML|35|139.32|258.00|1|1|6|||TBR|CAM|M||||||14
569.568.490|0|ML|35|139.32|258.00|1|1|6|||TBR|OUR|B||||||14
569.568.491|0|ML|35|139.32|258.00|1|1|6|||TBR|OUR|M||||||14
569.568.492|0|ML|35|139.32|258.00|1|1|6|||TBR|COB|B||||||14
569.568.493|0|ML|35|139.32|258.00|1|1|6|||TBR|COB|M||||||14
569.568.494|0|ML|35|139.32|258.00|1|1|6|||TBR|CHO|B||||||14
569.568.495|0|ML|35|139.32|258.00|1|1|6|||TBR|CHO|M||||||14
569.568.496|0|ML|35|139.32|258.00|1|1|6|||TBR|VAG|B||||||14
569.568.497|0|ML|35|139.32|258.00|1|1|6|||TBR|VAG|M||||||14
569.568.498|0|ML|35|139.32|258.00|1|1|6|||TBR|AZE|B||||||14
569.568.499|0|ML|35|139.32|258.00|1|1|6|||TBR|AZE|M||||||14
569.568.500|0|ML|35|139.32|258.00|1|1|6|||TBR|AMA|B||||||14
569.568.501|0|ML|35|139.32|258.00|1|1|6|||TBR|AMA|M||||||14
569.568.502|0|ML|35|139.32|258.00|1|1|6|||TBR|AES|B||||||14
569.568.503|0|ML|35|139.32|258.00|1|1|6|||TBR|AES|M||||||14
569.568.504|0|ML|35|139.32|258.00|1|1|6|||TBR|PRA|B||||||14
569.568.505|0|ML|35|139.32|258.00|1|1|6|||TBR|PRA|M||||||14
569.568.506|0|ML|35|139.32|258.00|1|1|6|||TBR|ROS|B||||||14
569.568.507|0|ML|35|139.32|258.00|1|1|6|||TBR|ROS|M||||||14
569.568.508|0|ML|35|139.32|258.00|1|1|6|||TBR|VER|B||||||14
569.568.509|0|ML|35|139.32|258.00|1|1|6|||TBR|VER|M||||||14
569.568.510|0|ML|35|139.32|258.00|1|1|6|||TBR|AZB|||||||14
569.568.511|0|ML|35|139.32|258.00|1|1|6|||TBR|DEN|||||||14
569.568.512|0|ML|35|139.32|258.00|1|1|6|||TBR|BLK|||||||14
569.568.513|0|ML|35|139.32|258.00|1|1|6|||TBR|ART|||||||14
569.568.514|0|ML|35|139.32|258.00|1|1|6|||TBR|LIN|||||||14
569.568.515|0|ML|35|139.32|258.00|1|1|6|||TBR|HAL|||||||14
569.568.516|0|ML|35|160.92|298.00|1|1|6|||BCO|BCO|B||||||14
569.568.517|0|ML|35|160.92|298.00|1|1|6|||BCO|BCO|M||||||14
569.568.518|0|ML|35|160.92|298.00|1|1|6|||CCL|CCL|B||||||14
569.568.519|0|ML|35|160.92|298.00|1|1|6|||CCL|CCL|M||||||14
569.568.520|0|ML|35|160.92|298.00|1|1|6|||CME|CME|B||||||14
569.568.521|0|ML|35|160.92|298.00|1|1|6|||CME|CME|M||||||14
569.568.522|0|ML|35|160.92|298.00|1|1|6|||ANT|ANT|B||||||14
569.568.523|0|ML|35|160.92|298.00|1|1|6|||ANT|ANT|M||||||14
569.568.524|0|ML|35|160.92|298.00|1|1|6|||PTO|PTO|B||||||14
569.568.525|0|ML|35|160.92|298.00|1|1|6|||PTO|PTO|M||||||14
569.568.526|0|ML|35|160.92|298.00|1|1|6|||CRE|CRE|B||||||14
569.568.527|0|ML|35|160.92|298.00|1|1|6|||CRE|CRE|M||||||14
569.568.528|0|ML|35|160.92|298.00|1|1|6|||CAM|CAM|B||||||14
569.568.529|0|ML|35|160.92|298.00|1|1|6|||CAM|CAM|M||||||14
569.568.530|0|ML|35|160.92|298.00|1|1|6|||OUR|OUR|B||||||14
569.568.531|0|ML|35|160.92|298.00|1|1|6|||OUR|OUR|M||||||14
569.568.532|0|ML|35|160.92|298.00|1|1|6|||COB|COB|B||||||14
569.568.533|0|ML|35|160.92|298.00|1|1|6|||COB|COB|M||||||14
569.568.534|0|ML|35|160.92|298.00|1|1|6|||CHO|CHO|B||||||14
569.568.535|0|ML|35|160.92|298.00|1|1|6|||CHO|CHO|M||||||14
569.568.536|0|ML|35|160.92|298.00|1|1|6|||VAG|VAG|B||||||14
569.568.537|0|ML|35|160.92|298.00|1|1|6|||VAG|VAG|M||||||14
569.568.538|0|ML|35|160.92|298.00|1|1|6|||AZE|AZE|B||||||14
569.568.539|0|ML|35|160.92|298.00|1|1|6|||AZE|AZE|M||||||14
569.568.540|0|ML|35|160.92|298.00|1|1|6|||AMA|AMA|B||||||14
569.568.541|0|ML|35|160.92|298.00|1|1|6|||AMA|AMA|M||||||14
569.568.542|0|ML|35|160.92|298.00|1|1|6|||AES|AES|B||||||14
569.568.543|0|ML|35|160.92|298.00|1|1|6|||AES|AES|M||||||14
569.568.544|0|ML|35|160.92|298.00|1|1|6|||PRA|PRA|B||||||14
569.568.545|0|ML|35|160.92|298.00|1|1|6|||PRA|PRA|M||||||14
569.568.546|0|ML|35|160.92|298.00|1|1|6|||ROS|ROS|B||||||14
569.568.547|0|ML|35|160.92|298.00|1|1|6|||ROS|ROS|M||||||14
569.568.548|0|ML|35|160.92|298.00|1|1|6|||VER|VER|B||||||14
569.568.549|0|ML|35|160.92|298.00|1|1|6|||VER|VER|M||||||14
569.568.550|0|ML|35|160.92|298.00|1|1|6|||AZB|AZB|||||||14
569.568.551|0|ML|35|160.92|298.00|1|1|6|||DEN|DEN|||||||14
569.568.552|0|ML|35|160.92|298.00|1|1|6|||BLK|BLK|||||||14
569.568.553|0|ML|35|160.92|298.00|1|1|6|||ART|ART|||||||14
569.568.554|0|ML|35|160.92|298.00|1|1|6|||LIN|LIN|||||||14
569.568.555|0|ML|35|160.92|298.00|1|1|6|||HAL|HAL|||||||14
570.571.394|0|ML|36|102.60|190.00|1|1|6|||TBR|TBR|||||||19
570.571.198|0|ML|36|102.60|190.00|1|1|6|||TEA|TEA|||||||19
570.571.199|0|ML|36|102.60|190.00|1|1|6|||OAK|OAK|||||||19
570.571.200|0|ML|36|102.60|190.00|1|1|6|||JOP|JOP|||||||19
570.571.395|0|ML|36|145.80|270.00|1|1|6|||TBR|BCO|B||||||19
570.571.396|0|ML|36|145.80|270.00|1|1|6|||TBR|BCO|M||||||19
570.571.397|0|ML|36|145.80|270.00|1|1|6|||TBR|CCL|B||||||19
570.571.398|0|ML|36|145.80|270.00|1|1|6|||TBR|CCL|M||||||19
570.571.399|0|ML|36|145.80|270.00|1|1|6|||TBR|CME|B||||||19
570.571.400|0|ML|36|145.80|270.00|1|1|6|||TBR|CME|M||||||19
570.571.401|0|ML|36|145.80|270.00|1|1|6|||TBR|ANT|B||||||19
570.571.402|0|ML|36|145.80|270.00|1|1|6|||TBR|ANT|M||||||19
570.571.403|0|ML|36|145.80|270.00|1|1|6|||TBR|PTO|B||||||19
570.571.404|0|ML|36|145.80|270.00|1|1|6|||TBR|PTO|M||||||19
570.571.405|0|ML|36|145.80|270.00|1|1|6|||TBR|CRE|B||||||19
570.571.406|0|ML|36|145.80|270.00|1|1|6|||TBR|CRE|M||||||19
570.571.407|0|ML|36|145.80|270.00|1|1|6|||TBR|CAM|B||||||19
570.571.408|0|ML|36|145.80|270.00|1|1|6|||TBR|CAM|M||||||19
570.571.409|0|ML|36|145.80|270.00|1|1|6|||TBR|OUR|B||||||19
570.571.410|0|ML|36|145.80|270.00|1|1|6|||TBR|OUR|M||||||19
570.571.411|0|ML|36|145.80|270.00|1|1|6|||TBR|COB|B||||||19
570.571.412|0|ML|36|145.80|270.00|1|1|6|||TBR|COB|M||||||19
570.571.413|0|ML|36|145.80|270.00|1|1|6|||TBR|CHO|B||||||19
570.571.414|0|ML|36|145.80|270.00|1|1|6|||TBR|CHO|M||||||19
570.571.415|0|ML|36|145.80|270.00|1|1|6|||TBR|VAG|B||||||19
570.571.416|0|ML|36|145.80|270.00|1|1|6|||TBR|VAG|M||||||19
570.571.417|0|ML|36|145.80|270.00|1|1|6|||TBR|AZE|B||||||19
570.571.418|0|ML|36|145.80|270.00|1|1|6|||TBR|AZE|M||||||19
570.571.419|0|ML|36|145.80|270.00|1|1|6|||TBR|AMA|B||||||19
570.571.420|0|ML|36|145.80|270.00|1|1|6|||TBR|AMA|M||||||19
570.571.421|0|ML|36|145.80|270.00|1|1|6|||TBR|AES|B||||||19
570.571.422|0|ML|36|145.80|270.00|1|1|6|||TBR|AES|M||||||19
570.571.423|0|ML|36|145.80|270.00|1|1|6|||TBR|PRA|B||||||19
570.571.424|0|ML|36|145.80|270.00|1|1|6|||TBR|PRA|M||||||19
570.571.425|0|ML|36|145.80|270.00|1|1|6|||TBR|ROS|B||||||19
570.571.426|0|ML|36|145.80|270.00|1|1|6|||TBR|ROS|M||||||19
570.571.427|0|ML|36|145.80|270.00|1|1|6|||TBR|VER|B||||||19
570.571.428|0|ML|36|145.80|270.00|1|1|6|||TBR|VER|M||||||19
570.571.429|0|ML|36|145.80|270.00|1|1|6|||TBR|AZB|||||||19
570.571.430|0|ML|36|145.80|270.00|1|1|6|||TBR|DEN|||||||19
570.571.431|0|ML|36|145.80|270.00|1|1|6|||TBR|BLK|||||||19
570.571.432|0|ML|36|145.80|270.00|1|1|6|||TBR|ART|||||||19
570.571.433|0|ML|36|145.80|270.00|1|1|6|||TBR|LIN|||||||19
570.571.434|0|ML|36|145.80|270.00|1|1|6|||TBR|HAL|||||||19
570.571.435|0|ML|36|167.40|310.00|1|1|6|||BCO|BCO|B||||||19
570.571.436|0|ML|36|167.40|310.00|1|1|6|||BCO|BCO|M||||||19
570.571.437|0|ML|36|167.40|310.00|1|1|6|||CCL|CCL|B||||||19
570.571.438|0|ML|36|167.40|310.00|1|1|6|||CCL|CCL|M||||||19
570.571.439|0|ML|36|167.40|310.00|1|1|6|||CME|CME|B||||||19
570.571.440|0|ML|36|167.40|310.00|1|1|6|||CME|CME|M||||||19
570.571.441|0|ML|36|167.40|310.00|1|1|6|||ANT|ANT|B||||||19
570.571.442|0|ML|36|167.40|310.00|1|1|6|||ANT|ANT|M||||||19
570.571.443|0|ML|36|167.40|310.00|1|1|6|||PTO|PTO|B||||||19
570.571.444|0|ML|36|167.40|310.00|1|1|6|||PTO|PTO|M||||||19
570.571.445|0|ML|36|167.40|310.00|1|1|6|||CRE|CRE|B||||||19
570.571.446|0|ML|36|167.40|310.00|1|1|6|||CRE|CRE|M||||||19
570.571.447|0|ML|36|167.40|310.00|1|1|6|||CAM|CAM|B||||||19
570.571.448|0|ML|36|167.40|310.00|1|1|6|||CAM|CAM|M||||||19
570.571.449|0|ML|36|167.40|310.00|1|1|6|||OUR|OUR|B||||||19
570.571.450|0|ML|36|167.40|310.00|1|1|6|||OUR|OUR|M||||||19
570.571.451|0|ML|36|167.40|310.00|1|1|6|||COB|COB|B||||||19
570.571.452|0|ML|36|167.40|310.00|1|1|6|||COB|COB|M||||||19
570.571.453|0|ML|36|167.40|310.00|1|1|6|||CHO|CHO|B||||||19
570.571.454|0|ML|36|167.40|310.00|1|1|6|||CHO|CHO|M||||||19
570.571.455|0|ML|36|167.40|310.00|1|1|6|||VAG|VAG|B||||||19
570.571.456|0|ML|36|167.40|310.00|1|1|6|||VAG|VAG|M||||||19
570.571.457|0|ML|36|167.40|310.00|1|1|6|||AZE|AZE|B||||||19
570.571.458|0|ML|36|167.40|310.00|1|1|6|||AZE|AZE|M||||||19
570.571.459|0|ML|36|167.40|310.00|1|1|6|||AMA|AMA|B||||||19
570.571.460|0|ML|36|167.40|310.00|1|1|6|||AMA|AMA|M||||||19
570.571.461|0|ML|36|167.40|310.00|1|1|6|||AES|AES|B||||||19
570.571.462|0|ML|36|167.40|310.00|1|1|6|||AES|AES|M||||||19
570.571.463|0|ML|36|167.40|310.00|1|1|6|||PRA|PRA|B||||||19
570.571.464|0|ML|36|167.40|310.00|1|1|6|||PRA|PRA|M||||||19
570.571.465|0|ML|36|167.40|310.00|1|1|6|||ROS|ROS|B||||||19
570.571.466|0|ML|36|167.40|310.00|1|1|6|||ROS|ROS|M||||||19
570.571.467|0|ML|36|167.40|310.00|1|1|6|||VER|VER|B||||||19
570.571.468|0|ML|36|167.40|310.00|1|1|6|||VER|VER|M||||||19
570.571.469|0|ML|36|167.40|310.00|1|1|6|||AZB|AZB|||||||19
570.571.470|0|ML|36|167.40|310.00|1|1|6|||DEN|DEN|||||||19
570.571.471|0|ML|36|167.40|310.00|1|1|6|||BLK|BLK|||||||19
570.571.472|0|ML|36|167.40|310.00|1|1|6|||ART|ART|||||||19
570.571.473|0|ML|36|167.40|310.00|1|1|6|||LIN|LIN|||||||19
570.571.474|0|ML|36|167.40|310.00|1|1|6|||HAL|HAL|||||||19
570.571.475|0|ML|37|102.60|190.00|1|1|6|||TBR|TBR|||||||19
570.571.242|0|ML|37|102.60|190.00|1|1|6|||TEA|TEA|||||||19
570.571.243|0|ML|37|102.60|190.00|1|1|6|||OAK|OAK|||||||19
570.571.244|0|ML|37|102.60|190.00|1|1|6|||JOP|JOP|||||||19
570.571.476|0|ML|37|145.80|270.00|1|1|6|||TBR|BCO|B||||||19
570.571.477|0|ML|37|145.80|270.00|1|1|6|||TBR|BCO|M||||||19
570.571.478|0|ML|37|145.80|270.00|1|1|6|||TBR|CCL|B||||||19
570.571.479|0|ML|37|145.80|270.00|1|1|6|||TBR|CCL|M||||||19
570.571.480|0|ML|37|145.80|270.00|1|1|6|||TBR|CME|B||||||19
570.571.481|0|ML|37|145.80|270.00|1|1|6|||TBR|CME|M||||||19
570.571.482|0|ML|37|145.80|270.00|1|1|6|||TBR|ANT|B||||||19
570.571.483|0|ML|37|145.80|270.00|1|1|6|||TBR|ANT|M||||||19
570.571.484|0|ML|37|145.80|270.00|1|1|6|||TBR|PTO|B||||||19
570.571.485|0|ML|37|145.80|270.00|1|1|6|||TBR|PTO|M||||||19
570.571.486|0|ML|37|145.80|270.00|1|1|6|||TBR|CRE|B||||||19
570.571.487|0|ML|37|145.80|270.00|1|1|6|||TBR|CRE|M||||||19
570.571.488|0|ML|37|145.80|270.00|1|1|6|||TBR|CAM|B||||||19
570.571.489|0|ML|37|145.80|270.00|1|1|6|||TBR|CAM|M||||||19
570.571.490|0|ML|37|145.80|270.00|1|1|6|||TBR|OUR|B||||||19
570.571.491|0|ML|37|145.80|270.00|1|1|6|||TBR|OUR|M||||||19
570.571.492|0|ML|37|145.80|270.00|1|1|6|||TBR|COB|B||||||19
570.571.493|0|ML|37|145.80|270.00|1|1|6|||TBR|COB|M||||||19
570.571.494|0|ML|37|145.80|270.00|1|1|6|||TBR|CHO|B||||||19
570.571.495|0|ML|37|145.80|270.00|1|1|6|||TBR|CHO|M||||||19
570.571.496|0|ML|37|145.80|270.00|1|1|6|||TBR|VAG|B||||||19
570.571.497|0|ML|37|145.80|270.00|1|1|6|||TBR|VAG|M||||||19
570.571.498|0|ML|37|145.80|270.00|1|1|6|||TBR|AZE|B||||||19
570.571.499|0|ML|37|145.80|270.00|1|1|6|||TBR|AZE|M||||||19
570.571.500|0|ML|37|145.80|270.00|1|1|6|||TBR|AMA|B||||||19
570.571.501|0|ML|37|145.80|270.00|1|1|6|||TBR|AMA|M||||||19
570.571.502|0|ML|37|145.80|270.00|1|1|6|||TBR|AES|B||||||19
570.571.503|0|ML|37|145.80|270.00|1|1|6|||TBR|AES|M||||||19
570.571.504|0|ML|37|145.80|270.00|1|1|6|||TBR|PRA|B||||||19
570.571.505|0|ML|37|145.80|270.00|1|1|6|||TBR|PRA|M||||||19
570.571.506|0|ML|37|145.80|270.00|1|1|6|||TBR|ROS|B||||||19
570.571.507|0|ML|37|145.80|270.00|1|1|6|||TBR|ROS|M||||||19
570.571.508|0|ML|37|145.80|270.00|1|1|6|||TBR|VER|B||||||19
570.571.509|0|ML|37|145.80|270.00|1|1|6|||TBR|VER|M||||||19
570.571.510|0|ML|37|145.80|270.00|1|1|6|||TBR|AZB|||||||19
570.571.511|0|ML|37|145.80|270.00|1|1|6|||TBR|DEN|||||||19
570.571.512|0|ML|37|145.80|270.00|1|1|6|||TBR|BLK|||||||19
570.571.513|0|ML|37|145.80|270.00|1|1|6|||TBR|ART|||||||19
570.571.514|0|ML|37|145.80|270.00|1|1|6|||TBR|LIN|||||||19
570.571.515|0|ML|37|145.80|270.00|1|1|6|||TBR|HAL|||||||19
570.571.516|0|ML|37|167.40|310.00|1|1|6|||BCO|BCO|B||||||19
570.571.517|0|ML|37|167.40|310.00|1|1|6|||BCO|BCO|M||||||19
570.571.518|0|ML|37|167.40|310.00|1|1|6|||CCL|CCL|B||||||19
570.571.519|0|ML|37|167.40|310.00|1|1|6|||CCL|CCL|M||||||19
570.571.520|0|ML|37|167.40|310.00|1|1|6|||CME|CME|B||||||19
570.571.521|0|ML|37|167.40|310.00|1|1|6|||CME|CME|M||||||19
570.571.522|0|ML|37|167.40|310.00|1|1|6|||ANT|ANT|B||||||19
570.571.523|0|ML|37|167.40|310.00|1|1|6|||ANT|ANT|M||||||19
570.571.524|0|ML|37|167.40|310.00|1|1|6|||PTO|PTO|B||||||19
570.571.525|0|ML|37|167.40|310.00|1|1|6|||PTO|PTO|M||||||19
570.571.526|0|ML|37|167.40|310.00|1|1|6|||CRE|CRE|B||||||19
570.571.527|0|ML|37|167.40|310.00|1|1|6|||CRE|CRE|M||||||19
570.571.528|0|ML|37|167.40|310.00|1|1|6|||CAM|CAM|B||||||19
570.571.529|0|ML|37|167.40|310.00|1|1|6|||CAM|CAM|M||||||19
570.571.530|0|ML|37|167.40|310.00|1|1|6|||OUR|OUR|B||||||19
570.571.531|0|ML|37|167.40|310.00|1|1|6|||OUR|OUR|M||||||19
570.571.532|0|ML|37|167.40|310.00|1|1|6|||COB|COB|B||||||19
570.571.533|0|ML|37|167.40|310.00|1|1|6|||COB|COB|M||||||19
570.571.534|0|ML|37|167.40|310.00|1|1|6|||CHO|CHO|B||||||19
570.571.535|0|ML|37|167.40|310.00|1|1|6|||CHO|CHO|M||||||19
570.571.536|0|ML|37|167.40|310.00|1|1|6|||VAG|VAG|B||||||19
570.571.537|0|ML|37|167.40|310.00|1|1|6|||VAG|VAG|M||||||19
570.571.538|0|ML|37|167.40|310.00|1|1|6|||AZE|AZE|B||||||19
570.571.539|0|ML|37|167.40|310.00|1|1|6|||AZE|AZE|M||||||19
570.571.540|0|ML|37|167.40|310.00|1|1|6|||AMA|AMA|B||||||19
570.571.541|0|ML|37|167.40|310.00|1|1|6|||AMA|AMA|M||||||19
570.571.542|0|ML|37|167.40|310.00|1|1|6|||AES|AES|B||||||19
570.571.543|0|ML|37|167.40|310.00|1|1|6|||AES|AES|M||||||19
570.571.544|0|ML|37|167.40|310.00|1|1|6|||PRA|PRA|B||||||19
570.571.545|0|ML|37|167.40|310.00|1|1|6|||PRA|PRA|M||||||19
570.571.546|0|ML|37|167.40|310.00|1|1|6|||ROS|ROS|B||||||19
570.571.547|0|ML|37|167.40|310.00|1|1|6|||ROS|ROS|M||||||19
570.571.548|0|ML|37|167.40|310.00|1|1|6|||VER|VER|B||||||19
570.571.549|0|ML|37|167.40|310.00|1|1|6|||VER|VER|M||||||19
570.571.550|0|ML|37|167.40|310.00|1|1|6|||AZB|AZB|||||||19
570.571.551|0|ML|37|167.40|310.00|1|1|6|||DEN|DEN|||||||19
570.571.552|0|ML|37|167.40|310.00|1|1|6|||BLK|BLK|||||||19
570.571.553|0|ML|37|167.40|310.00|1|1|6|||ART|ART|||||||19
570.571.554|0|ML|37|167.40|310.00|1|1|6|||LIN|LIN|||||||19
570.571.555|0|ML|37|167.40|310.00|1|1|6|||HAL|HAL|||||||19
572.571.394|0|ML|36|108.00|200.00|1|1|6|||TBR|TBR|||||||15
572.571.198|0|ML|36|108.00|200.00|1|1|6|||TEA|TEA|||||||15
572.571.199|0|ML|36|108.00|200.00|1|1|6|||OAK|OAK|||||||15
572.571.200|0|ML|36|108.00|200.00|1|1|6|||JOP|JOP|||||||15
572.571.395|0|ML|36|151.20|280.00|1|1|6|||TBR|BCO|B||||||15
572.571.396|0|ML|36|151.20|280.00|1|1|6|||TBR|BCO|M||||||15
572.571.397|0|ML|36|151.20|280.00|1|1|6|||TBR|CCL|B||||||15
572.571.398|0|ML|36|151.20|280.00|1|1|6|||TBR|CCL|M||||||15
572.571.399|0|ML|36|151.20|280.00|1|1|6|||TBR|CME|B||||||15
572.571.400|0|ML|36|151.20|280.00|1|1|6|||TBR|CME|M||||||15
572.571.401|0|ML|36|151.20|280.00|1|1|6|||TBR|ANT|B||||||15
572.571.402|0|ML|36|151.20|280.00|1|1|6|||TBR|ANT|M||||||15
572.571.403|0|ML|36|151.20|280.00|1|1|6|||TBR|PTO|B||||||15
572.571.404|0|ML|36|151.20|280.00|1|1|6|||TBR|PTO|M||||||15
572.571.405|0|ML|36|151.20|280.00|1|1|6|||TBR|CRE|B||||||15
572.571.406|0|ML|36|151.20|280.00|1|1|6|||TBR|CRE|M||||||15
572.571.407|0|ML|36|151.20|280.00|1|1|6|||TBR|CAM|B||||||15
572.571.408|0|ML|36|151.20|280.00|1|1|6|||TBR|CAM|M||||||15
572.571.409|0|ML|36|151.20|280.00|1|1|6|||TBR|OUR|B||||||15
572.571.410|0|ML|36|151.20|280.00|1|1|6|||TBR|OUR|M||||||15
572.571.411|0|ML|36|151.20|280.00|1|1|6|||TBR|COB|B||||||15
572.571.412|0|ML|36|151.20|280.00|1|1|6|||TBR|COB|M||||||15
572.571.413|0|ML|36|151.20|280.00|1|1|6|||TBR|CHO|B||||||15
572.571.414|0|ML|36|151.20|280.00|1|1|6|||TBR|CHO|M||||||15
572.571.415|0|ML|36|151.20|280.00|1|1|6|||TBR|VAG|B||||||15
572.571.416|0|ML|36|151.20|280.00|1|1|6|||TBR|VAG|M||||||15
572.571.417|0|ML|36|151.20|280.00|1|1|6|||TBR|AZE|B||||||15
572.571.418|0|ML|36|151.20|280.00|1|1|6|||TBR|AZE|M||||||15
572.571.419|0|ML|36|151.20|280.00|1|1|6|||TBR|AMA|B||||||15
572.571.420|0|ML|36|151.20|280.00|1|1|6|||TBR|AMA|M||||||15
572.571.421|0|ML|36|151.20|280.00|1|1|6|||TBR|AES|B||||||15
572.571.422|0|ML|36|151.20|280.00|1|1|6|||TBR|AES|M||||||15
572.571.423|0|ML|36|151.20|280.00|1|1|6|||TBR|PRA|B||||||15
572.571.424|0|ML|36|151.20|280.00|1|1|6|||TBR|PRA|M||||||15
572.571.425|0|ML|36|151.20|280.00|1|1|6|||TBR|ROS|B||||||15
572.571.426|0|ML|36|151.20|280.00|1|1|6|||TBR|ROS|M||||||15
572.571.427|0|ML|36|151.20|280.00|1|1|6|||TBR|VER|B||||||15
572.571.428|0|ML|36|151.20|280.00|1|1|6|||TBR|VER|M||||||15
572.571.429|0|ML|36|151.20|280.00|1|1|6|||TBR|AZB|||||||15
572.571.430|0|ML|36|151.20|280.00|1|1|6|||TBR|DEN|||||||15
572.571.431|0|ML|36|151.20|280.00|1|1|6|||TBR|BLK|||||||15
572.571.432|0|ML|36|151.20|280.00|1|1|6|||TBR|ART|||||||15
572.571.433|0|ML|36|151.20|280.00|1|1|6|||TBR|LIN|||||||15
572.571.434|0|ML|36|151.20|280.00|1|1|6|||TBR|HAL|||||||15
572.571.435|0|ML|36|172.80|320.00|1|1|6|||BCO|BCO|B||||||15
572.571.436|0|ML|36|172.80|320.00|1|1|6|||BCO|BCO|M||||||15
572.571.437|0|ML|36|172.80|320.00|1|1|6|||CCL|CCL|B||||||15
572.571.438|0|ML|36|172.80|320.00|1|1|6|||CCL|CCL|M||||||15
572.571.439|0|ML|36|172.80|320.00|1|1|6|||CME|CME|B||||||15
572.571.440|0|ML|36|172.80|320.00|1|1|6|||CME|CME|M||||||15
572.571.441|0|ML|36|172.80|320.00|1|1|6|||ANT|ANT|B||||||15
572.571.442|0|ML|36|172.80|320.00|1|1|6|||ANT|ANT|M||||||15
572.571.443|0|ML|36|172.80|320.00|1|1|6|||PTO|PTO|B||||||15
572.571.444|0|ML|36|172.80|320.00|1|1|6|||PTO|PTO|M||||||15
572.571.445|0|ML|36|172.80|320.00|1|1|6|||CRE|CRE|B||||||15
572.571.446|0|ML|36|172.80|320.00|1|1|6|||CRE|CRE|M||||||15
572.571.447|0|ML|36|172.80|320.00|1|1|6|||CAM|CAM|B||||||15
572.571.448|0|ML|36|172.80|320.00|1|1|6|||CAM|CAM|M||||||15
572.571.449|0|ML|36|172.80|320.00|1|1|6|||OUR|OUR|B||||||15
572.571.450|0|ML|36|172.80|320.00|1|1|6|||OUR|OUR|M||||||15
572.571.451|0|ML|36|172.80|320.00|1|1|6|||COB|COB|B||||||15
572.571.452|0|ML|36|172.80|320.00|1|1|6|||COB|COB|M||||||15
572.571.453|0|ML|36|172.80|320.00|1|1|6|||CHO|CHO|B||||||15
572.571.454|0|ML|36|172.80|320.00|1|1|6|||CHO|CHO|M||||||15
572.571.455|0|ML|36|172.80|320.00|1|1|6|||VAG|VAG|B||||||15
572.571.456|0|ML|36|172.80|320.00|1|1|6|||VAG|VAG|M||||||15
572.571.457|0|ML|36|172.80|320.00|1|1|6|||AZE|AZE|B||||||15
572.571.458|0|ML|36|172.80|320.00|1|1|6|||AZE|AZE|M||||||15
572.571.459|0|ML|36|172.80|320.00|1|1|6|||AMA|AMA|B||||||15
572.571.460|0|ML|36|172.80|320.00|1|1|6|||AMA|AMA|M||||||15
572.571.461|0|ML|36|172.80|320.00|1|1|6|||AES|AES|B||||||15
572.571.462|0|ML|36|172.80|320.00|1|1|6|||AES|AES|M||||||15
572.571.463|0|ML|36|172.80|320.00|1|1|6|||PRA|PRA|B||||||15
572.571.464|0|ML|36|172.80|320.00|1|1|6|||PRA|PRA|M||||||15
572.571.465|0|ML|36|172.80|320.00|1|1|6|||ROS|ROS|B||||||15
572.571.466|0|ML|36|172.80|320.00|1|1|6|||ROS|ROS|M||||||15
572.571.467|0|ML|36|172.80|320.00|1|1|6|||VER|VER|B||||||15
572.571.468|0|ML|36|172.80|320.00|1|1|6|||VER|VER|M||||||15
572.571.469|0|ML|36|172.80|320.00|1|1|6|||AZB|AZB|||||||15
572.571.470|0|ML|36|172.80|320.00|1|1|6|||DEN|DEN|||||||15
572.571.471|0|ML|36|172.80|320.00|1|1|6|||BLK|BLK|||||||15
572.571.472|0|ML|36|172.80|320.00|1|1|6|||ART|ART|||||||15
572.571.473|0|ML|36|172.80|320.00|1|1|6|||LIN|LIN|||||||15
572.571.474|0|ML|36|172.80|320.00|1|1|6|||HAL|HAL|||||||15
572.571.475|0|ML|37|108.00|200.00|1|1|6|||TBR|TBR|||||||15
572.571.242|0|ML|37|108.00|200.00|1|1|6|||TEA|TEA|||||||15
572.571.243|0|ML|37|108.00|200.00|1|1|6|||OAK|OAK|||||||15
572.571.244|0|ML|37|108.00|200.00|1|1|6|||JOP|JOP|||||||15
572.571.476|0|ML|37|151.20|280.00|1|1|6|||TBR|BCO|B||||||15
572.571.477|0|ML|37|151.20|280.00|1|1|6|||TBR|BCO|M||||||15
572.571.478|0|ML|37|151.20|280.00|1|1|6|||TBR|CCL|B||||||15
572.571.479|0|ML|37|151.20|280.00|1|1|6|||TBR|CCL|M||||||15
572.571.480|0|ML|37|151.20|280.00|1|1|6|||TBR|CME|B||||||15
572.571.481|0|ML|37|151.20|280.00|1|1|6|||TBR|CME|M||||||15
572.571.482|0|ML|37|151.20|280.00|1|1|6|||TBR|ANT|B||||||15
572.571.483|0|ML|37|151.20|280.00|1|1|6|||TBR|ANT|M||||||15
572.571.484|0|ML|37|151.20|280.00|1|1|6|||TBR|PTO|B||||||15
572.571.485|0|ML|37|151.20|280.00|1|1|6|||TBR|PTO|M||||||15
572.571.486|0|ML|37|151.20|280.00|1|1|6|||TBR|CRE|B||||||15
572.571.487|0|ML|37|151.20|280.00|1|1|6|||TBR|CRE|M||||||15
572.571.488|0|ML|37|151.20|280.00|1|1|6|||TBR|CAM|B||||||15
572.571.489|0|ML|37|151.20|280.00|1|1|6|||TBR|CAM|M||||||15
572.571.490|0|ML|37|151.20|280.00|1|1|6|||TBR|OUR|B||||||15
572.571.491|0|ML|37|151.20|280.00|1|1|6|||TBR|OUR|M||||||15
572.571.492|0|ML|37|151.20|280.00|1|1|6|||TBR|COB|B||||||15
572.571.493|0|ML|37|151.20|280.00|1|1|6|||TBR|COB|M||||||15
572.571.494|0|ML|37|151.20|280.00|1|1|6|||TBR|CHO|B||||||15
572.571.495|0|ML|37|151.20|280.00|1|1|6|||TBR|CHO|M||||||15
572.571.496|0|ML|37|151.20|280.00|1|1|6|||TBR|VAG|B||||||15
572.571.497|0|ML|37|151.20|280.00|1|1|6|||TBR|VAG|M||||||15
572.571.498|0|ML|37|151.20|280.00|1|1|6|||TBR|AZE|B||||||15
572.571.499|0|ML|37|151.20|280.00|1|1|6|||TBR|AZE|M||||||15
572.571.500|0|ML|37|151.20|280.00|1|1|6|||TBR|AMA|B||||||15
572.571.501|0|ML|37|151.20|280.00|1|1|6|||TBR|AMA|M||||||15
572.571.502|0|ML|37|151.20|280.00|1|1|6|||TBR|AES|B||||||15
572.571.503|0|ML|37|151.20|280.00|1|1|6|||TBR|AES|M||||||15
572.571.504|0|ML|37|151.20|280.00|1|1|6|||TBR|PRA|B||||||15
572.571.505|0|ML|37|151.20|280.00|1|1|6|||TBR|PRA|M||||||15
572.571.506|0|ML|37|151.20|280.00|1|1|6|||TBR|ROS|B||||||15
572.571.507|0|ML|37|151.20|280.00|1|1|6|||TBR|ROS|M||||||15
572.571.508|0|ML|37|151.20|280.00|1|1|6|||TBR|VER|B||||||15
572.571.509|0|ML|37|151.20|280.00|1|1|6|||TBR|VER|M||||||15
572.571.510|0|ML|37|151.20|280.00|1|1|6|||TBR|AZB|||||||15
572.571.511|0|ML|37|151.20|280.00|1|1|6|||TBR|DEN|||||||15
572.571.512|0|ML|37|151.20|280.00|1|1|6|||TBR|BLK|||||||15
572.571.513|0|ML|37|151.20|280.00|1|1|6|||TBR|ART|||||||15
572.571.514|0|ML|37|151.20|280.00|1|1|6|||TBR|LIN|||||||15
572.571.515|0|ML|37|151.20|280.00|1|1|6|||TBR|HAL|||||||15
572.571.516|0|ML|37|172.80|320.00|1|1|6|||BCO|BCO|B||||||15
572.571.517|0|ML|37|172.80|320.00|1|1|6|||BCO|BCO|M||||||15
572.571.518|0|ML|37|172.80|320.00|1|1|6|||CCL|CCL|B||||||15
572.571.519|0|ML|37|172.80|320.00|1|1|6|||CCL|CCL|M||||||15
572.571.520|0|ML|37|172.80|320.00|1|1|6|||CME|CME|B||||||15
572.571.521|0|ML|37|172.80|320.00|1|1|6|||CME|CME|M||||||15
572.571.522|0|ML|37|172.80|320.00|1|1|6|||ANT|ANT|B||||||15
572.571.523|0|ML|37|172.80|320.00|1|1|6|||ANT|ANT|M||||||15
572.571.524|0|ML|37|172.80|320.00|1|1|6|||PTO|PTO|B||||||15
572.571.525|0|ML|37|172.80|320.00|1|1|6|||PTO|PTO|M||||||15
572.571.526|0|ML|37|172.80|320.00|1|1|6|||CRE|CRE|B||||||15
572.571.527|0|ML|37|172.80|320.00|1|1|6|||CRE|CRE|M||||||15
572.571.528|0|ML|37|172.80|320.00|1|1|6|||CAM|CAM|B||||||15
572.571.529|0|ML|37|172.80|320.00|1|1|6|||CAM|CAM|M||||||15
572.571.530|0|ML|37|172.80|320.00|1|1|6|||OUR|OUR|B||||||15
572.571.531|0|ML|37|172.80|320.00|1|1|6|||OUR|OUR|M||||||15
572.571.532|0|ML|37|172.80|320.00|1|1|6|||COB|COB|B||||||15
572.571.533|0|ML|37|172.80|320.00|1|1|6|||COB|COB|M||||||15
572.571.534|0|ML|37|172.80|320.00|1|1|6|||CHO|CHO|B||||||15
572.571.535|0|ML|37|172.80|320.00|1|1|6|||CHO|CHO|M||||||15
572.571.536|0|ML|37|172.80|320.00|1|1|6|||VAG|VAG|B||||||15
572.571.537|0|ML|37|172.80|320.00|1|1|6|||VAG|VAG|M||||||15
572.571.538|0|ML|37|172.80|320.00|1|1|6|||AZE|AZE|B||||||15
572.571.539|0|ML|37|172.80|320.00|1|1|6|||AZE|AZE|M||||||15
572.571.540|0|ML|37|172.80|320.00|1|1|6|||AMA|AMA|B||||||15
572.571.541|0|ML|37|172.80|320.00|1|1|6|||AMA|AMA|M||||||15
572.571.542|0|ML|37|172.80|320.00|1|1|6|||AES|AES|B||||||15
572.571.543|0|ML|37|172.80|320.00|1|1|6|||AES|AES|M||||||15
572.571.544|0|ML|37|172.80|320.00|1|1|6|||PRA|PRA|B||||||15
572.571.545|0|ML|37|172.80|320.00|1|1|6|||PRA|PRA|M||||||15
572.571.546|0|ML|37|172.80|320.00|1|1|6|||ROS|ROS|B||||||15
572.571.547|0|ML|37|172.80|320.00|1|1|6|||ROS|ROS|M||||||15
572.571.548|0|ML|37|172.80|320.00|1|1|6|||VER|VER|B||||||15
572.571.549|0|ML|37|172.80|320.00|1|1|6|||VER|VER|M||||||15
572.571.550|0|ML|37|172.80|320.00|1|1|6|||AZB|AZB|||||||15
572.571.551|0|ML|37|172.80|320.00|1|1|6|||DEN|DEN|||||||15
572.571.552|0|ML|37|172.80|320.00|1|1|6|||BLK|BLK|||||||15
572.571.553|0|ML|37|172.80|320.00|1|1|6|||ART|ART|||||||15
572.571.554|0|ML|37|172.80|320.00|1|1|6|||LIN|LIN|||||||15
572.571.555|0|ML|37|172.80|320.00|1|1|6|||HAL|HAL|||||||15
573.571.394|0|ML|36|151.20|280.00|1|1|6|||TBR|TBR|||||||16
573.571.198|0|ML|36|151.20|280.00|1|1|6|||TEA|TEA|||||||16
573.571.199|0|ML|36|151.20|280.00|1|1|6|||OAK|OAK|||||||16
573.571.200|0|ML|36|151.20|280.00|1|1|6|||JOP|JOP|||||||16
573.571.395|0|ML|36|194.40|360.00|1|1|6|||TBR|BCO|B||||||16
573.571.396|0|ML|36|194.40|360.00|1|1|6|||TBR|BCO|M||||||16
573.571.397|0|ML|36|194.40|360.00|1|1|6|||TBR|CCL|B||||||16
573.571.398|0|ML|36|194.40|360.00|1|1|6|||TBR|CCL|M||||||16
573.571.399|0|ML|36|194.40|360.00|1|1|6|||TBR|CME|B||||||16
573.571.400|0|ML|36|194.40|360.00|1|1|6|||TBR|CME|M||||||16
573.571.401|0|ML|36|194.40|360.00|1|1|6|||TBR|ANT|B||||||16
573.571.402|0|ML|36|194.40|360.00|1|1|6|||TBR|ANT|M||||||16
573.571.403|0|ML|36|194.40|360.00|1|1|6|||TBR|PTO|B||||||16
573.571.404|0|ML|36|194.40|360.00|1|1|6|||TBR|PTO|M||||||16
573.571.405|0|ML|36|194.40|360.00|1|1|6|||TBR|CRE|B||||||16
573.571.406|0|ML|36|194.40|360.00|1|1|6|||TBR|CRE|M||||||16
573.571.407|0|ML|36|194.40|360.00|1|1|6|||TBR|CAM|B||||||16
573.571.408|0|ML|36|194.40|360.00|1|1|6|||TBR|CAM|M||||||16
573.571.409|0|ML|36|194.40|360.00|1|1|6|||TBR|OUR|B||||||16
573.571.410|0|ML|36|194.40|360.00|1|1|6|||TBR|OUR|M||||||16
573.571.411|0|ML|36|194.40|360.00|1|1|6|||TBR|COB|B||||||16
573.571.412|0|ML|36|194.40|360.00|1|1|6|||TBR|COB|M||||||16
573.571.413|0|ML|36|194.40|360.00|1|1|6|||TBR|CHO|B||||||16
573.571.414|0|ML|36|194.40|360.00|1|1|6|||TBR|CHO|M||||||16
573.571.415|0|ML|36|194.40|360.00|1|1|6|||TBR|VAG|B||||||16
573.571.416|0|ML|36|194.40|360.00|1|1|6|||TBR|VAG|M||||||16
573.571.417|0|ML|36|194.40|360.00|1|1|6|||TBR|AZE|B||||||16
573.571.418|0|ML|36|194.40|360.00|1|1|6|||TBR|AZE|M||||||16
573.571.419|0|ML|36|194.40|360.00|1|1|6|||TBR|AMA|B||||||16
573.571.420|0|ML|36|194.40|360.00|1|1|6|||TBR|AMA|M||||||16
573.571.421|0|ML|36|194.40|360.00|1|1|6|||TBR|AES|B||||||16
573.571.422|0|ML|36|194.40|360.00|1|1|6|||TBR|AES|M||||||16
573.571.423|0|ML|36|194.40|360.00|1|1|6|||TBR|PRA|B||||||16
573.571.424|0|ML|36|194.40|360.00|1|1|6|||TBR|PRA|M||||||16
573.571.425|0|ML|36|194.40|360.00|1|1|6|||TBR|ROS|B||||||16
573.571.426|0|ML|36|194.40|360.00|1|1|6|||TBR|ROS|M||||||16
573.571.427|0|ML|36|194.40|360.00|1|1|6|||TBR|VER|B||||||16
573.571.428|0|ML|36|194.40|360.00|1|1|6|||TBR|VER|M||||||16
573.571.429|0|ML|36|194.40|360.00|1|1|6|||TBR|AZB|||||||16
573.571.430|0|ML|36|194.40|360.00|1|1|6|||TBR|DEN|||||||16
573.571.431|0|ML|36|194.40|360.00|1|1|6|||TBR|BLK|||||||16
573.571.432|0|ML|36|194.40|360.00|1|1|6|||TBR|ART|||||||16
573.571.433|0|ML|36|194.40|360.00|1|1|6|||TBR|LIN|||||||16
573.571.434|0|ML|36|194.40|360.00|1|1|6|||TBR|HAL|||||||16
573.571.435|0|ML|36|216.00|400.00|1|1|6|||BCO|BCO|B||||||16
573.571.436|0|ML|36|216.00|400.00|1|1|6|||BCO|BCO|M||||||16
573.571.437|0|ML|36|216.00|400.00|1|1|6|||CCL|CCL|B||||||16
573.571.438|0|ML|36|216.00|400.00|1|1|6|||CCL|CCL|M||||||16
573.571.439|0|ML|36|216.00|400.00|1|1|6|||CME|CME|B||||||16
573.571.440|0|ML|36|216.00|400.00|1|1|6|||CME|CME|M||||||16
573.571.441|0|ML|36|216.00|400.00|1|1|6|||ANT|ANT|B||||||16
573.571.442|0|ML|36|216.00|400.00|1|1|6|||ANT|ANT|M||||||16
573.571.443|0|ML|36|216.00|400.00|1|1|6|||PTO|PTO|B||||||16
573.571.444|0|ML|36|216.00|400.00|1|1|6|||PTO|PTO|M||||||16
573.571.445|0|ML|36|216.00|400.00|1|1|6|||CRE|CRE|B||||||16
573.571.446|0|ML|36|216.00|400.00|1|1|6|||CRE|CRE|M||||||16
573.571.447|0|ML|36|216.00|400.00|1|1|6|||CAM|CAM|B||||||16
573.571.448|0|ML|36|216.00|400.00|1|1|6|||CAM|CAM|M||||||16
573.571.449|0|ML|36|216.00|400.00|1|1|6|||OUR|OUR|B||||||16
573.571.450|0|ML|36|216.00|400.00|1|1|6|||OUR|OUR|M||||||16
573.571.451|0|ML|36|216.00|400.00|1|1|6|||COB|COB|B||||||16
573.571.452|0|ML|36|216.00|400.00|1|1|6|||COB|COB|M||||||16
573.571.453|0|ML|36|216.00|400.00|1|1|6|||CHO|CHO|B||||||16
573.571.454|0|ML|36|216.00|400.00|1|1|6|||CHO|CHO|M||||||16
573.571.455|0|ML|36|216.00|400.00|1|1|6|||VAG|VAG|B||||||16
573.571.456|0|ML|36|216.00|400.00|1|1|6|||VAG|VAG|M||||||16
573.571.457|0|ML|36|216.00|400.00|1|1|6|||AZE|AZE|B||||||16
573.571.458|0|ML|36|216.00|400.00|1|1|6|||AZE|AZE|M||||||16
573.571.459|0|ML|36|216.00|400.00|1|1|6|||AMA|AMA|B||||||16
573.571.460|0|ML|36|216.00|400.00|1|1|6|||AMA|AMA|M||||||16
573.571.461|0|ML|36|216.00|400.00|1|1|6|||AES|AES|B||||||16
573.571.462|0|ML|36|216.00|400.00|1|1|6|||AES|AES|M||||||16
573.571.463|0|ML|36|216.00|400.00|1|1|6|||PRA|PRA|B||||||16
573.571.464|0|ML|36|216.00|400.00|1|1|6|||PRA|PRA|M||||||16
573.571.465|0|ML|36|216.00|400.00|1|1|6|||ROS|ROS|B||||||16
573.571.466|0|ML|36|216.00|400.00|1|1|6|||ROS|ROS|M||||||16
573.571.467|0|ML|36|216.00|400.00|1|1|6|||VER|VER|B||||||16
573.571.468|0|ML|36|216.00|400.00|1|1|6|||VER|VER|M||||||16
573.571.469|0|ML|36|216.00|400.00|1|1|6|||AZB|AZB|||||||16
573.571.470|0|ML|36|216.00|400.00|1|1|6|||DEN|DEN|||||||16
573.571.471|0|ML|36|216.00|400.00|1|1|6|||BLK|BLK|||||||16
573.571.472|0|ML|36|216.00|400.00|1|1|6|||ART|ART|||||||16
573.571.473|0|ML|36|216.00|400.00|1|1|6|||LIN|LIN|||||||16
573.571.474|0|ML|36|216.00|400.00|1|1|6|||HAL|HAL|||||||16
573.571.475|0|ML|37|151.20|280.00|1|1|6|||TBR|TBR|||||||16
573.571.242|0|ML|37|151.20|280.00|1|1|6|||TEA|TEA|||||||16
573.571.243|0|ML|37|151.20|280.00|1|1|6|||OAK|OAK|||||||16
573.571.244|0|ML|37|151.20|280.00|1|1|6|||JOP|JOP|||||||16
573.571.476|0|ML|37|194.40|360.00|1|1|6|||TBR|BCO|B||||||16
573.571.477|0|ML|37|194.40|360.00|1|1|6|||TBR|BCO|M||||||16
573.571.478|0|ML|37|194.40|360.00|1|1|6|||TBR|CCL|B||||||16
573.571.479|0|ML|37|194.40|360.00|1|1|6|||TBR|CCL|M||||||16
573.571.480|0|ML|37|194.40|360.00|1|1|6|||TBR|CME|B||||||16
573.571.481|0|ML|37|194.40|360.00|1|1|6|||TBR|CME|M||||||16
573.571.482|0|ML|37|194.40|360.00|1|1|6|||TBR|ANT|B||||||16
573.571.483|0|ML|37|194.40|360.00|1|1|6|||TBR|ANT|M||||||16
573.571.484|0|ML|37|194.40|360.00|1|1|6|||TBR|PTO|B||||||16
573.571.485|0|ML|37|194.40|360.00|1|1|6|||TBR|PTO|M||||||16
573.571.486|0|ML|37|194.40|360.00|1|1|6|||TBR|CRE|B||||||16
573.571.487|0|ML|37|194.40|360.00|1|1|6|||TBR|CRE|M||||||16
573.571.488|0|ML|37|194.40|360.00|1|1|6|||TBR|CAM|B||||||16
573.571.489|0|ML|37|194.40|360.00|1|1|6|||TBR|CAM|M||||||16
573.571.490|0|ML|37|194.40|360.00|1|1|6|||TBR|OUR|B||||||16
573.571.491|0|ML|37|194.40|360.00|1|1|6|||TBR|OUR|M||||||16
573.571.492|0|ML|37|194.40|360.00|1|1|6|||TBR|COB|B||||||16
573.571.493|0|ML|37|194.40|360.00|1|1|6|||TBR|COB|M||||||16
573.571.494|0|ML|37|194.40|360.00|1|1|6|||TBR|CHO|B||||||16
573.571.495|0|ML|37|194.40|360.00|1|1|6|||TBR|CHO|M||||||16
573.571.496|0|ML|37|194.40|360.00|1|1|6|||TBR|VAG|B||||||16
573.571.497|0|ML|37|194.40|360.00|1|1|6|||TBR|VAG|M||||||16
573.571.498|0|ML|37|194.40|360.00|1|1|6|||TBR|AZE|B||||||16
573.571.499|0|ML|37|194.40|360.00|1|1|6|||TBR|AZE|M||||||16
573.571.500|0|ML|37|194.40|360.00|1|1|6|||TBR|AMA|B||||||16
573.571.501|0|ML|37|194.40|360.00|1|1|6|||TBR|AMA|M||||||16
573.571.502|0|ML|37|194.40|360.00|1|1|6|||TBR|AES|B||||||16
573.571.503|0|ML|37|194.40|360.00|1|1|6|||TBR|AES|M||||||16
573.571.504|0|ML|37|194.40|360.00|1|1|6|||TBR|PRA|B||||||16
573.571.505|0|ML|37|194.40|360.00|1|1|6|||TBR|PRA|M||||||16
573.571.506|0|ML|37|194.40|360.00|1|1|6|||TBR|ROS|B||||||16
573.571.507|0|ML|37|194.40|360.00|1|1|6|||TBR|ROS|M||||||16
573.571.508|0|ML|37|194.40|360.00|1|1|6|||TBR|VER|B||||||16
573.571.509|0|ML|37|194.40|360.00|1|1|6|||TBR|VER|M||||||16
573.571.510|0|ML|37|194.40|360.00|1|1|6|||TBR|AZB|||||||16
573.571.511|0|ML|37|194.40|360.00|1|1|6|||TBR|DEN|||||||16
573.571.512|0|ML|37|194.40|360.00|1|1|6|||TBR|BLK|||||||16
573.571.513|0|ML|37|194.40|360.00|1|1|6|||TBR|ART|||||||16
573.571.514|0|ML|37|194.40|360.00|1|1|6|||TBR|LIN|||||||16
573.571.515|0|ML|37|194.40|360.00|1|1|6|||TBR|HAL|||||||16
573.571.516|0|ML|37|216.00|400.00|1|1|6|||BCO|BCO|B||||||16
573.571.517|0|ML|37|216.00|400.00|1|1|6|||BCO|BCO|M||||||16
573.571.518|0|ML|37|216.00|400.00|1|1|6|||CCL|CCL|B||||||16
573.571.519|0|ML|37|216.00|400.00|1|1|6|||CCL|CCL|M||||||16
573.571.520|0|ML|37|216.00|400.00|1|1|6|||CME|CME|B||||||16
573.571.521|0|ML|37|216.00|400.00|1|1|6|||CME|CME|M||||||16
573.571.522|0|ML|37|216.00|400.00|1|1|6|||ANT|ANT|B||||||16
573.571.523|0|ML|37|216.00|400.00|1|1|6|||ANT|ANT|M||||||16
573.571.524|0|ML|37|216.00|400.00|1|1|6|||PTO|PTO|B||||||16
573.571.525|0|ML|37|216.00|400.00|1|1|6|||PTO|PTO|M||||||16
573.571.526|0|ML|37|216.00|400.00|1|1|6|||CRE|CRE|B||||||16
573.571.527|0|ML|37|216.00|400.00|1|1|6|||CRE|CRE|M||||||16
573.571.528|0|ML|37|216.00|400.00|1|1|6|||CAM|CAM|B||||||16
573.571.529|0|ML|37|216.00|400.00|1|1|6|||CAM|CAM|M||||||16
573.571.530|0|ML|37|216.00|400.00|1|1|6|||OUR|OUR|B||||||16
573.571.531|0|ML|37|216.00|400.00|1|1|6|||OUR|OUR|M||||||16
573.571.532|0|ML|37|216.00|400.00|1|1|6|||COB|COB|B||||||16
573.571.533|0|ML|37|216.00|400.00|1|1|6|||COB|COB|M||||||16
573.571.534|0|ML|37|216.00|400.00|1|1|6|||CHO|CHO|B||||||16
573.571.535|0|ML|37|216.00|400.00|1|1|6|||CHO|CHO|M||||||16
573.571.536|0|ML|37|216.00|400.00|1|1|6|||VAG|VAG|B||||||16
573.571.537|0|ML|37|216.00|400.00|1|1|6|||VAG|VAG|M||||||16
573.571.538|0|ML|37|216.00|400.00|1|1|6|||AZE|AZE|B||||||16
573.571.539|0|ML|37|216.00|400.00|1|1|6|||AZE|AZE|M||||||16
573.571.540|0|ML|37|216.00|400.00|1|1|6|||AMA|AMA|B||||||16
573.571.541|0|ML|37|216.00|400.00|1|1|6|||AMA|AMA|M||||||16
573.571.542|0|ML|37|216.00|400.00|1|1|6|||AES|AES|B||||||16
573.571.543|0|ML|37|216.00|400.00|1|1|6|||AES|AES|M||||||16
573.571.544|0|ML|37|216.00|400.00|1|1|6|||PRA|PRA|B||||||16
573.571.545|0|ML|37|216.00|400.00|1|1|6|||PRA|PRA|M||||||16
573.571.546|0|ML|37|216.00|400.00|1|1|6|||ROS|ROS|B||||||16
573.571.547|0|ML|37|216.00|400.00|1|1|6|||ROS|ROS|M||||||16
573.571.548|0|ML|37|216.00|400.00|1|1|6|||VER|VER|B||||||16
573.571.549|0|ML|37|216.00|400.00|1|1|6|||VER|VER|M||||||16
573.571.550|0|ML|37|216.00|400.00|1|1|6|||AZB|AZB|||||||16
573.571.551|0|ML|37|216.00|400.00|1|1|6|||DEN|DEN|||||||16
573.571.552|0|ML|37|216.00|400.00|1|1|6|||BLK|BLK|||||||16
573.571.553|0|ML|37|216.00|400.00|1|1|6|||ART|ART|||||||16
573.571.554|0|ML|37|216.00|400.00|1|1|6|||LIN|LIN|||||||16
573.571.555|0|ML|37|216.00|400.00|1|1|6|||HAL|HAL|||||||16
574.575.394|0|ML|38|205.20|380.00|1|1|6|||TBR|TBR|||||||17
574.575.198|0|ML|38|205.20|380.00|1|1|6|||TEA|TEA|||||||17
574.575.199|0|ML|38|205.20|380.00|1|1|6|||OAK|OAK|||||||17
574.575.200|0|ML|38|205.20|380.00|1|1|6|||JOP|JOP|||||||17
574.575.395|0|ML|38|248.40|460.00|1|1|6|||TBR|BCO|B||||||17
574.575.396|0|ML|38|248.40|460.00|1|1|6|||TBR|BCO|M||||||17
574.575.397|0|ML|38|248.40|460.00|1|1|6|||TBR|CCL|B||||||17
574.575.398|0|ML|38|248.40|460.00|1|1|6|||TBR|CCL|M||||||17
574.575.399|0|ML|38|248.40|460.00|1|1|6|||TBR|CME|B||||||17
574.575.400|0|ML|38|248.40|460.00|1|1|6|||TBR|CME|M||||||17
574.575.401|0|ML|38|248.40|460.00|1|1|6|||TBR|ANT|B||||||17
574.575.402|0|ML|38|248.40|460.00|1|1|6|||TBR|ANT|M||||||17
574.575.403|0|ML|38|248.40|460.00|1|1|6|||TBR|PTO|B||||||17
574.575.404|0|ML|38|248.40|460.00|1|1|6|||TBR|PTO|M||||||17
574.575.405|0|ML|38|248.40|460.00|1|1|6|||TBR|CRE|B||||||17
574.575.406|0|ML|38|248.40|460.00|1|1|6|||TBR|CRE|M||||||17
574.575.407|0|ML|38|248.40|460.00|1|1|6|||TBR|CAM|B||||||17
574.575.408|0|ML|38|248.40|460.00|1|1|6|||TBR|CAM|M||||||17
574.575.409|0|ML|38|248.40|460.00|1|1|6|||TBR|OUR|B||||||17
574.575.410|0|ML|38|248.40|460.00|1|1|6|||TBR|OUR|M||||||17
574.575.411|0|ML|38|248.40|460.00|1|1|6|||TBR|COB|B||||||17
574.575.412|0|ML|38|248.40|460.00|1|1|6|||TBR|COB|M||||||17
574.575.413|0|ML|38|248.40|460.00|1|1|6|||TBR|CHO|B||||||17
574.575.414|0|ML|38|248.40|460.00|1|1|6|||TBR|CHO|M||||||17
574.575.415|0|ML|38|248.40|460.00|1|1|6|||TBR|VAG|B||||||17
574.575.416|0|ML|38|248.40|460.00|1|1|6|||TBR|VAG|M||||||17
574.575.417|0|ML|38|248.40|460.00|1|1|6|||TBR|AZE|B||||||17
574.575.418|0|ML|38|248.40|460.00|1|1|6|||TBR|AZE|M||||||17
574.575.419|0|ML|38|248.40|460.00|1|1|6|||TBR|AMA|B||||||17
574.575.420|0|ML|38|248.40|460.00|1|1|6|||TBR|AMA|M||||||17
574.575.421|0|ML|38|248.40|460.00|1|1|6|||TBR|AES|B||||||17
574.575.422|0|ML|38|248.40|460.00|1|1|6|||TBR|AES|M||||||17
574.575.423|0|ML|38|248.40|460.00|1|1|6|||TBR|PRA|B||||||17
574.575.424|0|ML|38|248.40|460.00|1|1|6|||TBR|PRA|M||||||17
574.575.425|0|ML|38|248.40|460.00|1|1|6|||TBR|ROS|B||||||17
574.575.426|0|ML|38|248.40|460.00|1|1|6|||TBR|ROS|M||||||17
574.575.427|0|ML|38|248.40|460.00|1|1|6|||TBR|VER|B||||||17
574.575.428|0|ML|38|248.40|460.00|1|1|6|||TBR|VER|M||||||17
574.575.429|0|ML|38|248.40|460.00|1|1|6|||TBR|AZB|||||||17
574.575.430|0|ML|38|248.40|460.00|1|1|6|||TBR|DEN|||||||17
574.575.431|0|ML|38|248.40|460.00|1|1|6|||TBR|BLK|||||||17
574.575.432|0|ML|38|248.40|460.00|1|1|6|||TBR|ART|||||||17
574.575.433|0|ML|38|248.40|460.00|1|1|6|||TBR|LIN|||||||17
574.575.434|0|ML|38|248.40|460.00|1|1|6|||TBR|HAL|||||||17
574.575.435|0|ML|38|270.00|500.00|1|1|6|||BCO|BCO|B||||||17
574.575.436|0|ML|38|270.00|500.00|1|1|6|||BCO|BCO|M||||||17
574.575.437|0|ML|38|270.00|500.00|1|1|6|||CCL|CCL|B||||||17
574.575.438|0|ML|38|270.00|500.00|1|1|6|||CCL|CCL|M||||||17
574.575.439|0|ML|38|270.00|500.00|1|1|6|||CME|CME|B||||||17
574.575.440|0|ML|38|270.00|500.00|1|1|6|||CME|CME|M||||||17
574.575.441|0|ML|38|270.00|500.00|1|1|6|||ANT|ANT|B||||||17
574.575.442|0|ML|38|270.00|500.00|1|1|6|||ANT|ANT|M||||||17
574.575.443|0|ML|38|270.00|500.00|1|1|6|||PTO|PTO|B||||||17
574.575.444|0|ML|38|270.00|500.00|1|1|6|||PTO|PTO|M||||||17
574.575.445|0|ML|38|270.00|500.00|1|1|6|||CRE|CRE|B||||||17
574.575.446|0|ML|38|270.00|500.00|1|1|6|||CRE|CRE|M||||||17
574.575.447|0|ML|38|270.00|500.00|1|1|6|||CAM|CAM|B||||||17
574.575.448|0|ML|38|270.00|500.00|1|1|6|||CAM|CAM|M||||||17
574.575.449|0|ML|38|270.00|500.00|1|1|6|||OUR|OUR|B||||||17
574.575.450|0|ML|38|270.00|500.00|1|1|6|||OUR|OUR|M||||||17
574.575.451|0|ML|38|270.00|500.00|1|1|6|||COB|COB|B||||||17
574.575.452|0|ML|38|270.00|500.00|1|1|6|||COB|COB|M||||||17
574.575.453|0|ML|38|270.00|500.00|1|1|6|||CHO|CHO|B||||||17
574.575.454|0|ML|38|270.00|500.00|1|1|6|||CHO|CHO|M||||||17
574.575.455|0|ML|38|270.00|500.00|1|1|6|||VAG|VAG|B||||||17
574.575.456|0|ML|38|270.00|500.00|1|1|6|||VAG|VAG|M||||||17
574.575.457|0|ML|38|270.00|500.00|1|1|6|||AZE|AZE|B||||||17
574.575.458|0|ML|38|270.00|500.00|1|1|6|||AZE|AZE|M||||||17
574.575.459|0|ML|38|270.00|500.00|1|1|6|||AMA|AMA|B||||||17
574.575.460|0|ML|38|270.00|500.00|1|1|6|||AMA|AMA|M||||||17
574.575.461|0|ML|38|270.00|500.00|1|1|6|||AES|AES|B||||||17
574.575.462|0|ML|38|270.00|500.00|1|1|6|||AES|AES|M||||||17
574.575.463|0|ML|38|270.00|500.00|1|1|6|||PRA|PRA|B||||||17
574.575.464|0|ML|38|270.00|500.00|1|1|6|||PRA|PRA|M||||||17
574.575.465|0|ML|38|270.00|500.00|1|1|6|||ROS|ROS|B||||||17
574.575.466|0|ML|38|270.00|500.00|1|1|6|||ROS|ROS|M||||||17
574.575.467|0|ML|38|270.00|500.00|1|1|6|||VER|VER|B||||||17
574.575.468|0|ML|38|270.00|500.00|1|1|6|||VER|VER|M||||||17
574.575.469|0|ML|38|270.00|500.00|1|1|6|||AZB|AZB|||||||17
574.575.470|0|ML|38|270.00|500.00|1|1|6|||DEN|DEN|||||||17
574.575.471|0|ML|38|270.00|500.00|1|1|6|||BLK|BLK|||||||17
574.575.472|0|ML|38|270.00|500.00|1|1|6|||ART|ART|||||||17
574.575.473|0|ML|38|270.00|500.00|1|1|6|||LIN|LIN|||||||17
574.575.474|0|ML|38|270.00|500.00|1|1|6|||HAL|HAL|||||||17
574.575.475|0|ML|39|205.20|380.00|1|1|6|||TBR|TBR|||||||17
574.575.242|0|ML|39|205.20|380.00|1|1|6|||TEA|TEA|||||||17
574.575.243|0|ML|39|205.20|380.00|1|1|6|||OAK|OAK|||||||17
574.575.244|0|ML|39|205.20|380.00|1|1|6|||JOP|JOP|||||||17
574.575.476|0|ML|39|248.40|460.00|1|1|6|||TBR|BCO|B||||||17
574.575.477|0|ML|39|248.40|460.00|1|1|6|||TBR|BCO|M||||||17
574.575.478|0|ML|39|248.40|460.00|1|1|6|||TBR|CCL|B||||||17
574.575.479|0|ML|39|248.40|460.00|1|1|6|||TBR|CCL|M||||||17
574.575.480|0|ML|39|248.40|460.00|1|1|6|||TBR|CME|B||||||17
574.575.481|0|ML|39|248.40|460.00|1|1|6|||TBR|CME|M||||||17
574.575.482|0|ML|39|248.40|460.00|1|1|6|||TBR|ANT|B||||||17
574.575.483|0|ML|39|248.40|460.00|1|1|6|||TBR|ANT|M||||||17
574.575.484|0|ML|39|248.40|460.00|1|1|6|||TBR|PTO|B||||||17
574.575.485|0|ML|39|248.40|460.00|1|1|6|||TBR|PTO|M||||||17
574.575.486|0|ML|39|248.40|460.00|1|1|6|||TBR|CRE|B||||||17
574.575.487|0|ML|39|248.40|460.00|1|1|6|||TBR|CRE|M||||||17
574.575.488|0|ML|39|248.40|460.00|1|1|6|||TBR|CAM|B||||||17
574.575.489|0|ML|39|248.40|460.00|1|1|6|||TBR|CAM|M||||||17
574.575.490|0|ML|39|248.40|460.00|1|1|6|||TBR|OUR|B||||||17
574.575.491|0|ML|39|248.40|460.00|1|1|6|||TBR|OUR|M||||||17
574.575.492|0|ML|39|248.40|460.00|1|1|6|||TBR|COB|B||||||17
574.575.493|0|ML|39|248.40|460.00|1|1|6|||TBR|COB|M||||||17
574.575.494|0|ML|39|248.40|460.00|1|1|6|||TBR|CHO|B||||||17
574.575.495|0|ML|39|248.40|460.00|1|1|6|||TBR|CHO|M||||||17
574.575.496|0|ML|39|248.40|460.00|1|1|6|||TBR|VAG|B||||||17
574.575.497|0|ML|39|248.40|460.00|1|1|6|||TBR|VAG|M||||||17
574.575.498|0|ML|39|248.40|460.00|1|1|6|||TBR|AZE|B||||||17
574.575.499|0|ML|39|248.40|460.00|1|1|6|||TBR|AZE|M||||||17
574.575.500|0|ML|39|248.40|460.00|1|1|6|||TBR|AMA|B||||||17
574.575.501|0|ML|39|248.40|460.00|1|1|6|||TBR|AMA|M||||||17
574.575.502|0|ML|39|248.40|460.00|1|1|6|||TBR|AES|B||||||17
574.575.503|0|ML|39|248.40|460.00|1|1|6|||TBR|AES|M||||||17
574.575.504|0|ML|39|248.40|460.00|1|1|6|||TBR|PRA|B||||||17
574.575.505|0|ML|39|248.40|460.00|1|1|6|||TBR|PRA|M||||||17
574.575.506|0|ML|39|248.40|460.00|1|1|6|||TBR|ROS|B||||||17
574.575.507|0|ML|39|248.40|460.00|1|1|6|||TBR|ROS|M||||||17
574.575.508|0|ML|39|248.40|460.00|1|1|6|||TBR|VER|B||||||17
574.575.509|0|ML|39|248.40|460.00|1|1|6|||TBR|VER|M||||||17
574.575.510|0|ML|39|248.40|460.00|1|1|6|||TBR|AZB|||||||17
574.575.511|0|ML|39|248.40|460.00|1|1|6|||TBR|DEN|||||||17
574.575.512|0|ML|39|248.40|460.00|1|1|6|||TBR|BLK|||||||17
574.575.513|0|ML|39|248.40|460.00|1|1|6|||TBR|ART|||||||17
574.575.514|0|ML|39|248.40|460.00|1|1|6|||TBR|LIN|||||||17
574.575.515|0|ML|39|248.40|460.00|1|1|6|||TBR|HAL|||||||17
574.575.516|0|ML|39|270.00|500.00|1|1|6|||BCO|BCO|B||||||17
574.575.517|0|ML|39|270.00|500.00|1|1|6|||BCO|BCO|M||||||17
574.575.518|0|ML|39|270.00|500.00|1|1|6|||CCL|CCL|B||||||17
574.575.519|0|ML|39|270.00|500.00|1|1|6|||CCL|CCL|M||||||17
574.575.520|0|ML|39|270.00|500.00|1|1|6|||CME|CME|B||||||17
574.575.521|0|ML|39|270.00|500.00|1|1|6|||CME|CME|M||||||17
574.575.522|0|ML|39|270.00|500.00|1|1|6|||ANT|ANT|B||||||17
574.575.523|0|ML|39|270.00|500.00|1|1|6|||ANT|ANT|M||||||17
574.575.524|0|ML|39|270.00|500.00|1|1|6|||PTO|PTO|B||||||17
574.575.525|0|ML|39|270.00|500.00|1|1|6|||PTO|PTO|M||||||17
574.575.526|0|ML|39|270.00|500.00|1|1|6|||CRE|CRE|B||||||17
574.575.527|0|ML|39|270.00|500.00|1|1|6|||CRE|CRE|M||||||17
574.575.528|0|ML|39|270.00|500.00|1|1|6|||CAM|CAM|B||||||17
574.575.529|0|ML|39|270.00|500.00|1|1|6|||CAM|CAM|M||||||17
574.575.530|0|ML|39|270.00|500.00|1|1|6|||OUR|OUR|B||||||17
574.575.531|0|ML|39|270.00|500.00|1|1|6|||OUR|OUR|M||||||17
574.575.532|0|ML|39|270.00|500.00|1|1|6|||COB|COB|B||||||17
574.575.533|0|ML|39|270.00|500.00|1|1|6|||COB|COB|M||||||17
574.575.534|0|ML|39|270.00|500.00|1|1|6|||CHO|CHO|B||||||17
574.575.535|0|ML|39|270.00|500.00|1|1|6|||CHO|CHO|M||||||17
574.575.536|0|ML|39|270.00|500.00|1|1|6|||VAG|VAG|B||||||17
574.575.537|0|ML|39|270.00|500.00|1|1|6|||VAG|VAG|M||||||17
574.575.538|0|ML|39|270.00|500.00|1|1|6|||AZE|AZE|B||||||17
574.575.539|0|ML|39|270.00|500.00|1|1|6|||AZE|AZE|M||||||17
574.575.540|0|ML|39|270.00|500.00|1|1|6|||AMA|AMA|B||||||17
574.575.541|0|ML|39|270.00|500.00|1|1|6|||AMA|AMA|M||||||17
574.575.542|0|ML|39|270.00|500.00|1|1|6|||AES|AES|B||||||17
574.575.543|0|ML|39|270.00|500.00|1|1|6|||AES|AES|M||||||17
574.575.544|0|ML|39|270.00|500.00|1|1|6|||PRA|PRA|B||||||17
574.575.545|0|ML|39|270.00|500.00|1|1|6|||PRA|PRA|M||||||17
574.575.546|0|ML|39|270.00|500.00|1|1|6|||ROS|ROS|B||||||17
574.575.547|0|ML|39|270.00|500.00|1|1|6|||ROS|ROS|M||||||17
574.575.548|0|ML|39|270.00|500.00|1|1|6|||VER|VER|B||||||17
574.575.549|0|ML|39|270.00|500.00|1|1|6|||VER|VER|M||||||17
574.575.550|0|ML|39|270.00|500.00|1|1|6|||AZB|AZB|||||||17
574.575.551|0|ML|39|270.00|500.00|1|1|6|||DEN|DEN|||||||17
574.575.552|0|ML|39|270.00|500.00|1|1|6|||BLK|BLK|||||||17
574.575.553|0|ML|39|270.00|500.00|1|1|6|||ART|ART|||||||17
574.575.554|0|ML|39|270.00|500.00|1|1|6|||LIN|LIN|||||||17
574.575.555|0|ML|39|270.00|500.00|1|1|6|||HAL|HAL|||||||17
574.576.394|0|ML|40|226.80|420.00|1|1|6|||TBR|TBR|||||||17
574.576.198|0|ML|40|226.80|420.00|1|1|6|||TEA|TEA|||||||17
574.576.199|0|ML|40|226.80|420.00|1|1|6|||OAK|OAK|||||||17
574.576.200|0|ML|40|226.80|420.00|1|1|6|||JOP|JOP|||||||17
574.576.395|0|ML|40|270.00|500.00|1|1|6|||TBR|BCO|B||||||17
574.576.396|0|ML|40|270.00|500.00|1|1|6|||TBR|BCO|M||||||17
574.576.397|0|ML|40|270.00|500.00|1|1|6|||TBR|CCL|B||||||17
574.576.398|0|ML|40|270.00|500.00|1|1|6|||TBR|CCL|M||||||17
574.576.399|0|ML|40|270.00|500.00|1|1|6|||TBR|CME|B||||||17
574.576.400|0|ML|40|270.00|500.00|1|1|6|||TBR|CME|M||||||17
574.576.401|0|ML|40|270.00|500.00|1|1|6|||TBR|ANT|B||||||17
574.576.402|0|ML|40|270.00|500.00|1|1|6|||TBR|ANT|M||||||17
574.576.403|0|ML|40|270.00|500.00|1|1|6|||TBR|PTO|B||||||17
574.576.404|0|ML|40|270.00|500.00|1|1|6|||TBR|PTO|M||||||17
574.576.405|0|ML|40|270.00|500.00|1|1|6|||TBR|CRE|B||||||17
574.576.406|0|ML|40|270.00|500.00|1|1|6|||TBR|CRE|M||||||17
574.576.407|0|ML|40|270.00|500.00|1|1|6|||TBR|CAM|B||||||17
574.576.408|0|ML|40|270.00|500.00|1|1|6|||TBR|CAM|M||||||17
574.576.409|0|ML|40|270.00|500.00|1|1|6|||TBR|OUR|B||||||17
574.576.410|0|ML|40|270.00|500.00|1|1|6|||TBR|OUR|M||||||17
574.576.411|0|ML|40|270.00|500.00|1|1|6|||TBR|COB|B||||||17
574.576.412|0|ML|40|270.00|500.00|1|1|6|||TBR|COB|M||||||17
574.576.413|0|ML|40|270.00|500.00|1|1|6|||TBR|CHO|B||||||17
574.576.414|0|ML|40|270.00|500.00|1|1|6|||TBR|CHO|M||||||17
574.576.415|0|ML|40|270.00|500.00|1|1|6|||TBR|VAG|B||||||17
574.576.416|0|ML|40|270.00|500.00|1|1|6|||TBR|VAG|M||||||17
574.576.417|0|ML|40|270.00|500.00|1|1|6|||TBR|AZE|B||||||17
574.576.418|0|ML|40|270.00|500.00|1|1|6|||TBR|AZE|M||||||17
574.576.419|0|ML|40|270.00|500.00|1|1|6|||TBR|AMA|B||||||17
574.576.420|0|ML|40|270.00|500.00|1|1|6|||TBR|AMA|M||||||17
574.576.421|0|ML|40|270.00|500.00|1|1|6|||TBR|AES|B||||||17
574.576.422|0|ML|40|270.00|500.00|1|1|6|||TBR|AES|M||||||17
574.576.423|0|ML|40|270.00|500.00|1|1|6|||TBR|PRA|B||||||17
574.576.424|0|ML|40|270.00|500.00|1|1|6|||TBR|PRA|M||||||17
574.576.425|0|ML|40|270.00|500.00|1|1|6|||TBR|ROS|B||||||17
574.576.426|0|ML|40|270.00|500.00|1|1|6|||TBR|ROS|M||||||17
574.576.427|0|ML|40|270.00|500.00|1|1|6|||TBR|VER|B||||||17
574.576.428|0|ML|40|270.00|500.00|1|1|6|||TBR|VER|M||||||17
574.576.429|0|ML|40|270.00|500.00|1|1|6|||TBR|AZB|||||||17
574.576.430|0|ML|40|270.00|500.00|1|1|6|||TBR|DEN|||||||17
574.576.431|0|ML|40|270.00|500.00|1|1|6|||TBR|BLK|||||||17
574.576.432|0|ML|40|270.00|500.00|1|1|6|||TBR|ART|||||||17
574.576.433|0|ML|40|270.00|500.00|1|1|6|||TBR|LIN|||||||17
574.576.434|0|ML|40|270.00|500.00|1|1|6|||TBR|HAL|||||||17
574.576.435|0|ML|40|291.60|540.00|1|1|6|||BCO|BCO|B||||||17
574.576.436|0|ML|40|291.60|540.00|1|1|6|||BCO|BCO|M||||||17
574.576.437|0|ML|40|291.60|540.00|1|1|6|||CCL|CCL|B||||||17
574.576.438|0|ML|40|291.60|540.00|1|1|6|||CCL|CCL|M||||||17
574.576.439|0|ML|40|291.60|540.00|1|1|6|||CME|CME|B||||||17
574.576.440|0|ML|40|291.60|540.00|1|1|6|||CME|CME|M||||||17
574.576.441|0|ML|40|291.60|540.00|1|1|6|||ANT|ANT|B||||||17
574.576.442|0|ML|40|291.60|540.00|1|1|6|||ANT|ANT|M||||||17
574.576.443|0|ML|40|291.60|540.00|1|1|6|||PTO|PTO|B||||||17
574.576.444|0|ML|40|291.60|540.00|1|1|6|||PTO|PTO|M||||||17
574.576.445|0|ML|40|291.60|540.00|1|1|6|||CRE|CRE|B||||||17
574.576.446|0|ML|40|291.60|540.00|1|1|6|||CRE|CRE|M||||||17
574.576.447|0|ML|40|291.60|540.00|1|1|6|||CAM|CAM|B||||||17
574.576.448|0|ML|40|291.60|540.00|1|1|6|||CAM|CAM|M||||||17
574.576.449|0|ML|40|291.60|540.00|1|1|6|||OUR|OUR|B||||||17
574.576.450|0|ML|40|291.60|540.00|1|1|6|||OUR|OUR|M||||||17
574.576.451|0|ML|40|291.60|540.00|1|1|6|||COB|COB|B||||||17
574.576.452|0|ML|40|291.60|540.00|1|1|6|||COB|COB|M||||||17
574.576.453|0|ML|40|291.60|540.00|1|1|6|||CHO|CHO|B||||||17
574.576.454|0|ML|40|291.60|540.00|1|1|6|||CHO|CHO|M||||||17
574.576.455|0|ML|40|291.60|540.00|1|1|6|||VAG|VAG|B||||||17
574.576.456|0|ML|40|291.60|540.00|1|1|6|||VAG|VAG|M||||||17
574.576.457|0|ML|40|291.60|540.00|1|1|6|||AZE|AZE|B||||||17
574.576.458|0|ML|40|291.60|540.00|1|1|6|||AZE|AZE|M||||||17
574.576.459|0|ML|40|291.60|540.00|1|1|6|||AMA|AMA|B||||||17
574.576.460|0|ML|40|291.60|540.00|1|1|6|||AMA|AMA|M||||||17
574.576.461|0|ML|40|291.60|540.00|1|1|6|||AES|AES|B||||||17
574.576.462|0|ML|40|291.60|540.00|1|1|6|||AES|AES|M||||||17
574.576.463|0|ML|40|291.60|540.00|1|1|6|||PRA|PRA|B||||||17
574.576.464|0|ML|40|291.60|540.00|1|1|6|||PRA|PRA|M||||||17
574.576.465|0|ML|40|291.60|540.00|1|1|6|||ROS|ROS|B||||||17
574.576.466|0|ML|40|291.60|540.00|1|1|6|||ROS|ROS|M||||||17
574.576.467|0|ML|40|291.60|540.00|1|1|6|||VER|VER|B||||||17
574.576.468|0|ML|40|291.60|540.00|1|1|6|||VER|VER|M||||||17
574.576.469|0|ML|40|291.60|540.00|1|1|6|||AZB|AZB|||||||17
574.576.470|0|ML|40|291.60|540.00|1|1|6|||DEN|DEN|||||||17
574.576.471|0|ML|40|291.60|540.00|1|1|6|||BLK|BLK|||||||17
574.576.472|0|ML|40|291.60|540.00|1|1|6|||ART|ART|||||||17
574.576.473|0|ML|40|291.60|540.00|1|1|6|||LIN|LIN|||||||17
574.576.474|0|ML|40|291.60|540.00|1|1|6|||HAL|HAL|||||||17
574.576.475|0|ML|41|205.20|380.00|1|1|6|||TBR|TBR|||||||17
574.576.242|0|ML|41|205.20|380.00|1|1|6|||TEA|TEA|||||||17
574.576.243|0|ML|41|205.20|380.00|1|1|6|||OAK|OAK|||||||17
574.576.244|0|ML|41|205.20|380.00|1|1|6|||JOP|JOP|||||||17
574.576.476|0|ML|41|248.40|460.00|1|1|6|||TBR|BCO|B||||||17
574.576.477|0|ML|41|248.40|460.00|1|1|6|||TBR|BCO|M||||||17
574.576.478|0|ML|41|248.40|460.00|1|1|6|||TBR|CCL|B||||||17
574.576.479|0|ML|41|248.40|460.00|1|1|6|||TBR|CCL|M||||||17
574.576.480|0|ML|41|248.40|460.00|1|1|6|||TBR|CME|B||||||17
574.576.481|0|ML|41|248.40|460.00|1|1|6|||TBR|CME|M||||||17
574.576.482|0|ML|41|248.40|460.00|1|1|6|||TBR|ANT|B||||||17
574.576.483|0|ML|41|248.40|460.00|1|1|6|||TBR|ANT|M||||||17
574.576.484|0|ML|41|248.40|460.00|1|1|6|||TBR|PTO|B||||||17
574.576.485|0|ML|41|248.40|460.00|1|1|6|||TBR|PTO|M||||||17
574.576.486|0|ML|41|248.40|460.00|1|1|6|||TBR|CRE|B||||||17
574.576.487|0|ML|41|248.40|460.00|1|1|6|||TBR|CRE|M||||||17
574.576.488|0|ML|41|248.40|460.00|1|1|6|||TBR|CAM|B||||||17
574.576.489|0|ML|41|248.40|460.00|1|1|6|||TBR|CAM|M||||||17
574.576.490|0|ML|41|248.40|460.00|1|1|6|||TBR|OUR|B||||||17
574.576.491|0|ML|41|248.40|460.00|1|1|6|||TBR|OUR|M||||||17
574.576.492|0|ML|41|248.40|460.00|1|1|6|||TBR|COB|B||||||17
574.576.493|0|ML|41|248.40|460.00|1|1|6|||TBR|COB|M||||||17
574.576.494|0|ML|41|248.40|460.00|1|1|6|||TBR|CHO|B||||||17
574.576.495|0|ML|41|248.40|460.00|1|1|6|||TBR|CHO|M||||||17
574.576.496|0|ML|41|248.40|460.00|1|1|6|||TBR|VAG|B||||||17
574.576.497|0|ML|41|248.40|460.00|1|1|6|||TBR|VAG|M||||||17
574.576.498|0|ML|41|248.40|460.00|1|1|6|||TBR|AZE|B||||||17
574.576.499|0|ML|41|248.40|460.00|1|1|6|||TBR|AZE|M||||||17
574.576.500|0|ML|41|248.40|460.00|1|1|6|||TBR|AMA|B||||||17
574.576.501|0|ML|41|248.40|460.00|1|1|6|||TBR|AMA|M||||||17
574.576.502|0|ML|41|248.40|460.00|1|1|6|||TBR|AES|B||||||17
574.576.503|0|ML|41|248.40|460.00|1|1|6|||TBR|AES|M||||||17
574.576.504|0|ML|41|248.40|460.00|1|1|6|||TBR|PRA|B||||||17
574.576.505|0|ML|41|248.40|460.00|1|1|6|||TBR|PRA|M||||||17
574.576.506|0|ML|41|248.40|460.00|1|1|6|||TBR|ROS|B||||||17
574.576.507|0|ML|41|248.40|460.00|1|1|6|||TBR|ROS|M||||||17
574.576.508|0|ML|41|248.40|460.00|1|1|6|||TBR|VER|B||||||17
574.576.509|0|ML|41|248.40|460.00|1|1|6|||TBR|VER|M||||||17
574.576.510|0|ML|41|248.40|460.00|1|1|6|||TBR|AZB|||||||17
574.576.511|0|ML|41|248.40|460.00|1|1|6|||TBR|DEN|||||||17
574.576.512|0|ML|41|248.40|460.00|1|1|6|||TBR|BLK|||||||17
574.576.513|0|ML|41|248.40|460.00|1|1|6|||TBR|ART|||||||17
574.576.514|0|ML|41|248.40|460.00|1|1|6|||TBR|LIN|||||||17
574.576.515|0|ML|41|248.40|460.00|1|1|6|||TBR|HAL|||||||17
574.576.516|0|ML|41|270.00|500.00|1|1|6|||BCO|BCO|B||||||17
574.576.517|0|ML|41|270.00|500.00|1|1|6|||BCO|BCO|M||||||17
574.576.518|0|ML|41|270.00|500.00|1|1|6|||CCL|CCL|B||||||17
574.576.519|0|ML|41|270.00|500.00|1|1|6|||CCL|CCL|M||||||17
574.576.520|0|ML|41|270.00|500.00|1|1|6|||CME|CME|B||||||17
574.576.521|0|ML|41|270.00|500.00|1|1|6|||CME|CME|M||||||17
574.576.522|0|ML|41|270.00|500.00|1|1|6|||ANT|ANT|B||||||17
574.576.523|0|ML|41|270.00|500.00|1|1|6|||ANT|ANT|M||||||17
574.576.524|0|ML|41|270.00|500.00|1|1|6|||PTO|PTO|B||||||17
574.576.525|0|ML|41|270.00|500.00|1|1|6|||PTO|PTO|M||||||17
574.576.526|0|ML|41|270.00|500.00|1|1|6|||CRE|CRE|B||||||17
574.576.527|0|ML|41|270.00|500.00|1|1|6|||CRE|CRE|M||||||17
574.576.528|0|ML|41|270.00|500.00|1|1|6|||CAM|CAM|B||||||17
574.576.529|0|ML|41|270.00|500.00|1|1|6|||CAM|CAM|M||||||17
574.576.530|0|ML|41|270.00|500.00|1|1|6|||OUR|OUR|B||||||17
574.576.531|0|ML|41|270.00|500.00|1|1|6|||OUR|OUR|M||||||17
574.576.532|0|ML|41|270.00|500.00|1|1|6|||COB|COB|B||||||17
574.576.533|0|ML|41|270.00|500.00|1|1|6|||COB|COB|M||||||17
574.576.534|0|ML|41|270.00|500.00|1|1|6|||CHO|CHO|B||||||17
574.576.535|0|ML|41|270.00|500.00|1|1|6|||CHO|CHO|M||||||17
574.576.536|0|ML|41|270.00|500.00|1|1|6|||VAG|VAG|B||||||17
574.576.537|0|ML|41|270.00|500.00|1|1|6|||VAG|VAG|M||||||17
574.576.538|0|ML|41|270.00|500.00|1|1|6|||AZE|AZE|B||||||17
574.576.539|0|ML|41|270.00|500.00|1|1|6|||AZE|AZE|M||||||17
574.576.540|0|ML|41|270.00|500.00|1|1|6|||AMA|AMA|B||||||17
574.576.541|0|ML|41|270.00|500.00|1|1|6|||AMA|AMA|M||||||17
574.576.542|0|ML|41|270.00|500.00|1|1|6|||AES|AES|B||||||17
574.576.543|0|ML|41|270.00|500.00|1|1|6|||AES|AES|M||||||17
574.576.544|0|ML|41|270.00|500.00|1|1|6|||PRA|PRA|B||||||17
574.576.545|0|ML|41|270.00|500.00|1|1|6|||PRA|PRA|M||||||17
574.576.546|0|ML|41|270.00|500.00|1|1|6|||ROS|ROS|B||||||17
574.576.547|0|ML|41|270.00|500.00|1|1|6|||ROS|ROS|M||||||17
574.576.548|0|ML|41|270.00|500.00|1|1|6|||VER|VER|B||||||17
574.576.549|0|ML|41|270.00|500.00|1|1|6|||VER|VER|M||||||17
574.576.550|0|ML|41|270.00|500.00|1|1|6|||AZB|AZB|||||||17
574.576.551|0|ML|41|270.00|500.00|1|1|6|||DEN|DEN|||||||17
574.576.552|0|ML|41|270.00|500.00|1|1|6|||BLK|BLK|||||||17
574.576.553|0|ML|41|270.00|500.00|1|1|6|||ART|ART|||||||17
574.576.554|0|ML|41|270.00|500.00|1|1|6|||LIN|LIN|||||||17
574.576.555|0|ML|41|270.00|500.00|1|1|6|||HAL|HAL|||||||17
577.578.394|0|ML|42|107.46|199.00|1|1|6|||TBR|TBR|||||||20
577.578.198|0|ML|42|107.46|199.00|1|1|6|||TEA|TEA|||||||20
577.578.199|0|ML|42|107.46|199.00|1|1|6|||OAK|OAK|||||||20
577.578.200|0|ML|42|107.46|199.00|1|1|6|||JOP|JOP|||||||20
577.578.395|0|ML|42|150.66|279.00|1|1|6|||TBR|BCO|B||||||20
577.578.396|0|ML|42|150.66|279.00|1|1|6|||TBR|BCO|M||||||20
577.578.397|0|ML|42|150.66|279.00|1|1|6|||TBR|CCL|B||||||20
577.578.398|0|ML|42|150.66|279.00|1|1|6|||TBR|CCL|M||||||20
577.578.399|0|ML|42|150.66|279.00|1|1|6|||TBR|CME|B||||||20
577.578.400|0|ML|42|150.66|279.00|1|1|6|||TBR|CME|M||||||20
577.578.401|0|ML|42|150.66|279.00|1|1|6|||TBR|ANT|B||||||20
577.578.402|0|ML|42|150.66|279.00|1|1|6|||TBR|ANT|M||||||20
577.578.403|0|ML|42|150.66|279.00|1|1|6|||TBR|PTO|B||||||20
577.578.404|0|ML|42|150.66|279.00|1|1|6|||TBR|PTO|M||||||20
577.578.405|0|ML|42|150.66|279.00|1|1|6|||TBR|CRE|B||||||20
577.578.406|0|ML|42|150.66|279.00|1|1|6|||TBR|CRE|M||||||20
577.578.407|0|ML|42|150.66|279.00|1|1|6|||TBR|CAM|B||||||20
577.578.408|0|ML|42|150.66|279.00|1|1|6|||TBR|CAM|M||||||20
577.578.409|0|ML|42|150.66|279.00|1|1|6|||TBR|OUR|B||||||20
577.578.410|0|ML|42|150.66|279.00|1|1|6|||TBR|OUR|M||||||20
577.578.411|0|ML|42|150.66|279.00|1|1|6|||TBR|COB|B||||||20
577.578.412|0|ML|42|150.66|279.00|1|1|6|||TBR|COB|M||||||20
577.578.413|0|ML|42|150.66|279.00|1|1|6|||TBR|CHO|B||||||20
577.578.414|0|ML|42|150.66|279.00|1|1|6|||TBR|CHO|M||||||20
577.578.415|0|ML|42|150.66|279.00|1|1|6|||TBR|VAG|B||||||20
577.578.416|0|ML|42|150.66|279.00|1|1|6|||TBR|VAG|M||||||20
577.578.417|0|ML|42|150.66|279.00|1|1|6|||TBR|AZE|B||||||20
577.578.418|0|ML|42|150.66|279.00|1|1|6|||TBR|AZE|M||||||20
577.578.419|0|ML|42|150.66|279.00|1|1|6|||TBR|AMA|B||||||20
577.578.420|0|ML|42|150.66|279.00|1|1|6|||TBR|AMA|M||||||20
577.578.421|0|ML|42|150.66|279.00|1|1|6|||TBR|AES|B||||||20
577.578.422|0|ML|42|150.66|279.00|1|1|6|||TBR|AES|M||||||20
577.578.423|0|ML|42|150.66|279.00|1|1|6|||TBR|PRA|B||||||20
577.578.424|0|ML|42|150.66|279.00|1|1|6|||TBR|PRA|M||||||20
577.578.425|0|ML|42|150.66|279.00|1|1|6|||TBR|ROS|B||||||20
577.578.426|0|ML|42|150.66|279.00|1|1|6|||TBR|ROS|M||||||20
577.578.427|0|ML|42|150.66|279.00|1|1|6|||TBR|VER|B||||||20
577.578.428|0|ML|42|150.66|279.00|1|1|6|||TBR|VER|M||||||20
577.578.429|0|ML|42|150.66|279.00|1|1|6|||TBR|AZB|||||||20
577.578.430|0|ML|42|150.66|279.00|1|1|6|||TBR|DEN|||||||20
577.578.431|0|ML|42|150.66|279.00|1|1|6|||TBR|BLK|||||||20
577.578.432|0|ML|42|150.66|279.00|1|1|6|||TBR|ART|||||||20
577.578.433|0|ML|42|150.66|279.00|1|1|6|||TBR|LIN|||||||20
577.578.434|0|ML|42|150.66|279.00|1|1|6|||TBR|HAL|||||||20
577.578.435|0|ML|42|172.26|319.00|1|1|6|||BCO|BCO|B||||||20
577.578.436|0|ML|42|172.26|319.00|1|1|6|||BCO|BCO|M||||||20
577.578.437|0|ML|42|172.26|319.00|1|1|6|||CCL|CCL|B||||||20
577.578.438|0|ML|42|172.26|319.00|1|1|6|||CCL|CCL|M||||||20
577.578.439|0|ML|42|172.26|319.00|1|1|6|||CME|CME|B||||||20
577.578.440|0|ML|42|172.26|319.00|1|1|6|||CME|CME|M||||||20
577.578.441|0|ML|42|172.26|319.00|1|1|6|||ANT|ANT|B||||||20
577.578.442|0|ML|42|172.26|319.00|1|1|6|||ANT|ANT|M||||||20
577.578.443|0|ML|42|172.26|319.00|1|1|6|||PTO|PTO|B||||||20
577.578.444|0|ML|42|172.26|319.00|1|1|6|||PTO|PTO|M||||||20
577.578.445|0|ML|42|172.26|319.00|1|1|6|||CRE|CRE|B||||||20
577.578.446|0|ML|42|172.26|319.00|1|1|6|||CRE|CRE|M||||||20
577.578.447|0|ML|42|172.26|319.00|1|1|6|||CAM|CAM|B||||||20
577.578.448|0|ML|42|172.26|319.00|1|1|6|||CAM|CAM|M||||||20
577.578.449|0|ML|42|172.26|319.00|1|1|6|||OUR|OUR|B||||||20
577.578.450|0|ML|42|172.26|319.00|1|1|6|||OUR|OUR|M||||||20
577.578.451|0|ML|42|172.26|319.00|1|1|6|||COB|COB|B||||||20
577.578.452|0|ML|42|172.26|319.00|1|1|6|||COB|COB|M||||||20
577.578.453|0|ML|42|172.26|319.00|1|1|6|||CHO|CHO|B||||||20
577.578.454|0|ML|42|172.26|319.00|1|1|6|||CHO|CHO|M||||||20
577.578.455|0|ML|42|172.26|319.00|1|1|6|||VAG|VAG|B||||||20
577.578.456|0|ML|42|172.26|319.00|1|1|6|||VAG|VAG|M||||||20
577.578.457|0|ML|42|172.26|319.00|1|1|6|||AZE|AZE|B||||||20
577.578.458|0|ML|42|172.26|319.00|1|1|6|||AZE|AZE|M||||||20
577.578.459|0|ML|42|172.26|319.00|1|1|6|||AMA|AMA|B||||||20
577.578.460|0|ML|42|172.26|319.00|1|1|6|||AMA|AMA|M||||||20
577.578.461|0|ML|42|172.26|319.00|1|1|6|||AES|AES|B||||||20
577.578.462|0|ML|42|172.26|319.00|1|1|6|||AES|AES|M||||||20
577.578.463|0|ML|42|172.26|319.00|1|1|6|||PRA|PRA|B||||||20
577.578.464|0|ML|42|172.26|319.00|1|1|6|||PRA|PRA|M||||||20
577.578.465|0|ML|42|172.26|319.00|1|1|6|||ROS|ROS|B||||||20
577.578.466|0|ML|42|172.26|319.00|1|1|6|||ROS|ROS|M||||||20
577.578.467|0|ML|42|172.26|319.00|1|1|6|||VER|VER|B||||||20
577.578.468|0|ML|42|172.26|319.00|1|1|6|||VER|VER|M||||||20
577.578.469|0|ML|42|172.26|319.00|1|1|6|||AZB|AZB|||||||20
577.578.470|0|ML|42|172.26|319.00|1|1|6|||DEN|DEN|||||||20
577.578.471|0|ML|42|172.26|319.00|1|1|6|||BLK|BLK|||||||20
577.578.472|0|ML|42|172.26|319.00|1|1|6|||ART|ART|||||||20
577.578.473|0|ML|42|172.26|319.00|1|1|6|||LIN|LIN|||||||20
577.578.474|0|ML|42|172.26|319.00|1|1|6|||HAL|HAL|||||||20
579.580.394|0|ML|43|113.40|210.00|1|1|6|||TBR|TBR|||||||21
579.580.198|0|ML|43|113.40|210.00|1|1|6|||TEA|TEA|||||||21
579.580.199|0|ML|43|113.40|210.00|1|1|6|||OAK|OAK|||||||21
579.580.200|0|ML|43|113.40|210.00|1|1|6|||JOP|JOP|||||||21
579.580.395|0|ML|43|156.60|290.00|1|1|6|||TBR|BCO|B||||||21
579.580.396|0|ML|43|156.60|290.00|1|1|6|||TBR|BCO|M||||||21
579.580.397|0|ML|43|156.60|290.00|1|1|6|||TBR|CCL|B||||||21
579.580.398|0|ML|43|156.60|290.00|1|1|6|||TBR|CCL|M||||||21
579.580.399|0|ML|43|156.60|290.00|1|1|6|||TBR|CME|B||||||21
579.580.400|0|ML|43|156.60|290.00|1|1|6|||TBR|CME|M||||||21
579.580.401|0|ML|43|156.60|290.00|1|1|6|||TBR|ANT|B||||||21
579.580.402|0|ML|43|156.60|290.00|1|1|6|||TBR|ANT|M||||||21
579.580.403|0|ML|43|156.60|290.00|1|1|6|||TBR|PTO|B||||||21
579.580.404|0|ML|43|156.60|290.00|1|1|6|||TBR|PTO|M||||||21
579.580.405|0|ML|43|156.60|290.00|1|1|6|||TBR|CRE|B||||||21
579.580.406|0|ML|43|156.60|290.00|1|1|6|||TBR|CRE|M||||||21
579.580.407|0|ML|43|156.60|290.00|1|1|6|||TBR|CAM|B||||||21
579.580.408|0|ML|43|156.60|290.00|1|1|6|||TBR|CAM|M||||||21
579.580.409|0|ML|43|156.60|290.00|1|1|6|||TBR|OUR|B||||||21
579.580.410|0|ML|43|156.60|290.00|1|1|6|||TBR|OUR|M||||||21
579.580.411|0|ML|43|156.60|290.00|1|1|6|||TBR|COB|B||||||21
579.580.412|0|ML|43|156.60|290.00|1|1|6|||TBR|COB|M||||||21
579.580.413|0|ML|43|156.60|290.00|1|1|6|||TBR|CHO|B||||||21
579.580.414|0|ML|43|156.60|290.00|1|1|6|||TBR|CHO|M||||||21
579.580.415|0|ML|43|156.60|290.00|1|1|6|||TBR|VAG|B||||||21
579.580.416|0|ML|43|156.60|290.00|1|1|6|||TBR|VAG|M||||||21
579.580.417|0|ML|43|156.60|290.00|1|1|6|||TBR|AZE|B||||||21
579.580.418|0|ML|43|156.60|290.00|1|1|6|||TBR|AZE|M||||||21
579.580.419|0|ML|43|156.60|290.00|1|1|6|||TBR|AMA|B||||||21
579.580.420|0|ML|43|156.60|290.00|1|1|6|||TBR|AMA|M||||||21
579.580.421|0|ML|43|156.60|290.00|1|1|6|||TBR|AES|B||||||21
579.580.422|0|ML|43|156.60|290.00|1|1|6|||TBR|AES|M||||||21
579.580.423|0|ML|43|156.60|290.00|1|1|6|||TBR|PRA|B||||||21
579.580.424|0|ML|43|156.60|290.00|1|1|6|||TBR|PRA|M||||||21
579.580.425|0|ML|43|156.60|290.00|1|1|6|||TBR|ROS|B||||||21
579.580.426|0|ML|43|156.60|290.00|1|1|6|||TBR|ROS|M||||||21
579.580.427|0|ML|43|156.60|290.00|1|1|6|||TBR|VER|B||||||21
579.580.428|0|ML|43|156.60|290.00|1|1|6|||TBR|VER|M||||||21
579.580.429|0|ML|43|156.60|290.00|1|1|6|||TBR|AZB|||||||21
579.580.430|0|ML|43|156.60|290.00|1|1|6|||TBR|DEN|||||||21
579.580.431|0|ML|43|156.60|290.00|1|1|6|||TBR|BLK|||||||21
579.580.432|0|ML|43|156.60|290.00|1|1|6|||TBR|ART|||||||21
579.580.433|0|ML|43|156.60|290.00|1|1|6|||TBR|LIN|||||||21
579.580.434|0|ML|43|156.60|290.00|1|1|6|||TBR|HAL|||||||21
579.580.435|0|ML|43|178.20|330.00|1|1|6|||BCO|BCO|B||||||21
579.580.436|0|ML|43|178.20|330.00|1|1|6|||BCO|BCO|M||||||21
579.580.437|0|ML|43|178.20|330.00|1|1|6|||CCL|CCL|B||||||21
579.580.438|0|ML|43|178.20|330.00|1|1|6|||CCL|CCL|M||||||21
579.580.439|0|ML|43|178.20|330.00|1|1|6|||CME|CME|B||||||21
579.580.440|0|ML|43|178.20|330.00|1|1|6|||CME|CME|M||||||21
579.580.441|0|ML|43|178.20|330.00|1|1|6|||ANT|ANT|B||||||21
579.580.442|0|ML|43|178.20|330.00|1|1|6|||ANT|ANT|M||||||21
579.580.443|0|ML|43|178.20|330.00|1|1|6|||PTO|PTO|B||||||21
579.580.444|0|ML|43|178.20|330.00|1|1|6|||PTO|PTO|M||||||21
579.580.445|0|ML|43|178.20|330.00|1|1|6|||CRE|CRE|B||||||21
579.580.446|0|ML|43|178.20|330.00|1|1|6|||CRE|CRE|M||||||21
579.580.447|0|ML|43|178.20|330.00|1|1|6|||CAM|CAM|B||||||21
579.580.448|0|ML|43|178.20|330.00|1|1|6|||CAM|CAM|M||||||21
579.580.449|0|ML|43|178.20|330.00|1|1|6|||OUR|OUR|B||||||21
579.580.450|0|ML|43|178.20|330.00|1|1|6|||OUR|OUR|M||||||21
579.580.451|0|ML|43|178.20|330.00|1|1|6|||COB|COB|B||||||21
579.580.452|0|ML|43|178.20|330.00|1|1|6|||COB|COB|M||||||21
579.580.453|0|ML|43|178.20|330.00|1|1|6|||CHO|CHO|B||||||21
579.580.454|0|ML|43|178.20|330.00|1|1|6|||CHO|CHO|M||||||21
579.580.455|0|ML|43|178.20|330.00|1|1|6|||VAG|VAG|B||||||21
579.580.456|0|ML|43|178.20|330.00|1|1|6|||VAG|VAG|M||||||21
579.580.457|0|ML|43|178.20|330.00|1|1|6|||AZE|AZE|B||||||21
579.580.458|0|ML|43|178.20|330.00|1|1|6|||AZE|AZE|M||||||21
579.580.459|0|ML|43|178.20|330.00|1|1|6|||AMA|AMA|B||||||21
579.580.460|0|ML|43|178.20|330.00|1|1|6|||AMA|AMA|M||||||21
579.580.461|0|ML|43|178.20|330.00|1|1|6|||AES|AES|B||||||21
579.580.462|0|ML|43|178.20|330.00|1|1|6|||AES|AES|M||||||21
579.580.463|0|ML|43|178.20|330.00|1|1|6|||PRA|PRA|B||||||21
579.580.464|0|ML|43|178.20|330.00|1|1|6|||PRA|PRA|M||||||21
579.580.465|0|ML|43|178.20|330.00|1|1|6|||ROS|ROS|B||||||21
579.580.466|0|ML|43|178.20|330.00|1|1|6|||ROS|ROS|M||||||21
579.580.467|0|ML|43|178.20|330.00|1|1|6|||VER|VER|B||||||21
579.580.468|0|ML|43|178.20|330.00|1|1|6|||VER|VER|M||||||21
579.580.469|0|ML|43|178.20|330.00|1|1|6|||AZB|AZB|||||||21
579.580.470|0|ML|43|178.20|330.00|1|1|6|||DEN|DEN|||||||21
579.580.471|0|ML|43|178.20|330.00|1|1|6|||BLK|BLK|||||||21
579.580.472|0|ML|43|178.20|330.00|1|1|6|||ART|ART|||||||21
579.580.473|0|ML|43|178.20|330.00|1|1|6|||LIN|LIN|||||||21
579.580.474|0|ML|43|178.20|330.00|1|1|6|||HAL|HAL|||||||21
581.582.394|0|ML|44|81.00|150.00|1|1|7|||TBR|TBR|||||||22
581.582.198|0|ML|44|81.00|150.00|1|1|7|||TEA|TEA|||||||22
581.582.199|0|ML|44|81.00|150.00|1|1|7|||OAK|OAK|||||||22
581.582.200|0|ML|44|81.00|150.00|1|1|7|||JOP|JOP|||||||22
581.582.395|0|ML|44|124.20|230.00|1|1|7|||TBR|BCO|B||||||22
581.582.396|0|ML|44|124.20|230.00|1|1|7|||TBR|BCO|M||||||22
581.582.397|0|ML|44|124.20|230.00|1|1|7|||TBR|CCL|B||||||22
581.582.398|0|ML|44|124.20|230.00|1|1|7|||TBR|CCL|M||||||22
581.582.399|0|ML|44|124.20|230.00|1|1|7|||TBR|CME|B||||||22
581.582.400|0|ML|44|124.20|230.00|1|1|7|||TBR|CME|M||||||22
581.582.401|0|ML|44|124.20|230.00|1|1|7|||TBR|ANT|B||||||22
581.582.402|0|ML|44|124.20|230.00|1|1|7|||TBR|ANT|M||||||22
581.582.403|0|ML|44|124.20|230.00|1|1|7|||TBR|PTO|B||||||22
581.582.404|0|ML|44|124.20|230.00|1|1|7|||TBR|PTO|M||||||22
581.582.405|0|ML|44|124.20|230.00|1|1|7|||TBR|CRE|B||||||22
581.582.406|0|ML|44|124.20|230.00|1|1|7|||TBR|CRE|M||||||22
581.582.407|0|ML|44|124.20|230.00|1|1|7|||TBR|CAM|B||||||22
581.582.408|0|ML|44|124.20|230.00|1|1|7|||TBR|CAM|M||||||22
581.582.409|0|ML|44|124.20|230.00|1|1|7|||TBR|OUR|B||||||22
581.582.410|0|ML|44|124.20|230.00|1|1|7|||TBR|OUR|M||||||22
581.582.411|0|ML|44|124.20|230.00|1|1|7|||TBR|COB|B||||||22
581.582.412|0|ML|44|124.20|230.00|1|1|7|||TBR|COB|M||||||22
581.582.413|0|ML|44|124.20|230.00|1|1|7|||TBR|CHO|B||||||22
581.582.414|0|ML|44|124.20|230.00|1|1|7|||TBR|CHO|M||||||22
581.582.415|0|ML|44|124.20|230.00|1|1|7|||TBR|VAG|B||||||22
581.582.416|0|ML|44|124.20|230.00|1|1|7|||TBR|VAG|M||||||22
581.582.417|0|ML|44|124.20|230.00|1|1|7|||TBR|AZE|B||||||22
581.582.418|0|ML|44|124.20|230.00|1|1|7|||TBR|AZE|M||||||22
581.582.419|0|ML|44|124.20|230.00|1|1|7|||TBR|AMA|B||||||22
581.582.420|0|ML|44|124.20|230.00|1|1|7|||TBR|AMA|M||||||22
581.582.421|0|ML|44|124.20|230.00|1|1|7|||TBR|AES|B||||||22
581.582.422|0|ML|44|124.20|230.00|1|1|7|||TBR|AES|M||||||22
581.582.423|0|ML|44|124.20|230.00|1|1|7|||TBR|PRA|B||||||22
581.582.424|0|ML|44|124.20|230.00|1|1|7|||TBR|PRA|M||||||22
581.582.425|0|ML|44|124.20|230.00|1|1|7|||TBR|ROS|B||||||22
581.582.426|0|ML|44|124.20|230.00|1|1|7|||TBR|ROS|M||||||22
581.582.427|0|ML|44|124.20|230.00|1|1|7|||TBR|VER|B||||||22
581.582.428|0|ML|44|124.20|230.00|1|1|7|||TBR|VER|M||||||22
581.582.429|0|ML|44|124.20|230.00|1|1|7|||TBR|AZB|||||||22
581.582.430|0|ML|44|124.20|230.00|1|1|7|||TBR|DEN|||||||22
581.582.431|0|ML|44|124.20|230.00|1|1|7|||TBR|BLK|||||||22
581.582.432|0|ML|44|124.20|230.00|1|1|7|||TBR|ART|||||||22
581.582.433|0|ML|44|124.20|230.00|1|1|7|||TBR|LIN|||||||22
581.582.434|0|ML|44|124.20|230.00|1|1|7|||TBR|HAL|||||||22
581.582.435|0|ML|44|145.80|270.00|1|1|7|||BCO|BCO|B||||||22
581.582.436|0|ML|44|145.80|270.00|1|1|7|||BCO|BCO|M||||||22
581.582.437|0|ML|44|145.80|270.00|1|1|7|||CCL|CCL|B||||||22
581.582.438|0|ML|44|145.80|270.00|1|1|7|||CCL|CCL|M||||||22
581.582.439|0|ML|44|145.80|270.00|1|1|7|||CME|CME|B||||||22
581.582.440|0|ML|44|145.80|270.00|1|1|7|||CME|CME|M||||||22
581.582.441|0|ML|44|145.80|270.00|1|1|7|||ANT|ANT|B||||||22
581.582.442|0|ML|44|145.80|270.00|1|1|7|||ANT|ANT|M||||||22
581.582.443|0|ML|44|145.80|270.00|1|1|7|||PTO|PTO|B||||||22
581.582.444|0|ML|44|145.80|270.00|1|1|7|||PTO|PTO|M||||||22
581.582.445|0|ML|44|145.80|270.00|1|1|7|||CRE|CRE|B||||||22
581.582.446|0|ML|44|145.80|270.00|1|1|7|||CRE|CRE|M||||||22
581.582.447|0|ML|44|145.80|270.00|1|1|7|||CAM|CAM|B||||||22
581.582.448|0|ML|44|145.80|270.00|1|1|7|||CAM|CAM|M||||||22
581.582.449|0|ML|44|145.80|270.00|1|1|7|||OUR|OUR|B||||||22
581.582.450|0|ML|44|145.80|270.00|1|1|7|||OUR|OUR|M||||||22
581.582.451|0|ML|44|145.80|270.00|1|1|7|||COB|COB|B||||||22
581.582.452|0|ML|44|145.80|270.00|1|1|7|||COB|COB|M||||||22
581.582.453|0|ML|44|145.80|270.00|1|1|7|||CHO|CHO|B||||||22
581.582.454|0|ML|44|145.80|270.00|1|1|7|||CHO|CHO|M||||||22
581.582.455|0|ML|44|145.80|270.00|1|1|7|||VAG|VAG|B||||||22
581.582.456|0|ML|44|145.80|270.00|1|1|7|||VAG|VAG|M||||||22
581.582.457|0|ML|44|145.80|270.00|1|1|7|||AZE|AZE|B||||||22
581.582.458|0|ML|44|145.80|270.00|1|1|7|||AZE|AZE|M||||||22
581.582.459|0|ML|44|145.80|270.00|1|1|7|||AMA|AMA|B||||||22
581.582.460|0|ML|44|145.80|270.00|1|1|7|||AMA|AMA|M||||||22
581.582.461|0|ML|44|145.80|270.00|1|1|7|||AES|AES|B||||||22
581.582.462|0|ML|44|145.80|270.00|1|1|7|||AES|AES|M||||||22
581.582.463|0|ML|44|145.80|270.00|1|1|7|||PRA|PRA|B||||||22
581.582.464|0|ML|44|145.80|270.00|1|1|7|||PRA|PRA|M||||||22
581.582.465|0|ML|44|145.80|270.00|1|1|7|||ROS|ROS|B||||||22
581.582.466|0|ML|44|145.80|270.00|1|1|7|||ROS|ROS|M||||||22
581.582.467|0|ML|44|145.80|270.00|1|1|7|||VER|VER|B||||||22
581.582.468|0|ML|44|145.80|270.00|1|1|7|||VER|VER|M||||||22
581.582.469|0|ML|44|145.80|270.00|1|1|7|||AZB|AZB|||||||22
581.582.470|0|ML|44|145.80|270.00|1|1|7|||DEN|DEN|||||||22
581.582.471|0|ML|44|145.80|270.00|1|1|7|||BLK|BLK|||||||22
581.582.472|0|ML|44|145.80|270.00|1|1|7|||ART|ART|||||||22
581.582.473|0|ML|44|145.80|270.00|1|1|7|||LIN|LIN|||||||22
581.582.474|0|ML|44|145.80|270.00|1|1|7|||HAL|HAL|||||||22
581.582.475|0|ML|45|81.00|150.00|1|1|7|||TBR|TBR|||||||22
581.582.242|0|ML|45|81.00|150.00|1|1|7|||TEA|TEA|||||||22
581.582.243|0|ML|45|81.00|150.00|1|1|7|||OAK|OAK|||||||22
581.582.244|0|ML|45|81.00|150.00|1|1|7|||JOP|JOP|||||||22
581.582.476|0|ML|45|124.20|230.00|1|1|7|||TBR|BCO|B||||||22
581.582.477|0|ML|45|124.20|230.00|1|1|7|||TBR|BCO|M||||||22
581.582.478|0|ML|45|124.20|230.00|1|1|7|||TBR|CCL|B||||||22
581.582.479|0|ML|45|124.20|230.00|1|1|7|||TBR|CCL|M||||||22
581.582.480|0|ML|45|124.20|230.00|1|1|7|||TBR|CME|B||||||22
581.582.481|0|ML|45|124.20|230.00|1|1|7|||TBR|CME|M||||||22
581.582.482|0|ML|45|124.20|230.00|1|1|7|||TBR|ANT|B||||||22
581.582.483|0|ML|45|124.20|230.00|1|1|7|||TBR|ANT|M||||||22
581.582.484|0|ML|45|124.20|230.00|1|1|7|||TBR|PTO|B||||||22
581.582.485|0|ML|45|124.20|230.00|1|1|7|||TBR|PTO|M||||||22
581.582.486|0|ML|45|124.20|230.00|1|1|7|||TBR|CRE|B||||||22
581.582.487|0|ML|45|124.20|230.00|1|1|7|||TBR|CRE|M||||||22
581.582.488|0|ML|45|124.20|230.00|1|1|7|||TBR|CAM|B||||||22
581.582.489|0|ML|45|124.20|230.00|1|1|7|||TBR|CAM|M||||||22
581.582.490|0|ML|45|124.20|230.00|1|1|7|||TBR|OUR|B||||||22
581.582.491|0|ML|45|124.20|230.00|1|1|7|||TBR|OUR|M||||||22
581.582.492|0|ML|45|124.20|230.00|1|1|7|||TBR|COB|B||||||22
581.582.493|0|ML|45|124.20|230.00|1|1|7|||TBR|COB|M||||||22
581.582.494|0|ML|45|124.20|230.00|1|1|7|||TBR|CHO|B||||||22
581.582.495|0|ML|45|124.20|230.00|1|1|7|||TBR|CHO|M||||||22
581.582.496|0|ML|45|124.20|230.00|1|1|7|||TBR|VAG|B||||||22
581.582.497|0|ML|45|124.20|230.00|1|1|7|||TBR|VAG|M||||||22
581.582.498|0|ML|45|124.20|230.00|1|1|7|||TBR|AZE|B||||||22
581.582.499|0|ML|45|124.20|230.00|1|1|7|||TBR|AZE|M||||||22
581.582.500|0|ML|45|124.20|230.00|1|1|7|||TBR|AMA|B||||||22
581.582.501|0|ML|45|124.20|230.00|1|1|7|||TBR|AMA|M||||||22
581.582.502|0|ML|45|124.20|230.00|1|1|7|||TBR|AES|B||||||22
581.582.503|0|ML|45|124.20|230.00|1|1|7|||TBR|AES|M||||||22
581.582.504|0|ML|45|124.20|230.00|1|1|7|||TBR|PRA|B||||||22
581.582.505|0|ML|45|124.20|230.00|1|1|7|||TBR|PRA|M||||||22
581.582.506|0|ML|45|124.20|230.00|1|1|7|||TBR|ROS|B||||||22
581.582.507|0|ML|45|124.20|230.00|1|1|7|||TBR|ROS|M||||||22
581.582.508|0|ML|45|124.20|230.00|1|1|7|||TBR|VER|B||||||22
581.582.509|0|ML|45|124.20|230.00|1|1|7|||TBR|VER|M||||||22
581.582.510|0|ML|45|124.20|230.00|1|1|7|||TBR|AZB|||||||22
581.582.511|0|ML|45|124.20|230.00|1|1|7|||TBR|DEN|||||||22
581.582.512|0|ML|45|124.20|230.00|1|1|7|||TBR|BLK|||||||22
581.582.513|0|ML|45|124.20|230.00|1|1|7|||TBR|ART|||||||22
581.582.514|0|ML|45|124.20|230.00|1|1|7|||TBR|LIN|||||||22
581.582.515|0|ML|45|124.20|230.00|1|1|7|||TBR|HAL|||||||22
581.582.516|0|ML|45|145.80|270.00|1|1|7|||BCO|BCO|B||||||22
581.582.517|0|ML|45|145.80|270.00|1|1|7|||BCO|BCO|M||||||22
581.582.518|0|ML|45|145.80|270.00|1|1|7|||CCL|CCL|B||||||22
581.582.519|0|ML|45|145.80|270.00|1|1|7|||CCL|CCL|M||||||22
581.582.520|0|ML|45|145.80|270.00|1|1|7|||CME|CME|B||||||22
581.582.521|0|ML|45|145.80|270.00|1|1|7|||CME|CME|M||||||22
581.582.522|0|ML|45|145.80|270.00|1|1|7|||ANT|ANT|B||||||22
581.582.523|0|ML|45|145.80|270.00|1|1|7|||ANT|ANT|M||||||22
581.582.524|0|ML|45|145.80|270.00|1|1|7|||PTO|PTO|B||||||22
581.582.525|0|ML|45|145.80|270.00|1|1|7|||PTO|PTO|M||||||22
581.582.526|0|ML|45|145.80|270.00|1|1|7|||CRE|CRE|B||||||22
581.582.527|0|ML|45|145.80|270.00|1|1|7|||CRE|CRE|M||||||22
581.582.528|0|ML|45|145.80|270.00|1|1|7|||CAM|CAM|B||||||22
581.582.529|0|ML|45|145.80|270.00|1|1|7|||CAM|CAM|M||||||22
581.582.530|0|ML|45|145.80|270.00|1|1|7|||OUR|OUR|B||||||22
581.582.531|0|ML|45|145.80|270.00|1|1|7|||OUR|OUR|M||||||22
581.582.532|0|ML|45|145.80|270.00|1|1|7|||COB|COB|B||||||22
581.582.533|0|ML|45|145.80|270.00|1|1|7|||COB|COB|M||||||22
581.582.534|0|ML|45|145.80|270.00|1|1|7|||CHO|CHO|B||||||22
581.582.535|0|ML|45|145.80|270.00|1|1|7|||CHO|CHO|M||||||22
581.582.536|0|ML|45|145.80|270.00|1|1|7|||VAG|VAG|B||||||22
581.582.537|0|ML|45|145.80|270.00|1|1|7|||VAG|VAG|M||||||22
581.582.538|0|ML|45|145.80|270.00|1|1|7|||AZE|AZE|B||||||22
581.582.539|0|ML|45|145.80|270.00|1|1|7|||AZE|AZE|M||||||22
581.582.540|0|ML|45|145.80|270.00|1|1|7|||AMA|AMA|B||||||22
581.582.541|0|ML|45|145.80|270.00|1|1|7|||AMA|AMA|M||||||22
581.582.542|0|ML|45|145.80|270.00|1|1|7|||AES|AES|B||||||22
581.582.543|0|ML|45|145.80|270.00|1|1|7|||AES|AES|M||||||22
581.582.544|0|ML|45|145.80|270.00|1|1|7|||PRA|PRA|B||||||22
581.582.545|0|ML|45|145.80|270.00|1|1|7|||PRA|PRA|M||||||22
581.582.546|0|ML|45|145.80|270.00|1|1|7|||ROS|ROS|B||||||22
581.582.547|0|ML|45|145.80|270.00|1|1|7|||ROS|ROS|M||||||22
581.582.548|0|ML|45|145.80|270.00|1|1|7|||VER|VER|B||||||22
581.582.549|0|ML|45|145.80|270.00|1|1|7|||VER|VER|M||||||22
581.582.550|0|ML|45|145.80|270.00|1|1|7|||AZB|AZB|||||||22
581.582.551|0|ML|45|145.80|270.00|1|1|7|||DEN|DEN|||||||22
581.582.552|0|ML|45|145.80|270.00|1|1|7|||BLK|BLK|||||||22
581.582.553|0|ML|45|145.80|270.00|1|1|7|||ART|ART|||||||22
581.582.554|0|ML|45|145.80|270.00|1|1|7|||LIN|LIN|||||||22
581.582.555|0|ML|45|145.80|270.00|1|1|7|||HAL|HAL|||||||22
583.582.394|0|ML|44|83.70|155.00|1|1|7|||TBR|TBR|||||||4
583.582.198|0|ML|44|83.70|155.00|1|1|7|||TEA|TEA|||||||4
583.582.199|0|ML|44|83.70|155.00|1|1|7|||OAK|OAK|||||||4
583.582.200|0|ML|44|83.70|155.00|1|1|7|||JOP|JOP|||||||4
583.582.395|0|ML|44|126.90|235.00|1|1|7|||TBR|BCO|B||||||4
583.582.396|0|ML|44|126.90|235.00|1|1|7|||TBR|BCO|M||||||4
583.582.397|0|ML|44|126.90|235.00|1|1|7|||TBR|CCL|B||||||4
583.582.398|0|ML|44|126.90|235.00|1|1|7|||TBR|CCL|M||||||4
583.582.399|0|ML|44|126.90|235.00|1|1|7|||TBR|CME|B||||||4
583.582.400|0|ML|44|126.90|235.00|1|1|7|||TBR|CME|M||||||4
583.582.401|0|ML|44|126.90|235.00|1|1|7|||TBR|ANT|B||||||4
583.582.402|0|ML|44|126.90|235.00|1|1|7|||TBR|ANT|M||||||4
583.582.403|0|ML|44|126.90|235.00|1|1|7|||TBR|PTO|B||||||4
583.582.404|0|ML|44|126.90|235.00|1|1|7|||TBR|PTO|M||||||4
583.582.405|0|ML|44|126.90|235.00|1|1|7|||TBR|CRE|B||||||4
583.582.406|0|ML|44|126.90|235.00|1|1|7|||TBR|CRE|M||||||4
583.582.407|0|ML|44|126.90|235.00|1|1|7|||TBR|CAM|B||||||4
583.582.408|0|ML|44|126.90|235.00|1|1|7|||TBR|CAM|M||||||4
583.582.409|0|ML|44|126.90|235.00|1|1|7|||TBR|OUR|B||||||4
583.582.410|0|ML|44|126.90|235.00|1|1|7|||TBR|OUR|M||||||4
583.582.411|0|ML|44|126.90|235.00|1|1|7|||TBR|COB|B||||||4
583.582.412|0|ML|44|126.90|235.00|1|1|7|||TBR|COB|M||||||4
583.582.413|0|ML|44|126.90|235.00|1|1|7|||TBR|CHO|B||||||4
583.582.414|0|ML|44|126.90|235.00|1|1|7|||TBR|CHO|M||||||4
583.582.415|0|ML|44|126.90|235.00|1|1|7|||TBR|VAG|B||||||4
583.582.416|0|ML|44|126.90|235.00|1|1|7|||TBR|VAG|M||||||4
583.582.417|0|ML|44|126.90|235.00|1|1|7|||TBR|AZE|B||||||4
583.582.418|0|ML|44|126.90|235.00|1|1|7|||TBR|AZE|M||||||4
583.582.419|0|ML|44|126.90|235.00|1|1|7|||TBR|AMA|B||||||4
583.582.420|0|ML|44|126.90|235.00|1|1|7|||TBR|AMA|M||||||4
583.582.421|0|ML|44|126.90|235.00|1|1|7|||TBR|AES|B||||||4
583.582.422|0|ML|44|126.90|235.00|1|1|7|||TBR|AES|M||||||4
583.582.423|0|ML|44|126.90|235.00|1|1|7|||TBR|PRA|B||||||4
583.582.424|0|ML|44|126.90|235.00|1|1|7|||TBR|PRA|M||||||4
583.582.425|0|ML|44|126.90|235.00|1|1|7|||TBR|ROS|B||||||4
583.582.426|0|ML|44|126.90|235.00|1|1|7|||TBR|ROS|M||||||4
583.582.427|0|ML|44|126.90|235.00|1|1|7|||TBR|VER|B||||||4
583.582.428|0|ML|44|126.90|235.00|1|1|7|||TBR|VER|M||||||4
583.582.429|0|ML|44|126.90|235.00|1|1|7|||TBR|AZB|||||||4
583.582.430|0|ML|44|126.90|235.00|1|1|7|||TBR|DEN|||||||4
583.582.431|0|ML|44|126.90|235.00|1|1|7|||TBR|BLK|||||||4
583.582.432|0|ML|44|126.90|235.00|1|1|7|||TBR|ART|||||||4
583.582.433|0|ML|44|126.90|235.00|1|1|7|||TBR|LIN|||||||4
583.582.434|0|ML|44|126.90|235.00|1|1|7|||TBR|HAL|||||||4
583.582.435|0|ML|44|148.50|275.00|1|1|7|||BCO|BCO|B||||||4
583.582.436|0|ML|44|148.50|275.00|1|1|7|||BCO|BCO|M||||||4
583.582.437|0|ML|44|148.50|275.00|1|1|7|||CCL|CCL|B||||||4
583.582.438|0|ML|44|148.50|275.00|1|1|7|||CCL|CCL|M||||||4
583.582.439|0|ML|44|148.50|275.00|1|1|7|||CME|CME|B||||||4
583.582.440|0|ML|44|148.50|275.00|1|1|7|||CME|CME|M||||||4
583.582.441|0|ML|44|148.50|275.00|1|1|7|||ANT|ANT|B||||||4
583.582.442|0|ML|44|148.50|275.00|1|1|7|||ANT|ANT|M||||||4
583.582.443|0|ML|44|148.50|275.00|1|1|7|||PTO|PTO|B||||||4
583.582.444|0|ML|44|148.50|275.00|1|1|7|||PTO|PTO|M||||||4
583.582.445|0|ML|44|148.50|275.00|1|1|7|||CRE|CRE|B||||||4
583.582.446|0|ML|44|148.50|275.00|1|1|7|||CRE|CRE|M||||||4
583.582.447|0|ML|44|148.50|275.00|1|1|7|||CAM|CAM|B||||||4
583.582.448|0|ML|44|148.50|275.00|1|1|7|||CAM|CAM|M||||||4
583.582.449|0|ML|44|148.50|275.00|1|1|7|||OUR|OUR|B||||||4
583.582.450|0|ML|44|148.50|275.00|1|1|7|||OUR|OUR|M||||||4
583.582.451|0|ML|44|148.50|275.00|1|1|7|||COB|COB|B||||||4
583.582.452|0|ML|44|148.50|275.00|1|1|7|||COB|COB|M||||||4
583.582.453|0|ML|44|148.50|275.00|1|1|7|||CHO|CHO|B||||||4
583.582.454|0|ML|44|148.50|275.00|1|1|7|||CHO|CHO|M||||||4
583.582.455|0|ML|44|148.50|275.00|1|1|7|||VAG|VAG|B||||||4
583.582.456|0|ML|44|148.50|275.00|1|1|7|||VAG|VAG|M||||||4
583.582.457|0|ML|44|148.50|275.00|1|1|7|||AZE|AZE|B||||||4
583.582.458|0|ML|44|148.50|275.00|1|1|7|||AZE|AZE|M||||||4
583.582.459|0|ML|44|148.50|275.00|1|1|7|||AMA|AMA|B||||||4
583.582.460|0|ML|44|148.50|275.00|1|1|7|||AMA|AMA|M||||||4
583.582.461|0|ML|44|148.50|275.00|1|1|7|||AES|AES|B||||||4
583.582.462|0|ML|44|148.50|275.00|1|1|7|||AES|AES|M||||||4
583.582.463|0|ML|44|148.50|275.00|1|1|7|||PRA|PRA|B||||||4
583.582.464|0|ML|44|148.50|275.00|1|1|7|||PRA|PRA|M||||||4
583.582.465|0|ML|44|148.50|275.00|1|1|7|||ROS|ROS|B||||||4
583.582.466|0|ML|44|148.50|275.00|1|1|7|||ROS|ROS|M||||||4
583.582.467|0|ML|44|148.50|275.00|1|1|7|||VER|VER|B||||||4
583.582.468|0|ML|44|148.50|275.00|1|1|7|||VER|VER|M||||||4
583.582.469|0|ML|44|148.50|275.00|1|1|7|||AZB|AZB|||||||4
583.582.470|0|ML|44|148.50|275.00|1|1|7|||DEN|DEN|||||||4
583.582.471|0|ML|44|148.50|275.00|1|1|7|||BLK|BLK|||||||4
583.582.472|0|ML|44|148.50|275.00|1|1|7|||ART|ART|||||||4
583.582.473|0|ML|44|148.50|275.00|1|1|7|||LIN|LIN|||||||4
583.582.474|0|ML|44|148.50|275.00|1|1|7|||HAL|HAL|||||||4
583.582.475|0|ML|45|83.70|155.00|1|1|7|||TBR|TBR|||||||4
583.582.242|0|ML|45|83.70|155.00|1|1|7|||TEA|TEA|||||||4
583.582.243|0|ML|45|83.70|155.00|1|1|7|||OAK|OAK|||||||4
583.582.244|0|ML|45|83.70|155.00|1|1|7|||JOP|JOP|||||||4
583.582.476|0|ML|45|126.90|235.00|1|1|7|||TBR|BCO|B||||||4
583.582.477|0|ML|45|126.90|235.00|1|1|7|||TBR|BCO|M||||||4
583.582.478|0|ML|45|126.90|235.00|1|1|7|||TBR|CCL|B||||||4
583.582.479|0|ML|45|126.90|235.00|1|1|7|||TBR|CCL|M||||||4
583.582.480|0|ML|45|126.90|235.00|1|1|7|||TBR|CME|B||||||4
583.582.481|0|ML|45|126.90|235.00|1|1|7|||TBR|CME|M||||||4
583.582.482|0|ML|45|126.90|235.00|1|1|7|||TBR|ANT|B||||||4
583.582.483|0|ML|45|126.90|235.00|1|1|7|||TBR|ANT|M||||||4
583.582.484|0|ML|45|126.90|235.00|1|1|7|||TBR|PTO|B||||||4
583.582.485|0|ML|45|126.90|235.00|1|1|7|||TBR|PTO|M||||||4
583.582.486|0|ML|45|126.90|235.00|1|1|7|||TBR|CRE|B||||||4
583.582.487|0|ML|45|126.90|235.00|1|1|7|||TBR|CRE|M||||||4
583.582.488|0|ML|45|126.90|235.00|1|1|7|||TBR|CAM|B||||||4
583.582.489|0|ML|45|126.90|235.00|1|1|7|||TBR|CAM|M||||||4
583.582.490|0|ML|45|126.90|235.00|1|1|7|||TBR|OUR|B||||||4
583.582.491|0|ML|45|126.90|235.00|1|1|7|||TBR|OUR|M||||||4
583.582.492|0|ML|45|126.90|235.00|1|1|7|||TBR|COB|B||||||4
583.582.493|0|ML|45|126.90|235.00|1|1|7|||TBR|COB|M||||||4
583.582.494|0|ML|45|126.90|235.00|1|1|7|||TBR|CHO|B||||||4
583.582.495|0|ML|45|126.90|235.00|1|1|7|||TBR|CHO|M||||||4
583.582.496|0|ML|45|126.90|235.00|1|1|7|||TBR|VAG|B||||||4
583.582.497|0|ML|45|126.90|235.00|1|1|7|||TBR|VAG|M||||||4
583.582.498|0|ML|45|126.90|235.00|1|1|7|||TBR|AZE|B||||||4
583.582.499|0|ML|45|126.90|235.00|1|1|7|||TBR|AZE|M||||||4
583.582.500|0|ML|45|126.90|235.00|1|1|7|||TBR|AMA|B||||||4
583.582.501|0|ML|45|126.90|235.00|1|1|7|||TBR|AMA|M||||||4
583.582.502|0|ML|45|126.90|235.00|1|1|7|||TBR|AES|B||||||4
583.582.503|0|ML|45|126.90|235.00|1|1|7|||TBR|AES|M||||||4
583.582.504|0|ML|45|126.90|235.00|1|1|7|||TBR|PRA|B||||||4
583.582.505|0|ML|45|126.90|235.00|1|1|7|||TBR|PRA|M||||||4
583.582.506|0|ML|45|126.90|235.00|1|1|7|||TBR|ROS|B||||||4
583.582.507|0|ML|45|126.90|235.00|1|1|7|||TBR|ROS|M||||||4
583.582.508|0|ML|45|126.90|235.00|1|1|7|||TBR|VER|B||||||4
583.582.509|0|ML|45|126.90|235.00|1|1|7|||TBR|VER|M||||||4
583.582.510|0|ML|45|126.90|235.00|1|1|7|||TBR|AZB|||||||4
583.582.511|0|ML|45|126.90|235.00|1|1|7|||TBR|DEN|||||||4
583.582.512|0|ML|45|126.90|235.00|1|1|7|||TBR|BLK|||||||4
583.582.513|0|ML|45|126.90|235.00|1|1|7|||TBR|ART|||||||4
583.582.514|0|ML|45|126.90|235.00|1|1|7|||TBR|LIN|||||||4
583.582.515|0|ML|45|126.90|235.00|1|1|7|||TBR|HAL|||||||4
583.582.516|0|ML|45|148.50|275.00|1|1|7|||BCO|BCO|B||||||4
583.582.517|0|ML|45|148.50|275.00|1|1|7|||BCO|BCO|M||||||4
583.582.518|0|ML|45|148.50|275.00|1|1|7|||CCL|CCL|B||||||4
583.582.519|0|ML|45|148.50|275.00|1|1|7|||CCL|CCL|M||||||4
583.582.520|0|ML|45|148.50|275.00|1|1|7|||CME|CME|B||||||4
583.582.521|0|ML|45|148.50|275.00|1|1|7|||CME|CME|M||||||4
583.582.522|0|ML|45|148.50|275.00|1|1|7|||ANT|ANT|B||||||4
583.582.523|0|ML|45|148.50|275.00|1|1|7|||ANT|ANT|M||||||4
583.582.524|0|ML|45|148.50|275.00|1|1|7|||PTO|PTO|B||||||4
583.582.525|0|ML|45|148.50|275.00|1|1|7|||PTO|PTO|M||||||4
583.582.526|0|ML|45|148.50|275.00|1|1|7|||CRE|CRE|B||||||4
583.582.527|0|ML|45|148.50|275.00|1|1|7|||CRE|CRE|M||||||4
583.582.528|0|ML|45|148.50|275.00|1|1|7|||CAM|CAM|B||||||4
583.582.529|0|ML|45|148.50|275.00|1|1|7|||CAM|CAM|M||||||4
583.582.530|0|ML|45|148.50|275.00|1|1|7|||OUR|OUR|B||||||4
583.582.531|0|ML|45|148.50|275.00|1|1|7|||OUR|OUR|M||||||4
583.582.532|0|ML|45|148.50|275.00|1|1|7|||COB|COB|B||||||4
583.582.533|0|ML|45|148.50|275.00|1|1|7|||COB|COB|M||||||4
583.582.534|0|ML|45|148.50|275.00|1|1|7|||CHO|CHO|B||||||4
583.582.535|0|ML|45|148.50|275.00|1|1|7|||CHO|CHO|M||||||4
583.582.536|0|ML|45|148.50|275.00|1|1|7|||VAG|VAG|B||||||4
583.582.537|0|ML|45|148.50|275.00|1|1|7|||VAG|VAG|M||||||4
583.582.538|0|ML|45|148.50|275.00|1|1|7|||AZE|AZE|B||||||4
583.582.539|0|ML|45|148.50|275.00|1|1|7|||AZE|AZE|M||||||4
583.582.540|0|ML|45|148.50|275.00|1|1|7|||AMA|AMA|B||||||4
583.582.541|0|ML|45|148.50|275.00|1|1|7|||AMA|AMA|M||||||4
583.582.542|0|ML|45|148.50|275.00|1|1|7|||AES|AES|B||||||4
583.582.543|0|ML|45|148.50|275.00|1|1|7|||AES|AES|M||||||4
583.582.544|0|ML|45|148.50|275.00|1|1|7|||PRA|PRA|B||||||4
583.582.545|0|ML|45|148.50|275.00|1|1|7|||PRA|PRA|M||||||4
583.582.546|0|ML|45|148.50|275.00|1|1|7|||ROS|ROS|B||||||4
583.582.547|0|ML|45|148.50|275.00|1|1|7|||ROS|ROS|M||||||4
583.582.548|0|ML|45|148.50|275.00|1|1|7|||VER|VER|B||||||4
583.582.549|0|ML|45|148.50|275.00|1|1|7|||VER|VER|M||||||4
583.582.550|0|ML|45|148.50|275.00|1|1|7|||AZB|AZB|||||||4
583.582.551|0|ML|45|148.50|275.00|1|1|7|||DEN|DEN|||||||4
583.582.552|0|ML|45|148.50|275.00|1|1|7|||BLK|BLK|||||||4
583.582.553|0|ML|45|148.50|275.00|1|1|7|||ART|ART|||||||4
583.582.554|0|ML|45|148.50|275.00|1|1|7|||LIN|LIN|||||||4
583.582.555|0|ML|45|148.50|275.00|1|1|7|||HAL|HAL|||||||4
584.582.394|0|ML|44|93.42|173.00|1|1|7|||TBR|TBR|||||||1
584.582.198|0|ML|44|93.42|173.00|1|1|7|||TEA|TEA|||||||1
584.582.199|0|ML|44|93.42|173.00|1|1|7|||OAK|OAK|||||||1
584.582.200|0|ML|44|93.42|173.00|1|1|7|||JOP|JOP|||||||1
584.582.395|0|ML|44|136.62|253.00|1|1|7|||TBR|BCO|B||||||1
584.582.396|0|ML|44|136.62|253.00|1|1|7|||TBR|BCO|M||||||1
584.582.397|0|ML|44|136.62|253.00|1|1|7|||TBR|CCL|B||||||1
584.582.398|0|ML|44|136.62|253.00|1|1|7|||TBR|CCL|M||||||1
584.582.399|0|ML|44|136.62|253.00|1|1|7|||TBR|CME|B||||||1
584.582.400|0|ML|44|136.62|253.00|1|1|7|||TBR|CME|M||||||1
584.582.401|0|ML|44|136.62|253.00|1|1|7|||TBR|ANT|B||||||1
584.582.402|0|ML|44|136.62|253.00|1|1|7|||TBR|ANT|M||||||1
584.582.403|0|ML|44|136.62|253.00|1|1|7|||TBR|PTO|B||||||1
584.582.404|0|ML|44|136.62|253.00|1|1|7|||TBR|PTO|M||||||1
584.582.405|0|ML|44|136.62|253.00|1|1|7|||TBR|CRE|B||||||1
584.582.406|0|ML|44|136.62|253.00|1|1|7|||TBR|CRE|M||||||1
584.582.407|0|ML|44|136.62|253.00|1|1|7|||TBR|CAM|B||||||1
584.582.408|0|ML|44|136.62|253.00|1|1|7|||TBR|CAM|M||||||1
584.582.409|0|ML|44|136.62|253.00|1|1|7|||TBR|OUR|B||||||1
584.582.410|0|ML|44|136.62|253.00|1|1|7|||TBR|OUR|M||||||1
584.582.411|0|ML|44|136.62|253.00|1|1|7|||TBR|COB|B||||||1
584.582.412|0|ML|44|136.62|253.00|1|1|7|||TBR|COB|M||||||1
584.582.413|0|ML|44|136.62|253.00|1|1|7|||TBR|CHO|B||||||1
584.582.414|0|ML|44|136.62|253.00|1|1|7|||TBR|CHO|M||||||1
584.582.415|0|ML|44|136.62|253.00|1|1|7|||TBR|VAG|B||||||1
584.582.416|0|ML|44|136.62|253.00|1|1|7|||TBR|VAG|M||||||1
584.582.417|0|ML|44|136.62|253.00|1|1|7|||TBR|AZE|B||||||1
584.582.418|0|ML|44|136.62|253.00|1|1|7|||TBR|AZE|M||||||1
584.582.419|0|ML|44|136.62|253.00|1|1|7|||TBR|AMA|B||||||1
584.582.420|0|ML|44|136.62|253.00|1|1|7|||TBR|AMA|M||||||1
584.582.421|0|ML|44|136.62|253.00|1|1|7|||TBR|AES|B||||||1
584.582.422|0|ML|44|136.62|253.00|1|1|7|||TBR|AES|M||||||1
584.582.423|0|ML|44|136.62|253.00|1|1|7|||TBR|PRA|B||||||1
584.582.424|0|ML|44|136.62|253.00|1|1|7|||TBR|PRA|M||||||1
584.582.425|0|ML|44|136.62|253.00|1|1|7|||TBR|ROS|B||||||1
584.582.426|0|ML|44|136.62|253.00|1|1|7|||TBR|ROS|M||||||1
584.582.427|0|ML|44|136.62|253.00|1|1|7|||TBR|VER|B||||||1
584.582.428|0|ML|44|136.62|253.00|1|1|7|||TBR|VER|M||||||1
584.582.429|0|ML|44|136.62|253.00|1|1|7|||TBR|AZB|||||||1
584.582.430|0|ML|44|136.62|253.00|1|1|7|||TBR|DEN|||||||1
584.582.431|0|ML|44|136.62|253.00|1|1|7|||TBR|BLK|||||||1
584.582.432|0|ML|44|136.62|253.00|1|1|7|||TBR|ART|||||||1
584.582.433|0|ML|44|136.62|253.00|1|1|7|||TBR|LIN|||||||1
584.582.434|0|ML|44|136.62|253.00|1|1|7|||TBR|HAL|||||||1
584.582.435|0|ML|44|158.22|293.00|1|1|7|||BCO|BCO|B||||||1
584.582.436|0|ML|44|158.22|293.00|1|1|7|||BCO|BCO|M||||||1
584.582.437|0|ML|44|158.22|293.00|1|1|7|||CCL|CCL|B||||||1
584.582.438|0|ML|44|158.22|293.00|1|1|7|||CCL|CCL|M||||||1
584.582.439|0|ML|44|158.22|293.00|1|1|7|||CME|CME|B||||||1
584.582.440|0|ML|44|158.22|293.00|1|1|7|||CME|CME|M||||||1
584.582.441|0|ML|44|158.22|293.00|1|1|7|||ANT|ANT|B||||||1
584.582.442|0|ML|44|158.22|293.00|1|1|7|||ANT|ANT|M||||||1
584.582.443|0|ML|44|158.22|293.00|1|1|7|||PTO|PTO|B||||||1
584.582.444|0|ML|44|158.22|293.00|1|1|7|||PTO|PTO|M||||||1
584.582.445|0|ML|44|158.22|293.00|1|1|7|||CRE|CRE|B||||||1
584.582.446|0|ML|44|158.22|293.00|1|1|7|||CRE|CRE|M||||||1
584.582.447|0|ML|44|158.22|293.00|1|1|7|||CAM|CAM|B||||||1
584.582.448|0|ML|44|158.22|293.00|1|1|7|||CAM|CAM|M||||||1
584.582.449|0|ML|44|158.22|293.00|1|1|7|||OUR|OUR|B||||||1
584.582.450|0|ML|44|158.22|293.00|1|1|7|||OUR|OUR|M||||||1
584.582.451|0|ML|44|158.22|293.00|1|1|7|||COB|COB|B||||||1
584.582.452|0|ML|44|158.22|293.00|1|1|7|||COB|COB|M||||||1
584.582.453|0|ML|44|158.22|293.00|1|1|7|||CHO|CHO|B||||||1
584.582.454|0|ML|44|158.22|293.00|1|1|7|||CHO|CHO|M||||||1
584.582.455|0|ML|44|158.22|293.00|1|1|7|||VAG|VAG|B||||||1
584.582.456|0|ML|44|158.22|293.00|1|1|7|||VAG|VAG|M||||||1
584.582.457|0|ML|44|158.22|293.00|1|1|7|||AZE|AZE|B||||||1
584.582.458|0|ML|44|158.22|293.00|1|1|7|||AZE|AZE|M||||||1
584.582.459|0|ML|44|158.22|293.00|1|1|7|||AMA|AMA|B||||||1
584.582.460|0|ML|44|158.22|293.00|1|1|7|||AMA|AMA|M||||||1
584.582.461|0|ML|44|158.22|293.00|1|1|7|||AES|AES|B||||||1
584.582.462|0|ML|44|158.22|293.00|1|1|7|||AES|AES|M||||||1
584.582.463|0|ML|44|158.22|293.00|1|1|7|||PRA|PRA|B||||||1
584.582.464|0|ML|44|158.22|293.00|1|1|7|||PRA|PRA|M||||||1
584.582.465|0|ML|44|158.22|293.00|1|1|7|||ROS|ROS|B||||||1
584.582.466|0|ML|44|158.22|293.00|1|1|7|||ROS|ROS|M||||||1
584.582.467|0|ML|44|158.22|293.00|1|1|7|||VER|VER|B||||||1
584.582.468|0|ML|44|158.22|293.00|1|1|7|||VER|VER|M||||||1
584.582.469|0|ML|44|158.22|293.00|1|1|7|||AZB|AZB|||||||1
584.582.470|0|ML|44|158.22|293.00|1|1|7|||DEN|DEN|||||||1
584.582.471|0|ML|44|158.22|293.00|1|1|7|||BLK|BLK|||||||1
584.582.472|0|ML|44|158.22|293.00|1|1|7|||ART|ART|||||||1
584.582.473|0|ML|44|158.22|293.00|1|1|7|||LIN|LIN|||||||1
584.582.474|0|ML|44|158.22|293.00|1|1|7|||HAL|HAL|||||||1
584.582.475|0|ML|45|93.42|173.00|1|1|7|||TBR|TBR|||||||1
584.582.242|0|ML|45|93.42|173.00|1|1|7|||TEA|TEA|||||||1
584.582.243|0|ML|45|93.42|173.00|1|1|7|||OAK|OAK|||||||1
584.582.244|0|ML|45|93.42|173.00|1|1|7|||JOP|JOP|||||||1
584.582.476|0|ML|45|136.62|253.00|1|1|7|||TBR|BCO|B||||||1
584.582.477|0|ML|45|136.62|253.00|1|1|7|||TBR|BCO|M||||||1
584.582.478|0|ML|45|136.62|253.00|1|1|7|||TBR|CCL|B||||||1
584.582.479|0|ML|45|136.62|253.00|1|1|7|||TBR|CCL|M||||||1
584.582.480|0|ML|45|136.62|253.00|1|1|7|||TBR|CME|B||||||1
584.582.481|0|ML|45|136.62|253.00|1|1|7|||TBR|CME|M||||||1
584.582.482|0|ML|45|136.62|253.00|1|1|7|||TBR|ANT|B||||||1
584.582.483|0|ML|45|136.62|253.00|1|1|7|||TBR|ANT|M||||||1
584.582.484|0|ML|45|136.62|253.00|1|1|7|||TBR|PTO|B||||||1
584.582.485|0|ML|45|136.62|253.00|1|1|7|||TBR|PTO|M||||||1
584.582.486|0|ML|45|136.62|253.00|1|1|7|||TBR|CRE|B||||||1
584.582.487|0|ML|45|136.62|253.00|1|1|7|||TBR|CRE|M||||||1
584.582.488|0|ML|45|136.62|253.00|1|1|7|||TBR|CAM|B||||||1
584.582.489|0|ML|45|136.62|253.00|1|1|7|||TBR|CAM|M||||||1
584.582.490|0|ML|45|136.62|253.00|1|1|7|||TBR|OUR|B||||||1
584.582.491|0|ML|45|136.62|253.00|1|1|7|||TBR|OUR|M||||||1
584.582.492|0|ML|45|136.62|253.00|1|1|7|||TBR|COB|B||||||1
584.582.493|0|ML|45|136.62|253.00|1|1|7|||TBR|COB|M||||||1
584.582.494|0|ML|45|136.62|253.00|1|1|7|||TBR|CHO|B||||||1
584.582.495|0|ML|45|136.62|253.00|1|1|7|||TBR|CHO|M||||||1
584.582.496|0|ML|45|136.62|253.00|1|1|7|||TBR|VAG|B||||||1
584.582.497|0|ML|45|136.62|253.00|1|1|7|||TBR|VAG|M||||||1
584.582.498|0|ML|45|136.62|253.00|1|1|7|||TBR|AZE|B||||||1
584.582.499|0|ML|45|136.62|253.00|1|1|7|||TBR|AZE|M||||||1
584.582.500|0|ML|45|136.62|253.00|1|1|7|||TBR|AMA|B||||||1
584.582.501|0|ML|45|136.62|253.00|1|1|7|||TBR|AMA|M||||||1
584.582.502|0|ML|45|136.62|253.00|1|1|7|||TBR|AES|B||||||1
584.582.503|0|ML|45|136.62|253.00|1|1|7|||TBR|AES|M||||||1
584.582.504|0|ML|45|136.62|253.00|1|1|7|||TBR|PRA|B||||||1
584.582.505|0|ML|45|136.62|253.00|1|1|7|||TBR|PRA|M||||||1
584.582.506|0|ML|45|136.62|253.00|1|1|7|||TBR|ROS|B||||||1
584.582.507|0|ML|45|136.62|253.00|1|1|7|||TBR|ROS|M||||||1
584.582.508|0|ML|45|136.62|253.00|1|1|7|||TBR|VER|B||||||1
584.582.509|0|ML|45|136.62|253.00|1|1|7|||TBR|VER|M||||||1
584.582.510|0|ML|45|136.62|253.00|1|1|7|||TBR|AZB|||||||1
584.582.511|0|ML|45|136.62|253.00|1|1|7|||TBR|DEN|||||||1
584.582.512|0|ML|45|136.62|253.00|1|1|7|||TBR|BLK|||||||1
584.582.513|0|ML|45|136.62|253.00|1|1|7|||TBR|ART|||||||1
584.582.514|0|ML|45|136.62|253.00|1|1|7|||TBR|LIN|||||||1
584.582.515|0|ML|45|136.62|253.00|1|1|7|||TBR|HAL|||||||1
584.582.516|0|ML|45|158.22|293.00|1|1|7|||BCO|BCO|B||||||1
584.582.517|0|ML|45|158.22|293.00|1|1|7|||BCO|BCO|M||||||1
584.582.518|0|ML|45|158.22|293.00|1|1|7|||CCL|CCL|B||||||1
584.582.519|0|ML|45|158.22|293.00|1|1|7|||CCL|CCL|M||||||1
584.582.520|0|ML|45|158.22|293.00|1|1|7|||CME|CME|B||||||1
584.582.521|0|ML|45|158.22|293.00|1|1|7|||CME|CME|M||||||1
584.582.522|0|ML|45|158.22|293.00|1|1|7|||ANT|ANT|B||||||1
584.582.523|0|ML|45|158.22|293.00|1|1|7|||ANT|ANT|M||||||1
584.582.524|0|ML|45|158.22|293.00|1|1|7|||PTO|PTO|B||||||1
584.582.525|0|ML|45|158.22|293.00|1|1|7|||PTO|PTO|M||||||1
584.582.526|0|ML|45|158.22|293.00|1|1|7|||CRE|CRE|B||||||1
584.582.527|0|ML|45|158.22|293.00|1|1|7|||CRE|CRE|M||||||1
584.582.528|0|ML|45|158.22|293.00|1|1|7|||CAM|CAM|B||||||1
584.582.529|0|ML|45|158.22|293.00|1|1|7|||CAM|CAM|M||||||1
584.582.530|0|ML|45|158.22|293.00|1|1|7|||OUR|OUR|B||||||1
584.582.531|0|ML|45|158.22|293.00|1|1|7|||OUR|OUR|M||||||1
584.582.532|0|ML|45|158.22|293.00|1|1|7|||COB|COB|B||||||1
584.582.533|0|ML|45|158.22|293.00|1|1|7|||COB|COB|M||||||1
584.582.534|0|ML|45|158.22|293.00|1|1|7|||CHO|CHO|B||||||1
584.582.535|0|ML|45|158.22|293.00|1|1|7|||CHO|CHO|M||||||1
584.582.536|0|ML|45|158.22|293.00|1|1|7|||VAG|VAG|B||||||1
584.582.537|0|ML|45|158.22|293.00|1|1|7|||VAG|VAG|M||||||1
584.582.538|0|ML|45|158.22|293.00|1|1|7|||AZE|AZE|B||||||1
584.582.539|0|ML|45|158.22|293.00|1|1|7|||AZE|AZE|M||||||1
584.582.540|0|ML|45|158.22|293.00|1|1|7|||AMA|AMA|B||||||1
584.582.541|0|ML|45|158.22|293.00|1|1|7|||AMA|AMA|M||||||1
584.582.542|0|ML|45|158.22|293.00|1|1|7|||AES|AES|B||||||1
584.582.543|0|ML|45|158.22|293.00|1|1|7|||AES|AES|M||||||1
584.582.544|0|ML|45|158.22|293.00|1|1|7|||PRA|PRA|B||||||1
584.582.545|0|ML|45|158.22|293.00|1|1|7|||PRA|PRA|M||||||1
584.582.546|0|ML|45|158.22|293.00|1|1|7|||ROS|ROS|B||||||1
584.582.547|0|ML|45|158.22|293.00|1|1|7|||ROS|ROS|M||||||1
584.582.548|0|ML|45|158.22|293.00|1|1|7|||VER|VER|B||||||1
584.582.549|0|ML|45|158.22|293.00|1|1|7|||VER|VER|M||||||1
584.582.550|0|ML|45|158.22|293.00|1|1|7|||AZB|AZB|||||||1
584.582.551|0|ML|45|158.22|293.00|1|1|7|||DEN|DEN|||||||1
584.582.552|0|ML|45|158.22|293.00|1|1|7|||BLK|BLK|||||||1
584.582.553|0|ML|45|158.22|293.00|1|1|7|||ART|ART|||||||1
584.582.554|0|ML|45|158.22|293.00|1|1|7|||LIN|LIN|||||||1
584.582.555|0|ML|45|158.22|293.00|1|1|7|||HAL|HAL|||||||1
585.586.394|0|ML|46|135.00|250.00|1|1|7|||TBR|TBR|||||||2
585.586.198|0|ML|46|135.00|250.00|1|1|7|||TEA|TEA|||||||2
585.586.199|0|ML|46|135.00|250.00|1|1|7|||OAK|OAK|||||||2
585.586.200|0|ML|46|135.00|250.00|1|1|7|||JOP|JOP|||||||2
585.586.395|0|ML|46|178.20|330.00|1|1|7|||TBR|BCO|B||||||2
585.586.396|0|ML|46|178.20|330.00|1|1|7|||TBR|BCO|M||||||2
585.586.397|0|ML|46|178.20|330.00|1|1|7|||TBR|CCL|B||||||2
585.586.398|0|ML|46|178.20|330.00|1|1|7|||TBR|CCL|M||||||2
585.586.399|0|ML|46|178.20|330.00|1|1|7|||TBR|CME|B||||||2
585.586.400|0|ML|46|178.20|330.00|1|1|7|||TBR|CME|M||||||2
585.586.401|0|ML|46|178.20|330.00|1|1|7|||TBR|ANT|B||||||2
585.586.402|0|ML|46|178.20|330.00|1|1|7|||TBR|ANT|M||||||2
585.586.403|0|ML|46|178.20|330.00|1|1|7|||TBR|PTO|B||||||2
585.586.404|0|ML|46|178.20|330.00|1|1|7|||TBR|PTO|M||||||2
585.586.405|0|ML|46|178.20|330.00|1|1|7|||TBR|CRE|B||||||2
585.586.406|0|ML|46|178.20|330.00|1|1|7|||TBR|CRE|M||||||2
585.586.407|0|ML|46|178.20|330.00|1|1|7|||TBR|CAM|B||||||2
585.586.408|0|ML|46|178.20|330.00|1|1|7|||TBR|CAM|M||||||2
585.586.409|0|ML|46|178.20|330.00|1|1|7|||TBR|OUR|B||||||2
585.586.410|0|ML|46|178.20|330.00|1|1|7|||TBR|OUR|M||||||2
585.586.411|0|ML|46|178.20|330.00|1|1|7|||TBR|COB|B||||||2
585.586.412|0|ML|46|178.20|330.00|1|1|7|||TBR|COB|M||||||2
585.586.413|0|ML|46|178.20|330.00|1|1|7|||TBR|CHO|B||||||2
585.586.414|0|ML|46|178.20|330.00|1|1|7|||TBR|CHO|M||||||2
585.586.415|0|ML|46|178.20|330.00|1|1|7|||TBR|VAG|B||||||2
585.586.416|0|ML|46|178.20|330.00|1|1|7|||TBR|VAG|M||||||2
585.586.417|0|ML|46|178.20|330.00|1|1|7|||TBR|AZE|B||||||2
585.586.418|0|ML|46|178.20|330.00|1|1|7|||TBR|AZE|M||||||2
585.586.419|0|ML|46|178.20|330.00|1|1|7|||TBR|AMA|B||||||2
585.586.420|0|ML|46|178.20|330.00|1|1|7|||TBR|AMA|M||||||2
585.586.421|0|ML|46|178.20|330.00|1|1|7|||TBR|AES|B||||||2
585.586.422|0|ML|46|178.20|330.00|1|1|7|||TBR|AES|M||||||2
585.586.423|0|ML|46|178.20|330.00|1|1|7|||TBR|PRA|B||||||2
585.586.424|0|ML|46|178.20|330.00|1|1|7|||TBR|PRA|M||||||2
585.586.425|0|ML|46|178.20|330.00|1|1|7|||TBR|ROS|B||||||2
585.586.426|0|ML|46|178.20|330.00|1|1|7|||TBR|ROS|M||||||2
585.586.427|0|ML|46|178.20|330.00|1|1|7|||TBR|VER|B||||||2
585.586.428|0|ML|46|178.20|330.00|1|1|7|||TBR|VER|M||||||2
585.586.429|0|ML|46|178.20|330.00|1|1|7|||TBR|AZB|||||||2
585.586.430|0|ML|46|178.20|330.00|1|1|7|||TBR|DEN|||||||2
585.586.431|0|ML|46|178.20|330.00|1|1|7|||TBR|BLK|||||||2
585.586.432|0|ML|46|178.20|330.00|1|1|7|||TBR|ART|||||||2
585.586.433|0|ML|46|178.20|330.00|1|1|7|||TBR|LIN|||||||2
585.586.434|0|ML|46|178.20|330.00|1|1|7|||TBR|HAL|||||||2
585.586.435|0|ML|46|199.80|370.00|1|1|7|||BCO|BCO|B||||||2
585.586.436|0|ML|46|199.80|370.00|1|1|7|||BCO|BCO|M||||||2
585.586.437|0|ML|46|199.80|370.00|1|1|7|||CCL|CCL|B||||||2
585.586.438|0|ML|46|199.80|370.00|1|1|7|||CCL|CCL|M||||||2
585.586.439|0|ML|46|199.80|370.00|1|1|7|||CME|CME|B||||||2
585.586.440|0|ML|46|199.80|370.00|1|1|7|||CME|CME|M||||||2
585.586.441|0|ML|46|199.80|370.00|1|1|7|||ANT|ANT|B||||||2
585.586.442|0|ML|46|199.80|370.00|1|1|7|||ANT|ANT|M||||||2
585.586.443|0|ML|46|199.80|370.00|1|1|7|||PTO|PTO|B||||||2
585.586.444|0|ML|46|199.80|370.00|1|1|7|||PTO|PTO|M||||||2
585.586.445|0|ML|46|199.80|370.00|1|1|7|||CRE|CRE|B||||||2
585.586.446|0|ML|46|199.80|370.00|1|1|7|||CRE|CRE|M||||||2
585.586.447|0|ML|46|199.80|370.00|1|1|7|||CAM|CAM|B||||||2
585.586.448|0|ML|46|199.80|370.00|1|1|7|||CAM|CAM|M||||||2
585.586.449|0|ML|46|199.80|370.00|1|1|7|||OUR|OUR|B||||||2
585.586.450|0|ML|46|199.80|370.00|1|1|7|||OUR|OUR|M||||||2
585.586.451|0|ML|46|199.80|370.00|1|1|7|||COB|COB|B||||||2
585.586.452|0|ML|46|199.80|370.00|1|1|7|||COB|COB|M||||||2
585.586.453|0|ML|46|199.80|370.00|1|1|7|||CHO|CHO|B||||||2
585.586.454|0|ML|46|199.80|370.00|1|1|7|||CHO|CHO|M||||||2
585.586.455|0|ML|46|199.80|370.00|1|1|7|||VAG|VAG|B||||||2
585.586.456|0|ML|46|199.80|370.00|1|1|7|||VAG|VAG|M||||||2
585.586.457|0|ML|46|199.80|370.00|1|1|7|||AZE|AZE|B||||||2
585.586.458|0|ML|46|199.80|370.00|1|1|7|||AZE|AZE|M||||||2
585.586.459|0|ML|46|199.80|370.00|1|1|7|||AMA|AMA|B||||||2
585.586.460|0|ML|46|199.80|370.00|1|1|7|||AMA|AMA|M||||||2
585.586.461|0|ML|46|199.80|370.00|1|1|7|||AES|AES|B||||||2
585.586.462|0|ML|46|199.80|370.00|1|1|7|||AES|AES|M||||||2
585.586.463|0|ML|46|199.80|370.00|1|1|7|||PRA|PRA|B||||||2
585.586.464|0|ML|46|199.80|370.00|1|1|7|||PRA|PRA|M||||||2
585.586.465|0|ML|46|199.80|370.00|1|1|7|||ROS|ROS|B||||||2
585.586.466|0|ML|46|199.80|370.00|1|1|7|||ROS|ROS|M||||||2
585.586.467|0|ML|46|199.80|370.00|1|1|7|||VER|VER|B||||||2
585.586.468|0|ML|46|199.80|370.00|1|1|7|||VER|VER|M||||||2
585.586.469|0|ML|46|199.80|370.00|1|1|7|||AZB|AZB|||||||2
585.586.470|0|ML|46|199.80|370.00|1|1|7|||DEN|DEN|||||||2
585.586.471|0|ML|46|199.80|370.00|1|1|7|||BLK|BLK|||||||2
585.586.472|0|ML|46|199.80|370.00|1|1|7|||ART|ART|||||||2
585.586.473|0|ML|46|199.80|370.00|1|1|7|||LIN|LIN|||||||2
585.586.474|0|ML|46|199.80|370.00|1|1|7|||HAL|HAL|||||||2
585.586.475|0|ML|47|135.00|250.00|1|1|7|||TBR|TBR|||||||2
585.586.242|0|ML|47|135.00|250.00|1|1|7|||TEA|TEA|||||||2
585.586.243|0|ML|47|135.00|250.00|1|1|7|||OAK|OAK|||||||2
585.586.244|0|ML|47|135.00|250.00|1|1|7|||JOP|JOP|||||||2
585.586.476|0|ML|47|178.20|330.00|1|1|7|||TBR|BCO|B||||||2
585.586.477|0|ML|47|178.20|330.00|1|1|7|||TBR|BCO|M||||||2
585.586.478|0|ML|47|178.20|330.00|1|1|7|||TBR|CCL|B||||||2
585.586.479|0|ML|47|178.20|330.00|1|1|7|||TBR|CCL|M||||||2
585.586.480|0|ML|47|178.20|330.00|1|1|7|||TBR|CME|B||||||2
585.586.481|0|ML|47|178.20|330.00|1|1|7|||TBR|CME|M||||||2
585.586.482|0|ML|47|178.20|330.00|1|1|7|||TBR|ANT|B||||||2
585.586.483|0|ML|47|178.20|330.00|1|1|7|||TBR|ANT|M||||||2
585.586.484|0|ML|47|178.20|330.00|1|1|7|||TBR|PTO|B||||||2
585.586.485|0|ML|47|178.20|330.00|1|1|7|||TBR|PTO|M||||||2
585.586.486|0|ML|47|178.20|330.00|1|1|7|||TBR|CRE|B||||||2
585.586.487|0|ML|47|178.20|330.00|1|1|7|||TBR|CRE|M||||||2
585.586.488|0|ML|47|178.20|330.00|1|1|7|||TBR|CAM|B||||||2
585.586.489|0|ML|47|178.20|330.00|1|1|7|||TBR|CAM|M||||||2
585.586.490|0|ML|47|178.20|330.00|1|1|7|||TBR|OUR|B||||||2
585.586.491|0|ML|47|178.20|330.00|1|1|7|||TBR|OUR|M||||||2
585.586.492|0|ML|47|178.20|330.00|1|1|7|||TBR|COB|B||||||2
585.586.493|0|ML|47|178.20|330.00|1|1|7|||TBR|COB|M||||||2
585.586.494|0|ML|47|178.20|330.00|1|1|7|||TBR|CHO|B||||||2
585.586.495|0|ML|47|178.20|330.00|1|1|7|||TBR|CHO|M||||||2
585.586.496|0|ML|47|178.20|330.00|1|1|7|||TBR|VAG|B||||||2
585.586.497|0|ML|47|178.20|330.00|1|1|7|||TBR|VAG|M||||||2
585.586.498|0|ML|47|178.20|330.00|1|1|7|||TBR|AZE|B||||||2
585.586.499|0|ML|47|178.20|330.00|1|1|7|||TBR|AZE|M||||||2
585.586.500|0|ML|47|178.20|330.00|1|1|7|||TBR|AMA|B||||||2
585.586.501|0|ML|47|178.20|330.00|1|1|7|||TBR|AMA|M||||||2
585.586.502|0|ML|47|178.20|330.00|1|1|7|||TBR|AES|B||||||2
585.586.503|0|ML|47|178.20|330.00|1|1|7|||TBR|AES|M||||||2
585.586.504|0|ML|47|178.20|330.00|1|1|7|||TBR|PRA|B||||||2
585.586.505|0|ML|47|178.20|330.00|1|1|7|||TBR|PRA|M||||||2
585.586.506|0|ML|47|178.20|330.00|1|1|7|||TBR|ROS|B||||||2
585.586.507|0|ML|47|178.20|330.00|1|1|7|||TBR|ROS|M||||||2
585.586.508|0|ML|47|178.20|330.00|1|1|7|||TBR|VER|B||||||2
585.586.509|0|ML|47|178.20|330.00|1|1|7|||TBR|VER|M||||||2
585.586.510|0|ML|47|178.20|330.00|1|1|7|||TBR|AZB|||||||2
585.586.511|0|ML|47|178.20|330.00|1|1|7|||TBR|DEN|||||||2
585.586.512|0|ML|47|178.20|330.00|1|1|7|||TBR|BLK|||||||2
585.586.513|0|ML|47|178.20|330.00|1|1|7|||TBR|ART|||||||2
585.586.514|0|ML|47|178.20|330.00|1|1|7|||TBR|LIN|||||||2
585.586.515|0|ML|47|178.20|330.00|1|1|7|||TBR|HAL|||||||2
585.586.516|0|ML|47|199.80|370.00|1|1|7|||BCO|BCO|B||||||2
585.586.517|0|ML|47|199.80|370.00|1|1|7|||BCO|BCO|M||||||2
585.586.518|0|ML|47|199.80|370.00|1|1|7|||CCL|CCL|B||||||2
585.586.519|0|ML|47|199.80|370.00|1|1|7|||CCL|CCL|M||||||2
585.586.520|0|ML|47|199.80|370.00|1|1|7|||CME|CME|B||||||2
585.586.521|0|ML|47|199.80|370.00|1|1|7|||CME|CME|M||||||2
585.586.522|0|ML|47|199.80|370.00|1|1|7|||ANT|ANT|B||||||2
585.586.523|0|ML|47|199.80|370.00|1|1|7|||ANT|ANT|M||||||2
585.586.524|0|ML|47|199.80|370.00|1|1|7|||PTO|PTO|B||||||2
585.586.525|0|ML|47|199.80|370.00|1|1|7|||PTO|PTO|M||||||2
585.586.526|0|ML|47|199.80|370.00|1|1|7|||CRE|CRE|B||||||2
585.586.527|0|ML|47|199.80|370.00|1|1|7|||CRE|CRE|M||||||2
585.586.528|0|ML|47|199.80|370.00|1|1|7|||CAM|CAM|B||||||2
585.586.529|0|ML|47|199.80|370.00|1|1|7|||CAM|CAM|M||||||2
585.586.530|0|ML|47|199.80|370.00|1|1|7|||OUR|OUR|B||||||2
585.586.531|0|ML|47|199.80|370.00|1|1|7|||OUR|OUR|M||||||2
585.586.532|0|ML|47|199.80|370.00|1|1|7|||COB|COB|B||||||2
585.586.533|0|ML|47|199.80|370.00|1|1|7|||COB|COB|M||||||2
585.586.534|0|ML|47|199.80|370.00|1|1|7|||CHO|CHO|B||||||2
585.586.535|0|ML|47|199.80|370.00|1|1|7|||CHO|CHO|M||||||2
585.586.536|0|ML|47|199.80|370.00|1|1|7|||VAG|VAG|B||||||2
585.586.537|0|ML|47|199.80|370.00|1|1|7|||VAG|VAG|M||||||2
585.586.538|0|ML|47|199.80|370.00|1|1|7|||AZE|AZE|B||||||2
585.586.539|0|ML|47|199.80|370.00|1|1|7|||AZE|AZE|M||||||2
585.586.540|0|ML|47|199.80|370.00|1|1|7|||AMA|AMA|B||||||2
585.586.541|0|ML|47|199.80|370.00|1|1|7|||AMA|AMA|M||||||2
585.586.542|0|ML|47|199.80|370.00|1|1|7|||AES|AES|B||||||2
585.586.543|0|ML|47|199.80|370.00|1|1|7|||AES|AES|M||||||2
585.586.544|0|ML|47|199.80|370.00|1|1|7|||PRA|PRA|B||||||2
585.586.545|0|ML|47|199.80|370.00|1|1|7|||PRA|PRA|M||||||2
585.586.546|0|ML|47|199.80|370.00|1|1|7|||ROS|ROS|B||||||2
585.586.547|0|ML|47|199.80|370.00|1|1|7|||ROS|ROS|M||||||2
585.586.548|0|ML|47|199.80|370.00|1|1|7|||VER|VER|B||||||2
585.586.549|0|ML|47|199.80|370.00|1|1|7|||VER|VER|M||||||2
585.586.550|0|ML|47|199.80|370.00|1|1|7|||AZB|AZB|||||||2
585.586.551|0|ML|47|199.80|370.00|1|1|7|||DEN|DEN|||||||2
585.586.552|0|ML|47|199.80|370.00|1|1|7|||BLK|BLK|||||||2
585.586.553|0|ML|47|199.80|370.00|1|1|7|||ART|ART|||||||2
585.586.554|0|ML|47|199.80|370.00|1|1|7|||LIN|LIN|||||||2
585.586.555|0|ML|47|199.80|370.00|1|1|7|||HAL|HAL|||||||2
587.586.394|0|ML|46|183.60|340.00|1|1|7|||TBR|TBR|||||||3
587.586.198|0|ML|46|183.60|340.00|1|1|7|||TEA|TEA|||||||3
587.586.199|0|ML|46|183.60|340.00|1|1|7|||OAK|OAK|||||||3
587.586.200|0|ML|46|183.60|340.00|1|1|7|||JOP|JOP|||||||3
587.586.395|0|ML|46|226.80|420.00|1|1|7|||TBR|BCO|B||||||3
587.586.396|0|ML|46|226.80|420.00|1|1|7|||TBR|BCO|M||||||3
587.586.397|0|ML|46|226.80|420.00|1|1|7|||TBR|CCL|B||||||3
587.586.398|0|ML|46|226.80|420.00|1|1|7|||TBR|CCL|M||||||3
587.586.399|0|ML|46|226.80|420.00|1|1|7|||TBR|CME|B||||||3
587.586.400|0|ML|46|226.80|420.00|1|1|7|||TBR|CME|M||||||3
587.586.401|0|ML|46|226.80|420.00|1|1|7|||TBR|ANT|B||||||3
587.586.402|0|ML|46|226.80|420.00|1|1|7|||TBR|ANT|M||||||3
587.586.403|0|ML|46|226.80|420.00|1|1|7|||TBR|PTO|B||||||3
587.586.404|0|ML|46|226.80|420.00|1|1|7|||TBR|PTO|M||||||3
587.586.405|0|ML|46|226.80|420.00|1|1|7|||TBR|CRE|B||||||3
587.586.406|0|ML|46|226.80|420.00|1|1|7|||TBR|CRE|M||||||3
587.586.407|0|ML|46|226.80|420.00|1|1|7|||TBR|CAM|B||||||3
587.586.408|0|ML|46|226.80|420.00|1|1|7|||TBR|CAM|M||||||3
587.586.409|0|ML|46|226.80|420.00|1|1|7|||TBR|OUR|B||||||3
587.586.410|0|ML|46|226.80|420.00|1|1|7|||TBR|OUR|M||||||3
587.586.411|0|ML|46|226.80|420.00|1|1|7|||TBR|COB|B||||||3
587.586.412|0|ML|46|226.80|420.00|1|1|7|||TBR|COB|M||||||3
587.586.413|0|ML|46|226.80|420.00|1|1|7|||TBR|CHO|B||||||3
587.586.414|0|ML|46|226.80|420.00|1|1|7|||TBR|CHO|M||||||3
587.586.415|0|ML|46|226.80|420.00|1|1|7|||TBR|VAG|B||||||3
587.586.416|0|ML|46|226.80|420.00|1|1|7|||TBR|VAG|M||||||3
587.586.417|0|ML|46|226.80|420.00|1|1|7|||TBR|AZE|B||||||3
587.586.418|0|ML|46|226.80|420.00|1|1|7|||TBR|AZE|M||||||3
587.586.419|0|ML|46|226.80|420.00|1|1|7|||TBR|AMA|B||||||3
587.586.420|0|ML|46|226.80|420.00|1|1|7|||TBR|AMA|M||||||3
587.586.421|0|ML|46|226.80|420.00|1|1|7|||TBR|AES|B||||||3
587.586.422|0|ML|46|226.80|420.00|1|1|7|||TBR|AES|M||||||3
587.586.423|0|ML|46|226.80|420.00|1|1|7|||TBR|PRA|B||||||3
587.586.424|0|ML|46|226.80|420.00|1|1|7|||TBR|PRA|M||||||3
587.586.425|0|ML|46|226.80|420.00|1|1|7|||TBR|ROS|B||||||3
587.586.426|0|ML|46|226.80|420.00|1|1|7|||TBR|ROS|M||||||3
587.586.427|0|ML|46|226.80|420.00|1|1|7|||TBR|VER|B||||||3
587.586.428|0|ML|46|226.80|420.00|1|1|7|||TBR|VER|M||||||3
587.586.429|0|ML|46|226.80|420.00|1|1|7|||TBR|AZB|||||||3
587.586.430|0|ML|46|226.80|420.00|1|1|7|||TBR|DEN|||||||3
587.586.431|0|ML|46|226.80|420.00|1|1|7|||TBR|BLK|||||||3
587.586.432|0|ML|46|226.80|420.00|1|1|7|||TBR|ART|||||||3
587.586.433|0|ML|46|226.80|420.00|1|1|7|||TBR|LIN|||||||3
587.586.434|0|ML|46|226.80|420.00|1|1|7|||TBR|HAL|||||||3
587.586.435|0|ML|46|248.40|460.00|1|1|7|||BCO|BCO|B||||||3
587.586.436|0|ML|46|248.40|460.00|1|1|7|||BCO|BCO|M||||||3
587.586.437|0|ML|46|248.40|460.00|1|1|7|||CCL|CCL|B||||||3
587.586.438|0|ML|46|248.40|460.00|1|1|7|||CCL|CCL|M||||||3
587.586.439|0|ML|46|248.40|460.00|1|1|7|||CME|CME|B||||||3
587.586.440|0|ML|46|248.40|460.00|1|1|7|||CME|CME|M||||||3
587.586.441|0|ML|46|248.40|460.00|1|1|7|||ANT|ANT|B||||||3
587.586.442|0|ML|46|248.40|460.00|1|1|7|||ANT|ANT|M||||||3
587.586.443|0|ML|46|248.40|460.00|1|1|7|||PTO|PTO|B||||||3
587.586.444|0|ML|46|248.40|460.00|1|1|7|||PTO|PTO|M||||||3
587.586.445|0|ML|46|248.40|460.00|1|1|7|||CRE|CRE|B||||||3
587.586.446|0|ML|46|248.40|460.00|1|1|7|||CRE|CRE|M||||||3
587.586.447|0|ML|46|248.40|460.00|1|1|7|||CAM|CAM|B||||||3
587.586.448|0|ML|46|248.40|460.00|1|1|7|||CAM|CAM|M||||||3
587.586.449|0|ML|46|248.40|460.00|1|1|7|||OUR|OUR|B||||||3
587.586.450|0|ML|46|248.40|460.00|1|1|7|||OUR|OUR|M||||||3
587.586.451|0|ML|46|248.40|460.00|1|1|7|||COB|COB|B||||||3
587.586.452|0|ML|46|248.40|460.00|1|1|7|||COB|COB|M||||||3
587.586.453|0|ML|46|248.40|460.00|1|1|7|||CHO|CHO|B||||||3
587.586.454|0|ML|46|248.40|460.00|1|1|7|||CHO|CHO|M||||||3
587.586.455|0|ML|46|248.40|460.00|1|1|7|||VAG|VAG|B||||||3
587.586.456|0|ML|46|248.40|460.00|1|1|7|||VAG|VAG|M||||||3
587.586.457|0|ML|46|248.40|460.00|1|1|7|||AZE|AZE|B||||||3
587.586.458|0|ML|46|248.40|460.00|1|1|7|||AZE|AZE|M||||||3
587.586.459|0|ML|46|248.40|460.00|1|1|7|||AMA|AMA|B||||||3
587.586.460|0|ML|46|248.40|460.00|1|1|7|||AMA|AMA|M||||||3
587.586.461|0|ML|46|248.40|460.00|1|1|7|||AES|AES|B||||||3
587.586.462|0|ML|46|248.40|460.00|1|1|7|||AES|AES|M||||||3
587.586.463|0|ML|46|248.40|460.00|1|1|7|||PRA|PRA|B||||||3
587.586.464|0|ML|46|248.40|460.00|1|1|7|||PRA|PRA|M||||||3
587.586.465|0|ML|46|248.40|460.00|1|1|7|||ROS|ROS|B||||||3
587.586.466|0|ML|46|248.40|460.00|1|1|7|||ROS|ROS|M||||||3
587.586.467|0|ML|46|248.40|460.00|1|1|7|||VER|VER|B||||||3
587.586.468|0|ML|46|248.40|460.00|1|1|7|||VER|VER|M||||||3
587.586.469|0|ML|46|248.40|460.00|1|1|7|||AZB|AZB|||||||3
587.586.470|0|ML|46|248.40|460.00|1|1|7|||DEN|DEN|||||||3
587.586.471|0|ML|46|248.40|460.00|1|1|7|||BLK|BLK|||||||3
587.586.472|0|ML|46|248.40|460.00|1|1|7|||ART|ART|||||||3
587.586.473|0|ML|46|248.40|460.00|1|1|7|||LIN|LIN|||||||3
587.586.474|0|ML|46|248.40|460.00|1|1|7|||HAL|HAL|||||||3
587.586.475|0|ML|47|183.60|340.00|1|1|7|||TBR|TBR|||||||3
587.586.242|0|ML|47|183.60|340.00|1|1|7|||TEA|TEA|||||||3
587.586.243|0|ML|47|183.60|340.00|1|1|7|||OAK|OAK|||||||3
587.586.244|0|ML|47|183.60|340.00|1|1|7|||JOP|JOP|||||||3
587.586.476|0|ML|47|226.80|420.00|1|1|7|||TBR|BCO|B||||||3
587.586.477|0|ML|47|226.80|420.00|1|1|7|||TBR|BCO|M||||||3
587.586.478|0|ML|47|226.80|420.00|1|1|7|||TBR|CCL|B||||||3
587.586.479|0|ML|47|226.80|420.00|1|1|7|||TBR|CCL|M||||||3
587.586.480|0|ML|47|226.80|420.00|1|1|7|||TBR|CME|B||||||3
587.586.481|0|ML|47|226.80|420.00|1|1|7|||TBR|CME|M||||||3
587.586.482|0|ML|47|226.80|420.00|1|1|7|||TBR|ANT|B||||||3
587.586.483|0|ML|47|226.80|420.00|1|1|7|||TBR|ANT|M||||||3
587.586.484|0|ML|47|226.80|420.00|1|1|7|||TBR|PTO|B||||||3
587.586.485|0|ML|47|226.80|420.00|1|1|7|||TBR|PTO|M||||||3
587.586.486|0|ML|47|226.80|420.00|1|1|7|||TBR|CRE|B||||||3
587.586.487|0|ML|47|226.80|420.00|1|1|7|||TBR|CRE|M||||||3
587.586.488|0|ML|47|226.80|420.00|1|1|7|||TBR|CAM|B||||||3
587.586.489|0|ML|47|226.80|420.00|1|1|7|||TBR|CAM|M||||||3
587.586.490|0|ML|47|226.80|420.00|1|1|7|||TBR|OUR|B||||||3
587.586.491|0|ML|47|226.80|420.00|1|1|7|||TBR|OUR|M||||||3
587.586.492|0|ML|47|226.80|420.00|1|1|7|||TBR|COB|B||||||3
587.586.493|0|ML|47|226.80|420.00|1|1|7|||TBR|COB|M||||||3
587.586.494|0|ML|47|226.80|420.00|1|1|7|||TBR|CHO|B||||||3
587.586.495|0|ML|47|226.80|420.00|1|1|7|||TBR|CHO|M||||||3
587.586.496|0|ML|47|226.80|420.00|1|1|7|||TBR|VAG|B||||||3
587.586.497|0|ML|47|226.80|420.00|1|1|7|||TBR|VAG|M||||||3
587.586.498|0|ML|47|226.80|420.00|1|1|7|||TBR|AZE|B||||||3
587.586.499|0|ML|47|226.80|420.00|1|1|7|||TBR|AZE|M||||||3
587.586.500|0|ML|47|226.80|420.00|1|1|7|||TBR|AMA|B||||||3
587.586.501|0|ML|47|226.80|420.00|1|1|7|||TBR|AMA|M||||||3
587.586.502|0|ML|47|226.80|420.00|1|1|7|||TBR|AES|B||||||3
587.586.503|0|ML|47|226.80|420.00|1|1|7|||TBR|AES|M||||||3
587.586.504|0|ML|47|226.80|420.00|1|1|7|||TBR|PRA|B||||||3
587.586.505|0|ML|47|226.80|420.00|1|1|7|||TBR|PRA|M||||||3
587.586.506|0|ML|47|226.80|420.00|1|1|7|||TBR|ROS|B||||||3
587.586.507|0|ML|47|226.80|420.00|1|1|7|||TBR|ROS|M||||||3
587.586.508|0|ML|47|226.80|420.00|1|1|7|||TBR|VER|B||||||3
587.586.509|0|ML|47|226.80|420.00|1|1|7|||TBR|VER|M||||||3
587.586.510|0|ML|47|226.80|420.00|1|1|7|||TBR|AZB|||||||3
587.586.511|0|ML|47|226.80|420.00|1|1|7|||TBR|DEN|||||||3
587.586.512|0|ML|47|226.80|420.00|1|1|7|||TBR|BLK|||||||3
587.586.513|0|ML|47|226.80|420.00|1|1|7|||TBR|ART|||||||3
587.586.514|0|ML|47|226.80|420.00|1|1|7|||TBR|LIN|||||||3
587.586.515|0|ML|47|226.80|420.00|1|1|7|||TBR|HAL|||||||3
587.586.516|0|ML|47|248.40|460.00|1|1|7|||BCO|BCO|B||||||3
587.586.517|0|ML|47|248.40|460.00|1|1|7|||BCO|BCO|M||||||3
587.586.518|0|ML|47|248.40|460.00|1|1|7|||CCL|CCL|B||||||3
587.586.519|0|ML|47|248.40|460.00|1|1|7|||CCL|CCL|M||||||3
587.586.520|0|ML|47|248.40|460.00|1|1|7|||CME|CME|B||||||3
587.586.521|0|ML|47|248.40|460.00|1|1|7|||CME|CME|M||||||3
587.586.522|0|ML|47|248.40|460.00|1|1|7|||ANT|ANT|B||||||3
587.586.523|0|ML|47|248.40|460.00|1|1|7|||ANT|ANT|M||||||3
587.586.524|0|ML|47|248.40|460.00|1|1|7|||PTO|PTO|B||||||3
587.586.525|0|ML|47|248.40|460.00|1|1|7|||PTO|PTO|M||||||3
587.586.526|0|ML|47|248.40|460.00|1|1|7|||CRE|CRE|B||||||3
587.586.527|0|ML|47|248.40|460.00|1|1|7|||CRE|CRE|M||||||3
587.586.528|0|ML|47|248.40|460.00|1|1|7|||CAM|CAM|B||||||3
587.586.529|0|ML|47|248.40|460.00|1|1|7|||CAM|CAM|M||||||3
587.586.530|0|ML|47|248.40|460.00|1|1|7|||OUR|OUR|B||||||3
587.586.531|0|ML|47|248.40|460.00|1|1|7|||OUR|OUR|M||||||3
587.586.532|0|ML|47|248.40|460.00|1|1|7|||COB|COB|B||||||3
587.586.533|0|ML|47|248.40|460.00|1|1|7|||COB|COB|M||||||3
587.586.534|0|ML|47|248.40|460.00|1|1|7|||CHO|CHO|B||||||3
587.586.535|0|ML|47|248.40|460.00|1|1|7|||CHO|CHO|M||||||3
587.586.536|0|ML|47|248.40|460.00|1|1|7|||VAG|VAG|B||||||3
587.586.537|0|ML|47|248.40|460.00|1|1|7|||VAG|VAG|M||||||3
587.586.538|0|ML|47|248.40|460.00|1|1|7|||AZE|AZE|B||||||3
587.586.539|0|ML|47|248.40|460.00|1|1|7|||AZE|AZE|M||||||3
587.586.540|0|ML|47|248.40|460.00|1|1|7|||AMA|AMA|B||||||3
587.586.541|0|ML|47|248.40|460.00|1|1|7|||AMA|AMA|M||||||3
587.586.542|0|ML|47|248.40|460.00|1|1|7|||AES|AES|B||||||3
587.586.543|0|ML|47|248.40|460.00|1|1|7|||AES|AES|M||||||3
587.586.544|0|ML|47|248.40|460.00|1|1|7|||PRA|PRA|B||||||3
587.586.545|0|ML|47|248.40|460.00|1|1|7|||PRA|PRA|M||||||3
587.586.546|0|ML|47|248.40|460.00|1|1|7|||ROS|ROS|B||||||3
587.586.547|0|ML|47|248.40|460.00|1|1|7|||ROS|ROS|M||||||3
587.586.548|0|ML|47|248.40|460.00|1|1|7|||VER|VER|B||||||3
587.586.549|0|ML|47|248.40|460.00|1|1|7|||VER|VER|M||||||3
587.586.550|0|ML|47|248.40|460.00|1|1|7|||AZB|AZB|||||||3
587.586.551|0|ML|47|248.40|460.00|1|1|7|||DEN|DEN|||||||3
587.586.552|0|ML|47|248.40|460.00|1|1|7|||BLK|BLK|||||||3
587.586.553|0|ML|47|248.40|460.00|1|1|7|||ART|ART|||||||3
587.586.554|0|ML|47|248.40|460.00|1|1|7|||LIN|LIN|||||||3
587.586.555|0|ML|47|248.40|460.00|1|1|7|||HAL|HAL|||||||3
587.588.394|0|ML|48|199.80|370.00|1|1|7|||TBR|TBR|||||||3
587.588.198|0|ML|48|199.80|370.00|1|1|7|||TEA|TEA|||||||3
587.588.199|0|ML|48|199.80|370.00|1|1|7|||OAK|OAK|||||||3
587.588.200|0|ML|48|199.80|370.00|1|1|7|||JOP|JOP|||||||3
587.588.395|0|ML|48|243.00|450.00|1|1|7|||TBR|BCO|B||||||3
587.588.396|0|ML|48|243.00|450.00|1|1|7|||TBR|BCO|M||||||3
587.588.397|0|ML|48|243.00|450.00|1|1|7|||TBR|CCL|B||||||3
587.588.398|0|ML|48|243.00|450.00|1|1|7|||TBR|CCL|M||||||3
587.588.399|0|ML|48|243.00|450.00|1|1|7|||TBR|CME|B||||||3
587.588.400|0|ML|48|243.00|450.00|1|1|7|||TBR|CME|M||||||3
587.588.401|0|ML|48|243.00|450.00|1|1|7|||TBR|ANT|B||||||3
587.588.402|0|ML|48|243.00|450.00|1|1|7|||TBR|ANT|M||||||3
587.588.403|0|ML|48|243.00|450.00|1|1|7|||TBR|PTO|B||||||3
587.588.404|0|ML|48|243.00|450.00|1|1|7|||TBR|PTO|M||||||3
587.588.405|0|ML|48|243.00|450.00|1|1|7|||TBR|CRE|B||||||3
587.588.406|0|ML|48|243.00|450.00|1|1|7|||TBR|CRE|M||||||3
587.588.407|0|ML|48|243.00|450.00|1|1|7|||TBR|CAM|B||||||3
587.588.408|0|ML|48|243.00|450.00|1|1|7|||TBR|CAM|M||||||3
587.588.409|0|ML|48|243.00|450.00|1|1|7|||TBR|OUR|B||||||3
587.588.410|0|ML|48|243.00|450.00|1|1|7|||TBR|OUR|M||||||3
587.588.411|0|ML|48|243.00|450.00|1|1|7|||TBR|COB|B||||||3
587.588.412|0|ML|48|243.00|450.00|1|1|7|||TBR|COB|M||||||3
587.588.413|0|ML|48|243.00|450.00|1|1|7|||TBR|CHO|B||||||3
587.588.414|0|ML|48|243.00|450.00|1|1|7|||TBR|CHO|M||||||3
587.588.415|0|ML|48|243.00|450.00|1|1|7|||TBR|VAG|B||||||3
587.588.416|0|ML|48|243.00|450.00|1|1|7|||TBR|VAG|M||||||3
587.588.417|0|ML|48|243.00|450.00|1|1|7|||TBR|AZE|B||||||3
587.588.418|0|ML|48|243.00|450.00|1|1|7|||TBR|AZE|M||||||3
587.588.419|0|ML|48|243.00|450.00|1|1|7|||TBR|AMA|B||||||3
587.588.420|0|ML|48|243.00|450.00|1|1|7|||TBR|AMA|M||||||3
587.588.421|0|ML|48|243.00|450.00|1|1|7|||TBR|AES|B||||||3
587.588.422|0|ML|48|243.00|450.00|1|1|7|||TBR|AES|M||||||3
587.588.423|0|ML|48|243.00|450.00|1|1|7|||TBR|PRA|B||||||3
587.588.424|0|ML|48|243.00|450.00|1|1|7|||TBR|PRA|M||||||3
587.588.425|0|ML|48|243.00|450.00|1|1|7|||TBR|ROS|B||||||3
587.588.426|0|ML|48|243.00|450.00|1|1|7|||TBR|ROS|M||||||3
587.588.427|0|ML|48|243.00|450.00|1|1|7|||TBR|VER|B||||||3
587.588.428|0|ML|48|243.00|450.00|1|1|7|||TBR|VER|M||||||3
587.588.429|0|ML|48|243.00|450.00|1|1|7|||TBR|AZB|||||||3
587.588.430|0|ML|48|243.00|450.00|1|1|7|||TBR|DEN|||||||3
587.588.431|0|ML|48|243.00|450.00|1|1|7|||TBR|BLK|||||||3
587.588.432|0|ML|48|243.00|450.00|1|1|7|||TBR|ART|||||||3
587.588.433|0|ML|48|243.00|450.00|1|1|7|||TBR|LIN|||||||3
587.588.434|0|ML|48|243.00|450.00|1|1|7|||TBR|HAL|||||||3
587.588.435|0|ML|48|264.60|490.00|1|1|7|||BCO|BCO|B||||||3
587.588.436|0|ML|48|264.60|490.00|1|1|7|||BCO|BCO|M||||||3
587.588.437|0|ML|48|264.60|490.00|1|1|7|||CCL|CCL|B||||||3
587.588.438|0|ML|48|264.60|490.00|1|1|7|||CCL|CCL|M||||||3
587.588.439|0|ML|48|264.60|490.00|1|1|7|||CME|CME|B||||||3
587.588.440|0|ML|48|264.60|490.00|1|1|7|||CME|CME|M||||||3
587.588.441|0|ML|48|264.60|490.00|1|1|7|||ANT|ANT|B||||||3
587.588.442|0|ML|48|264.60|490.00|1|1|7|||ANT|ANT|M||||||3
587.588.443|0|ML|48|264.60|490.00|1|1|7|||PTO|PTO|B||||||3
587.588.444|0|ML|48|264.60|490.00|1|1|7|||PTO|PTO|M||||||3
587.588.445|0|ML|48|264.60|490.00|1|1|7|||CRE|CRE|B||||||3
587.588.446|0|ML|48|264.60|490.00|1|1|7|||CRE|CRE|M||||||3
587.588.447|0|ML|48|264.60|490.00|1|1|7|||CAM|CAM|B||||||3
587.588.448|0|ML|48|264.60|490.00|1|1|7|||CAM|CAM|M||||||3
587.588.449|0|ML|48|264.60|490.00|1|1|7|||OUR|OUR|B||||||3
587.588.450|0|ML|48|264.60|490.00|1|1|7|||OUR|OUR|M||||||3
587.588.451|0|ML|48|264.60|490.00|1|1|7|||COB|COB|B||||||3
587.588.452|0|ML|48|264.60|490.00|1|1|7|||COB|COB|M||||||3
587.588.453|0|ML|48|264.60|490.00|1|1|7|||CHO|CHO|B||||||3
587.588.454|0|ML|48|264.60|490.00|1|1|7|||CHO|CHO|M||||||3
587.588.455|0|ML|48|264.60|490.00|1|1|7|||VAG|VAG|B||||||3
587.588.456|0|ML|48|264.60|490.00|1|1|7|||VAG|VAG|M||||||3
587.588.457|0|ML|48|264.60|490.00|1|1|7|||AZE|AZE|B||||||3
587.588.458|0|ML|48|264.60|490.00|1|1|7|||AZE|AZE|M||||||3
587.588.459|0|ML|48|264.60|490.00|1|1|7|||AMA|AMA|B||||||3
587.588.460|0|ML|48|264.60|490.00|1|1|7|||AMA|AMA|M||||||3
587.588.461|0|ML|48|264.60|490.00|1|1|7|||AES|AES|B||||||3
587.588.462|0|ML|48|264.60|490.00|1|1|7|||AES|AES|M||||||3
587.588.463|0|ML|48|264.60|490.00|1|1|7|||PRA|PRA|B||||||3
587.588.464|0|ML|48|264.60|490.00|1|1|7|||PRA|PRA|M||||||3
587.588.465|0|ML|48|264.60|490.00|1|1|7|||ROS|ROS|B||||||3
587.588.466|0|ML|48|264.60|490.00|1|1|7|||ROS|ROS|M||||||3
587.588.467|0|ML|48|264.60|490.00|1|1|7|||VER|VER|B||||||3
587.588.468|0|ML|48|264.60|490.00|1|1|7|||VER|VER|M||||||3
587.588.469|0|ML|48|264.60|490.00|1|1|7|||AZB|AZB|||||||3
587.588.470|0|ML|48|264.60|490.00|1|1|7|||DEN|DEN|||||||3
587.588.471|0|ML|48|264.60|490.00|1|1|7|||BLK|BLK|||||||3
587.588.472|0|ML|48|264.60|490.00|1|1|7|||ART|ART|||||||3
587.588.473|0|ML|48|264.60|490.00|1|1|7|||LIN|LIN|||||||3
587.588.474|0|ML|48|264.60|490.00|1|1|7|||HAL|HAL|||||||3
587.588.475|0|ML|49|183.60|340.00|1|1|7|||TBR|TBR|||||||3
587.588.242|0|ML|49|183.60|340.00|1|1|7|||TEA|TEA|||||||3
587.588.243|0|ML|49|183.60|340.00|1|1|7|||OAK|OAK|||||||3
587.588.244|0|ML|49|183.60|340.00|1|1|7|||JOP|JOP|||||||3
587.588.476|0|ML|49|226.80|420.00|1|1|7|||TBR|BCO|B||||||3
587.588.477|0|ML|49|226.80|420.00|1|1|7|||TBR|BCO|M||||||3
587.588.478|0|ML|49|226.80|420.00|1|1|7|||TBR|CCL|B||||||3
587.588.479|0|ML|49|226.80|420.00|1|1|7|||TBR|CCL|M||||||3
587.588.480|0|ML|49|226.80|420.00|1|1|7|||TBR|CME|B||||||3
587.588.481|0|ML|49|226.80|420.00|1|1|7|||TBR|CME|M||||||3
587.588.482|0|ML|49|226.80|420.00|1|1|7|||TBR|ANT|B||||||3
587.588.483|0|ML|49|226.80|420.00|1|1|7|||TBR|ANT|M||||||3
587.588.484|0|ML|49|226.80|420.00|1|1|7|||TBR|PTO|B||||||3
587.588.485|0|ML|49|226.80|420.00|1|1|7|||TBR|PTO|M||||||3
587.588.486|0|ML|49|226.80|420.00|1|1|7|||TBR|CRE|B||||||3
587.588.487|0|ML|49|226.80|420.00|1|1|7|||TBR|CRE|M||||||3
587.588.488|0|ML|49|226.80|420.00|1|1|7|||TBR|CAM|B||||||3
587.588.489|0|ML|49|226.80|420.00|1|1|7|||TBR|CAM|M||||||3
587.588.490|0|ML|49|226.80|420.00|1|1|7|||TBR|OUR|B||||||3
587.588.491|0|ML|49|226.80|420.00|1|1|7|||TBR|OUR|M||||||3
587.588.492|0|ML|49|226.80|420.00|1|1|7|||TBR|COB|B||||||3
587.588.493|0|ML|49|226.80|420.00|1|1|7|||TBR|COB|M||||||3
587.588.494|0|ML|49|226.80|420.00|1|1|7|||TBR|CHO|B||||||3
587.588.495|0|ML|49|226.80|420.00|1|1|7|||TBR|CHO|M||||||3
587.588.496|0|ML|49|226.80|420.00|1|1|7|||TBR|VAG|B||||||3
587.588.497|0|ML|49|226.80|420.00|1|1|7|||TBR|VAG|M||||||3
587.588.498|0|ML|49|226.80|420.00|1|1|7|||TBR|AZE|B||||||3
587.588.499|0|ML|49|226.80|420.00|1|1|7|||TBR|AZE|M||||||3
587.588.500|0|ML|49|226.80|420.00|1|1|7|||TBR|AMA|B||||||3
587.588.501|0|ML|49|226.80|420.00|1|1|7|||TBR|AMA|M||||||3
587.588.502|0|ML|49|226.80|420.00|1|1|7|||TBR|AES|B||||||3
587.588.503|0|ML|49|226.80|420.00|1|1|7|||TBR|AES|M||||||3
587.588.504|0|ML|49|226.80|420.00|1|1|7|||TBR|PRA|B||||||3
587.588.505|0|ML|49|226.80|420.00|1|1|7|||TBR|PRA|M||||||3
587.588.506|0|ML|49|226.80|420.00|1|1|7|||TBR|ROS|B||||||3
587.588.507|0|ML|49|226.80|420.00|1|1|7|||TBR|ROS|M||||||3
587.588.508|0|ML|49|226.80|420.00|1|1|7|||TBR|VER|B||||||3
587.588.509|0|ML|49|226.80|420.00|1|1|7|||TBR|VER|M||||||3
587.588.510|0|ML|49|226.80|420.00|1|1|7|||TBR|AZB|||||||3
587.588.511|0|ML|49|226.80|420.00|1|1|7|||TBR|DEN|||||||3
587.588.512|0|ML|49|226.80|420.00|1|1|7|||TBR|BLK|||||||3
587.588.513|0|ML|49|226.80|420.00|1|1|7|||TBR|ART|||||||3
587.588.514|0|ML|49|226.80|420.00|1|1|7|||TBR|LIN|||||||3
587.588.515|0|ML|49|226.80|420.00|1|1|7|||TBR|HAL|||||||3
587.588.516|0|ML|49|248.40|460.00|1|1|7|||BCO|BCO|B||||||3
587.588.517|0|ML|49|248.40|460.00|1|1|7|||BCO|BCO|M||||||3
587.588.518|0|ML|49|248.40|460.00|1|1|7|||CCL|CCL|B||||||3
587.588.519|0|ML|49|248.40|460.00|1|1|7|||CCL|CCL|M||||||3
587.588.520|0|ML|49|248.40|460.00|1|1|7|||CME|CME|B||||||3
587.588.521|0|ML|49|248.40|460.00|1|1|7|||CME|CME|M||||||3
587.588.522|0|ML|49|248.40|460.00|1|1|7|||ANT|ANT|B||||||3
587.588.523|0|ML|49|248.40|460.00|1|1|7|||ANT|ANT|M||||||3
587.588.524|0|ML|49|248.40|460.00|1|1|7|||PTO|PTO|B||||||3
587.588.525|0|ML|49|248.40|460.00|1|1|7|||PTO|PTO|M||||||3
587.588.526|0|ML|49|248.40|460.00|1|1|7|||CRE|CRE|B||||||3
587.588.527|0|ML|49|248.40|460.00|1|1|7|||CRE|CRE|M||||||3
587.588.528|0|ML|49|248.40|460.00|1|1|7|||CAM|CAM|B||||||3
587.588.529|0|ML|49|248.40|460.00|1|1|7|||CAM|CAM|M||||||3
587.588.530|0|ML|49|248.40|460.00|1|1|7|||OUR|OUR|B||||||3
587.588.531|0|ML|49|248.40|460.00|1|1|7|||OUR|OUR|M||||||3
587.588.532|0|ML|49|248.40|460.00|1|1|7|||COB|COB|B||||||3
587.588.533|0|ML|49|248.40|460.00|1|1|7|||COB|COB|M||||||3
587.588.534|0|ML|49|248.40|460.00|1|1|7|||CHO|CHO|B||||||3
587.588.535|0|ML|49|248.40|460.00|1|1|7|||CHO|CHO|M||||||3
587.588.536|0|ML|49|248.40|460.00|1|1|7|||VAG|VAG|B||||||3
587.588.537|0|ML|49|248.40|460.00|1|1|7|||VAG|VAG|M||||||3
587.588.538|0|ML|49|248.40|460.00|1|1|7|||AZE|AZE|B||||||3
587.588.539|0|ML|49|248.40|460.00|1|1|7|||AZE|AZE|M||||||3
587.588.540|0|ML|49|248.40|460.00|1|1|7|||AMA|AMA|B||||||3
587.588.541|0|ML|49|248.40|460.00|1|1|7|||AMA|AMA|M||||||3
587.588.542|0|ML|49|248.40|460.00|1|1|7|||AES|AES|B||||||3
587.588.543|0|ML|49|248.40|460.00|1|1|7|||AES|AES|M||||||3
587.588.544|0|ML|49|248.40|460.00|1|1|7|||PRA|PRA|B||||||3
587.588.545|0|ML|49|248.40|460.00|1|1|7|||PRA|PRA|M||||||3
587.588.546|0|ML|49|248.40|460.00|1|1|7|||ROS|ROS|B||||||3
587.588.547|0|ML|49|248.40|460.00|1|1|7|||ROS|ROS|M||||||3
587.588.548|0|ML|49|248.40|460.00|1|1|7|||VER|VER|B||||||3
587.588.549|0|ML|49|248.40|460.00|1|1|7|||VER|VER|M||||||3
587.588.550|0|ML|49|248.40|460.00|1|1|7|||AZB|AZB|||||||3
587.588.551|0|ML|49|248.40|460.00|1|1|7|||DEN|DEN|||||||3
587.588.552|0|ML|49|248.40|460.00|1|1|7|||BLK|BLK|||||||3
587.588.553|0|ML|49|248.40|460.00|1|1|7|||ART|ART|||||||3
587.588.554|0|ML|49|248.40|460.00|1|1|7|||LIN|LIN|||||||3
587.588.555|0|ML|49|248.40|460.00|1|1|7|||HAL|HAL|||||||3
589.590.394|0|ML|50|97.20|180.00|1|1|7|||TBR|TBR|||||||11
589.590.198|0|ML|50|97.20|180.00|1|1|7|||TEA|TEA|||||||11
589.590.199|0|ML|50|97.20|180.00|1|1|7|||OAK|OAK|||||||11
589.590.200|0|ML|50|97.20|180.00|1|1|7|||JOP|JOP|||||||11
589.590.395|0|ML|50|140.40|260.00|1|1|7|||TBR|BCO|B||||||11
589.590.396|0|ML|50|140.40|260.00|1|1|7|||TBR|BCO|M||||||11
589.590.397|0|ML|50|140.40|260.00|1|1|7|||TBR|CCL|B||||||11
589.590.398|0|ML|50|140.40|260.00|1|1|7|||TBR|CCL|M||||||11
589.590.399|0|ML|50|140.40|260.00|1|1|7|||TBR|CME|B||||||11
589.590.400|0|ML|50|140.40|260.00|1|1|7|||TBR|CME|M||||||11
589.590.401|0|ML|50|140.40|260.00|1|1|7|||TBR|ANT|B||||||11
589.590.402|0|ML|50|140.40|260.00|1|1|7|||TBR|ANT|M||||||11
589.590.403|0|ML|50|140.40|260.00|1|1|7|||TBR|PTO|B||||||11
589.590.404|0|ML|50|140.40|260.00|1|1|7|||TBR|PTO|M||||||11
589.590.405|0|ML|50|140.40|260.00|1|1|7|||TBR|CRE|B||||||11
589.590.406|0|ML|50|140.40|260.00|1|1|7|||TBR|CRE|M||||||11
589.590.407|0|ML|50|140.40|260.00|1|1|7|||TBR|CAM|B||||||11
589.590.408|0|ML|50|140.40|260.00|1|1|7|||TBR|CAM|M||||||11
589.590.409|0|ML|50|140.40|260.00|1|1|7|||TBR|OUR|B||||||11
589.590.410|0|ML|50|140.40|260.00|1|1|7|||TBR|OUR|M||||||11
589.590.411|0|ML|50|140.40|260.00|1|1|7|||TBR|COB|B||||||11
589.590.412|0|ML|50|140.40|260.00|1|1|7|||TBR|COB|M||||||11
589.590.413|0|ML|50|140.40|260.00|1|1|7|||TBR|CHO|B||||||11
589.590.414|0|ML|50|140.40|260.00|1|1|7|||TBR|CHO|M||||||11
589.590.415|0|ML|50|140.40|260.00|1|1|7|||TBR|VAG|B||||||11
589.590.416|0|ML|50|140.40|260.00|1|1|7|||TBR|VAG|M||||||11
589.590.417|0|ML|50|140.40|260.00|1|1|7|||TBR|AZE|B||||||11
589.590.418|0|ML|50|140.40|260.00|1|1|7|||TBR|AZE|M||||||11
589.590.419|0|ML|50|140.40|260.00|1|1|7|||TBR|AMA|B||||||11
589.590.420|0|ML|50|140.40|260.00|1|1|7|||TBR|AMA|M||||||11
589.590.421|0|ML|50|140.40|260.00|1|1|7|||TBR|AES|B||||||11
589.590.422|0|ML|50|140.40|260.00|1|1|7|||TBR|AES|M||||||11
589.590.423|0|ML|50|140.40|260.00|1|1|7|||TBR|PRA|B||||||11
589.590.424|0|ML|50|140.40|260.00|1|1|7|||TBR|PRA|M||||||11
589.590.425|0|ML|50|140.40|260.00|1|1|7|||TBR|ROS|B||||||11
589.590.426|0|ML|50|140.40|260.00|1|1|7|||TBR|ROS|M||||||11
589.590.427|0|ML|50|140.40|260.00|1|1|7|||TBR|VER|B||||||11
589.590.428|0|ML|50|140.40|260.00|1|1|7|||TBR|VER|M||||||11
589.590.429|0|ML|50|140.40|260.00|1|1|7|||TBR|AZB|||||||11
589.590.430|0|ML|50|140.40|260.00|1|1|7|||TBR|DEN|||||||11
589.590.431|0|ML|50|140.40|260.00|1|1|7|||TBR|BLK|||||||11
589.590.432|0|ML|50|140.40|260.00|1|1|7|||TBR|ART|||||||11
589.590.433|0|ML|50|140.40|260.00|1|1|7|||TBR|LIN|||||||11
589.590.434|0|ML|50|140.40|260.00|1|1|7|||TBR|HAL|||||||11
589.590.435|0|ML|50|162.00|300.00|1|1|7|||BCO|BCO|B||||||11
589.590.436|0|ML|50|162.00|300.00|1|1|7|||BCO|BCO|M||||||11
589.590.437|0|ML|50|162.00|300.00|1|1|7|||CCL|CCL|B||||||11
589.590.438|0|ML|50|162.00|300.00|1|1|7|||CCL|CCL|M||||||11
589.590.439|0|ML|50|162.00|300.00|1|1|7|||CME|CME|B||||||11
589.590.440|0|ML|50|162.00|300.00|1|1|7|||CME|CME|M||||||11
589.590.441|0|ML|50|162.00|300.00|1|1|7|||ANT|ANT|B||||||11
589.590.442|0|ML|50|162.00|300.00|1|1|7|||ANT|ANT|M||||||11
589.590.443|0|ML|50|162.00|300.00|1|1|7|||PTO|PTO|B||||||11
589.590.444|0|ML|50|162.00|300.00|1|1|7|||PTO|PTO|M||||||11
589.590.445|0|ML|50|162.00|300.00|1|1|7|||CRE|CRE|B||||||11
589.590.446|0|ML|50|162.00|300.00|1|1|7|||CRE|CRE|M||||||11
589.590.447|0|ML|50|162.00|300.00|1|1|7|||CAM|CAM|B||||||11
589.590.448|0|ML|50|162.00|300.00|1|1|7|||CAM|CAM|M||||||11
589.590.449|0|ML|50|162.00|300.00|1|1|7|||OUR|OUR|B||||||11
589.590.450|0|ML|50|162.00|300.00|1|1|7|||OUR|OUR|M||||||11
589.590.451|0|ML|50|162.00|300.00|1|1|7|||COB|COB|B||||||11
589.590.452|0|ML|50|162.00|300.00|1|1|7|||COB|COB|M||||||11
589.590.453|0|ML|50|162.00|300.00|1|1|7|||CHO|CHO|B||||||11
589.590.454|0|ML|50|162.00|300.00|1|1|7|||CHO|CHO|M||||||11
589.590.455|0|ML|50|162.00|300.00|1|1|7|||VAG|VAG|B||||||11
589.590.456|0|ML|50|162.00|300.00|1|1|7|||VAG|VAG|M||||||11
589.590.457|0|ML|50|162.00|300.00|1|1|7|||AZE|AZE|B||||||11
589.590.458|0|ML|50|162.00|300.00|1|1|7|||AZE|AZE|M||||||11
589.590.459|0|ML|50|162.00|300.00|1|1|7|||AMA|AMA|B||||||11
589.590.460|0|ML|50|162.00|300.00|1|1|7|||AMA|AMA|M||||||11
589.590.461|0|ML|50|162.00|300.00|1|1|7|||AES|AES|B||||||11
589.590.462|0|ML|50|162.00|300.00|1|1|7|||AES|AES|M||||||11
589.590.463|0|ML|50|162.00|300.00|1|1|7|||PRA|PRA|B||||||11
589.590.464|0|ML|50|162.00|300.00|1|1|7|||PRA|PRA|M||||||11
589.590.465|0|ML|50|162.00|300.00|1|1|7|||ROS|ROS|B||||||11
589.590.466|0|ML|50|162.00|300.00|1|1|7|||ROS|ROS|M||||||11
589.590.467|0|ML|50|162.00|300.00|1|1|7|||VER|VER|B||||||11
589.590.468|0|ML|50|162.00|300.00|1|1|7|||VER|VER|M||||||11
589.590.469|0|ML|50|162.00|300.00|1|1|7|||AZB|AZB|||||||11
589.590.470|0|ML|50|162.00|300.00|1|1|7|||DEN|DEN|||||||11
589.590.471|0|ML|50|162.00|300.00|1|1|7|||BLK|BLK|||||||11
589.590.472|0|ML|50|162.00|300.00|1|1|7|||ART|ART|||||||11
589.590.473|0|ML|50|162.00|300.00|1|1|7|||LIN|LIN|||||||11
589.590.474|0|ML|50|162.00|300.00|1|1|7|||HAL|HAL|||||||11
591.590.394|0|ML|50|103.68|192.00|1|1|7|||TBR|TBR|||||||12
591.590.198|0|ML|50|103.68|192.00|1|1|7|||TEA|TEA|||||||12
591.590.199|0|ML|50|103.68|192.00|1|1|7|||OAK|OAK|||||||12
591.590.200|0|ML|50|103.68|192.00|1|1|7|||JOP|JOP|||||||12
591.590.395|0|ML|50|146.88|272.00|1|1|7|||TBR|BCO|B||||||12
591.590.396|0|ML|50|146.88|272.00|1|1|7|||TBR|BCO|M||||||12
591.590.397|0|ML|50|146.88|272.00|1|1|7|||TBR|CCL|B||||||12
591.590.398|0|ML|50|146.88|272.00|1|1|7|||TBR|CCL|M||||||12
591.590.399|0|ML|50|146.88|272.00|1|1|7|||TBR|CME|B||||||12
591.590.400|0|ML|50|146.88|272.00|1|1|7|||TBR|CME|M||||||12
591.590.401|0|ML|50|146.88|272.00|1|1|7|||TBR|ANT|B||||||12
591.590.402|0|ML|50|146.88|272.00|1|1|7|||TBR|ANT|M||||||12
591.590.403|0|ML|50|146.88|272.00|1|1|7|||TBR|PTO|B||||||12
591.590.404|0|ML|50|146.88|272.00|1|1|7|||TBR|PTO|M||||||12
591.590.405|0|ML|50|146.88|272.00|1|1|7|||TBR|CRE|B||||||12
591.590.406|0|ML|50|146.88|272.00|1|1|7|||TBR|CRE|M||||||12
591.590.407|0|ML|50|146.88|272.00|1|1|7|||TBR|CAM|B||||||12
591.590.408|0|ML|50|146.88|272.00|1|1|7|||TBR|CAM|M||||||12
591.590.409|0|ML|50|146.88|272.00|1|1|7|||TBR|OUR|B||||||12
591.590.410|0|ML|50|146.88|272.00|1|1|7|||TBR|OUR|M||||||12
591.590.411|0|ML|50|146.88|272.00|1|1|7|||TBR|COB|B||||||12
591.590.412|0|ML|50|146.88|272.00|1|1|7|||TBR|COB|M||||||12
591.590.413|0|ML|50|146.88|272.00|1|1|7|||TBR|CHO|B||||||12
591.590.414|0|ML|50|146.88|272.00|1|1|7|||TBR|CHO|M||||||12
591.590.415|0|ML|50|146.88|272.00|1|1|7|||TBR|VAG|B||||||12
591.590.416|0|ML|50|146.88|272.00|1|1|7|||TBR|VAG|M||||||12
591.590.417|0|ML|50|146.88|272.00|1|1|7|||TBR|AZE|B||||||12
591.590.418|0|ML|50|146.88|272.00|1|1|7|||TBR|AZE|M||||||12
591.590.419|0|ML|50|146.88|272.00|1|1|7|||TBR|AMA|B||||||12
591.590.420|0|ML|50|146.88|272.00|1|1|7|||TBR|AMA|M||||||12
591.590.421|0|ML|50|146.88|272.00|1|1|7|||TBR|AES|B||||||12
591.590.422|0|ML|50|146.88|272.00|1|1|7|||TBR|AES|M||||||12
591.590.423|0|ML|50|146.88|272.00|1|1|7|||TBR|PRA|B||||||12
591.590.424|0|ML|50|146.88|272.00|1|1|7|||TBR|PRA|M||||||12
591.590.425|0|ML|50|146.88|272.00|1|1|7|||TBR|ROS|B||||||12
591.590.426|0|ML|50|146.88|272.00|1|1|7|||TBR|ROS|M||||||12
591.590.427|0|ML|50|146.88|272.00|1|1|7|||TBR|VER|B||||||12
591.590.428|0|ML|50|146.88|272.00|1|1|7|||TBR|VER|M||||||12
591.590.429|0|ML|50|146.88|272.00|1|1|7|||TBR|AZB|||||||12
591.590.430|0|ML|50|146.88|272.00|1|1|7|||TBR|DEN|||||||12
591.590.431|0|ML|50|146.88|272.00|1|1|7|||TBR|BLK|||||||12
591.590.432|0|ML|50|146.88|272.00|1|1|7|||TBR|ART|||||||12
591.590.433|0|ML|50|146.88|272.00|1|1|7|||TBR|LIN|||||||12
591.590.434|0|ML|50|146.88|272.00|1|1|7|||TBR|HAL|||||||12
591.590.435|0|ML|50|168.48|312.00|1|1|7|||BCO|BCO|B||||||12
591.590.436|0|ML|50|168.48|312.00|1|1|7|||BCO|BCO|M||||||12
591.590.437|0|ML|50|168.48|312.00|1|1|7|||CCL|CCL|B||||||12
591.590.438|0|ML|50|168.48|312.00|1|1|7|||CCL|CCL|M||||||12
591.590.439|0|ML|50|168.48|312.00|1|1|7|||CME|CME|B||||||12
591.590.440|0|ML|50|168.48|312.00|1|1|7|||CME|CME|M||||||12
591.590.441|0|ML|50|168.48|312.00|1|1|7|||ANT|ANT|B||||||12
591.590.442|0|ML|50|168.48|312.00|1|1|7|||ANT|ANT|M||||||12
591.590.443|0|ML|50|168.48|312.00|1|1|7|||PTO|PTO|B||||||12
591.590.444|0|ML|50|168.48|312.00|1|1|7|||PTO|PTO|M||||||12
591.590.445|0|ML|50|168.48|312.00|1|1|7|||CRE|CRE|B||||||12
591.590.446|0|ML|50|168.48|312.00|1|1|7|||CRE|CRE|M||||||12
591.590.447|0|ML|50|168.48|312.00|1|1|7|||CAM|CAM|B||||||12
591.590.448|0|ML|50|168.48|312.00|1|1|7|||CAM|CAM|M||||||12
591.590.449|0|ML|50|168.48|312.00|1|1|7|||OUR|OUR|B||||||12
591.590.450|0|ML|50|168.48|312.00|1|1|7|||OUR|OUR|M||||||12
591.590.451|0|ML|50|168.48|312.00|1|1|7|||COB|COB|B||||||12
591.590.452|0|ML|50|168.48|312.00|1|1|7|||COB|COB|M||||||12
591.590.453|0|ML|50|168.48|312.00|1|1|7|||CHO|CHO|B||||||12
591.590.454|0|ML|50|168.48|312.00|1|1|7|||CHO|CHO|M||||||12
591.590.455|0|ML|50|168.48|312.00|1|1|7|||VAG|VAG|B||||||12
591.590.456|0|ML|50|168.48|312.00|1|1|7|||VAG|VAG|M||||||12
591.590.457|0|ML|50|168.48|312.00|1|1|7|||AZE|AZE|B||||||12
591.590.458|0|ML|50|168.48|312.00|1|1|7|||AZE|AZE|M||||||12
591.590.459|0|ML|50|168.48|312.00|1|1|7|||AMA|AMA|B||||||12
591.590.460|0|ML|50|168.48|312.00|1|1|7|||AMA|AMA|M||||||12
591.590.461|0|ML|50|168.48|312.00|1|1|7|||AES|AES|B||||||12
591.590.462|0|ML|50|168.48|312.00|1|1|7|||AES|AES|M||||||12
591.590.463|0|ML|50|168.48|312.00|1|1|7|||PRA|PRA|B||||||12
591.590.464|0|ML|50|168.48|312.00|1|1|7|||PRA|PRA|M||||||12
591.590.465|0|ML|50|168.48|312.00|1|1|7|||ROS|ROS|B||||||12
591.590.466|0|ML|50|168.48|312.00|1|1|7|||ROS|ROS|M||||||12
591.590.467|0|ML|50|168.48|312.00|1|1|7|||VER|VER|B||||||12
591.590.468|0|ML|50|168.48|312.00|1|1|7|||VER|VER|M||||||12
591.590.469|0|ML|50|168.48|312.00|1|1|7|||AZB|AZB|||||||12
591.590.470|0|ML|50|168.48|312.00|1|1|7|||DEN|DEN|||||||12
591.590.471|0|ML|50|168.48|312.00|1|1|7|||BLK|BLK|||||||12
591.590.472|0|ML|50|168.48|312.00|1|1|7|||ART|ART|||||||12
591.590.473|0|ML|50|168.48|312.00|1|1|7|||LIN|LIN|||||||12
591.590.474|0|ML|50|168.48|312.00|1|1|7|||HAL|HAL|||||||12
592.593.394|0|ML|51|86.94|161.00|1|1|8|||TBR|TBR|||||||20
592.593.198|0|ML|51|86.94|161.00|1|1|8|||TEA|TEA|||||||20
592.593.199|0|ML|51|86.94|161.00|1|1|8|||OAK|OAK|||||||20
592.593.200|0|ML|51|86.94|161.00|1|1|8|||JOP|JOP|||||||20
592.593.395|0|ML|51|130.14|241.00|1|1|8|||TBR|BCO|B||||||20
592.593.396|0|ML|51|130.14|241.00|1|1|8|||TBR|BCO|M||||||20
592.593.397|0|ML|51|130.14|241.00|1|1|8|||TBR|CCL|B||||||20
592.593.398|0|ML|51|130.14|241.00|1|1|8|||TBR|CCL|M||||||20
592.593.399|0|ML|51|130.14|241.00|1|1|8|||TBR|CME|B||||||20
592.593.400|0|ML|51|130.14|241.00|1|1|8|||TBR|CME|M||||||20
592.593.401|0|ML|51|130.14|241.00|1|1|8|||TBR|ANT|B||||||20
592.593.402|0|ML|51|130.14|241.00|1|1|8|||TBR|ANT|M||||||20
592.593.403|0|ML|51|130.14|241.00|1|1|8|||TBR|PTO|B||||||20
592.593.404|0|ML|51|130.14|241.00|1|1|8|||TBR|PTO|M||||||20
592.593.405|0|ML|51|130.14|241.00|1|1|8|||TBR|CRE|B||||||20
592.593.406|0|ML|51|130.14|241.00|1|1|8|||TBR|CRE|M||||||20
592.593.407|0|ML|51|130.14|241.00|1|1|8|||TBR|CAM|B||||||20
592.593.408|0|ML|51|130.14|241.00|1|1|8|||TBR|CAM|M||||||20
592.593.409|0|ML|51|130.14|241.00|1|1|8|||TBR|OUR|B||||||20
592.593.410|0|ML|51|130.14|241.00|1|1|8|||TBR|OUR|M||||||20
592.593.411|0|ML|51|130.14|241.00|1|1|8|||TBR|COB|B||||||20
592.593.412|0|ML|51|130.14|241.00|1|1|8|||TBR|COB|M||||||20
592.593.413|0|ML|51|130.14|241.00|1|1|8|||TBR|CHO|B||||||20
592.593.414|0|ML|51|130.14|241.00|1|1|8|||TBR|CHO|M||||||20
592.593.415|0|ML|51|130.14|241.00|1|1|8|||TBR|VAG|B||||||20
592.593.416|0|ML|51|130.14|241.00|1|1|8|||TBR|VAG|M||||||20
592.593.417|0|ML|51|130.14|241.00|1|1|8|||TBR|AZE|B||||||20
592.593.418|0|ML|51|130.14|241.00|1|1|8|||TBR|AZE|M||||||20
592.593.419|0|ML|51|130.14|241.00|1|1|8|||TBR|AMA|B||||||20
592.593.420|0|ML|51|130.14|241.00|1|1|8|||TBR|AMA|M||||||20
592.593.421|0|ML|51|130.14|241.00|1|1|8|||TBR|AES|B||||||20
592.593.422|0|ML|51|130.14|241.00|1|1|8|||TBR|AES|M||||||20
592.593.423|0|ML|51|130.14|241.00|1|1|8|||TBR|PRA|B||||||20
592.593.424|0|ML|51|130.14|241.00|1|1|8|||TBR|PRA|M||||||20
592.593.425|0|ML|51|130.14|241.00|1|1|8|||TBR|ROS|B||||||20
592.593.426|0|ML|51|130.14|241.00|1|1|8|||TBR|ROS|M||||||20
592.593.427|0|ML|51|130.14|241.00|1|1|8|||TBR|VER|B||||||20
592.593.428|0|ML|51|130.14|241.00|1|1|8|||TBR|VER|M||||||20
592.593.429|0|ML|51|130.14|241.00|1|1|8|||TBR|AZB|||||||20
592.593.430|0|ML|51|130.14|241.00|1|1|8|||TBR|DEN|||||||20
592.593.431|0|ML|51|130.14|241.00|1|1|8|||TBR|BLK|||||||20
592.593.432|0|ML|51|130.14|241.00|1|1|8|||TBR|ART|||||||20
592.593.433|0|ML|51|130.14|241.00|1|1|8|||TBR|LIN|||||||20
592.593.434|0|ML|51|130.14|241.00|1|1|8|||TBR|HAL|||||||20
592.593.435|0|ML|51|151.74|281.00|1|1|8|||BCO|BCO|B||||||20
592.593.436|0|ML|51|151.74|281.00|1|1|8|||BCO|BCO|M||||||20
592.593.437|0|ML|51|151.74|281.00|1|1|8|||CCL|CCL|B||||||20
592.593.438|0|ML|51|151.74|281.00|1|1|8|||CCL|CCL|M||||||20
592.593.439|0|ML|51|151.74|281.00|1|1|8|||CME|CME|B||||||20
592.593.440|0|ML|51|151.74|281.00|1|1|8|||CME|CME|M||||||20
592.593.441|0|ML|51|151.74|281.00|1|1|8|||ANT|ANT|B||||||20
592.593.442|0|ML|51|151.74|281.00|1|1|8|||ANT|ANT|M||||||20
592.593.443|0|ML|51|151.74|281.00|1|1|8|||PTO|PTO|B||||||20
592.593.444|0|ML|51|151.74|281.00|1|1|8|||PTO|PTO|M||||||20
592.593.445|0|ML|51|151.74|281.00|1|1|8|||CRE|CRE|B||||||20
592.593.446|0|ML|51|151.74|281.00|1|1|8|||CRE|CRE|M||||||20
592.593.447|0|ML|51|151.74|281.00|1|1|8|||CAM|CAM|B||||||20
592.593.448|0|ML|51|151.74|281.00|1|1|8|||CAM|CAM|M||||||20
592.593.449|0|ML|51|151.74|281.00|1|1|8|||OUR|OUR|B||||||20
592.593.450|0|ML|51|151.74|281.00|1|1|8|||OUR|OUR|M||||||20
592.593.451|0|ML|51|151.74|281.00|1|1|8|||COB|COB|B||||||20
592.593.452|0|ML|51|151.74|281.00|1|1|8|||COB|COB|M||||||20
592.593.453|0|ML|51|151.74|281.00|1|1|8|||CHO|CHO|B||||||20
592.593.454|0|ML|51|151.74|281.00|1|1|8|||CHO|CHO|M||||||20
592.593.455|0|ML|51|151.74|281.00|1|1|8|||VAG|VAG|B||||||20
592.593.456|0|ML|51|151.74|281.00|1|1|8|||VAG|VAG|M||||||20
592.593.457|0|ML|51|151.74|281.00|1|1|8|||AZE|AZE|B||||||20
592.593.458|0|ML|51|151.74|281.00|1|1|8|||AZE|AZE|M||||||20
592.593.459|0|ML|51|151.74|281.00|1|1|8|||AMA|AMA|B||||||20
592.593.460|0|ML|51|151.74|281.00|1|1|8|||AMA|AMA|M||||||20
592.593.461|0|ML|51|151.74|281.00|1|1|8|||AES|AES|B||||||20
592.593.462|0|ML|51|151.74|281.00|1|1|8|||AES|AES|M||||||20
592.593.463|0|ML|51|151.74|281.00|1|1|8|||PRA|PRA|B||||||20
592.593.464|0|ML|51|151.74|281.00|1|1|8|||PRA|PRA|M||||||20
592.593.465|0|ML|51|151.74|281.00|1|1|8|||ROS|ROS|B||||||20
592.593.466|0|ML|51|151.74|281.00|1|1|8|||ROS|ROS|M||||||20
592.593.467|0|ML|51|151.74|281.00|1|1|8|||VER|VER|B||||||20
592.593.468|0|ML|51|151.74|281.00|1|1|8|||VER|VER|M||||||20
592.593.469|0|ML|51|151.74|281.00|1|1|8|||AZB|AZB|||||||20
592.593.470|0|ML|51|151.74|281.00|1|1|8|||DEN|DEN|||||||20
592.593.471|0|ML|51|151.74|281.00|1|1|8|||BLK|BLK|||||||20
592.593.472|0|ML|51|151.74|281.00|1|1|8|||ART|ART|||||||20
592.593.473|0|ML|51|151.74|281.00|1|1|8|||LIN|LIN|||||||20
592.593.474|0|ML|51|151.74|281.00|1|1|8|||HAL|HAL|||||||20
594.593.394|0|ML|51|99.36|184.00|1|1|8|||TBR|TBR|||||||21
594.593.198|0|ML|51|99.36|184.00|1|1|8|||TEA|TEA|||||||21
594.593.199|0|ML|51|99.36|184.00|1|1|8|||OAK|OAK|||||||21
594.593.200|0|ML|51|99.36|184.00|1|1|8|||JOP|JOP|||||||21
594.593.395|0|ML|51|142.56|264.00|1|1|8|||TBR|BCO|B||||||21
594.593.396|0|ML|51|142.56|264.00|1|1|8|||TBR|BCO|M||||||21
594.593.397|0|ML|51|142.56|264.00|1|1|8|||TBR|CCL|B||||||21
594.593.398|0|ML|51|142.56|264.00|1|1|8|||TBR|CCL|M||||||21
594.593.399|0|ML|51|142.56|264.00|1|1|8|||TBR|CME|B||||||21
594.593.400|0|ML|51|142.56|264.00|1|1|8|||TBR|CME|M||||||21
594.593.401|0|ML|51|142.56|264.00|1|1|8|||TBR|ANT|B||||||21
594.593.402|0|ML|51|142.56|264.00|1|1|8|||TBR|ANT|M||||||21
594.593.403|0|ML|51|142.56|264.00|1|1|8|||TBR|PTO|B||||||21
594.593.404|0|ML|51|142.56|264.00|1|1|8|||TBR|PTO|M||||||21
594.593.405|0|ML|51|142.56|264.00|1|1|8|||TBR|CRE|B||||||21
594.593.406|0|ML|51|142.56|264.00|1|1|8|||TBR|CRE|M||||||21
594.593.407|0|ML|51|142.56|264.00|1|1|8|||TBR|CAM|B||||||21
594.593.408|0|ML|51|142.56|264.00|1|1|8|||TBR|CAM|M||||||21
594.593.409|0|ML|51|142.56|264.00|1|1|8|||TBR|OUR|B||||||21
594.593.410|0|ML|51|142.56|264.00|1|1|8|||TBR|OUR|M||||||21
594.593.411|0|ML|51|142.56|264.00|1|1|8|||TBR|COB|B||||||21
594.593.412|0|ML|51|142.56|264.00|1|1|8|||TBR|COB|M||||||21
594.593.413|0|ML|51|142.56|264.00|1|1|8|||TBR|CHO|B||||||21
594.593.414|0|ML|51|142.56|264.00|1|1|8|||TBR|CHO|M||||||21
594.593.415|0|ML|51|142.56|264.00|1|1|8|||TBR|VAG|B||||||21
594.593.416|0|ML|51|142.56|264.00|1|1|8|||TBR|VAG|M||||||21
594.593.417|0|ML|51|142.56|264.00|1|1|8|||TBR|AZE|B||||||21
594.593.418|0|ML|51|142.56|264.00|1|1|8|||TBR|AZE|M||||||21
594.593.419|0|ML|51|142.56|264.00|1|1|8|||TBR|AMA|B||||||21
594.593.420|0|ML|51|142.56|264.00|1|1|8|||TBR|AMA|M||||||21
594.593.421|0|ML|51|142.56|264.00|1|1|8|||TBR|AES|B||||||21
594.593.422|0|ML|51|142.56|264.00|1|1|8|||TBR|AES|M||||||21
594.593.423|0|ML|51|142.56|264.00|1|1|8|||TBR|PRA|B||||||21
594.593.424|0|ML|51|142.56|264.00|1|1|8|||TBR|PRA|M||||||21
594.593.425|0|ML|51|142.56|264.00|1|1|8|||TBR|ROS|B||||||21
594.593.426|0|ML|51|142.56|264.00|1|1|8|||TBR|ROS|M||||||21
594.593.427|0|ML|51|142.56|264.00|1|1|8|||TBR|VER|B||||||21
594.593.428|0|ML|51|142.56|264.00|1|1|8|||TBR|VER|M||||||21
594.593.429|0|ML|51|142.56|264.00|1|1|8|||TBR|AZB|||||||21
594.593.430|0|ML|51|142.56|264.00|1|1|8|||TBR|DEN|||||||21
594.593.431|0|ML|51|142.56|264.00|1|1|8|||TBR|BLK|||||||21
594.593.432|0|ML|51|142.56|264.00|1|1|8|||TBR|ART|||||||21
594.593.433|0|ML|51|142.56|264.00|1|1|8|||TBR|LIN|||||||21
594.593.434|0|ML|51|142.56|264.00|1|1|8|||TBR|HAL|||||||21
594.593.435|0|ML|51|164.16|304.00|1|1|8|||BCO|BCO|B||||||21
594.593.436|0|ML|51|164.16|304.00|1|1|8|||BCO|BCO|M||||||21
594.593.437|0|ML|51|164.16|304.00|1|1|8|||CCL|CCL|B||||||21
594.593.438|0|ML|51|164.16|304.00|1|1|8|||CCL|CCL|M||||||21
594.593.439|0|ML|51|164.16|304.00|1|1|8|||CME|CME|B||||||21
594.593.440|0|ML|51|164.16|304.00|1|1|8|||CME|CME|M||||||21
594.593.441|0|ML|51|164.16|304.00|1|1|8|||ANT|ANT|B||||||21
594.593.442|0|ML|51|164.16|304.00|1|1|8|||ANT|ANT|M||||||21
594.593.443|0|ML|51|164.16|304.00|1|1|8|||PTO|PTO|B||||||21
594.593.444|0|ML|51|164.16|304.00|1|1|8|||PTO|PTO|M||||||21
594.593.445|0|ML|51|164.16|304.00|1|1|8|||CRE|CRE|B||||||21
594.593.446|0|ML|51|164.16|304.00|1|1|8|||CRE|CRE|M||||||21
594.593.447|0|ML|51|164.16|304.00|1|1|8|||CAM|CAM|B||||||21
594.593.448|0|ML|51|164.16|304.00|1|1|8|||CAM|CAM|M||||||21
594.593.449|0|ML|51|164.16|304.00|1|1|8|||OUR|OUR|B||||||21
594.593.450|0|ML|51|164.16|304.00|1|1|8|||OUR|OUR|M||||||21
594.593.451|0|ML|51|164.16|304.00|1|1|8|||COB|COB|B||||||21
594.593.452|0|ML|51|164.16|304.00|1|1|8|||COB|COB|M||||||21
594.593.453|0|ML|51|164.16|304.00|1|1|8|||CHO|CHO|B||||||21
594.593.454|0|ML|51|164.16|304.00|1|1|8|||CHO|CHO|M||||||21
594.593.455|0|ML|51|164.16|304.00|1|1|8|||VAG|VAG|B||||||21
594.593.456|0|ML|51|164.16|304.00|1|1|8|||VAG|VAG|M||||||21
594.593.457|0|ML|51|164.16|304.00|1|1|8|||AZE|AZE|B||||||21
594.593.458|0|ML|51|164.16|304.00|1|1|8|||AZE|AZE|M||||||21
594.593.459|0|ML|51|164.16|304.00|1|1|8|||AMA|AMA|B||||||21
594.593.460|0|ML|51|164.16|304.00|1|1|8|||AMA|AMA|M||||||21
594.593.461|0|ML|51|164.16|304.00|1|1|8|||AES|AES|B||||||21
594.593.462|0|ML|51|164.16|304.00|1|1|8|||AES|AES|M||||||21
594.593.463|0|ML|51|164.16|304.00|1|1|8|||PRA|PRA|B||||||21
594.593.464|0|ML|51|164.16|304.00|1|1|8|||PRA|PRA|M||||||21
594.593.465|0|ML|51|164.16|304.00|1|1|8|||ROS|ROS|B||||||21
594.593.466|0|ML|51|164.16|304.00|1|1|8|||ROS|ROS|M||||||21
594.593.467|0|ML|51|164.16|304.00|1|1|8|||VER|VER|B||||||21
594.593.468|0|ML|51|164.16|304.00|1|1|8|||VER|VER|M||||||21
594.593.469|0|ML|51|164.16|304.00|1|1|8|||AZB|AZB|||||||21
594.593.470|0|ML|51|164.16|304.00|1|1|8|||DEN|DEN|||||||21
594.593.471|0|ML|51|164.16|304.00|1|1|8|||BLK|BLK|||||||21
594.593.472|0|ML|51|164.16|304.00|1|1|8|||ART|ART|||||||21
594.593.473|0|ML|51|164.16|304.00|1|1|8|||LIN|LIN|||||||21
594.593.474|0|ML|51|164.16|304.00|1|1|8|||HAL|HAL|||||||21
595.596.394|0|ML|52|124.20|230.00|1|1|8|||TBR|TBR|||||||23
595.596.198|0|ML|52|124.20|230.00|1|1|8|||TEA|TEA|||||||23
595.596.199|0|ML|52|124.20|230.00|1|1|8|||OAK|OAK|||||||23
595.596.200|0|ML|52|124.20|230.00|1|1|8|||JOP|JOP|||||||23
595.596.395|0|ML|52|167.40|310.00|1|1|8|||TBR|BCO|B||||||23
595.596.396|0|ML|52|167.40|310.00|1|1|8|||TBR|BCO|M||||||23
595.596.397|0|ML|52|167.40|310.00|1|1|8|||TBR|CCL|B||||||23
595.596.398|0|ML|52|167.40|310.00|1|1|8|||TBR|CCL|M||||||23
595.596.399|0|ML|52|167.40|310.00|1|1|8|||TBR|CME|B||||||23
595.596.400|0|ML|52|167.40|310.00|1|1|8|||TBR|CME|M||||||23
595.596.401|0|ML|52|167.40|310.00|1|1|8|||TBR|ANT|B||||||23
595.596.402|0|ML|52|167.40|310.00|1|1|8|||TBR|ANT|M||||||23
595.596.403|0|ML|52|167.40|310.00|1|1|8|||TBR|PTO|B||||||23
595.596.404|0|ML|52|167.40|310.00|1|1|8|||TBR|PTO|M||||||23
595.596.405|0|ML|52|167.40|310.00|1|1|8|||TBR|CRE|B||||||23
595.596.406|0|ML|52|167.40|310.00|1|1|8|||TBR|CRE|M||||||23
595.596.407|0|ML|52|167.40|310.00|1|1|8|||TBR|CAM|B||||||23
595.596.408|0|ML|52|167.40|310.00|1|1|8|||TBR|CAM|M||||||23
595.596.409|0|ML|52|167.40|310.00|1|1|8|||TBR|OUR|B||||||23
595.596.410|0|ML|52|167.40|310.00|1|1|8|||TBR|OUR|M||||||23
595.596.411|0|ML|52|167.40|310.00|1|1|8|||TBR|COB|B||||||23
595.596.412|0|ML|52|167.40|310.00|1|1|8|||TBR|COB|M||||||23
595.596.413|0|ML|52|167.40|310.00|1|1|8|||TBR|CHO|B||||||23
595.596.414|0|ML|52|167.40|310.00|1|1|8|||TBR|CHO|M||||||23
595.596.415|0|ML|52|167.40|310.00|1|1|8|||TBR|VAG|B||||||23
595.596.416|0|ML|52|167.40|310.00|1|1|8|||TBR|VAG|M||||||23
595.596.417|0|ML|52|167.40|310.00|1|1|8|||TBR|AZE|B||||||23
595.596.418|0|ML|52|167.40|310.00|1|1|8|||TBR|AZE|M||||||23
595.596.419|0|ML|52|167.40|310.00|1|1|8|||TBR|AMA|B||||||23
595.596.420|0|ML|52|167.40|310.00|1|1|8|||TBR|AMA|M||||||23
595.596.421|0|ML|52|167.40|310.00|1|1|8|||TBR|AES|B||||||23
595.596.422|0|ML|52|167.40|310.00|1|1|8|||TBR|AES|M||||||23
595.596.423|0|ML|52|167.40|310.00|1|1|8|||TBR|PRA|B||||||23
595.596.424|0|ML|52|167.40|310.00|1|1|8|||TBR|PRA|M||||||23
595.596.425|0|ML|52|167.40|310.00|1|1|8|||TBR|ROS|B||||||23
595.596.426|0|ML|52|167.40|310.00|1|1|8|||TBR|ROS|M||||||23
595.596.427|0|ML|52|167.40|310.00|1|1|8|||TBR|VER|B||||||23
595.596.428|0|ML|52|167.40|310.00|1|1|8|||TBR|VER|M||||||23
595.596.429|0|ML|52|167.40|310.00|1|1|8|||TBR|AZB|||||||23
595.596.430|0|ML|52|167.40|310.00|1|1|8|||TBR|DEN|||||||23
595.596.431|0|ML|52|167.40|310.00|1|1|8|||TBR|BLK|||||||23
595.596.432|0|ML|52|167.40|310.00|1|1|8|||TBR|ART|||||||23
595.596.433|0|ML|52|167.40|310.00|1|1|8|||TBR|LIN|||||||23
595.596.434|0|ML|52|167.40|310.00|1|1|8|||TBR|HAL|||||||23
595.596.435|0|ML|52|189.00|350.00|1|1|8|||BCO|BCO|B||||||23
595.596.436|0|ML|52|189.00|350.00|1|1|8|||BCO|BCO|M||||||23
595.596.437|0|ML|52|189.00|350.00|1|1|8|||CCL|CCL|B||||||23
595.596.438|0|ML|52|189.00|350.00|1|1|8|||CCL|CCL|M||||||23
595.596.439|0|ML|52|189.00|350.00|1|1|8|||CME|CME|B||||||23
595.596.440|0|ML|52|189.00|350.00|1|1|8|||CME|CME|M||||||23
595.596.441|0|ML|52|189.00|350.00|1|1|8|||ANT|ANT|B||||||23
595.596.442|0|ML|52|189.00|350.00|1|1|8|||ANT|ANT|M||||||23
595.596.443|0|ML|52|189.00|350.00|1|1|8|||PTO|PTO|B||||||23
595.596.444|0|ML|52|189.00|350.00|1|1|8|||PTO|PTO|M||||||23
595.596.445|0|ML|52|189.00|350.00|1|1|8|||CRE|CRE|B||||||23
595.596.446|0|ML|52|189.00|350.00|1|1|8|||CRE|CRE|M||||||23
595.596.447|0|ML|52|189.00|350.00|1|1|8|||CAM|CAM|B||||||23
595.596.448|0|ML|52|189.00|350.00|1|1|8|||CAM|CAM|M||||||23
595.596.449|0|ML|52|189.00|350.00|1|1|8|||OUR|OUR|B||||||23
595.596.450|0|ML|52|189.00|350.00|1|1|8|||OUR|OUR|M||||||23
595.596.451|0|ML|52|189.00|350.00|1|1|8|||COB|COB|B||||||23
595.596.452|0|ML|52|189.00|350.00|1|1|8|||COB|COB|M||||||23
595.596.453|0|ML|52|189.00|350.00|1|1|8|||CHO|CHO|B||||||23
595.596.454|0|ML|52|189.00|350.00|1|1|8|||CHO|CHO|M||||||23
595.596.455|0|ML|52|189.00|350.00|1|1|8|||VAG|VAG|B||||||23
595.596.456|0|ML|52|189.00|350.00|1|1|8|||VAG|VAG|M||||||23
595.596.457|0|ML|52|189.00|350.00|1|1|8|||AZE|AZE|B||||||23
595.596.458|0|ML|52|189.00|350.00|1|1|8|||AZE|AZE|M||||||23
595.596.459|0|ML|52|189.00|350.00|1|1|8|||AMA|AMA|B||||||23
595.596.460|0|ML|52|189.00|350.00|1|1|8|||AMA|AMA|M||||||23
595.596.461|0|ML|52|189.00|350.00|1|1|8|||AES|AES|B||||||23
595.596.462|0|ML|52|189.00|350.00|1|1|8|||AES|AES|M||||||23
595.596.463|0|ML|52|189.00|350.00|1|1|8|||PRA|PRA|B||||||23
595.596.464|0|ML|52|189.00|350.00|1|1|8|||PRA|PRA|M||||||23
595.596.465|0|ML|52|189.00|350.00|1|1|8|||ROS|ROS|B||||||23
595.596.466|0|ML|52|189.00|350.00|1|1|8|||ROS|ROS|M||||||23
595.596.467|0|ML|52|189.00|350.00|1|1|8|||VER|VER|B||||||23
595.596.468|0|ML|52|189.00|350.00|1|1|8|||VER|VER|M||||||23
595.596.469|0|ML|52|189.00|350.00|1|1|8|||AZB|AZB|||||||23
595.596.470|0|ML|52|189.00|350.00|1|1|8|||DEN|DEN|||||||23
595.596.471|0|ML|52|189.00|350.00|1|1|8|||BLK|BLK|||||||23
595.596.472|0|ML|52|189.00|350.00|1|1|8|||ART|ART|||||||23
595.596.473|0|ML|52|189.00|350.00|1|1|8|||LIN|LIN|||||||23
595.596.474|0|ML|52|189.00|350.00|1|1|8|||HAL|HAL|||||||23
597.598.599|0|ML|53|166.44|292.00|2|2|9|43101||ARN|FC||H|TN|||60|
597.598.600|0|ML|53|166.44|292.00|2|2|9|43101||ARN|FC||H|TP|||60|
597.598.601|0|ML|53|166.44|292.00|2|2|9|43101||AEC|FC||H|TN|||60|
597.598.602|0|ML|53|166.44|292.00|2|2|9|43101||AEC|FC||H|TP|||60|
597.598.603|0|ML|53|166.44|292.00|2|2|9|43101||AOC|FO||H|TN|||60|
597.598.604|0|ML|53|166.44|292.00|2|2|9|43101||AOC|FO||H|TP|||60|
597.598.605|0|ML|53|166.44|292.00|2|2|9|43101||AEO|FO||H|TN|||60|
597.598.606|0|ML|53|166.44|292.00|2|2|9|43101||AEO|FO||H|TP|||60|
607.598.599|0|ML|53|171.00|300.00|2|2|9|43101||ARN|FC||H|TN|||70|
607.598.600|0|ML|53|171.00|300.00|2|2|9|43101||ARN|FC||H|TP|||70|
607.598.601|0|ML|53|171.00|300.00|2|2|9|43101||AEC|FC||H|TN|||70|
607.598.602|0|ML|53|171.00|300.00|2|2|9|43101||AEC|FC||H|TP|||70|
607.598.603|0|ML|53|171.00|300.00|2|2|9|43101||AOC|FO||H|TN|||70|
607.598.604|0|ML|53|171.00|300.00|2|2|9|43101||AOC|FO||H|TP|||70|
607.598.605|0|ML|53|171.00|300.00|2|2|9|43101||AEO|FO||H|TN|||70|
607.598.606|0|ML|53|171.00|300.00|2|2|9|43101||AEO|FO||H|TP|||70|
608.598.599|0|ML|53|177.84|312.00|2|2|9|43101||ARN|FC||H|TN|||80|
608.598.600|0|ML|53|177.84|312.00|2|2|9|43101||ARN|FC||H|TP|||80|
608.598.601|0|ML|53|177.84|312.00|2|2|9|43101||AEC|FC||H|TN|||80|
608.598.602|0|ML|53|177.84|312.00|2|2|9|43101||AEC|FC||H|TP|||80|
608.598.603|0|ML|53|177.84|312.00|2|2|9|43101||AOC|FO||H|TN|||80|
608.598.604|0|ML|53|177.84|312.00|2|2|9|43101||AOC|FO||H|TP|||80|
608.598.605|0|ML|53|177.84|312.00|2|2|9|43101||AEO|FO||H|TN|||80|
608.598.606|0|ML|53|177.84|312.00|2|2|9|43101||AEO|FO||H|TP|||80|
609.598.599|0|ML|53|185.25|325.00|2|2|9|43101||ARN|FC||H|TN|||90|
609.598.600|0|ML|53|185.25|325.00|2|2|9|43101||ARN|FC||H|TP|||90|
609.598.601|0|ML|53|185.25|325.00|2|2|9|43101||AEC|FC||H|TN|||90|
609.598.602|0|ML|53|185.25|325.00|2|2|9|43101||AEC|FC||H|TP|||90|
609.598.603|0|ML|53|185.25|325.00|2|2|9|43101||AOC|FO||H|TN|||90|
609.598.604|0|ML|53|185.25|325.00|2|2|9|43101||AOC|FO||H|TP|||90|
609.598.605|0|ML|53|185.25|325.00|2|2|9|43101||AEO|FO||H|TN|||90|
609.598.606|0|ML|53|185.25|325.00|2|2|9|43101||AEO|FO||H|TP|||90|
610.598.599|0|ML|53|200.07|351.00|2|2|9|43101||ARN|FC||H|TN|||100|
610.598.600|0|ML|53|200.07|351.00|2|2|9|43101||ARN|FC||H|TP|||100|
610.598.601|0|ML|53|200.07|351.00|2|2|9|43101||AEC|FC||H|TN|||100|
610.598.602|0|ML|53|200.07|351.00|2|2|9|43101||AEC|FC||H|TP|||100|
610.598.603|0|ML|53|200.07|351.00|2|2|9|43101||AOC|FO||H|TN|||100|
610.598.604|0|ML|53|200.07|351.00|2|2|9|43101||AOC|FO||H|TP|||100|
610.598.605|0|ML|53|200.07|351.00|2|2|9|43101||AEO|FO||H|TN|||100|
610.598.606|0|ML|53|200.07|351.00|2|2|9|43101||AEO|FO||H|TP|||100|
611.598.599|0|ML|53|205.77|361.00|2|2|9|43101||ARN|FC||H|TN|||120|
611.598.600|0|ML|53|205.77|361.00|2|2|9|43101||ARN|FC||H|TP|||120|
611.598.601|0|ML|53|205.77|361.00|2|2|9|43101||AEC|FC||H|TN|||120|
611.598.602|0|ML|53|205.77|361.00|2|2|9|43101||AEC|FC||H|TP|||120|
611.598.603|0|ML|53|205.77|361.00|2|2|9|43101||AOC|FO||H|TN|||120|
611.598.604|0|ML|53|205.77|361.00|2|2|9|43101||AOC|FO||H|TP|||120|
611.598.605|0|ML|53|205.77|361.00|2|2|9|43101||AEO|FO||H|TN|||120|
611.598.606|0|ML|53|205.77|361.00|2|2|9|43101||AEO|FO||H|TP|||120|
597.612.599|0|ML|53|166.44|292.00|2|2|10|44101||ARN|FC||V|TN|||60|
597.612.600|0|ML|53|166.44|292.00|2|2|10|44101||ARN|FC||V|TP|||60|
597.612.601|0|ML|53|166.44|292.00|2|2|10|44101||AEC|FC||V|TN|||60|
597.612.602|0|ML|53|166.44|292.00|2|2|10|44101||AEC|FC||V|TP|||60|
597.612.603|0|ML|53|166.44|292.00|2|2|10|44101||AOC|FO||V|TN|||60|
597.612.604|0|ML|53|166.44|292.00|2|2|10|44101||AOC|FO||V|TP|||60|
597.612.605|0|ML|53|166.44|292.00|2|2|10|44101||AEO|FO||V|TN|||60|
597.612.606|0|ML|53|166.44|292.00|2|2|10|44101||AEO|FO||V|TP|||60|
607.612.599|0|ML|53|171.00|300.00|2|2|10|44101||ARN|FC||V|TN|||70|
607.612.600|0|ML|53|171.00|300.00|2|2|10|44101||ARN|FC||V|TP|||70|
607.612.601|0|ML|53|171.00|300.00|2|2|10|44101||AEC|FC||V|TN|||70|
607.612.602|0|ML|53|171.00|300.00|2|2|10|44101||AEC|FC||V|TP|||70|
607.612.603|0|ML|53|171.00|300.00|2|2|10|44101||AOC|FO||V|TN|||70|
607.612.604|0|ML|53|171.00|300.00|2|2|10|44101||AOC|FO||V|TP|||70|
607.612.605|0|ML|53|171.00|300.00|2|2|10|44101||AEO|FO||V|TN|||70|
607.612.606|0|ML|53|171.00|300.00|2|2|10|44101||AEO|FO||V|TP|||70|
608.612.599|0|ML|53|177.84|312.00|2|2|10|44101||ARN|FC||V|TN|||80|
608.612.600|0|ML|53|177.84|312.00|2|2|10|44101||ARN|FC||V|TP|||80|
608.612.601|0|ML|53|177.84|312.00|2|2|10|44101||AEC|FC||V|TN|||80|
608.612.602|0|ML|53|177.84|312.00|2|2|10|44101||AEC|FC||V|TP|||80|
608.612.603|0|ML|53|177.84|312.00|2|2|10|44101||AOC|FO||V|TN|||80|
608.612.604|0|ML|53|177.84|312.00|2|2|10|44101||AOC|FO||V|TP|||80|
608.612.605|0|ML|53|177.84|312.00|2|2|10|44101||AEO|FO||V|TN|||80|
608.612.606|0|ML|53|177.84|312.00|2|2|10|44101||AEO|FO||V|TP|||80|
609.612.599|0|ML|53|185.25|325.00|2|2|10|44101||ARN|FC||V|TN|||90|
609.612.600|0|ML|53|185.25|325.00|2|2|10|44101||ARN|FC||V|TP|||90|
609.612.601|0|ML|53|185.25|325.00|2|2|10|44101||AEC|FC||V|TN|||90|
609.612.602|0|ML|53|185.25|325.00|2|2|10|44101||AEC|FC||V|TP|||90|
609.612.603|0|ML|53|185.25|325.00|2|2|10|44101||AOC|FO||V|TN|||90|
609.612.604|0|ML|53|185.25|325.00|2|2|10|44101||AOC|FO||V|TP|||90|
609.612.605|0|ML|53|185.25|325.00|2|2|10|44101||AEO|FO||V|TN|||90|
609.612.606|0|ML|53|185.25|325.00|2|2|10|44101||AEO|FO||V|TP|||90|
610.612.599|0|ML|53|200.07|351.00|2|2|10|44101||ARN|FC||V|TN|||100|
610.612.600|0|ML|53|200.07|351.00|2|2|10|44101||ARN|FC||V|TP|||100|
610.612.601|0|ML|53|200.07|351.00|2|2|10|44101||AEC|FC||V|TN|||100|
610.612.602|0|ML|53|200.07|351.00|2|2|10|44101||AEC|FC||V|TP|||100|
610.612.603|0|ML|53|200.07|351.00|2|2|10|44101||AOC|FO||V|TN|||100|
610.612.604|0|ML|53|200.07|351.00|2|2|10|44101||AOC|FO||V|TP|||100|
610.612.605|0|ML|53|200.07|351.00|2|2|10|44101||AEO|FO||V|TN|||100|
610.612.606|0|ML|53|200.07|351.00|2|2|10|44101||AEO|FO||V|TP|||100|
611.612.599|0|ML|53|205.77|361.00|2|2|10|44101||ARN|FC||V|TN|||120|
611.612.600|0|ML|53|205.77|361.00|2|2|10|44101||ARN|FC||V|TP|||120|
611.612.601|0|ML|53|205.77|361.00|2|2|10|44101||AEC|FC||V|TN|||120|
611.612.602|0|ML|53|205.77|361.00|2|2|10|44101||AEC|FC||V|TP|||120|
611.612.603|0|ML|53|205.77|361.00|2|2|10|44101||AOC|FO||V|TN|||120|
611.612.604|0|ML|53|205.77|361.00|2|2|10|44101||AOC|FO||V|TP|||120|
611.612.605|0|ML|53|205.77|361.00|2|2|10|44101||AEO|FO||V|TN|||120|
611.612.606|0|ML|53|205.77|361.00|2|2|10|44101||AEO|FO||V|TP|||120|
613.598.599|0|ML|54|235.98|414.00|2|2|11|43141||ARN|FC||H|TN|||60|
613.598.600|0|ML|54|235.98|414.00|2|2|11|43141||ARN|FC||H|TP|||60|
613.598.601|0|ML|54|235.98|414.00|2|2|11|43141||AEC|FC||H|TN|||60|
613.598.602|0|ML|54|235.98|414.00|2|2|11|43141||AEC|FC||H|TP|||60|
613.598.603|0|ML|54|235.98|414.00|2|2|11|43141||AOC|FO||H|TN|||60|
613.598.604|0|ML|54|235.98|414.00|2|2|11|43141||AOC|FO||H|TP|||60|
613.598.605|0|ML|54|235.98|414.00|2|2|11|43141||AEO|FO||H|TN|||60|
613.598.606|0|ML|54|235.98|414.00|2|2|11|43141||AEO|FO||H|TP|||60|
614.598.599|0|ML|54|241.68|424.00|2|2|11|43141||ARN|FC||H|TN|||70|
614.598.600|0|ML|54|241.68|424.00|2|2|11|43141||ARN|FC||H|TP|||70|
614.598.601|0|ML|54|241.68|424.00|2|2|11|43141||AEC|FC||H|TN|||70|
614.598.602|0|ML|54|241.68|424.00|2|2|11|43141||AEC|FC||H|TP|||70|
614.598.603|0|ML|54|241.68|424.00|2|2|11|43141||AOC|FO||H|TN|||70|
614.598.604|0|ML|54|241.68|424.00|2|2|11|43141||AOC|FO||H|TP|||70|
614.598.605|0|ML|54|241.68|424.00|2|2|11|43141||AEO|FO||H|TN|||70|
614.598.606|0|ML|54|241.68|424.00|2|2|11|43141||AEO|FO||H|TP|||70|
615.598.599|0|ML|54|249.09|437.00|2|2|11|43141||ARN|FC||H|TN|||80|
615.598.600|0|ML|54|249.09|437.00|2|2|11|43141||ARN|FC||H|TP|||80|
615.598.601|0|ML|54|249.09|437.00|2|2|11|43141||AEC|FC||H|TN|||80|
615.598.602|0|ML|54|249.09|437.00|2|2|11|43141||AEC|FC||H|TP|||80|
615.598.603|0|ML|54|249.09|437.00|2|2|11|43141||AOC|FO||H|TN|||80|
615.598.604|0|ML|54|249.09|437.00|2|2|11|43141||AOC|FO||H|TP|||80|
615.598.605|0|ML|54|249.09|437.00|2|2|11|43141||AEO|FO||H|TN|||80|
615.598.606|0|ML|54|249.09|437.00|2|2|11|43141||AEO|FO||H|TP|||80|
616.598.599|0|ML|54|256.50|450.00|2|2|11|43141||ARN|FC||H|TN|||90|
616.598.600|0|ML|54|256.50|450.00|2|2|11|43141||ARN|FC||H|TP|||90|
616.598.601|0|ML|54|256.50|450.00|2|2|11|43141||AEC|FC||H|TN|||90|
616.598.602|0|ML|54|256.50|450.00|2|2|11|43141||AEC|FC||H|TP|||90|
616.598.603|0|ML|54|256.50|450.00|2|2|11|43141||AOC|FO||H|TN|||90|
616.598.604|0|ML|54|256.50|450.00|2|2|11|43141||AOC|FO||H|TP|||90|
616.598.605|0|ML|54|256.50|450.00|2|2|11|43141||AEO|FO||H|TN|||90|
616.598.606|0|ML|54|256.50|450.00|2|2|11|43141||AEO|FO||H|TP|||90|
617.598.599|0|ML|54|273.03|479.00|2|2|11|43141||ARN|FC||H|TN|||100|
617.598.600|0|ML|54|273.03|479.00|2|2|11|43141||ARN|FC||H|TP|||100|
617.598.601|0|ML|54|273.03|479.00|2|2|11|43141||AEC|FC||H|TN|||100|
617.598.602|0|ML|54|273.03|479.00|2|2|11|43141||AEC|FC||H|TP|||100|
617.598.603|0|ML|54|273.03|479.00|2|2|11|43141||AOC|FO||H|TN|||100|
617.598.604|0|ML|54|273.03|479.00|2|2|11|43141||AOC|FO||H|TP|||100|
617.598.605|0|ML|54|273.03|479.00|2|2|11|43141||AEO|FO||H|TN|||100|
617.598.606|0|ML|54|273.03|479.00|2|2|11|43141||AEO|FO||H|TP|||100|
618.598.599|0|ML|54|279.30|490.00|2|2|11|43141||ARN|FC||H|TN|||120|
618.598.600|0|ML|54|279.30|490.00|2|2|11|43141||ARN|FC||H|TP|||120|
618.598.601|0|ML|54|279.30|490.00|2|2|11|43141||AEC|FC||H|TN|||120|
618.598.602|0|ML|54|279.30|490.00|2|2|11|43141||AEC|FC||H|TP|||120|
618.598.603|0|ML|54|279.30|490.00|2|2|11|43141||AOC|FO||H|TN|||120|
618.598.604|0|ML|54|279.30|490.00|2|2|11|43141||AOC|FO||H|TP|||120|
618.598.605|0|ML|54|279.30|490.00|2|2|11|43141||AEO|FO||H|TN|||120|
618.598.606|0|ML|54|279.30|490.00|2|2|11|43141||AEO|FO||H|TP|||120|
613.612.599|0|ML|54|235.98|414.00|2|2|12|44141||ARN|FC||V|TN|||60|
613.612.600|0|ML|54|235.98|414.00|2|2|12|44141||ARN|FC||V|TP|||60|
613.612.601|0|ML|54|235.98|414.00|2|2|12|44141||AEC|FC||V|TN|||60|
613.612.602|0|ML|54|235.98|414.00|2|2|12|44141||AEC|FC||V|TP|||60|
613.612.603|0|ML|54|235.98|414.00|2|2|12|44141||AOC|FO||V|TN|||60|
613.612.604|0|ML|54|235.98|414.00|2|2|12|44141||AOC|FO||V|TP|||60|
613.612.605|0|ML|54|235.98|414.00|2|2|12|44141||AEO|FO||V|TN|||60|
613.612.606|0|ML|54|235.98|414.00|2|2|12|44141||AEO|FO||V|TP|||60|
614.612.599|0|ML|54|241.68|424.00|2|2|12|44141||ARN|FC||V|TN|||70|
614.612.600|0|ML|54|241.68|424.00|2|2|12|44141||ARN|FC||V|TP|||70|
614.612.601|0|ML|54|241.68|424.00|2|2|12|44141||AEC|FC||V|TN|||70|
614.612.602|0|ML|54|241.68|424.00|2|2|12|44141||AEC|FC||V|TP|||70|
614.612.603|0|ML|54|241.68|424.00|2|2|12|44141||AOC|FO||V|TN|||70|
614.612.604|0|ML|54|241.68|424.00|2|2|12|44141||AOC|FO||V|TP|||70|
614.612.605|0|ML|54|241.68|424.00|2|2|12|44141||AEO|FO||V|TN|||70|
614.612.606|0|ML|54|241.68|424.00|2|2|12|44141||AEO|FO||V|TP|||70|
615.612.599|0|ML|54|249.09|437.00|2|2|12|44141||ARN|FC||V|TN|||80|
615.612.600|0|ML|54|249.09|437.00|2|2|12|44141||ARN|FC||V|TP|||80|
615.612.601|0|ML|54|249.09|437.00|2|2|12|44141||AEC|FC||V|TN|||80|
615.612.602|0|ML|54|249.09|437.00|2|2|12|44141||AEC|FC||V|TP|||80|
615.612.603|0|ML|54|249.09|437.00|2|2|12|44141||AOC|FO||V|TN|||80|
615.612.604|0|ML|54|249.09|437.00|2|2|12|44141||AOC|FO||V|TP|||80|
615.612.605|0|ML|54|249.09|437.00|2|2|12|44141||AEO|FO||V|TN|||80|
615.612.606|0|ML|54|249.09|437.00|2|2|12|44141||AEO|FO||V|TP|||80|
616.612.599|0|ML|54|256.50|450.00|2|2|12|44141||ARN|FC||V|TN|||90|
616.612.600|0|ML|54|256.50|450.00|2|2|12|44141||ARN|FC||V|TP|||90|
616.612.601|0|ML|54|256.50|450.00|2|2|12|44141||AEC|FC||V|TN|||90|
616.612.602|0|ML|54|256.50|450.00|2|2|12|44141||AEC|FC||V|TP|||90|
616.612.603|0|ML|54|256.50|450.00|2|2|12|44141||AOC|FO||V|TN|||90|
616.612.604|0|ML|54|256.50|450.00|2|2|12|44141||AOC|FO||V|TP|||90|
616.612.605|0|ML|54|256.50|450.00|2|2|12|44141||AEO|FO||V|TN|||90|
616.612.606|0|ML|54|256.50|450.00|2|2|12|44141||AEO|FO||V|TP|||90|
617.612.599|0|ML|54|273.03|479.00|2|2|12|44141||ARN|FC||V|TN|||100|
617.612.600|0|ML|54|273.03|479.00|2|2|12|44141||ARN|FC||V|TP|||100|
617.612.601|0|ML|54|273.03|479.00|2|2|12|44141||AEC|FC||V|TN|||100|
617.612.602|0|ML|54|273.03|479.00|2|2|12|44141||AEC|FC||V|TP|||100|
617.612.603|0|ML|54|273.03|479.00|2|2|12|44141||AOC|FO||V|TN|||100|
617.612.604|0|ML|54|273.03|479.00|2|2|12|44141||AOC|FO||V|TP|||100|
617.612.605|0|ML|54|273.03|479.00|2|2|12|44141||AEO|FO||V|TN|||100|
617.612.606|0|ML|54|273.03|479.00|2|2|12|44141||AEO|FO||V|TP|||100|
618.612.599|0|ML|54|279.30|490.00|2|2|12|44141||ARN|FC||V|TN|||120|
618.612.600|0|ML|54|279.30|490.00|2|2|12|44141||ARN|FC||V|TP|||120|
618.612.601|0|ML|54|279.30|490.00|2|2|12|44141||AEC|FC||V|TN|||120|
618.612.602|0|ML|54|279.30|490.00|2|2|12|44141||AEC|FC||V|TP|||120|
618.612.603|0|ML|54|279.30|490.00|2|2|12|44141||AOC|FO||V|TN|||120|
618.612.604|0|ML|54|279.30|490.00|2|2|12|44141||AOC|FO||V|TP|||120|
618.612.605|0|ML|54|279.30|490.00|2|2|12|44141||AEO|FO||V|TN|||120|
618.612.606|0|ML|54|279.30|490.00|2|2|12|44141||AEO|FO||V|TP|||120|
619.598.599|0|ML|55|250.23|439.00|2|2|13|43102||ARN|FC||H|TN|||60|
619.598.600|0|ML|55|250.23|439.00|2|2|13|43102||ARN|FC||H|TP|||60|
619.598.601|0|ML|55|250.23|439.00|2|2|13|43102||AEC|FC||H|TN|||60|
619.598.602|0|ML|55|250.23|439.00|2|2|13|43102||AEC|FC||H|TP|||60|
619.598.603|0|ML|55|250.23|439.00|2|2|13|43102||AOC|FO||H|TN|||60|
619.598.604|0|ML|55|250.23|439.00|2|2|13|43102||AOC|FO||H|TP|||60|
619.598.605|0|ML|55|250.23|439.00|2|2|13|43102||AEO|FO||H|TN|||60|
619.598.606|0|ML|55|250.23|439.00|2|2|13|43102||AEO|FO||H|TP|||60|
620.598.599|0|ML|55|261.63|459.00|2|2|13|43102||ARN|FC||H|TN|||70|
620.598.600|0|ML|55|261.63|459.00|2|2|13|43102||ARN|FC||H|TP|||70|
620.598.601|0|ML|55|261.63|459.00|2|2|13|43102||AEC|FC||H|TN|||70|
620.598.602|0|ML|55|261.63|459.00|2|2|13|43102||AEC|FC||H|TP|||70|
620.598.603|0|ML|55|261.63|459.00|2|2|13|43102||AOC|FO||H|TN|||70|
620.598.604|0|ML|55|261.63|459.00|2|2|13|43102||AOC|FO||H|TP|||70|
620.598.605|0|ML|55|261.63|459.00|2|2|13|43102||AEO|FO||H|TN|||70|
620.598.606|0|ML|55|261.63|459.00|2|2|13|43102||AEO|FO||H|TP|||70|
621.598.599|0|ML|55|266.76|468.00|2|2|13|43102||ARN|FC||H|TN|||80|
621.598.600|0|ML|55|266.76|468.00|2|2|13|43102||ARN|FC||H|TP|||80|
621.598.601|0|ML|55|266.76|468.00|2|2|13|43102||AEC|FC||H|TN|||80|
621.598.602|0|ML|55|266.76|468.00|2|2|13|43102||AEC|FC||H|TP|||80|
621.598.603|0|ML|55|266.76|468.00|2|2|13|43102||AOC|FO||H|TN|||80|
621.598.604|0|ML|55|266.76|468.00|2|2|13|43102||AOC|FO||H|TP|||80|
621.598.605|0|ML|55|266.76|468.00|2|2|13|43102||AEO|FO||H|TN|||80|
621.598.606|0|ML|55|266.76|468.00|2|2|13|43102||AEO|FO||H|TP|||80|
622.598.599|0|ML|55|292.41|513.00|2|2|13|43102||ARN|FC||H|TN|||90|
622.598.600|0|ML|55|292.41|513.00|2|2|13|43102||ARN|FC||H|TP|||90|
622.598.601|0|ML|55|292.41|513.00|2|2|13|43102||AEC|FC||H|TN|||90|
622.598.602|0|ML|55|292.41|513.00|2|2|13|43102||AEC|FC||H|TP|||90|
622.598.603|0|ML|55|292.41|513.00|2|2|13|43102||AOC|FO||H|TN|||90|
622.598.604|0|ML|55|292.41|513.00|2|2|13|43102||AOC|FO||H|TP|||90|
622.598.605|0|ML|55|292.41|513.00|2|2|13|43102||AEO|FO||H|TN|||90|
622.598.606|0|ML|55|292.41|513.00|2|2|13|43102||AEO|FO||H|TP|||90|
623.598.599|0|ML|55|306.66|538.00|2|2|13|43102||ARN|FC||H|TN|||100|
623.598.600|0|ML|55|306.66|538.00|2|2|13|43102||ARN|FC||H|TP|||100|
623.598.601|0|ML|55|306.66|538.00|2|2|13|43102||AEC|FC||H|TN|||100|
623.598.602|0|ML|55|306.66|538.00|2|2|13|43102||AEC|FC||H|TP|||100|
623.598.603|0|ML|55|306.66|538.00|2|2|13|43102||AOC|FO||H|TN|||100|
623.598.604|0|ML|55|306.66|538.00|2|2|13|43102||AOC|FO||H|TP|||100|
623.598.605|0|ML|55|306.66|538.00|2|2|13|43102||AEO|FO||H|TN|||100|
623.598.606|0|ML|55|306.66|538.00|2|2|13|43102||AEO|FO||H|TP|||100|
624.598.599|0|ML|55|323.19|567.00|2|2|13|43102||ARN|FC||H|TN|||120|
624.598.600|0|ML|55|323.19|567.00|2|2|13|43102||ARN|FC||H|TP|||120|
624.598.601|0|ML|55|323.19|567.00|2|2|13|43102||AEC|FC||H|TN|||120|
624.598.602|0|ML|55|323.19|567.00|2|2|13|43102||AEC|FC||H|TP|||120|
624.598.603|0|ML|55|323.19|567.00|2|2|13|43102||AOC|FO||H|TN|||120|
624.598.604|0|ML|55|323.19|567.00|2|2|13|43102||AOC|FO||H|TP|||120|
624.598.605|0|ML|55|323.19|567.00|2|2|13|43102||AEO|FO||H|TN|||120|
624.598.606|0|ML|55|323.19|567.00|2|2|13|43102||AEO|FO||H|TP|||120|
619.612.599|0|ML|55|250.23|439.00|2|2|14|44102||ARN|FC||V|TN|||60|
619.612.600|0|ML|55|250.23|439.00|2|2|14|44102||ARN|FC||V|TP|||60|
619.612.601|0|ML|55|250.23|439.00|2|2|14|44102||AEC|FC||V|TN|||60|
619.612.602|0|ML|55|250.23|439.00|2|2|14|44102||AEC|FC||V|TP|||60|
619.612.603|0|ML|55|250.23|439.00|2|2|14|44102||AOC|FO||V|TN|||60|
619.612.604|0|ML|55|250.23|439.00|2|2|14|44102||AOC|FO||V|TP|||60|
619.612.605|0|ML|55|250.23|439.00|2|2|14|44102||AEO|FO||V|TN|||60|
619.612.606|0|ML|55|250.23|439.00|2|2|14|44102||AEO|FO||V|TP|||60|
620.612.599|0|ML|55|261.63|459.00|2|2|14|44102||ARN|FC||V|TN|||70|
620.612.600|0|ML|55|261.63|459.00|2|2|14|44102||ARN|FC||V|TP|||70|
620.612.601|0|ML|55|261.63|459.00|2|2|14|44102||AEC|FC||V|TN|||70|
620.612.602|0|ML|55|261.63|459.00|2|2|14|44102||AEC|FC||V|TP|||70|
620.612.603|0|ML|55|261.63|459.00|2|2|14|44102||AOC|FO||V|TN|||70|
620.612.604|0|ML|55|261.63|459.00|2|2|14|44102||AOC|FO||V|TP|||70|
620.612.605|0|ML|55|261.63|459.00|2|2|14|44102||AEO|FO||V|TN|||70|
620.612.606|0|ML|55|261.63|459.00|2|2|14|44102||AEO|FO||V|TP|||70|
621.612.599|0|ML|55|266.76|468.00|2|2|14|44102||ARN|FC||V|TN|||80|
621.612.600|0|ML|55|266.76|468.00|2|2|14|44102||ARN|FC||V|TP|||80|
621.612.601|0|ML|55|266.76|468.00|2|2|14|44102||AEC|FC||V|TN|||80|
621.612.602|0|ML|55|266.76|468.00|2|2|14|44102||AEC|FC||V|TP|||80|
621.612.603|0|ML|55|266.76|468.00|2|2|14|44102||AOC|FO||V|TN|||80|
621.612.604|0|ML|55|266.76|468.00|2|2|14|44102||AOC|FO||V|TP|||80|
621.612.605|0|ML|55|266.76|468.00|2|2|14|44102||AEO|FO||V|TN|||80|
621.612.606|0|ML|55|266.76|468.00|2|2|14|44102||AEO|FO||V|TP|||80|
622.612.599|0|ML|55|292.41|513.00|2|2|14|44102||ARN|FC||V|TN|||90|
622.612.600|0|ML|55|292.41|513.00|2|2|14|44102||ARN|FC||V|TP|||90|
622.612.601|0|ML|55|292.41|513.00|2|2|14|44102||AEC|FC||V|TN|||90|
622.612.602|0|ML|55|292.41|513.00|2|2|14|44102||AEC|FC||V|TP|||90|
622.612.603|0|ML|55|292.41|513.00|2|2|14|44102||AOC|FO||V|TN|||90|
622.612.604|0|ML|55|292.41|513.00|2|2|14|44102||AOC|FO||V|TP|||90|
622.612.605|0|ML|55|292.41|513.00|2|2|14|44102||AEO|FO||V|TN|||90|
622.612.606|0|ML|55|292.41|513.00|2|2|14|44102||AEO|FO||V|TP|||90|
623.612.599|0|ML|55|306.66|538.00|2|2|14|44102||ARN|FC||V|TN|||100|
623.612.600|0|ML|55|306.66|538.00|2|2|14|44102||ARN|FC||V|TP|||100|
623.612.601|0|ML|55|306.66|538.00|2|2|14|44102||AEC|FC||V|TN|||100|
623.612.602|0|ML|55|306.66|538.00|2|2|14|44102||AEC|FC||V|TP|||100|
623.612.603|0|ML|55|306.66|538.00|2|2|14|44102||AOC|FO||V|TN|||100|
623.612.604|0|ML|55|306.66|538.00|2|2|14|44102||AOC|FO||V|TP|||100|
623.612.605|0|ML|55|306.66|538.00|2|2|14|44102||AEO|FO||V|TN|||100|
623.612.606|0|ML|55|306.66|538.00|2|2|14|44102||AEO|FO||V|TP|||100|
624.612.599|0|ML|55|323.19|567.00|2|2|14|44102||ARN|FC||V|TN|||120|
624.612.600|0|ML|55|323.19|567.00|2|2|14|44102||ARN|FC||V|TP|||120|
624.612.601|0|ML|55|323.19|567.00|2|2|14|44102||AEC|FC||V|TN|||120|
624.612.602|0|ML|55|323.19|567.00|2|2|14|44102||AEC|FC||V|TP|||120|
624.612.603|0|ML|55|323.19|567.00|2|2|14|44102||AOC|FO||V|TN|||120|
624.612.604|0|ML|55|323.19|567.00|2|2|14|44102||AOC|FO||V|TP|||120|
624.612.605|0|ML|55|323.19|567.00|2|2|14|44102||AEO|FO||V|TN|||120|
624.612.606|0|ML|55|323.19|567.00|2|2|14|44102||AEO|FO||V|TP|||120|
619.625.599|0|ML|55|250.23|439.00|2|2|15|45102||ARN|FC||MX|TN|||60|
619.625.600|0|ML|55|250.23|439.00|2|2|15|45102||ARN|FC||MX|TP|||60|
619.625.601|0|ML|55|250.23|439.00|2|2|15|45102||AEC|FC||MX|TN|||60|
619.625.602|0|ML|55|250.23|439.00|2|2|15|45102||AEC|FC||MX|TP|||60|
619.625.603|0|ML|55|250.23|439.00|2|2|15|45102||AOC|FO||MX|TN|||60|
619.625.604|0|ML|55|250.23|439.00|2|2|15|45102||AOC|FO||MX|TP|||60|
619.625.605|0|ML|55|250.23|439.00|2|2|15|45102||AEO|FO||MX|TN|||60|
619.625.606|0|ML|55|250.23|439.00|2|2|15|45102||AEO|FO||MX|TP|||60|
620.625.599|0|ML|55|261.63|459.00|2|2|15|45102||ARN|FC||MX|TN|||70|
620.625.600|0|ML|55|261.63|459.00|2|2|15|45102||ARN|FC||MX|TP|||70|
620.625.601|0|ML|55|261.63|459.00|2|2|15|45102||AEC|FC||MX|TN|||70|
620.625.602|0|ML|55|261.63|459.00|2|2|15|45102||AEC|FC||MX|TP|||70|
620.625.603|0|ML|55|261.63|459.00|2|2|15|45102||AOC|FO||MX|TN|||70|
620.625.604|0|ML|55|261.63|459.00|2|2|15|45102||AOC|FO||MX|TP|||70|
620.625.605|0|ML|55|261.63|459.00|2|2|15|45102||AEO|FO||MX|TN|||70|
620.625.606|0|ML|55|261.63|459.00|2|2|15|45102||AEO|FO||MX|TP|||70|
621.625.599|0|ML|55|266.76|468.00|2|2|15|45102||ARN|FC||MX|TN|||80|
621.625.600|0|ML|55|266.76|468.00|2|2|15|45102||ARN|FC||MX|TP|||80|
621.625.601|0|ML|55|266.76|468.00|2|2|15|45102||AEC|FC||MX|TN|||80|
621.625.602|0|ML|55|266.76|468.00|2|2|15|45102||AEC|FC||MX|TP|||80|
621.625.603|0|ML|55|266.76|468.00|2|2|15|45102||AOC|FO||MX|TN|||80|
621.625.604|0|ML|55|266.76|468.00|2|2|15|45102||AOC|FO||MX|TP|||80|
621.625.605|0|ML|55|266.76|468.00|2|2|15|45102||AEO|FO||MX|TN|||80|
621.625.606|0|ML|55|266.76|468.00|2|2|15|45102||AEO|FO||MX|TP|||80|
622.625.599|0|ML|55|292.41|513.00|2|2|15|45102||ARN|FC||MX|TN|||90|
622.625.600|0|ML|55|292.41|513.00|2|2|15|45102||ARN|FC||MX|TP|||90|
622.625.601|0|ML|55|292.41|513.00|2|2|15|45102||AEC|FC||MX|TN|||90|
622.625.602|0|ML|55|292.41|513.00|2|2|15|45102||AEC|FC||MX|TP|||90|
622.625.603|0|ML|55|292.41|513.00|2|2|15|45102||AOC|FO||MX|TN|||90|
622.625.604|0|ML|55|292.41|513.00|2|2|15|45102||AOC|FO||MX|TP|||90|
622.625.605|0|ML|55|292.41|513.00|2|2|15|45102||AEO|FO||MX|TN|||90|
622.625.606|0|ML|55|292.41|513.00|2|2|15|45102||AEO|FO||MX|TP|||90|
623.625.599|0|ML|55|306.66|538.00|2|2|15|45102||ARN|FC||MX|TN|||100|
623.625.600|0|ML|55|306.66|538.00|2|2|15|45102||ARN|FC||MX|TP|||100|
623.625.601|0|ML|55|306.66|538.00|2|2|15|45102||AEC|FC||MX|TN|||100|
623.625.602|0|ML|55|306.66|538.00|2|2|15|45102||AEC|FC||MX|TP|||100|
623.625.603|0|ML|55|306.66|538.00|2|2|15|45102||AOC|FO||MX|TN|||100|
623.625.604|0|ML|55|306.66|538.00|2|2|15|45102||AOC|FO||MX|TP|||100|
623.625.605|0|ML|55|306.66|538.00|2|2|15|45102||AEO|FO||MX|TN|||100|
623.625.606|0|ML|55|306.66|538.00|2|2|15|45102||AEO|FO||MX|TP|||100|
624.625.599|0|ML|55|323.19|567.00|2|2|15|45102||ARN|FC||MX|TN|||120|
624.625.600|0|ML|55|323.19|567.00|2|2|15|45102||ARN|FC||MX|TP|||120|
624.625.601|0|ML|55|323.19|567.00|2|2|15|45102||AEC|FC||MX|TN|||120|
624.625.602|0|ML|55|323.19|567.00|2|2|15|45102||AEC|FC||MX|TP|||120|
624.625.603|0|ML|55|323.19|567.00|2|2|15|45102||AOC|FO||MX|TN|||120|
624.625.604|0|ML|55|323.19|567.00|2|2|15|45102||AOC|FO||MX|TP|||120|
624.625.605|0|ML|55|323.19|567.00|2|2|15|45102||AEO|FO||MX|TN|||120|
624.625.606|0|ML|55|323.19|567.00|2|2|15|45102||AEO|FO||MX|TP|||120|
626.598.599|0|ML|56|262.77|461.00|2|2|16|43142||ARN|FC||H|TN|||60|
626.598.600|0|ML|56|262.77|461.00|2|2|16|43142||ARN|FC||H|TP|||60|
626.598.601|0|ML|56|262.77|461.00|2|2|16|43142||AEC|FC||H|TN|||60|
626.598.602|0|ML|56|262.77|461.00|2|2|16|43142||AEC|FC||H|TP|||60|
626.598.603|0|ML|56|262.77|461.00|2|2|16|43142||AOC|FO||H|TN|||60|
626.598.604|0|ML|56|262.77|461.00|2|2|16|43142||AOC|FO||H|TP|||60|
626.598.605|0|ML|56|262.77|461.00|2|2|16|43142||AEO|FO||H|TN|||60|
626.598.606|0|ML|56|262.77|461.00|2|2|16|43142||AEO|FO||H|TP|||60|
627.598.599|0|ML|56|274.74|482.00|2|2|16|43142||ARN|FC||H|TN|||70|
627.598.600|0|ML|56|274.74|482.00|2|2|16|43142||ARN|FC||H|TP|||70|
627.598.601|0|ML|56|274.74|482.00|2|2|16|43142||AEC|FC||H|TN|||70|
627.598.602|0|ML|56|274.74|482.00|2|2|16|43142||AEC|FC||H|TP|||70|
627.598.603|0|ML|56|274.74|482.00|2|2|16|43142||AOC|FO||H|TN|||70|
627.598.604|0|ML|56|274.74|482.00|2|2|16|43142||AOC|FO||H|TP|||70|
627.598.605|0|ML|56|274.74|482.00|2|2|16|43142||AEO|FO||H|TN|||70|
627.598.606|0|ML|56|274.74|482.00|2|2|16|43142||AEO|FO||H|TP|||70|
628.598.599|0|ML|56|279.87|491.00|2|2|16|43142||ARN|FC||H|TN|||80|
628.598.600|0|ML|56|279.87|491.00|2|2|16|43142||ARN|FC||H|TP|||80|
628.598.601|0|ML|56|279.87|491.00|2|2|16|43142||AEC|FC||H|TN|||80|
628.598.602|0|ML|56|279.87|491.00|2|2|16|43142||AEC|FC||H|TP|||80|
628.598.603|0|ML|56|279.87|491.00|2|2|16|43142||AOC|FO||H|TN|||80|
628.598.604|0|ML|56|279.87|491.00|2|2|16|43142||AOC|FO||H|TP|||80|
628.598.605|0|ML|56|279.87|491.00|2|2|16|43142||AEO|FO||H|TN|||80|
628.598.606|0|ML|56|279.87|491.00|2|2|16|43142||AEO|FO||H|TP|||80|
629.598.599|0|ML|56|306.66|538.00|2|2|16|43142||ARN|FC||H|TN|||90|
629.598.600|0|ML|56|306.66|538.00|2|2|16|43142||ARN|FC||H|TP|||90|
629.598.601|0|ML|56|306.66|538.00|2|2|16|43142||AEC|FC||H|TN|||90|
629.598.602|0|ML|56|306.66|538.00|2|2|16|43142||AEC|FC||H|TP|||90|
629.598.603|0|ML|56|306.66|538.00|2|2|16|43142||AOC|FO||H|TN|||90|
629.598.604|0|ML|56|306.66|538.00|2|2|16|43142||AOC|FO||H|TP|||90|
629.598.605|0|ML|56|306.66|538.00|2|2|16|43142||AEO|FO||H|TN|||90|
629.598.606|0|ML|56|306.66|538.00|2|2|16|43142||AEO|FO||H|TP|||90|
630.598.599|0|ML|56|322.05|565.00|2|2|16|43142||ARN|FC||H|TN|||100|
630.598.600|0|ML|56|322.05|565.00|2|2|16|43142||ARN|FC||H|TP|||100|
630.598.601|0|ML|56|322.05|565.00|2|2|16|43142||AEC|FC||H|TN|||100|
630.598.602|0|ML|56|322.05|565.00|2|2|16|43142||AEC|FC||H|TP|||100|
630.598.603|0|ML|56|322.05|565.00|2|2|16|43142||AOC|FO||H|TN|||100|
630.598.604|0|ML|56|322.05|565.00|2|2|16|43142||AOC|FO||H|TP|||100|
630.598.605|0|ML|56|322.05|565.00|2|2|16|43142||AEO|FO||H|TN|||100|
630.598.606|0|ML|56|322.05|565.00|2|2|16|43142||AEO|FO||H|TP|||100|
631.598.599|0|ML|56|339.15|595.00|2|2|16|43142||ARN|FC||H|TN|||120|
631.598.600|0|ML|56|339.15|595.00|2|2|16|43142||ARN|FC||H|TP|||120|
631.598.601|0|ML|56|339.15|595.00|2|2|16|43142||AEC|FC||H|TN|||120|
631.598.602|0|ML|56|339.15|595.00|2|2|16|43142||AEC|FC||H|TP|||120|
631.598.603|0|ML|56|339.15|595.00|2|2|16|43142||AOC|FO||H|TN|||120|
631.598.604|0|ML|56|339.15|595.00|2|2|16|43142||AOC|FO||H|TP|||120|
631.598.605|0|ML|56|339.15|595.00|2|2|16|43142||AEO|FO||H|TN|||120|
631.598.606|0|ML|56|339.15|595.00|2|2|16|43142||AEO|FO||H|TP|||120|
626.612.599|0|ML|56|262.77|461.00|2|2|17|44142||ARN|FC||V|TN|||60|
626.612.600|0|ML|56|262.77|461.00|2|2|17|44142||ARN|FC||V|TP|||60|
626.612.601|0|ML|56|262.77|461.00|2|2|17|44142||AEC|FC||V|TN|||60|
626.612.602|0|ML|56|262.77|461.00|2|2|17|44142||AEC|FC||V|TP|||60|
626.612.603|0|ML|56|262.77|461.00|2|2|17|44142||AOC|FO||V|TN|||60|
626.612.604|0|ML|56|262.77|461.00|2|2|17|44142||AOC|FO||V|TP|||60|
626.612.605|0|ML|56|262.77|461.00|2|2|17|44142||AEO|FO||V|TN|||60|
626.612.606|0|ML|56|262.77|461.00|2|2|17|44142||AEO|FO||V|TP|||60|
627.612.599|0|ML|56|274.74|482.00|2|2|17|44142||ARN|FC||V|TN|||70|
627.612.600|0|ML|56|274.74|482.00|2|2|17|44142||ARN|FC||V|TP|||70|
627.612.601|0|ML|56|274.74|482.00|2|2|17|44142||AEC|FC||V|TN|||70|
627.612.602|0|ML|56|274.74|482.00|2|2|17|44142||AEC|FC||V|TP|||70|
627.612.603|0|ML|56|274.74|482.00|2|2|17|44142||AOC|FO||V|TN|||70|
627.612.604|0|ML|56|274.74|482.00|2|2|17|44142||AOC|FO||V|TP|||70|
627.612.605|0|ML|56|274.74|482.00|2|2|17|44142||AEO|FO||V|TN|||70|
627.612.606|0|ML|56|274.74|482.00|2|2|17|44142||AEO|FO||V|TP|||70|
628.612.599|0|ML|56|279.87|491.00|2|2|17|44142||ARN|FC||V|TN|||80|
628.612.600|0|ML|56|279.87|491.00|2|2|17|44142||ARN|FC||V|TP|||80|
628.612.601|0|ML|56|279.87|491.00|2|2|17|44142||AEC|FC||V|TN|||80|
628.612.602|0|ML|56|279.87|491.00|2|2|17|44142||AEC|FC||V|TP|||80|
628.612.603|0|ML|56|279.87|491.00|2|2|17|44142||AOC|FO||V|TN|||80|
628.612.604|0|ML|56|279.87|491.00|2|2|17|44142||AOC|FO||V|TP|||80|
628.612.605|0|ML|56|279.87|491.00|2|2|17|44142||AEO|FO||V|TN|||80|
628.612.606|0|ML|56|279.87|491.00|2|2|17|44142||AEO|FO||V|TP|||80|
629.612.599|0|ML|56|306.66|538.00|2|2|17|44142||ARN|FC||V|TN|||90|
629.612.600|0|ML|56|306.66|538.00|2|2|17|44142||ARN|FC||V|TP|||90|
629.612.601|0|ML|56|306.66|538.00|2|2|17|44142||AEC|FC||V|TN|||90|
629.612.602|0|ML|56|306.66|538.00|2|2|17|44142||AEC|FC||V|TP|||90|
629.612.603|0|ML|56|306.66|538.00|2|2|17|44142||AOC|FO||V|TN|||90|
629.612.604|0|ML|56|306.66|538.00|2|2|17|44142||AOC|FO||V|TP|||90|
629.612.605|0|ML|56|306.66|538.00|2|2|17|44142||AEO|FO||V|TN|||90|
629.612.606|0|ML|56|306.66|538.00|2|2|17|44142||AEO|FO||V|TP|||90|
630.612.599|0|ML|56|322.05|565.00|2|2|17|44142||ARN|FC||V|TN|||100|
630.612.600|0|ML|56|322.05|565.00|2|2|17|44142||ARN|FC||V|TP|||100|
630.612.601|0|ML|56|322.05|565.00|2|2|17|44142||AEC|FC||V|TN|||100|
630.612.602|0|ML|56|322.05|565.00|2|2|17|44142||AEC|FC||V|TP|||100|
630.612.603|0|ML|56|322.05|565.00|2|2|17|44142||AOC|FO||V|TN|||100|
630.612.604|0|ML|56|322.05|565.00|2|2|17|44142||AOC|FO||V|TP|||100|
630.612.605|0|ML|56|322.05|565.00|2|2|17|44142||AEO|FO||V|TN|||100|
630.612.606|0|ML|56|322.05|565.00|2|2|17|44142||AEO|FO||V|TP|||100|
631.612.599|0|ML|56|339.15|595.00|2|2|17|44142||ARN|FC||V|TN|||120|
631.612.600|0|ML|56|339.15|595.00|2|2|17|44142||ARN|FC||V|TP|||120|
631.612.601|0|ML|56|339.15|595.00|2|2|17|44142||AEC|FC||V|TN|||120|
631.612.602|0|ML|56|339.15|595.00|2|2|17|44142||AEC|FC||V|TP|||120|
631.612.603|0|ML|56|339.15|595.00|2|2|17|44142||AOC|FO||V|TN|||120|
631.612.604|0|ML|56|339.15|595.00|2|2|17|44142||AOC|FO||V|TP|||120|
631.612.605|0|ML|56|339.15|595.00|2|2|17|44142||AEO|FO||V|TN|||120|
631.612.606|0|ML|56|339.15|595.00|2|2|17|44142||AEO|FO||V|TP|||120|
626.625.599|0|ML|56|262.77|461.00|2|2|18|45142||ARN|FC||MX|TN|||60|
626.625.600|0|ML|56|262.77|461.00|2|2|18|45142||ARN|FC||MX|TP|||60|
626.625.601|0|ML|56|262.77|461.00|2|2|18|45142||AEC|FC||MX|TN|||60|
626.625.602|0|ML|56|262.77|461.00|2|2|18|45142||AEC|FC||MX|TP|||60|
626.625.603|0|ML|56|262.77|461.00|2|2|18|45142||AOC|FO||MX|TN|||60|
626.625.604|0|ML|56|262.77|461.00|2|2|18|45142||AOC|FO||MX|TP|||60|
626.625.605|0|ML|56|262.77|461.00|2|2|18|45142||AEO|FO||MX|TN|||60|
626.625.606|0|ML|56|262.77|461.00|2|2|18|45142||AEO|FO||MX|TP|||60|
627.625.599|0|ML|56|274.74|482.00|2|2|18|45142||ARN|FC||MX|TN|||70|
627.625.600|0|ML|56|274.74|482.00|2|2|18|45142||ARN|FC||MX|TP|||70|
627.625.601|0|ML|56|274.74|482.00|2|2|18|45142||AEC|FC||MX|TN|||70|
627.625.602|0|ML|56|274.74|482.00|2|2|18|45142||AEC|FC||MX|TP|||70|
627.625.603|0|ML|56|274.74|482.00|2|2|18|45142||AOC|FO||MX|TN|||70|
627.625.604|0|ML|56|274.74|482.00|2|2|18|45142||AOC|FO||MX|TP|||70|
627.625.605|0|ML|56|274.74|482.00|2|2|18|45142||AEO|FO||MX|TN|||70|
627.625.606|0|ML|56|274.74|482.00|2|2|18|45142||AEO|FO||MX|TP|||70|
628.625.599|0|ML|56|279.87|491.00|2|2|18|45142||ARN|FC||MX|TN|||80|
628.625.600|0|ML|56|279.87|491.00|2|2|18|45142||ARN|FC||MX|TP|||80|
628.625.601|0|ML|56|279.87|491.00|2|2|18|45142||AEC|FC||MX|TN|||80|
628.625.602|0|ML|56|279.87|491.00|2|2|18|45142||AEC|FC||MX|TP|||80|
628.625.603|0|ML|56|279.87|491.00|2|2|18|45142||AOC|FO||MX|TN|||80|
628.625.604|0|ML|56|279.87|491.00|2|2|18|45142||AOC|FO||MX|TP|||80|
628.625.605|0|ML|56|279.87|491.00|2|2|18|45142||AEO|FO||MX|TN|||80|
628.625.606|0|ML|56|279.87|491.00|2|2|18|45142||AEO|FO||MX|TP|||80|
629.625.599|0|ML|56|306.66|538.00|2|2|18|45142||ARN|FC||MX|TN|||90|
629.625.600|0|ML|56|306.66|538.00|2|2|18|45142||ARN|FC||MX|TP|||90|
629.625.601|0|ML|56|306.66|538.00|2|2|18|45142||AEC|FC||MX|TN|||90|
629.625.602|0|ML|56|306.66|538.00|2|2|18|45142||AEC|FC||MX|TP|||90|
629.625.603|0|ML|56|306.66|538.00|2|2|18|45142||AOC|FO||MX|TN|||90|
629.625.604|0|ML|56|306.66|538.00|2|2|18|45142||AOC|FO||MX|TP|||90|
629.625.605|0|ML|56|306.66|538.00|2|2|18|45142||AEO|FO||MX|TN|||90|
629.625.606|0|ML|56|306.66|538.00|2|2|18|45142||AEO|FO||MX|TP|||90|
630.625.599|0|ML|56|322.05|565.00|2|2|18|45142||ARN|FC||MX|TN|||100|
630.625.600|0|ML|56|322.05|565.00|2|2|18|45142||ARN|FC||MX|TP|||100|
630.625.601|0|ML|56|322.05|565.00|2|2|18|45142||AEC|FC||MX|TN|||100|
630.625.602|0|ML|56|322.05|565.00|2|2|18|45142||AEC|FC||MX|TP|||100|
630.625.603|0|ML|56|322.05|565.00|2|2|18|45142||AOC|FO||MX|TN|||100|
630.625.604|0|ML|56|322.05|565.00|2|2|18|45142||AOC|FO||MX|TP|||100|
630.625.605|0|ML|56|322.05|565.00|2|2|18|45142||AEO|FO||MX|TN|||100|
630.625.606|0|ML|56|322.05|565.00|2|2|18|45142||AEO|FO||MX|TP|||100|
631.625.599|0|ML|56|339.15|595.00|2|2|18|45142||ARN|FC||MX|TN|||120|
631.625.600|0|ML|56|339.15|595.00|2|2|18|45142||ARN|FC||MX|TP|||120|
631.625.601|0|ML|56|339.15|595.00|2|2|18|45142||AEC|FC||MX|TN|||120|
631.625.602|0|ML|56|339.15|595.00|2|2|18|45142||AEC|FC||MX|TP|||120|
631.625.603|0|ML|56|339.15|595.00|2|2|18|45142||AOC|FO||MX|TN|||120|
631.625.604|0|ML|56|339.15|595.00|2|2|18|45142||AOC|FO||MX|TP|||120|
631.625.605|0|ML|56|339.15|595.00|2|2|18|45142||AEO|FO||MX|TN|||120|
631.625.606|0|ML|56|339.15|595.00|2|2|18|45142||AEO|FO||MX|TP|||120|
632.598.599|0|ML|57|344.28|604.00|2|2|19|43103||ARN|FC||H|TN|||60|
632.598.600|0|ML|57|344.28|604.00|2|2|19|43103||ARN|FC||H|TP|||60|
632.598.601|0|ML|57|344.28|604.00|2|2|19|43103||AEC|FC||H|TN|||60|
632.598.602|0|ML|57|344.28|604.00|2|2|19|43103||AEC|FC||H|TP|||60|
632.598.603|0|ML|57|344.28|604.00|2|2|19|43103||AOC|FO||H|TN|||60|
632.598.604|0|ML|57|344.28|604.00|2|2|19|43103||AOC|FO||H|TP|||60|
632.598.605|0|ML|57|344.28|604.00|2|2|19|43103||AEO|FO||H|TN|||60|
632.598.606|0|ML|57|344.28|604.00|2|2|19|43103||AEO|FO||H|TP|||60|
633.598.599|0|ML|57|360.81|633.00|2|2|19|43103||ARN|FC||H|TN|||70|
633.598.600|0|ML|57|360.81|633.00|2|2|19|43103||ARN|FC||H|TP|||70|
633.598.601|0|ML|57|360.81|633.00|2|2|19|43103||AEC|FC||H|TN|||70|
633.598.602|0|ML|57|360.81|633.00|2|2|19|43103||AEC|FC||H|TP|||70|
633.598.603|0|ML|57|360.81|633.00|2|2|19|43103||AOC|FO||H|TN|||70|
633.598.604|0|ML|57|360.81|633.00|2|2|19|43103||AOC|FO||H|TP|||70|
633.598.605|0|ML|57|360.81|633.00|2|2|19|43103||AEO|FO||H|TN|||70|
633.598.606|0|ML|57|360.81|633.00|2|2|19|43103||AEO|FO||H|TP|||70|
634.598.599|0|ML|57|375.06|658.00|2|2|19|43103||ARN|FC||H|TN|||80|
634.598.600|0|ML|57|375.06|658.00|2|2|19|43103||ARN|FC||H|TP|||80|
634.598.601|0|ML|57|375.06|658.00|2|2|19|43103||AEC|FC||H|TN|||80|
634.598.602|0|ML|57|375.06|658.00|2|2|19|43103||AEC|FC||H|TP|||80|
634.598.603|0|ML|57|375.06|658.00|2|2|19|43103||AOC|FO||H|TN|||80|
634.598.604|0|ML|57|375.06|658.00|2|2|19|43103||AOC|FO||H|TP|||80|
634.598.605|0|ML|57|375.06|658.00|2|2|19|43103||AEO|FO||H|TN|||80|
634.598.606|0|ML|57|375.06|658.00|2|2|19|43103||AEO|FO||H|TP|||80|
635.598.599|0|ML|57|396.72|696.00|2|2|19|43103||ARN|FC||H|TN|||90|
635.598.600|0|ML|57|396.72|696.00|2|2|19|43103||ARN|FC||H|TP|||90|
635.598.601|0|ML|57|396.72|696.00|2|2|19|43103||AEC|FC||H|TN|||90|
635.598.602|0|ML|57|396.72|696.00|2|2|19|43103||AEC|FC||H|TP|||90|
635.598.603|0|ML|57|396.72|696.00|2|2|19|43103||AOC|FO||H|TN|||90|
635.598.604|0|ML|57|396.72|696.00|2|2|19|43103||AOC|FO||H|TP|||90|
635.598.605|0|ML|57|396.72|696.00|2|2|19|43103||AEO|FO||H|TN|||90|
635.598.606|0|ML|57|396.72|696.00|2|2|19|43103||AEO|FO||H|TP|||90|
636.598.599|0|ML|57|406.98|714.00|2|2|19|43103||ARN|FC||H|TN|||100|
636.598.600|0|ML|57|406.98|714.00|2|2|19|43103||ARN|FC||H|TP|||100|
636.598.601|0|ML|57|406.98|714.00|2|2|19|43103||AEC|FC||H|TN|||100|
636.598.602|0|ML|57|406.98|714.00|2|2|19|43103||AEC|FC||H|TP|||100|
636.598.603|0|ML|57|406.98|714.00|2|2|19|43103||AOC|FO||H|TN|||100|
636.598.604|0|ML|57|406.98|714.00|2|2|19|43103||AOC|FO||H|TP|||100|
636.598.605|0|ML|57|406.98|714.00|2|2|19|43103||AEO|FO||H|TN|||100|
636.598.606|0|ML|57|406.98|714.00|2|2|19|43103||AEO|FO||H|TP|||100|
637.598.599|0|ML|57|436.62|766.00|2|2|19|43103||ARN|FC||H|TN|||120|
637.598.600|0|ML|57|436.62|766.00|2|2|19|43103||ARN|FC||H|TP|||120|
637.598.601|0|ML|57|436.62|766.00|2|2|19|43103||AEC|FC||H|TN|||120|
637.598.602|0|ML|57|436.62|766.00|2|2|19|43103||AEC|FC||H|TP|||120|
637.598.603|0|ML|57|436.62|766.00|2|2|19|43103||AOC|FO||H|TN|||120|
637.598.604|0|ML|57|436.62|766.00|2|2|19|43103||AOC|FO||H|TP|||120|
637.598.605|0|ML|57|436.62|766.00|2|2|19|43103||AEO|FO||H|TN|||120|
637.598.606|0|ML|57|436.62|766.00|2|2|19|43103||AEO|FO||H|TP|||120|
632.612.599|0|ML|57|344.28|604.00|2|2|20|44103||ARN|FC||V|TN|||60|
632.612.600|0|ML|57|344.28|604.00|2|2|20|44103||ARN|FC||V|TP|||60|
632.612.601|0|ML|57|344.28|604.00|2|2|20|44103||AEC|FC||V|TN|||60|
632.612.602|0|ML|57|344.28|604.00|2|2|20|44103||AEC|FC||V|TP|||60|
632.612.603|0|ML|57|344.28|604.00|2|2|20|44103||AOC|FO||V|TN|||60|
632.612.604|0|ML|57|344.28|604.00|2|2|20|44103||AOC|FO||V|TP|||60|
632.612.605|0|ML|57|344.28|604.00|2|2|20|44103||AEO|FO||V|TN|||60|
632.612.606|0|ML|57|344.28|604.00|2|2|20|44103||AEO|FO||V|TP|||60|
633.612.599|0|ML|57|360.81|633.00|2|2|20|44103||ARN|FC||V|TN|||70|
633.612.600|0|ML|57|360.81|633.00|2|2|20|44103||ARN|FC||V|TP|||70|
633.612.601|0|ML|57|360.81|633.00|2|2|20|44103||AEC|FC||V|TN|||70|
633.612.602|0|ML|57|360.81|633.00|2|2|20|44103||AEC|FC||V|TP|||70|
633.612.603|0|ML|57|360.81|633.00|2|2|20|44103||AOC|FO||V|TN|||70|
633.612.604|0|ML|57|360.81|633.00|2|2|20|44103||AOC|FO||V|TP|||70|
633.612.605|0|ML|57|360.81|633.00|2|2|20|44103||AEO|FO||V|TN|||70|
633.612.606|0|ML|57|360.81|633.00|2|2|20|44103||AEO|FO||V|TP|||70|
634.612.599|0|ML|57|375.06|658.00|2|2|20|44103||ARN|FC||V|TN|||80|
634.612.600|0|ML|57|375.06|658.00|2|2|20|44103||ARN|FC||V|TP|||80|
634.612.601|0|ML|57|375.06|658.00|2|2|20|44103||AEC|FC||V|TN|||80|
634.612.602|0|ML|57|375.06|658.00|2|2|20|44103||AEC|FC||V|TP|||80|
634.612.603|0|ML|57|375.06|658.00|2|2|20|44103||AOC|FO||V|TN|||80|
634.612.604|0|ML|57|375.06|658.00|2|2|20|44103||AOC|FO||V|TP|||80|
634.612.605|0|ML|57|375.06|658.00|2|2|20|44103||AEO|FO||V|TN|||80|
634.612.606|0|ML|57|375.06|658.00|2|2|20|44103||AEO|FO||V|TP|||80|
635.612.599|0|ML|57|396.72|696.00|2|2|20|44103||ARN|FC||V|TN|||90|
635.612.600|0|ML|57|396.72|696.00|2|2|20|44103||ARN|FC||V|TP|||90|
635.612.601|0|ML|57|396.72|696.00|2|2|20|44103||AEC|FC||V|TN|||90|
635.612.602|0|ML|57|396.72|696.00|2|2|20|44103||AEC|FC||V|TP|||90|
635.612.603|0|ML|57|396.72|696.00|2|2|20|44103||AOC|FO||V|TN|||90|
635.612.604|0|ML|57|396.72|696.00|2|2|20|44103||AOC|FO||V|TP|||90|
635.612.605|0|ML|57|396.72|696.00|2|2|20|44103||AEO|FO||V|TN|||90|
635.612.606|0|ML|57|396.72|696.00|2|2|20|44103||AEO|FO||V|TP|||90|
636.612.599|0|ML|57|406.98|714.00|2|2|20|44103||ARN|FC||V|TN|||100|
636.612.600|0|ML|57|406.98|714.00|2|2|20|44103||ARN|FC||V|TP|||100|
636.612.601|0|ML|57|406.98|714.00|2|2|20|44103||AEC|FC||V|TN|||100|
636.612.602|0|ML|57|406.98|714.00|2|2|20|44103||AEC|FC||V|TP|||100|
636.612.603|0|ML|57|406.98|714.00|2|2|20|44103||AOC|FO||V|TN|||100|
636.612.604|0|ML|57|406.98|714.00|2|2|20|44103||AOC|FO||V|TP|||100|
636.612.605|0|ML|57|406.98|714.00|2|2|20|44103||AEO|FO||V|TN|||100|
636.612.606|0|ML|57|406.98|714.00|2|2|20|44103||AEO|FO||V|TP|||100|
637.612.599|0|ML|57|436.62|766.00|2|2|20|44103||ARN|FC||V|TN|||120|
637.612.600|0|ML|57|436.62|766.00|2|2|20|44103||ARN|FC||V|TP|||120|
637.612.601|0|ML|57|436.62|766.00|2|2|20|44103||AEC|FC||V|TN|||120|
637.612.602|0|ML|57|436.62|766.00|2|2|20|44103||AEC|FC||V|TP|||120|
637.612.603|0|ML|57|436.62|766.00|2|2|20|44103||AOC|FO||V|TN|||120|
637.612.604|0|ML|57|436.62|766.00|2|2|20|44103||AOC|FO||V|TP|||120|
637.612.605|0|ML|57|436.62|766.00|2|2|20|44103||AEO|FO||V|TN|||120|
637.612.606|0|ML|57|436.62|766.00|2|2|20|44103||AEO|FO||V|TP|||120|
638|0|TB|1|53.01|93.00|2|2|21|31110|||||||||60|
639|0|TB|1|63.27|111.00|2|2|21|31110|||||||||70|
640|0|TB|1|63.27|111.00|2|2|21|31110|||||||||80|
641|0|TB|1|70.68|124.00|2|2|21|31110|||||||||90|
642|0|TB|1|70.68|124.00|2|2|21|31110|||||||||100|
643|0|TB|1|78.66|138.00|2|2|21|31110|||||||||120|
644|0|TB|2|95.19|167.00|2|2|21|56550|||||||||60|
645|0|TB|2|116.85|205.00|2|2|21|56550|||||||||70|
646|0|TB|2|116.85|205.00|2|2|21|56550|||||||||80|
647|0|TB|2|138.51|243.00|2|2|21|56550|||||||||90|
648|0|TB|2|138.51|243.00|2|2|21|56550|||||||||100|
649|0|TB|2|159.60|280.00|2|2|21|56550|||||||||120|
650|0|TB|3|193.80|340.00|2|2|22|51531|||||||||120|
651|0|TB|4|142.50|250.00|2|2|23|51538||||||||||
652|0|TB|5|156.75|275.00|2|2|23|51539||||||||||
653|0|TB|6|202.35|355.00|2|2|23|56576||||||||||24
654|0|TB|7|65.55|115.00|2|2|23|51530|||||||||60|
655|0|TB|7|71.25|125.00|2|2|23|51530|||||||||70|
656|0|TB|7|79.80|140.00|2|2|23|51530|||||||||80|
657|0|TB|7|91.20|160.00|2|2|23|51530|||||||||90|
658|0|TB|7|102.60|180.00|2|2|23|51530|||||||||100|
659|0|TB|7|156.75|275.00|2|2|23|51530|||||||||120|
660.661|0|ML|58|173.85|305.00|2|2|24|28101|||||||CEN||60|
660.662|0|ML|58|173.85|305.00|2|2|24|29101|||||||ESQ||60|
660.663|0|ML|58|173.85|305.00|2|2|24|33101|||||||DIR||60|
664.661|0|ML|58|178.98|314.00|2|2|24|28101|||||||CEN||70|
664.662|0|ML|58|178.98|314.00|2|2|24|29101|||||||ESQ||70|
664.663|0|ML|58|178.98|314.00|2|2|24|33101|||||||DIR||70|
665.661|0|ML|58|186.39|327.00|2|2|24|28101|||||||CEN||80|
665.662|0|ML|58|186.39|327.00|2|2|24|29101|||||||ESQ||80|
665.663|0|ML|58|186.39|327.00|2|2|24|33101|||||||DIR||80|
666.661|0|ML|58|193.23|339.00|2|2|24|28101|||||||CEN||90|
666.662|0|ML|58|193.23|339.00|2|2|24|29101|||||||ESQ||90|
666.663|0|ML|58|193.23|339.00|2|2|24|33101|||||||DIR||90|
667.661|0|ML|58|209.19|367.00|2|2|24|28101|||||||CEN||100|
667.662|0|ML|58|209.19|367.00|2|2|24|29101|||||||ESQ||100|
667.663|0|ML|58|209.19|367.00|2|2|24|33101|||||||DIR||100|
668.661|0|ML|58|214.89|377.00|2|2|24|28101|||||||CEN||120|
668.662|0|ML|58|214.89|377.00|2|2|24|29101|||||||ESQ||120|
668.663|0|ML|58|214.89|377.00|2|2|24|33101|||||||DIR||120|
669.661|0|ML|59|246.81|433.00|2|2|24|28141|||||||CEN||60|
669.662|0|ML|59|246.81|433.00|2|2|24|29141|||||||ESQ||60|
669.663|0|ML|59|246.81|433.00|2|2|24|33141|||||||DIR||60|
670.661|0|ML|59|252.51|443.00|2|2|24|28141|||||||CEN||70|
670.662|0|ML|59|252.51|443.00|2|2|24|29141|||||||ESQ||70|
670.663|0|ML|59|252.51|443.00|2|2|24|33141|||||||DIR||70|
671.661|0|ML|59|260.49|457.00|2|2|24|28141|||||||CEN||80|
671.662|0|ML|59|260.49|457.00|2|2|24|29141|||||||ESQ||80|
671.663|0|ML|59|260.49|457.00|2|2|24|33141|||||||DIR||80|
672.661|0|ML|59|268.47|471.00|2|2|24|28141|||||||CEN||90|
672.662|0|ML|59|268.47|471.00|2|2|24|29141|||||||ESQ||90|
672.663|0|ML|59|268.47|471.00|2|2|24|33141|||||||DIR||90|
673.661|0|ML|59|285.57|501.00|2|2|24|28141|||||||CEN||100|
673.662|0|ML|59|285.57|501.00|2|2|24|29141|||||||ESQ||100|
673.663|0|ML|59|285.57|501.00|2|2|24|33141|||||||DIR||100|
674.661|0|ML|59|292.41|513.00|2|2|24|28141|||||||CEN||120|
674.662|0|ML|59|292.41|513.00|2|2|24|29141|||||||ESQ||120|
674.663|0|ML|59|292.41|513.00|2|2|24|33141|||||||DIR||120|
675.676.661|0|ML|60|192.09|337.00|2|2|24|28126|||||||CEN||60|
675.676.662|0|ML|60|192.09|337.00|2|2|24|29126|||||||ESQ||60|
675.676.663|0|ML|60|192.09|337.00|2|2|24|33126|||||||DIR||60|
675.677.661|0|ML|60|197.79|347.00|2|2|24|28126|||||||CEN||70|
675.677.662|0|ML|60|197.79|347.00|2|2|24|29126|||||||ESQ||70|
675.677.663|0|ML|60|197.79|347.00|2|2|24|33126|||||||DIR||70|
675.678.661|0|ML|60|205.77|361.00|2|2|24|28126|||||||CEN||80|
675.678.662|0|ML|60|205.77|361.00|2|2|24|29126|||||||ESQ||80|
675.678.663|0|ML|60|205.77|361.00|2|2|24|33126|||||||DIR||80|
675.679.661|0|ML|60|209.76|368.00|2|2|24|28126|||||||CEN||90|
675.679.662|0|ML|60|209.76|368.00|2|2|24|29126|||||||ESQ||90|
675.679.663|0|ML|60|209.76|368.00|2|2|24|33126|||||||DIR||90|
675.680.661|0|ML|60|218.88|384.00|2|2|24|28126|||||||CEN||100|
675.680.662|0|ML|60|218.88|384.00|2|2|24|29126|||||||ESQ||100|
675.680.663|0|ML|60|218.88|384.00|2|2|24|33126|||||||DIR||100|
675.681.661|0|ML|60|241.68|424.00|2|2|24|28126|||||||CEN||120|
675.681.662|0|ML|60|241.68|424.00|2|2|24|29126|||||||ESQ||120|
675.681.663|0|ML|60|241.68|424.00|2|2|24|33126|||||||DIR||120|
682.661|0|ML|61|261.63|459.00|2|2|24|28102|||||||CEN||60|
682.662|0|ML|61|261.63|459.00|2|2|24|29102|||||||ESQ||60|
682.663|0|ML|61|261.63|459.00|2|2|24|33102|||||||DIR||60|
683.661|0|ML|61|273.60|480.00|2|2|24|28102|||||||CEN||70|
683.662|0|ML|61|273.60|480.00|2|2|24|29102|||||||ESQ||70|
683.663|0|ML|61|273.60|480.00|2|2|24|33102|||||||DIR||70|
684.661|0|ML|61|278.73|489.00|2|2|24|28102|||||||CEN||80|
684.662|0|ML|61|278.73|489.00|2|2|24|29102|||||||ESQ||80|
684.663|0|ML|61|278.73|489.00|2|2|24|33102|||||||DIR||80|
685.661|0|ML|61|305.52|536.00|2|2|24|28102|||||||CEN||90|
685.662|0|ML|61|305.52|536.00|2|2|24|29102|||||||ESQ||90|
685.663|0|ML|61|305.52|536.00|2|2|24|33102|||||||DIR||90|
686.661|0|ML|61|320.34|562.00|2|2|24|28102|||||||CEN||100|
686.662|0|ML|61|320.34|562.00|2|2|24|29102|||||||ESQ||100|
686.663|0|ML|61|320.34|562.00|2|2|24|33102|||||||DIR||100|
687.661|0|ML|61|337.44|592.00|2|2|24|28102|||||||CEN||120|
687.662|0|ML|61|337.44|592.00|2|2|24|29102|||||||ESQ||120|
687.663|0|ML|61|337.44|592.00|2|2|24|33102|||||||DIR||120|
688.661|0|ML|62|274.74|482.00|2|2|24|28142|||||||CEN||60|
688.662|0|ML|62|274.74|482.00|2|2|24|29142|||||||ESQ||60|
688.663|0|ML|62|274.74|482.00|2|2|24|33142|||||||DIR||60|
689.661|0|ML|62|287.28|504.00|2|2|24|28142|||||||CEN||70|
689.662|0|ML|62|287.28|504.00|2|2|24|29142|||||||ESQ||70|
689.663|0|ML|62|287.28|504.00|2|2|24|33142|||||||DIR||70|
690.661|0|ML|62|292.41|513.00|2|2|24|28142|||||||CEN||80|
690.662|0|ML|62|292.41|513.00|2|2|24|29142|||||||ESQ||80|
690.663|0|ML|62|292.41|513.00|2|2|24|33142|||||||DIR||80|
691.661|0|ML|62|320.91|563.00|2|2|24|28142|||||||CEN||90|
691.662|0|ML|62|320.91|563.00|2|2|24|29142|||||||ESQ||90|
691.663|0|ML|62|320.91|563.00|2|2|24|33142|||||||DIR||90|
692.661|0|ML|62|336.30|590.00|2|2|24|28142|||||||CEN||100|
692.662|0|ML|62|336.30|590.00|2|2|24|29142|||||||ESQ||100|
692.663|0|ML|62|336.30|590.00|2|2|24|33142|||||||DIR||100|
693.661|0|ML|62|354.54|622.00|2|2|24|28142|||||||CEN||120|
693.662|0|ML|62|354.54|622.00|2|2|24|29142|||||||ESQ||120|
693.663|0|ML|62|354.54|622.00|2|2|24|33142|||||||DIR||120|
694.661|0|ML|63|359.67|631.00|2|2|24|28103|||||||CEN||60|
694.662|0|ML|63|359.67|631.00|2|2|24|29103|||||||ESQ||60|
694.663|0|ML|63|359.67|631.00|2|2|24|33103|||||||DIR||60|
695.661|0|ML|63|376.77|661.00|2|2|24|28103|||||||CEN||70|
695.662|0|ML|63|376.77|661.00|2|2|24|29103|||||||ESQ||70|
695.663|0|ML|63|376.77|661.00|2|2|24|33103|||||||DIR||70|
696.661|0|ML|63|392.16|688.00|2|2|24|28103|||||||CEN||80|
696.662|0|ML|63|392.16|688.00|2|2|24|29103|||||||ESQ||80|
696.663|0|ML|63|392.16|688.00|2|2|24|33103|||||||DIR||80|
697.661|0|ML|63|414.96|728.00|2|2|24|28103|||||||CEN||90|
697.662|0|ML|63|414.96|728.00|2|2|24|29103|||||||ESQ||90|
697.663|0|ML|63|414.96|728.00|2|2|24|33103|||||||DIR||90|
698.661|0|ML|63|425.22|746.00|2|2|24|28103|||||||CEN||100|
698.662|0|ML|63|425.22|746.00|2|2|24|29103|||||||ESQ||100|
698.663|0|ML|63|425.22|746.00|2|2|24|33103|||||||DIR||100|
699.661|0|ML|63|456.00|800.00|2|2|24|28103|||||||CEN||120|
699.662|0|ML|63|456.00|800.00|2|2|24|29103|||||||ESQ||120|
699.663|0|ML|63|456.00|800.00|2|2|24|33103|||||||DIR||120|
700|0|TB|8|156.75|275.00|2|2|25|56570||||||||||24
701|0|TB|9|182.40|320.00|2|2|25|56573||||||||||25
702|0|TB|10|158.46|278.00|2|2|25|56580|||||||||60|
703|0|TB|10|169.86|298.00|2|2|25|56580|||||||||70|
704|0|TB|10|184.11|323.00|2|2|25|56580|||||||||80|
705|0|TB|10|198.93|349.00|2|2|25|56580|||||||||90|
706|0|TB|10|221.16|388.00|2|2|25|56580|||||||||100|
707|0|TB|10|261.06|458.00|2|2|25|56580|||||||||120|
708|0|TB|11|59.85|105.00|2|2|25|51520|||||||||60|
709|0|TB|11|62.70|110.00|2|2|25|51520|||||||||70|
710|0|TB|11|68.40|120.00|2|2|25|51520|||||||||80|
711|0|TB|11|82.65|145.00|2|2|25|51520|||||||||90|
712|0|TB|11|91.20|160.00|2|2|25|51520|||||||||100|
713|0|TB|11|136.80|240.00|2|2|25|51520|||||||||120|
714|0|ML|64|181.26|318.00|2|2|26|26101|||||||||60|
715|0|ML|64|186.96|328.00|2|2|26|26101|||||||||70|
716|0|ML|64|194.37|341.00|2|2|26|26101|||||||||80|
717|0|ML|64|201.78|354.00|2|2|26|26101|||||||||90|
718|0|ML|64|218.31|383.00|2|2|26|26101|||||||||100|
719|0|ML|64|224.58|394.00|2|2|26|26101|||||||||120|
720|0|ML|65|257.64|452.00|2|2|27|26141|||||||||60|
721|0|ML|65|263.34|462.00|2|2|27|26141|||||||||70|
722|0|ML|65|271.89|477.00|2|2|27|26141|||||||||80|
723|0|ML|65|279.87|491.00|2|2|27|26141|||||||||90|
724|0|ML|65|298.11|523.00|2|2|27|26141|||||||||100|
725|0|ML|65|304.95|535.00|2|2|27|26141|||||||||120|
726|0|ML|66|273.03|479.00|2|2|27|26102|||||||||60|
727|0|ML|66|285.00|500.00|2|2|27|26102|||||||||70|
728|0|ML|66|290.70|510.00|2|2|27|26102|||||||||80|
729|0|ML|66|318.63|559.00|2|2|27|26102|||||||||90|
730|0|ML|66|334.59|587.00|2|2|27|26102|||||||||100|
731|0|ML|66|352.26|618.00|2|2|27|26102|||||||||120|
732|0|ML|67|286.71|503.00|2|2|27|26142|||||||||60|
733|0|ML|67|299.25|525.00|2|2|27|26142|||||||||70|
734|0|ML|67|305.52|536.00|2|2|27|26142|||||||||80|
735|0|ML|67|334.59|587.00|2|2|27|26142|||||||||90|
736|0|ML|67|351.12|616.00|2|2|27|26142|||||||||100|
737|0|ML|67|369.93|649.00|2|2|27|26142|||||||||120|
738|0|ML|68|375.63|659.00|2|2|27|26103|||||||||60|
739|0|ML|68|393.30|690.00|2|2|27|26103|||||||||70|
740|0|ML|68|409.26|718.00|2|2|27|26103|||||||||80|
741|0|ML|68|433.20|760.00|2|2|27|26103|||||||||90|
742|0|ML|68|444.03|779.00|2|2|27|26103|||||||||100|
743|0|ML|68|475.95|835.00|2|2|27|26103|||||||||120|
744.745.746|0|ML|69|361.95|635.00|2|2|28|26107|||||||||90|
744.745.747|0|ML|70|361.95|635.00|2|2|28|26109|||||||||90|
744.745.748.749|0|ML|71|361.95|635.00|2|2|28|26130|||||||||90|
744.745.748.750|0|ML|72|361.95|635.00|2|2|28|26106|||||||||90|
744.751.746|0|ML|69|388.74|682.00|2|2|28|26107|||||||||100|
744.751.747|0|ML|70|388.74|682.00|2|2|28|26109|||||||||100|
744.751.748.749|0|ML|71|388.74|682.00|2|2|28|26130|||||||||100|
744.751.748.750|0|ML|72|388.74|682.00|2|2|28|26106|||||||||100|
744.752.746|0|ML|69|407.55|715.00|2|2|28|26107|||||||||120|
744.752.747|0|ML|70|407.55|715.00|2|2|28|26109|||||||||120|
744.752.748.749|0|ML|71|407.55|715.00|2|2|28|26130|||||||||120|
744.752.748.750|0|ML|72|407.55|715.00|2|2|28|26106|||||||||120|
753|0|TB|12|48.45|85.00|2|2|29|31386|||||||||60|
754|0|TB|12|51.30|90.00|2|2|29|31386|||||||||70|
755|0|TB|12|57.00|100.00|2|2|29|31386|||||||||80|
756|0|TB|12|62.13|109.00|2|2|29|31386|||||||||90|
757|0|TB|12|64.98|114.00|2|2|29|31386|||||||||100|
758|0|TB|12|76.95|135.00|2|2|29|31386|||||||||120|
759|0|TB|13|82.65|145.00|2|2|29|51534||||||||||
760|0|TB|14|198.93|349.00|2|2|29|56582|||||||||90|
761|0|TB|14|221.16|388.00|2|2|29|56582|||||||||100|
762|0|TB|14|261.06|458.00|2|2|29|56582|||||||||120|
763|0|TB|15|193.80|340.00|2|2|29|51543|||||||||80|
764|0|TB|15|239.40|420.00|2|2|29|51543|||||||||100|
765|0|TB|15|282.15|495.00|2|2|29|51543|||||||||120|
766|0|TB|16|156.75|275.00|2|2|30|31369|||||||||80|
767|0|TB|16|168.15|295.00|2|2|30|31369|||||||||100|
768|0|TB|16|176.70|310.00|2|2|30|31369|||||||||120|
769|0|TB|17|57.00|100.00|2|2|31|31382|||||||||80|
770|0|TB|17|64.98|114.00|2|2|31|31382|||||||||100|
771|0|TB|17|76.95|135.00|2|2|31|31382|||||||||120|
772|0|ML|73|205.70|374.00|3|3|32|||||||||||26
773|0|ML|73|221.10|402.00|3|3|32|||||||||||27
774|0|ML|73|240.35|437.00|3|3|32|||||||||||28
775|0|ML|73|411.40|748.00|3|3|32|||||||||||29
776|0|ML|74|205.70|374.00|3|3|33|||||||||||26
777|0|ML|74|221.10|402.00|3|3|33|||||||||||27
778|0|ML|74|240.35|437.00|3|3|33|||||||||||28
779|0|ML|74|411.40|748.00|3|3|33|||||||||||29
780|0|ML|75|123.20|224.00|3|3|34|||||||||||26
781|0|ML|75|138.60|252.00|3|3|34|||||||||||27
782|0|ML|75|157.85|287.00|3|3|34|||||||||||28
783|0|ML|75|247.50|450.00|3|3|34|||||||||||29
784|0|ML|76|123.20|224.00|3|3|35|||||||||||26
785|0|ML|76|138.60|252.00|3|3|35|||||||||||27
786|0|ML|76|157.85|287.00|3|3|35|||||||||||28
787|0|ML|76|247.50|450.00|3|3|35|||||||||||29
788|0|ML|77|157.30|286.00|3|3|36||||||||||60|
789|0|ML|77|168.85|307.00|3|3|36||||||||||80|
790|0|ML|77|179.85|327.00|3|3|36||||||||||100|
791|0|ML|77|314.60|572.00|3|3|36||||||||||120|
792|0|TB|18|34.10|62.00|3|3|37|||||||||||30
793|0|TB|18|38.50|70.00|3|3|37|||||||||||31
794|0|TB|18|41.80|76.00|3|3|37|||||||||||32
795|0|TB|18|45.65|83.00|3|3|37|||||||||||33
796|0|TB|18|51.70|94.00|3|3|37|||||||||||34
797|0|TB|18|59.95|109.00|3|3|37|||||||||||35
798|0|TB|19|47.85|87.00|3|3|38|||||||||||30
799|0|TB|19|57.20|104.00|3|3|38|||||||||||31
800|0|TB|19|70.95|129.00|3|3|38|||||||||||32
801|0|TB|19|74.25|135.00|3|3|38|||||||||||33
802|0|TB|19|84.15|153.00|3|3|38|||||||||||34
803|0|TB|19|96.25|175.00|3|3|38|||||||||||35
804|0|TB|20|16.50|30.00|3|3|39|||||||||||
805|0|TB|21|33.00|60.00|3|3|39|||||||||||
806|0|TB|22|70.95|129.00|3|3|40|||||||||||30
807|0|TB|22|85.80|156.00|3|3|40|||||||||||31
808|0|TB|22|102.85|187.00|3|3|40|||||||||||32
809|0|TB|23|121.00|220.00|3|3|40|||||||||||33
810|0|TB|24|121.00|220.00|3|3|40|||||||||||33
811|0|TB|25|121.00|220.00|3|3|41|||||||||||33
812|0|TB|26|70.95|129.00|3|3|42|||||||||||36
813|0|TB|26|85.80|156.00|3|3|42|||||||||||37
814|0|TB|26|102.85|187.00|3|3|42|||||||||||38
815|0|TB|27|70.95|129.00|3|3|42|||||||||||39
816|0|TB|28|70.95|129.00|3|3|42|||||||||||39
817|0|TB|29|85.80|156.00|3|3|42|||||||||||40
818|0|TB|30|85.80|156.00|3|3|42|||||||||||41
819|0|TB|31|85.80|156.00|3|3|42|||||||||||40
820|0|TB|32|85.80|156.00|3|3|42|||||||||||41
821|0|E|1|26.95|49.00|3|3|43|||||||||||42
822|0|E|1|34.65|63.00|3|3|43|||||||||||43
823|0|E|1|39.60|72.00|3|3|43|||||||||||44
824|0|E|1|58.85|107.00|3|3|43|||||||||||45
825|0|E|2|93.50|170.00|3|3|44|||||||||||42
826|0|E|2|102.30|186.00|3|3|44|||||||||||43
827|0|E|2|116.05|211.00|3|3|44|||||||||||44
828|0|E|2|125.40|228.00|3|3|44|||||||||||45
829|0|E|3|80.30|146.00|3|3|45|||||||||||46
830|0|E|3|96.80|176.00|3|3|45|||||||||||47
831|0|E|3|112.20|204.00|3|3|45|||||||||||48
832|0|E|4|100.65|183.00|3|3|46|||||||||||46
833|0|E|4|123.75|225.00|3|3|46|||||||||||47
834|0|E|4|141.35|257.00|3|3|46|||||||||||48
835|0|E|5|85.80|156.00|3|3|47|||||||||||46
836|0|E|5|105.60|192.00|3|3|47|||||||||||47
837|0|E|5|122.10|222.00|3|3|47|||||||||||48
838|0|E|6|34.65|63.00|3|3|43|||||||||||49
839|0|E|7|96.80|176.00|3|3|45|||||||||||49
840|0|E|8|96.80|176.00|3|3|48|||||||||||50
841|0|E|9|102.30|186.00|3|3|49|||||||||||49
842|0|E|10|123.75|225.00|3|3|46|||||||||||49
843|0|E|11|123.75|225.00|3|3|50|||||||||||50
844.845|0|C|1|140.40|260.00|1|1|51|||TBL|TBL|||||||51
844.846|0|C|1|140.40|260.00|1|1|51|||TEA|TEA|||||||51
844.847|0|C|1|140.40|260.00|1|1|51|||OAK|OAK|||||||51
844.848|0|C|1|140.40|260.00|1|1|51|||JOP|JOP|||||||51
844.849|0|C|1|167.40|310.00|1|1|52|||TBL|BCO|B||||||51
844.850|0|C|1|167.40|310.00|1|1|52|||TBL|BCO|M||||||51
844.851|0|C|1|167.40|310.00|1|1|52|||TBL|CCL|B||||||51
844.852|0|C|1|167.40|310.00|1|1|52|||TBL|CCL|M||||||51
844.853|0|C|1|167.40|310.00|1|1|52|||TBL|CME|B||||||51
844.854|0|C|1|167.40|310.00|1|1|52|||TBL|CME|M||||||51
844.855|0|C|1|167.40|310.00|1|1|52|||TBL|ANT|B||||||51
844.856|0|C|1|167.40|310.00|1|1|52|||TBL|ANT|M||||||51
844.857|0|C|1|167.40|310.00|1|1|52|||TBL|PTO|B||||||51
844.858|0|C|1|167.40|310.00|1|1|52|||TBL|PTO|M||||||51
844.859|0|C|1|167.40|310.00|1|1|52|||TBL|CRE|B||||||51
844.860|0|C|1|167.40|310.00|1|1|52|||TBL|CRE|M||||||51
844.861|0|C|1|167.40|310.00|1|1|52|||TBL|CAM|B||||||51
844.862|0|C|1|167.40|310.00|1|1|52|||TBL|CAM|M||||||51
844.863|0|C|1|167.40|310.00|1|1|52|||TBL|OUR|B||||||51
844.864|0|C|1|167.40|310.00|1|1|52|||TBL|OUR|M||||||51
844.865|0|C|1|167.40|310.00|1|1|52|||TBL|COB|B||||||51
844.866|0|C|1|167.40|310.00|1|1|52|||TBL|COB|M||||||51
844.867|0|C|1|167.40|310.00|1|1|52|||TBL|CHO|B||||||51
844.868|0|C|1|167.40|310.00|1|1|52|||TBL|CHO|M||||||51
844.869|0|C|1|167.40|310.00|1|1|52|||TBL|VAG|B||||||51
844.870|0|C|1|167.40|310.00|1|1|52|||TBL|VAG|M||||||51
844.871|0|C|1|167.40|310.00|1|1|52|||TBL|AZE|B||||||51
844.872|0|C|1|167.40|310.00|1|1|52|||TBL|AZE|M||||||51
844.873|0|C|1|167.40|310.00|1|1|52|||TBL|AMA|B||||||51
844.874|0|C|1|167.40|310.00|1|1|52|||TBL|AMA|M||||||51
844.875|0|C|1|167.40|310.00|1|1|52|||TBL|AES|B||||||51
844.876|0|C|1|167.40|310.00|1|1|52|||TBL|AES|M||||||51
844.877|0|C|1|167.40|310.00|1|1|52|||TBL|PRA|B||||||51
844.878|0|C|1|167.40|310.00|1|1|52|||TBL|PRA|M||||||51
844.879|0|C|1|167.40|310.00|1|1|52|||TBL|ROS|B||||||51
844.880|0|C|1|167.40|310.00|1|1|52|||TBL|ROS|M||||||51
844.881|0|C|1|167.40|310.00|1|1|52|||TBL|VER|B||||||51
844.882|0|C|1|167.40|310.00|1|1|52|||TBL|VER|M||||||51
844.883|0|C|1|167.40|310.00|1|1|52|||TBL|AZB|||||||51
844.884|0|C|1|167.40|310.00|1|1|52|||TBL|DEN|||||||51
844.885|0|C|1|167.40|310.00|1|1|52|||TBL|BLK|||||||51
844.886|0|C|1|167.40|310.00|1|1|52|||TBL|ART|||||||51
844.887|0|C|1|167.40|310.00|1|1|52|||TBL|LIN|||||||51
844.888|0|C|1|167.40|310.00|1|1|52|||TBL|HAL|||||||51
844.889|0|C|1|189.00|350.00|1|1|52|||BCO|BCO|B||||||51
844.890|0|C|1|189.00|350.00|1|1|52|||BCO|BCO|M||||||51
844.891|0|C|1|189.00|350.00|1|1|52|||CCL|CCL|B||||||51
844.892|0|C|1|189.00|350.00|1|1|52|||CCL|CCL|M||||||51
844.893|0|C|1|189.00|350.00|1|1|52|||CME|CME|B||||||51
844.894|0|C|1|189.00|350.00|1|1|52|||CME|CME|M||||||51
844.895|0|C|1|189.00|350.00|1|1|52|||ANT|ANT|B||||||51
844.896|0|C|1|189.00|350.00|1|1|52|||ANT|ANT|M||||||51
844.897|0|C|1|189.00|350.00|1|1|52|||PTO|PTO|B||||||51
844.898|0|C|1|189.00|350.00|1|1|52|||PTO|PTO|M||||||51
844.899|0|C|1|189.00|350.00|1|1|52|||CRE|CRE|B||||||51
844.900|0|C|1|189.00|350.00|1|1|52|||CRE|CRE|M||||||51
844.901|0|C|1|189.00|350.00|1|1|52|||CAM|CAM|B||||||51
844.902|0|C|1|189.00|350.00|1|1|52|||CAM|CAM|M||||||51
844.903|0|C|1|189.00|350.00|1|1|52|||OUR|OUR|B||||||51
844.904|0|C|1|189.00|350.00|1|1|52|||OUR|OUR|M||||||51
844.905|0|C|1|189.00|350.00|1|1|52|||COB|COB|B||||||51
844.906|0|C|1|189.00|350.00|1|1|52|||COB|COB|M||||||51
844.907|0|C|1|189.00|350.00|1|1|52|||CHO|CHO|B||||||51
844.908|0|C|1|189.00|350.00|1|1|52|||CHO|CHO|M||||||51
844.909|0|C|1|189.00|350.00|1|1|52|||VAG|VAG|B||||||51
844.910|0|C|1|189.00|350.00|1|1|52|||VAG|VAG|M||||||51
844.911|0|C|1|189.00|350.00|1|1|52|||AZE|AZE|B||||||51
844.912|0|C|1|189.00|350.00|1|1|52|||AZE|AZE|M||||||51
844.913|0|C|1|189.00|350.00|1|1|52|||AMA|AMA|B||||||51
844.914|0|C|1|189.00|350.00|1|1|52|||AMA|AMA|M||||||51
844.915|0|C|1|189.00|350.00|1|1|52|||AES|AES|B||||||51
844.916|0|C|1|189.00|350.00|1|1|52|||AES|AES|M||||||51
844.917|0|C|1|189.00|350.00|1|1|52|||PRA|PRA|B||||||51
844.918|0|C|1|189.00|350.00|1|1|52|||PRA|PRA|M||||||51
844.919|0|C|1|189.00|350.00|1|1|52|||ROS|ROS|B||||||51
844.920|0|C|1|189.00|350.00|1|1|52|||ROS|ROS|M||||||51
844.921|0|C|1|189.00|350.00|1|1|52|||VER|VER|B||||||51
844.922|0|C|1|189.00|350.00|1|1|52|||VER|VER|M||||||51
844.923|0|C|1|189.00|350.00|1|1|52|||AZB|AZB|||||||51
844.924|0|C|1|189.00|350.00|1|1|52|||DEN|DEN|||||||51
844.925|0|C|1|189.00|350.00|1|1|52|||BLK|BLK|||||||51
844.926|0|C|1|189.00|350.00|1|1|52|||ART|ART|||||||51
844.927|0|C|1|189.00|350.00|1|1|52|||LIN|LIN|||||||51
844.928|0|C|1|189.00|350.00|1|1|52|||HAL|HAL|||||||51
929|0|C|2|74.25|135.00|3|3|53|1H||||||||||52
930|0|C|3|83.60|152.00|3|3|53|3H||||||||||53
931.932|0|C|4|111.10|202.00|3|3|53|PI||||||||ESQ||53
931.933|0|C|4|111.10|202.00|3|3|53|PD||||||||DIR||53
934|0|C|5|101.75|185.00|3|3|53|PHBI||||||||ESQ||53
935|0|C|5|101.75|185.00|3|3|53|PHBD||||||||DIR||53
936|0|C|6|101.75|185.00|3|3|53|PHAI||||||||ESQ||53
937|0|C|6|101.75|185.00|3|3|53|PHAD||||||||DIR||53
938|0|C|7|46.75|85.00|3|3|54|1H||||||||||52
939|0|C|8|56.10|102.00|3|3|54|3H||||||||||53
940.941|0|C|9|61.05|111.00|3|3|54|PI||||||||ESQ||53
940.942|0|C|9|61.05|111.00|3|3|54|PD||||||||DIR||53
943|0|C|10|54.45|99.00|3|3|54|PHBI||||||||ESQ||53
944|0|C|10|54.45|99.00|3|3|54|PHBD||||||||DIR||53
945|0|C|11|54.45|99.00|3|3|54|PHAI||||||||ESQ||53
946|0|C|11|54.45|99.00|3|3|54|PHAD||||||||DIR||53
947.948.845|0|C|12|71.28|132.00|1|1|55|||TBL|TBL|||||||54
947.948.846|0|C|12|71.28|132.00|1|1|55|||TEA|TEA|||||||54
947.948.847|0|C|12|71.28|132.00|1|1|55|||OAK|OAK|||||||54
947.948.848|0|C|12|71.28|132.00|1|1|55|||JOP|JOP|||||||54
947.948.949|0|C|12|114.48|212.00|1|1|55|||TBR|BCO|B||||||54
947.948.950|0|C|12|114.48|212.00|1|1|55|||TBR|BCO|M||||||54
947.948.951|0|C|12|114.48|212.00|1|1|55|||TBR|CCL|B||||||54
947.948.952|0|C|12|114.48|212.00|1|1|55|||TBR|CCL|M||||||54
947.948.953|0|C|12|114.48|212.00|1|1|55|||TBR|CME|B||||||54
947.948.954|0|C|12|114.48|212.00|1|1|55|||TBR|CME|M||||||54
947.948.955|0|C|12|114.48|212.00|1|1|55|||TBR|ANT|B||||||54
947.948.956|0|C|12|114.48|212.00|1|1|55|||TBR|ANT|M||||||54
947.948.957|0|C|12|114.48|212.00|1|1|55|||TBR|PTO|B||||||54
947.948.958|0|C|12|114.48|212.00|1|1|55|||TBR|PTO|M||||||54
947.948.959|0|C|12|114.48|212.00|1|1|55|||TBR|CRE|B||||||54
947.948.960|0|C|12|114.48|212.00|1|1|55|||TBR|CRE|M||||||54
947.948.961|0|C|12|114.48|212.00|1|1|55|||TBR|CAM|B||||||54
947.948.962|0|C|12|114.48|212.00|1|1|55|||TBR|CAM|M||||||54
947.948.963|0|C|12|114.48|212.00|1|1|55|||TBR|OUR|B||||||54
947.948.964|0|C|12|114.48|212.00|1|1|55|||TBR|OUR|M||||||54
947.948.965|0|C|12|114.48|212.00|1|1|55|||TBR|COB|B||||||54
947.948.966|0|C|12|114.48|212.00|1|1|55|||TBR|COB|M||||||54
947.948.967|0|C|12|114.48|212.00|1|1|55|||TBR|CHO|B||||||54
947.948.968|0|C|12|114.48|212.00|1|1|55|||TBR|CHO|M||||||54
947.948.969|0|C|12|114.48|212.00|1|1|55|||TBR|VAG|B||||||54
947.948.970|0|C|12|114.48|212.00|1|1|55|||TBR|VAG|M||||||54
947.948.971|0|C|12|114.48|212.00|1|1|55|||TBR|AZE|B||||||54
947.948.972|0|C|12|114.48|212.00|1|1|55|||TBR|AZE|M||||||54
947.948.973|0|C|12|114.48|212.00|1|1|55|||TBR|AMA|B||||||54
947.948.974|0|C|12|114.48|212.00|1|1|55|||TBR|AMA|M||||||54
947.948.975|0|C|12|114.48|212.00|1|1|55|||TBR|AES|B||||||54
947.948.976|0|C|12|114.48|212.00|1|1|55|||TBR|AES|M||||||54
947.948.977|0|C|12|114.48|212.00|1|1|55|||TBR|PRA|B||||||54
947.948.978|0|C|12|114.48|212.00|1|1|55|||TBR|PRA|M||||||54
947.948.979|0|C|12|114.48|212.00|1|1|55|||TBR|ROS|B||||||54
947.948.980|0|C|12|114.48|212.00|1|1|55|||TBR|ROS|M||||||54
947.948.981|0|C|12|114.48|212.00|1|1|55|||TBR|VER|B||||||54
947.948.982|0|C|12|114.48|212.00|1|1|55|||TBR|VER|M||||||54
947.948.983|0|C|12|114.48|212.00|1|1|55|||TBR|AZB|||||||54
947.948.984|0|C|12|114.48|212.00|1|1|55|||TBR|DEN|||||||54
947.948.985|0|C|12|114.48|212.00|1|1|55|||TBR|BLK|||||||54
947.948.986|0|C|12|114.48|212.00|1|1|55|||TBR|ART|||||||54
947.948.987|0|C|12|114.48|212.00|1|1|55|||TBR|LIN|||||||54
947.948.988|0|C|12|114.48|212.00|1|1|55|||TBR|HAL|||||||54
947.948.989|0|C|12|136.08|252.00|1|1|55|||BCO|BCO|B||||||54
947.948.990|0|C|12|136.08|252.00|1|1|55|||BCO|BCO|M||||||54
947.948.991|0|C|12|136.08|252.00|1|1|55|||CCL|CCL|B||||||54
947.948.992|0|C|12|136.08|252.00|1|1|55|||CCL|CCL|M||||||54
947.948.993|0|C|12|136.08|252.00|1|1|55|||CME|CME|B||||||54
947.948.994|0|C|12|136.08|252.00|1|1|55|||CME|CME|M||||||54
947.948.995|0|C|12|136.08|252.00|1|1|55|||ANT|ANT|B||||||54
947.948.996|0|C|12|136.08|252.00|1|1|55|||ANT|ANT|M||||||54
947.948.997|0|C|12|136.08|252.00|1|1|55|||PTO|PTO|B||||||54
947.948.998|0|C|12|136.08|252.00|1|1|55|||PTO|PTO|M||||||54
947.948.999|0|C|12|136.08|252.00|1|1|55|||CRE|CRE|B||||||54
947.948.1000|0|C|12|136.08|252.00|1|1|55|||CRE|CRE|M||||||54
947.948.1001|0|C|12|136.08|252.00|1|1|55|||CAM|CAM|B||||||54
947.948.1002|0|C|12|136.08|252.00|1|1|55|||CAM|CAM|M||||||54
947.948.1003|0|C|12|136.08|252.00|1|1|55|||OUR|OUR|B||||||54
947.948.1004|0|C|12|136.08|252.00|1|1|55|||OUR|OUR|M||||||54
947.948.1005|0|C|12|136.08|252.00|1|1|55|||COB|COB|B||||||54
947.948.1006|0|C|12|136.08|252.00|1|1|55|||COB|COB|M||||||54
947.948.1007|0|C|12|136.08|252.00|1|1|55|||CHO|CHO|B||||||54
947.948.1008|0|C|12|136.08|252.00|1|1|55|||CHO|CHO|M||||||54
947.948.1009|0|C|12|136.08|252.00|1|1|55|||VAG|VAG|B||||||54
947.948.1010|0|C|12|136.08|252.00|1|1|55|||VAG|VAG|M||||||54
947.948.1011|0|C|12|136.08|252.00|1|1|55|||AZE|AZE|B||||||54
947.948.1012|0|C|12|136.08|252.00|1|1|55|||AZE|AZE|M||||||54
947.948.1013|0|C|12|136.08|252.00|1|1|55|||AMA|AMA|B||||||54
947.948.1014|0|C|12|136.08|252.00|1|1|55|||AMA|AMA|M||||||54
947.948.1015|0|C|12|136.08|252.00|1|1|55|||AES|AES|B||||||54
947.948.1016|0|C|12|136.08|252.00|1|1|55|||AES|AES|M||||||54
947.948.1017|0|C|12|136.08|252.00|1|1|55|||PRA|PRA|B||||||54
947.948.1018|0|C|12|136.08|252.00|1|1|55|||PRA|PRA|M||||||54
947.948.1019|0|C|12|136.08|252.00|1|1|55|||ROS|ROS|B||||||54
947.948.1020|0|C|12|136.08|252.00|1|1|55|||ROS|ROS|M||||||54
947.948.1021|0|C|12|136.08|252.00|1|1|55|||VER|VER|B||||||54
947.948.1022|0|C|12|136.08|252.00|1|1|55|||VER|VER|M||||||54
947.948.1023|0|C|12|136.08|252.00|1|1|55|||AZB|AZB|||||||54
947.948.1024|0|C|12|136.08|252.00|1|1|55|||DEN|DEN|||||||54
947.948.1025|0|C|12|136.08|252.00|1|1|55|||BLK|BLK|||||||54
947.948.1026|0|C|12|136.08|252.00|1|1|55|||ART|ART|||||||54
947.948.1027|0|C|12|136.08|252.00|1|1|55|||LIN|LIN|||||||54
947.948.1028|0|C|12|136.08|252.00|1|1|55|||HAL|HAL|||||||54
1029.1030.845|0|C|13|91.80|170.00|1|1|55|||TBL|TBL|||||||55
1029.1030.846|0|C|13|91.80|170.00|1|1|55|||TEA|TEA|||||||55
1029.1030.847|0|C|13|91.80|170.00|1|1|55|||OAK|OAK|||||||55
1029.1030.848|0|C|13|91.80|170.00|1|1|55|||JOP|JOP|||||||55
1029.1030.949|0|C|13|135.00|250.00|1|1|55|||TBR|BCO|B||||||55
1029.1030.950|0|C|13|135.00|250.00|1|1|55|||TBR|BCO|M||||||55
1029.1030.951|0|C|13|135.00|250.00|1|1|55|||TBR|CCL|B||||||55
1029.1030.952|0|C|13|135.00|250.00|1|1|55|||TBR|CCL|M||||||55
1029.1030.953|0|C|13|135.00|250.00|1|1|55|||TBR|CME|B||||||55
1029.1030.954|0|C|13|135.00|250.00|1|1|55|||TBR|CME|M||||||55
1029.1030.955|0|C|13|135.00|250.00|1|1|55|||TBR|ANT|B||||||55
1029.1030.956|0|C|13|135.00|250.00|1|1|55|||TBR|ANT|M||||||55
1029.1030.957|0|C|13|135.00|250.00|1|1|55|||TBR|PTO|B||||||55
1029.1030.958|0|C|13|135.00|250.00|1|1|55|||TBR|PTO|M||||||55
1029.1030.959|0|C|13|135.00|250.00|1|1|55|||TBR|CRE|B||||||55
1029.1030.960|0|C|13|135.00|250.00|1|1|55|||TBR|CRE|M||||||55
1029.1030.961|0|C|13|135.00|250.00|1|1|55|||TBR|CAM|B||||||55
1029.1030.962|0|C|13|135.00|250.00|1|1|55|||TBR|CAM|M||||||55
1029.1030.963|0|C|13|135.00|250.00|1|1|55|||TBR|OUR|B||||||55
1029.1030.964|0|C|13|135.00|250.00|1|1|55|||TBR|OUR|M||||||55
1029.1030.965|0|C|13|135.00|250.00|1|1|55|||TBR|COB|B||||||55
1029.1030.966|0|C|13|135.00|250.00|1|1|55|||TBR|COB|M||||||55
1029.1030.967|0|C|13|135.00|250.00|1|1|55|||TBR|CHO|B||||||55
1029.1030.968|0|C|13|135.00|250.00|1|1|55|||TBR|CHO|M||||||55
1029.1030.969|0|C|13|135.00|250.00|1|1|55|||TBR|VAG|B||||||55
1029.1030.970|0|C|13|135.00|250.00|1|1|55|||TBR|VAG|M||||||55
1029.1030.971|0|C|13|135.00|250.00|1|1|55|||TBR|AZE|B||||||55
1029.1030.972|0|C|13|135.00|250.00|1|1|55|||TBR|AZE|M||||||55
1029.1030.973|0|C|13|135.00|250.00|1|1|55|||TBR|AMA|B||||||55
1029.1030.974|0|C|13|135.00|250.00|1|1|55|||TBR|AMA|M||||||55
1029.1030.975|0|C|13|135.00|250.00|1|1|55|||TBR|AES|B||||||55
1029.1030.976|0|C|13|135.00|250.00|1|1|55|||TBR|AES|M||||||55
1029.1030.977|0|C|13|135.00|250.00|1|1|55|||TBR|PRA|B||||||55
1029.1030.978|0|C|13|135.00|250.00|1|1|55|||TBR|PRA|M||||||55
1029.1030.979|0|C|13|135.00|250.00|1|1|55|||TBR|ROS|B||||||55
1029.1030.980|0|C|13|135.00|250.00|1|1|55|||TBR|ROS|M||||||55
1029.1030.981|0|C|13|135.00|250.00|1|1|55|||TBR|VER|B||||||55
1029.1030.982|0|C|13|135.00|250.00|1|1|55|||TBR|VER|M||||||55
1029.1030.983|0|C|13|135.00|250.00|1|1|55|||TBR|AZB|||||||55
1029.1030.984|0|C|13|135.00|250.00|1|1|55|||TBR|DEN|||||||55
1029.1030.985|0|C|13|135.00|250.00|1|1|55|||TBR|BLK|||||||55
1029.1030.986|0|C|13|135.00|250.00|1|1|55|||TBR|ART|||||||55
1029.1030.987|0|C|13|135.00|250.00|1|1|55|||TBR|LIN|||||||55
1029.1030.988|0|C|13|135.00|250.00|1|1|55|||TBR|HAL|||||||55
1029.1030.989|0|C|13|156.60|290.00|1|1|55|||BCO|BCO|B||||||55
1029.1030.990|0|C|13|156.60|290.00|1|1|55|||BCO|BCO|M||||||55
1029.1030.991|0|C|13|156.60|290.00|1|1|55|||CCL|CCL|B||||||55
1029.1030.992|0|C|13|156.60|290.00|1|1|55|||CCL|CCL|M||||||55
1029.1030.993|0|C|13|156.60|290.00|1|1|55|||CME|CME|B||||||55
1029.1030.994|0|C|13|156.60|290.00|1|1|55|||CME|CME|M||||||55
1029.1030.995|0|C|13|156.60|290.00|1|1|55|||ANT|ANT|B||||||55
1029.1030.996|0|C|13|156.60|290.00|1|1|55|||ANT|ANT|M||||||55
1029.1030.997|0|C|13|156.60|290.00|1|1|55|||PTO|PTO|B||||||55
1029.1030.998|0|C|13|156.60|290.00|1|1|55|||PTO|PTO|M||||||55
1029.1030.999|0|C|13|156.60|290.00|1|1|55|||CRE|CRE|B||||||55
1029.1030.1000|0|C|13|156.60|290.00|1|1|55|||CRE|CRE|M||||||55
1029.1030.1001|0|C|13|156.60|290.00|1|1|55|||CAM|CAM|B||||||55
1029.1030.1002|0|C|13|156.60|290.00|1|1|55|||CAM|CAM|M||||||55
1029.1030.1003|0|C|13|156.60|290.00|1|1|55|||OUR|OUR|B||||||55
1029.1030.1004|0|C|13|156.60|290.00|1|1|55|||OUR|OUR|M||||||55
1029.1030.1005|0|C|13|156.60|290.00|1|1|55|||COB|COB|B||||||55
1029.1030.1006|0|C|13|156.60|290.00|1|1|55|||COB|COB|M||||||55
1029.1030.1007|0|C|13|156.60|290.00|1|1|55|||CHO|CHO|B||||||55
1029.1030.1008|0|C|13|156.60|290.00|1|1|55|||CHO|CHO|M||||||55
1029.1030.1009|0|C|13|156.60|290.00|1|1|55|||VAG|VAG|B||||||55
1029.1030.1010|0|C|13|156.60|290.00|1|1|55|||VAG|VAG|M||||||55
1029.1030.1011|0|C|13|156.60|290.00|1|1|55|||AZE|AZE|B||||||55
1029.1030.1012|0|C|13|156.60|290.00|1|1|55|||AZE|AZE|M||||||55
1029.1030.1013|0|C|13|156.60|290.00|1|1|55|||AMA|AMA|B||||||55
1029.1030.1014|0|C|13|156.60|290.00|1|1|55|||AMA|AMA|M||||||55
1029.1030.1015|0|C|13|156.60|290.00|1|1|55|||AES|AES|B||||||55
1029.1030.1016|0|C|13|156.60|290.00|1|1|55|||AES|AES|M||||||55
1029.1030.1017|0|C|13|156.60|290.00|1|1|55|||PRA|PRA|B||||||55
1029.1030.1018|0|C|13|156.60|290.00|1|1|55|||PRA|PRA|M||||||55
1029.1030.1019|0|C|13|156.60|290.00|1|1|55|||ROS|ROS|B||||||55
1029.1030.1020|0|C|13|156.60|290.00|1|1|55|||ROS|ROS|M||||||55
1029.1030.1021|0|C|13|156.60|290.00|1|1|55|||VER|VER|B||||||55
1029.1030.1022|0|C|13|156.60|290.00|1|1|55|||VER|VER|M||||||55
1029.1030.1023|0|C|13|156.60|290.00|1|1|55|||AZB|AZB|||||||55
1029.1030.1024|0|C|13|156.60|290.00|1|1|55|||DEN|DEN|||||||55
1029.1030.1025|0|C|13|156.60|290.00|1|1|55|||BLK|BLK|||||||55
1029.1030.1026|0|C|13|156.60|290.00|1|1|55|||ART|ART|||||||55
1029.1030.1027|0|C|13|156.60|290.00|1|1|55|||LIN|LIN|||||||55
1029.1030.1028|0|C|13|156.60|290.00|1|1|55|||HAL|HAL|||||||55
1031.1032.845|0|C|14|97.20|180.00|1|1|56|||TBL|TBL|||||||56
1031.1032.846|0|C|14|97.20|180.00|1|1|56|||TEA|TEA|||||||56
1031.1032.847|0|C|14|97.20|180.00|1|1|56|||OAK|OAK|||||||56
1031.1032.848|0|C|14|97.20|180.00|1|1|56|||JOP|JOP|||||||56
1031.1032.949|0|C|14|140.40|260.00|1|1|56|||TBR|BCO|B||||||56
1031.1032.950|0|C|14|140.40|260.00|1|1|56|||TBR|BCO|M||||||56
1031.1032.951|0|C|14|140.40|260.00|1|1|56|||TBR|CCL|B||||||56
1031.1032.952|0|C|14|140.40|260.00|1|1|56|||TBR|CCL|M||||||56
1031.1032.953|0|C|14|140.40|260.00|1|1|56|||TBR|CME|B||||||56
1031.1032.954|0|C|14|140.40|260.00|1|1|56|||TBR|CME|M||||||56
1031.1032.955|0|C|14|140.40|260.00|1|1|56|||TBR|ANT|B||||||56
1031.1032.956|0|C|14|140.40|260.00|1|1|56|||TBR|ANT|M||||||56
1031.1032.957|0|C|14|140.40|260.00|1|1|56|||TBR|PTO|B||||||56
1031.1032.958|0|C|14|140.40|260.00|1|1|56|||TBR|PTO|M||||||56
1031.1032.959|0|C|14|140.40|260.00|1|1|56|||TBR|CRE|B||||||56
1031.1032.960|0|C|14|140.40|260.00|1|1|56|||TBR|CRE|M||||||56
1031.1032.961|0|C|14|140.40|260.00|1|1|56|||TBR|CAM|B||||||56
1031.1032.962|0|C|14|140.40|260.00|1|1|56|||TBR|CAM|M||||||56
1031.1032.963|0|C|14|140.40|260.00|1|1|56|||TBR|OUR|B||||||56
1031.1032.964|0|C|14|140.40|260.00|1|1|56|||TBR|OUR|M||||||56
1031.1032.965|0|C|14|140.40|260.00|1|1|56|||TBR|COB|B||||||56
1031.1032.966|0|C|14|140.40|260.00|1|1|56|||TBR|COB|M||||||56
1031.1032.967|0|C|14|140.40|260.00|1|1|56|||TBR|CHO|B||||||56
1031.1032.968|0|C|14|140.40|260.00|1|1|56|||TBR|CHO|M||||||56
1031.1032.969|0|C|14|140.40|260.00|1|1|56|||TBR|VAG|B||||||56
1031.1032.970|0|C|14|140.40|260.00|1|1|56|||TBR|VAG|M||||||56
1031.1032.971|0|C|14|140.40|260.00|1|1|56|||TBR|AZE|B||||||56
1031.1032.972|0|C|14|140.40|260.00|1|1|56|||TBR|AZE|M||||||56
1031.1032.973|0|C|14|140.40|260.00|1|1|56|||TBR|AMA|B||||||56
1031.1032.974|0|C|14|140.40|260.00|1|1|56|||TBR|AMA|M||||||56
1031.1032.975|0|C|14|140.40|260.00|1|1|56|||TBR|AES|B||||||56
1031.1032.976|0|C|14|140.40|260.00|1|1|56|||TBR|AES|M||||||56
1031.1032.977|0|C|14|140.40|260.00|1|1|56|||TBR|PRA|B||||||56
1031.1032.978|0|C|14|140.40|260.00|1|1|56|||TBR|PRA|M||||||56
1031.1032.979|0|C|14|140.40|260.00|1|1|56|||TBR|ROS|B||||||56
1031.1032.980|0|C|14|140.40|260.00|1|1|56|||TBR|ROS|M||||||56
1031.1032.981|0|C|14|140.40|260.00|1|1|56|||TBR|VER|B||||||56
1031.1032.982|0|C|14|140.40|260.00|1|1|56|||TBR|VER|M||||||56
1031.1032.983|0|C|14|140.40|260.00|1|1|56|||TBR|AZB|||||||56
1031.1032.984|0|C|14|140.40|260.00|1|1|56|||TBR|DEN|||||||56
1031.1032.985|0|C|14|140.40|260.00|1|1|56|||TBR|BLK|||||||56
1031.1032.986|0|C|14|140.40|260.00|1|1|56|||TBR|ART|||||||56
1031.1032.987|0|C|14|140.40|260.00|1|1|56|||TBR|LIN|||||||56
1031.1032.988|0|C|14|140.40|260.00|1|1|56|||TBR|HAL|||||||56
1031.1032.989|0|C|14|162.00|300.00|1|1|56|||BCO|BCO|B||||||56
1031.1032.990|0|C|14|162.00|300.00|1|1|56|||BCO|BCO|M||||||56
1031.1032.991|0|C|14|162.00|300.00|1|1|56|||CCL|CCL|B||||||56
1031.1032.992|0|C|14|162.00|300.00|1|1|56|||CCL|CCL|M||||||56
1031.1032.993|0|C|14|162.00|300.00|1|1|56|||CME|CME|B||||||56
1031.1032.994|0|C|14|162.00|300.00|1|1|56|||CME|CME|M||||||56
1031.1032.995|0|C|14|162.00|300.00|1|1|56|||ANT|ANT|B||||||56
1031.1032.996|0|C|14|162.00|300.00|1|1|56|||ANT|ANT|M||||||56
1031.1032.997|0|C|14|162.00|300.00|1|1|56|||PTO|PTO|B||||||56
1031.1032.998|0|C|14|162.00|300.00|1|1|56|||PTO|PTO|M||||||56
1031.1032.999|0|C|14|162.00|300.00|1|1|56|||CRE|CRE|B||||||56
1031.1032.1000|0|C|14|162.00|300.00|1|1|56|||CRE|CRE|M||||||56
1031.1032.1001|0|C|14|162.00|300.00|1|1|56|||CAM|CAM|B||||||56
1031.1032.1002|0|C|14|162.00|300.00|1|1|56|||CAM|CAM|M||||||56
1031.1032.1003|0|C|14|162.00|300.00|1|1|56|||OUR|OUR|B||||||56
1031.1032.1004|0|C|14|162.00|300.00|1|1|56|||OUR|OUR|M||||||56
1031.1032.1005|0|C|14|162.00|300.00|1|1|56|||COB|COB|B||||||56
1031.1032.1006|0|C|14|162.00|300.00|1|1|56|||COB|COB|M||||||56
1031.1032.1007|0|C|14|162.00|300.00|1|1|56|||CHO|CHO|B||||||56
1031.1032.1008|0|C|14|162.00|300.00|1|1|56|||CHO|CHO|M||||||56
1031.1032.1009|0|C|14|162.00|300.00|1|1|56|||VAG|VAG|B||||||56
1031.1032.1010|0|C|14|162.00|300.00|1|1|56|||VAG|VAG|M||||||56
1031.1032.1011|0|C|14|162.00|300.00|1|1|56|||AZE|AZE|B||||||56
1031.1032.1012|0|C|14|162.00|300.00|1|1|56|||AZE|AZE|M||||||56
1031.1032.1013|0|C|14|162.00|300.00|1|1|56|||AMA|AMA|B||||||56
1031.1032.1014|0|C|14|162.00|300.00|1|1|56|||AMA|AMA|M||||||56
1031.1032.1015|0|C|14|162.00|300.00|1|1|56|||AES|AES|B||||||56
1031.1032.1016|0|C|14|162.00|300.00|1|1|56|||AES|AES|M||||||56
1031.1032.1017|0|C|14|162.00|300.00|1|1|56|||PRA|PRA|B||||||56
1031.1032.1018|0|C|14|162.00|300.00|1|1|56|||PRA|PRA|M||||||56
1031.1032.1019|0|C|14|162.00|300.00|1|1|56|||ROS|ROS|B||||||56
1031.1032.1020|0|C|14|162.00|300.00|1|1|56|||ROS|ROS|M||||||56
1031.1032.1021|0|C|14|162.00|300.00|1|1|56|||VER|VER|B||||||56
1031.1032.1022|0|C|14|162.00|300.00|1|1|56|||VER|VER|M||||||56
1031.1032.1023|0|C|14|162.00|300.00|1|1|56|||AZB|AZB|||||||56
1031.1032.1024|0|C|14|162.00|300.00|1|1|56|||DEN|DEN|||||||56
1031.1032.1025|0|C|14|162.00|300.00|1|1|56|||BLK|BLK|||||||56
1031.1032.1026|0|C|14|162.00|300.00|1|1|56|||ART|ART|||||||56
1031.1032.1027|0|C|14|162.00|300.00|1|1|56|||LIN|LIN|||||||56
1031.1032.1028|0|C|14|162.00|300.00|1|1|56|||HAL|HAL|||||||56
1031.1033.845|0|C|15|116.64|216.00|1|1|56|||TBL|TBL|||||||56
1031.1033.846|0|C|15|116.64|216.00|1|1|56|||TEA|TEA|||||||56
1031.1033.847|0|C|15|116.64|216.00|1|1|56|||OAK|OAK|||||||56
1031.1033.848|0|C|15|116.64|216.00|1|1|56|||JOP|JOP|||||||56
1031.1033.949|0|C|15|159.84|296.00|1|1|56|||TBR|BCO|B||||||56
1031.1033.950|0|C|15|159.84|296.00|1|1|56|||TBR|BCO|M||||||56
1031.1033.951|0|C|15|159.84|296.00|1|1|56|||TBR|CCL|B||||||56
1031.1033.952|0|C|15|159.84|296.00|1|1|56|||TBR|CCL|M||||||56
1031.1033.953|0|C|15|159.84|296.00|1|1|56|||TBR|CME|B||||||56
1031.1033.954|0|C|15|159.84|296.00|1|1|56|||TBR|CME|M||||||56
1031.1033.955|0|C|15|159.84|296.00|1|1|56|||TBR|ANT|B||||||56
1031.1033.956|0|C|15|159.84|296.00|1|1|56|||TBR|ANT|M||||||56
1031.1033.957|0|C|15|159.84|296.00|1|1|56|||TBR|PTO|B||||||56
1031.1033.958|0|C|15|159.84|296.00|1|1|56|||TBR|PTO|M||||||56
1031.1033.959|0|C|15|159.84|296.00|1|1|56|||TBR|CRE|B||||||56
1031.1033.960|0|C|15|159.84|296.00|1|1|56|||TBR|CRE|M||||||56
1031.1033.961|0|C|15|159.84|296.00|1|1|56|||TBR|CAM|B||||||56
1031.1033.962|0|C|15|159.84|296.00|1|1|56|||TBR|CAM|M||||||56
1031.1033.963|0|C|15|159.84|296.00|1|1|56|||TBR|OUR|B||||||56
1031.1033.964|0|C|15|159.84|296.00|1|1|56|||TBR|OUR|M||||||56
1031.1033.965|0|C|15|159.84|296.00|1|1|56|||TBR|COB|B||||||56
1031.1033.966|0|C|15|159.84|296.00|1|1|56|||TBR|COB|M||||||56
1031.1033.967|0|C|15|159.84|296.00|1|1|56|||TBR|CHO|B||||||56
1031.1033.968|0|C|15|159.84|296.00|1|1|56|||TBR|CHO|M||||||56
1031.1033.969|0|C|15|159.84|296.00|1|1|56|||TBR|VAG|B||||||56
1031.1033.970|0|C|15|159.84|296.00|1|1|56|||TBR|VAG|M||||||56
1031.1033.971|0|C|15|159.84|296.00|1|1|56|||TBR|AZE|B||||||56
1031.1033.972|0|C|15|159.84|296.00|1|1|56|||TBR|AZE|M||||||56
1031.1033.973|0|C|15|159.84|296.00|1|1|56|||TBR|AMA|B||||||56
1031.1033.974|0|C|15|159.84|296.00|1|1|56|||TBR|AMA|M||||||56
1031.1033.975|0|C|15|159.84|296.00|1|1|56|||TBR|AES|B||||||56
1031.1033.976|0|C|15|159.84|296.00|1|1|56|||TBR|AES|M||||||56
1031.1033.977|0|C|15|159.84|296.00|1|1|56|||TBR|PRA|B||||||56
1031.1033.978|0|C|15|159.84|296.00|1|1|56|||TBR|PRA|M||||||56
1031.1033.979|0|C|15|159.84|296.00|1|1|56|||TBR|ROS|B||||||56
1031.1033.980|0|C|15|159.84|296.00|1|1|56|||TBR|ROS|M||||||56
1031.1033.981|0|C|15|159.84|296.00|1|1|56|||TBR|VER|B||||||56
1031.1033.982|0|C|15|159.84|296.00|1|1|56|||TBR|VER|M||||||56
1031.1033.983|0|C|15|159.84|296.00|1|1|56|||TBR|AZB|||||||56
1031.1033.984|0|C|15|159.84|296.00|1|1|56|||TBR|DEN|||||||56
1031.1033.985|0|C|15|159.84|296.00|1|1|56|||TBR|BLK|||||||56
1031.1033.986|0|C|15|159.84|296.00|1|1|56|||TBR|ART|||||||56
1031.1033.987|0|C|15|159.84|296.00|1|1|56|||TBR|LIN|||||||56
1031.1033.988|0|C|15|159.84|296.00|1|1|56|||TBR|HAL|||||||56
1031.1033.989|0|C|15|181.44|336.00|1|1|56|||BCO|BCO|B||||||56
1031.1033.990|0|C|15|181.44|336.00|1|1|56|||BCO|BCO|M||||||56
1031.1033.991|0|C|15|181.44|336.00|1|1|56|||CCL|CCL|B||||||56
1031.1033.992|0|C|15|181.44|336.00|1|1|56|||CCL|CCL|M||||||56
1031.1033.993|0|C|15|181.44|336.00|1|1|56|||CME|CME|B||||||56
1031.1033.994|0|C|15|181.44|336.00|1|1|56|||CME|CME|M||||||56
1031.1033.995|0|C|15|181.44|336.00|1|1|56|||ANT|ANT|B||||||56
1031.1033.996|0|C|15|181.44|336.00|1|1|56|||ANT|ANT|M||||||56
1031.1033.997|0|C|15|181.44|336.00|1|1|56|||PTO|PTO|B||||||56
1031.1033.998|0|C|15|181.44|336.00|1|1|56|||PTO|PTO|M||||||56
1031.1033.999|0|C|15|181.44|336.00|1|1|56|||CRE|CRE|B||||||56
1031.1033.1000|0|C|15|181.44|336.00|1|1|56|||CRE|CRE|M||||||56
1031.1033.1001|0|C|15|181.44|336.00|1|1|56|||CAM|CAM|B||||||56
1031.1033.1002|0|C|15|181.44|336.00|1|1|56|||CAM|CAM|M||||||56
1031.1033.1003|0|C|15|181.44|336.00|1|1|56|||OUR|OUR|B||||||56
1031.1033.1004|0|C|15|181.44|336.00|1|1|56|||OUR|OUR|M||||||56
1031.1033.1005|0|C|15|181.44|336.00|1|1|56|||COB|COB|B||||||56
1031.1033.1006|0|C|15|181.44|336.00|1|1|56|||COB|COB|M||||||56
1031.1033.1007|0|C|15|181.44|336.00|1|1|56|||CHO|CHO|B||||||56
1031.1033.1008|0|C|15|181.44|336.00|1|1|56|||CHO|CHO|M||||||56
1031.1033.1009|0|C|15|181.44|336.00|1|1|56|||VAG|VAG|B||||||56
1031.1033.1010|0|C|15|181.44|336.00|1|1|56|||VAG|VAG|M||||||56
1031.1033.1011|0|C|15|181.44|336.00|1|1|56|||AZE|AZE|B||||||56
1031.1033.1012|0|C|15|181.44|336.00|1|1|56|||AZE|AZE|M||||||56
1031.1033.1013|0|C|15|181.44|336.00|1|1|56|||AMA|AMA|B||||||56
1031.1033.1014|0|C|15|181.44|336.00|1|1|56|||AMA|AMA|M||||||56
1031.1033.1015|0|C|15|181.44|336.00|1|1|56|||AES|AES|B||||||56
1031.1033.1016|0|C|15|181.44|336.00|1|1|56|||AES|AES|M||||||56
1031.1033.1017|0|C|15|181.44|336.00|1|1|56|||PRA|PRA|B||||||56
1031.1033.1018|0|C|15|181.44|336.00|1|1|56|||PRA|PRA|M||||||56
1031.1033.1019|0|C|15|181.44|336.00|1|1|56|||ROS|ROS|B||||||56
1031.1033.1020|0|C|15|181.44|336.00|1|1|56|||ROS|ROS|M||||||56
1031.1033.1021|0|C|15|181.44|336.00|1|1|56|||VER|VER|B||||||56
1031.1033.1022|0|C|15|181.44|336.00|1|1|56|||VER|VER|M||||||56
1031.1033.1023|0|C|15|181.44|336.00|1|1|56|||AZB|AZB|||||||56
1031.1033.1024|0|C|15|181.44|336.00|1|1|56|||DEN|DEN|||||||56
1031.1033.1025|0|C|15|181.44|336.00|1|1|56|||BLK|BLK|||||||56
1031.1033.1026|0|C|15|181.44|336.00|1|1|56|||ART|ART|||||||56
1031.1033.1027|0|C|15|181.44|336.00|1|1|56|||LIN|LIN|||||||56
1031.1033.1028|0|C|15|181.44|336.00|1|1|56|||HAL|HAL|||||||56
1034.1035.845|0|C|16|127.98|237.00|1|1|56|||TBL|TBL|||||||57
1034.1035.846|0|C|16|127.98|237.00|1|1|56|||TEA|TEA|||||||57
1034.1035.847|0|C|16|127.98|237.00|1|1|56|||OAK|OAK|||||||57
1034.1035.848|0|C|16|127.98|237.00|1|1|56|||JOP|JOP|||||||57
1034.1035.949|0|C|16|171.18|317.00|1|1|56|||TBR|BCO|B||||||57
1034.1035.950|0|C|16|171.18|317.00|1|1|56|||TBR|BCO|M||||||57
1034.1035.951|0|C|16|171.18|317.00|1|1|56|||TBR|CCL|B||||||57
1034.1035.952|0|C|16|171.18|317.00|1|1|56|||TBR|CCL|M||||||57
1034.1035.953|0|C|16|171.18|317.00|1|1|56|||TBR|CME|B||||||57
1034.1035.954|0|C|16|171.18|317.00|1|1|56|||TBR|CME|M||||||57
1034.1035.955|0|C|16|171.18|317.00|1|1|56|||TBR|ANT|B||||||57
1034.1035.956|0|C|16|171.18|317.00|1|1|56|||TBR|ANT|M||||||57
1034.1035.957|0|C|16|171.18|317.00|1|1|56|||TBR|PTO|B||||||57
1034.1035.958|0|C|16|171.18|317.00|1|1|56|||TBR|PTO|M||||||57
1034.1035.959|0|C|16|171.18|317.00|1|1|56|||TBR|CRE|B||||||57
1034.1035.960|0|C|16|171.18|317.00|1|1|56|||TBR|CRE|M||||||57
1034.1035.961|0|C|16|171.18|317.00|1|1|56|||TBR|CAM|B||||||57
1034.1035.962|0|C|16|171.18|317.00|1|1|56|||TBR|CAM|M||||||57
1034.1035.963|0|C|16|171.18|317.00|1|1|56|||TBR|OUR|B||||||57
1034.1035.964|0|C|16|171.18|317.00|1|1|56|||TBR|OUR|M||||||57
1034.1035.965|0|C|16|171.18|317.00|1|1|56|||TBR|COB|B||||||57
1034.1035.966|0|C|16|171.18|317.00|1|1|56|||TBR|COB|M||||||57
1034.1035.967|0|C|16|171.18|317.00|1|1|56|||TBR|CHO|B||||||57
1034.1035.968|0|C|16|171.18|317.00|1|1|56|||TBR|CHO|M||||||57
1034.1035.969|0|C|16|171.18|317.00|1|1|56|||TBR|VAG|B||||||57
1034.1035.970|0|C|16|171.18|317.00|1|1|56|||TBR|VAG|M||||||57
1034.1035.971|0|C|16|171.18|317.00|1|1|56|||TBR|AZE|B||||||57
1034.1035.972|0|C|16|171.18|317.00|1|1|56|||TBR|AZE|M||||||57
1034.1035.973|0|C|16|171.18|317.00|1|1|56|||TBR|AMA|B||||||57
1034.1035.974|0|C|16|171.18|317.00|1|1|56|||TBR|AMA|M||||||57
1034.1035.975|0|C|16|171.18|317.00|1|1|56|||TBR|AES|B||||||57
1034.1035.976|0|C|16|171.18|317.00|1|1|56|||TBR|AES|M||||||57
1034.1035.977|0|C|16|171.18|317.00|1|1|56|||TBR|PRA|B||||||57
1034.1035.978|0|C|16|171.18|317.00|1|1|56|||TBR|PRA|M||||||57
1034.1035.979|0|C|16|171.18|317.00|1|1|56|||TBR|ROS|B||||||57
1034.1035.980|0|C|16|171.18|317.00|1|1|56|||TBR|ROS|M||||||57
1034.1035.981|0|C|16|171.18|317.00|1|1|56|||TBR|VER|B||||||57
1034.1035.982|0|C|16|171.18|317.00|1|1|56|||TBR|VER|M||||||57
1034.1035.983|0|C|16|171.18|317.00|1|1|56|||TBR|AZB|||||||57
1034.1035.984|0|C|16|171.18|317.00|1|1|56|||TBR|DEN|||||||57
1034.1035.985|0|C|16|171.18|317.00|1|1|56|||TBR|BLK|||||||57
1034.1035.986|0|C|16|171.18|317.00|1|1|56|||TBR|ART|||||||57
1034.1035.987|0|C|16|171.18|317.00|1|1|56|||TBR|LIN|||||||57
1034.1035.988|0|C|16|171.18|317.00|1|1|56|||TBR|HAL|||||||57
1034.1035.989|0|C|16|192.78|357.00|1|1|56|||BCO|BCO|B||||||57
1034.1035.990|0|C|16|192.78|357.00|1|1|56|||BCO|BCO|M||||||57
1034.1035.991|0|C|16|192.78|357.00|1|1|56|||CCL|CCL|B||||||57
1034.1035.992|0|C|16|192.78|357.00|1|1|56|||CCL|CCL|M||||||57
1034.1035.993|0|C|16|192.78|357.00|1|1|56|||CME|CME|B||||||57
1034.1035.994|0|C|16|192.78|357.00|1|1|56|||CME|CME|M||||||57
1034.1035.995|0|C|16|192.78|357.00|1|1|56|||ANT|ANT|B||||||57
1034.1035.996|0|C|16|192.78|357.00|1|1|56|||ANT|ANT|M||||||57
1034.1035.997|0|C|16|192.78|357.00|1|1|56|||PTO|PTO|B||||||57
1034.1035.998|0|C|16|192.78|357.00|1|1|56|||PTO|PTO|M||||||57
1034.1035.999|0|C|16|192.78|357.00|1|1|56|||CRE|CRE|B||||||57
1034.1035.1000|0|C|16|192.78|357.00|1|1|56|||CRE|CRE|M||||||57
1034.1035.1001|0|C|16|192.78|357.00|1|1|56|||CAM|CAM|B||||||57
1034.1035.1002|0|C|16|192.78|357.00|1|1|56|||CAM|CAM|M||||||57
1034.1035.1003|0|C|16|192.78|357.00|1|1|56|||OUR|OUR|B||||||57
1034.1035.1004|0|C|16|192.78|357.00|1|1|56|||OUR|OUR|M||||||57
1034.1035.1005|0|C|16|192.78|357.00|1|1|56|||COB|COB|B||||||57
1034.1035.1006|0|C|16|192.78|357.00|1|1|56|||COB|COB|M||||||57
1034.1035.1007|0|C|16|192.78|357.00|1|1|56|||CHO|CHO|B||||||57
1034.1035.1008|0|C|16|192.78|357.00|1|1|56|||CHO|CHO|M||||||57
1034.1035.1009|0|C|16|192.78|357.00|1|1|56|||VAG|VAG|B||||||57
1034.1035.1010|0|C|16|192.78|357.00|1|1|56|||VAG|VAG|M||||||57
1034.1035.1011|0|C|16|192.78|357.00|1|1|56|||AZE|AZE|B||||||57
1034.1035.1012|0|C|16|192.78|357.00|1|1|56|||AZE|AZE|M||||||57
1034.1035.1013|0|C|16|192.78|357.00|1|1|56|||AMA|AMA|B||||||57
1034.1035.1014|0|C|16|192.78|357.00|1|1|56|||AMA|AMA|M||||||57
1034.1035.1015|0|C|16|192.78|357.00|1|1|56|||AES|AES|B||||||57
1034.1035.1016|0|C|16|192.78|357.00|1|1|56|||AES|AES|M||||||57
1034.1035.1017|0|C|16|192.78|357.00|1|1|56|||PRA|PRA|B||||||57
1034.1035.1018|0|C|16|192.78|357.00|1|1|56|||PRA|PRA|M||||||57
1034.1035.1019|0|C|16|192.78|357.00|1|1|56|||ROS|ROS|B||||||57
1034.1035.1020|0|C|16|192.78|357.00|1|1|56|||ROS|ROS|M||||||57
1034.1035.1021|0|C|16|192.78|357.00|1|1|56|||VER|VER|B||||||57
1034.1035.1022|0|C|16|192.78|357.00|1|1|56|||VER|VER|M||||||57
1034.1035.1023|0|C|16|192.78|357.00|1|1|56|||AZB|AZB|||||||57
1034.1035.1024|0|C|16|192.78|357.00|1|1|56|||DEN|DEN|||||||57
1034.1035.1025|0|C|16|192.78|357.00|1|1|56|||BLK|BLK|||||||57
1034.1035.1026|0|C|16|192.78|357.00|1|1|56|||ART|ART|||||||57
1034.1035.1027|0|C|16|192.78|357.00|1|1|56|||LIN|LIN|||||||57
1034.1035.1028|0|C|16|192.78|357.00|1|1|56|||HAL|HAL|||||||57
1034.1036.845|0|C|17|150.66|279.00|1|1|56|||TBL|TBL|||||||57
1034.1036.846|0|C|17|150.66|279.00|1|1|56|||TEA|TEA|||||||57
1034.1036.847|0|C|17|150.66|279.00|1|1|56|||OAK|OAK|||||||57
1034.1036.848|0|C|17|150.66|279.00|1|1|56|||JOP|JOP|||||||57
1034.1036.949|0|C|17|193.86|359.00|1|1|56|||TBR|BCO|B||||||57
1034.1036.950|0|C|17|193.86|359.00|1|1|56|||TBR|BCO|M||||||57
1034.1036.951|0|C|17|193.86|359.00|1|1|56|||TBR|CCL|B||||||57
1034.1036.952|0|C|17|193.86|359.00|1|1|56|||TBR|CCL|M||||||57
1034.1036.953|0|C|17|193.86|359.00|1|1|56|||TBR|CME|B||||||57
1034.1036.954|0|C|17|193.86|359.00|1|1|56|||TBR|CME|M||||||57
1034.1036.955|0|C|17|193.86|359.00|1|1|56|||TBR|ANT|B||||||57
1034.1036.956|0|C|17|193.86|359.00|1|1|56|||TBR|ANT|M||||||57
1034.1036.957|0|C|17|193.86|359.00|1|1|56|||TBR|PTO|B||||||57
1034.1036.958|0|C|17|193.86|359.00|1|1|56|||TBR|PTO|M||||||57
1034.1036.959|0|C|17|193.86|359.00|1|1|56|||TBR|CRE|B||||||57
1034.1036.960|0|C|17|193.86|359.00|1|1|56|||TBR|CRE|M||||||57
1034.1036.961|0|C|17|193.86|359.00|1|1|56|||TBR|CAM|B||||||57
1034.1036.962|0|C|17|193.86|359.00|1|1|56|||TBR|CAM|M||||||57
1034.1036.963|0|C|17|193.86|359.00|1|1|56|||TBR|OUR|B||||||57
1034.1036.964|0|C|17|193.86|359.00|1|1|56|||TBR|OUR|M||||||57
1034.1036.965|0|C|17|193.86|359.00|1|1|56|||TBR|COB|B||||||57
1034.1036.966|0|C|17|193.86|359.00|1|1|56|||TBR|COB|M||||||57
1034.1036.967|0|C|17|193.86|359.00|1|1|56|||TBR|CHO|B||||||57
1034.1036.968|0|C|17|193.86|359.00|1|1|56|||TBR|CHO|M||||||57
1034.1036.969|0|C|17|193.86|359.00|1|1|56|||TBR|VAG|B||||||57
1034.1036.970|0|C|17|193.86|359.00|1|1|56|||TBR|VAG|M||||||57
1034.1036.971|0|C|17|193.86|359.00|1|1|56|||TBR|AZE|B||||||57
1034.1036.972|0|C|17|193.86|359.00|1|1|56|||TBR|AZE|M||||||57
1034.1036.973|0|C|17|193.86|359.00|1|1|56|||TBR|AMA|B||||||57
1034.1036.974|0|C|17|193.86|359.00|1|1|56|||TBR|AMA|M||||||57
1034.1036.975|0|C|17|193.86|359.00|1|1|56|||TBR|AES|B||||||57
1034.1036.976|0|C|17|193.86|359.00|1|1|56|||TBR|AES|M||||||57
1034.1036.977|0|C|17|193.86|359.00|1|1|56|||TBR|PRA|B||||||57
1034.1036.978|0|C|17|193.86|359.00|1|1|56|||TBR|PRA|M||||||57
1034.1036.979|0|C|17|193.86|359.00|1|1|56|||TBR|ROS|B||||||57
1034.1036.980|0|C|17|193.86|359.00|1|1|56|||TBR|ROS|M||||||57
1034.1036.981|0|C|17|193.86|359.00|1|1|56|||TBR|VER|B||||||57
1034.1036.982|0|C|17|193.86|359.00|1|1|56|||TBR|VER|M||||||57
1034.1036.983|0|C|17|193.86|359.00|1|1|56|||TBR|AZB|||||||57
1034.1036.984|0|C|17|193.86|359.00|1|1|56|||TBR|DEN|||||||57
1034.1036.985|0|C|17|193.86|359.00|1|1|56|||TBR|BLK|||||||57
1034.1036.986|0|C|17|193.86|359.00|1|1|56|||TBR|ART|||||||57
1034.1036.987|0|C|17|193.86|359.00|1|1|56|||TBR|LIN|||||||57
1034.1036.988|0|C|17|193.86|359.00|1|1|56|||TBR|HAL|||||||57
1034.1036.989|0|C|17|215.46|399.00|1|1|56|||BCO|BCO|B||||||57
1034.1036.990|0|C|17|215.46|399.00|1|1|56|||BCO|BCO|M||||||57
1034.1036.991|0|C|17|215.46|399.00|1|1|56|||CCL|CCL|B||||||57
1034.1036.992|0|C|17|215.46|399.00|1|1|56|||CCL|CCL|M||||||57
1034.1036.993|0|C|17|215.46|399.00|1|1|56|||CME|CME|B||||||57
1034.1036.994|0|C|17|215.46|399.00|1|1|56|||CME|CME|M||||||57
1034.1036.995|0|C|17|215.46|399.00|1|1|56|||ANT|ANT|B||||||57
1034.1036.996|0|C|17|215.46|399.00|1|1|56|||ANT|ANT|M||||||57
1034.1036.997|0|C|17|215.46|399.00|1|1|56|||PTO|PTO|B||||||57
1034.1036.998|0|C|17|215.46|399.00|1|1|56|||PTO|PTO|M||||||57
1034.1036.999|0|C|17|215.46|399.00|1|1|56|||CRE|CRE|B||||||57
1034.1036.1000|0|C|17|215.46|399.00|1|1|56|||CRE|CRE|M||||||57
1034.1036.1001|0|C|17|215.46|399.00|1|1|56|||CAM|CAM|B||||||57
1034.1036.1002|0|C|17|215.46|399.00|1|1|56|||CAM|CAM|M||||||57
1034.1036.1003|0|C|17|215.46|399.00|1|1|56|||OUR|OUR|B||||||57
1034.1036.1004|0|C|17|215.46|399.00|1|1|56|||OUR|OUR|M||||||57
1034.1036.1005|0|C|17|215.46|399.00|1|1|56|||COB|COB|B||||||57
1034.1036.1006|0|C|17|215.46|399.00|1|1|56|||COB|COB|M||||||57
1034.1036.1007|0|C|17|215.46|399.00|1|1|56|||CHO|CHO|B||||||57
1034.1036.1008|0|C|17|215.46|399.00|1|1|56|||CHO|CHO|M||||||57
1034.1036.1009|0|C|17|215.46|399.00|1|1|56|||VAG|VAG|B||||||57
1034.1036.1010|0|C|17|215.46|399.00|1|1|56|||VAG|VAG|M||||||57
1034.1036.1011|0|C|17|215.46|399.00|1|1|56|||AZE|AZE|B||||||57
1034.1036.1012|0|C|17|215.46|399.00|1|1|56|||AZE|AZE|M||||||57
1034.1036.1013|0|C|17|215.46|399.00|1|1|56|||AMA|AMA|B||||||57
1034.1036.1014|0|C|17|215.46|399.00|1|1|56|||AMA|AMA|M||||||57
1034.1036.1015|0|C|17|215.46|399.00|1|1|56|||AES|AES|B||||||57
1034.1036.1016|0|C|17|215.46|399.00|1|1|56|||AES|AES|M||||||57
1034.1036.1017|0|C|17|215.46|399.00|1|1|56|||PRA|PRA|B||||||57
1034.1036.1018|0|C|17|215.46|399.00|1|1|56|||PRA|PRA|M||||||57
1034.1036.1019|0|C|17|215.46|399.00|1|1|56|||ROS|ROS|B||||||57
1034.1036.1020|0|C|17|215.46|399.00|1|1|56|||ROS|ROS|M||||||57
1034.1036.1021|0|C|17|215.46|399.00|1|1|56|||VER|VER|B||||||57
1034.1036.1022|0|C|17|215.46|399.00|1|1|56|||VER|VER|M||||||57
1034.1036.1023|0|C|17|215.46|399.00|1|1|56|||AZB|AZB|||||||57
1034.1036.1024|0|C|17|215.46|399.00|1|1|56|||DEN|DEN|||||||57
1034.1036.1025|0|C|17|215.46|399.00|1|1|56|||BLK|BLK|||||||57
1034.1036.1026|0|C|17|215.46|399.00|1|1|56|||ART|ART|||||||57
1034.1036.1027|0|C|17|215.46|399.00|1|1|56|||LIN|LIN|||||||57
1034.1036.1028|0|C|17|215.46|399.00|1|1|56|||HAL|HAL|||||||57
1037.1038.845|0|C|18|65.34|121.00|1|1|57|||TBL|TBL|||||||58
1037.1038.846|0|C|18|65.34|121.00|1|1|57|||TEA|TEA|||||||58
1037.1038.847|0|C|18|65.34|121.00|1|1|57|||OAK|OAK|||||||58
1037.1038.848|0|C|18|65.34|121.00|1|1|57|||JOP|JOP|||||||58
1037.1038.949|0|C|18|108.54|201.00|1|1|57|||TBR|BCO|B||||||58
1037.1038.950|0|C|18|108.54|201.00|1|1|57|||TBR|BCO|M||||||58
1037.1038.951|0|C|18|108.54|201.00|1|1|57|||TBR|CCL|B||||||58
1037.1038.952|0|C|18|108.54|201.00|1|1|57|||TBR|CCL|M||||||58
1037.1038.953|0|C|18|108.54|201.00|1|1|57|||TBR|CME|B||||||58
1037.1038.954|0|C|18|108.54|201.00|1|1|57|||TBR|CME|M||||||58
1037.1038.955|0|C|18|108.54|201.00|1|1|57|||TBR|ANT|B||||||58
1037.1038.956|0|C|18|108.54|201.00|1|1|57|||TBR|ANT|M||||||58
1037.1038.957|0|C|18|108.54|201.00|1|1|57|||TBR|PTO|B||||||58
1037.1038.958|0|C|18|108.54|201.00|1|1|57|||TBR|PTO|M||||||58
1037.1038.959|0|C|18|108.54|201.00|1|1|57|||TBR|CRE|B||||||58
1037.1038.960|0|C|18|108.54|201.00|1|1|57|||TBR|CRE|M||||||58
1037.1038.961|0|C|18|108.54|201.00|1|1|57|||TBR|CAM|B||||||58
1037.1038.962|0|C|18|108.54|201.00|1|1|57|||TBR|CAM|M||||||58
1037.1038.963|0|C|18|108.54|201.00|1|1|57|||TBR|OUR|B||||||58
1037.1038.964|0|C|18|108.54|201.00|1|1|57|||TBR|OUR|M||||||58
1037.1038.965|0|C|18|108.54|201.00|1|1|57|||TBR|COB|B||||||58
1037.1038.966|0|C|18|108.54|201.00|1|1|57|||TBR|COB|M||||||58
1037.1038.967|0|C|18|108.54|201.00|1|1|57|||TBR|CHO|B||||||58
1037.1038.968|0|C|18|108.54|201.00|1|1|57|||TBR|CHO|M||||||58
1037.1038.969|0|C|18|108.54|201.00|1|1|57|||TBR|VAG|B||||||58
1037.1038.970|0|C|18|108.54|201.00|1|1|57|||TBR|VAG|M||||||58
1037.1038.971|0|C|18|108.54|201.00|1|1|57|||TBR|AZE|B||||||58
1037.1038.972|0|C|18|108.54|201.00|1|1|57|||TBR|AZE|M||||||58
1037.1038.973|0|C|18|108.54|201.00|1|1|57|||TBR|AMA|B||||||58
1037.1038.974|0|C|18|108.54|201.00|1|1|57|||TBR|AMA|M||||||58
1037.1038.975|0|C|18|108.54|201.00|1|1|57|||TBR|AES|B||||||58
1037.1038.976|0|C|18|108.54|201.00|1|1|57|||TBR|AES|M||||||58
1037.1038.977|0|C|18|108.54|201.00|1|1|57|||TBR|PRA|B||||||58
1037.1038.978|0|C|18|108.54|201.00|1|1|57|||TBR|PRA|M||||||58
1037.1038.979|0|C|18|108.54|201.00|1|1|57|||TBR|ROS|B||||||58
1037.1038.980|0|C|18|108.54|201.00|1|1|57|||TBR|ROS|M||||||58
1037.1038.981|0|C|18|108.54|201.00|1|1|57|||TBR|VER|B||||||58
1037.1038.982|0|C|18|108.54|201.00|1|1|57|||TBR|VER|M||||||58
1037.1038.983|0|C|18|108.54|201.00|1|1|57|||TBR|AZB|||||||58
1037.1038.984|0|C|18|108.54|201.00|1|1|57|||TBR|DEN|||||||58
1037.1038.985|0|C|18|108.54|201.00|1|1|57|||TBR|BLK|||||||58
1037.1038.986|0|C|18|108.54|201.00|1|1|57|||TBR|ART|||||||58
1037.1038.987|0|C|18|108.54|201.00|1|1|57|||TBR|LIN|||||||58
1037.1038.988|0|C|18|108.54|201.00|1|1|57|||TBR|HAL|||||||58
1037.1038.989|0|C|18|130.14|241.00|1|1|57|||BCO|BCO|B||||||58
1037.1038.990|0|C|18|130.14|241.00|1|1|57|||BCO|BCO|M||||||58
1037.1038.991|0|C|18|130.14|241.00|1|1|57|||CCL|CCL|B||||||58
1037.1038.992|0|C|18|130.14|241.00|1|1|57|||CCL|CCL|M||||||58
1037.1038.993|0|C|18|130.14|241.00|1|1|57|||CME|CME|B||||||58
1037.1038.994|0|C|18|130.14|241.00|1|1|57|||CME|CME|M||||||58
1037.1038.995|0|C|18|130.14|241.00|1|1|57|||ANT|ANT|B||||||58
1037.1038.996|0|C|18|130.14|241.00|1|1|57|||ANT|ANT|M||||||58
1037.1038.997|0|C|18|130.14|241.00|1|1|57|||PTO|PTO|B||||||58
1037.1038.998|0|C|18|130.14|241.00|1|1|57|||PTO|PTO|M||||||58
1037.1038.999|0|C|18|130.14|241.00|1|1|57|||CRE|CRE|B||||||58
1037.1038.1000|0|C|18|130.14|241.00|1|1|57|||CRE|CRE|M||||||58
1037.1038.1001|0|C|18|130.14|241.00|1|1|57|||CAM|CAM|B||||||58
1037.1038.1002|0|C|18|130.14|241.00|1|1|57|||CAM|CAM|M||||||58
1037.1038.1003|0|C|18|130.14|241.00|1|1|57|||OUR|OUR|B||||||58
1037.1038.1004|0|C|18|130.14|241.00|1|1|57|||OUR|OUR|M||||||58
1037.1038.1005|0|C|18|130.14|241.00|1|1|57|||COB|COB|B||||||58
1037.1038.1006|0|C|18|130.14|241.00|1|1|57|||COB|COB|M||||||58
1037.1038.1007|0|C|18|130.14|241.00|1|1|57|||CHO|CHO|B||||||58
1037.1038.1008|0|C|18|130.14|241.00|1|1|57|||CHO|CHO|M||||||58
1037.1038.1009|0|C|18|130.14|241.00|1|1|57|||VAG|VAG|B||||||58
1037.1038.1010|0|C|18|130.14|241.00|1|1|57|||VAG|VAG|M||||||58
1037.1038.1011|0|C|18|130.14|241.00|1|1|57|||AZE|AZE|B||||||58
1037.1038.1012|0|C|18|130.14|241.00|1|1|57|||AZE|AZE|M||||||58
1037.1038.1013|0|C|18|130.14|241.00|1|1|57|||AMA|AMA|B||||||58
1037.1038.1014|0|C|18|130.14|241.00|1|1|57|||AMA|AMA|M||||||58
1037.1038.1015|0|C|18|130.14|241.00|1|1|57|||AES|AES|B||||||58
1037.1038.1016|0|C|18|130.14|241.00|1|1|57|||AES|AES|M||||||58
1037.1038.1017|0|C|18|130.14|241.00|1|1|57|||PRA|PRA|B||||||58
1037.1038.1018|0|C|18|130.14|241.00|1|1|57|||PRA|PRA|M||||||58
1037.1038.1019|0|C|18|130.14|241.00|1|1|57|||ROS|ROS|B||||||58
1037.1038.1020|0|C|18|130.14|241.00|1|1|57|||ROS|ROS|M||||||58
1037.1038.1021|0|C|18|130.14|241.00|1|1|57|||VER|VER|B||||||58
1037.1038.1022|0|C|18|130.14|241.00|1|1|57|||VER|VER|M||||||58
1037.1038.1023|0|C|18|130.14|241.00|1|1|57|||AZB|AZB|||||||58
1037.1038.1024|0|C|18|130.14|241.00|1|1|57|||DEN|DEN|||||||58
1037.1038.1025|0|C|18|130.14|241.00|1|1|57|||BLK|BLK|||||||58
1037.1038.1026|0|C|18|130.14|241.00|1|1|57|||ART|ART|||||||58
1037.1038.1027|0|C|18|130.14|241.00|1|1|57|||LIN|LIN|||||||58
1037.1038.1028|0|C|18|130.14|241.00|1|1|57|||HAL|HAL|||||||58
1037.1039.845|0|C|19|75.60|140.00|1|1|57|||TBL|TBL|||||||58
1037.1039.846|0|C|19|75.60|140.00|1|1|57|||TEA|TEA|||||||58
1037.1039.847|0|C|19|75.60|140.00|1|1|57|||OAK|OAK|||||||58
1037.1039.848|0|C|19|75.60|140.00|1|1|57|||JOP|JOP|||||||58
1037.1039.949|0|C|19|118.80|220.00|1|1|57|||TBR|BCO|B||||||58
1037.1039.950|0|C|19|118.80|220.00|1|1|57|||TBR|BCO|M||||||58
1037.1039.951|0|C|19|118.80|220.00|1|1|57|||TBR|CCL|B||||||58
1037.1039.952|0|C|19|118.80|220.00|1|1|57|||TBR|CCL|M||||||58
1037.1039.953|0|C|19|118.80|220.00|1|1|57|||TBR|CME|B||||||58
1037.1039.954|0|C|19|118.80|220.00|1|1|57|||TBR|CME|M||||||58
1037.1039.955|0|C|19|118.80|220.00|1|1|57|||TBR|ANT|B||||||58
1037.1039.956|0|C|19|118.80|220.00|1|1|57|||TBR|ANT|M||||||58
1037.1039.957|0|C|19|118.80|220.00|1|1|57|||TBR|PTO|B||||||58
1037.1039.958|0|C|19|118.80|220.00|1|1|57|||TBR|PTO|M||||||58
1037.1039.959|0|C|19|118.80|220.00|1|1|57|||TBR|CRE|B||||||58
1037.1039.960|0|C|19|118.80|220.00|1|1|57|||TBR|CRE|M||||||58
1037.1039.961|0|C|19|118.80|220.00|1|1|57|||TBR|CAM|B||||||58
1037.1039.962|0|C|19|118.80|220.00|1|1|57|||TBR|CAM|M||||||58
1037.1039.963|0|C|19|118.80|220.00|1|1|57|||TBR|OUR|B||||||58
1037.1039.964|0|C|19|118.80|220.00|1|1|57|||TBR|OUR|M||||||58
1037.1039.965|0|C|19|118.80|220.00|1|1|57|||TBR|COB|B||||||58
1037.1039.966|0|C|19|118.80|220.00|1|1|57|||TBR|COB|M||||||58
1037.1039.967|0|C|19|118.80|220.00|1|1|57|||TBR|CHO|B||||||58
1037.1039.968|0|C|19|118.80|220.00|1|1|57|||TBR|CHO|M||||||58
1037.1039.969|0|C|19|118.80|220.00|1|1|57|||TBR|VAG|B||||||58
1037.1039.970|0|C|19|118.80|220.00|1|1|57|||TBR|VAG|M||||||58
1037.1039.971|0|C|19|118.80|220.00|1|1|57|||TBR|AZE|B||||||58
1037.1039.972|0|C|19|118.80|220.00|1|1|57|||TBR|AZE|M||||||58
1037.1039.973|0|C|19|118.80|220.00|1|1|57|||TBR|AMA|B||||||58
1037.1039.974|0|C|19|118.80|220.00|1|1|57|||TBR|AMA|M||||||58
1037.1039.975|0|C|19|118.80|220.00|1|1|57|||TBR|AES|B||||||58
1037.1039.976|0|C|19|118.80|220.00|1|1|57|||TBR|AES|M||||||58
1037.1039.977|0|C|19|118.80|220.00|1|1|57|||TBR|PRA|B||||||58
1037.1039.978|0|C|19|118.80|220.00|1|1|57|||TBR|PRA|M||||||58
1037.1039.979|0|C|19|118.80|220.00|1|1|57|||TBR|ROS|B||||||58
1037.1039.980|0|C|19|118.80|220.00|1|1|57|||TBR|ROS|M||||||58
1037.1039.981|0|C|19|118.80|220.00|1|1|57|||TBR|VER|B||||||58
1037.1039.982|0|C|19|118.80|220.00|1|1|57|||TBR|VER|M||||||58
1037.1039.983|0|C|19|118.80|220.00|1|1|57|||TBR|AZB|||||||58
1037.1039.984|0|C|19|118.80|220.00|1|1|57|||TBR|DEN|||||||58
1037.1039.985|0|C|19|118.80|220.00|1|1|57|||TBR|BLK|||||||58
1037.1039.986|0|C|19|118.80|220.00|1|1|57|||TBR|ART|||||||58
1037.1039.987|0|C|19|118.80|220.00|1|1|57|||TBR|LIN|||||||58
1037.1039.988|0|C|19|118.80|220.00|1|1|57|||TBR|HAL|||||||58
1037.1039.989|0|C|19|140.40|260.00|1|1|57|||BCO|BCO|B||||||58
1037.1039.990|0|C|19|140.40|260.00|1|1|57|||BCO|BCO|M||||||58
1037.1039.991|0|C|19|140.40|260.00|1|1|57|||CCL|CCL|B||||||58
1037.1039.992|0|C|19|140.40|260.00|1|1|57|||CCL|CCL|M||||||58
1037.1039.993|0|C|19|140.40|260.00|1|1|57|||CME|CME|B||||||58
1037.1039.994|0|C|19|140.40|260.00|1|1|57|||CME|CME|M||||||58
1037.1039.995|0|C|19|140.40|260.00|1|1|57|||ANT|ANT|B||||||58
1037.1039.996|0|C|19|140.40|260.00|1|1|57|||ANT|ANT|M||||||58
1037.1039.997|0|C|19|140.40|260.00|1|1|57|||PTO|PTO|B||||||58
1037.1039.998|0|C|19|140.40|260.00|1|1|57|||PTO|PTO|M||||||58
1037.1039.999|0|C|19|140.40|260.00|1|1|57|||CRE|CRE|B||||||58
1037.1039.1000|0|C|19|140.40|260.00|1|1|57|||CRE|CRE|M||||||58
1037.1039.1001|0|C|19|140.40|260.00|1|1|57|||CAM|CAM|B||||||58
1037.1039.1002|0|C|19|140.40|260.00|1|1|57|||CAM|CAM|M||||||58
1037.1039.1003|0|C|19|140.40|260.00|1|1|57|||OUR|OUR|B||||||58
1037.1039.1004|0|C|19|140.40|260.00|1|1|57|||OUR|OUR|M||||||58
1037.1039.1005|0|C|19|140.40|260.00|1|1|57|||COB|COB|B||||||58
1037.1039.1006|0|C|19|140.40|260.00|1|1|57|||COB|COB|M||||||58
1037.1039.1007|0|C|19|140.40|260.00|1|1|57|||CHO|CHO|B||||||58
1037.1039.1008|0|C|19|140.40|260.00|1|1|57|||CHO|CHO|M||||||58
1037.1039.1009|0|C|19|140.40|260.00|1|1|57|||VAG|VAG|B||||||58
1037.1039.1010|0|C|19|140.40|260.00|1|1|57|||VAG|VAG|M||||||58
1037.1039.1011|0|C|19|140.40|260.00|1|1|57|||AZE|AZE|B||||||58
1037.1039.1012|0|C|19|140.40|260.00|1|1|57|||AZE|AZE|M||||||58
1037.1039.1013|0|C|19|140.40|260.00|1|1|57|||AMA|AMA|B||||||58
1037.1039.1014|0|C|19|140.40|260.00|1|1|57|||AMA|AMA|M||||||58
1037.1039.1015|0|C|19|140.40|260.00|1|1|57|||AES|AES|B||||||58
1037.1039.1016|0|C|19|140.40|260.00|1|1|57|||AES|AES|M||||||58
1037.1039.1017|0|C|19|140.40|260.00|1|1|57|||PRA|PRA|B||||||58
1037.1039.1018|0|C|19|140.40|260.00|1|1|57|||PRA|PRA|M||||||58
1037.1039.1019|0|C|19|140.40|260.00|1|1|57|||ROS|ROS|B||||||58
1037.1039.1020|0|C|19|140.40|260.00|1|1|57|||ROS|ROS|M||||||58
1037.1039.1021|0|C|19|140.40|260.00|1|1|57|||VER|VER|B||||||58
1037.1039.1022|0|C|19|140.40|260.00|1|1|57|||VER|VER|M||||||58
1037.1039.1023|0|C|19|140.40|260.00|1|1|57|||AZB|AZB|||||||58
1037.1039.1024|0|C|19|140.40|260.00|1|1|57|||DEN|DEN|||||||58
1037.1039.1025|0|C|19|140.40|260.00|1|1|57|||BLK|BLK|||||||58
1037.1039.1026|0|C|19|140.40|260.00|1|1|57|||ART|ART|||||||58
1037.1039.1027|0|C|19|140.40|260.00|1|1|57|||LIN|LIN|||||||58
1037.1039.1028|0|C|19|140.40|260.00|1|1|57|||HAL|HAL|||||||58
1040.1041.845|0|C|20|85.86|159.00|1|1|57|||TBL|TBL|||||||59
1040.1041.846|0|C|20|85.86|159.00|1|1|57|||TEA|TEA|||||||59
1040.1041.847|0|C|20|85.86|159.00|1|1|57|||OAK|OAK|||||||59
1040.1041.848|0|C|20|85.86|159.00|1|1|57|||JOP|JOP|||||||59
1040.1041.949|0|C|20|129.06|239.00|1|1|57|||TBR|BCO|B||||||59
1040.1041.950|0|C|20|129.06|239.00|1|1|57|||TBR|BCO|M||||||59
1040.1041.951|0|C|20|129.06|239.00|1|1|57|||TBR|CCL|B||||||59
1040.1041.952|0|C|20|129.06|239.00|1|1|57|||TBR|CCL|M||||||59
1040.1041.953|0|C|20|129.06|239.00|1|1|57|||TBR|CME|B||||||59
1040.1041.954|0|C|20|129.06|239.00|1|1|57|||TBR|CME|M||||||59
1040.1041.955|0|C|20|129.06|239.00|1|1|57|||TBR|ANT|B||||||59
1040.1041.956|0|C|20|129.06|239.00|1|1|57|||TBR|ANT|M||||||59
1040.1041.957|0|C|20|129.06|239.00|1|1|57|||TBR|PTO|B||||||59
1040.1041.958|0|C|20|129.06|239.00|1|1|57|||TBR|PTO|M||||||59
1040.1041.959|0|C|20|129.06|239.00|1|1|57|||TBR|CRE|B||||||59
1040.1041.960|0|C|20|129.06|239.00|1|1|57|||TBR|CRE|M||||||59
1040.1041.961|0|C|20|129.06|239.00|1|1|57|||TBR|CAM|B||||||59
1040.1041.962|0|C|20|129.06|239.00|1|1|57|||TBR|CAM|M||||||59
1040.1041.963|0|C|20|129.06|239.00|1|1|57|||TBR|OUR|B||||||59
1040.1041.964|0|C|20|129.06|239.00|1|1|57|||TBR|OUR|M||||||59
1040.1041.965|0|C|20|129.06|239.00|1|1|57|||TBR|COB|B||||||59
1040.1041.966|0|C|20|129.06|239.00|1|1|57|||TBR|COB|M||||||59
1040.1041.967|0|C|20|129.06|239.00|1|1|57|||TBR|CHO|B||||||59
1040.1041.968|0|C|20|129.06|239.00|1|1|57|||TBR|CHO|M||||||59
1040.1041.969|0|C|20|129.06|239.00|1|1|57|||TBR|VAG|B||||||59
1040.1041.970|0|C|20|129.06|239.00|1|1|57|||TBR|VAG|M||||||59
1040.1041.971|0|C|20|129.06|239.00|1|1|57|||TBR|AZE|B||||||59
1040.1041.972|0|C|20|129.06|239.00|1|1|57|||TBR|AZE|M||||||59
1040.1041.973|0|C|20|129.06|239.00|1|1|57|||TBR|AMA|B||||||59
1040.1041.974|0|C|20|129.06|239.00|1|1|57|||TBR|AMA|M||||||59
1040.1041.975|0|C|20|129.06|239.00|1|1|57|||TBR|AES|B||||||59
1040.1041.976|0|C|20|129.06|239.00|1|1|57|||TBR|AES|M||||||59
1040.1041.977|0|C|20|129.06|239.00|1|1|57|||TBR|PRA|B||||||59
1040.1041.978|0|C|20|129.06|239.00|1|1|57|||TBR|PRA|M||||||59
1040.1041.979|0|C|20|129.06|239.00|1|1|57|||TBR|ROS|B||||||59
1040.1041.980|0|C|20|129.06|239.00|1|1|57|||TBR|ROS|M||||||59
1040.1041.981|0|C|20|129.06|239.00|1|1|57|||TBR|VER|B||||||59
1040.1041.982|0|C|20|129.06|239.00|1|1|57|||TBR|VER|M||||||59
1040.1041.983|0|C|20|129.06|239.00|1|1|57|||TBR|AZB|||||||59
1040.1041.984|0|C|20|129.06|239.00|1|1|57|||TBR|DEN|||||||59
1040.1041.985|0|C|20|129.06|239.00|1|1|57|||TBR|BLK|||||||59
1040.1041.986|0|C|20|129.06|239.00|1|1|57|||TBR|ART|||||||59
1040.1041.987|0|C|20|129.06|239.00|1|1|57|||TBR|LIN|||||||59
1040.1041.988|0|C|20|129.06|239.00|1|1|57|||TBR|HAL|||||||59
1040.1041.989|0|C|20|150.66|279.00|1|1|57|||BCO|BCO|B||||||59
1040.1041.990|0|C|20|150.66|279.00|1|1|57|||BCO|BCO|M||||||59
1040.1041.991|0|C|20|150.66|279.00|1|1|57|||CCL|CCL|B||||||59
1040.1041.992|0|C|20|150.66|279.00|1|1|57|||CCL|CCL|M||||||59
1040.1041.993|0|C|20|150.66|279.00|1|1|57|||CME|CME|B||||||59
1040.1041.994|0|C|20|150.66|279.00|1|1|57|||CME|CME|M||||||59
1040.1041.995|0|C|20|150.66|279.00|1|1|57|||ANT|ANT|B||||||59
1040.1041.996|0|C|20|150.66|279.00|1|1|57|||ANT|ANT|M||||||59
1040.1041.997|0|C|20|150.66|279.00|1|1|57|||PTO|PTO|B||||||59
1040.1041.998|0|C|20|150.66|279.00|1|1|57|||PTO|PTO|M||||||59
1040.1041.999|0|C|20|150.66|279.00|1|1|57|||CRE|CRE|B||||||59
1040.1041.1000|0|C|20|150.66|279.00|1|1|57|||CRE|CRE|M||||||59
1040.1041.1001|0|C|20|150.66|279.00|1|1|57|||CAM|CAM|B||||||59
1040.1041.1002|0|C|20|150.66|279.00|1|1|57|||CAM|CAM|M||||||59
1040.1041.1003|0|C|20|150.66|279.00|1|1|57|||OUR|OUR|B||||||59
1040.1041.1004|0|C|20|150.66|279.00|1|1|57|||OUR|OUR|M||||||59
1040.1041.1005|0|C|20|150.66|279.00|1|1|57|||COB|COB|B||||||59
1040.1041.1006|0|C|20|150.66|279.00|1|1|57|||COB|COB|M||||||59
1040.1041.1007|0|C|20|150.66|279.00|1|1|57|||CHO|CHO|B||||||59
1040.1041.1008|0|C|20|150.66|279.00|1|1|57|||CHO|CHO|M||||||59
1040.1041.1009|0|C|20|150.66|279.00|1|1|57|||VAG|VAG|B||||||59
1040.1041.1010|0|C|20|150.66|279.00|1|1|57|||VAG|VAG|M||||||59
1040.1041.1011|0|C|20|150.66|279.00|1|1|57|||AZE|AZE|B||||||59
1040.1041.1012|0|C|20|150.66|279.00|1|1|57|||AZE|AZE|M||||||59
1040.1041.1013|0|C|20|150.66|279.00|1|1|57|||AMA|AMA|B||||||59
1040.1041.1014|0|C|20|150.66|279.00|1|1|57|||AMA|AMA|M||||||59
1040.1041.1015|0|C|20|150.66|279.00|1|1|57|||AES|AES|B||||||59
1040.1041.1016|0|C|20|150.66|279.00|1|1|57|||AES|AES|M||||||59
1040.1041.1017|0|C|20|150.66|279.00|1|1|57|||PRA|PRA|B||||||59
1040.1041.1018|0|C|20|150.66|279.00|1|1|57|||PRA|PRA|M||||||59
1040.1041.1019|0|C|20|150.66|279.00|1|1|57|||ROS|ROS|B||||||59
1040.1041.1020|0|C|20|150.66|279.00|1|1|57|||ROS|ROS|M||||||59
1040.1041.1021|0|C|20|150.66|279.00|1|1|57|||VER|VER|B||||||59
1040.1041.1022|0|C|20|150.66|279.00|1|1|57|||VER|VER|M||||||59
1040.1041.1023|0|C|20|150.66|279.00|1|1|57|||AZB|AZB|||||||59
1040.1041.1024|0|C|20|150.66|279.00|1|1|57|||DEN|DEN|||||||59
1040.1041.1025|0|C|20|150.66|279.00|1|1|57|||BLK|BLK|||||||59
1040.1041.1026|0|C|20|150.66|279.00|1|1|57|||ART|ART|||||||59
1040.1041.1027|0|C|20|150.66|279.00|1|1|57|||LIN|LIN|||||||59
1040.1041.1028|0|C|20|150.66|279.00|1|1|57|||HAL|HAL|||||||59
1040.1039.845|0|C|19|96.12|178.00|1|1|57|||TBL|TBL|||||||59
1040.1039.846|0|C|19|96.12|178.00|1|1|57|||TEA|TEA|||||||59
1040.1039.847|0|C|19|96.12|178.00|1|1|57|||OAK|OAK|||||||59
1040.1039.848|0|C|19|96.12|178.00|1|1|57|||JOP|JOP|||||||59
1040.1039.949|0|C|19|139.32|258.00|1|1|57|||TBR|BCO|B||||||59
1040.1039.950|0|C|19|139.32|258.00|1|1|57|||TBR|BCO|M||||||59
1040.1039.951|0|C|19|139.32|258.00|1|1|57|||TBR|CCL|B||||||59
1040.1039.952|0|C|19|139.32|258.00|1|1|57|||TBR|CCL|M||||||59
1040.1039.953|0|C|19|139.32|258.00|1|1|57|||TBR|CME|B||||||59
1040.1039.954|0|C|19|139.32|258.00|1|1|57|||TBR|CME|M||||||59
1040.1039.955|0|C|19|139.32|258.00|1|1|57|||TBR|ANT|B||||||59
1040.1039.956|0|C|19|139.32|258.00|1|1|57|||TBR|ANT|M||||||59
1040.1039.957|0|C|19|139.32|258.00|1|1|57|||TBR|PTO|B||||||59
1040.1039.958|0|C|19|139.32|258.00|1|1|57|||TBR|PTO|M||||||59
1040.1039.959|0|C|19|139.32|258.00|1|1|57|||TBR|CRE|B||||||59
1040.1039.960|0|C|19|139.32|258.00|1|1|57|||TBR|CRE|M||||||59
1040.1039.961|0|C|19|139.32|258.00|1|1|57|||TBR|CAM|B||||||59
1040.1039.962|0|C|19|139.32|258.00|1|1|57|||TBR|CAM|M||||||59
1040.1039.963|0|C|19|139.32|258.00|1|1|57|||TBR|OUR|B||||||59
1040.1039.964|0|C|19|139.32|258.00|1|1|57|||TBR|OUR|M||||||59
1040.1039.965|0|C|19|139.32|258.00|1|1|57|||TBR|COB|B||||||59
1040.1039.966|0|C|19|139.32|258.00|1|1|57|||TBR|COB|M||||||59
1040.1039.967|0|C|19|139.32|258.00|1|1|57|||TBR|CHO|B||||||59
1040.1039.968|0|C|19|139.32|258.00|1|1|57|||TBR|CHO|M||||||59
1040.1039.969|0|C|19|139.32|258.00|1|1|57|||TBR|VAG|B||||||59
1040.1039.970|0|C|19|139.32|258.00|1|1|57|||TBR|VAG|M||||||59
1040.1039.971|0|C|19|139.32|258.00|1|1|57|||TBR|AZE|B||||||59
1040.1039.972|0|C|19|139.32|258.00|1|1|57|||TBR|AZE|M||||||59
1040.1039.973|0|C|19|139.32|258.00|1|1|57|||TBR|AMA|B||||||59
1040.1039.974|0|C|19|139.32|258.00|1|1|57|||TBR|AMA|M||||||59
1040.1039.975|0|C|19|139.32|258.00|1|1|57|||TBR|AES|B||||||59
1040.1039.976|0|C|19|139.32|258.00|1|1|57|||TBR|AES|M||||||59
1040.1039.977|0|C|19|139.32|258.00|1|1|57|||TBR|PRA|B||||||59
1040.1039.978|0|C|19|139.32|258.00|1|1|57|||TBR|PRA|M||||||59
1040.1039.979|0|C|19|139.32|258.00|1|1|57|||TBR|ROS|B||||||59
1040.1039.980|0|C|19|139.32|258.00|1|1|57|||TBR|ROS|M||||||59
1040.1039.981|0|C|19|139.32|258.00|1|1|57|||TBR|VER|B||||||59
1040.1039.982|0|C|19|139.32|258.00|1|1|57|||TBR|VER|M||||||59
1040.1039.983|0|C|19|139.32|258.00|1|1|57|||TBR|AZB|||||||59
1040.1039.984|0|C|19|139.32|258.00|1|1|57|||TBR|DEN|||||||59
1040.1039.985|0|C|19|139.32|258.00|1|1|57|||TBR|BLK|||||||59
1040.1039.986|0|C|19|139.32|258.00|1|1|57|||TBR|ART|||||||59
1040.1039.987|0|C|19|139.32|258.00|1|1|57|||TBR|LIN|||||||59
1040.1039.988|0|C|19|139.32|258.00|1|1|57|||TBR|HAL|||||||59
1040.1039.989|0|C|19|160.92|298.00|1|1|57|||BCO|BCO|B||||||59
1040.1039.990|0|C|19|160.92|298.00|1|1|57|||BCO|BCO|M||||||59
1040.1039.991|0|C|19|160.92|298.00|1|1|57|||CCL|CCL|B||||||59
1040.1039.992|0|C|19|160.92|298.00|1|1|57|||CCL|CCL|M||||||59
1040.1039.993|0|C|19|160.92|298.00|1|1|57|||CME|CME|B||||||59
1040.1039.994|0|C|19|160.92|298.00|1|1|57|||CME|CME|M||||||59
1040.1039.995|0|C|19|160.92|298.00|1|1|57|||ANT|ANT|B||||||59
1040.1039.996|0|C|19|160.92|298.00|1|1|57|||ANT|ANT|M||||||59
1040.1039.997|0|C|19|160.92|298.00|1|1|57|||PTO|PTO|B||||||59
1040.1039.998|0|C|19|160.92|298.00|1|1|57|||PTO|PTO|M||||||59
1040.1039.999|0|C|19|160.92|298.00|1|1|57|||CRE|CRE|B||||||59
1040.1039.1000|0|C|19|160.92|298.00|1|1|57|||CRE|CRE|M||||||59
1040.1039.1001|0|C|19|160.92|298.00|1|1|57|||CAM|CAM|B||||||59
1040.1039.1002|0|C|19|160.92|298.00|1|1|57|||CAM|CAM|M||||||59
1040.1039.1003|0|C|19|160.92|298.00|1|1|57|||OUR|OUR|B||||||59
1040.1039.1004|0|C|19|160.92|298.00|1|1|57|||OUR|OUR|M||||||59
1040.1039.1005|0|C|19|160.92|298.00|1|1|57|||COB|COB|B||||||59
1040.1039.1006|0|C|19|160.92|298.00|1|1|57|||COB|COB|M||||||59
1040.1039.1007|0|C|19|160.92|298.00|1|1|57|||CHO|CHO|B||||||59
1040.1039.1008|0|C|19|160.92|298.00|1|1|57|||CHO|CHO|M||||||59
1040.1039.1009|0|C|19|160.92|298.00|1|1|57|||VAG|VAG|B||||||59
1040.1039.1010|0|C|19|160.92|298.00|1|1|57|||VAG|VAG|M||||||59
1040.1039.1011|0|C|19|160.92|298.00|1|1|57|||AZE|AZE|B||||||59
1040.1039.1012|0|C|19|160.92|298.00|1|1|57|||AZE|AZE|M||||||59
1040.1039.1013|0|C|19|160.92|298.00|1|1|57|||AMA|AMA|B||||||59
1040.1039.1014|0|C|19|160.92|298.00|1|1|57|||AMA|AMA|M||||||59
1040.1039.1015|0|C|19|160.92|298.00|1|1|57|||AES|AES|B||||||59
1040.1039.1016|0|C|19|160.92|298.00|1|1|57|||AES|AES|M||||||59
1040.1039.1017|0|C|19|160.92|298.00|1|1|57|||PRA|PRA|B||||||59
1040.1039.1018|0|C|19|160.92|298.00|1|1|57|||PRA|PRA|M||||||59
1040.1039.1019|0|C|19|160.92|298.00|1|1|57|||ROS|ROS|B||||||59
1040.1039.1020|0|C|19|160.92|298.00|1|1|57|||ROS|ROS|M||||||59
1040.1039.1021|0|C|19|160.92|298.00|1|1|57|||VER|VER|B||||||59
1040.1039.1022|0|C|19|160.92|298.00|1|1|57|||VER|VER|M||||||59
1040.1039.1023|0|C|19|160.92|298.00|1|1|57|||AZB|AZB|||||||59
1040.1039.1024|0|C|19|160.92|298.00|1|1|57|||DEN|DEN|||||||59
1040.1039.1025|0|C|19|160.92|298.00|1|1|57|||BLK|BLK|||||||59
1040.1039.1026|0|C|19|160.92|298.00|1|1|57|||ART|ART|||||||59
1040.1039.1027|0|C|19|160.92|298.00|1|1|57|||LIN|LIN|||||||59
1040.1039.1028|0|C|19|160.92|298.00|1|1|57|||HAL|HAL|||||||59
1042|0|AL|1|23.76|44.00|1|1|58||||||||||30|
1043|1|AL|2|||1|1|59|86989703|||||||||30|
1044|1|AL|3|||1|1|60|84826310|||||||||30|
1045|0|AL|4|43.20|80.00|1|1|61||||||||||60|
1046|0|AL|5|32.40|60.00|1|1|62||||||||||18|
1047|0|E|12|99.90|185.00|1|1|63|||||||||||47
1048|0|E|12|113.40|210.00|1|1|63|||||||||||48
1049|0|E|12|137.70|255.00|1|1|63|||||||||||60
1050|0|E|13|64.80|120.00|1|1|64|||||||||||61
1051|0|E|14|75.60|140.00|1|1|65|||||||||||62
1052|0|E|15|75.60|140.00|1|1|65|||||||||||62
1053|0|E|16|48.60|90.00|1|1|66|||||||||||43
1054|0|E|16|54.00|100.00|1|1|66|||||||||||44
1055|0|E|16|59.40|110.00|1|1|66|||||||||||45
1056|0|E|17|99.90|185.00|1|1|67|||||||||||43
1057|0|E|17|124.20|230.00|1|1|67|||||||||||44
1058|0|E|17|151.20|280.00|1|1|67|||||||||||45
1059|0|E|17|175.50|325.00|1|1|67|||||||||||63
1060|0|E|18|99.90|185.00|1|1|67|||||||||||43
1061|0|E|18|124.20|230.00|1|1|67|||||||||||44
1062|0|E|18|151.20|280.00|1|1|67|||||||||||45
1063|0|E|18|175.50|325.00|1|1|67|||||||||||64
1064|0|E|19|124.20|230.00|1|1|64|||||||||||43
1065|0|E|19|137.70|255.00|1|1|64|||||||||||65
1066|0|E|19|151.20|280.00|1|1|64|||||||||||44
1067|0|E|19|175.50|325.00|1|1|64|||||||||||45
1068|0|E|20|48.60|90.00|1|1|68|||||||||||66
1069|0|E|20|59.40|110.00|1|1|68|||||||||||67
1070|0|E|20|70.20|130.00|1|1|68|||||||||||68
1071|0|E|20|81.00|150.00|1|1|68|||||||||||69
1072|0|E|20|108.00|200.00|1|1|68|||||||||||70
1073|0|E|21|29.16|54.00|1|1|69|||||||||||71
1074|0|E|21|35.10|65.00|1|1|69|||||||||||72
1075|0|E|21|40.50|75.00|1|1|69|||||||||||44
1076|0|E|21|46.44|86.00|1|1|69|||||||||||73
1077|0|E|21|35.64|66.00|1|1|69|||||||||||74
1078|0|E|21|41.58|77.00|1|1|69|||||||||||75
1079|0|E|21|47.52|88.00|1|1|69|||||||||||45
1080|0|E|21|53.46|99.00|1|1|69|||||||||||76
1081|0|E|21|20.52|38.00|1|1|69|||||||||||77
1082|0|E|21|21.06|39.00|1|1|69|||||||||||78
1083|0|E|21|24.84|46.00|1|1|69|||||||||||46
1084|0|E|21|22.68|42.00|1|1|69|||||||||||79
1085|0|E|21|27.00|50.00|1|1|69|||||||||||80
1086|0|E|21|29.16|54.00|1|1|69|||||||||||62
1087|0|E|21|22.68|42.00|1|1|69|||||||||||81
1088|0|E|21|28.62|53.00|1|1|69|||||||||||82
1089|0|E|21|34.56|64.00|1|1|69|||||||||||43
1090|0|E|21|40.50|75.00|1|1|69|||||||||||47
1091|0|E|21|27.00|50.00|1|1|69|||||||||||61
1092|0|E|21|31.32|58.00|1|1|69|||||||||||83
1093|0|E|21|37.26|69.00|1|1|69|||||||||||65
1094|0|E|21|39.42|73.00|1|1|69|||||||||||84
1095|0|E|22|91.80|170.00|1|1|70|||||||||||73
1096|0|E|22|102.60|190.00|1|1|70|||||||||||76
1097|0|E|22|70.20|130.00|1|1|71|||||||||||42
1098|0|E|22|81.00|150.00|1|1|70|||||||||||47
1099|0|E|23|86.40|160.00|1|1|72|||||||||||46
1100|0|E|23|108.00|200.00|1|1|72|||||||||||47
1101|0|E|24|135.00|250.00|1|1|73|||||||||||47
1102|0|E|25|102.60|190.00|1|1|74|||||||||||85
1103|0|E|25|113.40|210.00|1|1|74|||||||||||73
1104|0|E|25|135.00|250.00|1|1|74|||||||||||76
1105|0|E|25|102.60|190.00|1|1|75|||||||||||42
1106|0|E|25|105.30|195.00|1|1|74|||||||||||47
1107|0|E|26|135.00|250.00|1|1|76|||||||||||73
1108|0|E|26|151.20|280.00|1|1|76|||||||||||76
1109|0|E|26|118.80|220.00|1|1|76|||||||||||47
1110|0|E|27|108.00|200.00|1|1|77|||||||||||47
1111|0|E|28|151.20|280.00|1|1|78|||||||||||73
1112|0|E|28|162.00|300.00|1|1|78|||||||||||76
1113|0|E|28|118.80|220.00|1|1|78|||||||||||47
1114|0|E|29|248.40|460.00|1|1|79|||||||||||86
1115|0|E|30|129.60|240.00|1|1|80|||||||||||87
1116|0|E|30|151.20|280.00|1|1|81|||||||||||88
1117|0|E|30|102.60|190.00|1|1|82|||||||||||89
1118|0|E|31||330.00|4|4|83|||||||||||81
1119|0|E|32||280.00|4|4|84|||||||||||46
1120|0|E|32||310.00|4|4|84|||||||||||62
1121|0|E|32||350.00|4|4|84|||||||||||47
1122|0|E|32||430.00|4|4|84|||||||||||90
1123.1124|0|E|33||460.00|4|4|85||P|||M||||||91
1123.1125|0|E|33||460.00|4|4|85||B|||M||||||91
1123.1126|0|E|33||460.00|4|4|85||D|||B||||||91
1127.1124|0|E|33||495.00|4|4|85||P|||M||||||46
1127.1125|0|E|33||495.00|4|4|85||B|||M||||||46
1127.1126|0|E|33||495.00|4|4|85||D|||B||||||46
1128.1124|0|E|33||550.00|4|4|85||P|||M||||||62
1128.1125|0|E|33||550.00|4|4|85||B|||M||||||62
1128.1126|0|E|33||550.00|4|4|85||D|||B||||||62
1129.1124|0|E|33||595.00|4|4|85||P|||M||||||47
1129.1125|0|E|33||595.00|4|4|85||B|||M||||||47
1129.1126|0|E|33||595.00|4|4|85||D|||B||||||47
1130|0|E|34||270.00|4|4|86|||||||||||46
1131|0|E|34||285.00|4|4|86|||||||||||62
1132|0|E|34||300.00|4|4|86|||||||||||47
1133|0|E|35||340.00|4|4|87|||||||||||46
1134|0|E|35||380.00|4|4|87|||||||||||62
1135|0|E|35||410.00|4|4|87|||||||||||47
1136|0|E|36||390.00|4|4|88|||||||||||71
1137|0|E|36||470.00|4|4|88|||||||||||74
1138|0|E|36||370.00|4|4|88|||||||||||81
1139|0|E|37||330.00|4|4|89|||||||||||73
1140|0|E|37||385.00|4|4|89|||||||||||76
1141|0|E|37||300.00|4|4|89|||||||||||92
1142|0|E|37||310.00|4|4|89|||||||||||47
1143|0|E|38||350.00|4|4|90|||||||||||73
1144|0|E|38||385.00|4|4|90|||||||||||76
1145|0|E|38||310.00|4|4|90|||||||||||92
1146|0|E|38||330.00|4|4|90|||||||||||47
1147|0|E|39||285.00|4|4|91|||||||||||73
1148|0|E|39||315.00|4|4|91|||||||||||76
1149|0|E|39||240.00|4|4|91|||||||||||92
1150|0|E|39||270.00|4|4|91|||||||||||47
1151|0|E|40||350.00|4|4|92|||||||||||72
1152|0|E|40||310.00|4|4|92|||||||||||78
1153|0|E|40||330.00|4|4|92|||||||||||93
1154|0|E|41||310.00|4|4|93|||||||||||44
1155|0|E|41||320.00|4|4|93|||||||||||45
1156|0|E|41||330.00|4|4|93|||||||||||64
1157|0|E|41||280.00|4|4|93|||||||||||43
1158|0|E|42||390.00|4|4|94|||||||||||87
1159|0|E|42||450.00|4|4|94|||||||||||88
1160|0|E|42||370.00|4|4|94|||||||||||94
$linhas$, '\r?\n') AS s WHERE s <> '') x;
  UPDATE _tmv e
  SET nome = (SELECT string_agg(d.texto, ' - ' ORDER BY u.o) FROM unnest(e.partes) WITH ORDINALITY AS u(n, o) JOIN _tmv_nomes d ON d.n = u.n)
             || (CASE WHEN e.sem_preco THEN ' (sem preço)' ELSE '' END),
      attrs = coalesce((SELECT string_agg(o.rotulo || '=' || o.nome, ';')
                        FROM unnest(e.cods, ARRAY['cor', 'cor_corpo', 'cor_frente', 'tonalidade', 'veta', 'puxador', 'posicao_puxador',
                                                  'lado', 'largura']) AS c(codigo, papel)
                        JOIN _tmv_opc o ON o.papel = c.papel AND o.codigo = c.codigo
                        WHERE c.codigo <> ''), '')
             || coalesce((SELECT ';Medida=' || m.texto FROM _tmv_med m WHERE m.n = e.medida), '');
  IF EXISTS (SELECT 1 FROM _tmv e WHERE cardinality(e.cods) <> 9
             OR (SELECT count(*) FROM unnest(e.cods) c WHERE c <> '') + (CASE WHEN e.medida IS NULL THEN 0 ELSE 1 END)
                <> coalesce(cardinality(string_to_array(nullif(trim(BOTH ';' FROM e.attrs), ''), ';')), 0)) THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — as opções ou medidas do teste não se reconstroem.';
  END IF;
  IF (SELECT count(DISTINCT e.nome) FROM _tmv e) <> c_total OR EXISTS (SELECT 1 FROM _tmv e WHERE e.nome IS NULL OR e.attrs IS NULL) THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — os nomes ou os atributos do teste não se reconstroem.';
  END IF;
  CREATE TEMP TABLE _tmv_marcas (n integer PRIMARY KEY, nome text) ON COMMIT DROP;
  INSERT INTO _tmv_marcas (n, nome) VALUES (1, 'Moovlux'), (2, 'Chic&Bath'), (3, 'Duplach'), (4, 'Shower Bath');
  CREATE TEMP TABLE _tmv_forn (n integer PRIMARY KEY, nome text) ON COMMIT DROP;
  INSERT INTO _tmv_forn (n, nome) VALUES (1, 'ANLORBEL COMERCIO MATERIAIS CONSTRUCAO E DECORACAO'), (2, 'Sakidu SL'), (3, 'DUPLACH Group, SAU'), (4, 'New Bath, Lda');
  CREATE TEMP TABLE _tmv_descs (n integer PRIMARY KEY, texto text) ON COMMIT DROP;
  INSERT INTO _tmv_descs (n, texto) VALUES
    (1, 'Com prateleira no interior; Sistema Soft Close
Nota: o CSV antigo tinha também uma variante ''c/tampo'' para Omni não presente nesta tabela de preços - preço dessa variante não confirmado aqui
Pág. 144-145
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (2, 'Prateleira no mesmo acabamento da Frente; Sistema Soft Close
Pág. 138-139
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (3, 'Sistema Soft Close
Pág. 155
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (4, 'Pés de 10cm
Sistema Soft Close
Pág. 157
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (5, 'Só portas com Sistema Soft Close
Pág. 167
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (6, 'Pés de 10cm
Só portas com Sistema Soft Close
Pág. 171
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (7, 'Sistema Soft Close
Pág. 169
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (8, 'Pés de 10cm
Fundo Reduzido
Sistema Soft Close
Pág. 175
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (9, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 43101
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (10, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 44101
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (11, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 43141
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (12, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 44141
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (13, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 43102
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (14, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 44102
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (15, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 45102
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (16, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 43142
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (17, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 44142
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (18, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 45142
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (19, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 43103
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (20, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Pág. 8-17
Código base fornecedor: 44103
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (21, 'Vendida separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 8-17
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (22, 'Vendida separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 8-17
Uso com 2 cubas (opção duplo escote)
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (23, 'Vendido separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 8-17
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (24, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
15 acabados combináveis livremente (cor diferente no frente e no armazón), sem alterar preço nem código: 6 Madeiras (Roble Noruega, Roble Tibet(33), Roble América, Fresno Suecia, Olmo Canadá, Olmo California(32)); 7 Cores lisas (Blanco Mate(11), Capuchino, Gris Stone, Verde Trébol, Verde Boreal(34), Azul Brisa(35), Gris Marengo(14)); 2 Pedras (Petra Antracita, Marquina). Tirador Riga em 3 acabados de madeira: Roble Claro(6), Roble Oscuro(7), Roble Negro(8) - cor do tirador também não altera preço/código, fica em atributo. Códigos completos em Acabados Generales pág. 118.
Pág. 32-41
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (25, 'Vendido separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 32-41
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (26, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Acabamentos combináveis (frente/armazón), sem alterar preço nem código: 4 Frentes Tesel (Negro(79), Blanco(72), Verde(78), Arena(73)) + 6 Madeiras + 7 Cores lisas + 2 Pedras (mesma paleta geral do Riga/Montreal). Uñero Altea em 3 acabamentos: Blanco(1), Negro(2), Cromo(3) - também não altera preço/código. Códigos completos em Acabados Generales pág. 118.
Pág. 42-53
Disponível também com estrutura metálica suspensa (mesma referência/preço)
Pág. 51
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (27, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Acabamentos combináveis (frente/armazón), sem alterar preço nem código: 4 Frentes Tesel (Negro(79), Blanco(72), Verde(78), Arena(73)) + 6 Madeiras + 7 Cores lisas + 2 Pedras (mesma paleta geral do Riga/Montreal). Uñero Altea em 3 acabamentos: Blanco(1), Negro(2), Cromo(3) - também não altera preço/código. Códigos completos em Acabados Generales pág. 118.
Pág. 42-53
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (28, 'Herrajes europeus certificados; cajón metálico extração total 3 regulações; interior cuero negro; organizador no cajão superior
Acabamentos combináveis (frente/armazón), sem alterar preço nem código: 4 Frentes Tesel (Negro(79), Blanco(72), Verde(78), Arena(73)) + 6 Madeiras + 7 Cores lisas + 2 Pedras (mesma paleta geral do Riga/Montreal). Uñero Altea em 3 acabamentos: Blanco(1), Negro(2), Cromo(3) - também não altera preço/código. Códigos completos em Acabados Generales pág. 118.
Pág. 42-53
Modelos centrados não dispõem de organizador
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (29, 'Vendido separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 42-53
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (30, 'Vendido separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 42-53
Usada com Bajo Lavabo 1 cajón 27 em versão estrutura metálica
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (31, 'Vendido separadamente do Bajo Lavabo (código próprio do fornecedor)
Pág. 42-53
Usada com a Estrutura Suspendida Inferior
Preço Venda = PVP do catálogo; Preço Compra = PVP com desconto em cascata 40%+5%'),
    (32, 'MDF 22mm lacado
10 cores Lacado: Océano, Oliva, Gris 7035, Blanco, Negro, Beige, Moka, Antracita, Mint, Rosa
Tirador integrado (sem tirador à parte)
Fondo 45cm, Alto 60cm
Pág. 62-75
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (33, 'MDF 22mm lacado
10 cores Lacado: Océano, Oliva, Gris 7035, Blanco, Negro, Beige, Moka, Antracita, Mint, Rosa
Tirador integrado (sem tirador à parte)
Fondo 45cm, Alto 60cm
Pág. 76-89
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (34, 'Melamina 19mm
10 cores Melamina: Cairo, Nairobi, Rustik, Ribons, Blanco, Decapé, Nature, Gold, Icement, Marquina
Tirador Embutido: Cromo (por defeito), Negro (opcional), Blanco (opcional) - sem acréscimo
Fondo 45cm, Alto 60cm
Pág. 30-47
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (35, 'Melamina 19mm
10 cores Melamina: Cairo, Nairobi, Rustik, Ribons, Blanco, Decapé, Nature, Gold, Icement, Marquina
Sem tirador à parte (frente com corte integrado)
Fondo 45cm, Alto 60cm
Pág. 48-61
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (36, 'Melamina 19mm
10 cores Melamina
Modelo compacto COM PATAS 12cm: Cromo (por defeito), Negro (opcional), Blanco (opcional) - sem acréscimo
Tirador Perfil L: Cromo/Negro/Blanco (sem acréscimo)
Disponível também em versão com Puerta em vez de gavetas
Pág. 204-215
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (37, '10 cores Melamina: Cairo, Nairobi, Rustik, Ribons, Blanco, Decapé, Nature, Gold, Icement, Marquina
Não vendida separadamente - sempre em conjunto com o Mueble
Corte personalizado +30€; Perfuração para lavabo +60€ (referências à parte)
Pág. Tarifa 5
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (38, '10 cores Resina: Blanco, Gris 7035, Antracita, Negro, Beige, Moka, Océano, Oliva, Mint, Rosa
Não vendida separadamente - sempre em conjunto com o Mueble
Corte personalizado +30€; Perfuração para lavabo +60€ (referências à parte)
Pág. Tarifa 5
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (39, 'Serviço adicional, aplicável a qualquer encimera
Pág. Tarifa 5
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (40, 'Branco (única cor)
Não vendido separadamente - sempre em conjunto com o Mueble
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (41, 'Branco (única cor); 2 cubas
Não vendido separadamente - sempre em conjunto com o Mueble
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (42, '10 cores: Blanco, Gris 7035, Antracita, Negro, Océano, Beige, Moka, Rosa, Mint, Oliva
Não vendido separadamente - sempre em conjunto com o Mueble
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (43, 'Tablero + Canto de PVC gris
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (44, 'LED + Táctil + Calefactável (anti-embaciamento)
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (45, 'Estrutura metálica negra
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (46, 'LED + Táctil + Calefactável + Estrutura metálica negra
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (47, 'LED + Táctil + Calefactável (retroiluminado, sem marco)
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (48, 'Estrutura metálica negra + repisa de apoio
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (49, 'LED + Táctil + Calefactável
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (50, 'LED + Táctil + Calefactável + Estrutura metálica negra + repisa de apoio
Não vendido separadamente
Preço varia por tamanho (mesmo modelo/acabamento) - cada tamanho é referência própria
Pág. Tarifa 4
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (51, 'Acabamento: Todo Branco Lacado, Todo Tea, Todo Oak, Todo Joplim (mesmo preço, sem frente separada do corpo)
Extra da tabela de PVP do Axis Suspenso
Pág. 155
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (52, 'Extra da tabela de PVP do Axis Suspenso
Pág. 155
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (53, '10 cores Lacado: Océano, Oliva, Gris 7035, Blanco, Negro, Beige, Moka, Antracita, Mint, Rosa (mesmo preço)
Auxiliar de colgar genérico da gama Lacados (Sia, Maná, e demais coleções Lacadas) - só Sia/Maná validados até agora
Pág. Tarifa 3
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (54, '10 cores Melamina: Cairo, Nairobi, Rustik, Ribons, Blanco, Decapé, Nature, Gold, Icement, Marquina (mesmo preço)
Auxiliar de colgar genérico da gama Melamina (Etna, Zao, Vesubio, e demais coleções Melamina)
Pág. Tarifa 2
Preço Venda = PVP da tarifa; Preço Compra = PVP com desconto flat 45%'),
    (55, 'Sistema Soft Close; Pés de 10cm
Extra da tabela de PVP do Axis c/Pés
Pág. 179
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (56, 'Sistema Soft Close; Pés de 10cm
Colunas Auxiliares (produto avulso, não ligado a um móvel específico)
Pág. 180
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (57, 'Sistema Soft Close; Pés de 10cm
Colunas Auxiliares (produto avulso, não ligado a um móvel específico)
Pág. 181
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (58, 'Alumínio, 7,2w
Acabamento: Cromado
Fonte: print do Ricardo 13/08/2026
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (59, 'Alumínio
Acabamento: Dourado
Código de fornecedor 86989703
Fonte: print do Ricardo 13/08/2026
PENDENTE: preço a confirmar'),
    (60, 'Alumínio
Acabamento: Preto
Código de fornecedor 84826310
Fonte: print do Ricardo 13/08/2026
PENDENTE: preço a confirmar'),
    (61, 'Alumínio, 12w
Acabamentos: Branco Mate, Preto Mate, Cromado (mesmo preço)
Pág. 184
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (62, 'Alumínio, 7,2w
Acabamentos: Branco Mate, Preto Mate, Cromado (mesmo preço)
Pág. 184
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (63, 'Cor: paleta completa Todos os Lacados (Brilho/Mate) BRANCO, CREME, VERDE ÁGUA, CINZA CLARO, CAMEL, AZUL MAR, CINZA MÉDIO, OURO, AZUL ESCURO, ANTRACITE, COBRE, ROSA, PRETO, AZEITONA, VERMELHO, PRATA, CHOCOLATE
Ver pág. 192
Redondo
*Entrega 4/5 semanas
Pág. 186
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (64, 'Cor: paleta completa Todos os Lacados (Brilho/Mate) BRANCO, CREME, VERDE ÁGUA, CINZA CLARO, CAMEL, AZUL MAR, CINZA MÉDIO, OURO, AZUL ESCURO, ANTRACITE, COBRE, ROSA, PRETO, AZEITONA, VERMELHO, PRATA, CHOCOLATE
Ver pág. 192
Pág. 186
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (65, 'Cor: paleta completa Todos os Lacados (Brilho/Mate) BRANCO, CREME, VERDE ÁGUA, CINZA CLARO, CAMEL, AZUL MAR, CINZA MÉDIO, OURO, AZUL ESCURO, ANTRACITE, COBRE, ROSA, PRETO, AZEITONA, VERMELHO, PRATA, CHOCOLATE
Ver pág. 192
Redondo
Pág. 186
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (66, 'Cor: Todos os Lacados, Oak, Tea, Joplim
Ver pág. 192
Pág. 185
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (67, 'Cor: paleta completa Todos os Lacados (Brilho/Mate) BRANCO, CREME, VERDE ÁGUA, CINZA CLARO, CAMEL, AZUL MAR, CINZA MÉDIO, OURO, AZUL ESCURO, ANTRACITE, COBRE, ROSA, PRETO, AZEITONA, VERMELHO, PRATA, CHOCOLATE
Ver pág. 192
*Entrega 4/5 semanas
Pág. 185
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (68, 'Acabamentos (mesmo preço, sem código próprio): Branco, Tea, Oak, Joplim, Denver, Azabache
*Entrega 4/5 semanas
Pág. 186
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (69, 'Acabamento único: Alumínio
*Entrega 4/5 semanas
Pág. 185
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (70, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+; 6500K
Pág. 187
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (71, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+; 6500K
Reversível: pode ser montado 60x70 ou 70x60
Pág. 187
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (72, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Redondo
Pág. 188
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (73, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Redondo
Aro Alumínio Preto Mate
Pág. 188
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (74, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+; Modelo Reversível
Retangular
Pág. 189
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (75, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+; Modelo Reversível
Reversível: pode ser montado 60x70 ou 70x60
Retangular
Pág. 189
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (76, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Retangular
Aro Alumínio Preto Mate
Pág. 189
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (77, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Redondo
Pág. 190
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (78, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Retangular
Inclui espelho de aumento 3x Ø18cm integrado
Pág. 190
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (79, 'IP44; Botão ON/OFF
De pé (suporte para chão) ou fixação à parede
Pág. 191
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (80, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Retangular
Reversível: pode ser montado 50x100 ou 100x50
Pág. 187
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (81, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Retangular
Reversível: pode ser montado 50x120 ou 120x50
Pág. 187
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (82, 'IP44; Transição de cor 3000K-6500K; Vidro Anticorrosivo; Luzes LED 2835 120SMD/M; Adesivo Segurança+
Retangular
Reversível: pode ser montado 50x90 ou 90x50
Pág. 187
Preço Venda = PVP do catálogo; Preço Compra = PVP com 46% de desconto'),
    (83, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Retroiluminado; formato orgânico
Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (84, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Redondo retroiluminado com base reta; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (85, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Redondo c/iluminação foscada e moldura metálica; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (86, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Redondo retroiluminado; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (87, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Redondo c/iluminação foscada; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (88, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Oval c/iluminação foscada; Aplicação vertical ou horizontal; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (89, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Retangular c/iluminação foscada frontal; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (90, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Retangular liso retroiluminado; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (91, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Retangular com foscagem retroiluminado; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (92, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Retangular com duas barras foscadas laterais; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (93, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Retangular com barra foscada superior; Cor led 5550K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)'),
    (94, 'LED; Desembaciador; Duplo Touch; IP44
Outras medidas e medidas especiais sob consulta
Oval com iluminação foscada lateral; Cor led 5500K
Preço Venda = PVP do catálogo; Preço Compra PENDENTE - desconto Shower Bath ainda não confirmado pelo Ricardo (14/08/2026)');
  IF (SELECT count(*) FROM _tmv) <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 2 — o teste tem % linhas.', (SELECT count(*) FROM _tmv); END IF;

  CREATE TEMP TABLE _tmv_p ON COMMIT DROP AS
  SELECT e.*, p.id, p.sku, p.sku_gerado, p.category_id, p.subcategory_id, p.model_id, p.status::text AS status, p.tipo_catalogo,
         p.is_active, p.manages_stock, p.unidade, p.uom_id, p.short_description, p.marca_livre, p.brand_id, p.supplier_id
  FROM _tmv e
  LEFT JOIN products p ON p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted AND p.name = e.nome;
  -- os atributos de cada produto, pelo nome do atributo e da opção (sem acentos/maiúsculas), comparados como conjunto
  CREATE TEMP TABLE _tmv_a ON COMMIT DROP AS
  SELECT e.id,
         (SELECT string_agg(z.k, ';' ORDER BY z.k) FROM (
            SELECT public.fn_cat_chave_opcao(split_part(s, '=', 1)) || '=' || public.fn_cat_chave_opcao(split_part(s, '=', 2)) AS k
            FROM regexp_split_to_table(e.attrs, ';') AS s WHERE s <> '') z) AS esperado,
         (SELECT string_agg(z.k, ';' ORDER BY z.k) FROM (
            SELECT public.fn_cat_chave_opcao(a.label::text) || '=' || public.fn_cat_chave_opcao(v.value_text::text) AS k
            FROM product_attribute_values v JOIN product_attributes a ON a.id = v.attribute_id WHERE v.product_id = e.id) z) AS gravado
  FROM _tmv_p e WHERE e.id IS NOT NULL;

  SELECT count(*), string_agg(e.nome, ' | ') INTO v_n, v_txt
  FROM _tmv_p e
  JOIN _tmv_marcas bm ON bm.n = e.marca
  JOIN _tmv_forn fm ON fm.n = e.fornecedor
  LEFT JOIN _tmv_descs d ON d.n = e.descricao
  LEFT JOIN _tmv_a ta ON ta.id = e.id
  LEFT JOIN product_categories sc ON sc.id = e.subcategory_id
  LEFT JOIN product_models pm ON pm.id = e.model_id
  WHERE NOT coalesce(
        e.sku_gerado AND e.category_id = v_cat AND sc.sigla = e.sub AND pm.numero = e.numero AND e.status = 'active'
        AND e.tipo_catalogo = 'produto' AND e.is_active AND e.manages_stock AND e.unidade = 'un' AND e.uom_id IS NOT NULL
        AND e.short_description IS NOT DISTINCT FROM d.texto
        AND e.marca_livre = bm.nome
        AND EXISTS (SELECT 1 FROM brands b WHERE b.id = e.brand_id AND b.organization_id = c_org AND b.name = bm.nome)
        AND EXISTS (SELECT 1 FROM suppliers s WHERE s.id = e.supplier_id AND s.organization_id = c_org
                    AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(fm.nome))
        -- os atributos: exatamente os do nome
        AND ta.esperado IS NOT DISTINCT FROM ta.gravado
        -- preços: os que o Excel tem (grossista e distribuidor são 0 neste Excel)
        AND (SELECT count(*) FROM product_prices x WHERE x.product_id = e.id)
            = (CASE WHEN e.custo IS NULL THEN 0 ELSE 1 END) + (CASE WHEN e.pvp IS NULL THEN 0 ELSE 1 END)
        AND (e.custo IS NULL OR EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = e.id AND x.price_type = 'purchase'
                    AND x.price = round(e.custo, 2) AND x.preco_exato = round(e.custo, 6) AND x.vat_rate = c_iva AND x.currency = 'EUR'))
        AND (e.pvp IS NULL OR EXISTS (SELECT 1 FROM product_prices x WHERE x.product_id = e.id AND x.price_type = 'retail'
                    AND x.price = round(e.pvp, 2) AND x.vat_rate = c_iva AND x.currency = 'EUR'))
        -- um fornecedor, o preferido, preço = custo, supplier_sku = código do fornecedor ou o SKU
        AND (SELECT count(*) FROM item_suppliers i WHERE i.product_id = e.id AND i.deleted_at IS NULL) = 1
        AND EXISTS (SELECT 1 FROM item_suppliers i WHERE i.product_id = e.id AND i.deleted_at IS NULL AND i.supplier_id = e.supplier_id
                    AND i.is_preferred AND i.is_active AND i.organization_id = c_org AND i.supplier_sku = coalesce(e.cod_forn, e.sku)
                    AND i.purchase_price IS NOT DISTINCT FROM round(e.custo, 2)),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 2 — % produtos diferentes da linha do Excel: %', v_n, left(v_txt, 1500); END IF;
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN _tmv_p e ON e.id = v.product_id;
  IF v_n <> c_n_valores THEN RAISE EXCEPTION 'FALHOU: passo 2 — % valores de atributos em vez de %.', v_n, c_n_valores; END IF;

  -- 3. o SKU é o que a regra do Catálogo recalcula do que está gravado (todos)
  -- (o grupo de opções de cada atributo calcula-se uma vez: assim a opção encontra-se pelo índice (group_id, value_text))
  CREATE TEMP TABLE _tmv_grupos ON COMMIT DROP AS
  SELECT a.id, a.is_measurement, (CASE WHEN NOT a.is_measurement THEN public.fn_cat_grupo_do_atributo(a.id, c_org) END) AS grupo
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL;
  ALTER TABLE _tmv_grupos ADD PRIMARY KEY (id);
  SELECT count(*), string_agg(x.sku || ' ≠ ' || coalesce(x.calc, 'null'), '; ') INTO v_n, v_txt
  FROM (SELECT p.sku, pt ->> 'faltas' AS faltas,
               concat_ws('-', pt ->> 'prefixo', lpad(public.fn_cat_modelo_numero(c_org, p.subcategory_id, p.model_id)::text, 4, '0'),
                         pt ->> 'resto') AS calc
        FROM products p
        CROSS JOIN LATERAL (SELECT public.fn_cat_sku_partes(c_org, p.category_id, p.subcategory_id, (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'atributo', v.attribute_id, 'sigla', o.sigla,
                     'medida', (CASE WHEN a.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END))), '[]'::jsonb)
            FROM product_attribute_values v
            JOIN _tmv_grupos a ON a.id = v.attribute_id
            LEFT JOIN attribute_option_group_values o ON NOT a.is_measurement AND o.group_id = a.grupo AND o.value_text = v.value_text
            WHERE v.product_id = p.id)) AS pt) z
        WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted) x
  WHERE x.calc IS DISTINCT FROM x.sku OR x.faltas <> '[]';
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 3 — % SKUs diferentes do recalculado: %', v_n, left(v_txt, 1500); END IF;

  -- 4. SKUs únicos, no formato, e com o número do modelo
  SELECT count(DISTINCT e.sku), count(*) FILTER (WHERE e.sku !~ ('^MACB-' || e.sub || '-' || lpad(e.numero::text, 4, '0') || '(-[A-Z0-9]+){0,8}$'))
    INTO v_n, v_m
  FROM _tmv_p e;
  IF v_n <> c_total OR v_m > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — % SKUs distintos (esperados %), % fora do formato MACB-SUB-NNNN.', v_n, c_total, v_m;
  END IF;

  -- 5. siglas das subcategorias; atributos usados de lista, a entrar no SKU; opções usadas ativas e com sigla
  SELECT string_agg(e.nome || ': ' || coalesce(c.sigla, 'sem subcategoria') || ' em vez de ' || e.sigla, '; ') INTO v_txt
  FROM (VALUES ('ML', 'Móveis de lavatório', 10226), ('C', 'Colunas', 940), ('E', 'Espelhos', 142), ('TB', 'Tampos & Bancadas WC', 84), ('AL', 'Apliques LED', 5)) AS e(sigla, nome, n)
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
                                AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(e.nome)
  WHERE c.sigla IS DISTINCT FROM e.sigla;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — siglas das subcategorias: %', v_txt; END IF;
  SELECT string_agg(DISTINCT a.label::text, ', ') INTO v_txt
  FROM product_attribute_values v JOIN _tmv_p e ON e.id = v.product_id JOIN product_attributes a ON a.id = v.attribute_id
  LEFT JOIN _tmv_grupos g ON g.id = a.id
  LEFT JOIN attribute_option_group_values o ON NOT a.is_measurement AND o.group_id = g.grupo AND o.value_text = v.value_text
  WHERE NOT (a.organization_id = c_org AND a.deleted_at IS NULL AND coalesce(a.sku_entra, false) AND a.sku_ordem IS NOT NULL
             AND (a.is_measurement = (a.code::text = 'medida'))
             AND (a.is_measurement OR (o.id IS NOT NULL AND o.is_active AND o.sigla IS NOT NULL)));
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — atributos ou opções fora do esperado: %', v_txt; END IF;

  -- 6. fornecedores e marcas, uma vez cada
  SELECT string_agg(e.nome || ' ×' || (SELECT count(*) FROM suppliers s WHERE s.organization_id = c_org AND s.deleted_at IS NULL
                                        AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.nome)), '; ') INTO v_txt
  FROM _tmv_forn e
  WHERE (SELECT count(*) FROM suppliers s WHERE s.organization_id = c_org AND s.deleted_at IS NULL
         AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.nome)) <> 1;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 6 — fornecedores: %', v_txt; END IF;
  SELECT string_agg(e.nome, '; ') INTO v_txt FROM _tmv_marcas e
  WHERE (SELECT count(*) FROM brands b WHERE b.organization_id = c_org AND b.deleted_at IS NULL AND b.name = e.nome) <> 1;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 6 — marcas: %', v_txt; END IF;

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
    UNION ALL SELECT 'product_attributes', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_groups', count(*) FROM attribute_option_groups x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'attribute_option_group_values', count(*) FROM attribute_option_group_values v JOIN attribute_option_groups g ON g.id = v.group_id
              WHERE v.xmin::text = v_xid AND g.organization_id IS DISTINCT FROM c_org) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 7 — linhas de outras organizações escritas pela importação: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id IS DISTINCT FROM c_org
    AND (p.subcategory_id = ANY (v_subs) OR p.model_id IN (SELECT pm.id FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id = ANY (v_subs)));
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 7 — % produtos de outras organizações apontam para dados da Mudelar.', v_n; END IF;

  -- 8. cat_prever_sku_modelo (só leitura) como um membro da Mudelar com products.edit: 200 móveis e 25 de outras categorias
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 8 — sem membro ativo da Mudelar com products.edit.'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  v_n := 0;
  FOR r IN SELECT u.* FROM ((SELECT x.* FROM (SELECT p.id, p.sku, p.category_id, p.subcategory_id, p.model_id FROM products p
                             WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted
                             ORDER BY random() LIMIT 200) x)
           UNION ALL
           (SELECT y.* FROM (SELECT p.id, p.sku, p.category_id, p.subcategory_id, p.model_id FROM products p
                             WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.sku_gerado AND p.model_id IS NOT NULL
                               AND p.category_id IS DISTINCT FROM v_cat
                             ORDER BY random() LIMIT 25) y)) u LOOP
    SELECT coalesce(jsonb_agg(CASE WHEN a.is_measurement THEN jsonb_build_object('atributo', v.attribute_id, 'medida', v.value_json)
                                   ELSE jsonb_build_object('atributo', v.attribute_id, 'opcao', o.id) END ORDER BY a.id), '[]'::jsonb)
      INTO v_attrs
    FROM product_attribute_values v
    JOIN product_attributes a ON a.id = v.attribute_id AND a.organization_id = c_org AND a.deleted_at IS NULL
    LEFT JOIN _tmv_grupos g ON g.id = a.id
    LEFT JOIN attribute_option_group_values o ON NOT a.is_measurement AND o.group_id = g.grupo AND o.value_text = v.value_text
    WHERE v.product_id = r.id;
    v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.id);
    IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'FALHOU: passo 8 — cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_n < 225 THEN RAISE EXCEPTION 'FALHOU: passo 8 — só % produtos comparados (esperados 225).', v_n; END IF;

  -- 9. a linha consolidada da auditoria
  SELECT count(*) INTO v_n FROM entity_audit_log e
  WHERE e.organization_id = c_org AND e.source = 'migration:moveis_wc_mudelar' AND e.table_name = 'products' AND e.record_id = v_cat;
  IF v_n < 1 THEN RAISE EXCEPTION 'FALHOU: passo 9 — a auditoria não tem a linha consolidada da importação.'; END IF;
END $t$;

SELECT 'OK: móveis & arrumação casa de banho da Mudelar (11397 produtos, 176 modelos) conferidos nos passos 0 a 9.' AS resultado;

ROLLBACK;
