-- Disponibilidade de um recurso EXCLUINDO uma visita (reagendamento).
--
-- get_resource_available_slots conta a visita que se quer mover contra si
-- propria: a capacidade diaria inclui-a (um dia cheio "por causa dela" recusa
-- mover a visita dentro do mesmo dia) e o horario que sobrepoe a hora antiga
-- nunca e oferecido. Para o reagendamento pelo link publico isso e falso: a
-- visita sai de la.
--
-- Funcao NOVA, com nome proprio (sem sobrecarga da existente, para o PostgREST
-- nao ficar sem saber qual escolher). Corpo igual ao de
-- get_resource_available_slots (20261204240000) com uma unica diferenca: a
-- visita p_exclude_item_id nao conta para a capacidade nem para a sobreposicao.
-- Nao altera nenhuma funcao existente nem dados.
--
-- DEPENDENCIA: reschedule-booking e public-availability chamam-na, e caem na
-- funcao antiga (com o defeito acima) enquanto esta migration nao estiver
-- aplicada -- por isso podem ser publicadas antes ou depois.

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
  v_current_slot TIMESTAMPTZ;
  v_org_working_days INTEGER[];
  v_org_start TIME;
  v_org_end TIME;
  v_max_daily_capacity INTEGER;
  v_day_assigned_count INTEGER;
  v_min_advance_dt TIMESTAMPTZ;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_date);

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
      AND si.start_datetime >= p_date::timestamptz
      AND si.start_datetime < (p_date + 1)::timestamptz;

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

  v_current_slot := (p_date::TEXT || ' ' || v_working_start::TEXT)::TIMESTAMPTZ;

  WHILE v_current_slot + (p_duration_minutes || ' minutes')::INTERVAL <= (p_date::TEXT || ' ' || v_working_end::TEXT)::TIMESTAMPTZ LOOP
    v_slot_start := v_current_slot;
    v_slot_end := v_current_slot + (p_duration_minutes || ' minutes')::INTERVAL;

    IF v_slot_start >= v_min_advance_dt AND NOT EXISTS (
      SELECT 1 FROM public.schedule_items si
      JOIN public.schedule_item_assignees sia ON sia.item_id = si.id
      WHERE sia.resource_id = p_resource_id
        AND si.status NOT IN ('cancelled')
        AND si.id IS DISTINCT FROM p_exclude_item_id
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

-- So as edge functions (service_role) a usam.
REVOKE ALL ON FUNCTION public.get_resource_available_slots_excluding_item(uuid, date, integer, uuid, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_resource_available_slots_excluding_item(uuid, date, integer, uuid, integer, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_resource_available_slots_excluding_item(uuid, date, integer, uuid, integer, uuid) TO service_role;
