-- ============================================================
-- Testes: 20261231998000_rh_cargos_tecnicos_oficios.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK: cria
-- cargos, ofícios e pessoas próprios (prefixo "Teste 998000") na organização
-- de um utilizador com hr.pessoas.laborais.edit, hr.pessoas.retribuicao.view e
-- services.view (role authenticated, auth.uid() pelas claims) e desfaz tudo no fim.
--
-- Correr (o resultado útil é o último SELECT; qualquer falha rebenta com
-- 'FALHOU: …' e o ROLLBACK implícito da transação abortada desfaz tudo):
--   supabase db query --linked --workdir <workdir RH> -f supabase/tests/rh_cargos_tecnicos_oficios.test.sql
--
-- Cobre:
--   1. Ofício num cargo não técnico → CT002
--   2. Tirar a marca a um cargo com ofícios → recusado (CT002); a marca por UPDATE direto → recusado (CT001)
--   3. Extra numa pessoa não técnica → CT002
--   4. A pessoa herda os ofícios do cargo e soma os extras; grava-se só o extra
--   5. €/h pela retribuição, depois pelo salário do cargo, e NULL com o cargo a 0 €
--   6. cat_ler_catalogo: fontes rh / cargo / referencia; um técnico com 2 ofícios conta nos dois; não técnicos fora
--   7. Sem hr.pessoas.retribuicao.view: o custo_hora de cada técnico vem nulo e a média do ofício vem preenchida;
--      rh_ler_custo_hora_pessoas recusa (CT001)
--   8. Grants: authenticated sem EXECUTE nos ajudantes internos; anon sem EXECUTE nas rh_*
-- ============================================================

BEGIN;

