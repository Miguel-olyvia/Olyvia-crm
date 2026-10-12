// As encomendas a fornecedor (POs): estado calculado, totais, criação, envio, portal e edição. Regras portadas do mockup. Sem React.
import { HOJE, UTILIZADOR, agora, armazem, ehInteiro, exigirMotivo, falhar, fmtD, fornecedor, mudou, nomeForn, pad, poPorId, proximoId, somarDias } from "./base";
import type { Artigo, EstadoPo, Inventario, Po, PoLinha } from "./tipos";

export const poUnits = (l: PoLinha): number => l.packs * l.packN;
/** O que falta receber: encomendado menos recebido e menos anulado. */
export const poRem = (l: PoLinha): number => poUnits(l) - l.recv - l.cancelled;

/** O estado visto: "Recebida" e "Parcialmente recebida" nunca se escolhem, calculam-se pelas receções. */
export function poStatus(p: Po): EstadoPo {
  if (p.status !== "ordered") return p.status;
  let any = false, all = p.lines.length > 0;
  for (const l of p.lines) {
    if (l.recv > 0) any = true;
    if (poRem(l) > 0) all = false;
  }
  if (all) return any ? "received" : "cancelled";
  return any ? "partial" : "ordered";
}
export const poOpen = (p: Po): boolean => !p.deleted && (poStatus(p) === "ordered" || poStatus(p) === "partial");
export const poLate = (p: Po): boolean => poOpen(p) && p.due < HOJE;
export const poPublished = (p: Po): boolean => ["sent", "seen", "confirmed"].includes(p.portal.state);
/** Publicada no portal e ainda em jogo: linhas, fornecedor, data e estado ficam bloqueados. */
export const poLocked = (p: Po): boolean => poPublished(p) && (p.status === "pending" || poOpen(p));

export function poTotals(p: Po): { sub: number; iva: number; total: number } {
  let sub = 0, iva = 0;
  for (const l of p.lines) { const t = l.packs * l.price; sub += t; iva += (t * l.iva) / 100; }
  return { sub, iva, total: sub + iva };
}
export const poOpenValue = (p: Po): number => p.lines.reduce((s, l) => s + (poRem(l) / l.packN) * l.price * (1 + l.iva / 100), 0);

export const poStatusLabel: Record<EstadoPo, string> = { pending: "Pendente", ordered: "Encomendado", partial: "Parcialmente recebida", received: "Recebida", cancelled: "Cancelada" };

/** O artigo preferido de um produto (recebe os rascunhos automáticos). */
export function artigoPreferido(db: Inventario, sku: string): Artigo | undefined {
  return db.items.find((i) => { const s = fornecedor(db, i.sup); return i.sku === sku && i.pref && !!s && !s.deleted && s.active; });
}

/** A data da última receção ativa (vazia se não houver). */
export function ultimaRececao(p: Po): string {
  const r = p.receipts.filter((x) => x.state === "Ativa").map((x) => x.at).sort();
  return r.length ? r[r.length - 1].slice(0, 10) : "";
}

export interface NovaPo { sup: string; origin?: Po["origin"]; wh?: string; auto?: boolean; date?: string }
/** Um rascunho novo (a entrega prevista é a data mais o prazo do fornecedor). */
export function novaPo(db: Inventario, a: NovaPo): Po {
  const id = "PO-2026-" + pad(++db.n.po);
  const date = a.date ?? agora(db).slice(0, 10);
  const origin = a.origin ?? { k: "stock" as const };
  const p: Po = {
    id, sup: a.sup, origin, originKey: origin.ref ?? null, wh: a.wh ?? db.settings.defaultWh, date, due: somarDias(date, fornecedor(db, a.sup)?.sla ?? 5), status: "pending",
    deleted: false, auto: !!a.auto, portal: { state: "none", sent: null, seen: null, confirmed: null, promised: null, comment: "" }, promiseAccepted: false,
    notesInt: "", notesSup: "", lines: [], receipts: [], cancels: [], log: [],
  };
  p.log.push({ at: agora(db), t: a.auto && origin.ec ? "Criada a partir de " + origin.ec + (origin.ref && origin.ref !== origin.ec ? " (" + origin.ref + ")" : "") : "Rascunho criado" });
  db.pos.push(p);
  mudou(db);
  return p;
}

