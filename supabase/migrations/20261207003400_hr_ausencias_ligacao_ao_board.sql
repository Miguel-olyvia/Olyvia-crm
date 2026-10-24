-- ==============================================================================
-- A ligacao ao board de agenda: schedule_items passa a ser PROJECCAO.
--
-- POR APLICAR.
--
-- ATENCAO -- ESTA MIGRACAO E UMA QUEBRA DELIBERADA E COORDENADA. A partir da
-- sua aplicacao, criar uma linha em schedule_items num board de ausencias por
-- INSERT directo passa a ser RECUSADO pela base. O ecra que hoje faz isso
-- (ScheduleItemDialog) deixa de funcionar contra esse board. A ronda de UI tem
-- de aterrar junto ou depois. Isto e o item que o orquestrador tem de decidir
-- ANTES do push, nao uma nota de pe de pagina.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Uma ausencia nasce hoje como linha de schedule_items, criada pelo formulario,
-- com approval_status escrito pelo proprio cliente. Depois de 20261121060000, a
-- ausencia nasce em pessoas_ausencias_pedidos -- e ficam DOIS sitios a criar
-- ausencias, o que e pior do que um.
--
-- Nao se resolve so nas RPCs. As Edge Functions (book-slot,
-- ai-assistant/tools/schedule) escrevem directamente na tabela com cliente de
-- servico, fora das RPCs e fora da RLS; e rpc_create_schedule_item e SECURITY
-- DEFINER e ignora a RLS. Qualquer regra que viva so nas RPCs nao alcanca esses
-- caminhos. O trigger alcanca todos.
--
--
-- -- A REGRA NOVA, EM TRES PECAS ---------------------------------------------
--
-- (a) schedule_items.ausencia_pedido_id, FK simples para o pedido, com indice
--     parcial. E a coluna que permite, pela primeira vez, distinguir um item de
--     ausencia em SQL sem ir buscar o board_type ao board.
--
--     vacation_id -- coluna orfa da baseline, sem FK e sem tabela de destino --
--     fica onde esta e NAO se usa. Renomea-la ou reaproveita-la mexeria em
--     types.ts e em codigo, que esta ronda nao toca.
--
-- (b) hr_ausencias_desviar_marcacao_directa(), BEFORE INSERT OR UPDATE:
--       - INSERT num board com board_type='time_off' e ausencia_pedido_id NULL
--         -> recusado, com a mensagem a dizer qual a RPC a usar;
--       - UPDATE de uma linha com ausencia_pedido_id NOT NULL fora da sentinela
--         -> recusado: e o reflexo de um pedido e nao se edita ali.
--     Linhas legadas de time_off ja existentes ficam com ausencia_pedido_id
--     NULL e continuam editaveis -- o RAISE do INSERT nao lhes toca, e o do
--     UPDATE so olha para linhas projectadas.
--
-- (c) O item EXISTE DESDE O PEDIDO, com approval_status='pending' e status de
--     agenda 'draft'. Nao e contradicao com "nao marca logo": o que deixa de
--     existir e a marcacao AUTONOMA. O item pendente e visivel -- e isso que da
--     o tracejado no calendario e a fila de pendentes sobre o board que ja
--     existe -- mas e inerte e governado.
--     A alternativa -- so criar o item na aprovacao -- dava um board mais limpo
--     e um trabalhador sem forma de ver no calendario o que pediu.
--
--
-- -- EFEITO COLATERAL OBRIGATORIO: O GUARDA DOS FERIADOS ----------------------
--
-- trg_prevent_schedule_items_on_holidays recusa hoje, com ERRCODE 23514,
-- qualquer item que cruze um feriado da organizacao, e nao tem excepcao nenhuma
-- para ausencias: umas ferias de duas semanas com um feriado ao meio sao
-- REJEITADAS pela base.
--
-- CREATE OR REPLACE da funcao com UMA clausula nova, no topo:
--   IF NEW.ausencia_pedido_id IS NOT NULL THEN RETURN NEW; END IF;
--
-- O resto do corpo e copia literal da definicao em vigor (baseline
-- 20260615130000, linha 4741) -- confirmado por leitura de que nenhuma migracao
-- posterior lhe fez CREATE OR REPLACE. Se este ficheiro for aplicado num remoto
-- onde a funcao entretanto mudou, o bloco de guardas ABORTA: reescrever uma
-- funcao a partir de uma versao antiga foi como se ressuscitou uma assinatura
-- substituida e se parou um botao para toda a gente.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - resource_time_off: NAO se adopta, nao se corrige, nao se apaga. Fica
--   declarada morta em COMMENT ON TABLE, para o proximo nao hesitar. Esta
--   ligada ao recurso de agenda e nao a pessoa, nao tem organization_id, e a
--   RLS dela so deixa passar system admins.
-- - get_resource_available_slots: continua a apagar o dia da disponibilidade
--   com qualquer linha de resource_time_off, aprovada ou nao, e continua a nao
--   olhar para ausencias nenhumas. Ligar disponibilidade de agenda a ausencias
--   aprovadas e ronda propria, com risco de leitura no modulo de leads.
-- - BACKFILL dos schedule_items de time_off ja existentes: ficam como legado,
--   com ausencia_pedido_id NULL, visiveis e editaveis, e SEM saldo associado. E
--   a lacuna assumida desta ronda.
-- - A politica larga "Users access organization items" de schedule_items (so
--   organizacao, sem ambito, permissiva) continua a decidir a leitura na
--   pratica, e a projeccao herda-lhe a largura: quem ve os itens da organizacao
--   ve que alguem tem ferias pedidas, ainda que nao veja o pedido. E por isso
--   que a justificacao clinica vive noutra tabela. Estreita-la e ronda propria
--   e tem raio de accao fora de RH.
-- - Nao se cria board nenhum. Se a organizacao nao tiver board com
--   board_type='time_off', a projeccao nao acontece e o pedido fica com
--   schedule_item_id NULL -- com NOTICE. Inventar um board de sistema aqui era
--   criar dados de configuracao a socapa.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TRIGGER trg_schedule_items_desviar_ausencia ON public.schedule_items;
--   DROP FUNCTION public.hr_ausencias_desviar_marcacao_directa();
--   -- e repor o corpo anterior de prevent_schedule_items_on_holidays, e
--   -- esvaziar hr_ausencias_projectar_no_board. A coluna
--   -- schedule_items.ausencia_pedido_id pode ficar: e aditiva e nao estorva.
--
--
-- Prerequisitos:
--   20261121060000  pessoas_ausencias_pedidos
--   20261121080000  pessoas_ausencias_dias
--   20261121110000  hr_ausencias_projectar_no_board (a versao vazia)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_corpo text;
BEGIN
  IF to_regclass('public.pessoas_ausencias_pedidos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_pedidos nao existe. Aplicar 20261121060000 primeiro.';
  END IF;

  IF to_regclass('public.schedule_items') IS NULL OR to_regclass('public.schedule_boards') IS NULL THEN
    RAISE EXCEPTION 'schedule_items ou schedule_boards nao existem. Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_projectar_no_board' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION
      'hr_ausencias_projectar_no_board(uuid) nao existe. Aplicar 20261121110000 primeiro: esta migracao substitui-lhe o corpo, nao a cria.';
  END IF;

  -- A funcao dos feriados tem de existir e ainda NAO ter a excepcao. Se ja a
  -- tiver, alguem a alterou entretanto e este CREATE OR REPLACE apagaria essa
  -- alteracao -- exactamente o erro de reescrever a partir de uma versao antiga.
  SELECT p.prosrc INTO v_corpo
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'prevent_schedule_items_on_holidays' AND p.pronargs = 0;

  IF v_corpo IS NULL THEN
    RAISE EXCEPTION
      'prevent_schedule_items_on_holidays() nao existe no remoto. Esta migracao substitui-lhe o corpo; sem ela, o CREATE OR REPLACE criaria uma funcao nova sem trigger a chama-la.';
  END IF;

  IF v_corpo LIKE '%ausencia_pedido_id%' THEN
    RAISE EXCEPTION
      'prevent_schedule_items_on_holidays() JA menciona ausencia_pedido_id. Ou esta migracao ja foi aplicada, ou outra alterou a funcao. Nao se reescreve por cima: ler a definicao em vigor primeiro.';
  END IF;

  -- E tem de continuar a olhar para schedule_holidays: se nao olhar, nao e a
  -- funcao que se pensa que e.
  IF v_corpo NOT LIKE '%schedule_holidays%' THEN
    RAISE EXCEPTION
      'prevent_schedule_items_on_holidays() nao menciona schedule_holidays. Nao e a funcao esperada -- investigar antes de a substituir.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- (a) A coluna
-- ==============================================================================
ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS ausencia_pedido_id uuid;

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'schedule_items_ausencia_pedido_fkey'
       AND conrelid = to_regclass('public.schedule_items')
  ) THEN
    ALTER TABLE public.schedule_items
      ADD CONSTRAINT schedule_items_ausencia_pedido_fkey
      FOREIGN KEY (ausencia_pedido_id)
      REFERENCES public.pessoas_ausencias_pedidos (id) ON DELETE SET NULL;
  END IF;
