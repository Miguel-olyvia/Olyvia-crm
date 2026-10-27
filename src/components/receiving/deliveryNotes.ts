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
  action: "close" | "reopen" | "cancel" | "shipped" | "attachment" | string;
  at: string;
  notes?: string | null;
  reason?: string | null;
  divergences?: number | null;
  // Guias expedidas no portal do fornecedor (action 'shipped' / 'attachment').
  origin?: string | null;
  by_portal_user?: string | null;
  by_name?: string | null;
  carrier?: string | null;
  purchase_order_id?: string | null;
  revision?: number | null;
  path?: string | null;
  name?: string | null;
  mime?: string | null;
  size?: number | null;
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

/**
 * Rótulo do nº da guia: "GR 123", mas sem duplicar quando o nº já começa por
 * "GR" seguido de separador (espaço - _ / .) ou dígito (ex.: "GR-teste-2",
 * "GR123", "GR 5", "GR/2024/1", "GR.123" ficam como estão). Outros nºs
 * começados por "GR" levam o prefixo ("GRP-2024/1" → "GR GRP-2024/1").
 * Único sítio onde se decide o prefixo (picker, botão, cartão, ficha,
 * encomendas, avisos).
 */
export function noteLabel(number: string | null | undefined): string {
  const n = (number ?? "").trim();
  if (!n) return "Guia";
  return /^gr(?:[\s\-_/.]|\d)/i.test(n) ? n : `GR ${n}`;
}

