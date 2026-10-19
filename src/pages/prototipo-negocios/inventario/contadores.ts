// Os números do Hoje e dos separadores: a fila de trabalho, os KPI e o estado de cada linha de stock. Calculados da base, nunca guardados.
import { HOJE, armazem, diasEntre, fornecedor, produto } from "./base";
import { ecEstado, ecProntas, livreEm, reservadoEm, reservas } from "./ec";
import { resumoGuia } from "./guias";
import { poLate, poOpen, poOpenValue, poRecebivel, poStatus } from "./po";
import { grupoRececao } from "./rececaoLista";
import type { Inventario, LinhaStock } from "./tipos";

export type EstadoStock = "low" | "ok" | "high";
export const ESTADOS_STOCK: Record<EstadoStock, string> = { low: "Baixo", ok: "Normal", high: "Excesso" };

/** Baixo: o stock livre (sem reservas) está abaixo do ponto de encomenda. Excesso: acima do máximo.
 *  As carrinhas (armazéns móveis da Frota) nunca ficam "baixo" aqui: repõem-se por transferência, não por compra; a falta delas vê-se na Frota. */
export function estadoStock(db: Inventario, r: LinhaStock): EstadoStock {
  if (r.rop > 0 && armazem(db, r.wh)?.tipo !== "viatura" && r.qty - reservadoEm(db, r.sku, r.wh) < r.rop) return "low";
  if (r.max > 0 && r.qty > r.max) return "high";
  return "ok";
}

export interface Contadores {
  pending: number; ordered: number; partialPO: number; late: number; portalUnseen: number; portalConfirmed: number; openValue: number;
  ecOpen: number; ecReady: number; ecNoSup: number; ecWaiting: number; ecPartial: number; transfers: number; awaiting: number; catUnlinked: number; prices: number;
  low: number; stalled: number; countsOpen: number; guiasOpen: number; guiasDiv: number; reservedUnits: number; stockValue: number; excess: number;
  /** 19/10: as POs por receber na Receção (poRecebivel) e as que chegam hoje/amanhã (o grupo 0 da Receção). */
  porReceber: number; chegamHoje: number;
}

export function contadores(db: Inventario): Contadores {
  const pos = db.pos.filter((p) => !p.deleted);
  const ecs = db.ecs.filter((e) => !e.deleted);
  const fornAtivo = (sid: string): boolean => { const s = fornecedor(db, sid); return !!s && !s.deleted; };
  // o stock baixo (a encomendar) não conta as carrinhas da Frota; o valor do stock conta-as (são inventário da empresa)
  const baixos = new Set(db.stocks.filter((s) => !s.deleted && armazem(db, s.wh) && !armazem(db, s.wh)?.deleted && armazem(db, s.wh)?.tipo !== "viatura" && s.rop > 0 && livreEm(db, s.sku, s.wh) < s.rop).map((s) => s.sku + "|" + s.wh));
  const custo = (sku: string): number => produto(db, sku)?.avg || produto(db, sku)?.cost || 0;
  return {
    pending: pos.filter((p) => p.status === "pending").length,
    ordered: pos.filter((p) => poStatus(p) === "ordered").length,
    partialPO: pos.filter((p) => poStatus(p) === "partial").length,
    late: pos.filter(poLate).length,
    portalUnseen: pos.filter((p) => poOpen(p) && p.portal.state === "sent").length,
    portalConfirmed: pos.filter((p) => poOpen(p) && p.portal.state === "confirmed").length,
    openValue: pos.filter(poOpen).reduce((s, p) => s + poOpenValue(p), 0),
    ecOpen: ecs.filter((e) => ecEstado(db, e) !== "full").length,
    ecReady: ecs.filter((e) => ecProntas(db, e) > 0).length,
    ecNoSup: ecs.filter((e) => ecEstado(db, e) === "nosup").length,
    ecWaiting: ecs.filter((e) => ecEstado(db, e) === "waiting").length,
    ecPartial: ecs.filter((e) => ecEstado(db, e) === "partial").length,
    transfers: db.transfers.filter((t) => t.state === "pending").length,
    awaiting: db.suppliers.filter((s) => !s.deleted && s.portal === "invited" && s.awaiting).length,
    catUnlinked: db.catalog.filter((c) => c.state === "unlinked" && fornAtivo(c.sup)).length,
    prices: db.prices.filter((c) => c.state === "pending" && fornAtivo(c.sup)).length,
    low: baixos.size,
    stalled: db.counts.filter((c) => c.state === "open" && diasEntre(c.last, HOJE) >= 7).length,
    countsOpen: db.counts.filter((c) => c.state === "open").length,
    guiasOpen: db.guias.filter((g) => g.state === "open").length,
    guiasDiv: db.guias.filter((g) => g.state === "open" && resumoGuia(db, g).div > 0).length,
    reservedUnits: Object.values(reservas(db).res).reduce((a, b) => a + b, 0),
    stockValue: db.stocks.filter((s) => !s.deleted).reduce((a, s) => a + s.qty * custo(s.sku), 0),
    excess: db.stocks.filter((s) => !s.deleted && s.max > 0 && s.qty > s.max).length,
    porReceber: db.pos.filter(poRecebivel).length,
    chegamHoje: db.pos.filter((p) => poRecebivel(p) && grupoRececao(p) === 0).length,
  };
}
