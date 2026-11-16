-- ============================================================
-- Testes: 20270118300000_catalogo_modelos_e_sku_por_modelo.sql (base RH)
-- ============================================================
-- ORDEM: correr ANTES do db push da 118300000 (falha no passo 0: não há product_models nem cat_guardar_modelo);
-- depois do push termina com «OK: …» e a lista do que foi saltado. Qualquer falha: 'FALHOU: …'.
--
-- Tudo dentro de BEGIN … ROLLBACK. Escritas só na nike (b6ffce4f-f630-4933-833a-008649757a33): uma categoria de teste
-- com três subcategorias (siglas aleatórias Q + 4 letras, livres na nike), 3 atributos de teste (cor, textura, medida)
-- com opções, 8 modelos e 6 produtos de teste pelas funções do Catálogo; e, como postgres, um modelo com o número 9999
-- e 9999 modelos desativados numa subcategoria de teste (para o teto de 10000 vivos; inseridos com
-- app.audit_bypass e apagados logo a seguir). Nenhuma outra organização é escrita nem lida; as provas de isolamento
-- usam ids inventados (gen_random_uuid) → CT003. A BM24 (872abff2-043f-41e1-99dd-0a8e305ddecb) só aparece como p_org
-- para provar a recusa CT001. Não cria organizações.
-- Sessões emprestadas (role authenticated, auth.uid() pelas claims), membros activos da nike, não system admin:
--   editor   products.edit e services.view, fora da BM24
--   sem      sem products.edit
-- Chamadas recusadas de propósito: 31 (30 se a da BM24 for saltada) — ficam como erro no registo do Postgres:
--   CT001 x5 (4 sem products.edit + BM24), CT002 x15, CT003 x7, CT004 x2, 42501 x2.
--
-- Correr a partir do worktree rh-pessoas (supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/catalogo_modelos.test.sql
--
-- O que PROVA:
--   1. Modelos: automático 0001, 0002; fixado 7; o seguinte = 8; indicado e ocupado → CT004 (DETAIL = id); indicado
--      acima do maior + 100 → CT002; nome repetido (maiúsculas, espaços) → CT004 (DETAIL = id); o mesmo nome noutra
--      subcategoria recomeça em 1; renomear mantém o número; mudar número/subcategoria → CT002; 0, 10000, nome vazio,
--      categoria de topo, sem subcategoria → CT002; ids inventados → CT003; estados; leitura de gestão; RLS (lê; não
--      escreve; created_by não se lê). Com o 9999 ocupado, o automático dá o MENOR livre (3). Teto de 10000 vivos.
--   2. Ligar produto: outra subcategoria, desativado → CT002; ids inventados → CT003; NULL desliga
--   3. SKU: sem modelo não gera; SA-SB-0001-BL-PZ-70X70; duplicado (outro_produto, outro_apagado false); outra cor
--      0001; 0002; 0007; mudar de modelo regenera; desligar → não gera, o SKU fica; mudar de subcategoria LIMPA o
--      modelo (gatilho) e não gera; o gatilho recusa modelo de outra subcategoria e modelo apagado; duplicado de um
--      produto APAGADO → outro_apagado true e sem outro_produto
--   4. Pré-visualização: duplicado, próprio produto, outro modelo, modelo de outra subcategoria, cat_prever_sku sem
--      modelo, ordem das faltas, duplicado de apagado sem id; ids inventados → CT003; BM24 → CT001
--   5. CT001 sem products.edit (guardar, estado, ligar, gerar)
--   6. GRANTs, search_path, FK ON DELETE SET NULL, RLS só SELECT, SELECT por coluna sem created_by, gatilho do número
--
-- O que NÃO cobre: corridas entre sessões; o teto de 2000 ativos; o gatilho de products contra um modelo de OUTRA
-- organização (exigiria escrever noutra organização: coberto pela mesma condição que o de outra subcategoria);
-- a auditoria.
-- ============================================================

BEGIN;

-- ─── 0. A migration está aplicada? ───────────────────────────────────────────
DO $t$
BEGIN
  IF to_regclass('public.product_models') IS NULL
     OR to_regprocedure('public.cat_guardar_modelo(uuid,uuid,uuid,text,integer)') IS NULL
     OR to_regprocedure('public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: não há product_models / cat_guardar_modelo / cat_prever_sku_modelo (aplicar 20270118300000).';
  END IF;
END $t$;

-- ─── Fixtures (como postgres) ────────────────────────────────────────────────
DO $fx$
DECLARE
  c_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  c_bm24 constant uuid := '872abff2-043f-41e1-99dd-0a8e305ddecb';
  v_auth uuid; v_act uuid; v_sem uuid; r record; v_suf text; v_sa text; v_sb text; v_sc text; v_i integer := 0; v_salt text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM anew_organizations WHERE id = c_org) THEN RAISE EXCEPTION 'FALHOU (fixture): a nike não existe nesta base'; END IF;
  PERFORM set_config('app.audit_source', 'teste:catalogo_modelos', true);

  SELECT u.auth_user_id, u.id INTO v_auth, v_act
  FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
  WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'products.edit', c_org)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'services.view', c_org)
    AND NOT public.is_system_admin_user(u.auth_user_id)
    AND NOT EXISTS (SELECT 1 FROM anew_memberships mb WHERE mb.user_id = u.id AND mb.organization_id = c_bm24 AND mb.status = 'active')
  ORDER BY m.created_at, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU (fixture): sem membro activo da nike (não system admin, fora da BM24) com products.edit e services.view'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  IF public.fn_cat_pode(c_bm24, 'products.edit') THEN
    v_salt := v_salt || 'recusa BM24 (o editor tem products.edit lá); ';
    PERFORM set_config('teste.saltar_bm24', 'sim', true);
  END IF;

  FOR r IN SELECT u.auth_user_id
           FROM anew_memberships m JOIN anew_users u ON u.id = m.user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
           WHERE m.organization_id = c_org AND m.status = 'active' AND m.end_date IS NULL AND NOT coalesce(m.role_is_client, false)
             AND NOT public.is_system_admin_user(u.auth_user_id)
           ORDER BY m.created_at, u.id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text, true);
    IF NOT public.fn_cat_pode(c_org, 'products.edit') THEN v_sem := r.auth_user_id; EXIT; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_sem IS NULL THEN RAISE EXCEPTION 'FALHOU (fixture): sem membro activo da nike sem products.edit'; END IF;

  -- siglas aleatórias (só letras); a de topo livre na nike e sem nenhum SKU com esse prefixo
  LOOP
    v_i := v_i + 1;
    v_suf := translate(upper(md5(random()::text || clock_timestamp()::text)), '0123456789', 'GHIJKLMNOP');
    v_sa := 'Q' || substr(v_suf, 1, 4); v_sb := 'Q' || substr(v_suf, 5, 4); v_sc := 'Q' || substr(v_suf, 9, 4);
    EXIT WHEN v_sb <> v_sc
      AND NOT EXISTS (SELECT 1 FROM product_categories c WHERE c.organization_id = c_org AND c.parent_id IS NULL
                      AND c.deleted_at IS NULL AND c.sigla = v_sa)
      AND NOT EXISTS (SELECT 1 FROM products p WHERE p.organization_id = c_org AND p.sku LIKE v_sa || '-%');
    IF v_i >= 20 THEN RAISE EXCEPTION 'FALHOU (fixture): sem siglas de teste livres ao fim de 20 tentativas'; END IF;
  END LOOP;
  -- o teto de 10000 vivos só se prova se a nike não estiver já perto dele
  IF (SELECT count(*) FROM product_models pm WHERE pm.organization_id = c_org AND pm.deleted_at IS NULL) > 0 THEN
    v_salt := v_salt || '(a nike já tinha modelos: o teto de 10000 continua a ser provado, com margem); ';
  END IF;

  PERFORM set_config('teste.org', c_org::text, true);
  PERFORM set_config('teste.bm24', c_bm24::text, true);
  PERFORM set_config('teste.act', v_act::text, true);
  PERFORM set_config('teste.suf', substr(v_suf, 13, 6), true);
  PERFORM set_config('teste.sa', v_sa, true);
  PERFORM set_config('teste.sb', v_sb, true);
  PERFORM set_config('teste.sc', v_sc, true);
  PERFORM set_config('teste.saltados', v_salt, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_sem', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
END $fx$;

-- ─── Categorias, atributos e opções de teste (como editor) ───────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_suf text := current_setting('teste.suf');
  v_t uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid; v_cor uuid; v_tex uuid; v_med uuid; v_o text;
BEGIN
  v_t := (public.cat_guardar_categoria_produto(v_org, NULL, NULL, 'Topo Modelos T' || v_suf) -> 'categoria' ->> 'id')::uuid;
  v_s1 := (public.cat_guardar_categoria_produto(v_org, NULL, v_t, 'Bases Duche T' || v_suf) -> 'categoria' ->> 'id')::uuid;
  v_s2 := (public.cat_guardar_categoria_produto(v_org, NULL, v_t, 'Outra Sub T' || v_suf) -> 'categoria' ->> 'id')::uuid;
  v_s3 := (public.cat_guardar_categoria_produto(v_org, NULL, v_t, 'Teto Sub T' || v_suf) -> 'categoria' ->> 'id')::uuid;
  PERFORM public.cat_guardar_sigla_categoria(v_org, v_t, current_setting('teste.sa'));
  PERFORM public.cat_guardar_sigla_categoria(v_org, v_s1, current_setting('teste.sb'));
  PERFORM public.cat_guardar_sigla_categoria(v_org, v_s2, current_setting('teste.sc'));

  -- criados por esta ordem: a posição no SKU entre eles fica cor < textura < medida
  v_cor := (public.cat_guardar_atributo(v_org, NULL, 'Cor Mod T' || v_suf, 'lista', true) -> 'atributo' ->> 'id')::uuid;
  v_tex := (public.cat_guardar_atributo(v_org, NULL, 'Textura Mod T' || v_suf, 'lista', false) -> 'atributo' ->> 'id')::uuid;
  v_med := (public.cat_guardar_atributo(v_org, NULL, 'Medida Mod T' || v_suf, 'medida', false) -> 'atributo' ->> 'id')::uuid;

  v_o := public.cat_guardar_opcao(v_org, v_cor, 'Blanco', '#FFFFFF') -> 'opcao' ->> 'id';
  PERFORM public.cat_guardar_sigla_opcao(v_org, v_o::uuid, 'BL'); PERFORM set_config('teste.o_bl', v_o, true);
  v_o := public.cat_guardar_opcao(v_org, v_cor, 'Negro', '#000000') -> 'opcao' ->> 'id';
  PERFORM public.cat_guardar_sigla_opcao(v_org, v_o::uuid, 'NG'); PERFORM set_config('teste.o_ng', v_o, true);
  v_o := public.cat_guardar_opcao(v_org, v_tex, 'Pizarra', NULL) -> 'opcao' ->> 'id';
  PERFORM public.cat_guardar_sigla_opcao(v_org, v_o::uuid, 'PZ'); PERFORM set_config('teste.o_pz', v_o, true);

  PERFORM set_config('teste.t', v_t::text, true); PERFORM set_config('teste.s1', v_s1::text, true);
  PERFORM set_config('teste.s2', v_s2::text, true); PERFORM set_config('teste.s3', v_s3::text, true);
  PERFORM set_config('teste.n_t', 'Topo Modelos T' || v_suf, true);
  PERFORM set_config('teste.n_s1', 'Bases Duche T' || v_suf, true);
  PERFORM set_config('teste.n_s2', 'Outra Sub T' || v_suf, true);
  PERFORM set_config('teste.cor', v_cor::text, true); PERFORM set_config('teste.tex', v_tex::text, true);
  PERFORM set_config('teste.med', v_med::text, true);
END $t$;

-- ─── 1. Modelos ──────────────────────────────────────────────────────────────
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_suf text := current_setting('teste.suf');
  v_t uuid := current_setting('teste.t')::uuid; v_s1 uuid := current_setting('teste.s1')::uuid; v_s2 uuid := current_setting('teste.s2')::uuid;
  r jsonb; v_m1 uuid; v_m2 uuid; v_m7 uuid; v_m8 uuid; v_mx uuid; v_det text; v_msg text; v_e jsonb;
BEGIN
  r := public.cat_guardar_modelo(v_org, NULL, v_s1, 'Sorty T' || v_suf) -> 'modelo';
  v_m1 := (r ->> 'id')::uuid;
  IF (r ->> 'numero')::integer IS DISTINCT FROM 1 OR (r ->> 'subcategoria')::uuid IS DISTINCT FROM v_s1 OR (r -> 'ativo') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: primeiro modelo → % (esperado número 1)', r;
  END IF;
  r := public.cat_guardar_modelo(v_org, NULL, v_s1, 'Stone Plus T' || v_suf) -> 'modelo';
  v_m2 := (r ->> 'id')::uuid;
  IF (r ->> 'numero')::integer IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'FALHOU: segundo modelo → % (esperado 2)', r; END IF;
  r := public.cat_guardar_modelo(v_org, NULL, v_s1, 'Zeus T' || v_suf, 7) -> 'modelo';
  v_m7 := (r ->> 'id')::uuid;
  IF (r ->> 'numero')::integer IS DISTINCT FROM 7 THEN RAISE EXCEPTION 'FALHOU: número fixado → % (esperado 7)', r; END IF;
  r := public.cat_guardar_modelo(v_org, NULL, v_s1, 'Kios T' || v_suf) -> 'modelo';
  v_m8 := (r ->> 'id')::uuid;
  IF (r ->> 'numero')::integer IS DISTINCT FROM 8 THEN RAISE EXCEPTION 'FALHOU: depois do 7 → % (esperado 8)', r; END IF;

  -- [CT004] número indicado e ocupado, com o id
  BEGIN
    PERFORM public.cat_guardar_modelo(v_org, NULL, v_s1, 'Outro T' || v_suf, 2);
    RAISE EXCEPTION 'FALHOU: número ocupado aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL, v_msg = MESSAGE_TEXT;
    IF v_det IS DISTINCT FROM v_m2::text OR v_msg IS DISTINCT FROM 'Já existe um modelo com o número 0002 nesta subcategoria.' THEN
      RAISE EXCEPTION 'FALHOU: CT004 número — % / %', v_msg, v_det;
    END IF;
  END;
  -- [CT002] indicado acima do maior (8) + 100
  BEGIN
    PERFORM public.cat_guardar_modelo(v_org, NULL, v_s1, 'Longe T' || v_suf, 109);
    RAISE EXCEPTION 'FALHOU: número 109 (maior 8 + 101) aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%indique no máximo 0108.' THEN RAISE EXCEPTION 'FALHOU: salto de mais de 100 — %', v_msg; END IF;
  END;
  -- [CT004] nome repetido (maiúsculas e espaços), com o id
  BEGIN
    PERFORM public.cat_guardar_modelo(v_org, NULL, v_s1, '  SORTY   t' || lower(v_suf) || ' ');
    RAISE EXCEPTION 'FALHOU: nome repetido aceite';
  EXCEPTION WHEN SQLSTATE 'CT004' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    IF v_det IS DISTINCT FROM v_m1::text THEN RAISE EXCEPTION 'FALHOU: CT004 nome — DETAIL %', v_det; END IF;
  END;
  -- o mesmo nome noutra subcategoria passa, e começa em 1
  r := public.cat_guardar_modelo(v_org, NULL, v_s2, 'Sorty T' || v_suf) -> 'modelo';
  v_mx := (r ->> 'id')::uuid;
  IF (r ->> 'numero')::integer IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FALHOU: outra subcategoria → % (esperado 1)', r; END IF;

  -- renomear: o número fica
  r := public.cat_guardar_modelo(v_org, v_m1, NULL, 'Sorty Novo T' || v_suf) -> 'modelo';
  IF r ->> 'nome' IS DISTINCT FROM 'Sorty Novo T' || v_suf OR (r ->> 'numero')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: renomear → %', r;
  END IF;
  PERFORM public.cat_guardar_modelo(v_org, v_m1, v_s1, 'Sorty Novo T' || v_suf, 1);  -- iguais aos atuais: passa
  -- [CT002 x7]
  BEGIN PERFORM public.cat_guardar_modelo(v_org, v_m1, NULL, 'Sorty Novo T' || v_suf, 3); RAISE EXCEPTION 'FALHOU: mudar o número aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_modelo(v_org, v_m1, v_s2, 'Sorty Novo T' || v_suf); RAISE EXCEPTION 'FALHOU: mudar de subcategoria aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_modelo(v_org, NULL, v_s1, 'Zero T' || v_suf, 0); RAISE EXCEPTION 'FALHOU: número 0 aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_modelo(v_org, NULL, v_s1, 'Dezmil T' || v_suf, 10000); RAISE EXCEPTION 'FALHOU: número 10000 aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_modelo(v_org, NULL, v_s1, '   '); RAISE EXCEPTION 'FALHOU: nome vazio aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_modelo(v_org, NULL, v_t, 'Topo T' || v_suf); RAISE EXCEPTION 'FALHOU: modelo numa categoria de topo aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_modelo(v_org, NULL, NULL, 'Sem Sub T' || v_suf); RAISE EXCEPTION 'FALHOU: modelo sem subcategoria aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  -- [CT003 x2] isolamento: ids que não são da nike (inventados) não se encontram
  BEGIN PERFORM public.cat_guardar_modelo(v_org, NULL, gen_random_uuid(), 'X T' || v_suf); RAISE EXCEPTION 'FALHOU: subcategoria de fora aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_modelo(v_org, gen_random_uuid(), NULL, 'X T' || v_suf); RAISE EXCEPTION 'FALHOU: renomear modelo de fora aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;

  -- estados
  r := public.cat_estado_modelo(v_org, v_m8, false) -> 'modelo';
  IF (r -> 'ativo') IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'FALHOU: desativar → %', r; END IF;
  r := public.cat_estado_modelo(v_org, v_m8, true) -> 'modelo';
  IF (r -> 'ativo') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'FALHOU: reativar → %', r; END IF;
  PERFORM public.cat_estado_modelo(v_org, v_m8, false);
  -- [CT002] [CT003]
  BEGIN PERFORM public.cat_estado_modelo(v_org, v_m8, NULL); RAISE EXCEPTION 'FALHOU: estado NULL aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_estado_modelo(v_org, gen_random_uuid(), true); RAISE EXCEPTION 'FALHOU: estado de modelo de fora aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;

  -- leitura de gestão
  SELECT e INTO v_e FROM jsonb_array_elements(public.cat_ler_modelos_gestao(v_org) -> 'modelos') e WHERE (e ->> 'id')::uuid = v_m1;
  IF v_e IS NULL OR v_e ->> 'nome' IS DISTINCT FROM 'Sorty Novo T' || v_suf OR (v_e ->> 'numero')::integer IS DISTINCT FROM 1
     OR (v_e #>> '{subcategoria,id}')::uuid IS DISTINCT FROM v_s1 OR (v_e #>> '{categoria,id}')::uuid IS DISTINCT FROM v_t
     OR (v_e ->> 'usados')::integer IS DISTINCT FROM 0 OR (v_e -> 'ativo') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: leitura de gestão → %', v_e;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(public.cat_ler_modelos_gestao(v_org) -> 'modelos') e
      WHERE (e #>> '{subcategoria,id}')::uuid IN (v_s1, v_s2)) <> 5 THEN
    RAISE EXCEPTION 'FALHOU: a leitura de gestão não traz os 5 modelos de teste';
  END IF;
  -- RLS: authenticated (com services.view) lê; não escreve [42501]; created_by não se lê [42501]
  IF (SELECT count(*) FROM product_models pm WHERE pm.subcategory_id IN (v_s1, v_s2)) <> 5 THEN
    RAISE EXCEPTION 'FALHOU: authenticated não lê os modelos da nike';
  END IF;
  BEGIN
    INSERT INTO product_models (organization_id, subcategory_id, name, numero, created_by)
    VALUES (v_org, v_s1, 'Direto T' || v_suf, 50, gen_random_uuid());
    RAISE EXCEPTION 'FALHOU: authenticated escreveu em product_models';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM pm.created_by FROM product_models pm WHERE pm.id = v_m1;
    RAISE EXCEPTION 'FALHOU: authenticated leu product_models.created_by';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM set_config('teste.m1', v_m1::text, true); PERFORM set_config('teste.m2', v_m2::text, true);
  PERFORM set_config('teste.m7', v_m7::text, true); PERFORM set_config('teste.m8', v_m8::text, true);
  PERFORM set_config('teste.mx', v_mx::text, true);
END $t$;
RESET ROLE;

-- ─── 1b. Fim da numeração e teto de vivos (como postgres, por baixo das funções) ─
-- o 9999 ocupado em S1; e 9999 modelos desativados em S3 (sem auditoria), que levam a nike acima de 10000 vivos
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid; v_act uuid := current_setting('teste.act')::uuid;
BEGIN
  INSERT INTO product_models (organization_id, subcategory_id, name, numero, created_by)
  VALUES (v_org, current_setting('teste.s1')::uuid, 'Fim T' || current_setting('teste.suf'), 9999, v_act);
  PERFORM set_config('app.audit_bypass', 'on', true);
  INSERT INTO product_models (organization_id, subcategory_id, name, numero, is_active, created_by)
  SELECT v_org, current_setting('teste.s3')::uuid, 'Teto ' || g.n, g.n, false, v_act FROM generate_series(1, 9999) AS g(n);
  PERFORM set_config('app.audit_bypass', '', true);
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid; v_msg text;
BEGIN
  -- [CT002] teto de 10000 vivos (os 9999 desativados contam)
  BEGIN
    PERFORM public.cat_guardar_modelo(v_org, NULL, current_setting('teste.s1')::uuid, 'Teto Acima T' || current_setting('teste.suf'));
    RAISE EXCEPTION 'FALHOU: modelo acima do teto de 10000 vivos aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg IS DISTINCT FROM 'Esta organização já tem o máximo de modelos (10000, ativos e desativados).' THEN
      RAISE EXCEPTION 'FALHOU: teto de vivos — %', v_msg;
    END IF;
  END;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);
  DELETE FROM product_models WHERE subcategory_id = current_setting('teste.s3')::uuid;
  PERFORM set_config('app.audit_bypass', '', true);
END $t$;
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  -- com o 9999 ocupado, o automático dá o menor livre (1, 2, 7, 8 e 9999 ocupados → 3)
  r := public.cat_guardar_modelo(current_setting('teste.org')::uuid, NULL, current_setting('teste.s1')::uuid,
                                 'Livre T' || current_setting('teste.suf')) -> 'modelo';
  IF (r ->> 'numero')::integer IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'FALHOU: menor número livre → % (esperado 3)', r; END IF;
END $t$;

-- ─── 2 e 3. Ligar produtos e gerar o SKU ─────────────────────────────────────
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_suf text := current_setting('teste.suf');
  v_pre text := current_setting('teste.sa') || '-' || current_setting('teste.sb');
  v_n_t text := current_setting('teste.n_t'); v_n_s1 text := current_setting('teste.n_s1'); v_n_s2 text := current_setting('teste.n_s2');
  v_m1 uuid := current_setting('teste.m1')::uuid; v_m2 uuid := current_setting('teste.m2')::uuid;
  v_m7 uuid := current_setting('teste.m7')::uuid; v_m8 uuid := current_setting('teste.m8')::uuid; v_mx uuid := current_setting('teste.mx')::uuid;
  v_bl_pz_70 jsonb; v_ng_pz_70 jsonb; v_bl_70 jsonb;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_prov text; r jsonb;
BEGIN
  v_bl_pz_70 := jsonb_build_array(
    jsonb_build_object('atributo', current_setting('teste.cor'), 'opcao', current_setting('teste.o_bl')),
    jsonb_build_object('atributo', current_setting('teste.tex'), 'opcao', current_setting('teste.o_pz')),
    jsonb_build_object('atributo', current_setting('teste.med'), 'medida', jsonb_build_object('tipo', '2D', 'largura', 70, 'comprimento', 70, 'unidade', 'cm')));
  v_ng_pz_70 := jsonb_build_array(
    jsonb_build_object('atributo', current_setting('teste.cor'), 'opcao', current_setting('teste.o_ng')),
    jsonb_build_object('atributo', current_setting('teste.tex'), 'opcao', current_setting('teste.o_pz')),
    jsonb_build_object('atributo', current_setting('teste.med'), 'medida', jsonb_build_object('tipo', '2D', 'largura', 70, 'comprimento', 70, 'unidade', 'cm')));
  v_bl_70 := jsonb_build_array(
    jsonb_build_object('atributo', current_setting('teste.cor'), 'opcao', current_setting('teste.o_bl')),
    jsonb_build_object('atributo', current_setting('teste.med'), 'medida', jsonb_build_object('tipo', '2D', 'largura', 70, 'comprimento', 70, 'unidade', 'cm')));

  -- P1 sem modelo: não gera, o provisório fica
  v_p1 := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste Modelo P1 ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p1, NULL, NULL, v_n_t, v_n_s1);
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p1, v_bl_pz_70);
  v_prov := (SELECT p.sku FROM products p WHERE p.id = v_p1);
  r := public.cat_gerar_sku_produto(v_org, v_p1);
  IF (r -> 'gerado') IS DISTINCT FROM 'false'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["modelo"]'::jsonb
     OR r ->> 'motivo' IS DISTINCT FROM 'faltas' OR r ->> 'sku' IS DISTINCT FROM v_prov
     OR (SELECT p.sku FROM products p WHERE p.id = v_p1) IS DISTINCT FROM v_prov THEN
    RAISE EXCEPTION 'FALHOU: sem modelo gerou (ou resposta inesperada) → %', r;
  END IF;

  -- recusas ao ligar: [CT002 x2] [CT003 x2, isolamento: ids que não são da nike]
  BEGIN PERFORM public.cat_guardar_produto_modelo(v_org, v_p1, v_mx); RAISE EXCEPTION 'FALHOU: modelo de outra subcategoria aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_produto_modelo(v_org, v_p1, v_m8); RAISE EXCEPTION 'FALHOU: modelo desativado aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_produto_modelo(v_org, v_p1, gen_random_uuid()); RAISE EXCEPTION 'FALHOU: modelo de fora aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_produto_modelo(v_org, gen_random_uuid(), v_m1); RAISE EXCEPTION 'FALHOU: produto de fora aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;

  -- P1 com SORTY (0001): o formato completo
  r := public.cat_guardar_produto_modelo(v_org, v_p1, v_m1) -> 'produto';
  IF (r #>> '{modelo,numero}')::integer IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FALHOU: ligar P1 → %', r; END IF;
  r := public.cat_gerar_sku_produto(v_org, v_p1);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-BL-PZ-70X70' OR (r -> 'gerado') IS DISTINCT FROM 'true'::jsonb
     OR r -> 'faltas' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: P1 com modelo → % (esperado %)', r, v_pre || '-0001-BL-PZ-70X70';
  END IF;
  IF current_setting('app.audit_source', true) IS DISTINCT FROM 'teste:catalogo_modelos' THEN
    RAISE EXCEPTION 'FALHOU: app.audit_source não foi reposto (ficou %)', current_setting('app.audit_source', true);
  END IF;

  -- P2: o mesmo modelo e os mesmos atributos → duplicado; o SKU de P2 fica
  v_p2 := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste Modelo P2 ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p2, NULL, NULL, v_n_t, v_n_s1);
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p2, v_bl_pz_70);
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p2, v_m1);
  v_prov := (SELECT p.sku FROM products p WHERE p.id = v_p2);
  r := public.cat_gerar_sku_produto(v_org, v_p2);
  IF (r -> 'gerado') IS DISTINCT FROM 'false'::jsonb OR r ->> 'motivo' IS DISTINCT FROM 'duplicado'
     OR r -> 'faltas' IS DISTINCT FROM '["duplicado"]'::jsonb OR (r ->> 'outro_produto')::uuid IS DISTINCT FROM v_p1
     OR (r -> 'outro_apagado') IS DISTINCT FROM 'false'::jsonb OR r ->> 'sku' IS DISTINCT FROM v_prov
     OR (SELECT p.sku FROM products p WHERE p.id = v_p2) IS DISTINCT FROM v_prov THEN
    RAISE EXCEPTION 'FALHOU: duplicado → %', r;
  END IF;

  -- P3: o mesmo modelo noutra cor → o mesmo 0001
  v_p3 := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste Modelo P3 ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p3, NULL, NULL, v_n_t, v_n_s1);
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p3, v_ng_pz_70);
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p3, v_m1);
  r := public.cat_gerar_sku_produto(v_org, v_p3);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-NG-PZ-70X70' THEN RAISE EXCEPTION 'FALHOU: outra cor do mesmo modelo → %', r; END IF;

  -- P4: STONE PLUS (0002)
  v_p4 := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste Modelo P4 ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p4, NULL, NULL, v_n_t, v_n_s1);
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p4, v_bl_pz_70);
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p4, v_m2);
  r := public.cat_gerar_sku_produto(v_org, v_p4);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0002-BL-PZ-70X70' THEN RAISE EXCEPTION 'FALHOU: outro modelo (0002) → %', r; END IF;

  -- P5: ZEUS (0007), sem textura
  v_p5 := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste Modelo P5 ' || v_suf, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p5, NULL, NULL, v_n_t, v_n_s1);
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p5, v_bl_70);
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p5, v_m7);
  r := public.cat_gerar_sku_produto(v_org, v_p5);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0007-BL-70X70' THEN RAISE EXCEPTION 'FALHOU: modelo fixado (0007) → %', r; END IF;

  -- regenerar: P4 passa de STONE PLUS para ZEUS → 0007 com os seus atributos
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p4, v_m7);
  r := public.cat_gerar_sku_produto(v_org, v_p4);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0007-BL-PZ-70X70' OR (r -> 'gerado') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: regenerar ao mudar de modelo → %', r;
  END IF;

  -- desligar o modelo de P3: não gera e o SKU anterior fica
  r := public.cat_guardar_produto_modelo(v_org, v_p3, NULL) -> 'produto';
  IF r -> 'modelo' IS DISTINCT FROM 'null'::jsonb OR (SELECT p.model_id FROM products p WHERE p.id = v_p3) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: desligar → %', r;
  END IF;
  r := public.cat_gerar_sku_produto(v_org, v_p3);
  IF (r -> 'gerado') IS DISTINCT FROM 'false'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["modelo"]'::jsonb
     OR r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-NG-PZ-70X70' THEN
    RAISE EXCEPTION 'FALHOU: sem modelo depois de gerado → %', r;
  END IF;

  -- P5 muda de subcategoria pela função de sempre: o gatilho limpa o modelo, não gera e o SKU fica
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p5, NULL, NULL, v_n_t, v_n_s2);
  IF (SELECT p.model_id FROM products p WHERE p.id = v_p5) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: mudar de subcategoria não limpou o modelo';
  END IF;
  r := public.cat_gerar_sku_produto(v_org, v_p5);
  IF (r -> 'gerado') IS DISTINCT FROM 'false'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["modelo"]'::jsonb
     OR r ->> 'sku' IS DISTINCT FROM v_pre || '-0007-BL-70X70' THEN
    RAISE EXCEPTION 'FALHOU: depois de mudar de subcategoria → %', r;
  END IF;

  -- usados: SORTY tem P1 e P2; ZEUS só P4 (P5 perdeu o modelo)
  IF (SELECT (e ->> 'usados')::integer FROM jsonb_array_elements(public.cat_ler_modelos_gestao(v_org) -> 'modelos') e
      WHERE (e ->> 'id')::uuid = v_m1) IS DISTINCT FROM 2
     OR (SELECT (e ->> 'usados')::integer FROM jsonb_array_elements(public.cat_ler_modelos_gestao(v_org) -> 'modelos') e
         WHERE (e ->> 'id')::uuid = v_m7) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: "usados" na leitura de gestão';
  END IF;

  PERFORM set_config('teste.p1', v_p1::text, true); PERFORM set_config('teste.p3', v_p3::text, true);
  PERFORM set_config('teste.p4', v_p4::text, true);
  PERFORM set_config('teste.bl_pz_70', v_bl_pz_70::text, true);
  PERFORM set_config('teste.ng_pz_70', v_ng_pz_70::text, true);
