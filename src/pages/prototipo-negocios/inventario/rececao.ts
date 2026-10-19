// A receção por código no telemóvel (rpc_receiving_lookup · rpc_receive_by_code · fn_receiving_open_lines · fn_po_receipt_allocation): ler um código, escolher a guia e a PO,
// encher o cesto, repartir o que chega entre a EC e o stock, a fila sem rede e aprender códigos. Portado do mockup (RC, rcPlan, rcScan, rcAdd, rcConfirm, learnGo). Sem React.
import { agora, eur, exigir, falhar, guiaPorId, nomeArm, nomeForn, nomeProd, produto, proximoId, ecPorId, poPorId } from "./base";
import { repartirRececao } from "./ec";
import { poRecebivel, poRem } from "./po";
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

/** "Receber" numa PO (lista, folha, menu): a Receção com a PO escolhida, o fornecedor e o armazém dela; a guia só fica se for desse fornecedor. */
export function abrirRececaoDaPo(db: Inventario, p: Po): void {
  const g = db.rc.guia ? guiaPorId(db, db.rc.guia) : null;
  fixarRececao(db, { sup: p.sup, poFilter: p.id, wh: p.wh, guia: g && g.sup === p.sup && g.state === "open" ? g.id : "" });
}

/** 19/10: fechar o painel ou abrir o leitor deixa a Receção limpa (sem fornecedor, guia nem PO presos de uma receção anterior). */
export function limparRececao(db: Inventario): void { fixarRececao(db, { sup: "", guia: "", poFilter: "" }); }

/** O fornecedor que limita a receção por código: o da guia ou o da PO escolhida (19/10: nunca um rc.sup antigo). */
export function fornecedorDaRececao(db: Inventario): { sup: string; de: "guia" | "po" | "" } {
  const rc = db.rc;
  const g = rc.guia ? guiaPorId(db, rc.guia) : null;
  if (g) return { sup: g.sup, de: "guia" };
  const p = rc.poFilter ? poPorId(db, rc.poFilter) : undefined;
  return p ? { sup: p.sup, de: "po" } : { sup: "", de: "" };
}

/** As linhas de PO abertas onde o produto cabe, da encomenda mais antiga para a mais recente (FIFO). */
export function candidatas(db: Inventario, sku: string): [Po, PoLinha][] {
  const rc = db.rc;
  const sup = fornecedorDaRececao(db).sup;
  const out: [Po, PoLinha][] = [];
  db.pos.filter((p) => poRecebivel(p) && (!sup || p.sup === sup) && (!rc.poFilter || p.id === rc.poFilter))
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
    if (rest > 0) errors.push(`Sem encomenda aberta para ${rest} un de ${nomeProd(db, it.sku)}${cands.length ? " (nunca mais do que falta)" : g || rc.poFilter ? " deste fornecedor" : ""}. Reduza a quantidade.`);
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

/* ------------------------------------------------------------------ a barra de leitura (19/10) */
/** O que um texto lido ou escrito na barra da Receção quer dizer: uma PO (abre o painel), uma guia, um artigo, um fornecedor ou nada. */
export type LeituraRec =
  | { t: "po"; po: string; sku?: string }
  | { t: "guia"; guia: string; pos: string[] }
  | { t: "skus"; skus: string[]; pos: string[] }
  | { t: "pos"; pos: string[] }
  | { t: "forn"; sup: string }
  | { t: "nada"; aviso?: string };

const recebiveisCom = (db: Inventario, skus: readonly string[], sup?: string): Po[] =>
  db.pos.filter((p) => poRecebivel(p) && (!sup || p.sup === sup) && p.lines.some((l) => skus.includes(l.sku) && poRem(l) > 0));

/** As POs por receber de uma guia aberta: as do fornecedor com os artigos anunciados (ou todas do fornecedor, se nada bater). */
export function posDaGuia(db: Inventario, g: Guia): Po[] {
  const doForn = db.pos.filter((p) => poRecebivel(p) && p.sup === g.sup);
  const comArtigos = g.ann.length ? recebiveisCom(db, g.ann.map((a) => a.sku), g.sup) : [];
  return comArtigos.length ? comArtigos : doForn;
}

/** Resolve o que se leu na barra da Receção: nº da PO (inteiro ou os últimos dígitos), nº de uma guia, EAN/SKU/código aprendido/ref. do
 *  fornecedor (de QUALQUER fornecedor) ou o nome/código do fornecedor. Reaproveita poPorId, guiaPorId, procurarCodigo e nomeForn. */
export function resolverCodigoRececao(db: Inventario, texto: string): LeituraRec {
  const t = String(texto ?? "").trim();
  if (!t) return { t: "nada" };
  const lc = t.toLowerCase();
  // o número da PO, inteiro
  const p0 = poPorId(db, t.toUpperCase()) ?? db.pos.find((p) => p.id.toLowerCase() === lc);
  if (p0 && !p0.deleted) return poRecebivel(p0) ? { t: "po", po: p0.id } : { t: "nada", aviso: `${p0.id} já não está por receber.` };
  // a guia do fornecedor
  const g = guiaPorId(db, t) ?? db.guias.find((x) => x.id.toLowerCase() === lc);
  if (g) return g.state === "open" ? { t: "guia", guia: g.id, pos: posDaGuia(db, g).map((p) => p.id) } : { t: "nada", aviso: `A guia ${g.id} não está aberta.` };
  // os últimos dígitos do número da PO ("0146")
  if (/^\d{2,6}$/.test(t)) {
    const L = db.pos.filter((p) => poRecebivel(p) && p.id.replace(/\D/g, "").endsWith(t));
    if (L.length === 1) return { t: "po", po: L[0].id };
    if (L.length > 1) return { t: "pos", pos: L.map((p) => p.id) };
  }
  // um artigo: de qualquer fornecedor
  const skus = procurarCodigo(db, t);
  if (skus.length) {
    const L = recebiveisCom(db, skus);
    if (L.length === 1) return { t: "po", po: L[0].id, sku: skus.find((s) => L[0].lines.some((l) => l.sku === s && poRem(l) > 0)) };
    if (L.length > 1) return { t: "skus", skus, pos: L.map((p) => p.id) };
    return { t: "nada", aviso: `«${t}» é ${skus.map((s) => nomeProd(db, s)).join(" ou ")}, mas não há encomendas por receber com esse artigo.` };
  }
  // o fornecedor (nome, código ou id)
  const F = db.suppliers.filter((s) => !s.deleted && (s.id.toLowerCase() === lc || s.code.toLowerCase() === lc || (lc.length >= 3 && nomeForn(db, s.id).toLowerCase().includes(lc))));
  if (F.length === 1) return { t: "forn", sup: F[0].id };
  if (F.length > 1) return { t: "nada", aviso: `«${t}» serve ${F.length} fornecedores: escreva mais do nome.` };
  return { t: "nada" };
}

/** O que a guia diz de si na receção: anunciado × recebido e a lista do que veio anunciado. */
export const textoAnunciado = (g: Guia): string => g.ann.map((a) => `${a.qty}× ${a.sku}`).join(", ");

