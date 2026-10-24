-- Regra de negocio: antecedencia minima configuravel para o passo de
-- agendamento (em horas uteis), e interruptores de SMS ao lado dos de
-- email ja existentes em form_branding.
--
-- Tudo aditivo e desligado por omissao: scheduling_min_advance_hours nasce
-- NULL (sem restricao, comportamento identico ao que existia antes desta
-- migration) e os dois interruptores de SMS nascem false, tal como os de
-- email ja nascem false hoje. Nenhum formulario/campanha existente muda de
-- comportamento sem alguem ir la configurar.
--
-- get_resource_available_slots, find_nearest_resources e
-- get_month_availability recebem um novo parametro final com omissao NULL
-- -- CREATE OR REPLACE sem DROP chega aqui porque so se acrescenta um
-- parametro no fim, ao contrario da mudanca de p_district_id
-- (20261110640000) que reordenou argumentos e por isso precisou de DROP.

ALTER TABLE public.form_steps
  ADD COLUMN IF NOT EXISTS scheduling_min_advance_hours INTEGER;

COMMENT ON COLUMN public.form_steps.scheduling_min_advance_hours IS
  'Antecedencia minima, em horas uteis, para o passo de agendamento aceitar um horario. NULL (omissao) = sem antecedencia minima. Horas uteis contadas pelo calendario da organizacao (schedule_settings.working_days/working_hours_start/end + schedule_holidays), via calculate_min_advance_datetime().';

ALTER TABLE public.form_branding
  ADD COLUMN IF NOT EXISTS confirmation_sms_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_sms_enabled     BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.form_branding.confirmation_sms_enabled IS
  'Envia SMS de confirmacao de marcacao, alem do email (confirmation_email_enabled). Desligado por omissao.';
COMMENT ON COLUMN public.form_branding.reminder_sms_enabled IS
  'Envia SMS de lembrete antes da visita, na mesma hora configurada em reminder_hours_before, alem do email (reminder_enabled). Desligado por omissao.';

-- Devolve a data/hora mais cedo aceitavel para uma marcacao, contando
-- p_hours horas UTEIS a partir de p_from segundo o calendario da
-- organizacao (dias uteis, horario de trabalho, feriados). p_hours nulo ou
-- <=0 devolve p_from (sem restricao) -- e o que faz esta funcao ser segura
-- de chamar sempre, mesmo quando a antecedencia minima nao esta
-- configurada. Percorre dia a dia, com um limite de seguranca de 90 dias:
-- se a organizacao nao tiver calendario configurado (working_days nulo/
-- vazio), ou no caso anormal de esgotar os 90 dias sem fechar as horas
-- pedidas (ex.: feriados a cobrir esse periodo todo), cai para horas
-- corridas em vez de nunca terminar ou devolver um valor enganoso.
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
  v_remaining      NUMERIC;
  v_day            DATE;
  v_day_start      TIMESTAMPTZ;
  v_day_end        TIMESTAMPTZ;
  v_window_start   TIMESTAMPTZ;
  v_hours_today    NUMERIC;
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

  IF v_working_days IS NULL OR array_length(v_working_days, 1) IS NULL THEN
    RETURN p_from + make_interval(hours => p_hours);
  END IF;

  v_remaining := p_hours;
  v_day := p_from::date;
  v_timezone := COALESCE(v_timezone, 'Europe/Lisbon');

  WHILE v_remaining > 0 AND v_days_checked < v_max_days LOOP
    v_dow := EXTRACT(DOW FROM v_day)::integer; -- 0=domingo..6=sabado, igual ao resto do modulo (get_resource_available_slots usa o mesmo EXTRACT(DOW))
    v_days_checked := v_days_checked + 1;

    IF v_dow = ANY(v_working_days) THEN
      SELECT EXISTS (
        SELECT 1 FROM public.schedule_holidays h
        WHERE (h.organization_id = p_organization_id OR h.organization_id IS NULL)
          AND h.holiday_date = v_day
      ) INTO v_is_holiday;

      IF NOT v_is_holiday THEN
        v_day_start := (v_day::text || ' ' || v_working_start::text)::timestamp AT TIME ZONE v_timezone;
        v_day_end   := (v_day::text || ' ' || v_working_end::text)::timestamp AT TIME ZONE v_timezone;
        v_window_start := GREATEST(v_day_start, p_from);

        IF v_day_end > v_window_start THEN
          v_hours_today := EXTRACT(EPOCH FROM (v_day_end - v_window_start)) / 3600.0;
          IF v_hours_today >= v_remaining THEN
            RETURN v_window_start + (v_remaining || ' hours')::interval;
          ELSE
            v_remaining := v_remaining - v_hours_today;
          END IF;
        END IF;
      END IF;
    END IF;

    v_day := v_day + 1;
  END LOOP;

  -- Limite de seguranca atingido -- nunca deveria acontecer com um
  -- calendario real (exigiria ~90 dias seguidos sem nenhum dia util livre).
  RETURN (v_day::text || ' ' || v_working_end::text)::timestamp AT TIME ZONE v_timezone;
