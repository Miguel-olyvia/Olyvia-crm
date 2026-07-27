-- Fix: delete_organization_subtree / restore_organization_subtree use an
-- invalid `x = ANY (set_returning_function())` PL/pgSQL expression that
-- raises "42809: op ANY/ALL (array) requires array on right side" whenever
-- executed — a pre-existing bug (present in delete_organization_subtree
-- since its original definition, NOT introduced by this migration group),
-- reproduced independently of any other change:
--
--   IF NOT (p_root_org_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN
--
-- get_user_visible_org_ids RETURNS SETOF uuid; PL/pgSQL does not implicitly
-- wrap a bare set-returning function call on the right side of `= ANY(...)`
-- into an array or a proper subquery in this expression position, so the
-- executor tries (and fails) to coerce its single evaluated row to an
-- array type. Confirmed via a standalone DO block reproduction against the
-- live database before writing this fix. restore_organization_subtree
-- (added by 20261108030000_organizations_soft_delete_and_restore.sql)
-- copied the exact same broken pattern from delete_organization_subtree,
-- so both are fixed here, in favor of the `IN (SELECT ...)` form already
-- used correctly elsewhere in this same migration group
-- (rpc_delete_organization / rpc_restore_organization).
-- 2026-11-08 | Module: Organizações

CREATE OR REPLACE FUNCTION public.delete_organization_subtree(p_root_org_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_root_org_id IS NULL THEN
    RAISE EXCEPTION 'root_org_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_root_org_id) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  IF NOT (p_root_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH RECURSIVE subtree AS (
    SELECT p_root_org_id AS org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN subtree s ON h.parent_org_id = s.org_id
  )
  SELECT array_agg(org_id) INTO v_ids FROM subtree;

  UPDATE public.anew_organizations
  SET deleted_at = now(), updated_at = now()
  WHERE id = ANY(v_ids)
    AND deleted_at IS NULL;

  RETURN v_ids;
END;
$function$;


CREATE OR REPLACE FUNCTION public.restore_organization_subtree(p_root_org_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_root_org_id IS NULL THEN
    RAISE EXCEPTION 'root_org_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = p_root_org_id) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  IF NOT (p_root_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH RECURSIVE subtree AS (
    SELECT p_root_org_id AS org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN subtree s ON h.parent_org_id = s.org_id
  )
  SELECT array_agg(org_id) INTO v_ids FROM subtree;

  UPDATE public.anew_organizations
  SET deleted_at = NULL, updated_at = now()
  WHERE id = ANY(v_ids)
    AND deleted_at IS NOT NULL;

  RETURN v_ids;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_organization_subtree(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_organization_subtree(uuid) TO authenticated, service_role;
