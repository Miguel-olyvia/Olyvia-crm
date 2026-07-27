-- Produtos (core) — single-log RPCs on the shared audit-bypass foundation
-- 2026-08-11 | Module: Produtos (core) — products + product_organizations
--                                        + product_prices + product_attribute_values
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Today one user action on the Products module (create/edit a product) is issued from the
-- frontend as SEVERAL independent Supabase calls, each its own Postgres transaction
-- (src/pages/Products.tsx handleSubmit, lines ~611-825). The survey identified 6 separate
-- calls for a typical action, including TWO separate UPDATEs on the products table alone:
--   · products main fields         (lines 656-690)
--   · product_organizations         delete + insert (lines 666-721)
--   · product_prices                per-type maybeSingle + update/insert (lines 731-756)
--   · product_attribute_values      delete removed + per-attr maybeSingle + update/insert
--                                    (lines 758-806)
--   · products.supplier_id          a SECOND, separate UPDATE on products (lines 809-812)
-- Every audited table has an AFTER trigger that writes to entity_audit_log
-- (fn_generic_entity_audit on products + product_organizations, fn_audit_product_prices on
--  product_prices, fn_audit_product_attribute_values on product_attribute_values), so a
-- single "save product" produces N audit rows (one per table/statement touched) when the
-- business intent is exactly ONE audit entry. The two products UPDATEs alone would emit two
-- products rows; here they are folded into the SAME RPC/transaction and one log row.
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
--   · fn_generic_entity_audit() was already guarded in 20260719010000 (it fires on
--     products and product_organizations), so those two tables already honour the bypass.
-- We REUSE the foundation here; we do NOT recreate it. This module creates NO foundation.
--
-- This migration:
--   1. Adds the audit-bypass guard to the TWO audit trigger functions that fire on the
--      remaining tables these RPCs write to — they did NOT have it yet:
--        · fn_audit_product_prices()             (product_prices)
--        · fn_audit_product_attribute_values()   (product_attribute_values)
--      CREATE OR REPLACE only; bodies are otherwise byte-identical to
--      20260703010000_products_audit_triggers.sql §1-2. The triggers themselves are NOT
--      touched.
--   2. Adds two RPCs that reproduce, field-for-field, condition-for-condition, what
--      Products.tsx handleSubmit does today, each inside a single transaction with
--      app.audit_bypass = 'on', accumulate a combined diff across ALL tables touched
--      ({table: {field: {old, new}}}), and call fn_manual_audit_log ONCE:
--        · rpc_create_product — INSERT products + INSERT product_organizations
--                               + upsert product_prices + upsert product_attribute_values
--                               + the supplier_id write (folded into the single INSERT here,
--                                 since on create the FE would otherwise UPDATE it separately)
--        · rpc_update_product — UPDATE products (main fields + supplier_id in ONE statement,
--                               folding the FE's two separate products UPDATEs)
--                               + rewrite product_organizations
--                               + upsert product_prices + reconcile product_attribute_values
--
-- Faithful replication notes (behaviour preserved exactly, NOT simplified)
-- ------------------------------------------------------------------------
-- · primaryOrgId  = getPrimaryOrgId(selection) || activeCompany.id. The FE resolves this
--   client-side; the RPC receives it as p_primary_org_id and also receives the active
--   company id (p_active_org_id) used by the FE's .eq("organization_id", activeCompany.id)
--   scope on the UPDATE/DELETE.
-- · products payload columns (exactly the FE productData + conditional fields):
--     sku, name, status, is_active=true,
--     is_sellable  = product_type IN ('sale','both')      → passed as p_is_sellable
--     is_purchasable = product_type IN ('purchase','both') → passed as p_is_purchasable
--     category_id|null, subcategory_id|null, organization_id = primaryOrgId, uom_id|null,
--     description  (only when truthy in FE → '' becomes NULL here),
--     barcode      (only when truthy in FE → '' becomes NULL here),
--     brand_id     (only when truthy in FE → NULL when empty).
--   On INSERT the FE also sets created_by = business user.
--   supplier_id is written here as part of the SAME statement (the FE issues it as a
--   trailing separate UPDATE — folded in to keep one transaction and one log row).
-- · product_organizations: the FE, on edit, first DELETEs rows for (product_id,
--   activeCompany.id), then INSERTs one row per unique org id in
--   {primaryOrgId} ∪ getAllOrgIds(selection). We replicate: on update we DELETE the active
--   company's association then INSERT the full unique set; on create we INSERT the full
--   unique set.
--
--   INTENTIONAL BEHAVIOUR CHANGE (approved, documented — NOT hidden) on the INSERT:
--   the RPC uses ON CONFLICT (product_id, organization_id) DO NOTHING, whereas the FE
--   today issues a plain .insert() of the full unique set after deleting ONLY the active
--   company's row. In production, if a product is already associated with an org OTHER than
--   the active company and that org is still in uniqueOrgIds, the FE's plain insert hits a
--   duplicate-key violation: the error is caught by the outer try/catch, the save aborts
--   mid-way, and — because the FE's earlier calls are separate transactions — the already
--   committed products/product_organizations writes are left partially applied (a real,
--   latent data-integrity bug when editing a multi-org product from a company that is not
--   the owner of the extra association).
--   Consolidating into one transaction removes the partial-write hazard, and DO NOTHING
--   makes the "ensure the unique set is associated" intent succeed idempotently instead of
--   erroring on a pre-existing association. This is a deliberate bug fix, explicitly called
--   out here so it is reviewed as such and NOT presented as byte-identical replication.
--   Requires integration coverage for: editing a multi-org product from a company that is
--   not the owner of the extra association (must now succeed with one audit row, no partial
--   write, no duplicate-key error).
-- · product_prices: for each of {purchase, retail, wholesale, distributor} with value > 0,
--   the FE looks up an existing row by (product_id, price_type) via maybeSingle and either
--   UPDATEs it or INSERTs a new one. priceData = {product_id, price_type, price=value,
--   currency, vat_rate, created_by}. Prices with value falsy or <= 0 are left untouched
--   (the FE neither inserts nor deletes them). We replicate exactly, including the
--   (product_id, price_type) lookup key (NOT the table's (product_id, currency, valid_from)
--   unique constraint).
-- · product_attribute_values: the FE first deletes existing rows whose attribute_id is not
--   in the current form set, then for each form attribute builds valueData depending on the
--   attribute value_type ('text'/'string'/'list' → value_text; 'number' → value_number;
--   'boolean' → value_bool default false) and upserts by (product_id, attribute_id). The
--   value_type is a property of the attribute; the RPC receives the pre-resolved rows as a
--   jsonb array [{attribute_id, value_text?, value_number?, value_bool?}] so the type
--   switch (already applied client-side into the correct column) is preserved verbatim and
--   the DB does not need to re-read product_attributes.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS on the four tables does NOT self-enforce inside
-- them. Each RPC re-checks, explicitly, the SAME predicates the RLS policies enforce today
-- (20260703000000_products_security_fixes.sql + 20260703020000_products_rls_corrections.sql):
--   products_insert : is_system_admin_user(uid)
--                     OR ( has_anew_permission(uid,'products.create')
--                          AND organization_id IN get_user_visible_org_ids(uid) )
--   products_update : is_system_admin_user(uid)
--                     OR ( has_anew_permission(uid,'products.edit')
--                          AND organization_id IN get_user_visible_org_ids(uid) )
--                     (USING pre-image org AND WITH CHECK post-image org must both qualify)
--   product_organizations_(insert|delete) : is_system_admin_user(uid)
--                     OR ( has_anew_permission(uid,'products.edit')
--                          AND organization_id IN get_user_visible_org_ids(uid) )
--   product_prices_insert  : current_business_user_id() = created_by
--                     AND ( is_system_admin_user(uid)
--                           OR ( (products.create OR products.edit)
--                                AND parent product's org IN visible ) )
--   product_prices_update  : is_system_admin_user(uid)
--                     OR ( products.edit AND parent product's org IN visible )
--   product_attribute_values_insert : is_system_admin_user(uid)
--                     OR ( (products.create OR products.edit)
--                          AND parent product's org IN visible )
--   product_attribute_values_(update|delete) : is_system_admin_user(uid)
--                     OR ( products.edit/delete AND parent product's org IN visible )
-- Each org id written to products / product_organizations is re-validated against
-- get_user_visible_org_ids(uid) so a caller cannot associate a product with an org outside
-- their scope. The prices/attribute-values org checks are satisfied transitively because the
-- parent product's org is one of the caller's visible orgs (checked up front).
--
-- No collision with sibling modules
-- ---------------------------------
-- Categorias/Subcategorias/Marcas de Produtos already created rpc_*_product_category,
-- rpc_*_product_subcategory, rpc_*_product_attribute, rpc_*_brand. The functions here are
-- rpc_create_product / rpc_update_product (the core products entity) — distinct signatures,
-- no overlap.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql             — entity_audit_log, fn_generic_entity_audit()
--   20260703010000_products_audit_triggers.sql      — fn_audit_product_prices(),
--                                                      fn_audit_product_attribute_values()
--   20260703000000_products_security_fixes.sql      — the RLS policies mirrored here
--   20260703020000_products_rls_corrections.sql     — product_prices SELECT correction
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — fn_manual_audit_log() + guarded
--                                                      fn_generic_entity_audit() (FOUNDATION, reused)
--   20260615130000_baseline_new_database.sql         — has_anew_permission(),
--                                                      current_business_user_id(),
--                                                      get_user_visible_org_ids(),
--                                                      is_system_admin_user()


-- ============================================================
-- 1a. fn_audit_product_prices() — add audit-bypass guard
-- ============================================================
-- Body identical to 20260703010000_products_audit_triggers.sql §1 except for the
-- new guard as the first statement. The guard must run BEFORE any other logic.

CREATE OR REPLACE FUNCTION public.fn_audit_product_prices()
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
  v_product_id     uuid;
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

  -- ── Resolve product_id from whichever side is available ─────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_product_id := COALESCE(
    (to_jsonb(NEW) ->> 'product_id')::uuid,
    (to_jsonb(OLD) ->> 'product_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent product ─────────────
  -- entity_id is set to the parent product's id so that audit rows for price
  -- changes group under the product entity timeline (not the price row itself).
  IF v_product_id IS NOT NULL THEN
    SELECT p.organization_id, p.id
    INTO   v_org_id, v_entity_id
    FROM   public.products p
    WHERE  p.id = v_product_id
    LIMIT  1;
  END IF;

  -- Cannot determine org — skip silently (product with NULL org_id, global catalog item).
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

REVOKE ALL ON FUNCTION public.fn_audit_product_prices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_prices() TO service_role;


-- ============================================================
-- 1b. fn_audit_product_attribute_values() — add audit-bypass guard
-- ============================================================
-- Body identical to 20260703010000_products_audit_triggers.sql §2 except for the
-- new guard as the first statement.

CREATE OR REPLACE FUNCTION public.fn_audit_product_attribute_values()
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
  v_product_id     uuid;
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

  -- ── Resolve product_id from whichever side is available ─────────────────
  v_product_id := COALESCE(
    (to_jsonb(NEW) ->> 'product_id')::uuid,
    (to_jsonb(OLD) ->> 'product_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent product ─────────────
  IF v_product_id IS NOT NULL THEN
    SELECT p.organization_id, p.id
    INTO   v_org_id, v_entity_id
    FROM   public.products p
    WHERE  p.id = v_product_id
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

REVOKE ALL ON FUNCTION public.fn_audit_product_attribute_values() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_attribute_values() TO service_role;


-- ============================================================
-- Shared helper (internal) — not created; logic inlined per RPC
-- ============================================================
-- The two RPCs share the same price/attribute upsert logic. To keep them self-contained
-- and avoid an extra public surface, the shared steps are inlined in each. The prices
-- payload arrives as a jsonb array of {price_type, price, currency, vat_rate} entries
-- (only entries the FE would write, i.e. value > 0). The attribute-values payload arrives
-- as a jsonb array of {attribute_id, value_text?, value_number?, value_bool?} rows already
-- reduced client-side by value_type.


-- ============================================================
-- 2a. rpc_create_product(...)
-- ============================================================
-- Mirrors the create branch of handleSubmit() in src/pages/Products.tsx:
--   · INSERT products {sku, name, status, is_active=true, is_sellable, is_purchasable,
--       category_id|null, subcategory_id|null, organization_id = primaryOrgId, uom_id|null,
--       description?, barcode?, brand_id?, supplier_id (folded), created_by = business user}
--   · INSERT product_organizations for each unique org id in {primaryOrgId} ∪ p_all_org_ids
--   · product_prices: for each entry in p_prices, INSERT (created_by = business user)
--     — on create there is nothing to update, so every provided price is a fresh INSERT.
--   · product_attribute_values: INSERT each entry in p_attribute_values
--     — on create there is nothing to delete/update.
-- Emits exactly ONE INSERT audit row on the products entity.
-- Returns the created products row id.
--
-- Authorization mirrors products_insert + product_organizations_insert +
-- product_prices_insert + product_attribute_values_insert RLS.

CREATE OR REPLACE FUNCTION public.rpc_create_product(
  p_sku              text,
  p_name             text,
  p_status           text,
  p_is_sellable      boolean,
  p_is_purchasable   boolean,
  p_category_id      uuid,
  p_subcategory_id   uuid,
  p_primary_org_id   uuid,
  p_uom_id           uuid,
  p_description      text,
  p_barcode          text,
  p_brand_id         uuid,
  p_supplier_id      uuid,
  p_all_org_ids      uuid[],
  p_prices           jsonb,
  p_attribute_values jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_org         uuid;
  v_unique_orgs uuid[];
  v_product     public.products;
  v_price       jsonb;
  v_attr        jsonb;
  v_diff        jsonb;
  v_price_new   jsonb := '[]'::jsonb;
  v_attr_new    jsonb := '[]'::jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ─────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Build the unique org set: {primaryOrgId} ∪ p_all_org_ids (FE's Set) ───
  -- Preserve insertion order: primary first, then each new id in first-seen order.
  WITH combined AS (
    SELECT p_primary_org_id AS o, 0 AS ord WHERE p_primary_org_id IS NOT NULL
    UNION ALL
    SELECT o, ord
    FROM unnest(COALESCE(p_all_org_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS u(o, ord)
    WHERE o IS NOT NULL
  ),
  dedup AS (
    SELECT o, min(ord) AS ord FROM combined GROUP BY o
  )
  SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
  INTO   v_unique_orgs
  FROM   dedup;

  -- ── Authorization parity with products_insert RLS ────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_primary_org_id IS NULL
       OR NOT (p_primary_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible (product_organizations_insert WITH CHECK).
    FOREACH v_org IN ARRAY v_unique_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── INSERT the product (FE productData + conditional fields + supplier_id) ─
  -- The FE only sets description/barcode when truthy and brand_id when present;
  -- '' → NULL here is equivalent to the key being absent for these nullable columns.
  INSERT INTO public.products
    (sku, name, status, is_active, is_sellable, is_purchasable,
     category_id, subcategory_id, organization_id, uom_id,
     description, barcode, brand_id, supplier_id, created_by)
  VALUES
    (p_sku,
     p_name,
     p_status::public.product_status,
     true,
     COALESCE(p_is_sellable, false),
     COALESCE(p_is_purchasable, false),
     p_category_id,
     p_subcategory_id,
     p_primary_org_id,
     p_uom_id,
     nullif(p_description, ''),
     nullif(p_barcode, ''),
     p_brand_id,
     p_supplier_id,
     v_actor)
  RETURNING * INTO v_product;

  -- ── INSERT org associations for the full unique set ───────────────────────
  FOREACH v_org IN ARRAY v_unique_orgs LOOP
    INSERT INTO public.product_organizations (product_id, organization_id, created_by)
    VALUES (v_product.id, v_org, v_actor)
    ON CONFLICT (product_id, organization_id) DO NOTHING;
  END LOOP;

  -- ── INSERT prices (every provided entry is fresh on create) ───────────────
  IF p_prices IS NOT NULL AND jsonb_typeof(p_prices) = 'array' THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices) LOOP
      INSERT INTO public.product_prices
        (product_id, price_type, price, currency, vat_rate, created_by)
      VALUES
        (v_product.id,
         (v_price ->> 'price_type')::public.price_type,
         (v_price ->> 'price')::numeric,
         (v_price ->> 'currency')::public.currency_code,
         (v_price ->> 'vat_rate')::numeric,
         v_actor);
      v_price_new := v_price_new || jsonb_build_object(
        'price_type', v_price ->> 'price_type',
        'price',      v_price -> 'price',
        'currency',   v_price ->> 'currency',
        'vat_rate',   v_price -> 'vat_rate'
      );
    END LOOP;
  END IF;

  -- ── INSERT attribute values (every provided entry is fresh on create) ─────
  IF p_attribute_values IS NOT NULL AND jsonb_typeof(p_attribute_values) = 'array' THEN
    FOR v_attr IN SELECT * FROM jsonb_array_elements(p_attribute_values) LOOP
      INSERT INTO public.product_attribute_values
        (product_id, attribute_id, value_text, value_number, value_bool)
      VALUES
        (v_product.id,
         (v_attr ->> 'attribute_id')::uuid,
         CASE WHEN v_attr ? 'value_text'   THEN v_attr ->> 'value_text' END,
         CASE WHEN v_attr ? 'value_number' THEN (v_attr ->> 'value_number')::numeric END,
         CASE WHEN v_attr ? 'value_bool'   THEN (v_attr ->> 'value_bool')::boolean END);
      v_attr_new := v_attr_new || v_attr;
    END LOOP;
  END IF;

  -- ── Combined diff: full snapshot of the created product + child sets ──────
  v_diff := jsonb_build_object(
    'products', jsonb_build_object(
      'sku',             jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.sku)),
      'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.name)),
      'status',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.status)),
      'is_active',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.is_active)),
      'is_sellable',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.is_sellable)),
      'is_purchasable',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.is_purchasable)),
      'category_id',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.category_id)),
      'subcategory_id',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.subcategory_id)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.organization_id)),
      'uom_id',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.uom_id)),
      'description',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.description)),
      'barcode',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.barcode)),
      'brand_id',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.brand_id)),
      'supplier_id',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.supplier_id))
    ),
    'product_organizations', jsonb_build_object(
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_unique_orgs))
    ),
    'product_prices', jsonb_build_object(
      'prices', jsonb_build_object('old', NULL, 'new', v_price_new)
    ),
    'product_attribute_values', jsonb_build_object(
      'values', jsonb_build_object('old', NULL, 'new', v_attr_new)
    )
  );

  PERFORM public.fn_manual_audit_log(
    'products', v_product.id, v_product.organization_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_product.id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_product(
  text, text, text, boolean, boolean, uuid, uuid, uuid, uuid,
  text, text, uuid, uuid, uuid[], jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_product(
  text, text, text, boolean, boolean, uuid, uuid, uuid, uuid,
  text, text, uuid, uuid, uuid[], jsonb, jsonb
) TO authenticated;


-- ============================================================
-- 2b. rpc_update_product(...)
-- ============================================================
-- Mirrors the edit branch of handleSubmit() in src/pages/Products.tsx:
--   · UPDATE products SET {sku, name, status, is_active=true, is_sellable, is_purchasable,
--       category_id|null, subcategory_id|null, organization_id = primaryOrgId, uom_id|null,
--       description|NULL, barcode|NULL, brand_id, supplier_id (FE's SECOND update, folded)}
--       WHERE id = editing product AND organization_id = active company.
--     Note: the FE issues the supplier_id write as a separate trailing UPDATE (lines
--     809-812) that is NOT scoped by organization_id; folding it into this scoped UPDATE
--     keeps one transaction/one log row and does not weaken scoping.
--   · product_organizations: DELETE the (product_id, active company) row then INSERT the
--     full unique org set {primaryOrgId} ∪ p_all_org_ids (mirrors the FE delete-then-insert).
--   · product_prices: for each entry in p_prices, look up by (product_id, price_type) and
--     UPDATE if present else INSERT (created_by = business user). Prices absent from p_prices
--     (FE value <= 0) are left untouched.
--   · product_attribute_values: DELETE existing rows whose attribute_id is NOT in the current
--     set (p_attribute_ids), then upsert each entry in p_attribute_values by
--     (product_id, attribute_id).
-- Emits exactly ONE UPDATE audit row on the products entity (only when something changed).
-- Returns the updated products row id.
--
-- Authorization mirrors products_update (pre + post org visible) +
-- product_organizations_(insert|delete) + product_prices_(insert|update) +
-- product_attribute_values_(insert|update|delete) RLS.

CREATE OR REPLACE FUNCTION public.rpc_update_product(
  p_id               uuid,
  p_active_org_id    uuid,
  p_sku              text,
  p_name             text,
  p_status           text,
  p_is_sellable      boolean,
  p_is_purchasable   boolean,
  p_category_id      uuid,
  p_subcategory_id   uuid,
  p_primary_org_id   uuid,
  p_uom_id           uuid,
  p_description      text,
  p_barcode          text,
  p_brand_id         uuid,
  p_supplier_id      uuid,
  p_all_org_ids      uuid[],
  p_prices           jsonb,
  p_attribute_ids    uuid[],
  p_attribute_values jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_is_admin     boolean;
  v_before       public.products;
  v_product      public.products;
  v_org          uuid;
  v_unique_orgs  uuid[];
  v_price        jsonb;
  v_attr         jsonb;
  v_existing_id  uuid;
  v_attr_ids     uuid[];
  v_prod_diff    jsonb;
  v_diff         jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row scoped by the active org (mirrors the FE .eq filters) ──
  SELECT * INTO v_before
  FROM public.products
  WHERE id = p_id
    AND organization_id = p_active_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Build the unique org set (same rule as create) ────────────────────────
  WITH combined AS (
    SELECT p_primary_org_id AS o, 0 AS ord WHERE p_primary_org_id IS NOT NULL
    UNION ALL
    SELECT o, ord
    FROM unnest(COALESCE(p_all_org_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS u(o, ord)
    WHERE o IS NOT NULL
  ),
  dedup AS (
    SELECT o, min(ord) AS ord FROM combined GROUP BY o
  )
  SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
  INTO   v_unique_orgs
  FROM   dedup;

  v_attr_ids := COALESCE(p_attribute_ids, ARRAY[]::uuid[]);

  -- ── Authorization parity with products_update RLS ────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update org must be visible.
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Produto fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update org must be visible (prevents cross-org reassignment).
    IF p_primary_org_id IS NULL
       OR NOT (p_primary_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible (product_organizations_insert WITH CHECK).
    FOREACH v_org IN ARRAY v_unique_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── UPDATE the product (FE main-fields UPDATE + folded supplier_id UPDATE) ─
  UPDATE public.products
  SET sku             = p_sku,
      name            = p_name,
      status          = p_status::public.product_status,
      is_active       = true,
      is_sellable     = COALESCE(p_is_sellable, false),
      is_purchasable  = COALESCE(p_is_purchasable, false),
      category_id     = p_category_id,
      subcategory_id  = p_subcategory_id,
      organization_id = p_primary_org_id,
      uom_id          = p_uom_id,
      description     = nullif(p_description, ''),
      barcode         = nullif(p_barcode, ''),
      brand_id        = p_brand_id,
      supplier_id     = p_supplier_id
  WHERE id = p_id
    AND organization_id = p_active_org_id
  RETURNING * INTO v_product;

  -- ── Rewrite org associations: delete the active company row, then insert set ──
  -- Mirrors the FE: .delete().eq(product_id).eq(organization_id, activeCompany.id)
  -- followed by insert of the full unique set.
  -- INTENTIONAL BEHAVIOUR CHANGE (see header): ON CONFLICT DO NOTHING makes the insert
  -- idempotent for orgs already associated (other than the active company, which was just
  -- deleted). The FE's plain .insert() would raise a duplicate-key error in that case and,
  -- because its calls are separate transactions, leave a partial write. Folding into one
  -- transaction + DO NOTHING fixes that latent bug. Documented and approved as a bug fix.
  DELETE FROM public.product_organizations
  WHERE product_id = p_id
    AND organization_id = p_active_org_id;

  FOREACH v_org IN ARRAY v_unique_orgs LOOP
    INSERT INTO public.product_organizations (product_id, organization_id, created_by)
    VALUES (p_id, v_org, v_actor)
    ON CONFLICT (product_id, organization_id) DO NOTHING;
  END LOOP;

  -- ── Upsert prices by (product_id, price_type) — mirrors FE maybeSingle then up/insert ──
  IF p_prices IS NOT NULL AND jsonb_typeof(p_prices) = 'array' THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices) LOOP
      SELECT id INTO v_existing_id
      FROM public.product_prices
      WHERE product_id = p_id
        AND price_type = (v_price ->> 'price_type')::public.price_type
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        UPDATE public.product_prices
        SET price      = (v_price ->> 'price')::numeric,
            currency   = (v_price ->> 'currency')::public.currency_code,
            vat_rate   = (v_price ->> 'vat_rate')::numeric,
            created_by = v_actor
        WHERE id = v_existing_id;
      ELSE
        INSERT INTO public.product_prices
          (product_id, price_type, price, currency, vat_rate, created_by)
        VALUES
          (p_id,
           (v_price ->> 'price_type')::public.price_type,
           (v_price ->> 'price')::numeric,
           (v_price ->> 'currency')::public.currency_code,
           (v_price ->> 'vat_rate')::numeric,
           v_actor);
      END IF;
      v_existing_id := NULL;
    END LOOP;
  END IF;

  -- ── Reconcile attribute values ────────────────────────────────────────────
  -- Delete rows whose attribute_id is not in the current form set (FE toDelete loop),
  -- then upsert each provided value by (product_id, attribute_id).
  DELETE FROM public.product_attribute_values
  WHERE product_id = p_id
    AND NOT (attribute_id = ANY (v_attr_ids));

  IF p_attribute_values IS NOT NULL AND jsonb_typeof(p_attribute_values) = 'array' THEN
    FOR v_attr IN SELECT * FROM jsonb_array_elements(p_attribute_values) LOOP
      SELECT id INTO v_existing_id
      FROM public.product_attribute_values
      WHERE product_id = p_id
        AND attribute_id = (v_attr ->> 'attribute_id')::uuid
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        -- FAITHFUL to the FE: supabase-js `.update(valueData)` only emits the ONE column
        -- present in valueData (the one matching the attribute's value_type via the switch
        -- at Products.tsx lines 779-791). The other two columns are NOT part of the SQL
        -- UPDATE and stay exactly as they were in the row. Therefore each column here is
        -- written ONLY when its key is present in the payload; when the key is absent we
        -- keep the row's current value (COALESCE against the existing column), never NULL.
        -- Writing NULL to the two inactive columns (the previous version) silently
        -- destroyed legacy/other-type data on every save — that is corrected here.
        UPDATE public.product_attribute_values AS pav
        SET value_text   = CASE WHEN v_attr ? 'value_text'
                                THEN v_attr ->> 'value_text'
                                ELSE pav.value_text END,
            value_number = CASE WHEN v_attr ? 'value_number'
                                THEN (v_attr ->> 'value_number')::numeric
                                ELSE pav.value_number END,
            value_bool   = CASE WHEN v_attr ? 'value_bool'
                                THEN (v_attr ->> 'value_bool')::boolean
                                ELSE pav.value_bool END
        WHERE pav.id = v_existing_id;
      ELSE
        INSERT INTO public.product_attribute_values
          (product_id, attribute_id, value_text, value_number, value_bool)
        VALUES
          (p_id,
           (v_attr ->> 'attribute_id')::uuid,
           CASE WHEN v_attr ? 'value_text'   THEN v_attr ->> 'value_text' END,
           CASE WHEN v_attr ? 'value_number' THEN (v_attr ->> 'value_number')::numeric END,
           CASE WHEN v_attr ? 'value_bool'   THEN (v_attr ->> 'value_bool')::boolean END);
      END IF;
      v_existing_id := NULL;
    END LOOP;
  END IF;

  -- ── Build the products-table diff (only changed columns) ──────────────────
  v_prod_diff := '{}'::jsonb;
  IF v_before.sku IS DISTINCT FROM v_product.sku THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('sku',
      jsonb_build_object('old', to_jsonb(v_before.sku), 'new', to_jsonb(v_product.sku)));
  END IF;
  IF v_before.name IS DISTINCT FROM v_product.name THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_product.name)));
  END IF;
  IF v_before.status IS DISTINCT FROM v_product.status THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb(v_product.status)));
  END IF;
  IF v_before.is_active IS DISTINCT FROM v_product.is_active THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('is_active',
      jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(v_product.is_active)));
  END IF;
  IF v_before.is_sellable IS DISTINCT FROM v_product.is_sellable THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('is_sellable',
      jsonb_build_object('old', to_jsonb(v_before.is_sellable), 'new', to_jsonb(v_product.is_sellable)));
  END IF;
  IF v_before.is_purchasable IS DISTINCT FROM v_product.is_purchasable THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('is_purchasable',
      jsonb_build_object('old', to_jsonb(v_before.is_purchasable), 'new', to_jsonb(v_product.is_purchasable)));
  END IF;
  IF v_before.category_id IS DISTINCT FROM v_product.category_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('category_id',
      jsonb_build_object('old', to_jsonb(v_before.category_id), 'new', to_jsonb(v_product.category_id)));
  END IF;
  IF v_before.subcategory_id IS DISTINCT FROM v_product.subcategory_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('subcategory_id',
      jsonb_build_object('old', to_jsonb(v_before.subcategory_id), 'new', to_jsonb(v_product.subcategory_id)));
  END IF;
  IF v_before.organization_id IS DISTINCT FROM v_product.organization_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('organization_id',
      jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', to_jsonb(v_product.organization_id)));
  END IF;
  IF v_before.uom_id IS DISTINCT FROM v_product.uom_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('uom_id',
      jsonb_build_object('old', to_jsonb(v_before.uom_id), 'new', to_jsonb(v_product.uom_id)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_product.description THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_product.description)));
  END IF;
  IF v_before.barcode IS DISTINCT FROM v_product.barcode THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('barcode',
      jsonb_build_object('old', to_jsonb(v_before.barcode), 'new', to_jsonb(v_product.barcode)));
  END IF;
  IF v_before.brand_id IS DISTINCT FROM v_product.brand_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('brand_id',
      jsonb_build_object('old', to_jsonb(v_before.brand_id), 'new', to_jsonb(v_product.brand_id)));
  END IF;
  IF v_before.supplier_id IS DISTINCT FROM v_product.supplier_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('supplier_id',
      jsonb_build_object('old', to_jsonb(v_before.supplier_id), 'new', to_jsonb(v_product.supplier_id)));
  END IF;

  -- ── Combined diff across all tables touched ───────────────────────────────
  -- The child tables (organizations/prices/attributes) are always part of a save action;
  -- we record their intended target set/payload so the single log row reflects the full
  -- effect, mirroring how the per-table triggers would each have logged their change.
  v_diff := '{}'::jsonb;
  IF v_prod_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('products', v_prod_diff);
  END IF;
  v_diff := v_diff || jsonb_build_object(
    'product_organizations', jsonb_build_object(
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_unique_orgs))
    ),
    'product_prices', jsonb_build_object(
      'prices', jsonb_build_object('old', NULL, 'new', COALESCE(p_prices, '[]'::jsonb))
    ),
    'product_attribute_values', jsonb_build_object(
      'values', jsonb_build_object('old', NULL, 'new', COALESCE(p_attribute_values, '[]'::jsonb))
    )
  );

  -- Emit a single UPDATE log row (a save always touches the child tables, so v_diff
  -- is never empty here; the guard is defensive).
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'products', p_id, v_product.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_product.id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_product(
  uuid, uuid, text, text, text, boolean, boolean, uuid, uuid, uuid, uuid,
  text, text, uuid, uuid, uuid[], jsonb, uuid[], jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_product(
  uuid, uuid, text, text, text, boolean, boolean, uuid, uuid, uuid, uuid,
  text, text, uuid, uuid, uuid[], jsonb, uuid[], jsonb
) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Bypass guard present at the top of both product child-table trigger functions:
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('fn_audit_product_prices', 'fn_audit_product_attribute_values')
--     AND prosrc LIKE '%app.audit_bypass%';
--   -- Expected: both rows. (fn_generic_entity_audit — products + product_organizations —
--   -- was already guarded in 20260719010000.)
--
-- 2. A single "create product with 3 orgs, 4 prices, 5 attributes" produces exactly ONE
--    audit row on the products entity:
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'products' AND operation = 'INSERT'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: 1 (not 1 + N children).
--
-- 3. An edit that changes only the supplier_id yields ONE UPDATE row with a products diff
--    containing supplier_id (proving the FE's two separate products UPDATEs are folded into
--    one), NOT two rows.
--
-- 4. rpc_update_product on a product whose organization_id differs from the passed active
--    org raises no_data_found; a product/org outside the caller's visible orgs raises
--    insufficient_privilege — matching the RLS + FE .eq(organization_id) scoping.
--
-- 5. No signature collision with rpc_*_product_category / rpc_*_product_subcategory /
--    rpc_*_product_attribute / rpc_*_brand created by the sibling modules.
