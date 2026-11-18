// Detalhe da proposta no portal: o documento recebe `idiomasDoDocumento`, derivado do idioma do botão do portal
// quando o template tem essa versão (senão português), e o botão de PDF gera nos mesmos idiomas.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, loadPortalData, gerarPdf } = vi.hoisted(() => ({
  invoke: vi.fn(),
  loadPortalData: vi.fn(),
  gerarPdf: vi.fn(),
}));

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve(result);
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    from: () => chain({ data: [] }),
    storage: { from: () => ({ download: vi.fn() }) },
  },
}));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/contexts/PortalCompanyContext", () => ({ useSyncActiveOrgWithDocument: () => {} }));
// Só a leitura dos dados é simulada: a decisão dos idiomas vive noutro módulo (idiomasDaProposta).
vi.mock("@/components/proposals/proposalPortalData", () => ({ loadProposalPortalData: loadPortalData }));
vi.mock("@/utils/generateProposalPdfBlob", () => ({
  generateProposalPdfBlob: (...a: unknown[]) => gerarPdf(...a),
  downloadBlob: vi.fn(),
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/proposals/ProposalPortalDocument", () => ({
  ProposalPortalDocument: (p: { idioma?: string; idiomasDoDocumento?: string[]; onDownloadPdf: () => void }) => (
    <div
      data-testid="documento"
      data-idioma={p.idioma ?? ""}
      data-idiomas={p.idiomasDoDocumento === undefined ? "indefinido" : p.idiomasDoDocumento.join("+")}
    >
      <button onClick={p.onDownloadPdf}>stub-pdf</button>
    </div>
  ),
}));

import ClientPortalProposalDetail from "../ClientPortalProposalDetail";
import { definirIdioma, reporIdiomaEmMemoria } from "@/portal-i18n/armazemIdioma";

const PROPOSTA = (template: unknown, extra: Record<string, unknown> = {}) => ({
  proposal: { id: "p1", title: "Proposta", proposal_number: "P-1", created_at: "2026-01-01T10:00:00Z", status: "sent", organization_id: "o1", ...extra },
  template,
  quotes: [],
  quoteLines: {},
  quoteFees: {},
  commercial: null,
  company: null,
});
const COM_EN = { design_settings: { versions: { en: { terms_conditions: "Terms" } } } };
const SEM_VERSOES = { terms_conditions: "Termos" };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/propostas/p1"]}>
      <Routes>
        <Route path="/propostas/:id" element={<ClientPortalProposalDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}
const idiomas = async () => (await screen.findByTestId("documento")).getAttribute("data-idiomas");

describe("ClientPortalProposalDetail: idiomas do documento", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });
  beforeEach(() => {
    window.localStorage.clear();
    reporIdiomaEmMemoria();
    invoke.mockReset();
    invoke.mockResolvedValue({ data: null, error: null });
    gerarPdf.mockReset();
    gerarPdf.mockResolvedValue({ blob: new Blob(["x"]), fileName: "x.pdf" });
    loadPortalData.mockReset();
  });
  afterEach(() => {
    window.localStorage.clear();
    reporIdiomaEmMemoria();
  });

  it("portal em português: o documento é só em português", async () => {
    loadPortalData.mockResolvedValue(PROPOSTA(COM_EN));
    renderPage();
    expect(await idiomas()).toBe("pt");
  });

  it("portal em inglês e template com versão inglesa: o documento é em inglês", async () => {
    definirIdioma("en");
    loadPortalData.mockResolvedValue(PROPOSTA(COM_EN));
    renderPage();
    expect(await idiomas()).toBe("en");
  });

  it("portal em inglês mas template sem versão inglesa: português (as palavras do ecrã seguem a prop idioma)", async () => {
    definirIdioma("en");
    loadPortalData.mockResolvedValue(PROPOSTA(SEM_VERSOES));
    renderPage();
    expect(await idiomas()).toBe("pt");
    expect((await screen.findByTestId("documento")).getAttribute("data-idioma")).toBe("en");
  });

  it("sem template: português", async () => {
    definirIdioma("en");
    loadPortalData.mockResolvedValue(PROPOSTA(null));
    renderPage();
    expect(await idiomas()).toBe("pt");
  });

  it("a proposta com escolha própria (prompt_values.__idiomas = pt+en) mostra as duas versões", async () => {
    loadPortalData.mockResolvedValue(PROPOSTA(COM_EN, { prompt_values: { __idiomas: "pt+en" } }));
    renderPage();
    expect(await idiomas()).toBe("pt+en");
  });

  it("o botão de PDF gera nos mesmos idiomas do documento", async () => {
    definirIdioma("en");
    loadPortalData.mockResolvedValue(PROPOSTA(COM_EN));
    invoke.mockImplementation(async (nome: string) =>
      nome === "client-portal-action"
        ? { data: { proposal: { id: "p1" }, quotes: [{ quote: { id: "q1" }, lines: [], fees: [] }] }, error: null }
        : { data: null, error: null },
    );
    renderPage();
    const botaoPdf = await screen.findByRole("button", { name: "stub-pdf" });
    await act(async () => { fireEvent.click(botaoPdf); });
    await waitFor(() => expect(gerarPdf).toHaveBeenCalledTimes(1));
    const [id, payload, opcoes] = gerarPdf.mock.calls[0];
    expect(id).toBe("p1");
    expect(payload.quotes.length).toBe(1);
    expect(opcoes).toEqual({ idiomas: ["en"] });
  });

  it("em português o PDF também recebe os idiomas (só pt)", async () => {
    loadPortalData.mockResolvedValue(PROPOSTA(SEM_VERSOES));
    invoke.mockImplementation(async (nome: string) =>
      nome === "client-portal-action"
        ? { data: { proposal: { id: "p1" }, quotes: [{ quote: { id: "q1" }, lines: [], fees: [] }] }, error: null }
        : { data: null, error: null },
    );
    renderPage();
    const botaoPdf = await screen.findByRole("button", { name: "stub-pdf" });
    await act(async () => { fireEvent.click(botaoPdf); });
    await waitFor(() => expect(gerarPdf).toHaveBeenCalledTimes(1));
    expect(gerarPdf.mock.calls[0][2]).toEqual({ idiomas: ["pt"] });
  });
});
