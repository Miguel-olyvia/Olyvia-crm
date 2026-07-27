-- Bundles Audit Triggers — Wave 1
-- 2026-07-04 | Module: Bundles | Wave: 1 (audit trigger functions + registrations)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_bundle_choice_groups() — satellite: org+entity via bundle_id → bundles
--   2. fn_audit_bundle_components()    — satellite: org+entity via bundle_id → bundles
--   3. Trigger registrations (DROP IF EXISTS + CREATE, idempotent)
--   4. REVOKE/GRANT for new functions
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and fn_audit_product_attribute_values()
-- (20260703010000_products_audit_triggers.sql):
--   • SECURITY DEFINER + pinned search_path = public, pg_temp
--   • Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   • UPDATE rows skipped when only noise columns changed
--   • Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   • changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Prerequisites: 20260704000000_bundles_security_fixes.sql (Wave 0)
--   Wave 0 must be applied first: GRANT/REVOKE on bundle tables and RLS policies
--   must be in place before audit triggers are registered.
--
-- Tables audited:
--   bundles              — fn_generic_entity_audit()           Strategy A
--                          organization_id column is present (nullable).
--                          fn_generic_entity_audit() skips silently when org IS NULL
--                          (NULL-org rows are invisible to non-system-admin users —
--                           same intentional gap as PROD-010 on products).
--   bundle_choice_groups — fn_audit_bundle_choice_groups()     satellite via bundle_id
--                          No organization_id column; org resolved via bundle_id → bundles.
--                          entity_id set to parent bundles.id for grouping in the UI.
--   bundle_components    — fn_audit_bundle_components()        satellite via bundle_id
--                          No organization_id column; org resolved via bundle_id → bundles.
--                          entity_id set to parent bundles.id.
--                          Captures: quantity, pricing_mode, custom_price,
--                          custom_discount_percent, custom_discount_fixed, is_optional.
--
-- Gaps addressed:
--   BUN-001 (CRITICAL) — no audit trigger on bundles
--   BUN-002 (CRITICAL) — no audit trigger on bundle_choice_groups (satellite pattern)
--   BUN-003 (CRITICAL) — no audit trigger on bundle_components (satellite pattern)
--   BUNDLE-06 (MEDIUM) — no audit triggers on bundle_choice_groups or bundle_components
--
-- Duplicate trigger check:
--   The baseline registers only updated_at triggers on all three tables:
--     update_bundle_choice_groups_updated_at  (BEFORE UPDATE)
--     update_bundle_components_updated_at     (BEFORE UPDATE)
--     update_bundles_updated_at               (BEFORE UPDATE)
--   None of these are audit triggers. DROP IF EXISTS guards below make the
--   registrations idempotent. No duplicate trigger risk exists at this timestamp.
--
-- Noise columns excluded from UPDATE diff (all satellite functions):
--   'updated_at', 'created_at'


-- ============================================================
-- 1. fn_audit_bundle_choice_groups()
-- ============================================================
-- Handles: bundle_choice_groups
--
-- bundle_choice_groups has NO organization_id column. Columns:
--   id, bundle_id, name, description, min_selections, max_selections,
--   is_required, sort_order, created_at, updated_at
--
-- org and entity are resolved via: JOIN public.bundles ON bundles.id = bundle_id
--   organization_id → bundles.organization_id
--   entity_id       → bundles.id  (parent bundle's id, groups audit rows
--                                  under the bundle entity timeline in the UI)
--
-- Noise columns excluded from UPDATE diff: 'updated_at', 'created_at'

