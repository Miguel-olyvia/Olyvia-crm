-- =============================================================================
-- Catálogo — VISTA DA FAMÍLIA COM 3D: uma leitura nova, SÓ DE LEITURA.
-- SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth).
-- =============================================================================
--
-- Pedido do dono: «gostava de abrir as famílias pra eu puder ver o produto em 3D e escolher a cor».
-- Desenho: tmp/desenho-familia-3d.md, com as decisões finais do dono (26/11):
--   1. as cores vêm com hex, foto e nome de cada opção (não se parte o texto atributos_resumo de cat_ler_familia);
--   2. só se mostra o que existe: o ecrã tira as opções dos VALORES DOS PRODUTOS desta leitura (nunca da lista
--      completa do grupo), por isso uma cor que nenhum produto da família tem não chega ao ecrã;
--   3. stock só informativo: a soma das quantidades do produto em todos os armazéns vivos da empresa, só a quem tem
--      inventory.view (a mesma conferência de stocks_select_policy e de inv_valor_stock_armazens); sem ela «stock»
--      vem null e o ecrã não mostra a linha. Nunca custo médio;
--   4. as outras medidas do mesmo modelo de catálogo vêm em «outras_medidas» (o ecrã mantém a cor ao mudar).
--
-- Cria UMA função:
--   cat_ler_familia_vista(p_org uuid, p_id uuid) → jsonb, STABLE, SECURITY DEFINER, search_path vazio.
--     {familia:{id,nome}, ve_valores, ve_stock,
--      eixos:[{attribute_id,code,rotulo,papel,posicao,is_measurement}],
--      produtos:[{id,nome,sku,estado,pvp,stock,modelo_id,modelo,subcategoria_id,subcategoria,categoria_id,categoria,
--                 medida:{attribute_id,valor,unidade,texto}, aplicacao:{valor,nome},
--                 valores:{<attribute_id>:{valor,nome,hex,foto,sigla,ordem,is_metal}}}],
--      modelos:[model_id], outras_medidas:[{id,nome,atual,medida,medida_valor,unidade}]}
--   Porta: a de cat_ler_familia (fn_cat_exigir_uma products.edit | services.view). PVP só com services.view
--   (fn_cat_pode), como cat_ler_familia. NUNCA devolve custo, compra, grossista, distribuidor nem fornecedor.
--   Opções resolvidas pelo grupo do atributo (fn_cat_grupo_do_atributo), não pela sigla do SKU.
--   Medido (EXPLAIN ANALYZE, leitura, base RH): família de 36 produtos ~12 ms; outras medidas do modelo com 89
--   famílias ~15 ms.
--
-- NÃO ESCREVE NADA: nenhuma tabela, coluna, política, permissão nem dado muda. Nenhuma função existente muda.
-- EXECUTE só para authenticated (os privilégios por omissão da base dão-no também a anon e service_role: revogam-se).
--
-- MIGRATION E CÓDIGO ENTRAM JUNTOS: o ecrã /catalogo/produtos/familias/:id (fase A) chama esta função; sem a migration
-- o ecrã falha a leitura. Sem o ecrã, ninguém a chama (não parte nada).
--
-- ORDEM: depois de 20270129100000 (a última aplicada no remoto a 26/11). Não colide com 20270129200000 (subscrições
-- da Mudelar, noutro ramo). Antes do db push: supabase migration list --linked, e db push --dry-run tem de listar SÓ
-- esta migration. Aplicar a partir de uma cópia limpa.
--
-- REVERSÃO: fora da pasta das migrations (DROP FUNCTION public.cat_ler_familia_vista(uuid,uuid); não há dados).
-- =============================================================================

