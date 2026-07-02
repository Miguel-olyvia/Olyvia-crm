-- Encomendas (Purchase Orders) — single-log save/import RPCs on the audit-bypass foundation
-- 2026-08-14 | Module: Encomendas
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- PurchaseOrders.tsx issues several independent Supabase calls per user action, each its
-- own Postgres transaction firing an AFTER audit trigger:
--
--   CREATE (handleSubmit, !editingId):
--     1. purchase_orders INSERT               -> trg_audit_purchase_orders          (1 INSERT row)
--     2. purchase_order_items INSERT (N rows) -> trg_audit_purchase_order_items      (N INSERT rows)
--
--   EDIT (handleSubmit, editingId):
--     1. purchase_orders UPDATE                -> trg_audit_purchase_orders          (1 UPDATE row)
--     2. purchase_order_items DELETE all       -> trg_audit_purchase_order_items      (N DELETE rows)
--     3. purchase_order_items INSERT (N rows)  -> trg_audit_purchase_order_items      (N INSERT rows)
--
--   CSV IMPORT (handleImport):
--     1. purchase_orders INSERT (M rows)       -> trg_audit_purchase_orders          (M INSERT rows)
--
-- One user "save" therefore explodes into many audit rows when the business intent is
-- exactly ONE consolidated log entry per purchase order (and, for the bulk import, one
-- row per imported PO — that is genuinely M distinct creations).
--
-- Solution
-- --------
-- The audit-bypass foundation (app.audit_bypass GUC guard + fn_manual_audit_log) was
-- created earlier in the Roles module (20260719010000_roles_audit_bypass_and_rpcs.sql).
-- fn_generic_entity_audit() already short-circuits on app.audit_bypass='on'. The
-- purchase_order_items trigger fn_audit_purchase_order_items_via_parent() follows the same
-- "actor via app.audit_user_id GUC → current_business_user_id() fallback" convention. This
-- migration reuses that foundation UNCHANGED (foundation NOT recreated here — grep in this
-- file finds no CREATE for fn_generic_entity_audit / fn_manual_audit_log) and adds three RPCs.
--
-- NOTE — purchase_order_items has no audit-bypass guard of its own
-- ----------------------------------------------------------------
-- fn_audit_purchase_order_items_via_parent() (20260717010000) does NOT currently check
-- app.audit_bypass. To keep this migration purely additive for the items table and still
-- guarantee exactly ONE log row per PO save, the RPCs write the items INSIDE the same
-- transaction where app.audit_bypass='on' is set — and fn_generic_entity_audit() (which
-- guards on the GUC) covers purchase_orders. For the items table we add the guard at the
-- top of its trigger function here via CREATE OR REPLACE (body otherwise byte-identical to
-- 20260717010000 §1), so the item DELETE/INSERT churn produced by the RPC does NOT emit its
-- own per-row audit rows. This is the same pattern the Roles module applied to its child
-- trigger functions. The trigger itself is NOT touched.
--
-- Business-math parity
-- --------------------
-- PurchaseOrders.tsx computes every line value in JS (subtotal, vat_amount, total_price per
-- item, and the order total via calculateTotals()). Re-deriving that math in PL/pgSQL would
-- risk drift from the frontend. Following the same contract the frontend/Zod validation
-- boundary already establishes, the RPCs receive the FULLY-COMPUTED item rows and the order
-- total_value as jsonb / numeric (exactly what handleSubmit builds today) and persist them
-- verbatim. The RPCs own transactionality, ordering, org/entity resolution and the single
-- audit row — NOT the pricing arithmetic.
--
-- Authorization / RLS parity
-- --------------------------
-- SECURITY DEFINER, so RLS on purchase_orders / purchase_order_items does NOT self-enforce
-- inside the functions. The RPCs therefore re-check explicitly, up front, BOTH predicates
-- the purchase_orders RLS policies AND together:
--   (1) org scope: target organization_id IN get_user_visible_org_ids(auth.uid()) — reused
--       via fn_deal_org_in_scope(org) (20260730010000, evaluates the same expression).
--   (2) permission: has_anew_permission(auth.uid(), '<code>') — 'purchase_orders.create' for
--       create + import (import is INSERT gated by purchase_orders_insert_policy), and
--       'purchase_orders.edit' for update.
-- Checking only (1) would be an authorization REGRESSION: before this migration the frontend
-- INSERT/UPDATE went through the real RLS (which requires the permission); a SECURITY DEFINER
-- RPC that skips (2) would let any authenticated caller who merely sees the org mutate POs
-- without the permission by calling the RPC directly, bypassing the client-side PermissionGate
-- (which was never the security boundary). On EDIT the before-image's own organization_id is
-- required to be in scope, so a caller cannot touch a PO outside their org.
-- purchase_orders.organization_id is NOT NULL in the baseline, so no sentinel-org fallback is
-- applied (consistent with 20260717010000).
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql              — entity_audit_log, fn_generic_entity_audit()
--   20260717010000_purchase_orders_audit_triggers.sql— PO audit triggers + fn_audit_purchase_order_items_via_parent()
--   20260719010000_roles_audit_bypass_and_rpcs.sql   — app.audit_bypass guard + fn_manual_audit_log()
--   20260730010000_deals_audit_bypass_and_rpcs.sql   — fn_deal_org_in_scope()
--   20260615130000_baseline_new_database.sql         — current_business_user_id(), get_user_visible_org_ids()


