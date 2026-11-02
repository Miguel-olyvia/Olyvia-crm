import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, rpc: vi.fn() },
}));

import {
  defaultContractId,
  expiringContract,
  invokeSpContractOtp,
  mascararTelemovel,
  normalizarTelemovel,
  pendingContract,
  telemovelParaEditar,
  type SpContractSummary,
} from "../portal";

const c = (over: Partial<SpContractSummary>) => ({ id: "x", status: "signed", expires_soon: false, can_sign: false, ...over }) as SpContractSummary;

describe("telemóvel (igual a fn_sc_normalizar_telemovel)", () => {
  it.each([
    ["912 345 678", "+351912345678"],
    ["+351 912 345 678", "+351912345678"],
    ["00351962345678", "+351962345678"],
    ["+34 600 000 000", "+34600000000"],
    ["(+44) 7700-900-123", "+447700900123"],
  ])("%s → %s", (input, out) => expect(normalizarTelemovel(input)).toBe(out));

  it.each(["", "212345678", "+351212345678", "abc", "+0123456789", "91234567"])("inválido: %s", (v) =>
    expect(normalizarTelemovel(v)).toBeNull(),
  );

  it("mascara como o servidor e pré-preenche o PT com espaços", () => {
    expect(mascararTelemovel("+351912345678")).toBe("+351******678");
    expect(telemovelParaEditar("+351912345678")).toBe("912 345 678");
    expect(telemovelParaEditar("+34600000000")).toBe("+34600000000");
  });
});

describe("estado do contrato no portal", () => {
  const list = {
    contracts: [c({ id: "v3", status: "sent", can_sign: true }), c({ id: "v2", status: "signed", expires_soon: true }), c({ id: "v1", status: "superseded" })],
  };
  it("pendente, a expirar e a versão por omissão", () => {
    expect(pendingContract(list)?.id).toBe("v3");
    expect(expiringContract(list)?.id).toBe("v2");
    expect(defaultContractId(list)).toBe("v3");
    expect(defaultContractId({ contracts: [c({ id: "a", status: "refused" }), c({ id: "b", status: "signed" })] })).toBe("b");
    expect(pendingContract({ contracts: [] })).toBeNull();
    expect(defaultContractId(null)).toBeNull();
  });
});

describe("invokeSpContractOtp", () => {
  beforeEach(() => invoke.mockReset());
  it("usa o ramo do fornecedor da sms-otp", async () => {
    invoke.mockResolvedValue({ data: { success: true, masked_phone: "+351******678" }, error: null });
    const r = await invokeSpContractOtp("send_otp", "sc1");
    expect(invoke).toHaveBeenCalledWith("sms-otp", {
      body: { action: "send_otp", caller_type: "supplier", reference_id: "sc1", reference_type: "supplier_contract", purpose: "supplier_signature" },
    });
    expect(r.masked_phone).toBe("+351******678");
  });
  it("lê o corpo dos estados não-2xx", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { context: { json: async () => ({ error: "not_owner", message: "Só o responsável da conta pode assinar o contrato." }) } },
    });
    const r = await invokeSpContractOtp("verify_otp", "sc1", "123456");
    expect(invoke.mock.calls[0][1].body.code).toBe("123456");
    expect(r.error).toBe("not_owner");
  });
});
