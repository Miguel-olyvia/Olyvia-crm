-- Negócio (4/11/2026, Rúben: «as horas podem ser o dia todo, não somente até às 17h»): as horas livres de quem vai a uma visita do negócio
-- deixam de estar presas ao horário da organização.
--
-- get_resource_available_slots (20261204780000) só dá horas dentro da disponibilidade do recurso (resource_availability_rules) ou, sem ela,
-- do horário da organização (schedule_settings, 09:00 às 18:00 por omissão), e só nos dias de trabalho. É a mesma função da marcação
-- pública, por isso não se mexe nela.
--
-- O que muda (a base só cresce; nada se apaga):
--   neg_horas_livres_visita(p_resource_id, p_date, p_duration_minutes, p_organization_id, p_exclude_item_id): as horas livres de UM recurso
--   para uma visita do negócio, das 00:00 às 24:00 do dia (fuso da organização), de 30 em 30 minutos:
--     · sem horário da organização, sem dias de trabalho, sem pausa de almoço e sem a disponibilidade semanal do recurso;
--     · conta o que ocupa o recurso: as marcações (schedule_items não canceladas, menos a que se remarca), as ausências (resource_time_off:
--       o dia todo fecha o dia; com horas, tira só essas horas) e a capacidade diária (max_daily_capacity);
--     · os feriados da organização continuam fechados; as horas que já passaram não saem.
--   Só para quem pode ver os negócios da organização (fn_cat_exigir 'pessoas.view'), e só recursos dessa organização.
-- No ecrã (useHorasLivresVisita.ts): sem esta função (por colar), continua como antes, com o horário da organização.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.neg_horas_livres_visita(
  p_resource_id uuid,
  p_date date,
  p_duration_minutes integer,
  p_organization_id uuid,
  p_exclude_item_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(slot_start timestamp with time zone, slot_end timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text;
  v_cap integer;
  v_n integer;
  v_local_cur timestamp;
  v_fim_local timestamp;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_day_start timestamptz;
  v_day_end timestamptz;
BEGIN
  PERFORM public.fn_cat_exigir(p_organization_id, 'pessoas.view');
  IF p_resource_id IS NULL OR p_date IS NULL OR coalesce(p_duration_minutes, 0) <= 0 OR p_duration_minutes > 24 * 60 THEN
    RETURN;
  END IF;
  -- só recursos desta organização
  SELECT max_daily_capacity INTO v_cap FROM public.schedule_resources WHERE id = p_resource_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT NULLIF(btrim(timezone), '') INTO v_tz FROM public.schedule_settings WHERE organization_id = p_organization_id LIMIT 1;
  IF v_tz IS NULL THEN
    v_tz := 'Europe/Lisbon';
  ELSE
    BEGIN
      PERFORM now() AT TIME ZONE v_tz;
    EXCEPTION WHEN invalid_parameter_value THEN
      v_tz := 'Europe/Lisbon';
    END;
  END IF;

  -- feriados da organização (ou gerais): fechado
  IF EXISTS (SELECT 1 FROM public.schedule_holidays WHERE (organization_id = p_organization_id OR organization_id IS NULL) AND holiday_date = p_date) THEN
    RETURN;
  END IF;
  -- ausência do dia todo: fechado
  IF EXISTS (SELECT 1 FROM public.resource_time_off WHERE resource_id = p_resource_id AND start_date <= p_date AND end_date >= p_date AND all_day IS NOT FALSE) THEN
    RETURN;
  END IF;

  v_day_start := p_date::timestamp AT TIME ZONE v_tz;
  v_day_end := (p_date + 1)::timestamp AT TIME ZONE v_tz;
  IF v_cap IS NOT NULL THEN
    SELECT count(*) INTO v_n
      FROM public.schedule_items si JOIN public.schedule_item_assignees sia ON sia.item_id = si.id
     WHERE sia.resource_id = p_resource_id AND si.status NOT IN ('cancelled') AND si.id IS DISTINCT FROM p_exclude_item_id
       AND si.start_datetime >= v_day_start AND si.start_datetime < v_day_end;
    IF v_n >= v_cap THEN
      RETURN;
    END IF;
  END IF;

  v_local_cur := p_date::timestamp;
  v_fim_local := (p_date + 1)::timestamp;
  LOOP
    EXIT WHEN v_local_cur + make_interval(mins => p_duration_minutes) > v_fim_local;
    v_slot_start := v_local_cur AT TIME ZONE v_tz;
    v_slot_end := v_slot_start + make_interval(mins => p_duration_minutes);
    -- as horas que não existem ou se repetem na mudança da hora não saem (como em get_resource_available_slots)
    IF (v_slot_start AT TIME ZONE v_tz) = v_local_cur
       AND (v_slot_start - INTERVAL '1 hour') AT TIME ZONE v_tz <> v_local_cur
       AND (v_slot_start + INTERVAL '1 hour') AT TIME ZONE v_tz <> v_local_cur
       AND v_slot_start >= now()
       AND NOT EXISTS (
         SELECT 1 FROM public.schedule_items si JOIN public.schedule_item_assignees sia ON sia.item_id = si.id
          WHERE sia.resource_id = p_resource_id AND si.status NOT IN ('cancelled') AND si.id IS DISTINCT FROM p_exclude_item_id
            AND si.start_datetime < v_slot_end AND si.end_datetime > v_slot_start)
       AND NOT EXISTS (
         -- uma ausência com horas: só essas horas (de cada dia da ausência)
         SELECT 1 FROM public.resource_time_off t
          WHERE t.resource_id = p_resource_id AND t.start_date <= p_date AND t.end_date >= p_date AND t.all_day IS FALSE
            AND t.start_time IS NOT NULL AND t.end_time IS NOT NULL
            AND (p_date + t.start_time) AT TIME ZONE v_tz < v_slot_end AND (p_date + t.end_time) AT TIME ZONE v_tz > v_slot_start)
    THEN
      slot_start := v_slot_start;
      slot_end := v_slot_end;
      RETURN NEXT;
    END IF;
    v_local_cur := v_local_cur + INTERVAL '30 minutes';
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_horas_livres_visita(uuid, date, integer, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_horas_livres_visita(uuid, date, integer, uuid, uuid) TO authenticated, service_role;

-- Conferência: existe, usa o fuso da organização e não é de anon.
DO $conferir$
DECLARE v oid := to_regprocedure('public.neg_horas_livres_visita(uuid, date, integer, uuid, uuid)');
BEGIN
  IF v IS NULL THEN RAISE EXCEPTION 'Conferir: neg_horas_livres_visita não existe.'; END IF;
  IF pg_get_functiondef(v) NOT LIKE '%AT TIME ZONE v_tz%' THEN RAISE EXCEPTION 'Conferir: neg_horas_livres_visita não usa o fuso da organização.'; END IF;
  IF has_function_privilege('anon', v, 'EXECUTE') THEN RAISE EXCEPTION 'Conferir: anon não pode executar neg_horas_livres_visita.'; END IF;
END $conferir$;