SET lock_timeout = '5s';

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_falta text; v_h text;
BEGIN
  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.fn_cat_exigir_uma(uuid,text[])', 'public.fn_cat_pode(uuid,text)',
                    'public.fn_cat_grupo_do_atributo(uuid,uuid)', 'public.has_anew_permission_for_org(uuid,text,uuid)',
                    'public.get_user_visible_org_ids(uuid)', 'public.fn_cat_medida_ler(jsonb,text)',
                    'public.fn_cat_medida_texto(jsonb)', 'auth.uid()']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_falta IS NOT NULL THEN RAISE EXCEPTION 'cat_ler_familia_vista: faltam funções: %.', v_falta; END IF;

  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.product_families', 'public.product_family_axes', 'public.product_family_members',
                    'public.products', 'public.product_attributes', 'public.product_attribute_values',
                    'public.attribute_option_group_values', 'public.product_categories', 'public.product_models',
                    'public.product_prices', 'public.stocks', 'public.warehouses']) s
  WHERE to_regclass(s) IS NULL;
  IF v_falta IS NOT NULL THEN RAISE EXCEPTION 'cat_ler_familia_vista: faltam tabelas: %.', v_falta; END IF;

  -- uma só versão: nenhuma outra assinatura com este nome
  IF EXISTS (SELECT 1 FROM pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'cat_ler_familia_vista'
               AND p.oid <> coalesce(to_regprocedure('public.cat_ler_familia_vista(uuid,uuid)')::oid, 0)) THEN
    RAISE EXCEPTION 'cat_ler_familia_vista: já existe outra assinatura com este nome.';
  END IF;

  -- impressão digital das tabelas, vistas, colunas, privilégios e políticas do esquema public (comparada no fim)
  SELECT md5(
           coalesce((SELECT string_agg(c.oid::text || ':' || c.relname::text || ':' || c.relkind::text || ':'
                                       || coalesce(c.relacl::text, '') || ':' || c.relrowsecurity::text || ':' || coalesce(at.cols, ''),
                                       '|' ORDER BY c.oid)
                     FROM pg_class c
                     LEFT JOIN LATERAL (
                       SELECT string_agg(a.attname::text || ' ' || a.atttypid::text || ' ' || a.attnotnull::text
                                         || ' ' || coalesce(a.attacl::text, ''), ',' ORDER BY a.attnum) AS cols
                       FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) at ON true
                     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind::text IN ('r', 'p', 'v', 'm')), '')
           || '#' ||
           coalesce((SELECT string_agg(pl.polrelid::text || ':' || pl.polname::text || ':' || pl.polcmd::text || ':'
                                       || coalesce(pg_get_expr(pl.polqual, pl.polrelid), '') || ':'
                                       || coalesce(pg_get_expr(pl.polwithcheck, pl.polrelid), ''), '|' ORDER BY pl.oid)
                     FROM pg_policy pl JOIN pg_class c ON c.oid = pl.polrelid
                     WHERE c.relnamespace = 'public'::regnamespace), ''))
    INTO v_h;
  PERFORM set_config('cat_vista.h_tabelas', v_h, false);
END $g$;

