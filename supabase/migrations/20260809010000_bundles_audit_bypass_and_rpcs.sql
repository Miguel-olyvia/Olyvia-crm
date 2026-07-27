-- Bundles (Produtos) — single-log RPCs on the shared audit-bypass foundation
-- 2026-08-09 | Module: Bundles — bundles + bundle_components + bundle_choice_groups
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Today one user action on the Bundles module is issued from the frontend as SEVERAL
-- independent Supabase calls, each its own Postgres transaction. The survey counted 8
-- separate calls across the create/edit wizard and its child editors:
--   · Bundle details save    : INSERT bundles                                (BundleFormDialog.handleSubmit create)
--                              UPDATE bundles                                (BundleFormDialog.handleSubmit edit)
--   · Components editor       : INSERT/UPDATE/DELETE bundle_components        (BundleComponentsEditor)
--   · Choice groups editor    : INSERT bundle_choice_groups,
--                              INSERT/DELETE bundle_components (options),
--                              DELETE bundle_choice_groups + its components   (BundleChoiceGroupsEditor)
--   · Single delete           : soft-delete UPDATE bundles.deleted_at         (Bundles.handleDelete)
-- Every audited table has an AFTER trigger that writes to entity_audit_log
-- (fn_generic_entity_audit on bundles, fn_audit_bundle_components on bundle_components,
--  fn_audit_bundle_choice_groups on bundle_choice_groups), so a single "save bundle"
-- that also writes components and choice groups produces N audit rows (one per table
-- touched, several for multi-row rewrites) when the business intent is exactly ONE entry.
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
-- We REUSE it here; we do NOT recreate it. This module creates NO foundation.
--
-- This migration:
--   1. Adds the audit-bypass guard to the TWO satellite audit trigger functions that fire
--      on the child tables these RPCs write to — they did NOT have it yet (only the Roles
--      trigger functions and fn_generic_entity_audit were guarded in 20260719010000, and
--      fn_generic_entity_audit — which fires on bundles — is already guarded there):
--        · fn_audit_bundle_components()     (bundle_components)
--        · fn_audit_bundle_choice_groups()  (bundle_choice_groups)
--      CREATE OR REPLACE only; bodies are otherwise byte-identical to
--      20260704010000_bundles_audit_triggers.sql. The triggers themselves are NOT touched.
--   2. Adds RPCs that reproduce, field-for-field, condition-for-condition, what
--      Bundles.tsx / BundleFormDialog.tsx / the child editors do today, each inside a single
--      transaction with app.audit_bypass = 'on', accumulate a combined diff across ALL tables
--      touched ({table: {field: {old, new}}}), and call fn_manual_audit_log ONCE per action.
--
--      · rpc_create_bundle  — INSERT bundles (+ optional bundle_choice_groups + bundle_components)
--                             atomically, with created_by = business user. The FE create wizard
--                             currently inserts only the bundle row on the details tab (components
--                             and choice groups are added afterward through the child editors),
--                             so the p_components / p_choice_groups arrays are empty on that path;
--                             the RPC accepts them so the whole bundle can be created atomically
--                             with exactly ONE audit row when supplied.
--      · rpc_update_bundle  — UPDATE bundles with the identical column set to the edit branch of
--                             BundleFormDialog.handleSubmit (scoped by organization_id for parity
--                             with the module's org isolation), one consolidated UPDATE row.
--      · rpc_delete_bundle  — soft-delete UPDATE bundles.deleted_at scoped by organization_id
--                             (mirrors Bundles.handleDelete), one consolidated UPDATE row.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS on bundles / bundle_components / bundle_choice_groups
-- does NOT self-enforce inside them. Each RPC therefore re-checks, explicitly, the SAME
-- predicate the RLS policies enforce today (20260704000000_bundles_security_fixes.sql §3–5):
--   bundles_insert : is_system_admin_user(uid)
--                    OR ( has_anew_permission(uid,'products.manage')
--                         AND organization_id IN get_user_visible_org_ids(uid) )
--   bundles_update : is_system_admin_user(uid)
--                    OR ( deleted_at IS NULL              -- USING pre-image
--                         AND has_anew_permission(uid,'products.manage')
--                         AND organization_id IN get_user_visible_org_ids(uid) )
--                    with WITH CHECK requiring the post-image org to satisfy the same.
--   bundle_(components|choice_groups)_(insert|update|delete) :
--                    is_system_admin_user(uid)
--                    OR ( has_anew_permission(uid,'products.manage')
--                         AND parent bundle: deleted_at IS NULL
--                             AND organization_id IN get_user_visible_org_ids(uid) )
-- The canonical write gate for the whole bundles module is 'products.manage' (the create/edit/
-- delete UI gates in the FE use products.create/edit/delete, but the DB write policies all
-- consolidate to products.manage; see the Wave-0 header note). Because a single RPC writes the
-- parent bundle and its children within the same org, satisfying the bundle-level check (org
-- visible + products.manage) is exactly what the child policies require of the parent. The child
-- rows always reference the just-written bundle_id, so no cross-org child leak is possible.
--
-- Note on the FE soft-delete guard
-- --------------------------------
-- Bundles.handleDelete does UPDATE bundles SET deleted_at scoped by .eq("id").eq("organization_id").
-- We take the active org as a parameter and enforce the same predicate so a caller cannot
-- soft-delete a bundle whose organization_id differs from the passed active org. We also require
-- the pre-image deleted_at IS NULL (mirrors bundles_update USING) so a bundle is not "deleted"
-- twice, matching the SELECT filter the list uses (.is("deleted_at", null)).
--
-- Sentinel org
-- ------------
-- bundles.organization_id is nullable (global bundles). The bundles trigger is
-- fn_generic_entity_audit(), which SKIPS SILENTLY when organization_id IS NULL (it does not use
-- the '00000000-0000-0000-0000-000000000001' sentinel — that is only used by the roles/brands
-- sentinel functions). To land the manual audit row in the SAME place the trigger would have,
-- these RPCs only write when the resolved org is present; the FE always sets
-- organization_id = active company (non-NULL) on create/update, and delete/update are scoped by a
-- non-NULL active org, so the NULL-org path does not arise for these RPCs. We defensively skip the
-- manual audit write when the org is NULL, exactly matching the trigger's silent-skip behavior.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql             — entity_audit_log + fn_generic_entity_audit()
--   20260704000000_bundles_security_fixes.sql        — the RLS policies mirrored here
--   20260704010000_bundles_audit_triggers.sql        — fn_audit_bundle_components(),
--                                                      fn_audit_bundle_choice_groups()
--   20260719010000_roles_audit_bypass_and_rpcs.sql   — fn_manual_audit_log() + guarded
--                                                      fn_generic_entity_audit() (FOUNDATION, reused)
--   20260615130000_baseline_new_database.sql          — has_anew_permission(),
--                                                      current_business_user_id(),
--                                                      get_user_visible_org_ids(),
--                                                      is_system_admin_user()


-- ============================================================
-- 1a. fn_audit_bundle_components() — add audit-bypass guard
-- ============================================================
-- Body identical to 20260704010000_bundles_audit_triggers.sql §2 except for the
-- new guard as the first statement. The guard must run BEFORE any other logic.

CREATE OR REPLACE FUNCTION public.fn_audit_bundle_components()
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
  v_noise_cols     text[] := ARRAY['updated_at', 'created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_bundle_id      uuid;
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

  -- ── Resolve bundle_id from whichever side is available ──────────────────
  v_bundle_id := COALESCE(
    (to_jsonb(NEW) ->> 'bundle_id')::uuid,
    (to_jsonb(OLD) ->> 'bundle_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent bundle ─────────────
  IF v_bundle_id IS NOT NULL THEN
    SELECT b.organization_id, b.id
    INTO   v_org_id, v_entity_id
    FROM   public.bundles b
    WHERE  b.id = v_bundle_id
    LIMIT  1;
  END IF;

  -- Cannot determine org — skip silently.
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

    -- Skip write when nothing meaningful changed.
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
  -- Audit trigger must never block originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_bundle_components() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_bundle_components() TO service_role;


-- ============================================================
-- 1b. fn_audit_bundle_choice_groups() — add audit-bypass guard
-- ============================================================
-- Body identical to 20260704010000_bundles_audit_triggers.sql §1 except for the
-- new guard as the first statement.

CREATE OR REPLACE FUNCTION public.fn_audit_bundle_choice_groups()
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
  v_noise_cols     text[] := ARRAY['updated_at', 'created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_bundle_id      uuid;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
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

  -- ── Resolve bundle_id from whichever side is available ──────────────────
  v_bundle_id := COALESCE(
    (to_jsonb(NEW) ->> 'bundle_id')::uuid,
    (to_jsonb(OLD) ->> 'bundle_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent bundle ─────────────
  IF v_bundle_id IS NOT NULL THEN
    SELECT b.organization_id, b.id
    INTO   v_org_id, v_entity_id
    FROM   public.bundles b
    WHERE  b.id = v_bundle_id
    LIMIT  1;
  END IF;

  -- Cannot determine org — skip silently (bundle with NULL org_id).
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

    -- Skip write when nothing meaningful changed.
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
  -- Audit trigger must never block originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_bundle_choice_groups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_bundle_choice_groups() TO service_role;


-- ============================================================
-- 2a. rpc_create_bundle(...)
-- ============================================================
-- Mirrors the create branch of BundleFormDialog.handleSubmit() plus, when supplied, the
-- child editors (BundleComponentsEditor / BundleChoiceGroupsEditor), collapsed into ONE
-- atomic transaction and ONE audit row.
--
-- Bundle payload (identical to the FE bundleData + created_by):
--   { organization_id = active company, sku (trimmed), name (trimmed),
--     description (trimmed → NULL when empty), pricing_type,
--     fixed_price   = parseFloat when pricing_type='fixed_price'        else NULL,
--     discount_percent = parseFloat when pricing_type='percentage_discount' else NULL,
--     discount_fixed   = parseFloat when pricing_type='fixed_discount'  else NULL,
--     status, valid_from|NULL, valid_to|NULL, is_active = (status='active'),
--     created_by = business user }
-- The FE trims sku/name/description on the client (Zod-equivalent validation stays there);
-- this RPC trims defensively too so a raw caller cannot bypass it.
--
-- Optional children (empty on the current FE create path):
--   p_choice_groups : jsonb array of {name, description, min_selections, max_selections,
--                     is_required, sort_order}. The generated id is mapped back to
--                     component.choice_group_ref so components can reference a just-created group.
--   p_components    : jsonb array of {product_id, service_id, quantity, pricing_mode,
--                     custom_price, custom_discount_percent, custom_discount_fixed,
--                     is_optional, sort_order, choice_group_ref}. choice_group_ref is the
--                     0-based index into p_choice_groups (NULL for a top-level component).
--
-- Returns the created bundles row.
-- Authorization mirrors bundles_insert (+ the child insert policies, which the parent-org
-- check subsumes since children reference the just-created bundle).

CREATE OR REPLACE FUNCTION public.rpc_create_bundle(
  p_organization_id  uuid,
  p_sku              text,
  p_name             text,
  p_description      text,
  p_pricing_type     text,
  p_fixed_price      numeric,
  p_discount_percent numeric,
  p_discount_fixed   numeric,
  p_status           text,
  p_valid_from       timestamptz,
  p_valid_to         timestamptz,
  p_choice_groups    jsonb DEFAULT '[]'::jsonb,
  p_components       jsonb DEFAULT '[]'::jsonb
)
RETURNS public.bundles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_is_admin     boolean;
  v_bundle       public.bundles;
  v_is_active    boolean;
  v_group        jsonb;
  v_comp         jsonb;
  v_idx          integer;
  v_ref          integer;
  v_group_ids    uuid[] := ARRAY[]::uuid[];
  v_new_group_id uuid;
  v_target_grp   uuid;
  v_groups_diff  jsonb := '[]'::jsonb;
  v_comps_diff   jsonb := '[]'::jsonb;
  v_diff         jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ─────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with bundles_insert RLS ─────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para criar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_is_active := (p_status = 'active');

  -- ── INSERT the bundle (identical column set to bundleData + created_by) ───
  INSERT INTO public.bundles
    (organization_id, sku, name, description, pricing_type,
     fixed_price, discount_percent, discount_fixed,
     status, valid_from, valid_to, is_active, created_by)
  VALUES
    (p_organization_id,
     btrim(p_sku),
     btrim(p_name),
     nullif(btrim(coalesce(p_description, '')), ''),
     p_pricing_type::public.bundle_pricing_type,
     CASE WHEN p_pricing_type = 'fixed_price'          THEN p_fixed_price      ELSE NULL END,
     CASE WHEN p_pricing_type = 'percentage_discount'  THEN p_discount_percent ELSE NULL END,
     CASE WHEN p_pricing_type = 'fixed_discount'       THEN p_discount_fixed   ELSE NULL END,
     p_status,
     p_valid_from,
     p_valid_to,
     v_is_active,
     v_actor)
  RETURNING * INTO v_bundle;

  -- ── INSERT choice groups (preserving order); remember generated ids ───────
  IF p_choice_groups IS NOT NULL AND jsonb_typeof(p_choice_groups) = 'array' THEN
    FOR v_idx IN 0 .. (jsonb_array_length(p_choice_groups) - 1) LOOP
      v_group := p_choice_groups -> v_idx;

      INSERT INTO public.bundle_choice_groups
        (bundle_id, name, description, min_selections, max_selections, is_required, sort_order)
      VALUES
        (v_bundle.id,
         v_group ->> 'name',
         nullif(v_group ->> 'description', ''),
         COALESCE((v_group ->> 'min_selections')::integer, 1),
         COALESCE((v_group ->> 'max_selections')::integer, 1),
         COALESCE((v_group ->> 'is_required')::boolean, true),
         COALESCE((v_group ->> 'sort_order')::integer, v_idx))
      RETURNING id INTO v_new_group_id;

      v_group_ids := v_group_ids || v_new_group_id;
      v_groups_diff := v_groups_diff || jsonb_build_array(
        jsonb_build_object(
          'id',             to_jsonb(v_new_group_id),
          'name',           v_group -> 'name',
          'min_selections', v_group -> 'min_selections',
          'max_selections', v_group -> 'max_selections',
          'is_required',    v_group -> 'is_required'
        )
      );
    END LOOP;
  END IF;

  -- ── INSERT components (choice_group_ref = index into p_choice_groups) ─────
  IF p_components IS NOT NULL AND jsonb_typeof(p_components) = 'array' THEN
    FOR v_idx IN 0 .. (jsonb_array_length(p_components) - 1) LOOP
      v_comp := p_components -> v_idx;

      v_target_grp := NULL;
      IF (v_comp ->> 'choice_group_ref') IS NOT NULL THEN
        v_ref := (v_comp ->> 'choice_group_ref')::integer;
        IF v_ref >= 0 AND v_ref < COALESCE(array_length(v_group_ids, 1), 0) THEN
          v_target_grp := v_group_ids[v_ref + 1];  -- arrays are 1-based
        END IF;
      END IF;

      INSERT INTO public.bundle_components
        (bundle_id, product_id, service_id, quantity, pricing_mode,
         custom_price, custom_discount_percent, custom_discount_fixed,
         is_optional, choice_group_id, sort_order)
      VALUES
        (v_bundle.id,
         nullif(v_comp ->> 'product_id', '')::uuid,
         nullif(v_comp ->> 'service_id', '')::uuid,
         COALESCE((v_comp ->> 'quantity')::numeric, 1),
         COALESCE((v_comp ->> 'pricing_mode'), 'original')::public.component_pricing_mode,
         nullif(v_comp ->> 'custom_price', '')::numeric,
         nullif(v_comp ->> 'custom_discount_percent', '')::numeric,
         nullif(v_comp ->> 'custom_discount_fixed', '')::numeric,
         COALESCE((v_comp ->> 'is_optional')::boolean, false),
         v_target_grp,
         COALESCE((v_comp ->> 'sort_order')::integer, v_idx));

      v_comps_diff := v_comps_diff || jsonb_build_array(
        jsonb_build_object(
          'product_id',      v_comp -> 'product_id',
          'service_id',      v_comp -> 'service_id',
          'quantity',        v_comp -> 'quantity',
          'pricing_mode',    v_comp -> 'pricing_mode',
          'is_optional',     v_comp -> 'is_optional',
          'choice_group_id', to_jsonb(v_target_grp)
        )
      );
    END LOOP;
  END IF;

  -- ── Combined diff: full snapshot of the created bundle + created children ─
  v_diff := jsonb_build_object(
    'bundles', jsonb_build_object(
      'sku',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.sku)),
      'name',             jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.name)),
      'description',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.description)),
      'pricing_type',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.pricing_type)),
      'fixed_price',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.fixed_price)),
      'discount_percent', jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.discount_percent)),
      'discount_fixed',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.discount_fixed)),
      'status',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.status)),
      'valid_from',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.valid_from)),
      'valid_to',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.valid_to)),
      'is_active',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.is_active)),
      'organization_id',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.organization_id))
    )
  );

  IF jsonb_array_length(v_groups_diff) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'bundle_choice_groups', jsonb_build_object('old', NULL, 'new', v_groups_diff)
    );
  END IF;
  IF jsonb_array_length(v_comps_diff) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'bundle_components', jsonb_build_object('old', NULL, 'new', v_comps_diff)
    );
  END IF;

  -- Emit a single audit row. bundles uses fn_generic_entity_audit(), which SKIPS
  -- silently when organization_id IS NULL; mirror that here.
  IF v_bundle.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundles', v_bundle.id, v_bundle.organization_id, 'INSERT', v_diff, 'web_app'
    );
  END IF;

  RETURN v_bundle;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_bundle(uuid, text, text, text, text, numeric, numeric, numeric, text, timestamptz, timestamptz, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_bundle(uuid, text, text, text, text, numeric, numeric, numeric, text, timestamptz, timestamptz, jsonb, jsonb) TO authenticated;


-- ============================================================
-- 2b. rpc_update_bundle(...)
-- ============================================================
-- Mirrors the edit branch of BundleFormDialog.handleSubmit():
--   · UPDATE bundles SET {sku, name, description|NULL, pricing_type, fixed_price,
--       discount_percent, discount_fixed, status, valid_from|NULL, valid_to|NULL,
--       is_active = (status='active')} WHERE id = editing bundle.
--     The FE update is .eq("id") only; we additionally scope by organization_id (taken as a
--     parameter = active company) to enforce the module's org isolation — a caller cannot edit
--     a bundle whose organization_id differs from the passed active org (matching bundles_update
--     USING/WITH CHECK org visibility). The pre-image must be non-deleted (bundles_update USING
--     deleted_at IS NULL).
-- Returns the updated bundles row.
--
-- Authorization mirrors bundles_update RLS (pre + post org visible; the FE update does not
-- change organization_id, so pre- and post-image org are identical here).

CREATE OR REPLACE FUNCTION public.rpc_update_bundle(
  p_id               uuid,
  p_organization_id  uuid,
  p_sku              text,
  p_name             text,
  p_description      text,
  p_pricing_type     text,
  p_fixed_price      numeric,
  p_discount_percent numeric,
  p_discount_fixed   numeric,
  p_status           text,
  p_valid_from       timestamptz,
  p_valid_to         timestamptz
)
RETURNS public.bundles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_before      public.bundles;
  v_bundle      public.bundles;
  v_is_active   boolean;
  v_bundle_diff jsonb;
  v_diff        jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row scoped by the active org, non-deleted ────────────
  SELECT * INTO v_before
  FROM public.bundles
  WHERE id = p_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with bundles_update RLS ─────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para editar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING (pre-image) + WITH CHECK (post-image, unchanged org) both require the org visible.
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Bundle fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_is_active := (p_status = 'active');

  -- ── UPDATE the bundle (identical column set to bundleData) ────────────────
  UPDATE public.bundles
  SET sku              = btrim(p_sku),
      name             = btrim(p_name),
      description      = nullif(btrim(coalesce(p_description, '')), ''),
      pricing_type     = p_pricing_type::public.bundle_pricing_type,
      fixed_price      = CASE WHEN p_pricing_type = 'fixed_price'         THEN p_fixed_price      ELSE NULL END,
      discount_percent = CASE WHEN p_pricing_type = 'percentage_discount' THEN p_discount_percent ELSE NULL END,
      discount_fixed   = CASE WHEN p_pricing_type = 'fixed_discount'      THEN p_discount_fixed   ELSE NULL END,
      status           = p_status,
      valid_from       = p_valid_from,
      valid_to         = p_valid_to,
      is_active        = v_is_active
  WHERE id = p_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL
  RETURNING * INTO v_bundle;

  -- ── Build the diff (only fields that actually changed) ────────────────────
  v_bundle_diff := '{}'::jsonb;
  IF v_before.sku IS DISTINCT FROM v_bundle.sku THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('sku',
      jsonb_build_object('old', to_jsonb(v_before.sku), 'new', to_jsonb(v_bundle.sku)));
  END IF;
  IF v_before.name IS DISTINCT FROM v_bundle.name THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_bundle.name)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_bundle.description THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_bundle.description)));
  END IF;
  IF v_before.pricing_type IS DISTINCT FROM v_bundle.pricing_type THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('pricing_type',
      jsonb_build_object('old', to_jsonb(v_before.pricing_type), 'new', to_jsonb(v_bundle.pricing_type)));
  END IF;
  IF v_before.fixed_price IS DISTINCT FROM v_bundle.fixed_price THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('fixed_price',
      jsonb_build_object('old', to_jsonb(v_before.fixed_price), 'new', to_jsonb(v_bundle.fixed_price)));
  END IF;
  IF v_before.discount_percent IS DISTINCT FROM v_bundle.discount_percent THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('discount_percent',
      jsonb_build_object('old', to_jsonb(v_before.discount_percent), 'new', to_jsonb(v_bundle.discount_percent)));
  END IF;
  IF v_before.discount_fixed IS DISTINCT FROM v_bundle.discount_fixed THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('discount_fixed',
      jsonb_build_object('old', to_jsonb(v_before.discount_fixed), 'new', to_jsonb(v_bundle.discount_fixed)));
  END IF;
  IF v_before.status IS DISTINCT FROM v_bundle.status THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb(v_bundle.status)));
  END IF;
  IF v_before.valid_from IS DISTINCT FROM v_bundle.valid_from THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('valid_from',
      jsonb_build_object('old', to_jsonb(v_before.valid_from), 'new', to_jsonb(v_bundle.valid_from)));
  END IF;
  IF v_before.valid_to IS DISTINCT FROM v_bundle.valid_to THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('valid_to',
      jsonb_build_object('old', to_jsonb(v_before.valid_to), 'new', to_jsonb(v_bundle.valid_to)));
  END IF;
  IF v_before.is_active IS DISTINCT FROM v_bundle.is_active THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('is_active',
      jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(v_bundle.is_active)));
  END IF;

  v_diff := '{}'::jsonb;
  IF v_bundle_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('bundles', v_bundle_diff);
  END IF;

  -- Emit a single UPDATE row only when something meaningful changed, matching the
  -- trigger's skip-when-nothing-changed behavior. Skip when org is NULL (trigger silent-skip).
  IF v_diff <> '{}'::jsonb AND v_bundle.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundles', p_id, v_bundle.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_bundle;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_bundle(uuid, uuid, text, text, text, text, numeric, numeric, numeric, text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_bundle(uuid, uuid, text, text, text, text, numeric, numeric, numeric, text, timestamptz, timestamptz) TO authenticated;


