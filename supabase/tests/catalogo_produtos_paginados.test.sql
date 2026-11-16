-- ============================================================
-- Testes: 20270118500000_catalogo_produtos_paginados.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 118500000 (falha no passo 0: não há cat_ler_produtos_pagina nem as outras três);
-- depois do push termina com «OK: …», os tempos medidos e a lista do que foi saltado. Qualquer falha: 'FALHOU: …'.
--
-- SÓ LEITURA, tudo dentro de BEGIN … ROLLBACK. Lê a Mudelar (3242e925-da26-459a-8258-be04d904e355, 14 328 produtos com
-- atributos e modelos) e, da nike (b6ffce4f-f630-4933-833a-008649757a33), só o id de UM produto, para provar que um
-- produto de outra organização dá CT003. Não escreve nada em nenhuma organização. A BM24
-- (872abff2-043f-41e1-99dd-0a8e305ddecb) só aparece como p_org para provar o CT001, se for preciso.
-- Sessões emprestadas (role authenticated, auth.uid() pelas claims), membros activos da Mudelar, não system admin:
--   editor   products.edit e services.view
--   sem      sem products.edit nem services.view (se não houver: o editor contra a BM24, se lá não tiver nenhuma das
--            duas; senão contra uma organização inventada — o caso lido a 16/11)
--   so_edit  products.edit sem services.view (se não houver: saltado) — custo e pvp vêm null
-- Chamadas recusadas de propósito: 8 — CT001 x1, CT002 x5, CT003 x2. Ficam como erro no registo do Postgres.
-- Chamadas ao todo: ≈ 110 (72 páginas de 200 para percorrer a lista inteira; o resto filtros e contagens) e
-- 1 cat_ler_atributos da Mudelar (≈ 8 MB, ≈ 1 s) para comparar.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_produtos_paginados.test.sql
--
-- O que PROVA:
--   1. Paginação: total, paginas, limite, página para lá da última ([] com o total), limite por omissão 50, limite 1;
--      a lista inteira em páginas de 200 sai pela ordem nome, id (md5 igual ao lido como postgres), sem repetidos.
--   2. Filtros: categoria (inclui as subs), subcategoria, modelo, marca (maiúsculas e espaços), sem categoria,
--      pesquisa sem acentos (na pesquisa e, se houver, nos dados) e por SKU, várias palavras (E); cada produto devolvido
--      cumpre o filtro e o total bate com a contagem lida como postgres.
--   3. Contagens: total, cada por_categoria / por_subcategoria / por_modelo = o total da página com esse filtro;
--      sem_referencia, sem_categoria e sem_marca = os lidos como postgres; com pesquisa e marca também.
--   4. Atributos: os de um produto = os de cat_ler_atributos para esse produto; um produto sem valores dá [];
--      as definições = o campo atributos de cat_ler_atributos; o atributos_resumo da página = a linha montada aqui.
--   5. Valores: custo, pvp e fornecedor de um produto = os de cat_v_produto_fornecedor / product_prices; sem
--      services.view vêm null (ve_valores false).
--   6. Recusas: CT001 sem permissão; CT002 limite 0 e 201, página 0, pesquisa com 201 caracteres e com 11 palavras;
--      CT003 produto da nike e id inventado.
--   7. GRANTs, SECURITY DEFINER, STABLE, search_path; internas sem EXECUTE de fora.
--   8. Tempos medidos (página 1, página 280, pesquisa, contagens): cada um abaixo de 500 ms.
--
-- O que NÃO cobre: a ordem com nomes iguais noutra collation; o corte de quem só tem pessoas.view/negocios.* (não
-- entra nestas funções: CT001).
-- ============================================================

BEGIN;

