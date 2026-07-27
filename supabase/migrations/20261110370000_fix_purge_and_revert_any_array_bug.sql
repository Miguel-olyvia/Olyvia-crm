-- Fix the same "= ANY (array)" bug — already fixed for several sibling
-- functions across this codebase's history (unlink_organization_node,
-- delete_organization_subtree x2, restore_organization_subtree,
-- soft_delete_business_entity_impl, restore_business_entity,
-- restore_entity_facet) — in the 3 remaining functions defined by
-- 20260818010000_fix_anon_exposed_destructive_functions_record.sql that were
-- never redefined since and still carry the original bug:
--   purge_business_entity, purge_entity_facet, revert_contact_to_client
--
-- get_user_visible_org_ids(_auth_uid) RETURNS SETOF uuid, not uuid[], so it
-- can never be the right-hand operand of `= ANY (...)` — every call to these
-- 3 functions currently raises Postgres 42809 "op ANY/ALL (array) requires
-- array on right side" the moment the authorization check runs, i.e. "Delete
-- Permanently" (purge) from Trash for deals/quotes/proposals/contracts and
-- leads/contacts/clients, and "Revert Contact to Client", have been
-- completely broken (fails closed, not a security regression, but a total
-- functional break) since 2026-08-18, unrelated to this session's other
-- changes — found by extension while fixing the identical bug freshly
-- reintroduced in restore_entity_facet (20261110360000).
--
-- Fix: same textual substitution as the prior fixes — `= ANY (...)` ->
-- `IN (SELECT ...)` — applied via a verbatim pg_get_functiondef patch per
-- function (exact clause text confirmed by direct grep of each function's
-- current source before writing this), so nothing else in any of the 3
-- function bodies changes.

DO $outer$
DECLARE
  v_src   text;
  v_fixed text;
BEGIN
  -- purge_business_entity: v_org_id
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'purge_business_entity';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'purge_business_entity not found — cannot patch';
  ELSIF v_src LIKE '%IN (SELECT public.get_user_visible_org_ids%' THEN
    RAISE NOTICE 'purge_business_entity already fixed — skipping';
  ELSIF v_src NOT LIKE '%IF NOT (v_org_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN%' THEN
    RAISE EXCEPTION 'purge_business_entity: expected buggy clause not found verbatim — aborting';
  ELSE
    v_fixed := replace(
      v_src,
      'IF NOT (v_org_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN',
      'IF NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN'
    );
    IF v_fixed = v_src THEN
      RAISE EXCEPTION 'purge_business_entity replacement did not match — aborting';
    END IF;
    EXECUTE v_fixed;
    RAISE NOTICE 'Patched purge_business_entity (ANY(array) -> IN (SELECT ...))';
  END IF;

  -- purge_entity_facet: v_org_id (same clause text as purge_business_entity,
  -- but a distinct function — patched separately)
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'purge_entity_facet';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'purge_entity_facet not found — cannot patch';
  ELSIF v_src LIKE '%IN (SELECT public.get_user_visible_org_ids%' THEN
    RAISE NOTICE 'purge_entity_facet already fixed — skipping';
  ELSIF v_src NOT LIKE '%IF NOT (v_org_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN%' THEN
    RAISE EXCEPTION 'purge_entity_facet: expected buggy clause not found verbatim — aborting';
  ELSE
    v_fixed := replace(
      v_src,
      'IF NOT (v_org_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN',
      'IF NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN'
    );
    IF v_fixed = v_src THEN
      RAISE EXCEPTION 'purge_entity_facet replacement did not match — aborting';
    END IF;
    EXECUTE v_fixed;
    RAISE NOTICE 'Patched purge_entity_facet (ANY(array) -> IN (SELECT ...))';
  END IF;

  -- revert_contact_to_client: v_client.organization_id
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'revert_contact_to_client';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'revert_contact_to_client not found — cannot patch';
  ELSIF v_src LIKE '%IN (SELECT public.get_user_visible_org_ids%' THEN
    RAISE NOTICE 'revert_contact_to_client already fixed — skipping';
  ELSIF v_src NOT LIKE '%IF NOT (v_client.organization_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN%' THEN
    RAISE EXCEPTION 'revert_contact_to_client: expected buggy clause not found verbatim — aborting';
  ELSE
    v_fixed := replace(
      v_src,
      'IF NOT (v_client.organization_id = ANY (public.get_user_visible_org_ids(v_actor))) THEN',
      'IF NOT (v_client.organization_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN'
    );
    IF v_fixed = v_src THEN
      RAISE EXCEPTION 'revert_contact_to_client replacement did not match — aborting';
    END IF;
    EXECUTE v_fixed;
    RAISE NOTICE 'Patched revert_contact_to_client (ANY(array) -> IN (SELECT ...))';
  END IF;
END;
$outer$;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. "Delete Permanently" (purge) from Trash for a deal/quote/proposal/
--    contract, and for a lead/contact/client, no longer raises "op ANY/ALL
--    (array) requires array on right side" (Postgres 42809) — succeeds for
--    an authorized caller, still raises 'Sem permissao' otherwise
--    (authorization behavior unchanged, only the broken operator is fixed).
-- 2. "Revert Contact to Client" no longer raises the same error for an
--    authorized caller.
