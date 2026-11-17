-- ============================================================
-- Testes: 20270122000000_catalogo_pesquisa_produtos_servico.sql (base RH)
-- ============================================================
-- Tudo dentro de BEGIN … ROLLBACK, só na nike. A única escrita é a do perfil de corte (products.edit sem services.view):
-- acrescenta products.edit ao papel teste_inventario da nike, e o ROLLBACK desfaz.
-- As leituras correm como membros reais da nike (role authenticated, auth.uid() pelas claims).
--   0. as duas funções existem (antes da migration este passo falha: é o vermelho)
--   1. SECURITY DEFINER, STABLE, search_path public, pg_temp; anon e PUBLIC sem EXECUTE; authenticated com EXECUTE
--   2. cat_pesquisar_produtos, como admin de sistema e como membro com services.view:
--      a. filtro por serviço: o serviço da nike com mais produtos; todas as páginas juntas = os produtos com esse servico_id
--         (lidos como postgres), cada linha com servico_id = o serviço e fator_servico = o do produto; total e paginas certos
--      b. igualdade com cat_ler_produtos_pagina sem filtro (páginas 1 e 2), com p_q e com p_categoria: o envelope igual e,
--         tirando servico_id e fator_servico, as linhas iguais e pela mesma ordem
--      c. pesquisa com o serviço: os ids = os de cat_ler_produtos_pagina(p_q) (todas as páginas) com esse servico_id
--   3. corte: um membro com products.edit sem services.view: ve_valores false, custo/pvp/grossista/distribuidor null,
--      e as linhas iguais às de cat_ler_produtos_pagina para o mesmo membro
--   4. cat_ler_produtos_tabelas_servicos, por identidade (admin; services.view; técnico com e sem negocios.obra.materiais):
--      as chaves iguais às de cat_ler_produtos_tabelas; categoriasProduto, marcas, unidades e exige iguais;
--      produtos = os de cat_ler_produtos_tabelas filtrados aos produtos dos consumos dos serviços do catálogo (145)
--   5. recusas (4, todas CT001): utilizador sem nada e sem sessão, nas duas funções
-- Correr sozinho (vermelho antes da migration):
--   supabase db query --linked -f supabase/tests/catalogo_pesquisa_produtos_servico.test.sql
-- Ensaio (verde): BEGIN; <migration>; <este ficheiro>; ROLLBACK;
-- ============================================================

BEGIN;

