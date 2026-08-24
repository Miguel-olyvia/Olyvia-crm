// Resolve proposal_workflow_stages.id for an organization + candidate stage names,
// mirroring the org-scoped-then-global fallback used in src/pages/Proposals.tsx (loadWorkflowStages).
// Fail-soft: never throws, returns null if no stage is found so callers can still update status alone.

export async function resolveProposalStageId(
  supabase: any,
  organizationId: string | null | undefined,
  names: string[],
): Promise<string | null> {
  try {
    if (organizationId) {
      const { data: orgStage } = await supabase
        .from("proposal_workflow_stages")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .in("name", names)
        .limit(1)
        .maybeSingle();
      if (orgStage?.id) return orgStage.id;
    }

    const { data: globalStage } = await supabase
      .from("proposal_workflow_stages")
      .select("id")
      .is("organization_id", null)
      .eq("is_active", true)
      .in("name", names)
      .limit(1)
      .maybeSingle();
    return globalStage?.id ?? null;
  } catch (e) {
    console.error("[resolveProposalStageId] non-fatal", e);
    return null;
  }
}
