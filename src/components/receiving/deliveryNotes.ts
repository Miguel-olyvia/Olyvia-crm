// Guias do fornecedor (Fase 2 — fatia 2): formatos das RPCs e utilitários
// partilhados pelo ecrã de receção (Receiving.tsx) e pelos componentes
// DeliveryNotePicker / DeliveryNoteDialog / DeliveryNoteDetail.
//
// RPCs em supabase/migrations/20261209100000_guias_do_fornecedor.sql:
//   rpc_delivery_note_get / _save / _close / _reopen / _cancel.
// Tabelas (só SELECT por RLS): supplier_delivery_notes,
// supplier_delivery_note_orders, supplier_delivery_note_lines.
import { supabase } from "@/integrations/supabase/client";

export type DeliveryNoteStatus = "open" | "closed" | "cancelled";

export type DeliveryNoteProductStatus = "ok" | "falta" | "excesso" | "nao_anunciado" | "nao_encomendado" | "recebido";

export interface DeliveryNoteProduct {
  product_id: string;
  name: string | null;
  sku: string | null;
  announced_units: number;
  received_units: number;
  missing_units: number;
  excess_units: number;
  on_order: boolean;
  status: DeliveryNoteProductStatus;
  divergent: boolean;
}

export interface DeliveryNoteReceipt {
  id: string;
  purchase_order_id: string;
  order_number: string | null;
  purchase_order_item_id: string | null;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  units_per_uom: number;
  units: number;
  units_to_order: number;
  units_to_stock: number;
  warehouse_id: string | null;
  received_at: string;
  reverted: boolean;
  reverted_at: string | null;
  revert_reason: string | null;
}

export interface DeliveryNoteSummary {
  has_lines: boolean;
  products: DeliveryNoteProduct[];
  receipts: DeliveryNoteReceipt[];
  totals: {
    announced_units: number;
    received_units: number;
    missing_units: number;
    excess_units: number;
    products: number;
    divergences: number;
    active_receipts: number;
    reverted_receipts: number;
  };
  has_divergences: boolean;
}

export interface DeliveryNoteOrder {
  purchase_order_id: string;
  order_number: string | null;
  status: string;
  deleted: boolean;
  expected_delivery: string | null;
}

export interface DeliveryNoteLine {
  id: string;
  position: number;
  product_id: string;
  product_name: string | null;
  sku: string | null;
  uom_id: string | null;
  uom_code: string | null;
  units_per_uom: number;
  quantity: number;
  units: number;
  purchase_order_item_id: string | null;
  order_number: string | null;
  description: string | null;
}

export interface DeliveryNoteHistoryItem {
  action: "close" | "reopen" | "cancel" | string;
  at: string;
  notes?: string | null;
  reason?: string | null;
  divergences?: number | null;
}

export interface DeliveryNoteFull {
  id: string;
  organization_id: string;
  supplier_id: string;
  supplier_name: string | null;
  note_number: string;
  document_date: string | null;
  notes: string | null;
  status: DeliveryNoteStatus;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  close_notes: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  history: DeliveryNoteHistoryItem[];
  purchase_orders: DeliveryNoteOrder[];
  lines: DeliveryNoteLine[];
  summary: DeliveryNoteSummary | null;
  changed_since_close: boolean;
  /** Só nas respostas de save. */
  saved?: boolean;
  /** Só nas respostas de close/reopen/cancel. */
  changed?: boolean;
}

export interface RpcErrorLike {
  code?: string;
  message?: string;
  details?: string;
}

export const NOTE_STATUS_LABEL: Record<DeliveryNoteStatus, string> = {
  open: "aberta",
  closed: "fechada",
  cancelled: "cancelada",
};

export const PRODUCT_STATUS_LABEL: Record<DeliveryNoteProductStatus, string> = {
  ok: "OK",
  falta: "Falta",
  excesso: "Excesso",
  nao_anunciado: "Não anunciado",
  nao_encomendado: "Não encomendado",
  recebido: "Recebido",
};

const nf = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 4 });
export const fmtQty = (n: number | null | undefined) => nf.format(Number(n ?? 0));

/** 'YYYY-MM-DD…' → 'DD/MM/YYYY' sem passar por Date (evita desvios de fuso). */
export function fmtDay(s: string | null | undefined): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

export const fmtDateTime = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("pt-PT") : "");

/** Identificador gerado no cliente (idempotência do rpc_delivery_note_save). */
export function newClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Mensagem para o utilizador; sem código = sem resposta do servidor. */
export function noteErrorMessage(err: RpcErrorLike | null | undefined): string {
  if (!err?.code) return "Sem ligação ao servidor — tenta de novo.";
  if (err.code === "42501") return err.message || "Sem permissão para esta operação.";
  return err.message || "Erro inesperado.";
}

/** Normaliza a resposta das RPCs da guia (listas vazias em vez de null). */
export function normalizeNote(raw: unknown): DeliveryNoteFull | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as DeliveryNoteFull;
  return {
    ...n,
    history: Array.isArray(n.history) ? n.history : [],
    purchase_orders: Array.isArray(n.purchase_orders) ? n.purchase_orders : [],
    lines: Array.isArray(n.lines) ? n.lines : [],
    summary: n.summary
      ? {
          ...n.summary,
          products: Array.isArray(n.summary.products) ? n.summary.products : [],
          receipts: Array.isArray(n.summary.receipts) ? n.summary.receipts : [],
        }
      : null,
    changed_since_close: !!n.changed_since_close,
  };
}

export async function fetchDeliveryNote(id: string): Promise<{ note?: DeliveryNoteFull; error?: RpcErrorLike }> {
  try {
    const { data, error } = await supabase.rpc("rpc_delivery_note_get", { p_delivery_note_id: id });
    if (error) return { error };
    const note = normalizeNote(data);
    return note ? { note } : { error: { code: "P0002", message: "Guia do fornecedor não encontrada" } };
  } catch (ex) {
    return { error: { message: String(ex) } };
  }
}

/** Classes do diálogo: ecrã inteiro no telemóvel, janela a partir de sm. */
export const FULLSCREEN_DIALOG_CLASS =
  "flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-lg";
