-- Corrige o significado de "antecedência mínima em horas úteis" (regra 1).
--
-- Desenho anterior: um contador que só avançava dentro do horário comercial
-- (09:00-18:00), pausando à noite e ao fim-de-semana -- 48h "úteis" podiam
-- esticar-se por mais de uma semana de calendário real se caíssem antes de
-- um fim-de-semana. Confirmado ao vivo (23/09) que isto não é o que se quer:
-- 48h a partir de quarta às 18:24 dava dia 1 de Outubro.
--
-- Desenho novo, escolhido explicitamente pelo utilizador: `agora + p_hours`
-- em horas reais de calendário, só ARREDONDADO PARA A FRENTE quando cai
-- fora do horário comercial (hora do dia, dia da semana, ou feriado) --
-- nunca pausa a meio da contagem. Mesma assinatura, mesmos chamadores
-- (get_resource_available_slots, find_nearest_resources,
-- get_month_availability) -- nenhum precisa de mudar.
CREATE OR REPLACE FUNCTION public.calculate_min_advance_datetime(
  p_organization_id uuid,
  p_from timestamptz,
  p_hours integer
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_working_days   INTEGER[];
  v_working_start  TIME;
  v_working_end    TIME;
  v_timezone       TEXT;
  v_target         TIMESTAMPTZ;
  v_local_date     DATE;
  v_local_time     TIME;
  v_dow            INTEGER;
  v_is_holiday     BOOLEAN;
  v_days_checked   INTEGER := 0;
  v_max_days       CONSTANT INTEGER := 90;
BEGIN
  IF p_hours IS NULL OR p_hours <= 0 THEN
    RETURN p_from;
  END IF;

  SELECT working_days, working_hours_start::TIME, working_hours_end::TIME, timezone
  INTO v_working_days, v_working_start, v_working_end, v_timezone
  FROM public.schedule_settings
  WHERE organization_id = p_organization_id
  LIMIT 1;

  v_target := p_from + make_interval(hours => p_hours);

  IF v_working_days IS NULL OR array_length(v_working_days, 1) IS NULL THEN
    RETURN v_target;
  END IF;

  v_timezone := COALESCE(v_timezone, 'Europe/Lisbon');

  -- Arredonda para a frente até cair num dia útil (dia da semana + não
  -- feriado) dentro do horário comercial. Nunca recua -- se v_target já
  -- está fora do horário (antes de abrir, depois de fechar, ou num dia não
  -- útil), avança para o próximo início de expediente válido.
  LOOP
    v_days_checked := v_days_checked + 1;
    EXIT WHEN v_days_checked > v_max_days; -- limite de segurança

    v_local_date := (v_target AT TIME ZONE v_timezone)::date;
    v_local_time := (v_target AT TIME ZONE v_timezone)::time;
    v_dow := EXTRACT(DOW FROM v_local_date)::integer;

    IF NOT (v_dow = ANY(v_working_days)) THEN
      -- Dia não útil: avança para o início do expediente do dia seguinte.
      v_target := ((v_local_date + 1)::text || ' ' || v_working_start::text)::timestamp AT TIME ZONE v_timezone;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.schedule_holidays h
      WHERE (h.organization_id = p_organization_id OR h.organization_id IS NULL)
        AND h.holiday_date = v_local_date
    ) INTO v_is_holiday;

    IF v_is_holiday THEN
      v_target := ((v_local_date + 1)::text || ' ' || v_working_start::text)::timestamp AT TIME ZONE v_timezone;
      CONTINUE;
    END IF;

    IF v_local_time < v_working_start THEN
      -- Antes de abrir, mesmo dia útil: arredonda para a abertura.
      v_target := (v_local_date::text || ' ' || v_working_start::text)::timestamp AT TIME ZONE v_timezone;
      EXIT;
    ELSIF v_local_time >= v_working_end THEN
      -- Depois de fechar: avança para o início do expediente do dia seguinte.
      v_target := ((v_local_date + 1)::text || ' ' || v_working_start::text)::timestamp AT TIME ZONE v_timezone;
      CONTINUE;
    ELSE
      -- Dentro do horário comercial, dia útil, sem feriado: já está válido.
      EXIT;
    END IF;
  END LOOP;

  RETURN v_target;
