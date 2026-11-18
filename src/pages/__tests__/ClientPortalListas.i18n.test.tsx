// As listas do portal de cliente (propostas, contratos, documentos) nos dois idiomas: o português fica como
// estava (textos, datas «5 mar 2026», moeda «€1.234,50»); em inglês passam a ser ingleses, incluindo o que
// antes era montado no código (a origem do documento, «Proposta {número}») e as etiquetas de estado.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
let dados: Record<string, unknown[]> = {};
let contexto: Record<string, unknown> = {};
let idsDeContratos: string[] = [];

function chain(table: string) {
  const c: Record<string, unknown> = {};
  let tipoDeEntidade: unknown;
  for (const m of ["select", "in", "order", "not"]) c[m] = () => c;
  // `documents` é consultada uma vez por tipo de entidade: devolve só as linhas desse tipo.
  c.eq = (coluna: string, valor: unknown) => {
    if (coluna === "entity_type") tipoDeEntidade = valor;
    return c;
  };
  c.then = (res: (v: unknown) => unknown) => {
    const linhas = (dados[table] ?? []).filter(
      (l) => tipoDeEntidade === undefined || (l as { entity_type?: unknown }).entity_type === tipoDeEntidade,
    );
    return Promise.resolve({ data: linhas }).then(res);
  };
  return c;
}

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => chain(t), storage: { from: () => ({ download: vi.fn() }) } },
}));
vi.mock("@/lib/portal/contractAccess", () => ({ resolvePortalContractIdsForUsers: async () => idsDeContratos }));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/contexts/PortalCompanyContext", () => ({ usePortalCompany: () => contexto }));

import ClientPortalProposals from "../ClientPortalProposals";
import ClientPortalContracts from "../ClientPortalContracts";
import ClientPortalDocuments from "../ClientPortalDocuments";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const ORG = {
  portalUserId: "pu1", organizationId: "o1", entityId: "e1", clientId: null, name: "Alfa Lda", logoUrl: null,
  createdAt: "2026-01-01", firstLogin: false, proposalId: "p1", contractId: null, quoteId: null, directSaleId: null,
};

const montar = (pagina: React.ReactElement) => render(<MemoryRouter>{pagina}</MemoryRouter>);

beforeEach(() => {
  window.localStorage.clear();
  definirIdioma("pt");
  toast.mockReset();
  dados = {};
  idsDeContratos = [];
  contexto = { activeOrg: ORG, isLoading: false, isError: false, hasMultiple: false };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  definirIdioma("pt");
});

