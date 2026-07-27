-- Purchase Orders Audit Triggers — Wave 1
-- 2026-07-17 | Module: Encomendas (Purchase Orders) | Wave: 1 (audit trigger registration)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_purchase_order_items_via_parent() — dedicated trigger function
--      for purchase_order_items. Required because that table has NO
--      organization_id column and its id/entity_id do NOT resolve through the
--      Strategy B/C lookups in fn_generic_entity_audit() (anew_entity_roles /
--      anew_leads / anew_contacts / anew_clients). Using the generic function
--      there would silently skip EVERY item row (line 228-231 of
--      20260625010000_entity_audit_log.sql). The dedicated function resolves
--      organization_id by joining to the parent purchase_orders row.
--   2. Trigger registration for both tables (DROP IF EXISTS + CREATE, idempotent).
--   3. REVOKE/GRANT for the new function.
--   4. Verification notes (not executed).
--
-- This migration follows the exact same conventions as the suppliers, uom,
-- deals, quotes, services and brands audit migrations:
--   · purchase_orders reuses the shared fn_generic_entity_audit()
--     (20260625010000_entity_audit_log.sql) — it carries organization_id
--     directly (Strategy A, line 198-204) and its PK doubles as entity_id
--     (line 182-195). No dedicated function is needed.
--   · purchase_order_items needs a dedicated function only because its
--     organization_id must be resolved through the parent PO.
--
-- Conventions inherited from fn_generic_entity_audit():
--   · SECURITY DEFINER + pinned search_path = public, pg_temp
--   · Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   · UPDATE rows skipped when only noise columns changed
--   · Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   · changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE,
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql — entity_audit_log table + fn_generic_entity_audit()
--
-- Tables audited:
--   purchase_orders       — fn_generic_entity_audit()  Strategy A (organization_id direct).
--                           entity_id falls back to purchase_orders.id (no separate
--                           entity_id column). purchase_orders is strictly org-scoped
--                           (organization_id NOT NULL in baseline), so the sentinel-UUID
--                           pattern used for uom/brands is deliberately NOT applied here.
--   purchase_order_items  — fn_audit_purchase_order_items_via_parent().
--                           organization_id resolved from the parent purchase_orders row.
--                           Covers the EDIT delete-and-recreate churn: the UI replaces the
--                           line set on every save, producing DELETE + INSERT rows in the
--                           audit log so item-level changes are traceable.
--
-- purchase_orders columns (from baseline 20260615130000_baseline_new_database.sql):
--   id, order_number, supplier_id, order_date, expected_delivery, status,
--   total_value, notes, created_by, created_at, updated_at, organization_id,
--   business_unit_id
--
-- purchase_order_items columns (from baseline):
--   id, purchase_order_id, product_id, service_id, item_type, description, sku,
--   quantity, unit_price, total_price, notes, created_at, updated_at, vat_rate,
--   vat_amount, selected_attributes
--
-- Existing triggers (baseline — confirmed):
--   purchase_orders:      trigger_set_po_number (BEFORE INSERT, order_number),
--                         update_purchase_orders_updated_at (BEFORE UPDATE).
--   purchase_order_items: update_purchase_order_items_updated_at (BEFORE UPDATE).
--   No audit trigger exists on either table at this timestamp. DROP IF EXISTS
--   guards below make registration idempotent.
--
-- Tables explicitly NOT covered (do not exist in the schema — confirmed against
-- the baseline): orders, anew_orders. Neither is created nor referenced.
--
-- Gaps addressed:
--   ENC-01 (CRITICAL) — no audit trigger on purchase_orders (module status: partial).
--   ENC-02 (HIGH)     — purchase_order_items line churn (delete+recreate on EDIT) untracked.


-- ============================================================
-- 1. fn_audit_purchase_order_items_via_parent()
-- ============================================================
-- Handles: purchase_order_items
--
-- purchase_order_items has no organization_id column, so organization_id is
-- resolved from the parent purchase_orders row via purchase_order_id. On DELETE
-- the parent PO may already be gone (ON DELETE CASCADE from purchase_orders),
-- in which case the lookup yields NULL and the row is skipped silently — the
-- parent PO DELETE is itself audited via trg_audit_purchase_orders, so no
-- information is lost.
--
-- entity_id = purchase_order_items.id (the row's own id; the table has no
-- separate entity_id column).
--
-- Noise columns excluded from UPDATE diff: 'updated_at', 'created_at'.

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
-- 2. Trigger registration
-- ============================================================
-- Fires AFTER the DML so it sees the committed row state.
-- DROP IF EXISTS + CREATE is idempotent (Postgres 13 does not support
-- CREATE OR REPLACE TRIGGER; DROP+CREATE is portable across Supabase versions).
--
-- Alphabetical execution order (same timing, same event): trg_audit_*
-- sorts after trigger_set_po_number and update_*_updated_at, so the audit
-- trigger sees the final order_number / updated_at values in the row.

DROP TRIGGER IF EXISTS trg_audit_purchase_orders ON public.purchase_orders;
CREATE TRIGGER trg_audit_purchase_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

DROP TRIGGER IF EXISTS trg_audit_purchase_order_items ON public.purchase_order_items;
CREATE TRIGGER trg_audit_purchase_order_items
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_purchase_order_items_via_parent();


-- ============================================================
-- 3. Verification notes (for human review, not executed)
-- ============================================================
-- 1. Confirm both audit triggers are registered:
--
--   SELECT t.tgname, p.proname AS function_name, t.tgenabled, c.relname AS table_name
--   FROM pg_trigger t
--   JOIN pg_proc p  ON p.oid = t.tgfoid
--   JOIN pg_class c ON c.oid = t.tgrelid
--   WHERE c.relname IN ('purchase_orders', 'purchase_order_items')
--     AND t.tgname LIKE 'trg_audit_%'
--   ORDER BY c.relname, t.tgname;
--
-- Expected (2 rows):
--   purchase_order_items | trg_audit_purchase_order_items | fn_audit_purchase_order_items_via_parent | enabled
--   purchase_orders      | trg_audit_purchase_orders      | fn_generic_entity_audit                  | enabled
--
-- 2. Confirm exactly one audit trigger per table:
--
--   SELECT c.relname, count(*)
--   FROM pg_trigger t
--   JOIN pg_class c ON c.oid = t.tgrelid
--   WHERE c.relname IN ('purchase_orders', 'purchase_order_items')
--     AND t.tgname LIKE '%audit%'
--   GROUP BY c.relname;
--
-- Expected: 1 for each table.
--
-- 3. Smoke-test the EDIT delete-and-recreate item churn (run as an authenticated
--    user with the relevant permission in a known org):
--
--   -- Assume an existing PO <po-id>. Simulate the UI EDIT save (replace lines):
--   DELETE FROM public.purchase_order_items WHERE purchase_order_id = '<po-id>';
--   INSERT INTO public.purchase_order_items
--     (purchase_order_id, item_type, product_id, description, quantity, unit_price, total_price)
--   VALUES
--     ('<po-id>', 'product', '<product-id>', 'Replaced line', 2, 10, 20);
--
--   SELECT table_name, operation, entity_id, organization_id
--   FROM public.entity_audit_log
--   WHERE table_name = 'purchase_order_items'
--   ORDER BY created_at DESC
--   LIMIT 5;
--
-- Expected: DELETE rows for the removed lines and an INSERT row for the new
--           line, all carrying the parent PO's organization_id.
