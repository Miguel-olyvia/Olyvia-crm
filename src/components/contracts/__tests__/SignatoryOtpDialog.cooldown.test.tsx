import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { SignatoryOtpDialog } from "../SignatoryOtpDialog";

const signatory = { userId: "u1", userName: "Ana", roleName: "Gerente" } as never;
const NOTICE = "Aguarde 1 minuto antes de pedir um novo código.";

function renderDialog() {
  return render(
    <SignatoryOtpDialog open onOpenChange={() => {}} signatory={signatory} templateId="tpl-1" onVerified={() => {}} />,
  );
}

async function clickSend() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Enviar Código SMS/ }));
  });
}

describe("SignatoryOtpDialog - pausa entre envios de SMS", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { masked_phone: "9*****123" }, error: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("um duplo clique rápido envia um só SMS", async () => {
    renderDialog();
    const button = screen.getByRole("button", { name: /Enviar Código SMS/ });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("depois de enviar, Reenviar fica desactivado com os segundos e o aviso é neutro", async () => {
    renderDialog();
    expect(screen.queryByText(NOTICE)).toBeNull();
    await clickSend();
    const resend = screen.getByRole("button", { name: "Reenviar código (60s)" }) as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();

    act(() => { vi.advanceTimersByTime(15000); });
    expect(screen.getByRole("button", { name: "Reenviar código (45s)" })).toBeTruthy();

    act(() => { vi.advanceTimersByTime(45000); });
    const ready = screen.getByRole("button", { name: "Reenviar código" }) as HTMLButtonElement;
    expect(ready.disabled).toBe(false);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("no passo do código, o campo do código recebe o foco", async () => {
    renderDialog();
    await clickSend();
    expect(document.activeElement).toBe(screen.getByPlaceholderText("000000"));
  });

  it("se o servidor recusar com rate_limit, a contagem não é reposta", async () => {
    invoke.mockResolvedValue({
      data: { error: "rate_limit", message: "Demasiados pedidos. Aguarde alguns minutos antes de tentar novamente." },
      error: null,
    });
    renderDialog();
    await clickSend();
    expect((screen.getByRole("button", { name: "Enviar Código SMS (60s)" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => { vi.advanceTimersByTime(20000); });
    expect(screen.getByRole("button", { name: "Enviar Código SMS (40s)" })).toBeTruthy();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("se o signatário não tem telefone (no_phone), a contagem continua e não é reposta", async () => {
    invoke.mockResolvedValue({ data: { error: "no_phone", message: "sem telefone" }, error: null });
    renderDialog();
    await clickSend();
    act(() => { vi.advanceTimersByTime(10000); });
    const button = screen.getByRole("button", { name: "Enviar Código SMS (50s)" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("num erro de rede, a contagem continua activa e não é reposta", async () => {
    invoke.mockRejectedValue(new Error("Failed to fetch"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderDialog();
    await clickSend();
    act(() => { vi.advanceTimersByTime(5000); });
    expect((screen.getByRole("button", { name: "Enviar Código SMS (55s)" }) as HTMLButtonElement).disabled).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
