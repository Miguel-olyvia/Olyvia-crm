-- Fix: fn_audit_category_attributes was missing the app.audit_bypass guard
-- present in ~30 other audit trigger functions in this system.
--
-- Bug: when a business RPC writes a single consolidated audit row via
-- fn_manual_audit_log() and sets app.audit_bypass='on' (SET LOCAL) before
-- performing the underlying INSERT/UPDATE/DELETE on public.category_attributes,
-- this trigger (trg_audit_category_attributes, AFTER INSERT OR DELETE OR
-- UPDATE) would still fire and insert an extra row into
-- public.entity_audit_log, producing a duplicate/extra audit entry for the
-- same logical action.
--
-- No RPC currently exercises this path (category_attributes is only written
-- via direct RLS-gated client INSERT/UPDATE/DELETE today), so this fix is
-- defensive: it closes the gap before any future atomic
-- product_categories/category_attributes RPC is added, and brings this
-- trigger function in line with the standard bypass pattern used elsewhere.
--
-- Fix: add the standard bypass guard as the first statement of the function
-- body -- if app.audit_bypass is 'on', return immediately without writing
-- an audit row.

CREATE OR REPLACE FUNCTION public.fn_audit_category_attributes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_category_id    uuid;
  v_cat_parent_id  uuid;
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

  IF v_user_id IS NULL THEN
    v_user_id := public.current_business_user_id();
  END IF;

  -- ── Resolve source ────────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  IF v_user_id IS NULL AND v_source IS NULL THEN
    v_source := 'system';
  END IF;

  -- ── Resolve category_id ───────────────────────────────────────────────────
  v_category_id := COALESCE(
    (to_jsonb(NEW) ->> 'category_id')::uuid,
    (to_jsonb(OLD) ->> 'category_id')::uuid
  );

  -- ── Resolve org_id and entity_id via the category row ────────────────────
  -- entity_id = parent category id (groups attribute audit rows under category timeline).
  IF v_category_id IS NOT NULL THEN
    SELECT pc.organization_id,
           pc.id,
           COALESCE(pc.parent_id, pc.parent_category_id)
    INTO   v_org_id, v_entity_id, v_cat_parent_id
    FROM   public.product_categories pc
    WHERE  pc.id = v_category_id
    LIMIT  1;
  END IF;

  -- ── Parent-chain walk when category is a subcategory with NULL org (SUB-004) ──
  -- If the resolved category has no organization_id but has a parent, the category
  -- is a subcategory. Walk the parent chain to find the real org rather than
  -- falling through to sentinel substitution.
  IF v_org_id IS NULL AND v_cat_parent_id IS NOT NULL THEN
    v_org_id := public.get_product_category_org_id(v_cat_parent_id);
  END IF;

  -- ── Sentinel substitution ─────────────────────────────────────────────────
  -- Only for global root categories (no parent, no org) or fully unresolvable chains.
  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
    IF v_source IS NULL OR v_source != 'system' THEN
      v_source := 'system';
    END IF;
  END IF;

  -- entity_id fallback: if category lookup failed entirely, use the attribute row's own id.
  IF v_entity_id IS NULL THEN
    v_entity_id := COALESCE(
      (to_jsonb(NEW) ->> 'id')::uuid,
      (to_jsonb(OLD) ->> 'id')::uuid
    );
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
       v_user_id,
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
