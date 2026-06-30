-- Attributes Audit Triggers — Wave 1
-- 2026-07-07 | Module: Fase 6 · Attributes | Wave: 1 (audit trigger functions + registrations)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_product_attributes_with_sentinel() — sentinel-aware function for
--      product_attributes (mirrors fn_audit_product_categories_with_sentinel() from
--      20260706010000_categories_audit_triggers.sql). Required because
--      product_attributes.organization_id is nullable — global/shared attributes
--      would produce zero audit rows via fn_generic_entity_audit() (silent skip at
--      line 229 of 20260625010000_entity_audit_log.sql).
--   2. fn_audit_attribute_option_groups_with_sentinel() — sentinel-aware function
--      for attribute_option_groups. organization_id is nullable (global palettes).
--      entity_id = attribute_option_groups.id (no separate entity_id column).
--   3. fn_audit_attribute_option_group_values() — satellite function for
--      attribute_option_group_values. No organization_id column — org + entity resolved
--      via group_id → attribute_option_groups.
--      entity_id = parent group's id so that value mutations appear on the group timeline.
--   4. Trigger registrations (DROP IF EXISTS + CREATE, idempotent)
--   5. REVOKE/GRANT for new functions
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and the sentinel pattern in
-- fn_audit_brands_with_sentinel() (20260705030000_brands_audit_coverage.sql):
--   • SECURITY DEFINER + pinned search_path = public, pg_temp
--   • Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   • UPDATE rows skipped when only noise columns changed
--   • Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   • changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql       — entity_audit_log table + fn_generic_entity_audit()
--   20260705030000_brands_audit_coverage.sql  — sentinel pattern established
--   20260707000000_attributes_security_fixes.sql — Wave 0 (RLS must be in place first)
--
-- Tables audited:
--   product_attributes              — fn_audit_product_attributes_with_sentinel()
--                                     Strategy A: organization_id nullable.
--                                     Global attributes (org IS NULL) audited under sentinel.
--                                     entity_id = product_attributes.id.
--
--   attribute_option_groups         — fn_audit_attribute_option_groups_with_sentinel()
--                                     Strategy A: organization_id nullable.
--                                     Global groups (org IS NULL) audited under sentinel.
--                                     entity_id = attribute_option_groups.id.
--
--   attribute_option_group_values   — fn_audit_attribute_option_group_values()
--                                     Satellite: org + entity resolved via
--                                     group_id → attribute_option_groups.
--                                     entity_id = parent group id (not value row id)
--                                     so that value mutations appear on the group timeline.
--                                     Global groups: skip silently (no org to scope to).
--
-- Global sentinel UUID:
--   '00000000-0000-0000-0000-000000000001' — same constant used for brands and categories.
--   Never insert this UUID into anew_organizations as a real org.
--
-- Existing triggers on target tables (baseline):
--   product_attributes:
--     update_product_attributes_updated_at   — BEFORE UPDATE (line ~18104, baseline)
--   attribute_option_groups:
--     update_attribute_option_groups_updated_at — BEFORE UPDATE (baseline, exact line varies)
--   attribute_option_group_values:
--     update_attribute_option_group_values_updated_at — BEFORE UPDATE (baseline)
--   No audit triggers exist on any of the three tables.
--   DROP IF EXISTS guards below are idempotent.
--
-- Gaps addressed:
--   ATTR-001 (CRITICAL, DB set 1/2) — no audit trigger on product_attributes or attribute_option_groups
--   ATTR-007 (MEDIUM, DB set 1/2)  — no audit trigger on attribute_option_groups or product_attributes
--   ATTR-01  (CRITICAL, frontend)  — UPDATE/INSERT on product_attributes without audit context
--                                    (triggers are now in place; app layer must call withAuditContext)
--   ATTR-08/09 (CRITICAL, frontend) — INSERT/DELETE on attribute_option_groups without audit context
--
-- Noise columns excluded from UPDATE diff:
--   'updated_at', 'created_at'


-- ============================================================
-- 1. fn_audit_product_attributes_with_sentinel()
-- ============================================================
-- Handles: product_attributes
--
-- product_attributes.organization_id is nullable.
-- fn_generic_entity_audit() skips rows when organization_id IS NULL (line 229).
-- For global attributes this means zero audit coverage.
--
-- Sentinel substitution: NULL org_id → '00000000-0000-0000-0000-000000000001'
-- and source tagged 'system' when no explicit source was set.
--
-- entity_id = product_attributes.id (no separate entity_id column).

CREATE OR REPLACE FUNCTION public.fn_audit_product_attributes_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
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

  -- Resolve actor
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- Resolve source
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- Resolve org_id and entity_id
  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- Sentinel substitution for global attributes (organization_id IS NULL)
  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL THEN
      v_source := 'system';
    END IF;
  END IF;

  -- Build payload
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

  -- Write audit row
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

REVOKE ALL ON FUNCTION public.fn_audit_product_attributes_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_product_attributes_with_sentinel() TO service_role;


-- ============================================================
-- 2. fn_audit_attribute_option_groups_with_sentinel()
-- ============================================================
-- Handles: attribute_option_groups
--
-- attribute_option_groups.organization_id is nullable.
-- Same sentinel pattern as product_attributes above.
-- entity_id = attribute_option_groups.id.

CREATE OR REPLACE FUNCTION public.fn_audit_attribute_option_groups_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
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

  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_source := nullif(current_setting('app.audit_source', true), '');

  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL THEN
      v_source := 'system';
    END IF;
  END IF;

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

REVOKE ALL ON FUNCTION public.fn_audit_attribute_option_groups_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_attribute_option_groups_with_sentinel() TO service_role;


