import { LEAD_STATUS_OPTIONS } from "@/components/leads/LeadWorkflowConfig";

/**
 * Mirrors the condition catalog evaluated by public.stage_reached() (see
 * migration 20261110510000). Types/shapes here must stay in lockstep with
 * that SQL function - it is the canonical evaluator, this is just the UI
 * that builds its input.
 */
export type RuleConditionType =
  | "has_assignee"
  | "has_active_deal"
  | "has_active_quote"
  | "has_active_proposal"
  | "has_signed_contract"
  | "status_in"
  | "qualification_is";

export type RuleCondition =
  | { type: "has_assignee" }
  | { type: "has_active_deal" }
  | { type: "has_active_quote" }
  | { type: "has_active_proposal" }
  | { type: "has_signed_contract" }
  | { type: "status_in"; values: string[] }
  | { type: "qualification_is"; value: "mql" | "sql" };

export interface RuleGroup {
  op: "AND" | "OR";
  conditions: RuleCondition[];
}

export const CONDITION_CATALOG: Array<{ type: RuleConditionType; label: string; hasParams: boolean }> = [
  { type: "has_assignee", label: "Tem comercial atribuído", hasParams: false },
  { type: "has_active_deal", label: "Tem deals ativos", hasParams: false },
  { type: "has_active_quote", label: "Tem orçamentos ativos", hasParams: false },
  { type: "has_active_proposal", label: "Tem propostas ativas", hasParams: false },
  { type: "has_signed_contract", label: "Tem contrato assinado", hasParams: false },
  { type: "status_in", label: "Status literal em lista", hasParams: true },
  { type: "qualification_is", label: "Tipo de qualificação (MQL/SQL)", hasParams: true },
];

export function defaultConditionForType(type: RuleConditionType): RuleCondition {
  switch (type) {
    case "status_in":
      return { type: "status_in", values: [] };
    case "qualification_is":
      return { type: "qualification_is", value: "mql" };
    default:
      return { type };
  }
}

export function conditionSummary(condition: RuleCondition): string {
  const entry = CONDITION_CATALOG.find(c => c.type === condition.type);
  if (condition.type === "status_in") {
    const labels = condition.values
      .map(v => LEAD_STATUS_OPTIONS.find(o => o.value === v)?.label || v)
      .join(", ");
    return `Status em: ${labels || "(nenhum selecionado)"}`;
  }
  if (condition.type === "qualification_is") {
    return `Qualificação = ${condition.value.toUpperCase()}`;
  }
  return entry?.label ?? condition.type;
}

export function isEmptyRule(rule: RuleGroup | null | undefined): boolean {
  return !rule || !Array.isArray(rule.conditions) || rule.conditions.length === 0;
}
