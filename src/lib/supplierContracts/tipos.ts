// Contrato de Fornecedor (Fase 3, CRM): tipos, rótulos e conversões das
// condições. Contrato exato das RPCs em
// supabase/migrations/20270103300000_contrato_fornecedor_base.sql
// (fn_sc_contrato_json, rpc_supplier_contracts_list, ...). As tabelas e RPCs
// ainda não estão em types.ts (não regenerado): os tipos ficam aqui.
// Propostas do fornecedor (estado 'proposed', created_via 'portal'):
// supabase/migrations/20270104100000_contrato_fornecedor_propostas_portal.sql.
import type { InventoryTone } from "@/components/inventory/ui/tones";

export type SupplierContractStatus =
  | "proposed"
  | "draft"
  | "sent"
  | "signed_supplier"
  | "signed"
  | "refused"
  | "cancelled"
  | "expired"
  | "superseded";

export type SupplierContractKind = "material" | "servico";
export type SupplierContractOrigin = "modelo" | "pdf_fornecedor";
/** Quem criou o contrato: o CRM (rascunho) ou o fornecedor no portal (proposta). */
export type SupplierContractCreatedVia = "crm" | "portal";
/**
 * Só nos contratos criados pelo portal (senão null): pending = 'proposed' à espera do CRM; accepted = o CRM aceitou
 * (draft em preparação e tudo o que se segue); refused = recusada pela empresa; withdrawn = retirada pelo fornecedor.
 */
export type SupplierContractProposalState = "pending" | "accepted" | "refused" | "withdrawn";
/** Em 'refused': quem recusou (a empresa recusa propostas; o fornecedor recusa contratos enviados). */
export type SupplierContractRefusedBy = "empresa" | "fornecedor";

/** Tipos de evento do histórico (o portal vê só uma parte; o CRM vê todos). */
export type SupplierContractEventType =
  | "created"
  | "updated"
  | "conditions_updated"
  | "sent"
  | "file_added"
  | "supplier_signed"
  | "company_signed"
  | "refused"
  | "cancelled"
  | "superseded"
  | "expired"
  | "new_version"
  | "signature_request_resent"
  | "proposed"
  | "proposal_accepted"
  | "proposal_refused"
  | "proposal_withdrawn";

