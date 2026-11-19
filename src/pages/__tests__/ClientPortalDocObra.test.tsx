// As páginas da proposta e do contrato no portal do cliente com o documento da obra: com o negócio e a vista (portal_neg_vista), os
// blocos aparecem; sem negócio ou sem vista, a página fica como antes (nem se pede a vista sem negócio).
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seed } from "@/emylia/motor";
import { vistaDoCliente } from "@/emylia/real/vistaCliente";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const invoke = vi.fn();
const rpc = vi.fn();
let contrato: Record<string, unknown> = {};
let proposta: Record<string, unknown> = {};

function cadeia(resultado: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve(resultado);
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(resultado).then(res);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: (tabela: string) => (tabela === "client_contracts" ? cadeia({ data: contrato }) : cadeia({ data: [] })),
    storage: { from: () => ({ download: vi.fn() }) },
  },
}));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/portal/negocio/ConversaDoNegocio", () => ({ ConversaDoNegocio: () => null }));
vi.mock("@/components/portal/negocio/PassosDoNegocio", () => ({ PassosDoNegocio: () => null, passoDoNegocio: () => 1 }));
vi.mock("@/contexts/PortalCompanyContext", () => ({ useSyncActiveOrgWithDocument: () => {} }));
vi.mock("@/components/contracts/contractDocument", () => ({
  injectSignaturesIntoBlock: (html: string) => html,
  resolveContractDocument: vi.fn(),
  downloadContractDocumentPdf: vi.fn(),
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/components/proposals/proposalPortalData", () => ({
  loadProposalPortalData: () => Promise.resolve({ proposal: proposta, template: null, quotes: [], quoteLines: {}, quoteFees: {}, commercial: { name: "Rúben" }, company: null }),
}));

import ClientPortalContractDetail from "../ClientPortalContractDetail";
import ClientPortalProposalDetail from "../ClientPortalProposalDetail";

/** A vista de um negócio do exemplo, como portal_neg_vista a devolve. */
function vistaJson() {
  const S = seed();
  const d = S.deals.find((x) => x.orc?.linhas.some((l) => l.t === "svc"))!;
  d.orc!.enviada = "01/11/2026";
  return JSON.parse(JSON.stringify({ vista: vistaDoCliente(d, S), rececao: null, respostas: [] }));
}

function abrir(caminho: string, rota: string, el: React.ReactElement) {
  return render(<MemoryRouter initialEntries={[caminho]}><Routes><Route path={rota} element={el} /></Routes></MemoryRouter>);
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  document.elementFromPoint = () => null;
});
beforeEach(() => {
  invoke.mockReset(); invoke.mockResolvedValue({ data: null, error: null });
  rpc.mockReset();
  contrato = { id: "c1", status: "pending", organization_id: "o1", contract_number: "C-1", total_value: 1000, contract_body_html: "<p>Minuta</p>" };
  proposta = { id: "p1", status: "sent", organization_id: "o1", title: "Remodelação", proposal_number: "P-1", created_at: "2026-11-01", value: 1000 };
});
afterEach(() => { cleanup(); act(() => definirIdioma("pt")); });

describe("contrato no portal com o documento da obra", () => {
  it("com o negócio e a vista: as cláusulas do negócio por baixo da minuta", async () => {
    contrato.negocio_id = "n1";
    rpc.mockResolvedValue({ data: vistaJson(), error: null });
    abrir("/c/c1", "/c/:id", <ClientPortalContractDetail />);
    expect(await screen.findByRole("heading", { name: "Cláusulas do negócio" })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("portal_neg_vista", { p_negocio_id: "n1" });
    expect(screen.getByText("Minuta")).toBeInTheDocument();
  });

  it("em inglês: os títulos das cláusulas traduzidos", async () => {
    act(() => definirIdioma("en"));
    contrato.negocio_id = "n1";
    rpc.mockResolvedValue({ data: vistaJson(), error: null });
    abrir("/c/c1", "/c/:id", <ClientPortalContractDetail />);
    expect(await screen.findByRole("heading", { name: "Deal clauses" })).toBeInTheDocument();
  });

  it("com o negócio mas sem vista: como antes", async () => {
    contrato.negocio_id = "n1";
    rpc.mockResolvedValue({ data: null, error: null });
    abrir("/c/c1", "/c/:id", <ClientPortalContractDetail />);
    expect(await screen.findByText("Minuta")).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByTestId("clausulas-obra")).toBeNull();
  });

  it("sem negócio: nem pede a vista", async () => {
    abrir("/c/c1", "/c/:id", <ClientPortalContractDetail />);
    expect(await screen.findByText("Minuta")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByTestId("clausulas-obra")).toBeNull();
  });
});

describe("proposta no portal com o documento da obra", () => {
  it("com o negócio e a vista: os blocos da obra antes da decisão", async () => {
    proposta.negocio_id = "n1";
    rpc.mockResolvedValue({ data: vistaJson(), error: null });
    abrir("/p/p1", "/p/:id", <ClientPortalProposalDetail />);
    expect(await screen.findByTestId("documento-obra")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /O que vamos fazer/ })).toBeInTheDocument();
    // o comercial da proposta assina pela empresa na aceitação
    expect(screen.getAllByText("Rúben").length).toBeGreaterThan(0);
  });

  it("sem vista: a proposta como antes", async () => {
    proposta.negocio_id = "n1";
    rpc.mockResolvedValue({ data: null, error: null });
    abrir("/p/p1", "/p/:id", <ClientPortalProposalDetail />);
    expect(await screen.findByText(/Remodelação/)).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByTestId("documento-obra")).toBeNull();
  });
});
