-- Fix: rpc_delete_organization / rpc_restore_organization reintroduced the
-- dead 'organizations.manage' permission-code bug that 20260905010000 had
-- already patched out of the live function.
-- 2026-11-08 | Module: Organizações
--
-- Root cause
-- ----------
-- 20261108030000_organizations_soft_delete_and_restore.sql rewrote
-- rpc_delete_organization (to soft-delete) by copying its body from the
-- ORIGINAL migration file (20260722010000), which still checked
-- has_anew_permission(auth.uid(), 'organizations.manage'). That check was
-- already corrected in the LIVE database, in-place, by 20260905010000 (a
-- dynamic DO block patch, not a new CREATE OR REPLACE in a later migration
-- file — so grepping migration *files* for the current behavior silently
-- reproduces the bug). 'organizations.manage' was never seeded into
-- anew_permissions and is granted to no role, so 20261108030000 made
-- rpc_delete_organization (and the newly-added rpc_restore_organization,
-- written by copy-pasting the same now-wrong check) reject every caller,
-- including super_admin — confirmed by live E2E testing on org Nike while
-- validating this exact migration group.
--
-- Fix: re-point both checks at 'organizations.delete', matching
-- delete_organization_subtree/restore_organization_subtree (which already
-- had the correct code, since they were untouched by the 20260905010000
-- patch) and the authenticated_delete_anew_organizations RLS policy.

CREATE OR REPLACE FUNCTION public.rpc_delete_organization(
  p_root_org_id uuid
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_root        public.anew_organizations;
  v_subtree     jsonb;
  v_deleted     uuid[];
  v_diff        jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_root FROM public.anew_organizations WHERE id = p_root_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with authenticated_delete_anew_organizations RLS ─
  IF NOT public.has_anew_permission(auth.uid(), 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar organizações' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_root_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_root.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Organização já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  WITH RECURSIVE subtree AS (
    SELECT p_root_org_id AS org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN subtree s ON h.parent_org_id = s.org_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'name', o.name, 'type', o.type, 'status', o.status) ORDER BY o.id), '[]'::jsonb)
  INTO v_subtree
  FROM subtree s
  JOIN public.anew_organizations o ON o.id = s.org_id;

  v_deleted := public.delete_organization_subtree(p_root_org_id);

  v_diff := jsonb_build_object(
    'anew_organizations', jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_root.deleted_at), 'new', to_jsonb(now()))
    ),
    'subtree', jsonb_build_object('old', v_subtree, 'new', NULL)
  );

  PERFORM public.fn_manual_audit_log(
    'anew_organizations', p_root_org_id, p_root_org_id, 'UPDATE', v_diff, 'web_app'
  );

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_organization(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_restore_organization(
  p_root_org_id uuid
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_root        public.anew_organizations;
  v_subtree     jsonb;
  v_restored    uuid[];
  v_diff        jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_root FROM public.anew_organizations WHERE id = p_root_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organização não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissão para restaurar organizações' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_root_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_root.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Organização já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  WITH RECURSIVE subtree AS (
    SELECT p_root_org_id AS org_id
    UNION
    SELECT h.child_org_id
    FROM public.anew_hierarchy h
    JOIN subtree s ON h.parent_org_id = s.org_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'name', o.name, 'type', o.type, 'status', o.status) ORDER BY o.id), '[]'::jsonb)
  INTO v_subtree
  FROM subtree s
  JOIN public.anew_organizations o ON o.id = s.org_id;

  v_restored := public.restore_organization_subtree(p_root_org_id);

  v_diff := jsonb_build_object(
    'anew_organizations', jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_root.deleted_at), 'new', NULL)
    ),
    'subtree', jsonb_build_object('old', NULL, 'new', v_subtree)
  );

  PERFORM public.fn_manual_audit_log(
    'anew_organizations', p_root_org_id, p_root_org_id, 'UPDATE', v_diff, 'web_app'
  );

  RETURN v_restored;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_organization(uuid) TO authenticated;
