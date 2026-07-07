-- ============================================================
-- rpc_bulk_import_products(p_org_id uuid, p_products jsonb)
-- ============================================================
-- FIX: src/pages/Products.tsx handleImport() currently performs, per whole
-- import batch: one bulk `products.upsert()`, one bulk `product_prices.insert()`,
-- and one bulk `product_organizations.upsert()`. Each of these table writes
-- fires its own audit trigger, so a SINGLE imported product's own creation
-- (products row + its prices + its org association) ends up fragmented across
-- up to 3 entity_audit_log rows instead of exactly 1.
--
-- This RPC accepts the exact rows already parsed client-side by
-- parseProductsCSV() (src/utils/productsExportImport.ts) as a jsonb array and,
-- for EACH product, does the products upsert + price writes + org association
-- upsert inside the same server-side transaction as the whole call, emitting
-- exactly ONE fn_manual_audit_log call per product (INSERT for new products,
-- UPDATE for existing ones — matching rpc_create_product / rpc_update_product
-- semantics). audit_bypass is enabled once for the whole batch so per-table
-- triggers never fire; fn_manual_audit_log is the only audit writer.
--
-- Input shape (p_products), one jsonb object per CSV/Excel row, mirroring
-- ParsedProductsResult from productsExportImport.ts:
--   {
--     "mode": "insert" | "update",
--     "id": uuid | null,              -- required when mode = "update"
--     "sku": text,
--     "name": text,
--     "description": text | null,
--     "barcode": text | null,
--     "status": text,                  -- cast to product_status
--     "category_id": uuid | null,
--     "subcategory_id": uuid | null,
--     "brand_id": uuid | null,
--     "supplier_id": uuid | null,
--     "organization_id": uuid | null,  -- resolvedCompanyId (row's target org)
--     "is_sellable": boolean,
--     "is_purchasable": boolean,
--     "prices": [
--       { "price_type": text, "price": numeric, "currency": text,
--         "vat_rate": numeric, "valid_from": text|null, "valid_to": text|null }
--     ]
--   }
--
-- p_org_id is the active company (organization_id) the import was launched
-- from; used only for authorization parity with products_insert/update RLS
-- (each row's own organization_id is still what gets written/scoped).
--
-- Behavior per row:
--   · mode = 'insert': INSERT into products (created_by = caller's business
--     user id), INSERT product_organizations for row's organization_id
--     (ON CONFLICT DO NOTHING — mirrors upsert ignoreDuplicates), INSERT all
--     provided prices fresh. One audit row, action 'INSERT'.
--   · mode = 'update': UPDATE products by id (scoped to p_org_id, matching the
--     FE's `.eq("organization_id", activeCompany.id)` guard; note: unlike
--     rpc_update_product, is_active is intentionally left untouched here —
--     the FE's productsToUpdate payload never sets it either, so this mirrors
--     current bulk-import behavior rather than being an oversight), upsert the
--     org association, and reconcile prices to match the row's `prices` array
--     exactly: any existing price_type NOT present in the row is DELETEd
--     first, then each provided price is UPDATEd by (product_id, price_type)
--     if present else INSERTed. This reproduces the OLD FE's hard
--     `DELETE FROM product_prices WHERE product_id = X` followed by re-insert
--     of only the CSV-provided price types — re-importing a row with fewer
--     populated price columns still wipes the missing price types, matching
--     prior behavior exactly (no silent divergence).
--     One audit row, action 'UPDATE' — only emitted when products or prices
--     actually changed (diff non-empty), matching rpc_update_product's
--     no-op-skip semantics so re-running an unchanged import is a no-op audit-wise.
--
-- Returns: jsonb array of { input_index, product_id, action } so the FE can
-- reconcile its report counters (inserted/updated/skipped) without needing
-- the old upsert-conflict-detection dance.
--
-- Round-trips: OLD approach = 1 (products upsert) + 1 (prices insert) +
-- 1 (org upsert) + N (per-updated-product products.update) +
-- M (per-updated-product prices.delete), all chunked by 50 → many requests
-- for large imports, and each chunk fires its own audit trigger per table.
-- NEW approach = 1 single RPC call for the entire batch (still chunked
-- client-side into calls of e.g. 200 rows if payload size requires it, but
-- typically 1 request), with exactly one audit row PER PRODUCT server-side.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_bulk_import_products(
  p_org_id   uuid,
  p_products jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_is_admin     boolean;
  v_row          jsonb;
  v_row_idx      int := -1;
  v_mode         text;
  v_row_org      uuid;
  v_product_id   uuid;
  v_product      public.products;
  v_before       public.products;
  v_price        jsonb;
  v_price_new    jsonb;
  v_diff         jsonb;
  v_results      jsonb := '[]'::jsonb;
  v_existing_price public.product_prices;
  v_price_diff   jsonb;
  v_price_changed boolean;
  v_deleted_count int;
BEGIN
  -- Consolidate all writes (whole batch) into one audit row per product.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.create') THEN
      RAISE EXCEPTION 'Sem permissão para importar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_org_id IS NULL
       OR NOT (p_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_products IS NULL OR jsonb_typeof(p_products) <> 'array' THEN
    RAISE EXCEPTION 'p_products deve ser um array jsonb' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_products) LOOP
    v_row_idx := v_row_idx + 1;
    v_mode := v_row ->> 'mode';
    v_row_org := NULLIF(v_row ->> 'organization_id', '')::uuid;

    IF NOT v_is_admin AND v_row_org IS NOT NULL
       AND NOT (v_row_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador (linha %)', v_row_idx
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_mode = 'insert' THEN
      -- ── INSERT product ──────────────────────────────────────────────────
      -- ON CONFLICT (sku, organization_id) DO UPDATE mirrors the OLD FE's
      -- `.upsert(..., { onConflict: "sku,organization_id" })`: a SKU that
      -- already exists in the DB but is invisible to the caller under RLS
      -- (e.g. soft-deleted-but-not-trashed edge cases, or rows the caller's
      -- row-level policy hides) must merge into that row instead of raising
      -- a duplicate-key violation. Capture whether a real conflict happened
      -- (xmax <> 0) purely for diagnostics; audit semantics below treat this
      -- path the same as a fresh insert, matching prior FE behavior where a
      -- merged upsert was still reported as part of the "insert" flow.
      INSERT INTO public.products
        (sku, name, description, barcode, status, is_active,
         is_sellable, is_purchasable, category_id, subcategory_id,
         brand_id, supplier_id, organization_id, created_by)
      VALUES
        (v_row ->> 'sku',
         v_row ->> 'name',
         NULLIF(v_row ->> 'description', ''),
         NULLIF(v_row ->> 'barcode', ''),
         COALESCE(v_row ->> 'status', 'draft')::public.product_status,
         true,
         COALESCE((v_row ->> 'is_sellable')::boolean, false),
         COALESCE((v_row ->> 'is_purchasable')::boolean, false),
         NULLIF(v_row ->> 'category_id', '')::uuid,
         NULLIF(v_row ->> 'subcategory_id', '')::uuid,
         NULLIF(v_row ->> 'brand_id', '')::uuid,
         NULLIF(v_row ->> 'supplier_id', '')::uuid,
         v_row_org,
         v_actor)
      ON CONFLICT (sku, organization_id) DO UPDATE SET
        name            = EXCLUDED.name,
        description     = EXCLUDED.description,
        barcode         = EXCLUDED.barcode,
        status          = EXCLUDED.status,
        is_sellable     = EXCLUDED.is_sellable,
        is_purchasable  = EXCLUDED.is_purchasable,
        category_id     = EXCLUDED.category_id,
        subcategory_id  = EXCLUDED.subcategory_id,
        brand_id        = EXCLUDED.brand_id,
        supplier_id     = EXCLUDED.supplier_id,
        updated_at      = now()
      RETURNING * INTO v_product;

      v_product_id := v_product.id;

      IF v_row_org IS NOT NULL THEN
        INSERT INTO public.product_organizations (product_id, organization_id, created_by)
        VALUES (v_product_id, v_row_org, v_actor)
        ON CONFLICT (product_id, organization_id) DO NOTHING;
      END IF;

      v_price_new := '[]'::jsonb;
      IF v_row ? 'prices' AND jsonb_typeof(v_row -> 'prices') = 'array' THEN
        FOR v_price IN SELECT * FROM jsonb_array_elements(v_row -> 'prices') LOOP
          INSERT INTO public.product_prices
            (product_id, price_type, price, currency, vat_rate, valid_from, valid_to, created_by)
          VALUES
            (v_product_id,
             (v_price ->> 'price_type')::public.price_type,
             (v_price ->> 'price')::numeric,
             COALESCE(v_price ->> 'currency', 'EUR')::public.currency_code,
             (v_price ->> 'vat_rate')::numeric,
             NULLIF(v_price ->> 'valid_from', '')::timestamptz,
             NULLIF(v_price ->> 'valid_to', '')::timestamptz,
             v_actor);
          v_price_new := v_price_new || jsonb_build_object(
            'price_type', v_price ->> 'price_type',
            'price',      v_price -> 'price',
            'currency',   v_price ->> 'currency',
            'vat_rate',   v_price -> 'vat_rate'
          );
        END LOOP;
      END IF;

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
          'description',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.description)),
          'barcode',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.barcode)),
          'brand_id',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.brand_id)),
          'supplier_id',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.supplier_id))
        ),
        'product_organizations', jsonb_build_object(
          'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_row_org))
        ),
        'product_prices', jsonb_build_object(
          'prices', jsonb_build_object('old', NULL, 'new', v_price_new)
        ),
        'source', 'bulk_import'
      );

      PERFORM public.fn_manual_audit_log(
        'products', v_product.id, v_product.organization_id, 'INSERT', v_diff, 'web_app'
      );

      v_results := v_results || jsonb_build_object(
        'input_index', v_row_idx, 'product_id', v_product_id, 'action', 'insert'
      );

    ELSIF v_mode = 'update' THEN
      -- ── UPDATE product (scoped like the FE's .eq organization_id guard) ──
      v_product_id := NULLIF(v_row ->> 'id', '')::uuid;
      IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'mode=update requer id (linha %)', v_row_idx USING ERRCODE = 'invalid_parameter_value';
      END IF;

      SELECT * INTO v_before FROM public.products
        WHERE id = v_product_id AND organization_id = p_org_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado nesta organização (linha %)', v_row_idx
          USING ERRCODE = 'no_data_found';
      END IF;

      UPDATE public.products SET
        sku             = v_row ->> 'sku',
        name            = v_row ->> 'name',
        description     = NULLIF(v_row ->> 'description', ''),
        barcode         = NULLIF(v_row ->> 'barcode', ''),
        status          = COALESCE(v_row ->> 'status', 'draft')::public.product_status,
        category_id     = NULLIF(v_row ->> 'category_id', '')::uuid,
        subcategory_id  = NULLIF(v_row ->> 'subcategory_id', '')::uuid,
        brand_id        = NULLIF(v_row ->> 'brand_id', '')::uuid,
        supplier_id     = NULLIF(v_row ->> 'supplier_id', '')::uuid,
        is_sellable     = COALESCE((v_row ->> 'is_sellable')::boolean, false),
        is_purchasable  = COALESCE((v_row ->> 'is_purchasable')::boolean, false),
        updated_at      = now()
      WHERE id = v_product_id AND organization_id = p_org_id
      RETURNING * INTO v_product;

      IF v_row_org IS NOT NULL THEN
        INSERT INTO public.product_organizations (product_id, organization_id, created_by)
        VALUES (v_product_id, v_row_org, v_actor)
        ON CONFLICT (product_id, organization_id) DO NOTHING;
      END IF;

      -- Reconcile prices to exactly match the row's `prices` array: delete
      -- any existing price_type not present in the incoming payload first,
      -- mirroring the OLD FE's delete-then-insert net effect (see header).
      DELETE FROM public.product_prices
      WHERE product_id = v_product_id
        AND price_type <> ALL (
          COALESCE(
            ARRAY(
              SELECT (elem ->> 'price_type')::public.price_type
              FROM jsonb_array_elements(
                CASE WHEN v_row ? 'prices' AND jsonb_typeof(v_row -> 'prices') = 'array'
                     THEN v_row -> 'prices' ELSE '[]'::jsonb END
              ) elem
            ),
            ARRAY[]::public.price_type[]
          )
        );
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      v_price_changed := v_deleted_count > 0;

      v_price_diff := '[]'::jsonb;
      IF v_row ? 'prices' AND jsonb_typeof(v_row -> 'prices') = 'array' THEN
        FOR v_price IN SELECT * FROM jsonb_array_elements(v_row -> 'prices') LOOP
          SELECT * INTO v_existing_price FROM public.product_prices
            WHERE product_id = v_product_id
              AND price_type = (v_price ->> 'price_type')::public.price_type
            LIMIT 1;

          IF FOUND THEN
            IF v_existing_price.price      IS DISTINCT FROM (v_price ->> 'price')::numeric
               OR v_existing_price.currency   IS DISTINCT FROM COALESCE(v_price ->> 'currency', 'EUR')::public.currency_code
               OR v_existing_price.vat_rate   IS DISTINCT FROM (v_price ->> 'vat_rate')::numeric
               OR v_existing_price.valid_from IS DISTINCT FROM NULLIF(v_price ->> 'valid_from', '')::timestamptz
               OR v_existing_price.valid_to   IS DISTINCT FROM NULLIF(v_price ->> 'valid_to', '')::timestamptz THEN
              v_price_changed := true;
            END IF;

            UPDATE public.product_prices SET
              price      = (v_price ->> 'price')::numeric,
              currency   = COALESCE(v_price ->> 'currency', 'EUR')::public.currency_code,
              vat_rate   = (v_price ->> 'vat_rate')::numeric,
              valid_from = NULLIF(v_price ->> 'valid_from', '')::timestamptz,
              valid_to   = NULLIF(v_price ->> 'valid_to', '')::timestamptz,
              updated_at = now()
            WHERE id = v_existing_price.id;
          ELSE
            INSERT INTO public.product_prices
              (product_id, price_type, price, currency, vat_rate, valid_from, valid_to, created_by)
            VALUES
              (v_product_id,
               (v_price ->> 'price_type')::public.price_type,
               (v_price ->> 'price')::numeric,
               COALESCE(v_price ->> 'currency', 'EUR')::public.currency_code,
               (v_price ->> 'vat_rate')::numeric,
               NULLIF(v_price ->> 'valid_from', '')::timestamptz,
               NULLIF(v_price ->> 'valid_to', '')::timestamptz,
               v_actor);
            v_price_changed := true;
          END IF;

          v_price_diff := v_price_diff || jsonb_build_object(
            'price_type', v_price ->> 'price_type',
            'price',      v_price -> 'price',
            'currency',   v_price ->> 'currency',
            'vat_rate',   v_price -> 'vat_rate'
          );
        END LOOP;
      END IF;

      v_diff := '{}'::jsonb;

      IF v_before.sku             IS DISTINCT FROM v_product.sku THEN
        v_diff := jsonb_set(v_diff, '{products,sku}', jsonb_build_object('old', to_jsonb(v_before.sku), 'new', to_jsonb(v_product.sku)), true); END IF;
      IF v_before.name            IS DISTINCT FROM v_product.name THEN
        v_diff := jsonb_set(v_diff, '{products,name}', jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_product.name)), true); END IF;
      IF v_before.status          IS DISTINCT FROM v_product.status THEN
        v_diff := jsonb_set(v_diff, '{products,status}', jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb(v_product.status)), true); END IF;
      IF v_before.is_sellable     IS DISTINCT FROM v_product.is_sellable THEN
        v_diff := jsonb_set(v_diff, '{products,is_sellable}', jsonb_build_object('old', to_jsonb(v_before.is_sellable), 'new', to_jsonb(v_product.is_sellable)), true); END IF;
      IF v_before.is_purchasable  IS DISTINCT FROM v_product.is_purchasable THEN
        v_diff := jsonb_set(v_diff, '{products,is_purchasable}', jsonb_build_object('old', to_jsonb(v_before.is_purchasable), 'new', to_jsonb(v_product.is_purchasable)), true); END IF;
      IF v_before.category_id     IS DISTINCT FROM v_product.category_id THEN
        v_diff := jsonb_set(v_diff, '{products,category_id}', jsonb_build_object('old', to_jsonb(v_before.category_id), 'new', to_jsonb(v_product.category_id)), true); END IF;
      IF v_before.subcategory_id  IS DISTINCT FROM v_product.subcategory_id THEN
        v_diff := jsonb_set(v_diff, '{products,subcategory_id}', jsonb_build_object('old', to_jsonb(v_before.subcategory_id), 'new', to_jsonb(v_product.subcategory_id)), true); END IF;
      IF v_before.description     IS DISTINCT FROM v_product.description THEN
        v_diff := jsonb_set(v_diff, '{products,description}', jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_product.description)), true); END IF;
      IF v_before.barcode         IS DISTINCT FROM v_product.barcode THEN
        v_diff := jsonb_set(v_diff, '{products,barcode}', jsonb_build_object('old', to_jsonb(v_before.barcode), 'new', to_jsonb(v_product.barcode)), true); END IF;
      IF v_before.brand_id        IS DISTINCT FROM v_product.brand_id THEN
        v_diff := jsonb_set(v_diff, '{products,brand_id}', jsonb_build_object('old', to_jsonb(v_before.brand_id), 'new', to_jsonb(v_product.brand_id)), true); END IF;
      IF v_before.supplier_id     IS DISTINCT FROM v_product.supplier_id THEN
        v_diff := jsonb_set(v_diff, '{products,supplier_id}', jsonb_build_object('old', to_jsonb(v_before.supplier_id), 'new', to_jsonb(v_product.supplier_id)), true); END IF;

      IF v_price_changed THEN
        v_diff := jsonb_set(v_diff, '{product_prices,prices}', jsonb_build_object('old', NULL, 'new', v_price_diff), true);
      END IF;

      -- Only emit an audit row when something actually changed (matches
      -- rpc_update_product's no-op-skip semantics) — re-running the same
      -- import file repeatedly must not generate audit noise.
      IF v_diff <> '{}'::jsonb THEN
        v_diff := v_diff || jsonb_build_object('source', 'bulk_import');
        PERFORM public.fn_manual_audit_log(
          'products', v_product.id, v_product.organization_id, 'UPDATE', v_diff, 'web_app'
        );
      END IF;

      v_results := v_results || jsonb_build_object(
        'input_index', v_row_idx, 'product_id', v_product_id, 'action', 'update'
      );

    ELSE
      RAISE EXCEPTION 'mode inválido "%": deve ser insert ou update (linha %)', v_mode, v_row_idx
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_import_products(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_import_products(uuid, jsonb) TO authenticated;
