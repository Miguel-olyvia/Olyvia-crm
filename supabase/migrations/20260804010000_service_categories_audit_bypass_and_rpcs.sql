-- Categorias (Serviços) — single-log RPCs (reuses the audit-bypass foundation)
-- 2026-08-04 | Module: Categorias (Serviços) / serv_categorias
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Version note (2026-08-04): re-versioned from 20260803010000 → 20260804010000. The prior
-- filename shared its version prefix with 20260803010000_product_categories_audit_bypass_and_rpcs.sql
-- (the parallel Categorias (Produtos) module). Supabase derives the schema_migrations version
-- from the filename prefix, so two files sharing 20260803010000 collide on
-- schema_migrations_pkey at `db push` time (SQLSTATE 23505). This file keeps a unique, later
-- version so both modules apply cleanly and in a deterministic forward-only order. SQL body
-- below is unchanged from the reviewed/approved content.
--
-- Tracking-state precondition (operational): a prior interrupted push left an orphan row
-- version='20260803010000' in supabase_migrations.schema_migrations while NONE of the five
-- RPCs below exist in the live DB (verified via pg_proc) and fn_audit_service_category still
-- lacks the app.audit_bypass guard. Before applying THIS file, reconcile that orphan row with
-- the user (it belongs to whichever 20260803010000 file actually landed, if any) — do not
-- silently delete shared migration-tracking state. This file's own version (20260804010000)
-- is unused in schema_migrations (no collision), so it can be applied once tracking is sane.
--
-- Problem this migration solves
-- ------------------------------
-- Today one user action on a service category is issued from the frontend as one or more
-- independent Supabase calls, each its own Postgres transaction:
--   · src/pages/ServiceCategories.tsx     handleSubmit  → INSERT/UPDATE service_categories (root)
--                                         handleDeleteConfirm → DELETE service_categories (root)
--   · src/pages/ServiceSubcategories.tsx  handleSubmit  → INSERT/UPDATE service_categories (subcat)
--                                         handleDelete  → UPDATE services (clear FK) + DELETE
--                                                         service_categories (subcat)  ← 2 calls
-- Every touched table has an AFTER trigger writing to entity_audit_log
-- (fn_audit_service_category on service_categories, fn_generic_entity_audit on services),
-- so the subcategory delete produces N audit rows when the business intent is exactly 1.
--
-- Solution
-- --------
-- The audit-bypass foundation already exists — grep for "app.audit_bypass" /
-- "fn_manual_audit_log" returns 20260719010000_roles_audit_bypass_and_rpcs.sql, which
-- created:
--   · the per-transaction GUC `app.audit_bypass` (SET LOCAL 'on' short-circuits the audit
--     triggers), guarded at the top of fn_generic_entity_audit()  ← already covers `services`
--   · the reusable public.fn_manual_audit_log(text,uuid,uuid,text,jsonb,text) writer
-- This migration REUSES both and does NOT recreate them.
--
-- The ONLY foundation piece still missing for this module is the bypass guard on
-- fn_audit_service_category() — the satellite trigger that fires on service_categories.
-- It was defined in 20260702010000_services_audit_triggers.sql WITHOUT the guard, so a
-- consolidating RPC that sets app.audit_bypass='on' would still get a duplicate row from it.
-- We add the guard here with CREATE OR REPLACE — body byte-identical to
-- 20260702010000 §1 except for the new guard as the first statement. The trigger itself is
-- NOT touched.
--
-- Then five RPCs reproduce, field-for-field, condition-for-condition, what the two pages do
-- today, each inside a single transaction with app.audit_bypass='on', accumulating a combined
-- diff ({table:{col:{old,new}}}) and calling fn_manual_audit_log ONCE:
--   · rpc_create_service_category     — ServiceCategories.tsx    handleSubmit (create, root)
--   · rpc_update_service_category     — ServiceCategories.tsx    handleSubmit (update, root)
--   · rpc_create_service_subcategory  — ServiceSubcategories.tsx handleSubmit (create, subcat)
--   · rpc_update_service_subcategory  — ServiceSubcategories.tsx handleSubmit (update, subcat)
--   · rpc_delete_service_category     — both handleDeleteConfirm (root) and handleDelete
--                                       (subcat: clear FK on services + delete) — one row.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS on service_categories / services does NOT self-enforce
-- inside them. Each RPC re-checks, explicitly, the SAME predicates the RLS policies enforce
-- today. Root vs subcategory split (both live in service_categories, distinguished by
-- parent_id), from 20260706060000 + 20260706110000 (service_categories) and 20260615130000 +
-- 20260702000000 (services):
--   service_categories_insert (root)     : is_system_admin_user(uid)
--                                          OR (parent_id IS NULL
--                                              AND has_anew_permission(uid,'service_categories.create')
--                                              AND organization_id IS NOT NULL
--                                              AND organization_id IN visible_orgs)
--   service_categories_insert (subcat)   : is_system_admin_user(uid)
--                                          OR (parent_id IS NOT NULL
--                                              AND has_anew_permission(uid,'service_subcategories.create')
--                                              AND get_service_category_org_id(parent_id) IN visible_orgs)
--   service_categories_update (root)     : has_anew_permission(uid,'service_categories.edit')
--                                          + organization_id IN visible_orgs (USING and WITH CHECK)
--   service_categories_update (subcat)   : has_anew_permission(uid,'service_subcategories.edit')
--                                          + get_service_category_org_id(parent_id) IN visible_orgs
--   service_categories_delete (root)     : has_anew_permission(uid,'service_categories.delete')
--                                          + organization_id IN visible_orgs
--   service_categories_delete (subcat)   : has_anew_permission(uid,'service_subcategories.delete')
--                                          + get_service_category_org_id(parent_id) IN visible_orgs
--   services_update                      : has_anew_permission(uid,'services.edit')
--                                          + organization_id IN visible_orgs
-- is_system_admin_user(uid) bypasses each check, mirroring the module-wide RLS pattern.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql            — entity_audit_log + fn_generic_entity_audit()
--   20260702010000_services_audit_triggers.sql     — fn_audit_service_category()
--   20260719010000_roles_audit_bypass_and_rpcs.sql — app.audit_bypass guard on
--                                                     fn_generic_entity_audit() + fn_manual_audit_log()
--   20260706060000_categories_audit_gaps_fix.sql   — service_categories RLS (roots)
--   20260706070000_subcategories_rls_permissions.sql / 20260706110000_service_subcategories_rls_gaps.sql
--                                                     — service_subcategories.* perms + update policy
--   20260615130000_baseline_new_database.sql        — has_anew_permission(), current_business_user_id(),
--                                                     get_user_visible_org_ids(), is_system_admin_user(),
--                                                     get_service_category_org_id(), services_update RLS


