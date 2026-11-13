-- ============================================================
-- Testes: 20270117700000_catalogo_categorias_marcas_gestao.sql (base RH)
-- ============================================================
-- ORDEM: depende de 20270117100000 e 20270117500000 (já aplicadas). Correr ANTES do db push da 700000
-- (falha no passo 0, «função cat_ler_categorias_gestao não existe»); depois do push termina com «OK: …».
-- Qualquer falha rebenta com 'FALHOU: …'.
--
-- Tudo dentro de BEGIN … ROLLBACK. Escritas na nike (b6ffce4f-f630-4933-833a-008649757a33): categorias, subcategorias e
-- marcas de teste (pelas funções), uma categoria GLOBAL (organization_id nulo) ligada à nike pela junção com uma sub
-- global, uma marca GLOBAL, cinco produtos da nike com a categoria ou a marca de teste (dois produtos vivos, um
-- consumível vivo, um apagado — usa um já apagado ou marca um como apagado — e um quarto produto para gravar pelas
-- tabelas), e, para os tetos, linhas a mais até 299 categorias e 499 marcas ATIVAS mais 10 desativadas de cada.
-- Nenhuma outra organização é escrita nem criada. A BM24 (872abff2-043f-41e1-99dd-0a8e305ddecb) só aparece como p_org
-- para provar a recusa CT001 (sem escrita nem leitura de dados dela).
-- Sessões emprestadas (role authenticated, auth.uid() pelas claims), membros activos da nike, não system admin:
--   editor   products.edit e services.view, fora da BM24 e sem permissões lá (confirmado por fn_cat_pode)
--   sem      sem products.edit (confirmado por fn_cat_pode)
--   reduzido perfil reduzido de Negócios: sem services.view nem products.edit (confirmado por fn_cat_pode)
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_categorias_marcas_gestao.test.sql
-- Chamadas recusadas de propósito: cerca de 60 (ficam como erro no registo do Postgres).
--
-- O que PROVA (uma prova por suspeita):
--   1. Criar categoria (nome limpo, slug, path, organização, sem junção) e subcategorias (path = nome do pai / slug)
--   2. Repetidos → CT004 com o id no DETAIL (topo; sub no mesmo pai; contra a global); o mesmo nome noutro pai passa
--   3. Sub de sub → CT002; pai inexistente → CT003; nome vazio / >200 / >1000 → CT002; path gerado > 2000 bytes → CT002
--   4. «usados» conta produtos e consumíveis vivos (não o apagado); a global aparece com "global": true e a sub global
--   5. Renomear: slug e path ficam, produtos mantêm a ligação, cat_ler_produtos_tabelas mostra o nome novo;
--      mudar de pai → CT002; global → CT002
--   6. Estados: sub; topo em cascata (2 subs); criar sub em pai desativado → CT002; ativar sub com pai desativado → CT002;
--      reativar o topo não reativa as subs; global → CT002
--   7. Reordenar subs e topo; incompleto / com id de fora → CT002
--   8. Marcas: criar com site; repetida (acentos/maiúsculas; global) → CT004; sites recusados (ftp:, javascript:, data:,
--      https://a@b.com, barra invertida, < >, espaço, >300); «usados» com consumível; renomear reescreve marca_livre
--      de 4 produtos (apagado e consumível incluídos) sem mudar brand_id; site NULL não mexe, '' limpa; global → CT002
--   9. cat_guardar_produto_tabelas: marca / categoria / subcategoria desativada NOVA → CT002; já do produto → passa
--      (incluindo a categoria desativada); subcategoria nova (criada pelo nome) debaixo de categoria desativada → CT002
--      e a sub não fica criada; "ativa" em categoriasProduto de cat_ler_produtos_tabelas
--  10. Sem products.edit → CT001 nas 5 escritas; perfil reduzido nas 2 leituras → CT001; BM24 e organização inventada
--      → CT001; id inventado (gen_random_uuid) → CT003 em guardar, estado e reordenar (categoria e marca)
--  11. Tetos: contam só as ATIVAS — com 299 ativas + 10 desativadas cria-se a 300.ª, a 301.ª é CT002, e ativar uma
--      desativada é CT002 (300 categorias; o mesmo com 500 marcas)
--  12. search_path = public, pg_temp nas 8 funções e nas 4 internas; cat_ler_produtos_tabelas ficou com public;
--      anon e PUBLIC sem EXECUTE
--
-- O que NÃO cobre: a corrida (desativar uma marca/categoria enquanto outra sessão grava um produto, e os advisory locks
-- que a evitam) — precisa de duas sessões; o ramo v_mudaram de cat_guardar_marca (renomear que mudaria a marca de
-- produtos) — inalcançável enquanto o CT004 impede nomes repetidos; o teto de 5000 produtos ao renomear; a repetição
-- do sufixo aleatório do slug da marca; o slug de marca > 2000 bytes (o nome está limitado a 200 caracteres).
-- Não coberto: nome de marca/categoria só existente noutra organização (provar que cat_guardar_produto_tabelas não o
-- liga exigiria escrever noutra organização); e um id REAL de outra organização → CT003 (só se prova com ids inventados;
-- a consulta filtra por organização da mesma forma).
-- ============================================================

BEGIN;

-- ─── 0. A migration está aplicada? ───────────────────────────────────────────
DO $t$
BEGIN
  IF to_regprocedure('public.cat_ler_categorias_gestao(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: função cat_ler_categorias_gestao não existe (aplicar 20270117700000_catalogo_categorias_marcas_gestao.sql).';
  END IF;
END $t$;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  c_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_bm24 constant uuid := '872abff2-043f-41e1-99dd-0a8e305ddecb';
  v_auth uuid; v_act uuid; v_sem uuid; v_red uuid; v_p1 uuid; v_p2 uuid; v_p4 uuid; v_cons uuid; v_apag uuid; r record;
  v_p4_marca text; v_p4_cat text; v_p4_sub text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = c_org) THEN RAISE EXCEPTION 'FALHOU: a nike não existe nesta base'; END IF;
  PERFORM set_config('app.audit_source', 'teste:catalogo_categorias_marcas_gestao', true);

  SELECT u.auth_user_id, u.id INTO v_auth, v_act
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'services.view', c_org)
    AND NOT public.is_system_admin_user(u.auth_user_id)
    AND NOT EXISTS (SELECT 1 FROM anew_memberships mb WHERE mb.user_id = u.id AND mb.organization_id = c_bm24 AND mb.status = 'active')
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: sem membro activo da nike (não system admin, fora da BM24) com products.edit e services.view'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  IF public.fn_cat_pode(c_bm24, 'products.edit') OR public.fn_cat_pode(c_bm24, 'services.view') THEN
    RAISE EXCEPTION 'FALHOU: o editor emprestado tem permissões na BM24; escolher outra organização para a prova de isolamento';
  END IF;

  FOR r IN SELECT u.auth_user_id
           FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
           WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
             AND NOT public.is_system_admin_user(u.auth_user_id)
           ORDER BY m.created_at, u.id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text, true);
    IF v_sem IS NULL AND NOT public.fn_cat_pode(c_org, 'products.edit') THEN v_sem := r.auth_user_id; END IF;
    IF v_red IS NULL AND NOT public.fn_cat_pode(c_org, 'services.view') AND NOT public.fn_cat_pode(c_org, 'products.edit')
       AND (public.fn_cat_pode(c_org, 'pessoas.view')
            OR EXISTS (SELECT 1 FROM anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(c_org, ap.code))) THEN
      v_red := r.auth_user_id;
    END IF;
    EXIT WHEN v_sem IS NOT NULL AND v_red IS NOT NULL;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_sem IS NULL THEN RAISE EXCEPTION 'FALHOU: sem membro activo da nike sem products.edit'; END IF;
  IF v_red IS NULL THEN RAISE EXCEPTION 'FALHOU: sem membro activo da nike no perfil reduzido de Negócios'; END IF;

  -- produtos da nike: dois vivos (p1, p2), um consumível vivo, um apagado e um quarto vivo com marca, categoria e sub (p4)
  SELECT p.id INTO v_p1 FROM products p
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted ORDER BY p.created_at, p.id LIMIT 1;
  SELECT p.id INTO v_p2 FROM products p
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND p.id <> v_p1 ORDER BY p.created_at, p.id LIMIT 1;
  SELECT p.id INTO v_cons FROM products p
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'consumivel' AND NOT p.is_deleted ORDER BY p.created_at, p.id LIMIT 1;
  SELECT p.id, b.name, c.name, s.name INTO v_p4, v_p4_marca, v_p4_cat, v_p4_sub FROM products p
  JOIN brands b ON b.id = p.brand_id JOIN product_categories c ON c.id = p.category_id JOIN product_categories s ON s.id = p.subcategory_id
  WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND p.id NOT IN (v_p1, v_p2)
    AND coalesce(b.is_active, true) AND coalesce(c.is_active, true) AND coalesce(s.is_active, true) AND s.parent_id = c.id
  ORDER BY p.created_at, p.id LIMIT 1;
  SELECT p.id INTO v_apag FROM products p WHERE p.organization_id = c_org AND p.is_deleted ORDER BY p.created_at, p.id LIMIT 1;
  IF v_apag IS NULL THEN
    SELECT p.id INTO v_apag FROM products p
    WHERE p.organization_id = c_org AND NOT p.is_deleted AND p.id NOT IN (v_p1, v_p2, v_p4, v_cons) ORDER BY p.created_at, p.id LIMIT 1;
    UPDATE products SET is_deleted = true WHERE id = v_apag AND organization_id = c_org;
  END IF;
  IF v_p1 IS NULL OR v_p2 IS NULL OR v_p4 IS NULL OR v_cons IS NULL OR v_apag IS NULL THEN
    RAISE EXCEPTION 'FALHOU: a nike não tem os cinco produtos para o teste';
  END IF;

  -- uma categoria GLOBAL ligada à nike (junção) com uma sub global, e uma marca GLOBAL
  INSERT INTO product_categories (id, name, slug, path, parent_id, sort_order, is_active, created_by, organization_id)
  VALUES ('2027c700-0000-4000-8000-000000000001', 'Teste Global Cat 2027 G', 'teste-global-cat-2027-g', 'teste-global-cat-2027-g', NULL, 0, true, v_act, NULL);
  INSERT INTO product_categories (id, name, slug, path, parent_id, sort_order, is_active, created_by, organization_id)
  VALUES ('2027c700-0000-4000-8000-000000000002', 'Teste Global Sub 2027 G', 'teste-global-sub-2027-g', 'teste global cat 2027 g/teste-global-sub-2027-g',
          '2027c700-0000-4000-8000-000000000001', 0, true, v_act, NULL);
  INSERT INTO product_category_organizations (category_id, organization_id, created_by)
  VALUES ('2027c700-0000-4000-8000-000000000001', c_org, v_act);
  INSERT INTO brands (id, name, slug, created_by, organization_id, is_active)
  VALUES ('2027c700-0000-4000-8000-000000000011', 'Teste Global Marca 2027 G', 'teste-global-marca-2027-g', v_act, NULL, true);
  -- uma categoria de topo da nike com um nome de 2000 bytes (o path de uma sub dela passaria de 2000 bytes)
  INSERT INTO product_categories (id, name, slug, path, parent_id, sort_order, is_active, created_by, organization_id)
  VALUES ('2027c700-0000-4000-8000-000000000003', repeat('é', 1000), 'teste-longo-2027-g', 'teste-longo-2027-g', NULL, 999, true, v_act, c_org);


  PERFORM set_config('teste.org', c_org::text, true);
  PERFORM set_config('teste.bm24', c_bm24::text, true);
  PERFORM set_config('teste.p1', v_p1::text, true);
  PERFORM set_config('teste.p2', v_p2::text, true);
  PERFORM set_config('teste.p4', v_p4::text, true);
  PERFORM set_config('teste.cons', v_cons::text, true);
  PERFORM set_config('teste.p4_marca', v_p4_marca, true);
  PERFORM set_config('teste.p4_cat', v_p4_cat, true);
  PERFORM set_config('teste.p4_sub', v_p4_sub, true);
  PERFORM set_config('teste.apag', v_apag::text, true);
  PERFORM set_config('teste.act', v_act::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_sem', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_red', json_build_object('sub', v_red, 'role', 'authenticated')::text, true);
