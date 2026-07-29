/**
 * Mirrors the condition catalog evaluated by evaluate_condition() /
 * evaluate_lead_signals_v2() (see migrations 20261110600000 and
 * 20261111200000). Types/shapes here must stay in lockstep with that SQL -
 * it is the canonical evaluator, this is just the UI that builds its input.
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
  | { type: "last_contact_is_positive" }
  | { type: "has_call_answered" }
  | { type: "has_email_sent" }
  | { type: "has_deal_won" }
  | { type: "has_visit_done" }
  | { type: "has_quote_open" }
  | { type: "has_quote_sent" }
  | { type: "has_quote_accepted" }
  | { type: "has_proposal_open" }
  | { type: "has_proposal_sent" }
  | { type: "has_proposal_accepted" }
  | { type: "has_needs_assessment_done" }
  | { type: "days_since_created_gt"; value: number }
  | { type: "days_since_last_contact_gt"; value: number }
  | { type: "last_contact_result_is"; value: string };

export interface RuleGroup {
  all: RuleCondition[];
  any: RuleCondition[];
}

export type RuleBucket = "none" | "all" | "any";

/**
 * Present only on catalog rows whose condition takes a numeric parameter
 * (currently the two "days since X" conditions). Lets StageRulesEditor
 * render a number input next to the row without hardcoding condition types.
 */
interface NumericParam {
  defaultValue: number;
  getValue: (condition: RuleCondition) => number;
  withValue: (value: number) => RuleCondition;
}

export interface CatalogRow {
  key: string;
  label: string;
  build: () => RuleCondition;
  matches: (condition: RuleCondition) => boolean;
  numericParam?: NumericParam;
  /** Set for conditions that are only an approximation of the stated fact - see catalog row for details. */
  approximate?: boolean;
  /** Set on "Último resultado de contacto" rows from the source lead_contact_results.is_positive/is_negative flags. */
  sentiment?: "pos" | "neg";
}

/**
 * 26 options total: the original 12 (kept byte-for-byte compatible) plus 12
 * new boolean signals and 2 parametrized "days since" conditions added by
 * the evaluate_lead_signals_v2 / evaluate_condition extension (migration
 * 20261111200000). Signals that migration explicitly declined to add
 * (has_team, has_email_reply, has_meeting_scheduled, has_meeting_done,
 * has_paid_invoice, has_budget_field_filled) are intentionally absent here.
 */
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
  // --- novos sinais booleanos (migração 20261111200000) ---
  { key: "has_call_answered", label: "Teve chamada atendida",
    build: () => ({ type: "has_call_answered" }), matches: c => c.type === "has_call_answered" },
  { key: "has_email_sent", label: "Teve email enviado",
    build: () => ({ type: "has_email_sent" }), matches: c => c.type === "has_email_sent" },
  { key: "has_deal_won", label: "Tem deal ganho",
    build: () => ({ type: "has_deal_won" }), matches: c => c.type === "has_deal_won" },
  { key: "has_visit_done", label: "Tem visita concluída",
    build: () => ({ type: "has_visit_done" }), matches: c => c.type === "has_visit_done" },
  { key: "has_quote_open", label: "Tem orçamento em rascunho",
    build: () => ({ type: "has_quote_open" }), matches: c => c.type === "has_quote_open" },
  { key: "has_quote_sent", label: "Tem orçamento enviado",
    build: () => ({ type: "has_quote_sent" }), matches: c => c.type === "has_quote_sent" },
  { key: "has_quote_accepted", label: "Tem orçamento aceite",
    build: () => ({ type: "has_quote_accepted" }), matches: c => c.type === "has_quote_accepted" },
  { key: "has_proposal_open", label: "Tem proposta em rascunho",
    build: () => ({ type: "has_proposal_open" }), matches: c => c.type === "has_proposal_open" },
  { key: "has_proposal_sent", label: "Tem proposta enviada",
    build: () => ({ type: "has_proposal_sent" }), matches: c => c.type === "has_proposal_sent" },
  { key: "has_proposal_accepted", label: "Tem proposta aceite",
    build: () => ({ type: "has_proposal_accepted" }), matches: c => c.type === "has_proposal_accepted" },
  {
    key: "has_needs_assessment_done",
    label: "Levantamento de necessidades concluído",
    build: () => ({ type: "has_needs_assessment_done" }),
    matches: c => c.type === "has_needs_assessment_done",
    // Aproximação: proxy via deal_needs.status = 'orcamentado' num deal
    // ligado ao lead - não é um facto directo do lead. Ver nota na
    // migração 20261111200000.
    approximate: true,
  },
  // --- novas condições parametrizadas por tempo (migração 20261111200000) ---
  {
    key: "days_since_created_gt",
    label: "Criada há mais de N dias",
    build: () => ({ type: "days_since_created_gt", value: 7 }),
    matches: c => c.type === "days_since_created_gt",
    numericParam: {
      defaultValue: 7,
      getValue: c => (c.type === "days_since_created_gt" ? c.value : 7),
      withValue: value => ({ type: "days_since_created_gt", value }),
    },
  },
  {
    key: "days_since_last_contact_gt",
    label: "Sem contacto há mais de N dias",
    build: () => ({ type: "days_since_last_contact_gt", value: 7 }),
    matches: c => c.type === "days_since_last_contact_gt",
    numericParam: {
      defaultValue: 7,
      getValue: c => (c.type === "days_since_last_contact_gt" ? c.value : 7),
      withValue: value => ({ type: "days_since_last_contact_gt", value }),
    },
  },
];

