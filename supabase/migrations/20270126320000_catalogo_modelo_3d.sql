-- =============================================================================
-- Catálogo — MODELO 3D ESCOLHIDO (Emylia): o modelo 3D de um produto escolhe-se em 3 níveis, com herança.
-- Produto manda sobre subcategoria, que manda sobre categoria; só se nenhum disser nada o catálogo adivinha
-- (pelo nome, pela subcategoria e pelas medidas, como hoje). Vazio (NULL) = herda / automático.
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth) — NUNCA NA PRINCIPAL; confirmar o project-ref antes do push
-- !!! (supabase/.temp/project-ref tem de dizer uetjghdkwbywbftedtth). A base principal (tzbfgw…) é a de produção
-- !!! real da Mudelar e não foi lida nem medida para esta migration.
--
-- !!! PRECISA DE CÓDIGO NOVO NO BROWSER, que entra JUNTO (mesmo envio): a escolha do modelo na ficha do produto e
-- !!! no ecrã das categorias (chamada a cat_definir_modelo_3d), a leitura da chave 'modelo3d' nas leituras abaixo e
-- !!! a herança produto > subcategoria > categoria > adivinhar. Sem esse código a migration não parte nada (as
-- !!! leituras só ganham uma chave nova, sempre null), mas a funcionalidade não existe no ecrã.
-- =============================================================================
--
-- CONTRATO (combinado com o código do browser; os nomes não mudam)
--  1. products.modelo_3d text NULL e product_categories.modelo_3d text NULL (a subcategoria é uma linha de
--     product_categories com parent_id; uma só coluna serve categorias e subcategorias).
--     CHECK de formato leve: modelo_3d IS NULL OR modelo_3d ~ '^[a-z0-9_]{1,40}$'. NÃO é uma lista fechada: a lista
--     dos modelos vive no código e cresce sem migration.
--  2. cat_definir_modelo_3d(p_org uuid, p_alvo text, p_id uuid, p_modelo text) → jsonb {alvo, id, modelo, anterior}.
--     p_alvo ∈ ('produto','categoria') (a subcategoria é uma categoria). NULL ou '' limpa (volta a herdar).
--     Guarda: fn_cat_exigir(p_org, 'products.edit') — a mesma de cat_guardar_produto_tabelas e de
--     cat_guardar_categoria_produto. O produto/categoria tem de ser de p_org (filtro dentro da função; IDOR);
--     produto apagado ou fora do Catálogo → CT003; categoria apagada ou de outra organização → CT003; categoria
--     partilhada (organization_id NULL) → CT002. Na categoria prende o mesmo advisory lock que
--     cat_guardar_categoria_produto ('cat_categorias_produto:' || org), antes da linha (mesma ordem, sem ciclos).
--     EXECUTE só a authenticated e service_role.
--  3. Leituras (mesma assinatura, CREATE OR REPLACE, privilégios conservados) ganham a chave 'modelo3d':
--       por produto:   cat_ler_produto(uuid,uuid)                                   — a ficha
--                      cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer) — a lista
--                      cat_pesquisar_produtos(uuid,text,uuid,uuid,uuid,integer,integer) — pesquisa por serviço
--                      cat_estudio_procurar_produtos(uuid,text,uuid[],integer,integer)  — o Estúdio
--       por categoria e subcategoria (em categoriasProduto[] / categorias[].subcategorias[]):
--                      cat_ler_referencias_produtos(uuid)       — árvore de lerCatalogoLeve / ClassificacaoFicha
--                      cat_ler_produtos_tabelas(uuid)           — árvore de catalogoReal.ts (leitura completa)
--                      cat_ler_produtos_tabelas_servicos(uuid)  — árvore de catalogoReal.ts (leitura leve)
--                      cat_ler_categorias_gestao(uuid)          — o ecrã de gestão das categorias
--     Nas leituras de página o custo é só mais uma coluna de uma linha que já se lê (50 a 200 produtos por página).
--     De propósito NÃO se mexe nos 'produtos' em lote de cat_ler_produtos_tabelas(_servicos) nem em
--     cat_ler_catalogo(_servicos) (até ~32 000 produtos, vários MB): o modelo de cada produto vem da ficha, da página
--     e do Estúdio. Se o browser o precisar aí, é outra migration.
--
-- CORPOS DE PARTIDA (lidos no remoto RH a 24/11 com pg_get_functiondef; o corpo é igual ao da migration indicada):
--   cat_ler_produto                    5605510df15dbc4daeffd8df7748179f  (20270120800000)
--   cat_ler_produtos_pagina            a605afa081f07d6dae2afa34311f0169  (20270120900000)
--   cat_pesquisar_produtos             f63ca1ba15d9dab81c6fe529fb429b19  (20270122000000)
--   cat_estudio_procurar_produtos      fe52aba13fc145a67f5a548b191ec250  (20270126050000 — ver ORDEM)
--   cat_ler_referencias_produtos       d28c67f56b63559d192d9e9b9bb4e509  (20270120800000)
--   cat_ler_produtos_tabelas           d96670d8e553354579237e69db19c7cc  (20270120900000)
--   cat_ler_produtos_tabelas_servicos  15fd7e6e61a46027262a01ecb01dff94  (20270122000000)
--   cat_ler_categorias_gestao          fe15e7d4f3cd711ee328192ee6442d40  (20270118000000)
-- A guarda do início falha se algum md5 for outro (alguém mudou a função entretanto: rever antes de sobrepor).
-- cat_ler_produtos_tabelas tem search_path só 'public' (sem pg_temp) no remoto: fica assim, não se muda aqui.
--
-- O QUE NÃO MUDA: nenhum dado (sem UPDATE/INSERT/DELETE em tabelas; todos os produtos e categorias ficam com
-- modelo_3d NULL, ou seja, o 3D continua a ser adivinhado como hoje), product_attribute_values, preços, SKUs.
-- Sem DROP FUNCTION e sem sobrecargas novas.
--
-- EFEITOS LATERAIS lidos no remoto (24/11): ADD COLUMN NULL sem default não reescreve a tabela (products ~32 300
-- linhas, product_categories ~130); o CHECK valida com uma passagem por linhas todas NULL. O ALTER não dispara
-- triggers. Os triggers de auditoria (fn_generic_entity_audit, fn_audit_product_categories_with_sentinel) usam a
-- linha inteira, por isso a coluna nova entra sozinha na auditoria quando cat_definir_modelo_3d escreve. Os outros
-- triggers de products são UPDATE OF outras colunas ou WHEN sobre model_id/subcategory_id: não disparam por
-- modelo_3d (só update_products_updated_at, que acerta updated_at). A única vista dependente
-- (cat_v_produto_fornecedor) guarda a sua lista de colunas e não é afectada. Os `SELECT * INTO v_p products%ROWTYPE`
-- adaptam-se à coluna nova.
--
-- ORDEM: depende só do que já está aplicado na RH (última aplicada lida a 24/11: 20270126300000). ATENÇÃO antes do
-- db push: `supabase db push` aplica TUDO o que estiver pendente; listar com `supabase migration list --linked`
-- imediatamente antes. A 24/11 havia 56 ficheiros locais sem registo na RH, e dois tocam em funções desta migration:
--   * 20270117100000_catalogo_produtos_pelas_tabelas.sql redefine cat_ler_produtos_tabelas numa versão ANTERIOR à
--     que está na base (20270120900000 já aplicada): se for aplicada antes desta, a guarda falha (é o pretendido).
--   * 20270126050000_estudio_procurar_produtos.sql faz CREATE FUNCTION (sem OR REPLACE) de uma função que JÁ existe
--     no remoto sem registo de versão: o push falha nesse ficheiro antes de chegar a este.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- ---- Guarda: os corpos de partida são os que estão na base -----------------------------------------------------
DO $guarda$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.cat_ler_produto(uuid,uuid)',                                               '5605510df15dbc4daeffd8df7748179f'),
      ('public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)', 'a605afa081f07d6dae2afa34311f0169'),
      ('public.cat_pesquisar_produtos(uuid,text,uuid,uuid,uuid,integer,integer)',          'f63ca1ba15d9dab81c6fe529fb429b19'),
      ('public.cat_estudio_procurar_produtos(uuid,text,uuid[],integer,integer)',           'fe52aba13fc145a67f5a548b191ec250'),
      ('public.cat_ler_referencias_produtos(uuid)',                                       'd28c67f56b63559d192d9e9b9bb4e509'),
      ('public.cat_ler_produtos_tabelas(uuid)',                                           'd96670d8e553354579237e69db19c7cc'),
      ('public.cat_ler_produtos_tabelas_servicos(uuid)',                                  '15fd7e6e61a46027262a01ecb01dff94'),
      ('public.cat_ler_categorias_gestao(uuid)',                                          'fe15e7d4f3cd711ee328192ee6442d40')
    ) AS t(assinatura, md5)
  LOOP
    IF to_regprocedure(r.assinatura) IS NULL THEN
      RAISE EXCEPTION '%', format('Guarda: a função %s não existe nesta base (é a base de RH?).', r.assinatura);
    END IF;
    SELECT md5(pg_get_functiondef(to_regprocedure(r.assinatura))) INTO v_md5;
    IF v_md5 IS DISTINCT FROM r.md5 THEN
      RAISE EXCEPTION '%', format('Guarda: %s mudou desde a leitura (md5 %s, esperado %s). Rever antes de sobrepor.',
                                  r.assinatura, v_md5, r.md5);
    END IF;
  END LOOP;

  IF to_regprocedure('public.fn_cat_pode(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_cat_exigir_uma(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam fn_cat_pode, fn_cat_exigir ou fn_cat_exigir_uma com os argumentos esperados.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'cat_definir_modelo_3d') THEN
    RAISE EXCEPTION 'Guarda: cat_definir_modelo_3d já existe (ver o que está na base).';
  END IF;

  -- as colunas e os CHECKs não podem existir já com outra forma
  IF EXISTS (SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name IN ('products', 'product_categories')
               AND c.column_name = 'modelo_3d') THEN
    RAISE EXCEPTION 'Guarda: modelo_3d já existe em products ou product_categories (ver o que está na base).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint co
             WHERE co.conname IN ('products_modelo_3d_check', 'product_categories_modelo_3d_check')) THEN
    RAISE EXCEPTION 'Guarda: já existe um CHECK products_modelo_3d_check ou product_categories_modelo_3d_check.';
  END IF;