export const PAYMENT_METHODS = [
  "transferencia",
  "multibanco",
  "debito_direto",
  "cheque",
  "numerario",
  "cartao",
  "outro",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SHIPPING_TERMS = ["incluidos", "a_cargo_comprador", "gratis_acima_minimo", "a_combinar"] as const;
export type ShippingTerms = (typeof SHIPPING_TERMS)[number];

/** As chaves aceites por fn_sc_aplicar_condicoes (qualquer outra é erro no servidor). */
export interface SupplierContractConditions {
  payment_terms_days: number | null;
  payment_method: PaymentMethod | null;
  delivery_sla_days: number | null;
  shipping_terms: ShippingTerms | null;
  shipping_free_from: number | null;
  discount_percent: number | null;
  min_order_value: number | null;
  returns_accepted: boolean | null;
  returns_days: number | null;
  returns_notes: string | null;
  conditions_notes: string | null;
}

export interface SupplierContractFile {
  id: string;
  kind: "contrato_fornecedor" | "anexo";
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  storage_bucket: string;
  storage_path: string;
  uploaded_via: "crm" | "portal";
  created_at: string;
  is_main: boolean;
}

export interface SupplierContractEvent {
  id: string;
  event_type: string;
  description: string | null;
  created_at: string;
  data?: Record<string, unknown>;
  actor_user_id?: string | null;
  actor_portal_user_id?: string | null;
  ip?: string | null;
}

/** fn_sc_contrato_json(c, 'crm', false) — uma linha da lista de versões. */
export interface SupplierContractSummary {
  id: string;
  organization_id: string;
  organization_name: string | null;
  supplier_id: string;
  supplier_name: string | null;
  contract_number: string;
  version: number;
  previous_contract_id: string | null;
  superseded_by_id: string | null;
  kind: SupplierContractKind;
  origin: SupplierContractOrigin;
  title: string;
  status: SupplierContractStatus;
  conditions: SupplierContractConditions;
  valid_from: string | null;
  valid_until: string | null;
  days_to_expiry: number | null;
  expires_soon: boolean;
  sent_at: string | null;
  document_sha256: string | null;
  document_frozen_at: string | null;
  main_file_id: string | null;
  supplier_signed_at: string | null;
  supplier_signed_by_name: string | null;
  supplier_signed_phone_masked: string | null;
  supplier_signature_sha256: string | null;
  company_signed_at: string | null;
  company_signed_by_name: string | null;
  refused_at: string | null;
  refusal_reason: string | null;
  refused_by: SupplierContractRefusedBy | null;
  cancelled_at: string | null;
  superseded_at: string | null;
  expired_at: string | null;
  created_via: SupplierContractCreatedVia;
  proposal_state: SupplierContractProposalState | null;
  /** Nome (ou email) do utilizador do portal que propôs; null se criado no CRM. */
  proposed_by_name: string | null;
  created_at: string;
  updated_at: string;
  // Só no CRM
  template_id: string | null;
  created_by_portal_user_id: string | null;
  proposed_by_email: string | null;
  supplier_signed_by_email: string | null;
  supplier_signed_ip: string | null;
  supplier_signed_user_agent: string | null;
  supplier_signed_document_sha256: string | null;
  company_signature_mode: string | null;
  company_signed_ip: string | null;
  cancel_reason: string | null;
}

/** O que o fornecedor propôs (evento 'proposed'), tal como submetido: não muda quando o CRM edita o rascunho. */
export interface SupplierContractProposalSnapshot extends SupplierContractConditions {
  kind: SupplierContractKind;
  origin: SupplierContractOrigin;
  title: string;
  valid_from: string | null;
  valid_until: string | null;
}

/** rpc_supplier_contract_get — o contrato completo (+ permissões). */
export interface SupplierContractDetail extends SupplierContractSummary {
  document_html: string | null;
  body_html: string | null;
  files: SupplierContractFile[];
  events: SupplierContractEvent[];
  /** Só em contratos criados pelo portal; senão null. */
  proposal_snapshot: SupplierContractProposalSnapshot | null;
  can_manage: boolean;
  can_countersign: boolean;
  /** status 'proposed' e suppliers.contract_manage. */
  can_accept_proposal: boolean;
  can_refuse_proposal: boolean;
}

/** rpc_supplier_contracts_list(p_supplier_id). */
export interface SupplierContractsList {
  supplier_id: string;
  conditions_locked: boolean;
  active_contract_id: string | null;
  can_manage: boolean;
  can_countersign: boolean;
  contracts: SupplierContractSummary[];
}

export interface SupplierContractTemplate {
  id: string;
  organization_id: string;
  name: string;
  kind: SupplierContractKind;
  description: string | null;
  body_html: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierContractVariable {
  key: string;
  label: string;
  example: string;
}

export interface SupplierContractPreview {
  html: string | null;
  sha256: string | null;
  frozen: boolean;
}

export interface SupplierContractExpiring {
  contract_id: string;
  organization_id: string;
  supplier_id: string;
  supplier_name: string;
  contract_number: string;
  version: number;
  valid_until: string;
  days_left: number;
  expired: boolean;
}

// ── Rótulos ─────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<SupplierContractStatus, string> = {
  proposed: "Proposta do fornecedor",
  draft: "Rascunho",
  sent: "Enviado",
  signed_supplier: "Assinado pelo fornecedor",
  signed: "Assinado",
  refused: "Recusado",
  cancelled: "Cancelado",
  expired: "Expirado",
  superseded: "Substituído",
};

export const STATUS_TONE: Record<SupplierContractStatus, InventoryTone> = {
  proposed: "warn",
  draft: "neutral",
  sent: "info",
  signed_supplier: "warn",
  signed: "ok",
  refused: "bad",
  cancelled: "neutral",
  expired: "bad",
  superseded: "neutral",
};

/** Rótulo de cada evento do histórico (quando o servidor não manda descrição). */
export const EVENT_LABEL: Record<SupplierContractEventType, string> = {
  created: "Rascunho criado",
  updated: "Rascunho alterado",
  conditions_updated: "Condições alteradas",
  sent: "Enviado ao fornecedor",
  file_added: "Ficheiro adicionado",
  supplier_signed: "Assinado pelo fornecedor",
  company_signed: "Contra-assinado pela empresa",
  refused: "Recusado pelo fornecedor",
  cancelled: "Cancelado pela empresa",
  superseded: "Substituído por nova versão",
  expired: "Expirado",
  new_version: "Nova versão criada",
  signature_request_resent: "Pedido de assinatura reenviado",
  proposed: "Proposta do fornecedor",
  proposal_accepted: "Proposta aceite pela empresa",
  proposal_refused: "Proposta recusada pela empresa",
  proposal_withdrawn: "Proposta retirada pelo fornecedor",
};

/** Texto de uma linha do histórico: a descrição do servidor, senão o rótulo do tipo. */
export function eventText(e: Pick<SupplierContractEvent, "event_type" | "description">): string {
  return e.description || EVENT_LABEL[e.event_type as SupplierContractEventType] || e.event_type;
}

export const KIND_LABEL: Record<SupplierContractKind, string> = {
  material: "Fornecimento de material",
  servico: "Subempreitada / serviços",
};

export const ORIGIN_LABEL: Record<SupplierContractOrigin, string> = {
  modelo: "Modelo da empresa",
  pdf_fornecedor: "PDF do fornecedor",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  transferencia: "Transferência bancária",
  multibanco: "Referência Multibanco",
  debito_direto: "Débito direto",
  cheque: "Cheque",
  numerario: "Numerário",
  cartao: "Cartão",
  outro: "Outra (ver observações)",
};

export const SHIPPING_TERMS_LABEL: Record<ShippingTerms, string> = {
  incluidos: "Incluídos no preço",
  a_cargo_comprador: "A cargo do comprador",
  gratis_acima_minimo: "Grátis a partir de um valor",
  a_combinar: "A combinar em cada encomenda",
};

/**
 * Os estados em curso (um de cada vez por fornecedor: supplier_contracts_um_em_curso). Atenção: uma proposta
 * ('proposed') não se cancela com rpc_supplier_contract_cancel — aceita-se ou recusa-se (can_accept/can_refuse).
 */
export const OPEN_STATUSES: readonly SupplierContractStatus[] = ["proposed", "draft", "sent", "signed_supplier"];

export const isOpenStatus = (s: SupplierContractStatus): boolean => OPEN_STATUSES.includes(s);

// ── Formulário das condições ────────────────────────────────────────────────

/** Os campos do formulário em texto (inputs), convertidos só ao gravar. */
export interface ConditionsFormValues {
  payment_terms_days: string;
  payment_method: PaymentMethod | "";
  delivery_sla_days: string;
  shipping_terms: ShippingTerms | "";
  shipping_free_from: string;
  discount_percent: string;
  min_order_value: string;
  returns_accepted: "" | "sim" | "nao";
  returns_days: string;
  returns_notes: string;
  conditions_notes: string;
  valid_from: string;
  valid_until: string;
}

const numToText = (n: number | null | undefined): string => (n === null || n === undefined ? "" : String(n));

export function conditionsToForm(
  c: Partial<SupplierContractConditions> | null | undefined,
  validFrom: string | null | undefined,
  validUntil: string | null | undefined,
): ConditionsFormValues {
  return {
    payment_terms_days: numToText(c?.payment_terms_days),
    payment_method: c?.payment_method ?? "",
    delivery_sla_days: numToText(c?.delivery_sla_days),
    shipping_terms: c?.shipping_terms ?? "",
    shipping_free_from: numToText(c?.shipping_free_from),
    discount_percent: numToText(c?.discount_percent),
    min_order_value: numToText(c?.min_order_value),
    returns_accepted: c?.returns_accepted === true ? "sim" : c?.returns_accepted === false ? "nao" : "",
    returns_days: numToText(c?.returns_days),
    returns_notes: c?.returns_notes ?? "",
    conditions_notes: c?.conditions_notes ?? "",
    valid_from: validFrom ?? "",
    valid_until: validUntil ?? "",
  };
}

/** Texto → número (aceita vírgula decimal). "" → null; inválido → NaN (erro no validador). */
export function parseNumero(v: string): number | null {
  const t = v.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

export interface ConditionsParseResult {
  conditions: SupplierContractConditions;
  valid_from: string | null;
  valid_until: string | null;
  errors: Partial<Record<keyof ConditionsFormValues, string>>;
}

/** Valida como o servidor (fn_sc_aplicar_condicoes / CHECKs) e devolve o objeto `conditions`. */
export function formToConditions(f: ConditionsFormValues): ConditionsParseResult {
  const errors: ConditionsParseResult["errors"] = {};
  const inteiro = (k: keyof ConditionsFormValues, rotulo: string, max: number): number | null => {
    const n = parseNumero(String(f[k]));
    if (n === null) return null;
    if (Number.isNaN(n) || !Number.isInteger(n) || n < 0 || n > max) {
      errors[k] = `${rotulo}: um número inteiro entre 0 e ${max}.`;
      return null;
    }
    return n;
  };
  const decimal = (k: keyof ConditionsFormValues, rotulo: string, max: number): number | null => {
    const n = parseNumero(String(f[k]));
    if (n === null) return null;
    if (Number.isNaN(n) || n < 0 || n > max) {
      errors[k] = `${rotulo}: um valor entre 0 e ${max.toLocaleString("pt-PT")}.`;
      return null;
    }
    return Math.round(n * 100) / 100;
  };
  const texto = (v: string, k: keyof ConditionsFormValues, rotulo: string, max: number): string | null => {
    const t = v.trim();
    if (!t) return null;
    if (t.length > max) {
      errors[k] = `${rotulo}: no máximo ${max} caracteres.`;
      return null;
    }
    return t;
  };

  const conditions: SupplierContractConditions = {
    payment_terms_days: inteiro("payment_terms_days", "Prazo de pagamento", 365),
    payment_method: f.payment_method || null,
    delivery_sla_days: inteiro("delivery_sla_days", "Prazo de entrega", 365),
    shipping_terms: f.shipping_terms || null,
    shipping_free_from: decimal("shipping_free_from", "Portes grátis a partir de", 9999999999.99),
    discount_percent: decimal("discount_percent", "Desconto", 100),
    min_order_value: decimal("min_order_value", "Encomenda mínima", 9999999999.99),
    returns_accepted: f.returns_accepted === "sim" ? true : f.returns_accepted === "nao" ? false : null,
    returns_days: inteiro("returns_days", "Prazo de devolução", 365),
    returns_notes: texto(f.returns_notes, "returns_notes", "Condições de devolução", 2000),
    conditions_notes: texto(f.conditions_notes, "conditions_notes", "Observações", 4000),
  };
  // Campos escondidos no formulário não seguem para o servidor.
  if (conditions.shipping_terms !== "gratis_acima_minimo") {
    conditions.shipping_free_from = null;
    delete errors.shipping_free_from;
  } else if (conditions.shipping_free_from === null && !errors.shipping_free_from) {
    errors.shipping_free_from = "Indique a partir de que valor os portes são grátis.";
  }
  if (conditions.returns_accepted !== true) {
    conditions.returns_days = null;
    conditions.returns_notes = null;
    delete errors.returns_days;
    delete errors.returns_notes;
  }
  const valid_from = f.valid_from || null;
  const valid_until = f.valid_until || null;
  if (valid_from && valid_until && valid_until < valid_from) {
    errors.valid_until = "O fim da validade não pode ser antes do início.";
  }
  return { conditions, valid_from, valid_until, errors };
}

/** O que falta para o servidor aceitar o envio (rpc_supplier_contract_send). */
export function missingForSend(c: Pick<SupplierContractDetail, "conditions" | "origin" | "body_html" | "main_file_id" | "valid_until">, hojeIso: string): string[] {
  const out: string[] = [];
  if (c.conditions.payment_terms_days === null) out.push("prazo de pagamento");
  if (!c.conditions.payment_method) out.push("forma de pagamento");
  if (c.conditions.shipping_terms === "gratis_acima_minimo" && c.conditions.shipping_free_from === null)
    out.push("valor a partir do qual os portes são grátis");
  if (c.valid_until && c.valid_until < hojeIso) out.push("fim da validade no futuro");
  if (c.origin === "modelo" && !c.body_html) out.push("texto do contrato (escolha um modelo)");
  if (c.origin === "pdf_fornecedor" && !c.main_file_id) out.push("PDF do contrato do fornecedor");
  return out;
}

// ── Formatação ──────────────────────────────────────────────────────────────

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Datas puras (YYYY-MM-DD) sem fuso: não deixar o Date recuar um dia.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d
    .toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .replace(",", "");
}

export function fmtEuros(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

/** "CF-2026-0001 · v2" */
export const contractRef = (c: Pick<SupplierContractSummary, "contract_number" | "version">): string =>
  `${c.contract_number} · v${c.version}`;

/** Resumo das condições em linhas (rótulo, valor) para mostrar só de leitura. */
export function conditionsRows(c: SupplierContractConditions): { label: string; value: string }[] {
  const portes =
    c.shipping_terms === "gratis_acima_minimo"
      ? `Grátis a partir de ${fmtEuros(c.shipping_free_from)}`
      : c.shipping_terms
        ? SHIPPING_TERMS_LABEL[c.shipping_terms]
        : "—";
  const devol =
    c.returns_accepted === null
      ? "—"
      : `${c.returns_accepted ? "Sim" : "Não"}${c.returns_days !== null ? ` (${c.returns_days} dias)` : ""}${c.returns_notes ? ` — ${c.returns_notes}` : ""}`;
  return [
    { label: "Prazo de pagamento", value: c.payment_terms_days === null ? "—" : `${c.payment_terms_days} dias` },
    { label: "Forma de pagamento", value: c.payment_method ? PAYMENT_METHOD_LABEL[c.payment_method] : "—" },
    { label: "Prazo de entrega", value: c.delivery_sla_days === null ? "—" : `${c.delivery_sla_days} dias` },
    { label: "Portes", value: portes },
    { label: "Desconto", value: c.discount_percent === null ? "—" : `${String(c.discount_percent).replace(".", ",")} %` },
    { label: "Encomenda mínima", value: fmtEuros(c.min_order_value) },
    { label: "Devoluções", value: devol },
    { label: "Observações", value: c.conditions_notes || "—" },
  ];
}

/** Hoje em Lisboa (YYYY-MM-DD), como o servidor compara as validades. */
export function hojeLisboa(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
