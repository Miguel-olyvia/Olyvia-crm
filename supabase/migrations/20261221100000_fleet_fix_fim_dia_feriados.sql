-- ============================================================================
-- Frota: itens de dia inteiro terminam dentro do proprio ultimo dia
-- ============================================================================
-- Bug: fn_fleet_sync_schedule_item gravava end_datetime = 00:00 (Lisboa) do dia
-- SEGUINTE ao ultimo dia. O gatilho trg_prevent_schedule_items_on_holidays
-- (prevent_schedule_items_on_holidays) converte end_datetime para data local e
-- conta esse dia, por isso uma reserva/manutencao na vespera de um feriado era
-- recusada (tambem ao concluir/cancelar, porque o gatilho corre em UPDATE OF
-- status).
--
-- Correcao (so na Frota; gatilho de feriados e funcoes da Agenda intactos):
--   * fim = ultimo dia + 23:59 em Europe/Lisbon, igual ao ScheduleItemDialog da
--     Agenda (dia inteiro grava T00:00 -> T23:59 local).
--   * no ramo UPDATE volta a carimbar metadata.source='fleet' e
--     fleet_vehicle_id (o INSERT ja o fazia; um item editado na Agenda podia
--     perder a marca).
--
-- Sem impacto noutras leituras: fn_fleet_vehicle_blockers ignora os itens
-- source='fleet' e, para os outros, usa (end - 1us)::date, que da o mesmo dia
-- com fim 23:59 ou 00:00 do dia seguinte.
--
-- Itens existentes nao sao alterados (1 item da Frota a data de preparacao;
-- e corrigido sozinho na proxima chamada a fn_fleet_sync_schedule_item).
--
-- SECURITY DEFINER, search_path, assinatura e permissoes iguais (CREATE OR
-- REPLACE mantem o ACL: postgres + service_role).
-- Rollback: C:\Olyvia\vault\frota-rollback-fix-feriados.sql
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- Guarda: a funcao ao vivo tem de ser exatamente a que serviu de base.
DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.fn_fleet_sync_schedule_item(uuid, uuid, text, date, date, public.schedule_item_status, uuid, jsonb)'::regprocedure))
    INTO v_md5;
  IF v_md5 IS DISTINCT FROM '822497109a911a889d04b240eea448b4' THEN
    RAISE EXCEPTION 'fn_fleet_sync_schedule_item mudou desde a preparacao desta migracao (md5 ao vivo %, esperado 822497109a911a889d04b240eea448b4). Rever antes de aplicar.', v_md5;
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.fn_fleet_sync_schedule_item(p_vehicle_id uuid, p_item_id uuid, p_title text, p_from date, p_to date, p_status schedule_item_status, p_user_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_res   uuid;
  v_org   uuid;
  v_item  uuid := p_item_id;
  v_start timestamptz := (p_from::timestamp AT TIME ZONE 'Europe/Lisbon');
  -- Fim dentro do proprio ultimo dia (23:59 local), como a Agenda guarda os
  -- itens de dia inteiro. Terminar as 00:00 do dia seguinte fazia o gatilho
  -- de feriados contar esse dia e recusar a vespera de um feriado.
  v_end   timestamptz := ((COALESCE(p_to, p_from) + time '23:59') AT TIME ZONE 'Europe/Lisbon');
BEGIN
  SELECT v.schedule_resource_id, v.organization_id INTO v_res, v_org
  FROM public.fleet_vehicles v WHERE v.id = p_vehicle_id;

  IF v_item IS NULL THEN
    IF v_res IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.schedule_items (board_id, title, status, origin, start_datetime, end_datetime, all_day,
                                       organization_id, created_by, user_id, metadata)
    VALUES (public.fn_fleet_board(v_org), p_title, p_status, 'manual', v_start, v_end, true,
            v_org, public.current_business_user_id(), p_user_id,
            COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'fleet', 'fleet_vehicle_id', p_vehicle_id))
    RETURNING id INTO v_item;
    INSERT INTO public.schedule_item_assignees (item_id, resource_id, role)
    VALUES (v_item, v_res, 'vehicle')
    ON CONFLICT (item_id, resource_id) DO NOTHING;
  ELSE
    UPDATE public.schedule_items
       SET title = COALESCE(p_title, title),
           status = p_status,
           start_datetime = v_start,
           end_datetime = v_end,
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('source', 'fleet', 'fleet_vehicle_id', p_vehicle_id)
     WHERE id = v_item;
  END IF;
  RETURN v_item;
END;
$function$;

COMMIT;