END $fx$;

-- ─── 1 a 3. Criar categorias; repetidos; 2 níveis; nomes ─────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_det text; v_org uuid := current_setting('teste.org')::uuid; v_a uuid; v_a1 uuid; v_b uuid;
BEGIN
  r := public.cat_guardar_categoria_produto(v_org, NULL, NULL, '  Pavimento' || chr(160) || 'Teste2027   G ') -> 'categoria';
  IF r ->> 'nome' IS DISTINCT FROM 'Pavimento Teste2027 G' OR r -> 'pai' IS DISTINCT FROM 'null'::jsonb
     OR (r -> 'ativo')::boolean IS NOT TRUE OR (r ->> 'usados')::int IS DISTINCT FROM 0 OR (r -> 'global')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU: criar categoria — %', r;
  END IF;
  v_a := (r ->> 'id')::uuid;
  r := public.cat_guardar_categoria_produto(v_org, NULL, v_a, 'Cerâmico Teste2027 G') -> 'categoria';
  IF r ->> 'pai' IS DISTINCT FROM v_a::text THEN RAISE EXCEPTION 'FALHOU: criar sub — %', r; END IF;
  v_a1 := (r ->> 'id')::uuid;
  r := public.cat_guardar_categoria_produto(v_org, NULL, v_a, 'Vinílico Teste2027 G') -> 'categoria';
  PERFORM set_config('teste.a2', r ->> 'id', true);
  r := public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'Revestimento Teste2027 G') -> 'categoria';
  v_b := (r ->> 'id')::uuid;
  -- o mesmo nome de uma sub noutro pai passa
  r := public.cat_guardar_categoria_produto(v_org, NULL, v_b, 'Cerâmico Teste2027 G') -> 'categoria';
  IF r ->> 'pai' IS DISTINCT FROM v_b::text THEN RAISE EXCEPTION 'FALHOU: o mesmo nome noutro pai — %', r; END IF;
  PERFORM set_config('teste.b1', r ->> 'id', true);
  PERFORM set_config('teste.a', v_a::text, true);
  PERFORM set_config('teste.a1', v_a1::text, true);
  PERFORM set_config('teste.b', v_b::text, true);

  -- 2. repetidos
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'PAVIMENTO' || chr(8203) || ' teste2027 g');
    RAISE EXCEPTION 'FALHOU: categoria repetida foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    IF v_det IS DISTINCT FROM v_a::text THEN RAISE EXCEPTION 'FALHOU: categoria repetida — DETAIL %', v_det; END IF;
  END;
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(v_org, NULL, v_a, 'ceramico teste2027 g');
    RAISE EXCEPTION 'FALHOU: subcategoria repetida no mesmo pai foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    IF v_det IS DISTINCT FROM v_a1::text THEN RAISE EXCEPTION 'FALHOU: subcategoria repetida — DETAIL %', v_det; END IF;
  END;
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'teste global cat 2027 g');
    RAISE EXCEPTION 'FALHOU: categoria com o nome de uma global foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    IF v_det IS DISTINCT FROM '2027c700-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'FALHOU: repetida da global — DETAIL %', v_det; END IF;
  END;
  -- 3. dois níveis, pai inexistente, nomes, path longo
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(v_org, NULL, v_a1, 'Neta Teste2027 G');
    RAISE EXCEPTION 'FALHOU: sub de sub foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(v_org, NULL, gen_random_uuid(), 'Órfã Teste2027 G');
    RAISE EXCEPTION 'FALHOU: pai inexistente foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(v_org, NULL, NULL, chr(160) || ' ' || chr(8203));
    RAISE EXCEPTION 'FALHOU: nome vazio foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(v_org, NULL, NULL, repeat('x', 201));
    RAISE EXCEPTION 'FALHOU: nome com 201 caracteres foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(v_org, NULL, NULL, repeat('x', 1001));
    RAISE EXCEPTION 'FALHOU: nome com 1001 caracteres foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(v_org, NULL, '2027c700-0000-4000-8000-000000000003', 'Sub Longa Teste2027 G');
    RAISE EXCEPTION 'FALHOU: path com mais de 2000 bytes foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
