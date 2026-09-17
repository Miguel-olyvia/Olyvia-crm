-- ============================================================================
-- get_user_work_orgs(): não listar empresas onde a pessoa é APENAS cliente
-- ============================================================================
--
-- O seletor de empresas do CRM é alimentado por esta função (é o seu único
-- consumidor: src/contexts/CompanyContext.tsx; nenhuma política RLS e nenhuma
-- outra função a usam). Ela devolvia todas as empresas com ligação ativa,
-- incluindo aquelas em que a pessoa é apenas CLIENTE do portal — pelo que uma
-- empresa de que se é só cliente aparecia na lista de empresas do CRM.
--
-- Isso contraria a separação entre equipa e cliente: o ecrã de escolha no login
-- ("Equipa" ou "Cliente") existe precisamente para separar as duas superfícies,
-- e as sete tabelas de CRM já deixaram de considerar as ligações de cliente
-- (ver 20261130000000_crm_org_ids_exclude_client_memberships.sql).
--
-- Correção: as ligações de cliente deixam de entrar tanto no conjunto de partida
-- das empresas como no array de papéis. Quem é as duas coisas na mesma empresa
-- (equipa E cliente) continua a vê-la, pela ligação de equipa. Mantém-se a regra
-- da migração anterior: havendo ligação DIRETA, é esse o papel que vale.

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
          AND am.role_is_client IS NOT TRUE
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
    -- Ligações de CLIENTE não dão entrada no CRM: uma empresa de que se é só
    -- cliente não é uma empresa de trabalho e não aparece no seletor.
    SELECT DISTINCT am.organization_id AS start_org_id
    FROM public.anew_memberships am
    WHERE am.user_id = v_anew_user_id
      AND am.status = 'active'
      AND am.role_is_client IS NOT TRUE
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
      AND am.role_is_client IS NOT TRUE
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
          -- Ligação DIRETA nesta empresa: só o papel direto vale (não se mistura
          -- com papéis herdados de sub-organizações abaixo).
          ARRAY(
            SELECT DISTINCT mr.role_code
            FROM member_roles mr
            WHERE mr.start_org_id = wo.id
          )
        ELSE
          -- Alcançada só via departamento: mantém-se o papel herdado.
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
