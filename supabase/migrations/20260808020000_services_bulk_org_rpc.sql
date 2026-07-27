-- Serviços — bulk-org single-log RPC (reuses the audit-bypass foundation)
-- 2026-08-08 | Module: Serviços / servicos
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- 20260808010000_services_audit_bypass_and_rpcs.sql added the create/update/delete and the
-- bulk status/delete single-log RPCs for the Serviços module, but did NOT add the bulk
-- "reassign organization" RPC. useBulkActions.handleBulkCompanyChange (src/hooks/useBulkActions.ts)
-- issues, when a bulkOrgRpc is configured:
--   supabase.rpc(bulkOrgRpc, { p_ids, p_organization_id, p_new_org_id })   (default param name)
-- and otherwise falls back to a raw
--   UPDATE <table> SET organization_id = <new> WHERE id IN (selected) AND organization_id = <scope>
-- which fires the services AFTER trigger once per row → N audit rows for one bulk action.
--
-- This migration adds rpc_bulk_org_service so the Serviços module has full bulk parity with the
-- Marcas module (rpc_bulk_status_brand / rpc_bulk_delete_brand / rpc_bulk_org_brand). It mirrors
-- rpc_bulk_org_brand field-for-field, adapted to the services table conventions established in
-- 20260808010000 (no admin OR-branch on the services table itself; (SELECT auth.uid());
-- not_null_violation for a missing scope org; audit routed under the row's org).
--
-- Solution
-- --------
-- The audit-bypass foundation (app.audit_bypass GUC + fn_manual_audit_log) and the guarded
-- services trigger functions (fn_generic_entity_audit — covers services / service_organizations;
-- fn_audit_service_prices) already exist (20260719010000 + 20260808010000). This migration REUSES
-- them and creates NO foundation and touches NO trigger.
--
-- rpc_bulk_org_service runs inside a single transaction with app.audit_bypass='on', UPDATEs
-- organization_id on the in-scope rows, and calls fn_manual_audit_log ONCE per affected service
-- (the audit log is per-entity; a single row cannot represent multiple distinct entities) — but
-- NONE of the extra trigger rows the raw multi-row path would produce, and the whole batch is one
-- atomic transaction.
--
-- Authorization / RLS parity
-- --------------------------
-- SECURITY DEFINER, so services RLS does NOT self-enforce here. The RPC re-checks the SAME
-- predicate services_update enforces today (baseline 20260615130000 + 20260702000000):
--   services_update : organization_id IN visible_orgs
--                     AND has_anew_permission(uid,'services.edit')   (USING + WITH CHECK)
-- Reassigning organization_id means BOTH the pre-image (scope) org AND the post-image (target)
-- org must be visible to the caller — the USING clause gates the pre-image and the WITH CHECK
-- gates the post-image, exactly as an RLS-enforced UPDATE would. The services policies have NO
-- admin OR-branch in the baseline, so this RPC has none either (matching 20260808010000).
--
-- Note on service_organizations: this bulk action changes only services.organization_id, exactly
-- like the FE raw fallback (UPDATE ... SET organization_id). It does NOT touch the
-- service_organizations junction — parity with handleBulkCompanyChange, which updates only the
-- primary organization_id column.
--
-- Prerequisites:
--   20260808010000_services_audit_bypass_and_rpcs.sql — sibling bulk RPCs + guarded triggers
--   20260719010000_roles_audit_bypass_and_rpcs.sql    — app.audit_bypass guard + fn_manual_audit_log()
--   20260702000000_services_security_fixes.sql        — services RLS mirrored here
--   20260615130000_baseline_new_database.sql          — services RLS, has_anew_permission(),
--                                                       current_business_user_id(),
--                                                       get_user_visible_org_ids(),
--                                                       is_system_admin_user()


-- ============================================================
-- rpc_bulk_org_service(...)
-- ============================================================
-- Mirrors useBulkActions.handleBulkCompanyChange('organization_id') for the services table
-- (organizationId = active company scope filter; bulkNewCompanyId = target org):
--   UPDATE services SET organization_id = <new org>
--     WHERE id IN (selectedIds) AND organization_id = organizationId
-- The hook always scopes bulk writes to a single organizationId (throws if absent) and only fires
-- when bulkNewCompanyId is truthy. We reproduce that exact scope. One consolidated UPDATE audit
-- row is emitted per service actually reassigned (organization_id genuinely changes). Returns the
-- count.
--
-- Parameter name p_new_org_id matches rpc_bulk_org_brand and the hook default
-- (bulkOrgRpcNewOrgParam = "p_new_org_id").
--
-- Authorization mirrors services_update (pre + post org visible).

CREATE OR REPLACE FUNCTION public.rpc_bulk_org_service(
  p_ids             uuid[],
  p_organization_id uuid,
  p_new_org_id      uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_uid    uuid := (SELECT auth.uid());
  v_rec    record;
  v_diff   jsonb;
  v_count  integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório' USING ERRCODE = 'not_null_violation';
  END IF;
  -- The FE only fires when bulkNewCompanyId is truthy.
  IF p_new_org_id IS NULL THEN
    RAISE EXCEPTION 'Empresa de destino obrigatória' USING ERRCODE = 'not_null_violation';
  END IF;

  -- ── Authorization parity with services_update (pre + post org visible) ────
  IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- USING: pre-update (scope) org must be visible.
  IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- WITH CHECK: post-update (target) org must be visible.
  IF NOT (p_new_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Update only rows in the scope org whose org actually changes; one audit row each,
  -- routed under the NEW org (the row's post-update org), matching the trigger which reads
  -- NEW.organization_id.
  FOR v_rec IN
    UPDATE public.services s
    SET organization_id = p_new_org_id
    WHERE s.id = ANY(p_ids)
      AND s.organization_id = p_organization_id
      AND s.organization_id IS DISTINCT FROM p_new_org_id
    RETURNING s.id, p_organization_id AS old_org, p_new_org_id AS new_org
  LOOP
    v_diff := jsonb_build_object(
      'services', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_rec.old_org), 'new', to_jsonb(v_rec.new_org))
      )
    );
    PERFORM public.fn_manual_audit_log(
      'services', v_rec.id, v_rec.new_org, 'UPDATE', v_diff, 'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_org_service(uuid[], uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_org_service(uuid[], uuid, uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Function exists with the expected signature and is granted to authenticated:
--   SELECT proname, pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'rpc_bulk_org_service';
--   -- Expected: rpc_bulk_org_service | p_ids uuid[], p_organization_id uuid, p_new_org_id uuid
--
-- 2. A bulk org reassignment over N in-scope services yields exactly N audit rows (one per
--    service entity), each an UPDATE with a single services.organization_id diff — NOT the
--    N-row trigger fan-out the raw UPDATE path produces:
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'services' AND operation = 'UPDATE'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: N (services already in the target org are skipped by the IS DISTINCT FROM guard).
--
-- 3. A caller without services.edit — or a scope/target org outside their visible set —
--    raises insufficient_privilege, mirroring services_update USING + WITH CHECK. A NULL scope
--    or NULL target org raises not_null_violation, matching the hook's guard.