END $t$;
RESET ROLE;
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM product_categories c WHERE c.id = current_setting('teste.a')::uuid AND c.organization_id = v_org
                   AND c.slug = 'pavimento-teste2027-g' AND c.path = 'pavimento-teste2027-g' AND c.parent_id IS NULL AND c.deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM product_categories c WHERE c.id = current_setting('teste.a1')::uuid AND c.organization_id = v_org
                      AND c.slug = 'ceramico-teste2027-g' AND c.path = 'pavimento teste2027 g/ceramico-teste2027-g')
     OR EXISTS (SELECT 1 FROM product_category_organizations j WHERE j.category_id IN (current_setting('teste.a')::uuid, current_setting('teste.a1')::uuid)) THEN
    RAISE EXCEPTION 'FALHOU: criar categoria — linhas (organização, slug, path, sem junção) não ficaram como esperado';
  END IF;
  -- p1, p2 (vivos), o consumível e o apagado ficam na categoria e sub de teste
  UPDATE products SET category_id = current_setting('teste.a')::uuid, subcategory_id = current_setting('teste.a1')::uuid
  WHERE organization_id = v_org AND id IN (current_setting('teste.p1')::uuid, current_setting('teste.p2')::uuid,
                                           current_setting('teste.cons')::uuid, current_setting('teste.apag')::uuid);
END $t$;

-- ─── 4. Ler com «usados» e a global ──────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; a jsonb; g jsonb;
BEGIN
  r := public.cat_ler_categorias_gestao(current_setting('teste.org')::uuid);
  SELECT x INTO a FROM jsonb_array_elements(r -> 'categorias') x WHERE x ->> 'id' = current_setting('teste.a');
  IF a IS NULL OR (a ->> 'usados')::int IS DISTINCT FROM 3 OR (a -> 'global')::boolean IS NOT FALSE
     OR jsonb_array_length(a -> 'subcategorias') IS DISTINCT FROM 2
     OR (SELECT (s ->> 'usados')::int FROM jsonb_array_elements(a -> 'subcategorias') s WHERE s ->> 'id' = current_setting('teste.a1')) IS DISTINCT FROM 3
     OR (SELECT (s ->> 'usados')::int FROM jsonb_array_elements(a -> 'subcategorias') s WHERE s ->> 'id' = current_setting('teste.a2')) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: ler categorias — usados (2 produtos + 1 consumível vivos; o apagado não): %', a;
  END IF;
  SELECT x INTO g FROM jsonb_array_elements(r -> 'categorias') x WHERE x ->> 'id' = '2027c700-0000-4000-8000-000000000001';
  IF g IS NULL OR (g -> 'global')::boolean IS NOT TRUE OR jsonb_array_length(g -> 'subcategorias') IS DISTINCT FROM 1
     OR (g -> 'subcategorias' -> 0 -> 'global')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: ler categorias — a global: %', g;
  END IF;