END;
$function$;

COMMENT ON FUNCTION public.calculate_min_advance_datetime(uuid, timestamptz, integer) IS
  'Data/hora mais cedo aceitavel para uma marcacao: p_from + p_hours em horas reais de calendario, arredondado para a frente para o proximo horario comercial valido quando cai fora dele (fora do horario do dia, dia nao util, ou feriado). Nunca pausa a meio da contagem. p_hours nulo ou <=0 devolve p_from (sem restricao). Sem schedule_settings configurado, devolve p_from + p_hours sem ajuste.';

-- Achado à parte (23/09), independente da regra 1: quando p_min_advance_hours
-- NÃO está configurado (a maioria dos formulários hoje), a função nunca
-- comparava nenhum horário candidato com a hora real actual -- só filtrava
-- conflitos de agenda. Resultado: o calendário público oferecia horários de
-- HOJE já passados (ex.: 09:00 quando já eram 18:20), em qualquer
-- organização, com ou sem a regra 1 ligada. Corrige-se aqui: o "mínimo
-- aceitável" passa a ser sempre pelo menos agora(), mesmo sem antecedência
-- mínima configurada -- só o valor calculado por calculate_min_advance_datetime
-- é que continua a depender da configuração.
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
  v_current_slot TIMESTAMPTZ;
  v_org_working_days INTEGER[];
  v_org_start TIME;
  v_org_end TIME;
  v_max_daily_capacity INTEGER;
  v_day_assigned_count INTEGER;
  v_min_advance_dt TIMESTAMPTZ;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_date);

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
  -- pelo menos "agora" como piso -- mesmo sem antecedencia configurada, um
  -- horario que ja passou nunca deve ser oferecido (achado 23/09, ver
  -- comentario na funcao calculate_min_advance_datetime acima).
  IF p_min_advance_hours IS NOT NULL AND p_organization_id IS NOT NULL THEN
    v_min_advance_dt := public.calculate_min_advance_datetime(p_organization_id, now(), p_min_advance_hours);
  ELSE
    v_min_advance_dt := now();
  END IF;

  -- Districts plan: daily capacity — same rule already enforced for the internal
  -- auto-schedule flow (supabase/functions/auto-schedule/index.ts), now also
  -- applied to the public availability/booking flow.
  SELECT max_daily_capacity INTO v_max_daily_capacity
  FROM public.schedule_resources
  WHERE id = p_resource_id;

  IF v_max_daily_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_day_assigned_count
    FROM public.schedule_items si
    JOIN public.schedule_item_assignees sia ON sia.item_id = si.id
    WHERE sia.resource_id = p_resource_id
      AND si.status NOT IN ('cancelled')
      AND si.start_datetime >= p_date::timestamptz
      AND si.start_datetime < (p_date + 1)::timestamptz;

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

  -- Generate slots and check conflicts
  v_current_slot := (p_date::TEXT || ' ' || v_working_start::TEXT)::TIMESTAMPTZ;

  WHILE v_current_slot + (p_duration_minutes || ' minutes')::INTERVAL <= (p_date::TEXT || ' ' || v_working_end::TEXT)::TIMESTAMPTZ LOOP
    v_slot_start := v_current_slot;
    v_slot_end := v_current_slot + (p_duration_minutes || ' minutes')::INTERVAL;

    IF v_slot_start >= v_min_advance_dt AND NOT EXISTS (
      SELECT 1 FROM public.schedule_items si
      JOIN public.schedule_item_assignees sia ON sia.item_id = si.id
      WHERE sia.resource_id = p_resource_id
        AND si.status NOT IN ('cancelled')
        AND si.start_datetime < v_slot_end
        AND si.end_datetime > v_slot_start
    ) THEN
      slot_start := v_slot_start;
      slot_end := v_slot_end;
      RETURN NEXT;
    END IF;

    v_current_slot := v_current_slot + '30 minutes'::INTERVAL;
  END LOOP;
END;
$function$;