/**
 * Bare-minimum shape needed from a `lead_contact_results` row to build its
 * catalog entry - see useLeadContactResults.ts for the full row shape.
 */
export interface ContactResultCatalogSource {
  id: string;
  name: string;
  is_positive?: boolean;
  is_negative?: boolean;
}

/**
 * Builds one CatalogRow per active `lead_contact_results` row (global + org,
 * see useLeadContactResults.ts), for the "Último resultado de contacto é X"
 * condition (last_contact_result_is - migration 20261111220000). This is
 * NOT part of the static CONDITION_CATALOG above because the set of
 * available results is per-organization and fetched at render time, not a
 * fixed list - StageRulesEditor renders these as a separate, distinctly
 * labelled sub-list alongside the fixed catalog rows.
 */
export function buildContactResultCatalogRows(results: ContactResultCatalogSource[]): CatalogRow[] {
  return results.map(result => ({
    key: `last_contact_result_is_${result.id}`,
    label: result.name,
    build: () => ({ type: "last_contact_result_is", value: result.id }),
    matches: c => c.type === "last_contact_result_is" && c.value === result.id,
    sentiment: result.is_positive ? "pos" : result.is_negative ? "neg" : undefined,
  }));
}

/**
 * Non-exclusive bucket helpers - unlike the old single-toggle model, a given
 * signal can independently be part of the "all" (AND) set, the "any" (OR)
 * set, both, or neither (two-column checkbox layout, see StageRulesEditor).
 */
export function isRowInBucket(rule: RuleGroup | null, row: CatalogRow, bucket: "all" | "any"): boolean {
  const list = bucket === "all" ? (rule?.all ?? []) : (rule?.any ?? []);
  return list.some(row.matches);
}

export function conditionForRowInBucket(
  rule: RuleGroup | null,
  row: CatalogRow,
  bucket: "all" | "any"
): RuleCondition | undefined {
  const list = bucket === "all" ? (rule?.all ?? []) : (rule?.any ?? []);
  return list.find(row.matches);
}

/**
 * Checks/unchecks a row's condition within a single bucket only - the other
 * bucket's contents are left untouched, so the same signal can be checked in
 * both the AND and OR columns at once.
 */
export function setRowInBucket(
  rule: RuleGroup | null,
  row: CatalogRow,
  bucket: "all" | "any",
  checked: boolean
): RuleGroup | null {
  const all = rule?.all ?? [];
  const any = rule?.any ?? [];
  const list = bucket === "all" ? all : any;
  const existing = list.find(row.matches);

  const nextList = checked
    ? (existing ? list : [...list, row.build()])
    : list.filter(c => !row.matches(c));

  const nextAll = bucket === "all" ? nextList : all;
  const nextAny = bucket === "any" ? nextList : any;

  if (nextAll.length === 0 && nextAny.length === 0) return null;
  return { all: nextAll, any: nextAny };
}

/**
 * Updates the numeric parameter of a row's condition within a single bucket,
 * leaving the other bucket's copy (if any) untouched - the AND and OR
 * columns can hold independent numeric values for the same condition type.
 * No-op if the row has no numericParam or isn't currently checked in that bucket.
 */
export function setNumericValueInBucket(
  rule: RuleGroup | null,
  row: CatalogRow,
  bucket: "all" | "any",
  value: number
): RuleGroup | null {
  if (!row.numericParam) return rule;

  const all = rule?.all ?? [];
  const any = rule?.any ?? [];
  const list = bucket === "all" ? all : any;
  if (!list.some(row.matches)) return rule;

  const updated = row.numericParam.withValue(value);
  const nextList = list.map(c => (row.matches(c) ? updated : c));

  return {
    all: bucket === "all" ? nextList : all,
    any: bucket === "any" ? nextList : any,
  };
}

/**
 * The original 12 catalog keys (pre migration 20261111200000), in the exact
 * order the Lovable v2 "Qualificação" reference UI displays them. Used by
 * QualificationRulesTab to render only this subset - the org-level MQL/SQL
 * suggestion rules intentionally mirror that reference 1:1, while the
 * per-stage reached_when editor (LeadWorkflowConfig "Fluxo" tab) still
 * exposes the full expanded catalog.
 */
export const QUALIFICATION_LEGACY_KEYS = [
  "has_assignee",
  "has_source",
  "has_contact_logged",
  "has_scheduled_visit",
  "has_active_deal",
  "has_active_quote",
  "has_active_proposal",
  "has_signed_contract",
  "qualification_is_mql",
  "qualification_is_sql",
  "last_contact_is_negative",
  "last_contact_is_positive",
];

export function isEmptyRule(rule: RuleGroup | null | undefined): boolean {
  return !rule || ((rule.all?.length ?? 0) === 0 && (rule.any?.length ?? 0) === 0);
}
