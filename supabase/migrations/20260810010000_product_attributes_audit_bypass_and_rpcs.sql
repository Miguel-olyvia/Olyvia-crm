-- Atributos (Produtos) — single-log RPCs on the shared audit-bypass foundation
-- 2026-08-10 | Module: prod_atributos — product_attributes + attribute_option_groups
--             + attribute_option_group_values + product_attribute_value_prices
--             + product_attribute_price_ranges + product_attribute_organizations
--             + category_attribute_palettes
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Today one user action on the Attributes module is issued from the frontend as SEVERAL
-- independent Supabase calls, each its own Postgres transaction. The survey identified
-- 8 separate calls. Examples (src/pages/ProductAttributes.tsx,
-- src/components/AttributeOptionPalettesDialog.tsx, src/hooks/useBulkActions.ts):
--   · create   : INSERT product_attributes                                  (handleSubmit)
--   · update   : UPDATE product_attributes                                   (handleSubmit)
--   · delete   : DELETE product_attributes                                   (handleDelete)
--   · duplicate: INSERT product_attributes + N × attribute_option_groups
--                + N × attribute_option_group_values (chunked)
--                + N × product_attribute_value_prices
--                + N × product_attribute_price_ranges
--                + N × product_attribute_organizations
--                + N × category_attribute_palettes                           (handleDuplicate)
--   · bulk     : UPDATE/DELETE/org-reassign N × product_attributes via useBulkActions.
--   · groups   : INSERT/DELETE attribute_option_groups + INSERT/DELETE
--                attribute_option_group_values (palettes dialog).
--   · palettes : UPSERT/UPDATE/DELETE category_attribute_palettes.
-- Every audited table has an AFTER trigger that writes to entity_audit_log, so a single
-- user action produces N audit rows (one per table/row touched) when the business intent
-- is exactly ONE audit entry.
--
-- Solution
-- --------
-- The audit-bypass FOUNDATION already exists — created by the Roles module in
-- 20260719010000_roles_audit_bypass_and_rpcs.sql (grep for "app.audit_bypass" /
-- "fn_manual_audit_log" confirms it). It provides:
--   · The per-transaction GUC `app.audit_bypass`. When set to 'on' (SET LOCAL / set_config
--     with is_local=true), guarded audit trigger functions short-circuit and write nothing.
--   · fn_manual_audit_log(p_table_name, p_entity_id, p_organization_id, p_operation,
--     p_changed_fields, p_source) — writes exactly ONE row to entity_audit_log, reusing the
--     SAME author-resolution chain as the trigger functions (app.audit_user_id GUC →
--     current_business_user_id() → anew_users via auth.uid()). Never raises.
-- We REUSE it here; we do NOT recreate it. This module creates NO foundation.
--
-- This migration:
--   1. Adds the audit-bypass guard to the SIX audit trigger functions that fire on the
--      tables these RPCs write to (they did NOT have it yet). CREATE OR REPLACE only;
--      bodies are otherwise byte-identical to the source migrations. Triggers untouched.
--        · fn_audit_product_attributes_with_sentinel()           (product_attributes)
--        · fn_audit_attribute_option_groups_with_sentinel()      (attribute_option_groups)
--        · fn_audit_attribute_option_group_values()              (attribute_option_group_values)
--        · fn_audit_product_attribute_value_prices_sentinel()    (product_attribute_value_prices)
--        · fn_audit_product_attribute_price_ranges()             (product_attribute_price_ranges)
--        · fn_audit_category_attribute_palettes()                (category_attribute_palettes)
--      NOTE: product_attribute_organizations has NO audit trigger (none was ever created),
--      so it needs no guard; its writes are captured only inside the combined manual diff.
--
--   2. Adds RPCs that reproduce, field-for-field, condition-for-condition, what the
--      frontend does today, each inside a single transaction with app.audit_bypass = 'on',
--      accumulate a combined diff across ALL touched tables ({table: {col: {old, new}}}),
--      and call fn_manual_audit_log ONCE per action.
--
--      EXCEPTION — rpc_duplicate_product_attribute is field-for-field faithful in WHAT it
--      copies, but intentionally diverges from the FE in TWO behavioral aspects (both are
--      accepted design decisions, NOT bugs to be fixed — see §2f "Accepted divergences").
--      Every other RPC in this migration is field-for-field / condition-for-condition
--      identical to the frontend path it replaces.
--
--        · rpc_create_product_attribute      — INSERT product_attributes
--        · rpc_update_product_attribute       — UPDATE product_attributes (scoped by active org)
--        · rpc_delete_product_attribute       — DELETE product_attributes (scoped by active org)
--        · rpc_duplicate_product_attribute    — full deep clone across all 7 tables, 1 log row
--        · rpc_bulk_status_product_attribute  — UPDATE is_active-like status? (see note)
--        · rpc_bulk_delete_product_attribute  — hard DELETE N attributes, scoped by org
--        · rpc_bulk_org_product_attribute     — UPDATE organization_id on N attributes
--        · rpc_manage_attribute_option_group  — create/update/delete groups + values (palettes)
--        · rpc_manage_attribute_organizations — upsert/prune product_attribute_organizations
--        · rpc_manage_category_attribute_palette — assign/reassign/remove palette per category
--
--      Bulk RPCs emit ONE consolidated audit row per affected attribute (the audit log is
--      per-entity; a single row cannot represent multiple distinct entities), but crucially
--      NOT the extra trigger rows the raw multi-statement path would produce — and the whole
--      bulk operation is one atomic transaction.
--
--      NOTE on bulk status: product_attributes has NO is_active/status column
--      (see baseline §10896). The Attributes page wires useBulkActions with showOrgAction
--      and delete; the status action is a no-op in the UI (onStatusClick={() => {}}).
--      We therefore expose only bulk delete + bulk org reassignment RPCs, matching the
--      only bulk paths reachable from ProductAttributes.tsx. A bulk-status RPC is omitted
--      deliberately because there is no status column to change.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS does NOT self-enforce inside them. Each RPC
-- therefore re-checks, explicitly, the SAME predicate the RLS policies enforce today
-- (20260707000000_attributes_security_fixes.sql, 20260706000000_categories_security_fixes.sql,
--  and baseline for product_attribute_organizations):
--   product_attributes            : is_system_admin_user(uid)
--                                    OR ( has_anew_permission(uid,'products.manage')
--                                         AND organization_id IN get_user_visible_org_ids(uid) )
--                                    INSERT/UPDATE also require organization_id IS NOT NULL
--                                    and the post-image org (UPDATE) to be visible.
--   attribute_option_groups       : same as product_attributes (org column, products.manage).
--   attribute_option_group_values : products.manage AND parent group org IS NOT NULL
--                                    AND parent group org IN visible orgs (EXISTS join).
--   category_attribute_palettes   : products.manage AND parent category org IN visible orgs.
--   product_attribute_organizations : organization_id IN get_user_visible_org_ids(uid)
--                                    (baseline auth_* policies; no permission-code gate).
-- We mirror each of these predicates in-function so a caller cannot escape RLS via the RPC.
--
-- Sentinel org
-- ------------
-- '00000000-0000-0000-0000-000000000001' — same constant used by the attribute/category
-- audit trigger functions. product_attributes.organization_id and
-- attribute_option_groups.organization_id are nullable (global attrs/groups); the manual
-- audit row is routed under the sentinel exactly like the trigger would, so it lands in the
-- SAME place. The FE create/update always sets organization_id = active company (non-NULL),
-- so the sentinel path is defensive only for these RPCs. Never insert this UUID into
-- anew_organizations.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql                 — entity_audit_log + fn_generic_entity_audit()
--   20260703030000_products_audit_triggers_pavp.sql     — fn_audit_product_attribute_value_prices()
--   20260706040000_categories_audit_coverage.sql        — fn_audit_product_attribute_value_prices_sentinel(),
--                                                          fn_audit_product_attribute_price_ranges(),
--                                                          fn_audit_category_attribute_palettes()
--   20260707000000_attributes_security_fixes.sql        — RLS mirrored here (product_attributes,
--                                                          attribute_option_groups, values)
--   20260707010000_attributes_audit_triggers.sql        — fn_audit_product_attributes_with_sentinel(),
--                                                          fn_audit_attribute_option_groups_with_sentinel(),
--                                                          fn_audit_attribute_option_group_values()
--   20260706000000_categories_security_fixes.sql        — category_attribute_palettes RLS mirrored here
--   20260719010000_roles_audit_bypass_and_rpcs.sql      — fn_manual_audit_log() (FOUNDATION, reused)
--   20260615130000_baseline_new_database.sql            — has_anew_permission(),
--                                                          current_business_user_id(),
--                                                          get_user_visible_org_ids(),
--                                                          is_system_admin_user(),
--                                                          product_attribute_organizations auth_* RLS