-- ============================================================
-- 3. fn_audit_attribute_option_group_values()
-- ============================================================
-- Handles: attribute_option_group_values
--
-- attribute_option_group_values columns:
--   id, group_id, value_text, display_name, hex_color, sort_order, is_active,
--   created_at, updated_at
--
-- No organization_id column. Org + entity resolved via:
--   group_id → attribute_option_groups.organization_id
--   entity_id → attribute_option_groups.id (groups value mutations under group timeline)
--
-- Global groups (organization_id IS NULL): skip silently.
-- The parent group's own sentinel audit row captures group-level changes.
-- Noise columns: 'updated_at', 'created_at'.

CREATE OR REPLACE FUNCTION public.fn_audit_attribute_option_group_values()
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
  v_group_id       uuid;
BEGIN

  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_source := nullif(current_setting('app.audit_source', true), '');

  -- Resolve group_id from whichever side is available
  v_group_id := COALESCE(
    (to_jsonb(NEW) ->> 'group_id')::uuid,
    (to_jsonb(OLD) ->> 'group_id')::uuid
  );

  -- Resolve organization_id and entity_id via parent group
  IF v_group_id IS NOT NULL THEN
    SELECT aog.organization_id, aog.id
    INTO   v_org_id, v_entity_id
    FROM   public.attribute_option_groups aog
    WHERE  aog.id = v_group_id
    LIMIT  1;
  END IF;

  -- Global group: skip silently. Parent group sentinel row already captures the change.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

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

REVOKE ALL ON FUNCTION public.fn_audit_attribute_option_group_values() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_attribute_option_group_values() TO service_role;


-- ============================================================
-- 4. Trigger registrations
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE pattern for idempotent migrations (Postgres 13
-- does not support CREATE OR REPLACE TRIGGER).
--
-- Existing triggers on target tables:
--   product_attributes:              update_product_attributes_updated_at (BEFORE UPDATE)
--   attribute_option_groups:         update_attribute_option_groups_updated_at (BEFORE UPDATE)
--   attribute_option_group_values:   update_attribute_option_group_values_updated_at (BEFORE UPDATE)
--
-- Alphabetical sort: trg_audit_* names sort after update_* names → audit triggers
-- fire after the updated_at trigger, which is correct (they see the final row state).

-- product_attributes — sentinel-aware function
DROP TRIGGER IF EXISTS trg_audit_product_attributes ON public.product_attributes;
CREATE TRIGGER trg_audit_product_attributes
  AFTER INSERT OR UPDATE OR DELETE ON public.product_attributes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_product_attributes_with_sentinel();

-- attribute_option_groups — sentinel-aware function
DROP TRIGGER IF EXISTS trg_audit_attribute_option_groups ON public.attribute_option_groups;
CREATE TRIGGER trg_audit_attribute_option_groups
  AFTER INSERT OR UPDATE OR DELETE ON public.attribute_option_groups
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_attribute_option_groups_with_sentinel();

-- attribute_option_group_values — satellite via group_id → attribute_option_groups
DROP TRIGGER IF EXISTS trg_audit_attribute_option_group_values ON public.attribute_option_group_values;
CREATE TRIGGER trg_audit_attribute_option_group_values
  AFTER INSERT OR UPDATE OR DELETE ON public.attribute_option_group_values
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_attribute_option_group_values();


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Confirm trigger registrations:
--
--   SELECT tgname, tgrelid::regclass, tgenabled
--   FROM pg_trigger
--   WHERE tgrelid IN (
--     'public.product_attributes'::regclass,
--     'public.attribute_option_groups'::regclass,
--     'public.attribute_option_group_values'::regclass
--   )
--   ORDER BY tgrelid::regclass, tgname;
--
-- Expected (6 rows — 2 per table):
--   trg_audit_attribute_option_group_values       | attribute_option_group_values | enabled
--   update_attribute_option_group_values_updated_at | attribute_option_group_values | enabled
--   trg_audit_attribute_option_groups             | attribute_option_groups       | enabled
--   update_attribute_option_groups_updated_at     | attribute_option_groups       | enabled
--   trg_audit_product_attributes                  | product_attributes            | enabled
--   update_product_attributes_updated_at          | product_attributes            | enabled
--
-- 2. Confirm no duplicate audit triggers:
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid IN (
--     'public.product_attributes'::regclass,
--     'public.attribute_option_groups'::regclass,
--     'public.attribute_option_group_values'::regclass
--   )
--     AND tgname LIKE '%audit%';
--
-- Expected: exactly 3 rows (one per table).
--
-- 3. Confirm functions are SECURITY DEFINER with correct grants:
--
--   SELECT proname, prosecdef, proacl
--   FROM pg_proc
--   WHERE proname IN (
--     'fn_audit_product_attributes_with_sentinel',
--     'fn_audit_attribute_option_groups_with_sentinel',
--     'fn_audit_attribute_option_group_values'
--   );
--
-- Expected: prosecdef = true for all three; proacl shows service_role EXECUTE only.
--
-- 4. Smoke test — write a row and confirm audit entry (in a transaction, rollback after):
--
--   BEGIN;
--   SELECT set_config('app.audit_user_id', '<some-business-user-uuid>', true);
--   INSERT INTO public.product_attributes
--     (code, label, type, value_type, valorization_type, created_by, organization_id)
--   VALUES ('TEST_ATTR', 'Test', 'text', 'string', 'none', '<user-uuid>', '<org-uuid>');
--   SELECT organization_id, entity_id, table_name, operation, changed_by
--   FROM public.entity_audit_log
--   WHERE table_name = 'product_attributes'
--   ORDER BY created_at DESC LIMIT 1;
--   ROLLBACK;
--
-- Expected: one row with operation='INSERT', organization_id=<org-uuid>,
--   entity_id=<new attr id>, changed_by=<business-user-uuid>.
