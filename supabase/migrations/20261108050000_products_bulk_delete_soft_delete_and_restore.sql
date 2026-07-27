-- Produtos — bulk delete must soft-delete (not hard DELETE) + restore RPCs
-- 2026-11-07 | Module: Produtos (core) — products
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Individual product delete (src/pages/Products.tsx::handleDelete) soft-deletes
-- (UPDATE is_deleted=true, deleted_at=now(), deleted_by) so the record is
-- recoverable (product-wide policy: nothing hard-deletes). But
-- rpc_bulk_delete_product (20260816020000_products_bulk_rpcs.sql §2), wired by
-- Products.tsx bulk-delete flow (useBulkActions bulkDeleteRpc), issues a real
-- `DELETE FROM public.products` — permanently destroying every selected row and
-- any FK-dependent satellite rows (prices, attribute values, org links). This is
-- the exact inconsistency flagged by product decision: no delete path in the app
-- may be irreversible.
--
-- Individual delete also has a second, narrower problem: it goes through
-- withAuditContext() (two separate PostgREST calls: set_audit_context() then a
-- plain .update()), the same two-transaction pattern already found to drop the
-- audit `source` on user delete (20261107080000). We fix that here too by adding
-- a single-transaction rpc_delete_product, mirroring rpc_delete_user.
--
-- Solution
-- --------
--   1. rpc_bulk_delete_product: DELETE → soft-delete UPDATE (is_deleted=true,
--      deleted_at=now(), deleted_by=actor), operation logged as 'UPDATE'
--      (mirrors rpc_delete_user's DELETE→UPDATE pattern). Idempotent: only rows
--      with is_deleted=false are touched/counted.
--   2. rpc_delete_product(p_id, p_organization_id): single-transaction soft
--      delete for the individual delete path (replaces the withAuditContext
--      two-call pattern in Products.tsx::handleDelete).
--   3. rpc_restore_product(p_id, p_organization_id) / rpc_bulk_restore_product:
--      inverse of the above (is_deleted=false, deleted_at=NULL, deleted_by=NULL).
--
-- Authorization mirrors products_update / products_delete RLS
-- (20260703000000_products_security_fixes.sql §3), matching
-- rpc_bulk_delete_product's existing checks. Restore reuses `products.delete`
-- (inverse of deleting, same admin surface — matches rpc_restore_user's
-- documented rationale).
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — fn_manual_audit_log() (FOUNDATION)
--   20260703000000_products_security_fixes.sql      — RLS mirrored here
--   20260816020000_products_bulk_rpcs.sql           — rpc_bulk_delete_product (replaced here)
--   20260615130000_baseline_new_database.sql


-- ============================================================
-- 1. rpc_bulk_delete_product(...) — soft delete instead of hard DELETE
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_product(
  p_ids             uuid[],
  p_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_deleted_at  timestamptz;
  v_rec         record;
  v_count       integer := 0;
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

  -- ── Authorization parity with products_delete RLS ────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.delete') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_deleted_at := now();

  -- ── SOFT delete (never a real DELETE) + per-entity consolidated audit row ─
  -- Only non-deleted, in-scope rows are affected (idempotent under retries).
  FOR v_rec IN
    UPDATE public.products p
    SET is_deleted = true,
        deleted_at = v_deleted_at,
        deleted_by = v_actor
    WHERE p.id = ANY (v_ids)
      AND p.organization_id = p_organization_id
      AND p.is_deleted = false
    RETURNING p.id, p.organization_id
  LOOP
    PERFORM public.fn_manual_audit_log(
      'products',
      v_rec.id,
      COALESCE(v_rec.organization_id, '00000000-0000-0000-0000-000000000001'::uuid),
      'UPDATE',
      jsonb_build_object('products', jsonb_build_object(
        'is_deleted', jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
        'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_delete_product(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_delete_product(uuid[], uuid) TO authenticated;


-- ============================================================
-- 2. rpc_delete_product(...) — single-transaction individual soft delete
-- ============================================================
-- Mirrors Products.tsx::handleDelete's UPDATE, but in ONE transaction (no
-- withAuditContext two-call split), matching rpc_delete_user's fix pattern.

CREATE OR REPLACE FUNCTION public.rpc_delete_product(
  p_id              uuid,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_before     public.products;
  v_deleted_at timestamptz;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.products
  WHERE id = p_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.delete') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.is_deleted THEN
    RAISE EXCEPTION 'Produto já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  v_deleted_at := now();
  UPDATE public.products
  SET is_deleted = true,
      deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE id = p_id AND organization_id = p_organization_id;

  PERFORM public.fn_manual_audit_log(
    'products',
    p_id,
    COALESCE(v_before.organization_id, '00000000-0000-0000-0000-000000000001'::uuid),
    'UPDATE',
    jsonb_build_object('products', jsonb_build_object(
      'is_deleted', jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
    )),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_product(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_product(uuid, uuid) TO authenticated;


-- ============================================================
-- 3. rpc_restore_product(...) / rpc_bulk_restore_product(...)
-- ============================================================
-- Reuses `products.delete` (restoring is the direct inverse of deleting,
-- reachable only from the same admin surface — matches rpc_restore_user).

CREATE OR REPLACE FUNCTION public.rpc_restore_product(
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
  v_before   public.products;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.products
  WHERE id = p_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.delete') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NOT v_before.is_deleted THEN
    RAISE EXCEPTION 'Produto já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.products
  SET is_deleted = false,
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_id AND organization_id = p_organization_id;

  PERFORM public.fn_manual_audit_log(
    'products',
    p_id,
    COALESCE(v_before.organization_id, '00000000-0000-0000-0000-000000000001'::uuid),
    'UPDATE',
    jsonb_build_object('products', jsonb_build_object(
      'is_deleted', jsonb_build_object('old', to_jsonb(true), 'new', to_jsonb(false)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
    )),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_product(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_product(uuid, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_bulk_restore_product(
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
  v_rec      record;
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
    IF NOT public.has_anew_permission(v_uid, 'products.delete') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOR v_rec IN
    UPDATE public.products p
    SET is_deleted = false,
        deleted_at = NULL,
        deleted_by = NULL
    WHERE p.id = ANY (v_ids)
      AND p.organization_id = p_organization_id
      AND p.is_deleted = true
    RETURNING p.id, p.organization_id
  LOOP
    PERFORM public.fn_manual_audit_log(
      'products',
      v_rec.id,
      COALESCE(v_rec.organization_id, '00000000-0000-0000-0000-000000000001'::uuid),
      'UPDATE',
      jsonb_build_object('products', jsonb_build_object(
        'is_deleted', jsonb_build_object('old', to_jsonb(true), 'new', to_jsonb(false)),
        'deleted_at', jsonb_build_object('old', NULL, 'new', NULL)
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_restore_product(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_restore_product(uuid[], uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. rpc_bulk_delete_product no longer performs a DELETE statement:
--   SELECT prosrc FROM pg_proc WHERE proname = 'rpc_bulk_delete_product';
--   -- Expected: body contains "SET is_deleted = true" and no "DELETE FROM public.products".
-- 2. A bulk-deleted product still exists in the table with is_deleted=true,
--    deleted_at set, and is filtered out of Products.tsx's default query
--    (.is("deleted_at", null)); rpc_restore_product / rpc_bulk_restore_product
--    bring it back and it reappears in the default list.
