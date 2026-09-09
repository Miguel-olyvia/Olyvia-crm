-- ==============================================================================
-- A consolidacao: de eventos de picagem para intervalos de tempo trabalhado.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- pessoas_picagens guarda instantes; pessoas_horario_realizado guarda
-- intervalos. Falta a peca que emparelha entrada com saida e escreve os
-- intervalos -- e falta que ela seja IDEMPOTENTE e DETERMINISTA, porque vai
-- correr outra vez a cada picagem, a cada correccao e a cada anulacao do dia.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- hr_picagens_consolidar(pessoa, org, data) le as picagens EM VIGOR
-- (v_hr_picagens_em_vigor -- as validas que ninguem corrige), por momento,
-- emparelha entrada -> saida seguinte, e para cada par escreve uma linha de
-- pessoas_horario_realizado com origem='picagem', estado='registado', o
-- local_id da ENTRADA e o planeado_id do intervalo que a contem.
--
-- Quatro decisoes que ficam escritas:
--
-- 1. NUNCA toca em linhas com origem <> 'picagem'. O que o RH lancou a mao nao
--    e apagado por uma reconsolidacao.
--
-- 2. NUNCA toca em linhas com estado <> 'registado'. Uma linha VALIDADA foi
--    confirmada por uma pessoa e sustenta um pagamento; uma reconsolidacao nao
--    a desfaz em silencio. Se a picagem que a originou for corrigida, a linha
--    validada fica -- e o desvio aparece na fila de quem gere assiduidade.
--
-- 3. Um par INCOMPLETO (entrada sem saida, ou saida orfa) NAO produz realizado
--    nenhum. Aparece na vista de desvios (20261121250000) como pendente_par.
--    Inventar uma saida a hora do planeado seria a base a fabricar horas que
--    ninguem picou.
--
-- 4. Um turno que atravessa a meia-noite e partido em DUAS linhas, em duas
--    datas, seguindo a convencao que a ronda 2 fixou (hora_fim > hora_inicio,
--    uma linha por data). A parte da vespera termina as 23:59:59 e a do dia
--    seguinte comeca as 00:00:00 -- 24:00:00 nao existe no tipo time, e um
--    segundo por turno de noite e a aproximacao que se assume por escrito.
--
-- As linhas de picagem que deixaram de corresponder a um par sao SOFT-DELETED
-- (deleted_at), nao apagadas: o registo de tempo de trabalho tem de ficar
-- disponivel cinco anos, e uma consolidacao que apague linhas destroi o rasto
-- de uma versao anterior.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Tolerancias de atraso, arredondamentos, horas extraordinarias, banco de
--   horas e subsidio de refeicao. A base fica com minutos planeados e minutos
--   realizados por intervalo e por local, que e a materia-prima; as regras de
--   conversao em dinheiro exigem decisoes de produto que nao estao tomadas, e
--   pessoas_retribuicoes esta interdita nesta ronda.
-- - Pausas automaticas: se a pessoa picou a saida para almoco, ha dois pares e
--   dois intervalos. Se nao picou, ha um intervalo longo. A base nao desconta
--   almocos que ninguem picou.
-- - O parser de cada marca de relogio de ponto. A permissao
--   (hr.assiduidade.importar), o dominio origem='importacao' e a unique de
--   idempotencia ficam prontos; o parser nao.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION public.rpc_hr_realizado_corrigir(uuid, time, time, uuid, text);
--   DROP FUNCTION public.rpc_hr_picagens_consolidar_dia(uuid, uuid, date);
--   -- e esvaziar o corpo de hr_picagens_consolidar.
--
--
-- Prerequisitos:
--   20261121170000  hr_picagens_consolidar (a versao vazia) e v_hr_picagens_em_vigor
--   20261121180000  pessoas_horario_realizado com corrige_realizado_id e a
--                   unique (id, pessoa_id, organization_id)
--   20261121140000  hr.assiduidade.gerir / .corrigir no catalogo
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_picagens_consolidar' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION
      'hr_picagens_consolidar(uuid, uuid, date) nao existe. Aplicar 20261121170000 primeiro: esta migracao substitui-lhe o corpo, nao a cria.';
  END IF;

  IF to_regclass('public.v_hr_picagens_em_vigor') IS NULL THEN
    RAISE EXCEPTION 'A vista v_hr_picagens_em_vigor nao existe. Aplicar 20261121170000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_horario_realizado'
       AND column_name = 'corrige_realizado_id'
  ) THEN
    RAISE EXCEPTION
      'pessoas_horario_realizado nao tem corrige_realizado_id. Aplicar 20261121180000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_picagens_realizado_fkey'
       AND conrelid = to_regclass('public.pessoas_picagens')
  ) THEN
    RAISE EXCEPTION
      'A FK de pessoas_picagens.realizado_id nao existe. Aplicar 20261121180000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.gerir') THEN
    RAISE EXCEPTION 'hr.assiduidade.gerir nao esta no catalogo. Aplicar 20261121140000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- O corpo da consolidacao
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_picagens_consolidar(
  _pessoa_id uuid,
  _organization_id uuid,
  _data date
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ev        record;
  v_abertura  record;
  v_pares     jsonb := '[]'::jsonb;
  v_par       jsonb;
  v_ini       time;
  v_fim       time;
  v_realizado uuid;
  v_criados   integer := 0;
BEGIN
  IF _pessoa_id IS NULL OR _organization_id IS NULL OR _data IS NULL THEN
    RETURN 0;
  END IF;

  v_abertura := NULL;

  -- Tres dias, nao um: um turno que atravessa a meia-noite tem a entrada na
  -- vespera ou a saida no dia seguinte, e emparelhar so dentro do dia perderia
  -- exactamente o turno de noite.
  FOR v_ev IN
    SELECT p.id, p.momento, p.data_local, p.hora_local, p.sentido,
           p.local_id, p.planeado_id, p.vinculo_id
      FROM public.v_hr_picagens_em_vigor p
     WHERE p.pessoa_id = _pessoa_id
       AND p.organization_id = _organization_id
       AND p.data_local BETWEEN (_data - 1) AND (_data + 1)
     ORDER BY p.momento
  LOOP
    IF v_ev.sentido = 'entrada' THEN
      -- Duas entradas seguidas: a primeira fica sem par e NAO produz
      -- realizado. Aparece na fila de desvios como pendente_par -- inventar
      -- uma saida seria a base a fabricar horas que ninguem picou.
      v_abertura := v_ev;
      CONTINUE;
    END IF;

    -- Saida.
    IF v_abertura IS NULL THEN
      -- Saida orfa: nada a formar.
      CONTINUE;
    END IF;

    -- Qual a parte deste par que pertence a _data.
    IF v_abertura.data_local = _data AND v_ev.data_local = _data THEN
      v_ini := v_abertura.hora_local;
      v_fim := v_ev.hora_local;
    ELSIF v_abertura.data_local = _data AND v_ev.data_local > _data THEN
      -- Atravessou a meia-noite: a parte da vespera termina as 23:59:59.
      -- 24:00:00 nao existe no tipo time; o segundo em falta e a aproximacao
      -- que se assume por escrito.
      v_ini := v_abertura.hora_local;
      v_fim := '23:59:59'::time;
    ELSIF v_abertura.data_local < _data AND v_ev.data_local = _data THEN
      v_ini := '00:00:00'::time;
      v_fim := v_ev.hora_local;
    ELSE
      v_abertura := NULL;
      CONTINUE;
    END IF;

    -- Um par de duracao zero nao e um intervalo, e violaria o CHECK da ronda 2.
    IF v_fim <= v_ini THEN
      v_abertura := NULL;
      CONTINUE;
    END IF;

    v_pares := v_pares || jsonb_build_object(
      'hora_inicio', v_ini,
      'hora_fim', v_fim,
      'local_id', v_abertura.local_id,
      'planeado_id', v_abertura.planeado_id,
      'vinculo_id', v_abertura.vinculo_id,
      'picagem_entrada', v_abertura.id,
      'picagem_saida', v_ev.id
    );

    v_abertura := NULL;
  END LOOP;

  -- As linhas de picagem do dia que JA NAO correspondem a par nenhum saem de
  -- circulacao por soft delete. Nao se apagam: o registo tem de ficar cinco
  -- anos, e uma consolidacao que apague destroi o rasto da versao anterior.
  -- NUNCA se toca em origem <> 'picagem' (o que o RH lancou a mao) nem em
  -- estado <> 'registado' (uma linha validada sustenta um pagamento).
  UPDATE public.pessoas_horario_realizado h
     SET deleted_at = now()
   WHERE h.pessoa_id = _pessoa_id
     AND h.organization_id = _organization_id
     AND h.data = _data
     AND h.origem = 'picagem'
     AND h.estado = 'registado'
     AND h.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_pares) AS e
        WHERE (e.value ->> 'hora_inicio')::time = h.hora_inicio
          AND (e.value ->> 'hora_fim')::time = h.hora_fim
     );

  -- E os pares que ainda nao tem linha ganham-na.
  FOR v_par IN SELECT * FROM jsonb_array_elements(v_pares)
  LOOP
    SELECT h.id INTO v_realizado
      FROM public.pessoas_horario_realizado h
     WHERE h.pessoa_id = _pessoa_id
       AND h.organization_id = _organization_id
       AND h.data = _data
       AND h.hora_inicio = (v_par ->> 'hora_inicio')::time
       AND h.hora_fim = (v_par ->> 'hora_fim')::time
       AND h.deleted_at IS NULL
       AND h.estado <> 'rejeitado'
     LIMIT 1;

    IF v_realizado IS NULL THEN
      INSERT INTO public.pessoas_horario_realizado (
        pessoa_id, organization_id, data, hora_inicio, hora_fim,
        local_id, planeado_id, vinculo_id, origem, estado, notas
      ) VALUES (
        _pessoa_id, _organization_id, _data,
        (v_par ->> 'hora_inicio')::time, (v_par ->> 'hora_fim')::time,
        nullif(v_par ->> 'local_id', '')::uuid,
        nullif(v_par ->> 'planeado_id', '')::uuid,
        nullif(v_par ->> 'vinculo_id', '')::uuid,
        'picagem', 'registado',
        'consolidado a partir de picagens'
      )
      RETURNING id INTO v_realizado;

      v_criados := v_criados + 1;
    END IF;

    -- Os dois eventos passam a apontar ao intervalo que formaram.
    UPDATE public.pessoas_picagens p
       SET realizado_id = v_realizado
     WHERE p.id IN (
             nullif(v_par ->> 'picagem_entrada', '')::uuid,
             nullif(v_par ->> 'picagem_saida', '')::uuid
           )
       AND p.realizado_id IS DISTINCT FROM v_realizado;
  END LOOP;

  RETURN v_criados;
