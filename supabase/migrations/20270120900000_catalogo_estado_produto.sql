-- Catálogo: o estado do produto (Rascunho / Ativo / Descontinuado) escolhe-se e grava-se; os produtos da Mudelar sem
-- preço de venda passam a Rascunho.
-- Base RH (uetjghdkwbywbftedtth). Sem tabelas nem colunas novas.
--
-- O estado é a coluna que já existe, products.status (enum public.product_status = 'active' | 'discontinued' | 'draft',
-- NOT NULL, por omissão 'active'). O enum já tem os três valores: não se acrescenta nada ao tipo.
--   'draft'        = Rascunho
--   'active'       = Ativo
--   'discontinued' = Descontinuado
-- Relação com products.is_active (o «ativo para venda» que a página do Catálogo já devolve como «ativo»):
--   is_active = (status <> 'discontinued'). Rascunho e Ativo ficam is_active = true (é como estão hoje os 426 rascunhos
--   da base, e como as importações do Catálogo os gravam); Descontinuado fica is_active = false (fora da venda), mas o
--   produto NÃO é apagado: continua no Catálogo, nas propostas, nos contratos e no histórico. Voltar de Descontinuado a
--   Ativo ou Rascunho volta a pôr is_active = true. Esta regra só a aplica a função nova (1.); a correção (4.) não mexe
--   em is_active.
--
-- 1. NOVA cat_definir_estado_produto(p_org, p_produto, p_status text) → { ok, id, estado, ativo, alterado }.
--    A mesma permissão de cat_guardar_produto (products.edit, por fn_cat_exigir → CT001). p_status fora de
--    'draft' | 'active' | 'discontinued' (ou NULL) → CT002. Produto inexistente, apagado ou de outra organização → CT003.
--    Tranca a linha (FOR NO KEY UPDATE); só escreve se mudar alguma coisa (alterado = false quando já estava assim).
--    cat_guardar_produto NÃO muda (continua a criar com 'active'): o ecrã chama esta função a seguir, como já faz com
--    cat_guardar_produto_texto / _tabelas / _atributos (p_produto pode ser o { tmp: "prod:…" } do produto novo).
-- 2. cat_ler_produtos_pagina (sobre a versão viva) passa a devolver em cada produto «estado» (texto do enum), ao lado do
--    «ativo» que já devolvia. Nada mais muda: assinatura, filtros, ordem, permissões e as outras chaves.
-- 3. cat_ler_produtos_tabelas (sobre a versão viva; é a leitura de que a ficha do produto tira a marca, a unidade e a
--    categoria) passa a devolver em cada produto «estado» e «ativo». Nada mais muda.
--    cat_ler_catalogo e cat_ler_produtos_contagens não mudam (nenhuma filtra nem devolve o estado).
-- 4. Dados, só na Mudelar (3242e925-da26-459a-8258-be04d904e355): todo o produto não apagado (NOT is_deleted e
--    deleted_at IS NULL) SEM preço de venda passa a status 'draft'. «Sem preço de venda» = não há linha 'retail' em
--    product_prices, ou a mais recente (a mesma que a página mostra como pvp: valid_from DESC NULLS LAST, created_at DESC)
--    tem preço NULL ou <= 0. Por REGRA, não por lista: apanha os « (sem preço)» dos Resguardos (já em rascunho), os 2
--    Apliques LED dos Móveis e o que as importações anteriores (20270120500000 a 20270120800000, aplicadas antes desta)
--    tenham deixado sem preço, como o NAVONA dos Revestimentos e as SOPHIE das Torneiras. Só muda status (o gatilho
--    update_products_updated_at mexe em updated_at, como em qualquer gravação); não mexe no nome, em is_active nem em
--    mais nada. Num só sentido: um rascunho COM preço fica rascunho. Contagens por categoria antes e depois em NOTICE.
--    Auditoria: até 500 produtos, uma linha por produto (fonte 'migration:catalogo_estado_produto'); acima disso,
--    app.audit_bypass = 'on' e UMA linha consolidada com as contagens.
--
-- Guarda (falha sem escrever nada): o enum tem de ter exatamente active/discontinued/draft; cat_ler_produtos_pagina e
-- cat_ler_produtos_tabelas têm de ser exatamente as medidas a 17/11/2026 na base RH (md5 de pg_get_functiondef);
-- cat_definir_estado_produto não pode já existir; a organização 3242e925-… tem de existir com o nome 'Mudelar'.
-- Teste: supabase/tests/catalogo_estado_produto.test.sql (correr ANTES do db push: falha no passo 0).

SET lock_timeout = '5s';

