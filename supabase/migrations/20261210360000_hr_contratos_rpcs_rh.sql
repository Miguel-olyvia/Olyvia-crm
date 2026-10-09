-- ==============================================================================
-- Fim de contrato (5/6): as RPCs do RH (renovar, deixar terminar) e a lista de
-- "contratos a terminar".
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO (cartao do ciclo no separador Contratos com os botoes
-- Renovar e Deixar terminar, e o ecra "contratos a terminar"). Depende de
-- 20261210350000 e entra no mesmo commit que os ecras.
--
--
-- -- O PRINCIPIO ---------------------------------------------------------------
--
-- SO O RH EXECUTA (hr.pessoas.vinculos.edit). O responsavel directo so indica
-- (migration 350000). Renovar PROLONGA O MESMO CONTRATO: a data de fim avanca pela
-- duracao da renovacao e renovacoes_realizadas sobe; nao ha contrato novo.
--
--
-- -- O QUE FAZ -----------------------------------------------------------------
--
-- 1. hr_contrato_aplicar_renovacao(vinculo, automatica, utilizador, motivo): o
--    nucleo, INTERNO (so service_role), partilhado pela renovacao manual e pela
--    automatica da rotina diaria. Respeita a configuracao DO CONTRATO (excepcao
--    ou, na falta, a da organizacao):
--      - so contratos em vigor, com data de fim, de tipo termo_certo,
--        termo_incerto, duracao_muito_curta ou temporario        (HRV06)
--      - renovavel = false bloqueia                              (HRV07)
--      - funcionalidade ligada na organizacao                    (HRV10)
--      - renovacoes_realizadas < maximo                          (HRV09)
--      - duracao da renovacao: a configurada; se NULL, igual a duracao do contrato
--        inicial (meses se o primeiro ciclo foi um numero inteiro de meses, senao
--        dias)                                                   (HRV11 se invalida)
--    Grava: data_fim nova, contador +1, limpa a decisao de terminar, historico
--    (motivo renovacao manual / renovacao automatica, ou o do RH), linha em
--    hr_contrato_renovacoes e fecha as notificacoes do contrato (ciclo_renovado).
--
-- 2. rpc_hr_vinculo_renovar(p_vinculo_id, p_motivo): o RH renova (devolve a data de
--    fim nova).
--
-- 3. rpc_hr_vinculo_terminar(p_vinculo_id, p_motivo): o RH decide que o contrato
--    termina. Se a data de fim ja passou termina agora (devolve terminado); senao
--    fica decidido (fim_decisao = terminar) e a rotina diaria passa-o a terminado
--    no dia seguinte ao fim (devolve agendado). Mudar a data de fim limpa a decisao.
--
-- 4. rpc_hr_contratos_a_terminar(p_organization_id, p_dias): a lista para o RH:
--    contratos com prazo, em vigor, com o que acontece no fim e a indicacao do
--    responsavel. p_dias NULL = todos os que tem data de fim; com valor, so os que
--    terminam dentro desse numero de dias (os ja vencidos entram sempre).
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) Um contrato que a rotina ja deveria ter tratado (fim passado) pode ser
--    renovado pelo RH: o ciclo novo comeca no dia a seguir ao fim ANTERIOR, por
--    isso pode ainda ficar no passado se o atraso for grande; a rotina volta a
--    renovar na noite seguinte (um passo por noite).
-- b) Esta migration so se aplica ao branch de RH.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta. A mao: largar as quatro funcoes.
--
-- Prerequisitos:
--   20261210320000  funcoes de datas
--   20261210330000  colunas do ciclo, hr_contrato_regra_efectiva
--   20261210340000  hr_contrato_renovacoes
--   20261210350000  auxiliares
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regprocedure('public.hr_contratos_resolver_avisos(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.hr_contrato_o_que_acontece(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Os auxiliares de 20261210350000 nao existem. Aplicar essa migration primeiro.';
  END IF;
  IF to_regprocedure('public.hr_contrato_somar_duracao(date, integer, text)') IS NULL
     OR to_regprocedure('public.hr_contrato_duracao_inicial(date, date)') IS NULL THEN
    RAISE EXCEPTION 'As funcoes de datas de 20261210320000 nao existem.';
  END IF;
  IF to_regclass('public.hr_contrato_renovacoes') IS NULL THEN
    RAISE EXCEPTION 'hr_contrato_renovacoes nao existe. Aplicar 20261210340000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. O nucleo da renovacao (interno)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_contrato_aplicar_renovacao(
  p_vinculo_id uuid,
  p_automatica boolean,
  p_user_id    uuid,
  p_motivo     text
)
RETURNS date
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v            record;
  e            record;
  v_fim_ini    date;
  v_valor      integer;
  v_unidade    text;
  v_nova       date;
  v_numero     integer;
  v_motivo     text;
