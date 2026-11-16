-- =============================================================================
-- Catálogo — a lista de PRODUTOS passa a ser PAGINADA no servidor.
-- Base de RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- Problema medido a 16/11 (Mudelar, 14 328 produtos): o ecrã carrega tudo de uma vez — cat_ler_catalogo 13 MB / 1,5 s,
-- cat_ler_atributos 8 MB / 1,1 s (os valores de TODOS os produtos) e products.model_id lido direto (RLS) em páginas de
-- 1000 com OFFSET: página 1 = 0,4 s, página 14 = 5,4 s (o limite é 8 s). Decisão do utilizador: paginar no servidor.
--
-- O que acrescenta (sem tabelas, colunas nem índices novos; nenhuma função existente muda):
--   1. cat_ler_produtos_pagina(p_org, p_q, p_categoria, p_subcategoria, p_modelo, p_marca, p_sem_categoria,
--      p_limite DEFAULT 50, p_pagina DEFAULT 1)
--        → {total, pagina, limite, paginas, ve_valores, produtos:[{id, nome, sku, sku_gerado, marca, categoria_id,
--           categoria, subcategoria_id, subcategoria, modelo_id, modelo, modelo_numero, unidade, custo, pvp,
--           fornecedor, ativo, imagem, atributos_resumo}]}
--      Só produtos vivos (NOT is_deleted) com tipo_catalogo = 'produto' da organização, por nome e id.
--      Filtros (todos juntos, E):
--        p_categoria      category_id = p_categoria OU a subcategoria tem p_categoria por pai (inclui as subs).
--        p_subcategoria   subcategory_id.
--        p_modelo         model_id.
--        p_marca          a marca (a da tabela brands; sem ela, marca_livre) sem espaços de fora nem maiúsculas,
--                         como normalizarMarca do ecrã.
--        p_sem_categoria  sem category_id nem subcategory_id.
--        p_q              palavras separadas por espaços; TODAS têm de aparecer (sem acentos nem maiúsculas) no texto
--                         nome + SKU + marca + subcategoria + nome do modelo + número do modelo (0001).
--      p_limite 1..200 e p_pagina ≥ 1 (fora: CT002); p_q até 200 caracteres e 10 palavras (fora: CT002). Uma página
--      para lá da última devolve produtos [] com o total certo. paginas = ceil(total / limite) (0 sem produtos).
--      custo / pvp / fornecedor — as regras de montarCatalogo (src/emylia/real/catalogoReal.ts) sobre os dados de
--      cat_ler_catalogo: custo = o preço do fornecedor preferido ligado (item_suppliers ativo, não apagado, por
--      is_preferred DESC, updated_at DESC — o de cat_v_produto_fornecedor) se tiver preço; senão o último
--      product_prices 'purchase' (coalesce(preco_exato, price), o valid_from mais recente). pvp = o último 'retail'
--      se > 0. fornecedor = o nome desse fornecedor (só quando o custo vem dele) ou fornecedor_livre.
--      Visibilidade: cat_ler_catalogo só dá preços e fornecedores a quem tem services.view (sem ela, quem passa é
--      técnico/comercial e recebe o corte sem valores). Aqui: sem services.view (só products.edit) → custo e pvp
--      null, fornecedor só fornecedor_livre, ve_valores false.
--      atributos_resumo: a linha curta da lista, igual a resumoAtributos (src/emylia/atributosTexto.ts):
--      «Medida: 70×70 cm · Cor: Blanco · Textura: Pizarra», pela ordem dos atributos; a opção ativa pelo nome do
--      grupo, a desativada pelo texto guardado; a medida como textoMedida («12,5×25×0,8 mm»); vazio → null.
--   2. cat_ler_produtos_contagens(p_org, p_q, p_marca)
--        → {total, por_categoria:[{id,n}], por_subcategoria:[{id,n}], por_modelo:[{id,n}], sem_referencia,
--           sem_categoria, sem_marca}
--      Os mesmos produtos e a mesma pesquisa e marca de cat_ler_produtos_pagina; por_categoria conta com a mesma
--      regra do filtro p_categoria (o produto conta na categoria dele e na mãe da subcategoria, uma vez só).
--      sem_referencia = SKU vazio ou provisório (^CAT-[0-9A-F]{10}$).
--   3. cat_ler_atributos_produto(p_org, p_produto) → {valores:[…]}: o MESMO formato de cada produtos[].valores de
--      cat_ler_atributos (corpo aplicado conferido por md5 na guarda), para um produto. Produto inexistente, apagado,
--      de outra organização ou que não seja tipo 'produto' → CT003.
--   4. cat_ler_atributos_definicoes(p_org) → {atributos:[…]}: o campo atributos de cat_ler_atributos, sem produtos.
--   Internas (sem EXECUTE para PUBLIC, anon, authenticated): fn_cat_termos_pesquisa(text) (as palavras da pesquisa,
--   sem acentos e minúsculas) e fn_cat_medida_texto(jsonb) (textoMedida do ecrã).
--
-- Permissão: products.edit OU services.view na organização (fn_cat_exigir_uma), como as outras leituras de gestão.
-- Nota: cat_ler_atributos deixa entrar também quem só tem pessoas.view ou negocios.* (corte do técnico); estas não —
-- são do ecrã do Catálogo. Essas pessoas continuam a usar cat_ler_atributos.
-- Erros: CT001 sem permissão; CT002 dados inválidos; CT003 não encontrado.
--
-- Desempenho (medido na Mudelar a 16/11 com consultas equivalentes): ordenar os 14 328 por nome ≈ 30 ms; a pesquisa
-- sem acentos sobre o texto juntado ≈ 100–130 ms (unaccent linha a linha, sem índice: o texto junta quatro tabelas);
-- os preços e o resumo de 50 produtos poucos ms. Sem índice novo.
--
-- O ECRÃ: esta migration só ACRESCENTA funções; o ecrã atual continua a funcionar sem mudanças. O ecrã paginado
-- (src/emylia) precisa dela aplicada antes de ser publicado.
-- Teste: supabase/tests/catalogo_produtos_paginados.test.sql (passo 0 falha ANTES desta migration).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente; listar com
-- `supabase migration list --linked` antes.
-- =============================================================================

