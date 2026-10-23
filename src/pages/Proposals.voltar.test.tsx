// A página de propostas é partilhada com a Mudelar. A ligação «Voltar à pessoa» (BarraVoltar) só existe quando o endereço traz um `?voltar=`
// seguro (um caminho que começa por /pessoas); sem ele, ou com um valor perigoso, a página fica exatamente como era.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const m = vi.hoisted(() => ({
  empresa: { activeCompany: { id: "org-1", name: "Nike" }, companies: [] as unknown[], userType: "user", isLoading: false },
  ambito: { getPermissionScope: () => "ORG", anewUserId: "u-1", teamMemberIds: [] as string[], loading: false },
  permissoes: { hasPermission: () => true, isSystemAdmin: true, loading: false },
  comerciais: { comercialUsers: [] as never[] },
  alertas: { get: () => ({ days_threshold: 30, is_active: false }) },
  automacao: { finalizeQuote: () => undefined },
  traducao: { t: (k: string) => k, language: "pt" },
  aviso: { toast: () => undefined },
  scroll: { sentinelRef: { current: null }, isFetching: false },
  pesquisa: { results: [] as never[], loading: false, error: null, search: () => undefined, clear: () => undefined, hasMore: false, loadMore: () => undefined },
  orgs: { orgIds: [] as string[] },
  portal: { generatePortalAccess: () => undefined, loading: false },
  moduloAlertas: { alerts: [] as never[], dismissAlert: () => undefined },
}));

