-- Bundles — restore RPCs (soft delete already existed, no restore path)
-- 2026-11-07 | Module: Bundles — bundles
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- rpc_delete_bundle / rpc_bulk_delete_bundle (20260809010000 / 20260816030000)
-- already soft-delete (UPDATE bundles SET deleted_at=now()), which is correct,
-- but there is no rpc_restore_bundle / rpc_bulk_restore_bundle and Bundles.tsx
-- has no UI to reach a restore path (not in Trash.tsx either) — a deleted
-- bundle is de facto unrecoverable even though the data survives.
--
-- Solution
-- --------
-- Add rpc_restore_bundle(p_id, p_organization_id) and
-- rpc_bulk_restore_bundle(p_ids, p_organization_id), the exact inverse of
-- rpc_delete_bundle / rpc_bulk_delete_bundle (deleted_at → NULL), audited the
-- same way (one consolidated UPDATE row per bundle).
--
-- Authorization mirrors the existing 'products.manage' check already enforced
-- by rpc_delete_bundle / rpc_bulk_delete_bundle. Restore reuses the same
-- permission — restoring is the direct inverse of deleting (matches
-- rpc_restore_user's rationale).
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — fn_manual_audit_log()
--   20260704000000_bundles_security_fixes.sql       — RLS/authz mirrored here
--   20260809010000_bundles_audit_bypass_and_rpcs.sql — rpc_delete_bundle (mirrored, not touched)
--   20260816030000_bundles_bulk_rpcs.sql             — rpc_bulk_delete_bundle (mirrored, not touched)
--   20260615130000_baseline_new_database.sql


-- ============================================================
-- 1. rpc_restore_bundle(...)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_restore_bundle(
  p_id              uuid,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_before   public.bundles;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.bundles
  WHERE id = p_id
    AND organization_id = p_organization_id
    AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Bundle fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  UPDATE public.bundles
  SET deleted_at = NULL
  WHERE id = p_id
    AND organization_id = p_organization_id
    AND deleted_at IS NOT NULL;

  IF v_before.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundles', p_id, v_before.organization_id, 'UPDATE',
      jsonb_build_object('bundles', jsonb_build_object(
        'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
      )),
      'web_app'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_bundle(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_bundle(uuid, uuid) TO authenticated;


-- ============================================================
-- 2. rpc_bulk_restore_bundle(...)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_bulk_restore_bundle(
  p_ids             uuid[],
  p_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_ids      uuid[];
  v_before   public.bundles;
  v_count    integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para restauro em massa'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_ids IS NULL THEN
    v_ids := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT o), ARRAY[]::uuid[])
    INTO   v_ids
    FROM   unnest(p_ids) AS u(o)
    WHERE  o IS NOT NULL;
  END IF;

  IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOR v_before IN
    SELECT *
    FROM   public.bundles b
    WHERE  b.id = ANY (v_ids)
      AND  b.organization_id = p_organization_id
      AND  b.deleted_at IS NOT NULL
    FOR UPDATE
  LOOP
    UPDATE public.bundles
    SET deleted_at = NULL
    WHERE id = v_before.id;

    IF v_before.organization_id IS NOT NULL THEN
      PERFORM public.fn_manual_audit_log(
        'bundles', v_before.id, v_before.organization_id, 'UPDATE',
        jsonb_build_object('bundles', jsonb_build_object(
          'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
        )),
        'web_app'
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_restore_bundle(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_restore_bundle(uuid[], uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. rpc_restore_bundle / rpc_bulk_restore_bundle exist with the expected signatures.
-- 2. A deleted bundle (deleted_at set) reappears in Bundles.tsx's default query
--    (.is("deleted_at", null)) after being restored via either RPC, with all
--    bundle_components / bundle_choice_groups intact (never touched by delete/restore).
