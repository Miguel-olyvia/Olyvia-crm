// As encomendas a fornecedor (POs): estado calculado, totais, criação, envio, portal e edição. Regras portadas do mockup. Sem React.
import { HOJE, UTILIZADOR, agora, armazem, ehInteiro, exigir, exigirMotivo, falhar, fmtD, fmtDS, fmtDT, fornecedor, guiaDoForn, mesmaGuia, mudou, nomeForn, pad, poPorId, proximoId, somarDias, utilizadorAtual } from "./base";
import type { AnexoGuia, Artigo, EstadoPo, Expedicao, Guia, Inventario, Po, PoLinha, PortalForn, Tom } from "./tipos";

/** O estado do portal de um fornecedor, como o mockup o escreve (PORTAL). */
export const PORTAL_FORN: Record<PortalForn, readonly [string, Tom]> = { none: ["Sem acesso", "neu"], invited: ["Convidado", "info"], active: ["Ativo", "ok"], revoked: ["Revogado", "bad"] };

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
/** 16/10 (como na app): pode receber-se na Receção — pendente (ainda não confirmada ao fornecedor), encomendada ou parcial; nunca eliminada nem cancelada.
 *  poOpen fica como estava (encomendas em aberto: atrasos, valor por receber, cadastros). */
export const poRecebivel = (p: Po): boolean => !p.deleted && ["pending", "ordered", "partial"].includes(poStatus(p));
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
    deleted: false, auto: !!a.auto, portal: { state: "none", sent: null, seen: null, confirmed: null, promised: null, comment: "", emails: [] }, promiseAccepted: false,
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

/** Regista um email enviado (ou falhado) ao fornecedor ou à equipa, que se vê no separador Portal. */
function emailPo(p: Po, e: { at: string; to: string; t: string; ok: boolean; err?: string }): void { (p.portal.emails ??= []).push(e); }

/** Aprova e envia: Pendente passa a Encomendado; com portal ativo publica-se no portal e segue email, senão segue o PDF por email. */
export function enviarPo(db: Inventario, p: Po, opts: { auto?: boolean } = {}): void {
  if (!opts.auto) exigir("purchase_orders.approve", "passar a Encomendado");
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
    emailPo(p, { at: t, to: s.email, t: "Nova encomenda no portal", ok: true });
    p.log.push({ at: t, t: (opts.auto ? "Envio automático: " : "Aprovada por " + utilizadorAtual() + ": ") + "publicada no portal do fornecedor e email enviado" });
  } else {
    p.portal.state = "email";
    emailPo(p, { at: t, to: s.email || "—", t: "Encomenda em PDF por email", ok: !!s.email, err: s.email ? "" : "Fornecedor sem email" });
    p.log.push({ at: t, t: (opts.auto ? "Envio automático" : "Aprovada por " + utilizadorAtual()) + ": PDF enviado por email (fornecedor sem portal ativo)" });
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
  emailPo(p, { at: agora(db), to: "Responsável de compras", t: "Fornecedor confirmou a encomenda", ok: true });
  p.log.push({ at: agora(db), t: "Fornecedor confirmou · entrega prometida " + fmtD(promised) });
}
/* ------------------------------------------------------------------ SÓ PROTÓTIPO (20/10, demo): a expedição com guia de remessa */
// O portal real do fornecedor não tem expedição: isto existe só no protótipo, para a demonstração do circuito completo
// (o fornecedor confirma, expede com a guia de remessa dele e o armazém dá entrada lendo o número da guia).

/** As unidades de uma linha já expedidas pelo fornecedor (todas as expedições). */
export const expedidoLinha = (p: Po, lineId: string): number =>
  (p.portal.expedicoes ?? []).reduce((a, e) => a + e.linhas.filter((x) => x.lineId === lineId).reduce((b, x) => b + x.qty, 0), 0);
