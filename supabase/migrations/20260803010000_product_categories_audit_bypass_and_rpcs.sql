-- Categorias (Produtos) — single-log RPCs on the shared audit-bypass foundation
-- 2026-08-03 | Module: Categorias (Produtos) — product_categories
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Today one user action (create/update/delete a product category) is issued from the
-- frontend (handleSubmit / handleDelete in src/pages/ProductCategories.tsx) as SEVERAL
-- independent Supabase calls, each its own Postgres transaction:
--   · create : INSERT product_categories  +  INSERT N × product_category_organizations
--   · update : UPDATE product_categories   +  DELETE product_category_organizations
--              + INSERT N × product_category_organizations
--   · delete : DELETE product_categories
-- Every audited table has an AFTER trigger that writes to entity_audit_log
-- (fn_audit_product_categories_with_sentinel on product_categories,
--  fn_audit_product_category_organizations on product_category_organizations), so a single
-- "save category" that also rewrites the junction produces N audit rows (one per table
-- touched, sometimes several for the junction rewrite) when the business intent is exactly
-- ONE audit entry.
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
-- This migration:
--   1. Adds the audit-bypass guard to the TWO audit trigger functions that fire on the
--      tables these RPCs write to — they did NOT have it yet (only the Roles trigger
--      functions and fn_generic_entity_audit were guarded in 20260719010000):
--        · fn_audit_product_categories_with_sentinel()   (product_categories)
--        · fn_audit_product_category_organizations()      (product_category_organizations)
--      CREATE OR REPLACE only; bodies are otherwise byte-identical to
--      20260706010000_categories_audit_triggers.sql. The triggers themselves are NOT touched.
--   2. Adds three RPCs (rpc_create_product_category / rpc_update_product_category /
--      rpc_delete_product_category) that reproduce, field-for-field, condition-for-condition,
--      what ProductCategories.tsx does today, all inside a single transaction with
--      app.audit_bypass = 'on', accumulate a combined diff across BOTH tables
--      ({table: {field: {old, new}}}), and call fn_manual_audit_log ONCE.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS on product_categories / product_category_organizations
-- does NOT self-enforce inside them. Each RPC therefore re-checks, explicitly, the SAME
-- predicate the RLS policies enforce today (20260706000000_categories_security_fixes.sql §2–3):
--   product_categories_insert : is_system_admin_user(uid)
--                               OR ( has_anew_permission(uid,'product_categories.create')
--                                    AND organization_id IS NOT NULL
--                                    AND organization_id IN get_user_visible_org_ids(uid) )
--   product_categories_update : is_system_admin_user(uid)
--                               OR ( has_anew_permission(uid,'product_categories.edit')
--                                    AND organization_id IN get_user_visible_org_ids(uid) )
--                               (both pre- and post-update org must satisfy it)
--   product_categories_delete : is_system_admin_user(uid)
--                               OR ( has_anew_permission(uid,'product_categories.delete')
--                                    AND organization_id IN get_user_visible_org_ids(uid) )
--   product_category_organizations_(insert|delete) mirror create/delete perms + org scope.
-- The per-company org rows written to product_category_organizations are each re-validated
-- against get_user_visible_org_ids(uid) so a caller cannot associate a category with an org
-- outside their scope (matching product_category_organizations_insert WITH CHECK).
--
-- Sentinel org
-- ------------
-- '00000000-0000-0000-0000-000000000001' — same constant used by
-- fn_audit_product_categories_with_sentinel(). product_categories.organization_id is nullable
-- (global categories); the manual audit row is routed under the sentinel exactly like the
-- trigger would, so it lands in the SAME place. Never insert this UUID into anew_organizations.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql             — entity_audit_log
--   20260706010000_categories_audit_triggers.sql    — the two audit trigger functions
--   20260706000000_categories_security_fixes.sql    — the RLS policies mirrored here
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — fn_manual_audit_log() (FOUNDATION, reused)
--   20260615130000_baseline_new_database.sql        — has_anew_permission(),
--                                                     current_business_user_id(),
--                                                     get_user_visible_org_ids(),
--                                                     is_system_admin_user()


-- ============================================================
-- 1a. fn_audit_product_categories_with_sentinel() — add audit-bypass guard
-- ============================================================
-- Body identical to 20260706010000_categories_audit_triggers.sql §1 except for the
-- new guard as the first statement. The guard must run BEFORE any other logic.

