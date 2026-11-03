import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Contra-assinatura do contrato de fornecedor: o mesmo fluxo de OTP dos
// contratos de cliente, com reference_type supplier_contract_company e
// purpose company_signature; a gravação é só pela RPC (consome o OTP).

const invoke = vi.fn();
const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { SupplierContractCountersignDialog } from "../SupplierContractCountersignDialog";

describe("SupplierContractCountersignDialog", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    document.elementFromPoint = () => null;
  });
  beforeEach(() => {
    invoke.mockReset();
    rpc.mockReset();
    invoke.mockImplementation(async (_fn: string, opts: { body: { action: string } }) =>
      opts.body.action === "verify_otp"
        ? { data: { success: true, verified: true }, error: null }
        : { data: { masked_phone: "*****6789" }, error: null },
    );
    rpc.mockImplementation(async () => ({
      data: { contract_id: "sc1", status: "signed", company_signed_at: "2026-11-02T10:00:00Z", company_signed_by_name: "Rafael" },
      error: null,
    }));
  });

  it("pede o SMS com a referência do contrato de fornecedor e assina pela RPC", async () => {
    const onSigned = vi.fn();
    render(<SupplierContractCountersignDialog open onOpenChange={() => {}} contractId="sc1" contractLabel="CF-2026-0001 · v1" onSigned={onSigned} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar código SMS/ }));
    });
    expect(invoke).toHaveBeenCalledWith("sms-otp", {
      body: {
        action: "send_otp",
        reference_id: "sc1",
        reference_type: "supplier_contract_company",
        purpose: "company_signature",
        caller_type: "crm",
      },
    });

    const input = document.querySelector("input[autocomplete='one-time-code']") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "123456" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Verificar e assinar/ }));
    });

    await waitFor(() => expect(rpc).toHaveBeenCalledWith("rpc_supplier_contract_countersign", { p_contract_id: "sc1" }));
    expect(invoke).toHaveBeenCalledWith(
      "sms-otp",
      expect.objectContaining({
        body: expect.objectContaining({ action: "verify_otp", reference_type: "supplier_contract_company", code: "123456" }),
      }),
    );
    expect(onSigned).toHaveBeenCalled();
  });

  it("código errado: não chama a RPC", async () => {
    invoke.mockImplementation(async (_fn: string, opts: { body: { action: string } }) =>
      opts.body.action === "verify_otp"
        ? { data: { error: "invalid_code", message: "Código inválido" }, error: null }
        : { data: { masked_phone: "*****6789" }, error: null },
    );
    render(<SupplierContractCountersignDialog open onOpenChange={() => {}} contractId="sc1" contractLabel="CF" onSigned={() => {}} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar código SMS/ }));
    });
    const input = document.querySelector("input[autocomplete='one-time-code']") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "000000" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Verificar e assinar/ }));
    });
    expect(await screen.findByText("Código inválido")).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sem telemóvel: mostra a mensagem e fica no início", async () => {
    invoke.mockImplementation(async () => ({ data: { error: "no_phone", message: "Sem telemóvel no perfil." }, error: null }));
    render(<SupplierContractCountersignDialog open onOpenChange={() => {}} contractId="sc1" contractLabel="CF" onSigned={() => {}} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Enviar código SMS/ }));
    });
    expect(await screen.findByText("Sem telemóvel no perfil.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Enviar código SMS/ })).toBeTruthy();
  });
});
