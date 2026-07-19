-- Close audit gap: creating or removing an organization-to-organization
-- relation produced zero entity_audit_log rows.
-- ============================================================
-- Found during a live audit of the Organizações -> "Relations" tab
-- (src/pages/OrganizationDetail.tsx, handleAddRelation/confirmRemoveRelation
-- around lines 519-546). Both calls already wrap the mutation in
-- withAuditContext(supabase, businessUserId, ...) (src/utils/auditContext.ts),
-- which sets app.audit_user_id / app.audit_source for the transaction, but
-- that context was never consumed on the DB side: confirmed live against the
-- linked remote DB that
--   SELECT * FROM pg_trigger WHERE tgrelid = 'anew_relations'::regclass
-- returns zero rows (not even a routine updated_at trigger), and
--   SELECT count(*) FROM entity_audit_log WHERE table_name = 'anew_relations'
-- returns 0, always. So every add/remove of a relation between two
-- organizations has been completely invisible to the audit trail since the
-- table was introduced.
--
-- anew_relations(id uuid, source_org_id uuid, target_org_id uuid,
-- relation_type text, relation_label text, description text,
-- is_bidirectional boolean, metadata jsonb, created_by uuid,
-- created_at timestamptz) confirmed live via information_schema.columns —
-- notably there is NO organization_id column and NO updated_at column, so
-- this cannot reuse fn_generic_entity_audit() (see 20260625010000) as-is:
-- org must be resolved from source_org_id (the org that owns/initiated the
-- relation, matching how the frontend queries "outgoing" relations via
-- .eq("source_org_id", id)), and there is no separate parent-entity concept
-- to key off — each relation row is the whole unit of change (added or
-- removed outright), never field-edited. The frontend (checked again here)
-- only ever does .insert(...) in handleAddRelation and .delete().eq("id", ...)
-- in confirmRemoveRelation on this table — no UPDATE path exists, so the
-- trigger below only needs to cover INSERT and DELETE, matching actual usage.
--
-- This mirrors the precedent set in 20261110250000
-- (fn_audit_schedule_item_assignees) for schedule_item_assignees, another
-- table with no direct organization_id that needed its own bespoke audit
-- trigger function rather than the generic one: SECURITY DEFINER, pinned
-- search_path, actor resolved via the app.audit_user_id GUC falling back to
-- current_business_user_id(), source resolved via the app.audit_source GUC,
-- the entity_audit_log INSERT wrapped in its own BEGIN/EXCEPTION so the audit
-- write can never fail the real DML, and the whole function body wrapped in
-- an outer EXCEPTION WHEN OTHERS that still returns NEW/OLD.
--
-- Fix: add fn_audit_anew_relations() + trg_audit_anew_relations
-- (AFTER INSERT OR DELETE), entity_id = the relation's own id (there is no
-- other natural entity to key off), organization_id resolved from
-- COALESCE(NEW.source_org_id, OLD.source_org_id), full_record = to_jsonb(NEW)
-- on INSERT / to_jsonb(OLD) on DELETE, changed_fields left NULL (no diffed
-- UPDATE case exists for this table).

CREATE OR REPLACE FUNCTION public.fn_audit_anew_relations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_relation_id uuid;
  v_org_id      uuid;
  v_user_id     uuid;
  v_source      text;
  v_record      jsonb;
BEGIN
  v_relation_id := COALESCE((to_jsonb(NEW) ->> 'id')::uuid, (to_jsonb(OLD) ->> 'id')::uuid);
  v_org_id      := COALESCE((to_jsonb(NEW) ->> 'source_org_id')::uuid, (to_jsonb(OLD) ->> 'source_org_id')::uuid);

  IF v_org_id IS NULL THEN
    -- Cannot determine the owning organization — skip silently rather than
    -- polluting the log with an unattributable row.
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_source := nullif(current_setting('app.audit_source', true), '');

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
      (v_org_id, v_relation_id, TG_TABLE_NAME, TG_OP,
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

REVOKE ALL ON FUNCTION public.fn_audit_anew_relations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_anew_relations() TO service_role;

DROP TRIGGER IF EXISTS trg_audit_anew_relations ON public.anew_relations;
CREATE TRIGGER trg_audit_anew_relations
  AFTER INSERT OR DELETE ON public.anew_relations
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_anew_relations();

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Adding a relation between two organizations (handleAddRelation, INSERT
--    into anew_relations) now produces exactly one entity_audit_log row with
--    table_name = 'anew_relations', operation = 'INSERT', entity_id = the new
--    relation's id, organization_id = the relation's source_org_id,
--    full_record = the full inserted row as jsonb, and changed_by matching
--    the businessUserId passed to withAuditContext.
-- 2. Removing a relation (confirmRemoveRelation, DELETE) now produces exactly
--    one entity_audit_log row with operation = 'DELETE', full_record = the
--    deleted row's prior state, and the same organization_id/changed_by
--    resolution as above.
-- 3. SELECT * FROM pg_trigger WHERE tgrelid = 'anew_relations'::regclass now
--    returns the trg_audit_anew_relations row (previously zero rows).
-- 4. Neither the INSERT nor the DELETE on anew_relations can be blocked by a
--    failure inside the audit trigger — both the inner INSERT into
--    entity_audit_log and the whole function body are wrapped in
--    EXCEPTION WHEN OTHERS that still returns NEW/OLD.
-- 5. No UPDATE trigger was added because OrganizationDetail.tsx has no
--    UPDATE call against anew_relations — only .insert(...) and
--    .delete().eq("id", ...).
