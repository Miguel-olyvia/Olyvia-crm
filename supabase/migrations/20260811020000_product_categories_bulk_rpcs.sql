-- Categorias (Produtos) — bulk-action single-log RPCs on the shared audit-bypass foundation
-- 2026-08-11 | Module: Categorias (Produtos) — product_categories
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- The Product Categories and Product Subcategories screens
-- (src/pages/ProductCategories.tsx and src/pages/ProductSubcategories.tsx) both wire the
-- SAME bulk-action bar to the SAME table via useBulkActions({ tableName: "product_categories",
-- softDelete: false, organizationId: activeCompany.id }). Three bulk actions are actually
-- exposed in the UI on BOTH pages (verified in the JSX):
--   · BulkStatusDialog  → handleBulkStatusChange("is_active")   → status toggle
--   · BulkDeleteDialog  → handleBulkDelete                       → hard delete
--   · BulkOrgDialog     → handleBulkCompanyChange("organization_id") → org reassignment
--
-- Without a bulk RPC, useBulkActions falls back to a raw multi-row
-- UPDATE/DELETE ... .in("id", ids).eq("organization_id", org). Each affected row fires the
-- AFTER trigger fn_audit_product_categories_with_sentinel() independently, and a hard bulk
-- delete additionally cascades/relies on product_category_organizations, whose trigger
-- fn_audit_product_category_organizations() then also fires — producing trigger fan-out
-- across two tables and multiple Postgres transactions (one per Supabase call, though a
-- single .in() is one statement, the FE has no atomicity guarantee across retries).
--
-- Solution
-- --------
-- Reuse the audit-bypass FOUNDATION (fn_manual_audit_log + the app.audit_bypass GUC,
-- created by 20260719010000_roles_audit_bypass_and_rpcs.sql). The two product-category
-- trigger functions were ALREADY guarded with the bypass in
-- 20260803010000_product_categories_audit_bypass_and_rpcs.sql, so this migration creates NO
-- foundation and re-guards NO triggers — it only ADDS the three bulk RPCs, following the
-- exact pattern of rpc_bulk_status_brand / rpc_bulk_delete_brand / rpc_bulk_org_brand in
-- 20260807020000_brands_audit_bypass_and_rpcs.sql:
--   · SECURITY DEFINER, SET search_path = public, pg_temp.
--   · PERFORM set_config('app.audit_bypass', 'on', true) at the top (SET LOCAL semantics).
--   · Whole batch is ONE atomic transaction.
--   · Params: p_ids uuid[], p_organization_id uuid, plus the action field
--     (p_is_active for status, p_new_organization_id for org). This matches the params
--     useBulkActions sends (p_ids, p_organization_id, p_is_active / [bulkOrgRpcNewOrgParam]).
--   · Emit ONE consolidated audit row PER affected category via fn_manual_audit_log
--     (the entity_audit_log is per-entity; a single log row cannot represent multiple
--     distinct entities — this is the SAME per-row approach the brand bulk RPCs use),
--     but NOT the junction/trigger fan-out the raw path would have produced.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS does NOT self-enforce inside them. Each re-checks the
-- SAME predicate the product_categories RLS policies enforce (mirrored in
-- 20260803010000_product_categories_audit_bypass_and_rpcs.sql §2):
--   status / org (UPDATE) : is_system_admin_user(uid)
--        OR ( has_anew_permission(uid,'product_categories.edit')
--             AND organization_id IN get_user_visible_org_ids(uid) )  [pre- AND post-image]
--   delete                : is_system_admin_user(uid)
--        OR ( has_anew_permission(uid,'product_categories.delete')
--             AND organization_id IN get_user_visible_org_ids(uid) )
-- The bulk permission codes match the single-row RPCs already applied for this module:
-- 'product_categories.edit' for status/org, 'product_categories.delete' for delete. These
-- also match the FE PermissionGate on the bulk bar (statusPermission="product_categories.edit"
-- / "product_subcategories.edit"; deletePermission="product_categories.delete" /
-- "product_subcategories.delete"): the DB write gate for the shared product_categories table
-- consolidates to the product_categories.* codes, consistent with the create/update/delete RPCs.
--
-- Sentinel org
-- ------------
-- '00000000-0000-0000-0000-000000000001' — same constant used by
-- fn_audit_product_categories_with_sentinel() and by the single-row RPCs. Global categories
-- (organization_id NULL) route their audit row under the sentinel exactly like the trigger.
-- In practice these bulk RPCs are always scoped by a non-NULL active org, so the sentinel
-- path is defensive only.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql                         — entity_audit_log
--   20260706010000_categories_audit_triggers.sql                — the two audit trigger functions
--   20260706000000_categories_security_fixes.sql                — the RLS policies mirrored here
--   20260719010000_roles_audit_bypass_and_rpcs.sql              — fn_manual_audit_log() (FOUNDATION)
--   20260803010000_product_categories_audit_bypass_and_rpcs.sql — bypass guard already added to
--                                                                 both product-category triggers;
--                                                                 single-row RPCs
--   20260615130000_baseline_new_database.sql                    — has_anew_permission(),
--                                                                 current_business_user_id(),
--                                                                 get_user_visible_org_ids(),
--                                                                 is_system_admin_user()


