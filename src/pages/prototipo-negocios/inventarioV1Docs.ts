// O Inventário no V1 (19/10/2026), sem React: o que mostrar e por que ordem. As regras e as ações são as do Inventário do Rafael
// (inventario/: reserva FIFO, encomendas a fornecedor, receção, saídas, contagens), sem mudanças; aqui só se lê a base e se diz em palavras.
// O Inventário do V1 organiza-se à volta das obras dos Negócios: para cada obra, os materiais por fase da obra, com o dia em que a fase
// começa (do plano da obra) e o que falta fazer para o material lá estar. Três listas e o que fazer agora:
// · Obras: as obras dos Negócios (do contrato assinado ao fim), com os materiais por fase.
// · Encomendas: as encomendas a fornecedor, por aprovar, a caminho e recebidas.
// · Armazém: o stock do Armazém Central e das carrinhas, com o que está guardado para obras e o que está livre.
// · O que fazer agora (tarefasInv): aprovar, dar entrada, dar saída para a obra e encomendar o que está abaixo do mínimo.
import { FASES_OBRA } from "./fasesObra";
import { HOJE, nomeForn, produto } from "./inventario/base";
import { ecLinhaInfo, livreEm, reservadoEm } from "./inventario/ec";
import { estadoStock } from "./inventario/contadores";
import { ARMAZEM_OBRAS, ecDoNegocio, resumoEcNegocio, type ResumoEcNeg } from "./inventario/ponteNegocios";
import { artigoPreferido, poOpen, poRem, poStatus, poTotals, poUnits } from "./inventario/po";
import { qtyAt } from "./inventario/stock";
import type { Ec, Inventario, Movimento, Po } from "./inventario/tipos";
import { aberto, eur as eurMotor, nfmt, type Estado, type Negocio } from "./motor";
import { materiaisPorFase, type EstadoMat } from "./obraOps";
import { dataCurta, deIso, diasDaObra } from "./planoObra";
import { inicioDoPlano } from "./preparacaoObra";

/* ---------------------------------------------------------------- palavras */

