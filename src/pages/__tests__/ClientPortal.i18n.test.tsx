// Início do portal do cliente: português como hoje, inglês quando o cliente o escolhe
// (saudação, banner, cartões, plurais, atividade, comercial, FAQ e empresa).
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { portal, orgsEstado } = vi.hoisted(() => ({
  portal: { valor: {} as Record<string, unknown> },
  orgsEstado: { erro: false, varias: false },
}));

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve(result);
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

const PROPOSTAS = [
  { id: "p1", title: "Cozinha", proposal_number: "P-1", value: 1234.5, created_at: "2026-03-05T10:00:00", valid_until: "2026-04-10T10:00:00", status: "sent" },
  { id: "p2", title: "Casa de banho", proposal_number: null, value: 800, created_at: "2026-02-01T10:00:00", valid_until: null, status: "accepted" },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: { user: { email: "ana@x.pt", user_metadata: { full_name: "Ana Silva" } } } } }),
    },
    from: (table: string) =>
      table === "anew_organizations"
        ? chain({ data: { name: "Mudelar Teste", metadata: { email: "geral@x.pt", phone: "210000000", website: "x.pt" } } })
        : chain({ data: PROPOSTAS }),
  },
}));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/portal/PortalOrgsErrorState", () => ({ PortalOrgsErrorState: () => <div>erro-orgs</div> }));
vi.mock("@/contexts/PortalCompanyContext", () => ({
  usePortalCompany: () => ({
    activeOrg: { organizationId: "o1", entityId: "e1", proposalId: null, name: "Mudelar", createdAt: "2026-01-10T10:00:00" },
    isLoading: false,
    isError: orgsEstado.erro,
    hasMultiple: orgsEstado.varias,
  }),
}));
vi.mock("@/hooks/useClientPortalData", () => ({ useClientPortalData: () => portal.valor }));
vi.mock("@/hooks/usePortalEntityName", () => ({ usePortalEntityName: () => null }));

import ClientPortal from "../ClientPortal";
import { definirIdioma, reporIdiomaEmMemoria } from "@/portal-i18n/armazemIdioma";

const DADOS = (extra: Record<string, unknown> = {}) => ({
  loading: false,
  proposalCount: 2,
  pendingProposals: 1,
  contractCount: 1,
  activeContracts: 1,
  documentCount: 3,
  pendingActions: [
    { id: "p1", type: "proposal", title: "Cozinha", status: "sent", date: "2026-03-05T10:00:00" },
    { id: "c1", type: "contract", title: "Contrato 7", status: "pending", date: "2026-03-06T10:00:00" },
  ],
  commercial: { name: "Rui Costa", phone: "910000000", email: "rui@x.pt" },
  ...extra,
});

/** As propostas chegam de forma assíncrona: espera por elas antes de olhar para o resto. */
async function propostasCarregadas() {
  await screen.findByText("Casa de banho");
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ClientPortal />
    </MemoryRouter>,
  );
}

