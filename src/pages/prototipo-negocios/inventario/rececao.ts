// A receção por código no telemóvel (rpc_receiving_lookup · rpc_receive_by_code · fn_receiving_open_lines · fn_po_receipt_allocation): ler um código, escolher a guia e a PO,
// encher o cesto, repartir o que chega entre a EC e o stock, a fila sem rede e aprender códigos. Portado do mockup (RC, rcPlan, rcScan, rcAdd, rcConfirm, learnGo). Sem React.
import { agora, eur, exigir, falhar, guiaPorId, nomeArm, nomeProd, produto, proximoId, ecPorId, poPorId } from "./base";
import { repartirRececao } from "./ec";
import { poOpen, poRem } from "./po";
import { receberLinhas } from "./receber";
import { can } from "./perfil";
import type { Guia, Inventario, Po, PoLinha, Recepcao } from "./tipos";

/** O que uma ação da receção diz a quem a fez (o aviso do contexto). */
export interface AvisoRec { texto: string; erro?: boolean }

/** Os produtos que um código pode ser: SKU, EAN, código aprendido ou referência do fornecedor (lookupCode do mockup). */
export function procurarCodigo(db: Inventario, code: string): string[] {
  const c = String(code ?? "").trim().toLowerCase();
  if (!c) return [];
  const set = new Set<string>();
  for (const p of db.products) {
    if (p.deleted) continue;
    if (p.sku.toLowerCase() === c || p.ean === c || (p.codes ?? []).some((x) => x.toLowerCase() === c)) set.add(p.sku);
  }
  for (const i of db.items) if (i.ref.toLowerCase() === c) set.add(i.sku);
  return [...set];
}

/** "SKU — nome" (ou só o SKU ou o EAN) escrito num campo com lista → o SKU, ou null (parseProd do mockup). */
export function produtoDeTexto(db: Inventario, v: string): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const sku = t.split(" — ")[0].trim();
  const lc = sku.toLowerCase();
  return db.products.find((p) => p.sku.toLowerCase() === lc || p.ean === sku)?.sku ?? null;
}

/** RCset do mockup: muda a receção; escolher uma guia traz o fornecedor e o armazém dela. */
export function fixarRececao(db: Inventario, o: Partial<Recepcao>): void {
  Object.assign(db.rc, o);
  if (o.guia) {
    const g = guiaPorId(db, o.guia);
    if (g) { db.rc.sup = g.sup; db.rc.wh = g.wh; }
  }
}

/** As linhas de PO abertas onde o produto cabe, da encomenda mais antiga para a mais recente (FIFO). */
export function candidatas(db: Inventario, sku: string): [Po, PoLinha][] {
  const rc = db.rc;
  const g = rc.guia ? guiaPorId(db, rc.guia) : null;
  const sup = g ? g.sup : rc.sup;
  const out: [Po, PoLinha][] = [];
  db.pos.filter((p) => poOpen(p) && (!sup || p.sup === sup) && (!rc.poFilter || p.id === rc.poFilter))
    .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0))
    .forEach((p) => p.lines.forEach((l) => { if (l.sku === sku && poRem(l) > 0) out.push([p, l]); }));
  return out;
}

export interface AlocacaoRec { p: Po; l: PoLinha; qty: number; toEC: number; toStock: number; ec?: string; inactive?: boolean }
export interface ItemPlano { it: Recepcao["basket"][number]; allocs: AlocacaoRec[]; rest: number }
export interface PlanoRececao { items: ItemPlano[]; errors: string[]; warns: string[]; infos: string[] }

/** O que o cesto vai fazer: a repartição por PO, os erros (nunca mais do que falta), os avisos que exigem confirmação e as notas. */
export function planoRececao(db: Inventario): PlanoRececao {
  const rc = db.rc;
  const usado: Record<string, number> = {};
  const items: ItemPlano[] = [];
  const errors: string[] = [], warns: string[] = [], infos: string[] = [];
  const g = rc.guia ? guiaPorId(db, rc.guia) : null;
  for (const it of rc.basket) {
    let cands = candidatas(db, it.sku);
    if (it.line) { const [pid, lid] = it.line.split("|"); cands = cands.filter(([p, l]) => p.id === pid && l.id === lid); }
    let rest = it.qty;
    const allocs: AlocacaoRec[] = [];
    for (const [p, l] of cands) {
      if (!rest) break;
      const free = poRem(l) - (usado[l.id] ?? 0);
      if (free <= 0) continue;
      const n = Math.min(rest, free);
      const usedEC = usado["ec" + l.id] ?? 0;
      const sp = repartirRececao(db, l, n, usedEC);
      usado[l.id] = (usado[l.id] ?? 0) + n;
      usado["ec" + l.id] = usedEC + sp.toEC;
      rest -= n;
      allocs.push({ p, l, qty: n, toEC: sp.toEC, toStock: sp.toStock, ec: sp.ec, inactive: sp.inactive });
    }
    if (rest > 0) errors.push(`Sem encomenda aberta para ${rest} un de ${nomeProd(db, it.sku)}${cands.length ? " (nunca mais do que falta)" : g || rc.sup ? " deste fornecedor" : ""}. Reduza a quantidade.`);
    allocs.filter((a) => a.inactive).forEach((a) => warns.push(`EC ${a.ec} inativa: ${a.qty} un de ${nomeProd(db, it.sku)} entram como stock livre.`));
    if (g && !g.ann.some((a) => a.sku === it.sku)) warns.push(`${nomeProd(db, it.sku)} não está anunciado na guia ${g.id}.`);
    allocs.filter((a) => a.toEC && a.ec && ecPorId(db, a.ec) && ecPorId(db, a.ec)?.wh !== rc.wh)
      .forEach((a) => infos.push(`${a.toEC} un para ${a.ec} (expede de ${nomeArm(db, ecPorId(db, a.ec)?.wh ?? "")}): é criado um pedido de transferência.`));
    items.push({ it, allocs, rest });
  }
  return { items, errors, warns, infos };
}

