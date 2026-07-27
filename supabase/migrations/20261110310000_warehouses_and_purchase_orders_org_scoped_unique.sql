-- ============================================================
-- Fix 1 — warehouses.code was globally unique instead of per-organization.
-- Mirrors the products.sku fix (products_sku_organization_id_key): drop the
-- global UNIQUE("code") constraint and replace it with a composite
-- UNIQUE(organization_id, code), matching the fact that warehouses are
-- already scoped per organization everywhere else (RLS, FE forms, etc.).
-- ============================================================

ALTER TABLE ONLY "public"."warehouses"
    DROP CONSTRAINT IF EXISTS "warehouses_code_key";

ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_organization_id_code_key" UNIQUE ("organization_id", "code");


-- ============================================================
-- Fix 2(a) — purchase_orders.order_number was globally unique instead of
-- per-organization. Same pattern as Fix 1.
-- ============================================================

ALTER TABLE ONLY "public"."purchase_orders"
    DROP CONSTRAINT IF EXISTS "purchase_orders_order_number_key";

ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_organization_id_order_number_key" UNIQUE ("organization_id", "order_number");


-- ============================================================
-- Fix 2(b) — generate_po_number() computed the next sequence number GLOBALLY
-- (`WHERE order_number LIKE 'PO-' || year_part || '-%'` across ALL orgs).
-- With order_number now scoped per organization, the sequence must be scoped
-- per organization too, otherwise two different orgs racing for the "next"
-- number would collide against the new composite unique constraint above.
--
-- The function signature changes (adds p_organization_id), so the old
-- no-arg overload is dropped and recreated with the new signature. The only
-- caller is trigger_set_po_number → set_po_number(), which is updated below
-- to pass NEW.organization_id (already available on the row being inserted).
-- ============================================================

DROP FUNCTION IF EXISTS "public"."generate_po_number"();

CREATE FUNCTION "public"."generate_po_number"("p_organization_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  new_po_number TEXT;
BEGIN
  -- Get current year
  year_part := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;

  -- Get the next sequence number for this year, SCOPED to the target
  -- organization (order_number uniqueness is now per-org, not global).
  SELECT COALESCE(MAX(
    CASE
      WHEN order_number ~ '^PO-[0-9]{4}-[0-9]+$'
      THEN (regexp_match(order_number, '^PO-[0-9]{4}-([0-9]+)$'))[1]::INTEGER
      ELSE 0
    END
  ), 0) + 1
  INTO sequence_num
  FROM purchase_orders
  WHERE order_number LIKE 'PO-' || year_part || '-%'
    AND organization_id = p_organization_id;

  -- Format: PO-YYYY-NNNN (e.g., PO-2025-0001)
  new_po_number := 'PO-' || year_part || '-' || LPAD(sequence_num::TEXT, 4, '0');

  RETURN new_po_number;
END;
$_$;

GRANT ALL ON FUNCTION "public"."generate_po_number"("uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_po_number"("uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_po_number"("uuid") TO "service_role";


CREATE OR REPLACE FUNCTION "public"."set_po_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_po_number(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;
