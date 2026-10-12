// As contagens físicas: a diferença conta o que se moveu durante a contagem, só se finaliza sem linhas por resolver e as diferenças ajustadas geram movimentos. Portado do mockup.
import { UTILIZADOR, agora, armazem, ehInteiro, exigirMotivo, falhar, pad, produto } from "./base";
import { aplicarMovimentos } from "./stock";
import type { Contagem, Inventario, LinhaContagem, MovPedido, Resolucao } from "./tipos";

export const CONTAGEM_ESTADOS: Record<Contagem["state"], string> = { open: "Em contagem", final: "Finalizada", cancelled: "Cancelada" };
export const RESOLUCOES: Record<Exclude<Resolucao, "">, string> = { adjusted: "Ajustado", accepted: "Aceite sem ajuste", recount: "Recontagem" };

export interface InfoLinhaContagem { moved: number; exp: number; diff: number | null; pending: boolean }

/** O que se moveu naquele armazém e produto desde que a contagem começou (menos os movimentos da própria contagem). */
export function movidoDurante(db: Inventario, c: Contagem, sku: string): number {
  return db.moves.filter((m) => m.id > c.startSeq && m.wh === c.wh && m.sku === sku && m.doc !== c.id).reduce((s, m) => s + m.qty, 0);
}

/** Esperado = sistema + movido durante a contagem; diferença = contada − esperado. Fica por resolver sem contagem, ou com diferença não ajustada nem aceite. */
export function infoLinha(db: Inventario, c: Contagem, l: LinhaContagem): InfoLinhaContagem {
  const moved = movidoDurante(db, c, l.sku);
  const exp = l.sys + moved;
  const diff = l.counted == null ? null : l.counted - exp;
  const pending = l.counted == null || (diff !== 0 && !["adjusted", "accepted"].includes(l.res));
  return { moved, exp, diff, pending };
}

export function estatisticasContagem(db: Inventario, c: Contagem): { done: number; disc: number; pend: number; total: number } {
  let done = 0, disc = 0, pend = 0;
  for (const l of c.lines) {
    const i = infoLinha(db, c, l);
    if (l.counted != null) done++;
    if (i.diff) disc++;
    if (i.pending) pend++;
  }
  return { done, disc, pend, total: c.lines.length };
}

/** Uma contagem por armazém (e categoria): guarda a fotografia do stock; "system" pré-preenche, "blank" é cega. */
export function criarContagem(db: Inventario, a: { wh: string; cat: string; init: "blank" | "system" }): Contagem {
  if (!armazem(db, a.wh)) falhar("Escolha o armazém.");
  if (db.counts.some((c) => c.wh === a.wh && c.state === "open" && (c.cat === a.cat || !c.cat || !a.cat))) falhar("Já existe uma contagem em curso que cobre este armazém/categoria.");
  const rows = db.stocks.filter((s) => s.wh === a.wh && !s.deleted && (!a.cat || produto(db, s.sku)?.cat === a.cat));
  if (!rows.length) falhar("Não há produtos em stock para este armazém/categoria.");
  const c: Contagem = {
    id: "INV-2026-" + pad(++db.n.inv, 3), wh: a.wh, cat: a.cat, state: "open", started: agora(db), last: agora(db), startSeq: db.seq, init: a.init,
    lines: rows.map((s) => ({ sku: s.sku, sys: s.qty, counted: a.init === "system" ? s.qty : null, res: "", note: "" })), moves: [], user: UTILIZADOR,
  };
  db.counts.push(c);
  return c;
}

/** Só se finaliza com tudo contado e resolvido; as linhas "Ajustado" geram um movimento de ajuste. Devolve quantos. */
export function finalizarContagem(db: Inventario, c: Contagem): number {
  if (c.state !== "open") falhar("A contagem não está em curso.");
  const pend = c.lines.filter((l) => infoLinha(db, c, l).pending);
  if (pend.length) falhar(`Faltam ${pend.length} linha(s) por contar ou resolver.`);
  const moves: MovPedido[] = [];
  for (const l of c.lines) {
    const i = infoLinha(db, c, l);
    if (i.diff && l.res === "adjusted") moves.push({ type: i.diff > 0 ? "adjp" : "adjm", sku: l.sku, wh: c.wh, qty: Math.abs(i.diff), doc: c.id, note: "Contagem: " + (l.note || "diferença ajustada") });
  }
  const out = moves.length ? aplicarMovimentos(db, moves) : [];
  c.moves = out.map((m) => m.id);
  c.state = "final";
  c.finished = agora(db);
  return out.length;
}

function linhaAberta(c: Contagem, idx: number): LinhaContagem {
  const l = c.lines[idx];
  if (!l) return falhar("Linha inexistente.");
  if (c.state !== "open") falhar("Contagem fechada: quantidades corrigem-se com um ajuste.");
  return l;
}
/** Regista a quantidade contada (vazio = por contar). Sem diferença, a resolução limpa-se. */
export function contarLinha(db: Inventario, c: Contagem, idx: number, v: number | null): void {
  const l = linhaAberta(c, idx);
  if (v == null) l.counted = null;
  else {
    if (!ehInteiro(v) || v < 0) falhar("Contada: inteiro ≥ 0.");
    l.counted = v;
  }
  if (infoLinha(db, c, l).diff === 0) l.res = "";
  c.last = agora(db);
}
export function resolverLinha(db: Inventario, c: Contagem, idx: number, res: Resolucao): void {
  linhaAberta(c, idx).res = res;
  c.last = agora(db);
}
export function notaLinha(db: Inventario, c: Contagem, idx: number, nota: string): void {
  const l = c.lines[idx];
  if (!l) return falhar("Linha inexistente.");
  l.note = nota;
  if (c.state === "open") c.last = agora(db);
}
/** Preenche as linhas por contar com o esperado. */
export function preencherEsperado(db: Inventario, c: Contagem): void {
  if (c.state !== "open") falhar("A contagem não está em curso.");
  for (const l of c.lines) if (l.counted == null) l.counted = infoLinha(db, c, l).exp;
  c.last = agora(db);
}
export function cancelarContagem(db: Inventario, c: Contagem, motivo: string): void {
  if (c.state !== "open") falhar("A contagem não está em curso.");
  exigirMotivo(motivo);
  c.state = "cancelled";
  c.cancelReason = motivo;
}
