-- ============================================================================
-- get_user_work_orgs(): corrige a regressão da 20261130020000
-- ============================================================================
--
-- A 20261130020000 tirou as ligações de cliente do conjunto de partida. Efeito
-- não previsto: uma empresa onde a pessoa é cliente DIRETO deixou de ser vista
-- como "direta" e passou a ser alcançada apenas A SUBIR, a partir de
-- sub-organizações onde a pessoa tem um papel de equipa. Sem ligação direta
-- detetada, entrava a regra do departamento e o papel herdado voltava — ou seja,
-- desfazia a correção da 20261130010000 (uma pessoa cliente da nike, e
-- administradora de sub-orgs da nike, voltava a aparecer como super_admin da
-- nike).
--
-- Correção: juntar as duas regras em vez de as opor.
--   1. O conjunto de partida volta a incluir TODAS as ligações ativas, para que
--      a ligação DIRETA seja detetada (é o que faz o papel direto mandar).
--   2. Os papéis contados são só os de EQUIPA (as ligações de cliente nunca
--      contam como papel de CRM).
--   3. Uma empresa só entra na lista se, no fim, sobrar pelo menos um papel de
--      equipa. Assim, uma empresa de que se é apenas cliente não aparece — nem
--      pela ligação direta de cliente, nem promovida por baixo.
--
-- Resultado: cliente de uma empresa não a vê no CRM; quem é equipa continua a
-- vê-la; quem é as duas coisas vê-a pelo papel de equipa; e quem chega a uma
-- empresa só através de um departamento mantém o comportamento de sempre.

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
    -- TODAS as ligações activas: é isto que permite detectar a ligação DIRECTA
    -- (mesmo sendo de cliente) e impedir que o papel suba de baixo.
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
    -- Só papéis de EQUIPA: uma ligação de cliente nunca é um papel de CRM.
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
  ),
  computed AS (
    SELECT
      wo.id,
      wo.name,
      CASE WHEN bool_or(r.depth = 0) THEN 'direct' ELSE 'via_department' END AS membership_type,
      CASE WHEN bool_or(r.depth = 0) THEN NULL ELSE vp.via_org_id END AS via_org_id,
      CASE WHEN bool_or(r.depth = 0) THEN NULL ELSE vo.name END AS via_org_name,
      COALESCE(
        CASE
          WHEN bool_or(r.depth = 0) THEN
            -- Ligação DIRECTA: só o papel directo de equipa vale.
            ARRAY(
              SELECT DISTINCT mr.role_code
              FROM member_roles mr
              WHERE mr.start_org_id = wo.id
            )
          ELSE
            -- Alcançada só via departamento: papel de equipa herdado.
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
  )
  SELECT c.id, c.name, c.membership_type, c.via_org_id, c.via_org_name, c.roles
  FROM computed c
  -- Sem papel de equipa não há entrada no CRM (empresa só de cliente).
  WHERE COALESCE(array_length(c.roles, 1), 0) > 0
  ORDER BY c.name;
END;
$function$;
