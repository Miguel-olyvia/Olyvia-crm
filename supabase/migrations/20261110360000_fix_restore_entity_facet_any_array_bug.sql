-- Fix restore_entity_facet: same "= ANY (array)" bug already fixed multiple
-- times before in this codebase for sibling functions, reintroduced here by
-- 20261110350000_fix_restore_entity_facet_org_check.sql.
--
-- Problem
-- -------
-- get_user_visible_org_ids(_auth_uid) RETURNS SETOF uuid, not uuid[]. It can
-- never be the direct right-hand operand of `= ANY (...)` — that requires an
-- actual array value. The correct pattern, already established by
-- 20260915010000_fix_soft_delete_business_entity_impl_any_array_bug.sql and
-- 20261108120000_fix_restore_business_entity_any_array_bug.sql (the sibling
-- restore function for deals/quotes/proposals/contracts), is
-- `IN (SELECT get_user_visible_org_ids(...))`.
--
-- 20261110350000 copied the pre-fix (buggy) form of restore_business_entity
-- instead of its current, already-corrected definition, introducing:
--   IF NOT (v_org_id = ANY (public.get_user_visible_org_ids(v_auth))) THEN
-- Found live during 8th-round regression retesting: restoring ANY lead/
-- contact/client from Trash — including the caller's own record — now fails
-- with Postgres 42809 "op ANY/ALL (array) requires array on right side".
-- This is a functional break (fails closed, not a security regression), but
-- it makes the Trash "Restore" action completely unusable for every user.
--
-- Fix: same textual substitution pattern as the two prior fixes above —
-- `= ANY (public.get_user_visible_org_ids(v_auth))` -> `IN (SELECT
-- public.get_user_visible_org_ids(v_auth))`. Nothing else in the function
-- changes.

DO $outer$
DECLARE
  v_fn   text := 'restore_entity_facet';
  v_src  text;
  v_old  text := 'IF NOT (v_org_id = ANY (public.get_user_visible_org_ids(v_auth))) THEN';
  v_new  text := 'IF NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_auth))) THEN';
  v_fixed text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = v_fn;

  IF v_src IS NULL THEN
    RAISE EXCEPTION '% not found — cannot patch', v_fn;
  END IF;

  IF v_src LIKE '%IN (SELECT public.get_user_visible_org_ids%' THEN
    RAISE NOTICE '% already uses the correct IN (SELECT ...) form — skipping', v_fn;
    RETURN;
  END IF;

  IF v_src NOT LIKE '%' || v_old || '%' THEN
    RAISE EXCEPTION '% expected buggy ANY(...) clause not found verbatim — aborting instead of silently no-op-ing (live definition may have drifted; re-derive v_old from pg_get_functiondef before retrying)', v_fn;
  END IF;

  v_fixed := replace(v_src, v_old, v_new);

  IF v_fixed = v_src THEN
    RAISE EXCEPTION '% replacement did not match — aborting to avoid silent no-op', v_fn;
  END IF;

  EXECUTE v_fixed;
  RAISE NOTICE 'Patched % (ANY(array) -> IN (SELECT ...))', v_fn;
END;
$outer$;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Restoring a soft-deleted lead/contact/client the caller can see (their
--    own org) via src/pages/Trash.tsx no longer raises "op ANY/ALL (array)
--    requires array on right side" (Postgres 42809).
-- 2. A caller whose visible orgs do not include the target row's
--    organization_id still raises 'Sem permissao' (insufficient_privilege) —
--    authorization behavior from 20261110350000 is unchanged, only the
--    broken operator is fixed.