-- ============================================================
-- 1a. fn_audit_product_attributes_with_sentinel() — add audit-bypass guard
-- ============================================================
-- Body identical to 20260707010000_attributes_audit_triggers.sql §1 except for the new
-- guard as the first statement. The guard must run BEFORE any other logic.

CREATE OR REPLACE FUNCTION public.fn_audit_product_attributes_with_sentinel()
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
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Resolve actor
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_source := nullif(current_setting('app.audit_source', true), '');

  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL THEN
      v_source := 'system';
    END IF;
  END IF;

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

REVOKE ALL ON FUNCTION public.fn_audit_product_attributes_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_attributes_with_sentinel() TO service_role;


-- ============================================================
-- 1b. fn_audit_attribute_option_groups_with_sentinel() — add guard
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_attribute_option_groups_with_sentinel()
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
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_source := nullif(current_setting('app.audit_source', true), '');

  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL THEN
      v_source := 'system';
    END IF;
  END IF;

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

REVOKE ALL ON FUNCTION public.fn_audit_attribute_option_groups_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_attribute_option_groups_with_sentinel() TO service_role;


-- ============================================================
-- 1c. fn_audit_attribute_option_group_values() — add guard
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_attribute_option_group_values()
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
  v_group_id       uuid;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_source := nullif(current_setting('app.audit_source', true), '');

  v_group_id := COALESCE(
    (to_jsonb(NEW) ->> 'group_id')::uuid,
    (to_jsonb(OLD) ->> 'group_id')::uuid
  );

  IF v_group_id IS NOT NULL THEN
    SELECT aog.organization_id, aog.id
    INTO   v_org_id, v_entity_id
    FROM   public.attribute_option_groups aog
    WHERE  aog.id = v_group_id
    LIMIT  1;
  END IF;

  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

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

REVOKE ALL ON FUNCTION public.fn_audit_attribute_option_group_values() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_attribute_option_group_values() TO service_role;


-- ============================================================
-- 1d. fn_audit_product_attribute_value_prices_sentinel() — add guard
-- ============================================================
-- This is the CURRENTLY REGISTERED function for product_attribute_value_prices
-- (20260706040000_categories_audit_coverage.sql superseded the non-sentinel one).

CREATE OR REPLACE FUNCTION public.fn_audit_product_attribute_value_prices_sentinel()
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
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF v_user_id IS NULL THEN
    v_user_id := public.current_business_user_id();
  END IF;

  v_source := nullif(current_setting('app.audit_source', true), '');

  IF v_user_id IS NULL AND v_source IS NULL THEN
    v_source := 'system';
  END IF;

  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL OR v_source != 'system' THEN
      v_source := 'system';
    END IF;
  END IF;

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
       v_user_id,
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

REVOKE ALL ON FUNCTION public.fn_audit_product_attribute_value_prices_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_attribute_value_prices_sentinel() TO service_role;


-- ============================================================
-- 1e. fn_audit_product_attribute_price_ranges() — add guard
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_product_attribute_price_ranges()
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
  v_category_id    uuid;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF v_user_id IS NULL THEN
    v_user_id := public.current_business_user_id();
  END IF;

  v_source := nullif(current_setting('app.audit_source', true), '');

  IF v_user_id IS NULL AND v_source IS NULL THEN
    v_source := 'system';
  END IF;

  v_category_id := COALESCE(
    (to_jsonb(NEW) ->> 'category_id')::uuid,
    (to_jsonb(OLD) ->> 'category_id')::uuid
  );

  IF v_category_id IS NOT NULL THEN
    SELECT pc.organization_id, pc.id
    INTO   v_org_id, v_entity_id
    FROM   public.product_categories pc
    WHERE  pc.id = v_category_id
    LIMIT  1;
  END IF;

  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    v_source := 'system';
  END IF;

  IF v_entity_id IS NULL THEN
    v_entity_id := COALESCE(
      (to_jsonb(NEW) ->> 'id')::uuid,
      (to_jsonb(OLD) ->> 'id')::uuid
    );
  END IF;

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
       v_user_id,
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

REVOKE ALL ON FUNCTION public.fn_audit_product_attribute_price_ranges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_attribute_price_ranges() TO service_role;


-- ============================================================
-- 1f. fn_audit_category_attribute_palettes() — add guard
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_category_attribute_palettes()
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
  v_category_id    uuid;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF v_user_id IS NULL THEN
    v_user_id := public.current_business_user_id();
  END IF;

  v_source := nullif(current_setting('app.audit_source', true), '');

  IF v_user_id IS NULL AND v_source IS NULL THEN
    v_source := 'system';
  END IF;

  v_category_id := COALESCE(
    (to_jsonb(NEW) ->> 'category_id')::uuid,
    (to_jsonb(OLD) ->> 'category_id')::uuid
  );

  IF v_category_id IS NOT NULL THEN
    SELECT pc.organization_id, pc.id
    INTO   v_org_id, v_entity_id
    FROM   public.product_categories pc
    WHERE  pc.id = v_category_id
    LIMIT  1;
  END IF;

  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    v_source := 'system';
  END IF;

  IF v_entity_id IS NULL THEN
    v_entity_id := COALESCE(
      (to_jsonb(NEW) ->> 'id')::uuid,
      (to_jsonb(OLD) ->> 'id')::uuid
    );
  END IF;

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
       v_user_id,
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

REVOKE ALL ON FUNCTION public.fn_audit_category_attribute_palettes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_category_attribute_palettes() TO service_role;


-- ============================================================
-- 2a. rpc_create_product_attribute(...)
-- ============================================================
-- Mirrors the else-branch of handleSubmit() in src/pages/ProductAttributes.tsx (create):
--   attributeData = {
--     label, value_type, is_filterable, is_required, is_variant_option, sort_order,
--     organization_id = first selected company (finalCompanyId),
--     pricing_type,
--     price_per_unit = (pricing_type in ('per_unit','both')) ? price_per_unit : 0,
--     pricing_unit   = (pricing_type in ('per_unit','both')) ? pricing_unit : NULL,
--     has_hex_color  = (value_type='list') ? has_hex_color : false,
--     is_measurement = (value_type='number') ? is_measurement : false,
--     measurement_type = (value_type='number' AND is_measurement) ? measurement_type : NULL,
--     valorization_type = (value_type in ('list','number')) ? pricing_type : 'none',
--     pricing_dimension = has_hex_color ? 'color'
--                         : (is_measurement AND pricing_type='base_price') ? 'size'
--                         : (pricing_dimension or NULL),
--     [unit only when non-empty],
--     code, created_by = business user id
--   }
-- The conditional field derivations are performed here so the RPC accepts the raw
-- form values (the same values the FE passes) and produces byte-identical column values.
-- Returns the created product_attributes row.
--
-- Authorization mirrors product_attributes_insert RLS.

