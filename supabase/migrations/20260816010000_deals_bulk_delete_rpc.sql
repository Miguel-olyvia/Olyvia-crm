-- Deals / Pedidos Proposta — bulk-delete RPC (single-log, audit-bypass foundation)
-- 2026-08-16 | Module: Deals
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- src/pages/Deals.tsx wires exactly ONE hook-driven bulk action through
-- src/components/BulkActionsBar (rendered with showOrgAction={false}):
--   · onDeleteClick -> BulkDeleteDialog -> onConfirm = handleBulkDelete
--     (the useBulkActions hook's own handler; the hook is initialized with
--      { tableName: "deals", softDelete: false } and NO bulkDeleteRpc, so today it
--      issues a raw .delete().in("id", ids).eq("organization_id", org) on deals.)
-- The other bulk affordance in Deals.tsx — the "change status" button — is bound to a
-- CUSTOM local handler handleBulkStageChange (NOT the hook's handleBulkStatusChange),
-- which calls the existing bulk_update_deal_stage RPC and rewrites deals.stage_id. There
-- is no is_active bulk-status concept for deals, so NO rpc_bulk_status_deal is created
-- (it would be dead code with no caller). And because BulkActionsBar is rendered with
-- showOrgAction={false}, there is no bulk "change organization" affordance for deals, so
-- NO rpc_bulk_org_deal is created either. Only the bulk DELETE path exists in the UI.
--
-- The raw bulk delete fires the deals AFTER audit trigger (fn_generic_entity_audit) once
-- per row, plus additional trigger rows for any cascaded child rows in deal_needs /
-- deal_need_items — producing N (or more) audit rows when the business intent is exactly
-- one DELETE per selected deal.
--
-- Solution
-- --------
-- This migration REUSES the audit-bypass FOUNDATION created in
-- 20260719010000_roles_audit_bypass_and_rpcs.sql and already relied on by the Deals
-- module in 20260730010000_deals_audit_bypass_and_rpcs.sql:
--   · the app.audit_bypass GUC guard already present at the top of
--     fn_generic_entity_audit()
--   · fn_manual_audit_log(text, uuid, uuid, text, jsonb, text) — writes exactly ONE
--     entity_audit_log row, reusing the same author-resolution chain as the triggers.
-- The foundation is NOT recreated here. No trigger functions are touched (the deals /
-- deal_needs / deal_need_items triggers are the generic fn_generic_entity_audit, already
-- guarded by 20260719010000).
--
-- rpc_bulk_delete_deal reproduces, condition-for-condition, what useBulkActions.handleBulkDelete
-- does today for deals (softDelete:false, organizationId = active company):
--   · DELETE FROM deals WHERE id = ANY(selected) AND organization_id = active org.
-- It runs the whole batch inside a single transaction with app.audit_bypass = 'on', and
-- emits ONE consolidated DELETE audit row per affected deal (the audit log is per-entity;
-- a single log row cannot represent multiple distinct deals), while suppressing the extra
-- trigger noise the raw multi-row delete (and its child-row cascade) would have produced.
-- Child rows in deal_need_items / deal_needs are removed explicitly first (delete-children-
-- before-parent), matching the effect the FE relies on via DB cascade and keeping the
-- operation self-contained under one audit-bypass window — the same pattern used by
-- rpc_bulk_delete_brand for its junction rows in 20260807020000_brands_audit_bypass_and_rpcs.sql.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPC is SECURITY DEFINER, so RLS on deals does NOT self-enforce inside it. It
-- re-checks, explicitly, the SAME predicate the deals_delete RLS policy enforces today
-- ("Users can delete deals in their org", baseline 20260615130000):
--   organization_id IN get_user_visible_org_ids(auth.uid())
-- evaluated via the shared helper fn_deal_org_in_scope(org) created in
-- 20260730010000_deals_audit_bypass_and_rpcs.sql. Each row is additionally scoped by
-- organization_id = p_organization_id, exactly mirroring the FE's
-- .in("id", ids).eq("organization_id", org). deal_needs / deal_need_items have no org
-- column of their own; their RLS derives visibility from the parent deal's org, so scoping
-- by the parent deal is the correct, identical boundary.
--
-- Behavior divergence (documented, intentional — created_by author)
-- -----------------------------------------------------------------
-- The RPC uses current_business_user_id() and RAISEs 'Perfil de utilizador não encontrado'
-- when NULL — the same fail-closed behavior as every other audit-bypass RPC in this
-- codebase, and matching the FE which aborts when resolveCurrentBusinessUserId() is null.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql            — entity_audit_log, fn_generic_entity_audit()
--   20260719010000_roles_audit_bypass_and_rpcs.sql — app.audit_bypass guard + fn_manual_audit_log()
--   20260730010000_deals_audit_bypass_and_rpcs.sql — fn_deal_org_in_scope()
--   20260615130000_baseline_new_database.sql       — current_business_user_id(), deals +
--                                                     deal_needs + deal_need_items + RLS


-- ============================================================
-- rpc_bulk_delete_deal(...)
-- ============================================================
-- Mirrors handleBulkDelete() in src/hooks/useBulkActions.ts (softDelete:false as wired by
-- Deals.tsx, organizationId = active company). Returns the number of deals deleted.

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_deal(
  p_ids             uuid[],
  p_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_ids         uuid[];
  v_before      public.deals;
  v_count       integer := 0;
BEGIN
  -- Consolidate all writes into per-entity audit rows via fn_manual_audit_log,
  -- suppressing the trigger fan-out (deals + cascaded deal_needs/deal_need_items).
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para eliminação em massa'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Authorization parity with deals_delete RLS ────────────────────────────
  -- The .eq(organization_id) FE scope + the deals_delete policy both require the
  -- target org be visible to the caller.
  IF NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Dedup ids (mirrors the Set-backed selection, ignore NULLs) ────────────
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

  -- ── Iterate the in-scope rows; delete children then the deal; audit once each ──
  -- Scoping each delete by organization_id = p_organization_id reproduces the FE's
  -- .in("id", ids).eq("organization_id", org): a deal whose org differs from the
  -- active org is silently skipped, exactly as the raw path would leave it untouched.
  FOR v_before IN
    SELECT * FROM public.deals
    WHERE id = ANY (v_ids)
      AND organization_id = p_organization_id
  LOOP
    -- Delete children before parent (matches the DB cascade the raw path relies on),
    -- all under the same audit-bypass window so no child trigger rows are written.
    DELETE FROM public.deal_need_items dni
    USING public.deal_needs dn
    WHERE dni.deal_need_id = dn.id
      AND dn.deal_id = v_before.id;

    DELETE FROM public.deal_needs WHERE deal_id = v_before.id;

    DELETE FROM public.deals
    WHERE id = v_before.id
      AND organization_id = p_organization_id;

    -- One consolidated DELETE audit row per deal: full snapshot of the removed deal.
    PERFORM public.fn_manual_audit_log(
      'deals',
      v_before.id,
      p_organization_id,
      'DELETE',
      jsonb_build_object('deals', jsonb_build_object(
        'title',               jsonb_build_object('old', to_jsonb(v_before.title),               'new', NULL),
        'value',               jsonb_build_object('old', to_jsonb(v_before.value),               'new', NULL),
        'stage_id',            jsonb_build_object('old', to_jsonb(v_before.stage_id),            'new', NULL),
        'probability',         jsonb_build_object('old', to_jsonb(v_before.probability),         'new', NULL),
        'expected_close_date', jsonb_build_object('old', to_jsonb(v_before.expected_close_date), 'new', NULL),
        'description',         jsonb_build_object('old', to_jsonb(v_before.description),         'new', NULL),
        'lost_reason',         jsonb_build_object('old', to_jsonb(v_before.lost_reason),         'new', NULL),
        'lead_id',             jsonb_build_object('old', to_jsonb(v_before.lead_id),             'new', NULL),
        'client_id',           jsonb_build_object('old', to_jsonb(v_before.client_id),           'new', NULL),
        'contact_id',          jsonb_build_object('old', to_jsonb(v_before.contact_id),          'new', NULL),
        'entity_id',           jsonb_build_object('old', to_jsonb(v_before.entity_id),           'new', NULL),
        'organization_id',     jsonb_build_object('old', to_jsonb(v_before.organization_id),     'new', NULL)
      )),
      'web_app'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_delete_deal(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_delete_deal(uuid[], uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Function exists with the audit-bypass guard call:
--   SELECT proname FROM pg_proc
--   WHERE proname = 'rpc_bulk_delete_deal' AND prosrc LIKE '%app.audit_bypass%';
--   -- Expected: one row.
--
-- 2. Bulk-deleting N deals (some with deal_needs/deal_need_items) produces exactly N
--    audit rows (one DELETE per deal), NOT N + child-trigger rows:
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'deals' AND operation = 'DELETE'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: N.
--
-- 3. A deal whose organization_id differs from p_organization_id is skipped (not
--    deleted, not audited) — mirroring the FE .eq("organization_id", org) scope.
--
-- 4. p_organization_id outside the caller's visible orgs raises insufficient_privilege,
--    mirroring the deals_delete RLS policy.