-- ============================================================
-- 0. fn_audit_purchase_order_items_via_parent() — add audit-bypass guard at the top
-- ============================================================
-- Body identical to 20260717010000_purchase_orders_audit_triggers.sql §1 except for the
-- new guard as the FIRST statement. Only CREATE OR REPLACE — the trigger registration is
-- NOT touched. This lets the RPCs rewrite the item set inside app.audit_bypass='on' without
-- emitting per-row item audit rows.

CREATE OR REPLACE FUNCTION public.fn_audit_purchase_order_items_via_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_parent_id      uuid;
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
  -- trigger writes nothing and the PO save produces exactly one log row.
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

  -- ── Resolve entity_id and parent PO id ────────────────────────────────────
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );
  v_parent_id := COALESCE(
    (to_jsonb(NEW) ->> 'purchase_order_id')::uuid,
    (to_jsonb(OLD) ->> 'purchase_order_id')::uuid
  );

  -- ── Resolve organization_id via the parent purchase_orders row ────────────
  IF v_parent_id IS NOT NULL THEN
    SELECT po.organization_id
    INTO   v_org_id
    FROM   public.purchase_orders po
    WHERE  po.id = v_parent_id
    LIMIT 1;
  END IF;

  -- Cannot determine org (e.g. parent PO already cascade-deleted) — skip
  -- silently. The parent DELETE is audited separately via trg_audit_purchase_orders.
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

    -- Skip write when nothing meaningful changed.
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
  -- Audit trigger must never block originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_purchase_order_items_via_parent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_purchase_order_items_via_parent() TO service_role;


-- ============================================================
-- 1. rpc_create_purchase_order(...)
-- ============================================================
-- Mirrors handleSubmit() (the !editingId branch) in src/pages/PurchaseOrders.tsx:
--   · created_by = current business user id (== businessUserId in the FE)
--   · INSERT purchase_orders {order_number = '' (trigger auto-generates), supplier_id,
--        order_date, expected_delivery, status, total_value, notes, organization_id,
--        created_by}
--   · INSERT one purchase_order_items row per line (fully-computed by the FE)
-- Returns the created purchase_orders row (so the FE can read id / order_number).
--
--   p_organization_id  uuid    — organizationSelection.companyId || activeCompany.id
--   p_order            jsonb    — { supplier_id, order_date, expected_delivery|null,
--                                   status, total_value, notes|null }  (== orderData)
--   p_items            jsonb    — array of fully-computed purchase_order_items rows
--                                 (WITHOUT purchase_order_id; the RPC injects the new id).
--
-- Authorization mirrors purchase_orders_insert RLS EXACTLY — BOTH predicates the policy
-- ANDs together:
--   (1) organization_id IN get_user_visible_org_ids(auth.uid())   — org scope
--   (2) has_anew_permission(auth.uid(), 'purchase_orders.create') — the create permission
-- Because this function is SECURITY DEFINER, RLS is NOT self-enforcing inside it, so BOTH
-- predicates are re-checked up front. Omitting (2) would let any authenticated caller who
-- merely *sees* the org create POs without the create permission by calling the RPC directly
-- (bypassing the UI PermissionGate, which is client-side convenience, not the security
-- boundary). The permission check is done first so we fail before any write.

