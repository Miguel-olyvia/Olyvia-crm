-- =============================================================================
-- Catálogo — as FUNÇÕES do ECRÃ DE GESTÃO das CATEGORIAS, SUBCATEGORIAS e MARCAS
-- dos produtos (criar, renomear, ativar/desativar, ordenar; ler com «usados»).
-- Base de RH (uetjghdkwbywbftedtth). Mesmo padrão de 20270117600000 (atributos).
-- =============================================================================
--
-- ORDEM: aplica-se DEPOIS de 20270117100000 (fn_cat_marca, fn_cat_categoria_produto,
-- cat_guardar_produto_tabelas, cat_ler_produtos_tabelas, gatilho trg_cat_produto_tabelas)
-- e de 20270117500000 (fn_cat_limpar_nome, fn_cat_chave_opcao). A guarda recusa se
-- faltarem. Sem tabelas nem colunas novas. Não escreve dados: cria funções, recria duas
-- e muda o search_path de quatro.
--
-- O modelo (lido na RH, só estrutura, 13/11):
--   product_categories  name, slug, path (text sem limite), parent_id (2 níveis: topo e sub),
--                       sort_order, is_active (NULL = ativa), deleted_at, created_by NOT NULL
--                       (anew_users), organization_id (NULL = global). level e
--                       parent_category_id existem mas ninguém os preenche (fn_cat_categoria_produto
--                       também não): ficam como estão. Índice btree em path.
--   brands              name, slug (text; UNIQUE (organization_id, slug) e único entre as
--                       globais), website, is_active, deleted_at, created_by NOT NULL.
--   Os índices btree em path e em (organization_id, slug) não aceitam entradas acima de
--   ~2700 bytes: slug e path gerados com mais de 2000 bytes são recusados (CT002).
--   Junções product_category_organizations / brand_organizations: fn_cat_categoria_produto
--                       e fn_cat_marca NÃO as preenchem (a nike tem 0 linhas nelas). Criar
--                       aqui faz o MESMO: só a linha com organization_id = p_org, sem junção.
--
-- O que depende do NOME (lido em fn_cat_produto_tabelas, fn_cat_caminho_produto e na app):
--   Marca      products.marca_livre = brands.name (o gatilho mantém-nos acertados).
--              Renomear reescreve marca_livre de TODOS os produtos da organização com
--              essa marca (apagados e consumíveis incluídos), na mesma transacção, no
--              máximo 5000 (medido na nike: 754 produtos em 317 ms). O gatilho volta a
--              procurar a marca pelo nome (fn_cat_marca) e encontra a mesma: a função
--              confere-o e recusa se algum produto mudasse de marca.
--   Categoria  os produtos guardam só ids (category_id, subcategory_id): não há texto
--              a reescrever. slug e path NÃO mudam ao renomear (como já fazia
--              rpc_update_product_category). Ao criar, o path segue fn_cat_categoria_produto:
--              topo = slug, sub = lower(nome do pai) || '/' || slug.
--              products.catalogo_categoria_id (ramo da árvore dos SERVIÇOS escolhido pelo
--              nome) NÃO se recalcula: a app junta as árvores pelo nome ao ler e só usa
--              catalogo_categoria_id quando o produto não tem categoria de produto.
--
-- Funções públicas (authenticated e service_role; nunca anon nem PUBLIC):
--   1. cat_ler_categorias_gestao(p_org) → {"categorias":[{id,nome,ordem,ativo,global,usados,
--        subcategorias:[{id,nome,ordem,ativo,global,usados}]}]}
--        products.edit OU services.view. Linhas da organização (não apagadas, ativas e
--        desativadas) e as globais ligadas à organização (junção ou usadas por produtos
--        dela), com "global": true — só leitura. "usados" = produtos VIVOS da organização
--        com tipo_catalogo preenchido (produtos e consumíveis), como cat_ler_produtos_tabelas.
--   2. cat_guardar_categoria_produto(p_org, p_id, p_pai, p_nome) → {"categoria":{…}}
--        p_id NULL: cria (p_pai NULL = topo; p_pai = categoria de TOPO, da organização e
--        ativa = sub; 2 níveis). Senão renomeia; p_pai NULL = não mexe; diferente = CT002.
--        Repetido debaixo do mesmo pai (globais incluídas) = CT004. Teto: 300 categorias e
--        subcategorias ATIVAS (as desativadas não contam) por organização.
--   3. cat_estado_categoria_produto(p_org, p_id, p_ativo) → {"categoria":{…},"subcategorias_desativadas":n}
--        Desativar uma de topo desativa EM CASCATA as subs ativas dela; reativar não as
--        reativa; ativar uma sub com o pai desativado = CT002; ativar acima do teto = CT002.
--   4. cat_reordenar_categorias(p_org, p_pai, p_ids) → {"ok":true,"n":…,"alteradas":…}
--        Exatamente os irmãos vivos da organização debaixo de p_pai (NULL = topo); máx. 300.
--   5. cat_ler_marcas_gestao(p_org) → {"marcas":[{id,nome,website,ativo,usados,global}]}
--   6. cat_guardar_marca(p_org, p_id, p_nome, p_website) → {"marca":{…},"produtos_atualizados":n}
--        Cria (sempre na organização; teto 500 marcas ATIVAS) ou renomeia. p_website: NULL =
--        não mexe (ao criar: sem site), '' = limpa; senão http(s)://anfitrião.dominio…, até
--        300 caracteres, sem espaços, < > " \ nem caracteres de controlo, e sem @ antes da
--        primeira barra (javascript:, data:, https://a@b.com são recusados).
--   7. cat_estado_marca(p_org, p_id, p_ativo) → {"marca":{…}}  (ativar acima do teto = CT002)
--   Escritas (2, 3, 4, 6, 7): products.edit. Uma linha global = CT002 «… partilhada: …».
--   Uma linha que não existe ou é de outra organização = CT003 (a consulta filtra por
--   organização; não se distingue uma da outra).
--   8. cat_guardar_produto_tabelas — RECRIADA a partir da de 20270117100000 (md5 do corpo
--        aplicado conferido na guarda). Mudanças, e só estas:
--        a) search_path = public, pg_temp (era public);
--        b) toma os advisory locks de marcas e de categorias da organização (os mesmos das
--           funções de gestão), ANTES de prender o produto: gravar um produto e
--           renomear/desativar uma marca ou categoria da mesma organização esperam um pelo
--           outro. A ordem (locks, depois o produto) é a de cat_guardar_marca (lock, depois
--           os produtos), para não haver impasse;
--        c) antes do UPDATE: marca, categoria ou subcategoria DESATIVADA e NOVA no produto =
--           CT002 (se já é a do produto, passa); e escolher uma subcategoria nova (incluindo
--           criar uma pelo nome) debaixo de uma categoria desativada = CT002.
--   9. cat_ler_produtos_tabelas — RECRIADA igual à de 20270117100000 (md5 conferido), só
--        com "ativa": boolean em cada linha de "categoriasProduto" (aditivo).
--  10. search_path = public, pg_temp em fn_cat_exigir, fn_cat_pode, fn_cat_marca e
--        fn_cat_categoria_produto (ALTER FUNCTION; os corpos não mudam).
--
-- Nomes: fn_cat_limpar_nome, no máximo 200 caracteres (mais de 1000 recusa-se antes de
-- processar); repetidos com fn_cat_chave_opcao.
-- Erros: CT001 sem permissão; CT002 dados inválidos; CT003 não encontrada; CT004 repetido
-- (DETAIL = id da linha que já tem o nome).
-- Concorrência: pg_advisory_xact_lock por organização (uma chave para categorias, outra para
-- marcas) e FOR NO KEY UPDATE na linha alterada.
--
-- Teste: supabase/tests/catalogo_categorias_marcas_gestao.test.sql (BEGIN … ROLLBACK, nike).
-- ATENÇÃO antes do db push: `supabase db push` aplica TUDO o que estiver pendente;
-- listar com `supabase migration list --linked` imediatamente antes.
-- =============================================================================

