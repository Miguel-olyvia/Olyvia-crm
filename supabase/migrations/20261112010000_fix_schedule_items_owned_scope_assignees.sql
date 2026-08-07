-- Corrige o âmbito OWNED/TEAM da política de SELECT de schedule_items para
-- incluir itens atribuídos ao utilizador (ou aos membros da sua equipa, em
-- âmbito TEAM) através de schedule_item_assignees -> schedule_resources,
-- mesmo quando o item foi criado por outra pessoa (ex.: dispatcher/admin
-- que agenda em nome do técnico).
--
-- Antes desta alteração, um técnico com âmbito OWNED só via os
-- schedule_items em que era created_by ou user_id, ignorando os itens em
-- que era apenas o "assignee" via recurso. Caso real detetado: técnico com
-- 164 agendamentos atribuídos ao seu recurso, dos quais só 16 tinham
-- created_by/user_id = ele próprio; os restantes 148, criados por um
-- dispatcher/admin e atribuídos ao seu recurso, ficavam invisíveis.
--
-- IMPORTANTE: uma primeira tentativa desta correção adicionou o EXISTS
-- diretamente na política (subquery a schedule_item_assignees) e causou
-- "infinite recursion detected in policy for relation
-- schedule_item_assignees", porque a política de SELECT dessa tabela por
-- sua vez consulta schedule_items. Essa tentativa foi revertida em
-- produção antes de aplicar a versão abaixo. Para evitar a recursão,
-- a verificação é feita através de uma função SECURITY DEFINER (como
-- get_schedule_item_scope_context já faz para anew_memberships/anew_users),
-- que corre com os privilégios do owner das tabelas (postgres) e por isso
-- não reaciona as políticas RLS de schedule_item_assignees/schedule_resources
-- (nenhuma das duas tem FORCE ROW LEVEL SECURITY).
--
-- Esta migration altera APENAS a política de SELECT ("Users can view
-- schedule items (scoped)"). As políticas de UPDATE e DELETE não usam
-- get_schedule_item_scope_context e não são alteradas aqui: alargar
-- edição/eliminação para itens atribuídos por outros é uma decisão de
-- produto distinta, fora do âmbito deste pedido (que é apenas sobre
-- visibilidade).
--
-- Rollback: ver C:\my-crm-dream-main\ROLLBACK-schedule-scope.sql

CREATE OR REPLACE FUNCTION public.schedule_item_assigned_to_owners(p_item_id uuid, p_owner_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.schedule_item_assignees sia
    JOIN public.schedule_resources sr ON sr.id = sia.resource_id
    WHERE sia.item_id = p_item_id
      AND sr.user_id = ANY (p_owner_ids)
  );
$function$;

ALTER POLICY "Users can view schedule items (scoped)" ON public.schedule_items
  USING (
    has_scheduling_permission(auth.uid(), 'scheduling.items.view'::text)
    AND (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM get_schedule_item_scope_context(schedule_items.organization_id, 'scheduling.items.view'::text) ctx(applied_scope, owner_ids)
      WHERE (
        ctx.applied_scope = 'ORG'
        OR schedule_items.created_by = ANY (ctx.owner_ids)
        OR schedule_items.user_id = ANY (ctx.owner_ids)
        OR public.schedule_item_assigned_to_owners(schedule_items.id, ctx.owner_ids)
      )
    )
  );
