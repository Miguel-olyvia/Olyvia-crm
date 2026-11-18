-- ============================================================
-- Testes: 20270122100000_catalogo_contagens_sem_preco.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 20270122100000 (falha no passo 0: a função ainda não devolve sem_preco); depois
-- do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- Tudo dentro de BEGIN … ROLLBACK: nada fica. Só a nike (b6ffce4f-f630-4933-833a-008649757a33); este teste não lê
-- mais nenhuma organização. As escritas (passos 3 e 4) são só na nike, com as claims de um membro ativo da nike com
-- products.edit e services.view, só nesta transação (um produto; e products.edit dado ao papel teste_inventario da
-- nike, de onde se retira services.view, para o passo 4, como em catalogo_pesquisa_produtos_servico.test.sql).
-- Recusas provocadas de propósito: 1 (um utilizador sem membership → recusado), apanhada no próprio bloco.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_contagens_sem_preco.test.sql
-- O ensaio (migration + teste na mesma transação) concatena: BEGIN; <migration>; <este ficheiro sem BEGIN/ROLLBACK>; ROLLBACK.
--
-- O que PROVA:
--   0. A função devolve a chave sem_preco.
--   1. As chaves são as 7 de sempre mais sem_preco, e sem_preco é um inteiro; só existe uma função com este nome.
--   2. Na nike: sem_preco bate com uma contagem direta (retail mais recente inexistente, NULL ou <= 0, produtos vivos
--      tipo produto); as restantes chaves batem com o que se recalcula à mão (total, sem_marca, sem_categoria,
--      sem_referencia) e, se existir o instantâneo pg_temp.contagens_antes (tirado pelo ensaio antes da migration),
--      são idênticas às de antes; com p_marca, sem_preco conta só essa marca (mesma regra que sem_marca).
--   2b. O painel coincide com a lista: sem_preco = produtos com pvp null em todas as páginas de cat_ler_produtos_pagina
--      (utilizador com services.view).
--   3. Numa transação: pôr a 0 o preço de venda de um produto com preço → +1; apagar-lhe os preços retail → continua
--      +1; apagá-lo (is_deleted) → volta ao valor inicial.
--   4. Sem services.view (só products.edit): sem_preco é null e as outras chaves continuam a vir.
--   5. Quem não é membro é recusado.
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A função já devolve sem_preco? ───────────────────────────────────────
DO $t0$
DECLARE
  c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_auth uuid; r record; v_j jsonb;
BEGIN
  FOR r IN SELECT u.auth_user_id
           FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
           WHERE m.organization_id = c_nike AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
           ORDER BY m.created_at, u.id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text, true);
    IF public.fn_cat_pode(c_nike, 'products.edit') THEN v_auth := r.auth_user_id; EXIT; END IF;
  END LOOP;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 0 — nenhum membro ativo da nike com products.edit.'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  v_j := public.cat_ler_produtos_contagens(c_nike);
  IF NOT (v_j ? 'sem_preco') THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — cat_ler_produtos_contagens ainda não devolve sem_preco (aplicar 20270122100000).';
  END IF;
END $t0$;

-- ─── 1 a 5 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_auth uuid; v_so uuid; v_rol uuid; r record; v_pag jsonb; v_pg integer; v_np bigint := 0; v_pgs integer; v_j jsonb; v_j2 jsonb; v_ant jsonb; v_chaves text;
  v_n bigint; v_n0 integer; v_marca text; v_prod uuid; v_falhou boolean := false;
  c_preco constant text := $q$coalesce((SELECT coalesce(pp.preco_exato, pp.price) FROM product_prices pp
                  WHERE pp.product_id = p.id AND pp.price_type = 'retail'
                  ORDER BY pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id LIMIT 1), 0) <= 0$q$;
