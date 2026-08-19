-- Fix Kanban/pill desync (Bug B): anew_leads.workflow_stage_id is only ever
-- rewritten by three explicit code paths (AnewLeadContactDialog, the
-- AnewLeadEditDialog -> rpc_update_lead flow, and the Kanban drag handler
-- persistKanbanStageDrop) — and all three only do it alongside an explicit
-- change of the literal `status` column. Confirmed by grep (see comment in
-- 20261111100000_pipeline_dirty_trigger_recursion_guard.sql): no trigger on
-- anew_leads itself recomputes workflow_stage_id on UPDATE.
--
-- Several other write paths change signals that compute_lead_stage_v2 /
-- evaluate_lead_signals_v2 depend on, WITHOUT touching `status`:
--   - handleBulkContactResultChange (AnewLeads.tsx) writes only
--     last_contact_result / last_contact_at.
--   - VisitReassignDialog writes only scheduled_visit_id (set/clear).
--   - AnewLeadContactDialog can also write scheduled_visit_id in isolation.
--   - handleAssociateClient writes only converted_to_client_id.
-- Result: the Kanban column (workflow_stage_id, persisted) silently drifts
-- from the pill/list (effective_status, recomputed live) whenever one of
-- these fields changes without an accompanying status change.
--
-- Fix: an AFTER UPDATE trigger that recomputes workflow_stage_id via the
-- existing compute_lead_stage_v2 engine, but ONLY when `status` did NOT
-- change. This deliberately avoids ever competing with the three paths
-- above, which already set the correct stage together with a status change
-- (e.g. a manual Kanban drag to a stage whose reached_when condition isn't
-- met yet must not be silently reverted by this trigger).

CREATE OR REPLACE FUNCTION public.fn_sync_lead_workflow_stage_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_stage_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW; -- defensive guard, same pattern as fn_mark_lead_pipeline_dirty
  END IF;

  v_new_stage_id := public.compute_lead_stage_v2(NEW.id);

  IF v_new_stage_id IS NOT NULL AND v_new_stage_id IS DISTINCT FROM NEW.workflow_stage_id THEN
    UPDATE public.anew_leads
    SET workflow_stage_id = v_new_stage_id,
        pipeline_dirty_at = NULL
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_lead_workflow_stage_id ON public.anew_leads;
CREATE TRIGGER trg_sync_lead_workflow_stage_id
  AFTER UPDATE ON public.anew_leads
  FOR EACH ROW
  WHEN (
    NEW.status IS NOT DISTINCT FROM OLD.status
    AND (
      NEW.last_contact_result IS DISTINCT FROM OLD.last_contact_result
      OR NEW.scheduled_visit_id IS DISTINCT FROM OLD.scheduled_visit_id
      OR NEW.converted_at IS DISTINCT FROM OLD.converted_at
      OR NEW.converted_to_contact_id IS DISTINCT FROM OLD.converted_to_contact_id
      OR NEW.converted_to_client_id IS DISTINCT FROM OLD.converted_to_client_id
    )
  )
  EXECUTE FUNCTION public.fn_sync_lead_workflow_stage_id();