-- ─── 0. A migration está aplicada? ───────────────────────────────────────────
DO $t$
BEGIN
  IF to_regprocedure('public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)') IS NULL
     OR to_regprocedure('public.cat_ler_produtos_contagens(uuid,text,text)') IS NULL
     OR to_regprocedure('public.cat_ler_atributos_produto(uuid,uuid)') IS NULL
     OR to_regprocedure('public.cat_ler_atributos_definicoes(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: não há cat_ler_produtos_pagina / cat_ler_produtos_contagens / cat_ler_atributos_produto / cat_ler_atributos_definicoes (aplicar 20270118500000).';
  END IF;
END $t$;

-- ─── Fixtures (como postgres, só leitura) ─────────────────────────────────────
DO $fx$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_bm24 constant uuid := '872abff2-043f-41e1-99dd-0a8e305ddecb';
  v_auth uuid; v_sem uuid; v_so uuid; r record; v_salt text := '';
  v_cat uuid; v_sub uuid; v_mod uuid; v_marca text; v_prod uuid; v_vazio uuid; v_nike uuid; v_acento text; v_acento_prod uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = c_org) THEN RAISE EXCEPTION 'FALHOU (fixture): a Mudelar não existe nesta base'; END IF;

  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'services.view', c_org)
    AND NOT public.is_system_admin_user(u.auth_user_id)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU (fixture): sem membro activo da Mudelar (não system admin) com products.edit e services.view'; END IF;

  -- sem e so_edit: pela verificação real (perfil, papel do RH ou admin), como as funções a fazem
  FOR r IN SELECT u.auth_user_id
           FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
           WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
             AND NOT public.is_system_admin_user(u.auth_user_id)
           ORDER BY m.created_at, u.id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text, true);
    IF v_sem IS NULL AND NOT public.fn_cat_pode(c_org, 'products.edit') AND NOT public.fn_cat_pode(c_org, 'services.view') THEN
      v_sem := r.auth_user_id;
    END IF;
    IF v_so IS NULL AND public.fn_cat_pode(c_org, 'products.edit') AND NOT public.fn_cat_pode(c_org, 'services.view') THEN
      v_so := r.auth_user_id;
    END IF;
    EXIT WHEN v_sem IS NOT NULL AND v_so IS NOT NULL;
  END LOOP;
  PERFORM set_config('teste.sem_org', c_org::text, true);
  IF v_sem IS NULL THEN
    -- lido a 16/11: todos os membros da Mudelar têm uma das duas, e o editor tem-nas na BM24. Fica o editor contra
    -- uma organização inventada (não é system admin: sem permissão nenhuma lá).
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    IF NOT public.fn_cat_pode(c_bm24, 'products.edit') AND NOT public.fn_cat_pode(c_bm24, 'services.view') THEN
      PERFORM set_config('teste.sem_org', c_bm24::text, true);
      v_salt := v_salt || 'CT001 com o editor contra a BM24 (não há membro da Mudelar sem as duas permissões); ';
    ELSE
      PERFORM set_config('teste.sem_org', gen_random_uuid()::text, true);
      v_salt := v_salt || 'CT001 com o editor contra uma organização inventada (não há membro da Mudelar sem as duas permissões); ';
    END IF;
    v_sem := v_auth;
  END IF;
  IF v_so IS NULL THEN v_salt := v_salt || 'custo/pvp null sem services.view (não há membro só com products.edit); '; END IF;
  PERFORM set_config('request.jwt.claims', '', true);

  -- a subcategoria com mais produtos, a mãe dela, o modelo e a marca com mais produtos
  SELECT p.subcategory_id, s.parent_id INTO v_sub, v_cat FROM products p JOIN product_categories s ON s.id = p.subcategory_id
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
  GROUP BY p.subcategory_id, s.parent_id ORDER BY count(*) DESC, p.subcategory_id LIMIT 1;
  SELECT p.model_id INTO v_mod FROM products p
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND p.model_id IS NOT NULL
  GROUP BY p.model_id ORDER BY count(*) DESC, p.model_id LIMIT 1;
  SELECT coalesce(b.name, p.marca_livre) INTO v_marca FROM products p LEFT JOIN brands b ON b.id = p.brand_id
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND coalesce(b.name, p.marca_livre) IS NOT NULL
  GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1;
  IF v_sub IS NULL OR v_cat IS NULL THEN RAISE EXCEPTION 'FALHOU (fixture): a Mudelar não tem produtos com subcategoria'; END IF;

  -- um produto com valores de atributos e preço de venda (o primeiro por id), e um sem valores
  SELECT p.id INTO v_prod FROM products p
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
    AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id)
    AND EXISTS (SELECT 1 FROM product_prices pp WHERE pp.product_id = p.id AND pp.price_type = 'retail')
  ORDER BY p.id LIMIT 1;
  SELECT p.id INTO v_vazio FROM products p
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
    AND NOT EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id = p.id)
  ORDER BY p.id LIMIT 1;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'FALHOU (fixture): nenhum produto da Mudelar com atributos e PVP'; END IF;
  IF v_vazio IS NULL THEN v_salt := v_salt || 'produto sem valores (todos têm); '; END IF;
  SELECT p.id INTO v_nike FROM products p WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted ORDER BY p.id LIMIT 1;
  IF v_nike IS NULL THEN RAISE EXCEPTION 'FALHOU (fixture): a nike não tem nenhum produto para a prova CT003'; END IF;

  -- uma palavra com acento nos dados (nome, marca ou subcategoria), se houver
  SELECT x.w, x.id INTO v_acento, v_acento_prod FROM (
    SELECT w, p.id FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN product_categories s ON s.id = p.subcategory_id,
         regexp_split_to_table(concat_ws(' ', p.name, coalesce(b.name, p.marca_livre), s.name), '\s+') w
    WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
      AND w <> extensions.unaccent('extensions.unaccent'::regdictionary, w) AND char_length(w) >= 3) x
  ORDER BY x.id LIMIT 1;
  IF v_acento IS NULL THEN v_salt := v_salt || 'acentos nos dados (nenhuma palavra acentuada na Mudelar; provado só na pesquisa); '; END IF;

  -- o esperado, lido como postgres
  PERFORM set_config('teste.esp_total', (SELECT count(*) FROM products p WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted)::text, true);
  PERFORM set_config('teste.esp_md5', (SELECT md5(string_agg(p.id::text, ',' ORDER BY p.name, p.id)) FROM products p
                                      WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted), true);
  PERFORM set_config('teste.esp_cat', (SELECT count(*) FROM products p LEFT JOIN product_categories s ON s.id = p.subcategory_id
                                      WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
                                        AND (p.category_id = v_cat OR s.parent_id = v_cat))::text, true);
  PERFORM set_config('teste.esp_sub', (SELECT count(*) FROM products p WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND p.subcategory_id = v_sub)::text, true);
  PERFORM set_config('teste.esp_mod', (SELECT count(*) FROM products p WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND p.model_id = v_mod)::text, true);
  PERFORM set_config('teste.esp_marca', (SELECT count(*) FROM products p LEFT JOIN brands b ON b.id = p.brand_id
                                        WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
                                          AND lower(btrim(coalesce(b.name, p.marca_livre))) = lower(btrim(v_marca)))::text, true);
  PERFORM set_config('teste.esp_semcat', (SELECT count(*) FROM products p WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
                                         AND p.category_id IS NULL AND p.subcategory_id IS NULL)::text, true);
  PERFORM set_config('teste.esp_semref', (SELECT count(*) FROM products p WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
                                         AND (p.sku IS NULL OR btrim(p.sku) = '' OR p.sku ~ '^CAT-[0-9A-F]{10}$'))::text, true);
  PERFORM set_config('teste.esp_semmarca', (SELECT count(*) FROM products p LEFT JOIN brands b ON b.id = p.brand_id
                                           WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
                                             AND coalesce(btrim(coalesce(b.name, p.marca_livre)), '') = '')::text, true);
  -- «blanco» por ILIKE sobre o texto sem acentos (outra forma de escrever a mesma regra)
  PERFORM set_config('teste.esp_blanco', (SELECT count(*) FROM products p LEFT JOIN brands b ON b.id = p.brand_id
                                          LEFT JOIN product_categories s ON s.id = p.subcategory_id
                                          LEFT JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
                                          WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
                                            AND extensions.unaccent('extensions.unaccent'::regdictionary,
                                                  concat_ws(' ', p.name, p.sku, coalesce(b.name, p.marca_livre), s.name, pm.name)) ILIKE '%blanco%')::text, true);
  -- custo, pvp e fornecedor do produto, pela vista do fornecedor e pelos preços
  PERFORM set_config('teste.esp_custo', coalesce((
    SELECT CASE WHEN f.ligacao <> 'por_ligar' AND f.purchase_price IS NOT NULL THEN f.purchase_price
                ELSE (SELECT coalesce(pp.preco_exato, pp.price) FROM product_prices pp WHERE pp.product_id = v_prod AND pp.price_type = 'purchase'
                      ORDER BY pp.valid_from DESC NULLS LAST LIMIT 1) END::text
    FROM cat_v_produto_fornecedor f WHERE f.product_id = v_prod), ''), true);
  PERFORM set_config('teste.esp_pvp', coalesce((SELECT coalesce(pp.preco_exato, pp.price)::text FROM product_prices pp
                                                WHERE pp.product_id = v_prod AND pp.price_type = 'retail' ORDER BY pp.valid_from DESC NULLS LAST LIMIT 1), ''), true);
  PERFORM set_config('teste.esp_sku', (SELECT p.sku FROM products p WHERE p.id = v_prod), true);

  PERFORM set_config('teste.org', c_org::text, true);
  PERFORM set_config('teste.cat', v_cat::text, true);
  PERFORM set_config('teste.sub', v_sub::text, true);
  PERFORM set_config('teste.mod', coalesce(v_mod::text, ''), true);
  PERFORM set_config('teste.marca', v_marca, true);
  PERFORM set_config('teste.prod', v_prod::text, true);
  PERFORM set_config('teste.vazio', coalesce(v_vazio::text, ''), true);
  PERFORM set_config('teste.nike_prod', v_nike::text, true);
  PERFORM set_config('teste.acento', coalesce(v_acento, ''), true);
  PERFORM set_config('teste.acento_prod', coalesce(v_acento_prod::text, ''), true);
  PERFORM set_config('teste.saltados', v_salt, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_sem', CASE WHEN v_sem IS NULL THEN '' ELSE json_build_object('sub', v_sem, 'role', 'authenticated')::text END, true);
  PERFORM set_config('teste.claims_so', CASE WHEN v_so IS NULL THEN '' ELSE json_build_object('sub', v_so, 'role', 'authenticated')::text END, true);
END $fx$;

-- ─── 1–6. Como editor (role authenticated) ────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  c_max_ms constant integer := 500;
  v_org uuid := current_setting('teste.org')::uuid;
  v_total integer := current_setting('teste.esp_total')::integer;
  v_cat uuid := current_setting('teste.cat')::uuid; v_sub uuid := current_setting('teste.sub')::uuid;
  v_mod uuid := nullif(current_setting('teste.mod'), '')::uuid; v_marca text := current_setting('teste.marca');
  v_prod uuid := current_setting('teste.prod')::uuid; v_vazio uuid := nullif(current_setting('teste.vazio'), '')::uuid;
  r jsonb; c jsonb; a jsonb; e jsonb; x jsonb; v_ids text := ''; v_n integer; v_pag integer; v_ms numeric; v_tempos text := '';
  v_max numeric := 0; v_set uuid[] := '{}'; v_txt text; v_esperado text;
BEGIN
  -- ── 1. Paginação ──
  v_ms := extract(epoch FROM clock_timestamp()) * 1000;
  r := public.cat_ler_produtos_pagina(v_org);
  v_ms := extract(epoch FROM clock_timestamp()) * 1000 - v_ms; v_max := greatest(v_max, v_ms);
  v_tempos := v_tempos || 'página 1 (50) ' || round(v_ms) || ' ms; ';
  IF (r ->> 'total')::integer <> v_total OR (r ->> 'limite')::integer <> 50 OR (r ->> 'pagina')::integer <> 1
     OR (r ->> 'paginas')::integer <> ceil(v_total / 50.0)::integer OR jsonb_array_length(r -> 'produtos') <> least(50, v_total)
     OR (r ->> 've_valores')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: página por omissão: total %, limite %, página %, páginas %, % produtos, ve_valores % (esperado total %)',
      r ->> 'total', r ->> 'limite', r ->> 'pagina', r ->> 'paginas', jsonb_array_length(r -> 'produtos'), r ->> 've_valores', v_total;
  END IF;
  -- as chaves de cada produto
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['id','nome','sku','sku_gerado','marca','categoria_id','categoria','subcategoria_id','subcategoria',
                                        'modelo_id','modelo','modelo_numero','unidade','custo','pvp','fornecedor','ativo','imagem','atributos_resumo']) k
             WHERE NOT (r -> 'produtos' -> 0) ? k) THEN
    RAISE EXCEPTION 'FALHOU: falta uma chave no produto: %', r -> 'produtos' -> 0;
  END IF;

  v_ms := extract(epoch FROM clock_timestamp()) * 1000;
  r := public.cat_ler_produtos_pagina(v_org, p_limite => 50, p_pagina => 280);
  v_ms := extract(epoch FROM clock_timestamp()) * 1000 - v_ms; v_max := greatest(v_max, v_ms);
  v_tempos := v_tempos || 'página 280 (50) ' || round(v_ms) || ' ms; ';
  IF jsonb_array_length(r -> 'produtos') <> greatest(0, least(50, v_total - 279 * 50)) THEN
    RAISE EXCEPTION 'FALHOU: página 280 com % produtos', jsonb_array_length(r -> 'produtos');
  END IF;

  -- a lista inteira em páginas de 200: ordem nome, id, sem repetidos
  v_pag := 1;
  LOOP
    r := public.cat_ler_produtos_pagina(v_org, p_limite => 200, p_pagina => v_pag);
    IF (r ->> 'paginas')::integer <> ceil(v_total / 200.0)::integer THEN RAISE EXCEPTION 'FALHOU: páginas de 200 = %', r ->> 'paginas'; END IF;
    EXIT WHEN jsonb_array_length(r -> 'produtos') = 0;
    SELECT v_ids || string_agg(x2 ->> 'id', ',' ORDER BY o) || ',' INTO v_ids FROM jsonb_array_elements(r -> 'produtos') WITH ORDINALITY AS t(x2, o);
    v_pag := v_pag + 1;
    IF v_pag > 200 THEN RAISE EXCEPTION 'FALHOU: mais de 200 páginas'; END IF;
  END LOOP;
  IF v_pag - 1 <> ceil(v_total / 200.0)::integer THEN RAISE EXCEPTION 'FALHOU: % páginas com produtos (esperado %)', v_pag - 1, ceil(v_total / 200.0); END IF;
  IF md5(rtrim(v_ids, ',')) <> current_setting('teste.esp_md5') THEN
    RAISE EXCEPTION 'FALHOU: a lista inteira por páginas não sai pela ordem nome, id (ou tem repetidos ou faltas)';
  END IF;
  -- para lá da última: [] com o total
  IF jsonb_array_length(r -> 'produtos') <> 0 OR (r ->> 'total')::integer <> v_total THEN RAISE EXCEPTION 'FALHOU: página para lá da última'; END IF;
  -- limite 1 = o primeiro da lista
  r := public.cat_ler_produtos_pagina(v_org, p_limite => 1);
  IF r -> 'produtos' -> 0 ->> 'id' <> split_part(v_ids, ',', 1) OR (r ->> 'paginas')::integer <> v_total THEN
    RAISE EXCEPTION 'FALHOU: limite 1';
  END IF;

  -- ── 2. Filtros ──
  r := public.cat_ler_produtos_pagina(v_org, p_categoria => v_cat, p_limite => 200);
  IF (r ->> 'total')::integer <> current_setting('teste.esp_cat')::integer
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'produtos') p WHERE (p ->> 'categoria_id')::uuid IS DISTINCT FROM v_cat) THEN
    RAISE EXCEPTION 'FALHOU: filtro categoria (com subs): total % (esperado %)', r ->> 'total', current_setting('teste.esp_cat');
  END IF;
  r := public.cat_ler_produtos_pagina(v_org, p_subcategoria => v_sub, p_limite => 200);
  IF (r ->> 'total')::integer <> current_setting('teste.esp_sub')::integer
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'produtos') p WHERE (p ->> 'subcategoria_id')::uuid IS DISTINCT FROM v_sub) THEN
    RAISE EXCEPTION 'FALHOU: filtro subcategoria: total % (esperado %)', r ->> 'total', current_setting('teste.esp_sub');
  END IF;
  IF v_mod IS NOT NULL THEN
    r := public.cat_ler_produtos_pagina(v_org, p_modelo => v_mod, p_limite => 200);
    IF (r ->> 'total')::integer <> current_setting('teste.esp_mod')::integer
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'produtos') p WHERE (p ->> 'modelo_id')::uuid IS DISTINCT FROM v_mod
                                                                             OR p ->> 'modelo' IS NULL OR p ->> 'modelo_numero' IS NULL) THEN
      RAISE EXCEPTION 'FALHOU: filtro modelo: total % (esperado %)', r ->> 'total', current_setting('teste.esp_mod');
    END IF;
  END IF;
  r := public.cat_ler_produtos_pagina(v_org, p_marca => '  ' || upper(v_marca) || ' ', p_limite => 200);
  IF (r ->> 'total')::integer <> current_setting('teste.esp_marca')::integer
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'produtos') p WHERE lower(btrim(p ->> 'marca')) IS DISTINCT FROM lower(btrim(v_marca))) THEN
    RAISE EXCEPTION 'FALHOU: filtro marca (maiúsculas e espaços): total % (esperado %)', r ->> 'total', current_setting('teste.esp_marca');
  END IF;
  r := public.cat_ler_produtos_pagina(v_org, p_sem_categoria => true, p_limite => 200);
  IF (r ->> 'total')::integer <> current_setting('teste.esp_semcat')::integer
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'produtos') p WHERE p ->> 'categoria_id' IS NOT NULL OR p ->> 'subcategoria_id' IS NOT NULL) THEN
    RAISE EXCEPTION 'FALHOU: sem categoria: total % (esperado %)', r ->> 'total', current_setting('teste.esp_semcat');
  END IF;
  -- filtros juntos (E): categoria e subcategoria e marca
  r := public.cat_ler_produtos_pagina(v_org, p_categoria => v_cat, p_subcategoria => v_sub, p_marca => v_marca, p_limite => 1);
  IF (r ->> 'total')::integer > least(current_setting('teste.esp_sub')::integer, current_setting('teste.esp_marca')::integer) THEN
    RAISE EXCEPTION 'FALHOU: filtros juntos não restringem (total %)', r ->> 'total';
  END IF;

  -- pesquisa: sem acentos nem maiúsculas na pesquisa
  v_ms := extract(epoch FROM clock_timestamp()) * 1000;
  r := public.cat_ler_produtos_pagina(v_org, p_q => 'blanco');
  v_ms := extract(epoch FROM clock_timestamp()) * 1000 - v_ms; v_max := greatest(v_max, v_ms);
  v_tempos := v_tempos || 'pesquisa «blanco» ' || round(v_ms) || ' ms; ';
  IF (r ->> 'total')::integer <> current_setting('teste.esp_blanco')::integer THEN
    RAISE EXCEPTION 'FALHOU: pesquisa «blanco»: total % (esperado %)', r ->> 'total', current_setting('teste.esp_blanco');
  END IF;
  c := public.cat_ler_produtos_pagina(v_org, p_q => '  BLÁNCO ');
  IF (c ->> 'total')::integer <> (r ->> 'total')::integer THEN RAISE EXCEPTION 'FALHOU: «BLÁNCO» ≠ «blanco» (% vs %)', c ->> 'total', r ->> 'total'; END IF;
  -- várias palavras: E (nunca mais do que só uma delas)
  c := public.cat_ler_produtos_pagina(v_org, p_q => 'blanco ' || lower(v_marca));
  IF (c ->> 'total')::integer > (r ->> 'total')::integer THEN RAISE EXCEPTION 'FALHOU: duas palavras deram mais do que uma'; END IF;
  -- acentos nos dados: a palavra sem acento encontra o produto
  IF current_setting('teste.acento') <> '' THEN
    c := public.cat_ler_produtos_pagina(v_org, p_q => extensions.unaccent('extensions.unaccent'::regdictionary, current_setting('teste.acento')), p_limite => 200);
    v_n := (c ->> 'total')::integer;
    IF v_n = 0 THEN RAISE EXCEPTION 'FALHOU: «%» sem acento não encontra nada', current_setting('teste.acento'); END IF;
  END IF;
  -- por SKU: o produto aparece
  c := public.cat_ler_produtos_pagina(v_org, p_q => current_setting('teste.esp_sku'), p_limite => 200);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c -> 'produtos') p WHERE (p ->> 'id')::uuid = v_prod) THEN
    RAISE EXCEPTION 'FALHOU: a pesquisa pelo SKU % não devolve o produto', current_setting('teste.esp_sku');
  END IF;
  x := (SELECT p FROM jsonb_array_elements(c -> 'produtos') p WHERE (p ->> 'id')::uuid = v_prod);

  -- ── 3. Contagens ──
  v_ms := extract(epoch FROM clock_timestamp()) * 1000;
  c := public.cat_ler_produtos_contagens(v_org);
  v_ms := extract(epoch FROM clock_timestamp()) * 1000 - v_ms; v_max := greatest(v_max, v_ms);
  v_tempos := v_tempos || 'contagens ' || round(v_ms) || ' ms; ';
  IF (c ->> 'total')::integer <> v_total
     OR (c ->> 'sem_referencia')::integer <> current_setting('teste.esp_semref')::integer
     OR (c ->> 'sem_categoria')::integer <> current_setting('teste.esp_semcat')::integer
     OR (c ->> 'sem_marca')::integer <> current_setting('teste.esp_semmarca')::integer THEN
    RAISE EXCEPTION 'FALHOU: contagens: %', c - 'por_categoria' - 'por_subcategoria' - 'por_modelo';
  END IF;
  FOR e IN SELECT z FROM jsonb_array_elements(c -> 'por_categoria') z LOOP
    IF (public.cat_ler_produtos_pagina(v_org, p_categoria => (e ->> 'id')::uuid, p_limite => 1) ->> 'total')::integer <> (e ->> 'n')::integer THEN
      RAISE EXCEPTION 'FALHOU: por_categoria % ≠ total da página', e;
    END IF;
  END LOOP;
  FOR e IN SELECT z FROM jsonb_array_elements(c -> 'por_subcategoria') z LOOP
    IF (public.cat_ler_produtos_pagina(v_org, p_subcategoria => (e ->> 'id')::uuid, p_limite => 1) ->> 'total')::integer <> (e ->> 'n')::integer THEN
      RAISE EXCEPTION 'FALHOU: por_subcategoria % ≠ total da página', e;
    END IF;
  END LOOP;
  FOR e IN SELECT z FROM jsonb_array_elements(c -> 'por_modelo') z LOOP
    IF (public.cat_ler_produtos_pagina(v_org, p_modelo => (e ->> 'id')::uuid, p_limite => 1) ->> 'total')::integer <> (e ->> 'n')::integer THEN
      RAISE EXCEPTION 'FALHOU: por_modelo % ≠ total da página', e;
    END IF;
  END LOOP;
  IF (SELECT coalesce(sum((z ->> 'n')::integer), 0) FROM jsonb_array_elements(c -> 'por_subcategoria') z) + (c ->> 'sem_categoria')::integer > v_total
     OR (SELECT coalesce(sum((z ->> 'n')::integer), 0) FROM jsonb_array_elements(c -> 'por_modelo') z) > v_total THEN
    RAISE EXCEPTION 'FALHOU: as contagens por subcategoria ou modelo somam mais do que o total';
  END IF;
  -- com pesquisa e marca: o mesmo total da página
  c := public.cat_ler_produtos_contagens(v_org, 'Blanco', v_marca);
  IF (c ->> 'total')::integer <> (public.cat_ler_produtos_pagina(v_org, p_q => 'Blanco', p_marca => v_marca, p_limite => 1) ->> 'total')::integer THEN
    RAISE EXCEPTION 'FALHOU: contagens com pesquisa e marca ≠ total da página';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(c -> 'por_subcategoria') z
             WHERE (public.cat_ler_produtos_pagina(v_org, p_q => 'Blanco', p_marca => v_marca, p_subcategoria => (z ->> 'id')::uuid, p_limite => 1) ->> 'total')::integer
                   <> (z ->> 'n')::integer) THEN
    RAISE EXCEPTION 'FALHOU: por_subcategoria com pesquisa e marca ≠ total da página';
  END IF;

  -- ── 4. Atributos ──
  a := public.cat_ler_atributos(v_org);
  IF public.cat_ler_atributos_definicoes(v_org) -> 'atributos' IS DISTINCT FROM a -> 'atributos' THEN
    RAISE EXCEPTION 'FALHOU: cat_ler_atributos_definicoes ≠ cat_ler_atributos.atributos';
  END IF;
  e := (SELECT z -> 'valores' FROM jsonb_array_elements(a -> 'produtos') z WHERE (z ->> 'id')::uuid = v_prod);
  IF e IS NULL OR jsonb_array_length(e) = 0 THEN RAISE EXCEPTION 'FALHOU (fixture): cat_ler_atributos sem valores para o produto'; END IF;
  IF public.cat_ler_atributos_produto(v_org, v_prod) -> 'valores' IS DISTINCT FROM e THEN
    RAISE EXCEPTION 'FALHOU: cat_ler_atributos_produto ≠ cat_ler_atributos para o produto: % vs %', public.cat_ler_atributos_produto(v_org, v_prod) -> 'valores', e;
  END IF;
  IF v_vazio IS NOT NULL AND public.cat_ler_atributos_produto(v_org, v_vazio) IS DISTINCT FROM '{"valores": []}'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: produto sem valores não deu {valores: []}';
  END IF;
  -- o resumo da página = a linha de resumoAtributos montada aqui a partir de cat_ler_atributos (pela ordem do atributo, estável)
  SELECT string_agg(d ->> 'nome' || ': ' || t.txt, ' · ' ORDER BY (d ->> 'ordem')::integer, t.o) INTO v_esperado
  FROM (
    SELECT o, v2, CASE WHEN v2 -> 'medida' IS NOT NULL AND jsonb_typeof(v2 -> 'medida') = 'object' THEN
                 replace(trim_scale((v2 -> 'medida' ->> 'largura')::numeric)::text, '.', ',') || '×'
                 || replace(trim_scale((v2 -> 'medida' ->> 'comprimento')::numeric)::text, '.', ',')
                 || CASE WHEN v2 -> 'medida' ->> 'tipo' = '3D' AND jsonb_typeof(v2 -> 'medida' -> 'espessura') = 'number'
                         THEN '×' || replace(trim_scale((v2 -> 'medida' ->> 'espessura')::numeric)::text, '.', ',') ELSE '' END
                 || ' ' || (v2 -> 'medida' ->> 'unidade')
               ELSE coalesce((SELECT coalesce(nullif(op ->> 'nome', ''), op ->> 'valor')
                              FROM jsonb_array_elements(a -> 'atributos') dd, jsonb_array_elements(dd -> 'opcoes') op
                              WHERE dd ->> 'id' = v2 ->> 'atributo' AND op ->> 'id' = v2 ->> 'opcao'), v2 ->> 'valor') END AS txt
    FROM jsonb_array_elements(e) WITH ORDINALITY AS q(v2, o)) t
  JOIN LATERAL (SELECT dd FROM jsonb_array_elements(a -> 'atributos') dd WHERE dd ->> 'id' = t.v2 ->> 'atributo') dx(d) ON true
  WHERE coalesce(t.txt, '') <> '';
  IF x ->> 'atributos_resumo' IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'FALHOU: atributos_resumo «%» ≠ «%»', x ->> 'atributos_resumo', v_esperado;
  END IF;

  -- ── 5. Valores ──
  IF (x ->> 'custo')::numeric IS DISTINCT FROM nullif(current_setting('teste.esp_custo'), '')::numeric
     OR (x ->> 'pvp')::numeric IS DISTINCT FROM (CASE WHEN nullif(current_setting('teste.esp_pvp'), '')::numeric > 0 THEN current_setting('teste.esp_pvp')::numeric END) THEN
    RAISE EXCEPTION 'FALHOU: custo % / pvp % (esperado % / %)', x ->> 'custo', x ->> 'pvp', current_setting('teste.esp_custo'), current_setting('teste.esp_pvp');
  END IF;

  -- ── 6. Recusas ──
  BEGIN PERFORM public.cat_ler_produtos_pagina(v_org, p_limite => 0); RAISE EXCEPTION 'FALHOU: limite 0 passou';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ler_produtos_pagina(v_org, p_limite => 201); RAISE EXCEPTION 'FALHOU: limite 201 passou';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ler_produtos_pagina(v_org, p_pagina => 0); RAISE EXCEPTION 'FALHOU: página 0 passou';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ler_produtos_pagina(v_org, p_q => repeat('a', 201)); RAISE EXCEPTION 'FALHOU: pesquisa de 201 caracteres passou';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ler_produtos_contagens(v_org, 'a b c d e f g h i j k'); RAISE EXCEPTION 'FALHOU: pesquisa de 11 palavras passou';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_ler_atributos_produto(v_org, current_setting('teste.nike_prod')::uuid); RAISE EXCEPTION 'FALHOU: produto da nike passou na Mudelar';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;
  BEGIN PERFORM public.cat_ler_atributos_produto(v_org, gen_random_uuid()); RAISE EXCEPTION 'FALHOU: produto inventado passou';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;

  IF v_max > c_max_ms THEN RAISE EXCEPTION 'FALHOU: uma chamada levou % ms (máximo %): %', round(v_max), c_max_ms, v_tempos; END IF;
  PERFORM set_config('teste.tempos', v_tempos, true);
