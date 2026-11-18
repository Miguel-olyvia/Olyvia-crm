-- ============================================================
-- Testes: 20270122200000_catalogo_marcas_do_filtro.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 20270122200000 (falha no passo 0: a função ainda não existe); depois do push
-- termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- Tudo dentro de BEGIN … ROLLBACK (nada fica). Só leituras, exceto a fixture do passo 0b: três UPDATE a produtos da nike
-- (marca e, num deles, categoria) e, se faltar, um modelo com dois produtos, só nesta transação. Só a nike (b6ffce4f-f630-4933-833a-008649757a33); este
-- teste não lê mais nenhuma organização. Recusa provocada de propósito: 1 (utilizador sem permissão → CT001).
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_marcas_do_filtro.test.sql
-- O ensaio (migration + teste na mesma transação) concatena: BEGIN; <migration>; <este ficheiro sem BEGIN/ROLLBACK>; ROLLBACK.
--
-- O que PROVA:
--   0. A função existe.
--   0b. Fixture (só nesta transação): A = marca livre «X» com outra grafia de maiúsculas que a marca de catálogo X (prova a
--      fusão numa só entrada, com o nome e o id da marca de catálogo); C = marca livre sem categoria; D = sem marca. Se a nike
--      não tiver modelos, cria um modelo e liga-lhe dois produtos (passo 3).
--   1. Um só overload, sem EXECUTE para anon e com para authenticated; chaves marcas/sem_marca/total; cada marca
--      tem id, marca e n; ordem por nome sem acentos nem maiúsculas.
--   2. Sem filtros: total = total de cat_ler_produtos_pagina = contagem direta; sem_marca = contagem direta de produtos sem
--      marca; a soma de n + sem_marca = contagem direta de produtos; a fusão por maiúsculas (nome, id e n da marca de catálogo).
--   3. Com categoria, subcategoria, modelo, pesquisa e sem categoria (cada conjunto NÃO vazio, senão falha): total igual ao da
--      lista; TODAS as marcas devolvidas: o total da lista com p_marca dessa marca é igual a n (e n >= 1); entradas únicas por
--      lower(marca); cada id aponta para um brands.name igual a marca ignorando maiúsculas; sem_marca + soma de n = total
--      (prova real: cada n foi conferido à parte contra a lista).
--   4. Com p_q (o nome da marca mais frequente): igual à lista (total e n por marca).
--   5. Com p_sem_categoria: igual à lista.
--   6. Sem permissão (utilizador inventado, sem papel) → CT001.
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A função já existe? ──────────────────────────────────────────────────
DO $t0$
BEGIN
  IF to_regprocedure('public.cat_ler_marcas_do_filtro(uuid,text,uuid,uuid,uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — cat_ler_marcas_do_filtro ainda não existe (aplicar 20270122200000).';
  END IF;
END $t0$;

-- ─── 1 a 6 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_auth uuid; r record; v_j jsonb; v_l jsonb; v_m jsonb; v_chaves text; v_soma bigint; v_n integer;
  v_cat uuid; v_sub uuid; v_mod uuid; v_marca text; v_prev text; v_falhou boolean := false;
  v_casos integer := 0; v_marcas_cmp integer := 0;
  v_xid uuid; v_xnome text; v_xvar text; v_xn0 integer; v_ids uuid[]; v_dir bigint; v_e jsonb; v_nm integer;
  -- o caso: nome, p_q, p_categoria, p_subcategoria, p_modelo, p_sem_categoria
  v_caso record;
BEGIN
  -- claims de um membro ativo da nike com products.edit
  FOR r IN SELECT u.auth_user_id
           FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
           WHERE m.organization_id = c_nike AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
           ORDER BY m.created_at, u.id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text, true);
    IF public.fn_cat_pode(c_nike, 'products.edit') THEN v_auth := r.auth_user_id; EXIT; END IF;
  END LOOP;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — nenhum membro ativo da nike com products.edit.'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  -- 0b. fixture (só nesta transação): a marca de catálogo com mais produtos da nike e três produtos de outra marca
  SELECT b.id, b.name INTO v_xid, v_xnome
  FROM products p JOIN brands b ON b.id = p.brand_id
  WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND btrim(coalesce(b.name, '')) <> ''
  GROUP BY b.id, b.name ORDER BY count(*) DESC, b.id LIMIT 1;
  IF v_xid IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 0b — a nike não tem produtos com marca de catálogo.'; END IF;
  v_xvar := CASE WHEN btrim(v_xnome) = lower(btrim(v_xnome)) THEN upper(btrim(v_xnome)) ELSE lower(btrim(v_xnome)) END;
  SELECT count(*) INTO v_xn0 FROM products p LEFT JOIN brands b ON b.id = p.brand_id
   WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
     AND lower(btrim(coalesce(b.name, p.marca_livre, ''))) = lower(btrim(v_xnome));
  SELECT array_agg(x.id ORDER BY x.created_at, x.id) INTO v_ids FROM (
    SELECT p.id, p.created_at FROM products p
    WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
      AND p.brand_id IS DISTINCT FROM v_xid
      AND lower(btrim(coalesce(p.marca_livre, ''))) <> lower(btrim(v_xnome))
    ORDER BY p.created_at, p.id LIMIT 3) x;
  IF coalesce(array_length(v_ids, 1), 0) < 3 THEN RAISE EXCEPTION 'FALHOU: passo 0b — a nike precisa de 3 produtos de outra marca para a fixture.'; END IF;
  -- o gatilho trg_cat_produto_tabelas liga marca_livre a uma marca de catálogo (fn_cat_marca) e estragaria a fixture; só estes 3 UPDATE
  -- correm sem gatilhos (session_replication_role, só nesta transação), e logo a seguir volta ao normal
  SET LOCAL session_replication_role = replica;
  UPDATE products SET brand_id = NULL, marca_livre = v_xvar WHERE id = v_ids[1] AND organization_id = c_nike;
  UPDATE products SET brand_id = NULL, marca_livre = 'ZZ Marca Livre Teste', category_id = NULL, subcategory_id = NULL WHERE id = v_ids[2] AND organization_id = c_nike;
  UPDATE products SET brand_id = NULL, marca_livre = NULL WHERE id = v_ids[3] AND organization_id = c_nike;
  SET LOCAL session_replication_role = origin;

  -- 1. overload, permissões e contrato
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'cat_ler_marcas_do_filtro' AND pronamespace = 'public'::regnamespace) <> 1 THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — há mais de uma cat_ler_marcas_do_filtro.';
  END IF;
  IF has_function_privilege('anon', 'public.cat_ler_marcas_do_filtro(uuid,text,uuid,uuid,uuid,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_ler_marcas_do_filtro(uuid,text,uuid,uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — permissões de execução erradas (anon não, authenticated sim).';
  END IF;
  v_j := public.cat_ler_marcas_do_filtro(c_nike);
  SELECT string_agg(k, ',' ORDER BY k) INTO v_chaves FROM jsonb_object_keys(v_j) k;
  IF v_chaves IS DISTINCT FROM 'marcas,sem_marca,total' THEN RAISE EXCEPTION 'FALHOU: passo 1 — chaves inesperadas: %', v_chaves; END IF;
  IF jsonb_typeof(v_j -> 'marcas') <> 'array' OR jsonb_typeof(v_j -> 'sem_marca') <> 'number' OR jsonb_typeof(v_j -> 'total') <> 'number' THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — tipos errados em marcas/sem_marca/total.';
  END IF;
  IF jsonb_array_length(v_j -> 'marcas') = 0 THEN RAISE EXCEPTION 'FALHOU: passo 1 — a nike não tem nenhuma marca nos produtos (teste sem dados).'; END IF;
  FOR r IN SELECT e FROM jsonb_array_elements(v_j -> 'marcas') e LOOP
    IF (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(r.e) k) IS DISTINCT FROM 'id,marca,n'
       OR jsonb_typeof(r.e -> 'n') <> 'number' OR coalesce(btrim(r.e ->> 'marca'), '') = ''
       OR jsonb_typeof(r.e -> 'id') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'FALHOU: passo 1 — entrada de marca mal formada: %', r.e;
    END IF;
  END LOOP;
  -- ordem: nome sem acentos nem maiúsculas, crescente
  v_prev := NULL;
  FOR r IN SELECT lower(extensions.unaccent('extensions.unaccent'::regdictionary, e ->> 'marca')) AS ch
           FROM jsonb_array_elements(v_j -> 'marcas') WITH ORDINALITY t(e, o) ORDER BY o LOOP
    IF v_prev IS NOT NULL AND r.ch < v_prev THEN
      RAISE EXCEPTION 'FALHOU: passo 1 — fora de ordem: % depois de %.', r.ch, v_prev;
    END IF;
    v_prev := r.ch;
  END LOOP;

  -- 2. sem filtros: contra a contagem direta (e contra a lista)
  SELECT coalesce(sum((e ->> 'n')::bigint), 0) INTO v_soma FROM jsonb_array_elements(v_j -> 'marcas') e;
  SELECT count(*) INTO v_dir FROM products p LEFT JOIN brands b ON b.id = p.brand_id
   WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND nullif(btrim(coalesce(b.name, p.marca_livre, '')), '') IS NULL;
  IF (v_j ->> 'sem_marca')::bigint <> v_dir OR v_dir < 1 THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — sem_marca % <> contagem direta % (ou nenhum produto sem marca).', v_j ->> 'sem_marca', v_dir;
  END IF;
  SELECT count(*) INTO v_dir FROM products p WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted;
  IF (v_j ->> 'total')::bigint <> v_dir THEN RAISE EXCEPTION 'FALHOU: passo 2 — total % <> contagem direta %.', v_j ->> 'total', v_dir; END IF;
  IF v_soma + (v_j ->> 'sem_marca')::bigint <> v_dir THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — soma de n (%) + sem_marca (%) <> contagem direta de produtos (%).', v_soma, v_j ->> 'sem_marca', v_dir;
  END IF;
  -- a fusão: a marca de catálogo X e a marca livre com outra grafia são UMA entrada, com o nome e o id de X e n = antes + 1
  SELECT e INTO v_e FROM jsonb_array_elements(v_j -> 'marcas') e WHERE lower(e ->> 'marca') = lower(btrim(v_xnome));
  IF v_e IS NULL OR (v_e ->> 'marca') <> btrim(v_xnome) OR (v_e ->> 'id')::uuid IS DISTINCT FROM v_xid OR (v_e ->> 'n')::integer <> v_xn0 + 1 THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — fusão de maiúsculas: esperado {id %, marca %, n %}, veio %.', v_xid, btrim(v_xnome), v_xn0 + 1, v_e;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v_j -> 'marcas') e WHERE lower(e ->> 'marca') = lower(v_xvar)) <> 1 THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — a grafia % ficou como entrada separada.', v_xvar;
  END IF;
  -- a marca livre (C) existe como entrada sem id
  SELECT e INTO v_e FROM jsonb_array_elements(v_j -> 'marcas') e WHERE e ->> 'marca' = 'ZZ Marca Livre Teste';
  IF v_e IS NULL OR jsonb_typeof(v_e -> 'id') <> 'null' OR (v_e ->> 'n')::integer <> 1 THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — a marca livre devia vir com id null e n = 1 (veio %).', v_e;
  END IF;
  v_l := public.cat_ler_produtos_pagina(p_org => c_nike, p_limite => 1);
  IF (v_l ->> 'total')::bigint <> (v_j ->> 'total')::bigint THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — total da lista % <> total das marcas %.', v_l ->> 'total', v_j ->> 'total';
  END IF;

  -- a marca mais frequente (para o passo 4), e a subcategoria, a categoria e o modelo mais povoados (passo 3)
  SELECT e ->> 'marca' INTO v_marca FROM jsonb_array_elements(v_j -> 'marcas') e ORDER BY (e ->> 'n')::int DESC, e ->> 'marca' LIMIT 1;
  SELECT p.subcategory_id, s.parent_id INTO v_sub, v_cat
  FROM products p JOIN product_categories s ON s.id = p.subcategory_id
  WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND s.parent_id IS NOT NULL
  GROUP BY p.subcategory_id, s.parent_id ORDER BY count(*) DESC, p.subcategory_id LIMIT 1;
  SELECT p.model_id INTO v_mod
  FROM products p JOIN product_models pm ON pm.id = p.model_id AND pm.deleted_at IS NULL
  WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
  GROUP BY p.model_id ORDER BY count(*) DESC, p.model_id LIMIT 1;
  -- fixture de modelo (a nike não tinha nenhum): um modelo na subcategoria mais povoada e dois produtos dessa subcategoria nele
  IF v_mod IS NULL THEN
    INSERT INTO product_models (organization_id, subcategory_id, name, numero, created_by)
    VALUES (c_nike, v_sub, 'Modelo Teste Marcas', (SELECT coalesce(max(m.numero), 0) + 1 FROM product_models m WHERE m.subcategory_id = v_sub), public.current_business_user_id())
    RETURNING id INTO v_mod;
    UPDATE products SET model_id = v_mod
    WHERE id IN (SELECT p.id FROM products p WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
                   AND p.subcategory_id = v_sub ORDER BY p.created_at, p.id LIMIT 2);
  END IF;
  IF v_mod IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 3 — sem modelo mesmo depois da fixture.'; END IF;
  IF v_sub IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 3 — a nike não tem produtos com subcategoria e categoria-mãe.'; END IF;

  -- 3 a 5. cada caso: o conjunto é o da lista
  FOR v_caso IN
    SELECT * FROM (VALUES
      ('categoria',    NULL::text, v_cat,       NULL::uuid, NULL::uuid, false),
      ('subcategoria', NULL::text, NULL::uuid,  v_sub,      NULL::uuid, false),
      ('cat+sub',      NULL::text, v_cat,       v_sub,      NULL::uuid, false),
      ('modelo',       NULL::text, NULL::uuid,  NULL::uuid, v_mod,      false),
      ('pesquisa',     v_marca,    NULL::uuid,  NULL::uuid, NULL::uuid, false),
      ('pesq+sub',     v_marca,    NULL::uuid,  v_sub,      NULL::uuid, false),
      ('sem categoria', NULL::text, NULL::uuid, NULL::uuid, NULL::uuid, true)
    ) AS t(nome, q, cat, sub, modelo, semcat)
  LOOP
    v_m := public.cat_ler_marcas_do_filtro(c_nike, v_caso.q, v_caso.cat, v_caso.sub, v_caso.modelo, v_caso.semcat);
    v_l := public.cat_ler_produtos_pagina(c_nike, v_caso.q, v_caso.cat, v_caso.sub, v_caso.modelo, NULL, v_caso.semcat, 1, 1);
    SELECT coalesce(sum((e ->> 'n')::bigint), 0) INTO v_soma FROM jsonb_array_elements(v_m -> 'marcas') e;
    IF (v_m ->> 'total')::bigint < 1 OR jsonb_array_length(v_m -> 'marcas') < 1 THEN
      RAISE EXCEPTION 'FALHOU: caso % — o conjunto está vazio (total %, % marcas): a nike não tem dados para este caso.', v_caso.nome, v_m ->> 'total', jsonb_array_length(v_m -> 'marcas');
    END IF;
    -- entradas únicas por lower(marca) e cada id aponta para a marca com esse nome
    SELECT count(DISTINCT lower(e ->> 'marca')) INTO v_nm FROM jsonb_array_elements(v_m -> 'marcas') e;
    IF v_nm <> jsonb_array_length(v_m -> 'marcas') THEN
      RAISE EXCEPTION 'FALHOU: caso % — % entradas mas só % marcas distintas (ignorando maiúsculas).', v_caso.nome, jsonb_array_length(v_m -> 'marcas'), v_nm;
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_m -> 'marcas') e
               WHERE jsonb_typeof(e -> 'id') = 'string'
                 AND NOT EXISTS (SELECT 1 FROM brands b WHERE b.id = (e ->> 'id')::uuid AND lower(btrim(b.name)) = lower(e ->> 'marca'))) THEN
      RAISE EXCEPTION 'FALHOU: caso % — um id não aponta para uma marca com o mesmo nome.', v_caso.nome;
    END IF;
    IF (v_m ->> 'total')::bigint <> (v_l ->> 'total')::bigint THEN
      RAISE EXCEPTION 'FALHOU: caso % — total das marcas % <> total da lista %.', v_caso.nome, v_m ->> 'total', v_l ->> 'total';
    END IF;
    -- TODAS as marcas devolvidas: o total da lista com essa marca é n (cada n conferido à parte; por isso a soma abaixo é uma prova real)
    v_n := 0;
    FOR r IN SELECT e ->> 'marca' AS marca, (e ->> 'n')::bigint AS n
             FROM jsonb_array_elements(v_m -> 'marcas') WITH ORDINALITY t(e, o) ORDER BY o LOOP
      v_l := public.cat_ler_produtos_pagina(c_nike, v_caso.q, v_caso.cat, v_caso.sub, v_caso.modelo, r.marca, v_caso.semcat, 1, 1);
      IF (v_l ->> 'total')::bigint <> r.n OR r.n < 1 THEN
        RAISE EXCEPTION 'FALHOU: caso % — marca «%»: n=% e a lista com essa marca dá %.', v_caso.nome, r.marca, r.n, v_l ->> 'total';
      END IF;
      v_n := v_n + 1;
    END LOOP;
    IF v_soma + (v_m ->> 'sem_marca')::bigint <> (v_m ->> 'total')::bigint THEN
      RAISE EXCEPTION 'FALHOU: caso % — soma de n (%) + sem_marca (%) <> total (%).', v_caso.nome, v_soma, v_m ->> 'sem_marca', v_m ->> 'total';
    END IF;
    v_marcas_cmp := v_marcas_cmp + v_n;
    v_casos := v_casos + 1;
  END LOOP;

  -- 6. recusa: um utilizador sem papel na nike (1 recusa, CT001)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.cat_ler_marcas_do_filtro(c_nike);
  EXCEPTION WHEN SQLSTATE 'CT001' THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'FALHOU: passo 6 — um utilizador sem permissão não foi recusado com CT001.'; END IF;

  RAISE NOTICE 'OK: % marcas sem filtros; % casos de filtros iguais à lista; % marcas conferidas uma a uma com cat_ler_produtos_pagina; CT001 sem permissão.',
    jsonb_array_length(v_j -> 'marcas'), v_casos, v_marcas_cmp;
END $t$;

ROLLBACK;
