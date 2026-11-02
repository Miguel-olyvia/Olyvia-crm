import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Assinatura no portal: confirmar/indicar o telemóvel (sp_set_my_phone) →
// sms-otp (caller_type supplier) → código → sp_supplier_contract_sign com o
// document_sha256 tal como o servidor o devolveu.

const invoke = vi.fn();
const rpc = vi.fn();
const toast = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("../useSpContracts", () => ({ useSpMyPhone: () => ({ data: undefined }) }));

import { SpContractSignDialog, type SpContractSignTarget } from "../SpContractSignDialog";

const SHA = "a".repeat(64);
const target = (over: Partial<SpContractSignTarget> = {}): SpContractSignTarget => ({
  id: "sc1",
  label: "CF-2026-0001 · v1",
  document_sha256: SHA,
  phone_set: true,
  phone_masked: "+351******678",
  ...over,
});

const okInvoke = async (_fn: string, opts: { body: { action: string } }) =>
  opts.body.action === "verify_otp"
    ? { data: { success: true, verified: true }, error: null }
    : { data: { success: true, masked_phone: "+351******678" }, error: null };

async function typeCodeAndSign() {
  const input = document.querySelector("input[autocomplete='one-time-code']") as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { value: "123456" } });
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Verificar e assinar/ }));
  });
}

async function clickSend() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Enviar código SMS/ }));
  });
}

describe("SpContractSignDialog", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    document.elementFromPoint = () => null;
  });
  beforeEach(() => {
    invoke.mockReset();
    rpc.mockReset();
    toast.mockReset();
    invoke.mockImplementation(okInvoke);
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "sp_set_my_phone") return { data: { ok: true, phone: "+351912345678", phone_masked: "+351******678" }, error: null };
      if (fn === "sp_supplier_contract_sign")
        return {
          data: { contract_id: "sc1", status: "signed_supplier", supplier_signed_at: "2026-11-02T10:00:00Z", signature_sha256: "b".repeat(64) },
          error: null,
        };
      return { data: null, error: { message: `inesperado ${fn}` } };
    });
  });

  it("sem telemóvel: pede-o, grava em E.164, envia o SMS do fornecedor e assina com o SHA-256 do servidor", async () => {
    const onSigned = vi.fn();
    const onPhoneSaved = vi.fn();
    render(
      <SpContractSignDialog
        open
        onOpenChange={() => {}}
        contract={target({ phone_set: false, phone_masked: null })}
        onSigned={onSigned}
        onStale={() => {}}
        onPhoneSaved={onPhoneSaved}
      />,
    );

    const phone = screen.getByLabelText(/O seu telemóvel/);
    // Inválido: não chama o servidor.
    await act(async () => {
      fireEvent.change(phone, { target: { value: "212345678" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Guardar e enviar código/ }));
    });
    expect(screen.getByText(/Indique um telemóvel válido/)).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.change(phone, { target: { value: "912 345 678" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Guardar e enviar código/ }));
    });
    expect(rpc).toHaveBeenCalledWith("sp_set_my_phone", { p_phone: "+351912345678" });
    expect(onPhoneSaved).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("sms-otp", {
      body: {
        action: "send_otp",
        caller_type: "supplier",
        reference_id: "sc1",
        reference_type: "supplier_contract",
        purpose: "supplier_signature",
      },
    });

    await typeCodeAndSign();
    expect(invoke).toHaveBeenCalledWith(
      "sms-otp",
      expect.objectContaining({ body: expect.objectContaining({ action: "verify_otp", caller_type: "supplier", code: "123456" }) }),
    );
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("sp_supplier_contract_sign", { p_contract_id: "sc1", p_document_sha256: SHA }),
    );
    expect(onSigned).toHaveBeenCalled();
    expect(await screen.findByText("Contrato assinado.")).toBeTruthy();
  });

  it("com telemóvel: confirma o número e segue logo para o SMS", async () => {
    render(<SpContractSignDialog open onOpenChange={() => {}} contract={target()} onSigned={() => {}} onStale={() => {}} />);
    expect(screen.getByText("+351******678")).toBeTruthy();
    await clickSend();
    expect(rpc).not.toHaveBeenCalled();
    expect(document.querySelector("input[autocomplete='one-time-code']")).toBeTruthy();
  });

  it("código errado: não assina", async () => {
    invoke.mockImplementation(async (_fn: string, opts: { body: { action: string } }) =>
      opts.body.action === "verify_otp"
        ? { data: null, error: { context: { json: async () => ({ error: "invalid_code", message: "Código inválido" }) } } }
        : { data: { success: true, masked_phone: "+351******678" }, error: null },
    );
    render(<SpContractSignDialog open onOpenChange={() => {}} contract={target()} onSigned={() => {}} onStale={() => {}} />);
    await clickSend();
    await typeCodeAndSign();
    expect(await screen.findByText("Código inválido")).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("otp_required: volta ao início para pedir outro código", async () => {
    rpc.mockImplementation(async () => ({
      data: null,
      error: { message: "Código SMS não verificado, expirado ou já utilizado. Peça um novo código.", hint: "otp_required", code: "42501" },
    }));
    const onSigned = vi.fn();
    render(<SpContractSignDialog open onOpenChange={() => {}} contract={target()} onSigned={onSigned} onStale={() => {}} />);
    await clickSend();
    await typeCodeAndSign();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Enviar código SMS/ })).toBeTruthy();
    expect(onSigned).not.toHaveBeenCalled();
  });

  it("document_changed: fecha e manda recarregar o contrato", async () => {
    rpc.mockImplementation(async () => ({
      data: null,
      error: { message: "O documento mudou desde que o abriu: recarregue a página", hint: "document_changed", code: "23514" },
    }));
    const onStale = vi.fn();
    const onOpenChange = vi.fn();
    render(<SpContractSignDialog open onOpenChange={onOpenChange} contract={target()} onSigned={() => {}} onStale={onStale} />);
    await clickSend();
    await typeCodeAndSign();
    await waitFor(() => expect(onStale).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("no_phone na sms-otp: pede o telemóvel", async () => {
    invoke.mockImplementation(async () => ({ data: { error: "no_phone", message: "Sem telemóvel." }, error: null }));
    render(<SpContractSignDialog open onOpenChange={() => {}} contract={target()} onSigned={() => {}} onStale={() => {}} />);
    await clickSend();
    expect(screen.getByText("Sem telemóvel.")).toBeTruthy();
    expect(screen.getByLabelText(/O seu telemóvel/)).toBeTruthy();
  });
});
