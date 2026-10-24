-- Horarios livres no fuso da organizacao (o horario configurado vale o ano todo).
--
-- SO BASE DE DADOS: nenhuma edge function precisa de mudar nem de ser publicada
-- (public-availability, book-slot, reschedule-booking, auto-schedule e o
-- assistente chamam estas funcoes). Quem tiver o calendario aberto no browser
-- com um horario que deixa de existir (o de verao, uma hora mais tarde) vai ver
-- esse horario recusado ao confirmar e tem de escolher outro.
--
-- DEFEITO: get_resource_available_slots e get_resource_available_slots_excluding_item
-- juntavam a data e a hora de trabalho e convertiam directamente para
-- timestamptz com a sessao da base em UTC, sem usar o fuso da organizacao. No
-- verao a janela 09:00-18:00 saia como 10:00-19:00 em Lisboa (visitas de 120
-- min: 10:00-17:00 em vez de 09:00-16:00); no inverno acertava. A capacidade
-- diaria delimitava o dia em UTC (mesmo defeito).
--
-- CORRECCAO (so a construcao dos instantes; todas as regras ficam iguais:
-- feriados, dias uteis, ausencias, antecedencia minima, capacidade,
-- sobreposicao e, na funcao irma, a exclusao da propria visita):
--   * fuso = schedule_settings.timezone da organizacao do parametro (se vier
--     nulo, a organizacao do recurso; se nao houver ou for invalido,
--     Europe/Lisbon);
--   * cada horario e (p_date + hora local) interpretado nesse fuso;
--   * passos de 30 em 30 minutos em hora local; o fim e o inicio mais a duracao
--     (intervalo absoluto);
--   * o dia da capacidade vai da meia-noite local a meia-noite local seguinte
--     (dias de 23h e 25h ficam certos);
--   * horas que nao existem ou se repetem na mudanca de hora ficam de fora;
--   * "agora" e absoluto e nao muda.
-- Nao altera dados nem mais nenhuma funcao. Grants como estavam: a principal
-- executavel por todos, a irma so por service_role.

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
SET search_path TO 'public'
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
BEGIN
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
  IF v_tz IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    v_tz := 'Europe/Lisbon';
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
      AND si.start_datetime < v_day_end;

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

  -- Generate slots (hora local no fuso da org) and check conflicts
  v_local_cur := p_date + v_working_start;
  v_window_end := (p_date + v_working_end) AT TIME ZONE v_tz;

  LOOP
    v_slot_start := v_local_cur AT TIME ZONE v_tz;
    v_slot_end := v_slot_start + (p_duration_minutes || ' minutes')::INTERVAL;
    EXIT WHEN v_slot_end > v_window_end;

    -- Hora que nao existe (salto para a frente) ou que se repete (recuo) na
    -- mudanca de hora: fica fora da janela.
    IF (v_slot_start AT TIME ZONE v_tz) = v_local_cur
       AND (v_slot_start - INTERVAL '1 hour') AT TIME ZONE v_tz <> v_local_cur
       AND (v_slot_start + INTERVAL '1 hour') AT TIME ZONE v_tz <> v_local_cur
       AND v_slot_start >= v_min_advance_dt
       AND NOT EXISTS (
         SELECT 1 FROM public.schedule_items si
         JOIN public.schedule_item_assignees sia ON sia.item_id = si.id
         WHERE sia.resource_id = p_resource_id
           AND si.status NOT IN ('cancelled')
           AND si.start_datetime < v_slot_end
           AND si.end_datetime > v_slot_start
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
SET search_path TO 'public'
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
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_date);

  v_tz_org := COALESCE(
    p_organization_id,
    (SELECT organization_id FROM public.schedule_resources WHERE id = p_resource_id)
  );
  SELECT NULLIF(btrim(timezone), '') INTO v_tz
  FROM public.schedule_settings
  WHERE organization_id = v_tz_org
  LIMIT 1;
  IF v_tz IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    v_tz := 'Europe/Lisbon';
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
      AND si.start_datetime < v_day_end;

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

  v_local_cur := p_date + v_working_start;
  v_window_end := (p_date + v_working_end) AT TIME ZONE v_tz;

  LOOP
    v_slot_start := v_local_cur AT TIME ZONE v_tz;
    v_slot_end := v_slot_start + (p_duration_minutes || ' minutes')::INTERVAL;
    EXIT WHEN v_slot_end > v_window_end;

    IF (v_slot_start AT TIME ZONE v_tz) = v_local_cur
       AND (v_slot_start - INTERVAL '1 hour') AT TIME ZONE v_tz <> v_local_cur
       AND (v_slot_start + INTERVAL '1 hour') AT TIME ZONE v_tz <> v_local_cur
       AND v_slot_start >= v_min_advance_dt
       AND NOT EXISTS (
         SELECT 1 FROM public.schedule_items si
         JOIN public.schedule_item_assignees sia ON sia.item_id = si.id
         WHERE sia.resource_id = p_resource_id
           AND si.status NOT IN ('cancelled')
           AND si.id IS DISTINCT FROM p_exclude_item_id
           AND si.start_datetime < v_slot_end
           AND si.end_datetime > v_slot_start
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

-- Conferencia: as duas existem, usam o fuso da organizacao, e a irma nao fica
-- executavel por anon/authenticated/PUBLIC.
DO $$
DECLARE
  v_main OID := to_regprocedure('public.get_resource_available_slots(uuid, date, integer, uuid, integer)');
  v_sister OID := to_regprocedure('public.get_resource_available_slots_excluding_item(uuid, date, integer, uuid, integer, uuid)');
BEGIN
  IF v_main IS NULL THEN
    RAISE EXCEPTION 'get_resource_available_slots nao existe';
  END IF;
  IF v_sister IS NULL THEN
    RAISE EXCEPTION 'get_resource_available_slots_excluding_item nao existe';
  END IF;
  IF pg_get_functiondef(v_main) NOT LIKE '%AT TIME ZONE v_tz%'
     OR pg_get_functiondef(v_sister) NOT LIKE '%AT TIME ZONE v_tz%' THEN
    RAISE EXCEPTION 'as funcoes de horarios nao usam o fuso da organizacao';
  END IF;
  IF has_function_privilege('anon', v_sister, 'EXECUTE')
     OR has_function_privilege('authenticated', v_sister, 'EXECUTE')
     OR has_function_privilege('public', v_sister, 'EXECUTE') THEN
    RAISE EXCEPTION 'a funcao irma ficou executavel por anon/authenticated/PUBLIC';
  END IF;
  IF NOT has_function_privilege('service_role', v_sister, 'EXECUTE') THEN
    RAISE EXCEPTION 'a funcao irma nao e executavel por service_role';
  END IF;
  IF NOT (has_function_privilege('anon', v_main, 'EXECUTE')
          AND has_function_privilege('authenticated', v_main, 'EXECUTE')
          AND has_function_privilege('service_role', v_main, 'EXECUTE')) THEN
    RAISE EXCEPTION 'a funcao principal perdeu grants';
  END IF;
END
$$;