-- ─── 1. A função ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_ler_familia_vista(p_org uuid, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_valores boolean;
  v_stock boolean;
  v_familia jsonb;
  v_corpo jsonb;
  v_medidas jsonb;
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);

  SELECT jsonb_build_object('id', f.id, 'nome', f.name) INTO v_familia
  FROM public.product_families f
  WHERE f.id = p_id AND f.organization_id = p_org;
  IF v_familia IS NULL THEN RAISE EXCEPTION 'Família não encontrada.' USING ERRCODE = 'CT003'; END IF;

  -- PVP só com services.view (como cat_ler_familia); só o preço de venda, nunca custo
  v_valores := public.fn_cat_pode(p_org, 'services.view');
  -- stock só com a leitura que stocks_select_policy pede: organização visível e inventory.view
  v_stock := v_uid IS NOT NULL
             AND p_org IN (SELECT public.get_user_visible_org_ids(v_uid))
             AND public.has_anew_permission_for_org(v_uid, 'inventory.view', p_org);

  -- eixos e produtos: as opções de cada eixo são só as que os produtos da família têm
  WITH eixo AS (
    SELECT x.attribute_id, x.papel, x.posicao, a.code::text AS code, a.label, coalesce(a.is_measurement, false) AS is_measurement,
           CASE WHEN coalesce(a.is_measurement, false) THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
    FROM public.product_family_axes x
    JOIN public.product_attributes a ON a.id = x.attribute_id AND a.organization_id = p_org AND a.deleted_at IS NULL
    WHERE x.family_id = p_id
  ), aplic AS (
    SELECT a.id, public.fn_cat_grupo_do_atributo(a.id, p_org) AS grupo
    FROM public.product_attributes a
    WHERE a.organization_id = p_org AND a.deleted_at IS NULL AND a.code::text = 'aplicacao'
    ORDER BY a.id LIMIT 1
  ), prod AS (
    SELECT p.id, p.name, p.sku, p.status::text AS estado, p.model_id, p.subcategory_id, p.category_id
    FROM public.product_family_members m
    JOIN public.products p ON p.id = m.product_id
    WHERE m.family_id = p_id AND m.organization_id = p_org
      AND p.organization_id = p_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
  )
  SELECT jsonb_build_object(
           'eixos', coalesce((SELECT jsonb_agg(jsonb_build_object('attribute_id', e.attribute_id, 'code', e.code, 'rotulo', e.label,
                                                                  'papel', e.papel, 'posicao', e.posicao, 'is_measurement', e.is_measurement)
                                               ORDER BY e.posicao, e.attribute_id) FROM eixo e), '[]'::jsonb),
           'produtos', coalesce((SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'nome', p.name, 'sku', p.sku, 'estado', p.estado,
               'pvp', CASE WHEN vp.preco > 0 THEN vp.preco END,
               'stock', st.total,
               'modelo_id', pm.id, 'modelo', pm.name,
               'subcategoria_id', p.subcategory_id, 'subcategoria', s.name,
               'categoria_id', coalesce(p.category_id, s.parent_id), 'categoria', c.name,
               'medida', md.medida,
               'aplicacao', ap.aplicacao,
               'valores', coalesce(va.valores, '{}'::jsonb))
             ORDER BY p.name, p.id)
           FROM prod p
           LEFT JOIN public.product_categories s ON s.id = p.subcategory_id
           LEFT JOIN public.product_categories c ON c.id = coalesce(p.category_id, s.parent_id)
           LEFT JOIN public.product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
           LEFT JOIN LATERAL (
             SELECT coalesce(pp.preco_exato, pp.price) AS preco FROM public.product_prices pp
             WHERE v_valores AND pp.product_id = p.id AND pp.price_type = 'retail'
             ORDER BY pp.valid_from DESC NULLS LAST LIMIT 1) vp ON true
           LEFT JOIN LATERAL (
             SELECT coalesce(sum(coalesce(sk.quantity, 0)), 0) AS total
             FROM public.stocks sk
             JOIN public.warehouses w ON w.id = sk.warehouse_id AND w.organization_id = p_org AND w.deleted_at IS NULL
             WHERE v_stock AND sk.product_id = p.id AND sk.organization_id = p_org AND sk.deleted_at IS NULL
             HAVING v_stock) st ON true
           LEFT JOIN LATERAL (
             SELECT jsonb_build_object('attribute_id', v.attribute_id, 'valor', v.value_json, 'unidade', v.unit,
                      'texto', coalesce(public.fn_cat_medida_texto(public.fn_cat_medida_ler(v.value_json, v.unit)), v.value_text)) AS medida
             FROM public.product_attribute_values v
             JOIN public.product_attributes a ON a.id = v.attribute_id AND a.organization_id = p_org AND a.deleted_at IS NULL AND a.is_measurement
             WHERE v.product_id = p.id
             ORDER BY (EXISTS (SELECT 1 FROM eixo e WHERE e.attribute_id = a.id)) DESC, coalesce(a.sort_order, 0), a.id
             LIMIT 1) md ON true
           LEFT JOIN LATERAL (
             SELECT jsonb_build_object('valor', v.value_text,
                      'nome', coalesce(nullif(o.display_name::text, ''), nullif(o.value_text::text, ''), v.value_text)) AS aplicacao
             FROM aplic x
             JOIN public.product_attribute_values v ON v.product_id = p.id AND v.attribute_id = x.id
             LEFT JOIN public.attribute_option_group_values o ON o.group_id = x.grupo AND o.value_text = v.value_text AND o.is_active
             WHERE coalesce(v.value_text, '') <> '') ap ON true
           LEFT JOIN LATERAL (
             SELECT jsonb_object_agg(e.attribute_id::text, jsonb_build_object(
                      'valor', CASE WHEN e.is_measurement
                                    THEN coalesce(public.fn_cat_medida_texto(public.fn_cat_medida_ler(v.value_json, v.unit)), v.value_text)
                                    ELSE v.value_text END,
                      'nome', CASE WHEN e.is_measurement
                                   THEN coalesce(public.fn_cat_medida_texto(public.fn_cat_medida_ler(v.value_json, v.unit)), v.value_text)
                                   ELSE coalesce(nullif(o.display_name::text, ''), nullif(o.value_text::text, ''), v.value_text) END,
                      'hex', nullif(o.hex_color::text, ''), 'foto', nullif(o.foto_path, ''), 'sigla', o.sigla,
                      'ordem', o.sort_order, 'is_metal', o.is_metal)) AS valores
             FROM eixo e
             JOIN public.product_attribute_values v ON v.product_id = p.id AND v.attribute_id = e.attribute_id
             LEFT JOIN public.attribute_option_group_values o
               ON NOT e.is_measurement AND o.group_id = e.grupo AND o.value_text = v.value_text AND o.is_active) va ON true
           ), '[]'::jsonb),
           'modelos', coalesce((SELECT jsonb_agg(DISTINCT p.model_id) FROM prod p WHERE p.model_id IS NOT NULL), '[]'::jsonb))
    INTO v_corpo;

  -- as outras medidas: as famílias com produtos do mesmo modelo de catálogo (com esta incluída, «atual»)
  WITH modelo AS (
    SELECT DISTINCT p.model_id
    FROM public.product_family_members m
    JOIN public.products p ON p.id = m.product_id
    WHERE m.family_id = p_id AND m.organization_id = p_org
      AND p.organization_id = p_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND p.model_id IS NOT NULL
  ), fam AS (
    SELECT DISTINCT m.family_id
    FROM modelo d
    JOIN public.products p ON p.model_id = d.model_id
    JOIN public.product_family_members m ON m.product_id = p.id AND m.organization_id = p_org
    WHERE p.organization_id = p_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.name, 'atual', f.id = p_id,
                                               'medida', md.texto, 'medida_valor', md.valor, 'unidade', md.unidade)
                            ORDER BY f.name, f.id), '[]'::jsonb)
    INTO v_medidas
  FROM fam x
  JOIN public.product_families f ON f.id = x.family_id AND f.organization_id = p_org
  LEFT JOIN LATERAL (
    SELECT coalesce(public.fn_cat_medida_texto(public.fn_cat_medida_ler(v.value_json, v.unit)), v.value_text) AS texto,
           v.value_json AS valor, v.unit AS unidade
    FROM public.product_family_members m
    JOIN public.products p ON p.id = m.product_id
    CROSS JOIN LATERAL (
      SELECT v1.value_json, v1.unit, v1.value_text
      FROM public.product_attribute_values v1
      JOIN public.product_attributes a ON a.id = v1.attribute_id AND a.organization_id = p_org AND a.deleted_at IS NULL AND a.is_measurement
      WHERE v1.product_id = p.id
      ORDER BY coalesce(a.sort_order, 0), a.id
      LIMIT 1) v
    WHERE m.family_id = f.id AND m.organization_id = p_org
      AND p.organization_id = p_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
    ORDER BY m.product_id
    LIMIT 1) md ON true;

  RETURN jsonb_build_object('familia', v_familia, 've_valores', v_valores, 've_stock', v_stock,
                            'eixos', v_corpo -> 'eixos', 'produtos', v_corpo -> 'produtos', 'modelos', v_corpo -> 'modelos',
                            'outras_medidas', v_medidas);
