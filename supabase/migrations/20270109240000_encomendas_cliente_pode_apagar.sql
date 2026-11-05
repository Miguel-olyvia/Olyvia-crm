-- =============================================================================
-- 20270109240000 — Encomendas de cliente: o ecrã sabe que encomendas pode apagar
-- =============================================================================
-- rpc_delete_client_order recusa fora do âmbito (organização + âmbito
-- ORG/TEAM/OWNED da permissão client_orders.delete), mas o ecrã só perguntava
-- hasPermission('client_orders.delete'): com âmbito OWNED/TEAM o «Eliminar»
-- aparecia em encomendas que o servidor recusa.
-- rpc_client_orders_can_delete(ids) devolve, dos ids pedidos, os que passam
-- EXATAMENTE as mesmas verificações de permissão/âmbito de
-- rpc_delete_client_order (texto vivo de 05/11/2026, md5 3df5dd73…):
--   · client_orders.delete; organização visível (fn_deal_org_in_scope) e a
--     permissão nessa organização (has_anew_permission_for_org);
--   · acesso total (system admin membro/sessão de suporte; super_admin na org
--     ou acima) OU chave de âmbito (crm_scope_keys) que case com a organização
--     (:*), created_by ou assigned_to.
-- As regras de estado/origem (manual, assinada, POs em curso, fatura) ficam no
-- rpc_delete_client_order, que continua a ser quem decide; isto só serve para o
-- ecrã mostrar o botão. Só leitura; não muda nada na base. No máximo 1000 ids.
-- Se rpc_delete_client_order mudar, esta função tem de acompanhar (a guarda
-- abaixo confirma que é o texto lido).
-- =============================================================================
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF md5(pg_get_functiondef('public.rpc_delete_client_order(uuid,text)'::regprocedure)) <> '3df5dd735c49ee99612e2af99b64093f' THEN
    RAISE EXCEPTION 'GUARDA: rpc_delete_client_order mudou desde a leitura (05/11/2026) — rever as verificações a espelhar';
  END IF;
  IF to_regprocedure('public.rpc_client_orders_can_delete(uuid[])') IS NOT NULL THEN
    RAISE EXCEPTION 'GUARDA: rpc_client_orders_can_delete já existe';
  END IF;
END
$guarda$;

CREATE FUNCTION public.rpc_client_orders_can_delete(p_contract_ids uuid[])
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_keys text[];
BEGIN
  IF v_uid IS NULL OR p_contract_ids IS NULL OR cardinality(p_contract_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_contract_ids) > 1000 THEN
    RAISE EXCEPTION 'No máximo 1000 encomendas por pedido' USING ERRCODE = 'check_violation';
  END IF;

  -- Mesma primeira verificação de rpc_delete_client_order.
  IF NOT public.has_anew_permission(v_uid, 'client_orders.delete') THEN
    RETURN;
  END IF;

  v_keys := public.crm_scope_keys('client_orders.delete');

  RETURN QUERY
  SELECT cc.id
    FROM public.client_contracts cc
   WHERE cc.id = ANY (p_contract_ids)
     AND cc.deleted_at IS NULL
     AND public.fn_deal_org_in_scope(cc.organization_id)
     AND public.has_anew_permission_for_org(v_uid, 'client_orders.delete', cc.organization_id)
     AND (
       (public.is_system_admin(v_uid)
          AND (cc.organization_id IN (SELECT public.get_user_crm_org_ids(v_uid))
               OR public.has_active_support_access(cc.organization_id)))
       OR EXISTS (
         WITH RECURSIVE chain AS (
           SELECT cc.organization_id AS org_id
           UNION
           SELECT h.parent_org_id
             FROM public.anew_hierarchy h
             JOIN chain c ON c.org_id = h.child_org_id
            WHERE h.parent_org_id IS NOT NULL
         )
         SELECT 1
           FROM public.anew_memberships m
           JOIN public.anew_users u ON u.id = m.user_id
           JOIN public.anew_roles r ON r.id = m.role_id
          WHERE u.auth_user_id = v_uid
            AND m.status = 'active'
            AND r.code = 'super_admin'
            AND m.organization_id IN (SELECT org_id FROM chain)
       )
       OR EXISTS (
         SELECT 1
           FROM unnest(v_keys) AS k(scope_key)
          WHERE k.scope_key = cc.organization_id::text || ':*'
             OR k.scope_key = cc.organization_id::text || ':' || cc.created_by::text
             OR k.scope_key = cc.organization_id::text || ':' || cc.assigned_to::text
       )
     );
END;
$function$;

COMMENT ON FUNCTION public.rpc_client_orders_can_delete(uuid[]) IS
  '20270109240000: dos ids pedidos, as encomendas de cliente que o utilizador pode eliminar (mesmas verificações de permissão/âmbito de rpc_delete_client_order). Só para o ecrã.';

REVOKE ALL ON FUNCTION public.rpc_client_orders_can_delete(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_client_orders_can_delete(uuid[]) TO authenticated, service_role;
