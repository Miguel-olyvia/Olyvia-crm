// A pesquisa e os filtros de cada lista do Inventário (portados do mockup), sem React. A ordenação é de quem desenha a tabela (TabelaInv.tsx).
import { armazem, nomeForn, nomeProd, produto } from "./base";
import { estadoStock, type EstadoStock } from "./contadores";
import { ecEstado, ecProntas, origemTexto, type EstadoEc } from "./ec";
import { resumoGuia } from "./guias";
import { poLate, poPublished, poStatus, ultimaRececao } from "./po";
import type { Ec, Fornecedor, Guia, Contagem, Inventario, LinhaStock, Movimento, Po, TipoMov } from "./tipos";

export type EstadoPoFiltro = "all" | "pending" | "ordered" | "partial" | "received" | "cancelled" | "late" | "portal";
export interface FiltrosPo { q: string; status: EstadoPoFiltro; sup: string; campoData: "date" | "real"; de: string; ate: string; eliminadas: boolean }
export interface FiltrosStock { q: string; cat: string; sub: string; wh: string; state: "" | EstadoStock; vista: "product" | "wh"; eliminadas: boolean; transferencias: boolean }
export interface FiltrosMov { q: string; type: "" | TipoMov; wh: string; doc: string; de: string; ate: string; limite: number }
export interface FiltrosEc { q: string; status: "" | EstadoEc; wh: string; de: string; ate: string; prontas: boolean; eliminadas: boolean }
export interface FiltrosForn { q: string; estado: "" | "active" | "inactive"; precos: boolean; aguardam: boolean; catalogo: boolean; eliminados: boolean }
export interface FiltrosGuia { estado: "all" | "open" | "closed" | "cancelled" | "div" }
export interface FiltrosCont { estado: "" | "open" | "final" | "cancelled" }
export interface FiltrosInv { po: FiltrosPo; stock: FiltrosStock; mov: FiltrosMov; ec: FiltrosEc; forn: FiltrosForn; guia: FiltrosGuia; cont: FiltrosCont }

export const FILTROS_VAZIOS: FiltrosInv = {
  po: { q: "", status: "all", sup: "", campoData: "date", de: "", ate: "", eliminadas: false },
  stock: { q: "", cat: "", sub: "", wh: "", state: "", vista: "product", eliminadas: false, transferencias: false },
  mov: { q: "", type: "", wh: "", doc: "", de: "", ate: "", limite: 40 },
  ec: { q: "", status: "", wh: "", de: "", ate: "", prontas: false, eliminadas: false },
  forn: { q: "", estado: "", precos: false, aguardam: false, catalogo: false, eliminados: false },
  guia: { estado: "all" },
  cont: { estado: "" },
};

const tem = (texto: string[], q: string): boolean => texto.join(" ").toLowerCase().includes(q);
const norm = (q: string): string => q.trim().toLowerCase();

/** As POs: por estado (inclui "atrasadas" e "no portal"), fornecedor, texto (nº, fornecedor, origem, cliente, produto, SKU, EAN) e datas. */
export function filtrarPos(db: Inventario, f: FiltrosPo): Po[] {
  const q = norm(f.q);
  let l = db.pos.filter((p) => (f.eliminadas ? true : !p.deleted));
  if (f.status === "late") l = l.filter(poLate);
  else if (f.status === "portal") l = l.filter((p) => !p.deleted && poPublished(p));
  else if (f.status !== "all") l = l.filter((p) => poStatus(p) === f.status);
  if (f.sup) l = l.filter((p) => p.sup === f.sup);
  if (q) l = l.filter((p) => tem([p.id, nomeForn(db, p.sup), p.origin.ref ?? "", p.origin.client ?? "", p.origin.ec ?? "", ...p.lines.map((x) => `${x.sku} ${nomeProd(db, x.sku)} ${produto(db, x.sku)?.ean ?? ""}`)], q));
  const data = (p: Po): string => (f.campoData === "date" ? p.date : ultimaRececao(p));
  if (f.de) l = l.filter((p) => !!data(p) && data(p) >= f.de);
  if (f.ate) l = l.filter((p) => !!data(p) && data(p) <= f.ate);
  return l;
}