END $$;

-- ─── 2. Permissões: EXECUTE só para authenticated ───────────────────────────────
REVOKE ALL ON FUNCTION public.cat_ler_familia_vista(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cat_ler_familia_vista(uuid,uuid) TO authenticated;

COMMENT ON FUNCTION public.cat_ler_familia_vista(uuid,uuid) IS
  'Catálogo (20270129300000): a família para a vista com 3D: eixos, produtos com o valor de cada eixo (nome, hex, foto), PVP com services.view, stock total com inventory.view, medida, aplicação e as outras medidas do mesmo modelo de catálogo. Só leitura; nunca custo. products.edit ou services.view.';

-- ─── 3. Conferir ────────────────────────────────────────────────────────────────
DO $c$
DECLARE
  c_f constant text := 'public.cat_ler_familia_vista(uuid,uuid)';
  v_oid oid := to_regprocedure('public.cat_ler_familia_vista(uuid,uuid)')::oid;
  v_src text;
  v_h text;
  v_antes text := current_setting('cat_vista.h_tabelas', true);
BEGIN
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', c_f; END IF;

  IF (SELECT count(*) FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'cat_ler_familia_vista') <> 1 THEN
    RAISE EXCEPTION 'Conferir: há mais do que uma versão de cat_ler_familia_vista.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                 WHERE p.oid = v_oid AND p.prosecdef AND p.provolatile::text = 's' AND p.prolang = (SELECT l.oid FROM pg_language l WHERE l.lanname::text = 'plpgsql')
                   AND coalesce(array_length(p.proconfig, 1), 0) = 1
                   AND (p.proconfig[1]::text = 'search_path=""' OR p.proconfig[1]::text = 'search_path=')) THEN
    RAISE EXCEPTION 'Conferir: % não é STABLE SECURITY DEFINER com o search_path vazio.', c_f;
  END IF;

  IF has_function_privilege('anon', c_f, 'EXECUTE') OR has_function_privilege('service_role', c_f, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', c_f, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = v_oid AND a.grantee = 0) THEN
    RAISE EXCEPTION 'Conferir: EXECUTE de % não é só para authenticated.', c_f;
  END IF;

  -- o corpo só lê, tem a porta, a máscara do PVP e a conferência do stock, e não toca em custos
  v_src := (SELECT p.prosrc FROM pg_proc p WHERE p.oid = v_oid);
  IF v_src ~* '\m(insert|update|delete|truncate|merge|copy|grant|revoke|alter|drop|create)\M' THEN
    RAISE EXCEPTION 'Conferir: o corpo de % tem uma instrução que escreve.', c_f;
  END IF;
  IF v_src ~* '(purchase|wholesale|distributor|average_cost|item_suppliers|fornecedor)' THEN
    RAISE EXCEPTION 'Conferir: o corpo de % lê custos ou fornecedores.', c_f;
  END IF;
  IF position('PERFORM public.fn_cat_exigir_uma(p_org, ARRAY[''products.edit'', ''services.view'']);' IN v_src) = 0
     OR position('v_valores := public.fn_cat_pode(p_org, ''services.view'');' IN v_src) = 0
     OR position('public.has_anew_permission_for_org(v_uid, ''inventory.view'', p_org)' IN v_src) = 0
     OR position('WHERE v_valores AND pp.product_id = p.id AND pp.price_type = ''retail''' IN v_src) = 0
     OR position('WHERE v_stock AND sk.product_id = p.id' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Conferir: falta a porta, a máscara do PVP ou a conferência do stock em %.', c_f;
  END IF;

  -- nenhuma tabela, coluna, privilégio nem política mudou
  IF v_antes IS NULL OR v_antes = '' THEN RAISE EXCEPTION 'Conferir: falta a impressão digital tirada nas guardas.'; END IF;
  SELECT md5(
           coalesce((SELECT string_agg(c.oid::text || ':' || c.relname::text || ':' || c.relkind::text || ':'
                                       || coalesce(c.relacl::text, '') || ':' || c.relrowsecurity::text || ':' || coalesce(at.cols, ''),
                                       '|' ORDER BY c.oid)
                     FROM pg_class c
                     LEFT JOIN LATERAL (
                       SELECT string_agg(a.attname::text || ' ' || a.atttypid::text || ' ' || a.attnotnull::text
                                         || ' ' || coalesce(a.attacl::text, ''), ',' ORDER BY a.attnum) AS cols
                       FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) at ON true
                     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind::text IN ('r', 'p', 'v', 'm')), '')
           || '#' ||
           coalesce((SELECT string_agg(pl.polrelid::text || ':' || pl.polname::text || ':' || pl.polcmd::text || ':'
                                       || coalesce(pg_get_expr(pl.polqual, pl.polrelid), '') || ':'
                                       || coalesce(pg_get_expr(pl.polwithcheck, pl.polrelid), ''), '|' ORDER BY pl.oid)
                     FROM pg_policy pl JOIN pg_class c ON c.oid = pl.polrelid
                     WHERE c.relnamespace = 'public'::regnamespace), ''))
    INTO v_h;
  IF v_h <> v_antes THEN RAISE EXCEPTION 'Conferir: uma tabela, coluna, privilégio ou política do esquema public mudou.'; END IF;

  RAISE NOTICE 'cat_ler_familia_vista: uma versão, só leitura, search_path vazio, EXECUTE só para authenticated, nenhuma tabela mudou — conferido.';
END $c$;

RESET lock_timeout;
