-- FERRAMENTAS-TESTE (temporário, remover antes da main)
-- 11/11 (Rafael): nas contas de perfis normais (Comercial, Financeiro…), um botão no passo «À espera do cliente» para aceitar a
-- proposta / assinar o contrato como o cliente, sem ir ao portal. Só estas duas ações (Edge Function client-portal-action, ação
-- «simular_cliente»). NÃO mexe em fn_modo_teste_para_mim nem nas outras ferramentas de teste do Rúben: continuam só para o super admin.
--
-- Quem pode: o modo de teste ligado nesta base (app_modo_teste.ativo, migração 20270110300000: a linha nasce DESLIGADA em todas as
-- bases; só a base do ramo RH a ligou) E membro ativo (não cliente) da organização do documento ou de uma acima dela (a mesma
-- verificação de organização de fn_super_admin_de). O super admin continua a poder.
--  · fn_modo_teste_simular_cliente_de(auth, org): para a Edge Function (service_role).
--  · fn_modo_teste_simular_cliente_para_mim(org): para o ecrã (quem entrou).

CREATE OR REPLACE FUNCTION public.fn_modo_teste_simular_cliente_de(p_auth uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.fn_modo_teste() AND p_auth IS NOT NULL AND p_org IS NOT NULL AND (
    public.fn_super_admin_de(p_auth, p_org)
    OR EXISTS (
      SELECT 1
      FROM public.anew_users u
      JOIN public.anew_memberships m ON m.user_id = u.id AND m.status = 'active' AND m.role_is_client IS NOT TRUE
      WHERE u.auth_user_id = p_auth
        AND u.deleted_at IS NULL
        AND m.organization_id IN (SELECT public.fn_org_e_ascendentes(p_org))
    )
  )
$function$;
REVOKE ALL ON FUNCTION public.fn_modo_teste_simular_cliente_de(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_modo_teste_simular_cliente_de(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_modo_teste_simular_cliente_para_mim(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.fn_modo_teste_simular_cliente_de(auth.uid(), p_org)
$function$;
REVOKE ALL ON FUNCTION public.fn_modo_teste_simular_cliente_para_mim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_modo_teste_simular_cliente_para_mim(uuid) TO authenticated;