/** Data de hoje (local) em 'YYYY-MM-DD' para um <input type="date">. */
export function todayIso(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const fmtDateTime =(s: string | null | undefined) => (s ? new Date(s).toLocaleString("pt-PT") : "");

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

// ── Guias expedidas pelo fornecedor no portal ───────────────────────────────
// O portal grava em supplier_delivery_notes.history uma entrada
//   {action:'shipped', origin:'supplier_portal', at, by_portal_user, by_name, carrier, purchase_order_id, revision}
// e cada ficheiro como {action:'attachment', path, name, mime, size, at} (o último conta; bucket 'documents').
// created_by fica NULL nessas guias. Nada aqui escreve na BD.

/** Bucket onde o portal guarda o ficheiro da guia. */
export const NOTE_FILE_BUCKET = "documents";

export interface PortalNoteFile {
  path: string;
  name: string;
  mime: string | null;
  size: number | null;
  at: string | null;
}

export interface PortalNoteMeta {
  shippedAt: string | null;
  byName: string | null;
  carrier: string | null;
  purchaseOrderId: string | null;
  file: PortalNoteFile | null;
}

type HistoryEntry = Record<string, unknown>;

const historyEntries = (history: unknown): HistoryEntry[] =>
  Array.isArray(history) ? history.filter((h): h is HistoryEntry => !!h && typeof h === "object" && !Array.isArray(h)) : [];

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const isShipped = (h: HistoryEntry) => h.action === "shipped" && h.origin === "supplier_portal";

/** A guia foi expedida pelo fornecedor no portal (há uma entrada 'shipped' com origin 'supplier_portal'). */
export function isPortalNote(history: unknown): boolean {
  return historyEntries(history).some(isShipped);
}

/**
 * Dados do portal de uma guia: a expedição mais recente (uma revisão substitui a anterior) e o último ficheiro
 * anexado (com path). null se a guia não veio do portal.
 */
export function portalMeta(history: unknown): PortalNoteMeta | null {
  const L = historyEntries(history);
  const shipped = L.filter(isShipped);
  if (!shipped.length) return null;
  const last = shipped[shipped.length - 1];
  const att = L.filter((h) => h.action === "attachment" && !!str(h.path));
  const a = att.length ? att[att.length - 1] : null;
  const size = a ? Number(a.size) : Number.NaN;
  return {
    shippedAt: str(last.at),
    byName: str(last.by_name),
    carrier: str(last.carrier),
    purchaseOrderId: str(last.purchase_order_id),
    file: a
      ? {
          path: str(a.path) as string,
          name: str(a.name) ?? (str(a.path) as string).split("/").pop() ?? "guia",
          mime: str(a.mime),
          size: Number.isFinite(size) && size >= 0 ? size : null,
          at: str(a.at),
        }
      : null,
  };
}

/** "123 KB" / "1,2 MB" (vazio sem tamanho). */
export function fmtFileSize(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(n / (1024 * 1024))} MB`;
}

/** URL temporário (5 min) do ficheiro da guia, lido pela RLS do storage. */
export async function signedNoteFileUrl(path: string): Promise<{ url?: string; error?: string }> {
  try {
    const { data, error } = await supabase.storage.from(NOTE_FILE_BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return { error: error?.message || "Não foi possível abrir o ficheiro da guia." };
    return { url: data.signedUrl };
  } catch (ex) {
    return { error: ex instanceof Error && ex.message ? ex.message : "Sem ligação ao servidor — tenta de novo." };
  }
}

// ── Pré-preenchimento a partir de uma guia do portal ────────────────────────

/** Linha anunciada numa guia (supplier_delivery_note_lines). */
export interface NoteLineLite {
  delivery_note_id: string;
  product_id: string;
  purchase_order_item_id: string | null;
  quantity: number;
  units_per_uom: number;
}

/** Receção ativa feita com uma guia (purchase_order_receipts kind='receipt', não revertida). */
export interface NoteReceiptLite {
  delivery_note_id: string | null;
  purchase_order_item_id: string | null;
  quantity: number;
  units_per_uom: number;
}

/** Linha da PO, o mínimo para o cálculo (open e unitsPerUom na unidade da linha). */
export interface PoLineLite {
  id: string;
  productId: string;
  open: number;
  unitsPerUom: number;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * O que vem nesta guia para cada linha da PO, na unidade da linha:
 * anunciado na guia − já recebido com esta guia, nunca abaixo de 0 nem acima do que falta na PO.
 * As linhas da guia ligam-se pela purchase_order_item_id; sem ela, pelo produto se só uma linha da PO o tiver.
 * Devolve null se a guia não anuncia nada desta PO (aí vale o que falta).
 */
export function prefillFromNote(
  noteId: string,
  poLines: readonly PoLineLite[],
  noteLines: readonly NoteLineLite[],
  receipts: readonly NoteReceiptLite[],
): Record<string, number> | null {
  const byProduct = new Map<string, string[]>();
  for (const l of poLines) byProduct.set(l.productId, [...(byProduct.get(l.productId) ?? []), l.id]);
  const ids = new Set(poLines.map((l) => l.id));
  const lineOf = (poi: string | null, product: string | null): string | null => {
    if (poi) return ids.has(poi) ? poi : null;
    const c = product ? byProduct.get(product) : undefined;
    return c && c.length === 1 ? c[0] : null;
  };
  const ann = new Map<string, number>();
  for (const n of noteLines) {
    if (n.delivery_note_id !== noteId) continue;
    const k = lineOf(n.purchase_order_item_id, n.product_id);
    if (k) ann.set(k, (ann.get(k) ?? 0) + (Number(n.quantity) || 0) * (Number(n.units_per_uom) || 1));
  }
  if (ann.size === 0) return null;
  const rec = new Map<string, number>();
  for (const r of receipts) {
    if (r.delivery_note_id !== noteId || !r.purchase_order_item_id || !ids.has(r.purchase_order_item_id)) continue;
    const k = r.purchase_order_item_id;
    rec.set(k, (rec.get(k) ?? 0) + (Number(r.quantity) || 0) * (Number(r.units_per_uom) || 1));
  }
  const out: Record<string, number> = {};
  for (const l of poLines) {
    const units = (ann.get(l.id) ?? 0) - (rec.get(l.id) ?? 0);
    const q = round6(units / (l.unitsPerUom || 1));
    out[l.id] = Math.max(0, Math.min(l.open, q));
  }
  return out;
}

/** Algo ainda por receber com esta guia (pré-preenchimento com pelo menos uma linha > 0). */
export const notePending = (prefill: Record<string, number> | null): boolean =>
  !!prefill && Object.values(prefill).some((q) => q > 0);

/** Classes do diálogo: ecrã inteiro no telemóvel, janela a partir de sm. */
export const FULLSCREEN_DIALOG_CLASS =
  "flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-lg";
