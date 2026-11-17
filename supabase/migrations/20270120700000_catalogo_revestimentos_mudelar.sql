-- =============================================================================
-- Catálogo — importação dos REVESTIMENTOS da MUDELAR («Revestimentos_Rev1.xlsx», folha «Folha1», 366 linhas, todas
-- ativas). Base de RH (uetjghdkwbywbftedtth). Ficheiro GERADO por script (gerar.js + parse.js) a partir do Excel: as
-- linhas de dados abaixo não se editam à mão — regeneram-se. Molde: 20270120300000 (móveis WC, set-based) e
-- 20270119800000 (mobiliário: unidade «ml» por fn_cat_unidade).
-- =============================================================================
--
-- Decisões do utilizador (17/11):
--   * Um produto por linha (Cerâmico 32, Cerâmico Laminado 95, Porcelânico 218, SPC 21). Categoria «Revestimentos» (RV); subcategorias Cerâmico (CR), Cerâmico
--     Laminado (CL), Porcelânico (PRC) e SPC (SP), procuradas pelo nome e criadas se faltarem. Espaços a mais limpos.
--   * Nome do produto = o do Excel («Revestimento PORCELÂNICO …»), só sem espaços a mais. O SKU antigo não se guarda.
--   * Modelo = o nome sem «Revestimento <subcategoria>», sem medida, cor, acabamento e «Rev.»/«Pav.»; «Rect.», «5,5mm» e
--     «7 cm M/L» ficam no modelo. 51 modelos; NNNN = ordem da 1.ª linha de cada modelo no Excel, por subcategoria.
--     Ficam inteiros, sem cor: CANELA ROMA, BLUE ROMA, BLUE STONE, CALACATA BLACK A/B, ATREZO PALCO ARENA, LUCIA STAGE,
--     TERENT ABERTO, CLYDE HUMO, ARMANI ORO BIANCO, ARMANI CALACATA VENATTINO (e BLANCO PURO, do mesmo tipo).
--   * Cor (atributo cor): separada só quando inequívoca; BLANCO/BIANCO → Branco, BEJE/BEIGE → Bege; as outras com o nome
--     do Excel, reutilizando a opção que já exista com o mesmo nome (sem acentos/maiúsculas: GRIS, ARENA, Antracite,
--     Nogal, Cinza…) e criando as que faltam. Sem cor no nome mas com cor na descrição do fornecedor: essa cor (ATREZO
--     45x120 → ARENA, BAVIERA → Branco, VOLTERRA Pav. 119x119 e 80x80 → Branco).
--   * Acabamento (atributo acabamento): «Anti.» → Antiderrapante, «Pul.»/«Polido» → Polido, «Mate» → Mate, nada →
--     Natural. As opções procuram-se pelo nome e criam-se se faltarem (Mate pode já vir de 20270120500000). Siglas
--     novas que não repetem nenhuma sigla da Cor (o SKU não fica ambíguo): Natural NAT, Polido PL, Antiderrapante AD,
--     Mate MAT (a mesma de 20270120500000); cores novas com 3 letras (ROB, FRE, MRF, TAU…); se uma estiver ocupada no
--     grupo, fn_cat_sigla_opcao_livre escolhe outra.
--   * Aplicação (atributo NOVO de lista, código aplicacao, entra no SKU, no fim da ordem): Parede (PAR) e Pavimento
--     (PAV); só o VOLTERRA (Rev. → Parede, Pav. → Pavimento). O VOLTERRA BEIGE fica sem Aplicação.
--   * Medida (atributo medida): 2D em cm (60x120, 31,5x100, 119x119…); laminados Coverlam 3D em mm (1200x2600x5,6);
--     ARANCIO com «182X1220» na descrição do fornecedor → 2D 182 × 1220 mm. Sem medida: o VOLTERRA Rev., o ARANCIO TAUPE,
--     os SPC 5,5mm e os 2 rodapés (nada se inventa).
--   * Unidade: m2 (criada por fn_cat_unidade se faltar) e ml (2 rodapés).
--   * Preços: custo = «Preço Compra», PVP = «Preço Venda», IVA 23; grossista e distribuidor a 0 → não se gravam.
--     Sem PVP (1): « (sem preço)» no nome e nenhum preço. As notas da coluna «Atributos» não vão para o produto.
--   * Marcas Bellacasa, Coverlam, Grespania, Kerlux, Rubicer (já existem) e «Materia SPC»: se não existir, a marca
--     «Materiaspc» (sem produtos) passa a chamar-se «Materia SPC»; se nenhuma existir, cria-se.
--   * Fornecedores reutilizados pelo nome ou criados; supplier_sku = «Codigo de Fornecedor» (74) ou o SKU novo.
--
-- SET-BASED, com o SKU calculado antes de inserir (a regra de fn_cat_sku_partes) e conferido depois com fn_cat_sku_partes +
-- fn_cat_modelo_numero para TODOS e com cat_prever_sku_modelo para 20 ao acaso. Os INSERT em massa correm com
-- app.audit_bypass = 'on'; fica UMA linha consolidada na auditoria. Fonte: migration:revestimentos_mudelar.
--
-- GUARDA (inerte: RAISE NOTICE e sai sem escrever nada) se: a organização 3242e925-… não existir com o nome 'Mudelar';
-- faltar a versão dos modelos (20270118300000); não existir a categoria «Revestimentos»; já houver produtos (vivos ou
-- apagados) numa das 4 subcategorias; já houver um produto vivo da Mudelar com um dos nomes; ou já houver nelas um modelo
-- com um dos nomes ou números que não seja exatamente o mesmo. Inerte numa segunda execução.
-- Falha (RAISE EXCEPTION, nada fica) se: faltar uma função do Catálogo; a sigla da categoria não for RV ou a de uma
-- subcategoria não for a esperada; atributos cor/acabamento/medida ou membro para created_by faltarem; um atributo ou
-- opção for ambíguo, desativado ou de outro tipo; SKU repetido (diz quais) ou já usado; a ordem dos atributos existentes mudar.
--
-- Conferir no fim (conta o que está ERRADO e faz RAISE se não for 0): 366 produtos, por subcategoria e por modelo;
-- cada produto como a sua linha; os 1026 valores de atributos e só esses; SKUs únicos, no formato, iguais ao
-- recalculado (todos) e a cat_prever_sku_modelo (20); nada escrito fora da Mudelar (xmin) nem noutros produtos dela.
--
-- ORDEM: depois de 20270120500000 (acabamentos Cromado/Escovado/Mate/PVD), mas não depende dela. Teste:
-- supabase/tests/catalogo_revestimentos_mudelar.test.sql (BEGIN … ROLLBACK, só leitura; o passo 0 falha antes).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` imediatamente antes.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '10min';

DO $mig$
DECLARE
  c_org         constant uuid    := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte       constant text    := 'migration:revestimentos_mudelar';
  c_total       constant integer := 366;
  c_n_modelos   constant integer := 51;
  c_n_valores   constant integer := 1026;
  c_n_custo     constant integer := 365;
  c_n_pvp       constant integer := 365;
  c_n_cod       constant integer := 74;
  c_n_opcoes    constant integer := 35;
  c_n_ml        constant integer := 2;
  c_iva         constant numeric := 23;
  c_cat_nome    constant text    := 'Revestimentos';
  c_cat_sigla   constant text    := 'RV';
  c_amostra     constant integer := 20;
  c_max_modelos_ativos constant integer := 2000;
  c_max_modelos_vivos  constant integer := 10000;
  c_max_atributos      constant integer := 200;
  v_agora   timestamptz := clock_timestamp();
  v_n bigint; v_m bigint; v_k bigint; v_i integer; v_ordem integer; v_xid text; v_txt text; v_code text; v_sigla text;
  v_cat uuid; v_cat_sigla text; v_cat_ativa boolean; v_ativa boolean; v_criador uuid; v_sup uuid; v_id uuid;
  v_a_med uuid; v_med_unit text; v_a_aplic uuid; v_aplic_criado boolean := false; v_regex text;
  v_forn_criados text := ''; v_opc_criadas text := ''; v_subs_criadas text := ''; v_marca_txt text := '';
  v_m2_criada boolean; v_ordem_antes uuid[]; v_ordem_depois uuid[];
  v_auth uuid; v_claims text; v_prev jsonb; v_attrs jsonb; r record;
BEGIN
  -- ─── 0. Guarda (inerte) ───────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM anew_organizations o WHERE o.id = c_org AND o.name = 'Mudelar' AND o.deleted_at IS NULL) THEN
    RAISE NOTICE 'revestimentos_mudelar: a organização Mudelar (%) não existe nesta base — nada a fazer.', c_org;
    RETURN;
  END IF;
  IF to_regclass('public.product_models') IS NULL
     OR to_regprocedure('public.fn_cat_modelo_numero(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)') IS NULL
     OR position('fn_cat_modelo_numero' IN coalesce((SELECT pr.prosrc FROM pg_proc pr
                                                     WHERE pr.oid = to_regprocedure('public.cat_gerar_sku_produto(uuid,uuid,boolean)')::oid), '')) = 0 THEN
    RAISE NOTICE 'revestimentos_mudelar: falta a versão dos modelos (20270118300000) — nada a fazer.';
    RETURN;
  END IF;
  SELECT string_agg(s, ', ') INTO v_txt
  FROM unnest(ARRAY['public.fn_cat_chave_opcao(text)', 'public.fn_cat_limpar_nome(text)', 'public.fn_cat_slug(text)',
                    'public.fn_cat_grupo_do_atributo(uuid,uuid)', 'public.fn_cat_medida_ler(jsonb,text)',
                    'public.fn_cat_sku_medida(jsonb)', 'public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)',
                    'public.fn_cat_unidade(uuid,text)', 'public.fn_cat_dimensao_medida(jsonb,text)',
                    'public.fn_cat_dimensao_texto(jsonb)', 'public.fn_cat_sigla_opcao_livre(uuid,text,uuid)',
                    'public.has_anew_permission_in_org(uuid,text,uuid)',
                    'public.fn_manual_audit_log(text,uuid,uuid,text,jsonb,text,uuid)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'revestimentos_mudelar: faltam funções do Catálogo (%).', v_txt; END IF;
  IF public.fn_cat_sku_medida('{"tipo":"3D","largura":1200,"comprimento":2600,"espessura":5.6,"unidade":"mm"}'::jsonb) IS DISTINCT FROM '1200X2600X5P6MM' THEN
    RAISE EXCEPTION 'revestimentos_mudelar: a Medida do Catálogo não aceita 3D em mm.';
  END IF;

  SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(c.sigla ORDER BY c.created_at, c.id))[1],
         (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1]
    INTO v_n, v_cat, v_cat_sigla, v_cat_ativa
  FROM product_categories c
  WHERE c.organization_id = c_org AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(c_cat_nome);
  IF v_n = 0 THEN
    RAISE NOTICE 'revestimentos_mudelar: a Mudelar não tem a categoria «%» — nada a fazer.', c_cat_nome;
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'revestimentos_mudelar: há % categorias «%» na Mudelar.', v_n, c_cat_nome;
  END IF;

  -- ─── Os dados do Excel (gerados) ──────────────────────────────────────────────
  DROP TABLE IF EXISTS pg_temp._rv_subs, pg_temp._rv_modelos, pg_temp._rv_opcoes, pg_temp._rv_forn, pg_temp._rv_marcas,
                       pg_temp._rv_linhas, pg_temp._rv_attr, pg_temp._rv, pg_temp._rv_vals, pg_temp._rv_amostra,
                       pg_temp._rv_grupos, pg_temp._rv_uom, pg_temp._rv_antes;

  -- as 4 subcategorias: sigla, nome, quantos produtos, ordem
  CREATE TEMP TABLE _rv_subs (codigo text PRIMARY KEY, nome text NOT NULL, esperados integer NOT NULL, ordem integer NOT NULL,
                              sub_id uuid, criada boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _rv_subs (codigo, nome, esperados, ordem) VALUES
    ('CR', 'Cerâmico', 32, 1),
    ('CL', 'Cerâmico Laminado', 95, 2),
    ('PRC', 'Porcelânico', 218, 3),
    ('SP', 'SPC', 21, 4);

  -- os modelos: subcategoria, número (NNNN do SKU), nome, quantos produtos
  CREATE TEMP TABLE _rv_modelos (sub text NOT NULL, numero smallint NOT NULL, nome text NOT NULL, esperados integer NOT NULL,
                                 modelo_id uuid, PRIMARY KEY (sub, numero)) ON COMMIT DROP;
  INSERT INTO _rv_modelos (sub, numero, nome, esperados) VALUES
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

  -- as opções usadas: atributo (cor, acabamento, aplicacao), nome, sigla se for criada, ordem
  CREATE TEMP TABLE _rv_opcoes (papel text NOT NULL, nome text NOT NULL, sigla_nova text NOT NULL, ordem integer NOT NULL,
                                grupo uuid, opcao_id uuid, valor text, sigla text, criada boolean NOT NULL DEFAULT false,
                                PRIMARY KEY (papel, nome)) ON COMMIT DROP;
  INSERT INTO _rv_opcoes (papel, nome, sigla_nova, ordem) VALUES
    ('cor', 'Abeto', 'ABE', 1),
    ('cor', 'Alerce', 'ALE', 2),
    ('cor', 'Antracite', 'ANT', 3),
    ('cor', 'ARENA', 'AR', 4),
    ('cor', 'Bege', 'BEG', 5),
    ('cor', 'Blue', 'BLU', 6),
    ('cor', 'Branco', 'B', 7),
    ('cor', 'Castanho', 'CAS', 8),
    ('cor', 'Celeste', 'CEL', 9),
    ('cor', 'Cemento', 'CEM', 10),
    ('cor', 'Cinza', 'C', 11),
    ('cor', 'Cipres', 'CIP', 12),
    ('cor', 'Cobalto', 'COB', 13),
    ('cor', 'Copper', 'COP', 14),
    ('cor', 'Fresno', 'FRE', 15),
    ('cor', 'GRIS', 'GR', 16),
    ('cor', 'Índigo', 'IND', 17),
    ('cor', 'Jade', 'JAD', 18),
    ('cor', 'Malva', 'MAL', 19),
    ('cor', 'Marfil', 'MRF', 20),
    ('cor', 'Menta', 'MEN', 21),
    ('cor', 'Navy', 'NAV', 22),
    ('cor', 'Nogal', 'NGL', 23),
    ('cor', 'Perla', 'PER', 24),
    ('cor', 'Plomo', 'PLO', 25),
    ('cor', 'Roble', 'ROB', 26),
    ('cor', 'Sage', 'SAG', 27),
    ('cor', 'Siena', 'SIE', 28),
    ('cor', 'Taupe', 'TAU', 29),
    ('acabamento', 'Natural', 'NAT', 1),
    ('acabamento', 'Polido', 'PL', 2),
    ('acabamento', 'Antiderrapante', 'AD', 3),
    ('acabamento', 'Mate', 'MAT', 4),
    ('aplicacao', 'Parede', 'PAR', 1),
    ('aplicacao', 'Pavimento', 'PAV', 2);

  CREATE TEMP TABLE _rv_forn (n integer PRIMARY KEY, nome text NOT NULL UNIQUE, id uuid, criado boolean NOT NULL DEFAULT false) ON COMMIT DROP;
  INSERT INTO _rv_forn (n, nome) VALUES
    (1, 'Grespania Ceramica'),
    (2, 'EAST COAST SPC, S.A.'),
    (3, 'NOVALAM INNOVACION, SA'),
    (4, 'RUBICER, Lda.');
  CREATE TEMP TABLE _rv_marcas (n integer PRIMARY KEY, nome text NOT NULL UNIQUE, id uuid) ON COMMIT DROP;
  INSERT INTO _rv_marcas (n, nome) VALUES
    (1, 'Coverlam'),
    (2, 'Bellacasa'),
    (3, 'Grespania'),
    (4, 'Materia SPC'),
    (5, 'Kerlux'),
    (6, 'Rubicer');

  -- as 366 linhas, campos separados por «|» (vazio = sem valor): linha do Excel | sub | modelo | nome | cor | acabamento |
  -- aplicação | tipo da medida | largura | comprimento | espessura | unidade da medida | marca | fornecedor | custo | pvp |
  -- código do fornecedor | unidade
  CREATE TEMP TABLE _rv_linhas (linha integer PRIMARY KEY, sub text NOT NULL, modelo smallint NOT NULL, nome text NOT NULL,
                                cor text, acab text NOT NULL, aplic text, med_tipo text, med_l numeric, med_a numeric, med_p numeric,
                                med_u text, marca integer NOT NULL, fornecedor integer NOT NULL, custo numeric, pvp numeric,
                                cod_forn text, unidade text NOT NULL) ON COMMIT DROP;
  INSERT INTO _rv_linhas (linha, sub, modelo, nome, cor, acab, aplic, med_tipo, med_l, med_a, med_p, med_u, marca, fornecedor,
                          custo, pvp, cod_forn, unidade)
  SELECT f[1]::integer, f[2], f[3]::smallint, f[4], nullif(f[5], ''), f[6], nullif(f[7], ''), nullif(f[8], ''),
         nullif(f[9], '')::numeric, nullif(f[10], '')::numeric, nullif(f[11], '')::numeric, nullif(f[12], ''),
         f[13]::integer, f[14]::integer, nullif(f[15], '')::numeric, nullif(f[16], '')::numeric, nullif(f[17], ''), f[18]
  FROM (SELECT string_to_array(s, '|') AS f
        FROM regexp_split_to_table($linhas$
2|CL|1|Revestimento CERÂMICO LAMINADO CAPRAIA Polido 1200x2600x5,6||Polido||3D|1200|2600|5.6|mm|1|1|43.75|72.92||m2
3|CL|1|Revestimento CERÂMICO LAMINADO CAPRAIA Polido 1200x1200x5,6||Polido||3D|1200|1200|5.6|mm|1|1|42.25|70.42||m2
4|CL|1|Revestimento CERÂMICO LAMINADO CAPRAIA Polido 600x1200x5,6||Polido||3D|600|1200|5.6|mm|1|1|42.25|70.42||m2
5|CL|2|Revestimento CERÂMICO LAMINADO CAMOUFLAGE 1200x2780x5,6||Natural||3D|1200|2780|5.6|mm|1|1|37.02|61.7||m2
6|CL|2|Revestimento CERÂMICO LAMINADO CAMOUFLAGE 1200x2780x5,6 Pul.||Polido||3D|1200|2780|5.6|mm|1|1|43.99|73.32||m2
7|CL|2|Revestimento CERÂMICO LAMINADO CAMOUFLAGE 1200x1200x5,6||Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
8|CL|2|Revestimento CERÂMICO LAMINADO CAMOUFLAGE 1200x1200x5,6 Pul.||Polido||3D|1200|1200|5.6|mm|1|1|42.25|70.42||m2
9|CL|2|Revestimento CERÂMICO LAMINADO CAMOUFLAGE 600x1200x5,6||Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
10|CL|2|Revestimento CERÂMICO LAMINADO CAMOUFLAGE 600x1200x5,6 Pul.||Polido||3D|600|1200|5.6|mm|1|1|42.25|70.42||m2
11|CL|3|Revestimento CERÂMICO LAMINADO CANELA ROMA 1200x2780x5,6||Natural||3D|1200|2780|5.6|mm|1|1|37.02|61.7||m2
12|CL|3|Revestimento CERÂMICO LAMINADO CANELA ROMA 1200x1200x5,6||Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
13|CL|3|Revestimento CERÂMICO LAMINADO CANELA ROMA 600x1200x5,6||Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
14|CL|3|Revestimento CERÂMICO LAMINADO CANELA ROMA 1600x1600x8||Natural||3D|1600|1600|8|mm|1|1|35.5|59.17||m2
15|CL|4|Revestimento CERÂMICO LAMINADO ANKARA 1200x2780x5,6 Pul.||Polido||3D|1200|2780|5.6|mm|1|1|54|90||m2
16|CL|4|Revestimento CERÂMICO LAMINADO ANKARA 1200x2600x5,6 Pul.||Polido||3D|1200|2600|5.6|mm|1|1|54|90||m2
17|CL|4|Revestimento CERÂMICO LAMINADO ANKARA 1200x1200x5,6 Pul.||Polido||3D|1200|1200|5.6|mm|1|1|42.25|70.42||m2
18|CL|4|Revestimento CERÂMICO LAMINADO ANKARA 600x1200x5,6 Pul.||Polido||3D|600|1200|5.6|mm|1|1|42.25|70.42||m2
19|CL|5|Revestimento CERÂMICO LAMINADO ARLES ARENA 1200x3600x5,6|ARENA|Natural||3D|1200|3600|5.6|mm|1|1|40|66.67||m2
20|CL|5|Revestimento CERÂMICO LAMINADO ARLES GRIS 1200x3600x5,6|GRIS|Natural||3D|1200|3600|5.6|mm|1|1|40|66.67||m2
21|CL|5|Revestimento CERÂMICO LAMINADO ARLES ARENA 1200x2600x5,6|ARENA|Natural||3D|1200|2600|5.6|mm|1|1|33.5|55.83||m2
22|CL|5|Revestimento CERÂMICO LAMINADO ARLES GRIS 1200x2600x5,6|GRIS|Natural||3D|1200|2600|5.6|mm|1|1|33.5|55.83||m2
23|CL|5|Revestimento CERÂMICO LAMINADO ARLES ARENA 1000x3000x5,6|ARENA|Natural||3D|1000|3000|5.6|mm|1|1|36.5|60.83||m2
24|CL|5|Revestimento CERÂMICO LAMINADO ARLES GRIS 1000x3000x5,6|GRIS|Natural||3D|1000|3000|5.6|mm|1|1|36.5|60.83||m2
25|CL|5|Revestimento CERÂMICO LAMINADO ARLES ARENA 1200x1200x5,6|ARENA|Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
26|CL|5|Revestimento CERÂMICO LAMINADO ARLES GRIS 1200x1200x5,6|GRIS|Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
27|CL|5|Revestimento CERÂMICO LAMINADO ARLES ARENA 600x1200x5,6|ARENA|Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
28|CL|5|Revestimento CERÂMICO LAMINADO ARLES GRIS 600x1200x5,6|GRIS|Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
29|CL|6|Revestimento CERÂMICO LAMINADO BLUE STONE 1200x3600x5,6||Natural||3D|1200|3600|5.6|mm|1|1|40|66.67||m2
30|CL|6|Revestimento CERÂMICO LAMINADO BLUE STONE 1200x2600x3,5||Natural||3D|1200|2600|3.5|mm|1|1|33.75|56.25||m2
31|CL|6|Revestimento CERÂMICO LAMINADO BLUE STONE 1000x3000x5,6||Natural||3D|1000|3000|5.6|mm|1|1|36.5|60.83||m2
32|CL|6|Revestimento CERÂMICO LAMINADO BLUE STONE 1000x3000x3,5||Natural||3D|1000|3000|3.5|mm|1|1|33.65|56.08||m2
33|CL|6|Revestimento CERÂMICO LAMINADO BLUE STONE 1200x1200x5,6||Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
34|CL|6|Revestimento CERÂMICO LAMINADO BLUE STONE 1000x1000x5,6||Natural||3D|1000|1000|5.6|mm|1|1|27.75|46.25||m2
35|CL|6|Revestimento CERÂMICO LAMINADO BLUE STONE 600x1200x5,6||Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
36|CL|6|Revestimento CERÂMICO LAMINADO BLUE STONE 500x1000x5,6||Natural||3D|500|1000|5.6|mm|1|1|27.75|46.25||m2
37|CL|7|Revestimento CERÂMICO LAMINADO OXIDO 1200x2600x3,5||Natural||3D|1200|2600|3.5|mm|1|1|30.75|51.25||m2
38|CL|7|Revestimento CERÂMICO LAMINADO OXIDO 1000x3000x3,5||Natural||3D|1000|3000|3.5|mm|1|1|31|51.67||m2
39|CL|7|Revestimento CERÂMICO LAMINADO OXIDO 1200x1200x5,6||Natural||3D|1200|1200|5.6|mm|1|1|27.25|45.42||m2
40|CL|7|Revestimento CERÂMICO LAMINADO OXIDO 600x1200x5,6||Natural||3D|600|1200|5.6|mm|1|1|27.25|45.42||m2
41|CL|8|Revestimento CERÂMICO LAMINADO RIBERA MARFIL 1200x2780x5,6|Marfil|Natural||3D|1200|2780|5.6|mm|1|1|37.02|61.7||m2
42|CL|8|Revestimento CERÂMICO LAMINADO RIBERA MARFIL 1000x3000x3,5|Marfil|Natural||3D|1000|3000|3.5|mm|1|1|33.65|56.08||m2
43|CL|8|Revestimento CERÂMICO LAMINADO RIBERA MARFIL 1200x1200x5,6|Marfil|Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
44|CL|8|Revestimento CERÂMICO LAMINADO RIBERA MARFIL 600x1200x5,6|Marfil|Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
45|CL|9|Revestimento CERÂMICO LAMINADO BLUE ROMA 1200x2780x5,6||Natural||3D|1200|2780|5.6|mm|1|1|37.02|61.7||m2
46|CL|9|Revestimento CERÂMICO LAMINADO BLUE ROMA 1200x1200x5,6||Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
47|CL|9|Revestimento CERÂMICO LAMINADO BLUE ROMA 600x1200x5,6||Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
48|CL|10|Revestimento CERÂMICO LAMINADO CALACATA BLACK A 1200x2600x5,6||Natural||3D|1200|2600|5.6|mm|1|1|42|70||m2
49|CL|10|Revestimento CERÂMICO LAMINADO CALACATA BLACK A 1200x2600x5,6 Pul.||Polido||3D|1200|2600|5.6|mm|1|1|62|103.33||m2
50|CL|10|Revestimento CERÂMICO LAMINADO CALACATA BLACK A 1000x3000x5,6||Natural||3D|1000|3000|5.6|mm|1|1|41.75|69.58||m2
51|CL|10|Revestimento CERÂMICO LAMINADO CALACATA BLACK A 1000x3000x5,6 Pul.||Polido||3D|1000|3000|5.6|mm|1|1|61.5|102.5||m2
52|CL|11|Revestimento CERÂMICO LAMINADO CALACATA BLACK B 1200x2600x5,6||Natural||3D|1200|2600|5.6|mm|1|1|42|70||m2
53|CL|11|Revestimento CERÂMICO LAMINADO CALACATA BLACK B 1200x2600x5,6 Pul.||Polido||3D|1200|2600|5.6|mm|1|1|62|103.33||m2
54|CL|11|Revestimento CERÂMICO LAMINADO CALACATA BLACK B 1000x3000x5,6||Natural||3D|1000|3000|5.6|mm|1|1|41.75|69.58||m2
55|CL|11|Revestimento CERÂMICO LAMINADO CALACATA BLACK B 1000x3000x5,6 Pul.||Polido||3D|1000|3000|5.6|mm|1|1|61.5|102.5||m2
56|CL|12|Revestimento CERÂMICO LAMINADO SURFACE ARENA 1200x2780x5,6|ARENA|Natural||3D|1200|2780|5.6|mm|1|1|37.02|61.7||m2
57|CL|12|Revestimento CERÂMICO LAMINADO SURFACE ARENA 1000x3000x3,5|ARENA|Natural||3D|1000|3000|3.5|mm|1|1|33.65|56.08||m2
58|CL|12|Revestimento CERÂMICO LAMINADO SURFACE ARENA 1000x3000x5,6|ARENA|Natural||3D|1000|3000|5.6|mm|1|1|36.5|60.83||m2
59|CL|12|Revestimento CERÂMICO LAMINADO SURFACE ARENA 1200x1200x5,6|ARENA|Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
60|CL|12|Revestimento CERÂMICO LAMINADO SURFACE ARENA 600x1200x5,6|ARENA|Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
61|CL|12|Revestimento CERÂMICO LAMINADO SURFACE ARENA 1600x1600x8|ARENA|Natural||3D|1600|1600|8|mm|1|1|35.5|59.17||m2
62|PRC|1|Revestimento PORCELÂNICO HABANA BLANCO 60x120|Branco|Natural||2D|60|120||cm|2|1|13.45|22.42|43HB49R|m2
63|PRC|1|Revestimento PORCELÂNICO HABANA BLANCO 60x60|Branco|Natural||2D|60|60||cm|2|1|11.5|19.17|82HB45R|m2
64|PRC|1|Revestimento PORCELÂNICO HABANA BLANCO 80x80|Branco|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
65|PRC|2|Revestimento PORCELÂNICO DOMUS BLANCO 30x60|Branco|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
66|PRC|2|Revestimento PORCELÂNICO DOMUS BLANCO 30x60 Anti.|Branco|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
67|PRC|2|Revestimento PORCELÂNICO DOMUS BLANCO 60x60|Branco|Natural||2D|60|60||cm|2|1|11.5|19.17|82D145R|m2
68|PRC|2|Revestimento PORCELÂNICO DOMUS BLANCO 60x60 Anti.|Branco|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
69|PRC|2|Revestimento PORCELÂNICO DOMUS BLANCO 60x120|Branco|Natural||2D|60|120||cm|2|1|13.45|22.42|43D149R|m2
70|PRC|2|Revestimento PORCELÂNICO DOMUS BLANCO 60x120 Anti.|Branco|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
71|PRC|2|Revestimento PORCELÂNICO DOMUS BLANCO 80x80|Branco|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
72|PRC|2|Revestimento PORCELÂNICO DOMUS BLANCO 80x80 Anti.|Branco|Antiderrapante||2D|80|80||cm|2|1|16.45|27.42||m2
73|PRC|3|Revestimento PORCELÂNICO BRERA BLANCO 30x60 Rect.|Branco|Natural||2D|30|60||cm|2|1|11.5|19.17|46RA42R|m2
74|PRC|4|Revestimento PORCELÂNICO BRERA BLANCO 45x45|Branco|Natural||2D|45|45||cm|2|1|11.25|18.75||m2
75|PRC|3|Revestimento PORCELÂNICO BRERA BLANCO 60x60 Rect.|Branco|Natural||2D|60|60||cm|2|1|11.5|19.17|62RA45R|m2
76|PRC|4|Revestimento PORCELÂNICO BRERA BLANCO 80x80|Branco|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
77|PRC|5|Revestimento PORCELÂNICO MELBOURNE BLANCO 30x60|Branco|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
78|PRC|5|Revestimento PORCELÂNICO MELBOURNE BLANCO 30x60 Anti.|Branco|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
79|PRC|5|Revestimento PORCELÂNICO MELBOURNE BLANCO 45x45|Branco|Natural||2D|45|45||cm|2|1|11.25|18.75||m2
80|PRC|5|Revestimento PORCELÂNICO MELBOURNE BLANCO 31,5x100|Branco|Natural||2D|31.5|100||cm|2|1|12.1|20.17||m2
81|PRC|5|Revestimento PORCELÂNICO MELBOURNE BLANCO 45x120|Branco|Natural||2D|45|120||cm|2|1|15.3|25.5||m2
82|PRC|5|Revestimento PORCELÂNICO MELBOURNE BLANCO 60x60|Branco|Natural||2D|60|60||cm|2|1|11.5|19.17||m2
83|PRC|5|Revestimento PORCELÂNICO MELBOURNE BLANCO 60x60 Anti.|Branco|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
84|PRC|5|Revestimento PORCELÂNICO MELBOURNE BLANCO 60x120|Branco|Natural||2D|60|120||cm|2|1|13.45|22.42||m2
85|PRC|5|Revestimento PORCELÂNICO MELBOURNE BLANCO 60x120 Anti.|Branco|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
86|PRC|5|Revestimento PORCELÂNICO MELBOURNE BLANCO 80x80|Branco|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
87|PRC|5|Revestimento PORCELÂNICO MELBOURNE BLANCO 80x80 Anti.|Branco|Antiderrapante||2D|80|80||cm|2|1|16.45|27.42||m2
88|PRC|5|Revestimento PORCELÂNICO MELBOURNE BLANCO 120x120|Branco|Natural||2D|120|120||cm|2|1|18|30||m2
89|PRC|5|Revestimento PORCELÂNICO MELBOURNE BLANCO 120x120 Anti.|Branco|Antiderrapante||2D|120|120||cm|2|1|21|35||m2
90|PRC|6|Revestimento PORCELÂNICO VALONIA BLANCO 30x60|Branco|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
91|PRC|6|Revestimento PORCELÂNICO VALONIA BLANCO 30x60 Anti.|Branco|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
92|PRC|6|Revestimento PORCELÂNICO VALONIA BLANCO 60x60|Branco|Natural||2D|60|60||cm|2|1|11.5|19.17|62V245R|m2
93|PRC|6|Revestimento PORCELÂNICO VALONIA BLANCO 60x60 Anti.|Branco|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
94|PRC|6|Revestimento PORCELÂNICO VALONIA BLANCO 60x120|Branco|Natural||2D|60|120||cm|2|1|13.45|22.42|44V249R|m2
95|PRC|6|Revestimento PORCELÂNICO VALONIA BLANCO 60x120 Anti.|Branco|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
96|PRC|6|Revestimento PORCELÂNICO VALONIA BLANCO 80x80|Branco|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
97|PRC|6|Revestimento PORCELÂNICO VALONIA BLANCO 120x120|Branco|Natural||2D|120|120||cm|2|1|18|30||m2
98|PRC|6|Revestimento PORCELÂNICO VALONIA BLANCO 120x120 Anti.|Branco|Antiderrapante||2D|120|120||cm|2|1|21|35||m2
99|PRC|7|Revestimento PORCELÂNICO PRIORATO ALERCE 19,5x120|Alerce|Natural||2D|19.5|120||cm|2|1|13.45|22.42|19FU29T|m2
100|PRC|7|Revestimento PORCELÂNICO PRIORATO ALERCE 19,5x120 Anti.|Alerce|Antiderrapante||2D|19.5|120||cm|2|1|16.45|27.42||m2
101|CR|1|Revestimento CERÂMICO ATREZO 30x60||Natural||2D|30|60||cm|3|1|9.95|16.58||m2
102|CR|1|Revestimento CERÂMICO ATREZO 45x120|ARENA|Natural||2D|45|120||cm|3|1|16.35|27.25|64TZ708|m2
103|CR|2|Revestimento CERÂMICO BAVIERA 45x120|Branco|Natural||2D|45|120||cm|3|1|16.35|27.25|64VI408|m2
104|CR|3|Revestimento CERÂMICO MALMO ROBLE 45x120|Roble|Natural||2D|45|120||cm|3|1|18.35|30.58|64E2228|m2
105|CR|4|Revestimento CERÂMICO SIROS BLANCO 60x120|Branco|Natural||2D|60|120||cm|3|1|18.15|30.25||m2
106|CR|5|Revestimento CERÂMICO TASOS BLANCO 60x120|Branco|Natural||2D|60|120||cm|3|1|20.15|33.58||m2
107|CR|6|Revestimento CERÂMICO GRACIA BLANCO 7,5x30|Branco|Natural||2D|7.5|30||cm|3|1|18.5|30.83|06DGR40|m2
108|CR|7|Revestimento CERÂMICO LUCIA BLANCO 7,5x30|Branco|Natural||2D|7.5|30||cm|3|1|18.5|30.83||m2
109|CR|8|Revestimento CERÂMICO VOLTERRA Rev.||Natural|Parede||||||3|1|13.25|22.08||m2
110|PRC|8|Revestimento PORCELÂNICO SAJONIA FRESNO 14,5x120|Fresno|Natural||2D|14.5|120||cm|3|1|15.1|25.17|19SJ59L|m2
111|PRC|8|Revestimento PORCELÂNICO SAJONIA FRESNO 19,5x120|Fresno|Natural||2D|19.5|120||cm|3|1|15.1|25.17|19SJ59T|m2
112|PRC|8|Revestimento PORCELÂNICO SAJONIA FRESNO 19,5x120 Anti.|Fresno|Antiderrapante||2D|19.5|120||cm|3|1|18.1|30.17||m2
113|PRC|9|Revestimento PORCELÂNICO VOLTERRA Pav. 119x119 Pul.|Branco|Polido|Pavimento|2D|119|119||cm|3|1|24.5|40.83|44V149P|m2
114|PRC|9|Revestimento PORCELÂNICO VOLTERRA Pav. 120x120||Natural|Pavimento|2D|120|120||cm|3|1|20.5|34.17||m2
115|PRC|9|Revestimento PORCELÂNICO VOLTERRA Pav. 30x60||Natural|Pavimento|2D|30|60||cm|3|1|13.6|22.67||m2
116|PRC|9|Revestimento PORCELÂNICO VOLTERRA Pav. 59x119||Natural|Pavimento|2D|59|119||cm|3|1|20.75|34.58||m2
117|PRC|9|Revestimento PORCELÂNICO VOLTERRA Pav. 60x120||Natural|Pavimento|2D|60|120||cm|3|1|16.75|27.92||m2
118|PRC|9|Revestimento PORCELÂNICO VOLTERRA Pav. 80x80|Branco|Natural|Pavimento|2D|80|80||cm|3|1|16.75|27.92|81V146R|m2
119|CL|8|Revestimento CERÂMICO LAMINADO RIBERA BLANCO 1200x2780x5,6|Branco|Natural||3D|1200|2780|5.6|mm|1|1|37.02|61.7||m2
120|CL|8|Revestimento CERÂMICO LAMINADO RIBERA BLANCO 1000x3000x3,5|Branco|Natural||3D|1000|3000|3.5|mm|1|1|33.65|56.08||m2
121|CL|8|Revestimento CERÂMICO LAMINADO RIBERA BLANCO 1200x1200x5,6|Branco|Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
122|CL|8|Revestimento CERÂMICO LAMINADO RIBERA BLANCO 600x1200x5,6|Branco|Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
123|CL|12|Revestimento CERÂMICO LAMINADO SURFACE MARFIL 1200x2780x5,6|Marfil|Natural||3D|1200|2780|5.6|mm|1|1|37.02|61.7||m2
124|CL|12|Revestimento CERÂMICO LAMINADO SURFACE MARFIL 1000x3000x3,5|Marfil|Natural||3D|1000|3000|3.5|mm|1|1|33.65|56.08||m2
125|CL|12|Revestimento CERÂMICO LAMINADO SURFACE MARFIL 1000x3000x5,6|Marfil|Natural||3D|1000|3000|5.6|mm|1|1|36.5|60.83||m2
126|CL|12|Revestimento CERÂMICO LAMINADO SURFACE MARFIL 1200x1200x5,6|Marfil|Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
127|CL|12|Revestimento CERÂMICO LAMINADO SURFACE MARFIL 600x1200x5,6|Marfil|Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
128|CL|12|Revestimento CERÂMICO LAMINADO SURFACE MARFIL 1600x1600x8|Marfil|Natural||3D|1600|1600|8|mm|1|1|35.5|59.17||m2
129|CL|12|Revestimento CERÂMICO LAMINADO SURFACE SIENA 1200x2780x5,6|Siena|Natural||3D|1200|2780|5.6|mm|1|1|37.02|61.7||m2
130|CL|12|Revestimento CERÂMICO LAMINADO SURFACE SIENA 1000x3000x3,5|Siena|Natural||3D|1000|3000|3.5|mm|1|1|33.65|56.08||m2
131|CL|12|Revestimento CERÂMICO LAMINADO SURFACE SIENA 1000x3000x5,6|Siena|Natural||3D|1000|3000|5.6|mm|1|1|36.5|60.83||m2
132|CL|12|Revestimento CERÂMICO LAMINADO SURFACE SIENA 1200x1200x5,6|Siena|Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
133|CL|12|Revestimento CERÂMICO LAMINADO SURFACE SIENA 600x1200x5,6|Siena|Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
134|CL|12|Revestimento CERÂMICO LAMINADO SURFACE SIENA 1600x1600x8|Siena|Natural||3D|1600|1600|8|mm|1|1|35.5|59.17||m2
135|CL|12|Revestimento CERÂMICO LAMINADO SURFACE CEMENTO 1200x2780x5,6|Cemento|Natural||3D|1200|2780|5.6|mm|1|1|37.02|61.7||m2
136|CL|12|Revestimento CERÂMICO LAMINADO SURFACE CEMENTO 1000x3000x3,5|Cemento|Natural||3D|1000|3000|3.5|mm|1|1|33.65|56.08||m2
137|CL|12|Revestimento CERÂMICO LAMINADO SURFACE CEMENTO 1000x3000x5,6|Cemento|Natural||3D|1000|3000|5.6|mm|1|1|36.5|60.83||m2
138|CL|12|Revestimento CERÂMICO LAMINADO SURFACE CEMENTO 1200x1200x5,6|Cemento|Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
139|CL|12|Revestimento CERÂMICO LAMINADO SURFACE CEMENTO 600x1200x5,6|Cemento|Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
140|CL|12|Revestimento CERÂMICO LAMINADO SURFACE CEMENTO 1600x1600x8|Cemento|Natural||3D|1600|1600|8|mm|1|1|35.5|59.17||m2
141|CL|12|Revestimento CERÂMICO LAMINADO SURFACE SAGE 1200x2780x5,6|Sage|Natural||3D|1200|2780|5.6|mm|1|1|37.02|61.7||m2
142|CL|12|Revestimento CERÂMICO LAMINADO SURFACE SAGE 1000x3000x3,5|Sage|Natural||3D|1000|3000|3.5|mm|1|1|33.65|56.08||m2
143|CL|12|Revestimento CERÂMICO LAMINADO SURFACE SAGE 1000x3000x5,6|Sage|Natural||3D|1000|3000|5.6|mm|1|1|36.5|60.83||m2
144|CL|12|Revestimento CERÂMICO LAMINADO SURFACE SAGE 1200x1200x5,6|Sage|Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
145|CL|12|Revestimento CERÂMICO LAMINADO SURFACE SAGE 600x1200x5,6|Sage|Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
146|CL|12|Revestimento CERÂMICO LAMINADO SURFACE SAGE 1600x1600x8|Sage|Natural||3D|1600|1600|8|mm|1|1|35.5|59.17||m2
147|CL|12|Revestimento CERÂMICO LAMINADO SURFACE COBALTO 1200x2780x5,6|Cobalto|Natural||3D|1200|2780|5.6|mm|1|1|37.02|61.7||m2
148|CL|12|Revestimento CERÂMICO LAMINADO SURFACE COBALTO 1000x3000x3,5|Cobalto|Natural||3D|1000|3000|3.5|mm|1|1|33.65|56.08||m2
149|CL|12|Revestimento CERÂMICO LAMINADO SURFACE COBALTO 1000x3000x5,6|Cobalto|Natural||3D|1000|3000|5.6|mm|1|1|36.5|60.83||m2
150|CL|12|Revestimento CERÂMICO LAMINADO SURFACE COBALTO 1200x1200x5,6|Cobalto|Natural||3D|1200|1200|5.6|mm|1|1|27.75|46.25||m2
151|CL|12|Revestimento CERÂMICO LAMINADO SURFACE COBALTO 600x1200x5,6|Cobalto|Natural||3D|600|1200|5.6|mm|1|1|27.75|46.25||m2
152|CL|12|Revestimento CERÂMICO LAMINADO SURFACE COBALTO 1600x1600x8|Cobalto|Natural||3D|1600|1600|8|mm|1|1|35.5|59.17||m2
153|PRC|5|Revestimento PORCELÂNICO MELBOURNE GRIS 30x60|GRIS|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
154|PRC|5|Revestimento PORCELÂNICO MELBOURNE GRIS 30x60 Anti.|GRIS|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
155|PRC|5|Revestimento PORCELÂNICO MELBOURNE GRIS 45x45|GRIS|Natural||2D|45|45||cm|2|1|11.25|18.75||m2
156|PRC|5|Revestimento PORCELÂNICO MELBOURNE GRIS 31,5x100|GRIS|Natural||2D|31.5|100||cm|2|1|12.1|20.17||m2
157|PRC|5|Revestimento PORCELÂNICO MELBOURNE GRIS 45x120|GRIS|Natural||2D|45|120||cm|2|1|15.3|25.5||m2
158|PRC|5|Revestimento PORCELÂNICO MELBOURNE GRIS 60x60|GRIS|Natural||2D|60|60||cm|2|1|11.5|19.17||m2
159|PRC|5|Revestimento PORCELÂNICO MELBOURNE GRIS 60x60 Anti.|GRIS|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
160|PRC|5|Revestimento PORCELÂNICO MELBOURNE GRIS 60x120|GRIS|Natural||2D|60|120||cm|2|1|13.45|22.42||m2
161|PRC|5|Revestimento PORCELÂNICO MELBOURNE GRIS 60x120 Anti.|GRIS|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
162|PRC|5|Revestimento PORCELÂNICO MELBOURNE GRIS 80x80|GRIS|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
163|PRC|5|Revestimento PORCELÂNICO MELBOURNE GRIS 80x80 Anti.|GRIS|Antiderrapante||2D|80|80||cm|2|1|16.45|27.42||m2
164|PRC|5|Revestimento PORCELÂNICO MELBOURNE GRIS 120x120|GRIS|Natural||2D|120|120||cm|2|1|18|30||m2
165|PRC|5|Revestimento PORCELÂNICO MELBOURNE GRIS 120x120 Anti.|GRIS|Antiderrapante||2D|120|120||cm|2|1|21|35||m2
166|PRC|5|Revestimento PORCELÂNICO MELBOURNE MARFIL 30x60|Marfil|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
167|PRC|5|Revestimento PORCELÂNICO MELBOURNE MARFIL 30x60 Anti.|Marfil|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
168|PRC|5|Revestimento PORCELÂNICO MELBOURNE MARFIL 45x45|Marfil|Natural||2D|45|45||cm|2|1|11.25|18.75||m2
169|PRC|5|Revestimento PORCELÂNICO MELBOURNE MARFIL 31,5x100|Marfil|Natural||2D|31.5|100||cm|2|1|12.1|20.17||m2
170|PRC|5|Revestimento PORCELÂNICO MELBOURNE MARFIL 45x120|Marfil|Natural||2D|45|120||cm|2|1|15.3|25.5||m2
171|PRC|5|Revestimento PORCELÂNICO MELBOURNE MARFIL 60x60|Marfil|Natural||2D|60|60||cm|2|1|11.5|19.17||m2
172|PRC|5|Revestimento PORCELÂNICO MELBOURNE MARFIL 60x60 Anti.|Marfil|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
173|PRC|5|Revestimento PORCELÂNICO MELBOURNE MARFIL 60x120|Marfil|Natural||2D|60|120||cm|2|1|13.45|22.42||m2
174|PRC|5|Revestimento PORCELÂNICO MELBOURNE MARFIL 60x120 Anti.|Marfil|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
175|PRC|5|Revestimento PORCELÂNICO MELBOURNE MARFIL 80x80|Marfil|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
176|PRC|5|Revestimento PORCELÂNICO MELBOURNE MARFIL 80x80 Anti.|Marfil|Antiderrapante||2D|80|80||cm|2|1|16.45|27.42||m2
177|PRC|5|Revestimento PORCELÂNICO MELBOURNE MARFIL 120x120|Marfil|Natural||2D|120|120||cm|2|1|18|30||m2
178|PRC|5|Revestimento PORCELÂNICO MELBOURNE MARFIL 120x120 Anti.|Marfil|Antiderrapante||2D|120|120||cm|2|1|21|35||m2
179|PRC|5|Revestimento PORCELÂNICO MELBOURNE TAUPE 30x60|Taupe|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
180|PRC|5|Revestimento PORCELÂNICO MELBOURNE TAUPE 30x60 Anti.|Taupe|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
181|PRC|5|Revestimento PORCELÂNICO MELBOURNE TAUPE 45x45|Taupe|Natural||2D|45|45||cm|2|1|11.25|18.75||m2
182|PRC|5|Revestimento PORCELÂNICO MELBOURNE TAUPE 31,5x100|Taupe|Natural||2D|31.5|100||cm|2|1|12.1|20.17||m2
183|PRC|5|Revestimento PORCELÂNICO MELBOURNE TAUPE 45x120|Taupe|Natural||2D|45|120||cm|2|1|15.3|25.5||m2
184|PRC|5|Revestimento PORCELÂNICO MELBOURNE TAUPE 60x60|Taupe|Natural||2D|60|60||cm|2|1|11.5|19.17||m2
185|PRC|5|Revestimento PORCELÂNICO MELBOURNE TAUPE 60x60 Anti.|Taupe|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
186|PRC|5|Revestimento PORCELÂNICO MELBOURNE TAUPE 60x120|Taupe|Natural||2D|60|120||cm|2|1|13.45|22.42||m2
187|PRC|5|Revestimento PORCELÂNICO MELBOURNE TAUPE 60x120 Anti.|Taupe|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
188|PRC|5|Revestimento PORCELÂNICO MELBOURNE TAUPE 80x80|Taupe|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
189|PRC|5|Revestimento PORCELÂNICO MELBOURNE TAUPE 80x80 Anti.|Taupe|Antiderrapante||2D|80|80||cm|2|1|16.45|27.42||m2
190|PRC|5|Revestimento PORCELÂNICO MELBOURNE TAUPE 120x120|Taupe|Natural||2D|120|120||cm|2|1|18|30||m2
191|PRC|5|Revestimento PORCELÂNICO MELBOURNE TAUPE 120x120 Anti.|Taupe|Antiderrapante||2D|120|120||cm|2|1|21|35||m2
192|PRC|5|Revestimento PORCELÂNICO MELBOURNE ANTRACITE 30x60|Antracite|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
193|PRC|5|Revestimento PORCELÂNICO MELBOURNE ANTRACITE 30x60 Anti.|Antracite|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
194|PRC|5|Revestimento PORCELÂNICO MELBOURNE ANTRACITE 45x45|Antracite|Natural||2D|45|45||cm|2|1|11.25|18.75||m2
195|PRC|5|Revestimento PORCELÂNICO MELBOURNE ANTRACITE 31,5x100|Antracite|Natural||2D|31.5|100||cm|2|1|12.1|20.17||m2
196|PRC|5|Revestimento PORCELÂNICO MELBOURNE ANTRACITE 45x120|Antracite|Natural||2D|45|120||cm|2|1|15.3|25.5||m2
197|PRC|5|Revestimento PORCELÂNICO MELBOURNE ANTRACITE 60x60|Antracite|Natural||2D|60|60||cm|2|1|11.5|19.17||m2
198|PRC|5|Revestimento PORCELÂNICO MELBOURNE ANTRACITE 60x60 Anti.|Antracite|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
199|PRC|5|Revestimento PORCELÂNICO MELBOURNE ANTRACITE 60x120|Antracite|Natural||2D|60|120||cm|2|1|13.45|22.42||m2
200|PRC|5|Revestimento PORCELÂNICO MELBOURNE ANTRACITE 60x120 Anti.|Antracite|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
201|PRC|5|Revestimento PORCELÂNICO MELBOURNE ANTRACITE 80x80|Antracite|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
202|PRC|5|Revestimento PORCELÂNICO MELBOURNE ANTRACITE 80x80 Anti.|Antracite|Antiderrapante||2D|80|80||cm|2|1|16.45|27.42||m2
203|PRC|5|Revestimento PORCELÂNICO MELBOURNE ANTRACITE 120x120|Antracite|Natural||2D|120|120||cm|2|1|18|30||m2
204|PRC|5|Revestimento PORCELÂNICO MELBOURNE ANTRACITE 120x120 Anti.|Antracite|Antiderrapante||2D|120|120||cm|2|1|21|35||m2
205|PRC|1|Revestimento PORCELÂNICO HABANA COPPER 60x120|Copper|Natural||2D|60|120||cm|2|1|13.45|22.42|48HB29R|m2
206|PRC|1|Revestimento PORCELÂNICO HABANA COPPER 60x60|Copper|Natural||2D|60|60||cm|2|1|11.5|19.17|62HB25R|m2
207|PRC|1|Revestimento PORCELÂNICO HABANA COPPER 80x80|Copper|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
208|PRC|1|Revestimento PORCELÂNICO HABANA CEMENTO 60x120|Cemento|Natural||2D|60|120||cm|2|1|13.45|22.42|43HB19R|m2
209|PRC|1|Revestimento PORCELÂNICO HABANA CEMENTO 60x60|Cemento|Natural||2D|60|60||cm|2|1|11.5|19.17|62HB15R|m2
210|PRC|1|Revestimento PORCELÂNICO HABANA CEMENTO 80x80|Cemento|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
211|PRC|6|Revestimento PORCELÂNICO VALONIA GRIS 30x60|GRIS|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
212|PRC|6|Revestimento PORCELÂNICO VALONIA GRIS 30x60 Anti.|GRIS|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
213|PRC|6|Revestimento PORCELÂNICO VALONIA GRIS 60x60|GRIS|Natural||2D|60|60||cm|2|1|11.5|19.17|62V235R|m2
214|PRC|6|Revestimento PORCELÂNICO VALONIA GRIS 60x60 Anti.|GRIS|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
215|PRC|6|Revestimento PORCELÂNICO VALONIA GRIS 60x120|GRIS|Natural||2D|60|120||cm|2|1|13.45|22.42|43V239R|m2
216|PRC|6|Revestimento PORCELÂNICO VALONIA GRIS 60x120 Anti.|GRIS|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
217|PRC|6|Revestimento PORCELÂNICO VALONIA GRIS 80x80|GRIS|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
218|PRC|6|Revestimento PORCELÂNICO VALONIA GRIS 120x120|GRIS|Natural||2D|120|120||cm|2|1|18|30||m2
219|PRC|6|Revestimento PORCELÂNICO VALONIA GRIS 120x120 Anti.|GRIS|Antiderrapante||2D|120|120||cm|2|1|21|35||m2
220|PRC|6|Revestimento PORCELÂNICO VALONIA BLUE 30x60|Blue|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
221|PRC|6|Revestimento PORCELÂNICO VALONIA BLUE 30x60 Anti.|Blue|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
222|PRC|6|Revestimento PORCELÂNICO VALONIA BLUE 60x60|Blue|Natural||2D|60|60||cm|2|1|11.5|19.17||m2
223|PRC|6|Revestimento PORCELÂNICO VALONIA BLUE 60x60 Anti.|Blue|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
224|PRC|6|Revestimento PORCELÂNICO VALONIA BLUE 60x120|Blue|Natural||2D|60|120||cm|2|1|13.45|22.42|44V259R|m2
225|PRC|6|Revestimento PORCELÂNICO VALONIA BLUE 60x120 Anti.|Blue|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
226|PRC|6|Revestimento PORCELÂNICO VALONIA BLUE 80x80|Blue|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
227|PRC|6|Revestimento PORCELÂNICO VALONIA BLUE 120x120|Blue|Natural||2D|120|120||cm|2|1|18|30||m2
228|PRC|6|Revestimento PORCELÂNICO VALONIA BLUE 120x120 Anti.|Blue|Antiderrapante||2D|120|120||cm|2|1|21|35||m2
229|PRC|6|Revestimento PORCELÂNICO VALONIA TAUPE 30x60|Taupe|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
230|PRC|6|Revestimento PORCELÂNICO VALONIA TAUPE 30x60 Anti.|Taupe|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
231|PRC|6|Revestimento PORCELÂNICO VALONIA TAUPE 60x60|Taupe|Natural||2D|60|60||cm|2|1|11.5|19.17||m2
232|PRC|6|Revestimento PORCELÂNICO VALONIA TAUPE 60x60 Anti.|Taupe|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
233|PRC|6|Revestimento PORCELÂNICO VALONIA TAUPE 60x120|Taupe|Natural||2D|60|120||cm|2|1|13.45|22.42|44V229R|m2
234|PRC|6|Revestimento PORCELÂNICO VALONIA TAUPE 60x120 Anti.|Taupe|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
235|PRC|6|Revestimento PORCELÂNICO VALONIA TAUPE 80x80|Taupe|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
236|PRC|6|Revestimento PORCELÂNICO VALONIA TAUPE 120x120|Taupe|Natural||2D|120|120||cm|2|1|18|30||m2
237|PRC|6|Revestimento PORCELÂNICO VALONIA TAUPE 120x120 Anti.|Taupe|Antiderrapante||2D|120|120||cm|2|1|21|35||m2
238|PRC|6|Revestimento PORCELÂNICO VALONIA ANTRACITE 30x60|Antracite|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
239|PRC|6|Revestimento PORCELÂNICO VALONIA ANTRACITE 30x60 Anti.|Antracite|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
240|PRC|6|Revestimento PORCELÂNICO VALONIA ANTRACITE 60x60|Antracite|Natural||2D|60|60||cm|2|1|11.5|19.17||m2
241|PRC|6|Revestimento PORCELÂNICO VALONIA ANTRACITE 60x60 Anti.|Antracite|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
242|PRC|6|Revestimento PORCELÂNICO VALONIA ANTRACITE 60x120|Antracite|Natural||2D|60|120||cm|2|1|13.45|22.42|43V269R|m2
243|PRC|6|Revestimento PORCELÂNICO VALONIA ANTRACITE 60x120 Anti.|Antracite|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
244|PRC|6|Revestimento PORCELÂNICO VALONIA ANTRACITE 80x80|Antracite|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
245|PRC|6|Revestimento PORCELÂNICO VALONIA ANTRACITE 120x120|Antracite|Natural||2D|120|120||cm|2|1|18|30||m2
246|PRC|6|Revestimento PORCELÂNICO VALONIA ANTRACITE 120x120 Anti.|Antracite|Antiderrapante||2D|120|120||cm|2|1|21|35||m2
247|PRC|2|Revestimento PORCELÂNICO DOMUS GRIS 30x60|GRIS|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
248|PRC|2|Revestimento PORCELÂNICO DOMUS GRIS 30x60 Anti.|GRIS|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
249|PRC|2|Revestimento PORCELÂNICO DOMUS GRIS 60x60|GRIS|Natural||2D|60|60||cm|2|1|11.5|19.17|82D135R|m2
250|PRC|2|Revestimento PORCELÂNICO DOMUS GRIS 60x60 Anti.|GRIS|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
251|PRC|2|Revestimento PORCELÂNICO DOMUS GRIS 60x120|GRIS|Natural||2D|60|120||cm|2|1|13.45|22.42|43D139R|m2
252|PRC|2|Revestimento PORCELÂNICO DOMUS GRIS 60x120 Anti.|GRIS|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
253|PRC|2|Revestimento PORCELÂNICO DOMUS GRIS 80x80|GRIS|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
254|PRC|2|Revestimento PORCELÂNICO DOMUS GRIS 80x80 Anti.|GRIS|Antiderrapante||2D|80|80||cm|2|1|16.45|27.42||m2
255|PRC|2|Revestimento PORCELÂNICO DOMUS ARENA 30x60|ARENA|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
256|PRC|2|Revestimento PORCELÂNICO DOMUS ARENA 30x60 Anti.|ARENA|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
257|PRC|2|Revestimento PORCELÂNICO DOMUS ARENA 60x60|ARENA|Natural||2D|60|60||cm|2|1|11.5|19.17|82D175R|m2
258|PRC|2|Revestimento PORCELÂNICO DOMUS ARENA 60x60 Anti.|ARENA|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
259|PRC|2|Revestimento PORCELÂNICO DOMUS ARENA 60x120|ARENA|Natural||2D|60|120||cm|2|1|13.45|22.42|43D179R|m2
260|PRC|2|Revestimento PORCELÂNICO DOMUS ARENA 60x120 Anti.|ARENA|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
261|PRC|2|Revestimento PORCELÂNICO DOMUS ARENA 80x80|ARENA|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
262|PRC|2|Revestimento PORCELÂNICO DOMUS ARENA 80x80 Anti.|ARENA|Antiderrapante||2D|80|80||cm|2|1|16.45|27.42||m2
263|PRC|2|Revestimento PORCELÂNICO DOMUS TAUPE 30x60|Taupe|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
264|PRC|2|Revestimento PORCELÂNICO DOMUS TAUPE 30x60 Anti.|Taupe|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
265|PRC|2|Revestimento PORCELÂNICO DOMUS TAUPE 60x60|Taupe|Natural||2D|60|60||cm|2|1|11.5|19.17|82D125R|m2
266|PRC|2|Revestimento PORCELÂNICO DOMUS TAUPE 60x60 Anti.|Taupe|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
267|PRC|2|Revestimento PORCELÂNICO DOMUS TAUPE 60x120|Taupe|Natural||2D|60|120||cm|2|1|13.45|22.42||m2
268|PRC|2|Revestimento PORCELÂNICO DOMUS TAUPE 60x120 Anti.|Taupe|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
269|PRC|2|Revestimento PORCELÂNICO DOMUS TAUPE 80x80|Taupe|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
270|PRC|2|Revestimento PORCELÂNICO DOMUS TAUPE 80x80 Anti.|Taupe|Antiderrapante||2D|80|80||cm|2|1|16.45|27.42||m2
271|PRC|2|Revestimento PORCELÂNICO DOMUS ANTRACITE 30x60|Antracite|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
272|PRC|2|Revestimento PORCELÂNICO DOMUS ANTRACITE 30x60 Anti.|Antracite|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
273|PRC|2|Revestimento PORCELÂNICO DOMUS ANTRACITE 60x60|Antracite|Natural||2D|60|60||cm|2|1|11.5|19.17|62D165R|m2
274|PRC|2|Revestimento PORCELÂNICO DOMUS ANTRACITE 60x60 Anti.|Antracite|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
275|PRC|2|Revestimento PORCELÂNICO DOMUS ANTRACITE 60x120|Antracite|Natural||2D|60|120||cm|2|1|13.45|22.42||m2
276|PRC|2|Revestimento PORCELÂNICO DOMUS ANTRACITE 60x120 Anti.|Antracite|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
277|PRC|2|Revestimento PORCELÂNICO DOMUS ANTRACITE 80x80|Antracite|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
278|PRC|2|Revestimento PORCELÂNICO DOMUS ANTRACITE 80x80 Anti.|Antracite|Antiderrapante||2D|80|80||cm|2|1|16.45|27.42||m2
279|PRC|2|Revestimento PORCELÂNICO DOMUS PLOMO 30x60|Plomo|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
280|PRC|2|Revestimento PORCELÂNICO DOMUS PLOMO 30x60 Anti.|Plomo|Antiderrapante||2D|30|60||cm|2|1|14.5|24.17||m2
281|PRC|2|Revestimento PORCELÂNICO DOMUS PLOMO 60x60|Plomo|Natural||2D|60|60||cm|2|1|11.5|19.17|82D155R|m2
282|PRC|2|Revestimento PORCELÂNICO DOMUS PLOMO 60x60 Anti.|Plomo|Antiderrapante||2D|60|60||cm|2|1|14.5|24.17||m2
283|PRC|2|Revestimento PORCELÂNICO DOMUS PLOMO 60x120|Plomo|Natural||2D|60|120||cm|2|1|13.45|22.42|43D159R|m2
284|PRC|2|Revestimento PORCELÂNICO DOMUS PLOMO 60x120 Anti.|Plomo|Antiderrapante||2D|60|120||cm|2|1|16.45|27.42||m2
285|PRC|2|Revestimento PORCELÂNICO DOMUS PLOMO 80x80|Plomo|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
286|PRC|2|Revestimento PORCELÂNICO DOMUS PLOMO 80x80 Anti.|Plomo|Antiderrapante||2D|80|80||cm|2|1|16.45|27.42||m2
287|PRC|3|Revestimento PORCELÂNICO BRERA GRIS 30x60 Rect.|GRIS|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
288|PRC|4|Revestimento PORCELÂNICO BRERA GRIS 45x45|GRIS|Natural||2D|45|45||cm|2|1|11.25|18.75||m2
289|PRC|3|Revestimento PORCELÂNICO BRERA GRIS 60x60 Rect.|GRIS|Natural||2D|60|60||cm|2|1|11.5|19.17|52RA35R|m2
290|PRC|4|Revestimento PORCELÂNICO BRERA GRIS 80x80|GRIS|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
291|PRC|3|Revestimento PORCELÂNICO BRERA ARENA 30x60 Rect.|ARENA|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
292|PRC|4|Revestimento PORCELÂNICO BRERA ARENA 45x45|ARENA|Natural||2D|45|45||cm|2|1|11.25|18.75||m2
293|PRC|3|Revestimento PORCELÂNICO BRERA ARENA 60x60 Rect.|ARENA|Natural||2D|60|60||cm|2|1|11.5|19.17|62RA75R|m2
294|PRC|4|Revestimento PORCELÂNICO BRERA ARENA 80x80|ARENA|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
295|PRC|3|Revestimento PORCELÂNICO BRERA TAUPE 30x60 Rect.|Taupe|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
296|PRC|4|Revestimento PORCELÂNICO BRERA TAUPE 45x45|Taupe|Natural||2D|45|45||cm|2|1|11.25|18.75||m2
297|PRC|3|Revestimento PORCELÂNICO BRERA TAUPE 60x60 Rect.|Taupe|Natural||2D|60|60||cm|2|1|11.5|19.17||m2
298|PRC|4|Revestimento PORCELÂNICO BRERA TAUPE 80x80|Taupe|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
299|PRC|3|Revestimento PORCELÂNICO BRERA CEMENTO 30x60 Rect.|Cemento|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
300|PRC|4|Revestimento PORCELÂNICO BRERA CEMENTO 45x45|Cemento|Natural||2D|45|45||cm|2|1|11.25|18.75||m2
301|PRC|3|Revestimento PORCELÂNICO BRERA CEMENTO 60x60 Rect.|Cemento|Natural||2D|60|60||cm|2|1|11.5|19.17||m2
302|PRC|4|Revestimento PORCELÂNICO BRERA CEMENTO 80x80|Cemento|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
303|PRC|3|Revestimento PORCELÂNICO BRERA ANTRACITE 30x60 Rect.|Antracite|Natural||2D|30|60||cm|2|1|11.5|19.17||m2
304|PRC|4|Revestimento PORCELÂNICO BRERA ANTRACITE 45x45|Antracite|Natural||2D|45|45||cm|2|1|11.25|18.75|42RA-68|m2
305|PRC|3|Revestimento PORCELÂNICO BRERA ANTRACITE 60x60 Rect.|Antracite|Natural||2D|60|60||cm|2|1|11.5|19.17|62RA65R|m2
306|PRC|4|Revestimento PORCELÂNICO BRERA ANTRACITE 80x80|Antracite|Natural||2D|80|80||cm|2|1|13.45|22.42||m2
307|PRC|8|Revestimento PORCELÂNICO SAJONIA ROBLE 14,5x120|Roble|Natural||2D|14.5|120||cm|3|1|15.1|25.17||m2
308|PRC|8|Revestimento PORCELÂNICO SAJONIA ROBLE 19,5x120|Roble|Natural||2D|19.5|120||cm|3|1|15.1|25.17|19SJ79T|m2
309|PRC|8|Revestimento PORCELÂNICO SAJONIA ROBLE 19,5x120 Anti.|Roble|Antiderrapante||2D|19.5|120||cm|3|1|18.1|30.17||m2
310|PRC|8|Revestimento PORCELÂNICO SAJONIA NOGAL 14,5x120|Nogal|Natural||2D|14.5|120||cm|3|1|15.1|25.17||m2
311|PRC|8|Revestimento PORCELÂNICO SAJONIA NOGAL 19,5x120|Nogal|Natural||2D|19.5|120||cm|3|1|15.1|25.17|19SJ99T|m2
312|PRC|8|Revestimento PORCELÂNICO SAJONIA NOGAL 19,5x120 Anti.|Nogal|Antiderrapante||2D|19.5|120||cm|3|1|18.1|30.17||m2
313|PRC|7|Revestimento PORCELÂNICO PRIORATO ROBLE 19,5x120|Roble|Natural||2D|19.5|120||cm|2|1|13.45|22.42|19FU79T|m2
314|PRC|7|Revestimento PORCELÂNICO PRIORATO ROBLE 19,5x120 Anti.|Roble|Antiderrapante||2D|19.5|120||cm|2|1|16.45|27.42||m2
315|CR|3|Revestimento CERÂMICO MALMO FRESNO 45x120|Fresno|Natural||2D|45|120||cm|3|1|18.35|30.58|64E2528|m2
316|CR|9|Revestimento CERÂMICO ATREZO PALCO ARENA 30x60||Natural||2D|30|60||cm|3|1|11.95|19.92||m2
317|CR|9|Revestimento CERÂMICO ATREZO PALCO ARENA 45x120||Natural||2D|45|120||cm|3|1|18.35|30.58|64TZ728|m2
318|CR|10|Revestimento CERÂMICO BAVIERA BONN BLANCO 45x120|Branco|Natural||2D|45|120||cm|3|1|18.35|30.58|64VI428|m2
319|CR|11|Revestimento CERÂMICO BAVIERA MUNICH BLANCO 45x120|Branco|Natural||2D|45|120||cm|3|1|18.35|30.58|64VI418|m2
320|CR|4|Revestimento CERÂMICO SIROS SIENA 60x120|Siena|Natural||2D|60|120||cm|3|1|18.15|30.25||m2
321|CR|4|Revestimento CERÂMICO SIROS MENTA 60x120|Menta|Natural||2D|60|120||cm|3|1|18.15|30.25|97SO609|m2
322|CR|4|Revestimento CERÂMICO SIROS ÍNDIGO 60x120|Índigo|Natural||2D|60|120||cm|3|1|18.15|30.25|97SO509|m2
323|CR|5|Revestimento CERÂMICO TASOS SIENA 60x120|Siena|Natural||2D|60|120||cm|3|1|20.15|33.58||m2
324|CR|5|Revestimento CERÂMICO TASOS MENTA 60x120|Menta|Natural||2D|60|120||cm|3|1|20.15|33.58|97SO159|m2
325|CR|5|Revestimento CERÂMICO TASOS ÍNDIGO 60x120|Índigo|Natural||2D|60|120||cm|3|1|20.15|33.58|97SO559|m2
326|CR|7|Revestimento CERÂMICO LUCIA GRIS 7,5x30|GRIS|Natural||2D|7.5|30||cm|3|1|18.5|30.83|06DLU30|m2
327|CR|7|Revestimento CERÂMICO LUCIA TAUPE 7,5x30|Taupe|Natural||2D|7.5|30||cm|3|1|18.5|30.83|06DLU20|m2
328|CR|7|Revestimento CERÂMICO LUCIA PERLA 7,5x30|Perla|Natural||2D|7.5|30||cm|3|1|18.5|30.83|06DLU00|m2
329|CR|12|Revestimento CERÂMICO LUCIA STAGE 7,5x30||Natural||2D|7.5|30||cm|3|1|18.5|30.83|06DLU60|m2
330|CR|7|Revestimento CERÂMICO LUCIA MALVA 7,5x30|Malva|Natural||2D|7.5|30||cm|3|1|18.5|30.83||m2
331|CR|6|Revestimento CERÂMICO GRACIA NAVY 7,5x30|Navy|Natural||2D|7.5|30||cm|3|1|18.5|30.83|06DGR50|m2
332|CR|6|Revestimento CERÂMICO GRACIA CELESTE 7,5x30|Celeste|Natural||2D|7.5|30||cm|3|1|18.5|30.83|06DGR80|m2
333|CR|6|Revestimento CERÂMICO GRACIA PERLA 7,5x30|Perla|Natural||2D|7.5|30||cm|3|1|18.5|30.83|06DGR00|m2
334|CR|6|Revestimento CERÂMICO GRACIA ARENA 7,5x30|ARENA|Natural||2D|7.5|30||cm|3|1|18.5|30.83|06DGR70|m2
335|CR|6|Revestimento CERÂMICO GRACIA JADE 7,5x30|Jade|Natural||2D|7.5|30||cm|3|1|18.5|30.83|06DGR60|m2
336|SP|1|Revestimento SPC ARANCIO BEJE|Bege|Natural||2D|182|1220||mm|4|2|21.5|41||m2
337|SP|1|Revestimento SPC ARANCIO CINZA|Cinza|Natural||2D|182|1220||mm|4|2|21.5|41||m2
338|SP|1|Revestimento SPC ARANCIO TAUPE|Taupe|Natural|||||||4|2|21.5|41||m2
339|SP|1|Revestimento SPC ARANCIO CASTANHO|Castanho|Natural||2D|182|1220||mm|4|2|21.5|41||m2
340|SP|2|Revestimento SPC DORSET ROBLE 5,5mm|Roble|Natural|||||||5|3|21.5|41||m2
341|SP|3|Revestimento SPC SEVERN FRESNO 5,5mm|Fresno|Natural|||||||5|3|21.5|41||m2
342|SP|4|Revestimento SPC TERENT ABERTO 5,5mm||Natural|||||||5|3|21.5|41||m2
343|SP|5|Revestimento SPC CLYDE HUMO 5,5mm||Natural|||||||5|3|21.5|41|18CLY075441|m2
344|SP|6|Revestimento SPC ARLES ARENA 5,5mm|ARENA|Natural|||||||5|3|21.5|41||m2
345|SP|6|Revestimento SPC ARLES GRIS 5,5mm|GRIS|Natural|||||||5|3|21.5|41||m2
346|SP|7|Revestimento SPC LEVANTE 5,5mm||Natural|||||||5|3|21.5|41|47LEV025441|m2
347|SP|8|Revestimento SPC TURIA 5,5mm||Natural|||||||5|3|21.5|41||m2
348|SP|9|Revestimento SPC TORMES 5,5mm||Natural|||||||5|3|21.5|41||m2
349|SP|10|Rodapé SPC Branco 7 cm M/L|Branco|Natural|||||||5|3|3.36|5.6||ml
350|SP|11|Rodapé SPC Decorado M/L||Natural|||||||5|3|4.26|7.1|00NVZ000095|ml
351|SP|12|Revestimento SPC AVON ABETO 5,5mm|Abeto|Natural|||||||5|3|21.5|41||m2
352|SP|12|Revestimento SPC AVON NOGAL 5,5mm|Nogal|Natural|||||||5|3|21.5|58||m2
353|SP|2|Revestimento SPC DORSET FRESNO 5,5mm|Fresno|Natural|||||||5|3|21.5|41||m2
354|SP|13|Revestimento SPC ANETO 23x152,4||Natural||2D|23|152.4||cm|5|3|21.5|41|23ANE025441|m2
355|SP|3|Revestimento SPC SEVERN ROBLE 5,5mm|Roble|Natural|||||||5|3|21.5|41||m2
356|SP|14|Revestimento SPC NERVION 5,5mm||Natural|||||||5|3|21.5|41|23NER025411|m2
357|PRC|10|Revestimento PORCELÂNICO ARMANI ORO BIANCO Polido 60x120||Polido||2D|60|120||cm|6|4|14|23.33|RA60120ORBP|m2
358|PRC|11|Revestimento PORCELÂNICO ARMANI CALACATA VENATTINO Polido 60x120||Polido||2D|60|120||cm|6|4|14|23.33|RA60120VTIP|m2
359|PRC|12|Revestimento PORCELÂNICO BLANCO PURO Polido 60x120||Polido||2D|60|120||cm|6|4|14|23.33|RBP60120|m2
360|PRC|12|Revestimento PORCELÂNICO BLANCO PURO Mate 60x120||Mate||2D|60|120||cm|6|4|14|23.33|RBP60120MT|m2
361|PRC|13|Revestimento PORCELÂNICO TRAVERTINO NAVONA BIANCO Polido 60x120|Branco|Polido||2D|60|120||cm|6|4|14|23.33|RTN60120PB|m2
362|PRC|13|Revestimento PORCELÂNICO TRAVERTINO NAVONA BIANCO Mate 60x120 (sem preço)|Branco|Mate||2D|60|120||cm|6|4|||RTN60120B|m2
363|CL|5|Revestimento CERÂMICO LAMINADO ARLES BLANCO 60x120|Branco|Natural||2D|60|120||cm|1|1|17.99|29.98|44RL49R|m2
364|CR|3|Revestimento CERÂMICO MALMO CIPRES 45x120|Cipres|Natural||2D|45|120||cm|3|1|18.35|30.58|64E2728|m2
365|CR|1|Revestimento CERÂMICO ATREZO BLANCO 45x120|Branco|Natural||2D|45|120||cm|3|1|16.35|27.25|64TZ408|m2
366|PRC|9|Revestimento PORCELÂNICO VOLTERRA BEIGE 60x120|Bege|Natural||2D|60|120||cm|3|1|16.75|27.92|44V179R|m2
367|PRC|7|Revestimento PORCELÂNICO PRIORATO NOGAL 19,5x120|Nogal|Natural||2D|19.5|120||cm|2|1|13.45|22.42|19FU99T|m2
$linhas$, '\r?\n') AS s WHERE s <> '') x;
  IF EXISTS (SELECT 1 FROM _rv_linhas l WHERE l.unidade IS NULL OR l.unidade = '') THEN
    RAISE EXCEPTION 'revestimentos_mudelar: há linhas de dados com campos a menos.';
  END IF;

  -- os dados gerados estão inteiros
  SELECT count(*), count(DISTINCT l.nome) INTO v_n, v_m FROM _rv_linhas l;
  IF v_n <> c_total OR v_m <> c_total THEN
    RAISE EXCEPTION 'revestimentos_mudelar: os dados gerados têm % linhas (% nomes) em vez de %.', v_n, v_m, c_total;
  END IF;
  IF (SELECT count(l.custo) FROM _rv_linhas l) <> c_n_custo OR (SELECT count(l.pvp) FROM _rv_linhas l) <> c_n_pvp
     OR (SELECT count(l.cod_forn) FROM _rv_linhas l) <> c_n_cod OR (SELECT count(*) FROM _rv_opcoes) <> c_n_opcoes
     OR (SELECT count(*) FROM _rv_linhas l WHERE l.unidade = 'ml') <> c_n_ml THEN
    RAISE EXCEPTION 'revestimentos_mudelar: as contagens de preços, códigos, opções ou unidades geradas não batem.';
  END IF;
  IF EXISTS (SELECT 1 FROM _rv_linhas l
             WHERE NOT EXISTS (SELECT 1 FROM _rv_modelos m WHERE m.sub = l.sub AND m.numero = l.modelo)
                OR EXISTS (SELECT 1 FROM (VALUES ('cor', l.cor), ('acabamento', l.acab), ('aplicacao', l.aplic)) AS v(papel, nome)
                           WHERE v.nome IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _rv_opcoes o WHERE o.papel = v.papel AND o.nome = v.nome))
                OR (l.med_tipo IS NOT NULL AND (l.med_tipo NOT IN ('2D', '3D') OR l.med_l IS NULL OR l.med_a IS NULL
                                                OR (l.med_tipo = '3D') <> (l.med_p IS NOT NULL) OR l.med_u NOT IN ('cm', 'mm')))
                OR (l.med_tipo IS NULL AND (l.med_l IS NOT NULL OR l.med_u IS NOT NULL))
                OR NOT EXISTS (SELECT 1 FROM _rv_forn f WHERE f.n = l.fornecedor)
                OR NOT EXISTS (SELECT 1 FROM _rv_marcas b WHERE b.n = l.marca)
                OR l.unidade NOT IN ('m2', 'ml') OR l.custo <= 0 OR l.pvp <= 0
                OR (l.pvp IS NULL AND (l.custo IS NOT NULL OR l.nome NOT LIKE '% (sem preço)'))
                OR (l.pvp IS NOT NULL AND l.nome LIKE '% (sem preço)')) THEN
    RAISE EXCEPTION 'revestimentos_mudelar: há linhas com modelo, opção, medida, marca, fornecedor, unidade, preço ou nome fora do esperado.';
  END IF;
  IF (SELECT sum(m.esperados) FROM _rv_modelos m) <> c_total OR (SELECT sum(s.esperados) FROM _rv_subs s) <> c_total
     OR (SELECT count(*) FROM _rv_modelos) <> c_n_modelos
     OR EXISTS (SELECT 1 FROM _rv_modelos m GROUP BY m.sub, public.fn_cat_chave_opcao(m.nome) HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM _rv_modelos m WHERE m.esperados <> (SELECT count(*) FROM _rv_linhas l WHERE l.sub = m.sub AND l.modelo = m.numero)) THEN
    RAISE EXCEPTION 'revestimentos_mudelar: os modelos gerados não batem (contagens, ou nomes de modelo repetidos na subcategoria).';
  END IF;
  -- produto = modelo + atributos: nenhuma combinação repetida (senão o SKU repetia)
  SELECT string_agg(x.k, '; ') INTO v_txt FROM (
    SELECT l.sub || lpad(l.modelo::text, 4, '0') || ' ' || concat_ws('/', l.cor, l.acab, l.aplic, l.med_tipo, l.med_l, l.med_a, l.med_p, l.med_u) AS k
    FROM _rv_linhas l
    GROUP BY l.sub, l.modelo, l.cor, l.acab, l.aplic, l.med_tipo, l.med_l, l.med_a, l.med_p, l.med_u
    HAVING count(*) > 1 LIMIT 10) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'revestimentos_mudelar: combinações repetidas (mesmo modelo e atributos): %', v_txt; END IF;

  -- as subcategorias que já existem (as que faltam criam-se no passo 5)
  FOR r IN SELECT s.codigo, s.nome FROM _rv_subs s ORDER BY s.ordem LOOP
    SELECT count(*), (array_agg(c.id ORDER BY c.created_at, c.id))[1], (array_agg(coalesce(c.is_active, true) ORDER BY c.created_at, c.id))[1],
           (array_agg(c.sigla ORDER BY c.created_at, c.id))[1]
      INTO v_n, v_id, v_ativa, v_txt
    FROM product_categories c
    WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL
      AND public.fn_cat_chave_opcao(c.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n > 1 THEN RAISE EXCEPTION 'revestimentos_mudelar: há % subcategorias «%» em «%».', v_n, r.nome, c_cat_nome; END IF;
    IF v_n = 1 THEN
      IF NOT v_ativa THEN RAISE EXCEPTION 'revestimentos_mudelar: a subcategoria «%» está desativada.', r.nome; END IF;
      IF v_txt IS DISTINCT FROM r.codigo THEN
        RAISE EXCEPTION 'revestimentos_mudelar: a sigla de «%» é % (esperada %).', r.nome, coalesce(v_txt, 'nenhuma'), r.codigo;
      END IF;
      UPDATE _rv_subs s SET sub_id = v_id WHERE s.codigo = r.codigo;
    END IF;
  END LOOP;
  -- produtos nas subcategorias (vivos ou apagados: um apagado guarda o SKU) → inerte
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _rv_subs s);
  IF v_n > 0 THEN
    RAISE NOTICE 'revestimentos_mudelar: as subcategorias de «%» já têm % produtos — nada a fazer.', c_cat_nome, v_n;
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.name IN (SELECT l.nome FROM _rv_linhas l);
  IF v_n > 0 THEN
    RAISE NOTICE 'revestimentos_mudelar: a Mudelar já tem % produtos vivos com nomes do Excel — nada a fazer.', v_n;
    RETURN;
  END IF;
  SELECT string_agg(s.codigo || ': ' || pm.name || ' (' || lpad(pm.numero::text, 4, '0') || (CASE WHEN pm.deleted_at IS NOT NULL THEN ', apagado' ELSE '' END) || ')', ', ')
    INTO v_txt
  FROM product_models pm JOIN _rv_subs s ON s.sub_id = pm.subcategory_id
  WHERE pm.organization_id = c_org
    AND EXISTS (SELECT 1 FROM _rv_modelos m
                WHERE m.sub = s.codigo
                  AND (pm.numero = m.numero OR (pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)))
                  AND NOT (pm.numero = m.numero AND pm.deleted_at IS NULL AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome)));
  IF v_txt IS NOT NULL THEN
    RAISE NOTICE 'revestimentos_mudelar: as subcategorias já têm modelos com estes nomes ou números, diferentes dos do Excel (%) — nada a fazer.', left(v_txt, 1500);
    RETURN;
  END IF;

  -- ─── Configuração que tem de existir (senão: erro) ───────────────────────────
  IF v_cat_sigla IS DISTINCT FROM c_cat_sigla THEN
    RAISE EXCEPTION 'revestimentos_mudelar: a sigla de «%» é % (esperada %).', c_cat_nome, coalesce(v_cat_sigla, 'nenhuma'), c_cat_sigla;
  END IF;
  IF NOT v_cat_ativa THEN RAISE EXCEPTION 'revestimentos_mudelar: «%» está desativada.', c_cat_nome; END IF;
  -- uma subcategoria por criar não pode ter a sigla já usada por outra irmã
  SELECT string_agg(c.name || ' (' || c.sigla || ')', ', ') INTO v_txt
  FROM product_categories c JOIN _rv_subs s ON s.sub_id IS NULL AND c.sigla = s.codigo
  WHERE c.organization_id = c_org AND c.parent_id = v_cat AND c.deleted_at IS NULL;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'revestimentos_mudelar: outras subcategorias de «%» já têm as siglas: %.', c_cat_nome, v_txt; END IF;

  -- quem fica em created_by: o membro ativo mais antigo da Mudelar (como 20270118400000)
  SELECT m.user_id INTO v_criador
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND coalesce(m.role_is_client, false) = false
  ORDER BY m.created_at, m.user_id LIMIT 1;
  IF v_criador IS NULL THEN RAISE EXCEPTION 'revestimentos_mudelar: a Mudelar não tem um membro ativo para created_by.'; END IF;

  -- atributos base (pelo código): cor e acabamento de lista; medida em cm
  SELECT string_agg(x.c || '=' || coalesce(y.n, 0), ', ') INTO v_txt
  FROM unnest(ARRAY['cor', 'acabamento', 'medida']) AS x(c)
  LEFT JOIN (SELECT a.code::text AS c, count(*) AS n FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL
             GROUP BY a.code) y ON y.c = x.c
  WHERE coalesce(y.n, 0) <> 1;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'revestimentos_mudelar: a Mudelar tem de ter um atributo de cada (%).', v_txt; END IF;
  SELECT a.id, a.unit::text INTO v_a_med, v_med_unit FROM product_attributes a
  WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.code::text = 'medida' AND a.is_measurement AND coalesce(a.sku_entra, false);
  IF v_a_med IS NULL THEN RAISE EXCEPTION 'revestimentos_mudelar: a Medida da Mudelar não é medida ou não entra no SKU.'; END IF;
  IF coalesce(lower(v_med_unit), 'cm') <> 'cm' THEN
    RAISE EXCEPTION 'revestimentos_mudelar: a Medida da Mudelar está em «%» (esperado cm).', v_med_unit;
  END IF;

  -- amostra de SKUs de outras categorias, para conferir que ficam iguais
  CREATE TEMP TABLE _rv_amostra ON COMMIT DROP AS
  SELECT x.id, x.sku FROM (
    SELECT p.id, p.sku, row_number() OVER (PARTITION BY p.subcategory_id ORDER BY p.sku, p.id) AS n
    FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted) x
  WHERE x.n <= 3;

  -- ─── Locks (as chaves das funções de gestão do Catálogo) ─────────────────────
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_guardar_atributo:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_marcas:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sku_config:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_cat:' || c_org::text || ':' || v_cat::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_fornecedores:' || c_org::text, 0));

  PERFORM set_config('app.audit_source', c_fonte, true);
  PERFORM set_config('app.audit_user_id', v_criador::text, true);

  -- o que JÁ foi escrito nesta transação antes desta importação (outra migration no mesmo lote): a verificação final do
  -- xmin não o conta como escrito por esta
  v_xid := (txid_current() % 4294967296)::text;
  CREATE TEMP TABLE _rv_antes ON COMMIT DROP AS
  SELECT 'products'::text AS t, x.id FROM products x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_prices', x.id FROM product_prices x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_attribute_values', x.id FROM product_attribute_values x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_organizations', x.id FROM product_organizations x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'item_suppliers', x.id FROM item_suppliers x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'suppliers', x.id FROM suppliers x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'brands', x.id FROM brands x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_categories', x.id FROM product_categories x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_models', x.id FROM product_models x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'uom', x.id FROM uom x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'product_attributes', x.id FROM product_attributes x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'attribute_option_groups', x.id FROM attribute_option_groups x WHERE x.xmin::text = v_xid
  UNION ALL SELECT 'attribute_option_group_values', x.id FROM attribute_option_group_values x WHERE x.xmin::text = v_xid;
  ALTER TABLE _rv_antes ADD PRIMARY KEY (t, id);

  -- ─── 1. A ordem do SKU de hoje (para provar no fim que nenhum atributo existente mudou de posição relativa) ──
  SELECT array_agg(a.id ORDER BY a.sku_ordem NULLS LAST, coalesce(a.sort_order, 0), a.label, a.id) INTO v_ordem_antes
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL;

  -- ─── 2. A Aplicação (lista, entra no SKU no fim da ordem): procurada pelo código ou pelo nome, criada se faltar ──
  SELECT count(*), (array_agg(a.id))[1] INTO v_n, v_a_aplic FROM product_attributes a
  WHERE a.organization_id = c_org AND a.deleted_at IS NULL
    AND (a.code::text = 'aplicacao' OR public.fn_cat_chave_opcao(a.label::text) = public.fn_cat_chave_opcao('Aplicação'));
  IF v_n > 1 THEN RAISE EXCEPTION 'revestimentos_mudelar: a Mudelar tem % atributos «Aplicação».', v_n; END IF;
  IF v_n = 0 THEN
    SELECT count(*), coalesce(max(pa.sort_order), 0) + 1, coalesce(max(pa.sku_ordem), 0) + 1 INTO v_n, v_ordem, v_i
    FROM product_attributes pa WHERE pa.organization_id = c_org AND pa.deleted_at IS NULL;
    IF v_n >= c_max_atributos THEN RAISE EXCEPTION 'revestimentos_mudelar: a Mudelar já tem o máximo de atributos (%).', c_max_atributos; END IF;
    -- um código apagado não se reutiliza (product_attributes_organization_id_code_key): leva _2, _3…
    v_code := 'aplicacao'; v_k := 1;
    WHILE EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.organization_id = c_org AND pa.code = v_code) LOOP
      v_k := v_k + 1;
      v_code := 'aplicacao_' || v_k::text;
    END LOOP;
    -- como cat_guardar_atributo: lista, grupo de opções da organização, entra no SKU (a seguir ao último)
    INSERT INTO product_attributes (organization_id, code, label, type, value_type, has_hex_color, is_measurement,
                                    measurement_type, unit, pricing_type, valorization_type, is_variant_option,
                                    is_variant_attribute, sort_order, created_by, sku_entra, sku_ordem)
    VALUES (c_org, v_code, 'Aplicação', 'select'::public.attribute_type, 'list', false, false, NULL, NULL, 'none', 'none', false, false,
            v_ordem, v_criador, true, v_i)
    RETURNING id INTO v_a_aplic;
    INSERT INTO attribute_option_groups (attribute_id, organization_id, name, sort_order, is_active, created_by)
    VALUES (v_a_aplic, c_org, 'Aplicação', v_ordem, true, v_criador);
    v_aplic_criado := true;
  END IF;

  CREATE TEMP TABLE _rv_attr (papel text PRIMARY KEY, id uuid NOT NULL UNIQUE, grupo uuid, medida boolean NOT NULL,
                              sku_ordem integer, ordem integer NOT NULL, nome text NOT NULL, entra boolean NOT NULL) ON COMMIT DROP;
  INSERT INTO _rv_attr (papel, id, grupo, medida, sku_ordem, ordem, nome, entra)
  SELECT x.papel, a.id, (CASE WHEN NOT a.is_measurement THEN public.fn_cat_grupo_do_atributo(a.id, c_org) END), a.is_measurement,
         a.sku_ordem, coalesce(a.sort_order, 0), a.label::text, coalesce(a.sku_entra, false)
  FROM (SELECT 'aplicacao'::text AS papel, v_a_aplic AS id
        UNION ALL
        SELECT a2.code::text, a2.id FROM product_attributes a2
        WHERE a2.organization_id = c_org AND a2.deleted_at IS NULL AND a2.code::text IN ('cor', 'acabamento', 'medida')) x
  JOIN product_attributes a ON a.id = x.id;
  IF (SELECT count(*) FROM _rv_attr) <> 4 THEN RAISE EXCEPTION 'revestimentos_mudelar: os 4 atributos não são distintos.'; END IF;
  SELECT string_agg(t.nome, ', ') INTO v_txt FROM _rv_attr t JOIN product_attributes a ON a.id = t.id
  WHERE NOT t.entra OR t.sku_ordem IS NULL OR (t.papel = 'medida') <> t.medida
     OR (NOT t.medida AND (a.type::text <> 'select' OR NOT EXISTS (SELECT 1 FROM attribute_option_groups g WHERE g.id = t.grupo AND g.organization_id = c_org)));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'revestimentos_mudelar: atributos que não entram no SKU, de outro tipo ou sem grupo de opções da Mudelar: %.', v_txt;
  END IF;
  IF (SELECT count(DISTINCT t.grupo) FROM _rv_attr t WHERE NOT t.medida) <> 3 THEN
    RAISE EXCEPTION 'revestimentos_mudelar: os atributos de lista partilham grupos de opções.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_sigla_opc:' || t.grupo::text, 0))
  FROM (SELECT t2.grupo FROM _rv_attr t2 WHERE t2.grupo IS NOT NULL ORDER BY t2.grupo) t;

  SELECT array_agg(a.id ORDER BY a.sku_ordem NULLS LAST, coalesce(a.sort_order, 0), a.label, a.id) INTO v_ordem_depois
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.id = ANY (v_ordem_antes);
  IF v_ordem_depois IS DISTINCT FROM v_ordem_antes THEN
    RAISE EXCEPTION 'revestimentos_mudelar: a ordem do SKU dos atributos que já existiam mudou (os SKUs existentes mudavam).';
  END IF;
  IF v_aplic_criado AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.attribute_id = v_a_aplic) THEN
    RAISE EXCEPTION 'revestimentos_mudelar: o atributo acabado de criar já tem valores.';
  END IF;

  -- ─── 3. As opções (procuradas pelo nome sem acentos/maiúsculas; as novas com a sigla do gerador, ou uma livre se estiver
  --        ocupada — uma a uma, para duas novas nunca ficarem com a mesma) ──────────────────────────
  UPDATE _rv_opcoes o SET grupo = t.grupo FROM _rv_attr t WHERE t.papel = o.papel;
  UPDATE _rv_opcoes o SET opcao_id = v.id
  FROM attribute_option_group_values v
  WHERE v.group_id = o.grupo AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(o.nome);
  SELECT string_agg(o.papel || ' ' || o.nome, ', ') INTO v_txt FROM _rv_opcoes o
  WHERE o.grupo IS NULL
     OR (SELECT count(*) FROM attribute_option_group_values v
         WHERE v.group_id = o.grupo AND public.fn_cat_chave_opcao(v.value_text::text) = public.fn_cat_chave_opcao(o.nome)) > 1
     OR (o.opcao_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM attribute_option_group_values v WHERE v.id = o.opcao_id AND v.is_active AND v.sigla IS NOT NULL));
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'revestimentos_mudelar: opções ambíguas, desativadas ou sem sigla: %.', v_txt; END IF;
  FOR r IN SELECT o.papel, o.nome, o.sigla_nova, o.ordem, o.grupo FROM _rv_opcoes o WHERE o.opcao_id IS NULL ORDER BY o.papel, o.ordem LOOP
    v_sigla := r.sigla_nova;
    IF EXISTS (SELECT 1 FROM attribute_option_group_values v WHERE v.group_id = r.grupo AND v.sigla = v_sigla) THEN
      v_sigla := public.fn_cat_sigla_opcao_livre(r.grupo, r.nome, NULL);
      IF v_sigla IS NULL OR v_sigla !~ '^[A-Z0-9]{1,6}$'
         OR EXISTS (SELECT 1 FROM attribute_option_group_values v WHERE v.group_id = r.grupo AND v.sigla = v_sigla) THEN
        RAISE EXCEPTION 'revestimentos_mudelar: sem sigla livre para a opção «%» de %.', r.nome, r.papel;
      END IF;
    END IF;
    INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active, sigla)
    VALUES (r.grupo, r.nome, r.nome, NULL,
            coalesce((SELECT max(v.sort_order) FROM attribute_option_group_values v WHERE v.group_id = r.grupo), 0) + 1, true, v_sigla)
    RETURNING id INTO v_id;
    UPDATE _rv_opcoes o SET opcao_id = v_id, criada = true WHERE o.papel = r.papel AND o.nome = r.nome;
  END LOOP;
  UPDATE _rv_opcoes o SET valor = v.value_text::text, sigla = v.sigla FROM attribute_option_group_values v WHERE v.id = o.opcao_id;
  IF EXISTS (SELECT 1 FROM _rv_opcoes o WHERE o.opcao_id IS NULL OR o.valor IS NULL OR o.sigla IS NULL) THEN
    RAISE EXCEPTION 'revestimentos_mudelar: há opções que não ficaram criadas.';
  END IF;
  SELECT coalesce(string_agg(o.papel || ':' || o.nome || '=' || o.sigla, ', ' ORDER BY o.papel, o.ordem), '') INTO v_opc_criadas
  FROM _rv_opcoes o WHERE o.criada;

  -- ─── 4. Marcas: pelo nome; «Materia SPC» renomeia a «Materiaspc» se só essa existir; a que faltar cria-se ─────
  FOR r IN SELECT b.n, b.nome FROM _rv_marcas b ORDER BY b.n LOOP
    SELECT count(*), (array_agg(x.id ORDER BY x.created_at, x.id))[1], (array_agg(coalesce(x.is_active, true) ORDER BY x.created_at, x.id))[1]
      INTO v_n, v_id, v_ativa
    FROM brands x WHERE x.organization_id = c_org AND x.deleted_at IS NULL AND public.fn_cat_chave_opcao(x.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n = 0 AND r.nome = 'Materia SPC' THEN
      SELECT count(*), (array_agg(x.id ORDER BY x.created_at, x.id))[1], (array_agg(coalesce(x.is_active, true) ORDER BY x.created_at, x.id))[1]
        INTO v_n, v_id, v_ativa
      FROM brands x WHERE x.organization_id = c_org AND x.deleted_at IS NULL AND public.fn_cat_chave_opcao(x.name) = 'materiaspc';
      IF v_n = 1 THEN
        IF EXISTS (SELECT 1 FROM products p WHERE p.brand_id = v_id) THEN
          RAISE EXCEPTION 'revestimentos_mudelar: a marca «Materiaspc» já tem produtos; não se renomeia sem decisão.';
        END IF;
        UPDATE brands x SET name = r.nome WHERE x.id = v_id;
        v_marca_txt := v_marca_txt || 'Materiaspc renomeada para Materia SPC; ';
      END IF;
    END IF;
    IF v_n > 1 THEN RAISE EXCEPTION 'revestimentos_mudelar: a Mudelar tem % marcas «%».', v_n, r.nome; END IF;
    IF v_n = 0 THEN
      INSERT INTO brands (organization_id, name, slug, is_active, created_by)
      VALUES (c_org, r.nome, public.fn_cat_slug(r.nome), true, v_criador)
      RETURNING id INTO v_id;
      v_ativa := true;
      v_marca_txt := v_marca_txt || r.nome || ' criada; ';
    END IF;
    IF NOT v_ativa THEN RAISE EXCEPTION 'revestimentos_mudelar: a marca «%» está desativada.', r.nome; END IF;
    UPDATE _rv_marcas b SET id = v_id WHERE b.n = r.n;
  END LOOP;

  -- ─── 5. Subcategorias que faltem (como fn_cat_categoria_produto: slug, path = pai/slug) ─────
  FOR r IN SELECT s.codigo, s.nome FROM _rv_subs s WHERE s.sub_id IS NULL ORDER BY s.ordem LOOP
    INSERT INTO product_categories (name, slug, path, parent_id, sort_order, is_active, created_by, organization_id, sigla)
    SELECT r.nome, public.fn_cat_slug(r.nome), lower(c.name) || '/' || public.fn_cat_slug(r.nome), c.id,
           coalesce((SELECT max(x.sort_order) FROM product_categories x WHERE x.parent_id = c.id AND x.deleted_at IS NULL), -1) + 1,
           true, v_criador, c_org, r.codigo
    FROM product_categories c WHERE c.id = v_cat
    RETURNING id INTO v_id;
    UPDATE _rv_subs s SET sub_id = v_id, criada = true WHERE s.codigo = r.codigo;
    v_subs_criadas := v_subs_criadas || r.nome || '; ';
  END LOOP;
  IF EXISTS (SELECT 1 FROM _rv_subs s WHERE s.sub_id IS NULL) THEN
    RAISE EXCEPTION 'revestimentos_mudelar: há subcategorias que não ficaram resolvidas.';
  END IF;
  FOR r IN SELECT s.sub_id FROM _rv_subs s ORDER BY s.sub_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_modelos:' || c_org::text || ':' || r.sub_id::text, 0));
  END LOOP;

  -- ─── 6. Os modelos ────────────────────────────────────────────────────────────
  UPDATE _rv_modelos m SET modelo_id = pm.id
  FROM product_models pm JOIN _rv_subs s ON s.sub_id = pm.subcategory_id
  WHERE s.codigo = m.sub AND pm.organization_id = c_org AND pm.numero = m.numero AND pm.deleted_at IS NULL
    AND public.fn_cat_chave_opcao(pm.name) = public.fn_cat_chave_opcao(m.nome);
  IF EXISTS (SELECT 1 FROM _rv_modelos m JOIN product_models pm ON pm.id = m.modelo_id WHERE NOT pm.is_active) THEN
    RAISE EXCEPTION 'revestimentos_mudelar: há modelos destes já existentes e desativados.';
  END IF;
  SELECT count(*) FILTER (WHERE pm.is_active), count(*) INTO v_n, v_m
  FROM product_models pm WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL;
  SELECT count(*) INTO v_k FROM _rv_modelos m WHERE m.modelo_id IS NULL;
  IF v_n + v_k > c_max_modelos_ativos OR v_m + v_k > c_max_modelos_vivos THEN
    RAISE EXCEPTION 'revestimentos_mudelar: a Mudelar passaria o teto de modelos (% ativos, % vivos, % novos).', v_n, v_m, v_k;
  END IF;
  INSERT INTO product_models (organization_id, subcategory_id, name, numero, is_active, created_by)
  SELECT c_org, s.sub_id, m.nome, m.numero, true, v_criador
  FROM _rv_modelos m JOIN _rv_subs s ON s.codigo = m.sub WHERE m.modelo_id IS NULL ORDER BY s.ordem, m.numero;
  UPDATE _rv_modelos m SET modelo_id = pm.id
  FROM product_models pm JOIN _rv_subs s ON s.sub_id = pm.subcategory_id
  WHERE m.modelo_id IS NULL AND s.codigo = m.sub AND pm.organization_id = c_org AND pm.numero = m.numero
    AND pm.deleted_at IS NULL AND pm.name = m.nome;
  IF EXISTS (SELECT 1 FROM _rv_modelos m WHERE m.modelo_id IS NULL) THEN
    RAISE EXCEPTION 'revestimentos_mudelar: há modelos que não ficaram gravados.';
  END IF;

  -- ─── 7. Unidades (m2 e ml, criadas por fn_cat_unidade se faltarem) e fornecedores ─────
  v_m2_criada := NOT EXISTS (SELECT 1 FROM uom u WHERE (u.organization_id IS NULL OR u.organization_id = c_org)
                             AND lower(btrim(u.code)) = 'm2');
  CREATE TEMP TABLE _rv_uom ON COMMIT DROP AS
  SELECT x.codigo, public.fn_cat_unidade(c_org, x.codigo) AS id FROM (VALUES ('m2'), ('ml')) AS x(codigo);
  IF EXISTS (SELECT 1 FROM _rv_uom u WHERE u.id IS NULL) THEN RAISE EXCEPTION 'revestimentos_mudelar: sem unidade «m2» ou «ml».'; END IF;
  FOR r IN SELECT f.n, f.nome FROM _rv_forn f ORDER BY f.n LOOP
    SELECT count(*), (array_agg(s.id ORDER BY s.created_at, s.id))[1], (array_agg(coalesce(s.is_active, true) ORDER BY s.created_at, s.id))[1]
      INTO v_n, v_sup, v_ativa
    FROM suppliers s
    WHERE s.organization_id = c_org AND s.deleted_at IS NULL AND public.fn_cat_chave_opcao(s.name) = public.fn_cat_chave_opcao(r.nome);
    IF v_n > 1 THEN RAISE EXCEPTION 'revestimentos_mudelar: a Mudelar tem % fornecedores «%».', v_n, r.nome; END IF;
    IF v_n = 1 AND NOT v_ativa THEN RAISE EXCEPTION 'revestimentos_mudelar: o fornecedor «%» da Mudelar está desativado.', r.nome; END IF;
    IF v_n = 0 THEN
      INSERT INTO suppliers (organization_id, name, is_active, created_by)
      VALUES (c_org, public.fn_cat_limpar_nome(r.nome), true, v_criador)
      RETURNING id INTO v_sup;
      UPDATE _rv_forn f SET id = v_sup, criado = true WHERE f.n = r.n;
      v_forn_criados := v_forn_criados || r.nome || '; ';
    ELSE
      UPDATE _rv_forn f SET id = v_sup WHERE f.n = r.n;
    END IF;
  END LOOP;

  -- ─── 8. As linhas a gravar e os valores de atributos, com o SKU final (a regra de fn_cat_sku_partes, set-based) ──
  CREATE TEMP TABLE _rv ON COMMIT DROP AS
  SELECT gen_random_uuid() AS id, l.linha, l.sub, s.sub_id, l.modelo, m.modelo_id, l.nome, l.custo, l.pvp, l.cod_forn,
         b.id AS marca_id, b.nome AS marca, f.id AS forn_id, f.nome AS fornecedor, l.unidade, u.id AS uom_id, l.med_u,
         (CASE WHEN l.med_tipo IS NOT NULL THEN
            jsonb_build_object('tipo', l.med_tipo,
                               'largura', public.fn_cat_dimensao_medida(to_jsonb(l.med_l), 'A largura'),
                               'comprimento', public.fn_cat_dimensao_medida(to_jsonb(l.med_a), 'O comprimento'),
                               'espessura', (CASE WHEN l.med_tipo = '3D' THEN public.fn_cat_dimensao_medida(to_jsonb(l.med_p), 'A espessura') END),
                               'unidade', l.med_u) END) AS med_json,
         NULL::text AS med_texto, NULL::text AS med_seg, NULL::text AS sku
  FROM _rv_linhas l
  JOIN _rv_subs s ON s.codigo = l.sub
  JOIN _rv_modelos m ON m.sub = l.sub AND m.numero = l.modelo
  JOIN _rv_marcas b ON b.n = l.marca
  JOIN _rv_forn f ON f.n = l.fornecedor
  JOIN _rv_uom u ON u.codigo = l.unidade;
  ALTER TABLE _rv ADD PRIMARY KEY (id);
  UPDATE _rv b SET med_texto = public.fn_cat_dimensao_texto(b.med_json -> 'largura') || ' × ' || public.fn_cat_dimensao_texto(b.med_json -> 'comprimento')
                               || (CASE WHEN b.med_json ->> 'tipo' = '3D' THEN ' × ' || public.fn_cat_dimensao_texto(b.med_json -> 'espessura') ELSE '' END)
                               || ' ' || b.med_u,
                   med_seg = public.fn_cat_sku_medida(b.med_json)
  WHERE b.med_json IS NOT NULL;
  SELECT count(*) INTO v_n FROM _rv;
  IF v_n <> c_total THEN RAISE EXCEPTION 'revestimentos_mudelar: % linhas a gravar em vez de %.', v_n, c_total; END IF;
  IF EXISTS (SELECT 1 FROM _rv b WHERE b.modelo_id IS NULL OR b.marca_id IS NULL OR b.forn_id IS NULL OR b.sub_id IS NULL OR b.uom_id IS NULL
             OR (b.med_json IS NOT NULL AND (b.med_seg IS NULL OR b.med_texto IS NULL OR public.fn_cat_medida_ler(b.med_json, 'cm') IS NULL))) THEN
    RAISE EXCEPTION 'revestimentos_mudelar: há linhas sem modelo, marca, fornecedor, unidade ou com medida inválida.';
  END IF;

  -- um valor por atributo: (produto, atributo, texto, json, unidade, segmento do SKU)
  CREATE TEMP TABLE _rv_vals ON COMMIT DROP AS
  SELECT b.id AS product_id, t.id AS attribute_id, t.papel, o.valor AS value_text, NULL::jsonb AS value_json, NULL::text AS unit, o.sigla AS seg
  FROM _rv b JOIN _rv_linhas l ON l.linha = b.linha
  CROSS JOIN LATERAL (VALUES ('cor', l.cor), ('acabamento', l.acab), ('aplicacao', l.aplic)) AS x(papel, nome)
  JOIN _rv_opcoes o ON o.papel = x.papel AND o.nome = x.nome
  JOIN _rv_attr t ON t.papel = x.papel
  WHERE x.nome IS NOT NULL
  UNION ALL
  SELECT b.id, v_a_med, 'medida', b.med_texto, b.med_json, b.med_u, b.med_seg FROM _rv b WHERE b.med_json IS NOT NULL;
  ANALYZE _rv; ANALYZE _rv_vals;
  SELECT count(*) INTO v_n FROM _rv_vals;
  IF v_n <> c_n_valores THEN RAISE EXCEPTION 'revestimentos_mudelar: % valores de atributos a gravar em vez de %.', v_n, c_n_valores; END IF;

  -- RV-SUB-NNNN-<um segmento por atributo que entra e que o produto tem, por sku_ordem NULLS LAST, sort_order, nome, id>
  UPDATE _rv b SET sku = concat_ws('-', c_cat_sigla, b.sub, lpad(b.modelo::text, 4, '0'), x.resto)
  FROM (SELECT v.product_id, string_agg(v.seg, '-' ORDER BY t.sku_ordem NULLS LAST, t.ordem, t.nome, t.id) AS resto
        FROM _rv_vals v JOIN _rv_attr t ON t.id = v.attribute_id WHERE t.entra GROUP BY v.product_id) x
  WHERE x.product_id = b.id;
  UPDATE _rv b SET sku = concat_ws('-', c_cat_sigla, b.sub, lpad(b.modelo::text, 4, '0')) WHERE b.sku IS NULL;

  -- SKU repetido entre as linhas: para e diz quais
  SELECT string_agg(x.sku || ' ×' || x.n || ' (' || x.nomes || ')', '; ') INTO v_txt
  FROM (SELECT b.sku, count(*) AS n, string_agg(b.nome, ' | ' ORDER BY b.linha) AS nomes FROM _rv b
        GROUP BY b.sku HAVING count(*) > 1 ORDER BY b.sku LIMIT 10) x;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'revestimentos_mudelar: SKUs repetidos: %', v_txt; END IF;
  -- já usado por outro produto da Mudelar (vivo ou apagado)
  SELECT string_agg(b.sku || ' (' || p.name || ')', '; ') INTO v_txt
  FROM (SELECT b2.sku FROM _rv b2 JOIN products p2 ON p2.organization_id = c_org AND p2.sku = b2.sku ORDER BY b2.sku LIMIT 10) b
  JOIN products p ON p.organization_id = c_org AND p.sku = b.sku;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'revestimentos_mudelar: SKUs já usados noutros produtos da Mudelar: %', v_txt; END IF;
  v_regex := '^' || c_cat_sigla || '-(' || (SELECT string_agg(s.codigo, '|' ORDER BY s.ordem) FROM _rv_subs s) || ')-[0-9]{4}(-[A-Z0-9]+){0,4}$';
  IF EXISTS (SELECT 1 FROM _rv b WHERE b.sku !~ v_regex) THEN
    RAISE EXCEPTION 'revestimentos_mudelar: SKU fora do formato (ex.: %).', (SELECT b.sku FROM _rv b WHERE b.sku !~ v_regex LIMIT 1);
  END IF;

  -- ─── 9. Gravar (auditoria por linha desligada: fica uma linha consolidada no fim) ───────────────
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- como cat_guardar_produto: vendável, comprável, sem variantes, gere stock, active (o do Excel); o gatilho
  -- trg_cat_produto_tabelas preenche marca_livre, unidade e catalogo_categoria_id a partir dos ids
  INSERT INTO products (id, organization_id, sku, name, status, is_active, is_sellable, is_purchasable, has_variants, is_deleted,
                        manages_stock, created_by, tipo_catalogo, category_id, subcategory_id, model_id, brand_id, uom_id,
                        supplier_id, fornecedor_livre, sku_gerado, short_description)
  SELECT b.id, c_org, b.sku, b.nome, 'active'::product_status, true, true, true, false, false,
         true, v_criador, 'produto', v_cat, b.sub_id, b.modelo_id, b.marca_id, b.uom_id,
         b.forn_id, public.fn_cat_limpar_nome(b.fornecedor), true, NULL
  FROM _rv b ORDER BY b.linha;

  INSERT INTO product_organizations (product_id, organization_id, created_by)
  SELECT b.id, c_org, v_criador FROM _rv b ORDER BY b.linha;

  -- custo (preco_exato a 6 casas, price a 2) e PVP — só os que o Excel tem (> 0)
  INSERT INTO product_prices (product_id, currency, price, preco_exato, valid_from, created_by, price_type, vat_rate)
  SELECT b.id, 'EUR'::currency_code, round(b.custo, 2), round(b.custo, 6), v_agora, v_criador, 'purchase'::price_type, c_iva
  FROM _rv b WHERE b.custo IS NOT NULL
  UNION ALL
  SELECT b.id, 'EUR'::currency_code, round(b.pvp, 2), NULL::numeric, v_agora + interval '1 microsecond', v_criador, 'retail'::price_type, c_iva
  FROM _rv b WHERE b.pvp IS NOT NULL;

  -- como cat_guardar_produto_atributos: opção = value_text da opção; medida = value_json e o texto «a × b [× c] cm|mm»
  INSERT INTO product_attribute_values (product_id, attribute_id, value_text, value_json, unit)
  SELECT v.product_id, v.attribute_id, v.value_text, v.value_json, v.unit FROM _rv_vals v;

  -- como cat_ligar_fornecedor_produto: preferido; supplier_sku = código do fornecedor, ou o SKU; preço = custo
  INSERT INTO item_suppliers (organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price, currency,
                              is_preferred, is_active, created_by, preco_data)
  SELECT c_org, 'product', b.id, b.forn_id, NULL, coalesce(b.cod_forn, b.sku), round(b.custo, 2), 'EUR', true, true, v_criador,
         (CASE WHEN b.custo IS NOT NULL THEN current_date END)
  FROM _rv b ORDER BY b.linha;

  PERFORM set_config('app.audit_bypass', 'off', true);
  PERFORM public.fn_manual_audit_log('products', v_cat, c_org, 'INSERT',
    jsonb_build_object('importacao', 'revestimentos_mudelar', 'produtos', c_total, 'modelos', c_n_modelos, 'categoria', v_cat,
                       'fornecedores_criados', v_forn_criados, 'atributo_aplicacao_criado', v_aplic_criado,
                       'opcoes_criadas', v_opc_criadas, 'marcas', v_marca_txt, 'subcategorias_criadas', v_subs_criadas,
                       'unidade_m2_criada', v_m2_criada, 'sem_custo', c_total - c_n_custo, 'sem_pvp', c_total - c_n_pvp),
    c_fonte, v_cat);
  IF NOT EXISTS (SELECT 1 FROM entity_audit_log e WHERE e.organization_id = c_org AND e.source = c_fonte
                 AND e.table_name = 'products' AND e.created_at >= now()) THEN
    RAISE WARNING 'revestimentos_mudelar: a linha consolidada da auditoria não ficou gravada (fn_manual_audit_log engole o erro).';
  END IF;

  -- ─── 10. Conferir (cada contagem é do que está ERRADO; tem de dar 0) ──────────
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _rv_subs s) AND NOT p.is_deleted;
  IF v_n <> c_total THEN RAISE EXCEPTION 'Conferir: % produtos nas subcategorias em vez de %.', v_n, c_total; END IF;
  SELECT string_agg(s.nome || ' ' || coalesce(x.n, 0) || ' em vez de ' || s.esperados, '; ') INTO v_txt
  FROM _rv_subs s
  LEFT JOIN (SELECT p.subcategory_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.subcategory_id) x ON x.subcategory_id = s.sub_id
  WHERE coalesce(x.n, 0) <> s.esperados;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: contagem por subcategoria errada: %', v_txt; END IF;
  SELECT count(*), string_agg(m.sub || lpad(m.numero::text, 4, '0') || ' ' || coalesce(x.n, 0) || ' em vez de ' || m.esperados, '; ') INTO v_n, v_txt
  FROM _rv_modelos m
  LEFT JOIN (SELECT p.model_id, count(*) AS n FROM products p WHERE p.organization_id = c_org AND NOT p.is_deleted
             GROUP BY p.model_id) x ON x.model_id = m.modelo_id
  WHERE coalesce(x.n, 0) <> m.esperados;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: contagem por modelo errada em %: %', v_n, left(v_txt, 1500); END IF;
  SELECT count(*) INTO v_n FROM _rv_modelos m JOIN _rv_subs s ON s.codigo = m.sub LEFT JOIN product_models pm ON pm.id = m.modelo_id
  WHERE NOT coalesce(pm.organization_id = c_org AND pm.subcategory_id = s.sub_id AND pm.deleted_at IS NULL AND pm.is_active
                     AND pm.numero = m.numero AND pm.name = m.nome, false);
  SELECT count(*) INTO v_m FROM product_models pm
  WHERE pm.organization_id = c_org AND pm.subcategory_id IN (SELECT s.sub_id FROM _rv_subs s);
  IF v_n > 0 OR v_m <> c_n_modelos THEN
    RAISE EXCEPTION 'Conferir: % modelos errados; % nas subcategorias em vez de %.', v_n, v_m, c_n_modelos;
  END IF;

  -- cada produto tal como a sua linha (LEFT JOIN + NOT coalesce(…, false): o que falta também conta como errado)
  SELECT count(*), string_agg(b.linha::text, ', ') INTO v_n, v_txt
  FROM _rv b
  LEFT JOIN products p ON p.id = b.id
  LEFT JOIN product_prices pc ON pc.product_id = b.id AND pc.price_type = 'purchase'
  LEFT JOIN product_prices pv ON pv.product_id = b.id AND pv.price_type = 'retail'
  LEFT JOIN item_suppliers i ON i.product_id = b.id AND i.deleted_at IS NULL
  WHERE NOT coalesce(
        p.organization_id = c_org AND p.name = b.nome AND p.sku = b.sku AND p.sku_gerado AND p.model_id = b.modelo_id
        AND p.category_id = v_cat AND p.subcategory_id = b.sub_id AND p.brand_id = b.marca_id AND p.marca_livre = b.marca
        AND p.uom_id = b.uom_id AND p.unidade = b.unidade AND p.status = 'active'::product_status AND p.tipo_catalogo = 'produto'
        AND p.manages_stock AND p.is_active AND NOT p.is_deleted AND p.supplier_id = b.forn_id
        AND p.fornecedor_livre = public.fn_cat_limpar_nome(b.fornecedor) AND p.short_description IS NULL
        AND pc.price IS NOT DISTINCT FROM round(b.custo, 2) AND pc.preco_exato IS NOT DISTINCT FROM round(b.custo, 6)
        AND (pc.product_id IS NULL OR pc.vat_rate = c_iva)
        AND pv.price IS NOT DISTINCT FROM round(b.pvp, 2) AND (pv.product_id IS NULL OR pv.vat_rate = c_iva)
        AND i.supplier_id = b.forn_id AND i.is_preferred AND i.is_active AND i.organization_id = c_org
        AND i.purchase_price IS NOT DISTINCT FROM round(b.custo, 2) AND i.supplier_sku = coalesce(b.cod_forn, p.sku)
        AND i.preco_data IS NOT DISTINCT FROM (CASE WHEN b.custo IS NOT NULL THEN current_date END),
        false);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % produtos não ficaram como a linha do Excel (linhas %).', v_n, left(v_txt, 1000); END IF;
  -- os valores de atributos: exatamente os previstos
  SELECT count(*) INTO v_n FROM (
    (SELECT v.product_id, v.attribute_id, v.value_text, v.value_json, v.unit FROM _rv_vals v
     EXCEPT
     SELECT x.product_id, x.attribute_id, x.value_text, x.value_json, x.unit FROM product_attribute_values x JOIN _rv b ON b.id = x.product_id)
    UNION ALL
    (SELECT x.product_id, x.attribute_id, x.value_text, x.value_json, x.unit FROM product_attribute_values x JOIN _rv b ON b.id = x.product_id
     EXCEPT
     SELECT v.product_id, v.attribute_id, v.value_text, v.value_json, v.unit FROM _rv_vals v)) d;
  SELECT count(*) INTO v_m FROM product_attribute_values x JOIN _rv b ON b.id = x.product_id;
  IF v_n > 0 OR v_m <> c_n_valores THEN
    RAISE EXCEPTION 'Conferir: % valores de atributos diferentes do previsto; % gravados em vez de %.', v_n, v_m, c_n_valores;
  END IF;
  SELECT (SELECT count(*) FROM product_prices x JOIN _rv b ON b.id = x.product_id),
         (SELECT count(*) FROM item_suppliers x JOIN _rv b ON b.id = x.product_id),
         (SELECT count(*) FROM product_organizations x JOIN _rv b ON b.id = x.product_id)
    INTO v_n, v_m, v_k;
  IF v_n <> c_n_custo + c_n_pvp OR v_m <> c_total OR v_k <> c_total THEN
    RAISE EXCEPTION 'Conferir: % preços (esperados %), % ligações a fornecedor e % product_organizations (esperados %).',
      v_n, c_n_custo + c_n_pvp, v_m, v_k, c_total;
  END IF;

  -- as opções: ativas, com sigla, siglas únicas por grupo
  SELECT count(*) INTO v_n FROM _rv_opcoes o LEFT JOIN attribute_option_group_values v ON v.id = o.opcao_id
  WHERE NOT coalesce(v.group_id = o.grupo AND v.value_text::text = o.valor AND v.sigla = o.sigla AND v.is_active, false);
  SELECT count(*) INTO v_m FROM (SELECT v.group_id FROM attribute_option_group_values v
                                 WHERE v.group_id IN (SELECT t.grupo FROM _rv_attr t) AND v.sigla IS NOT NULL
                                 GROUP BY v.group_id, v.sigla HAVING count(*) > 1) x;
  IF v_n > 0 OR v_m > 0 THEN RAISE EXCEPTION 'Conferir: % opções erradas; % siglas repetidas nos grupos.', v_n, v_m; END IF;
  SELECT count(*) INTO v_n FROM _rv_subs s JOIN product_categories c ON c.id = s.sub_id
  WHERE NOT (c.sigla = s.codigo AND c.parent_id = v_cat AND c.organization_id = c_org AND c.deleted_at IS NULL);
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % subcategorias erradas.', v_n; END IF;

  -- SKUs: únicos, no formato, e iguais ao que a regra do Catálogo calcula a partir do que ficou gravado (todos)
  CREATE TEMP TABLE _rv_grupos ON COMMIT DROP AS
  SELECT a.id, a.is_measurement, (CASE WHEN NOT a.is_measurement THEN public.fn_cat_grupo_do_atributo(a.id, c_org) END) AS grupo
  FROM product_attributes a WHERE a.organization_id = c_org AND a.deleted_at IS NULL;
  ALTER TABLE _rv_grupos ADD PRIMARY KEY (id);
  SELECT count(*), count(DISTINCT p.sku), count(*) FILTER (WHERE p.sku !~ v_regex OR NOT p.sku_gerado) INTO v_n, v_m, v_k
  FROM products p WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _rv_subs s) AND NOT p.is_deleted;
  IF v_m <> c_total OR v_n <> c_total THEN RAISE EXCEPTION 'Conferir: SKUs não únicos (% distintos em %).', v_m, v_n; END IF;
  IF v_k > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs fora do formato % ou não gerados.', v_k, v_regex; END IF;
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
              JOIN _rv_grupos a ON a.id = v.attribute_id
              LEFT JOIN attribute_option_group_values o ON NOT a.is_measurement AND o.group_id = a.grupo AND o.value_text = v.value_text
              WHERE v.product_id = p.id)) AS pt) z
          WHERE p.organization_id = c_org AND p.subcategory_id IN (SELECT s.sub_id FROM _rv_subs s) AND NOT p.is_deleted) x
        WHERE x.calc IS DISTINCT FROM x.sku OR x.prefixo IS NULL OR x.faltas <> '[]') y;
  IF v_n > 0 THEN RAISE EXCEPTION 'Conferir: % SKUs diferentes do recalculado pela regra do Catálogo (ex.: %).', v_n, v_txt; END IF;

  -- 20 ao acaso com cat_prever_sku_modelo, como um membro da Mudelar com products.edit (só leitura; claims locais)
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE NOTICE 'revestimentos_mudelar: sem membro da Mudelar com products.edit — a comparação com cat_prever_sku_modelo ficou por fazer (o recálculo de todos foi feito).';
  ELSE
    v_claims := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    v_n := 0;
    FOR r IN SELECT b.id, b.sku, b.sub_id, b.modelo_id FROM _rv b ORDER BY random() LIMIT c_amostra LOOP
      SELECT coalesce(jsonb_agg(CASE WHEN t.medida THEN jsonb_build_object('atributo', v.attribute_id, 'medida', v.value_json)
                                     ELSE jsonb_build_object('atributo', v.attribute_id, 'opcao', o.opcao_id) END), '[]'::jsonb)
        INTO v_attrs
      FROM _rv_vals v JOIN _rv_attr t ON t.id = v.attribute_id
      LEFT JOIN _rv_opcoes o ON NOT t.medida AND o.papel = t.papel AND o.valor = v.value_text
      WHERE v.product_id = r.id;
      v_prev := public.cat_prever_sku_modelo(c_org, v_cat, r.sub_id, r.modelo_id, v_attrs, r.id);
      IF (v_prev ->> 'sku') IS DISTINCT FROM r.sku OR coalesce(v_prev -> 'faltas', '[]'::jsonb) <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Conferir: cat_prever_sku_modelo dá % para o produto com o SKU %.', v_prev, r.sku;
      END IF;
      v_n := v_n + 1;
    END LOOP;
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    IF v_n <> c_amostra THEN RAISE EXCEPTION 'Conferir: só % de % comparados com cat_prever_sku_modelo.', v_n, c_amostra; END IF;
  END IF;

  -- nada foi escrito fora da Mudelar: nenhuma linha de outra organização (nem fora do previsto) tem o xmin desta transação
  -- (o que já estava escrito nesta transação antes da importação — _rv_antes — não conta)
  IF v_xid IS DISTINCT FROM (txid_current() % 4294967296)::text THEN
    RAISE EXCEPTION 'Conferir: a transação mudou a meio (xid).';
  END IF;
  SELECT string_agg(x.t || ' ' || x.n, ', ') INTO v_txt FROM (
    SELECT 'products' AS t, count(*) AS n FROM products p WHERE p.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
              AND p.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'products')
    UNION ALL SELECT 'product_prices', count(*) FROM product_prices x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
                AND x.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'product_prices')
    UNION ALL SELECT 'product_attribute_values', count(*) FROM product_attribute_values x JOIN products p ON p.id = x.product_id
              WHERE x.xmin::text = v_xid AND p.organization_id IS DISTINCT FROM c_org
                AND x.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'product_attribute_values')
    UNION ALL SELECT 'product_organizations', count(*) FROM product_organizations x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
                AND x.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'product_organizations')
    UNION ALL SELECT 'item_suppliers', count(*) FROM item_suppliers x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
                AND x.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'item_suppliers')
    UNION ALL SELECT 'suppliers', count(*) FROM suppliers x WHERE x.xmin::text = v_xid
              AND (x.organization_id IS DISTINCT FROM c_org OR x.id NOT IN (SELECT f.id FROM _rv_forn f WHERE f.criado))
              AND x.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'suppliers')
    UNION ALL SELECT 'brands', count(*) FROM brands x WHERE x.xmin::text = v_xid
              AND (x.organization_id IS DISTINCT FROM c_org OR x.id NOT IN (SELECT b.id FROM _rv_marcas b))
              AND x.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'brands')
    UNION ALL SELECT 'product_categories', count(*) FROM product_categories x WHERE x.xmin::text = v_xid
              AND (x.organization_id IS DISTINCT FROM c_org OR x.id NOT IN (SELECT s.sub_id FROM _rv_subs s WHERE s.criada))
              AND x.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'product_categories')
    UNION ALL SELECT 'product_models', count(*) FROM product_models x WHERE x.xmin::text = v_xid
              AND (x.organization_id IS DISTINCT FROM c_org OR x.subcategory_id NOT IN (SELECT s.sub_id FROM _rv_subs s))
              AND x.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'product_models')
    UNION ALL SELECT 'uom', count(*) FROM uom x WHERE x.xmin::text = v_xid AND x.organization_id IS DISTINCT FROM c_org
              AND x.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'uom')
    UNION ALL SELECT 'product_attributes', count(*) FROM product_attributes x WHERE x.xmin::text = v_xid
              AND (x.organization_id IS DISTINCT FROM c_org OR x.id <> v_a_aplic)
              AND x.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'product_attributes')
    UNION ALL SELECT 'attribute_option_groups', count(*) FROM attribute_option_groups x WHERE x.xmin::text = v_xid
              AND (x.organization_id IS DISTINCT FROM c_org OR x.attribute_id <> v_a_aplic)
              AND x.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'attribute_option_groups')
    UNION ALL SELECT 'attribute_option_group_values', count(*) FROM attribute_option_group_values v
              WHERE v.xmin::text = v_xid AND v.id NOT IN (SELECT o.opcao_id FROM _rv_opcoes o WHERE o.criada)
                AND v.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'attribute_option_group_values')) x
  WHERE x.n > 0;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'Conferir: foram escritas linhas fora do âmbito: %', v_txt; END IF;
  IF NOT EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND p.xmin::text = v_xid
                 AND p.subcategory_id IN (SELECT s.sub_id FROM _rv_subs s)) THEN
    RAISE EXCEPTION 'Conferir: os produtos importados não têm o xmin desta transação: a verificação de «nada fora da Mudelar» não vale.';
  END IF;
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_org AND p.xmin::text = v_xid AND NOT EXISTS (SELECT 1 FROM _rv b WHERE b.id = p.id)
    AND p.id NOT IN (SELECT a.id FROM _rv_antes a WHERE a.t = 'products');
  SELECT count(*) INTO v_k FROM _rv_amostra a LEFT JOIN products p ON p.id = a.id
  WHERE NOT coalesce(p.sku = a.sku AND NOT p.is_deleted AND p.organization_id = c_org, false);
  IF v_n > 0 OR v_k > 0 THEN
    RAISE EXCEPTION 'Conferir: escritos % outros produtos da Mudelar; % SKUs da amostra de outras categorias mudaram.', v_n, v_k;
  END IF;

  RAISE NOTICE 'revestimentos_mudelar: % produtos em «%» (% modelos). Aplicação criada: %. Opções criadas: %. Marcas: %. Subcategorias criadas: %. Unidade m2 criada: %. Fornecedores criados: %. Conferido.',
    c_total, c_cat_nome, c_n_modelos, v_aplic_criado, coalesce(nullif(v_opc_criadas, ''), 'nenhuma'),
    coalesce(nullif(v_marca_txt, ''), 'todas existiam'), coalesce(nullif(v_subs_criadas, ''), 'nenhuma'), v_m2_criada,
    coalesce(nullif(v_forn_criados, ''), 'nenhum');
END $mig$;

RESET statement_timeout;
RESET lock_timeout;