END
$guarda$;

-- ---- 1. Colunas e CHECK de formato -------------------------------------------------------------------------------
-- num só ALTER por tabela: um só pedido de lock; sem default, não reescreve
ALTER TABLE public.products
  ADD COLUMN modelo_3d text NULL,
  ADD CONSTRAINT products_modelo_3d_check CHECK (modelo_3d IS NULL OR modelo_3d ~ '^[a-z0-9_]{1,40}$');

COMMENT ON COLUMN public.products.modelo_3d IS
  'Modelo 3D escolhido para o produto (chave do código, ex.: sanita_suspensa). NULL = herda da subcategoria, depois da categoria, e por fim o catálogo adivinha. Escreve-se por cat_definir_modelo_3d.';

ALTER TABLE public.product_categories
  ADD COLUMN modelo_3d text NULL,
  ADD CONSTRAINT product_categories_modelo_3d_check CHECK (modelo_3d IS NULL OR modelo_3d ~ '^[a-z0-9_]{1,40}$');

COMMENT ON COLUMN public.product_categories.modelo_3d IS
  'Modelo 3D da categoria ou subcategoria (chave do código). NULL = herda (subcategoria → categoria → adivinhar). O do produto manda sobre este. Escreve-se por cat_definir_modelo_3d.';

-- ---- 2. cat_definir_modelo_3d -----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_definir_modelo_3d(p_org uuid, p_alvo text, p_id uuid, p_modelo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- a mesma permissão que cat_guardar_produto_tabelas e cat_guardar_categoria_produto exigem
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_texto constant integer := 200;
  v_alvo text := lower(btrim(coalesce(p_alvo, '')));
  v_modelo text;
  v_anterior text;
  v_cat_org uuid;
BEGIN
  IF v_alvo NOT IN ('produto', 'categoria') THEN
    RAISE EXCEPTION 'Indique se o modelo 3D é de um produto ou de uma categoria.' USING ERRCODE = 'CT002';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta indicar o produto ou a categoria.' USING ERRCODE = 'CT002';
  END IF;
  -- texto absurdo: recusado antes de qualquer trabalho
  IF length(p_modelo) > c_max_texto THEN
    RAISE EXCEPTION 'O modelo 3D não é válido.' USING ERRCODE = 'CT002';
  END IF;

  -- NULL ou '' limpa (volta a herdar); senão a chave do modelo, no formato do CHECK
  v_modelo := nullif(btrim(coalesce(p_modelo, '')), '');
  IF v_modelo IS NOT NULL AND v_modelo !~ '^[a-z0-9_]{1,40}$' THEN
    RAISE EXCEPTION 'O modelo 3D «%» não é válido: só letras minúsculas sem acentos, algarismos e _ (até 40).', v_modelo
      USING ERRCODE = 'CT002';
  END IF;

  IF v_alvo = 'produto' THEN
    -- o produto do Catálogo desta organização (o mesmo filtro da ficha, cat_ler_produto), preso até ao fim
    SELECT p.modelo_3d INTO v_anterior FROM products p
    WHERE p.id = p_id AND p.organization_id = p_org AND p.tipo_catalogo IS NOT NULL AND NOT p.is_deleted
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;

    UPDATE products p SET modelo_3d = v_modelo
    WHERE p.id = p_id AND p.modelo_3d IS DISTINCT FROM v_modelo;
  ELSE
    -- a mesma chave e a mesma ordem de cat_guardar_categoria_produto: primeiro a organização, depois a linha
    PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || p_org::text, 0));
    SELECT pc.organization_id, pc.modelo_3d INTO v_cat_org, v_anterior FROM product_categories pc
    WHERE pc.id = p_id AND pc.deleted_at IS NULL AND (pc.organization_id = p_org OR pc.organization_id IS NULL)
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003'; END IF;
    IF v_cat_org IS NULL THEN
      RAISE EXCEPTION 'Categoria partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
    END IF;

    UPDATE product_categories pc SET modelo_3d = v_modelo
    WHERE pc.id = p_id AND pc.modelo_3d IS DISTINCT FROM v_modelo;
  END IF;

  RETURN jsonb_build_object('alvo', v_alvo, 'id', p_id, 'modelo', v_modelo, 'anterior', v_anterior);
END $function$;

