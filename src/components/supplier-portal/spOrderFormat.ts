// Portal do Fornecedor (F3.2) — formatação das encomendas e mapa código → chave dos estados.
// Só as PALAVRAS seguem o idioma do portal (meses, «às»...). Dinheiro, quantidades, dd/mm/aaaa e horas ficam
// como sempre, nos dois idiomas. Os códigos de estado da base não mudam, só se mapeiam para chaves `sp.estado.*`.
import { format } from "date-fns";
import { formatarData, formatarDataIso, localeDateFns, type PortalIdioma } from "@/portal-i18n";
import type { SpOrderStatus, SpPublicationStatus } from "@/lib/supplierPortal/spRpc";

const SEM_VALOR = "—";

/** "YYYY-MM-DD" → "dd/mm/aaaa" sem passar por Date (evita desvios de fuso). */
export function formatSpDate(value: string | null | undefined, idioma: PortalIdioma): string {
  return formatarDataIso(value, idioma);
}

/** timestamptz → "dd/mm/aaaa, hh:mm" (hora local, 24 horas). Um texto que não é data volta como veio. */
export function formatSpDateTime(value: string | null | undefined, idioma: PortalIdioma): string {
  if (!value) return SEM_VALOR;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return format(d, "dd/MM/yyyy, HH:mm", { locale: localeDateFns(idioma) });
}

/** Dinheiro: o formato não segue o idioma do portal (sempre pt-PT, como sempre foi): só as palavras o seguem. */
export function formatSpMoney(value: number | null | undefined, currency = "EUR"): string {
  const n = Number(value ?? 0);
  try {
    return n.toLocaleString("pt-PT", { style: "currency", currency: currency || "EUR" });
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** Quantidades: até 4 casas, sempre em pt-PT (vírgula decimal), nos dois idiomas. */
export function formatSpQty(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString("pt-PT", { maximumFractionDigits: 4 });
}

/** Data de um dia (sem hora) a partir de um timestamptz, na hora local: «Desde …». */
export function formatSpLocalDay(value: string | null | undefined, idioma: PortalIdioma): string {
  return formatarData(value, idioma, "numerico");
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

/** Estado da resposta do fornecedor: Nova / Vista / Confirmada (chave do dicionário, não texto). */
export function spPublicationBadge(status: SpPublicationStatus): { labelKey: string; tone: Tone } {
  if (status === "confirmed") return { labelKey: "sp.estado.confirmada", tone: "confirmed" };
  if (status === "viewed") return { labelKey: "sp.estado.vista", tone: "viewed" };
  return { labelKey: "sp.estado.nova", tone: "new" };
}

/** Estado da encomenda na empresa, só quando já avançou (null para "encomendada"). */
export function spOrderStatusBadge(status: SpOrderStatus): { labelKey: string; tone: Tone } | null {
  if (status === "cancelled") return { labelKey: "sp.estado.cancelada", tone: "cancelled" };
  if (status === "received") return { labelKey: "sp.estado.recebida", tone: "received" };
  if (status === "partially_received") return { labelKey: "sp.estado.parcialmenteRecebida", tone: "partial" };
  return null;
}
