-- Catálogo: o resumo da lista de Produtos passa a contar os produtos sem preço de venda (base RH).
--
-- cat_ler_produtos_contagens(p_org uuid, p_q text, p_marca text) é recriada com a MESMA assinatura (sem overload) e
-- devolve, além das chaves de sempre, 'sem_preco': o número de produtos vivos do Catálogo (tipo produto, não apagados:
-- os mesmos de 'total') sem preço de venda. Sem preço de venda = o preço 'retail' MAIS RECENTE em product_prices
-- (valid_from DESC NULLS LAST, created_at DESC, id) não existe, tem valor NULL ou <= 0, onde o valor é
-- coalesce(preco_exato, price), como na página e na migration 20270120900000. Segue a mesma regra que 'sem_marca':
-- conta sobre os produtos que passam a pesquisa e a marca pedidas (o resumo do ecrã chama sem pesquisa nem marca).
--
-- Contrato do JSON (as 7 primeiras chaves ficam exatamente como estavam):
--   total, por_categoria[{id,n}], por_subcategoria[{id,n}], por_modelo[{id,n}], sem_referencia, sem_categoria,
--   sem_marca, e NOVA: sem_preco (integer).
-- Permissão: products.edit ou services.view (fn_cat_exigir_uma), SECURITY DEFINER, GRANT só a authenticated e
-- service_role: tudo igual. Não toca em dados.
--
-- Decisão (corte de preços): quem lê só com products.edit, sem services.view, não vê preços em cat_ler_produtos_pagina
-- (ve_valores false, pvp null). Por isso 'sem_preco' só se calcula com fn_cat_pode(p_org, 'services.view'); sem essa
-- permissão vem null (a chave existe, o ecrã esconde a linha) e a contagem nem chega a correr (CASE WHEN), para quem
-- não vê preços não pagar o custo dela. Não passa de um limite de leitura: já era o que a lista fazia.
--
-- Custo: um único DISTINCT ON sobre os preços 'retail' dos produtos de f, sem subconsulta por produto.
-- Os números medidos (antes e depois, nike e Mudelar) estão no relatório da tarefa, não no teste.
--
-- Guarda (falha sem escrever nada): cat_ler_produtos_contagens(uuid,text,text) tem de ser exatamente a definição
-- medida a 18/11/2026 na base RH (md5 de pg_get_functiondef), a de 20270118500000; é a única com esse nome.
-- Teste: supabase/tests/catalogo_contagens_sem_preco.test.sql (correr ANTES do db push: falha no passo 0).
-- Não precisa de código novo para ser aplicada: quem não lê 'sem_preco' ignora a chave nova.

SET LOCAL lock_timeout = '5s';

DO $guarda$
DECLARE v_h text;
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'cat_ler_produtos_contagens' AND pronamespace = 'public'::regnamespace) <> 1 THEN
    RAISE EXCEPTION 'Guarda: cat_ler_produtos_contagens tem de existir uma só vez (sem overloads) no remoto: rever antes de aplicar.';
  END IF;
  SELECT md5(pg_get_functiondef('public.cat_ler_produtos_contagens(uuid,text,text)'::regprocedure)) INTO v_h;
  IF v_h <> 'e2920926deca0eefcca0f16e78916463' THEN
    RAISE EXCEPTION 'Guarda: cat_ler_produtos_contagens no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.cat_ler_produtos_contagens(p_org uuid, p_q text DEFAULT NULL, p_marca text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_termos text[];
  v_marca text := nullif(lower(btrim(coalesce(p_marca, ''))), '');
  v_valores boolean;
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  v_valores := public.fn_cat_pode(p_org, 'services.view');
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
    ),
    -- o preço de venda mais recente de cada produto de f (um só varrimento, sem subconsulta por produto)
    pv AS (
      SELECT DISTINCT ON (pp.product_id) pp.product_id, coalesce(pp.preco_exato, pp.price) AS preco
      FROM product_prices pp
      JOIN f ON f.id = pp.product_id
      WHERE pp.price_type = 'retail'
      ORDER BY pp.product_id, pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id
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
      'sem_marca', (SELECT count(*)::integer FROM f WHERE f.marca IS NULL),
      -- sem preço de venda: o retail mais recente não existe, é NULL ou <= 0. pv só tem produtos de f (um por produto),
      -- por isso é o total menos os que têm preço > 0 (sem segunda junção a f). Null sem services.view (corte de preços).
      'sem_preco', CASE WHEN v_valores THEN
        (SELECT count(*)::integer FROM f) - (SELECT count(*)::integer FROM pv WHERE pv.preco > 0) END)
  );
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_produtos_contagens(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_produtos_contagens(uuid,text,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_produtos_contagens(uuid,text,text) IS
  'Catálogo (20270122100000): as contagens da navegação da lista de produtos (por categoria com as subs, subcategoria e modelo; sem referência = SKU vazio ou provisório; sem categoria; sem marca; sem preço = preço de venda retail mais recente inexistente, vazio ou <= 0), com a mesma pesquisa e marca de cat_ler_produtos_pagina. Permissão products.edit ou services.view.';

-- ─── Conferir (falha sem deixar nada) ───────────────────────────────────────────
DO $conferir$
DECLARE v_n integer; v_def boolean; v_cfg text;
BEGIN
  SELECT count(*), bool_and(prosecdef), string_agg(array_to_string(proconfig, ','), ';') INTO v_n, v_def, v_cfg
  FROM pg_proc WHERE proname = 'cat_ler_produtos_contagens' AND pronamespace = 'public'::regnamespace;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Conferir: tem de haver uma só cat_ler_produtos_contagens (há %).', v_n; END IF;
  IF NOT v_def THEN RAISE EXCEPTION 'Conferir: cat_ler_produtos_contagens tem de ser SECURITY DEFINER.'; END IF;
  IF v_cfg IS NULL OR v_cfg NOT LIKE '%search_path=%' THEN
    RAISE EXCEPTION 'Conferir: cat_ler_produtos_contagens sem search_path fixo (proconfig: %).', v_cfg;
  END IF;
  IF has_function_privilege('anon', 'public.cat_ler_produtos_contagens(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: anon não pode executar cat_ler_produtos_contagens.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.cat_ler_produtos_contagens(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: authenticated tem de poder executar cat_ler_produtos_contagens.';
  END IF;
END $conferir$;
