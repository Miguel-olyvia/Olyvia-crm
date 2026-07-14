-- Deals — fix bulk-delete inconsistency: rpc_bulk_delete_deal still hard-deletes
-- 2026-11-08 | Module: Deals
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- The individual delete path for deals (soft_delete_business_entity('deal', id),
-- baseline + 20260914010000/20260915010000 fixes) is a recoverable soft-delete:
-- it sets deals.deleted_at/deleted_by and leaves the row (and deal_needs /
-- deal_need_items) in place, restorable via restore_business_entity in
-- src/pages/Trash.tsx.
--
-- rpc_bulk_delete_deal (20260816010000), wired to the SAME module's bulk-select
-- "eliminar" action in Deals.tsx (via useBulkActions' bulkDeleteRpc), instead
-- does:
--   DELETE FROM deal_need_items ...
--   DELETE FROM deal_needs ...
--   DELETE FROM deals ...
-- an irreversible hard delete — inconsistent with the single-delete path in the
-- exact same module, and with the project-wide "nothing hard-deletes" rule
-- already applied to clients/contacts/leads/deals(single)/quotes/proposals/
-- contracts/users.
--
-- Solution
-- --------
-- Replace the three DELETEs with the same UPDATE ... SET deleted_at = now(),
-- deleted_by = v_actor pattern _soft_delete_business_entity_impl uses for
-- 'deal' (20260915010000), scoped the same way (WHERE deleted_at IS NULL, so
-- an already-deleted deal in the selection is silently skipped — same
-- idempotency behavior as the single-delete path). deal_needs/deal_need_items
-- are NOT touched at all (no FK cascade risk anymore, since nothing is
-- removed) — they simply become invisible via the deal's own soft-delete,
-- exactly like the single-delete path already leaves them.
--
-- The audit-bypass foundation, authorization check (fn_deal_org_in_scope),
-- id-dedup, and one-manual-audit-row-per-deal shape are all unchanged from
-- 20260816010000 — only the DML for the deal itself changes from DELETE to
-- UPDATE (deleted_at/deleted_by), and the audit operation from 'DELETE' to
-- 'UPDATE' (the row is never removed) with a diff scoped to the two columns
-- that actually changed, matching soft_delete_business_entity's own audit
-- shape (fn_generic_entity_audit's UPDATE trigger would produce the same
-- shape if it weren't bypassed here).
--
-- Restore parity
-- --------------
-- restore_business_entity('deal', id) (baseline) already reverses exactly
-- this UPDATE (deleted_at = NULL, deleted_by = NULL) one row at a time, so a
-- bulk-deleted deal is already restorable today from src/pages/Trash.tsx with
-- no further change needed.
--
-- Prerequisites:
--   20260816010000_deals_bulk_delete_rpc.sql            — rpc_bulk_delete_deal (being replaced)
--   20260915010000_fix_soft_delete_business_entity_impl_any_array_bug.sql — soft-delete shape for 'deal'
--   20260719010000_roles_audit_bypass_and_rpcs.sql      — app.audit_bypass GUC + fn_manual_audit_log()
--   20260730010000_deals_audit_bypass_and_rpcs.sql      — fn_deal_org_in_scope()

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
  -- suppressing the trigger fan-out on deals.
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

  -- ── Soft-delete the in-scope, not-yet-deleted rows; audit once each ───────
  -- Scoping by organization_id = p_organization_id reproduces the FE's
  -- .in("id", ids).eq("organization_id", org): a deal whose org differs from
  -- the active org is silently skipped. deleted_at IS NULL makes this
  -- idempotent for already-deleted deals in the selection, matching
  -- soft_delete_business_entity's own guard.
  FOR v_before IN
    SELECT * FROM public.deals
    WHERE id = ANY (v_ids)
      AND organization_id = p_organization_id
      AND deleted_at IS NULL
  LOOP
    UPDATE public.deals
    SET    deleted_at = now(), deleted_by = v_actor
    WHERE  id = v_before.id
      AND  organization_id = p_organization_id;

    -- One consolidated UPDATE audit row per deal — the row is never removed.
    PERFORM public.fn_manual_audit_log(
      'deals',
      v_before.id,
      p_organization_id,
      'UPDATE',
      jsonb_build_object(
        'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
        'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
      ),
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
-- 1. Bulk-deleting N deals leaves all N rows in public.deals (row count
--    unchanged), each with deleted_at set and deleted_by = the caller:
--   SELECT count(*) FROM public.deals WHERE id = ANY(ARRAY[...]) AND deleted_at IS NOT NULL;
--   -- Expected: N. SELECT count(*) FROM public.deals WHERE id = ANY(ARRAY[...]);
--   -- Expected: still N (nothing removed).
--
-- 2. Exactly N entity_audit_log rows are produced (operation='UPDATE'), not
--    DELETE, and deal_needs/deal_need_items are completely untouched (no
--    trigger rows, no removed child rows).
--
-- 3. restore_business_entity('deal', id) (baseline, unchanged) reverses the
--    bulk soft-delete exactly like it already does for the single-delete path.
--
-- 4. A deal whose organization_id differs from p_organization_id, or one
--    already deleted_at IS NOT NULL, is skipped (not touched, not audited).
