-- 11/11/2026 — Correções da auditoria «campos sem permissão» (Área 7, Agenda).
--  1. schedule_invitations (INSERT): além de invited_by = eu (como estava), o convite exige scheduling.items.create ou
--     scheduling.items.edit na organização do agendamento (fn_pode_enviar_documento, migração 20270113900000 — a mesma
--     verificação que send-schedule-invite passou a fazer no início).
--  2. rpc_update_schedule_item_assignees: mudar os recursos de um agendamento existente passa a exigir scheduling.items.edit
--     (antes aceitava items.create). O âmbito (get_schedule_item_scope_context de items.edit) fica igual.
--  3. schedule_item_assignees (INSERT direto): items.edit na organização do agendamento, ou items.create só num agendamento
--     criado pelo próprio (os ecrãs que criam uma visita e logo a seguir lhe ligam o recurso: AnewLeadContactDialog,
--     useCalendarScheduling). Antes items.create chegava para QUALQUER agendamento da organização.
--  4. schedule_boards / schedule_resources: desativar (is_active true → false, é o «Eliminar» do ecrã) passa a exigir
--     scheduling.boards.delete / scheduling.resources.delete, por um gatilho BEFORE UPDATE só para a escrita direta
--     (current_user = authenticated; RPCs SECURITY DEFINER e service_role não passam por aqui). Reativar fica como estava.
-- Partiu das definições e políticas vivas (md5 abaixo); aborta se mudaram entretanto.
DO $g$
DECLARE
  v_md5 text;
BEGIN
  IF md5(pg_get_functiondef('public.rpc_update_schedule_item_assignees(uuid,uuid[])'::regprocedure)) <> '904db2795786c3e6de6191536e57806f' THEN
    RAISE EXCEPTION 'rpc_update_schedule_item_assignees mudou desde a leitura; rever antes de aplicar';
  END IF;
  SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'schedule_invitations' AND policyname = 'Users can create invitations';
  IF v_md5 IS DISTINCT FROM 'ced8e7e3f25c32a8bbed216328b5b87c' THEN
    RAISE EXCEPTION 'schedule_invitations/Users can create invitations mudou desde a leitura; rever antes de aplicar';
  END IF;
  SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'schedule_item_assignees' AND policyname = 'Users can create schedule item assignees';
  IF v_md5 IS DISTINCT FROM 'b8065582b462306113ec5d206a9cb9f9' THEN
    RAISE EXCEPTION 'schedule_item_assignees/Users can create schedule item assignees mudou desde a leitura; rever antes de aplicar';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_agenda_desativar_exige_delete') THEN
    RAISE EXCEPTION 'fn_agenda_desativar_exige_delete já existe; rever antes de aplicar';
  END IF;
END $g$;

-- 1. Convites
ALTER POLICY "Users can create invitations" ON public.schedule_invitations
  WITH CHECK ((invited_by = ( SELECT au.id
   FROM anew_users au
  WHERE (au.auth_user_id = auth.uid())))
    AND public.fn_pode_enviar_documento('schedule_item', schedule_item_id));

-- 3. Recursos atribuídos (INSERT direto)
ALTER POLICY "Users can create schedule item assignees" ON public.schedule_item_assignees
  WITH CHECK (((( SELECT lb_si.organization_id
   FROM schedule_items lb_si
  WHERE (lb_si.id = schedule_item_assignees.item_id)) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.items.edit'::text) AS get_user_permission_org_ids))
    OR ((( SELECT lb_si.organization_id
   FROM schedule_items lb_si
  WHERE (lb_si.id = schedule_item_assignees.item_id)) IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'scheduling.items.create'::text) AS get_user_permission_org_ids))
        AND (( SELECT lb_si.created_by
   FROM schedule_items lb_si
  WHERE (lb_si.id = schedule_item_assignees.item_id)) = public.current_business_user_id())))
    AND (item_id IN ( SELECT si.id
   FROM schedule_items si
  WHERE (si.organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids)))));

-- 2. Mudar os recursos de um agendamento existente
CREATE OR REPLACE FUNCTION public.rpc_update_schedule_item_assignees(p_item_id uuid, p_resource_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor         uuid;
  v_org_id        uuid;
  v_effective_ids uuid[];
  v_old_ids       uuid[];
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- 20270113940000: mudar os recursos de um agendamento que já existe é editá-lo: exige scheduling.items.edit
  -- (scheduling.items.create só conta ao criar, em rpc_create_schedule_item).
  IF NOT public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit') THEN
    RAISE EXCEPTION 'Sem permissão para atribuir recursos ao agendamento' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.schedule_items
  WHERE id = p_item_id;

  IF v_org_id IS NULL
     OR NOT (v_org_id IN (SELECT public.get_user_permission_org_ids(auth.uid(), 'scheduling.items.edit'))) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_items si
    CROSS JOIN LATERAL public.get_schedule_item_scope_context(si.organization_id, 'scheduling.items.edit') ctx(applied_scope, owner_ids)
    WHERE si.id = p_item_id
      AND (ctx.applied_scope = 'ORG'
        OR si.created_by = ANY (ctx.owner_ids)
        OR si.user_id = ANY (ctx.owner_ids)
        OR public.schedule_item_assigned_to_owners(si.id, ctx.owner_ids))
  ) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_effective_ids := COALESCE(p_resource_ids, ARRAY[]::uuid[]);

  SELECT COALESCE(array_agg(resource_id), ARRAY[]::uuid[]) INTO v_old_ids
  FROM public.schedule_item_assignees WHERE item_id = p_item_id;

  DELETE FROM public.schedule_item_assignees WHERE item_id = p_item_id;

  IF array_length(v_effective_ids, 1) IS NOT NULL THEN
    INSERT INTO public.schedule_item_assignees (item_id, resource_id)
    SELECT p_item_id, x
    FROM (SELECT DISTINCT unnest(v_effective_ids) AS x) d;
  END IF;

  RETURN public.fn_owner_sync_entity_from_visit(p_item_id, v_old_ids, v_effective_ids);
END;
$function$;

-- 4. Desativar um quadro ou um recurso («Eliminar» no ecrã) exige a permissão de apagar
CREATE FUNCTION public.fn_agenda_desativar_exige_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_codigo text := CASE TG_TABLE_NAME WHEN 'schedule_boards' THEN 'scheduling.boards.delete' ELSE 'scheduling.resources.delete' END;
BEGIN
  -- só a escrita direta do PostgREST; as RPCs SECURITY DEFINER e o service_role seguem as suas próprias regras
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE
     AND NOT public.has_anew_permission_for_org(auth.uid(), v_codigo, NEW.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar (%).', v_codigo USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_agenda_desativar_exige_delete() FROM PUBLIC, anon;

CREATE TRIGGER trg_schedule_boards_desativar_exige_delete
  BEFORE UPDATE OF is_active ON public.schedule_boards
  FOR EACH ROW EXECUTE FUNCTION public.fn_agenda_desativar_exige_delete();
CREATE TRIGGER trg_schedule_resources_desativar_exige_delete
  BEFORE UPDATE OF is_active ON public.schedule_resources
  FOR EACH ROW EXECUTE FUNCTION public.fn_agenda_desativar_exige_delete();
