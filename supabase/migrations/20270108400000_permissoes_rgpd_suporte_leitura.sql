-- ==============================================================================
-- P1.7 (auditoria de permissões 05/11/2026, grupo D): pedidos de apagamento RGPD
-- e pedidos de acesso de suporte deixam de ser legíveis por qualquer membro
-- interno da organização.
--
-- Antes: SELECT = admin de sistema OU organização visível (get_user_visible_org_ids),
-- ou seja, decidido pela associação e não pela permissão. Qualquer membro lia,
-- pela API, o entity_snapshot (dados pessoais) dos pedidos RGPD e os motivos dos
-- pedidos de suporte.
--
-- Agora: admin de sistema OU a permissão do ecrã que gere estes pedidos, na
-- organização do pedido ou numa acima dela:
--   data_erasure_requests -> rgpd.erasure.manage          (/platform/data-erasure-requests)
--   support_access_log    -> platform.support_access.view (/platform/support-access)
-- São as permissões que já guardam as rotas (App.tsx). Hoje só os papéis
-- super_admin e system_admin as têm, e são os únicos que abrem os ecrãs:
-- ninguém que usa o ecrã perde a leitura.
--
-- Só policies de SELECT. INSERT/UPDATE/DELETE ficam iguais. As edge functions
-- (request-/decide-data-erasure, request-/approve-support-access) usam a
-- service_role e não passam pela RLS. As funções que leem estas tabelas
-- (execute_entity_erasure, has_active_support_access e fn_neg_entidade_partilhada
-- chamada por RPCs definer) correm como postgres e também não.
-- ==============================================================================

ALTER POLICY data_erasure_requests_select ON public.data_erasure_requests
  USING (
    public.is_system_admin((SELECT auth.uid()))
    OR public.has_anew_permission_in_org_or_ancestor((SELECT auth.uid()), 'rgpd.erasure.manage', organization_id)
  );

ALTER POLICY support_access_log_select ON public.support_access_log
  USING (
    public.is_system_admin((SELECT auth.uid()))
    OR public.has_anew_permission_in_org_or_ancestor((SELECT auth.uid()), 'platform.support_access.view', target_org_id)
  );