describe("ClientPortalProposals", () => {
  const proposta = {
    id: "p1", title: "Remodelação da cozinha", proposal_number: "P-2026-001", value: 1234.5,
    created_at: "2026-03-05T10:00:00Z", valid_until: "2026-04-15T10:00:00Z", status: "sent", organization_id: "o1",
    anew_organizations: { name: "Alfa Lda" },
  };

  it("português: título, moeda, datas e «Válida até» como hoje", async () => {
    dados.proposals = [proposta];
    montar(<ClientPortalProposals />);
    expect(screen.getByRole("heading", { name: "As Minhas Propostas" })).toBeInTheDocument();
    expect(await screen.findByText("Remodelação da cozinha")).toBeInTheDocument();
    expect(screen.getByText("€1.234,50")).toBeInTheDocument();
    expect(screen.getByText("5 mar 2026")).toBeInTheDocument();
    expect(screen.getByText("Válida até 15 abr 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Ver/ })).toBeInTheDocument();
  });

  it("inglês: título, moeda, datas, «Valid until» e «View»; os dados das pessoas ficam", async () => {
    definirIdioma("en");
    dados.proposals = [proposta];
    montar(<ClientPortalProposals />);
    expect(screen.getByRole("heading", { name: "My Proposals" })).toBeInTheDocument();
    expect(await screen.findByText("Remodelação da cozinha")).toBeInTheDocument();
    expect(screen.getByText("P-2026-001")).toBeInTheDocument();
    expect(screen.getByText("€1.234,50")).toBeInTheDocument();
    expect(screen.getByText("5 Mar 2026")).toBeInTheDocument();
    expect(screen.getByText("Valid until 15 Apr 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^View/ })).toBeInTheDocument();
  });

  it("vazio: texto e dica das várias empresas nos dois idiomas", async () => {
    contexto = { ...contexto, hasMultiple: true };
    montar(<ClientPortalProposals />);
    expect(await screen.findByText("Não tem propostas disponíveis.")).toBeInTheDocument();
    expect(screen.getByText("Se esperava ver outras, troque de empresa no seletor no topo da página.")).toBeInTheDocument();
    act(() => definirIdioma("en"));
    expect(await screen.findByText("You have no proposals available.")).toBeInTheDocument();
    expect(screen.getByText(/switch company using the selector at the top of the page/i)).toBeInTheDocument();
  });

  it("erro ao carregar as empresas mostra o estado de erro traduzido", async () => {
    definirIdioma("en");
    contexto = { ...contexto, isError: true, refetchPortalOrgs: vi.fn(), isFetching: false };
    dados.proposals = [];
    montar(<ClientPortalProposals />);
    expect(await screen.findByText("We could not load your data.")).toBeInTheDocument();
  });
});

describe("ClientPortalContracts", () => {
  const contrato = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    id, contract_number: `CC-2026-000${id}`, total_value: 5000, start_date: "2026-03-05", end_date: "2026-12-31",
    status, created_at: "2026-03-01T10:00:00Z", ...extra,
  });

  it("português: título, estados (incluindo pending_signature), moeda e datas", async () => {
    idsDeContratos = ["1", "2", "3"];
    dados.client_contracts = [contrato("1", "signed"), contrato("2", "pending_signature"), contrato("3", "cancelled")];
    montar(<ClientPortalContracts />);
    expect(screen.getByRole("heading", { name: "Os Meus Contratos" })).toBeInTheDocument();
    expect(await screen.findByText("Contrato assinado")).toBeInTheDocument();
    expect(screen.getByText("A aguardar decisão")).toBeInTheDocument();
    expect(screen.getByText("Anulado")).toBeInTheDocument();
    expect(screen.queryByText("pending_signature")).toBeNull();
    expect(screen.getAllByText("€5.000,00")).toHaveLength(3);
    expect(screen.getAllByText("5 mar 2026")).toHaveLength(3);
    expect(screen.getAllByText("— 31 dez 2026")).toHaveLength(3);
  });

  it("inglês: estados, moeda, datas e «View»", async () => {
    definirIdioma("en");
    idsDeContratos = ["1", "2"];
    dados.client_contracts = [contrato("1", "signed"), contrato("2", "pending_signature")];
    montar(<ClientPortalContracts />);
    expect(screen.getByRole("heading", { name: "My Contracts" })).toBeInTheDocument();
    expect(await screen.findByText("Contract signed")).toBeInTheDocument();
    expect(screen.getByText("Awaiting your decision")).toBeInTheDocument();
    expect(screen.getAllByText("€5.000,00")).toHaveLength(2);
    expect(screen.getAllByText("5 Mar 2026")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^View/ })).toHaveLength(2);
    expect(screen.getByText("CC-2026-0001")).toBeInTheDocument();
  });

  it("sem número de contrato mostra «Contrato» / «Contract»; estado desconhecido volta como veio", async () => {
    idsDeContratos = ["9"];
    dados.client_contracts = [contrato("9", "estado_novo", { contract_number: null })];
    montar(<ClientPortalContracts />);
    expect(await screen.findByText("Contrato")).toBeInTheDocument();
    expect(screen.getByText("estado_novo")).toBeInTheDocument();
    act(() => definirIdioma("en"));
    expect(await screen.findByText("Contract")).toBeInTheDocument();
    expect(screen.getByText("estado_novo")).toBeInTheDocument();
  });

  it("vazio nos dois idiomas, com a dica das várias empresas", async () => {
    contexto = { ...contexto, hasMultiple: true };
    montar(<ClientPortalContracts />);
    expect(await screen.findByText("Não tem contratos disponíveis.")).toBeInTheDocument();
    expect(screen.getByText("Se esperava ver outros, troque de empresa no seletor no topo da página.")).toBeInTheDocument();
    act(() => definirIdioma("en"));
    expect(await screen.findByText("You have no contracts available.")).toBeInTheDocument();
  });
});