-- ============================================================
-- 1. fn_audit_service_category() — add audit-bypass guard at the top
-- ============================================================
-- Body identical to 20260702010000_services_audit_triggers.sql §1 except for the new
-- guard as the first statement. The guard runs BEFORE any other logic.

CREATE OR REPLACE FUNCTION public.fn_audit_service_category()
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
  v_noise_cols     text[] := ARRAY['updated_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_parent_id      uuid;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- When a business RPC has already written a single consolidated audit row via
  -- fn_manual_audit_log(), it sets app.audit_bypass='on' (SET LOCAL) so this
  -- trigger writes nothing and the action produces exactly one log row.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve entity_id (own id — no entity_id column on this table) ───────
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Resolve organization_id ──────────────────────────────────────────────
  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );

  IF v_org_id IS NULL THEN
    v_parent_id := COALESCE(
      (to_jsonb(NEW) ->> 'parent_id')::uuid,
      (to_jsonb(OLD) ->> 'parent_id')::uuid
    );
    IF v_parent_id IS NOT NULL THEN
      v_org_id := public.get_service_category_org_id(v_parent_id);
    END IF;
  END IF;

  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Build payload ────────────────────────────────────────────────────────
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

  -- ── Write audit row ──────────────────────────────────────────────────────
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

REVOKE ALL ON FUNCTION public.fn_audit_service_category() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_service_category() TO service_role;


