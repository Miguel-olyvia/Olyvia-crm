-- =============================================================================
-- TESTE-prazo-justificacao-configuravel.sql -- prova da migration
--   20261231991000_prazo_justificacao_configuravel (rascunho em supabase/rascunhos/)
--
-- NAO CORRER sem autorizacao explicita para escritas REVERTIDAS na org nike.
-- So base RH (uetjghdkwbywbftedtth), a partir do worktree rh-pessoas
-- (confirmar supabase/.temp/project-ref). Nunca a principal, nunca a Mudelar.
--
-- Como correr (so com essa autorizacao, ANTES do db push, numa so ligacao):
--   BEGIN;
--   <conteudo inteiro da migration 20261231991000>
--   <este ficheiro>
--   ROLLBACK;
-- O bloco acaba SEMPRE com RAISE EXCEPTION (TESTE_OK ou FALHOU), por isso nada
-- fica gravado mesmo que o ROLLBACK falte. Os objectos de teste (papeis, uma
-- pessoa, uma conta, a linha da nike em hr_regras_assiduidade e as
-- justificacoes) so existem dentro da transaccao.
--
-- Pre-requisito: 20261231800000 (justificacao do dia) aplicada no remoto.
-- Nenhuma leitura de outras organizacoes: o caso "outra organizacao" usa um
-- uuid aleatorio.
--
-- Utilizadores da nike (os mesmos de TESTE-justificacao-do-dia.sql, so ids).
-- Os papeis deles sao trocados por papeis de teste, revertidos:
--   admin     -> RH que gere a assiduidade (hr.assiduidade.gerir +
--                hr.assiduidade.justificacao.edit + hr.module.access)
--   comercial -> RH que so ve (hr.module.access; SEM gerir)
--   outro     -> a propria pessoa (picar + view.own), ligado por pessoas_contas
--                a uma pessoa criada aqui.
--
-- O dia de teste D e calculado a partir de hoje: o dia MAIS RECENTE cujo prazo
-- de 5 dias uteis ja acabou. Por construcao, D + 1 ainda esta dentro dos 5 e D
-- esta dentro de 8 (ver caso 0).
--
-- Casos:
--   0  pre-condicoes: objectos da migration, nike sem linha, papeis, pessoa,
--      matriz de permissoes, o dia D.
--   1  ACL: anon nao executa _ler, _guardar, hr_prazo_justificacao_dias nem le
--      a tabela; authenticated nao executa hr_prazo_justificacao_dias.
--   2  sem linha (5): _ler devolve 5 / gravado false para a pessoa, o RH que
--      ve e o que gere (so este com pode_alterar); a pessoa regista D+1 e e
--      recusada em D (fora do prazo, mensagem com "5 dias uteis").
--   3  _ler e _guardar recusam: sem sessao, utilizador sem papel, outra
--      organizacao; _guardar recusa a pessoa e o RH que so ve (42501) e os
--      valores 0, 31 e NULL (23514).
--   4  gravar 8: devolve 8, linha com created_by/updated_by do admin; a pessoa
--      le 8 (pela RPC e pela tabela); escrita directa na tabela recusada.
--      A pessoa regista D (dentro de 8). Regravar 10: mesma linha.
--   5  diminuir para 1: as justificacoes ja registadas ficam como estavam
--      (pendentes, nenhuma apagada nem alterada); a pessoa e recusada num dia
--      antigo (mensagem com "1 dias uteis"); o RH regista em nome dela fora do
--      prazo.
--
-- Fica por provar aqui:
--   * duas gravacoes ao mesmo tempo (ON CONFLICT) -- precisa de duas ligacoes;
--   * desempenho -- medir na nike depois do push (SELECT em ciclo de 100).
-- =============================================================================
DO $teste$
DECLARE
  k_org        constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  k_admin_id   constant uuid := 'ba0b0ebf-1bdb-43f9-b82b-a2ade29848e2';
  k_admin_auth constant uuid := '08bb24a2-e11f-4f79-b4f7-c5125332da4a';
  k_com_id     constant uuid := 'acf9f6c3-c3c7-1982-c424-da7ac2add2cb';
  k_com_auth   constant uuid := '37069e32-c4ce-47f1-f42f-9e2a89eb92a3';
  k_out_id     constant uuid := '42c020c5-cb47-b7de-8246-1a8f2ed0adf4';
  k_out_auth   constant uuid := '007a341a-4bce-9626-1efa-4593c7804ea7';
  v_tag      text := replace(gen_random_uuid()::text, '-', '');
  v_hoje     date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_claims_admin text;
  v_claims_com   text;
  v_claims_out   text;
  v_claims_ninguem text;
  v_role_rh  uuid;
  v_role_ve  uuid;
  v_role_pp  uuid;
  v_pessoa   uuid;
  v_dia      date;   -- D: o mais recente com o prazo de 5 ja acabado
  v_j_d1     uuid;   -- D+1, dentro dos 5
  v_j_d      uuid;   -- D, dentro dos 8
  v_j_rh     uuid;   -- RH, fora do prazo de 1
  v_estado   text;
  v_msg      text;
  v_int      integer;
  v_bool     boolean;
  v_bool2    boolean;
  v_ts       timestamptz;
  v_n        bigint;
  v_id1      uuid;
  v_id2      uuid;
  v_sql      text;
  r          record;
