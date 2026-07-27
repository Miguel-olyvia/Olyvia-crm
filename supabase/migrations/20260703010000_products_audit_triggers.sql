-- Products Audit Triggers — Wave 1
-- 2026-07-03 | Module: Products | Wave: 1 (audit trigger functions + registrations)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_product_prices()        — satellite: org+entity via product_id → products
--   2. fn_audit_product_attribute_values() — satellite: org+entity via product_id → products
--   3. Trigger registrations (DROP IF EXISTS + CREATE, idempotent)
--   4. REVOKE/GRANT for new functions
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and fn_audit_service_prices()
-- (20260702010000_services_audit_triggers.sql):
--   • SECURITY DEFINER + pinned search_path = public, pg_temp
--   • Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   • UPDATE rows skipped when only noise columns changed
--   • Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   • changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Prerequisites: 20260703000000_products_security_fixes.sql (Wave 0)
--   Wave 0 must be applied first: duplicate trigger dropped, GUC-first actor resolution
--   in log_product_price_change() ensures consistent attribution across both history tables.
--
-- Tables audited:
--   products                — fn_generic_entity_audit()              Strategy A (org_id nullable,
--                             fn body skips silently when org IS NULL — acceptable for PROD-010)
--   product_prices          — fn_audit_product_prices()              satellite via product_id
--   product_organizations   — fn_generic_entity_audit()              Strategy A (org_id NOT NULL)
--   product_attribute_values — fn_audit_product_attribute_values()  satellite via product_id
--
-- Tables NOT audited HERE (see supplement migration for the gap fix):
--   product_attribute_value_prices — DB-PROD-001: covered by
--     20260703030000_products_audit_triggers_pavp.sql (Wave 1 supplement).
--     Has 4 RLS policies but was missing an audit trigger in this Wave 1 file.
--
-- Tables NOT audited (intentional):
--   product_price_history   — this IS a functional history/log table itself. Adding an audit
--     trigger on it would create a write-loop (audit of audit). The functional price history
--     (user-visible in ProductPriceHistoryDialog.tsx) coexists with entity_audit_log as two
--     separate layers:
--       • product_price_history = functional price history, user-facing
--       • entity_audit_log      = central audit trail, compliance-facing
--     The product_price_change_trigger on product_prices that writes to product_price_history
--     fires alongside trg_audit_product_prices — dual-trigger coexistence is intentional,
--     same pattern as services (see fn_audit_service_prices() header in 20260702010000).
--
-- Dual-trigger coexistence on product_prices UPDATE:
--   • product_price_change_trigger (existing, AFTER UPDATE, only fires when price changes)
--     → writes to product_price_history (functional, user-visible)
--   • trg_audit_product_prices (new, AFTER INSERT OR UPDATE OR DELETE)
--     → writes to entity_audit_log (compliance, all field changes)
--   Execution order: product_price_change_trigger fires first (alphabetically earlier).
--   Both triggers are SECURITY DEFINER and swallow exceptions independently.


-- ============================================================
-- 1. fn_audit_product_prices()
-- ============================================================
-- Handles: product_prices
--
-- product_prices has NO organization_id column (confirmed: schema has only
-- product_id, price_type, price, currency, vat_rate, valid_from, valid_to,
-- created_by, created_at, updated_at, price_promo).
--
-- org and entity are resolved via: JOIN public.products ON products.id = product_id
--   organization_id → products.organization_id
--   entity_id       → products.id  (the parent product's id, NOT the price row id)
--
-- Using the parent product's id as entity_id groups price-change audit rows
-- under the product entity timeline in the UI — consistent with entity_audit_log intent.
--
-- Noise columns excluded from UPDATE diff:
--   'updated_at', 'created_at'

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
-- 2. fn_audit_product_attribute_values()
-- ============================================================
-- Handles: product_attribute_values
--
-- product_attribute_values has NO organization_id column. It has:
--   id, product_id, attribute_id, value_text, value_number, value_bool,
--   created_at, updated_at.
--
-- org and entity are resolved via: JOIN public.products ON products.id = product_id
--   organization_id → products.organization_id
--   entity_id       → products.id  (the parent product's id)
--
-- This is critical for traceability of product attribute changes as identified in the
-- audit plan (PROD-002 / PROD-008). Old/new attribute values are captured in
-- changed_fields for UPDATE operations.
--
-- Noise columns excluded from UPDATE diff:
--   'updated_at', 'created_at'

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
-- 3. Trigger registrations
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE pattern for idempotent migrations (Postgres 13
-- does not support CREATE OR REPLACE TRIGGER).

-- products — Strategy A: organization_id nullable on the products table.
-- fn_generic_entity_audit() skips silently when organization_id is NULL
-- (see baseline fn body: "cannot determine org — skip silently").
-- entity_id falls back to the row's own id (no entity_id column on products).
DROP TRIGGER IF EXISTS trg_audit_products ON public.products;
CREATE TRIGGER trg_audit_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- product_prices — satellite via product_id → products.
-- NOTE: product_price_change_trigger (existing, AFTER UPDATE only, fires when price changes)
-- also fires on UPDATE of product_prices. Both triggers are intentional and serve different
-- purposes — see fn_audit_product_prices() header comment above.
-- product_price_change_trigger fires first (alphabetically earlier name).
DROP TRIGGER IF EXISTS trg_audit_product_prices ON public.product_prices;
CREATE TRIGGER trg_audit_product_prices
  AFTER INSERT OR UPDATE OR DELETE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_product_prices();

-- product_organizations — Strategy A: organization_id NOT NULL (direct column).
-- NOTE: entity_id on product_organizations rows will be the association row's own id
-- (no entity_id column exists on this table). Audit rows are grouped by the association
-- row id, not by a CRM product entity id. Same acceptable pattern as service_organizations
-- in 20260702010000.
DROP TRIGGER IF EXISTS trg_audit_product_organizations ON public.product_organizations;
CREATE TRIGGER trg_audit_product_organizations
  AFTER INSERT OR UPDATE OR DELETE ON public.product_organizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- product_attribute_values — satellite via product_id → products.
-- Critical for traceability of attribute changes (value_text, value_number, value_bool).
DROP TRIGGER IF EXISTS trg_audit_product_attribute_values ON public.product_attribute_values;
CREATE TRIGGER trg_audit_product_attribute_values
  AFTER INSERT OR UPDATE OR DELETE ON public.product_attribute_values
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_product_attribute_values();


-- ============================================================
-- 4. Explicit note: product_price_history is NOT audited
-- ============================================================
-- No trigger is created on product_price_history. It is itself a functional
-- history table written by log_product_price_change() (SECURITY DEFINER trigger).
-- Auditing it would create an audit-of-audit write loop.
-- Verify absence:
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'product_price_history'::regclass;
-- Expected: no audit trigger.