/** Uma linha nova, a partir de um artigo do fornecedor. */
export function linhaDeArtigo(db: Inventario, it: Artigo, packs: number, ec?: { id: string; line: string; units: number }): PoLinha {
  return {
    id: proximoId(db, "PL"), sku: it.sku, itemId: it.id, packN: it.packN, unitLabel: it.unitLabel, packs, price: it.price, iva: 23, recv: 0, cancelled: 0,
    ec: ec?.id ?? null, ecLine: ec?.line ?? null, ecUnits: ec?.units ?? 0, ecRecv: 0,
  };
}

/** Aprova e envia: Pendente passa a Encomendado; com portal ativo publica-se no portal e segue email, senão segue o PDF por email. */
export function enviarPo(db: Inventario, p: Po, opts: { auto?: boolean } = {}): void {
  if (p.deleted) falhar("A encomenda está eliminada.");
  if (p.status !== "pending") falhar("Só uma encomenda pendente pode ser aprovada.");
  if (!p.lines.length) falhar("A encomenda não tem linhas.");
  const s = fornecedor(db, p.sup);
  if (!s) return falhar("Fornecedor inexistente.");
  const t = agora(db);
  p.status = "ordered";
  p.sentAt = t;
  if (s.portal === "active") {
    p.portal.state = "sent";
    p.portal.sent = t;
    p.log.push({ at: t, t: (opts.auto ? "Envio automático: " : "Aprovada por " + UTILIZADOR + ": ") + "publicada no portal do fornecedor e email enviado" });
  } else {
    p.portal.state = "email";
    p.log.push({ at: t, t: (opts.auto ? "Envio automático" : "Aprovada por " + UTILIZADOR) + ": PDF enviado por email (fornecedor sem portal ativo)" });
  }
  mudou(db);
}

export function portalVista(db: Inventario, p: Po): void {
  if (p.portal.state !== "sent") falhar("A encomenda não está publicada por ver.");
  p.portal.state = "seen";
  p.portal.seen = agora(db);
  p.log.push({ at: agora(db), t: "Fornecedor abriu a encomenda no portal" });
}
export function portalConfirmar(db: Inventario, p: Po, promised: string, comment: string): void {
  if (!["sent", "seen"].includes(p.portal.state)) falhar("Só uma encomenda publicada pode ser confirmada.");
  if (!promised) falhar("Indique a data prometida.");
  if (!p.portal.seen) p.portal.seen = agora(db);
  Object.assign(p.portal, { state: "confirmed", confirmed: agora(db), promised, comment });
  p.log.push({ at: agora(db), t: "Fornecedor confirmou · entrega prometida " + fmtD(promised) });
}
export function retirarDoPortal(db: Inventario, p: Po, motivo: string): void {
  if (!poPublished(p)) falhar("A encomenda não está publicada.");
  exigirMotivo(motivo, "Indique o motivo (mínimo 3 caracteres).");
  p.portal.state = "withdrawn";
  p.log.push({ at: agora(db), t: "Retirada do portal: " + motivo });
}
export function aceitarDataPrometida(db: Inventario, p: Po): void {
  if (p.portal.state !== "confirmed" || !p.portal.promised) falhar("Sem data prometida.");
  p.due = p.portal.promised;
  p.promiseAccepted = true;
  p.log.push({ at: agora(db), t: "Data prometida aceite: entrega passa a " + fmtD(p.due) });
}

export function eliminarPo(db: Inventario, p: Po, motivo: string): void {
  exigirMotivo(motivo);
  if (p.receipts.some((r) => r.state === "Ativa")) falhar("Tem receções ativas: reverta-as antes de eliminar.");
  if (poPublished(p)) retirarDoPortal(db, p, "Encomenda eliminada: " + motivo);
  p.deleted = true;
  p.log.push({ at: agora(db), t: "Eliminada: " + motivo });
}
export function restaurarPo(db: Inventario, p: Po): void {
  p.deleted = false;
  p.log.push({ at: agora(db), t: "Restaurada" });
}

