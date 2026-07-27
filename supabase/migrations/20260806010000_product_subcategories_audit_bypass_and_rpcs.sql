-- Subcategorias (Produtos) — single-log RPCs on the shared audit-bypass foundation
-- 2026-08-06 | Module: Subcategorias (Produtos) — product_categories (rows with parent_id)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- A subcategory IS a product_categories row that has parent_id set. Today one user action
-- on ProductSubcategories.tsx is issued from the frontend as SEVERAL independent Supabase
-- calls, each its own Postgres transaction:
--   · create : INSERT product_categories                               (1 call)
--   · update : UPDATE product_categories                               (1 call)
--   · delete : UPDATE products (clear subcategory_id on soft-deleted rows)  +
--              DELETE product_categories                               (2 calls, survey)
-- Every audited table has an AFTER trigger that writes to entity_audit_log:
--   · product_categories → fn_audit_product_categories_with_sentinel()
--   · products           → fn_generic_entity_audit()
-- so the delete flow (products cleanup + category delete) produces up to N audit rows when
-- the business intent is exactly ONE audit entry. Create/update already touch a single table
-- but are wrapped here too so the whole module shares one atomic, single-log pattern.
--
-- Solution
-- --------
-- The audit-bypass FOUNDATION already exists — created by the Roles module in
-- 20260719010000_roles_audit_bypass_and_rpcs.sql (grep for "app.audit_bypass" /
-- "fn_manual_audit_log" confirms it). It provides:
--   · The per-transaction GUC `app.audit_bypass`. When set to 'on' (SET LOCAL), guarded
--     audit trigger functions short-circuit and write nothing.
--   · fn_manual_audit_log(p_table_name, p_entity_id, p_organization_id, p_operation,
--     p_changed_fields, p_source) — writes exactly ONE row to entity_audit_log, reusing the
--     SAME author-resolution chain as the trigger functions (app.audit_user_id GUC →
--     current_business_user_id() → anew_users via auth.uid()). Never raises.
-- We REUSE it here; we do NOT recreate it.
--
-- No trigger functions are (re)defined in this migration. Both trigger functions that fire
-- on the tables these RPCs write to are ALREADY guarded by the shared bypass GUC:
--   · fn_generic_entity_audit()                    → guarded by 20260719010000 (Roles foundation)
--                                                    (fires on public.products)
--   · fn_audit_product_categories_with_sentinel()  → guarded by 20260803010000 (Categorias módulo)
--                                                    (fires on public.product_categories)
-- Re-defining them here would be redundant and risk drift, so they are left untouched.
--
-- This migration adds three RPCs:
--   rpc_create_product_subcategory / rpc_update_product_subcategory /
--   rpc_delete_product_subcategory
-- that reproduce, field-for-field, condition-for-condition, what ProductSubcategories.tsx does
-- today, all inside a single transaction with app.audit_bypass = 'on', accumulate a combined
-- diff ({table: {field: {old, new}}}), and call fn_manual_audit_log ONCE.
--
-- Naming: these are distinct from the Categorias RPCs (rpc_create_product_category etc.);
-- there is no collision.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS on product_categories / products does NOT self-enforce
-- inside them. Each RPC therefore re-checks, explicitly, the SAME predicate the RLS policies
-- enforce today, so a caller cannot touch data outside their visible orgs:
--   product_categories_insert (20260706000000 §2):
--     is_system_admin_user(uid)
--     OR ( has_anew_permission(uid,'product_categories.create')
--          AND organization_id IS NOT NULL
--          AND organization_id IN get_user_visible_org_ids(uid) )
--   product_categories_update (20260706000000 §2): USING + WITH CHECK both require
--     is_system_admin_user(uid)
--     OR ( has_anew_permission(uid,'product_categories.edit')
--          AND organization_id IN get_user_visible_org_ids(uid) )
--     -> both the pre-update org and the post-update org must satisfy it.
--   product_categories_delete (20260706000000 §2):
--     is_system_admin_user(uid)
--     OR ( has_anew_permission(uid,'product_categories.delete')
--          AND organization_id IN get_user_visible_org_ids(uid) )
--   products_update (20260703000000 §3): USING + WITH CHECK both require
--     is_system_admin_user(uid)
--     OR ( has_anew_permission(uid,'products.edit')
--          AND organization_id IN get_user_visible_org_ids(uid) )
--     The products cleanup in the delete RPC is scoped to the same org and only touches
--     soft-deleted rows (deleted_at IS NOT NULL), exactly like the FE .eq/.not filters.
--     NOTE on permission scope: the FE performs the products cleanup as an implicit side
--     effect of deleting a subcategory. The person deleting a subcategory holds
--     product_categories.delete but not necessarily products.edit. To preserve the exact
--     current behaviour (the cleanup succeeds today under the caller's session because the FE
--     UPDATE is bounded to their own org's soft-deleted rows), the delete RPC authorises the
--     cleanup under the SAME product_categories.delete gate + org-visibility scope it already
--     enforces for the category, rather than adding a products.edit requirement the FE never had.
--
-- Sentinel org
-- ------------
-- '00000000-0000-0000-0000-000000000001' — same constant used by
-- fn_audit_product_categories_with_sentinel(). product_categories.organization_id is nullable
-- (global categories); the manual audit row is routed under the sentinel exactly like the
-- trigger would. In practice subcategories created from this page always carry a concrete
-- organization_id (the FE requires a company), so the sentinel is a defensive fallback only.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql             — entity_audit_log
--   20260703010000_products_audit_triggers.sql      — trg_audit_products (fn_generic_entity_audit)
--   20260706010000_categories_audit_triggers.sql    — fn_audit_product_categories_with_sentinel
--   20260706000000_categories_security_fixes.sql    — product_categories RLS mirrored here
--   20260703000000_products_security_fixes.sql      — products RLS mirrored here
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — fn_manual_audit_log(), generic fn guard
--   20260803010000_product_categories_audit_bypass_and_rpcs.sql — sibling module, guarded sentinel fn
--   20260615130000_baseline_new_database.sql        — has_anew_permission(),
--                                                     current_business_user_id(),
--                                                     get_user_visible_org_ids(),
--                                                     is_system_admin_user()


-- ============================================================
-- 1. rpc_create_product_subcategory(...)
-- ============================================================
-- Mirrors the create branch of handleSubmit() in src/pages/ProductSubcategories.tsx:
--   · parent_id is required (FE blocks submit without it).
--   · companyId = form organization (admins / products.manage) OR active company;
--     required (FE blocks submit without it). Passed in as p_organization_id.
--   · slug := provided slug OR generateSlug(name); path := parent.name.toLowerCase()/slug
--     (FE computes both from the loaded parentCategories list and passes them straight in so
--     the RPC stores the exact same values).
--   · INSERT product_categories {name, slug, path, description|null, parent_id,
--       organization_id, sort_order, is_active = true, created_by = business user}.
-- Returns the created product_categories row.
--
-- Authorization mirrors product_categories_insert RLS.

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
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_is_admin  boolean;
  v_subcat    public.product_categories;
  v_audit_org uuid;
  v_diff      jsonb;
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

  -- ── Authorization parity with product_categories_insert RLS ──────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar subcategorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
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

  -- Route global (org-less) subcategories under the sentinel, exactly like the trigger.
  v_audit_org := COALESCE(v_subcat.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_categories', v_subcat.id, v_audit_org, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_subcat;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_product_subcategory(text, text, text, text, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_product_subcategory(text, text, text, text, uuid, uuid, integer) TO authenticated;


-- ============================================================
-- 2. rpc_update_product_subcategory(...)
-- ============================================================
-- Mirrors the edit branch of handleSubmit() in src/pages/ProductSubcategories.tsx:
--   · parent_id is required (FE blocks submit without it).
--   · companyId required (FE blocks submit without it). Passed in as p_organization_id.
--   · UPDATE product_categories SET {name, description|null, sort_order, parent_id,
--       organization_id} WHERE id.  (slug / path are NOT sent in the edit payload — the
--       slug input stays editable in the FE but the update payload omits slug and path, so
--       the RPC leaves them unchanged to match exactly.)
-- Returns the updated product_categories row.
--
-- Authorization mirrors product_categories_update (USING pre-org + WITH CHECK post-org).

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
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_is_admin  boolean;
  v_before    public.product_categories;
  v_subcat    public.product_categories;
  v_audit_org uuid;
  v_cat_diff  jsonb;
  v_diff      jsonb;
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

  -- ── Authorization parity with product_categories_update RLS ──────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar subcategorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update org must be visible.
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Subcategoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update org must be visible (prevents cross-org reassignment).
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
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

  v_audit_org := COALESCE(v_subcat.organization_id, k_system_sentinel);

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
-- 3. rpc_delete_product_subcategory(...)
-- ============================================================
-- Mirrors handleDelete() in src/pages/ProductSubcategories.tsx:
--   · Verify subcategory ownership: the FE looks up the row's organization_id and scopes
--     every write to it. We take that org as p_organization_id and enforce the same predicate.
--   · UPDATE products SET subcategory_id = NULL
--       WHERE subcategory_id = p_id
--         AND organization_id = <sub org>
--         AND deleted_at IS NOT NULL      -- .not("deleted_at","is",null): only soft-deleted rows
--     (clears references in soft-deleted products so they don't block the DELETE via FK).
--   · DELETE FROM product_categories WHERE id AND organization_id = <sub org>.
--     The FE surfaces FK violation 23503 (subcategory still in use by ACTIVE products) as a
--     user-facing "cannot delete / in use" message rather than a hard error. Here the FK
--     violation propagates as SQLSTATE 23503 so the FE can detect error.code === '23503' and
--     show the same message; the whole RPC transaction rolls back (including the products
--     cleanup), which is the correct all-or-nothing behaviour.
-- Returns void.
--
-- Authorization mirrors product_categories_delete RLS; the products cleanup is authorised
-- under the same delete gate + org scope (see header note on permission scope).

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
  v_uid            uuid := auth.uid();
  v_actor          uuid;
  v_is_admin       boolean;
  v_before         public.product_categories;
  v_cleared_ids    uuid[];
  v_audit_org      uuid;
  v_diff           jsonb;
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

  -- ── Authorization parity with product_categories_delete RLS ──────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.delete') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar subcategorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
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

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

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
-- 1. No trigger functions were redefined here; both are already guarded:
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('fn_generic_entity_audit','fn_audit_product_categories_with_sentinel')
--     AND prosrc LIKE '%app.audit_bypass%';
--   -- Expected: both rows (guarded by 20260719010000 and 20260803010000 respectively).
--
-- 2. Creating a subcategory produces exactly ONE audit row:
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'product_categories' AND operation = 'INSERT'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: 1.
--
-- 3. Deleting a subcategory that has soft-deleted products referencing it produces exactly
--    ONE audit row (DELETE) whose changed_fields includes both a product_categories snapshot
--    and a products.subcategory_id/cleared_product_ids block — despite the products UPDATE.
--
-- 4. Deleting a subcategory still referenced by ACTIVE products raises SQLSTATE 23503 and
--    rolls back the whole RPC (products cleanup included); the FE maps 23503 to the
--    "cannot delete / in use by products" message.
--
-- 5. rpc_update / rpc_delete on a subcategory whose organization_id differs from the passed
--    org raise no_data_found; a subcategory outside the caller's visible orgs raises
--    insufficient_privilege — matching the RLS + FE .eq(organization_id) scoping.
