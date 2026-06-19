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