END $t$;

-- ─── 6b. CT001 sem permissão; e sem services.view, custo e pvp null ───────────
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid; r jsonb;
BEGIN
  IF current_setting('teste.claims_sem') <> '' THEN
    PERFORM set_config('request.jwt.claims', current_setting('teste.claims_sem'), true);
    BEGIN PERFORM public.cat_ler_produtos_pagina(current_setting('teste.sem_org')::uuid); RAISE EXCEPTION 'FALHOU: sem permissão leu a página';
    EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
  END IF;
  IF current_setting('teste.claims_so') <> '' THEN
    PERFORM set_config('request.jwt.claims', current_setting('teste.claims_so'), true);
    r := public.cat_ler_produtos_pagina(v_org, p_limite => 200);
    IF (r ->> 've_valores')::boolean IS NOT FALSE
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'produtos') p WHERE p ->> 'custo' IS NOT NULL OR p ->> 'pvp' IS NOT NULL) THEN
      RAISE EXCEPTION 'FALHOU: sem services.view vieram custos ou PVP';
    END IF;
  END IF;
  PERFORM set_config('request.jwt.claims', current_setting('teste.claims'), true);
END $t$;

-- ─── 7. Acessos (como postgres) ──────────────────────────────────────────────
RESET ROLE;
DO $t$
DECLARE v_sig text; v_oid oid; p record;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_produtos_pagina(uuid,text,uuid,uuid,uuid,text,boolean,integer,integer)',
                                'public.cat_ler_produtos_contagens(uuid,text,text)',
                                'public.cat_ler_atributos_produto(uuid,uuid)', 'public.cat_ler_atributos_definicoes(uuid)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    SELECT pr.prosecdef, pr.proconfig, pr.provolatile::text AS vol INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
    IF NOT p.prosecdef OR p.vol <> 's' OR p.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'FALHOU: % não é SECURITY DEFINER STABLE com search_path = public, pg_temp', v_sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_proc pr, aclexplode(pr.proacl) x WHERE pr.oid = v_oid AND x.grantee = 0 AND x.privilege_type::text = 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHOU: acessos de % (anon ou PUBLIC executam, ou authenticated não)', v_sig;
    END IF;
  END LOOP;
  FOREACH v_sig IN ARRAY ARRAY['public.fn_cat_termos_pesquisa(text)', 'public.fn_cat_medida_texto(jsonb)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'FALHOU: falta a função %', v_sig; END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHOU: % pode ser executada de fora', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc pr, unnest(pr.proconfig) cfg WHERE pr.oid = v_oid AND cfg = 'search_path=public, pg_temp') THEN
      RAISE EXCEPTION 'FALHOU: % sem search_path = public, pg_temp', v_sig;
    END IF;
  END LOOP;
END $t$;

SELECT 'OK: paginação (total, páginas, por omissão 50, limite 1, para lá da última, a lista inteira em páginas de 200 pela ordem nome, id sem repetidos), filtros (categoria com subs, subcategoria, modelo, marca com maiúsculas e espaços, sem categoria, juntos), pesquisa (sem acentos, maiúsculas, várias palavras, SKU), contagens (= totais da página, também com pesquisa e marca), atributos (= cat_ler_atributos, produto sem valores, definições, resumo), custo e PVP, recusas (CT001, CT002 x5, CT003 x2), acessos e search_path. Tempos: '
       || current_setting('teste.tempos', true)
       || ' Saltado: ' || coalesce(nullif(current_setting('teste.saltados', true), ''), 'nada') AS resultado;

ROLLBACK;
