-- ==============================================================================
-- A maquina de estados do pedido, o espelho para os dias, e as RPCs de escrita.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- As tabelas de 20261121060000 a 20261121090000 tem a escrita FECHADA e nada
-- lhes escreve. E o CHECK de estado do pedido garante o DOMINIO (os cinco
-- valores possiveis) e nao garante as ARESTAS: com so o CHECK, um pedido
-- recusado pela chefia podia passar a 'aprovado' num UPDATE directo, sem nunca
-- ter ido ao RH.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- 1. Um trigger BEFORE UPDATE recusa qualquer aresta que nao exista. As
--    arestas dependem do TIPO, porque um tipo que nao exige aprovacao de RH
--    nao tem passo de RH nenhum para onde mandar o pedido:
--      pendente_chefia, tipo COM RH  -> pendente_rh | recusado | cancelado
--      pendente_chefia, tipo SEM RH  -> aprovado | recusado | cancelado
--      pendente_rh   -> aprovado | recusado | cancelado | pendente_chefia
--      aprovado      -> cancelado
--      recusado      -> (nada)
--      cancelado     -> (nada)
--    Um pedido recusado pela chefia NUNCA chega a aprovado, porque recusado e
--    terminal. E um tipo que EXIGE RH nunca salta por cima do RH, porque para
--    esse tipo pendente_chefia -> aprovado continua a nao existir como aresta.
--
-- 2. O mesmo trigger recusa qualquer mudanca de estado que nao venha de dentro
--    de uma RPC do modulo, por sentinela set_config('hr_ausencias.rpc','on',
--    true) -- no molde do bypass de auditoria de 20260726010000. Sem a
--    sentinela, o service_role e as Edge Functions mudariam estados a vontade,
--    e a coluna deixaria de ser uma cache coerente da tabela de decisoes.
--
-- 3. Um trigger AFTER UPDATE OF estado espelha o estado nos dias. Nao se
--    escreve estado em pessoas_ausencias_dias a mao: haveria dias aprovados de
--    pedidos recusados, e o contador divergiria em silencio.
--
-- 4. Seis RPCs SECURITY DEFINER, que sao o unico caminho de escrita:
--      rpc_hr_ausencia_pedir
--      rpc_hr_ausencia_decidir_chefia
--      rpc_hr_ausencia_decidir_rh
--      rpc_hr_ausencia_cancelar
--      rpc_hr_ausencia_corrigir_aprovado
--      rpc_hr_ausencia_ver_justificacao
--
-- Nunca ha um pedido aprovado sem duas linhas de decisao a explica-lo: um tipo
-- que dispense a chefia, ou uma pessoa sem chefia resoluvel, ganham logo uma
-- decisao passo='chefia', resultado='dispensado', com motivo.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - A projeccao no board. hr_ausencias_projectar_no_board() e criada aqui como
--   FUNCAO VAZIA de proposito, e 20261121130000 substitui-lhe o corpo. Assim as
--   RPCs nao precisam de ser reescritas nessa migracao -- e reescrever uma RPC
--   de 200 linhas para lhe acrescentar cinco e o caminho por onde se
--   ressuscita uma versao antiga por engano.
-- - A guarda dos 20 dias uteis e a RPC de ajuste: 20261121120000.
-- - Notificacoes, prazos, escalonamento por inercia: nao existem.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e por esta ordem
-- (as RPCs primeiro, senao ficam a chamar triggers que ja nao existem):
--   DROP FUNCTION public.rpc_hr_ausencia_ver_justificacao(uuid);
--   DROP FUNCTION public.rpc_hr_ausencia_corrigir_aprovado(uuid, text);
--   DROP FUNCTION public.rpc_hr_ausencia_cancelar(uuid, text);
--   DROP FUNCTION public.rpc_hr_ausencia_decidir_rh(uuid, text, text);
--   DROP FUNCTION public.rpc_hr_ausencia_decidir_chefia(uuid, text, text, date, date);
--   DROP FUNCTION public.rpc_hr_ausencia_pedir(uuid, uuid, uuid, date, date, boolean, boolean, time, time, text, uuid, text);
--   DROP TRIGGER trg_pessoas_ausencias_pedidos_espelhar_dias ON public.pessoas_ausencias_pedidos;
--   DROP TRIGGER trg_pessoas_ausencias_pedidos_transicao ON public.pessoas_ausencias_pedidos;
--   DROP FUNCTION public.hr_ausencias_espelhar_estado_nos_dias();
--   DROP FUNCTION public.hr_ausencias_pedido_transicao();
--   DROP FUNCTION public.hr_ausencias_projectar_no_board(uuid);
--   DROP FUNCTION public.hr_ausencias_estado_apos_chefia(text, boolean);
--   DROP FUNCTION public.hr_ausencias_estado_inicial(boolean, boolean, boolean);
--
--
-- Prerequisitos:
--   20261121060000  pessoas_ausencias_pedidos
--   20261121070000  pessoas_ausencias_pedido_decisoes
--   20261121080000  pessoas_ausencias_dias
--   20261121090000  pessoas_ausencias_justificacoes
--   20261121050000  hr_ausencias_aprovador_chefia(2), hr_ausencias_pessoa_na_minha_cadeia(3)
--   20261120040000  hr_registar_acesso_sensivel(4)
--   20261120090000  hr_pessoa_do_utilizador(2)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_t text;
BEGIN
  FOREACH v_t IN ARRAY ARRAY[
    'public.pessoas_ausencias_pedidos',
    'public.pessoas_ausencias_pedido_decisoes',
    'public.pessoas_ausencias_dias',
    'public.pessoas_ausencias_justificacoes',
    'public.hr_ausencias_tipos',
    'public.schedule_holidays'
  ] LOOP
    IF to_regclass(v_t) IS NULL THEN
      RAISE EXCEPTION '% nao existe. Aplicar as migracoes 20261121020000 a 20261121090000 primeiro.', v_t;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_aprovador_chefia' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_aprovador_chefia(uuid, uuid) nao existe. Aplicar 20261121050000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_pessoa_na_minha_cadeia' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) nao existe. Aplicar 20261121050000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'hr_registar_acesso_sensivel(uuid, uuid, text, text) nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_do_utilizador(uuid, uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 0. A tabela de estados, em duas funcoes PURAS
