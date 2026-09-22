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

/** Uma aresta do diagrama de fluxo (`lead_stage_transitions`). */
export interface LeadStageTransitionRow {
  id: string;
  from_stage_id: string;
  to_stage_id: string;
  label: string | null;
}

/**
 * Linha (única, por organização) de `lead_pipeline_settings`: posições
 * guardadas do diagrama + interruptor de restrição de transições + interruptor
 * do motor sequencial.
 *
 * `sequential_flow` é lido por `compute_lead_stage_v2`: a `true` a lead avança
 * um estágio de cada vez ao longo de `lead_stage_transitions`; a `false`
 * (default da coluna) mantém-se o motor histórico, que ordena por
 * `stage_order DESC` e salta directamente para o estágio mais avançado cujas
 * condições se verifiquem.
 */
export interface LeadPipelineSettings {
  organization_id: string;
  stage_positions: Record<string, { x: number; y: number }>;
  enforce_stage_transitions: boolean;
  sequential_flow: boolean;
}

export const DEFAULT_LEAD_PIPELINE_SETTINGS: Omit<LeadPipelineSettings, "organization_id"> =
  Object.freeze({
    stage_positions: Object.freeze({}) as Record<string, { x: number; y: number }>,
    enforce_stage_transitions: false,
    sequential_flow: false,
  });

export interface LeadPipelineRulesData {
  stages: WorkflowStage[];
  qualificationRules: LeadQualificationRules | null;
  settings: LeadPipelineSettings | null;
  transitions: LeadStageTransitionRow[];
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

/**
 * `stage_positions` é jsonb, por isso chega como `Json` — só aceitamos as
 * entradas com x/y numéricos e descartamos silenciosamente o resto, para que
 * uma linha corrompida nunca parta o diagrama.
 */
function normalizeStagePositions(raw: unknown): Record<string, { x: number; y: number }> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, { x: number; y: number }> = {};
  for (const [stageId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const { x, y } = value as { x?: unknown; y?: unknown };
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[stageId] = { x, y };
  }
  return out;
}

async function fetchLeadPipelineRules(organizationId: string): Promise<LeadPipelineRulesData> {
  const [stagesRes, qualificationRes, settingsRes, transitionsRes] = await Promise.all([
    (supabase.from("lead_workflow_stages") as any)
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("stage_order"),
    (supabase.from("lead_qualification_rules") as any)
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    (supabase.from("lead_pipeline_settings") as any)
      .select("organization_id, stage_positions, enforce_stage_transitions, sequential_flow")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    (supabase.from("lead_stage_transitions") as any)
      .select("id, from_stage_id, to_stage_id, label")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
  ]);

  if (stagesRes.error) throw stagesRes.error;
  if (qualificationRes.error) throw qualificationRes.error;
  if (settingsRes.error) throw settingsRes.error;
  if (transitionsRes.error) throw transitionsRes.error;

  const settingsRow = settingsRes.data as
    | {
        organization_id: string;
        stage_positions: unknown;
        enforce_stage_transitions: unknown;
        sequential_flow: unknown;
      }
    | null;

  return {
    stages: (stagesRes.data as WorkflowStage[]) || [],
    qualificationRules: (qualificationRes.data as LeadQualificationRules | null) ?? null,
    settings: settingsRow
      ? {
          organization_id: settingsRow.organization_id,
          stage_positions: normalizeStagePositions(settingsRow.stage_positions),
          enforce_stage_transitions: settingsRow.enforce_stage_transitions === true,
          sequential_flow: settingsRow.sequential_flow === true,
        }
      : null,
    transitions: (transitionsRes.data as LeadStageTransitionRow[]) || [],
  };
}

/**
 * Shared org-scoped fetch for the lead pipeline configuration: the org's
 * active `lead_workflow_stages` (ordered by stage_order), its single
 * `lead_qualification_rules` row, its single `lead_pipeline_settings` row
 * (diagram layout + transition-restriction switch) and the active
 * `lead_stage_transitions` edges.
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
    /** `null` enquanto não houver linha na BD — use os campos derivados abaixo. */
    settings: data?.settings ?? null,
    /** Default seguro: sem linha em `lead_pipeline_settings`, não se restringe nada. */
    enforceStageTransitions: data?.settings?.enforce_stage_transitions ?? false,
    /** Default seguro: sem linha, vale o default da coluna (motor histórico). */
    sequentialFlow: data?.settings?.sequential_flow ?? false,
    /** Default seguro: sem linha, não há layout guardado. */
    stagePositions: data?.settings?.stage_positions ?? DEFAULT_LEAD_PIPELINE_SETTINGS.stage_positions,
    /** Arestas ativas do diagrama; vazio quando a org nunca desenhou nenhuma. */
    transitions: data?.transitions ?? [],
    isLoading,
    error,
    refetch,
    invalidate,
  };
}