END;
$function$;

COMMENT ON FUNCTION public.calculate_min_advance_datetime(uuid, timestamptz, integer) IS
  'Data/hora mais cedo aceitavel para uma marcacao, contando p_hours horas uteis a partir de p_from pelo calendario da organizacao. p_hours nulo ou <=0 devolve p_from (sem restricao). Sem schedule_settings configurado, cai para horas corridas.';

GRANT EXECUTE ON FUNCTION public.calculate_min_advance_datetime(uuid, timestamptz, integer) TO authenticated, anon, service_role;

-- get_resource_available_slots: acrescenta p_min_advance_hours no fim,
-- omissao NULL. Corpo identico ao que ja estava em vigor no remoto
-- (confirmado por pg_get_functiondef antes de escrever esta migration),
-- com uma unica linha nova: o filtro de antecedencia minima dentro do
-- WHILE que gera os slots candidatos.
--
-- CORRECAO: acrescentar um parametro no fim muda a lista de tipos da
-- assinatura, por isso CREATE OR REPLACE sozinho NAO substitui a versao
-- antiga -- cria uma segunda sobrecarga, e uma chamada com o numero antigo
-- de argumentos fica ambigua (confirmado ao vivo: "function ... is not
-- unique"). Precisa mesmo de DROP FUNCTION antes, tal como o precedente de
-- p_district_id em 20261110640000 -- ao contrario do que o comentario
-- original desta migration assumia.
DROP FUNCTION IF EXISTS public.get_resource_available_slots(uuid, date, integer, uuid);

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

  -- Regra 1: antecedencia minima configuravel (horas uteis). Calculado uma
  -- vez por chamada; NULL/<=0 devolve p_from tal e qual, ou seja sem
  -- restricao -- comportamento identico ao que existia antes desta coluna
  -- para qualquer passo de agendamento que a deixe por preencher.
  IF p_min_advance_hours IS NOT NULL AND p_organization_id IS NOT NULL THEN
    v_min_advance_dt := public.calculate_min_advance_datetime(p_organization_id, now(), p_min_advance_hours);
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

    IF (v_min_advance_dt IS NULL OR v_slot_start >= v_min_advance_dt) AND NOT EXISTS (
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

-- find_nearest_resources: acrescenta p_min_advance_hours no fim, omissao
-- NULL, propagado para a chamada interna a get_resource_available_slots.
-- Resto do corpo identico ao de 20261110640000. DROP antes, mesmo motivo
-- explicado acima em get_resource_available_slots.
DROP FUNCTION IF EXISTS public.find_nearest_resources(uuid, text, date, integer, integer, uuid);

CREATE OR REPLACE FUNCTION public.find_nearest_resources(
  p_board_id uuid,
  p_target_postal_code text DEFAULT NULL::text,
  p_target_date date DEFAULT NULL::date,
  p_duration_minutes integer DEFAULT 60,
  p_limit integer DEFAULT 10,
  p_district_id uuid DEFAULT NULL::uuid,
  p_min_advance_hours integer DEFAULT NULL::integer
)
RETURNS TABLE(resource_id uuid, resource_name text, resource_type text, distance_km numeric, available_slots jsonb, priority integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target_lat decimal;
  v_target_lng decimal;
  v_target_prefix varchar(4);
  v_board_org_id uuid;
  v_has_postal boolean;
  v_district_has_coverage boolean;
BEGIN
  IF p_target_date IS NULL THEN
    RETURN;
  END IF;

  -- Get the organization_id from the board
  SELECT organization_id INTO v_board_org_id
  FROM schedule_boards
  WHERE id = p_board_id
  LIMIT 1;

  v_has_postal := p_target_postal_code IS NOT NULL AND p_target_postal_code != '';

  IF v_has_postal THEN
    -- Extract prefix from target postal code
    v_target_prefix := LEFT(REPLACE(p_target_postal_code, '-', ''), 4);

    -- Get coordinates from postal_codes table (avg for the prefix)
    SELECT AVG(latitude), AVG(longitude) INTO v_target_lat, v_target_lng
    FROM postal_codes
    WHERE postal_code = v_target_prefix
      AND latitude IS NOT NULL;

    -- Fallback: try first 2 digits (e.g. 1050 -> 10xx)
    IF v_target_lat IS NULL THEN
      SELECT AVG(latitude), AVG(longitude) INTO v_target_lat, v_target_lng
      FROM postal_codes
      WHERE LEFT(postal_code, 2) = LEFT(v_target_prefix, 2)
        AND latitude IS NOT NULL;
    END IF;

    -- Postal code given but unresolvable to coordinates: degrade to
    -- non-distance mode instead of returning nothing (district filter, if
    -- any, still applies below).
    IF v_target_lat IS NULL THEN
      v_has_postal := false;
    END IF;
  END IF;

  -- Districts plan: only restrict by district when it has active coverage —
  -- a district with zero configured resources must never yield empty
  -- availability, it falls back to all active org resources.
  v_district_has_coverage := false;
  IF p_district_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM resource_districts rd
      JOIN schedule_resources sr ON sr.id = rd.resource_id
      WHERE rd.district_id = p_district_id
        AND rd.is_active = true
        AND sr.organization_id = v_board_org_id
        AND sr.is_active = true
    ) INTO v_district_has_coverage;
  END IF;

  RETURN QUERY
  WITH resource_best_distance AS (
    SELECT
      sr.id as res_id,
      sr.name as res_name,
      sr.resource_type as res_type,
      CASE WHEN v_has_postal THEN
        MIN(
          COALESCE(
            calculate_distance_km(
              v_target_lat, v_target_lng,
              pc.latitude,
              pc.longitude
            ),
            999999
          )
        )
      ELSE NULL END as dist_km,
      MAX(COALESCE(rsa.priority, 1)) as res_priority,
      BOOL_OR(
        v_has_postal
        AND rsa.max_distance_km IS NOT NULL
        AND calculate_distance_km(v_target_lat, v_target_lng, pc.latitude, pc.longitude) > rsa.max_distance_km
      ) as exceeds_max_distance
    FROM schedule_resources sr
    LEFT JOIN resource_service_areas rsa ON rsa.resource_id = sr.id AND rsa.is_active = true AND v_has_postal
    LEFT JOIN LATERAL (
      SELECT AVG(p.latitude) as latitude, AVG(p.longitude) as longitude
      FROM postal_codes p
      WHERE p.postal_code = rsa.postal_code_prefix
        AND p.latitude IS NOT NULL
    ) pc ON true
    WHERE sr.organization_id = v_board_org_id
      AND sr.is_active = true
      AND (
        p_district_id IS NULL
        OR NOT v_district_has_coverage
        OR sr.id IN (
          SELECT rd.resource_id FROM resource_districts rd
          WHERE rd.district_id = p_district_id AND rd.is_active = true
        )
      )
    GROUP BY sr.id, sr.name, sr.resource_type
  ),
  resource_availability AS (
    SELECT
      rd.res_id,
      rd.res_name,
      rd.res_type,
      rd.dist_km,
      rd.res_priority,
      rd.exceeds_max_distance,
      (
        SELECT jsonb_agg(jsonb_build_object('start', slot_start, 'end', slot_end))
        FROM get_resource_available_slots(rd.res_id, p_target_date, p_duration_minutes, v_board_org_id, p_min_advance_hours)
      ) as slots
    FROM resource_best_distance rd
    WHERE rd.exceeds_max_distance IS NOT TRUE
  )
  SELECT
    ra.res_id,
    ra.res_name,
    ra.res_type,
    ra.dist_km,
    COALESCE(ra.slots, '[]'::jsonb) as available_slots,
    ra.res_priority
  FROM resource_availability ra
  WHERE ra.slots IS NOT NULL AND jsonb_array_length(ra.slots) > 0
  ORDER BY ra.res_priority DESC, ra.dist_km ASC NULLS LAST, jsonb_array_length(ra.slots) DESC
  LIMIT p_limit;
END;
$function$;

-- get_month_availability: acrescenta p_min_advance_hours no fim, omissao
-- NULL, propagado para find_nearest_resources e para a chamada directa a
-- get_resource_available_slots no ramo sem codigo postal/distrito. Sem
-- isto, o calendario mensal mostraria um dia como "tem horarios" mesmo
-- quando todos ficam dentro da antecedencia minima -- o visitante clicava
-- e via o dia vazio. DROP antes, mesmo motivo explicado acima.
DROP FUNCTION IF EXISTS public.get_month_availability(uuid, date, date, integer, text, uuid);

CREATE OR REPLACE FUNCTION public.get_month_availability(
  p_board_id uuid,
  p_start_date date,
  p_end_date date,
  p_duration_minutes integer DEFAULT 60,
  p_postal_code text DEFAULT NULL::text,
  p_district_id uuid DEFAULT NULL::uuid,
  p_min_advance_hours integer DEFAULT NULL::integer
)
RETURNS TABLE(available_date date, has_slots boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_working_days INTEGER[];
  v_current_date date;
  v_day_of_week INTEGER;
  v_has_slots boolean;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM schedule_boards
  WHERE id = p_board_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT working_days INTO v_working_days
  FROM schedule_settings
  WHERE organization_id = v_org_id
  LIMIT 1;

  v_working_days := COALESCE(v_working_days, ARRAY[1,2,3,4,5]);

  v_current_date := p_start_date;
  WHILE v_current_date <= p_end_date LOOP
    v_day_of_week := EXTRACT(DOW FROM v_current_date);

    IF NOT (v_day_of_week = ANY(v_working_days)) THEN
      available_date := v_current_date;
      has_slots := false;
      RETURN NEXT;
      v_current_date := v_current_date + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM schedule_holidays
      WHERE (organization_id = v_org_id OR organization_id IS NULL)
        AND holiday_date = v_current_date
    ) THEN
      available_date := v_current_date;
      has_slots := false;
      RETURN NEXT;
      v_current_date := v_current_date + 1;
      CONTINUE;
    END IF;

    v_has_slots := false;

    IF (p_postal_code IS NOT NULL AND p_postal_code != '') OR p_district_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM find_nearest_resources(
          p_board_id, p_postal_code, v_current_date, p_duration_minutes, 1, p_district_id, p_min_advance_hours
        )
      ) THEN
        v_has_slots := true;
      END IF;
    ELSE
      IF EXISTS (
        SELECT 1
        FROM schedule_resources sr
        CROSS JOIN LATERAL get_resource_available_slots(sr.id, v_current_date, p_duration_minutes, v_org_id, p_min_advance_hours) slots
        WHERE sr.organization_id = v_org_id AND sr.is_active = true
        LIMIT 1
      ) THEN
        v_has_slots := true;
      END IF;
    END IF;

    available_date := v_current_date;
    has_slots := v_has_slots;
    RETURN NEXT;
    v_current_date := v_current_date + 1;
  END LOOP;
END;
$function$;
