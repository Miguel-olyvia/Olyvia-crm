// Registry — assembles TOOLS in the EXACT order of the previous monolithic index.ts.
// Order is critical because Gemini ties decisions to position; do not reorder.

import * as crm from "./crm.ts";
import * as deals from "./deals.ts";
import * as proposals from "./proposals.ts";
import * as quotes from "./quotes.ts";
import * as schedule from "./schedule.ts";
import * as notifications from "./notifications.ts";
import * as reports from "./reports.ts";
import * as navigation from "./navigation.ts";
import * as context from "./context.ts";
import * as catalog from "./catalog.ts";
import * as activities from "./activities.ts";
import * as workflows from "./workflows.ts";
import * as users from "./users.ts";
import * as entities from "./entities.ts";
import * as catalogRead from "./catalog_read.ts";
import * as contracts from "./contracts.ts";
import * as search from "./search.ts";
import * as workflowStages from "./workflow_stages.ts";
import * as stageActions from "./stage_actions.ts";
import type { Handler, ToolDef } from "../shared/types.ts";

// Order MUST match the previous TOOLS array exactly:
// create_lead, create_deal, create_proposal, create_quote, create_contact,
// create_schedule_item, search_clients, search_leads, search_contacts,
// list_deals, list_proposals, list_quotes, list_notifications, list_schedule,
// get_stats, update_lead_status, navigate
export const TOOLS: ToolDef[] = [
  crm.createLeadDef,
  deals.createDealDef,
  proposals.createProposalDef,
  quotes.createQuoteDef,
  crm.createContactDef,
  schedule.createScheduleItemDef,
  crm.searchClientsDef,
  crm.searchLeadsDef,
  crm.searchContactsDef,
  deals.listDealsDef,
  proposals.listProposalsDef,
  quotes.listQuotesDef,
  notifications.listNotificationsDef,
  schedule.listScheduleDef,
  reports.getStatsDef,
  crm.updateLeadStatusDef,
  navigation.navigateDef,
  // Fase 3 — Reporting (novas tools no fim, sem reordenar as 17 anteriores)
  reports.getPipelineReportDef,
  reports.getOverdueItemsDef,
  reports.getTopClientsDef,
  reports.getTeamPerformanceDef,
  // Fase 4 — Contexto & Catálogo
  context.getCurrentContextDef,
  catalog.searchProductsDef,
  // Fase 1 — CRUD e Ações de Pipeline (9 mutations, appended sem reordenar acima)
  crm.updateLeadDef,
  deals.createDealFromLeadDef,
  deals.updateDealDef,
  deals.closeDealDef,
  crm.updateContactDef,
  quotes.sendQuoteDef,
  proposals.sendProposalDef,
  quotes.duplicateQuoteDef,
  schedule.updateScheduleItemDef,
  // Fase 2 — Atividades
  activities.addNoteDef,
  activities.logCallDef,
  activities.listActivitiesDef,
  // Fase 5 — Workflows
  workflows.listWorkflowRulesDef,
  workflows.listWorkflowLogsDef,
  workflows.executeWorkflowDef,
  // Fase 4 — Fecho (people & assignment)
  users.searchUsersDef,
  users.assignCrmRecordDef,
  // P2 — convert_lead (separado de create_deal_from_lead); registado no fim
  crm.convertLeadDef,
  // P3 — get_leads_report (reporting agregado de leads)
  reports.getLeadsReportDef,
  // P5 — gestão escrita de workflow rules
  workflows.createWorkflowRuleDef,
  workflows.updateWorkflowRuleDef,
  workflows.toggleWorkflowRuleDef,
  workflows.deleteWorkflowRuleDef,
  quotes.addQuoteItemsDef,
  quotes.setQuoteTemplateDef,
  quotes.listQuoteTemplatesDef,
  quotes.listQuoteModelsDef,
  quotes.setQuoteModelDef,
  // Fase 1 (Olyvia) — leitura e edição de orçamentos
  quotes.getQuoteDetailsDef,
  quotes.removeQuoteLinesDef,
  quotes.updateQuoteLineDef,
  quotes.updateQuoteDef,
  // Fase 2 (Olyvia) — cancelar quote + ler/editar/cancelar deal e proposta
  quotes.deleteQuoteDef,
  deals.getDealDetailsDef,
  deals.cancelDealDef,
  proposals.getProposalDetailsDef,
  proposals.updateProposalDef,
  proposals.cancelProposalDef,
  // Fase 3 (Olyvia) — CRM details + cancel + edit notes
  crm.getLeadDetailsDef,
  crm.deleteLeadDef,
  crm.getContactDetailsDef,
  crm.updateContactNotesDef,
  crm.deleteContactDef,
  crm.getClientDetailsDef,
  crm.updateClientDef,
  crm.deleteClientDef,
  // Fase 4.A — CRM facet CRUD (emails/phones/addresses/tags) + restore
  entities.addEntityEmailDef,
  entities.deleteEntityEmailDef,
  entities.setPrimaryEmailDef,
  entities.addEntityPhoneDef,
  entities.deleteEntityPhoneDef,
  entities.setPrimaryPhoneDef,
  entities.setEntityAddressDef,
  entities.addContactTagDef,
  entities.removeContactTagDef,
  entities.listContactTagsDef,
  entities.restoreLeadDef,
  entities.restoreContactDef,
  entities.restoreClientDef,
  // Fase 4.B — Catálogo (leitura)
  catalogRead.getProductDetailsDef,
  catalogRead.searchServicesDef,
  catalogRead.getServiceDetailsDef,
  catalogRead.searchBundlesDef,
  catalogRead.getBundleDetailsDef,
  catalogRead.listCategoriesDef,
  catalogRead.getProductPriceDef,
  catalogRead.getProductStockDef,
  // Fase 4.C — Agendamento
  schedule.getScheduleItemDef,
  schedule.completeScheduleItemDef,
  schedule.cancelScheduleItemDef,
  schedule.rescheduleScheduleItemDef,
  schedule.assignScheduleItemDef,
  schedule.listMyAgendaDef,
  schedule.findAvailableResourcesDef,
  // Fase 4.D — Contratos
  contracts.listContractsDef,
  contracts.getContractDetailsDef,
  contracts.updateContractDef,
  contracts.cancelContractDef,
  contracts.restoreContractDef,
  // Fase 4.E — Pesquisa global + browse de catálogo
  search.searchEntitiesDef,
  catalog.listProductsDef,
  catalog.listServicesDef,
  catalog.listBundlesDef,
  // Fase 4.G — Agendamento: descoberta de recursos
  schedule.listScheduleResourcesDef,
  // Fase 4.L — Taxas de orçamento + catálogo (marcas/atributos/UOM)
  quotes.listServiceFeesDef,
  quotes.listQuoteFeesDef,
  quotes.addQuoteFeeDef,
  quotes.removeQuoteFeeDef,
  catalogRead.listBrandsDef,
  catalogRead.listProductAttributesDef,
  catalogRead.getProductAttributeDetailsDef,
  catalogRead.listUnitsOfMeasureDef,
  // Fase 6 — Workflow stages e stage actions
  workflowStages.listWorkflowStagesDef,
  workflowStages.createWorkflowStageDef,
  workflowStages.updateWorkflowStageDef,
  workflowStages.deactivateWorkflowStageDef,
  stageActions.listStageActionsDef,
  stageActions.createStageActionDef,
  stageActions.toggleStageActionDef,
  stageActions.deleteStageActionDef,
];