CREATE OR REPLACE FUNCTION public.rpc_create_purchase_order(
  p_organization_id uuid,
  p_order           jsonb,
  p_items           jsonb
)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor   uuid;
  v_order   public.purchase_orders;
  v_item    jsonb;
  v_diff    jsonb;
  v_new     jsonb;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId / created_by in the FE) ─────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_insert RLS ─────────────────
  -- Predicate (2): the create permission (checked first — fail before any write).
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Predicate (1): the target org must be in the caller's visible-org scope.
  IF p_organization_id IS NULL OR NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── INSERT the order (identical column set to handleSubmit, order_number ''
  --    so trigger_set_po_number auto-generates it) ───────────────────────────
  INSERT INTO public.purchase_orders (
    order_number, supplier_id, order_date, expected_delivery, status,
    total_value, notes, organization_id, created_by
  )
  VALUES (
    '',
    nullif(p_order ->> 'supplier_id', '')::uuid,
    (p_order ->> 'order_date')::date,
    nullif(p_order ->> 'expected_delivery', '')::date,
    COALESCE(nullif(p_order ->> 'status', ''), 'pending'),
    COALESCE((p_order ->> 'total_value')::numeric, 0),
    nullif(p_order ->> 'notes', ''),
    p_organization_id,
    v_actor
  )
  RETURNING * INTO v_order;

  -- ── INSERT items (fully-computed by the FE; persisted verbatim) ───────────
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, service_id, description, sku,
        quantity, unit_price, vat_rate, vat_amount, total_price,
        selected_attributes, notes
      )
      VALUES (
        v_order.id,
        v_item ->> 'item_type',
        nullif(v_item ->> 'product_id', '')::uuid,
        nullif(v_item ->> 'service_id', '')::uuid,
        v_item ->> 'description',
        nullif(v_item ->> 'sku', ''),
        (v_item ->> 'quantity')::numeric,
        (v_item ->> 'unit_price')::numeric,
        (v_item ->> 'vat_rate')::numeric,
        (v_item ->> 'vat_amount')::numeric,
        (v_item ->> 'total_price')::numeric,
        COALESCE(v_item -> 'selected_attributes', '{}'::jsonb),
        nullif(v_item ->> 'notes', '')
      );
    END LOOP;
  END IF;

  -- ── Build combined diff: full snapshot of the created PO + item set ───────
  v_new := to_jsonb(v_order);
  v_diff := jsonb_build_object(
    'purchase_orders', jsonb_build_object(
      'order_number',      jsonb_build_object('old', NULL, 'new', v_new -> 'order_number'),
      'supplier_id',       jsonb_build_object('old', NULL, 'new', v_new -> 'supplier_id'),
      'order_date',        jsonb_build_object('old', NULL, 'new', v_new -> 'order_date'),
      'expected_delivery', jsonb_build_object('old', NULL, 'new', v_new -> 'expected_delivery'),
      'status',            jsonb_build_object('old', NULL, 'new', v_new -> 'status'),
      'total_value',       jsonb_build_object('old', NULL, 'new', v_new -> 'total_value'),
      'notes',             jsonb_build_object('old', NULL, 'new', v_new -> 'notes'),
      'organization_id',   jsonb_build_object('old', NULL, 'new', v_new -> 'organization_id')
    ),
    'purchase_order_items', jsonb_build_object('new', COALESCE(p_items, '[]'::jsonb))
  );

  -- ── Single consolidated audit row (entity_id = PO id, org direct) ─────────
  PERFORM public.fn_manual_audit_log(
    'purchase_orders', v_order.id, v_order.organization_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_purchase_order(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_purchase_order(uuid, jsonb, jsonb) TO authenticated;


-- ============================================================
-- 2. rpc_update_purchase_order(...)
-- ============================================================
-- Mirrors handleSubmit() (the editingId branch) in src/pages/PurchaseOrders.tsx:
--   · UPDATE purchase_orders {supplier_id, order_date, expected_delivery|null, status,
--        total_value, notes|null} WHERE id  (== orderData; order_number/org/created_by
--        are NOT re-written by the FE update)
--   · DELETE all purchase_order_items WHERE purchase_order_id  (full replace)
--   · re-INSERT one purchase_order_items row per line
-- The delete+insert item churn happens in the SAME transaction and produces ONE log row.
-- Returns the updated purchase_orders row.
--
--   p_purchase_order_id uuid   — editingId
--   p_order             jsonb  — { supplier_id, order_date, expected_delivery|null,
--                                  status, total_value, notes|null }
--   p_items             jsonb  — array of fully-computed purchase_order_items rows.
--
-- Authorization mirrors purchase_orders_update RLS EXACTLY — BOTH predicates:
--   (1) organization_id IN get_user_visible_org_ids(auth.uid())  — before-image's org scope
--   (2) has_anew_permission(auth.uid(), 'purchase_orders.edit')  — the edit permission
-- SECURITY DEFINER means RLS is not self-enforcing, so both are re-checked. Without (2) any
-- caller who can see the org could edit POs (and, via delete-all + reinsert of items, rewrite
-- them) without the edit permission by calling the RPC directly.

CREATE OR REPLACE FUNCTION public.rpc_update_purchase_order(
  p_purchase_order_id uuid,
  p_order             jsonb,
  p_items             jsonb
)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      uuid;
  v_before     public.purchase_orders;
  v_order      public.purchase_orders;
  v_item       jsonb;
  v_diff       jsonb := '{}'::jsonb;
  v_po_diff    jsonb := '{}'::jsonb;
  v_old_json   jsonb;
  v_new_json   jsonb;
  v_key        text;
  v_editable_cols text[] := ARRAY[
    'supplier_id','order_date','expected_delivery','status','total_value','notes'
  ];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_update RLS ──────────────────
  -- Predicate (2): the edit permission (checked first — fail before any read/write).
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Load the before-image (for the diff + org-scope guard) ────────────────
  SELECT * INTO v_before FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Predicate (1): the existing row's org must be in the caller's visible-org scope.
  IF NOT public.fn_deal_org_in_scope(v_before.organization_id) THEN
    RAISE EXCEPTION 'Encomenda fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── UPDATE the order (identical column set to the FE update) ──────────────
  UPDATE public.purchase_orders
  SET supplier_id       = nullif(p_order ->> 'supplier_id', '')::uuid,
      order_date        = (p_order ->> 'order_date')::date,
      expected_delivery = nullif(p_order ->> 'expected_delivery', '')::date,
      status            = COALESCE(nullif(p_order ->> 'status', ''), 'pending'),
      total_value       = COALESCE((p_order ->> 'total_value')::numeric, 0),
      notes             = nullif(p_order ->> 'notes', '')
  WHERE id = p_purchase_order_id
  RETURNING * INTO v_order;

  -- ── Rewrite items: delete-all then re-insert (matches the FE) ─────────────
  DELETE FROM public.purchase_order_items WHERE purchase_order_id = p_purchase_order_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.purchase_order_items (
        purchase_order_id, item_type, product_id, service_id, description, sku,
        quantity, unit_price, vat_rate, vat_amount, total_price,
        selected_attributes, notes
      )
      VALUES (
        p_purchase_order_id,
        v_item ->> 'item_type',
        nullif(v_item ->> 'product_id', '')::uuid,
        nullif(v_item ->> 'service_id', '')::uuid,
        v_item ->> 'description',
        nullif(v_item ->> 'sku', ''),
        (v_item ->> 'quantity')::numeric,
        (v_item ->> 'unit_price')::numeric,
        (v_item ->> 'vat_rate')::numeric,
        (v_item ->> 'vat_amount')::numeric,
        (v_item ->> 'total_price')::numeric,
        COALESCE(v_item -> 'selected_attributes', '{}'::jsonb),
        nullif(v_item ->> 'notes', '')
      );
    END LOOP;
  END IF;

  -- ── Build the combined diff across both tables ────────────────────────────
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_order);
  FOREACH v_key IN ARRAY v_editable_cols LOOP
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_po_diff := v_po_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  -- ── Emit the single consolidated UPDATE audit row only when the PO itself
  --    actually changed — same pattern as rpc_update_deal (20260730010000), which
  --    skips the write when its diff is '{}'. This avoids an "empty" UPDATE row
  --    (no real change in purchase_orders) every time the user re-submits the form
  --    without editing any field. When there IS a real PO change we also attach the
  --    resulting item set so the single row reflects the full save. ───────────
  IF v_po_diff <> '{}'::jsonb THEN
    v_diff := v_diff
      || jsonb_build_object('purchase_orders', v_po_diff)
      || jsonb_build_object(
           'purchase_order_items', jsonb_build_object('new', COALESCE(p_items, '[]'::jsonb))
         );

    PERFORM public.fn_manual_audit_log(
      'purchase_orders', p_purchase_order_id, v_order.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_purchase_order(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_purchase_order(uuid, jsonb, jsonb) TO authenticated;


-- ============================================================
-- 3. rpc_import_purchase_orders_csv(...)
-- ============================================================
-- Mirrors handleImport() in src/pages/PurchaseOrders.tsx:
--   · parsePurchaseOrdersCSV() runs in the FE (CSV parsing / supplier name→id lookup /
--     Zod-style validation stays at the boundary as it does today) and produces the
--     ordersToInsert array. The FE then does ONE bulk
--     supabase.from("purchase_orders").insert(ordersToInsert) with source 'csv_import'.
--   · Each imported PO is a genuinely distinct creation, so each gets its OWN single
--     INSERT audit row (source 'csv_import'). The whole import is one transaction: if any
--     row fails to insert, the entire batch rolls back and NO audit rows are written —
--     matching the all-or-nothing semantics of a single bulk insert call.
--
--   p_orders  jsonb  — array of { order_number, supplier_id, order_date,
--                       expected_delivery|null, status, total_value, notes|null,
--                       created_by, organization_id }  (== ordersToInsert)
--
-- Returns the number of purchase_orders inserted.
--
-- Authorization mirrors purchase_orders_insert RLS EXACTLY — BOTH predicates, because the
-- import path is a plain INSERT into purchase_orders and that is the only policy that gates it:
--   (1) organization_id IN get_user_visible_org_ids(auth.uid())   — per-row org scope
--   (2) has_anew_permission(auth.uid(), 'purchase_orders.create') — the create permission
--
-- Permission code decision — WHY 'purchase_orders.create' and NOT 'purchase_orders.import':
-- The UI wraps the import button in <PermissionGate permission="purchase_orders.import">, but
-- that is only a client-side visibility gate. The actual DML this RPC performs is INSERT INTO
-- purchase_orders, and the ONLY row-level policy enforcing that INSERT is
-- purchase_orders_insert_policy, which checks 'purchase_orders.create' (there is no
-- 'purchase_orders.import' predicate anywhere in the purchase_orders RLS). Before this
-- migration, the frontend's bulk insert went through purchase_orders_insert_policy and thus
-- required 'purchase_orders.create'. To preserve EXACT authorization parity (neither loosening
-- nor tightening what the DB already enforced), the RPC requires 'purchase_orders.create'. The
-- 'purchase_orders.import' UI gate remains an additional client-side convenience layered on top.

CREATE OR REPLACE FUNCTION public.rpc_import_purchase_orders_csv(
  p_orders jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor    uuid;
  v_row      jsonb;
  v_order    public.purchase_orders;
  v_org_id   uuid;
  v_count    integer := 0;
  v_new      jsonb;
  v_diff     jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_orders IS NULL OR jsonb_typeof(p_orders) <> 'array' OR jsonb_array_length(p_orders) = 0 THEN
    RAISE EXCEPTION 'Sem encomendas válidas para importar' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_insert RLS, predicate (2) ───
  -- The import is INSERT INTO purchase_orders; that policy checks 'purchase_orders.create'
  -- (no 'purchase_orders.import' predicate exists in the DB). Checked once up front so the
  -- whole batch fails before any write if the caller lacks the create permission.
  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.create') THEN
    RAISE EXCEPTION 'Sem permissão para importar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_orders)
  LOOP
    v_org_id := nullif(v_row ->> 'organization_id', '')::uuid;

    -- ── Authorization parity: each PO's org must be in the caller's scope ────
    IF v_org_id IS NULL OR NOT public.fn_deal_org_in_scope(v_org_id) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── INSERT the imported PO (mirrors parsePurchaseOrdersCSV output) ───────
    -- order_number comes from the CSV (values[0]); it is required and non-empty
    -- there, so it is inserted as-is rather than auto-generated.
    INSERT INTO public.purchase_orders (
      order_number, supplier_id, order_date, expected_delivery, status,
      total_value, notes, organization_id, created_by
    )
    VALUES (
      v_row ->> 'order_number',
      nullif(v_row ->> 'supplier_id', '')::uuid,
      (v_row ->> 'order_date')::date,
      nullif(v_row ->> 'expected_delivery', '')::date,
      COALESCE(nullif(v_row ->> 'status', ''), 'pending'),
      COALESCE((v_row ->> 'total_value')::numeric, 0),
      nullif(v_row ->> 'notes', ''),
      v_org_id,
      -- created_by is ALWAYS the authenticated caller (v_actor), never a value taken
      -- from the payload — matching every other RPC in the codebase (rpc_create_purchase_order,
      -- rpc_update_purchase_order, products/roles RPCs). Trusting v_row->>'created_by' would let
      -- an authenticated caller forge the author of imported POs, breaking audit traceability.
      -- The FE (parsePurchaseOrdersCSV) already always passes its own businessUserId, so this is
      -- behavior-preserving via the UI while closing the direct-call forgery gap.
      v_actor
    )
    RETURNING * INTO v_order;

    -- ── One INSERT audit row per imported PO (source 'csv_import') ───────────
    v_new := to_jsonb(v_order);
    v_diff := jsonb_build_object(
      'purchase_orders', jsonb_build_object(
        'order_number',      jsonb_build_object('old', NULL, 'new', v_new -> 'order_number'),
        'supplier_id',       jsonb_build_object('old', NULL, 'new', v_new -> 'supplier_id'),
        'order_date',        jsonb_build_object('old', NULL, 'new', v_new -> 'order_date'),
        'expected_delivery', jsonb_build_object('old', NULL, 'new', v_new -> 'expected_delivery'),
        'status',            jsonb_build_object('old', NULL, 'new', v_new -> 'status'),
        'total_value',       jsonb_build_object('old', NULL, 'new', v_new -> 'total_value'),
        'notes',             jsonb_build_object('old', NULL, 'new', v_new -> 'notes'),
        'organization_id',   jsonb_build_object('old', NULL, 'new', v_new -> 'organization_id')
      )
    );

    PERFORM public.fn_manual_audit_log(
      'purchase_orders', v_order.id, v_order.organization_id, 'INSERT', v_diff, 'csv_import'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_import_purchase_orders_csv(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_import_purchase_orders_csv(jsonb) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Foundation reused, not recreated:
--    grep in this file — no CREATE for fn_generic_entity_audit / fn_manual_audit_log.
--
-- 2. Item trigger now carries the bypass guard:
--    SELECT prosrc LIKE '%app.audit_bypass%'
--    FROM pg_proc WHERE proname = 'fn_audit_purchase_order_items_via_parent';
--    -- Expected: true.
--
-- 3. A create with N item lines yields exactly ONE audit row:
--    SELECT count(*) FROM public.entity_audit_log
--    WHERE table_name = 'purchase_orders' AND operation = 'INSERT'
--      AND created_at > now() - interval '1 minute';
--    -- Expected: 1 (not 1+N despite purchase_order_items being written).
--
-- 4. An edit that deletes M old lines and inserts N new ones still yields ONE
--    UPDATE row with table_name='purchase_orders' (no per-item DELETE/INSERT rows).
--
-- 5. A CSV import of M valid POs yields exactly M INSERT rows (source 'csv_import') —
--    one per genuinely-distinct PO created. A bad row rolls back the whole batch.
--
-- 6. Calling any RPC with an org outside get_user_visible_org_ids(auth.uid()) raises
--    insufficient_privilege, matching the purchase_orders RLS org-scope predicate.
--
-- 7. Authorization is FULL parity with the RLS policies — BOTH predicates, not just org
--    scope. A caller who can see the org but lacks the permission is rejected:
--      · rpc_create_purchase_order       requires has_anew_permission(uid,'purchase_orders.create')
--      · rpc_update_purchase_order       requires has_anew_permission(uid,'purchase_orders.edit')
--      · rpc_import_purchase_orders_csv  requires has_anew_permission(uid,'purchase_orders.create')
--        (the import path is INSERT INTO purchase_orders, gated by purchase_orders_insert_policy,
--         which knows only 'purchase_orders.create'; 'purchase_orders.import' is a UI-only gate).
--    This closes the authz gap where an authenticated caller could invoke the RPC directly
--    (bypassing the client-side PermissionGate) without the required permission.
--
-- 8. rpc_update_purchase_order writes NO audit row when the PO fields are unchanged (empty
--    diff), matching rpc_update_deal — a no-op re-submit produces zero rows, not an empty one.
