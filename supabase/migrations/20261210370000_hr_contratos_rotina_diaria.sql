-- ==============================================================================
-- Fim de contrato (6/6): a rotina diaria (avisos, renovacao automatica, conversao
-- em sem termo, fim decidido) e o seu agendamento.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO (os ecras que mostram os avisos, as indicacoes e as
-- renovacoes). Depende de 20261210360000 e entra no mesmo commit que os ecras.
-- A rotina SO CORRE para organizacoes que ligarem a funcionalidade
-- (hr_regras_fim_contrato.ativo = true, desligado por omissao): sem linha ou
-- desligado, nada acontece, transicoes automaticas incluidas.
--
--
-- -- O QUE FAZ -----------------------------------------------------------------
--
-- Todos os dias (01:15 UTC, por pg_cron, sem http nem segredos do Vault), para cada
-- contrato EM VIGOR (activo ou suspenso), com data de fim, de tipo termo_certo,
-- termo_incerto, duracao_muito_curta ou temporario, de uma organizacao com a
-- funcionalidade ligada (hr_contratos_processar_vinculo):
--
-- A. Se o RH decidiu terminar (fim_decisao = terminar) e a data de fim ja passou:
--    o contrato passa a terminado.
--
-- B. Se a data de fim ja passou (hoje > data_fim):
--    1. responsavel indicou nao_pretendo_continuar, ou o contrato nao permite
--       renovacao automatica, ou renovavel = false: NADA acontece sozinho; o
--       contrato fica em vigor e o RH e avisado uma vez (marco pos_fim).
--    2. senao, se renovacoes_realizadas < maximo: PROLONGA o mesmo contrato
--       (hr_contrato_aplicar_renovacao, renovacao automatica, regista historico
--       com o motivo renovacao automatica e uma linha em hr_contrato_renovacoes);
--       o ciclo novo segue para os avisos abaixo.
--    3. senao (limite atingido): se a regra e converter_sem_termo, o contrato passa
--       a tipo sem_termo, sem data de fim (historico e hr_contrato_renovacoes);
--       se e decisao_manual_rh, NAO renova nem termina: fica em vigor e o RH e
--       avisado TODOS os dias (marco pos_fim_diario) ate decidir.
--
-- C. Se a data de fim ainda nao passou: avisa o RESPONSAVEL DIRECTO (so o RH se nao
--    tiver responsavel com conta) E o RH, por notificacao da app, em tres marcos:
--    antecedencia (X dias antes do fim; X = dias_aviso do contrato, ou da
--    organizacao), sete_dias (se dias_aviso > 7) e dia_fim. Os dois ultimos so se
--    repetem enquanto o responsavel nao tiver indicado uma resposta definitiva
--    (pretendo_continuar ou nao_pretendo_continuar) neste ciclo. Em cada noite so
--    se envia o marco em que se esta. O aviso aparece em TODOS os fins de ciclo,
--    incluindo depois de renovacoes automaticas e no ultimo.
--
-- Cada aviso fica no livro hr_contrato_avisos (por ciclo, marco, referencia e
-- destinatario): correr a rotina duas vezes no mesmo dia nao duplica. Um aviso que
-- falha regista-se como falhou (com RAISE WARNING) e volta a tentar-se.
--
-- Nao ha "contrato novo" nem "futuro para activo": renovar prolonga o mesmo
-- contrato. Um passo por contrato e por noite (um contrato muito atrasado
-- renova-se uma vez por noite).
--
-- hr_contratos_rotina_diaria(p_hoje) devolve um jsonb com os contadores por
-- resultado (renovado, convertido, terminado, avisado, fim_sem_decisao,
-- limite_decisao_rh, ...), erros e dia. So service_role (o pg_cron corre como o
-- dono da base).
--
--
-- -- AGENDAMENTO ---------------------------------------------------------------
--
-- O job hr-contratos-rotina-diaria (15 1 * * *) chama a funcao SQL directamente.
-- So se agenda se pg_cron existir; senao a migration avisa com RAISE WARNING
-- PENDENCIA, sem falhar, e a rotina fica por agendar (pode correr-se a mao com
-- SELECT public.hr_contratos_rotina_diaria()). Nao usa pg_net nem o Vault.
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) Ler no output do push se o job ficou agendado ou se houve PENDENCIA.
-- b) Notificacoes: type hr_contrato_fim, entity_type hr_vinculo, entity_id = o
--    contrato, kind alert, em portugues. Para o responsavel o link e NULL (ele nao
--    ve a ficha); o ecra dele e a lista rpc_hr_contratos_do_responsavel. Para o RH
--    o link e /rh/pessoas/PESSOA_ID?tab=contratos.
-- c) Um contrato criado a poucos dias do fim so recebe o primeiro aviso na noite
--    seguinte (nao ha trigger no proprio dia).
-- d) Esta migration so se aplica ao branch de RH.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- A mao: cron.unschedule('hr-contratos-rotina-diaria') e largar as tres funcoes.
--
-- Prerequisitos:
--   20261210350000  auxiliares e RPC do responsavel
--   20261210360000  hr_contrato_aplicar_renovacao
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regprocedure('public.hr_contrato_aplicar_renovacao(uuid, boolean, uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'hr_contrato_aplicar_renovacao nao existe. Aplicar 20261210360000 primeiro.';
  END IF;
  IF to_regprocedure('public.hr_contratos_notificar(uuid, uuid, text, uuid, text, text, text, jsonb, text)') IS NULL
     OR to_regprocedure('public.hr_contratos_resolver_avisos(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.hr_contratos_utilizadores_rh(uuid)') IS NULL
     OR to_regprocedure('public.hr_contratos_responsavel_user(uuid, uuid)') IS NULL
     OR to_regprocedure('public.hr_contrato_o_que_acontece(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Os auxiliares de 20261210350000 nao existem.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Enviar o aviso de um marco (um contrato, um ciclo)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_contratos_avisar(
  p_vinculo_id          uuid,
  p_marco               text,
  p_referencia          date,
  p_ciclo_fim           date,
  p_hoje                date,
  p_incluir_responsavel boolean
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v           record;
  e           record;
  v_dest      record;
  v_nome      text;
  v_tipo_txt  text;
  v_resp_uid  uuid;
  v_o_que     text;
  v_o_txt     text;
  v_dias      integer;
  v_quando    text;
  v_base      text;
  v_titulo    text;
  v_msg       text;
  v_link      text;
  v_prio      text;
  v_notif     uuid;
  v_enviados  integer := 0;
  v_alguem    boolean := false;
BEGIN
  SELECT pv.id, pv.pessoa_id, pv.organization_id, pv.tipo_contrato, pv.renovacoes_realizadas INTO v
    FROM public.pessoas_vinculos pv
   WHERE pv.id = p_vinculo_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT p.nome_completo INTO v_nome FROM public.pessoas p WHERE p.id = v.pessoa_id;
  SELECT * INTO e FROM public.hr_contrato_regra_efectiva(p_vinculo_id);
  v_o_que := public.hr_contrato_o_que_acontece(p_vinculo_id);
  v_dias  := p_ciclo_fim - p_hoje;

  v_tipo_txt := CASE v.tipo_contrato
    WHEN 'termo_certo'         THEN 'a termo certo'
    WHEN 'termo_incerto'       THEN 'a termo incerto'
    WHEN 'duracao_muito_curta' THEN 'de muito curta duração'
    WHEN 'temporario'          THEN 'temporário'
    ELSE v.tipo_contrato
  END;

  v_o_txt := CASE v_o_que
    WHEN 'renova_automaticamente' THEN 'Se nada mudar, renova automaticamente (renovação '
                                       || (v.renovacoes_realizadas + 1)::text || ' de ' || e.max_renovacoes::text || ').'
    WHEN 'converte_sem_termo'     THEN 'Se nada mudar, passa a contrato sem termo.'
    WHEN 'termina'                THEN 'O RH decidiu que termina.'
    ELSE 'Fica em vigor até o RH decidir.'
  END;

  v_quando := CASE
    WHEN v_dias = 0 THEN 'hoje'
    WHEN v_dias = 1 THEN 'amanhã'
    ELSE 'em ' || v_dias::text || ' dias'
  END;

  v_titulo := CASE p_marco
    WHEN 'dia_fim'        THEN 'Contrato termina hoje'
    WHEN 'pos_fim'        THEN 'Contrato passou a data de fim'
    WHEN 'pos_fim_diario' THEN 'Contrato aguarda decisão do RH'
    ELSE 'Contrato a terminar'
  END;

  v_base := CASE p_marco
    WHEN 'pos_fim' THEN
      coalesce(v_nome, 'Colaborador') || ': o contrato ' || v_tipo_txt || ' passou a data de fim ('
        || to_char(p_ciclo_fim, 'DD/MM/YYYY') || ') e continua em vigor.'
    WHEN 'pos_fim_diario' THEN
      coalesce(v_nome, 'Colaborador') || ': o contrato ' || v_tipo_txt || ' passou a data de fim ('
        || to_char(p_ciclo_fim, 'DD/MM/YYYY') || '), atingiu o limite de renovações e continua em vigor.'
    ELSE
      coalesce(v_nome, 'Colaborador') || ': o contrato ' || v_tipo_txt || ' termina ' || v_quando
        || ' (' || to_char(p_ciclo_fim, 'DD/MM/YYYY') || ').'
  END;

  v_prio := CASE WHEN p_marco IN ('dia_fim', 'pos_fim', 'pos_fim_diario') THEN 'high' ELSE 'medium' END;

  IF p_incluir_responsavel THEN
    v_resp_uid := public.hr_contratos_responsavel_user(v.pessoa_id, v.organization_id);
  END IF;

  FOR v_dest IN
    SELECT 'responsavel'::text AS destino, v_resp_uid AS uid
     WHERE v_resp_uid IS NOT NULL
    UNION ALL
    SELECT 'rh'::text, rh.auth_user_id
      FROM public.hr_contratos_utilizadores_rh(v.organization_id) rh
     WHERE v_resp_uid IS NULL OR rh.auth_user_id <> v_resp_uid
  LOOP
    v_alguem := true;

    IF EXISTS (
      SELECT 1 FROM public.hr_contrato_avisos a
       WHERE a.vinculo_id = p_vinculo_id AND a.ciclo_fim = p_ciclo_fim AND a.marco = p_marco
         AND a.referencia = p_referencia AND a.destino = v_dest.destino
         AND a.destinatario_user_id = v_dest.uid AND a.estado <> 'falhou'
    ) THEN
      CONTINUE;
    END IF;

    BEGIN
      IF v_dest.destino = 'responsavel' THEN
        v_msg  := v_base || ' ' || v_o_txt || ' Indique se pretende que continue.';
        v_link := NULL;
      ELSE
        v_msg  := v_base || ' ' || v_o_txt;
        v_link := '/rh/pessoas/' || v.pessoa_id::text || '?tab=contratos';
      END IF;

      v_notif := public.hr_contratos_notificar(
        v.organization_id, v_dest.uid, 'hr_contrato_fim', v.id, v_titulo, v_msg, v_link,
        jsonb_build_object('pessoa_id', v.pessoa_id, 'vinculo_id', v.id, 'ciclo_fim', p_ciclo_fim,
                           'marco', p_marco, 'destino', v_dest.destino, 'o_que_acontece', v_o_que),
        v_prio);

      INSERT INTO public.hr_contrato_avisos
        (organization_id, pessoa_id, vinculo_id, ciclo_fim, marco, referencia, destino,
         destinatario_user_id, notification_id, estado)
      VALUES
        (v.organization_id, v.pessoa_id, v.id, p_ciclo_fim, p_marco, p_referencia, v_dest.destino,
         v_dest.uid, v_notif, 'enviado');

      v_enviados := v_enviados + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Aviso de fim de contrato falhou (contrato %, marco %): %', p_vinculo_id, p_marco, SQLERRM;
      INSERT INTO public.hr_contrato_avisos
        (organization_id, pessoa_id, vinculo_id, ciclo_fim, marco, referencia, destino,
         destinatario_user_id, estado, erro)
      VALUES
        (v.organization_id, v.pessoa_id, v.id, p_ciclo_fim, p_marco, p_referencia, v_dest.destino,
         v_dest.uid, 'falhou', left(SQLERRM, 500));
    END;
  END LOOP;

  -- Nem responsavel nem RH com conta: regista-se, para aparecer no cartao do fim.
  IF NOT v_alguem THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_contrato_avisos a
       WHERE a.vinculo_id = p_vinculo_id AND a.ciclo_fim = p_ciclo_fim AND a.marco = p_marco
         AND a.referencia = p_referencia AND a.destino = 'rh'
         AND a.destinatario_user_id IS NULL AND a.estado = 'sem_destinatario'
    ) THEN
      INSERT INTO public.hr_contrato_avisos
        (organization_id, pessoa_id, vinculo_id, ciclo_fim, marco, referencia, destino, estado)
      VALUES
        (v.organization_id, v.pessoa_id, v.id, p_ciclo_fim, p_marco, p_referencia, 'rh', 'sem_destinatario');
    END IF;
  END IF;

  RETURN v_enviados;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_contratos_avisar(uuid, text, date, date, date, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contratos_avisar(uuid, text, date, date, date, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.hr_contratos_avisar(uuid, text, date, date, date, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_contratos_avisar(uuid, text, date, date, date, boolean) TO service_role;

COMMENT ON FUNCTION public.hr_contratos_avisar(uuid, text, date, date, date, boolean) IS
'INTERNA (so service_role). Envia o aviso de um marco (antecedencia, sete_dias, dia_fim, pos_fim ou pos_fim_diario) de um ciclo de contrato: ao responsavel directo (se p_incluir_responsavel e ele tiver conta activa) e ao RH (hr.pessoas.vinculos.edit), por notificacao da app, e regista cada um em hr_contrato_avisos. Idempotente: o que ja esta no livro (e nao falhou) nao se repete. Um aviso que falha fica registado como falhou e nao desfaz os outros. Sem destinatario nenhum, regista sem_destinatario. Devolve quantas notificacoes enviou. Desde 20261210370000.';

-- ==============================================================================
-- 2. Tratar um contrato (o nucleo da rotina)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_contratos_processar_vinculo(p_vinculo_id uuid, p_hoje date)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v          record;
  e          record;
  v_ind      text;
  v_marco    text;
  v_dias     integer;
  v_res      text := 'sem_accao';
BEGIN
  SELECT pv.* INTO v
    FROM public.pessoas_vinculos pv
   WHERE pv.id = p_vinculo_id AND pv.deleted_at IS NULL
     FOR UPDATE;

  IF NOT FOUND
     OR v.estado NOT IN ('activo', 'suspenso')
     OR v.data_fim IS NULL
     OR v.tipo_contrato NOT IN ('termo_certo', 'termo_incerto', 'duracao_muito_curta', 'temporario') THEN
    RETURN 'fora_do_ambito';
  END IF;

  SELECT * INTO e FROM public.hr_contrato_regra_efectiva(p_vinculo_id);
  IF NOT e.ativo THEN
    RETURN 'desligado';
  END IF;

  -- A. O RH decidiu deixar terminar.
  IF v.fim_decisao = 'terminar' THEN
    IF v.data_fim < p_hoje THEN
      PERFORM set_config('hr.alteracao_motivo', 'Fim de contrato decidido pelo RH', true);
      UPDATE public.pessoas_vinculos SET estado = 'terminado' WHERE id = v.id;
      PERFORM set_config('hr.alteracao_motivo', '', true);
      PERFORM public.hr_contratos_resolver_avisos(v.id, 'decidido', NULL);
      RETURN 'terminado';
    END IF;
    RETURN 'decidido_terminar';
  END IF;

  SELECT i.resposta INTO v_ind
    FROM public.hr_contrato_indicacoes i
   WHERE i.vinculo_id = v.id AND i.ciclo_fim = v.data_fim
   ORDER BY i.indicada_em DESC, i.id
   LIMIT 1;

  -- B. A data de fim ja passou.
  IF v.data_fim < p_hoje THEN
    IF v_ind IS DISTINCT FROM 'nao_pretendo_continuar'
       AND e.renovacao_automatica
       AND v.renovavel IS DISTINCT FROM false THEN

      IF v.renovacoes_realizadas < e.max_renovacoes THEN
        -- B2. Renovacao automatica: prolonga o mesmo contrato.
        PERFORM public.hr_contrato_aplicar_renovacao(v.id, true, NULL, NULL);
        SELECT pv.* INTO v FROM public.pessoas_vinculos pv WHERE pv.id = p_vinculo_id;
        v_res := 'renovado';

      ELSIF e.ao_atingir_limite = 'converter_sem_termo' THEN
        -- B3a. Limite atingido: passa a sem termo.
        PERFORM set_config('hr.vinculo_via_rpc', 'on', true);
        PERFORM set_config('hr.alteracao_motivo', 'Limite de renovacoes atingido: passou a sem termo', true);
        UPDATE public.pessoas_vinculos
           SET tipo_contrato   = 'sem_termo',
               data_fim        = NULL,
               fim_decisao     = NULL,
               fim_decisao_em  = NULL,
               fim_decisao_por = NULL
         WHERE id = v.id;
        PERFORM set_config('hr.vinculo_via_rpc', 'off', true);
        PERFORM set_config('hr.alteracao_motivo', '', true);

        INSERT INTO public.hr_contrato_renovacoes
          (organization_id, pessoa_id, vinculo_id, numero, tipo, data_fim_anterior, data_fim_nova, feita_por, motivo)
        VALUES
          (v.organization_id, v.pessoa_id, v.id, v.renovacoes_realizadas, 'conversao_sem_termo',
           v.data_fim, NULL, NULL, 'Limite de renovacoes atingido');

        PERFORM public.hr_contratos_resolver_avisos(v.id, 'ciclo_convertido', NULL);
        RETURN 'convertido';

      ELSE
        -- B3b. Limite atingido e a decisao e do RH: fica em vigor e avisa-se todos os dias.
        PERFORM public.hr_contratos_avisar(v.id, 'pos_fim_diario', p_hoje, v.data_fim, p_hoje, false);
        RETURN 'limite_decisao_rh';
      END IF;

    ELSE
      -- B1. Ninguem decidiu e nada se renova sozinho: fica em vigor, o RH e avisado uma vez.
      PERFORM public.hr_contratos_avisar(v.id, 'pos_fim', v.data_fim, v.data_fim, p_hoje, false);
      RETURN 'fim_sem_decisao';
    END IF;

    -- Depois de renovar, se o ciclo novo ainda e passado, fica para a noite seguinte.
    IF v.data_fim < p_hoje THEN
      RETURN v_res;
    END IF;

    SELECT i.resposta INTO v_ind
      FROM public.hr_contrato_indicacoes i
     WHERE i.vinculo_id = v.id AND i.ciclo_fim = v.data_fim
     ORDER BY i.indicada_em DESC, i.id
     LIMIT 1;
  END IF;

  -- C. A data de fim ainda nao passou: avisos por marco.
  v_dias := v.data_fim - p_hoje;
  v_marco := CASE
    WHEN v_dias = 0                              THEN 'dia_fim'
    WHEN e.dias_aviso > 7 AND v_dias <= 7        THEN 'sete_dias'
    WHEN v_dias <= e.dias_aviso                  THEN 'antecedencia'
    ELSE NULL
  END;

  IF v_marco IS NULL THEN
    RETURN v_res;
  END IF;

  -- As repeticoes param quando o responsavel ja indicou uma resposta definitiva.
  IF v_marco IN ('sete_dias', 'dia_fim') AND v_ind IN ('pretendo_continuar', 'nao_pretendo_continuar') THEN
    RETURN v_res;
  END IF;

  PERFORM public.hr_contratos_avisar(v.id, v_marco, v.data_fim, v.data_fim, p_hoje, true);

  RETURN CASE WHEN v_res = 'renovado' THEN 'renovado_e_avisado' ELSE 'avisado' END;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_contratos_processar_vinculo(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contratos_processar_vinculo(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.hr_contratos_processar_vinculo(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_contratos_processar_vinculo(uuid, date) TO service_role;

COMMENT ON FUNCTION public.hr_contratos_processar_vinculo(uuid, date) IS
'INTERNA (so service_role). O que a rotina diaria faz a UM contrato em p_hoje (ver o cabecalho de 20261210370000): termina o que o RH decidiu terminar; passada a data de fim, renova automaticamente (prolonga o mesmo contrato), converte em sem termo ao atingir o limite, ou deixa em vigor e avisa o RH; antes do fim, avisa responsavel e RH nos marcos. Devolve o resultado: fora_do_ambito, desligado, terminado, decidido_terminar, renovado, renovado_e_avisado, convertido, limite_decisao_rh, fim_sem_decisao, avisado ou sem_accao. Desde 20261210370000.';

-- ==============================================================================
-- 3. A rotina diaria
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_contratos_rotina_diaria(p_hoje date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id    uuid;
  v_res   text;
  v_cont  jsonb := '{}'::jsonb;
  v_erros integer := 0;
BEGIN
  FOR v_id IN
    SELECT pv.id
      FROM public.pessoas_vinculos pv
      JOIN public.hr_regras_fim_contrato r
        ON r.organization_id = pv.organization_id AND r.ativo
     WHERE pv.deleted_at IS NULL
       AND pv.estado IN ('activo', 'suspenso')
       AND pv.data_fim IS NOT NULL
       AND pv.tipo_contrato IN ('termo_certo', 'termo_incerto', 'duracao_muito_curta', 'temporario')
     ORDER BY pv.data_fim, pv.id
  LOOP
    BEGIN
      v_res := public.hr_contratos_processar_vinculo(v_id, p_hoje);
      v_cont := jsonb_set(v_cont, ARRAY[v_res], to_jsonb(coalesce((v_cont ->> v_res)::integer, 0) + 1));
    EXCEPTION WHEN OTHERS THEN
      v_erros := v_erros + 1;
      RAISE WARNING 'Rotina de fim de contrato: o contrato % falhou (SQLSTATE %): %', v_id, SQLSTATE, SQLERRM;
    END;
  END LOOP;

  RETURN v_cont || jsonb_build_object('erros', v_erros, 'dia', p_hoje);
END;
$$;

REVOKE ALL ON FUNCTION public.hr_contratos_rotina_diaria(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contratos_rotina_diaria(date) FROM anon;
REVOKE ALL ON FUNCTION public.hr_contratos_rotina_diaria(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_contratos_rotina_diaria(date) TO service_role;

COMMENT ON FUNCTION public.hr_contratos_rotina_diaria(date) IS
'A rotina diaria de fim de contrato (agendada por pg_cron as 01:15 UTC): percorre os contratos em vigor, com data de fim e de tipo com ciclo, das organizacoes com hr_regras_fim_contrato.ativo = true, e trata cada um com hr_contratos_processar_vinculo. Um contrato que falha nao trava os outros (RAISE WARNING e conta em erros). Devolve um jsonb com os contadores por resultado, erros e dia. So service_role. Desde 20261210370000.';

-- ==============================================================================
-- 4. Agendar (pg_cron, SQL puro, sem Vault)
-- ==============================================================================
DO $agendar$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'PENDENCIA: pg_cron nao esta instalado; o job hr-contratos-rotina-diaria NAO foi agendado. Os avisos, as renovacoes automaticas e as conversoes de fim de contrato nao correm sozinhos ate la (podem correr-se a mao com SELECT public.hr_contratos_rotina_diaria()).';
    RETURN;
  END IF;

  PERFORM cron.unschedule('hr-contratos-rotina-diaria')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-contratos-rotina-diaria');

  PERFORM cron.schedule(
    'hr-contratos-rotina-diaria',
    '15 1 * * *',
    $job$SELECT public.hr_contratos_rotina_diaria()$job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'PENDENCIA: nao foi possivel agendar hr-contratos-rotina-diaria (%).', SQLERRM;
END;
$agendar$;

-- ==============================================================================
-- Conferir (estrutura): falha o push se algo estiver diferente do esperado.
-- ==============================================================================
DO $conferir$
DECLARE
  v_f   text;
  v_job boolean := false;
BEGIN
  FOREACH v_f IN ARRAY ARRAY[
    'public.hr_contratos_avisar(uuid, text, date, date, date, boolean)',
    'public.hr_contratos_processar_vinculo(uuid, date)',
    'public.hr_contratos_rotina_diaria(date)'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
       WHERE p.oid = to_regprocedure(v_f) AND p.prosecdef
         AND array_to_string(p.proconfig, ',') LIKE '%search_path=%'
    ) THEN
      RAISE EXCEPTION '% devia ser SECURITY DEFINER com search_path fixo.', v_f;
    END IF;
    IF has_function_privilege('anon', v_f, 'EXECUTE') OR has_function_privilege('public', v_f, 'EXECUTE')
       OR has_function_privilege('authenticated', v_f, 'EXECUTE') THEN
      RAISE EXCEPTION '% devia ser so de service_role.', v_f;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'PENDENCIA: sem pg_cron o job hr-contratos-rotina-diaria nao existe; registar em POR FAZER e agendar quando houver pg_cron.';
  ELSE
    SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-contratos-rotina-diaria') INTO v_job;
    IF NOT v_job THEN
      RAISE WARNING 'PENDENCIA: pg_cron existe mas o job hr-contratos-rotina-diaria nao ficou agendado (ver o aviso acima).';
    ELSIF EXISTS (
      SELECT 1 FROM cron.job
       WHERE jobname = 'hr-contratos-rotina-diaria'
         AND (command NOT LIKE '%hr_contratos_rotina_diaria%' OR command LIKE '%vault%' OR command LIKE '%eyJ%')
    ) THEN
      RAISE EXCEPTION 'O comando do job hr-contratos-rotina-diaria devia chamar so a funcao SQL, sem segredos.';
    ELSE
      RAISE NOTICE 'OK: job hr-contratos-rotina-diaria agendado as 01:15 UTC, a chamar a funcao SQL (sem Vault).';
    END IF;
  END IF;

  RAISE NOTICE 'OK: hr_contratos_avisar, hr_contratos_processar_vinculo e hr_contratos_rotina_diaria so para service_role.';
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
  v_hoje      date := current_date;
  v_cargo     uuid;
  v_chefe     uuid;
  v_s1        uuid;
  v_s2        uuid;
  v_s3        uuid;
  v_s4        uuid;
  v_s5        uuid;
  v_s6        uuid;
  v_s7        uuid;
  v_res       text;
  v_n         integer;
  v_n2        integer;
  v_fim       date;
  v_tipo      text;
  v_motivo    text;
  v_json      jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo da rotina foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- Escritas SO na nike (organization_id confirmado acima).
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org_nike, 'TESTE MIGRACAO cargo 20261210370000 ' || gen_random_uuid()::text, 0, 'mensal')
    RETURNING id INTO v_cargo;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210370000 chefe -- apagar', v_cargo, v_hoje)
    RETURNING id INTO v_chefe;

    -- Regras da nike (so dentro do teste): ligado, renovacao automatica, 1 renovacao
    -- de 3 meses, converter no limite, 30 dias de aviso.
    INSERT INTO public.hr_regras_fim_contrato
      (organization_id, ativo, dias_aviso, renovacao_automatica, max_renovacoes,
       duracao_renovacao_valor, duracao_renovacao_unidade, ao_atingir_limite)
    VALUES (v_org_nike, true, 30, true, 1, 3, 'meses', 'converter_sem_termo')
    ON CONFLICT (organization_id) DO UPDATE
      SET ativo = true, dias_aviso = 30, renovacao_automatica = true, max_renovacoes = 1,
          duracao_renovacao_valor = 3, duracao_renovacao_unidade = 'meses',
          ao_atingir_limite = 'converter_sem_termo';

    -- ---- S1: renovacao automatica e depois conversao em sem termo ----------------
    v_s1 := pg_temp.hr_fim_t_novo(v_org_nike, v_cargo, '20261210370000 S1', 'termo_certo', v_hoje - 200, v_hoje - 1);
    v_res := public.hr_contratos_processar_vinculo(v_s1, v_hoje);
    IF v_res IS DISTINCT FROM 'renovado' THEN
      RAISE EXCEPTION 'S1: fim ontem com renovacao automatica devia dar renovado; deu %.', coalesce(v_res, '(nada)') USING ERRCODE = 'HR969';
    END IF;
    SELECT pv.data_fim, pv.renovacoes_realizadas INTO v_fim, v_n FROM public.pessoas_vinculos pv WHERE pv.id = v_s1;
    IF v_fim IS DISTINCT FROM public.hr_contrato_somar_duracao(v_hoje - 1, 3, 'meses') OR v_n <> 1 THEN
      RAISE EXCEPTION 'S1: a renovacao devia prolongar 3 meses e deixar o contador a 1; ficou % e %.', v_fim, v_n USING ERRCODE = 'HR969';
    END IF;
    SELECT count(*) INTO v_n FROM public.hr_contrato_renovacoes r
     WHERE r.vinculo_id = v_s1 AND r.tipo = 'automatica' AND r.numero = 1 AND r.feita_por IS NULL;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'S1: devia haver 1 renovacao automatica registada; ha %.', v_n USING ERRCODE = 'HR969';
    END IF;
    SELECT a.motivo INTO v_motivo FROM public.pessoas_vinculos_alteracoes a
     WHERE a.vinculo_id = v_s1 AND a.campo = 'data_fim' AND a.valor_depois = to_char(v_fim, 'YYYY-MM-DD');
    IF v_motivo IS DISTINCT FROM 'renovacao automatica' THEN
      RAISE EXCEPTION 'S1: o historico devia ter o motivo renovacao automatica; tem %.', coalesce(v_motivo, '(nulo)') USING ERRCODE = 'HR969';
    END IF;

    -- No fim do ciclo novo o contador ja esta no maximo: converte em sem termo.
    v_res := public.hr_contratos_processar_vinculo(v_s1, v_fim + 1);
    IF v_res IS DISTINCT FROM 'convertido' THEN
      RAISE EXCEPTION 'S1: no limite devia dar convertido; deu %.', coalesce(v_res, '(nada)') USING ERRCODE = 'HR969';
    END IF;
    SELECT pv.tipo_contrato, pv.data_fim INTO v_tipo, v_fim FROM public.pessoas_vinculos pv WHERE pv.id = v_s1;
    IF v_tipo IS DISTINCT FROM 'sem_termo' OR v_fim IS NOT NULL THEN
      RAISE EXCEPTION 'S1: o contrato devia ficar sem_termo e sem data de fim; ficou % e %.', v_tipo, v_fim USING ERRCODE = 'HR969';
    END IF;
    SELECT count(*) INTO v_n FROM public.hr_contrato_renovacoes r WHERE r.vinculo_id = v_s1 AND r.tipo = 'conversao_sem_termo';
    SELECT count(*) INTO v_n2 FROM public.pessoas_vinculos_alteracoes a
     WHERE a.vinculo_id = v_s1 AND a.campo = 'tipo_contrato' AND a.valor_depois = 'sem_termo'
       AND a.motivo = 'Limite de renovacoes atingido: passou a sem termo';
    IF v_n <> 1 OR v_n2 <> 1 THEN
      RAISE EXCEPTION 'S1: a conversao devia ficar em hr_contrato_renovacoes e no historico; ha % e %.', v_n, v_n2 USING ERRCODE = 'HR969';
    END IF;
    -- Sem termo ja nao entra na rotina.
    IF public.hr_contratos_processar_vinculo(v_s1, v_hoje + 1000) IS DISTINCT FROM 'fora_do_ambito' THEN
      RAISE EXCEPTION 'S1: um contrato sem termo devia dar fora_do_ambito.' USING ERRCODE = 'HR969';
    END IF;

    -- ---- S2: avisos por marco, idempotentes, e a indicacao do responsavel ------------
    v_s2 := pg_temp.hr_fim_t_novo(v_org_nike, v_cargo, '20261210370000 S2', 'termo_certo', v_hoje - 60, v_hoje + 10);
    UPDATE public.pessoas SET reporta_a_pessoa_id = v_chefe
     WHERE id = (SELECT pv.pessoa_id FROM public.pessoas_vinculos pv WHERE pv.id = v_s2);

    v_res := public.hr_contratos_processar_vinculo(v_s2, v_hoje);
    IF v_res IS DISTINCT FROM 'avisado' THEN
      RAISE EXCEPTION 'S2: a 10 dias do fim (aviso de 30) devia dar avisado; deu %.', coalesce(v_res, '(nada)') USING ERRCODE = 'HR969';
    END IF;
    SELECT count(*) INTO v_n FROM public.hr_contrato_avisos a WHERE a.vinculo_id = v_s2 AND a.marco = 'antecedencia';
    IF v_n < 1 THEN
      RAISE EXCEPTION 'S2: devia haver pelo menos um registo do marco antecedencia no livro.' USING ERRCODE = 'HR969';
    END IF;
    PERFORM public.hr_contratos_processar_vinculo(v_s2, v_hoje);
    SELECT count(*) INTO v_n2 FROM public.hr_contrato_avisos a WHERE a.vinculo_id = v_s2 AND a.marco = 'antecedencia';
    IF v_n2 <> v_n THEN
      RAISE EXCEPTION 'S2: correr duas vezes nao devia duplicar o livro (% e depois %).', v_n, v_n2 USING ERRCODE = 'HR969';
    END IF;

    -- A 7 dias do fim: marco sete_dias.
    PERFORM public.hr_contratos_processar_vinculo(v_s2, v_hoje + 3);
    SELECT count(*) INTO v_n FROM public.hr_contrato_avisos a WHERE a.vinculo_id = v_s2 AND a.marco = 'sete_dias';
    IF v_n < 1 THEN
      RAISE EXCEPTION 'S2: a 7 dias do fim devia haver o marco sete_dias no livro.' USING ERRCODE = 'HR969';
    END IF;

    -- Se houver destinatarios com login, ha UMA notificacao aberta por destinatario.
    SELECT count(DISTINCT a.destinatario_user_id) INTO v_n
      FROM public.hr_contrato_avisos a WHERE a.vinculo_id = v_s2 AND a.estado = 'enviado';
    SELECT count(*) INTO v_n2 FROM public.notifications nt
     WHERE nt.type = 'hr_contrato_fim' AND nt.entity_id = v_s2 AND nt.is_resolved = false;
    IF v_n <> v_n2 THEN
      RAISE EXCEPTION 'S2: devia haver uma notificacao aberta por destinatario (% destinatarios, % abertas).', v_n, v_n2 USING ERRCODE = 'HR969';
    END IF;

    -- O responsavel indica que pretende continuar: o dia do fim deixa de avisar.
    INSERT INTO public.hr_contrato_indicacoes
      (organization_id, pessoa_id, vinculo_id, ciclo_fim, resposta, indicada_por_pessoa_id)
    SELECT pv.organization_id, pv.pessoa_id, pv.id, pv.data_fim, 'pretendo_continuar', v_chefe
      FROM public.pessoas_vinculos pv WHERE pv.id = v_s2;
    PERFORM public.hr_contratos_processar_vinculo(v_s2, v_hoje + 10);
    SELECT count(*) INTO v_n FROM public.hr_contrato_avisos a WHERE a.vinculo_id = v_s2 AND a.marco = 'dia_fim';
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'S2: com pretendo_continuar o dia do fim nao devia avisar; ha % registo(s).', v_n USING ERRCODE = 'HR969';
    END IF;

    -- S3: sem indicacao, o dia do fim avisa.
    v_s3 := pg_temp.hr_fim_t_novo(v_org_nike, v_cargo, '20261210370000 S3', 'temporario', v_hoje - 60, v_hoje + 10);
    PERFORM public.hr_contratos_processar_vinculo(v_s3, v_hoje + 10);
    SELECT count(*) INTO v_n FROM public.hr_contrato_avisos a WHERE a.vinculo_id = v_s3 AND a.marco = 'dia_fim';
    IF v_n < 1 THEN
      RAISE EXCEPTION 'S3: sem indicacao o dia do fim devia avisar.' USING ERRCODE = 'HR969';
    END IF;

    -- ---- S4: sem renovacao automatica, nada se renova nem termina sozinho -------------
    UPDATE public.hr_regras_fim_contrato SET renovacao_automatica = false WHERE organization_id = v_org_nike;
    v_s4 := pg_temp.hr_fim_t_novo(v_org_nike, v_cargo, '20261210370000 S4', 'termo_certo', v_hoje - 90, v_hoje - 1);
    v_res := public.hr_contratos_processar_vinculo(v_s4, v_hoje);
    IF v_res IS DISTINCT FROM 'fim_sem_decisao' THEN
      RAISE EXCEPTION 'S4: sem renovacao automatica devia dar fim_sem_decisao; deu %.', coalesce(v_res, '(nada)') USING ERRCODE = 'HR969';
    END IF;
    SELECT count(*) INTO v_n FROM public.pessoas_vinculos pv
     WHERE pv.id = v_s4 AND pv.estado = 'activo' AND pv.data_fim = v_hoje - 1 AND pv.renovacoes_realizadas = 0;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'S4: o contrato devia ficar em vigor, sem alteracoes.' USING ERRCODE = 'HR969';
    END IF;
    SELECT count(*) INTO v_n FROM public.hr_contrato_avisos a WHERE a.vinculo_id = v_s4 AND a.marco = 'pos_fim';
    PERFORM public.hr_contratos_processar_vinculo(v_s4, v_hoje + 1);
    SELECT count(*) INTO v_n2 FROM public.hr_contrato_avisos a WHERE a.vinculo_id = v_s4 AND a.marco = 'pos_fim';
    IF v_n < 1 OR v_n2 <> v_n THEN
      RAISE EXCEPTION 'S4: o aviso pos_fim devia existir e nao repetir (% e depois %).', v_n, v_n2 USING ERRCODE = 'HR969';
    END IF;

    -- ---- S5: o RH decidiu terminar --------------------------------------------------
    v_s5 := pg_temp.hr_fim_t_novo(v_org_nike, v_cargo, '20261210370000 S5', 'termo_certo', v_hoje - 90, v_hoje - 1);
    PERFORM set_config('hr.vinculo_via_rpc', 'on', true);
    UPDATE public.pessoas_vinculos SET fim_decisao = 'terminar', fim_decisao_em = now() WHERE id = v_s5;
    PERFORM set_config('hr.vinculo_via_rpc', 'off', true);
    v_res := public.hr_contratos_processar_vinculo(v_s5, v_hoje);
    SELECT count(*) INTO v_n FROM public.pessoas_vinculos pv WHERE pv.id = v_s5 AND pv.estado = 'terminado';
    IF v_res IS DISTINCT FROM 'terminado' OR v_n <> 1 THEN
      RAISE EXCEPTION 'S5: com a decisao de terminar e o fim passado devia dar terminado; deu %.', coalesce(v_res, '(nada)') USING ERRCODE = 'HR969';
    END IF;

    -- ---- S6: limite atingido com decisao manual do RH: avisa todos os dias ------------
    UPDATE public.hr_regras_fim_contrato
       SET renovacao_automatica = true, max_renovacoes = 0, ao_atingir_limite = 'decisao_manual_rh'
     WHERE organization_id = v_org_nike;
    v_s6 := pg_temp.hr_fim_t_novo(v_org_nike, v_cargo, '20261210370000 S6', 'termo_certo', v_hoje - 90, v_hoje - 1);
    v_res := public.hr_contratos_processar_vinculo(v_s6, v_hoje);
    IF v_res IS DISTINCT FROM 'limite_decisao_rh' THEN
      RAISE EXCEPTION 'S6: limite atingido com decisao manual devia dar limite_decisao_rh; deu %.', coalesce(v_res, '(nada)') USING ERRCODE = 'HR969';
    END IF;
    PERFORM public.hr_contratos_processar_vinculo(v_s6, v_hoje + 1);
    SELECT count(DISTINCT a.referencia) INTO v_n FROM public.hr_contrato_avisos a WHERE a.vinculo_id = v_s6 AND a.marco = 'pos_fim_diario';
    SELECT count(*) INTO v_n2 FROM public.pessoas_vinculos pv
     WHERE pv.id = v_s6 AND pv.estado = 'activo' AND pv.tipo_contrato = 'termo_certo' AND pv.data_fim = v_hoje - 1;
    IF v_n <> 2 OR v_n2 <> 1 THEN
      RAISE EXCEPTION 'S6: devia avisar em 2 dias distintos e o contrato ficar intacto; avisos em % dia(s), contrato intacto %.', v_n, v_n2 USING ERRCODE = 'HR969';
    END IF;

    -- ---- S7: o responsavel indicou que nao pretende continuar: nada se renova --------
    UPDATE public.hr_regras_fim_contrato SET max_renovacoes = 5 WHERE organization_id = v_org_nike;
    v_s7 := pg_temp.hr_fim_t_novo(v_org_nike, v_cargo, '20261210370000 S7', 'termo_certo', v_hoje - 90, v_hoje - 1);
    INSERT INTO public.hr_contrato_indicacoes
      (organization_id, pessoa_id, vinculo_id, ciclo_fim, resposta, indicada_por_pessoa_id)
    SELECT pv.organization_id, pv.pessoa_id, pv.id, pv.data_fim, 'nao_pretendo_continuar', v_chefe
      FROM public.pessoas_vinculos pv WHERE pv.id = v_s7;
    v_res := public.hr_contratos_processar_vinculo(v_s7, v_hoje);
    SELECT count(*) INTO v_n FROM public.pessoas_vinculos pv WHERE pv.id = v_s7 AND pv.renovacoes_realizadas = 0 AND pv.data_fim = v_hoje - 1;
    IF v_res IS DISTINCT FROM 'fim_sem_decisao' OR v_n <> 1 THEN
      RAISE EXCEPTION 'S7: com nao_pretendo_continuar nada devia renovar; deu %.', coalesce(v_res, '(nada)') USING ERRCODE = 'HR969';
    END IF;

    -- ---- Desligado: nada acontece ---------------------------------------------------
    UPDATE public.hr_regras_fim_contrato SET ativo = false WHERE organization_id = v_org_nike;
    IF public.hr_contratos_processar_vinculo(v_s7, v_hoje) IS DISTINCT FROM 'desligado' THEN
      RAISE EXCEPTION 'Com a funcionalidade desligada devia dar desligado.' USING ERRCODE = 'HR969';
    END IF;
    UPDATE public.hr_regras_fim_contrato SET ativo = true WHERE organization_id = v_org_nike;

    -- ---- A rotina completa corre sem rebentar ---------------------------------------
    v_json := public.hr_contratos_rotina_diaria(v_hoje);
    IF jsonb_typeof(v_json) IS DISTINCT FROM 'object' OR (v_json -> 'erros') IS NULL OR (v_json -> 'dia') IS NULL THEN
      RAISE EXCEPTION 'A rotina devia devolver um objecto com erros e dia; devolveu %.', v_json::text USING ERRCODE = 'HR969';
    END IF;

    RAISE EXCEPTION 'teste_hr_contratos_rotina_diaria_20261210370000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao.
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo da rotina diaria falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): renovacao automatica, conversao em sem termo, avisos por marco sem duplicar, indicacao do responsavel, sem renovacao automatica, fim decidido, limite com decisao manual (aviso diario), nao_pretendo_continuar, desligado e a rotina completa. Tudo desfeito.';
END;
$conferir_vivo$;

DROP FUNCTION IF EXISTS pg_temp.hr_fim_t_novo(uuid, uuid, text, text, date, date);

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho; entra no mesmo commit que os ecras.
-- 2. Listar o que esta pendente IMEDIATAMENTE antes do push
--    (supabase migration list --linked). Nunca migration repair.
-- 3. Ler no output do push o aviso do pg_cron (PENDENCIA) e os NOTICE do HR900.
-- 4. Correr os testes ANTES do push. Depois de aplicada, NAO se volta atras para
--    demonstrar o vermelho.
-- 5. Antes de ligar a funcionalidade numa organizacao real: medir o custo da
--    rotina na nike (um SELECT em ciclo, sem criar nada).
-- ==============================================================================
