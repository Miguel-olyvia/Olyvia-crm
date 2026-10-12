// O que a lista e a ficha do fornecedor mostram: o cumprimento do prazo (SLA) e o que há por decidir. O histórico anterior à seed é de exemplo (como no mockup).
import { diasEntre } from "./base";
import { poOpen, ultimaRececao } from "./po";
import type { AlteracaoPreco, Fornecedor, Inventario, ItemCatalogo } from "./tipos";

const SLA_HIST: Record<string, { rec: number; inn: number; late: number }> = {
  alfa: { rec: 41, inn: 38, late: 12 }, beta: { rec: 18, inn: 14, late: 19 }, gama: { rec: 25, inn: 22, late: 9 }, delta: { rec: 12, inn: 8, late: 31 }, eps: { rec: 30, inn: 29, late: 2 }, zeta: { rec: 16, inn: 14, late: 7 },
};

export interface Sla { rec: number; inn: number; out: number; pct: number; avg: number }
/** O histórico de exemplo mais as encomendas recebidas desde então: dentro do prazo quando a última receção não passou da entrega prevista. */
export function slaStats(db: Inventario, sid: string): Sla {
  const h = SLA_HIST[sid] ?? { rec: 0, inn: 0, late: 0 };
  let { rec, inn, late } = h;
  for (const p of db.pos.filter((x) => x.sup === sid && !x.deleted && x.receipts.some((r) => r.state === "Ativa"))) {
    rec++;
    const atraso = Math.max(0, diasEntre(p.due, ultimaRececao(p)));
    if (!atraso) inn++;
    late += atraso;
  }
  return { rec, inn, out: rec - inn, pct: rec ? (inn / rec) * 100 : 0, avg: rec ? late / rec : 0 };
}

export const precosPorAprovar = (db: Inventario, sid: string): AlteracaoPreco[] => db.prices.filter((c) => c.sup === sid && c.state === "pending");
export const catalogoPorLigar = (db: Inventario, sid: string): ItemCatalogo[] => db.catalog.filter((c) => c.sup === sid && c.state === "unlinked");
export const posAbertas = (db: Inventario, sid: string): number => db.pos.filter((p) => p.sup === sid && poOpen(p)).length;
/** A margem de venda sobre o custo, em %: para ver se um preço novo a come. */
export const margem = (venda: number, custo: number): number => (venda ? ((venda - custo) / venda) * 100 : 0);
export const portalTexto = (s: Fornecedor): string => (s.portal === "invited" && s.awaiting ? "Convidado · à espera da ficha" : { none: "Sem acesso", invited: "Convidado", active: "Ativo", revoked: "Revogado" }[s.portal]);
/** A cor do selo do portal: convidado à espera da ficha, convidado, ativo, revogado ou sem acesso. */
export const portalTom = (s: Fornecedor): "ok" | "info" | "bad" | "neu" => ({ none: "neu", invited: "info", active: "ok", revoked: "bad" } as const)[s.portal];
