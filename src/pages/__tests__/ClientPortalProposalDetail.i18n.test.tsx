// Detalhe da proposta no portal do cliente: português como hoje, inglês quando o cliente o escolhe,
// e o motivo de rejeição gravado na base continua a ser o texto português.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, toast, loadPortalData } = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: vi.fn(),
  loadPortalData: vi.fn(),
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
    from: () =>
      chain({
        data: [
          { id: "d1", file_name: "plano.pdf", file_url: "x/plano.pdf", file_type: "pdf", file_size: 2048, created_at: "2026-03-05T10:30:00Z" },
        ],
      }),
    storage: { from: () => ({ download: vi.fn() }) },
  },
}));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/contexts/PortalCompanyContext", () => ({ useSyncActiveOrgWithDocument: () => {} }));
vi.mock("@/components/proposals/proposalPortalData", () => ({ loadProposalPortalData: loadPortalData }));
vi.mock("@/utils/generateProposalPdfBlob", () => ({ generateProposalPdfBlob: vi.fn(), downloadBlob: vi.fn() }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/proposals/ProposalPortalDocument", () => ({
  ProposalPortalDocument: (p: {
    idioma?: string;
    statusLabel: string;
    otpError: string;
    onRejectProposal: () => void;
    onAskQuestion: () => void;
    onSignProposal: () => void;
  }) => (
    <div data-testid="documento" data-idioma={p.idioma ?? ""} data-estado={p.statusLabel} data-otp-erro={p.otpError}>
      <button onClick={p.onRejectProposal}>stub-rejeitar</button>
      <button onClick={p.onAskQuestion}>stub-duvida</button>
      <button onClick={p.onSignProposal}>stub-assinar</button>
    </div>
  ),
}));

import ClientPortalProposalDetail from "../ClientPortalProposalDetail";
import { definirIdioma, reporIdiomaEmMemoria } from "@/portal-i18n/armazemIdioma";

