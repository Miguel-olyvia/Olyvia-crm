// Detalhe do contrato no portal do cliente: português como hoje, inglês quando o cliente o escolhe,
// e o motivo de rejeição gravado na base continua a ser o texto português.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, toast, contratoAtual } = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: vi.fn(),
  contratoAtual: { valor: null as Record<string, unknown> | null },
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
    from: (table: string) =>
      table === "client_contracts"
        ? chain({ data: contratoAtual.valor })
        : chain({ data: [{ id: "d1", file_name: "anexo.pdf", file_url: "x/anexo.pdf", document_type: "contract", created_at: "2026-03-05T10:30:00" }] }),
    storage: { from: () => ({ download: vi.fn() }) },
  },
}));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/contexts/PortalCompanyContext", () => ({ useSyncActiveOrgWithDocument: () => {} }));
vi.mock("@/components/contracts/contractDocument", () => ({
  injectSignaturesIntoBlock: (html: string) => html,
  resolveContractDocument: vi.fn(async () => null),
  downloadContractDocumentPdf: vi.fn(),
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import ClientPortalContractDetail from "../ClientPortalContractDetail";
import { definirIdioma, reporIdiomaEmMemoria } from "@/portal-i18n/armazemIdioma";

const CONTRATO = (extra: Record<string, unknown> = {}) => ({
  id: "c1",
  status: "pending_signature",
  organization_id: "o1",
  title: "Contrato",
  contract_number: "C-7",
  total_value: 1234.5,
  start_date: "2026-03-05",
  end_date: "2027-03-04",
  ...extra,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/contratos/c1"]}>
      <Routes>
        <Route path="/contratos/:id" element={<ClientPortalContractDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function clicar(nome: string | RegExp) {
  const b = await screen.findByRole("button", { name: nome });
  await act(async () => { fireEvent.click(b); });
}

describe("ClientPortalContractDetail: idioma", () => {
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
    contratoAtual.valor = CONTRATO();
  });
  afterEach(() => {
    window.localStorage.clear();
    reporIdiomaEmMemoria();
  });

  it("pt: textos, valor e datas como hoje", async () => {
    renderPage();
    expect(await screen.findByText("Contrato aguarda a sua decisão")).toBeTruthy();
    expect(screen.getByText("Reveja o contrato abaixo, aceite ou peça alterações.")).toBeTruthy();
    expect(screen.getByText("Número")).toBeTruthy();
    expect(screen.getByText("Valor")).toBeTruthy();
    expect(screen.getByText("€1.234,50")).toBeTruthy();
    expect(screen.getByText("Início")).toBeTruthy();
    expect(screen.getByText("05/03/2026")).toBeTruthy();
    expect(screen.getByText("04/03/2027")).toBeTruthy();
    expect(screen.getByText("Pronto para avançar?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Aceitar e Assinar/ })).toBeTruthy();
    expect(screen.getByText("Documentos Anexos")).toBeTruthy();
    expect(screen.getByText(/contract • 5 mar 2026/)).toBeTruthy();
  });

  it("en: textos, valor e datas em inglês", async () => {
    definirIdioma("en");
    renderPage();
    expect(await screen.findByText("Contract awaiting your decision")).toBeTruthy();
    expect(screen.getByText("Review the contract below, then accept it or ask for changes.")).toBeTruthy();
    expect(screen.getByText("Number")).toBeTruthy();
    expect(screen.getByText("Value")).toBeTruthy();
    expect(screen.getByText("€1.234,50")).toBeTruthy();
    expect(screen.getByText("Start")).toBeTruthy();
    expect(screen.getByText("End")).toBeTruthy();
    expect(screen.getByText("05/03/2026")).toBeTruthy();
    expect(screen.getByText("Ready to go ahead?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Accept and Sign/ })).toBeTruthy();
    expect(screen.getByText("Attached Documents")).toBeTruthy();
    expect(screen.getByText(/contract • 5 Mar 2026/)).toBeTruthy();
  });

  it("estado pending_signature tem a etiqueta «a aguardar decisão» (contractStatusLabel), nas duas línguas", async () => {
    const { unmount } = renderPage();
    expect(await screen.findByText("📋 A aguardar decisão")).toBeTruthy();
    expect(screen.queryByText(/pending_signature/)).toBeNull();
    unmount();
    act(() => definirIdioma("en"));
    renderPage();
    expect(await screen.findByText("📋 Awaiting your decision")).toBeTruthy();
  });

  it("estado desconhecido mostra-se como vem da base, nas duas línguas", async () => {
    contratoAtual.valor = CONTRATO({ status: "estado_novo" });
    const { unmount } = renderPage();
    expect(await screen.findByText("📋 estado_novo")).toBeTruthy();
    unmount();
    act(() => definirIdioma("en"));
    renderPage();
    expect(await screen.findByText("📋 estado_novo")).toBeTruthy();
  });

  it.each([
    ["draft", "Rascunho", "Draft"],
    ["pending", "A aguardar decisão", "Awaiting your decision"],
    ["active", "Ativo", "Active"],
    ["expired", "Expirado", "Expired"],
  ])("etiqueta do estado %s: pt «%s», en «%s»", async (status, pt, en) => {
    contratoAtual.valor = CONTRATO({ status });
    const { unmount } = renderPage();
    expect(await screen.findByText(`📋 ${pt}`)).toBeTruthy();
    unmount();
    act(() => definirIdioma("en"));
    renderPage();
    expect(await screen.findByText(`📋 ${en}`)).toBeTruthy();
  });

  it("assinado: «Assinado em» por extenso nas duas línguas", async () => {
    contratoAtual.valor = CONTRATO({
      status: "signed",
      signature_date: "2025-03-05T10:30:00",
      signed_by_name: "Ana",
      signature_ip: "1.2.3.4",
    });
    const { unmount } = renderPage();
    expect(await screen.findByText("✅ Contrato assinado")).toBeTruthy();
    expect(screen.getByText("Assinado em 5 de março de 2025 às 10:30")).toBeTruthy();
    expect(screen.getByText(/Assinado por:/)).toBeTruthy();
    expect(screen.getByText("IP: 1.2.3.4 • Verificação por SMS OTP")).toBeTruthy();
    unmount();
    act(() => definirIdioma("en"));
    renderPage();
    expect(await screen.findByText("✅ Contract signed")).toBeTruthy();
    expect(screen.getByText("Signed on 5 March 2025 at 10:30")).toBeTruthy();
    expect(screen.getByText(/Signed by:/)).toBeTruthy();
    expect(screen.getByText("IP: 1.2.3.4 • SMS OTP verification")).toBeTruthy();
  });

  it("anulado: data por extenso nas duas línguas; o motivo escrito por pessoas fica como veio", async () => {
    contratoAtual.valor = CONTRATO({
      status: "cancelled",
      cancellation_reason: "Pedido do cliente",
      cancelled_at: "2025-03-05T10:30:00",
    });
    const { unmount } = renderPage();
    expect(await screen.findByText("🚫 Contrato anulado")).toBeTruthy();
    expect(screen.getByText("Motivo: Pedido do cliente")).toBeTruthy();
    expect(screen.getByText("Anulado em 5 de março de 2025 às 10:30")).toBeTruthy();
    unmount();
    act(() => definirIdioma("en"));
    renderPage();
    expect(await screen.findByText("🚫 Contract cancelled")).toBeTruthy();
    expect(screen.getByText("Reason: Pedido do cliente")).toBeTruthy();
    expect(screen.getByText("Cancelled on 5 March 2025 at 10:30")).toBeTruthy();
  });

  it("contrato não encontrado: pt e en", async () => {
    contratoAtual.valor = null;
    const { unmount } = renderPage();
    expect(await screen.findByText("Contrato não encontrado.")).toBeTruthy();
    unmount();
    act(() => definirIdioma("en"));
    renderPage();
    expect(await screen.findByText("Contract not found.")).toBeTruthy();
  });

  it("rejeitar em inglês: etiqueta traduzida, mas o reason_code enviado é o texto português", async () => {
    definirIdioma("en");
    renderPage();
    await clicar(/Reject/);
    expect(await screen.findByText("Reject Contract")).toBeTruthy();
    expect(screen.getByText("Select a reason")).toBeTruthy();

    await act(async () => { fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" }); });
    await act(async () => { fireEvent.click(await screen.findByRole("option", { name: "Terms not suitable" })); });
    await clicar("Confirm Rejection");

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "client-portal-action",
        expect.objectContaining({
          body: expect.objectContaining({ action: "reject_contract", reason_code: "Condições não adequadas" }),
        }),
      ),
    );
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Contract rejected", description: "Thank you for your feedback." }));
  });

  it("rejeitar em pt: diálogo e toast como hoje", async () => {
    renderPage();
    await clicar(/Rejeitar/);
    expect(await screen.findByText("Rejeitar Contrato")).toBeTruthy();
    expect(screen.getByText("Selecione um motivo")).toBeTruthy();
    await clicar("Confirmar Rejeição");
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Contrato rejeitado", description: "Obrigado pelo seu feedback." }));
  });

  it("código SMS: toast, passo do código e erro inline em inglês", async () => {
    definirIdioma("en");
    invoke.mockImplementation(async (name: string) =>
      name === "sms-otp" ? { data: { masked_phone: "9*****123" }, error: null } : { data: null, error: null });
    renderPage();
    await clicar(/Send SMS code/);
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "SMS code sent", description: "We sent a code to 9*****123" }));
    expect(await screen.findByText(/Code sent to/)).toBeTruthy();
    expect(screen.getByText("Valid for 5 minutes")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Resend code/ })).toBeTruthy();
    expect(screen.getByText("Please wait 1 minute before requesting a new code.")).toBeTruthy();
    expect(screen.queryByText("Aguarde 1 minuto antes de pedir um novo código.")).toBeNull();
    expect(screen.getByRole("button", { name: /Verify/ })).toBeTruthy();
  });

  it("sem telefone: o erro inline segue o idioma", async () => {
    definirIdioma("en");
    invoke.mockImplementation(async (name: string) =>
      name === "sms-otp" ? { data: { error: "no_phone" }, error: null } : { data: null, error: null });
    renderPage();
    await clicar(/Send SMS code/);
    expect(await screen.findByText("No phone number was found linked to your account. Please contact your sales representative.")).toBeTruthy();
  });

  it("erro do PDF: toast em inglês", async () => {
    definirIdioma("en");
    contratoAtual.valor = CONTRATO({ contract_body_html: "<p>Corpo</p>" });
    renderPage();
    await clicar(/Download PDF/);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: "Could not generate the PDF",
        description: "This contract has no content yet.",
        variant: "destructive",
      }),
    );
  });

  it("A4: o diálogo de rejeitar tem o X com nome no idioma do portal", async () => {
    renderPage();
    await clicar(/Rejeitar/);
    expect(await screen.findByRole("button", { name: "Fechar" })).toBeTruthy();
    act(() => definirIdioma("en"));
    expect(await screen.findByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fechar" })).toBeNull();
  });

  it("R3: o erro de telefone em falta acompanha o idioma quando este muda (pt -> en -> pt)", async () => {
    invoke.mockImplementation(async (name: string) =>
      name === "sms-otp" ? { data: { error: "no_phone" }, error: null } : { data: null, error: null });
    renderPage();
    await clicar(/Enviar código SMS/);
    const erroPt = "Não foi encontrado um número de telefone associado à sua conta. Contacte o comercial.";
    const erroEn = "No phone number was found linked to your account. Please contact your sales representative.";
    expect(await screen.findByText(erroPt)).toBeTruthy();
    act(() => definirIdioma("en"));
    expect(await screen.findByText(erroEn)).toBeTruthy();
    expect(screen.queryByText(erroPt)).toBeNull();
    act(() => definirIdioma("pt"));
    expect(await screen.findByText(erroPt)).toBeTruthy();
  });

  it("R3: uma mensagem do servidor fica como veio, mesmo mudando de idioma", async () => {
    invoke.mockImplementation(async (name: string) =>
      name === "sms-otp" ? { data: { error: "rate", message: "Demasiados pedidos (servidor)" }, error: null } : { data: null, error: null });
    renderPage();
    await clicar(/Enviar código SMS/);
    expect(await screen.findByText("Demasiados pedidos (servidor)")).toBeTruthy();
    act(() => definirIdioma("en"));
    expect(await screen.findByRole("button", { name: /Send SMS code/ })).toBeTruthy();
    expect(screen.getByText("Demasiados pedidos (servidor)")).toBeTruthy();
  });
});