DO $guarda$
DECLARE v_h text;
BEGIN
  IF (SELECT string_agg(enumlabel::text, ',' ORDER BY enumlabel::text) FROM pg_enum WHERE enumtypid = 'public.product_status'::regtype)
     IS DISTINCT FROM 'active,discontinued,draft' THEN
    RAISE EXCEPTION 'Guarda: o enum product_status no remoto mudou: rever antes de aplicar.';
  END IF;
  SELECT md5(pg_get_functiondef('public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)'::regprocedure)) INTO v_h;
  IF v_h <> 'cb15a1912b8eda3b96cdd9428b3dbf95' THEN
    RAISE EXCEPTION 'Guarda: cat_ler_produtos_pagina no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  SELECT md5(pg_get_functiondef('public.cat_ler_produtos_tabelas(uuid)'::regprocedure)) INTO v_h;
  IF v_h <> '1d9c53d0f88b126290d6ab562b848eb5' THEN
    RAISE EXCEPTION 'Guarda: cat_ler_produtos_tabelas no remoto mudou (md5 %): rever antes de aplicar.', v_h;
  END IF;
  IF to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta fn_cat_exigir(uuid,text).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cat_definir_estado_produto' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'Guarda: cat_definir_estado_produto já existe no remoto: rever antes de aplicar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = '3242e925-da26-459a-8258-be04d904e355' AND name = 'Mudelar') THEN
    RAISE EXCEPTION 'Guarda: a organização 3242e925-… não existe com o nome Mudelar.';
  END IF;
END $guarda$;

