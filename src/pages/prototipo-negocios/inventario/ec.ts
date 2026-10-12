// As Encomendas Clientes (EC): reserva FIFO do stock, o que falta vai para a PO do fornecedor preferencial, saídas e anulações. Portado do mockup. Sem React.
import { UTILIZADOR, agora, armazem, ecPorId, ehInteiro, exigirMotivo, falhar, mudou, nomeArm, nomeProd, pad, poPorId, produto, proximoId } from "./base";
import { artigoPreferido, enviarPo, linhaDeArtigo, novaPo, poOpen, poRem } from "./po";
import { aplicarMovimentos, armazemServe, qtyAt, transferir } from "./stock";
import type { Ec, EcLinha, Inventario, Po, PoLinha, Transferencia } from "./tipos";

export type EstadoLinhaEc = "served" | "recvpo" | "waitpo" | "ready" | "partial" | "missing" | "nosup" | "service" | "void";
export type EstadoEc = "full" | "partial" | "waiting" | "nosup" | "deleted";
export interface Derivado { poQty: number; recvPO: number; poOut: number; links: [Po, PoLinha][] }
export interface InfoLinha { st: EstadoLinhaEc; ready: number; want: number; missing: number; notReady: number; nosup: number; d: Derivado; tr?: Transferencia; served: number }
interface Reserva { res: Record<string, number>; resBy: Record<string, string[]>; ready: Record<string, number> }

export const EC_ESTADOS: Record<EstadoEc, string> = { full: "Totalmente servido", partial: "Parcialmente pendente", waiting: "A aguardar encomenda", nosup: "Sem fornecedor", deleted: "Eliminada" };
export const EC_LINHA_ESTADOS: Record<EstadoLinhaEc, string> = {
  served: "Servido", recvpo: "Recebido PO", waitpo: "A aguardar PO", ready: "Pronto a sair", partial: "Parcial", missing: "Em falta", nosup: "Sem fornecedor", service: "Serviço", void: "Anulado",
};

export function origemTexto(e: Ec): string {
  const o = e.origin;
  return o.k === "CT" ? "Contrato " + o.ref : o.k === "VD" ? "Venda direta " + o.ref : o.k === "PR" ? "Proposta " + o.ref : "Manual";
}
export const ecValor = (e: Ec): number => e.lines.reduce((a, l) => a + l.qty * (l.price || 0), 0);

/** A ligação EC ↔ linhas de PO é derivada (nunca duplicada em estado). */
export function poLinhasDe(db: Inventario, lineId: string): [Po, PoLinha][] {
  const out: [Po, PoLinha][] = [];
  for (const p of db.pos) {
    if (p.deleted) continue;
    for (const pl of p.lines) if (pl.ecLine === lineId) out.push([p, pl]);
  }
  return out;
}
export function ecDerivado(db: Inventario, l: EcLinha): Derivado {
  let po = 0, rec = 0;
  const links = poLinhasDe(db, l.id);
  for (const [, pl] of links) { po += pl.ecUnits; rec += pl.ecRecv; }
  return { poQty: po, recvPO: rec, poOut: po - rec, links };
}

/** Quanto de uma receção serve a EC e quanto vai para stock (a EC inativa não recebe nada). */
export function repartirRececao(db: Inventario, pl: PoLinha, qty: number, usado = 0): { toEC: number; toStock: number; inactive?: boolean; ec?: string } {
  if (!pl.ecLine || !pl.ec) return { toEC: 0, toStock: qty };
  const e = ecPorId(db, pl.ec);
  const el = e?.lines.find((x) => x.id === pl.ecLine);
  if (!e || e.deleted || !el || el.voided) return { toEC: 0, toStock: qty, inactive: true, ec: pl.ec };
  const precisa = Math.max(0, pl.ecUnits - pl.ecRecv - usado);
  const toEC = Math.min(qty, precisa);
  return { toEC, toStock: qty - toEC, ec: pl.ec };
}

