import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve(result);
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

const PROPOSTAS = [
  { id: "p1", title: "Cozinha", proposal_number: "P-1", value: 1500, created_at: "2026-03-05T10:00:00Z", valid_until: "2026-04-01", status: "sent" },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: { user: { email: "ana@x.pt", user_metadata: { full_name: "Ana Silva" } } } } }),
    },
    from: (table: string) =>
      table === "anew_organizations" ? chain({ data: { name: "Acme", metadata: {} } }) : chain({ data: PROPOSTAS }),
  },
}));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/portal/PortalOrgsErrorState", () => ({ PortalOrgsErrorState: () => <div /> }));

const ORG = { organizationId: "o1", entityId: "e1", proposalId: null, name: "Acme", createdAt: "2026-01-01T00:00:00Z" };
const CONTEXTO = { activeOrg: ORG, isLoading: false, isError: false, hasMultiple: false };
vi.mock("@/contexts/PortalCompanyContext", () => ({ usePortalCompany: () => CONTEXTO }));

const PORTAL = {
  proposalCount: 1,
  pendingProposals: 1,
  contractCount: 1,
  activeContracts: 1,
  quoteCount: 0,
  pendingQuotes: 0,
  documentCount: 2,
  pendingActions: [
    { id: "p1", type: "proposal", title: null, status: "sent", date: "2026-03-05T10:00:00Z" },
    { id: "c1", type: "contract", title: "C-1", status: "pending", date: "2026-03-06T10:00:00Z" },
  ],
  commercial: { name: null, phone: null, email: "com@x.pt" },
  loading: false,
};
vi.mock("@/hooks/useClientPortalData", () => ({ useClientPortalData: () => PORTAL }));

import ClientPortal from "../ClientPortal";

function renderPage() {
  return render(
    <MemoryRouter>
      <ClientPortal />
    </MemoryRouter>,
  );
}

describe("ClientPortal (início) - idioma do portal", () => {
  afterEach(() => {
    act(() => definirIdioma("pt"));
  });

  it("em português: textos de sempre; títulos em falta traduzem-se aqui e não no hook", async () => {
    renderPage();
    expect(await screen.findByText("Olá, Ana 👋")).toBeTruthy();
    expect(screen.getByText("Tem 2 ações pendentes")).toBeTruthy();
    expect(screen.getByText("Proposta sem título")).toBeTruthy();
    expect(screen.getByText("Gestor Comercial")).toBeTruthy();
    expect(screen.getByText("1 ativo")).toBeTruthy();
    expect(screen.getByText(/Válida até 1 abr 2026/)).toBeTruthy();
    expect(screen.getByText("2 documentos disponíveis")).toBeTruthy();
    expect(screen.getAllByText(/€1\.500,00/).length).toBeGreaterThan(0);
  });

  it("em inglês: palavras traduzidas, dinheiro e dd/mm iguais", async () => {
    act(() => definirIdioma("en"));
    renderPage();
    expect(await screen.findByText("Hello, Ana 👋")).toBeTruthy();
    expect(screen.getByText("You have 2 pending actions")).toBeTruthy();
    expect(screen.getByText("Untitled proposal")).toBeTruthy();
    expect(screen.getByText("Sales Manager")).toBeTruthy();
    expect(screen.getByText("1 active")).toBeTruthy();
    expect(screen.getByText(/Valid until 1 Apr 2026/)).toBeTruthy();
    expect(screen.getByText("2 documents available")).toBeTruthy();
    expect(screen.getAllByText(/€1\.500,00/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Proposta sem título")).toBeNull();
  });
});
