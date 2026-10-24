// As guias do fornecedor: o que foi anunciado contra o que foi recebido, fechar com nota quando há divergências, reabrir e cancelar. Portado do mockup.
import { HOJE, agora, exigir, exigirMotivo, falhar, guiaPorId, mesmaGuia, nomeForn, utilizadorAtual } from "./base";
import type { Guia, Inventario } from "./tipos";

export type TipoDiferenca = "ok" | "falta" | "excesso" | "div";
export interface LinhaResumoGuia { sku: string; ann: number; rec: number; diff: number; kind: TipoDiferenca }
export interface ResumoGuia { rows: LinhaResumoGuia[]; div: number; annT: number; recT: number; anyRec: boolean }

export const GUIA_ESTADOS: Record<Guia["state"], string> = { open: "Aberta", closed: "Fechada", cancelled: "Cancelada" };

/** O recebido por produto: só receções ativas ligadas a esta guia. */
function recebidoDaGuia(db: Inventario, g: Guia): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of db.pos) for (const r of p.receipts) {
    if (r.guia === g.id && r.state === "Ativa" && r.type === "Receção") m.set(r.sku, (m.get(r.sku) ?? 0) + r.qty);
  }
  return m;
}

/** Anunciado contra recebido: falta, excesso ou divergência (recebido sem estar anunciado). Só há divergências depois de haver receção. */
export function resumoGuia(db: Inventario, g: Guia): ResumoGuia {
  const rec = recebidoDaGuia(db, g);
  const skus = new Set([...g.ann.map((a) => a.sku), ...rec.keys()]);
  const rows = [...skus].map((sku): LinhaResumoGuia => {
    const ann = g.ann.find((a) => a.sku === sku)?.qty ?? 0;
    const r = rec.get(sku) ?? 0;
    const diff = r - ann;
    return { sku, ann, rec: r, diff, kind: diff === 0 ? "ok" : !ann ? "div" : diff < 0 ? "falta" : "excesso" };
  });
  const anyRec = rec.size > 0;
  return { rows, div: anyRec ? rows.filter((x) => x.diff !== 0).length : 0, annT: rows.reduce((s, x) => s + x.ann, 0), recT: rows.reduce((s, x) => s + x.rec, 0), anyRec };
}

export interface DadosGuia { orig?: string | null; no: string; sup: string; date: string; wh: string; ann: { sku: string; qty: number }[] }
/** Cria ou edita (só abertas) uma guia; o número é único por fornecedor. */
export function guardarGuia(db: Inventario, d: DadosGuia): Guia {
  exigir("inventory.receive", "gerir guias");
  const no = (d.no ?? "").trim();
  if (!no) falhar("Indique o número da guia.");
  if (!d.sup) falhar("Escolha o fornecedor.");
  const dup = db.guias.find((g) => mesmaGuia(g.id, no) && g.sup === d.sup && g.id !== d.orig);
  if (dup) falhar(`Guia duplicada: ${dup.id} de ${nomeForn(db, d.sup)} já existe (${GUIA_ESTADOS[dup.state].toLowerCase()}). Use a existente.`);
  const ann = d.ann.filter((a) => a.sku && a.qty > 0);
  const g0 = d.orig ? guiaPorId(db, d.orig) : undefined;
  if (g0) {
    if (g0.state !== "open") falhar("Só guias abertas podem ser editadas.");
    if (g0.id !== no) for (const p of db.pos) for (const r of p.receipts) if (r.guia === g0.id) r.guia = no;
    Object.assign(g0, { id: no, sup: d.sup, date: d.date, wh: d.wh, ann });
    g0.history.push({ at: agora(db), t: "Guia editada" });
    return g0;
  }
  const g: Guia = { id: no, sup: d.sup, date: d.date || HOJE, wh: d.wh || db.settings.defaultWh, ann, pos: [], state: "open", note: "", history: [{ at: agora(db), t: "Guia criada por " + utilizadorAtual() }] };
  db.guias.push(g);
  return g;
}

/** Fechar com divergências exige uma nota. */
export function fecharGuia(db: Inventario, g: Guia, nota: string): void {
  exigir("inventory.receive", "fechar guias");
  if (g.state !== "open") falhar("A guia não está aberta.");
  const s = resumoGuia(db, g);
  if (s.div && (!nota || nota.trim().length < 3)) falhar(`A guia tem ${s.div} divergência(s): escreva uma nota para fechar (mínimo 3 caracteres).`);
  g.state = "closed";
  g.note = nota || "";
  g.history.push({ at: agora(db), t: "Fechada" + (nota ? ": " + nota : "") });
}
export function reabrirGuia(db: Inventario, g: Guia): void {
  exigir("inventory.receive", "reabrir guias");
  if (g.state !== "closed") falhar("Só guias fechadas podem ser reabertas.");
  g.state = "open";
  g.history.push({ at: agora(db), t: "Reaberta" });
}
/** Cancelar exige motivo e não é possível com receções ativas (reverta-as na encomenda). */
export function cancelarGuia(db: Inventario, g: Guia, motivo: string): void {
  exigir("inventory.receive", "cancelar guias");
  if (g.state === "cancelled") falhar("Já cancelada.");
  exigirMotivo(motivo);
  if (resumoGuia(db, g).anyRec) falhar("A guia tem receções ativas. Reverta-as na encomenda antes de cancelar.");
  g.state = "cancelled";
  g.note = motivo;
  g.history.push({ at: agora(db), t: "Cancelada: " + motivo });
}
