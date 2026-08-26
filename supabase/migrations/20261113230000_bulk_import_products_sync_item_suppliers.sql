-- ============================================================
-- rpc_bulk_import_products: sincronizar item_suppliers (Fase 3 do inventário)
-- ============================================================
-- Achado da Fase 3 do plano de fornecedores múltiplos
-- (plano-fornecedores-multi-stock-execucao.md): esta função continuava a
-- escrever products.supplier_id diretamente (INSERT e UPDATE, linhas
-- originais em 20260830010000) sem nunca criar/atualizar a linha
-- correspondente em item_suppliers. A Fase 1 já trata products.supplier_id
-- como uma cache só-de-leitura, reescrita por
-- fn_item_suppliers_sync_preferred sempre que a fase preferencial de
-- item_suppliers mudar — um produto importado por CSV ficava com o cache
-- preenchido mas SEM linha em item_suppliers, e assim que alguém mexesse
-- manualmente no fornecedor desse produto (ex.: ProductSuppliersDialog), o
-- trigger reescrevia silenciosamente products.supplier_id, apagando o valor
-- vindo do import sem aviso nenhum.
--
-- CORREÇÃO: depois de cada escrita bem-sucedida em products (INSERT ou
-- UPDATE), se a linha trouxer supplier_id, cria/atualiza a linha
-- correspondente em item_suppliers como preferencial — mesmo efeito que o
-- formulário manual de criação já faz (src/pages/Products.tsx). Uma linha
-- SEM supplier_id não mexe em item_suppliers (não se remove uma associação
-- existente só por um import incompleto — mesma filosofia da edição manual,
-- que também deixou de tocar em supplier_id na Fase 2).
--
-- Ordem das duas escritas: primeiro desmarca qualquer OUTRA linha
-- preferencial ativa deste produto (a trigger BEFORE INSERT/UPDATE
-- trg_item_suppliers_preferred_guard, 20261112110000, rejeita
-- is_preferred=true enquanto outra continuar marcada), só depois insere/
-- atualiza a linha alvo como preferencial. Nenhuma outra parte da função
-- (RETURN shape, per-row SAVEPOINT, mode insert/update, preços) foi tocada.
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
  v_sqlerrm      text;
  v_supplier_id  uuid;
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

    -- Each row runs in its own BEGIN/EXCEPTION block, which PL/pgSQL already
    -- backs with an implicit savepoint: a failure here only unwinds this
    -- row's partial writes, never the rows already committed within this
    -- same call (explicit SAVEPOINT/ROLLBACK TO SAVEPOINT are plain-SQL
    -- transaction commands and are not valid inside a PL/pgSQL block).
    BEGIN
      v_mode := v_row ->> 'mode';
      v_row_org := NULLIF(v_row ->> 'organization_id', '')::uuid;

      IF NOT v_is_admin AND v_row_org IS NOT NULL
         AND NOT (v_row_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador (linha %)', v_row_idx
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF v_mode = 'insert' THEN
        -- ── INSERT product ────────────────────────────────────────────────
        -- ON CONFLICT (sku, organization_id) DO UPDATE mirrors the OLD FE's
        -- `.upsert(..., { onConflict: "sku,organization_id" })`: a SKU that
        -- already exists in the DB but is invisible to the caller under RLS
        -- must merge into that row instead of raising a duplicate-key
        -- violation. Audit semantics below treat this path the same as a
        -- fresh insert, matching prior FE behavior.
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

        -- Sincronizar item_suppliers (Fase 3) — ver comentário no topo do
        -- ficheiro. Fila sem supplier_id não mexe em nada.
        v_supplier_id := NULLIF(v_row ->> 'supplier_id', '')::uuid;
        IF v_supplier_id IS NOT NULL THEN
          UPDATE public.item_suppliers
             SET is_preferred = false, updated_at = now()
           WHERE product_id = v_product_id
             AND is_preferred
             AND deleted_at IS NULL
             AND supplier_id <> v_supplier_id;

          INSERT INTO public.item_suppliers
            (organization_id, item_type, product_id, supplier_id, is_preferred, is_active, created_by)
          VALUES
            (v_product.organization_id, 'product', v_product_id, v_supplier_id, true, true, v_actor)
          ON CONFLICT (product_id, supplier_id) DO UPDATE SET
            is_preferred = true,
            is_active    = true,
            deleted_at   = NULL,
            updated_at   = now();
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
          'input_index', v_row_idx, 'status', 'ok', 'product_id', v_product_id, 'action', 'insert'
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

        -- Sincronizar item_suppliers (Fase 3) — ver comentário no topo do
        -- ficheiro. Fila sem supplier_id não mexe em nada.
        v_supplier_id := NULLIF(v_row ->> 'supplier_id', '')::uuid;
        IF v_supplier_id IS NOT NULL THEN
          UPDATE public.item_suppliers
             SET is_preferred = false, updated_at = now()
           WHERE product_id = v_product_id
             AND is_preferred
             AND deleted_at IS NULL
             AND supplier_id <> v_supplier_id;

          INSERT INTO public.item_suppliers
            (organization_id, item_type, product_id, supplier_id, is_preferred, is_active, created_by)
          VALUES
            (v_product.organization_id, 'product', v_product_id, v_supplier_id, true, true, v_actor)
          ON CONFLICT (product_id, supplier_id) DO UPDATE SET
            is_preferred = true,
            is_active    = true,
            deleted_at   = NULL,
            updated_at   = now();
        END IF;

        -- Reconcile prices to exactly match the row's `prices` array: delete
        -- any existing price_type not present in the incoming payload first,
        -- mirroring the OLD FE's delete-then-insert net effect.
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
          'input_index', v_row_idx, 'status', 'ok', 'product_id', v_product_id, 'action', 'update'
        );

      ELSE
        RAISE EXCEPTION 'mode inválido "%": deve ser insert ou update (linha %)', v_mode, v_row_idx
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- The enclosing BEGIN/EXCEPTION block already rolled back this row's
      -- partial writes via its implicit savepoint; every previously
      -- committed row in this same call (and this same transaction) is
      -- left intact.
      GET STACKED DIAGNOSTICS v_sqlerrm = MESSAGE_TEXT;

      v_results := v_results || jsonb_build_object(
        'input_index', v_row_idx,
        'status', 'error',
        'sku', v_row ->> 'sku',
        'error', v_sqlerrm
      );
    END;
  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_import_products(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_import_products(uuid, jsonb) TO authenticated;
