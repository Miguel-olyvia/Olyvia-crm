import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";

export interface StageWorkflowInput {
  entityId: string;
  newStageId: string;
  oldStageId: string | null | undefined;
  organizationId: string | null | undefined;
  triggeredBy: string;
}

/**
 * Fires the `execute-workflow` edge function for a proposal stage transition.
 *
 * The automation is intentionally best-effort: the stage change itself already
 * committed, so a workflow failure must never surface as a hard error to the
 * user — callers only downgrade their success toast to a warning. That is
 * exactly why it used to die in a `console.error` and nobody found out. The
 * console line stays for local debugging; `captureFlowError` makes the same
 * failure visible in Sentry under the `proposal-workflow` tag.
 *
 * Returns `true` when the workflow failed (the caller's `workflowFailed` flag).
 * Never throws.
 */
export async function runProposalStageWorkflow(input: StageWorkflowInput): Promise<boolean> {
  try {
    const { error: workflowError } = await supabase.functions.invoke("execute-workflow", {
      body: {
        source_entity: "proposal",
        entity_id: input.entityId,
        new_stage_id: input.newStageId,
        old_stage_id: input.oldStageId,
        organization_id: input.organizationId,
        triggered_by: input.triggeredBy,
      },
    });
    if (workflowError) throw workflowError;
    return false;
  } catch (workflowError) {
    console.error("Workflow execution error:", workflowError);
    captureFlowError(workflowError, "proposal-workflow");
    return true;
  }
}
