-- Fix: comercial perde o recurso atribuído (e a visita desaparece do seu
-- calendário) ao confirmar uma visita cuja lead lhe foi atribuída por outrem.
-- ============================================================
-- Causa raiz
-- ----------
-- useScheduling.ts (updateAssignees) e VisitReassignDialog.tsx faziam
-- DELETE + INSERT em schedule_item_assignees como DOIS pedidos PostgREST
-- separados (sem transação partilhada), ambos sujeitos à RLS da tabela.
--
-- A policy de SELECT de schedule_items (scope OWNED, ver
-- 20261112010000_fix_schedule_items_owned_scope_assignees.sql) só deixa um
-- utilizador ver um item de que não é created_by/user_id se existir uma
-- linha em schedule_item_assignees a ligá-lo (via schedule_resources.user_id).
-- Quando esse utilizador (ex.: um comercial a confirmar uma visita cuja
-- lead lhe foi atribuída por outra pessoa) faz o DELETE dessa linha antes
-- de a recriar, perde nesse instante a visibilidade RLS sobre o
-- schedule_items — e o INSERT seguinte falha, porque a sua WITH CHECK
-- exige "item_id IN (SELECT id FROM schedule_items ...)", subquery que
-- corre com a RLS do próprio utilizador e passa a devolver zero linhas.
-- Resultado: "new row violates row-level security policy for table
-- schedule_item_assignees", o DELETE já confirmado fica sem o INSERT
-- correspondente, e a visita fica sem recurso atribuído.
--
-- Solução
-- -------
-- rpc_update_schedule_item_assignees, SECURITY DEFINER, replica a mesma
-- autorização da policy de INSERT atual (scheduling.items.create/edit +
-- item pertence a uma org visível) e faz o DELETE+INSERT dentro da MESMA
-- chamada de função/transação, sem qualquer SELECT sujeito à RLS do
-- chamador pelo meio — elimina a janela em que a visibilidade desaparece.
-- Mesmo padrão já usado em rpc_create_schedule_item / rpc_update_schedule_item
-- (20260726010000_scheduling_audit_bypass_and_rpcs.sql).
--
-- Nenhuma policy RLS existente é alterada ou enfraquecida por esta migration.

CREATE OR REPLACE FUNCTION public.rpc_update_schedule_item_assignees(
  p_item_id      uuid,
  p_resource_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor         uuid;
  v_org_id        uuid;
  v_effective_ids uuid[];
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Authorization parity with schedule_item_assignees INSERT RLS
  -- (baseline 20260615130000, linha ~21747: create OR edit permission).
  IF NOT (public.has_scheduling_permission(auth.uid(), 'scheduling.items.create')
          OR public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit')) THEN
    RAISE EXCEPTION 'Sem permissão para atribuir recursos ao agendamento' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Authorization parity with the "item_id IN (visible schedule_items)" clause
  -- of that same INSERT policy — checked here explicitly, once, instead of via
  -- a caller-scoped SELECT subquery (that subquery is exactly what created the
  -- circular RLS dependency this RPC fixes).
  SELECT organization_id INTO v_org_id
  FROM public.schedule_items
  WHERE id = p_item_id;

  IF v_org_id IS NULL
     OR NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Agendamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_effective_ids := COALESCE(p_resource_ids, ARRAY[]::uuid[]);

  -- Atomic: same function call / same transaction, sem round-trip pelo
  -- PostgREST nem re-avaliação da RLS de schedule_items do chamador entre
  -- as duas instruções.
  DELETE FROM public.schedule_item_assignees WHERE item_id = p_item_id;

  IF array_length(v_effective_ids, 1) IS NOT NULL THEN
    INSERT INTO public.schedule_item_assignees (item_id, resource_id)
    SELECT p_item_id, x
    FROM (SELECT DISTINCT unnest(v_effective_ids) AS x) d;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_schedule_item_assignees(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_schedule_item_assignees(uuid, uuid[]) TO authenticated;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Um utilizador em scope OWNED, sem ser created_by/user_id do item, cujo
--    único vínculo é o assignee que está a recriar, deixa de perder a
--    linha a meio da operação:
--   SELECT public.rpc_update_schedule_item_assignees(
--     p_item_id => '<item-do-nuno>', p_resource_ids => ARRAY['<resource-do-nuno>']::uuid[]);
--   -- Expected: sucesso, e SELECT * FROM schedule_item_assignees WHERE item_id = '<item-do-nuno>'
--   --           continua a devolver a linha imediatamente a seguir (nunca fica vazia).
-- 2. Chamar sem a permissão scheduling.items.create/edit, ou sobre um item
--    fora das orgs visíveis do chamador, continua a levantar insufficient_privilege
--    — mesma autorização que a RLS aplicava.
