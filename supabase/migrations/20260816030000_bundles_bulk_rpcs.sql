-- Bundles (Produtos) — bulk-action RPCs on the shared audit-bypass foundation
-- 2026-08-16 | Module: Bundles — bundles
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Timestamp note (why 20260816030000, not 020000/010000)
-- ------------------------------------------------------
-- The Supabase CLI keys supabase_migrations.schema_migrations by the numeric timestamp prefix
-- ("version"), NOT by the full filename. The prefixes 20260816010000 (deals_bulk_delete_rpc.sql)
-- and 20260816020000 (products_bulk_rpcs.sql) are already taken by other pending migrations, so
-- this file uses the next free, unique prefix 20260816030000 to avoid a duplicate-version-key
-- collision on push (which could mark one file "applied" without ever running its SQL).
--
-- Problem this migration solves
-- ------------------------------
-- 20260809010000_bundles_audit_bypass_and_rpcs.sql added the single-row bundle RPCs
-- (rpc_create_bundle / rpc_update_bundle / rpc_delete_bundle) and the audit-bypass guards
-- on the bundle satellite trigger functions, but it did NOT add the BULK RPCs that the
-- Bundles list page issues through its bulk-actions bar. Today those two bulk actions still
-- run as raw multi-row Supabase writes (via the bespoke handlers in src/pages/Bundles.tsx),
-- so each affected row fires the bundles AFTER trigger (fn_generic_entity_audit) individually.
-- This migration adds the missing bulk RPCs so those actions run inside a single transaction
-- with app.audit_bypass = 'on' and emit exactly ONE consolidated audit row per affected bundle.
--
-- Scope of the UI (verified against src/pages/Bundles.tsx)
-- -------------------------------------------------------
-- The Bundles page wires useBulkActions({ tableName: "bundles" }) but the bulk-actions bar
-- exposes only TWO actions, each backed by a BESPOKE handler on the page (NOT the generic
-- hook mutations):
--   · "Change status" button  → setBulkStatusDialogOpen → handleBulkStatusChange()
--       UPDATE bundles SET status = <status>, is_active = (status = 'active')
--       WHERE id IN (selected) AND organization_id = active company.
--   · "Delete" button         → setBulkDeleteDialogOpen → handleBulkDelete()
--       UPDATE bundles SET deleted_at = now()          -- SOFT delete, despite softDelete:false
--       WHERE id IN (selected) AND organization_id = active company.
-- There is NO bulk company/org action in the Bundles UI (no handleBulkCompanyChange wiring,
-- no bulkNewCompanyId control). Therefore this migration creates ONLY:
--   · rpc_bulk_status_bundle  — bulk status change (status text + is_active bool)
--   · rpc_bulk_delete_bundle  — bulk SOFT delete (deleted_at)
-- No rpc_bulk_org_bundle is created — the corresponding action does not exist in the UI.
--
-- Consistency with the brands bulk pattern
-- ----------------------------------------
-- Same structure as rpc_bulk_status_brand / rpc_bulk_delete_brand
-- (20260807020000_brands_audit_bypass_and_rpcs.sql): SECURITY DEFINER, fixed search_path,
-- SET LOCAL app.audit_bypass = 'on', dedup of p_ids, org-scope check, and ONE
-- fn_manual_audit_log call PER affected row (the audit log is per-entity; a single row cannot
-- represent multiple distinct entities). The whole batch is one atomic transaction and produces
-- none of the extra per-row trigger noise the raw multi-statement path would.
--
-- Audit pre-image fidelity (per-row SELECT-then-UPDATE loop)
-- ---------------------------------------------------------
-- To record REAL old values in the audit diff (not NULL placeholders), each RPC iterates the
-- in-scope rows with FOR v_before IN SELECT * ... LOOP, capturing the pre-image, then applies
-- the mutation to that single row and emits one audit row with old = pre-image / new = written
-- value. This mirrors rpc_bulk_delete_brand's SELECT-then-DELETE loop exactly, and matches how
-- rpc_update_bundle derives its diff from a captured v_before. It replaces the earlier
-- RETURNING-only approach that could only see the post-image and had to log 'old': NULL.
--
-- Bundle-specific parity notes
-- ----------------------------
-- · Status change writes BOTH status (text) AND is_active (bool = status='active'), exactly as
--   handleBulkStatusChange does. Both are audited per row with their true old/new values, and
--   only rows where at least one of the two actually changes are touched/audited.
-- · Delete is a SOFT delete (deleted_at), matching handleBulkDelete — NOT a hard delete, unlike
--   rpc_bulk_delete_brand. Child rows (bundle_components / bundle_choice_groups) are intentionally
--   left untouched so the bundle can be restored (same rationale as rpc_delete_bundle).
-- · Every read/write is scoped by organization_id = p_organization_id AND deleted_at IS NULL,
--   matching the list's SELECT filter (.is("deleted_at", null)) and the FE .eq(organization_id).
--
-- Authorization / RLS parity
-- --------------------------
-- SECURITY DEFINER bypasses RLS on bundles, so each RPC re-checks the SAME predicate the
-- bundles_update policy enforces (20260704000000_bundles_security_fixes.sql):
--   is_system_admin_user(uid)
--   OR ( has_anew_permission(uid,'products.manage')
--        AND organization_id IN get_user_visible_org_ids(uid) )
-- Both bulk actions are UPDATEs (status toggle / deleted_at soft delete), so bundles_update is
-- the relevant policy for both, matching rpc_update_bundle / rpc_delete_bundle in 20260809010000.
--
-- Sentinel / NULL org
-- -------------------
-- bundles uses fn_generic_entity_audit(), which SKIPS SILENTLY when organization_id IS NULL
-- (it does NOT use the sentinel). The bulk actions are scoped by a non-NULL active org, so the
-- NULL-org path does not arise; we defensively skip the manual audit write when the org is NULL,
-- exactly matching the trigger's silent-skip behavior (same as the 20260809010000 RPCs).
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql             — entity_audit_log + fn_generic_entity_audit()
--   20260704000000_bundles_security_fixes.sql        — the RLS policies mirrored here
--   20260719010000_roles_audit_bypass_and_rpcs.sql   — fn_manual_audit_log() + guarded
--                                                      fn_generic_entity_audit() (FOUNDATION, reused)
--   20260809010000_bundles_audit_bypass_and_rpcs.sql — single-row bundle RPCs + guarded satellite triggers
--   20260615130000_baseline_new_database.sql          — has_anew_permission(),
--                                                      current_business_user_id(),
--                                                      get_user_visible_org_ids(),
--                                                      is_system_admin_user()


