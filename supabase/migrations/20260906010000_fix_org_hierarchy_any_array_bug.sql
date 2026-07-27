-- ============================================================
-- Fix: "op ANY/ALL (array) requires array on right side"
-- ============================================================
-- Confirmed via live E2E testing (org Nike) that editing or deleting any
-- organization fails with this Postgres error. Root cause: BOTH
-- unlink_organization_node and move_organization_node (called from
-- rpc_update_organization's hierarchy-update step, and transitively from
-- rpc_delete_organization) use `x = ANY(public.get_user_visible_org_ids(...))`,
-- but get_user_visible_org_ids RETURNS SETOF uuid, not uuid[] — `= ANY(...)`
-- requires an actual array on its right side, not a raw set-returning
-- function call. This bug pre-dates this session's permission-code fix; it
-- was previously masked because execution never got past the (also broken)
-- 'organizations.manage' permission check to reach this code.
--
-- Fix: wrap the set-returning function call in ARRAY(SELECT ...) to produce
-- a genuine array (move_organization_node), or use the IN (SELECT ...) idiom
-- already used correctly elsewhere in this codebase (unlink_organization_node).
-- Same safe dynamic-patch method as the previous migration: fetch the live
-- definition and substitute only the broken expression, never hand-retype.

DO $$
DECLARE
  v_src text;
  v_fixed text;
BEGIN
  -- unlink_organization_node
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'unlink_organization_node';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'unlink_organization_node not found';
  END IF;
  v_fixed := replace(
    v_src,
    'IF NOT (p_child_org_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN',
    'IF NOT (p_child_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN'
  );
  IF v_fixed = v_src THEN
    RAISE EXCEPTION 'unlink_organization_node: expected broken pattern not found, refusing to apply a no-op patch';
  END IF;
  EXECUTE v_fixed;
  RAISE NOTICE 'Patched unlink_organization_node';

  -- move_organization_node
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'move_organization_node';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'move_organization_node not found';
  END IF;
  v_fixed := replace(
    v_src,
    'v_visible := public.get_user_visible_org_ids(v_actor);',
    'v_visible := ARRAY(SELECT public.get_user_visible_org_ids(v_actor));'
  );
  IF v_fixed = v_src THEN
    RAISE EXCEPTION 'move_organization_node: expected broken pattern not found, refusing to apply a no-op patch';
  END IF;
  EXECUTE v_fixed;
  RAISE NOTICE 'Patched move_organization_node';
END;
$$;
