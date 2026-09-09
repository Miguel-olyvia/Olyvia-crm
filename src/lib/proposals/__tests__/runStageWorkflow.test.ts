/**
 * The proposal stage automation is best-effort by design: the stage change has
 * already been committed when it runs, so a failure must NOT surface to the
 * user as an error — the caller only downgrades its success toast to a warning.
 *
 * That deliberate swallowing is exactly what made it invisible in production:
 * an `execute-workflow` outage (an RLS change, a bad deploy) died in a
 * `console.error` in the commercial's browser and nobody found out for days.
 *
 * These tests lock down both halves of the fix:
 *  1. a failure is reported to Sentry, tagged `proposal-workflow`;
 *  2. the flow still behaves exactly as before — it resolves with
 *     `workflowFailed === true` and never throws at the caller.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invoke = vi.fn();
const captureException = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

vi.mock("@sentry/react", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { runProposalStageWorkflow } from "@/lib/proposals/runStageWorkflow";

const INPUT = {
  entityId: "proposal-1",
  newStageId: "stage-sent",
  oldStageId: "stage-draft",
  organizationId: "org-1",
  triggeredBy: "user-1",
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  invoke.mockReset();
  captureException.mockReset();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("runProposalStageWorkflow", () => {
  it("reports to Sentry, tagged proposal-workflow, when the edge function returns an error", async () => {
    const edgeError = new Error("permission denied for function execute_workflow");
    invoke.mockResolvedValue({ data: null, error: edgeError });

    const workflowFailed = await runProposalStageWorkflow(INPUT);

    expect(workflowFailed).toBe(true);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(edgeError, {
      tags: { flow: "proposal-workflow" },
    });
  });

  it("reports to Sentry when the invocation itself rejects", async () => {
    const networkError = new Error("Failed to fetch");
    invoke.mockRejectedValue(networkError);

    const workflowFailed = await runProposalStageWorkflow(INPUT);

    expect(workflowFailed).toBe(true);
    expect(captureException).toHaveBeenCalledWith(networkError, {
      tags: { flow: "proposal-workflow" },
    });
  });

  it("does not change the caller's behaviour: it resolves instead of throwing", async () => {
    invoke.mockRejectedValue(new Error("boom"));

    // The assertion that matters for the user: awaiting this never rejects, so
    // the caller's own try/catch (which shows a destructive toast) is not hit
    // and the success toast still renders, only with the workflow warning.
    await expect(runProposalStageWorkflow(INPUT)).resolves.toBe(true);
  });

  it("keeps the local console.error signal alongside the Sentry report", async () => {
    const edgeError = new Error("boom");
    invoke.mockResolvedValue({ data: null, error: edgeError });

    await runProposalStageWorkflow(INPUT);

    expect(consoleErrorSpy).toHaveBeenCalledWith("Workflow execution error:", edgeError);
  });

  it("still resolves when Sentry itself blows up (observability must not break the flow)", async () => {
    invoke.mockRejectedValue(new Error("boom"));
    captureException.mockImplementation(() => {
      throw new Error("Sentry not initialised");
    });

    await expect(runProposalStageWorkflow(INPUT)).resolves.toBe(true);
  });

  it("reports nothing and flags no failure on success", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });

    const workflowFailed = await runProposalStageWorkflow(INPUT);

    expect(workflowFailed).toBe(false);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("sends the stage transition the edge function expects", async () => {
    invoke.mockResolvedValue({ data: null, error: null });

    await runProposalStageWorkflow(INPUT);

    expect(invoke).toHaveBeenCalledWith("execute-workflow", {
      body: {
        source_entity: "proposal",
        entity_id: "proposal-1",
        new_stage_id: "stage-sent",
        old_stage_id: "stage-draft",
        organization_id: "org-1",
        triggered_by: "user-1",
      },
    });
  });
});
