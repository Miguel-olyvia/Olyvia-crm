-- Categorias/Subcategorias de Produtos — hard DELETE → soft delete + restore
-- 2026-11-07 | Module: Categorias / Subcategorias (Produtos) — product_categories
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- product_categories backs BOTH the "Categorias" page (top-level rows,
-- parent_id IS NULL) and the "Subcategorias" page (parent_id set) — there is
-- no separate product_subcategories table (confirmed against the live schema).
-- Today every delete path on this table performs a real DELETE:
--   · rpc_delete_product_category       (categories, individual)
--   · rpc_bulk_delete_product_category   (categories, bulk — also used as the
--     Subcategorias page's bulkDeleteRpc)
--   · rpc_delete_product_subcategory     (subcategories, individual)
-- None of these are recoverable, breaking the product decision that nothing in
-- the app hard-deletes.
--
-- Solution
-- --------
--   1. ADD COLUMN deleted_at / deleted_by to product_categories (mirrors
--      products.deleted_at/deleted_by; no such columns existed before this
--      migration — confirmed against the live schema dump).
--   2. Convert all three delete RPCs above from DELETE to a soft-delete UPDATE
--      (deleted_at=now(), deleted_by=actor, is_active=false). The
--      product_category_organizations junction rows are intentionally LEFT
--      INTACT (not deleted) so a restore brings back the exact same company
--      associations — this is a deliberate behavior change from the previous
--      "delete junction then delete row" hard-delete flow.
--   3. Add rpc_restore_product_category / rpc_bulk_restore_product_category /
--      rpc_restore_product_subcategory (inverse of the above). The category and
--      subcategory restore RPCs are distinct only in their audit wording and
--      the parent-org authorization arm they check (mirroring the existing
--      delete-side split), but operate on the same table/columns.
--
-- Authorization mirrors product_categories_delete / the subcategory
-- authorization arm exactly as the existing delete RPCs already do (Wave 7 §2,
-- see 20260803010000 / 20260806010000 headers). Restore reuses the same delete
-- permission (`product_categories.delete` / `product_subcategories.delete`) —
-- restoring is the direct inverse of deleting, matching rpc_restore_user.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql
--   20260719010000_roles_audit_bypass_and_rpcs.sql        — fn_manual_audit_log()
--   20260706000000_categories_security_fixes.sql          — RLS mirrored here
--   20260803010000_product_categories_audit_bypass_and_rpcs.sql — RPCs replaced here
--   20260806010000_product_subcategories_audit_bypass_and_rpcs.sql — RPC replaced here
--   20260811020000_product_categories_bulk_rpcs.sql       — RPC replaced here
--   20260615130000_baseline_new_database.sql


-- ============================================================
-- 0. Schema: add deleted_at / deleted_by
-- ============================================================

ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_product_categories_deleted_at
  ON public.product_categories (deleted_at);


-- ============================================================
-- 1. rpc_delete_product_category(...) — soft delete instead of hard DELETE
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_product_category(
  p_id             uuid,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_before     public.product_categories;
  v_deleted_at timestamptz;
  v_audit_org  uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.product_categories
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.delete') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Categoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Categoria já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  v_deleted_at := now();

  -- Soft delete only. product_category_organizations junction rows are kept
  -- intact so a restore recovers the exact same company associations.
  UPDATE public.product_categories
  SET is_active  = false,
      deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_categories', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('product_categories', jsonb_build_object(
      'is_active',  jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(false)),
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
    )),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_product_category(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_product_category(uuid, uuid) TO authenticated;


-- ============================================================
-- 2. rpc_bulk_delete_product_category(...) — soft delete instead of hard DELETE
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_product_category(
  p_ids             uuid[],
  p_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_deleted_at  timestamptz;
  v_rec         record;
  v_audit_org   uuid;
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

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.delete') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_deleted_at := now();

  FOR v_rec IN
    UPDATE public.product_categories pc
    SET is_active  = false,
        deleted_at = v_deleted_at,
        deleted_by = v_actor
    WHERE pc.id = ANY (v_ids)
      AND pc.organization_id = p_organization_id
      AND pc.deleted_at IS NULL
    RETURNING pc.id, pc.organization_id
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_categories', v_rec.id, v_audit_org, 'UPDATE',
      jsonb_build_object('product_categories', jsonb_build_object(
        'is_active',  jsonb_build_object('old', to_jsonb(true), 'new', to_jsonb(false)),
        'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_delete_product_category(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_delete_product_category(uuid[], uuid) TO authenticated;


-- ============================================================
-- 3. rpc_delete_product_subcategory(...) — soft delete instead of hard DELETE
-- ============================================================
-- Keeps the existing "clear subcategory_id on soft-deleted products" cleanup
-- step (unrelated to whether the category row itself is hard- or soft-deleted)
-- but no longer removes the product_categories row.

CREATE OR REPLACE FUNCTION public.rpc_delete_product_subcategory(
  p_id              uuid,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_before      public.product_categories;
  v_parent_org  uuid;
  v_deleted_at  timestamptz;
  v_audit_org   uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Subcategoria sem contexto de organização' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_before
  FROM public.product_categories
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcategoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_subcategories.delete') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar subcategorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_parent_org := public.get_product_category_org_id(v_before.parent_id);
    IF v_parent_org IS NULL
       OR NOT (v_parent_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Subcategoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Subcategoria já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  v_deleted_at := now();

  UPDATE public.product_categories
  SET is_active  = false,
      deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(
    public.get_product_category_org_id(v_before.parent_id),
    v_before.organization_id,
    k_system_sentinel
  );

  PERFORM public.fn_manual_audit_log(
    'product_categories', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('product_categories', jsonb_build_object(
      'is_active',  jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(false)),
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
    )),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_product_subcategory(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_product_subcategory(uuid, uuid) TO authenticated;


-- ============================================================
-- 4. Restore RPCs (category + subcategory share the same table/columns)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_restore_product_category(
  p_id              uuid,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid       uuid := auth.uid();
  v_is_admin  boolean;
  v_before    public.product_categories;
  v_audit_org uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.product_categories
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.delete') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Categoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Categoria já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.product_categories
  SET is_active  = true,
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_categories', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('product_categories', jsonb_build_object(
      'is_active',  jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
    )),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_product_category(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_product_category(uuid, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_bulk_restore_product_category(
  p_ids             uuid[],
  p_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid       uuid := auth.uid();
  v_is_admin  boolean;
  v_ids       uuid[];
  v_rec       record;
  v_audit_org uuid;
  v_count     integer := 0;
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
    IF NOT public.has_anew_permission(v_uid, 'product_categories.delete') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOR v_rec IN
    UPDATE public.product_categories pc
    SET is_active  = true,
        deleted_at = NULL,
        deleted_by = NULL
    WHERE pc.id = ANY (v_ids)
      AND pc.organization_id = p_organization_id
      AND pc.deleted_at IS NOT NULL
    RETURNING pc.id, pc.organization_id
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_categories', v_rec.id, v_audit_org, 'UPDATE',
      jsonb_build_object('product_categories', jsonb_build_object(
        'is_active',  jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
        'deleted_at', jsonb_build_object('old', NULL, 'new', NULL)
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_restore_product_category(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_restore_product_category(uuid[], uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_restore_product_subcategory(
  p_id              uuid,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_is_admin   boolean;
  v_before     public.product_categories;
  v_parent_org uuid;
  v_audit_org  uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Subcategoria sem contexto de organização' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_before
  FROM public.product_categories
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcategoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_subcategories.delete') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar subcategorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_parent_org := public.get_product_category_org_id(v_before.parent_id);
    IF v_parent_org IS NULL
       OR NOT (v_parent_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Subcategoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Subcategoria já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.product_categories
  SET is_active  = true,
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(
    public.get_product_category_org_id(v_before.parent_id),
    v_before.organization_id,
    k_system_sentinel
  );

  PERFORM public.fn_manual_audit_log(
    'product_categories', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('product_categories', jsonb_build_object(
      'is_active',  jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
    )),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_product_subcategory(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_product_subcategory(uuid, uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. product_categories.deleted_at / deleted_by exist:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'product_categories' AND column_name IN ('deleted_at','deleted_by');
-- 2. None of the three delete RPCs contain a DELETE FROM public.product_categories statement.
-- 3. A deleted category/subcategory keeps its product_category_organizations rows intact and
--    reappears with the same associations after rpc_restore_product_category /
--    rpc_restore_product_subcategory.