END;
$$;

COMMENT ON FUNCTION public.hr_picagens_consolidar(uuid, uuid, date) IS
'Emparelha as picagens EM VIGOR de um dia e escreve os intervalos em pessoas_horario_realizado com origem=picagem. IDEMPOTENTE e DETERMINISTA: corre outra vez a cada picagem, correccao e anulacao, e o resultado depende so dos eventos em vigor.

Quatro regras que nao se relaxam:
- nunca toca em linhas com origem <> picagem -- o que o RH lancou a mao nao e apagado por uma reconsolidacao;
- nunca toca em linhas com estado <> registado -- uma linha validada foi confirmada por uma pessoa e sustenta um pagamento;
- um par incompleto NAO produz realizado nenhum, e aparece na fila de desvios como pendente_par: inventar uma saida a hora do planeado seria a base a fabricar horas que ninguem picou;
- um turno que atravessa a meia-noite da duas linhas, em duas datas, seguindo a convencao da ronda 2. A parte da vespera termina as 23:59:59 porque 24:00:00 nao existe no tipo time -- o segundo em falta e uma aproximacao assumida.

Le TRES dias (vespera, dia, seguinte) porque emparelhar so dentro do dia perderia o turno de noite.

As linhas que deixaram de corresponder a par saem por SOFT DELETE, nao por apagamento: o registo tem de ficar disponivel cinco anos.';

