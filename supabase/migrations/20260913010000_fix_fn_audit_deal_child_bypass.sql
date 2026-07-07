-- ============================================================
-- Fix: fn_audit_deal_child (trigger on deal_needs / deal_need_items)
-- was missing the standard app.audit_bypass guard present in ~30 other
-- audit trigger functions. rpc_update_deal_needs sets
-- app.audit_bypass='on' and writes one consolidated audit row via
-- fn_manual_audit_log(), but because this trigger ignored the flag,
-- every underlying INSERT/UPDATE/DELETE on deal_needs/deal_need_items
-- inside fn_apply_deal_need (delete-then-reinsert pattern for items)
-- fired an additional, unintended audit row -- confirmed live via
-- E2E testing: editing one need with one item produced 3-4 audit rows
-- for a single user action instead of 1, scaling with item count.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_deal_child()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_id        uuid;
  v_entity_id     uuid;
  v_record        jsonb;
  v_changed_fields jsonb;
  v_user_id       uuid;
  v_source        text;
  v_noise_cols    text[] := ARRAY['updated_at', 'created_at', 'search_text', 'contact_attempts', 'last_activity_at'];
  v_key           text;
  v_old_json      jsonb;
  v_new_json      jsonb;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- When a business RPC has already written a single consolidated audit row via
  -- fn_manual_audit_log(), it sets app.audit_bypass='on' (SET LOCAL) so this
  -- trigger writes nothing and the action produces exactly one log row. This
  -- guard was missing here (unlike ~30 other audit triggers), causing every
  -- deal_needs/deal_need_items write inside rpc_update_deal_needs to leak 1-2
  -- extra audit rows per action.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve organization_id and entity_id via parent deal ────────────────
  IF TG_TABLE_NAME = 'deal_needs' THEN
    SELECT d.organization_id, d.entity_id
    INTO   v_org_id, v_entity_id
    FROM   public.deals d
    WHERE  d.id = COALESCE(
             (to_jsonb(NEW) ->> 'deal_id')::uuid,
             (to_jsonb(OLD) ->> 'deal_id')::uuid
           )
    LIMIT 1;

  ELSIF TG_TABLE_NAME = 'deal_need_items' THEN
    SELECT d.organization_id, d.entity_id
    INTO   v_org_id, v_entity_id
    FROM   public.deal_needs dn
    JOIN   public.deals      d  ON d.id = dn.deal_id
    WHERE  dn.id = COALESCE(
             (to_jsonb(NEW) ->> 'deal_need_id')::uuid,
             (to_jsonb(OLD) ->> 'deal_need_id')::uuid
           )
    LIMIT 1;
  END IF;

  -- Cannot determine org — skip silently to avoid polluting the log.
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
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$
;
