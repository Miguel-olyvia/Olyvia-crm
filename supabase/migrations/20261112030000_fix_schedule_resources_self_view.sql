-- Corrige a agenda vazia para técnicos que não têm a permissão
-- 'scheduling.resources.view'. A política de SELECT de schedule_items foi
-- corrigida em 20261112010000 para incluir itens atribuídos via
-- schedule_item_assignees -> schedule_resources, mas essa correção depende
-- de o frontend conseguir ler schedule_resources.user_id no mesmo join
-- (useScheduling.fetchItems filtra client-side por
-- assignees[].resource.user_id === filters.assigneeId).
--
-- A política de SELECT de schedule_resources exige
-- has_scheduling_permission(auth.uid(), 'scheduling.resources.view'), que
-- papéis como "Sales Technician" não têm. Resultado: o join
-- schedule_item_assignees -> schedule_resources devolve resource = null
-- (RLS esconde a linha do próprio recurso do técnico), o filtro client-side
-- por resource.user_id nunca encontra correspondência, e a agenda aparece
-- vazia mesmo com schedule_items e schedule_item_assignees visíveis.
--
-- Caso real confirmado ao vivo (SET LOCAL request.jwt.claims a simular a
-- sessão do técnico Nuno Mouronho): schedule_item_assignees devolvia 192
-- linhas visíveis, mas schedule_resources devolvia 0 linhas, incluindo a
-- própria linha do recurso do técnico (id e0839c41-c901-4429-94ef-2c2ec674d0ae,
-- user_id = anew_users.id dele).
--
-- Correção mínima: permitir que um utilizador veja a linha de
-- schedule_resources que representa o seu próprio anew_users.id (via
-- schedule_resources.user_id), mesmo sem 'scheduling.resources.view',
-- desde que a organização do recurso seja visível para ele. Isto não
-- expõe recursos de outros utilizadores — apenas o próprio.

CREATE OR REPLACE FUNCTION public.schedule_resource_is_current_user(p_resource_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.anew_users au
    WHERE au.auth_user_id = auth.uid()
      AND au.id = p_resource_user_id
  );
$function$;

ALTER POLICY "Users can view schedule resources" ON public.schedule_resources
  USING (
    (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())))
    AND (
      has_scheduling_permission(auth.uid(), 'scheduling.resources.view'::text)
      OR public.schedule_resource_is_current_user(schedule_resources.user_id)
    )
  );
