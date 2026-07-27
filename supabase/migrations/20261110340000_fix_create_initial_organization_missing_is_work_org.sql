-- ============================================================
-- Fix: create_initial_organization() never sets is_work_org, so a brand
-- new account's very first organization is created with is_work_org = false
-- (the column default) and never becomes visible/selectable.
-- ============================================================
--
-- Bug report (live E2E test): creating an organization from a fresh account
-- with zero organizations shows "Created successfully", but the account is
-- immediately stuck on the "No Organization Found" screen afterwards, even
-- though it just created one.
--
-- Root cause (confirmed by reading the current live code paths, not
-- guessed):
--   1. src/pages/Organizations.tsx `handleCreate()` routes a brand-new
--      account (organizations.length === 0 && !hasPermission
--      ("organizations.create")) to the RPC `create_initial_organization`
--      — a DIFFERENT function from `rpc_create_organization` /
--      `rpc_create_organization_with_hierarchy` (those cover the
--      "add sub-organization to an existing org" flows and were already
--      patched by 20261019010000_fix_org_create_missing_is_work_org.sql).
--   2. `create_initial_organization` (defined in
--      20260615130000_baseline_new_database.sql, never redefined since)
--      DOES correctly call `bootstrap_org_creator()` and even asserts the
--      creator's super_admin membership was created (raises if not) — so
--      the creator's membership is NOT actually missing.
--   3. But its `INSERT INTO public.anew_organizations (...)` never included
--      the `is_work_org` column, so it silently took the column's default
--      of `false` — for every single account onboarding through this path,
--      regardless of the organization type chosen.
--   4. `get_user_work_orgs()` (the single source of truth CompanyContext.tsx
--      uses to decide which orgs are selectable — see
--      20261108030000_organizations_soft_delete_and_restore.sql) only
--      returns organizations where `is_work_org = true`, walking up
--      anew_hierarchy otherwise. A brand-new top-level org has no parent to
--      walk up to, so with is_work_org = false it is invisible: zero rows
--      come back, CompanyContext.tsx sees an empty company list, and the
--      user lands on "No Organization Found" — despite having an active
--      super_admin membership on the org the whole time.
--
-- This fully explains the reported symptom without requiring any change to
-- membership/bootstrap logic, which already works correctly for this flow.
--
-- Fix: mirror 20261019010000_fix_org_create_missing_is_work_org.sql exactly
-- — fetch the function's CURRENT live definition via pg_get_functiondef and
-- apply a targeted, verbatim string replacement on just the INSERT INTO
-- public.anew_organizations statement, adding is_work_org derived STRICTLY
-- from type IN ('holding', 'empresa') (same rule as
-- 20260924010000_add_is_work_org_column.sql and the sibling RPCs). Zero risk
-- of reverting any other change already live on this function.
-- ============================================================

DO $outer$
DECLARE
  v_fn   text := 'create_initial_organization';
  v_src  text;
  v_old  text := $q$INSERT INTO public.anew_organizations (
    id, name, type, description, status, sector, phone, is_fiscal, entity_id, created_by
  )
  VALUES (
    v_organization_id,
    btrim(p_name),
    btrim(p_type),
    nullif(btrim(p_description), ''),
    coalesce(nullif(btrim(p_status), ''), 'active'),
    nullif(btrim(p_sector), ''),
    nullif(btrim(p_phone), ''),
    coalesce(p_is_fiscal, false),
    v_entity_id,
    v_business_user_id
  );$q$;
  v_new  text := $q$INSERT INTO public.anew_organizations (
    id, name, type, description, status, sector, phone, is_fiscal, entity_id, created_by, is_work_org
  )
  VALUES (
    v_organization_id,
    btrim(p_name),
    btrim(p_type),
    nullif(btrim(p_description), ''),
    coalesce(nullif(btrim(p_status), ''), 'active'),
    nullif(btrim(p_sector), ''),
    nullif(btrim(p_phone), ''),
    coalesce(p_is_fiscal, false),
    v_entity_id,
    v_business_user_id,
    btrim(p_type) IN ('holding', 'empresa')
  );$q$;
  v_fixed text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = v_fn;

  IF v_src IS NULL THEN
    RAISE EXCEPTION '% not found — cannot patch', v_fn;
  END IF;

  IF v_src LIKE '%is_work_org%' THEN
    RAISE NOTICE '% already sets is_work_org — skipping', v_fn;
    RETURN;
  END IF;

  IF v_src NOT LIKE '%' || v_old || '%' THEN
    RAISE EXCEPTION '% INSERT statement not found verbatim — aborting instead of silently no-op-ing (live definition may have drifted from baseline; re-derive v_old from pg_get_functiondef before retrying)', v_fn;
  END IF;

  v_fixed := replace(v_src, v_old, v_new);

  IF v_fixed = v_src THEN
    RAISE EXCEPTION '% replacement did not match — aborting to avoid silent no-op', v_fn;
  END IF;

  EXECUTE v_fixed;
  RAISE NOTICE 'Patched % (added is_work_org to INSERT)', v_fn;
END;
$outer$;

-- ── Backfill existing orphaned initial orgs, type-gated (not hierarchy-gated) ──
-- Idempotent and harmless to re-run even where
-- 20261019010000_fix_org_create_missing_is_work_org.sql already applied this
-- same backfill (it is unconditional across the whole table, not scoped to a
-- specific creating RPC, so it already covers rows created via
-- create_initial_organization too — this just guarantees it regardless of
-- migration order/environment).
UPDATE public.anew_organizations
SET is_work_org = true
WHERE type IN ('holding', 'empresa')
  AND is_work_org = false;
