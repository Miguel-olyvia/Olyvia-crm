-- Fix: fn_audit_product_attribute_value_prices was missing the
-- app.audit_bypass guard present in ~30 other audit trigger functions in
-- this system.
--
-- Bug: when a business RPC writes a single consolidated audit row via
-- fn_manual_audit_log() and sets app.audit_bypass='on' (SET LOCAL) before
-- performing the underlying INSERT/UPDATE/DELETE on
-- public.product_attribute_value_prices, this function -- if ever bound to
-- a trigger on that table again -- would still fire and insert an extra row
-- into public.entity_audit_log, producing a duplicate/extra audit entry for
-- the same logical action.
--
-- Note: this function is not currently attached to any trigger. The live
-- trigger on public.product_attribute_value_prices
-- (trg_audit_product_attribute_value_prices) calls
-- fn_audit_product_attribute_value_prices_sentinel(), which already has this
-- guard (added in 20260810010000_product_attributes_audit_bypass_and_rpcs.sql).
-- This fix closes the drift in the orphaned function defensively, so it is
-- safe and consistent with the standard bypass pattern in case it is ever
-- re-bound to a trigger in the future.
--
-- Fix: add the standard bypass guard as the first statement of the function
-- body -- if app.audit_bypass is 'on', return immediately without writing
-- an audit row.

CREATE OR REPLACE FUNCTION public.fn_audit_product_attribute_value_prices()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Audit bypass:
  -- When a business RPC has already written a single consolidated audit row via
  -- fn_manual_audit_log(), it sets app.audit_bypass='on' (SET LOCAL) so this
  -- trigger writes nothing and the action produces exactly one log row. This
  -- guard was missing here (unlike ~30 other audit triggers in the system).
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
$function$