let cache: { db: Inventario; v: number; data: Reserva } | null = null;
/** A reserva FIFO por data de criação: cada linha reserva o que quer (stock + recebido da PO − servido) do stock físico do armazém de expedição. */
export function reservas(db: Inventario): Reserva {
  if (cache && cache.db === db && cache.v === db.v) return cache.data;
  const avail: Record<string, number> = {};
  const data: Reserva = { res: {}, resBy: {}, ready: {} };
  const lista = db.ecs.filter((e) => !e.deleted).sort((a, b) => a.seq - b.seq);
  for (const e of lista) for (const l of e.lines) {
    if (!l.sku || l.voided) continue;
    const want = Math.max(0, l.stockQty + ecDerivado(db, l).recvPO - l.served);
    if (!want) continue;
    const k = l.sku + "|" + e.wh;
    if (!(k in avail)) avail[k] = armazemServe(db, e.wh) ? qtyAt(db, l.sku, e.wh) : 0;
    data.ready[l.id] = Math.min(want, Math.max(0, avail[k]));
    avail[k] -= want;
    data.res[k] = (data.res[k] || 0) + want;
    const por = (data.resBy[k] = data.resBy[k] || []);
    if (!por.includes(e.id)) por.push(e.id);
  }
  cache = { db, v: db.v, data };
  return data;
}
export const reservadoEm = (db: Inventario, sku: string, wh: string): number => reservas(db).res[sku + "|" + wh] || 0;
export const livreEm = (db: Inventario, sku: string, wh: string): number => qtyAt(db, sku, wh) - reservadoEm(db, sku, wh);

const SEM_DERIVADO: Derivado = { poQty: 0, recvPO: 0, poOut: 0, links: [] };
export function ecLinhaInfo(db: Inventario, e: Ec, l: EcLinha): InfoLinha {
  const base = { ready: 0, want: 0, missing: 0, notReady: 0, nosup: 0, d: SEM_DERIVADO, served: l.served };
  if (!l.sku) return { ...base, st: "service" };
  if (l.voided) return { ...base, st: "void" };
  const d = ecDerivado(db, l);
  const ready = e.deleted ? 0 : reservas(db).ready[l.id] || 0;
  const want = Math.max(0, l.stockQty + d.recvPO - l.served);
  const missing = Math.max(0, l.qty - l.stockQty - d.poQty - l.nosupQty);
  const tr = db.transfers.find((t) => t.state === "pending" && t.ec === e.id && t.sku === l.sku);
  let st: EstadoLinhaEc;
  if (l.served >= l.qty) st = "served";
  else if (ready > 0 && ready >= l.qty - l.served) st = d.recvPO > 0 ? "recvpo" : "ready";
  else if (l.nosupQty > 0 && !ready && !d.poOut && !l.served) st = "nosup";
  else if (l.served > 0 || ready > 0) st = "partial";
  else if (d.poOut > 0) st = "waitpo";
  else st = "missing";
  return { st, ready, want, missing, notReady: Math.max(0, want - ready), nosup: l.nosupQty, d, tr, served: l.served };
}

export function ecEstado(db: Inventario, e: Ec): EstadoEc {
  if (e.deleted) return "deleted";
  const ls = e.lines.filter((l) => l.sku && !l.voided);
  if (!ls.length || ls.every((l) => l.served >= l.qty)) return "full";
  if (ls.some((l) => l.nosupQty > 0 && l.served < l.qty)) return "nosup";
  const infos = ls.map((l) => ecLinhaInfo(db, e, l));
  if (infos.some((i) => i.ready > 0 || i.served > 0)) return "partial";
  if (infos.some((i) => i.d.poOut > 0)) return "waiting";
  return "partial";
}
export const ecProntas = (db: Inventario, e: Ec): number => (e.deleted ? 0 : e.lines.filter((l) => l.sku && !l.voided && (reservas(db).ready[l.id] || 0) > 0).length);

/** As quatro fatias do progresso de uma EC: servido, em stock (reservado), à espera de PO e em falta. */
export function ecSegmentos(db: Inventario, e: Ec): { s: number; st: number; po: number; mi: number; tot: number } {
  let s = 0, st = 0, po = 0, mi = 0;
  for (const l of e.lines) {
    if (!l.sku || l.voided) continue;
    const i = ecLinhaInfo(db, e, l);
    s += Math.min(l.served, l.qty);
    st += i.ready;
    po += Math.max(0, i.d.poOut);
    mi += Math.max(0, l.qty - Math.min(l.served, l.qty) - i.ready - Math.max(0, i.d.poOut));
  }
  return { s, st, po, mi, tot: s + st + po + mi };
}

