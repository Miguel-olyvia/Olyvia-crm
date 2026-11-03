// Contrato de Fornecedor — Portal do Fornecedor (Fase 4). RPCs sp_* (via
// fn_sp_actor) da migration 20270103300000_contrato_fornecedor_base.sql e o
// código SMS da Edge sms-otp (caller_type "supplier", Fase 2).
//
// Os tipos do contrato vêm de ./tipos (Fase 3); aqui só o que o portal
// acrescenta (can_sign/can_refuse/can_attach, telemóvel) e o que lhe falta
// (fn_sc_contrato_json(c,'portal',...) não traz os campos internos do CRM).
// As RPCs ainda não estão em types.ts (não regenerado): cast local.
// Propostas do fornecedor (sp_supplier_contract_propose / _withdraw):
// migration 20270104100000_contrato_fornecedor_propostas_portal.sql.
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { SupplierPortalRpcError, getSpHint, spErrorMessage } from "@/lib/supplierPortal/spRpc";
import type {
  SupplierContractConditions,
  SupplierContractDetail,
  SupplierContractKind,
  SupplierContractOrigin,
  SupplierContractStatus,
  SupplierContractSummary,
} from "./tipos";

// ── Tipos ───────────────────────────────────────────────────────────────────

/** Campos que só o CRM recebe: no portal não existem. */
type CrmOnly =
  | "template_id"
  | "supplier_signed_by_email"
  | "supplier_signed_ip"
  | "supplier_signed_user_agent"
  | "supplier_signed_document_sha256"
  | "company_signature_mode"
  | "company_signed_ip"
  | "cancel_reason"
  | "created_by_portal_user_id"
  | "proposed_by_email";

/** Ações do utilizador do portal (fn_sc_portal_flags): só o titular da conta fixada no contrato. */
export interface SpContractFlags {
  /** 'sent'. */
  can_sign: boolean;
  can_refuse: boolean;
  /** 'sent' ou proposta dele ('proposed'): anexos. */
  can_attach: boolean;
  /** Proposta dele com origem pdf_fornecedor e ainda sem PDF: upload kind contrato_fornecedor (uma vez). */
  can_attach_main: boolean;
  /** Proposta dele ('proposed'). */
  can_withdraw: boolean;
}

/**
 * Uma linha de sp_supplier_contracts_list().contracts. Um 'draft' só aparece se for uma proposta dele aceite
 * ("Aceite — em preparação"): os campos são os da PROPOSTA, não o rascunho que a empresa está a editar.
 */
export type SpContractSummary = Omit<SupplierContractSummary, CrmOnly> & SpContractFlags;

/** Onde o fornecedor pode propor um contrato (uma ligação ativa da conta dele). */
export interface SpProposalTarget {
  organization_id: string;
  organization_name: string | null;
  supplier_id: string;
  supplier_name: string | null;
  /** Já há um contrato em curso (proposed/draft/sent/signed_supplier) com esta empresa. */
  has_open_contract: boolean;
  /** Titular e sem contrato em curso. */
  can_propose: boolean;
}

/** sp_supplier_contracts_list(). */
export interface SpContractsList {
  is_owner: boolean;
  phone_set: boolean;
  phone_masked: string | null;
  contracts: SpContractSummary[];
  proposal_targets: SpProposalTarget[];
}

/** sp_supplier_contract_get(p_contract_id). Num 'draft' (proposta aceite): files só os dele, document_html null. */
export type SpContractDetail = Omit<
  SupplierContractDetail,
  CrmOnly | "body_html" | "can_manage" | "can_countersign" | "can_accept_proposal" | "can_refuse_proposal"
> &
  SpContractFlags & {
    is_owner: boolean;
    phone_set: boolean;
    phone_masked: string | null;
  };

/**
 * p_data de sp_supplier_contract_propose. origin obrigatório; kind 'material' por omissão; title por omissão
 * "Condições comerciais — <fornecedor>". conditions: as chaves de fn_sc_aplicar_condicoes (outras dão erro), com
 * payment_terms_days e payment_method obrigatórios e shipping_free_from se shipping_terms = gratis_acima_minimo.
 * Datas AAAA-MM-DD; valid_until não pode já ter passado. O PDF (origem pdf_fornecedor) e os anexos carregam-se a
 * seguir pela Edge supplier-contract-action (upload, kind contrato_fornecedor | anexo).
 */
export interface SpProposeData {
  origin: SupplierContractOrigin;
  kind?: SupplierContractKind;
  title?: string;
  valid_from?: string | null;
  valid_until?: string | null;
  conditions: Partial<SupplierContractConditions>;
}

export interface SpMyPhone {
  phone: string | null;
  phone_masked: string | null;
  phone_updated_at: string | null;
}

// ── RPCs ────────────────────────────────────────────────────────────────────

type RpcResponse = {
  data: Json | null;
  error: { message: string; code?: string; hint?: string; details?: string } | null;
};

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const rpc = supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResponse>;
  const { data, error } = await rpc.call(supabase, fn, args ?? {});
  if (error) throw new SupplierPortalRpcError(error);
  return data as unknown as T;
}

