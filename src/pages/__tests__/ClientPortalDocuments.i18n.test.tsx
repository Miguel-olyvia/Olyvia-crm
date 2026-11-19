// Lista de documentos do portal de cliente: português como estava; em inglês títulos, estados vazios, origens
// («Proposal P-1») e datas (só as palavras: meses) seguem o idioma. Nomes de ficheiro vêm como estão.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
let contexto: Record<string, unknown> = {};
let tabelas: Record<string, unknown[]> = {};

function chain(tabela: string) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "not", "order"]) c[m] = () => c;
  c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: tabelas[tabela] ?? [] }).then(res);
  return c;
}

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => chain(tabela),
    storage: { from: () => ({ download: async () => ({ data: null, error: new Error("x") }) }) },
  },
}));
vi.mock("@/lib/portal/contractAccess", () => ({ resolvePortalContractIdsForUsers: async () => [] }));
vi.mock("@/contexts/PortalCompanyContext", () => ({ usePortalCompany: () => contexto }));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/portal/PortalOrgsErrorState", () => ({ PortalOrgsErrorState: () => <p>erro-empresas</p> }));

import ClientPortalDocuments from "../ClientPortalDocuments";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const ORG = { portalUserId: "pu1", organizationId: "o1", entityId: null, name: "Alfa", proposalId: "p1", contractId: null, quoteId: null };

beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  toast.mockReset();
  contexto = { activeOrg: ORG, isLoading: false, isError: false, hasMultiple: false };
  tabelas = {};
});
afterEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
});

const comDocumentos = () => {
  tabelas = {
    proposals: [{ id: "p1", title: "Titulo", proposal_number: "P-1", document_url: "https://x/p.pdf", created_at: "2025-03-05T12:00:00Z" }],
    documents: [{ id: "d1", file_name: "anexo.pdf", file_url: "https://x/a.pdf", file_type: "pdf", created_at: "2025-03-06T12:00:00Z" }],
  };
};

describe("ClientPortalDocuments: idioma", () => {
  it("português: título, estado vazio e dica de troca de empresa como hoje", async () => {
    contexto = { ...contexto, activeOrg: { ...ORG, proposalId: null }, hasMultiple: true };
    render(<ClientPortalDocuments />);
    expect(screen.getByRole("heading", { name: "Documentos" })).toBeInTheDocument();
    expect(await screen.findByText("Ainda não tem documentos disponíveis.")).toBeInTheDocument();
    expect(screen.getByText("Se esperava ver outros, troque de empresa no seletor no topo da página.")).toBeInTheDocument();
  });

  it("inglês: título, estado vazio e dica", async () => {
    definirIdioma("en");
    contexto = { ...contexto, activeOrg: { ...ORG, proposalId: null }, hasMultiple: true };
    render(<ClientPortalDocuments />);
    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument();
    expect(await screen.findByText("You don't have any documents available yet.")).toBeInTheDocument();
    expect(screen.getByText(/switch company using the selector/i)).toBeInTheDocument();
  });

  it("português: origem e data como hoje; o nome do anexo fica como vem", async () => {
    comDocumentos();
    render(<ClientPortalDocuments />);
    expect(await screen.findByText("Proposta P-1 • PDF • 5 mar 2025")).toBeInTheDocument();
    expect(screen.getByText("Proposta • PDF • 6 mar 2025")).toBeInTheDocument();
    expect(screen.getByText("anexo.pdf")).toBeInTheDocument();
  });

  it("inglês: origem e mês em inglês; o nome do anexo fica como vem", async () => {
    definirIdioma("en");
    comDocumentos();
    render(<ClientPortalDocuments />);
    expect(await screen.findByText("Proposal P-1 • PDF • 5 Mar 2025")).toBeInTheDocument();
    expect(screen.getByText("Proposal • PDF • 6 Mar 2025")).toBeInTheDocument();
    expect(screen.getByText("anexo.pdf")).toBeInTheDocument();
  });

  it("os documentos já carregados mudam de língua sem recarregar a lista", async () => {
    comDocumentos();
    render(<ClientPortalDocuments />);
    await screen.findByText("Proposta P-1 • PDF • 5 mar 2025");
    definirIdioma("en");
    expect(await screen.findByText("Proposal P-1 • PDF • 5 Mar 2025")).toBeInTheDocument();
  });

  it("falha ao descarregar: toast no idioma do portal", async () => {
    definirIdioma("en");
    tabelas = {
      proposals: [],
      documents: [{ id: "d1", file_name: "anexo.pdf", file_url: "caminho/a.pdf", file_type: "pdf", created_at: "2025-03-06T12:00:00Z" }],
    };
    render(<ClientPortalDocuments />);
    fireEvent.click(await screen.findByText("anexo.pdf"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: "Download failed", description: "The document could not be downloaded.", variant: "destructive" }),
    );
  });

  it("falha das empresas: mostra o estado de erro e não «sem documentos»", async () => {
    contexto = { ...contexto, isError: true };
    render(<ClientPortalDocuments />);
    expect(await screen.findByText("erro-empresas")).toBeInTheDocument();
    expect(screen.queryByText("Ainda não tem documentos disponíveis.")).toBeNull();
  });
});