CREATE OR REPLACE FUNCTION public.fn_audit_product_categories_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';

  v_org_id         uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['updated_at', 'created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- When a business RPC has already written a single consolidated audit row via
  -- fn_manual_audit_log(), it sets app.audit_bypass='on' (SET LOCAL) so this
  -- trigger writes nothing and the action produces exactly one log row.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve org_id and entity_id ─────────────────────────────────────────
  -- product_categories has no separate entity_id column; row id serves as entity_id.
  v_org_id    := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Sentinel substitution for global categories ───────────────────────────
  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL THEN
      v_source := 'system';
    END IF;
  END IF;

  -- ── Build payload ─────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    v_record         := to_jsonb(NEW);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    v_record         := to_jsonb(OLD);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json       := to_jsonb(OLD);
    v_new_json       := to_jsonb(NEW);
    v_record         := NULL;
    v_changed_fields := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;

    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── Write audit row ───────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       TG_TABLE_NAME,
       TG_OP,
       v_changed_fields,
       v_record,
       COALESCE(v_user_id, public.current_business_user_id()),
       v_source,
       now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_product_categories_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_categories_with_sentinel() TO service_role;


-- ============================================================
-- 1b. fn_audit_product_category_organizations() — add audit-bypass guard
-- ============================================================
-- Body identical to 20260706010000_categories_audit_triggers.sql §2 except for the
-- new guard as the first statement.

CREATE OR REPLACE FUNCTION public.fn_audit_product_category_organizations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_category_id    uuid;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve category_id from whichever side is available ─────────────────
  v_category_id := COALESCE(
    (to_jsonb(NEW) ->> 'category_id')::uuid,
    (to_jsonb(OLD) ->> 'category_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent category ─────────────
  IF v_category_id IS NOT NULL THEN
    SELECT pc.organization_id, pc.id
    INTO   v_org_id, v_entity_id
    FROM   public.product_categories pc
    WHERE  pc.id = v_category_id
    LIMIT  1;
  END IF;

  -- Global category: junction rows are not audited in the org-scoped log; the parent
  -- category's sentinel audit row captures the change. Skip silently.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Build payload ─────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    v_record         := to_jsonb(NEW);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    v_record         := to_jsonb(OLD);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json       := to_jsonb(OLD);
    v_new_json       := to_jsonb(NEW);
    v_record         := NULL;
    v_changed_fields := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;

    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── Write audit row ───────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       TG_TABLE_NAME,
       TG_OP,
       v_changed_fields,
       v_record,
       COALESCE(v_user_id, public.current_business_user_id()),
       v_source,
       now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_product_category_organizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_category_organizations() TO service_role;


-- ============================================================
-- 2a. rpc_create_product_category(...)
-- ============================================================
-- Mirrors the create branch of handleSubmit() in src/pages/ProductCategories.tsx:
--   · Requires at least one company (uniqueCompanyIds); primary org = first id.
--   · slug := provided slug OR generateSlug(name) (frontend already computes; passed in).
--   · path := parent.path + '/' + slug when parent_id set, else slug (computed in the FE
--     from the loaded categories list; passed in so the RPC stores the exact same value).
--   · INSERT product_categories {name, slug, path, description|null, parent_id|null,
--       sort_order, is_active = true, created_by = business user, organization_id = primary}.
--   · INSERT N × product_category_organizations {category_id, organization_id, created_by}.
-- The FE rolls back the category if the association insert fails; here the single
-- transaction gives that atomicity for free.
-- Returns the created product_categories row.
--
-- Authorization mirrors product_categories_insert + product_category_organizations_insert RLS.

CREATE OR REPLACE FUNCTION public.rpc_create_product_category(
  p_name        text,
  p_slug        text,
  p_path        text,
  p_description text,
  p_parent_id   uuid,
  p_sort_order  integer,
  p_org_ids     uuid[]
)
RETURNS public.product_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_primary_org uuid;
  v_org         uuid;
  v_dedup_orgs  uuid[];
  v_category    public.product_categories;
  v_audit_org   uuid;
  v_diff        jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ─────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Dedup org ids, preserving order (mirrors the FE's Array.from(new Set(...))) ──
  IF p_org_ids IS NULL THEN
    v_dedup_orgs := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
    INTO   v_dedup_orgs
    FROM (
      SELECT o, min(ord) AS ord
      FROM   unnest(p_org_ids) WITH ORDINALITY AS u(o, ord)
      WHERE  o IS NOT NULL
      GROUP  BY o
    ) d;
  END IF;

  IF array_length(v_dedup_orgs, 1) IS NULL OR array_length(v_dedup_orgs, 1) = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos uma empresa' USING ERRCODE = 'check_violation';
  END IF;

  v_primary_org := v_dedup_orgs[1];

  -- ── Authorization parity with product_categories_insert RLS ──────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Primary org must be non-null and visible (WITH CHECK on product_categories).
    IF v_primary_org IS NULL
       OR NOT (v_primary_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible too (product_category_organizations_insert).
    FOREACH v_org IN ARRAY v_dedup_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── INSERT the category (identical column set to the FE insertPayload) ────
  INSERT INTO public.product_categories
    (name, slug, path, description, parent_id, sort_order, is_active,
     created_by, organization_id)
  VALUES
    (p_name,
     p_slug,
     p_path,
     nullif(p_description, ''),
     p_parent_id,
     COALESCE(p_sort_order, 0),
     true,
     v_actor,
     v_primary_org)
  RETURNING * INTO v_category;

  -- ── INSERT company associations (one row per deduped org) ─────────────────
  FOREACH v_org IN ARRAY v_dedup_orgs LOOP
    INSERT INTO public.product_category_organizations
      (category_id, organization_id, created_by)
    VALUES (v_category.id, v_org, v_actor);
  END LOOP;

  -- ── Combined diff: full snapshot of created row + granted org associations ─
  v_diff := jsonb_build_object(
    'product_categories', jsonb_build_object(
      'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.name)),
      'slug',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.slug)),
      'path',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.path)),
      'description',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.description)),
      'parent_id',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.parent_id)),
      'sort_order',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.sort_order)),
      'is_active',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.is_active)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.organization_id))
    ),
    'product_category_organizations', jsonb_build_object(
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_dedup_orgs))
    )
  );

  -- Route global categories under the sentinel, exactly like the trigger.
  v_audit_org := COALESCE(v_category.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_categories', v_category.id, v_audit_org, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_category;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_product_category(text, text, text, text, uuid, integer, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_product_category(text, text, text, text, uuid, integer, uuid[]) TO authenticated;


-- ============================================================
-- 2b. rpc_update_product_category(...)
-- ============================================================
-- Mirrors the edit branch of handleSubmit() in src/pages/ProductCategories.tsx:
--   · Requires at least one company; primary org = first deduped id.
--   · UPDATE product_categories SET {name, description|null, sort_order, organization_id}
--       WHERE id.  (slug / path / parent_id are NOT changed on edit — the FE never sends
--       them in updatePayload; the slug input is even disabled while editing.)
--   · DELETE all product_category_organizations WHERE category_id.
--   · INSERT N × product_category_organizations {category_id, organization_id, created_by}.
-- Returns the updated product_categories row.
--
-- Authorization mirrors product_categories_update (pre + post org visible) +
-- product_category_organizations_(delete|insert) RLS.

CREATE OR REPLACE FUNCTION public.rpc_update_product_category(
  p_id          uuid,
  p_name        text,
  p_description text,
  p_sort_order  integer,
  p_org_ids     uuid[]
)
RETURNS public.product_categories
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
  v_category    public.product_categories;
  v_primary_org uuid;
  v_org         uuid;
  v_dedup_orgs  uuid[];
  v_old_orgs    uuid[];
  v_audit_org   uuid;
  v_diff        jsonb;
  v_cat_diff    jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row (before-image for the diff + auth guards) ────────
  SELECT * INTO v_before FROM public.product_categories WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Dedup org ids, preserving order ──────────────────────────────────────
  IF p_org_ids IS NULL THEN
    v_dedup_orgs := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
    INTO   v_dedup_orgs
    FROM (
      SELECT o, min(ord) AS ord
      FROM   unnest(p_org_ids) WITH ORDINALITY AS u(o, ord)
      WHERE  o IS NOT NULL
      GROUP  BY o
    ) d;
  END IF;

  IF array_length(v_dedup_orgs, 1) IS NULL OR array_length(v_dedup_orgs, 1) = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos uma empresa' USING ERRCODE = 'check_violation';
  END IF;

  v_primary_org := v_dedup_orgs[1];

  -- ── Authorization parity with product_categories_update RLS ──────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update org must be visible.
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Categoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update org must be visible (prevents cross-org reassignment).
    IF v_primary_org IS NULL
       OR NOT (v_primary_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible (product_category_organizations_insert).
    FOREACH v_org IN ARRAY v_dedup_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── Snapshot old associations before the delete/insert rewrite ────────────
  SELECT COALESCE(array_agg(organization_id ORDER BY organization_id), ARRAY[]::uuid[])
  INTO   v_old_orgs
  FROM   public.product_category_organizations
  WHERE  category_id = p_id;

  -- ── UPDATE the category (identical column set to updatePayload) ───────────
  UPDATE public.product_categories
  SET name            = p_name,
      description     = nullif(p_description, ''),
      sort_order      = COALESCE(p_sort_order, 0),
      organization_id = v_primary_org
  WHERE id = p_id
  RETURNING * INTO v_category;

  -- ── Rewrite associations: delete all, then re-insert (matches the FE) ─────
  DELETE FROM public.product_category_organizations WHERE category_id = p_id;

  FOREACH v_org IN ARRAY v_dedup_orgs LOOP
    INSERT INTO public.product_category_organizations
      (category_id, organization_id, created_by)
    VALUES (p_id, v_org, v_actor);
  END LOOP;

  -- ── Build combined diff across both tables ────────────────────────────────
  v_cat_diff := '{}'::jsonb;
  IF v_before.name IS DISTINCT FROM v_category.name THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_category.name)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_category.description THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_category.description)));
  END IF;
  IF v_before.sort_order IS DISTINCT FROM v_category.sort_order THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('sort_order',
      jsonb_build_object('old', to_jsonb(v_before.sort_order), 'new', to_jsonb(v_category.sort_order)));
  END IF;
  IF v_before.organization_id IS DISTINCT FROM v_category.organization_id THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('organization_id',
      jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', to_jsonb(v_category.organization_id)));
  END IF;

  v_diff := '{}'::jsonb;
  IF v_cat_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('product_categories', v_cat_diff);
  END IF;

  -- Record an associations change only when the org set actually changed (order-insensitive).
  IF EXISTS (SELECT unnest(v_old_orgs)   EXCEPT SELECT unnest(v_dedup_orgs))
     OR EXISTS (SELECT unnest(v_dedup_orgs) EXCEPT SELECT unnest(v_old_orgs)) THEN
    v_diff := v_diff || jsonb_build_object(
      'product_category_organizations', jsonb_build_object(
        'organization_id', jsonb_build_object(
          'old', to_jsonb(v_old_orgs),
          'new', to_jsonb(v_dedup_orgs)
        )
      )
    );
  END IF;

  v_audit_org := COALESCE(v_category.organization_id, k_system_sentinel);

  -- Emit a single UPDATE log row only when something meaningful changed,
  -- matching the "skip when nothing changed" behavior of the triggers.
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'product_categories', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_category;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_product_category(uuid, text, text, integer, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_product_category(uuid, text, text, integer, uuid[]) TO authenticated;


-- ============================================================
-- 2c. rpc_delete_product_category(...)
-- ============================================================
-- Mirrors handleDelete() in src/pages/ProductCategories.tsx:
--   · DELETE FROM product_categories WHERE id AND organization_id = active company.
--     (The FE scopes the delete by the active company id; we take that org as a
--      parameter and enforce the same predicate so a caller cannot delete a category
--      whose organization_id differs from the passed active org.)
--   · The junction rows in product_category_organizations are removed first so the
--     combined audit diff reflects the full effect and no orphan rows remain (the FE
--     relies on FK cascade / the same DB behavior; deleting them explicitly is safe and
--     matches the intent of "delete this category").
-- Returns void.
--
-- Authorization mirrors product_categories_delete RLS.

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
  v_old_orgs   uuid[];
  v_audit_org  uuid;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row scoped by the active org (mirrors the FE .eq filters) ──
  SELECT * INTO v_before
  FROM public.product_categories
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with product_categories_delete RLS ──────────────
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

  -- ── Snapshot associations, then delete associations + category ────────────
  SELECT COALESCE(array_agg(organization_id ORDER BY organization_id), ARRAY[]::uuid[])
  INTO   v_old_orgs
  FROM   public.product_category_organizations
  WHERE  category_id = p_id;

  DELETE FROM public.product_category_organizations WHERE category_id = p_id;
  DELETE FROM public.product_categories
  WHERE id = p_id
    AND organization_id = p_organization_id;

  -- ── Combined diff: full snapshot of the removed category + its associations ─
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
    'product_categories', p_id, v_audit_org, 'DELETE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_product_category(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_product_category(uuid, uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Bypass guard present at the top of both product-category trigger functions:
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('fn_audit_product_categories_with_sentinel',
--                     'fn_audit_product_category_organizations')
--     AND prosrc LIKE '%app.audit_bypass%';
--   -- Expected: both rows.
--
-- 2. A single "create category associated with 3 companies" produces exactly ONE audit row:
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'product_categories' AND operation = 'INSERT'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: 1 (not 1 + 3, despite the junction inserts).
--
-- 3. An update that only rewrites company associations yields ONE row with a
--    product_category_organizations diff and no product_categories diff.
--
-- 4. rpc_delete_product_category on a category whose organization_id differs from the
--    passed active org raises no_data_found; a category outside the caller's visible orgs
--    raises insufficient_privilege — matching the RLS + FE .eq(organization_id) scoping.