END $t$;
RESET ROLE;

-- ─── 3b. O gatilho de products (como postgres, por baixo das funções) ────────
DO $t$
BEGIN
  -- [CT002] modelo de outra subcategoria
  BEGIN
    UPDATE products SET model_id = current_setting('teste.mx')::uuid WHERE id = current_setting('teste.p1')::uuid;
    RAISE EXCEPTION 'FALHOU: o gatilho aceitou um modelo de outra subcategoria';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  -- [CT002] modelo apagado
  UPDATE product_models SET deleted_at = now() WHERE id = current_setting('teste.m2')::uuid;
  BEGIN
    UPDATE products SET model_id = current_setting('teste.m2')::uuid WHERE id = current_setting('teste.p3')::uuid;
    RAISE EXCEPTION 'FALHOU: o gatilho aceitou um modelo apagado';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
  -- P4 (…-0007-BL-PZ-70X70) passa a apagado: o próximo duplicado dele não pode devolver o id
  UPDATE products SET is_deleted = true WHERE id = current_setting('teste.p4')::uuid;
END $t$;

-- ─── 3c e 4. Duplicado de um apagado; pré-visualização ───────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  v_org uuid := current_setting('teste.org')::uuid; v_pre text := current_setting('teste.sa') || '-' || current_setting('teste.sb');
  v_t uuid := current_setting('teste.t')::uuid; v_s1 uuid := current_setting('teste.s1')::uuid;
  v_p1 uuid := current_setting('teste.p1')::uuid; v_m7 uuid := current_setting('teste.m7')::uuid; v_p6 uuid; r jsonb;