export function filtrarStock(db: Inventario, f: FiltrosStock): LinhaStock[] {
  const q = norm(f.q);
  return db.stocks.filter((r) => {
    const p = produto(db, r.sku), w = armazem(db, r.wh);
    if (!p || !w) return false;
    if (!f.eliminadas && (r.deleted || w.deleted)) return false;
    if (q && !tem([p.sku, p.ean, p.name, ...p.codes], q)) return false;
    if (f.cat && p.cat !== f.cat) return false;
    if (f.sub && p.sub !== f.sub) return false;
    if (f.wh && r.wh !== f.wh) return false;
    return !f.state || estadoStock(db, r) === f.state;
  });
}

/** O livro, do mais recente para o mais antigo. */
export function filtrarMovs(db: Inventario, f: FiltrosMov): Movimento[] {
  const q = norm(f.q), d = norm(f.doc);
  return db.moves
    .filter((m) => (!f.type || m.type === f.type) && (!f.wh || m.wh === f.wh) && (!q || tem([m.sku, produto(db, m.sku)?.ean ?? "", nomeProd(db, m.sku)], q)) && (!d || m.doc.toLowerCase().includes(d)) && (!f.de || m.at.slice(0, 10) >= f.de) && (!f.ate || m.at.slice(0, 10) <= f.ate))
    .reverse();
}

export function filtrarEcs(db: Inventario, f: FiltrosEc): Ec[] {
  const q = norm(f.q);
  return db.ecs
    .filter((e) => (f.eliminadas || !e.deleted) && (!f.status || ecEstado(db, e) === f.status) && (!f.wh || e.wh === f.wh) && (!f.prontas || ecProntas(db, e) > 0) && (!f.de || e.date >= f.de) && (!f.ate || e.date <= f.ate)
      && (!q || tem([e.id, e.client, e.origin.ref ?? "", origemTexto(e), e.addr, ...e.lines.map((l) => (l.sku ?? "") + " " + (l.sku ? nomeProd(db, l.sku) : l.desc))], q)))
    .sort((a, b) => b.seq - a.seq);
}

export function filtrarForn(db: Inventario, f: FiltrosForn): Fornecedor[] {
  const q = norm(f.q);
  const precos = (id: string): number => db.prices.filter((c) => c.sup === id && c.state === "pending").length;
  const porLigar = (id: string): number => db.catalog.filter((c) => c.sup === id && c.state === "unlinked").length;
  return db.suppliers.filter((s) => (f.eliminados || !s.deleted) && (!f.estado || (f.estado === "active" ? s.active : !s.active)) && (!f.precos || precos(s.id) > 0)
    && (!f.aguardam || (s.portal === "invited" && s.awaiting)) && (!f.catalogo || porLigar(s.id) > 0) && (!q || tem([s.name, s.code, s.nif, s.city, s.email, s.contact], q)));
}

export function filtrarGuias(db: Inventario, f: FiltrosGuia): Guia[] {
  return db.guias
    .filter((g) => f.estado === "all" || (f.estado === "div" ? g.state === "open" && resumoGuia(db, g).div > 0 : g.state === f.estado))
    .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
}

export function filtrarContagens(db: Inventario, f: FiltrosCont): Contagem[] {
  return db.counts.filter((c) => !f.estado || c.state === f.estado).sort((a, b) => (b.started > a.started ? 1 : b.started < a.started ? -1 : 0));
}

/** Quantas guias há em cada filtro (para os números nos botões). */
export const contaGuias = (db: Inventario, estado: FiltrosGuia["estado"]): number => filtrarGuias(db, { estado }).length;
