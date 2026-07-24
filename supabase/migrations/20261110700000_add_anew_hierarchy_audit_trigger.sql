-- anew_hierarchy has no organization_id column (it links two orgs via
-- parent_org_id/child_org_id) and had zero audit trigger coverage — found
-- during an action-by-action audit sweep comparing every documented module
-- action against the live list of trg_audit_* triggers, then confirmed live:
-- a direct INSERT into anew_hierarchy (the path used by
-- ChildOrganizationsTree.tsx, OrgChartAddDialog.tsx and
-- OrganizationDetail.tsx's Relations tab, all of which write directly via
-- PostgREST rather than through rpc_create_organization_with_hierarchy)
-- produced zero entity_audit_log rows.
--
-- rpc_create_organization_with_hierarchy already covers its own hierarchy
-- insert via a manual fn_manual_audit_log() call bundled into the new org's
-- own audit row (table_name = 'anew_organizations'), so this trigger only
-- fires for changes NOT already covered by that bypass (app.audit_bypass).
--
-- Because a hierarchy row affects two distinct organizations' views of their
-- structure, one row is written per side so both parent and child orgs see
-- the change in their own audit log.

CREATE OR REPLACE FUNCTION public.fn_audit_anew_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_parent_org_id  uuid;
  v_child_org_id   uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['updated_at'];
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

  v_parent_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'parent_org_id')::uuid,
    (to_jsonb(OLD) ->> 'parent_org_id')::uuid
  );
  v_child_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'child_org_id')::uuid,
    (to_jsonb(OLD) ->> 'child_org_id')::uuid
  );
  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

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
    IF v_parent_org_id IS NOT NULL THEN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, table_name, operation,
         changed_fields, full_record, changed_by, source, created_at)
      VALUES
        (v_parent_org_id, v_entity_id, TG_TABLE_NAME, TG_OP,
         v_changed_fields, v_record,
         COALESCE(v_user_id, public.current_business_user_id()), v_source, now());
    END IF;

    IF v_child_org_id IS NOT NULL AND v_child_org_id IS DISTINCT FROM v_parent_org_id THEN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, table_name, operation,
         changed_fields, full_record, changed_by, source, created_at)
      VALUES
        (v_child_org_id, v_entity_id, TG_TABLE_NAME, TG_OP,
         v_changed_fields, v_record,
         COALESCE(v_user_id, public.current_business_user_id()), v_source, now());
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

CREATE TRIGGER trg_audit_anew_hierarchy
  AFTER INSERT OR UPDATE OR DELETE ON public.anew_hierarchy
  FOR EACH ROW EXECUTE FUNCTION fn_audit_anew_hierarchy();