// ---------------------------------------------------------------------------
// Tool filtering by page context ("currentContext.path" sent by the frontend)
// ---------------------------------------------------------------------------
//
// Every callAiGateway() call in index.ts's tool-calling loop used to pass the
// FULL `TOOLS` array (123 function-calling schemas, ~15k tokens) regardless
// of what the user could plausibly be asking about on the current page. That
// is the dominant fixed cost of every request. Instead, index.ts now calls
// `selectToolsForContext(currentContext?.path)` to get a smaller, page-aware
// subset and passes THAT to `tools:`.
//
// IMPORTANT: this only changes which schemas are shown to the model — it does
// NOT change what can be executed. `HANDLERS` below stays keyed by the FULL
// tool set, because a tool the model was never shown can never be requested
// in the first place (the model can only emit tool_calls for names it saw in
// the `tools` array of that same request). So no separate filtering is
// needed on the execution side.
//
// Design: a static category → ToolDef[] map, a small "core" set always
// included, and a path-prefix → categories[] table. Matching is deliberately
// GENEROUS (a page maps to several related categories) because the goal is
// "meaningfully fewer tools" (~30-50 instead of 123), not a minimal/fragile
// set that risks the model wanting a tool it wasn't shown. If the path is
// missing or doesn't match any rule, we fall back to the FULL `TOOLS` array
// — never silently under-serve on an unrecognized/absent signal.
//
// Known tradeoff (documented per task scope, not implemented): if the model's
// first response contains no tool call because the tool it needed was
// filtered out for this page, there's no automatic "retry with full tool set"
// here. A clean version of that fallback would need to inspect free-text
// model output for "I can't do that" style signals, which is heuristic and
// easy to get wrong (false positives double cost, false negatives silently
// eat the failure) for a first cut. Given tool coverage per category is
// intentionally generous, and every category used by more than one page is
// still included redundantly across those pages, this is expected to be a
// rare edge case. Revisit if logs (see the console.log below) show it firing
// often in practice.

