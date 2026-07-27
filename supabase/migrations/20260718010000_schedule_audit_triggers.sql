-- Schedule (Agendamentos) Audit Triggers — Wave 1
-- 2026-07-18 | Module: Fase · Agendamentos | Wave: 1 (audit trigger functions + registrations)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_schedule_with_sentinel() — sentinel-aware audit function shared by
--      schedule_items and schedule_boards.
--      Required because both tables carry a NULLABLE organization_id — global /
--      system rows (organization_id IS NULL, e.g. is_system_board boards) would
--      produce zero audit entries via fn_generic_entity_audit() (silent skip at
--      line 229 of 20260625010000_entity_audit_log.sql). Uses the same sentinel
--      UUID '00000000-0000-0000-0000-000000000001' established in
--      20260705030000_brands_audit_coverage.sql and reused by
--      20260708010000_uom_audit_triggers.sql.
--   2. Trigger registrations (DROP IF EXISTS + CREATE, idempotent).
--   3. REVOKE/GRANT for the new function.
--
-- The function follows the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and the sentinel pattern in
-- fn_audit_uom_with_sentinel() (20260708010000_uom_audit_triggers.sql):
--   · SECURITY DEFINER + pinned search_path = public, pg_temp
--   · Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   · UPDATE rows skipped when only noise columns changed
--   · Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   · changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql   — schedule_items / schedule_boards tables
--   20260625010000_entity_audit_log.sql        — entity_audit_log table + fn_generic_entity_audit()
--   20260705030000_brands_audit_coverage.sql   — sentinel UUID established
--
-- Tables audited:
--   schedule_items  — fn_audit_schedule_with_sentinel()
--                     Strategy A: organization_id nullable. No separate entity_id
--                     column → entity_id = schedule_items.id.
--                     Rows with organization_id IS NULL audited under sentinel UUID.
--   schedule_boards — fn_audit_schedule_with_sentinel()
--                     Strategy A: organization_id nullable (system boards may be
--                     global). No separate entity_id column → entity_id = schedule_boards.id.
--                     Rows with organization_id IS NULL audited under sentinel UUID.
--
-- Column confirmation (from baseline 20260615130000_baseline_new_database.sql):
--   schedule_items:  id, board_id, title, description, status, origin,
--                    start_datetime, end_datetime, all_day, duration_minutes,
--                    client_id, contact_id, deal_id, location, location_lat,
--                    location_lng, color, priority, tags, notes, metadata,
--                    company_id, created_by, created_at, updated_at, employee_id,
--                    time_off_type, approval_status, approved_by, approved_at,
--                    rejection_reason, vacation_id, user_id, organization_id
--   schedule_boards: id, name, description, color, is_active, settings,
--                    created_by, created_at, updated_at, board_type,
--                    is_system_board, name_key, organization_id
--   → Both carry organization_id (nullable). Neither carries an entity_id column.
--
-- Global sentinel UUID:
--   '00000000-0000-0000-0000-000000000001' — same constant used for brands,
--   categories, attributes, and uom. Never insert this UUID into anew_organizations
--   as a real org.
--
-- Existing triggers (baseline — must NOT be altered or dropped by this migration):
--   schedule_items:
--     log_schedule_item_changes            (AFTER INSERT OR UPDATE, log_schedule_item_event)
--     trg_prevent_schedule_items_on_holidays (BEFORE INSERT OR UPDATE OF ..., holiday guard)
--     update_schedule_items_updated_at     (BEFORE UPDATE, updated_at maintenance)
--   schedule_boards:
--     update_schedule_boards_updated_at    (BEFORE UPDATE, updated_at maintenance)
--   No audit trigger exists on either table at this timestamp.
--   DROP IF EXISTS guards below only target the new trg_audit_* names, so the
--   existing triggers above are untouched.
--
-- Gaps addressed:
--   SCHEDULE-01 (CRITICAL) — no audit trigger on schedule_items.
--   SCHEDULE-02 (CRITICAL) — no audit trigger on schedule_boards.
--   SCHEDULE-03 (CRITICAL) — fn_generic_entity_audit() would silently skip rows with
--                            organization_id IS NULL. fn_audit_schedule_with_sentinel()
--                            resolves this by substituting the sentinel UUID.