describe("ClientPortalDocuments", () => {
  const preparar = () => {
    dados.proposals = [
      { id: "p1", title: "Titulo", proposal_number: "P-1", document_url: "https://x.test/p.pdf", created_at: "2026-03-05T10:00:00Z" },
    ];
    dados.documents = [
      { id: "d1", file_name: "anexo.pdf", file_url: "https://x.test/a.pdf", file_type: "pdf", document_type: null, created_at: "2026-02-01T10:00:00Z", entity_type: "proposal" },
    ];
  };

  it("português: título, nome e origem do PDF da proposta, origem dos anexos e datas", async () => {
    preparar();
    montar(<ClientPortalDocuments />);
    expect(screen.getByRole("heading", { name: "Documentos" })).toBeInTheDocument();
    expect(await screen.findByText("Proposta P-1")).toBeInTheDocument();
    expect(screen.getByText("Proposta P-1 • PDF • 5 mar 2026")).toBeInTheDocument();
    expect(screen.getByText("anexo.pdf")).toBeInTheDocument();
    expect(screen.getByText("Proposta • PDF • 1 fev 2026")).toBeInTheDocument();
  });

  it("inglês: «Proposal P-1» montado na apresentação, origem e datas inglesas; nome do anexo como vem", async () => {
    definirIdioma("en");
    preparar();
    montar(<ClientPortalDocuments />);
    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument();
    expect(await screen.findByText("Proposal P-1")).toBeInTheDocument();
    expect(screen.getByText("Proposal P-1 • PDF • 5 Mar 2026")).toBeInTheDocument();
    expect(screen.getByText("anexo.pdf")).toBeInTheDocument();
    expect(screen.getByText("Proposal • PDF • 1 Feb 2026")).toBeInTheDocument();
  });

  it("trocar de idioma com a lista aberta muda o que é montado na apresentação, sem recarregar", async () => {
    preparar();
    montar(<ClientPortalDocuments />);
    expect(await screen.findByText("Proposta P-1")).toBeInTheDocument();
    act(() => definirIdioma("en"));
    expect(await screen.findByText("Proposal P-1")).toBeInTheDocument();
    expect(screen.queryByText("Proposta P-1")).toBeNull();
  });

  it("origem dos anexos de contrato e de orçamento", async () => {
    idsDeContratos = ["c1"];
    contexto = { ...contexto, activeOrg: { ...ORG, proposalId: null, quoteId: "q1" } };
    dados.client_contracts = [];
    dados.documents = [
      { id: "d1", file_name: "c.pdf", file_url: "https://x.test/c.pdf", file_type: "pdf", created_at: "2026-02-01T10:00:00Z", entity_type: "contract" },
      { id: "d2", file_name: "q.pdf", file_url: "https://x.test/q.pdf", file_type: "pdf", created_at: "2026-02-02T10:00:00Z", entity_type: "quote" },
    ];
    montar(<ClientPortalDocuments />);
    expect(await screen.findAllByText(/^Contrato • PDF/)).not.toHaveLength(0);
    expect(screen.getAllByText(/^Orçamento • PDF/)).not.toHaveLength(0);
    act(() => definirIdioma("en"));
    expect(await screen.findAllByText(/^Contract • PDF/)).not.toHaveLength(0);
    expect(screen.getAllByText(/^Quote • PDF/)).not.toHaveLength(0);
  });

  it("vazio nos dois idiomas, com a dica das várias empresas", async () => {
    contexto = { ...contexto, hasMultiple: true, activeOrg: { ...ORG, proposalId: null } };
    montar(<ClientPortalDocuments />);
    expect(await screen.findByText("Ainda não tem documentos disponíveis.")).toBeInTheDocument();
    expect(screen.getByText("Se esperava ver outros, troque de empresa no seletor no topo da página.")).toBeInTheDocument();
    act(() => definirIdioma("en"));
    expect(await screen.findByText("You don't have any documents available yet.")).toBeInTheDocument();
  });

  it("falha a descarregar: toast no idioma ativo", async () => {
    preparar();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("rede")));
    montar(<ClientPortalDocuments />);
    fireEvent.click((await screen.findByText("anexo.pdf")).closest("button")!);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: "Erro ao descarregar",
        description: "Não foi possível descarregar o documento.",
        variant: "destructive",
      }),
    );
    toast.mockReset();
    act(() => definirIdioma("en"));
    fireEvent.click((await screen.findByText("anexo.pdf")).closest("button")!);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: "Download failed",
        description: "The document could not be downloaded.",
        variant: "destructive",
      }),
    );
  });

  it("o ficheiro descarregado leva o nome apresentado (proposta em inglês)", async () => {
    definirIdioma("en");
    preparar();
    const nomes: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"]) }));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      nomes.push(this.download);
    });
    montar(<ClientPortalDocuments />);
    fireEvent.click((await screen.findByText("Proposal P-1")).closest("button")!);
    await waitFor(() => expect(nomes).toEqual(["Proposal P-1"]));
  });
});