CREATE OR REPLACE FUNCTION public.rpc_create_product_attribute(
  p_organization_id  uuid,
  p_code             text,
  p_label            text,
  p_value_type       text,
  p_unit             text,
  p_is_filterable    boolean,
  p_is_required      boolean,
  p_is_variant_option boolean,
  p_sort_order       integer,
  p_pricing_type     text,
  p_price_per_unit   numeric,
  p_pricing_unit     text,
  p_has_hex_color    boolean,
  p_is_measurement   boolean,
  p_measurement_type text,
  p_pricing_dimension text
)
RETURNS public.product_attributes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_is_admin     boolean;
  v_row          public.product_attributes;
  -- Derived column values (mirror the FE conditional expressions)
  v_has_hex      boolean;
  v_is_meas      boolean;
  v_meas_type    text;
  v_valoriz      text;
  v_price_unit   numeric;
  v_pricing_unit text;
  v_pricing_dim  text;
  v_unit         text;
  v_audit_org    uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with product_attributes_insert RLS ───────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para gerir atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Derive conditional column values exactly as the FE does ───────────────
  v_has_hex     := CASE WHEN p_value_type = 'list' THEN COALESCE(p_has_hex_color, false) ELSE false END;
  v_is_meas     := CASE WHEN p_value_type = 'number' THEN COALESCE(p_is_measurement, false) ELSE false END;
  v_meas_type   := CASE WHEN p_value_type = 'number' AND COALESCE(p_is_measurement, false)
                        THEN p_measurement_type ELSE NULL END;
  v_valoriz     := CASE WHEN p_value_type IN ('list', 'number')
                        THEN COALESCE(p_pricing_type, 'none') ELSE 'none' END;
  v_price_unit  := CASE WHEN p_pricing_type IN ('per_unit', 'both')
                        THEN COALESCE(p_price_per_unit, 0) ELSE 0 END;
  v_pricing_unit := CASE WHEN p_pricing_type IN ('per_unit', 'both')
                        THEN p_pricing_unit ELSE NULL END;
  v_pricing_dim := CASE
                     WHEN v_has_hex THEN 'color'
                     WHEN v_is_meas AND p_pricing_type = 'base_price' THEN 'size'
                     ELSE nullif(p_pricing_dimension, '')
                   END;
  v_unit        := nullif(p_unit, '');  -- FE only sets unit when non-empty

  -- ── INSERT (identical column set to attributeData) ────────────────────────
  INSERT INTO public.product_attributes (
    code, label, value_type, unit, is_filterable, is_required, is_variant_option,
    sort_order, organization_id, pricing_type, price_per_unit, pricing_unit,
    has_hex_color, is_measurement, measurement_type, valorization_type,
    pricing_dimension, created_by
  )
  VALUES (
    p_code, p_label, p_value_type, v_unit, COALESCE(p_is_filterable, false),
    COALESCE(p_is_required, false), COALESCE(p_is_variant_option, false),
    COALESCE(p_sort_order, 0), p_organization_id, COALESCE(p_pricing_type, 'none'),
    v_price_unit, v_pricing_unit, v_has_hex, v_is_meas, v_meas_type, v_valoriz,
    v_pricing_dim, v_actor
  )
  RETURNING * INTO v_row;

  v_audit_org := COALESCE(v_row.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_attributes',
    v_row.id,
    v_audit_org,
    'INSERT',
    jsonb_build_object('product_attributes', to_jsonb(v_row)),
    'web_app'
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_product_attribute(uuid, text, text, text, text, boolean, boolean, boolean, integer, text, numeric, text, boolean, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_product_attribute(uuid, text, text, text, text, boolean, boolean, boolean, integer, text, numeric, text, boolean, boolean, text, text) TO authenticated;


-- ============================================================
-- 2b. rpc_update_product_attribute(...)
-- ============================================================
-- Mirrors the if-branch of handleSubmit() (edit):
--   UPDATE product_attributes SET <attributeData without code/created_by>
--   WHERE id = editingAttribute.id AND organization_id = activeCompany.id.
-- The FE scopes the UPDATE by the ACTIVE company id (activeCompany.id), separate from
-- the new organization_id in the payload. We take both as parameters and enforce the
-- same predicate: the pre-image row must have organization_id = p_active_org_id.
-- Returns the updated product_attributes row.
--
-- Authorization mirrors product_attributes_update RLS (USING on pre-image + WITH CHECK
-- on post-image org).

CREATE OR REPLACE FUNCTION public.rpc_update_product_attribute(
  p_id                uuid,
  p_active_org_id     uuid,
  p_organization_id   uuid,
  p_label             text,
  p_value_type        text,
  p_unit              text,
  p_is_filterable     boolean,
  p_is_required       boolean,
  p_is_variant_option boolean,
  p_sort_order        integer,
  p_pricing_type      text,
  p_price_per_unit    numeric,
  p_pricing_unit      text,
  p_has_hex_color     boolean,
  p_is_measurement    boolean,
  p_measurement_type  text,
  p_pricing_dimension text
)
RETURNS public.product_attributes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_is_admin     boolean;
  v_before       public.product_attributes;
  v_row          public.product_attributes;
  v_has_hex      boolean;
  v_is_meas      boolean;
  v_meas_type    text;
  v_valoriz      text;
  v_price_unit   numeric;
  v_pricing_unit text;
  v_pricing_dim  text;
  v_unit         text;
  v_diff         jsonb;
  v_attr_diff    jsonb;
  v_audit_org    uuid;
  v_old_json     jsonb;
  v_new_json     jsonb;
  v_key          text;
  v_noise_cols   text[] := ARRAY['updated_at', 'created_at'];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load pre-image scoped by the active company (mirrors FE .eq filters) ──
  SELECT * INTO v_before
  FROM public.product_attributes
  WHERE id = p_id
    AND organization_id = p_active_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atributo não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with product_attributes_update RLS ───────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para gerir atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-image org visible.
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Atributo fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-image org visible (prevents cross-org reassignment).
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Derive conditional column values exactly as the FE does ───────────────
  v_has_hex     := CASE WHEN p_value_type = 'list' THEN COALESCE(p_has_hex_color, false) ELSE false END;
  v_is_meas     := CASE WHEN p_value_type = 'number' THEN COALESCE(p_is_measurement, false) ELSE false END;
  v_meas_type   := CASE WHEN p_value_type = 'number' AND COALESCE(p_is_measurement, false)
                        THEN p_measurement_type ELSE NULL END;
  v_valoriz     := CASE WHEN p_value_type IN ('list', 'number')
                        THEN COALESCE(p_pricing_type, 'none') ELSE 'none' END;
  v_price_unit  := CASE WHEN p_pricing_type IN ('per_unit', 'both')
                        THEN COALESCE(p_price_per_unit, 0) ELSE 0 END;
  v_pricing_unit := CASE WHEN p_pricing_type IN ('per_unit', 'both')
                        THEN p_pricing_unit ELSE NULL END;
  v_pricing_dim := CASE
                     WHEN v_has_hex THEN 'color'
                     WHEN v_is_meas AND p_pricing_type = 'base_price' THEN 'size'
                     ELSE nullif(p_pricing_dimension, '')
                   END;
  v_unit        := nullif(p_unit, '');

  -- ── UPDATE (attributeData minus code/created_by; unit ONLY when non-empty) ─
  -- The FE only adds `unit` to attributeData when formData.unit is truthy; when empty
  -- it does not touch the column. We mirror that: leave unit unchanged if p_unit empty.
  UPDATE public.product_attributes
  SET label            = p_label,
      value_type        = p_value_type,
      is_filterable     = COALESCE(p_is_filterable, false),
      is_required       = COALESCE(p_is_required, false),
      is_variant_option = COALESCE(p_is_variant_option, false),
      sort_order        = COALESCE(p_sort_order, 0),
      organization_id   = p_organization_id,
      pricing_type      = COALESCE(p_pricing_type, 'none'),
      price_per_unit    = v_price_unit,
      pricing_unit      = v_pricing_unit,
      has_hex_color     = v_has_hex,
      is_measurement    = v_is_meas,
      measurement_type  = v_meas_type,
      valorization_type = v_valoriz,
      pricing_dimension = v_pricing_dim,
      unit              = CASE WHEN v_unit IS NOT NULL THEN v_unit ELSE unit END
  WHERE id = p_id
    AND organization_id = p_active_org_id
  RETURNING * INTO v_row;

  -- ── Build diff (skip noise columns) ───────────────────────────────────────
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_row);
  v_attr_diff := '{}'::jsonb;
  FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
  LOOP
    CONTINUE WHEN v_key = ANY(v_noise_cols);
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_attr_diff := v_attr_diff || jsonb_build_object(
        v_key,
        jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  v_diff := '{}'::jsonb;
  IF v_attr_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('product_attributes', v_attr_diff);
  END IF;

  v_audit_org := COALESCE(v_row.organization_id, k_system_sentinel);

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'product_attributes', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_product_attribute(uuid, uuid, uuid, text, text, text, boolean, boolean, boolean, integer, text, numeric, text, boolean, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_product_attribute(uuid, uuid, uuid, text, text, text, boolean, boolean, boolean, integer, text, numeric, text, boolean, boolean, text, text) TO authenticated;


-- ============================================================
-- 2c. rpc_delete_product_attribute(...)
-- ============================================================
-- Mirrors handleDelete() in src/pages/ProductAttributes.tsx:
--   DELETE FROM product_attributes WHERE id AND organization_id = activeCompany.id.
-- Returns void.
--
-- Authorization mirrors product_attributes_delete RLS.

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
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Atributo fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  DELETE FROM public.product_attributes
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_attributes',
    p_id,
    v_audit_org,
    'DELETE',
    jsonb_build_object('product_attributes', to_jsonb(v_before)),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_product_attribute(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_product_attribute(uuid, uuid) TO authenticated;


-- ============================================================
-- 2d. rpc_bulk_delete_product_attribute(...)
-- ============================================================
-- Mirrors handleBulkDelete() in useBulkActions.ts as wired by ProductAttributes.tsx
-- (softDelete:false, organizationId = active company):
--   DELETE FROM product_attributes WHERE id IN (selected) AND organization_id = active org.
-- Emits ONE consolidated DELETE audit row per affected attribute.
-- Returns the number of attributes deleted.

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

  FOR v_rec IN
    DELETE FROM public.product_attributes pa
    WHERE pa.id = ANY (v_ids)
      AND pa.organization_id = p_organization_id
    RETURNING pa.*
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_attributes',
      v_rec.id,
      v_audit_org,
      'DELETE',
      jsonb_build_object('product_attributes', to_jsonb(v_rec)),
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
-- 2e. rpc_bulk_org_product_attribute(...)
-- ============================================================
-- Mirrors handleBulkCompanyChange('organization_id') in useBulkActions.ts as wired by
-- ProductAttributes.tsx (organizationId = active company scope):
--   UPDATE product_attributes SET organization_id = <new org>
--   WHERE id IN (selected) AND organization_id = active org.
-- Emits ONE consolidated UPDATE audit row per affected attribute.
-- Returns the number of attributes updated.
--
-- Authorization mirrors product_attributes_update RLS: USING scope on the CURRENT org
-- (p_organization_id), WITH CHECK on the NEW org (p_new_organization_id).

CREATE OR REPLACE FUNCTION public.rpc_bulk_org_product_attribute(
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
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_ids        uuid[];
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
    RAISE EXCEPTION 'organizationId obrigatório para alteração de empresa em massa'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_new_organization_id IS NULL THEN
    RAISE EXCEPTION 'Nova empresa obrigatória' USING ERRCODE = 'check_violation';
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
      RAISE EXCEPTION 'Sem permissão para gerir atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: current org visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: target org visible.
    IF NOT (p_new_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOR v_rec IN
    UPDATE public.product_attributes pa
    SET organization_id = p_new_organization_id
    WHERE pa.id = ANY (v_ids)
      AND pa.organization_id = p_organization_id
      AND pa.organization_id IS DISTINCT FROM p_new_organization_id
    RETURNING pa.id,
              p_organization_id     AS old_org,
              p_new_organization_id AS new_org
  LOOP
    -- Route the log under the NEW org (post-image), matching where the row now lives.
    v_audit_org := COALESCE(v_rec.new_org, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_attributes',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('product_attributes', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_rec.old_org), 'new', to_jsonb(v_rec.new_org))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_org_product_attribute(uuid[], uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_org_product_attribute(uuid[], uuid, uuid) TO authenticated;


-- ============================================================
-- 2f. rpc_duplicate_product_attribute(...)
-- ============================================================
-- Mirrors handleDuplicate() in src/pages/ProductAttributes.tsx:
--   1. Find a unique code by appending _copy / _copy_2 / ... (scoped to active org).
--   2. INSERT product_attributes cloned from source (all columns except id),
--      code = unique, label = "<label> (cópia)", created_by = business user id.
--   3. Deep-clone (best-effort in the FE; atomic here):
--      · attribute_option_groups (attribute_id = new attr) + their
--        attribute_option_group_values (chunked in FE; single pass here).
--      · product_attribute_value_prices  WHERE product_id IS NULL (category-level).
--      · product_attribute_price_ranges  WHERE product_id IS NULL (category-level).
--      · product_attribute_organizations (attribute_id = new attr, created_by = actor).
--      · category_attribute_palettes.
--   All under one transaction + one consolidated INSERT audit row (on the new attribute).
-- Returns the new product_attributes row.
--
-- Authorization: cloning creates a new attribute in the same org as the source; mirror
-- product_attributes_insert (products.manage + source org visible). The source org is the
-- active company (the FE looks up by activeCompany.id); we take it as p_organization_id.
--
-- ── Accepted divergences from the frontend handleDuplicate() (design decisions) ──────────
-- Unlike every other RPC in this migration, this one is NOT byte-for-byte behaviorally
-- identical to the FE. It is faithful in WHAT it copies (all 7 tables, same columns, same
-- product_id IS NULL filters, same unique-code search, same "(cópia)" label suffix), but it
-- deliberately changes two observable behaviors. Both changes were reviewed and ACCEPTED as
-- improvements; do NOT "fix" them back to the FE behavior without re-opening this decision.
--
--   (A) Error atomicity. The FE runs the 5 clone blocks (groups+values, value_prices,
--       price_ranges, org_links, palettes) via Promise.allSettled — i.e. best-effort: if
--       one block fails (FK, check constraint, etc.), the base attribute and any already-
--       created children REMAIN, and the FE still reports success. This RPC wraps everything
--       in ONE transaction: any single failure ROLLS BACK the whole clone (including the base
--       attribute) and surfaces an error to the caller. This is a real, user-visible change:
--       a partial clone is no longer possible. ACCEPTED — an all-or-nothing duplicate is the
--       correct semantic; a half-cloned attribute with missing prices/palettes is a latent
--       data-quality bug in the current best-effort path. If strict FE parity is ever
--       required, wrap each clone block in a BEGIN ... EXCEPTION WHEN OTHERS THEN (continue)
--       sub-block so failures are swallowed per-block as they are today.
--
--   (B) created_at / updated_at provenance. The FE does `const { id, ...rest } = attr` on a
--       row read via `.select("*")`, so at runtime `rest` still carries the source row's
--       created_at/updated_at and propagates them into the clone INSERT (the TS interface
--       hides these columns, but the object has them). This RPC lists columns explicitly and
--       omits created_at/updated_at, so the clone gets FRESH column defaults (now()). This is
--       a divergence in row provenance. ACCEPTED — a freshly created clone SHOULD have fresh
--       timestamps; the FE behavior (stale timestamps copied from the source) is a latent bug.
--       If strict FE parity is ever required, add created_at/updated_at to the INSERT column
--       list and SELECT them from v_src.
--
-- ── Org invariant on the duplicate path (bug fix, NOT a divergence) ───────────────────────
-- The clone always inherits the SOURCE org: the INSERT selects v_src.organization_id into the
-- new row. p_organization_id is only the active-company id the FE passes in. A previous version
-- ran the unique-code existence check against p_organization_id while inserting into
-- v_src.organization_id; if a caller ever passed p_organization_id <> v_src.organization_id the
-- check would run against the wrong org — admitting a duplicate `code` into the real target org
-- or fabricating needless `_copy_N` suffixes. That was a latent logic bug (the RPC is not yet
-- wired to the FE), not an accepted design decision. It is now FIXED: the function asserts
-- p_organization_id = v_src.organization_id up front and scopes the uniqueness check by
-- v_src.organization_id, so check and INSERT always operate on the same org.
--
-- Neither divergence affects security, cross-org isolation, or audit-row count/placement —
-- both are confined to the duplicate path and are about error atomicity and timestamp
-- provenance only.

CREATE OR REPLACE FUNCTION public.rpc_duplicate_product_attribute(
  p_id              uuid,
  p_organization_id uuid
)
RETURNS public.product_attributes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_src        public.product_attributes;
  v_new        public.product_attributes;
  v_new_code   text;
  v_suffix     integer := 1;
  v_exists     boolean;
  v_grp        record;
  v_new_grp_id uuid;
  v_audit_org  uuid;
  v_counts     jsonb := '{}'::jsonb;
  v_grp_count  integer := 0;
  v_val_count  integer := 0;
  v_vp_count   integer := 0;
  v_pr_count   integer := 0;
  v_org_count  integer := 0;
  v_pal_count  integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load source attribute scoped by the active org (FE looks up by activeCompany) ──
  SELECT * INTO v_src
  FROM public.product_attributes
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atributo não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with product_attributes_insert RLS ───────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para gerir atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- The new attribute inherits the source org; it must be non-null and visible.
    IF v_src.organization_id IS NULL
       OR NOT (v_src.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Atributo fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── The clone always inherits the SOURCE org (the INSERT below uses
  --    v_src.organization_id). p_organization_id is the active-company id the FE
  --    passes; for the duplicate flow it MUST match the source org, otherwise the
  --    uniqueness check below would run against the wrong org and could either
  --    admit a duplicate `code` into the real target org or fabricate needless
  --    `_copy_N` suffixes. Enforce the invariant explicitly so both the check and
  --    the INSERT are guaranteed to operate on the same org. ─────────────────────
  IF p_organization_id IS DISTINCT FROM v_src.organization_id THEN
    RAISE EXCEPTION 'Organização de destino tem de coincidir com a organização do atributo de origem'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Find a unique code, scoped to the org the clone will actually live in ──
  v_new_code := v_src.code || '_copy';
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.product_attributes
      WHERE code = v_new_code
        AND organization_id = v_src.organization_id
    ) INTO v_exists;
    EXIT WHEN NOT v_exists;
    v_suffix := v_suffix + 1;
    v_new_code := v_src.code || '_copy_' || v_suffix;
  END LOOP;

  -- ── INSERT the cloned attribute (all columns except id; new code/label/created_by) ──
  INSERT INTO public.product_attributes (
    code, label, type, unit, options, is_filterable, is_required, is_variant_attribute,
    sort_order, value_type, is_variant_option, allowed_values, organization_id,
    pricing_type, price_per_unit, pricing_unit, has_hex_color, is_measurement,
    measurement_type, valorization_type, pricing_dimension, created_by
  )
  SELECT
    v_new_code, v_src.label || ' (cópia)', v_src.type, v_src.unit, v_src.options,
    v_src.is_filterable, v_src.is_required, v_src.is_variant_attribute, v_src.sort_order,
    v_src.value_type, v_src.is_variant_option, v_src.allowed_values, v_src.organization_id,
    v_src.pricing_type, v_src.price_per_unit, v_src.pricing_unit, v_src.has_hex_color,
    v_src.is_measurement, v_src.measurement_type, v_src.valorization_type,
    v_src.pricing_dimension, v_actor
  RETURNING * INTO v_new;

  -- ── 1) Option groups + their values ───────────────────────────────────────
  FOR v_grp IN
    SELECT id, organization_id, name, description, is_active, sort_order
    FROM public.attribute_option_groups
    WHERE attribute_id = v_src.id
  LOOP
    INSERT INTO public.attribute_option_groups (
      attribute_id, organization_id, name, description, is_active, sort_order, created_by
    )
    VALUES (
      v_new.id, v_grp.organization_id, v_grp.name, v_grp.description,
      v_grp.is_active, v_grp.sort_order, v_actor
    )
    RETURNING id INTO v_new_grp_id;
    v_grp_count := v_grp_count + 1;

    INSERT INTO public.attribute_option_group_values (
      group_id, value_text, display_name, hex_color, sort_order, is_active
    )
    SELECT v_new_grp_id, aogv.value_text, aogv.display_name, aogv.hex_color,
           COALESCE(aogv.sort_order, 0), COALESCE(aogv.is_active, true)
    FROM public.attribute_option_group_values aogv
    WHERE aogv.group_id = v_grp.id;
    GET DIAGNOSTICS v_val_count = ROW_COUNT;
  END LOOP;

  -- ── 2) Category-level value prices (product_id IS NULL) ────────────────────
  INSERT INTO public.product_attribute_value_prices (
    attribute_id, organization_id, category_id, value_option, price, cost_impact,
    is_available, sort_order, price_context_id
  )
  SELECT v_new.id, organization_id, category_id, value_option, price, cost_impact,
         is_available, sort_order, price_context_id
  FROM public.product_attribute_value_prices
  WHERE attribute_id = v_src.id
    AND product_id IS NULL;
  GET DIAGNOSTICS v_vp_count = ROW_COUNT;

  -- ── 3) Category-level price ranges (product_id IS NULL) ────────────────────
  INSERT INTO public.product_attribute_price_ranges (
    attribute_id, organization_id, category_id, range_type, min_value, max_value,
    min_width, max_width, min_height, max_height, min_depth, max_depth,
    price_per_unit, cost_impact, price_context_id
  )
  SELECT v_new.id, organization_id, category_id, range_type, min_value, max_value,
         min_width, max_width, min_height, max_height, min_depth, max_depth,
         price_per_unit, cost_impact, price_context_id
  FROM public.product_attribute_price_ranges
  WHERE attribute_id = v_src.id
    AND product_id IS NULL;
  GET DIAGNOSTICS v_pr_count = ROW_COUNT;

  -- ── 4) Organization links ─────────────────────────────────────────────────
  INSERT INTO public.product_attribute_organizations (
    attribute_id, organization_id, created_by
  )
  SELECT v_new.id, organization_id, v_actor
  FROM public.product_attribute_organizations
  WHERE attribute_id = v_src.id;
  GET DIAGNOSTICS v_org_count = ROW_COUNT;

  -- ── 5) Category attribute palette configuration ───────────────────────────
  INSERT INTO public.category_attribute_palettes (
    category_id, attribute_id, base_group_id, additional_values, excluded_values
  )
  SELECT category_id, v_new.id, base_group_id, additional_values, excluded_values
  FROM public.category_attribute_palettes
  WHERE attribute_id = v_src.id;
  GET DIAGNOSTICS v_pal_count = ROW_COUNT;

  -- ── Single consolidated INSERT audit row on the new attribute ─────────────
  v_counts := jsonb_build_object(
    'attribute_option_groups',        v_grp_count,
    'attribute_option_group_values',  v_val_count,
    'product_attribute_value_prices', v_vp_count,
    'product_attribute_price_ranges', v_pr_count,
    'product_attribute_organizations', v_org_count,
    'category_attribute_palettes',    v_pal_count
  );

  v_audit_org := COALESCE(v_new.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_attributes',
    v_new.id,
    v_audit_org,
    'INSERT',
    jsonb_build_object(
      'product_attributes', to_jsonb(v_new),
      'duplicated_from',     to_jsonb(v_src.id),
      'cloned_children',     v_counts
    ),
    'web_app'
  );

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_duplicate_product_attribute(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_duplicate_product_attribute(uuid, uuid) TO authenticated;


-- ============================================================
-- 2g. rpc_manage_attribute_option_group(...)
-- ============================================================
-- Consolidates the group + value operations from AttributeOptionPalettesDialog.tsx into
-- a single dispatch RPC (one action = one log row). p_action selects the operation:
--
--   'create_group'  — INSERT attribute_option_groups {attribute_id, organization_id,
--                     name, description|null, sort_order, created_by}.
--                     (handleCreateGroup / auto-create base group.) Returns new group id.
--   'delete_group'  — DELETE attribute_option_groups WHERE id (values cascade via FK).
--                     (executeDeleteGroup.)
--   'duplicate_group' — INSERT a new group cloned from p_group_id (new name = p_name) +
--                     copy all its values. (handleConfirmDuplicate.) Returns new group id.
--   'add_value'     — INSERT attribute_option_group_values {group_id, value_text (UPPER),
--                     display_name, hex_color|null, sort_order}. (handleAddValueToGroup.)
--   'remove_value'  — DELETE attribute_option_group_values WHERE id. (handleRemoveValueFromGroup.)
--   'import_values' — INSERT the p_values not already present (case-insensitive on
--                     value_text) into p_group_id. (handleImportGlobalValues.)
--                     p_values is a jsonb array of {value_text, display_name, sort_order}.
--
-- The audit log row is anchored on the parent attribute (entity_id = attribute_id) and
-- routed under the group/attribute org so group+value changes appear on one timeline.
-- Returns the affected group id (NULL for value-only ops where no group id is created).
--
-- Authorization: attribute_option_groups_* and attribute_option_group_values_* RLS both
-- require products.manage + the (parent) group org IS NOT NULL AND in visible orgs. We
-- resolve the org from the group (or the passed org for create) and enforce it.

CREATE OR REPLACE FUNCTION public.rpc_manage_attribute_option_group(
  p_action          text,
  p_attribute_id    uuid    DEFAULT NULL,
  p_organization_id uuid    DEFAULT NULL,
  p_group_id        uuid    DEFAULT NULL,
  p_value_id        uuid    DEFAULT NULL,
  p_name            text    DEFAULT NULL,
  p_description     text    DEFAULT NULL,
  p_sort_order      integer DEFAULT NULL,
  p_value_text      text    DEFAULT NULL,
  p_display_name    text    DEFAULT NULL,
  p_hex_color       text    DEFAULT NULL,
  p_values          jsonb   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_is_admin     boolean;
  v_org_id       uuid;
  v_attr_id      uuid;
  v_group        public.attribute_option_groups;
  v_value        public.attribute_option_group_values;
  v_new_group_id uuid;
  v_new_val_id   uuid;
  v_audit_org    uuid;
  v_diff         jsonb;
  v_op           text;
  v_val_count    integer := 0;
  v_next_sort    integer;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);

  IF p_action = 'create_group' THEN
    -- ── Resolve + authorize org (attribute_option_groups_insert) ─────────────
    v_org_id  := p_organization_id;
    v_attr_id := p_attribute_id;
    IF NOT v_is_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
        RAISE EXCEPTION 'Sem permissão para gerir grupos de opções' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_org_id IS NULL
         OR NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    INSERT INTO public.attribute_option_groups (
      attribute_id, organization_id, name, description, sort_order, created_by
    )
    VALUES (
      v_attr_id, v_org_id, p_name, nullif(p_description, ''),
      COALESCE(p_sort_order, 0), v_actor
    )
    RETURNING * INTO v_group;

    v_new_group_id := v_group.id;
    v_attr_id      := v_group.attribute_id;
    v_org_id       := v_group.organization_id;
    v_op           := 'INSERT';
    v_diff         := jsonb_build_object('attribute_option_groups', to_jsonb(v_group));

  ELSIF p_action = 'duplicate_group' THEN
    SELECT * INTO v_group FROM public.attribute_option_groups WHERE id = p_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_org_id  := v_group.organization_id;
    v_attr_id := v_group.attribute_id;
    IF NOT v_is_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
        RAISE EXCEPTION 'Sem permissão para gerir grupos de opções' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_org_id IS NULL
         OR NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Grupo fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    -- New group cloned; sort_order = count of groups on the attribute (FE uses groups.length)
    SELECT COUNT(*) INTO v_next_sort
    FROM public.attribute_option_groups
    WHERE attribute_id = v_group.attribute_id;

    INSERT INTO public.attribute_option_groups (
      attribute_id, organization_id, name, description, sort_order, created_by
    )
    VALUES (
      v_group.attribute_id, v_group.organization_id, p_name, v_group.description,
      v_next_sort, v_actor
    )
    RETURNING id INTO v_new_group_id;

    -- Copy values with re-sequenced sort_order (FE maps index i)
    INSERT INTO public.attribute_option_group_values (
      group_id, value_text, display_name, hex_color, sort_order, is_active
    )
    SELECT v_new_group_id, s.value_text, s.display_name, s.hex_color,
           (row_number() OVER (ORDER BY s.sort_order) - 1)::int, s.is_active
    FROM public.attribute_option_group_values s
    WHERE s.group_id = p_group_id;
    GET DIAGNOSTICS v_val_count = ROW_COUNT;

    v_attr_id := v_group.attribute_id;
    v_op      := 'INSERT';
    v_diff    := jsonb_build_object(
      'attribute_option_groups', jsonb_build_object('id', to_jsonb(v_new_group_id), 'name', to_jsonb(p_name)),
      'duplicated_from', to_jsonb(p_group_id),
      'cloned_values',   v_val_count
    );

  ELSIF p_action = 'delete_group' THEN
    SELECT * INTO v_group FROM public.attribute_option_groups WHERE id = p_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_org_id  := v_group.organization_id;
    v_attr_id := v_group.attribute_id;
    IF NOT v_is_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
        RAISE EXCEPTION 'Sem permissão para gerir grupos de opções' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_org_id IS NULL
         OR NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Grupo fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    -- Values cascade via FK; delete explicitly so the diff is complete and no orphan remains.
    DELETE FROM public.attribute_option_group_values WHERE group_id = p_group_id;
    DELETE FROM public.attribute_option_groups WHERE id = p_group_id;

    v_new_group_id := p_group_id;
    v_op   := 'DELETE';
    v_diff := jsonb_build_object('attribute_option_groups', to_jsonb(v_group));

  ELSIF p_action = 'add_value' THEN
    SELECT * INTO v_group FROM public.attribute_option_groups WHERE id = p_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_org_id  := v_group.organization_id;
    v_attr_id := v_group.attribute_id;
    IF NOT v_is_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
        RAISE EXCEPTION 'Sem permissão para gerir opções' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_org_id IS NULL
         OR NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Grupo fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    INSERT INTO public.attribute_option_group_values (
      group_id, value_text, display_name, hex_color, sort_order
    )
    VALUES (
      p_group_id, upper(btrim(p_value_text)), btrim(p_value_text),
      nullif(p_hex_color, ''), COALESCE(p_sort_order, 0)
    )
    RETURNING * INTO v_value;

    v_new_val_id   := v_value.id;
    v_new_group_id := p_group_id;
    v_op   := 'INSERT';
    v_diff := jsonb_build_object('attribute_option_group_values', to_jsonb(v_value));

  ELSIF p_action = 'remove_value' THEN
    SELECT * INTO v_value FROM public.attribute_option_group_values WHERE id = p_value_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opção não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    SELECT * INTO v_group FROM public.attribute_option_groups WHERE id = v_value.group_id;
    v_org_id  := v_group.organization_id;
    v_attr_id := v_group.attribute_id;
    IF NOT v_is_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
        RAISE EXCEPTION 'Sem permissão para gerir opções' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_org_id IS NULL
         OR NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Opção fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    DELETE FROM public.attribute_option_group_values WHERE id = p_value_id;

    v_new_group_id := v_value.group_id;
    v_op   := 'DELETE';
    v_diff := jsonb_build_object('attribute_option_group_values', to_jsonb(v_value));

  ELSIF p_action = 'import_values' THEN
    SELECT * INTO v_group FROM public.attribute_option_groups WHERE id = p_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_org_id  := v_group.organization_id;
    v_attr_id := v_group.attribute_id;
    IF NOT v_is_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
        RAISE EXCEPTION 'Sem permissão para gerir opções' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_org_id IS NULL
         OR NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Grupo fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    -- Insert only values whose UPPER(value_text) is not already present (mirrors FE filter).
    INSERT INTO public.attribute_option_group_values (
      group_id, value_text, display_name, sort_order
    )
    SELECT p_group_id,
           upper(v.value_text),
           v.display_name,
           v.sort_order
    FROM jsonb_to_recordset(COALESCE(p_values, '[]'::jsonb))
         AS v(value_text text, display_name text, sort_order integer)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.attribute_option_group_values existing
      WHERE existing.group_id = p_group_id
        AND upper(existing.value_text) = upper(v.value_text)
    );
    GET DIAGNOSTICS v_val_count = ROW_COUNT;

    v_new_group_id := p_group_id;
    v_op   := 'UPDATE';
    v_diff := jsonb_build_object(
      'attribute_option_group_values',
      jsonb_build_object('imported_count', jsonb_build_object('old', 0, 'new', v_val_count))
    );

  ELSE
    RAISE EXCEPTION 'Ação inválida: %', p_action USING ERRCODE = 'check_violation';
  END IF;

  v_audit_org := COALESCE(v_org_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_attributes',
    v_attr_id,
    v_audit_org,
    v_op,
    v_diff,
    'web_app'
  );

  RETURN v_new_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_manage_attribute_option_group(text, uuid, uuid, uuid, uuid, text, text, integer, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_manage_attribute_option_group(text, uuid, uuid, uuid, uuid, text, text, integer, text, text, text, jsonb) TO authenticated;


-- ============================================================
-- 2h. rpc_manage_category_attribute_palette(...)
-- ============================================================
-- Mirrors handleAssignPaletteToCategory() in AttributeOptionPalettesDialog.tsx:
--   · groupId provided + existing palette → UPDATE category_attribute_palettes
--       SET base_group_id = groupId WHERE id = existing.id.
--   · groupId provided + no existing      → INSERT {category_id, attribute_id, base_group_id}.
--   · groupId NULL + existing             → DELETE category_attribute_palettes WHERE id.
--   · groupId NULL + no existing          → no-op.
-- One action = one log row. entity_id = attribute_id, org resolved via the parent category
-- (category_attribute_palettes has no org column; the trigger resolves org via
-- category_id → product_categories, and RLS scopes by that org).
-- Returns the affected palette row id (NULL on no-op / delete).
--
-- Authorization mirrors category_attribute_palettes_(insert|update|delete) RLS:
-- products.manage + parent category org IN visible orgs.

CREATE OR REPLACE FUNCTION public.rpc_manage_category_attribute_palette(
  p_category_id  uuid,
  p_attribute_id uuid,
  p_base_group_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_cat_org    uuid;
  v_cat_own_org uuid;
  v_cat_parent uuid;
  v_cat_id     uuid;
  v_existing   public.category_attribute_palettes;
  v_row        public.category_attribute_palettes;
  v_audit_org  uuid;
  v_op         text;
  v_diff       jsonb;
  v_ret        uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Resolve parent category org (audit + RLS scope) ───────────────────────
  -- Mirrors the dual-arm org resolution in category_attribute_palettes_* RLS:
  --   arm (a): pc.organization_id (direct org), else
  --   arm (b): subcategory with NULL org → org resolved from the parent chain
  --            via get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id)).
  SELECT pc.organization_id, pc.id, COALESCE(pc.parent_id, pc.parent_category_id)
    INTO v_cat_own_org, v_cat_id, v_cat_parent
  FROM public.product_categories pc
  WHERE pc.id = p_category_id
  LIMIT 1;
  IF v_cat_id IS NULL THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Effective org: direct org when present, otherwise inherit from parent chain
  -- exactly like the RLS arm (b). Only fall back when a parent exists, matching
  -- the policy's 'COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL' guard.
  IF v_cat_own_org IS NOT NULL THEN
    v_cat_org := v_cat_own_org;
  ELSIF v_cat_parent IS NOT NULL THEN
    v_cat_org := public.get_product_category_org_id(v_cat_parent);
  ELSE
    v_cat_org := NULL;
  END IF;

  -- ── Authorization parity with category_attribute_palettes_* RLS ───────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para gerir paletas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_cat_org IS NULL
       OR NOT (v_cat_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Categoria fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Existing palette for this (category, attribute) ───────────────────────
  SELECT * INTO v_existing
  FROM public.category_attribute_palettes
  WHERE category_id = p_category_id
    AND attribute_id = p_attribute_id
  LIMIT 1;

  IF p_base_group_id IS NOT NULL THEN
    IF FOUND THEN
      UPDATE public.category_attribute_palettes
      SET base_group_id = p_base_group_id
      WHERE id = v_existing.id
      RETURNING * INTO v_row;
      v_op   := 'UPDATE';
      v_diff := jsonb_build_object('category_attribute_palettes', jsonb_build_object(
        'base_group_id', jsonb_build_object('old', to_jsonb(v_existing.base_group_id), 'new', to_jsonb(p_base_group_id))
      ));
      v_ret := v_row.id;
    ELSE
      INSERT INTO public.category_attribute_palettes (category_id, attribute_id, base_group_id)
      VALUES (p_category_id, p_attribute_id, p_base_group_id)
      RETURNING * INTO v_row;
      v_op   := 'INSERT';
      v_diff := jsonb_build_object('category_attribute_palettes', to_jsonb(v_row));
      v_ret := v_row.id;
    END IF;
  ELSE
    IF FOUND THEN
      DELETE FROM public.category_attribute_palettes WHERE id = v_existing.id;
      v_op   := 'DELETE';
      v_diff := jsonb_build_object('category_attribute_palettes', to_jsonb(v_existing));
      v_ret := NULL;
    ELSE
      -- No-op: no palette to remove, matching the FE else-branch.
      RETURN NULL;
    END IF;
  END IF;

  v_audit_org := COALESCE(v_cat_org, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_attributes',
    p_attribute_id,
    v_audit_org,
    v_op,
    v_diff,
    'web_app'
  );

  RETURN v_ret;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_manage_category_attribute_palette(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_manage_category_attribute_palette(uuid, uuid, uuid) TO authenticated;


-- ============================================================
-- 2i. rpc_manage_attribute_organizations(...)
-- ============================================================
-- Manages the product_attribute_organizations junction for an attribute in a single
-- atomic call (upsert-then-prune to the target org set), producing exactly ONE audit row.
-- product_attribute_organizations has NO audit trigger today, so the raw multi-insert path
-- produces zero audit rows; this RPC gives the operation a single, explicit consolidated
-- log entry anchored on the parent attribute.
--
-- Authorization mirrors product_attribute_organizations auth_* RLS (baseline):
--   organization_id IN get_user_visible_org_ids(uid) for every associated org.
-- We additionally require products.manage parity with the rest of the attributes module
-- since the operation is a write on attribute-scoped data (defense in depth; the baseline
-- policy itself has no permission gate, so admins/permission-holders both pass).
--
-- Returns the resulting count of organization links.

CREATE OR REPLACE FUNCTION public.rpc_manage_attribute_organizations(
  p_attribute_id uuid,
  p_org_ids      uuid[]
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
  v_attr       public.product_attributes;
  v_target     uuid[];
  v_old_orgs   uuid[];
  v_org        uuid;
  v_audit_org  uuid;
  v_count      integer := 0;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_attr FROM public.product_attributes WHERE id = p_attribute_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atributo não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Dedup target orgs (order-insensitive) ─────────────────────────────────
  IF p_org_ids IS NULL THEN
    v_target := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT o), ARRAY[]::uuid[])
    INTO   v_target
    FROM   unnest(p_org_ids) AS u(o)
    WHERE  o IS NOT NULL;
  END IF;

  -- ── Authorization: every target org must be visible (+ products.manage) ───
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para gerir atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    FOREACH v_org IN ARRAY v_target LOOP
      IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
    -- Pruned (removed) orgs must also be visible to the actor (DELETE RLS parity).
    FOR v_org IN
      SELECT organization_id FROM public.product_attribute_organizations
      WHERE attribute_id = p_attribute_id
    LOOP
      IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Associação fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── Snapshot old links ────────────────────────────────────────────────────
  SELECT COALESCE(array_agg(organization_id ORDER BY organization_id), ARRAY[]::uuid[])
  INTO   v_old_orgs
  FROM   public.product_attribute_organizations
  WHERE  attribute_id = p_attribute_id;

  -- ── Upsert-then-prune to target set ───────────────────────────────────────
  -- product_attribute_organizations has only a PK on id (no unique on
  -- (attribute_id, organization_id)), so ON CONFLICT is unavailable. Insert only
  -- orgs not already linked (NOT EXISTS guard) to stay idempotent.
  IF array_length(v_target, 1) IS NOT NULL AND array_length(v_target, 1) > 0 THEN
    FOREACH v_org IN ARRAY v_target LOOP
      INSERT INTO public.product_attribute_organizations (attribute_id, organization_id, created_by)
      SELECT p_attribute_id, v_org, v_actor
      WHERE NOT EXISTS (
        SELECT 1 FROM public.product_attribute_organizations
        WHERE attribute_id = p_attribute_id AND organization_id = v_org
      );
    END LOOP;

    DELETE FROM public.product_attribute_organizations
    WHERE attribute_id = p_attribute_id
      AND NOT (organization_id = ANY (v_target));
  ELSE
    DELETE FROM public.product_attribute_organizations WHERE attribute_id = p_attribute_id;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.product_attribute_organizations
  WHERE attribute_id = p_attribute_id;

  -- ── Emit a single log row only when the set actually changed ──────────────
  IF EXISTS (SELECT unnest(v_old_orgs) EXCEPT SELECT unnest(v_target))
     OR EXISTS (SELECT unnest(v_target) EXCEPT SELECT unnest(v_old_orgs)) THEN
    v_audit_org := COALESCE(v_attr.organization_id, k_system_sentinel);
    v_diff := jsonb_build_object(
      'product_attribute_organizations', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_old_orgs), 'new', to_jsonb(v_target))
      )
    );
    PERFORM public.fn_manual_audit_log(
      'product_attributes', p_attribute_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_manage_attribute_organizations(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_manage_attribute_organizations(uuid, uuid[]) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm the six trigger functions now short-circuit on the bypass GUC:
--
--   SELECT proname
--   FROM pg_proc
--   WHERE proname IN (
--     'fn_audit_product_attributes_with_sentinel',
--     'fn_audit_attribute_option_groups_with_sentinel',
--     'fn_audit_attribute_option_group_values',
--     'fn_audit_product_attribute_value_prices_sentinel',
--     'fn_audit_product_attribute_price_ranges',
--     'fn_audit_category_attribute_palettes'
--   )
--     AND prosrc LIKE '%app.audit_bypass%';
--   -- Expected: 6 rows.
--
-- 2. Smoke test (transaction, rollback): create attribute via RPC → exactly ONE
--    entity_audit_log row for product_attributes, none for the child tables.
--
--   BEGIN;
--   SELECT public.rpc_create_product_attribute(
--     '<org-uuid>', 'TEST_CODE', 'Test', 'list', NULL,
--     false, false, false, 0, 'fixed', 0, NULL, true, false, NULL, NULL);
--   SELECT table_name, operation, count(*)
--   FROM public.entity_audit_log
--   WHERE created_at > now() - interval '1 minute'
--   GROUP BY table_name, operation;
--   -- Expected: one row, table_name='product_attributes', operation='INSERT'.
--   ROLLBACK;
--
-- 3. Duplicate test: rpc_duplicate_product_attribute produces exactly ONE audit row
--    (product_attributes INSERT) even when the source has groups/values/prices/palettes.