export const spContractsRpc = {
  list: () => call<SpContractsList>("sp_supplier_contracts_list"),
  get: (contractId: string) => call<SpContractDetail>("sp_supplier_contract_get", { p_contract_id: contractId }),
  /**
   * Propor um contrato (só o titular). supplierId só é preciso se a conta estiver ligada a mais de um fornecedor na
   * empresa (hint supplier_required). Erros: not_owner, not_found, open_contract_exists, validation.
   */
  propose: (organizationId: string, supplierId: string | null, data: SpProposeData) =>
    call<SpContractDetail>("sp_supplier_contract_propose", {
      p_organization_id: organizationId,
      p_supplier_id: supplierId,
      p_data: data,
    }),
  /** Retirar a proposta (só 'proposed', só o titular) → 'cancelled' (proposal_state 'withdrawn'). */
  withdraw: (contractId: string) =>
    call<{ contract_id: string; status: SupplierContractStatus; cancelled_at: string }>("sp_supplier_contract_withdraw", {
      p_contract_id: contractId,
    }),
  refuse: (contractId: string, reason: string) =>
    call<{ contract_id: string; status: SupplierContractStatus; refused_at: string }>("sp_supplier_contract_refuse", {
      p_contract_id: contractId,
      p_reason: reason,
    }),
  /** O SHA-256 tem de ser o que o servidor devolveu em sp_supplier_contract_get (document_sha256). */
  sign: (contractId: string, documentSha256: string) =>
    call<{ contract_id: string; status: SupplierContractStatus; supplier_signed_at: string; signature_sha256: string }>(
      "sp_supplier_contract_sign",
      { p_contract_id: contractId, p_document_sha256: documentSha256 },
    ),
  getMyPhone: () => call<SpMyPhone>("sp_get_my_phone"),
  setMyPhone: (phone: string) =>
    call<{ ok: boolean; phone: string; phone_masked: string }>("sp_set_my_phone", { p_phone: phone }),
};

/** Prefixo das queries do contrato no portal (invalidar depois de assinar/recusar/anexar). */
export const SP_CONTRACTS_QUERY_KEY = "supplier-portal-contracts";

export const spContractKeys = {
  list: (accountId: string | null, userId: string | null) => [SP_CONTRACTS_QUERY_KEY, "list", accountId, userId] as const,
  detail: (contractId: string | null, userId: string | null) => [SP_CONTRACTS_QUERY_KEY, "detail", contractId, userId] as const,
  phone: (userId: string | null) => [SP_CONTRACTS_QUERY_KEY, "phone", userId] as const,
};

/** Mensagens do servidor já vêm em PT; só se ajusta o que spErrorMessage diria sobre o catálogo. */
export function describeSpContractError(err: unknown): string {
  const hint = getSpHint(err);
  const raw = err instanceof Error ? err.message : "";
  switch (hint) {
    case "not_owner":
      return raw || "Só o responsável da conta pode fazer esta ação.";
    case "not_found":
      return "Contrato não encontrado ou já não disponível.";
    case "document_changed":
      return "O documento mudou desde que o abriu. Recarregue o contrato e reveja-o antes de assinar.";
    case "otp_required":
      return raw || "Código SMS não verificado, expirado ou já utilizado. Peça um novo código.";
    case "open_contract_exists":
    case "supplier_required":
    case "invalid_state":
    case "expired":
    case "no_phone":
    case "validation":
      return raw || spErrorMessage(err);
    default:
      return spErrorMessage(err);
  }
}

// ── Estado do contrato no portal ────────────────────────────────────────────

/** Rótulos do ponto de vista do fornecedor (os de ./tipos são do CRM). */
export const SP_STATUS_LABEL: Record<SupplierContractStatus, string> = {
  proposed: "Proposta enviada · a aguardar resposta",
  // O portal só vê um rascunho se for uma proposta dele que a empresa aceitou.
  draft: "Aceite — em preparação",
  sent: "Por assinar",
  signed_supplier: "Assinado por si · falta a empresa",
  signed: "Assinado",
  refused: "Recusado",
  cancelled: "Cancelado pela empresa",
  expired: "Expirado",
  superseded: "Substituído por nova versão",
};

/** Rótulo no portal, afinado pelas propostas (retirada / recusada pela empresa). */
export function spStatusLabel(c: Pick<SpContractSummary, "status" | "proposal_state" | "refused_by">): string {
  if (c.proposal_state === "withdrawn") return "Proposta retirada";
  if (c.status === "refused" && c.refused_by === "empresa") return "Proposta recusada pela empresa";
  return SP_STATUS_LABEL[c.status];
}

/** A proposta dele à espera de resposta da empresa. */
export function pendingProposal(list: Pick<SpContractsList, "contracts"> | null | undefined): SpContractSummary | null {
  return list?.contracts.find((c) => c.status === "proposed") ?? null;
}

/** O contrato enviado por assinar (no máximo um em curso por fornecedor; o mais recente primeiro). */
export function pendingContract(list: Pick<SpContractsList, "contracts"> | null | undefined): SpContractSummary | null {
  return list?.contracts.find((c) => c.status === "sent") ?? null;
}

