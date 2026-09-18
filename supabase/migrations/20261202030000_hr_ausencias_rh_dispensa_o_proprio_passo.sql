-- ==============================================================================
-- Atalho do passo de RH: quem tem hr.ausencias.aprovar.rh e cria o pedido na
-- ficha de OUTRA pessoa (sem passo de chefia no caminho) nasce ja aprovado,
-- em vez de nascer pendente_rh e ter de decidir logo a seguir.
--
-- POR APLICAR.
--
--
-- -- A MUDANCA: hr_ausencias_estado_inicial GANHA UM 4.o ARGUMENTO -----------
--
-- Esta migracao ALTERA A ASSINATURA de uma funcao existente e RECRIA as duas
-- RPCs que a chamam, tudo na mesma migracao -- aplicar so metade parte a
-- outra RPC na primeira chamada (o corpo plpgsql compila tarde, o `db push`
-- passaria sem avisar). `DROP FUNCTION` da versao de 3 argumentos e
-- `CREATE` da de 4 -- um `CREATE OR REPLACE` com um parametro a mais NAO
-- substitui, cria uma SEGUNDA funcao sobrecarregada, e a ambiguidade de
-- PostgREST daí e o mesmo erro que ja parou o botao de resolver submissoes
-- neste repositorio. Sem `DEFAULT` no 4.o argumento, de proposito: um
-- chamador esquecido falha alto, nao herda em silencio o comportamento antigo.
--
--
-- -- O QUE MUDA, EXACTAMENTE -----------------------------------------------------
--
-- hr_ausencias_estado_inicial(_exige_chefia, _tem_aprovador, _exige_rh,
-- _pedido_por_quem_aprova_rh):
--   1. exige_chefia AND tem_aprovador          -> 'pendente_chefia'  (IGUAL)
--   2. exige_rh AND NOT pedido_por_quem_aprova_rh -> 'pendente_rh'
--   3. senao                                    -> 'aprovado'
--
-- O 1.o ramo nunca ve o 4.o argumento: a chefia continua intocavel, com ou
-- sem RH a criar o pedido. O atalho so entra no 2.o ramo, o passo de RH.
--
-- `_pedido_por_quem_aprova_rh` calcula-se DENTRO da RPC (nunca enviado pelo
-- cliente, para nao ser forjavel):
--   v_atalho_rh := (v_eu IS NULL OR v_eu <> _pessoa_id)
--                  AND has_anew_permission_in_org(v_auth, 'hr.ausencias.aprovar.rh', _organization_id)
--
-- "Pedir para si" (v_eu = _pessoa_id) NUNCA usa o atalho -- RH a marcar as
-- suas proprias ferias continua a passar pelo passo de RH, para que OUTRA
-- pessoa o decida. E `hr.ausencias.aprovar.rh`, no NAO `hr.ausencias.pedir.outros`:
-- quem so regista pedidos em papel (pedir.outros) nao decide o passo de RH,
-- e por isso nao ganha o atalho.
--
--
-- -- A LINHA DE DECISAO DE RH DEIXA DE MENTIR --------------------------------
--
-- Antes, `v_estado = 'aprovado'` gravava SEMPRE resultado='dispensado' com o
-- motivo "o tipo nao exige aprovacao de RH" -- falso no caminho novo, onde o
-- tipo EXIGE RH e foi uma PESSOA que o aprovou no acto. Passa a dois ramos:
--   tipo NAO exige RH          -> dispensado, motivo antigo (inalterado)
--   tipo exige RH + atalho     -> aprovado, decidido_por = v_anew (ou
--                                 quem criou o pedido), motivo explicito
--
--
-- -- O QUE ISTO NAO ABRE --------------------------------------------------------
--
-- - A chefia continua intocavel (ver acima).
-- - O atalho e a MESMA autoridade um clique antes: sem ele, o pedido nascia
--   pendente_rh e a mesma pessoa chamava rpc_hr_ausencia_decidir_rh, que
--   exige exactamente hr.ausencias.aprovar.rh. Ninguem ganha poder que nao
--   tivesse.
-- - pedir.outros sozinho nao chega -- precisa de aprovar.rh tambem.
-- - A si proprio nao vale (v_eu <> _pessoa_id exigido).
-- - hr_ausencias_pedido_transicao (BEFORE UPDATE OF estado) nao muda: o
--   atalho actua no NASCIMENTO (INSERT), nao numa aresta de transicao.
-- - hr_ausencias_estado_inicial continua IMMUTABLE e pura -- a permissao
--   le-se fora dela, na RPC.
--
--
-- -- rpc_hr_ausencia_pedir_alteracao TAMBEM MUDA, E NAO E OPCIONAL -----------
--
-- Chama a mesma funcao pura (com 3 argumentos, na versao anterior) para
-- calcular o estado de uma alteracao de dias sobre um pedido ja aprovado.
-- Sem esta segunda reescrita, ficava a chamar uma funcao que deixou de
-- existir e toda alteracao de dias rebentava. Mesmo calculo do atalho
-- (v_eu/_original.pessoa_id em vez de _pessoa_id), mesmo ramo na linha de
-- decisao de RH. Efeito lateral JA existente, nao novo: quando o estado
-- calculado e 'aprovado', esta RPC chama hr_ausencias_efectivar_substituicao
-- de imediato -- com o atalho, uma alteracao criada pelo RH sem chefia no
-- caminho passa a substituir o original no acto, tal como ja acontece hoje
-- para um tipo sem chefia nem RH nenhum.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION IF EXISTS public.hr_ausencias_estado_inicial(boolean, boolean, boolean, boolean);
-- E depois reaplicar hr_ausencias_estado_inicial(3 args) e os corpos antigos
-- de rpc_hr_ausencia_pedir/rpc_hr_ausencia_pedir_alteracao de
-- 20261121110000/20261201020000.
--
--
-- Prerequisitos:
--   20261121110000  hr_ausencias_estado_inicial(3), rpc_hr_ausencia_pedir(12 args)
--   20261121010000  catalogo hr.ausencias.aprovar.rh
--   20261201020000  rpc_hr_ausencia_pedir_alteracao(6 args), hr_ausencias_efectivar_substituicao(uuid)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_estado_inicial' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_estado_inicial(boolean,boolean,boolean) nao existe. Aplicar 20261121110000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_pedir' AND p.pronargs = 12
  ) THEN
    RAISE EXCEPTION 'rpc_hr_ausencia_pedir com 12 argumentos nao existe. Aplicar 20261121110000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_pedir_alteracao' AND p.pronargs = 6
  ) THEN
    RAISE EXCEPTION 'rpc_hr_ausencia_pedir_alteracao com 6 argumentos nao existe. Aplicar 20261201020000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_efectivar_substituicao' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_efectivar_substituicao(uuid) nao existe. Aplicar 20261201020000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.ausencias.aprovar.rh') THEN
    RAISE EXCEPTION 'hr.ausencias.aprovar.rh nao esta no catalogo. Aplicar 20261121010000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. hr_ausencias_estado_inicial -- DROP da versao de 3 args, CREATE da de 4