-- ─── 0. Guardas ─────────────────────────────────────────────────────────────────
DO $g$
DECLARE v_txt text; v_falta text; v_src text;
BEGIN
  SELECT string_agg(s, ', ') INTO v_falta
  FROM unnest(ARRAY['public.fn_cat_exigir(uuid,text)', 'public.fn_cat_exigir_uma(uuid,text[])', 'public.fn_cat_pode(uuid,text)',
                    'public.fn_cat_limpar_nome(text)', 'public.fn_cat_chave_opcao(text)', 'public.fn_cat_slug(text)',
                    'public.fn_cat_nome(text)', 'public.fn_cat_marca(uuid,text,uuid)', 'public.fn_cat_categoria_produto(uuid,text,uuid,uuid)',
                    'public.fn_cat_unidade(uuid,text)', 'public.fn_cat_unidade_segura(uuid,uuid)', 'public.fn_neg_so_execucao(uuid,text)',
                    'public.cat_guardar_produto_tabelas(uuid,uuid,text,text,text,text)', 'public.cat_ler_produtos_tabelas(uuid)',
                    'public.current_business_user_id()']) s
  WHERE to_regprocedure(s) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam funções (%): aplicar antes 20270117100000 e 20270117500000.', v_falta;
  END IF;

  SELECT string_agg(x.t || '.' || x.c, ', ') INTO v_falta
  FROM (VALUES ('product_categories', 'name'), ('product_categories', 'slug'), ('product_categories', 'path'),
               ('product_categories', 'parent_id'), ('product_categories', 'sort_order'), ('product_categories', 'is_active'),
               ('product_categories', 'created_by'), ('product_categories', 'organization_id'), ('product_categories', 'deleted_at'),
               ('product_category_organizations', 'category_id'), ('product_category_organizations', 'organization_id'),
               ('brands', 'name'), ('brands', 'slug'), ('brands', 'website'), ('brands', 'is_active'), ('brands', 'created_by'),
               ('brands', 'organization_id'), ('brands', 'deleted_at'),
               ('products', 'brand_id'), ('products', 'marca_livre'), ('products', 'category_id'), ('products', 'subcategory_id'),
               ('products', 'tipo_catalogo'), ('products', 'is_deleted'), ('products', 'organization_id')) AS x(t, c)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema = 'public' AND ic.table_name = x.t AND ic.column_name = x.c);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam colunas esperadas: %.', v_falta;
  END IF;

  -- as duas funções recriadas têm de ser as de 20270117100000 (md5 do corpo lido na RH a 13/11), ou já estas
  v_src := (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_produto_tabelas(uuid,uuid,text,text,text,text)')::oid);
  IF md5(v_src) <> '791986bf49d792d967cdcddff067d0bb' AND position('20270117700000' IN v_src) = 0 THEN
    RAISE EXCEPTION 'cat_guardar_produto_tabelas não é a de 20270117100000 (md5 %): rever esta migration antes de a recriar.', md5(v_src);
  END IF;
  v_src := (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_produtos_tabelas(uuid)')::oid);
  IF md5(v_src) <> '1b124f2048158c72788c4930ffefc40e' AND position('20270117700000' IN v_src) = 0 THEN
    RAISE EXCEPTION 'cat_ler_produtos_tabelas não é a de 20270117100000 (md5 %): rever esta migration antes de a recriar.', md5(v_src);
  END IF;

  SELECT string_agg(p.proname::text || '(' || pg_get_function_identity_arguments(p.oid)::text || ')', ', ') INTO v_txt
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND ((p.proname = 'cat_ler_categorias_gestao' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid')
      OR (p.proname = 'cat_guardar_categoria_produto' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_id uuid, p_pai uuid, p_nome text')
      OR (p.proname = 'cat_estado_categoria_produto' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_id uuid, p_ativo boolean')
      OR (p.proname = 'cat_reordenar_categorias' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_pai uuid, p_ids uuid[]')
      OR (p.proname = 'cat_ler_marcas_gestao' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid')
      OR (p.proname = 'cat_guardar_marca' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_id uuid, p_nome text, p_website text')
      OR (p.proname = 'cat_estado_marca' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_id uuid, p_ativo boolean')
      OR (p.proname = 'cat_ler_produtos_tabelas' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid')
      OR (p.proname = 'cat_guardar_produto_tabelas' AND pg_get_function_identity_arguments(p.oid)
            <> 'p_org uuid, p_id uuid, p_marca text, p_unidade text, p_categoria text, p_subcategoria text')
      OR (p.proname IN ('fn_cat_exigir', 'fn_cat_pode') AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_perm text')
      OR (p.proname = 'fn_cat_marca' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_nome text, p_user uuid')
      OR (p.proname = 'fn_cat_categoria_produto' AND pg_get_function_identity_arguments(p.oid) <> 'p_org uuid, p_nome text, p_pai uuid, p_user uuid'));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe outra versão destas funções: %. Rever esta migration.', v_txt;
  END IF;
END $g$;

-- ─── 1. Ler as categorias para gestão ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_ler_categorias_gestao(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
      SELECT c.id, c.name, coalesce(c.sort_order, 0) AS ordem, coalesce(c.is_active, true) AS ativo, (c.organization_id IS NULL) AS global
      FROM product_categories c
      WHERE c.parent_id IS NULL AND c.deleted_at IS NULL
        AND (c.organization_id = p_org
             OR (c.organization_id IS NULL
                 AND (c.id IN (SELECT j.category_id FROM product_category_organizations j WHERE j.organization_id = p_org)
                      OR c.id IN (SELECT u.id FROM uso_cat u))))
    ),
    sub AS (
      SELECT s.id, s.parent_id, s.name, coalesce(s.sort_order, 0) AS ordem, coalesce(s.is_active, true) AS ativo, (s.organization_id IS NULL) AS global
      FROM product_categories s
      WHERE s.parent_id IN (SELECT t.id FROM topo t) AND s.deleted_at IS NULL
        AND (s.organization_id = p_org OR s.organization_id IS NULL)
    )
    SELECT jsonb_build_object('categorias', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', t.id, 'nome', t.name, 'ordem', t.ordem, 'ativo', t.ativo, 'global', t.global,
               'usados', coalesce(uc.n, 0),
               'subcategorias', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', s.id, 'nome', s.name, 'ordem', s.ordem, 'ativo', s.ativo, 'global', s.global,
                          'usados', coalesce(us.n, 0))
                        ORDER BY s.ordem, s.name, s.id)
                 FROM sub s LEFT JOIN uso_sub us ON us.id = s.id
                 WHERE s.parent_id = t.id), '[]'::jsonb))
             ORDER BY t.ordem, t.name, t.id)
      FROM topo t LEFT JOIN uso_cat uc ON uc.id = t.id), '[]'::jsonb))
  );
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_categorias_gestao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_categorias_gestao(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_categorias_gestao(uuid) IS
  'Catálogo (20270117700000): ecrã de gestão das categorias de produto. Categorias de topo e subcategorias da organização (não apagadas, ativas e desativadas) e as globais ligadas a ela ("global": true, só leitura), com quantos produtos e consumíveis vivos usam cada uma. Permissão products.edit ou services.view.';

-- ─── 2. Criar ou renomear uma categoria / subcategoria ──────────────────────────
-- p_id NULL: cria (p_pai NULL = topo; p_pai = categoria de topo da organização = sub). Senão renomeia
-- (p_pai NULL = não mexe; diferente do atual = CT002). slug e path não mudam ao renomear.
CREATE OR REPLACE FUNCTION public.cat_guardar_categoria_produto(p_org uuid, p_id uuid, p_pai uuid, p_nome text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_texto constant integer := 1000;
  c_max_nome constant integer := 200;
  c_max_categorias constant integer := 300;
  c_max_bytes_indice constant integer := 2000;
  c record; v_nome text; v_pai uuid; v_pai_nome text; v_pai_org uuid; v_pai_avo uuid; v_pai_ativo boolean;
  v_ex uuid; v_n integer; v_ordem integer; v_slug text; v_path text; v_id uuid; v_criador uuid;
BEGIN
  IF length(p_nome) > c_max_texto THEN RAISE EXCEPTION 'O nome da categoria é demasiado longo.' USING ERRCODE = 'CT002'; END IF;
  v_nome := public.fn_cat_limpar_nome(p_nome);
  IF v_nome = '' THEN RAISE EXCEPTION 'Escreva o nome da categoria.' USING ERRCODE = 'CT002'; END IF;
  IF length(v_nome) > c_max_nome THEN RAISE EXCEPTION 'O nome da categoria tem no máximo 200 caracteres.' USING ERRCODE = 'CT002'; END IF;

  -- um de cada vez nesta organização (criar, renomear, estado e ordem das categorias; e gravar produtos)
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || p_org::text, 0));

  IF p_id IS NOT NULL THEN
    SELECT pc.id, pc.name, pc.parent_id, pc.organization_id INTO c FROM product_categories pc
    WHERE pc.id = p_id AND pc.deleted_at IS NULL AND (pc.organization_id = p_org OR pc.organization_id IS NULL)
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003'; END IF;
    IF c.organization_id IS NULL THEN
      RAISE EXCEPTION 'Categoria partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
    END IF;
    IF p_pai IS NOT NULL AND p_pai IS DISTINCT FROM c.parent_id THEN
      RAISE EXCEPTION 'Ainda não é possível mudar uma categoria de sítio: crie-a debaixo da categoria certa.' USING ERRCODE = 'CT002';
    END IF;
    v_pai := c.parent_id;
  ELSIF p_pai IS NOT NULL THEN
    SELECT pc.name, pc.organization_id, pc.parent_id, coalesce(pc.is_active, true)
      INTO v_pai_nome, v_pai_org, v_pai_avo, v_pai_ativo
    FROM product_categories pc
    WHERE pc.id = p_pai AND pc.deleted_at IS NULL AND (pc.organization_id = p_org OR pc.organization_id IS NULL)
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003'; END IF;
    IF v_pai_avo IS NOT NULL THEN
      RAISE EXCEPTION 'Uma subcategoria não pode ter subcategorias: escolha uma categoria de topo.' USING ERRCODE = 'CT002';
    END IF;
    IF v_pai_org IS NULL THEN
      RAISE EXCEPTION 'Categoria partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
    END IF;
    IF NOT v_pai_ativo THEN
      RAISE EXCEPTION 'A categoria «%» está desativada: ative-a antes de lhe criar subcategorias.', v_pai_nome USING ERRCODE = 'CT002';
    END IF;
    v_pai := p_pai;
  END IF;

  -- repetido debaixo do mesmo pai (da organização ou global), sem acentos nem maiúsculas
  SELECT pc.id INTO v_ex FROM product_categories pc
  WHERE pc.deleted_at IS NULL AND pc.parent_id IS NOT DISTINCT FROM v_pai AND pc.id IS DISTINCT FROM p_id
    AND (pc.organization_id = p_org OR pc.organization_id IS NULL)
    AND public.fn_cat_chave_opcao(pc.name) = public.fn_cat_chave_opcao(v_nome)
  ORDER BY (pc.organization_id IS NULL), pc.sort_order, pc.id LIMIT 1;
  IF v_ex IS NOT NULL THEN
    RAISE EXCEPTION '%', (CASE WHEN v_pai IS NULL THEN 'Já existe uma categoria com este nome.'
                               ELSE 'Já existe uma subcategoria com este nome nesta categoria.' END)
      USING ERRCODE = 'CT004', DETAIL = v_ex::text;
  END IF;

  IF p_id IS NULL THEN
    -- ─ criar: sempre uma linha da organização, como fn_cat_categoria_produto (sem junção) ─
    -- o teto conta só as ATIVAS (as desativadas não contam)
    SELECT count(*)::integer INTO v_n FROM product_categories pc
    WHERE pc.organization_id = p_org AND pc.deleted_at IS NULL AND coalesce(pc.is_active, true);
    IF v_n >= c_max_categorias THEN
      RAISE EXCEPTION 'Esta organização já tem o máximo de categorias e subcategorias ativas (300).' USING ERRCODE = 'CT002';
    END IF;
    SELECT u.id INTO v_criador FROM anew_users u WHERE u.id = v_user;
    IF v_criador IS NULL THEN
      RAISE EXCEPTION 'Sem utilizador identificado para criar a categoria.' USING ERRCODE = 'CT001';
    END IF;
    v_ordem := coalesce((SELECT max(pc.sort_order) + 1 FROM product_categories pc
                         WHERE pc.parent_id IS NOT DISTINCT FROM v_pai AND pc.organization_id = p_org), 0);
    -- slug e path como fn_cat_categoria_produto: topo = slug; sub = nome do pai em minúsculas / slug
    v_slug := public.fn_cat_slug(v_nome);
    v_path := (CASE WHEN v_pai IS NULL THEN v_slug ELSE lower(v_pai_nome) || '/' || v_slug END);
    IF octet_length(v_slug) > c_max_bytes_indice OR octet_length(v_path) > c_max_bytes_indice THEN
      RAISE EXCEPTION 'O nome (com o da categoria de cima) é demasiado longo para o endereço da categoria.' USING ERRCODE = 'CT002';
    END IF;
    INSERT INTO product_categories (name, slug, path, parent_id, sort_order, is_active, created_by, organization_id)
    VALUES (v_nome, v_slug, v_path, v_pai, v_ordem, true, v_criador, p_org)
    RETURNING id INTO v_id;
  ELSE
    -- ─ renomear: só o nome (os produtos guardam ids; slug e path ficam) ─
    UPDATE product_categories pc SET name = v_nome WHERE pc.id = c.id AND pc.name IS DISTINCT FROM v_nome;
    v_id := c.id;
  END IF;

  RETURN (
    SELECT jsonb_build_object('categoria', jsonb_build_object(
             'id', pc.id, 'nome', pc.name, 'pai', pc.parent_id, 'ordem', coalesce(pc.sort_order, 0),
             'ativo', coalesce(pc.is_active, true), 'global', false,
             'usados', (SELECT count(*)::integer FROM products p
                        WHERE p.organization_id = p_org AND NOT p.is_deleted AND p.tipo_catalogo IS NOT NULL
                          AND (CASE WHEN pc.parent_id IS NULL THEN p.category_id ELSE p.subcategory_id END) = pc.id)))
    FROM product_categories pc WHERE pc.id = v_id);
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_categoria_produto(uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_categoria_produto(uuid,uuid,uuid,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_guardar_categoria_produto(uuid,uuid,uuid,text) IS
  'Catálogo (20270117700000): cria (p_id NULL; p_pai NULL = categoria de topo, p_pai = categoria de topo ativa da organização = subcategoria; 2 níveis; no máximo 300 ativas por organização; sempre na organização) ou renomeia uma categoria de produto (slug e path não mudam; mudar de pai = CT002). Nome repetido debaixo do mesmo pai: CT004 com o id no DETAIL. Permissão products.edit.';

-- ─── 3. Ativar / desativar uma categoria ────────────────────────────────────────
-- Desativar uma de topo desativa em cascata as subs ativas dela; reativar não as reativa.
-- Ativar uma sub com o pai desativado = CT002; ativar acima do teto de ativas = CT002. Os produtos não se tocam.
CREATE OR REPLACE FUNCTION public.cat_estado_categoria_produto(p_org uuid, p_id uuid, p_ativo boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_categorias constant integer := 300;
  c record; v_pai_nome text; v_pai_ativo boolean; v_n integer := 0;
BEGIN
  IF p_ativo IS NULL THEN
    RAISE EXCEPTION 'Diga se a categoria fica ativa ou desativada.' USING ERRCODE = 'CT002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || p_org::text, 0));

  SELECT pc.id, pc.name, pc.parent_id, pc.organization_id, coalesce(pc.is_active, true) AS ativo INTO c FROM product_categories pc
  WHERE pc.id = p_id AND pc.deleted_at IS NULL AND (pc.organization_id = p_org OR pc.organization_id IS NULL)
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003'; END IF;
  IF c.organization_id IS NULL THEN
    RAISE EXCEPTION 'Categoria partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
  END IF;

  IF p_ativo AND NOT c.ativo THEN
    IF c.parent_id IS NOT NULL THEN
      SELECT pp.name, coalesce(pp.is_active, true) INTO v_pai_nome, v_pai_ativo FROM product_categories pp WHERE pp.id = c.parent_id;
      IF NOT coalesce(v_pai_ativo, true) THEN
        RAISE EXCEPTION 'A categoria «%» está desativada: ative-a primeiro.', v_pai_nome USING ERRCODE = 'CT002';
      END IF;
    END IF;
    SELECT count(*)::integer INTO v_n FROM product_categories pc
    WHERE pc.organization_id = p_org AND pc.deleted_at IS NULL AND coalesce(pc.is_active, true);
    IF v_n >= c_max_categorias THEN
      RAISE EXCEPTION 'Esta organização já tem o máximo de categorias e subcategorias ativas (300).' USING ERRCODE = 'CT002';
    END IF;
    v_n := 0;
  END IF;

  UPDATE product_categories pc SET is_active = p_ativo WHERE pc.id = c.id AND pc.is_active IS DISTINCT FROM p_ativo;

  IF c.parent_id IS NULL AND NOT p_ativo THEN
    UPDATE product_categories s SET is_active = false
    WHERE s.parent_id = c.id AND s.organization_id = p_org AND s.deleted_at IS NULL AND coalesce(s.is_active, true);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'categoria', jsonb_build_object('id', c.id, 'nome', c.name, 'pai', c.parent_id, 'ativo', p_ativo, 'global', false),
    'subcategorias_desativadas', v_n);
END $$;
REVOKE ALL ON FUNCTION public.cat_estado_categoria_produto(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_estado_categoria_produto(uuid,uuid,boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_estado_categoria_produto(uuid,uuid,boolean) IS
  'Catálogo (20270117700000): ativa ou desativa uma categoria de produto da organização. Desativar uma categoria de topo desativa em cascata as subcategorias ativas dela; reativar não as reativa; ativar uma subcategoria com o pai desativado, ou acima de 300 ativas, é recusado. Os produtos mantêm a ligação. Permissão products.edit.';

-- ─── 4. Reordenar as categorias de um nível ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_reordenar_categorias(p_org uuid, p_pai uuid, p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_ids constant integer := 300;
  v_pai_org uuid; v_pai_avo uuid; v_n integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RAISE EXCEPTION 'A ordem tem de trazer a lista das categorias.' USING ERRCODE = 'CT002';
  END IF;
  IF cardinality(p_ids) > c_max_ids THEN
    RAISE EXCEPTION 'A ordem tem no máximo 300 categorias.' USING ERRCODE = 'CT002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || p_org::text, 0));

  IF p_pai IS NOT NULL THEN
    SELECT pc.organization_id, pc.parent_id INTO v_pai_org, v_pai_avo FROM product_categories pc
    WHERE pc.id = p_pai AND pc.deleted_at IS NULL AND (pc.organization_id = p_org OR pc.organization_id IS NULL)
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = 'CT003'; END IF;
    IF v_pai_org IS NULL THEN
      RAISE EXCEPTION 'Categoria partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
    END IF;
    IF v_pai_avo IS NOT NULL THEN
      RAISE EXCEPTION 'Uma subcategoria não tem subcategorias para ordenar.' USING ERRCODE = 'CT002';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(p_ids) x WHERE x IS NULL)
     OR (SELECT count(DISTINCT x) FROM unnest(p_ids) x) <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'A ordem tem categorias repetidas ou vazias.' USING ERRCODE = 'CT002';
  END IF;
  -- exatamente os irmãos vivos da organização (ativos e desativados); as globais não entram
  IF EXISTS (SELECT 1 FROM unnest(p_ids) x
             WHERE NOT EXISTS (SELECT 1 FROM product_categories s
                               WHERE s.id = x AND s.parent_id IS NOT DISTINCT FROM p_pai
                                 AND s.organization_id = p_org AND s.deleted_at IS NULL))
     OR EXISTS (SELECT 1 FROM product_categories s
                WHERE s.parent_id IS NOT DISTINCT FROM p_pai AND s.organization_id = p_org AND s.deleted_at IS NULL
                  AND NOT (s.id = ANY (p_ids))) THEN
    RAISE EXCEPTION 'A ordem tem de trazer todas as categorias deste nível, e só essas.' USING ERRCODE = 'CT002';
  END IF;

  UPDATE product_categories s SET sort_order = t.i::integer
  FROM unnest(p_ids) WITH ORDINALITY AS t(id, i)
  WHERE s.id = t.id AND s.organization_id = p_org AND s.sort_order IS DISTINCT FROM t.i::integer;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'n', cardinality(p_ids), 'alteradas', v_n);
END $$;
REVOKE ALL ON FUNCTION public.cat_reordenar_categorias(uuid,uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_reordenar_categorias(uuid,uuid,uuid[]) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_reordenar_categorias(uuid,uuid,uuid[]) IS
  'Catálogo (20270117700000): ordena as categorias de um nível (p_pai NULL = topo; senão as subcategorias de p_pai) pela ordem dos ids (1, 2, …). Tem de trazer exatamente os irmãos vivos da organização, cada um uma vez (máximo 300). Permissão products.edit.';

-- ─── 5. Ler as marcas para gestão ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_ler_marcas_gestao(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN (
    WITH uso AS (
      SELECT p.brand_id AS id, count(*)::integer AS n FROM products p
      WHERE p.organization_id = p_org AND NOT p.is_deleted AND p.tipo_catalogo IS NOT NULL AND p.brand_id IS NOT NULL
      GROUP BY p.brand_id
    )
    SELECT jsonb_build_object('marcas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', b.id, 'nome', b.name, 'website', b.website, 'ativo', coalesce(b.is_active, true),
               'usados', coalesce(u.n, 0), 'global', (b.organization_id IS NULL))
             ORDER BY (b.organization_id IS NULL), lower(b.name), b.id)
      FROM brands b LEFT JOIN uso u ON u.id = b.id
      WHERE b.deleted_at IS NULL AND (b.organization_id = p_org OR b.organization_id IS NULL)), '[]'::jsonb))
  );
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_marcas_gestao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_marcas_gestao(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_ler_marcas_gestao(uuid) IS
  'Catálogo (20270117700000): ecrã de gestão das marcas. Marcas da organização (não apagadas, ativas e desativadas) e as globais ("global": true, só leitura), com quantos produtos e consumíveis vivos usam cada uma. Permissão products.edit ou services.view.';

-- ─── 6. Criar ou renomear uma marca ─────────────────────────────────────────────
-- p_website: NULL = não mexe (ao criar: sem site); '' = limpa; senão http(s)://anfitrião.dominio…, até 300 caracteres.
-- Renomear reescreve products.marca_livre de todos os produtos da organização com esta marca (até 5000).
CREATE OR REPLACE FUNCTION public.cat_guardar_marca(p_org uuid, p_id uuid, p_nome text, p_website text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_texto constant integer := 1000;
  c_max_nome constant integer := 200;
  c_max_website constant integer := 300;
  c_max_marcas constant integer := 500;
  c_max_reescrever constant integer := 5000;
  c_max_bytes_indice constant integer := 2000;
  b record; v_nome text; v_web text; v_ex uuid; v_n integer; v_id uuid; v_criador uuid; v_tent integer := 0;
  v_slug_base text; v_reescritos integer := 0; v_mudaram integer := 0;
BEGIN
  IF length(p_nome) > c_max_texto THEN RAISE EXCEPTION 'O nome da marca é demasiado longo.' USING ERRCODE = 'CT002'; END IF;
  v_nome := public.fn_cat_limpar_nome(p_nome);
  IF v_nome = '' THEN RAISE EXCEPTION 'Escreva o nome da marca.' USING ERRCODE = 'CT002'; END IF;
  IF length(v_nome) > c_max_nome THEN RAISE EXCEPTION 'O nome da marca tem no máximo 200 caracteres.' USING ERRCODE = 'CT002'; END IF;
  IF p_website IS NOT NULL THEN
    IF length(p_website) > c_max_texto THEN RAISE EXCEPTION 'O endereço do site é demasiado longo.' USING ERRCODE = 'CT002'; END IF;
    v_web := nullif(btrim(p_website), '');
    IF v_web IS NOT NULL THEN
      IF length(v_web) > c_max_website THEN
        RAISE EXCEPTION 'O endereço do site tem no máximo 300 caracteres.' USING ERRCODE = 'CT002';
      END IF;
      -- http(s)://anfitrião.dominio[/…]: sem espaços, < > " \ nem controlo em lado nenhum; sem @ antes da primeira barra
      IF v_web !~* '^https?://[^/?#@]+\.[^/?#@]+([/?#].*)?$' OR v_web ~ '[[:space:][:cntrl:]<>"\\]' THEN
        RAISE EXCEPTION 'O site tem de começar por http:// ou https:// e ser um endereço simples (por exemplo https://marca.pt).' USING ERRCODE = 'CT002';
      END IF;
    END IF;
  END IF;

  -- um de cada vez nesta organização (criar, renomear, estado das marcas; e gravar produtos)
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_marcas:' || p_org::text, 0));

  IF p_id IS NOT NULL THEN
    SELECT x.id, x.name, x.website, x.organization_id INTO b FROM brands x
    WHERE x.id = p_id AND x.deleted_at IS NULL AND (x.organization_id = p_org OR x.organization_id IS NULL)
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Marca não encontrada.' USING ERRCODE = 'CT003'; END IF;
    IF b.organization_id IS NULL THEN
      RAISE EXCEPTION 'Marca partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
    END IF;
  END IF;

  -- repetida (da organização ou global), sem acentos nem maiúsculas
  SELECT x.id INTO v_ex FROM brands x
  WHERE x.deleted_at IS NULL AND (x.organization_id = p_org OR x.organization_id IS NULL) AND x.id IS DISTINCT FROM p_id
    AND public.fn_cat_chave_opcao(x.name) = public.fn_cat_chave_opcao(v_nome)
  ORDER BY (x.organization_id IS NULL), x.created_at, x.id LIMIT 1;
  IF v_ex IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe uma marca com este nome.' USING ERRCODE = 'CT004', DETAIL = v_ex::text;
  END IF;

  IF p_id IS NULL THEN
    -- ─ criar: sempre na organização, como fn_cat_marca (slug com sufixo; sem junção); o teto conta só as ATIVAS ─
    SELECT count(*)::integer INTO v_n FROM brands x
    WHERE x.organization_id = p_org AND x.deleted_at IS NULL AND coalesce(x.is_active, true);
    IF v_n >= c_max_marcas THEN
      RAISE EXCEPTION 'Esta organização já tem o máximo de marcas ativas (500).' USING ERRCODE = 'CT002';
    END IF;
    SELECT u.id INTO v_criador FROM anew_users u WHERE u.id = v_user;
    IF v_criador IS NULL THEN
      RAISE EXCEPTION 'Sem utilizador identificado para criar a marca.' USING ERRCODE = 'CT001';
    END IF;
    v_slug_base := public.fn_cat_slug(v_nome);
    IF octet_length(v_slug_base) + 7 > c_max_bytes_indice THEN
      RAISE EXCEPTION 'O nome é demasiado longo para o endereço da marca.' USING ERRCODE = 'CT002';
    END IF;
    LOOP
      BEGIN
        INSERT INTO brands (name, slug, website, created_by, organization_id, is_active)
        VALUES (v_nome, v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6),
                v_web, v_criador, p_org, true)
        RETURNING id INTO v_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- o sufixo aleatório do slug repetiu-se: tenta outro (no máximo 3 vezes)
        v_tent := v_tent + 1;
        IF v_tent >= 3 THEN RAISE; END IF;
      END;
    END LOOP;
  ELSE
    -- ─ renomear (e o site) ─
    IF v_nome IS DISTINCT FROM b.name THEN
      SELECT count(*)::integer INTO v_n FROM products p
      WHERE p.organization_id = p_org AND p.brand_id = b.id AND p.marca_livre IS DISTINCT FROM v_nome;
      IF v_n > c_max_reescrever THEN
        RAISE EXCEPTION 'Esta marca é usada em demasiados produtos para renomear de uma vez.' USING ERRCODE = 'CT002';
      END IF;
    END IF;
    UPDATE brands x SET name = v_nome, website = (CASE WHEN p_website IS NULL THEN x.website ELSE v_web END)
    WHERE x.id = b.id
      AND (x.name, x.website) IS DISTINCT FROM (v_nome, (CASE WHEN p_website IS NULL THEN x.website ELSE v_web END));
    -- o texto dos produtos acompanha; o gatilho trg_cat_produto_tabelas volta a procurar a marca pelo nome
    -- (fn_cat_marca) e tem de encontrar esta mesma: se algum produto mudasse de marca, recusa
    WITH u AS (
      UPDATE products p SET marca_livre = v_nome
      WHERE p.organization_id = p_org AND p.brand_id = b.id AND p.marca_livre IS DISTINCT FROM v_nome
      RETURNING p.brand_id
    )
    SELECT count(*)::integer, (count(*) FILTER (WHERE u.brand_id IS DISTINCT FROM b.id))::integer
      INTO v_reescritos, v_mudaram FROM u;
    IF v_mudaram > 0 THEN
      RAISE EXCEPTION 'Renomear a marca para «%» mudaria a marca de % produto(s): há outra marca com o mesmo nome.', v_nome, v_mudaram
        USING ERRCODE = 'CT002';
    END IF;
    v_id := b.id;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'marca', jsonb_build_object(
        'id', x.id, 'nome', x.name, 'website', x.website, 'ativo', coalesce(x.is_active, true), 'global', false,
        'usados', (SELECT count(*)::integer FROM products p
                   WHERE p.organization_id = p_org AND NOT p.is_deleted AND p.tipo_catalogo IS NOT NULL AND p.brand_id = x.id)),
      'produtos_atualizados', v_reescritos)
    FROM brands x WHERE x.id = v_id);
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_marca(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_marca(uuid,uuid,text,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_guardar_marca(uuid,uuid,text,text) IS
  'Catálogo (20270117700000): cria (p_id NULL; sempre na organização; no máximo 500 ativas) ou renomeia uma marca (e, na mesma transacção, products.marca_livre dos produtos da organização com essa marca; até 5000). Site opcional http(s)://anfitrião.dominio, até 300 caracteres (NULL não mexe, vazio limpa). Nome repetido: CT004 com o id no DETAIL. Permissão products.edit.';

-- ─── 7. Ativar / desativar uma marca ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cat_estado_marca(p_org uuid, p_id uuid, p_ativo boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_marcas constant integer := 500;
  b record; v_n integer;
BEGIN
  IF p_ativo IS NULL THEN
    RAISE EXCEPTION 'Diga se a marca fica ativa ou desativada.' USING ERRCODE = 'CT002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_marcas:' || p_org::text, 0));
  SELECT x.id, x.name, x.website, x.organization_id, coalesce(x.is_active, true) AS ativo INTO b FROM brands x
  WHERE x.id = p_id AND x.deleted_at IS NULL AND (x.organization_id = p_org OR x.organization_id IS NULL)
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marca não encontrada.' USING ERRCODE = 'CT003'; END IF;
  IF b.organization_id IS NULL THEN
    RAISE EXCEPTION 'Marca partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
  END IF;
  IF p_ativo AND NOT b.ativo THEN
    SELECT count(*)::integer INTO v_n FROM brands x
    WHERE x.organization_id = p_org AND x.deleted_at IS NULL AND coalesce(x.is_active, true);
    IF v_n >= c_max_marcas THEN
      RAISE EXCEPTION 'Esta organização já tem o máximo de marcas ativas (500).' USING ERRCODE = 'CT002';
    END IF;
  END IF;
  UPDATE brands x SET is_active = p_ativo WHERE x.id = b.id AND x.is_active IS DISTINCT FROM p_ativo;
  RETURN jsonb_build_object('marca', jsonb_build_object('id', b.id, 'nome', b.name, 'website', b.website, 'ativo', p_ativo, 'global', false));
END $$;
REVOKE ALL ON FUNCTION public.cat_estado_marca(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_estado_marca(uuid,uuid,boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_estado_marca(uuid,uuid,boolean) IS
  'Catálogo (20270117700000): ativa ou desativa uma marca da organização (ativar acima de 500 ativas é recusado). Os produtos mantêm a marca. Permissão products.edit.';

-- ─── 8. Gravar a marca, a unidade e a categoria de um produto — a de 20270117100000 ────
-- Corpo copiado da versão aplicada (md5 conferido na guarda). Diferenças, todas marcadas 20270117700000:
-- search_path com pg_temp; os advisory locks de marcas e categorias da organização antes de prender o produto;
-- e, antes do UPDATE, a recusa das desativadas novas e de subcategoria nova debaixo de categoria desativada.
CREATE OR REPLACE FUNCTION public.cat_guardar_produto_tabelas(p_org uuid, p_id uuid, p_marca text, p_unidade text, p_categoria text, p_subcategoria text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := public.fn_cat_exigir(p_org, 'products.edit'); v_p products%ROWTYPE; v_marca uuid; v_uom uuid; v_cat uuid; v_sub uuid;
BEGIN
  -- 20270117700000: as mesmas chaves das funções de gestão (marcas, depois categorias), antes de prender o produto
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_marcas:' || p_org::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('cat_categorias_produto:' || p_org::text, 0));
  SELECT * INTO v_p FROM products WHERE id = p_id AND organization_id = p_org AND NOT is_deleted FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003'; END IF;
  v_marca := public.fn_cat_marca(p_org, p_marca, v_user);
  v_uom := coalesce(public.fn_cat_unidade(p_org, p_unidade), v_p.uom_id);
  IF v_uom IS DISTINCT FROM v_p.uom_id AND NOT public.fn_cat_unidade_segura(p_id, v_uom) THEN
    IF v_p.uom_id IS NOT NULL THEN
      RAISE EXCEPTION 'Não dá para mudar a unidade de «%»: tem ligações a fornecedores noutra unidade.', v_p.name USING ERRCODE = 'CT002';
    END IF;
    v_uom := NULL;  -- fica só o texto, como antes
  END IF;
  v_cat := public.fn_cat_categoria_produto(p_org, p_categoria, NULL, v_user);
  v_sub := CASE WHEN v_cat IS NULL THEN NULL ELSE public.fn_cat_categoria_produto(p_org, p_subcategoria, v_cat, v_user) END;
  -- 20270117700000: uma marca, categoria ou subcategoria desativada só fica se já for a que o produto tem;
  -- e debaixo de uma categoria desativada não se escolhe (nem se cria) outra subcategoria
  IF v_marca IS DISTINCT FROM v_p.brand_id AND EXISTS (SELECT 1 FROM brands WHERE id = v_marca AND NOT coalesce(is_active, true)) THEN
    RAISE EXCEPTION 'A marca «%» está desativada.', (SELECT name FROM brands WHERE id = v_marca) USING ERRCODE = 'CT002';
  END IF;
  IF v_cat IS DISTINCT FROM v_p.category_id AND EXISTS (SELECT 1 FROM product_categories WHERE id = v_cat AND NOT coalesce(is_active, true)) THEN
    RAISE EXCEPTION 'A categoria «%» está desativada.', (SELECT name FROM product_categories WHERE id = v_cat) USING ERRCODE = 'CT002';
  END IF;
  IF v_sub IS NOT NULL AND v_sub IS DISTINCT FROM v_p.subcategory_id
     AND EXISTS (SELECT 1 FROM product_categories WHERE id = v_cat AND NOT coalesce(is_active, true)) THEN
    RAISE EXCEPTION 'A categoria «%» está desativada: não se lhe pode escolher outra subcategoria.', (SELECT name FROM product_categories WHERE id = v_cat) USING ERRCODE = 'CT002';
  END IF;
  IF v_sub IS DISTINCT FROM v_p.subcategory_id AND EXISTS (SELECT 1 FROM product_categories WHERE id = v_sub AND NOT coalesce(is_active, true)) THEN
    RAISE EXCEPTION 'A subcategoria «%» está desativada.', (SELECT name FROM product_categories WHERE id = v_sub) USING ERRCODE = 'CT002';
  END IF;
  UPDATE products SET brand_id = v_marca, uom_id = v_uom, category_id = v_cat, subcategory_id = v_sub,
    marca_livre = (SELECT name FROM brands WHERE id = v_marca),
    unidade = coalesce((SELECT code FROM uom WHERE id = v_uom), nullif(btrim(p_unidade), ''), unidade),
    updated_at = now()
  WHERE id = p_id;
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.cat_guardar_produto_tabelas(uuid,uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_guardar_produto_tabelas(uuid,uuid,text,text,text,text) TO authenticated, service_role;

-- ─── 9. Ler o Catálogo pelas tabelas — a de 20270117100000 com "ativa" em categoriasProduto ────
-- Corpo copiado da versão aplicada (md5 conferido na guarda); a ÚNICA diferença é a coluna "ativa" (marcada 20270117700000).
CREATE OR REPLACE FUNCTION public.cat_ler_produtos_tabelas(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
                    'uom', u.code, 'category_id', p.category_id, 'subcategory_id', p.subcategory_id))
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
END $$;
REVOKE ALL ON FUNCTION public.cat_ler_produtos_tabelas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_ler_produtos_tabelas(uuid) TO authenticated, service_role;

-- ─── 10. search_path com pg_temp nas funções internas que estas chamam (corpos iguais) ────
ALTER FUNCTION public.fn_cat_exigir(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_cat_pode(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_cat_marca(uuid, text, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_cat_categoria_produto(uuid, text, uuid, uuid) SET search_path = public, pg_temp;

-- ─── 11. Conferir ───────────────────────────────────────────────────────────────
DO $c$
DECLARE
  c_sp constant text := 'search_path=public, pg_temp';
  v_sig text; v_oid oid; p record; v_src text;
BEGIN
  -- as 8 funções que a app chama (7 novas + cat_guardar_produto_tabelas): SECURITY DEFINER, pg_temp, acessos
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_categorias_gestao(uuid)', 'public.cat_guardar_categoria_produto(uuid,uuid,uuid,text)',
                                'public.cat_estado_categoria_produto(uuid,uuid,boolean)', 'public.cat_reordenar_categorias(uuid,uuid,uuid[])',
                                'public.cat_ler_marcas_gestao(uuid)', 'public.cat_guardar_marca(uuid,uuid,text,text)',
                                'public.cat_estado_marca(uuid,uuid,boolean)',
                                'public.cat_guardar_produto_tabelas(uuid,uuid,text,text,text,text)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Conferir: falta a função %.', v_sig; END IF;
    SELECT pr.prosecdef, pr.proconfig, pr.proacl INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
    IF NOT p.prosecdef THEN RAISE EXCEPTION 'Conferir: % não é SECURITY DEFINER.', v_sig; END IF;
    IF p.proconfig IS NULL OR NOT (c_sp = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'Conferir: % sem search_path = public, pg_temp.', v_sig;
    END IF;
    IF p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: % ainda dá EXECUTE a PUBLIC.', v_sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'Conferir: anon pode executar %.', v_sig; END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'Conferir: authenticated não pode executar %.', v_sig; END IF;
  END LOOP;

  -- as quatro internas: search_path com pg_temp
  FOREACH v_sig IN ARRAY ARRAY['public.fn_cat_exigir(uuid,text)', 'public.fn_cat_pode(uuid,text)', 'public.fn_cat_marca(uuid,text,uuid)',
                                'public.fn_cat_categoria_produto(uuid,text,uuid,uuid)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc pr, unnest(pr.proconfig) cfg WHERE pr.oid = to_regprocedure(v_sig)::oid AND cfg = c_sp) THEN
      RAISE EXCEPTION 'Conferir: % sem search_path = public, pg_temp.', v_sig;
    END IF;
  END LOOP;

  -- cat_ler_produtos_tabelas: acessos como estavam (search_path public, sem anon nem PUBLIC) e "ativa"
  v_oid := to_regprocedure('public.cat_ler_produtos_tabelas(uuid)')::oid;
  SELECT pr.prosecdef, pr.proconfig, pr.proacl, pr.prosrc INTO p FROM pg_proc pr WHERE pr.oid = v_oid;
  IF NOT p.prosecdef OR p.proconfig IS NULL OR NOT ('search_path=public' = ANY (p.proconfig))
     OR has_function_privilege('anon', v_oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE')
     OR position('coalesce(c.is_active, true) AS ativa' IN p.prosrc) = 0 THEN
    RAISE EXCEPTION 'Conferir: cat_ler_produtos_tabelas não ficou como esperado (acessos, search_path ou "ativa").';
  END IF;

  IF (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_categorias_gestao(uuid)')::oid) <> 's'
     OR (SELECT pr.provolatile::text FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_ler_marcas_gestao(uuid)')::oid) <> 's' THEN
    RAISE EXCEPTION 'Conferir: as leituras de gestão não são STABLE.';
  END IF;

  -- os tetos estão no corpo (âncoras)
  IF (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_categoria_produto(uuid,uuid,uuid,text)')::oid)
       NOT LIKE '%c_max_categorias constant integer := 300;%c_max_bytes_indice constant integer := 2000;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_categoria_produto(uuid,uuid,uuid,text)')::oid)
       NOT LIKE '%c_max_nome constant integer := 200;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_estado_categoria_produto(uuid,uuid,boolean)')::oid)
       NOT LIKE '%c_max_categorias constant integer := 300;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_marca(uuid,uuid,text,text)')::oid)
       NOT LIKE '%c_max_website constant integer := 300;%c_max_marcas constant integer := 500;%c_max_reescrever constant integer := 5000;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_estado_marca(uuid,uuid,boolean)')::oid)
       NOT LIKE '%c_max_marcas constant integer := 500;%'
     OR (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_reordenar_categorias(uuid,uuid,uuid[])')::oid)
       NOT LIKE '%c_max_ids constant integer := 300;%' THEN
    RAISE EXCEPTION 'Conferir: falta um dos tetos no corpo das funções (300 categorias, 500 marcas, 5000 produtos, 200 caracteres, 300 do site, 2000 bytes).';
  END IF;

  -- cat_guardar_produto_tabelas: os blocos novos estão lá e o resto da de 20270117100000 também
  v_src := (SELECT pr.prosrc FROM pg_proc pr WHERE pr.oid = to_regprocedure('public.cat_guardar_produto_tabelas(uuid,uuid,text,text,text,text)')::oid);
  IF position('20270117700000' IN v_src) = 0
     OR position($q$hashtextextended('cat_marcas:' || p_org::text, 0)$q$ IN v_src) = 0
     OR position($q$hashtextextended('cat_categorias_produto:' || p_org::text, 0)$q$ IN v_src) = 0
     OR position($q$hashtextextended('cat_categorias_produto:' || p_org::text, 0)$q$ IN v_src) > position('FOR UPDATE' IN v_src)
     OR position('v_marca IS DISTINCT FROM v_p.brand_id' IN v_src) = 0
     OR position('não se lhe pode escolher outra subcategoria' IN v_src) = 0
     OR position('v_sub IS DISTINCT FROM v_p.subcategory_id' IN v_src) = 0
     OR position('fn_cat_unidade_segura(p_id, v_uom)' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Conferir: cat_guardar_produto_tabelas não ficou com o corpo esperado.';
  END IF;
  RAISE NOTICE 'catalogo_categorias_marcas_gestao: 7 funções novas, cat_guardar_produto_tabelas e cat_ler_produtos_tabelas recriadas, 4 internas com pg_temp — conferidas.';
END $c$;
