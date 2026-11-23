-- 23/11 (testarh, Mudelar): a pesquisa do Estúdio («Procurar móveis», «Procurar bases de duche», …).
--   1) Procurar pela referência (SKU) dava «0 resultados»: a base já encontrava pelo SKU, mas o Estúdio voltava a filtrar só pelo nome.
--      (isso corrige-se no ecrã; esta função também aceita a referência com ou sem traços/espaços: «DBBD-0098» = «DBBD0098»).
--   2) cat_ler_produtos_pagina ordena só pelo nome e devolve 50 de cada vez: com dezenas de «Móvel AXIS Suspenso 60x50x36 - …»,
--      o «Móvel AXIS Suspenso c/lavatório 60x50x36 2 Gav Fundo Reduzido» (MACBML0092) ficava para as páginas seguintes, que o Estúdio
--      não lia. E a pesquisa não olhava para os atributos («Cor da frente: Oak»).
--
-- UMA função NOVA, só de leitura (nenhuma função existente muda; cat_ler_produtos_pagina fica igual, as guardas md5 de
-- 20270122000000 e 20270125100000 continuam certas):
--
-- cat_estudio_procurar_produtos(p_org, p_q, p_subcategorias uuid[], p_pagina, p_limite)
--   - as permissões, os erros e o corte de custos/preços/fornecedores de cat_ler_produtos_pagina (products.edit OU services.view;
--     valores só com services.view); o mesmo envelope {total, pagina, limite, paginas, ve_valores, produtos} e as mesmas chaves em
--     cada produto (o ecrã lê-a com o mesmo código);
--   - p_subcategorias: as subcategorias do tipo de peça (todas numa só leitura); NULL ou vazio = todas;
--   - só os produtos que o Estúdio mostra: não apagados, ativos, fora de rascunho e (para quem vê valores) com PVP > 0, para as
--     páginas não virem cheias de produtos que o ecrã deita fora;
--   - a pesquisa: todas as palavras (sem acentos nem maiúsculas) no nome, SKU, marca, subcategoria, modelo, número do modelo OU nos
--     atributos (o nome do atributo, o valor e o nome da opção); OU o texto, só letras e algarismos, dentro do SKU (3+ caracteres);
--   - a ordem, os mais parecidos primeiro: 0 SKU igual; 1 parte do SKU; 2 nome igual; 3 o texto seguido dentro do nome; 4 todas as
--     palavras no nome; 5 o resto; depois o nome mais curto, o nome e o id. ATENÇÃO: p_pagina vem antes de p_limite.
--
-- O ecrã (src/pages/prototipo-estudio/catalogoRealDoEstudio.ts) chama esta função e, enquanto ela não existir na base, lê como antes
-- (cat_ler_produtos_pagina, subcategoria a subcategoria, com «Ver mais do catálogo» a pedir as páginas seguintes).
DO $g$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'cat_estudio_procurar_produtos') THEN
    RAISE EXCEPTION 'cat_estudio_procurar_produtos já existe na base: rever antes de aplicar';
  END IF;
  IF to_regprocedure('public.fn_cat_termos_pesquisa(text)') IS NULL OR to_regprocedure('public.fn_cat_exigir_uma(uuid,text[])') IS NULL
     OR to_regprocedure('public.fn_cat_pode(uuid,text)') IS NULL OR to_regprocedure('public.fn_cat_grupo_do_atributo(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Faltam funções internas do catálogo (fn_cat_termos_pesquisa, fn_cat_exigir_uma, fn_cat_pode, fn_cat_grupo_do_atributo).';
  END IF;
END $g$;

CREATE FUNCTION public.cat_estudio_procurar_produtos(
  p_org uuid,
  p_q text DEFAULT NULL,
  p_subcategorias uuid[] DEFAULT NULL,
  p_pagina integer DEFAULT 1,
  p_limite integer DEFAULT 50)
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
             'grau', pg.grau)
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

COMMENT ON FUNCTION public.cat_estudio_procurar_produtos(uuid, text, uuid[], integer, integer) IS
  'Pesquisa do Estúdio (20270126050000): a página de cat_ler_produtos_pagina (permissões, cortes e chaves iguais, mais «grau») para várias subcategorias, só produtos à venda (ativos, fora de rascunho, com PVP para quem vê valores); aceita o SKU inteiro ou parte (sem traços nem espaços) e os atributos; os mais parecidos primeiro (SKU igual, parte do SKU, nome igual, texto no nome, todas as palavras no nome, resto; depois o nome mais curto).';

REVOKE ALL ON FUNCTION public.cat_estudio_procurar_produtos(uuid, text, uuid[], integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_estudio_procurar_produtos(uuid, text, uuid[], integer, integer) TO authenticated, service_role;

DO $c$
DECLARE f constant text := 'public.cat_estudio_procurar_produtos(uuid,text,uuid[],integer,integer)';
BEGIN
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
END $c$;