-- ============================================================
-- 1. rpc_bulk_status_bundle(...)
-- ============================================================
-- Mirrors handleBulkStatusChange() in src/pages/Bundles.tsx (organizationId = active company):
--   · UPDATE bundles SET status = <status>, is_active = (status = 'active')
--       WHERE id IN (selected) AND organization_id = active org AND deleted_at IS NULL.
-- The FE computes isActive = (bulkNewStatus === "active") and sets both columns; we take the
-- resolved status text as p_status and the resolved bool as p_is_active so a raw caller cannot
-- desync them.
-- One consolidated UPDATE audit row is emitted per affected bundle, carrying the REAL old and
-- new status/is_active (only rows that actually change are audited, mirroring the trigger's
-- skip-on-no-change). Returns the count updated.
--
-- Authorization mirrors bundles_update RLS.

CREATE OR REPLACE FUNCTION public.rpc_bulk_status_bundle(
  p_ids             uuid[],
  p_organization_id uuid,
  p_status          text,
  p_is_active       boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_is_admin  boolean;
  v_ids       uuid[];
  v_before    public.bundles;
  v_diff      jsonb;
  v_count     integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para alteração de estado em massa'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_status IS NULL THEN
    RAISE EXCEPTION 'Estado obrigatório para alteração em massa' USING ERRCODE = 'check_violation';
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

  -- ── Authorization parity with bundles_update RLS ─────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para editar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── SELECT pre-image → UPDATE → per-entity consolidated audit row ─────────
  -- Iterate the in-scope rows that would actually change (status/is_active differs). Capturing
  -- the pre-image here lets the audit diff carry the TRUE old values (not NULL). Same
  -- SELECT-then-mutate loop as rpc_bulk_delete_brand / rpc_update_bundle's v_before.
  FOR v_before IN
    SELECT *
    FROM   public.bundles b
    WHERE  b.id = ANY (v_ids)
      AND  b.organization_id = p_organization_id
      AND  b.deleted_at IS NULL
      AND  (b.status IS DISTINCT FROM p_status
            OR b.is_active IS DISTINCT FROM p_is_active)
    FOR UPDATE
  LOOP
    UPDATE public.bundles
    SET status    = p_status,
        is_active = p_is_active
    WHERE id = v_before.id;

    v_diff := jsonb_build_object(
      'bundles', jsonb_build_object(
        'status',    jsonb_build_object('old', to_jsonb(v_before.status),    'new', to_jsonb(p_status)),
        'is_active', jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(p_is_active))
      )
    );

    IF v_before.organization_id IS NOT NULL THEN
      PERFORM public.fn_manual_audit_log(
        'bundles', v_before.id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_status_bundle(uuid[], uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_status_bundle(uuid[], uuid, text, boolean) TO authenticated;


-- ============================================================
-- 2. rpc_bulk_delete_bundle(...)
-- ============================================================
-- Mirrors handleBulkDelete() in src/pages/Bundles.tsx (organizationId = active company) — a
-- SOFT delete (the page overrides the generic hook's hard-delete with its own deleted_at UPDATE):
--   · UPDATE bundles SET deleted_at = now()
--       WHERE id IN (selected) AND organization_id = active org AND deleted_at IS NULL.
-- Child rows (bundle_components / bundle_choice_groups) are intentionally NOT touched — this is a
-- soft delete; the bundle can be restored (same rationale as rpc_delete_bundle). One consolidated
-- UPDATE audit row (the deleted_at transition, old = the captured pre-image value) is emitted per
-- affected bundle. Returns the count soft-deleted.
--
-- Authorization mirrors bundles_update RLS (soft-delete is an UPDATE of deleted_at).

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_bundle(
  p_ids             uuid[],
  p_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_ids        uuid[];
  v_deleted_at timestamptz;
  v_before     public.bundles;
  v_diff       jsonb;
  v_count      integer := 0;
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

  -- ── Authorization parity with bundles_update RLS ─────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_deleted_at := now();

  -- ── SELECT pre-image → SOFT delete → per-entity consolidated audit row ────
  -- Only non-deleted, in-scope rows are affected (deleted_at IS NULL guard mirrors the list
  -- filter). Capturing the pre-image lets the audit diff carry the true old deleted_at (NULL by
  -- the guard, but recorded explicitly for consistency with the brands SELECT-then-mutate loop).
  FOR v_before IN
    SELECT *
    FROM   public.bundles b
    WHERE  b.id = ANY (v_ids)
      AND  b.organization_id = p_organization_id
      AND  b.deleted_at IS NULL
    FOR UPDATE
  LOOP
    UPDATE public.bundles
    SET deleted_at = v_deleted_at
    WHERE id = v_before.id;

    v_diff := jsonb_build_object(
      'bundles', jsonb_build_object(
        'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(v_deleted_at))
      )
    );

    IF v_before.organization_id IS NOT NULL THEN
      PERFORM public.fn_manual_audit_log(
        'bundles', v_before.id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_delete_bundle(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_delete_bundle(uuid[], uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Both bulk RPCs exist and are SECURITY DEFINER with a fixed search_path:
--   SELECT proname, prosecdef FROM pg_proc
--   WHERE proname IN ('rpc_bulk_status_bundle', 'rpc_bulk_delete_bundle');
--   -- Expected: both rows, prosecdef = true.
--
-- 2. A bulk status change across N selected bundles produces exactly N audit rows (one per
--    affected bundle) each with the TRUE old + new status/is_active, and none of the per-row
--    trigger noise, all in one transaction:
--   SELECT diff FROM public.entity_audit_log
--   WHERE table_name = 'bundles' AND operation = 'UPDATE'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: number of bundles whose status/is_active actually flipped; diff.old is the real
--   -- previous value, not NULL.
--
-- 3. rpc_bulk_delete_bundle is a SOFT delete (sets deleted_at); the affected bundles disappear
--    from the list (.is("deleted_at", null)) and children are preserved for restore.
--
-- 4. A caller without products.manage on the target org, or a target org outside their visible
--    orgs, is rejected with insufficient_privilege — matching bundles_update RLS + the FE
--    .eq(organization_id) scoping. Ids outside the active org are silently no-ops (never matched).
