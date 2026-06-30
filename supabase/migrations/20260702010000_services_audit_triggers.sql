-- Services Audit Triggers — Wave 1
-- 2026-07-02 | Module: Services | Wave: 1 (audit trigger functions + registrations)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_service_category()   — satellite: org via organization_id OR parent walk
--   2. fn_audit_service_prices()     — satellite: org+entity via service_id → services
--   3. Trigger registrations (DROP IF EXISTS + CREATE, idempotent)
--   4. REVOKE/GRANT for new functions
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and fn_audit_quote_child()
-- (20260627100000_quotes_audit_triggers.sql):
--   • SECURITY DEFINER + pinned search_path = public, pg_temp
--   • Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   • UPDATE rows skipped when only noise columns changed
--   • Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   • changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Prerequisites: 20260702000000_services_security_fixes.sql (Wave 0)
--   Wave 0 must be applied first: the service_organizations FK + indexes are
--   required for the Strategy A org lookup in trg_audit_service_organizations
--   to perform index scans instead of sequential scans.
--
-- Tables audited:
--   services              — fn_generic_entity_audit()       Strategy B (org_id nullable)
--   service_categories    — fn_audit_service_category()     satellite via parent_id walk
--   service_prices        — fn_audit_service_prices()       satellite via service_id
--   service_fee_types     — fn_generic_entity_audit()       Strategy B (org_id nullable)
--   service_organizations — fn_generic_entity_audit()       Strategy A (org_id NOT NULL)
--
-- Tables NOT audited (intentional):
--   service_price_history — this IS a history/log table itself. Adding an audit
--     trigger on it would create a write-loop (audit of audit). The functional
--     price history (user-visible in ServicePriceHistoryDialog.tsx) coexists with
--     entity_audit_log as two separate layers:
--       • service_price_history = functional price history, user-facing
--       • entity_audit_log      = central audit trail, compliance-facing
--     Duplicate write on service_prices UPDATE is INTENTIONAL.


-- ============================================================
-- 1. fn_audit_service_category()
-- ============================================================
-- Handles: service_categories (roots and subcategories on the same table)
--
-- service_categories has a two-level org resolution problem:
--   Root categories  (parent_id IS NULL): organization_id is set directly.
--   Subcategories    (parent_id IS NOT NULL): organization_id is NULL on the
--     row; org is inherited from the root ancestor.
--
-- Resolution order:
--   1. COALESCE(NEW.organization_id, OLD.organization_id) — direct column
--      (covers root categories and any subcategory that has been explicitly
--       org-scoped).
--   2. get_service_category_org_id(COALESCE(NEW.parent_id, OLD.parent_id))
--      — recursive walk up the parent chain (covers subcategories).
--   3. If still NULL: skip silently (no org → no audit row, avoids polluting log).
--
-- entity_id is set to the category's own id (no entity_id column exists on
-- service_categories; mirrors the fn_generic_entity_audit() fallback at
-- baseline line 188: "fall back to id").
--
-- Noise columns excluded from UPDATE diff:
--   'updated_at' — timestamp maintenance column

CREATE OR REPLACE FUNCTION public.fn_audit_service_category()
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
  v_noise_cols     text[] := ARRAY['updated_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_parent_id      uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve entity_id (own id — no entity_id column on this table) ───────
  -- COALESCE(NEW.id, OLD.id) handles DELETE where NEW is NULL.
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Resolve organization_id ──────────────────────────────────────────────
  -- Step 1: direct column (root categories; subcategories with explicit org).
  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );

  -- Step 2: walk parent chain via get_service_category_org_id() (subcategories
  -- whose own organization_id is NULL inherit org from the root ancestor).
  IF v_org_id IS NULL THEN
    v_parent_id := COALESCE(
      (to_jsonb(NEW) ->> 'parent_id')::uuid,
      (to_jsonb(OLD) ->> 'parent_id')::uuid
    );
    IF v_parent_id IS NOT NULL THEN
      v_org_id := public.get_service_category_org_id(v_parent_id);
    END IF;
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

REVOKE ALL ON FUNCTION public.fn_audit_service_category() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_service_category() TO service_role;


