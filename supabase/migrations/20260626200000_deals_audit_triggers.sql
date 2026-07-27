-- Deals Audit Triggers — Phase 2 extension
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_deal_child()  — covers deal_needs and deal_need_items
--   2. fn_audit_pipeline_link() — covers pipeline_links
--   3. Triggers on the three tables
--
-- Both functions follow the exact same conventions as fn_generic_entity_audit()
-- in 20260625010000_entity_audit_log.sql:
--   • SECURITY DEFINER + pinned search_path
--   • Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   • UPDATE rows skipped when only noise columns changed
--   • Any exception is swallowed so the audit trigger never blocks originating DML
--   • changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)

-- ============================================================
-- 1. fn_audit_deal_child()
-- ============================================================
-- Handles: deal_needs, deal_need_items
--
-- org / entity resolution:
--   deal_needs      → deals.organization_id / deals.entity_id  via deal_needs.deal_id
--   deal_need_items → deal_needs.deal_id → deals.*             via deal_need_items.deal_need_id

CREATE OR REPLACE FUNCTION public.fn_audit_deal_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.fn_audit_deal_child() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_deal_child()
  TO service_role;

-- ============================================================
-- 2. fn_audit_pipeline_link()
-- ============================================================
-- Handles: pipeline_links
--
-- pipeline_links carries organization_id directly.
-- entity_id is resolved via deals.entity_id for the linked deal_id.
-- If deal_id is NULL on the row the entity_id is left NULL; the audit row is
-- still written because org context is sufficient and pipeline_links can exist
-- without a deal (lead-only or proposal-only links).

CREATE OR REPLACE FUNCTION public.fn_audit_pipeline_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  v_deal_id       uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── organization_id — carried directly on the row ────────────────────────
  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );

  -- Cannot determine org — skip silently.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── entity_id — look up via the linked deal ───────────────────────────────
  v_deal_id := COALESCE(
    (to_jsonb(NEW) ->> 'deal_id')::uuid,
    (to_jsonb(OLD) ->> 'deal_id')::uuid
  );

  IF v_deal_id IS NOT NULL THEN
    SELECT d.entity_id
    INTO   v_entity_id
    FROM   public.deals d
    WHERE  d.id = v_deal_id
    LIMIT 1;
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
$$;

REVOKE ALL ON FUNCTION public.fn_audit_pipeline_link() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_pipeline_link()
  TO service_role;

-- ============================================================
-- 3. Triggers
-- ============================================================

-- deal_needs
DROP TRIGGER IF EXISTS trg_audit_deal_needs ON public.deal_needs;
CREATE TRIGGER trg_audit_deal_needs
  AFTER INSERT OR UPDATE OR DELETE ON public.deal_needs
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deal_child();

-- deal_need_items
DROP TRIGGER IF EXISTS trg_audit_deal_need_items ON public.deal_need_items;
CREATE TRIGGER trg_audit_deal_need_items
  AFTER INSERT OR UPDATE OR DELETE ON public.deal_need_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deal_child();

-- pipeline_links
DROP TRIGGER IF EXISTS trg_audit_pipeline_links ON public.pipeline_links;
CREATE TRIGGER trg_audit_pipeline_links
  AFTER INSERT OR UPDATE OR DELETE ON public.pipeline_links
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_pipeline_link();
