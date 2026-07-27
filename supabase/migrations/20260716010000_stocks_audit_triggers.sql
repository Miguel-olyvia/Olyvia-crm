-- Stocks & Inventory Audit Triggers — Wave 1
-- 2026-07-16 | Module: Stocks e Inventário (Stocks & Inventory) | Wave: 1 (audit triggers)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. Trigger registration for stocks (reuses fn_generic_entity_audit()).
--   2. fn_audit_stock_movements_with_sentinel() + guarded trigger registration
--      for stock_movements (only if the table exists in this environment).
--   3. Verification notes (not executed).
--
-- This migration follows the exact same convention as the suppliers, warehouses,
-- deals, quotes, services and brands audit migrations. Where a table carries
-- organization_id directly it reuses the shared fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql); where organization_id is unresolvable
-- it uses a dedicated sentinel-aware function, mirroring
-- fn_audit_locations_with_sentinel() (20260715010000_warehouses_audit_triggers.sql)
-- and fn_audit_uom_with_sentinel() (20260708010000_uom_audit_triggers.sql).
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
--   20260625010000_entity_audit_log.sql       — entity_audit_log table + fn_generic_entity_audit()
--   20260615130000_baseline_new_database.sql   — stocks table
--   20260708010000_uom_audit_triggers.sql      — sentinel pattern precedent
--   20260715010000_warehouses_audit_triggers.sql — sentinel-aware function precedent
--
-- Tables audited:
--   stocks — fn_generic_entity_audit()  Strategy A (organization_id direct).
--            stocks.organization_id is NOT NULL (baseline line 12233), so the
--            generic function resolves org directly from NEW/OLD.organization_id.
--            stocks has no separate entity_id column, so the generic function
--            falls back to stocks.id (entity_id fallback at line 194 of
--            20260625010000_entity_audit_log.sql).
--
--   stock_movements — fn_audit_stock_movements_with_sentinel()  sentinel
--            stock_movements has NO organization_id column and no resolvable
--            tenant path: its foreign keys are location_id → locations (which
--            itself carries no organization_id) and spare_part_id → spare_parts.
--            None of the generic strategies (A: direct org; B: anew_entity_roles;
--            C: anew_leads/contacts/clients) can resolve an org for it, so
--            fn_generic_entity_audit() would skip every write silently at line
--            229 of 20260625010000_entity_audit_log.sql, producing zero audit
--            rows. The sentinel-aware function substitutes the system sentinel
--            UUID '00000000-0000-0000-0000-000000000001' so every movement write
--            remains auditable, exactly mirroring fn_audit_locations_with_sentinel().
--
--            IMPORTANT: stock_movements does NOT exist in the baseline schema
--            (20260615130000_baseline_new_database.sql). It appears only in the
--            generated TypeScript types alongside the spare_parts / work_orders
--            maintenance module. To avoid failing on environments where the table
--            is absent — and to avoid creating a table that must not be created —
--            its trigger is registered conditionally, guarded by to_regclass().
--            The function is created unconditionally (harmless if never invoked)
--            and its trigger is attached only when the table actually exists.
--
-- Global sentinel UUID:
--   '00000000-0000-0000-0000-000000000001' — same constant used for uom, brands,
--   categories, attributes and locations. Never insert this UUID into
--   anew_organizations as a real org.
--
-- Tables explicitly NOT covered (do not exist in the schema — confirmed against
-- the baseline): stock_items, anew_stock, inventory. None is created or
-- referenced anywhere in this migration.
--
-- Existing triggers on these tables (baseline — confirmed):
--   stocks — update_stocks_updated_at (BEFORE UPDATE, updated_at maintenance).
--            No audit trigger exists at this timestamp.
--   stock_movements — none guaranteed (table not in baseline).
--   DROP IF EXISTS guards below make registration idempotent. No existing audit
--   trigger on any other table is dropped or altered.
--
-- Noise columns excluded from UPDATE diff: 'updated_at', 'created_at'
--
-- Gaps addressed:
--   STOCKS-01 (CRITICAL) — no audit trigger on stocks (module status: missing).
--   STOCKS-02 (CRITICAL) — no audit trigger on stock_movements when present.


-- ============================================================
-- 1. stocks — Strategy A
-- ============================================================
-- Fires AFTER the DML so it sees the committed row state.
-- DROP IF EXISTS + CREATE is idempotent (Postgres 13 does not support
-- CREATE OR REPLACE TRIGGER; DROP+CREATE is portable across Supabase versions).
--
-- Alphabetical execution order (same timing, same event): trg_audit_stocks
-- sorts after update_stocks_updated_at, so the audit trigger sees the final
-- updated_at value in the row.

