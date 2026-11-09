-- =============================================================================
-- 20270109200000 — A permissão DESCE na hierarquia (não sobe nem atravessa)
-- =============================================================================
-- Lote B (20270108200000) fez get_user_permission_org_ids partir só das
-- associações cujo papel tem a permissão, mas alargava-as com a mesma regra de
-- get_user_visible_org_ids: filhas, MÃES e organizações associadas. Ter a
-- permissão numa filha dava-a na mãe e nas associadas.
-- Decisão (Rafael, 05/11/2026): a permissão conta na organização onde está e
-- nas descendentes — a mesma regra da administração (20270108100000-130000).
--   get_user_permission_org_ids(uid, código) = organizações das associações
--     ativas, não-cliente, cujo papel tem a permissão + todas as descendentes.
--   O papel GLOBAL system_admin mantém-se: as permissões dele valem em todas as
--     organizações visíveis, como hoje.
-- has_anew_permission_for_org usa esta função (não muda). Todas as policies e
-- RPCs do Lote B herdam a regra sem mais alterações.
-- Interseção com get_user_visible_org_ids retirada: as descendentes de uma
-- associação direta são sempre visíveis (mesmo filtro de membros), por isso era
-- redundante e custava uma chamada a mais em cada policy.
-- Impacto nos dados de 05/11/2026: uma só organização (nike), sem hierarquia nem
-- associações — nenhum utilizador real muda (comparação antes/depois de todos os
-- utilizadores × códigos = 0 diferenças).
-- Reversão (só como migração nova): repor o texto de 20270108200000.
-- =============================================================================
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF md5(pg_get_functiondef('public.get_user_permission_org_ids(uuid,text)'::regprocedure)) <> '5f0f05148afb0b52912868fa879e91c6' THEN
    RAISE EXCEPTION 'GUARDA: get_user_permission_org_ids mudou desde a leitura (05/11/2026)';
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public.get_user_permission_org_ids(_auth_uid uuid, _permission_code text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270109200000: a permissão conta na organização da associação e nas DESCENDENTES; não sobe para a mãe nem atravessa
  --   para as associadas.
  WITH RECURSIVE perm_orgs AS (
    SELECT am.organization_id
    FROM public.anew_users au
    JOIN public.anew_memberships am
      ON am.user_id = au.id
     AND am.status = 'active'
     AND am.role_is_client IS NOT TRUE
    JOIN public.anew_role_permissions arp
      ON arp.role_id = am.role_id
     AND arp.permission_code = _permission_code
    WHERE au.auth_user_id = _auth_uid
  ),
  descendant_orgs AS (
    SELECT organization_id FROM perm_orgs
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN descendant_orgs d ON d.organization_id = h.parent_org_id
  )
  SELECT d.organization_id
  FROM descendant_orgs d
  WHERE d.organization_id IS NOT NULL
  UNION
  -- O papel GLOBAL de administrador de sistema (o mesmo de is_system_admin) é da
  -- plataforma, não de uma organização: as permissões dele continuam a valer em
  -- todas as organizações visíveis, como hoje.
  SELECT v.org_id
  FROM public.get_user_visible_org_ids(_auth_uid) AS v(org_id)
  WHERE EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am
      ON am.user_id = au.id
     AND am.status = 'active'
    JOIN public.anew_roles ar
      ON ar.id = am.role_id
     AND ar.code = 'system_admin'
     AND ar.is_system = true
     AND ar.organization_id IS NULL
     AND ar.deleted_at IS NULL
    JOIN public.anew_role_permissions arp
      ON arp.role_id = am.role_id
     AND arp.permission_code = _permission_code
    WHERE au.auth_user_id = _auth_uid
  )
$function$;

COMMENT ON FUNCTION public.get_user_permission_org_ids(uuid, text) IS
  '20270109200000: organizações onde a permissão conta — a da associação cujo papel a tem e as descendentes (não sobe nem atravessa associações); o papel global system_admin vale em todas as visíveis.';
