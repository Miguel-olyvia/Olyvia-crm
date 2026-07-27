-- ============================================================
-- Fix: bootstrap_org_creator() still gates on 'organizations.manage'
-- ============================================================
-- Confirmed via live E2E testing that 'Create Organization' fails with
-- 'Not authorized to bootstrap organization' (P0001) even for a role that
-- HAS the organizations.create permission and successfully passes the
-- has_anew_permission(auth.uid(), 'organizations.create') check inside
-- rpc_create_organization / rpc_create_organization_with_hierarchy.
--
-- Root cause: 20260905010000_fix_organizations_manage_permission_mismatch
-- already documented that 'organizations.manage' was NEVER seeded into
-- anew_permissions and NEVER granted to any role, and patched
-- rpc_create_organization, rpc_update_organization, rpc_delete_organization
-- and rpc_create_organization_with_hierarchy to check organizations.create/
-- edit/delete instead. That migration's patch list, however, did not
-- include bootstrap_org_creator() — a helper invoked internally by those
-- RPCs right after the new anew_organizations row is inserted (see
-- baseline migration 20260615130000, where
-- PERFORM public.bootstrap_org_creator(...) is called from
-- rpc_create_organization_with_hierarchy). bootstrap_org_creator() still
-- contains the original, permanently-unsatisfiable check:
--   v_has_perm := public.has_anew_permission(v_auth_uid, 'organizations.manage');
--   IF v_registration_origin != 'self_registration' AND NOT v_has_perm THEN
--     RAISE EXCEPTION 'Not authorized to bootstrap organization';
--   END IF;
-- so any non-self-registration caller — even one with organizations.create —
-- is unconditionally rejected here, after the outer RPC's own permission
-- check already passed.
--
-- SAFE PATCH METHOD: mirroring 20260905010000 exactly, rather than
-- hand-retype this function body (risking a transcription error against a
-- signature/DECLARE block not fully re-read), fetch the function's CURRENT
-- live definition via pg_get_functiondef and reapply it with only the
-- permission-code string corrected to 'organizations.create' (the same
-- permission rpc_create_organization/rpc_create_organization_with_hierarchy
-- already require before calling this helper). Zero risk of silently
-- dropping a parameter, local variable, or changing the return contract.

DO $$
DECLARE
  v_fn text := 'bootstrap_org_creator';
  v_src text;
  v_fixed text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = v_fn;

  IF v_src IS NULL THEN
    RAISE EXCEPTION '% not found — cannot patch', v_fn;
  END IF;

  IF v_src NOT LIKE '%organizations.manage%' THEN
    RAISE NOTICE '% does not reference organizations.manage — skipping (already fixed or different check)', v_fn;
    RETURN;
  END IF;

  v_fixed := replace(v_src, 'organizations.manage', 'organizations.create');

  EXECUTE v_fixed;
  RAISE NOTICE 'Patched %', v_fn;
END;
$$;
