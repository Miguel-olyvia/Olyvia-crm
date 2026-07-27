-- Close audit gap: reassigning a technician/resource on an existing
-- schedule item produced zero entity_audit_log rows.
-- ============================================================
-- Found during a live UI audit of the Scheduling module: useScheduling.ts's
-- updateAssignees() runs whenever a schedule item is edited (regardless of
-- whether the assignee list actually changed), doing a direct
-- DELETE + INSERT on schedule_item_assignees -- but no audit trigger existed
-- on this table at all. Confirmed via query: zero entity_audit_log rows with
-- table_name='schedule_item_assignees' despite multiple assignee changes
-- during the audit session. Meanwhile schedule_items/schedule_boards already
-- have fn_audit_schedule_with_sentinel() (see 20260718010000).
--
-- schedule_item_assignees has no organization_id column (item_id, resource_id,
-- role, confirmed_at, created_at only) -- org is resolved via a lookup on the
-- parent schedule_items row. entity_id is set to item_id (not this table's own
-- id) so assignee-change rows group under the same schedule item's audit
-- trail as its other changes, consistent with how item creation already logs
-- the initial assignee set as part of its own consolidated diff.

CREATE OR REPLACE FUNCTION public.fn_audit_schedule_item_assignees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';

  v_item_id   uuid;
  v_org_id    uuid;
  v_user_id   uuid;
  v_source    text;
  v_record    jsonb;
BEGIN
  v_item_id := COALESCE((to_jsonb(NEW) ->> 'item_id')::uuid, (to_jsonb(OLD) ->> 'item_id')::uuid);

  SELECT organization_id INTO v_org_id
  FROM public.schedule_items
  WHERE id = v_item_id;

  IF v_org_id IS NULL THEN
    v_org_id := k_system_sentinel;
  END IF;

  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_source := nullif(current_setting('app.audit_source', true), '');
  IF v_source IS NULL AND v_org_id = k_system_sentinel THEN
    v_source := 'system';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_record := to_jsonb(NEW);
  ELSE
    v_record := to_jsonb(OLD);
  END IF;

  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id, v_item_id, TG_TABLE_NAME, TG_OP,
       NULL, v_record,
       COALESCE(v_user_id, public.current_business_user_id()),
       v_source, now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_schedule_item_assignees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_schedule_item_assignees() TO service_role;

DROP TRIGGER IF EXISTS trg_audit_schedule_item_assignees ON public.schedule_item_assignees;
CREATE TRIGGER trg_audit_schedule_item_assignees
  AFTER INSERT OR DELETE ON public.schedule_item_assignees
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_schedule_item_assignees();