DROP TRIGGER IF EXISTS trg_audit_stocks ON public.stocks;
CREATE TRIGGER trg_audit_stocks
  AFTER INSERT OR UPDATE OR DELETE ON public.stocks
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();


-- ============================================================
-- 2. stock_movements — sentinel-aware function + guarded trigger
-- ============================================================
-- Handles: stock_movements (org unresolvable → system sentinel).
--
-- stock_movements columns (from generated types):
--   id, spare_part_id, movement_type, quantity, unit_cost, total_cost,
--   reference_number, batch_number, expiry_date, location_id, work_order_id,
--   notes, created_by, created_at
--
-- The table has no organization_id and no resolvable tenant FK, so v_org_id is
-- ALWAYS the sentinel. entity_id = stock_movements.id (no separate entity_id
-- column). The function is created unconditionally; it is only ever reached if
-- the guarded trigger below is attached (i.e. the table exists).

CREATE OR REPLACE FUNCTION public.fn_audit_stock_movements_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Sentinel org for org-less stock_movements rows. Must never match a real org.
  -- Same constant as fn_audit_locations_with_sentinel and
  -- fn_audit_uom_with_sentinel.
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

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve entity_id ─────────────────────────────────────────────────────
  -- stock_movements has no separate entity_id column; the row's own id serves.
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Resolve org_id ────────────────────────────────────────────────────────
  -- stock_movements carries no organization_id and no resolvable tenant FK, so
  -- the sentinel is always used. Tag source as 'system' when no explicit source
  -- was set, to distinguish sentinel rows.
  v_org_id := k_system_sentinel;
  IF v_source IS NULL THEN
    v_source := 'system';
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

REVOKE ALL ON FUNCTION public.fn_audit_stock_movements_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_stock_movements_with_sentinel() TO service_role;

-- Guarded trigger registration: attach only when stock_movements exists.
-- to_regclass returns NULL for a nonexistent relation, so the block is a no-op
-- on environments where the table is absent (it is NOT part of the baseline).
DO $do$
BEGIN
  IF to_regclass('public.stock_movements') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_audit_stock_movements ON public.stock_movements;
    CREATE TRIGGER trg_audit_stock_movements
      AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
      FOR EACH ROW EXECUTE FUNCTION public.fn_audit_stock_movements_with_sentinel();
  END IF;
END;
$do$;


-- ============================================================
-- 3. Verification notes (for human review, not executed)
-- ============================================================
-- 1. Confirm the stocks trigger is registered and points to the generic fn:
--
--   SELECT t.tgname, p.proname AS function_name, t.tgenabled
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE t.tgrelid = 'public.stocks'::regclass
--   ORDER BY t.tgname;
--
-- Expected (2 rows):
--   trg_audit_stocks          | fn_generic_entity_audit  | enabled
--   update_stocks_updated_at  | update_updated_at_column | enabled
--
-- 2. Confirm exactly one audit trigger on stocks:
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.stocks'::regclass
--     AND tgname LIKE '%audit%';
--
-- Expected: exactly one row — trg_audit_stocks.
--
-- 3. Confirm the stock_movements trigger only when the table exists:
--
--   SELECT t.tgname, p.proname
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE to_regclass('public.stock_movements') IS NOT NULL
--     AND t.tgrelid = to_regclass('public.stock_movements')
--     AND t.tgname = 'trg_audit_stock_movements';
--
-- Expected: one row (trg_audit_stock_movements | fn_audit_stock_movements_with_sentinel)
--           if the table exists, zero rows otherwise.
--
-- 4. Smoke-test org-scoped stocks audit (run as an authenticated user with
--    stock write permission in a known organization):
--
--   INSERT INTO public.stocks
--     (product_id, warehouse_id, quantity, created_by, organization_id)
--   VALUES ('<product-uuid>', '<warehouse-uuid>', 10, '<user-uuid>', '<org-uuid>');
--
--   SELECT organization_id, entity_id, table_name, operation, changed_by, source
--   FROM public.entity_audit_log
--   WHERE table_name = 'stocks'
--   ORDER BY created_at DESC
--   LIMIT 1;
--
-- Expected: organization_id matches the inserting org (not the sentinel),
--           entity_id = the new stock row's id, operation = 'INSERT'.
--
--   DELETE FROM public.stocks WHERE product_id = '<product-uuid>'
--     AND warehouse_id = '<warehouse-uuid>';
--
-- 5. Smoke-test stock_movements audit (only where the table exists): INSERT a
--    movement, then verify entity_audit_log has a row with
--    organization_id = '00000000-0000-0000-0000-000000000001' and source = 'system'.