-- ─── 1. cat_definir_estado_produto ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.cat_definir_estado_produto(p_org uuid, p_produto uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user   uuid := public.fn_cat_exigir(p_org, 'products.edit');
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_ativo  boolean;
  v_antes  record;
BEGIN
  IF v_status NOT IN ('draft', 'active', 'discontinued') THEN
    RAISE EXCEPTION 'Estado inválido: use draft (Rascunho), active (Ativo) ou discontinued (Descontinuado).' USING ERRCODE = 'CT002';
  END IF;
  v_ativo := v_status <> 'discontinued';

  SELECT p.id, p.status::text AS status, p.is_active INTO v_antes
  FROM products p
  WHERE p.id = p_produto AND p.organization_id = p_org AND NOT p.is_deleted AND p.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF v_antes.id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;

  IF v_antes.status = v_status AND v_antes.is_active IS NOT DISTINCT FROM v_ativo THEN
    RETURN jsonb_build_object('ok', true, 'id', v_antes.id, 'estado', v_status, 'ativo', v_ativo, 'alterado', false);
  END IF;

  PERFORM set_config('app.audit_source', 'catalogo', true);
  UPDATE products SET status = v_status::public.product_status, is_active = v_ativo
  WHERE id = v_antes.id;

  RETURN jsonb_build_object('ok', true, 'id', v_antes.id, 'estado', v_status, 'ativo', v_ativo, 'alterado', true);
END $function$;

REVOKE ALL ON FUNCTION public.cat_definir_estado_produto(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_definir_estado_produto(uuid,uuid,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_definir_estado_produto(uuid,uuid,text) IS
  '20270120900000: grava o estado do produto do Catálogo: draft (Rascunho), active (Ativo) ou discontinued (Descontinuado); is_active = (estado <> discontinued). products.edit (CT001); estado inválido CT002; produto inexistente CT003. Devolve { ok, id, estado, ativo, alterado }.';

-- ─── 2. cat_ler_produtos_pagina: devolve «estado» (resto igual à versão viva) ────────────────────────────────────────────────────────
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

-- ─── 3. cat_ler_produtos_tabelas: devolve «estado» e «ativo» em cada produto (resto igual à versão viva) ─────────────────────────────
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
         cats AS (SELECT c.id, c.name, c.parent_id, c.sort_order, coalesce(c.is_active, true) AS ativa FROM product_categories c
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

-- ─── conferir as leituras: as versões novas têm o estado ─────────────────────────────────────────────────────────────────────────────
DO $conf_leituras$
BEGIN
  IF strpos(pg_get_functiondef('public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)'::regprocedure),
            '''estado'', p.status::text') = 0
     OR strpos(pg_get_functiondef('public.cat_ler_produtos_tabelas(uuid)'::regprocedure), '''estado'', p.status::text') = 0 THEN
    RAISE EXCEPTION 'Conferir: as leituras não ficaram com o estado.';
  END IF;
END $conf_leituras$;

-- ─── 4. Dados: os produtos da Mudelar sem preço de venda passam a Rascunho ───────────────────────────────────────────────────────────
DO $correcao$
DECLARE
  c_org    constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte  constant text := 'migration:catalogo_estado_produto';
  c_limite_auditoria_por_linha constant integer := 500;
  v_alvo   integer;
  v_feitos integer;
  v_resto  integer;
  v_txt    text;
  v_por_cat jsonb;
BEGIN
  PERFORM set_config('app.audit_source', c_fonte, true);

  -- todos os produtos vivos da Mudelar, com a categoria (a da linha ou a mãe da subcategoria) e o pvp mais recente
  CREATE TEMP TABLE _ep_prod ON COMMIT DROP AS
  SELECT p.id, p.status::text AS status,
         coalesce(c.name, '(sem categoria)') AS categoria, coalesce(s.name, '(sem subcategoria)') AS subcategoria,
         (SELECT coalesce(pp.preco_exato, pp.price) FROM product_prices pp
          WHERE pp.product_id = p.id AND pp.price_type = 'retail'
          ORDER BY pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id LIMIT 1) AS pvp
  FROM products p
  LEFT JOIN product_categories s ON s.id = p.subcategory_id
  LEFT JOIN product_categories c ON c.id = coalesce(p.category_id, s.parent_id)
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL;

  CREATE TEMP TABLE _ep_alvo ON COMMIT DROP AS
  SELECT id, categoria, subcategoria FROM _ep_prod WHERE coalesce(pvp, 0) <= 0 AND status <> 'draft';
  SELECT count(*) INTO v_alvo FROM _ep_alvo;

  SELECT string_agg(format('%s: %s produtos, %s em rascunho, %s sem preço, %s sem preço e não em rascunho',
                           categoria, n, n_draft, n_sem, n_sem_nd), E'\n' ORDER BY categoria)
  INTO v_txt
  FROM (SELECT categoria, count(*) n, count(*) FILTER (WHERE status = 'draft') n_draft,
               count(*) FILTER (WHERE coalesce(pvp, 0) <= 0) n_sem,
               count(*) FILTER (WHERE coalesce(pvp, 0) <= 0 AND status <> 'draft') n_sem_nd
        FROM _ep_prod GROUP BY categoria) z;
  RAISE NOTICE 'catalogo_estado_produto: ANTES (Mudelar)%', E'\n' || coalesce(v_txt, '(sem produtos)');

  SELECT jsonb_object_agg(k, n), string_agg(format('%s: %s', k, n), E'\n' ORDER BY k)
  INTO v_por_cat, v_txt
  FROM (SELECT categoria || ' › ' || subcategoria AS k, count(*) AS n FROM _ep_alvo GROUP BY 1) z;
  RAISE NOTICE 'catalogo_estado_produto: a passar a rascunho: % produtos%', v_alvo, E'\n' || coalesce(v_txt, '(nenhum)');

  IF v_alvo > 0 THEN
    IF v_alvo > c_limite_auditoria_por_linha THEN
      PERFORM set_config('app.audit_bypass', 'on', true);
    END IF;
    UPDATE products p SET status = 'draft'::public.product_status
    FROM _ep_alvo a
    WHERE p.id = a.id AND p.organization_id = c_org AND p.status <> 'draft'::public.product_status;
    GET DIAGNOSTICS v_feitos = ROW_COUNT;
    IF v_alvo > c_limite_auditoria_por_linha THEN
      PERFORM set_config('app.audit_bypass', 'off', true);
      PERFORM public.fn_manual_audit_log('products', c_org, c_org, 'UPDATE',
        jsonb_build_object('correcao', 'catalogo_estado_produto', 'campo', 'status', 'para', 'draft',
                           'regra', 'sem preço de venda (retail inexistente, NULL ou <= 0)', 'produtos', v_feitos,
                           'por_subcategoria', v_por_cat),
        c_fonte, c_org);
    END IF;
    IF v_feitos <> v_alvo THEN
      RAISE EXCEPTION 'Conferir: % produtos passados a rascunho em vez de %.', v_feitos, v_alvo;
    END IF;
  END IF;

  -- conferir: nenhum produto vivo da Mudelar sem preço de venda fora de rascunho
  SELECT count(*) INTO v_resto
  FROM products p
  WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.deleted_at IS NULL AND p.status <> 'draft'::public.product_status
    AND coalesce((SELECT coalesce(pp.preco_exato, pp.price) FROM product_prices pp
                  WHERE pp.product_id = p.id AND pp.price_type = 'retail'
                  ORDER BY pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id LIMIT 1), 0) <= 0;
  IF v_resto > 0 THEN
    RAISE EXCEPTION 'Conferir: ainda há % produtos da Mudelar sem preço de venda fora de rascunho.', v_resto;
  END IF;

  SELECT string_agg(format('%s: %s produtos, %s em rascunho, %s sem preço e não em rascunho', categoria, n, n_draft, n_sem_nd),
                    E'\n' ORDER BY categoria)
  INTO v_txt
  FROM (SELECT z.categoria, count(*) n, count(*) FILTER (WHERE p.status = 'draft') n_draft,
               count(*) FILTER (WHERE coalesce(z.pvp, 0) <= 0 AND p.status <> 'draft') n_sem_nd
        FROM _ep_prod z JOIN products p ON p.id = z.id GROUP BY z.categoria) y;
  RAISE NOTICE 'catalogo_estado_produto: DEPOIS (Mudelar)%', E'\n' || coalesce(v_txt, '(sem produtos)');
END $correcao$;
