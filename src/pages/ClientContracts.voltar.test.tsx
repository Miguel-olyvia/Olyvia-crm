// A página de contratos é partilhada com a Mudelar. Os parâmetros que a ficha da pessoa (P3) lhe acrescentou (`proposalId` e `voltar`) só
// contam quando vêm no endereço; sem eles a página faz o que sempre fez. Quatro casos de endereço, vistos a partir do diálogo de contrato novo:
// sem `voltar` não se navega depois de criar; com `proposalId` e um `voltar` seguro filtra-se só essa proposta e volta-se à ficha com o contrato
// novo; um `voltar` perigoso é ignorado; e um rpc que não devolve o id não leva a lado nenhum.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

interface PropsDoDialogo {
  open: boolean;
  proposals: { id: string }[];
  presetProposalId?: string | null;
  onSave: (d: Record<string, string>) => void;
  isNew?: boolean;
}
const m = vi.hoisted(() => ({
  navegar: vi.fn(),
  dialogo: null as null | { atual: unknown },
  criarContrato: { resposta: { data: "k-novo" as unknown, error: null as unknown } },
  empresa: { activeCompany: { id: "org-1", name: "Nike" }, isLoading: false },
  ambito: { getPermissionScope: () => "ORG", anewUserId: "u-1", teamMemberIds: [] as string[], loading: false },
  permissoes: { hasPermission: () => true, loading: false, isSystemAdmin: true },
  comerciais: { comercialUsers: [] as never[] },
  alertas: { get: () => ({ days_threshold: 30, is_active: false }) },
  moduloAlertas: { alerts: [] as never[], dismissAlert: () => undefined },
  automacao: { finalizeContract: () => undefined },
  portal: { generatePortalAccess: () => undefined, loading: false },
  traducao: { t: (k: string) => k, language: "pt" },
}));
m.dialogo = { atual: null };

const PROPOSTAS = [
  { id: "P", title: "Proposta P", entity_id: "e1", deal_id: null, quotes: [{ total: 100 }] },
  { id: "Q", title: "Proposta Q", entity_id: "e1", deal_id: null, quotes: [{ total: 50 }] },
];

