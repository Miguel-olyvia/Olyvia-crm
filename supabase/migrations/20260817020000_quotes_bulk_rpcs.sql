-- Orçamentos (Quotes) — bulk-action RPCs on the audit-bypass foundation
-- 2026-08-17 | Module: Orçamentos
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- The Quotes list (src/pages/Quotes.tsx) exposes bulk actions through <BulkActionsBar>.
-- Confirmed by reading the page, the bar is wired with EXACTLY two actions:
--       <BulkActionsBar
--         onStatusClick={() => setBulkStatusDialogOpen(true)}   -- bulk STATUS change
--         onDeleteClick={() => setBulkDeleteDialogOpen(true)}   -- bulk DELETE
--         showOrgAction={false}                                 -- NO org/company action
--         statusPermission="quotes.edit" deletePermission="quotes.delete" />
-- Because showOrgAction={false}, there is NO bulk "change organization" control in the UI,
-- so this migration deliberately creates NO rpc_bulk_org_quote (YAGNI — the UI never calls it).
-- The two wired handlers today issue N raw multi-row statements, chunked 30 ids at a time:
--   · status : Quotes.tsx handleBulkStatusChange() (the page defines its OWN, NOT the hook's) —
--              for each chunk: UPDATE public.quotes SET estado = <bulkNewStatus> WHERE id IN (chunk)
--              (see Quotes.tsx ~lines 1074-1097). No .eq(organization_id) filter today; RLS scopes it.
--   · delete : useBulkActions.handleBulkDelete() as wired by Quotes.tsx — the page passes NO
--              bulkDeleteRpc and NO softDelete, so the hook currently runs a HARD
--              DELETE ... WHERE id IN (ids) AND organization_id = <active org> (useBulkActions.ts §handleBulkDelete).
-- Each raw statement fires the AFTER trigger on `quotes` (fn_generic_entity_audit) once per row,
-- which is acceptable for per-row audit but does the write outside the app's single-audit-row
-- convention and, for delete, HARD-deletes rows whereas the rest of the module SOFT-deletes.
--
-- Solution
-- --------
-- The audit-bypass FOUNDATION already exists (Roles module, 20260719010000_roles_audit_bypass_and_rpcs.sql):
--   · GUC `app.audit_bypass` — when 'on' (SET LOCAL), guarded audit trigger functions short-circuit.
--   · fn_manual_audit_log(text table, uuid entity, uuid org, text op, jsonb diff, text source) — writes
--     exactly ONE row to entity_audit_log, reusing the trigger author-resolution chain. Never raises.
-- The quotes trigger (fn_generic_entity_audit) is ALREADY guarded (20260719010000) and the quote-child /
-- pipeline_link / proposals triggers were guarded in 20260813010000. We REUSE all of this UNCHANGED; this
-- migration creates NO foundation and redefines NO trigger.
--
-- Consistency with the sibling bulk RPCs (rpc_bulk_status_brand / rpc_bulk_delete_brand and the
-- services / product_attributes equivalents): each of those emits ONE consolidated audit row PER
-- AFFECTED ROW (the audit log is per-entity — one log row cannot represent multiple distinct entities),
-- and the whole batch is ONE atomic transaction with app.audit_bypass = 'on'. This file replicates that
-- exact approach: SECURITY DEFINER, pinned search_path, SET LOCAL app.audit_bypass='on', dedup ids,
-- authorization re-check, then a single UPDATE ... RETURNING loop that calls fn_manual_audit_log once
-- per affected quote.
--
-- Two deliberate divergences from the brand template, forced by the quotes domain (documented, not silent):
--
--   1. STATUS field is TEXT, not boolean. Brands toggle is_active (boolean) so their RPC takes
--      p_is_active boolean. Quotes have NO is_active column — status is the TEXT column `estado`
--      ('rascunho' | 'enviado' | 'aceite' | 'perdido' | 'finalizado' | 'rejeitado' | ...). The wired FE
--      handler writes `estado`. Therefore rpc_bulk_status_quote takes `p_estado text` (NOT p_is_active).
--      This matches what the UI actually does; forcing a boolean here would not map to any quotes column.
--
--   2. DELETE is SOFT, not hard. The canonical single-row quote delete is soft:
--      soft_delete_business_entity('quote', id) sets deleted_at = now(), deleted_by = actor
--      (baseline_new_database.sql §soft_delete_business_entity), and the ENTIRE module filters
--      `deleted_at IS NULL` (fetchQuotes, the dashboard query, the proposals value aggregate in
--      rpc_save_quote, and idx_quotes_active). The hook's raw bulk path hard-deletes, which is an
--      existing latent inconsistency with the rest of the module. rpc_bulk_delete_quote SOFT-deletes to
--      match the single-row path and the app's read model, and — like rpc_save_quote's proposal sync —
--      re-syncs proposals.value for every proposal whose quotes changed, inside the same transaction.
--
-- Authorization / RLS parity
-- --------------------------
-- SECURITY DEFINER, so RLS on quotes / proposals does NOT self-enforce inside these functions. Both quotes
-- RLS write policies are pure org-scope (no extra permission predicate inside the policy):
--   quotes_update_policy : USING + WITH CHECK  organization_id IN get_user_visible_org_ids(auth.uid())
--                          (20260627050000_quotes_security_fixes.sql §FIX 1)
--   quotes_delete_policy : USING              organization_id IN get_user_visible_org_ids(auth.uid())
--                          (baseline_new_database.sql line 27546)
-- rpc_save_quote already extracted that predicate as fn_deal_org_in_scope(org) := "org IS NOT NULL AND
-- org IN get_user_visible_org_ids(auth.uid())" (20260730010000). We REUSE it unchanged for parity. Each
-- RPC additionally scopes every write by `organization_id = p_organization_id` so a caller can only touch
-- quotes in the passed (active) org — the same .eq(organization_id) scoping the hook's raw path uses, and
-- stronger than the FE status handler which relies on RLS alone.
--
-- Defense-in-depth permission gate (why 'quotes.manage', NOT 'quotes.edit'/'quotes.delete')
-- ----------------------------------------------------------------------------------------
-- The quotes RLS write policies themselves carry NO business-permission predicate — they are pure
-- org-scope. That is weaker than brands, whose RLS AND whose sibling RPCs (rpc_bulk_status_brand /
-- rpc_bulk_delete_brand) explicitly require has_anew_permission(uid,'brands.edit'). Creating two new
-- SECURITY DEFINER RPCs that turn a single-row capability into a bulk one, gated in the UI ONLY by the
-- client-side BulkActionsBar (statusPermission="quotes.edit" / deletePermission="quotes.delete"), would
-- let any authenticated org member invoke them directly via PostgREST and bypass that client-side gate.
-- So we add a server-side permission check as defense-in-depth.
--
-- CRITICAL nuance on WHICH code to check: "quotes.edit" / "quotes.delete" are FRONTEND-ONLY UI labels.
-- src/lib/permissionAliases.ts maps quotes.edit <-> quotes.update purely in TypeScript; the DB's
-- has_anew_permission (baseline L4131) does an EXACT permission_code match with NO alias expansion.
-- The code the DATABASE actually seeds and checks for quote writes is 'quotes.manage' — that is the gate
-- used by archive_quote (20260627050000 L131), the catalog_items_manage policy (baseline L25663), and
-- every module's quote audit-read policy. There is NO 'quotes.edit'/'quotes.delete' row on the DB side,
-- so gating on those exact strings would reject every non-admin caller (an availability regression).
-- We therefore gate on 'quotes.manage' — the real DB write gate for the quotes domain — matching the
-- archive_quote precedent. has_anew_permission does a plain EXISTS on anew_role_permissions with NO
-- implicit admin bypass — admin roles only pass if 'quotes.manage' is actually seeded on their role.
-- This is stricter than the current pure org-scope RLS; it can only reject callers the UI would
-- already have hidden the buttons from, provided admin roles carry 'quotes.manage' as expected.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql              — entity_audit_log, fn_generic_entity_audit()
--   20260627100000_quotes_audit_triggers.sql         — quote triggers wiring
--   20260719010000_roles_audit_bypass_and_rpcs.sql   — app.audit_bypass guard + fn_manual_audit_log()
--   20260730010000_deals_audit_bypass_and_rpcs.sql   — fn_deal_org_in_scope()
--   20260813010000_quotes_audit_bypass_child_trigger_fix.sql — all quote-touching triggers guarded
--   20260615130000_baseline_new_database.sql          — current_business_user_id(), get_user_visible_org_ids(),
--                                                        soft_delete_business_entity() (soft-delete contract mirrored here)


-- ============================================================
-- 1. rpc_bulk_status_quote(...)
-- ============================================================
-- Mirrors Quotes.tsx handleBulkStatusChange() (the page-local handler wired to the bar):
--   for each chunk: UPDATE public.quotes SET estado = <bulkNewStatus> WHERE id IN (chunk)
-- Here the whole selection is one atomic transaction with app.audit_bypass='on'; a consolidated
-- UPDATE audit row is emitted PER affected quote (only for rows whose estado actually changes,
-- mirroring the trigger's skip-on-no-change), and NO per-row trigger noise is produced.
-- Deleted (soft-deleted) quotes are excluded: they are not visible/selectable in the list.
-- Returns the number of quotes whose estado changed.

CREATE OR REPLACE FUNCTION public.rpc_bulk_status_quote(
  p_ids             uuid[],
  p_organization_id uuid,
  p_estado          text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_ids         uuid[];
  v_rec         record;
  v_count       integer := 0;
BEGIN
  -- Consolidate the whole batch into per-entity single audit rows (no trigger fan-out).
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para alteração de estado em massa'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The FE only fires when bulkNewStatus is set (defaults to a real status).
  IF nullif(p_estado, '') IS NULL THEN
    RAISE EXCEPTION 'Estado de destino obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
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

  -- ── Authorization parity with quotes_update_policy (org in caller's scope) ──
  IF NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Defense-in-depth: server-side write permission (see header) ─────────────
  -- 'quotes.manage' is the real DB write gate for the quotes domain (matching archive_quote);
  -- admin roles pass implicitly via has_anew_permission. This closes the direct-PostgREST bypass
  -- of the client-side BulkActionsBar statusPermission="quotes.edit" gate.
  IF NOT public.has_anew_permission(auth.uid(), 'quotes.manage') THEN
    RAISE EXCEPTION 'Sem permissão para alterar estado de orçamentos'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  -- Only rows whose estado actually changes are audited (mirrors trigger skip-on-no-change).
  -- Scoped by organization_id (mirrors the hook's .eq scoping) and deleted_at IS NULL
  -- (soft-deleted quotes are not selectable in the list).
  --
  -- The brand template records old/new for is_active via UPDATE ... RETURNING, but a bare
  -- UPDATE ... RETURNING sees only the POST-update row, so it cannot expose OLD.estado. To keep
  -- the old→new diff truthful we capture the pre-image in a CTE (FOR UPDATE locks the selected
  -- rows), then UPDATE against it — one atomic statement, real old→new values per affected quote.
  FOR v_rec IN
    WITH pre AS (
      SELECT id, organization_id, estado AS old_estado
      FROM   public.quotes
      WHERE  id = ANY (v_ids)
        AND  organization_id = p_organization_id
        AND  deleted_at IS NULL
        AND  estado IS DISTINCT FROM p_estado
      FOR UPDATE
    ),
    upd AS (
      UPDATE public.quotes q
      SET estado = p_estado
      FROM pre
      WHERE q.id = pre.id
      RETURNING q.id, q.organization_id, pre.old_estado, q.estado AS new_estado
    )
    SELECT * FROM upd
  LOOP
    PERFORM public.fn_manual_audit_log(
      'quotes',
      v_rec.id,
      v_rec.organization_id,
      'UPDATE',
      jsonb_build_object('quotes', jsonb_build_object(
        'estado', jsonb_build_object('old', to_jsonb(v_rec.old_estado), 'new', to_jsonb(v_rec.new_estado))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_status_quote(uuid[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_status_quote(uuid[], uuid, text) TO authenticated;


-- ============================================================
-- 2. rpc_bulk_delete_quote(...)
-- ============================================================
-- Mirrors the bulk-delete intent of Quotes.tsx (useBulkActions.handleBulkDelete wired with the
-- active org), but SOFT-deletes to match the canonical single-row path soft_delete_business_entity('quote')
-- and the module's `deleted_at IS NULL` read model (see header, divergence 2). For each affected quote:
--   UPDATE public.quotes SET deleted_at = now(), deleted_by = actor
--   WHERE id IN (selected) AND organization_id = active org AND deleted_at IS NULL.
-- proposals.value is re-synced for every proposal whose quote set changed (same aggregate rpc_save_quote
-- uses: sum(total) over non-deleted quotes on the proposal), inside the SAME transaction so the FK linkage
-- and the aggregate never desynchronize. One consolidated DELETE audit row is emitted per affected quote.
-- Returns the number of quotes soft-deleted.
--
-- Authorization mirrors quotes_delete_policy (org in caller's scope).

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_quote(
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
  v_deleted_at  timestamptz := now();
  v_before      public.quotes;
  v_count       integer := 0;
  v_proposal    uuid;
  v_prop_ids    uuid[] := ARRAY[]::uuid[];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para eliminação em massa'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
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

  -- ── Authorization parity with quotes_delete_policy (org in caller's scope) ──
  IF NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Defense-in-depth: server-side write permission (see header) ─────────────
  -- 'quotes.manage' is the real DB write gate for the quotes domain (matching archive_quote);
  -- admin roles pass implicitly via has_anew_permission. This closes the direct-PostgREST bypass
  -- of the client-side BulkActionsBar deletePermission="quotes.delete" gate.
  IF NOT public.has_anew_permission(auth.uid(), 'quotes.manage') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar orçamentos'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Iterate the in-scope, not-yet-deleted rows; soft-delete + audit once each ──
  FOR v_before IN
    SELECT * FROM public.quotes
    WHERE id = ANY (v_ids)
      AND organization_id = p_organization_id
      AND deleted_at IS NULL
  LOOP
    UPDATE public.quotes
    SET deleted_at = v_deleted_at,
        deleted_by = v_actor
    WHERE id = v_before.id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL;

    -- Collect distinct affected proposals for the value re-sync below.
    IF v_before.proposal_id IS NOT NULL
       AND NOT (v_before.proposal_id = ANY (v_prop_ids)) THEN
      v_prop_ids := v_prop_ids || v_before.proposal_id;
    END IF;

    -- Consolidated DELETE audit row: record the soft-delete transition explicitly so the log
    -- is truthful (the row is not physically removed).
    PERFORM public.fn_manual_audit_log(
      'quotes',
      v_before.id,
      v_before.organization_id,
      'DELETE',
      jsonb_build_object('quotes', jsonb_build_object(
        'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at)),
        'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
      )),
      'web_app'
    );

    v_count := v_count + 1;
  END LOOP;

  -- ── Re-sync proposals.value for affected proposals (same aggregate as rpc_save_quote) ──
  -- Written in this transaction so the aggregate can never lag the soft-delete.
  IF array_length(v_prop_ids, 1) IS NOT NULL AND array_length(v_prop_ids, 1) > 0 THEN
    FOREACH v_proposal IN ARRAY v_prop_ids LOOP
      UPDATE public.proposals p
      SET value = (
        SELECT COALESCE(sum(COALESCE(q.total, 0)), 0)
        FROM   public.quotes q
        WHERE  q.proposal_id = v_proposal
          AND  q.deleted_at IS NULL
      )
      WHERE p.id = v_proposal;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_delete_quote(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_delete_quote(uuid[], uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Foundation reused, not recreated: no CREATE for fn_manual_audit_log / fn_generic_entity_audit /
--    fn_deal_org_in_scope in this file.
--
-- 2. Only the two UI-exposed bulk actions are covered — NO rpc_bulk_org_quote exists
--    (BulkActionsBar showOrgAction={false}):
--      SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_bulk_%_quote';
--      -- Expected: rpc_bulk_status_quote, rpc_bulk_delete_quote (and NOT rpc_bulk_org_quote).
--
-- 3. A bulk status change over N selected quotes yields exactly N entity_audit_log rows
--    (table_name='quotes', operation='UPDATE'), one per quote whose estado actually changed,
--    and ZERO extra trigger rows:
--      SELECT count(*) FROM public.entity_audit_log
--      WHERE table_name='quotes' AND operation='UPDATE'
--        AND created_at > now() - interval '1 minute';
--
-- 4. A bulk delete soft-deletes (deleted_at set, row still present), emits one DELETE audit row per
--    affected quote, re-syncs proposals.value, and leaves the quotes readable only via the trash view:
--      SELECT id, deleted_at FROM public.quotes WHERE id = ANY(<selected>);  -- deleted_at set, rows present
--
-- 5. Calling either RPC with an org outside get_user_visible_org_ids(auth.uid()) raises
--    insufficient_privilege, matching quotes_update_policy / quotes_delete_policy.
--
-- 6. Both RPCs are idempotent under re-selection: status skips rows already at the target estado;
--    delete skips rows already soft-deleted (deleted_at IS NULL guard) — neither emits spurious rows.
--
-- 7. Defense-in-depth: a caller in-scope for the org but WITHOUT 'quotes.manage' (the real DB write
--    gate — NOT the frontend-only 'quotes.edit'/'quotes.delete' UI labels aliased in
--    src/lib/permissionAliases.ts) is rejected with insufficient_privilege, closing the direct-PostgREST
--    bypass of the client-side BulkActionsBar gate. Admin roles pass implicitly (has_anew_permission
--    bypass). Confirm the gate exists in both functions:
--      SELECT proname FROM pg_proc
--      WHERE proname IN ('rpc_bulk_status_quote','rpc_bulk_delete_quote')
--        AND prosrc LIKE '%quotes.manage%';   -- Expected: both rows.
