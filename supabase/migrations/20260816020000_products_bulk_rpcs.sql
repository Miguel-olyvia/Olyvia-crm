-- Produtos (bulk) — single-log bulk RPCs on the shared audit-bypass foundation
-- 2026-08-16 | Module: Produtos (core) — products (bulk status / delete / org)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- The bulk actions on the Products list (src/pages/Products.tsx, wired via
-- src/hooks/useBulkActions.ts with tableName:"products", softDelete:false,
-- organizationId = active company) are issued today as raw multi-row
-- UPDATE/DELETE .in("id", ids).eq("organization_id", activeCompany.id):
--   · handleBulkStatusChange  → UPDATE products over the selected set
--   · handleBulkDelete        → hard DELETE products over the selected set
--   · handleBulkCompanyChange → UPDATE products.organization_id over the selected set
-- The products AFTER trigger (fn_generic_entity_audit) fires once per affected row, so a
-- bulk action over N products writes N audit rows — which is CORRECT for a per-entity audit
-- log (each product is a distinct entity), but a raw multi-row statement gives no single
-- transaction boundary and no consolidated author/source attribution. These RPCs wrap the
-- whole batch in ONE transaction, mirror the RLS predicates explicitly (SECURITY DEFINER),
-- and emit exactly ONE consolidated audit row per affected product via fn_manual_audit_log
-- (matching the bulk RPCs already shipped for brands / services — see
--  20260807020000_brands_audit_bypass_and_rpcs.sql §2d-2f and
--  20260808010000_services_audit_bypass_and_rpcs.sql §2d-2e).
--
-- Solution / foundation reuse
-- ---------------------------
-- The audit-bypass FOUNDATION already exists (20260719010000_roles_audit_bypass_and_rpcs.sql):
--   · The per-transaction GUC `app.audit_bypass`. SET LOCAL 'on' short-circuits the guarded
--     audit trigger functions so they write nothing.
--   · fn_manual_audit_log(p_table_name, p_entity_id, p_organization_id, p_operation,
--     p_changed_fields, p_source) — writes exactly ONE row to entity_audit_log, reusing the
--     same author-resolution chain as the triggers. Never raises.
--   · fn_generic_entity_audit() — the trigger function that fires on `products` — was already
--     guarded in 20260719010000, so the products table already honours app.audit_bypass.
-- We REUSE all of the above. This migration creates NO foundation and touches NO trigger
-- function: the products bulk RPCs write only to the `products` table, whose audit trigger
-- is already bypass-guarded. (Contrast with brands/services, which also had a satellite
-- trigger — fn_audit_brand_organizations / fn_audit_service_prices — that needed the guard
-- added; products bulk actions touch only `products`, so no satellite guard is required here.)
--
-- Status column note (behaviour divergence — documented, NOT hidden)
-- -----------------------------------------------------------------
-- src/pages/Products.tsx wires the status dialog as
--   onConfirm={() => bulkActions.handleBulkStatusChange("status")}
-- and today (no bulkStatusRpc passed) the hook's fallback path writes the `status` TEXT
-- column (bulkNewStatus ∈ {'active','draft','discontinued'}). When an RPC is supplied, the
-- hook's RPC branch (useBulkActions.ts) instead sends p_is_active = (bulkNewStatus==='active')
-- and operates on the `is_active` BOOLEAN column. rpc_bulk_status_product follows the
-- REQUIRED / shared signature (p_ids, p_organization_id, p_is_active) exactly as brands and
-- services do, so wiring bulkStatusRpc:"rpc_bulk_status_product" will change bulk status from
-- toggling the `status` text column to toggling the `is_active` boolean. That FE wiring is a
-- deliberate, separate follow-up decision (this migration only creates the RPCs) and is
-- called out here so it is reviewed as an intentional behaviour switch, not a silent one.
--
-- products.organization_id is nullable
-- ------------------------------------
-- The FE always scopes bulk writes with .eq("organization_id", activeCompany.id) (non-NULL),
-- so every row an RPC touches has a real org. The manual audit row is routed under
-- COALESCE(row org, sentinel) defensively, matching how the audit layer routes NULL-org rows
-- ('00000000-0000-0000-0000-000000000001'). Never insert this UUID into anew_organizations.
--
-- Authorization / RLS parity (mirrors 20260703000000_products_security_fixes.sql §3)
-- ----------------------------------------------------------------------------------
--   products_update : is_system_admin_user(uid)
--                     OR ( has_anew_permission(uid,'products.edit')
--                          AND organization_id IN get_user_visible_org_ids(uid) )
--                     (USING pre-image org AND WITH CHECK post-image org must both qualify)
--   products_delete : is_system_admin_user(uid)
--                     OR ( has_anew_permission(uid,'products.delete')
--                          AND organization_id IN get_user_visible_org_ids(uid) )
-- rpc_bulk_status_product / rpc_bulk_org_product mirror products_update; rpc_bulk_delete_product
-- mirrors products_delete. rpc_bulk_org_product additionally re-checks the TARGET org against
-- get_user_visible_org_ids (products_update WITH CHECK on the post-image org).
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql             — entity_audit_log, fn_generic_entity_audit()
--   20260703000000_products_security_fixes.sql      — the RLS policies mirrored here
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — fn_manual_audit_log() + guarded
--                                                      fn_generic_entity_audit() (FOUNDATION, reused)
--   20260811010000_products_core_audit_bypass_and_rpcs.sql — rpc_create_product / rpc_update_product
--   20260615130000_baseline_new_database.sql         — has_anew_permission(),
--                                                      current_business_user_id(),
--                                                      get_user_visible_org_ids(),
--                                                      is_system_admin_user()