export type ToolCategory =
  | "leads"
  | "contacts"
  | "clients"
  | "entity_facets"
  | "deals"
  | "proposals"
  | "quotes"
  | "catalog"
  | "schedule"
  | "workflows"
  | "users"
  | "notifications"
  | "reports"
  | "contracts"
  | "activities";

// Always sent, regardless of page: broadly useful on every screen by nature.
export const CORE_TOOLS: ToolDef[] = [
  navigation.navigateDef,
  context.getCurrentContextDef,
  search.searchEntitiesDef,
  reports.getStatsDef,
];

const CATEGORY_TOOLS: Record<ToolCategory, ToolDef[]> = {
  leads: [
    crm.createLeadDef,
    crm.searchLeadsDef,
    crm.updateLeadStatusDef,
    crm.updateLeadDef,
    crm.getLeadDetailsDef,
    crm.deleteLeadDef,
    crm.convertLeadDef,
    entities.restoreLeadDef,
    deals.createDealFromLeadDef,
    reports.getLeadsReportDef,
  ],
  contacts: [
    crm.createContactDef,
    crm.searchContactsDef,
    crm.updateContactDef,
    crm.updateContactNotesDef,
    crm.getContactDetailsDef,
    crm.deleteContactDef,
    entities.restoreContactDef,
  ],
  clients: [
    crm.searchClientsDef,
    crm.getClientDetailsDef,
    crm.updateClientDef,
    crm.deleteClientDef,
    entities.restoreClientDef,
  ],
  // Email/phone/address/tag CRUD — applies to leads, contacts and clients alike.
  entity_facets: [
    entities.addEntityEmailDef,
    entities.deleteEntityEmailDef,
    entities.setPrimaryEmailDef,
    entities.addEntityPhoneDef,
    entities.deleteEntityPhoneDef,
    entities.setPrimaryPhoneDef,
    entities.setEntityAddressDef,
    entities.addContactTagDef,
    entities.removeContactTagDef,
    entities.listContactTagsDef,
  ],
  deals: [
    deals.createDealDef,
    deals.listDealsDef,
    deals.updateDealDef,
    deals.closeDealDef,
    deals.cancelDealDef,
    deals.getDealDetailsDef,
    deals.createDealFromLeadDef,
  ],
  proposals: [
    proposals.createProposalDef,
    proposals.listProposalsDef,
    proposals.sendProposalDef,
    proposals.getProposalDetailsDef,
    proposals.updateProposalDef,
    proposals.cancelProposalDef,
  ],
  quotes: [
    quotes.createQuoteDef,
    quotes.listQuotesDef,
    quotes.sendQuoteDef,
    quotes.duplicateQuoteDef,
    quotes.addQuoteItemsDef,
    quotes.setQuoteTemplateDef,
    quotes.listQuoteTemplatesDef,
    quotes.listQuoteModelsDef,
    quotes.setQuoteModelDef,
    quotes.getQuoteDetailsDef,
    quotes.removeQuoteLinesDef,
    quotes.updateQuoteLineDef,
    quotes.updateQuoteDef,
    quotes.deleteQuoteDef,
    quotes.listServiceFeesDef,
    quotes.listQuoteFeesDef,
    quotes.addQuoteFeeDef,
    quotes.removeQuoteFeeDef,
  ],
  catalog: [
    catalog.searchProductsDef,
    catalog.listProductsDef,
    catalog.listServicesDef,
    catalog.listBundlesDef,
    catalogRead.getProductDetailsDef,
    catalogRead.searchServicesDef,
    catalogRead.getServiceDetailsDef,
    catalogRead.searchBundlesDef,
    catalogRead.getBundleDetailsDef,
    catalogRead.listCategoriesDef,
    catalogRead.getProductPriceDef,
    catalogRead.getProductStockDef,
    catalogRead.listBrandsDef,
    catalogRead.listProductAttributesDef,
    catalogRead.getProductAttributeDetailsDef,
    catalogRead.listUnitsOfMeasureDef,
  ],
  schedule: [
    schedule.createScheduleItemDef,
    schedule.listScheduleDef,
    schedule.updateScheduleItemDef,
    schedule.getScheduleItemDef,
    schedule.completeScheduleItemDef,
    schedule.cancelScheduleItemDef,
    schedule.rescheduleScheduleItemDef,
    schedule.assignScheduleItemDef,
    schedule.listMyAgendaDef,
    schedule.findAvailableResourcesDef,
    schedule.listScheduleResourcesDef,
  ],
  workflows: [
    workflows.listWorkflowRulesDef,
    workflows.listWorkflowLogsDef,
    workflows.executeWorkflowDef,
    workflows.createWorkflowRuleDef,
    workflows.updateWorkflowRuleDef,
    workflows.toggleWorkflowRuleDef,
    workflows.deleteWorkflowRuleDef,
    workflowStages.listWorkflowStagesDef,
    workflowStages.createWorkflowStageDef,
    workflowStages.updateWorkflowStageDef,
    workflowStages.deactivateWorkflowStageDef,
    stageActions.listStageActionsDef,
    stageActions.createStageActionDef,
    stageActions.toggleStageActionDef,
    stageActions.deleteStageActionDef,
  ],
  users: [
    users.searchUsersDef,
    users.assignCrmRecordDef,
  ],
  notifications: [
    notifications.listNotificationsDef,
  ],
  reports: [
    reports.getPipelineReportDef,
    reports.getOverdueItemsDef,
    reports.getTopClientsDef,
    reports.getTeamPerformanceDef,
    reports.getLeadsReportDef,
  ],
  contracts: [
    contracts.listContractsDef,
    contracts.getContractDetailsDef,
    contracts.updateContractDef,
    contracts.cancelContractDef,
    contracts.restoreContractDef,
  ],
  activities: [
    activities.addNoteDef,
    activities.logCallDef,
    activities.listActivitiesDef,
  ],
};

