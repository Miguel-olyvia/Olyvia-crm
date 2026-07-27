-- Subcategorias (Produtos) — authorization-parity FIX for the single-log RPCs
-- 2026-08-06 | Module: Subcategorias (Produtos) — product_categories (rows with parent_id)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Why this migration exists
-- -------------------------
-- 20260806010000_product_subcategories_audit_bypass_and_rpcs.sql introduced three RPCs
-- (rpc_create_product_subcategory / rpc_update_product_subcategory /
-- rpc_delete_product_subcategory). Their audit-bypass wiring, single-log behaviour, business
-- logic (INSERT/UPDATE column sets, slug/path omission on update, products.subcategory_id
-- cleanup on soft-deleted rows before DELETE, FK 23503 propagation), SECURITY DEFINER isolation,
-- REVOKE/GRANT and fixed search_path were all correct and are NOT changed here.
--
-- However their AUTHORIZATION checks mirrored the WRONG RLS. They re-checked the ROOT-category
-- policy (product_categories_insert/update/delete from 20260706000000) instead of the
-- SUBCATEGORY policy that is actually in force today for rows with parent_id IS NOT NULL,
-- introduced by:
--   · 20260706070000_subcategories_rls_permissions.sql   (Wave 7)
--   · 20260706090000_subcategories_rls_gaps.sql          (Wave 9)
-- Neither Wave 7 nor Wave 9 was ever reverted, so the live subcategory arms are:
--
--   INSERT (Wave 7 §2, subcategory arm):
--     has_anew_permission(uid,'product_subcategories.create')
--     AND get_product_category_org_id(parent_id) IN get_user_visible_org_ids(uid)
--     (org resolved via parent chain, NOT organization_id on the row)
--
--   UPDATE (Wave 9 §1, subcategory arms — supersedes Wave 7):
--     USING:      has_anew_permission(uid,'product_subcategories.edit')
--                 AND get_product_category_org_id(parent_id) IN visible_orgs
--     WITH CHECK: has_anew_permission(uid,'product_subcategories.edit')
--                 AND get_product_category_org_id(parent_id) IN visible_orgs      -- post-update parent
--                 AND ( organization_id IS NULL
--                       OR organization_id = get_product_category_org_id(parent_id) )  -- org-consistency guard
--
--   DELETE (Wave 7 §2, subcategory arm):
--     has_anew_permission(uid,'product_subcategories.delete')
--     AND get_product_category_org_id(parent_id) IN visible_orgs
--
-- The 20260806010000 RPCs instead checked product_categories.create/edit/delete and compared
-- p_organization_id / row organization_id directly against visible orgs. That is a real
-- authorization divergence in BOTH directions: a user holding the correct
-- product_subcategories.* permission (which the page's own PermissionGate uses —
-- ProductSubcategories.tsx lines 667, 819-820, 887, 905) could be wrongly BLOCKED, while a user
-- holding product_categories.* but not product_subcategories.* could be wrongly ALLOWED where
-- the RLS would reject them. It also dropped the Wave 9 org-consistency guard on UPDATE
-- (organization_id must equal the parent-resolved org or be NULL), which exists to close a
-- documented cross-org visibility leak via the junction SELECT arm.
--
-- This migration re-defines the three RPCs with EXACTLY the Wave 7 + Wave 9 predicates.
-- CREATE OR REPLACE keeps the identical signatures; the audit/business logic is preserved
-- verbatim from 20260806010000. Only the authorization block of each RPC changes.
--
-- Note on org resolution
-- ----------------------
-- get_product_category_org_id(parent_id) (Wave 7 §1) walks COALESCE(parent_id,
-- parent_category_id) up to the first non-NULL organization_id. We authorize the caller and
-- attribute the audit row using the parent-resolved org, exactly like the live RLS + the
-- subcategory audit trigger (Wave 8). The sentinel fallback for a truly org-less chain is
-- preserved. The RPCs are SECURITY DEFINER; get_product_category_org_id is itself SECURITY
-- DEFINER + STABLE, so it resolves correctly regardless of the caller's own visibility.
--
-- Prerequisites:
--   20260806010000_product_subcategories_audit_bypass_and_rpcs.sql — the RPCs being corrected
--   20260706070000_subcategories_rls_permissions.sql               — Wave 7 subcategory RLS + get_product_category_org_id()
--   20260706090000_subcategories_rls_gaps.sql                      — Wave 9 UPDATE org-consistency guard
--   20260719010000_roles_audit_bypass_and_rpcs.sql                 — fn_manual_audit_log(), generic fn guard
--   20260615130000_baseline_new_database.sql                       — has_anew_permission(),
--                                                                    current_business_user_id(),
--                                                                    get_user_visible_org_ids(),
--                                                                    is_system_admin_user()