/** Contrato assinado que expira em <= 30 dias (expires_soon calculado no servidor). */
export function expiringContract(list: Pick<SpContractsList, "contracts"> | null | undefined): SpContractSummary | null {
  return list?.contracts.find((c) => c.status === "signed" && c.expires_soon) ?? null;
}

/**
 * Versão a mostrar por omissão: a por assinar, senão a assinada por si, senão a proposta em curso (ou aceite em
 * preparação), senão a assinada em vigor, senão a mais recente.
 */
export function defaultContractId(list: Pick<SpContractsList, "contracts"> | null | undefined): string | null {
  if (!list || list.contracts.length === 0) return null;
  return (
    pendingContract(list)?.id ??
    list.contracts.find((c) => c.status === "signed_supplier")?.id ??
    list.contracts.find((c) => c.status === "proposed" || c.status === "draft")?.id ??
    list.contracts.find((c) => c.status === "signed")?.id ??
    list.contracts[0]?.id ??
    null
  );
}

// ── Telemóvel (igual a fn_sc_normalizar_telemovel) ──────────────────────────

/**
 * E.164 (PT: 9[1236]xxxxxxx com ou sem +351/00351; estrangeiro: +XXXXXXX).
 * null = inválido. O servidor volta a normalizar: isto só evita a ida e volta.
 */
export function normalizarTelemovel(p: string | null | undefined): string | null {
  let v = (p ?? "").replace(/[\s()./-]/g, "");
  if (v === "") return null;
  if (/^00[1-9]/.test(v)) v = `+${v.slice(2)}`;
  if (/^9[1236][0-9]{7}$/.test(v)) v = `+351${v}`;
  if (!/^\+[1-9][0-9]{6,14}$/.test(v)) return null;
  if (v.startsWith("+351") && !/^\+3519[1236][0-9]{7}$/.test(v)) return null;
  return v;
}

/** Igual a fn_sc_mascarar_telemovel. */
export function mascararTelemovel(p: string | null | undefined): string | null {
  if (!p) return null;
  if (p.length < 8) return p;
  return `${p.slice(0, 4)}${"*".repeat(p.length - 7)}${p.slice(-3)}`;
}

/** "+351912345678" → "912 345 678" (PT) para pré-preencher; o resto fica como está. */
export function telemovelParaEditar(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+351(9\d{2})(\d{3})(\d{3})$/.exec(e164);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : e164;
}

export const TELEMOVEL_INVALIDO = "Indique um telemóvel válido (ex.: 912 345 678 ou +34 600 000 000).";

// ── Código SMS (Edge sms-otp, ramo do fornecedor) ───────────────────────────

export const SP_CONTRACT_OTP_REFERENCE_TYPE = "supplier_contract";
export const SP_CONTRACT_OTP_PURPOSE = "supplier_signature";

export interface SpOtpPayload {
  success?: boolean;
  verified?: boolean;
  masked_phone?: string;
  error?: string;
  message?: string;
}

/** Texto por código da Edge, quando não vem mensagem. */
const OTP_ERROR_TEXT: Record<string, string> = {
  no_phone: "Não há telemóvel associado à sua conta. Indique-o para receber o código.",
  rate_limit: "Demasiados pedidos. Aguarde alguns minutos antes de tentar novamente.",
  invalid_reference: "Pedido inválido para este contrato.",
  "Not a supplier portal user": "Sem acesso ao portal do fornecedor.",
  contract_not_found: "Contrato não encontrado.",
  invalid_state: "Este contrato já não pode ser assinado.",
  not_owner: "Só o responsável da conta pode assinar o contrato.",
  supplier_lookup_failed: "Não foi possível validar o acesso. Tente novamente.",
};

export const otpErrorText = (p: SpOtpPayload): string =>
  p.message || (p.error ? OTP_ERROR_TEXT[p.error] : undefined) || p.error || "Não foi possível concluir o pedido.";

/**
 * Chama a sms-otp e devolve sempre o corpo (também nos estados não-2xx, que
 * vêm em error.context). Falha de rede sem corpo → { error: "network" }.
 */
export async function invokeSpContractOtp(
  action: "send_otp" | "verify_otp",
  contractId: string,
  code?: string,
): Promise<SpOtpPayload> {
  const { data, error } = await supabase.functions.invoke("sms-otp", {
    body: {
      action,
      caller_type: "supplier",
      reference_id: contractId,
      reference_type: SP_CONTRACT_OTP_REFERENCE_TYPE,
      purpose: SP_CONTRACT_OTP_PURPOSE,
      ...(code !== undefined ? { code } : {}),
    },
  });
  let payload = (data ?? null) as SpOtpPayload | null;
  if (error && !payload) {
    try {
      payload = ((await (error as { context?: { json?: () => Promise<unknown> } }).context?.json?.()) ?? null) as SpOtpPayload | null;
    } catch {
      payload = null;
    }
    if (!payload) return { error: "network", message: "Sem ligação ao servidor. Verifique a ligação à internet e tente novamente." };
  }
  return payload ?? {};
}