type LinhaPedida = { sku?: string | null; qty: number; desc?: string; price?: number; fromKit?: string };
/** Os pacotes expandem-se nos componentes. */
function expandirLinhas(db: Inventario, lines: LinhaPedida[]): LinhaPedida[] {
  const exp: LinhaPedida[] = [];
  for (const ln of lines) {
    const p = ln.sku ? produto(db, ln.sku) : undefined;
    if (p?.kit) for (const c of p.kit) exp.push({ sku: c.sku, qty: c.qty * ln.qty, desc: "", fromKit: p.name, price: produto(db, c.sku)?.sale });
    else exp.push(ln);
  }
  return exp;
}

/** Junta a quantidade que falta à PO pendente do fornecedor preferencial (uma por fornecedor e origem). */
function juntarAPo(db: Inventario, e: Ec, l: EcLinha, it: NonNullable<ReturnType<typeof artigoPreferido>>, units: number, criadas: Set<string>): void {
  const ref = e.origin.ref || e.id;
  let p = db.pos.find((x) => !x.deleted && x.sup === it.sup && x.originKey === ref && x.status === "pending");
  if (!p) p = novaPo(db, { sup: it.sup, origin: { k: e.origin.k === "manual" ? "EC" : e.origin.k, ref, client: e.client, ec: e.id }, wh: e.wh, auto: true });
  const packs = Math.ceil(units / it.packN);
  p.lines.push(linhaDeArtigo(db, it, packs, { id: e.id, line: l.id, units }));
  p.log.push({ at: agora(db), t: `Linha ${l.sku}: ${packs} × ${it.unitLabel} (= ${packs * it.packN} un) para ${e.id}` });
  criadas.add(p.id);
  mudou(db);
}

/** Atribui a uma linha o que falta: primeiro o stock livre, depois a PO do preferencial, senão "sem fornecedor". */
export function atribuirLinha(db: Inventario, e: Ec, l: EcLinha, criadas: Set<string>): void {
  mudou(db);
  const falta = l.qty - l.stockQty - ecDerivado(db, l).poQty - l.nosupQty;
  if (falta <= 0 || !l.sku) return;
  const livre = armazemServe(db, e.wh) ? Math.max(0, livreEm(db, l.sku, e.wh)) : 0;
  const doStock = Math.min(falta, livre);
  l.stockQty += doStock;
  mudou(db);
  const resto = falta - doStock;
  if (resto <= 0) return;
  const it = artigoPreferido(db, l.sku);
  if (!it) l.nosupQty += resto;
  else juntarAPo(db, e, l, it, resto, criadas);
}

/** Com envio direto, as POs automáticas seguem logo para o fornecedor. */
export function enviarPosAutomaticas(db: Inventario, criadas: Set<string>): void {
  if (db.settings.autoPO !== "direct") return;
  for (const id of criadas) { const p = poPorId(db, id); if (p && p.status === "pending") enviarPo(db, p, { auto: true }); }
}

export interface PedidoEc { origin: Ec["origin"]; client: string; addr?: string; wh: string; notes?: string; lines: LinhaPedida[]; diag?: Ec["diag"] }
export function criarEc(db: Inventario, a: PedidoEc): Ec {
  if (!a.client || !a.client.trim()) falhar("Indique o cliente.");
  if (!armazem(db, a.wh) || armazem(db, a.wh)?.deleted) falhar("Escolha o armazém de expedição.");
  if (!armazemServe(db, a.wh)) falhar(nomeArm(db, a.wh) + " não serve clientes. Escolha outro armazém de expedição.");
  const validas = a.lines.filter((l) => l.sku || l.desc);
  if (!validas.length) falhar("Adicione pelo menos uma linha.");
  for (const l of validas) if (!ehInteiro(l.qty) || l.qty <= 0) falhar(`Quantidades inteiras e maiores que zero (${l.sku || l.desc}).`);
  const e: Ec = {
    id: "EC-" + pad(++db.n.ec), seq: ++db.seq, origin: a.origin, client: a.client.trim(), addr: a.addr ?? "", wh: a.wh, notes: a.notes ?? "", date: agora(db).slice(0, 10),
    deleted: false, diag: a.diag ?? null, lines: [], log: [],
  };
  db.ecs.push(e);
  mudou(db);
  const criadas = new Set<string>();
  for (const ln of expandirLinhas(db, validas)) {
    const l: EcLinha = {
      id: proximoId(db, "L"), sku: ln.sku || null, desc: ln.desc || "", qty: ln.qty, price: ln.price ?? (ln.sku ? produto(db, ln.sku)?.sale ?? 0 : 0),
      stockQty: 0, nosupQty: 0, served: 0, voided: false, fromKit: ln.fromKit ?? null, exits: [],
    };
    e.lines.push(l);
    if (l.sku) atribuirLinha(db, e, l, criadas);
  }
  e.log.push({ at: agora(db), t: "Criada (" + origemTexto(e) + ")" });
  enviarPosAutomaticas(db, criadas);
  mudou(db);
  return e;
}

