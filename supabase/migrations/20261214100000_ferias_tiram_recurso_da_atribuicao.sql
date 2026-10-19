-- Ferias (quadro de ausencias) tiram o recurso da atribuicao.
--
-- Duas formas, como o ecra as permite (coluna schedule_items.all_day):
--  * Dia inteiro (all_day = true): o recurso sai por completo de cada dia local
--    que as ferias tocam. Sem horarios livres nesse dia, e conflito em qualquer
--    marcacao nesse dia.
--  * Com horas (all_day = false, p.ex. 09:00 a 10:00): bloqueiam SO a faixa
--    [start_datetime, end_datetime[. Os horarios que nao se sobreponham a ela
--    continuam livres, e so da conflito uma marcacao que se sobreponha.
--    all_day NULL (a coluna aceita nulos) conta como "com horas": bloqueia a
--    faixa gravada, nunca o dia inteiro, e nunca e ignorado.
--
-- ATENCAO, LER ANTES DE APLICAR:
--  * Muda funcoes PARTILHADAS que o calendario publico chama
--    (get_resource_available_slots, check_schedule_conflict) e a irma que o
--    reagendamento usa (get_resource_available_slots_excluding_item, so
--    service_role, chamada por reschedule-booking). Chega a Mudelar: um
--    comercial da Mudelar com ferias (pendentes ou aprovadas) deixa de ter
--    horarios livres no dia inteiro (ferias de dia inteiro) ou na faixa
--    marcada (ferias com horas), e passa a dar conflito em book-slot e
--    reschedule-booking nesses periodos. Os outros comerciais nao sao afectados.
--  * O calendario publico (anon) passa a devolver "sem horarios" ou "conflito"
--    por causa de ferias, pendentes e aprovadas. Isso revela INDIRECTAMENTE
--    ausencias de uma pessoa a quem conheca o uuid do recurso dela (um dia util
--    sem horarios nenhuns, uma faixa em falta, ou um conflito sem marcacao
--    visivel). Nao revela o motivo nem o tipo de ausencia.
--  * Esta migration TEM de entrar JUNTO com o codigo de
--    supabase/functions/suggest-schedule-assignee (e
--    supabase/functions/_shared/timeOffAvailability.ts), que aplica a mesma
--    regra na sugestao de responsavel. Uma sem a outra deixa a sugestao e o
--    calendario a discordar. Esse codigo tem de distinguir tambem dia inteiro
--    de ferias com horas.
--  * A validacao de que o recurso pertence a p_organization_id foi deixada de
--    fora DE PROPOSITO: ha sub-organizacoes, e um recurso pode ser usado por uma
--    organizacao que nao e a sua. As ferias procuram-se sempre na organizacao
--    do proprio recurso.
--  * AINDA NAO MEDIDA EM DESEMPENHO. get_resource_available_slots e chamada
--    dezenas de vezes por pedido no modo mes (get_month_availability). Antes do
--    push, medir na nike o custo da auxiliar e da consulta de ferias com horas
--    em ciclo, e depois do push chamar o modo mes da nike (nunca o da Mudelar).
--    O caso normal (sem ferias com horas no dia) paga UMA consulta por dia e
--    nenhuma por horario. Nao se cria indice novo: usa-se o
--    idx_schedule_items_user_id existente; so se acrescenta um indice se a
--    medicao o pedir.
--  * Limite a duracao: get_resource_available_slots e a irma _excluding_item
--    devolvem vazio, logo no inicio e antes de qualquer consulta, se
--    p_duration_minutes for NULL, <= 0 ou > 1440. Sem isto, um visitante
--    anonimo que chame a funcao directamente com uma duracao negativa e enorme
--    faz o ciclo de horarios dar milhoes de voltas. Protege tambem a Mudelar,
--    que usa estas funcoes; os chamadores ja passam 60 por omissao.
--  * rpc_create_schedule_item (seccao 5) muda para quadros de ausencias
--    (board_type = 'time_off') e chega a Mudelar:
--      - ferias NOVAS criadas sem Colaborador (p_user_id NULL) passam a dar
--        ERRO (invalid_parameter_value) e nao se gravam;
--      - ferias NOVAS ligam-se a TODOS os recursos activos da pessoa
--        (p_user_id) na organizacao, e ja NAO ao recurso de quem as cria;
--        p_assignee_resource_ids e ignorado; se a pessoa nao tiver recurso,
--        as ferias gravam-se sem atribuicao (nunca se cria recurso).
--      - ferias NOVAS gravam-se SEMPRE com approval_status = 'pending',
--        qualquer que seja o p_approval_status enviado. Nao existe permissao
--        propria de aprovar ferias (o ecra decide "pode aprovar" pela chefia
--        directa, reports_to, e so mostra os botoes em ferias ja gravadas);
--        aprovar faz-se pela edicao. O ecra ja cria com 'pending'.
--    NAO ha backfill: as ferias antigas continuam ligadas ao recurso de quem
--    as criou.
--  * rpc_create_schedule_item, guardas de ambito (TODOS os quadros, chega a
--    Mudelar):
--      - o quadro p_board_id tem de existir e pertencer a uma organizacao
--        VISIVEL ao utilizador (get_user_visible_org_ids); senao ERRO
--        (insufficient_privilege). Quadro sem organizacao (organization_id
--        NULL) tambem da erro. O ramo das ferias decide-se so por
--        board_type = 'time_off' do quadro, sem exigir que o quadro seja de
--        p_organization_id;
--      - fora das ferias, cada recurso de p_assignee_resource_ids tem de
--        existir e ser de uma organizacao VISIVEL ao utilizador; senao ERRO
--        (insufficient_privilege), antes de inserir. Visibilidade e nao
--        igualdade com p_organization_id, porque ha sub-organizacoes;
--      - fora das ferias, o recurso do criador por omissao procura-se so em
--        p_organization_id (antes procurava-se em qualquer organizacao, e foi
--        medido na nike um utilizador com recursos em varias organizacoes a
--        ficar ligado a um recurso de OUTRA). Sem recurso do criador nessa
--        organizacao, cria-se um nela (como ja acontecia a quem nao tinha
--        recurso nenhum), o que exige scheduling.resources.create.
--  * check_schedule_conflict devolve true (conflito, falha fechada) quando
--    p_end - p_start > 1 dia, sem calcular nada. anon pode chamar a funcao
--    directamente, e um intervalo enorme faria a consulta das ferias varrer
--    meses ou anos. Os chamadores legitimos (book-slot, reschedule-booking)
--    passam a duracao de uma visita (<= 1440 minutos, o mesmo teto das
--    funcoes de horarios).
--  * search_path das tres funcoes SECURITY DEFINER reescritas aqui
--    (get_resource_available_slots, _excluding_item, check_schedule_conflict)
--    passa de 'public' para 'public, pg_temp'. O resto dos atributos fica.
--
-- FICA DE FORA desta migration (decidido, nao esquecido):
--  * edicao de ferias existentes: rpc_update_schedule_item e
--    rpc_update_schedule_item_assignees nao mudam (nem a guarda de aprovacao,
--    nem os recursos ligados ao editar, nem o ambito dos recursos);
--  * backfill das ferias antigas (continuam ligadas ao recurso de quem as
--    criou; o bloqueio funciona por user_id);
--  * ausencias de RH (resource_time_off e as ausencias do modulo de pessoas)
--    nao se ligam a isto;
--  * suggest-schedule-assignee continua sem verificacao de permissao propria.
--  * Ferias REJEITADAS deixam de bloquear tambem pelo caminho antigo (a
--    atribuicao): em check_schedule_conflict, get_resource_available_slots e
--    _excluding_item, um item de quadro time_off com approval_status =
--    'rejected' deixa de contar como ocupacao. E as contagens de capacidade
--    diaria das duas funcoes de horarios deixam de contar itens de quadro
--    time_off (nao sao visitas).
--  * Tudo isto entra JUNTO com o codigo de supabase/functions/suggest-schedule-assignee
--    e com a validacao de Colaborador obrigatorio no ecra
--    src/components/scheduling/ScheduleItemDialog.tsx (sem ela, o utilizador
--    ve o erro da base em vez de uma mensagem no formulario).
--
-- Regra comum: um item de um quadro board_type = 'time_off', da mesma
-- organizacao do recurso, com o mesmo user_id que o recurso, nao cancelado e
-- nao rejeitado (pendentes e aprovadas contam). Para o dia inteiro, o dia local
-- [00:00, 24:00[ e o do fuso da organizacao (mesma convencao de
-- get_resource_available_slots: fuso de schedule_settings, invalido ou vazio
-- cai em Europe/Lisbon).
-- A ligacao e por user_id e nao pelo recurso do item, porque as ferias antigas
-- estao ligadas ao recurso de quem as criou, nao ao de quem esta de ferias (a
-- partir desta migration, as novas ligam ao recurso da pessoa; sem backfill).
--
-- As versoes de get_resource_available_slots e de
-- get_resource_available_slots_excluding_item copiadas sao as de
-- 20261204780000_horarios_livres_fuso_sem_custo.sql (as mais recentes). So se
-- acrescenta a saida por ferias de dia inteiro, depois das saidas baratas
-- (feriados, dias uteis, capacidade diaria, resource_time_off) e antes de gerar
-- horarios, e o bloqueio por horario das ferias com horas.
-- check_schedule_conflict vem do baseline (nenhuma migration posterior a redefine).
-- rpc_create_schedule_item vem de 20261204470000_schedule_items_lead_id_expand.sql
-- (a mais recente; nenhuma posterior a redefine). Mesma assinatura de 26
-- argumentos, retorno, atributos, search_path e grants; muda a resolucao
-- dos recursos para quadros time_off, o estado de aprovacao das ferias novas
-- e as guardas de ambito do quadro e dos recursos (ver acima).

-- ---------------------------------------------------------------------------
-- 1. Funcao auxiliar: so ferias de DIA INTEIRO
-- ---------------------------------------------------------------------------
-- Nome antigo deste ficheiro (nunca aplicado); larga-se caso exista, para nao
-- ficar uma versao que trata ferias com horas como dia inteiro.
DROP FUNCTION IF EXISTS public.resource_has_time_off_on(uuid, date, text);

-- p_tz e opcional: quem ja resolveu o fuso (get_resource_available_slots e a
-- irma _excluding_item) passa-o e poupa a leitura de schedule_settings.
-- SECURITY INVOKER e sem EXECUTE para anon/authenticated: chamada directa
-- revelaria se a pessoa de qualquer recurso tem ferias. As funcoes SECURITY
-- DEFINER que a chamam correm como o dono e continuam a poder usa-la.
CREATE OR REPLACE FUNCTION public.resource_has_full_day_time_off_on(
  p_resource_id uuid,
  p_date date,
  p_tz text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_tz TEXT;
  v_day_start TIMESTAMPTZ;
  v_day_end TIMESTAMPTZ;
BEGIN
  IF p_resource_id IS NULL OR p_date IS NULL THEN
    RETURN false;
  END IF;

  SELECT r.user_id, r.organization_id
  INTO v_user_id, v_org_id
  FROM public.schedule_resources r
  WHERE r.id = p_resource_id;

  -- Recurso sem pessoa (sala, viatura) ou inexistente: nunca tem ferias.
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RETURN false;
  END IF;

  -- Fuso ja validado por quem chama: usa-se tal como vem (sem bloco protegido,
  -- que custaria uma subtransacao por chamada no caminho quente).
  v_tz := NULLIF(btrim(p_tz), '');
  IF v_tz IS NULL THEN
    SELECT NULLIF(btrim(s.timezone), '') INTO v_tz
    FROM public.schedule_settings s
    WHERE s.organization_id = v_org_id
    LIMIT 1;
    IF v_tz IS NULL THEN
      v_tz := 'Europe/Lisbon';
    ELSE
      BEGIN
        PERFORM now() AT TIME ZONE v_tz;
      EXCEPTION WHEN invalid_parameter_value THEN
        v_tz := 'Europe/Lisbon';
      END;
    END IF;
  END IF;

  v_day_start := p_date::TIMESTAMP AT TIME ZONE v_tz;
  v_day_end := (p_date + 1)::TIMESTAMP AT TIME ZONE v_tz;

  -- So "Dia inteiro". Ferias com horas tratam-se horario a horario em quem chama.
  RETURN EXISTS (
    SELECT 1
    FROM public.schedule_items si
    JOIN public.schedule_boards b
      ON b.id = si.board_id
     AND b.board_type = 'time_off'
    WHERE si.user_id = v_user_id
      AND si.organization_id = v_org_id
      AND si.all_day = true
      AND si.status <> 'cancelled'
      AND si.approval_status IS DISTINCT FROM 'rejected'
      AND si.start_datetime < v_day_end
      AND si.end_datetime > v_day_start
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.resource_has_full_day_time_off_on(uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resource_has_full_day_time_off_on(uuid, date, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resource_has_full_day_time_off_on(uuid, date, text) TO service_role;

COMMENT ON FUNCTION public.resource_has_full_day_time_off_on(uuid, date, text) IS
  'Verdadeiro se a pessoa (user_id) do recurso tem ferias de DIA INTEIRO (all_day = true), nao canceladas e nao rejeitadas, num quadro time_off da mesma organizacao, que sobreponham o dia local p_date (fuso da organizacao, ou p_tz). Ferias com horas (all_day false ou NULL) nao contam aqui: bloqueiam so a sua faixa, verificada horario a horario por quem chama.';

-- ---------------------------------------------------------------------------
-- 2. get_resource_available_slots: sai vazia com ferias de dia inteiro;
--    tira os horarios que se sobreponham a ferias com horas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_resource_available_slots(
  p_resource_id uuid,
  p_date date,
  p_duration_minutes integer DEFAULT 60,
  p_organization_id uuid DEFAULT NULL::uuid,
  p_min_advance_hours integer DEFAULT NULL::integer
)
RETURNS TABLE(slot_start timestamp with time zone, slot_end timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_day_of_week INTEGER;
  v_working_start TIME;
  v_working_end TIME;
  v_slot_start TIMESTAMPTZ;
  v_slot_end TIMESTAMPTZ;
  v_org_working_days INTEGER[];
  v_org_start TIME;
  v_org_end TIME;
  v_max_daily_capacity INTEGER;
  v_day_assigned_count INTEGER;
  v_min_advance_dt TIMESTAMPTZ;
  v_tz TEXT;
  v_tz_org UUID;
  v_local_cur TIMESTAMP;
  v_window_end TIMESTAMPTZ;
  v_day_start TIMESTAMPTZ;
  v_day_end TIMESTAMPTZ;
  v_res_user_id UUID;
  v_res_org_id UUID;
  v_has_partial BOOLEAN := false;
  v_slot_on_time_off BOOLEAN;
BEGIN
  -- Duracao fora de [1, 1440] minutos: sem horarios (evita ciclo sem fim).
  IF p_duration_minutes IS NULL OR p_duration_minutes <= 0 OR p_duration_minutes > 1440 THEN
    RETURN;
  END IF;

  v_day_of_week := EXTRACT(DOW FROM p_date);

  -- Fuso da organizacao (a do parametro; senao a do recurso; senao Lisboa).
  v_tz_org := COALESCE(
    p_organization_id,
    (SELECT organization_id FROM public.schedule_resources WHERE id = p_resource_id)
  );
  SELECT NULLIF(btrim(timezone), '') INTO v_tz
  FROM public.schedule_settings
  WHERE organization_id = v_tz_org
  LIMIT 1;
  IF v_tz IS NULL THEN
    v_tz := 'Europe/Lisbon';
  ELSE
    BEGIN
      PERFORM now() AT TIME ZONE v_tz;
    EXCEPTION WHEN invalid_parameter_value THEN
      v_tz := 'Europe/Lisbon';
    END;
  END IF;

  -- P2: Check holidays — if this day is a holiday for the org, return nothing
  IF p_organization_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.schedule_holidays
      WHERE (organization_id = p_organization_id OR organization_id IS NULL)
        AND holiday_date = p_date
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- P1: Load org settings for fallback
  IF p_organization_id IS NOT NULL THEN
    SELECT working_days, working_hours_start::TIME, working_hours_end::TIME
    INTO v_org_working_days, v_org_start, v_org_end
    FROM public.schedule_settings
    WHERE organization_id = p_organization_id
    LIMIT 1;

    -- Check if today is a non-working day per org settings
    IF v_org_working_days IS NOT NULL AND NOT (v_day_of_week = ANY(v_org_working_days)) THEN
      RETURN;
    END IF;
  END IF;

  -- Regra 1: antecedencia minima configuravel (horas uteis), sempre com
  -- pelo menos "agora" como piso.
  IF p_min_advance_hours IS NOT NULL AND p_organization_id IS NOT NULL THEN
    v_min_advance_dt := public.calculate_min_advance_datetime(p_organization_id, now(), p_min_advance_hours);
  ELSE
    v_min_advance_dt := now();
  END IF;

  -- Capacidade diaria: o dia local, da meia-noite a meia-noite no fuso da org.
  v_day_start := p_date::TIMESTAMP AT TIME ZONE v_tz;
  v_day_end := (p_date + 1)::TIMESTAMP AT TIME ZONE v_tz;

  SELECT max_daily_capacity INTO v_max_daily_capacity
  FROM public.schedule_resources
  WHERE id = p_resource_id;

  IF v_max_daily_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_day_assigned_count
    FROM public.schedule_items si
    JOIN public.schedule_item_assignees sia ON sia.item_id = si.id
    WHERE sia.resource_id = p_resource_id
      AND si.status NOT IN ('cancelled')
      AND si.start_datetime >= v_day_start
      AND si.start_datetime < v_day_end
      -- Ferias (quadro time_off) nao sao visitas: nao contam para a capacidade.
      AND NOT EXISTS (SELECT 1 FROM public.schedule_boards tb WHERE tb.id = si.board_id AND tb.board_type = 'time_off');

    IF v_day_assigned_count >= v_max_daily_capacity THEN
      RETURN;
    END IF;
  END IF;

  -- Get working hours from resource rules
  SELECT start_time, end_time INTO v_working_start, v_working_end
  FROM public.resource_availability_rules
  WHERE resource_id = p_resource_id
    AND day_of_week = v_day_of_week
    AND is_available = true
    AND (valid_from IS NULL OR valid_from <= p_date)
    AND (valid_until IS NULL OR valid_until >= p_date)
  LIMIT 1;

  -- Fallback: org settings → then hard defaults
  IF v_working_start IS NULL THEN
    v_working_start := COALESCE(v_org_start, '09:00'::TIME);
    v_working_end := COALESCE(v_org_end, '18:00'::TIME);
  END IF;

  -- Check if resource has time off
  IF EXISTS (
    SELECT 1 FROM public.resource_time_off
    WHERE resource_id = p_resource_id
      AND start_date <= p_date AND end_date >= p_date
      AND (all_day = true OR (start_time <= v_working_end AND end_time >= v_working_start))
  ) THEN
    RETURN;
  END IF;

  -- Ferias de DIA INTEIRO da pessoa do recurso (quadro time_off) neste dia:
  -- sem horarios. Depois das saidas baratas, antes de gerar horarios.
  IF public.resource_has_full_day_time_off_on(p_resource_id, p_date, v_tz) THEN
    RETURN;
  END IF;

  -- Ferias COM HORAS (all_day false ou NULL) que tocam este dia: UMA consulta.
  -- So se houver alguma e que cada horario paga a verificacao de sobreposicao.
  SELECT r.user_id, r.organization_id
  INTO v_res_user_id, v_res_org_id
  FROM public.schedule_resources r
  WHERE r.id = p_resource_id;

  IF v_res_user_id IS NOT NULL AND v_res_org_id IS NOT NULL THEN
    v_has_partial := EXISTS (
      SELECT 1
      FROM public.schedule_items si
      JOIN public.schedule_boards b
        ON b.id = si.board_id
       AND b.board_type = 'time_off'
      WHERE si.user_id = v_res_user_id
        AND si.organization_id = v_res_org_id
        AND si.all_day IS NOT TRUE
        AND si.status <> 'cancelled'
        AND si.approval_status IS DISTINCT FROM 'rejected'
        AND si.start_datetime < v_day_end
        AND si.end_datetime > v_day_start
    );
  END IF;

  -- Generate slots (hora local no fuso da org) and check conflicts
  v_local_cur := p_date + v_working_start;
  v_window_end := (p_date + v_working_end) AT TIME ZONE v_tz;

  LOOP
    v_slot_start := v_local_cur AT TIME ZONE v_tz;
    v_slot_end := v_slot_start + (p_duration_minutes || ' minutes')::INTERVAL;
    EXIT WHEN v_slot_end > v_window_end;

    -- Ferias com horas que se sobreponham a [v_slot_start, v_slot_end[.
    -- Fora do IF de baixo de proposito: assim, sem ferias com horas no dia,
    -- nenhum horario corre esta consulta.
    v_slot_on_time_off := false;
    IF v_has_partial THEN
      v_slot_on_time_off := EXISTS (
        SELECT 1
        FROM public.schedule_items si
        JOIN public.schedule_boards b
          ON b.id = si.board_id
         AND b.board_type = 'time_off'
        WHERE si.user_id = v_res_user_id
          AND si.organization_id = v_res_org_id
          AND si.all_day IS NOT TRUE
          AND si.status <> 'cancelled'
          AND si.approval_status IS DISTINCT FROM 'rejected'
          AND si.start_datetime < v_slot_end
          AND si.end_datetime > v_slot_start
      );
    END IF;

    -- Hora que nao existe (salto para a frente) ou que se repete (recuo) na
    -- mudanca de hora: fica fora da janela.
    IF (v_slot_start AT TIME ZONE v_tz) = v_local_cur
       AND (v_slot_start - INTERVAL '1 hour') AT TIME ZONE v_tz <> v_local_cur
       AND (v_slot_start + INTERVAL '1 hour') AT TIME ZONE v_tz <> v_local_cur
       AND v_slot_start >= v_min_advance_dt
       AND NOT v_slot_on_time_off
       AND NOT EXISTS (
         SELECT 1 FROM public.schedule_items si
         JOIN public.schedule_item_assignees sia ON sia.item_id = si.id
         WHERE sia.resource_id = p_resource_id
           AND si.status NOT IN ('cancelled')
           AND si.start_datetime < v_slot_end
           AND si.end_datetime > v_slot_start
           -- Ferias rejeitadas nao ocupam (so se consulta o quadro das linhas que ja se sobrepoem).
           AND (si.approval_status IS DISTINCT FROM 'rejected' OR NOT EXISTS (SELECT 1 FROM public.schedule_boards rb WHERE rb.id = si.board_id AND rb.board_type = 'time_off'))
       )
    THEN
      slot_start := v_slot_start;
      slot_end := v_slot_end;
      RETURN NEXT;
    END IF;

    v_local_cur := v_local_cur + '30 minutes'::INTERVAL;
  END LOOP;
END;
$function$;

-- Mesmos grants de antes (a funcao e chamada por anon/authenticated).
REVOKE ALL ON FUNCTION public.get_resource_available_slots(uuid, date, integer, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_resource_available_slots(uuid, date, integer, uuid, integer) TO PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. get_resource_available_slots_excluding_item: as mesmas regras de ferias
-- ---------------------------------------------------------------------------
-- Usada por reschedule-booking. p_exclude_item_id so exclui a visita que se
-- esta a reagendar das contas de ocupacao; NAO exclui ferias (nem as de dia
-- inteiro nem as com horas).
CREATE OR REPLACE FUNCTION public.get_resource_available_slots_excluding_item(
  p_resource_id uuid,
  p_date date,
  p_duration_minutes integer DEFAULT 60,
  p_organization_id uuid DEFAULT NULL::uuid,
  p_min_advance_hours integer DEFAULT NULL::integer,
  p_exclude_item_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(slot_start timestamp with time zone, slot_end timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_day_of_week INTEGER;
  v_working_start TIME;
  v_working_end TIME;
  v_slot_start TIMESTAMPTZ;
  v_slot_end TIMESTAMPTZ;
  v_org_working_days INTEGER[];
  v_org_start TIME;
  v_org_end TIME;
  v_max_daily_capacity INTEGER;
  v_day_assigned_count INTEGER;
  v_min_advance_dt TIMESTAMPTZ;
  v_tz TEXT;
  v_tz_org UUID;
  v_local_cur TIMESTAMP;
  v_window_end TIMESTAMPTZ;
  v_day_start TIMESTAMPTZ;
  v_day_end TIMESTAMPTZ;
  v_res_user_id UUID;
  v_res_org_id UUID;
  v_has_partial BOOLEAN := false;
  v_slot_on_time_off BOOLEAN;
BEGIN
  -- Duracao fora de [1, 1440] minutos: sem horarios (evita ciclo sem fim).
  IF p_duration_minutes IS NULL OR p_duration_minutes <= 0 OR p_duration_minutes > 1440 THEN
    RETURN;
  END IF;

  v_day_of_week := EXTRACT(DOW FROM p_date);

  v_tz_org := COALESCE(
    p_organization_id,
    (SELECT organization_id FROM public.schedule_resources WHERE id = p_resource_id)
  );
  SELECT NULLIF(btrim(timezone), '') INTO v_tz
  FROM public.schedule_settings
  WHERE organization_id = v_tz_org
  LIMIT 1;
  IF v_tz IS NULL THEN
    v_tz := 'Europe/Lisbon';
  ELSE
    BEGIN
      PERFORM now() AT TIME ZONE v_tz;
    EXCEPTION WHEN invalid_parameter_value THEN
      v_tz := 'Europe/Lisbon';
    END;
  END IF;

  IF p_organization_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.schedule_holidays
      WHERE (organization_id = p_organization_id OR organization_id IS NULL)
        AND holiday_date = p_date
    ) THEN
      RETURN;
    END IF;
  END IF;

  IF p_organization_id IS NOT NULL THEN
    SELECT working_days, working_hours_start::TIME, working_hours_end::TIME
    INTO v_org_working_days, v_org_start, v_org_end
    FROM public.schedule_settings
    WHERE organization_id = p_organization_id
    LIMIT 1;

    IF v_org_working_days IS NOT NULL AND NOT (v_day_of_week = ANY(v_org_working_days)) THEN
      RETURN;
    END IF;
  END IF;

  IF p_min_advance_hours IS NOT NULL AND p_organization_id IS NOT NULL THEN
    v_min_advance_dt := public.calculate_min_advance_datetime(p_organization_id, now(), p_min_advance_hours);
  ELSE
    v_min_advance_dt := now();
  END IF;

  v_day_start := p_date::TIMESTAMP AT TIME ZONE v_tz;
  v_day_end := (p_date + 1)::TIMESTAMP AT TIME ZONE v_tz;

  SELECT max_daily_capacity INTO v_max_daily_capacity
  FROM public.schedule_resources
  WHERE id = p_resource_id;

  IF v_max_daily_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_day_assigned_count
    FROM public.schedule_items si
    JOIN public.schedule_item_assignees sia ON sia.item_id = si.id
    WHERE sia.resource_id = p_resource_id
      AND si.status NOT IN ('cancelled')
      AND si.id IS DISTINCT FROM p_exclude_item_id
      AND si.start_datetime >= v_day_start
      AND si.start_datetime < v_day_end
      -- Ferias (quadro time_off) nao sao visitas: nao contam para a capacidade.
      AND NOT EXISTS (SELECT 1 FROM public.schedule_boards tb WHERE tb.id = si.board_id AND tb.board_type = 'time_off');

    IF v_day_assigned_count >= v_max_daily_capacity THEN
      RETURN;
    END IF;
  END IF;

  SELECT start_time, end_time INTO v_working_start, v_working_end
  FROM public.resource_availability_rules
  WHERE resource_id = p_resource_id
    AND day_of_week = v_day_of_week
    AND is_available = true
    AND (valid_from IS NULL OR valid_from <= p_date)
    AND (valid_until IS NULL OR valid_until >= p_date)
  LIMIT 1;

  IF v_working_start IS NULL THEN
    v_working_start := COALESCE(v_org_start, '09:00'::TIME);
    v_working_end := COALESCE(v_org_end, '18:00'::TIME);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.resource_time_off
    WHERE resource_id = p_resource_id
      AND start_date <= p_date AND end_date >= p_date
      AND (all_day = true OR (start_time <= v_working_end AND end_time >= v_working_start))
  ) THEN
    RETURN;
  END IF;

  -- Ferias de DIA INTEIRO da pessoa do recurso (quadro time_off) neste dia:
  -- sem horarios. Nao dependem de p_exclude_item_id.
  IF public.resource_has_full_day_time_off_on(p_resource_id, p_date, v_tz) THEN
    RETURN;
  END IF;

  -- Ferias COM HORAS (all_day false ou NULL) que tocam este dia: UMA consulta.
  SELECT r.user_id, r.organization_id
  INTO v_res_user_id, v_res_org_id
  FROM public.schedule_resources r
  WHERE r.id = p_resource_id;

  IF v_res_user_id IS NOT NULL AND v_res_org_id IS NOT NULL THEN
    v_has_partial := EXISTS (
      SELECT 1
      FROM public.schedule_items si
      JOIN public.schedule_boards b
        ON b.id = si.board_id
       AND b.board_type = 'time_off'
      WHERE si.user_id = v_res_user_id
        AND si.organization_id = v_res_org_id
        AND si.all_day IS NOT TRUE
        AND si.status <> 'cancelled'
        AND si.approval_status IS DISTINCT FROM 'rejected'
        AND si.start_datetime < v_day_end
        AND si.end_datetime > v_day_start
    );
  END IF;

  v_local_cur := p_date + v_working_start;
  v_window_end := (p_date + v_working_end) AT TIME ZONE v_tz;

  LOOP
    v_slot_start := v_local_cur AT TIME ZONE v_tz;
    v_slot_end := v_slot_start + (p_duration_minutes || ' minutes')::INTERVAL;
    EXIT WHEN v_slot_end > v_window_end;

    -- Ferias com horas que se sobreponham a [v_slot_start, v_slot_end[; so
    -- consultadas se o dia tiver alguma.
    v_slot_on_time_off := false;
    IF v_has_partial THEN
      v_slot_on_time_off := EXISTS (
        SELECT 1
        FROM public.schedule_items si
        JOIN public.schedule_boards b
          ON b.id = si.board_id
         AND b.board_type = 'time_off'
        WHERE si.user_id = v_res_user_id
          AND si.organization_id = v_res_org_id
          AND si.all_day IS NOT TRUE
          AND si.status <> 'cancelled'
          AND si.approval_status IS DISTINCT FROM 'rejected'
          AND si.start_datetime < v_slot_end
          AND si.end_datetime > v_slot_start
      );
    END IF;

    IF (v_slot_start AT TIME ZONE v_tz) = v_local_cur
       AND (v_slot_start - INTERVAL '1 hour') AT TIME ZONE v_tz <> v_local_cur
       AND (v_slot_start + INTERVAL '1 hour') AT TIME ZONE v_tz <> v_local_cur
       AND v_slot_start >= v_min_advance_dt
       AND NOT v_slot_on_time_off
       AND NOT EXISTS (
         SELECT 1 FROM public.schedule_items si
         JOIN public.schedule_item_assignees sia ON sia.item_id = si.id
         WHERE sia.resource_id = p_resource_id
           AND si.status NOT IN ('cancelled')
           AND si.id IS DISTINCT FROM p_exclude_item_id
           AND si.start_datetime < v_slot_end
           AND si.end_datetime > v_slot_start
           -- Ferias rejeitadas nao ocupam (so se consulta o quadro das linhas que ja se sobrepoem).
           AND (si.approval_status IS DISTINCT FROM 'rejected' OR NOT EXISTS (SELECT 1 FROM public.schedule_boards rb WHERE rb.id = si.board_id AND rb.board_type = 'time_off'))
       )
    THEN
      slot_start := v_slot_start;
      slot_end := v_slot_end;
      RETURN NEXT;
    END IF;

    v_local_cur := v_local_cur + '30 minutes'::INTERVAL;
  END LOOP;
END;
$function$;

-- So as edge functions (service_role) a usam.
REVOKE ALL ON FUNCTION public.get_resource_available_slots_excluding_item(uuid, date, integer, uuid, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_resource_available_slots_excluding_item(uuid, date, integer, uuid, integer, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_resource_available_slots_excluding_item(uuid, date, integer, uuid, integer, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. check_schedule_conflict: conflito tambem com ferias
-- ---------------------------------------------------------------------------
-- Mesma assinatura, retorno, volatilidade e SECURITY DEFINER do baseline;
-- search_path passa a public, pg_temp. CREATE OR REPLACE preserva os grants
-- existentes.
-- Intervalo maximo de 1 dia: se p_end - p_start > 1 dia, devolve true
-- (conflito) logo no inicio, sem consultar nada. E falha fechada: anon pode
-- chamar a funcao directamente com um intervalo de anos, e a consulta das
-- ferias (dia inteiro alargado aos dias locais) varreria tudo isso. Os
-- chamadores legitimos (book-slot, reschedule-booking) passam a duracao de
-- uma visita, <= 1440 minutos.
-- UMA so consulta, sem percorrer dias. Ha conflito se existir ferias da
-- pessoa do recurso que:
--  * seja de dia inteiro (all_day = true) e toque algum dia local do intervalo:
--    do dia local de p_start ao dia local do ultimo instante antes de p_end
--    (fim exclusivo), no fuso da organizacao do recurso; ou
--  * seja com horas (all_day false ou NULL) e se sobreponha a [p_start, p_end[.
CREATE OR REPLACE FUNCTION public.check_schedule_conflict(
  p_resource_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_exclude_item_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_tz TEXT;
  v_range_start TIMESTAMPTZ;
  v_range_end TIMESTAMPTZ;
BEGIN
  -- Intervalo maior que 1 dia: conflito, sem calcular (falha fechada; anon
  -- pode chamar a funcao). Visitas legitimas tem no maximo 1440 minutos.
  IF (p_end - p_start) > INTERVAL '1 day' THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.schedule_items si
    JOIN public.schedule_item_assignees sia ON sia.item_id = si.id
    WHERE sia.resource_id = p_resource_id
      AND si.status NOT IN ('cancelled')
      AND (p_exclude_item_id IS NULL OR si.id != p_exclude_item_id)
      AND si.start_datetime < p_end
      AND si.end_datetime > p_start
      -- Ferias rejeitadas nao dao conflito (so se consulta o quadro das linhas que ja se sobrepoem).
      AND (si.approval_status IS DISTINCT FROM 'rejected' OR NOT EXISTS (SELECT 1 FROM public.schedule_boards rb WHERE rb.id = si.board_id AND rb.board_type = 'time_off'))
  ) THEN
    RETURN true;
  END IF;

  IF p_resource_id IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RETURN false;
  END IF;

  SELECT r.user_id, r.organization_id
  INTO v_user_id, v_org_id
  FROM public.schedule_resources r
  WHERE r.id = p_resource_id;

  -- Recurso sem pessoa (sala, viatura) ou inexistente: nunca tem ferias.
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT NULLIF(btrim(s.timezone), '') INTO v_tz
  FROM public.schedule_settings s
  WHERE s.organization_id = v_org_id
  LIMIT 1;
  IF v_tz IS NULL THEN
    v_tz := 'Europe/Lisbon';
  ELSE
    BEGIN
      PERFORM now() AT TIME ZONE v_tz;
    EXCEPTION WHEN invalid_parameter_value THEN
      v_tz := 'Europe/Lisbon';
    END;
  END IF;

  -- Inicio do primeiro dia local e fim (exclusivo) do ultimo dia local.
  v_range_start := ((p_start AT TIME ZONE v_tz)::date)::TIMESTAMP AT TIME ZONE v_tz;
  v_range_end := (((p_end - INTERVAL '1 microsecond') AT TIME ZONE v_tz)::date + 1)::TIMESTAMP AT TIME ZONE v_tz;

  -- Ferias (quadro time_off) da pessoa do recurso: dia inteiro contra os dias
  -- locais do intervalo; com horas contra o proprio intervalo.
  -- O filtro largo [v_range_start, v_range_end[ vale para os dois ramos (o
  -- intervalo exacto esta contido nele) e deixa o planeador limitar as linhas.
  RETURN EXISTS (
    SELECT 1
    FROM public.schedule_items si
    JOIN public.schedule_boards b
      ON b.id = si.board_id
     AND b.board_type = 'time_off'
    WHERE si.user_id = v_user_id
      AND si.organization_id = v_org_id
      AND si.status <> 'cancelled'
      AND si.approval_status IS DISTINCT FROM 'rejected'
      AND si.start_datetime < v_range_end
      AND si.end_datetime > v_range_start
      AND (
        si.all_day = true
        OR (si.all_day IS NOT TRUE
            AND si.start_datetime < p_end
            AND si.end_datetime > p_start)
      )
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. rpc_create_schedule_item: ferias ligam ao recurso da pessoa
-- ---------------------------------------------------------------------------
-- Copiada de 20261204470000_schedule_items_lead_id_expand.sql. CREATE OR
-- REPLACE com a mesma assinatura de 26 argumentos (nomes e omissoes iguais),
-- mesmo retorno, SECURITY DEFINER e search_path: preserva os grants, que ainda
-- assim se reaplicam iguais no fim.
-- Guardas novas para TODOS os quadros, antes de inserir:
--  (g1) p_board_id tem de existir e ser de uma organizacao visivel ao
--       utilizador (get_user_visible_org_ids); senao erro.
-- Quando o quadro p_board_id e board_type = 'time_off' (so pelo tipo do
-- quadro; nao se exige que seja de p_organization_id):
--  (a) p_user_id NULL da erro ANTES de inserir o item;
--  (b) p_assignee_resource_ids e ignorado;
--  (c) os recursos sao TODOS os schedule_resources activos com
--      user_id = p_user_id e organization_id = p_organization_id;
--  (d) sem recurso, o item grava-se sem atribuicao. Nunca se usa o recurso do
--      criador nem se cria recurso;
--  (e) approval_status grava-se sempre 'pending' (nao ha permissao propria de
--      aprovar; aprova-se pela edicao).
-- Nos outros quadros:
--  (g2) cada recurso de p_assignee_resource_ids tem de existir e ser de uma
--       organizacao visivel ao utilizador; senao erro, antes de inserir;
--  (f)  o recurso do criador por omissao procura-se so em p_organization_id;
--  o resto mantem o comportamento anterior.
CREATE OR REPLACE FUNCTION public.rpc_create_schedule_item(
  p_organization_id      uuid,
  p_board_id             uuid,
  p_title                text    DEFAULT NULL,
  p_description          text    DEFAULT NULL,
  p_status               public.schedule_item_status DEFAULT NULL,
  p_origin               public.schedule_item_origin DEFAULT NULL,
  p_start_datetime       timestamptz DEFAULT NULL,
  p_end_datetime         timestamptz DEFAULT NULL,
  p_all_day              boolean DEFAULT NULL,
  p_client_id            uuid    DEFAULT NULL,
  p_contact_id           uuid    DEFAULT NULL,
  p_deal_id              uuid    DEFAULT NULL,
  p_employee_id          uuid    DEFAULT NULL,
  p_user_id              uuid    DEFAULT NULL,
  p_location             text    DEFAULT NULL,
  p_location_lat         numeric DEFAULT NULL,
  p_location_lng         numeric DEFAULT NULL,
  p_color                text    DEFAULT NULL,
  p_priority             integer DEFAULT NULL,
  p_tags                 text[]  DEFAULT NULL,
  p_notes                text    DEFAULT NULL,
  p_metadata             jsonb   DEFAULT NULL,
  p_time_off_type        text    DEFAULT NULL,
  p_approval_status      text    DEFAULT NULL,
  p_assignee_resource_ids uuid[] DEFAULT NULL,
  p_lead_id              uuid    DEFAULT NULL
)
RETURNS public.schedule_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor          uuid;
  v_item           public.schedule_items;
  v_effective_ids  uuid[];
  v_creator_res    uuid;
  v_creator_name   text;
  v_new_res_id     uuid;
  v_resource_diff  jsonb := NULL;
  v_assignee_diff  jsonb := NULL;
  v_audit_org      uuid;
  v_diff           jsonb;
  v_is_time_off    boolean := false;
  v_board_org      uuid;
  v_board_type     text;
  v_approval       text;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ──────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with schedule_items INSERT RLS ───────────────────
  IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.items.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar agendamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Quadro: tem de existir e ser de uma organizacao visivel ───────────────
  -- Visibilidade e nao igualdade com p_organization_id (ha sub-organizacoes).
  IF p_board_id IS NULL THEN
    RAISE EXCEPTION 'Indique o quadro do agendamento.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT b.organization_id, b.board_type
  INTO v_board_org, v_board_type
  FROM public.schedule_boards b
  WHERE b.id = p_board_id;

  IF NOT FOUND
     OR v_board_org IS NULL
     OR NOT (v_board_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Quadro de agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Quadro de ausencias (ferias)? So pelo tipo do quadro. ─────────────────
  v_is_time_off := COALESCE(v_board_type = 'time_off', false);

  -- Ferias sem Colaborador nao se gravam: ficariam sem pessoa e sem bloqueio.
  IF v_is_time_off AND p_user_id IS NULL THEN
    RAISE EXCEPTION 'Indique o colaborador a quem pertence esta ausência antes de a gravar.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Ferias novas nascem sempre pendentes: nao ha permissao propria de aprovar
  -- ferias, e aprovar faz-se pela edicao. Os outros quadros gravam o que vem.
  IF v_is_time_off THEN
    v_approval := 'pending';
  ELSE
    v_approval := p_approval_status;
  END IF;

  -- ── Fora das ferias: os recursos pedidos tem de ser de organizacoes
  --    visiveis ao utilizador. Antes de inserir. (Nas ferias sao ignorados.) ─
  IF NOT v_is_time_off
     AND array_length(p_assignee_resource_ids, 1) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM unnest(p_assignee_resource_ids) AS req(resource_id)
       WHERE NOT EXISTS (
         SELECT 1
         FROM public.schedule_resources r
         WHERE r.id = req.resource_id
           AND r.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
       )
     ) THEN
    RAISE EXCEPTION 'Recurso de agenda fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── INSERT schedule_items (identical column set / defaults to createItem,
  --    mais lead_id) ──
  INSERT INTO public.schedule_items
    (board_id, title, description, status, origin,
     start_datetime, end_datetime, all_day,
     client_id, contact_id, lead_id, deal_id, employee_id, user_id,
     location, location_lat, location_lng, color, priority,
     tags, notes, metadata, time_off_type, approval_status,
     created_by, organization_id)
  VALUES
    (p_board_id,
     COALESCE(p_title, 'Novo Agendamento'),
     p_description,
     COALESCE(p_status, 'draft'::public.schedule_item_status),
     COALESCE(p_origin, 'manual'::public.schedule_item_origin),
     p_start_datetime,
     p_end_datetime,
     COALESCE(p_all_day, false),
     p_client_id,
     p_contact_id,
     p_lead_id,
     p_deal_id,
     p_employee_id,
     p_user_id,
     p_location,
     p_location_lat,
     p_location_lng,
     p_color,
     COALESCE(p_priority, 0),
     p_tags,
     p_notes,
     COALESCE(p_metadata, '{}'::jsonb),
     p_time_off_type,
     v_approval,
     v_actor,
     p_organization_id)
  RETURNING * INTO v_item;

  IF v_is_time_off THEN
    -- ── Ferias: TODOS os recursos activos da pessoa nesta organizacao. ───────
    -- p_assignee_resource_ids e ignorado; sem recurso fica sem atribuicao.
    -- Nunca o recurso do criador, nunca um recurso novo.
    v_effective_ids := ARRAY(
      SELECT r.id
      FROM public.schedule_resources r
      WHERE r.user_id = p_user_id
        AND r.organization_id = p_organization_id
        AND r.is_active = true
      ORDER BY r.created_at ASC
    );
  ELSE
    -- ── Resolve effective assignees (mirrors the FE fallback exactly) ───────
    v_effective_ids := COALESCE(p_assignee_resource_ids, ARRAY[]::uuid[]);

    IF array_length(v_effective_ids, 1) IS NULL THEN
      -- No assignees provided → fall back to the creator's resource, so na
      -- organizacao do agendamento (um utilizador pode ter recursos em varias).
      SELECT id INTO v_creator_res
      FROM public.schedule_resources
      WHERE user_id = v_actor
        AND organization_id = p_organization_id
        AND is_active = true
      ORDER BY created_at ASC
      LIMIT 1;

      IF v_creator_res IS NULL THEN
        -- Create a schedule_resources row for the creator (same shape as the FE).
        SELECT name INTO v_creator_name
        FROM public.anew_users
        WHERE id = v_actor
        LIMIT 1;

        -- Authorization parity with schedule_resources INSERT RLS. The FE relies on
        -- RLS to allow this insert; replicate the same predicate here.
        IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.resources.create') THEN
          RAISE EXCEPTION 'Sem permissão para criar recursos de agenda' USING ERRCODE = 'insufficient_privilege';
        END IF;

        INSERT INTO public.schedule_resources
          (name, resource_type, user_id, color, is_active, metadata,
           created_by, organization_id)
        VALUES
          (COALESCE(v_creator_name, 'Utilizador'),
           'user',
           v_actor,
           '#10b981',
           true,
           '{}'::jsonb,
           v_actor,
           p_organization_id)
        RETURNING id INTO v_new_res_id;

        v_creator_res := v_new_res_id;

        -- Record the created resource in the combined diff (it is a real side effect).
        v_resource_diff := jsonb_build_object(
          'id',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_new_res_id)),
          'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(v_creator_name, 'Utilizador'))),
          'resource_type',   jsonb_build_object('old', NULL, 'new', to_jsonb('user'::text)),
          'user_id',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_actor)),
          'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(p_organization_id))
        );
      END IF;

      IF v_creator_res IS NOT NULL THEN
        v_effective_ids := ARRAY[v_creator_res];
      END IF;
    END IF;
  END IF;

  -- ── INSERT assignees (deduped), mirroring the FE ──────────────────────────
  IF array_length(v_effective_ids, 1) IS NOT NULL THEN
    -- Authorization parity with schedule_item_assignees INSERT RLS
    -- (create OR edit permission; item belongs to a visible org — it does, we
    -- just inserted it into p_organization_id which was validated above).
    IF NOT (public.has_scheduling_permission(auth.uid(), 'scheduling.items.create')
            OR public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit')) THEN
      RAISE EXCEPTION 'Sem permissão para atribuir recursos ao agendamento' USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO public.schedule_item_assignees (item_id, resource_id)
    SELECT v_item.id, x
    FROM (SELECT DISTINCT unnest(v_effective_ids) AS x) d;

    v_assignee_diff := jsonb_build_object(
      'resource_id', jsonb_build_object(
        'old', NULL,
        'new', to_jsonb(ARRAY(SELECT DISTINCT unnest(v_effective_ids) ORDER BY 1))
      )
    );
  ELSIF v_is_time_off THEN
    -- Ferias de pessoa sem recurso: a auditoria regista que nada foi ligado.
    v_assignee_diff := jsonb_build_object(
      'resource_id', jsonb_build_object('old', NULL, 'new', '[]'::jsonb)
    );
  END IF;

  -- ── Build combined diff: schedule_items snapshot + side effects ───────────
  v_diff := jsonb_build_object(
    'schedule_items', jsonb_build_object(
      'board_id',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.board_id)),
      'title',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.title)),
      'status',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.status)),
      'origin',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.origin)),
      'start_datetime',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.start_datetime)),
      'end_datetime',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.end_datetime)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_item.organization_id))
    )
  );

  IF v_resource_diff IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object('schedule_resources', v_resource_diff);
  END IF;
  IF v_assignee_diff IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object('schedule_item_assignees', v_assignee_diff);
  END IF;

  v_audit_org := COALESCE(v_item.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'schedule_items', v_item.id, v_audit_org, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_item;
END;
$$;

-- Mesmos grants de 20261204470000 (authenticated sim; PUBLIC e anon nao).
REVOKE ALL ON FUNCTION public.rpc_create_schedule_item(
  uuid, uuid, text, text, public.schedule_item_status, public.schedule_item_origin,
  timestamptz, timestamptz, boolean, uuid, uuid, uuid, uuid, uuid, text, numeric,
  numeric, text, integer, text[], text, jsonb, text, text, uuid[], uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_schedule_item(
  uuid, uuid, text, text, public.schedule_item_status, public.schedule_item_origin,
  timestamptz, timestamptz, boolean, uuid, uuid, uuid, uuid, uuid, text, numeric,
  numeric, text, integer, text[], text, jsonb, text, text, uuid[], uuid
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Conferencia
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_helper OID := to_regprocedure('public.resource_has_full_day_time_off_on(uuid, date, text)');
  v_old_helper OID := to_regprocedure('public.resource_has_time_off_on(uuid, date, text)');
  v_slots OID := to_regprocedure('public.get_resource_available_slots(uuid, date, integer, uuid, integer)');
  v_sister OID := to_regprocedure('public.get_resource_available_slots_excluding_item(uuid, date, integer, uuid, integer, uuid)');
  v_conflict OID := to_regprocedure('public.check_schedule_conflict(uuid, timestamp with time zone, timestamp with time zone, uuid)');
  v_ret TEXT;
  v_helper_def TEXT;
  v_slots_def TEXT;
  v_sister_def TEXT;
  v_conflict_def TEXT;
  v_create OID := to_regprocedure('public.rpc_create_schedule_item(uuid, uuid, text, text, public.schedule_item_status, public.schedule_item_origin, timestamptz, timestamptz, boolean, uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, text, integer, text[], text, jsonb, text, text, uuid[], uuid)');
  v_create_def TEXT;
  v_create_cfg TEXT;
  v_create_count INTEGER;
  v_cfg TEXT;
BEGIN
  IF v_helper IS NULL THEN
    RAISE EXCEPTION 'resource_has_full_day_time_off_on(uuid, date, text) nao existe';
  END IF;
  IF v_old_helper IS NOT NULL THEN
    RAISE EXCEPTION 'resource_has_time_off_on(uuid, date, text) ainda existe (trataria ferias com horas como dia inteiro)';
  END IF;
  IF v_slots IS NULL THEN
    RAISE EXCEPTION 'get_resource_available_slots(uuid, date, integer, uuid, integer) nao existe';
  END IF;
  IF v_sister IS NULL THEN
    RAISE EXCEPTION 'get_resource_available_slots_excluding_item(uuid, date, integer, uuid, integer, uuid) nao existe';
  END IF;
  IF v_conflict IS NULL THEN
    RAISE EXCEPTION 'check_schedule_conflict(uuid, timestamptz, timestamptz, uuid) nao existe';
  END IF;

  IF (SELECT p.prorettype FROM pg_proc p WHERE p.oid = v_helper) IS DISTINCT FROM to_regtype('boolean')::oid THEN
    SELECT p.prorettype::regtype::text INTO v_ret FROM pg_proc p WHERE p.oid = v_helper;
    RAISE EXCEPTION 'resource_has_full_day_time_off_on devolve %, esperado boolean', v_ret;
  END IF;

  IF (SELECT p.prorettype FROM pg_proc p WHERE p.oid = v_conflict) IS DISTINCT FROM to_regtype('boolean')::oid THEN
    SELECT p.prorettype::regtype::text INTO v_ret FROM pg_proc p WHERE p.oid = v_conflict;
    RAISE EXCEPTION 'check_schedule_conflict devolve %, esperado boolean', v_ret;
  END IF;

  -- search_path public, pg_temp nas tres funcoes SECURITY DEFINER reescritas.
  SELECT array_to_string(p.proconfig, ';')::text INTO v_cfg FROM pg_proc p WHERE p.oid = v_slots;
  IF v_cfg IS NULL OR v_cfg NOT LIKE '%search_path=public, pg_temp%' THEN
    RAISE EXCEPTION 'get_resource_available_slots sem search_path public, pg_temp';
  END IF;
  SELECT array_to_string(p.proconfig, ';')::text INTO v_cfg FROM pg_proc p WHERE p.oid = v_sister;
  IF v_cfg IS NULL OR v_cfg NOT LIKE '%search_path=public, pg_temp%' THEN
    RAISE EXCEPTION 'get_resource_available_slots_excluding_item sem search_path public, pg_temp';
  END IF;
  SELECT array_to_string(p.proconfig, ';')::text INTO v_cfg FROM pg_proc p WHERE p.oid = v_conflict;
  IF v_cfg IS NULL OR v_cfg NOT LIKE '%search_path=public, pg_temp%' THEN
    RAISE EXCEPTION 'check_schedule_conflict sem search_path public, pg_temp';
  END IF;

  IF (SELECT p.provolatile::text FROM pg_proc p WHERE p.oid = v_helper) IS DISTINCT FROM 's'
     OR (SELECT p.provolatile::text FROM pg_proc p WHERE p.oid = v_slots) IS DISTINCT FROM 's'
     OR (SELECT p.provolatile::text FROM pg_proc p WHERE p.oid = v_sister) IS DISTINCT FROM 's'
     OR (SELECT p.provolatile::text FROM pg_proc p WHERE p.oid = v_conflict) IS DISTINCT FROM 's' THEN
    RAISE EXCEPTION 'uma das funcoes deixou de ser STABLE';
  END IF;

  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_slots)
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_sister)
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_conflict) THEN
    RAISE EXCEPTION 'get_resource_available_slots, a irma _excluding_item ou check_schedule_conflict deixou de ser SECURITY DEFINER';
  END IF;

  -- A auxiliar so conta ferias de dia inteiro.
  v_helper_def := pg_get_functiondef(v_helper)::text;
  IF v_helper_def NOT LIKE '%si.all_day = true%' THEN
    RAISE EXCEPTION 'resource_has_full_day_time_off_on deixou de exigir all_day = true';
  END IF;

  -- As duas funcoes de horarios: saida por dia inteiro e bloqueio por horario
  -- das ferias com horas, guardado pela consulta unica do dia.
  v_slots_def := pg_get_functiondef(v_slots)::text;
  v_sister_def := pg_get_functiondef(v_sister)::text;
  IF v_slots_def NOT LIKE '%resource_has_full_day_time_off_on%'
     OR v_sister_def NOT LIKE '%resource_has_full_day_time_off_on%' THEN
    RAISE EXCEPTION 'get_resource_available_slots ou a irma _excluding_item nao chama resource_has_full_day_time_off_on';
  END IF;
  IF v_slots_def NOT LIKE '%IF v_has_partial THEN%'
     OR v_sister_def NOT LIKE '%IF v_has_partial THEN%'
     OR v_slots_def NOT LIKE '%NOT v_slot_on_time_off%'
     OR v_sister_def NOT LIKE '%NOT v_slot_on_time_off%' THEN
    RAISE EXCEPTION 'get_resource_available_slots ou a irma _excluding_item nao bloqueia horarios por ferias com horas';
  END IF;
  -- Limite a duracao (anti ciclo sem fim) nas duas funcoes de horarios.
  IF v_slots_def NOT LIKE '%p_duration_minutes IS NULL OR p_duration_minutes <= 0 OR p_duration_minutes > 1440%'
     OR v_sister_def NOT LIKE '%p_duration_minutes IS NULL OR p_duration_minutes <= 0 OR p_duration_minutes > 1440%' THEN
    RAISE EXCEPTION 'get_resource_available_slots ou a irma _excluding_item perdeu o limite a duracao (1 a 1440 minutos)';
  END IF;

  -- check_schedule_conflict: uma so consulta, os dois ramos, sem percorrer dias.
  v_conflict_def := pg_get_functiondef(v_conflict)::text;
  IF v_conflict_def NOT LIKE '%board_type = ''time_off''%' THEN
    RAISE EXCEPTION 'check_schedule_conflict nao consulta as ferias (quadro time_off)';
  END IF;
  IF v_conflict_def NOT LIKE '%si.all_day = true%'
     OR v_conflict_def NOT LIKE '%si.all_day IS NOT TRUE%' THEN
    RAISE EXCEPTION 'check_schedule_conflict nao distingue ferias de dia inteiro das com horas';
  END IF;
  IF v_conflict_def LIKE '%generate_series%' THEN
    RAISE EXCEPTION 'check_schedule_conflict voltou a percorrer o intervalo dia a dia';
  END IF;
  -- Intervalo maximo de 1 dia (falha fechada para intervalos maiores).
  IF v_conflict_def NOT LIKE '%IF (p_end - p_start) > INTERVAL ''1 day'' THEN%' THEN
    RAISE EXCEPTION 'check_schedule_conflict perdeu o limite de 1 dia ao intervalo';
  END IF;

  IF has_function_privilege('anon', v_helper, 'EXECUTE')
     OR has_function_privilege('authenticated', v_helper, 'EXECUTE')
     OR has_function_privilege('public', v_helper, 'EXECUTE') THEN
    RAISE EXCEPTION 'resource_has_full_day_time_off_on ficou executavel por anon/authenticated/PUBLIC';
  END IF;
  IF NOT has_function_privilege('service_role', v_helper, 'EXECUTE') THEN
    RAISE EXCEPTION 'resource_has_full_day_time_off_on nao e executavel por service_role';
  END IF;

  IF has_function_privilege('anon', v_sister, 'EXECUTE')
     OR has_function_privilege('authenticated', v_sister, 'EXECUTE')
     OR has_function_privilege('public', v_sister, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_resource_available_slots_excluding_item ficou executavel por anon/authenticated/PUBLIC';
  END IF;
  IF NOT has_function_privilege('service_role', v_sister, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_resource_available_slots_excluding_item nao e executavel por service_role';
  END IF;

  IF NOT (has_function_privilege('anon', v_slots, 'EXECUTE')
          AND has_function_privilege('authenticated', v_slots, 'EXECUTE')
          AND has_function_privilege('service_role', v_slots, 'EXECUTE')) THEN
    RAISE EXCEPTION 'get_resource_available_slots perdeu grants';
  END IF;

  IF NOT (has_function_privilege('anon', v_conflict, 'EXECUTE')
          AND has_function_privilege('authenticated', v_conflict, 'EXECUTE')
          AND has_function_privilege('service_role', v_conflict, 'EXECUTE')) THEN
    RAISE EXCEPTION 'check_schedule_conflict perdeu grants';
  END IF;

  -- Ferias rejeitadas deixam de ocupar pela atribuicao (as tres funcoes) e as
  -- ferias saem da capacidade diaria (as duas funcoes de horarios).
  IF v_conflict_def NOT LIKE '%IS DISTINCT FROM ''rejected'' OR NOT EXISTS (SELECT 1 FROM public.schedule_boards rb%'
     OR v_slots_def NOT LIKE '%IS DISTINCT FROM ''rejected'' OR NOT EXISTS (SELECT 1 FROM public.schedule_boards rb%'
     OR v_sister_def NOT LIKE '%IS DISTINCT FROM ''rejected'' OR NOT EXISTS (SELECT 1 FROM public.schedule_boards rb%' THEN
    RAISE EXCEPTION 'check_schedule_conflict, get_resource_available_slots ou a irma _excluding_item ainda deixa ferias rejeitadas ocupar pela atribuicao';
  END IF;
  IF v_slots_def NOT LIKE '%tb.board_type = ''time_off''%'
     OR v_sister_def NOT LIKE '%tb.board_type = ''time_off''%' THEN
    RAISE EXCEPTION 'get_resource_available_slots ou a irma _excluding_item ainda conta ferias na capacidade diaria';
  END IF;

  -- rpc_create_schedule_item: uma so versao, 26 argumentos, mesmo retorno,
  -- atributos, search_path e grants; com o ramo das ferias.
  IF v_create IS NULL THEN
    RAISE EXCEPTION 'rpc_create_schedule_item com os 26 argumentos nao existe';
  END IF;
  SELECT count(*) INTO v_create_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname::text = 'public'
    AND p.proname::text = 'rpc_create_schedule_item';
  IF v_create_count <> 1 THEN
    RAISE EXCEPTION 'ha mais de uma versao de rpc_create_schedule_item (o PostgREST deixaria de saber qual escolher)';
  END IF;
  IF (SELECT p.pronargs::integer FROM pg_proc p WHERE p.oid = v_create) <> 26 THEN
    RAISE EXCEPTION 'rpc_create_schedule_item deixou de ter 26 argumentos';
  END IF;
  IF (SELECT p.prorettype FROM pg_proc p WHERE p.oid = v_create) IS DISTINCT FROM to_regtype('public.schedule_items')::oid THEN
    RAISE EXCEPTION 'rpc_create_schedule_item deixou de devolver public.schedule_items';
  END IF;
  IF (SELECT p.proretset FROM pg_proc p WHERE p.oid = v_create) THEN
    RAISE EXCEPTION 'rpc_create_schedule_item passou a devolver um conjunto';
  END IF;
  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_create) THEN
    RAISE EXCEPTION 'rpc_create_schedule_item deixou de ser SECURITY DEFINER';
  END IF;
  IF (SELECT p.provolatile::text FROM pg_proc p WHERE p.oid = v_create) IS DISTINCT FROM 'v' THEN
    RAISE EXCEPTION 'rpc_create_schedule_item deixou de ser VOLATILE';
  END IF;
  SELECT array_to_string(p.proconfig, ';')::text INTO v_create_cfg FROM pg_proc p WHERE p.oid = v_create;
  IF v_create_cfg IS NULL OR v_create_cfg NOT LIKE '%search_path=public, pg_temp%' THEN
    RAISE EXCEPTION 'rpc_create_schedule_item perdeu o search_path public, pg_temp';
  END IF;
  IF has_function_privilege('anon', v_create, 'EXECUTE')
     OR has_function_privilege('public', v_create, 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_create_schedule_item ficou executavel por anon/PUBLIC';
  END IF;
  IF NOT has_function_privilege('authenticated', v_create, 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_create_schedule_item deixou de ser executavel por authenticated';
  END IF;

  v_create_def := pg_get_functiondef(v_create)::text;
  IF v_create_def NOT LIKE '%v_is_time_off := COALESCE(v_board_type = ''time_off'', false);%'
     OR v_create_def NOT LIKE '%IF v_is_time_off AND p_user_id IS NULL THEN%'
     OR v_create_def NOT LIKE '%invalid_parameter_value%'
     OR v_create_def NOT LIKE '%WHERE r.user_id = p_user_id%' THEN
    RAISE EXCEPTION 'rpc_create_schedule_item nao tem o ramo das ferias (colaborador obrigatorio e recursos da pessoa)';
  END IF;
  -- O ramo das ferias decide-se so pelo tipo do quadro, nao pela igualdade de
  -- organizacao.
  IF v_create_def LIKE '%b.organization_id = p_organization_id%' THEN
    RAISE EXCEPTION 'rpc_create_schedule_item voltou a exigir que o quadro seja de p_organization_id';
  END IF;
  -- Ferias novas nascem pendentes.
  IF v_create_def NOT LIKE '%v_approval := ''pending'';%'
     OR v_create_def LIKE '%p_time_off_type,%p_approval_status,%v_actor,%' THEN
    RAISE EXCEPTION 'rpc_create_schedule_item deixou de forcar pending nas ferias novas';
  END IF;
  -- Guardas de ambito: quadro e recursos pedidos de organizacoes visiveis.
  IF v_create_def NOT LIKE '%v_board_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))%' THEN
    RAISE EXCEPTION 'rpc_create_schedule_item perdeu a guarda de organizacao do quadro';
  END IF;
  IF v_create_def NOT LIKE '%unnest(p_assignee_resource_ids) AS req(resource_id)%'
     OR v_create_def NOT LIKE '%r.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))%' THEN
    RAISE EXCEPTION 'rpc_create_schedule_item perdeu a guarda de organizacao dos recursos pedidos';
  END IF;
  -- O fallback para o criador continua la para os outros quadros, mas so na
  -- organizacao do agendamento.
  IF v_create_def NOT LIKE '%WHERE user_id = v_actor%AND organization_id = p_organization_id%AND is_active = true%' THEN
    RAISE EXCEPTION 'rpc_create_schedule_item perdeu o recurso do criador por omissao, ou deixou de o procurar so na organizacao do agendamento';
  END IF;

  -- Nao se cria indice novo nesta migration (usa-se idx_schedule_items_user_id).
  IF to_regclass('public.idx_schedule_items_user_id') IS NULL THEN
    RAISE EXCEPTION 'idx_schedule_items_user_id nao existe; as consultas de ferias contam com ele';
  END IF;
END
$$;