SET lock_timeout = '5s';

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_falta text; v_src text;
BEGIN
  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.fn_cat_exigir_uma(uuid,text[])', 'public.fn_cat_pode(uuid,text)',
                    'public.fn_cat_grupo_do_atributo(uuid,uuid)', 'public.fn_cat_medida_ler(jsonb,text)',
                    'public.fn_cat_num_texto(numeric)', 'public.cat_ler_atributos(uuid)',
                    'extensions.unaccent(regdictionary,text)']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_falta IS NOT NULL THEN RAISE EXCEPTION 'Faltam funções: %. Rever esta migration.', v_falta; END IF;

  IF to_regclass('public.product_models') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns ic WHERE ic.table_schema = 'public' AND ic.table_name = 'products'
                    AND ic.column_name = 'model_id') THEN
    RAISE EXCEPTION 'Falta product_models ou products.model_id (aplicar 20270118300000 antes).';
  END IF;

  -- a lógica dos valores e das definições copia-se de cat_ler_atributos tal como está aplicada (20270118000000)
  v_src := (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_atributos(uuid)')::oid);
  IF md5(v_src) <> 'e104a9d4043bc6edc7cc5e8f5c1f4716' THEN
    RAISE EXCEPTION 'cat_ler_atributos não é a de 20270118000000 (md5 %): rever esta migration.', md5(v_src);
  END IF;

  SELECT string_agg(pr.oid::regprocedure::text, ', ') INTO v_falta FROM pg_proc pr
  WHERE pr.pronamespace = 'public'::regnamespace
    AND pr.proname::text IN ('cat_ler_produtos_pagina', 'cat_ler_produtos_contagens', 'cat_ler_atributos_produto',
                             'cat_ler_atributos_definicoes', 'fn_cat_termos_pesquisa', 'fn_cat_medida_texto');
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe outra versão destas funções: %. Rever esta migration.', v_falta;
  END IF;
END $g$;

-- ─── 1. Internas ────────────────────────────────────────────────────────────────
-- As palavras da pesquisa: sem acentos, minúsculas, sem repetidas; NULL se não houver nenhuma.
-- Até 200 caracteres e 10 palavras (fora: CT002).
CREATE OR REPLACE FUNCTION public.fn_cat_termos_pesquisa(p_q text) RETURNS text[]
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  c_max_q constant integer := 200;
  c_max_termos constant integer := 10;
  v text := btrim(coalesce(p_q, ''));
  v_t text[];
BEGIN
  IF v = '' THEN RETURN NULL; END IF;
  IF char_length(v) > c_max_q THEN
    RAISE EXCEPTION 'A pesquisa tem no máximo % caracteres.', c_max_q USING ERRCODE = 'CT002';
  END IF;
  v_t := ARRAY(SELECT DISTINCT t FROM regexp_split_to_table(lower(extensions.unaccent('extensions.unaccent'::regdictionary, v)), '\s+') t
               WHERE t <> '' ORDER BY t);
  IF cardinality(v_t) = 0 THEN RETURN NULL; END IF;
  IF cardinality(v_t) > c_max_termos THEN
    RAISE EXCEPTION 'A pesquisa tem no máximo % palavras.', c_max_termos USING ERRCODE = 'CT002';
  END IF;
  RETURN v_t;
END $$;

-- textoMedida do ecrã (src/emylia/atributosTexto.ts) sobre o formato de fn_cat_medida_ler:
-- «70×70 cm», «12,5×25×0,8 mm» (a espessura só no 3D). NULL se não for uma medida.
CREATE OR REPLACE FUNCTION public.fn_cat_medida_texto(p_medida jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_medida IS NOT NULL AND jsonb_typeof(p_medida) = 'object' THEN
    public.fn_cat_num_texto((p_medida ->> 'largura')::numeric) || '×' || public.fn_cat_num_texto((p_medida ->> 'comprimento')::numeric)
    || CASE WHEN p_medida ->> 'tipo' = '3D' AND jsonb_typeof(p_medida -> 'espessura') = 'number'
            THEN '×' || public.fn_cat_num_texto((p_medida ->> 'espessura')::numeric) ELSE '' END
    || ' ' || (p_medida ->> 'unidade')
  END
$$;
REVOKE ALL ON FUNCTION public.fn_cat_termos_pesquisa(text), public.fn_cat_medida_texto(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cat_termos_pesquisa(text), public.fn_cat_medida_texto(jsonb) TO service_role;

-- ─── 2. Uma página de produtos ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_ler_produtos_pagina(
  p_org uuid, p_q text DEFAULT NULL, p_categoria uuid DEFAULT NULL, p_subcategoria uuid DEFAULT NULL,
  p_modelo uuid DEFAULT NULL, p_marca text DEFAULT NULL, p_sem_categoria boolean DEFAULT false,
  p_limite integer DEFAULT 50, p_pagina integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
             'fornecedor', coalesce(CASE WHEN fo.id IS NOT NULL AND fo.purchase_price IS NOT NULL THEN nullif(fo.fornecedor, '') END,
                                    nullif(p.fornecedor_livre, '')),
             'ativo', p.is_active,
             'imagem', (SELECT x.u::text FROM unnest(p.image_urls) WITH ORDINALITY AS x(u, o)
                        WHERE coalesce(x.u::text, '') <> '' ORDER BY x.o LIMIT 1),
             'atributos_resumo', ra.resumo)
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
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer) IS
  'Catálogo (20270118500000): uma página da lista de produtos (tipo produto, vivos), por nome e id, com filtros (categoria com as subs, subcategoria, modelo, marca, sem categoria) e pesquisa sem acentos por palavras (nome, SKU, marca, subcategoria, modelo). Custo, PVP e fornecedor só com services.view. Permissão products.edit ou services.view. p_limite 1..200.';

-- ─── 3. As contagens da navegação ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_ler_produtos_contagens(p_org uuid, p_q text DEFAULT NULL, p_marca text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_termos text[];
  v_marca text := nullif(lower(btrim(coalesce(p_marca, ''))), '');
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  v_termos := public.fn_cat_termos_pesquisa(p_q);
  RETURN (
    -- os mesmos produtos, a mesma marca e a mesma pesquisa de cat_ler_produtos_pagina
    WITH f AS MATERIALIZED (
      SELECT p.id, p.category_id, p.subcategory_id, s.parent_id AS sub_pai, p.model_id, p.sku,
             nullif(btrim(coalesce(b.name, p.marca_livre, '')), '') AS marca
      FROM products p
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN product_categories s ON s.id = p.subcategory_id
      LEFT JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
      WHERE p.organization_id = p_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
        AND (v_marca IS NULL OR lower(btrim(coalesce(b.name, p.marca_livre, ''))) = v_marca)
        AND (v_termos IS NULL OR NOT EXISTS (
              SELECT 1 FROM unnest(v_termos) q
              WHERE strpos(lower(extensions.unaccent('extensions.unaccent'::regdictionary,
                      concat_ws(' ', p.name, p.sku, coalesce(b.name, p.marca_livre), s.name, pm.name, lpad(pm.numero::text, 4, '0')))), q) = 0))
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*)::integer FROM f),
      -- a regra do filtro p_categoria: a categoria do produto e a mãe da subcategoria, contado uma vez
      'por_categoria', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', z.k, 'n', z.n) ORDER BY z.k)
        FROM (SELECT k.k, count(DISTINCT f.id)::integer AS n
              FROM f CROSS JOIN LATERAL (VALUES (f.category_id), (f.sub_pai)) AS k(k)
              WHERE k.k IS NOT NULL GROUP BY k.k) z), '[]'::jsonb),
      'por_subcategoria', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', z.k, 'n', z.n) ORDER BY z.k)
        FROM (SELECT f.subcategory_id AS k, count(*)::integer AS n FROM f WHERE f.subcategory_id IS NOT NULL GROUP BY f.subcategory_id) z), '[]'::jsonb),
      'por_modelo', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', z.k, 'n', z.n) ORDER BY z.k)
        FROM (SELECT f.model_id AS k, count(*)::integer AS n FROM f WHERE f.model_id IS NOT NULL GROUP BY f.model_id) z), '[]'::jsonb),
      'sem_referencia', (SELECT count(*)::integer FROM f WHERE btrim(coalesce(f.sku, '')) = '' OR f.sku ~ '^CAT-[0-9A-F]{10}$'),
      'sem_categoria', (SELECT count(*)::integer FROM f WHERE f.category_id IS NULL AND f.subcategory_id IS NULL),
      'sem_marca', (SELECT count(*)::integer FROM f WHERE f.marca IS NULL))
  );
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_produtos_contagens(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_produtos_contagens(uuid,text,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_produtos_contagens(uuid,text,text) IS
  'Catálogo (20270118500000): as contagens da navegação da lista de produtos (por categoria com as subs, subcategoria e modelo; sem referência = SKU vazio ou provisório; sem categoria; sem marca), com a mesma pesquisa e marca de cat_ler_produtos_pagina. Permissão products.edit ou services.view.';

-- ─── 4. Os atributos de UM produto (formato de cat_ler_atributos.produtos[].valores) ───
CREATE OR REPLACE FUNCTION public.cat_ler_atributos_produto(p_org uuid, p_produto uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  IF p_produto IS NULL OR NOT EXISTS (SELECT 1 FROM products p WHERE p.id = p_produto AND p.organization_id = p_org
                                       AND NOT p.is_deleted AND p.tipo_catalogo = 'produto') THEN
    RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003';
  END IF;
  RETURN (
    -- copiado de cat_ler_atributos (20270118000000, md5 conferido na guarda), só para p_produto
    WITH atr AS (
      SELECT a.id, a.label, a.is_measurement, coalesce(a.sort_order, 0) AS ordem,
             CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
      FROM product_attributes a
      WHERE a.organization_id = p_org AND a.deleted_at IS NULL
    ),
    opc_todas AS (
      SELECT o.id, o.group_id, o.value_text::text AS valor, o.is_active
      FROM attribute_option_group_values o
      WHERE o.group_id IN (SELECT grupo FROM atr WHERE grupo IS NOT NULL)
    ),
    val AS (
      SELECT v.attribute_id, v.value_text, v.value_json, v.unit, a.is_measurement, a.grupo, a.ordem, a.label
      FROM product_attribute_values v
      JOIN atr a ON a.id = v.attribute_id
      WHERE v.product_id = p_produto
    )
    SELECT jsonb_build_object('valores', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'atributo', v.attribute_id,
               'opcao', CASE WHEN v.is_measurement THEN NULL ELSE o.id END,
               'valor', v.value_text,
               'medida', CASE WHEN v.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END,
               'ativa', CASE WHEN v.is_measurement THEN true ELSE coalesce(o.is_active, false) END)
               ORDER BY v.ordem, v.label, v.attribute_id)
      FROM val v
      LEFT JOIN opc_todas o ON NOT v.is_measurement AND o.group_id = v.grupo AND o.valor = v.value_text
    ), '[]'::jsonb))
  );
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_atributos_produto(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_atributos_produto(uuid,uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_atributos_produto(uuid,uuid) IS
  'Catálogo (20270118500000): os valores dos atributos de um produto (tipo produto, vivo, da organização), no formato de cat_ler_atributos.produtos[].valores. Outro produto: CT003. Permissão products.edit ou services.view.';

-- ─── 5. As definições dos atributos (cat_ler_atributos.atributos, sem produtos) ───
CREATE OR REPLACE FUNCTION public.cat_ler_atributos_definicoes(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN (
    -- copiado de cat_ler_atributos (20270118000000, md5 conferido na guarda): o campo "atributos"
    WITH atr AS (
      SELECT a.id, a.code, a.label, a.is_measurement, coalesce(a.has_hex_color, false) AS tem_hex,
             coalesce(a.sort_order, 0) AS ordem,
             CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
      FROM product_attributes a
      WHERE a.organization_id = p_org AND a.deleted_at IS NULL
    ),
    opc AS (
      SELECT o.id, o.group_id, o.value_text::text AS valor, coalesce(o.display_name, o.value_text)::text AS nome,
             o.hex_color::text AS hex, coalesce(o.sort_order, 0) AS ordem, o.sigla
      FROM attribute_option_group_values o
      WHERE o.group_id IN (SELECT grupo FROM atr WHERE grupo IS NOT NULL) AND o.is_active
    )
    SELECT jsonb_build_object('atributos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'codigo', a.code, 'nome', a.label,
               'tipo', CASE WHEN a.is_measurement THEN 'medida' ELSE 'lista' END,
               'tem_hex', a.tem_hex, 'ordem', a.ordem,
               'opcoes', CASE WHEN a.is_measurement THEN '[]'::jsonb ELSE coalesce((
                 SELECT jsonb_agg(jsonb_build_object('id', o.id, 'valor', o.valor, 'nome', o.nome,
                                                     'hex', CASE WHEN a.tem_hex THEN o.hex END, 'ordem', o.ordem,
                                                     'sigla', o.sigla)
                                  ORDER BY o.ordem, o.valor, o.id)
                 FROM opc o WHERE o.group_id = a.grupo), '[]'::jsonb) END)
             ORDER BY a.ordem, a.label, a.id)
      FROM atr a), '[]'::jsonb))
  );
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_atributos_definicoes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_atributos_definicoes(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_atributos_definicoes(uuid) IS
  'Catálogo (20270118500000): os atributos da organização com as opções activas do grupo (com a sigla), igual ao campo atributos de cat_ler_atributos, sem os valores dos produtos (arranque do ecrã). Permissão products.edit ou services.view.';

-- ─── 6. Conferir ────────────────────────────────────────────────────────────────
DO $c$
DECLARE
  c_sp constant text := 'search_path=public, pg_temp';
  c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_sig text; v_oid oid; p record; v_auth uuid; v_prod uuid; r jsonb;
BEGIN
  -- as quatro que a app chama: SECURITY DEFINER, STABLE, pg_temp, acessos
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)',
                                'public.cat_ler_produtos_contagens(uuid,text,text)',
                                'public.cat_ler_atributos_produto(uuid,uuid)', 'public.cat_ler_atributos_definicoes(uuid)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_sig; END IF;
    SELECT pr.prosecdef, pr.proconfig, pr.proacl, pr.provolatile::text AS vol INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
    IF NOT p.prosecdef THEN RAISE EXCEPTION 'Conferir: % não é SECURITY DEFINER.', v_sig; END IF;
    IF p.vol <> 's' THEN RAISE EXCEPTION 'Conferir: % não é STABLE.', v_sig; END IF;
    IF p.proconfig IS NULL OR NOT (c_sp = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'Conferir: % sem search_path = public, pg_temp.', v_sig;
    END IF;
    IF p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type::text = 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % ainda dá EXECUTE a PUBLIC.', v_sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'Conferir: anon pode executar %.', v_sig; END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'Conferir: authenticated não pode executar %.', v_sig; END IF;
  END LOOP;

  -- as internas: pg_temp, nada para PUBLIC, anon nem authenticated
  FOREACH v_sig IN ARRAY ARRAY['public.fn_cat_termos_pesquisa(text)', 'public.fn_cat_medida_texto(jsonb)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_sig; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc pr, unnest(pr.proconfig) cfg WHERE pr.oid = v_oid AND cfg = c_sp) THEN
      RAISE EXCEPTION 'Conferir: % sem search_path = public, pg_temp.', v_sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_proc pr, aclexplode(pr.proacl) x WHERE pr.oid = v_oid AND x.grantee = 0 AND x.privilege_type::text = 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % é executável por PUBLIC, anon ou authenticated.', v_sig;
    END IF;
  END LOOP;

  -- os textos: como textoMedida do ecrã e a pesquisa sem acentos
  IF public.fn_cat_medida_texto('{"tipo":"2D","largura":70,"comprimento":70,"unidade":"cm","espessura":null}'::jsonb) IS DISTINCT FROM '70×70 cm'
     OR public.fn_cat_medida_texto('{"tipo":"3D","largura":12.5,"comprimento":25,"espessura":0.8,"unidade":"mm"}'::jsonb) IS DISTINCT FROM '12,5×25×0,8 mm'
     OR public.fn_cat_medida_texto(NULL) IS NOT NULL
     OR public.fn_cat_termos_pesquisa('  Pizarra  BLANCO pizarra ') IS DISTINCT FROM ARRAY['blanco', 'pizarra']
     OR public.fn_cat_termos_pesquisa('Cerâmica') IS DISTINCT FROM ARRAY['ceramica']
     OR public.fn_cat_termos_pesquisa('   ') IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: fn_cat_medida_texto ou fn_cat_termos_pesquisa não dão o esperado.';
  END IF;

  -- correr as quatro de verdade (os erros de tipo só aparecem a correr), na nike, como um membro com services.view
  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_nike AND m.status = 'active'
    AND public.has_anew_permission_in_org(u.auth_user_id, 'services.view', c_nike)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE NOTICE 'Conferir: sem membro da nike com services.view; as funções não foram corridas aqui (o teste corre-as).';
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    r := public.cat_ler_produtos_pagina(c_nike, 'a', NULL, NULL, NULL, NULL, false, 5, 1);
    IF jsonb_typeof(r -> 'produtos') IS DISTINCT FROM 'array' OR (r ->> 'total') IS NULL THEN
      RAISE EXCEPTION 'Conferir: cat_ler_produtos_pagina não devolveu {total, produtos}.';
    END IF;
    r := public.cat_ler_produtos_contagens(c_nike, NULL, NULL);
    IF (r ->> 'total') IS NULL THEN RAISE EXCEPTION 'Conferir: cat_ler_produtos_contagens não devolveu total.'; END IF;
    IF jsonb_typeof(public.cat_ler_atributos_definicoes(c_nike) -> 'atributos') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Conferir: cat_ler_atributos_definicoes não devolveu atributos.';
    END IF;
    SELECT p2.id INTO v_prod FROM products p2 WHERE p2.organization_id = c_nike AND NOT p2.is_deleted AND p2.tipo_catalogo = 'produto' LIMIT 1;
    IF v_prod IS NOT NULL AND jsonb_typeof(public.cat_ler_atributos_produto(c_nike, v_prod) -> 'valores') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Conferir: cat_ler_atributos_produto não devolveu valores.';
    END IF;
    PERFORM set_config('request.jwt.claims', '', true);
  END IF;
  RAISE NOTICE 'catalogo_produtos_paginados: 4 leituras e 2 internas criadas — conferidas.';
END $c$;
