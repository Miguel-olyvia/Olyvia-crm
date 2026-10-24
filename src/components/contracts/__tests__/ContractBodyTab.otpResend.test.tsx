import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: vi.fn() }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: null }) }));
vi.mock("@/hooks/useDocumentSettings", () => ({ useDocumentSettings: () => ({ settings: {} }) }));
vi.mock("@/components/RichTextEditor", () => ({ RichTextEditor: () => null }));
vi.mock("@/components/contracts/GenerateFromTemplateDialog", () => ({ GenerateFromTemplateDialog: () => null }));
vi.mock("@/components/contracts/FillPromptVariablesDialog", () => ({ FillPromptVariablesDialog: () => null }));
vi.mock("@/components/contracts/contractHeader", () => ({ renderContractHeaderHtml: () => "" }));
vi.mock("@/components/contracts/contractDocument", () => ({
  gatherContractData: vi.fn(async () => null),
  applyQuoteItemsToken: (h: string) => h,
  applyFormulaChips: (h: string) => h,
  stripVariableChips: (h: string) => h,
  injectSignaturesIntoBlock: (h: string) => h,
  isContractInForce: () => false,
  UNFREEZE_CONTRACT_COLUMNS: {},
}));

import { ContractBodyTab } from "../ContractBodyTab";

const NOTICE = "Aguarde 1 minuto antes de pedir um novo código.";
const contract = { id: "c1", status: "draft", contract_body_html: "<p>Corpo</p>" };

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContractBodyTab contract={contract} />
    </QueryClientProvider>,
  );
}

const otpInput = () =>
  document.querySelector("input[autocomplete='one-time-code']") as HTMLInputElement | null;
const resendButton = () => screen.getByRole("button", { name: /^Reenviar código/ }) as HTMLButtonElement;
const smsCalls = () => invoke.mock.calls.filter((c) => c[0] === "sms-otp").length;

async function clickSend() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Assinar \(Empresa\)/ })); });
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: /Enviar código SMS/ })); });
}
async function clickResend() {
  await act(async () => { fireEvent.click(resendButton()); });
}

describe("ContractBodyTab - Reenviar recusado não desmonta o passo do código", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    document.elementFromPoint = () => null;
  });
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    invoke.mockReset();
    invoke.mockImplementation(async () => ({ data: { masked_phone: "9*****123" }, error: null }));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["rate_limit", { data: { error: "rate_limit", message: "Demasiados pedidos." }, error: null }],
    ["no_phone", { data: { error: "no_phone", message: "sem telefone" }, error: null }],
    ["rede", { data: null, error: { message: "Failed to fetch" } }],
  ])("Reenviar recusado (%s): o campo fica, o texto mantém-se, sem Enviar, contagem não reposta", async (_n, resposta) => {
    renderTab();
    await clickSend();
    expect(otpInput()).not.toBeNull();
    await act(async () => { fireEvent.change(otpInput()!, { target: { value: "123" } }); });
    expect(otpInput()!.value).toBe("123");

    act(() => { vi.advanceTimersByTime(60000); });
    expect(resendButton().disabled).toBe(false);
    invoke.mockImplementation(async () => resposta);
    await clickResend();

    expect(smsCalls()).toBe(2);
    expect(otpInput()).not.toBeNull();
    expect(otpInput()!.value).toBe("123");
    expect(screen.queryByRole("button", { name: /Enviar código SMS/ })).toBeNull();
    expect(resendButton().disabled).toBe(true);
    expect(resendButton().textContent).toBe("Reenviar código (60s)");
    expect(screen.getByText(NOTICE)).toBeTruthy();

    act(() => { vi.advanceTimersByTime(20000); });
    expect(resendButton().textContent).toBe("Reenviar código (40s)");
  });

  it("Reenviar aceite continua no passo do código e reinicia a contagem", async () => {
    renderTab();
    await clickSend();
    act(() => { vi.advanceTimersByTime(60000); });
    await clickResend();
    expect(smsCalls()).toBe(2);
    expect(otpInput()).not.toBeNull();
    expect(resendButton().textContent).toBe("Reenviar código (60s)");
  });

  it("primeiro envio recusado volta ao Enviar clicável, sem contagem", async () => {
    invoke.mockImplementation(async () => ({ data: { error: "rate_limit", message: "Demasiados pedidos." }, error: null }));
    renderTab();
    await clickSend();
    const send = screen.getByRole("button", { name: /Enviar código SMS/ }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    expect(otpInput()).toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
