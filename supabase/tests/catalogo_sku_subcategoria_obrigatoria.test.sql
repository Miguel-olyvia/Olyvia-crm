-- ============================================================
-- Testes: 20270118200000_catalogo_sku_subcategoria_obrigatoria.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 118200000 (falha no passo 0: a versão antiga de fn_cat_sku_partes não dá a falta
-- «subcategoria» e gera «CAT-0001-…» sem ela); depois do push termina com «OK: …». Qualquer falha: 'FALHOU: …'.
--
-- Tudo dentro de BEGIN … ROLLBACK. Escritas só na nike (b6ffce4f-f630-4933-833a-008649757a33): uma categoria de
-- teste com duas subcategorias (siglas aleatórias Q + 4 letras, livres na nike) e 4 produtos de teste, pelas funções
-- do Catálogo. Nenhuma outra organização é escrita nem lida. Nenhuma chamada recusada de propósito.
-- Sessão emprestada (role authenticated, auth.uid() pelas claims): membro activo da nike, não system admin, com
-- products.edit e services.view.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_sku_subcategoria_obrigatoria.test.sql
--
-- O que PROVA:
--   0. fn_cat_sku_partes sem categoria nem subcategoria → faltam as duas e não há prefixo (a versão antiga falha aqui)
--   1. Produto só com categoria: cat_gerar_sku_produto não gera (gerado=false, faltas ["subcategoria"], motivo
--      "faltas"), o SKU provisório fica e sku_gerado continua false; cat_prever_sku → sku null, faltas ["subcategoria"]
--   2. Com categoria + subcategoria gera CAT-SUB-NNNN, e o NNNN é por par: S1 e S2 da mesma categoria começam ambas
--      em 0001; um segundo produto em S1 dá 0002; a pré-visualização em S2 mostra 0002; o produto do passo 1, ao
--      receber S2, gera 0002 de S2
-- ============================================================

BEGIN;