CREATE FUNCTION pg_temp.ordenado(j jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN jsonb_typeof(j) = 'array'
    THEN (SELECT coalesce(jsonb_agg(e ORDER BY e::text), '[]'::jsonb) FROM jsonb_array_elements(j) e) ELSE j END
$f$;

-- as linhas sem os dois campos novos, pela mesma ordem
CREATE FUNCTION pg_temp.sem_novos(j jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT coalesce(jsonb_agg(x.e - 'servico_id' - 'fator_servico' ORDER BY x.o), '[]'::jsonb)
  FROM jsonb_array_elements(j) WITH ORDINALITY AS x(e, o)
$f$;

-- o envelope sem produtos
CREATE FUNCTION pg_temp.envelope(j jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT j - 'produtos'
$f$;

CREATE TEMP TABLE _res (passo text, detalhe text) ON COMMIT DROP;

DO $t$
DECLARE
  c_org   constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_fp    constant text := 'public.cat_pesquisar_produtos(uuid,text,uuid,uuid,uuid,integer,integer)';
  c_ft    constant text := 'public.cat_ler_produtos_tabelas_servicos(uuid)';
  c_falso constant uuid := '00000000-0000-4000-8000-0000000c0122';
  v_f     text;
  v_cfg   text[]; v_secdef boolean; v_vol "char";
  v_admin uuid; v_svu uuid; v_tm uuid; v_t uuid; v_pe uuid; v_rol uuid;
  v_ids   uuid[]; v_tipo text[];
  v_u     uuid; v_i int; v_pag int;
  v_sv boolean; v_tec boolean; v_mat boolean;
  v_srv   uuid; v_n int; v_cat uuid; v_q text;
  v_esp   uuid[]; v_esp2 uuid[]; v_got uuid[];
  r jsonb; o jsonb; v_k text;
  v_cons  uuid[];
  v_state text; v_recusas int := 0;
BEGIN
  -- 0. as duas funções existem
  IF to_regprocedure(c_fp) IS NULL OR to_regprocedure(c_ft) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: passo 0 - cat_pesquisar_produtos (%) ou cat_ler_produtos_tabelas_servicos (%) não existe',
      to_regprocedure(c_fp) IS NOT NULL, to_regprocedure(c_ft) IS NOT NULL;
  END IF;
  INSERT INTO _res VALUES ('0 existem', 'ok');

  -- 1. segurança
  FOREACH v_f IN ARRAY ARRAY[c_fp, c_ft] LOOP
    SELECT p.prosecdef, p.proconfig, p.provolatile INTO v_secdef, v_cfg, v_vol FROM pg_proc p WHERE p.oid = to_regprocedure(v_f);
    IF NOT v_secdef THEN RAISE EXCEPTION 'FALHOU: 1 - % não é SECURITY DEFINER', v_f; END IF;
    IF v_vol::text <> 's' THEN RAISE EXCEPTION 'FALHOU: 1 - % não é STABLE (%)', v_f, v_vol::text; END IF;
    IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE replace(c, ' ', '') IN ('search_path=public,pg_temp', 'search_path="public","pg_temp"', 'search_path=public,"pg_temp"')) THEN
      RAISE EXCEPTION 'FALHOU: 1 - % search_path (%)', v_f, v_cfg;
    END IF;
    IF has_function_privilege('anon', v_f, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: 1 - anon com EXECUTE em %', v_f; END IF;
    IF NOT has_function_privilege('authenticated', v_f, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: 1 - authenticated sem EXECUTE em %', v_f; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = to_regprocedure(v_f) AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHOU: 1 - PUBLIC com EXECUTE em %', v_f;
    END IF;
  END LOOP;
  INSERT INTO _res VALUES ('1 seguranca', 'ok');

  -- identidades: o admin de sistema e, entre os membros ativos da nike (não admin), um com services.view,
  -- um técnico com negocios.obra.materiais e um sem
  SELECT au.auth_user_id INTO v_admin FROM anew_users au JOIN anew_memberships am ON am.user_id = au.id AND am.status = 'active'
    JOIN anew_roles ar ON ar.id = am.role_id
    WHERE ar.code = 'system_admin' AND ar.is_system AND ar.organization_id IS NULL AND ar.deleted_at IS NULL AND au.auth_user_id IS NOT NULL
    ORDER BY au.created_at LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'FALHOU: sem admin de sistema para testar'; END IF;
  FOR v_u IN SELECT DISTINCT au.auth_user_id FROM anew_memberships am JOIN anew_users au ON au.id = am.user_id
             WHERE am.organization_id = c_org AND am.status = 'active' AND au.auth_user_id IS NOT NULL AND au.auth_user_id <> v_admin
             ORDER BY 1 LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
    CONTINUE WHEN public.is_system_admin_user(v_u);
    v_sv := public.fn_cat_pode(c_org, 'services.view');
    v_tec := public.fn_neg_so_execucao(c_org, 'services.view');
    IF NOT v_tec AND NOT v_sv THEN
      v_tec := public.fn_cat_pode(c_org, 'pessoas.view')
        OR EXISTS (SELECT 1 FROM anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(c_org, ap.code));
    END IF;
    v_mat := NOT v_tec OR public.fn_cat_pode(c_org, 'negocios.obra.materiais');
    IF v_svu IS NULL AND NOT v_tec AND v_sv THEN v_svu := v_u;
    ELSIF v_tm IS NULL AND v_tec AND v_mat THEN v_tm := v_u;
    ELSIF v_t IS NULL AND v_tec AND NOT v_mat THEN v_t := v_u;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_svu IS NULL THEN RAISE EXCEPTION 'FALHOU: sem membro da nike com services.view'; END IF;

  -- o serviço da nike com mais produtos (lido como postgres), uma categoria de um desses produtos e um termo de pesquisa
  SELECT p.servico_id, count(*) INTO v_srv, v_n FROM products p
    WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND p.servico_id IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1;
  IF v_srv IS NULL OR v_n < 2 THEN RAISE EXCEPTION 'FALHOU: 2 - a nike não tem um serviço com produtos ligados'; END IF;
  v_esp := ARRAY(SELECT p.id FROM products p WHERE p.organization_id = c_org AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
                 AND p.servico_id = v_srv ORDER BY p.id);

  -- 2. cat_pesquisar_produtos, como admin e como membro com services.view
  v_ids := ARRAY[v_admin, v_svu]; v_tipo := ARRAY['admin', 'services.view'];
  FOR v_i IN 1 .. 2 LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ids[v_i], 'role', 'authenticated')::text, true);

    -- 2a. o filtro por serviço, todas as páginas
    v_got := '{}'; v_pag := 1;
    LOOP
      r := public.cat_pesquisar_produtos(c_org, p_servico => v_srv, p_pagina => v_pag, p_limite => 200);
      IF (r ->> 'total')::int <> v_n OR (r ->> 'paginas')::int <> ceil(v_n / 200.0)::int OR (r ->> 'pagina')::int <> v_pag
         OR (r ->> 'limite')::int <> 200 OR (r ->> 've_valores')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'FALHOU: 2a (%) - envelope errado: % (esperado total %)', v_tipo[v_i], pg_temp.envelope(r), v_n;
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'produtos') e WHERE (e ->> 'servico_id')::uuid IS DISTINCT FROM v_srv) THEN
        RAISE EXCEPTION 'FALHOU: 2a (%) - veio um produto de outro serviço', v_tipo[v_i];
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'produtos') e JOIN products p ON p.id = (e ->> 'id')::uuid
                 WHERE NOT (e ? 'fator_servico') OR (e ->> 'fator_servico')::numeric IS DISTINCT FROM p.fator_servico) THEN
        RAISE EXCEPTION 'FALHOU: 2a (%) - fator_servico diferente do do produto', v_tipo[v_i];
      END IF;
      v_got := v_got || ARRAY(SELECT (e ->> 'id')::uuid FROM jsonb_array_elements(r -> 'produtos') e);
      EXIT WHEN v_pag >= (r ->> 'paginas')::int;
      v_pag := v_pag + 1;
    END LOOP;
    IF ARRAY(SELECT x FROM unnest(v_got) x ORDER BY x) IS DISTINCT FROM v_esp THEN
      RAISE EXCEPTION 'FALHOU: 2a (%) - os produtos do serviço não batem (% de %)', v_tipo[v_i], cardinality(v_got), v_n;
    END IF;
    INSERT INTO _res VALUES ('2a ' || v_tipo[v_i], format('serviço %s: %s produtos em %s páginas, todos com o servico_id e o fator do produto', v_srv, v_n, v_pag));

    -- 2b. igualdade com cat_ler_produtos_pagina: sem filtro (páginas 1 e 2), com p_q, com p_categoria
    FOR v_pag IN 1 .. 2 LOOP
      r := public.cat_pesquisar_produtos(c_org, p_pagina => v_pag, p_limite => 200);
      o := public.cat_ler_produtos_pagina(c_org, p_limite => 200, p_pagina => v_pag);
      IF pg_temp.envelope(r) IS DISTINCT FROM pg_temp.envelope(o) OR pg_temp.sem_novos(r -> 'produtos') IS DISTINCT FROM (o -> 'produtos') THEN
        RAISE EXCEPTION 'FALHOU: 2b (%) - página % difere de cat_ler_produtos_pagina', v_tipo[v_i], v_pag;
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'produtos') e JOIN products p ON p.id = (e ->> 'id')::uuid
                 WHERE NOT (e ? 'servico_id') OR (e ->> 'servico_id')::uuid IS DISTINCT FROM p.servico_id
                    OR (e ->> 'fator_servico')::numeric IS DISTINCT FROM p.fator_servico) THEN
        RAISE EXCEPTION 'FALHOU: 2b (%) - servico_id ou fator_servico diferente do produto (página %)', v_tipo[v_i], v_pag;
      END IF;
    END LOOP;
    -- uma categoria de topo de um produto do serviço e um termo (a marca, ou a primeira palavra do nome)
    SELECT coalesce(p.category_id, s.parent_id), lower(coalesce(nullif(b.name, ''), nullif(p.marca_livre, ''), split_part(p.name, ' ', 1)))
      INTO v_cat, v_q
      FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN product_categories s ON s.id = p.subcategory_id
      WHERE p.id = v_esp[1];
    r := public.cat_pesquisar_produtos(c_org, p_q => v_q, p_limite => 200);
    o := public.cat_ler_produtos_pagina(c_org, p_q => v_q, p_limite => 200);
    IF pg_temp.envelope(r) IS DISTINCT FROM pg_temp.envelope(o) OR pg_temp.sem_novos(r -> 'produtos') IS DISTINCT FROM (o -> 'produtos') THEN
      RAISE EXCEPTION 'FALHOU: 2b (%) - pesquisa «%» difere de cat_ler_produtos_pagina', v_tipo[v_i], v_q;
    END IF;
    IF v_cat IS NOT NULL THEN
      r := public.cat_pesquisar_produtos(c_org, p_categoria => v_cat, p_limite => 200);
      o := public.cat_ler_produtos_pagina(c_org, p_categoria => v_cat, p_limite => 200);
      IF pg_temp.envelope(r) IS DISTINCT FROM pg_temp.envelope(o) OR pg_temp.sem_novos(r -> 'produtos') IS DISTINCT FROM (o -> 'produtos') THEN
        RAISE EXCEPTION 'FALHOU: 2b (%) - categoria % difere de cat_ler_produtos_pagina', v_tipo[v_i], v_cat;
      END IF;
    END IF;
    INSERT INTO _res VALUES ('2b ' || v_tipo[v_i], format('iguais a cat_ler_produtos_pagina: páginas 1-2, pesquisa «%s», categoria %s (%s produtos)',
      v_q, v_cat, (r ->> 'total')));

    -- 2c. a pesquisa com o serviço = cat_ler_produtos_pagina(p_q), todas as páginas, com esse servico_id
    v_got := '{}'; v_pag := 1;
    LOOP
      o := public.cat_ler_produtos_pagina(c_org, p_q => v_q, p_limite => 200, p_pagina => v_pag);
      v_got := v_got || ARRAY(SELECT (e ->> 'id')::uuid FROM jsonb_array_elements(o -> 'produtos') e
                              JOIN products p ON p.id = (e ->> 'id')::uuid WHERE p.servico_id = v_srv);
      EXIT WHEN v_pag >= (o ->> 'paginas')::int OR v_pag >= 20;
      v_pag := v_pag + 1;
    END LOOP;
    IF v_pag >= 20 AND v_pag < (o ->> 'paginas')::int THEN RAISE EXCEPTION 'FALHOU: 2c - o termo «%» é largo demais para comparar', v_q; END IF;
    v_esp2 := '{}'; v_pag := 1;
    LOOP
      r := public.cat_pesquisar_produtos(c_org, p_q => v_q, p_servico => v_srv, p_pagina => v_pag, p_limite => 200);
      v_esp2 := v_esp2 || ARRAY(SELECT (e ->> 'id')::uuid FROM jsonb_array_elements(r -> 'produtos') e);
      EXIT WHEN v_pag >= (r ->> 'paginas')::int;
      v_pag := v_pag + 1;
    END LOOP;
    IF ARRAY(SELECT x FROM unnest(v_esp2) x ORDER BY 1) IS DISTINCT FROM ARRAY(SELECT x FROM unnest(v_got) x ORDER BY 1)
       OR (r ->> 'total')::int <> cardinality(v_got) OR cardinality(v_got) = 0 THEN
      RAISE EXCEPTION 'FALHOU: 2c (%) - pesquisa «%» com o serviço: % produtos (esperados %)', v_tipo[v_i], v_q, r ->> 'total', cardinality(v_got);
    END IF;
    INSERT INTO _res VALUES ('2c ' || v_tipo[v_i], format('pesquisa «%s» com o serviço: %s produtos, os de cat_ler_produtos_pagina com esse servico_id', v_q, r ->> 'total'));
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);

  -- 3. corte: products.edit sem services.view (products.edit dado ao papel teste_inventario da nike só nesta transação)
  SELECT r2.id INTO v_rol FROM anew_roles r2 WHERE r2.organization_id = c_org AND r2.code = 'teste_inventario' AND r2.is_system IS NOT TRUE;
  SELECT u.auth_user_id INTO v_pe FROM anew_memberships am JOIN anew_users u ON u.id = am.user_id
    WHERE am.role_id = v_rol AND am.organization_id = c_org AND am.status = 'active' AND am.role_is_client IS NOT TRUE
      AND u.auth_user_id IS NOT NULL AND NOT public.is_system_admin_user(u.auth_user_id)
    ORDER BY am.created_at, am.id LIMIT 1;
  IF v_pe IS NULL THEN RAISE EXCEPTION 'FALHOU: 3 - sem membro no papel teste_inventario da nike'; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO anew_role_permissions (role_id, permission_code, created_by) VALUES (v_rol, 'products.edit', NULL)
    ON CONFLICT (role_id, permission_code) DO NOTHING;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pe, 'role', 'authenticated')::text, true);
  IF NOT public.fn_cat_pode(c_org, 'products.edit') OR public.fn_cat_pode(c_org, 'services.view') THEN
    RAISE EXCEPTION 'FALHOU: 3 - o membro de corte não ficou com products.edit sem services.view';
  END IF;
  r := public.cat_pesquisar_produtos(c_org, p_servico => v_srv, p_limite => 200);
  IF (r ->> 've_valores')::boolean IS NOT FALSE OR (r ->> 'total')::int <> v_n
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'produtos') e
                WHERE e -> 'custo' <> 'null'::jsonb OR e -> 'pvp' <> 'null'::jsonb
                   OR e -> 'grossista' <> 'null'::jsonb OR e -> 'distribuidor' <> 'null'::jsonb) THEN
    RAISE EXCEPTION 'FALHOU: 3 - sem services.view vieram custos ou preços (ve_valores %)', r ->> 've_valores';
  END IF;
  r := public.cat_pesquisar_produtos(c_org, p_limite => 200);
  o := public.cat_ler_produtos_pagina(c_org, p_limite => 200);
  IF pg_temp.envelope(r) IS DISTINCT FROM pg_temp.envelope(o) OR pg_temp.sem_novos(r -> 'produtos') IS DISTINCT FROM (o -> 'produtos') THEN
    RAISE EXCEPTION 'FALHOU: 3 - sem services.view difere de cat_ler_produtos_pagina';
  END IF;
  -- o admin vê valores nos mesmos produtos do serviço (para o corte provar alguma coisa)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  r := public.cat_pesquisar_produtos(c_org, p_servico => v_srv, p_limite => 200);
  INSERT INTO _res VALUES ('3 corte', format('products.edit sem services.view: ve_valores false, custos e preços null; o admin vê %s linhas com custo ou pvp',
    (SELECT count(*) FROM jsonb_array_elements(r -> 'produtos') e WHERE e -> 'custo' <> 'null'::jsonb OR e -> 'pvp' <> 'null'::jsonb)));
  PERFORM set_config('request.jwt.claims', '', true);

  -- 4. cat_ler_produtos_tabelas_servicos por identidade
  v_cons := ARRAY(SELECT DISTINCT m.product_id FROM service_materials m JOIN services sv ON sv.id = m.service_id
                  JOIN products p ON p.id = m.product_id AND p.organization_id = c_org AND p.tipo_catalogo IS NOT NULL AND NOT p.is_deleted
                  WHERE sv.organization_id = c_org AND sv.no_catalogo AND NOT sv.is_deleted AND m.deleted_at IS NULL);
  IF cardinality(v_cons) = 0 THEN RAISE EXCEPTION 'FALHOU: 4 - sem consumos na nike: o teste não prova nada'; END IF;
  v_ids := ARRAY[v_admin, v_svu]; v_tipo := ARRAY['admin', 'services.view'];
  IF v_tm IS NOT NULL THEN v_ids := v_ids || v_tm; v_tipo := v_tipo || 'tecnico+materiais'::text; END IF;
  IF v_t IS NOT NULL THEN v_ids := v_ids || v_t; v_tipo := v_tipo || 'tecnico'::text; END IF;
  FOR v_i IN 1 .. cardinality(v_ids) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ids[v_i], 'role', 'authenticated')::text, true);
    o := public.cat_ler_produtos_tabelas(c_org);
    r := public.cat_ler_produtos_tabelas_servicos(c_org);
    IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(o) k) IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r) k) THEN
      RAISE EXCEPTION 'FALHOU: 4 (%) - as chaves diferem de cat_ler_produtos_tabelas', v_tipo[v_i];
    END IF;
    FOR v_k IN SELECT jsonb_object_keys(o) LOOP
      CONTINUE WHEN v_k = 'produtos';
      IF pg_temp.ordenado(o -> v_k) IS DISTINCT FROM pg_temp.ordenado(r -> v_k) THEN
        RAISE EXCEPTION 'FALHOU: 4 (%) - a chave % difere de cat_ler_produtos_tabelas', v_tipo[v_i], v_k;
      END IF;
    END LOOP;
    IF pg_temp.ordenado(r -> 'produtos') IS DISTINCT FROM
       (SELECT coalesce(jsonb_agg(e ORDER BY e::text), '[]'::jsonb) FROM jsonb_array_elements(o -> 'produtos') e WHERE (e ->> 'id')::uuid = ANY (v_cons)) THEN
      RAISE EXCEPTION 'FALHOU: 4 (%) - produtos não são os de cat_ler_produtos_tabelas filtrados aos consumos (% de %)',
        v_tipo[v_i], jsonb_array_length(r -> 'produtos'), cardinality(v_cons);
    END IF;
    IF v_tipo[v_i] IN ('admin', 'services.view') AND jsonb_array_length(r -> 'produtos') <> cardinality(v_cons) THEN
      RAISE EXCEPTION 'FALHOU: 4 (%) - % produtos, esperados os % dos consumos', v_tipo[v_i], jsonb_array_length(r -> 'produtos'), cardinality(v_cons);
    END IF;
    INSERT INTO _res VALUES ('4 ' || v_tipo[v_i], format('produtos %s de %s; categoriasProduto %s, marcas %s, unidades %s, exige %s iguais',
      jsonb_array_length(r -> 'produtos'), jsonb_array_length(o -> 'produtos'), jsonb_array_length(r -> 'categoriasProduto'),
      jsonb_array_length(r -> 'marcas'), jsonb_array_length(r -> 'unidades'), jsonb_array_length(r -> 'exige')));
  END LOOP;
  IF v_tm IS NULL OR v_t IS NULL THEN
    INSERT INTO _res VALUES ('4 aviso', format('técnico com materiais %s, técnico sem materiais %s', v_tm IS NOT NULL, v_t IS NOT NULL));
  END IF;

  -- 5. recusas (4): utilizador sem nada e sem sessão, nas duas funções
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_falso, 'role', 'authenticated')::text, true);
  BEGIN PERFORM public.cat_pesquisar_produtos(c_org); v_state := 'sem erro';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_recusas := v_recusas + 1; END;
  IF v_state <> 'CT001' THEN RAISE EXCEPTION 'FALHOU: 5 - cat_pesquisar_produtos sem permissão deu %', v_state; END IF;
  BEGIN PERFORM public.cat_ler_produtos_tabelas_servicos(c_org); v_state := 'sem erro';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_recusas := v_recusas + 1; END;
  IF v_state <> 'CT001' THEN RAISE EXCEPTION 'FALHOU: 5 - cat_ler_produtos_tabelas_servicos sem permissão deu %', v_state; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN PERFORM public.cat_pesquisar_produtos(c_org); v_state := 'sem erro';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_recusas := v_recusas + 1; END;
  IF v_state <> 'CT001' THEN RAISE EXCEPTION 'FALHOU: 5 - cat_pesquisar_produtos sem sessão deu %', v_state; END IF;
  BEGIN PERFORM public.cat_ler_produtos_tabelas_servicos(c_org); v_state := 'sem erro';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_recusas := v_recusas + 1; END;
  IF v_state <> 'CT001' THEN RAISE EXCEPTION 'FALHOU: 5 - cat_ler_produtos_tabelas_servicos sem sessão deu %', v_state; END IF;
  INSERT INTO _res VALUES ('5 recusas', v_recusas || ' recusas CT001');
END $t$;

SELECT passo, detalhe FROM _res ORDER BY passo;

ROLLBACK;
