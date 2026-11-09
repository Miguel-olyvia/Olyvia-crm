-- ============================================================
-- 20270112410000 — ai_assistente_permissoes_na_org
-- ============================================================
-- O que faz (auditoria Administração F6): a edge function ai-assistant usava as permissões de get_user_context, que junta
--   as permissões de TODAS as associações ativas do utilizador (de qualquer organização, incluindo papéis de cliente) sem
--   filtrar pela organização ativa da conversa.
--   Cria public.fn_ai_permissoes_na_org(_auth_uid, _organization_id): as permissões dos papéis do utilizador que
--   has_anew_permission_in_org_or_ancestor confirma NESSA organização (associação ativa, não-cliente, na própria
--   organização ou acima; administrador de sistema passa). Mesma regra que o servidor usa no resto do sistema.
-- Só service_role (a edge function chama-a com o uid do chamador, que já autenticou). Não muda nenhuma função existente:
--   sem guarda md5. Reversão: DROP FUNCTION public.fn_ai_permissoes_na_org(uuid, uuid).
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF to_regprocedure('public.fn_ai_permissoes_na_org(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: fn_ai_permissoes_na_org já existe. Rever esta migration.';
  END IF;
END $do$;

CREATE FUNCTION public.fn_ai_permissoes_na_org(_auth_uid uuid, _organization_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(array_agg(c.permission_code ORDER BY c.permission_code), ARRAY[]::text[])
  FROM (
    SELECT DISTINCT arp.permission_code
    FROM public.anew_users au
    JOIN public.anew_memberships am
      ON am.user_id = au.id
     AND am.status = 'active'
    JOIN public.anew_role_permissions arp
      ON arp.role_id = am.role_id
    WHERE au.auth_user_id = _auth_uid
  ) c
  WHERE _auth_uid IS NOT NULL
    AND _organization_id IS NOT NULL
    AND public.has_anew_permission_in_org_or_ancestor(_auth_uid, c.permission_code, _organization_id)
$function$;

REVOKE ALL ON FUNCTION public.fn_ai_permissoes_na_org(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ai_permissoes_na_org(uuid, uuid) TO service_role;
