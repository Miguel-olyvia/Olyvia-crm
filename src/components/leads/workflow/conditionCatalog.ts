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
  | "qualification_is"
  | "last_contact_result"
  | "has_negative_result"
  | "has_positive_result";

export type RuleCondition =
  | { type: "has_assignee" }
  | { type: "has_active_deal" }
  | { type: "has_active_quote" }
  | { type: "has_active_proposal" }
  | { type: "has_signed_contract" }
  | { type: "status_in"; values: string[] }
  | { type: "qualification_is"; value: "mql" | "sql" }
  | { type: "last_contact_result"; result_id: string; is: boolean }
  | { type: "has_negative_result" }
  | { type: "has_positive_result" };

export interface RuleGroup {
  op: "AND" | "OR";
  conditions: RuleCondition[];
}

/** Loaded live from lead_contact_results (global + org) - see StageRulesEditor. */
export interface ContactResultOption {
  id: string;
  name: string;
}

export const CONDITION_CATALOG: Array<{ type: RuleConditionType; label: string; hasParams: boolean }> = [
  { type: "has_assignee", label: "Tem comercial atribuído", hasParams: false },
  { type: "has_active_deal", label: "Tem deals ativos", hasParams: false },
  { type: "has_active_quote", label: "Tem orçamentos ativos", hasParams: false },
  { type: "has_active_proposal", label: "Tem propostas ativas", hasParams: false },
  { type: "has_signed_contract", label: "Tem contrato assinado", hasParams: false },
  { type: "status_in", label: "Status literal em lista", hasParams: true },
  { type: "qualification_is", label: "Tipo de qualificação (MQL/SQL)", hasParams: true },
  { type: "last_contact_result", label: "Último resultado de contacto", hasParams: true },
  { type: "has_negative_result", label: "Tem algum resultado negativo", hasParams: false },
  { type: "has_positive_result", label: "Tem algum resultado positivo", hasParams: false },
];

export function defaultConditionForType(type: RuleConditionType, firstResultId?: string): RuleCondition {
  switch (type) {
    case "status_in":
      return { type: "status_in", values: [] };
    case "qualification_is":
      return { type: "qualification_is", value: "mql" };
    case "last_contact_result":
      return { type: "last_contact_result", result_id: firstResultId ?? "", is: true };
    default:
      return { type };
  }
}

export function conditionSummary(condition: RuleCondition, contactResults: ContactResultOption[] = []): string {
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
  if (condition.type === "last_contact_result") {
    const resultName = contactResults.find(r => r.id === condition.result_id)?.name ?? condition.result_id;
    return `Último contacto ${condition.is ? "é" : "não é"}: ${resultName}`;
  }
  return entry?.label ?? condition.type;
}

export function isEmptyRule(rule: RuleGroup | null | undefined): boolean {
  return !rule || !Array.isArray(rule.conditions) || rule.conditions.length === 0;
}
