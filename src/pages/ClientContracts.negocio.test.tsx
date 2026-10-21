// Contratos dentro do negócio (fecho v4): a página de contratos é partilhada com a Mudelar, e o `?negocio=` do endereço só conta com a bandeira
// ligada. Com ele um contrato NOVO grava por neg_criar_contrato (16 argumentos, nasce ligado) e, ao voltar à ficha, já não leva o contrato para
// ligar; um erro da base (NG...) diz-se traduzido. Sem ele, ou com a bandeira desligada, a página grava como sempre (rpc_create_client_contract).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

interface PropsDoDialogo {
  open: boolean;
  negocioLigado?: { titulo: string | null } | null;
  proposals: { id: string }[];
  presetProposalId?: string | null;
  onSave: (d: Record<string, string>) => void;
  isNew?: boolean;
}
const m = vi.hoisted(() => ({
  navegar: vi.fn(),
  dialogo: null as null | { atual: unknown },
  criarContrato: { resposta: { data: "k-novo" as unknown, error: null as unknown } },
  criarNegContrato: { resposta: { data: "k-novo" as unknown, error: null as unknown } },
  rpcs: [] as { nome: string; params: Record<string, unknown> }[],
  erro: vi.fn(),
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
      negocios: [{ id: "8c1f6d3e-2b7a-4c59-9e0a-5d4b7a1c3f20", titulo: "Cozinha da Ana", fecho: "contrato", estado: "aberto", decisao_origem_tipo: null, decisao_origem_id: null }],
    };
    const q: unknown = new Proxy({}, {
      get: (_alvo, prop) => {
        if (prop === "then") return (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data: dados[nome] ?? [], error: null }).then(ok, ko);
        if (prop === "maybeSingle" || prop === "single") return async () => ({ data: nome === "negocios" ? (dados.negocios[0] ?? null) : null, error: null });
        return () => q;
      },
    });
    return q;
  };
  return {
    supabase: {
      from: tabela,
      rpc: async (nome: string, params: Record<string, unknown> = {}) => {
        m.rpcs.push({ nome, params });
        if (nome === "rpc_create_client_contract") return m.criarContrato.resposta;
        if (nome === "neg_criar_contrato") return m.criarNegContrato.resposta;
        return { data: null, error: null };
      },
      auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) },
      functions: { invoke: async () => ({ data: null, error: null }) },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => undefined,
    },
  };
});
vi.mock("react-router-dom", async (importar) => ({ ...(await importar<typeof import("react-router-dom")>()), useNavigate: () => m.navegar }));
vi.mock("@/lib/toast", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), error: (...a: unknown[]) => m.erro(...a), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }) }));
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

import { FechoV4Context } from "@/components/negocio-metas/bandeiraFecho";
import ClientContracts from "./ClientContracts";

beforeAll(() => { globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }; });
beforeEach(() => {
  m.navegar.mockReset();
  (m.dialogo as { atual: unknown }).atual = null;
  m.criarContrato.resposta = { data: "k-novo", error: null };
  m.criarNegContrato.resposta = { data: "k-novo", error: null };
  m.rpcs.length = 0;
  m.erro.mockReset();
});
afterEach(cleanup);

const dialogo = (): PropsDoDialogo => (m.dialogo as { atual: PropsDoDialogo }).atual;
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

async function abrir(endereco: string, bandeira: boolean | null = null) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<FechoV4Context.Provider value={bandeira}><QueryClientProvider client={cliente}><MemoryRouter initialEntries={[endereco]}><ClientContracts /></MemoryRouter></QueryClientProvider></FechoV4Context.Provider>);
  await waitFor(() => expect(dialogo()?.open).toBe(true));
  // A lista de propostas chega por uma consulta à parte: espera por ela.
  await waitFor(() => expect(dialogo().proposals.length).toBeGreaterThan(0));
}
const criar = async (propostaId: string) => {
  await act(async () => { dialogo().onSave({ proposal_id: propostaId, template_id: "", start_date: "", end_date: "", notes: "", payment_terms: "" }); });
  await tick();
};

