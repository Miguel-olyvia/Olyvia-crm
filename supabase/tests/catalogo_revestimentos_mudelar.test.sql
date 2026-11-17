-- ============================================================
-- Testes: 20270120700000_catalogo_revestimentos_mudelar.sql (base RH)
-- Ficheiro GERADO por script (gerar.js) a partir do Excel «Revestimentos_Rev1.xlsx», como a migration.
-- ============================================================
-- ORDEM: correr ANTES do db push da 20270120700000 (falha no passo 0: as subcategorias de «Revestimentos» da Mudelar não
-- têm produtos); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- SÓ LEITURA, dentro de BEGIN … ROLLBACK. Não escreve em nenhuma organização. Lê a Mudelar
-- (3242e925-da26-459a-8258-be04d904e355) e, para provar que nada foi escrito fora dela, as outras organizações (só
-- contagens pelo xmin da transação da importação). Para comparar SKUs com cat_prever_sku_modelo usa, só nesta
-- transação, as claims de um membro ativo da Mudelar com products.edit (a função é só de leitura). Nenhuma chamada
-- recusada de propósito. Não assume que um atributo ou opção não existia: procura-os pelo nome.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_revestimentos_mudelar.test.sql
--
-- O que PROVA:
--   1. 366 produtos vivos nas 4 subcategorias (Cerâmico 32, Cerâmico Laminado 95, Porcelânico 218, SPC 21); 51 modelos com os números e nomes do gerador
--      e o número certo de produtos cada.
--   2. Cada um dos 366 produtos, pelo nome: subcategoria, modelo, exatamente os atributos (Cor, Acabamento, Aplicação,
--      Medida — pelo nome do atributo e da opção; 1026 valores ao todo; a Medida em cm ou mm), custo e PVP com IVA
--      23 só quando o Excel os tem, sem grossista/distribuidor, marca, fornecedor preferido (supplier_sku = código do
--      fornecedor ou o SKU; preço = custo), sem descrição, unidade m2/ml, active.
--   3. O SKU de cada produto é o que a regra do Catálogo recalcula do que está gravado (todos).
--   4. SKUs únicos e no formato RV-(CR|CL|PRC|SP)-NNNN[-…], com NNNN = o número do modelo.
--   5. Siglas das subcategorias; atributos usados de lista (Medida: medida), a entrar no SKU; opções ativas e com sigla;
--      a Aplicação só no VOLTERRA.
--   6. Fornecedores e marcas existem uma vez cada na Mudelar.
--   7. Nenhuma linha de outra organização tem o xmin da transação que criou os produtos.
--   8. cat_prever_sku_modelo dá o SKU gravado para 60 revestimentos ao acaso e 25 produtos de outras categorias.
--   9. A auditoria tem a linha consolidada da importação (fonte migration:revestimentos_mudelar).
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A importação foi aplicada? ───────────────────────────────────────────
DO $t0$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products p JOIN product_categories s ON s.id = p.subcategory_id
                 JOIN product_categories c ON c.id = s.parent_id
                 WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted
                   AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao('Revestimentos')) THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — as subcategorias de «Revestimentos» da Mudelar não têm produtos (aplicar 20270120700000).';
  END IF;
END $t0$;

