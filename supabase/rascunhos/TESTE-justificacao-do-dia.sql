-- =============================================================================
-- TESTE-justificacao-do-dia.sql -- prova das migrations
--   20261231790000_hr_acessos_sensiveis_campos_justificacoes (A, o CHECK)
--   20261231800000_justificacao_do_dia                       (B)
--
-- NAO CORRER sem autorizacao explicita para escritas REVERTIDAS na org nike.
-- So base RH (uetjghdkwbywbftedtth), a partir do worktree rh-pessoas
-- (confirmar supabase/.temp/project-ref). Nunca a principal, nunca a Mudelar.
--
-- Como correr (so com essa autorizacao, ANTES do db push, numa so ligacao):
--   BEGIN;
--   <conteudo inteiro da migration A, 20261231790000>
--   <conteudo inteiro da migration B, 20261231800000>
--   <este ficheiro>
--   ROLLBACK;
-- O bloco acaba SEMPRE com RAISE EXCEPTION (TESTE_OK ou FALHOU), por isso nada
-- fica gravado mesmo que o ROLLBACK falte. Os objectos de teste (papeis, uma
-- pessoa, uma conta, um periodo de 2001-02, uma funcao e um gatilho na tabela
-- NOVA) so existem dentro da transaccao.
--
-- Bloqueios: as escritas tocam linhas novas da nike e anew_memberships de tres
-- utilizadores de teste da nike. O gatilho provocado do caso 12 e criado na
-- tabela NOVA (pessoas_justificacoes_dia), que mais ninguem ve: nao bloqueia
-- nenhuma tabela partilhada.
--
-- Utilizadores da nike (os mesmos de TESTE-teste-nif-e-dono.sql, so ids). Os
-- papeis deles sao trocados por papeis de teste, revertidos:
--   admin     -> RH completo   (justificacao.edit + justificacao.view + faltas.edit)
--   comercial -> RH que decide (justificacao.edit + faltas.edit, SEM justificacao.view)
--   outro     -> a propria pessoa (picar + view.own), ligado por pessoas_contas
--                a uma pessoa criada aqui.
--
-- Casos:
--   0   pre-condicoes: objectos criados, CHECK com justificacao_dia, papeis e
--       pessoa de teste, matriz de permissoes.
--   1   ACL: anon nao executa as RPCs nem le a tabela.
--   2   registar: propria pessoa ok; repetido -> ja_enviada (23505); futuro;
--       fora do prazo (pessoa) e ok para o RH; outra pessoa -> sem_permissao;
--       motivo curto; 5 anexos; periodo invertido.
--   3   tabela directa: a pessoa ve so as suas; ninguem le motivo; ninguem
--       insere.
--   4   listar: a pessoa recebe o seu motivo de consulta medica; o RH sem
--       justificacao.view recebe NULL + texto_sensivel; transporte sai; a
--       pessoa nao lista outra; RH sem filtro -> intervalo_obrigatorio.
--   5   ver texto e quem leu: sem justificacao.view -> 42501; com ela devolve
--       o texto e regista o acesso ANTES (linha em pessoas_acessos_sensiveis).
--   6   decidir/recusar: a pessoa nao decide; recusa sem motivo; decisao
--       invalida; recusa ok sem falta; decidir de novo -> ja_decidida; o
--       reenvio depois da recusa passa.
--   7   aceitar: consulta medica paga -> falta doenca remunerada justificada,
--       justificacao da falta com texto NEUTRO (o motivo nao vai para la);
--       atraso nao pago -> falta atraso, texto copiado.
--   8   registar com falta activa a cruzar -> ja_ha_falta.
--   9   ramo idempotente: divergente (remunerada); reaproveita a falta sem
--       criar outra; falta ja decidida -> falta_ja_decidida (a recusa fica);
--       falta sobreposta -> falta_sobreposta.
--   10  mes fechado: sem confirmacao -> 55000 e nada escrito; com
--       confirmacao -> aceite com mes_fechado_na_decisao; recusar nao pede.
--   11  anular a falta -> sem_efeito; o periodo fica livre para reenviar.
--   12  atomicidade: a ultima escrita da aceitacao falha -> nem falta, nem
--       justificacao da falta, e a justificacao do dia continua pendente.
--   13  ninguem decide a sua propria: o admin (RH completo) ligado a uma
--       ficha nao aceita (paga, nao paga) nem recusa a sua -> 42501
--       justificacao_dia_propria_decisao, nada escrito; nao regista a sua
--       fora do prazo; outro RH decide-a normalmente. (O caso 6 "a pessoa
--       decide" passa a dar propria_decisao: a guarda vem antes da permissao.)
--
-- Fica por provar aqui:
--   * duas pessoas do RH a aceitar ao mesmo tempo (FOR UPDATE) -- precisa de
--     duas ligacoes;
--   * falta 'corrigida' (o gatilho trata-a como a anulada; o fluxo de
--     correccao das faltas nao e chamado aqui);
--   * desempenho de _listar no calendario (modo mes) -- medir na nike depois.
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
  k_motivo_med constant text := 'Consulta de rotina no centro de saude, analises ao sangue';
  k_motivo_tr  constant text := 'Comboio suprimido, cheguei 40 minutos depois';
  k_dia_fech   constant date := DATE '2001-02-14';
  v_tag      text := replace(gen_random_uuid()::text, '-', '');
  v_hoje     date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_claims_admin text;
  v_claims_com   text;
  v_claims_out   text;
  v_role_rh  uuid;
  v_role_dec uuid;
  v_role_pp  uuid;
  v_pessoa   uuid;
  v_pessoa2  uuid;
  v_j1  uuid;  -- consulta medica, hoje 09-10 (propria)
  v_j2  uuid;  -- transporte/atraso, hoje 10:00-10:30 (propria) -> recusada
  v_j2b uuid;  -- reenvio de j2 -> aceite nao paga
  v_j3  uuid;  -- RH, hoje-30 (fora do prazo da pessoa)
  v_j4  uuid;  -- idempotente: reaproveita
  v_j5  uuid;  -- idempotente: falta ja decidida
  v_j6  uuid;  -- falta sobreposta
  v_j7  uuid;  -- mes fechado, aceitar
  v_j8  uuid;  -- mes fechado, recusar
  v_j9  uuid;  -- reenvio depois de sem_efeito
  v_j10 uuid;  -- atomicidade
  v_j11 uuid;  -- a propria do admin (RH completo), registada por outro RH
  v_f1  uuid;
  v_f2  uuid;
  v_fx  uuid;
  v_fy  uuid;
  v_estado text;
  v_msg    text;
  v_txt    text;
  v_txt2   text;
  v_bool   boolean;
  v_bool2  boolean;
  v_n      bigint;
  v_n2     bigint;
  v_sql    text;
  r        record;
BEGIN
  v_claims_admin := json_build_object('sub', k_admin_auth::text, 'role', 'authenticated')::text;
  v_claims_com   := json_build_object('sub', k_com_auth::text,   'role', 'authenticated')::text;
  v_claims_out   := json_build_object('sub', k_out_auth::text,   'role', 'authenticated')::text;

  -- ---------------------------------------------------------------------------
  -- 0. Pre-condicoes e semente (como postgres, sem sessao)
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '', true);

  IF to_regclass('public.pessoas_justificacoes_dia') IS NULL
     OR to_regprocedure('public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[])') IS NULL
     OR to_regprocedure('public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean)') IS NULL
     OR to_regprocedure('public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean)') IS NULL
     OR to_regprocedure('public.rpc_hr_justificacao_dia_ver_texto(uuid)') IS NULL
     OR to_regprocedure('public.rpc_hr_justificacao_dia_acessos(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FALHOU 0: a migration B nao esta aplicada nesta transaccao.';
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_txt
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_acessos_sensiveis')
     AND c.conname = 'pessoas_acessos_sensiveis_campo_valido';
  IF NOT EXISTS (SELECT 1 FROM regexp_matches(coalesce(v_txt, ''), '''([a-z_]+)''::text', 'g') AS m
                  WHERE m[1] = 'justificacao_dia') THEN
    RAISE EXCEPTION 'FALHOU 0: o CHECK de pessoas_acessos_sensiveis.campo nao aceita justificacao_dia (migration A em falta).';
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
  IF EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp
              WHERE pp.organization_id = k_org AND pp.ano = 2001 AND pp.mes = 2) THEN
    RAISE EXCEPTION 'FALHOU 0: a nike ja tem periodo de processamento 2001-02; escolher outro mes para o caso 10.';
  END IF;
  -- Os casos 7, 9 e 12 aceitam em dias de hoje-5 a hoje: esses meses nao podem
  -- estar fechados, senao dao justificacao_dia_mes_fechado por outra razao.
  IF EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp
              WHERE pp.organization_id = k_org AND pp.estado = 'fechado'
                AND (pp.ano, pp.mes) IN ((extract(year FROM v_hoje)::int, extract(month FROM v_hoje)::int),
                                         (extract(year FROM v_hoje - 5)::int, extract(month FROM v_hoje - 5)::int))) THEN
    RAISE EXCEPTION 'FALHOU 0: a nike tem fechado o mes de hoje ou o de ha 5 dias; os casos de aceitar precisam de mes aberto.';
  END IF;

  -- Papeis de teste (revertidos).
  INSERT INTO public.anew_roles (code, name, organization_id, description)
  VALUES ('teste_jd_rh_' || v_tag, 'TESTE RH completo (revertido)', k_org, 'teste revertido')
  RETURNING id INTO v_role_rh;
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT v_role_rh, x.c FROM unnest(ARRAY['hr.assiduidade.justificacao.edit',
                                          'hr.assiduidade.justificacao.view',
                                          'hr.assiduidade.faltas.edit']) AS x(c);

  INSERT INTO public.anew_roles (code, name, organization_id, description)
  VALUES ('teste_jd_dec_' || v_tag, 'TESTE RH que decide (revertido)', k_org, 'teste revertido')
  RETURNING id INTO v_role_dec;
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT v_role_dec, x.c FROM unnest(ARRAY['hr.assiduidade.justificacao.edit',
                                           'hr.assiduidade.faltas.edit']) AS x(c);

  INSERT INTO public.anew_roles (code, name, organization_id, description)
  VALUES ('teste_jd_pp_' || v_tag, 'TESTE propria pessoa (revertido)', k_org, 'teste revertido')
  RETURNING id INTO v_role_pp;
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT v_role_pp, x.c FROM unnest(ARRAY['hr.assiduidade.picar',
                                          'hr.assiduidade.view.own']) AS x(c);

  UPDATE public.anew_memberships m SET role_id = v_role_rh
   WHERE m.organization_id = k_org AND m.user_id = k_admin_id;
  UPDATE public.anew_memberships m SET role_id = v_role_dec
   WHERE m.organization_id = k_org AND m.user_id = k_com_id;
  UPDATE public.anew_memberships m SET role_id = v_role_pp
   WHERE m.organization_id = k_org AND m.user_id = k_out_id;

  -- Duas pessoas novas; o "outro" passa a ser a primeira.
  INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
  VALUES (k_org, 'TesteJD', 'Propria ' || left(v_tag, 8))
  RETURNING id INTO v_pessoa;
  INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
  VALUES (k_org, 'TesteJD', 'Outra ' || left(v_tag, 8))
  RETURNING id INTO v_pessoa2;

  UPDATE public.pessoas_contas pc
     SET estado = 'revogada', revogada_em = now(), revogada_por = k_admin_id,
         motivo_revogacao = 'teste revertido'
   WHERE pc.organization_id = k_org AND pc.anew_user_id = k_out_id AND pc.estado = 'activa';
  INSERT INTO public.pessoas_contas (pessoa_id, organization_id, anew_user_id, ligada_por)
  VALUES (v_pessoa, k_org, k_out_id, k_admin_id);

  IF public.hr_pessoa_do_utilizador(k_out_auth, k_org) IS DISTINCT FROM v_pessoa THEN
    RAISE EXCEPTION 'FALHOU 0: hr_pessoa_do_utilizador nao devolve a pessoa de teste para o "outro".';
  END IF;

  -- Matriz de permissoes de que os casos dependem.
  IF NOT public.has_anew_permission_in_org(k_admin_auth, 'hr.assiduidade.justificacao.view', k_org)
     OR NOT public.has_anew_permission_in_org(k_com_auth, 'hr.assiduidade.justificacao.edit', k_org)
     OR NOT public.has_anew_permission_in_org(k_com_auth, 'hr.assiduidade.faltas.edit', k_org)
     OR public.has_anew_permission_in_org(k_com_auth, 'hr.assiduidade.justificacao.view', k_org)
     OR NOT public.has_anew_permission_in_org(k_out_auth, 'hr.assiduidade.picar', k_org)
     OR NOT public.has_anew_permission_in_org(k_out_auth, 'hr.assiduidade.view.own', k_org)
     OR public.has_anew_permission_in_org(k_out_auth, 'hr.assiduidade.justificacao.edit', k_org) THEN
    RAISE EXCEPTION 'FALHOU 0: a matriz de permissoes dos papeis de teste nao e a esperada.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1. ACL: anon nao executa nem le
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
  FOREACH v_sql IN ARRAY ARRAY[
    format('SELECT public.rpc_hr_justificacao_dia_registar(%L::uuid, %L::uuid, %L::date, ''outro'', false, ''09:00''::time, ''10:00''::time, ''abcde'')',
           k_org, v_pessoa, v_hoje),
    format('SELECT * FROM public.rpc_hr_justificacao_dia_listar(%L::uuid)', k_org),
    format('SELECT * FROM public.rpc_hr_justificacao_dia_decidir(%L::uuid, ''recusar'', ''abcde'')', gen_random_uuid()),
    format('SELECT public.rpc_hr_justificacao_dia_ver_texto(%L::uuid)', gen_random_uuid()),
    format('SELECT * FROM public.rpc_hr_justificacao_dia_acessos(%L::uuid)', gen_random_uuid()),
    'SELECT count(id) FROM public.pessoas_justificacoes_dia'
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

  -- ---------------------------------------------------------------------------
  -- 2. Registar
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', v_claims_out, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_j1 := public.rpc_hr_justificacao_dia_registar(
            k_org, v_pessoa, v_hoje, 'consulta_medica', false,
            TIME '09:00', TIME '10:00', k_motivo_med, NULL, ARRAY['declaracao.pdf']);
  v_j2 := public.rpc_hr_justificacao_dia_registar(
            k_org, v_pessoa, v_hoje, 'transporte', true,
            TIME '10:00', TIME '10:30', k_motivo_tr, TIME '10:40');
  EXECUTE 'RESET ROLE';
  IF v_j1 IS NULL OR v_j2 IS NULL THEN
    RAISE EXCEPTION 'FALHOU 2: a propria pessoa nao registou.';
  END IF;
  SELECT j.estado, j.minutos, j.created_by INTO v_txt, v_n, v_fx
    FROM public.pessoas_justificacoes_dia j WHERE j.id = v_j1;
  IF v_txt <> 'pendente' OR v_n <> 60 OR v_fx IS DISTINCT FROM k_out_id THEN
    RAISE EXCEPTION 'FALHOU 2: j1 ficou % / % minutos / autor %.', v_txt, v_n, v_fx;
  END IF;

  -- Casos de recusa no registar: (quem, sql, sqlstate, prefixo da mensagem)
  FOR r IN
    SELECT * FROM (VALUES
      ('repetido', v_claims_out,
       format('SELECT public.rpc_hr_justificacao_dia_registar(%L::uuid, %L::uuid, %L::date, ''outro'', false, ''09:00''::time, ''09:30''::time, ''outra vez'')', k_org, v_pessoa, v_hoje),
       '23505', 'justificacao_dia_ja_enviada%'),
      ('futuro', v_claims_out,
       format('SELECT public.rpc_hr_justificacao_dia_registar(%L::uuid, %L::uuid, %L::date, ''outro'', false, ''09:00''::time, ''10:00''::time, ''amanha'')', k_org, v_pessoa, v_hoje + 1),
       '23514', 'justificacao_dia_data_futura%'),
      ('fora do prazo', v_claims_out,
       format('SELECT public.rpc_hr_justificacao_dia_registar(%L::uuid, %L::uuid, %L::date, ''outro'', false, ''09:00''::time, ''10:00''::time, ''tarde demais'')', k_org, v_pessoa, v_hoje - 30),
       '23514', 'justificacao_dia_fora_do_prazo%'),
      ('outra pessoa', v_claims_out,
       format('SELECT public.rpc_hr_justificacao_dia_registar(%L::uuid, %L::uuid, %L::date, ''outro'', false, ''09:00''::time, ''10:00''::time, ''pela colega'')', k_org, v_pessoa2, v_hoje),
       '42501', 'justificacao_dia_sem_permissao%'),
      ('motivo curto', v_claims_out,
       format('SELECT public.rpc_hr_justificacao_dia_registar(%L::uuid, %L::uuid, %L::date, ''outro'', false, ''11:00''::time, ''12:00''::time, ''  ab  '')', k_org, v_pessoa, v_hoje),
       '23514', 'justificacao_dia_motivo_invalido%'),
      ('cinco anexos', v_claims_out,
       format('SELECT public.rpc_hr_justificacao_dia_registar(%L::uuid, %L::uuid, %L::date, ''outro'', false, ''11:00''::time, ''12:00''::time, ''com anexos'', NULL, ARRAY[''a'',''b'',''c'',''d'',''e''])', k_org, v_pessoa, v_hoje),
       '23514', 'justificacao_dia_anexos_invalidos%'),
      ('periodo invertido', v_claims_out,
       format('SELECT public.rpc_hr_justificacao_dia_registar(%L::uuid, %L::uuid, %L::date, ''outro'', false, ''12:00''::time, ''11:00''::time, ''ao contrario'')', k_org, v_pessoa, v_hoje),
       '23514', 'justificacao_dia_periodo_invalido%'),
      ('tipo invalido', v_claims_out,
       format('SELECT public.rpc_hr_justificacao_dia_registar(%L::uuid, %L::uuid, %L::date, ''ferias'', false, ''11:00''::time, ''12:00''::time, ''nao existe'')', k_org, v_pessoa, v_hoje),
       '23514', 'justificacao_dia_tipo_invalido%')
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
      RAISE EXCEPTION 'FALHOU 2 (%): esperava % "%", veio % "%".',
        r.nome, r.sqlstate, r.prefixo, coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
    END IF;
  END LOOP;

  -- O RH regista em nome da pessoa, fora do prazo dela.
  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_j3 := public.rpc_hr_justificacao_dia_registar(
            k_org, v_pessoa, v_hoje - 30, 'assunto_pessoal', false,
            TIME '09:00', TIME '10:00', 'Registado pelo RH a pedido da pessoa');
  EXECUTE 'RESET ROLE';
  IF v_j3 IS NULL OR NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j
                                  WHERE j.id = v_j3 AND j.created_by = k_com_id AND j.estado = 'pendente') THEN
    RAISE EXCEPTION 'FALHOU 2: o RH nao registou fora do prazo em nome da pessoa.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 3. A tabela directamente
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', v_claims_out, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(j.id) INTO v_n FROM public.pessoas_justificacoes_dia j;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_n2 FROM public.pessoas_justificacoes_dia j WHERE j.pessoa_id = v_pessoa;
  IF v_n <> v_n2 OR v_n <> 3 THEN
    RAISE EXCEPTION 'FALHOU 3: a pessoa ve % linhas pela tabela, devia ver as suas % (3).', v_n, v_n2;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('pessoa le motivo', v_claims_out, 'SELECT count(motivo) FROM public.pessoas_justificacoes_dia'),
      ('RH le motivo',     v_claims_com, 'SELECT count(motivo) FROM public.pessoas_justificacoes_dia'),
      ('RH completo le motivo', v_claims_admin, 'SELECT count(motivo) FROM public.pessoas_justificacoes_dia'),
      ('pessoa insere', v_claims_out,
       format('INSERT INTO public.pessoas_justificacoes_dia (organization_id, pessoa_id, data, tipo, de_atraso, periodo_inicio, periodo_fim, motivo) VALUES (%L, %L, %L, ''outro'', false, ''13:00'', ''14:00'', ''directo'')', k_org, v_pessoa, v_hoje)),
      ('RH actualiza', v_claims_com,
       format('UPDATE public.pessoas_justificacoes_dia SET estado = ''recusada'' WHERE id = %L', v_j1)),
      ('RH apaga', v_claims_com,
       format('DELETE FROM public.pessoas_justificacoes_dia WHERE id = %L', v_j1))
    ) AS x(nome, claims, sql)
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
    IF v_estado IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'FALHOU 3 (%): a base nao recusou (% %).', r.nome, coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 4. Listar
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', v_claims_out, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.rpc_hr_justificacao_dia_listar(k_org) l;
  SELECT l.motivo, l.texto_sensivel INTO v_txt, v_bool
    FROM public.rpc_hr_justificacao_dia_listar(k_org) l WHERE l.id = v_j1;
  EXECUTE 'RESET ROLE';
  IF v_n <> 3 OR v_txt IS DISTINCT FROM k_motivo_med OR v_bool IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU 4: a pessoa listou % (3) e o seu motivo medico veio "%" / sensivel %.', v_n, v_txt, v_bool;
  END IF;

  PERFORM set_config('request.jwt.claims', v_claims_out, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM * FROM public.rpc_hr_justificacao_dia_listar(k_org, v_pessoa2);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  IF v_estado IS DISTINCT FROM '42501' OR v_msg NOT LIKE 'justificacao_dia_sem_permissao%' THEN
    RAISE EXCEPTION 'FALHOU 4: a pessoa listou outra pessoa (% %).', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;

  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT l.motivo, l.texto_sensivel INTO v_txt, v_bool
    FROM public.rpc_hr_justificacao_dia_listar(k_org, NULL, NULL, NULL, true) l WHERE l.id = v_j1;
  SELECT l.motivo, l.texto_sensivel INTO v_txt2, v_bool2
    FROM public.rpc_hr_justificacao_dia_listar(k_org, NULL, NULL, NULL, true) l WHERE l.id = v_j2;
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM * FROM public.rpc_hr_justificacao_dia_listar(k_org);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  IF v_txt IS NOT NULL OR v_bool IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU 4: o RH sem justificacao.view recebeu o motivo medico ("%", sensivel %).', v_txt, v_bool;
  END IF;
  IF v_txt2 IS DISTINCT FROM k_motivo_tr OR v_bool2 IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU 4: o RH nao recebeu o motivo de transporte ("%", sensivel %).', v_txt2, v_bool2;
  END IF;
  IF v_estado IS DISTINCT FROM '22023' OR v_msg NOT LIKE 'justificacao_dia_intervalo_obrigatorio%' THEN
    RAISE EXCEPTION 'FALHOU 4: o RH varreu a organizacao sem filtro (% %).', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;

  -- ---------------------------------------------------------------------------
  -- 5. Ver texto e quem leu
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM public.rpc_hr_justificacao_dia_ver_texto(v_j1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  IF v_estado IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FALHOU 5: o RH sem justificacao.view leu o texto (% %).', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;

  SELECT count(*) INTO v_n FROM public.pessoas_acessos_sensiveis a
   WHERE a.pessoa_id = v_pessoa AND a.organization_id = k_org AND a.campo = 'justificacao_dia';

  PERFORM set_config('request.jwt.claims', v_claims_admin, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_txt := public.rpc_hr_justificacao_dia_ver_texto(v_j1);
  SELECT count(*) INTO v_n2 FROM public.rpc_hr_justificacao_dia_acessos(v_j1) x;
  EXECUTE 'RESET ROLE';
  IF v_txt IS DISTINCT FROM k_motivo_med THEN
    RAISE EXCEPTION 'FALHOU 5: ver texto devolveu "%".', v_txt;
  END IF;
  IF (SELECT count(*) FROM public.pessoas_acessos_sensiveis a
       WHERE a.pessoa_id = v_pessoa AND a.organization_id = k_org AND a.campo = 'justificacao_dia'
         AND a.accao = 'revelar' AND a.anew_user_id = k_admin_id AND a.origem = 'utilizador') <> v_n + 1 THEN
    RAISE EXCEPTION 'FALHOU 5: a revelacao nao ficou registada em pessoas_acessos_sensiveis.';
  END IF;
  IF v_n2 < 1 THEN
    RAISE EXCEPTION 'FALHOU 5: quem leu nao devolveu a leitura acabada de fazer.';
  END IF;

  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_estado := NULL;
  BEGIN
    PERFORM * FROM public.rpc_hr_justificacao_dia_acessos(v_j1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  IF v_estado IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FALHOU 5: o RH sem justificacao.view viu quem leu.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 6. Decidir: recusar
  -- ---------------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      -- A guarda da propria justificacao vem antes da de permissao.
      ('a pessoa decide a sua', v_claims_out,
       format('SELECT * FROM public.rpc_hr_justificacao_dia_decidir(%L::uuid, ''recusar'', ''nao posso'')', v_j2),
       '42501', 'justificacao_dia_propria_decisao%'),
      ('recusa sem motivo', v_claims_com,
       format('SELECT * FROM public.rpc_hr_justificacao_dia_decidir(%L::uuid, ''recusar'', ''  '')', v_j2),
       '23514', 'justificacao_dia_recusa_sem_motivo%'),
      ('decisao invalida', v_claims_com,
       format('SELECT * FROM public.rpc_hr_justificacao_dia_decidir(%L::uuid, ''aprovar'')', v_j2),
       '23514', 'justificacao_dia_decisao_invalida%'),
      ('inexistente', v_claims_com,
       format('SELECT * FROM public.rpc_hr_justificacao_dia_decidir(%L::uuid, ''recusar'', ''abcde'')', gen_random_uuid()),
       '23503', 'justificacao_dia_inexistente%')
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
      RAISE EXCEPTION 'FALHOU 6 (%): esperava % "%", veio % "%".',
        r.nome, r.sqlstate, r.prefixo, coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM public.pessoas_faltas f WHERE f.pessoa_id = v_pessoa;

  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT d.falta_id, d.mes_fechado INTO v_fx, v_bool
    FROM public.rpc_hr_justificacao_dia_decidir(v_j2, 'recusar', 'Sem comprovativo do operador') d;
  EXECUTE 'RESET ROLE';
  IF v_fx IS NOT NULL OR v_bool IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU 6: recusar devolveu falta % / mes fechado %.', v_fx, v_bool;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j
                  WHERE j.id = v_j2 AND j.estado = 'recusada' AND j.decidida_por = k_com_id
                    AND j.decidida_em IS NOT NULL AND j.motivo_recusa = 'Sem comprovativo do operador'
                    AND j.falta_id IS NULL) THEN
    RAISE EXCEPTION 'FALHOU 6: a recusa nao ficou registada como devia.';
  END IF;
  IF (SELECT count(*) FROM public.pessoas_faltas f WHERE f.pessoa_id = v_pessoa) <> v_n THEN
    RAISE EXCEPTION 'FALHOU 6: recusar mexeu em faltas.';
  END IF;

  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM * FROM public.rpc_hr_justificacao_dia_decidir(v_j2, 'aceitar_paga');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  IF v_msg IS NULL OR v_msg NOT LIKE 'justificacao_dia_ja_decidida%' THEN
    RAISE EXCEPTION 'FALHOU 6: decidiu duas vezes a mesma justificacao (% %).', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;

  -- O reenvio depois da recusa passa (a recusada nao bloqueia o indice).
  PERFORM set_config('request.jwt.claims', v_claims_out, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_j2b := public.rpc_hr_justificacao_dia_registar(
             k_org, v_pessoa, v_hoje, 'transporte', true,
             TIME '10:00', TIME '10:30', k_motivo_tr || ' (com declaracao da CP)', TIME '10:40',
             ARRAY['declaracao-cp.pdf']);
  EXECUTE 'RESET ROLE';
  IF v_j2b IS NULL OR v_j2b = v_j2 THEN
    RAISE EXCEPTION 'FALHOU 6: o reenvio depois da recusa nao criou linha nova.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 7. Aceitar
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT d.falta_id, d.mes_fechado INTO v_f1, v_bool
    FROM public.rpc_hr_justificacao_dia_decidir(v_j1, 'aceitar_paga') d;
  SELECT d.falta_id INTO v_f2
    FROM public.rpc_hr_justificacao_dia_decidir(v_j2b, 'aceitar_nao_paga') d;
  EXECUTE 'RESET ROLE';
  IF v_f1 IS NULL OR v_f2 IS NULL OR v_bool IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU 7: aceitar nao devolveu a falta (% / %) ou mes fechado %.', v_f1, v_f2, v_bool;
  END IF;

  -- Consulta medica, paga.
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_faltas f
                  WHERE f.id = v_f1 AND f.pessoa_id = v_pessoa AND f.organization_id = k_org
                    AND f.data = v_hoje AND f.hora_inicio = TIME '09:00' AND f.hora_fim = TIME '10:00'
                    AND f.estado = 'activa' AND f.motivo_codigo = 'doenca'
                    AND f.remunerada = true AND f.desconta_saldo = false
                    AND f.justificacao_estado = 'justificada'
                    AND f.justificacao_decidida_por = k_com_id) THEN
    RAISE EXCEPTION 'FALHOU 7: a falta da consulta medica nao ficou como devia.';
  END IF;
  SELECT count(*), max(fj.texto), max(fj.documento_ref), max(fj.tipo_documento)
    INTO v_n, v_txt, v_txt2, v_msg
    FROM public.pessoas_faltas_justificacoes fj WHERE fj.falta_id = v_f1;
  IF v_n <> 1 OR v_msg <> 'declaracao_propria' OR v_txt2 IS DISTINCT FROM 'justificacao-dia:' || v_j1::text THEN
    RAISE EXCEPTION 'FALHOU 7: a justificacao da falta medica ficou % linhas / % / %.', v_n, v_msg, v_txt2;
  END IF;
  IF v_txt LIKE '%' || k_motivo_med || '%' OR v_txt NOT LIKE 'Consulta medica declarada%' THEN
    RAISE EXCEPTION 'FALHOU 7: o texto de saude foi copiado para a justificacao da falta (le-se sem rasto): "%".', v_txt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j
                  WHERE j.id = v_j1 AND j.estado = 'aceite_paga' AND j.falta_id = v_f1
                    AND j.decidida_por = k_com_id AND j.mes_fechado_na_decisao = false
                    AND j.motivo_recusa IS NULL) THEN
    RAISE EXCEPTION 'FALHOU 7: a justificacao j1 nao ficou aceite_paga com a falta.';
  END IF;

  -- Atraso, nao pago: o texto (nao e de saude) vai para a falta.
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_faltas f
                  WHERE f.id = v_f2 AND f.motivo_codigo = 'atraso' AND f.remunerada = false
                    AND f.justificacao_estado = 'justificada') THEN
    RAISE EXCEPTION 'FALHOU 7: a falta do atraso nao ficou atraso / nao remunerada / justificada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_faltas_justificacoes fj
                  WHERE fj.falta_id = v_f2 AND fj.texto LIKE k_motivo_tr || '%') THEN
    RAISE EXCEPTION 'FALHOU 7: o texto do atraso nao passou para a justificacao da falta.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j
                  WHERE j.id = v_j2b AND j.estado = 'aceite_nao_paga' AND j.falta_id = v_f2) THEN
    RAISE EXCEPTION 'FALHOU 7: j2b nao ficou aceite_nao_paga.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 8. Registar com falta activa a cruzar o periodo
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', v_claims_out, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM public.rpc_hr_justificacao_dia_registar(
      k_org, v_pessoa, v_hoje, 'outro', false, TIME '09:30', TIME '09:45', 'ja tem falta');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  IF v_msg IS NULL OR v_msg NOT LIKE 'justificacao_dia_ja_ha_falta%' THEN
    RAISE EXCEPTION 'FALHOU 8: registou por cima de uma falta activa (% %).', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;

  -- ---------------------------------------------------------------------------
  -- 9. Ramo idempotente (o RH regista; depois alguem marca a falta a mao)
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_j4 := public.rpc_hr_justificacao_dia_registar(k_org, v_pessoa, v_hoje - 2, 'transporte', false,
            TIME '08:00', TIME '09:00', 'Greve dos transportes');
  v_j5 := public.rpc_hr_justificacao_dia_registar(k_org, v_pessoa, v_hoje - 3, 'outro', false,
            TIME '08:00', TIME '09:00', 'Avaria do carro');
  v_j6 := public.rpc_hr_justificacao_dia_registar(k_org, v_pessoa, v_hoje - 4, 'outro', false,
            TIME '08:00', TIME '09:00', 'Inundacao em casa');
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims', v_claims_admin, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_fx := public.rpc_hr_falta_marcar(k_org, v_pessoa, v_hoje - 2, TIME '08:00', TIME '09:00',
                                     'outro', NULL::uuid, false, false);
  v_fy := public.rpc_hr_falta_marcar(k_org, v_pessoa, v_hoje - 3, TIME '08:00', TIME '09:00',
                                     'outro', NULL::uuid, false, false);
  PERFORM public.rpc_hr_falta_registar_justificacao(v_fy, 'declaracao_propria', NULL::text,
            'texto do RH', NULL::text, NULL::date, NULL::smallint);
  PERFORM public.rpc_hr_falta_decidir_justificacao(v_fy, 'recusada', 'Sem prova da avaria');
  PERFORM public.rpc_hr_falta_marcar(k_org, v_pessoa, v_hoje - 4, TIME '08:30', TIME '09:30',
                                     'outro', NULL::uuid, false, false);
  EXECUTE 'RESET ROLE';

  -- 9a. divergente: a falta e nao remunerada e a decisao pede paga.
  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM * FROM public.rpc_hr_justificacao_dia_decidir(v_j4, 'aceitar_paga');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  IF v_msg IS NULL OR v_msg NOT LIKE 'justificacao_dia_falta_divergente%' THEN
    RAISE EXCEPTION 'FALHOU 9a: aceitar_paga sobre falta nao remunerada passou (% %).', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j WHERE j.id = v_j4 AND j.estado = 'pendente') THEN
    RAISE EXCEPTION 'FALHOU 9a: j4 deixou de estar pendente depois do erro.';
  END IF;

  -- 9b. reaproveita: devolve a mesma falta, nao cria outra.
  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT d.falta_id INTO v_f2 FROM public.rpc_hr_justificacao_dia_decidir(v_j4, 'aceitar_nao_paga') d;
  EXECUTE 'RESET ROLE';
  IF v_f2 IS DISTINCT FROM v_fx THEN
    RAISE EXCEPTION 'FALHOU 9b: nao reaproveitou a falta existente (% em vez de %).', v_f2, v_fx;
  END IF;
  IF (SELECT count(*) FROM public.pessoas_faltas f WHERE f.pessoa_id = v_pessoa AND f.data = v_hoje - 2) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.pessoas_faltas f WHERE f.id = v_fx AND f.justificacao_estado = 'justificada')
     OR (SELECT count(*) FROM public.pessoas_faltas_justificacoes fj WHERE fj.falta_id = v_fx) <> 1 THEN
    RAISE EXCEPTION 'FALHOU 9b: o ramo idempotente criou falta ou justificacao a mais, ou nao decidiu.';
  END IF;

  -- 9c. falta ja decidida (recusada): nao se reescreve em silencio.
  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM * FROM public.rpc_hr_justificacao_dia_decidir(v_j5, 'aceitar_nao_paga');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  IF v_msg IS NULL OR v_msg NOT LIKE 'justificacao_dia_falta_ja_decidida%' THEN
    RAISE EXCEPTION 'FALHOU 9c: aceitar reescreveu uma falta ja decidida (% %).', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_faltas f
                  WHERE f.id = v_fy AND f.justificacao_estado = 'recusada'
                    AND f.justificacao_motivo = 'Sem prova da avaria') THEN
    RAISE EXCEPTION 'FALHOU 9c: a recusa da falta mudou.';
  END IF;

  -- 9d. falta sobreposta (08:30-09:30 contra 08:00-09:00).
  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM * FROM public.rpc_hr_justificacao_dia_decidir(v_j6, 'aceitar_nao_paga');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  IF v_msg IS NULL OR v_msg NOT LIKE 'justificacao_dia_falta_sobreposta%' THEN
    RAISE EXCEPTION 'FALHOU 9d: aceitou por cima de uma falta sobreposta (% %).', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;
  IF (SELECT count(*) FROM public.pessoas_faltas f WHERE f.pessoa_id = v_pessoa AND f.data = v_hoje - 4) <> 1 THEN
    RAISE EXCEPTION 'FALHOU 9d: ficou uma segunda falta no dia.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 10. Mes fechado (2001-02, fechado aqui e revertido)
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, created_by)
  VALUES (k_org, 2001, 2, 'aberto', k_admin_id);
  UPDATE public.hr_periodos_processamento pp
     SET estado = 'fechado', fechado_em = now(), fechado_por = k_admin_id
   WHERE pp.organization_id = k_org AND pp.ano = 2001 AND pp.mes = 2;

  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_j7 := public.rpc_hr_justificacao_dia_registar(k_org, v_pessoa, k_dia_fech, 'outro', false,
            TIME '08:00', TIME '09:00', 'Registo antigo');
  v_j8 := public.rpc_hr_justificacao_dia_registar(k_org, v_pessoa, k_dia_fech, 'outro', false,
            TIME '10:00', TIME '11:00', 'Outro registo antigo');
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM * FROM public.rpc_hr_justificacao_dia_decidir(v_j7, 'aceitar_paga');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  IF v_estado IS DISTINCT FROM '55000' OR v_msg NOT LIKE 'justificacao_dia_mes_fechado%' THEN
    RAISE EXCEPTION 'FALHOU 10: aceitar num mes fechado sem confirmar passou (% %).', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pessoas_faltas f WHERE f.pessoa_id = v_pessoa AND f.data = k_dia_fech)
     OR NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j WHERE j.id = v_j7 AND j.estado = 'pendente') THEN
    RAISE EXCEPTION 'FALHOU 10: o aviso de mes fechado chegou depois de escrever.';
  END IF;

  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT d.falta_id, d.mes_fechado INTO v_fx, v_bool
    FROM public.rpc_hr_justificacao_dia_decidir(v_j7, 'aceitar_paga', NULL, true) d;
  SELECT d.mes_fechado INTO v_bool2
    FROM public.rpc_hr_justificacao_dia_decidir(v_j8, 'recusar', 'Fora de tempo') d;
  EXECUTE 'RESET ROLE';
  IF v_fx IS NULL OR v_bool IS DISTINCT FROM true OR v_bool2 IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU 10: com confirmacao, aceitar devolveu falta % / mes fechado %; recusar %.', v_fx, v_bool, v_bool2;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j
                  WHERE j.id = v_j7 AND j.estado = 'aceite_paga' AND j.mes_fechado_na_decisao = true)
     OR NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j
                  WHERE j.id = v_j8 AND j.estado = 'recusada' AND j.mes_fechado_na_decisao = true) THEN
    RAISE EXCEPTION 'FALHOU 10: a fotografia do mes fechado nao ficou guardada.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 11. Anular a falta -> sem_efeito, e o periodo fica livre
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.pessoas_faltas f
     SET estado = 'anulada', anulado_em = now(), anulado_por_anew_user_id = k_admin_id,
         anulacao_motivo = 'teste revertido', updated_by = k_admin_id
   WHERE f.id = v_f1;
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j
                  WHERE j.id = v_j1 AND j.estado = 'sem_efeito' AND j.sem_efeito_em IS NOT NULL
                    AND j.falta_id = v_f1) THEN
    RAISE EXCEPTION 'FALHOU 11: anular a falta nao deixou j1 sem_efeito.';
  END IF;
  -- Outras justificacoes aceites nao foram tocadas.
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j WHERE j.id = v_j2b AND j.estado = 'aceite_nao_paga') THEN
    RAISE EXCEPTION 'FALHOU 11: o gatilho mexeu numa justificacao de outra falta.';
  END IF;

  PERFORM set_config('request.jwt.claims', v_claims_out, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_j9 := public.rpc_hr_justificacao_dia_registar(
            k_org, v_pessoa, v_hoje, 'consulta_medica', false,
            TIME '09:00', TIME '10:00', k_motivo_med || ' (reenvio)');
  EXECUTE 'RESET ROLE';
  IF v_j9 IS NULL THEN
    RAISE EXCEPTION 'FALHOU 11: o periodo da falta anulada continuou bloqueado.';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 12. Atomicidade: a ULTIMA escrita da aceitacao (o UPDATE da justificacao do
  --     dia) falha por um gatilho provocado na tabela nova. A falta e a
  --     justificacao da falta, escritas antes pelas RPCs de faltas, nao podem
  --     ficar.
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_j10 := public.rpc_hr_justificacao_dia_registar(k_org, v_pessoa, v_hoje - 5, 'outro', false,
             TIME '08:00', TIME '09:00', 'Teste de atomicidade');
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE format($f$
    CREATE FUNCTION public.teste_jd_falhar_%s() RETURNS trigger
    LANGUAGE plpgsql AS $b$
    BEGIN
      RAISE EXCEPTION 'TESTE_FALHA_PROVOCADA' USING ERRCODE = 'P0001';
    END;
    $b$ $f$, v_tag);
  EXECUTE format(
    'CREATE TRIGGER teste_jd_falhar BEFORE UPDATE ON public.pessoas_justificacoes_dia
       FOR EACH ROW WHEN (NEW.id = %L::uuid AND NEW.estado <> ''pendente'')
       EXECUTE FUNCTION public.teste_jd_falhar_%s()', v_j10, v_tag);

  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_estado := NULL; v_msg := NULL;
  BEGIN
    PERFORM * FROM public.rpc_hr_justificacao_dia_decidir(v_j10, 'aceitar_paga');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  EXECUTE 'DROP TRIGGER teste_jd_falhar ON public.pessoas_justificacoes_dia';
  EXECUTE format('DROP FUNCTION public.teste_jd_falhar_%s()', v_tag);

  IF v_msg IS DISTINCT FROM 'TESTE_FALHA_PROVOCADA' THEN
    RAISE EXCEPTION 'FALHOU 12: a falha provocada nao chegou (% %).', coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pessoas_faltas f WHERE f.pessoa_id = v_pessoa AND f.data = v_hoje - 5)
     OR EXISTS (SELECT 1 FROM public.pessoas_faltas_justificacoes fj
                 WHERE fj.pessoa_id = v_pessoa AND fj.documento_ref = 'justificacao-dia:' || v_j10::text)
     OR NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j WHERE j.id = v_j10 AND j.estado = 'pendente') THEN
    RAISE EXCEPTION 'FALHOU 12: a aceitacao falhada deixou falta ou justificacao escrita (nao e atomica).';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 13. Ninguem decide a sua propria justificacao (nem o RH completo). O admin
  --     (RH completo) passa a ter ficha: v_pessoa2. O "comercial" (outro RH)
  --     regista em nome dela; o admin tenta aceitar e recusar -> 42501; o
  --     admin registar a sua fora do prazo -> sem os poderes do RH.
  -- ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.pessoas_contas pc
     SET estado = 'revogada', revogada_em = now(), revogada_por = k_com_id,
         motivo_revogacao = 'teste revertido'
   WHERE pc.organization_id = k_org AND pc.anew_user_id = k_admin_id AND pc.estado = 'activa';
  INSERT INTO public.pessoas_contas (pessoa_id, organization_id, anew_user_id, ligada_por)
  VALUES (v_pessoa2, k_org, k_admin_id, k_com_id);
  IF public.hr_pessoa_do_utilizador(k_admin_auth, k_org) IS DISTINCT FROM v_pessoa2 THEN
    RAISE EXCEPTION 'FALHOU 13: hr_pessoa_do_utilizador nao devolve v_pessoa2 para o admin.';
  END IF;

  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_j11 := public.rpc_hr_justificacao_dia_registar(k_org, v_pessoa2, v_hoje - 2, 'outro', false,
             TIME '14:00', TIME '15:00', 'Registado por outra pessoa do RH');
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_n FROM public.pessoas_faltas f WHERE f.pessoa_id = v_pessoa2;

  FOR r IN
    SELECT * FROM (VALUES
      ('admin aceita a sua (paga)',
       format('SELECT * FROM public.rpc_hr_justificacao_dia_decidir(%L::uuid, ''aceitar_paga'')', v_j11),
       '42501', 'justificacao_dia_propria_decisao%'),
      ('admin aceita a sua (nao paga)',
       format('SELECT * FROM public.rpc_hr_justificacao_dia_decidir(%L::uuid, ''aceitar_nao_paga'')', v_j11),
       '42501', 'justificacao_dia_propria_decisao%'),
      ('admin recusa a sua',
       format('SELECT * FROM public.rpc_hr_justificacao_dia_decidir(%L::uuid, ''recusar'', ''nao me convence'')', v_j11),
       '42501', 'justificacao_dia_propria_decisao%'),
      -- O admin nao tem picar: sobre a sua ficha nao e RH, por isso nem regista.
      ('admin regista a sua fora do prazo',
       format('SELECT public.rpc_hr_justificacao_dia_registar(%L::uuid, %L::uuid, %L::date, ''outro'', false, ''09:00''::time, ''10:00''::time, ''para mim, tarde'')', k_org, v_pessoa2, v_hoje - 30),
       '42501', 'justificacao_dia_sem_permissao%')
    ) AS x(nome, sql, sqlstate, prefixo)
  LOOP
    PERFORM set_config('request.jwt.claims', v_claims_admin, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_estado := NULL; v_msg := NULL;
    BEGIN
      EXECUTE r.sql;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    EXECUTE 'RESET ROLE';
    IF v_estado IS DISTINCT FROM r.sqlstate OR v_msg NOT LIKE r.prefixo THEN
      RAISE EXCEPTION 'FALHOU 13 (%): esperava % "%", veio % "%".',
        r.nome, r.sqlstate, r.prefixo, coalesce(v_estado, 'sucesso'), coalesce(v_msg, '-');
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j WHERE j.id = v_j11 AND j.estado = 'pendente')
     OR (SELECT count(*) FROM public.pessoas_faltas f WHERE f.pessoa_id = v_pessoa2) <> v_n
     OR EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j
                 WHERE j.pessoa_id = v_pessoa2 AND j.data = v_hoje - 30) THEN
    RAISE EXCEPTION 'FALHOU 13: a tentativa sobre a propria ficha deixou alguma coisa escrita.';
  END IF;

  -- Outra pessoa do RH decide-a normalmente.
  PERFORM set_config('request.jwt.claims', v_claims_com, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM * FROM public.rpc_hr_justificacao_dia_decidir(v_j11, 'recusar', 'Decidida por outra pessoa do RH');
  EXECUTE 'RESET ROLE';
  IF NOT EXISTS (SELECT 1 FROM public.pessoas_justificacoes_dia j
                  WHERE j.id = v_j11 AND j.estado = 'recusada' AND j.decidida_por = k_com_id) THEN
    RAISE EXCEPTION 'FALHOU 13: outra pessoa do RH nao conseguiu decidir.';
  END IF;

  RAISE EXCEPTION 'TESTE_OK: justificacao do dia -- ACL, registo, leitura protegida do motivo, revelacao registada, recusa, aceitacao pelas RPCs de faltas (texto neutro para saude), ramo idempotente, mes fechado com confirmacao, sem_efeito, atomicidade e ninguem decide a sua propria. Tudo revertido.';
END;
$teste$;