/** O que o fornecedor ainda pode expedir numa linha: encomendado, menos anulado, menos o que já expediu (ou já foi recebido, se for mais). */
export const porExpedir = (p: Po, l: PoLinha): number => Math.max(0, poUnits(l) - l.cancelled - Math.max(l.recv, expedidoLinha(p, l.id)));
export const totalPorExpedir = (p: Po): number => p.lines.reduce((a, l) => a + porExpedir(p, l), 0);
/** A última expedição (ou undefined). */
export const ultimaExpedicao = (p: Po): Expedicao | undefined => { const L = p.portal.expedicoes ?? []; return L[L.length - 1]; };
/** Pode expedir: publicada e confirmada no portal, em aberto (encomendada ou parcial) e com alguma coisa por expedir. */
export const podeExpedir = (p: Po): boolean => !p.deleted && p.portal.state === "confirmed" && (poStatus(p) === "ordered" || poStatus(p) === "partial") && totalPorExpedir(p) > 0;
/** Expedida pelo fornecedor e ainda por receber (o que a Receção destaca no topo). */
export const expedidaACaminho = (p: Po): boolean => !!p.portal.expedicoes?.length && p.portal.state === "confirmed" && poRecebivel(p);

/** O número seguinte de guia de remessa ("GR 2026/313"): o maior "GR 2026/n" que a base conhece, mais um. */
export function proximaGuiaRemessa(db: Inventario): string {
  const re = /^GR 2026\/(\d+)$/i;
  let n = 0;
  for (const g of db.guias) { const m = re.exec(g.id); if (m) n = Math.max(n, Number(m[1])); }
  for (const p of db.pos) for (const e of p.portal.expedicoes ?? []) { const m = re.exec(e.guia); if (m) n = Math.max(n, Number(m[1])); }
  return "GR 2026/" + (n + 1);
}

/** O tamanho máximo do ficheiro da guia de remessa (o anexo viaja em dataURL na sincronização do protótipo). */
export const ANEXO_GUIA_MAX = 2 * 1024 * 1024;
/** PDF ou imagem: o que o portal aceita como ficheiro da guia de remessa. */
export const anexoGuiaAceite = (tipo: string): boolean => tipo === "application/pdf" || tipo.startsWith("image/");
export interface DadosExpedicao { guia: string; data: string; linhas: { lineId: string; qty: number }[]; transportador?: string; obs?: string; anexo?: AnexoGuia | null }
/** SÓ PROTÓTIPO: o fornecedor expede (tudo ou parte) uma encomenda confirmada, com a guia de remessa dele. A guia fica registada como guia do
 *  fornecedor aberta (o anunciado = o expedido, ligada à PO): a Receção encontra-a pelo número e dá entrada já com estas quantidades. */