export const plural = (n: number, um: string, varios: string): string => `${nfmt(n)} ${n === 1 ? um : varios}`;
/** "m²", "un", "sacos": a unidade do produto no Inventário. */
export const unidade = (db: Inventario, sku: string): string => produto(db, sku)?.unit ?? "un";
/** "12 m²", "1 un". */
export const qtd = (n: number, un: string): string => `${nfmt(n)} ${un}`;
/** "seg, 12 out" a partir de "aaaa-mm-dd". */
export const dia = (iso: string | null | undefined): string => (iso ? dataCurta(deIso(iso.slice(0, 10))) : "");
/** O Inventário vive no dia de exemplo (09/10/2026): "hoje", "amanhã" ou a data curta. */
export function diaRelativo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  return d === HOJE ? "hoje" : d === somar(HOJE, 1) ? "amanhã" : d === somar(HOJE, -1) ? "ontem" : dia(d);
}
function somar(iso: string, n: number): string {
  const d = deIso(iso); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** "2.337,00 €" (E7: ponto nos milhares também com 4 algarismos). */
/** A primeira letra em minúscula, salvo siglas ("Gás R32" → "gás R32", "SDS" fica). */
export const minuscula = (s: string): string => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
export const eur = (n: number): string => `${eurMotor(n)} €`;

/** O negócio de uma origem do Inventário ("CT 2026/1027", "VD 2026/1030"). */
export function negocioDaRef(S: Estado, ref: string | null | undefined): Negocio | undefined {
  const m = /^(?:CT|VD) 2026\/(\d+)$/.exec(ref ?? "");
  return m ? S.deals.find((d) => d.id === Number(m[1])) : undefined;
}

/* ---------------------------------------------------------------- as obras */

export type EstadoObraInv = "pagamento" | "preparar" | "em curso" | "concluida";
export interface MatInv {
  n: string; q: number; un: string; estado: EstadoMat; quando?: string; forn?: string;
  /** No Inventário: o produto, a linha da encomenda de cliente, quanto está pronto a sair e quanto já saiu (sem encomenda no Inventário: zero). */
  sku?: string; linhaEc?: string; pronto: number; saiu: number;
}
export interface FaseInv {
  fase: number; nome: string;
  /** Quando a fase começa, do plano da obra ("seg, 26 out"); null se o plano não tem datas. */
  quando: string | null;
  itens: MatInv[];
  /** Quantos materiais estão prontos a sair para a obra (reservados ou recebidos, ainda no armazém). */
  aSair: number;
}
export interface ObraInv {
  id: number; nome: string; sub: string; estado: EstadoObraInv;
  /** O número da encomenda de cliente no Inventário (EC-1027), ou null antes do pagamento. */
  ec: string | null;
  fases: FaseInv[];
  tot: { materiais: number; prontos: number; naObra: number; aChegar: number; porEncomendar: number };
  /** Uma frase com o que importa: "3 de 7 materiais prontos · 4 a chegar". */
  frase: string;
  /** Quando: "começa seg, 26 out", "em curso", "acabou". */
  quando: string;
  /** O material desta obra pede atenção (falta encomendar, ou está em falta, e a obra está perto). */
  atencao: boolean;
}

const PRONTOS: EstadoMat[] = ["reservado", "recebido"];
const A_CHEGAR: EstadoMat[] = ["a chegar", "encomendado"];

/** O dia em que cada fase começa no plano: o dia mais cedo das tarefas dessa fase. */
function inicioDasFases(d: Negocio): Record<number, string> {
  const p = d.obra.plano, out: Record<number, string> = {};
  const ini = p ? inicioDoPlano(p) : null;
  if (!p || !ini) return out;
  const n = Math.ceil(Math.max(1, ...p.tasks.map((t) => t.dia + t.dur))) + 1;
  const cal = diasDaObra(ini, n);
  for (const f of [1, 2, 3, 4]) {
    const T = p.tasks.filter((t) => (t.fase ?? 0) === f);
    if (T.length) out[f] = dataCurta(cal[Math.floor(Math.min(...T.map((t) => t.dia)))]);
  }
  // sem fases nas tarefas, a obra inteira começa no primeiro dia
  if (!Object.keys(out).length) for (const f of [1, 2, 3, 4]) out[f] = dataCurta(cal[0]);
  return out;
}

/** As fases da obra com os materiais e o estado de cada um no Inventário (o mesmo que a página da obra mostra). */
export function fasesDaObra(db: Inventario, d: Negocio, inv?: ResumoEcNeg | null): FaseInv[] {
  const r = inv === undefined ? resumoEcNegocio(db, d.obra.ec?.ref) : inv;
  const e = d.obra.ec?.ref ? ecDoNegocio(db, d.obra.ec.ref) : undefined;
  const datas = inicioDasFases(d);
  return materiaisPorFase(d, r).map((g) => ({
    fase: g.fase, nome: FASES_OBRA[g.fase - 1].curto, quando: datas[g.fase] ?? null,
    itens: g.itens.map((m) => {
      const li = r?.linhas.find((l) => l.n === m.n);
      const el = li && e ? e.lines.find((l) => l.sku === li.sku && !l.voided) : undefined;
      return { ...m, sku: li?.sku, linhaEc: el?.id, pronto: li?.pronto ?? 0, saiu: li?.saida ?? 0 };
    }),
    aSair: 0,
  })).map((f) => ({ ...f, aSair: f.itens.filter((m) => m.pronto > 0 && m.linhaEc).length }));
}

export function obraInv(db: Inventario, d: Negocio): ObraInv {
  const p = d.obra.plano;
  const fases = fasesDaObra(db, d);
  const M = fases.flatMap((f) => f.itens);
  const tot = {
    materiais: M.length, prontos: M.filter((m) => PRONTOS.includes(m.estado)).length, naObra: M.filter((m) => m.estado === "na obra").length,
    aChegar: M.filter((m) => A_CHEGAR.includes(m.estado)).length, porEncomendar: M.filter((m) => m.estado === "por encomendar" || m.estado === "em falta").length,
  };
  const estado: EstadoObraInv = p?.estado === "concluída" ? "concluida" : p?.estado === "em curso" ? "em curso" : !d.fin.pago ? "pagamento" : "preparar";
  const ini = p ? inicioDoPlano(p) : null, primeira = ini ? dataCurta(ini) : fases.find((f) => f.quando)?.quando;
  const quando = estado === "concluida" ? "acabou" : estado === "em curso" ? "em curso" : primeira ? "começa " + primeira : "começa quando o plano for aprovado";
  const frase = estado === "pagamento"
    ? "À espera do pagamento: a encomenda de cliente nasce quando o Financeiro o validar."
    : estado === "concluida" ? `Acabou · ${plural(tot.materiais, "material", "materiais")} na obra.`
    : [
      tot.naObra ? `${tot.naObra} já na obra` : "",
      tot.prontos ? `${tot.prontos} de ${tot.materiais} prontos no armazém` : "",
      tot.aChegar ? `${tot.aChegar} a chegar` : "",
      tot.porEncomendar ? `${tot.porEncomendar} por encomendar` : "",
    ].filter(Boolean).join(" · ") || "Sem materiais.";
  return {
    id: d.id, nome: d.nome, sub: [d.servico, d.local.split(",").pop()?.trim()].filter(Boolean).join(" · "), estado, ec: d.obra.ec?.n ?? null, fases, tot, frase, quando,
    atencao: estado !== "concluida" && estado !== "pagamento" && tot.porEncomendar > 0,
  };
}

const ORDEM_OBRA: Record<EstadoObraInv, number> = { "em curso": 0, preparar: 1, pagamento: 2, concluida: 3 };
/** As obras dos Negócios: do contrato assinado (com plano) ao fim. Em curso primeiro, depois as que se preparam, as à espera do pagamento e as acabadas. */
export function obrasInv(S: Estado, db: Inventario): ObraInv[] {
  return aberto(S).filter((d) => d.fase >= 4 && d.obra.plano).map((d) => obraInv(db, d))
    .sort((a, b) => ORDEM_OBRA[a.estado] - ORDEM_OBRA[b.estado] || Number(b.atencao) - Number(a.atencao) || a.nome.localeCompare(b.nome));
}

/* ---------------------------------------------------------------- as encomendas a fornecedor */

export type EstadoPoInv = "por aprovar" | "no fornecedor" | "confirmada" | "chegou em parte" | "recebida" | "cancelada";
export interface LinhaPoInv { id: string; sku: string; n: string; un: string; pedido: number; recebido: number; falta: number }
export interface PoInv {
  id: string; forn: string; portal: boolean; estado: EstadoPoInv;
  /** Para quem: a obra (o negócio) ou o armazém. */
  para: string; deal?: number;
  linhas: LinhaPoInv[]; total: number;
  /** A data que o fornecedor prometeu ("aaaa-mm-dd") ou a prevista pelo prazo dele. */
  prometida: string | null; prevista: string;
  /** "3 materiais · 1.240,00 €" e o estado em palavras. */
  resumo: string; frase: string;
  atrasada: boolean;
}

export function estadoPoInv(p: Po): EstadoPoInv {
  const st = poStatus(p);
  if (st === "pending") return "por aprovar";
  if (st === "cancelled") return "cancelada";
  if (st === "received") return "recebida";
  if (st === "partial") return "chegou em parte";
  return p.portal.state === "confirmed" ? "confirmada" : "no fornecedor";
}

export function poInv(S: Estado, db: Inventario, p: Po): PoInv {
  const d = negocioDaRef(S, p.origin.ref);
  const linhas = p.lines.map((l) => ({ id: l.id, sku: l.sku, n: produto(db, l.sku)?.name ?? l.sku, un: unidade(db, l.sku), pedido: poUnits(l) - l.cancelled, recebido: l.recv, falta: poRem(l) }));
  const estado = estadoPoInv(p), s = db.suppliers.find((x) => x.id === p.sup);
  const prometida = p.portal.promised;
  const atrasada = poOpen(p) && (prometida ?? p.due) < HOJE;
  const porPortal = s?.portal === "active";
  const frase = {
    "por aprovar": `Por aprovar. Ao aprovar, ${porPortal ? "segue pelo portal do fornecedor" : "segue por email para o fornecedor"}.`,
    "no fornecedor": `Enviada ${p.sentAt ? diaRelativo(p.sentAt) : ""}${porPortal ? (p.portal.state === "seen" ? "; o fornecedor já a viu" : "; o fornecedor ainda não a abriu") : " por email"}. Sem data de entrega confirmada.`,
    confirmada: `O fornecedor confirmou: entrega ${diaRelativo(prometida)}.`,
    "chegou em parte": `Chegou uma parte; ${plural(linhas.filter((l) => l.falta > 0).length, "material", "materiais")} por chegar.`,
    recebida: "Recebida.",
    cancelada: "Cancelada.",
  }[estado].replace(/\s+\./, ".");
  return {
    id: p.id, forn: nomeForn(db, p.sup), portal: porPortal, estado, para: d ? `Obra de ${d.nome}` : p.origin.client ? `Obra de ${p.origin.client}` : "Para o armazém", deal: d?.id,
    linhas, total: poTotals(p).total, prometida, prevista: p.due,
    resumo: `${plural(linhas.length, "material", "materiais")} · ${eur(poTotals(p).total)}`, frase: atrasada ? frase + ` Está atrasada (era para ${dia(prometida ?? p.due)}).` : frase, atrasada,
  };
}

export interface GruposPo { porAprovar: PoInv[]; aCaminho: PoInv[]; recebidas: PoInv[] }
export function encomendasInv(S: Estado, db: Inventario): GruposPo {
  const L = db.pos.filter((p) => !p.deleted).map((p) => poInv(S, db, p));
  const porData = (a: PoInv, b: PoInv) => (a.prometida ?? a.prevista).localeCompare(b.prometida ?? b.prevista);
  return {
    porAprovar: L.filter((p) => p.estado === "por aprovar"),
    aCaminho: L.filter((p) => ["no fornecedor", "confirmada", "chegou em parte"].includes(p.estado)).sort(porData),
    recebidas: L.filter((p) => p.estado === "recebida").reverse(),
  };
}

/* ---------------------------------------------------------------- o armazém */

export interface ObraDoMaterial { deal?: number; nome: string; q: number }
export interface MaterialInv {
  sku: string; n: string; cat: string; un: string; wh: string;
  /** No armazém, guardado para obras, livre e a chegar (das encomendas a fornecedor em aberto). */
  qty: number; reservado: number; livre: number; aChegar: number;
  min: number; rop: number; loc: string;
  baixo: boolean;
  obras: ObraDoMaterial[];
}

/** As obras que têm este material guardado no armazém (pela encomenda de cliente de cada uma). */
function obrasDoMaterial(S: Estado, db: Inventario, sku: string, wh: string): ObraDoMaterial[] {
  const out: ObraDoMaterial[] = [];
  for (const e of db.ecs) {
    if (e.deleted || e.wh !== wh) continue;
    for (const l of e.lines) {
      if (l.sku !== sku || l.voided) continue;
      const q = ecLinhaInfo(db, e, l).want;
      if (q > 0) { const d = negocioDaRef(S, e.origin.ref); out.push({ deal: d?.id, nome: d?.nome ?? e.client, q }); }
    }
  }
  return out;
}

export const aChegarDe = (db: Inventario, sku: string): number =>
  db.pos.filter((p) => !p.deleted && poOpen(p)).reduce((a, p) => a + p.lines.filter((l) => l.sku === sku).reduce((b, l) => b + poRem(l), 0), 0);

export function materialInv(S: Estado, db: Inventario, sku: string, wh = ARMAZEM_OBRAS): MaterialInv | null {
  const p = produto(db, sku), r = db.stocks.find((s) => s.sku === sku && s.wh === wh && !s.deleted);
  if (!p || !r) return null;
  const qty = qtyAt(db, sku, wh), reservado = Math.min(qty, reservadoEm(db, sku, wh));
  return {
    sku, n: p.name, cat: p.cat === "Obras" ? "Materiais das obras" : p.cat, un: p.unit, wh, qty, reservado, livre: livreEm(db, sku, wh), aChegar: aChegarDe(db, sku),
    min: r.min, rop: r.rop, loc: r.loc, baixo: estadoStock(db, r) === "low", obras: obrasDoMaterial(S, db, sku, wh),
  };
}

/** O stock do Armazém Central: os materiais das obras primeiro, depois por categoria e nome. */
export function armazemInv(S: Estado, db: Inventario): MaterialInv[] {
  const L = db.stocks.filter((s) => s.wh === ARMAZEM_OBRAS && !s.deleted).map((s) => materialInv(S, db, s.sku)).filter((x): x is MaterialInv => !!x);
  const ordem = (m: MaterialInv) => (m.cat === "Materiais das obras" ? "0" : "1" + m.cat);
  return L.sort((a, b) => ordem(a).localeCompare(ordem(b)) || a.n.localeCompare(b.n));
}

export interface CarrinhaInv { id: string; nome: string; quem: string; linhas: { sku: string; n: string; un: string; qty: number; min: number; baixo: boolean }[] }
/** As carrinhas da Frota (armazéns móveis): o que levam e o que está abaixo do mínimo (repõe-se a partir do Armazém Central). */
export function carrinhasInv(db: Inventario): CarrinhaInv[] {
  return db.warehouses.filter((w) => w.tipo === "viatura" && !w.deleted).map((w) => ({
    id: w.id, nome: w.name, quem: w.manager,
    linhas: db.stocks.filter((s) => s.wh === w.id && !s.deleted).map((s) => ({ sku: s.sku, n: produto(db, s.sku)?.name ?? s.sku, un: unidade(db, s.sku), qty: s.qty, min: s.min, baixo: s.min > 0 && s.qty < s.min })),
  }));
}

/** O que falta para a carrinha chegar ao máximo, sem tirar ao Armazém Central mais do que está livre. */
export function reposicaoCarrinha(db: Inventario, carrinha: string, sku: string): number {
  const r = db.stocks.find((s) => s.sku === sku && s.wh === carrinha && !s.deleted);
  if (!r) return 0;
  return Math.max(0, Math.min(Math.max(r.max, r.min) - r.qty, Math.floor(livreEm(db, sku, ARMAZEM_OBRAS))));
}

/** O livro de um material, em palavras: "Saiu 6 sacos para a obra de Marta Lima · qui, 9 out". Os mais recentes primeiro. */
export interface MovInv { id: number; t: string; q: string; entrada: boolean }
export type TipoLivro = "entradas" | "saidas" | "correcoes";
const TIPO_LIVRO: Record<Movimento["type"], TipoLivro> = { in: "entradas", tin: "entradas", out: "saidas", tout: "saidas", ret: "saidas", adjp: "correcoes", adjm: "correcoes", loss: "correcoes" };
/** O livro de movimentos de um material (`sku`) ou de todos (null, com o nome do material na frase), os mais recentes primeiro. */
export function movimentosInv(S: Estado, db: Inventario, sku: string | null, n = 8, tipo?: TipoLivro): MovInv[] {
  const onde = (m: Movimento): string => {
    const e = db.ecs.find((x) => x.id === m.doc);
    if (e) { const d = negocioDaRef(S, e.origin.ref); return ` para a obra de ${d?.nome ?? e.client}`; }
    if (/^PO-/.test(m.doc)) { const p = db.pos.find((x) => x.id === m.doc); return ` da encomenda a ${p ? nomeForn(db, p.sup) : m.doc}`; }
    if (/^Obra #/.test(m.doc) && m.note) return ` para a ${m.note.split(" · ")[0].replace(/^Obra/, "obra")}`;
    if (m.doc === "Saldo inicial" || m.doc === "Carga inicial") return " (abertura do inventário)";
    return m.note ? ` (${m.note})` : "";
  };
  // o verbo concorda com a quantidade: "Saiu 1 saco", "Saíram 6 sacos"
  const verbo: Record<Movimento["type"], [string, string, boolean]> = {
    in: ["Entrou", "Entraram", true], out: ["Saiu", "Saíram", false], tin: ["Chegou de outro armazém", "Chegaram de outro armazém", true], tout: ["Foi para outro armazém", "Foram para outro armazém", false],
    adjp: ["Corrigido para mais", "Corrigidos para mais", true], adjm: ["Corrigido para menos", "Corrigidos para menos", false], ret: ["Devolvido ao fornecedor", "Devolvidos ao fornecedor", false], loss: ["Partiu ou perdeu-se", "Partiram ou perderam-se", false],
  };
  return db.moves.filter((m) => (sku === null || m.sku === sku) && (!tipo || TIPO_LIVRO[m.type] === tipo)).slice(-n).reverse().map((m) => {
    const [um, varios, entrada] = verbo[m.type], v = Math.abs(m.qty) === 1 ? um : varios;
    const armazem = db.warehouses.find((w) => w.id === m.wh);
    const nome = sku === null ? ` de ${minuscula(produto(db, m.sku)?.name ?? m.sku)}` : "";
    return { id: m.id, t: `${v} ${qtd(Math.abs(m.qty), unidade(db, m.sku))}${nome}${onde(m)}${armazem?.tipo === "viatura" ? " · " + armazem.name : ""}`, q: diaRelativo(m.at), entrada };
  });
}
/** Quantos movimentos há no livro (de um tipo, ou todos). */
export const contarMovimentos = (db: Inventario, tipo?: TipoLivro): number => db.moves.filter((m) => !tipo || TIPO_LIVRO[m.type] === tipo).length;

/** O valor do stock do Armazém Central (pelo custo médio, ou o de compra se ainda não há média). */
export function valorStock(db: Inventario): number {
  return db.stocks.filter((s) => s.wh === ARMAZEM_OBRAS && !s.deleted).reduce((a, s) => { const p = produto(db, s.sku); return a + s.qty * (p?.avg || p?.cost || 0); }, 0);
}

/* ---------------------------------------------------------------- o que fazer agora */

export type AcaoInv =
  | { k: "aprovar"; po: string }
  | { k: "receber"; po: string }
  | { k: "sair"; deal: number; fase: number }
  | { k: "encomendar"; sku: string; q: number; sup: string };
export interface TarefaInv {
  id: string; t: string; sub: string; btn: string; acao: AcaoInv; urgente: boolean;
  /** A obra (o negócio) a que a tarefa diz respeito, para a ligação "Ver a obra". */
  obra?: number;
}

const resumoLinhas = (L: { n: string }[]): string => (L.length ? L[0].n + (L.length > 1 ? ` e mais ${L.length - 1}` : "") : "");

/** As tarefas do Inventário, a mais urgente primeiro: aprovar encomendas, dar entrada do que chega, dar saída para as obras, encomendar o que falta. */
export function tarefasInv(S: Estado, db: Inventario): TarefaInv[] {
  const L: (TarefaInv & { ordem: number; data: string })[] = [];
  const G = encomendasInv(S, db);
  for (const p of G.porAprovar) L.push({
    id: "aprovar-" + p.id, ordem: 1, data: p.prevista, urgente: false, obra: p.deal, acao: { k: "aprovar", po: p.id }, btn: "Aprovar e enviar",
    t: `Aprovar a encomenda a ${p.forn}`, sub: `${p.para} · ${resumoLinhas(p.linhas)} · ${eur(p.total)}`,
  });
  for (const p of G.aCaminho) L.push({
    id: "receber-" + p.id, ordem: 2, data: p.prometida ?? p.prevista, urgente: p.atrasada, obra: p.deal, acao: { k: "receber", po: p.id }, btn: "Dar entrada",
    t: `Dar entrada da encomenda de ${p.forn}`,
    sub: `${p.para} · ${resumoLinhas(p.linhas.filter((l) => l.falta > 0))} · ${p.atrasada ? `atrasada: era para ${dia(p.prometida ?? p.prevista)}` : p.prometida ? `chega ${diaRelativo(p.prometida)}` : `prevista para ${dia(p.prevista)}`}`,
  });
  for (const o of obrasInv(S, db)) {
    if (o.estado === "concluida" || o.estado === "pagamento") continue;
    for (const f of o.fases) if (f.aSair) L.push({
      id: `sair-${o.id}-${f.fase}`, ordem: o.estado === "em curso" ? 0 : 3, data: "", urgente: o.estado === "em curso", obra: o.id, acao: { k: "sair", deal: o.id, fase: f.fase },
      btn: "Dar saída para a obra", t: `Levar o material da fase ${f.fase} à obra de ${o.nome}`,
      sub: `${f.nome}${f.quando ? ` · começa ${f.quando}` : ""} · ${plural(f.aSair, "material pronto", "materiais prontos")} no armazém`,
    });
  }
  for (const m of armazemInv(S, db)) {
    if (!m.baixo || m.aChegar > 0) continue;
    const it = artigoPreferido(db, m.sku);
    if (!it) continue;
    const r = db.stocks.find((s) => s.sku === m.sku && s.wh === ARMAZEM_OBRAS)!;
    const q = Math.max(it.moq, Math.ceil((Math.max(r.max, r.rop * 2) - m.livre) / it.packN)) * it.packN;
    L.push({
      id: "encomendar-" + m.sku, ordem: 4, data: "", urgente: false, acao: { k: "encomendar", sku: m.sku, q, sup: it.sup }, btn: `Encomendar ${qtd(q, m.un)}`,
      t: `Encomendar ${m.n.toLowerCase()}`, sub: `${m.livre <= 0 ? "Não há livre" : `Só há ${qtd(m.livre, m.un)} livres`}; o mínimo é ${qtd(m.rop, m.un)} · ${nomeForn(db, it.sup)} entrega em ${plural(it.lead, "dia", "dias")}`,
    });
  }
  return L.sort((a, b) => Number(b.urgente) - Number(a.urgente) || a.ordem - b.ordem || a.data.localeCompare(b.data)).map(({ ordem: _o, data: _d, ...t }) => t);
}

/** O resumo da página: "2 encomendas por aprovar · 1 a caminho · 3 obras". */
export function resumoInv(S: Estado, db: Inventario): string {
  const G = encomendasInv(S, db), O = obrasInv(S, db).filter((o) => o.estado !== "concluida");
  const baixos = armazemInv(S, db).filter((m) => m.baixo).length;
  return [
    plural(O.length, "obra", "obras"),
    G.porAprovar.length ? plural(G.porAprovar.length, "encomenda por aprovar", "encomendas por aprovar") : "",
    G.aCaminho.length ? `${G.aCaminho.length} a caminho` : "",
    baixos ? plural(baixos, "material abaixo do mínimo", "materiais abaixo do mínimo") : "",
  ].filter(Boolean).join(" · ");
}

/** Uma linha do histórico do Inventário em palavras: os códigos dos produtos passam a nomes e as datas a "ter, 13 out". */
export function textoHistorico(db: Inventario, t: string): string {
  return t
    .replace(/(\d+) un ([A-Z][A-Z0-9]*-[A-Z0-9-]+)/g, (_x, n: string, sku: string) => (produto(db, sku) ? `${qtd(Number(n), unidade(db, sku))} de ${produto(db, sku)!.name.toLowerCase()}` : _x))
    .replace(/(\d{2})\/(\d{2})\/(\d{4})/g, (_x, d: string, m: string, a: string) => dia(`${a}-${m}-${d}`))
    .replace(/Admin Demo|Armazém Demo|Comprador Demo/g, "Nuno")
    .replace(/ → Parcialmente recebida/, " (chegou uma parte)").replace(/ → Recebida/, " (tudo recebido)").replace(/ → Encomendado/, "");
}

/** A encomenda de cliente de uma obra, no Inventário. */
export const ecDaObra = (db: Inventario, d: Negocio): Ec | undefined => (d.obra.ec?.ref ? ecDoNegocio(db, d.obra.ec.ref) : undefined);