END $t$;
RESET ROLE;

-- ─── 5. Renomear ─────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_msg text; v_org uuid := current_setting('teste.org')::uuid;
BEGIN
  r := public.cat_guardar_categoria_produto(v_org, current_setting('teste.a')::uuid, NULL, 'Pavimento Novo Teste2027 G') -> 'categoria';
  IF r ->> 'nome' IS DISTINCT FROM 'Pavimento Novo Teste2027 G' OR (r ->> 'usados')::int IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: renomear categoria — %', r;
  END IF;
  r := public.cat_guardar_categoria_produto(v_org, current_setting('teste.a1')::uuid, current_setting('teste.a')::uuid, 'Cerâmica Teste2027 G') -> 'categoria';
  IF r ->> 'nome' IS DISTINCT FROM 'Cerâmica Teste2027 G' THEN RAISE EXCEPTION 'FALHOU: renomear sub — %', r; END IF;
  r := public.cat_ler_produtos_tabelas(v_org);
  IF (SELECT x ->> 'name' FROM jsonb_array_elements(r -> 'categoriasProduto') x WHERE x ->> 'id' = current_setting('teste.a'))
     IS DISTINCT FROM 'Pavimento Novo Teste2027 G' THEN
    RAISE EXCEPTION 'FALHOU: renomear — cat_ler_produtos_tabelas não mostra o nome novo';
  END IF;
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(v_org, current_setting('teste.a1')::uuid, current_setting('teste.b')::uuid, 'Cerâmica Teste2027 G');
    RAISE EXCEPTION 'FALHOU: mudar de pai foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(v_org, '2027c700-0000-4000-8000-000000000001', NULL, 'Outra Global G');
    RAISE EXCEPTION 'FALHOU: renomear uma global foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Categoria partilhada: não se pode alterar aqui.' THEN RAISE EXCEPTION 'FALHOU: global — mensagem: %', v_msg; END IF;
  END;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM product_categories c WHERE c.id = current_setting('teste.a')::uuid
                   AND c.slug = 'pavimento-teste2027-g' AND c.path = 'pavimento-teste2027-g')
     OR NOT EXISTS (SELECT 1 FROM product_categories c WHERE c.id = current_setting('teste.a1')::uuid
                      AND c.slug = 'ceramico-teste2027-g' AND c.path = 'pavimento teste2027 g/ceramico-teste2027-g') THEN
    RAISE EXCEPTION 'FALHOU: renomear mexeu no slug ou no path';
  END IF;
  IF (SELECT count(*) FROM products p WHERE p.organization_id = current_setting('teste.org')::uuid
        AND p.category_id = current_setting('teste.a')::uuid AND p.subcategory_id = current_setting('teste.a1')::uuid) <> 4 THEN
    RAISE EXCEPTION 'FALHOU: renomear — os produtos perderam a ligação';
  END IF;
END $t$;

-- ─── 6. Estados ──────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_org uuid := current_setting('teste.org')::uuid;
BEGIN
  r := public.cat_estado_categoria_produto(v_org, current_setting('teste.a1')::uuid, false);
  IF (r -> 'categoria' -> 'ativo')::boolean IS NOT FALSE OR (r ->> 'subcategorias_desativadas')::int IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: desativar sub — %', r;
  END IF;
  r := public.cat_estado_categoria_produto(v_org, current_setting('teste.a1')::uuid, true);
  IF (r -> 'categoria' -> 'ativo')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: reativar sub — %', r; END IF;
  r := public.cat_estado_categoria_produto(v_org, current_setting('teste.a')::uuid, false);
  IF (r ->> 'subcategorias_desativadas')::int IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'FALHOU: desativar em cascata — %', r; END IF;
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(v_org, NULL, current_setting('teste.a')::uuid, 'Laminado Teste2027 G');
    RAISE EXCEPTION 'FALHOU: criar sub num pai desativado foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_estado_categoria_produto(v_org, current_setting('teste.a1')::uuid, true);
    RAISE EXCEPTION 'FALHOU: ativar sub com o pai desativado foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  r := public.cat_estado_categoria_produto(v_org, current_setting('teste.a')::uuid, true);
  IF (r -> 'categoria' -> 'ativo')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: reativar topo — %', r; END IF;
  r := public.cat_ler_categorias_gestao(v_org);
  IF (SELECT bool_or((s -> 'ativo')::boolean) FROM jsonb_array_elements(r -> 'categorias') x, jsonb_array_elements(x -> 'subcategorias') s
      WHERE x ->> 'id' = current_setting('teste.a')) IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU: reativar o topo reativou subs';
  END IF;
  BEGIN
    PERFORM public.cat_estado_categoria_produto(v_org, '2027c700-0000-4000-8000-000000000001', false);
    RAISE EXCEPTION 'FALHOU: desativar uma global foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF (SELECT count(*) FROM products p WHERE p.organization_id = current_setting('teste.org')::uuid
        AND p.category_id = current_setting('teste.a')::uuid AND p.subcategory_id = current_setting('teste.a1')::uuid) <> 4 THEN
    RAISE EXCEPTION 'FALHOU: desativar mexeu na ligação dos produtos';
  END IF;
  PERFORM set_config('teste.topo', (SELECT array_agg(c.id ORDER BY c.sort_order DESC, c.id)::text FROM product_categories c
                                    WHERE c.organization_id = current_setting('teste.org')::uuid AND c.parent_id IS NULL AND c.deleted_at IS NULL), true);
END $t$;