-- ==============================================================================
-- A RPC publica de reconsolidar
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_picagens_consolidar_dia(
  _organization_id uuid,
  _pessoa_id uuid,
  _data date
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'assiduidade_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.gerir', _organization_id) THEN
    RAISE EXCEPTION
      'assiduidade_sem_permissao: reconsolidar um dia exige hr.assiduidade.gerir nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.hr_picagens_consolidar(_pessoa_id, _organization_id, _data);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_picagens_consolidar_dia(uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_picagens_consolidar_dia(uuid, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_picagens_consolidar_dia(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_picagens_consolidar_dia(uuid, uuid, date) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_picagens_consolidar_dia(uuid, uuid, date) IS
'Reconsolida um dia a pedido, exigindo hr.assiduidade.gerir. Devolve quantos intervalos foram criados. Existe porque a consolidacao automatica corre na picagem e na correccao, e ha casos -- uma importacao em bloco, um horario planeado corrigido depois -- em que se quer refazer o dia sem tocar nas picagens.';

-- ==============================================================================
-- rpc_hr_realizado_corrigir
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_realizado_corrigir(
  _realizado_id uuid,
  _hora_inicio time,
  _hora_fim time,
  _local_id uuid,
  _motivo text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_eu   uuid;
  v_old  public.pessoas_horario_realizado;
  v_new  uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'assiduidade_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION
      'realizado_correccao_sem_motivo: corrigir horas trabalhadas exige motivo escrito. E o rasto que fica cinco anos.'
      USING ERRCODE = '23514';
  END IF;

  SELECT h.* INTO v_old FROM public.pessoas_horario_realizado h WHERE h.id = _realizado_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'realizado_inexistente: o intervalo % nao existe.', _realizado_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.corrigir', v_old.organization_id) THEN
    RAISE EXCEPTION
      'realizado_sem_permissao: corrigir horas trabalhadas exige hr.assiduidade.corrigir nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_old.deleted_at IS NOT NULL OR v_old.estado = 'rejeitado' THEN
    RAISE EXCEPTION
      'realizado_nao_corrigivel: o intervalo % esta apagado ou rejeitado. Corrigir a linha em vigor.', _realizado_id
      USING ERRCODE = '23514';
  END IF;

  IF _hora_fim <= _hora_inicio THEN
    RAISE EXCEPTION
      'realizado_horas_invalidas: a hora de fim tem de ser posterior a de inicio. Um turno que atravessa a meia-noite sao DUAS linhas, em duas datas -- e a convencao da ronda 2.'
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  v_eu := public.hr_pessoa_do_utilizador(v_auth, v_old.organization_id);

  -- A sentinela de 20261121240000: sem ela, o UPDATE do estado da linha antiga
  -- e recusado. Ligada aqui porque esta e uma RPC do modulo.
  PERFORM set_config('hr_assiduidade.rpc', 'on', true);

  INSERT INTO public.pessoas_horario_realizado (
    pessoa_id, organization_id, data, hora_inicio, hora_fim,
    local_id, planeado_id, vinculo_id, origem, estado,
    corrige_realizado_id, correccao_motivo,
    corrigido_por_anew_user_id, corrigido_por_pessoa_id, created_by
  ) VALUES (
    v_old.pessoa_id, v_old.organization_id, v_old.data, _hora_inicio, _hora_fim,
    coalesce(_local_id, v_old.local_id), v_old.planeado_id, v_old.vinculo_id, 'manual', 'registado',
    _realizado_id, btrim(_motivo),
    v_anew, v_eu, v_anew
  )
  RETURNING id INTO v_new;

  -- A antiga passa a rejeitada com motivo: e o vocabulario da ronda 2, e o
  -- trigger de sobreposicao JA isenta as rejeitadas -- foi previsto para isto,
  -- e e o que permite as duas versoes coexistirem na mesma hora.
  UPDATE public.pessoas_horario_realizado
     SET estado = 'rejeitado',
         motivo_rejeicao = 'corrigido: ' || btrim(_motivo),
         updated_by = v_anew
   WHERE id = _realizado_id;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_realizado_corrigir(uuid, time, time, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_realizado_corrigir(uuid, time, time, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_realizado_corrigir(uuid, time, time, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_realizado_corrigir(uuid, time, time, uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_realizado_corrigir(uuid, time, time, uuid, text) IS
'Corrige um intervalo de tempo trabalhado: insere a linha nova com corrige_realizado_id e marca a antiga como rejeitada com motivo, na MESMA transaccao. Exige hr.assiduidade.corrigir e motivo escrito.

A antiga fica em estado=rejeitado, que e o vocabulario que a ronda 2 fixou e que o trigger de nao-sobreposicao JA isenta -- foi previsto exactamente para isto, e e o que permite as duas versoes coexistirem na mesma hora sem que a base recuse a correcta.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_corpo text;
BEGIN
  SELECT p.prosrc INTO v_corpo
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_picagens_consolidar' AND p.pronargs = 3;

  IF v_corpo IS NULL THEN
    RAISE EXCEPTION 'hr_picagens_consolidar desapareceu.';
  END IF;

  IF v_corpo NOT LIKE '%pessoas_horario_realizado%' THEN
    RAISE EXCEPTION
      'hr_picagens_consolidar continua vazia: o CREATE OR REPLACE nao substituiu o corpo de 20261121170000.';
  END IF;

  -- As duas guardas que nao se relaxam.
  IF v_corpo NOT LIKE '%origem = ''picagem''%' THEN
    RAISE EXCEPTION
      'A consolidacao nao filtra por origem=picagem. Uma reconsolidacao apagaria as horas que o RH lancou a mao.';
  END IF;

  IF v_corpo NOT LIKE '%estado = ''registado''%' THEN
    RAISE EXCEPTION
      'A consolidacao nao filtra por estado=registado. Uma reconsolidacao desfaria em silencio horas ja VALIDADAS, que sustentam pagamentos.';
  END IF;

  -- E que le a vista de valor em vigor, e nao a tabela em bruto: da tabela
  -- viriam tambem as versoes corrigidas, e o dia sairia duplicado.
  IF v_corpo NOT LIKE '%v_hr_picagens_em_vigor%' THEN
    RAISE EXCEPTION
      'A consolidacao nao le v_hr_picagens_em_vigor. Da tabela em bruto viriam tambem as picagens corrigidas, e o dia sairia duplicado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_picagens_consolidar_dia' AND p.pronargs = 3
       AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'rpc_hr_picagens_consolidar_dia nao ficou criada como SECURITY DEFINER com 3 argumentos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_realizado_corrigir' AND p.pronargs = 5
       AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'rpc_hr_realizado_corrigir nao ficou criada como SECURITY DEFINER com 5 argumentos.';
  END IF;

  IF has_function_privilege('anon', 'public.rpc_hr_picagens_consolidar_dia(uuid, uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon consegue executar rpc_hr_picagens_consolidar_dia. O REVOKE nao pegou.';
  END IF;

  RAISE NOTICE 'Conferido: consolidacao com corpo, filtros de origem e estado, e as duas RPCs.';
END;
$conferir$;