-- ─── 0. A migration está aplicada? (comportamento, não texto) ────────────────
DO $t$
DECLARE r jsonb;
BEGIN
  IF to_regprocedure('public.fn_cat_sku_partes(uuid,uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: fn_cat_sku_partes não existe (aplicar 20270118000000 e 20270118200000).';
  END IF;
  r := public.fn_cat_sku_partes(gen_random_uuid(), NULL, NULL, '[]'::jsonb);
  IF r -> 'faltas' IS DISTINCT FROM '["categoria", "subcategoria"]'::jsonb OR r -> 'prefixo' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: sem subcategoria não falta "subcategoria" (versão antiga; aplicar 20270118200000) → %', r;
  END IF;
END $t$;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  c_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_auth uuid; v_suf text; v_sa text; v_s1 text; v_s2 text; v_i integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = c_org) THEN RAISE EXCEPTION 'FALHOU (fixture): a nike não existe nesta base'; END IF;
  PERFORM set_config('app.audit_source', 'teste:catalogo_sku_subcategoria_obrigatoria', true);

  SELECT u.auth_user_id INTO v_auth
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'services.view', c_org)
    AND NOT public.is_system_admin_user(u.auth_user_id)
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU (fixture): sem membro activo da nike (não system admin) com products.edit e services.view'; END IF;

  -- siglas aleatórias (só letras); a de topo livre na nike e sem nenhum SKU com esse prefixo
  LOOP
    v_i := v_i + 1;
    v_suf := translate(upper(md5(random()::text || clock_timestamp()::text)), '0123456789', 'GHIJKLMNOP');
    v_sa := 'Q' || substr(v_suf, 1, 4); v_s1 := 'Q' || substr(v_suf, 5, 4); v_s2 := 'Q' || substr(v_suf, 9, 4);
    EXIT WHEN v_s1 <> v_s2
      AND NOT EXISTS (SELECT 1 FROM product_categories c WHERE c.organization_id = c_org AND c.parent_id IS NULL
                      AND c.deleted_at IS NULL AND c.sigla = v_sa)
      AND NOT EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND p.sku LIKE v_sa || '-%');
    IF v_i >= 20 THEN RAISE EXCEPTION 'FALHOU (fixture): sem siglas de teste livres ao fim de 20 tentativas'; END IF;
  END LOOP;

  PERFORM set_config('teste.org', c_org::text, true);
  PERFORM set_config('teste.suf', substr(v_suf, 13, 6), true);
  PERFORM set_config('teste.sa', v_sa, true);
  PERFORM set_config('teste.s1', v_s1, true);
  PERFORM set_config('teste.s2', v_s2, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
END $fx$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_suf text := current_setting('teste.suf');
  v_sa text := current_setting('teste.sa'); v_s1 text := current_setting('teste.s1'); v_s2 text := current_setting('teste.s2');
  n_t text := 'Topo SubObrig T' || v_suf; n_s1 text := 'Sub Um T' || v_suf; n_s2 text := 'Sub Dois T' || v_suf;
  v_t uuid; v_c1 uuid; v_c2 uuid; v_pc uuid; v_pa uuid; v_pb uuid; v_pd uuid; v_prov text; r jsonb;
BEGIN
  v_t := (public.cat_guardar_categoria_produto(v_org, NULL, NULL, n_t) -> 'categoria' ->> 'id')::uuid;
  v_c1 := (public.cat_guardar_categoria_produto(v_org, NULL, v_t, n_s1) -> 'categoria' ->> 'id')::uuid;
  v_c2 := (public.cat_guardar_categoria_produto(v_org, NULL, v_t, n_s2) -> 'categoria' ->> 'id')::uuid;
  PERFORM public.cat_guardar_sigla_categoria(v_org, v_t, v_sa);
  PERFORM public.cat_guardar_sigla_categoria(v_org, v_c1, v_s1);
  PERFORM public.cat_guardar_sigla_categoria(v_org, v_c2, v_s2);

  -- ─── 1. Só categoria: não gera, o provisório fica ───
  v_pc := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SubObrig C ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_pc, NULL, NULL, n_t, NULL);
  v_prov := (SELECT p.sku FROM products p WHERE p.id = v_pc);
  r := public.cat_gerar_sku_produto(v_org, v_pc);
  IF (r -> 'gerado') IS DISTINCT FROM 'false'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["subcategoria"]'::jsonb
     OR r ->> 'motivo' IS DISTINCT FROM 'faltas' OR r ->> 'sku' IS DISTINCT FROM v_prov THEN
    RAISE EXCEPTION 'FALHOU: sem subcategoria gerou (ou a resposta não é a esperada) → %', r;
  END IF;
  IF v_prov IS NULL OR v_prov !~ '^CAT-[0-9A-F]{10}$' OR (SELECT p.sku FROM products p WHERE p.id = v_pc) IS DISTINCT FROM v_prov
     OR (SELECT p.sku_gerado FROM products p WHERE p.id = v_pc) IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU: sem subcategoria o SKU do produto mudou (% → %)', v_prov, (SELECT p.sku FROM products p WHERE p.id = v_pc);
  END IF;
  r := public.cat_prever_sku(v_org, v_t, NULL, '[]'::jsonb);
  IF r -> 'sku' IS DISTINCT FROM 'null'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["subcategoria"]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: pré-visualização sem subcategoria → %', r;
  END IF;

  -- ─── 2. Categoria + subcategoria: o número é por par ───
  v_pa := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SubObrig A ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_pa, NULL, NULL, n_t, n_s1);
  r := public.cat_gerar_sku_produto(v_org, v_pa);
  IF r ->> 'sku' IS DISTINCT FROM v_sa || '-' || v_s1 || '-0001' OR (r -> 'gerado') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: categoria + S1 → % (esperado %)', r, v_sa || '-' || v_s1 || '-0001';
  END IF;

  v_pb := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SubObrig B ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_pb, NULL, NULL, n_t, n_s2);
  r := public.cat_gerar_sku_produto(v_org, v_pb);
  IF r ->> 'sku' IS DISTINCT FROM v_sa || '-' || v_s2 || '-0001' OR (r -> 'gerado') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: S2 da mesma categoria não começou em 0001 → % (esperado %)', r, v_sa || '-' || v_s2 || '-0001';
  END IF;

  v_pd := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste SubObrig D ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_pd, NULL, NULL, n_t, n_s1);
  r := public.cat_gerar_sku_produto(v_org, v_pd);
  IF r ->> 'sku' IS DISTINCT FROM v_sa || '-' || v_s1 || '-0002' THEN
    RAISE EXCEPTION 'FALHOU: segundo produto em S1 → % (esperado %)', r, v_sa || '-' || v_s1 || '-0002';
  END IF;

  r := public.cat_prever_sku(v_org, v_t, v_c2, '[]'::jsonb);
  IF r ->> 'sku' IS DISTINCT FROM v_sa || '-' || v_s2 || '-0002' OR r -> 'faltas' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: pré-visualização em S2 → % (esperado %)', r, v_sa || '-' || v_s2 || '-0002';
  END IF;

  -- o produto do passo 1 recebe S2: passa a gerar, com o seguinte de S2
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_pc, NULL, NULL, n_t, n_s2);
  r := public.cat_gerar_sku_produto(v_org, v_pc);
  IF r ->> 'sku' IS DISTINCT FROM v_sa || '-' || v_s2 || '-0002' OR (r -> 'gerado') IS DISTINCT FROM 'true'::jsonb
     OR (SELECT p.sku_gerado FROM products p WHERE p.id = v_pc) IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: depois de receber S2 → % (esperado %)', r, v_sa || '-' || v_s2 || '-0002';
  END IF;
END $t$;
RESET ROLE;

SELECT 'OK: sem subcategoria não gera (falta "subcategoria", provisório e sku_gerado intactos) nem se prevê; com categoria + subcategoria gera, e o número é por par (S1 0001 e 0002, S2 0001, prever S2 0002, o produto sem sub ao receber S2 → 0002).' AS resultado;

ROLLBACK;