-- ============================================================
-- 2c. rpc_delete_bundle(...)
-- ============================================================
-- Mirrors Bundles.handleDelete() (single) — a SOFT delete:
--   · UPDATE bundles SET deleted_at = now() WHERE id AND organization_id = active company.
--     (The FE scopes by .eq("id").eq("organization_id", activeCompany.id) and sets
--      deleted_at to an ISO timestamp. We take the active org as a parameter and enforce the
--      same predicate + require the pre-image be non-deleted, so a caller cannot re-delete or
--      soft-delete a bundle outside their active org.)
-- Child rows (bundle_components / bundle_choice_groups) are intentionally NOT touched — this is
-- a soft delete; the FE never removes children on delete, and the bundle can be restored.
-- Returns void.
--
-- Authorization mirrors bundles_update RLS (soft-delete is an UPDATE of deleted_at).

CREATE OR REPLACE FUNCTION public.rpc_delete_bundle(
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
  v_before     public.bundles;
  v_deleted_at timestamptz;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row scoped by the active org, non-deleted ────────────
  SELECT * INTO v_before
  FROM public.bundles
  WHERE id = p_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with bundles_update RLS ─────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Bundle fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Soft delete ───────────────────────────────────────────────────────────
  v_deleted_at := now();
  UPDATE public.bundles
  SET deleted_at = v_deleted_at
  WHERE id = p_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;

  -- ── Diff: the deleted_at transition (mirrors the trigger's UPDATE diff) ───
  v_diff := jsonb_build_object(
    'bundles', jsonb_build_object(
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
    )
  );

  IF v_before.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundles', p_id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_bundle(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_bundle(uuid, uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Bypass guard present at the top of both bundle satellite trigger functions
--    (fn_generic_entity_audit — the bundles trigger — is already guarded by 20260719010000):
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('fn_audit_bundle_components', 'fn_audit_bundle_choice_groups')
--     AND prosrc LIKE '%app.audit_bypass%';
--   -- Expected: both rows.
--
-- 2. A single "create bundle with 2 choice groups and 5 components" produces exactly ONE
--    audit row:
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'bundles' AND operation = 'INSERT'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: 1 (not 1 + 2 + 5, despite the child inserts).
--
-- 3. rpc_update_bundle / rpc_delete_bundle on a bundle whose organization_id differs from the
--    passed active org raises no_data_found; a bundle outside the caller's visible orgs raises
--    insufficient_privilege — matching bundles_update RLS + the FE .eq(organization_id) scoping.
--
-- 4. rpc_delete_bundle is a SOFT delete (sets deleted_at); the bundle disappears from the list
--    (.is("deleted_at", null)) and children are preserved for restore.