BEGIN
  -- claims de um membro da nike
  FOR r IN SELECT u.auth_user_id
           FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
           WHERE m.organization_id = c_nike AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
           ORDER BY m.created_at, u.id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text, true);
    IF public.fn_cat_pode(c_nike, 'products.edit') THEN v_auth := r.auth_user_id; EXIT; END IF;
  END LOOP;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 1 — nenhum membro da nike com products.edit.'; END IF;

  -- 1. contrato e overload
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'cat_ler_produtos_contagens' AND pronamespace = 'public'::regnamespace) <> 1 THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — há mais de uma cat_ler_produtos_contagens.';
  END IF;
  IF has_function_privilege('anon', 'public.cat_ler_produtos_contagens(uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_ler_produtos_contagens(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — permissões de execução erradas (anon não, authenticated sim).';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  v_j := public.cat_ler_produtos_contagens(c_nike);
  SELECT string_agg(k, ',' ORDER BY k) INTO v_chaves FROM jsonb_object_keys(v_j) k;
  IF v_chaves IS DISTINCT FROM 'por_categoria,por_modelo,por_subcategoria,sem_categoria,sem_marca,sem_preco,sem_referencia,total' THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — chaves inesperadas: %', v_chaves;
  END IF;
  IF jsonb_typeof(v_j -> 'sem_preco') <> 'number' THEN RAISE EXCEPTION 'FALHOU: passo 1 — sem_preco não é um número.'; END IF;

  -- 2. nike: bate com a contagem direta
  EXECUTE format($f$SELECT count(*) FROM products p WHERE p.organization_id = %L AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND %s$f$, c_nike, c_preco) INTO v_n;
  IF (v_j ->> 'sem_preco')::bigint <> v_n THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — sem_preco na nike é % e a contagem direta % .', v_j ->> 'sem_preco', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted;
  IF (v_j ->> 'total')::bigint <> v_n THEN RAISE EXCEPTION 'FALHOU: passo 2 — total % <> contagem direta %.', v_j ->> 'total', v_n; END IF;
  SELECT count(*) INTO v_n FROM products p LEFT JOIN brands b ON b.id = p.brand_id
   WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND nullif(btrim(coalesce(b.name, p.marca_livre, '')), '') IS NULL;
  IF (v_j ->> 'sem_marca')::bigint <> v_n THEN RAISE EXCEPTION 'FALHOU: passo 2 — sem_marca % <> contagem direta %.', v_j ->> 'sem_marca', v_n; END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
     AND p.category_id IS NULL AND p.subcategory_id IS NULL;
  IF (v_j ->> 'sem_categoria')::bigint <> v_n THEN RAISE EXCEPTION 'FALHOU: passo 2 — sem_categoria % <> contagem direta %.', v_j ->> 'sem_categoria', v_n; END IF;
  SELECT count(*) INTO v_n FROM products p WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
     AND (btrim(coalesce(p.sku, '')) = '' OR p.sku ~ '^CAT-[0-9A-F]{10}$');
  IF (v_j ->> 'sem_referencia')::bigint <> v_n THEN RAISE EXCEPTION 'FALHOU: passo 2 — sem_referencia % <> contagem direta %.', v_j ->> 'sem_referencia', v_n; END IF;
  -- as outras chaves iguais às de antes (instantâneo do ensaio, se existir)
  IF to_regclass('pg_temp.contagens_antes') IS NOT NULL THEN
    EXECUTE 'SELECT j FROM pg_temp.contagens_antes LIMIT 1' INTO v_ant;
    IF (v_j - 'sem_preco') IS DISTINCT FROM v_ant THEN
      RAISE EXCEPTION 'FALHOU: passo 2 — as outras chaves mudaram face ao instantâneo anterior.';
    END IF;
  END IF;
  -- com marca: só essa marca (a mesma regra que sem_marca)
  SELECT lower(nullif(btrim(coalesce(b.name, p.marca_livre, '')), '')) INTO v_marca
  FROM products p LEFT JOIN brands b ON b.id = p.brand_id
  WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
    AND nullif(btrim(coalesce(b.name, p.marca_livre, '')), '') IS NOT NULL
  GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1;
  IF v_marca IS NOT NULL THEN
    v_j2 := public.cat_ler_produtos_contagens(c_nike, NULL, v_marca);
    EXECUTE format($f$SELECT count(*) FROM products p LEFT JOIN brands b ON b.id = p.brand_id
      WHERE p.organization_id = %L AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
        AND lower(btrim(coalesce(b.name, p.marca_livre, ''))) = %L AND %s$f$, c_nike, v_marca, c_preco) INTO v_n;
    IF (v_j2 ->> 'sem_preco')::bigint <> v_n THEN
      RAISE EXCEPTION 'FALHOU: passo 2 — sem_preco com a marca % é % e a contagem direta %.', v_marca, v_j2 ->> 'sem_preco', v_n;
    END IF;
    IF (v_j2 ->> 'sem_preco')::bigint > (v_j ->> 'sem_preco')::bigint THEN
      RAISE EXCEPTION 'FALHOU: passo 2 — sem_preco com marca maior do que sem marca.';
    END IF;
  END IF;

  -- 2b. o painel coincide com a lista: produtos com pvp null em todas as páginas (utilizador com services.view)
  v_pg := 1; v_pgs := 1;
  WHILE v_pg <= v_pgs LOOP
    v_pag := public.cat_ler_produtos_pagina(p_org => c_nike, p_limite => 200, p_pagina => v_pg);
    IF NOT coalesce((v_pag ->> 've_valores')::boolean, false) THEN RAISE EXCEPTION 'FALHOU: passo 2b — a lista não devolveu valores.'; END IF;
    v_pgs := greatest((v_pag ->> 'paginas')::integer, 1);
    v_np := v_np + (SELECT count(*) FROM jsonb_array_elements(v_pag -> 'produtos') e WHERE jsonb_typeof(e -> 'pvp') IS DISTINCT FROM 'number');
    v_pg := v_pg + 1;
  END LOOP;
  IF v_np <> (v_j ->> 'sem_preco')::bigint THEN
    RAISE EXCEPTION 'FALHOU: passo 2b — a lista tem % produtos sem pvp e o painel diz %.', v_np, v_j ->> 'sem_preco';
  END IF;

  -- 3. transação: um produto da nike com preço de venda > 0
  v_n0 := (v_j ->> 'sem_preco')::integer;
  SELECT p.id INTO v_prod FROM products p
  WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted
    AND NOT (coalesce((SELECT coalesce(pp.preco_exato, pp.price) FROM product_prices pp WHERE pp.product_id = p.id AND pp.price_type = 'retail'
                       ORDER BY pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id LIMIT 1), 0) <= 0)
  ORDER BY p.created_at, p.id LIMIT 1;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 3 — a nike não tem nenhum produto com preço de venda.'; END IF;
  UPDATE product_prices pp SET price = 0, preco_exato = 0
  WHERE pp.id = (SELECT x.id FROM product_prices x WHERE x.product_id = v_prod AND x.price_type = 'retail'
                 ORDER BY x.valid_from DESC NULLS LAST, x.created_at DESC, x.id LIMIT 1);
  IF (public.cat_ler_produtos_contagens(c_nike) ->> 'sem_preco')::integer <> v_n0 + 1 THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — preço a 0 deveria dar +1 (era %).', v_n0;
  END IF;
  DELETE FROM product_prices WHERE product_id = v_prod AND price_type = 'retail';
  IF (public.cat_ler_produtos_contagens(c_nike) ->> 'sem_preco')::integer <> v_n0 + 1 THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — sem preços retail deveria continuar +1.';
  END IF;
  UPDATE products SET is_deleted = true WHERE id = v_prod AND organization_id = c_nike;
  IF (public.cat_ler_produtos_contagens(c_nike) ->> 'sem_preco')::integer <> v_n0 THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — um produto apagado não conta (esperado %).', v_n0;
  END IF;

  -- 4. sem services.view (só products.edit): products.edit dado ao papel teste_inventario da nike só nesta transação
  SELECT r2.id INTO v_rol FROM anew_roles r2 WHERE r2.organization_id = c_nike AND r2.code = 'teste_inventario' AND r2.is_system IS NOT TRUE;
  SELECT u.auth_user_id INTO v_so FROM anew_memberships am JOIN anew_users u ON u.id = am.user_id
    WHERE am.role_id = v_rol AND am.organization_id = c_nike AND am.status = 'active' AND am.role_is_client IS NOT TRUE
      AND u.auth_user_id IS NOT NULL AND NOT public.is_system_admin_user(u.auth_user_id)
    ORDER BY am.created_at, am.id LIMIT 1;
  IF v_so IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 4 — sem membro no papel teste_inventario da nike'; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO anew_role_permissions (role_id, permission_code, created_by) VALUES (v_rol, 'products.edit', NULL)
    ON CONFLICT (role_id, permission_code) DO NOTHING;
  DELETE FROM anew_role_permissions WHERE role_id = v_rol AND permission_code = 'services.view';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_so, 'role', 'authenticated')::text, true);
  IF NOT public.fn_cat_pode(c_nike, 'products.edit') THEN RAISE EXCEPTION 'FALHOU: passo 4 — o membro de corte não ficou com products.edit.'; END IF;
  IF public.fn_cat_pode(c_nike, 'services.view') THEN RAISE EXCEPTION 'FALHOU: passo 4 — a fixture ainda tem services.view.'; END IF;
  v_j2 := public.cat_ler_produtos_contagens(c_nike);
  IF NOT (v_j2 ? 'sem_preco') OR jsonb_typeof(v_j2 -> 'sem_preco') <> 'null' THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — sem services.view, sem_preco devia ser null e veio %.', v_j2 -> 'sem_preco';
  END IF;
  IF jsonb_typeof(v_j2 -> 'total') <> 'number' OR jsonb_typeof(v_j2 -> 'sem_marca') <> 'number' THEN
    RAISE EXCEPTION 'FALHOU: passo 4 — as outras chaves deviam continuar a vir.';
  END IF;
  PERFORM set_config('test.sem_sv', 'off', true);

  -- 5. recusa: um utilizador sem membership na nike (1 recusa)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.cat_ler_produtos_contagens(c_nike);
  EXCEPTION WHEN OTHERS THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'FALHOU: passo 5 — um utilizador sem membership leu as contagens.'; END IF;

  RAISE NOTICE 'OK: sem_preco devolvido, igual à contagem direta e à lista (nike), null sem services.view, outras chaves intactas, recusa mantida.';
END $t$;

ROLLBACK;