BEGIN
  SELECT pv.* INTO v
    FROM public.pessoas_vinculos pv
   WHERE pv.id = p_vinculo_id AND pv.deleted_at IS NULL
     FOR UPDATE;

  IF NOT FOUND
     OR v.estado NOT IN ('activo', 'suspenso')
     OR v.data_fim IS NULL
     OR v.tipo_contrato NOT IN ('termo_certo', 'termo_incerto', 'duracao_muito_curta', 'temporario') THEN
    RAISE EXCEPTION 'Este contrato nao tem um ciclo para renovar (nao existe, nao esta em vigor, nao tem data de fim ou e de um tipo sem ciclo).'
      USING ERRCODE = 'HRV06';
  END IF;

  IF v.renovavel IS NOT DISTINCT FROM false THEN
    RAISE EXCEPTION 'Este contrato esta marcado como nao renovavel.' USING ERRCODE = 'HRV07';
  END IF;

  SELECT * INTO e FROM public.hr_contrato_regra_efectiva(p_vinculo_id);

  IF NOT e.ativo THEN
    RAISE EXCEPTION 'A funcionalidade de fim de contrato esta desligada nesta organizacao.' USING ERRCODE = 'HRV10';
  END IF;

  IF v.renovacoes_realizadas >= e.max_renovacoes THEN
    RAISE EXCEPTION 'Este contrato ja atingiu o numero maximo de renovacoes (% de %).', v.renovacoes_realizadas, e.max_renovacoes
      USING ERRCODE = 'HRV09';
  END IF;

  v_valor   := e.duracao_valor;
  v_unidade := e.duracao_unidade;

  IF v_valor IS NULL THEN
    -- Igual a duracao do contrato inicial: o primeiro ciclo acaba na data de fim
    -- anterior a primeira renovacao (ou na actual, se ainda nao houve nenhuma).
    SELECT r.data_fim_anterior INTO v_fim_ini
      FROM public.hr_contrato_renovacoes r
     WHERE r.vinculo_id = v.id AND r.tipo IN ('automatica', 'manual')
     ORDER BY r.numero, r.feita_em
     LIMIT 1;
    v_fim_ini := coalesce(v_fim_ini, v.data_fim);

    SELECT d.valor, d.unidade INTO v_valor, v_unidade
      FROM public.hr_contrato_duracao_inicial(v.data_inicio, v_fim_ini) d;
  END IF;

  v_nova := public.hr_contrato_somar_duracao(v.data_fim, v_valor, v_unidade);
  IF v_nova IS NULL THEN
    RAISE EXCEPTION 'Nao foi possivel calcular a duracao da renovacao (valor %, unidade %).', v_valor, v_unidade
      USING ERRCODE = 'HRV11';
  END IF;

  v_numero := v.renovacoes_realizadas + 1;
  v_motivo := coalesce(NULLIF(btrim(p_motivo), ''),
                       CASE WHEN p_automatica THEN 'renovacao automatica' ELSE 'renovacao manual' END);

  PERFORM set_config('hr.vinculo_via_rpc', 'on', true);
  PERFORM set_config('hr.alteracao_motivo', v_motivo, true);

  UPDATE public.pessoas_vinculos
     SET data_fim              = v_nova,
         renovacoes_realizadas = v_numero,
         fim_decisao           = NULL,
         fim_decisao_em        = NULL,
         fim_decisao_por       = NULL
   WHERE id = v.id;

  PERFORM set_config('hr.vinculo_via_rpc', 'off', true);
  PERFORM set_config('hr.alteracao_motivo', '', true);

  INSERT INTO public.hr_contrato_renovacoes
    (organization_id, pessoa_id, vinculo_id, numero, tipo, data_fim_anterior, data_fim_nova, feita_por, motivo)
  VALUES
    (v.organization_id, v.pessoa_id, v.id, v_numero,
     CASE WHEN p_automatica THEN 'automatica' ELSE 'manual' END,
     v.data_fim, v_nova, p_user_id, v_motivo);

  PERFORM public.hr_contratos_resolver_avisos(v.id, 'ciclo_renovado', NULL);

  RETURN v_nova;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_contrato_aplicar_renovacao(uuid, boolean, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contrato_aplicar_renovacao(uuid, boolean, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.hr_contrato_aplicar_renovacao(uuid, boolean, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_contrato_aplicar_renovacao(uuid, boolean, uuid, text) TO service_role;

COMMENT ON FUNCTION public.hr_contrato_aplicar_renovacao(uuid, boolean, uuid, text) IS
'INTERNA (so service_role). Prolonga o MESMO contrato pela duracao da renovacao (a configurada no contrato ou na organizacao; se NULL, igual a duracao do contrato inicial), sobe renovacoes_realizadas, limpa a decisao de terminar, regista o historico (motivo) e uma linha em hr_contrato_renovacoes, e fecha as notificacoes do contrato. p_automatica = true na rotina diaria; p_user_id e o anew_users.id de quem renova (NULL no sistema). Recusa: HRV06 contrato sem ciclo, HRV07 nao renovavel, HRV10 funcionalidade desligada, HRV09 limite atingido, HRV11 duracao invalida. Devolve a data de fim nova. Desde 20261210360000.';

-- ==============================================================================
-- 2. RPC: o RH renova
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_vinculo_renovar(p_vinculo_id uuid, p_motivo text DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_org  uuid;
  v_user uuid;
BEGIN
  SELECT pv.organization_id INTO v_org
    FROM public.pessoas_vinculos pv
   WHERE pv.id = p_vinculo_id AND pv.deleted_at IS NULL;

  IF v_uid IS NULL OR v_org IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.vinculos.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissao para renovar este contrato.' USING ERRCODE = 'HRV05';
  END IF;

  SELECT au.id INTO v_user FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  RETURN public.hr_contrato_aplicar_renovacao(p_vinculo_id, false, v_user, p_motivo);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_vinculo_renovar(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_vinculo_renovar(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_vinculo_renovar(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_hr_vinculo_renovar(uuid, text) IS
'O RH renova um contrato: prolonga o MESMO contrato pela duracao configurada (a do contrato, ou a da organizacao; NULL = igual a duracao inicial). p_motivo opcional (vai para o historico; por omissao "renovacao manual"). Devolve a data de fim nova. Exige hr.pessoas.vinculos.edit na organizacao do contrato (HRV05 sem sessao, sem permissao ou contrato inexistente). Respeita a configuracao do contrato: HRV06 sem ciclo, HRV07 nao renovavel, HRV10 funcionalidade desligada, HRV09 limite de renovacoes atingido, HRV11 duracao invalida. Desde 20261210360000.';

-- ==============================================================================
-- 3. RPC: o RH deixa terminar / termina
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_vinculo_terminar(p_vinculo_id uuid, p_motivo text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v           record;
  e           record;
  v_user      uuid;
  v_resultado text;
BEGIN
  SELECT pv.id, pv.organization_id, pv.estado, pv.data_fim INTO v
    FROM public.pessoas_vinculos pv
   WHERE pv.id = p_vinculo_id AND pv.deleted_at IS NULL
     FOR UPDATE;

  IF v_uid IS NULL OR NOT FOUND
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.vinculos.edit', v.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao para terminar este contrato.' USING ERRCODE = 'HRV05';
  END IF;

  IF v.estado NOT IN ('activo', 'suspenso') OR v.data_fim IS NULL THEN
    RAISE EXCEPTION 'Este contrato nao esta em vigor ou nao tem data de fim.' USING ERRCODE = 'HRV06';
  END IF;

  SELECT * INTO e FROM public.hr_contrato_regra_efectiva(p_vinculo_id);
  IF NOT e.ativo THEN
    RAISE EXCEPTION 'A funcionalidade de fim de contrato esta desligada nesta organizacao.' USING ERRCODE = 'HRV10';
  END IF;

  SELECT au.id INTO v_user FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  PERFORM set_config('hr.alteracao_motivo',
                     coalesce(NULLIF(btrim(p_motivo), ''), 'Fim de contrato decidido pelo RH'), true);

  IF v.data_fim < current_date THEN
    UPDATE public.pessoas_vinculos SET estado = 'terminado' WHERE id = v.id;
    v_resultado := 'terminado';
  ELSE
    PERFORM set_config('hr.vinculo_via_rpc', 'on', true);
    UPDATE public.pessoas_vinculos
       SET fim_decisao = 'terminar', fim_decisao_em = now(), fim_decisao_por = v_user
     WHERE id = v.id;
    PERFORM set_config('hr.vinculo_via_rpc', 'off', true);
    v_resultado := 'agendado';
  END IF;

  PERFORM set_config('hr.alteracao_motivo', '', true);
  PERFORM public.hr_contratos_resolver_avisos(v.id, 'decidido', NULL);

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_vinculo_terminar(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_vinculo_terminar(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_vinculo_terminar(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_hr_vinculo_terminar(uuid, text) IS
'O RH decide que o contrato termina. Se a data de fim ja passou, termina agora (estado terminado) e devolve terminado; senao regista a decisao (fim_decisao = terminar, com quem e quando) e devolve agendado: a rotina diaria passa-o a terminado no dia seguinte ao fim. Mudar a data de fim a mao limpa a decisao. p_motivo opcional (historico). Exige hr.pessoas.vinculos.edit (HRV05 sem sessao, sem permissao ou contrato inexistente); HRV06 se nao esta em vigor ou nao tem data de fim; HRV10 funcionalidade desligada. Fecha as notificacoes do contrato (decidido). Desde 20261210360000.';

-- ==============================================================================
-- 4. RPC: a lista de contratos a terminar (para o RH)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_contratos_a_terminar(p_organization_id uuid, p_dias integer DEFAULT NULL)
RETURNS TABLE (
  vinculo_id            uuid,
  pessoa_id             uuid,
  pessoa_nome           text,
  responsavel_nome      text,
  tipo_contrato         text,
  data_inicio           date,
  data_fim              date,
  dias_restantes        integer,
  renovacoes_realizadas integer,
  max_renovacoes        integer,
  ativo                 boolean,
  renovacao_automatica  boolean,
  dias_aviso            integer,
  ao_atingir_limite     text,
  fonte                 text,
  o_que_acontece        text,
  fim_decisao           text,
  resposta              text,
  resposta_em           timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_organization_id IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.vinculos.view', p_organization_id) THEN
    RAISE EXCEPTION 'Sem permissao para ver os contratos a terminar.' USING ERRCODE = 'HRV05';
  END IF;

  RETURN QUERY
  SELECT pv.id,
         pv.pessoa_id,
         p.nome_completo,
         resp.nome_completo,
         pv.tipo_contrato,
         pv.data_inicio,
         pv.data_fim,
         (pv.data_fim - current_date)::integer,
         pv.renovacoes_realizadas,
         e.max_renovacoes,
         e.ativo,
         e.renovacao_automatica,
         e.dias_aviso,
         e.ao_atingir_limite,
         e.fonte,
         public.hr_contrato_o_que_acontece(pv.id),
         pv.fim_decisao,
         ind.resposta,
         ind.indicada_em
    FROM public.pessoas_vinculos pv
    JOIN public.pessoas p
      ON p.id = pv.pessoa_id AND p.organization_id = pv.organization_id
    LEFT JOIN public.pessoas resp
      ON resp.id = p.reporta_a_pessoa_id AND resp.organization_id = p.organization_id
   CROSS JOIN LATERAL public.hr_contrato_regra_efectiva(pv.id) e
    LEFT JOIN LATERAL (
      SELECT i.resposta, i.indicada_em
        FROM public.hr_contrato_indicacoes i
       WHERE i.vinculo_id = pv.id AND i.ciclo_fim = pv.data_fim
       ORDER BY i.indicada_em DESC, i.id
       LIMIT 1
    ) ind ON true
   WHERE pv.organization_id = p_organization_id
     AND pv.deleted_at IS NULL
     AND pv.estado IN ('activo', 'suspenso')
     AND pv.data_fim IS NOT NULL
     AND pv.tipo_contrato IN ('termo_certo', 'termo_incerto', 'duracao_muito_curta', 'temporario')
     AND p.deleted_at IS NULL
     AND p.estado_registo = 'activo'
     AND (p_dias IS NULL OR pv.data_fim <= current_date + p_dias)
   ORDER BY pv.data_fim, p.nome_completo;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_contratos_a_terminar(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_contratos_a_terminar(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_contratos_a_terminar(uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_hr_contratos_a_terminar(uuid, integer) IS
'Os contratos com prazo (termo certo, termo incerto, duracao muito curta, temporario), em vigor e com data de fim, de uma organizacao, do mais proximo do fim para o mais longe; p_dias NULL = todos, com valor = os que terminam dentro desses dias (os ja vencidos entram sempre). Colunas: vinculo_id, pessoa_id, pessoa_nome, responsavel_nome, tipo_contrato, data_inicio, data_fim, dias_restantes (negativo = fim ja passou), renovacoes_realizadas, max_renovacoes, ativo (funcionalidade ligada), renovacao_automatica, dias_aviso, ao_atingir_limite, fonte (organizacao | personalizado), o_que_acontece (desligado | termina | decisao_rh | renova_automaticamente | converte_sem_termo), fim_decisao, resposta e resposta_em (a indicacao do responsavel neste ciclo). Exige hr.pessoas.vinculos.view (HRV05). Desde 20261210360000.';

-- ==============================================================================
-- Conferir (estrutura): falha o push se algo estiver diferente do esperado.
-- ==============================================================================
DO $conferir$
DECLARE
  v_f text;
BEGIN
  v_f := 'public.hr_contrato_aplicar_renovacao(uuid, boolean, uuid, text)';
  IF has_function_privilege('anon', v_f, 'EXECUTE') OR has_function_privilege('public', v_f, 'EXECUTE')
     OR has_function_privilege('authenticated', v_f, 'EXECUTE') THEN
    RAISE EXCEPTION '% devia ser so de service_role.', v_f;
  END IF;

  FOREACH v_f IN ARRAY ARRAY[
    'public.rpc_hr_vinculo_renovar(uuid, text)',
    'public.rpc_hr_vinculo_terminar(uuid, text)',
    'public.rpc_hr_contratos_a_terminar(uuid, integer)',
    'public.hr_contrato_aplicar_renovacao(uuid, boolean, uuid, text)'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
       WHERE p.oid = to_regprocedure(v_f) AND p.prosecdef
         AND array_to_string(p.proconfig, ',') LIKE '%search_path=%'
    ) THEN
      RAISE EXCEPTION '% devia ser SECURITY DEFINER com search_path fixo.', v_f;
    END IF;
  END LOOP;

  FOREACH v_f IN ARRAY ARRAY[
    'public.rpc_hr_vinculo_renovar(uuid, text)',
    'public.rpc_hr_vinculo_terminar(uuid, text)',
    'public.rpc_hr_contratos_a_terminar(uuid, integer)'
  ] LOOP
    IF has_function_privilege('anon', v_f, 'EXECUTE') OR has_function_privilege('public', v_f, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon ou PUBLIC conseguem executar %.', v_f;
    END IF;
    IF NOT has_function_privilege('authenticated', v_f, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated devia poder executar %.', v_f;
    END IF;
  END LOOP;

  RAISE NOTICE 'OK: nucleo da renovacao interno (so service_role) e tres RPCs do RH (renovar, terminar, a terminar) com os privilegios certos.';
END;
$conferir$;

-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): cria dados de teste e DESFAZ-OS
-- tudo com a sentinela HR900 (a subtransaccao reverte as linhas).
-- ==============================================================================
CREATE OR REPLACE FUNCTION pg_temp.hr_fim_t_novo(p_org uuid, p_cargo uuid, p_tag text, p_tipo text, p_inicio date, p_fim date)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_p uuid;
  v_v uuid;
BEGIN
  INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
  VALUES (p_org, 'TESTE MIGRACAO', p_tag || ' -- apagar', p_cargo, p_inicio)
  RETURNING id INTO v_p;

  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado)
  VALUES (v_p, p_org, p_tipo, p_inicio, p_fim, 'activo')
  RETURNING id INTO v_v;

  RETURN v_v;
END;
$$;

DO $conferir_vivo$
DECLARE
  v_org_nike  uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_cargo     uuid;
  v_a         uuid;
  v_b         uuid;
  v_c         uuid;
  v_nova      date;
  v_n         integer;
  v_sqlstate  text;
  v_motivo    text;
  v_auth_uid  uuid;
  v_texto     text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo das RPCs do RH foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- Escritas SO na nike (organization_id confirmado acima).
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org_nike, 'TESTE MIGRACAO cargo 20261210360000 ' || gen_random_uuid()::text, 0, 'mensal')
    RETURNING id INTO v_cargo;

    -- Regras da nike (so dentro do teste): ligado, renovacao automatica, ate 2
    -- renovacoes, duracao igual a inicial, converter no limite.
    INSERT INTO public.hr_regras_fim_contrato
      (organization_id, ativo, renovacao_automatica, max_renovacoes, ao_atingir_limite)
    VALUES (v_org_nike, true, true, 2, 'converter_sem_termo')
    ON CONFLICT (organization_id) DO UPDATE
      SET ativo = true, renovacao_automatica = true, max_renovacoes = 2,
          duracao_renovacao_valor = NULL, duracao_renovacao_unidade = NULL,
          ao_atingir_limite = 'converter_sem_termo';

    -- A: 01/03/2020 a 31/08/2020 (6 meses exactos; datas passadas, para o contrato estar em vigor sem duvidas).
    v_a := pg_temp.hr_fim_t_novo(v_org_nike, v_cargo, '20261210360000 A', 'termo_certo', DATE '2020-03-01', DATE '2020-08-31');

    -- 1. Renovacao manual, duracao igual a inicial: 6 meses -> 28/02/2021.
    v_nova := public.hr_contrato_aplicar_renovacao(v_a, false, NULL, NULL);
    IF v_nova IS DISTINCT FROM DATE '2021-02-28' THEN
      RAISE EXCEPTION 'A 1.a renovacao de 6 meses devia acabar a 2021-02-28; acabou a %.', v_nova USING ERRCODE = 'HR968';
    END IF;

    -- 2. Segunda renovacao (automatica): 6 meses a seguir -> 31/08/2021. O contador e 2.
    v_nova := public.hr_contrato_aplicar_renovacao(v_a, true, NULL, NULL);
    IF v_nova IS DISTINCT FROM DATE '2021-08-31' THEN
      RAISE EXCEPTION 'A 2.a renovacao de 6 meses devia acabar a 2021-08-31; acabou a %.', v_nova USING ERRCODE = 'HR968';
    END IF;
    SELECT pv.renovacoes_realizadas INTO v_n FROM public.pessoas_vinculos pv WHERE pv.id = v_a;
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'O contador devia estar em 2; esta em %.', v_n USING ERRCODE = 'HR968';
    END IF;

    -- 3. A terceira e recusada: limite atingido (HRV09).
    v_sqlstate := NULL;
    BEGIN
      PERFORM public.hr_contrato_aplicar_renovacao(v_a, false, NULL, NULL);
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV09' THEN
      RAISE EXCEPTION 'A 3.a renovacao devia dar HRV09; foi %.', coalesce(v_sqlstate, '(nada)') USING ERRCODE = 'HR968';
    END IF;

    -- 4. O historico e a tabela de renovacoes registaram as duas.
    SELECT count(*) INTO v_n FROM public.hr_contrato_renovacoes r
     WHERE r.vinculo_id = v_a AND r.tipo IN ('manual', 'automatica') AND r.data_fim_nova > r.data_fim_anterior;
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'hr_contrato_renovacoes devia ter 2 linhas; tem %.', v_n USING ERRCODE = 'HR968';
    END IF;
    SELECT a.motivo INTO v_motivo
      FROM public.pessoas_vinculos_alteracoes a
     WHERE a.vinculo_id = v_a AND a.campo = 'data_fim' AND a.valor_depois = '2021-02-28';
    IF v_motivo IS DISTINCT FROM 'renovacao manual' THEN
      RAISE EXCEPTION 'O historico da 1.a renovacao devia ter o motivo renovacao manual; tem %.', coalesce(v_motivo, '(nulo)')
        USING ERRCODE = 'HR968';
    END IF;
    SELECT a.motivo INTO v_motivo
      FROM public.pessoas_vinculos_alteracoes a
     WHERE a.vinculo_id = v_a AND a.campo = 'data_fim' AND a.valor_depois = '2021-08-31';
    IF v_motivo IS DISTINCT FROM 'renovacao automatica' THEN
      RAISE EXCEPTION 'O historico da 2.a renovacao devia ter o motivo renovacao automatica; tem %.', coalesce(v_motivo, '(nulo)')
        USING ERRCODE = 'HR968';
    END IF;

    -- 5. Duracao configurada: 45 dias a partir de 31/08/2020.
    UPDATE public.hr_regras_fim_contrato
       SET duracao_renovacao_valor = 45, duracao_renovacao_unidade = 'dias'
     WHERE organization_id = v_org_nike;
    v_b := pg_temp.hr_fim_t_novo(v_org_nike, v_cargo, '20261210360000 B', 'temporario', DATE '2020-03-01', DATE '2020-08-31');
    v_nova := public.hr_contrato_aplicar_renovacao(v_b, false, NULL, 'motivo do RH');
    IF v_nova IS DISTINCT FROM DATE '2020-10-15' THEN
      RAISE EXCEPTION 'Renovar 45 dias a partir de 2020-08-31 devia acabar a 2020-10-15; acabou a %.', v_nova USING ERRCODE = 'HR968';
    END IF;

    -- 6. Marcado como nao renovavel: HRV07. Sem termo: HRV06. Desligado: HRV10.
    UPDATE public.pessoas_vinculos SET renovavel = false WHERE id = v_b;
    v_sqlstate := NULL;
    BEGIN
      PERFORM public.hr_contrato_aplicar_renovacao(v_b, false, NULL, NULL);
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV07' THEN
      RAISE EXCEPTION 'renovavel = false devia dar HRV07; foi %.', coalesce(v_sqlstate, '(nada)') USING ERRCODE = 'HR968';
    END IF;

    v_c := pg_temp.hr_fim_t_novo(v_org_nike, v_cargo, '20261210360000 C', 'sem_termo', DATE '2020-03-01', NULL);
    v_sqlstate := NULL;
    BEGIN
      PERFORM public.hr_contrato_aplicar_renovacao(v_c, false, NULL, NULL);
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV06' THEN
      RAISE EXCEPTION 'Um contrato sem termo devia dar HRV06; foi %.', coalesce(v_sqlstate, '(nada)') USING ERRCODE = 'HR968';
    END IF;

    UPDATE public.hr_regras_fim_contrato SET ativo = false WHERE organization_id = v_org_nike;
    UPDATE public.pessoas_vinculos SET renovavel = NULL WHERE id = v_b;
    v_sqlstate := NULL;
    BEGIN
      PERFORM public.hr_contrato_aplicar_renovacao(v_b, false, NULL, NULL);
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV10' THEN
      RAISE EXCEPTION 'Funcionalidade desligada devia dar HRV10; foi %.', coalesce(v_sqlstate, '(nada)') USING ERRCODE = 'HR968';
    END IF;
    UPDATE public.hr_regras_fim_contrato SET ativo = true WHERE organization_id = v_org_nike;

    -- 7. As RPCs recusam quem nao tem permissao (utilizador fabricado).
    v_auth_uid := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', v_auth_uid::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_uid)::text, true);
    v_sqlstate := NULL;
    BEGIN
      PERFORM public.rpc_hr_vinculo_renovar(v_b, NULL);
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV05' THEN
      RAISE EXCEPTION 'rpc_hr_vinculo_renovar devia dar HRV05 sem permissao; foi %.', coalesce(v_sqlstate, '(nada)') USING ERRCODE = 'HR968';
    END IF;
    v_sqlstate := NULL;
    BEGIN
      PERFORM public.rpc_hr_vinculo_terminar(v_b, NULL);
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV05' THEN
      RAISE EXCEPTION 'rpc_hr_vinculo_terminar devia dar HRV05 sem permissao; foi %.', coalesce(v_sqlstate, '(nada)') USING ERRCODE = 'HR968';
    END IF;
    v_sqlstate := NULL;
    BEGIN
      PERFORM 1 FROM public.rpc_hr_contratos_a_terminar(v_org_nike, NULL);
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV05' THEN
      RAISE EXCEPTION 'rpc_hr_contratos_a_terminar devia dar HRV05 sem permissao; foi %.', coalesce(v_sqlstate, '(nada)') USING ERRCODE = 'HR968';
    END IF;

    -- 8. Caminho completo com um login que tenha hr.pessoas.vinculos.edit na nike
    --    (se existir neste ambiente; senao salta-se).
    SELECT au.auth_user_id INTO v_auth_uid
      FROM public.anew_users au
     WHERE au.auth_user_id IS NOT NULL
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.vinculos.edit', v_org_nike)
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.pessoas.vinculos.view', v_org_nike)
     LIMIT 1;

    IF v_auth_uid IS NULL THEN
      RAISE NOTICE 'Sem login com hr.pessoas.vinculos.edit e view na nike: os passos das RPCs com permissao foram saltados.';
    ELSE
      PERFORM set_config('request.jwt.claim.sub', v_auth_uid::text, true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_uid)::text, true);
      IF auth.uid() IS NOT DISTINCT FROM v_auth_uid THEN
        -- B: renovavel NULL, desligado->ligado, 1 renovacao feita; mais uma pelo RPC.
        v_nova := public.rpc_hr_vinculo_renovar(v_b, NULL);
        IF v_nova IS DISTINCT FROM DATE '2020-11-29' THEN
          RAISE EXCEPTION 'rpc_hr_vinculo_renovar devia levar B a 2020-11-29 (45 dias depois de 2020-10-15); levou a %.', v_nova
            USING ERRCODE = 'HR968';
        END IF;

        -- C2: contrato com fim no futuro: terminar fica agendado; depois muda-se a data e a decisao cai.
        v_c := pg_temp.hr_fim_t_novo(v_org_nike, v_cargo, '20261210360000 C2', 'termo_certo', current_date - 30, current_date + 30);
        v_texto := public.rpc_hr_vinculo_terminar(v_c, NULL);
        IF v_texto IS DISTINCT FROM 'agendado' THEN
          RAISE EXCEPTION 'Terminar com fim no futuro devia devolver agendado; devolveu %.', coalesce(v_texto, '(nada)') USING ERRCODE = 'HR968';
        END IF;
        SELECT count(*) INTO v_n FROM public.pessoas_vinculos pv WHERE pv.id = v_c AND pv.fim_decisao = 'terminar' AND pv.fim_decisao_em IS NOT NULL;
        IF v_n <> 1 THEN
          RAISE EXCEPTION 'A decisao de terminar devia ficar gravada.' USING ERRCODE = 'HR968';
        END IF;

        -- A lista de contratos a terminar mostra C2 com o que acontece = termina.
        SELECT l.o_que_acontece INTO v_texto FROM public.rpc_hr_contratos_a_terminar(v_org_nike, 60) l WHERE l.vinculo_id = v_c;
        IF v_texto IS DISTINCT FROM 'termina' THEN
          RAISE EXCEPTION 'A lista devia mostrar o_que_acontece = termina; mostra %.', coalesce(v_texto, '(nada)') USING ERRCODE = 'HR968';
        END IF;

        -- C3: com fim no passado termina logo.
        v_c := pg_temp.hr_fim_t_novo(v_org_nike, v_cargo, '20261210360000 C3', 'termo_certo', current_date - 60, current_date - 1);
        v_texto := public.rpc_hr_vinculo_terminar(v_c, 'acabou');
        IF v_texto IS DISTINCT FROM 'terminado' THEN
          RAISE EXCEPTION 'Terminar com fim no passado devia devolver terminado; devolveu %.', coalesce(v_texto, '(nada)') USING ERRCODE = 'HR968';
        END IF;
        SELECT count(*) INTO v_n FROM public.pessoas_vinculos pv WHERE pv.id = v_c AND pv.estado = 'terminado';
        IF v_n <> 1 THEN
          RAISE EXCEPTION 'O contrato devia estar terminado.' USING ERRCODE = 'HR968';
        END IF;
      ELSE
        RAISE NOTICE 'auth.uid() nao le a variavel de teste neste ambiente: os passos das RPCs com permissao foram saltados.';
      END IF;
    END IF;

    RAISE EXCEPTION 'teste_hr_contratos_rpcs_rh_20261210360000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao.
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo das RPCs do RH falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): renovacao igual a inicial (6 meses: 28/02/2021 e 31/08/2021), limite HRV09, 45 dias, historico com motivo, HRV06/07/10, RPCs recusam sem permissao e (se houver login) renovar, terminar agendado/imediato e lista. Tudo desfeito.';
END;
$conferir_vivo$;

DROP FUNCTION IF EXISTS pg_temp.hr_fim_t_novo(uuid, uuid, text, text, date, date);

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho; entra no mesmo commit que os ecras.
-- 2. Listar o que esta pendente IMEDIATAMENTE antes do push
--    (supabase migration list --linked). Nunca migration repair.
-- 3. Correr os testes ANTES do push. Depois de aplicada, NAO se volta atras para
--    demonstrar o vermelho.
-- ==============================================================================