-- ─── 7. Reordenar ────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_org uuid := current_setting('teste.org')::uuid; v_topo uuid[] := current_setting('teste.topo')::uuid[];
BEGIN
  r := public.cat_reordenar_categorias(v_org, current_setting('teste.a')::uuid,
         ARRAY[current_setting('teste.a2')::uuid, current_setting('teste.a1')::uuid]);
  IF (r ->> 'n')::int IS DISTINCT FROM 2 OR (r -> 'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: reordenar subs — %', r; END IF;
  r := public.cat_ler_categorias_gestao(v_org);
  IF (SELECT x -> 'subcategorias' -> 0 ->> 'id' FROM jsonb_array_elements(r -> 'categorias') x WHERE x ->> 'id' = current_setting('teste.a'))
     IS DISTINCT FROM current_setting('teste.a2') THEN
    RAISE EXCEPTION 'FALHOU: reordenar subs — a primeira não é a pedida';
  END IF;
  BEGIN
    PERFORM public.cat_reordenar_categorias(v_org, current_setting('teste.a')::uuid, ARRAY[current_setting('teste.a2')::uuid]);
    RAISE EXCEPTION 'FALHOU: reordenar com uma sub em falta foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_reordenar_categorias(v_org, current_setting('teste.a')::uuid,
              ARRAY[current_setting('teste.a2')::uuid, current_setting('teste.a1')::uuid, current_setting('teste.b1')::uuid]);
    RAISE EXCEPTION 'FALHOU: reordenar com uma sub de outro pai foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  r := public.cat_reordenar_categorias(v_org, NULL, v_topo);
  IF (r ->> 'n')::int IS DISTINCT FROM cardinality(v_topo) THEN RAISE EXCEPTION 'FALHOU: reordenar topo — %', r; END IF;
  r := public.cat_ler_categorias_gestao(v_org);
  IF (SELECT x ->> 'id' FROM jsonb_array_elements(r -> 'categorias') x WHERE NOT (x -> 'global')::boolean
      ORDER BY (x ->> 'ordem')::int LIMIT 1) IS DISTINCT FROM v_topo[1]::text THEN
    RAISE EXCEPTION 'FALHOU: reordenar topo — a primeira não é a pedida';
  END IF;
  BEGIN
    PERFORM public.cat_reordenar_categorias(v_org, NULL, v_topo[2:]);
    RAISE EXCEPTION 'FALHOU: reordenar o topo incompleto foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
END $t$;
RESET ROLE;

-- ─── 8. Marcas ───────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_det text; v_org uuid := current_setting('teste.org')::uuid; v_site text;
BEGIN
  r := public.cat_guardar_marca(v_org, NULL, ' Azulejária' || chr(160) || 'Teste2027  G ', ' https://azulejaria-teste.pt/marca ') -> 'marca';
  IF r ->> 'nome' IS DISTINCT FROM 'Azulejária Teste2027 G' OR r ->> 'website' IS DISTINCT FROM 'https://azulejaria-teste.pt/marca'
     OR (r -> 'ativo')::boolean IS NOT TRUE OR (r ->> 'usados')::int IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: criar marca — %', r;
  END IF;
  PERFORM set_config('teste.m', r ->> 'id', true);
  r := public.cat_guardar_marca(v_org, NULL, 'Marca Desativada Teste2027 G', NULL) -> 'marca';
  IF r -> 'website' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'FALHOU: criar marca sem site — %', r; END IF;
  PERFORM set_config('teste.m2', r ->> 'id', true);
  BEGIN
    PERFORM public.cat_guardar_marca(v_org, NULL, 'AZULEJARIA teste2027 g', NULL);
    RAISE EXCEPTION 'FALHOU: marca repetida foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    IF v_det IS DISTINCT FROM current_setting('teste.m') THEN RAISE EXCEPTION 'FALHOU: marca repetida — DETAIL %', v_det; END IF;
  END;
  BEGIN
    PERFORM public.cat_guardar_marca(v_org, NULL, 'teste global marca 2027 g', NULL);
    RAISE EXCEPTION 'FALHOU: marca com o nome de uma global foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    IF v_det IS DISTINCT FROM '2027c700-0000-4000-8000-000000000011' THEN RAISE EXCEPTION 'FALHOU: marca repetida da global — DETAIL %', v_det; END IF;
  END;
  -- sites recusados (cada um uma vez)
  FOREACH v_site IN ARRAY ARRAY['ftp://marca.pt', 'javascript:alert(1)', 'data:text/html,x', 'https://a@b.com',
                                'https://marca.pt\x', 'https://marca.pt/<x>', 'https://marca .pt', 'https://marca.pt/"x',
                                'https://marca.pt/' || repeat('a', 290)] LOOP
    BEGIN
      PERFORM public.cat_guardar_marca(v_org, NULL, 'Site Mau Teste2027 G', v_site);
      RAISE EXCEPTION 'FALHOU: site recusável foi aceite: %', v_site;
    EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
    END;
  END LOOP;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  -- p1, p2 (vivos), o consumível e o apagado passam a ter a marca de teste (o gatilho acerta marca_livre)
  UPDATE products SET brand_id = current_setting('teste.m')::uuid
  WHERE organization_id = current_setting('teste.org')::uuid
    AND id IN (current_setting('teste.p1')::uuid, current_setting('teste.p2')::uuid,
               current_setting('teste.cons')::uuid, current_setting('teste.apag')::uuid);
  IF EXISTS (SELECT 1 FROM brand_organizations j WHERE j.brand_id = current_setting('teste.m')::uuid)
     OR NOT EXISTS (SELECT 1 FROM brands b WHERE b.id = current_setting('teste.m')::uuid AND b.organization_id = current_setting('teste.org')::uuid
                      AND b.slug LIKE 'azulejaria-teste2027-g-%') THEN
    RAISE EXCEPTION 'FALHOU: criar marca — linha (organização, slug, sem junção) não ficou como esperado';
  END IF;
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; m jsonb; v_msg text; v_org uuid := current_setting('teste.org')::uuid;
BEGIN
  r := public.cat_ler_marcas_gestao(v_org);
  SELECT x INTO m FROM jsonb_array_elements(r -> 'marcas') x WHERE x ->> 'id' = current_setting('teste.m');
  IF m IS NULL OR (m ->> 'usados')::int IS DISTINCT FROM 3 OR (m -> 'global')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU: ler marcas — usados (2 produtos + 1 consumível vivos): %', m;
  END IF;
  SELECT x INTO m FROM jsonb_array_elements(r -> 'marcas') x WHERE x ->> 'id' = '2027c700-0000-4000-8000-000000000011';
  IF m IS NULL OR (m -> 'global')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: ler marcas — a global: %', m; END IF;

  r := public.cat_guardar_marca(v_org, current_setting('teste.m')::uuid, 'Azulejos Novos Teste2027 G', NULL);
  IF r -> 'marca' ->> 'nome' IS DISTINCT FROM 'Azulejos Novos Teste2027 G' OR (r ->> 'produtos_atualizados')::int IS DISTINCT FROM 4
     OR r -> 'marca' ->> 'website' IS DISTINCT FROM 'https://azulejaria-teste.pt/marca' OR (r -> 'marca' ->> 'usados')::int IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: renomear marca — %', r;
  END IF;
  r := public.cat_guardar_marca(v_org, current_setting('teste.m')::uuid, 'Azulejos Novos Teste2027 G', '');
  IF r -> 'marca' -> 'website' IS DISTINCT FROM 'null'::jsonb OR (r ->> 'produtos_atualizados')::int IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: limpar o site — %', r;
  END IF;
  r := public.cat_estado_marca(v_org, current_setting('teste.m2')::uuid, false);
  IF (r -> 'marca' -> 'ativo')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FALHOU: desativar marca — %', r; END IF;
  BEGIN
    PERFORM public.cat_guardar_marca(v_org, '2027c700-0000-4000-8000-000000000011', 'Outra Global G', NULL);
    RAISE EXCEPTION 'FALHOU: renomear uma marca global foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Marca partilhada: não se pode alterar aqui.' THEN RAISE EXCEPTION 'FALHOU: marca global — mensagem: %', v_msg; END IF;
  END;
  BEGIN
    PERFORM public.cat_estado_marca(v_org, '2027c700-0000-4000-8000-000000000011', false);
    RAISE EXCEPTION 'FALHOU: desativar uma marca global foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF (SELECT count(*) FROM products p WHERE p.organization_id = current_setting('teste.org')::uuid
        AND p.brand_id = current_setting('teste.m')::uuid AND p.marca_livre = 'Azulejos Novos Teste2027 G') <> 4 THEN
    RAISE EXCEPTION 'FALHOU: renomear marca — marca_livre ou brand_id dos 4 produtos não ficaram certos';
  END IF;