const VOLTAR = encodeURIComponent("/pessoas?open=1");
const endereco = (extra = "") => `/client-contracts?newContract=true&proposalId=P${extra}&voltar=${VOLTAR}`;
const chamadas = (nome: string) => m.rpcs.filter((r) => r.nome === nome);

describe("ClientContracts: contrato novo dentro de um negócio", () => {
  it("com ?negocio= o diálogo sabe a que negócio fica ligado", async () => {
    await abrir(endereco("&negocio=8c1f6d3e-2b7a-4c59-9e0a-5d4b7a1c3f20"));
    await waitFor(() => expect(dialogo().negocioLigado).toEqual({ titulo: "Cozinha da Ana" }));
  });

  it("grava por neg_criar_contrato com o negócio e os 15 argumentos de sempre, e não por rpc_create_client_contract", async () => {
    await abrir(endereco("&negocio=8c1f6d3e-2b7a-4c59-9e0a-5d4b7a1c3f20"));
    await criar("P");
    expect(chamadas("rpc_create_client_contract")).toHaveLength(0);
    expect(chamadas("neg_criar_contrato")).toHaveLength(1);
    const p = chamadas("neg_criar_contrato")[0].params;
    expect(Object.keys(p)).toHaveLength(16);
    expect(p).toMatchObject({ p_negocio_id: "8c1f6d3e-2b7a-4c59-9e0a-5d4b7a1c3f20", p_proposal_id: "P", p_client_id: "c1", p_organization_id: "org-1", p_currency: "EUR" });
  });

  it("depois de criar volta à ficha sem o contrato para ligar (já nasceu ligado)", async () => {
    await abrir(endereco("&negocio=8c1f6d3e-2b7a-4c59-9e0a-5d4b7a1c3f20"));
    await criar("P");
    expect(m.navegar).toHaveBeenCalledTimes(1);
    expect(m.navegar).toHaveBeenCalledWith("/pessoas?open=1");
  });

  it("um erro da base (NG023) diz-se traduzido, nunca em bruto, e não navega", async () => {
    m.criarNegContrato.resposta = { data: null, error: { code: "NG023", message: "Este negócio fecha na proposta (venda directa): não leva contratos." } };
    await abrir(endereco("&negocio=8c1f6d3e-2b7a-4c59-9e0a-5d4b7a1c3f20"));
    await criar("P");
    expect(m.erro).toHaveBeenCalledTimes(1);
    expect(m.erro.mock.calls[0][1]).toEqual({ description: "pessoasPagina.erroNeg.ng023" });
    expect(m.navegar).not.toHaveBeenCalled();
  });

  it("um ?negocio= que não é um identificador válido é ignorado: grava como sempre e nunca chama neg_criar_contrato", async () => {
    await abrir(endereco("&negocio=nao-e-um-id"));
    expect(dialogo().negocioLigado ?? null).toBeNull();
    await criar("P");
    expect(chamadas("neg_criar_contrato")).toHaveLength(0);
    expect(chamadas("rpc_create_client_contract")).toHaveLength(1);
  });

  it("sem ?negocio= grava como sempre e nunca chama neg_criar_contrato", async () => {
    await abrir(endereco());
    expect(dialogo().negocioLigado ?? null).toBeNull();
    await criar("P");
    expect(chamadas("neg_criar_contrato")).toHaveLength(0);
    expect(chamadas("rpc_create_client_contract")).toHaveLength(1);
    expect(m.navegar).toHaveBeenCalledWith("/pessoas?open=1&novoContrato=k-novo");
  });

  it("com a bandeira desligada o ?negocio= é ignorado: grava como sempre e a ficha liga ao voltar", async () => {
    await abrir(endereco("&negocio=8c1f6d3e-2b7a-4c59-9e0a-5d4b7a1c3f20"), false);
    expect(dialogo().negocioLigado ?? null).toBeNull();
    await criar("P");
    expect(chamadas("neg_criar_contrato")).toHaveLength(0);
    expect(chamadas("rpc_create_client_contract")).toHaveLength(1);
    expect(m.navegar).toHaveBeenCalledWith("/pessoas?open=1&novoContrato=k-novo");
  });
});