BEGIN
  -- P6: o SKU do apagado P4 → duplicado, outro_apagado true e SEM o id
  v_p6 := public.cat_guardar_produto(v_org, NULL, 'produto', 'Teste Modelo P6 ' || current_setting('teste.suf'), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM public.cat_guardar_produto_tabelas(v_org, v_p6, NULL, NULL, current_setting('teste.n_t'), current_setting('teste.n_s1'));
  PERFORM public.cat_guardar_produto_atributos(v_org, v_p6, current_setting('teste.bl_pz_70')::jsonb);
  PERFORM public.cat_guardar_produto_modelo(v_org, v_p6, v_m7);
  r := public.cat_gerar_sku_produto(v_org, v_p6);
  IF r ->> 'motivo' IS DISTINCT FROM 'duplicado' OR (r -> 'outro_apagado') IS DISTINCT FROM 'true'::jsonb OR r ? 'outro_produto' THEN
    RAISE EXCEPTION 'FALHOU: duplicado de um apagado → %', r;
  END IF;
  r := public.cat_prever_sku_modelo(v_org, v_t, v_s1, v_m7, current_setting('teste.bl_pz_70')::jsonb);
  IF r -> 'faltas' IS DISTINCT FROM '["duplicado"]'::jsonb OR (r -> 'outro_apagado') IS DISTINCT FROM 'true'::jsonb OR r ? 'outro_produto' THEN
    RAISE EXCEPTION 'FALHOU: prever duplicado de um apagado → %', r;
  END IF;

  -- pré-visualização
  r := public.cat_prever_sku_modelo(v_org, v_t, v_s1, current_setting('teste.m1')::uuid, current_setting('teste.bl_pz_70')::jsonb);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-BL-PZ-70X70' OR r -> 'faltas' IS DISTINCT FROM '["duplicado"]'::jsonb
     OR (r ->> 'outro_produto')::uuid IS DISTINCT FROM v_p1 OR (r -> 'outro_apagado') IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: prever duplicado → %', r;
  END IF;
  r := public.cat_prever_sku_modelo(v_org, v_t, v_s1, current_setting('teste.m1')::uuid, current_setting('teste.bl_pz_70')::jsonb, v_p1);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0001-BL-PZ-70X70' OR r -> 'faltas' IS DISTINCT FROM '[]'::jsonb OR r ? 'outro_produto' THEN
    RAISE EXCEPTION 'FALHOU: prever o próprio produto → %', r;
  END IF;
  r := public.cat_prever_sku_modelo(v_org, v_t, v_s1, v_m7, current_setting('teste.ng_pz_70')::jsonb);
  IF r ->> 'sku' IS DISTINCT FROM v_pre || '-0007-NG-PZ-70X70' OR r -> 'faltas' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: prever outro modelo → %', r;
  END IF;
  r := public.cat_prever_sku_modelo(v_org, v_t, v_s1, current_setting('teste.mx')::uuid, '[]'::jsonb);
  IF r -> 'sku' IS DISTINCT FROM 'null'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["modelo"]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: prever com modelo de outra subcategoria → %', r;
  END IF;
  r := public.cat_prever_sku(v_org, v_t, v_s1, '[]'::jsonb);
  IF r -> 'sku' IS DISTINCT FROM 'null'::jsonb OR r -> 'faltas' IS DISTINCT FROM '["modelo"]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: cat_prever_sku sem modelo → %', r;
  END IF;
  r := public.cat_prever_sku(v_org, v_t, NULL, '[]'::jsonb);
  IF r -> 'faltas' IS DISTINCT FROM '["subcategoria", "modelo"]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: ordem das faltas sem subcategoria → %', r;
  END IF;
  -- [CT003 x2] isolamento: modelo e produto que não são da nike
  BEGIN PERFORM public.cat_prever_sku_modelo(v_org, v_t, v_s1, gen_random_uuid(), '[]'::jsonb); RAISE EXCEPTION 'FALHOU: prever com modelo de fora aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;
  BEGIN PERFORM public.cat_prever_sku_modelo(v_org, v_t, v_s1, current_setting('teste.m1')::uuid, '[]'::jsonb, gen_random_uuid());
    RAISE EXCEPTION 'FALHOU: prever com produto de fora aceite';
  EXCEPTION WHEN SQLSTATE 'CT003' THEN NULL; END;

  -- [CT001] BM24 como p_org
  IF current_setting('teste.saltar_bm24', true) IS DISTINCT FROM 'sim' THEN
    BEGIN PERFORM public.cat_guardar_modelo(current_setting('teste.bm24')::uuid, NULL, v_s1, 'BM24 T'); RAISE EXCEPTION 'FALHOU: BM24 aceite';
    EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
  END IF;
END $t$;

-- ─── 5. Sem products.edit → [CT001 x4] ───────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims_sem'), true);
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid;
BEGIN
  BEGIN PERFORM public.cat_guardar_modelo(v_org, NULL, current_setting('teste.s1')::uuid, 'Sem Perm T'); RAISE EXCEPTION 'FALHOU: criar modelo sem products.edit aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
  BEGIN PERFORM public.cat_estado_modelo(v_org, current_setting('teste.m1')::uuid, false); RAISE EXCEPTION 'FALHOU: estado sem products.edit aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
  BEGIN PERFORM public.cat_guardar_produto_modelo(v_org, current_setting('teste.p1')::uuid, NULL); RAISE EXCEPTION 'FALHOU: ligar sem products.edit aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
  BEGIN PERFORM public.cat_gerar_sku_produto(v_org, current_setting('teste.p1')::uuid); RAISE EXCEPTION 'FALHOU: gerar sem products.edit aceite';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL; END;
END $t$;
RESET ROLE;

-- ─── 6. Acessos, search_path, FK e RLS ───────────────────────────────────────
DO $t$
DECLARE v_sig text; v_oid oid;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY['public.cat_ler_modelos_gestao(uuid)', 'public.cat_guardar_modelo(uuid,uuid,uuid,text,integer)',
                                'public.cat_estado_modelo(uuid,uuid,boolean)', 'public.cat_guardar_produto_modelo(uuid,uuid,uuid)',
                                'public.cat_gerar_sku_produto(uuid,uuid,boolean)', 'public.cat_prever_sku_modelo(uuid,uuid,uuid,uuid,jsonb,uuid)',
                                'public.cat_prever_sku(uuid,uuid,uuid,jsonb)'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'FALHOU: falta a função %', v_sig; END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: anon pode executar %', v_sig; END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: authenticated não pode executar %', v_sig; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc pr, aclexplode(pr.proacl) x WHERE pr.oid = v_oid AND x.grantee = 0 AND x.privilege_type = 'EXECUTE')
       OR (SELECT pr.proacl FROM pg_proc pr WHERE pr.oid = v_oid) IS NULL THEN
      RAISE EXCEPTION 'FALHOU: PUBLIC pode executar %', v_sig;
    END IF;
    IF NOT (SELECT pr.prosecdef FROM pg_proc pr WHERE pr.oid = v_oid) THEN RAISE EXCEPTION 'FALHOU: % não é SECURITY DEFINER', v_sig; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc pr, unnest(pr.proconfig) cfg WHERE pr.oid = v_oid AND cfg = 'search_path=public, pg_temp') THEN
      RAISE EXCEPTION 'FALHOU: % sem search_path = public, pg_temp', v_sig;
    END IF;
  END LOOP;
  FOREACH v_sig IN ARRAY ARRAY['public.fn_cat_modelo_numero(uuid,uuid,uuid)', 'public.fn_cat_sku_juntar_faltas(jsonb,boolean)',
                                'public.fn_cat_modelo_valida_trg()', 'public.fn_cat_produto_modelo_trg()'] LOOP
    v_oid := to_regprocedure(v_sig)::oid;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'FALHOU: falta a função %', v_sig; END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHOU: % pode ser executada de fora', v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc pr, unnest(pr.proconfig) cfg WHERE pr.oid = v_oid AND cfg = 'search_path=public, pg_temp') THEN
      RAISE EXCEPTION 'FALHOU: % sem search_path = public, pg_temp', v_sig;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'public.products'::regclass AND c.conname::text = 'products_model_id_fkey'
                 AND c.convalidated AND c.confdeltype::text = 'n' AND c.confrelid = 'public.product_models'::regclass) THEN
    RAISE EXCEPTION 'FALHOU: products_model_id_fkey em falta, por validar ou sem ON DELETE SET NULL';
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.product_models'::regclass)
     OR EXISTS (SELECT 1 FROM pg_policy pl WHERE pl.polrelid = 'public.product_models'::regclass AND pl.polcmd::text <> 'r')
     OR has_table_privilege('authenticated', 'public.product_models', 'SELECT')
     OR has_table_privilege('anon', 'public.product_models', 'SELECT')
     OR has_table_privilege('authenticated', 'public.product_models', 'INSERT')
     OR has_table_privilege('authenticated', 'public.product_models', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.product_models', 'DELETE')
     OR NOT has_column_privilege('authenticated', 'public.product_models', 'numero', 'SELECT')
     OR has_column_privilege('authenticated', 'public.product_models', 'created_by', 'SELECT') THEN
    RAISE EXCEPTION 'FALHOU: product_models sem RLS, com política de escrita, ou com privilégios além do SELECT por coluna sem created_by';
  END IF;
  -- [CT002] o gatilho da tabela: o número não muda (como postgres, por baixo das funções)
  BEGIN
    UPDATE product_models SET numero = 99 WHERE id = current_setting('teste.m1')::uuid;
    RAISE EXCEPTION 'FALHOU: o número de um modelo mudou';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL; END;
END $t$;

SELECT 'OK: modelos (0001, 0002, fixado 0007, seguinte 0008, ocupado CT004, salto > 100 CT002, nome repetido CT004, outra subcategoria recomeça em 0001, renomear mantém o número, estados), 9999 ocupado → menor livre 0003, teto de 10000 vivos, leitura de gestão e "usados", RLS (lê; não escreve; created_by não se lê), ligar (outra subcategoria, desativado, desligar), SKU (sem modelo não gera; ' || current_setting('teste.sa') || '-' || current_setting('teste.sb') || '-0001-BL-PZ-70X70; duplicado com outro_produto; outra cor 0001; 0002; 0007; regenerar ao mudar de modelo; desligado não gera; mudar de subcategoria limpa o modelo; gatilho recusa outra subcategoria e apagado; duplicado de apagado sem id; audit_source reposto), pré-visualização (duplicado, próprio produto, outro modelo, outra subcategoria, sem modelo, ordem das faltas), isolamento por ids de fora (CT003), acessos, search_path, FK, gatilho do número. Recusas de propósito: '
       || (CASE WHEN current_setting('teste.saltar_bm24', true) = 'sim' THEN '30 (CT001 x4' ELSE '31 (CT001 x5' END)
       || ', CT002 x15, CT003 x7, CT004 x2, 42501 x2). Saltado: '
       || coalesce(nullif(current_setting('teste.saltados', true), ''), 'nada') AS resultado;

ROLLBACK;