--
-- A regra estava escrita tres vezes -- na criacao do pedido, na decisao de
-- chefia e no trigger -- e a copia da decisao de chefia tinha-se esquecido de
-- exige_aprovacao_rh: mandava para pendente_rh pedidos de tipos que nao tem
-- passo de RH nenhum, e ai ficavam presos. Sendo a regra pura, mora num sitio
-- so, e o bloco de conferir no fim desta migracao PROVA-A nas quatro
-- combinacoes sem escrever uma linha em tabela nenhuma.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_ausencias_estado_inicial(
  _exige_chefia boolean,
  _tem_aprovador boolean,
  _exige_rh boolean
)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    -- Exigir chefia sem chefia resoluvel nao pode prender o pedido: o passo
    -- fica dispensado com motivo, e o pedido segue para quem o pode decidir.
    WHEN coalesce(_exige_chefia, true) AND coalesce(_tem_aprovador, false) THEN 'pendente_chefia'
    WHEN coalesce(_exige_rh, true) THEN 'pendente_rh'
    ELSE 'aprovado'
  END;
$$;

REVOKE ALL ON FUNCTION public.hr_ausencias_estado_inicial(boolean, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_ausencias_estado_inicial(boolean, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_estado_inicial(boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_estado_inicial(boolean, boolean, boolean) TO service_role;

COMMENT ON FUNCTION public.hr_ausencias_estado_inicial(boolean, boolean, boolean) IS
'O estado em que um pedido NASCE, a partir de exige_aprovacao_chefia, de haver ou nao chefia resoluvel, e de exige_aprovacao_rh. Pura e IMMUTABLE de proposito: e a mesma regra para a RPC de criacao e para o bloco que a prova. Os coalesce puxam para o lado estrito -- na duvida exige-se a aprovacao, nao se dispensa.';

CREATE OR REPLACE FUNCTION public.hr_ausencias_estado_apos_chefia(
  _resultado text,
  _exige_rh boolean
)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE _resultado
    WHEN 'recusado' THEN 'recusado'
    -- A correccao: a chefia aprovar so manda ao RH se o tipo tiver passo de
    -- RH. Num tipo de chefia-so, mandar para pendente_rh deixava o pedido
    -- preso a espera de um passo que nunca devia existir.
    WHEN 'aprovado' THEN CASE WHEN coalesce(_exige_rh, true) THEN 'pendente_rh' ELSE 'aprovado' END
    -- 'ajustado' e uma contraproposta e NAO avanca o pedido: NULL, e nao um
    -- estado, para que quem chame tenha de tratar o caso em vez de o herdar.
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.hr_ausencias_estado_apos_chefia(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_ausencias_estado_apos_chefia(text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_estado_apos_chefia(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_estado_apos_chefia(text, boolean) TO service_role;

COMMENT ON FUNCTION public.hr_ausencias_estado_apos_chefia(text, boolean) IS
'O estado do pedido DEPOIS da decisao de chefia. aprovado leva a pendente_rh so quando o tipo exige aprovacao de RH; num tipo de chefia-so leva directamente a aprovado, e a RPC grava na mesma transaccao a decisao do passo de RH com resultado dispensado. Devolve NULL para ajustado, que nao avanca o pedido.';

-- ==============================================================================
-- 1. A projeccao no board: FUNCAO VAZIA, substituida em 20261121130000
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_ausencias_projectar_no_board(_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- VAZIA DE PROPOSITO nesta migracao. 20261121130000 substitui-lhe o corpo
  -- para criar e manter o item de schedule_items. Existe agora, vazia, para
  -- que as RPCs abaixo nao tenham de ser reescritas nessa migracao -- e
  -- reescrever uma RPC grande para lhe acrescentar cinco linhas e exactamente
  -- o caminho por onde se ressuscita uma versao antiga por engano.
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_ausencias_projectar_no_board(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_ausencias_projectar_no_board(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_ausencias_projectar_no_board(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_projectar_no_board(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_ausencias_projectar_no_board(uuid) IS
'Cria e mantem a projeccao do pedido em schedule_items. VAZIA nesta migracao; 20261121130000 substitui-lhe o corpo. authenticated NAO a executa: e chamada de dentro das RPCs, que sao SECURITY DEFINER.';

-- ==============================================================================
-- 2. A maquina de estados
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_ausencias_pedido_transicao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_permitidas text[];
  v_exige_rh   boolean;
BEGIN
  IF NEW.estado = OLD.estado THEN
    RETURN NEW;
  END IF;

  -- A sentinela. Sem ela, o service_role e as Edge Functions mudavam estados a
  -- vontade e a coluna deixava de ser uma cache coerente da tabela de decisoes.
  IF coalesce(current_setting('hr_ausencias.rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION
      'ausencia_estado_fora_da_rpc: o estado de um pedido de ausencia so muda de dentro das RPCs do modulo (rpc_hr_ausencia_decidir_chefia, _decidir_rh, _cancelar, _corrigir_aprovado). Um UPDATE directo nao passa, nem de service_role.'
      USING ERRCODE = '23514';
  END IF;

  -- O TIPO manda nas arestas que saem de pendente_chefia: um tipo sem passo de
  -- RH nao tem para onde mandar o pedido a nao ser para aprovado, e um tipo COM
  -- passo de RH nao pode saltar por cima dele.
  SELECT t.exige_aprovacao_rh INTO v_exige_rh
    FROM public.hr_ausencias_tipos t
   WHERE t.id = NEW.tipo_id AND t.organization_id = NEW.organization_id;

  v_permitidas := CASE OLD.estado
    WHEN 'pendente_chefia' THEN
      CASE WHEN coalesce(v_exige_rh, true)
             THEN ARRAY['pendente_rh','recusado','cancelado']
             ELSE ARRAY['aprovado','recusado','cancelado']
       END
    WHEN 'pendente_rh'     THEN ARRAY['aprovado','recusado','cancelado','pendente_chefia']
    WHEN 'aprovado'        THEN ARRAY['cancelado']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.estado = ANY (v_permitidas)) THEN
    RAISE EXCEPTION
      'ausencia_transicao_invalida: % -> % (o tipo deste pedido % aprovacao de RH). De pendente_chefia sai-se para pendente_rh quando o tipo exige RH, para aprovado quando nao exige, e sempre para recusado ou cancelado. De pendente_rh sai-se para aprovado/recusado/cancelado/pendente_chefia. De aprovado so para cancelado. Recusado e cancelado sao terminais.',
      OLD.estado, NEW.estado,
      CASE WHEN coalesce(v_exige_rh, true) THEN 'exige' ELSE 'nao exige' END
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_ausencias_pedido_transicao() IS
'Recusa qualquer aresta de estado que nao exista, e qualquer mudanca de estado que nao venha de dentro de uma RPC do modulo (sentinela hr_ausencias.rpc, no molde do bypass de auditoria de 20260726010000).

As arestas que saem de pendente_chefia dependem do TIPO, lido aqui. Com exige_aprovacao_rh = true, pendente_chefia -> aprovado NAO existe, e por isso nenhum pedido salta por cima do RH. Com exige_aprovacao_rh = false, a aresta que nao existe e pendente_chefia -> pendente_rh, e por isso nenhum pedido fica preso a espera de um passo que o tipo nao tem. Em ambos os casos recusado e cancelado sao terminais, e um pedido recusado pela chefia nunca chega a aprovado. Nao e uma convencao de aplicacao -- e a base a recusar.

Trigger e nao RPC pela razao de sempre neste modulo: as Edge Functions e o service_role escrevem fora das RPCs, e uma regra que so vive na RPC nao alcanca esses caminhos.';

DROP TRIGGER IF EXISTS trg_pessoas_ausencias_pedidos_transicao ON public.pessoas_ausencias_pedidos;
CREATE TRIGGER trg_pessoas_ausencias_pedidos_transicao
  BEFORE UPDATE OF estado ON public.pessoas_ausencias_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.hr_ausencias_pedido_transicao();

-- ==============================================================================
-- 3. O espelho do estado nos dias
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_ausencias_espelhar_estado_nos_dias()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_estado_dia text;
BEGIN
  v_estado_dia := CASE NEW.estado
    WHEN 'pendente_chefia' THEN 'pendente'
    WHEN 'pendente_rh'     THEN 'pendente'
    WHEN 'aprovado'        THEN 'aprovado'
    WHEN 'recusado'        THEN 'recusado'
    WHEN 'cancelado'       THEN 'cancelado'
  END;

  UPDATE public.pessoas_ausencias_dias d
     SET estado = v_estado_dia
   WHERE d.pedido_id = NEW.id
     AND d.estado <> v_estado_dia;

  PERFORM public.hr_ausencias_projectar_no_board(NEW.id);

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.hr_ausencias_espelhar_estado_nos_dias() IS
'Espelha o estado do pedido nas linhas de pessoas_ausencias_dias, e chama a projeccao no board. O estado dos dias NAO se escreve a mao: se se escrevesse, haveria dias aprovados de pedidos recusados, e o contador de saldo divergiria em silencio sem nada a apontar.

SECURITY DEFINER porque a escrita em pessoas_ausencias_dias esta fechada por RLS restritiva -- e e para estar.';

DROP TRIGGER IF EXISTS trg_pessoas_ausencias_pedidos_espelhar_dias ON public.pessoas_ausencias_pedidos;
CREATE TRIGGER trg_pessoas_ausencias_pedidos_espelhar_dias
  AFTER UPDATE OF estado ON public.pessoas_ausencias_pedidos
  FOR EACH ROW
  WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION public.hr_ausencias_espelhar_estado_nos_dias();

-- ==============================================================================
-- 4. rpc_hr_ausencia_pedir
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
    v_tipo.exige_aprovacao_chefia, v_aprovador IS NOT NULL, v_tipo.exige_aprovacao_rh
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
    INSERT INTO public.pessoas_ausencias_pedido_decisoes (
      pedido_id, pessoa_id, organization_id, ordem, passo, resultado, motivo
    ) VALUES (
      v_pedido_id, _pessoa_id, _organization_id, 1, 'rh', 'dispensado',
      'o tipo nao exige aprovacao de RH'
    );
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
'O UNICO caminho para criar um pedido de ausencia. Verifica a permissao (pedir para si e uma, pedir por outro e outra), valida o tipo e a antecedencia, resolve a chefia, expande o intervalo em dias civis ignorando fins de semana e feriados quando o tipo os exclui, imputa cada dia ao seu periodo de saldo, grava dias_solicitados, e escreve as decisoes dispensadas que faltem.

Sem direito registado, o periodo e o ano civil e o pedido NAO e recusado: ha tipos que nao descontam saldo, e recusar deixaria doenca e faltas sem caminho.';

-- ==============================================================================
-- 5. rpc_hr_ausencia_decidir_chefia
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_decidir_chefia(
  _pedido_id uuid,
  _resultado text,
  _motivo text DEFAULT NULL,
  _ajuste_data_inicio date DEFAULT NULL,
  _ajuste_data_fim date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth   uuid := auth.uid();
  v_anew   uuid;
  v_ped      public.pessoas_ausencias_pedidos;
  v_ordem    smallint;
  v_ordem_rh smallint;
  v_novo     text;
  v_exige_rh boolean;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  SELECT p.* INTO v_ped FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_id;
  IF v_ped.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_pedido_inexistente: o pedido % nao existe.', _pedido_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.aprovar.chefia', v_ped.organization_id) THEN
    RAISE EXCEPTION
      'ausencia_sem_permissao: decidir o passo de chefia exige hr.ausencias.aprovar.chefia nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  -- E dos SEUS. A hierarquia ACTUAL, e nao o snapshot do pedido: quem entrou
  -- agora tem de conseguir despachar a fila que herdou.
  IF NOT public.hr_ausencias_pessoa_na_minha_cadeia(v_auth, v_ped.pessoa_id, v_ped.organization_id) THEN
    RAISE EXCEPTION
      'ausencia_fora_da_cadeia: esta pessoa nao esta na sua cadeia de chefia. Quem tem hr.ausencias.aprovar.chefia decide os pedidos de quem lhe reporta, nao os de toda a organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_ped.estado <> 'pendente_chefia' THEN
    RAISE EXCEPTION
      'ausencia_passo_errado: o pedido esta em "%" e o passo de chefia decide-se em pendente_chefia.', v_ped.estado
      USING ERRCODE = '23514';
  END IF;

  IF _resultado NOT IN ('aprovado','recusado','ajustado') THEN
    RAISE EXCEPTION
      'ausencia_resultado_invalido: no passo de chefia os resultados sao aprovado, recusado ou ajustado (recebido "%").', _resultado
      USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(max(d.ordem), 0) + 1 INTO v_ordem
    FROM public.pessoas_ausencias_pedido_decisoes d
   WHERE d.pedido_id = _pedido_id AND d.passo = 'chefia';

  INSERT INTO public.pessoas_ausencias_pedido_decisoes (
    pedido_id, pessoa_id, organization_id, ordem, passo, resultado,
    decidido_por_anew_user_id, decidido_por_pessoa_id, motivo,
    ajuste_data_inicio, ajuste_data_fim
  ) VALUES (
    _pedido_id, v_ped.pessoa_id, v_ped.organization_id, v_ordem, 'chefia', _resultado,
    v_anew, public.hr_pessoa_do_utilizador(v_auth, v_ped.organization_id), _motivo,
    _ajuste_data_inicio, _ajuste_data_fim
  );

  -- 'ajustado' NAO avanca o pedido: e uma contraproposta, e o passo continua em
  -- aberto ate quem pediu aceitar ou refazer. Avanca-lo seria aprovar datas que
  -- a pessoa nunca pediu.
  IF _resultado = 'ajustado' THEN
    RETURN;
  END IF;

  -- O TIPO decide para onde vai um pedido aprovado pela chefia. Sem esta
  -- leitura, um tipo de chefia-so (exige_aprovacao_chefia = true,
  -- exige_aprovacao_rh = false) ficava em pendente_rh a espera de um passo
  -- que nunca devia existir, e ninguem o podia fechar.
  SELECT t.exige_aprovacao_rh INTO v_exige_rh
    FROM public.hr_ausencias_tipos t
   WHERE t.id = v_ped.tipo_id AND t.organization_id = v_ped.organization_id;

  IF v_exige_rh IS NULL THEN
    RAISE EXCEPTION
      'ausencia_tipo_inexistente: o tipo % do pedido % nao existe nesta organizacao. Sem o tipo nao se sabe se ha passo de RH, e decidir as cegas mandava o pedido para uma fila que pode nao existir.',
      v_ped.tipo_id, _pedido_id
      USING ERRCODE = '23503';
  END IF;

  v_novo := public.hr_ausencias_estado_apos_chefia(_resultado, v_exige_rh);

  -- Num tipo de chefia-so o pedido fecha aqui, e a decisao do passo de RH fica
  -- gravada NA MESMA TRANSACCAO com resultado 'dispensado'. Sem ela ficava um
  -- pedido aprovado com meio historico, e o passo em falta lia-se como um
  -- passo perdido em vez de um passo que o tipo nao tem.
  IF v_novo = 'aprovado' THEN
    SELECT coalesce(max(d.ordem), 0) + 1 INTO v_ordem_rh
      FROM public.pessoas_ausencias_pedido_decisoes d
     WHERE d.pedido_id = _pedido_id AND d.passo = 'rh';

    INSERT INTO public.pessoas_ausencias_pedido_decisoes (
      pedido_id, pessoa_id, organization_id, ordem, passo, resultado, motivo
    ) VALUES (
      _pedido_id, v_ped.pessoa_id, v_ped.organization_id, v_ordem_rh, 'rh', 'dispensado',
      'o tipo nao exige aprovacao de RH'
    );
  END IF;

  PERFORM set_config('hr_ausencias.rpc', 'on', true);
  UPDATE public.pessoas_ausencias_pedidos SET estado = v_novo, updated_by = v_anew WHERE id = _pedido_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_decidir_chefia(uuid, text, text, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_decidir_chefia(uuid, text, text, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_decidir_chefia(uuid, text, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_decidir_chefia(uuid, text, text, date, date) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_decidir_chefia(uuid, text, text, date, date) IS
'O passo de chefia. Exige hr.ausencias.aprovar.chefia E que a pessoa esteja na cadeia de chefia ACTUAL de quem decide -- a permissao sozinha nao da poder sobre a organizacao toda.

aprovado leva a pendente_rh nos tipos que exigem aprovacao de RH, e directamente a aprovado nos tipos de chefia-so (exige_aprovacao_chefia = true, exige_aprovacao_rh = false) -- neste caso grava tambem, na mesma transaccao, a decisao do passo de RH com resultado dispensado, para o historico ficar completo. Qual dos dois nao e escolha desta funcao: e hr_ausencias_estado_apos_chefia que responde, e a maquina de estados recusa o outro.

ajustado grava a contraproposta e NAO avanca o pedido, porque avanca-lo seria aprovar datas que a pessoa nao pediu.';

-- ==============================================================================
-- 6. rpc_hr_ausencia_decidir_rh
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_decidir_rh(
  _pedido_id uuid,
  _resultado text,
  _motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth  uuid := auth.uid();
  v_anew  uuid;
  v_ped           public.pessoas_ausencias_pedidos;
  v_ordem         smallint;
  v_novo          text;
  v_exige_chefia  boolean;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  SELECT p.* INTO v_ped FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_id;
  IF v_ped.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_pedido_inexistente: o pedido % nao existe.', _pedido_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.aprovar.rh', v_ped.organization_id) THEN
    RAISE EXCEPTION
      'ausencia_sem_permissao: decidir o passo de RH exige hr.ausencias.aprovar.rh nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_ped.estado <> 'pendente_rh' THEN
    RAISE EXCEPTION
      'ausencia_passo_errado: o pedido esta em "%" e o passo de RH decide-se em pendente_rh.', v_ped.estado
      USING ERRCODE = '23514';
  END IF;

  IF _resultado NOT IN ('aprovado','recusado','devolvido') THEN
    RAISE EXCEPTION
      'ausencia_resultado_invalido: no passo de RH os resultados sao aprovado, recusado ou devolvido (recebido "%").', _resultado
      USING ERRCODE = '23514';
  END IF;

  -- O espelho do defeito do passo de chefia: 'devolvido' manda o pedido a
  -- chefia, so que ha pedidos que nunca passaram por chefia nenhuma -- o tipo
  -- dispensa-a, ou a pessoa nao tem chefia resoluvel. Devolve-los deixava-os
  -- em pendente_chefia, uma fila que ninguem consegue abrir: decidir_chefia
  -- exige que a pessoa esteja na cadeia de quem decide, e nao ha cadeia.
  IF _resultado = 'devolvido' THEN
    SELECT t.exige_aprovacao_chefia INTO v_exige_chefia
      FROM public.hr_ausencias_tipos t
     WHERE t.id = v_ped.tipo_id AND t.organization_id = v_ped.organization_id;

    IF NOT coalesce(v_exige_chefia, false)
       OR public.hr_ausencias_aprovador_chefia(v_ped.pessoa_id, v_ped.organization_id) IS NULL THEN
      RAISE EXCEPTION
        'ausencia_sem_passo_de_chefia: este pedido nao tem passo de chefia (o tipo dispensa-o, ou a pessoa nao tem chefia resoluvel neste momento) e devolve-lo deixava-o numa fila que ninguem consegue abrir. Decidir aqui: aprovado ou recusado.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT coalesce(max(d.ordem), 0) + 1 INTO v_ordem
    FROM public.pessoas_ausencias_pedido_decisoes d
   WHERE d.pedido_id = _pedido_id AND d.passo = 'rh';

  INSERT INTO public.pessoas_ausencias_pedido_decisoes (
    pedido_id, pessoa_id, organization_id, ordem, passo, resultado,
    decidido_por_anew_user_id, decidido_por_pessoa_id, motivo
  ) VALUES (
    _pedido_id, v_ped.pessoa_id, v_ped.organization_id, v_ordem, 'rh', _resultado,
    v_anew, public.hr_pessoa_do_utilizador(v_auth, v_ped.organization_id), _motivo
  );

  v_novo := CASE _resultado
    WHEN 'aprovado'  THEN 'aprovado'
    WHEN 'recusado'  THEN 'recusado'
    WHEN 'devolvido' THEN 'pendente_chefia'
  END;

  PERFORM set_config('hr_ausencias.rpc', 'on', true);
  UPDATE public.pessoas_ausencias_pedidos SET estado = v_novo, updated_by = v_anew WHERE id = _pedido_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_decidir_rh(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_decidir_rh(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_decidir_rh(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_decidir_rh(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_decidir_rh(uuid, text, text) IS
'O passo de RH, que fecha o pedido. So ve pedidos em pendente_rh -- e um tipo de chefia-so nunca la chega, porque a aprovacao da chefia leva-o directamente a aprovado.

devolvido exige que haja mesmo passo de chefia para onde devolver (o tipo exige-o E a pessoa tem chefia resoluvel): sem isso o pedido cairia numa fila que ninguem consegue abrir. Havendo, devolve o pedido a pendente_chefia sem perder a primeira volta -- a unique (pedido_id, passo, ordem) da a segunda decisao de chefia a ordem 2 em vez de sobrescrever a 1.';

-- ==============================================================================
-- 7. rpc_hr_ausencia_cancelar
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_cancelar(
  _pedido_id uuid,
  _motivo text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_anew uuid;
  v_ped  public.pessoas_ausencias_pedidos;
  v_eu   uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION 'ausencia_cancelamento_sem_motivo: cancelar exige motivo escrito.' USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  SELECT p.* INTO v_ped FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_id;
  IF v_ped.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_pedido_inexistente: o pedido % nao existe.', _pedido_id USING ERRCODE = '23503';
  END IF;

  v_eu := public.hr_pessoa_do_utilizador(v_auth, v_ped.organization_id);

  IF v_ped.estado IN ('recusado','cancelado') THEN
    RAISE EXCEPTION
      'ausencia_estado_terminal: o pedido esta em "%" e nao ha o que cancelar.', v_ped.estado
      USING ERRCODE = '23514';
  END IF;

  IF v_ped.estado = 'aprovado' THEN
    -- Cancelar um APROVADO e mexer no historico: contadores mudam para tras.
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.historico.editar', v_ped.organization_id) THEN
      RAISE EXCEPTION
        'ausencia_sem_permissao: cancelar um pedido JA APROVADO exige hr.ausencias.historico.editar -- muda o contador para tras. Cancelar um pedido pendente e outra coisa.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Pendente: e direito de quem pediu, ou de quem gere ausencias.
    IF NOT (
      (v_eu IS NOT NULL AND v_eu = v_ped.pessoa_id
       AND public.has_anew_permission_in_org(v_auth, 'hr.ausencias.pedir', v_ped.organization_id))
      OR public.has_anew_permission_in_org(v_auth, 'hr.ausencias.pedir.outros', v_ped.organization_id)
      OR public.has_anew_permission_in_org(v_auth, 'hr.ausencias.aprovar.rh', v_ped.organization_id)
    ) THEN
      RAISE EXCEPTION
        'ausencia_sem_permissao: cancelar um pedido pendente e direito de quem o fez (hr.ausencias.pedir sobre a propria ficha), de quem pede por outros, ou de quem decide o passo de RH.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.pessoas_ausencias_pedido_decisoes (
    pedido_id, pessoa_id, organization_id, ordem, passo, resultado,
    decidido_por_anew_user_id, decidido_por_pessoa_id, motivo
  )
  SELECT _pedido_id, v_ped.pessoa_id, v_ped.organization_id,
         coalesce(max(d.ordem), 0) + 1,
         CASE WHEN v_ped.estado = 'pendente_chefia' THEN 'chefia' ELSE 'rh' END,
         'recusado', v_anew, v_eu, 'cancelado: ' || btrim(_motivo)
    FROM public.pessoas_ausencias_pedido_decisoes d
   WHERE d.pedido_id = _pedido_id
     AND d.passo = CASE WHEN v_ped.estado = 'pendente_chefia' THEN 'chefia' ELSE 'rh' END;

  PERFORM set_config('hr_ausencias.rpc', 'on', true);
  UPDATE public.pessoas_ausencias_pedidos
     SET estado = 'cancelado', updated_by = v_anew
   WHERE id = _pedido_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_cancelar(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_cancelar(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_cancelar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_cancelar(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_cancelar(uuid, text) IS
'Cancela um pedido. E aqui que vive a decisao de NAO haver permissao de "cancelar": cancelar um pedido PENDENTE e direito de quem o fez, e cancelar um APROVADO e mexer no historico e exige hr.ausencias.historico.editar, porque muda o contador para tras.

Cancelar e um ESTADO, nao um apagamento: o pedido fica, e a decisao de cancelamento fica gravada com autor e motivo.';

-- ==============================================================================
-- 8. rpc_hr_ausencia_corrigir_aprovado
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_corrigir_aprovado(
  _pedido_id uuid,
  _motivo text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_ped  public.pessoas_ausencias_pedidos;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION 'ausencia_correccao_sem_motivo: corrigir o historico exige motivo escrito.' USING ERRCODE = '23514';
  END IF;

  SELECT p.* INTO v_ped FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_id;
  IF v_ped.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_pedido_inexistente: o pedido % nao existe.', _pedido_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.historico.editar', v_ped.organization_id) THEN
    RAISE EXCEPTION
      'ausencia_sem_permissao: corrigir uma ausencia aprovada exige hr.ausencias.historico.editar nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_ped.estado <> 'aprovado' THEN
    RAISE EXCEPTION
      'ausencia_nao_aprovada: esta RPC corrige pedidos APROVADOS; este esta em "%". Um pedido pendente altera-se cancelando e pedindo de novo.', v_ped.estado
      USING ERRCODE = '23514';
  END IF;

  -- Corrigir um aprovado e, nesta ronda, cancela-lo com rasto e pedir de novo.
  -- NAO se reescrevem as datas de um pedido aprovado: um pedido aprovado com
  -- datas diferentes das que foram aprovadas nao e uma correccao, e uma
  -- aprovacao que nunca houve.
  PERFORM public.rpc_hr_ausencia_cancelar(_pedido_id, 'correccao de historico: ' || btrim(_motivo));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_corrigir_aprovado(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_corrigir_aprovado(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_corrigir_aprovado(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_corrigir_aprovado(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_corrigir_aprovado(uuid, text) IS
'Corrige uma ausencia APROVADA, exigindo hr.ausencias.historico.editar e motivo escrito. Nesta ronda a correccao e cancelar com rasto e pedir de novo, DE PROPOSITO: reescrever as datas de um pedido aprovado nao e uma correccao, e uma aprovacao que nunca houve -- ficaria uma linha a dizer que o RH aprovou dias que nunca lhe foram apresentados.';

-- ==============================================================================
-- 9. rpc_hr_ausencia_ver_justificacao
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_ver_justificacao(_pedido_id uuid)
RETURNS TABLE (
  id                uuid,
  tipo_documento    text,
  documento_ref     text,
  texto             text,
  entidade_emissora text,
  data_documento    date
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_ped  public.pessoas_ausencias_pedidos;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT p.* INTO v_ped FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_id;
  IF v_ped.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_pedido_inexistente: o pedido % nao existe.', _pedido_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.justificacao.view', v_ped.organization_id) THEN
    RAISE EXCEPTION
      'ausencia_sem_permissao: ler a justificacao exige hr.ausencias.justificacao.view nesta organizacao. Aprovar um pedido nao da acesso ao atestado.'
      USING ERRCODE = '42501';
  END IF;

  -- O rasto, antes de devolver. O mesmo padrao do NISS e do IBAN.
  PERFORM public.hr_registar_acesso_sensivel(
    v_ped.pessoa_id, v_ped.organization_id, 'ausencia_justificacao', 'revelar'
  );

  RETURN QUERY
  SELECT j.id, j.tipo_documento, j.documento_ref, j.texto, j.entidade_emissora, j.data_documento
    FROM public.pessoas_ausencias_justificacoes j
   WHERE j.pedido_id = _pedido_id
   ORDER BY j.data_documento NULLS LAST, j.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_ver_justificacao(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_ver_justificacao(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_ver_justificacao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_ver_justificacao(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_ver_justificacao(uuid) IS
'Revela a justificacao de um pedido, exigindo hr.ausencias.justificacao.view e registando a revelacao em pessoas_acessos_sensiveis por hr_registar_acesso_sensivel -- o mesmo padrao do NISS e do IBAN. O registo e feito ANTES de devolver: se a leitura falhar, o rasto fica, e e assim que deve ser.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_f    text;
  v_faltam text;
  v_falhas text;
  v_puras text[] := ARRAY[
    'hr_ausencias_estado_inicial',
    'hr_ausencias_estado_apos_chefia'
  ];
  v_esperadas text[] := ARRAY[
    'hr_ausencias_projectar_no_board',
    'hr_ausencias_pedido_transicao',
    'hr_ausencias_espelhar_estado_nos_dias',
    'rpc_hr_ausencia_pedir',
    'rpc_hr_ausencia_decidir_chefia',
    'rpc_hr_ausencia_decidir_rh',
    'rpc_hr_ausencia_cancelar',
    'rpc_hr_ausencia_corrigir_aprovado',
    'rpc_hr_ausencia_ver_justificacao'
  ];
BEGIN
  SELECT string_agg(f, ', ' ORDER BY f) INTO v_faltam
    FROM unnest(v_esperadas || v_puras) AS f
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f
   );

  IF v_faltam IS NOT NULL THEN
    RAISE EXCEPTION 'Funcoes que nao ficaram criadas: %', v_faltam;
  END IF;

  -- As funcoes da tabela de estados sao PURAS: IMMUTABLE, e com search_path
  -- fixo como todas as outras. Uma delas volatil seria uma regra que muda
  -- debaixo dos pes de quem a provou aqui.
  FOREACH v_f IN ARRAY v_puras LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_f
         AND (p.provolatile <> 'i'
              OR coalesce(array_to_string(p.proconfig, ','), '') NOT LIKE '%search_path%')
    ) THEN
      RAISE EXCEPTION '% nao e IMMUTABLE com search_path fixo.', v_f;
    END IF;
  END LOOP;

  -- ---- A PROVA das quatro combinacoes de (chefia, RH) --------------------
  --
  -- Nao se escreve uma linha em tabela nenhuma: a regra e pura, e por isso
  -- prova-se chamando-a. O que se prova e exactamente o defeito que estava
  -- aqui -- um tipo com chefia = true e RH = false ficava preso em
  -- pendente_rh depois da chefia aprovar.
  --
  -- Onde NASCE o pedido, nas 4 combinacoes x haver ou nao chefia resoluvel:
  SELECT string_agg(
           format('chefia=%s rh=%s aprovador=%s: esperado %s, obtido %s',
                  c.chefia, c.rh, c.tem_aprovador, c.esperado,
                  coalesce(public.hr_ausencias_estado_inicial(c.chefia, c.tem_aprovador, c.rh), '<null>')),
           '; ' ORDER BY c.chefia, c.rh, c.tem_aprovador)
    INTO v_falhas
    FROM (VALUES
      -- com chefia resoluvel
      (true,  true,  true,  'pendente_chefia'),
      (true,  false, true,  'pendente_chefia'),
      (false, true,  true,  'pendente_rh'),
      (false, false, true,  'aprovado'),
      -- sem chefia resoluvel: o passo de chefia nao pode prender o pedido
      (true,  true,  false, 'pendente_rh'),
      (true,  false, false, 'aprovado'),
      (false, true,  false, 'pendente_rh'),
      (false, false, false, 'aprovado')
    ) AS c(chefia, rh, tem_aprovador, esperado)
   WHERE public.hr_ausencias_estado_inicial(c.chefia, c.tem_aprovador, c.rh)
         IS DISTINCT FROM c.esperado;

  IF v_falhas IS NOT NULL THEN
    RAISE EXCEPTION 'O estado inicial do pedido esta errado em: %', v_falhas;
  END IF;

  -- Para onde vai DEPOIS da decisao de chefia:
  SELECT string_agg(
           format('resultado=%s rh=%s: esperado %s, obtido %s',
                  c.resultado, c.rh, coalesce(c.esperado, '<null>'),
                  coalesce(public.hr_ausencias_estado_apos_chefia(c.resultado, c.rh), '<null>')),
           '; ' ORDER BY c.resultado, c.rh)
    INTO v_falhas
    FROM (VALUES
      ('aprovado', true,  'pendente_rh'),
      -- ESTE e o caso que estava errado: chefia-so fecha o pedido aqui.
      ('aprovado', false, 'aprovado'),
      ('recusado', true,  'recusado'),
      ('recusado', false, 'recusado'),
      -- 'ajustado' nao avanca o pedido, em tipo nenhum.
      ('ajustado', true,  NULL),
      ('ajustado', false, NULL)
    ) AS c(resultado, rh, esperado)
   WHERE public.hr_ausencias_estado_apos_chefia(c.resultado, c.rh)
         IS DISTINCT FROM c.esperado;

  IF v_falhas IS NOT NULL THEN
    RAISE EXCEPTION 'O estado apos a decisao de chefia esta errado em: %', v_falhas;
  END IF;

  -- E a coerencia entre as duas: um pedido que NASCE em pendente_chefia so sai
  -- de la para um estado que a maquina aceita, e nunca para pendente_rh num
  -- tipo sem RH nem para aprovado num tipo com RH.
  IF public.hr_ausencias_estado_inicial(true, true, false) <> 'pendente_chefia'
     OR public.hr_ausencias_estado_apos_chefia('aprovado', false) <> 'aprovado'
     OR public.hr_ausencias_estado_apos_chefia('aprovado', true) <> 'pendente_rh' THEN
    RAISE EXCEPTION
      'O tipo de chefia-so (chefia sim, RH nao) nao fecha na aprovacao da chefia. Era exactamente este o defeito: o pedido ficava em pendente_rh a espera de um passo que nao existe.';
  END IF;

  -- Todas SECURITY DEFINER e com search_path fixo. Uma funcao SECURITY DEFINER
  -- sem search_path e uma porta aberta a captura de esquema.
  FOREACH v_f IN ARRAY v_esperadas LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_f
         AND (p.prosecdef IS DISTINCT FROM true
              OR coalesce(array_to_string(p.proconfig, ','), '') NOT LIKE '%search_path%')
    ) THEN
      RAISE EXCEPTION
        '% nao e SECURITY DEFINER com search_path fixo.', v_f;
    END IF;
  END LOOP;

  -- Os dois triggers.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.pessoas_ausencias_pedidos')
       AND tgname = 'trg_pessoas_ausencias_pedidos_transicao' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'O trigger da maquina de estados nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.pessoas_ausencias_pedidos')
       AND tgname = 'trg_pessoas_ausencias_pedidos_espelhar_dias' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'O trigger que espelha o estado nos dias nao ficou criado.';
  END IF;

  -- anon nao executa nenhuma RPC.
  IF has_function_privilege('anon', 'public.rpc_hr_ausencia_pedir(uuid, uuid, uuid, date, date, boolean, boolean, time, time, text, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon consegue executar rpc_hr_ausencia_pedir. O REVOKE nao pegou.';
  END IF;

  -- A funcao de projeccao NAO pode ser executavel por authenticated: e chamada
  -- de dentro das RPCs, e exposta seria um caminho para escrever no board.
  IF has_function_privilege('authenticated', 'public.hr_ausencias_projectar_no_board(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'authenticated consegue executar hr_ausencias_projectar_no_board. E chamada de dentro das RPCs; exposta, seria um caminho para escrever no board por fora.';
  END IF;

  RAISE NOTICE 'Conferido: maquina de estados (quatro combinacoes de chefia/RH provadas), espelho, e as seis RPCs de ausencias.';
END;
$conferir$;
