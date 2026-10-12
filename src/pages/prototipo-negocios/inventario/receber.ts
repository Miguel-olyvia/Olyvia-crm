// A receção de mercadoria numa PO: parcial e com limites, repartida entre a EC e o stock; reverter, passar para stock e anular o resto. Portado do mockup.
import { UTILIZADOR, agora, armazem, ecPorId, ehInteiro, exigir, exigirMotivo, falhar, guiaPorId, mudou, nomeArm, nomeProd, produto, proximoId } from "./base";
import { ecDerivado, repartirRececao } from "./ec";
import { poOpen, poRem, poStatus, poStatusLabel, poUnits } from "./po";
import { aplicarMovimentos, criarPedidoTransf } from "./stock";
import type { Inventario, Po, PoLinha, PoRecibo } from "./tipos";

export interface ItemReceber { lineId: string; qty: number }
export interface ResultadoRececao { res: PoRecibo[]; custoAntes: Record<string, number> }

interface Plano { l: PoLinha; qty: number; sp: ReturnType<typeof repartirRececao> }

/** Valida as quantidades (inteiras, nunca mais do que falta) e calcula a repartição de cada linha. */
function planearRececao(db: Inventario, p: Po, items: ItemReceber[]): Plano[] {
  return items.map((it) => {
    const l = p.lines.find((x) => x.id === it.lineId);
    if (!l) return falhar("Linha inexistente.");
    if (!ehInteiro(it.qty)) falhar("Quantidades inteiras: " + nomeProd(db, l.sku) + ".");
    if (it.qty > poRem(l)) falhar(`Nunca mais do que falta: ${nomeProd(db, l.sku)} tem ${poRem(l)} un por receber.`);
    return { l, qty: it.qty, sp: repartirRececao(db, l, it.qty) };
  });
}

const notaMovimento = (x: Plano, guia: string | null): string =>
  (x.sp.toEC ? `${x.sp.toEC} un para ${x.sp.ec} (não ficam livres)` : "") + (x.sp.toEC && x.sp.toStock ? " · " : "") + (x.sp.toStock ? `${x.sp.toStock} un para stock` : "") + (guia ? " · guia " + guia : "");

/** Receção parcial: as unidades para a EC ficam reservadas, as outras entram livres (custo médio atualizado); uma EC que expede de outro armazém gera um pedido de transferência. */
export function receberLinhas(db: Inventario, p: Po, items: ItemReceber[], wh: string, guiaId: string | null, opts: { date?: string } = {}): ResultadoRececao {
  exigir("inventory.receive", "receber mercadoria");
  if (p.deleted) falhar("A encomenda está eliminada.");
  if (!poOpen(p)) falhar(`${p.id} não está em aberto (estado: ${poStatusLabel[poStatus(p)]}).`);
  if (!armazem(db, wh) || armazem(db, wh)?.deleted) falhar("Escolha o armazém de destino.");
  const g = guiaId ? guiaPorId(db, guiaId) : null;
  if (g && g.state !== "open") falhar(`A guia ${g.id} não está aberta.`);
  const its = items.filter((i) => i.qty > 0);
  if (!its.length) falhar("Indique pelo menos uma quantidade a receber.");
  const planos = planearRececao(db, p, its);
  const custoAntes: Record<string, number> = {};
  for (const x of planos) custoAntes[x.l.sku] = produto(db, x.l.sku)?.avg ?? 0;
  aplicarMovimentos(db, planos.map((x) => ({ type: "in" as const, sku: x.l.sku, wh, qty: x.qty, doc: p.id, note: notaMovimento(x, g?.id ?? null), cost: x.l.price / x.l.packN })));
  const at0 = opts.date ? opts.date + agora(db).slice(10) : agora(db);
  const res = planos.map((x) => registarRececao(db, p, x, wh, g?.id ?? null, at0));
  if (g && !g.pos.includes(p.id)) g.pos.push(p.id);
  if (g) g.history.push({ at: agora(db), t: `Receção de ${p.id}: ${res.map((r) => r.qty + "× " + r.sku).join(", ")}` });
  p.log.push({ at: agora(db), t: `Receção em ${nomeArm(db, wh)}: ${res.map((r) => r.qty + " un " + r.sku).join(", ")} → ${poStatusLabel[poStatus(p)]}` });
  mudou(db);
  return { res, custoAntes };
}

function registarRececao(db: Inventario, p: Po, x: Plano, wh: string, guia: string | null, at: string): PoRecibo {
  x.l.recv += x.qty;
  x.l.ecRecv += x.sp.toEC;
  const r: PoRecibo = {
    id: proximoId(db, "R"), at, lineId: x.l.id, sku: x.l.sku, type: "Receção", qty: x.qty, toEC: x.sp.toEC, toStock: x.sp.toStock, ec: x.sp.ec ?? null,
    inactive: !!x.sp.inactive, wh, guia, state: "Ativa", user: UTILIZADOR,
  };
  p.receipts.push(r);
  const e = x.sp.toEC && x.sp.ec ? ecPorId(db, x.sp.ec) : undefined;
  if (e && e.wh !== wh) criarPedidoTransf(db, { sku: x.l.sku, from: wh, to: e.wh, qty: x.sp.toEC, ec: e.id, auto: true });
  return r;
}

