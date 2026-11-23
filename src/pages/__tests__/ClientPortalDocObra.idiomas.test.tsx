// RH: o conteúdo da obra (blocos da proposta, cláusulas do contrato) com documentos de mais de um idioma. A obra segue
// o idioma do documento VISÍVEL (o do seletor PT | EN), no ecrã e no PDF; um documento sem versões fica como hoje (o
// idioma do portal, ver ClientPortalDocObra.test.tsx). O PDF do contrato imprime as `versoes` do resolver: as cláusulas
// têm de ir também para a versão impressa, e não só para `bodyHtml`.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seed } from "@/emylia/motor";
import { vistaDoCliente } from "@/emylia/real/vistaCliente";
import { definirIdioma } from "@/portal-i18n/armazemIdioma";

const invoke = vi.fn();
const rpc = vi.fn();
let contrato: Record<string, unknown> = {};
let proposta: Record<string, unknown> = {};
let modeloDaProposta: Record<string, unknown> | null = null;

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
vi.mock("@/utils/generateProposalPdfBlob", () => ({
  generateProposalPdfBlob: vi.fn(async () => ({ blob: new Blob(["x"]), fileName: "p.pdf" })),
  downloadBlob: vi.fn(),
}));
vi.mock("@/components/proposals/proposalPortalData", () => ({
  loadProposalPortalData: () =>
    Promise.resolve({ proposal: proposta, template: modeloDaProposta, quotes: [], quoteLines: {}, quoteFees: {}, commercial: { name: "Rúben" }, company: null }),
}));

import ClientPortalContractDetail from "../ClientPortalContractDetail";
import ClientPortalProposalDetail from "../ClientPortalProposalDetail";
import { downloadContractDocumentPdf, resolveContractDocument } from "@/components/contracts/contractDocument";
import { generateProposalPdfBlob } from "@/utils/generateProposalPdfBlob";

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
const radio = (nome: string) => screen.getByRole("radio", { name: nome });

const COMPOSTO =
  `<div class="olv-versao olv-versao-pt"><h2>CONTRATO</h2></div>\n` +
  `<div class="olv-versao olv-versao-en" style="break-before:page;page-break-before:always"><h2>SERVICES AGREEMENT</h2></div>`;
const DOC_PT_EN = {
  bodyHtml: "(junto)",
  versoes: [
    { codigo: "pt", bodyHtml: "<h2>CONTRATO</h2>", settings: {} },
    { codigo: "en", bodyHtml: "<h2>SERVICES AGREEMENT</h2>", settings: {} },
  ],
};

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  document.elementFromPoint = () => null;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
});
beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockReset(); invoke.mockResolvedValue({ data: null, error: null });
  rpc.mockReset(); rpc.mockResolvedValue({ data: vistaJson(), error: null });
  contrato = { id: "c1", status: "pending", organization_id: "o1", contract_number: "C-1", total_value: 1000, contract_body_html: "<p>Minuta</p>", negocio_id: "n1" };
  proposta = { id: "p1", status: "sent", organization_id: "o1", title: "Remodelação", proposal_number: "P-1", created_at: "2026-11-01", value: 1000, negocio_id: "n1" };
  modeloDaProposta = null;
});
afterEach(() => { cleanup(); act(() => definirIdioma("pt")); });

