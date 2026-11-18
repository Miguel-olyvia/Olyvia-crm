-- Catálogo: as marcas do filtro «Marca» da lista de Produtos, só as que existem no que o utilizador já escolheu (base RH).
--
-- NOVA cat_ler_marcas_do_filtro(p_org, p_q, p_categoria, p_subcategoria, p_modelo, p_sem_categoria) → jsonb.
-- Devolve as marcas que existem no conjunto de produtos definido pelos filtros da lista (categoria, subcategoria, modelo,
-- pesquisa e «sem categoria»), com o número de produtos de cada uma, para o filtro «Marca» mostrar só as marcas que têm
-- produtos no que já foi escolhido. Só lê: não escreve nada e nenhuma função existente muda.
--
-- Contrato do JSON:
--   { "marcas": [ { "id": <brands.id uuid, ou null se a marca só existe como texto livre>,
--                   "marca": "<nome>", "n": <inteiro> } ... ],
--     "sem_marca": <inteiro>, "total": <inteiro> }
--   · "marcas" por nome sem acentos nem maiúsculas (desempate pelo nome em minúsculas). Os produtos sem marca contam
--     em "sem_marca" e não entram em "marcas". total = soma de n + sem_marca = o número de produtos do conjunto.
--   · "marca" é o texto que o filtro p_marca de cat_ler_produtos_pagina recebe: a lista compara
--     lower(btrim(coalesce(brands.name, products.marca_livre, ''))) com lower(btrim(p_marca)). As marcas agrupam-se por
--     essa mesma chave, por isso "n" é exatamente o «total» da lista com essa marca (e os mesmos filtros). Se duas grafias
--     só diferem em maiúsculas (ex.: marca de catálogo «Grohe» e texto livre «grohe») são UMA entrada, com o nome e o id
--     da marca de catálogo; um id só é null quando nenhum dos produtos da entrada tem marca de catálogo.
--   · Uma marca sem produtos no conjunto não aparece.
--
-- O conjunto é o da lista, copiado de cat_ler_produtos_pagina (definição viva, md5 abaixo, a de 20270120900000):
-- produtos da organização, tipo 'produto', não apagados; categoria = p.category_id ou a mãe da subcategoria;
-- subcategoria; modelo; sem categoria (nem categoria nem subcategoria); pesquisa sobre nome, referência, marca,
-- subcategoria e modelo (fn_cat_termos_pesquisa, sem acentos, todos os termos). Só deixa de fora a paginação e o filtro
-- de marca (é para o ecrã o oferecer).
-- Permissão: products.edit ou services.view (fn_cat_exigir_uma), senão CT001. SECURITY DEFINER, STABLE,
-- search_path = public, pg_temp, GRANT só a authenticated e service_role. Não mostra preços nem custos.
--
-- Desempenho (medido na organização maior da base RH, 29 639 produtos, só leitura): plan_cache_mode = force_custom_plan é DE PROPÓSITO. Do 6.º
-- pedido na mesma ligação o plpgsql passa a um plano genérico (os filtros são parâmetros) e a chamada sobe de ~70 ms para
-- ~575 ms (sem filtro) e de ~35 para ~290 ms (subcategoria). Com plano à medida de cada pedido os filtros nulos desaparecem
-- do plano. Não tirar sem voltar a medir 10 chamadas seguidas.
--
-- Guarda (falha sem escrever nada): cat_ler_produtos_pagina tem de ser exatamente a definição viva medida a 18/11/2026
-- (md5 de pg_get_functiondef, a mesma que guarda 20270122000000); a função nova ainda não pode existir.
-- Teste: supabase/tests/catalogo_marcas_do_filtro.test.sql (correr ANTES do db push: falha no passo 0).
-- Não precisa de código novo para ser aplicada: nada o chama até o ecrã passar a usá-la.

SET LOCAL lock_timeout = '5s';

DO $guarda$
DECLARE v_h text;
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'cat_ler_produtos_pagina' AND pronamespace = 'public'::regnamespace) <> 1 THEN
    RAISE EXCEPTION 'Guarda: cat_ler_produtos_pagina tem de existir uma só vez (sem overloads) no remoto: rever antes de aplicar.';
  END IF;
  SELECT md5(pg_get_functiondef('public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)'::regprocedure)) INTO v_h;
  IF v_h <> 'a605afa081f07d6dae2afa34311f0169' THEN
    RAISE EXCEPTION 'Guarda: cat_ler_produtos_pagina no remoto mudou (md5 %): rever o conjunto de cat_ler_marcas_do_filtro antes de aplicar.', v_h;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cat_ler_marcas_do_filtro' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'Guarda: cat_ler_marcas_do_filtro já existe no remoto: rever antes de aplicar.';
  END IF;
END $guarda$;