BEGIN
  v_claims_admin   := json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text;
  v_claims_com     := json_build_object('sub', k_com_auth::text,   'role', 'authenticated')::text;
  v_claims_out     := json_build_object('sub', k_out_auth::text,   'role', 'authenticated')::text;
  v_claims_ninguem := json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text;

  -- ---------------------------------------------------------------------------
  -- 0. Pre-condicoes e semente (como postgres, sem sessao)
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '', true);

  IF to_regclass('public.hr_regras_assiduidade') IS NULL
     OR to_regprocedure('public.hr_justificacao_dia_prazo(date, integer)') IS NULL
     OR to_regprocedure('public.hr_prazo_justificacao_dias(uuid)') IS NULL
     OR to_regprocedure('public.rpc_hr_regras_assiduidade_ler(uuid)') IS NULL
     OR to_regprocedure('public.rpc_hr_regras_assiduidade_guardar(uuid, integer)') IS NULL
     OR to_regprocedure('public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[])') IS NULL THEN
    RAISE EXCEPTION 'FALHOU 0: a migration 20261231991000 nao esta aplicada nesta transaccao.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_regras_assiduidade ra WHERE ra.organization_id = k_org) THEN
    RAISE EXCEPTION 'FALHOU 0: a nike ja tem linha em hr_regras_assiduidade; o caso 2 precisa de "sem linha".';
  END IF;

  SELECT count(*) INTO v_n FROM public.anew_memberships m
   WHERE m.organization_id = k_org AND m.status = 'active'
     AND m.user_id IN (k_admin_id, k_com_id, k_out_id)
     AND m.role_is_client IS NOT TRUE;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'FALHOU 0: esperava 3 membros activos nao clientes na nike, ha %.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_users u
   WHERE (u.id, u.auth_user_id) IN ((k_admin_id, k_admin_auth), (k_com_id, k_com_auth), (k_out_id, k_out_auth));
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'FALHOU 0: os ids auth dos tres utilizadores nao sao os esperados (% de 3).', v_n;
  END IF;

  -- O dia D: o mais recente cujo prazo de 5 ja acabou (hoje > prazo).
  SELECT max(s.d::date) INTO v_dia
    FROM generate_series(v_hoje - 30, v_hoje - 1, interval '1 day') AS s(d)
   WHERE public.hr_justificacao_dia_prazo(s.d::date, 5) < v_hoje;
  IF v_dia IS NULL
     OR NOT (public.hr_justificacao_dia_prazo(v_dia + 1, 5) >= v_hoje)
     OR NOT (public.hr_justificacao_dia_prazo(v_dia, 8) >= v_hoje)
     OR NOT (public.hr_justificacao_dia_prazo(v_hoje - 25, 1) < v_hoje) THEN
    RAISE EXCEPTION 'FALHOU 0: o dia D (%) nao cumpre: fora dos 5, D+1 dentro dos 5, D dentro dos 8.', v_dia;
  END IF;

  -- Papeis de teste (revertidos).
  INSERT INTO public.anew_roles (code, name, organization_id, description)
  VALUES ('teste_pz_rh_' || v_tag, 'TESTE RH que gere (revertido)', k_org, 'teste revertido')
  RETURNING id INTO v_role_rh;
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT v_role_rh, x.c FROM unnest(ARRAY['hr.assiduidade.gerir',
                                          'hr.assiduidade.justificacao.edit',
                                          'hr.module.access']) AS x(c);

  INSERT INTO public.anew_roles (code, name, organization_id, description)
  VALUES ('teste_pz_ve_' || v_tag, 'TESTE RH que so ve (revertido)', k_org, 'teste revertido')
  RETURNING id INTO v_role_ve;
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT v_role_ve, x.c FROM unnest(ARRAY['hr.module.access']) AS x(c);

  INSERT INTO public.anew_roles (code, name, organization_id, description)
  VALUES ('teste_pz_pp_' || v_tag, 'TESTE propria pessoa (revertido)', k_org, 'teste revertido')
  RETURNING id INTO v_role_pp;
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT v_role_pp, x.c FROM unnest(ARRAY['hr.assiduidade.picar',
                                          'hr.assiduidade.view.own']) AS x(c);

  UPDATE public.anew_memberships m SET role_id = v_role_rh
   WHERE m.organization_id = k_org AND m.user_id = k_admin_id;
  UPDATE public.anew_memberships m SET role_id = v_role_ve
   WHERE m.organization_id = k_org AND m.user_id = k_com_id;
  UPDATE public.anew_memberships m SET role_id = v_role_pp
   WHERE m.organization_id = k_org AND m.user_id = k_out_id;

  -- Uma pessoa nova; o "outro" passa a ser ela.
  INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
  VALUES (k_org, 'TestePZ', 'Propria ' || left(v_tag, 8))
  RETURNING id INTO v_pessoa;

  UPDATE public.pessoas_contas pc
     SET estado = 'revogada', revogada_em = now(), revogada_por = k_admin_id,
         motivo_revogacao = 'teste revertido'
   WHERE pc.organization_id = k_org AND pc.anew_user_id = k_out_id AND pc.estado = 'activa';
  INSERT INTO public.pessoas_contas (pessoa_id, organization_id, anew_user_id, ligada_por)
  VALUES (v_pessoa, k_org, k_out_id, k_admin_id);

  IF public.hr_pessoa_do_utilizador(k_out_auth, k_org) IS DISTINCT FROM v_pessoa THEN
    RAISE EXCEPTION 'FALHOU 0: hr_pessoa_do_utilizador nao devolve a pessoa de teste para o "outro".';
  END IF;
  -- O admin nao pode estar ligado a esta pessoa (senao deixava de ser RH sobre ela).
  IF public.hr_pessoa_do_utilizador(k_admin_auth, k_org) IS NOT DISTINCT FROM v_pessoa THEN
    RAISE EXCEPTION 'FALHOU 0: o admin esta ligado a pessoa de teste.';
  END IF;

  -- Matriz de permissoes de que os casos dependem.
  IF NOT public.has_anew_permission_in_org(k_admin_auth, 'hr.assiduidade.gerir', k_org)
     OR NOT public.has_anew_permission_in_org(k_admin_auth, 'hr.assiduidade.justificacao.edit', k_org)
     OR NOT public.has_anew_permission_in_org(k_com_auth, 'hr.module.access', k_org)
     OR public.has_anew_permission_in_org(k_com_auth, 'hr.assiduidade.gerir', k_org)
     OR NOT public.has_anew_permission_in_org(k_out_auth, 'hr.assiduidade.picar', k_org)
     OR public.has_anew_permission_in_org(k_out_auth, 'hr.module.access', k_org)
     OR public.has_anew_permission_in_org(k_out_auth, 'hr.assiduidade.gerir', k_org)
     OR public.has_anew_permission_in_org(k_out_auth, 'hr.assiduidade.justificacao.edit', k_org) THEN
    RAISE EXCEPTION 'FALHOU 0: a matriz de permissoes dos papeis de teste nao e a esperada.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1. ACL
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
  FOREACH v_sql IN ARRAY ARRAY[
    format('SELECT * FROM public.rpc_hr_regras_assiduidade_ler(%L::uuid)', k_org),
    format('SELECT public.rpc_hr_regras_assiduidade_guardar(%L::uuid, 8)', k_org),
    format('SELECT public.hr_prazo_justificacao_dias(%L::uuid)', k_org),
    'SELECT count(id) FROM public.hr_regras_assiduidade'
  ]
  LOOP
    EXECUTE 'SET LOCAL ROLE anon';
    v_estado := NULL; v_msg := NULL;
    BEGIN
      EXECUTE v_sql;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    EXECUTE 'RESET ROLE';
    IF v_estado IS DISTINCT FROM '42501' OR v_msg NOT LIKE 'permission denied%' THEN
      RAISE EXCEPTION 'FALHOU 1: anon nao foi recusado pela base em "%" (% %).', v_sql, coalesce(v_estado, '-'), coalesce(v_msg, '-');
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claims', v_claims_admin, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM public.hr_prazo_justificacao_dias(k_org);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  IF v_estado IS DISTINCT FROM '42501' OR v_msg NOT LIKE 'permission denied%' THEN
    RAISE EXCEPTION 'FALHOU 1: authenticated executou hr_prazo_justificacao_dias (% %).', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;

  -- ---------------------------------------------------------------------------
  -- 2. Sem linha: 5
  -- ---------------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('pessoa',      v_claims_out,   false),
      ('rh que ve',   v_claims_com,   false),
      ('rh que gere', v_claims_admin, true)
    ) AS x(nome, claims, pode)
  LOOP
    PERFORM set_config('request.jwt.claims', r.claims, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT l.prazo_justificacao_dias, l.gravado, l.updated_at, l.pode_alterar
      INTO v_int, v_bool, v_ts, v_bool2
      FROM public.rpc_hr_regras_assiduidade_ler(k_org) l;
    EXECUTE 'RESET ROLE';
    IF v_int IS DISTINCT FROM 5 OR v_bool IS DISTINCT FROM false OR v_ts IS NOT NULL OR v_bool2 IS DISTINCT FROM r.pode THEN
      RAISE EXCEPTION 'FALHOU 2 (%): _ler sem linha devolveu (%, %, %, %); esperava (5, false, NULL, %).',
        r.nome, v_int, v_bool, v_ts, v_bool2, r.pode;
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claims', v_claims_out, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_j_d1 := public.rpc_hr_justificacao_dia_registar(
              k_org, v_pessoa, v_dia + 1, 'transporte', false,
              TIME '09:00', TIME '10:00', 'Comboio suprimido, dentro dos 5 dias');
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM public.rpc_hr_justificacao_dia_registar(
              k_org, v_pessoa, v_dia, 'transporte', false,
              TIME '09:00', TIME '10:00', 'Ja fora dos 5 dias');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  IF v_j_d1 IS NULL THEN
    RAISE EXCEPTION 'FALHOU 2: a pessoa nao registou D+1 (%), dentro dos 5.', v_dia + 1;
  END IF;
  IF v_estado IS DISTINCT FROM '23514' OR v_msg NOT LIKE 'justificacao_dia_fora_do_prazo%(5 dias uteis)%' THEN
    RAISE EXCEPTION 'FALHOU 2: D (%) sem linha devia dar fora do prazo com 5 dias; veio % "%".', v_dia, coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;

  -- ---------------------------------------------------------------------------
  -- 3. Recusas de _ler e _guardar
  -- ---------------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('ler sem sessao',          '',                 format('SELECT * FROM public.rpc_hr_regras_assiduidade_ler(%L::uuid)', k_org),                '42501', 'regras_assiduidade_sem_permissao%'),
      ('ler sem papel',           v_claims_ninguem,   format('SELECT * FROM public.rpc_hr_regras_assiduidade_ler(%L::uuid)', k_org),                '42501', 'regras_assiduidade_sem_permissao%'),
      ('ler outra organizacao',   v_claims_admin,     format('SELECT * FROM public.rpc_hr_regras_assiduidade_ler(%L::uuid)', gen_random_uuid()),    '42501', 'regras_assiduidade_sem_permissao%'),
      ('guardar sem sessao',      '',                 format('SELECT public.rpc_hr_regras_assiduidade_guardar(%L::uuid, 8)', k_org),               '42501', 'regras_assiduidade_sem_permissao%'),
      ('guardar sem papel',       v_claims_ninguem,   format('SELECT public.rpc_hr_regras_assiduidade_guardar(%L::uuid, 8)', k_org),               '42501', 'regras_assiduidade_sem_permissao%'),
      ('guardar pela pessoa',     v_claims_out,       format('SELECT public.rpc_hr_regras_assiduidade_guardar(%L::uuid, 8)', k_org),               '42501', 'regras_assiduidade_sem_permissao%'),
      ('guardar pelo rh que ve',  v_claims_com,       format('SELECT public.rpc_hr_regras_assiduidade_guardar(%L::uuid, 8)', k_org),               '42501', 'regras_assiduidade_sem_permissao%'),
      ('guardar outra org',       v_claims_admin,     format('SELECT public.rpc_hr_regras_assiduidade_guardar(%L::uuid, 8)', gen_random_uuid()),   '42501', 'regras_assiduidade_sem_permissao%'),
      ('guardar 0',               v_claims_admin,     format('SELECT public.rpc_hr_regras_assiduidade_guardar(%L::uuid, 0)', k_org),               '23514', 'regras_assiduidade_prazo_invalido%'),
      ('guardar 31',              v_claims_admin,     format('SELECT public.rpc_hr_regras_assiduidade_guardar(%L::uuid, 31)', k_org),              '23514', 'regras_assiduidade_prazo_invalido%'),
      ('guardar NULL',            v_claims_admin,     format('SELECT public.rpc_hr_regras_assiduidade_guardar(%L::uuid, NULL)', k_org),            '23514', 'regras_assiduidade_prazo_invalido%')
    ) AS x(nome, claims, sql, sqlstate, prefixo)
  LOOP
    PERFORM set_config('request.jwt.claims', r.claims, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_estado := NULL; v_msg := NULL;
    BEGIN
      EXECUTE r.sql;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    EXECUTE 'RESET ROLE';
    IF v_estado IS DISTINCT FROM r.sqlstate OR v_msg NOT LIKE r.prefixo THEN
      RAISE EXCEPTION 'FALHOU 3 (%): esperava % "%", veio % "%".',
        r.nome, r.sqlstate, r.prefixo, coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.hr_regras_assiduidade) THEN
    RAISE EXCEPTION 'FALHOU 3: uma chamada recusada deixou uma linha em hr_regras_assiduidade.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 4. Gravar 8
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', v_claims_admin, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_int := public.rpc_hr_regras_assiduidade_guardar(k_org, 8);
  EXECUTE 'RESET ROLE';
  IF v_int IS DISTINCT FROM 8 THEN
    RAISE EXCEPTION 'FALHOU 4: _guardar(8) devolveu %.', v_int;
  END IF;
  SELECT ra.id INTO v_id1 FROM public.hr_regras_assiduidade ra
   WHERE ra.organization_id = k_org AND ra.prazo_justificacao_dias = 8
     AND ra.created_by = k_admin_id AND ra.updated_by = k_admin_id;
  IF v_id1 IS NULL THEN
    RAISE EXCEPTION 'FALHOU 4: a linha da nike nao ficou com 8 e com o admin em created_by/updated_by.';
  END IF;

  -- A pessoa le 8, pela RPC e pela tabela.
  PERFORM set_config('request.jwt.claims', v_claims_out, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT l.prazo_justificacao_dias, l.gravado, l.pode_alterar INTO v_int, v_bool, v_bool2
    FROM public.rpc_hr_regras_assiduidade_ler(k_org) l;
  SELECT count(*) INTO v_n FROM public.hr_regras_assiduidade ra
   WHERE ra.organization_id = k_org AND ra.prazo_justificacao_dias = 8;
  EXECUTE 'RESET ROLE';
  IF v_int IS DISTINCT FROM 8 OR v_bool IS DISTINCT FROM true OR v_bool2 IS DISTINCT FROM false OR v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU 4: a pessoa leu (%, gravado %, pode_alterar %) e % linha(s) pela tabela; esperava (8, true, false) e 1.',
      v_int, v_bool, v_bool2, v_n;
  END IF;

  -- Ninguem escreve directamente na tabela, nem quem gere.
  FOREACH v_sql IN ARRAY ARRAY[
    format('INSERT INTO public.hr_regras_assiduidade (organization_id, prazo_justificacao_dias) VALUES (%L::uuid, 9)', k_org),
    format('UPDATE public.hr_regras_assiduidade SET prazo_justificacao_dias = 9 WHERE organization_id = %L::uuid', k_org),
    format('DELETE FROM public.hr_regras_assiduidade WHERE organization_id = %L::uuid', k_org)
  ]
  LOOP
    PERFORM set_config('request.jwt.claims', v_claims_admin, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_estado := NULL; v_msg := NULL;
    BEGIN
      EXECUTE v_sql;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    EXECUTE 'RESET ROLE';
    IF v_estado IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'FALHOU 4: escrita directa nao foi recusada em "%" (% %).', v_sql, coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
    END IF;
  END LOOP;

  -- Com 8, a pessoa ja regista D.
  PERFORM set_config('request.jwt.claims', v_claims_out, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_j_d := public.rpc_hr_justificacao_dia_registar(
             k_org, v_pessoa, v_dia, 'transporte', false,
             TIME '09:00', TIME '10:00', 'Dentro dos 8 dias da organizacao');
  EXECUTE 'RESET ROLE';
  IF v_j_d IS NULL THEN
    RAISE EXCEPTION 'FALHOU 4: com prazo 8 a pessoa nao registou D (%).', v_dia;
  END IF;

  -- Regravar 10: a mesma linha.
  PERFORM set_config('request.jwt.claims', v_claims_admin, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_int := public.rpc_hr_regras_assiduidade_guardar(k_org, 10);
  EXECUTE 'RESET ROLE';
  SELECT ra.id INTO v_id2 FROM public.hr_regras_assiduidade ra WHERE ra.organization_id = k_org;
  SELECT count(*) INTO v_n FROM public.hr_regras_assiduidade ra WHERE ra.organization_id = k_org;
  IF v_int IS DISTINCT FROM 10 OR v_id2 IS DISTINCT FROM v_id1 OR v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU 4: regravar devolveu %, linha % (antes %), % linha(s).', v_int, v_id2, v_id1, v_n;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 5. Diminuir para 1: nada retroactivo
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', v_claims_admin, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_int := public.rpc_hr_regras_assiduidade_guardar(k_org, 1);
  EXECUTE 'RESET ROLE';
  IF v_int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU 5: _guardar(1) devolveu %.', v_int;
  END IF;

  SELECT count(*) INTO v_n FROM public.pessoas_justificacoes_dia j
   WHERE j.id IN (v_j_d1, v_j_d) AND j.estado = 'pendente';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'FALHOU 5: depois de baixar o prazo, so % das 2 justificacoes ja registadas continuam pendentes.', v_n;
  END IF;

  PERFORM set_config('request.jwt.claims', v_claims_out, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM public.rpc_hr_justificacao_dia_registar(
              k_org, v_pessoa, v_hoje - 25, 'outro', false,
              TIME '09:00', TIME '10:00', 'Fora do prazo de 1 dia');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  IF v_estado IS DISTINCT FROM '23514' OR v_msg NOT LIKE 'justificacao_dia_fora_do_prazo%(1 dias uteis)%' THEN
    RAISE EXCEPTION 'FALHOU 5: com prazo 1 a pessoa devia ser recusada em %; veio % "%".', v_hoje - 25, coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;

  -- O RH regista em nome da pessoa, fora do prazo.
  PERFORM set_config('request.jwt.claims', v_claims_admin, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_j_rh := public.rpc_hr_justificacao_dia_registar(
              k_org, v_pessoa, v_hoje - 25, 'assunto_pessoal', false,
              TIME '09:00', TIME '10:00', 'Registado pelo RH a pedido da pessoa');
  EXECUTE 'RESET ROLE';
  IF v_j_rh IS NULL OR NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j
                                    WHERE j.id = v_j_rh AND j.created_by = k_admin_id AND j.estado = 'pendente') THEN
    RAISE EXCEPTION 'FALHOU 5: o RH nao registou fora do prazo em nome da pessoa.';
  END IF;

  RAISE EXCEPTION 'TESTE_OK: prazo configuravel (sem linha = 5, D % recusado e D+1 aceite; 8 aceita D; 1 recusa; nada retroactivo; RH fora do prazo; ACL e permissoes).', v_dia;
END;
$teste$;