/** Cria um rascunho à mão: cada linha é [artigo, embalagens]; só aceita artigos do fornecedor. */
export function criarPoManual(db: Inventario, d: { sup: string; wh: string; linhas: { sku: string; packs: number }[] }): Po {
  if (!d.sup) falhar("Escolha o fornecedor.");
  if (!d.linhas.length) falhar("Adicione pelo menos uma linha.");
  const pares = d.linhas.map((l) => {
    const it = db.items.find((i) => i.sup === d.sup && i.sku === l.sku);
    if (!it) return falhar(`${nomeForn(db, d.sup)} não tem o artigo ${l.sku}. Ligue-o em Fornecedores › Artigos e preços.`);
    if (!ehInteiro(l.packs) || l.packs < 1) return falhar("Quantidades inteiras (embalagens).");
    return [it, l.packs] as const;
  });
  const p = novaPo(db, { sup: d.sup, wh: d.wh });
  for (const [it, n] of pares) p.lines.push(linhaDeArtigo(db, it, n));
  return p;
}

/** Edita a quantidade (em embalagens) de uma linha, com as regras da encomenda. */
export function editarPacksLinha(db: Inventario, p: Po, lineId: string, v: number): void {
  const l = p.lines.find((x) => x.id === lineId);
  if (!l) return falhar("Linha inexistente.");
  if (poLocked(p)) falhar("Publicada no portal: retire-a do portal para editar.");
  if (p.deleted || !["pending", "ordered", "partial"].includes(poStatus(p))) falhar("As linhas desta encomenda estão fechadas.");
  if (!ehInteiro(v) || v < 1) falhar("Quantidade inteira (embalagens) ≥ 1.");
  if (v * l.packN < l.recv + l.cancelled) falhar(`Abaixo do já recebido/anulado (${l.recv + l.cancelled} un): reverta a receção primeiro.`);
  if (l.ecLine && v * l.packN < l.ecUnits) falhar(`Linha ligada a ${l.ec}: mínimo ${Math.ceil(l.ecUnits / l.packN)} embalagens.`);
  l.packs = v;
  p.log.push({ at: agora(db), t: `Linha ${l.sku}: packs → ${v} (${UTILIZADOR})` });
}

/** Muda a data de entrega prevista ou o armazém de destino. */
export function editarCabecalhoPo(db: Inventario, p: Po, k: "due" | "wh", v: string): void {
  if (poLocked(p)) falhar("Publicada no portal: retire-a do portal para mudar.");
  if (k === "due") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) falhar("Data inválida.");
    if (v < p.date) falhar("A entrega não pode ser antes da encomenda.");
    p.due = v;
  } else {
    if (!armazem(db, v) || armazem(db, v)?.deleted) falhar("Armazém inválido.");
    p.wh = v;
  }
  p.log.push({ at: agora(db), t: `Cabeçalho (${k}) alterado por ${UTILIZADOR}` });
}

/** Grava as notas da encomenda (máximo 2000 caracteres cada). */
export function gravarNotasPo(p: Po, notesInt: string, notesSup: string): void {
  if (notesInt.length > 2000 || notesSup.length > 2000) falhar("Máximo 2000 caracteres.");
  p.notesInt = notesInt;
  p.notesSup = notesSup;
}

export const poPorIdObrigatoria = (db: Inventario, id: string): Po => poPorId(db, id) ?? falhar("Encomenda inexistente: " + id);

/** Porque é que as linhas de uma PO não se editam (ou `null` se se podem editar). */
export function motivoBloqueioPo(p: Po): string | null {
  if (p.deleted) return "Encomenda eliminada";
  if (poLocked(p)) return "Publicada no portal do fornecedor: linhas, fornecedor, data e estado bloqueados";
  const st = poStatus(p);
  if (st === "received") return "Encomenda recebida: as linhas refletem o que entrou no livro";
  if (st === "cancelled") return "Encomenda cancelada";
  return null;
}