vi.mock("@/integrations/supabase/client", () => {
  const q: unknown = new Proxy({}, {
    get: (_alvo, prop) => {
      if (prop === "then") return (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok, ko);
      if (prop === "maybeSingle" || prop === "single") return async () => ({ data: null, error: null });
      return () => q;
    },
  });
  return {
    supabase: {
      from: () => q, rpc: async () => ({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) },
      functions: { invoke: async () => ({ data: null, error: null }) },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => undefined,
    },
  };
});
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => m.traducao }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => m.aviso }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => m.empresa }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => m.permissoes }));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => m.ambito }));
vi.mock("@/hooks/useComercialUsers", () => ({ useComercialUsers: () => m.comerciais }));
vi.mock("@/hooks/useAlertSettings", () => ({ useAlertSettings: () => m.alertas }));
vi.mock("@/hooks/usePipelineAutomation", () => ({ usePipelineAutomation: () => m.automacao }));
vi.mock("@/hooks/useSentinelInView", () => ({ useSentinelInView: () => m.scroll }));
vi.mock("@/hooks/useScopedEntitySearch", () => ({ useScopedEntitySearch: () => m.pesquisa }));
vi.mock("@/hooks/useDescendantOrgIds", () => ({ useDescendantOrgIds: () => m.orgs }));
vi.mock("@/hooks/useClientPortalAccess", () => ({ useClientPortalAccess: () => m.portal }));
vi.mock("@/hooks/useModuleAlerts", () => ({ useModuleAlerts: () => m.moduloAlertas }));
vi.mock("@/lib/notifications/resolveSendProposalAlerts", () => ({ resolveSendProposalAlerts: async () => undefined }));
vi.mock("@/lib/proposals/runStageWorkflow", () => ({ runProposalStageWorkflow: async () => undefined }));
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async () => "erro" }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: async () => "u-1" }));
vi.mock("@/lib/exports/requestControlledExport", () => ({ requestControlledExport: vi.fn() }));
vi.mock("@/components/Layout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/NoOrganizationState", () => ({ NoOrganizationState: () => null }));
vi.mock("@/components/PageFAQSheet", () => ({ PageFAQSheet: () => null }));
vi.mock("@/components/PermissionGate", () => ({ PermissionGate: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/billing/PlanLimitWarning", () => ({ PlanLimitWarning: () => null }));
vi.mock("@/components/common/MissingTemplateDialog", () => ({ MissingTemplateDialog: () => null }));
vi.mock("@/components/EntitySearchInput", () => ({ EntitySearchInput: () => null }));
vi.mock("@/components/contacts/RegisterCallDialog", () => ({ RegisterCallDialog: () => null }));
vi.mock("@/components/proposals/SendProposalDialog", () => ({ SendProposalDialog: () => null }));
vi.mock("@/components/proposals/ProposalSendHistory", () => ({ ProposalSendHistory: () => null }));
vi.mock("@/components/proposals/ProposalDetailsDialog", () => ({ ProposalDetailsDialog: () => null }));
vi.mock("@/components/proposals/ProposalRejectReasonDialog", () => ({ ProposalRejectReasonDialog: () => null }));
vi.mock("@/components/proposals/ProposalWorkflowConfig", () => ({ ProposalWorkflowConfig: () => null }));
vi.mock("@/components/pipeline/ProposalManualItemsEditor", () => ({ ProposalManualItemsEditor: () => null }));
vi.mock("@/components/proposals/AIProposalGeneratorDialog", () => ({ AIProposalGeneratorDialog: () => null }));
vi.mock("@/components/proposals/ProposalPortalPreview", () => ({ ProposalPortalPreview: () => null }));
vi.mock("@/components/ModuleAlertsBanner", () => ({ ModuleAlertsBanner: () => null }));
vi.mock("@/components/proposals/ProposalsWorkflowBar", () => ({ ProposalsWorkflowBar: () => null }));
vi.mock("@/components/proposals/ProposalsAlertBars", () => ({ ProposalsAlertBars: () => null }));
vi.mock("@/components/proposals/ProposalsDashboardView", () => ({ ProposalsDashboardView: () => null }));
vi.mock("@/components/proposals/ProposalsPipelineMini", () => ({ ProposalsPipelineMini: () => null }));
vi.mock("@/components/proposals/ProposalsKanbanView", () => ({ ProposalsKanbanView: () => null }));
vi.mock("@/components/whatsapp/WhatsAppSendDialog", () => ({ WhatsAppSendDialog: () => null }));
vi.mock("@/components/portal/PortalStatusBadge", () => ({ PortalStatusBadge: () => null }));
vi.mock("@/components/proposals/ProposalItemsEditor", () => ({ default: () => null, calculateProposalItemsTotal: () => 0 }));
vi.mock("@/components/proposals/InlineQuoteBuilder", () => ({ InlineQuoteBuilder: () => null, createEmptyInlineQuote: () => ({}), calcInlineQuoteTotal: () => 0 }));
vi.mock("@/components/pipeline/PipelineBreadcrumb", () => ({ PipelineBreadcrumb: () => null }));

import Proposals from "./Proposals";

beforeAll(() => { globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }; });
afterEach(cleanup);

const barra = () => screen.queryByRole("navigation", { name: "pessoasPagina.neg.back.label" });
async function abrir(endereco: string) {
  render(<MemoryRouter initialEntries={[endereco]}><Proposals /></MemoryRouter>);
  // A página desenhou-se (o título do cabeçalho ou qualquer botão de topo).
  await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(0));
}

describe("Propostas: a ligação de voltar à pessoa", () => {
  it("sem ?voltar= não existe", async () => {
    await abrir("/proposals");
    expect(barra()).toBeNull();
    expect(screen.queryByRole("link", { name: "pessoasPagina.neg.back.link" })).toBeNull();
  });

  it("com um ?voltar= seguro existe e aponta para a ficha", async () => {
    await abrir(`/proposals?voltar=${encodeURIComponent("/pessoas?open=p1&negocio=n1")}`);
    const ligacao = await screen.findByRole("link", { name: "pessoasPagina.neg.back.link" });
    expect(ligacao).toHaveAttribute("href", "/pessoas?open=p1&negocio=n1");
    expect(barra()).not.toBeNull();
  });

  it.each([["//evil.com"], ["https://evil.com"], ["/clients?x=1"], ["/pessoas/../admin"]])("com %s (perigoso) não existe", async (voltar) => {
    await abrir(`/proposals?voltar=${encodeURIComponent(voltar)}`);
    expect(barra()).toBeNull();
  });
});
