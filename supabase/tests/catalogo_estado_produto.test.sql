-- ============================================================
-- Testes: 20270120900000_catalogo_estado_produto.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 20270120900000 (falha no passo 0: há produtos da Mudelar sem preço de venda que não
-- estão em rascunho); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- Tudo dentro de BEGIN … ROLLBACK: nada fica. As escritas são só num produto da nike
-- (b6ffce4f-f630-4933-833a-008649757a33), com as claims de um membro ativo da nike com products.edit e services.view,
-- só nesta transação. A Mudelar (3242e925-da26-459a-8258-be04d904e355) só se lê (contagens).
-- Recusas provocadas de propósito: 2 (um estado inválido → CT002; um produto inexistente → CT003), apanhadas no próprio
-- bloco (não ficam como erro no registo do Postgres).
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_estado_produto.test.sql
--
-- O que PROVA:
--   0. Nenhum produto vivo da Mudelar sem preço de venda (retail inexistente, NULL ou <= 0, o mais recente) fora de
--      rascunho.
--   1. cat_definir_estado_produto(uuid,uuid,text) existe, anon não a executa, authenticated sim; as leituras
--      cat_ler_produtos_pagina e cat_ler_produtos_tabelas devolvem o estado.
--   2. Num produto da nike: grava discontinued (is_active false), draft e active (is_active true), devolve
--      { ok, id, estado, ativo, alterado }; repetir o mesmo estado dá alterado = false; um estado inválido dá CT002 e
--      não muda nada; um produto inexistente dá CT003; a página e a ficha devolvem o estado gravado.
--   3. Mudelar: a correção não mexeu em is_active (nenhum produto vivo da Mudelar com is_active = false); a auditoria
--      tem linhas da fonte da migration. Contagens por categoria em NOTICE.
-- O que NÃO cobre: o ecrã.
-- ============================================================

BEGIN;

-- ─── 0. A correção foi aplicada? ─────────────────────────────────────────────
DO $t0$
DECLARE v_n bigint; v_txt text;
BEGIN
  SELECT count(*), string_agg(DISTINCT coalesce(c.name, '(sem categoria)'), ', ') INTO v_n, v_txt
  FROM products p
  LEFT JOIN product_categories s ON s.id = p.subcategory_id
  LEFT JOIN product_categories c ON c.id = coalesce(p.category_id, s.parent_id)
  WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted AND p.deleted_at IS NULL
    AND p.status <> 'draft'::public.product_status
    AND coalesce((SELECT coalesce(pp.preco_exato, pp.price) FROM product_prices pp
                  WHERE pp.product_id = p.id AND pp.price_type = 'retail'
                  ORDER BY pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id LIMIT 1), 0) <= 0;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'FALHOU: passo 0 — a Mudelar tem % produtos sem preço de venda fora de rascunho (%) (aplicar 20270120900000).', v_n, v_txt;
  END IF;
END $t0$;

-- ─── 1 a 3 ──────────────────────────────────────────────────────────────────
DO $t$
DECLARE
  c_nike   constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_mud    constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_fonte  constant text := 'migration:catalogo_estado_produto';
  v_auth uuid; v_prod uuid; v_sku text; v_r jsonb; v_e text; v_st text; v_at boolean; v_n bigint; v_txt text;
  v_estado text; r record;
