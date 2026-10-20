// O Portal do Fornecedor simulado (20/10, demo): o que o fornecedor vê, lido do Inventário do protótipo (inventario/loja.ts). Sem React.
// Espelha o portal real (src/pages/SupplierPortal*.tsx, spOrderFormat.ts): só as encomendas publicadas no portal deste fornecedor, os mesmos
// filtros e os mesmos selos (Nova âmbar, Vista azul, Confirmada verde; Parcialmente recebida índigo, Recebida cinza, Cancelada vermelho).
// A expedição com guia de remessa ("Por expedir", "Expedida") é SÓ DO PROTÓTIPO: o portal real não a tem.
import { poOpen, poStatus, podeExpedir } from "../inventario/po";
import type { Fornecedor, Inventario, Po } from "../inventario/tipos";

/** As encomendas que o fornecedor vê: as dele, publicadas no portal (por ver, vistas ou confirmadas), da mais recente para a mais antiga. */
export function posDoPortal(db: Inventario, sup: string): Po[] {
  return db.pos.filter((p) => !p.deleted && p.sup === sup && ["sent", "seen", "confirmed"].includes(p.portal.state))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/** Por confirmar: publicada, ainda não confirmada, e a encomenda em aberto. */
export const porConfirmar = (p: Po): boolean => ["sent", "seen"].includes(p.portal.state) && poOpen(p);

export type FiltroPortal = "to_confirm" | "to_ship" | "confirmed" | "open" | "received" | "cancelled" | "all";
/** Os filtros do portal real, pela mesma ordem, mais "Por expedir" (só protótipo). */
export const FILTROS_PORTAL: readonly (readonly [FiltroPortal, string])[] = [
  ["to_confirm", "Por confirmar"], ["to_ship", "Por expedir"], ["confirmed", "Confirmadas"], ["open", "Em curso"], ["received", "Recebidas"], ["cancelled", "Canceladas"], ["all", "Todas"],
];

export function noFiltro(p: Po, f: FiltroPortal): boolean {
  const st = poStatus(p);
  switch (f) {
    case "to_confirm": return porConfirmar(p);
    case "to_ship": return podeExpedir(p);
    case "confirmed": return p.portal.state === "confirmed";
    case "open": return poOpen(p);
    case "received": return st === "received";
    case "cancelled": return st === "cancelled";
    default: return true;
  }
}

export function contagensPortal(L: readonly Po[]): Record<FiltroPortal, number> {
  const c = {} as Record<FiltroPortal, number>;
  for (const [f] of FILTROS_PORTAL) c[f] = L.filter((p) => noFiltro(p, f)).length;
  return c;
}

/** Os fornecedores com conta no portal (convidados, ativos ou revogados): primeiro os ativos com encomendas, depois os outros ativos, os convidados
 *  (entram pelo primeiro acesso) e por fim os revogados (veem "Acesso revogado"). */
export function fornecedoresDoPortal(db: Inventario): Fornecedor[] {
  const ordem = (s: Fornecedor): number => (s.portal === "active" ? (posDoPortal(db, s.id).length ? 0 : 1) : s.portal === "invited" ? 2 : 3);
  return db.suppliers.filter((s) => !s.deleted && s.portal !== "none").sort((a, b) => ordem(a) - ordem(b));
}

/** Com quem se entra no portal pelo menu: o fornecedor com encomendas por confirmar (ou por expedir), senão o primeiro da lista. */
export function fornecedorInicial(db: Inventario): string {
  const L = fornecedoresDoPortal(db);
  const comTrabalho = L.find((s) => s.portal === "active" && posDoPortal(db, s.id).some((p) => porConfirmar(p) || podeExpedir(p)));
  return (comTrabalho ?? L[0])?.id ?? "";
}

export type TomPortal = "new" | "viewed" | "confirmed" | "shipped" | "partial" | "received" | "cancelled";
/** As cores do portal real (SP_TONE_CLASS de spOrderFormat.ts), mais "shipped" (só protótipo). */
export const CLASSE_TOM: Record<TomPortal, string> = {
  new: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30",
  viewed: "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/30",
  confirmed: "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30",
  shipped: "bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:border-violet-500/30",
  partial: "bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-200 dark:border-indigo-500/30",
  received: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-500/15 dark:text-slate-200 dark:border-slate-500/30",
  cancelled: "bg-red-100 text-red-900 border-red-200 dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/30",
};

/** Os selos de uma encomenda no portal: a resposta do fornecedor (Nova/Vista/Confirmada), a expedição e o estado na empresa (se já avançou). */
export function selosPortal(p: Po): { label: string; tom: TomPortal }[] {
  const out: { label: string; tom: TomPortal }[] = [];
  const st = poStatus(p);
  out.push(p.portal.state === "confirmed" ? { label: "Confirmada", tom: "confirmed" } : p.portal.state === "seen" ? { label: "Vista", tom: "viewed" } : { label: "Nova", tom: "new" });
  if (p.portal.expedicoes?.length && poOpen(p)) out.push({ label: "Expedida", tom: "shipped" });
  if (st === "cancelled") out.push({ label: "Cancelada", tom: "cancelled" });
  else if (st === "received") out.push({ label: "Recebida", tom: "received" });
  else if (st === "partial") out.push({ label: "Parcialmente recebida", tom: "partial" });
  return out;
}

const moeda = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
export const dinheiro = (n: number): string => moeda.format(n || 0);
export const qtd = (n: number): string => (n || 0).toLocaleString("pt-PT", { maximumFractionDigits: 4 });