// Path-prefix → categories, matched generously (a page usually pulls in
// several adjacent categories, e.g. the deals page also needs quotes,
// proposals and CRM lookups because deals reference all of them).
// Matching is by exact path or by "prefix + /" so sub-routes (e.g.
// "/leads/123") match their parent rule.
const PATH_CATEGORY_RULES: Array<{ prefix: string; categories: ToolCategory[] }> = [
  { prefix: "/leads", categories: ["leads", "contacts", "entity_facets", "activities", "deals", "reports"] },
  { prefix: "/deals", categories: ["deals", "quotes", "proposals", "clients", "activities", "reports"] },
  { prefix: "/proposals", categories: ["proposals", "deals", "quotes", "activities", "contracts"] },
  { prefix: "/proposal-templates", categories: ["proposals", "quotes"] },
  { prefix: "/quotes", categories: ["quotes", "catalog", "activities"] },
  { prefix: "/quote-models", categories: ["quotes", "catalog"] },
  { prefix: "/quote-templates", categories: ["quotes", "catalog"] },
  { prefix: "/clients", categories: ["clients", "contacts", "entity_facets", "contracts", "deals", "activities", "reports"] },
  { prefix: "/anew-clients", categories: ["clients", "contacts", "entity_facets", "contracts", "deals", "activities", "reports"] },
  { prefix: "/scheduling", categories: ["schedule", "users", "activities"] },
  { prefix: "/calendar", categories: ["schedule", "users", "activities"] },
  { prefix: "/users", categories: ["users"] },
  { prefix: "/roles", categories: ["users"] },
  { prefix: "/organizations", categories: ["clients", "users"] },
  { prefix: "/company-groups", categories: ["clients", "users"] },
  { prefix: "/catalog-items", categories: ["catalog"] },
  { prefix: "/products", categories: ["catalog"] },
  { prefix: "/product-configurator-lab", categories: ["catalog"] },
  { prefix: "/product-categories", categories: ["catalog"] },
  { prefix: "/product-subcategories", categories: ["catalog"] },
  { prefix: "/product-attributes", categories: ["catalog"] },
  { prefix: "/brands", categories: ["catalog"] },
  { prefix: "/units-of-measure", categories: ["catalog"] },
  { prefix: "/bundles", categories: ["catalog"] },
  { prefix: "/services", categories: ["catalog"] },
  { prefix: "/service-categories", categories: ["catalog"] },
  { prefix: "/service-subcategories", categories: ["catalog"] },
  { prefix: "/service-catalog-items", categories: ["catalog"] },
  { prefix: "/service-fees", categories: ["catalog", "quotes"] },
  { prefix: "/stocks", categories: ["catalog"] },
  { prefix: "/warehouses", categories: ["catalog"] },
  { prefix: "/purchase-orders", categories: ["catalog"] },
  { prefix: "/suppliers", categories: ["catalog"] },
  { prefix: "/client-contracts", categories: ["contracts", "clients"] },
  { prefix: "/contract-templates", categories: ["contracts"] },
  { prefix: "/notifications", categories: ["notifications"] },
  { prefix: "/flow-builder", categories: ["workflows"] },
  { prefix: "/campaigns", categories: ["leads", "reports"] },
  { prefix: "/channels", categories: ["leads", "reports"] },
  { prefix: "/lead-sources", categories: ["leads"] },
  { prefix: "/lead-contact-results", categories: ["leads"] },
  { prefix: "/forms", categories: ["leads"] },
  { prefix: "/dashboard", categories: ["reports", "leads", "deals", "quotes", "proposals"] },
  { prefix: "/home", categories: ["reports", "leads", "deals"] },
];