/** "Pedir o que falta": volta a atribuir as linhas sem fornecedor ou em falta. */
export function pedirEmFalta(db: Inventario, e: Ec): { n: number; pos: string[] } {
  if (e.deleted) falhar("Encomenda eliminada.");
  const criadas = new Set<string>();
  let n = 0;
  for (const l of e.lines) {
    if (!l.sku || l.voided) continue;
    const antes = JSON.stringify([l.stockQty, l.nosupQty, ecDerivado(db, l).poQty]);
    l.nosupQty = 0;
    atribuirLinha(db, e, l, criadas);
    if (JSON.stringify([l.stockQty, l.nosupQty, ecDerivado(db, l).poQty]) !== antes) n++;
  }
  enviarPosAutomaticas(db, criadas);
  e.log.push({ at: agora(db), t: "Pedido o que falta: " + (criadas.size ? [...criadas].join(", ") : "sem novas encomendas") });
  return { n, pos: [...criadas] };
}

/** Confirma a saída de uma linha: no armazém de expedição só sai o que está reservado e pronto. */
export function sairLinha(db: Inventario, e: Ec, l: EcLinha, qty: number, wh: string): void {
  if (e.deleted) falhar("Encomenda eliminada.");
  if (!ehInteiro(qty) || qty <= 0) falhar("Quantidade inteira maior que zero.");
  if (!l.sku) return falhar("Linha de serviço: não tem stock.");
  const i = ecLinhaInfo(db, e, l);
  if (l.served >= l.qty) falhar("Linha já servida.");
  if (wh === e.wh) {
    if (qty > i.ready) falhar(`Só há ${i.ready} un prontas a sair em ${nomeArm(db, wh)} para esta linha (reserva FIFO).`);
  } else {
    if (qty > i.want) falhar(`A linha só tem ${i.want} un atribuídas.`);
    if (qty > Math.max(0, livreEm(db, l.sku, wh))) falhar("Stock livre insuficiente em " + nomeArm(db, wh) + ".");
  }
  const [m] = aplicarMovimentos(db, [{ type: "out", sku: l.sku, wh, qty, doc: e.id, note: e.client }]);
  l.served += qty;
  l.exits.push({ id: m.id, wh, qty, at: m.at, reverted: false });
  e.log.push({ at: agora(db), t: `Saída ${qty} un ${l.sku} de ${nomeArm(db, wh)}` });
}

export function reverterSaida(db: Inventario, e: Ec, l: EcLinha): void {
  const x = [...l.exits].reverse().find((z) => !z.reverted);
  if (!x || !l.sku) return falhar("Sem saídas para reverter.");
  aplicarMovimentos(db, [{ type: "in", sku: l.sku, wh: x.wh, qty: x.qty, doc: e.id, note: "Estorno de saída" }]);
  x.reverted = true;
  l.served -= x.qty;
  e.log.push({ at: agora(db), t: `Saída revertida: ${x.qty} un ${l.sku}` });
}