CREATE FUNCTION public.cat_ler_marcas_do_filtro(p_org uuid, p_q text DEFAULT NULL, p_categoria uuid DEFAULT NULL, p_subcategoria uuid DEFAULT NULL, p_modelo uuid DEFAULT NULL, p_sem_categoria boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET plan_cache_mode = force_custom_plan AS $$
DECLARE
  v_sem_cat boolean := coalesce(p_sem_categoria, false);
  v_termos text[];
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  v_termos := public.fn_cat_termos_pesquisa(p_q);
  RETURN (
    -- o conjunto f de cat_ler_produtos_pagina, sem a marca e sem a paginação
    WITH f AS MATERIALIZED (
      SELECT p.brand_id, nullif(btrim(coalesce(b.name, p.marca_livre, '')), '') AS marca
      FROM products p
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN product_categories s ON s.id = p.subcategory_id
      LEFT JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
      WHERE p.organization_id = p_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
        AND (p_categoria IS NULL OR p.category_id = p_categoria OR s.parent_id = p_categoria)
        AND (p_subcategoria IS NULL OR p.subcategory_id = p_subcategoria)
        AND (p_modelo IS NULL OR p.model_id = p_modelo)
        AND (NOT v_sem_cat OR (p.category_id IS NULL AND p.subcategory_id IS NULL))
        AND (v_termos IS NULL OR NOT EXISTS (
              SELECT 1 FROM unnest(v_termos) q
              WHERE strpos(lower(extensions.unaccent('extensions.unaccent'::regdictionary,
                      concat_ws(' ', p.name, p.sku, coalesce(b.name, p.marca_livre), s.name, pm.name, lpad(pm.numero::text, 4, '0')))), q) = 0))
    ),
    -- uma entrada por chave de comparação da lista (lower(btrim(marca))); nome e id da marca de catálogo, se houver
    g AS (
      -- nome e id vêm da MESMA linha: a de marca de catálogo primeiro (brand_id não nulo), depois o nome e o id
      SELECT DISTINCT ON (lower(f.marca))
             lower(f.marca) AS k, f.marca AS nome, f.brand_id AS id,
             (count(*) OVER (PARTITION BY lower(f.marca)))::integer AS n
      FROM f WHERE f.marca IS NOT NULL
      ORDER BY lower(f.marca), (f.brand_id IS NULL), f.marca, f.brand_id::text
    )
    SELECT jsonb_build_object(
      'marcas', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', g.id, 'marca', g.nome, 'n', g.n)
                         ORDER BY lower(extensions.unaccent('extensions.unaccent'::regdictionary, g.nome)), g.k)
        FROM g), '[]'::jsonb),
      'sem_marca', (SELECT count(*)::integer FROM f WHERE f.marca IS NULL),
      'total', (SELECT count(*)::integer FROM f))
  );
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_marcas_do_filtro(uuid,text,uuid,uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_marcas_do_filtro(uuid,text,uuid,uuid,uuid,boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_marcas_do_filtro(uuid,text,uuid,uuid,uuid,boolean) IS
  'Catálogo (20270122200000): as marcas dos produtos que passam os filtros da lista (pesquisa, categoria, subcategoria, modelo, sem categoria), com o número de produtos de cada uma: { marcas: [{ id, marca, n }], sem_marca, total }. O texto "marca" é o que o filtro p_marca de cat_ler_produtos_pagina compara. Permissão products.edit ou services.view (CT001).';

-- ─── Conferir (falha sem deixar nada) ───────────────────────────────────────────
DO $conferir$
DECLARE v_n integer; v_def boolean; v_cfg text;
BEGIN
  SELECT count(*), bool_and(prosecdef), string_agg(array_to_string(proconfig, ','), ';') INTO v_n, v_def, v_cfg
  FROM pg_proc WHERE proname = 'cat_ler_marcas_do_filtro' AND pronamespace = 'public'::regnamespace;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Conferir: tem de haver uma só cat_ler_marcas_do_filtro (há %).', v_n; END IF;
  IF NOT v_def THEN RAISE EXCEPTION 'Conferir: cat_ler_marcas_do_filtro tem de ser SECURITY DEFINER.'; END IF;
  IF v_cfg IS NULL OR v_cfg NOT LIKE '%search_path=%' THEN
    RAISE EXCEPTION 'Conferir: cat_ler_marcas_do_filtro sem search_path fixo (proconfig: %).', v_cfg;
  END IF;
  IF has_function_privilege('anon', 'public.cat_ler_marcas_do_filtro(uuid,text,uuid,uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: anon não pode executar cat_ler_marcas_do_filtro.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.cat_ler_marcas_do_filtro(uuid,text,uuid,uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: authenticated tem de poder executar cat_ler_marcas_do_filtro.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.cat_ler_marcas_do_filtro(uuid,text,uuid,uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: service_role tem de poder executar cat_ler_marcas_do_filtro.';
  END IF;
  IF v_cfg NOT LIKE '%plan_cache_mode=force_custom_plan%' THEN
    RAISE EXCEPTION 'Conferir: cat_ler_marcas_do_filtro sem plan_cache_mode=force_custom_plan (proconfig: %).', v_cfg;
  END IF;
END $conferir$;
