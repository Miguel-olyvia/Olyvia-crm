/**
 * Mirrors the condition catalog evaluated by public.stage_reached() (see
 * migration 20261110580000). Types/shapes here must stay in lockstep with
 * that SQL function - it is the canonical evaluator, this is just the UI
 * that builds its input.
 *
 * Rule shape is {all:[...], any:[...]} (all must hold, any needs at least
 * one) - chosen over a single-group AND/OR toggle after comparing against
 * the equivalent rule builder already shipped in Lovable for the same
 * feature: real qualification rules are almost always "must have X and Y,
 * PLUS at least one of A/B/C", which a single toggle can't express without
 * nested groups.
 */
export type RuleCondition =
  | { type: "has_assignee" }
  | { type: "has_source" }
  | { type: "has_contact_logged" }
  | { type: "has_scheduled_visit" }
  | { type: "has_active_deal" }
  | { type: "has_active_quote" }
  | { type: "has_active_proposal" }
  | { type: "has_signed_contract" }
  | { type: "qualification_is"; value: "mql" | "sql" }
  | { type: "last_contact_is_negative" }
  | { type: "last_contact_is_positive" };

export interface RuleGroup {
  all: RuleCondition[];
  any: RuleCondition[];
}

export type RuleBucket = "none" | "all" | "any";

interface CatalogRow {
  key: string;
  label: string;
  build: () => RuleCondition;
  matches: (condition: RuleCondition) => boolean;
}

/** Exactly the 12 options requested (matches the reference rule builder). */
export const CONDITION_CATALOG: CatalogRow[] = [
  { key: "has_assignee", label: "Tem comercial atribuído",
    build: () => ({ type: "has_assignee" }), matches: c => c.type === "has_assignee" },
  { key: "has_source", label: "Tem canal/origem definida",
    build: () => ({ type: "has_source" }), matches: c => c.type === "has_source" },
  { key: "has_contact_logged", label: "Já foi contactada",
    build: () => ({ type: "has_contact_logged" }), matches: c => c.type === "has_contact_logged" },
  { key: "has_scheduled_visit", label: "Tem visita agendada",
    build: () => ({ type: "has_scheduled_visit" }), matches: c => c.type === "has_scheduled_visit" },
  { key: "has_active_deal", label: "Tem deal ativo",
    build: () => ({ type: "has_active_deal" }), matches: c => c.type === "has_active_deal" },
  { key: "has_active_quote", label: "Tem orçamento ativo",
    build: () => ({ type: "has_active_quote" }), matches: c => c.type === "has_active_quote" },
  { key: "has_active_proposal", label: "Tem proposta ativa",
    build: () => ({ type: "has_active_proposal" }), matches: c => c.type === "has_active_proposal" },
  { key: "has_signed_contract", label: "Tem contrato assinado",
    build: () => ({ type: "has_signed_contract" }), matches: c => c.type === "has_signed_contract" },
  { key: "qualification_is_mql", label: "Qualificação = MQL",
    build: () => ({ type: "qualification_is", value: "mql" }),
    matches: c => c.type === "qualification_is" && c.value === "mql" },
  { key: "qualification_is_sql", label: "Qualificação = SQL",
    build: () => ({ type: "qualification_is", value: "sql" }),
    matches: c => c.type === "qualification_is" && c.value === "sql" },
  { key: "last_contact_is_negative", label: "Último contacto negativo",
    build: () => ({ type: "last_contact_is_negative" }), matches: c => c.type === "last_contact_is_negative" },
  { key: "last_contact_is_positive", label: "Último contacto positivo",
    build: () => ({ type: "last_contact_is_positive" }), matches: c => c.type === "last_contact_is_positive" },
];

export function bucketForRow(rule: RuleGroup | null, row: CatalogRow): RuleBucket {
  if ((rule?.all ?? []).some(row.matches)) return "all";
  if ((rule?.any ?? []).some(row.matches)) return "any";
  return "none";
}

export function conditionForRow(rule: RuleGroup | null, row: CatalogRow): RuleCondition | undefined {
  return (rule?.all ?? []).find(row.matches) ?? (rule?.any ?? []).find(row.matches);
}

export function setBucketForRow(rule: RuleGroup | null, row: CatalogRow, bucket: RuleBucket): RuleGroup | null {
  const existing = conditionForRow(rule, row);
  const all = (rule?.all ?? []).filter(c => !row.matches(c));
  const any = (rule?.any ?? []).filter(c => !row.matches(c));

  if (bucket === "all") all.push(existing ?? row.build());
  else if (bucket === "any") any.push(existing ?? row.build());

  if (all.length === 0 && any.length === 0) return null;
  return { all, any };
}

export function isEmptyRule(rule: RuleGroup | null | undefined): boolean {
  return !rule || ((rule.all?.length ?? 0) === 0 && (rule.any?.length ?? 0) === 0);
}