END $t$;

-- ─── 9. cat_guardar_produto_tabelas: desativadas e outra organização ─────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb; v_msg text; v_org uuid := current_setting('teste.org')::uuid; v_p4 uuid := current_setting('teste.p4')::uuid;
BEGIN
  -- marca desativada nova no produto → recusa
  BEGIN
    PERFORM public.cat_guardar_produto_tabelas(v_org, v_p4, 'Marca Desativada Teste2027 G', NULL, current_setting('teste.p4_cat'), current_setting('teste.p4_sub'));
    RAISE EXCEPTION 'FALHOU: marca desativada nova foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'A marca «Marca Desativada Teste2027 G» está desativada.' THEN RAISE EXCEPTION 'FALHOU: marca desativada — mensagem: %', v_msg; END IF;
  END;
  -- subcategoria desativada nova (a1 está desativada desde o passo 6; a categoria A está ativa) → recusa
  BEGIN
    PERFORM public.cat_guardar_produto_tabelas(v_org, v_p4, current_setting('teste.p4_marca'), NULL, 'Pavimento Novo Teste2027 G', 'Cerâmica Teste2027 G');
    RAISE EXCEPTION 'FALHOU: subcategoria desativada nova foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'A subcategoria «Cerâmica Teste2027 G» está desativada.' THEN RAISE EXCEPTION 'FALHOU: sub desativada — mensagem: %', v_msg; END IF;
  END;
  -- categoria desativada nova → recusa
  PERFORM public.cat_estado_categoria_produto(v_org, current_setting('teste.b')::uuid, false);
  BEGIN
    PERFORM public.cat_guardar_produto_tabelas(v_org, v_p4, current_setting('teste.p4_marca'), NULL, 'Revestimento Teste2027 G', NULL);
    RAISE EXCEPTION 'FALHOU: categoria desativada nova foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'A categoria «Revestimento Teste2027 G» está desativada.' THEN RAISE EXCEPTION 'FALHOU: categoria desativada — mensagem: %', v_msg; END IF;
  END;
  -- p2 já tem a sub a1 (desativada): gravar o mesmo passa
  PERFORM public.cat_guardar_produto_tabelas(v_org, current_setting('teste.p2')::uuid, 'Azulejos Novos Teste2027 G', NULL,
                                             'Pavimento Novo Teste2027 G', 'Cerâmica Teste2027 G');
  -- com a categoria A desativada: p2 (que já a tem) passa; uma sub nova pelo nome debaixo dela é recusada
  PERFORM public.cat_estado_categoria_produto(v_org, current_setting('teste.a')::uuid, false);
  PERFORM public.cat_guardar_produto_tabelas(v_org, current_setting('teste.p2')::uuid, 'Azulejos Novos Teste2027 G', NULL,
                                             'Pavimento Novo Teste2027 G', 'Cerâmica Teste2027 G');
  BEGIN
    PERFORM public.cat_guardar_produto_tabelas(v_org, current_setting('teste.p2')::uuid, 'Azulejos Novos Teste2027 G', NULL,
                                               'Pavimento Novo Teste2027 G', 'Nova Sub Teste2027 G');
    RAISE EXCEPTION 'FALHOU: subcategoria nova debaixo de categoria desativada foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'A categoria «Pavimento Novo Teste2027 G» está desativada: não se lhe pode escolher outra subcategoria.' THEN
      RAISE EXCEPTION 'FALHOU: sub nova em categoria desativada — mensagem: %', v_msg;
    END IF;
  END;
  -- "ativa" em categoriasProduto
  r := public.cat_ler_produtos_tabelas(v_org);
  IF (SELECT (x -> 'ativa')::boolean FROM jsonb_array_elements(r -> 'categoriasProduto') x WHERE x ->> 'id' = current_setting('teste.a')) IS NOT FALSE
     OR (SELECT (x -> 'ativa')::boolean FROM jsonb_array_elements(r -> 'categoriasProduto') x WHERE x ->> 'id' = current_setting('teste.a1')) IS NOT FALSE
     OR (SELECT (x -> 'ativa')::boolean FROM jsonb_array_elements(r -> 'categoriasProduto') x
         WHERE x ->> 'id' = (SELECT p.category_id::text FROM products p WHERE p.id = current_setting('teste.p4')::uuid)) IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: cat_ler_produtos_tabelas — "ativa" não reflete o estado das categorias';
  END IF;
  PERFORM public.cat_estado_categoria_produto(v_org, current_setting('teste.a')::uuid, true);
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF EXISTS (SELECT 1 FROM product_categories c WHERE c.organization_id = current_setting('teste.org')::uuid AND c.name = 'Nova Sub Teste2027 G') THEN
    RAISE EXCEPTION 'FALHOU: a sub recusada ficou criada';
  END IF;
  -- p4 passa a ter a marca desativada (como se já a tivesse antes de ser desativada)
  UPDATE products SET brand_id = current_setting('teste.m2')::uuid
  WHERE id = current_setting('teste.p4')::uuid AND organization_id = current_setting('teste.org')::uuid;
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  PERFORM public.cat_guardar_produto_tabelas(current_setting('teste.org')::uuid, current_setting('teste.p4')::uuid, 'Marca Desativada Teste2027 G', NULL,
                                             current_setting('teste.p4_cat'), current_setting('teste.p4_sub'));
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products p WHERE p.id = current_setting('teste.p2')::uuid
                   AND p.brand_id = current_setting('teste.m')::uuid AND p.subcategory_id = current_setting('teste.a1')::uuid) THEN
    RAISE EXCEPTION 'FALHOU: gravar com a sub desativada que o produto já tinha não ficou como estava';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM products p WHERE p.id = current_setting('teste.p4')::uuid AND p.brand_id = current_setting('teste.m2')::uuid) THEN
    RAISE EXCEPTION 'FALHOU: gravar com a marca desativada que o produto já tinha não ficou como estava';
  END IF;