-- ============================================================
-- 1. fn_audit_schedule_with_sentinel()
-- ============================================================
-- Shared by schedule_items and schedule_boards.
--
-- Org is resolved directly from NEW/OLD.organization_id (Strategy A).
-- entity_id = row id (neither table has a separate entity_id column).
-- Global / system rows (organization_id IS NULL): sentinel UUID substituted so
-- the audit row is written and is queryable by service_role.
--
-- Noise columns excluded from UPDATE diff: 'updated_at', 'created_at',
-- 'duration_minutes' (GENERATED ALWAYS column on schedule_items — derived from
-- start_datetime/end_datetime, so it carries no independent semantic change).

CREATE OR REPLACE FUNCTION public.fn_audit_schedule_with_sentinel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Sentinel org for global / system schedule rows (organization_id IS NULL).
  -- Must never match a real org. Read-only via service_role.
  -- Same constant as fn_audit_uom_with_sentinel / fn_audit_brands_with_sentinel.
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';

  v_org_id         uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['updated_at', 'created_at', 'duration_minutes'];
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

  -- ── Resolve org_id and entity_id ─────────────────────────────────────────
  -- Neither schedule table has a separate entity_id column; the row's own id
  -- serves as entity_id.
  v_org_id    := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Sentinel substitution for global / system rows ───────────────────────
  -- Rows with organization_id IS NULL (e.g. is_system_board boards) use the
  -- sentinel so the audit row is still written and queryable by admins via
  -- service_role. Tag source as 'system' when no explicit source was set.
  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL THEN
      v_source := 'system';
    END IF;
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

REVOKE ALL ON FUNCTION public.fn_audit_schedule_with_sentinel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_schedule_with_sentinel() TO service_role;


-- ============================================================
-- 2. Trigger registrations
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE is idempotent (Postgres 13 does not support
-- CREATE OR REPLACE TRIGGER; DROP+CREATE is portable across Supabase versions).
--
-- These DROP statements only target the new trg_audit_* names. Existing baseline
-- triggers (log_schedule_item_changes, trg_prevent_schedule_items_on_holidays,
-- update_schedule_items_updated_at, update_schedule_boards_updated_at) are NOT
-- referenced and remain intact.
--
-- Alphabetical execution order (same timing, same event): trg_audit_* sorts after
-- update_*_updated_at so the audit trigger sees the final updated_at value.

-- schedule_items — Strategy A, sentinel-aware (organization_id nullable).
DROP TRIGGER IF EXISTS trg_audit_schedule_items ON public.schedule_items;
CREATE TRIGGER trg_audit_schedule_items
  AFTER INSERT OR UPDATE OR DELETE ON public.schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_schedule_with_sentinel();

-- schedule_boards — Strategy A, sentinel-aware (organization_id nullable).
DROP TRIGGER IF EXISTS trg_audit_schedule_boards ON public.schedule_boards;
CREATE TRIGGER trg_audit_schedule_boards
  AFTER INSERT OR UPDATE OR DELETE ON public.schedule_boards
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_schedule_with_sentinel();


-- ============================================================
-- 3. Verification notes (for human review, not executed)
-- ============================================================
-- 1. Confirm triggers are registered and point to fn_audit_schedule_with_sentinel:
--
--   SELECT t.tgname, t.tgrelid::regclass AS tbl, p.proname AS function_name, t.tgenabled
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   WHERE t.tgrelid IN ('public.schedule_items'::regclass, 'public.schedule_boards'::regclass)
--     AND t.tgname LIKE 'trg_audit_%'
--   ORDER BY t.tgrelid::regclass, t.tgname;
--
-- Expected (2 rows):
--   trg_audit_schedule_boards | schedule_boards | fn_audit_schedule_with_sentinel | enabled
--   trg_audit_schedule_items  | schedule_items  | fn_audit_schedule_with_sentinel | enabled
--
-- 2. Confirm the pre-existing baseline triggers are still present (must NOT be dropped):
--
--   SELECT tgname, tgrelid::regclass
--   FROM pg_trigger
--   WHERE tgrelid IN ('public.schedule_items'::regclass, 'public.schedule_boards'::regclass)
--     AND NOT tgisinternal
--   ORDER BY tgrelid::regclass, tgname;
--
-- Expected to include: log_schedule_item_changes, trg_prevent_schedule_items_on_holidays,
--   update_schedule_items_updated_at (on schedule_items) and
--   update_schedule_boards_updated_at (on schedule_boards).
--
-- 3. Confirm no duplicate audit trigger per table:
--
--   SELECT tgrelid::regclass, tgname FROM pg_trigger
--   WHERE tgrelid IN ('public.schedule_items'::regclass, 'public.schedule_boards'::regclass)
--     AND tgname LIKE '%audit%';
--
-- Expected: exactly one trg_audit_* per table.