-- ─── Fixtures (como postgres, sem sessão) ──────────────────────────────────
DO $fx$
DECLARE
  v_auth uuid; v_org uuid;
  c_tec  uuid := '9980a000-0000-4000-8000-000000000001';  -- técnico, 1000 €/mês
  c_adm  uuid := '9980a000-0000-4000-8000-000000000002';  -- não técnico, 1000 €/mês
  c_zero uuid := '9980a000-0000-4000-8000-000000000003';  -- técnico, 0 €
  c_vaz  uuid := '9980a000-0000-4000-8000-000000000004';  -- técnico, 1200 €/mês, sem pessoas
  s_lad  uuid := '9980b000-0000-4000-8000-000000000001';  -- do cargo técnico
  s_pin  uuid := '9980b000-0000-4000-8000-000000000002';  -- extra
  s_ref  uuid := '9980b000-0000-4000-8000-000000000003';  -- só salário de referência
  s_crg  uuid := '9980b000-0000-4000-8000-000000000004';  -- só do cargo sem pessoas
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT u.auth_user_id, am.organization_id INTO v_auth, v_org
  FROM anew_users u JOIN anew_memberships am ON am.user_id = u.id AND am.status = 'active'
  WHERE u.auth_user_id IS NOT NULL AND NOT public.is_system_admin_user(u.auth_user_id)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'hr.pessoas.laborais.edit', am.organization_id)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'hr.pessoas.retribuicao.view', am.organization_id)
    AND public.has_anew_permission_in_org(u.auth_user_id, 'services.view', am.organization_id)
  ORDER BY u.created_at NULLS LAST, u.id LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'FALHOU: sem utilizador com laborais.edit, retribuicao.view e services.view'; END IF;

  INSERT INTO hr_cargos (id, organization_id, nome, salario_base, periodicidade, horas_referencia) VALUES
    (c_tec, v_org, 'Teste 998000 técnico', 1000, 'mensal', 40),
    (c_adm, v_org, 'Teste 998000 administrativo', 1000, 'mensal', 40),
    (c_zero, v_org, 'Teste 998000 técnico a zero', 0, 'mensal', 40),
    (c_vaz, v_org, 'Teste 998000 técnico vazio', 1200, 'mensal', 40);
  INSERT INTO ops_skill (id, organization_id, nome, salario_referencia, ativo) VALUES
    (s_lad, v_org, 'Teste 998000 ladrilho', 1900, true),
    (s_pin, v_org, 'Teste 998000 pintura', 1900, true),
    (s_ref, v_org, 'Teste 998000 referência', 1900, true),
    (s_crg, v_org, 'Teste 998000 só cargo', 1900, true);
  INSERT INTO pessoas (id, organization_id, primeiro_nome, apelido, cargo_id, data_admissao) VALUES
    ('9980c000-0000-4000-8000-000000000001', v_org, 'Teste998', 'Comretribuicao', c_tec, '2026-01-01'),
    ('9980c000-0000-4000-8000-000000000002', v_org, 'Teste998', 'Semretribuicao', c_tec, '2026-01-01'),
    ('9980c000-0000-4000-8000-000000000003', v_org, 'Teste998', 'Administrativo', c_adm, '2026-01-01'),
    ('9980c000-0000-4000-8000-000000000004', v_org, 'Teste998', 'Cargozero', c_zero, '2026-01-01');
  -- a retribuição só de uma das duas pessoas do cargo técnico (o valor do cargo: igualdade salarial)
  INSERT INTO pessoas_retribuicoes (pessoa_id, organization_id, valor_base, periodicidade, valido_de)
  VALUES ('9980c000-0000-4000-8000-000000000001', v_org, 1000, 'mensal', '2026-01-01');

  PERFORM set_config('teste.org', v_org::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.auth', v_auth::text, true);
  -- os €/h esperados (fn_cat_custo_hora_salario é interna: authenticated não a chama)
  PERFORM set_config('teste.ch1000', public.fn_cat_custo_hora_salario(v_org, 1000)::text, true);
  PERFORM set_config('teste.ch1200', public.fn_cat_custo_hora_salario(v_org, 1200)::text, true);
  PERFORM set_config('teste.ch1900', public.fn_cat_custo_hora_salario(v_org, 1900)::text, true);
END $fx$;

-- ─── 1 e 2. Cargos: ofício num cargo não técnico; marcar; tirar a marca com ofícios ─
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid; v_ok boolean;
BEGIN
  BEGIN
    PERFORM public.rh_guardar_cargo_tecnico(v_org, '9980a000-0000-4000-8000-000000000002', false, ARRAY['9980b000-0000-4000-8000-000000000001']::uuid[]);
    RAISE EXCEPTION 'FALHOU: ofício num cargo não técnico foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  PERFORM public.rh_guardar_cargo_tecnico(v_org, '9980a000-0000-4000-8000-000000000001', true, ARRAY['9980b000-0000-4000-8000-000000000001']::uuid[]);
  PERFORM public.rh_guardar_cargo_tecnico(v_org, '9980a000-0000-4000-8000-000000000003', true, ARRAY['9980b000-0000-4000-8000-000000000001']::uuid[]);
  PERFORM public.rh_guardar_cargo_tecnico(v_org, '9980a000-0000-4000-8000-000000000004', true, ARRAY['9980b000-0000-4000-8000-000000000004']::uuid[]);
  -- a marca não se muda por UPDATE direto (authenticated tem UPDATE na tabela)
  BEGIN
    UPDATE hr_cargos SET tecnico_obra = true WHERE id = '9980a000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'FALHOU: a marca mudou por UPDATE direto';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
  -- e lê-se pela coluna (GRANT SELECT): o select do ecrã dos cargos
  SELECT tecnico_obra INTO v_ok FROM hr_cargos WHERE id = '9980a000-0000-4000-8000-000000000001';
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: a marca não se lê como authenticated'; END IF;
  IF (SELECT count(*) FROM hr_cargos_oficios WHERE cargo_id = '9980a000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'FALHOU: o cargo técnico devia ter 1 ofício (lido pela RLS)';
  END IF;
END $t$;
RESET ROLE;

DO $t$
BEGIN
  BEGIN
    UPDATE hr_cargos SET tecnico_obra = false WHERE id = '9980a000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FALHOU: tirou-se a marca a um cargo com ofícios';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  BEGIN
    INSERT INTO hr_cargos_oficios (organization_id, cargo_id, skill_id)
    VALUES (current_setting('teste.org')::uuid, '9980a000-0000-4000-8000-000000000002', '9980b000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'FALHOU: ofício inserido num cargo não técnico';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
END $t$;

-- ─── 3 e 4. Pessoas: extra num não técnico; herdados + extras ──────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid; r jsonb; o jsonb;
BEGIN
  BEGIN
    PERFORM public.rh_guardar_oficios_pessoa(v_org, '9980c000-0000-4000-8000-000000000003', ARRAY['9980b000-0000-4000-8000-000000000002']::uuid[]);
    RAISE EXCEPTION 'FALHOU: extra numa pessoa não técnica foi aceite';
  EXCEPTION WHEN SQLSTATE 'CT002' THEN NULL;
  END;
  -- o ecrã manda os ligados todos (o herdado incluído): grava-se só o extra
  PERFORM public.rh_guardar_oficios_pessoa(v_org, '9980c000-0000-4000-8000-000000000001',
    ARRAY['9980b000-0000-4000-8000-000000000001', '9980b000-0000-4000-8000-000000000002']::uuid[]);
  r := public.rh_ler_oficios_pessoa(v_org, '9980c000-0000-4000-8000-000000000001');
  IF (r->>'tecnica')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: a pessoa do cargo técnico devia ser técnica: %', r; END IF;
  IF r->'cargo'->>'nome' <> 'Teste 998000 técnico' THEN RAISE EXCEPTION 'FALHOU: cargo errado na leitura: %', r->'cargo'; END IF;
  SELECT x INTO o FROM jsonb_array_elements(r->'oficios') x WHERE x->>'id' = '9980b000-0000-4000-8000-000000000001';
  IF NOT ((o->>'herdado')::boolean AND NOT (o->>'extra')::boolean AND (o->>'ligado')::boolean) THEN
    RAISE EXCEPTION 'FALHOU: o ofício do cargo devia vir herdado e ligado: %', o;
  END IF;
  SELECT x INTO o FROM jsonb_array_elements(r->'oficios') x WHERE x->>'id' = '9980b000-0000-4000-8000-000000000002';
  IF NOT (NOT (o->>'herdado')::boolean AND (o->>'extra')::boolean AND (o->>'ligado')::boolean) THEN
    RAISE EXCEPTION 'FALHOU: o extra devia vir extra e ligado: %', o;
  END IF;
  IF r->>'origem_custo' <> 'retribuicao' OR (r->>'custo_hora') IS NULL OR (r->>'ve_custo')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: o custo da pessoa devia vir da retribuição: %', r;
  END IF;
  r := public.rh_ler_oficios_pessoa(v_org, '9980c000-0000-4000-8000-000000000003');
  IF (r->>'tecnica')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FALHOU: o administrativo não é técnico: %', r; END IF;
END $t$;
RESET ROLE;

DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid;
BEGIN
  IF (SELECT array_agg(skill_id::text ORDER BY skill_id) FROM pessoas_oficios WHERE pessoa_id = '9980c000-0000-4000-8000-000000000001')
     IS DISTINCT FROM ARRAY['9980b000-0000-4000-8000-000000000002'] THEN
    RAISE EXCEPTION 'FALHOU: em pessoas_oficios devia ficar só o extra';
  END IF;
  IF (SELECT array_agg(skill_id::text || ':' || origem ORDER BY skill_id) FROM public.fn_rh_oficios_efetivos(v_org, '9980c000-0000-4000-8000-000000000001'))
     IS DISTINCT FROM ARRAY['9980b000-0000-4000-8000-000000000001:cargo', '9980b000-0000-4000-8000-000000000002:extra'] THEN
    RAISE EXCEPTION 'FALHOU: os ofícios efetivos deviam ser o do cargo e o extra';
  END IF;
  -- a pessoa sem extras herda só o do cargo; o administrativo não tem nenhum
  IF (SELECT count(*) FROM public.fn_rh_oficios_efetivos(v_org, '9980c000-0000-4000-8000-000000000002')) <> 1 THEN
    RAISE EXCEPTION 'FALHOU: a pessoa sem extras devia herdar 1 ofício';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fn_rh_oficios_efetivos(v_org, '9980c000-0000-4000-8000-000000000003')) THEN
    RAISE EXCEPTION 'FALHOU: o administrativo não tem ofícios efetivos';
  END IF;

-- ─── 5. €/h: retribuição, cargo, NULL a 0 € ───────────────────────────────
  IF (SELECT origem FROM public.fn_rh_custo_hora_pessoa_em_det(v_org, '9980c000-0000-4000-8000-000000000001', current_date)) <> 'retribuicao' THEN
    RAISE EXCEPTION 'FALHOU: com retribuição a origem devia ser retribuicao';
  END IF;
  IF (SELECT row(custo_hora, origem)::text FROM public.fn_rh_custo_hora_pessoa_em_det(v_org, '9980c000-0000-4000-8000-000000000002', current_date))
     IS DISTINCT FROM row(public.fn_cat_custo_hora_salario(v_org, 1000), 'cargo')::text THEN
    RAISE EXCEPTION 'FALHOU: sem retribuição o custo devia vir do salário do cargo';
  END IF;
  IF public.fn_rh_custo_hora_pessoa(v_org, '9980c000-0000-4000-8000-000000000001') IS DISTINCT FROM public.fn_cat_custo_hora_salario(v_org, 1000) THEN
    RAISE EXCEPTION 'FALHOU: fn_rh_custo_hora_pessoa devia dar a conta da retribuição';
  END IF;
  IF (SELECT row(custo_hora, origem)::text FROM public.fn_rh_custo_hora_pessoa_em_det(v_org, '9980c000-0000-4000-8000-000000000004', current_date))
     IS DISTINCT FROM row(NULL::numeric, NULL::text)::text THEN
    RAISE EXCEPTION 'FALHOU: com o cargo a 0 € o custo devia ser NULL (nunca 0)';
  END IF;
  IF public.fn_rh_custo_hora_pessoa(v_org, '9980c000-0000-4000-8000-000000000003') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: o administrativo sem retribuição não tem custo pelo cargo (não é técnico)';
  END IF;
END $t$;

-- ─── 6. O Catálogo com retribuicao.view ───────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid; r jsonb; p jsonb; t jsonb;
BEGIN
  r := public.cat_ler_catalogo(v_org);
  IF (r->>'ve_custo_tecnicos')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: ve_custo_tecnicos devia ser true'; END IF;
  SELECT x INTO p FROM jsonb_array_elements(r->'perfis') x WHERE x->>'id' = '9980b000-0000-4000-8000-000000000001';
  -- ladrilho: as duas pessoas do cargo técnico com custo (a do cargo a 0 € fica fora)
  IF p->>'fonte' <> 'rh' OR (p->>'n')::int <> 2 OR (p->>'custo_hora')::numeric IS DISTINCT FROM current_setting('teste.ch1000')::numeric
     OR p->'nomes' <> '["Teste998 Comretribuicao", "Teste998 Semretribuicao"]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: o ladrilho devia ser a média das 2 pessoas do RH: %', p;
  END IF;
  SELECT x INTO p FROM jsonb_array_elements(r->'perfis') x WHERE x->>'id' = '9980b000-0000-4000-8000-000000000002';
  IF p->>'fonte' <> 'rh' OR (p->>'n')::int <> 1 THEN RAISE EXCEPTION 'FALHOU: a pintura devia vir do RH (o extra): %', p; END IF;
  SELECT x INTO p FROM jsonb_array_elements(r->'perfis') x WHERE x->>'id' = '9980b000-0000-4000-8000-000000000004';
  IF p->>'fonte' <> 'cargo' OR (p->>'custo_hora')::numeric IS DISTINCT FROM current_setting('teste.ch1200')::numeric
     OR p->'cargos' <> '["Teste 998000 técnico vazio"]'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: o ofício só do cargo devia usar o salário do cargo: %', p;
  END IF;
  SELECT x INTO p FROM jsonb_array_elements(r->'perfis') x WHERE x->>'id' = '9980b000-0000-4000-8000-000000000003';
  IF p->>'fonte' <> 'referencia' OR (p->>'custo_hora')::numeric IS DISTINCT FROM current_setting('teste.ch1900')::numeric THEN
    RAISE EXCEPTION 'FALHOU: o ofício sem pessoas nem cargo devia usar o salário de referência: %', p;
  END IF;
  -- o técnico com 2 ofícios conta nos dois; o administrativo não é técnico
  SELECT x INTO t FROM jsonb_array_elements(r->'tecnicos') x WHERE x->>'id' = '9980c000-0000-4000-8000-000000000001';
  IF t IS NULL OR jsonb_array_length(t->'perfis') <> 2 OR (t->>'custo_hora') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: o técnico devia ter os 2 ofícios e o custo: %', t;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'tecnicos') x WHERE x->>'id' = '9980c000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'FALHOU: o administrativo não é técnico no Catálogo';
  END IF;
  IF jsonb_array_length(public.rh_ler_custo_hora_pessoas(v_org)) = 0 THEN RAISE EXCEPTION 'FALHOU: rh_ler_custo_hora_pessoas vazio'; END IF;
END $t$;
RESET ROLE;

-- ─── 7. Sem retribuicao.view (só nesta transação) ─────────────────────────
-- as permissões de um role de sistema não se mexem: o utilizador passa, nesta transação, para um role de teste com
-- services.view e hr.pessoas.laborais.view, sem hr.pessoas.retribuicao.view
DO $fx$
DECLARE v_role uuid := '9980d000-0000-4000-8000-000000000001';
BEGIN
  -- '{}' e não '': o gatilho que protege os roles de sistema lê as claims como JSON
  PERFORM set_config('request.jwt.claims', '{}', true);
  INSERT INTO anew_roles (id, code, name, organization_id, is_system) VALUES
    (v_role, 'teste_998000_sem_retribuicao', 'Teste 998000 sem retribuição', current_setting('teste.org')::uuid, false);
  INSERT INTO anew_role_permissions (role_id, permission_code) VALUES (v_role, 'services.view'), (v_role, 'hr.pessoas.laborais.view');
  UPDATE anew_memberships am SET role_id = v_role FROM anew_users u
  WHERE am.user_id = u.id AND u.auth_user_id = current_setting('teste.auth')::uuid AND am.organization_id = current_setting('teste.org')::uuid;
END $fx$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v_org uuid := current_setting('teste.org')::uuid; r jsonb; p jsonb; t jsonb;
BEGIN
  IF public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', v_org) THEN RAISE EXCEPTION 'FALHOU: a permissão não saiu'; END IF;
  r := public.cat_ler_catalogo(v_org);
  IF (r->>'ve_custo_tecnicos')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FALHOU: ve_custo_tecnicos devia ser false'; END IF;
  SELECT x INTO t FROM jsonb_array_elements(r->'tecnicos') x WHERE x->>'id' = '9980c000-0000-4000-8000-000000000001';
  IF t IS NULL OR (t->>'custo_hora') IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: sem retribuicao.view o custo do técnico devia vir nulo: %', t; END IF;
  SELECT x INTO p FROM jsonb_array_elements(r->'perfis') x WHERE x->>'id' = '9980b000-0000-4000-8000-000000000001';
  IF (p->>'custo_hora') IS NULL OR p->>'fonte' <> 'rh' THEN RAISE EXCEPTION 'FALHOU: a média do ofício devia vir preenchida: %', p; END IF;
  r := public.rh_ler_oficios_pessoa(v_org, '9980c000-0000-4000-8000-000000000001');
  IF (r->>'custo_hora') IS NOT NULL OR (r->>'origem_custo') IS NOT NULL OR (r->>'ve_custo')::boolean THEN
    RAISE EXCEPTION 'FALHOU: o cartão não devia mostrar o custo: %', r;
  END IF;
  BEGIN
    PERFORM public.rh_ler_custo_hora_pessoas(v_org);
    RAISE EXCEPTION 'FALHOU: rh_ler_custo_hora_pessoas sem retribuicao.view';
  EXCEPTION WHEN SQLSTATE 'CT001' THEN NULL;
  END;
END $t$;
RESET ROLE;

-- ─── 8. Grants ────────────────────────────────────────────────────────────
DO $t$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.fn_rh_pessoa_cargo_vigente(uuid,date)', 'public.fn_rh_pessoa_tecnica(uuid,uuid)',
    'public.fn_rh_oficios_efetivos(uuid,uuid)', 'public.fn_cat_custo_hora_salario(uuid,numeric)', 'public.fn_rh_custo_hora_cargo_em(uuid,uuid,date,numeric)',
    'public.fn_rh_custo_hora_pessoa_em_det(uuid,uuid,date)', 'public.fn_rh_custo_hora_pessoa_em(uuid,uuid,date)', 'public.fn_rh_custo_hora_pessoa(uuid,uuid)',
    'public.fn_cat_custo_hora_oficio_det(uuid,uuid)'] LOOP
    IF has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHOU: % não devia ter EXECUTE para authenticated/anon', f;
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.rh_guardar_cargo_tecnico(uuid,uuid,boolean,uuid[])', 'public.rh_ler_custo_hora_pessoas(uuid)',
    'public.rh_ler_oficios_pessoa(uuid,uuid)', 'public.rh_guardar_oficios_pessoa(uuid,uuid,uuid[])', 'public.cat_ler_catalogo(uuid)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHOU: % devia ter EXECUTE só para authenticated', f;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.hr_cargos_oficios', 'INSERT') OR has_table_privilege('anon', 'public.hr_cargos_oficios', 'SELECT') THEN
    RAISE EXCEPTION 'FALHOU: hr_cargos_oficios só se lê (authenticated)';
  END IF;
END $t$;

SELECT 'OK: 20261231998000 — 8 grupos de testes passaram' AS resultado;

ROLLBACK;
