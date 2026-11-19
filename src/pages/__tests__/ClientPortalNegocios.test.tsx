// «Os Meus Negócios» no portal do cliente, nos dois idiomas: o português fica como era; o inglês traduz as palavras
// (títulos, passos, plurais) e deixa o dinheiro, os números e o que vem da base como estão.
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
let propostas: unknown[] = [];

function cadeia(resultado: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "in"]) c[m] = () => c;
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(resultado()).then(res);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (tabela: string) => cadeia(() => ({ data: tabela === "proposals" ? propostas : [], error: null })),
  },
}));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/portal/PortalOrgsErrorState", () => ({ PortalOrgsErrorState: () => <p>erro</p> }));
let hasMultiple = false;
vi.mock("@/contexts/PortalCompanyContext", () => ({
  usePortalCompany: () => ({
    activeOrg: { organizationId: "o1", entityId: "e1", proposalId: null, name: "Empresa" },
    isLoading: false,
    isError: false,
    hasMultiple,
  }),
}));

import { definirIdioma, reporIdiomaEmMemoria } from "@/portal-i18n/armazemIdioma";
import { formatCurrency } from "@/lib/utils";
import ClientPortalNegocios from "../ClientPortalNegocios";

function mostrar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ClientPortalNegocios />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const proposta = { id: "p1", title: "Remodelação da cozinha", proposal_number: "P-001", value: 1500, status: "accepted", negocio_id: "n1", created_at: "2026-10-01T10:00:00Z" };

beforeEach(() => {
  window.localStorage.clear();
  reporIdiomaEmMemoria();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: {}, error: null });
  propostas = [];
  hasMultiple = false;
});
afterEach(() => reporIdiomaEmMemoria());

describe("ClientPortalNegocios", () => {
  it("em português: título e lista vazia como sempre", async () => {
    hasMultiple = true;
    mostrar();
    expect(await screen.findByText("Os Meus Negócios")).toBeInTheDocument();
    expect(await screen.findByText("Não tem negócios disponíveis.")).toBeInTheDocument();
    expect(screen.getByText("Se esperava ver outros, troque de empresa no seletor no topo da página.")).toBeInTheDocument();
  });

  it("em inglês: título e lista vazia", async () => {
    definirIdioma("en");
    hasMultiple = true;
    mostrar();
    expect(await screen.findByText("My Projects")).toBeInTheDocument();
    expect(await screen.findByText("You have no projects available.")).toBeInTheDocument();
    expect(screen.getByText(/^If you were expecting to see others/)).toBeInTheDocument();
  });

  it("em português: um negócio, com o passo, o selo de mensagens novas e o botão", async () => {
    propostas = [proposta];
    rpc.mockResolvedValue({ data: { n1: 2 }, error: null });
    mostrar();
    expect(await screen.findByText("Remodelação da cozinha")).toBeInTheDocument();
    expect(screen.getByText(`P-001 • ${formatCurrency(1500)}`)).toBeInTheDocument();
    expect(screen.getByText("Assinar o contrato")).toBeInTheDocument();
    expect(await screen.findByText("2 mensagens novas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir Remodelação da cozinha" })).toHaveTextContent("Abrir");
    expect(screen.getByRole("img", { name: "Passo 3 de 5: Assinar o contrato" })).toBeInTheDocument();
  });

  it("em inglês: o mesmo negócio, com palavras em inglês e o dinheiro igual", async () => {
    definirIdioma("en");
    propostas = [proposta];
    rpc.mockResolvedValue({ data: { n1: 1 }, error: null });
    mostrar();
    expect(await screen.findByText("Remodelação da cozinha")).toBeInTheDocument();
    expect(screen.getByText(`P-001 • ${formatCurrency(1500)}`)).toBeInTheDocument();
    expect(screen.getByText("Sign the contract")).toBeInTheDocument();
    expect(await screen.findByText("1 new message")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Remodelação da cozinha" })).toHaveTextContent("Open");
    expect(screen.getByRole("img", { name: "Step 3 of 5: Sign the contract" })).toBeInTheDocument();
  });
});
