-- ============================================================
-- Fix: rpc_create_organization / rpc_create_organization_with_hierarchy
-- never set is_work_org on INSERT, so it always takes the column default
-- (false) -- even for a top-level 'empresa'/'holding' org. Per
-- 20260924010000_add_is_work_org_column.sql, is_work_org must be derived
-- STRICTLY from type IN ('holding','empresa'), never from hierarchy
-- position (parent presence). This is why "Create Organization" at the
-- top level produces an org that never shows up wherever the UI filters
-- on is_work_org = true.
--
-- SAFE PATCH METHOD (mirroring 20261017010000_fix_bootstrap_org_creator_
-- permission_mismatch.sql): fetch each function's CURRENT live definition
-- via pg_get_functiondef and apply a targeted, verbatim string replacement
-- on just the INSERT INTO public.anew_organizations statement, adding the
-- is_work_org column/value. Zero risk of reverting any other change
-- already live on these functions (e.g. the organizations.create
-- permission fix from 20260905010000) since nothing else in the source is
-- touched. Uses dollar-quoting ($q$...$q$) for the old/new fragments so no
-- single-quote doubling is needed (avoids the escaping-error class
-- entirely).
-- ============================================================

DO $outer1$
DECLARE
  v_fn   text := 'rpc_create_organization';
  v_src  text;
  v_old  text := $q$(id, name, type, description, status, sector, phone, is_fiscal, entity_id, created_by)
  VALUES
    (v_new_org_id,
     p_name,
     p_type,
     nullif(p_description, ''),
     p_status,
     v_sector,
     nullif(btrim(coalesce(p_phone, '')), ''),
     COALESCE(p_is_fiscal, false),
     v_entity_id,
     v_actor)
  RETURNING * INTO v_org;$q$;
  v_new  text := $q$(id, name, type, description, status, sector, phone, is_fiscal, entity_id, created_by, is_work_org)
  VALUES
    (v_new_org_id,
     p_name,
     p_type,
     nullif(p_description, ''),
     p_status,
     v_sector,
     nullif(btrim(coalesce(p_phone, '')), ''),
     COALESCE(p_is_fiscal, false),
     v_entity_id,
     v_actor,
     p_type IN ('holding', 'empresa'))
  RETURNING * INTO v_org;$q$;
  v_fixed text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = v_fn;

  IF v_src IS NULL THEN
    RAISE EXCEPTION '% not found — cannot patch', v_fn;
  END IF;

  IF v_src NOT LIKE '%is_fiscal, entity_id, created_by)%' THEN
    RAISE NOTICE '% INSERT column list not found verbatim — skipping (already patched or changed)', v_fn;
    RETURN;
  END IF;

  v_fixed := replace(v_src, v_old, v_new);

  IF v_fixed = v_src THEN
    RAISE EXCEPTION '% replacement did not match — aborting to avoid silent no-op', v_fn;
  END IF;

  EXECUTE v_fixed;
  RAISE NOTICE 'Patched % (added is_work_org to INSERT)', v_fn;
END;
$outer1$;

DO $outer2$
DECLARE
  v_fn   text := 'rpc_create_organization_with_hierarchy';
  v_src  text;
  v_old  text := $q$(id, name, type, description, status, sector, is_fiscal, entity_id, created_by)
  VALUES
    (v_new_org_id,
     p_name,
     COALESCE(p_type, 'departamento'),
     nullif(p_description, ''),
     COALESCE(nullif(p_status, ''), 'active'),
     nullif(p_sector, ''),
     COALESCE(p_is_fiscal, false),
     v_entity_id,
     v_actor)
  RETURNING * INTO v_org;$q$;
  v_new  text := $q$(id, name, type, description, status, sector, is_fiscal, entity_id, created_by, is_work_org)
  VALUES
    (v_new_org_id,
     p_name,
     COALESCE(p_type, 'departamento'),
     nullif(p_description, ''),
     COALESCE(nullif(p_status, ''), 'active'),
     nullif(p_sector, ''),
     COALESCE(p_is_fiscal, false),
     v_entity_id,
     v_actor,
     COALESCE(p_type, 'departamento') IN ('holding', 'empresa'))
  RETURNING * INTO v_org;$q$;
  v_fixed text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = v_fn;

  IF v_src IS NULL THEN
    RAISE EXCEPTION '% not found — cannot patch', v_fn;
  END IF;

  IF v_src NOT LIKE '%is_fiscal, entity_id, created_by)%' THEN
    RAISE NOTICE '% INSERT column list not found verbatim — skipping (already patched or changed)', v_fn;
    RETURN;
  END IF;

  v_fixed := replace(v_src, v_old, v_new);

  IF v_fixed = v_src THEN
    RAISE EXCEPTION '% replacement did not match — aborting to avoid silent no-op', v_fn;
  END IF;

  EXECUTE v_fixed;
  RAISE NOTICE 'Patched % (added is_work_org to INSERT)', v_fn;
END;
$outer2$;

-- ── Backfill existing orphaned top-level orgs, type-gated (not hierarchy-gated) ──
-- Only touches rows that are actually holding/empresa AND currently false.
UPDATE public.anew_organizations
SET is_work_org = true
WHERE type IN ('holding', 'empresa')
  AND is_work_org = false;
