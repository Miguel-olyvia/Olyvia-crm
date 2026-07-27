-- Fix: fn_audit_uom_with_sentinel was missing the app.audit_bypass guard.
--
-- Bug: unlike ~30 other audit triggers in the system, the trigger function
-- backing trg_audit_uom (AFTER INSERT/UPDATE/DELETE on public.uom) never
-- checked app.audit_bypass. Business RPCs that write a single consolidated
-- audit row via fn_manual_audit_log() set app.audit_bypass = 'on' (SET LOCAL)
-- specifically so downstream per-table audit triggers skip writing their own
-- row, keeping exactly one audit log row per business action. Without the
-- guard here, any future atomic RPC that writes to public.uom while bypass is
-- active would still produce a duplicate/extra row from this trigger.
--
-- Impact today: none currently exercised in production — no RPC/migration
-- currently sets app.audit_bypass and writes to public.uom (confirmed via
-- investigation of all migrations). Adding the guard defensively, consistent
-- with the standard pattern used by the other audit triggers (e.g.
-- fn_audit_brands_with_sentinel, fn_audit_product_categories_with_sentinel).
--
-- Fix: add the standard early-return bypass check as the first statement of
-- the function body, mirroring the other audit trigger functions.

CREATE OR REPLACE FUNCTION public.fn_audit_uom_with_sentinel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Sentinel org for global UoMs (organization_id IS NULL).
  -- Must never match a real org. Read-only via service_role.
  -- Same constant as fn_audit_brands_with_sentinel and fn_audit_product_categories_with_sentinel.
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

  -- Audit bypass:
  -- When a business RPC has already written a single consolidated audit row via
  -- fn_manual_audit_log(), it sets app.audit_bypass='on' (SET LOCAL) so this
  -- trigger writes nothing and the action produces exactly one log row. This
  -- guard was missing here (unlike ~30 other audit triggers in the system).
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ─────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve org_id and entity_id ─────────────────────────────────────────
  -- uom has no separate entity_id column; the row's own id serves as entity_id.
  v_org_id    := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  -- ── Sentinel substitution for global UoMs ────────────────────────────────
  -- Global UoMs have organization_id IS NULL. Use the sentinel so the audit
  -- row is still written and queryable by admins via service_role.
  -- Tag source as 'system' when no explicit source was set, to distinguish
  -- admin-via-sentinel rows from normal org-scoped writes.
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
$function$
;
