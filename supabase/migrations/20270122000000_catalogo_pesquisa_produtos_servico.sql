-- 17/11: os Negócios, os Serviços e o Estúdio passaram a ler o catálogo leve (cat_ler_catalogo_servicos, 20270121000001), que só
-- traz os 145 produtos dos consumos. Os ecrãs que escolhem um produto da lista completa (visita, «exige produto», «passa a trazer
-- este serviço») e a lista dos produtos de um serviço precisam agora de pesquisa no servidor. Duas funções NOVAS:
--
-- 1. cat_pesquisar_produtos(p_org, p_q, p_servico, p_categoria, p_subcategoria, p_pagina, p_limite)
--    A página de cat_ler_produtos_pagina (as mesmas permissões, o mesmo corte de custos/preços/fornecedores a quem não tem
--    services.view, a mesma pesquisa p_q, a mesma ordenação nome+id e a mesma paginação, o mesmo envelope
--    {total, pagina, limite, paginas, ve_valores, produtos}), com:
--      - o filtro p_servico: só os produtos com products.servico_id = p_servico;
--      - em cada linha, servico_id e fator_servico do produto.
--    Os restantes campos de cada linha são os de cat_ler_produtos_pagina, campo a campo.
--    Sem p_modelo, p_marca e p_sem_categoria (estes ecrãs não os pedem). Atenção à ordem: p_pagina vem antes de p_limite.
--
-- 2. cat_ler_produtos_tabelas_servicos(p_org)
--    O JSON de cat_ler_produtos_tabelas (as mesmas chaves, as mesmas permissões e os mesmos cortes v_tec/v_mat), com uma só
--    diferença: o array produtos só traz os produtos dos consumos (service_materials, não apagados) dos serviços do catálogo
--    da organização, o critério de cat_ler_catalogo_servicos (145 na Mudelar e na nike). categoriasProduto, marcas, unidades e
--    exige continuam a ser calculadas sobre o catálogo inteiro, e por isso são iguais às de cat_ler_produtos_tabelas.
--
-- Nenhuma função existente muda (nem cat_ler_produtos_pagina nem cat_ler_produtos_tabelas).
-- O código que passa a chamar estas funções entra no mesmo envio: sem ele, esta migration não muda nada no ecrã.
-- Copiado da definição viva (pg_get_functiondef, md5 abaixo, 17/11/2026), que é a de 20270120900000.
DO $g$
BEGIN
  IF md5(pg_get_functiondef('public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)'::regprocedure))
     <> 'a605afa081f07d6dae2afa34311f0169' THEN
    RAISE EXCEPTION 'cat_ler_produtos_pagina mudou desde a leitura (md5): rever cat_pesquisar_produtos antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.cat_ler_produtos_tabelas(uuid)'::regprocedure)) <> 'd96670d8e553354579237e69db19c7cc' THEN
    RAISE EXCEPTION 'cat_ler_produtos_tabelas mudou desde a leitura (md5): rever cat_ler_produtos_tabelas_servicos antes de aplicar';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname IN ('cat_pesquisar_produtos', 'cat_ler_produtos_tabelas_servicos')) THEN
    RAISE EXCEPTION 'cat_pesquisar_produtos ou cat_ler_produtos_tabelas_servicos já existe na base: rever antes de aplicar';
  END IF;
END $g$;

-- ─── 1. cat_pesquisar_produtos ────────────────────────────────────────────────
CREATE FUNCTION public.cat_pesquisar_produtos(
  p_org uuid,
  p_q text DEFAULT NULL,
  p_servico uuid DEFAULT NULL,
  p_categoria uuid DEFAULT NULL,
  p_subcategoria uuid DEFAULT NULL,
  p_pagina integer DEFAULT 1,
  p_limite integer DEFAULT 50)
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
             'fator_servico', p.fator_servico)
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

COMMENT ON FUNCTION public.cat_pesquisar_produtos(uuid, text, uuid, uuid, uuid, integer, integer) IS
  'A página de cat_ler_produtos_pagina (permissões, cortes, pesquisa, ordem e paginação iguais) com o filtro p_servico (products.servico_id) e servico_id e fator_servico em cada linha. Para Negócios, Serviços e Estúdio (20270122000000).';

REVOKE ALL ON FUNCTION public.cat_pesquisar_produtos(uuid, text, uuid, uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_pesquisar_produtos(uuid, text, uuid, uuid, uuid, integer, integer) TO authenticated, service_role;

-- ─── 2. cat_ler_produtos_tabelas_servicos ─────────────────────────────────────
CREATE FUNCTION public.cat_ler_produtos_tabelas_servicos(p_org uuid)
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
         cats AS (SELECT c.id, c.name, c.parent_id, c.sort_order, coalesce(c.is_active, true) AS ativa FROM product_categories c
                  WHERE c.id IN (SELECT id FROM usadas WHERE id IS NOT NULL)
                     OR (c.deleted_at IS NULL AND (c.organization_id = p_org
                         OR c.id IN (SELECT o.category_id FROM product_category_organizations o WHERE o.organization_id = p_org))))
    SELECT jsonb_build_object(
      'produtos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'brand_id', p.brand_id, 'marca', b.name, 'uom_id', p.uom_id,
                    'uom', u.code, 'category_id', p.category_id, 'subcategory_id', p.subcategory_id,
                    'estado', p.status::text, 'ativo', p.is_active))
                  FROM cons p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN uom u ON u.id = p.uom_id), '[]'),
      'categoriasProduto', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
                    SELECT id, name, parent_id, sort_order, ativa FROM cats
                    UNION SELECT c.id, c.name, c.parent_id, c.sort_order, coalesce(c.is_active, true) FROM product_categories c WHERE c.id IN (SELECT parent_id FROM cats)) x), '[]'),
      'marcas', coalesce((SELECT jsonb_agg(DISTINCT b.name) FROM brands b
                  WHERE b.deleted_at IS NULL AND coalesce(b.is_active, true)
                    AND (b.organization_id = p_org OR b.id IN (SELECT brand_id FROM prod))), '[]'),
      'unidades', coalesce((SELECT jsonb_agg(DISTINCT u.code) FROM uom u
                  WHERE u.is_active AND u.base_uom_id IS NULL AND (u.organization_id IS NULL OR u.organization_id = p_org)), '[]'),
      'exige', coalesce((SELECT jsonb_agg(jsonb_build_object('service_id', id, 'categoria_produto_id', exige_categoria_produto_id)) FROM exige), '[]')
    ));
END $function$;

COMMENT ON FUNCTION public.cat_ler_produtos_tabelas_servicos(uuid) IS
  'O JSON de cat_ler_produtos_tabelas (mesmas chaves, permissões e cortes), com produtos só dos produtos referidos nos consumos (service_materials) dos serviços do catálogo; as outras chaves iguais. Para Negócios, Serviços e Estúdio (20270122000000).';

REVOKE ALL ON FUNCTION public.cat_ler_produtos_tabelas_servicos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_produtos_tabelas_servicos(uuid) TO authenticated, service_role;

DO $c$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.cat_pesquisar_produtos(uuid,text,uuid,uuid,uuid,integer,integer)',
                           'public.cat_ler_produtos_tabelas_servicos(uuid)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION '%: anon não pode ter EXECUTE', f;
    END IF;
    IF NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION '%: authenticated tem de ter EXECUTE', f;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
               WHERE p.oid = to_regprocedure(f) AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION '%: PUBLIC não pode ter EXECUTE', f;
    END IF;
  END LOOP;
END $c$;
