// Portal do Fornecedor (F3.2) — RPCs do CRM para encomendas a fornecedor
// (contrato-f32, secção 3). Argumentos pelos tipos gerados; os retornos são
// Json nos tipos gerados e o conteúdo é descrito pelos tipos locais abaixo.

import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

type Fns = Database["public"]["Functions"];

export type PoPublicationStatus = "sent" | "viewed" | "confirmed" | "withdrawn";

export interface PoSendResult {
  purchase_order_id: string;
  order_status: string;
  status_changed: boolean;
  published: boolean;
  already_published: boolean;
  revision: number | null;
  emails_queued: number;
  warning: "no_portal_users" | "no_smtp" | null;
}

export interface PoWithdrawResult {
  purchase_order_id: string;
  order_status: string;
  withdrawn: boolean;
  revision: number;
}

export interface PoAcceptDateResult {
  purchase_order_id: string;
  expected_delivery: string | null;
  already_accepted: boolean;
}

export interface PoSupplierPublication {
  status: PoPublicationStatus;
  revision: number;
  sent_at: string;
  sent_by: { id: string; name: string | null } | null;
  viewed_at: string | null;
  confirmed_at: string | null;
  confirmed_by_name: string | null;
  promised_date: string | null;
  supplier_comment: string | null;
  promised_date_accepted_at: string | null;
  promised_date_accepted_by_name: string | null;
  withdrawn_at: string | null;
  withdrawn_by_name: string | null;
  withdraw_reason: string | null;
}

export interface PoSupplierEmail {
  to_email: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  scheduled_for: string;
  sent_at: string | null;
  error_message: string | null;
}

export interface PoSupplierStatus {
  purchase_order_id: string;
  order_status: string;
  supplier_id: string | null;
  expected_delivery: string | null;
  portal: { linked: boolean; link_id: string | null; active_users: number };
  publication: PoSupplierPublication | null;
  emails: PoSupplierEmail[];
  can_send: boolean;
  can_withdraw: boolean;
  can_accept_date: boolean;
  can_edit_lines: boolean;
}

/** Linha leve de supplier_po_publications para a etiqueta da lista. */
export interface PoPublicationRow {
  purchase_order_id: string;
  status: PoPublicationStatus;
  revision: number;
  viewed_at: string | null;
  confirmed_at: string | null;
  promised_date: string | null;
}

// ─── Erros ──────────────────────────────────────────────────────────────────

export class PoPortalRpcError extends Error {
  readonly code: string | null;
  readonly hint: string | null;
  constructor(raw: { message?: string; code?: string; hint?: string } | null | undefined) {
    super(raw?.message || "Erro desconhecido");
    this.name = "PoPortalRpcError";
    this.code = raw?.code ?? null;
    this.hint = raw?.hint ?? null;
  }
}

/** hint de um erro do Supabase/PostgREST (ou PoPortalRpcError). */
export function getPoHint(err: unknown): string | null {
  if (err && typeof err === "object" && "hint" in err) {
    const hint = (err as { hint?: unknown }).hint;
    return typeof hint === "string" && hint ? hint : null;
  }
  return null;
}

/** A RPC/tabela ainda não existe na BD (migration F3.2 por aplicar). */
export function isPortalFeatureMissing(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  const message = String((err as { message?: unknown }).message ?? "");
  return (
    code === "PGRST202" || // função não encontrada no schema cache
    code === "PGRST205" || // tabela não encontrada no schema cache
    code === "42883" || // undefined_function
    code === "42P01" || // undefined_table
    /could not find the (function|table)/i.test(message)
  );
}

export function poPortalErrorMessage(err: unknown): string {
  if (isPortalFeatureMissing(err)) {
    return "O envio pelo portal do fornecedor ainda não está disponível nesta base de dados.";
  }
  const raw = err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? "");
  switch (getPoHint(err)) {
    case "no_permission":
      return raw || "Sem permissão para esta operação.";
    case "not_found":
      return "Encomenda não encontrada.";
    case "not_published":
      return raw || "A encomenda não está no portal do fornecedor.";
    case "already_confirmed":
      return raw || "O fornecedor já confirmou esta encomenda: já não pode ser retirada do portal.";
    case "has_receipts":
      return raw || "Esta encomenda já tem receções: já não pode ser retirada do portal.";
    default:
      return raw || "Ocorreu um erro inesperado. Tente novamente.";
  }
}

// ─── Chamadas ───────────────────────────────────────────────────────────────

type RpcError = { message: string; code?: string; hint?: string; details?: string };

/** Converte o resultado de supabase.rpc: erro → PoPortalRpcError; Json → tipo local. */
function unwrap<T>({ data, error }: { data: Json | null; error: RpcError | null }): T {
  if (error) throw new PoPortalRpcError(error);
  return data as unknown as T;
}

/** "Encomendar" (purchase_orders.approve). */
export async function poSendToSupplier(poId: string): Promise<PoSendResult> {
  const args: Fns["rpc_po_send_to_supplier"]["Args"] = { p_po_id: poId };
  return unwrap<PoSendResult>(await supabase.rpc("rpc_po_send_to_supplier", args));
}

/** "Retirar do portal" (purchase_orders.approve), motivo opcional até 500. */
export async function poWithdrawFromSupplier(poId: string, reason: string | null): Promise<PoWithdrawResult> {
  const r = reason?.trim();
  const args: Fns["rpc_po_withdraw_from_supplier"]["Args"] = { p_po_id: poId, ...(r ? { p_reason: r } : {}) };
  return unwrap<PoWithdrawResult>(await supabase.rpc("rpc_po_withdraw_from_supplier", args));
}

/** Estado no portal (purchase_orders.view). */
export async function poSupplierStatus(poId: string): Promise<PoSupplierStatus> {
  const args: Fns["rpc_po_supplier_status"]["Args"] = { p_po_id: poId };
  return unwrap<PoSupplierStatus>(await supabase.rpc("rpc_po_supplier_status", args));
}

/** "Aceitar data prometida" → expected_delivery (purchase_orders.edit). */
export async function poAcceptPromisedDate(poId: string): Promise<PoAcceptDateResult> {
  const args: Fns["rpc_po_accept_promised_date"]["Args"] = { p_po_id: poId };
  return unwrap<PoAcceptDateResult>(await supabase.rpc("rpc_po_accept_promised_date", args));
}

/**
 * Publicações ativas da organização (leitura direta, RLS purchase_orders.view).
 * Leitura à parte da lista de POs (não embed): uma falha aqui nunca parte a lista.
 */
export async function fetchPoPublications(organizationId: string): Promise<PoPublicationRow[]> {
  const { data, error } = await supabase
    .from("supplier_po_publications")
    .select("purchase_order_id, status, revision, viewed_at, confirmed_at, promised_date")
    .eq("organization_id", organizationId)
    .neq("status", "withdrawn");
  if (error) throw new PoPortalRpcError(error);
  return Array.isArray(data) ? (data as PoPublicationRow[]) : [];
}

/** "YYYY-MM-DD" → "dd/mm/aaaa" sem passar por Date. */
export function formatPoDate(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-PT");
}

/** timestamptz → "dd/mm" (curto, para a lista). */
export function formatPoShortDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

export function formatPoDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
