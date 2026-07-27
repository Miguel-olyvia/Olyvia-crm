-- Atributos de Produto — direct DELETE + hard bulk DELETE → soft delete + restore
-- 2026-11-07 | Module: Atributos de Produto — product_attributes
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- src/pages/ProductAttributes.tsx::handleDelete issues a raw
-- `supabase.from("product_attributes").delete()` (real hard DELETE, no audit
-- consolidation), and rpc_bulk_delete_product_attribute
-- (20260816020000_products_bulk_rpcs.sql § / product_attributes bulk RPCs) also
-- performs a real `DELETE FROM public.product_attributes`. Neither is
-- recoverable, breaking the product decision that nothing in the app
-- hard-deletes.
--
-- Solution
-- --------
--   1. ADD COLUMN deleted_at / deleted_by to product_attributes (no such
--      columns existed before this migration — confirmed against the live
--      schema dump).
--   2. Add rpc_delete_product_attribute(p_id, p_organization_id): a new,
--      single-transaction soft-delete RPC replacing the direct
--      .from("product_attributes").delete() call in ProductAttributes.tsx.
--   3. Convert rpc_bulk_delete_product_attribute from DELETE to a soft-delete
--      UPDATE (deleted_at=now(), deleted_by=actor), audited as 'UPDATE'.
--   4. Add rpc_restore_product_attribute / rpc_bulk_restore_product_attribute
--      (inverse of the above).
--
-- Authorization mirrors the existing 'products.manage' check already enforced
-- by rpc_bulk_delete_product_attribute (20260810010000_product_attributes_audit_bypass_and_rpcs.sql
-- / 20260816020000). Restore reuses the same permission — restoring is the
-- direct inverse of deleting (matches rpc_restore_user's rationale).
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — fn_manual_audit_log()
--   20260810010000_product_attributes_audit_bypass_and_rpcs.sql — RLS/authz mirrored here
--   20260816020000_products_bulk_rpcs.sql            — rpc_bulk_delete_product_attribute (replaced here)
--   20260615130000_baseline_new_database.sql


-- ============================================================
-- 0. Schema: add deleted_at / deleted_by
-- ============================================================

ALTER TABLE public.product_attributes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_product_attributes_deleted_at
  ON public.product_attributes (deleted_at);


-- ============================================================
-- 1. rpc_delete_product_attribute(...) — new single-transaction soft delete
-- ============================================================
-- Replaces the direct .from("product_attributes").delete() call in
-- ProductAttributes.tsx::handleDelete.

CREATE OR REPLACE FUNCTION public.rpc_delete_product_attribute(
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
  v_actor      uuid;
  v_is_admin   boolean;
  v_before     public.product_attributes;
  v_deleted_at timestamptz;
  v_audit_org  uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.product_attributes
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atributo não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Atributo já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  v_deleted_at := now();

  UPDATE public.product_attributes
  SET deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_attributes', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('product_attributes', jsonb_build_object(
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
    )),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_product_attribute(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_product_attribute(uuid, uuid) TO authenticated;


-- ============================================================
-- 2. rpc_bulk_delete_product_attribute(...) — soft delete instead of hard DELETE
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_product_attribute(
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
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_ids        uuid[];
  v_deleted_at timestamptz;
  v_rec        record;
  v_audit_org  uuid;
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
      RAISE EXCEPTION 'Sem permissão para eliminar atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_deleted_at := now();

  FOR v_rec IN
    UPDATE public.product_attributes pa
    SET deleted_at = v_deleted_at,
        deleted_by = v_actor
    WHERE pa.id = ANY (v_ids)
      AND pa.organization_id = p_organization_id
      AND pa.deleted_at IS NULL
    RETURNING pa.id, pa.organization_id
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_attributes', v_rec.id, v_audit_org, 'UPDATE',
      jsonb_build_object('product_attributes', jsonb_build_object(
        'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_delete_product_attribute(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_delete_product_attribute(uuid[], uuid) TO authenticated;


-- ============================================================
-- 3. rpc_restore_product_attribute(...) / rpc_bulk_restore_product_attribute(...)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_restore_product_attribute(
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
  v_before    public.product_attributes;
  v_audit_org uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.product_attributes
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atributo não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Atributo já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.product_attributes
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_attributes', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('product_attributes', jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
    )),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_product_attribute(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_product_attribute(uuid, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_bulk_restore_product_attribute(
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
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOR v_rec IN
    UPDATE public.product_attributes pa
    SET deleted_at = NULL,
        deleted_by = NULL
    WHERE pa.id = ANY (v_ids)
      AND pa.organization_id = p_organization_id
      AND pa.deleted_at IS NOT NULL
    RETURNING pa.id, pa.organization_id
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_attributes', v_rec.id, v_audit_org, 'UPDATE',
      jsonb_build_object('product_attributes', jsonb_build_object(
        'deleted_at', jsonb_build_object('old', NULL, 'new', NULL)
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_restore_product_attribute(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_restore_product_attribute(uuid[], uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. product_attributes.deleted_at / deleted_by exist.
-- 2. rpc_bulk_delete_product_attribute no longer contains a DELETE FROM statement.
-- 3. A deleted attribute reappears (with the same options/config) after
--    rpc_restore_product_attribute / rpc_bulk_restore_product_attribute.