export function portalExpedir(db: Inventario, p: Po, d: DadosExpedicao): Expedicao {
  if (p.deleted) falhar("A encomenda foi eliminada.");
  if (p.portal.state !== "confirmed") falhar("Confirme a encomenda antes de a expedir.");
  const st = poStatus(p);
  if (st !== "ordered" && st !== "partial") falhar(`A encomenda está ${poStatusLabel[st].toLowerCase()}: já não se expede.`);
  const guia = String(d.guia ?? "").trim();
  if (!guia) falhar("Indique o número da guia de remessa.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data || "")) falhar("Indique a data de expedição.");
  if (d.data < p.date) falhar("A expedição não pode ser antes da data da encomenda.");
  // o número é único por fornecedor (sem contar espaços nem maiúsculas): nas guias e nas expedições de todas as encomendas dele
  if (guiaDoForn(db, p.sup, guia) || db.pos.some((x) => x.sup === p.sup && (x.portal.expedicoes ?? []).some((e) => mesmaGuia(e.guia, guia)))) falhar(`A guia ${guia} já existe: use outro número.`);
  const anexo = d.anexo ?? undefined;
  if (anexo) {
    if (!anexoGuiaAceite(anexo.tipo)) falhar("O ficheiro da guia tem de ser PDF ou imagem.");
    if (anexo.tamanho > ANEXO_GUIA_MAX) falhar("O ficheiro da guia tem mais de 2 MB: reduza-o ou tire uma foto mais leve.");
  }
  const linhas = d.linhas.filter((x) => x.qty > 0);
  if (!linhas.length) falhar("Indique pelo menos uma quantidade a expedir.");
  for (const x of linhas) {
    const l = p.lines.find((y) => y.id === x.lineId);
    if (!l) return falhar("Linha inexistente.");
    if (!ehInteiro(x.qty)) falhar("Quantidades inteiras.");
    if (x.qty > porExpedir(p, l)) falhar(`Nunca mais do que falta expedir: ${l.sku} tem ${porExpedir(p, l)} un por expedir.`);
  }
  const at = agora(db);
  const e: Expedicao = { guia, data: d.data, at, linhas: linhas.map((x) => ({ lineId: x.lineId, qty: x.qty })), transportador: (d.transportador ?? "").trim(), obs: (d.obs ?? "").trim(), origem: "fornecedor", ...(anexo ? { anexo } : {}) };
  (p.portal.expedicoes ??= []).push(e);
  const ann = new Map<string, number>();
  for (const x of e.linhas) { const sku = p.lines.find((l) => l.id === x.lineId)?.sku ?? ""; ann.set(sku, (ann.get(sku) ?? 0) + x.qty); }
  const g: Guia = {
    id: guia, sup: p.sup, date: d.data, wh: p.wh, ann: [...ann].map(([sku, qty]) => ({ sku, qty })), pos: [p.id], state: "open", note: "", doPortal: true, origem: "fornecedor", ...(anexo ? { anexo } : {}),
    history: [{ at, t: `Guia de remessa emitida pelo fornecedor no portal (${p.id})${e.transportador ? " · " + e.transportador : ""}${anexo ? " · ficheiro " + anexo.nome : " · sem ficheiro"}` }],
  };
  db.guias.push(g);
  const un = e.linhas.reduce((a, x) => a + x.qty, 0);
  emailPo(p, { at, to: "Responsável de compras", t: `Fornecedor expediu a encomenda · guia ${guia}`, ok: true });
  p.log.push({ at, t: `Fornecedor expediu ${un} un · guia de remessa ${guia}${e.transportador ? " · " + e.transportador : ""}` });
  mudou(db);
  return e;
}

export function retirarDoPortal(db: Inventario, p: Po, motivo: string): void {
  exigir("purchase_orders.manage", "retirar do portal");
  if (!poPublished(p)) falhar("A encomenda não está publicada.");
  exigirMotivo(motivo, "Indique o motivo (mínimo 3 caracteres).");
  p.portal.state = "withdrawn";
  p.portal.withdrawn = agora(db);
  emailPo(p, { at: agora(db), to: fornecedor(db, p.sup)?.email ?? "—", t: "Encomenda retirada do portal: " + motivo, ok: true });
  p.log.push({ at: agora(db), t: "Retirada do portal: " + motivo });
}
/** "Publicar de novo": volta a publicar no portal uma encomenda retirada que ainda está em aberto. */
export function republicarPo(db: Inventario, p: Po): void {
  p.portal.state = "sent";
  p.portal.sent = agora(db);
  emailPo(p, { at: agora(db), to: fornecedor(db, p.sup)?.email ?? "—", t: "Encomenda republicada", ok: true });
  p.log.push({ at: agora(db), t: "Republicada no portal" });
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
  exigir("purchase_orders.manage", "criar encomendas");
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

export type CampoLinhaPo = "packs" | "unitLabel" | "packN" | "price" | "iva";

/** Valida e converte o valor de um campo de uma linha (setPOLine do mockup). */
function valorLinha(l: PoLinha, k: CampoLinhaPo, v: string | number): string | number {
  if (k === "unitLabel") { const t = String(v).trim(); if (!t) falhar("Indique a embalagem."); return t; }
  if (k === "price") {
    if (String(v).trim() === "") falhar("Preço obrigatório.");
    const n = Number(String(v).replace(",", "."));
    if (isNaN(n) || n < 0) falhar("Preço inválido.");
    return n;
  }
  const n = Number(v);
  if (k === "iva" && ![0, 6, 13, 23].includes(n)) falhar("IVA: 0, 6, 13 ou 23 %.");
  if (k === "packs") {
    if (!ehInteiro(n) || n < 1) falhar("Quantidade inteira (embalagens) ≥ 1.");
    if (n * l.packN < l.recv + l.cancelled) falhar(`Abaixo do já recebido/anulado (${l.recv + l.cancelled} un): reverta a receção primeiro.`);
    if (l.ecLine && n * l.packN < l.ecUnits) falhar(`Linha ligada a ${l.ec}: mínimo ${Math.ceil(l.ecUnits / l.packN)} embalagens.`);
  }
  if (k === "packN") {
    if (!ehInteiro(n) || n < 1) falhar("Unidades por embalagem: inteiro ≥ 1.");
    if (l.recv) falhar("Linha com receções: reverta a receção para mudar a embalagem.");
    if (l.ecLine && n * l.packs < l.ecUnits) falhar(`Linha ligada a ${l.ec}: ficaria abaixo do necessário.`);
  }
  return n;
}

/** Edita um campo de uma linha (quantidade em embalagens, embalagem, unidades por embalagem, preço ou IVA), com as regras da encomenda. */
export function editarLinhaPo(db: Inventario, p: Po, lineId: string, k: CampoLinhaPo, v: string | number): void {
  exigir("purchase_orders.manage", "editar encomendas");
  const l = p.lines.find((x) => x.id === lineId);
  if (!l) return falhar("Linha inexistente.");
  if (poLocked(p)) falhar("Publicada no portal: retire-a do portal para editar.");
  if (p.deleted || !["pending", "ordered", "partial"].includes(poStatus(p))) falhar(`Encomenda ${poStatusLabel[poStatus(p)].toLowerCase()}: as linhas estão fechadas.`);
  const novo = valorLinha(l, k, v);
  (l as unknown as Record<string, string | number>)[k] = novo;
  p.log.push({ at: agora(db), t: `Linha ${l.sku}: ${k} → ${novo} (${utilizadorAtual()})` });
}
/** Edita a quantidade (em embalagens) de uma linha. */
export const editarPacksLinha = (db: Inventario, p: Po, lineId: string, v: number): void => editarLinhaPo(db, p, lineId, "packs", v);

export type CampoCabPo = "due" | "wh" | "date" | "sup" | "status" | "notesInt" | "notesSup";
const COMPLEMENTO_BLOQUEIO: Record<Exclude<CampoCabPo, "notesInt" | "notesSup">, string> = { due: " a data", date: " a data", wh: "", sup: "", status: " o estado" };

function mudarFornecedorPo(db: Inventario, p: Po, v: string): void {
  if (p.status !== "pending") falhar("O fornecedor só muda em rascunho.");
  if (p.lines.some((l) => l.ecLine)) falhar("Linhas ligadas a Encomendas Clientes: fornecedor preferencial fixo.");
  if (p.lines.some((l) => !db.items.some((i) => i.sup === v && i.sku === l.sku))) falhar(`${nomeForn(db, v)} não tem todos os artigos desta encomenda.`);
  for (const l of p.lines) { const i = db.items.find((x) => x.sup === v && x.sku === l.sku) as Artigo; Object.assign(l, { itemId: i.id, packN: i.packN, unitLabel: i.unitLabel, price: i.price }); }
  p.sup = v;
}

function mudarEstadoPo(db: Inventario, p: Po, v: string): boolean {
  if (v === p.status) return true;
  if (v === "ordered" && p.status === "pending") { enviarPo(db, p); return true; }
  if (v === "cancelled" && p.lines.some((l) => l.recv)) falhar("Tem receções: use “Não vou receber o resto”.");
  if (v === "pending" && p.status !== "pending") falhar("Uma encomenda enviada não volta a rascunho.");
  if (v === "ordered" && p.status === "cancelled") falhar("Uma encomenda cancelada não é reaberta: crie uma nova.");
  p.status = v as Po["status"];
  return false;
}

/** Muda um campo do cabeçalho (setPOHeader do mockup): datas, armazém, fornecedor, estado e notas. */
export function editarCabecalhoPo(db: Inventario, p: Po, k: CampoCabPo, v: string): void {
  exigir("purchase_orders.manage", "editar encomendas");
  if ((k === "due" || k === "date") && !/^\d{4}-\d{2}-\d{2}$/.test(v || "")) falhar("Data inválida.");
  if (k !== "notesInt" && k !== "notesSup" && poLocked(p)) falhar(`Publicada no portal: retire-a do portal para mudar${COMPLEMENTO_BLOQUEIO[k]}.`);
  if (k === "due" && v < p.date) falhar("A entrega não pode ser antes da encomenda.");
  if (k === "date" && v > p.due) falhar("A encomenda não pode ser depois da entrega prevista.");
  if (k === "wh" && (!armazem(db, v) || armazem(db, v)?.deleted)) falhar("Armazém inválido.");
  if ((k === "notesSup" || k === "notesInt") && v.length > 2000) falhar("Máximo 2000 caracteres.");
  if (k === "sup") mudarFornecedorPo(db, p, v);
  else if (k === "status") { if (mudarEstadoPo(db, p, v)) return; }
  else p[k] = v;
  p.log.push({ at: agora(db), t: `Cabeçalho (${k}) alterado por ${utilizadorAtual()}` });
}

/** Grava a PO (botões Gravar / Gravar e encomendar): as notas que mudaram e, se pedido, a aprovação num só passo. */
export function gravarPo(db: Inventario, p: Po, notas: { notesInt: string; notesSup: string }, encomendar: boolean): void {
  exigir("purchase_orders.manage", "editar encomendas");
  if (notas.notesInt !== p.notesInt) editarCabecalhoPo(db, p, "notesInt", notas.notesInt);
  if (notas.notesSup !== p.notesSup) editarCabecalhoPo(db, p, "notesSup", notas.notesSup);
  if (encomendar && p.status === "pending") enviarPo(db, p);
}

/** Duplica uma PO como rascunho novo (dupPO do mockup): as mesmas linhas, sem receções nem ligação a Encomendas Clientes. */
export function duplicarPo(db: Inventario, id: string): Po {
  exigir("purchase_orders.manage", "criar encomendas");
  const p0 = poPorId(db, id) ?? falhar("Encomenda inexistente: " + id);
  const p = novaPo(db, { sup: p0.sup, wh: p0.wh });
  for (const l of p0.lines) p.lines.push({ id: proximoId(db, "PL"), sku: l.sku, itemId: l.itemId, packN: l.packN, unitLabel: l.unitLabel, packs: l.packs, price: l.price, iva: l.iva, recv: 0, cancelled: 0, ec: null, ecLine: null, ecUnits: 0, ecRecv: 0 });
  p.log.push({ at: agora(db), t: "Duplicada de " + id });
  return p;
}

/** O artigo do fornecedor que o texto escrito designa: "SKU — nome", SKU, EAN, código ou referência do fornecedor (poAddLine do mockup). */
export function resolverArtigoPo(db: Inventario, p: Po, texto: string): Artigo | undefined {
  const t = String(texto || "").trim();
  const cod = t.split(" — ")[0].trim(), lc = cod.toLowerCase();
  const doProduto = t ? db.products.find((x) => x.sku.toLowerCase() === lc || x.ean === cod)?.sku : undefined;
  const porCodigo = lc ? [...db.products.filter((x) => !x.deleted && (x.sku.toLowerCase() === lc || x.ean === cod || (x.codes || []).some((c) => c.toLowerCase() === lc))).map((x) => x.sku), ...db.items.filter((i) => i.ref.toLowerCase() === lc).map((i) => i.sku)] : [];
  const sku = doProduto || porCodigo[0];
  return db.items.find((i) => i.sup === p.sup && (i.sku === sku || i.ref.toLowerCase() === t.toLowerCase()));
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
  exigir("purchase_orders.manage", "editar encomendas");
  const it = db.items.find((i) => i.sup === p.sup && i.sku === sku);
  if (!it) falhar(`Sem artigo correspondente em ${nomeForn(db, p.sup)}. Ligue-o em Fornecedores › Artigos e preços.`);
  const bloqueio = motivoBloqueioPo(p);
  if (bloqueio) falhar(bloqueio + ".");
  p.lines.push(linhaDeArtigo(db, it, Math.max(1, it.moq || 1)));
  p.log.push({ at: agora(db), t: "Linha adicionada: " + sku });
}

/** Remove uma linha: nunca uma com receções nem uma ligada a uma Encomenda Cliente. */
export function removerLinhaPo(db: Inventario, p: Po, lineId: string): void {
  exigir("purchase_orders.manage", "editar encomendas");
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
    ["Encomendada", p.sentAt ? fmtDT(p.sentAt) : ""],
    ["Vista pelo fornecedor", p.portal.state === "email" ? "sem portal (email)" : p.portal.seen ? fmtDT(p.portal.seen) : ""],
    ["Confirmada", p.portal.confirmed ? "entrega prometida " + fmtD(p.portal.promised) : ""],
    ["Parcialmente recebida", st === "partial" ? `${p.lines.reduce((a, l) => a + l.recv, 0)} de ${p.lines.reduce((a, l) => a + poUnits(l) - l.cancelled, 0)} un` : ""],
    ["Recebida", st === "received" ? fmtD(ultimaRececao(p)) : ""],
  ];
  // SÓ PROTÓTIPO: com expedições do fornecedor, o passo "Expedida" (guia de remessa) entra entre Confirmada e Parcialmente recebida
  const ex = ultimaExpedicao(p), e = ex ? 1 : 0;
  if (ex) passos.splice(4, 0, ["Expedida", `guia ${ex.guia} · ${fmtD(ex.data)}`]);
  let cur = 0;
  if (p.status !== "pending") cur = 1;
  if (p.portal.seen || p.portal.state === "email") cur = 2;
  if (p.portal.state === "confirmed") cur = 3;
  if (ex) cur = 4;
  if (st === "partial" || st === "received") cur = 4 + e;
  if (st === "received") cur = 6 + e;
  return passos.map(([nome, detalhe], i) => ({ nome, detalhe, estado: i < cur ? "feito" : i === cur ? "atual" : "depois" }));
}

/** O que o portal diz desta encomenda (vazio se ainda não saiu ou foi cancelada). */
export function textoPortal(p: Po): string { return selarPortal(p)?.[0] ?? ""; }

/** O selo do portal de uma PO (portalTag do mockup): o texto e o tom, ou `null` se ainda não saiu ou foi cancelada. */
export function selarPortal(p: Po): readonly [string, Tom] | null {
  if (p.deleted || p.status === "pending" || poStatus(p) === "cancelled") return null;
  const x = p.portal;
  const ex = ultimaExpedicao(p);
  if (x.state === "confirmed" && ex && poOpen(p)) return [`Expedida pelo fornecedor · guia ${ex.guia}`, "violet"];
  if (x.state === "confirmed") return [`Confirmada · entrega ${fmtDS(x.promised)}`, "ok"];
  if (x.state === "seen") return [`No portal · vista ${fmtDS(x.seen)}`, "info"];
  if (x.state === "sent") return ["No portal · por ver", "neu"];
  if (x.state === "withdrawn") return ["Retirada do portal", "warn"];
  if (x.state === "email") return ["Enviada por email", "neu"];
  return null;
}