BEGIN
  -- 1. função, permissões e leituras
  IF to_regprocedure('public.cat_definir_estado_produto(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — falta cat_definir_estado_produto(uuid,uuid,text).';
  END IF;
  IF has_function_privilege('anon', 'public.cat_definir_estado_produto(uuid,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cat_definir_estado_produto(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: passo 1 — permissões de execução erradas (anon não, authenticated sim).';
  END IF;

  -- 2. um membro ativo da nike com products.edit e services.view; um produto do Catálogo da nike
  FOR r IN SELECT u.auth_user_id
           FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
           WHERE m.organization_id = c_nike AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
           ORDER BY m.created_at, u.id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text, true);
    IF public.fn_cat_pode(c_nike, 'products.edit') AND public.fn_cat_pode(c_nike, 'services.view') THEN
      v_auth := r.auth_user_id; EXIT;
    END IF;
  END LOOP;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 2 — nenhum membro ativo da nike com products.edit e services.view.'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  SELECT p.id, p.sku INTO v_prod, v_sku FROM products p
  WHERE p.organization_id = c_nike AND p.tipo_catalogo = 'produto' AND NOT p.is_deleted AND p.deleted_at IS NULL
    AND coalesce(btrim(p.sku), '') <> ''
  ORDER BY p.id LIMIT 1;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'FALHOU: passo 2 — a nike não tem produto do Catálogo.'; END IF;

  FOREACH v_e IN ARRAY ARRAY['discontinued', 'draft', 'active'] LOOP
    v_r := public.cat_definir_estado_produto(c_nike, v_prod, v_e);
    SELECT p.status::text, p.is_active INTO v_st, v_at FROM products p WHERE p.id = v_prod;
    IF v_st <> v_e OR v_at IS DISTINCT FROM (v_e <> 'discontinued') THEN
      RAISE EXCEPTION 'FALHOU: passo 2 — gravar % deixou status % e is_active %.', v_e, v_st, v_at;
    END IF;
    IF NOT (v_r @> jsonb_build_object('ok', true, 'id', v_prod, 'estado', v_e, 'ativo', v_e <> 'discontinued')) OR NOT (v_r ? 'alterado') THEN
      RAISE EXCEPTION 'FALHOU: passo 2 — retorno inesperado ao gravar %: %', v_e, v_r;
    END IF;

    -- a página e a ficha devolvem o estado gravado
    SELECT x->>'estado' INTO v_estado
    FROM jsonb_array_elements(public.cat_ler_produtos_pagina(c_nike, v_sku, NULL, NULL, NULL, NULL, false, 200, 1)->'produtos') x
    WHERE x->>'id' = v_prod::text;
    IF v_estado IS DISTINCT FROM v_e THEN
      RAISE EXCEPTION 'FALHOU: passo 2 — cat_ler_produtos_pagina devolve estado % em vez de %.', v_estado, v_e;
    END IF;
    SELECT x->>'estado' INTO v_estado
    FROM jsonb_array_elements(public.cat_ler_produtos_tabelas(c_nike)->'produtos') x
    WHERE x->>'id' = v_prod::text;
    IF v_estado IS DISTINCT FROM v_e THEN
      RAISE EXCEPTION 'FALHOU: passo 2 — cat_ler_produtos_tabelas devolve estado % em vez de %.', v_estado, v_e;
    END IF;
  END LOOP;

  -- repetir o mesmo estado: não escreve
  v_r := public.cat_definir_estado_produto(c_nike, v_prod, 'active');
  IF (v_r->>'alterado')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU: passo 2 — repetir o estado devia dar alterado = false: %', v_r;
  END IF;

  -- estado inválido → CT002, sem mudar nada
  BEGIN
    PERFORM public.cat_definir_estado_produto(c_nike, v_prod, 'arquivado');
    RAISE EXCEPTION 'FALHOU: passo 2 — o estado inválido foi aceite.';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  SELECT p.status::text, p.is_active INTO v_st, v_at FROM products p WHERE p.id = v_prod;
  IF v_st <> 'active' OR NOT v_at THEN RAISE EXCEPTION 'FALHOU: passo 2 — o estado inválido mudou o produto (%, %).', v_st, v_at; END IF;

  -- produto inexistente → CT003
  BEGIN
    PERFORM public.cat_definir_estado_produto(c_nike, gen_random_uuid(), 'draft');
    RAISE EXCEPTION 'FALHOU: passo 2 — o produto inexistente foi aceite.';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL;
  END;

  -- 3. Mudelar: só leitura
  SELECT count(*) INTO v_n FROM products p
  WHERE p.organization_id = c_mud AND NOT p.is_deleted AND p.deleted_at IS NULL AND NOT coalesce(p.is_active, false);
  IF v_n > 0 THEN RAISE EXCEPTION 'FALHOU: passo 3 — % produtos da Mudelar com is_active = false.', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM entity_audit_log e WHERE e.organization_id = c_mud AND e.table_name = 'products' AND e.source = c_fonte) THEN
    RAISE EXCEPTION 'FALHOU: passo 3 — a auditoria não tem linhas da fonte %.', c_fonte;
  END IF;

  SELECT string_agg(format('%s: %s produtos, %s em rascunho, %s ativos, %s descontinuados', categoria, n, n_d, n_a, n_x), E'\n' ORDER BY categoria)
  INTO v_txt
  FROM (SELECT coalesce(c.name, '(sem categoria)') AS categoria, count(*) n,
               count(*) FILTER (WHERE p.status = 'draft') n_d, count(*) FILTER (WHERE p.status = 'active') n_a,
               count(*) FILTER (WHERE p.status = 'discontinued') n_x
        FROM products p
        LEFT JOIN product_categories s ON s.id = p.subcategory_id
        LEFT JOIN product_categories c ON c.id = coalesce(p.category_id, s.parent_id)
        WHERE p.organization_id = c_mud AND NOT p.is_deleted AND p.deleted_at IS NULL
        GROUP BY 1) z;
  RAISE NOTICE 'Mudelar por categoria:%', E'\n' || coalesce(v_txt, '(sem produtos)');

  RAISE NOTICE 'OK: estado gravado (discontinued, draft, active) num produto da nike, CT002 e CT003 recusados, leituras com estado, Mudelar sem produtos sem preço fora de rascunho.';
END $t$;

-- resultado (só chega aqui se tudo passou) e as contagens da Mudelar por categoria
SELECT 'OK' AS resultado, coalesce(c.name, '(sem categoria)') AS categoria, count(*) AS produtos,
       count(*) FILTER (WHERE p.status = 'draft') AS rascunho, count(*) FILTER (WHERE p.status = 'active') AS ativo,
       count(*) FILTER (WHERE p.status = 'discontinued') AS descontinuado,
       count(*) FILTER (WHERE p.status <> 'draft' AND coalesce((SELECT coalesce(pp.preco_exato, pp.price) FROM product_prices pp
                         WHERE pp.product_id = p.id AND pp.price_type = 'retail'
                         ORDER BY pp.valid_from DESC NULLS LAST, pp.created_at DESC, pp.id LIMIT 1), 0) <= 0) AS sem_preco_fora_de_rascunho
FROM products p
LEFT JOIN product_categories s ON s.id = p.subcategory_id
LEFT JOIN product_categories c ON c.id = coalesce(p.category_id, s.parent_id)
WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND NOT p.is_deleted AND p.deleted_at IS NULL
GROUP BY 2 ORDER BY 2;

ROLLBACK;