-- ─── 1 a 9 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_total constant integer := 366;
  c_n_modelos constant integer := 51;
  c_n_valores constant integer := 1026;
  c_iva constant numeric := 23;
  v_cat uuid; v_subs uuid[]; v_n bigint; v_m bigint; v_txt text; v_xid text; v_auth uuid; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  SELECT c.id INTO v_cat FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL AND c.sigla = 'RV'
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao('Revestimentos');
  SELECT array_agg(c.id) INTO v_subs FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) IN (SELECT public.fn_cat_chave_opcao(e.nome) FROM (VALUES ('CR', 'Cerâmico', 32), ('CL', 'Cerâmico Laminado', 95), ('PRC', 'Porcelânico', 218), ('SP', 'SPC', 21)) AS e(sigla, nome, n));
  IF v_cat IS NULL OR cardinality(v_subs) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'FALHOU: configuração da Mudelar incompleta (categoria RV ou 4 subcategorias).';
  END IF;

  -- 1. quantos, por subcategoria e por modelo
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted;
  IF v_n <> c_total THEN RAISE EXCEPTION 'FALHOU: passo 1 — % produtos em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(e.nome || ': ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM (VALUES ('CR', 'Cerâmico', 32), ('CL', 'Cerâmico Laminado', 95), ('PRC', 'Porcelânico', 218), ('SP', 'SPC', 21)) AS e(sigla, nome, n)
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
                                AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(e.nome)
  LEFT JOIN (SELECT p.subcategory_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.subcategory_id) x ON x.subcategory_id = c.id
  WHERE coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — por subcategoria: %', v_txt; END IF;
  CREATE TEMP TABLE _trv_modelos (sub text, numero smallint, nome text, n integer, PRIMARY KEY (sub, numero)) ON COMMIT DROP;
  INSERT INTO _trv_modelos (sub, numero, nome, n) VALUES
    ('CR', 1, 'ATREZO', 3),
    ('CR', 2, 'BAVIERA', 1),
    ('CR', 3, 'MALMO', 3),
    ('CR', 4, 'SIROS', 4),
    ('CR', 5, 'TASOS', 4),
    ('CR', 6, 'GRACIA', 6),
    ('CR', 7, 'LUCIA', 5),
    ('CR', 8, 'VOLTERRA', 1),
    ('CR', 9, 'ATREZO PALCO ARENA', 2),
    ('CR', 10, 'BAVIERA BONN', 1),
    ('CR', 11, 'BAVIERA MUNICH', 1),
    ('CR', 12, 'LUCIA STAGE', 1),
    ('CL', 1, 'CAPRAIA', 3),
    ('CL', 2, 'CAMOUFLAGE', 6),
    ('CL', 3, 'CANELA ROMA', 4),
    ('CL', 4, 'ANKARA', 4),
    ('CL', 5, 'ARLES', 11),
    ('CL', 6, 'BLUE STONE', 8),
    ('CL', 7, 'OXIDO', 4),
    ('CL', 8, 'RIBERA', 8),
    ('CL', 9, 'BLUE ROMA', 3),
    ('CL', 10, 'CALACATA BLACK A', 4),
    ('CL', 11, 'CALACATA BLACK B', 4),
    ('CL', 12, 'SURFACE', 36),
    ('PRC', 1, 'HABANA', 9),
    ('PRC', 2, 'DOMUS', 48),
    ('PRC', 3, 'BRERA Rect.', 12),
    ('PRC', 4, 'BRERA', 12),
    ('PRC', 5, 'MELBOURNE', 65),
    ('PRC', 6, 'VALONIA', 45),
    ('PRC', 7, 'PRIORATO', 5),
    ('PRC', 8, 'SAJONIA', 9),
    ('PRC', 9, 'VOLTERRA', 7),
    ('PRC', 10, 'ARMANI ORO BIANCO', 1),
    ('PRC', 11, 'ARMANI CALACATA VENATTINO', 1),
    ('PRC', 12, 'BLANCO PURO', 2),
    ('PRC', 13, 'TRAVERTINO NAVONA', 2),
    ('SP', 1, 'ARANCIO', 4),
    ('SP', 2, 'DORSET 5,5mm', 2),
    ('SP', 3, 'SEVERN 5,5mm', 2),
    ('SP', 4, 'TERENT ABERTO 5,5mm', 1),
    ('SP', 5, 'CLYDE HUMO 5,5mm', 1),
    ('SP', 6, 'ARLES 5,5mm', 2),
    ('SP', 7, 'LEVANTE 5,5mm', 1),
    ('SP', 8, 'TURIA 5,5mm', 1),
    ('SP', 9, 'TORMES 5,5mm', 1),
    ('SP', 10, 'Rodapé 7 cm M/L', 1),
    ('SP', 11, 'Rodapé Decorado M/L', 1),
    ('SP', 12, 'AVON 5,5mm', 2),
    ('SP', 13, 'ANETO', 1),
    ('SP', 14, 'NERVION 5,5mm', 1);
  SELECT string_agg(e.sub || lpad(e.numero::text, 4, '0') || ' ' || e.nome || ': ' || coalesce(x.n, 0) || ' em vez de ' || e.n, '; ') INTO v_txt
  FROM _trv_modelos e
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL AND c.sigla = e.sub
  LEFT JOIN product_models pm ON pm.organization_id = c_org AND pm.subcategory_id = c.id AND pm.deleted_at IS NULL
                             AND pm.numero = e.numero AND pm.name = e.nome AND pm.is_active
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.model_id) x ON x.model_id = pm.id
  WHERE coalesce(x.n, 0) <> e.n;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — por modelo: %', left(v_txt, 1500); END IF;
  SELECT count(*) INTO v_n FROM product_models pm WHERE pm.organization_id = c_org AND pm.subcategory_id = ANY (v_subs);
  IF v_n <> c_n_modelos THEN RAISE EXCEPTION 'FALHOU: passo 1 — % modelos nas subcategorias em vez de %.', v_n, c_n_modelos; END IF;

  -- 2. cada produto, pelo nome: uma linha de texto por produto, campos separados por «|» (vazio = sem valor):
  -- nome | sub | modelo | custo | pvp | marca | fornecedor | código do fornecedor | unidade | atributos («Atributo=Opção;…») |
  -- unidade da medida
  CREATE TEMP TABLE _trv (nome text NOT NULL, sub text NOT NULL, numero smallint NOT NULL, custo numeric, pvp numeric,
                          marca integer NOT NULL, fornecedor integer NOT NULL, cod_forn text, unidade text NOT NULL,
                          attrs text NOT NULL, med_u text) ON COMMIT DROP;
  INSERT INTO _trv (nome, sub, numero, custo, pvp, marca, fornecedor, cod_forn, unidade, attrs, med_u)
  SELECT f[1], f[2], f[3]::smallint, nullif(f[4], '')::numeric, nullif(f[5], '')::numeric, f[6]::integer, f[7]::integer,
         nullif(f[8], ''), f[9], f[10], nullif(f[11], '')
  FROM (SELECT string_to_array(s, '|') AS f
        FROM regexp_split_to_table($linhas$
Revestimento CERÂMICO LAMINADO CAPRAIA Polido 1200x2600x5,6|CL|1|43.75|72.92|1|1||m2|Acabamento=Polido;Medida=1200 × 2600 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CAPRAIA Polido 1200x1200x5,6|CL|1|42.25|70.42|1|1||m2|Acabamento=Polido;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CAPRAIA Polido 600x1200x5,6|CL|1|42.25|70.42|1|1||m2|Acabamento=Polido;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CAMOUFLAGE 1200x2780x5,6|CL|2|37.02|61.7|1|1||m2|Acabamento=Natural;Medida=1200 × 2780 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CAMOUFLAGE 1200x2780x5,6 Pul.|CL|2|43.99|73.32|1|1||m2|Acabamento=Polido;Medida=1200 × 2780 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CAMOUFLAGE 1200x1200x5,6|CL|2|27.75|46.25|1|1||m2|Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CAMOUFLAGE 1200x1200x5,6 Pul.|CL|2|42.25|70.42|1|1||m2|Acabamento=Polido;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CAMOUFLAGE 600x1200x5,6|CL|2|27.75|46.25|1|1||m2|Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CAMOUFLAGE 600x1200x5,6 Pul.|CL|2|42.25|70.42|1|1||m2|Acabamento=Polido;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CANELA ROMA 1200x2780x5,6|CL|3|37.02|61.7|1|1||m2|Acabamento=Natural;Medida=1200 × 2780 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CANELA ROMA 1200x1200x5,6|CL|3|27.75|46.25|1|1||m2|Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CANELA ROMA 600x1200x5,6|CL|3|27.75|46.25|1|1||m2|Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CANELA ROMA 1600x1600x8|CL|3|35.5|59.17|1|1||m2|Acabamento=Natural;Medida=1600 × 1600 × 8 mm|mm
Revestimento CERÂMICO LAMINADO ANKARA 1200x2780x5,6 Pul.|CL|4|54|90|1|1||m2|Acabamento=Polido;Medida=1200 × 2780 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO ANKARA 1200x2600x5,6 Pul.|CL|4|54|90|1|1||m2|Acabamento=Polido;Medida=1200 × 2600 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO ANKARA 1200x1200x5,6 Pul.|CL|4|42.25|70.42|1|1||m2|Acabamento=Polido;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO ANKARA 600x1200x5,6 Pul.|CL|4|42.25|70.42|1|1||m2|Acabamento=Polido;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO ARLES ARENA 1200x3600x5,6|CL|5|40|66.67|1|1||m2|Cor=ARENA;Acabamento=Natural;Medida=1200 × 3600 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO ARLES GRIS 1200x3600x5,6|CL|5|40|66.67|1|1||m2|Cor=GRIS;Acabamento=Natural;Medida=1200 × 3600 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO ARLES ARENA 1200x2600x5,6|CL|5|33.5|55.83|1|1||m2|Cor=ARENA;Acabamento=Natural;Medida=1200 × 2600 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO ARLES GRIS 1200x2600x5,6|CL|5|33.5|55.83|1|1||m2|Cor=GRIS;Acabamento=Natural;Medida=1200 × 2600 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO ARLES ARENA 1000x3000x5,6|CL|5|36.5|60.83|1|1||m2|Cor=ARENA;Acabamento=Natural;Medida=1000 × 3000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO ARLES GRIS 1000x3000x5,6|CL|5|36.5|60.83|1|1||m2|Cor=GRIS;Acabamento=Natural;Medida=1000 × 3000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO ARLES ARENA 1200x1200x5,6|CL|5|27.75|46.25|1|1||m2|Cor=ARENA;Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO ARLES GRIS 1200x1200x5,6|CL|5|27.75|46.25|1|1||m2|Cor=GRIS;Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO ARLES ARENA 600x1200x5,6|CL|5|27.75|46.25|1|1||m2|Cor=ARENA;Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO ARLES GRIS 600x1200x5,6|CL|5|27.75|46.25|1|1||m2|Cor=GRIS;Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO BLUE STONE 1200x3600x5,6|CL|6|40|66.67|1|1||m2|Acabamento=Natural;Medida=1200 × 3600 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO BLUE STONE 1200x2600x3,5|CL|6|33.75|56.25|1|1||m2|Acabamento=Natural;Medida=1200 × 2600 × 3,5 mm|mm
Revestimento CERÂMICO LAMINADO BLUE STONE 1000x3000x5,6|CL|6|36.5|60.83|1|1||m2|Acabamento=Natural;Medida=1000 × 3000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO BLUE STONE 1000x3000x3,5|CL|6|33.65|56.08|1|1||m2|Acabamento=Natural;Medida=1000 × 3000 × 3,5 mm|mm
Revestimento CERÂMICO LAMINADO BLUE STONE 1200x1200x5,6|CL|6|27.75|46.25|1|1||m2|Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO BLUE STONE 1000x1000x5,6|CL|6|27.75|46.25|1|1||m2|Acabamento=Natural;Medida=1000 × 1000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO BLUE STONE 600x1200x5,6|CL|6|27.75|46.25|1|1||m2|Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO BLUE STONE 500x1000x5,6|CL|6|27.75|46.25|1|1||m2|Acabamento=Natural;Medida=500 × 1000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO OXIDO 1200x2600x3,5|CL|7|30.75|51.25|1|1||m2|Acabamento=Natural;Medida=1200 × 2600 × 3,5 mm|mm
Revestimento CERÂMICO LAMINADO OXIDO 1000x3000x3,5|CL|7|31|51.67|1|1||m2|Acabamento=Natural;Medida=1000 × 3000 × 3,5 mm|mm
Revestimento CERÂMICO LAMINADO OXIDO 1200x1200x5,6|CL|7|27.25|45.42|1|1||m2|Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO OXIDO 600x1200x5,6|CL|7|27.25|45.42|1|1||m2|Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO RIBERA MARFIL 1200x2780x5,6|CL|8|37.02|61.7|1|1||m2|Cor=Marfil;Acabamento=Natural;Medida=1200 × 2780 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO RIBERA MARFIL 1000x3000x3,5|CL|8|33.65|56.08|1|1||m2|Cor=Marfil;Acabamento=Natural;Medida=1000 × 3000 × 3,5 mm|mm
Revestimento CERÂMICO LAMINADO RIBERA MARFIL 1200x1200x5,6|CL|8|27.75|46.25|1|1||m2|Cor=Marfil;Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO RIBERA MARFIL 600x1200x5,6|CL|8|27.75|46.25|1|1||m2|Cor=Marfil;Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO BLUE ROMA 1200x2780x5,6|CL|9|37.02|61.7|1|1||m2|Acabamento=Natural;Medida=1200 × 2780 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO BLUE ROMA 1200x1200x5,6|CL|9|27.75|46.25|1|1||m2|Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO BLUE ROMA 600x1200x5,6|CL|9|27.75|46.25|1|1||m2|Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CALACATA BLACK A 1200x2600x5,6|CL|10|42|70|1|1||m2|Acabamento=Natural;Medida=1200 × 2600 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CALACATA BLACK A 1200x2600x5,6 Pul.|CL|10|62|103.33|1|1||m2|Acabamento=Polido;Medida=1200 × 2600 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CALACATA BLACK A 1000x3000x5,6|CL|10|41.75|69.58|1|1||m2|Acabamento=Natural;Medida=1000 × 3000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CALACATA BLACK A 1000x3000x5,6 Pul.|CL|10|61.5|102.5|1|1||m2|Acabamento=Polido;Medida=1000 × 3000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CALACATA BLACK B 1200x2600x5,6|CL|11|42|70|1|1||m2|Acabamento=Natural;Medida=1200 × 2600 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CALACATA BLACK B 1200x2600x5,6 Pul.|CL|11|62|103.33|1|1||m2|Acabamento=Polido;Medida=1200 × 2600 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CALACATA BLACK B 1000x3000x5,6|CL|11|41.75|69.58|1|1||m2|Acabamento=Natural;Medida=1000 × 3000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO CALACATA BLACK B 1000x3000x5,6 Pul.|CL|11|61.5|102.5|1|1||m2|Acabamento=Polido;Medida=1000 × 3000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE ARENA 1200x2780x5,6|CL|12|37.02|61.7|1|1||m2|Cor=ARENA;Acabamento=Natural;Medida=1200 × 2780 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE ARENA 1000x3000x3,5|CL|12|33.65|56.08|1|1||m2|Cor=ARENA;Acabamento=Natural;Medida=1000 × 3000 × 3,5 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE ARENA 1000x3000x5,6|CL|12|36.5|60.83|1|1||m2|Cor=ARENA;Acabamento=Natural;Medida=1000 × 3000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE ARENA 1200x1200x5,6|CL|12|27.75|46.25|1|1||m2|Cor=ARENA;Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE ARENA 600x1200x5,6|CL|12|27.75|46.25|1|1||m2|Cor=ARENA;Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE ARENA 1600x1600x8|CL|12|35.5|59.17|1|1||m2|Cor=ARENA;Acabamento=Natural;Medida=1600 × 1600 × 8 mm|mm
Revestimento PORCELÂNICO HABANA BLANCO 60x120|PRC|1|13.45|22.42|2|1|43HB49R|m2|Cor=Branco;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO HABANA BLANCO 60x60|PRC|1|11.5|19.17|2|1|82HB45R|m2|Cor=Branco;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO HABANA BLANCO 80x80|PRC|1|13.45|22.42|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO DOMUS BLANCO 30x60|PRC|2|11.5|19.17|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS BLANCO 30x60 Anti.|PRC|2|14.5|24.17|2|1||m2|Cor=Branco;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS BLANCO 60x60|PRC|2|11.5|19.17|2|1|82D145R|m2|Cor=Branco;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS BLANCO 60x60 Anti.|PRC|2|14.5|24.17|2|1||m2|Cor=Branco;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS BLANCO 60x120|PRC|2|13.45|22.42|2|1|43D149R|m2|Cor=Branco;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO DOMUS BLANCO 60x120 Anti.|PRC|2|16.45|27.42|2|1||m2|Cor=Branco;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO DOMUS BLANCO 80x80|PRC|2|13.45|22.42|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO DOMUS BLANCO 80x80 Anti.|PRC|2|16.45|27.42|2|1||m2|Cor=Branco;Acabamento=Antiderrapante;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO BRERA BLANCO 30x60 Rect.|PRC|3|11.5|19.17|2|1|46RA42R|m2|Cor=Branco;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO BRERA BLANCO 45x45|PRC|4|11.25|18.75|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=45 × 45 cm|cm
Revestimento PORCELÂNICO BRERA BLANCO 60x60 Rect.|PRC|3|11.5|19.17|2|1|62RA45R|m2|Cor=Branco;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO BRERA BLANCO 80x80|PRC|4|13.45|22.42|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO MELBOURNE BLANCO 30x60|PRC|5|11.5|19.17|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE BLANCO 30x60 Anti.|PRC|5|14.5|24.17|2|1||m2|Cor=Branco;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE BLANCO 45x45|PRC|5|11.25|18.75|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=45 × 45 cm|cm
Revestimento PORCELÂNICO MELBOURNE BLANCO 31,5x100|PRC|5|12.1|20.17|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=31,5 × 100 cm|cm
Revestimento PORCELÂNICO MELBOURNE BLANCO 45x120|PRC|5|15.3|25.5|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE BLANCO 60x60|PRC|5|11.5|19.17|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE BLANCO 60x60 Anti.|PRC|5|14.5|24.17|2|1||m2|Cor=Branco;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE BLANCO 60x120|PRC|5|13.45|22.42|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE BLANCO 60x120 Anti.|PRC|5|16.45|27.42|2|1||m2|Cor=Branco;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE BLANCO 80x80|PRC|5|13.45|22.42|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO MELBOURNE BLANCO 80x80 Anti.|PRC|5|16.45|27.42|2|1||m2|Cor=Branco;Acabamento=Antiderrapante;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO MELBOURNE BLANCO 120x120|PRC|5|18|30|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE BLANCO 120x120 Anti.|PRC|5|21|35|2|1||m2|Cor=Branco;Acabamento=Antiderrapante;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA BLANCO 30x60|PRC|6|11.5|19.17|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA BLANCO 30x60 Anti.|PRC|6|14.5|24.17|2|1||m2|Cor=Branco;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA BLANCO 60x60|PRC|6|11.5|19.17|2|1|62V245R|m2|Cor=Branco;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA BLANCO 60x60 Anti.|PRC|6|14.5|24.17|2|1||m2|Cor=Branco;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA BLANCO 60x120|PRC|6|13.45|22.42|2|1|44V249R|m2|Cor=Branco;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA BLANCO 60x120 Anti.|PRC|6|16.45|27.42|2|1||m2|Cor=Branco;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA BLANCO 80x80|PRC|6|13.45|22.42|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO VALONIA BLANCO 120x120|PRC|6|18|30|2|1||m2|Cor=Branco;Acabamento=Natural;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA BLANCO 120x120 Anti.|PRC|6|21|35|2|1||m2|Cor=Branco;Acabamento=Antiderrapante;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO PRIORATO ALERCE 19,5x120|PRC|7|13.45|22.42|2|1|19FU29T|m2|Cor=Alerce;Acabamento=Natural;Medida=19,5 × 120 cm|cm
Revestimento PORCELÂNICO PRIORATO ALERCE 19,5x120 Anti.|PRC|7|16.45|27.42|2|1||m2|Cor=Alerce;Acabamento=Antiderrapante;Medida=19,5 × 120 cm|cm
Revestimento CERÂMICO ATREZO 30x60|CR|1|9.95|16.58|3|1||m2|Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento CERÂMICO ATREZO 45x120|CR|1|16.35|27.25|3|1|64TZ708|m2|Cor=ARENA;Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento CERÂMICO BAVIERA 45x120|CR|2|16.35|27.25|3|1|64VI408|m2|Cor=Branco;Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento CERÂMICO MALMO ROBLE 45x120|CR|3|18.35|30.58|3|1|64E2228|m2|Cor=Roble;Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento CERÂMICO SIROS BLANCO 60x120|CR|4|18.15|30.25|3|1||m2|Cor=Branco;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento CERÂMICO TASOS BLANCO 60x120|CR|5|20.15|33.58|3|1||m2|Cor=Branco;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento CERÂMICO GRACIA BLANCO 7,5x30|CR|6|18.5|30.83|3|1|06DGR40|m2|Cor=Branco;Acabamento=Natural;Medida=7,5 × 30 cm|cm
Revestimento CERÂMICO LUCIA BLANCO 7,5x30|CR|7|18.5|30.83|3|1||m2|Cor=Branco;Acabamento=Natural;Medida=7,5 × 30 cm|cm
Revestimento CERÂMICO VOLTERRA Rev.|CR|8|13.25|22.08|3|1||m2|Acabamento=Natural;Aplicação=Parede|
Revestimento PORCELÂNICO SAJONIA FRESNO 14,5x120|PRC|8|15.1|25.17|3|1|19SJ59L|m2|Cor=Fresno;Acabamento=Natural;Medida=14,5 × 120 cm|cm
Revestimento PORCELÂNICO SAJONIA FRESNO 19,5x120|PRC|8|15.1|25.17|3|1|19SJ59T|m2|Cor=Fresno;Acabamento=Natural;Medida=19,5 × 120 cm|cm
Revestimento PORCELÂNICO SAJONIA FRESNO 19,5x120 Anti.|PRC|8|18.1|30.17|3|1||m2|Cor=Fresno;Acabamento=Antiderrapante;Medida=19,5 × 120 cm|cm
Revestimento PORCELÂNICO VOLTERRA Pav. 119x119 Pul.|PRC|9|24.5|40.83|3|1|44V149P|m2|Cor=Branco;Acabamento=Polido;Aplicação=Pavimento;Medida=119 × 119 cm|cm
Revestimento PORCELÂNICO VOLTERRA Pav. 120x120|PRC|9|20.5|34.17|3|1||m2|Acabamento=Natural;Aplicação=Pavimento;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO VOLTERRA Pav. 30x60|PRC|9|13.6|22.67|3|1||m2|Acabamento=Natural;Aplicação=Pavimento;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO VOLTERRA Pav. 59x119|PRC|9|20.75|34.58|3|1||m2|Acabamento=Natural;Aplicação=Pavimento;Medida=59 × 119 cm|cm
Revestimento PORCELÂNICO VOLTERRA Pav. 60x120|PRC|9|16.75|27.92|3|1||m2|Acabamento=Natural;Aplicação=Pavimento;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO VOLTERRA Pav. 80x80|PRC|9|16.75|27.92|3|1|81V146R|m2|Cor=Branco;Acabamento=Natural;Aplicação=Pavimento;Medida=80 × 80 cm|cm
Revestimento CERÂMICO LAMINADO RIBERA BLANCO 1200x2780x5,6|CL|8|37.02|61.7|1|1||m2|Cor=Branco;Acabamento=Natural;Medida=1200 × 2780 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO RIBERA BLANCO 1000x3000x3,5|CL|8|33.65|56.08|1|1||m2|Cor=Branco;Acabamento=Natural;Medida=1000 × 3000 × 3,5 mm|mm
Revestimento CERÂMICO LAMINADO RIBERA BLANCO 1200x1200x5,6|CL|8|27.75|46.25|1|1||m2|Cor=Branco;Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO RIBERA BLANCO 600x1200x5,6|CL|8|27.75|46.25|1|1||m2|Cor=Branco;Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE MARFIL 1200x2780x5,6|CL|12|37.02|61.7|1|1||m2|Cor=Marfil;Acabamento=Natural;Medida=1200 × 2780 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE MARFIL 1000x3000x3,5|CL|12|33.65|56.08|1|1||m2|Cor=Marfil;Acabamento=Natural;Medida=1000 × 3000 × 3,5 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE MARFIL 1000x3000x5,6|CL|12|36.5|60.83|1|1||m2|Cor=Marfil;Acabamento=Natural;Medida=1000 × 3000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE MARFIL 1200x1200x5,6|CL|12|27.75|46.25|1|1||m2|Cor=Marfil;Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE MARFIL 600x1200x5,6|CL|12|27.75|46.25|1|1||m2|Cor=Marfil;Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE MARFIL 1600x1600x8|CL|12|35.5|59.17|1|1||m2|Cor=Marfil;Acabamento=Natural;Medida=1600 × 1600 × 8 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE SIENA 1200x2780x5,6|CL|12|37.02|61.7|1|1||m2|Cor=Siena;Acabamento=Natural;Medida=1200 × 2780 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE SIENA 1000x3000x3,5|CL|12|33.65|56.08|1|1||m2|Cor=Siena;Acabamento=Natural;Medida=1000 × 3000 × 3,5 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE SIENA 1000x3000x5,6|CL|12|36.5|60.83|1|1||m2|Cor=Siena;Acabamento=Natural;Medida=1000 × 3000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE SIENA 1200x1200x5,6|CL|12|27.75|46.25|1|1||m2|Cor=Siena;Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE SIENA 600x1200x5,6|CL|12|27.75|46.25|1|1||m2|Cor=Siena;Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE SIENA 1600x1600x8|CL|12|35.5|59.17|1|1||m2|Cor=Siena;Acabamento=Natural;Medida=1600 × 1600 × 8 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE CEMENTO 1200x2780x5,6|CL|12|37.02|61.7|1|1||m2|Cor=Cemento;Acabamento=Natural;Medida=1200 × 2780 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE CEMENTO 1000x3000x3,5|CL|12|33.65|56.08|1|1||m2|Cor=Cemento;Acabamento=Natural;Medida=1000 × 3000 × 3,5 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE CEMENTO 1000x3000x5,6|CL|12|36.5|60.83|1|1||m2|Cor=Cemento;Acabamento=Natural;Medida=1000 × 3000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE CEMENTO 1200x1200x5,6|CL|12|27.75|46.25|1|1||m2|Cor=Cemento;Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE CEMENTO 600x1200x5,6|CL|12|27.75|46.25|1|1||m2|Cor=Cemento;Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE CEMENTO 1600x1600x8|CL|12|35.5|59.17|1|1||m2|Cor=Cemento;Acabamento=Natural;Medida=1600 × 1600 × 8 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE SAGE 1200x2780x5,6|CL|12|37.02|61.7|1|1||m2|Cor=Sage;Acabamento=Natural;Medida=1200 × 2780 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE SAGE 1000x3000x3,5|CL|12|33.65|56.08|1|1||m2|Cor=Sage;Acabamento=Natural;Medida=1000 × 3000 × 3,5 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE SAGE 1000x3000x5,6|CL|12|36.5|60.83|1|1||m2|Cor=Sage;Acabamento=Natural;Medida=1000 × 3000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE SAGE 1200x1200x5,6|CL|12|27.75|46.25|1|1||m2|Cor=Sage;Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE SAGE 600x1200x5,6|CL|12|27.75|46.25|1|1||m2|Cor=Sage;Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE SAGE 1600x1600x8|CL|12|35.5|59.17|1|1||m2|Cor=Sage;Acabamento=Natural;Medida=1600 × 1600 × 8 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE COBALTO 1200x2780x5,6|CL|12|37.02|61.7|1|1||m2|Cor=Cobalto;Acabamento=Natural;Medida=1200 × 2780 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE COBALTO 1000x3000x3,5|CL|12|33.65|56.08|1|1||m2|Cor=Cobalto;Acabamento=Natural;Medida=1000 × 3000 × 3,5 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE COBALTO 1000x3000x5,6|CL|12|36.5|60.83|1|1||m2|Cor=Cobalto;Acabamento=Natural;Medida=1000 × 3000 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE COBALTO 1200x1200x5,6|CL|12|27.75|46.25|1|1||m2|Cor=Cobalto;Acabamento=Natural;Medida=1200 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE COBALTO 600x1200x5,6|CL|12|27.75|46.25|1|1||m2|Cor=Cobalto;Acabamento=Natural;Medida=600 × 1200 × 5,6 mm|mm
Revestimento CERÂMICO LAMINADO SURFACE COBALTO 1600x1600x8|CL|12|35.5|59.17|1|1||m2|Cor=Cobalto;Acabamento=Natural;Medida=1600 × 1600 × 8 mm|mm
Revestimento PORCELÂNICO MELBOURNE GRIS 30x60|PRC|5|11.5|19.17|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE GRIS 30x60 Anti.|PRC|5|14.5|24.17|2|1||m2|Cor=GRIS;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE GRIS 45x45|PRC|5|11.25|18.75|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=45 × 45 cm|cm
Revestimento PORCELÂNICO MELBOURNE GRIS 31,5x100|PRC|5|12.1|20.17|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=31,5 × 100 cm|cm
Revestimento PORCELÂNICO MELBOURNE GRIS 45x120|PRC|5|15.3|25.5|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE GRIS 60x60|PRC|5|11.5|19.17|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE GRIS 60x60 Anti.|PRC|5|14.5|24.17|2|1||m2|Cor=GRIS;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE GRIS 60x120|PRC|5|13.45|22.42|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE GRIS 60x120 Anti.|PRC|5|16.45|27.42|2|1||m2|Cor=GRIS;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE GRIS 80x80|PRC|5|13.45|22.42|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO MELBOURNE GRIS 80x80 Anti.|PRC|5|16.45|27.42|2|1||m2|Cor=GRIS;Acabamento=Antiderrapante;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO MELBOURNE GRIS 120x120|PRC|5|18|30|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE GRIS 120x120 Anti.|PRC|5|21|35|2|1||m2|Cor=GRIS;Acabamento=Antiderrapante;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE MARFIL 30x60|PRC|5|11.5|19.17|2|1||m2|Cor=Marfil;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE MARFIL 30x60 Anti.|PRC|5|14.5|24.17|2|1||m2|Cor=Marfil;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE MARFIL 45x45|PRC|5|11.25|18.75|2|1||m2|Cor=Marfil;Acabamento=Natural;Medida=45 × 45 cm|cm
Revestimento PORCELÂNICO MELBOURNE MARFIL 31,5x100|PRC|5|12.1|20.17|2|1||m2|Cor=Marfil;Acabamento=Natural;Medida=31,5 × 100 cm|cm
Revestimento PORCELÂNICO MELBOURNE MARFIL 45x120|PRC|5|15.3|25.5|2|1||m2|Cor=Marfil;Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE MARFIL 60x60|PRC|5|11.5|19.17|2|1||m2|Cor=Marfil;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE MARFIL 60x60 Anti.|PRC|5|14.5|24.17|2|1||m2|Cor=Marfil;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE MARFIL 60x120|PRC|5|13.45|22.42|2|1||m2|Cor=Marfil;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE MARFIL 60x120 Anti.|PRC|5|16.45|27.42|2|1||m2|Cor=Marfil;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE MARFIL 80x80|PRC|5|13.45|22.42|2|1||m2|Cor=Marfil;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO MELBOURNE MARFIL 80x80 Anti.|PRC|5|16.45|27.42|2|1||m2|Cor=Marfil;Acabamento=Antiderrapante;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO MELBOURNE MARFIL 120x120|PRC|5|18|30|2|1||m2|Cor=Marfil;Acabamento=Natural;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE MARFIL 120x120 Anti.|PRC|5|21|35|2|1||m2|Cor=Marfil;Acabamento=Antiderrapante;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE TAUPE 30x60|PRC|5|11.5|19.17|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE TAUPE 30x60 Anti.|PRC|5|14.5|24.17|2|1||m2|Cor=Taupe;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE TAUPE 45x45|PRC|5|11.25|18.75|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=45 × 45 cm|cm
Revestimento PORCELÂNICO MELBOURNE TAUPE 31,5x100|PRC|5|12.1|20.17|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=31,5 × 100 cm|cm
Revestimento PORCELÂNICO MELBOURNE TAUPE 45x120|PRC|5|15.3|25.5|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE TAUPE 60x60|PRC|5|11.5|19.17|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE TAUPE 60x60 Anti.|PRC|5|14.5|24.17|2|1||m2|Cor=Taupe;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE TAUPE 60x120|PRC|5|13.45|22.42|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE TAUPE 60x120 Anti.|PRC|5|16.45|27.42|2|1||m2|Cor=Taupe;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE TAUPE 80x80|PRC|5|13.45|22.42|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO MELBOURNE TAUPE 80x80 Anti.|PRC|5|16.45|27.42|2|1||m2|Cor=Taupe;Acabamento=Antiderrapante;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO MELBOURNE TAUPE 120x120|PRC|5|18|30|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE TAUPE 120x120 Anti.|PRC|5|21|35|2|1||m2|Cor=Taupe;Acabamento=Antiderrapante;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE ANTRACITE 30x60|PRC|5|11.5|19.17|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE ANTRACITE 30x60 Anti.|PRC|5|14.5|24.17|2|1||m2|Cor=Antracite;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE ANTRACITE 45x45|PRC|5|11.25|18.75|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=45 × 45 cm|cm
Revestimento PORCELÂNICO MELBOURNE ANTRACITE 31,5x100|PRC|5|12.1|20.17|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=31,5 × 100 cm|cm
Revestimento PORCELÂNICO MELBOURNE ANTRACITE 45x120|PRC|5|15.3|25.5|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE ANTRACITE 60x60|PRC|5|11.5|19.17|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE ANTRACITE 60x60 Anti.|PRC|5|14.5|24.17|2|1||m2|Cor=Antracite;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO MELBOURNE ANTRACITE 60x120|PRC|5|13.45|22.42|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE ANTRACITE 60x120 Anti.|PRC|5|16.45|27.42|2|1||m2|Cor=Antracite;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE ANTRACITE 80x80|PRC|5|13.45|22.42|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO MELBOURNE ANTRACITE 80x80 Anti.|PRC|5|16.45|27.42|2|1||m2|Cor=Antracite;Acabamento=Antiderrapante;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO MELBOURNE ANTRACITE 120x120|PRC|5|18|30|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO MELBOURNE ANTRACITE 120x120 Anti.|PRC|5|21|35|2|1||m2|Cor=Antracite;Acabamento=Antiderrapante;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO HABANA COPPER 60x120|PRC|1|13.45|22.42|2|1|48HB29R|m2|Cor=Copper;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO HABANA COPPER 60x60|PRC|1|11.5|19.17|2|1|62HB25R|m2|Cor=Copper;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO HABANA COPPER 80x80|PRC|1|13.45|22.42|2|1||m2|Cor=Copper;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO HABANA CEMENTO 60x120|PRC|1|13.45|22.42|2|1|43HB19R|m2|Cor=Cemento;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO HABANA CEMENTO 60x60|PRC|1|11.5|19.17|2|1|62HB15R|m2|Cor=Cemento;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO HABANA CEMENTO 80x80|PRC|1|13.45|22.42|2|1||m2|Cor=Cemento;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO VALONIA GRIS 30x60|PRC|6|11.5|19.17|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA GRIS 30x60 Anti.|PRC|6|14.5|24.17|2|1||m2|Cor=GRIS;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA GRIS 60x60|PRC|6|11.5|19.17|2|1|62V235R|m2|Cor=GRIS;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA GRIS 60x60 Anti.|PRC|6|14.5|24.17|2|1||m2|Cor=GRIS;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA GRIS 60x120|PRC|6|13.45|22.42|2|1|43V239R|m2|Cor=GRIS;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA GRIS 60x120 Anti.|PRC|6|16.45|27.42|2|1||m2|Cor=GRIS;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA GRIS 80x80|PRC|6|13.45|22.42|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO VALONIA GRIS 120x120|PRC|6|18|30|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA GRIS 120x120 Anti.|PRC|6|21|35|2|1||m2|Cor=GRIS;Acabamento=Antiderrapante;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA BLUE 30x60|PRC|6|11.5|19.17|2|1||m2|Cor=Blue;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA BLUE 30x60 Anti.|PRC|6|14.5|24.17|2|1||m2|Cor=Blue;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA BLUE 60x60|PRC|6|11.5|19.17|2|1||m2|Cor=Blue;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA BLUE 60x60 Anti.|PRC|6|14.5|24.17|2|1||m2|Cor=Blue;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA BLUE 60x120|PRC|6|13.45|22.42|2|1|44V259R|m2|Cor=Blue;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA BLUE 60x120 Anti.|PRC|6|16.45|27.42|2|1||m2|Cor=Blue;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA BLUE 80x80|PRC|6|13.45|22.42|2|1||m2|Cor=Blue;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO VALONIA BLUE 120x120|PRC|6|18|30|2|1||m2|Cor=Blue;Acabamento=Natural;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA BLUE 120x120 Anti.|PRC|6|21|35|2|1||m2|Cor=Blue;Acabamento=Antiderrapante;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA TAUPE 30x60|PRC|6|11.5|19.17|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA TAUPE 30x60 Anti.|PRC|6|14.5|24.17|2|1||m2|Cor=Taupe;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA TAUPE 60x60|PRC|6|11.5|19.17|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA TAUPE 60x60 Anti.|PRC|6|14.5|24.17|2|1||m2|Cor=Taupe;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA TAUPE 60x120|PRC|6|13.45|22.42|2|1|44V229R|m2|Cor=Taupe;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA TAUPE 60x120 Anti.|PRC|6|16.45|27.42|2|1||m2|Cor=Taupe;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA TAUPE 80x80|PRC|6|13.45|22.42|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO VALONIA TAUPE 120x120|PRC|6|18|30|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA TAUPE 120x120 Anti.|PRC|6|21|35|2|1||m2|Cor=Taupe;Acabamento=Antiderrapante;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA ANTRACITE 30x60|PRC|6|11.5|19.17|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA ANTRACITE 30x60 Anti.|PRC|6|14.5|24.17|2|1||m2|Cor=Antracite;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA ANTRACITE 60x60|PRC|6|11.5|19.17|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA ANTRACITE 60x60 Anti.|PRC|6|14.5|24.17|2|1||m2|Cor=Antracite;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO VALONIA ANTRACITE 60x120|PRC|6|13.45|22.42|2|1|43V269R|m2|Cor=Antracite;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA ANTRACITE 60x120 Anti.|PRC|6|16.45|27.42|2|1||m2|Cor=Antracite;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA ANTRACITE 80x80|PRC|6|13.45|22.42|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO VALONIA ANTRACITE 120x120|PRC|6|18|30|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO VALONIA ANTRACITE 120x120 Anti.|PRC|6|21|35|2|1||m2|Cor=Antracite;Acabamento=Antiderrapante;Medida=120 × 120 cm|cm
Revestimento PORCELÂNICO DOMUS GRIS 30x60|PRC|2|11.5|19.17|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS GRIS 30x60 Anti.|PRC|2|14.5|24.17|2|1||m2|Cor=GRIS;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS GRIS 60x60|PRC|2|11.5|19.17|2|1|82D135R|m2|Cor=GRIS;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS GRIS 60x60 Anti.|PRC|2|14.5|24.17|2|1||m2|Cor=GRIS;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS GRIS 60x120|PRC|2|13.45|22.42|2|1|43D139R|m2|Cor=GRIS;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO DOMUS GRIS 60x120 Anti.|PRC|2|16.45|27.42|2|1||m2|Cor=GRIS;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO DOMUS GRIS 80x80|PRC|2|13.45|22.42|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO DOMUS GRIS 80x80 Anti.|PRC|2|16.45|27.42|2|1||m2|Cor=GRIS;Acabamento=Antiderrapante;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO DOMUS ARENA 30x60|PRC|2|11.5|19.17|2|1||m2|Cor=ARENA;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS ARENA 30x60 Anti.|PRC|2|14.5|24.17|2|1||m2|Cor=ARENA;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS ARENA 60x60|PRC|2|11.5|19.17|2|1|82D175R|m2|Cor=ARENA;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS ARENA 60x60 Anti.|PRC|2|14.5|24.17|2|1||m2|Cor=ARENA;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS ARENA 60x120|PRC|2|13.45|22.42|2|1|43D179R|m2|Cor=ARENA;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO DOMUS ARENA 60x120 Anti.|PRC|2|16.45|27.42|2|1||m2|Cor=ARENA;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO DOMUS ARENA 80x80|PRC|2|13.45|22.42|2|1||m2|Cor=ARENA;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO DOMUS ARENA 80x80 Anti.|PRC|2|16.45|27.42|2|1||m2|Cor=ARENA;Acabamento=Antiderrapante;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO DOMUS TAUPE 30x60|PRC|2|11.5|19.17|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS TAUPE 30x60 Anti.|PRC|2|14.5|24.17|2|1||m2|Cor=Taupe;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS TAUPE 60x60|PRC|2|11.5|19.17|2|1|82D125R|m2|Cor=Taupe;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS TAUPE 60x60 Anti.|PRC|2|14.5|24.17|2|1||m2|Cor=Taupe;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS TAUPE 60x120|PRC|2|13.45|22.42|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO DOMUS TAUPE 60x120 Anti.|PRC|2|16.45|27.42|2|1||m2|Cor=Taupe;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO DOMUS TAUPE 80x80|PRC|2|13.45|22.42|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO DOMUS TAUPE 80x80 Anti.|PRC|2|16.45|27.42|2|1||m2|Cor=Taupe;Acabamento=Antiderrapante;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO DOMUS ANTRACITE 30x60|PRC|2|11.5|19.17|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS ANTRACITE 30x60 Anti.|PRC|2|14.5|24.17|2|1||m2|Cor=Antracite;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS ANTRACITE 60x60|PRC|2|11.5|19.17|2|1|62D165R|m2|Cor=Antracite;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS ANTRACITE 60x60 Anti.|PRC|2|14.5|24.17|2|1||m2|Cor=Antracite;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS ANTRACITE 60x120|PRC|2|13.45|22.42|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO DOMUS ANTRACITE 60x120 Anti.|PRC|2|16.45|27.42|2|1||m2|Cor=Antracite;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO DOMUS ANTRACITE 80x80|PRC|2|13.45|22.42|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO DOMUS ANTRACITE 80x80 Anti.|PRC|2|16.45|27.42|2|1||m2|Cor=Antracite;Acabamento=Antiderrapante;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO DOMUS PLOMO 30x60|PRC|2|11.5|19.17|2|1||m2|Cor=Plomo;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS PLOMO 30x60 Anti.|PRC|2|14.5|24.17|2|1||m2|Cor=Plomo;Acabamento=Antiderrapante;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS PLOMO 60x60|PRC|2|11.5|19.17|2|1|82D155R|m2|Cor=Plomo;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS PLOMO 60x60 Anti.|PRC|2|14.5|24.17|2|1||m2|Cor=Plomo;Acabamento=Antiderrapante;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO DOMUS PLOMO 60x120|PRC|2|13.45|22.42|2|1|43D159R|m2|Cor=Plomo;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO DOMUS PLOMO 60x120 Anti.|PRC|2|16.45|27.42|2|1||m2|Cor=Plomo;Acabamento=Antiderrapante;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO DOMUS PLOMO 80x80|PRC|2|13.45|22.42|2|1||m2|Cor=Plomo;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO DOMUS PLOMO 80x80 Anti.|PRC|2|16.45|27.42|2|1||m2|Cor=Plomo;Acabamento=Antiderrapante;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO BRERA GRIS 30x60 Rect.|PRC|3|11.5|19.17|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO BRERA GRIS 45x45|PRC|4|11.25|18.75|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=45 × 45 cm|cm
Revestimento PORCELÂNICO BRERA GRIS 60x60 Rect.|PRC|3|11.5|19.17|2|1|52RA35R|m2|Cor=GRIS;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO BRERA GRIS 80x80|PRC|4|13.45|22.42|2|1||m2|Cor=GRIS;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO BRERA ARENA 30x60 Rect.|PRC|3|11.5|19.17|2|1||m2|Cor=ARENA;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO BRERA ARENA 45x45|PRC|4|11.25|18.75|2|1||m2|Cor=ARENA;Acabamento=Natural;Medida=45 × 45 cm|cm
Revestimento PORCELÂNICO BRERA ARENA 60x60 Rect.|PRC|3|11.5|19.17|2|1|62RA75R|m2|Cor=ARENA;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO BRERA ARENA 80x80|PRC|4|13.45|22.42|2|1||m2|Cor=ARENA;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO BRERA TAUPE 30x60 Rect.|PRC|3|11.5|19.17|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO BRERA TAUPE 45x45|PRC|4|11.25|18.75|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=45 × 45 cm|cm
Revestimento PORCELÂNICO BRERA TAUPE 60x60 Rect.|PRC|3|11.5|19.17|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO BRERA TAUPE 80x80|PRC|4|13.45|22.42|2|1||m2|Cor=Taupe;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO BRERA CEMENTO 30x60 Rect.|PRC|3|11.5|19.17|2|1||m2|Cor=Cemento;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO BRERA CEMENTO 45x45|PRC|4|11.25|18.75|2|1||m2|Cor=Cemento;Acabamento=Natural;Medida=45 × 45 cm|cm
Revestimento PORCELÂNICO BRERA CEMENTO 60x60 Rect.|PRC|3|11.5|19.17|2|1||m2|Cor=Cemento;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO BRERA CEMENTO 80x80|PRC|4|13.45|22.42|2|1||m2|Cor=Cemento;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO BRERA ANTRACITE 30x60 Rect.|PRC|3|11.5|19.17|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento PORCELÂNICO BRERA ANTRACITE 45x45|PRC|4|11.25|18.75|2|1|42RA-68|m2|Cor=Antracite;Acabamento=Natural;Medida=45 × 45 cm|cm
Revestimento PORCELÂNICO BRERA ANTRACITE 60x60 Rect.|PRC|3|11.5|19.17|2|1|62RA65R|m2|Cor=Antracite;Acabamento=Natural;Medida=60 × 60 cm|cm
Revestimento PORCELÂNICO BRERA ANTRACITE 80x80|PRC|4|13.45|22.42|2|1||m2|Cor=Antracite;Acabamento=Natural;Medida=80 × 80 cm|cm
Revestimento PORCELÂNICO SAJONIA ROBLE 14,5x120|PRC|8|15.1|25.17|3|1||m2|Cor=Roble;Acabamento=Natural;Medida=14,5 × 120 cm|cm
Revestimento PORCELÂNICO SAJONIA ROBLE 19,5x120|PRC|8|15.1|25.17|3|1|19SJ79T|m2|Cor=Roble;Acabamento=Natural;Medida=19,5 × 120 cm|cm
Revestimento PORCELÂNICO SAJONIA ROBLE 19,5x120 Anti.|PRC|8|18.1|30.17|3|1||m2|Cor=Roble;Acabamento=Antiderrapante;Medida=19,5 × 120 cm|cm
Revestimento PORCELÂNICO SAJONIA NOGAL 14,5x120|PRC|8|15.1|25.17|3|1||m2|Cor=Nogal;Acabamento=Natural;Medida=14,5 × 120 cm|cm
Revestimento PORCELÂNICO SAJONIA NOGAL 19,5x120|PRC|8|15.1|25.17|3|1|19SJ99T|m2|Cor=Nogal;Acabamento=Natural;Medida=19,5 × 120 cm|cm
Revestimento PORCELÂNICO SAJONIA NOGAL 19,5x120 Anti.|PRC|8|18.1|30.17|3|1||m2|Cor=Nogal;Acabamento=Antiderrapante;Medida=19,5 × 120 cm|cm
Revestimento PORCELÂNICO PRIORATO ROBLE 19,5x120|PRC|7|13.45|22.42|2|1|19FU79T|m2|Cor=Roble;Acabamento=Natural;Medida=19,5 × 120 cm|cm
Revestimento PORCELÂNICO PRIORATO ROBLE 19,5x120 Anti.|PRC|7|16.45|27.42|2|1||m2|Cor=Roble;Acabamento=Antiderrapante;Medida=19,5 × 120 cm|cm
Revestimento CERÂMICO MALMO FRESNO 45x120|CR|3|18.35|30.58|3|1|64E2528|m2|Cor=Fresno;Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento CERÂMICO ATREZO PALCO ARENA 30x60|CR|9|11.95|19.92|3|1||m2|Acabamento=Natural;Medida=30 × 60 cm|cm
Revestimento CERÂMICO ATREZO PALCO ARENA 45x120|CR|9|18.35|30.58|3|1|64TZ728|m2|Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento CERÂMICO BAVIERA BONN BLANCO 45x120|CR|10|18.35|30.58|3|1|64VI428|m2|Cor=Branco;Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento CERÂMICO BAVIERA MUNICH BLANCO 45x120|CR|11|18.35|30.58|3|1|64VI418|m2|Cor=Branco;Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento CERÂMICO SIROS SIENA 60x120|CR|4|18.15|30.25|3|1||m2|Cor=Siena;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento CERÂMICO SIROS MENTA 60x120|CR|4|18.15|30.25|3|1|97SO609|m2|Cor=Menta;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento CERÂMICO SIROS ÍNDIGO 60x120|CR|4|18.15|30.25|3|1|97SO509|m2|Cor=Índigo;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento CERÂMICO TASOS SIENA 60x120|CR|5|20.15|33.58|3|1||m2|Cor=Siena;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento CERÂMICO TASOS MENTA 60x120|CR|5|20.15|33.58|3|1|97SO159|m2|Cor=Menta;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento CERÂMICO TASOS ÍNDIGO 60x120|CR|5|20.15|33.58|3|1|97SO559|m2|Cor=Índigo;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento CERÂMICO LUCIA GRIS 7,5x30|CR|7|18.5|30.83|3|1|06DLU30|m2|Cor=GRIS;Acabamento=Natural;Medida=7,5 × 30 cm|cm
Revestimento CERÂMICO LUCIA TAUPE 7,5x30|CR|7|18.5|30.83|3|1|06DLU20|m2|Cor=Taupe;Acabamento=Natural;Medida=7,5 × 30 cm|cm
Revestimento CERÂMICO LUCIA PERLA 7,5x30|CR|7|18.5|30.83|3|1|06DLU00|m2|Cor=Perla;Acabamento=Natural;Medida=7,5 × 30 cm|cm
Revestimento CERÂMICO LUCIA STAGE 7,5x30|CR|12|18.5|30.83|3|1|06DLU60|m2|Acabamento=Natural;Medida=7,5 × 30 cm|cm
Revestimento CERÂMICO LUCIA MALVA 7,5x30|CR|7|18.5|30.83|3|1||m2|Cor=Malva;Acabamento=Natural;Medida=7,5 × 30 cm|cm
Revestimento CERÂMICO GRACIA NAVY 7,5x30|CR|6|18.5|30.83|3|1|06DGR50|m2|Cor=Navy;Acabamento=Natural;Medida=7,5 × 30 cm|cm
Revestimento CERÂMICO GRACIA CELESTE 7,5x30|CR|6|18.5|30.83|3|1|06DGR80|m2|Cor=Celeste;Acabamento=Natural;Medida=7,5 × 30 cm|cm
Revestimento CERÂMICO GRACIA PERLA 7,5x30|CR|6|18.5|30.83|3|1|06DGR00|m2|Cor=Perla;Acabamento=Natural;Medida=7,5 × 30 cm|cm
Revestimento CERÂMICO GRACIA ARENA 7,5x30|CR|6|18.5|30.83|3|1|06DGR70|m2|Cor=ARENA;Acabamento=Natural;Medida=7,5 × 30 cm|cm
Revestimento CERÂMICO GRACIA JADE 7,5x30|CR|6|18.5|30.83|3|1|06DGR60|m2|Cor=Jade;Acabamento=Natural;Medida=7,5 × 30 cm|cm
Revestimento SPC ARANCIO BEJE|SP|1|21.5|41|4|2||m2|Cor=Bege;Acabamento=Natural;Medida=182 × 1220 mm|mm
Revestimento SPC ARANCIO CINZA|SP|1|21.5|41|4|2||m2|Cor=Cinza;Acabamento=Natural;Medida=182 × 1220 mm|mm
Revestimento SPC ARANCIO TAUPE|SP|1|21.5|41|4|2||m2|Cor=Taupe;Acabamento=Natural|
Revestimento SPC ARANCIO CASTANHO|SP|1|21.5|41|4|2||m2|Cor=Castanho;Acabamento=Natural;Medida=182 × 1220 mm|mm
Revestimento SPC DORSET ROBLE 5,5mm|SP|2|21.5|41|5|3||m2|Cor=Roble;Acabamento=Natural|
Revestimento SPC SEVERN FRESNO 5,5mm|SP|3|21.5|41|5|3||m2|Cor=Fresno;Acabamento=Natural|
Revestimento SPC TERENT ABERTO 5,5mm|SP|4|21.5|41|5|3||m2|Acabamento=Natural|
Revestimento SPC CLYDE HUMO 5,5mm|SP|5|21.5|41|5|3|18CLY075441|m2|Acabamento=Natural|
Revestimento SPC ARLES ARENA 5,5mm|SP|6|21.5|41|5|3||m2|Cor=ARENA;Acabamento=Natural|
Revestimento SPC ARLES GRIS 5,5mm|SP|6|21.5|41|5|3||m2|Cor=GRIS;Acabamento=Natural|
Revestimento SPC LEVANTE 5,5mm|SP|7|21.5|41|5|3|47LEV025441|m2|Acabamento=Natural|
Revestimento SPC TURIA 5,5mm|SP|8|21.5|41|5|3||m2|Acabamento=Natural|
Revestimento SPC TORMES 5,5mm|SP|9|21.5|41|5|3||m2|Acabamento=Natural|
Rodapé SPC Branco 7 cm M/L|SP|10|3.36|5.6|5|3||ml|Cor=Branco;Acabamento=Natural|
Rodapé SPC Decorado M/L|SP|11|4.26|7.1|5|3|00NVZ000095|ml|Acabamento=Natural|
Revestimento SPC AVON ABETO 5,5mm|SP|12|21.5|41|5|3||m2|Cor=Abeto;Acabamento=Natural|
Revestimento SPC AVON NOGAL 5,5mm|SP|12|21.5|58|5|3||m2|Cor=Nogal;Acabamento=Natural|
Revestimento SPC DORSET FRESNO 5,5mm|SP|2|21.5|41|5|3||m2|Cor=Fresno;Acabamento=Natural|
Revestimento SPC ANETO 23x152,4|SP|13|21.5|41|5|3|23ANE025441|m2|Acabamento=Natural;Medida=23 × 152,4 cm|cm
Revestimento SPC SEVERN ROBLE 5,5mm|SP|3|21.5|41|5|3||m2|Cor=Roble;Acabamento=Natural|
Revestimento SPC NERVION 5,5mm|SP|14|21.5|41|5|3|23NER025411|m2|Acabamento=Natural|
Revestimento PORCELÂNICO ARMANI ORO BIANCO Polido 60x120|PRC|10|14|23.33|6|4|RA60120ORBP|m2|Acabamento=Polido;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO ARMANI CALACATA VENATTINO Polido 60x120|PRC|11|14|23.33|6|4|RA60120VTIP|m2|Acabamento=Polido;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO BLANCO PURO Polido 60x120|PRC|12|14|23.33|6|4|RBP60120|m2|Acabamento=Polido;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO BLANCO PURO Mate 60x120|PRC|12|14|23.33|6|4|RBP60120MT|m2|Acabamento=Mate;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO TRAVERTINO NAVONA BIANCO Polido 60x120|PRC|13|14|23.33|6|4|RTN60120PB|m2|Cor=Branco;Acabamento=Polido;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO TRAVERTINO NAVONA BIANCO Mate 60x120 (sem preço)|PRC|13|||6|4|RTN60120B|m2|Cor=Branco;Acabamento=Mate;Medida=60 × 120 cm|cm
Revestimento CERÂMICO LAMINADO ARLES BLANCO 60x120|CL|5|17.99|29.98|1|1|44RL49R|m2|Cor=Branco;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento CERÂMICO MALMO CIPRES 45x120|CR|3|18.35|30.58|3|1|64E2728|m2|Cor=Cipres;Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento CERÂMICO ATREZO BLANCO 45x120|CR|1|16.35|27.25|3|1|64TZ408|m2|Cor=Branco;Acabamento=Natural;Medida=45 × 120 cm|cm
Revestimento PORCELÂNICO VOLTERRA BEIGE 60x120|PRC|9|16.75|27.92|3|1|44V179R|m2|Cor=Bege;Acabamento=Natural;Medida=60 × 120 cm|cm
Revestimento PORCELÂNICO PRIORATO NOGAL 19,5x120|PRC|7|13.45|22.42|2|1|19FU99T|m2|Cor=Nogal;Acabamento=Natural;Medida=19,5 × 120 cm|cm
$linhas$, '\r?\n') AS s WHERE s <> '') x;
  IF (SELECT count(*) FROM _trv) <> c_total OR (SELECT count(DISTINCT e.nome) FROM _trv e) <> c_total THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — o teste tem % linhas.', (SELECT count(*) FROM _trv);
  END IF;
  CREATE TEMP TABLE _trv_marcas (n integer PRIMARY KEY, nome text) ON COMMIT DROP;
  INSERT INTO _trv_marcas (n, nome) VALUES (1, 'Coverlam'), (2, 'Bellacasa'), (3, 'Grespania'), (4, 'Materia SPC'), (5, 'Kerlux'), (6, 'Rubicer');
  CREATE TEMP TABLE _trv_forn (n integer PRIMARY KEY, nome text) ON COMMIT DROP;
  INSERT INTO _trv_forn (n, nome) VALUES (1, 'Grespania Ceramica'), (2, 'EAST COAST SPC, S.A.'), (3, 'NOVALAM INNOVACION, SA'), (4, 'RUBICER, Lda.');

  CREATE TEMP TABLE _trv_p ON COMMIT DROP AS
  SELECT e.*, p.id, p.sku, p.sku_gerado, p.category_id, p.subcategory_id, p.model_id, p.status::text AS status, p.tipo_catalogo,
         p.is_active, p.manages_stock, p.unidade AS p_unidade, p.uom_id, p.short_description, p.marca_livre, p.brand_id, p.supplier_id
  FROM _trv e
  LEFT JOIN products p ON p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted AND p.name = e.nome;
  -- os atributos de cada produto, pelo nome do atributo e da opção (sem acentos/maiúsculas), comparados como conjunto
  CREATE TEMP TABLE _trv_a ON COMMIT DROP AS
  SELECT e.id,
         (SELECT string_agg(z.k, ';' ORDER BY z.k) FROM (
            SELECT public.fn_cat_chave_opcao(split_part(s, '=', 1)) || '=' || public.fn_cat_chave_opcao(split_part(s, '=', 2)) AS k
            FROM regexp_split_to_table(e.attrs, ';') AS s WHERE s <> '') z) AS esperado,
         (SELECT string_agg(z.k, ';' ORDER BY z.k) FROM (
            SELECT public.fn_cat_chave_opcao(a.label::text) || '=' || public.fn_cat_chave_opcao(v.value_text::text) AS k
            FROM product_attribute_values v JOIN product_attributes a ON a.id = v.attribute_id WHERE v.product_id = e.id) z) AS gravado,
         (SELECT v.unit FROM product_attribute_values v JOIN product_attributes a ON a.id = v.attribute_id AND a.is_measurement
          WHERE v.product_id = e.id) AS med_u_gravada
  FROM _trv_p e WHERE e.id IS NOT NULL;

  SELECT count(*), string_agg(e.nome || coalesce(' [' || ta.esperado || ' ≠ ' || ta.gravado || ']', ''), ' | ') INTO v_n, v_txt
  FROM _trv_p e
  JOIN _trv_marcas bm ON bm.n = e.marca
  JOIN _trv_forn fm ON fm.n = e.fornecedor
  LEFT JOIN _trv_a ta ON ta.id = e.id
  LEFT JOIN product_categories sc ON sc.id = e.subcategory_id
  LEFT JOIN product_models pm ON pm.id = e.model_id
  WHERE NOT coalesce(
        e.sku_gerado AND e.category_id = v_cat AND sc.sigla = e.sub AND pm.numero = e.numero AND e.status = 'active'
        AND e.tipo_catalogo = 'produto' AND e.is_active AND e.manages_stock AND e.p_unidade = e.unidade AND e.uom_id IS NOT NULL
        AND e.short_description IS NULL
        AND e.marca_livre = bm.nome
        AND EXISTS (SELECT 1 FROM brands b WHERE b.id = e.brand_id AND b.organization_id = c_org AND b.name = bm.nome)
        AND EXISTS (SELECT 1 FROM suppliers s WHERE s.id = e.supplier_id AND s.organization_id = c_org
                    AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(fm.nome))
        -- os atributos: exatamente os do nome (e a medida na unidade certa)
        AND ta.esperado IS NOT DISTINCT FROM ta.gravado
        AND ta.med_u_gravada IS NOT DISTINCT FROM e.med_u
        -- preços: só custo e PVP, os que o Excel tem
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
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN _trv_p e ON e.id = v.product_id;
  IF v_n <> c_n_valores THEN RAISE EXCEPTION 'FALHOU: passo 2 — % valores de atributos em vez de %.', v_n, c_n_valores; END IF;

  -- 3. o SKU é o que a regra do Catálogo recalcula do que está gravado (todos)
  CREATE TEMP TABLE _trv_grupos ON COMMIT DROP AS
  SELECT a.id, a.is_measurement, (CASE WHEN NOT a.is_measurement THEN public.fn_cat_grupo_do_atributo(a.id, c_org) END) AS grupo
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL;
  ALTER TABLE _trv_grupos ADD PRIMARY KEY (id);
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
            JOIN _trv_grupos a ON a.id = v.attribute_id
            LEFT JOIN attribute_option_group_values o ON NOT a.is_measurement AND o.group_id = a.grupo AND o.value_text = v.value_text
            WHERE v.product_id = p.id)) AS pt) z
        WHERE p.organization_id = c_org AND p.subcategory_id = ANY (v_subs) AND NOT p.is_deleted) x
  WHERE x.calc IS DISTINCT FROM x.sku OR x.faltas <> '[]';
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 3 — % SKUs diferentes do recalculado: %', v_n, left(v_txt, 1500); END IF;

  -- 4. SKUs únicos, no formato, e com o número do modelo
  SELECT count(DISTINCT e.sku), count(*) FILTER (WHERE e.sku !~ ('^RV-' || e.sub || '-' || lpad(e.numero::text, 4, '0') || '(-[A-Z0-9]+){1,4}$'))
    INTO v_n, v_m
  FROM _trv_p e;
  IF v_n <> c_total OR v_m > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — % SKUs distintos (esperados %), % fora do formato RV-SUB-NNNN.', v_n, c_total, v_m;
  END IF;

  -- 5. siglas das subcategorias; atributos usados de lista, a entrar no SKU; opções usadas ativas e com sigla; Aplicação só no VOLTERRA
  SELECT string_agg(e.nome || ': ' || coalesce(c.sigla, 'sem subcategoria') || ' em vez de ' || e.sigla, '; ') INTO v_txt
  FROM (VALUES ('CR', 'Cerâmico', 32), ('CL', 'Cerâmico Laminado', 95), ('PRC', 'Porcelânico', 218), ('SP', 'SPC', 21)) AS e(sigla, nome, n)
  LEFT JOIN product_categories c ON c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
                                AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(e.nome)
  WHERE c.sigla IS DISTINCT FROM e.sigla;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — siglas das subcategorias: %', v_txt; END IF;
  SELECT string_agg(DISTINCT a.label::text, ', ') INTO v_txt
  FROM product_attribute_values v JOIN _trv_p e ON e.id = v.product_id JOIN product_attributes a ON a.id = v.attribute_id
  LEFT JOIN _trv_grupos g ON g.id = a.id
  LEFT JOIN attribute_option_group_values o ON NOT a.is_measurement AND o.group_id = g.grupo AND o.value_text = v.value_text
  WHERE NOT (a.organization_id = c_org AND a.deleted_at IS NULL AND coalesce(a.sku_entra, false) AND a.sku_ordem IS NOT NULL
             AND (a.is_measurement = (a.code::text = 'medida'))
             AND (a.is_measurement OR (o.id IS NOT NULL AND o.is_active AND o.sigla IS NOT NULL)));
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 5 — atributos ou opções fora do esperado: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM product_attribute_values v JOIN _trv_p e ON e.id = v.product_id JOIN product_attributes a ON a.id = v.attribute_id
  WHERE public.fn_cat_chave_opcao(a.label::text) = 'aplicacao'
    AND NOT (e.nome LIKE '%VOLTERRA Rev.%' OR e.nome LIKE '%VOLTERRA Pav.%');
  SELECT count(*) INTO v_m FROM _trv_p e WHERE (e.nome LIKE '%VOLTERRA Rev.%' OR e.nome LIKE '%VOLTERRA Pav.%')
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values v JOIN product_attributes a ON a.id = v.attribute_id
                    WHERE v.product_id = e.id AND public.fn_cat_chave_opcao(a.label::text) = 'aplicacao');
  IF v_n > 0 OR v_m > 0 THEN RAISE EXCEPTION 'FALHOU: passo 5 — Aplicação fora do VOLTERRA (%) ou VOLTERRA sem Aplicação (%).', v_n, v_m; END IF;

  -- 6. fornecedores e marcas, uma vez cada
  SELECT string_agg(e.nome || ' ×' || (SELECT count(*) FROM suppliers s WHERE s.organization_id = c_org AND s.deleted_at IS NULL
                                        AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.nome)), '; ') INTO v_txt
  FROM _trv_forn e
  WHERE (SELECT count(*) FROM suppliers s WHERE s.organization_id = c_org AND s.deleted_at IS NULL
         AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(e.nome)) <> 1;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: passo 6 — fornecedores: %', v_txt; END IF;
  SELECT string_agg(e.nome, '; ') INTO v_txt FROM _trv_marcas e
  WHERE (SELECT count(*) FROM brands b WHERE b.organization_id = c_org AND b.deleted_at IS NULL
         AND public.fn_cat_chave_opcao(b.name) = public.fn_cat_chave_opcao(e.nome)) <> 1;
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
    UNION ALL SELECT 'brands', count(*) FROM brands x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
    UNION ALL SELECT 'uom', count(*) FROM uom x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
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

  -- 8. cat_prever_sku_modelo (só leitura) como um membro da Mudelar com products.edit: 60 revestimentos e 25 de outras categorias
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
                             ORDER BY random() LIMIT 60) x)
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
    LEFT JOIN _trv_grupos g ON g.id = a.id
    LEFT JOIN attribute_option_group_values o ON NOT a.is_measurement AND o.group_id = g.grupo AND o.value_text = v.value_text
    WHERE v.product_id = r.id;
    v_prev := public.cat_prever_sku_modelo(c_org, r.category_id, r.subcategory_id, r.model_id, v_attrs, r.id);
    IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
      RAISE EXCEPTION 'FALHOU: passo 8 — cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_n < 85 THEN RAISE EXCEPTION 'FALHOU: passo 8 — só % produtos comparados (esperados 85).', v_n; END IF;

  -- 9. a linha consolidada da auditoria
  SELECT count(*) INTO v_n FROM entity_audit_log e
  WHERE e.organization_id = c_org AND e.source = 'migration:revestimentos_mudelar' AND e.table_name = 'products' AND e.record_id = v_cat;
  IF v_n < 1 THEN RAISE EXCEPTION 'FALHOU: passo 9 — a auditoria não tem a linha consolidada da importação.'; END IF;
END $t$;

SELECT 'OK: revestimentos da Mudelar (366 produtos, 51 modelos) conferidos nos passos 0 a 9.' AS resultado;

ROLLBACK;