/** Reverte uma receção: sai do stock e falha se as unidades já saíram para o cliente. */
export function reverterRececao(db: Inventario, p: Po, rid: string, motivo: string): void {
  exigir("inventory.receive", "reverter receções");
  exigirMotivo(motivo);
  const r = p.receipts.find((x) => x.id === rid);
  if (!r || r.state !== "Ativa" || r.type !== "Receção") falhar("Receção não está ativa.");
  const l = p.lines.find((x) => x.id === r.lineId);
  if (!l) return falhar("Linha inexistente.");
  if (r.toEC && r.ec) {
    const e = ecPorId(db, r.ec);
    const el = e?.lines.find((x) => x.id === l.ecLine);
    if (e && !e.deleted && el && el.served > el.stockQty + ecDerivado(db, el).recvPO - r.toEC) falhar(`Estas unidades já saíram para o cliente em ${e.id}. Reverta a saída primeiro.`);
  }
  aplicarMovimentos(db, [{ type: "out", sku: r.sku, wh: r.wh, qty: r.qty, doc: p.id, note: "Reversão de receção: " + motivo }]);
  l.recv -= r.qty;
  l.ecRecv -= r.toEC;
  r.state = "Revertida";
  r.reason = motivo;
  p.log.push({ at: agora(db), t: `Receção revertida (${r.qty} un ${r.sku}): ${motivo}` });
}

/** Com a EC inativa, as unidades que lhe estavam destinadas passam a stock livre. */
export function passarParaStock(db: Inventario, p: Po, rid: string): void {
  exigir("inventory.receive", "passar para stock");
  const r = p.receipts.find((x) => x.id === rid);
  if (!r || r.state !== "Ativa" || !r.toEC || r.released) falhar("Nada para passar a stock.");
  const e = r.ec ? ecPorId(db, r.ec) : undefined;
  if (e && !e.deleted) falhar(`Só é possível com a Encomenda Cliente inativa (${r.ec} está ativa).`);
  const l = p.lines.find((x) => x.id === r.lineId);
  if (!l) return falhar("Linha inexistente.");
  l.ecRecv -= r.toEC;
  r.released = true;
  p.receipts.push({ id: proximoId(db, "R"), at: agora(db), lineId: r.lineId, sku: r.sku, type: "Passagem para stock", qty: r.toEC, toEC: 0, toStock: r.toEC, ec: r.ec, wh: r.wh, guia: r.guia, state: "Ativa", user: UTILIZADOR });
  p.log.push({ at: agora(db), t: `${r.toEC} un ${r.sku} passaram para stock livre (EC ${r.ec} inativa)` });
}

export const MOTIVOS_RESTO = ["Encontrei stock/outra solução", "Fornecedor sem produto", "Outro"] as const;

/** "Não vou receber o resto": exige motivo (e nota se for "Outro"); a EC ligada perde a parte anulada. */
export function anularResto(db: Inventario, p: Po, lineIds: string[], motivo: string, nota: string): void {
  exigir("purchase_orders.manage", "anular resto");
  if (!motivo) falhar("Escolha o motivo para não receber o resto.");
  if (motivo === "Outro" && (!nota || nota.trim().length < 3)) falhar('Com motivo "Outro", escreva uma nota (mínimo 3 caracteres).');
  if (!poOpen(p)) falhar("A encomenda não está em aberto.");
  const batch = proximoId(db, "B");
  let n = 0;
  for (const id of lineIds) {
    const l = p.lines.find((x) => x.id === id);
    const rem = l ? poRem(l) : 0;
    if (!l || rem <= 0) continue;
    const ecCut = l.ecLine ? Math.max(0, Math.min(rem, l.ecUnits - l.ecRecv)) : 0;
    l.cancelled += rem;
    l.ecUnits -= ecCut;
    n++;
    p.cancels.push({ id: proximoId(db, "C"), batch, lineId: id, sku: l.sku, qty: rem, ecCut, ec: l.ec, reason: motivo, note: nota || "", at: agora(db), user: UTILIZADOR, undone: false });
  }
  if (!n) falhar("Não há quantidades por receber nas linhas escolhidas.");
  p.log.push({ at: agora(db), t: `Resto anulado (${n} linha${n > 1 ? "s" : ""}): ${motivo}` });
}

/** Desfaz uma anulação (ou o lote todo): a EC só recupera o que ainda lhe faltar. */
export function desfazerAnulacao(db: Inventario, p: Po, cid: string, lote: boolean): void {
  exigir("purchase_orders.manage", "desfazer anulação");
  const c0 = p.cancels.find((c) => c.id === cid);
  if (!c0 || c0.undone) falhar("Anulação já desfeita.");
  const lista = lote ? p.cancels.filter((c) => c.batch === c0.batch && !c.undone) : [c0];
  for (const c of lista) {
    const l = p.lines.find((x) => x.id === c.lineId);
    if (!l) continue;
    let volta = c.ecCut;
    if (c.ecCut && c.ec) {
      const e = ecPorId(db, c.ec);
      const el = e?.lines.find((x) => x.id === l.ecLine);
      if (!e || e.deleted || !el) volta = 0;
      else volta = Math.max(0, Math.min(c.ecCut, el.qty - el.stockQty - ecDerivado(db, el).poQty - el.nosupQty));
    }
    l.cancelled -= c.qty;
    l.ecUnits += volta;
    c.undone = true;
  }
  p.log.push({ at: agora(db), t: `Anulação desfeita (${lista.length} linha${lista.length > 1 ? "s" : ""})` });
}

/** As linhas ainda por receber (para o diálogo de receção). */
export const linhasPorReceber = (p: Po): PoLinha[] => p.lines.filter((l) => poRem(l) > 0);
export const unidadesEncomendadas = (p: Po): number => p.lines.reduce((a, l) => a + poUnits(l) - l.cancelled, 0);
