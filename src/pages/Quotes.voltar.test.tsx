// A página de orçamentos é partilhada com a Mudelar. A ligação «Voltar à pessoa» (BarraVoltar) só existe quando o endereço traz um `?voltar=`
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
  bulk: { selectedIds: new Set<string>(), toggle: () => undefined, clear: () => undefined, selectAll: () => undefined, isSelected: () => false },
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
vi.mock("@/hooks/useInfiniteScroll", () => ({ useInfiniteScroll: () => m.scroll }));
vi.mock("@/hooks/useBulkActions", () => ({ useBulkActions: () => m.bulk }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: async () => "u-1" }));
vi.mock("@/lib/exports/requestControlledExport", () => ({ requestControlledExport: vi.fn() }));
vi.mock("@/components/Layout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/NoOrganizationState", () => ({ NoOrganizationState: () => null }));
vi.mock("@/components/PageFAQSheet", () => ({ PageFAQSheet: () => null }));
vi.mock("@/components/PermissionGate", () => ({ PermissionGate: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/QuoteBuilder", () => ({ QuoteBuilder: () => null }));
vi.mock("@/components/quote/QuoteMoradasResumo", () => ({ QuoteMoradasResumo: () => null }));
vi.mock("@/components/shared/DocumentsTab", () => ({ DocumentsTab: () => null }));
vi.mock("@/components/quotes/QuoteSendHistory", () => ({ QuoteSendHistory: () => null }));
vi.mock("@/components/BulkActionsBar", () => ({ BulkActionsBar: () => null }));
vi.mock("@/components/pipeline/PipelineBreadcrumb", () => ({ PipelineBreadcrumb: () => null }));
vi.mock("@/components/quotes/SendQuoteDialog", () => ({ SendQuoteDialog: () => null }));
vi.mock("@/components/quotes/QuotesWorkflowBar", () => ({ QuotesWorkflowBar: () => null }));
vi.mock("@/components/quotes/QuotesAlertBars", () => ({ QuotesAlertBars: () => null }));
vi.mock("@/components/quotes/QuotesDashboardView", () => ({ QuotesDashboardView: () => null }));
vi.mock("@/components/quotes/QuotesMarginsView", () => ({ QuotesMarginsView: () => null }));
vi.mock("@/components/quotes/QuotesPipelineMini", () => ({ QuotesPipelineMini: () => null }));
vi.mock("@/components/exports/SensitiveExportDialog", () => ({ SensitiveExportDialog: () => null }));

import Quotes from "./Quotes";

beforeAll(() => { globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }; });
afterEach(cleanup);

const barra = () => screen.queryByRole("navigation", { name: "pessoasPagina.neg.back.label" });
async function abrir(endereco: string) {
  render(<MemoryRouter initialEntries={[endereco]}><Quotes /></MemoryRouter>);
  // A página desenhou-se (o título do cabeçalho ou qualquer botão de topo).
  await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(0));
}

describe("Orçamentos: a ligação de voltar à pessoa", () => {
  it("sem ?voltar= não existe", async () => {
    await abrir("/quotes");
    expect(barra()).toBeNull();
    expect(screen.queryByRole("link", { name: "pessoasPagina.neg.back.link" })).toBeNull();
  });

  it("com um ?voltar= seguro existe e aponta para a ficha", async () => {
    await abrir(`/quotes?voltar=${encodeURIComponent("/pessoas?open=p1&negocio=n1")}`);
    const ligacao = await screen.findByRole("link", { name: "pessoasPagina.neg.back.link" });
    expect(ligacao).toHaveAttribute("href", "/pessoas?open=p1&negocio=n1");
    expect(barra()).not.toBeNull();
  });

  it.each([["//evil.com"], ["https://evil.com"], ["/clients?x=1"], ["/pessoas/../admin"]])("com %s (perigoso) não existe", async (voltar) => {
    await abrir(`/quotes?voltar=${encodeURIComponent(voltar)}`);
    expect(barra()).toBeNull();
  });
});