END $t$;

-- ─── 10. Permissões, isolamento e inexistentes ───────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims_sem'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_msg text; v_f text; v_org uuid := current_setting('teste.org')::uuid;
BEGIN
  FOREACH v_f IN ARRAY ARRAY['guardar_cat', 'estado_cat', 'reordenar', 'guardar_marca', 'estado_marca'] LOOP
    BEGIN
      IF v_f = 'guardar_cat' THEN
        PERFORM public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'Sem Permissão G');
      ELSIF v_f = 'estado_cat' THEN
        PERFORM public.cat_estado_categoria_produto(v_org, current_setting('teste.a')::uuid, false);
      ELSIF v_f = 'reordenar' THEN
        PERFORM public.cat_reordenar_categorias(v_org, current_setting('teste.a')::uuid,
                  ARRAY[current_setting('teste.a1')::uuid, current_setting('teste.a2')::uuid]);
      ELSIF v_f = 'guardar_marca' THEN
        PERFORM public.cat_guardar_marca(v_org, NULL, 'Sem Permissão G', NULL);
      ELSE
        PERFORM public.cat_estado_marca(v_org, current_setting('teste.m')::uuid, false);
      END IF;
      RAISE EXCEPTION 'FALHOU: sem products.edit foi aceite (%)', v_f;
    EXCEPTION WHEN SQLSTATE 'CT001' THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg IS DISTINCT FROM 'Sem permissão (products.edit).' THEN RAISE EXCEPTION 'FALHOU: sem permissão (%) — mensagem: %', v_f, v_msg; END IF;
    END;
  END LOOP;
END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claims', current_setting('teste.claims_red'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.cat_ler_categorias_gestao(current_setting('teste.org')::uuid);
    RAISE EXCEPTION 'FALHOU: o perfil reduzido leu as categorias de gestão';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_ler_marcas_gestao(current_setting('teste.org')::uuid);
    RAISE EXCEPTION 'FALHOU: o perfil reduzido leu as marcas de gestão';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_f text; v_org uuid := current_setting('teste.org')::uuid; v_x uuid := gen_random_uuid();
BEGIN
  BEGIN
    PERFORM public.cat_ler_categorias_gestao(current_setting('teste.bm24')::uuid);
    RAISE EXCEPTION 'FALHOU: ler categorias com p_org = BM24 foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_guardar_marca(current_setting('teste.bm24')::uuid, current_setting('teste.m')::uuid, 'Alheia G', NULL);
    RAISE EXCEPTION 'FALHOU: renomear marca com p_org = BM24 foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(gen_random_uuid(), NULL, NULL, 'Alheia G');
    RAISE EXCEPTION 'FALHOU: criar categoria numa organização inventada foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  -- id inexistente → CT003 em guardar, estado e reordenar
  FOREACH v_f IN ARRAY ARRAY['guardar_cat', 'estado_cat', 'reordenar', 'guardar_marca', 'estado_marca'] LOOP
    BEGIN
      IF v_f = 'guardar_cat' THEN PERFORM public.cat_guardar_categoria_produto(v_org, v_x, NULL, 'Inexistente G');
      ELSIF v_f = 'estado_cat' THEN PERFORM public.cat_estado_categoria_produto(v_org, v_x, false);
      ELSIF v_f = 'reordenar' THEN PERFORM public.cat_reordenar_categorias(v_org, v_x, ARRAY[current_setting('teste.a1')::uuid]);
      ELSIF v_f = 'guardar_marca' THEN PERFORM public.cat_guardar_marca(v_org, v_x, 'Inexistente G', NULL);
      ELSE PERFORM public.cat_estado_marca(v_org, v_x, false);
      END IF;
      RAISE EXCEPTION 'FALHOU: id inexistente foi aceite (%)', v_f;
    EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL;
    END;
  END LOOP;
END $t$;
RESET ROLE;

