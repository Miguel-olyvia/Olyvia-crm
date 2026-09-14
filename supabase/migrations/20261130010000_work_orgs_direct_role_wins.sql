-- ============================================================================
-- get_user_work_orgs(): o papel DIRETO numa empresa manda; não se herda de baixo
-- ============================================================================
--
-- Modelo canónico de super_admin (decidido): é um papel de sistema que pode ver
-- e fazer tudo, mas SÓ nas organizações onde quem o tem tem membership com esse
-- papel. Não é global; não sobe de uma sub-organização para a empresa-mãe.
--
-- Bug corrigido (confirmado ao vivo em produção): `get_user_work_orgs()` montava
-- o array `roles` de uma work-org unindo os papéis de TODAS as start-orgs que
-- resolviam para ela — incluindo sub-orgs (departamentos) abaixo. Uma pessoa que
-- é super_admin de um departamento da nike, e cliente DIRETO da nike, recebia
-- `roles = {client, super_admin}` para a nike, e a aplicação assumia-a como
-- super_admin da empresa inteira, sobrepondo-se ao papel direto de cliente.
--
-- Correção. Se existe membership DIRETA na work-org (depth 0), o array `roles`
-- vem SÓ dessa membership direta — nunca da união com sub-orgs descendentes. Só
-- quando a work-org é alcançada exclusivamente via departamento (sem membership
-- direta) é que se mantém o papel herdado, para não tirar acesso a quem opera a
-- nível de empresa a partir de um departamento (esse é o mecanismo via_department
-- legítimo, que continua igual). A herança que DESCE (admin da mãe manda nas
-- filhas) não é tocada por esta função.

CREATE OR REPLACE FUNCTION public.get_user_work_orgs()
 RETURNS TABLE(id uuid, name text, membership_type text, via_org_id uuid, via_org_name text, roles text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth_uid       uuid := auth.uid();
  v_anew_user_id   uuid;
  v_is_sysadmin    boolean;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT au.id INTO v_anew_user_id
  FROM public.anew_users au
  WHERE au.auth_user_id = v_auth_uid
    AND au.status = 'active';

  IF v_anew_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT public.is_system_admin(v_auth_uid) INTO v_is_sysadmin;

  IF v_is_sysadmin THEN
    RETURN QUERY
    SELECT
      o.id,
      o.name,
      'system_admin'::text AS membership_type,
      NULL::uuid AS via_org_id,
      NULL::text AS via_org_name,
      COALESCE(ARRAY(
        SELECT DISTINCT ar.code
        FROM public.anew_memberships am
        JOIN public.anew_roles ar ON ar.id = am.role_id
        WHERE am.user_id = v_anew_user_id
          AND am.status = 'active'
          AND am.organization_id = o.id
      ), ARRAY[]::text[]) AS roles
    FROM public.anew_organizations o
    WHERE o.is_work_org = true
      AND o.status = 'active'
      AND o.deleted_at IS NULL
    ORDER BY o.name;
    RETURN;
  END IF;

  RETURN QUERY
  WITH RECURSIVE membership_orgs AS (
    SELECT DISTINCT am.organization_id AS start_org_id
    FROM public.anew_memberships am
    WHERE am.user_id = v_anew_user_id
      AND am.status = 'active'
  ),
  ancestor_walk AS (
    SELECT mo.start_org_id, mo.start_org_id AS current_org_id, 0 AS depth, ARRAY[mo.start_org_id] AS path
    FROM membership_orgs mo
    UNION ALL
    SELECT aw.start_org_id, h.parent_org_id, aw.depth + 1, aw.path || h.parent_org_id
    FROM ancestor_walk aw
    JOIN public.anew_hierarchy h ON h.child_org_id = aw.current_org_id
    WHERE lower(h.relationship_type) IN ('parent_of', 'parent_child')
      AND aw.depth < 20
      AND NOT (h.parent_org_id = ANY(aw.path))
  ),
  resolved AS (
    SELECT DISTINCT ON (aw.start_org_id)
      aw.start_org_id, aw.current_org_id AS work_org_id, aw.depth
    FROM ancestor_walk aw
    JOIN public.anew_organizations wo ON wo.id = aw.current_org_id
    WHERE wo.is_work_org = true AND wo.status = 'active' AND wo.deleted_at IS NULL
    ORDER BY aw.start_org_id, aw.depth ASC
  ),
  member_roles AS (
    SELECT am.organization_id AS start_org_id, ar.code AS role_code
    FROM public.anew_memberships am
    JOIN public.anew_roles ar ON ar.id = am.role_id
    WHERE am.user_id = v_anew_user_id
      AND am.status = 'active'
  ),
  via_pick AS (
    SELECT DISTINCT ON (r.work_org_id)
      r.work_org_id, r.start_org_id AS via_org_id
    FROM resolved r
    WHERE r.depth > 0
    ORDER BY r.work_org_id, r.depth ASC, r.start_org_id ASC
  )
  SELECT
    wo.id,
    wo.name,
    CASE WHEN bool_or(r.depth = 0) THEN 'direct' ELSE 'via_department' END AS membership_type,
    CASE WHEN bool_or(r.depth = 0) THEN NULL ELSE vp.via_org_id END AS via_org_id,
    CASE WHEN bool_or(r.depth = 0) THEN NULL ELSE vo.name END AS via_org_name,
    COALESCE(
      CASE
        WHEN bool_or(r.depth = 0) THEN
          -- Membership DIRETA nesta empresa: só o papel direto vale.
          -- Não se une o papel de sub-orgs descendentes (evita que admin de um
          -- departamento vire admin da empresa toda, e que se sobreponha a um
          -- papel direto como cliente).
          ARRAY(
            SELECT DISTINCT mr.role_code
            FROM member_roles mr
            WHERE mr.start_org_id = wo.id
          )
        ELSE
          -- Alcançada só via departamento (sem membership direta): mantém-se o
          -- papel herdado para a pessoa poder operar a nível de empresa.
          ARRAY(
            SELECT DISTINCT mr.role_code
            FROM resolved r2
            JOIN member_roles mr ON mr.start_org_id = r2.start_org_id
            WHERE r2.work_org_id = wo.id
          )
      END,
      ARRAY[]::text[]
    ) AS roles
  FROM resolved r
  JOIN public.anew_organizations wo ON wo.id = r.work_org_id
  LEFT JOIN via_pick vp ON vp.work_org_id = r.work_org_id
  LEFT JOIN public.anew_organizations vo ON vo.id = vp.via_org_id
  GROUP BY wo.id, wo.name, vp.via_org_id, vo.name
  ORDER BY wo.name;
END;
$function$;