-- ============================================================
-- 2a. rpc_create_service_category(...)
-- ============================================================
-- Mirrors the create branch of ServiceCategories.tsx.handleSubmit (root category,
-- parent_id IS NULL):
--   slug        := formData.slug || generateSlug(formData.name)   ← FE derives; passed in
--   INSERT service_categories {name, slug, description|null, parent_id (always NULL here),
--                              organization_id, sort_order, is_active=true, created_by}
-- The FE requires formData.organization_id up front (companyRequired guard). Returns the
-- created row.
--
-- Authorization mirrors service_categories_insert (root arm).

CREATE OR REPLACE FUNCTION public.rpc_create_service_category(
  p_name            text,
  p_slug            text,
  p_description     text,
  p_organization_id uuid,
  p_sort_order      integer
)
RETURNS public.service_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_row   public.service_categories;
  v_diff  jsonb;
  v_admin boolean;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_admin := public.is_system_admin_user((SELECT auth.uid()));

  -- ── Authorization parity with service_categories_insert (root arm) ────────
  IF NOT v_admin THEN
    IF NOT public.has_anew_permission((SELECT auth.uid()), 'service_categories.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar categorias de serviços'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    -- Even admins must supply an org for a root category (NOT NULL column semantics
    -- + FE companyRequired guard). No visibility restriction for admins.
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'Organização é obrigatória' USING ERRCODE = 'not_null_violation';
    END IF;
  END IF;

  -- ── INSERT the root category (identical column set to handleSubmit) ───────
  INSERT INTO public.service_categories
    (name, slug, description, parent_id, organization_id, sort_order, is_active, created_by)
  VALUES
    (p_name,
     p_slug,
     nullif(p_description, ''),
     NULL,
     p_organization_id,
     COALESCE(p_sort_order, 0),
     true,
     v_actor)
  RETURNING * INTO v_row;

  -- ── Combined diff: full snapshot of the created row ───────────────────────
  v_diff := jsonb_build_object(
    'service_categories', jsonb_build_object(
      'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.name)),
      'slug',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.slug)),
      'description',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.description)),
      'parent_id',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.parent_id)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.organization_id)),
      'sort_order',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.sort_order)),
      'is_active',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.is_active))
    )
  );

  PERFORM public.fn_manual_audit_log(
    'service_categories', v_row.id, v_row.organization_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_service_category(text, text, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_service_category(text, text, text, uuid, integer) TO authenticated;


-- ============================================================
-- 2b. rpc_update_service_category(...)
-- ============================================================
-- Mirrors the update branch of ServiceCategories.tsx.handleSubmit (root category):
--   UPDATE service_categories {name, description|null, organization_id, sort_order}
--   WHERE id = editingCategory.id
--   (slug is disabled in the edit form and NOT written; parent_id/is_active untouched.)
-- Returns the updated row.
--
-- ROOT-ONLY. This RPC implements exactly the ServiceCategories.tsx root-category update
-- (organization_id chosen freely; slug/path/parent_id left untouched). Subcategory updates
-- have a DIFFERENT shape (slug+path+parent_id rewritten, organization_id inherited from the
-- parent) and a DIFFERENT authorization arm (service_subcategories.edit + parent-chain org
-- resolution) — they are served by rpc_update_service_subcategory (§2e). To avoid the
-- authorization-bypass + row-corruption class flagged in review (a subcategory edited through
-- the root arm would use the wrong permission and overwrite organization_id inconsistently),
-- this function REJECTS any row with parent_id IS NOT NULL with a clear exception, mirroring
-- the root/subcat branch that rpc_delete_service_category already performs.
--
-- Authorization mirrors service_categories_update (root arm), USING (pre-update) and
-- WITH CHECK (post-update): the caller must have edit permission and both the current AND
-- the target organization_id must be visible (prevents cross-org lateral move).

CREATE OR REPLACE FUNCTION public.rpc_update_service_category(
  p_id              uuid,
  p_name            text,
  p_description     text,
  p_organization_id uuid,
  p_sort_order      integer
)
RETURNS public.service_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.service_categories;
  v_row    public.service_categories;
  v_diff   jsonb;
  v_cat    jsonb;
  v_admin  boolean;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.service_categories WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Root-only guard ───────────────────────────────────────────────────────
  -- This RPC only implements the root-category update shape/authorization. A
  -- subcategory (parent_id NOT NULL) must go through rpc_update_service_subcategory,
  -- which applies service_subcategories.edit + parent-chain org resolution and rewrites
  -- slug/path/parent_id. Rejecting here prevents an authorization bypass (editing a
  -- subcategory with only service_categories.edit) and row corruption (overwriting a
  -- subcategory's organization_id inconsistently with its parent).
  IF v_before.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Utilize rpc_update_service_subcategory para editar subcategorias'
      USING ERRCODE = 'feature_not_supported';
  END IF;

  v_admin := public.is_system_admin_user((SELECT auth.uid()));

  -- ── Authorization parity with service_categories_update (root arm) ────────
  IF NOT v_admin THEN
    IF NOT public.has_anew_permission((SELECT auth.uid()), 'service_categories.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar categorias de serviços'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update org must be visible.
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))) THEN
      RAISE EXCEPTION 'Categoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update org must also be visible.
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))) THEN
      RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE the root category (identical column set to handleSubmit) ───────
  UPDATE public.service_categories
  SET name            = p_name,
      description     = nullif(p_description, ''),
      organization_id = p_organization_id,
      sort_order      = COALESCE(p_sort_order, 0)
  WHERE id = p_id
  RETURNING * INTO v_row;

  -- ── Build diff across the single touched table ────────────────────────────
  v_cat := '{}'::jsonb;
  IF v_before.name IS DISTINCT FROM v_row.name THEN
    v_cat := v_cat || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_row.name)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_row.description THEN
    v_cat := v_cat || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_row.description)));
  END IF;
  IF v_before.organization_id IS DISTINCT FROM v_row.organization_id THEN
    v_cat := v_cat || jsonb_build_object('organization_id',
      jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', to_jsonb(v_row.organization_id)));
  END IF;
  IF v_before.sort_order IS DISTINCT FROM v_row.sort_order THEN
    v_cat := v_cat || jsonb_build_object('sort_order',
      jsonb_build_object('old', to_jsonb(v_before.sort_order), 'new', to_jsonb(v_row.sort_order)));
  END IF;

  v_diff := '{}'::jsonb;
  IF v_cat <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('service_categories', v_cat);
  END IF;

  -- Emit a single UPDATE log row only when something changed (matches the
  -- trigger's "skip when nothing changed" behaviour). Route under the post-update
  -- org (where the row now lives).
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'service_categories', p_id, v_row.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_service_category(uuid, text, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_service_category(uuid, text, text, uuid, integer) TO authenticated;


-- ============================================================
-- 2c. rpc_create_service_subcategory(...)
-- ============================================================
-- Mirrors the create branch of ServiceSubcategories.tsx.handleSubmit (subcategory,
-- parent_id IS NOT NULL). The FE resolves the parent, requires the parent to exist and
-- to have a non-null organization_id, then derives slug/path from the parent name and
-- inherits organization_id from the parent:
--   parentSlug := generateSlug(parent.name)
--   baseSlug   := formData.slug || generateSlug(formData.name)
--   slug       := parentSlug || '-' || baseSlug
--   path       := lower(parent.name) || '/' || baseSlug
--   INSERT service_categories {name, slug, path, description|null, parent_id,
--                              sort_order, is_active=true, created_by,
--                              organization_id := parent.organization_id}
-- The FE computes slug/path in JS and cannot reproduce arbitrary casing rules server-side
-- without risk of drift, so the caller passes the already-derived p_slug and p_path
-- (exactly as the FE builds them). The server still resolves and validates the parent and
-- forces organization_id := parent.organization_id (never trusting a caller-supplied org),
-- which is the invariant the FE enforces by construction.
-- Returns the created row.
--
-- Authorization mirrors service_categories_insert (subcategory arm):
--   is_system_admin_user(uid)
--   OR (has_anew_permission(uid,'service_subcategories.create')
--       AND get_service_category_org_id(parent_id) IN visible_orgs)

CREATE OR REPLACE FUNCTION public.rpc_create_service_subcategory(
  p_name        text,
  p_slug        text,
  p_path        text,
  p_description text,
  p_parent_id   uuid,
  p_sort_order  integer
)
RETURNS public.service_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      uuid;
  v_parent     public.service_categories;
  v_parent_org uuid;
  v_row        public.service_categories;
  v_diff       jsonb;
  v_admin      boolean;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_parent_id IS NULL THEN
    RAISE EXCEPTION 'Categoria pai é obrigatória' USING ERRCODE = 'not_null_violation';
  END IF;

  -- ── Resolve and validate the parent (FE requires parent to exist + have an org) ──
  SELECT * INTO v_parent FROM public.service_categories WHERE id = p_parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria pai não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_parent.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'A categoria pai não pode ser uma subcategoria' USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.organization_id IS NULL THEN
    RAISE EXCEPTION 'A categoria pai não tem empresa associada' USING ERRCODE = 'not_null_violation';
  END IF;

  -- Org is ALWAYS inherited from the parent (never caller-supplied), matching the FE.
  v_parent_org := v_parent.organization_id;

  v_admin := public.is_system_admin_user((SELECT auth.uid()));

  -- ── Authorization parity with service_categories_insert (subcategory arm) ─
  IF NOT v_admin THEN
    IF NOT public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar subcategorias de serviços'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (public.get_service_category_org_id(p_parent_id)
            IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))) THEN
      RAISE EXCEPTION 'Categoria pai fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── INSERT the subcategory (identical column set to handleSubmit) ─────────
  INSERT INTO public.service_categories
    (name, slug, path, description, parent_id, sort_order, is_active, created_by, organization_id)
  VALUES
    (p_name,
     p_slug,
     p_path,
     nullif(p_description, ''),
     p_parent_id,
     COALESCE(p_sort_order, 0),
     true,
     v_actor,
     v_parent_org)
  RETURNING * INTO v_row;

  -- ── Combined diff: full snapshot of the created row ───────────────────────
  v_diff := jsonb_build_object(
    'service_categories', jsonb_build_object(
      'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.name)),
      'slug',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.slug)),
      'path',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.path)),
      'description',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.description)),
      'parent_id',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.parent_id)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.organization_id)),
      'sort_order',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.sort_order)),
      'is_active',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.is_active))
    )
  );

  PERFORM public.fn_manual_audit_log(
    'service_categories', v_row.id, v_row.organization_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_service_subcategory(text, text, text, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_service_subcategory(text, text, text, text, uuid, integer) TO authenticated;


-- ============================================================
-- 2d. rpc_update_service_subcategory(...)
-- ============================================================
-- Mirrors the update branch of ServiceSubcategories.tsx.handleSubmit (subcategory):
--   UPDATE service_categories
--     SET name, slug, path, description|null, sort_order, parent_id,
--         organization_id := parent.organization_id
--   WHERE id = editingSubcategory.id
-- Just like create, the FE derives slug/path from the (possibly changed) parent name and
-- inherits organization_id from the parent. The caller passes the FE-derived p_slug/p_path;
-- the server re-resolves and validates the parent and forces
-- organization_id := parent.organization_id (never trusting a caller org).
--
-- SUBCATEGORY-ONLY. Rejects a row with parent_id IS NULL (that is a root category, served by
-- rpc_update_service_category) to prevent turning a root into a subcategory through the wrong
-- authorization arm.
-- Returns the updated row.
--
-- Authorization mirrors service_categories_update (subcategory arm), USING (pre-update
-- parent-chain org visible) and WITH CHECK (post-update parent-chain org visible + org
-- consistency: the row's org must equal the resolved parent org).

CREATE OR REPLACE FUNCTION public.rpc_update_service_subcategory(
  p_id          uuid,
  p_name        text,
  p_slug        text,
  p_path        text,
  p_description text,
  p_parent_id   uuid,
  p_sort_order  integer
)
RETURNS public.service_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor          uuid;
  v_before         public.service_categories;
  v_parent         public.service_categories;
  v_parent_org     uuid;
  v_old_parent_org uuid;
  v_row            public.service_categories;
  v_diff           jsonb;
  v_cat            jsonb;
  v_admin          boolean;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_parent_id IS NULL THEN
    RAISE EXCEPTION 'Categoria pai é obrigatória' USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT * INTO v_before FROM public.service_categories WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcategoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Subcategory-only guard ────────────────────────────────────────────────
  IF v_before.parent_id IS NULL THEN
    RAISE EXCEPTION 'Utilize rpc_update_service_category para editar categorias-raiz'
      USING ERRCODE = 'feature_not_supported';
  END IF;

  -- ── Resolve and validate the (target) parent ──────────────────────────────
  SELECT * INTO v_parent FROM public.service_categories WHERE id = p_parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria pai não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_parent.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'A categoria pai não pode ser uma subcategoria' USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.organization_id IS NULL THEN
    RAISE EXCEPTION 'A categoria pai não tem empresa associada' USING ERRCODE = 'not_null_violation';
  END IF;

  v_parent_org     := v_parent.organization_id;
  v_admin          := public.is_system_admin_user((SELECT auth.uid()));

  -- ── Authorization parity with service_categories_update (subcategory arm) ─
  IF NOT v_admin THEN
    IF NOT public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar subcategorias de serviços'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- USING (pre-update): the current parent chain must resolve to a visible org.
    v_old_parent_org := public.get_service_category_org_id(v_before.parent_id);
    IF v_old_parent_org IS NULL
       OR NOT (v_old_parent_org IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))) THEN
      RAISE EXCEPTION 'Subcategoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- WITH CHECK (post-update): the target parent chain must resolve to a visible org.
    IF NOT (public.get_service_category_org_id(p_parent_id)
            IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))) THEN
      RAISE EXCEPTION 'Categoria pai de destino fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- WITH CHECK org-consistency (enforced for all callers, admins included): the row's
  -- organization_id must stay consistent with the resolved parent chain. Because we always
  -- set organization_id := v_parent_org below, this invariant holds by construction; the
  -- explicit set is the point — we never let the row diverge from its parent's org.

  -- ── UPDATE the subcategory (identical column set to handleSubmit) ─────────
  UPDATE public.service_categories
  SET name            = p_name,
      slug            = p_slug,
      path            = p_path,
      description     = nullif(p_description, ''),
      sort_order      = COALESCE(p_sort_order, 0),
      parent_id       = p_parent_id,
      organization_id = v_parent_org
  WHERE id = p_id
  RETURNING * INTO v_row;

  -- ── Build diff across the single touched table ────────────────────────────
  v_cat := '{}'::jsonb;
  IF v_before.name IS DISTINCT FROM v_row.name THEN
    v_cat := v_cat || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_row.name)));
  END IF;
  IF v_before.slug IS DISTINCT FROM v_row.slug THEN
    v_cat := v_cat || jsonb_build_object('slug',
      jsonb_build_object('old', to_jsonb(v_before.slug), 'new', to_jsonb(v_row.slug)));
  END IF;
  IF v_before.path IS DISTINCT FROM v_row.path THEN
    v_cat := v_cat || jsonb_build_object('path',
      jsonb_build_object('old', to_jsonb(v_before.path), 'new', to_jsonb(v_row.path)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_row.description THEN
    v_cat := v_cat || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_row.description)));
  END IF;
  IF v_before.sort_order IS DISTINCT FROM v_row.sort_order THEN
    v_cat := v_cat || jsonb_build_object('sort_order',
      jsonb_build_object('old', to_jsonb(v_before.sort_order), 'new', to_jsonb(v_row.sort_order)));
  END IF;
  IF v_before.parent_id IS DISTINCT FROM v_row.parent_id THEN
    v_cat := v_cat || jsonb_build_object('parent_id',
      jsonb_build_object('old', to_jsonb(v_before.parent_id), 'new', to_jsonb(v_row.parent_id)));
  END IF;
  IF v_before.organization_id IS DISTINCT FROM v_row.organization_id THEN
    v_cat := v_cat || jsonb_build_object('organization_id',
      jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', to_jsonb(v_row.organization_id)));
  END IF;

  v_diff := '{}'::jsonb;
  IF v_cat <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('service_categories', v_cat);
  END IF;

  -- Emit a single UPDATE log row only when something changed (matches the trigger's
  -- "skip when nothing changed" behaviour). Route under the (post-update) parent org.
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'service_categories', p_id, v_parent_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_service_subcategory(uuid, text, text, text, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_service_subcategory(uuid, text, text, text, text, uuid, integer) TO authenticated;


-- ============================================================
-- 2e. rpc_delete_service_category(...)
-- ============================================================
-- Handles BOTH delete flows against service_categories:
--   · Root delete   — ServiceCategories.tsx.handleDeleteConfirm:
--       DELETE FROM service_categories WHERE id
--   · Subcat delete — ServiceSubcategories.tsx.handleDelete (2 calls today):
--       UPDATE services SET service_subcategory_id = NULL
--         WHERE service_subcategory_id = <id> AND deleted_at IS NOT NULL   (soft-deleted only)
--         [AND organization_id = resolvedOrg]   (defense-in-depth org scope)
--       DELETE FROM service_categories WHERE id [AND organization_id = resolvedOrg]
-- The distinction is v_before.parent_id: root when NULL, subcategory when NOT NULL. The
-- FE's `.not("deleted_at","is",null)` means it clears the FK ONLY on soft-deleted services
-- (live services with the FK would raise 23503 and block the delete — the FE surfaces that
-- as "cannotDelete"). We reproduce exactly: clear only soft-deleted services, then delete;
-- a 23503 from a live FK propagates to the caller unchanged.
-- Returns void.
--
-- Authorization mirrors service_categories_delete (root/subcat arms) plus, for the FK
-- cleanup, services_update.

CREATE OR REPLACE FUNCTION public.rpc_delete_service_category(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor         uuid;
  v_before        public.service_categories;
  v_org_id        uuid;
  v_cleared_ids   uuid[];
  v_diff          jsonb;
  v_admin         boolean;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.service_categories WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_admin := public.is_system_admin_user((SELECT auth.uid()));

  -- Resolve the effective org for this row exactly as the RLS delete policy does:
  --   root      → organization_id column
  --   subcategory → get_service_category_org_id(parent_id) walk
  IF v_before.parent_id IS NULL THEN
    v_org_id := v_before.organization_id;
  ELSE
    v_org_id := COALESCE(
      v_before.organization_id,
      public.get_service_category_org_id(v_before.parent_id)
    );
  END IF;

  -- ── Authorization parity with service_categories_delete ───────────────────
  IF NOT v_admin THEN
    IF v_before.parent_id IS NULL THEN
      IF NOT public.has_anew_permission((SELECT auth.uid()), 'service_categories.delete') THEN
        RAISE EXCEPTION 'Sem permissão para eliminar categorias de serviços'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      IF NOT public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.delete') THEN
        RAISE EXCEPTION 'Sem permissão para eliminar subcategorias de serviços'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    IF v_org_id IS NULL
       OR NOT (v_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))) THEN
      RAISE EXCEPTION 'Categoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Clear FK on soft-deleted services (subcategory delete flow only) ──────
  -- Mirrors ServiceSubcategories.handleDelete: update ONLY soft-deleted services,
  -- scoped to the resolved org (defense-in-depth, matches the FE's resolvedOrgId gate).
  -- Root categories are never referenced by services.service_subcategory_id, so this
  -- no-ops for them (parent_id IS NULL ⇒ nothing matches), matching the root FE flow.
  IF v_before.parent_id IS NOT NULL THEN
    -- Authorization parity with services_update for the rows we touch.
    IF NOT v_admin
       AND NOT public.has_anew_permission((SELECT auth.uid()), 'services.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar serviços associados'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    WITH cleared AS (
      UPDATE public.services s
      SET service_subcategory_id = NULL
      WHERE s.service_subcategory_id = p_id
        AND s.deleted_at IS NOT NULL
        AND (v_org_id IS NULL OR s.organization_id = v_org_id)
      RETURNING s.id
    )
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_cleared_ids FROM cleared;
  ELSE
    v_cleared_ids := ARRAY[]::uuid[];
  END IF;

  -- ── Delete the category ───────────────────────────────────────────────────
  -- A 23503 (live service still referencing the FK) propagates unchanged — the FE
  -- maps that to its "cannotDelete / inUseError" toast.
  DELETE FROM public.service_categories
  WHERE id = p_id
    AND (v_admin OR v_org_id IS NULL OR organization_id = v_org_id OR v_before.parent_id IS NOT NULL);

  -- ── Combined diff: removed category snapshot + FK-cleared services ────────
  v_diff := jsonb_build_object(
    'service_categories', jsonb_build_object(
      'name',            jsonb_build_object('old', to_jsonb(v_before.name), 'new', NULL),
      'slug',            jsonb_build_object('old', to_jsonb(v_before.slug), 'new', NULL),
      'description',     jsonb_build_object('old', to_jsonb(v_before.description), 'new', NULL),
      'parent_id',       jsonb_build_object('old', to_jsonb(v_before.parent_id), 'new', NULL),
      'organization_id', jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', NULL),
      'sort_order',      jsonb_build_object('old', to_jsonb(v_before.sort_order), 'new', NULL),
      'is_active',       jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', NULL)
    )
  );

  -- Record the FK cleanup only when services were actually touched.
  IF array_length(v_cleared_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'services', jsonb_build_object(
        'service_subcategory_id', jsonb_build_object(
          'old', to_jsonb(p_id),
          'new', NULL
        ),
        'affected_ids', jsonb_build_object(
          'old', to_jsonb(v_cleared_ids),
          'new', NULL
        )
      )
    );
  END IF;

  PERFORM public.fn_manual_audit_log(
    'service_categories', p_id, v_org_id, 'DELETE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_service_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_service_category(uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Bypass guard present at the top of the satellite trigger function (the generic
--    function was already guarded in 20260719010000):
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('fn_audit_service_category', 'fn_generic_entity_audit')
--     AND prosrc LIKE '%app.audit_bypass%';
--   -- Expected: both rows.
--
-- 2. Deleting a subcategory that had 2 soft-deleted services referencing it produces
--    exactly ONE audit row (not three), with a combined service_categories + services diff:
--   SELECT public.rpc_delete_service_category('<subcategory-uuid>');
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE entity_id = '<subcategory-uuid>' AND operation = 'DELETE'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: 1.
--
-- 3. A create/update on a root category yields exactly ONE row.
--
-- 3b. A create/update on a subcategory (rpc_create_service_subcategory /
--    rpc_update_service_subcategory) yields exactly ONE row, with organization_id equal to
--    the parent's org (never a caller-supplied value):
--   SELECT (public.rpc_create_service_subcategory('X','par-x','parent/x',NULL,'<parent-uuid>',0)).organization_id;
--   -- Expected: equals the parent's organization_id.
--
-- 3c. rpc_update_service_category rejects a subcategory id (feature_not_supported), and
--    rpc_update_service_subcategory rejects a root id (feature_not_supported) — the
--    root/subcat authorization arms cannot be crossed.
--
-- 4. A caller without service_categories.delete (root) / service_subcategories.delete
--    (subcat) — or targeting an org outside their visible set — raises
--    insufficient_privilege, matching the RLS policies. system_admin bypasses.
--
-- 5. Deleting a subcategory still referenced by a LIVE (deleted_at IS NULL) service
--    raises 23503 from the FK — propagated to the caller so the FE shows "cannotDelete",
--    exactly as today.
