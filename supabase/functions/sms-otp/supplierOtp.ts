/**
 * Ramo do fornecedor do portal na sms-otp (contrato de fornecedor, Fase 2).
 *
 * TS puro (sem Deno nem rede): recebe uma função `rpc` já autenticada com o
 * JWT de quem chama (cliente anon + Authorization do pedido), por isso as
 * decisões são as da BD, avaliadas como o próprio utilizador:
 *   - sp_get_my_phone()          → fn_sp_actor(): utilizador do portal ativo,
 *                                  conta ativa e com acesso ativo; o telemóvel
 *                                  é supplier_portal_users.phone (E.164).
 *   - sp_supplier_contracts_list → só os contratos enviados do(s) fornecedor(es)
 *                                  a que tem acesso; can_sign = titular da conta
 *                                  do contrato e estado 'sent'.
 *
 * A referência e o propósito são fixos: o OTP só pode ser pedido/verificado
 * para (supplier_contract, supplier_signature) — os que sp_supplier_contract_sign
 * consome. Nada de outro fornecedor ou organização é lido ou devolvido.
 */

export const SUPPLIER_OTP_REFERENCE_TYPE = "supplier_contract";
export const SUPPLIER_OTP_PURPOSE = "supplier_signature";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RpcError {
  message?: string;
  hint?: string;
  code?: string;
}

export type SupplierRpc = (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: RpcError | null }>;

export type SupplierOtpTarget =
  | { ok: true; phoneNumber: string | null; callerName: string | null; contractId: string }
  | { ok: false; status: number; body: { error: string; message: string } };

const fail = (status: number, error: string, message: string): SupplierOtpTarget => ({
  ok: false,
  status,
  body: { error, message },
});

interface PortalContract {
  id?: unknown;
  status?: unknown;
  can_sign?: unknown;
}

export async function resolveSupplierOtpTarget(rpc: SupplierRpc, body: unknown): Promise<SupplierOtpTarget> {
  const b = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  // Sem trim: as ações send_otp/verify_otp usam o reference_id tal como veio.
  const referenceId = typeof b.reference_id === "string" ? b.reference_id : "";

  if (
    !UUID_RE.test(referenceId) ||
    b.reference_type !== SUPPLIER_OTP_REFERENCE_TYPE ||
    b.purpose !== SUPPLIER_OTP_PURPOSE
  ) {
    return fail(
      400,
      "invalid_reference",
      "Pedido inválido: o código SMS do fornecedor só serve para assinar um contrato de fornecedor.",
    );
  }

  // Quem é (fn_sp_actor) e o telemóvel atual do próprio.
  const me = await rpc("sp_get_my_phone");
  if (me.error) {
    if (me.error.hint === "no_supplier_access") {
      return fail(403, "Not a supplier portal user", "Sem acesso ao portal do fornecedor.");
    }
    return fail(500, "supplier_lookup_failed", "Não foi possível validar o acesso. Tente novamente.");
  }
  const phoneRaw = (me.data as { phone?: unknown } | null)?.phone;
  const phoneNumber = typeof phoneRaw === "string" && phoneRaw.length > 0 ? phoneRaw : null;

  // O contrato tem de ser um dos dele, enviado, e ele o titular.
  const list = await rpc("sp_supplier_contracts_list");
  if (list.error) {
    if (list.error.hint === "no_supplier_access") {
      return fail(403, "Not a supplier portal user", "Sem acesso ao portal do fornecedor.");
    }
    return fail(500, "supplier_lookup_failed", "Não foi possível validar o contrato. Tente novamente.");
  }
  const contracts = (list.data as { contracts?: unknown } | null)?.contracts;
  const contract = Array.isArray(contracts)
    ? (contracts as PortalContract[]).find((c) => typeof c?.id === "string" && c.id.toLowerCase() === referenceId.toLowerCase())
    : undefined;

  if (!contract) {
    return fail(404, "contract_not_found", "Contrato não encontrado.");
  }
  if (contract.status !== "sent") {
    return fail(409, "invalid_state", "Este contrato já não pode ser assinado.");
  }
  if (contract.can_sign !== true) {
    return fail(403, "not_owner", "Só o responsável da conta pode assinar o contrato.");
  }

  return { ok: true, phoneNumber, callerName: null, contractId: referenceId };
}