describe("ClientPortal (início): idioma", () => {
  beforeEach(() => {
    window.localStorage.clear();
    reporIdiomaEmMemoria();
    orgsEstado.erro = false;
    orgsEstado.varias = false;
    portal.valor = DADOS();
  });
  afterEach(() => {
    window.localStorage.clear();
    reporIdiomaEmMemoria();
  });

  it("pt: saudação, banner, cartões, listas e barras laterais como hoje", async () => {
    renderPage();
    await propostasCarregadas();
    expect(await screen.findByText("Olá, Ana 👋")).toBeTruthy();
    expect(screen.getByText("Tem 2 ações pendentes")).toBeTruthy();
    expect(screen.getByText(/Cozinha · €1\.234,50/)).toBeTruthy();
    expect(screen.getByText(/· Válida até 10 abr 2026/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ver proposta/ })).toBeTruthy();
    expect(screen.getByText("1 a aguardar decisão")).toBeTruthy();
    expect(screen.getByText("1 ativo")).toBeTruthy();
    expect(screen.getByText("Ações Pendentes")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Ver e decidir/ })).toHaveLength(2);
    expect(screen.getByText(/^Contrato · 6 mar 2026$/)).toBeTruthy();
    expect(screen.getByText("As suas Propostas")).toBeTruthy();
    expect(screen.getByText("Atividade Recente")).toBeTruthy();
    expect(screen.getByText("Proposta \"Casa de banho\" aceite")).toBeTruthy();
    expect(screen.getByText("Contrato gerado a partir da proposta")).toBeTruthy();
    expect(screen.getByText("3 documentos disponíveis")).toBeTruthy();
    expect(screen.getByText("Conta de acesso ao portal criada")).toBeTruthy();
    expect(screen.getByText("O seu Comercial")).toBeTruthy();
    expect(screen.getByText("Gestor Comercial")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ligar/ })).toBeTruthy();
    expect(screen.getByText("Como funciona o portal?")).toBeTruthy();
    expect(screen.getByText("Empresa")).toBeTruthy();
  });

  it("en: tudo em inglês, moeda e datas à inglesa, plurais corretos", async () => {
    definirIdioma("en");
    renderPage();
    await propostasCarregadas();
    expect(await screen.findByText("Hello, Ana 👋")).toBeTruthy();
    expect(screen.getByText("You have 2 pending actions")).toBeTruthy();
    expect(screen.getByText(/Cozinha · €1\.234,50/)).toBeTruthy();
    expect(screen.getByText(/· Valid until 10 Apr 2026/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /View proposal/ })).toBeTruthy();
    expect(screen.getByText("1 awaiting your decision")).toBeTruthy();
    expect(screen.getByText("1 active")).toBeTruthy();
    expect(screen.getByText("Pending Actions")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /View and decide/ })).toHaveLength(2);
    expect(screen.getByText(/^Contract · 6 Mar 2026$/)).toBeTruthy();
    expect(screen.getByText("Your Proposals")).toBeTruthy();
    expect(screen.getByText("Recent Activity")).toBeTruthy();
    expect(screen.getByText("Proposal \"Casa de banho\" accepted")).toBeTruthy();
    expect(screen.getByText("Contract generated from the proposal")).toBeTruthy();
    expect(screen.getByText("3 documents available")).toBeTruthy();
    expect(screen.getByText("Portal access account created")).toBeTruthy();
    expect(screen.getByText("Your Sales Representative")).toBeTruthy();
    expect(screen.getByText("Sales Manager")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Call/ })).toBeTruthy();
    expect(screen.getByText("How does the portal work?")).toBeTruthy();
    expect(screen.getByText("Company")).toBeTruthy();
  });

  it("a data de hoje segue o idioma (em inglês sem «de»)", async () => {
    definirIdioma("en");
    renderPage();
    await propostasCarregadas();
    const hoje = await screen.findByText(/^[A-Z][a-z]+, \d{1,2} [A-Z][a-z]+ \d{4}$/i);
    expect(hoje.textContent).not.toMatch(/ de /);
  });

  it("singular: uma ação, um documento", async () => {
    portal.valor = DADOS({ documentCount: 1, pendingProposals: 0, activeContracts: 0, contractCount: 0, pendingActions: [] });
    renderPage();
    await propostasCarregadas();
    expect(await screen.findByText("Tem 1 ação pendente")).toBeTruthy();
    expect(screen.getByText("1 documento disponível")).toBeTruthy();
  });

  it("singular em inglês: uma ação, um documento", async () => {
    definirIdioma("en");
    portal.valor = DADOS({ documentCount: 1, pendingProposals: 0, activeContracts: 0, contractCount: 0, pendingActions: [] });
    renderPage();
    await propostasCarregadas();
    expect(await screen.findByText("You have 1 pending action")).toBeTruthy();
    expect(screen.getByText("1 document available")).toBeTruthy();
  });

  it("sem comercial e sem ações: mensagens vazias nas duas línguas", async () => {
    portal.valor = DADOS({ commercial: null, pendingActions: [], pendingProposals: 0 });
    const { unmount } = renderPage();
    await propostasCarregadas();
    expect(await screen.findByText("Não tem ações pendentes de momento.")).toBeTruthy();
    expect(screen.getByText("Informação do comercial indisponível.")).toBeTruthy();
    unmount();
    definirIdioma("en");
    renderPage();
    await propostasCarregadas();
    expect(await screen.findByText("You have no pending actions at the moment.")).toBeTruthy();
    expect(screen.getByText("Sales representative information unavailable.")).toBeTruthy();
  });

  it("R4: sem título e sem nome, o hook devolve só o dado e a falta traduz-se na apresentação", async () => {
    portal.valor = DADOS({
      pendingActions: [
        { id: "p1", type: "proposal", title: null, status: "sent", date: "2026-03-05T10:00:00" },
        { id: "c1", type: "contract", title: null, status: "pending", date: "2026-03-06T10:00:00" },
      ],
      commercial: { name: null, phone: "910000000", email: "rui@x.pt" },
    });
    const { unmount } = renderPage();
    await propostasCarregadas();
    expect(screen.getByText("Proposta sem título")).toBeTruthy();
    expect(screen.getByText("Contrato sem título")).toBeTruthy();
    expect(screen.getAllByText("Comercial").length).toBeGreaterThan(0);
    unmount();
    definirIdioma("en");
    renderPage();
    await propostasCarregadas();
    expect(screen.getByText("Untitled proposal")).toBeTruthy();
    expect(screen.getByText("Untitled contract")).toBeTruthy();
    expect(screen.getAllByText("Sales representative").length).toBeGreaterThan(0);
    expect(screen.queryByText("Proposta sem título")).toBeNull();
  });

  it("erro a carregar empresas: saudação traduzida", async () => {
    orgsEstado.erro = true;
    definirIdioma("en");
    renderPage();
    expect(await screen.findByText("Hello, Ana 👋")).toBeTruthy();
    expect(screen.getByText("erro-orgs")).toBeTruthy();
  });
});
