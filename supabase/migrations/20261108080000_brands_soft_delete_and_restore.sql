-- Marcas — hard DELETE → soft delete + restore
-- 2026-11-07 | Module: Marcas — brands
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- rpc_delete_brand and rpc_bulk_delete_brand
-- (20260807020000_brands_audit_bypass_and_rpcs.sql / 20260816020000_products_bulk_rpcs.sql)
-- both delete brand_organizations then DELETE FROM public.brands — a real,
-- non-recoverable hard delete, breaking the product decision that nothing in
-- the app hard-deletes.
--
-- Solution
-- --------
--   1. ADD COLUMN deleted_at / deleted_by to brands (no such columns existed
--      before this migration — confirmed against the live schema dump).
--   2. Convert rpc_delete_brand / rpc_bulk_delete_brand from DELETE to a
--      soft-delete UPDATE (is_active=false, deleted_at=now(), deleted_by=actor).
--      brand_organizations junction rows are intentionally LEFT INTACT (not
--      deleted) so a restore recovers the exact same company associations —
--      a deliberate change from the previous "delete junction then delete row"
--      hard-delete flow.
--   3. Add rpc_restore_brand / rpc_bulk_restore_brand (inverse of the above).
--
-- Authorization mirrors brands_delete RLS exactly as the existing delete RPCs
-- already enforce ('brands.edit' + org visibility). Restore reuses the same
-- permission — restoring is the direct inverse of deleting (matches
-- rpc_restore_user's rationale).
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — fn_manual_audit_log()
--   20260807020000_brands_audit_bypass_and_rpcs.sql — RLS/authz + RPC replaced here
--   20260816020000_products_bulk_rpcs.sql            — RPC replaced here
--   20260615130000_baseline_new_database.sql


-- ============================================================
-- 0. Schema: add deleted_at / deleted_by
-- ============================================================

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_brands_deleted_at
  ON public.brands (deleted_at);


-- ============================================================
-- 1. rpc_delete_brand(...) — soft delete instead of hard DELETE
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_brand(
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
  v_before     public.brands;
  v_deleted_at timestamptz;
  v_audit_org  uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.brands
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marca não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Marca fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Marca já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  v_deleted_at := now();

  -- Soft delete only. brand_organizations junction rows are kept intact so a
  -- restore recovers the exact same company associations.
  UPDATE public.brands
  SET is_active  = false,
      deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'brands', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('brands', jsonb_build_object(
      'is_active',  jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(false)),
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
    )),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_brand(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_brand(uuid, uuid) TO authenticated;


-- ============================================================
-- 2. rpc_bulk_delete_brand(...) — soft delete instead of hard DELETE
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_brand(
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
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_deleted_at := now();

  FOR v_rec IN
    UPDATE public.brands b
    SET is_active  = false,
        deleted_at = v_deleted_at,
        deleted_by = v_actor
    WHERE b.id = ANY (v_ids)
      AND b.organization_id = p_organization_id
      AND b.deleted_at IS NULL
    RETURNING b.id, b.organization_id
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'brands', v_rec.id, v_audit_org, 'UPDATE',
      jsonb_build_object('brands', jsonb_build_object(
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

REVOKE ALL ON FUNCTION public.rpc_bulk_delete_brand(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_delete_brand(uuid[], uuid) TO authenticated;


-- ============================================================
-- 3. rpc_restore_brand(...) / rpc_bulk_restore_brand(...)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_restore_brand(
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
  v_before    public.brands;
  v_audit_org uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.brands
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marca não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Marca fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Marca já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.brands
  SET is_active  = true,
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'brands', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('brands', jsonb_build_object(
      'is_active',  jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
    )),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_brand(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_brand(uuid, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_bulk_restore_brand(
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
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOR v_rec IN
    UPDATE public.brands b
    SET is_active  = true,
        deleted_at = NULL,
        deleted_by = NULL
    WHERE b.id = ANY (v_ids)
      AND b.organization_id = p_organization_id
      AND b.deleted_at IS NOT NULL
    RETURNING b.id, b.organization_id
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'brands', v_rec.id, v_audit_org, 'UPDATE',
      jsonb_build_object('brands', jsonb_build_object(
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

REVOKE ALL ON FUNCTION public.rpc_bulk_restore_brand(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_restore_brand(uuid[], uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. brands.deleted_at / deleted_by exist.
-- 2. Neither rpc_delete_brand nor rpc_bulk_delete_brand contain a
--    DELETE FROM public.brands statement anymore.
-- 3. A deleted brand keeps its brand_organizations rows intact and reappears
--    with the same associations after rpc_restore_brand / rpc_bulk_restore_brand.
