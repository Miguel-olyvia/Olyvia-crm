// Detalhe da proposta no portal: o documento recebe `idiomasDoDocumento`, derivado do idioma do botão do portal
// quando o template tem essa versão (senão português), e o botão de PDF gera nos mesmos idiomas.
// RH: o gerador recebe a obra em 3.º lugar, por isso as opções de idioma são o 4.º argumento.
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
  ProposalPortalDocument: (p: {
    idioma?: string;
    idiomasDoDocumento?: string[];
    modoVersoes?: string;
    idiomaEscolhido?: string | null;
    onIdiomaEscolhidoChange?: (c: string) => void;
    onDownloadPdf: () => void;
  }) => (
    <div
      data-testid="documento"
      data-idioma={p.idioma ?? ""}
      data-idiomas={p.idiomasDoDocumento === undefined ? "indefinido" : p.idiomasDoDocumento.join("+")}
      data-modo={p.modoVersoes ?? ""}
      data-escolhido={p.idiomaEscolhido ?? ""}
    >
      <button onClick={p.onDownloadPdf}>stub-pdf</button>
      <button onClick={() => p.onIdiomaEscolhidoChange?.("en")}>stub-escolher-en</button>
      <button onClick={() => p.onIdiomaEscolhidoChange?.("pt")}>stub-escolher-pt</button>
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

  // RH: um template sem versões de idioma fica exatamente como hoje: o documento não recebe idiomas (as palavras
  // seguem a prop idioma, a do portal) e o PDF continua em português.
  it("portal em inglês mas template sem versão inglesa: como hoje (sem idiomas; as palavras do ecrã seguem a prop idioma)", async () => {
    definirIdioma("en");
    loadPortalData.mockResolvedValue(PROPOSTA(SEM_VERSOES));
    renderPage();
    expect(await idiomas()).toBe("indefinido");
    expect((await screen.findByTestId("documento")).getAttribute("data-idioma")).toBe("en");
  });

  it("sem template: como hoje (sem idiomas)", async () => {
    definirIdioma("en");
    loadPortalData.mockResolvedValue(PROPOSTA(null));
    renderPage();
    expect(await idiomas()).toBe("indefinido");
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
    const [id, payload, , opcoes] = gerarPdf.mock.calls[0];
    expect(id).toBe("p1");
    expect(payload.quotes.length).toBe(1);
    expect(opcoes).toEqual({ idiomas: ["en"] });
  });

  describe("proposta com mais de um idioma: seletor, uma versão de cada vez", () => {
    const PT_EN = () => PROPOSTA(COM_EN, { prompt_values: { __idiomas: "pt+en" } });
    const comPdf = () =>
      invoke.mockImplementation(async (nome: string) =>
        nome === "client-portal-action"
          ? { data: { proposal: { id: "p1" }, quotes: [{ quote: { id: "q1" }, lines: [], fees: [] }] }, error: null }
          : { data: null, error: null },
      );
    const descarregar = async () => {
      const botao = await screen.findByRole("button", { name: "stub-pdf" });
      await act(async () => { fireEvent.click(botao); });
      await waitFor(() => expect(gerarPdf).toHaveBeenCalled());
      return gerarPdf.mock.calls[gerarPdf.mock.calls.length - 1][3];
    };

    it("o documento é pedido em modo seletor, com os dois idiomas disponíveis", async () => {
      loadPortalData.mockResolvedValue(PT_EN());
      renderPage();
      const doc = await screen.findByTestId("documento");
      expect(doc.getAttribute("data-modo")).toBe("seletor");
      expect(doc.getAttribute("data-idiomas")).toBe("pt+en");
    });

    it("o PDF leva só a versão escolhida: por omissão a da interface (português)", async () => {
      loadPortalData.mockResolvedValue(PT_EN());
      comPdf();
      renderPage();
      expect(await descarregar()).toEqual({ idiomas: ["pt"] });
    });

    it("o PDF leva só a versão escolhida: a da interface quando é inglês", async () => {
      definirIdioma("en");
      loadPortalData.mockResolvedValue(PT_EN());
      comPdf();
      renderPage();
      expect(await descarregar()).toEqual({ idiomas: ["en"] });
    });

    it("depois de o cliente escolher inglês no seletor, o PDF é só em inglês; trocar de volta, só em português", async () => {
      loadPortalData.mockResolvedValue(PT_EN());
      comPdf();
      renderPage();
      const escolherEn = await screen.findByRole("button", { name: "stub-escolher-en" });
      await act(async () => { fireEvent.click(escolherEn); });
      expect((await screen.findByTestId("documento")).getAttribute("data-escolhido")).toBe("en");
      expect(await descarregar()).toEqual({ idiomas: ["en"] });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "stub-escolher-pt" })); });
      gerarPdf.mockClear();
      expect(await descarregar()).toEqual({ idiomas: ["pt"] });
    });

    it("com um só idioma não há escolha: o PDF segue o idioma único e o modo seletor não muda nada", async () => {
      definirIdioma("en");
      loadPortalData.mockResolvedValue(PROPOSTA(COM_EN));
      comPdf();
      renderPage();
      expect((await screen.findByTestId("documento")).getAttribute("data-idiomas")).toBe("en");
      expect(await descarregar()).toEqual({ idiomas: ["en"] });
    });
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
    expect(gerarPdf.mock.calls[0][3]).toEqual({ idiomas: ["pt"] });
  });
});