CREATE OR REPLACE FUNCTION public.fn_audit_bundle_choice_groups()
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
  v_bundle_id      uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve bundle_id from whichever side is available ──────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_bundle_id := COALESCE(
    (to_jsonb(NEW) ->> 'bundle_id')::uuid,
    (to_jsonb(OLD) ->> 'bundle_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent bundle ─────────────
  -- entity_id is set to the parent bundle's id so that audit rows for choice
  -- group changes group under the bundle entity timeline in the UI.
  IF v_bundle_id IS NOT NULL THEN
    SELECT b.organization_id, b.id
    INTO   v_org_id, v_entity_id
    FROM   public.bundles b
    WHERE  b.id = v_bundle_id
    LIMIT  1;
  END IF;

  -- Cannot determine org — skip silently (bundle with NULL org_id).
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

REVOKE ALL ON FUNCTION public.fn_audit_bundle_choice_groups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_bundle_choice_groups() TO service_role;


-- ============================================================
-- 2. fn_audit_bundle_components()
-- ============================================================
-- Handles: bundle_components
--
-- bundle_components has NO organization_id column. Columns:
--   id, bundle_id, product_id, service_id, quantity, pricing_mode,
--   custom_price, custom_discount_percent, custom_discount_fixed,
--   is_optional, choice_group_id, sort_order, created_at, updated_at
--
-- org and entity are resolved via: JOIN public.bundles ON bundles.id = bundle_id
--   organization_id → bundles.organization_id
--   entity_id       → bundles.id
--
-- This is the composition-tracking table. Changes to quantity, pricing_mode,
-- custom_price, custom_discount_percent, custom_discount_fixed, is_optional
-- are high-value audit events (BUN-003).
--
-- Noise columns excluded from UPDATE diff: 'updated_at', 'created_at'

CREATE OR REPLACE FUNCTION public.fn_audit_bundle_components()
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
  v_bundle_id      uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve bundle_id from whichever side is available ──────────────────
  v_bundle_id := COALESCE(
    (to_jsonb(NEW) ->> 'bundle_id')::uuid,
    (to_jsonb(OLD) ->> 'bundle_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent bundle ─────────────
  IF v_bundle_id IS NOT NULL THEN
    SELECT b.organization_id, b.id
    INTO   v_org_id, v_entity_id
    FROM   public.bundles b
    WHERE  b.id = v_bundle_id
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

REVOKE ALL ON FUNCTION public.fn_audit_bundle_components() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_bundle_components() TO service_role;


-- ============================================================
-- 3. Trigger registrations
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE pattern for idempotent migrations (Postgres 13
-- does not support CREATE OR REPLACE TRIGGER).
--
-- Existing triggers on these tables (BEFORE UPDATE, updated_at maintenance):
--   update_bundles_updated_at              — BEFORE UPDATE, fires first, harmless
--   update_bundle_choice_groups_updated_at — BEFORE UPDATE, fires first, harmless
--   update_bundle_components_updated_at    — BEFORE UPDATE, fires first, harmless
-- These are unaffected by the AFTER triggers registered below.
-- Alphabetical execution order (same timing, same event):
--   trg_audit_* names sort after update_* names → audit triggers fire second,
--   which is correct (they see the final updated_at value in the row).

-- bundles — Strategy A: organization_id nullable.
-- fn_generic_entity_audit() skips silently when organization_id IS NULL
-- (baseline fn body line 228-231: "Cannot determine org — skip silently").
-- entity_id falls back to bundles.id (no entity_id column on bundles).
DROP TRIGGER IF EXISTS trg_audit_bundles ON public.bundles;
CREATE TRIGGER trg_audit_bundles
  AFTER INSERT OR UPDATE OR DELETE ON public.bundles
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- bundle_choice_groups — satellite via bundle_id → bundles.
-- entity_id is set to the parent bundle's id inside fn_audit_bundle_choice_groups().
DROP TRIGGER IF EXISTS trg_audit_bundle_choice_groups ON public.bundle_choice_groups;
CREATE TRIGGER trg_audit_bundle_choice_groups
  AFTER INSERT OR UPDATE OR DELETE ON public.bundle_choice_groups
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_bundle_choice_groups();

-- bundle_components — satellite via bundle_id → bundles.
-- entity_id is set to the parent bundle's id inside fn_audit_bundle_components().
-- Captures high-value composition changes: quantity, pricing_mode, custom_price,
-- custom_discount_percent, custom_discount_fixed, is_optional, choice_group_id.
DROP TRIGGER IF EXISTS trg_audit_bundle_components ON public.bundle_components;
CREATE TRIGGER trg_audit_bundle_components
  AFTER INSERT OR UPDATE OR DELETE ON public.bundle_components
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_bundle_components();


-- ============================================================
-- 4. Verification notes (for human review, not executed)
-- ============================================================
-- After applying, verify trigger registrations:
--
--   SELECT tgname, tgrelid::regclass, tgenabled
--   FROM pg_trigger
--   WHERE tgrelid IN (
--     'public.bundles'::regclass,
--     'public.bundle_choice_groups'::regclass,
--     'public.bundle_components'::regclass
--   )
--   ORDER BY tgrelid::regclass, tgname;
--
-- Expected output (6 rows total):
--   trg_audit_bundles                   | bundles              | enabled
--   update_bundles_updated_at           | bundles              | enabled
--   trg_audit_bundle_choice_groups      | bundle_choice_groups | enabled
--   update_bundle_choice_groups_updated_at | bundle_choice_groups | enabled
--   trg_audit_bundle_components         | bundle_components    | enabled
--   update_bundle_components_updated_at | bundle_components    | enabled
--
-- Verify no duplicate trigger exists on bundles (BUN-001 critical check):
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.bundles'::regclass
--     AND tgname LIKE '%audit%';
--
-- Expected: exactly one row — trg_audit_bundles.