-- ============================================================
-- 1. rpc_bulk_status_product_category(...)
-- ============================================================
-- Mirrors handleBulkStatusChange('is_active') in src/hooks/useBulkActions.ts as wired by
-- ProductCategories.tsx / ProductSubcategories.tsx (organizationId = active company):
--   · UPDATE product_categories SET is_active = <bool>
--       WHERE id IN (selected) AND organization_id = active org.
-- The raw path fires the product_categories trigger once per row. Here the whole batch is one
-- transaction with app.audit_bypass = 'on'; a consolidated UPDATE audit row is emitted per
-- affected category (audit rows are per-entity), and NO extra trigger noise is produced.
-- Returns the number of categories updated.
--
-- Authorization mirrors product_categories_update RLS (pre- and post-image org identical here —
-- an is_active toggle does not change organization_id).

CREATE OR REPLACE FUNCTION public.rpc_bulk_status_product_category(
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

  -- ── Authorization parity with product_categories_update RLS ───────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- The .eq(organization_id) FE scope + RLS both require the target org be visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  -- Only rows whose is_active actually flips are audited (mirrors trigger skip-on-no-change).
  FOR v_rec IN
    UPDATE public.product_categories c
    SET is_active = p_is_active
    WHERE c.id = ANY (v_ids)
      AND c.organization_id = p_organization_id
      AND c.is_active IS DISTINCT FROM p_is_active
    RETURNING c.id, c.organization_id,
              (NOT p_is_active) AS old_active, p_is_active AS new_active
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_categories',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('product_categories', jsonb_build_object(
        'is_active', jsonb_build_object('old', to_jsonb(v_rec.old_active), 'new', to_jsonb(v_rec.new_active))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_status_product_category(uuid[], uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_status_product_category(uuid[], uuid, boolean) TO authenticated;


-- ============================================================
-- 2. rpc_bulk_delete_product_category(...)
-- ============================================================
-- Mirrors handleBulkDelete() in src/hooks/useBulkActions.ts (softDelete:false as wired by
-- ProductCategories.tsx / ProductSubcategories.tsx, organizationId = active company):
--   · DELETE FROM product_categories WHERE id IN (selected) AND organization_id = active org.
-- Junction rows in product_category_organizations for each affected category are removed first
-- (same rationale as rpc_delete_product_category): the combined audit diff reflects the full
-- effect and no orphan rows remain. One consolidated DELETE audit row is emitted per affected
-- category. The whole batch is one atomic transaction.
-- Returns the number of categories deleted.
--
-- Authorization mirrors product_categories_delete RLS.

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
  v_before      public.product_categories;
  v_old_orgs    uuid[];
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

  -- ── Authorization parity with product_categories_delete RLS ───────────────
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

  -- ── Iterate the in-scope rows; delete junction + category; audit once per category ──
  FOR v_before IN
    SELECT * FROM public.product_categories
    WHERE id = ANY (v_ids)
      AND organization_id = p_organization_id
  LOOP
    SELECT COALESCE(array_agg(organization_id ORDER BY organization_id), ARRAY[]::uuid[])
    INTO   v_old_orgs
    FROM   public.product_category_organizations
    WHERE  category_id = v_before.id;

    DELETE FROM public.product_category_organizations WHERE category_id = v_before.id;
    DELETE FROM public.product_categories
    WHERE id = v_before.id
      AND organization_id = p_organization_id;

    v_diff := jsonb_build_object(
      'product_categories', jsonb_build_object(
        'name',            jsonb_build_object('old', to_jsonb(v_before.name), 'new', NULL),
        'slug',            jsonb_build_object('old', to_jsonb(v_before.slug), 'new', NULL),
        'path',            jsonb_build_object('old', to_jsonb(v_before.path), 'new', NULL),
        'description',     jsonb_build_object('old', to_jsonb(v_before.description), 'new', NULL),
        'parent_id',       jsonb_build_object('old', to_jsonb(v_before.parent_id), 'new', NULL),
        'sort_order',      jsonb_build_object('old', to_jsonb(v_before.sort_order), 'new', NULL),
        'is_active',       jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', NULL),
        'organization_id', jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', NULL)
      ),
      'product_category_organizations', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_old_orgs), 'new', NULL)
      )
    );

    v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

    PERFORM public.fn_manual_audit_log(
      'product_categories', v_before.id, v_audit_org, 'DELETE', v_diff, 'web_app'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_delete_product_category(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_delete_product_category(uuid[], uuid) TO authenticated;


-- ============================================================
-- 3. rpc_bulk_org_product_category(...)
-- ============================================================
-- Mirrors handleBulkCompanyChange('organization_id') in src/hooks/useBulkActions.ts as wired by
-- ProductCategories.tsx / ProductSubcategories.tsx (organizationId = active company scope filter;
-- bulkNewCompanyId = target org):
--   · UPDATE product_categories SET organization_id = <new org> WHERE id IN (selected)
--       AND organization_id = active org.
-- This reassigns each in-scope category to a new organization. Like rpc_bulk_org_brand, only the
-- product_categories.organization_id column is changed (the junction rewrite is out of scope for
-- this bulk action — the FE bulk path only touches the base table). One consolidated UPDATE audit
-- row is emitted per affected category (only when organization_id actually changes).
-- Returns the number of categories updated.
--
-- The new-org parameter is named p_new_organization_id. The FE must pass
-- bulkOrgRpcNewOrgParam: "p_new_organization_id" to useBulkActions (the hook default is
-- "p_new_org_id", which is what rpc_bulk_org_brand uses). This matches the naming already used by
-- rpc_bulk_org_product_attribute.
--
-- Authorization mirrors product_categories_update RLS: the pre-image org (the scope org) AND the
-- post-image org (the new org) must BOTH be visible to the caller (USING + WITH CHECK).

CREATE OR REPLACE FUNCTION public.rpc_bulk_org_product_category(
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

  -- ── Authorization parity with product_categories_update RLS (pre + post org visible) ──
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update (scope) org must be visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update (target) org must be visible.
    IF NOT (p_new_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  FOR v_rec IN
    UPDATE public.product_categories c
    SET organization_id = p_new_organization_id
    WHERE c.id = ANY (v_ids)
      AND c.organization_id = p_organization_id
      AND c.organization_id IS DISTINCT FROM p_new_organization_id
    RETURNING c.id, p_organization_id AS old_org, p_new_organization_id AS new_org
  LOOP
    -- Audit row is routed under the NEW org (the row's post-update org), matching the
    -- trigger which reads NEW.organization_id.
    v_audit_org := COALESCE(v_rec.new_org, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_categories',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('product_categories', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_rec.old_org), 'new', to_jsonb(v_rec.new_org))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_org_product_category(uuid[], uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_org_product_category(uuid[], uuid, uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. The three bulk RPCs exist and are SECURITY DEFINER with a fixed search_path:
--   SELECT proname, prosecdef, proconfig FROM pg_proc
--   WHERE proname IN ('rpc_bulk_status_product_category',
--                     'rpc_bulk_delete_product_category',
--                     'rpc_bulk_org_product_category');
--   -- Expected: 3 rows, prosecdef = true, proconfig contains search_path=public, pg_temp.
--
-- 2. A bulk status change on N categories produces exactly N audit rows (one per flipped
--    category) and no junction/trigger noise:
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'product_categories' AND operation = 'UPDATE'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: number of categories whose is_active actually changed.
--
-- 3. A bulk delete of N categories emits exactly N DELETE audit rows and removes the
--    junction rows first; no product_category_organizations trigger rows are produced.
--
-- 4. rpc_bulk_org_product_category rejects a target org outside the caller's visible orgs
--    (insufficient_privilege), mirroring product_categories_update WITH CHECK; rows whose
--    organization_id already equals the target are skipped (no audit row).
--
-- 5. All three are scoped by AND organization_id = p_organization_id, so a caller cannot
--    affect categories outside the passed active org — matching the FE .eq("organization_id")
--    filter in useBulkActions and the RLS org-visibility predicate.