-- ============================================================
-- 1. rpc_bulk_status_product(...)
-- ============================================================
-- Mirrors handleBulkStatusChange in src/hooks/useBulkActions.ts as wired by Products.tsx
-- (organizationId = active company; RPC branch sends p_is_active = bulkNewStatus==='active'):
--   · UPDATE products SET is_active = <bool> WHERE id IN (selected)
--       AND organization_id = active org.
-- The whole batch is one transaction with app.audit_bypass = 'on'; a consolidated UPDATE
-- audit row is emitted per affected product (audit rows are per-entity) and none of the
-- per-row trigger noise the raw multi-row UPDATE would produce.
-- Returns the number of products updated.
--
-- Authorization mirrors products_update RLS (pre- and post-image org identical here — an
-- is_active toggle does not change organization_id).

CREATE OR REPLACE FUNCTION public.rpc_bulk_status_product(
  p_ids             uuid[],
  p_organization_id uuid,
  p_is_active       boolean
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
    RAISE EXCEPTION 'organizationId obrigatório para alteração de estado em massa'
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

  -- ── Authorization parity with products_update RLS ────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- The .eq(organization_id) FE scope + RLS both require the target org be visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  -- Only rows whose is_active actually flips are audited (mirrors trigger skip-on-no-change).
  FOR v_rec IN
    UPDATE public.products p
    SET is_active = p_is_active
    WHERE p.id = ANY (v_ids)
      AND p.organization_id = p_organization_id
      AND p.is_active IS DISTINCT FROM p_is_active
    RETURNING p.id, p.organization_id,
              (NOT p_is_active) AS old_active, p_is_active AS new_active
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'products',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('products', jsonb_build_object(
        'is_active', jsonb_build_object('old', to_jsonb(v_rec.old_active), 'new', to_jsonb(v_rec.new_active))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_status_product(uuid[], uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_status_product(uuid[], uuid, boolean) TO authenticated;


-- ============================================================
-- 2. rpc_bulk_delete_product(...)
-- ============================================================
-- Mirrors handleBulkDelete in src/hooks/useBulkActions.ts (softDelete:false as wired by
-- Products.tsx, organizationId = active company):
--   · DELETE FROM products WHERE id IN (selected) AND organization_id = active org.
-- The FE relies on FK cascade for the product's satellite rows (product_organizations,
-- product_prices, product_attribute_values, …). We delete only the products rows and let the
-- same FK cascade behaviour apply; the satellite audit triggers are bypass-guarded for the
-- whole transaction so no satellite noise is emitted. One consolidated DELETE audit row is
-- emitted per affected product.
-- Returns the number of products deleted.
--
-- Authorization mirrors products_delete RLS.

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
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_before      public.products;
  v_audit_org   uuid;
  v_diff        jsonb;
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

  -- ── Iterate the in-scope rows; delete product; audit once per product ──────
  FOR v_before IN
    SELECT * FROM public.products
    WHERE id = ANY (v_ids)
      AND organization_id = p_organization_id
  LOOP
    DELETE FROM public.products
    WHERE id = v_before.id
      AND organization_id = p_organization_id;

    -- Full snapshot of the removed product (the fields the products list/edit surfaces).
    v_diff := jsonb_build_object(
      'products', jsonb_build_object(
        'sku',             jsonb_build_object('old', to_jsonb(v_before.sku), 'new', NULL),
        'name',            jsonb_build_object('old', to_jsonb(v_before.name), 'new', NULL),
        'status',          jsonb_build_object('old', to_jsonb(v_before.status), 'new', NULL),
        'is_active',       jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', NULL),
        'barcode',         jsonb_build_object('old', to_jsonb(v_before.barcode), 'new', NULL),
        'category_id',     jsonb_build_object('old', to_jsonb(v_before.category_id), 'new', NULL),
        'subcategory_id',  jsonb_build_object('old', to_jsonb(v_before.subcategory_id), 'new', NULL),
        'brand_id',        jsonb_build_object('old', to_jsonb(v_before.brand_id), 'new', NULL),
        'supplier_id',     jsonb_build_object('old', to_jsonb(v_before.supplier_id), 'new', NULL),
        'organization_id', jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', NULL)
      )
    );

    v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

    PERFORM public.fn_manual_audit_log(
      'products', v_before.id, v_audit_org, 'DELETE', v_diff, 'web_app'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_delete_product(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_delete_product(uuid[], uuid) TO authenticated;


-- ============================================================
-- 3. rpc_bulk_org_product(...)
-- ============================================================
-- Mirrors handleBulkCompanyChange('organization_id') in src/hooks/useBulkActions.ts as wired
-- by Products.tsx (organizationId = active company scope filter; bulkNewCompanyId = target org):
--   · UPDATE products SET organization_id = <new org> WHERE id IN (selected)
--       AND organization_id = active org.
-- Reassigns each in-scope product to a new organization. One consolidated UPDATE audit row is
-- emitted per affected product (only when organization_id actually changes).
-- Returns the number of products updated.
--
-- The new-org parameter is named p_new_organization_id (matching the products / product_attribute
-- convention, i.e. useBulkActions must be wired with bulkOrgRpcNewOrgParam:"p_new_organization_id").
--
-- Authorization mirrors products_update RLS: the pre-image org (the scope org) AND the
-- post-image org (the new org) must BOTH be visible to the caller (USING + WITH CHECK).

CREATE OR REPLACE FUNCTION public.rpc_bulk_org_product(
  p_ids                 uuid[],
  p_organization_id     uuid,
  p_new_organization_id uuid
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
    RAISE EXCEPTION 'organizationId obrigatório para alteração de empresa em massa'
      USING ERRCODE = 'check_violation';
  END IF;
  -- The FE only fires when bulkNewCompanyId is truthy.
  IF p_new_organization_id IS NULL THEN
    RAISE EXCEPTION 'Empresa de destino obrigatória' USING ERRCODE = 'check_violation';
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

  -- ── Authorization parity with products_update RLS (pre + post org visible) ──
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update (scope) org must be visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update (target) org must be visible.
    IF NOT (p_new_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  FOR v_rec IN
    UPDATE public.products p
    SET organization_id = p_new_organization_id
    WHERE p.id = ANY (v_ids)
      AND p.organization_id = p_organization_id
      AND p.organization_id IS DISTINCT FROM p_new_organization_id
    RETURNING p.id, p_organization_id AS old_org, p_new_organization_id AS new_org
  LOOP
    -- Audit row is routed under the NEW org (the row's post-update org), matching the
    -- trigger which reads NEW.organization_id.
    v_audit_org := COALESCE(v_rec.new_org, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'products',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('products', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_rec.old_org), 'new', to_jsonb(v_rec.new_org))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_org_product(uuid[], uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_org_product(uuid[], uuid, uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. The three RPCs exist with the expected signatures:
--   SELECT proname, pg_get_function_identity_arguments(oid)
--   FROM pg_proc
--   WHERE proname IN ('rpc_bulk_status_product','rpc_bulk_delete_product','rpc_bulk_org_product');
--   -- Expected:
--   --   rpc_bulk_status_product  (p_ids uuid[], p_organization_id uuid, p_is_active boolean)
--   --   rpc_bulk_delete_product  (p_ids uuid[], p_organization_id uuid)
--   --   rpc_bulk_org_product     (p_ids uuid[], p_organization_id uuid, p_new_organization_id uuid)
--
-- 2. A bulk status toggle over N products emits exactly N audit rows (one per product) and
--    none of the extra trigger noise a raw multi-row UPDATE would fan out:
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'products' AND operation = 'UPDATE'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: exactly the number of products whose is_active actually flipped.
--
-- 3. rpc_bulk_delete_product on products whose organization_id differs from the passed scope
--    org deletes nothing for those rows (the .eq scope filter excludes them), and rows outside
--    the caller's visible orgs raise insufficient_privilege — matching products_delete RLS +
--    the FE .eq("organization_id", activeCompany.id) scope.
--
-- 4. rpc_bulk_org_product rejects a target org outside the caller's visible orgs
--    (insufficient_privilege), mirroring products_update WITH CHECK on the post-image org.
