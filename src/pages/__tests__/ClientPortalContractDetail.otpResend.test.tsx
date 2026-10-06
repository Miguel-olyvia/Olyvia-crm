import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

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
        ? chain({ data: { id: "c1", status: "pending_signature", organization_id: "o1", title: "Contrato" } })
        : chain({ data: [] }),
  },
}));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/contexts/PortalCompanyContext", () => ({ useSyncActiveOrgWithDocument: () => {} }));
vi.mock("@/components/contracts/contractDocument", () => ({
  injectSignaturesIntoBlock: (html: string) => html,
  resolveContractDocument: vi.fn(),
  downloadContractDocumentPdf: vi.fn(),
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import ClientPortalContractDetail from "../ClientPortalContractDetail";

const NOTICE = "Aguarde 1 minuto antes de pedir um novo código.";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/contratos/c1"]}>
      <Routes>
        <Route path="/contratos/:id" element={<ClientPortalContractDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const otpInput = () =>
  document.querySelector("input[autocomplete='one-time-code']") as HTMLInputElement | null;
const resendButton = () => screen.getByRole("button", { name: /^Reenviar código/ }) as HTMLButtonElement;

async function clickSend() {
  const btn = await screen.findByRole("button", { name: /Enviar código SMS/ });
  await act(async () => { fireEvent.click(btn); });
}
async function clickResend() {
  await act(async () => { fireEvent.click(resendButton()); });
}

describe("ClientPortalContractDetail - Reenviar recusado não desmonta o passo do código", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    document.elementFromPoint = () => null;
  });
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    invoke.mockReset();
    invoke.mockImplementation(async (name: string) =>
      name === "sms-otp" ? { data: { masked_phone: "9*****123" }, error: null } : { data: null, error: null });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const smsCalls = () => invoke.mock.calls.filter((c) => c[0] === "sms-otp").length;

  it.each([
    ["rate_limit", { data: { error: "rate_limit", message: "Demasiados pedidos." }, error: null }],
    ["no_phone", { data: { error: "no_phone", message: "sem telefone" }, error: null }],
    ["rede", { data: null, error: { message: "Failed to fetch" } }],
  ])("Reenviar recusado (%s): o campo fica, o texto mantém-se, sem Enviar, contagem não reposta", async (_n, resposta) => {
    renderPage();
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
    renderPage();
    await clickSend();
    act(() => { vi.advanceTimersByTime(60000); });
    await clickResend();
    expect(smsCalls()).toBe(2);
    expect(otpInput()).not.toBeNull();
    expect(resendButton().textContent).toBe("Reenviar código (60s)");
  });

  it("primeiro envio recusado volta ao Enviar clicável, sem contagem", async () => {
    invoke.mockImplementation(async () => ({ data: { error: "rate_limit", message: "Demasiados pedidos." }, error: null }));
    renderPage();
    await clickSend();
    const send = screen.getByRole("button", { name: /Enviar código SMS/ }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    expect(otpInput()).toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