-- a ordem importa: primeiro tirar (o CREATE dá EXECUTE a PUBLIC), depois dar
REVOKE ALL ON FUNCTION public.cat_definir_modelo_3d(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_definir_modelo_3d(uuid,text,uuid,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_definir_modelo_3d(uuid,text,uuid,text) IS
  'Escolhe (ou limpa, com NULL/'''') o modelo 3D de um produto ou de uma categoria/subcategoria da organização. p_alvo: produto | categoria. Devolve {alvo, id, modelo, anterior}. Exige products.edit.';

-- ---- 3a. cat_ler_produto (de 20270120800000; + 'modelo3d') ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_ler_produto(p_org uuid, p_produto uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_tec boolean; v_mat boolean; v_val boolean; v_id uuid; r jsonb;
BEGIN
  -- as mesmas permissões e o mesmo corte de cat_ler_catalogo (20270113100000)
  v_tec := public.fn_neg_so_execucao(p_org, 'services.view');
  IF NOT v_tec AND NOT public.fn_cat_pode(p_org, 'services.view') THEN
    v_tec := public.fn_cat_pode(p_org, 'pessoas.view')
      OR EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(p_org, ap.code));
  END IF;
  IF NOT v_tec THEN PERFORM public.fn_cat_exigir(p_org, 'services.view'); END IF;
  v_mat := NOT v_tec OR public.fn_cat_pode(p_org, 'negocios.obra.materiais');
  -- lá, sem negocios.obra.materiais, "produtos" vem vazio: aqui não há produto para dar
  IF NOT v_mat THEN RAISE EXCEPTION 'Sem permissão (negocios.obra.materiais).' USING ERRCODE = 'CT001'; END IF;
  -- custos, preços e fornecedor ligado: só sem o corte (= services.view), como precosProduto e fornecedores lá
  v_val := NOT v_tec;

  -- o produto do Catálogo desta organização (o mesmo filtro de "prod" em cat_ler_catalogo)
  SELECT p.id INTO v_id FROM products p
  WHERE p.id = p_produto AND p.organization_id = p_org AND p.tipo_catalogo IS NOT NULL AND NOT p.is_deleted;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;

  WITH pr AS (
         SELECT pp.product_id, pp.price_type::text AS price_type, coalesce(pp.preco_exato, pp.price) AS price, pp.valid_from,
                pp.created_at, pp.id
         FROM product_prices pp WHERE v_val AND pp.product_id = v_id),
       ult AS (
         SELECT DISTINCT ON (pr.price_type) pr.price_type, pr.price, pr.valid_from FROM pr
         ORDER BY pr.price_type, pr.valid_from DESC NULLS LAST, pr.created_at DESC, pr.id),
       fo AS (
         SELECT v.product_id, v.purchase_price, v.preco_data, v.ligacao, su.name AS fornecedor,
                v.supplier_id, v.supplier_sku, su.code AS fornecedor_codigo
         FROM cat_v_produto_fornecedor v LEFT JOIN suppliers su ON su.id = v.supplier_id
         WHERE v_val AND v.product_id = v_id AND v.organization_id = p_org),
       cu AS (
         SELECT CASE WHEN f.purchase_price IS NOT NULL AND f.ligacao <> 'por_ligar' THEN f.purchase_price ELSE c.price END AS custo,
                CASE WHEN f.purchase_price IS NOT NULL AND f.ligacao <> 'por_ligar'
                     THEN coalesce(to_char(f.preco_data, 'YYYY-MM-DD'), to_char(c.valid_from, 'YYYY-MM-DD'))
                     ELSE to_char(c.valid_from, 'YYYY-MM-DD') END AS custo_data,
                CASE WHEN f.purchase_price IS NOT NULL AND f.ligacao <> 'por_ligar' THEN nullif(f.fornecedor, '') END AS fornecedor
         FROM (SELECT 1) um
         LEFT JOIN fo f ON true
         LEFT JOIN ult c ON c.price_type = 'purchase')
  SELECT jsonb_build_object(
           -- de cat_ler_catalogo.produtos[]
           'id', p.id, 'name', p.name, 'sku', p.sku, 'tipo_catalogo', p.tipo_catalogo, 'unidade', p.unidade,
           'catalogo_categoria_id', p.catalogo_categoria_id, 'servico_id', p.servico_id, 'fator_servico', p.fator_servico,
           'entulho_m3', p.entulho_m3, 'entulho_kg', p.entulho_kg, 'short_description', p.short_description,
           'marca_livre', p.marca_livre, 'fornecedor_livre', p.fornecedor_livre, 'image_urls', p.image_urls,
           -- de cat_ler_produtos_tabelas.produtos[]
           'brand_id', p.brand_id, 'marca', b.name, 'uom_id', p.uom_id, 'uom', u.code,
           'category_id', p.category_id, 'subcategory_id', p.subcategory_id,
           -- de cat_ler_produtos_pagina.produtos[]
           'sku_gerado', p.sku_gerado, 'categoria', c.name, 'subcategoria', s.name, 'ativo', p.is_active,
           'modelo_id', pm.id, 'modelo', pm.name, 'modelo_numero', pm.numero,
           'estado', p.status::text,
           -- 20270126320000: o modelo 3D escolhido no produto (NULL = herda)
           'modelo3d', p.modelo_3d,
           've_valores', v_val,
           'precosProduto', coalesce((SELECT jsonb_agg(jsonb_build_object('product_id', x.product_id, 'price_type', x.price_type,
                                                                          'price', x.price, 'valid_from', x.valid_from)
                                                       ORDER BY x.valid_from NULLS FIRST, x.created_at, x.id) FROM pr x), '[]'::jsonb),
           'fornecedores', coalesce((SELECT jsonb_agg(to_jsonb(f)) FROM fo f), '[]'::jsonb),
           'custo', cu.custo, 'custo_data', cu.custo_data,
           'pvp', (SELECT CASE WHEN x.price > 0 THEN x.price END FROM ult x WHERE x.price_type = 'retail'),
           'grossista', (SELECT x.price FROM ult x WHERE x.price_type = 'wholesale'),
           'distribuidor', (SELECT x.price FROM ult x WHERE x.price_type = 'distributor'),
           'fornecedor', coalesce(cu.fornecedor, nullif(p.fornecedor_livre, '')))
  INTO r
  FROM products p
  CROSS JOIN cu
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN uom u ON u.id = p.uom_id
  LEFT JOIN product_categories s ON s.id = p.subcategory_id
  LEFT JOIN product_categories c ON c.id = coalesce(p.category_id, s.parent_id)
  LEFT JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
  WHERE p.id = v_id;
  RETURN r;
END $function$;

-- ---- 3b. cat_ler_produtos_pagina (de 20270120900000; + 'modelo3d') ----------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_ler_produtos_pagina(p_org uuid, p_q text DEFAULT NULL::text, p_categoria uuid DEFAULT NULL::uuid, p_subcategoria uuid DEFAULT NULL::uuid, p_modelo uuid DEFAULT NULL::uuid, p_marca text DEFAULT NULL::text, p_sem_categoria boolean DEFAULT false, p_limite integer DEFAULT 50, p_pagina integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_max_limite constant integer := 200;
  v_limite integer := coalesce(p_limite, 50);
  v_pagina integer := coalesce(p_pagina, 1);
  v_sem_cat boolean := coalesce(p_sem_categoria, false);
  v_termos text[];
  v_marca text := nullif(lower(btrim(coalesce(p_marca, ''))), '');
  v_valores boolean;
  v_total integer;
  v_produtos jsonb;
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  IF v_limite < 1 OR v_limite > c_max_limite THEN
    RAISE EXCEPTION 'O limite tem de estar entre 1 e %.', c_max_limite USING ERRCODE = 'CT002';
  END IF;
  IF v_pagina < 1 THEN
    RAISE EXCEPTION 'A página começa em 1.' USING ERRCODE = 'CT002';
  END IF;
  v_termos := public.fn_cat_termos_pesquisa(p_q);
  -- preços e fornecedores: só com services.view (o corte de cat_ler_catalogo)
  v_valores := public.fn_cat_pode(p_org, 'services.view');

  WITH f AS MATERIALIZED (
    SELECT p.id, p.name
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_categories s ON s.id = p.subcategory_id
    LEFT JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
    WHERE p.organization_id = p_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
      AND (p_categoria IS NULL OR p.category_id = p_categoria OR s.parent_id = p_categoria)
      AND (p_subcategoria IS NULL OR p.subcategory_id = p_subcategoria)
      AND (p_modelo IS NULL OR p.model_id = p_modelo)
      AND (v_marca IS NULL OR lower(btrim(coalesce(b.name, p.marca_livre, ''))) = v_marca)
      AND (NOT v_sem_cat OR (p.category_id IS NULL AND p.subcategory_id IS NULL))
      AND (v_termos IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(v_termos) q
            WHERE strpos(lower(extensions.unaccent('extensions.unaccent'::regdictionary,
                    concat_ws(' ', p.name, p.sku, coalesce(b.name, p.marca_livre), s.name, pm.name, lpad(pm.numero::text, 4, '0')))), q) = 0))
  ),
  pag AS (
    SELECT f.id, f.name FROM f ORDER BY f.name, f.id
    OFFSET ((v_pagina::bigint - 1) * v_limite) LIMIT v_limite
  ),
  atr AS (
    SELECT a.id, a.label, a.is_measurement, coalesce(a.sort_order, 0) AS ordem,
           CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
    FROM product_attributes a
    WHERE a.organization_id = p_org AND a.deleted_at IS NULL
  )
  SELECT (SELECT count(*)::integer FROM f),
         coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'nome', p.name, 'sku', p.sku, 'sku_gerado', p.sku_gerado,
             'marca', coalesce(b.name, p.marca_livre),
             'categoria_id', coalesce(p.category_id, s.parent_id), 'categoria', c.name,
             'subcategoria_id', p.subcategory_id, 'subcategoria', s.name,
             'modelo_id', pm.id, 'modelo', pm.name, 'modelo_numero', pm.numero,
             'unidade', coalesce(nullif(u.code, ''), nullif(p.unidade, ''), 'un'),
             'custo', CASE WHEN fo.id IS NOT NULL AND fo.purchase_price IS NOT NULL THEN fo.purchase_price ELSE cp.preco END,
             'pvp', CASE WHEN vp.preco > 0 THEN vp.preco END,
             'grossista', rv.grossista,
             'distribuidor', rv.distribuidor,
             'fornecedor', coalesce(CASE WHEN fo.id IS NOT NULL AND fo.purchase_price IS NOT NULL THEN nullif(fo.fornecedor, '') END,
                                    nullif(p.fornecedor_livre, '')),
             'ativo', p.is_active,
             -- 20270120900000: o estado do produto (draft | active | discontinued)
             'estado', p.status::text,
             'imagem', (SELECT x.u::text FROM unnest(p.image_urls) WITH ORDINALITY AS x(u, o)
                        WHERE coalesce(x.u::text, '') <> '' ORDER BY x.o LIMIT 1),
             'atributos_resumo', ra.resumo,
             -- 20270126320000: o modelo 3D escolhido no produto (NULL = herda)
             'modelo3d', p.modelo_3d)
           ORDER BY pg.name, pg.id)
    FROM pag pg
    JOIN products p ON p.id = pg.id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_categories s ON s.id = p.subcategory_id
    LEFT JOIN product_categories c ON c.id = coalesce(p.category_id, s.parent_id)
    LEFT JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
    LEFT JOIN uom u ON u.id = p.uom_id
    LEFT JOIN LATERAL (
      SELECT coalesce(pp.preco_exato, pp.price) AS preco FROM product_prices pp
      WHERE v_valores AND pp.product_id = p.id AND pp.price_type = 'purchase'
      ORDER BY pp.valid_from DESC NULLS LAST LIMIT 1) cp ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(pp.preco_exato, pp.price) AS preco FROM product_prices pp
      WHERE v_valores AND pp.product_id = p.id AND pp.price_type = 'retail'
      ORDER BY pp.valid_from DESC NULLS LAST LIMIT 1) vp ON true
    -- 20270119700000: o grossista e o distribuidor mais recentes, numa só leitura (idx_product_prices_type)
    LEFT JOIN LATERAL (
      SELECT max(x.preco) FILTER (WHERE x.tipo = 'wholesale') AS grossista,
             max(x.preco) FILTER (WHERE x.tipo = 'distributor') AS distribuidor
      FROM (SELECT DISTINCT ON (pp.price_type) pp.price_type AS tipo, coalesce(pp.preco_exato, pp.price) AS preco
            FROM product_prices pp
            WHERE v_valores AND pp.product_id = p.id AND pp.price_type IN ('wholesale', 'distributor')
            ORDER BY pp.price_type, pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id) x) rv ON true
    LEFT JOIN LATERAL (
      SELECT i.id, i.purchase_price, su.name AS fornecedor FROM item_suppliers i
      LEFT JOIN suppliers su ON su.id = i.supplier_id
      WHERE v_valores AND i.product_id = p.id AND i.is_active AND i.deleted_at IS NULL
      ORDER BY i.is_preferred DESC, i.updated_at DESC LIMIT 1) fo ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(x.label || ': ' || x.txt, ' · ' ORDER BY x.ordem, x.label, x.aid) AS resumo
      FROM (
        SELECT a.id AS aid, a.label, a.ordem,
               CASE WHEN a.is_measurement
                    THEN coalesce(public.fn_cat_medida_texto(public.fn_cat_medida_ler(v.value_json, v.unit)), v.value_text)
                    ELSE coalesce(nullif(o.display_name, ''), nullif(o.value_text, ''), v.value_text) END AS txt
        FROM product_attribute_values v
        JOIN atr a ON a.id = v.attribute_id
        LEFT JOIN attribute_option_group_values o
          ON NOT a.is_measurement AND o.group_id = a.grupo AND o.value_text = v.value_text AND o.is_active
        WHERE v.product_id = p.id) x
      WHERE coalesce(x.txt, '') <> '') ra ON true), '[]'::jsonb)
  INTO v_total, v_produtos;

  RETURN jsonb_build_object(
    'total', v_total, 'pagina', v_pagina, 'limite', v_limite,
    'paginas', ceil(v_total::numeric / v_limite)::integer,
    've_valores', v_valores,
    'produtos', v_produtos);
END $function$;

-- ---- 3c. cat_pesquisar_produtos (de 20270122000000; + 'modelo3d') -----------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_pesquisar_produtos(p_org uuid, p_q text DEFAULT NULL::text, p_servico uuid DEFAULT NULL::uuid, p_categoria uuid DEFAULT NULL::uuid, p_subcategoria uuid DEFAULT NULL::uuid, p_pagina integer DEFAULT 1, p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_max_limite constant integer := 200;
  v_limite integer := coalesce(p_limite, 50);
  v_pagina integer := coalesce(p_pagina, 1);
  v_termos text[];
  v_valores boolean;
  v_total integer;
  v_produtos jsonb;
BEGIN
  -- as permissões, os erros e o corte de valores de cat_ler_produtos_pagina
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  IF v_limite < 1 OR v_limite > c_max_limite THEN
    RAISE EXCEPTION 'O limite tem de estar entre 1 e %.', c_max_limite USING ERRCODE = 'CT002';
  END IF;
  IF v_pagina < 1 THEN
    RAISE EXCEPTION 'A página começa em 1.' USING ERRCODE = 'CT002';
  END IF;
  v_termos := public.fn_cat_termos_pesquisa(p_q);
  -- preços e fornecedores: só com services.view (o corte de cat_ler_catalogo)
  v_valores := public.fn_cat_pode(p_org, 'services.view');

  WITH f AS MATERIALIZED (
    SELECT p.id, p.name
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_categories s ON s.id = p.subcategory_id
    LEFT JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
    WHERE p.organization_id = p_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
      -- 20270122000000: o filtro pelo serviço que o produto traz
      AND (p_servico IS NULL OR p.servico_id = p_servico)
      AND (p_categoria IS NULL OR p.category_id = p_categoria OR s.parent_id = p_categoria)
      AND (p_subcategoria IS NULL OR p.subcategory_id = p_subcategoria)
      AND (v_termos IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(v_termos) q
            WHERE strpos(lower(extensions.unaccent('extensions.unaccent'::regdictionary,
                    concat_ws(' ', p.name, p.sku, coalesce(b.name, p.marca_livre), s.name, pm.name, lpad(pm.numero::text, 4, '0')))), q) = 0))
  ),
  pag AS (
    SELECT f.id, f.name FROM f ORDER BY f.name, f.id
    OFFSET ((v_pagina::bigint - 1) * v_limite) LIMIT v_limite
  ),
  atr AS (
    SELECT a.id, a.label, a.is_measurement, coalesce(a.sort_order, 0) AS ordem,
           CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
    FROM product_attributes a
    WHERE a.organization_id = p_org AND a.deleted_at IS NULL
  )
  SELECT (SELECT count(*)::integer FROM f),
         coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'nome', p.name, 'sku', p.sku, 'sku_gerado', p.sku_gerado,
             'marca', coalesce(b.name, p.marca_livre),
             'categoria_id', coalesce(p.category_id, s.parent_id), 'categoria', c.name,
             'subcategoria_id', p.subcategory_id, 'subcategoria', s.name,
             'modelo_id', pm.id, 'modelo', pm.name, 'modelo_numero', pm.numero,
             'unidade', coalesce(nullif(u.code, ''), nullif(p.unidade, ''), 'un'),
             'custo', CASE WHEN fo.id IS NOT NULL AND fo.purchase_price IS NOT NULL THEN fo.purchase_price ELSE cp.preco END,
             'pvp', CASE WHEN vp.preco > 0 THEN vp.preco END,
             'grossista', rv.grossista,
             'distribuidor', rv.distribuidor,
             'fornecedor', coalesce(CASE WHEN fo.id IS NOT NULL AND fo.purchase_price IS NOT NULL THEN nullif(fo.fornecedor, '') END,
                                    nullif(p.fornecedor_livre, '')),
             'ativo', p.is_active,
             'estado', p.status::text,
             'imagem', (SELECT x.u::text FROM unnest(p.image_urls) WITH ORDINALITY AS x(u, o)
                        WHERE coalesce(x.u::text, '') <> '' ORDER BY x.o LIMIT 1),
             'atributos_resumo', ra.resumo,
             -- 20270122000000: o serviço que o produto traz e o fator
             'servico_id', p.servico_id,
             'fator_servico', p.fator_servico,
             -- 20270126320000: o modelo 3D escolhido no produto (NULL = herda)
             'modelo3d', p.modelo_3d)
           ORDER BY pg.name, pg.id)
    FROM pag pg
    JOIN products p ON p.id = pg.id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_categories s ON s.id = p.subcategory_id
    LEFT JOIN product_categories c ON c.id = coalesce(p.category_id, s.parent_id)
    LEFT JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
    LEFT JOIN uom u ON u.id = p.uom_id
    LEFT JOIN LATERAL (
      SELECT coalesce(pp.preco_exato, pp.price) AS preco FROM product_prices pp
      WHERE v_valores AND pp.product_id = p.id AND pp.price_type = 'purchase'
      ORDER BY pp.valid_from DESC NULLS LAST LIMIT 1) cp ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(pp.preco_exato, pp.price) AS preco FROM product_prices pp
      WHERE v_valores AND pp.product_id = p.id AND pp.price_type = 'retail'
      ORDER BY pp.valid_from DESC NULLS LAST LIMIT 1) vp ON true
    LEFT JOIN LATERAL (
      SELECT max(x.preco) FILTER (WHERE x.tipo = 'wholesale') AS grossista,
             max(x.preco) FILTER (WHERE x.tipo = 'distributor') AS distribuidor
      FROM (SELECT DISTINCT ON (pp.price_type) pp.price_type AS tipo, coalesce(pp.preco_exato, pp.price) AS preco
            FROM product_prices pp
            WHERE v_valores AND pp.product_id = p.id AND pp.price_type IN ('wholesale', 'distributor')
            ORDER BY pp.price_type, pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id) x) rv ON true
    LEFT JOIN LATERAL (
      SELECT i.id, i.purchase_price, su.name AS fornecedor FROM item_suppliers i
      LEFT JOIN suppliers su ON su.id = i.supplier_id
      WHERE v_valores AND i.product_id = p.id AND i.is_active AND i.deleted_at IS NULL
      ORDER BY i.is_preferred DESC, i.updated_at DESC LIMIT 1) fo ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(x.label || ': ' || x.txt, ' · ' ORDER BY x.ordem, x.label, x.aid) AS resumo
      FROM (
        SELECT a.id AS aid, a.label, a.ordem,
               CASE WHEN a.is_measurement
                    THEN coalesce(public.fn_cat_medida_texto(public.fn_cat_medida_ler(v.value_json, v.unit)), v.value_text)
                    ELSE coalesce(nullif(o.display_name, ''), nullif(o.value_text, ''), v.value_text) END AS txt
        FROM product_attribute_values v
        JOIN atr a ON a.id = v.attribute_id
        LEFT JOIN attribute_option_group_values o
          ON NOT a.is_measurement AND o.group_id = a.grupo AND o.value_text = v.value_text AND o.is_active
        WHERE v.product_id = p.id) x
      WHERE coalesce(x.txt, '') <> '') ra ON true), '[]'::jsonb)
  INTO v_total, v_produtos;

  RETURN jsonb_build_object(
    'total', v_total, 'pagina', v_pagina, 'limite', v_limite,
    'paginas', ceil(v_total::numeric / v_limite)::integer,
    've_valores', v_valores,
    'produtos', v_produtos);
END $function$;

-- ---- 3d. cat_estudio_procurar_produtos (corpo do remoto = 20270126050000; + 'modelo3d') -------------------------
CREATE OR REPLACE FUNCTION public.cat_estudio_procurar_produtos(p_org uuid, p_q text DEFAULT NULL::text, p_subcategorias uuid[] DEFAULT NULL::uuid[], p_pagina integer DEFAULT 1, p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_max_limite constant integer := 200;
  c_min_ref constant integer := 3;
  v_limite integer := coalesce(p_limite, 50);
  v_pagina integer := coalesce(p_pagina, 1);
  v_subs uuid[] := CASE WHEN coalesce(cardinality(p_subcategorias), 0) = 0 THEN NULL ELSE p_subcategorias END;
  v_termos text[];
  v_frase text;
  v_ref text;
  v_valores boolean;
  v_total integer;
  v_produtos jsonb;
BEGIN
  -- as permissões, os erros e o corte de valores de cat_ler_produtos_pagina
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  IF v_limite < 1 OR v_limite > c_max_limite THEN
    RAISE EXCEPTION 'O limite tem de estar entre 1 e %.', c_max_limite USING ERRCODE = 'CT002';
  END IF;
  IF v_pagina < 1 THEN
    RAISE EXCEPTION 'A página começa em 1.' USING ERRCODE = 'CT002';
  END IF;
  -- as palavras (sem acentos, minúsculas; até 200 caracteres e 10 palavras, senão CT002), a frase inteira e a referência compacta
  v_termos := public.fn_cat_termos_pesquisa(p_q);
  v_frase := nullif(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, btrim(coalesce(p_q, '')))), '\s+', ' ', 'g'), '');
  v_ref := nullif(regexp_replace(coalesce(v_frase, ''), '[^a-z0-9]', '', 'g'), '');
  v_valores := public.fn_cat_pode(p_org, 'services.view');

  WITH atr AS (
    SELECT a.id, a.label, a.is_measurement, coalesce(a.sort_order, 0) AS ordem,
           CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
    FROM product_attributes a
    WHERE a.organization_id = p_org AND a.deleted_at IS NULL
  ),
  base AS MATERIALIZED (
    SELECT p.id, p.name,
           lower(extensions.unaccent('extensions.unaccent'::regdictionary, regexp_replace(btrim(p.name), '\s+', ' ', 'g'))) AS nome_n,
           regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p.sku, ''))), '[^a-z0-9]', '', 'g') AS ref_c,
           lower(extensions.unaccent('extensions.unaccent'::regdictionary,
             concat_ws(' ', p.name, p.sku, coalesce(b.name, p.marca_livre), s.name, pm.name, lpad(pm.numero::text, 4, '0')))) AS texto
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_categories s ON s.id = p.subcategory_id
    LEFT JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
    WHERE p.organization_id = p_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
      AND coalesce(p.is_active, true) AND coalesce(p.status::text, '') <> 'draft'
      AND (v_subs IS NULL OR p.subcategory_id = ANY (v_subs))
      -- para quem vê valores: só com PVP (o mais recente) acima de zero, como o Estúdio mostra
      AND (NOT v_valores OR (SELECT coalesce(pp.preco_exato, pp.price) FROM product_prices pp
                             WHERE pp.product_id = p.id AND pp.price_type = 'retail'
                             ORDER BY pp.valid_from DESC NULLS LAST LIMIT 1) > 0)
  ),
  f AS MATERIALIZED (
    SELECT x.id, x.name,
           CASE WHEN v_ref IS NOT NULL AND x.ref_c <> '' AND x.ref_c = v_ref THEN 0
                WHEN v_ref IS NOT NULL AND char_length(v_ref) >= c_min_ref AND strpos(x.ref_c, v_ref) > 0 THEN 1
                WHEN v_frase IS NOT NULL AND x.nome_n = v_frase THEN 2
                WHEN v_frase IS NOT NULL AND strpos(x.nome_n, v_frase) > 0 THEN 3
                WHEN v_termos IS NOT NULL AND NOT EXISTS (SELECT 1 FROM unnest(v_termos) q WHERE strpos(x.nome_n, q) = 0) THEN 4
                ELSE 5 END AS grau
    FROM base x
    WHERE v_termos IS NULL
       -- a referência, inteira ou em parte, com ou sem traços e espaços
       OR (v_ref IS NOT NULL AND char_length(v_ref) >= c_min_ref AND x.ref_c <> '' AND strpos(x.ref_c, v_ref) > 0)
       -- todas as palavras no texto do produto ou nos atributos
       OR NOT EXISTS (
            SELECT 1 FROM unnest(v_termos) q
            WHERE strpos(x.texto, q) = 0
              AND NOT EXISTS (
                SELECT 1 FROM product_attribute_values v
                JOIN atr a ON a.id = v.attribute_id
                LEFT JOIN attribute_option_group_values o
                  ON NOT a.is_measurement AND o.group_id = a.grupo AND o.value_text = v.value_text AND o.is_active
                WHERE v.product_id = x.id
                  AND strpos(lower(extensions.unaccent('extensions.unaccent'::regdictionary,
                        concat_ws(' ', a.label, v.value_text, o.display_name))), q) > 0))
  ),
  pag AS (
    SELECT f.id, f.name, f.grau FROM f
    ORDER BY f.grau, char_length(f.name), f.name, f.id
    OFFSET ((v_pagina::bigint - 1) * v_limite) LIMIT v_limite
  )
  SELECT (SELECT count(*)::integer FROM f),
         coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'nome', p.name, 'sku', p.sku, 'sku_gerado', p.sku_gerado,
             'marca', coalesce(b.name, p.marca_livre),
             'categoria_id', coalesce(p.category_id, s.parent_id), 'categoria', c.name,
             'subcategoria_id', p.subcategory_id, 'subcategoria', s.name,
             'modelo_id', pm.id, 'modelo', pm.name, 'modelo_numero', pm.numero,
             'unidade', coalesce(nullif(u.code, ''), nullif(p.unidade, ''), 'un'),
             'custo', CASE WHEN fo.id IS NOT NULL AND fo.purchase_price IS NOT NULL THEN fo.purchase_price ELSE cp.preco END,
             'pvp', CASE WHEN vp.preco > 0 THEN vp.preco END,
             'grossista', rv.grossista,
             'distribuidor', rv.distribuidor,
             'fornecedor', coalesce(CASE WHEN fo.id IS NOT NULL AND fo.purchase_price IS NOT NULL THEN nullif(fo.fornecedor, '') END,
                                    nullif(p.fornecedor_livre, '')),
             'ativo', p.is_active,
             'estado', p.status::text,
             'imagem', (SELECT x.u::text FROM unnest(p.image_urls) WITH ORDINALITY AS x(u, o)
                        WHERE coalesce(x.u::text, '') <> '' ORDER BY x.o LIMIT 1),
             'atributos_resumo', ra.resumo,
             -- 20270126050000: quão parecido é com o texto (0 = SKU igual … 5 = só pelos atributos ou pelo resto)
             'grau', pg.grau,
             -- 20270126320000: o modelo 3D escolhido no produto (NULL = herda)
             'modelo3d', p.modelo_3d)
           ORDER BY pg.grau, char_length(pg.name), pg.name, pg.id)
    FROM pag pg
    JOIN products p ON p.id = pg.id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_categories s ON s.id = p.subcategory_id
    LEFT JOIN product_categories c ON c.id = coalesce(p.category_id, s.parent_id)
    LEFT JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
    LEFT JOIN uom u ON u.id = p.uom_id
    LEFT JOIN LATERAL (
      SELECT coalesce(pp.preco_exato, pp.price) AS preco FROM product_prices pp
      WHERE v_valores AND pp.product_id = p.id AND pp.price_type = 'purchase'
      ORDER BY pp.valid_from DESC NULLS LAST LIMIT 1) cp ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(pp.preco_exato, pp.price) AS preco FROM product_prices pp
      WHERE v_valores AND pp.product_id = p.id AND pp.price_type = 'retail'
      ORDER BY pp.valid_from DESC NULLS LAST LIMIT 1) vp ON true
    LEFT JOIN LATERAL (
      SELECT max(x.preco) FILTER (WHERE x.tipo = 'wholesale') AS grossista,
             max(x.preco) FILTER (WHERE x.tipo = 'distributor') AS distribuidor
      FROM (SELECT DISTINCT ON (pp.price_type) pp.price_type AS tipo, coalesce(pp.preco_exato, pp.price) AS preco
            FROM product_prices pp
            WHERE v_valores AND pp.product_id = p.id AND pp.price_type IN ('wholesale', 'distributor')
            ORDER BY pp.price_type, pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id) x) rv ON true
    LEFT JOIN LATERAL (
      SELECT i.id, i.purchase_price, su.name AS fornecedor FROM item_suppliers i
      LEFT JOIN suppliers su ON su.id = i.supplier_id
      WHERE v_valores AND i.product_id = p.id AND i.is_active AND i.deleted_at IS NULL
      ORDER BY i.is_preferred DESC, i.updated_at DESC LIMIT 1) fo ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(x.label || ': ' || x.txt, ' · ' ORDER BY x.ordem, x.label, x.aid) AS resumo
      FROM (
        SELECT a.id AS aid, a.label, a.ordem,
               CASE WHEN a.is_measurement
                    THEN coalesce(public.fn_cat_medida_texto(public.fn_cat_medida_ler(v.value_json, v.unit)), v.value_text)
                    ELSE coalesce(nullif(o.display_name, ''), nullif(o.value_text, ''), v.value_text) END AS txt
        FROM product_attribute_values v
        JOIN atr a ON a.id = v.attribute_id
        LEFT JOIN attribute_option_group_values o
          ON NOT a.is_measurement AND o.group_id = a.grupo AND o.value_text = v.value_text AND o.is_active
        WHERE v.product_id = p.id) x
      WHERE coalesce(x.txt, '') <> '') ra ON true), '[]'::jsonb)
  INTO v_total, v_produtos;

  RETURN jsonb_build_object(
    'total', v_total, 'pagina', v_pagina, 'limite', v_limite,
    'paginas', ceil(v_total::numeric / v_limite)::integer,
    've_valores', v_valores,
    'produtos', v_produtos);
END $function$;

-- ---- 3e. cat_ler_referencias_produtos (de 20270120800000; + 'modelo3d' em categoriasProduto[]) -----------------
CREATE OR REPLACE FUNCTION public.cat_ler_referencias_produtos(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_tec boolean; v_mat boolean; v_mod boolean;
BEGIN
  -- as mesmas permissões e o mesmo corte de cat_ler_produtos_tabelas e cat_ler_catalogo (20270113100000)
  v_tec := public.fn_neg_so_execucao(p_org, 'services.view');
  IF NOT v_tec AND NOT public.fn_cat_pode(p_org, 'services.view') THEN
    v_tec := public.fn_cat_pode(p_org, 'pessoas.view')
      OR EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(p_org, ap.code));
  END IF;
  IF NOT v_tec THEN PERFORM public.fn_cat_exigir(p_org, 'services.view'); END IF;
  v_mat := NOT v_tec OR public.fn_cat_pode(p_org, 'negocios.obra.materiais');
  -- os modelos: a quem cat_ler_modelos_gestao os daria (products.edit ou services.view)
  v_mod := public.fn_cat_pode(p_org, 'products.edit') OR public.fn_cat_pode(p_org, 'services.view');
  RETURN (
    WITH prod AS (SELECT category_id, subcategory_id, brand_id FROM products
                  WHERE organization_id = p_org AND tipo_catalogo IS NOT NULL AND NOT is_deleted AND v_mat),
         exige AS (SELECT id, exige_categoria_produto_id FROM services
                   WHERE organization_id = p_org AND no_catalogo AND NOT is_deleted AND exige_categoria_produto_id IS NOT NULL),
         usadas AS (SELECT category_id AS id FROM prod UNION SELECT subcategory_id FROM prod UNION SELECT exige_categoria_produto_id FROM exige),
         -- 20270126320000: "modelo3d" (o modelo 3D escolhido na categoria/subcategoria; NULL = herda)
         cats AS (SELECT c.id, c.name, c.parent_id, c.sort_order, coalesce(c.is_active, true) AS ativa, c.modelo_3d AS modelo3d
                  FROM product_categories c
                  WHERE c.id IN (SELECT id FROM usadas WHERE id IS NOT NULL)
                     OR (c.deleted_at IS NULL AND (c.organization_id = p_org
                         OR c.id IN (SELECT o.category_id FROM product_category_organizations o WHERE o.organization_id = p_org))))
    SELECT jsonb_build_object(
      'categoriasProduto', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
                    SELECT id, name, parent_id, sort_order, ativa, modelo3d FROM cats
                    UNION SELECT c.id, c.name, c.parent_id, c.sort_order, coalesce(c.is_active, true), c.modelo_3d
                    FROM product_categories c WHERE c.id IN (SELECT parent_id FROM cats)) x), '[]'),
      'marcas', coalesce((SELECT jsonb_agg(DISTINCT b.name) FROM brands b
                  WHERE b.deleted_at IS NULL AND coalesce(b.is_active, true)
                    AND (b.organization_id = p_org OR b.id IN (SELECT brand_id FROM prod))), '[]'),
      'unidades', coalesce((SELECT jsonb_agg(DISTINCT u.code) FROM uom u
                  WHERE u.is_active AND u.base_uom_id IS NULL AND (u.organization_id IS NULL OR u.organization_id = p_org)), '[]'),
      'exige', coalesce((SELECT jsonb_agg(jsonb_build_object('service_id', id, 'categoria_produto_id', exige_categoria_produto_id)) FROM exige), '[]'),
      -- os modelos vivos, como cat_ler_modelos_gestao (mesma junção e ordem), só com o que o ecrã usa
      'modelos', CASE WHEN v_mod THEN coalesce((
                  SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'nome', pm.name, 'numero', pm.numero, 'ativo', pm.is_active,
                                                      'subcategoria', jsonb_build_object('id', s.id))
                                   ORDER BY coalesce(c.sort_order, 0), c.name, coalesce(s.sort_order, 0), s.name, pm.numero, pm.id)
                  FROM product_models pm
                  JOIN product_categories s ON s.id = pm.subcategory_id
                  LEFT JOIN product_categories c ON c.id = s.parent_id
                  WHERE pm.organization_id = p_org AND pm.deleted_at IS NULL), '[]'::jsonb) END
    ));
END $function$;

-- ---- 3f. cat_ler_produtos_tabelas (de 20270120900000; + 'modelo3d' em categoriasProduto[]) ---------------------
-- search_path só 'public', como está no remoto (não se muda aqui)
CREATE OR REPLACE FUNCTION public.cat_ler_produtos_tabelas(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tec boolean; v_mat boolean;
BEGIN
  -- as mesmas permissões e o mesmo corte de cat_ler_catalogo (20270113100000)
  v_tec := public.fn_neg_so_execucao(p_org, 'services.view');
  IF NOT v_tec AND NOT public.fn_cat_pode(p_org, 'services.view') THEN
    v_tec := public.fn_cat_pode(p_org, 'pessoas.view')
      OR EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(p_org, ap.code));
  END IF;
  IF NOT v_tec THEN PERFORM public.fn_cat_exigir(p_org, 'services.view'); END IF;
  v_mat := NOT v_tec OR public.fn_cat_pode(p_org, 'negocios.obra.materiais');
  RETURN (
    WITH prod AS (SELECT * FROM products WHERE organization_id = p_org AND tipo_catalogo IS NOT NULL AND NOT is_deleted AND v_mat),
         exige AS (SELECT id, exige_categoria_produto_id FROM services
                   WHERE organization_id = p_org AND no_catalogo AND NOT is_deleted AND exige_categoria_produto_id IS NOT NULL),
         usadas AS (SELECT category_id AS id FROM prod UNION SELECT subcategory_id FROM prod UNION SELECT exige_categoria_produto_id FROM exige),
         -- 20270117700000: "ativa" em cada categoria (o ecrã esconde as desativadas na escolha)
         -- 20270126320000: "modelo3d" (o modelo 3D escolhido na categoria/subcategoria; NULL = herda)
         cats AS (SELECT c.id, c.name, c.parent_id, c.sort_order, coalesce(c.is_active, true) AS ativa, c.modelo_3d AS modelo3d
                  FROM product_categories c
                  WHERE c.id IN (SELECT id FROM usadas WHERE id IS NOT NULL)
                     OR (c.deleted_at IS NULL AND (c.organization_id = p_org
                         OR c.id IN (SELECT o.category_id FROM product_category_organizations o WHERE o.organization_id = p_org))))
    SELECT jsonb_build_object(
      'produtos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'brand_id', p.brand_id, 'marca', b.name, 'uom_id', p.uom_id,
                    'uom', u.code, 'category_id', p.category_id, 'subcategory_id', p.subcategory_id,
                    -- 20270120900000: o estado do produto (draft | active | discontinued) e se está ativo para venda
                    'estado', p.status::text, 'ativo', p.is_active))
                  FROM prod p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN uom u ON u.id = p.uom_id), '[]'),
      -- as categorias de topo do ramo das subs que vêm (mesmo de outra organização), para a árvore ficar inteira
      'categoriasProduto', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
                    SELECT id, name, parent_id, sort_order, ativa, modelo3d FROM cats
                    UNION SELECT c.id, c.name, c.parent_id, c.sort_order, coalesce(c.is_active, true), c.modelo_3d
                    FROM product_categories c WHERE c.id IN (SELECT parent_id FROM cats)) x), '[]'),
      'marcas', coalesce((SELECT jsonb_agg(DISTINCT b.name) FROM brands b
                  WHERE b.deleted_at IS NULL AND coalesce(b.is_active, true)
                    AND (b.organization_id = p_org OR b.id IN (SELECT brand_id FROM prod))), '[]'),
      'unidades', coalesce((SELECT jsonb_agg(DISTINCT u.code) FROM uom u
                  WHERE u.is_active AND u.base_uom_id IS NULL AND (u.organization_id IS NULL OR u.organization_id = p_org)), '[]'),
      'exige', coalesce((SELECT jsonb_agg(jsonb_build_object('service_id', id, 'categoria_produto_id', exige_categoria_produto_id)) FROM exige), '[]')
    ));
END $function$;

-- ---- 3g. cat_ler_produtos_tabelas_servicos (de 20270122000000; + 'modelo3d' em categoriasProduto[]) ------------
CREATE OR REPLACE FUNCTION public.cat_ler_produtos_tabelas_servicos(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_tec boolean; v_mat boolean;
BEGIN
  -- as permissões e os cortes de cat_ler_produtos_tabelas (os de cat_ler_catalogo), sem mudança
  v_tec := public.fn_neg_so_execucao(p_org, 'services.view');
  IF NOT v_tec AND NOT public.fn_cat_pode(p_org, 'services.view') THEN
    v_tec := public.fn_cat_pode(p_org, 'pessoas.view')
      OR EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(p_org, ap.code));
  END IF;
  IF NOT v_tec THEN PERFORM public.fn_cat_exigir(p_org, 'services.view'); END IF;
  v_mat := NOT v_tec OR public.fn_cat_pode(p_org, 'negocios.obra.materiais');
  RETURN (
    -- o catálogo inteiro, só com as colunas de que as categorias e as marcas precisam: estas chaves ficam iguais às de
    -- cat_ler_produtos_tabelas
    WITH prod AS (SELECT p.id, p.brand_id, p.category_id, p.subcategory_id FROM products p
                  WHERE p.organization_id = p_org AND p.tipo_catalogo IS NOT NULL AND NOT p.is_deleted AND v_mat),
         -- 20270122000000: os produtos dos consumos dos serviços do catálogo (o critério de cat_ler_catalogo_servicos)
         cons AS (SELECT p.* FROM products p
                  WHERE p.organization_id = p_org AND p.tipo_catalogo IS NOT NULL AND NOT p.is_deleted AND v_mat
                    AND p.id IN (SELECT m.product_id FROM service_materials m
                                 JOIN services sv ON sv.id = m.service_id
                                 WHERE sv.organization_id = p_org AND sv.no_catalogo AND NOT sv.is_deleted AND m.deleted_at IS NULL)),
         exige AS (SELECT id, exige_categoria_produto_id FROM services
                   WHERE organization_id = p_org AND no_catalogo AND NOT is_deleted AND exige_categoria_produto_id IS NOT NULL),
         usadas AS (SELECT category_id AS id FROM prod UNION SELECT subcategory_id FROM prod UNION SELECT exige_categoria_produto_id FROM exige),
         -- 20270126320000: "modelo3d" (o modelo 3D escolhido na categoria/subcategoria; NULL = herda)
         cats AS (SELECT c.id, c.name, c.parent_id, c.sort_order, coalesce(c.is_active, true) AS ativa, c.modelo_3d AS modelo3d
                  FROM product_categories c
                  WHERE c.id IN (SELECT id FROM usadas WHERE id IS NOT NULL)
                     OR (c.deleted_at IS NULL AND (c.organization_id = p_org
                         OR c.id IN (SELECT o.category_id FROM product_category_organizations o WHERE o.organization_id = p_org))))
    SELECT jsonb_build_object(
      'produtos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'brand_id', p.brand_id, 'marca', b.name, 'uom_id', p.uom_id,
                    'uom', u.code, 'category_id', p.category_id, 'subcategory_id', p.subcategory_id,
                    'estado', p.status::text, 'ativo', p.is_active))
                  FROM cons p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN uom u ON u.id = p.uom_id), '[]'),
      'categoriasProduto', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
                    SELECT id, name, parent_id, sort_order, ativa, modelo3d FROM cats
                    UNION SELECT c.id, c.name, c.parent_id, c.sort_order, coalesce(c.is_active, true), c.modelo_3d
                    FROM product_categories c WHERE c.id IN (SELECT parent_id FROM cats)) x), '[]'),
      'marcas', coalesce((SELECT jsonb_agg(DISTINCT b.name) FROM brands b
                  WHERE b.deleted_at IS NULL AND coalesce(b.is_active, true)
                    AND (b.organization_id = p_org OR b.id IN (SELECT brand_id FROM prod))), '[]'),
      'unidades', coalesce((SELECT jsonb_agg(DISTINCT u.code) FROM uom u
                  WHERE u.is_active AND u.base_uom_id IS NULL AND (u.organization_id IS NULL OR u.organization_id = p_org)), '[]'),
      'exige', coalesce((SELECT jsonb_agg(jsonb_build_object('service_id', id, 'categoria_produto_id', exige_categoria_produto_id)) FROM exige), '[]')
    ));
END $function$;

-- ---- 3h. cat_ler_categorias_gestao (de 20270118000000; + 'modelo3d' em categorias[] e subcategorias[]) ----------
CREATE OR REPLACE FUNCTION public.cat_ler_categorias_gestao(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- quem edita produtos ou quem vê o catálogo; o perfil reduzido de Negócios não entra
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN (
    WITH prod AS (
      -- produtos e consumíveis vivos do Catálogo, como cat_ler_produtos_tabelas
      SELECT p.category_id, p.subcategory_id FROM products p
      WHERE p.organization_id = p_org AND NOT p.is_deleted AND p.tipo_catalogo IS NOT NULL
    ),
    uso_cat AS (SELECT x.category_id AS id, count(*)::integer AS n FROM prod x WHERE x.category_id IS NOT NULL GROUP BY x.category_id),
    uso_sub AS (SELECT x.subcategory_id AS id, count(*)::integer AS n FROM prod x WHERE x.subcategory_id IS NOT NULL GROUP BY x.subcategory_id),
    topo AS (
      -- 20270118000000: "sigla"; 20270126320000: "modelo3d"
      SELECT c.id, c.name, coalesce(c.sort_order, 0) AS ordem, coalesce(c.is_active, true) AS ativo, (c.organization_id IS NULL) AS global, c.sigla,
             c.modelo_3d AS modelo3d
      FROM product_categories c
      WHERE c.parent_id IS NULL AND c.deleted_at IS NULL
        AND (c.organization_id = p_org
             OR (c.organization_id IS NULL
                 AND (c.id IN (SELECT j.category_id FROM product_category_organizations j WHERE j.organization_id = p_org)
                      OR c.id IN (SELECT u.id FROM uso_cat u))))
    ),
    sub AS (
      SELECT s.id, s.parent_id, s.name, coalesce(s.sort_order, 0) AS ordem, coalesce(s.is_active, true) AS ativo, (s.organization_id IS NULL) AS global, s.sigla,
             s.modelo_3d AS modelo3d
      FROM product_categories s
      WHERE s.parent_id IN (SELECT t.id FROM topo t) AND s.deleted_at IS NULL
        AND (s.organization_id = p_org OR s.organization_id IS NULL)
    )
    SELECT jsonb_build_object('categorias', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', t.id, 'nome', t.name, 'ordem', t.ordem, 'ativo', t.ativo, 'global', t.global,
               'usados', coalesce(uc.n, 0), 'sigla', t.sigla, 'modelo3d', t.modelo3d,
               'subcategorias', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', s.id, 'nome', s.name, 'ordem', s.ordem, 'ativo', s.ativo, 'global', s.global,
                          'usados', coalesce(us.n, 0), 'sigla', s.sigla, 'modelo3d', s.modelo3d)
                        ORDER BY s.ordem, s.name, s.id)
                 FROM sub s LEFT JOIN uso_sub us ON us.id = s.id
                 WHERE s.parent_id = t.id), '[]'::jsonb))
             ORDER BY t.ordem, t.name, t.id)
      FROM topo t LEFT JOIN uso_cat uc ON uc.id = t.id), '[]'::jsonb))
  );
END $function$;

-- ---- 4. Conferir: falha a migration se alguma coisa não ficou como descrito -----------------------------------
DO $conferir$
DECLARE
  r record;
  v_oid oid;
  v_n integer;
  v_def text;
BEGIN
  -- colunas: text, NULL, sem default, nas duas tabelas
  SELECT count(*)::integer INTO v_n FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name IN ('products', 'product_categories') AND c.column_name = 'modelo_3d'
    AND c.data_type = 'text' AND c.is_nullable = 'YES' AND c.column_default IS NULL;
  IF v_n <> 2 THEN
    RAISE EXCEPTION '%', format('Conferir: modelo_3d text NULL sem default existe em %s de 2 tabelas.', v_n);
  END IF;

  -- CHECKs validados, com o formato (::text em contype: é do tipo "char"; to_regclass só aqui, já com as tabelas)
  FOR r IN SELECT * FROM (VALUES ('products', 'products_modelo_3d_check'),
                                 ('product_categories', 'product_categories_modelo_3d_check')) AS t(tabela, nome)
  LOOP
    v_def := NULL;
    SELECT pg_get_constraintdef(co.oid) INTO v_def FROM pg_constraint co
    WHERE co.conname = r.nome AND co.contype::text = 'c' AND co.convalidated
      AND co.conrelid = to_regclass('public.' || r.tabela);
    IF v_def IS NULL OR position('modelo_3d' IN v_def) = 0 OR position('[a-z0-9_]{1,40}' IN v_def) = 0 THEN
      RAISE EXCEPTION '%', format('Conferir: CHECK %s em falta ou diferente (%s).', r.nome, coalesce(v_def, 'nenhum'));
    END IF;
  END LOOP;

  -- nenhum dado mudou: todos os produtos e categorias com modelo_3d NULL
  SELECT count(*)::integer INTO v_n FROM public.products p WHERE p.modelo_3d IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '%', format('Conferir: %s produto(s) com modelo_3d preenchido (esperado 0).', v_n);
  END IF;
  SELECT count(*)::integer INTO v_n FROM public.product_categories pc WHERE pc.modelo_3d IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '%', format('Conferir: %s categoria(s) com modelo_3d preenchido (esperado 0).', v_n);
  END IF;

  -- funções: uma só versão por nome, assinatura, resultado, SECURITY DEFINER, search_path e privilégios
  FOR r IN SELECT * FROM (VALUES
      ('cat_definir_modelo_3d',             'p_org uuid, p_alvo text, p_id uuid, p_modelo text',                         '{"search_path=public, pg_temp"}'),
      ('cat_ler_produto',                   'p_org uuid, p_produto uuid',                                                '{"search_path=public, pg_temp"}'),
      ('cat_ler_produtos_pagina',           'p_org uuid, p_q text, p_categoria uuid, p_subcategoria uuid, p_modelo uuid, p_marca text, p_sem_categoria boolean, p_limite integer, p_pagina integer', '{"search_path=public, pg_temp"}'),
      ('cat_pesquisar_produtos',            'p_org uuid, p_q text, p_servico uuid, p_categoria uuid, p_subcategoria uuid, p_pagina integer, p_limite integer', '{"search_path=public, pg_temp"}'),
      ('cat_estudio_procurar_produtos',     'p_org uuid, p_q text, p_subcategorias uuid[], p_pagina integer, p_limite integer', '{"search_path=public, pg_temp"}'),
      ('cat_ler_referencias_produtos',      'p_org uuid',                                                                '{"search_path=public, pg_temp"}'),
      ('cat_ler_produtos_tabelas',          'p_org uuid',                                                                '{search_path=public}'),
      ('cat_ler_produtos_tabelas_servicos', 'p_org uuid',                                                                '{"search_path=public, pg_temp"}'),
      ('cat_ler_categorias_gestao',         'p_org uuid',                                                                '{"search_path=public, pg_temp"}')
    ) AS t(nome, args, cfg)
  LOOP
    SELECT count(*)::integer INTO v_n FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '%', format('Conferir: %s tem %s versões (esperado 1).', r.nome, v_n);
    END IF;
    v_oid := NULL;
    SELECT p.oid INTO v_oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.nome
      AND pg_get_function_identity_arguments(p.oid) = r.args
      AND pg_get_function_result(p.oid) = 'jsonb'
      AND p.prosecdef
      AND p.proconfig::text = r.cfg;
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '%', format('Conferir: %s não tem a assinatura (%s) → jsonb, SECURITY DEFINER e search_path %s esperados.', r.nome, r.args, r.cfg);
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x WHERE p.oid = v_oid AND x.grantee = 0) THEN
      RAISE EXCEPTION '%', format('Conferir: os privilégios de %s divergem (esperado EXECUTE só a authenticated e service_role, nada a anon/PUBLIC).', r.nome);
    END IF;
  END LOOP;

  -- as 8 leituras substituídas levam mesmo a chave nova
  SELECT count(*)::integer INTO v_n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('cat_ler_produto', 'cat_ler_produtos_pagina', 'cat_pesquisar_produtos', 'cat_estudio_procurar_produtos',
                      'cat_ler_referencias_produtos', 'cat_ler_produtos_tabelas', 'cat_ler_produtos_tabelas_servicos',
                      'cat_ler_categorias_gestao')
    AND position('modelo3d' IN p.prosrc) > 0 AND position('modelo_3d' IN p.prosrc) > 0;
  IF v_n <> 8 THEN
    RAISE EXCEPTION '%', format('Conferir: só %s de 8 leituras substituídas devolvem modelo3d.', v_n);
  END IF;
END
$conferir$;

RESET lock_timeout;
RESET statement_timeout;
