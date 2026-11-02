import { describe, expect, it, vi } from "vitest";
import { resolveSupplierOtpTarget, type SupplierRpc } from "./supplierOtp";

const CID = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const okBody = { reference_id: CID, reference_type: "supplier_contract", purpose: "supplier_signature" };

function rpcWith(map: Record<string, { data?: unknown; error?: { hint?: string; message?: string } | null }>) {
  const fn = vi.fn((name: string) => Promise.resolve({ data: map[name]?.data ?? null, error: map[name]?.error ?? null }));
  return fn as unknown as SupplierRpc & typeof fn;
}

const list = (contracts: unknown[]) => ({ data: { is_owner: true, contracts } });

describe("resolveSupplierOtpTarget", () => {
  it("titular com contrato enviado: devolve o telemóvel do próprio", async () => {
    const rpc = rpcWith({
      sp_get_my_phone: { data: { phone: "+351912345678" } },
      sp_supplier_contracts_list: list([{ id: CID, status: "sent", can_sign: true }]),
    });
    const r = await resolveSupplierOtpTarget(rpc, okBody);
    expect(r).toEqual({ ok: true, phoneNumber: "+351912345678", callerName: null, contractId: CID });
  });

  it("sem telemóvel: ok com phoneNumber null (o send_otp responde no_phone)", async () => {
    const rpc = rpcWith({
      sp_get_my_phone: { data: { phone: null } },
      sp_supplier_contracts_list: list([{ id: CID, status: "sent", can_sign: true }]),
    });
    const r = await resolveSupplierOtpTarget(rpc, okBody);
    expect(r.ok && r.phoneNumber).toBe(null);
  });

  it.each([
    [{ ...okBody, reference_type: "contract" }],
    [{ ...okBody, reference_type: "supplier_contract_company" }],
    [{ ...okBody, purpose: "contract_signature" }],
    [{ ...okBody, purpose: undefined }],
    [{ ...okBody, reference_id: "nao-e-uuid" }],
    [{ ...okBody, reference_id: ` ${CID}` }],
    [null],
    ["texto"],
  ])("referência/propósito fora do fixo é recusado sem chamar a BD: %j", async (body) => {
    const rpc = rpcWith({});
    const r = await resolveSupplierOtpTarget(rpc, body);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("invalid_reference");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("quem não é do portal do fornecedor: 403", async () => {
    const rpc = rpcWith({ sp_get_my_phone: { error: { hint: "no_supplier_access", message: "x" } } });
    const r = await resolveSupplierOtpTarget(rpc, okBody);
    expect(r.ok).toBe(false);
    if (!r.ok) expect([r.status, r.body.error]).toEqual([403, "Not a supplier portal user"]);
  });

  it("erro inesperado da BD não passa o texto: 500 genérico", async () => {
    const rpc = rpcWith({ sp_get_my_phone: { error: { message: "relation x does not exist" } } });
    const r = await resolveSupplierOtpTarget(rpc, okBody);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(500);
      expect(r.body.message).not.toContain("relation");
    }
  });

  it("contrato de outro fornecedor (não está na lista dele): 404", async () => {
    const rpc = rpcWith({
      sp_get_my_phone: { data: { phone: "+351912345678" } },
      sp_supplier_contracts_list: list([{ id: OTHER, status: "sent", can_sign: true }]),
    });
    const r = await resolveSupplierOtpTarget(rpc, okBody);
    expect(r.ok).toBe(false);
    if (!r.ok) expect([r.status, r.body.error]).toEqual([404, "contract_not_found"]);
  });

  it("contrato já assinado: 409", async () => {
    const rpc = rpcWith({
      sp_get_my_phone: { data: { phone: "+351912345678" } },
      sp_supplier_contracts_list: list([{ id: CID, status: "signed_supplier", can_sign: false }]),
    });
    const r = await resolveSupplierOtpTarget(rpc, okBody);
    expect(r.ok).toBe(false);
    if (!r.ok) expect([r.status, r.body.error]).toEqual([409, "invalid_state"]);
  });

  it("membro (não titular): 403 not_owner", async () => {
    const rpc = rpcWith({
      sp_get_my_phone: { data: { phone: "+351912345678" } },
      sp_supplier_contracts_list: list([{ id: CID, status: "sent", can_sign: false }]),
    });
    const r = await resolveSupplierOtpTarget(rpc, okBody);
    expect(r.ok).toBe(false);
    if (!r.ok) expect([r.status, r.body.error]).toEqual([403, "not_owner"]);
  });
});