-- ==============================================================================
DROP FUNCTION IF EXISTS public.hr_ausencias_estado_inicial(boolean, boolean, boolean);

CREATE FUNCTION public.hr_ausencias_estado_inicial(
  _exige_chefia boolean,
  _tem_aprovador boolean,
  _exige_rh boolean,
  _pedido_por_quem_aprova_rh boolean
)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN coalesce(_exige_chefia, true) AND coalesce(_tem_aprovador, false) THEN 'pendente_chefia'
    WHEN coalesce(_exige_rh, true) AND NOT coalesce(_pedido_por_quem_aprova_rh, false) THEN 'pendente_rh'
    ELSE 'aprovado'
  END;
$$;

REVOKE ALL ON FUNCTION public.hr_ausencias_estado_inicial(boolean, boolean, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_ausencias_estado_inicial(boolean, boolean, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_estado_inicial(boolean, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_estado_inicial(boolean, boolean, boolean, boolean) TO service_role;

COMMENT ON FUNCTION public.hr_ausencias_estado_inicial(boolean, boolean, boolean, boolean) IS
'O estado em que um pedido NASCE. O 4.o argumento (_pedido_por_quem_aprova_rh, calculado na RPC -- nunca enviado pelo cliente) dispensa o passo de RH QUANDO o tipo o exige mas quem cria o pedido ja tem hr.ausencias.aprovar.rh (e nao e a propria pessoa). O 1.o ramo (chefia) nunca ve este argumento -- a chefia continua intocavel. Pura e IMMUTABLE de proposito, no molde da versao de 3 argumentos que substitui.';

-- ==============================================================================
-- 2. rpc_hr_ausencia_pedir -- mesma assinatura, atalho no calculo do estado
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_pedir(
  _organization_id uuid,
  _pessoa_id uuid,
  _tipo_id uuid,
  _data_inicio date,
  _data_fim date,
  _meio_dia_inicio boolean DEFAULT false,
  _meio_dia_fim boolean DEFAULT false,
  _hora_inicio time DEFAULT NULL,
  _hora_fim time DEFAULT NULL,
  _motivo text DEFAULT NULL,
  _vinculo_id uuid DEFAULT NULL,
  _origem text DEFAULT 'board'
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth        uuid := auth.uid();
  v_anew        uuid;
  v_eu          uuid;
  v_tipo        public.hr_ausencias_tipos;
  v_aprovador   uuid;
  v_estado      text;
  v_atalho_rh   boolean;
  v_pedido_id   uuid;
  v_dias_total  numeric(6,2) := 0;
  v_periodo_ini date;
  v_periodo_fim date;
  v_dia         date;
  v_fraccao     numeric(3,2);
  v_feriado     boolean;
  v_fim_semana  boolean;
  v_p_ini       date;
  v_estado_dia  text;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  v_eu := public.hr_pessoa_do_utilizador(v_auth, _organization_id);

  -- Autoridade: pedir para si e uma permissao, pedir por outro e outra.
  IF v_eu IS NOT NULL AND v_eu = _pessoa_id THEN
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.pedir', _organization_id) THEN
      RAISE EXCEPTION 'ausencia_sem_permissao: falta hr.ausencias.pedir nesta organizacao.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.pedir.outros', _organization_id) THEN
      RAISE EXCEPTION
        'ausencia_sem_permissao: pedir ausencia na ficha de outra pessoa exige hr.ausencias.pedir.outros nesta organizacao.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Atalho do passo de RH: so quando NAO e a propria pessoa a pedir, e quem
  -- cria o pedido tem hr.ausencias.aprovar.rh (nao hr.ausencias.pedir.outros
  -- -- registar em papel e decidir o passo de RH sao autoridades diferentes).
  -- Calculado aqui, nunca enviado pelo cliente -- nao e forjavel.
  v_atalho_rh := (v_eu IS NULL OR v_eu <> _pessoa_id)
    AND public.has_anew_permission_in_org(v_auth, 'hr.ausencias.aprovar.rh', _organization_id);

  -- A pessoa tem de existir, estar viva e ser DESTA organizacao.
  IF NOT EXISTS (
    SELECT 1 FROM public.pessoas p
     WHERE p.id = _pessoa_id AND p.organization_id = _organization_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'ausencia_pessoa_invalida: a pessoa nao existe nesta organizacao.' USING ERRCODE = '23503';
  END IF;

  SELECT t.* INTO v_tipo
    FROM public.hr_ausencias_tipos t
   WHERE t.id = _tipo_id AND t.organization_id = _organization_id
     AND t.deleted_at IS NULL AND t.activo = true;

  IF v_tipo.id IS NULL THEN
    RAISE EXCEPTION
      'ausencia_tipo_invalido: o tipo nao existe nesta organizacao, esta apagado, ou esta inactivo.'
      USING ERRCODE = '23503';
  END IF;

  IF _data_fim < _data_inicio THEN
    RAISE EXCEPTION 'ausencia_datas_invalidas: a data de fim e anterior a de inicio.' USING ERRCODE = '23514';
  END IF;

  IF NOT v_tipo.permite_meio_dia AND (_meio_dia_inicio OR _meio_dia_fim) THEN
    RAISE EXCEPTION
      'ausencia_meio_dia_nao_permitido: o tipo "%" nao permite marcacao de meio dia.', v_tipo.nome
      USING ERRCODE = '23514';
  END IF;

  IF v_tipo.antecedencia_minima_dias IS NOT NULL
     AND _data_inicio < (current_date + v_tipo.antecedencia_minima_dias) THEN
    RAISE EXCEPTION
      'ausencia_sem_antecedencia: o tipo "%" exige % dias de antecedencia e o pedido comeca em %.',
      v_tipo.nome, v_tipo.antecedencia_minima_dias, _data_inicio
      USING ERRCODE = '23514';
  END IF;

  -- O periodo de saldo do PRIMEIRO dia, como snapshot do pedido. Cada dia
  -- recebe o seu, que pode ser outro (um pedido a cavalo do fim do ano).
  SELECT d.periodo_inicio, d.periodo_fim INTO v_periodo_ini, v_periodo_fim
    FROM public.pessoas_ausencias_direitos d
   WHERE d.pessoa_id = _pessoa_id AND d.organization_id = _organization_id
     AND d.tipo_id = _tipo_id AND d.deleted_at IS NULL
     AND _data_inicio BETWEEN d.periodo_inicio AND d.periodo_fim
   ORDER BY d.periodo_inicio DESC
   LIMIT 1;

  IF v_periodo_ini IS NULL THEN
    -- Sem direito registado, o periodo e o ano civil do primeiro dia. NAO se
    -- recusa o pedido: ha tipos que nao descontam saldo nenhum, e recusar
    -- deixaria doenca e faltas sem caminho.
    v_periodo_ini := date_trunc('year', _data_inicio)::date;
    v_periodo_fim := (date_trunc('year', _data_inicio) + interval '1 year - 1 day')::date;
  END IF;

  -- Chefia e estado inicial.
  v_aprovador := public.hr_ausencias_aprovador_chefia(_pessoa_id, _organization_id);

  v_estado := public.hr_ausencias_estado_inicial(
    v_tipo.exige_aprovacao_chefia, v_aprovador IS NOT NULL, v_tipo.exige_aprovacao_rh, v_atalho_rh
  );

  v_estado_dia := CASE WHEN v_estado = 'aprovado' THEN 'aprovado' ELSE 'pendente' END;

  -- Expandir o intervalo em dias, para contar dias_solicitados ANTES de gravar
  -- o pedido -- a coluna e NOT NULL e o total e gravado, nao recalculado.
  v_dia := _data_inicio;
  WHILE v_dia <= _data_fim LOOP
    v_fim_semana := extract(isodow FROM v_dia) IN (6, 7);

    SELECT EXISTS (
      SELECT 1 FROM public.schedule_holidays sh
       WHERE sh.organization_id = _organization_id
         AND (
           (coalesce(sh.is_recurring, false) = false AND sh.holiday_date = v_dia)
           OR (coalesce(sh.is_recurring, false) = true
               AND to_char(sh.holiday_date, 'MM-DD') = to_char(v_dia, 'MM-DD'))
         )
    ) INTO v_feriado;

    IF (v_fim_semana AND NOT v_tipo.inclui_fim_de_semana)
       OR (v_feriado AND NOT v_tipo.inclui_feriados) THEN
      -- Fica de fora: nao gera linha e nao conta. E por isso que
      -- dias_solicitados e gravado -- depende do calendario DESTE momento.
      v_dia := v_dia + 1;
      CONTINUE;
    END IF;

    v_fraccao := 1.00;
    IF v_dia = _data_inicio AND _meio_dia_inicio THEN v_fraccao := 0.50; END IF;
    IF v_dia = _data_fim AND _meio_dia_fim THEN v_fraccao := 0.50; END IF;

    v_dias_total := v_dias_total + v_fraccao;
    v_dia := v_dia + 1;
  END LOOP;

  IF v_dias_total <= 0 THEN
    RAISE EXCEPTION
      'ausencia_sem_dias_uteis: o intervalo de % a % nao tem nenhum dia contavel para o tipo "%" (fins de semana e feriados ficam de fora deste tipo).',
      _data_inicio, _data_fim, v_tipo.nome
      USING ERRCODE = '23514';
  END IF;

  -- A sentinela liga aqui: e a partir deste ponto que os triggers de estado
  -- aceitam mudancas nesta transaccao.
  PERFORM set_config('hr_ausencias.rpc', 'on', true);

  INSERT INTO public.pessoas_ausencias_pedidos (
    organization_id, pessoa_id, tipo_id, vinculo_id,
    data_inicio, data_fim, meio_dia_inicio, meio_dia_fim, hora_inicio, hora_fim,
    dias_solicitados, motivo, estado,
    aprovador_chefia_pessoa_id, criado_por_pessoa_id, origem,
    periodo_inicio, periodo_fim, created_by
  ) VALUES (
    _organization_id, _pessoa_id, _tipo_id, _vinculo_id,
    _data_inicio, _data_fim, _meio_dia_inicio, _meio_dia_fim, _hora_inicio, _hora_fim,
    v_dias_total, _motivo, v_estado,
    v_aprovador, v_eu, coalesce(_origem, 'board'),
    v_periodo_ini, v_periodo_fim, v_anew
  )
  RETURNING id INTO v_pedido_id;

  -- Segunda passagem: as linhas de dia, cada uma com o SEU periodo de saldo.
  v_dia := _data_inicio;
  WHILE v_dia <= _data_fim LOOP
    v_fim_semana := extract(isodow FROM v_dia) IN (6, 7);

    SELECT EXISTS (
      SELECT 1 FROM public.schedule_holidays sh
       WHERE sh.organization_id = _organization_id
         AND (
           (coalesce(sh.is_recurring, false) = false AND sh.holiday_date = v_dia)
           OR (coalesce(sh.is_recurring, false) = true
               AND to_char(sh.holiday_date, 'MM-DD') = to_char(v_dia, 'MM-DD'))
         )
    ) INTO v_feriado;

    IF (v_fim_semana AND NOT v_tipo.inclui_fim_de_semana)
       OR (v_feriado AND NOT v_tipo.inclui_feriados) THEN
      v_dia := v_dia + 1;
      CONTINUE;
    END IF;

    v_fraccao := 1.00;
    IF v_dia = _data_inicio AND _meio_dia_inicio THEN v_fraccao := 0.50; END IF;
    IF v_dia = _data_fim AND _meio_dia_fim THEN v_fraccao := 0.50; END IF;

    -- O periodo DESTE dia. E isto que faz 28 de Dezembro e 3 de Janeiro
    -- imputarem a periodos diferentes sem partir o pedido em dois.
    SELECT d.periodo_inicio INTO v_p_ini
      FROM public.pessoas_ausencias_direitos d
     WHERE d.pessoa_id = _pessoa_id AND d.organization_id = _organization_id
       AND d.tipo_id = _tipo_id AND d.deleted_at IS NULL
       AND v_dia BETWEEN d.periodo_inicio AND d.periodo_fim
     ORDER BY d.periodo_inicio DESC
     LIMIT 1;

    IF v_p_ini IS NULL THEN
      v_p_ini := date_trunc('year', v_dia)::date;
    END IF;

    INSERT INTO public.pessoas_ausencias_dias (
      pedido_id, pessoa_id, organization_id, tipo_id,
      data, fraccao_dia, conta_saldo, e_feriado, e_fim_semana,
      periodo_inicio, estado
    ) VALUES (
      v_pedido_id, _pessoa_id, _organization_id, _tipo_id,
      v_dia, v_fraccao, v_tipo.desconta_saldo, v_feriado, v_fim_semana,
      v_p_ini, v_estado_dia
    );

    v_dia := v_dia + 1;
  END LOOP;

  -- As decisoes dispensadas. Nunca ha um pedido aprovado sem duas linhas de
  -- decisao a explica-lo.
  IF v_estado <> 'pendente_chefia' THEN
    INSERT INTO public.pessoas_ausencias_pedido_decisoes (
      pedido_id, pessoa_id, organization_id, ordem, passo, resultado, motivo
    ) VALUES (
      v_pedido_id, _pessoa_id, _organization_id, 1, 'chefia', 'dispensado',
      CASE
        WHEN NOT v_tipo.exige_aprovacao_chefia
          THEN 'o tipo nao exige aprovacao de chefia'
        ELSE 'sem chefia atribuida'
      END
    );
  END IF;

  IF v_estado = 'aprovado' THEN
    IF NOT v_tipo.exige_aprovacao_rh THEN
      INSERT INTO public.pessoas_ausencias_pedido_decisoes (
        pedido_id, pessoa_id, organization_id, ordem, passo, resultado, motivo
      ) VALUES (
        v_pedido_id, _pessoa_id, _organization_id, 1, 'rh', 'dispensado',
        'o tipo nao exige aprovacao de RH'
      );
    ELSE
      -- O tipo EXIGE RH; quem aprovou foi quem criou o pedido, no acto,
      -- porque tem hr.ausencias.aprovar.rh. A linha diz isso, nao mente
      -- dizendo que o tipo nao exige RH.
      INSERT INTO public.pessoas_ausencias_pedido_decisoes (
        pedido_id, pessoa_id, organization_id, ordem, passo, resultado,
        decidido_por_anew_user_id, decidido_por_pessoa_id, motivo
      ) VALUES (
        v_pedido_id, _pessoa_id, _organization_id, 1, 'rh', 'aprovado', v_anew, v_eu,
        'aprovado no acto por quem tem hr.ausencias.aprovar.rh e criou o pedido na ficha de outra pessoa'
      );
    END IF;
  END IF;

  PERFORM public.hr_ausencias_projectar_no_board(v_pedido_id);

  RETURN v_pedido_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_pedir(uuid, uuid, uuid, date, date, boolean, boolean, time, time, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_pedir(uuid, uuid, uuid, date, date, boolean, boolean, time, time, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_pedir(uuid, uuid, uuid, date, date, boolean, boolean, time, time, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_pedir(uuid, uuid, uuid, date, date, boolean, boolean, time, time, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_pedir(uuid, uuid, uuid, date, date, boolean, boolean, time, time, text, uuid, text) IS
'O UNICO caminho para criar um pedido de ausencia. Verifica a permissao (pedir para si e uma, pedir por outro e outra), valida o tipo e a antecedencia, resolve a chefia, expande o intervalo em dias civis ignorando fins de semana e feriados quando o tipo os exclui, imputa cada dia ao seu periodo de saldo, grava dias_solicitados, e escreve as decisoes dispensadas/aprovadas que faltem.

Desde 20261202030000: quando quem cria o pedido NA FICHA DE OUTRA PESSOA tem hr.ausencias.aprovar.rh, o passo de RH nasce ja aprovado (v_atalho_rh) em vez de pendente_rh -- a mesma autoridade que decidiria a seguir, um clique antes. A chefia nunca e afectada por este atalho. Sem direito registado, o periodo e o ano civil e o pedido NAO e recusado: ha tipos que nao descontam saldo, e recusar deixaria doenca e faltas sem caminho.';

-- ==============================================================================
-- 3. rpc_hr_ausencia_pedir_alteracao -- mesma assinatura, mesmo atalho
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_pedir_alteracao(
  _pedido_original_id uuid,
  _nova_data_inicio date,
  _nova_data_fim date,
  _novo_meio_dia_inicio boolean DEFAULT false,
  _novo_meio_dia_fim boolean DEFAULT false,
  _motivo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth        uuid := auth.uid();
  v_anew        uuid;
  v_eu          uuid;
  v_original    public.pessoas_ausencias_pedidos;
  v_tipo        public.hr_ausencias_tipos;
  v_aprovador   uuid;
  v_estado      text;
  v_atalho_rh   boolean;
  v_pedido_id   uuid;
  v_dias_total  numeric(6,2) := 0;
  v_periodo_ini date;
  v_periodo_fim date;
  v_dia         date;
  v_fraccao     numeric(3,2);
  v_feriado     boolean;
  v_fim_semana  boolean;
  v_saldo       record;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  SELECT p.* INTO v_original FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_original_id;
  IF v_original.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_pedido_inexistente: o pedido % nao existe.', _pedido_original_id USING ERRCODE = '23503';
  END IF;

  v_eu := public.hr_pessoa_do_utilizador(v_auth, v_original.organization_id);

  -- Autoridade: a MESMA de pedir de raiz -- pedir para si e uma permissao,
  -- pedir por outro e outra. O tipo, o vinculo, a pessoa e a organizacao
  -- HERDAM-SE do original: nao sao argumentos desta RPC.
  IF v_eu IS NOT NULL AND v_eu = v_original.pessoa_id THEN
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.pedir', v_original.organization_id) THEN
      RAISE EXCEPTION 'ausencia_sem_permissao: falta hr.ausencias.pedir nesta organizacao.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.pedir.outros', v_original.organization_id) THEN
      RAISE EXCEPTION
        'ausencia_sem_permissao: pedir uma alteracao na ficha de outra pessoa exige hr.ausencias.pedir.outros nesta organizacao.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Mesmo atalho de rpc_hr_ausencia_pedir, calculado sobre a pessoa do
  -- ORIGINAL (a alteracao herda pessoa e organizacao dele).
  v_atalho_rh := (v_eu IS NULL OR v_eu <> v_original.pessoa_id)
    AND public.has_anew_permission_in_org(v_auth, 'hr.ausencias.aprovar.rh', v_original.organization_id);

  IF v_original.estado <> 'aprovado' THEN
    RAISE EXCEPTION
      'ausencia_alteracao_original_nao_aprovado: so se pede alteracao de um pedido JA APROVADO; este esta em "%". Um pedido pendente altera-se cancelando e pedindo de novo.', v_original.estado
      USING ERRCODE = '23514';
  END IF;

  -- Fronteira ALTERACAO / CORRECCAO: original.data_inicio, nao data_fim. Uma
  -- ausencia que ja comecou deixa de ser "dias futuros a mudar" e passa a ser
  -- historico -- caminho de rpc_hr_ausencia_corrigir_aprovado, nao este.
  IF v_original.data_inicio <= current_date THEN
    RAISE EXCEPTION
      'ausencia_alteracao_ja_comecou: a ausencia original comeca em %, que ja nao e futuro. Pedir alteracao de dias e so para ausencias que ainda nao comecaram; uma ausencia ja iniciada ou passada corrige-se pelo caminho do historico.', v_original.data_inicio
      USING ERRCODE = '23514';
  END IF;

  -- So uma alteracao pendente de cada vez sobre o mesmo original -- o mesmo
  -- que o indice unico parcial ja garante, mas com mensagem legivel em vez de
  -- uma violacao de indice crua.
  IF EXISTS (
    SELECT 1 FROM public.pessoas_ausencias_pedidos a
     WHERE a.substitui_pedido_id = _pedido_original_id
       AND a.estado IN ('pendente_chefia', 'pendente_rh')
  ) THEN
    RAISE EXCEPTION
      'ausencia_alteracao_ja_pendente: ja ha um pedido de alteracao pendente sobre este original. Decida-o (ou cancele-o) antes de pedir outro.'
      USING ERRCODE = '23514';
  END IF;

  SELECT t.* INTO v_tipo
    FROM public.hr_ausencias_tipos t
   WHERE t.id = v_original.tipo_id AND t.organization_id = v_original.organization_id
     AND t.deleted_at IS NULL AND t.activo = true;

  IF v_tipo.id IS NULL THEN
    RAISE EXCEPTION
      'ausencia_tipo_invalido: o tipo do pedido original nao existe nesta organizacao, esta apagado, ou esta inactivo.'
      USING ERRCODE = '23503';
  END IF;

  IF _nova_data_fim < _nova_data_inicio THEN
    RAISE EXCEPTION 'ausencia_datas_invalidas: a data de fim e anterior a de inicio.' USING ERRCODE = '23514';
  END IF;

  IF NOT v_tipo.permite_meio_dia AND (_novo_meio_dia_inicio OR _novo_meio_dia_fim) THEN
    RAISE EXCEPTION
      'ausencia_meio_dia_nao_permitido: o tipo "%" nao permite marcacao de meio dia.', v_tipo.nome
      USING ERRCODE = '23514';
  END IF;

  -- O periodo de saldo do PRIMEIRO dia das NOVAS datas, snapshot como em
  -- rpc_hr_ausencia_pedir.
  SELECT d.periodo_inicio, d.periodo_fim INTO v_periodo_ini, v_periodo_fim
    FROM public.pessoas_ausencias_direitos d
   WHERE d.pessoa_id = v_original.pessoa_id AND d.organization_id = v_original.organization_id
     AND d.tipo_id = v_original.tipo_id AND d.deleted_at IS NULL
     AND _nova_data_inicio BETWEEN d.periodo_inicio AND d.periodo_fim
   ORDER BY d.periodo_inicio DESC
   LIMIT 1;

  IF v_periodo_ini IS NULL THEN
    v_periodo_ini := date_trunc('year', _nova_data_inicio)::date;
    v_periodo_fim := (date_trunc('year', _nova_data_inicio) + interval '1 year - 1 day')::date;
  END IF;

  -- Chefia e estado inicial: um snapshot FRESCO tirado agora. A alteracao e
  -- um pedido novo e passa pela cadeia de aprovacao ACTUAL, nao a que aprovou
  -- o original.
  v_aprovador := public.hr_ausencias_aprovador_chefia(v_original.pessoa_id, v_original.organization_id);
  v_estado := public.hr_ausencias_estado_inicial(
    v_tipo.exige_aprovacao_chefia, v_aprovador IS NOT NULL, v_tipo.exige_aprovacao_rh, v_atalho_rh
  );

  -- Contar os dias das NOVAS datas -- mesma expansao de rpc_hr_ausencia_pedir.
  -- NAO se criam linhas de pessoas_ausencias_dias enquanto pendente: o
  -- original continua aprovado e a ocupar essas datas, e o trigger de
  -- nao-sobreposicao recusaria; o contador de saldo tambem contaria a dobrar.
  -- So na aprovacao, em hr_ausencias_efectivar_substituicao, e que o original
  -- e cancelado e as linhas da alteracao nascem -- nessa ordem, nunca ao
  -- contrario.
  v_dia := _nova_data_inicio;
  WHILE v_dia <= _nova_data_fim LOOP
    v_fim_semana := extract(isodow FROM v_dia) IN (6, 7);

    SELECT EXISTS (
      SELECT 1 FROM public.schedule_holidays sh
       WHERE sh.organization_id = v_original.organization_id
         AND (
           (coalesce(sh.is_recurring, false) = false AND sh.holiday_date = v_dia)
           OR (coalesce(sh.is_recurring, false) = true
               AND to_char(sh.holiday_date, 'MM-DD') = to_char(v_dia, 'MM-DD'))
         )
    ) INTO v_feriado;

    IF (v_fim_semana AND NOT v_tipo.inclui_fim_de_semana)
       OR (v_feriado AND NOT v_tipo.inclui_feriados) THEN
      v_dia := v_dia + 1;
      CONTINUE;
    END IF;

    v_fraccao := 1.00;
    IF v_dia = _nova_data_inicio AND _novo_meio_dia_inicio THEN v_fraccao := 0.50; END IF;
    IF v_dia = _nova_data_fim AND _novo_meio_dia_fim THEN v_fraccao := 0.50; END IF;

    v_dias_total := v_dias_total + v_fraccao;
    v_dia := v_dia + 1;
  END LOOP;

  IF v_dias_total <= 0 THEN
    RAISE EXCEPTION
      'ausencia_sem_dias_uteis: o intervalo de % a % nao tem nenhum dia contavel para o tipo "%" (fins de semana e feriados ficam de fora deste tipo).',
      _nova_data_inicio, _nova_data_fim, v_tipo.nome
      USING ERRCODE = '23514';
  END IF;

  -- Saldo: AVISA, nao bloqueia -- o mesmo criterio que rpc_hr_ausencia_pedir
  -- ja aplica ao nao recusar por falta de direito registado. Quem decide a
  -- alteracao e que resolve, nao a base.
  IF v_tipo.desconta_saldo THEN
    SELECT * INTO v_saldo
      FROM public.hr_ausencias_saldo(v_original.pessoa_id, v_original.organization_id, v_original.tipo_id, v_periodo_ini);

    IF v_saldo.disponiveis IS NOT NULL AND v_dias_total > v_saldo.disponiveis THEN
      RAISE NOTICE
        'ausencia_alteracao_saldo_insuficiente: a alteracao pede % dias e o saldo disponivel no periodo e %. Aviso, nao bloqueio -- quem aprova decide.',
        v_dias_total, v_saldo.disponiveis;
    END IF;
  END IF;

  PERFORM set_config('hr_ausencias.rpc', 'on', true);

  INSERT INTO public.pessoas_ausencias_pedidos (
    organization_id, pessoa_id, tipo_id, vinculo_id,
    data_inicio, data_fim, meio_dia_inicio, meio_dia_fim,
    dias_solicitados, motivo, estado,
    aprovador_chefia_pessoa_id, criado_por_pessoa_id, origem,
    periodo_inicio, periodo_fim, created_by,
    substitui_pedido_id
  ) VALUES (
    v_original.organization_id, v_original.pessoa_id, v_original.tipo_id, v_original.vinculo_id,
    _nova_data_inicio, _nova_data_fim, _novo_meio_dia_inicio, _novo_meio_dia_fim,
    v_dias_total, _motivo, v_estado,
    v_aprovador, v_eu, 'ficha',
    v_periodo_ini, v_periodo_fim, v_anew,
    _pedido_original_id
  )
  RETURNING id INTO v_pedido_id;

  -- As decisoes dispensadas/aprovadas, no mesmo molde de rpc_hr_ausencia_pedir.
  IF v_estado <> 'pendente_chefia' THEN
    INSERT INTO public.pessoas_ausencias_pedido_decisoes (
      pedido_id, pessoa_id, organization_id, ordem, passo, resultado, motivo
    ) VALUES (
      v_pedido_id, v_original.pessoa_id, v_original.organization_id, 1, 'chefia', 'dispensado',
      CASE
        WHEN NOT v_tipo.exige_aprovacao_chefia
          THEN 'o tipo nao exige aprovacao de chefia'
        ELSE 'sem chefia atribuida'
      END
    );
  END IF;

  IF v_estado = 'aprovado' THEN
    IF NOT v_tipo.exige_aprovacao_rh THEN
      INSERT INTO public.pessoas_ausencias_pedido_decisoes (
        pedido_id, pessoa_id, organization_id, ordem, passo, resultado, motivo
      ) VALUES (
        v_pedido_id, v_original.pessoa_id, v_original.organization_id, 1, 'rh', 'dispensado',
        'o tipo nao exige aprovacao de RH'
      );
    ELSE
      INSERT INTO public.pessoas_ausencias_pedido_decisoes (
        pedido_id, pessoa_id, organization_id, ordem, passo, resultado,
        decidido_por_anew_user_id, decidido_por_pessoa_id, motivo
      ) VALUES (
        v_pedido_id, v_original.pessoa_id, v_original.organization_id, 1, 'rh', 'aprovado', v_anew, v_eu,
        'aprovado no acto por quem tem hr.ausencias.aprovar.rh e criou o pedido na ficha de outra pessoa'
      );
    END IF;

    -- Um tipo que nao exige NEM chefia NEM RH (ou que ganhou o atalho) nasce
    -- ja 'aprovado' -- e o gatilho da substituicao, e nenhuma RPC de decisao
    -- vai ser chamada depois (nasceu decidido). Por isso efectiva-se AQUI.
    PERFORM public.hr_ausencias_efectivar_substituicao(v_pedido_id);
  END IF;

  -- Projecta no board mesmo no caminho pendente -- ver 20261201020000 para o
  -- contrato completo desta chamada.
  PERFORM public.hr_ausencias_projectar_no_board(v_pedido_id);

  RETURN v_pedido_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_pedir_alteracao(uuid, date, date, boolean, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_pedir_alteracao(uuid, date, date, boolean, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_pedir_alteracao(uuid, date, date, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_pedir_alteracao(uuid, date, date, boolean, boolean, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_pedir_alteracao(uuid, date, date, boolean, boolean, text) IS
'Pede a alteracao de dias de um pedido JA APROVADO, herdando tipo, vinculo, pessoa e organizacao do original -- nao sao argumentos. Exige que o original esteja aprovado e ainda nao tenha comecado. So uma alteracao pendente de cada vez por original.

Desde 20261202030000: mesmo atalho de rpc_hr_ausencia_pedir -- quando quem pede a alteracao na ficha de OUTRA pessoa tem hr.ausencias.aprovar.rh, o passo de RH nasce ja aprovado, o que efectiva a substituicao no acto (hr_ausencias_efectivar_substituicao).

NAO cria linhas em pessoas_ausencias_dias enquanto pendente: o original continua a ocupar as suas datas ate haver decisao. Saldo insuficiente e um AVISO (RAISE NOTICE), nao um bloqueio.';

-- ---- Conferir ---------------------------------------------------------------
DO $conferir$
DECLARE
  v_n integer;
BEGIN
  -- Uma unica funcao com cada nome recriado.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_estado_inicial';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Ha % funcoes public.hr_ausencias_estado_inicial; esperava-se exactamente 1 (a de 3 argumentos tinha de ser removida).', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_pedir';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Ha % funcoes public.rpc_hr_ausencia_pedir; esperava-se exactamente 1.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_pedir_alteracao';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Ha % funcoes public.rpc_hr_ausencia_pedir_alteracao; esperava-se exactamente 1.', v_n;
  END IF;

  -- A funcao pura, provada nas combinacoes antigas (4.o arg=false tem de dar
  -- exactamente o mesmo que a versao de 3 argumentos dava) e nas novas.
  IF public.hr_ausencias_estado_inicial(true, true, true, false) <> 'pendente_chefia' THEN
    RAISE EXCEPTION 'hr_ausencias_estado_inicial(true,true,true,false) devia ser pendente_chefia.';
  END IF;
  IF public.hr_ausencias_estado_inicial(true, false, true, false) <> 'pendente_rh' THEN
    RAISE EXCEPTION 'hr_ausencias_estado_inicial(true,false,true,false) devia ser pendente_rh (sem aprovador resoluvel).';
  END IF;
  IF public.hr_ausencias_estado_inicial(false, false, true, false) <> 'pendente_rh' THEN
    RAISE EXCEPTION 'hr_ausencias_estado_inicial(false,false,true,false) devia ser pendente_rh.';
  END IF;
  IF public.hr_ausencias_estado_inicial(false, false, false, false) <> 'aprovado' THEN
    RAISE EXCEPTION 'hr_ausencias_estado_inicial(false,false,false,false) devia ser aprovado.';
  END IF;

  -- Novas: o atalho so muda o caso (chefia dispensada) AND (rh exigido).
  IF public.hr_ausencias_estado_inicial(true, true, true, true) <> 'pendente_chefia' THEN
    RAISE EXCEPTION 'A chefia tem de ser intocavel pelo atalho: hr_ausencias_estado_inicial(true,true,true,true) devia continuar pendente_chefia.';
  END IF;
  IF public.hr_ausencias_estado_inicial(true, false, true, true) <> 'aprovado' THEN
    RAISE EXCEPTION 'Sem aprovador resoluvel e com o atalho, hr_ausencias_estado_inicial(true,false,true,true) devia ser aprovado.';
  END IF;
  IF public.hr_ausencias_estado_inicial(false, false, true, true) <> 'aprovado' THEN
    RAISE EXCEPTION 'hr_ausencias_estado_inicial(false,false,true,true) devia ser aprovado (atalho de RH).';
  END IF;
  IF public.hr_ausencias_estado_inicial(false, false, false, true) <> 'aprovado' THEN
    RAISE EXCEPTION 'Um tipo sem RH nenhum nao muda com o atalho: hr_ausencias_estado_inicial(false,false,false,true) devia continuar aprovado.';
  END IF;

  -- Grants: so authenticated/service_role executam a pura; anon nunca.
  IF has_function_privilege('anon', 'public.hr_ausencias_estado_inicial(boolean,boolean,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon tem EXECUTE em hr_ausencias_estado_inicial(4); devia ser so authenticated/service_role.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.hr_ausencias_estado_inicial(boolean,boolean,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE em hr_ausencias_estado_inicial(4).';
  END IF;

  RAISE NOTICE 'Guardas passadas: hr_ausencias_estado_inicial(4) unica e pura nas 8 combinacoes (4 antigas inalteradas + 4 novas), rpc_hr_ausencia_pedir e rpc_hr_ausencia_pedir_alteracao unicas, grants correctos.';
END;
$conferir$;
