-- =============================================================================
-- 20270108200000 — Lote B (P1.4): a permissão passa a contar por organização
-- =============================================================================
-- has_anew_permission(uid, código) é global: chega ter a permissão em QUALQUER
-- organização. Nas policies/RPCs de operações (inventário, armazéns, receção,
-- compras, fornecedores, encomendas de cliente, catálogo, frota e agenda) isso
-- deixava quem tem a permissão na org A mexer em dados da org B.
--
-- has_anew_permission_in_org(uid, código, org) só aceita membro DIRETO da org,
-- o que cortaria o acesso legítimo pela hierarquia (membro da mãe vê as
-- filhas, via get_user_visible_org_ids). Por isso estas duas funções novas
-- usam exatamente a mesma expansão de get_user_visible_org_ids (descendentes,
-- antepassados e associações), mas partindo só das associações (memberships)
-- cujo papel tem a permissão:
--
--   get_user_permission_org_ids(uid, código)  -> organizações onde a permissão conta
--   has_anew_permission_for_org(uid, código, org) -> boolean
--
-- O resultado é sempre um subconjunto de get_user_visible_org_ids (interseção
-- explícita) e, para quem tem uma só organização (ou a permissão na
-- organização de onde vê as outras), é igual ao que já tinha.
-- Exceção: o papel GLOBAL system_admin (o de is_system_admin) é da plataforma;
-- as permissões dele continuam a valer em todas as organizações visíveis.
-- has_anew_permission e has_anew_permission_in_org NÃO mudam.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_user_permission_org_ids(_auth_uid uuid, _permission_code text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  ),
  ancestor_orgs AS (
    SELECT organization_id FROM perm_orgs
    UNION
    SELECT h.parent_org_id
    FROM public.anew_hierarchy h
    JOIN ancestor_orgs a ON a.organization_id = h.child_org_id
  ),
  hierarchy_orgs AS (
    SELECT organization_id FROM descendant_orgs
    UNION
    SELECT organization_id FROM ancestor_orgs
  ),
  expanded AS (
    SELECT organization_id FROM hierarchy_orgs
    UNION
    SELECT a.associated_org_id
    FROM public.anew_org_associations a
    JOIN hierarchy_orgs h ON h.organization_id = a.org_id
    UNION
    SELECT a.org_id
    FROM public.anew_org_associations a
    JOIN hierarchy_orgs h ON h.organization_id = a.associated_org_id
  )
  SELECT e.organization_id
  FROM expanded e
  WHERE e.organization_id IS NOT NULL
    AND e.organization_id IN (SELECT public.get_user_visible_org_ids(_auth_uid))
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
  'Lote B (20270108200000): organizações onde a permissão conta para o utilizador — mesma expansão de get_user_visible_org_ids (hierarquia e associações), a partir só das associações cujo papel tem a permissão.';

CREATE OR REPLACE FUNCTION public.has_anew_permission_for_org(_auth_uid uuid, _permission_code text, _organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT _organization_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.get_user_permission_org_ids(_auth_uid, _permission_code) AS g(id)
       WHERE g.id = _organization_id
     )
$function$;

COMMENT ON FUNCTION public.has_anew_permission_for_org(uuid, text, uuid) IS
  'Lote B (20270108200000): a permissão conta na organização indicada (ou numa de onde ela é visível pela hierarquia/associações).';

REVOKE ALL ON FUNCTION public.get_user_permission_org_ids(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_anew_permission_for_org(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_permission_org_ids(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_anew_permission_for_org(uuid, text, uuid) TO authenticated, service_role;