/** Elimina (manual ou venda direta) ou anula o contrato: estorna saídas, anula as POs ligadas e cancela as transferências pendentes. */
export function eliminarEc(db: Inventario, e: Ec, motivo: string, opts: { contrato?: boolean } = {}): void {
  if (!opts.contrato && !["manual", "VD"].includes(e.origin.k)) falhar("Só se eliminam encomendas manuais ou de venda direta. Para contratos, anule o contrato.");
  exigirMotivo(motivo);
  if (e.deleted) falhar("Já eliminada.");
  const estornos = e.lines.flatMap((l) => (l.sku ? l.exits.filter((x) => !x.reverted).map((x) => ({ type: "in" as const, sku: l.sku as string, wh: x.wh, qty: x.qty, doc: e.id, note: "Estorno: " + (opts.contrato ? "contrato anulado" : "EC eliminada") })) : []));
  if (estornos.length) aplicarMovimentos(db, estornos);
  for (const l of e.lines) { for (const x of l.exits) x.reverted = true; l.served = 0; }
  libertarPos(db, e, motivo);
  db.transfers.filter((t) => t.ec === e.id && t.state === "pending").forEach((t) => { t.state = "cancelled"; t.reason = "EC eliminada"; });
  e.deleted = true;
  e.deleteReason = motivo;
  e.deletedAt = agora(db);
  if (e.origin.k === "VD") { const vd = db.vds.find((v) => v.ref === e.origin.ref); if (vd) vd.state = "cancelled"; }
  e.log.push({ at: agora(db), t: (opts.contrato ? "Contrato anulado" : "Eliminada") + ": " + motivo });
}

/** As POs ligadas a uma EC eliminada: tira as linhas do rascunho e anula o resto das encomendadas. */
function libertarPos(db: Inventario, e: Ec, motivo: string): void {
  for (const p of db.pos) {
    if (p.deleted || !p.lines.some((pl) => pl.ec === e.id)) continue;
    if (p.status === "pending") {
      p.lines = p.lines.filter((pl) => pl.ec !== e.id);
      if (!p.lines.length) p.status = "cancelled";
      p.log.push({ at: agora(db), t: `Linhas de ${e.id} retiradas (EC eliminada)` });
    } else if (poOpen(p)) {
      const ids = p.lines.filter((pl) => pl.ec === e.id && poRem(pl) > 0).map((pl) => pl.id);
      for (const id of ids) {
        const pl = p.lines.find((x) => x.id === id);
        if (!pl) continue;
        const rem = poRem(pl);
        pl.cancelled += rem;
        pl.ecUnits = pl.ecRecv;
        p.cancels.push({ id: proximoId(db, "C"), batch: proximoId(db, "B"), lineId: id, sku: pl.sku, qty: rem, ecCut: 0, ec: e.id, reason: "EC eliminada", note: motivo, at: agora(db), user: UTILIZADOR, undone: false, locked: true });
      }
      if (ids.length) p.log.push({ at: agora(db), t: `Resto anulado: ${e.id} eliminada` });
    }
  }
}

/** Executa um pedido de transferência pendente e, se for para uma EC sem fornecedor, volta a atribuir as suas linhas. */
export function executarPedidoTransf(db: Inventario, t: Transferencia): void {
  if (t.state !== "pending") falhar("Pedido já tratado.");
  const livre = qtyAt(db, t.sku, t.from);
  if (livre < t.qty) falhar(`Insuficiente na origem: ${nomeArm(db, t.from)} tem ${livre} un de ${nomeProd(db, t.sku)}.`);
  transferir(db, t.sku, t.from, t.to, t.qty, { doc: t.id, note: t.ec ? "para " + t.ec : "" });
  t.state = "done";
  t.doneAt = agora(db);
  const e = t.ec ? ecPorId(db, t.ec) : undefined;
  if (!e || e.deleted) return;
  const criadas = new Set<string>();
  for (const l of e.lines.filter((x) => x.sku === t.sku && x.nosupQty)) { l.nosupQty = 0; atribuirLinha(db, e, l, criadas); }
  enviarPosAutomaticas(db, criadas);
}

/** Muda o armazém de expedição (só antes de haver saídas) e recalcula as reservas. */
export function mudarArmazemEc(db: Inventario, e: Ec, wh: string): void {
  if (e.lines.some((l) => l.served > 0)) falhar("Já há saídas.");
  if (!armazemServe(db, wh)) falhar("Armazém não serve clientes.");
  e.wh = wh;
  const criadas = new Set<string>();
  for (const l of e.lines) if (l.sku && !l.voided) { l.stockQty = 0; l.nosupQty = 0; }
  mudou(db);
  for (const l of e.lines) if (l.sku && !l.voided) atribuirLinha(db, e, l, criadas);
  enviarPosAutomaticas(db, criadas);
  e.log.push({ at: agora(db), t: "Armazém de expedição: " + nomeArm(db, wh) });
}

