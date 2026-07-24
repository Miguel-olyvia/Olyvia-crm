-- forms/form_steps/form_fields/form_districts and campaigns/campaign_districts/
-- campaign_organizations/campaign_sources had ZERO audit triggers — confirmed
-- independently by 4 live scope-audit test personas this session (every
-- create/edit/delete on these 8 tables produced no entity_audit_log row at
-- all, while every other module tested this session was correctly audited).
--
-- forms/campaigns have organization_id directly, so they get the same
-- generic trigger used across most of the app. The 6 child tables have no
-- organization_id column — they resolve it via their parent (form_id ->
-- forms.organization_id, campaign_id -> campaigns.organization_id),
-- mirroring the existing fn_audit_service_category() pattern for
-- self-referential/child tables without a direct organization_id.

CREATE OR REPLACE FUNCTION public.fn_audit_form_child()
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
  v_noise_cols     text[] := ARRAY['updated_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_form_id        uuid;
BEGIN
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_source := nullif(current_setting('app.audit_source', true), '');

  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  v_form_id := COALESCE(
    (to_jsonb(NEW) ->> 'form_id')::uuid,
    (to_jsonb(OLD) ->> 'form_id')::uuid
  );

  IF v_form_id IS NOT NULL THEN
    SELECT organization_id INTO v_org_id FROM public.forms WHERE id = v_form_id;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.fn_audit_campaign_child()
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
  v_noise_cols     text[] := ARRAY['updated_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_campaign_id    uuid;
BEGIN
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_source := nullif(current_setting('app.audit_source', true), '');

  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

  v_campaign_id := COALESCE(
    (to_jsonb(NEW) ->> 'campaign_id')::uuid,
    (to_jsonb(OLD) ->> 'campaign_id')::uuid
  );

  IF v_campaign_id IS NOT NULL THEN
    SELECT organization_id INTO v_org_id FROM public.campaigns WHERE id = v_campaign_id;
  END IF;

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
$function$;

-- forms/campaigns: organization_id directly, use the app-wide generic trigger.
CREATE TRIGGER trg_audit_forms
  AFTER INSERT OR UPDATE OR DELETE ON public.forms
  FOR EACH ROW EXECUTE FUNCTION fn_generic_entity_audit();

CREATE TRIGGER trg_audit_campaigns
  AFTER INSERT OR UPDATE OR DELETE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION fn_generic_entity_audit();

-- Form child tables: resolve org via forms.organization_id.
CREATE TRIGGER trg_audit_form_steps
  AFTER INSERT OR UPDATE OR DELETE ON public.form_steps
  FOR EACH ROW EXECUTE FUNCTION fn_audit_form_child();

CREATE TRIGGER trg_audit_form_fields
  AFTER INSERT OR UPDATE OR DELETE ON public.form_fields
  FOR EACH ROW EXECUTE FUNCTION fn_audit_form_child();

CREATE TRIGGER trg_audit_form_districts
  AFTER INSERT OR UPDATE OR DELETE ON public.form_districts
  FOR EACH ROW EXECUTE FUNCTION fn_audit_form_child();

-- Campaign child tables: resolve org via campaigns.organization_id.
CREATE TRIGGER trg_audit_campaign_districts
  AFTER INSERT OR UPDATE OR DELETE ON public.campaign_districts
  FOR EACH ROW EXECUTE FUNCTION fn_audit_campaign_child();

CREATE TRIGGER trg_audit_campaign_organizations
  AFTER INSERT OR UPDATE OR DELETE ON public.campaign_organizations
  FOR EACH ROW EXECUTE FUNCTION fn_audit_campaign_child();

CREATE TRIGGER trg_audit_campaign_sources
  AFTER INSERT OR UPDATE OR DELETE ON public.campaign_sources
  FOR EACH ROW EXECUTE FUNCTION fn_audit_campaign_child();
