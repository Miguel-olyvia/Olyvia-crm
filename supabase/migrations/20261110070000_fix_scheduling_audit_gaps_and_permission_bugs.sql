-- Fix 2 confirmed bugs + 1 audit gap from live E2E audit of the Scheduling module (org Nike):
--
-- NOTE on the "Super Admin didn't bypass scheduling.create/delete" symptom
-- seen live: this is NOT fixed here via get_user_context()/is_system_admin.
-- Investigation (independent security review) found 20260622114000
-- deliberately narrowed that flag's bypass to the literal 'system_admin'
-- platform role as an intentional least-privilege hardening — it explicitly
-- grants 'super_admin' every non-platform permission code individually
-- instead, precisely so tenant admin access is governed by granular,
-- auditable, revocable codes rather than a blanket bypass flag. Re-widening
-- is_system_admin here would reintroduce a broad, previously-and-deliberately
-- -removed authorization bypass across Support Access impersonation, API
-- key/SMTP management, and scope overrides in Deals/Quotes/Proposals/
-- Contracts/Roles — well beyond Scheduling. The actual root cause of the
-- live symptom was simply that the frontend checked non-existent permission
-- strings ("scheduling.create"/"scheduling.delete"), fixed separately in
-- src/components/scheduling/ScheduleBoardsTab.tsx and src/pages/Scheduling.tsx
-- to use the real granular codes (scheduling.boards.create/delete,
-- scheduling.resources.create/delete, scheduling.items.create), which
-- super_admin already holds via 20260622114000's explicit grant.
--
-- 1. fn_manual_audit_log(...) ambiguous overload: 20261108130000 added a
--    7-parameter version (trailing p_record_id) via CREATE OR REPLACE, assuming
--    it would replace the original 6-parameter version. In Postgres, function
--    identity includes the parameter list, so a 7-param definition is a
--    DISTINCT overload from the 6-param one — both now coexist. Any call with
--    exactly 6 positional args (the ~90 pre-existing call sites, including
--    rpc_create_schedule_item) is now ambiguous between "6-param exact match"
--    and "7-param with p_record_id defaulted" — Postgres cannot choose,
--    confirmed live: every schedule-item creation fails with
--    "function ... is not unique" (HTTP 400), blocking the feature entirely
--    for all users. Fix: drop the old 6-param overload so only the 7-param
--    version (whose first 6 params are identical, with the same defaults)
--    remains — this is fully backward compatible with every existing 5- or
--    6-arg positional call.
--
-- 2. Missing audit-trigger coverage: schedule_resources, resource_service_areas,
--    auto_schedule_rules, schedule_settings, and schedule_holidays have zero
--    audit-trigger coverage (confirmed live: 0 rows in entity_audit_log for
--    create/update/delete on all five, verified via pg_trigger showing no
--    trg_audit_* trigger on any of them). schedule_boards/schedule_items
--    already share fn_audit_schedule_with_sentinel() (20260718010000,
--    20260726010000) — reused as-is for the four tables that carry their own
--    nullable organization_id column. resource_service_areas has no
--    organization_id column at all (only resource_id), so it gets a small
--    dedicated function that resolves org via a join to schedule_resources.

-- ============================================================
-- 1. Fix fn_manual_audit_log ambiguous overload
-- ============================================================
-- Drop the superseded 6-parameter version. The 7-parameter version
-- (20261108130000) has identical first-6-parameter defaults, so every
-- existing 5- or 6-arg positional call site continues to work unchanged,
-- with p_record_id simply defaulting to NULL as it always did before.
DROP FUNCTION IF EXISTS public.fn_manual_audit_log(text, uuid, uuid, text, jsonb, text);

-- ============================================================
-- 2. Audit-trigger coverage for the 5 previously-unaudited tables
-- ============================================================

-- schedule_resources / schedule_settings / schedule_holidays / auto_schedule_rules
-- all carry their own nullable organization_id column and their own id — same
-- shape as schedule_boards/schedule_items, so fn_audit_schedule_with_sentinel()
-- is reused as-is (no redefinition needed).

DROP TRIGGER IF EXISTS trg_audit_schedule_resources ON public.schedule_resources;
CREATE TRIGGER trg_audit_schedule_resources
  AFTER INSERT OR UPDATE OR DELETE ON public.schedule_resources
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_schedule_with_sentinel();

DROP TRIGGER IF EXISTS trg_audit_schedule_settings ON public.schedule_settings;
CREATE TRIGGER trg_audit_schedule_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.schedule_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_schedule_with_sentinel();

DROP TRIGGER IF EXISTS trg_audit_schedule_holidays ON public.schedule_holidays;
CREATE TRIGGER trg_audit_schedule_holidays
  AFTER INSERT OR UPDATE OR DELETE ON public.schedule_holidays
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_schedule_with_sentinel();

DROP TRIGGER IF EXISTS trg_audit_auto_schedule_rules ON public.auto_schedule_rules;
CREATE TRIGGER trg_audit_auto_schedule_rules
  AFTER INSERT OR UPDATE OR DELETE ON public.auto_schedule_rules
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_schedule_with_sentinel();

-- resource_service_areas has no organization_id column at all (only
-- resource_id) — resolve org via a join to schedule_resources, falling back
-- to the same sentinel UUID when the parent resource itself has no org.
CREATE OR REPLACE FUNCTION public.fn_audit_resource_service_areas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_org_id         uuid;
  v_entity_id      uuid;
  v_resource_id    uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
BEGIN
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_source := nullif(current_setting('app.audit_source', true), '');

  v_resource_id := COALESCE(
    (to_jsonb(NEW) ->> 'resource_id')::uuid,
    (to_jsonb(OLD) ->> 'resource_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  SELECT organization_id INTO v_org_id
  FROM public.schedule_resources
  WHERE id = v_resource_id;

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

REVOKE ALL ON FUNCTION public.fn_audit_resource_service_areas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_resource_service_areas() TO service_role;

DROP TRIGGER IF EXISTS trg_audit_resource_service_areas ON public.resource_service_areas;
CREATE TRIGGER trg_audit_resource_service_areas
  AFTER INSERT OR UPDATE OR DELETE ON public.resource_service_areas
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_resource_service_areas();
