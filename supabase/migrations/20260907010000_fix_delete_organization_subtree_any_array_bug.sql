-- ============================================================
-- Fix: same "op ANY/ALL (array) requires array on right side" bug,
-- found in delete_organization_subtree (called by rpc_delete_organization).
-- get_user_visible_org_ids RETURNS SETOF uuid, not uuid[] — cannot be used
-- directly as the right side of `= ANY(...)`. Same safe dynamic-patch method.
-- ============================================================

DO $$
DECLARE
  v_src text;
  v_fixed text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'delete_organization_subtree';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'delete_organization_subtree not found';
  END IF;

  v_fixed := replace(
    v_src,
    'IF NOT (p_root_org_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN',
    'IF NOT (p_root_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN'
  );
  IF v_fixed = v_src THEN
    RAISE EXCEPTION 'delete_organization_subtree: expected broken pattern not found, refusing to apply a no-op patch';
  END IF;
  EXECUTE v_fixed;
  RAISE NOTICE 'Patched delete_organization_subtree';
END;
$$;