export interface VendaSimulada { kind: "CT" | "PR" | "VD"; client: string; addr: string; wh: string; lines: { sku: string; qty: number }[] }
/** A baixa por venda no momento definido: contrato assinado ou proposta aceite, nunca os dois. A outra origem não gera encomenda. */
export function simularVenda(db: Inventario, d: VendaSimulada): Ec {
  const ded = db.settings.deduction;
  if ((d.kind === "PR" && ded === "contract") || (d.kind === "CT" && ded === "proposal")) falhar("Com a definição atual esta origem não gera encomenda. Nada foi criado.");
  // O mockup numerava os contratos por contagem e repetia o CT-2026-043 da seed: aqui o número novo é sempre o seguinte ao maior que existe.
  const maiorCt = Math.max(0, ...db.ecs.filter((e) => e.origin.k === "CT").map((e) => Number(String(e.origin.ref).slice(-3)) || 0));
  const ref = d.kind === "VD" ? "VD-" + pad(20 + db.vds.length) : d.kind === "PR" ? "PR-2026-" + pad(300 + db.ecs.length, 3) : "CT-2026-" + pad(maiorCt + 1, 3);
  const proforma = d.kind === "VD" ? "PF-2026-" + pad(32 + db.vds.length) : null;
  const e = criarEc(db, { origin: { k: d.kind, ref, proforma }, client: d.client, addr: d.addr, wh: d.wh, lines: d.lines, diag: d.kind === "CT" ? { text: "Diagnóstico criado na simulação.", items: [] } : null });
  if (d.kind === "VD") db.vds.push({ ref, state: "confirmed" });
  return e;
}

/** Muda a quantidade de uma linha de EC manual: sobe atribui o que falta, desce corta primeiro o "sem fornecedor", depois o stock, depois a PO; nunca abaixo do servido. */
function ajustarQtdLinha(db: Inventario, e: Ec, l: EcLinha, q: number, criadas: Set<string>): void {
  if (!ehInteiro(q) || q < 1) falhar("Quantidades inteiras e maiores que zero.");
  if (q < l.served) falhar(`Linha ${l.sku} trancada: já saíram ${l.served} un.`);
  if (q > l.qty) { l.qty = q; atribuirLinha(db, e, l, criadas); return; }
  if (q === l.qty) return;
  let corte = l.qty - q;
  l.qty = q;
  const a = Math.min(corte, l.nosupQty);
  l.nosupQty -= a; corte -= a;
  const b = Math.min(corte, Math.max(0, l.stockQty - l.served));
  l.stockQty -= b; corte -= b;
  for (const [, pl] of ecDerivado(db, l).links) {
    if (!corte) break;
    const c = Math.min(corte, pl.ecUnits - pl.ecRecv);
    pl.ecUnits -= c; corte -= c;
  }
}

/** Edita uma EC manual (cabeçalho e linhas); as linhas já servidas ficam trancadas. */
export function editarEcManual(db: Inventario, e: Ec, cab: { client: string; addr: string; notes: string }, linhas: { id?: string; sku?: string; qty: number }[]): void {
  if (e.origin.k !== "manual") falhar("Só encomendas manuais podem ser editadas.");
  if (!cab.client || !cab.client.trim()) falhar("Indique o cliente.");
  Object.assign(e, { client: cab.client.trim(), addr: cab.addr, notes: cab.notes });
  const criadas = new Set<string>();
  for (const ch of linhas) {
    if (ch.id) { const l = e.lines.find((x) => x.id === ch.id); if (l) ajustarQtdLinha(db, e, l, ch.qty, criadas); continue; }
    if (!ch.sku) continue;
    if (!ehInteiro(ch.qty) || ch.qty < 1) falhar("Quantidades inteiras e maiores que zero.");
    for (const x of expandirLinhas(db, [{ sku: ch.sku, qty: ch.qty }])) {
      const l: EcLinha = { id: proximoId(db, "L"), sku: x.sku ?? null, desc: "", qty: x.qty, price: x.sku ? produto(db, x.sku)?.sale ?? 0 : 0, stockQty: 0, nosupQty: 0, served: 0, voided: false, fromKit: x.fromKit ?? null, exits: [] };
      e.lines.push(l);
      atribuirLinha(db, e, l, criadas);
    }
  }
  enviarPosAutomaticas(db, criadas);
  e.log.push({ at: agora(db), t: "Encomenda manual editada" });
}
