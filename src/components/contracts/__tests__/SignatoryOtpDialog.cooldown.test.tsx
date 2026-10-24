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

async function clickResend() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Reenviar código/ }));
  });
}

const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("SignatoryOtpDialog - pausa só no Reenviar código", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { masked_phone: "9*****123" }, error: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("o botão Enviar não tem contagem nem aviso antes do primeiro envio", () => {
    renderDialog();
    expect(button("Enviar Código SMS").disabled).toBe(false);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("um duplo clique rápido no Enviar envia um só SMS", async () => {
    renderDialog();
    const send = screen.getByRole("button", { name: /Enviar Código SMS/ });
    await act(async () => {
      fireEvent.click(send);
      fireEvent.click(send);
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("um primeiro envio aceite deixa o Reenviar bloqueado com 60 segundos e o aviso junto a ele", async () => {
    renderDialog();
    await clickSend();
    expect(button("Reenviar código (60s)").disabled).toBe(true);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();

    act(() => { vi.advanceTimersByTime(15000); });
    expect(button("Reenviar código (45s)").disabled).toBe(true);
  });

  it("a contagem chega a 0 e o Reenviar volta a ficar activo", async () => {
    renderDialog();
    await clickSend();
    act(() => { vi.advanceTimersByTime(60000); });
    expect(button("Reenviar código").disabled).toBe(false);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("cada Reenviar bloqueia outros 60 segundos", async () => {
    renderDialog();
    await clickSend();
    act(() => { vi.advanceTimersByTime(60000); });
    await clickResend();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(button("Reenviar código (60s)").disabled).toBe(true);

    act(() => { vi.advanceTimersByTime(60000); });
    await clickResend();
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(button("Reenviar código (60s)").disabled).toBe(true);
  });

  it("se o servidor recusar um Reenviar, a contagem não é reposta", async () => {
    renderDialog();
    await clickSend();
    act(() => { vi.advanceTimersByTime(60000); });
    invoke.mockResolvedValue({ data: { error: "rate_limit", message: "Demasiados pedidos." }, error: null });
    await clickResend();
    expect(button("Reenviar código (60s)").disabled).toBe(true);
    act(() => { vi.advanceTimersByTime(20000); });
    expect(button("Reenviar código (40s)").disabled).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("o campo do código recebe o foco e Verificar não fica bloqueado pela contagem", async () => {
    renderDialog();
    await clickSend();
    const field = screen.getByPlaceholderText("000000") as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect(field.disabled).toBe(false);
    await act(async () => { fireEvent.change(field, { target: { value: "123456" } }); });
    expect(button("Verificar").disabled).toBe(false);
  });

  it.each([
    ["rate_limit", { data: { error: "rate_limit", message: "Demasiados pedidos." }, error: null }],
    ["no_phone", { data: { error: "no_phone", message: "sem telefone" }, error: null }],
  ])("um primeiro envio recusado (%s) não bloqueia nada e deixa o Enviar clicável", async (_nome, resposta) => {
    invoke.mockResolvedValue(resposta);
    renderDialog();
    await clickSend();
    expect(button("Enviar Código SMS").disabled).toBe(false);
    expect(screen.queryByText(NOTICE)).toBeNull();
    await clickSend();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("um erro de rede no primeiro envio não bloqueia nada e liberta o Enviar", async () => {
    invoke.mockRejectedValue(new Error("Failed to fetch"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderDialog();
    await clickSend();
    expect(button("Enviar Código SMS").disabled).toBe(false);
    expect(screen.queryByText(NOTICE)).toBeNull();
    await clickSend();
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