END;
$fk$;

CREATE INDEX IF NOT EXISTS idx_schedule_items_ausencia_pedido
  ON public.schedule_items (ausencia_pedido_id)
  WHERE ausencia_pedido_id IS NOT NULL;

COMMENT ON COLUMN public.schedule_items.ausencia_pedido_id IS
'O pedido de ausencia de que este item e a PROJECCAO. NOT NULL significa: esta linha e um reflexo, nao uma origem -- nao se cria por fora e nao se edita por fora.

E a primeira forma de distinguir um item de ausencia em SQL sem ir buscar o board_type ao board.

NAO CONFUNDIR com vacation_id, que e uma coluna orfa da baseline, sem FK e sem tabela de destino, e que nao se usa nem se renomeia nesta ronda -- fazia-lo mexeria em types.ts e em codigo.';

-- ==============================================================================
-- (b) O desvio da marcacao directa
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_ausencias_desviar_marcacao_directa()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_board_type text;
BEGIN
  -- De dentro das RPCs do modulo, tudo passa: e a projeccao a fazer o seu
  -- trabalho.
  IF coalesce(current_setting('hr_ausencias.rpc', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Uma linha projectada nao se edita aqui. As legadas (ausencia_pedido_id
    -- NULL) continuam editaveis: o RAISE nao lhes toca.
    IF OLD.ausencia_pedido_id IS NOT NULL OR NEW.ausencia_pedido_id IS NOT NULL THEN
      RAISE EXCEPTION
        'ausencia_item_projectado: este item e o reflexo de um pedido de ausencia e nao se edita aqui. Alterar a ausencia faz-se no pedido, pelas RPCs rpc_hr_ausencia_decidir_chefia / _decidir_rh / _cancelar.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT.
  IF NEW.ausencia_pedido_id IS NOT NULL THEN
    -- Alguem a tentar criar uma projeccao por fora, sem ser pela RPC.
    RAISE EXCEPTION
      'ausencia_item_projectado: um item com ausencia_pedido_id e criado pela RPC do modulo, nao por insert directo.'
      USING ERRCODE = '23514';
  END IF;

  SELECT sb.board_type INTO v_board_type
    FROM public.schedule_boards sb
   WHERE sb.id = NEW.board_id;

  IF coalesce(v_board_type, '') = 'time_off' THEN
    RAISE EXCEPTION
      'ausencia_exige_pedido: uma marcacao no board de ausencias cria um PEDIDO, nao um item de calendario. Usar rpc_hr_ausencia_pedir. O item aparece no board por projeccao, ja ligado ao pedido, e e ai que fica visivel enquanto espera decisao.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_ausencias_desviar_marcacao_directa() IS
'Desvia a marcacao directa de ausencias: um INSERT num board com board_type=time_off sem ausencia_pedido_id e recusado, e um UPDATE a uma linha projectada tambem.

TRIGGER e nao RPC de proposito, e a razao e concreta: as Edge Functions (book-slot, ai-assistant/tools/schedule) escrevem directamente em schedule_items com cliente de servico, fora das RPCs e fora da RLS, e rpc_create_schedule_item e SECURITY DEFINER e ignora a RLS. Uma regra que viva so nas RPCs nao alcanca esses caminhos; o trigger alcanca todos.

LINHAS LEGADAS de time_off ja existentes ficam com ausencia_pedido_id NULL e continuam editaveis -- o RAISE do INSERT nao lhes toca, e o do UPDATE so olha para linhas projectadas. Ficam sem saldo associado, e e a lacuna assumida desta ronda.

QUEBRA DELIBERADA: o formulario que hoje cria ausencias no board deixa de funcionar contra ele a partir daqui.';

DROP TRIGGER IF EXISTS trg_schedule_items_desviar_ausencia ON public.schedule_items;
CREATE TRIGGER trg_schedule_items_desviar_ausencia
  BEFORE INSERT OR UPDATE ON public.schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.hr_ausencias_desviar_marcacao_directa();

-- ==============================================================================
-- O guarda dos feriados, com a excepcao para ausencias
-- ==============================================================================
-- Corpo copiado da definicao EM VIGOR (baseline, linha 4741), com UMA clausula
-- nova no topo. O bloco de guardas acima aborta se a funcao no remoto nao for a
-- esperada, para nao se reescrever a partir de uma versao antiga.
CREATE OR REPLACE FUNCTION public.prevent_schedule_items_on_holidays()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_organization_id uuid;
  v_start_date date;
  v_end_date date;
  v_holiday_name text;
BEGIN
  -- A CLAUSULA NOVA. Umas ferias de duas semanas com um feriado ao meio sao
  -- normais; recusa-las seria a base a impedir o unico caso em que atravessar
  -- um feriado e exactamente o que se quer.
  IF NEW.ausencia_pedido_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text = 'cancelled' THEN
    RETURN NEW;
  END IF;

  v_organization_id := NEW.organization_id;

  IF v_organization_id IS NULL THEN
    SELECT sb.organization_id
      INTO v_organization_id
    FROM public.schedule_boards sb
    WHERE sb.id = NEW.board_id;
  END IF;

  IF v_organization_id IS NULL THEN
    v_organization_id := NEW.company_id;
  END IF;

  IF v_organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_start_date := (NEW.start_datetime AT TIME ZONE 'Europe/Lisbon')::date;
  v_end_date := (NEW.end_datetime AT TIME ZONE 'Europe/Lisbon')::date;

  SELECT sh.name
    INTO v_holiday_name
  FROM public.schedule_holidays sh
  WHERE sh.organization_id = v_organization_id
    AND (
      (COALESCE(sh.is_recurring, false) = false AND sh.holiday_date BETWEEN v_start_date AND v_end_date)
      OR (
        COALESCE(sh.is_recurring, false) = true
        AND to_char(sh.holiday_date, 'MM-DD') BETWEEN to_char(v_start_date, 'MM-DD') AND to_char(v_end_date, 'MM-DD')
      )
    )
  ORDER BY sh.holiday_date
  LIMIT 1;

  IF v_holiday_name IS NOT NULL THEN
    RAISE EXCEPTION 'Nao e possivel criar ou alterar agendamentos em dia bloqueado/feriado: %', v_holiday_name
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_schedule_items_on_holidays() IS
'Recusa itens de agenda que cruzem um feriado da organizacao. UMA excepcao, acrescentada em 20261121130000: itens com ausencia_pedido_id NOT NULL passam sempre -- umas ferias de duas semanas com um feriado ao meio sao normais, e recusa-las era a base a impedir o unico caso em que atravessar um feriado e o que se quer.

O resto do corpo e a definicao em vigor da baseline. Quem a alterar outra vez tem de LER a versao em vigor primeiro, e nao a da baseline: foi assim que se ressuscitou uma assinatura ja substituida e se parou um botao para toda a gente.';

-- ==============================================================================
-- (c) A projeccao: substituir o corpo da funcao vazia de 20261121110000
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_ausencias_projectar_no_board(_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ped      public.pessoas_ausencias_pedidos;
  v_board    uuid;
  v_tipo_cod text;
  v_tipo_nom text;
  v_nome     text;
  v_ini      timestamptz;
  v_fim      timestamptz;
  v_aprov    text;
  v_status   text;
  v_item     uuid;
BEGIN
  SELECT p.* INTO v_ped FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_id;
  IF v_ped.id IS NULL THEN
    RETURN;
  END IF;

  -- NAO se cria board nenhum. Sem board de ausencias na organizacao, a
  -- projeccao simplesmente nao acontece: inventar um board de sistema aqui era
  -- criar dados de configuracao a socapa.
  SELECT sb.id INTO v_board
    FROM public.schedule_boards sb
   WHERE sb.organization_id = v_ped.organization_id
     AND sb.board_type = 'time_off'
     AND coalesce(sb.is_active, true) = true
   ORDER BY coalesce(sb.is_system_board, false) DESC, sb.created_at
   LIMIT 1;

  IF v_board IS NULL THEN
    RAISE NOTICE
      'Pedido % sem projeccao: a organizacao nao tem board com board_type=time_off. O pedido existe e conta para o saldo; nao aparece no calendario.',
      _pedido_id;
    RETURN;
  END IF;

  IF v_ped.created_by IS NULL THEN
    RAISE NOTICE
      'Pedido % sem projeccao: schedule_items.created_by e NOT NULL e o pedido nao tem autor registado.',
      _pedido_id;
    RETURN;
  END IF;

  SELECT t.codigo, t.nome INTO v_tipo_cod, v_tipo_nom
    FROM public.hr_ausencias_tipos t
   WHERE t.id = v_ped.tipo_id AND t.organization_id = v_ped.organization_id;

  SELECT coalesce(pe.nome_completo, 'Ausencia') INTO v_nome
    FROM public.pessoas pe WHERE pe.id = v_ped.pessoa_id;

  v_nome := coalesce(v_tipo_nom, 'Ausencia') || ' -- ' || v_nome;

  -- Dia inteiro, no fuso da organizacao. As horas do pedido, quando existem,
  -- nao se projectam nesta ronda: o item e o marcador do dia no calendario.
  v_ini := (v_ped.data_inicio::timestamp AT TIME ZONE 'Europe/Lisbon');
  v_fim := ((v_ped.data_fim + 1)::timestamp AT TIME ZONE 'Europe/Lisbon');

  v_aprov := CASE v_ped.estado
    WHEN 'pendente_chefia' THEN 'pending'
    WHEN 'pendente_rh'     THEN 'pending'
    WHEN 'aprovado'        THEN 'approved'
    WHEN 'recusado'        THEN 'rejected'
    WHEN 'cancelado'       THEN 'rejected'
  END;

  v_status := CASE
    WHEN v_ped.estado = 'cancelado' THEN 'cancelled'
    WHEN v_ped.estado = 'aprovado'  THEN 'confirmed'
    ELSE 'draft'
  END;

  -- A sentinela: sem ela, o proprio trigger de desvio recusaria esta escrita.
  PERFORM set_config('hr_ausencias.rpc', 'on', true);
  PERFORM set_config('app.audit_source', 'hr_ausencias', true);

  IF v_ped.schedule_item_id IS NOT NULL THEN
    UPDATE public.schedule_items si
       SET title = v_nome,
           start_datetime = v_ini,
           end_datetime = v_fim,
           all_day = true,
           time_off_type = v_tipo_cod,
           approval_status = v_aprov,
           status = v_status::public.schedule_item_status,
           updated_at = now()
     WHERE si.id = v_ped.schedule_item_id;
    RETURN;
  END IF;

  INSERT INTO public.schedule_items (
    board_id, title, status, origin,
    start_datetime, end_datetime, all_day,
    organization_id, created_by,
    time_off_type, approval_status, ausencia_pedido_id
  ) VALUES (
    v_board, v_nome, v_status::public.schedule_item_status, 'manual',
    v_ini, v_fim, true,
    v_ped.organization_id, v_ped.created_by,
    v_tipo_cod, v_aprov, _pedido_id
  )
  RETURNING id INTO v_item;

  UPDATE public.pessoas_ausencias_pedidos
     SET schedule_item_id = v_item
   WHERE id = _pedido_id;
END;
$$;

COMMENT ON FUNCTION public.hr_ausencias_projectar_no_board(uuid) IS
'Cria e mantem a projeccao do pedido em schedule_items. O item existe DESDE O PEDIDO, com approval_status=pending e status=draft -- o que deixa de existir e a marcacao autonoma, nao a visibilidade do que se pediu. E isso que da o tracejado no calendario e a fila de pendentes sobre o board que ja existe.

NAO cria board nenhum: sem board com board_type=time_off na organizacao, a projeccao nao acontece, o pedido fica com schedule_item_id NULL e ha um NOTICE. Inventar um board de sistema aqui era criar dados de configuracao a socapa.

As horas do pedido, quando existem, nao se projectam nesta ronda: o item e o marcador do dia.';

-- ==============================================================================
-- resource_time_off: declarada morta
-- ==============================================================================
DO $morta$
BEGIN
  IF to_regclass('public.resource_time_off') IS NOT NULL THEN
    COMMENT ON TABLE public.resource_time_off IS
'MORTA. NAO se usa, nao se corrige e nao se apaga -- e para o proximo nao hesitar.

Nao foi adoptada pelo modulo de ausencias (20261121130000) por tres razoes: esta ligada ao RECURSO de agenda e nao a pessoa, nao tem organization_id, e a RLS dela so deixa passar system admins.

As ausencias de pessoas vivem em pessoas_ausencias_pedidos e pessoas_ausencias_dias, e projectam-se em schedule_items por schedule_items.ausencia_pedido_id.

ATENCAO: get_resource_available_slots continua a apagar o dia da disponibilidade com qualquer linha desta tabela, aprovada ou nao, e continua a nao olhar para ausencias nenhumas. Ligar as duas coisas e ronda propria.';
  END IF;
END;
$morta$;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_corpo text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'schedule_items'
       AND column_name = 'ausencia_pedido_id'
  ) THEN
    RAISE EXCEPTION 'schedule_items.ausencia_pedido_id nao ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'schedule_items_ausencia_pedido_fkey'
       AND conrelid = to_regclass('public.schedule_items')
  ) THEN
    RAISE EXCEPTION 'A FK de schedule_items.ausencia_pedido_id nao ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'idx_schedule_items_ausencia_pedido'
  ) THEN
    RAISE EXCEPTION 'O indice parcial de ausencia_pedido_id nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.schedule_items')
       AND tgname = 'trg_schedule_items_desviar_ausencia' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'O trigger de desvio da marcacao directa nao ficou criado.';
  END IF;

  -- O guarda dos feriados tem de ter ficado com a excepcao E com o resto do
  -- corpo. Se perdeu schedule_holidays, o CREATE OR REPLACE deixou-o inutil.
  SELECT p.prosrc INTO v_corpo
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'prevent_schedule_items_on_holidays' AND p.pronargs = 0;

  IF v_corpo IS NULL THEN
    RAISE EXCEPTION 'prevent_schedule_items_on_holidays() desapareceu.';
  END IF;
  IF v_corpo NOT LIKE '%ausencia_pedido_id%' THEN
    RAISE EXCEPTION
      'prevent_schedule_items_on_holidays() nao ganhou a excepcao das ausencias. Umas ferias com um feriado ao meio continuariam a ser rejeitadas.';
  END IF;
  IF v_corpo NOT LIKE '%schedule_holidays%' THEN
    RAISE EXCEPTION
      'prevent_schedule_items_on_holidays() perdeu a verificacao dos feriados ao ganhar a excepcao. O guarda ficou inutil para todos os outros itens.';
  END IF;

  -- O trigger dos feriados tem de continuar ligado a funcao.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = to_regclass('public.schedule_items')
       AND tgname = 'trg_prevent_schedule_items_on_holidays' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION
      'trg_prevent_schedule_items_on_holidays nao existe em schedule_items. O CREATE OR REPLACE nao cria triggers; se o trigger desapareceu, o guarda dos feriados nao corre para ninguem.';
  END IF;

  -- A projeccao deixou de estar vazia.
  SELECT p.prosrc INTO v_corpo
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_projectar_no_board' AND p.pronargs = 1;

  IF v_corpo NOT LIKE '%schedule_items%' THEN
    RAISE EXCEPTION
      'hr_ausencias_projectar_no_board continua vazia: o CREATE OR REPLACE nao substituiu o corpo de 20261121110000.';
  END IF;

  IF has_function_privilege('authenticated', 'public.hr_ausencias_projectar_no_board(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'authenticated consegue executar hr_ausencias_projectar_no_board. Exposta, seria um caminho para escrever no board por fora das RPCs.';
  END IF;

  RAISE NOTICE 'Conferido: coluna, FK, indice, trigger de desvio, excepcao dos feriados e projeccao com corpo.';
END;
$conferir$;