-- ============================================================
-- 2. fn_audit_service_prices()
-- ============================================================
-- Handles: service_prices
--
-- service_prices has NO organization_id column (confirmed: schema has only
-- service_id, price_type, price, currency, valid_from, valid_to, created_by,
-- created_at, updated_at, vat_rate).
--
-- org and entity are resolved via: JOIN public.services ON services.id = service_id
--   organization_id → services.organization_id
--   entity_id       → services.id  (the parent service's id, NOT the price row id)
--
-- Using the parent service's id as entity_id groups price-change audit rows
-- under the service entity timeline in the UI — consistent with the intent of
-- entity_audit_log (one timeline per business entity).
--
-- IMPORTANT — dual-trigger coexistence on service_prices UPDATE:
--   Both service_price_change_trigger (existing, fires log_service_price_change())
--   and trg_audit_service_prices (this trigger) fire on UPDATE of service_prices.
--   This is INTENTIONAL:
--     • service_price_history  = functional price history (user-visible dialog)
--                                only written when OLD.price IS DISTINCT FROM NEW.price
--     • entity_audit_log       = central audit trail (compliance, all changes)
--                                written for any non-noise field change
--   The two triggers write to different tables with different purposes.
--   Execution order: service_price_change_trigger fires first (alphabetically
--   earlier; also created first). Exceptions in log_service_price_change()
--   propagate (not swallowed) and would prevent fn_audit_service_prices() from
--   running. The Wave 0 fix to log_service_price_change() preserves its existing
--   exception behaviour. Verify atomicity in staging.
--
-- Noise columns excluded from UPDATE diff:
--   'updated_at', 'created_at'

CREATE OR REPLACE FUNCTION public.fn_audit_service_prices()
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
  v_service_id     uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve service_id from whichever side is available ─────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_service_id := COALESCE(
    (to_jsonb(NEW) ->> 'service_id')::uuid,
    (to_jsonb(OLD) ->> 'service_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent service ─────────────
  -- entity_id is set to the parent service's id so that audit rows for price
  -- changes group under the service entity timeline (not the price row itself).
  IF v_service_id IS NOT NULL THEN
    SELECT s.organization_id, s.id
    INTO   v_org_id, v_entity_id
    FROM   public.services s
    WHERE  s.id = v_service_id
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

REVOKE ALL ON FUNCTION public.fn_audit_service_prices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_service_prices() TO service_role;


-- ============================================================
-- 3. Trigger registrations
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE pattern for idempotent migrations (Postgres 13
-- does not support CREATE OR REPLACE TRIGGER).

-- services — Strategy B: organization_id nullable, fn_generic_entity_audit()
-- skips silently when org is NULL (see baseline fn body line 229).
DROP TRIGGER IF EXISTS trg_audit_services ON public.services;
CREATE TRIGGER trg_audit_services
  AFTER INSERT OR UPDATE OR DELETE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- service_categories — satellite with parent_id walk.
DROP TRIGGER IF EXISTS trg_audit_service_categories ON public.service_categories;
CREATE TRIGGER trg_audit_service_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_service_category();

-- service_prices — satellite via service_id → services.
-- NOTE: service_price_change_trigger (existing, UPDATE only) also fires on UPDATE.
-- Both triggers are intentional and serve different purposes — see fn_audit_service_prices()
-- header comment above for the full explanation.
DROP TRIGGER IF EXISTS trg_audit_service_prices ON public.service_prices;
CREATE TRIGGER trg_audit_service_prices
  AFTER INSERT OR UPDATE OR DELETE ON public.service_prices
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_service_prices();

-- service_fee_types — Strategy B: organization_id nullable.
DROP TRIGGER IF EXISTS trg_audit_service_fee_types ON public.service_fee_types;
CREATE TRIGGER trg_audit_service_fee_types
  AFTER INSERT OR UPDATE OR DELETE ON public.service_fee_types
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- service_organizations — Strategy A: organization_id NOT NULL (direct).
-- NOTE: entity_id on service_organizations rows will be the association row's
-- own id (no entity_id column exists). Audit rows are therefore grouped by the
-- association row id, not by a CRM entity id. Acceptable for this wave; a
-- dedicated satellite function grouping by service id is deferred as a
-- low-priority enhancement.
DROP TRIGGER IF EXISTS trg_audit_service_organizations ON public.service_organizations;
CREATE TRIGGER trg_audit_service_organizations
  AFTER INSERT OR UPDATE OR DELETE ON public.service_organizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();


-- ============================================================
-- 4. Explicit note: service_price_history is NOT audited
-- ============================================================
-- No trigger is created on service_price_history. It is itself a functional
-- history table written by log_service_price_change() (SECURITY DEFINER trigger).
-- Auditing it would create an audit-of-audit write loop and is nonsensical.
-- Verify absence: SELECT tgname FROM pg_trigger WHERE tgrelid = 'service_price_history'::regclass;
-- Expected result: only 'service_price_history_pkey' internal index trigger, no audit trigger.