-- ============================================================
-- 1. rpc_create_product_subcategory(...) — authz aligned to Wave 7 INSERT
-- ============================================================
-- Business logic identical to 20260806010000 §1. Only the authorization block changes:
--   · permission  : product_subcategories.create  (was product_categories.create)
--   · org scope   : get_product_category_org_id(p_parent_id) IN visible_orgs
--                   (was p_organization_id IN visible_orgs — direct row org)

CREATE OR REPLACE FUNCTION public.rpc_create_product_subcategory(
  p_name            text,
  p_slug            text,
  p_path            text,
  p_description     text,
  p_parent_id       uuid,
  p_organization_id uuid,
  p_sort_order      integer
)
RETURNS public.product_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_parent_org uuid;
  v_subcat     public.product_categories;
  v_audit_org  uuid;
  v_diff       jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ─────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Required-field guards mirroring the FE early returns ─────────────────
  IF p_parent_id IS NULL THEN
    RAISE EXCEPTION 'Categoria pai obrigatória' USING ERRCODE = 'check_violation';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Selecione uma empresa' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Authorization parity with product_categories_insert SUBCATEGORY arm ──
  -- Wave 7 §2 subcategory arm:
  --   has_anew_permission(uid,'product_subcategories.create')
  --   AND get_product_category_org_id(parent_id) IN visible_orgs
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_subcategories.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar subcategorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_parent_org := public.get_product_category_org_id(p_parent_id);
    IF v_parent_org IS NULL
       OR NOT (v_parent_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Categoria pai fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── INSERT the subcategory (identical column set to the FE insert payload) ─
  INSERT INTO public.product_categories
    (name, slug, path, description, parent_id, organization_id,
     sort_order, is_active, created_by)
  VALUES
    (p_name,
     p_slug,
     p_path,
     nullif(p_description, ''),
     p_parent_id,
     p_organization_id,
     COALESCE(p_sort_order, 0),
     true,
     v_actor)
  RETURNING * INTO v_subcat;

  -- ── Combined diff: full snapshot of the created subcategory row ───────────
  v_diff := jsonb_build_object(
    'product_categories', jsonb_build_object(
      'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.name)),
      'slug',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.slug)),
      'path',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.path)),
      'description',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.description)),
      'parent_id',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.parent_id)),
      'sort_order',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.sort_order)),
      'is_active',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.is_active)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.organization_id))
    )
  );

  -- Attribute the audit row under the parent-resolved org (mirrors the subcategory
  -- audit trigger); fall back to the row's own org, then the sentinel.
  v_audit_org := COALESCE(
    public.get_product_category_org_id(v_subcat.id),
    v_subcat.organization_id,
    k_system_sentinel
  );

  PERFORM public.fn_manual_audit_log(
    'product_categories', v_subcat.id, v_audit_org, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_subcat;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_product_subcategory(text, text, text, text, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_product_subcategory(text, text, text, text, uuid, uuid, integer) TO authenticated;


-- ============================================================
-- 2. rpc_update_product_subcategory(...) — authz aligned to Wave 7 + Wave 9 UPDATE
-- ============================================================
-- Business logic identical to 20260806010000 §2 (UPDATE {name, description, sort_order,
-- parent_id, organization_id}; slug/path untouched; changed-fields-only diff; single UPDATE
-- log only when something changed). Only the authorization block changes:
--   · permission  : product_subcategories.edit  (was product_categories.edit)
--   · USING       : get_product_category_org_id(pre-update parent_id) IN visible_orgs
--                   (was pre-update row organization_id IN visible_orgs)
--   · WITH CHECK  : get_product_category_org_id(post-update parent_id) IN visible_orgs
--                   AND ( post-update organization_id IS NULL
--                         OR organization_id = get_product_category_org_id(post-update parent_id) )
--                   -- Wave 9 org-consistency guard; was missing entirely.

CREATE OR REPLACE FUNCTION public.rpc_update_product_subcategory(
  p_id              uuid,
  p_name            text,
  p_description     text,
  p_sort_order      integer,
  p_parent_id       uuid,
  p_organization_id uuid
)
RETURNS public.product_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid            uuid := auth.uid();
  v_actor          uuid;
  v_is_admin       boolean;
  v_before         public.product_categories;
  v_subcat         public.product_categories;
  v_pre_parent_org uuid;
  v_post_parent_org uuid;
  v_audit_org      uuid;
  v_cat_diff       jsonb;
  v_diff           jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_parent_id IS NULL THEN
    RAISE EXCEPTION 'Categoria pai obrigatória' USING ERRCODE = 'check_violation';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Selecione uma empresa' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Load the current row (before-image for the diff + auth guards) ────────
  SELECT * INTO v_before FROM public.product_categories WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcategoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with product_categories_update SUBCATEGORY arms ──
  -- Wave 9 §1 (supersedes Wave 7 §2 for UPDATE).
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_subcategories.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar subcategorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- USING arm: pre-update parent org must be visible (resolved via parent chain,
    -- NOT the row's own organization_id — historic rows may carry NULL org).
    v_pre_parent_org := public.get_product_category_org_id(v_before.parent_id);
    IF v_pre_parent_org IS NULL
       OR NOT (v_pre_parent_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Subcategoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- WITH CHECK arm: post-update parent org must be visible (blocks reparenting
    -- under a root category from another org).
    v_post_parent_org := public.get_product_category_org_id(p_parent_id);
    IF v_post_parent_org IS NULL
       OR NOT (v_post_parent_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Categoria pai fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- WITH CHECK org-consistency guard (Wave 9): the post-update organization_id must
    -- either be NULL (inherited from parent) or exactly equal the parent-resolved org.
    -- Any other value would create a cross-org visibility leak via the junction SELECT arm.
    IF NOT (p_organization_id IS NULL OR p_organization_id = v_post_parent_org) THEN
      RAISE EXCEPTION 'Organização da subcategoria diverge da categoria pai'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE the subcategory (identical column set to the FE update payload) ─
  UPDATE public.product_categories
  SET name            = p_name,
      description     = nullif(p_description, ''),
      sort_order      = COALESCE(p_sort_order, 0),
      parent_id       = p_parent_id,
      organization_id = p_organization_id
  WHERE id = p_id
  RETURNING * INTO v_subcat;

  -- ── Build the diff (only fields that actually changed) ────────────────────
  v_cat_diff := '{}'::jsonb;
  IF v_before.name IS DISTINCT FROM v_subcat.name THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_subcat.name)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_subcat.description THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_subcat.description)));
  END IF;
  IF v_before.sort_order IS DISTINCT FROM v_subcat.sort_order THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('sort_order',
      jsonb_build_object('old', to_jsonb(v_before.sort_order), 'new', to_jsonb(v_subcat.sort_order)));
  END IF;
  IF v_before.parent_id IS DISTINCT FROM v_subcat.parent_id THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('parent_id',
      jsonb_build_object('old', to_jsonb(v_before.parent_id), 'new', to_jsonb(v_subcat.parent_id)));
  END IF;
  IF v_before.organization_id IS DISTINCT FROM v_subcat.organization_id THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('organization_id',
      jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', to_jsonb(v_subcat.organization_id)));
  END IF;

  v_diff := '{}'::jsonb;
  IF v_cat_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('product_categories', v_cat_diff);
  END IF;

  -- Attribute the audit row under the post-update parent-resolved org (mirrors the
  -- subcategory audit trigger); fall back to the row's own org, then the sentinel.
  v_audit_org := COALESCE(
    public.get_product_category_org_id(v_subcat.id),
    v_subcat.organization_id,
    k_system_sentinel
  );

  -- Emit a single UPDATE log row only when something meaningful changed,
  -- matching the "skip when nothing changed" behaviour of the trigger.
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'product_categories', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_subcat;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_product_subcategory(uuid, text, text, integer, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_product_subcategory(uuid, text, text, integer, uuid, uuid) TO authenticated;


-- ============================================================
-- 3. rpc_delete_product_subcategory(...) — authz aligned to Wave 7 DELETE
-- ============================================================
-- Business logic identical to 20260806010000 §3 (clear products.subcategory_id on soft-deleted
-- rows in the same org, then DELETE the subcategory; FK 23503 propagates; single DELETE log with
-- combined product_categories snapshot + cleared_product_ids). Only the authorization block
-- changes:
--   · permission  : product_subcategories.delete  (was product_categories.delete)
--   · org scope   : get_product_category_org_id(parent_id) IN visible_orgs
--                   (was pre-delete row organization_id IN visible_orgs)
--
-- The products cleanup remains scoped to the subcategory's own organization_id
-- (p_organization_id, mirroring the FE .eq("organization_id", sub.organization_id) filter and
-- only touching soft-deleted rows). The DELETE authorization gate is the subcategory-delete
-- permission + parent-chain org visibility, matching the live RLS. p_organization_id continues
-- to scope the WHERE clauses exactly as the FE does; it is no longer used as the authorization
-- predicate (that is now the parent-resolved org).

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
  v_cleared_ids uuid[];
  v_audit_org   uuid;
  v_diff        jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    -- Matches the FE guard: "Subcategory not found or no organization context".
    RAISE EXCEPTION 'Subcategoria sem contexto de organização' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Load the current row scoped by the passed org (mirrors the FE .eq filters) ──
  SELECT * INTO v_before
  FROM public.product_categories
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcategoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with product_categories_delete SUBCATEGORY arm ───
  -- Wave 7 §2 subcategory arm:
  --   has_anew_permission(uid,'product_subcategories.delete')
  --   AND get_product_category_org_id(parent_id) IN visible_orgs
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

  -- ── Clear subcategory_id on soft-deleted products in the same org ─────────
  -- Same predicate as the FE: subcategory_id = id AND organization_id = org
  -- AND deleted_at IS NOT NULL. Capture affected product ids for the audit diff.
  WITH cleared AS (
    UPDATE public.products
    SET subcategory_id = NULL
    WHERE subcategory_id = p_id
      AND organization_id = p_organization_id
      AND deleted_at IS NOT NULL
    RETURNING id
  )
  SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
  INTO   v_cleared_ids
  FROM   cleared;

  -- ── DELETE the subcategory ────────────────────────────────────────────────
  -- If ACTIVE (non-soft-deleted) products still reference it, the FK raises 23503,
  -- rolling back the whole RPC — the FE maps 23503 to the "in use by products" message.
  DELETE FROM public.product_categories
  WHERE id = p_id
    AND organization_id = p_organization_id;

  -- ── Combined diff: full snapshot of the removed subcategory + cleared refs ─
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
    )
  );

  -- Record the products cleanup only when at least one soft-deleted product was touched.
  IF array_length(v_cleared_ids, 1) IS NOT NULL AND array_length(v_cleared_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'products', jsonb_build_object(
        'subcategory_id', jsonb_build_object(
          'old', to_jsonb(p_id),
          'new', NULL
        ),
        'cleared_product_ids', jsonb_build_object(
          'old', to_jsonb(v_cleared_ids),
          'new', NULL
        )
      )
    );
  END IF;

  -- Attribute the audit row under the parent-resolved org (mirrors the subcategory audit
  -- trigger). The row is already deleted, so resolve from the before-image parent chain;
  -- fall back to the before-image org, then the sentinel.
  v_audit_org := COALESCE(
    public.get_product_category_org_id(v_before.parent_id),
    v_before.organization_id,
    k_system_sentinel
  );

  PERFORM public.fn_manual_audit_log(
    'product_categories', p_id, v_audit_org, 'DELETE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_product_subcategory(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_product_subcategory(uuid, uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm the three RPCs now reference the SUBCATEGORY predicate, not the root one:
--   SELECT proname
--   FROM pg_proc
--   WHERE proname IN ('rpc_create_product_subcategory',
--                     'rpc_update_product_subcategory',
--                     'rpc_delete_product_subcategory')
--     AND prosrc LIKE '%product_subcategories.%'
--     AND prosrc LIKE '%get_product_category_org_id%';
--   -- Expected: all three rows. None should reference 'product_categories.create/edit/delete'
--   --           as the gate, and none should authorize on p_organization_id directly.
--
-- 2. rpc_update_product_subcategory now enforces the Wave 9 org-consistency guard:
--   SELECT prosrc LIKE '%diverge da categoria pai%'
--   FROM pg_proc WHERE proname = 'rpc_update_product_subcategory';
--   -- Expected: true.
--
-- 3. A user holding product_subcategories.{create,edit,delete} for a visible org (via the
--    parent category chain) succeeds; a user holding only product_categories.* but NOT the
--    subcategories permission is rejected with insufficient_privilege — matching the live RLS.
--
-- 4. Attempting to UPDATE a subcategory to set organization_id to a value that diverges from
--    the parent-resolved org (even a second visible org) raises insufficient_privilege —
--    matching the Wave 9 WITH CHECK org-consistency guard.
--
-- 5. All other behaviour (single audit row per call, 23503 propagation, products cleanup on
--    soft-deleted rows, slug/path omission on update, SECURITY DEFINER, REVOKE/GRANT, fixed
--    search_path) is unchanged from 20260806010000.
