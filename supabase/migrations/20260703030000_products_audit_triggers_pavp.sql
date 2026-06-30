-- Products Audit Triggers — Wave 1 supplement: product_attribute_value_prices
-- 2026-07-03 | Module: Products | Wave: 1-supplement (DB-PROD-001)
-- Forward-only migration. Do not fold into the baseline.
--
-- Corrects DB-PROD-001 (MEDIUM): product_attribute_value_prices had 4 RLS policies
-- in Wave 0 but no audit trigger. This migration closes that gap.
--
-- Sections:
--   1. fn_audit_product_attribute_value_prices()  — satellite function
--   2. Trigger registration (DROP IF EXISTS + CREATE, idempotent)
--   3. REVOKE/GRANT for the new function
--
-- Follows the exact same conventions as fn_audit_product_attribute_values()
-- (20260703010000_products_audit_triggers.sql):
--   • SECURITY DEFINER + pinned search_path = public, pg_temp
--   • Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   • UPDATE rows skipped when only noise columns changed
--   • Any exception swallowed so the audit trigger NEVER blocks originating DML
--   • changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Prerequisites: 20260703010000_products_audit_triggers.sql (Wave 1)
--
-- Schema of product_attribute_value_prices (from baseline):
--   id uuid, attribute_id uuid NOT NULL, value_option text NOT NULL,
--   price numeric, organization_id uuid (NULLABLE),
--   created_at timestamptz, updated_at timestamptz,
--   product_id uuid (NULLABLE), price_context_id uuid,
--   cost_impact numeric(12,4), is_available boolean,
--   sort_order integer, category_id uuid
--
-- organization_id resolution strategy (two-tier):
--   1. Use organization_id directly if NOT NULL (present on most rows).
--   2. Fall back to product_id → products.organization_id when organization_id IS NULL
--      and product_id IS NOT NULL.
--   3. Skip silently if both are NULL (global catalog row, no tenant context).
--
-- entity_id resolution:
--   When resolving via product_id (fallback), entity_id = products.id, grouping audit
--   rows under the parent product entity timeline (consistent with fn_audit_product_prices
--   and fn_audit_product_attribute_values).
--   When resolving directly from organization_id (no product_id), entity_id = the row's
--   own id (no better anchor available).
--
-- Noise columns excluded from UPDATE diff:
--   'updated_at', 'created_at'


-- ============================================================
-- 1. fn_audit_product_attribute_value_prices()
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_product_attribute_value_prices()
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
  v_row_json       jsonb;
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

  -- ── Snapshot the relevant row side ──────────────────────────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_row_json := COALESCE(to_jsonb(NEW), to_jsonb(OLD));

  -- ── Tier-1: organization_id directly on the row ──────────────────────────
  v_org_id := (v_row_json ->> 'organization_id')::uuid;

  IF v_org_id IS NOT NULL THEN
    -- entity_id: prefer product_id as anchor; fall back to own row id.
    v_entity_id := COALESCE(
      (v_row_json ->> 'product_id')::uuid,
      (v_row_json ->> 'id')::uuid
    );
  ELSE
    -- ── Tier-2: resolve via product_id → products ─────────────────────────
    v_product_id := (v_row_json ->> 'product_id')::uuid;

    IF v_product_id IS NOT NULL THEN
      SELECT p.organization_id, p.id
      INTO   v_org_id, v_entity_id
      FROM   public.products p
      WHERE  p.id = v_product_id
      LIMIT  1;
    END IF;
  END IF;

  -- Cannot determine org — skip silently (global catalog row, no tenant context).
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

REVOKE ALL ON FUNCTION public.fn_audit_product_attribute_value_prices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_attribute_value_prices() TO service_role;


-- ============================================================
-- 2. Trigger registration
-- ============================================================
-- Fires AFTER the DML so it sees the committed row state.
-- DROP IF EXISTS + CREATE for idempotent re-runs (Postgres 13 has no
-- CREATE OR REPLACE TRIGGER).

DROP TRIGGER IF EXISTS trg_audit_product_attribute_value_prices
  ON public.product_attribute_value_prices;

CREATE TRIGGER trg_audit_product_attribute_value_prices
  AFTER INSERT OR UPDATE OR DELETE ON public.product_attribute_value_prices
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_product_attribute_value_prices();