vi.mock("@/integrations/supabase/client", () => {
  const tabela = (nome: string): unknown => {
    const dados: Record<string, unknown[]> = {
      proposals: PROPOSTAS.map((p) => ({ ...p })),
      anew_entities: [{ id: "e1", display_name: "Ana" }],
      anew_clients: [{ id: "c1", entity_id: "e1" }],
    };
    const q: unknown = new Proxy({}, {
      get: (_alvo, prop) => {
        if (prop === "then") return (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data: dados[nome] ?? [], error: null }).then(ok, ko);
        if (prop === "maybeSingle" || prop === "single") return async () => ({ data: null, error: null });
        return () => q;
      },
    });
    return q;
  };
  return {
    supabase: {
      from: tabela,
      rpc: async (nome: string) => (nome === "rpc_create_client_contract" ? m.criarContrato.resposta : { data: null, error: null }),
      auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) },
      functions: { invoke: async () => ({ data: null, error: null }) },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => undefined,
    },
  };
});
vi.mock("react-router-dom", async (importar) => ({ ...(await importar<typeof import("react-router-dom")>()), useNavigate: () => m.navegar }));
vi.mock("@/lib/toast", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => m.traducao }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => m.empresa }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => m.permissoes }));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => m.ambito, canActOnEntity: () => true }));
vi.mock("@/hooks/useComercialUsers", () => ({ useComercialUsers: () => m.comerciais }));
vi.mock("@/hooks/useAlertSettings", () => ({ useAlertSettings: () => m.alertas }));
vi.mock("@/hooks/useModuleAlerts", () => ({ useModuleAlerts: () => m.moduloAlertas }));
vi.mock("@/hooks/usePipelineAutomation", () => ({ usePipelineAutomation: () => m.automacao }));
vi.mock("@/hooks/useClientPortalAccess", () => ({ useClientPortalAccess: () => m.portal }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: async () => "u-1" }));
vi.mock("@/lib/exports/requestControlledExport", () => ({ requestControlledExport: vi.fn() }));
vi.mock("@/components/contracts/contractDocument", () => ({
  downloadContractDocumentPdf: vi.fn(), resolveContractDocument: vi.fn(), gatherContractData: vi.fn(async () => ({})), injectSignatoryIntoSignatureBlock: (h: string) => h,
}));
vi.mock("@/components/Layout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/NoOrganizationState", () => ({ NoOrganizationState: () => null }));
vi.mock("@/components/PermissionGate", () => ({ PermissionGate: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/ModuleAlertsBanner", () => ({ ModuleAlertsBanner: () => null }));
vi.mock("@/components/dashboard/DashboardCard", () => ({ default: () => null }));
vi.mock("@/components/pipeline/PipelineBreadcrumb", () => ({ PipelineBreadcrumb: () => null }));
vi.mock("@/components/contracts/ContractsWorkflowBar", () => ({ ContractsWorkflowBar: () => null }));
vi.mock("@/components/contracts/ContractsAlertBars", () => ({ ContractsAlertBars: () => null }));
vi.mock("@/components/contracts/ContractsPipelineMini", () => ({ ContractsPipelineMini: () => null }));
vi.mock("@/components/contracts/ContractsDashboardView", () => ({ ContractsDashboardView: () => null }));
vi.mock("@/components/contracts/ContractsRenewalsView", () => ({ ContractsRenewalsView: () => null }));
vi.mock("@/components/contracts/ContractsSignaturesView", () => ({ ContractsSignaturesView: () => null }));
vi.mock("@/components/contracts/ContractsDocumentsView", () => ({ ContractsDocumentsView: () => null }));
vi.mock("@/components/contracts/SendChannelDialog", () => ({ SendChannelDialog: () => null }));
vi.mock("@/components/whatsapp/WhatsAppSendDialog", () => ({ WhatsAppSendDialog: () => null }));
vi.mock("@/components/portal/PortalStatusBadge", () => ({ PortalStatusBadge: () => null }));
vi.mock("@/components/email/SendEntityEmailDialog", () => ({ SendEntityEmailDialog: () => null }));
vi.mock("@/components/contracts/ContractDetailDialog", () => ({
  ContractDetailDialog: (p: PropsDoDialogo) => { (m.dialogo as { atual: unknown }).atual = p; return null; },
}));

import ClientContracts from "./ClientContracts";

beforeAll(() => { globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }; });
beforeEach(() => {
  m.navegar.mockReset();
  (m.dialogo as { atual: unknown }).atual = null;
  m.criarContrato.resposta = { data: "k-novo", error: null };
});
afterEach(cleanup);

const dialogo = (): PropsDoDialogo => (m.dialogo as { atual: PropsDoDialogo }).atual;
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

async function abrir(endereco: string) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={cliente}><MemoryRouter initialEntries={[endereco]}><ClientContracts /></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(dialogo()?.open).toBe(true));
  // A lista de propostas chega por uma consulta à parte: espera por ela.
  await waitFor(() => expect(dialogo().proposals.length).toBeGreaterThan(0));
}
const criar = async (propostaId: string) => {
  await act(async () => { dialogo().onSave({ proposal_id: propostaId, template_id: "", start_date: "", end_date: "", notes: "", payment_terms: "" }); });
  await tick();
};

describe("ClientContracts: contrato novo pedido pelo endereço", () => {
  it("?newContract=true&clientId=X sem voltar: mostra as propostas do cliente e, ao criar, não navega", async () => {
    await abrir("/client-contracts?newContract=true&clientId=c1");
    expect(dialogo().presetProposalId ?? null).toBeNull();
    expect(dialogo().proposals.map((p) => p.id).sort()).toEqual(["P", "Q"]);
    await criar("P");
    expect(m.navegar).not.toHaveBeenCalled();
  });

  it("?newContract=true&proposalId=P&voltar=/pessoas?open=1: filtra só a proposta P e, ao criar, volta à ficha com o contrato novo", async () => {
    await abrir(`/client-contracts?newContract=true&proposalId=P&voltar=${encodeURIComponent("/pessoas?open=1")}`);
    expect(dialogo().presetProposalId).toBe("P");
    expect(dialogo().proposals.map((p) => p.id)).toEqual(["P"]);
    await criar("P");
    expect(m.navegar).toHaveBeenCalledTimes(1);
    expect(m.navegar).toHaveBeenCalledWith("/pessoas?open=1&novoContrato=k-novo");
  });

  it("um ?voltar= perigoso (//evil.com) é ignorado: cria e não navega", async () => {
    await abrir(`/client-contracts?newContract=true&proposalId=P&voltar=${encodeURIComponent("//evil.com")}`);
    await criar("P");
    expect(m.navegar).not.toHaveBeenCalled();
  });

  it("se o rpc não devolve o id do contrato, não navega", async () => {
    m.criarContrato.resposta = { data: null, error: null };
    await abrir(`/client-contracts?newContract=true&proposalId=P&voltar=${encodeURIComponent("/pessoas?open=1")}`);
    await criar("P");
    expect(m.navegar).not.toHaveBeenCalled();
  });
});