describe("contrato: as cláusulas do negócio no PDF", () => {
  it("contrato de sempre: as cláusulas vão também para a versão que o PDF imprime (o resolver devolve sempre versoes)", async () => {
    vi.mocked(resolveContractDocument).mockResolvedValue({
      bodyHtml: "<p>Minuta</p>",
      versoes: [{ codigo: "pt", bodyHtml: "<p>Minuta</p>", settings: {} }],
    } as never);
    abrir("/c/c1", "/c/:id", <ClientPortalContractDetail />);
    await screen.findByRole("heading", { name: "Cláusulas do negócio" });
    fireEvent.click(screen.getByRole("button", { name: "Descarregar PDF" }));
    await waitFor(() => expect(downloadContractDocumentPdf).toHaveBeenCalled());
    const doc = vi.mocked(downloadContractDocumentPdf).mock.calls.at(-1)![0];
    expect(doc.versoes).toHaveLength(1);
    expect(doc.versoes[0].bodyHtml.startsWith("<p>Minuta</p>")).toBe(true);
    expect(doc.versoes[0].bodyHtml).toContain('<section data-doc-obra="contrato" lang="pt"');
    expect(doc.bodyHtml).toContain('<section data-doc-obra="contrato" lang="pt"');
  });

  it("pt + en: as cláusulas seguem a versão visível, no ecrã e no PDF (só a versão escolhida)", async () => {
    contrato = { ...contrato, contract_body_html: COMPOSTO, prompt_values: { __idiomas: "pt+en" } };
    vi.mocked(resolveContractDocument).mockResolvedValue(DOC_PT_EN as never);
    abrir("/c/c1", "/c/:id", <ClientPortalContractDetail />);
    await screen.findByText("CONTRATO");
    expect(await screen.findByRole("heading", { name: "Cláusulas do negócio" })).toBeInTheDocument();

    fireEvent.click(radio("English"));
    await screen.findByText("SERVICES AGREEMENT");
    // o resto da interface continua em português (o portal está em português); só o documento muda
    expect(await screen.findByRole("heading", { name: "Deal clauses" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descarregar PDF" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Descarregar PDF" }));
    await waitFor(() => expect(downloadContractDocumentPdf).toHaveBeenCalled());
    const doc = vi.mocked(downloadContractDocumentPdf).mock.calls.at(-1)![0];
    expect(doc.versoes.map((v: { codigo: string }) => v.codigo)).toEqual(["en"]);
    expect(doc.versoes[0].bodyHtml).toContain("SERVICES AGREEMENT");
    expect(doc.versoes[0].bodyHtml).toContain('<section data-doc-obra="contrato" lang="en"');
    expect(doc.versoes[0].bodyHtml).not.toContain('lang="pt"');
  });
});

describe("proposta: os blocos da obra seguem a versão visível", () => {
  const COM_EN = { terms_conditions: "<p>Termos</p>", design_settings: { versions: { en: { terms_conditions: "<p>Terms</p>" } } } };

  it("pt + en: a obra muda com o seletor e o PDF leva a versão escolhida, com a obra no mesmo idioma", async () => {
    modeloDaProposta = COM_EN;
    proposta = { ...proposta, prompt_values: { __idiomas: "pt+en" } };
    const payload = { proposal: proposta, quotes: [{ quote: { id: "q1" }, lines: [], fees: [] }] };
    invoke.mockImplementation(async (_n: string, o: { body?: { action?: string } }) =>
      o?.body?.action === "get_proposal_pdf_data" ? { data: payload, error: null } : { data: null, error: null });
    abrir("/p/p1", "/p/:id", <ClientPortalProposalDetail />);
    expect(await screen.findByRole("heading", { name: /O que vamos fazer/ })).toBeInTheDocument();

    fireEvent.click(radio("English"));
    expect(await screen.findByRole("heading", { name: /What we will do/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /O que vamos fazer/ })).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /Download PDF/ })[0]);
    await waitFor(() => expect(generateProposalPdfBlob).toHaveBeenCalled());
    const [id, , obra, opcoes] = vi.mocked(generateProposalPdfBlob).mock.calls.at(-1)!;
    expect(id).toBe("p1");
    expect(obra).toMatchObject({ idioma: "en" });
    // 23/11: com a vista do negócio, o PDF leva também o número do negócio (PR <ano>/<n.º>) e as variáveis do template
    expect(opcoes).toMatchObject({ idiomas: ["en"], numeroMostrado: expect.stringMatching(/^PR \d{4}\/\d+/) });
    expect(opcoes?.variaveis?.condicoes_pagamento).toBeTruthy();
  });

  it("template com versão inglesa e portal em inglês (um só idioma): documento, obra e PDF em inglês, sem seletor", async () => {
    act(() => definirIdioma("en"));
    modeloDaProposta = COM_EN;
    const payload = { proposal: proposta, quotes: [{ quote: { id: "q1" }, lines: [], fees: [] }] };
    invoke.mockImplementation(async (_n: string, o: { body?: { action?: string } }) =>
      o?.body?.action === "get_proposal_pdf_data" ? { data: payload, error: null } : { data: null, error: null });
    abrir("/p/p1", "/p/:id", <ClientPortalProposalDetail />);
    expect(await screen.findByRole("heading", { name: /What we will do/ })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /Download PDF/ })[0]);
    await waitFor(() => expect(generateProposalPdfBlob).toHaveBeenCalled());
    const [, , obra, opcoes] = vi.mocked(generateProposalPdfBlob).mock.calls.at(-1)!;
    expect(obra).toMatchObject({ idioma: "en" });
    expect(opcoes).toMatchObject({ idiomas: ["en"], numeroMostrado: expect.stringMatching(/^PR \d{4}\/\d+/) });
  });
});