/** rcAdd: mais `n` do produto no cesto (soma se já lá estiver sem linha escolhida) e limpa a confirmação e o resultado anteriores. */
export function adicionarAoCesto(db: Inventario, sku: string, n = 1): void {
  const rc = db.rc;
  const b = rc.basket.find((x) => x.sku === sku && !x.line);
  if (b) b.qty += n; else rc.basket.push({ key: proximoId(db, "B"), sku, qty: n, line: "" });
  rc.ack = false;
  rc.result = null;
}

export type Leitura = { t: "aviso"; aviso: AvisoRec } | { t: "varios"; code: string; skus: string[] };

/** rcScan: lê um código. Sem permissão não regista; sem rede fica na fila; desconhecido fica nas leituras não aceites; vários produtos pedem escolha. */
export function lerCodigo(db: Inventario, codigo: string): Leitura | null {
  const code = String(codigo ?? "").trim();
  if (!code) return null;
  if (!can("inventory.receive")) return { t: "aviso", aviso: { texto: "Modo consulta: sem permissão para receber.", erro: true } };
  const rc = db.rc;
  if (!rc.net) { rc.queued.push({ code, at: agora(db) }); return { t: "aviso", aviso: { texto: "Sem rede: leitura guardada em “por processar”." } }; }
  const m = procurarCodigo(db, code);
  if (!m.length) { rc.rejected.unshift({ code, at: agora(db) }); return { t: "aviso", aviso: { texto: "Código não reconhecido: " + code, erro: true } }; }
  if (m.length > 1) return { t: "varios", code, skus: m };
  adicionarAoCesto(db, m[0]);
  return null;
}

/** Ajusta a quantidade de um item do cesto (mínimo 1; limpa a confirmação). */
export function mudarQuantidade(db: Inventario, k: number, qty: number): void {
  const b = db.rc.basket[k];
  if (!b || !Number.isFinite(qty) || qty < 1) return;
  b.qty = Math.floor(qty);
  db.rc.ack = false;
}

/** rcConfirm: recebe o cesto nas POs (FIFO), repartindo entre EC e stock. Sem rede fica "por confirmar". Devolve o aviso a mostrar. */
export function confirmarCesto(db: Inventario): AvisoRec {
  const rc = db.rc;
  const plano = planoRececao(db);
  if (!can("inventory.receive")) return { texto: "Modo consulta.", erro: true };
  if (!rc.basket.length) return { texto: "O cesto está vazio.", erro: true };
  if (plano.errors.length) return { texto: plano.errors[0], erro: true };
  if (plano.warns.length && !rc.ack) return { texto: "Marque “Confirmo que recebo mesmo assim”.", erro: true };
  if (!rc.net) {
    rc.toConfirm.push({ items: rc.basket.map((b) => ({ sku: b.sku, qty: b.qty })), at: agora(db), err: "Sem rede ao confirmar" });
    rc.basket = [];
    return { texto: "Sem rede: receção guardada em “por confirmar”.", erro: true };
  }
  exigir("inventory.receive", "receber mercadoria");
  const porPo: Record<string, Record<string, number>> = {};
  for (const x of plano.items) for (const a of x.allocs) { const m = (porPo[a.p.id] = porPo[a.p.id] ?? {}); m[a.l.id] = (m[a.l.id] ?? 0) + a.qty; }
  const sum = { ec: {} as Record<string, number>, st: 0, n: 0, avg: [] as string[] };
  for (const pid of Object.keys(porPo)) {
    const p = poPorId(db, pid) ?? falhar("Encomenda inexistente: " + pid);
    const out = receberLinhas(db, p, Object.entries(porPo[pid]).map(([lineId, qty]) => ({ lineId, qty })), rc.wh, rc.guia || null);
    for (const r of out.res) {
      sum.n += r.qty; sum.st += r.toStock;
      if (r.toEC && r.ec) sum.ec[r.ec] = (sum.ec[r.ec] ?? 0) + r.toEC;
      rc.session.unshift({ at: r.at, t: `${pid} · ${r.qty}× ${nomeProd(db, r.sku)}${r.toEC ? ` · ${r.toEC} para ${r.ec}` : ""}${r.toStock ? ` · ${r.toStock} para stock` : ""}` });
      const pr = r.toStock ? produto(db, r.sku) : undefined;
      if (pr) sum.avg.push(`${pr.name}: custo médio ${eur(out.custoAntes[r.sku])} → ${eur(pr.avg)}`);
    }
  }
  rc.basket = [];
  rc.ack = false;
  rc.result = { n: sum.n, ec: sum.ec, st: sum.st, avg: sum.avg };
  return { texto: `Receção confirmada: ${sum.n} un.` };
}

/** learnGo (rpc_product_code_learn): associa um código a um produto; se vinha das leituras não aceites, sai de lá e o produto vai para o cesto. */
export function aprenderCodigo(db: Inventario, code: string, sku: string, k: number | null): void {
  exigir("inventory.receive");
  const p = produto(db, sku) ?? falhar("Produto desconhecido: " + sku);
  p.codes = p.codes ?? [];
  if (!p.codes.includes(code)) p.codes.push(code);
  if (k != null) db.rc.rejected.splice(k, 1);
  if (k != null) adicionarAoCesto(db, sku);
}

/** O que a guia diz de si na receção: anunciado × recebido e a lista do que veio anunciado. */
export const textoAnunciado = (g: Guia): string => g.ann.map((a) => `${a.qty}× ${a.sku}`).join(", ");

