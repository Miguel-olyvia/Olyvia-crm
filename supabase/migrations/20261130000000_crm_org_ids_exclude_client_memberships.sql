-- ============================================================================
-- get_user_crm_org_ids(): excluir memberships de CLIENTE da lista de orgs de CRM
-- ============================================================================
--
-- Contexto. `get_user_crm_org_ids()` devolve as organizações onde o utilizador
-- tem membership ativa, e alimenta ~37 políticas RLS de CRM (proposals, quotes,
-- deals, anew_leads, anew_clients, client_contracts, proposal_items,
-- form_submissions, client_contract_parties) e o seletor de organização do CRM.
--
-- Problema. A função foi escrita antes de existir a distinção CRM vs cliente
-- (coluna `anew_memberships.role_is_client`, introduzida em
-- 20261120100000_membership_dual_client_crm_exception.sql). Como nunca foi
-- atualizada, incluía TAMBÉM as organizações onde a pessoa é apenas cliente do
-- portal. Efeito visível: um login que é só cliente numa empresa continuava a
-- ver essa empresa no seletor do CRM e no âmbito das políticas de CRM.
--
-- Correção. Excluir as memberships de cliente. Usa-se `IS NOT TRUE` (e não
-- `= false`) para que uma membership com `role_is_client` NULL continue a contar
-- como CRM — só se exclui quando é explicitamente cliente.
--
-- Segurança do caso híbrido. Quem é CRM E cliente na mesma org tem DUAS
-- memberships (uma cliente, uma não-cliente); a org entra pela não-cliente, por
-- isso continua a aparecer. Só desaparece a org onde a pessoa é APENAS cliente.
--
-- Integridade verificada antes de aplicar (produção): das memberships ativas,
-- 0 têm `role_is_client = true` num role não-cliente, e as 539 com role `client`
-- têm todas `role_is_client = true` — a flag coincide exatamente com o papel de
-- cliente, por isso nenhum utilizador de CRM perde acesso.

CREATE OR REPLACE FUNCTION public.get_user_crm_org_ids(_auth_uid uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.organization_id
  FROM public.anew_memberships m
  JOIN public.anew_users u ON u.id = m.user_id
  WHERE u.auth_user_id = _auth_uid
    AND m.status = 'active'
    AND m.role_is_client IS NOT TRUE
$function$;

REVOKE ALL ON FUNCTION public.get_user_crm_org_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_crm_org_ids(uuid) TO authenticated, service_role;