/**
 * Picks the tool subset to expose to the model for a given `currentContext.path`.
 * Always includes CORE_TOOLS. Falls back to the FULL `TOOLS` array (safety
 * net) when `path` is missing, not a string, or matches no known rule — we
 * never want to silently under-serve on an unreliable/absent signal.
 */
export function selectToolsForContext(path: unknown): ToolDef[] {
  if (typeof path !== "string" || path.length === 0) return TOOLS;

  const cleanPath = path.split("?")[0].split("#")[0] || "/";
  const matchedRules = PATH_CATEGORY_RULES.filter(
    (r) => cleanPath === r.prefix || cleanPath.startsWith(`${r.prefix}/`),
  );
  if (matchedRules.length === 0) return TOOLS;

  const categories = new Set<ToolCategory>();
  for (const rule of matchedRules) {
    for (const c of rule.categories) categories.add(c);
  }

  const byName = new Map<string, ToolDef>();
  for (const t of CORE_TOOLS) byName.set(t.function.name, t);
  for (const c of categories) {
    for (const t of CATEGORY_TOOLS[c]) byName.set(t.function.name, t);
  }
  return Array.from(byName.values());
}

export const HANDLERS: Record<string, Handler> = {
  ...crm.handlers,
  ...deals.handlers,
  ...proposals.handlers,
  ...quotes.handlers,
  ...schedule.handlers,
  ...notifications.handlers,
  ...reports.handlers,
  ...navigation.handlers,
  ...context.handlers,
  ...catalog.handlers,
  ...activities.handlers,
  ...workflows.handlers,
  ...users.handlers,
  ...entities.handlers,
  ...catalogRead.handlers,
  ...contracts.handlers,
  ...search.handlers,
  ...workflowStages.handlers,
  ...stageActions.handlers,
};