/** Acrescenta uma linha de um artigo do fornecedor (pela quantidade mínima). */
export function adicionarLinhaPo(db: Inventario, p: Po, sku: string): void {
  const it = db.items.find((i) => i.sup === p.sup && i.sku === sku);
  if (!it) falhar(`Sem artigo correspondente em ${nomeForn(db, p.sup)}. Ligue-o em Fornecedores › Artigos e preços.`);
  const bloqueio = motivoBloqueioPo(p);
  if (bloqueio) falhar(bloqueio + ".");
  p.lines.push(linhaDeArtigo(db, it, Math.max(1, it.moq || 1)));
  p.log.push({ at: agora(db), t: "Linha adicionada: " + sku });
}

/** Remove uma linha: nunca uma com receções nem uma ligada a uma Encomenda Cliente. */
export function removerLinhaPo(db: Inventario, p: Po, lineId: string): void {
  const bloqueio = motivoBloqueioPo(p);
  if (bloqueio) falhar(bloqueio + ".");
  const l = p.lines.find((x) => x.id === lineId);
  if (!l) return falhar("Linha inexistente.");
  if (l.recv) falhar("Linha com receções: reverta a receção primeiro.");
  if (l.ecLine) falhar(`Linha ligada a ${l.ec}: a quantidade para a EC tem de ser encomendada.`);
  p.lines = p.lines.filter((x) => x.id !== lineId);
  p.log.push({ at: agora(db), t: "Linha removida: " + l.sku });
}

export interface PassoPo { nome: string; detalhe: string; estado: "feito" | "atual" | "depois" }
/** O percurso de uma PO: rascunho, encomendada, vista, confirmada, parcialmente recebida, recebida. */
export function percursoPo(p: Po): PassoPo[] {
  const st = poStatus(p);
  const deEc = p.auto && p.origin.ec;
  const passos: [string, string][] = [
    [deEc ? "Criada a partir de " + p.origin.ec : "Rascunho", fmtD(p.date)],
    ["Encomendada", p.sentAt ? fmtD(p.sentAt) : ""],
    ["Vista pelo fornecedor", p.portal.state === "email" ? "sem portal (email)" : p.portal.seen ? fmtD(p.portal.seen) : ""],
    ["Confirmada", p.portal.confirmed ? "entrega prometida " + fmtD(p.portal.promised) : ""],
    ["Parcialmente recebida", st === "partial" ? `${p.lines.reduce((a, l) => a + l.recv, 0)} de ${p.lines.reduce((a, l) => a + poUnits(l) - l.cancelled, 0)} un` : ""],
    ["Recebida", st === "received" ? fmtD(ultimaRececao(p)) : ""],
  ];
  let cur = 0;
  if (p.status !== "pending") cur = 1;
  if (p.portal.seen || p.portal.state === "email") cur = 2;
  if (p.portal.state === "confirmed") cur = 3;
  if (st === "partial" || st === "received") cur = 4;
  if (st === "received") cur = 6;
  return passos.map(([nome, detalhe], i) => ({ nome, detalhe, estado: i < cur ? "feito" : i === cur ? "atual" : "depois" }));
}

/** O que o portal diz desta encomenda (vazio se ainda não saiu ou foi cancelada). */
export function textoPortal(p: Po): string {
  if (p.deleted || p.status === "pending" || poStatus(p) === "cancelled") return "";
  const x = p.portal;
  if (x.state === "confirmed") return `Confirmada · entrega ${fmtD(x.promised).slice(0, 5)}`;
  if (x.state === "seen") return `No portal · vista ${fmtD(x.seen).slice(0, 5)}`;
  if (x.state === "sent") return "No portal · por ver";
  if (x.state === "withdrawn") return "Retirada do portal";
  if (x.state === "email") return "Enviada por email";
  return "";
}
