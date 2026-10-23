// Portal do Fornecedor (F3.2) — rótulos e formatação das encomendas.
import type { SpOrderStatus, SpPublicationStatus } from "@/lib/supplierPortal/spRpc";

/** "YYYY-MM-DD" → "dd/mm/aaaa" sem passar por Date (evita desvios de fuso). */
export function formatSpDate(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-PT");
}

/** timestamptz → "dd/mm/aaaa hh:mm" (hora local). */
export function formatSpDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatSpMoney(value: number | null | undefined, currency = "EUR"): string {
  const n = Number(value ?? 0);
  try {
    return n.toLocaleString("pt-PT", { style: "currency", currency: currency || "EUR" });
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function formatSpQty(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString("pt-PT", { maximumFractionDigits: 4 });
}

type Tone = "new" | "viewed" | "confirmed" | "partial" | "received" | "cancelled";

export const SP_TONE_CLASS: Record<Tone, string> = {
  new: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30",
  viewed: "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/30",
  confirmed: "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30",
  partial: "bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-200 dark:border-indigo-500/30",
  received: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-500/15 dark:text-slate-200 dark:border-slate-500/30",
  cancelled: "bg-red-100 text-red-900 border-red-200 dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/30",
};

/** Estado da resposta do fornecedor: Nova / Vista / Confirmada. */
export function spPublicationBadge(status: SpPublicationStatus): { label: string; tone: Tone } {
  if (status === "confirmed") return { label: "Confirmada", tone: "confirmed" };
  if (status === "viewed") return { label: "Vista", tone: "viewed" };
  return { label: "Nova", tone: "new" };
}

/** Estado da encomenda na empresa, só quando já avançou (null para "encomendada"). */
export function spOrderStatusBadge(status: SpOrderStatus): { label: string; tone: Tone } | null {
  if (status === "cancelled") return { label: "Cancelada", tone: "cancelled" };
  if (status === "received") return { label: "Recebida", tone: "received" };
  if (status === "partially_received") return { label: "Parcialmente recebida", tone: "partial" };
  return null;
}