const PROPOSTA = (status: string) => ({
  proposal: { id: "p1", title: "Proposta", proposal_number: "P-1", created_at: "2026-01-01T10:00:00Z", status, organization_id: "o1" },
  template: null,
  quotes: [],
  quoteLines: {},
  quoteFees: {},
  commercial: null,
  company: null,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/propostas/p1"]}>
      <Routes>
        <Route path="/propostas/:id" element={<ClientPortalProposalDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function abrir(botao: string) {
  const b = await screen.findByRole("button", { name: botao });
  await act(async () => { fireEvent.click(b); });
}

describe("ClientPortalProposalDetail: idioma", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    document.elementFromPoint = () => null;
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
  });
  beforeEach(() => {
    window.localStorage.clear();
    reporIdiomaEmMemoria();
    invoke.mockReset();
    invoke.mockResolvedValue({ data: null, error: null });
    toast.mockReset();
    loadPortalData.mockReset();
    loadPortalData.mockResolvedValue(PROPOSTA("sent"));
  });
  afterEach(() => {
    window.localStorage.clear();
    reporIdiomaEmMemoria();
  });

  it("pt: o documento recebe idioma pt e o estado em português; anexos com data dd/mm/aaaa", async () => {
    renderPage();
    const doc = await screen.findByTestId("documento");
    expect(doc.getAttribute("data-idioma")).toBe("pt");
    expect(doc.getAttribute("data-estado")).toBe("A aguardar decisão");
    expect(await screen.findByText("Documentos anexos (1)")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Descarregar/ })).toBeTruthy();
    expect(screen.getByText(/05\/03\/2026/)).toBeTruthy();
  });

  it("en: o documento recebe idioma en e o estado em inglês; anexos em inglês", async () => {
    definirIdioma("en");
    renderPage();
    const doc = await screen.findByTestId("documento");
    expect(doc.getAttribute("data-idioma")).toBe("en");
    expect(doc.getAttribute("data-estado")).toBe("Awaiting your decision");
    expect(await screen.findByText("Attached documents (1)")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download/ })).toBeTruthy();
  });

  it.each([
    ["accepted", "Proposta aceite", "Proposal accepted"],
    ["rejected", "Proposta rejeitada", "Proposal rejected"],
    ["expired", "Proposta expirada", "Proposal expired"],
    ["draft", "A aguardar decisão", "Awaiting your decision"],
  ])("estado %s: pt «%s», en «%s»", async (status, pt, en) => {
    loadPortalData.mockResolvedValue(PROPOSTA(status));
    const { unmount } = renderPage();
    expect((await screen.findByTestId("documento")).getAttribute("data-estado")).toBe(pt);
    unmount();
    act(() => definirIdioma("en"));
    renderPage();
    expect((await screen.findByTestId("documento")).getAttribute("data-estado")).toBe(en);
  });

  it("proposta não encontrada: pt e en", async () => {
    loadPortalData.mockResolvedValue({ proposal: null });
    const { unmount } = renderPage();
    expect(await screen.findByText("Proposta não encontrada.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Voltar/ })).toBeTruthy();
    unmount();
    act(() => definirIdioma("en"));
    renderPage();
    expect(await screen.findByText("Proposal not found.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Back/ })).toBeTruthy();
  });

  it("diálogo de rejeitar em pt: textos de hoje", async () => {
    renderPage();
    await abrir("stub-rejeitar");
    expect(await screen.findByText("Rejeitar Proposta")).toBeTruthy();
    expect(screen.getByText("Indique o motivo da rejeição para nos ajudar a melhorar.")).toBeTruthy();
    expect(screen.getByText("Selecione um motivo")).toBeTruthy();
    expect(screen.getByText("Comentário (opcional)")).toBeTruthy();
    expect(screen.getByPlaceholderText("Adicione um comentário...")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar Rejeição" })).toBeTruthy();
  });

  it("rejeitar em inglês: etiqueta traduzida, mas o reason_code enviado é o texto português", async () => {
    definirIdioma("en");
    renderPage();
    await abrir("stub-rejeitar");
    expect(await screen.findByText("Reject proposal")).toBeTruthy();
    expect(screen.getByText("Select a reason")).toBeTruthy();
    expect(screen.getByPlaceholderText("Add a comment...")).toBeTruthy();

    const gatilho = screen.getByRole("combobox");
    await act(async () => { fireEvent.keyDown(gatilho, { key: "Enter" }); });
    const opcao = await screen.findByRole("option", { name: "Price too high" });
    await act(async () => { fireEvent.click(opcao); });

    await abrir("Confirm rejection");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "client-portal-action",
        expect.objectContaining({
          body: expect.objectContaining({ action: "reject_proposal", reason_code: "Preço alto" }),
        }),
      ),
    );
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Proposal rejected", description: "We are sorry to hear that. Thank you for your feedback." }));
  });

  it("A4: os diálogos de rejeitar e de dúvida têm o X com nome no idioma do portal", async () => {
    const { unmount } = renderPage();
    await abrir("stub-rejeitar");
    expect(await screen.findByRole("button", { name: "Fechar" })).toBeTruthy();
    unmount();
    renderPage();
    await abrir("stub-duvida");
    expect(await screen.findByRole("button", { name: "Fechar" })).toBeTruthy();
    act(() => definirIdioma("en"));
    expect(await screen.findByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fechar" })).toBeNull();
  });

  it("dúvida enviada: toast em pt e em en", async () => {
    renderPage();
    await abrir("stub-duvida");
    fireEvent.change(await screen.findByPlaceholderText("Escreva a sua dúvida ou pedido de esclarecimento..."), { target: { value: "Olá" } });
    await abrir("Enviar Dúvida");
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: "Dúvida enviada!", description: "O comercial será notificado e entrará em contacto." }),
    );
  });

  it("dúvida em inglês: diálogo e toast em inglês", async () => {
    definirIdioma("en");
    renderPage();
    await abrir("stub-duvida");
    expect(await screen.findByText("💬 I have questions")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Write your question or request for clarification..."), { target: { value: "Hi" } });
    await abrir("Send question");
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: "Question sent!",
        description: "Your sales representative will be notified and will get in touch.",
      }),
    );
  });

  it("código SMS: toast de envio em pt", async () => {
    invoke.mockImplementation(async (name: string) =>
      name === "sms-otp" ? { data: { masked_phone: "9*****123" }, error: null } : { data: null, error: null });
    renderPage();
    await abrir("stub-assinar");
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: "Código SMS enviado", description: "Enviámos um código para 9*****123" }),
    );
  });

  it("código SMS em inglês: toast de envio em inglês", async () => {
    definirIdioma("en");
    invoke.mockImplementation(async (name: string) =>
      name === "sms-otp" ? { data: { masked_phone: "9*****123" }, error: null } : { data: null, error: null });
    renderPage();
    await abrir("stub-assinar");
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: "SMS code sent", description: "We sent a code to 9*****123" }),
    );
  });

  it.each([
    ["pt", "Não foi encontrado um número de telefone associado à sua conta. Contacte o comercial."],
    ["en", "No phone number was found linked to your account. Please contact your sales representative."],
  ] as const)("sem telefone (%s): o erro inline segue o idioma", async (idioma, texto) => {
    if (idioma === "en") definirIdioma("en");
    invoke.mockImplementation(async (name: string) =>
      name === "sms-otp" ? { data: { error: "no_phone" }, error: null } : { data: null, error: null });
    renderPage();
    await abrir("stub-assinar");
    await waitFor(() => expect(screen.getByTestId("documento").getAttribute("data-otp-erro")).toBe(texto));
  });

  it("R3: o erro visível acompanha o idioma quando este muda (pt -> en -> pt)", async () => {
    invoke.mockImplementation(async (name: string) =>
      name === "sms-otp" ? { data: { error: "no_phone" }, error: null } : { data: null, error: null });
    renderPage();
    await abrir("stub-assinar");
    const erroPt = "Não foi encontrado um número de telefone associado à sua conta. Contacte o comercial.";
    const erroEn = "No phone number was found linked to your account. Please contact your sales representative.";
    await waitFor(() => expect(screen.getByTestId("documento").getAttribute("data-otp-erro")).toBe(erroPt));
    act(() => definirIdioma("en"));
    await waitFor(() => expect(screen.getByTestId("documento").getAttribute("data-otp-erro")).toBe(erroEn));
    act(() => definirIdioma("pt"));
    await waitFor(() => expect(screen.getByTestId("documento").getAttribute("data-otp-erro")).toBe(erroPt));
  });

  it("R3: uma mensagem do servidor fica como veio, mesmo mudando de idioma", async () => {
    invoke.mockImplementation(async (name: string) =>
      name === "sms-otp" ? { data: { error: "rate", message: "Demasiados pedidos (servidor)" }, error: null } : { data: null, error: null });
    renderPage();
    await abrir("stub-assinar");
    await waitFor(() => expect(screen.getByTestId("documento").getAttribute("data-otp-erro")).toBe("Demasiados pedidos (servidor)"));
    act(() => definirIdioma("en"));
    await waitFor(() => expect(screen.getByTestId("documento").getAttribute("data-idioma")).toBe("en"));
    expect(screen.getByTestId("documento").getAttribute("data-otp-erro")).toBe("Demasiados pedidos (servidor)");
  });
});
