import { useCallback } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WorkflowStage } from "@/components/leads/LeadWorkflowConfig";
import type { RuleGroup } from "@/components/leads/workflow/conditionCatalog";

export interface LeadQualificationRules {
  organization_id: string;
  mql_when: RuleGroup | null;
  sql_when: RuleGroup | null;
}

export interface LeadPipelineRulesData {
  stages: WorkflowStage[];
  qualificationRules: LeadQualificationRules | null;
}

/**
 * Query key builder exposed so callers that mutate `lead_workflow_stages` /
 * `lead_qualification_rules` outside this hook (e.g. via the
 * rpc_save_lead_workflow_stages RPC) can invalidate the shared cache
 * without importing the hook itself.
 */
export function leadPipelineRulesQueryKey(organizationId: string | null | undefined): QueryKey {
  return ["lead-pipeline-rules", organizationId ?? null];
}

async function fetchLeadPipelineRules(organizationId: string): Promise<LeadPipelineRulesData> {
  const [stagesRes, qualificationRes] = await Promise.all([
    (supabase.from("lead_workflow_stages") as any)
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("stage_order"),
    (supabase.from("lead_qualification_rules") as any)
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (stagesRes.error) throw stagesRes.error;
  if (qualificationRes.error) throw qualificationRes.error;

  return {
    stages: (stagesRes.data as WorkflowStage[]) || [],
    qualificationRules: (qualificationRes.data as LeadQualificationRules | null) ?? null,
  };
}

/**
 * Shared org-scoped fetch for the lead pipeline configuration: the org's
 * active `lead_workflow_stages` (ordered by stage_order) and its single
 * `lead_qualification_rules` row.
 *
 * Cache-busting: no `updated_at`-keyed cache-busting existed anywhere in
 * this flow before this hook (verified: LeadWorkflowConfig.tsx and
 * QualificationRulesTab.tsx both re-fetched manually via plain useEffect,
 * with no query key at all). This hook fixes that by exposing `invalidate`,
 * which callers must invoke after any successful save so every consumer of
 * this query key refetches — following the same react-query
 * useQueryClient().invalidateQueries({ queryKey }) convention already used
 * by useSidebarAlertCounts.ts.
 */
export function useLeadPipelineRules(organizationId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = leadPipelineRulesQueryKey(organizationId);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchLeadPipelineRules(organizationId as string),
    enabled: !!organizationId,
  });

  const invalidate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  return {
    stages: data?.stages ?? [],
    qualificationRules: data?.qualificationRules ?? null,
    isLoading,
    error,
    refetch,
    invalidate,
  };
}