-- ─── 11. Tetos: só as ATIVAS contam ──────────────────────────────────────────
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid; v_n integer; v_act uuid := current_setting('teste.act')::uuid;
BEGIN
  -- 299 categorias ativas + 10 desativadas; 499 marcas ativas + 10 desativadas
  SELECT 299 - count(*) INTO v_n FROM product_categories WHERE organization_id = v_org AND deleted_at IS NULL AND coalesce(is_active, true);
  IF v_n < 0 THEN RAISE EXCEPTION 'FALHOU (fixture): a nike já tem mais de 299 categorias ativas'; END IF;
  INSERT INTO product_categories (name, slug, path, parent_id, sort_order, is_active, created_by, organization_id)
  SELECT 'Teto Teste2027 G ' || i, 'teto-teste2027-g-' || i, 'teto-teste2027-g-' || i, NULL, 900 + i, true, v_act, v_org FROM generate_series(1, v_n) i;
  INSERT INTO product_categories (name, slug, path, parent_id, sort_order, is_active, created_by, organization_id)
  SELECT 'Teto Inativa Teste2027 G ' || i, 'teto-inativa-teste2027-g-' || i, 'teto-inativa-teste2027-g-' || i, NULL, 1900 + i, false, v_act, v_org
  FROM generate_series(1, 10) i;
  SELECT 499 - count(*) INTO v_n FROM brands WHERE organization_id = v_org AND deleted_at IS NULL AND coalesce(is_active, true);
  IF v_n < 0 THEN RAISE EXCEPTION 'FALHOU (fixture): a nike já tem mais de 499 marcas ativas'; END IF;
  INSERT INTO brands (name, slug, created_by, organization_id, is_active)
  SELECT 'Teto Marca Teste2027 G ' || i, 'teto-marca-teste2027-g-' || i, v_act, v_org, true FROM generate_series(1, v_n) i;
  INSERT INTO brands (name, slug, created_by, organization_id, is_active)
  SELECT 'Teto Marca Inativa Teste2027 G ' || i, 'teto-marca-inativa-teste2027-g-' || i, v_act, v_org, false FROM generate_series(1, 10) i;
  PERFORM set_config('teste.cat_inativa', (SELECT c.id::text FROM product_categories c WHERE c.organization_id = v_org AND c.name = 'Teto Inativa Teste2027 G 1'), true);
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_msg text; v_org uuid := current_setting('teste.org')::uuid;
BEGIN
  -- a 300.ª ativa passa (as 10 desativadas não contam); a 301.ª não
  PERFORM public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'Trecentésima Teste2027 G');
  BEGIN
    PERFORM public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'Acima do Teto Teste2027 G');
    RAISE EXCEPTION 'FALHOU: categoria acima de 300 ativas foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Esta organização já tem o máximo de categorias e subcategorias ativas (300).' THEN RAISE EXCEPTION 'FALHOU: teto categorias — mensagem: %', v_msg; END IF;
  END;
  BEGIN
    PERFORM public.cat_estado_categoria_produto(v_org, current_setting('teste.cat_inativa')::uuid, true);
    RAISE EXCEPTION 'FALHOU: ativar uma categoria acima de 300 ativas foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  PERFORM public.cat_guardar_marca(v_org, NULL, 'Quingentésima Teste2027 G', NULL);
  BEGIN
    PERFORM public.cat_guardar_marca(v_org, NULL, 'Acima do Teto Teste2027 G', NULL);
    RAISE EXCEPTION 'FALHOU: marca acima de 500 ativas foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Esta organização já tem o máximo de marcas ativas (500).' THEN RAISE EXCEPTION 'FALHOU: teto marcas — mensagem: %', v_msg; END IF;
  END;
  BEGIN
    PERFORM public.cat_estado_marca(v_org, current_setting('teste.m2')::uuid, true);
    RAISE EXCEPTION 'FALHOU: ativar uma marca acima de 500 ativas foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
END $t$;
RESET ROLE;

-- ─── 12. search_path e acessos ───────────────────────────────────────────────
DO $t$
DECLARE v_sig text; v_oid oid;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_categorias_gestao(uuid)', 'public.cat_guardar_categoria_produto(uuid,uuid,uuid,text)',
                                'public.cat_estado_categoria_produto(uuid,uuid,boolean)', 'public.cat_reordenar_categorias(uuid,uuid,uuid[])',
                                'public.cat_ler_marcas_gestao(uuid)', 'public.cat_guardar_marca(uuid,uuid,text,text)',
                                'public.cat_estado_marca(uuid,uuid,boolean)', 'public.cat_guardar_produto_tabelas(uuid,uuid,text,text,text,text)',
                                'public.cat_ler_produtos_tabelas(uuid)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'FALHOU: falta a função %', v_sig; END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: anon pode executar %', v_sig; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc pr, aclexplode(pr.proacl) x WHERE pr.oid = v_oid AND x.grantee = 0 AND x.privilege_type = 'EXECUTE')
       OR (SELECT pr.proacl FROM pg_proc pr WHERE pr.oid = v_oid) IS NULL THEN
      RAISE EXCEPTION 'FALHOU: PUBLIC pode executar %', v_sig;
    END IF;
  END LOOP;
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_categorias_gestao(uuid)', 'public.cat_guardar_categoria_produto(uuid,uuid,uuid,text)',
                                'public.cat_estado_categoria_produto(uuid,uuid,boolean)', 'public.cat_reordenar_categorias(uuid,uuid,uuid[])',
                                'public.cat_ler_marcas_gestao(uuid)', 'public.cat_guardar_marca(uuid,uuid,text,text)',
                                'public.cat_estado_marca(uuid,uuid,boolean)', 'public.cat_guardar_produto_tabelas(uuid,uuid,text,text,text,text)',
                                'public.fn_cat_exigir(uuid,text)', 'public.fn_cat_pode(uuid,text)', 'public.fn_cat_marca(uuid,text,uuid)',
                                'public.fn_cat_categoria_produto(uuid,text,uuid,uuid)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc pr, unnest(pr.proconfig) cfg WHERE pr.oid = to_regprocedure(v_sig)::oid AND cfg = 'search_path=public, pg_temp') THEN
      RAISE EXCEPTION 'FALHOU: % sem search_path = public, pg_temp', v_sig;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_proc pr, unnest(pr.proconfig) cfg WHERE pr.oid = to_regprocedure('public.cat_ler_produtos_tabelas(uuid)')::oid AND cfg = 'search_path=public') THEN
    RAISE EXCEPTION 'FALHOU: cat_ler_produtos_tabelas mudou de search_path';
  END IF;
END $t$;

SELECT 'OK: criar categorias e subs, repetidos (topo, sub, global; outro pai passa), 2 níveis, pai inexistente, nomes, path > 2000 bytes, usados com consumível, global só leitura, renomear (slug e path ficam), mudar de pai, estados (cascata, pai desativado, reativar não reativa subs), reordenar, marcas (criar, repetida, global, 9 sites recusados, usados, renomear 4 produtos, site NULL e vazio, estado), desativadas no produto (marca, sub, categoria recusadas; já do produto aceites; sub nova em categoria desativada recusada e não criada), "ativa" em categoriasProduto, sem permissão (5), perfil reduzido (2), BM24 (2), organização inventada, inexistentes (5), tetos só ativas (300 e 500, ativar acima do teto), search_path (8 + 4), acessos. Não coberto: nome só existente noutra organização.' AS resultado;

ROLLBACK;
